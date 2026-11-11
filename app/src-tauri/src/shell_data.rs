// ---------- Settings, and delete everything ----------

fn key_saved() -> bool { keystore::exists(&keystore::service(), keystore::ACCOUNT) }

/// What Companion keeps on this Mac, for the settings page. Sizing a big folder can take a moment, so off the main thread.
#[tauri::command]
async fn data_inventory() -> Value {
    tauri::async_runtime::spawn_blocking(|| {
        let projects: Vec<std::path::PathBuf> = projects::load(&projects_path()).still_there().into_iter().map(std::path::PathBuf::from).collect();
        let mut v = wipe::inventory(std::path::Path::new(&home_dir()), &data_dir(), key_saved(), &projects);
        // How many practice copies Delete everything could also move to the Trash (only when the person ticks that line).
        v["practiceCopies"] = json!(practice::copies(&practice_record().0, std::path::Path::new(&home_dir())).len());
        // How many Google accounts are connected: Delete everything disconnects them too (wipe.rs, google.rs forget_all).
        v["googleAccounts"] = json!(google_index().len());
        // Pro on this Mac (wipe.rs pro_inventory): null while payments are off, so the screen is as it was.
        v["pro"] = wipe::pro_inventory(license::billing().payments_on(), || keystore::exists(&keystore::service(), license::ACCOUNT), || keystore::exists(&keystore::service(), trial::ACCOUNT));
        v
    }).await.unwrap_or(Value::Null)
}

/// The three permissions as the settings page shows them. Never prompts. The microphone says whether it was never asked,
/// turned off or blocked; Accessibility and Screen Recording can only say on or off (see permissions.rs).
#[tauri::command]
fn permission_overview() -> Value {
    let p = permissions::current();
    json!({ "accessibility": permissions::page_word(p.accessibility), "screen_recording": permissions::page_word(p.screen_recording), "microphone": permissions::page_word(p.microphone) })
}

/// Opens the right page of System Settings (opening a page changes nothing; the person decides there).
#[tauri::command]
fn open_permission_page(which: String) -> Result<(), String> {
    let pane = match which.as_str() {
        "accessibility" => "Privacy_Accessibility", "screen_recording" => "Privacy_ScreenCapture", "microphone" => "Privacy_Microphone",
        _ => return Err("unknown page".into()),
    };
    std::process::Command::new("/usr/bin/open").arg(format!("x-apple.systempreferences:com.apple.preference.security?{pane}")).status().map(|_| ()).map_err(|_| "Could not open System Settings.".to_string())
}

/// Writes a support log to Downloads (never over a file), scrubbed of project content and anything secret, and shows it in
/// Finder. Nothing is sent anywhere: the person decides whether to share it.
#[tauri::command]
async fn export_logs() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(write_support_log).await.map_err(|_| "The export stopped.".to_string())?
}

fn cmd_out(c: &str, a: &[&str]) -> String { std::process::Command::new(c).args(a).output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default() }

/// Report a problem (Settings, report.rs): saves the same support log as export_logs and shows it in Finder, then opens an
/// email draft (or the report page set in report.json) with only Companion's version and the Mac's version filled in. The
/// subject and words are the page's own (strings.ts), with {version} and {macos} filled in here. Only from Home, only on the
/// person's press. Nothing is sent: the person attaches the file and sends it themselves. Returns the saved file's name.
#[tauri::command]
async fn report_problem(window: tauri::WebviewWindow, subject: String, body: String) -> Result<String, String> {
    if settings::only_card(window.label()).is_err() { return Err(concat!("A report can only be started from ", crate::product_s!(), " own window.").into()); }
    let cfg = report::parse_config(include_str!("../report.json"));
    // The words are checked before anything is written, so a refusal leaves nothing behind.
    report::address(&cfg, &subject, &body, "0", "0")?;
    tauri::async_runtime::spawn_blocking(move || {
        let name = write_support_log()?;
        let to = report::address(&cfg, &subject, &body, env!("CARGO_PKG_VERSION"), &cmd_out("/usr/bin/sw_vers", &["-productVersion"]))?;
        let ok = std::process::Command::new("/usr/bin/open").arg(&to).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success());
        log("report_opened", json!({ "ok": ok, "page": !cfg.page.is_empty() }));
        if ok { Ok(name) } else { Err(format!("The log was saved as {name} in your Downloads folder, but no email or report page could be opened. Send the file to the person running the beta yourself.")) }
    }).await.map_err(|_| "The report stopped.".to_string())?
}

