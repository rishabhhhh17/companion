//! Starts the runner program and carries messages between it and the web pages.
//! The pages never see keys or the Keychain. They may send only whitelisted commands.

use serde_json::Value;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::Manager;
use tauri::{AppHandle, Emitter};

pub const PROTOCOL_VERSION: i64 = 1;

/// The commands a web page may send. Everything else is refused here, in Rust.
const ALLOWED: &[&str] = &[
    "agent.start", "agent.send", "agent.interrupt", "agent.interruptAll", "approval.resolve", "checkpoint.restore",
    "assist.prompt", "assist.locate", "assist.image", "assist.cancel", "tasks.list", "drive.plan", "drive.approve", "loop.choose", "drive.pause", "drive.resume", "rescue.diagnose", "research.ask", "ship.check",
    "memory.list", "memory.forget", "memory.edit", "memory.pause", "memory.erase", "memory.export", "memory.agents", "recap.ask", "explain.set", "ship.preview", "ship.live", "ship.rollback", "auth.check", "doctor.check", "memory.add", "problem.find", "project.inspect", "project.install",
];

/// Checks a command from a web page. Returns the reason in plain words when refused.
pub fn check_command(v: &Value) -> Result<(), String> {
    let o = v.as_object().ok_or("a command must be an object")?;
    if o.get("v").and_then(Value::as_i64) != Some(PROTOCOL_VERSION) {
        return Err("unsupported protocol version".into());
    }
    if o.get("id").and_then(Value::as_str).map_or(true, str::is_empty) {
        return Err("a command needs an id".into());
    }
    let t = o.get("type").and_then(Value::as_str).ok_or("a command needs a type")?;
    if !ALLOWED.contains(&t) {
        return Err(format!("the command {t} is not allowed from a page"));
    }
    Ok(())
}

/// Commands that run or read things in a project folder: from a page they may name only the folder the person chose.
pub const PROJECT_BOUND: &[&str] = &["project.inspect", "project.install", "problem.find"];
pub fn check_project(v: &Value, current: &str) -> Result<(), String> {
    let t = v.get("type").and_then(Value::as_str).unwrap_or("");
    if !PROJECT_BOUND.contains(&t) { return Ok(()); }
    match v.get("project").and_then(Value::as_str) {
        Some(p) if !current.is_empty() && p == current => Ok(()),
        _ => Err("that command may only name the project folder you chose".into()),
    }
}

/// Splits a stream of bytes into whole lines, keeping a partial line for next time.
pub fn split_lines(buf: &mut Vec<u8>, chunk: &[u8]) -> Vec<String> {
    buf.extend_from_slice(chunk);
    // Garbage with no line breaks must not grow memory forever: past the limit the unfinished line is dropped.
    if buf.len() > MAX_LINE && !buf.contains(&b'\n') { buf.clear(); return Vec::new(); }
    let mut out = Vec::new();
    while let Some(i) = buf.iter().position(|b| *b == b'\n') {
        let line: Vec<u8> = buf.drain(..=i).collect();
        let s = String::from_utf8_lossy(&line[..line.len() - 1]).trim().to_string();
        if !s.is_empty() {
            out.push(s);
        }
    }
    out
}

/// Where the runner is: a dev settings file, then environment variables.
#[derive(Debug, Clone, PartialEq)]
pub struct Locations { pub bun: PathBuf, pub runner: PathBuf, pub data: PathBuf, pub env: BTreeMap<String, String> }

/// The only settings the developer file may pass to the runner. Keys, tokens and anything that could
/// switch accounts are refused here, so a settings file can never carry a secret into the runner.
const ENV_ALLOWED: &[&str] = &["COMPANION_ROUTE", "COMPANION_MODEL", "COMPANION_KEYCHAIN_SERVICE", "COMPANION_KEYCHAIN_ACCOUNT", "CLAUDE_CONFIG_DIR", "COMPANION_ASSIST_STUB"];

