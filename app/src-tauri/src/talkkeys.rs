//! Hold to talk keys (F18.3). Two keys held together while the person talks, let go to stop: Option and Space unless the
//! person picked another chord in Settings. The chord is a global shortcut (the Mac's hot key service reports it going
//! down and coming up), so nothing reads key events and nothing asks for Input Monitoring (rule 8).
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
//! cursor). Every chord here has exactly one modifier, so none of them can be one of Companion's own hotkeys (Control,
//! Option and Command with a letter) or the bare Esc a Prompt help result takes.
//!
//! Settings offers only the chords that are free on this Mac (`free`), but that check and the launch check both rely on
//! macOS refusing a chord another app holds, which it does only when that app asked for the keys alone. Alfred, Raycast
//! and ChatGPT use Option and Space by default, most likely without that, so the person may share the keys with them
//! without any notice. The words in Settings, the first run and INSTALL.md cover that case (T13 open item, launch blocker).
//!
//! The old four key chord (Control, Option, Command and V) is not kept as a second binding: nobody has used hold to talk
//! yet (F17), and a hotkey that no hint names would take a key from the person's other apps for nothing.

use serde_json::{json, Value};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

/// The one modifier held with the key. The names are the words a person reads.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mod { Option, Control }
/// The key held with it. Both are the same on every keyboard layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Key { Space, Return }

#[derive(Debug, PartialEq, Eq)]
pub struct Chord { pub id: &'static str, pub with: Mod, pub key: Key }

/// The chords a person can pick, the default first. The page names them in strings.ts (talkKeyNames); hotkeys.test.ts
/// checks those names against this list.
pub const CHOICES: &[Chord] = &[
    Chord { id: "option-space", with: Mod::Option, key: Key::Space },
    Chord { id: "option-return", with: Mod::Option, key: Key::Return },
    Chord { id: "control-return", with: Mod::Control, key: Key::Return },
];
pub const DEFAULT: &Chord = &CHOICES[0];

pub fn find(id: &str) -> Option<&'static Chord> { CHOICES.iter().find(|c| c.id == id) }
pub fn at(i: usize) -> Option<&'static Chord> { CHOICES.get(i) }
pub fn index(c: &Chord) -> usize { CHOICES.iter().position(|x| x == c).unwrap_or(0) }

/// "Option and Space": how every line names a chord.
pub fn label(c: &Chord) -> String {
    let m = match c.with { Mod::Option => "Option", Mod::Control => "Control" };
    let k = match c.key { Key::Space => "Space", Key::Return => "Return" };
    format!("{m} and {k}")
}

/// The global shortcut for a chord.
pub fn shortcut(c: &Chord) -> Shortcut {
    let m = match c.with { Mod::Option => Modifiers::ALT, Mod::Control => Modifiers::CONTROL };
    let k = match c.key { Key::Space => Code::Space, Key::Return => Code::Enter };
    Shortcut::new(Some(m), k)
}

/// The saved choice (`talk-keys.json` in Companion's own folder). No file, junk, or an id not on the list is the default.
pub fn parse(text: Option<&str>) -> &'static Chord {
    let v: Value = text.and_then(|t| serde_json::from_str(t).ok()).unwrap_or(Value::Null);
    v.get("holdToTalk").and_then(Value::as_str).and_then(find).unwrap_or(DEFAULT)
}
pub fn to_json(c: &Chord) -> Value { json!({ "holdToTalk": c.id }) }

/// What the page is told: the chord registered now (none when another app holds it), the one the person picked, and the list.
pub fn state_json(using: Option<&Chord>, picked: &Chord, free: &[&Chord]) -> Value {
    json!({
        "using": using.map(|c| c.id), "picked": picked.id,
        "choices": CHOICES.iter().map(|c| c.id).collect::<Vec<_>>(),
        "free": free.iter().map(|c| c.id).collect::<Vec<_>>(),
    })
}

