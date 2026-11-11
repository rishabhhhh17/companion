// ---------- Updates ----------

static PENDING_UPDATE: Mutex<Option<tauri_plugin_updater::Update>> = Mutex::new(None);

/// The version the last check found ready to install, for the island's status (island_state). Only a version number.
static UPDATE_READY: Mutex<Option<String>> = Mutex::new(None);

/// Is the updater set up in this build, and which version is running.
#[tauri::command]
fn update_status(app: AppHandle) -> Value { json!({ "configured": updates::parse_config(include_str!("../updater.json")).is_some(), "version": app.package_info().version.to_string(), "commit": logexport::BUILD_COMMIT }) }

/// Asks the update address whether a newer version exists. Only when the person asked (or turned on the daily check).
#[tauri::command]
async fn check_update(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    if settings::only_card(window.label()).is_err() { return Err("Updates can only be started from the card.".into()); }
    let cfg = updates::parse_config(include_str!("../updater.json")).ok_or("Updates are not set up in this build yet.")?;
    let url = tauri::Url::parse(&cfg.endpoint).map_err(|_| "Updates are not set up in this build yet.".to_string())?;
    let upd = app.updater_builder().pubkey(cfg.pubkey).timeout(Duration::from_secs(20)).endpoints(vec![url]).map_err(|e| updates::failure_words(&e.to_string()).to_string())?
        .build().map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    match upd.check().await {
        Ok(Some(u)) => {
            let out = json!({ "available": true, "version": u.version, "notes": u.body.clone().unwrap_or_default().chars().take(600).collect::<String>() });
            // Every window is told (Home's notice with Install, the island's status), and the island can ask when it loads.
            *UPDATE_READY.lock().unwrap_or_else(|e| e.into_inner()) = Some(u.version.clone());
            let _ = app.emit("update-ready", json!({ "version": u.version }));
            *PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(u);
            log("update_found", json!({}));
            Ok(out)
        }
        Ok(None) => {
            *PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()) = None;
            *UPDATE_READY.lock().unwrap_or_else(|e| e.into_inner()) = None;
            let _ = app.emit("update-ready", Value::Null);
            Ok(json!({ "available": false }))
        }
        Err(e) => { log("update_check_failed", json!({})); Err(updates::failure_words(&e.to_string()).to_string()) }
    }
}

/// Downloads the update found by check_update, checks its signature, installs it and restarts. Only on a press.
#[tauri::command]
async fn install_update(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if settings::only_card(window.label()).is_err() { return Err("Updates can only be started from the card.".into()); }
    // Never while something runs: the restart would cut it off. The page asks first (updates.ts installAllowed); this is
    // the backstop, before the update is taken, so it can still be installed once the task is done.
    if updates::running_now() { return Err(updates::BUSY_WORDS.into()); }
    // One install at a time (the card and Settings both have an Install). The guard lets go on every way out, errors too.
    let Some(_flight) = updates::INSTALLING.try_start() else { return Err(updates::INSTALLING_WORDS.into()) };
    // Only a copy is used: if the download fails (the Wi-Fi drops), the found update stays, so Install can be pressed again.
    let u = PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()).clone().ok_or("Check for updates first.")?;
    let bytes = u.download(|_, _| {}, || {}).await.map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    // A task may have started during a long download: the restart would cut it off, so it waits for another press.
    if updates::running_now() { return Err(updates::BUSY_WORDS.into()); }
    u.install(bytes).map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    log("update_installed", json!({}));
    // `restart` goes round the normal exit path: end the engine (and what it runs) properly first, so nothing is left running.
    // The speech models go before it (must fix 1): Tauri's restart always runs the clean up at exit, which aborted with one
    // still loaded. The quit is written down as an update's (must fix 15).
    quit::mark(quit::UPDATE);
    // Must fix 22: the exit handler must know this exit is a restart, so a quit that has to end at once still comes back.
    quit::set_restarting();
    let a = app.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || quit_now(&a, quit::UPDATE, quit::VOICE_WAIT_UPDATE)).await;
    app.state::<runner::Runner>().shut_down();
    app.restart();
}

// ---------- Screen sharing and calls (rule 7) ----------

fn presentation_path() -> PathBuf { data_dir().join("presentation.json") }
static PRESENTATION: Mutex<Option<presentation::Settings>> = Mutex::new(None);
fn presentation_now() -> presentation::Settings {
    *PRESENTATION.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(|| presentation::parse(std::fs::read_to_string(presentation_path()).ok().as_deref()))
}

/// Asks macOS to leave the overlay and the card out of other apps' screen captures, or puts back the default. Main thread.
/// Best effort (see presentation.rs). Companion's own capture leaves its own windows out by process either way.
fn apply_sharing(s: &presentation::Settings) {
    let t = objc2_app_kit::NSWindowSharingType(presentation::sharing_type(s));
    // F18: the character too, wherever it is (at home or beside a window).
    with_panels(|dock, card| { card.setSharingType(t); dock.setSharingType(t); });
    OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setSharingType(t); } });
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { p.setSharingType(t); } });
    FOLLOW.with(|f| { if let Some(p) = f.borrow().as_ref() { p.setSharingType(t); } });
}

/// Quiet during calls: a known call app is in front (and, once verified, a camera is in use, or another app uses a
/// microphone). Only the front app's id (and whether a camera or another app's microphone is on) is looked at, and only at
/// the moment something would be said or a reaction would play.
fn quiet() -> bool { presentation::quiet_with(&presentation_now(), &presentation::call_apps_from(&setting_now("calls.apps")), &front_id(), || presentation::CAMERA_CHECK_ON && presentation::mac::camera_in_use(), || presentation::MIC_CHECK_ON && presentation::mac::mic_in_use_by_another_app()) }

/// Settings: hide from screen sharing and quiet during calls (the registry's sharing.hide and calls.quiet), kept in
/// `presentation.json` in Companion's own folder as before, applied at once. Changed only through settings_set.
fn presentation_set(app: &AppHandle, s: presentation::Settings) -> Result<(), &'static str> {
    logfile::write_atomic(&presentation_path(), presentation::to_json(&s).to_string().as_bytes()).map_err(|_| "notSaved")?;
    *PRESENTATION.lock().unwrap_or_else(|e| e.into_inner()) = Some(s);
    let _ = app.run_on_main_thread(move || apply_sharing(&s));
    if s.quiet_on_calls && quiet() { speech_off(app); }
    Ok(())
}

/// For the character: should it hold back its reaction right now?
#[tauri::command]
fn quiet_now() -> bool { quiet() }

