//! Type by voice into any app (M36, F26, the founder, 30 Oct 2026: "do it"). Hold the Type key, speak, let go: the words
//! are pasted at the cursor in the app in front. It is hold to talk (main.rs voice_worker, voice.rs) with a different end:
//! the words go into the person's own text box instead of Home's ask box.
//!
//! What it may touch, and when (rule 5): only on the Type key, with the light lit first. At the press it notes which app is
//! in front and which element has the keyboard (its identity, never its text). It never reads the box: after the paste
//! nothing is read back, so it reads less than Prompt help. It never types into a password box, during secure typing (a
//! password prompt or `sudo`), or into the apps that are never read (password managers, Keychain, System Settings). It
//! never presses Return, so nothing is sent (rule 13). If the person moved to another app or box before the words were
//! ready, the words are copied instead and the person is told.
//!
//! The pasting reuses Prompt help's way (T11): the app's own Edit > Paste through Accessibility, Cmd+V only when that menu
//! item could not be pressed, the person's clipboard saved and put back only when macOS allows reading it without an alert
//! and nothing on it is marked private, and our own item marked transient and concealed.

use crate::prompthelp::{self as rules, Focus, ReadVerdict};

/// Where the words go: the app in front and its focused element at the press.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target { pub pid: i32, pub bundle: String, pub name: String, pub element: u64 }
impl Target { pub fn focus(&self) -> Focus { Focus { pid: self.pid, element: self.element } } }

/// May the words go into this box? The same refusals as Prompt help's read, with no per app question: nothing is read.
/// `element` is 0 when the app shows no focused element (some Electron apps until a screen reader is near); then only the
/// app is checked at the paste.
pub fn target_verdict(role: &str, subrole: &str, secure_input_on: bool, bundle: &str, deny: &rules::Denylist) -> Result<(), ReadVerdict> {
    if let Some(v) = rules::secure_now(role, subrole, secure_input_on) { return Err(v); }
    if deny.contains(bundle) { return Err(ReadVerdict::RefuseNeverApp); }
    Ok(())
}

/// What the line says when the Type key is refused. Plain words, never what the box holds.
pub fn refused_words(v: ReadVerdict) -> &'static str {
    match v {
        ReadVerdict::RefuseSecureField => "That's a password box, so I won't type there.",
        ReadVerdict::RefuseSecureInput => "Something is asking for a password right now, so I won't type.",
        _ => "I never type into this app.",
    }
}

