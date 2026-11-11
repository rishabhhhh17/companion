//! Why Squibby ended (5 Nov 2026: the founder found it gone with no crash report).
//!
//! macOS's own log showed what happened that time: a "quit" Apple Event from `osascript`, six seconds after a fresh build
//! was opened, while a second build was still being signed. Two build and reopen chains overlapped, and the later one's quit
//! landed on the copy the earlier one had just opened (scripts/reopen-app.sh now keeps them apart). Squibby's own log only
//! said "from: system", because nothing recorded who asked.
//!
//! So every way the app can end now leaves one plain line in `~/Library/Logs/Squibby/exits.log`, a file only the person
//! can read, that never grows without limit and holds no user content: the time, what ended it and, for a quit asked by
//! another program, that program's name (`osascript`, `loginwindow`) and the reason macOS gave (logging out, restarting).
//! A problem in Squibby's own code says only where it happened (the file and line), never what it was working on.
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const MAX_BYTES: u64 = 128 * 1024;
/// A problem that ended the app may start it again at most once in this long, so a problem at start can never loop.
pub const RESTART_GAP_SECS: u64 = 10 * 60;
/// How long after a restart the new copy still says why it restarted.
pub const NOTE_FRESH_SECS: u64 = 2 * 60;

pub fn dir(home: &Path) -> PathBuf { home.join("Library/Logs").join(crate::product!()) }
pub fn path(home: &Path) -> PathBuf { dir(home).join("exits.log") }

/// One value as it may appear in the line: short, and only letters, digits and a few marks. Anything else becomes `_`,
/// so nothing but a plain word, a number or a source location can ever be written.
pub fn clean(v: &Value) -> String {
    let raw = match v { Value::String(s) => s.clone(), Value::Null => "none".into(), other => other.to_string() };
    raw.chars().take(60).map(|c| if c.is_ascii_alphanumeric() || "._:-/".contains(c) { c } else { '_' }).collect()
}

/// `<seconds since 1970> <event> key=value ...`, the keys in order.
pub fn line(at_secs: u64, ev: &str, fields: &Value) -> String {
    let mut s = format!("{at_secs} {}", clean(&Value::String(ev.into())));
    if let Value::Object(m) = fields {
        let mut keys: Vec<&String> = m.keys().collect();
        keys.sort();
        for k in keys { s.push_str(&format!(" {}={}", clean(&Value::String(k.clone())), clean(&m[k]))); }
    }
    s
}

static WRITING: Mutex<()> = Mutex::new(());
fn now_secs() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

/// Adds one line to the exits log. Never waits: from a panic, a lock already held on this thread is skipped, not waited on.
pub fn note(ev: &str, fields: &Value) {
    if cfg!(test) { return; }   // tests never write to the person's real log folder; note_at is what they check
    let Ok(_g) = WRITING.try_lock() else { return };
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    if home.as_os_str().is_empty() { return; }
    note_at(&path(&home), now_secs(), ev, fields);
}
pub fn note_at(file: &Path, at_secs: u64, ev: &str, fields: &Value) {
    if let Some(d) = file.parent() { let _ = std::fs::create_dir_all(d); }
    crate::logfile::append_line(file, &line(at_secs, ev, fields), MAX_BYTES);
}

/// The events of the small log that are also an ending (or the engine's), mirrored into the exits log.
pub const MIRRORED: &[&str] = &["app_quit", "runner_exit", "second_copy_left", "quit_asked", "exit_prevented", "app_signal", "app_problem_restart", "app_problem_no_restart", "engine_gave_up"];
pub fn mirrored(ev: &str) -> bool { MIRRORED.contains(&ev) }

/// Where a panic happened, with no folder names: only the last two parts of the path and the line
/// (`macos/event_loop.rs:281`). A path from Rust's package cache would otherwise carry the person's user name.
pub fn short_location(file: &str, line: u32) -> String {
    let parts: Vec<&str> = file.split(['/', '\\']).filter(|p| !p.is_empty()).collect();
    let tail = if parts.len() >= 2 { parts[parts.len() - 2..].join("/") } else { parts.join("/") };
    format!("{tail}:{line}")
}

