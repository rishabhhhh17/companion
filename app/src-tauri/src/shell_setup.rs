// ---------- Anthropic's Claude, installed at first run (M22, claude_install.rs) ----------

/// Where Anthropic's Claude builds go: Squibby's own folder, one folder per version.
fn claude_root() -> PathBuf { data_dir().join("claude") }
/// What is happening with the install now (only one at a time).
static CLAUDE_STATUS: Mutex<Option<claude_install::Status>> = Mutex::new(None);

/// Whether Anthropic's Claude is ready. A development run (the engine from the developer's setup) uses the SDK package's
/// own build, so it is always ready there.
#[tauri::command]
fn claude_status(window: tauri::WebviewWindow) -> Result<Value, String> {
    if window.label() != "card" { return Err("not_card".into()); }   // only Home asks (the first run and its notice)
    if let Some(s) = CLAUDE_STATUS.lock().unwrap_or_else(|e| e.into_inner()).clone() { return Ok(s.json()); }
    let bundled = std::env::current_exe().ok().and_then(|e| runner::bundled_engine(&e)).is_some_and(|b| b.is_dir());
    let installed = claude_install::installed(&claude_root(), &claude_install::pin());
    // The engine start checks the installed build again (claude_install::cleared); one it refused is not used, and Home
    // says so calmly with Get it again. This only reads that answer, so it never waits on the check.
    if bundled && installed.as_deref().is_some_and(claude_install::refused) { return Ok(claude_install::Status::Failed(claude_install::CHANGED.into()).json()); }
    let ready = !bundled || installed.is_some();
    Ok(if ready { claude_install::Status::Ready } else { claude_install::Status::Missing }.json())
}

/// Installs Anthropic's Claude (the pinned build, checked by hash and signature) and starts the engine again so it uses it.
/// Progress and the end come as "claude-install" to every window.
#[tauri::command]
fn claude_install_now(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "card" { return Err("not_card".into()); }   // only Home asks (the first run and its notice)
    {
        let mut st = CLAUDE_STATUS.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*st, Some(claude_install::Status::Installing { .. })) { return Ok(()); }
        *st = Some(claude_install::Status::Installing { received: 0, total: None });
    }
    std::thread::spawn(move || {
        let a = app.clone();
        let tell = move |s: claude_install::Status| { *CLAUDE_STATUS.lock().unwrap_or_else(|e| e.into_inner()) = Some(s.clone()); let _ = a.emit("claude-install", s.json()); };
        let progress = { let t = tell.clone(); move |received: u64, total: Option<u64>| t(claude_install::Status::Installing { received, total }) };
        match claude_install::install(&claude_root(), &claude_install::pin(), &progress) {
            Ok(_) => { log("claude_installed", json!({ "version": claude_install::pin().version })); tell(claude_install::Status::Ready); app.state::<runner::Runner>().restart(); }
            Err(m) => { log("claude_install_failed", json!({})); tell(claude_install::Status::Failed(m)); }
        }
    });
    Ok(())
}

// ---------- Google (M21, google.rs): sign in with Google, and connect Gmail, Calendar and Drive ----------

/// The client id the founder made in Google's console (app/google.json, read when the app is built). Empty: not set up.
const GOOGLE_CONFIG: &str = include_str!("../../google.json");
/// Only one Google sign in at a time (a second press while the browser is open does nothing).
static GOOGLE_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The accounts kept, in the order they were added. The list of who is kept is its own Keychain item; each account is one
/// more item holding its refresh token (google.rs Kept). Nothing of it is ever logged.
fn google_index() -> Vec<String> {
    security_framework::passwords::get_generic_password(google::SERVICE, "index").ok()
        .and_then(|b| serde_json::from_slice::<Vec<String>>(&b).ok()).unwrap_or_default()
}
fn google_set_index(subs: &[String]) {
    let _ = security_framework::passwords::set_generic_password(google::SERVICE, "index", serde_json::to_string(subs).unwrap_or_default().as_bytes());
}
fn google_kept() -> Vec<google::Kept> {
    google_index().iter().filter_map(|sub| security_framework::passwords::get_generic_password(google::SERVICE, &google::keychain_account(sub)).ok())
        .filter_map(|b| google::kept_from(&String::from_utf8_lossy(&b))).collect()
}
fn google_keep(k: &google::Kept) -> Result<(), String> {
    security_framework::passwords::set_generic_password(google::SERVICE, &google::keychain_account(&k.person.sub), google::kept_json(k).as_bytes())
        .map_err(|_| "Could not keep the Google account in the Keychain.".to_string())?;
    let mut idx = google_index();
    if !idx.contains(&k.person.sub) { idx.push(k.person.sub.clone()); google_set_index(&idx); }
    Ok(())
}
fn google_forget(sub: &str) {
    let _ = keystore::delete_item(google::SERVICE, &google::keychain_account(sub));
    let idx: Vec<String> = google_index().into_iter().filter(|s| s != sub).collect();
    google_set_index(&idx);
}

