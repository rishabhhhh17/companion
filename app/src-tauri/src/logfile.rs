//! The small log and settings files. Rules: the log never grows without limit, it says nothing about which apps the person
//! uses unless a developer turned that on, and a file is never left half written.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

pub const MAX_BYTES: u64 = 512 * 1024;

/// What is always written: the app starting, the engine starting or failing, and the person pressing one of our own hotkeys.
const QUIET: &[&str] = &["launch", "runner_started", "runner_failed", "hotkey", "take_the_wheel", "menu_stop_everything", "menu_hide"];

pub fn should_log(ev: &str, verbose: bool) -> bool { verbose || QUIET.contains(&ev) }

/// Detailed logging is for the developer only: an environment setting or a file named `debug` in the app's folder.
pub fn verbose_enabled(dir: &Path, env: Option<&str>) -> bool { env == Some("1") || dir.join("debug").exists() }

fn private(opts: &mut OpenOptions) -> &mut OpenOptions {
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; opts.mode(0o600); }
    opts
}

/// Adds one line. When the file is over the limit it is moved aside (keeping one old copy) first, so it cannot grow forever.
pub fn append_line(path: &Path, line: &str, max: u64) {
    if let Ok(m) = fs::metadata(path) {
        if m.len() >= max { let mut old = path.as_os_str().to_owned(); old.push(".1"); let _ = fs::rename(path, old); }
    }
    if let Ok(mut f) = private(OpenOptions::new().create(true).append(true)).open(path) { let _ = writeln!(f, "{line}"); }
}

/// Writes a file so that a crash halfway leaves the old one untouched: write beside it, then swap. Only the owner can read it.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_owned(); tmp.push(format!(".tmp{}", std::process::id()));
    let tmp = std::path::PathBuf::from(tmp);
    {
        let mut f = private(OpenOptions::new().create(true).write(true).truncate(true)).open(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path).inspect_err(|_| { let _ = fs::remove_file(&tmp); })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn dir(name: &str) -> std::path::PathBuf { let d = std::env::temp_dir().join(format!("companion-log-{name}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); d }

    #[test] fn by_default_only_the_few_important_events_are_written() {
        for ev in ["launch", "runner_failed", "hotkey", "take_the_wheel"] { assert!(should_log(ev, false), "{ev}"); }
        for ev in ["front_app_changed", "runner_event", "click", "native_mousedown", "prompt_help", "prompt_help_step", "card_open", "fullscreen_raw"] { assert!(!should_log(ev, false), "{ev}"); }
    }
    #[test] fn in_debug_mode_everything_is_written() { for ev in ["front_app_changed", "click", "anything"] { assert!(should_log(ev, true)); } }
    #[test] fn debug_mode_needs_a_setting_or_a_file() {
        let d = dir("debug");
        assert!(!verbose_enabled(&d, None)); assert!(!verbose_enabled(&d, Some("0"))); assert!(!verbose_enabled(&d, Some("yes")));
        assert!(verbose_enabled(&d, Some("1")));
        fs::write(d.join("debug"), "").unwrap();
        assert!(verbose_enabled(&d, None));
    }
    #[test] fn the_log_cannot_grow_without_limit() {
        let d = dir("grow"); let f = d.join("events.jsonl");
        for i in 0..2000 { append_line(&f, &format!("{{\"line\":{i},\"pad\":\"{}\"}}", "x".repeat(100)), 50_000); }
        let size = fs::metadata(&f).unwrap().len();
        let old = fs::metadata(d.join("events.jsonl.1")).unwrap().len();
        assert!(size < 60_000 && old < 60_000, "{size} {old}");
        assert!(fs::read_to_string(&f).unwrap().contains("\"line\":1999"));            // the newest lines are never lost
        assert!(!d.join("events.jsonl.2").exists());                                    // only one old copy is kept
    }
    #[test] fn log_files_can_only_be_read_by_their_owner() {
        use std::os::unix::fs::PermissionsExt;
        let d = dir("mode"); let f = d.join("events.jsonl");
        append_line(&f, "x", MAX_BYTES);
        assert_eq!(fs::metadata(&f).unwrap().permissions().mode() & 0o077, 0);
    }
    #[test] fn a_saved_file_is_replaced_whole_and_never_half_written() {
        let d = dir("atomic"); let f = d.join("prefs.json");
        write_atomic(&f, b"{\"a\":1}").unwrap();
        write_atomic(&f, b"{\"a\":2}").unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "{\"a\":2}");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "a temporary file was left behind");
    }
    #[test] fn saved_files_can_only_be_read_by_their_owner() {
        use std::os::unix::fs::PermissionsExt;
        let d = dir("atomicmode"); let f = d.join("consent.json");
        write_atomic(&f, b"{}").unwrap();
        assert_eq!(fs::metadata(&f).unwrap().permissions().mode() & 0o077, 0);
    }
    #[test] fn a_failed_save_keeps_the_old_file_and_leaves_no_mess() {
        let d = dir("fail"); let f = d.join("sub").join("prefs.json");          // the folder does not exist
        assert!(write_atomic(&f, b"x").is_err());
        assert_eq!(fs::read_dir(&d).unwrap().count(), 0);
    }
}