/// A problem that ended the app starts it again only if the last such restart was long enough ago (or is unknown).
pub fn may_restart(last: Option<u64>, now: u64) -> bool { last.is_none_or(|l| l > now || now - l >= RESTART_GAP_SECS) }
pub fn read_secs(text: Option<String>) -> Option<u64> { text.and_then(|t| t.trim().parse().ok()) }
/// The new copy says why it opened by itself only when that restart just happened.
pub fn note_is_fresh(at: Option<u64>, now: u64) -> bool { at.is_some_and(|t| t <= now && now - t <= NOTE_FRESH_SECS) }
pub const RESTARTED_WORDS: &str = concat!(crate::product!(), " closed because of a problem and opened again. Anything that was running was stopped.");

/// The reason macOS gives with a quit it asks for (the Apple Event's `why?`), in plain words.
pub fn quit_reason(code: u32) -> &'static str {
    match &code.to_be_bytes() {
        b"logo" | b"rlgo" => "logging_out",
        b"rrst" | b"rest" => "restarting",
        b"rsdn" | b"shut" => "shutting_down",
        _ => "other",
    }
}
pub fn four(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }

/// A program's name as the log may say it: the name only (never a path), cleaned.
pub fn program_name(raw: &str) -> String {
    let base = raw.rsplit('/').next().unwrap_or("");
    let c = clean(&Value::String(base.into()));
    if c.is_empty() { "unknown".into() } else { c }
}