/// What the pages may know: whether Google is set up in this build, and each account without its tokens.
#[tauri::command]
fn google_accounts(window: tauri::WebviewWindow) -> Result<Value, String> {
    settings::only_card(window.label()).map_err(|e| e.to_string())?;
    Ok(json!({ "ready": google::client(GOOGLE_CONFIG).is_some(), "busy": GOOGLE_BUSY.load(std::sync::atomic::Ordering::SeqCst), "accounts": google_kept().iter().map(google::shown).collect::<Vec<_>>() }))
}

/// Sign in with Google (`signin`) or connect a Google account for some apps. Opens Google's own page in the person's
/// browser and returns at once; the result comes as "google-changed" to every window (or "google-failed" with plain words).
#[tauri::command]
fn google_start(app: AppHandle, window: tauri::WebviewWindow, signin: bool, apps: Vec<String>, label: Option<String>) -> Result<(), String> {
    settings::only_card(window.label()).map_err(|e| e.to_string())?;
    let Some((id, secret)) = google::client(GOOGLE_CONFIG) else { return Err("notSetUp".into()) };
    let apps: Vec<google::App> = apps.iter().filter_map(|a| google::App::from_word(a)).collect();
    if !signin && apps.is_empty() { return Err("noApps".into()); }
    if GOOGLE_BUSY.swap(true, std::sync::atomic::Ordering::SeqCst) { return Err("busy".into()); }
    std::thread::spawn(move || {
        let r = google_flow(&id, &secret, signin, &apps, label.as_deref().unwrap_or(""));
        GOOGLE_BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
        match r {
            Ok(()) => { log("google_connected", json!({ "signin": signin, "apps": apps.iter().map(|a| a.word()).collect::<Vec<_>>() })); let _ = app.emit("google-changed", ()); google_push(&app); }
            Err(m) => { log("google_failed", json!({})); let _ = app.emit("google-failed", m); }
        }
    });
    Ok(())
}

/// The sign in itself (google.rs): a one time listener on 127.0.0.1, Google's page in the browser, the code traded for
/// tokens, and the account kept. Apps already connected on the same account stay; a new label replaces the old one.
fn google_flow(id: &str, secret: &str, signin: bool, apps: &[google::App], label: &str) -> Result<(), String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|_| "Could not start the sign in.".to_string())?;
    let port = listener.local_addr().map_err(|_| "Could not start the sign in.".to_string())?.port();
    let (verifier, challenge) = google::pkce(google::random32());
    let state = google::b64url(&google::random32());
    let url = google::auth_url(id, port, &google::scopes_for(apps), &challenge, &state, None);
    std::process::Command::new("/usr/bin/open").arg(&url).spawn().map_err(|_| "Could not open the browser.".to_string())?;
    let code = google::wait_for_code(listener, &state, crate::product!())?;
    let t = google::read_tokens(&google::post_form(google::TOKEN_URL, &google::exchange_form(id, secret, &code, &verifier, port))?)?;
    let person = t.person.ok_or("Google did not say who signed in (the email must be verified).")?;
    let old = google_kept().into_iter().find(|k| k.person.sub == person.sub);
    let refresh = t.refresh.or_else(|| old.as_ref().map(|k| k.refresh.clone())).ok_or("Google gave no lasting sign in. Try again.")?;
    let mut granted = google::apps_granted(&t.granted);
    if let Some(o) = &old { for a in &o.apps { if !granted.contains(a) { granted.push(*a); } } }
    let label = if label.trim().is_empty() { old.as_ref().map(|k| k.label.clone()).unwrap_or_else(|| google::label_for("", &person.email)) } else { google::label_for(label, &person.email) };
    let keep_signin = signin || old.as_ref().is_some_and(|k| k.signin);
    // Only one account is the one signed in to Squibby: signing in with another moves it.
    if signin { for mut k in google_kept().into_iter().filter(|k| k.signin && k.person.sub != person.sub) { k.signin = false; let _ = google_keep(&k); } }
    google_keep(&google::Kept { person, refresh, label, apps: granted, signin: keep_signin })
}

