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
    "agent.start", "agent.send", "agent.interrupt", "agent.interruptAll", "approval.resolve", "checkpoint.restore", "checkpoint.putBack",
    // Not here: assist.prompt, assist.locate, assist.image and assist.cancel. Only the shell sends them (Prompt help after its
    // hotkey, Show me after its light), straight to the engine: from a page, assist.prompt could name any folder and
    // assist.image could hand in any picture outside a Show me press (rule 5).
    "tasks.list", "drive.plan", "drive.approve", "loop.choose", "drive.pause", "drive.resume", "rescue.diagnose", "research.ask", "ship.check",
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
    // project, so both are project bound. error.explain and secondlook.check are not here: only their hotkey flows (errhelp.rs,
    // seclook.rs) send them.
    "bisect.start", "bisect.undo",
    // Your turn: after a fix, the person asks to make the second of two identical changes themselves, then to check it.
    "teach.try", "teach.check",
    // Watch routines and Where was I (F21). All name the project, so all are project bound. The engine reads only the person's
    // own tools and the address they typed, and only while Companion is open. watch.fix asks for the evidence; the page then
    // starts an ordinary task, on the person's press.
    "watch.add", "watch.list", "watch.remove", "watch.pause", "watch.check", "watch.fix", "where.was.i",
    // The zero cost warm up when Home opens or the ask box gets the keyboard (runner/src/warm.ts). Names nothing.
    "engine.warm",
    // M52 (F30): the review of a change another AI tool made: review it now (optionally with its checks), close its card,
    // or Fix it (an ordinary task with its safety copy). All name the project, so all are project bound.
    "review.now", "review.dismiss", "review.fix",
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
    "checkpoint.restore", "checkpoint.putBack", "tasks.list", "recap.ask", "explain.set",
    "memory.list", "memory.forget", "memory.edit", "memory.pause", "memory.erase", "memory.export", "memory.agents", "memory.add",
    "spending.show", "spending.set", "teach.try", "teach.check",
    "bisect.start", "bisect.undo",
    "watch.add", "watch.list", "watch.remove", "watch.pause", "watch.check", "watch.fix", "where.was.i",
    "review.now", "review.dismiss", "review.fix",
];
pub fn check_project(v: &Value, current: &str) -> Result<(), String> {
    let t = v.get("type").and_then(Value::as_str).unwrap_or("");
    if !PROJECT_BOUND.contains(&t) { return Ok(()); }
    match v.get("project").and_then(Value::as_str) {
        // Lessons that need no project (installing a tool, leaving a builder) use this stand in name and read nothing. The
        // settings page shows the daily limit, Explain and pausing (for every project) before a folder is chosen: the engine
        // reads no folder for these with the stand in (profile only memory; what the light features spend with it counts in its own day).
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
/// `claude`: where Anthropic's Claude build is once installed at first run (claude_install.rs, M22). Each engine start
/// passes it as COMPANION_CLAUDE_BIN only when the file is there; a development run uses the SDK package's own.
/// `developer`: a development build (cfg debug_assertions), the only kind that takes the engine from the developer's own setup.
pub struct Locations { pub bun: PathBuf, pub runner: PathBuf, pub data: PathBuf, pub env: BTreeMap<String, String>, pub claude: Option<PathBuf>, pub developer: bool }

/// The only settings the developer file may pass to the runner. Keys, tokens and anything that could
/// switch accounts are refused here, so a settings file can never carry a secret into the runner.
/// COMPANION_FAST_MODEL and COMPANION_VISION_MODEL switch the two small lanes' models (defaults in runner/src/models.ts);
/// COMPANION_REVIEW=1 turns on the second model review of risky changes (proof rung 7).
/// COMPANION_LANES=direct sends the light lanes straight to the Messages API, and COMPANION_MANAGED_BASE names Companion's
/// usage server (https only) for managed usage (F22, switched off); neither carries a secret.
const ENV_ALLOWED: &[&str] = &["COMPANION_LANES", "COMPANION_MANAGED_BASE", "COMPANION_ROUTE", "COMPANION_MODEL", "COMPANION_KEYCHAIN_SERVICE", "COMPANION_KEYCHAIN_ACCOUNT", "CLAUDE_CONFIG_DIR", "COMPANION_ASSIST_STUB", "COMPANION_AIM", "COMPANION_AIM_MODEL", "COMPANION_FAST_MODEL", "COMPANION_VISION_MODEL", "COMPANION_REVIEW"];

pub fn allowed_env(dev: &Value) -> BTreeMap<String, String> {
    dev.get("env").and_then(Value::as_object).map(|o| {
        o.iter().filter(|(k, _)| ENV_ALLOWED.contains(&k.as_str())).filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()
    }).unwrap_or_default()
}

#[cfg(test)]
pub fn locations(dev_json: Option<&str>, env: &dyn Fn(&str) -> Option<String>, data: PathBuf) -> Result<Locations, String> { locations_for(dev_json, env, data, None, true) }

/// Where the engine is inside the installed app: `Contents/Resources/engine` holds `bin/bun` and `runner/src/main.ts`
/// (staged by app/scripts/stage-engine.sh). None when not running from an installed app (a development run).
pub fn bundled_engine(exe: &std::path::Path) -> Option<PathBuf> {
    exe.ancestors().find(|a| a.file_name().is_some_and(|n| n == "Contents")).map(|c| c.join("Resources/engine"))
}

/// The developer file first, then the environment, then the engine that came with the app. Only a development build
/// (cfg debug_assertions) looks at the first two.
pub fn locations_with_bundle(dev_json: Option<&str>, env: &dyn Fn(&str) -> Option<String>, data: PathBuf, bundle: Option<PathBuf>) -> Result<Locations, String> {
    locations_for(dev_json, env, data, bundle, cfg!(debug_assertions))
}

/// Where the engine is, for a development build (`developer`) or a release. A release never takes Bun or the runner from
/// dev.json, COMPANION_BUN or COMPANION_RUNNER: the shell hands the engine the person's key from the Keychain, so it runs
/// only the engine sealed inside the app (a file or a variable any program on the Mac could set must not choose it).
pub fn locations_for(dev_json: Option<&str>, env: &dyn Fn(&str) -> Option<String>, data: PathBuf, bundle: Option<PathBuf>, developer: bool) -> Result<Locations, String> {
    let dev: Value = dev_json.and_then(|s| serde_json::from_str(s).ok()).unwrap_or(Value::Null);
    let pick = |key: &str, var: &str| dev.get(key).and_then(Value::as_str).map(str::to_string).or_else(|| env(var));
    let in_bundle = |rel: &str| bundle.as_ref().map(|b| b.join(rel)).filter(|p| p.is_file());
    let (dev_bun, dev_runner) = if developer { (pick("bun", "COMPANION_BUN"), pick("runner", "COMPANION_RUNNER")) } else { (None, None) };
    // Both from the developer's setup or both from the installed app, never a mix of two different engines.
    let (bun, runner) = match (dev_bun, dev_runner) {
        (Some(b), Some(r)) => (PathBuf::from(b), PathBuf::from(r)),
        (Some(_), None) => return Err(concat!(crate::product!(), " cannot find the runner. Run app/scripts/dev-setup.sh").into()),
        (None, Some(_)) => return Err(concat!(crate::product!(), " cannot find Bun. Run app/scripts/dev-setup.sh").into()),
        (None, None) => match (in_bundle("bin/bun"), in_bundle("runner/src/main.ts")) {
            (Some(b), Some(r)) => (b, r),
            _ if bundle.is_some() || !developer => return Err(concat!("Part of ", crate::product!(), " is missing from this copy of the app. Download ", crate::product!(), " again and replace this one.").into()),
            _ => return Err(concat!(crate::product!(), " cannot find Bun. Run app/scripts/dev-setup.sh").into()),
        },
    };
    // The engine's settings come from the developer file only in a development build: a file any program on the Mac could
    // write must not choose the route or the Keychain item of a process that holds the person's key (rule 3).
    Ok(Locations { bun, runner, data, env: if developer { allowed_env(&dev) } else { BTreeMap::new() }, claude: None, developer })
}

/// What the engine is told about Anthropic's Claude at each start.
#[derive(Debug, Clone, PartialEq)]
pub enum ClaudeEnv {
    /// The installed build, checked just now (claude_install::cleared): its path and which file was checked.
    Set(PathBuf, String),
    /// Nothing checked, in a release: a COMPANION_CLAUDE_BIN the app itself was started with is taken away, so the engine
    /// never hands the key to a program the environment named.
    Remove,
    /// Nothing checked, in a development build: the developer's own COMPANION_CLAUDE_BIN, if any, still reaches the engine.
    Leave,
}
pub fn claude_env(developer: bool, cleared: Option<(PathBuf, String)>) -> ClaudeEnv {
    match cleared { Some((p, id)) => ClaudeEnv::Set(p, id), None if developer => ClaudeEnv::Leave, None => ClaudeEnv::Remove }
}

/// The engine's command line and environment for one start. `cleared` is the installed Claude build once its signature
/// was checked for this exact file (claude_install::cleared).
pub fn engine_command(loc: &Locations, cleared: Option<(PathBuf, String)>) -> Command {
    use std::os::unix::process::CommandExt;
    // Its own process group, so that when the engine has to be ended by force, what it started goes with it.
    let mut c = Command::new(&loc.bun);
    c.arg(&loc.runner).process_group(0).env("COMPANION_DATA", &loc.data).envs(&loc.env).env("COMPANION_KEY_SOURCE", "app");
    match claude_env(loc.developer, cleared) {
        ClaudeEnv::Set(p, id) => { c.env("COMPANION_CLAUDE_BIN", p).env("COMPANION_CLAUDE_ID", id); }
        ClaudeEnv::Remove => { c.env_remove("COMPANION_CLAUDE_BIN").env_remove("COMPANION_CLAUDE_ID"); }
        ClaudeEnv::Leave => {}
    }
    c
}

/// What a person reads when the helper that runs Claude cannot start, is not there yet, or does not answer. Plain words;
/// the raw reason goes to the log (take_detail).
pub const HELPER_DOWN: &str = concat!(crate::product!(), " could not start the helper that runs Claude. Press Restart to try again.");
/// M28: what the person reads when the engine keeps stopping; Home offers Restart beside it (Runner::retry).
pub const KEEPS_STOPPING: &str = concat!(crate::product!(), " keeps stopping. Press Restart to try again.");
pub const NOT_READY: &str = concat!(crate::product!(), " is not ready yet. Try again in a moment.");
pub const NOT_ANSWERING: &str = concat!(crate::product!(), " is busy and did not answer. Try again in a moment.");

/// A failure's raw detail (runner/src/plainfail.ts `failure`, or the shell's own), taken off a protocol.error or
/// app.runner_down so no page ever shows it. None for every other event, which keeps its fields.
pub fn take_detail(v: &mut Value) -> Option<String> {
    let t = v.get("type").and_then(Value::as_str)?;
    if t != "protocol.error" && t != "app.runner_down" { return None; }
    let d = v.as_object_mut()?.remove("detail")?;
    Some(match d { Value::String(s) => s, other => other.to_string() })
}
/// The log line for a failure's detail: what failed and the detail, with the home folder written as ~, short.
pub fn detail_line(kind: &str, failed: Option<&str>, detail: &str) -> Value {
    let home = std::env::var("HOME").unwrap_or_default();
    let d = if home.len() > 1 { detail.replace(&home, "~") } else { detail.to_string() };
    serde_json::json!({ "kind": kind, "failed": failed.unwrap_or(""), "detail": d.chars().take(400).collect::<String>() })
}

/// Status messages a page that loads late still needs (who is connected, is the engine up, this month's free fix count).
/// plan.limit is a moment, not a status: a page that loads later never shows an old limit card.
const STICKY: &[&str] = &["runner.hello", "auth.status", "app.runner_down", "app.notice", "plan.usage"];

/// The one launch notice. Every app.notice shares a single sticky slot (remember keeps only the latest), so a page that loads
/// after launch would see only the last one published. The hotkey notice and the note left by a "delete everything" that
/// could not remove all of it are joined here, the hotkey line first, and published once. None when both are empty.
pub fn join_launch_notices(hotkeys: Option<String>, wipe: Option<String>) -> Option<String> {
    let parts: Vec<String> = [hotkeys, wipe].into_iter().flatten().map(|m| m.trim().to_string()).filter(|m| !m.is_empty()).collect();
    if parts.is_empty() { None } else { Some(parts.join("\n\n")) }
}

/// Remember the latest sticky event of each type. Returns true if it was kept.
pub fn remember(map: &mut BTreeMap<String, Value>, v: &Value) -> bool {
    match v.get("type").and_then(Value::as_str) {
        Some(t) if STICKY.contains(&t) => { map.insert(t.to_string(), v.clone()); true }
        _ => false,
    }
}

// ---------- the event log can show an approval ----------
//
// Support must be able to see that a question was asked and how it was answered (the first Mac session: the log held no
// runner events at all). So two plain lines are always written: approval_asked (the kind of risk and the tool) and
// approval_answered (yes, no, expired or stopped). Never the question's words, which can name a setting or a file.

/// Words that may go into the log: letters, digits, underscore, dash, at most `max` of them. Anything else is "unknown".
fn plain_word(s: Option<&str>, max: usize) -> String {
    match s { Some(w) if !w.is_empty() && w.len() <= max && w.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') => w.to_string(), _ => "unknown".into() }
}

/// The log line for an event, if it is one about an approval. `seen` remembers the tool of each call waiting for a yes
/// (its agent.tool event comes just before the approval.request), a few dozen at most.
pub fn approval_line(v: &Value, seen: &mut BTreeMap<String, String>) -> Option<(&'static str, Value)> {
    let get = |k: &str| v.get(k).and_then(Value::as_str);
    match get("type")? {
        "agent.tool" if get("outcome") == Some("needs_approval") => {
            if seen.len() >= 64 { seen.clear(); }
            seen.insert(plain_word(get("toolUseId"), 80), plain_word(get("tool"), 40));
            None
        }
        "approval.request" => {
            let tool = seen.remove(&plain_word(get("toolUseId"), 80)).unwrap_or_else(|| "unknown".into());
            Some(("approval_asked", serde_json::json!({ "approval": plain_word(get("approval"), 40), "risk": plain_word(get("risk"), 30), "tool": tool })))
        }
        "approval.resolved" => {
            let outcome = match get("outcome") { Some("allowed") => "yes", Some("denied") => "no", Some("expired") => "expired", Some("cancelled") => "stopped", _ => "unknown" };
            Some(("approval_answered", serde_json::json!({ "approval": plain_word(get("approval"), 40), "outcome": outcome })))
        }
        _ => None,
    }
}
static APPROVALS_SEEN: Mutex<BTreeMap<String, String>> = Mutex::new(BTreeMap::new());

/// The plan.state line for the engine (protocol/index.ts PlanState): `{v, id, type: "plan.state", plan: "free" | "trial" |
/// "pro", trialEndsAt?, paymentsOn}`. trialEndsAt (an ISO time) only while a trial is the plan, so the engine can end it on
/// time by itself. With paymentsOn false the engine gates nothing, whatever the plan says.
pub fn plan_state_line(d: &crate::license::Decision, payments_on: bool, id: &str) -> Value {
    let mut v = serde_json::json!({ "v": PROTOCOL_VERSION, "id": id, "type": "plan.state", "plan": d.plan.word(), "paymentsOn": payments_on });
    if let Some(t) = d.trial_ends_at { v["trialEndsAt"] = serde_json::json!(crate::license::iso(t)); }
    v
}
/// The last plan.state sent, without its id.
static PLAN_SENT: Mutex<Option<Value>> = Mutex::new(None);
/// Whether `line` says something new compared with the last one sent (ids aside). Remembers it.
pub fn plan_changed(last: &mut Option<Value>, line: &Value) -> bool {
    let mut bare = line.clone();
    if let Some(o) = bare.as_object_mut() { o.remove("id"); }
    if last.as_ref() == Some(&bare) { return false; }
    *last = Some(bare);
    true
}

// ---------- keeping the engine alive ----------
//
// The engine (the runner) is a separate program. It can crash, hang, print garbage or ignore us. None of that may freeze the
// app, lose the Stop key, or leave the cards stuck. So: commands go through a small queue to a writer thread (a full pipe can
// never block anyone), the engine is restarted after a crash with growing pauses, and Stop falls back to killing a hung engine.

use std::io;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Condvar};
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
    /// M28: the person pressed Restart: a supervisor that gave up starts again, and one waiting between tries stops waiting.
    retry: AtomicBool,
    /// Must fix 12: the id of the ping the engine last answered (runner.pong carries it back as `ping`). The Stop key's check
    /// waits for the answer to its own ping, never for just any event: an engine whose command loop ended can still be
    /// sending events from work already under way.
    pong: Mutex<Option<String>>,
    /// Must fix 12: how many event lines a page's handler panicked on. The reader carries on with the next line.
    handler_panics: AtomicU64,
    /// Must fix 33: the supervisor sleeps on this between tries and after giving up; Restart and quitting wake it at once.
    wake: (Mutex<()>, Condvar),
}
/// Each Stop key's ping has its own id (must fix 12), even two in the same millisecond.
static PINGS: AtomicU64 = AtomicU64::new(0);
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> { m.lock().unwrap_or_else(|e| e.into_inner()) }   // one panic must never poison everything after it

impl Shared {
    pub fn new() -> Arc<Shared> { Arc::new(Shared { tx: Mutex::new(None), child: Mutex::new(None), quitting: AtomicBool::new(false), events_read: AtomicU64::new(0), stop_checks: AtomicU64::new(0), forced_stops: AtomicU64::new(0), retry: AtomicBool::new(false), pong: Mutex::new(None), handler_panics: AtomicU64::new(0), wake: (Mutex::new(()), Condvar::new()) }) }
    /// Queue one line for the engine. Never waits: a full queue or a missing engine is an immediate, plain error.
    pub fn send_line(&self, line: String) -> Result<(), String> {
        match lock(&self.tx).as_ref() {
            None => Err(NOT_READY.into()),
            Some(tx) => tx.try_send(line).map_err(|e| match e { TrySendError::Full(_) => NOT_ANSWERING.to_string(), TrySendError::Disconnected(_) => NOT_READY.to_string() }),
        }
    }
    pub fn kill(&self) { if let Some(c) = lock(&self.child).as_mut() { kill_group(c); } }
    /// Restart pressed (M28): noted, and the supervisor woken (must fix 33).
    pub fn ask_retry(&self) { self.retry.store(true, Ordering::SeqCst); self.wake_supervisor(); }
    /// Quitting: noted, and the supervisor woken so it ends now (must fix 33).
    pub fn ask_quit(&self) { self.quitting.store(true, Ordering::SeqCst); self.wake_supervisor(); }
    fn wake_supervisor(&self) { let _g = lock(&self.wake.0); self.wake.1.notify_all(); }
    /// Sleeps until `until` (or for good with None), or until Restart or quitting wakes it. A flag set without a wake is
    /// still seen within a second.
    fn sleep_until(&self, until: Option<Instant>) {
        let mut g = lock(&self.wake.0);
        loop {
            if self.quitting.load(Ordering::SeqCst) || self.retry.load(Ordering::SeqCst) { return; }
            let left = match until { Some(u) => match u.checked_duration_since(Instant::now()) { Some(d) if !d.is_zero() => d, _ => return }, None => Duration::from_secs(1) };
            g = self.wake.1.wait_timeout(g, left.min(Duration::from_secs(1))).map(|(g, _)| g).unwrap_or_else(|e| e.into_inner().0);
        }
    }
}

impl Runner {
    /// Starts the engine again (its supervisor brings it back at once), so a new start picks up what changed, such as
    /// Claude installed at first run.
    pub fn restart(&self) { self.shared.kill(); }
    /// M28: Restart pressed: the engine is started again now, even after its supervisor gave up.
    pub fn retry(&self) { self.shared.ask_retry(); self.shared.kill(); }
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
                Err(e) => emit(serde_json::json!({ "v": 1, "id": "app-down", "type": "app.runner_down", "reason": HELPER_DOWN, "detail": format!("could not start the engine: {e}") })),
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
                                    if let Some(p) = pong_of(&v) { *lock(&shared.pong) = Some(p); }
                                    // Must fix 12: a panic in a feature's handler (the hooks publish calls) never ends this
                                    // reader, and with it the supervision of the engine and Stop: that line is dropped, the
                                    // next one is read.
                                    let handled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                        on_type(v.get("type").and_then(Value::as_str).unwrap_or("?"));   // the type only, never the content
                                        emit(v);
                                    }));
                                    if handled.is_err() { shared.handler_panics.fetch_add(1, Ordering::SeqCst); }
                                }
                            }
                        }
                    }
                    *lock(&shared.tx) = None;                  // ends the writer thread
                    let status = lock(&shared.child).take().and_then(|mut c| { kill_group(&mut c); c.wait().ok() });   // never leave a zombie behind
                    // Must fix 15: how it ended (its exit code or the signal that ended it, how long it ran, how many starts so
                    // far), for the log only (Runner::publish takes it off before any page sees the event).
                    let exit = exit_facts(status, started.elapsed(), starts, shared.quitting.load(Ordering::SeqCst));
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| emit(serde_json::json!({ "v": 1, "id": "app-down", "type": "app.runner_down", "exit": exit }))));
                }
            }
            if shared.quitting.load(Ordering::SeqCst) { return; }
            failures = if started.elapsed() >= t.healthy { 0 } else { failures + 1 };
            let Some(wait) = backoff(failures.max(1), &t).filter(|_| failures < t.give_up_after) else {
                emit(serde_json::json!({ "v": 1, "id": "app-down", "type": "app.runner_down", "reason": KEEPS_STOPPING }));
                // Given up: nothing more is tried until the person presses Restart (or the app quits).
                shared.retry.store(false, Ordering::SeqCst);
                while !shared.retry.load(Ordering::SeqCst) {
                    if shared.quitting.load(Ordering::SeqCst) { return; }
                    shared.sleep_until(None);   // must fix 33: no timer; Restart or quitting wakes it
                }
                shared.retry.store(false, Ordering::SeqCst);
                failures = 0;
                continue;
            };
            shared.sleep_until(Some(Instant::now() + wait));
            shared.retry.store(false, Ordering::SeqCst);
        }
    })
}