/// Who asked this quit, read while macOS is handling it: the program that sent the "quit" Apple Event and the reason given
/// with it. None when no Apple Event is being handled (the menu's Quit, an update, Delete everything).
#[cfg(target_os = "macos")]
pub fn quit_sender() -> Option<(String, &'static str)> {
    // Read through plain messages: the typed calls need another package (objc2-core-services), not worth a new dependency.
    use objc2::{msg_send, rc::Retained};
    use objc2_foundation::{NSAppleEventDescriptor, NSAppleEventManager};
    let ev = NSAppleEventManager::sharedAppleEventManager().currentAppleEvent()?;
    let (class, id): (u32, u32) = unsafe { (msg_send![&*ev, eventClass], msg_send![&*ev, eventID]) };
    if class != four(b"aevt") || id != four(b"quit") { return None; }
    let spid: Option<Retained<NSAppleEventDescriptor>> = unsafe { msg_send![&*ev, attributeDescriptorForKeyword: four(b"spid")] };
    let pid = spid.map(|d| d.int32Value()).unwrap_or(0);
    let name = if pid > 0 {
        let mut buf = [0u8; 256];
        let n = unsafe { libc::proc_name(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
        if n > 0 { program_name(&String::from_utf8_lossy(&buf[..n as usize])) } else { "unknown".into() }
    } else { "unknown".into() };
    let reason: Option<Retained<NSAppleEventDescriptor>> = unsafe { msg_send![&*ev, paramDescriptorForKeyword: four(b"why?")] };
    let why = reason.map(|d| quit_reason(d.enumCodeValue())).unwrap_or("none");
    Some((name, why))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tmp(name: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-exitlog-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&d); d }

    #[test]
    fn the_exits_log_lives_with_the_mac_s_other_app_logs() {
        assert_eq!(path(Path::new("/Users/x")), PathBuf::from(format!("/Users/x/Library/Logs/{}/exits.log", crate::product!())));
    }
    #[test]
    fn a_line_says_when_what_and_who_in_plain_words() {
        let l = line(1793830264, "quit_asked", &json!({ "by": "osascript", "why": "none", "uptime_s": 5 }));
        assert_eq!(l, "1793830264 quit_asked by=osascript uptime_s=5 why=none");
    }
    #[test]
    fn nothing_but_plain_words_numbers_and_places_can_reach_the_line() {
        // A value can never carry a sentence, a path with spaces, or a second line.
        let l = line(1, "app_quit", &json!({ "from": "menu\nfake 2 line", "x": "my secret project/notes.txt and more words that go on and on and on and on" }));
        assert_eq!(l.lines().count(), 1, "{l}");
        let words: Vec<&str> = l.split(' ').collect();
        assert_eq!(words.len(), 4, "{l}");
        assert_eq!(words[2], "from=menu_fake_2_line");
        assert!(words[3].len() <= 2 + 60, "{l}");
    }
    #[test]
    fn it_writes_and_never_grows_without_limit() {
        let f = tmp("grow").join("exits.log");
        for i in 0..5000 { note_at(&f, i, "runner_exit", &json!({ "code": 0, "starts": i })); }
        assert!(std::fs::metadata(&f).unwrap().len() <= MAX_BYTES + 200);
        assert!(std::fs::read_to_string(&f).unwrap().ends_with("starts=4999\n"));
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(&f).unwrap().permissions().mode() & 0o077, 0, "only the person can read it"); }
    }
    #[test]
    fn a_panic_s_place_never_names_a_folder_or_the_user() {
        assert_eq!(short_location("/Users/rishabh/.cargo/registry/src/index/tao-0.37.1/src/platform_impl/macos/event_loop.rs", 281), "macos/event_loop.rs:281");
        assert_eq!(short_location("src/main.rs", 12), "src/main.rs:12");
        assert_eq!(short_location("main.rs", 3), "main.rs:3");
    }
    #[test]
    fn a_problem_restarts_the_app_once_in_ten_minutes_so_it_can_never_loop() {
        assert!(may_restart(None, 1000));
        assert!(!may_restart(Some(1000), 1000 + 30));
        assert!(may_restart(Some(1000), 1000 + RESTART_GAP_SECS));
        assert!(may_restart(Some(5000), 1000), "a time in the future (the clock moved) does not block it");
        assert_eq!(read_secs(Some(" 42\n".into())), Some(42));
        assert_eq!(read_secs(Some("x".into())), None);
    }
    #[test]
    fn the_new_copy_says_why_only_right_after_the_restart() {
        assert!(note_is_fresh(Some(100), 150));
        assert!(!note_is_fresh(Some(100), 100 + NOTE_FRESH_SECS + 1));
        assert!(!note_is_fresh(None, 100));
        assert!(RESTARTED_WORDS.starts_with(crate::product!()) && !RESTARTED_WORDS.contains('\u{2014}'));
    }
    #[test]
    fn the_reason_macos_gives_for_a_quit_is_named() {
        assert_eq!(quit_reason(four(b"logo")), "logging_out");
        assert_eq!(quit_reason(four(b"rrst")), "restarting");
        assert_eq!(quit_reason(four(b"rsdn")), "shutting_down");
        assert_eq!(quit_reason(0), "other");
        assert_eq!(program_name("/usr/bin/osascript"), "osascript");
        assert_eq!(program_name(""), "unknown");
    }
    #[test]
    fn every_ending_is_mirrored() {
        for ev in ["app_quit", "runner_exit", "second_copy_left", "quit_asked", "exit_prevented", "app_signal", "app_problem_restart", "engine_gave_up"] { assert!(mirrored(ev), "{ev}"); }
        assert!(!mirrored("hotkey") && !mirrored("approval_asked"));
    }
}

