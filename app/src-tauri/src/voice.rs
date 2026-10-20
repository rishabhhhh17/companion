//! Hold to talk. The rules live here as plain code so they can be tested without a microphone:
//! the microphone is open only while the key is held and the light is on (it closes the moment Companion is hidden),
//! never longer than its cap (a minute unless changed in Settings,
//! talk.maxHold: 30 seconds, a minute or 2 minutes; there is always one), a quick tap does nothing,
//! silence is told apart from a blocked microphone, and the words that come back are tidied before they are shown.

pub const TARGET_RATE: u32 = 16_000;
pub const MIN_HOLD_MS: u64 = 300;
pub const MAX_HOLD_MS: u64 = 60_000;
/// The longest cap Settings offers. No hold is ever longer, whatever is asked.
pub const MAX_EVER_MS: u64 = 120_000;

/// The cap from the setting's value (30, 60 or 120 seconds); anything else is a minute. Never none, never longer than two minutes.
pub fn max_hold_ms(v: &serde_json::Value) -> u64 {
    match v.as_str() { Some("30") => 30_000, Some("60") => 60_000, Some("120") => 120_000, _ => MAX_HOLD_MS }.min(MAX_EVER_MS)
}
/// What the person is told when the cap closed the microphone.
pub fn stopped_words(cap_ms: u64) -> String {
    let when = match cap_ms { 60_000 => "a minute".to_string(), ms if ms % 60_000 == 0 => format!("{} minutes", ms / 60_000), ms => format!("{} seconds", ms / 1000) };
    format!("I stopped listening after {when}. Hold the keys and talk again.")
}
/// How many samples the recorder keeps room for: the cap and ten seconds more, at up to four channels of 32 kHz (70
/// seconds' room for the usual minute, as before).
pub fn buffer_samples(cap_ms: u64) -> usize { 16_000 * 4 * 2 * ((cap_ms.min(MAX_EVER_MS) / 1000) as usize + 10) }
pub const AUTO_SEND_MIN_WORDS: usize = 3;

/// What the person is told when the microphone will not open, or closed, because Companion is hidden: the light is the
/// character, and nobody can see it (rule 5).
pub const HIDDEN_WORDS: &str = "Companion is hidden right now, so I cannot show you that I am listening, and I will not record without that. Show Companion from the menu bar icon, then hold the keys again.";

/// Why an open microphone must close now, whatever the keys are doing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Close { Hidden, Cap }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase { Idle, Listening, Transcribing }

#[derive(Debug, PartialEq, Eq)]
pub enum Step { Start, Stop, Ignore }

/// What the key does in each phase. Key presses that repeat while held do nothing.
#[derive(Debug)]
pub struct Hold { pub phase: Phase, since_ms: u64, cap_ms: u64 }

impl Hold {
    pub fn new() -> Hold { Hold { phase: Phase::Idle, since_ms: 0, cap_ms: MAX_HOLD_MS } }
    pub fn down(&mut self, now_ms: u64) -> Step { self.down_for(now_ms, MAX_HOLD_MS) }
    /// The keys went down with this cap (read from Settings at that moment, kept until they come up).
    pub fn down_for(&mut self, now_ms: u64, cap_ms: u64) -> Step {
        if self.phase != Phase::Idle { return Step::Ignore; }
        self.phase = Phase::Listening; self.since_ms = now_ms; self.cap_ms = cap_ms.clamp(1, MAX_EVER_MS); Step::Start
    }
    /// The cap in force for this hold.
    pub fn cap(&self) -> u64 { self.cap_ms }
    /// Key released. A very short tap is dropped; anything longer is sent to be understood.
    pub fn up(&mut self, now_ms: u64) -> (Step, bool) {
        if self.phase != Phase::Listening { return (Step::Ignore, false); }
        let long_enough = now_ms.saturating_sub(self.since_ms) >= MIN_HOLD_MS;
        self.phase = if long_enough { Phase::Transcribing } else { Phase::Idle };
        (Step::Stop, long_enough)
    }
    /// The microphone is closed by force once the limit is reached, whatever the key is doing.
    pub fn too_long(&self, now_ms: u64) -> bool { self.phase == Phase::Listening && now_ms.saturating_sub(self.since_ms) >= self.cap_ms }
    /// The microphone is on only while the keys are held and the light is on: while listening it closes at once when
    /// Companion is hidden (a full screen app came forward, or the person hid it), and at its cap. Hidden is said first.
    pub fn must_close(&self, now_ms: u64, hidden: bool) -> Option<Close> {
        if self.phase != Phase::Listening { return None; }
        if hidden { return Some(Close::Hidden); }
        if self.too_long(now_ms) { Some(Close::Cap) } else { None }
    }
    pub fn finished(&mut self) { self.phase = Phase::Idle; }
    /// Stop everything: the microphone closes at once, from any phase.
    pub fn cancel(&mut self) -> bool { let was = self.phase == Phase::Listening; self.phase = Phase::Idle; was }
}

