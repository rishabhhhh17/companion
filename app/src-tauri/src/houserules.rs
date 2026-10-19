//! House rules in Settings (the registry's rules.house, T16): the project's own `.companion/rules.txt`, wrapped where it
//! always was. The file stays the source: it is read for the Settings row, and written only when the person presses Save,
//! keeping every line it does not understand (notes, empty lines, anything else) exactly as it was. The engine reads the
//! file itself before every action (runner/src/rules.ts), so a change applies at once. Rules can only make things
//! stricter than Companion's own safety rules; Companion's own machinery, never the agent, writes this file.
//!
//! Rules that never bend here:
//!  - A line is read as a rule exactly as `protocol/settings.ts` ruleOf reads it; both run protocol/fixtures/rules-cases.jsonl.
//!  - A new rule must be one of the five kinds, one line, within the registry's limits, and not look like a key or password.
//!  - Never through a link: a `.companion` folder or a rules file that is a link (or anything but a plain file), too big or
//!    not text is "cannot be read here", and is never written over.
//!  - It is protective: no reset ever touches it (settings.rs reset_targets), and only its own Remove takes a rule off.
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub const FILE: &str = ".companion/rules.txt";
/// The problem code for a rules file that is there but cannot be used here (the row says so, and Save is refused).
pub const UNREADABLE: &str = "rulesUnreadable";
const MAX_BYTES: u64 = 64 * 1024;

/// The spaces JavaScript's `\s` means, so a line is tidied exactly as the engine and the pages tidy it.
fn js_space(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{0b}' | '\u{0c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}
/// A line with its spaces tidied: one space between words, none at either end.
pub fn tidy(raw: &str) -> String { raw.split(js_space).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ") }

/// One line read as a rule.
#[derive(Clone, Debug, PartialEq)]
pub struct Rule { pub kind: &'static str, pub pattern: String, pub text: String }

/// One line read as a rule, or None for a note, an empty line or a line not understood.
pub fn rule_of(raw: &str) -> Option<Rule> {
    let line = tidy(raw);
    if line.is_empty() || line.starts_with('#') { return None; }
    let starts = |p: &str| line.get(..p.len()).is_some_and(|h| h.eq_ignore_ascii_case(p));
    for (p, kind) in [("never edit ", "never_edit"), ("never run ", "never_run"), ("ask before editing ", "ask_edit"), ("ask before running ", "ask_run")] {
        if starts(p) {
            let rest = line[p.len()..].trim_matches(js_space);
            if !rest.is_empty() { return Some(Rule { kind, pattern: rest.to_string(), text: line.clone() }); }
        }
    }
    if line.eq_ignore_ascii_case("ask before installing packages") { return Some(Rule { kind: "ask_install", pattern: String::new(), text: line }); }
    None
}

/// What the Settings row shows: each rule the file holds, as it reads with its spaces tidied, once each, in order.
pub fn value(text: Option<&str>) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for line in text.unwrap_or("").split('\n') {
        if let Some(r) = rule_of(line) { if !out.contains(&r.text) { out.push(r.text); } }
    }
    out
}

/// The file's new text for a new list of rules. A line that is not a rule stays exactly as it was, where it was; a rule
/// still on the list stays exactly as it was written; a rule no longer on the list goes (every copy of it); a new rule goes
/// at the end, one per line. The file's own line ending is kept.
pub fn with(old: Option<&str>, list: &[String]) -> String {
    let old = old.unwrap_or("");
    let crlf = old.contains("\r\n");
    let mut lines: Vec<String> = if old.is_empty() { vec![] } else { old.split('\n').map(str::to_string).collect() };
    let ended = old.ends_with('\n');
    if ended { lines.pop(); }
    let mut kept: Vec<String> = vec![];
    let mut have: Vec<String> = vec![];
    for line in lines {
        match rule_of(&line) {
            Some(r) if !list.contains(&r.text) => {}
            Some(r) => { have.push(r.text); kept.push(line); }
            None => kept.push(line),
        }
    }
    let mut added = false;
    for item in list {
        if have.contains(item) { continue; }
        have.push(item.clone());
        kept.push(if crlf { format!("{item}\r") } else { item.clone() });
        added = true;
    }
    let mut s = kept.join("\n");
    if !s.is_empty() && (ended || added) { s.push('\n'); }
    s
}

/// A change from the Settings row, checked: a list that only takes rules off is fine as it is; anything that adds a rule must
/// pass the registry's rules for the list (`d`) and be one of the five kinds. Ok(None) when nothing changes, Ok(Some(text))
/// with the file's new text.
pub fn change(d: &crate::settings::Def, old: Option<&str>, v: &Value) -> Result<Option<String>, &'static str> {
    let now = value(old);
    let items = v.as_array().ok_or("notList")?;
    let mut list: Vec<String> = vec![];
    for i in items {
        let s = i.as_str().ok_or("notText")?.to_string();
        if list.contains(&s) { return Err("duplicate"); }
        list.push(s);
    }
    if !list.iter().all(|x| now.contains(x)) {
        let checked = crate::settings::validate(d, v)?;
        list = checked.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
        for x in &list { if !now.contains(x) && rule_of(x).map(|r| r.text).as_deref() != Some(x.as_str()) { return Err("notRule"); } }
    }
    if list == now { return Ok(None); }
    Ok(Some(with(old, &list)))
}

pub fn path(project: &Path) -> PathBuf { project.join(FILE) }

/// The project's rules file: Ok(None) when there is none; Err(UNREADABLE) when it is there but cannot be used here (a link,
/// not a plain file, too big, not text, or not readable).
pub fn read(project: &Path) -> Result<Option<String>, &'static str> {
    match fs::symlink_metadata(project.join(".companion")) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(UNREADABLE),
        Ok(m) if m.file_type().is_symlink() || !m.is_dir() => return Err(UNREADABLE),
        Ok(_) => {}
    }
    let p = path(project);
    match fs::symlink_metadata(&p) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(UNREADABLE),
        Ok(m) if !m.file_type().is_file() || m.len() > MAX_BYTES => return Err(UNREADABLE),
        Ok(_) => {}
    }
    let bytes = fs::read(&p).map_err(|_| UNREADABLE)?;
    String::from_utf8(bytes).map(Some).map_err(|_| UNREADABLE)
}

