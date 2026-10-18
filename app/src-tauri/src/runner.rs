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
    // Not here: memory.pause, explain.set, spending.set and metrics.set. Those are settings (settings.rs, T16): the page asks
    // the shell (settings_set), the shell checks the value and sends the engine's own command itself. settings.apply is
    // the shell's own line too.
    "memory.list", "memory.forget", "memory.edit", "memory.erase", "memory.export", "memory.agents", "recap.ask", "ship.preview", "ship.live", "ship.rollback", "auth.check", "doctor.check", "memory.add", "problem.find", "project.inspect", "project.install", "diagram.ask",
    "walk.list", "walk.start", "walk.acted", "walk.answer", "walk.skip", "walk.stop",
    "metrics.note", "metrics.show", "metrics.erase",
    // The browser check's one time download, on the person's press, and asking whether it is set up. They name no folder
    // or address (the engine always downloads Playwright's own browser into Companion's own folder), so not project bound.
    "browser.check", "browser.install",
    "spending.show",
    // Which task broke it: checks earlier saved versions in a private copy, then undoes just that task on a yes. Both name the
    // project, so both are project bound. error.explain is not here: only the hotkey flow (errhelp.rs) sends it.
    "bisect.start", "bisect.undo",
    // Your turn: after a fix, the person asks to make the second of two identical changes themselves, then to check it.
    "teach.try", "teach.check",
    // The zero cost warm up when Home opens or the ask box gets the keyboard (runner/src/warm.ts). Names nothing.
    "engine.warm",
];

