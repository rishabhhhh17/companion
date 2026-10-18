//! Spoken replies: a short line said out loud with the Mac's built in voice. Off unless the person turned it on in
//! Settings. Nothing leaves the Mac (no voice service), nothing is said unprompted, Stop everything and closing the card
//! silence it, and it never reads out anything that looks like a secret. This file is the rules; the speaker itself is at
//! the bottom and is never run by the tests (a test must not make a noise). Which voice and how fast are voiceset.rs.
use crate::redact::is_sensitive;

pub const MAX_CHARS: usize = 240;

/// The line to say, or None when nothing should be said. Plain text only: no markup, no web addresses read letter by
/// letter, nothing secret looking, a sensible length.
pub fn prepare(text: &str) -> Option<String> { cut_to(text, MAX_CHARS).map(|(l, _)| l) }

/// The tidied line, at most `max` characters, and whether it had to be cut.
fn cut_to(text: &str, max: usize) -> Option<(String, bool)> {
    let cleaned: String = text.chars().map(|c| if c.is_control() || c == '<' || c == '>' { ' ' } else { c }).collect();
    let words: Vec<String> = cleaned.split_whitespace().map(|w| {
        let lw = w.to_lowercase();
        if lw.starts_with("http://") || lw.starts_with("https://") || lw.starts_with("www.") { "a link".to_string() } else { w.to_string() }
    }).collect();
    let mut line = words.join(" ");
    if line.chars().filter(|c| c.is_alphanumeric()).count() < 2 { return None; }
    if is_sensitive(&line) { return None; }
    let cut = line.chars().count() > max;
    if cut {
        // Cut at a word, preferring the end of a sentence, never mid word.
        let head: String = line.chars().take(max).collect();
        let at = head.rfind(|c| c == '.' || c == '!' || c == '?').filter(|&i| i > max / 3).map(|i| i + 1)
            .or_else(|| head.rfind(' ')).unwrap_or(head.len());
        line = head[..at].trim_end_matches(|c: char| c == ',' || c == ';' || c.is_whitespace()).to_string();
    }
    Some((line, cut))
}

/// A whole short answer, said when the person asked by voice and turned that on (off by default, T13).
pub const REPLY_MAX_CHARS: usize = 600;
pub const REST_MAX_CHARS: usize = 60;
/// The answer said whole when it is short; a longer one up to a sentence, then `rest` (the card's words for "the rest is
/// on the card"), checked like everything else. The same rules as a short line otherwise.
pub fn prepare_reply(text: &str, rest: &str) -> Option<String> {
    let (line, cut) = cut_to(text, REPLY_MAX_CHARS)?;
    if !cut { return Some(line); }
    match cut_to(rest, REST_MAX_CHARS) { Some((r, _)) => Some(format!("{line} {r}")), None => Some(line) }
}

/// The same line twice in a row within this many milliseconds is said once (a card that redraws must not stutter).
pub const REPEAT_MS: u64 = 2_000;
#[derive(Default)]
pub struct Last { text: String, at: u64 }
impl Last {
    pub fn should_say(&mut self, line: &str, now_ms: u64) -> bool {
        if self.text == line && now_ms.saturating_sub(self.at) < REPEAT_MS { return false; }
        self.text = line.to_string(); self.at = now_ms; true
    }
}

#[cfg(target_os = "macos")]
pub mod mac {
    use crate::voiceset::{self, Named, Sound, VoiceInfo};
    use objc2::rc::Retained;
    use objc2_avf_audio::{AVSpeechBoundary, AVSpeechSynthesisVoice, AVSpeechSynthesisVoiceTraits, AVSpeechSynthesizer, AVSpeechUtterance,
        AVSpeechUtteranceDefaultSpeechRate, AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceMinimumSpeechRate};
    use objc2_foundation::NSString;
    use std::cell::RefCell;

    thread_local! { static SYNTH: RefCell<Option<Retained<AVSpeechSynthesizer>>> = const { RefCell::new(None) }; }