/// The support log itself (blocking): written to Downloads under a new name and shown in Finder. Returns its file name.
fn write_support_log() -> Result<String, String> {
        let (home, data) = (home_dir(), data_dir());
        let perms = permissions::current();
        let word = |k: &str| permissions::support_words(match k { "screen_recording" => perms.screen_recording, "accessibility" => perms.accessibility, _ => perms.microphone });
        let pj = projects::load(&projects_path());
        let mut projects: Vec<String> = pj.recent.clone();
        if let Some(c) = pj.current.clone() { if !projects.contains(&c) { projects.push(c); } }
        let inv = wipe::inventory(std::path::Path::new(&home), &data, key_saved(), &[]);
        let kept: Vec<(String, u64)> = inv["items"].as_array().map(|a| a.iter().map(|r| (r["label"].as_str().unwrap_or("").to_string(), r["bytes"].as_u64().unwrap_or(0))).collect()).unwrap_or_default();
        let facts = logexport::Facts {
            version: logexport::version_label(env!("CARGO_PKG_VERSION"), logexport::BUILD_COMMIT), macos: cmd_out("/usr/bin/sw_vers", &["-productVersion"]), arch: cmd_out("/usr/bin/uname", &["-m"]),
            permissions: vec![("Screen Recording".into(), word("screen_recording").into()), ("Accessibility".into(), word("accessibility").into()), ("Microphone".into(), word("microphone").into())],
            key_saved: key_saved(), speech_ready: voice_mac::model_ready(&data), browser_installed: std::fs::read_dir(std::path::Path::new(&home).join("Library/Application Support/Companion/browsers")).is_ok_and(|mut d| d.next().is_some()), kept,
        };
        let activity = [data.join("events.jsonl.1"), data.join("events.jsonl")].iter().filter_map(|p| std::fs::read_to_string(p).ok()).collect::<Vec<_>>().join("\n");
        // Must fix 15: the engine's own error output (runner/engine.log, written scrubbed by runner.rs), its last lines.
        let engine = [data.join("runner/engine.log.1"), data.join("runner/engine.log")].iter().filter_map(|p| std::fs::read_to_string(p).ok()).collect::<Vec<_>>().join("\n");
        let crash = logexport::latest_crash(&std::path::Path::new(&home).join("Library/Logs/DiagnosticReports"), std::time::SystemTime::now());
        // Words that identify the person or the machine: the user name and the computer's names.
        let mut names: Vec<String> = vec![std::env::var("USER").unwrap_or_else(|_| home.rsplit('/').next().unwrap_or("").to_string()), cmd_out("/usr/sbin/scutil", &["--get", "ComputerName"]), cmd_out("/usr/sbin/scutil", &["--get", "LocalHostName"]), cmd_out("/bin/hostname", &[])];
        names.retain(|n| !n.is_empty()); names.dedup();
        let text = logexport::compose_all(&facts, &activity, &engine, crash.as_ref().map(|(n, t)| (n.as_str(), t.as_str())), &home, &names, &projects);
        let dir = std::path::Path::new(&home).join("Downloads");
        if !dir.is_dir() { return Err("Your Downloads folder was not found.".to_string()); }
        let stamp = cmd_out("/bin/date", &["+%Y-%m-%d-%H%M"]);
        // create_new never replaces a file; if another file takes the name a moment before us, the next name is tried.
        let (mut path, mut file) = (std::path::PathBuf::new(), None);
        for attempt in 0..5 {
            path = logexport::unique_path(&dir, &if attempt == 0 { stamp.clone() } else { format!("{stamp}-{attempt}") }, |p| p.exists());
            match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) { Ok(f) => { file = Some(f); break; } Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue, Err(e) => return Err(format!("Could not save the log ({e}).")) }
        }
        let mut f = file.ok_or("Could not save the log (the name was taken).".to_string())?;
        std::io::Write::write_all(&mut f, text.as_bytes()).map_err(|e| format!("Could not save the log ({e})."))?;
        let _ = std::process::Command::new("/usr/bin/open").arg("-R").arg(&path).status();   // shows the file in Finder
        Ok(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

// ---------- the practice projects (practice.rs, app/sample/practices.json) ----------

fn practice_path() -> PathBuf { data_dir().join("practice.json") }
/// One change to the practice record at a time (a read, a change, a write).
static PRACTICE: Mutex<()> = Mutex::new(());
fn today() -> String { let d = cmd_out("/bin/date", &["+%Y-%m-%d"]); if d.len() == 10 { d } else { "1970-01-01".into() } }
/// The record as it is on disk, checked (a damaged file reads as empty, and the page says so once).
fn practice_record() -> (practice::Record, bool) {
    let (r, damaged) = practice::Record::parse(std::fs::read_to_string(practice_path()).ok().as_deref(), std::path::Path::new(&home_dir()));
    practice::keep_damaged(&practice_path(), damaged);   // a row it did not understand is kept aside before the next save drops it
    (r, damaged)
}
fn save_practice(r: &practice::Record) -> Result<(), String> {
    let _ = std::fs::create_dir_all(data_dir());
    logfile::write_atomic(&practice_path(), r.to_text().as_bytes()).map_err(|_| "Could not save your practice progress.".to_string())
}
fn practice_source(e: &practice::Entry) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|_| "Could not find the practice project.".to_string())?;
    practice::source_of(&e.folder, &exe, std::env::var("COMPANION_SAMPLE_DIR").ok().as_deref()).ok_or("The practice project is missing from this copy of the app.".to_string())
}
/// M76: a project leaving Squibby (moved to the Trash from Home or Settings) first loses the done signal hooks Squibby added
/// to it (M75), exactly as Remove does, so a folder put back from the Trash never brings one back (donehooks.rs).
fn leave_to_trash(p: &std::path::Path) -> Result<(), String> {
    let _ = donehooks::remove(p, &data_dir().join("runner"));
    move_to_trash(p)
}
/// The Mac's own Trash (NSFileManager), so a removed copy can always be put back from there. Nothing is deleted outright.
fn move_to_trash(p: &std::path::Path) -> Result<(), String> {
    use objc2_foundation::{NSFileManager, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(&p.to_string_lossy()));
    NSFileManager::defaultManager().trashItemAtURL_resultingItemURL_error(&url, None).map_err(|e| e.localizedDescription().to_string())
}
/// The folder Companion was in is gone (its practice copy went to the Trash): it leaves the recent list, and if it was the
/// project in use, Companion has no folder until the person picks one.
fn forget_folder(app: &AppHandle, folder: &std::path::Path) {
    let f = folder.to_string_lossy().to_string();
    let mut p = projects::load(&projects_path());
    p.forget(&f);
    let _ = logfile::write_atomic(&projects_path(), serde_json::to_string(&p).unwrap_or_default().as_bytes());
    let mut cur = PROJECT.lock().unwrap_or_else(|e| e.into_inner());
    // The removed project's own settings are no longer in force anywhere: the engine and the pages are told.
    if cur.as_deref() == Some(f.as_str()) { *cur = None; drop(cur); project_now(app, ""); }
}

