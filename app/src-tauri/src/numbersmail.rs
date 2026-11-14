//! M88 (a): Send these numbers. Only on the second press on Your numbers (the first shows the exact JSON), only from Home.
//! The shell checks the JSON again before anything leaves the page: counts and dates only, the known keys and nothing else,
//! so no project name, file name, word from a review or path can ride along. Then it opens a mail draft in the person's own
//! mail app (a `mailto:` link through the Mac's `open`): nothing is sent until the person sends it. The address comes from
//! the one config spot, `app/src/numbers.json` (empty until the founder sets one: the draft's To line is then empty). The
//! numbers themselves are never logged.
use serde_json::Value;

/// The config spot, read at build time so the pages and the shell use the same file.
const CONFIG: &str = include_str!("../../src/numbers.json");
/// The most text the JSON may be (it is about 400 letters).
pub const MAX_JSON: usize = 2_000;
/// The largest count it may hold.
const MAX_COUNT: u64 = 1_000_000;
const TOP: [&str; 10] = ["numbers", "from", "to", "changesReviewed", "filesReviewed", "caught", "fixesProven", "undos", "savedCopies", "savedCopiesUsed"];
const OPTIONAL: [&str; 3] = ["jobsHanded", "aiToolsConnected", "daysUsed"];
const CAUGHT: [&str; 4] = ["keys", "weakenedChecks", "falseDones", "riskyPackages"];

fn count(v: &Value) -> bool { v.as_u64().is_some_and(|n| n <= MAX_COUNT) }
fn day(v: &Value) -> bool {
    let Some(s) = v.as_str() else { return false };
    let b = s.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

/// The numbers must be exactly the page's shape: the known keys, whole counts and two days. Anything else is refused.
pub fn check_json(text: &str) -> Result<(), &'static str> {
    if text.is_empty() || text.len() > MAX_JSON { return Err("notNumbers"); }
    let v: Value = serde_json::from_str(text).map_err(|_| "notNumbers")?;
    let o = v.as_object().ok_or("notNumbers")?;
    if !TOP.iter().all(|k| o.contains_key(*k)) { return Err("notNumbers"); }
    for (k, x) in o {
        let ok = match k.as_str() {
            "numbers" => x.as_u64() == Some(1),
            "from" | "to" => day(x),
            "caught" => x.as_object().is_some_and(|c| c.len() == CAUGHT.len() && CAUGHT.iter().all(|ck| c.get(*ck).is_some_and(count))),
            "daysUsed" => x.as_u64().is_some_and(|n| n <= 8),
            k if TOP.contains(&k) || OPTIONAL.contains(&k) => count(x),
            _ => false,
        };
        if !ok { return Err("notNumbers"); }
    }
    Ok(())
}

/// The subject's words (strings.ts): one short plain line.
pub fn check_subject(s: &str) -> Result<(), &'static str> {
    if s.trim().is_empty() || s.chars().count() > 80 || s.chars().any(|c| c.is_control() || crate::share::hidden_char(c)) { return Err("notNumbers"); }
    Ok(())
}

/// The address from the config: a plain email address, or empty for anything else.
pub fn address(config: &str) -> String {
    let to = serde_json::from_str::<Value>(config).ok().and_then(|v| v.get("to").and_then(|t| t.as_str()).map(str::to_string)).unwrap_or_default();
    let plain = !to.is_empty() && to.len() <= 200 && to.matches('@').count() == 1 && to.chars().all(|c| c.is_ascii_alphanumeric() || "@.-_+".contains(c))
        && to.split('@').nth(1).is_some_and(|d| d.contains('.') && !d.starts_with('.') && !d.ends_with('.'));
    if plain { to } else { String::new() }
}
/// The address as built into this app.
pub fn configured() -> String { address(CONFIG) }

fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { out.push(b as char); } else { out.push_str(&format!("%{b:02X}")); }
    }
    out
}

/// The mail draft's link: the address (or none), the subject and the JSON as the body, every part percent encoded, so
/// nothing in them can add a recipient or a header.
pub fn mailto(to: &str, subject: &str, body: &str) -> String {
    let to = address(&serde_json::json!({ "to": to }).to_string());
    format!("mailto:{to}?subject={}&body={}", encode(subject), encode(body))
}

