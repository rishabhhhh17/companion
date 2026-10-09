//! Hold to talk. The rules live here as plain code so they can be tested without a microphone:
//! the microphone is open only while the key is held, never longer than a minute, a quick tap does nothing,
//! silence is told apart from a blocked microphone, and the words that come back are tidied before they are shown.

pub const TARGET_RATE: u32 = 16_000;
pub const MIN_HOLD_MS: u64 = 300;
pub const MAX_HOLD_MS: u64 = 60_000;
pub const AUTO_SEND_MIN_WORDS: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase { Idle, Listening, Transcribing }

#[derive(Debug, PartialEq, Eq)]
pub enum Step { Start, Stop, Ignore }

/// What the key does in each phase. Key presses that repeat while held do nothing.
#[derive(Debug)]
pub struct Hold { pub phase: Phase, since_ms: u64 }

impl Hold {
    pub fn new() -> Hold { Hold { phase: Phase::Idle, since_ms: 0 } }
    pub fn down(&mut self, now_ms: u64) -> Step {
        if self.phase != Phase::Idle { return Step::Ignore; }
        self.phase = Phase::Listening; self.since_ms = now_ms; Step::Start
    }
    /// Key released. A very short tap is dropped; anything longer is sent to be understood.
    pub fn up(&mut self, now_ms: u64) -> (Step, bool) {
        if self.phase != Phase::Listening { return (Step::Ignore, false); }
        let long_enough = now_ms.saturating_sub(self.since_ms) >= MIN_HOLD_MS;
        self.phase = if long_enough { Phase::Transcribing } else { Phase::Idle };
        (Step::Stop, long_enough)
    }
    /// The microphone is closed by force once the limit is reached, whatever the key is doing.
    pub fn too_long(&self, now_ms: u64) -> bool { self.phase == Phase::Listening && now_ms.saturating_sub(self.since_ms) >= MAX_HOLD_MS }
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
