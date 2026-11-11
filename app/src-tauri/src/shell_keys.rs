// ---------- Keys: every hotkey, each changeable in Settings (M11 wave 4; the rules are in keymap.rs, tested) ----------

/// The chord each job uses now (keymap::encode), keymap::NONE when it has none because another app holds its keys. For
/// use a suggestion, the chord armed while a Prompt help result shows. Read without a lock, because the hotkey handler
/// reads it on every press.
static KEYS_USING: [AtomicU32; keymap::N] = [const { AtomicU32::new(keymap::NONE) }; keymap::N];
/// What the person picked (saved on this Mac in keys.json), the usual keys until they pick.
static KEYS_PICKED: Mutex<keymap::Map> = Mutex::new(keymap::Map::DEFAULT);
/// Jobs held back because their group is switched off (groups.rs, F20): their keys are let go through the key map so other
/// apps may use them, and what the person picked stays saved. Never Stop everything or the ask box.
static KEYS_HELD: [AtomicBool; keymap::N] = [const { AtomicBool::new(false) }; keymap::N];
fn key_held(a: keymap::Action) -> bool { KEYS_HELD[a.index()].load(Ordering::SeqCst) }
/// Which groups were off when they were last applied (one bit for each switch, in the catalog's order), so only a group
/// that has just been switched off stops what it was doing.
static GROUPS_OFF: AtomicU32 = AtomicU32::new(0);
/// One change or check at a time. Taken only on the main thread (the commands and arm_now run there), never while the
/// hotkey handler runs, and nothing that holds it waits for the main thread.
static KEYS_SWITCH: Mutex<()> = Mutex::new(());
/// Whether use a suggestion's keys are registered now (only while a Prompt help result shows).
static ACCEPT_ARMED: AtomicBool = AtomicBool::new(false);
/// Key repeats while the hold to talk keys are held restart nothing (talkkeys::Held).
/// M36: the Type key shares it, so only one hold uses the microphone at a time (talkkeys::Holding).
static TALK_HELD: Mutex<talkkeys::Holding> = Mutex::new(talkkeys::Holding::new());

/// F28: the jobs whose old usual keys the new usual keys took away on this Mac, said once in Settings until the person
/// has seen it (keymap::dropped_by_new_usual). Kept in keys.json with the keys.
static KEYS_DROPPED: Mutex<Vec<keymap::Action>> = Mutex::new(Vec::new());
fn keys_dropped() -> Vec<keymap::Action> { KEYS_DROPPED.lock().unwrap_or_else(|e| e.into_inner()).clone() }
fn keys_path() -> PathBuf { data_dir().join(keymap::FILE) }
fn key_using(a: keymap::Action) -> Option<keymap::Chord> { keymap::decode(KEYS_USING[a.index()].load(Ordering::SeqCst)) }
fn set_key_using(a: keymap::Action, c: Option<keymap::Chord>) { KEYS_USING[a.index()].store(c.map(keymap::encode).unwrap_or(keymap::NONE), Ordering::SeqCst); }
fn keys_using() -> keymap::Using { keymap::ACTIONS.map(key_using) }
fn keys_picked() -> keymap::Map { *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) }
/// What is registered for a job right now: use a suggestion only while a Prompt help result shows.
fn key_registered(a: keymap::Action) -> Option<keymap::Chord> { keymap::registered(a, key_using(a), ACCEPT_ARMED.load(Ordering::SeqCst)).filter(|_| !key_held(a)) }
/// Whether a job's keys stay registered once they work: not use a suggestion's outside a result, and not a job whose group is off.
fn key_keep(a: keymap::Action, armed: bool) -> bool { keymap::keep_registered_in(a, armed, key_held(a)) }
/// Every other job's keys, in use and picked: Companion's own, never offered to this job and never touched for it.
fn key_others(a: keymap::Action, picked: &keymap::Map) -> Vec<(keymap::Action, keymap::Chord)> {
    keymap::others(a, &keys_using(), picked)
}
/// Which job a shortcut the plugin reports belongs to, among the keys in use now.
fn key_action(s: &Shortcut) -> Option<keymap::Action> {
    keymap::ACTIONS.into_iter().find(|a| key_using(*a).is_some_and(|c| keymap::shortcut(c) == *s))
}
/// Whether a shortcut the plugin reports is the hold to talk chord in use right now.
fn is_talk(s: &Shortcut) -> bool { key_action(s) == Some(keymap::Action::Talk) }
/// Whether it is one of the two held chords in use now, and which: hold to talk, or the Type key (M36).
fn hold_mode(s: &Shortcut) -> Option<talkkeys::Mode> {
    if is_talk(s) { Some(talkkeys::Mode::Ask) } else if key_action(s) == Some(keymap::Action::Dictate) { Some(talkkeys::Mode::Type) } else { None }
}
/// A job held like hold to talk.
fn is_hold_job(a: keymap::Action) -> bool { matches!(a, keymap::Action::Talk | keymap::Action::Dictate) }
/// Saves what the person picked. Only one file keeps the keys: hold to talk's old one goes once the new one is written.
fn save_keys(m: &keymap::Map) -> bool {
    let _ = std::fs::create_dir_all(data_dir());
    let ok = logfile::write_atomic(&keys_path(), keymap::file_json(m, &keys_dropped()).to_string().as_bytes()).is_ok();
    if ok { let _ = std::fs::remove_file(data_dir().join(keymap::OLD_TALK_FILE)); }
    ok
}
fn let_go_logged(c: keymap::Chord, gone: bool) { if !gone { log("keys_not_let_go", json!({ "id": keymap::id(c) })); } }

