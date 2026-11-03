//! Crash and log export: one plain text file a friend can send, with no project content. It holds the app's version and the
//! Mac's, which permissions are allowed, what Companion keeps (sizes only), Companion's own activity log (events and times,
//! never what was typed, said or on screen) and the newest crash report if there is one.
//! The rule is an allowlist wherever the content is ours (the activity log keeps only known events and known fields) and
//! a thorough scrub wherever it is not (a crash report): the home folder, the user name, every project folder and its
//! name, the computer's name, identifiers, anything that looks like a key or token, and email addresses.
//! Nothing is sent anywhere; the file goes to Downloads and the person chooses whether to share it.
use serde_json::Value;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const ACTIVITY_LINES: usize = 300;
const CRASH_MAX: u64 = 80 * 1024;
const CRASH_DAYS: u64 = 14;

/// The only events and fields the activity log may contribute. Detailed (developer) logging adds app names and window
/// shapes; none of that is ever exported.
/// Must fix 15: how the engine ended each time (runner_exit) and how the app quit (app_quit) are in it too.
const SAFE_EVENTS: &[&str] = &["launch", "runner_started", "runner_failed", "hotkey", "take_the_wheel", "menu_stop_everything", "menu_hide", "approval_asked", "approval_answered", "runner_exit", "app_quit"];
const SAFE_FIELDS: &[&str] = &["run", "seq", "ev", "t", "ms", "id", "down", "stop_everything", "sent", "reason", "approval", "risk", "tool", "outcome", "code", "signal", "uptime_ms", "starts", "quitting", "from", "voice", "commit"];
/// Must fix 15: the last lines of the engine's own error output (engine.log, already scrubbed when written, scrubbed again
/// here with the rest of the file), each cut short.
const ENGINE_LINES: usize = 60;
const ENGINE_LINE_MAX: usize = 300;

const SECRET_STARTS: &[&str] = &["sk-", "sk_", "pk_live_", "pk_test_", "rk_live_", "ghp_", "gho_", "ghs_", "ghu_", "ghr_", "github_pat_", "glpat-", "xoxb-", "xoxp-", "xoxa-", "xoxs-", "xoxe", "AKIA", "ASIA", "eyJ", "npm_", "AIza", "hf_", "gsk_"];
/// Common folder names that are not worth hiding when they are all that is left of a project's name.
const COMMON_FOLDERS: &[&str] = &["src", "app", "web", "api", "lib", "site", "docs", "dist", "build", "test", "tests", "public", "client", "server", "main", "code", "project", "projects", "home", "users", "tmp"];

fn is_token_char(c: char) -> bool { !(c.is_whitespace() || matches!(c, '"' | '\'' | '(' | ')' | '[' | ']' | '{' | '}' | '<' | '>' | ',' | ';' | '=' | ':' | '`' | '/' | '?' | '&' | '#' | '\\' | '|' | '*')) }

/// ASCII case-insensitive replace of every occurrence of `needle` that sits on a boundary (the next character is not part of
/// a name), because macOS paths do not care about case and `/Users/sam` must not eat `/Users/samuel`.
fn replace_boundary(text: &str, needle: &str, repl: &str) -> String {
    if needle.is_empty() { return text.to_string(); }
    let (tb, nb) = (text.as_bytes(), needle.as_bytes());
    let mut out = String::with_capacity(text.len());
    let (mut i, mut last) = (0, 0);
    while i + nb.len() <= tb.len() {
        if text.is_char_boundary(i) && tb[i..i + nb.len()].eq_ignore_ascii_case(nb) && text.is_char_boundary(i + nb.len()) {
            let next = text[i + nb.len()..].chars().next();
            if next.map_or(true, |c| !(c.is_alphanumeric() || c == '_' || c == '-' || c == '.')) || needle.ends_with('/') {
                out.push_str(&text[last..i]); out.push_str(repl); i += nb.len(); last = i; continue;
            }
        }
        i += 1;
    }
    out.push_str(&text[last..]);
    out
}