/// Must fix 12: the ping a runner.pong answers (the engine echoes the ping's id as `ping`).
fn pong_of(v: &Value) -> Option<String> {
    if v.get("type").and_then(Value::as_str) != Some("runner.pong") { return None; }
    v.get("ping").and_then(Value::as_str).map(str::to_string)
}
/// Must fix 15: how one run of the engine ended, for the log (`runner_exit`): its exit code, or the signal that ended it,
/// how long it ran, how many times it has been started, and whether the app was quitting.
pub fn exit_facts(status: Option<std::process::ExitStatus>, ran: Duration, starts: u32, quitting: bool) -> Value {
    use std::os::unix::process::ExitStatusExt;
    serde_json::json!({ "code": status.and_then(|s| s.code()), "signal": status.and_then(|s| s.signal()), "uptime_ms": ran.as_millis() as u64, "starts": starts, "quitting": quitting })
}
/// Must fix 15: the exit facts are taken off app.runner_down before any page sees it (or a late page replays it).
pub fn take_exit(v: &mut Value) -> Option<Value> {
    if v.get("type").and_then(Value::as_str) != Some("app.runner_down") { return None; }
    v.as_object_mut()?.remove("exit")
}

/// Must fix 15: the engine's own error output, kept in a small file only the person can read (engine.log, 0600), each line
/// cut short and scrubbed as the support log is (keys, tokens, emails, the home folder, the user name). It never grows
/// without limit (one old copy is kept). Nothing in it is sent anywhere.
pub const ENGINE_LOG_MAX: u64 = 256 * 1024;
pub fn engine_log_line(raw: &str, home: &str, user: &str, at_secs: u64) -> String {
    let cut: String = raw.trim_end().chars().take(1000).collect();
    let names: Vec<String> = if user.is_empty() { vec![] } else { vec![user.to_string()] };
    format!("{at_secs} {}", crate::logexport::scrub(&cut, home, &names, &[]))
}
fn keep_engine_stderr(err: std::process::ChildStderr, path: PathBuf) {
    std::thread::spawn(move || {
        use std::io::BufRead;
        let home = std::env::var("HOME").unwrap_or_default();
        let user = std::env::var("USER").unwrap_or_default();
        for line in std::io::BufReader::new(err).split(b'\n') {
            let Ok(bytes) = line else { break };
            let text = String::from_utf8_lossy(&bytes);
            if text.trim().is_empty() { continue; }
            let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            crate::logfile::append_line(&path, &engine_log_line(&text, &home, &user, at), ENGINE_LOG_MAX);
        }
    });
}