#[cfg(test)]
mod tests {
    use super::*;
    const OK: &str = r#"{"numbers":1,"from":"2026-11-07","to":"2026-11-14","changesReviewed":6,"filesReviewed":14,"caught":{"keys":1,"weakenedChecks":1,"falseDones":2,"riskyPackages":1},"fixesProven":3,"undos":1,"savedCopies":2,"savedCopiesUsed":1,"jobsHanded":4,"aiToolsConnected":2,"daysUsed":5}"#;

    #[test]
    fn only_counts_and_dates_pass() {
        assert!(check_json(OK).is_ok());
        let without: Value = { let mut v: Value = serde_json::from_str(OK).unwrap(); for k in OPTIONAL { v.as_object_mut().unwrap().remove(k); } v };
        assert!(check_json(&without.to_string()).is_ok(), "the counts an older engine does not send may be missing");
        for (k, bad) in [("project", r#""mug-shop""#), ("file", r#""src/App.tsx""#), ("summary", r#""Fixed the login""#)] {
            let mut v: Value = serde_json::from_str(OK).unwrap(); v[k] = serde_json::from_str(bad).unwrap();
            assert!(check_json(&v.to_string()).is_err(), "{k} must never ride along");
        }
        for (k, bad) in [("changesReviewed", "-1"), ("undos", "1.5"), ("fixesProven", r#""3""#), ("from", r#""last week""#), ("to", r#""2026-11-14T10:00:00Z""#), ("daysUsed", "9"), ("numbers", "2"), ("savedCopies", "10000000")] {
            let mut v: Value = serde_json::from_str(OK).unwrap(); v[k] = serde_json::from_str(bad).unwrap();
            assert!(check_json(&v.to_string()).is_err(), "{k}={bad}");
        }
        let mut v: Value = serde_json::from_str(OK).unwrap(); v["caught"]["note"] = Value::from("the key was sk-live-123");
        assert!(check_json(&v.to_string()).is_err(), "no words inside what was caught either");
        let mut v: Value = serde_json::from_str(OK).unwrap(); v.as_object_mut().unwrap().remove("undos");
        assert!(check_json(&v.to_string()).is_err());
        assert!(check_json("").is_err() && check_json("[]").is_err() && check_json(&"x".repeat(MAX_JSON + 1)).is_err());
    }
    #[test]
    fn the_address_is_plain_or_empty_and_the_built_in_one_is_empty_until_set() {
        assert_eq!(address(r#"{"to":"numbers@squibby.app"}"#), "numbers@squibby.app");
        assert_eq!(address(r#"{"to":""}"#), "");
        for bad in [r#"{"to":"a@b"}"#, r#"{"to":"a@b.com,c@d.com"}"#, r#"{"to":"a@b.com?bcc=x@y.com"}"#, r#"{"to":"a b@c.com"}"#, r#"{"to":5}"#, "not json"] { assert_eq!(address(bad), "", "{bad}"); }
        assert_eq!(configured(), "", "a placeholder until the founder sets one");
    }
    #[test]
    fn the_link_encodes_every_part_so_nothing_adds_a_recipient_or_a_header() {
        let m = mailto("", "My numbers", OK);
        assert!(m.starts_with("mailto:?subject=My%20numbers&body=%7B%22numbers%22%3A1"));
        assert!(!m[7..].contains('@') && m.matches('&').count() == 1 && m.matches('?').count() == 1);
        let m = mailto("numbers@squibby.app", "a&cc=x@y.com", "b\r\nBcc: z@w.com");
        assert!(m.starts_with("mailto:numbers@squibby.app?subject=a%26cc%3Dx%40y.com&body=b%0D%0ABcc%3A%20z%40w.com"));
        assert!(mailto("a@b.com?bcc=x@y.com", "s", "b").starts_with("mailto:?subject="), "an address that is not plain is dropped");
        assert!(check_subject("My Squibby numbers").is_ok());
        assert!(check_subject("").is_err() && check_subject("a\nb").is_err() && check_subject(&"x".repeat(81)).is_err());
    }
    #[test]
    fn the_command_is_home_only_checks_first_and_never_logs_the_numbers() {
        let src = include_str!("shell_tools.rs");
        let f = &src[src.find("fn numbers_mail(").expect("numbers_mail")..]; let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("settings::only_card(window.label())"));
        assert!(f.find("numbersmail::check_json(").unwrap() < f.find("/usr/bin/open").unwrap(), "checked before the draft opens");
        assert!(f.contains("numbersmail::configured()"), "the address only from the config");
        assert!(!f.contains("json!({ \"json\"") && !f.contains("\"body\""), "the numbers are never logged");
    }
}