/// Disconnect one account: Google is asked to revoke it, and its Keychain item goes. `signOutOnly`: the account signed in
/// to Squibby stops being that, but stays connected for its apps when it has any.
#[tauri::command]
fn google_disconnect(app: AppHandle, window: tauri::WebviewWindow, id: String, sign_out_only: Option<bool>) -> Result<(), String> {
    settings::only_card(window.label()).map_err(|e| e.to_string())?;
    let sub = id.strip_prefix("google:").unwrap_or(&id).to_string();
    let Some(mut k) = google_kept().into_iter().find(|k| k.person.sub == sub) else { return Err("gone".into()) };
    if sign_out_only == Some(true) && !k.apps.is_empty() { k.signin = false; google_keep(&k)?; }
    else {
        let token = k.refresh.clone();
        std::thread::spawn(move || { let _ = google::post_form(google::REVOKE_URL, &google::revoke_form(&token)); });
        google_forget(&sub);
    }
    log("google_disconnected", json!({}));
    let _ = app.emit("google-changed", ());
    google_push(&app);
    Ok(())
}

/// Gives the engine a fresh access token for every connected account (never the refresh token), so the Google tools work
/// on the person's request. Runs now and again before the tokens run out (google_refresh_loop).
fn google_push(app: &AppHandle) {
    let a = app.clone();
    std::thread::spawn(move || {
        let Some((id, secret)) = google::client(GOOGLE_CONFIG) else { return };
        let mut out = Vec::new();
        for k in google_kept().into_iter().filter(|k| !k.apps.is_empty()) {
            let Ok(body) = google::post_form(google::TOKEN_URL, &google::refresh_form(&id, &secret, &k.refresh)) else { continue };
            let Ok(t) = google::read_tokens(&body) else { continue };
            out.push(json!({ "label": k.label, "email": k.person.email, "apps": k.apps.iter().map(|x| x.word()).collect::<Vec<_>>(), "token": t.access, "expiresInSecs": t.expires_in }));
        }
        if let Some(r) = a.try_state::<runner::Runner>() { let _ = r.send(&json!({ "v": 1, "id": format!("google-{}", now()), "type": "google.accounts", "accounts": out })); }
    });
}

/// Saves the person's own key into the Keychain. The page clears its box right after; nothing here is ever logged.
#[tauri::command]
fn save_api_key(app: AppHandle, key: String) -> Result<(), String> {
    keystore::save(&key, &data_dir())?;
    log("api_key_saved", json!({}));
    hand_key_over(&app, Some(&key));
    Ok(())
}

/// Gives the engine the key on its own pipe (never logged, never shown to a page). With None it reads the Keychain first,
/// which for a key saved by an older version also moves it to this app's own trust; that can show the Mac's one "allow?"
/// dialog, so it runs off the thread that reads the engine's output.
fn hand_key_over(app: &AppHandle, key: Option<&str>) {
    let (a, key) = (app.clone(), key.map(str::to_string));
    // A key the person just saved is checked once with Anthropic (free); one read from the Keychain is not.
    let fresh = key.is_some();
    std::thread::spawn(move || {
        let key = key.or_else(|| { let moved = keystore::move_old_item(&data_dir()); log("key_move", json!({ "moved": moved })); keystore::read() });
        let _ = a.state::<runner::Runner>().hand_key(key.as_deref(), fresh);
    });
}

