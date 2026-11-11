// ---------- Hold to talk ----------

/// Hidden: Companion was just hidden (a full screen app came forward, or Hide from the menu bar). It only wakes the worker,
/// which then closes an open microphone at once instead of at its next one second check.
/// Down carries what the hold is for (M36): talking to Squibby, or typing into the app in front.
/// Quit (must fix 1): the app is quitting; both speech models are let go, and the answer says whether none is left loaded.
enum VoiceMsg { Down(u64, talkkeys::Mode), Up(u64), Cancel, Hidden, Quit(std::sync::mpsc::Sender<bool>) }
const LISTENING: &str = "Listening. Let go of the keys when you are done.";
/// Hold to talk is listening: from just before the light comes on until the microphone is closed (let go, Stop everything,
/// the cap running out, Companion being hidden, or a microphone that would not start). Nothing is said meanwhile (`speak`).
static LISTENING_NOW: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
fn listening_now() -> bool { LISTENING_NOW.load(std::sync::atomic::Ordering::SeqCst) }
/// Turning on, the ring is woken by the voice worker only once the light is lit (rule 5: the listening ring follows the
/// light and never replaces it); turning off wakes it at once, so the ring goes with the microphone.
fn listening(on: bool) { LISTENING_NOW.store(on, std::sync::atomic::Ordering::SeqCst); if !on { follow_wake(); } }
static VOICE_TX: Mutex<Option<std::sync::mpsc::Sender<VoiceMsg>>> = Mutex::new(None);
/// How many times Stop everything was pressed. Bumped before its Cancel is queued, so the worker sees a Stop that came while
/// it was busy: the microphone never opens after one, and words heard before one are dropped (rule 11).
static VOICE_STOPS: AtomicU64 = AtomicU64::new(0);
/// M36: how many holds began, so a Type key result line ("Typed into Notes.") is cleared a few seconds later only if no
/// new hold has started since.
static VOICE_HOLDS: AtomicU64 = AtomicU64::new(0);
/// A Type key result: in Home's line and as a word at the pointer, then cleared after a few seconds.
fn say_typed(app: &AppHandle, stage: &'static str, line: &str, extra: Value) {
    say_voice(app, stage, line, extra);
    if let Some(w) = dictate::pointer_word(stage) { follow_say(app.clone(), w.to_string()); }
    let (a, holds) = (app.clone(), VOICE_HOLDS.load(Ordering::SeqCst));
    std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(4)); if VOICE_HOLDS.load(Ordering::SeqCst) == holds && !listening_now() { say_voice(&a, "idle", "", json!({})); } });
}

fn say_voice(app: &AppHandle, stage: &str, message: &str, extra: Value) {
    let mut v = json!({ "v": 1, "id": format!("vo{}", now()), "type": "app.voice", "stage": stage, "message": message });
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) { for (k, x) in e { o.insert(k.clone(), x.clone()); } }
    runner::Runner::publish(app, v);
}