/// Mixes interleaved channels down to one and brings the rate to 16 kHz by averaging (down) or interpolating (up).
pub fn to_mono_16k(samples: &[f32], channels: usize, rate: u32) -> Vec<f32> {
    if channels == 0 || rate == 0 || samples.is_empty() { return vec![]; }
    let mono: Vec<f32> = samples.chunks(channels).map(|f| f.iter().sum::<f32>() / f.len() as f32).collect();
    if rate == TARGET_RATE { return mono; }
    let ratio = rate as f64 / TARGET_RATE as f64;
    let out_len = (mono.len() as f64 / ratio).floor() as usize;
    (0..out_len).map(|i| {
        let a = i as f64 * ratio; let b = ((i + 1) as f64 * ratio).min(mono.len() as f64);
        if ratio > 1.0 {
            // average everything this output sample covers, which also smooths out sounds above the new limit
            let (s, e) = (a.floor() as usize, (b.ceil() as usize).min(mono.len()).max(a.floor() as usize + 1));
            mono[s..e].iter().sum::<f32>() / (e - s) as f32
        } else {
            let s = a.floor() as usize; let f = (a - s as f64) as f32;
            let next = *mono.get(s + 1).unwrap_or(&mono[s]);
            mono[s] * (1.0 - f) + next * f
        }
    }).collect()
}

#[derive(Debug, PartialEq, Eq)]
pub enum Heard { Blocked, Silent, Sound }

/// Every sample exactly zero means the system gave us nothing (no permission); very low noise means a quiet room.
pub fn heard(samples: &[f32]) -> Heard {
    if samples.is_empty() || samples.iter().all(|s| *s == 0.0) { return Heard::Blocked; }
    let peak = samples.iter().fold(0.0f32, |m, s| m.max(s.abs()));
    if peak < 0.01 { Heard::Silent } else { Heard::Sound }
}

/// Why a microphone gave only silence (every sample zero, Heard::Blocked), so the words never blame the wrong thing.
/// Permission: Companion is not allowed the microphone. Lid: the Mac's own microphone listened with the lid closed (it is
/// cut off in hardware). Device: the permission is granted, so it is the microphone itself (muted, unplugged, or its
/// switch is off).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Silence { Permission, Lid, Device }
impl Silence {
    pub fn word(self) -> &'static str { match self { Silence::Permission => "permission", Silence::Lid => "lid", Silence::Device => "device" } }
    /// The words if the page does not have its own (the page says it from strings.ts, by `word`).
    pub fn fallback(self) -> &'static str {
        match self {
            Silence::Permission => "The microphone gave me only silence. It may be switched off for Companion in System Settings, Privacy and Security, Microphone.",
            Silence::Lid => "Your Mac's lid is closed, so its own microphone is off. Plug in a microphone or headphones with one, or pick another microphone in Settings, then hold the keys again.",
            Silence::Device => "The microphone gave me only silence. Check that it is plugged in and not muted, or pick another microphone in Settings.",
        }
    }
}
/// `allowed`: macOS says the microphone is allowed for Companion. `lid`: the microphone that listened cannot hear now
/// because the lid is closed (voiceset::unheard).
pub fn why_silent(allowed: bool, lid: bool) -> Silence {
    if !allowed { Silence::Permission } else if lid { Silence::Lid } else { Silence::Device }
}

