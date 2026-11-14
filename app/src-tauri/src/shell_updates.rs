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

// ---------- M89: install while the person is away ----------

/// When the twice a second tick (on the main thread, where it can also ask whether Squibby is speaking) last found every
/// quiet condition true, in ms since 1970; 0 for never. A quiet install must have been seen this way within QUIET_FRESH_MS.
static QUIET_SEEN_AT: AtomicU64 = AtomicU64::new(0);
/// When the page was last asked to install quietly (ms), so it is asked at most once every QUIET_ASK_EVERY_MS.
static QUIET_ASKED_AT: AtomicU64 = AtomicU64::new(0);
/// Ticks since the last look (the tick is twice a second; the look is every QUIET_LOOK_SECS).
static QUIET_TICKS: AtomicU64 = AtomicU64::new(0);
const QUIET_FRESH_MS: u64 = 90_000;
const QUIET_ASK_EVERY_MS: u64 = 10 * 60_000;
/// Where the note for after the restart is kept (the version only), in Companion's own folder.
fn update_note_path() -> PathBuf { data_dir().join("update-note.json") }

/// What the quiet install looks at now (updates.rs Quiet). `speaking`: only the main thread can ask, so others pass false
/// and rely on the tick's own look (QUIET_SEEN_AT).
fn quiet_state(speaking: bool) -> updates::Quiet {
    updates::Quiet {
        setting_on: setting_now("updates.quiet") != json!(false),
        found: PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()).is_some(),
        idle_secs: updates::idle_seconds(),
        busy: updates::running_now(),
        call: quiet(),
        capture: showme_pending().active() || overlay_busy(),
        listening: listening_now() || SHOWME_LISTENING.load(Ordering::SeqCst) || speaking,
        installing: updates::INSTALLING.busy(),
    }
}

/// Called from the tick (main thread). Every QUIET_LOOK_SECS: when an update is found and every quiet condition holds, the
/// card page is asked (update-quiet-ready) to check what only it knows and then install with quiet: true. Nothing is read
/// but times and yes or no.
fn quiet_update_tick(app: &AppHandle) {
    if !QUIET_TICKS.fetch_add(1, Ordering::SeqCst).is_multiple_of(updates::QUIET_LOOK_SECS * 2) { return; }
    let st = quiet_state(speak::mac::speaking());
    if !updates::quiet_install_ok(&st) { return; }
    let t = now() as u64;
    QUIET_SEEN_AT.store(t, Ordering::SeqCst);
    if t.saturating_sub(QUIET_ASKED_AT.load(Ordering::SeqCst)) < QUIET_ASK_EVERY_MS { return; }
    QUIET_ASKED_AT.store(t, Ordering::SeqCst);
    log("update_quiet_ready", json!({}));
    let _ = app.emit_to("card", "update-quiet-ready", json!({}));
}

/// After a restart: the note a quiet install left (the version), once. It is removed as it is read.
#[tauri::command]
fn update_note_take(window: tauri::WebviewWindow) -> Value {
    if settings::only_card(window.label()).is_err() { return Value::Null; }
    let p = update_note_path();
    let text = std::fs::read_to_string(&p).ok();
    let _ = std::fs::remove_file(&p);
    updates::note_for_page(text.as_deref(), now() as u64)
}

/// Downloads the update found by check_update, checks its signature, installs it and restarts. On a press, or (M89, quiet:
/// true) when the card page agreed after the shell's quiet moment: then every quiet condition is checked again here, before
/// anything is taken and again before it installs, and a note is left for after the restart.
#[tauri::command]
async fn install_update(app: AppHandle, window: tauri::WebviewWindow, quiet: Option<bool>) -> Result<(), String> {
    if settings::only_card(window.label()).is_err() { return Err("Updates can only be started from the card.".into()); }
    let quietly = quiet == Some(true);
    let still_quiet = || updates::quiet_install_ok(&quiet_state(false)) && (now() as u64).saturating_sub(QUIET_SEEN_AT.load(Ordering::SeqCst)) <= QUIET_FRESH_MS;
    if quietly && !still_quiet() { return Err(updates::NOT_QUIET_WORDS.into()); }
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
    // M89: a quiet install that is no longer quiet (the person came back during the download) waits for the next time.
    if quietly && !(updates::quiet_install_ok(&updates::Quiet { installing: false, ..quiet_state(false) })) { return Err(updates::NOT_QUIET_WORDS.into()); }
    u.install(bytes).map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    log("update_installed", json!({ "quiet": quietly }));
    // M89: the visible note after the restart (Home's notice, update_note_take). The version only.
    if quietly { let _ = logfile::write_atomic(&update_note_path(), updates::note_json(&u.version).to_string().as_bytes()); }
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