/// Settings: the chords on the list a person can pick on this Mac now (F18.3, "chords that are free on this Mac"). The
/// chord in use is Companion's own, so it is free and never touched. Every other chord is registered and let go again
/// at once; one macOS refuses is held by another app. This is only as good as macOS refusing: an app that registered the
/// keys without asking for them alone does not make the registration fail, so a chord shown free may still be shared
/// with that app (T13 open item, a launch blocker).
pub fn free(
    using: Option<&'static Chord>,
    mut register: impl FnMut(&'static Chord) -> bool,
    mut unregister: impl FnMut(&'static Chord),
) -> Vec<&'static Chord> {
    CHOICES.iter().filter(|c| {
        if using == Some(*c) { return true; }
        if !register(c) { return false; }
        unregister(c);
        true
    }).collect()
}

/// How hold to talk started at launch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Started {
    /// The chord the person picked (the default until they pick) is registered.
    Ready(&'static Chord),
    /// Another app holds the chord the person picked, so the default is used for now. The choice stays saved.
    FellBack { picked: &'static Chord, using: &'static Chord },
    /// Another app holds the chord the person expects (and the default too), so hold to talk is off until they pick.
    Taken(&'static Chord),
}
impl Started {
    pub fn using(&self) -> Option<&'static Chord> {
        match self { Started::Ready(c) => Some(c), Started::FellBack { using, .. } => Some(using), Started::Taken(_) => None }
    }
    pub fn picked(&self) -> &'static Chord {
        match self { Started::Ready(c) | Started::Taken(c) => c, Started::FellBack { picked, .. } => picked }
    }
}

/// At launch: try the saved chord; if another app holds it, the default. Nothing else is tried behind the person's back.
pub fn start(saved: &'static Chord, mut register: impl FnMut(&'static Chord) -> bool) -> Started {
    if register(saved) { return Started::Ready(saved); }
    if saved != DEFAULT && register(DEFAULT) { return Started::FellBack { picked: saved, using: DEFAULT }; }
    Started::Taken(saved)
}

const WHERE_TO_PICK: &str = "in Settings, under Keys to remember";

/// The one notice at launch, from the other jobs whose keys another app holds and how hold to talk started. The old
/// words ("You can still use the buttons") are only for the jobs that have buttons; hold to talk has none, so its own line
/// says what to do instead.
pub fn launch_notice(other_taken: &[&str], talk: &Started) -> Option<String> {
    let mut out: Vec<String> = vec![];
    if !other_taken.is_empty() {
        out.push(format!("Another app is already using the keys for: {}. Those shortcuts will not work until it lets go of them. You can still use the buttons.", other_taken.join(", ")));
    }
    match talk {
        Started::Ready(_) => {}
        Started::Taken(c) => out.push(format!("Another app is already using {}, so hold to talk is off. Pick other keys {WHERE_TO_PICK}.", label(c))),
        Started::FellBack { picked, using } => out.push(format!("Another app is already using the keys you picked for hold to talk ({}), so hold to talk uses {} for now. You can pick other keys {WHERE_TO_PICK}.", label(picked), label(using))),
    }
    if out.is_empty() { None } else { Some(out.join(" ")) }
}

/// What the line says when the speech model is ready.
pub fn ready_words(using: Option<&Chord>) -> String {
    match using {
        Some(c) => format!("The speech model is ready. Hold {} to talk.", label(c)),
        None => format!("The speech model is ready. To talk, pick free keys {WHERE_TO_PICK}."),
    }
}

