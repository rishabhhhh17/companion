//! The error explainer's selection, as plain tested rules: what is sent to the engine (trimmed and cut to a size), when
//! nothing is sent at all, and what may be logged (never the text). Nothing here reads anything: `errhelp.rs` reads the
//! selection through `ax.rs`, only on the hotkey, with the light on first. The engine hides secrets in the text before it
//! uses it for anything (runner/src/errorhelp.ts).

use serde_json::{json, Value};

/// The most that is sent. The engine cuts further and keeps the start and the end, where errors are.
pub const MAX_CHARS: usize = 8000;
const HEAD: usize = 3000;
/// Fewer characters than this is not an error worth sending (a stray click selects a letter or two).
pub const MIN_CHARS: usize = 3;

#[derive(Debug, PartialEq, Eq)]
pub enum Selection { Send(String), Nothing, TooShort }

/// What to do with what was read: send it (trimmed, cut to MAX_CHARS keeping its start and end), or nothing.
/// The cuts fall between whole lines, so a key and the words that mark it as one (`x-api-key:`, `Bearer`) stay together
/// or go together: the engine hides whole keys, and a key cut in two could lose the start that marks it.
pub fn prepare(raw: &str) -> Selection {
    let t = raw.trim();
    if t.is_empty() { return Selection::Nothing; }
    let c: Vec<char> = t.chars().collect();
    let n = c.len();
    if n < MIN_CHARS { return Selection::TooShort; }
    if n <= MAX_CHARS { return Selection::Send(t.to_string()); }
    Selection::Send(format!("{}\n[...]\n{}", head(&c, HEAD), tail(&c, MAX_CHARS - HEAD)))
}

/// At most `max` characters from the start, ending at the end of a whole line. When the first line alone is longer, it is cut
/// at a space, never inside a word.
pub(crate) fn head(c: &[char], max: usize) -> String {
    let w = &c[..max.min(c.len())];
    let end = if c.len() <= max || c[max] == '\n' { w.len() }
        else if let Some(i) = w.iter().rposition(|&x| x == '\n') { i }
        else { w.iter().rposition(|x| x.is_whitespace()).unwrap_or(0) };
    w[..end].iter().collect::<String>().trim_end().to_string()
}

/// At most `max` characters from the end, starting at the start of a whole line (or after a space, for one huge line).
fn tail(c: &[char], max: usize) -> String {
    let start = c.len().saturating_sub(max);
    let w = &c[start..];
    let begin = if start == 0 || c[start - 1] == '\n' { 0 }
        else if let Some(i) = w.iter().position(|&x| x == '\n') { i + 1 }
        else { w.iter().position(|x| x.is_whitespace()).map_or(w.len(), |i| i + 1) };
    w[begin..].iter().collect::<String>().trim_start().to_string()
}

/// A read that takes longer than this is cut short with a plain message (finding D): the person is never left looking at
/// "Reading what you selected" with nothing after it.
pub const READ_LIMIT: std::time::Duration = std::time::Duration::from_secs(5);

/// Who is in front when the key is pressed.
#[derive(Debug, PartialEq, Eq)]
pub enum FrontCase { NoFront, Own, Read }
/// The bundle id of the app in front, if the Mac said one. Our own app is never read (its own card is not an error to explain).
pub fn front_case(bundle: Option<&str>) -> FrontCase {
    match bundle {
        None | Some("") => FrontCase::NoFront,
        Some(b) if b.starts_with("dev.companion") => FrontCase::Own,
        Some(_) => FrontCase::Read,
    }
}

/// Every way a press of the explain key can end. Each one shows a plain message on the card (`stage` and `why` are what the
/// page is sent, app/src/model.ts `ehLines`) and is logged with a plain code (never the text).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    NoFront, OwnApp, NeedsAccessibility,
    /// The app gave no focused box at all, even after it was woken.
    NoField,
    /// A password box, secure typing, a never read app or the person's own "never": the code says which.
    Refused(&'static str),
    Consent, Nothing, TooShort,
    /// Sent to the engine; the string is the step that got the text (plain, role_retry, manual_accessibility, enhanced_ui).
    Sent(&'static str),
    /// The read took longer than READ_LIMIT.
    Slow,
    /// The reading thread failed.
    Crashed,
    NoEngine,
}
impl Outcome {
    pub fn stage(self) -> &'static str {
        match self {
            Outcome::NoFront | Outcome::OwnApp | Outcome::Slow | Outcome::Crashed | Outcome::NoEngine => "error",
            Outcome::NeedsAccessibility => "needs_accessibility",
            Outcome::NoField | Outcome::Nothing | Outcome::TooShort => "nothing_selected",
            Outcome::Refused(_) => "refused",
            Outcome::Consent => "consent",
            Outcome::Sent(_) => "thinking",
        }
    }
    pub fn why(self) -> Option<&'static str> {
        match self {
            Outcome::NoFront => Some("no_front"),
            Outcome::OwnApp => Some("own_app"),
            Outcome::Slow | Outcome::Crashed => Some("unreadable"),
            Outcome::NoEngine => Some("no_engine"),
            Outcome::Refused(c) => Some(c),
            _ => None,
        }
    }
    pub fn code(self) -> String {
        match self {
            Outcome::NoFront => "no_front".into(), Outcome::OwnApp => "own_app".into(), Outcome::NeedsAccessibility => "needs_accessibility".into(),
            Outcome::NoField => "no_field".into(), Outcome::Refused(_) => "refused".into(), Outcome::Consent => "consent".into(),
            Outcome::Nothing => "nothing".into(), Outcome::TooShort => "too_short".into(), Outcome::Sent(rung) => rung.into(),
            Outcome::Slow => "timeout".into(), Outcome::Crashed => "crashed".into(), Outcome::NoEngine => "no_engine".into(),
        }
    }
}