/// app/scripts/reopen-app.sh, run against pretend tools (no real app is quit or opened): the 5 Nov 2026 chain.
#[cfg(test)]
mod reopen_script_tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    struct Rig { d: PathBuf, app: PathBuf }
    fn rig(name: &str, quits: bool, stays: bool, running: bool) -> Rig {
        let d = std::env::temp_dir().join(format!("companion-reopen-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        let app = d.join("Squibby.app");
        std::fs::create_dir_all(app.join("Contents")).unwrap();
        std::fs::write(app.join("Contents/Info.plist"), r#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>companion-app</string></dict></plist>"#).unwrap();
        let ds = d.display();
        let tool = |n: &str, body: String| { let p = d.join(n); std::fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap(); use std::os::unix::fs::PermissionsExt; std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap(); };
        tool("pgrep", format!("[ \"$2\" = companion-app ] && [ -f '{ds}/running' ]"));
        tool("osascript", format!("echo quit >> '{ds}/calls'{}", if quits { format!("; ( sleep 0.3; rm -f '{ds}/running' ) &") } else { String::new() }));
        tool("open", format!("if [ -f '{ds}/running' ]; then echo open-while-running >> '{ds}/calls'; fi; echo \"open $1\" >> '{ds}/calls'{}", if stays { format!("; touch '{ds}/running'") } else { String::new() }));
        if running { std::fs::write(d.join("running"), "").unwrap(); }
        Rig { d, app }
    }
    fn script() -> PathBuf { Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/reopen-app.sh") }
    fn cmd(r: &Rig) -> Command {
        let mut c = Command::new("/bin/bash");
        c.arg(script()).arg(&r.app)
            .env("REOPEN_OSASCRIPT", r.d.join("osascript")).env("REOPEN_OPEN", r.d.join("open")).env("REOPEN_PGREP", r.d.join("pgrep"))
            .env("REOPEN_LOCK", r.d.join("lock")).env("REOPEN_STAY", "1").env("REOPEN_QUIT_WAIT", "30");
        c
    }
    fn calls(r: &Rig) -> Vec<String> { std::fs::read_to_string(r.d.join("calls")).unwrap_or_default().lines().map(String::from).collect() }

    #[test]
    fn the_old_copy_is_quit_and_gone_before_the_new_one_opens_as_a_fresh_copy() {
        let r = rig("usual", true, true, true);
        let out = cmd(&r).output().unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stdout));
        assert_eq!(calls(&r), vec!["quit".to_string(), "open -n".into()]);
    }
    #[test]
    fn with_nothing_running_no_quit_is_sent_so_it_can_never_start_squibby_just_to_quit_it() {
        let r = rig("idle", true, true, false);
        assert!(cmd(&r).output().unwrap().status.success());
        assert_eq!(calls(&r), vec!["open -n".to_string()]);
        // And the quit itself asks only a copy that is running.
        let text = std::fs::read_to_string(script()).unwrap();
        assert!(text.contains("is running then tell application id"), "the quit must be guarded");
    }
    #[test]
    fn a_copy_that_does_not_quit_is_never_joined_by_a_second() {
        let r = rig("stuck", false, true, true);
        let mut c = cmd(&r);
        c.env("REOPEN_QUIT_WAIT", "5");
        let out = c.output().unwrap();
        assert!(!out.status.success());
        assert!(String::from_utf8_lossy(&out.stdout).contains("did not quit"));
        assert_eq!(calls(&r), vec!["quit".to_string()], "nothing was opened");
    }
    #[test]
    fn a_new_copy_that_does_not_stay_open_is_reported_not_left_quiet() {
        let r = rig("gone", true, false, false);
        let out = cmd(&r).output().unwrap();
        assert!(!out.status.success());
        assert!(String::from_utf8_lossy(&out.stdout).contains("is not running now"));
    }
    #[test]
    fn two_reopens_at_once_take_turns_so_one_s_quit_never_lands_on_the_copy_the_other_just_opened() {
        // What happened on 5 Nov 2026, without the lock: quit, quit, open, open (the second quit ends the first open's copy,
        // or both opens race). With it, each run quits only the copy before it and the last copy opened stays.
        let r = rig("overlap", true, true, true);
        let (mut a, mut b) = (cmd(&r).spawn().unwrap(), cmd(&r).spawn().unwrap());
        assert!(a.wait().unwrap().success() && b.wait().unwrap().success());
        assert_eq!(calls(&r), vec!["quit".to_string(), "open -n".into(), "quit".into(), "open -n".into()]);
        assert!(r.d.join("running").exists(), "a copy is running at the end");
        assert!(!r.d.join("lock").exists(), "the lock is let go");
    }
    #[test]
    fn a_lock_left_by_a_run_that_died_does_not_block_the_next() {
        let r = rig("stale", true, true, false);
        std::fs::create_dir_all(r.d.join("lock")).unwrap();
        std::fs::write(r.d.join("lock/pid"), "999999").unwrap();
        assert!(cmd(&r).output().unwrap().status.success());
        assert_eq!(calls(&r), vec!["open -n".to_string()]);
    }
}

/// How main.rs is wired, so no way out loses its line again.
#[cfg(test)]
mod wiring_tests {
    fn main_rs() -> &'static str { crate::main_src() }
    fn run_loop() -> &'static str { main_rs().split("let ended = std::panic::catch_unwind(").nth(1).expect("the event loop runs inside catch_unwind").split("fn problem_note_now").next().unwrap() }

    #[test]
    fn the_last_window_closing_never_quits_squibby() {
        let l = run_loop();
        assert!(l.contains("RunEvent::ExitRequested { code: None, api, .. } => { log(\"exit_prevented\", json!({})); api.prevent_exit(); }"), "{l}");
    }
    #[test]
    fn a_quit_asked_by_another_program_names_it_before_the_quit_runs() {
        let exit = main_rs().split("RunEvent::Exit =>").nth(1).unwrap().split("RunEvent::Reopen").next().unwrap();
        assert!(exit.find("exitlog::quit_sender()").unwrap() < exit.find("quit_now(").unwrap(), "{exit}");
        assert!(exit.contains("log(\"quit_asked\""), "{exit}");
    }
    #[test]
    fn a_panic_that_ends_the_event_loop_shuts_the_engine_down_and_opens_the_app_again_once() {
        let l = run_loop();
        assert!(l.contains("if ended.is_err() { ended_by_problem(&handle); }"), "{l}");
        let p = main_rs().split("fn ended_by_problem(").nth(1).unwrap().split("\n}\n").next().unwrap();
        let (q, guard, start, end) = (p.find("quit_now(app, quit::PROBLEM").unwrap(), p.find("exitlog::may_restart(").unwrap(), p.find("start_new_copy(app)").unwrap(), p.find("libc::_exit(1)").unwrap());
        assert!(q < guard && guard < start && start < end, "{p}");
        assert!(p.contains("problem-restart-note"), "the new copy is told why");
    }
    #[test]
    fn the_panic_note_and_the_signal_watch_start_before_anything_else() {
        let m = main_rs().split("fn main() {").nth(1).unwrap();
        let (hook, sig, inst) = (m.find("install_panic_note();").unwrap(), m.find("watch_signals();").unwrap(), m.find("instance::take_waiting(").unwrap());
        assert!(hook < inst && sig < inst);
        assert!(m.contains("instance::take_waiting(&data_dir().join(\"instance.lock\"), instance::START_WAIT,"));
    }
    #[test]
    fn a_signal_is_a_quit_like_any_other() {
        let w = main_rs().split("fn watch_signals()").nth(1).unwrap().split("\n}\n").next().unwrap();
        for want in ["libc::SIGTERM", "libc::SIGHUP", "libc::SIGINT", "FD_CLOEXEC", "log(\"app_signal\"", "quit::mark(quit::SIGNAL)", "a.exit(0)"] { assert!(w.contains(want), "{want}: {w}"); }
    }
    #[test]
    fn macos_may_never_quit_squibby_by_itself() {
        let setup = main_rs().split(".setup(move |app| {").nth(1).unwrap();
        assert!(setup.find("keep_running_until_quit();").unwrap() < setup.find("start_runner(app.handle());").unwrap());
        let k = main_rs().split("fn keep_running_until_quit()").nth(1).unwrap().split("\n}\n").next().unwrap();
        assert!(k.contains("disableAutomaticTermination(") && k.contains("disableSuddenTermination()"), "{k}");
        let plist = include_str!("../Info.plist").split_whitespace().collect::<String>();
        assert!(plist.contains("<key>NSSupportsAutomaticTermination</key><false/>") && plist.contains("<key>NSSupportsSuddenTermination</key><false/>"));
        assert!(include_str!("../../scripts/build-app.sh").contains("NSSupportsAutomaticTermination"), "the build checks it");
    }
    #[test]
    fn a_new_copy_waits_longer_than_the_slowest_quit_before_it_gives_up() {
        let slowest = crate::quit::VOICE_WAIT_UPDATE + crate::runner::Timing::default().quit_grace + std::time::Duration::from_secs(5);
        assert!(crate::instance::START_WAIT > slowest, "{:?} <= {:?}", crate::instance::START_WAIT, slowest);
    }
    #[test]
    fn the_engine_giving_up_is_written_down() {
        let r = include_str!("runner.rs");
        let publish = &r[r.find("pub fn publish(").unwrap()..];
        assert!(publish[..publish.find("\n    }\n").unwrap()].contains("crate::log(\"engine_gave_up\""));
    }
}
