//! Hold to talk keys (F18.3). Two keys held together while the person talks, let go to stop: Option and Space unless the
//! person picked another chord in Settings. The chord is a global shortcut (the Mac's hot key service reports it going
//! down and coming up), so nothing reads key events and nothing asks for Input Monitoring (rule 8). Since M11 wave 4 hold
//! to talk is one job in the key map with every other hotkey (keymap.rs: where the choice is kept, how it starts at
//! launch, the free check, changing it); this file keeps what is only hold to talk's: its list, key repeats, its line.
//!
//! No two key chord is unused on a Mac, so every chord here gives something up while it is hold to talk. Option and
//! Space types a non breaking space on many keyboards (rarely typed on purpose). The two others are macOS's own text keys
//! (AppKit's StandardKeyBinding.dict): Option and Return adds a new line that does not send, in Messages and many other
//! text boxes, and Control and Return adds a line break. The picker says so beside each one (strings.ts talkKeyCosts).
//!
//! The list is short on purpose. It leaves out the chords whose loss would hurt more: Control and Space (switches the
//! keyboard language), Command and Space (Spotlight), Command and Backquote (the next window of an app), Command, Control
//! or Option with Tab (switching apps, tabs and windows), Control and Backquote (the terminal in Cursor and VS Code),
//! Option and Backquote (types accents such as à on a US keyboard, and the key has another label on other keyboards),
//! Option and Escape (Speak selection), Command and Return (sends in many apps), Shift with anything (pressed by accident
//! while typing), and every letter, digit or symbol (Option with them types characters, Control with them moves the
//! cursor). Every chord here has exactly one modifier, so none of them can be one of the other jobs' keys (three or four
//! modifiers with a letter, keymap.rs) or the bare Esc a Prompt help result takes.
//!
//! Settings offers only the chords that are free on this Mac (`keymap::free`), but that check and the launch check both
//! rely on macOS refusing a chord another app holds, which it does only when that app asked for the keys alone. Alfred,
//! Raycast and ChatGPT use Option and Space by default, most likely without that, so the person may share the keys with
//! them without any notice. The words in Settings, the first run and INSTALL.md cover that case (T13 open item, launch
//! blocker).
//!
//! The old four key chord (Control, Option, Command and V) is not kept as a second binding: nobody has used hold to talk
//! yet (F17), and a hotkey that no hint names would take a key from the person's other apps for nothing.

use crate::keymap::{label, Chord, Key, CONTROL, OPTION, WHERE_TO_PICK};

/// The chords a person can pick, the default first. hotkeys.test.ts reads this list; the page names each chord with
/// the same words keymap::label builds.
pub const CHOICES: [Chord; 3] = [
    Chord::new(OPTION, Key::Space),
    Chord::new(OPTION, Key::Return),
    Chord::new(CONTROL, Key::Return),
];
/// The default, first on the list. The key map's own table (keymap::DEFAULTS) is the one used; the tests check they agree.
#[cfg(test)]
pub const DEFAULT: Chord = CHOICES[0];

/// What the line says when the speech model is ready.
pub fn ready_words(using: Option<Chord>) -> String {
    match using {
        Some(c) => format!("The speech model is ready. Hold {} to talk.", label(c)),
        None => format!("The speech model is ready. To talk, pick free keys {WHERE_TO_PICK}."),
    }
}

