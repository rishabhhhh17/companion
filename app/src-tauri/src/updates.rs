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
    if r.contains("does not specify the version") || r.contains("signed version") || r.contains("missingsignedversion") { "This update was not signed for this version, so it was not installed. Nothing changed. Please get the newest version from the website." }
    else if r.contains("signature") || r.contains("verif") { "That update did not check out against Companion's key, so it was not installed. Nothing changed." }
    else if r.contains("dns") || r.contains("connect") || r.contains("network") || r.contains("timed out") || r.contains("error sending request") { "I could not reach the update address. Check your internet and try again." }
    else { "I could not check for updates just now. Try again later." }
}

// ---------- never while something runs ----------

/// What the engine says is under way, as its events go by (runner.rs publish): agents thinking, working, checking or
/// waiting for the person, and approvals not answered yet. The page's own check comes first (updates.ts installAllowed,
/// which knows more: a deploy, an install, a practice); this is the backstop in install_update, so a press that reaches
/// the shell anyway never restarts Companion under a running task. Ids only, never what a task says or does.
pub struct Running { agents: std::collections::BTreeSet<String>, approvals: std::collections::BTreeSet<String> }
impl Running {
    pub const fn new() -> Self { Running { agents: std::collections::BTreeSet::new(), approvals: std::collections::BTreeSet::new() } }
    pub fn note(&mut self, v: &serde_json::Value) {
        let s = |k: &str| v.get(k).and_then(serde_json::Value::as_str);
        match s("type") {
            Some("agent.state") => {
                let (Some(agent), Some(state)) = (s("agent"), s("state")) else { return };
                if matches!(state, "thinking" | "working" | "checking" | "needsYou") { self.agents.insert(agent.to_string()); } else { self.agents.remove(agent); }
            }
            Some("approval.request") => { if let Some(a) = s("approval") { self.approvals.insert(a.to_string()); } }
            Some("approval.resolved") => { if let Some(a) = s("approval") { self.approvals.remove(a); } }
            // An engine that has just started, or has stopped, runs nothing.
            Some("runner.hello") | Some("app.runner_down") => { self.agents.clear(); self.approvals.clear(); }
            _ => {}
        }
    }
    pub fn busy(&self) -> bool { !self.agents.is_empty() || !self.approvals.is_empty() }
}
static RUNNING: std::sync::Mutex<Running> = std::sync::Mutex::new(Running::new());
/// Every engine event, as it is published to the pages.
pub fn note_running(v: &serde_json::Value) { RUNNING.lock().unwrap_or_else(|e| e.into_inner()).note(v); }
pub fn running_now() -> bool { RUNNING.lock().unwrap_or_else(|e| e.into_inner()).busy() }
/// What install_update says when something runs: the page's own words (S.updatesBusy).
pub const BUSY_WORDS: &str = "Wait until the current task is finished, then install.";

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
        assert!(failure_words("The update signature does not specify the version it was signed for").contains("not signed for this version"));
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
    // Found in review (19 Oct 2026): Home's Install was offered only while a task ran (an inverted guard on the page), and
    // the shell installed and restarted without asking whether anything ran. The shell now keeps its own count of what the
    // engine says is under way, as a backstop to the page's own check (updates.ts installAllowed).
    fn ev(v: serde_json::Value) -> serde_json::Value { v }
    #[test]
    fn a_task_working_or_an_approval_waiting_means_no_restart() {
        let mut r = Running::new();
        assert!(!r.busy(), "nothing has run yet");
        for state in ["thinking", "working", "checking", "needsYou"] {
            r.note(&ev(serde_json::json!({ "type": "agent.state", "agent": "builder-1", "state": state })));
            assert!(r.busy(), "{state}");
        }
        for state in ["done", "error", "idle"] {
            r.note(&ev(serde_json::json!({ "type": "agent.state", "agent": "builder-1", "state": "working" })));
            r.note(&ev(serde_json::json!({ "type": "agent.state", "agent": "builder-1", "state": state })));
            assert!(!r.busy(), "{state}: at rest");
        }
        // Two agents: busy until both are at rest.
        r.note(&ev(serde_json::json!({ "type": "agent.state", "agent": "a", "state": "working" })));
        r.note(&ev(serde_json::json!({ "type": "agent.state", "agent": "b", "state": "checking" })));
        r.note(&ev(serde_json::json!({ "type": "agent.state", "agent": "a", "state": "done" })));
        assert!(r.busy());
        r.note(&ev(serde_json::json!({ "type": "agent.state", "agent": "b", "state": "done" })));
        assert!(!r.busy());
        // An approval waits until it is answered, whatever the agent says.
        r.note(&ev(serde_json::json!({ "type": "approval.request", "approval": "ap_1", "agent": "a" })));
        assert!(r.busy());
        r.note(&ev(serde_json::json!({ "type": "approval.resolved", "approval": "ap_1", "agent": "a", "outcome": "allowed" })));
        assert!(!r.busy());
    }
    #[test]
    fn an_engine_that_started_again_or_stopped_runs_nothing() {
        for reset in ["runner.hello", "app.runner_down"] {
            let mut r = Running::new();
            r.note(&serde_json::json!({ "type": "agent.state", "agent": "a", "state": "working" }));
            r.note(&serde_json::json!({ "type": "approval.request", "approval": "ap_1", "agent": "a" }));
            r.note(&serde_json::json!({ "type": reset }));
            assert!(!r.busy(), "{reset}");
        }
        // Anything else, or a broken event, changes nothing.
        let mut r = Running::new();
        r.note(&serde_json::json!({ "type": "agent.state", "agent": "a", "state": "working" }));
        for junk in [serde_json::json!({ "type": "cost.update" }), serde_json::json!({ "type": "agent.state", "state": "done" }), serde_json::json!({ "type": "agent.state", "agent": 3, "state": "done" }), serde_json::json!(null)] { r.note(&junk); }
        assert!(r.busy());
    }
    #[test]
    fn the_shell_notes_every_engine_event_and_install_asks_before_taking_the_update() {
        let runner = include_str!("runner.rs");
        let publish = &runner[runner.find("pub fn publish(").unwrap()..]; let publish = &publish[..publish.find("\n    }\n").unwrap()];
        assert!(publish.contains("crate::updates::note_running(&v);"), "{publish}");
        let main = include_str!("main.rs");
        let install = &main[main.find("async fn install_update(").unwrap()..]; let install = &install[..install.find("\n}\n").unwrap()];
        let busy = install.find("if updates::running_now() { return Err(updates::BUSY_WORDS.into()); }").expect("a busy check");
        assert!(busy < install.find("PENDING_UPDATE").unwrap(), "asked before the update is taken, so it can be installed later");
        assert_eq!(BUSY_WORDS, "Wait until the current task is finished, then install.", "the same words as the page (S.updatesBusy)");
    }
    #[test]
    fn the_shipped_file_parses_or_is_cleanly_empty() {
        let _ = parse_config(include_str!("../updater.json"));
        assert!(serde_json::from_str::<Config>(include_str!("../updater.json")).is_ok());
    }
}

