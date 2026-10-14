//! Spoken replies: a short line said out loud with the Mac's built in voice. Off unless the person turned it on in
//! Settings. Nothing leaves the Mac (no voice service), nothing is said unprompted, Stop everything and closing the card
//! silence it, and it never reads out anything that looks like a secret. This file is the rules; the speaker itself is at
//! the bottom and is never run by the tests (a test must not make a noise).
use crate::redact::is_sensitive;

pub const MAX_CHARS: usize = 240;

/// The line to say, or None when nothing should be said. Plain text only: no markup, no web addresses read letter by
/// letter, nothing secret looking, a sensible length.
pub fn prepare(text: &str) -> Option<String> {
    let cleaned: String = text.chars().map(|c| if c.is_control() || c == '<' || c == '>' { ' ' } else { c }).collect();
    let words: Vec<String> = cleaned.split_whitespace().map(|w| {
        let lw = w.to_lowercase();
        if lw.starts_with("http://") || lw.starts_with("https://") || lw.starts_with("www.") { "a link".to_string() } else { w.to_string() }
    }).collect();
    let mut line = words.join(" ");
    if line.chars().filter(|c| c.is_alphanumeric()).count() < 2 { return None; }
    if is_sensitive(&line) { return None; }
    if line.chars().count() > MAX_CHARS {
        // Cut at a word, preferring the end of a sentence, never mid word.
        let head: String = line.chars().take(MAX_CHARS).collect();
        let cut = head.rfind(|c| c == '.' || c == '!' || c == '?').filter(|&i| i > MAX_CHARS / 3).map(|i| i + 1)
            .or_else(|| head.rfind(' ')).unwrap_or(head.len());
        line = head[..cut].trim_end_matches(|c: char| c == ',' || c == ';' || c.is_whitespace()).to_string();
    }
    Some(line)
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
    use objc2::rc::Retained;
    use objc2_avf_audio::{AVSpeechBoundary, AVSpeechSynthesizer, AVSpeechUtterance};
    use objc2_foundation::NSString;
    use std::cell::RefCell;

    thread_local! { static SYNTH: RefCell<Option<Retained<AVSpeechSynthesizer>>> = const { RefCell::new(None) }; }

    /// Main thread only. Replaces whatever was being said.
    pub fn say(line: &str) {
        SYNTH.with(|s| {
            let mut s = s.borrow_mut();
            let synth = s.get_or_insert_with(|| unsafe { AVSpeechSynthesizer::new() });
            unsafe {
                synth.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate);
                let u = AVSpeechUtterance::speechUtteranceWithString(&NSString::from_str(line));
                synth.speakUtterance(&u);
            }
        });
    }
    /// Main thread only. Cuts off at once.
    pub fn silence() {
        SYNTH.with(|s| { if let Some(synth) = s.borrow().as_ref() { unsafe { synth.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate); } } });
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
    fn multibyte_text_is_cut_safely() {
        let l = prepare(&"é".repeat(500)).unwrap();
        assert!(l.chars().count() <= MAX_CHARS);
    }
    // The speaker itself is not tested here: a test must never make a noise. It was written against the AVFAudio
    // bindings and is exercised by hand in the hands on session ("Speak to me" in Settings).
}