    /// The Mac's installed voices (AVSpeechSynthesisVoice speechVoices), with novelty and personal voices marked so they
    /// are never listed or picked. Main thread only.
    pub fn voices() -> Vec<VoiceInfo> {
        let list = unsafe { AVSpeechSynthesisVoice::speechVoices() };
        list.iter().map(|v| unsafe {
            let traits = v.voiceTraits();
            VoiceInfo { id: v.identifier().to_string(), name: v.name().to_string(), lang: v.language().to_string(), quality: v.quality().0 as i64,
                novelty: traits.contains(AVSpeechSynthesisVoiceTraits::IsNoveltyVoice) || traits.contains(AVSpeechSynthesisVoiceTraits::IsPersonalVoice) }
        }).collect()
    }
    /// The Mac's own language for speech, for example "en-US".
    pub fn mac_language() -> String { unsafe { AVSpeechSynthesisVoice::currentLanguageCode() }.to_string() }

    /// Main thread only. Replaces whatever was being said. `voice`: the one picked in Settings (None: the Mac's own voice);
    /// a picked voice that is gone is replaced by the best one in its language (voiceset::pick_voice). `speed`: 0.5 to 1.5.
    pub fn say(line: &str, voice: Option<&Named>, speed: f64) {
        SYNTH.with(|s| {
            let mut s = s.borrow_mut();
            let synth = s.get_or_insert_with(|| unsafe { AVSpeechSynthesizer::new() });
            unsafe {
                synth.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate);
                let u = AVSpeechUtterance::speechUtteranceWithString(&NSString::from_str(line));
                if let Some(want) = voice {
                    let direct = AVSpeechSynthesisVoice::voiceWithIdentifier(&NSString::from_str(&want.id));
                    let v = direct.or_else(|| voiceset::pick_voice(Some(want), &voices()).id.and_then(|id| AVSpeechSynthesisVoice::voiceWithIdentifier(&NSString::from_str(&id))));
                    if let Some(v) = v { u.setVoice(Some(&v)); }
                }
                u.setRate(voiceset::rate_for(speed, AVSpeechUtteranceMinimumSpeechRate, AVSpeechUtteranceDefaultSpeechRate, AVSpeechUtteranceMaximumSpeechRate));
                synth.speakUtterance(&u);
            }
        });
    }
    /// Main thread only. Cuts off at once.
    pub fn silence() {
        SYNTH.with(|s| { if let Some(synth) = s.borrow().as_ref() { unsafe { synth.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate); } } });
    }

    // ---------- whether the Mac's sound is on ----------
    // Read from Core Audio (already part of every Mac app that plays sound): the default output device, whether it is
    // muted, and its volume. Nothing is changed, no permission is needed, and nothing is listened to.
    #[repr(C)]
    struct Address { selector: u32, scope: u32, element: u32 }
    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectHasProperty(object: u32, address: *const Address) -> u8;
        fn AudioObjectGetPropertyData(object: u32, address: *const Address, qualifier_size: u32, qualifier: *const std::ffi::c_void, size: *mut u32, data: *mut std::ffi::c_void) -> i32;
    }
    const fn code(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }
    const SYSTEM_OBJECT: u32 = 1;
    fn read<T: Copy + Default>(object: u32, selector: &[u8; 4], scope: &[u8; 4], element: u32) -> Option<T> {
        let a = Address { selector: code(selector), scope: code(scope), element };
        if unsafe { AudioObjectHasProperty(object, &a) } == 0 { return None; }
        let mut v = T::default();
        let mut size = std::mem::size_of::<T>() as u32;
        let st = unsafe { AudioObjectGetPropertyData(object, &a, 0, std::ptr::null(), &mut size, &mut v as *mut T as *mut std::ffi::c_void) };
        (st == 0 && size as usize == std::mem::size_of::<T>()).then_some(v)
    }
    /// The Mac's sound now. When Core Audio cannot say, it counts as on: it is never claimed off without a reading.
    pub fn sound_now() -> Sound {
        let Some(device) = read::<u32>(SYSTEM_OBJECT, b"dOut", b"glob", 0) else { return Sound::On };
        if device == 0 { return voiceset::sound(0, None, &[]); }
        let muted = read::<u32>(device, b"mute", b"outp", 0).map(|m| m != 0);
        let volumes: Vec<f32> = [0u32, 1, 2].iter().filter_map(|el| read::<f32>(device, b"volm", b"outp", *el)).collect();
        voiceset::sound(device, muted, &volumes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_words_are_said_as_they_are() {
        assert_eq!(prepare("Click Environment Variables in the sidebar.").unwrap(), "Click Environment Variables in the sidebar.");
    }
    #[test]
    fn markup_and_control_characters_never_reach_the_voice() {
        let l = prepare("Open <b>Settings</b>\u{7}\nnow").unwrap();
        assert!(!l.contains('<') && !l.contains('>') && !l.contains('\u{7}') && !l.contains('\n'), "{l}");
        assert!(l.contains("Settings") && l.contains("now"));
    }
    #[test]
    fn web_addresses_are_said_as_a_link_not_read_out() {
        assert_eq!(prepare("Open https://vercel.com/dashboard/project now").unwrap(), "Open a link now");
        assert_eq!(prepare("See www.example.com/x").unwrap(), "See a link");
    }
    #[test]
    fn empty_or_symbol_only_text_says_nothing() {
        for t in ["", "   ", "...", "!?", "\n\t"] { assert_eq!(prepare(t), None, "{t:?}"); }
    }
    #[test]
    fn anything_that_looks_secret_is_never_said() {
        assert_eq!(prepare("Your key is sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), None);
        assert_eq!(prepare("Card 4111 1111 1111 1111 is shown"), None);
    }
    #[test]
    fn long_text_is_cut_at_a_sentence_or_a_word_never_mid_word() {
        let s = "First we open the project settings page and look carefully. ".repeat(10);
        let l = prepare(&s).unwrap();
        assert!(l.chars().count() <= MAX_CHARS);
        assert!(l.ends_with('.'), "{l}");
        let nospace = format!("{} {}", "word ".repeat(70), "tail");
        let l2 = prepare(&nospace).unwrap();
        assert!(l2.chars().count() <= MAX_CHARS && l2.ends_with("word"), "{l2}");
    }
    #[test]
    fn a_very_long_single_word_is_still_cut_to_length() {
        let l = prepare(&"x".repeat(1000)).unwrap();
        assert!(l.chars().count() <= MAX_CHARS);
    }
    #[test]
    fn the_same_line_twice_quickly_is_said_once_but_again_later_or_when_different() {
        let mut g = Last::default();
        assert!(g.should_say("Hello there", 1000));
        assert!(!g.should_say("Hello there", 1500));
        assert!(g.should_say("Something else", 1600));
        assert!(g.should_say("Hello there", 1700));
        assert!(g.should_say("Hello there", 1700 + REPEAT_MS));
    }
    #[test]
    fn a_short_answer_to_a_spoken_question_is_said_whole_not_cut_to_one_line() {
        let answer = "Your sign up form sends the email to Supabase, but the table has no rule that lets new rows in. Add a rule that allows inserts for signed in people. Then press Check again and it should pass. Nothing else in the project needs to change for this.";
        assert!(answer.chars().count() > MAX_CHARS && answer.chars().count() <= REPLY_MAX_CHARS);
        assert_eq!(prepare_reply(answer, "The rest is on the card.").unwrap(), answer);
    }
    #[test]
    fn a_long_answer_is_said_up_to_a_sentence_then_points_to_the_card() {
        let long = "This sentence explains one more part of the answer in plain words. ".repeat(20);
        let l = prepare_reply(&long, "The rest is on the card.").unwrap();
        assert!(l.ends_with("words. The rest is on the card."), "{l}");
        assert!(l.chars().count() <= REPLY_MAX_CHARS + 1 + REST_MAX_CHARS);
        // The words for the rest are checked like everything else, and kept short.
        let odd = prepare_reply(&long, "<b>See</b> https://x.y/z").unwrap();
        assert!(!odd.contains('<') && !odd.contains("https"), "{odd}");
        let l2 = prepare_reply(&long, &"more ".repeat(100)).unwrap();
        assert!(l2.chars().count() <= REPLY_MAX_CHARS + 1 + REST_MAX_CHARS, "{}", l2.len());
    }
    #[test]
    fn a_reply_follows_every_rule_a_short_line_does() {
        assert_eq!(prepare_reply("", "x"), None);
        assert_eq!(prepare_reply("Your key is sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "x"), None);
        assert_eq!(prepare_reply("Open https://vercel.com/dashboard now.", "x").unwrap(), "Open a link now.");
        let l = prepare_reply("Open <b>Settings</b>\u{7}\nnow", "x").unwrap();
        assert!(!l.contains('<') && !l.contains('\u{7}') && !l.contains('\n'), "{l}");
    }
    #[test]
    fn multibyte_text_is_cut_safely() {
        let l = prepare(&"é".repeat(500)).unwrap();
        assert!(l.chars().count() <= MAX_CHARS);
    }
    // The speaker itself is not tested here: a test must never make a noise. It was written against the AVFAudio
    // bindings and is exercised by hand in the hands on session ("Speak to me" in Settings).
}
