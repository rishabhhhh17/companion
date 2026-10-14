//! Updates. The person presses a button (or turns on the daily check): Companion asks one web address for a small file
//! that names the newest version, and only ever installs an update whose signature matches Companion's own update key.
//! The check is a plain request for one file: it names the update tool and, like any web request, shows the person's
//! internet address. It sends no project, words or ids. Nothing is installed without a press. Until the key and the address are filled in (`updater.json`), this build
//! says plainly that updates are not set up.
use serde::Deserialize;

#[derive(Debug, Deserialize, PartialEq, Clone)]
pub struct Config { pub pubkey: String, pub endpoint: String }

/// The settings file, or None when it is not filled in yet (or not safe: the address must be https).
pub fn parse_config(text: &str) -> Option<Config> {
    let c: Config = serde_json::from_str(text).ok()?;
    let (k, e) = (c.pubkey.trim(), c.endpoint.trim());
    if k.is_empty() || !e.starts_with("https://") || e.contains(char::is_whitespace) || e.len() > 300 { return None; }
    Some(Config { pubkey: k.to_string(), endpoint: e.to_string() })
}

/// Words for the person, from what happened. Plain, no codes.
pub fn failure_words(raw: &str) -> &'static str {
    let r = raw.to_lowercase();
    if r.contains("signature") || r.contains("verif") { "That update did not check out against Companion's key, so it was not installed. Nothing changed." }
    else if r.contains("dns") || r.contains("connect") || r.contains("network") || r.contains("timed out") || r.contains("error sending request") { "I could not reach the update address. Check your internet and try again." }
    else { "I could not check for updates just now. Try again later." }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn an_empty_file_means_updates_are_not_set_up() {
        assert_eq!(parse_config(r#"{"pubkey":"","endpoint":""}"#), None);
        assert_eq!(parse_config(r#"{"pubkey":"abc","endpoint":""}"#), None);
        assert_eq!(parse_config(r#"{"pubkey":"","endpoint":"https://x.example/latest.json"}"#), None);
    }
    #[test]
    fn a_filled_in_file_is_used() {
        let c = parse_config(r#"{"pubkey":" KEY ","endpoint":"https://example.com/latest.json"}"#).unwrap();
        assert_eq!((c.pubkey.as_str(), c.endpoint.as_str()), ("KEY", "https://example.com/latest.json"));
    }
    #[test]
    fn only_secure_addresses_are_accepted() {
        assert_eq!(parse_config(r#"{"pubkey":"k","endpoint":"http://example.com/latest.json"}"#), None);
        assert_eq!(parse_config(r#"{"pubkey":"k","endpoint":"file:///etc/passwd"}"#), None);
        assert_eq!(parse_config(r#"{"pubkey":"k","endpoint":"https://a.example/x y"}"#), None);
    }
    #[test]
    fn a_damaged_file_is_not_set_up() {
        assert_eq!(parse_config("{nope"), None);
        assert_eq!(parse_config(""), None);
    }
    #[test]
    fn failures_are_said_in_plain_words() {
        assert!(failure_words("signature verification failed").contains("did not check out"));
        assert!(failure_words("error sending request for url").contains("internet"));
        assert!(failure_words("weird").contains("later"));
    }
    #[test]
    fn the_app_version_is_the_same_in_cargo_and_in_the_app_settings() {
        // The updater compares against the app settings version; the disk image and the log use Cargo's. They must match.
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["version"].as_str().unwrap(), env!("CARGO_PKG_VERSION"));
    }
    #[test]
    fn the_app_settings_carry_the_update_block_the_plugin_needs_to_start() {
        // Without it the plugin refuses to start and the whole app crashes at launch (found the hard way on 14 Oct 2026).
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert!(conf["plugins"]["updater"].is_object());
        assert_eq!(conf["plugins"]["updater"]["requireSignedVersion"], serde_json::Value::Bool(true));
    }
    #[test]
    fn the_shipped_file_parses_or_is_cleanly_empty() {
        let _ = parse_config(include_str!("../updater.json"));
        assert!(serde_json::from_str::<Config>(include_str!("../updater.json")).is_ok());
    }
}
