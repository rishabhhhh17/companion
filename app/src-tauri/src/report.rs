//! Report a problem (Settings): Companion saves the cleaned support log (logexport, the same file as "Save a log for
//! support"), then opens an email draft in the person's own mail app, or the report page if one is set, with only two
//! things from this Mac filled in: Companion's version and the Mac's version. No log content, name, folder or project ever
//! goes into the address; the person attaches the saved file themselves and sends it themselves. Companion sends nothing.
//! Where reports go is `report.json` (an email address or an https page), empty until the founder fills it in; with
//! neither, the draft has no recipient and the person picks one.
use serde::Deserialize;

#[derive(Debug, Default, Deserialize, PartialEq, Clone)]
pub struct Config { #[serde(default)] pub email: String, #[serde(default)] pub page: String }

fn plain_email(s: &str) -> bool {
    let Some((local, domain)) = s.split_once('@') else { return false };
    s.len() <= 254 && !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
        && local.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
        && domain.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
}

fn plain_page(s: &str) -> bool { s.starts_with("https://") && s.len() <= 300 && !s.contains('#') && crate::share::web_link(s).is_some() }

/// The settings file. Anything that is not a plain email address or a secure page is left out, never guessed.
pub fn parse_config(text: &str) -> Config {
    let c: Config = serde_json::from_str(text).unwrap_or_default();
    let (email, page) = (c.email.trim(), c.page.trim());
    Config { email: if plain_email(email) { email.to_string() } else { String::new() }, page: if plain_page(page) { page.to_string() } else { String::new() } }
}

/// A version as it may be sent: digits and dots (up to four parts), with an optional short tag ("0.2.0-beta.1"). Anything
/// else (a damaged answer from the Mac, a path, a name) becomes "unknown".
pub fn plain_version(s: &str) -> String {
    let s = s.trim();
    let (core, tag) = match s.split_once('-') { Some((c, t)) => (c, Some(t)), None => (s, None) };
    let parts: Vec<&str> = core.split('.').collect();
    let core_ok = (1..=4).contains(&parts.len()) && parts.iter().all(|p| !p.is_empty() && p.len() <= 6 && p.chars().all(|c| c.is_ascii_digit()));
    let tag_ok = tag.is_none_or(|t| !t.is_empty() && t.len() <= 12 && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '.'));
    if core_ok && tag_ok { s.to_string() } else { "unknown".to_string() }
}

/// Words for the draft: plain text of at most `max` characters, new lines allowed, nothing hidden or controlling.
pub fn plain_text(s: &str, max: usize) -> Option<String> {
    let t = s.trim();
    if t.is_empty() || t.chars().count() > max { return None; }
    if t.chars().any(|c| (c.is_control() && c != '\n') || crate::share::hidden_char(c)) { return None; }
    Some(t.to_string())
}