/// How the keys started at launch, for the one launch notice.
struct KeysLaunch { started: [keymap::Started; keymap::N], damaged: bool }

/// At launch: every job's saved keys, else its usual ones (keymap::start). Use a suggestion's are only tried and let go
/// (they are registered while a result shows, keymap::arm). A saved file that could not be read is written back
/// repaired, so the person is told once. Main thread.
fn start_keys(app: &AppHandle) -> KeysLaunch {
    // Only a missing keys.json is nothing saved; one that cannot be read as text is damaged (keymap::saved_text).
    let saved = keymap::saved_text(std::fs::read(keys_path()));
    let old_talk = std::fs::read_to_string(data_dir().join(keymap::OLD_TALK_FILE)).ok();
    let (picked, damaged) = keymap::parse(saved.as_deref(), old_talk.as_deref());
    // F28: four jobs keep keys by usual. A Companion used before (anything of it on this Mac) keeps every key the person
    // picked; the jobs still on their old usual keys have none now, and Settings says so once.
    let used_before = saved.is_some() || old_talk.is_some() || settings::path(&data_dir()).exists();
    let dropped = keymap::dropped_by_new_usual(saved.as_deref(), used_before);
    let rewrite = !keymap::on_new_usual(saved.as_deref());
    *KEYS_DROPPED.lock().unwrap_or_else(|e| e.into_inner()) = dropped.clone();
    let gs = app.global_shortcut();
    // Use a suggestion's keys are let go again at once (keymap::keep_registered): they are taken only for a result.
    // A job whose group is switched off is tried and let go at once, like use a suggestion (groups.rs).
    let mut held = [false; keymap::N];
    for a in keymap::ACTIONS { held[a.index()] = groups::hotkey_held(&group_off, a.id()); KEYS_HELD[a.index()].store(held[a.index()], Ordering::SeqCst); }
    GROUPS_OFF.store(groups_mask(), Ordering::SeqCst);
    let started = keymap::start_held(&picked, &held,
        |_, c| gs.register(keymap::shortcut(c)).is_ok(),
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = picked;
    for a in keymap::ACTIONS { set_key_using(a, started[a.index()].using()); }
    // A damaged file is written back repaired; a file from before F28 (or none) is written once on the new usual keys,
    // with what they took away, so this happens only once.
    if damaged || rewrite { let _ = save_keys(&picked); }
    if !dropped.is_empty() { log("keys_new_usual", json!({ "dropped": dropped.iter().map(|a| a.id()).collect::<Vec<_>>() })); }
    let without: Vec<&str> = keymap::ACTIONS.iter().filter(|a| started[a.index()].using().is_none()).map(|a| a.id()).collect();
    log("keys", json!({ "changed": keymap::to_json(&picked)["keys"], "damaged": damaged, "without": without }));
    // The launch notice speaks only of jobs that are meant to work: a job whose group is off is not "taken" by anyone.
    let mut shown = started;
    for a in keymap::ACTIONS { if held[a.index()] { shown[a.index()] = started[a.index()].picked().map_or(keymap::Started::NoKeys, keymap::Started::Ready); } }
    KeysLaunch { started: shown, damaged }
}

/// Settings and the first run: the keys every job uses now (none when another app holds them) and the ones picked.
/// Registers nothing.
#[tauri::command]
fn key_map() -> Value { keys_state(&keys_using(), &keys_picked()) }
/// What the page is told about the keys, with the jobs F28 took keys from while the person has not seen that yet.
fn keys_state(using: &keymap::Using, picked: &keymap::Map) -> Value {
    let mut v = keymap::state_json(using, picked);
    v["dropped"] = json!(keys_dropped().iter().map(|a| a.id()).collect::<Vec<_>>());
    v
}

/// Settings, Keys: the person has seen the line about the jobs that no longer have keys (F28). It is not said again.
#[tauri::command]
fn keys_notice_seen(window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("not_card".into()); }
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let before = std::mem::take(&mut *KEYS_DROPPED.lock().unwrap_or_else(|e| e.into_inner()));
    if !before.is_empty() && !save_keys(&keys_picked()) { *KEYS_DROPPED.lock().unwrap_or_else(|e| e.into_inner()) = before; return Err("not_saved".into()); }
    Ok(keys_state(&keys_using(), &keys_picked()))
}