/// Ends the engine and everything it started in its group (Claude Code and its helpers), not just the engine itself.
fn kill_group(c: &mut Child) {
    let pid = c.id() as i32;
    if pid > 1 { unsafe { libc::killpg(pid, libc::SIGKILL); } }
    let _ = c.kill();
}

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
/// The stand in project for lessons that need none (see runner/src/walk.ts).
pub const NO_PROJECT: &str = "no-project";
/// Every command that works on a project folder may name only the folder the person chose (a page could otherwise ask the
/// engine to work on any folder on the Mac). Not here: commands that name no project, and the stand in for lessons that need none.
pub const PROJECT_BOUND: &[&str] = &[
    "project.inspect", "project.install", "problem.find", "diagram.ask", "walk.list", "walk.start",
    "agent.start", "agent.send", "drive.plan", "rescue.diagnose", "research.ask", "ship.check", "ship.preview", "ship.live", "ship.rollback",
    "checkpoint.restore", "tasks.list", "recap.ask", "explain.set",
    "memory.list", "memory.forget", "memory.edit", "memory.pause", "memory.erase", "memory.export", "memory.agents", "memory.add",
    "spending.show", "spending.set", "teach.try", "teach.check",
    "bisect.start", "bisect.undo",
];
pub fn check_project(v: &Value, current: &str) -> Result<(), String> {
    let t = v.get("type").and_then(Value::as_str).unwrap_or("");
    if !PROJECT_BOUND.contains(&t) { return Ok(()); }
    match v.get("project").and_then(Value::as_str) {
        // Lessons that need no project (installing a tool, leaving a builder) use this stand in name and read nothing. The
        // settings page shows the daily limit, Explain and pausing (for every project) before a folder is chosen: the engine
        // reads no folder for these with the stand in (profile only memory, nothing spent).
        Some(NO_PROJECT) if t.starts_with("walk.") || t == "spending.show" || t == "memory.list" => Ok(()),
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
/// COMPANION_FAST_MODEL and COMPANION_VISION_MODEL switch the two small lanes' models (defaults in runner/src/models.ts);
/// COMPANION_REVIEW=1 turns on the second model review of risky changes (proof rung 7).
const ENV_ALLOWED: &[&str] = &["COMPANION_ROUTE", "COMPANION_MODEL", "COMPANION_KEYCHAIN_SERVICE", "COMPANION_KEYCHAIN_ACCOUNT", "CLAUDE_CONFIG_DIR", "COMPANION_ASSIST_STUB", "COMPANION_AIM", "COMPANION_AIM_MODEL", "COMPANION_FAST_MODEL", "COMPANION_VISION_MODEL", "COMPANION_REVIEW"];

pub fn allowed_env(dev: &Value) -> BTreeMap<String, String> {
    dev.get("env").and_then(Value::as_object).map(|o| {
        o.iter().filter(|(k, _)| ENV_ALLOWED.contains(&k.as_str())).filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()
    }).unwrap_or_default()
}

#[cfg(test)]
pub fn locations(dev_json: Option<&str>, env: &dyn Fn(&str) -> Option<String>, data: PathBuf) -> Result<Locations, String> { locations_with_bundle(dev_json, env, data, None) }

/// Where the engine is inside the installed app: `Contents/Resources/engine` holds `bin/bun` and `runner/src/main.ts`
/// (staged by app/scripts/stage-engine.sh). None when not running from an installed app (a development run).
pub fn bundled_engine(exe: &std::path::Path) -> Option<PathBuf> {
    exe.ancestors().find(|a| a.file_name().is_some_and(|n| n == "Contents")).map(|c| c.join("Resources/engine"))
}

/// The developer file first, then the environment, then the engine that came with the app.
pub fn locations_with_bundle(dev_json: Option<&str>, env: &dyn Fn(&str) -> Option<String>, data: PathBuf, bundle: Option<PathBuf>) -> Result<Locations, String> {
    let dev: Value = dev_json.and_then(|s| serde_json::from_str(s).ok()).unwrap_or(Value::Null);
    let pick = |key: &str, var: &str| dev.get(key).and_then(Value::as_str).map(str::to_string).or_else(|| env(var));
    let in_bundle = |rel: &str| bundle.as_ref().map(|b| b.join(rel)).filter(|p| p.is_file());
    let (dev_bun, dev_runner) = (pick("bun", "COMPANION_BUN"), pick("runner", "COMPANION_RUNNER"));
    // Both from the developer's setup or both from the installed app, never a mix of two different engines.
    let (bun, runner) = match (dev_bun, dev_runner) {
        (Some(b), Some(r)) => (PathBuf::from(b), PathBuf::from(r)),
        (Some(_), None) => return Err("Companion cannot find the runner. Run app/scripts/dev-setup.sh".into()),
        (None, Some(_)) => return Err("Companion cannot find Bun. Run app/scripts/dev-setup.sh".into()),
        (None, None) => match (in_bundle("bin/bun"), in_bundle("runner/src/main.ts")) {
            (Some(b), Some(r)) => (b, r),
            _ if bundle.is_some() => return Err("Companion's engine is missing from this copy of the app. Download Companion again and replace this one.".into()),
            _ => return Err("Companion cannot find Bun. Run app/scripts/dev-setup.sh".into()),
        },
    };
    Ok(Locations { bun, runner, data, env: allowed_env(&dev) })
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
    /// How many events have been read from the engine, from any start of it. The Stop key's check counts an event read
    /// after the Stop was sent as the engine's answer: a count, so the clock and the moment the engine started play no part.
    events_read: AtomicU64,
    /// How many Stop key checks have ended, and how many of them found the engine not answering and stopped it by force.
    stop_checks: AtomicU64,
    forced_stops: AtomicU64,
}
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> { m.lock().unwrap_or_else(|e| e.into_inner()) }   // one panic must never poison everything after it

impl Shared {
    pub fn new() -> Arc<Shared> { Arc::new(Shared { tx: Mutex::new(None), child: Mutex::new(None), quitting: AtomicBool::new(false), events_read: AtomicU64::new(0), stop_checks: AtomicU64::new(0), forced_stops: AtomicU64::new(0) }) }
    /// Queue one line for the engine. Never waits: a full queue or a missing engine is an immediate, plain error.
    pub fn send_line(&self, line: String) -> Result<(), String> {
        match lock(&self.tx).as_ref() {
            None => Err("The engine is not running.".into()),
            Some(tx) => tx.try_send(line).map_err(|e| match e { TrySendError::Full(_) => "The engine is not answering.".to_string(), TrySendError::Disconnected(_) => "The engine is not running.".to_string() }),
        }
    }
    pub fn kill(&self) { if let Some(c) = lock(&self.child).as_mut() { kill_group(c); } }
}

/// Runs the engine for as long as the app lives: start it, read its lines, and start it again when it stops.
/// `spawn` and `emit` are passed in so this can be tested with pretend engines.
#[cfg(test)]
pub fn supervise(shared: Arc<Shared>, spawn: Arc<dyn Fn() -> io::Result<Child> + Send + Sync>, emit: Arc<dyn Fn(Value) + Send + Sync>, on_type: Arc<dyn Fn(&str) + Send + Sync>, t: Timing) -> std::thread::JoinHandle<()> {
    supervise_first(shared, spawn, emit, on_type, Arc::new(|| None), t)
}

/// The same, with the line the engine must read first after every start (the settings, settings.rs `apply_line`, worked
/// out fresh each time). It is queued on the new engine's own queue before that queue is made the one everything else is
/// sent to, so no page command can ever reach a new engine before it.
pub fn supervise_first(shared: Arc<Shared>, spawn: Arc<dyn Fn() -> io::Result<Child> + Send + Sync>, emit: Arc<dyn Fn(Value) + Send + Sync>, on_type: Arc<dyn Fn(&str) + Send + Sync>, first_line: Arc<dyn Fn() -> Option<String> + Send + Sync>, t: Timing) -> std::thread::JoinHandle<()> {
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
                    if let Some(line) = first_line() { let _ = tx.try_send(line); }
                    *lock(&shared.tx) = Some(tx);
                    *lock(&shared.child) = Some(child);
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
                                    shared.events_read.fetch_add(1, Ordering::SeqCst);
                                    on_type(v.get("type").and_then(Value::as_str).unwrap_or("?"));   // the type only, never the content
                                    emit(v);
                                }
                            }
                        }
                    }
                    *lock(&shared.tx) = None;                  // ends the writer thread
                    if let Some(mut c) = lock(&shared.child).take() { kill_group(&mut c); let _ = c.wait(); }   // never leave a zombie behind
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
        crate::voicewords::note_report(&v);   // a project check's setting names, for hold to talk (names only)
        let _ = app.emit("runner-event", v);
    }

    /// Start the engine and keep it running. Each event line goes to the pages as "runner-event". `first_line` is what the
    /// engine reads first after every start (the settings).
    pub fn start(&self, app: &AppHandle, loc: &Locations, on_type: impl Fn(&str) + Send + Sync + 'static, first_line: impl Fn() -> Option<String> + Send + Sync + 'static) -> Result<(), String> {
        std::fs::create_dir_all(&loc.data).map_err(|e| e.to_string())?;
        let loc = loc.clone();
        let spawn: Arc<dyn Fn() -> io::Result<Child> + Send + Sync> = Arc::new(move || {
            use std::os::unix::process::CommandExt;
            // Its own process group, so that when the engine has to be ended by force, what it started goes with it.
            Command::new(&loc.bun).arg(&loc.runner).process_group(0).env("COMPANION_DATA", &loc.data).envs(&loc.env).env("COMPANION_KEY_SOURCE", "app")
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
        });
        // Fail loudly now, not later, if the engine cannot be started at all.
        let first = spawn().map_err(|e| format!("could not start the runner: {e}"))?;
        let first = Arc::new(Mutex::new(Some(first)));
        let spawn2: Arc<dyn Fn() -> io::Result<Child> + Send + Sync> = { let first = first.clone(); let again = spawn.clone(); Arc::new(move || match lock(&first).take() { Some(c) => Ok(c), None => again() }) };
        let a = app.clone();
        let emit: Arc<dyn Fn(Value) + Send + Sync> = Arc::new(move |v| Runner::publish(&a, v));
        supervise_first(self.shared.clone(), spawn2, emit, Arc::new(on_type), Arc::new(first_line), self.timing);
        Ok(())
    }

    /// Write one command line to the engine. Never waits.
    pub fn send(&self, cmd: &Value) -> Result<(), String> { self.shared.send_line(cmd.to_string()) }
    /// Write one line the shell made itself (the settings, settings.rs `apply_line`), exactly as it is. Never waits.
    pub fn send_line(&self, line: String) -> Result<(), String> { self.shared.send_line(line) }

    /// Hands the engine the key, or tells it there is none (after the key was removed). The line goes out exactly as
    /// `handoff_line` wrote it: the engine takes it only when it starts `{"v":1,"type":"auth.key"`, and turning it into a
    /// JSON value first would sort its fields ("key" first), so the engine would refuse it and stay without a key.
    pub fn hand_key(&self, key: Option<&str>) -> Result<(), String> { self.shared.send_line(crate::keystore::handoff_line(key)) }

    /// The Stop key. It must work even when the engine is stuck, so if the stop cannot be delivered, or the engine does not
    /// answer a moment later, the engine is stopped by force and started again.
    /// The check runs on a thread of its own, so the Stop key never waits for it, and ends as soon as the engine answers.
    pub fn stop_everything(&self, reason: &str) -> Result<(), String> {
        let read_before = self.shared.events_read.load(Ordering::SeqCst);
        let r = self.send(&serde_json::json!({ "v": 1, "id": format!("kill-{}", std::process::id()), "type": "agent.interruptAll", "reason": reason }));
        if r.is_err() { self.shared.kill(); return r; }
        let _ = self.send(&serde_json::json!({ "v": 1, "id": format!("ping-{}", now_ms()), "type": "runner.ping" }));   // a healthy engine always answers this
        let (shared, wait) = (self.shared.clone(), self.timing.heartbeat);
        std::thread::spawn(move || {
            let until = Instant::now() + wait;
            let answered = || shared.events_read.load(Ordering::SeqCst) > read_before;
            while !answered() && Instant::now() < until && !shared.quitting.load(Ordering::SeqCst) { std::thread::sleep(Duration::from_millis(20).min(wait)); }
            if !answered() && !shared.quitting.load(Ordering::SeqCst) { shared.forced_stops.fetch_add(1, Ordering::SeqCst); shared.kill(); }
            shared.stop_checks.fetch_add(1, Ordering::SeqCst);
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
        // Every command that works on a project is held to the chosen folder (found by the 15 Oct 2026 review).
        for t in ["agent.start", "drive.plan", "rescue.diagnose", "research.ask", "ship.check", "ship.preview", "ship.live", "ship.rollback", "checkpoint.restore", "tasks.list", "recap.ask", "explain.set", "memory.list", "memory.erase", "memory.add"] {
            assert!(check_project(&c(t, "/Users/me/other"), "/Users/me/site").is_err(), "{t} must not accept another folder");
            assert!(check_project(&c(t, "/Users/me/site"), "/Users/me/site").is_ok(), "{t} must accept the chosen folder");
            assert!(check_project(&c(t, "/Users/me/site"), "").is_err(), "{t} must not work before a folder is chosen");
        }
        assert!(check_project(&c("runner.ping", "/anything"), "/Users/me/site").is_ok());   // not a project bound command
        // Lessons that need no project may use the stand in name, with no folder chosen; nothing else may.
        assert!(check_project(&c("walk.start", "no-project"), "").is_ok());
        assert!(check_project(&c("walk.list", "no-project"), "/Users/me/site").is_ok());
        assert!(check_project(&c("project.install", "no-project"), "/Users/me/site").is_err());
        assert!(check_project(&c("problem.find", "no-project"), "").is_err());
        assert!(check_project(&c("walk.start", "/Users/me/other"), "/Users/me/site").is_err());
    }
    use serde_json::json;

    #[test]
    fn allows_the_commands_pages_need() {
        for t in ["agent.start", "agent.interruptAll", "approval.resolve", "checkpoint.restore", "tasks.list", "drive.plan", "drive.approve", "loop.choose", "drive.pause", "drive.resume", "rescue.diagnose", "research.ask", "ship.check", "spending.show", "memory.list", "metrics.show"] {
            assert!(check_command(&json!({"v":1,"id":"c","type":t})).is_ok(), "{t}");
        }
    }
    #[test]
    fn settings_reach_the_engine_only_from_the_shell_never_from_a_page() {
        // The registry (settings.rs, T16) is the only way to change these: the shell checks the value, then sends the
        // engine's own command itself. A page may still ask to be shown them (spending.show, memory.list, metrics.show).
        for t in ["settings.apply", "spending.set", "explain.set", "memory.pause", "metrics.set"] {
            assert!(check_command(&json!({ "v": 1, "id": "c", "type": t, "project": "/Users/me/site" })).is_err(), "{t} must not come from a page");
        }
        let fixtures = include_str!("../../../protocol/fixtures/commands.jsonl");
        let line = fixtures.lines().find(|l| l.contains("\"settings.apply\"")).expect("a settings.apply fixture");
        assert!(check_command(&serde_json::from_str(line).unwrap()).is_err());
    }
    #[test]
    fn with_no_folder_chosen_the_settings_page_may_still_ask_for_the_limit_and_memory() {
        // The daily limit, Explain and pausing are for every project, so Settings shows them before a folder is chosen.
        let c = |t: &str, p: &str| json!({ "v": 1, "id": "x", "type": t, "project": p });
        for t in ["spending.show", "memory.list"] {
            assert!(check_project(&c(t, NO_PROJECT), "").is_ok(), "{t}");
            assert!(check_project(&c(t, NO_PROJECT), "/Users/me/site").is_ok(), "{t}");
            assert!(check_project(&c(t, "/Users/me/other"), "/Users/me/site").is_err(), "{t}");
        }
        for t in ["memory.forget", "memory.erase", "memory.add", "memory.export", "tasks.list", "agent.start", "spending.set"] {
            assert!(check_project(&c(t, NO_PROJECT), "").is_err(), "{t} must not take the stand in");
        }
    }
    #[test]
    fn the_browser_check_download_may_be_asked_for_by_a_page_and_names_no_folder() {
        // The card's button and its question: allowed, and not tied to a project (they name no folder and no address).
        for t in ["browser.install", "browser.check"] {
            assert!(check_command(&json!({"v":1,"id":"c","type":t})).is_ok(), "{t}");
            assert!(!PROJECT_BOUND.contains(&t), "{t}");
            assert!(check_project(&json!({"v":1,"id":"c","type":t}), "").is_ok(), "{t} works before a folder is chosen");
        }
    }
    #[test]
    fn which_task_broke_it_may_be_asked_by_a_page_but_only_for_the_chosen_project() {
        let c = |t: &str, p: &str| json!({ "v": 1, "id": "x", "type": t, "project": p, "agent": "builder-1", "checkpoint": "cp_0003", "confirm": true });
        for t in ["bisect.start", "bisect.undo"] {
            assert!(check_command(&c(t, "/Users/me/site")).is_ok(), "{t}");
            assert!(check_project(&c(t, "/Users/me/site"), "/Users/me/site").is_ok(), "{t}");
            assert!(check_project(&c(t, "/Users/me/other"), "/Users/me/site").is_err(), "{t} must not accept another folder");
            assert!(check_project(&c(t, "/Users/me/site"), "").is_err(), "{t} must not work before a folder is chosen");
        }
    }
    #[test]
    fn a_page_may_ask_the_engine_to_get_ready_and_it_names_no_folder() {
        // The zero cost warm up (runner/src/warm.ts): Home opened or the ask box got the keyboard. It names nothing.
        let w = json!({ "v": 1, "id": "w", "type": "engine.warm" });
        assert!(check_command(&w).is_ok());
        assert!(!PROJECT_BOUND.contains(&"engine.warm"));
        assert!(check_project(&w, "").is_ok());
    }
    #[test]
    fn a_page_can_never_send_text_to_be_explained_as_if_it_was_read_from_another_app() {
        // Only the hotkey flow (errhelp.rs) sends error.explain, straight to the engine, after the light and the read rules.
        assert!(check_command(&json!({ "v": 1, "id": "x", "type": "error.explain", "req": "r", "app": "a", "text": "t" })).is_err());
    }
    #[test]
    fn the_shared_command_fixtures_for_pages_pass_the_same_checks() {
        // protocol/fixtures is read by the runner's suite too: both sides agree on what these commands look like.
        let fixtures = include_str!("../../../protocol/fixtures/commands.jsonl");
        let mut seen = 0;
        for line in fixtures.lines().filter(|l| !l.trim().is_empty()) {
            let v: Value = serde_json::from_str(line).expect("a fixture is JSON");
            let t = v["type"].as_str().unwrap_or("");
            if t.starts_with("bisect.") {
                seen += 1;
                assert!(check_command(&v).is_ok(), "{line}");
                let project = v["project"].as_str().unwrap_or("");
                assert!(check_project(&v, project).is_ok(), "{line}");
                assert!(check_project(&v, "/somewhere/else").is_err(), "{line}");
            }
            if t == "error.explain" { assert!(check_command(&v).is_err(), "{line}"); }
        }
        assert_eq!(seen, 2);
    }
    #[test]
    fn your_turn_may_be_asked_for_by_a_page_and_only_for_the_chosen_project() {
        let c = |t: &str, p: &str| json!({ "v": 1, "id": "x", "type": t, "project": p, "agent": "builder-1", "checkpoint": "cp_0001" });
        for t in ["teach.try", "teach.check"] {
            assert!(check_command(&c(t, "/Users/me/site")).is_ok(), "{t}");
            assert!(check_project(&c(t, "/Users/me/site"), "/Users/me/site").is_ok(), "{t}");
            assert!(check_project(&c(t, "/Users/me/other"), "/Users/me/site").is_err(), "{t}");
            assert!(check_project(&c(t, "/Users/me/site"), "").is_err(), "{t}");
        }
    }
    #[test]
    fn a_follow_up_or_try_again_may_only_name_the_chosen_project() {
        // agent.send carries on the last task as a new task in that project, so it is held to the chosen folder like agent.start.
        let c = |p: &str| json!({ "v": 1, "id": "x", "type": "agent.send", "agent": "builder-1", "project": p, "text": "the button is still grey" });
        assert!(check_command(&c("/Users/me/site")).is_ok());
        assert!(check_project(&c("/Users/me/site"), "/Users/me/site").is_ok());
        assert!(check_project(&c("/Users/me/other"), "/Users/me/site").is_err());
        assert!(check_project(&c("/Users/me/site"), "").is_err());
        assert!(check_project(&json!({ "v": 1, "id": "x", "type": "agent.send", "agent": "builder-1", "retry": true }), "/Users/me/site").is_err(), "a follow up that names no project is refused");
    }
    #[test]
    fn the_spending_limit_row_may_only_name_the_chosen_project() {
        let c = |t: &str, p: &str| json!({ "v": 1, "id": "x", "type": t, "project": p, "limitUsd": 25 });
        for t in ["spending.show", "spending.set"] {
            assert!(check_project(&c(t, "/Users/me/site"), "/Users/me/site").is_ok(), "{t}");
            assert!(check_project(&c(t, "/Users/me/other"), "/Users/me/site").is_err(), "{t}");
            assert!(check_project(&c(t, "/Users/me/site"), "").is_err(), "{t}");
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
    fn the_dev_file_may_switch_the_small_lanes_models_and_the_second_review() {
        let e = allowed_env(&json!({"env": {"COMPANION_FAST_MODEL":"f","COMPANION_VISION_MODEL":"v","COMPANION_REVIEW":"1",
            "COMPANION_DAILY_CEILING_USD":"0.01","COMPANION_SCRIPT":"[]","ANTHROPIC_MODEL":"x"}}));
        assert_eq!(e.get("COMPANION_FAST_MODEL").map(String::as_str), Some("f"));
        assert_eq!(e.get("COMPANION_VISION_MODEL").map(String::as_str), Some("v"));
        assert_eq!(e.get("COMPANION_REVIEW").map(String::as_str), Some("1"));
        // Still refused: the spending limit is the person's own choice in Settings, scripts are for tests, and Anthropic's own variables never pass.
        for k in ["COMPANION_DAILY_CEILING_USD", "COMPANION_SCRIPT", "ANTHROPIC_MODEL"] { assert!(!e.contains_key(k), "{k}"); }
        assert_eq!(e.len(), 3);
    }
    #[test]
    fn a_missing_or_odd_env_section_gives_nothing() {
        assert!(allowed_env(&json!({})).is_empty());
        assert!(allowed_env(&json!({"env": "x"})).is_empty());
        assert!(allowed_env(&json!({"env": {"COMPANION_ROUTE": 5}})).is_empty());
    }
    #[test]
    fn an_installed_app_uses_the_engine_that_came_with_it_and_the_developer_file_still_wins() {
        let root = std::env::temp_dir().join(format!("companion-engine-{}", std::process::id())); let _ = std::fs::remove_dir_all(&root);
        let eng = root.join("Companion.app/Contents/Resources/engine");
        std::fs::create_dir_all(eng.join("bin")).unwrap(); std::fs::create_dir_all(eng.join("runner/src")).unwrap();
        std::fs::write(eng.join("bin/bun"), "x").unwrap(); std::fs::write(eng.join("runner/src/main.ts"), "x").unwrap();
        let none = |_: &str| None;
        let l = locations_with_bundle(None, &none, "/d".into(), Some(eng.clone())).unwrap();
        assert_eq!((l.bun, l.runner), (eng.join("bin/bun"), eng.join("runner/src/main.ts")));
        let l = locations_with_bundle(Some(r#"{"bun":"/dev/bun","runner":"/dev/r"}"#), &none, "/d".into(), Some(eng.clone())).unwrap();
        assert_eq!((l.bun, l.runner), (PathBuf::from("/dev/bun"), PathBuf::from("/dev/r")));
        // the app's own executable leads to the engine folder
        assert_eq!(bundled_engine(&root.join("Companion.app/Contents/MacOS/companion-app")), Some(root.join("Companion.app/Contents/Resources/engine")));
        assert_eq!(bundled_engine(std::path::Path::new("/repo/app/src-tauri/target/debug/companion-app")), None);
        std::fs::remove_file(eng.join("bin/bun")).unwrap();
        let e = locations_with_bundle(None, &none, "/d".into(), Some(eng)).unwrap_err();
        assert!(e.contains("missing from this copy") && e.ends_with('.'));
        let _ = std::fs::remove_dir_all(&root);
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
    fn the_key_reaches_the_engine_in_the_exact_form_the_engine_takes_it() {
        // The engine takes the key only from a line that starts exactly like this (runner/src/main.ts). Any other line is
        // read as a page command and refused, and the engine would stay without a key.
        let prefix = r#"{"v":1,"type":"auth.key""#;
        assert!(include_str!("../../../runner/src/main.ts").contains(&format!("line.startsWith('{prefix}')")));
        let out = std::env::temp_dir().join(format!("companion-handoff-{}", std::process::id()));
        let _ = std::fs::remove_file(&out);
        let script: &'static str = Box::leak(format!("read -r a; read -r b; printf '%s\\n%s\\n' \"$a\" \"$b\" > '{}'; sleep 5", out.display()).into_boxed_str());
        let r = rig(script, quick());
        let runner = Runner::with_shared(r.shared.clone(), quick());
        assert!(wait_for(|| runner.hand_key(Some("sk-ant-test-not-a-real-key")).is_ok(), 3000));
        assert!(runner.hand_key(None).is_ok());
        assert!(wait_for(|| std::fs::read_to_string(&out).is_ok_and(|t| t.lines().count() >= 2), 3000), "the engine never got two lines");
        let got = std::fs::read_to_string(&out).unwrap();
        let lines: Vec<&str> = got.lines().collect();
        assert!(lines[0].starts_with(prefix), "{}", lines[0].replace("sk-ant-test-not-a-real-key", "<key>"));
        assert!(lines[0].contains(r#""key":"sk-ant-test-not-a-real-key""#));
        assert_eq!(lines[1], r#"{"v":1,"type":"auth.key","key":null}"#);
        r.shared.quitting.store(true, Ordering::SeqCst); r.shared.kill();
        let _ = std::fs::remove_file(&out);
    }
    #[test]
    fn the_settings_line_is_the_first_the_engine_reads_after_every_start() {
        // Each start of the engine writes the first line it reads to a file and stops, so the supervisor starts it again.
        // A page command sent the moment the engine is up must never come first: the settings line is queued before the
        // engine can be reached at all (supervise_first).
        let out = std::env::temp_dir().join(format!("companion-first-line-{}", std::process::id()));
        let _ = std::fs::remove_file(&out);
        let script: &'static str = Box::leak(format!("read -r a; printf '%s\\n' \"$a\" >> '{}'; sleep 0.2", out.display()).into_boxed_str());
        let shared = Shared::new(); let spawns = Arc::new(AtomicUsize::new(0)); let s2 = spawns.clone();
        let n = Arc::new(AtomicUsize::new(0)); let n2 = n.clone();
        let first: Arc<dyn Fn() -> Option<String> + Send + Sync> = Arc::new(move || Some(format!(r#"{{"v":1,"id":"s{}","type":"settings.apply","values":{{}}}}"#, n2.fetch_add(1, Ordering::SeqCst))));
        supervise_first(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh(script) }), Arc::new(|_| {}), Arc::new(|_| {}), first, Timing { give_up_after: 10, ..quick() });
        // Keep sending a page command as fast as possible, from before the engine is even up.
        let stop = Arc::new(AtomicBool::new(false));
        let (sh2, st2) = (shared.clone(), stop.clone());
        let pusher = std::thread::spawn(move || { while !st2.load(Ordering::SeqCst) { let _ = sh2.send_line(r#"{"v":1,"id":"p","type":"runner.ping"}"#.into()); std::thread::sleep(Duration::from_millis(1)); } });
        assert!(wait_for(|| std::fs::read_to_string(&out).is_ok_and(|t| t.lines().count() >= 2), 10_000), "the engine was not started twice");
        stop.store(true, Ordering::SeqCst); let _ = pusher.join();
        shared.quitting.store(true, Ordering::SeqCst); shared.kill();
        let got = std::fs::read_to_string(&out).unwrap();
        for (i, l) in got.lines().enumerate() { assert!(l.contains(r#""type":"settings.apply""#), "start {i} read first: {l}"); }
        assert!(spawns.load(Ordering::SeqCst) >= 2);
        let _ = std::fs::remove_file(&out);
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
        // An engine that ran less than `healthy` counts as having crashed at once. A busy Mac can make even `exit 1` take a
        // while to start and end, so here only a run of half a minute would count as healthy.
        let r = rig("exit 1", Timing { healthy: Duration::from_secs(30), ..quick() });
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
        // The engine never reads (it sleeps 60 seconds). Sending that waited for it would wait until it ended, so the sends
        // run on their own thread and must all be done well before then; and a full queue must be reported, which only
        // sending that does not wait can do. No upper bound is read from the clock for the sending itself.
        let r = rig("sleep 60", Timing { healthy: Duration::from_secs(120), ..quick() });
        assert!(wait_for(|| r.shared.send_line("{}".into()).is_ok(), 3000));
        let line = format!("{{\"pad\":\"{}\"}}", "x".repeat(8000));
        let (tx, rx) = std::sync::mpsc::channel();
        let shared = r.shared.clone();
        std::thread::spawn(move || { let results: Vec<_> = (0..2000).map(|_| shared.send_line(line.clone())).collect(); let _ = tx.send(results); });
        let results = rx.recv_timeout(Duration::from_secs(30)).expect("sending waited for an engine that does not read");
        assert!(results.iter().any(|x| x.as_ref().is_err_and(|m| m.contains("not answering"))), "a full queue was never reported");
        r.shared.quitting.store(true, Ordering::SeqCst); r.shared.kill();
    }
    #[test]
    fn stop_everything_forces_a_stuck_engine_to_stop_and_it_comes_back() {
        // An engine that never answers anything.
        let shared = Shared::new(); let spawns = Arc::new(AtomicUsize::new(0)); let s2 = spawns.clone();
        // The engine is given two seconds to answer before it is forced to stop. The Stop key must not wait for that: when it
        // comes back, the stuck engine is still running (shown by what happened, not by the clock, so a busy Mac cannot fail
        // it). A Stop that waited for the answer would come back to an engine already stopped.
        let t = Timing { healthy: Duration::from_secs(60), heartbeat: Duration::from_secs(2), ..quick() };
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh("sleep 30") }), Arc::new(|_| {}), Arc::new(|_| {}), t);
        let runner = Runner::with_shared(shared.clone(), t);
        assert!(wait_for(|| runner.send(&json!({})).is_ok(), 3000));
        assert!(runner.stop_everything("test").is_ok());
        let running = lock(&shared.child).as_mut().is_some_and(|c| matches!(c.try_wait(), Ok(None)));
        assert!(running && spawns.load(Ordering::SeqCst) == 1, "the Stop key waited for the engine");
        assert!(wait_for(|| spawns.load(Ordering::SeqCst) >= 2, 15_000), "a stuck engine was never forced to restart");
        assert_eq!((shared.stop_checks.load(Ordering::SeqCst), shared.forced_stops.load(Ordering::SeqCst)), (1, 1));
        runner.shut_down();
    }
    #[test]
    fn stop_everything_leaves_a_healthy_engine_alone() {
        // This engine answers every line it is sent, like the real one does, and a second late, as a busy Mac can make it
        // (later than the 150 ms the other tests allow). What is checked is the order of events, not the clock: once its
        // answer has been read, the Stop key's check ends at once and leaves the engine alone. The thirty seconds it is
        // given here (three in the app) are only the test's own limit; an engine that never answered would be forced.
        let shared = Shared::new(); let spawns = Arc::new(AtomicUsize::new(0)); let s2 = spawns.clone();
        let t = Timing { healthy: Duration::from_secs(120), heartbeat: Duration::from_secs(30), ..quick() };
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh(r#"while read l; do sleep 1; echo '{"v":1,"id":"p","type":"runner.pong"}'; done"#) }), Arc::new(|_| {}), Arc::new(|_| {}), t);
        let runner = Runner::with_shared(shared.clone(), t);
        assert!(wait_for(|| runner.send(&json!({})).is_ok(), 3000));
        let read_before = shared.events_read.load(Ordering::SeqCst);
        runner.stop_everything("test").unwrap();
        assert!(wait_for(|| shared.stop_checks.load(Ordering::SeqCst) == 1, 60_000), "the Stop key's check never ended");
        assert!(shared.events_read.load(Ordering::SeqCst) > read_before, "the check ended before the engine answered");
        assert_eq!(shared.forced_stops.load(Ordering::SeqCst), 0, "a healthy engine was stopped by force");
        assert_eq!(spawns.load(Ordering::SeqCst), 1, "a healthy engine was restarted");
        assert!(lock(&shared.child).as_mut().is_some_and(|c| matches!(c.try_wait(), Ok(None))), "the engine is not running");
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
        // The engine would sleep on for 30 seconds: quitting must be over long before, and must have ended it. Run on its own
        // thread, so a quit that hung fails here instead of hanging the tests; no upper bound comes from the clock otherwise.
        let (tx, rx) = std::sync::mpsc::channel();
        let quitter = Runner::with_shared(shared.clone(), quick());
        std::thread::spawn(move || { quitter.shut_down(); let _ = tx.send(()); });
        rx.recv_timeout(Duration::from_secs(20)).expect("quitting hung on an engine that ignores the closed pipe");
        assert!(wait_for(|| lock(&shared.child).as_mut().is_none_or(|c| !matches!(c.try_wait(), Ok(None))), 10_000), "the engine was left running");
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
