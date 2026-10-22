//! Second Look's selection (M14), as plain tested rules: what is sent to the engine (trimmed and cut to a size), when nothing
//! is sent at all, whether Second Look is switched on, and what may be logged (never the text). Nothing here reads anything:
//! `seclook.rs` reads the selection through `ax.rs`, only on Second Look's hotkey, with the light on first, exactly as the
//! error explainer does (`errhelp.rs`, `errorsel.rs`). The engine hides secrets in the text before it uses it for anything,
//! checks at most its own first part and says when it cut (runner/src/secondlook.ts).

use serde_json::{json, Value};

/// The most that is sent: a little over what the engine checks (12,000 characters), so a longer answer still reaches it as
/// longer and the card can say that only the first part was checked.
pub const MAX_CHARS: usize = 13_000;
/// Fewer characters than this is not an answer worth checking (a stray click selects a letter or two).
pub const MIN_CHARS: usize = 3;

#[derive(Debug, PartialEq, Eq)]
pub enum Selection { Send(String), Nothing, TooShort }

/// What to do with what was read: send it (trimmed, cut to MAX_CHARS from its start, between whole lines so a key and the
/// words that mark it as one stay together or go together), or nothing. An answer is read from its start: the claims that
/// matter come first, unlike an error, whose end matters.
pub fn prepare(raw: &str) -> Selection {
    let t = raw.trim();
    if t.is_empty() { return Selection::Nothing; }
    let c: Vec<char> = t.chars().collect();
    if c.len() < MIN_CHARS { return Selection::TooShort; }
    if c.len() <= MAX_CHARS { return Selection::Send(t.to_string()); }
    Selection::Send(crate::errorsel::head(&c, MAX_CHARS))
}

/// Second Look's own switch in Settings (secondLook.on, usually on). Anything but an explicit false is on, as with drop.on.
pub fn is_on(setting: &Value) -> bool { *setting != json!(false) }