pub fn allowed_env(dev: &Value) -> BTreeMap<String, String> {
    dev.get("env").and_then(Value::as_object).map(|o| {
        o.iter().filter(|(k, _)| ENV_ALLOWED.contains(&k.as_str())).filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()
    }).unwrap_or_default()
}

pub fn locations(dev_json: Option<&str>, env: &dyn Fn(&str) -> Option<String>, data: PathBuf) -> Result<Locations, String> {
    let dev: Value = dev_json.and_then(|s| serde_json::from_str(s).ok()).unwrap_or(Value::Null);
    let pick = |key: &str, var: &str| dev.get(key).and_then(Value::as_str).map(str::to_string).or_else(|| env(var));
    let bun = pick("bun", "COMPANION_BUN").ok_or("Companion cannot find Bun. Run app/scripts/dev-setup.sh")?;
    let runner = pick("runner", "COMPANION_RUNNER").ok_or("Companion cannot find the runner. Run app/scripts/dev-setup.sh")?;
    Ok(Locations { bun: bun.into(), runner: runner.into(), data, env: allowed_env(&dev) })
}

/// Status messages a page that loads late still needs (who is connected, is the engine up).
const STICKY: &[&str] = &["runner.hello", "auth.status", "app.runner_down", "app.notice"];

/// Remember the latest sticky event of each type. Returns true if it was kept.
pub fn remember(map: &mut BTreeMap<String, Value>, v: &Value) -> bool {
    match v.get("type").and_then(Value::as_str) {
        Some(t) if STICKY.contains(&t) => { map.insert(t.to_string(), v.clone()); true }
        _ => false,
    }
}

// ---------- keeping the engine alive ----------
//
// The engine (the runner) is a separate program. It can crash, hang, print garbage or ignore us. None of that may freeze the
// app, lose the Stop key, or leave the cards stuck. So: commands go through a small queue to a writer thread (a full pipe can
// never block anyone), the engine is restarted after a crash with growing pauses, and Stop falls back to killing a hung engine.

use std::io;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const QUEUE: usize = 256;
/// One line from the engine may not be longer than this. A longer one is thrown away instead of growing memory forever.
pub const MAX_LINE: usize = 4 * 1024 * 1024;

#[derive(Clone, Copy)]
pub struct Timing { pub healthy: Duration, pub base: Duration, pub max_wait: Duration, pub give_up_after: u32, pub quit_grace: Duration, pub heartbeat: Duration }
impl Default for Timing {
    fn default() -> Self { Timing { healthy: Duration::from_secs(20), base: Duration::from_secs(1), max_wait: Duration::from_secs(30), give_up_after: 6, quit_grace: Duration::from_secs(2), heartbeat: Duration::from_secs(3) } }
}

/// How long to wait before starting the engine again after it stopped quickly `failures` times in a row. None means stop trying.
pub fn backoff(failures: u32, t: &Timing) -> Option<Duration> {
    if failures >= t.give_up_after { return None; }
    let steps = failures.saturating_sub(1).min(16);
    Some((t.base.saturating_mul(1u32 << steps)).min(t.max_wait))
}

fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

pub struct Shared {
    tx: Mutex<Option<SyncSender<String>>>,
    child: Mutex<Option<Child>>,
    quitting: AtomicBool,
    last_event_ms: AtomicU64,
}
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> { m.lock().unwrap_or_else(|e| e.into_inner()) }   // one panic must never poison everything after it

impl Shared {
    pub fn new() -> Arc<Shared> { Arc::new(Shared { tx: Mutex::new(None), child: Mutex::new(None), quitting: AtomicBool::new(false), last_event_ms: AtomicU64::new(0) }) }
    /// Queue one line for the engine. Never waits: a full queue or a missing engine is an immediate, plain error.
    pub fn send_line(&self, line: String) -> Result<(), String> {
        match lock(&self.tx).as_ref() {
            None => Err("The engine is not running.".into()),
            Some(tx) => tx.try_send(line).map_err(|e| match e { TrySendError::Full(_) => "The engine is not answering.".to_string(), TrySendError::Disconnected(_) => "The engine is not running.".to_string() }),
        }
    }
    pub fn kill(&self) { if let Some(c) = lock(&self.child).as_mut() { let _ = c.kill(); } }
}