/// Writes the new text, whole and at once, never through a link. The error is the code the page puts in words.
pub fn write(project: &Path, text: &str) -> Result<(), &'static str> {
    let dot = project.join(".companion");
    match fs::symlink_metadata(&dot) {
        Ok(m) if m.file_type().is_symlink() || !m.is_dir() => return Err("notSaved"),
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => fs::create_dir(&dot).map_err(|_| "notSaved")?,
        Err(_) => return Err("notSaved"),
    }
    let p = path(project);
    if let Ok(m) = fs::symlink_metadata(&p) { if !m.file_type().is_file() { return Err("notSaved"); } }
    crate::logfile::write_atomic(&p, text.as_bytes()).map_err(|_| "notSaved")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cases() -> Vec<Value> { include_str!("../../../protocol/fixtures/rules-cases.jsonl").lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str(l).expect("a case is JSON")).collect() }
    fn dir(name: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-rules-{name}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); d }
    fn def() -> crate::settings::Def { crate::settings::registry().get("rules.house").cloned().expect("rules.house is in the registry") }
    fn list(v: &[&str]) -> Vec<String> { v.iter().map(|s| s.to_string()).collect() }

    #[test]
    fn every_line_is_read_the_same_way_as_the_engine_and_the_pages_read_it() {
        let cs = cases();
        assert!(cs.len() >= 20);
        for c in cs {
            let got = rule_of(c["line"].as_str().unwrap());
            if c["kind"].is_null() { assert_eq!(got, None, "{c}"); }
            else { assert_eq!(got, Some(Rule { kind: match c["kind"].as_str().unwrap() { "never_edit" => "never_edit", "never_run" => "never_run", "ask_edit" => "ask_edit", "ask_run" => "ask_run", _ => "ask_install" }, pattern: c["pattern"].as_str().unwrap().into(), text: c["text"].as_str().unwrap().into() }), "{c}"); }
        }
    }
    #[test]
    fn the_row_shows_each_rule_once_and_never_a_note_or_a_line_not_understood() {
        let text = "# my rules\nnever edit .env\n\nbe nice\nNEVER  edit  .env\nask before installing packages\n";
        assert_eq!(value(Some(text)), list(&["never edit .env", "NEVER edit .env", "ask before installing packages"]));
        assert_eq!(value(None), Vec::<String>::new());
    }
    #[test]
    fn saving_keeps_every_line_it_does_not_understand_exactly_and_adds_new_rules_at_the_end() {
        let old = "# keep me\nnever edit .env\n  be   nice  \nnever run npm publish\n";
        let new = with(Some(old), &list(&["never edit .env", "ask before running git push"]));
        assert_eq!(new, "# keep me\nnever edit .env\n  be   nice  \nask before running git push\n");
        // A rule kept stays exactly as it was written, odd spaces and capitals included.
        assert_eq!(with(Some("NEVER   Edit .env\n"), &list(&["NEVER Edit .env"])), "NEVER   Edit .env\n");
        // Every copy of a rule taken off goes.
        assert_eq!(with(Some("never edit a\nnote\nnever edit a\n"), &list(&[])), "note\n");
        // The file's own line ending, and a file that did not end with one.
        assert_eq!(with(Some("never edit a\r\nnote\r\n"), &list(&["never edit a", "never edit b"])), "never edit a\r\nnote\r\nnever edit b\r\n");
        assert_eq!(with(Some("note"), &list(&[])), "note");
        assert_eq!(with(Some("note"), &list(&["never edit b"])), "note\nnever edit b\n");
        assert_eq!(with(None, &list(&["never edit b"])), "never edit b\n");
    }
    #[test]
    fn a_new_rule_must_be_one_of_the_five_kinds_and_within_the_limits() {
        let d = def();
        assert_eq!(change(&d, None, &json!(["never edit .env"])), Ok(Some("never edit .env\n".into())));
        assert_eq!(change(&d, None, &json!(["please be careful"])), Err("notRule"));
        assert_eq!(change(&d, None, &json!(["never  edit .env"])), Err("notRule"), "a rule is sent as it reads, spaces tidied");
        assert_eq!(change(&d, None, &json!(["never edit x\nnever run y"])), Err("notOneLine"));
        assert_eq!(change(&d, None, &json!([format!("never edit {}", "x".repeat(200))])), Err("tooLong"));
        assert_eq!(change(&d, None, &json!(["never run sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"])), Err("secret"));
        assert_eq!(change(&d, None, &json!(["never edit a", "never edit a"])), Err("duplicate"));
        let many: Vec<String> = (0..51).map(|i| format!("never edit f{i}")).collect();
        assert_eq!(change(&d, None, &json!(many)), Err("tooMany"));
        assert_eq!(change(&d, None, &json!("never edit a")), Err("notList"));
        assert_eq!(change(&d, Some("never edit a\n"), &json!(["never edit a"])), Ok(None), "nothing changes");
    }
    #[test]
    fn taking_rules_off_is_always_possible_even_from_a_long_file_written_by_hand() {
        let d = def();
        let text: String = (0..60).map(|i| format!("never edit f{i}\n")).collect();
        let keep: Vec<String> = (1..60).map(|i| format!("never edit f{i}")).collect();
        let got = change(&d, Some(&text), &json!(keep)).unwrap().unwrap();
        assert!(!got.contains("never edit f0\n") && got.contains("never edit f59\n"));
        // But a long list cannot grow.
        let mut more = keep.clone(); more.push("never edit extra".into());
        assert_eq!(change(&d, Some(&text), &json!(more)), Err("tooMany"));
    }
    #[test]
    fn the_file_is_read_and_written_in_the_projects_own_folder_and_never_through_a_link() {
        let p = dir("rw");
        assert_eq!(read(&p), Ok(None));
        write(&p, "never edit .env\n").unwrap();
        assert_eq!(fs::read_to_string(p.join(FILE)).unwrap(), "never edit .env\n");
        assert_eq!(read(&p), Ok(Some("never edit .env\n".into())));
        #[cfg(unix)] {
            let outside = dir("outside");
            fs::write(outside.join("rules.txt"), "never edit x\n").unwrap();
            // A rules file that is a link: not read, not written.
            let q = dir("link-file");
            fs::create_dir_all(q.join(".companion")).unwrap();
            std::os::unix::fs::symlink(outside.join("rules.txt"), q.join(FILE)).unwrap();
            assert_eq!(read(&q), Err(UNREADABLE));
            assert_eq!(write(&q, "never run y\n"), Err("notSaved"));
            assert_eq!(fs::read_to_string(outside.join("rules.txt")).unwrap(), "never edit x\n");
            // A .companion folder that is a link: the same.
            let r = dir("link-dir");
            std::os::unix::fs::symlink(&outside, r.join(".companion")).unwrap();
            assert_eq!(read(&r), Err(UNREADABLE));
            assert_eq!(write(&r, "never run y\n"), Err("notSaved"));
            assert_eq!(fs::read_to_string(outside.join("rules.txt")).unwrap(), "never edit x\n");
            for d in [outside, q, r] { let _ = fs::remove_dir_all(d); }
        }
        // Not text, or too big: cannot be read here.
        let s = dir("bytes");
        fs::create_dir_all(s.join(".companion")).unwrap();
        fs::write(s.join(FILE), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read(&s), Err(UNREADABLE));
        fs::write(s.join(FILE), "#".repeat(70 * 1024)).unwrap();
        assert_eq!(read(&s), Err(UNREADABLE));
        let _ = fs::remove_dir_all(&s);
        let _ = fs::remove_dir_all(&p);
    }
}
