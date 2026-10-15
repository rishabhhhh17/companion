//! The safety rules for Prompt help, as plain tested logic. Nothing here touches the screen or another app:
//! the real Accessibility read and the paste come in M5b and must go through these rules.
//!
//! Rules from the project: a read happens only on the hotkey, only after the "reading your text" indicator is lit,
//! never in a password field or a never-read app, only for an app the person allowed, and no text is ever logged.

use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

// ---------- apps that are never read ----------

const BUILT_IN_NEVER: &[&str] = &[
    "com.1password.1password", "com.agilebits.onepassword7", "com.agilebits.onepassword-osx", "com.bitwarden.desktop",
    "com.lastpass.lastpass", "com.dashlane.dashlane", "org.keepassxc.keepassxc", "com.apple.keychainaccess", "com.apple.Passwords",
    "com.nordsec.nordpass", "com.enpass.Enpass", "in.sinew.Enpass-Desktop", "com.apple.systempreferences", "com.apple.SecurityAgent",
];

#[derive(Default, Clone)]
pub struct Denylist { user: BTreeSet<String> }
impl Denylist {
    pub const fn empty() -> Denylist { Denylist { user: BTreeSet::new() } }
    #[cfg(test)]
    pub fn add(&mut self, bundle_id: &str) { if !bundle_id.is_empty() { self.user.insert(bundle_id.to_string()); } }
    #[cfg(test)]
    pub fn remove(&mut self, bundle_id: &str) { self.user.remove(bundle_id); }
    pub fn contains(&self, bundle_id: &str) -> bool { BUILT_IN_NEVER.contains(&bundle_id) || self.user.contains(bundle_id) }
    /// The built in apps cannot be removed from the list, only the ones the person added.
    #[cfg(test)]
    pub fn user_apps(&self) -> Vec<String> { self.user.iter().cloned().collect() }
}

// ---------- asking once per app ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Choice { Once, Always, Never }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision { Allow, Ask, Refuse }

#[derive(Default)]
pub struct Consent { map: BTreeMap<String, Choice> }
impl Consent {
    /// Asks what to do for this app right now. "Once" is used up by being used.
    pub fn decide(&mut self, bundle_id: &str) -> Decision {
        match self.map.get(bundle_id).copied() {
            None => Decision::Ask,
            Some(Choice::Always) => Decision::Allow,
            Some(Choice::Never) => Decision::Refuse,
            Some(Choice::Once) => { self.map.remove(bundle_id); Decision::Allow }
        }
    }
    pub fn record(&mut self, bundle_id: &str, c: Choice) { if !bundle_id.is_empty() { self.map.insert(bundle_id.to_string(), c); } }
    #[cfg(test)]
    pub fn forget(&mut self, bundle_id: &str) { self.map.remove(bundle_id); }
    /// Only "always" and "never" are kept on disk. "Once" never survives a restart.
    pub fn to_json(&self) -> Value {
        let m: BTreeMap<&String, &str> = self.map.iter().filter_map(|(k, v)| match v { Choice::Always => Some((k, "always")), Choice::Never => Some((k, "never")), Choice::Once => None }).collect();
        json!({ "apps": m })
    }
    pub fn from_json(v: &Value) -> Consent {
        let mut c = Consent::default();
        if let Some(o) = v.get("apps").and_then(Value::as_object) {
            for (k, val) in o {
                match val.as_str() { Some("always") => c.record(k, Choice::Always), Some("never") => c.record(k, Choice::Never), _ => {} }
            }
        }
        c
    }
}

// ---------- may we read this field? ----------

#[derive(Debug, PartialEq, Eq)]
pub enum ReadVerdict { Ok, NeedConsent, RefuseSecureField, RefuseSecureInput, RefuseNeverApp, RefusedByYou }

