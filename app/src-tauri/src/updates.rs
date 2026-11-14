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
    else if r.contains("signature") || r.contains("verif") { concat!("That update did not check out against ", crate::product_s!(), " key, so it was not installed. Nothing changed.") }
    else if r.contains("dns") || r.contains("connect") || r.contains("network") || r.contains("timed out") || r.contains("error sending request") { "I could not reach the update address. Check your internet and try again." }
    else { "I could not check for updates just now. Try again later." }
}

// ---------- never while something runs ----------

/// What the engine says is under way, as its events go by (runner.rs publish): agents thinking, working, checking or
/// waiting for the person, and approvals not answered yet. The page's own check comes first (updates.ts installAllowed,
/// which knows more: a deploy, an install, a practice); this is the backstop in install_update, so a press that reaches
/// the shell anyway never restarts Companion under a running task. Ids only, never what a task says or does.
pub struct Running { agents: std::collections::BTreeSet<String>, approvals: std::collections::BTreeSet<String>, asked: std::collections::BTreeSet<String> }
impl Running {
    pub const fn new() -> Self { Running { agents: std::collections::BTreeSet::new(), approvals: std::collections::BTreeSet::new(), asked: std::collections::BTreeSet::new() } }
    pub fn note(&mut self, v: &serde_json::Value) {
        let s = |k: &str| v.get(k).and_then(serde_json::Value::as_str);
        match s("type") {
            Some("agent.state") => {
                let (Some(agent), Some(state)) = (s("agent"), s("state")) else { return };
                // A task that ended on a question (its receipt asks) needs the person but runs nothing: a restart cuts nothing off.
                if state == "needsYou" && self.asked.contains(agent) { self.agents.remove(agent); }
                else if matches!(state, "thinking" | "working" | "checking" | "needsYou") { self.agents.insert(agent.to_string()); self.asked.remove(agent); }
                else { self.agents.remove(agent); self.asked.remove(agent); }
            }
            Some("receipt") => {
                let Some(agent) = s("agent") else { return };
                if v.get("asks").and_then(serde_json::Value::as_bool) == Some(true) { self.asked.insert(agent.to_string()); self.agents.remove(agent); } else { self.asked.remove(agent); }
            }
            Some("approval.request") => { if let Some(a) = s("approval") { self.approvals.insert(a.to_string()); } }
            Some("approval.resolved") => { if let Some(a) = s("approval") { self.approvals.remove(a); } }
            // An engine that has just started, or has stopped, runs nothing.
            Some("runner.hello") | Some("app.runner_down") => { self.agents.clear(); self.approvals.clear(); self.asked.clear(); }
            _ => {}
        }
    }
    pub fn busy(&self) -> bool { !self.agents.is_empty() || !self.approvals.is_empty() }
}
static RUNNING: std::sync::Mutex<Running> = std::sync::Mutex::new(Running::new());
/// Every engine event, as it is published to the pages.
pub fn note_running(v: &serde_json::Value) { RUNNING.lock().unwrap_or_else(|e| e.into_inner()).note(v); }
pub fn running_now() -> bool { RUNNING.lock().unwrap_or_else(|e| e.into_inner()).busy() }
/// One install at a time: the card's Install and Settings' Install can both be pressed, and two downloads must not race to
/// replace the app. `try_start` hands out a guard, or None while one is under way; dropping the guard (on every way out,
/// including an error) lets the next press through.
pub struct InstallFlight(std::sync::atomic::AtomicBool);
pub struct InstallGuard<'a>(&'a InstallFlight);
impl InstallFlight {
    pub const fn new() -> Self { InstallFlight(std::sync::atomic::AtomicBool::new(false)) }
    /// M89: whether an install is under way now (the quiet install never starts a second one).
    pub fn busy(&self) -> bool { self.0.load(std::sync::atomic::Ordering::SeqCst) }
    pub fn try_start(&self) -> Option<InstallGuard<'_>> { if self.0.swap(true, std::sync::atomic::Ordering::SeqCst) { None } else { Some(InstallGuard(self)) } }
}
impl Drop for InstallGuard<'_> { fn drop(&mut self) { (self.0).0.store(false, std::sync::atomic::Ordering::SeqCst); } }
pub static INSTALLING: InstallFlight = InstallFlight::new();
/// What install_update says to a second press while one install is under way.
pub const INSTALLING_WORDS: &str = "An update is already being installed.";

/// M89: what install_update says to a quiet install when the Mac is no longer quiet. Never shown: the page drops it.
pub const NOT_QUIET_WORDS: &str = "Not quiet now. The update waits.";
/// What install_update says when something runs: the page's own words (S.updatesBusy).
pub const BUSY_WORDS: &str = "Wait until the current task is finished, then install.";

// ---------- M89: install while the person is away ----------