/// Speech engines sometimes write sound markers instead of words. Those are not words.
pub fn clean_transcript(raw: &str) -> String {
    let mut out = String::new();
    let mut depth = 0u32;
    for c in raw.chars() {
        match c {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            '♪' | '*' => {}
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn word_count(s: &str) -> usize { s.split_whitespace().count() }
pub fn should_auto_send(enabled: bool, transcript: &str) -> bool { enabled && word_count(transcript) >= AUTO_SEND_MIN_WORDS }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hold_to_talk_always_has_a_cap_and_it_is_a_minute_unless_changed() {
        // talk.maxHold: 30, 60 or 120 seconds, usual 60 (today). There is always a cap: anything else is a minute.
        assert_eq!(MAX_HOLD_MS, 60_000);
        assert_eq!(max_hold_ms(&serde_json::json!("60")), 60_000);
        assert_eq!(max_hold_ms(&serde_json::json!("30")), 30_000);
        assert_eq!(max_hold_ms(&serde_json::json!("120")), 120_000);
        for odd in [serde_json::json!("0"), serde_json::json!("none"), serde_json::json!(120), serde_json::json!(null), serde_json::json!("600")] {
            assert_eq!(max_hold_ms(&odd), MAX_HOLD_MS, "{odd}");
        }
        for v in ["30", "60", "120"] { let ms = max_hold_ms(&serde_json::json!(v)); assert!(ms > 0 && ms <= MAX_EVER_MS, "{v}"); }
    }
    #[test]
    fn the_microphone_is_closed_at_the_cap_chosen_when_the_keys_went_down() {
        let mut h = Hold::new();
        assert_eq!(h.down_for(1_000, 30_000), Step::Start);
        assert!(!h.too_long(30_999));
        assert!(h.too_long(31_000));
        let mut long = Hold::new();
        long.down_for(0, 120_000);
        assert!(!long.too_long(119_999) && long.too_long(120_000));
        // A cap past two minutes is never used, whatever is asked.
        let mut odd = Hold::new();
        odd.down_for(0, 10 * 60_000);
        assert!(odd.too_long(MAX_EVER_MS));
        // Pressed the usual way, it is still a minute.
        let mut usual = Hold::new();
        usual.down(0);
        assert!(!usual.too_long(59_999) && usual.too_long(60_000));
    }
    #[test]
    fn the_words_and_the_recording_room_follow_the_cap() {
        assert_eq!(stopped_words(60_000), "I stopped listening after a minute. Hold the keys and talk again.");
        assert_eq!(stopped_words(30_000), "I stopped listening after 30 seconds. Hold the keys and talk again.");
        assert_eq!(stopped_words(120_000), "I stopped listening after 2 minutes. Hold the keys and talk again.");
        // The microphone's buffer holds the cap plus ten seconds: 70 seconds' room for a minute, as before.
        assert_eq!(buffer_samples(60_000), 16_000 * 4 * 70 * 2);
        assert!(buffer_samples(120_000) >= 16_000 * 4 * 130 * 2);
        let main = include_str!("main.rs");
        let w = &main[main.find("fn voice_worker(").unwrap()..];
        let w = &w[..w.find("\n}\n").unwrap()];
        assert!(w.contains("voice::max_hold_ms(&setting_now(\"talk.maxHold\"))"), "read when the keys go down");
        assert!(w.contains("hold.down_for(t, cap)"));
        assert!(w.contains("voice::stopped_words("));
        assert!(include_str!("voice_mac.rs").contains("buffer_room()"), "the recorder keeps room for the whole cap");
    }

    #[test]
    fn the_microphone_closes_the_moment_companion_is_hidden_for_every_cap() {
        // talk.maxHold's floor: the microphone is on only while the keys are held and the light (the character) is on. A
        // full screen app coming forward, or Hide from the menu bar, closes it at once, whatever the cap.
        for v in ["30", "60", "120"] {
            let cap = max_hold_ms(&serde_json::json!(v));
            let mut h = Hold::new();
            assert_eq!(h.must_close(0, true), None, "{v}: nothing is open, so nothing closes");
            assert_eq!(h.down_for(0, cap), Step::Start);
            assert_eq!(h.must_close(1, false), None, "{v}");
            assert_eq!(h.must_close(cap - 1, false), None, "{v}");
            assert_eq!(h.must_close(1, true), Some(Close::Hidden), "{v}: hidden just after the keys went down");
            assert_eq!(h.must_close(cap - 1, true), Some(Close::Hidden), "{v}: hidden just before the cap");
            assert_eq!(h.must_close(cap, false), Some(Close::Cap), "{v}");
            assert_eq!(h.must_close(cap, true), Some(Close::Hidden), "{v}: hidden is what is said");
            h.up(cap / 2);   // let go: the microphone is already closed while what was said is understood
            assert_eq!(h.must_close(cap, true), None, "{v}");
        }
        assert!(HIDDEN_WORDS.starts_with("Companion is hidden right now") && !HIDDEN_WORDS.contains('\u{2014}'));
    }
    #[test]
    fn stop_everything_reaches_hold_to_talk_even_while_it_waits_or_turns_words_into_text() {
        // Rule 11. Stop reaches the worker as a Cancel queued behind whatever it is doing: the light's wait, a slow
        // microphone opening (up to seconds for a Bluetooth one), or the words being turned into text. So Stop also counts
        // itself at once, and the worker looks at that count after each of those: the microphone never opens after a Stop,
        // and words heard before a Stop are dropped, never sent on to Show me or a task.
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let rest = body("fn showme_stop_rest(");
        assert!(rest.find("VOICE_STOPS.fetch_add(1, Ordering::SeqCst);").expect("Stop counts itself") < rest.find("voice_send(app, VoiceMsg::Cancel)").unwrap(), "{rest}");
        let w = body("fn voice_worker(");
        let down = &w[w.find("Ok(VoiceMsg::Down(t)) => {").unwrap()..w.find("Ok(VoiceMsg::Up(t)) => {").unwrap()];
        let up = &w[w.find("Ok(VoiceMsg::Up(t)) => {").unwrap()..w.find("Ok(VoiceMsg::Cancel) =>").unwrap()];
        let stopped = "if VOICE_STOPS.load(Ordering::SeqCst) != stops_at {";
        assert!(down.find("stops_at = VOICE_STOPS.load(Ordering::SeqCst);").unwrap() < down.find("voice_mac::model_ready(").unwrap(), "noted as the keys go down");
        let (light, mic) = (down.find("std::thread::sleep(Duration::from_millis(150))").unwrap(), down.find("voice_mac::Recorder::start(").unwrap());
        assert!(down[light..mic].contains(stopped), "a Stop during the light: the microphone never opens");
        let opened = &down[mic..];
        assert!(opened[..opened.find("rec = Some(r);").unwrap()].contains(stopped), "a Stop while the microphone opened: it is closed at once");
        let (said, heard) = (up.find("say_voice(&app, \"transcribing\"").unwrap(), up.find("say_voice(&app, \"heard\"").unwrap());
        assert!(up[said..heard].contains(stopped), "a Stop while the words were turned into text: they are dropped");
        assert!(up[..said].contains(stopped), "and none are turned into text after a Stop");
    }
    #[test]
    fn the_speech_model_downloads_once_at_a_time() {
        // A second Download while one runs used to remove the first one's half written file, and each then threw the other's
        // away. A second press does nothing now, and holding the talk keys meanwhile says the download is still going
        // (with how far it got) instead of offering Download again.
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let d = body("fn voice_download(");
        assert!(d.find("if DOWNLOADING.swap(true, Ordering::SeqCst) { return; }").expect("one at a time") < d.find("std::thread::spawn(").unwrap(), "{d}");
        assert!(d.contains("DOWNLOAD_PERCENT.store(pct, Ordering::SeqCst);") && d.contains("DOWNLOADING.store(false, Ordering::SeqCst)"), "{d}");
        let w = body("fn voice_worker(");
        let ready = &w[w.find("if !voice_mac::model_ready(&data) {").unwrap()..];
        let ready = &ready[..ready.find('\n').unwrap()];
        assert!(ready.contains("if DOWNLOADING.load(Ordering::SeqCst) { say_voice(&app, \"downloading\", \"Downloading the speech model\", json!({ \"percent\": DOWNLOAD_PERCENT.load(Ordering::SeqCst) })); }"), "{ready}");
    }
    #[test]
    fn both_ways_of_hiding_close_the_microphone_at_once() {
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let w = body("fn voice_worker(");
        assert!(w.contains("hold.must_close(now() as u64, companion_hidden())"), "every pass of the loop checks, whatever the keys are doing");
        assert!(w.contains("voice::Close::Hidden => voice::HIDDEN_WORDS"));
        assert!(!w.contains("hold.too_long("), "the cap is one of the two reasons, checked in the same place");
        // Hidden between the light coming on and the microphone opening (150 ms): the microphone never opens.
        let (light, mic) = (w.find("std::thread::sleep(Duration::from_millis(150))").unwrap(), w.find("voice_mac::Recorder::start(").unwrap());
        assert!(w[light..mic].contains("if companion_hidden()"));
        // A full screen app came forward, or Hide from the menu bar: the worker is woken at once, not at its next second.
        let tick = body("fn tick(");
        let hide = &tick[tick.find("HIDDEN_BY_US.swap(true").unwrap()..tick.find("} else if show && HIDDEN_BY_US.swap(false").unwrap()];
        assert!(hide.contains("voice_tell_hidden();"), "the full screen hide wakes the microphone's worker");
        assert!(main.contains("if hide { home_closed(); voice_tell_hidden(); pointers_gone_hidden(app); }"), "Hide from the menu bar wakes it too");
        let tell = body("fn voice_tell_hidden(");
        assert!(tell.contains("VoiceMsg::Hidden") && !tell.contains("voice_worker"), "only a worker already running is woken");
        assert!(body("fn companion_hidden(").contains("HIDDEN_BY_US") && body("fn companion_hidden(").contains("USER_HID"));
    }

    #[test]
    fn holding_starts_releasing_stops_and_repeats_do_nothing() {
        let mut h = Hold::new();
        assert_eq!(h.down(0), Step::Start); assert_eq!(h.down(30), Step::Ignore); assert_eq!(h.down(60), Step::Ignore);
        assert_eq!(h.up(2000), (Step::Stop, true)); assert_eq!(h.phase, Phase::Transcribing);
        assert_eq!(h.down(2100), Step::Ignore);   // busy understanding the last one
        h.finished(); assert_eq!(h.down(2200), Step::Start);
    }
    #[test]
    fn a_quick_tap_is_dropped() {
        let mut h = Hold::new(); h.down(1000);
        assert_eq!(h.up(1100), (Step::Stop, false)); assert_eq!(h.phase, Phase::Idle);
    }
    #[test]
    fn release_without_a_press_does_nothing() { assert_eq!(Hold::new().up(5), (Step::Ignore, false)); }
    #[test]
    fn the_microphone_is_closed_after_a_minute_even_if_the_key_is_stuck() {
        let mut h = Hold::new(); h.down(0);
        assert!(!h.too_long(59_999)); assert!(h.too_long(60_000));
        h.up(61_000); assert!(!h.too_long(120_000));
    }
    #[test]
    fn stop_everything_closes_the_microphone_from_any_phase() {
        let mut h = Hold::new(); h.down(0); assert!(h.cancel()); assert_eq!(h.phase, Phase::Idle);
        let mut t = Hold::new(); t.down(0); t.up(1000); assert!(!t.cancel()); assert_eq!(t.phase, Phase::Idle);
    }
    #[test]
    fn stereo_becomes_mono_and_48k_becomes_16k() {
        let stereo: Vec<f32> = (0..48_000).flat_map(|_| [0.2f32, 0.4f32]).collect();   // one second at 48 kHz
        let m = to_mono_16k(&stereo, 2, 48_000);
        assert_eq!(m.len(), 16_000); assert!(m.iter().all(|s| (s - 0.3).abs() < 1e-5));
    }
    #[test]
    fn rates_that_do_not_divide_evenly_still_give_the_right_length() {
        let one_sec = vec![0.5f32; 44_100];
        let m = to_mono_16k(&one_sec, 1, 44_100); assert!((m.len() as i64 - 16_000).abs() <= 1);
        let up = to_mono_16k(&vec![0.5f32; 8_000], 1, 8_000); assert!((up.len() as i64 - 16_000).abs() <= 1);
    }
    #[test]
    fn a_tone_keeps_its_energy_when_resampled() {
        let tone: Vec<f32> = (0..48_000).map(|i| (i as f32 * 2.0 * std::f32::consts::PI * 440.0 / 48_000.0).sin() * 0.5).collect();
        let m = to_mono_16k(&tone, 1, 48_000);
        let rms = (m.iter().map(|s| s * s).sum::<f32>() / m.len() as f32).sqrt();
        assert!(rms > 0.3 && rms < 0.4, "{rms}");
    }
    #[test]
    fn empty_input_and_odd_settings_give_nothing_not_a_crash() {
        assert!(to_mono_16k(&[], 2, 48_000).is_empty()); assert!(to_mono_16k(&[0.1], 0, 48_000).is_empty()); assert!(to_mono_16k(&[0.1], 1, 0).is_empty());
    }
    #[test]
    fn all_zero_means_blocked_a_quiet_room_means_silent_and_speech_is_sound() {
        assert_eq!(heard(&[0.0; 1000]), Heard::Blocked); assert_eq!(heard(&[]), Heard::Blocked);
        assert_eq!(heard(&[0.001, -0.002, 0.003]), Heard::Silent); assert_eq!(heard(&[0.0, 0.2, -0.3]), Heard::Sound);
    }
    // The microphone gave only silence. With the permission granted it is never blamed on the permission: with the lid
    // closed and the Mac's own microphone listening, it is the lid; otherwise the microphone itself (muted, unplugged).
    #[test]
    fn silence_is_blamed_on_the_permission_only_when_it_is_not_granted() {
        assert_eq!(why_silent(false, false), Silence::Permission);
        assert_eq!(why_silent(false, true), Silence::Permission, "no permission: that comes first");
        assert_eq!(why_silent(true, true), Silence::Lid);
        assert_eq!(why_silent(true, false), Silence::Device);
        assert_eq!([Silence::Permission, Silence::Lid, Silence::Device].map(Silence::word), ["permission", "lid", "device"]);
    }
    #[test]
    fn sound_markers_are_dropped_and_spacing_is_tidied() {
        assert_eq!(clean_transcript(" [BLANK_AUDIO] "), ""); assert_eq!(clean_transcript("(silence)"), "");
        assert_eq!(clean_transcript("how do I  deploy [music] this   site"), "how do I deploy this site");
        assert_eq!(clean_transcript("♪ la la ♪ hello"), "la la hello"); assert_eq!(clean_transcript("*coughs* hello"), "coughs hello");
        assert_eq!(clean_transcript("what is (the) plan"), "what is plan");
    }
    #[test]
    fn auto_send_needs_the_setting_and_at_least_three_words() {
        assert!(should_auto_send(true, "open the settings")); assert!(!should_auto_send(true, "yes please")); assert!(!should_auto_send(false, "open the settings page now"));
    }
}