/// A practice project (the first one unless the page names another in the catalog): copied into a new folder in the home
/// folder, named after the practice, with its house rules, recorded, then chosen as the project. Never over anything, and
/// never a second copy while the recorded one is still there (the page opens that one instead; this refuses it anyway).
#[tauri::command]
fn create_practice(window: tauri::WebviewWindow, app: AppHandle, which: Option<String>) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(which.as_deref())?;
    let src = practice_source(e)?;
    let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
    let (mut r, _) = practice_record();
    let dst = practice::create(&mut r, e, &src, std::path::Path::new(&home_dir()), &data_dir(), &today())?;
    // A copy that cannot be recorded is taken away again (it could never be listed, removed or moved).
    practice::save_or_discard(|| save_practice(&r), || { let _ = move_to_trash(&dst); })?;
    log("practice_created", json!({ "practice": e.id }));
    use_project_inner(app, dst.to_string_lossy().to_string())
}

/// The practice record for the Learn tab's list: every practice in order, its copy and the days it was started, found
/// and done. `damaged`: the file could not be read as a record, so the list starts empty (said once on the list).
#[tauri::command]
fn practice_list() -> Value {
    let (r, damaged) = practice_record();
    let mut v = r.listed();
    v["damaged"] = json!(damaged);
    v
}