/// Settings, Change: which of one job's short list can be pressed on this Mac now. Each chord on it that no job has is
/// registered and let go again at once (keymap::free); the job's own keys are never touched. Only from the card, one
/// change or check at a time. A sync command, so it runs on the main thread.
#[tauri::command]
fn key_choices(app: AppHandle, window: tauri::WebviewWindow, action: String) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("not_card".into()); }
    let Some(a) = keymap::Action::from_id(&action) else { return Err("unknown".into()) };
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let gs = app.global_shortcut();
    let free = keymap::free(a, key_registered(a), &key_others(a, &keys_picked()),
        |c| gs.register(keymap::shortcut(c)).is_ok(),
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    Ok(keymap::choices_json(a, &free))
}

/// Settings: other keys for one job. Only from the card, only a chord on its list that no other job has. Registered at
/// once and saved on this Mac only if it works; otherwise nothing changes, so Stop everything never loses working keys.
/// The error is a code the page puts in words.
#[tauri::command]
fn set_key(app: AppHandle, window: tauri::WebviewWindow, action: String, id: String) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("not_card".into()); }
    let (Some(a), Some(wanted)) = (keymap::Action::from_id(&action), keymap::from_id(&id)) else { return Err("unknown".into()) };
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let (picked, before, was) = (keys_picked(), key_registered(a), key_using(a));
    let gs = app.global_shortcut();
    let keep = key_keep(a, ACCEPT_ARMED.load(Ordering::SeqCst));
    let r = keymap::switch(a, wanted, before, keep, &picked, &key_others(a, &picked),
        |c| gs.register(keymap::shortcut(c)).is_ok(),
        save_keys,
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    match r {
        Ok(next) => {
            *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = next;
            set_key_using(a, Some(wanted));
            // The old hold to talk keys no longer reach it, so a hold still going on them is ended here, not left open.
            if is_hold_job(a) && was != Some(wanted) { TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset(); voice_send(&app, VoiceMsg::Cancel); }
            log("key_set", json!({ "action": a.id(), "id": keymap::id(wanted) }));
            settings_told(&app, &["keys.hotkeys".to_string()]);
            Ok(keys_state(&keys_using(), &next))
        }
        Err(p) => { log("key_not_set", json!({ "action": a.id(), "id": keymap::id(wanted), "why": p.code() })); Err(p.code().into()) }
    }
}

/// Settings: every job back on its usual keys (keymap::reset). A job whose usual keys another app holds keeps what it
/// has, and the answer names it. Only from the card.
#[tauri::command]
fn reset_keys(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("not_card".into()); }
    let v = keys_to_usual(&app).map_err(str::to_string)?;
    settings_told(&app, &["keys.hotkeys".to_string()]);
    Ok(v)
}
/// Every job back on its usual keys (Settings' own Reset, and Reset this section or Reset all). Main thread.
fn keys_to_usual(app: &AppHandle) -> Result<Value, &'static str> {
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let (picked, using) = (keys_picked(), keys_using());
    let registered = keymap::ACTIONS.map(key_registered);
    let armed = ACCEPT_ARMED.load(Ordering::SeqCst);
    let gs = app.global_shortcut();
    let r = keymap::reset(&picked, &using, &registered, |a| key_keep(a, armed),
        |c| gs.register(keymap::shortcut(c)).is_ok(),
        save_keys,
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    match r {
        Ok(done) => {
            *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = done.picked;
            for a in keymap::ACTIONS { set_key_using(a, done.using[a.index()]); }
            let (talk, typing) = (keymap::Action::Talk.index(), keymap::Action::Dictate.index());
            if using[talk] != done.using[talk] || using[typing] != done.using[typing] { TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset(); voice_send(app, VoiceMsg::Cancel); }
            let kept: Vec<&str> = done.kept.iter().map(|a| a.id()).collect();
            log("keys_reset", json!({ "kept": kept }));
            let mut v = keys_state(&done.using, &done.picked);
            v["kept"] = json!(kept);
            Ok(v)
        }
        Err(p) => { log("keys_not_reset", json!({ "why": p.code() })); Err(p.code()) }
    }
}