impl ReadVerdict {
    pub fn plain(&self) -> &'static str {
        match self {
            ReadVerdict::Ok => "",
            ReadVerdict::NeedConsent => "Allow Prompt help to read the text box in this app?",
            ReadVerdict::RefuseSecureField => "This looks like a password box, so I did not read it.",
            ReadVerdict::RefuseSecureInput => "Your Mac is protecting what you type right now, so I did not read it.",
            ReadVerdict::RefuseNeverApp => "I never read this kind of app.",
            ReadVerdict::RefusedByYou => "You told me not to read in this app.",
        }
    }
}

/// `role` and `subrole` are the Accessibility names of the focused field.
pub fn read_verdict(role: &str, subrole: &str, secure_input_on: bool, bundle_id: &str, deny: &Denylist, consent: &mut Consent) -> ReadVerdict {
    // The strictest refusals come first and never reach the question about consent.
    if deny.contains(bundle_id) { return ReadVerdict::RefuseNeverApp; }
    if role == "AXSecureTextField" || subrole == "AXSecureTextField" { return ReadVerdict::RefuseSecureField; }
    if secure_input_on { return ReadVerdict::RefuseSecureInput; }
    match consent.decide(bundle_id) { Decision::Allow => ReadVerdict::Ok, Decision::Ask => ReadVerdict::NeedConsent, Decision::Refuse => ReadVerdict::RefusedByYou }
}

// ---------- the indicator comes first ----------

#[derive(Default)]
pub struct ReadSession { lit: bool, read_done: bool }
impl ReadSession {
    pub fn indicator_on(&mut self) { self.lit = true; }
    /// The text may be read only after the indicator is lit, and only once per hotkey press.
    pub fn begin_read(&mut self) -> Result<(), &'static str> {
        if !self.lit { return Err("the indicator must be lit before any text is read"); }
        if self.read_done { return Err("one hotkey press reads once"); }
        self.read_done = true; Ok(())
    }
    pub fn finish(&mut self) { *self = ReadSession::default(); }
}

// ---------- putting the answer back ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Focus { pub pid: i32, pub element: u64 }