/// Which press last gave the person an answer. The reading thread and the five second timer both may answer; only the first
/// to claim a press shows, so a slow read finishing late never overwrites the timeout message (or the other way round).
pub struct Answered(std::sync::atomic::AtomicU64);
impl Answered {
    pub const fn new() -> Self { Answered(std::sync::atomic::AtomicU64::new(0)) }
    /// True for the first answer of press `gen`, false for any later one and for an older press.
    pub fn claim(&self, gen: u64) -> bool { self.0.fetch_max(gen, std::sync::atomic::Ordering::SeqCst) < gen }
}

/// Electron apps (Cursor, VS Code, Slack) often show Accessibility no focused text box until they are told a screen reader is
/// near (`AXManualAccessibility`, a documented switch). Done only at the key press, only for the app in front, only when it
/// showed no box, and switched off again afterwards (ax.rs `let_apps_sleep`).
pub fn should_wake(found_plain: bool, front_is_own: bool) -> bool { !found_plain && !front_is_own }

/// The "app" named when the words come from Home's own ask box (the Explain chip with text in the box), not from another
/// app. The engine names it as the product (runner/src/labels.ts).
pub const ASK_BOX: &str = "dev.companion.askbox";

/// The command for the engine. The text goes only here, never into a log; the project is named only when one is chosen.
pub fn command(req: &str, bundle: &str, text: &str, project: &str) -> Value {
    let mut c = json!({ "v": 1, "id": format!("{req}-c"), "type": "error.explain", "req": req, "app": bundle, "text": text });
    if !project.is_empty() { c["project"] = json!(project); }
    c
}

