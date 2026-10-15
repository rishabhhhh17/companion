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
pub fn prepare(raw: &str) -> Selection {
    let t = raw.trim();
    if t.is_empty() { return Selection::Nothing; }
    let n = t.chars().count();
    if n < MIN_CHARS { return Selection::TooShort; }
    if n <= MAX_CHARS { return Selection::Send(t.to_string()); }
    let head: String = t.chars().take(HEAD).collect();
    let tail: String = t.chars().skip(n - (MAX_CHARS - HEAD)).collect();
    Selection::Send(format!("{}\n[...]\n{}", head.trim_end(), tail.trim_start()))
}

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
    #[test] fn a_log_line_cannot_hold_the_text() {
        let line = log_line("com.apple.Terminal", 12, 38, "sent").to_string();
        let mut keys: Vec<String> = log_line("a", 1, 2, "x").as_object().unwrap().keys().cloned().collect(); keys.sort();
        assert_eq!(keys, vec!["app", "chars", "ms", "outcome"]);
        assert!(line.contains("\"chars\":38"));
    }
}