/// The app is quitting (must fix 1): no hold to talk worker starts again.
static VOICE_CLOSED: AtomicBool = AtomicBool::new(false);
fn voice_send(app: &AppHandle, m: VoiceMsg) {
    if VOICE_CLOSED.load(Ordering::SeqCst) { return; }
    let mut g = VOICE_TX.lock().unwrap_or_else(|e| e.into_inner());
    if g.is_none() {
        let (tx, rx) = std::sync::mpsc::channel::<VoiceMsg>();
        *g = Some(tx);
        let a = app.clone();
        std::thread::spawn(move || voice_worker(a, rx));
    }
    if let Some(tx) = g.as_ref() { let _ = tx.send(m); }
}
/// Companion is hidden: a full screen app is in front, or the person hid it from the menu bar. The light (the character)
/// cannot be seen, so the microphone is never open (rule 5).
fn companion_hidden() -> bool { HIDDEN_BY_US.load(Ordering::SeqCst) || USER_HID.load(Ordering::SeqCst) }
/// Nothing of Companion can be seen: it is hidden and Home is closed too (a hotkey can open Home while it is hidden, and
/// then Home's own line is the light). Show me and Point at the problem never look then (rule 5). Any thread.
fn light_unseen() -> bool { companion_hidden() && !HOME_OPEN.load(Ordering::SeqCst) }
/// Companion was just hidden (a full screen app came forward, or Hide in the menu bar): every pointer goes, so no ring stays
/// drawn over what the person chose not to share, and no your turn watch keeps reading the mouse to start the next step's
/// look with nothing of Companion showing. The page is told only when something was up.
fn pointers_gone_hidden(app: &AppHandle) {
    let up = overlay_busy() || TURN.lock().unwrap_or_else(|e| e.into_inner()).is_some();
    let seen = showme_pending().end();
    point_cancel(); hide_overlay(app);
    if up || seen { log("pointers_gone_hidden", json!({})); say_showme(app, "done", "", json!({})); }
}
/// Hide or show Companion (the menu bar icon): the character, the island and Home. Main thread.
fn set_user_hidden(app: &AppHandle, hide: bool) {
    USER_HID.store(hide, Ordering::SeqCst);
    // M66: Home's window comes back with the character, closed (its shape under the notch, the pointer passing through).
    with_panels(|d, c| if hide { d.orderOut(None); c.orderOut(None); } else if !HIDDEN_BY_US.load(Ordering::SeqCst) { d.orderFrontRegardless(); c.orderFrontRegardless(); });
    island_show(!hide && !HIDDEN_BY_US.load(Ordering::SeqCst));
    if hide { home_stop_now("hidden"); voice_tell_hidden(); pointers_gone_hidden(app); }
    // Hidden counts as rest for the eyes' and the ring's threads (M46).
    gaze_recompute(); follow_wake();
    log("menu_hide", json!({ "hidden": hide }));
}
/// Must fix 1: the app is quitting. The hold to talk worker lets both speech models go (the one in use and the one loaded
/// ahead) and answers. True when no model is left loaded: none was ever started, or the worker answered that it let both
/// go and none is still loading. False when it did not answer within `wait` (it is still turning speech into words).
fn voice_quit(wait: Duration) -> bool {
    VOICE_CLOSED.store(true, Ordering::SeqCst);
    let Some(tx) = VOICE_TX.lock().unwrap_or_else(|e| e.into_inner()).take() else { return true };
    let (ack, answer) = std::sync::mpsc::channel::<bool>();
    if tx.send(VoiceMsg::Quit(ack)).is_err() { return true; }   // the worker already ended, and its models with it
    answer.recv_timeout(wait).unwrap_or(false)
}
/// Must fixes 1 and 15: a quit's steps (quit.rs), once, from wherever the quit began. Blocks for up to `wait`.
fn quit_now(app: &AppHandle, from: &'static str, wait: Duration) {
    if !quit::first() { return; }
    if quit::exit_steps(from, || voice_quit(wait), drop_end_for_quit, || app.state::<runner::Runner>().shut_down(), &mut |e, x| log(e, x)) { quit::set_hard(); }
}
/// Companion was just hidden: wake the hold to talk worker if it is running, so a microphone that is open closes at once.
/// A worker that was never started has nothing open, so none is started here.
fn voice_tell_hidden() {
    if let Some(tx) = VOICE_TX.lock().unwrap_or_else(|e| e.into_inner()).as_ref() { let _ = tx.send(VoiceMsg::Hidden); }
}