/// The practice open now reached a stage ("found" or "done"). Only counts for its own recorded copy, open as the project.
#[tauri::command]
fn practice_mark(app: AppHandle, window: tauri::WebviewWindow, which: String, stage: String) -> Result<(), String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
    let (mut r, _) = practice_record();
    if !r.mark(&e.id, &stage, &today(), std::path::Path::new(&current_project())) { return Err("That practice is not the project open now.".into()); }
    let saved = save_practice(&r);
    if saved.is_ok() && stage == "done" { mark_tried(&app, "practice"); }   // a practice finished
    saved
}

/// Continue: opens a practice's recorded copy as the project (it may have left the recent list).
#[tauri::command]
fn open_practice(window: tauri::WebviewWindow, app: AppHandle, which: String) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let (r, _) = practice_record();
    let p = r.practices.get(&e.id).and_then(|p| p.path.clone()).ok_or("There is no copy of that practice yet. Press Start.".to_string())?;
    if !practice::copy_path_ok(std::path::Path::new(&p), std::path::Path::new(&home_dir())) || !std::path::Path::new(&p).is_dir() { return Err("That practice copy is not there any more. Press Start for a fresh one.".into()); }
    use_project_inner(app, p)
}

/// Start over, after the person confirmed it: the old copy goes to the Trash, a fresh copy is made in a new folder and
/// opened. `busy`: something works on the project open now (the page knows), so its copy is left alone.
#[tauri::command]
fn restart_practice(window: tauri::WebviewWindow, app: AppHandle, which: String, busy: bool) -> Result<Value, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let src = practice_source(e)?;
    let out = {
        let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
        let (mut r, _) = practice_record();
        let home = PathBuf::from(home_dir());
        let out = practice::restart(&mut r, e, &src, &home, &data_dir(), &current_project(), busy, &today(), leave_to_trash)?;
        let fresh = out.path.clone();
        practice::save_or_discard(|| save_practice(&r), || { let _ = move_to_trash(&fresh); }).map_err(|_| match &out.kept_old { None => "Could not save your practice progress. Your old copy is in the Trash, and the new one was not kept. Press Start for a fresh one.".to_string(), Some(_) => "Could not save your practice progress, so the new copy was not kept. Your old copy is still in your home folder.".to_string() })?;
        out
    };
    log("practice_restarted", json!({ "practice": e.id, "keptOld": out.kept_old.is_some() }));
    let path = use_project_inner(app.clone(), out.path.to_string_lossy().to_string())?;
    Ok(json!({ "path": path, "keptOld": out.kept_old.map(|p| p.to_string_lossy().to_string()) }))
}

