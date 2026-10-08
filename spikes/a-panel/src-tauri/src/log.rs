//! Append only JSONL event log. One line per event, written in a single call.
//! Privacy rule: never log typed text, only lengths. `analyze.py` lints this.

use serde_json::{json, Map, Value};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

pub struct EventLog {
    file: Mutex<Option<File>>,
    run: String,
    seq: AtomicU64,
    start: Instant,
    ctx: Mutex<Map<String, Value>>,
}

static LOG: OnceLock<EventLog> = OnceLock::new();

pub fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

pub fn init(cfg: &crate::config::Config) {
    let dir = crate::config::data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let file = OpenOptions::new().create(true).append(true).open(dir.join("events.jsonl")).ok();
    let mut ctx = Map::new();
    ctx.insert("mode".into(), json!(cfg.mode));
    ctx.insert("afm".into(), json!(cfg.afm));
    ctx.insert("preset".into(), json!(cfg.preset));
    ctx.insert("build".into(), json!(if cfg!(debug_assertions) { "dev" } else { "release" }));
    ctx.insert("cfg_src".into(), json!(cfg.src));
    let _ = LOG.set(EventLog {
        file: Mutex::new(file),
        run: format!("{}-{}", now_ms(), std::process::id()),
        seq: AtomicU64::new(0),
        start: Instant::now(),
        ctx: Mutex::new(ctx),
    });
}

/// Update a context field that every later line carries (for example the preset).
pub fn set_ctx(key: &str, value: Value) {
    if let Some(l) = LOG.get() {
        if let Ok(mut c) = l.ctx.lock() {
            c.insert(key.into(), value);
        }
    }
}

pub fn ev(name: &str, extra: Value) {
    let Some(l) = LOG.get() else { return };
    let mut line = Map::new();
    line.insert("v".into(), json!(1));
    line.insert("run".into(), json!(l.run));
    line.insert("seq".into(), json!(l.seq.fetch_add(1, Ordering::SeqCst)));
    line.insert("t".into(), json!(now_ms() as u64));
    line.insert("ms".into(), json!(l.start.elapsed().as_millis() as u64));
    line.insert("ev".into(), json!(name));
    if let Ok(c) = l.ctx.lock() {
        for (k, v) in c.iter() {
            line.insert(k.clone(), v.clone());
        }
    }
    if let Value::Object(m) = extra {
        for (k, v) in m {
            line.insert(k, v);
        }
    }
    let mut s = Value::Object(line).to_string();
    s.push('\n');
    if let Ok(mut f) = l.file.lock() {
        if let Some(f) = f.as_mut() {
            let _ = f.write_all(s.as_bytes());
        }
    }
}
