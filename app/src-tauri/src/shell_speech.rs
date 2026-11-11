// ---------- Spoken replies ----------

static LAST_SAID: Mutex<Option<speak::Last>> = Mutex::new(None);

/// The "your Mac's sound is off" line is said once each time the sound goes off (voiceset::SoundNote).
static SOUND_NOTE: Mutex<voiceset::SoundNote> = Mutex::new(voiceset::SoundNote::new());

/// Says one short line with the Mac's built in voice, in the voice and at the speed picked in Settings (voice.json). The
/// page only calls this when the person turned "Speak to me" on, or "Answer out loud" for a question they asked by voice
/// (`whole`: a whole short answer, with `rest` said when it had to be cut). Only from the card, only plain text of a
/// sensible length, nothing secret looking, never over the person's own voice (nothing is said while hold to talk listens,
/// so the Mac's voice never plays into the open microphone), never during a call, and never into a Mac whose sound is off:
/// then nothing is said, the words stay on the card, and the page is told once so it can say so.
#[tauri::command]
fn speak(app: AppHandle, window: tauri::WebviewWindow, text: String, whole: Option<bool>, rest: Option<String>) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("Speaking can only be started from the card.".into()); }
    let line = if whole == Some(true) { speak::prepare_reply(&text, rest.as_deref().unwrap_or("")) } else { speak::prepare(&text) };
    let Some(line) = line else { return Ok(json!({ "said": false, "why": "nothing" })) };
    // The person is talking: the line is dropped, its words stay on the card.
    if listening_now() { log("speak_listening", json!({})); return Ok(json!({ "said": false, "why": "listening" })); }
    // Quiet during calls (rule 7): nothing is said while a call app is in front (presentation.rs).
    if quiet() { log("speak_quiet", json!({})); return Ok(json!({ "said": false, "why": "quiet" })); }
    let sound = sound_reading();
    let tell = SOUND_NOTE.lock().unwrap_or_else(|e| e.into_inner()).tell(sound);
    if sound != voiceset::Sound::On {
        log("speak_no_sound", json!({ "sound": voiceset::sound_word(sound) }));
        return Ok(json!({ "said": false, "why": "sound", "sound": voiceset::sound_word(sound), "tell": tell }));
    }
    let ok = LAST_SAID.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(Default::default).should_say(&line, now() as u64);
    if !ok { return Ok(json!({ "said": false, "why": "repeat" })); }
    log("speak", json!({ "chars": line.chars().count(), "whole": whole == Some(true) }));   // how long, never what
    let set = voice_now();
    let shown = line.clone();
    let _ = app.run_on_main_thread(move || speak::mac::say(&line, set.voice.as_ref(), set.speed));
    // M26: the words said, shown at the bottom of the screen while they are said (talk.captions).
    if setting_now("talk.captions") != json!(false) { show_caption(&app, &shown, set.speed); }
    if whole.is_some() { mark_tried(&app, "speak"); }   // an answer really said out loud; the voice sample in Settings sends no `whole`, so trying a voice is not a use
    Ok(json!({ "said": true }))
}

// ---------- Voice settings (M11 wave 4 item 2; the rules are in voiceset.rs) ----------

fn voice_path() -> PathBuf { data_dir().join("voice.json") }
static VOICE_SET: Mutex<Option<voiceset::Saved>> = Mutex::new(None);
/// The voice, speed, microphone and language picked in Settings (the Mac's own choices until then).
fn voice_now() -> voiceset::Saved {
    VOICE_SET.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(|| voiceset::parse(std::fs::read_to_string(voice_path()).ok().as_deref())).clone()
}
/// The "your microphone is not connected" line is said once each time it goes away (voiceset::MicNote).
static MIC_NOTE: Mutex<voiceset::MicNote> = Mutex::new(voiceset::MicNote::new());

/// The microphones and the sound, read from Core Audio off the main thread (voiceset::Recent): Core Audio can stall just
/// after the Mac wakes or while Bluetooth headphones connect, and every panel shares the main thread, so a slow read gives
/// the last answer instead of a beachball. The sound counts as on when nothing is known (it is never claimed off without a
/// reading); no microphone is listed when nothing is known yet.
const CORE_AUDIO_WAIT: Duration = Duration::from_millis(300);
/// The microphones, the Mac's default and those that cannot hear now (the Mac's own with the lid closed), read together.
static MIC_LIST: voiceset::Recent<(Vec<voiceset::Input>, Option<String>, Vec<String>)> = voiceset::Recent::new();
static SOUND_NOW: voiceset::Recent<voiceset::Sound> = voiceset::Recent::new();
fn mics_now() -> (Vec<voiceset::Input>, Option<String>, Vec<String>) { MIC_LIST.read(CORE_AUDIO_WAIT, || (Vec::new(), None, Vec::new()), voice_mac::mics) }
fn inputs_now() -> (Vec<voiceset::Input>, Option<String>) { let (inputs, default_id, _) = mics_now(); (inputs, default_id) }
fn sound_reading() -> voiceset::Sound { SOUND_NOW.read(CORE_AUDIO_WAIT, || voiceset::Sound::On, speak::mac::sound_now) }