/// Remove my copy, after the person confirmed it: to the Trash, and out of the recent list.
#[tauri::command]
fn remove_practice(window: tauri::WebviewWindow, app: AppHandle, which: String, busy: bool) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let moved = {
        let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
        let (mut r, _) = practice_record();
        let moved = practice::remove(&mut r, &e.id, std::path::Path::new(&home_dir()), &current_project(), busy, leave_to_trash)?;
        let _ = save_practice(&r);
        moved
    };
    log("practice_removed", json!({ "practice": e.id }));
    forget_folder(&app, &moved);
    Ok(moved.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

/// Settings: every practice copy to the Trash, after the person confirmed it. A copy something works on stays.
/// Returns how many went and the names of any that stayed.
#[tauri::command]
fn remove_all_practices(window: tauri::WebviewWindow, app: AppHandle, busy: bool) -> Result<Value, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let (moved, kept) = trash_practice_copies(&current_project(), busy);
    for p in &moved { forget_folder(&app, p); }
    log("practice_removed_all", json!({ "moved": moved.len(), "kept": kept.len() }));
    Ok(json!({ "moved": moved.len(), "kept": kept }))
}
fn trash_practice_copies(current: &str, busy: bool) -> (Vec<PathBuf>, Vec<String>) {
    let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
    let (mut r, _) = practice_record();
    let home = PathBuf::from(home_dir());
    let (mut moved, mut kept) = (vec![], vec![]);
    for (id, p) in practice::copies(&r, &home) {
        match practice::remove(&mut r, &id, &home, current, busy, leave_to_trash) { Ok(m) => moved.push(m), Err(_) => kept.push(p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()) }
    }
    let _ = save_practice(&r);
    (moved, kept)
}

static WIPING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// A question macOS itself asks, so a script in a page can never answer it. Cancel is the default button.
fn confirm_delete_natively() -> bool {
    let script = concat!(r#"display dialog "Delete everything "#, crate::product!(), r#" keeps on this Mac? This cannot be undone." buttons {"Cancel", "Delete everything"} default button "Cancel" cancel button "Cancel" with icon caution with title ""#, crate::product!(), r#"""#);
    std::process::Command::new("/usr/bin/osascript").args(["-e", script]).output().is_ok_and(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("Delete everything"))
}

/// Deletes everything Companion keeps. The work is done by a helper (this same program, started with --wipe-everything)
/// after the app has quit, so nothing is holding or rewriting the files; the helper then opens Companion again fresh.
/// The person is asked twice: on the page, and by macOS itself. `with_projects` also removes Companion's own notes inside
/// the person's recent projects. `with_pro` (payments on only): the answer to "Also turn off Pro on this Mac?".
#[tauri::command]
async fn delete_everything(app: AppHandle, confirm: String, with_projects: bool, with_practice: Option<bool>, with_pro: Option<bool>) -> Result<(), String> {
    use std::sync::atomic::Ordering::SeqCst;
    if confirm != "delete everything" { return Err("Not confirmed.".into()); }
    if WIPING.swap(true, SeqCst) { return Err("Already deleting.".into()); }
    let dialog = NativeDialog::open();
    let asked = tauri::async_runtime::spawn_blocking(confirm_delete_natively).await.unwrap_or(false);
    drop(dialog);
    if !asked { WIPING.store(false, SeqCst); return Err(String::new()); }   // cancelled: nothing happened, nothing to say
    // "Also turn off Pro on this Mac?" Yes: this Mac's activation is let go at Dodo and the Pro key deleted now, before
    // anything else is (license.rs). Without an answer from Dodo nothing at all is deleted, so the person can try again or
    // answer no; the page says so (proUnreachable). The trial's start is always kept (wipe.rs, Option 2).
    if with_pro == Some(true) && license::billing().payments_on() {
        let off = tauri::async_runtime::spawn_blocking(|| { let _one = pro_lock(); license::deactivate(license::billing(), &license::Curl, &license::Keychain::new()) }).await.unwrap_or(Err("unreachable"));
        log("pro_off_for_wipe", json!({ "ok": off.is_ok(), "why": off.as_ref().err() }));
        match off {
            Ok(()) | Err("noKey") => {}
            Err("unreachable") => { WIPING.store(false, SeqCst); return Err("proUnreachable".into()); }
            Err(_) => { WIPING.store(false, SeqCst); return Err("proKeychain".into()); }
        }
    }
    let projects: Vec<String> = if with_projects { projects::load(&projects_path()).still_there() } else { vec![] };
    let exe = std::env::current_exe().map_err(|_| { WIPING.store(false, SeqCst); "Could not start the cleanup.".to_string() })?;
    let mut helper = std::process::Command::new(exe);
    helper.arg("--wipe-everything").arg(std::process::id().to_string()).arg(if with_projects { "1" } else { "0" }).args(&projects)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    if helper.spawn().is_err() { WIPING.store(false, SeqCst); return Err("Could not start the cleanup.".into()); }
    // M74: Open when you log in goes with the settings, so a Mac with nothing kept never opens Squibby at login.
    loginitem::off();
    // Everything stops, then the app quits; the helper is waiting for that.
    showme_stop(&app);
    let _ = app.state::<runner::Runner>().stop_everything("delete everything");
    app.state::<runner::Runner>().shut_down();
    // The person ticked "Also move my practice copies to the Trash": each copy Companion made and recorded goes to the
    // Trash now that the engine has stopped (so no task, check or lesson still works in one), and before the record itself
    // is deleted with everything else by the helper, which waits for the app to quit.
    if with_practice == Some(true) { let (moved, kept) = trash_practice_copies("", false); log("practice_removed_all", json!({ "moved": moved.len(), "kept": kept.len() })); }
    // A file being converted: its tool is ended and its work folder removed before the app quits.
    let _ = tauri::async_runtime::spawn_blocking(drop_end_for_quit).await;
    // The speech models go before the exit (must fix 1), and the quit is written down as Delete everything's (must fix 15).
    quit::mark(quit::WIPE);
    let a = app.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || quit_now(&a, quit::WIPE, quit::VOICE_WAIT)).await;
    app.exit(0);
    Ok(())
}