/// Why a change in Settings did not happen. The page turns the code into words (settings.ts, talkProblem).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Problem { Taken, NotSaved }
impl Problem { pub fn code(&self) -> &'static str { match self { Problem::Taken => "taken", Problem::NotSaved => "not_saved" } } }

/// Settings: use `wanted` from now on. The new chord is registered before the old one is let go, so there is never a
/// moment with neither, and a chord another app holds leaves everything as it was. Saved only once it works; if saving
/// fails, the new chord is let go again and the old one stays.
pub fn switch(
    current: Option<&'static Chord>,
    wanted: &'static Chord,
    register: impl FnOnce(&'static Chord) -> bool,
    save: impl FnOnce(&'static Chord) -> bool,
    mut unregister: impl FnMut(&'static Chord),
) -> Result<&'static Chord, Problem> {
    if current == Some(wanted) { return if save(wanted) { Ok(wanted) } else { Err(Problem::NotSaved) }; }
    if !register(wanted) { return Err(Problem::Taken); }
    if !save(wanted) { unregister(wanted); return Err(Problem::NotSaved); }
    if let Some(old) = current { unregister(old); }
    Ok(wanted)
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
    use std::cell::RefCell;

    fn by(id: &str) -> &'static Chord { CHOICES.iter().find(|c| c.id == id).unwrap() }

    #[test]
    fn the_default_is_option_and_space() {
        assert_eq!(DEFAULT.id, "option-space");
        assert_eq!(label(DEFAULT), "Option and Space");
        assert_eq!(shortcut(DEFAULT), Shortcut::new(Some(Modifiers::ALT), Code::Space));
    }
    #[test]
    fn each_choice_has_its_own_name_and_keys() {
        assert_eq!(label(by("option-return")), "Option and Return");
        assert_eq!(shortcut(by("option-return")), Shortcut::new(Some(Modifiers::ALT), Code::Enter));
        assert_eq!(label(by("control-return")), "Control and Return");
        assert_eq!(shortcut(by("control-return")), Shortcut::new(Some(Modifiers::CONTROL), Code::Enter));
        let ids: std::collections::HashSet<_> = CHOICES.iter().map(|c| c.id).collect();
        let keys: std::collections::HashSet<_> = CHOICES.iter().map(|c| shortcut(c).id()).collect();
        assert_eq!(ids.len(), CHOICES.len()); assert_eq!(keys.len(), CHOICES.len());
        for (i, c) in CHOICES.iter().enumerate() { assert_eq!(find(c.id), Some(c)); assert_eq!(at(i), Some(c)); assert_eq!(index(c), i); }
        assert_eq!(find("control-space"), None); assert_eq!(find(""), None); assert_eq!(at(CHOICES.len()), None); assert_eq!(at(usize::MAX), None);
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
            assert!(one_mod.iter().any(|m| s == Shortcut::new(Some(*m), s.key)), "{} has exactly one modifier", c.id);
            assert!(matches!(s.key, Code::Space | Code::Enter), "{} uses a key that is the same on every keyboard", c.id);
            assert!(!left_out_on_purpose.contains(&s), "{} was left out on purpose", c.id);
            // Companion's own hotkeys are Control, Option and Command with a letter, and the bare Esc: none has one modifier.
            assert_ne!(s, Shortcut::new(None, Code::Escape));
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
        for c in CHOICES.iter().filter(|c| *c != DEFAULT) {
            assert!(gives_up.iter().any(|(s, _)| *s == shortcut(c)), "{} must say what it gives up", c.id);
        }
        assert_eq!(gives_up.len(), CHOICES.len() - 1);
    }
    #[test]
    fn the_saved_choice_reads_back_and_anything_else_is_the_default() {
        assert_eq!(parse(None), DEFAULT);
        for junk in ["", "not json", "[]", "7", "{}", "{\"holdToTalk\":7}", "{\"holdToTalk\":\"control-space\"}", "{\"holdToTalk\":\"OPTION-RETURN\"}"] { assert_eq!(parse(Some(junk)), DEFAULT, "{junk:?}"); }
        assert_eq!(parse(Some("{\"holdToTalk\":\"control-return\"}")), by("control-return"));
        for c in CHOICES { assert_eq!(parse(Some(&to_json(c).to_string())), c); }
    }
    #[test]
    fn the_page_is_told_what_is_registered_what_was_picked_the_list_and_what_is_free() {
        let v = state_json(Some(DEFAULT), by("option-return"), &[DEFAULT, by("control-return")]);
        assert_eq!(v, json!({ "using": "option-space", "picked": "option-return", "choices": ["option-space", "option-return", "control-return"], "free": ["option-space", "control-return"] }));
        let off = state_json(None, DEFAULT, &[]);
        assert_eq!(off["using"], Value::Null); assert_eq!(off["free"], json!([]));
    }

    /// Records every register and unregister the free check makes, in order; `held_elsewhere` are refused.
    fn check_free(using: Option<&'static Chord>, held_elsewhere: &[&str]) -> (Vec<&'static str>, Vec<String>) {
        let log = RefCell::new(vec![]);
        let busy: Vec<&str> = held_elsewhere.to_vec();
        let free = free(using,
            |c| { log.borrow_mut().push(format!("register {}", c.id)); !busy.contains(&c.id) },
            |c| log.borrow_mut().push(format!("unregister {}", c.id)));
        (free.iter().map(|c| c.id).collect(), log.into_inner())
    }
    #[test]
    fn settings_tries_each_chord_not_in_use_and_lets_it_go_at_once() {
        let (free, log) = check_free(Some(DEFAULT), &[]);
        assert_eq!(free, ["option-space", "option-return", "control-return"]);
        assert_eq!(log, ["register option-return", "unregister option-return", "register control-return", "unregister control-return"],
            "the keys in use are never touched, and every chord tried is let go before the next");
    }
    #[test]
    fn a_chord_another_app_holds_is_not_free_and_nothing_is_let_go_for_it() {
        let (free, log) = check_free(Some(DEFAULT), &["option-return"]);
        assert_eq!(free, ["option-space", "control-return"]);
        assert_eq!(log, ["register option-return", "register control-return", "unregister control-return"]);
    }
    #[test]
    fn with_hold_to_talk_off_the_default_another_app_holds_is_not_offered_as_free() {
        // Launch found Option and Space taken (Started::Taken), so Settings must not offer it as a button that can only fail.
        let (free, log) = check_free(None, &["option-space"]);
        assert_eq!(free, ["option-return", "control-return"]);
        assert_eq!(log, ["register option-space", "register option-return", "unregister option-return", "register control-return", "unregister control-return"]);
        let (none, _) = check_free(None, &["option-space", "option-return", "control-return"]);
        assert!(none.is_empty());
    }

    /// A fake hot key service: which chords another app holds, and every chord we asked for, in order.
    fn service(held_elsewhere: &[&str]) -> (Vec<&'static str>, RefCell<Vec<&'static str>>) {
        (held_elsewhere.iter().map(|id| by(id).id).collect(), RefCell::new(vec![]))
    }

    #[test]
    fn at_launch_the_default_is_used_when_it_is_free() {
        let (busy, asked) = service(&[]);
        let s = start(DEFAULT, |c| { asked.borrow_mut().push(c.id); !busy.contains(&c.id) });
        assert_eq!(s, Started::Ready(DEFAULT)); assert_eq!(s.using(), Some(DEFAULT)); assert_eq!(s.picked(), DEFAULT);
        assert_eq!(*asked.borrow(), ["option-space"]);
    }
    #[test]
    fn at_launch_a_taken_default_turns_hold_to_talk_off_and_nothing_else_is_tried_behind_the_persons_back() {
        let (busy, asked) = service(&["option-space"]);
        let s = start(DEFAULT, |c| { asked.borrow_mut().push(c.id); !busy.contains(&c.id) });
        assert_eq!(s, Started::Taken(DEFAULT)); assert_eq!(s.using(), None);
        assert_eq!(*asked.borrow(), ["option-space"]);
    }
    #[test]
    fn at_launch_the_saved_choice_is_used_and_the_default_is_not_taken_from_other_apps() {
        let (busy, asked) = service(&[]);
        let s = start(by("option-return"), |c| { asked.borrow_mut().push(c.id); !busy.contains(&c.id) });
        assert_eq!(s, Started::Ready(by("option-return")));
        assert_eq!(*asked.borrow(), ["option-return"]);
    }
    #[test]
    fn at_launch_a_saved_choice_another_app_now_holds_falls_back_to_the_default_and_stays_saved() {
        let (busy, asked) = service(&["option-return"]);
        let s = start(by("option-return"), |c| { asked.borrow_mut().push(c.id); !busy.contains(&c.id) });
        assert_eq!(s, Started::FellBack { picked: by("option-return"), using: DEFAULT });
        assert_eq!(s.using(), Some(DEFAULT)); assert_eq!(s.picked(), by("option-return"));
        assert_eq!(*asked.borrow(), ["option-return", "option-space"]);
    }
    #[test]
    fn at_launch_when_both_are_held_elsewhere_hold_to_talk_is_off_and_names_the_persons_choice() {
        let (busy, asked) = service(&["option-return", "option-space"]);
        let s = start(by("option-return"), |c| { asked.borrow_mut().push(c.id); !busy.contains(&c.id) });
        assert_eq!(s, Started::Taken(by("option-return"))); assert_eq!(s.using(), None); assert_eq!(s.picked(), by("option-return"));
        assert_eq!(*asked.borrow(), ["option-return", "option-space"]);
    }

    #[test]
    fn the_launch_notice_keeps_its_old_words_for_other_keys_and_says_what_to_do_for_hold_to_talk() {
        let ready = Started::Ready(DEFAULT);
        assert_eq!(launch_notice(&[], &ready), None);
        assert_eq!(launch_notice(&["Prompt help", "Show me how"], &ready).unwrap(),
            "Another app is already using the keys for: Prompt help, Show me how. Those shortcuts will not work until it lets go of them. You can still use the buttons.");
        // Hold to talk has no button, so when it is the only one taken the notice is one line and never mentions buttons.
        let talk_only = launch_notice(&[], &Started::Taken(DEFAULT)).unwrap();
        assert_eq!(talk_only, "Another app is already using Option and Space, so hold to talk is off. Pick other keys in Settings, under Keys to remember.");
        assert!(!talk_only.contains("button"));
        let both = launch_notice(&["Prompt help"], &Started::Taken(by("control-return"))).unwrap();
        assert_eq!(both, "Another app is already using the keys for: Prompt help. Those shortcuts will not work until it lets go of them. You can still use the buttons. Another app is already using Control and Return, so hold to talk is off. Pick other keys in Settings, under Keys to remember.");
        let fell = launch_notice(&[], &Started::FellBack { picked: by("option-return"), using: DEFAULT }).unwrap();
        assert_eq!(fell, "Another app is already using the keys you picked for hold to talk (Option and Return), so hold to talk uses Option and Space for now. You can pick other keys in Settings, under Keys to remember.");
        let fell_and_more = launch_notice(&["Prompt help"], &Started::FellBack { picked: by("option-return"), using: DEFAULT }).unwrap();
        assert!(fell_and_more.starts_with("Another app is already using the keys for: Prompt help.") && fell_and_more.ends_with(&fell), "{fell_and_more}");
        for n in [both, fell_and_more] { assert!(!n.contains('—'), "no em dashes"); }
    }
    #[test]
    fn the_model_ready_line_names_the_keys_in_use_or_where_to_pick_them() {
        assert_eq!(ready_words(Some(DEFAULT)), "The speech model is ready. Hold Option and Space to talk.");
        assert_eq!(ready_words(Some(by("control-return"))), "The speech model is ready. Hold Control and Return to talk.");
        assert_eq!(ready_words(None), "The speech model is ready. To talk, pick free keys in Settings, under Keys to remember.");
    }

    /// Records every call the switch makes, in order.
    fn calls() -> RefCell<Vec<String>> { RefCell::new(vec![]) }

    #[test]
    fn switching_registers_the_new_keys_saves_them_then_lets_the_old_ones_go() {
        let log = calls();
        let r = switch(Some(DEFAULT), by("option-return"),
            |c| { log.borrow_mut().push(format!("register {}", c.id)); true },
            |c| { log.borrow_mut().push(format!("save {}", c.id)); true },
            |c| log.borrow_mut().push(format!("unregister {}", c.id)));
        assert_eq!(r, Ok(by("option-return")));
        assert_eq!(*log.borrow(), ["register option-return", "save option-return", "unregister option-space"]);
    }
    #[test]
    fn keys_another_app_holds_change_nothing_and_are_not_saved() {
        let log = calls();
        let r = switch(Some(DEFAULT), by("control-return"),
            |c| { log.borrow_mut().push(format!("register {}", c.id)); false },
            |c| { log.borrow_mut().push(format!("save {}", c.id)); true },
            |c| log.borrow_mut().push(format!("unregister {}", c.id)));
        assert_eq!(r, Err(Problem::Taken)); assert_eq!(Problem::Taken.code(), "taken");
        assert_eq!(*log.borrow(), ["register control-return"], "the old keys keep working");
    }
    #[test]
    fn if_the_choice_cannot_be_saved_the_new_keys_are_let_go_and_the_old_ones_stay() {
        let log = calls();
        let r = switch(Some(DEFAULT), by("option-return"),
            |c| { log.borrow_mut().push(format!("register {}", c.id)); true },
            |c| { log.borrow_mut().push(format!("save {}", c.id)); false },
            |c| log.borrow_mut().push(format!("unregister {}", c.id)));
        assert_eq!(r, Err(Problem::NotSaved)); assert_eq!(Problem::NotSaved.code(), "not_saved");
        assert_eq!(*log.borrow(), ["register option-return", "save option-return", "unregister option-return"]);
    }
    #[test]
    fn picking_the_keys_already_in_use_only_saves_them() {
        // For example after a fall back: the person keeps Option and Space, and the choice that failed is forgotten.
        let log = calls();
        let r = switch(Some(DEFAULT), DEFAULT,
            |c| { log.borrow_mut().push(format!("register {}", c.id)); true },
            |c| { log.borrow_mut().push(format!("save {}", c.id)); true },
            |c| log.borrow_mut().push(format!("unregister {}", c.id)));
        assert_eq!(r, Ok(DEFAULT)); assert_eq!(*log.borrow(), ["save option-space"]);
        let failed = switch(Some(DEFAULT), DEFAULT, |_| true, |_| false, |_| {});
        assert_eq!(failed, Err(Problem::NotSaved));
    }
    #[test]
    fn with_hold_to_talk_off_a_free_choice_turns_it_on_with_nothing_to_let_go() {
        let log = calls();
        let r = switch(None, by("control-return"),
            |c| { log.borrow_mut().push(format!("register {}", c.id)); true },
            |c| { log.borrow_mut().push(format!("save {}", c.id)); true },
            |c| log.borrow_mut().push(format!("unregister {}", c.id)));
        assert_eq!(r, Ok(by("control-return"))); assert_eq!(*log.borrow(), ["register control-return", "save control-return"]);
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