/// What may be written about a read. There is no field for the text, so it cannot be logged by mistake.
pub fn log_line(bundle: &str, ms: u64, chars: usize, outcome: &str) -> Value {
    json!({ "app": bundle, "ms": ms, "chars": chars, "outcome": outcome })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test] fn nothing_selected_sends_nothing() {
        assert_eq!(prepare(""), Selection::Nothing);
        assert_eq!(prepare("  \n\t "), Selection::Nothing);
        assert_eq!(prepare(" x "), Selection::TooShort);
    }
    #[test] fn an_ordinary_selection_is_sent_trimmed() {
        assert_eq!(prepare("\n  TypeError: x is not a function \n"), Selection::Send("TypeError: x is not a function".into()));
    }
    #[test] fn a_huge_selection_keeps_its_start_and_its_end() {
        let long = format!("Error: first\n{}ZeroDivisionError: division by zero", "noise 🐛\n".repeat(5000));
        let Selection::Send(t) = prepare(&long) else { panic!("not sent") };
        assert!(t.chars().count() <= MAX_CHARS + 10);
        assert!(t.starts_with("Error: first"));
        assert!(t.ends_with("ZeroDivisionError: division by zero"));
        assert!(t.contains("[...]"));
    }
    #[test] fn a_key_across_either_cut_is_never_sent_in_part() {
        // The engine hides keys, but only whole ones: a key cut in two at a fixed count could lose the start that marks it.
        let key = format!("sk-ant-api03-{}", "Q".repeat(60));
        let mut text = String::from("Error: first\n");
        while text.chars().count() < HEAD - 30 { text.push_str("noise line\n"); }
        text.push_str(&format!("x-api-key: {key}\n"));                 // across the cut that ends the start
        for _ in 0..300 { text.push_str("middle line\n"); }
        let mut end = String::new();
        while end.chars().count() < MAX_CHARS - HEAD - 60 { end.push_str("noise line\n"); }
        end.push_str("ZeroDivisionError: division by zero");
        text.push_str(&format!("x-api-key: {key}\n{end}"));            // across the cut that begins the end
        let Selection::Send(t) = prepare(&text) else { panic!("not sent") };
        assert!(!t.replace(&key, "").contains("QQQQ"), "part of a key was sent");
        assert!(t.chars().count() <= MAX_CHARS + 10);
        assert!(t.starts_with("Error: first"));
        assert!(t.ends_with("ZeroDivisionError: division by zero"));
    }
    #[test] fn one_huge_line_is_cut_between_words_never_inside_one() {
        let key = format!("sk-ant-api03-{}", "Q".repeat(60));
        let one = format!("{}{key} {}", "ab ".repeat(990), "cd ".repeat(3000));
        let Selection::Send(t) = prepare(&one) else { panic!("not sent") };
        assert!(t.split_whitespace().all(|w| w == "ab" || w == "cd" || w == "[...]"), "a word was cut");
        assert!(t.contains("ab") && t.contains("cd"));
    }
    #[test] fn the_command_carries_only_what_the_engine_needs() {
        let c = command("eh_1", "com.apple.Terminal", "boom", "/Users/me/site");
        assert_eq!(c["type"], "error.explain");
        assert_eq!(c["v"], 1);
        assert_eq!(c["req"], "eh_1");
        assert_eq!(c["text"], "boom");
        assert_eq!(c["project"], "/Users/me/site");
        let mut keys: Vec<String> = c.as_object().unwrap().keys().cloned().collect(); keys.sort();
        assert_eq!(keys, vec!["app", "id", "project", "req", "text", "type", "v"]);
        assert!(command("eh_1", "x", "boom", "").get("project").is_none(), "no project is named when none is chosen");
    }

    // ---- finding D: the key always ends in a visible message ----
    #[test] fn who_is_in_front_decides_before_anything_is_read() {
        assert_eq!(front_case(None), FrontCase::NoFront);
        assert_eq!(front_case(Some("")), FrontCase::NoFront);
        assert_eq!(front_case(Some("dev.companion.app")), FrontCase::Own);
        assert_eq!(front_case(Some("com.todesktop.230313mzl4w4u92")), FrontCase::Read);
        assert_eq!(front_case(Some("com.apple.Terminal")), FrontCase::Read);
    }
    #[test] fn every_outcome_shows_something_and_is_logged_in_plain_words() {
        let all = [Outcome::NoFront, Outcome::OwnApp, Outcome::NeedsAccessibility, Outcome::NoField, Outcome::Refused("secure_field"), Outcome::Consent,
            Outcome::Nothing, Outcome::TooShort, Outcome::Sent("plain"), Outcome::Slow, Outcome::Crashed, Outcome::NoEngine];
        for o in all {
            assert!(!o.stage().is_empty(), "{o:?} shows no stage");
            assert!(!o.code().is_empty() && o.code().chars().all(|c| c.is_ascii_lowercase() || c == '_' || c == ':'), "{o:?} log code");
            // A stage that stands for a refusal or a failure always carries a reason the page has words for.
            if matches!(o.stage(), "error" | "refused") { assert!(o.why().is_some(), "{o:?} has no reason"); }
        }
        // The reasons the page has words for (app/src/errorhelp.test.ts lists the same ones).
        let whys: Vec<_> = all.iter().filter_map(|o| o.why()).collect();
        assert_eq!(whys, vec!["no_front", "own_app", "secure_field", "unreadable", "unreadable", "no_engine"]);
        assert_eq!(Outcome::Nothing.stage(), "nothing_selected");
        assert_eq!(Outcome::NoField.stage(), "nothing_selected");
        assert_eq!(Outcome::TooShort.stage(), "nothing_selected");
        assert_eq!(Outcome::NeedsAccessibility.stage(), "needs_accessibility");
        assert_eq!(Outcome::Slow.stage(), "error");
        assert_eq!(Outcome::Sent("plain").stage(), "thinking");
        assert_eq!(Outcome::Sent("manual_accessibility").code(), "manual_accessibility");   // the rung that worked
    }
    #[test] fn a_slow_read_is_cut_at_five_seconds() {
        assert_eq!(READ_LIMIT, std::time::Duration::from_secs(5));
    }
    #[test] fn only_the_first_answer_of_a_press_counts() {
        let a = Answered::new();
        assert!(a.claim(1), "the first answer of press 1 shows");
        assert!(!a.claim(1), "a second answer of press 1 (the slow read finishing after the timeout) does not");
        assert!(a.claim(2), "a newer press starts again");
        assert!(!a.claim(1), "an older press never shows again");
    }
    #[test] fn an_app_that_shows_no_box_is_woken_only_when_it_is_not_ours() {
        // Electron apps (Cursor, VS Code, Slack) often show no focused box until told a screen reader is near.
        assert!(should_wake(false, false), "no focused box in another app: wake it");
        assert!(!should_wake(true, false), "a focused box was found: nothing to wake");
        assert!(!should_wake(false, true), "never poke our own app");
    }
    #[test] fn a_log_line_cannot_hold_the_text() {
        let line = log_line("com.apple.Terminal", 12, 38, "sent").to_string();
        let mut keys: Vec<String> = log_line("a", 1, 2, "x").as_object().unwrap().keys().cloned().collect(); keys.sort();
        assert_eq!(keys, vec!["app", "chars", "ms", "outcome"]);
        assert!(line.contains("\"chars\":38"));
    }
}