/// Settings: removes the person's key from the Keychain, after the page asked them first, and tells the engine at once
/// that it has no key, so a removed key stops being used. Only from the card, only with the exact words.
#[tauri::command]
fn remove_api_key(app: AppHandle, window: tauri::WebviewWindow, confirm: String) -> Result<(), String> {
    let svc = keystore::service();
    // The tested gate: an unconfirmed call never reaches the Keychain, and the key counts as gone only once it is not there.
    keystore::remove_with(window.label(), &confirm, || keystore::delete_item(&svc, keystore::ACCOUNT), || !keystore::gone(&svc, keystore::ACCOUNT))?;
    log("api_key_removed", json!({}));
    // If the engine is not running now, it is told the same when it starts again: it reads the Keychain, which is empty.
    let _ = app.state::<runner::Runner>().hand_key(None, false);
    Ok(())
}

/// Opens the Mac's own folder chooser (another process, so the keyboard is never taken), then uses the folder.
#[tauri::command]
async fn pick_project(app: AppHandle) -> Result<String, String> {
    let _dialog = NativeDialog::open();
    let chosen = tauri::async_runtime::spawn_blocking(projects::choose_folder).await.map_err(|_| "The folder chooser stopped.".to_string())?;
    match chosen { Some(path) => use_project_inner(app, path), None => Err(String::new()) }
}

/// Open a project from a link: the person picks where it goes, then the runner copies it into a new folder there.
#[tauri::command]
async fn clone_project(app: AppHandle, url: String) -> Result<(), String> {
    let url = url.trim().to_string();
    if !url.starts_with("https://") { return Err("Paste the project's link; it starts with https://".into()); }
    let dialog = NativeDialog::open();
    let chosen = tauri::async_runtime::spawn_blocking(projects::choose_parent).await.map_err(|_| "The folder chooser stopped.".to_string())?;
    drop(dialog);
    let Some(parent) = chosen else { return Err(String::new()) };
    let parent = projects::validate_parent(&parent, &home_dir(), &data_dir())?;
    let cmd = json!({ "v": 1, "id": format!("clone{}", now()), "type": "project.clone", "url": url, "parent": parent.to_string_lossy() });
    app.state::<runner::Runner>().send(&cmd).map_err(|_| runner::NOT_READY.to_string())
}

/// One new folder at a time (two presses at once never race for the same name).
static NEW_FOLDER: Mutex<()> = Mutex::new(());
/// Make something with no project open (F23, M14 Part 1; newfolder.rs): Home's ask box sends project.new on the person's
/// press. A new empty folder is made for it, named after the request, in the place Settings names (make.folder), chosen as
/// the project, and the engine is sent an ordinary drive.plan or research.ask for it, checked like one from a page. Nothing
/// is made when that tool is switched off. Returns the new folder.
#[tauri::command]
fn start_in_new_folder(window: tauri::WebviewWindow, app: AppHandle, cmd: Value) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let req = newfolder::check(&cmd)?;
    // A tool whose group is switched off does nothing, and no folder is made for it (groups.rs).
    if let Some(line) = groups::refuse_runner(&group_off, &newfolder::task_command(&req, "")) { return Err(line.into()); }
    let made = {
        let _g = NEW_FOLDER.lock().unwrap_or_else(|x| x.into_inner());
        let (home, data) = (PathBuf::from(home_dir()), data_dir());
        let mut known = projects::load(&projects_path()).recent;
        known.push(current_project());
        let name = newfolder::folder_name(&req.request, req.kind, req.off);
        newfolder::make(&home, setting_now("make.folder").as_str().unwrap_or(""), &name, &data, &known, practice::taken(&data))?
    };
    log("new_folder_made", json!({ "kind": req.kind.as_str() }));
    let folder = use_project_inner(app.clone(), made.to_string_lossy().to_string())?;
    let task = newfolder::task_command(&req, &folder);
    runner::check_command(&task)?;
    runner::check_project(&task, &current_project())?;
    app.state::<runner::Runner>().send(&task).map_err(|_| concat!("Your new folder is made and open, but ", crate::product!(), " is not ready yet. Press the button again in a moment.").to_string())?;
    Ok(folder)
}

