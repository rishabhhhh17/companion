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
fn head(c: &[char], max: usize) -> String {
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
    #[test] fn a_log_line_cannot_hold_the_text() {
        let line = log_line("com.apple.Terminal", 12, 38, "sent").to_string();
        let mut keys: Vec<String> = log_line("a", 1, 2, "x").as_object().unwrap().keys().cloned().collect(); keys.sort();
        assert_eq!(keys, vec!["app", "chars", "ms", "outcome"]);
        assert!(line.contains("\"chars\":38"));
    }
}