/// Percent encoding for an address: everything but letters, digits and - . _ ~ is encoded, a space as %20.
fn encode(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// The address to open: the report page with the two versions, or else an email draft (to the set address, or to nobody)
/// whose subject and words are the page's own, with {version} and {macos} filled in. Err when the words are not plain.
pub fn address(cfg: &Config, subject: &str, body: &str, version: &str, macos: &str) -> Result<String, String> {
    let (v, m) = (plain_version(version), plain_version(macos));
    if !cfg.page.is_empty() {
        let sep = if cfg.page.contains('?') { '&' } else { '?' };
        return Ok(format!("{}{sep}version={}&macos={}", cfg.page, encode(&v), encode(&m)));
    }
    let subject = plain_text(subject, 120).ok_or("The report's subject is not plain text.")?;
    let body = plain_text(body, 1200).ok_or("The report's words are not plain text.")?;
    let body = body.replace("{version}", &v).replace("{macos}", &m);
    Ok(format!("mailto:{}?subject={}&body={}", cfg.email, encode(&subject), encode(&body)))
}

#[cfg(test)]
mod tests {
    use super::*;
    const SUBJECT: &str = "Companion problem report";
    const BODY: &str = "Companion {version} on macOS {macos}.\n\nWhat happened:\n\nPlease attach the log file Companion saved in your Downloads folder.";
    fn mail(email: &str) -> Config { Config { email: email.into(), page: String::new() } }

    #[test]
    fn the_shipped_file_parses() {
        let _ = parse_config(include_str!("../report.json"));
        assert!(serde_json::from_str::<Config>(include_str!("../report.json")).is_ok());
    }
    #[test]
    fn only_a_plain_email_address_or_a_secure_page_is_used() {
        assert_eq!(parse_config(r#"{"email":"help@example.com","page":""}"#), mail("help@example.com"));
        assert_eq!(parse_config(r#"{"email":" help@example.com ","page":""}"#), mail("help@example.com"));
        for bad in ["x", "a b@c.d", "a@b.c?cc=x@y.z", "a@b.c&body=x", "a@b.c#x", "@b.c", "a@", "a@b@c.d", "a@b.c\nbcc:x@y.z", "a%40b.c"] {
            assert_eq!(parse_config(&format!(r#"{{"email":{},"page":""}}"#, serde_json::to_string(bad).unwrap())).email, "", "{bad:?}");
        }
        assert_eq!(parse_config(r#"{"email":"","page":"https://example.com/report"}"#).page, "https://example.com/report");
        for bad in ["http://example.com/report", "file:///etc/passwd", "javascript:alert(1)", "https://u:p@example.com/", "https://example.com/a b"] {
            assert_eq!(parse_config(&format!(r#"{{"email":"","page":{}}}"#, serde_json::to_string(bad).unwrap())).page, "", "{bad:?}");
        }
        assert_eq!(parse_config("{nope"), Config::default());
        assert_eq!(parse_config(""), Config::default());
    }
    #[test]
    fn a_version_is_only_ever_digits_and_dots() {
        assert_eq!(plain_version("0.1.0"), "0.1.0");
        assert_eq!(plain_version(" 15.1.1\n"), "15.1.1");
        assert_eq!(plain_version("0.2.0-beta.1"), "0.2.0-beta.1");
        for bad in ["", "15.1 /Users/sam", "sam", "15.1\nrishabh", "1.2.3.4.5", "1..2", "-beta", "1.2-", "1.2-a b", &"1.".repeat(20)] {
            assert_eq!(plain_version(bad), "unknown", "{bad:?}");
        }
    }
    #[test]
    fn the_words_are_plain_text_of_a_sensible_length() {
        assert_eq!(plain_text(" Companion problem report ", 120).as_deref(), Some("Companion problem report"));
        assert_eq!(plain_text("line one\nline two", 120).as_deref(), Some("line one\nline two"));
        assert_eq!(plain_text("", 120), None);
        assert_eq!(plain_text("a\u{0}b", 120), None);
        assert_eq!(plain_text("a\u{202e}b", 120), None);
        assert_eq!(plain_text(&"a".repeat(121), 120), None);
    }
    #[test]
    fn an_email_draft_carries_the_two_versions_and_nothing_else_from_this_mac() {
        let a = address(&mail("help@example.com"), SUBJECT, BODY, "0.1.0", "15.1").unwrap();
        assert!(a.starts_with("mailto:help@example.com?subject=Companion%20problem%20report&body="), "{a}");
        assert!(a.contains("Companion%200.1.0%20on%20macOS%2015.1."), "{a}");
        assert!(a.contains("%0A%0AWhat%20happened%3A"), "{a}");
        // Only the parts that were asked for, each encoded: no new line, space, ampersand or question mark left raw.
        let rest = &a["mailto:help@example.com?".len()..];
        assert!(!rest.contains(' ') && !rest.contains('\n') && !rest.contains('?') && !rest.contains('#'), "{a}");
        assert_eq!(rest.matches('&').count(), 1, "{a}");
    }
    #[test]
    fn with_no_address_set_the_draft_has_no_recipient_and_the_person_picks_one() {
        let a = address(&Config::default(), SUBJECT, BODY, "0.1.0", "15.1").unwrap();
        assert!(a.starts_with("mailto:?subject="), "{a}");
    }
    #[test]
    fn a_report_page_gets_only_the_two_versions() {
        let page = |p: &str| Config { email: "help@example.com".into(), page: p.into() };
        assert_eq!(address(&page("https://example.com/report"), SUBJECT, BODY, "0.1.0", "15.1").unwrap(), "https://example.com/report?version=0.1.0&macos=15.1");
        assert_eq!(address(&page("https://example.com/new?template=bug"), SUBJECT, BODY, "0.1.0", "15.1").unwrap(), "https://example.com/new?template=bug&version=0.1.0&macos=15.1");
    }
    #[test]
    fn nothing_personal_can_ride_in_through_the_versions_or_the_words() {
        // A version that is not a version (a damaged sw_vers answer, a path) is sent as "unknown", never as it came.
        let a = address(&Config::default(), SUBJECT, BODY, "0.1.0 /Users/rishabh", "15.1\nRishabh's MacBook").unwrap();
        assert!(!a.to_lowercase().contains("rishabh") && !a.contains("%2FUsers") && !a.contains("MacBook"), "{a}");
        assert!(a.contains("Companion%20unknown%20on%20macOS%20unknown."), "{a}");
        // The words must be plain and short, or nothing is opened at all.
        assert!(address(&Config::default(), SUBJECT, "x\u{0}y", "0.1.0", "15.1").is_err());
        assert!(address(&Config::default(), &"s".repeat(200), BODY, "0.1.0", "15.1").is_err());
        assert!(address(&Config::default(), SUBJECT, &"b".repeat(2000), "0.1.0", "15.1").is_err());
    }
}