/// One thread handles the key going down and up in order, so the microphone can never be left open or opened late.
fn voice_worker(app: AppHandle, rx: std::sync::mpsc::Receiver<VoiceMsg>) {
    let mut hold = voice::Hold::new();
    let mut rec: Option<voice_mac::Recorder> = None;
    let data = data_dir();
    // The speech model is loaded while the person talks and let go after five idle minutes.
    let mut speech: Option<voice_mac::Speech> = None;
    // Loaded by a helper while the person talks, so a Stop or a let-go is never queued behind a 1 to 3 second load.
    let preload: std::sync::Arc<Mutex<Option<voice_mac::Speech>>> = std::sync::Arc::new(Mutex::new(None));
    // Must fix 17: the helper loading it, so there is only ever one load at a time and a let go waits for it.
    let mut loader: Option<std::thread::JoinHandle<()>> = None;
    // The open project's own words for the speech model (voicewords.rs), gathered by a helper while the person talks.
    // Each press has its own number, so a helper still running from an earlier press never hands over its words late.
    let words_slot: std::sync::Arc<Mutex<Option<(u64, String)>>> = std::sync::Arc::new(Mutex::new(None));
    let mut press = 0u64;
    let mut last_used = std::time::Instant::now();
    // The microphone that listened cannot hear now (the Mac's own with the lid closed): its silence is the lid, not the permission.
    let mut quiet_mic = false;
    // Stop everything's count as the keys went down: any Stop since then ends this hold.
    let mut stops_at = VOICE_STOPS.load(Ordering::SeqCst);
    // M36: where the words go when the Type key started this hold (the app in front and its focused element at the press).
    // None for hold to talk: the words go to Home's ask box.
    let mut typing: Option<dictate::Target> = None;
    loop {
        let msg = rx.recv_timeout(Duration::from_secs(1));
        if matches!(msg, Err(std::sync::mpsc::RecvTimeoutError::Disconnected)) { break; }
        // Must fix 17: both copies go, the one in use and the one a helper loaded but nobody took (a hold too short or silent).
        if hold.phase == voice::Phase::Idle && last_used.elapsed() > Duration::from_secs(300) { speech = None; *preload.lock().unwrap_or_else(|e| e.into_inner()) = None; }
        // The microphone is closed by force, whatever the keys are doing, the moment Companion is hidden (the light can no
        // longer be seen) and at its cap (a minute unless changed, Longest hold to talk). What was heard is dropped.
        if let Some(why) = hold.must_close(now() as u64, companion_hidden()) {
            if let Some(r) = rec.take() { let _ = r.finish(); }
            listening(false);
            let cap = hold.cap();
            hold.cancel();
            let words = match why { voice::Close::Hidden => voice::HIDDEN_WORDS.to_string(), voice::Close::Cap => voice::stopped_words(cap) };
            log("voice_closed", json!({ "why": format!("{why:?}") }));
            say_voice(&app, "error", &words, json!({}));
        }
        match msg {
            Ok(VoiceMsg::Down(t, mode)) => {
                // The cap is read as the keys go down and kept for this hold (there is always one, at most two minutes).
                let cap = voice::max_hold_ms(&setting_now("talk.maxHold"));
                if hold.down_for(t, cap) != voice::Step::Start { continue; }
                typing = None;
                VOICE_HOLDS.fetch_add(1, Ordering::SeqCst);
                // The Type key (M36): switched off in Settings, or no Accessibility yet (asked here, the first time it is
                // used, rule 8). Nothing listens either way.
                if mode == talkkeys::Mode::Type {
                    if setting_now("talk.dictate") == json!(false) { hold.cancel(); say_voice(&app, "error", "Type by voice is off. Turn it on in Settings, Keys and voice.", json!({})); continue; }
                    if !ax::trusted(true) { hold.cancel(); say_voice(&app, "needs_access", concat!("To type for you, ", crate::product!(), " needs Accessibility. Allow it in the box macOS shows (or System Settings, Privacy and Security, Accessibility), then hold the keys again."), json!({})); continue; }
                }
                stops_at = VOICE_STOPS.load(Ordering::SeqCst);
                voice_mac::set_buffer_room(voice::buffer_samples(cap));
                if !voice_mac::model_ready(&data) { hold.cancel(); if DOWNLOADING.load(Ordering::SeqCst) { say_voice(&app, "downloading", "Downloading the speech model", json!({ "percent": DOWNLOAD_PERCENT.load(Ordering::SeqCst) })); } else { say_voice(&app, "needs_model", concat!("To talk to ", crate::product!(), ", it needs a speech model on this Mac (about 140 MB, downloaded once). Your voice never leaves this Mac."), json!({})); } continue; }
                match voice_mac::mic_status() {
                    voice_mac::Mic::NotAsked => { hold.cancel(); voice_mac::ask_for_mic(); say_voice(&app, "needs_mic", "Allow the microphone in the box macOS shows, then hold the keys again.", json!({})); continue; }
                    voice_mac::Mic::Refused => { hold.cancel(); say_voice(&app, "mic_refused", concat!("The microphone is switched off for ", crate::product!(), ". Turn it on in System Settings, Privacy and Security, Microphone. If it is not in the list, run this in Terminal and reopen ", crate::product!(), ": tccutil reset Microphone dev.companion.app"), json!({})); continue; }
                    voice_mac::Mic::Allowed => {}
                }
                // The light is the dock character (and the card). If the person cannot see it (a full screen app is in front, or they hid it) nothing is recorded (rule 5).
                if companion_hidden() {
                    hold.cancel();
                    say_voice(&app, "error", voice::HIDDEN_WORDS, json!({}));
                    continue;
                }
                // With the lid closed and only the Mac's own microphone (cut off in hardware), nothing could be heard: one plain
                // line, before the light, and nothing listens. With another microphone, that one listens (voiceset::unheard).
                let (mics, quiet) = if voice_mac::lid_closed() { voice_mac::hearing() } else { (Vec::new(), Vec::new()) };
                if voiceset::only_unheard(&mics, &quiet) { hold.cancel(); log("voice_lid_closed", json!({})); say_voice(&app, "blocked", voice::Silence::Lid.fallback(), json!({ "why": "lid" })); continue; }
                // From here nothing is said, and a line that began after the keys went down is cut off before the microphone opens.
                listening(true);
                speech_off(&app);
                say_voice(&app, "listening", LISTENING, json!({}));
                // The light is asked for first; then the listening ring may show on the pointer too (follow::shown).
                follow_wake();
                std::thread::sleep(Duration::from_millis(150));   // the light is on screen before the microphone opens
                // Hidden meanwhile: the light is gone again, so the microphone never opens.
                if companion_hidden() { hold.cancel(); listening(false); say_voice(&app, "error", voice::HIDDEN_WORDS, json!({})); continue; }
                // Stop everything meanwhile: the microphone never opens.
                if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { hold.cancel(); listening(false); say_voice(&app, "idle", "", json!({})); continue; }
                // The Type key, with the light on: which app and box the words go to (never what the box holds). A password
                // box, secure typing or a never-read app is refused here and the microphone never opens. With Squibby
                // itself in front, the words go to its own ask box as with hold to talk.
                if mode == talkkeys::Mode::Type {
                    if let Some(front) = ax::front_app().filter(|f| f.pid != std::process::id() as i32) {
                        let f = ax::focused(front.pid);
                        let (role, subrole) = f.as_ref().map_or((String::new(), String::new()), |f| (f.role.clone(), f.subrole.clone()));
                        if let Err(v) = dictate::target_verdict(&role, &subrole, ax::secure_input_enabled(), &front.bundle_id, &prompthelp::Denylist::empty()) {
                            hold.cancel(); listening(false); log("dictate_refused", json!({ "why": v.code() }));
                            say_typed(&app, "refused", dictate::refused_words(v), json!({}));
                            continue;
                        }
                        typing = Some(dictate::Target { pid: front.pid, bundle: front.bundle_id, name: front.name, element: f.map_or(0, |f| f.element.id()) });
                    }
                }
                // The microphone picked in Settings, or the Mac's default when it is not connected or will not open (voiceset::open_at_start).
                match voice_mac::Recorder::start(voice_now().mic) {
                    Ok((r, opened)) => {
                        // Stop everything while it opened (a Bluetooth microphone can take seconds): closed again at once.
                        if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { let _ = r.finish(); hold.cancel(); listening(false); log("voice_stopped_opening", json!({})); say_voice(&app, "idle", "", json!({})); continue; }
                        quiet_mic = opened.quiet;
                        // M39: the water ring at the pointer ripples with the voice while the keys are held (follow.ts). Only how
                        // loud, about 25 times a second, and only until the microphone closes.
                        voice_mac::reset_level();
                        { let (a, typing_now) = (app.clone(), mode == talkkeys::Mode::Type); std::thread::spawn(move || {
                            while listening_now() { let _ = a.emit_to("follow", "follow-voice", json!({ "level": voice_mac::level(), "typing": typing_now })); std::thread::sleep(Duration::from_millis(40)); }
                            let _ = a.emit_to("follow", "follow-voice", json!({ "level": Value::Null }));
                        }); }
                        rec = Some(r); log("voice_listening", json!({ "fell_back": opened.missing.is_some(), "quiet": opened.quiet }));
                        // The picked microphone is not connected, so the default listens: one plain line, once each time it goes away.
                        if MIC_NOTE.lock().unwrap_or_else(|e| e.into_inner()).tell(opened.missing.as_deref()) {
                            say_voice(&app, "listening", LISTENING, json!({ "micMissing": opened.missing, "micUsing": opened.name }));
                        }
                        press += 1;
                        *words_slot.lock().unwrap_or_else(|e| e.into_inner()) = None;
                        let (slot, project, this) = (words_slot.clone(), current_project(), press);
                        if !project.is_empty() {   // names only, on this Mac only, never a file's content (voicewords.rs)
                            std::thread::spawn(move || { let w = voicewords::prompt(&voicewords::collect(std::path::Path::new(&project), &voicewords::settings_for(&project))); *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some((this, w)); });
                        }
                        // While the person is talking, on a helper thread; never a second load beside one under way or one
                        // already waiting (must fix 17). The five idle minutes start again from here.
                        if speech.is_none() && loader.as_ref().is_none_or(|h| h.is_finished()) && preload.lock().unwrap_or_else(|e| e.into_inner()).is_none() {
                            let (slot, path) = (preload.clone(), voice_mac::model_path(&data));
                            last_used = std::time::Instant::now();
                            loader = Some(std::thread::spawn(move || { if let Ok(m) = voice_mac::load(&path) { *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(m); } }));
                        }
                    }
                    Err(e) => { hold.cancel(); listening(false); log("failure_detail", json!({ "what": "microphone", "detail": e.to_string() })); say_voice(&app, "error", "I could not use the microphone just now. Check it is connected, then try again.", json!({})); }
                }
            }
            Ok(VoiceMsg::Up(t)) => {
                let (step, long_enough) = hold.up(t);
                if step != voice::Step::Stop { continue; }
                let Some(r) = rec.take() else { listening(false); hold.finished(); continue };
                let heard = r.finish();
                listening(false);
                if !long_enough { hold.finished(); say_voice(&app, "idle", "", json!({})); continue; }
                match heard {
                    Err(e) => { hold.finished(); log("failure_detail", json!({ "what": "microphone", "detail": e.to_string() })); say_voice(&app, "error", "I could not use the microphone just now. Check it is connected, then try again.", json!({})); }
                    Ok(h) => {
                        let mono = h.mono;
                        // Another microphone took over while the keys were held, or the one in use went away: the page says so in one line.
                        let mut mic = json!({});
                        if let Some(to) = &h.switched_to { mic["micSwitched"] = json!(to); }
                        if h.lost { mic["micLost"] = json!(true); }
                        if h.switched_to.is_some() || h.lost { log("voice_mic_changed", json!({ "switched": h.switched_to.is_some(), "lost": h.lost })); }
                        match voice::heard(&mono) {
                            voice::Heard::Blocked => { hold.finished(); let why = voice::why_silent(crate::permissions::current().microphone == crate::permissions::Status::Granted, quiet_mic); mic["why"] = json!(why.word()); say_voice(&app, "blocked", why.fallback(), mic); }
                            voice::Heard::Silent => { hold.finished(); say_voice(&app, "silent", "I did not hear anything. Try again a little closer.", mic); }
                            voice::Heard::Sound => {
                                // Stop everything since the keys went down: nothing is turned into text.
                                if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { hold.finished(); say_voice(&app, "idle", "", json!({})); continue; }
                                say_voice(&app, "transcribing", "Understanding what you said", json!({}));
                                let t0 = now();
                                // Must fix 17: a load still under way is waited for, never started again beside it.
                                if speech.is_none() { if let Some(h) = loader.take() { let _ = h.join(); } }
                                if speech.is_none() { speech = preload.lock().unwrap_or_else(|e| e.into_inner()).take(); }
                                if speech.is_none() { speech = voice_mac::load(&voice_mac::model_path(&data)).ok(); }
                                // The project's own words (empty if the helper is not done) and the language picked in Settings.
                                let words = words_slot.lock().unwrap_or_else(|e| e.into_inner()).take().filter(|(n, _)| *n == press).map(|(_, w)| w).unwrap_or_default();
                                let language = voiceset::language(&voice_now().language);
                                let out = match speech.as_ref() { Some(c) => voice_mac::transcribe_with(c, &mono, &words, language).map(|t| voice::clean_transcript(&t)), None => Err("The speech model could not be loaded.".to_string()) };
                                last_used = std::time::Instant::now();
                                // Timing and how many project words were given, never the words or what was said.
                                log("voice_transcribed", json!({ "ms": (now() - t0) as u64, "words": words.split(", ").filter(|w| !w.is_empty()).count(), "language": language.is_some() }));
                                hold.finished();
                                // Stop everything while the words were turned into text: they are dropped, never sent on (to
                                // Show me after its key, or as a task with auto send on).
                                if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { log("voice_dropped_after_stop", json!({})); say_voice(&app, "idle", "", json!({})); continue; }
                                match out {
                                    // Only the word list written back is not what the person said (voicewords::is_echo).
                                    Ok(text) if voicewords::is_echo(&text, &words) => say_voice(&app, "silent", "I did not catch any words. Try again.", mic),
                                    // The language picked in Settings goes with the words: the page sends by itself only in English for now.
                                    // The Type key (M36): into the box in front, at the cursor, never sent. Stop is checked
                                    // again right before the paste.
                                    Ok(text) if !text.is_empty() && typing.is_some() => {
                                        let target = typing.take().unwrap_or_else(|| unreachable!());
                                        let (stage, line) = dictate::insert_at_cursor(&target, &text, || VOICE_STOPS.load(Ordering::SeqCst) != stops_at);
                                        say_typed(&app, stage, &line, mic);
                                        if stage == "typed" { mark_tried(&app, "dictate") }
                                    }
                                    Ok(text) if !text.is_empty() => { mic["text"] = json!(text); mic["language"] = json!(voice_now().language); say_voice(&app, "heard", "", mic); mark_tried(&app, "talk") }
                                    Ok(_) => say_voice(&app, "silent", "I did not catch any words. Try again.", mic),
                                    Err(e) => say_voice(&app, "error", &e, mic),
                                }
                            }
                        }
                    }
                }
            }
            Ok(VoiceMsg::Cancel) => { if let Some(r) = rec.take() { let _ = r.finish(); } listening(false); if hold.cancel() { say_voice(&app, "idle", "", json!({})); } }
            // Must fix 1: the app is quitting. The microphone closes, both speech models go now (not in the clean up at
            // exit, where one still loaded aborted the process), and the answer says whether a helper is still loading one.
            Ok(VoiceMsg::Quit(ack)) => {
                if let Some(r) = rec.take() { let _ = r.finish(); }
                listening(false);
                drop(speech.take());
                *preload.lock().unwrap_or_else(|e| e.into_inner()) = None;
                let _ = ack.send(std::sync::Arc::strong_count(&preload) == 1);
                break;
            }
            // Already closed by the check at the top of the loop.
            Ok(VoiceMsg::Hidden) | Err(_) => {}
        }
    }
}