pub struct Runner { shared: Arc<Shared>, sticky: Mutex<BTreeMap<String, Value>>, timing: Timing }
impl Runner {
    pub fn new() -> Self { Self { shared: Shared::new(), sticky: Mutex::new(BTreeMap::new()), timing: Timing::default() } }
    #[cfg(test)]
    pub fn with_shared(shared: Arc<Shared>, timing: Timing) -> Self { Self { shared, sticky: Mutex::new(BTreeMap::new()), timing } }

    /// What to replay to a page that has just loaded, oldest meaning first.
    pub fn replay(&self) -> Vec<Value> { lock(&self.sticky).values().cloned().collect() }

    /// Tell every page, and remember it for pages that load later.
    pub fn publish(app: &AppHandle, mut v: Value) {
        // A failure's raw detail is for the log only: taken off before any page sees the event (or a late page replays it).
        if let Some(d) = take_detail(&mut v) { crate::log("failure_detail", detail_line(v["type"].as_str().unwrap_or(""), v.get("failed").and_then(Value::as_str), &d)); }
        if let Some(x) = take_exit(&mut v) { crate::log("runner_exit", x); }   // must fix 15: every time the engine ends
        // 5 Nov 2026: the supervisor gave up after the engine stopped again and again (it waits for Restart).
        if v.get("type").and_then(Value::as_str) == Some("app.runner_down") && v.get("reason").and_then(Value::as_str) == Some(KEEPS_STOPPING) { crate::log("engine_gave_up", serde_json::json!({})); }
        remember(&mut lock(&app.state::<Runner>().sticky), &v);
        crate::voicewords::note_report(&v);   // a project check's setting names, for hold to talk (names only)
        crate::updates::note_running(&v);     // what runs now, so an update never restarts under a task (ids only)
        if let Some((ev, extra)) = approval_line(&v, &mut lock(&APPROVALS_SEEN)) { crate::log(ev, extra); }   // asked and answered, never the words
        crate::peek_heard(app, &v);           // the character peeks, stays in view, or comes in for a light (peek.rs; type, state and ids only)
        crate::review_heard(app, &v);         // M52: changes ready to review, a quiet dot on the notch (island.rs ReviewReady; ids and counts only)
        let _ = app.emit("runner-event", v);
    }