/// Runs the engine for as long as the app lives: start it, read its lines, and start it again when it stops.
/// `spawn` and `emit` are passed in so this can be tested with pretend engines.
pub fn supervise(shared: Arc<Shared>, spawn: Arc<dyn Fn() -> io::Result<Child> + Send + Sync>, emit: Arc<dyn Fn(Value) + Send + Sync>, on_type: Arc<dyn Fn(&str) + Send + Sync>, t: Timing) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let (mut failures, mut starts) = (0u32, 0u32);
        loop {
            if shared.quitting.load(Ordering::SeqCst) { return; }
            let started = Instant::now();
            match spawn() {
                Err(e) => emit(serde_json::json!({ "v": 1, "id": "app-down", "type": "app.runner_down", "reason": format!("could not start the engine: {e}") })),
                Ok(mut child) => {
                    starts += 1;
                    let (stdout, stdin) = (child.stdout.take(), child.stdin.take());
                    let (tx, rx) = sync_channel::<String>(QUEUE);
                    *lock(&shared.tx) = Some(tx);
                    *lock(&shared.child) = Some(child);
                    shared.last_event_ms.store(now_ms(), Ordering::SeqCst);
                    if starts > 1 { emit(serde_json::json!({ "v": 1, "id": format!("app-restarted-{starts}"), "type": "app.runner_restarted" })); }
                    // A thread of its own does the writing, so a stuck engine can only ever stall this thread.
                    if let Some(mut w) = stdin {
                        std::thread::spawn(move || { for line in rx { if writeln!(w, "{line}").and_then(|_| w.flush()).is_err() { break; } } });
                    }
                    if let Some(mut out) = stdout {
                        let (mut buf, mut chunk) = (Vec::new(), [0u8; 8192]);
                        loop {
                            let n = match out.read(&mut chunk) { Ok(0) | Err(_) => break, Ok(n) => n };
                            for line in split_lines(&mut buf, &chunk[..n]) {
                                if let Ok(v) = serde_json::from_str::<Value>(&line) {
                                    shared.last_event_ms.store(now_ms(), Ordering::SeqCst);
                                    on_type(v.get("type").and_then(Value::as_str).unwrap_or("?"));   // the type only, never the content
                                    emit(v);
                                }
                            }
                        }
                    }
                    *lock(&shared.tx) = None;                  // ends the writer thread
                    if let Some(mut c) = lock(&shared.child).take() { let _ = c.kill(); let _ = c.wait(); }   // never leave a zombie behind
                    emit(serde_json::json!({ "v": 1, "id": "app-down", "type": "app.runner_down" }));
                }
            }
            if shared.quitting.load(Ordering::SeqCst) { return; }
            failures = if started.elapsed() >= t.healthy { 0 } else { failures + 1 };
            let Some(wait) = backoff(failures.max(1), &t).filter(|_| failures < t.give_up_after) else {
                emit(serde_json::json!({ "v": 1, "id": "app-down", "type": "app.runner_down", "reason": "The engine keeps stopping. Quit and open Companion again." }));
                return;
            };
            let until = Instant::now() + wait;
            while Instant::now() < until && !shared.quitting.load(Ordering::SeqCst) { std::thread::sleep(Duration::from_millis(20).min(wait)); }
        }
    })
}

pub struct Runner { shared: Arc<Shared>, sticky: Mutex<BTreeMap<String, Value>>, timing: Timing }
impl Runner {
    pub fn new() -> Self { Self { shared: Shared::new(), sticky: Mutex::new(BTreeMap::new()), timing: Timing::default() } }
    #[cfg(test)]
    pub fn with_shared(shared: Arc<Shared>, timing: Timing) -> Self { Self { shared, sticky: Mutex::new(BTreeMap::new()), timing } }