/// The command for the engine. The text goes only here, never into a log; the project is named only when one is chosen.
pub fn command(req: &str, bundle: &str, text: &str, project: &str) -> Value {
    let mut c = json!({ "v": 1, "id": format!("{req}-c"), "type": "secondlook.check", "req": req, "app": bundle, "text": text });
    if !project.is_empty() { c["project"] = json!(project); }
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test] fn nothing_selected_sends_nothing() {
        assert_eq!(prepare(""), Selection::Nothing);
        assert_eq!(prepare("  \n\t "), Selection::Nothing);
        assert_eq!(prepare(" x "), Selection::TooShort);
    }
    #[test] fn an_ordinary_answer_is_sent_trimmed() {
        assert_eq!(prepare("\n  So 120 × 4 = 460. \n"), Selection::Send("So 120 × 4 = 460.".into()));
    }
    #[test] fn a_huge_answer_keeps_its_start_cut_between_lines_and_longer_than_the_engine_checks() {
        let long = format!("First claim.\n{}", "another line of the answer 🐛\n".repeat(2000));
        let Selection::Send(t) = prepare(&long) else { panic!("not sent") };
        let n = t.chars().count();
        assert!(n <= MAX_CHARS && n > 12_000, "{n}");
        assert!(t.starts_with("First claim."));
        assert!(t.ends_with("another line of the answer 🐛"), "cut at the end of a whole line");
    }
    #[test] fn a_key_across_the_cut_is_never_sent_in_part() {
        let key = format!("sk-ant-api03-{}", "Q".repeat(60));
        let mut text = String::from("Answer\n");
        while text.chars().count() < MAX_CHARS - 30 { text.push_str("line\n"); }
        text.push_str(&format!("x-api-key: {key}\nmore\n"));
        let Selection::Send(t) = prepare(&text) else { panic!("not sent") };
        assert!(!t.replace(&key, "").contains("QQQQ"), "part of a key was sent");
    }
    #[test] fn the_switch_is_on_unless_turned_off() {
        assert!(is_on(&json!(true)) && is_on(&Value::Null) && is_on(&json!("x")));
        assert!(!is_on(&json!(false)));
    }
    #[test] fn the_command_carries_only_what_the_engine_needs_and_matches_the_shared_fixture() {
        let c = command("sl_1", "com.openai.chat", "120 × 4 = 460", "/Users/me/site");
        assert_eq!(c["type"], "secondlook.check");
        assert_eq!(c["v"], 1);
        assert_eq!(c["text"], "120 × 4 = 460");
        let mut keys: Vec<String> = c.as_object().unwrap().keys().cloned().collect(); keys.sort();
        assert_eq!(keys, vec!["app", "id", "project", "req", "text", "type", "v"]);
        assert!(command("sl_1", "x", "t", "").get("project").is_none(), "no project is named when none is chosen");
        // The same shape as the protocol's fixtures, which the TypeScript side parses (protocol/index.ts).
        let fixtures = include_str!("../../../protocol/fixtures/commands.jsonl");
        let mut seen = 0;
        for line in fixtures.lines().filter(|l| l.contains("\"secondlook.check\"")) {
            seen += 1;
            let f: Value = serde_json::from_str(line).unwrap();
            let mine = command(f["req"].as_str().unwrap(), f["app"].as_str().unwrap(), f["text"].as_str().unwrap(), f.get("project").and_then(Value::as_str).unwrap_or(""));
            let mut a: Vec<String> = mine.as_object().unwrap().keys().cloned().collect(); a.sort();
            let mut b: Vec<String> = f.as_object().unwrap().keys().cloned().collect(); b.sort();
            assert_eq!(a, b, "{line}");
            for k in ["type", "req", "app", "text", "v"] { assert_eq!(mine[k], f[k], "{k}"); }
        }
        assert!(seen >= 2);
    }
    #[test] fn the_selection_is_read_only_on_the_hotkey_light_first_and_never_when_switched_off() {
        let src = include_str!("seclook.rs");
        let main = include_str!("main.rs");
        let hot = &src[src.find("pub fn on_hotkey(").unwrap()..src.find("fn read_and_send(").unwrap()];
        // Off in Settings: checked before anything else, so nothing is read and no app is even looked at.
        let off = hot.find("secondsel::is_on(&crate::setting_now(\"secondLook.on\"))").expect("the switch is checked");
        assert!(off < hot.find("ax::").unwrap(), "the switch comes before any Accessibility call");
        assert!(hot[off..hot.find("ax::").unwrap()].contains("return;"));
        // One read in the whole flow, behind the secure box check (prompthelp.rs tests it), started only by the hotkey and
        // by the answer to a question the hotkey asked.
        assert_eq!(src.matches("ax::read_selection(").count(), 1);
        assert_eq!(src.matches("read_and_send(&").count(), 2);
        assert_eq!(main.matches("seclook::on_hotkey(").count(), 1);
        assert!(main.contains("keymap::Action::SecondLook => seclook::on_hotkey(app, open_card),"));
        // Stop everything and Voice going off drop a read under way.
        let stop = &main[main.find("fn showme_stop(").unwrap()..];
        assert!(stop[..stop.find("\n}\n").unwrap()].contains("seclook::dismiss(app);"));
        let groups = &main[main.find("if newly_off & bit(\"voice\") != 0 {").unwrap()..];
        assert!(groups[..groups.find("\n    }\n").unwrap()].contains("seclook::dismiss(app);"));
        // A read that a Stop or newer press overtook is never sent.
        let send = &src[src.find("fn read_and_send(").unwrap()..];
        assert!(send.find("if GEN.load(Ordering::SeqCst) != gen { return; }").unwrap() < send.find("secondsel::command(").unwrap());
    }
    #[test] fn a_log_line_cannot_hold_the_text() {
        // Second Look logs with the error explainer's log line, which has no field for the text.
        let mut keys: Vec<String> = crate::errorsel::log_line("a", 1, 2, "x").as_object().unwrap().keys().cloned().collect(); keys.sort();
        assert_eq!(keys, vec!["app", "chars", "ms", "outcome"]);
        let src = include_str!("seclook.rs");
        assert!(src.contains("errorsel::log_line(bundle, ms, chars, outcome)"));
        for banned in ["\"text\":", "log(\"second_look\", json!", "println!", "eprintln!", "std::fs::"] { assert!(!src.contains(banned), "{banned}"); }
    }
}