/// How long with no keyboard, mouse or trackpad input before an update found may install by itself.
pub const QUIET_SECS: f64 = 300.0;
/// How often the shell looks (the tick runs twice a second; this is counted in ticks of it, see shell_updates.rs).
pub const QUIET_LOOK_SECS: u64 = 30;
/// What the quiet install looks at. Only times and yes or no: never what was typed, never a key, never a window's content.
#[derive(Debug, Clone, Copy, Default)]
pub struct Quiet {
    /// Install updates while away (updates.quiet), on unless turned off.
    pub setting_on: bool,
    /// A check found an update that is ready to install (PENDING_UPDATE).
    pub found: bool,
    /// Seconds since the last keyboard, mouse or trackpad input anywhere on the Mac (idle_seconds), or None when unknown.
    pub idle_secs: Option<f64>,
    /// A task or an approval under way (Running::busy).
    pub busy: bool,
    /// A call app in front with Quiet during calls on, or the camera or another app's microphone in use (presentation.rs).
    pub call: bool,
    /// The screen is being looked at: a Show me how answer on its way, a pointer or picture on the overlay (rule 5).
    pub capture: bool,
    /// The microphone is open (hold to talk, Show me listening) or Squibby is speaking.
    pub listening: bool,
    /// An install is already under way.
    pub installing: bool,
}
/// May an update install by itself now: switched on, one found, 5 minutes with no input (unknown counts as not quiet), and
/// nothing running, no call, no screen look and no microphone or speech. The page asks its own questions on top
/// (updates.ts quietInstallOk), and install_update asks this again before it takes anything.
pub fn quiet_install_ok(q: &Quiet) -> bool {
    q.setting_on && q.found && !q.installing && !q.busy && !q.call && !q.capture && !q.listening && q.idle_secs.is_some_and(|s| s.is_finite() && s >= QUIET_SECS)
}
/// The note kept for after the restart: the version only. Read once (update_note_take) and removed.
pub fn note_json(version: &str) -> serde_json::Value { serde_json::json!({ "version": version.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+')).take(40).collect::<String>(), "at": crate_now_ms() }) }
fn crate_now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }
/// The note as the page gets it: the version, only when the note is less than a day old (an old note is just removed).
pub fn note_for_page(text: Option<&str>, now_ms: u64) -> serde_json::Value {
    let Some(v) = text.and_then(|t| serde_json::from_str::<serde_json::Value>(t).ok()) else { return serde_json::Value::Null };
    let at = v["at"].as_u64().unwrap_or(0);
    let ver = v["version"].as_str().unwrap_or("");
    if at == 0 || now_ms.saturating_sub(at) > 86_400_000 || at > now_ms + 60_000 { return serde_json::Value::Null; }
    if ver.is_empty() || ver.len() > 40 || !ver.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+')) { return serde_json::json!({ "updated": true }); }
    serde_json::json!({ "version": ver })
}

/// Seconds since the last input event of any kind (keyboard, mouse, trackpad), as the window server counts it for the whole
/// session. Only a number: no event is read, no key is seen, and it needs no permission (no Input Monitoring, rule 8).
/// [verify] on a real Mac that macOS never asks for Input Monitoring for this (it should not: it is the same idle time the
/// screen saver uses). None when it cannot be read.
#[cfg(target_os = "macos")]
pub fn idle_seconds() -> Option<f64> {
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" { fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64; }
    // kCGEventSourceStateCombinedSessionState (0) and kCGAnyInputEventType (~0).
    let s = unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) };
    (s.is_finite() && s >= 0.0).then_some(s)
}
#[cfg(not(target_os = "macos"))]
pub fn idle_seconds() -> Option<f64> { None }