/// The helper side: `--wipe-everything <app pid> <1 or 0 for project notes> [project folders]`. Runs before anything else
/// of the app starts. Returns true when this run was the helper.
fn wipe_helper_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    let Some(i) = args.iter().position(|a| a == "--wipe-everything") else { return false };
    let pid = args.get(i + 1).cloned().unwrap_or_default();
    let with_projects = args.get(i + 2).is_some_and(|a| a == "1");
    let projects: Vec<std::path::PathBuf> = args.iter().skip(i + 3).map(std::path::PathBuf::from).collect();
    let (home, data) = (home_dir(), data_dir());
    let (home, data) = (std::path::PathBuf::from(home), data);
    let bundle = std::env::current_exe().ok().and_then(|e| e.ancestors().find(|a| a.extension().is_some_and(|x| x == "app")).map(|p| p.to_path_buf()));
    wipe::run_helper(&home, &data, &projects, with_projects, &wipe::Helper {
        parent_gone: &|| !std::process::Command::new("/bin/kill").args(["-0", &pid]).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success()),
        delete_key: &|| { keystore::delete_item(&keystore::service(), keystore::ACCOUNT) || keystore::gone(&keystore::service(), keystore::ACCOUNT) },
        // Every Google connection (google.rs SERVICE): revoked at Google when it answers, then its Keychain items removed.
        delete_google: &|| google::forget_all(&google_index(),
            &|a| security_framework::passwords::get_generic_password(google::SERVICE, a).ok().map(|b| String::from_utf8_lossy(&b).into_owned()),
            &|t| { let _ = google::post_form(google::REVOKE_URL, &google::revoke_form(t)); },
            &|a| keystore::delete_item(google::SERVICE, a) || keystore::gone(google::SERVICE, a)),
        relaunch: &|| { if let Some(b) = &bundle { let _ = std::process::Command::new("/usr/bin/open").arg("-n").arg(b).status(); } },   // not from a built app (a development run): nothing to open
        wait: &|| std::thread::sleep(Duration::from_millis(150)),
    });
    true
}

