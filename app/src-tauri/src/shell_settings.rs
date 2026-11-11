// ---------- Settings: the registry (settings.rs, T16) ----------
//
// One list of every setting (protocol/settings.json). Pages never write a file: every change comes here (settings_set,
// settings_reset, settings_migrate, card only), is checked, is kept in its store (settings.json, or the file it always
// had: dock.json, presentation.json, keys.json, voice.json; the engine's own three through its own commands), is
// applied, and every window is told ("settings-changed"). What the engine applies from settings.json reaches it as
// settings.apply, the first line it reads after every start. The activity log names the setting, never its value.

struct SettingsNow { file: settings::File, problems: Vec<settings::Problem> }
static SETTINGS: Mutex<Option<SettingsNow>> = Mutex::new(None);
fn with_settings<R>(f: impl FnOnce(&mut SettingsNow) -> R) -> R {
    let mut g = SETTINGS.lock().unwrap_or_else(|e| e.into_inner());
    let s = g.get_or_insert_with(|| {
        let (mut file, problems) = settings::load(settings::registry(), &data_dir());
        settings_cut(&mut file, &problems);
        if !problems.is_empty() { log("settings_problems", json!({ "count": problems.len(), "damaged": problems.iter().any(|p| p.code == "damaged"), "unreadable": problems.iter().any(|p| p.code == settings::UNREADABLE) })); }
        SettingsNow { file, problems }
    });
    f(s)
}
/// F28, once on a Companion used before (settings::launch_cut): the tools the person relied on keep their old value, the
/// rest that now start off are said once in Settings. Evidence only from Companion's own files: the keys picked (keys.json)
/// and whether watch routines are set up (the engine's watch.json). Never on a settings file that could not be read.
fn settings_cut(file: &mut settings::File, problems: &[settings::Problem]) {
    if problems.iter().any(|p| p.code == settings::UNREADABLE) { return; }
    if file.migrated.iter().any(|m| m == settings::LAUNCH_CUT_MARK) { return; }
    let saved = keymap::saved_text(std::fs::read(keys_path()));
    let old_talk = std::fs::read_to_string(data_dir().join(keymap::OLD_TALK_FILE)).ok();
    let (picked, _) = keymap::parse(saved.as_deref(), old_talk.as_deref());
    let watches = std::fs::read_to_string(data_dir().join("runner").join("watch.json")).ok().is_some_and(|t| settings::has_watches(&t));
    let before = settings::UsedBefore { picked: keymap::ACTIONS.iter().filter(|a| picked.get(**a).is_some()).map(|a| a.id().to_string()).collect(), watches };
    if settings::launch_cut(file, &before) {
        let kept: Vec<&str> = settings::LAUNCH_CUT.iter().filter(|(k, _, _)| file.values.get(*k) == Some(&json!(true))).map(|(k, _, _)| *k).collect();
        log("settings_launch_cut", json!({ "kept": kept, "saved": settings::save(&data_dir(), file).is_ok() }));
    }
}
fn project_opt() -> Option<String> { let p = current_project(); (!p.is_empty()).then_some(p) }
/// The value in force of a setting kept in settings.json (the usual one when it is not set), for the shell's own readers.
fn setting_now(key: &str) -> Value {
    let project = project_opt();
    with_settings(|s| settings::value_of(settings::registry(), &s.file, key, project.as_deref())).unwrap_or(Value::Null)
}
fn settings_snapshot(changed: &[String]) -> Value {
    let project = project_opt();
    let rules = project.as_deref().filter(|p| *p != runner::NO_PROJECT).map(|p| houserules::read(std::path::Path::new(p))).unwrap_or(Ok(None));
    let w = settings::Wrapped { dock: with_prefs(|p| p.clone()), presentation: presentation_now(), keys: keys_picked(), voice: voice_now(), ph_apps: phelp::apps_value(), rules };
    with_settings(|s| settings::snapshot(settings::registry(), &s.file, project.as_deref(), &w, &s.problems, changed))
}
/// Tells every window (card, dock, overlay, island) what is in force now.
fn settings_told(app: &AppHandle, changed: &[String]) { let _ = app.emit("settings-changed", settings_snapshot(changed)); }
fn settings_line() -> String {
    let project = project_opt();
    with_settings(|s| settings::apply_line(settings::registry(), &s.file, project.as_deref(), &format!("set-{}", now())))
}
/// The engine's settings again (after a change it applies, or another project). If it is not running it is given them
/// when it starts.
fn send_settings(app: &AppHandle) { let _ = app.state::<runner::Runner>().send_line(settings_line()); }
/// Before settings.json is written: one that could not be read is read again (settings::ready_to_save). Still not
/// readable, the change is refused and nothing is saved over it; readable now, the engine is given what it holds, and
/// Ok(true) says it was read again just now (the page was shown the usual values, not the person's own).
fn settings_writable(app: &AppHandle) -> Result<bool, &'static str> {
    let again = with_settings(|s| { let r = settings::ready_to_save(settings::registry(), &data_dir(), &mut s.file, &mut s.problems); if r == Ok(true) { settings_cut(&mut s.file, &s.problems); } r })?;
    if again { log("settings_read_again", json!({})); send_settings(app); }
    Ok(again)
}