#[cfg(test)]
mod tests {
    use super::*;
    fn calm() -> Quiet { Quiet { setting_on: true, found: true, idle_secs: Some(QUIET_SECS + 1.0), ..Quiet::default() } }
    #[test]
    fn m89_an_update_installs_by_itself_only_after_five_quiet_minutes_with_nothing_under_way() {
        assert!(quiet_install_ok(&calm()));
        assert!(!quiet_install_ok(&Quiet { idle_secs: Some(QUIET_SECS - 1.0), ..calm() }), "4 minutes 59 is not quiet enough");
        assert!(!quiet_install_ok(&Quiet { idle_secs: None, ..calm() }), "an idle time that cannot be read is not quiet");
        assert!(!quiet_install_ok(&Quiet { idle_secs: Some(f64::NAN), ..calm() }));
        assert!(!quiet_install_ok(&Quiet { setting_on: false, ..calm() }), "switched off");
        assert!(!quiet_install_ok(&Quiet { found: false, ..calm() }), "nothing to install");
        assert!(!quiet_install_ok(&Quiet { busy: true, ..calm() }), "never during a job or an approval");
        assert!(!quiet_install_ok(&Quiet { call: true, ..calm() }), "never during a call");
        assert!(!quiet_install_ok(&Quiet { capture: true, ..calm() }), "never while the screen is looked at");
        assert!(!quiet_install_ok(&Quiet { listening: true, ..calm() }), "never while listening or speaking");
        assert!(!quiet_install_ok(&Quiet { installing: true, ..calm() }), "never a second install");
    }
    #[test]
    fn m89_the_note_after_carries_a_plain_version_and_goes_stale_after_a_day() {
        let n = note_json("1.4.0<script>");
        assert_eq!(n["version"], "1.4.0script");
        let now = n["at"].as_u64().unwrap();
        assert_eq!(note_for_page(Some(&n.to_string()), now + 1000), serde_json::json!({ "version": "1.4.0script" }));
        assert_eq!(note_for_page(Some(&n.to_string()), now + 86_400_001), serde_json::Value::Null, "a day old: said no more");
        assert_eq!(note_for_page(Some(r#"{"version":"","at":5}"#), 6), serde_json::json!({ "updated": true }));
        assert_eq!(note_for_page(Some("{nope"), now), serde_json::Value::Null);
        assert_eq!(note_for_page(None, now), serde_json::Value::Null);
    }
    #[test]
    fn m89_the_idle_time_is_a_number_and_reads_no_events() {
        // On this Mac it is a number of seconds (the test runner itself is not input).
        #[cfg(target_os = "macos")]
        assert!(idle_seconds().is_some_and(|s| s >= 0.0));
        let src = include_str!("updates.rs");
        let code = &src[..src.find("#[cfg(test)]").unwrap()];
        for never in [concat!("CGEvent", "TapCreate"), "IOHIDManager", "NSEvent.addGlobalMonitor", "addGlobalMonitorForEventsMatchingMask"] { assert!(!code.contains(never), "{never}"); }
    }
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
        let main = crate::main_src();
        let install = &main[main.find("async fn install_update(").unwrap()..]; let install = &install[..install.find("\n}\n").unwrap()];
        let busy = install.find("if updates::running_now() { return Err(updates::BUSY_WORDS.into()); }").expect("a busy check");
        assert!(busy < install.find("PENDING_UPDATE").unwrap(), "asked before the update is taken, so it can be installed later");
        assert_eq!(BUSY_WORDS, "Wait until the current task is finished, then install.", "the same words as the page (S.updatesBusy)");
    }
    #[test]
    fn a_task_that_ended_on_a_question_runs_nothing_but_a_new_task_does() {
        let mut r = Running::new();
        r.note(&serde_json::json!({ "type": "agent.state", "agent": "a", "state": "working" }));
        r.note(&serde_json::json!({ "type": "receipt", "agent": "a", "asks": true }));
        r.note(&serde_json::json!({ "type": "agent.state", "agent": "a", "state": "needsYou" }));
        assert!(!r.busy(), "the task ended and waits for an answer");
        // A question that is an approval still counts through its approval.
        r.note(&serde_json::json!({ "type": "approval.request", "approval": "ap_1", "agent": "a" }));
        assert!(r.busy());
        r.note(&serde_json::json!({ "type": "approval.resolved", "approval": "ap_1" }));
        assert!(!r.busy());
        // The answer starts the agent again.
        r.note(&serde_json::json!({ "type": "agent.state", "agent": "a", "state": "working" }));
        assert!(r.busy());
        r.note(&serde_json::json!({ "type": "agent.state", "agent": "a", "state": "needsYou" }));
        assert!(r.busy(), "a needs you that follows work, not a question that ended a task, still counts");
        // A receipt that does not ask changes nothing about a needs you.
        let mut q = Running::new();
        q.note(&serde_json::json!({ "type": "receipt", "agent": "b", "asks": false }));
        q.note(&serde_json::json!({ "type": "agent.state", "agent": "b", "state": "needsYou" }));
        assert!(q.busy());
    }
    #[test]
    fn a_second_install_is_turned_away_until_the_first_is_over() {
        let f = InstallFlight::new();
        let g = f.try_start().expect("the first goes");
        assert!(f.try_start().is_none(), "the second waits");
        drop(g);
        assert!(f.try_start().is_some(), "after the first ends, even by an error, the next goes");
    }
    #[test]
    fn install_update_takes_the_flight_before_anything_else_is_done() {
        let main = crate::main_src();
        let install = &main[main.find("async fn install_update(").unwrap()..]; let install = &install[..install.find("\n}\n").unwrap()];
        let flight = install.find("updates::INSTALLING.try_start()").expect("takes the flight");
        assert!(flight < install.find(".download(").unwrap());
    }
    #[test]
    fn a_failed_download_keeps_the_update_so_install_can_be_pressed_again_and_a_task_started_meanwhile_is_not_cut_off() {
        let main = crate::main_src();
        let install = &main[main.find("async fn install_update(").unwrap()..]; let install = &install[..install.find("\n}\n").unwrap()];
        assert!(!install.contains(".take()"), "the update is only cloned, so a failed download does not use it up");
        let download = install.find(".download(").expect("a download on its own");
        let again = install[download..].find("updates::running_now()").expect("asked again after the download") + download;
        let put_in = install.find(".install(").expect("then installed");
        assert!(download < again && again < put_in, "the busy check comes after the download and before the install");
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
        let src = crate::main_src();
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