#[derive(Debug, PartialEq, Eq)]
pub enum PasteVerdict { Paste, CopyOnly(&'static str) }

pub fn paste_plan(at_read: Focus, now: Focus, handback_copy: bool, card_is_key: bool) -> PasteVerdict {
    if handback_copy { return PasteVerdict::CopyOnly("Copied. Press Cmd+V where you want it."); }
    if card_is_key { return PasteVerdict::CopyOnly("I copied it instead of pasting, so nothing lands in the wrong place. Press Cmd+V where you want it."); }
    if at_read.pid != now.pid { return PasteVerdict::CopyOnly("You moved to another app, so I copied the improved prompt instead. Press Cmd+V where you want it."); }
    if at_read.element != now.element { return PasteVerdict::CopyOnly("You moved to another box, so I copied the improved prompt instead. Press Cmd+V where you want it."); }
    PasteVerdict::Paste
}

/// Whether macOS lets Companion read the clipboard without showing an alert (read from the Mac by `access_behavior`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessBehavior { Allowed, Ask, Denied, Unknown }

#[derive(Debug, PartialEq, Eq)]
pub enum ClipboardPlan { SaveAndRestore, SkipAndTell(&'static str) }

/// The clipboard is saved and put back only when macOS will not show an alert for reading it.
pub fn clipboard_plan(b: AccessBehavior) -> ClipboardPlan {
    match b {
        AccessBehavior::Allowed => ClipboardPlan::SaveAndRestore,
        _ => ClipboardPlan::SkipAndTell("Your clipboard now holds the improved prompt."),
    }
}

/// What macOS says about Companion reading the clipboard: `NSPasteboard.accessBehavior` as its raw number (0 default,
/// 1 ask, 2 always allow, 3 always deny), or None on a macOS before 15.4, which has no such setting and no alert.
/// "Default" asks when a program reads the clipboard, so only "always allow" (the person's own choice in System
/// Settings) or an older macOS lets Companion save the clipboard and put it back.
pub fn access_behavior(raw: Option<isize>) -> AccessBehavior {
    match raw {
        None | Some(2) => AccessBehavior::Allowed,
        Some(0) | Some(1) => AccessBehavior::Ask,
        Some(3) => AccessBehavior::Denied,
        Some(_) => AccessBehavior::Unknown,
    }
}

/// How a paste back ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasteOutcome {
    /// The text showed up in the box.
    Landed,
    /// Pasted, but the text could not be seen in the box afterwards.
    Unconfirmed,
    /// Not pasted: the text was left on the clipboard for the person to paste (they moved, or the box could not be reached).
    CopiedInstead,
    /// Not pasted: the person moved on (Stop, Dismiss, a new press) before the paste.
    Cancelled,
}

/// Put the person's own clipboard back? Only when it was saved (macOS lets Companion read it without an alert), only when
/// Companion's text has no job left there (it landed, or nothing was pasted because the person moved on), and only when
/// nothing else has written to the clipboard since Companion did (`ours` is its change number right after our write).
pub fn restore_after(plan: &ClipboardPlan, outcome: PasteOutcome, ours: isize, now: isize) -> bool {
    *plan == ClipboardPlan::SaveAndRestore && matches!(outcome, PasteOutcome::Landed | PasteOutcome::Cancelled) && ours == now
}

/// Whether a paste has really landed: the box now holds the text AND it changed from what it held before the paste. The
/// person's clipboard is given back only after this, so it must never say yes before the app has read the clipboard
/// (putting the original back into a box whose improved text starts with the same words would otherwise look done at once).
pub fn paste_seen(before: &str, now: &str, probe: &str) -> bool { now != before && now.contains(probe) }

/// What the card says after a paste. `restore` is true when the person's original text was put back into the box.
/// The clipboard is mentioned only when it was not given back, so the person knows what Cmd+V would paste.
pub fn paste_words(restore: bool, landed: bool, plan: &ClipboardPlan) -> String {
    let head = match (landed, restore) {
        (true, true) => "Your original is back.",
        (true, false) => "Done.",
        (false, _) => "I pasted it, but could not confirm it landed. Please look at your text box.",
    };
    let tell = match plan {
        ClipboardPlan::SaveAndRestore if landed => "",
        _ if restore => "Your clipboard now holds your original text.",
        ClipboardPlan::SkipAndTell(m) => m,
        ClipboardPlan::SaveAndRestore => "Your clipboard now holds the improved prompt.",
    };
    format!("{head} {tell}").trim().to_string()
}

// ---------- logs never hold text ----------

/// What may be written about a read or a paste. There is no field for the text, so it cannot be logged by mistake.
pub fn log_line(kind: &str, bundle_id: &str, ms: u64, chars: usize, outcome: &str) -> Value {
    json!({ "ev": kind, "app": bundle_id, "ms": ms, "chars": chars, "outcome": outcome })
}

#[cfg(test)]
mod tests {
    use super::*;
    const APP: &str = "com.openai.codex";

    #[test] fn password_managers_and_system_settings_are_never_read() {
        let d = Denylist::default();
        for id in ["com.1password.1password", "com.bitwarden.desktop", "com.apple.keychainaccess", "org.keepassxc.keepassxc", "com.apple.Passwords"] { assert!(d.contains(id), "{id}"); }
        assert!(!d.contains(APP));
    }
    #[test] fn the_person_can_add_apps_but_not_remove_the_built_in_ones() {
        let mut d = Denylist::default();
        d.add("com.mybank.app"); assert!(d.contains("com.mybank.app"));
        d.remove("com.mybank.app"); assert!(!d.contains("com.mybank.app"));
        d.remove("com.1password.1password"); assert!(d.contains("com.1password.1password"));
        assert_eq!(d.user_apps(), Vec::<String>::new());
    }
    #[test] fn an_empty_id_is_not_added() { let mut d = Denylist::default(); d.add(""); assert!(d.user_apps().is_empty()); }

    #[test] fn a_new_app_asks_first() { assert_eq!(Consent::default().decide(APP), Decision::Ask); }
    #[test] fn always_allows_every_time_and_never_refuses_every_time() {
        let mut c = Consent::default();
        c.record(APP, Choice::Always); assert_eq!(c.decide(APP), Decision::Allow); assert_eq!(c.decide(APP), Decision::Allow);
        c.record("x.y", Choice::Never); assert_eq!(c.decide("x.y"), Decision::Refuse); assert_eq!(c.decide("x.y"), Decision::Refuse);
    }
    #[test] fn once_is_used_up_by_being_used() {
        let mut c = Consent::default();
        c.record(APP, Choice::Once);
        assert_eq!(c.decide(APP), Decision::Allow);
        assert_eq!(c.decide(APP), Decision::Ask);
    }
    #[test] fn a_choice_can_be_forgotten_and_asked_again() {
        let mut c = Consent::default(); c.record(APP, Choice::Never); c.forget(APP);
        assert_eq!(c.decide(APP), Decision::Ask);
    }
    #[test] fn only_always_and_never_are_saved_and_they_survive_a_restart() {
        let mut c = Consent::default();
        c.record("a.a", Choice::Always); c.record("b.b", Choice::Never); c.record("c.c", Choice::Once);
        let mut back = Consent::from_json(&c.to_json());
        assert_eq!(back.decide("a.a"), Decision::Allow);
        assert_eq!(back.decide("b.b"), Decision::Refuse);
        assert_eq!(back.decide("c.c"), Decision::Ask);
    }
    #[test] fn a_damaged_or_odd_saved_file_gives_no_choices_rather_than_a_crash() {
        for v in [json!(null), json!({}), json!({"apps": 5}), json!({"apps": {"a": "sometimes", "b": 7}})] {
            let mut c = Consent::from_json(&v);
            assert_eq!(c.decide("a"), Decision::Ask);
        }
    }

    fn verdict(role: &str, sub: &str, secure: bool, app: &str, c: &mut Consent) -> ReadVerdict { read_verdict(role, sub, secure, app, &Denylist::default(), c) }
    #[test] fn a_password_field_is_refused_even_if_the_app_is_allowed() {
        let mut c = Consent::default(); c.record(APP, Choice::Always);
        assert_eq!(verdict("AXTextField", "AXSecureTextField", false, APP, &mut c), ReadVerdict::RefuseSecureField);
        assert_eq!(verdict("AXSecureTextField", "", false, APP, &mut c), ReadVerdict::RefuseSecureField);
    }
    #[test] fn secure_keyboard_input_is_refused() {
        let mut c = Consent::default(); c.record(APP, Choice::Always);
        assert_eq!(verdict("AXTextArea", "", true, APP, &mut c), ReadVerdict::RefuseSecureInput);
    }
    #[test] fn a_never_read_app_is_refused_before_consent_is_even_asked() {
        let mut c = Consent::default(); c.record("com.1password.1password", Choice::Always);
        assert_eq!(verdict("AXTextArea", "", false, "com.1password.1password", &mut c), ReadVerdict::RefuseNeverApp);
    }
    #[test] fn a_refusal_never_uses_up_a_once() {
        let mut c = Consent::default(); c.record(APP, Choice::Once);
        assert_eq!(verdict("AXSecureTextField", "", false, APP, &mut c), ReadVerdict::RefuseSecureField);
        assert_eq!(verdict("AXTextArea", "", false, APP, &mut c), ReadVerdict::Ok);
    }
    #[test] fn an_ordinary_field_in_a_new_app_needs_consent_then_reads() {
        let mut c = Consent::default();
        assert_eq!(verdict("AXTextArea", "", false, APP, &mut c), ReadVerdict::NeedConsent);
        c.record(APP, Choice::Always);
        assert_eq!(verdict("AXTextArea", "", false, APP, &mut c), ReadVerdict::Ok);
    }
    #[test] fn an_app_you_said_never_to_is_refused_in_your_words() {
        let mut c = Consent::default(); c.record(APP, Choice::Never);
        let v = verdict("AXTextArea", "", false, APP, &mut c);
        assert_eq!(v, ReadVerdict::RefusedByYou);
        assert!(v.plain().contains("told me not to"));
    }
    #[test] fn every_refusal_has_a_plain_sentence() {
        for v in [ReadVerdict::NeedConsent, ReadVerdict::RefuseSecureField, ReadVerdict::RefuseSecureInput, ReadVerdict::RefuseNeverApp, ReadVerdict::RefusedByYou] { assert!(!v.plain().is_empty()); }
    }

    #[test] fn nothing_is_read_before_the_indicator_is_lit() {
        let mut s = ReadSession::default();
        assert!(s.begin_read().is_err());
        s.indicator_on();
        assert!(s.begin_read().is_ok());
    }
    #[test] fn one_hotkey_press_reads_only_once() {
        let mut s = ReadSession::default(); s.indicator_on();
        assert!(s.begin_read().is_ok()); assert!(s.begin_read().is_err());
        s.finish();
        assert!(s.begin_read().is_err());           // a new press must light the indicator again
    }

    const F1: Focus = Focus { pid: 10, element: 1 };
    #[test] fn the_same_box_in_the_same_app_is_pasted_into() { assert_eq!(paste_plan(F1, F1, false, false), PasteVerdict::Paste); }
    #[test] fn another_app_in_front_means_copy_only() {
        match paste_plan(F1, Focus { pid: 11, element: 1 }, false, false) { PasteVerdict::CopyOnly(m) => assert!(m.contains("another app")), v => panic!("{v:?}") }
    }
    #[test] fn another_box_in_the_same_app_means_copy_only() {
        match paste_plan(F1, Focus { pid: 10, element: 2 }, false, false) { PasteVerdict::CopyOnly(m) => assert!(m.contains("another box")), v => panic!("{v:?}") }
    }
    #[test] fn terminals_always_copy() {
        match paste_plan(F1, F1, true, false) { PasteVerdict::CopyOnly(m) => assert!(m.contains("Cmd+V")), v => panic!("{v:?}") }
    }
    #[test] fn if_our_own_card_has_the_keyboard_nothing_is_pasted() {
        assert!(matches!(paste_plan(F1, F1, false, true), PasteVerdict::CopyOnly(_)));
    }

    #[test] fn the_clipboard_is_saved_and_restored_only_when_macos_will_not_alert() {
        assert_eq!(clipboard_plan(AccessBehavior::Allowed), ClipboardPlan::SaveAndRestore);
        for b in [AccessBehavior::Ask, AccessBehavior::Denied, AccessBehavior::Unknown] { assert!(matches!(clipboard_plan(b), ClipboardPlan::SkipAndTell(_)), "{b:?}"); }
    }
    #[test] fn what_macos_says_about_reading_the_clipboard_decides_whether_it_is_saved() {
        // NSPasteboard.accessBehavior: 0 default (asks when a program reads it), 1 ask, 2 always allow, 3 always deny.
        assert_eq!(access_behavior(Some(2)), AccessBehavior::Allowed);
        assert_eq!(access_behavior(Some(0)), AccessBehavior::Ask);
        assert_eq!(access_behavior(Some(1)), AccessBehavior::Ask);
        assert_eq!(access_behavior(Some(3)), AccessBehavior::Denied);
        assert_eq!(access_behavior(Some(9)), AccessBehavior::Unknown);
        // Before macOS 15.4 there is no such setting and no clipboard alert at all.
        assert_eq!(access_behavior(None), AccessBehavior::Allowed);
        assert_eq!(clipboard_plan(access_behavior(Some(0))), ClipboardPlan::SkipAndTell("Your clipboard now holds the improved prompt."));
        assert_eq!(clipboard_plan(access_behavior(Some(2))), ClipboardPlan::SaveAndRestore);
    }
    #[test] fn the_persons_clipboard_comes_back_after_a_paste_that_landed() {
        let keep = ClipboardPlan::SaveAndRestore;
        assert!(restore_after(&keep, PasteOutcome::Landed, 41, 41));
        // Nothing was pasted because the person moved on first: their clipboard comes back too.
        assert!(restore_after(&keep, PasteOutcome::Cancelled, 41, 41));
    }
    #[test] fn the_clipboard_is_left_alone_when_it_still_has_a_job_or_someone_else_changed_it() {
        let keep = ClipboardPlan::SaveAndRestore;
        // The text could not be pasted (or not confirmed): it stays on the clipboard so the person can press Cmd+V.
        assert!(!restore_after(&keep, PasteOutcome::CopiedInstead, 41, 41));
        assert!(!restore_after(&keep, PasteOutcome::Unconfirmed, 41, 41));
        // Something else wrote to the clipboard after Companion did: that is never overwritten.
        assert!(!restore_after(&keep, PasteOutcome::Landed, 41, 42));
        // macOS would have asked to let Companion read it, so it was never saved and cannot be put back.
        let skip = clipboard_plan(AccessBehavior::Ask);
        for o in [PasteOutcome::Landed, PasteOutcome::Cancelled, PasteOutcome::Unconfirmed, PasteOutcome::CopiedInstead] { assert!(!restore_after(&skip, o, 41, 41), "{o:?}"); }
    }
    #[test] fn a_paste_counts_as_landed_only_when_the_box_really_changed() {
        // Putting the original back: the box already holds the improved text, which starts with the original's words.
        let (original, improved) = ("Fix the login bug", "Fix the login bug in auth.ts and add a test");
        assert!(!paste_seen(improved, improved, original), "the box had not changed yet, so nothing has been pasted");
        assert!(paste_seen(improved, original, original));
        // Using the improved text: the box changes from the original to the improved one.
        assert!(!paste_seen(original, original, &improved[..24]));
        assert!(paste_seen(original, improved, &improved[..24]));
        // The text did not show up at all.
        assert!(!paste_seen(original, "something else", &improved[..24]));
    }
    #[test] fn the_card_says_what_the_clipboard_holds_only_when_it_was_not_given_back() {
        let keep = ClipboardPlan::SaveAndRestore;
        let skip = clipboard_plan(AccessBehavior::Ask);
        assert_eq!(paste_words(false, true, &keep), "Done.");
        assert_eq!(paste_words(true, true, &keep), "Your original is back.");
        assert_eq!(paste_words(false, true, &skip), "Done. Your clipboard now holds the improved prompt.");
        assert_eq!(paste_words(true, true, &skip), "Your original is back. Your clipboard now holds your original text.");
        // Not confirmed: the text stays on the clipboard either way, and the card says so.
        for plan in [&keep, &skip] {
            assert_eq!(paste_words(false, false, plan), "I pasted it, but could not confirm it landed. Please look at your text box. Your clipboard now holds the improved prompt.");
            assert_eq!(paste_words(true, false, plan), "I pasted it, but could not confirm it landed. Please look at your text box. Your clipboard now holds your original text.");
        }
    }

    #[test] fn a_log_line_cannot_hold_the_text() {
        let secret = "my secret prompt about my bank account";
        let line = log_line("prompt_help_read", APP, 12, secret.len(), "ok").to_string();
        assert!(!line.contains("secret")); assert!(!line.contains("bank"));
        assert!(line.contains("\"chars\":38"));
        let keys: Vec<String> = log_line("x", "a", 1, 2, "ok").as_object().unwrap().keys().cloned().collect();
        assert_eq!(keys, vec!["app", "chars", "ev", "ms", "outcome"]);
    }
}