/// Paste or copy, given where the keyboard was at the press and where it is now.
#[derive(Debug, PartialEq, Eq)]
pub enum Plan { Paste, Copy(&'static str) }
pub fn insert_plan(at_press: Focus, now: Focus) -> Plan {
    if at_press.pid != now.pid { return Plan::Copy(MOVED_APP); }
    // An element of 0 at the press means the app showed none; only the app can be checked then.
    if at_press.element != 0 && at_press.element != now.element { return Plan::Copy(MOVED_BOX); }
    Plan::Paste
}
pub const MOVED_APP: &str = "You moved to another app, so I copied your words instead. Press Cmd+V where you want them.";
pub const MOVED_BOX: &str = "You moved to another box, so I copied your words instead. Press Cmd+V where you want them.";
pub const NOT_FRONT: &str = "I couldn't get back to your text box, so I copied your words. Press Cmd+V where you want them.";

/// Put the person's clipboard back? Only when it was saved, our words were pasted, and nothing else wrote to the clipboard
/// since (`ours` is the change number right after our write). Nothing is read from the box to confirm the paste, so the
/// clipboard comes back after the app's paste had time to read it (`settle_ms`).
pub fn give_back(plan: &rules::ClipboardPlan, pasted: bool, ours: isize, now: isize) -> bool {
    rules::restore_after(plan, if pasted { rules::PasteOutcome::Landed } else { rules::PasteOutcome::CopiedInstead }, ours, now)
}
/// How long the app gets to read the clipboard after the paste before the person's own comes back. The Edit menu item is
/// pressed through Accessibility and returns once the app handled it; Cmd+V is only posted, so it gets longer. [verify]
pub fn settle_ms(by_menu: bool) -> u64 { if by_menu { 250 } else { 600 } }

/// The line after the words went in. `kept` is whether the person's clipboard was put back.
pub fn typed_words(app: &str, kept: bool) -> String {
    let into = if app.trim().is_empty() { "Typed.".to_string() } else { format!("Typed into {}.", app.trim()) };
    if kept { into } else { format!("{into} Your clipboard holds the words too.") }
}

/// The short word the little Flowflow at the pointer says (follow.rs say_line: 40 characters at most), so the person sees
/// what happened where they are looking, not only in the notch.
pub fn pointer_word(stage: &str) -> Option<&'static str> {
    match stage {
        "typed" => Some("Typed."),
        "copied" => Some("Copied. Press Cmd+V."),
        "refused" => Some("Not here. Nothing typed."),
        _ => None,
    }
}

/// The whole paste, on the Mac. `stopped` says whether Stop everything was pressed since the keys went down; it is asked
/// right before the paste, so words heard before a Stop never land (rule 11). Returns the stage and the line for the page.
#[cfg(target_os = "macos")]
pub fn insert_at_cursor(target: &Target, text: &str, stopped: impl Fn() -> bool) -> (&'static str, String) {
    use crate::ax;
    use std::time::Duration;
    let focus_now = || ax::front_app().map(|f| Focus { pid: f.pid, element: if target.element == 0 { 0 } else { ax::focused(f.pid).map(|e| e.element.id()).unwrap_or(0) } }).unwrap_or(Focus { pid: -1, element: 0 });
    if let Plan::Copy(why) = insert_plan(target.focus(), focus_now()) { ax::write_clipboard(text); return ("copied", why.to_string()); }
    let mut plan = rules::clipboard_plan_with(rules::access_behavior(ax::clipboard_access_raw()), ax::clipboard_types);
    let saved = if plan == rules::ClipboardPlan::SaveAndRestore { ax::save_clipboard() } else { None };
    if saved.is_none() { plan = rules::ClipboardPlan::skip(); }
    let ours = ax::write_clipboard(text);
    if !ax::ensure_front(target.pid) { return ("copied", NOT_FRONT.to_string()); }
    if stopped() {
        // Nothing is pasted; the person's own clipboard comes back as it was.
        if let Some(s) = &saved { if rules::restore_after(&plan, rules::PasteOutcome::Cancelled, ours, ax::clipboard_change_count()) { ax::restore_clipboard(s, ours); } }
        return ("idle", String::new());
    }
    if let Plan::Copy(why) = insert_plan(target.focus(), focus_now()) { return ("copied", why.to_string()); }
    // The app's own Edit > Paste first; Cmd+V only when that item could not be pressed (pressing both would paste twice).
    let by_menu = ax::press_menu(target.pid, "Edit", "Paste");
    if !by_menu { ax::press_paste(); }
    std::thread::sleep(Duration::from_millis(settle_ms(by_menu)));
    let kept = match &saved { Some(s) if give_back(&plan, true, ours, ax::clipboard_change_count()) => ax::restore_clipboard(s, ours), _ => false };
    crate::log("dictate_pasted", serde_json::json!({ "how": if by_menu { "menu" } else { "keys" }, "clipboard_kept": kept, "chars": text.chars().count() }));
    ("typed", typed_words(&target.name, kept))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deny() -> rules::Denylist { rules::Denylist::empty() }

    #[test]
    fn never_a_password_box_secure_typing_or_a_never_read_app() {
        assert_eq!(target_verdict("AXSecureTextField", "", false, "com.apple.TextEdit", &deny()), Err(ReadVerdict::RefuseSecureField));
        assert_eq!(target_verdict("AXTextField", "AXSecureTextField", false, "com.apple.Safari", &deny()), Err(ReadVerdict::RefuseSecureField));
        assert_eq!(target_verdict("AXTextArea", "", true, "com.apple.Terminal", &deny()), Err(ReadVerdict::RefuseSecureInput));
        for b in ["com.1password.1password", "com.apple.keychainaccess", "COM.APPLE.SYSTEMPREFERENCES"] {
            assert_eq!(target_verdict("AXTextField", "", false, b, &deny()), Err(ReadVerdict::RefuseNeverApp), "{b}");
        }
        let mut mine = deny(); mine.add("com.example.secret");
        assert_eq!(target_verdict("AXTextArea", "", false, "com.example.secret", &mine), Err(ReadVerdict::RefuseNeverApp));
        assert_eq!(target_verdict("AXTextArea", "", false, "com.apple.Notes", &deny()), Ok(()));
        for v in [ReadVerdict::RefuseSecureField, ReadVerdict::RefuseSecureInput, ReadVerdict::RefuseNeverApp] { assert!(!refused_words(v).is_empty()); }
    }
    #[test]
    fn a_move_to_another_app_or_box_copies_instead() {
        let at = Focus { pid: 10, element: 77 };
        assert_eq!(insert_plan(at, at), Plan::Paste);
        assert_eq!(insert_plan(at, Focus { pid: 11, element: 77 }), Plan::Copy(MOVED_APP));
        assert_eq!(insert_plan(at, Focus { pid: 10, element: 78 }), Plan::Copy(MOVED_BOX));
        // An app that showed no focused element at the press: only the app is checked.
        assert_eq!(insert_plan(Focus { pid: 10, element: 0 }, Focus { pid: 10, element: 0 }), Plan::Paste);
        assert_eq!(insert_plan(Focus { pid: 10, element: 0 }, Focus { pid: 12, element: 0 }), Plan::Copy(MOVED_APP));
    }
    #[test]
    fn the_clipboard_comes_back_only_when_saved_pasted_and_untouched_since() {
        let save = rules::ClipboardPlan::SaveAndRestore;
        assert!(give_back(&save, true, 5, 5));
        assert!(!give_back(&save, true, 5, 6), "something else wrote to the clipboard since");
        assert!(!give_back(&save, false, 5, 5), "copied instead: the words stay for Cmd+V");
        assert!(!give_back(&rules::ClipboardPlan::skip(), true, 5, 5), "never saved, never put back");
        assert!(settle_ms(false) > settle_ms(true));
    }
    #[test]
    fn the_lines_are_plain_and_say_what_the_clipboard_holds() {
        assert_eq!(typed_words("Notes", true), "Typed into Notes.");
        assert_eq!(typed_words("Notes", false), "Typed into Notes. Your clipboard holds the words too.");
        assert_eq!(typed_words(" ", true), "Typed.");
        for w in [MOVED_APP, MOVED_BOX, NOT_FRONT] { assert!(w.contains("Cmd+V") && !w.contains('—')); }
    }
    #[test]
    fn the_pointer_word_fits_the_bubble() {
        for st in ["typed", "copied", "refused"] { assert!(crate::follow::say_line(pointer_word(st).unwrap()).is_some(), "{st}"); }
        assert_eq!(pointer_word("heard"), None);
    }
    #[test]
    fn it_never_reads_the_box_never_presses_return_and_checks_stop_before_pasting() {
        let src = include_str!("dictate.rs");
        let body = &src[src.find("pub fn insert_at_cursor(").unwrap()..src.find("#[cfg(test)]").unwrap()];
        for never in ["value_of", "read_ladder", "read_selection", "select_all", "select_range", "Return", "KEY_RETURN"] {
            assert!(!body.contains(never), "the Type key never uses {never}");
        }
        let stop = body.find("if stopped()").unwrap();
        assert!(stop < body.find("press_menu").unwrap() && stop < body.find("press_paste").unwrap(), "Stop is checked before the paste");
        assert!(body.find("ensure_front").unwrap() < stop);
        // The log line holds a count, never the words.
        assert!(!body.contains("\"text\""));
    }
}