    /// Start the engine and keep it running. Each event line goes to the pages as "runner-event". `first_line` is what the
    /// engine reads first after every start (the settings).
    pub fn start(&self, app: &AppHandle, loc: &Locations, on_type: impl Fn(&str) + Send + Sync + 'static, first_line: impl Fn() -> Option<String> + Send + Sync + 'static) -> Result<(), String> {
        std::fs::create_dir_all(&loc.data).map_err(|e| e.to_string())?;
        let loc = loc.clone();
        let engine: Arc<dyn Fn() -> io::Result<Child> + Send + Sync> = Arc::new(move || {
            // Anthropic's Claude is checked again at every start, not only when it was installed (once per change of the
            // file, claude_install::cleared): a file that is no longer Anthropic's signed build is never handed the key.
            let installed = loc.claude.as_ref().filter(|p| p.is_file());
            let cleared = installed.and_then(|p| crate::claude_install::cleared(p).map(|id| (p.clone(), id)));
            if installed.is_some() && cleared.is_none() { crate::log("failure_detail", detail_line("claude.check", None, "the installed Claude build did not pass its signature check at this start, so it was not used")); }
            // Must fix 15: its error output goes to engine.log (scrubbed, capped, owner only), never to nowhere.
            let mut child = engine_command(&loc, cleared).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
            if let Some(err) = child.stderr.take() { keep_engine_stderr(err, loc.data.join("engine.log")); }
            Ok(child)
        });
        // Must fix 33: even the first start is the supervisor's, on its own thread: it checks Claude's signature with
        // codesign (about 0.65 s), which must never hold the app's setup on the main thread. An engine that cannot be
        // started at all is reported by the supervisor (app.runner_down with HELPER_DOWN), and logged here.
        let spawn: Arc<dyn Fn() -> io::Result<Child> + Send + Sync> = Arc::new(move || engine().inspect_err(|e| crate::log("failure_detail", detail_line("app.runner_down", None, &format!("could not start the runner: {e}")))));
        let a = app.clone();
        let emit: Arc<dyn Fn(Value) + Send + Sync> = Arc::new(move |v| Runner::publish(&a, v));
        supervise_first(self.shared.clone(), spawn, emit, Arc::new(on_type), Arc::new(first_line), self.timing);
        Ok(())
    }

    /// Write one command line to the engine. Never waits.
    pub fn send(&self, cmd: &Value) -> Result<(), String> { self.shared.send_line(cmd.to_string()) }
    /// Write one line the shell made itself (the settings, settings.rs `apply_line`), exactly as it is. Never waits.
    pub fn send_line(&self, line: String) -> Result<(), String> { self.shared.send_line(line) }

    /// Tells the engine the plan (plan.state, payments spec section 9): when it says hello (`force`, it knows nothing yet)
    /// and whenever the plan changes. A line equal to the last one sent (apart from its id) is not sent again. Only the
    /// shell sends it; a page cannot (it is not in ALLOWED). It never carries the license key.
    pub fn push_plan(&self, line: Value, force: bool) -> Result<(), String> {
        if !plan_changed(&mut lock(&PLAN_SENT), &line) && !force { return Ok(()); }
        self.send(&line)
    }

    /// Hands the engine the key, or tells it there is none (after the key was removed). The line goes out exactly as
    /// `handoff_line` wrote it: the engine takes it only when it starts `{"v":1,"type":"auth.key"`, and turning it into a
    /// JSON value first would sort its fields ("key" first), so the engine would refuse it and stay without a key.
    pub fn hand_key(&self, key: Option<&str>, fresh: bool) -> Result<(), String> { self.shared.send_line(crate::keystore::handoff_line(key, fresh)) }

    /// The Stop key. It must work even when the engine is stuck, so if the stop cannot be delivered, or the engine does not
    /// answer a moment later, the engine is stopped by force and started again.
    /// The check runs on a thread of its own, so the Stop key never waits for it, and ends as soon as the engine answers.
    pub fn stop_everything(&self, reason: &str) -> Result<(), String> {
        let read_before = self.shared.events_read.load(Ordering::SeqCst);
        let r = self.send(&serde_json::json!({ "v": 1, "id": format!("kill-{}", std::process::id()), "type": "agent.interruptAll", "reason": reason }));
        if r.is_err() { self.shared.kill(); return r; }
        // Must fix 12: only the answer to this very ping counts. Any event read after the Stop could come from work already
        // under way in an engine whose command loop has ended, which would never stop anything.
        let ping = format!("ping-{}-{}", now_ms(), PINGS.fetch_add(1, Ordering::SeqCst));
        let _ = self.send(&serde_json::json!({ "v": 1, "id": ping, "type": "runner.ping" }));   // a healthy engine always answers this
        let (shared, wait) = (self.shared.clone(), self.timing.heartbeat);
        std::thread::spawn(move || {
            let until = Instant::now() + wait;
            let answered = || shared.events_read.load(Ordering::SeqCst) > read_before && lock(&shared.pong).as_deref() == Some(ping.as_str());
            while !answered() && Instant::now() < until && !shared.quitting.load(Ordering::SeqCst) { std::thread::sleep(Duration::from_millis(20).min(wait)); }
            if !answered() && !shared.quitting.load(Ordering::SeqCst) { shared.forced_stops.fetch_add(1, Ordering::SeqCst); shared.kill(); }
            shared.stop_checks.fetch_add(1, Ordering::SeqCst);
        });
        Ok(())
    }