// ---------- What Squibby made (M14, made.rs): list, open, show in Finder, move to the Trash ----------

/// The folder for all of them (newfolder.rs), worked out from the setting every time and never taken from a page, with the real
/// home folder it is under. The folder may not exist yet.
fn made_parent() -> Result<(PathBuf, PathBuf), String> {
    newfolder::parent_of(std::path::Path::new(&home_dir()), setting_now("make.folder").as_str().unwrap_or(""))
}
/// What Squibby made, newest first: names, dates and rough sizes only, never what is in a file. `busy`: the page knows a task
/// works or waits; the shell knows too (updates::running_now), and either one makes every folder wait. Counted off the main
/// thread, since a big folder takes a moment.
#[tauri::command]
async fn list_made(window: tauri::WebviewWindow, busy: bool) -> Result<Value, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let (home, parent) = made_parent()?;
    let (current, busy) = (current_project(), busy || updates::running_now());
    tauri::async_runtime::spawn_blocking(move || {
        let l = made::list(&parent, &current, busy)?;
        Ok(json!({ "where": made::where_words(&home, &parent), "busy": busy, "folders": l.rows.iter().map(made::Row::to_json).collect::<Vec<_>>(), "more": l.more }))
    }).await.map_err(|_| "The list could not be read.".to_string())?
}
/// Open as project: a folder from the list becomes the project (checked like any folder: projects::validate).
#[tauri::command]
fn open_made(window: tauri::WebviewWindow, app: AppHandle, name: String, busy: bool) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let (_, parent) = made_parent()?;
    let path = made::open_path(&parent, &name, busy || updates::running_now())?;
    use_project_inner(app, path.to_string_lossy().to_string())
}
/// Show in Finder: a folder from the list, selected in its place.
#[tauri::command]
fn reveal_made(window: tauri::WebviewWindow, name: String) -> Result<(), String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let (_, parent) = made_parent()?;
    let path = made::open_path(&parent, &name, false)?;
    std::process::Command::new("/usr/bin/open").arg("-R").arg(&path).env_clear().env("PATH", "/usr/bin:/bin").stdin(std::process::Stdio::null()).spawn().map(|_| ()).map_err(|_| "Finder could not be opened.".to_string())
}
/// Move to the Trash, after the person confirmed it (`git`: and, for a folder with git history, confirmed that too). Only a
/// folder from the list, never the project open now, never while a task works or waits (made::trash). The Mac's own Trash, so
/// it can be put back; nothing is deleted. Then it leaves the recent folders. Its undo points stay in Companion's own folder.
#[tauri::command]
fn trash_made(window: tauri::WebviewWindow, app: AppHandle, name: String, git: bool, busy: bool) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let moved = {
        let _g = NEW_FOLDER.lock().unwrap_or_else(|x| x.into_inner());   // never while a new folder is being made
        let (_, parent) = made_parent()?;
        made::trash(&parent, &name, &current_project(), busy || updates::running_now(), git, leave_to_trash)?
    };
    log("made_trashed", json!({ "git": git }));
    forget_folder(&app, &moved);
    Ok(name)
}

/// The Memory tab's shared files row (M14, sharedfiles.rs): is the project open now a folder Squibby made, and what is the state
/// of AGENTS.md and CLAUDE.md in it? The folder for all of them and the project both come from here, never from the page.
#[tauri::command]
fn shared_files_state(window: tauri::WebviewWindow) -> Result<Value, String> {
    settings::only_card(window.label())?;   // only Home
    let (_, parent) = made_parent()?;
    Ok(sharedfiles::shared_files(&parent, &current_project()).to_json())
}

#[tauri::command]
fn close_card(app: AppHandle) {
    card_closed_hush(&app);   // closing the card silences it (home_closed gives back the keys Prompt help borrowed)
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        close_home_rolled(&a, json!({ "app_active": active(mtm) }));
    });
}