/// What the page shows and reads: every value in force, the usual ones, the project, and the problems found.
#[tauri::command]
fn settings_get() -> Value { settings_snapshot(&[]) }

/// Changes one setting. Only from the card. The error is a code the page puts in words; nothing changed then.
#[tauri::command]
fn settings_set(app: AppHandle, window: tauri::WebviewWindow, key: String, value: Value, project: Option<String>) -> Result<Value, String> {
    settings::only_card(window.label())?;
    let changed = setting_change(&app, &key, &value, project.as_deref()).map_err(|c| { log("setting_not_changed", json!({ "key": key, "why": c })); c.to_string() })?;
    log("setting_changed", json!({ "key": key }));
    settings_told(&app, &changed);
    Ok(settings_snapshot(&changed))
}

fn setting_change(app: &AppHandle, key: &str, value: &Value, asked: Option<&str>) -> Result<Vec<String>, &'static str> {
    let r = settings::registry();
    let d = r.get(key).ok_or("unknown")?;
    // A change for a project that is no longer the one in Home is refused (house rules always say theirs).
    let for_project = settings::for_project(d, asked, project_opt().as_deref())?.map(str::to_string);
    let one = vec![key.to_string()];
    match d.store.as_str() {
        "settings" => {
            settings_writable(app)?;
            // M74: Open when you log in is macOS's own login item. It is asked of macOS first; if macOS says no, the setting
            // stays as it was and the page says so (loginitem.rs).
            if key == loginitem::KEY { let (_, v) = settings::check(r, key, value)?; loginitem::set(v == json!(true))?; }
            let project = for_project.clone();
            let changed = with_settings(|s| -> Result<bool, &'static str> {
                let mut next = s.file.clone();
                let changed = settings::set(r, &mut next, key, value, project.as_deref())?;
                if changed { settings::save(&data_dir(), &next)?; s.file = next; }
                Ok(changed)
            })?;
            if !changed { return Ok(vec![]); }
            setting_applied(app, key);
            if settings::needs_apply(d) { send_settings(app); }
            Ok(one)
        }
        "dock" => {
            // A valid value, or for the position Undo's exact place after a reset (settings.rs dock_input).
            let v = settings::dock_input(d, value)?;
            // Nothing to change it on yet (no display known): said as a setting that could not be changed.
            let next = with_prefs(|p| settings::dock_with(p, key, &v)).ok_or("other")?;
            if key == "character.comeTo" { come_to_set(app, next.come_to); } else { place_set(app, next); }
            Ok(one)
        }
        "presentation" => {
            let v = settings::validate(d, value)?;
            let next = settings::presentation_with(&presentation_now(), key, &v).ok_or("unknown")?;
            presentation_set(app, next)?;
            Ok(one)
        }
        "spending" | "memory" | "metrics" => {
            let v = settings::validate(d, value)?;
            let cmd = settings::runner_command(key, &v, &current_project(), &format!("set-{}", now())).ok_or("unknown")?;
            app.state::<runner::Runner>().send(&cmd).map_err(|_| "engine")?;
            Ok(one)
        }
        // The per app answers (Prompt help and the error explainer, prompt_help.json): one operation from the editor, under
        // prompthelp.rs's rules (the built in never list cannot change; loosening a never needs the inline confirm). Only the
        // id of the app in front is read, for "Add the app in front to never read".
        "promptHelpApps" => {
            phelp::apps_change(value, &front_id())?;
            Ok(one)
        }
        // House rules: the project's own .companion/rules.txt, written only on the row's Save, every line it does not
        // understand kept exactly (houserules.rs). The engine reads the file itself before each action.
        "rules" => {
            let project = for_project.filter(|p| p != runner::NO_PROJECT).ok_or("noProject")?;
            let dir = std::path::Path::new(&project);
            let old = houserules::read(dir).map_err(|_| houserules::UNREADABLE)?;
            match houserules::change(d, old.as_deref(), value)? {
                None => Ok(vec![]),
                Some(text) => { houserules::write(dir, &text)?; Ok(one) }
            }
        }
        // Undo after a reset: the voice and the keys come back whole, exactly as the page was shown them (settings.rs).
        "voice" => {
            let next = settings::voice_from(value)?;
            voice_save(&voice_now(), &next)?;
            Ok(one)
        }
        "keys" => {
            let wanted = settings::keys_from(value)?;
            if !keys_restore(app, &wanted).is_empty() { return Err("keysTaken"); }
            Ok(one)
        }
        _ => Err("unknown"),
    }
}