    /// What to replay to a page that has just loaded, oldest meaning first.
    pub fn replay(&self) -> Vec<Value> { lock(&self.sticky).values().cloned().collect() }

    /// Tell every page, and remember it for pages that load later.
    pub fn publish(app: &AppHandle, v: Value) {
        remember(&mut lock(&app.state::<Runner>().sticky), &v);
        let _ = app.emit("runner-event", v);
    }

    /// Start the engine and keep it running. Each event line goes to the pages as "runner-event".
    pub fn start(&self, app: &AppHandle, loc: &Locations, on_type: impl Fn(&str) + Send + Sync + 'static) -> Result<(), String> {
        std::fs::create_dir_all(&loc.data).map_err(|e| e.to_string())?;
        let loc = loc.clone();
        let spawn: Arc<dyn Fn() -> io::Result<Child> + Send + Sync> = Arc::new(move || {
            Command::new(&loc.bun).arg(&loc.runner).env("COMPANION_DATA", &loc.data).envs(&loc.env)
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
        });
        // Fail loudly now, not later, if the engine cannot be started at all.
        let first = spawn().map_err(|e| format!("could not start the runner: {e}"))?;
        let first = Arc::new(Mutex::new(Some(first)));
        let spawn2: Arc<dyn Fn() -> io::Result<Child> + Send + Sync> = { let first = first.clone(); let again = spawn.clone(); Arc::new(move || match lock(&first).take() { Some(c) => Ok(c), None => again() }) };
        let a = app.clone();
        let emit: Arc<dyn Fn(Value) + Send + Sync> = Arc::new(move |v| Runner::publish(&a, v));
        supervise(self.shared.clone(), spawn2, emit, Arc::new(on_type), self.timing);
        Ok(())
    }

    /// Write one command line to the engine. Never waits.
    pub fn send(&self, cmd: &Value) -> Result<(), String> { self.shared.send_line(cmd.to_string()) }

    /// The Stop key. It must work even when the engine is stuck, so if the stop cannot be delivered, or the engine does not
    /// answer a moment later, the engine is stopped by force and started again.
    pub fn stop_everything(&self, reason: &str) -> Result<(), String> {
        let sent_at = now_ms();
        let r = self.send(&serde_json::json!({ "v": 1, "id": format!("kill-{}", std::process::id()), "type": "agent.interruptAll", "reason": reason }));
        if r.is_err() { self.shared.kill(); return r; }
        let _ = self.send(&serde_json::json!({ "v": 1, "id": format!("ping-{sent_at}"), "type": "runner.ping" }));   // a healthy engine always answers this
        let (shared, wait) = (self.shared.clone(), self.timing.heartbeat);
        std::thread::spawn(move || {
            std::thread::sleep(wait);
            if shared.last_event_ms.load(Ordering::SeqCst) < sent_at && !shared.quitting.load(Ordering::SeqCst) { shared.kill(); }
        });
        Ok(())
    }