#[cfg(test)]
mod windows_and_permissions {
    // Every window the app creates must be named in a capability, or Tauri refuses its page the core calls it needs (listening
    // for events, for one) and the page silently does nothing. Found by the 15 Oct 2026 review: the overlay was missing, and
    // no test noticed because the page code never ran in a test.
    fn labels() -> Vec<String> {
        let src = include_str!("main.rs");
        let mut out = vec![];
        for marker in ["mk(\"", "WebviewWindowBuilder::new(app, \""] {
            let mut rest = src;
            while let Some(i) = rest.find(marker) {
                rest = &rest[i + marker.len()..];
                if let Some(j) = rest.find('"') { let l = &rest[..j]; if l.chars().all(|c| c.is_ascii_lowercase()) && !l.is_empty() { out.push(l.to_string()); } }
            }
        }
        out.sort(); out.dedup(); out
    }
    #[test]
    fn every_window_is_in_a_capability_and_the_overlay_may_only_listen() {
        let caps: Vec<serde_json::Value> = [include_str!("../capabilities/default.json"), include_str!("../capabilities/overlay.json")].iter().map(|t| serde_json::from_str(t).unwrap()).collect();
        let named: Vec<String> = caps.iter().flat_map(|c| c["windows"].as_array().unwrap().iter().map(|w| w.as_str().unwrap().to_string())).collect();
        let found = labels();
        assert!(found.len() >= 3, "the scan found {found:?}; it must at least see dock, card and overlay");
        for l in &found { assert!(named.contains(l), "the window \"{l}\" is not named in any capability"); }
        let overlay = caps.iter().find(|c| c["identifier"] == "overlay").unwrap();
        let perms: Vec<&str> = overlay["permissions"].as_array().unwrap().iter().map(|p| p.as_str().unwrap()).collect();
        assert!(perms.iter().all(|p| p.starts_with("core:event:allow-")), "the overlay may only listen: {perms:?}");
        let dflt = caps.iter().find(|c| c["identifier"] == "default").unwrap();
        assert!(!dflt["windows"].as_array().unwrap().iter().any(|w| w == "overlay"), "the overlay gets its own narrow capability, not the full one");
    }
}