/// What the shell does itself when a setting kept in settings.json changes.
fn setting_applied(app: &AppHandle, key: &str) {
    let off = |k: &str| with_settings(|s| settings::value_of(settings::registry(), &s.file, k, None)) == Some(json!(false));
    // Speak to me or Answer out loud turned off: silence at once.
    if (key == "talk.speak" || key == "talk.speakReplies") && off(key) { speech_off(app); }
    // A group was switched (F20): its keys are let go or taken again, and a group just switched off stops its tools.
    if groups::is_switch(key) { groups_applied(app); }
    // M52: reviews or Flow turned off: the engine stops watching and forgets its batches, so the dot goes out.
    if (key == "review.mode" || key == "review.modeHere" || key == "flow.on") && !review_watched() { let cleared = review_ready().clear(); review_dot_told(app, cleared); }
    // M74: Open when you log in went back to off (Restore usual, Reset all): the login item goes too.
    if key == loginitem::KEY && off(key) { loginitem::off(); }
    home_setting_applied(app, key);
}

// ---------- Groups of tools (F20, M12; the catalog and its rules are in groups.rs) ----------

/// Is this group switch (a settings key) off? Read from settings.json as every shell setting is.
fn group_off(key: &str) -> bool { setting_now(key) == json!(false) }
/// The switches that are off now, one bit each in the catalog's order.
fn groups_mask() -> u32 {
    groups::catalog().switches().iter().enumerate().fold(0u32, |m, (i, k)| if group_off(k) { m | (1 << i) } else { m })
}

/// The shell refuses a command of a tool whose group is switched off with one plain line, before it runs
/// (`invoke_handler` below asks this for every command a page sends).
fn group_refusal(command: &str) -> Option<&'static str> { groups::refuse_command(&group_off, command) }

/// A group was switched on or off, or put back by Reset. Main thread (settings commands are sync). A job of a group that
/// is off gives its keys back through the key map, the choice stays saved; switched on again, the keys are taken again
/// (the keys in use, else the picked then the usual ones, the same two tries as at launch). A group that has just been
/// switched off also stops what it was doing here: hold to talk and speech, a Prompt help or error result, a pointer on the
/// screen, a conversion. (The engine stops its own work when it is given the switch, runner/src/groups.ts.)
fn groups_applied(app: &AppHandle) {
    let (was, now) = (GROUPS_OFF.swap(groups_mask(), Ordering::SeqCst), GROUPS_OFF.load(Ordering::SeqCst));
    {
        let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
        let gs = app.global_shortcut();
        for a in keymap::ACTIONS {
            let (held_now, held_before) = (groups::hotkey_held(&group_off, a.id()), key_held(a));
            if held_now == held_before { continue; }
            if held_now {
                // Let go of what is registered for the job, then mark it held (so nothing registers it again meanwhile).
                if let Some(c) = key_registered(a) { let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()); }
                KEYS_HELD[a.index()].store(true, Ordering::SeqCst);
                if a == keymap::Action::Accept && ACCEPT_ARMED.swap(false, Ordering::SeqCst) { esc_apply(app, esc::RESULT, false); }
                log("keys_held", json!({ "action": a.id() }));
            } else {
                KEYS_HELD[a.index()].store(false, Ordering::SeqCst);
                // Use a suggestion's keys are taken only while a result shows; the others are registered now.
                if keymap::registered_on_return(a) {
                    let got = keymap::arm(a, key_using(a), &keys_picked(), |c| gs.register(keymap::shortcut(c)).is_ok());
                    set_key_using(a, got);
                    log("keys_back", json!({ "action": a.id(), "id": got.map(keymap::id) }));
                }
            }
        }
    }
    let bit = |key: &str| groups::catalog().switches().iter().position(|k| *k == key).map_or(0, |i| 1u32 << i);
    let newly_off = now & !was;
    // Talking (voice.on) and Type by voice (talk.dictate, F28): the microphone and what is being said.
    if newly_off & (bit("voice.on") | bit("talk.dictate")) != 0 {
        TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset();
        voice_send(app, VoiceMsg::Cancel);
    }
    if newly_off & bit("voice.on") != 0 { speech_off(app); }
    // The keys that read text you select (prompt.on, split from voice.on): Prompt help, the error explainer, Second Look.
    if newly_off & bit("prompt.on") != 0 { phelp::dismiss(app); errhelp::dismiss(app); }
    if newly_off & (bit("prompt.on") | bit("secondLook.on")) != 0 { seclook::dismiss(app); }
    if newly_off & bit("guide.on") != 0 { showme_stop(app); }
    if newly_off & bit("files.on") != 0 { drop_stop_all(); }
    if now != was { log("groups_applied", json!({ "off": now })); }
}