fn is_uuid(s: &str) -> bool {
    let p: Vec<&str> = s.split('-').collect();
    p.len() == 5 && [8, 4, 4, 4, 12].iter().zip(&p).all(|(n, x)| x.len() == *n && x.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Replaces what must not leave the Mac. Longer paths first, so a project inside the home folder is named as a project.
/// `names` are other words that identify the person or the machine (the user name, the computer's name).
pub fn scrub(text: &str, home: &str, names: &[String], projects: &[String]) -> String {
    let mut out = text.to_string();
    let mut ps: Vec<(usize, &String)> = projects.iter().enumerate().filter(|(_, p)| p.len() > 1).collect();
    ps.sort_by_key(|(_, p)| std::cmp::Reverse(p.len()));
    for (i, p) in &ps { out = replace_boundary(&out, p, &format!("<project {}>", i + 1)); }
    if home.len() > 1 { out = replace_boundary(&out, home, "~"); }
    for n in names.iter().filter(|n| !n.is_empty()) {
        out = replace_boundary(&out, &format!("/Users/{n}"), "/Users/<user>");
        if n.len() >= 4 { out = replace_boundary(&out, n, "<name>"); }
    }
    // A project's own name wherever it still appears (a stack trace names the folder alone).
    for (i, p) in &ps {
        if let Some(base) = Path::new(p.as_str()).file_name().map(|b| b.to_string_lossy().to_string()) {
            if base.len() >= 3 && !COMMON_FOLDERS.contains(&base.to_lowercase().as_str()) { out = replace_boundary(&out, &base, &format!("<project {}>", i + 1)); }
        }
    }
    // Folders under the home folder that are the person's own: keep the first one only ("~/Desktop/…"), except Library,
    // where Companion's own places are what a log needs.
    out = keep_shallow_home(&out);
    // Keys, tokens, identifiers and email addresses, token by token.
    let mut res = String::with_capacity(out.len());
    let mut tok = String::new();
    let flush = |tok: &mut String, res: &mut String| {
        if tok.is_empty() { return; }
        let core = tok.trim_matches(|c: char| !(c.is_alphanumeric() || matches!(c, '@' | '.' | '-' | '_' | '+' | '%')));
        let secret = core.len() >= 12 && (SECRET_STARTS.iter().any(|s| core.starts_with(s)) || (core.len() >= 32 && core.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') && !is_uuid(core)));
        let email = (core.contains('@') || core.contains("%40")) && core.split(['@']).nth(1).or_else(|| core.split("%40").nth(1)).is_some_and(|d| d.contains('.') && !d.starts_with('.'));
        // An Anthropic key glued onto the letters before it ("tokensk-ant-...") is still a key.
        if let Some(i) = core.find("sk-ant-").filter(|&i| core.len() - i >= 20) { res.push_str(&tok.replacen(&core[i..], "[secret]", 1)); tok.clear(); return; }
        if is_uuid(core) { res.push_str(&tok.replacen(core, "[id]", 1)); }
        else if secret { res.push_str(&tok.replacen(core, "[secret]", 1)); }
        else if email { res.push_str(&tok.replacen(core, "[email]", 1)); }
        else { res.push_str(tok); }
        tok.clear();
    };
    for c in out.chars() { if is_token_char(c) { tok.push(c); } else { flush(&mut tok, &mut res); res.push(c); } }
    flush(&mut tok, &mut res);
    res
}

/// "~/Desktop/acme-rebrand/x.js" becomes "~/Desktop/…"; "~/Library/Application Support/dev.companion.app/x" stays.
fn keep_shallow_home(text: &str) -> String {
    // "Application Support" holds a space, which would end a path early.
    let text = text.replace("Application Support", "Application\u{1}Support");
    let mut out = String::with_capacity(text.len());
    let mut rest = text.as_str();
    while let Some(i) = rest.find("~/") {
        out.push_str(&rest[..i + 2]);
        let after = &rest[i + 2..];
        let end = after.find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '<' | '>' | ',' | ')' | '(' | ']' | '[' | '}' | '{' | '`')).unwrap_or(after.len());
        let path = &after[..end];
        let parts: Vec<&str> = path.split('/').collect();
        let keep = if parts[0] == "Library" { 3 } else { 1 };
        if parts.len() > keep { out.push_str(&parts[..keep].join("/")); out.push_str("/…"); } else { out.push_str(path); }
        rest = &after[end..];
    }
    out.push_str(rest);
    out.replace("Application\u{1}Support", "Application Support")
}

/// The activity log, kept to what Companion wrote about itself: known events only, known fields only, free text cut short.
/// Anything else (detailed developer logging, lines that are not ours) is dropped, never trusted.
pub fn safe_activity(raw: &str) -> String {
    raw.lines().filter_map(|l| {
        let v: Value = serde_json::from_str(l).ok()?;
        let o = v.as_object()?;
        if !SAFE_EVENTS.contains(&o.get("ev")?.as_str()?) { return None; }
        let kept: serde_json::Map<String, Value> = o.iter().filter(|(k, _)| SAFE_FIELDS.contains(&k.as_str())).map(|(k, v)| (k.clone(), match v { Value::String(s) => Value::String(s.chars().take(120).collect()), other => other.clone() })).collect();
        Some(Value::Object(kept).to_string())
    }).collect::<Vec<_>>().join("\n")
}

pub struct Facts { pub version: String, pub macos: String, pub arch: String, pub permissions: Vec<(String, String)>, pub key_saved: bool, pub speech_ready: bool, pub browser_installed: bool, pub kept: Vec<(String, u64)> }

/// Must fix 6: the commit this build came from (build.rs), as About, the launch log line and the support file show it.
pub const BUILD_COMMIT: &str = env!("SQUIBBY_COMMIT");
/// The version with its commit, as the support file and About show it: "0.1.0 (commit 1a2b3c4d5e6f)".
pub fn version_label(version: &str, commit: &str) -> String { if commit.is_empty() { version.to_string() } else { format!("{version} (commit {commit})") } }

/// The last `n` lines of a text.
pub fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

fn kb(n: u64) -> String { if n < 1024 { "under 1 KB".into() } else if n < 1024 * 1024 { format!("{} KB", n / 1024) } else { format!("{} MB", n / (1024 * 1024)) } }

/// A crash report cut to the part a developer needs: everything before the list of loaded libraries and apps (which names
/// other software on the Mac), whole lines only, and at most the size limit.
pub fn crash_part(text: &str) -> String {
    let mut end = text.len();
    for marker in ["Binary Images:", "\"usedImages\"", "\"usedImages\":", "Extended Crash Information"] { if let Some(i) = text.find(marker) { end = end.min(i); } }
    // Cut by size on a whole line; a cut at a marker already sits on one.
    let by_size = end > CRASH_MAX as usize;
    let mut stop = end.min(CRASH_MAX as usize);
    while !text.is_char_boundary(stop) { stop -= 1; }
    let mut cut = &text[..stop];
    if by_size { if let Some(i) = cut.rfind('\n') { cut = &cut[..i]; } }
    cut.to_string()
}

/// The whole file, scrubbed. `activity` is the raw activity log, `crash` the newest crash report as (file name, text).
pub fn compose(f: &Facts, activity: &str, crash: Option<(&str, &str)>, home: &str, names: &[String], projects: &[String]) -> String {
    compose_all(f, activity, "", crash, home, names, projects)
}
/// The same, with the engine's own error output (`engine`, the text of engine.log) after the activity log (must fix 15).
pub fn compose_all(f: &Facts, activity: &str, engine: &str, crash: Option<(&str, &str)>, home: &str, names: &[String], projects: &[String]) -> String {
    let yes = |b: bool| if b { "yes" } else { "no" };
    let mut s = String::new();
    s.push_str(concat!(crate::product!(), " support log\n"));
    s.push_str("This file holds no project content, no typed or spoken words and nothing from your screen. It is safe to send.\n\n");
    s.push_str(&format!(concat!(crate::product!(), " version: {}\nmacOS: {} ({})\n\n"), f.version, f.macos, f.arch));
    s.push_str("Permissions (allowed or not):\n");
    for (k, v) in &f.permissions { s.push_str(&format!("  {k}: {v}\n")); }
    s.push_str(&format!("\nClaude key saved in the Keychain: {}\nSpeech model downloaded: {}\nHidden browser installed: {}\n", yes(f.key_saved), yes(f.speech_ready), yes(f.browser_installed)));
    s.push_str(concat!("\nWhat ", crate::product!(), " keeps on this Mac (sizes only):\n"));
    for (k, b) in &f.kept { s.push_str(&format!("  {k}: {}\n", kb(*b))); }
    s.push_str("\nActivity log (the last events, with times; no content):\n");
    s.push_str(&tail_lines(&safe_activity(activity), ACTIVITY_LINES));
    s.push('\n');
    let engine_tail = tail_lines(engine, ENGINE_LINES).lines().map(|l| l.chars().take(ENGINE_LINE_MAX).collect::<String>()).collect::<Vec<_>>().join("\n");
    if engine_tail.trim().is_empty() { s.push_str("\nNo messages from the engine.\n"); } else { s.push_str(&format!("\nMessages from the engine (the last lines, scrubbed):\n{engine_tail}\n")); }
    if let Some((name, text)) = crash { s.push_str(&format!("\nNewest crash report ({name}):\n{}\n", crash_part(text))); } else { s.push_str("\nNo recent crash report.\n"); }
    scrub(&s, home, names, projects)
}

/// The start of a support log's file name ("squibby-logs"): the product in lower case, from protocol/names.json.
pub fn logs_stem() -> String { format!("{}-logs", crate::names::product().to_lowercase()) }

/// <product>-logs-<stamp>.txt (the product in lower case, e.g. squibby-logs-...), then -2, -3 ... when that name is taken; never replaces a file.
pub fn unique_path(dir: &Path, stamp: &str, taken: impl Fn(&Path) -> bool) -> PathBuf {
    for n in 1..1000 {
        let stem = logs_stem();
        let name = if n == 1 { format!("{stem}-{stamp}.txt") } else { format!("{stem}-{stamp}-{n}.txt") };
        let p = dir.join(name);
        if !taken(&p) { return p; }
    }
    dir.join(format!("{}-{stamp}-{}.txt", logs_stem(), std::process::id()))
}

/// The newest crash report of Companion in the last two weeks, if any: a real file only (never a link), not dated in the
/// future, read only as far as the size limit.
pub fn latest_crash(dir: &Path, now: std::time::SystemTime) -> Option<(String, String)> {
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for e in fs::read_dir(dir).ok()?.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        // A crash report is named after the program that crashed: the executable (companion-app, which a rename does not change) or the product.
        if !((lower.starts_with("companion") || lower.starts_with(&crate::names::product().to_lowercase())) && (lower.ends_with(".ips") || lower.ends_with(".crash"))) { continue; }
        let Ok(m) = fs::symlink_metadata(e.path()) else { continue };
        if !m.is_file() { continue; }
        let Ok(t) = m.modified() else { continue };
        if t > now + std::time::Duration::from_secs(86_400) { continue; }
        if now.duration_since(t).map(|d| d.as_secs() > CRASH_DAYS * 86_400).unwrap_or(false) { continue; }
        if best.as_ref().map_or(true, |(bt, _)| t > *bt) { best = Some((t, e.path())); }
    }
    let (_, p) = best?;
    let mut buf = Vec::new();
    fs::File::open(&p).ok()?.take(CRASH_MAX + 1).read_to_end(&mut buf).ok()?;
    Some((p.file_name()?.to_string_lossy().to_string(), String::from_utf8_lossy(&buf).to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};
    const HOME: &str = "/Users/sam";
    fn n(v: &[&str]) -> Vec<String> { v.iter().map(|s| s.to_string()).collect() }

    #[test]
    fn a_key_glued_onto_the_letters_before_it_is_still_covered() {
        let k = "sk-ant-api03-AbCdEfGhIjKlMnOpQrSt";
        for glued in [format!("token{k}"), format!("\u{e9}{k}"), format!("x{k}trailing"), format!("see:{k}")] {
            let out = scrub(&glued, "/Users/sam", &[], &[]);
            assert!(!out.contains("AbCdEfGhIjKl"), "{glued} -> {out}");
        }
        // Words that merely contain the letters are left alone.
        assert_eq!(scrub("ask-another-question", "/Users/sam", &[], &[]), "ask-another-question");
    }
    #[test]
    fn the_home_folder_the_user_name_and_every_project_are_scrubbed_and_projects_win_over_the_home() {
        let t = scrub("opened /Users/sam/Developer/shop/src/App.tsx and /Users/sam/Library/x and /Users/sam", HOME, &n(&["sam"]), &["/Users/sam/Developer/shop".into()]);
        assert_eq!(t, "opened <project 1>/src/App.tsx and ~/Library/x and ~");
        assert_eq!(scrub("/Users/sam/x /Users/other/y", "/Users/sam", &n(&["sam"]), &[]), "~/x /Users/other/y");
        assert_eq!(scrub("/Volumes/Work/sam/docs", HOME, &n(&["sam"]), &[]), "/Volumes/Work/sam/docs");   // a short name is only rewritten as a user folder
    }
    #[test]
    fn paths_match_without_regard_to_case_and_a_longer_name_is_not_eaten() {
        assert_eq!(scrub("/users/SAM/documents/x and /Users/samuel/y", HOME, &[], &[]), "~/documents/… and /Users/samuel/y");
        assert!(scrub("/Users/Sam/Developer/Shop/a.js", HOME, &[], &["/Users/sam/Developer/shop".into()]).starts_with("<project 1>"));
    }
    #[test]
    fn a_projects_name_is_covered_even_without_its_path_but_common_folder_names_are_not() {
        let t = scrub("Error in acme-rebrand at line 4; see src and app", HOME, &[], &["/Users/sam/Desktop/acme-rebrand".into(), "/Users/sam/code/app".into()]);
        assert_eq!(t, "Error in <project 1> at line 4; see src and app");
    }
    #[test]
    fn only_the_first_folder_under_home_survives_and_librarys_companion_places_do() {
        assert_eq!(scrub("/Users/sam/Desktop/acme-rebrand/x.js", HOME, &[], &[]), "~/Desktop/…");
        assert_eq!(scrub("/Users/sam/Library/Application Support/dev.companion.app/runner/tasks.db", HOME, &[], &[]), "~/Library/Application Support/dev.companion.app/…");
    }
    #[test]
    fn keys_tokens_and_emails_are_covered_wherever_they_sit() {
        let t = scrub(r#"key="sk-ant-api03-AbCdEfGhIjKlMnOpQrSt" token: ghp_abcdefghijklmnopqrstuvwxyz0123 mail (sam@example.com), aws AKIAABCDEFGHIJKLMNOP jwt eyJhbGciOiJIUzI1NiJ9.abc.def https://x.io/v1/sk-ant-api03-AbCdEfGhIjKlMnOpQrSt?x=1 /tmp/sk-ant-api03-AbCdEfGhIjKlMnOpQrSt sam+tag@x.com sam%40x.com hf_abcdefghijklmnopqrstuvwxyz0123 0123456789abcdef0123456789abcdef0123456789abcdef"#, HOME, &n(&["sam"]), &[]);
        for leaked in ["sk-ant", "ghp_", "@example", "AKIAABC", "eyJhbGci", "+tag", "%40x", "hf_abc", "0123456789abcdef0123"] { assert!(!t.contains(leaked), "{leaked} in {t}"); }
        assert!(t.contains("[secret]") && t.contains("[email]"));
    }
    #[test]
    fn identifiers_in_a_crash_report_are_covered() {
        let t = scrub("incident 6F9619FF-8B86-D011-B42D-00C04FC964FF on Sams-MacBook-Pro.local for \"Sam's Mac\"", HOME, &n(&["Sams-MacBook-Pro.local", "Sam's Mac"]), &[]);
        assert!(!t.contains("6F9619FF") && !t.contains("Sams-MacBook") && !t.contains("Sam's Mac"), "{t}");
    }
    #[test]
    fn ordinary_text_is_left_alone() {
        let s = "launch ms=12 ev=hotkey id=F run=1760000000-4321 seq=7 version 0.0.1 sk is short";
        assert_eq!(scrub(s, HOME, &n(&["sam"]), &[]), s);
    }
    #[test]
    fn the_activity_log_keeps_only_known_events_and_known_fields() {
        let raw = [
            r#"{"run":"1-2","seq":1,"ev":"launch","t":1,"ms":0}"#,
            r#"{"run":"1-2","seq":2,"ev":"hotkey","id":"F","down":true,"front":"Zoom - Acme Client"}"#,
            r#"{"run":"1-2","seq":3,"ev":"front_app_changed","to":"Mail"}"#,
            r#"{"run":"1-2","seq":4,"ev":"prompt_help_step","app":"com.apple.mail"}"#,
            r#"{"run":"1-2","seq":5,"ev":"runner_failed","reason":"could not start the engine"}"#,
            "not json at all",
        ].join("\n");
        let out = safe_activity(&raw);
        assert!(out.contains("\"ev\":\"launch\"") && out.contains("\"ev\":\"hotkey\"") && out.contains("\"ev\":\"runner_failed\""));
        for gone in ["Zoom", "Acme", "front_app_changed", "Mail", "prompt_help_step", "com.apple.mail", "not json"] { assert!(!out.contains(gone), "{gone}"); }
        let long = format!(r#"{{"ev":"runner_failed","reason":"{}"}}"#, "x".repeat(500));
        assert!(safe_activity(&long).len() < 200);
    }
    #[test]
    fn an_approval_asked_and_answered_shows_in_the_report_without_any_words_from_the_question() {
        let raw = [
            r#"{"run":"1-2","seq":1,"ev":"approval_asked","approval":"ap_1","risk":"git","tool":"Bash","title":"pushes SECRET_NAME","t":1,"ms":2}"#,
            r#"{"run":"1-2","seq":2,"ev":"approval_answered","approval":"ap_1","outcome":"yes","t":3,"ms":4}"#,
        ].join("\n");
        let out = safe_activity(&raw);
        assert!(out.contains("\"ev\":\"approval_asked\"") && out.contains("\"risk\":\"git\"") && out.contains("\"tool\":\"Bash\""));
        assert!(out.contains("\"ev\":\"approval_answered\"") && out.contains("\"outcome\":\"yes\""));
        assert!(!out.contains("SECRET_NAME") && !out.contains("title"));
    }
    #[test]
    fn a_crash_report_loses_the_list_of_other_software_and_ends_on_a_whole_line() {
        let t = format!("Exception: SIGSEGV\nThread 0 crashed\n  0 main\nBinary Images:\n  0x1 com.1password.app\n");
        assert_eq!(crash_part(&t), "Exception: SIGSEGV\nThread 0 crashed\n  0 main\n");
        let ips = concat!("{\"app_name\":\"", crate::product!(), "\"}\n{\"exception\":\"x\",\"usedImages\":[{\"path\":\"/Applications/Zoom.app\"}]}");
        assert!(!crash_part(ips).contains("Zoom"));
        let big = "line of text\n".repeat(20_000);
        let c = crash_part(&big); assert!(c.len() <= CRASH_MAX as usize && c.ends_with("text"));
    }
    #[test]
    fn the_file_has_the_facts_the_activity_and_the_crash_and_nothing_unscrubbed() {
        let f = Facts { version: "0.0.1".into(), macos: "27.0.1".into(), arch: "arm64".into(), permissions: vec![("Screen Recording".into(), "allowed".into()), ("Microphone".into(), "not asked yet".into())], key_saved: true, speech_ready: false, browser_installed: true, kept: vec![("undo snapshots".into(), 5 * 1024 * 1024), ("history".into(), 300)] };
        let activity = (1..=400).map(|i| format!("{{\"seq\":{i},\"ev\":\"hotkey\",\"id\":\"F\",\"front\":\"Zoom\"}}")).collect::<Vec<_>>().join("\n");
        let out = compose(&f, &activity, Some((concat!(crate::product!(), "-2026.ips"), "crash in /Users/sam/Developer/shop token sk-ant-api03-AbCdEfGhIjKlMnOp")), HOME, &n(&["sam"]), &["/Users/sam/Developer/shop".into()]);
        assert!(out.contains(concat!(crate::product!(), " version: 0.0.1")) && out.contains("macOS: 27.0.1 (arm64)") && out.contains("Screen Recording: allowed") && out.contains("Claude key saved in the Keychain: yes"));
        assert!(out.contains("undo snapshots: 5 MB") && out.contains("history: under 1 KB"));
        assert!(out.contains("\"seq\":400") && !out.contains("\"seq\":100,") && out.matches("\"ev\":\"hotkey\"").count() == ACTIVITY_LINES);
        assert!(out.contains(concat!(crate::product!(), "-2026.ips")) && out.contains("<project 1>"));
        for leaked in ["/Users/sam", "shop", "sk-ant", "sam", "Zoom"] { assert!(!out.contains(leaked), "{leaked}"); }
    }
    #[test]
    fn how_the_engine_ended_how_the_app_quit_and_the_engines_messages_are_in_the_file() {
        // Must fix 15.
        let raw = [
            r#"{"run":"1-2","seq":1,"ev":"runner_exit","code":null,"signal":6,"uptime_ms":5000,"starts":2,"quitting":false,"t":1,"ms":2}"#,
            r#"{"run":"1-2","seq":2,"ev":"app_quit","from":"menu","voice":"closed","t":3,"ms":4}"#,
        ].join("\n");
        let out = safe_activity(&raw);
        for want in ["\"ev\":\"runner_exit\"", "\"signal\":6", "\"uptime_ms\":5000", "\"starts\":2", "\"ev\":\"app_quit\"", "\"from\":\"menu\"", "\"voice\":\"closed\""] { assert!(out.contains(want), "{want}: {out}"); }
        let f = Facts { version: "v".into(), macos: "m".into(), arch: "a".into(), permissions: vec![], key_saved: false, speech_ready: false, browser_installed: false, kept: vec![] };
        let engine = (1..=100).map(|i| format!("1700000000 line {i} in /Users/sam/Developer/shop with sk-ant-api03-AbCdEfGhIjKlMnOp {}", "x".repeat(400))).collect::<Vec<_>>().join("\n");
        let file = compose_all(&f, &raw, &engine, None, HOME, &n(&["sam"]), &["/Users/sam/Developer/shop".into()]);
        assert!(file.contains("Messages from the engine") && file.contains("line 100") && !file.contains("line 40 "), "{file}");
        for leaked in ["/Users/sam", "shop", "sk-ant", "AbCdEfGh"] { assert!(!file.contains(leaked), "{leaked}"); }
        assert!(file.lines().all(|l| l.chars().count() <= 400));
        assert!(compose(&f, "", None, HOME, &n(&["sam"]), &[]).contains("No messages from the engine."));
        // The app's export reads engine.log.
        let main = include_str!("main.rs");
        assert!(main.contains("logexport::compose_all(&facts, &activity, &engine,"));
    }
    #[test]
    fn the_build_knows_its_commit_and_the_support_file_and_the_launch_line_carry_it() {
        // Must fix 6: a tester's report can be matched to the source it was built from.
        assert!(!BUILD_COMMIT.is_empty());
        assert!(BUILD_COMMIT == "unknown" || BUILD_COMMIT.chars().take(12).all(|c| c.is_ascii_hexdigit()), "{BUILD_COMMIT}");
        assert_eq!(version_label("0.1.0", "1a2b3c4d5e6f"), "0.1.0 (commit 1a2b3c4d5e6f)");
        let f = Facts { version: version_label("0.1.0", "1a2b3c4d5e6f"), macos: "m".into(), arch: "a".into(), permissions: vec![], key_saved: false, speech_ready: false, browser_installed: false, kept: vec![] };
        let out = compose(&f, r#"{"run":"1-2","seq":1,"ev":"launch","commit":"1a2b3c4d5e6f","t":1,"ms":0}"#, None, HOME, &n(&["sam"]), &[]);
        assert!(out.contains(concat!(crate::product!(), " version: 0.1.0 (commit 1a2b3c4d5e6f)")), "{out}");
        assert!(out.contains("\"commit\":\"1a2b3c4d5e6f\""), "the launch line keeps its commit: {out}");
        let main = include_str!("main.rs");
        assert!(main.contains("version: logexport::version_label(env!(\"CARGO_PKG_VERSION\"), logexport::BUILD_COMMIT)"), "the support file uses it");
        assert!(main.contains("log(\"launch\", json!({ \"commit\": logexport::BUILD_COMMIT }))"), "the launch line logs it");
        assert!(main.contains("\"commit\": logexport::BUILD_COMMIT"), "About is told it");
    }
    #[test]
    fn no_crash_says_so() {
        let f = Facts { version: "v".into(), macos: "m".into(), arch: "a".into(), permissions: vec![], key_saved: false, speech_ready: false, browser_installed: false, kept: vec![] };
        assert!(compose(&f, "", None, HOME, &n(&["sam"]), &[]).contains("No recent crash report."));
    }
    #[test]
    fn the_file_never_replaces_another() {
        let d = Path::new("/Users/sam/Downloads");
        assert_eq!(unique_path(d, "2026-10-12-2012", |_| false), d.join(format!("{}-2026-10-12-2012.txt", logs_stem())));
        assert_eq!(unique_path(d, "2026-10-12-2012", |p| p.ends_with(format!("{}-2026-10-12-2012.txt", logs_stem()))), d.join(format!("{}-2026-10-12-2012-2.txt", logs_stem())));
    }
    #[test]
    fn the_newest_recent_real_crash_report_of_companion_is_found_read_only_to_the_limit() {
        let dir = std::env::temp_dir().join(format!("companion-crash-{}", std::process::id())); let _ = fs::remove_dir_all(&dir); fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(concat!(crate::product!(), "-old.ips")), "old").unwrap(); fs::write(dir.join("Safari-new.ips"), "not ours").unwrap(); fs::write(dir.join("companion-app-2026-10-12.ips"), "x".repeat(200_000)).unwrap();
        fs::File::options().write(true).open(dir.join(concat!(crate::product!(), "-old.ips"))).unwrap().set_modified(SystemTime::now() - Duration::from_secs(30 * 86_400)).unwrap();
        // a link named like a report, and a report dated in the future, are never the newest
        let secret = std::env::temp_dir().join(format!("companion-secret-{}", std::process::id())); fs::write(&secret, "top secret").unwrap();
        std::os::unix::fs::symlink(&secret, dir.join(concat!(crate::product!(), "-link.ips"))).unwrap();
        fs::write(dir.join(concat!(crate::product!(), "-future.ips")), "future").unwrap();
        fs::File::options().write(true).open(dir.join(concat!(crate::product!(), "-future.ips"))).unwrap().set_modified(SystemTime::now() + Duration::from_secs(10 * 86_400)).unwrap();
        let (name, text) = latest_crash(&dir, SystemTime::now()).unwrap();
        assert_eq!(name, "companion-app-2026-10-12.ips"); assert_eq!(text.len(), CRASH_MAX as usize + 1);
        fs::remove_file(dir.join("companion-app-2026-10-12.ips")).unwrap();
        assert!(latest_crash(&dir, SystemTime::now()).is_none());   // what is left: a month old, a link, one from the future
        let _ = fs::remove_dir_all(&dir); let _ = fs::remove_file(&secret);
    }
    /// Real files, no output of their content: this Mac's own activity log and newest crash report go through the
    /// same steps as the export, and neither the home folder nor the user name may survive. Run with --ignored.
    #[test]
    #[ignore]
    fn this_macs_real_log_and_crash_report_leave_nothing_behind() {
        let home = std::env::var("HOME").unwrap(); let user = std::env::var("USER").unwrap();
        let data = Path::new(&home).join("Library/Application Support/dev.companion.app");
        let activity = [data.join("events.jsonl.1"), data.join("events.jsonl")].iter().filter_map(|p| fs::read_to_string(p).ok()).collect::<Vec<_>>().join("\n");
        let crash = latest_crash(&Path::new(&home).join("Library/Logs/DiagnosticReports"), SystemTime::now());
        let f = Facts { version: "v".into(), macos: "m".into(), arch: "a".into(), permissions: vec![], key_saved: false, speech_ready: false, browser_installed: false, kept: vec![] };
        let out = compose(&f, &activity, crash.as_ref().map(|(n, t)| (n.as_str(), t.as_str())), &home, &[user.clone()], &[format!("{home}/Developer/companion"), format!("{home}/Developer/companion-playground")]);
        eprintln!("activity bytes {}, kept lines {}, crash report {}, output bytes {}", activity.len(), safe_activity(&activity).lines().count(), crash.as_ref().map(|c| c.0.as_str()).unwrap_or("none"), out.len());
        assert!(!out.contains(&home) && !out.contains(&format!("/Users/{user}")), "the home folder survived");
        assert!(!out.contains("sk-ant-") && !out.contains("companion-playground") && !out.to_lowercase().contains(&user.to_lowercase()));
    }
}