/// Undo after a reset: each job back on the keys it had, one at a time, through the same switch as Change (the new keys
/// are registered before the old ones go, and kept only if they work). Coming back from the usual keys no two jobs can
/// want the same keys. The jobs that could not have their keys back are named. Main thread.
fn keys_restore(app: &AppHandle, wanted: &keymap::Map) -> Vec<keymap::Action> {
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let gs = app.global_shortcut();
    let mut failed = vec![];
    for a in keymap::ACTIONS {
        let (picked, want) = (keys_picked(), wanted.get(a));
        if picked.get(a) == want { continue; }
        let (before, was) = (key_registered(a), key_using(a));
        // Back to no keys (a job that had none before): let go of what it has now and save.
        let Some(want) = want else {
            let next = picked.without(a);
            if !save_keys(&next) { failed.push(a); continue; }
            if let Some(c) = before { let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()); }
            *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = next;
            set_key_using(a, None);
            if is_hold_job(a) && was.is_some() { TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset(); voice_send(app, VoiceMsg::Cancel); }
            continue;
        };
        let keep = key_keep(a, ACCEPT_ARMED.load(Ordering::SeqCst));
        match keymap::switch(a, want, before, keep, &picked, &key_others(a, &picked), |c| gs.register(keymap::shortcut(c)).is_ok(), save_keys, |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok())) {
            Ok(next) => {
                *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = next;
                set_key_using(a, Some(want));
                if is_hold_job(a) && was != Some(want) { TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset(); voice_send(app, VoiceMsg::Cancel); }
            }
            Err(_) => failed.push(a),
        }
    }
    failed
}


// ---------- The Show me key ----------

/// The Show me key started the listening that is open now (voice::show_me_key). Only trusted while the microphone is open.
static SHOWME_LISTENING: AtomicBool = AtomicBool::new(false);
/// The Show me key (finding M). With voice on and the microphone allowed it starts listening at once, the same way hold to talk
/// does (the worker checks the speech model, the permission, that Companion is not hidden, and lights the character and
/// the card before the microphone opens); a second press ends it. Otherwise it opens the question box as it always did.
/// Nothing on the screen is captured until the question is sent, under the light (showme_start).
fn show_me_key(app: &AppHandle) {
    let state = voice::ShowMeKeyState {
        setting_on: setting_now("showme.listen").as_bool().unwrap_or(true),
        voice_on: setting_now("voice.on").as_bool().unwrap_or(true),
        model_ready: voice_mac::model_ready_quick(&data_dir()),   // must fix 33: no 148 MB read on the main thread
        mic_allowed: voice_mac::mic_status() == voice_mac::Mic::Allowed,
        hidden: companion_hidden(),
        listening: listening_now(),
        started_by_key: SHOWME_LISTENING.load(Ordering::SeqCst),
    };
    let plan = voice::show_me_key(&state);
    log("showme_key", json!({ "plan": format!("{plan:?}").to_lowercase() }));
    match plan {
        voice::ShowMeKey::Box => {
            // Open the box ready for a question about the screen; nothing is captured until the question is sent.
            open_card(app, "hotkey", true);
            let _ = app.emit("showme-mode", true);
        }
        voice::ShowMeKey::Listen => {
            // The card shows the light and its line; it does not take the keyboard, so the app in front stays in front.
            open_card(app, "hotkey", false);
            let _ = app.emit("showme-mode", "listening");
            SHOWME_LISTENING.store(true, Ordering::SeqCst);
            // As hold to talk starts: nothing talks over the person, a Show me answer still playing ends.
            speech_off(app); showme_end_answer(app); let _ = app.emit("hush", ());
            voice_send(app, VoiceMsg::Down(now() as u64, talkkeys::Mode::Ask));
        }
        voice::ShowMeKey::Finish => {
            SHOWME_LISTENING.store(false, Ordering::SeqCst);
            voice_send(app, VoiceMsg::Up(now() as u64));
        }
    }
}