/// A real use of a tool, kept on this Mac: its id goes in the tried list (groups.tried) once. Only a tool that can be
/// tried, whose group is on, and not yet listed (groups::tried_after). Only ids are kept, never what was done.
fn mark_tried(app: &AppHandle, tool: &str) {
    let current: Vec<String> = match setting_now("groups.tried") { Value::Array(a) => a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(), _ => vec![] };
    let Some(next) = groups::tried_after(&current, tool, &group_off) else { return };
    if setting_change(app, "groups.tried", &json!(next), None).is_ok() { log("tool_tried", json!({ "tool": tool })); settings_told(app, &["groups.tried".to_string()]); }
}

/// Home says it saw a tool really used (a finished task, a Show me answer, a check that ran): the tool's id is kept as tried.
/// Only from Home, and only a tool a page can see used (the catalog's "page"); hold to talk, spoken answers, a conversion
/// and a practice are noted by the shell itself where they happen.
#[tauri::command]
fn tried_mark(app: AppHandle, window: tauri::WebviewWindow, tool: String) -> Result<(), String> {
    settings::only_card(window.label())?;
    if !groups::page_may_mark(&tool) { return Err("unknown".into()); }
    mark_tried(&app, &tool);
    Ok(())
}

/// Puts one setting, a section or everything back to its usual value, in every store. Never a protective setting in a
/// section or everything. What changes is decided from what the page was shown (settings::reset_plan), so the page names
/// each one first and keeps each one for Undo: `engine` is the engine's own settings the page has heard away from usual;
/// one it has not heard is left as it is. Only from the card.
#[tauri::command]
fn settings_reset(app: AppHandle, window: tauri::WebviewWindow, key: Option<String>, section: Option<String>, all: Option<bool>, engine: Option<Vec<String>>, project: Option<String>) -> Result<Value, String> {
    settings::only_card(window.label())?;
    // `project`: the folder the page showed this reset for; another folder in Home by now means nothing is reset.
    settings::reset_project_ok(project.as_deref(), project_opt().as_deref())?;
    let which = match (key.as_deref(), section.as_deref(), all == Some(true)) {
        (Some(k), None, false) => settings::Which::Key(k),
        (None, Some(s), false) => settings::Which::Section(s),
        (None, None, true) => settings::Which::All,
        _ => return Err("unknown".into()),
    };
    let r = settings::registry();
    // A settings.json that could not be read stays as it is (nothing in it is in force, so the reset below changes
    // nothing there). One readable again holds the person's own values, which the page was never shown, so it could
    // neither name them first nor put them back with Undo: nothing is reset, every window is told what is in force now,
    // and the page asks again.
    if let Ok(true) = settings_writable(&app) { settings_told(&app, &[]); return Err("readAgain".into()); }
    let shown = settings_snapshot(&[]);
    let (none, mut problems) = (serde_json::Map::new(), Vec::<&'static str>::new());
    let plan = settings::reset_plan(r, which, shown["values"].as_object().unwrap_or(&none), shown["usual"].as_object().unwrap_or(&none), &engine.unwrap_or_default())?;
    let project = project_opt();
    let mut changed = with_settings(|s| -> Result<Vec<String>, &'static str> {
        let mut next = s.file.clone();
        let c = settings::reset(r, &mut next, which, project.as_deref())?;
        if next != s.file { settings::save(&data_dir(), &next)?; s.file = next; }
        Ok(c)
    })?;
    for k in &changed { setting_applied(&app, k); }
    if changed.iter().any(|k| r.get(k).is_some_and(settings::needs_apply)) { send_settings(&app); }
    for d in plan.iter().filter_map(|k| r.get(k)).filter(|d| d.store != "settings") {
        let done = match d.store.as_str() {
            "dock" | "presentation" => setting_change(&app, &d.key, &d.default, None).map(|_| ()),
            // The engine's own: its command with the usual value (the engine answers with its new state).
            "spending" | "memory" | "metrics" => setting_change(&app, &d.key, &d.default, None).map(|_| ()),
            "keys" => keys_to_usual(&app).map(|_| ()),
            "voice" => voice_save(&voice_now(), &voiceset::Saved::default()),
            _ => Ok(()),
        };
        match done { Ok(()) => changed.push(d.key.clone()), Err(c) => problems.push(c) }
    }
    log("settings_reset", json!({ "which": match which { settings::Which::Key(_) => "one", settings::Which::Section(_) => "section", settings::Which::All => "all" }, "changed": changed.len(), "problems": problems }));
    settings_told(&app, &changed);
    let mut v = settings_snapshot(&changed);
    v["notReset"] = json!(problems);
    Ok(v)
}