/// A speech model download is running, and how far it got: one at a time (a second one would remove the first one's half
/// written file), and holding the talk keys meanwhile says it is still going instead of offering Download again.
static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_PERCENT: AtomicU64 = AtomicU64::new(0);

/// Download the speech model once (the person asked for it with a button). A press while one runs does nothing.
#[tauri::command]
fn voice_download(app: AppHandle) {
    if DOWNLOADING.swap(true, Ordering::SeqCst) { return; }
    DOWNLOAD_PERCENT.store(0, Ordering::SeqCst);
    std::thread::spawn(move || {
        let data = data_dir();
        say_voice(&app, "downloading", "Downloading the speech model", json!({ "percent": 0 }));
        let a = app.clone();
        let r = voice_mac::download_model(&data, &move |got| {
            let pct = ((got as f64 / voice_mac::MODEL_BYTES as f64) * 100.0).min(99.0) as u64;
            DOWNLOAD_PERCENT.store(pct, Ordering::SeqCst);
            say_voice(&a, "downloading", "Downloading the speech model", json!({ "percent": pct }));
        });
        DOWNLOADING.store(false, Ordering::SeqCst);
        match r {
            Ok(()) => say_voice(&app, "model_ready", &talkkeys::ready_words(key_using(keymap::Action::Talk)), json!({})),
            Err(e) => say_voice(&app, "error", &e, json!({})),
        }
    });
}