    /// Quitting. Close the pipe so the engine can finish, wait a moment, then force it.
    pub fn shut_down(&self) {
        self.shared.quitting.store(true, Ordering::SeqCst);
        *lock(&self.shared.tx) = None;
        let deadline = Instant::now() + self.timing.quit_grace;
        loop {
            let done = match lock(&self.shared.child).as_mut() { None => true, Some(c) => matches!(c.try_wait(), Ok(Some(_))) };
            if done { break; }
            if Instant::now() >= deadline { self.shared.kill(); break; }
            std::thread::sleep(Duration::from_millis(25));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn install_inspect_and_find_may_only_name_the_chosen_project() {
        let c = |t: &str, p: &str| json!({ "v": 1, "id": "x", "type": t, "project": p });
        assert!(check_project(&c("project.install", "/Users/me/site"), "/Users/me/site").is_ok());
        assert!(check_project(&c("project.install", "/Users/me/other"), "/Users/me/site").is_err());
        assert!(check_project(&c("problem.find", "/"), "/Users/me/site").is_err());
        assert!(check_project(&c("project.inspect", "/Users/me/site"), "").is_err());
        assert!(check_project(&c("memory.list", "/anything"), "/Users/me/site").is_ok());   // not a project bound command
    }
    use serde_json::json;

    #[test]
    fn allows_the_commands_pages_need() {
        for t in ["agent.start", "agent.interruptAll", "approval.resolve", "checkpoint.restore", "tasks.list", "drive.plan", "drive.approve", "loop.choose", "drive.pause", "drive.resume", "rescue.diagnose", "research.ask", "ship.check"] {
            assert!(check_command(&json!({"v":1,"id":"c","type":t})).is_ok(), "{t}");
        }
    }
    #[test]
    fn refuses_unknown_wrong_version_and_malformed() {
        assert!(check_command(&json!({"v":1,"id":"c","type":"runner.hello"})).is_err());
        assert!(check_command(&json!({"v":1,"id":"c","type":"shell.run"})).is_err());
        assert!(check_command(&json!({"v":2,"id":"c","type":"agent.start"})).is_err());
        assert!(check_command(&json!({"id":"c","type":"agent.start"})).is_err());
        assert!(check_command(&json!({"v":1,"type":"agent.start"})).is_err());
        assert!(check_command(&json!({"v":1,"id":"","type":"agent.start"})).is_err());
        assert!(check_command(&json!("agent.start")).is_err());
        assert!(check_command(&json!([1])).is_err());
    }
    #[test]
    fn splits_whole_lines_and_keeps_the_partial_one() {
        let mut buf = Vec::new();
        assert_eq!(split_lines(&mut buf, b"{\"a\":1}\n{\"b\""), vec!["{\"a\":1}".to_string()]);
        assert_eq!(split_lines(&mut buf, b":2}\n\n"), vec!["{\"b\":2}".to_string()]);
        assert!(buf.is_empty());
    }
    #[test]
    fn a_line_split_across_a_multibyte_character_is_not_corrupted() {
        let mut buf = Vec::new();
        let s = "{\"t\":\"नमस्ते\"}\n".as_bytes();
        let (a, b) = s.split_at(9);
        assert!(split_lines(&mut buf, a).is_empty());
        assert_eq!(split_lines(&mut buf, b), vec!["{\"t\":\"नमस्ते\"}".to_string()]);
    }
    #[test]
    fn locations_come_from_the_dev_file_first_then_the_environment() {
        let env = |k: &str| match k { "COMPANION_BUN" => Some("/env/bun".into()), "COMPANION_RUNNER" => Some("/env/main.ts".into()), _ => None };
        let l = locations(Some(r#"{"bun":"/dev/bun"}"#), &env, "/d".into()).unwrap();
        assert_eq!(l.bun, PathBuf::from("/dev/bun"));
        assert_eq!(l.runner, PathBuf::from("/env/main.ts"));
    }
    #[test]
    fn the_dev_file_may_pass_only_safe_settings_to_the_runner() {
        let dev = json!({"env": {"COMPANION_ROUTE":"plan","COMPANION_MODEL":"m","CLAUDE_CONFIG_DIR":"/x",
            "ANTHROPIC_API_KEY":"sk-ant-secret","CLAUDE_CODE_OAUTH_TOKEN":"t","PATH":"/evil","COMPANION_ENGINE":"scripted"}});
        let e = allowed_env(&dev);
        assert_eq!(e.len(), 3);
        assert_eq!(e["COMPANION_ROUTE"], "plan");
        assert_eq!(allowed_env(&json!({"env": {"COMPANION_ASSIST_STUB":"1"}}))["COMPANION_ASSIST_STUB"], "1");
        for k in ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "PATH", "COMPANION_ENGINE"] { assert!(!e.contains_key(k), "{k}"); }
    }
    #[test]
    fn a_missing_or_odd_env_section_gives_nothing() {
        assert!(allowed_env(&json!({})).is_empty());
        assert!(allowed_env(&json!({"env": "x"})).is_empty());
        assert!(allowed_env(&json!({"env": {"COMPANION_ROUTE": 5}})).is_empty());
    }
    #[test]
    fn locations_carry_the_safe_settings() {
        let none = |_: &str| None;
        let l = locations(Some(r#"{"bun":"/b","runner":"/r","env":{"COMPANION_ROUTE":"plan"}}"#), &none, "/d".into()).unwrap();
        assert_eq!(l.env["COMPANION_ROUTE"], "plan");
    }
    #[test]
    fn missing_locations_give_a_plain_instruction() {
        let none = |_: &str| None;
        let e = locations(None, &none, "/d".into()).unwrap_err();
        assert!(e.contains("dev-setup.sh"));
    }
    #[test]
    fn a_page_that_loads_late_gets_the_status_it_missed() {
        let mut m = BTreeMap::new();
        assert!(remember(&mut m, &json!({"type":"runner.hello","sdk":"1"})));
        assert!(remember(&mut m, &json!({"type":"auth.status","method":"none"})));
        assert_eq!(m.len(), 2);
    }
    #[test]
    fn only_the_latest_of_each_status_is_kept_and_busy_events_are_not_stored() {
        let mut m = BTreeMap::new();
        remember(&mut m, &json!({"type":"auth.status","method":"none"}));
        remember(&mut m, &json!({"type":"auth.status","method":"api_key"}));
        assert_eq!(m["auth.status"]["method"], "api_key");
        assert!(!remember(&mut m, &json!({"type":"agent.state","state":"working"})));
        assert!(!remember(&mut m, &json!({"type":"cost.update"})));
        assert!(!remember(&mut m, &json!({"no_type":1})));
        assert_eq!(m.len(), 1);
    }
    #[test]
    fn the_runner_down_event_and_stop_command_have_the_right_shape() {
        let r = Runner::new();
        assert!(r.send(&json!({})).is_err());
        assert!(r.stop_everything("test").is_err());
    }

    // ---- keeping the engine alive: pretend engines that crash, hang and misbehave ----

    use std::sync::atomic::AtomicUsize;
    fn quick() -> Timing { Timing { healthy: Duration::from_millis(400), base: Duration::from_millis(10), max_wait: Duration::from_millis(80), give_up_after: 4, quit_grace: Duration::from_millis(250), heartbeat: Duration::from_millis(150) } }
    fn sh(script: &'static str) -> io::Result<Child> { Command::new("sh").args(["-c", script]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn() }
    struct Rig { shared: Arc<Shared>, events: Arc<Mutex<Vec<Value>>>, spawns: Arc<AtomicUsize>, types: Arc<Mutex<Vec<String>>> }
    fn rig(script: &'static str, t: Timing) -> Rig {
        let shared = Shared::new();
        let events = Arc::new(Mutex::new(Vec::new())); let types = Arc::new(Mutex::new(Vec::new())); let spawns = Arc::new(AtomicUsize::new(0));
        let (e2, t2, s2) = (events.clone(), types.clone(), spawns.clone());
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh(script) }), Arc::new(move |v| e2.lock().unwrap().push(v)), Arc::new(move |ty| t2.lock().unwrap().push(ty.to_string())), t);
        Rig { shared, events, spawns, types }
    }
    fn wait_for(f: impl Fn() -> bool, ms: u64) -> bool { let end = Instant::now() + Duration::from_millis(ms); while Instant::now() < end { if f() { return true; } std::thread::sleep(Duration::from_millis(10)); } f() }
    fn kinds(r: &Rig) -> Vec<String> { r.events.lock().unwrap().iter().map(|e| e["type"].as_str().unwrap_or("?").to_string()).collect() }

    #[test]
    fn waits_grow_each_time_and_stop_growing() {
        let t = Timing::default();
        assert_eq!(backoff(1, &t), Some(Duration::from_secs(1)));
        assert_eq!(backoff(2, &t), Some(Duration::from_secs(2)));
        assert_eq!(backoff(3, &t), Some(Duration::from_secs(4)));
        assert_eq!(backoff(5, &t), Some(Duration::from_secs(16)));
        assert_eq!(backoff(t.give_up_after, &t), None);
        assert!(backoff(0, &t).is_some());
        let big = Timing { give_up_after: 100, ..t };
        assert_eq!(backoff(40, &big), Some(Duration::from_secs(30)));        // never overflows, never longer than the cap
    }
    #[test]
    fn a_line_with_no_end_cannot_grow_memory_forever() {
        let mut buf = Vec::new();
        let chunk = vec![b'x'; 1024 * 1024];
        for _ in 0..8 { split_lines(&mut buf, &chunk); }
        assert!(buf.len() <= MAX_LINE + chunk.len());
        assert!(split_lines(&mut buf, b"{\"ok\":1}\n").iter().all(|l| !l.is_empty()));
    }
    #[test]
    fn events_from_the_engine_arrive_in_order_and_garbage_is_ignored() {
        let r = rig(r#"echo '{"v":1,"id":"1","type":"runner.hello"}'; echo 'not json'; echo '{"v":1,"id":"2","type":"auth.status"}'; sleep 5"#, quick());
        assert!(wait_for(|| kinds(&r).len() >= 2, 3000));
        assert_eq!(kinds(&r)[..2], ["runner.hello".to_string(), "auth.status".to_string()]);
        assert_eq!(r.types.lock().unwrap()[..2], ["runner.hello".to_string(), "auth.status".to_string()]);
        r.shared.quitting.store(true, Ordering::SeqCst); r.shared.kill();
    }
    #[test]
    fn an_engine_that_crashes_is_started_again_and_the_pages_are_told() {
        let r = rig(r#"echo '{"v":1,"id":"1","type":"runner.hello"}'; sleep 0.05"#, quick());
        assert!(wait_for(|| r.spawns.load(Ordering::SeqCst) >= 2, 4000), "it was never started again");
        let k = kinds(&r);
        assert!(k.contains(&"app.runner_down".to_string()));
        assert!(wait_for(|| kinds(&r).contains(&"app.runner_restarted".to_string()), 3000));
        r.shared.quitting.store(true, Ordering::SeqCst); r.shared.kill();
    }
    #[test]
    fn an_engine_that_keeps_crashing_is_given_up_on_with_a_plain_message() {
        let r = rig("exit 1", quick());
        assert!(wait_for(|| kinds(&r).iter().any(|k| k == "app.runner_down") && r.events.lock().unwrap().iter().any(|e| e["reason"].as_str().is_some_and(|m| m.contains("keeps stopping"))), 5000));
        let n = r.spawns.load(Ordering::SeqCst);
        assert!(n <= 6, "it kept restarting: {n}");
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(r.spawns.load(Ordering::SeqCst), n, "it kept trying after giving up");
    }
    #[test]
    fn an_engine_that_cannot_be_started_at_all_is_reported_not_fatal() {
        let shared = Shared::new(); let events = Arc::new(Mutex::new(Vec::new())); let e2 = events.clone();
        supervise(shared.clone(), Arc::new(|| Err(io::Error::new(io::ErrorKind::NotFound, "no bun"))), Arc::new(move |v| e2.lock().unwrap().push(v)), Arc::new(|_| {}), quick());
        assert!(wait_for(|| events.lock().unwrap().iter().any(|e| e["reason"].as_str().is_some_and(|m| m.contains("keeps stopping"))), 5000));
        assert!(events.lock().unwrap().iter().any(|e| e["reason"].as_str().is_some_and(|m| m.contains("no bun"))));
    }
    #[test]
    fn sending_never_waits_even_when_the_engine_stops_reading() {
        let r = rig("sleep 20", Timing { healthy: Duration::from_secs(60), ..quick() });
        assert!(wait_for(|| r.shared.send_line("{}".into()).is_ok(), 3000));
        let line = format!("{{\"pad\":\"{}\"}}", "x".repeat(8000));
        let t0 = Instant::now();
        let results: Vec<_> = (0..2000).map(|_| r.shared.send_line(line.clone())).collect();
        assert!(t0.elapsed() < Duration::from_millis(500), "sending waited: {:?}", t0.elapsed());
        assert!(results.iter().any(|x| x.as_ref().is_err_and(|m| m.contains("not answering"))), "a full queue was never reported");
        r.shared.quitting.store(true, Ordering::SeqCst); r.shared.kill();
    }
    #[test]
    fn stop_everything_forces_a_stuck_engine_to_stop_and_it_comes_back() {
        // An engine that never answers anything.
        let shared = Shared::new(); let spawns = Arc::new(AtomicUsize::new(0)); let s2 = spawns.clone();
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh("sleep 30") }), Arc::new(|_| {}), Arc::new(|_| {}), Timing { healthy: Duration::from_secs(60), ..quick() });
        let runner = Runner::with_shared(shared.clone(), Timing { healthy: Duration::from_secs(60), ..quick() });
        assert!(wait_for(|| runner.send(&json!({})).is_ok(), 3000));
        std::thread::sleep(Duration::from_millis(50));
        let t0 = Instant::now();
        assert!(runner.stop_everything("test").is_ok());
        assert!(t0.elapsed() < Duration::from_millis(100), "the Stop key waited");
        assert!(wait_for(|| spawns.load(Ordering::SeqCst) >= 2, 4000), "a stuck engine was never forced to restart");
        runner.shut_down();
    }
    #[test]
    fn stop_everything_leaves_a_healthy_engine_alone() {
        // This engine answers every line it is sent, like the real one does.
        let shared = Shared::new(); let spawns = Arc::new(AtomicUsize::new(0)); let s2 = spawns.clone();
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh(r#"while read l; do echo '{"v":1,"id":"p","type":"runner.pong"}'; done"#) }), Arc::new(|_| {}), Arc::new(|_| {}), Timing { healthy: Duration::from_secs(60), ..quick() });
        let runner = Runner::with_shared(shared.clone(), Timing { healthy: Duration::from_secs(60), ..quick() });
        assert!(wait_for(|| runner.send(&json!({})).is_ok(), 3000));
        runner.stop_everything("test").unwrap();
        std::thread::sleep(Duration::from_millis(500));
        assert_eq!(spawns.load(Ordering::SeqCst), 1, "a healthy engine was restarted");
        runner.shut_down();
    }
    #[test]
    fn stop_everything_with_no_engine_says_so_plainly() {
        let runner = Runner::new();
        assert!(runner.stop_everything("test").unwrap_err().contains("not running"));
    }
    #[test]
    fn quitting_does_not_hang_on_an_engine_that_ignores_the_closed_pipe_and_does_not_restart_it() {
        let shared = Shared::new(); let spawns = Arc::new(AtomicUsize::new(0)); let s2 = spawns.clone();
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh("trap '' HUP; sleep 30") }), Arc::new(|_| {}), Arc::new(|_| {}), quick());
        let runner = Runner::with_shared(shared.clone(), quick());
        assert!(wait_for(|| runner.send(&json!({})).is_ok(), 3000));
        let t0 = Instant::now();
        runner.shut_down();
        assert!(t0.elapsed() < Duration::from_secs(2), "quitting hung for {:?}", t0.elapsed());
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(spawns.load(Ordering::SeqCst), 1, "it restarted the engine while quitting");
        assert!(runner.send(&json!({})).is_err());
    }
    #[test]
    fn a_poisoned_lock_does_not_take_everything_else_down() {
        let shared = Shared::new();
        let s2 = shared.clone();
        let _ = std::thread::spawn(move || { let _g = s2.tx.lock().unwrap(); panic!("boom"); }).join();
        assert!(shared.send_line("{}".into()).is_err());      // an ordinary error, not another panic
    }
}