/// The choices the pages kept before the registry, read by the card with today's meaning and sent once. Only from the card.
#[tauri::command]
fn settings_migrate(app: AppHandle, window: tauri::WebviewWindow, from: String, values: Value) -> Result<Value, String> {
    settings::only_card(window.label())?;
    let values = values.as_object().cloned().ok_or("custom")?;
    settings_writable(&app)?;
    let written = with_settings(|s| -> Result<Vec<String>, &'static str> {
        let mut next = s.file.clone();
        let w = settings::migrate(settings::registry(), &mut next, &from, &values)?;
        settings::save(&data_dir(), &next)?;
        s.file = next;
        Ok(w)
    })?;
    log("settings_migrated", json!({ "from": from, "written": written.len() }));
    // A choice carried over that the engine reads too (Your turn) reaches it at once, as any other change it applies does.
    if written.iter().any(|k| settings::registry().get(k).is_some_and(settings::needs_apply)) { send_settings(&app); }
    settings_told(&app, &written);
    Ok(settings_snapshot(&written))
}

/// Settings' "Add the app in front" (Apps that count as a call, and Apps Prompt help may read): the id and name of the app
/// in front. Home is a panel that never takes the keyboard, so the app in front is the one the person was using. Only its
/// id and name are read, never anything in it (rule 7). Companion itself is refused. Only from the card.
#[tauri::command]
fn front_app(window: tauri::WebviewWindow) -> Result<Value, String> {
    settings::only_card(window.label())?;
    let id = front_id();
    if id.is_empty() || id.starts_with("dev.companion") { return Err("ownApp".into()); }
    Ok(json!({ "id": id, "name": front() }))
}

/// The names of apps by their ids, for the lists in Settings (an app that is not on this Mac keeps its id). Names only.
/// Only from the card.
#[tauri::command]
fn app_names(window: tauri::WebviewWindow, ids: Vec<String>) -> Result<Value, String> {
    settings::only_card(window.label())?;
    let ws = NSWorkspace::sharedWorkspace();
    let mut out = serde_json::Map::new();
    for id in ids.into_iter().take(64) {
        let name = ws.URLForApplicationWithBundleIdentifier(&objc2_foundation::NSString::from_str(&id))
            .and_then(|u| u.lastPathComponent()).map(|n| n.to_string().trim_end_matches(".app").to_string()).filter(|n| !n.is_empty());
        if let Some(n) = name { out.insert(id, json!(n)); }
    }
    Ok(Value::Object(out))
}

/// A page that has just loaded asks for the status messages it missed.
#[tauri::command]
fn replay_events(app: AppHandle) -> Vec<serde_json::Value> { app.state::<runner::Runner>().replay() }

