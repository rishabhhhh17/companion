// ---------- F19: drop a file on the companion (convert.rs) ----------
//
// Tauri's drop events on the character's window and the island only (setup below): never a global drag watch, never a key
// event. A drop is checked here (regular files, not links, readable, of one kind), and the pages are sent a menu with the
// files' names only; the paths stay in the shell. A choice runs the Mac's own tools on a thread of its own; Stop
// everything ends it. Nothing about a file goes to the engine, Claude or the network, and the log names no file.

struct DropNow { id: u64, paths: Vec<PathBuf>, actions: Vec<&'static str>, menu: Value, job: Option<Value>, made: Vec<PathBuf>, running: Option<std::sync::Arc<convert::Job>> }
static DROP: Mutex<Option<DropNow>> = Mutex::new(None);
static DROP_SEQ: AtomicU64 = AtomicU64::new(0);
static CAPS: OnceLock<convert::Caps> = OnceLock::new();
fn drop_now_lock() -> std::sync::MutexGuard<'static, Option<DropNow>> { DROP.lock().unwrap_or_else(|e| e.into_inner()) }

/// Drop a file on the character to convert it (drop.on, usual on).
fn drop_on() -> bool { setting_now("drop.on") != json!(false) && !group_off("files.on") }
/// What this Mac's own tools can write (WebP, GIF, FLAC, the other Word formats, the video sizes, ...): asked once, the first
/// time anything is dropped, by running the tools' own help and format lists. Nothing is converted to find out.
fn mac_can() -> &'static convert::Caps { CAPS.get_or_init(convert::probe_tools) }
fn file_name(p: &std::path::Path) -> String { p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default() }

/// What a drag over one of the two windows does. Only files count: a drag of text, a link, or a picture from another app
/// (Photos, Mail, a browser) comes with no file at all, so it neither lights the character nor opens anything.
#[derive(Debug, PartialEq)]
enum DragNews { Hover(bool), Dropped(Vec<PathBuf>), Nothing }
fn drag_news(ev: &tauri::DragDropEvent, on: bool) -> DragNews {
    match ev {
        // Leaving always puts the window back, even if the setting was turned off during the drag.
        tauri::DragDropEvent::Leave => DragNews::Hover(false),
        _ if !on => DragNews::Nothing,
        tauri::DragDropEvent::Enter { paths, .. } if !paths.is_empty() => DragNews::Hover(true),
        tauri::DragDropEvent::Drop { paths, .. } if !paths.is_empty() => DragNews::Dropped(paths.clone()),
        // A drop of something that is not a file only makes sure the window is put back.
        tauri::DragDropEvent::Drop { .. } => DragNews::Hover(false),
        _ => DragNews::Nothing,
    }
}

/// A drag over, off or dropped on one of the two windows.
fn drop_event(app: &AppHandle, at: &'static str, ev: &tauri::DragDropEvent) {
    match drag_news(ev, drop_on()) {
        DragNews::Hover(over) => { let _ = app.emit_to(at, "drop-hover", json!({ "over": over })); }
        DragNews::Dropped(paths) => {
            let _ = app.emit_to(at, "drop-hover", json!({ "over": false }));
            let a = app.clone();
            std::thread::spawn(move || drop_arrived(&a, at, paths));
        }
        DragNews::Nothing => {}
    }
}

/// Puts a new drop's menu in place of the old one, unless a job is running: the running job is never let go of, so Stop
/// everything can always reach it. Checked and done under one hold of the lock. False when a job runs.
fn put_menu(now: &mut Option<DropNow>, new: DropNow) -> bool {
    if now.as_ref().is_some_and(|d| d.running.is_some()) { return false; }
    *now = Some(new);
    true
}

/// What a drop gets. One job at a time: a drop while one runs is told so and changes nothing.
fn drop_arrived(app: &AppHandle, at: &'static str, paths: Vec<PathBuf>) {
    let busy = |app: &AppHandle| { let _ = app.emit("drop-said", json!({ "why": "busy" })); };
    if drop_now_lock().as_ref().is_some_and(|d| d.running.is_some()) { busy(app); return; }
    let refused = paths.iter().take(convert::MAX_FILES).find_map(|p| convert::check_input(p).err());
    let offer = match refused {
        Some(code) => convert::Offer::Refused(code),
        None => convert::offer(&paths, mac_can(), &convert::Prefs::read(setting_now)),
    };
    let id = DROP_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    let (kind, actions, refused) = match offer { convert::Offer::Actions(k, a) => (Some(k.id()), a, None), convert::Offer::Refused(r) => (None, vec![], Some(r)) };
    let names: Vec<String> = paths.iter().take(convert::MAX_FILES).map(|p| file_name(p)).collect();
    let menu = json!({ "id": id, "names": names, "kind": kind, "actions": actions, "refused": refused, "at": at });
    let count = paths.len();
    // A job may have started while the files were checked (from Home's list): then this drop changes nothing.
    if !put_menu(&mut drop_now_lock(), DropNow { id, paths, actions, menu: menu.clone(), job: None, made: vec![], running: None }) { busy(app); return; }
    log("drop_menu", json!({ "at": at, "count": count, "kind": kind, "refused": refused }));
    let _ = app.emit("drop-menu", menu);
    // Dropped on the island: its choices are in Home, which opens below it (never taking the keyboard).
    if at == "island" { open_card(app, "drop", false); }
}

/// What the pages show when they start: the menu open now and its job, if any.
#[tauri::command]
fn drop_now() -> Value {
    drop_now_lock().as_ref().map(|d| json!({ "menu": d.menu, "job": d.job })).unwrap_or(Value::Null)
}

#[derive(serde::Deserialize)]
struct TrimIn { start: f64, end: f64 }

/// Runs one of the menu's actions on the dropped files. From the character's window or Home only. The page names the menu
/// and the action; the files are the ones the shell checked at the drop, and are checked again before each tool runs.
#[tauri::command]
fn drop_pick(app: AppHandle, window: tauri::WebviewWindow, id: u64, action: String, trim: Option<TrimIn>) -> Result<(), String> {
    if !matches!(window.label(), "dock" | "card") { return Err("notOffered".into()); }
    if action == convert::OPEN_PROJECT { return drop_open_project(&app, id); }
    let prefs = convert::Prefs::read(setting_now);
    let work = convert::work_root().join(format!("{id}-{}", now()));
    let trim = trim.map(|t| convert::Trim { start: t.start, end: t.end });
    let (units, job) = {
        let mut g = drop_now_lock();
        let d = g.as_mut().filter(|d| d.id == id).ok_or("gone")?;
        if d.running.is_some() { return Err("busy".into()); }
        if !d.actions.contains(&action.as_str()) { return Err("notOffered".into()); }
        let units = convert::plan(&action, &d.paths, &work, &prefs, trim)?;
        let job = std::sync::Arc::new(convert::Job::default());
        d.running = Some(job.clone());
        d.made.clear();
        let running = json!({ "id": id, "phase": "running", "done": 0, "of": units.len(), "percent": null });
        d.job = Some(running.clone());
        let _ = app.emit("drop-job", running);
        (units, job)
    };
    log("drop_job_started", json!({ "action": action, "count": units.len() }));
    std::thread::spawn(move || {
        let last = Mutex::new((0u128, usize::MAX));
        let tell = |done: usize, of: usize, percent: Option<f64>| {
            let mut l = last.lock().unwrap_or_else(|e| e.into_inner());
            // At most five a second, and every time a result is done.
            if l.1 == done && now() - l.0 < 200 { return; }
            *l = (now(), done);
            let v = json!({ "id": id, "phase": "running", "done": done, "of": of, "percent": percent });
            if let Some(d) = drop_now_lock().as_mut().filter(|d| d.id == id) { d.job = Some(v.clone()); }
            let _ = app.emit("drop-job", v);
        };
        let home = PathBuf::from(home_dir());
        let dest = |u: &convert::Unit| convert::dest_dir(&u.source, prefs.save_to, &home);
        let ended = convert::run(&units, &work, &dest, &job, &tell);
        // What was made is named even when the job was stopped or failed part way, so the person can find it.
        let end = convert::end_news(id, &ended);
        // Files really made: the first use of Convert a file.
        if !ended.made.is_empty() { mark_tried(&app, "convert"); }
        log("drop_job_ended", json!({ "action": action, "made": ended.made.len(), "skipped": ended.skipped, "failed": ended.failed, "ended": end["phase"], "why": end["why"] }));
        if let Some(d) = drop_now_lock().as_mut().filter(|d| d.id == id) { d.running = None; d.made = ended.made; d.job = Some(end.clone()); }
        let _ = app.emit("drop-job", end);
    });
    Ok(())
}

/// The menu's own Stop.
#[tauri::command]
fn drop_stop() { drop_stop_all(); }
/// Stop everything ends a conversion too.
fn drop_stop_all() { if let Some(j) = drop_now_lock().as_ref().and_then(|d| d.running.clone()) { j.stop(); } }
/// Companion is quitting (Quit in the menu bar, Delete everything, or macOS): a running conversion is stopped and waited
/// for, at most two seconds, so its tool is ended and its work folder removed before Companion goes.
fn drop_end_for_quit() {
    let Some(job) = drop_now_lock().as_ref().and_then(|d| d.running.clone()) else { return };
    job.stop();
    let ended = job.wait_ended(Duration::from_secs(2));
    log("drop_job_quit", json!({ "ended": ended }));
}

/// Closes the menu (never while its job runs: Stop ends it first), in every window.
/// "Fix this project" on a dropped folder (M15 wave 1): the folder becomes the project, checked exactly like one picked in
/// the folder chooser (projects::validate, inside use_project_inner), the menu closes, Home opens, and Home finds what is
/// wrong in it (the page's own Find the problem, "home-find"). Nothing is changed in the folder by this.
fn drop_open_project(app: &AppHandle, id: u64) -> Result<(), String> {
    let path = {
        let mut g = drop_now_lock();
        let d = g.as_ref().filter(|d| d.id == id).ok_or("gone")?;
        if d.running.is_some() { return Err("busy".into()); }
        if !d.actions.contains(&convert::OPEN_PROJECT) || d.paths.len() != 1 { return Err("notOffered".into()); }
        let p = d.paths[0].to_string_lossy().into_owned();
        *g = None;
        p
    };
    let _ = app.emit("drop-menu", Value::Null);
    let folder = use_project_inner(app.clone(), path)?;
    log("drop_project", json!({}));
    open_card(app, "drop_project", false);
    let _ = app.emit_to("card", "home-find", json!({ "project": folder }));
    Ok(())
}

#[tauri::command]
fn drop_close(app: AppHandle, id: u64) {
    let mut g = drop_now_lock();
    if g.as_ref().is_some_and(|d| d.id == id && d.running.is_none()) { *g = None; drop(g); let _ = app.emit("drop-menu", Value::Null); }
}

/// Shows a result in Finder: only one this menu's job made, by its number in the list.
#[tauri::command]
fn drop_reveal(id: u64, i: usize) -> Result<(), String> {
    let p = drop_now_lock().as_ref().filter(|d| d.id == id).and_then(|d| d.made.get(i).cloned()).ok_or("gone")?;
    std::process::Command::new("/usr/bin/open").arg("-R").arg(&p).env_clear().env("PATH", "/usr/bin:/bin").stdin(std::process::Stdio::null()).spawn().map(|_| ()).map_err(|_| "toolMissing".to_string())
}

/// Trim chosen on the ring: its two times are typed in Home, which opens for them (the character's window never takes the
/// keyboard).
#[tauri::command]
fn drop_trim(app: AppHandle, id: u64) {
    if !drop_now_lock().as_ref().is_some_and(|d| d.id == id && d.actions.contains(&"trim") && d.running.is_none()) { return; }
    open_card(&app, "drop", true);
    let _ = app.emit_to("card", "drop-trim", json!({ "id": id }));
}