/// The Mac may send the press again while the keys are held (key repeat). Only the first press of a hold counts, and only
/// a let go that ends one. If a let go never arrives (it can be lost), a press long after the last one counts as new, so
/// hold to talk can never get stuck; the microphone itself is closed after a minute whatever happens (voice.rs).
#[derive(Debug)]
pub struct Held { down: bool, last_ms: u64 }
/// Longer than the slowest key repeat macOS offers (about 2 seconds between repeats).
pub const REPEAT_GAP_MS: u64 = 2_500;
impl Held {
    pub const fn new() -> Held { Held { down: false, last_ms: 0 } }
    /// True for a new press, false for a repeat while held.
    pub fn press(&mut self, now_ms: u64) -> bool {
        let repeat = self.down && now_ms.saturating_sub(self.last_ms) < REPEAT_GAP_MS;
        self.down = true; self.last_ms = now_ms;
        !repeat
    }
    /// True when this let go ends a press.
    pub fn release(&mut self) -> bool { std::mem::replace(&mut self.down, false) }
    /// The chord changed or everything stopped: the next press is new.
    pub fn reset(&mut self) { self.down = false; }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keymap::{self, shortcut, Action};
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    #[test]
    fn the_default_is_option_and_space_and_the_key_map_uses_this_list() {
        assert_eq!(keymap::id(DEFAULT), "option-space");
        assert_eq!(label(DEFAULT), "Option and Space");
        assert_eq!(shortcut(DEFAULT), Shortcut::new(Some(Modifiers::ALT), Code::Space));
        assert_eq!(keymap::default(Action::Talk), DEFAULT);
        assert_eq!(keymap::choices(Action::Talk), CHOICES.to_vec());
    }
    #[test]
    fn each_choice_has_its_own_name_and_keys() {
        assert_eq!(label(CHOICES[1]), "Option and Return");
        assert_eq!(shortcut(CHOICES[1]), Shortcut::new(Some(Modifiers::ALT), Code::Enter));
        assert_eq!(label(CHOICES[2]), "Control and Return");
        assert_eq!(shortcut(CHOICES[2]), Shortcut::new(Some(Modifiers::CONTROL), Code::Enter));
        assert_eq!(keymap::id(CHOICES[1]), "option-return"); assert_eq!(keymap::id(CHOICES[2]), "control-return");
        let keys: std::collections::HashSet<_> = CHOICES.iter().map(|c| shortcut(*c).id()).collect();
        assert_eq!(keys.len(), CHOICES.len());
    }
    #[test]
    fn every_choice_is_two_keys_and_none_is_one_left_out_on_purpose() {
        let one_mod = [Modifiers::ALT, Modifiers::CONTROL];
        let left_out_on_purpose = [
            Shortcut::new(Some(Modifiers::CONTROL), Code::Space),    // switch keyboard language
            Shortcut::new(Some(Modifiers::SUPER), Code::Space),      // Spotlight
            Shortcut::new(Some(Modifiers::SUPER), Code::Backquote),  // next window of the app
            Shortcut::new(Some(Modifiers::CONTROL), Code::Backquote), // the terminal in Cursor and VS Code
            Shortcut::new(Some(Modifiers::ALT), Code::Backquote),    // the accent key on a US keyboard
            Shortcut::new(Some(Modifiers::SUPER), Code::Tab), Shortcut::new(Some(Modifiers::CONTROL), Code::Tab), Shortcut::new(Some(Modifiers::ALT), Code::Tab),
            Shortcut::new(Some(Modifiers::ALT), Code::Escape),       // Speak selection
            Shortcut::new(Some(Modifiers::SUPER), Code::Enter),      // sends in many apps
            Shortcut::new(Some(Modifiers::SHIFT), Code::Space), Shortcut::new(Some(Modifiers::SHIFT), Code::Enter),
        ];
        for c in CHOICES {
            let s = shortcut(c);
            assert!(one_mod.iter().any(|m| s == Shortcut::new(Some(*m), s.key)), "{} has exactly one modifier", keymap::id(c));
            assert!(matches!(s.key, Code::Space | Code::Enter), "{} uses a key that is the same on every keyboard", keymap::id(c));
            assert!(!left_out_on_purpose.contains(&s), "{} was left out on purpose", keymap::id(c));
            // The other jobs' keys are three or four modifiers with a letter, and the bare Esc: none has one modifier.
            assert_ne!(s, Shortcut::new(None, Code::Escape));
            for a in keymap::ACTIONS { if a != Action::Talk { assert!(!keymap::choices(a).contains(&c)); } }
        }
    }
    #[test]
    fn every_other_choice_gives_up_a_macos_text_key_and_the_picker_must_say_which() {
        // macOS's own text keys (AppKit's StandardKeyBinding.dict) use both Return chords in every text box: Option and Return
        // is insertNewlineIgnoringFieldEditor (a new line that does not send, in Messages and many other apps) and Control and
        // Return is insertLineBreak. While a chord is hold to talk it does that nowhere. A chord added to the list must be put
        // here with what it gives up, and strings.ts (talkKeyCosts) must say it beside the button; hotkeys.test.ts checks that.
        let gives_up = [
            (Shortcut::new(Some(Modifiers::ALT), Code::Enter), "insertNewlineIgnoringFieldEditor"),
            (Shortcut::new(Some(Modifiers::CONTROL), Code::Enter), "insertLineBreak"),
        ];
        for c in CHOICES.iter().filter(|c| **c != DEFAULT) {
            assert!(gives_up.iter().any(|(s, _)| *s == shortcut(*c)), "{} must say what it gives up", keymap::id(*c));
        }
        assert_eq!(gives_up.len(), CHOICES.len() - 1);
    }
    #[test]
    fn the_model_ready_line_names_the_keys_in_use_or_where_to_pick_them() {
        assert_eq!(ready_words(Some(DEFAULT)), "The speech model is ready. Hold Option and Space to talk.");
        assert_eq!(ready_words(Some(CHOICES[2])), "The speech model is ready. Hold Control and Return to talk.");
        assert_eq!(ready_words(None), "The speech model is ready. To talk, pick free keys in Settings, under Keys to remember.");
    }

    #[test]
    fn a_hold_is_one_press_and_one_let_go_and_key_repeats_restart_nothing() {
        let mut h = Held::new();
        assert!(h.press(1_000));
        for t in (1_030..3_000).step_by(33) { assert!(!h.press(t), "repeat at {t}"); }
        assert!(h.release());
        assert!(!h.release(), "a second let go ends nothing");
        assert!(h.press(3_100), "the next hold is new");
    }
    #[test]
    fn the_slowest_key_repeat_still_counts_as_a_repeat() {
        let mut h = Held::new();
        assert!(h.press(0));
        for t in [1_800, 3_600, 5_400, 7_200] { assert!(!h.press(t), "repeat at {t}"); }
    }
    #[test]
    fn a_let_go_with_no_press_does_nothing() { assert!(!Held::new().release()); }
    #[test]
    fn a_lost_let_go_never_leaves_hold_to_talk_stuck() {
        let mut h = Held::new();
        assert!(h.press(0));
        assert!(h.press(REPEAT_GAP_MS + 1), "a press long after the last one is a new hold");
        let mut r = Held::new(); r.press(0); r.reset(); assert!(r.press(10), "after a reset the next press is new");
    }
}