    /// Quitting. Close the pipe so the engine can finish, wait a moment, then force it.
    pub fn shut_down(&self) {
        self.shared.ask_quit();
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
    fn a_failures_raw_detail_goes_to_the_log_and_never_to_a_page() {
        let mut e = json!({ "v": 1, "type": "protocol.error", "reason": "Something went wrong.", "detail": "git add -A failed: fatal", "failed": "agent.start" });
        assert_eq!(take_detail(&mut e).as_deref(), Some("git add -A failed: fatal"));
        assert!(e.get("detail").is_none() && e["reason"] == "Something went wrong." && e["failed"] == "agent.start");
        let mut down = json!({ "type": "app.runner_down", "reason": HELPER_DOWN, "detail": "No such file" });
        assert_eq!(take_detail(&mut down).as_deref(), Some("No such file"));
        // Every other event keeps its detail (a proof step's output, an install's progress).
        let mut step = json!({ "type": "proof.step", "detail": "build failed" });
        assert_eq!(take_detail(&mut step), None);
        assert_eq!(step["detail"], "build failed");
        let home = std::env::var("HOME").unwrap_or_default();
        let line = detail_line("protocol.error", Some("agent.start"), &format!("{home}/x failed {}", "y".repeat(600)));
        let d = line["detail"].as_str().unwrap();
        assert!(d.starts_with("~/x failed") && d.chars().count() == 400, "{d}");
        assert!(crate::logfile::should_log("failure_detail", false));
        // The plain words: the product's name, never "engine", never the raw error.
        for w in [HELPER_DOWN, NOT_READY, NOT_ANSWERING] { assert!(w.starts_with(crate::product!()) && !w.to_lowercase().contains("engine"), "{w}"); }
        let publish = { let a = include_str!("runner.rs"); let at = a.find("pub fn publish(").unwrap(); a[at..at + a[at..].find("\n    }\n").unwrap()].to_string() };
        assert!(publish.find("take_detail(&mut v)").unwrap() < publish.find("remember(").unwrap(), "{publish}");
    }
    #[test]
    fn install_inspect_and_find_may_only_name_the_chosen_project() {
        let c = |t: &str, p: &str| json!({ "v": 1, "id": "x", "type": t, "project": p });
        assert!(check_project(&c("project.install", "/Users/me/site"), "/Users/me/site").is_ok());
        assert!(check_project(&c("project.install", "/Users/me/other"), "/Users/me/site").is_err());
        assert!(check_project(&c("problem.find", "/"), "/Users/me/site").is_err());
        assert!(check_project(&c("project.inspect", "/Users/me/site"), "").is_err());
        // Every command that works on a project is held to the chosen folder (found by the 15 Oct 2026 review).
        for t in ["agent.start", "drive.plan", "rescue.diagnose", "research.ask", "ship.check", "ship.preview", "ship.live", "ship.rollback", "checkpoint.restore", "checkpoint.putBack", "tasks.list", "recap.ask", "explain.set", "memory.list", "memory.erase", "memory.add", "watch.add", "watch.list", "watch.remove", "watch.pause", "watch.check", "watch.fix", "where.was.i"] {
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

    // ---------- the event log can show an approval was asked and answered (finding I) ----------

    fn tool_event(id: &str, tool: &str) -> Value { json!({ "v": 1, "type": "agent.tool", "agent": "builder-1", "tool": tool, "summary": "git push origin main", "toolUseId": id, "undoable": false, "outcome": "needs_approval" }) }
    fn asked(id: &str, tool_use: &str, risk: &str) -> Value { json!({ "v": 1, "type": "approval.request", "approval": id, "agent": "builder-1", "checkpoint": "cp_0001", "toolUseId": tool_use, "risk": risk, "title": "pushes your work to GitHub: SECRET_NAME", "expiresAt": "2026-10-26T12:00:00Z" }) }
    fn answered(id: &str, outcome: &str) -> Value { json!({ "v": 1, "type": "approval.resolved", "approval": id, "agent": "builder-1", "outcome": outcome }) }

    #[test]
    fn an_approval_asked_is_logged_with_its_kind_and_tool_and_nothing_it_said() {
        let mut seen = BTreeMap::new();
        assert!(approval_line(&tool_event("toolu_1", "Bash"), &mut seen).is_none());
        let (ev, extra) = approval_line(&asked("ap_1", "toolu_1", "git"), &mut seen).expect("a line");
        assert_eq!(ev, "approval_asked");
        assert_eq!(extra, json!({ "approval": "ap_1", "risk": "git", "tool": "Bash" }));
        let text = extra.to_string();
        for leaked in ["push", "GitHub", "SECRET_NAME", "origin"] { assert!(!text.contains(leaked), "{leaked}"); }
    }
    #[test]
    fn an_answer_is_logged_as_yes_no_expired_or_stopped() {
        let mut seen = BTreeMap::new();
        for (outcome, word) in [("allowed", "yes"), ("denied", "no"), ("expired", "expired"), ("cancelled", "stopped"), ("surprise", "unknown")] {
            let (ev, extra) = approval_line(&answered("ap_1", outcome), &mut seen).expect("a line");
            assert_eq!(ev, "approval_answered");
            assert_eq!(extra, json!({ "approval": "ap_1", "outcome": word }));
        }
    }
    #[test]
    fn a_question_whose_tool_was_not_seen_still_logs_and_odd_words_never_reach_the_log() {
        let mut seen = BTreeMap::new();
        let (_, extra) = approval_line(&asked("ap_2", "toolu_none", "network"), &mut seen).unwrap();
        assert_eq!(extra["tool"], "unknown");
        let _ = approval_line(&tool_event("toolu_3", "Bash; rm -rf ~ and a very long made up name that goes on and on"), &mut seen);
        let (_, extra) = approval_line(&asked("ap_3", "toolu_3", "irreversible\nmore"), &mut seen).unwrap();
        assert_eq!(extra["tool"], "unknown");
        assert_eq!(extra["risk"], "unknown");
        let (_, extra) = approval_line(&answered("ap 4/../x", "allowed"), &mut seen).unwrap();
        assert_eq!(extra["approval"], "unknown");
    }
    #[test]
    fn other_events_are_not_logged_and_the_memory_of_tools_stays_small() {
        let mut seen = BTreeMap::new();
        for t in ["cost.update", "receipt", "agent.state", "plan.ready", "proof.step"] { assert!(approval_line(&json!({ "type": t }), &mut seen).is_none(), "{t}"); }
        let mut running = tool_event("x", "Read"); running["outcome"] = json!("ran");
        assert!(approval_line(&running, &mut seen).is_none());
        assert!(seen.is_empty(), "a tool that needed no approval is not remembered");
        for i in 0..500 { let _ = approval_line(&tool_event(&format!("toolu_{i}"), "Bash"), &mut seen); }
        assert!(seen.len() <= 64);
    }


    #[test]
    fn allows_the_commands_pages_need() {
        for t in ["agent.start", "agent.interruptAll", "approval.resolve", "checkpoint.restore", "tasks.list", "drive.plan", "drive.approve", "loop.choose", "drive.pause", "drive.resume", "rescue.diagnose", "research.ask", "ship.check", "spending.show", "memory.list", "metrics.show"] {
            assert!(check_command(&json!({"v":1,"id":"c","type":t})).is_ok(), "{t}");
        }
    }
    #[test]
    fn the_plan_reaches_the_engine_only_from_the_shell_and_never_carries_the_key() {
        // A page could otherwise tell the engine it has Pro.
        assert!(check_command(&json!({"v":1,"id":"c","type":"plan.state","plan":"pro","paymentsOn":true})).is_err());
        assert!(!ALLOWED.contains(&"plan.state"));
        use crate::license::{Decision, Plan, State};
        let pro = plan_state_line(&Decision { plan: Plan::Pro, state: State::Pro, trial_ends_at: None }, true, "plan-1");
        assert_eq!(pro, json!({ "v": 1, "id": "plan-1", "type": "plan.state", "plan": "pro", "paymentsOn": true }));
        let trial = plan_state_line(&Decision { plan: Plan::Trial, state: State::Trial, trial_ends_at: Some(1_209_600) }, true, "plan-2");
        assert_eq!(trial["trialEndsAt"], "1970-01-15T00:00:00Z");
        let off = plan_state_line(&Decision { plan: Plan::Free, state: State::Off, trial_ends_at: None }, false, "plan-3");
        assert_eq!((off["plan"].as_str(), off["paymentsOn"].as_bool()), (Some("free"), Some(false)));
        for line in [&pro, &trial, &off] {
            let keys: Vec<&str> = line.as_object().unwrap().keys().map(|k| k.as_str()).collect();
            assert!(keys.iter().all(|k| ["v", "id", "type", "plan", "trialEndsAt", "paymentsOn"].contains(k)), "{keys:?}");
        }
    }
    #[test]
    fn the_same_plan_is_not_sent_twice_but_a_change_is() {
        use crate::license::{Decision, Plan, State};
        let mut last = None;
        let a = plan_state_line(&Decision { plan: Plan::Free, state: State::Free, trial_ends_at: None }, true, "p1");
        assert!(plan_changed(&mut last, &a));
        assert!(!plan_changed(&mut last, &plan_state_line(&Decision { plan: Plan::Free, state: State::ProOffline, trial_ends_at: None }, true, "p2")), "the same plan under a new id");
        assert!(plan_changed(&mut last, &plan_state_line(&Decision { plan: Plan::Pro, state: State::Pro, trial_ends_at: None }, true, "p3")));
        assert!(plan_changed(&mut last, &plan_state_line(&Decision { plan: Plan::Pro, state: State::Pro, trial_ends_at: None }, false, "p4")), "payments switched");
        // The engine is told the plan every time it says hello.
        let main = include_str!("main.rs");
        assert!(main.contains("if t == \"runner.hello\" { hand_key_over(&handle, None); google_push(&handle); plan_push(&handle, true); }"));
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
    fn a_page_can_never_send_a_prompt_a_picture_or_a_question_about_the_screen() {
        // Only the shell sends these (Prompt help after its hotkey, Show me after its light), straight to the engine. From a
        // page, assist.prompt could name any folder for its project details, and assist.image could hand in any picture for
        // a vision question outside a Show me press (rule 5).
        for t in ["assist.prompt", "assist.locate", "assist.image", "assist.cancel"] {
            let c = json!({ "v": 1, "id": "x", "type": t, "req": "r", "app": "a", "target": "other", "text": "hi", "style": "full", "project": "/Users/me/other-private-repo" });
            assert!(check_command(&c).is_err(), "{t}");
            assert!(!ALLOWED.contains(&t), "{t}");
        }
    }
    #[test]
    fn a_page_can_never_send_text_to_be_explained_as_if_it_was_read_from_another_app() {
        // Only the hotkey flow (errhelp.rs) sends error.explain, straight to the engine, after the light and the read rules.
        assert!(check_command(&json!({ "v": 1, "id": "x", "type": "error.explain", "req": "r", "app": "a", "text": "t" })).is_err());
        // The same for Second Look: only its hotkey flow (seclook.rs) sends secondlook.check, after the light and the read rules.
        assert!(check_command(&json!({ "v": 1, "id": "x", "type": "secondlook.check", "req": "r", "app": "a", "text": "t" })).is_err());
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
            if t == "error.explain" || t == "secondlook.check" { assert!(check_command(&v).is_err(), "{line}"); }
        }
        assert_eq!(seen, 2);
    }
    #[test]
    fn a_review_of_changes_may_be_asked_for_by_a_page_but_only_for_the_chosen_project() {
        // protocol/fixtures is read by the runner's suite too (runner/test/protocol.test.ts): the same review commands pass
        // both sides' checks, and here they may only name the folder the person chose.
        let fixtures = include_str!("../../../protocol/fixtures/commands.jsonl");
        let mut seen = Vec::new();
        for line in fixtures.lines().filter(|l| !l.trim().is_empty()) {
            let v: Value = serde_json::from_str(line).expect("a fixture is JSON");
            let t = v["type"].as_str().unwrap_or("").to_string();
            if !t.starts_with("review.") { continue; }
            assert!(check_command(&v).is_ok(), "{line}");
            let project = v["project"].as_str().expect("a review command names its project");
            assert!(check_project(&v, project).is_ok(), "{line}");
            assert!(check_project(&v, "/somewhere/else").is_err(), "{line}");
            assert!(check_project(&v, "").is_err(), "{line} before a folder is chosen");
            assert!(check_project(&json!({ "v": 1, "id": "x", "type": t, "project": NO_PROJECT }), "").is_err(), "{t} must not take the stand in");
            seen.push(t);
        }
        seen.sort(); seen.dedup();
        assert_eq!(seen, ["review.dismiss", "review.fix", "review.now"]);
    }
    #[test]
    fn the_review_events_in_the_shared_fixtures_are_whole_lines_the_shell_can_route() {
        // What the engine says about a review (runner/src/review/service.ts): every one names its project, so the shell can
        // tell which folder it is about, and none carries anything the page may not see (no detail for the log).
        let events = include_str!("../../../protocol/fixtures/events.jsonl");
        let mut kinds = Vec::new();
        for line in events.lines().filter(|l| !l.trim().is_empty()) {
            let v: Value = serde_json::from_str(line).expect("an event fixture is JSON");
            let t = v["type"].as_str().unwrap_or("");
            if !t.starts_with("review.") { continue; }
            assert_eq!(v["v"].as_i64(), Some(PROTOCOL_VERSION), "{line}");
            assert!(v["project"].as_str().map_or(false, |p| !p.is_empty()), "{line}");
            assert!(v.get("detail").is_none(), "{line}");
            if t == "review.result" && v["ok"] == json!(true) {
                assert!(["safe", "worth_a_look", "stop"].contains(&v["rating"].as_str().unwrap_or("")), "{line}");
                assert!(v["sendBack"].as_str().map_or(false, |s| !s.is_empty()), "{line}");
            }
            kinds.push(t.to_string());
        }
        kinds.sort(); kinds.dedup();
        // M57: review.recheck says which reasons of an earlier review no longer hold after a newer change.
        assert_eq!(kinds, ["review.batch", "review.recheck", "review.result", "review.started"]);
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
        // The direct lanes and managed usage can be switched on from the developer file; a key never can.
        let d = allowed_env(&json!({"env": {"COMPANION_LANES": "direct", "COMPANION_MANAGED_BASE": "https://usage.example.com", "ANTHROPIC_API_KEY": "sk-x"}}));
        assert_eq!(d.get("COMPANION_LANES").map(String::as_str), Some("direct"));
        assert_eq!(d.get("COMPANION_MANAGED_BASE").map(String::as_str), Some("https://usage.example.com"));
        assert!(d.get("ANTHROPIC_API_KEY").is_none());
    }
    #[test]
    fn an_installed_app_uses_the_engine_that_came_with_it_and_the_developer_file_still_wins() {
        let root = std::env::temp_dir().join(format!("companion-engine-{}", std::process::id())); let _ = std::fs::remove_dir_all(&root);
        let eng = root.join(concat!(crate::product!(), ".app/Contents/Resources/engine"));
        std::fs::create_dir_all(eng.join("bin")).unwrap(); std::fs::create_dir_all(eng.join("runner/src")).unwrap();
        std::fs::write(eng.join("bin/bun"), "x").unwrap(); std::fs::write(eng.join("runner/src/main.ts"), "x").unwrap();
        let none = |_: &str| None;
        let l = locations_with_bundle(None, &none, "/d".into(), Some(eng.clone())).unwrap();
        assert_eq!((l.bun, l.runner), (eng.join("bin/bun"), eng.join("runner/src/main.ts")));
        let l = locations_with_bundle(Some(r#"{"bun":"/dev/bun","runner":"/dev/r"}"#), &none, "/d".into(), Some(eng.clone())).unwrap();
        assert_eq!((l.bun, l.runner), (PathBuf::from("/dev/bun"), PathBuf::from("/dev/r")));
        // the app's own executable leads to the engine folder
        assert_eq!(bundled_engine(&root.join(concat!(crate::product!(), ".app/Contents/MacOS/companion-app"))), Some(root.join(concat!(crate::product!(), ".app/Contents/Resources/engine"))));
        assert_eq!(bundled_engine(std::path::Path::new("/repo/app/src-tauri/target/debug/companion-app")), None);
        std::fs::remove_file(eng.join("bin/bun")).unwrap();
        let e = locations_with_bundle(None, &none, "/d".into(), Some(eng)).unwrap_err();
        assert!(e.contains("missing from this copy") && e.ends_with('.'));
        let _ = std::fs::remove_dir_all(&root);
    }
    #[test]
    fn a_release_never_takes_the_engine_from_the_developer_file_or_the_environment() {
        let root = std::env::temp_dir().join(format!("companion-release-{}", std::process::id())); let _ = std::fs::remove_dir_all(&root);
        let eng = root.join(concat!(crate::product!(), ".app/Contents/Resources/engine"));
        std::fs::create_dir_all(eng.join("bin")).unwrap(); std::fs::create_dir_all(eng.join("runner/src")).unwrap();
        std::fs::write(eng.join("bin/bun"), "x").unwrap(); std::fs::write(eng.join("runner/src/main.ts"), "x").unwrap();
        let env = |k: &str| match k { "COMPANION_BUN" => Some("/env/bun".into()), "COMPANION_RUNNER" => Some("/env/main.ts".into()), _ => None };
        let dev = r#"{"bun":"/dev/bun","runner":"/dev/r","env":{"COMPANION_ROUTE":"plan"}}"#;
        // A release: the engine sealed in the app, whatever dev.json or the environment say.
        let l = locations_for(Some(dev), &env, "/d".into(), Some(eng.clone()), false).unwrap();
        assert_eq!((l.bun.clone(), l.runner.clone()), (eng.join("bin/bun"), eng.join("runner/src/main.ts")));
        assert!(!l.developer);
        assert!(l.env.is_empty(), "a release takes no engine settings from dev.json: {:?}", l.env);
        let l = locations_for(Some(r#"{"bun":"/dev/bun"}"#), &env, "/d".into(), Some(eng.clone()), false).unwrap();
        assert_eq!(l.bun, eng.join("bin/bun"), "half a developer setup changes nothing either");
        // A release with no engine of its own never falls back to one named elsewhere.
        let e = locations_for(Some(dev), &env, "/d".into(), None, false).unwrap_err();
        assert!(!e.is_empty());
        // A development build keeps working exactly as before: dev.json, then the environment.
        let l = locations_for(Some(dev), &env, "/d".into(), Some(eng.clone()), true).unwrap();
        assert_eq!((l.bun, l.runner), (PathBuf::from("/dev/bun"), PathBuf::from("/dev/r")));
        let l = locations_for(None, &env, "/d".into(), Some(eng.clone()), true).unwrap();
        assert_eq!((l.bun, l.runner), (PathBuf::from("/env/bun"), PathBuf::from("/env/main.ts")));
        assert!(l.developer);
        // The build this test runs in is a development one, and the app's own entry point follows it.
        assert_eq!(locations_with_bundle(Some(dev), &env, "/d".into(), Some(eng.clone())).unwrap().developer, cfg!(debug_assertions));
        let _ = std::fs::remove_dir_all(&root);
    }
    #[test]
    fn a_release_takes_away_an_inherited_claude_path_and_only_a_checked_build_is_passed() {
        let checked = Some((PathBuf::from("/data/claude/1/claude"), "1:2:3".to_string()));
        assert_eq!(claude_env(false, None), ClaudeEnv::Remove);
        assert_eq!(claude_env(true, None), ClaudeEnv::Leave);
        assert_eq!(claude_env(false, checked.clone()), ClaudeEnv::Set(PathBuf::from("/data/claude/1/claude"), "1:2:3".into()));
        assert_eq!(claude_env(true, checked.clone()), ClaudeEnv::Set(PathBuf::from("/data/claude/1/claude"), "1:2:3".into()));
        let env_of = |developer: bool, cleared: Option<(PathBuf, String)>| -> BTreeMap<String, Option<String>> {
            let loc = Locations { bun: "/b".into(), runner: "/r".into(), data: "/d".into(), env: BTreeMap::new(), claude: None, developer };
            engine_command(&loc, cleared).get_envs().map(|(k, v)| (k.to_string_lossy().into_owned(), v.map(|v| v.to_string_lossy().into_owned()))).collect()
        };
        let r = env_of(false, None);
        assert_eq!(r.get("COMPANION_CLAUDE_BIN"), Some(&None), "removed, not inherited: {r:?}");
        assert_eq!(r.get("COMPANION_CLAUDE_ID"), Some(&None));
        assert!(!env_of(true, None).contains_key("COMPANION_CLAUDE_BIN"), "a development build leaves the developer's own");
        let s = env_of(false, checked);
        assert_eq!(s.get("COMPANION_CLAUDE_BIN"), Some(&Some("/data/claude/1/claude".to_string())));
        assert_eq!(s.get("COMPANION_CLAUDE_ID"), Some(&Some("1:2:3".to_string())));
        assert_eq!(s.get("COMPANION_KEY_SOURCE"), Some(&Some("app".to_string())));
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
    fn two_launch_notices_become_one_so_the_second_never_replaces_the_first() {
        let hot = Some("Stop everything is taken by another app. It is still in the menu bar icon.".to_string());
        let wipe = Some("Some files could not be removed.\n".to_string());
        assert_eq!(join_launch_notices(hot.clone(), None), hot);
        assert_eq!(join_launch_notices(None, wipe.clone()), Some("Some files could not be removed.".to_string()));
        let both = join_launch_notices(hot.clone(), wipe).unwrap();
        assert!(both.starts_with(hot.as_deref().unwrap()) && both.ends_with("could not be removed."), "{both}");
        assert_eq!(join_launch_notices(None, None), None);
        assert_eq!(join_launch_notices(Some("  ".into()), Some("".into())), None);
        // Published as two events they would collapse into the later one; as one event nothing is lost.
        let mut m = BTreeMap::new();
        assert!(remember(&mut m, &json!({"type": "app.notice", "message": both})));
        assert!(m["app.notice"]["message"].as_str().unwrap().contains("menu bar icon"));
    }
    #[test]
    fn a_page_that_loads_late_gets_the_status_it_missed() {
        let mut m = BTreeMap::new();
        assert!(remember(&mut m, &json!({"type":"runner.hello","sdk":"1"})));
        assert!(remember(&mut m, &json!({"type":"auth.status","method":"none"})));
        assert_eq!(m.len(), 2);
    }
    #[test]
    fn the_shell_and_the_engine_agree_on_the_plan_lines() {
        // protocol/fixtures/plan-cases.jsonl is run by runner/test/plan.test.ts too: the plan.state lines the shell makes are
        // exactly the ones the engine accepts, and the engine's plan.usage and plan.limit reach the pages as they were sent.
        use crate::license::{Decision, Plan, State};
        let cases: Vec<Value> = include_str!("../../../protocol/fixtures/plan-cases.jsonl").lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str(l).expect("a case is JSON")).collect();
        let bare = |v: &Value| { let mut v = v.clone(); v.as_object_mut().unwrap().remove("id"); v };
        let (mut made, mut events) = (0, 0);
        for c in &cases {
            let line = &c["line"];
            let ok = c["ok"].as_bool().unwrap();
            match c["kind"].as_str().unwrap() {
                "command" => {
                    assert!(check_command(line).is_err(), "a page may never send the plan: {line}");
                    if let Some(from) = c.get("from") {
                        assert!(ok, "{c}");
                        let plan = match from["plan"].as_str().unwrap() { "pro" => Plan::Pro, "trial" => Plan::Trial, _ => Plan::Free };
                        let d = Decision { plan, state: State::Free, trial_ends_at: from.get("trialEndsAtSecs").and_then(Value::as_u64) };
                        let ours = plan_state_line(&d, from["paymentsOn"].as_bool().unwrap(), line["id"].as_str().unwrap());
                        assert_eq!(bare(&ours), bare(line), "{}", c["case"]);
                        assert_eq!(ours["id"], line["id"]);
                        made += 1;
                    } else { assert!(!ok, "{c}"); }
                }
                "event" if ok => {
                    let mut v = line.clone();
                    assert!(take_detail(&mut v).is_none() && &v == line, "nothing is taken off: {line}");
                    let mut m = BTreeMap::new();
                    assert_eq!(remember(&mut m, line), line["type"] == "plan.usage", "only the count is kept for a late page: {line}");
                    events += 1;
                }
                _ => {}
            }
        }
        assert!(made >= 4 && events >= 4, "{made} {events}");
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
        // The engine takes the key only from a line that starts exactly like this (runner/src/pump.ts, which the engine's
        // loop in main.ts runs every line through). Any other line is read as a page command and refused, and the engine
        // would stay without a key.
        let prefix = r#"{"v":1,"type":"auth.key""#;
        assert!(include_str!("../../../runner/src/pump.ts").contains(&format!("line.startsWith('{prefix}')")));
        assert!(include_str!("../../../runner/src/main.ts").contains("pumpLine(line, { takeKey, dispatch, say });"));
        let out = std::env::temp_dir().join(format!("companion-handoff-{}", std::process::id()));
        let _ = std::fs::remove_file(&out);
        let script: &'static str = Box::leak(format!("read -r a; read -r b; printf '%s\\n%s\\n' \"$a\" \"$b\" > '{}'; sleep 5", out.display()).into_boxed_str());
        let r = rig(script, quick());
        let runner = Runner::with_shared(r.shared.clone(), quick());
        assert!(wait_for(|| runner.hand_key(Some("sk-ant-test-not-a-real-key"), false).is_ok(), 3000));
        assert!(runner.hand_key(None, false).is_ok());
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
    fn restart_brings_back_an_engine_that_was_given_up_on() {
        let shared = Shared::new(); let spawns = Arc::new(AtomicU64::new(0)); let s2 = spawns.clone();
        let events = Arc::new(Mutex::new(Vec::new())); let e2 = events.clone();
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); Err(io::Error::new(io::ErrorKind::NotFound, "no bun")) }), Arc::new(move |v| e2.lock().unwrap().push(v)), Arc::new(|_| {}), quick());
        assert!(wait_for(|| events.lock().unwrap().iter().any(|e| e["reason"] == KEEPS_STOPPING), 5000));
        let n = spawns.load(Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(spawns.load(Ordering::SeqCst), n, "nothing is tried after giving up");
        shared.ask_retry();
        assert!(wait_for(|| spawns.load(Ordering::SeqCst) > n, 3000), "Restart starts it again");
        shared.quitting.store(true, Ordering::SeqCst);
    }
    #[test]
    fn a_supervisor_that_gave_up_sleeps_until_restart_and_wakes_at_once() {
        // Must fix 33: after giving up it waits on a Condvar, not a 20 a second poll, and Restart wakes it straight away.
        let shared = Shared::new(); let spawns = Arc::new(AtomicU64::new(0)); let s2 = spawns.clone();
        let events = Arc::new(Mutex::new(Vec::new())); let e2 = events.clone();
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); Err(io::Error::new(io::ErrorKind::NotFound, "no bun")) }), Arc::new(move |v| e2.lock().unwrap().push(v)), Arc::new(|_| {}), quick());
        assert!(wait_for(|| events.lock().unwrap().iter().any(|e| e["reason"] == KEEPS_STOPPING), 5000));
        std::thread::sleep(Duration::from_millis(50));
        let n = spawns.load(Ordering::SeqCst);
        let t = Instant::now();
        shared.ask_retry();
        assert!(wait_for(|| spawns.load(Ordering::SeqCst) > n, 3000));
        assert!(t.elapsed() < Duration::from_millis(400), "woken at once, not on a later tick: {:?}", t.elapsed());
        shared.ask_quit();
        let src = include_str!("runner.rs");
        let sup = &src[src.find("pub fn supervise_first(").unwrap()..];
        let sup = &sup[..sup.find("\n}\n").unwrap()];
        assert!(!sup.contains("std::thread::sleep("), "the supervisor never polls: {sup}");
    }
    #[test]
    fn the_first_engine_start_happens_on_the_supervisor_thread_never_on_the_caller() {
        // Must fix 33: start() runs in the app's setup on the main thread, and the first start checks Claude's signature
        // with codesign (about 0.65 s). So start() only hands the work to the supervisor.
        let src = include_str!("runner.rs");
        let start = &src[src.find("pub fn start(").unwrap()..];
        let start = &start[..start.find("\n    }\n").unwrap()];
        assert!(!start.contains("= spawn()") && !start.contains("let first"), "no start before the supervisor's: {start}");
        assert!(start.contains("supervise_first(self.shared.clone(), spawn, emit,"), "{start}");
    }
    #[test]
    fn an_engine_that_cannot_be_started_at_all_is_reported_not_fatal() {
        let shared = Shared::new(); let events = Arc::new(Mutex::new(Vec::new())); let e2 = events.clone();
        supervise(shared.clone(), Arc::new(|| Err(io::Error::new(io::ErrorKind::NotFound, "no bun"))), Arc::new(move |v| e2.lock().unwrap().push(v)), Arc::new(|_| {}), quick());
        assert!(wait_for(|| events.lock().unwrap().iter().any(|e| e["reason"].as_str().is_some_and(|m| m.contains("keeps stopping"))), 5000));
        // The person reads a plain sentence; the raw reason rides in detail, which publish takes off for the log.
        assert!(events.lock().unwrap().iter().any(|e| e["reason"] == HELPER_DOWN && e["detail"].as_str().is_some_and(|m| m.contains("no bun"))));
        assert!(!events.lock().unwrap().iter().any(|e| e["reason"].as_str().is_some_and(|m| m.contains("no bun"))));
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
        assert!(results.iter().any(|x| x.as_ref().is_err_and(|m| m == NOT_ANSWERING)), "a full queue was never reported");
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
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh(PONGS) }), Arc::new(|_| {}), Arc::new(|_| {}), t);
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
    /// A pretend engine that answers each line a second late, as the real one does: a ping with a pong carrying its id
    /// (must fix 12), anything else with an event of its own.
    const PONGS: &str = r#"while read l; do sleep 1; id=$(printf '%s' "$l" | sed -n 's/.*"id":"\(ping-[0-9-]*\)".*/\1/p'); if [ -n "$id" ]; then echo "{\"v\":1,\"id\":\"p\",\"type\":\"runner.pong\",\"ping\":\"$id\"}"; else echo '{"v":1,"id":"s","type":"agent.state","agent":"a","state":"working"}'; fi; done"#;
    #[test]
    fn stop_everything_waits_for_the_answer_to_its_own_ping_not_for_any_event() {
        // Must fix 12: an engine whose command loop has ended still sends events from work already under way. It answers every
        // line, but never with a pong, so it is not listening to commands: the Stop key's check must still force it.
        let shared = Shared::new(); let spawns = Arc::new(AtomicUsize::new(0)); let s2 = spawns.clone();
        let t = Timing { healthy: Duration::from_secs(60), heartbeat: Duration::from_secs(3), ..quick() };
        supervise(shared.clone(), Arc::new(move || { s2.fetch_add(1, Ordering::SeqCst); sh(r#"while read l; do echo '{"v":1,"id":"s","type":"agent.state","agent":"a","state":"working"}'; done"#) }), Arc::new(|_| {}), Arc::new(|_| {}), t);
        let runner = Runner::with_shared(shared.clone(), t);
        assert!(wait_for(|| runner.send(&json!({})).is_ok(), 3000));
        let read_before = shared.events_read.load(Ordering::SeqCst);
        runner.stop_everything("test").unwrap();
        assert!(wait_for(|| shared.stop_checks.load(Ordering::SeqCst) == 1, 30_000), "the Stop key's check never ended");
        assert!(shared.events_read.load(Ordering::SeqCst) > read_before, "the engine sent nothing back");
        assert_eq!(shared.forced_stops.load(Ordering::SeqCst), 1, "events that were not the pong counted as an answer");
        assert!(wait_for(|| spawns.load(Ordering::SeqCst) >= 2, 15_000), "the engine was not started again");
        runner.shut_down();
    }
    #[test]
    fn a_pong_names_the_ping_it_answers() {
        assert_eq!(pong_of(&json!({ "type": "runner.pong", "ping": "ping-1-0" })).as_deref(), Some("ping-1-0"));
        assert_eq!(pong_of(&json!({ "type": "runner.pong" })), None);
        assert_eq!(pong_of(&json!({ "type": "agent.state", "ping": "ping-1-0" })), None);
    }
    #[test]
    fn a_handler_that_panics_on_one_event_leaves_the_next_one_read() {
        // Must fix 12: a feature's hook that panics on one line never ends the reader, so the engine stays supervised.
        let shared = Shared::new();
        let events = Arc::new(Mutex::new(Vec::<Value>::new())); let e2 = events.clone();
        supervise(shared.clone(), Arc::new(|| sh(r#"echo '{"v":1,"id":"1","type":"boom"}'; echo '{"v":1,"id":"2","type":"runner.hello"}'; sleep 5"#)),
            Arc::new(move |v| { if v["type"] == "boom" { panic!("a hook failed"); } e2.lock().unwrap().push(v); }), Arc::new(|_| {}), quick());
        assert!(wait_for(|| events.lock().unwrap().iter().any(|v| v["type"] == "runner.hello"), 5000), "the reader stopped at the panic");
        assert_eq!(shared.handler_panics.load(Ordering::SeqCst), 1);
        shared.quitting.store(true, Ordering::SeqCst); shared.kill();
    }
    #[test]
    fn when_the_engine_ends_its_code_signal_time_and_starts_are_kept_for_the_log_only() {
        // Must fix 15: the exit code and the signal used to be thrown away.
        let r = rig("exit 3", quick());
        assert!(wait_for(|| r.events.lock().unwrap().iter().any(|v| v["type"] == "app.runner_down" && v.get("exit").is_some()), 5000));
        let down = r.events.lock().unwrap().iter().find(|v| v["type"] == "app.runner_down" && v.get("exit").is_some()).cloned().unwrap();
        assert_eq!(down["exit"]["code"], 3);
        assert!(down["exit"]["signal"].is_null());
        assert!(down["exit"]["starts"].as_u64().unwrap() >= 1);
        assert!(down["exit"]["uptime_ms"].is_u64());
        r.shared.quitting.store(true, Ordering::SeqCst); r.shared.kill();
        let k = rig("kill -9 $$", quick());
        assert!(wait_for(|| k.events.lock().unwrap().iter().any(|v| v["type"] == "app.runner_down" && v.get("exit").is_some()), 5000));
        let down = k.events.lock().unwrap().iter().find(|v| v["type"] == "app.runner_down" && v.get("exit").is_some()).cloned().unwrap();
        assert_eq!(down["exit"]["signal"], 9);
        k.shared.quitting.store(true, Ordering::SeqCst); k.shared.kill();
        // Taken off before any page sees it.
        let mut v = json!({ "type": "app.runner_down", "exit": { "code": 3 } });
        assert_eq!(take_exit(&mut v), Some(json!({ "code": 3 })));
        assert!(v.get("exit").is_none());
        assert_eq!(take_exit(&mut json!({ "type": "agent.state", "exit": 1 })), None);
    }
    #[test]
    fn the_engines_error_output_is_kept_short_and_scrubbed() {
        let l = engine_log_line("Error at /Users/sam/Developer/shop/index.ts with sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv for sam@example.com\n", "/Users/sam", "sam", 1700000000);
        assert!(l.starts_with("1700000000 "), "{l}");
        assert!(!l.contains("/Users/sam") && !l.contains("AbCdEfGhIjKlMnOp") && !l.contains("sam@example.com"), "{l}");
        assert!(engine_log_line(&"x".repeat(5000), "/Users/sam", "sam", 1).len() < 1100);
        // The engine's stderr is read into engine.log, never thrown away.
        let src = include_str!("runner.rs");
        let start = src.split("pub fn start(").nth(1).unwrap().split("supervise_first(").next().unwrap();
        assert!(start.contains(".stderr(Stdio::piped())") && start.contains("keep_engine_stderr(err, loc.data.join(\"engine.log\"))") && !start.contains("Stdio::null()"), "{start}");
    }
    #[test]
    fn stop_everything_with_no_engine_says_so_plainly() {
        let runner = Runner::new();
        assert_eq!(runner.stop_everything("test").unwrap_err(), NOT_READY);
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
