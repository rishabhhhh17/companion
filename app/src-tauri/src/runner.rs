//! Starts the runner program and carries messages between it and the web pages.
//! The pages never see keys or the Keychain. They may send only whitelisted commands.

use serde_json::Value;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::Manager;
use tauri::{AppHandle, Emitter};

pub const PROTOCOL_VERSION: i64 = 1;

/// The commands a web page may send. Everything else is refused here, in Rust.
const ALLOWED: &[&str] = &[
    "agent.start", "agent.send", "agent.interrupt", "agent.interruptAll", "approval.resolve", "checkpoint.restore",
    "assist.prompt", "assist.locate", "assist.cancel",
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

/// Splits a stream of bytes into whole lines, keeping a partial line for next time.
pub fn split_lines(buf: &mut Vec<u8>, chunk: &[u8]) -> Vec<String> {
    buf.extend_from_slice(chunk);
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
pub struct Locations { pub bun: PathBuf, pub runner: PathBuf, pub data: PathBuf }

pub fn locations(dev_json: Option<&str>, env: &dyn Fn(&str) -> Option<String>, data: PathBuf) -> Result<Locations, String> {
    let dev: Value = dev_json.and_then(|s| serde_json::from_str(s).ok()).unwrap_or(Value::Null);
    let pick = |key: &str, var: &str| dev.get(key).and_then(Value::as_str).map(str::to_string).or_else(|| env(var));
    let bun = pick("bun", "COMPANION_BUN").ok_or("Companion cannot find Bun. Run app/scripts/dev-setup.sh")?;
    let runner = pick("runner", "COMPANION_RUNNER").ok_or("Companion cannot find the runner. Run app/scripts/dev-setup.sh")?;
    Ok(Locations { bun: bun.into(), runner: runner.into(), data })
}

/// Status messages a page that loads late still needs (who is connected, is the engine up).
const STICKY: &[&str] = &["runner.hello", "auth.status", "app.runner_down"];

/// Remember the latest sticky event of each type. Returns true if it was kept.
pub fn remember(map: &mut BTreeMap<String, Value>, v: &Value) -> bool {
    match v.get("type").and_then(Value::as_str) {
        Some(t) if STICKY.contains(&t) => { map.insert(t.to_string(), v.clone()); true }
        _ => false,
    }
}

pub struct Runner { stdin: Mutex<Option<ChildStdin>>, child: Mutex<Option<Child>>, sticky: Mutex<BTreeMap<String, Value>> }
impl Runner {
    pub fn new() -> Self { Self { stdin: Mutex::new(None), child: Mutex::new(None), sticky: Mutex::new(BTreeMap::new()) } }

    /// What to replay to a page that has just loaded, oldest meaning first.
    pub fn replay(&self) -> Vec<Value> { self.sticky.lock().unwrap().values().cloned().collect() }

    /// Tell every page, and remember it for pages that load later.
    pub fn publish(app: &AppHandle, v: Value) {
        remember(&mut app.state::<Runner>().sticky.lock().unwrap(), &v);
        let _ = app.emit("runner-event", v);
    }

    /// Start the runner and forward each event line to the pages as "runner-event".
    pub fn start(&self, app: &AppHandle, loc: &Locations, on_type: impl Fn(&str) + Send + 'static) -> Result<(), String> {
        std::fs::create_dir_all(&loc.data).map_err(|e| e.to_string())?;
        let mut child = Command::new(&loc.bun)
            .arg(&loc.runner)
            .env("COMPANION_DATA", &loc.data)
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
            .spawn().map_err(|e| format!("could not start the runner: {e}"))?;
        let stdout = child.stdout.take().ok_or("no runner output")?;
        *self.stdin.lock().unwrap() = child.stdin.take();
        *self.child.lock().unwrap() = Some(child);
        let app = app.clone();
        std::thread::spawn(move || {
            let mut out = stdout;
            let (mut buf, mut chunk) = (Vec::new(), [0u8; 8192]);
            loop {
                let n = match out.read(&mut chunk) { Ok(0) | Err(_) => break, Ok(n) => n };
                for line in split_lines(&mut buf, &chunk[..n]) {
                    if let Ok(v) = serde_json::from_str::<Value>(&line) {
                        on_type(v.get("type").and_then(Value::as_str).unwrap_or("?"));   // the type only, never the content
                        Runner::publish(&app, v);
                    }
                }
            }
            Runner::publish(&app, serde_json::json!({ "v": 1, "id": "app-down", "type": "app.runner_down" }));
        });
        Ok(())
    }

    /// Write one command line to the runner.
    pub fn send(&self, cmd: &Value) -> Result<(), String> {
        let mut g = self.stdin.lock().unwrap();
        let w = g.as_mut().ok_or("the runner is not running")?;
        writeln!(w, "{cmd}").and_then(|_| w.flush()).map_err(|e| e.to_string())
    }

    pub fn stop_everything(&self, reason: &str) -> Result<(), String> {
        self.send(&serde_json::json!({ "v": 1, "id": format!("kill-{}", std::process::id()), "type": "agent.interruptAll", "reason": reason }))
    }

    pub fn shut_down(&self) {
        self.stdin.lock().unwrap().take();   // closing the pipe tells the runner to stop and exit
        if let Some(mut c) = self.child.lock().unwrap().take() {
            let _ = c.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn allows_the_commands_pages_need() {
        for t in ["agent.start", "agent.interruptAll", "approval.resolve", "checkpoint.restore"] {
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
}