fn voice_state(set: &voiceset::Saved, voices: &[voiceset::VoiceInfo]) -> Value {
    // With the lid closed, Settings names the microphone that will really listen (voiceset::state_json).
    let (inputs, default_id, quiet) = mics_now();
    voiceset::state_json(set, voices, &speak::mac::mac_language(), &inputs, default_id.as_deref(), sound_reading(), &quiet)
}

/// Settings: the Mac's voices and microphones, what is picked, what is away, and whether the sound is on. Only from the
/// card. A sync command, so it runs on the main thread, where the voice list is read. Reads names only; nothing listens.
#[tauri::command]
fn voice_settings(window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("not_card".into()); }
    Ok(voice_state(&voice_now(), &speak::mac::voices()))
}

/// The card's start: only the speed picked in Settings, for Show me's timing (sequence.ts lineMs). Nothing is listed: the
/// voices and microphones are read only when Settings is opened.
#[tauri::command]
fn voice_speed(window: tauri::WebviewWindow) -> Result<f64, String> {
    if window.label() != "card" { return Err("not_card".into()); }
    Ok(voice_now().speed)
}

/// Settings: pick a voice, a speed, a microphone and a language. Only from the card, only what is on this Mac now (or what
/// was already picked), saved in voice.json in Companion's folder. The error is a code the page turns into words.
#[tauri::command]
fn set_voice_settings(app: AppHandle, window: tauri::WebviewWindow, voice: Option<String>, speed: f64, mic: Option<String>, language: String) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("not_card".into()); }
    let voices = speak::mac::voices();
    let (inputs, _) = inputs_now();
    let before = voice_now();
    let ask = voiceset::Ask { voice: voice.as_deref(), speed, mic: mic.as_deref(), language: &language };
    let next = voiceset::apply(&before, &ask, &voices, &inputs).map_err(|c| { log("voice_not_set", json!({ "why": c })); c.to_string() })?;
    voice_save(&before, &next).map_err(|_| "not_saved".to_string())?;
    // Whether each was picked, never which voice or microphone.
    log("voice_set", json!({ "voice": next.voice.is_some(), "speed": next.speed, "mic": next.mic.is_some(), "language": next.language }));
    settings_told(&app, &["talk.voice".to_string()]);
    Ok(voice_state(&next, &voices))
}
/// Keeps the voice settings in voice.json (Settings, and Reset and Undo through the registry).
fn voice_save(before: &voiceset::Saved, next: &voiceset::Saved) -> Result<(), &'static str> {
    let _ = std::fs::create_dir_all(data_dir());
    logfile::write_atomic(&voice_path(), voiceset::to_json(next).to_string().as_bytes()).map_err(|_| "notSaved")?;
    if next.mic != before.mic { *MIC_NOTE.lock().unwrap_or_else(|e| e.into_inner()) = voiceset::MicNote::new(); }
    *VOICE_SET.lock().unwrap_or_else(|e| e.into_inner()) = Some(next.clone());
    Ok(())
}

/// Silence, at once. Also part of Stop everything.
#[tauri::command]
fn speak_stop(app: AppHandle) { speech_off(&app); }
/// M38: each word the voice is about to say goes to the overlay, so a mark being drawn keeps pace with the words (overlay.ts
/// SpeechClock). Only how far through the line it is, never the words.
fn speech_word(part: Option<f64>) {
    if let Some(app) = APP.get() { let _ = app.emit_to("overlay", "speech-word", json!({ "part": part })); }
}
fn speech_off(app: &AppHandle) { let _ = app.run_on_main_thread(speak::mac::silence); let _ = app.emit_to("overlay", "overlay-caption-end", ()); }

/// Opens the licence notices that ship inside the app, in the person's default text app. Fixed file, no input.
#[tauri::command]
fn open_acknowledgements() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|_| "Could not find the notices.".to_string())?;
    let bundled = exe.ancestors().find(|a| a.file_name().is_some_and(|n| n == "Contents")).map(|c| c.join("Resources/ACKNOWLEDGEMENTS.txt"));
    let file = bundled.filter(|p| p.is_file()).ok_or("The notices are only in the installed app.".to_string())?;
    std::process::Command::new("/usr/bin/open").arg("-t").arg(file).status().map(|_| ()).map_err(|_| "Could not open the notices.".to_string())
}

