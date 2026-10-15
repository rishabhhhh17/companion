//! One copy of Companion at a time. Two copies would both own the hotkeys and both start an engine, so a second copy
//! leaves quietly before it shows anything. The guard is an exclusive lock (`flock`) on a small empty file in Companion's
//! data folder. The lock belongs to the open file, not to the file being there: macOS lets go of it the moment the
//! program ends, even after a crash, so a file left behind never blocks the next start. No plugin, no new dependency.

use std::fs::{File, OpenOptions};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::io::AsRawFd;
use std::path::Path;
use std::time::{Duration, Instant};

/// Held for as long as this copy runs. Dropping it, or the program ending, lets the lock go.
#[derive(Debug)]
pub struct Guard {
    #[allow(dead_code)] // never read: keeping the file open is what holds the lock
    file: File,
}

#[derive(Debug)]
pub enum Taken {
    /// This copy is the one that runs.
    Ours(Guard),
    /// Another copy is already running.
    Elsewhere,
    /// The lock could not be checked (the folder cannot be written, for example). Companion opens anyway: never being
    /// able to open is worse than a rare second copy.
    CouldNotCheck(String),
}

/// One try, without waiting.
pub fn try_take(path: &Path) -> Taken {
    if let Some(dir) = path.parent() { if let Err(e) = std::fs::create_dir_all(dir) { return Taken::CouldNotCheck(e.to_string()); } }
    // Rust opens files so that programs Companion starts (the engine, the cleanup helper) never inherit them, so the lock
    // is never kept alive by one of them. Only the owner may read or write the file.
    let file = match OpenOptions::new().read(true).write(true).create(true).truncate(false).mode(0o600).open(path) { Ok(f) => f, Err(e) => return Taken::CouldNotCheck(e.to_string()) };
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 { return Taken::Ours(Guard { file }); }
    let err = std::io::Error::last_os_error();
    if err.raw_os_error() == Some(libc::EWOULDBLOCK) { Taken::Elsewhere } else { Taken::CouldNotCheck(err.to_string()) }
}

/// Tries for up to `wait`. After an update, the new copy is started a moment before the old one has ended, so it must
/// not give up at once; a copy opened by mistake simply leaves after the wait, having shown nothing.
pub fn take_waiting(path: &Path, wait: Duration, poll: Duration) -> Taken {
    let end = Instant::now() + wait;
    loop {
        let t = try_take(path);
        if !matches!(t, Taken::Elsewhere) || Instant::now() >= end { return t; }
        std::thread::sleep(poll.min(end.saturating_duration_since(Instant::now())).max(Duration::from_millis(1)));
    }
}

/// Only a copy that is sure another one runs leaves.
pub fn should_leave(t: &Taken) -> bool { matches!(t, Taken::Elsewhere) }

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;
    fn dir(name: &str) -> std::path::PathBuf { let d = std::env::temp_dir().join(format!("companion-instance-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap(); d }
    fn ours(t: Taken) -> Guard { match t { Taken::Ours(g) => g, other => panic!("expected the lock, got {other:?}") } }

    #[test]
    fn the_first_copy_takes_it_and_a_second_copy_is_told_to_leave() {
        // Two opens of the same file are two separate locks, exactly as two separate programs would be.
        let p = dir("two").join("instance.lock");
        let first = ours(try_take(&p));
        let second = try_take(&p);
        assert!(matches!(second, Taken::Elsewhere), "{second:?}");
        assert!(should_leave(&second));
        drop(first);
    }
    #[test]
    fn when_the_first_copy_ends_the_next_one_starts() {
        let p = dir("after").join("instance.lock");
        drop(ours(try_take(&p)));
        let again = try_take(&p);
        assert!(!should_leave(&again));
        ours(again);
    }
    #[test]
    fn a_file_left_behind_by_a_crash_never_blocks_the_next_start() {
        // The lock belongs to the open file, and macOS lets it go when the program ends; the file itself means nothing.
        let p = dir("stale").join("instance.lock");
        std::fs::write(&p, "left over").unwrap();
        ours(try_take(&p));
    }
    #[test]
    fn the_data_folder_is_made_if_it_is_not_there_yet() {
        let p = dir("fresh").join("not yet").join("instance.lock");
        ours(try_take(&p));
        assert!(p.is_file());
    }
    #[test]
    fn after_an_update_the_new_copy_waits_for_the_old_one_to_end() {
        let p = dir("restart").join("instance.lock");
        let old = ours(try_take(&p));
        let holder = std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(300)); drop(old); });
        let t0 = Instant::now();
        ours(take_waiting(&p, Duration::from_secs(3), Duration::from_millis(25)));
        assert!(t0.elapsed() >= Duration::from_millis(250), "it did not wait");
        holder.join().unwrap();
    }
    #[test]
    fn a_second_copy_waits_only_a_moment_then_leaves() {
        let p = dir("leave").join("instance.lock");
        let _first = ours(try_take(&p));
        let t0 = Instant::now();
        let t = take_waiting(&p, Duration::from_millis(200), Duration::from_millis(25));
        assert!(matches!(t, Taken::Elsewhere), "{t:?}");
        assert!(t0.elapsed() < Duration::from_secs(2));
    }
    #[test]
    fn if_the_lock_cannot_be_checked_companion_still_opens() {
        let d = dir("blocked");
        std::fs::write(d.join("a file"), "x").unwrap();
        let t = try_take(&d.join("a file").join("instance.lock"));   // a folder cannot be made inside a file
        assert!(matches!(t, Taken::CouldNotCheck(_)), "{t:?}");
        assert!(!should_leave(&t));
    }
    #[test]
    fn the_lock_is_never_handed_to_programs_companion_starts() {
        // The engine and the cleanup helper are started by Companion; if they kept the lock, a new copy could not start.
        let p = dir("cloexec").join("instance.lock");
        let g = ours(try_take(&p));
        use std::os::unix::io::AsRawFd;
        let flags = unsafe { libc::fcntl(g.file.as_raw_fd(), libc::F_GETFD) };
        assert!(flags >= 0 && flags & libc::FD_CLOEXEC != 0);
    }
    #[test]
    fn only_the_owner_can_read_the_lock_file() {
        use std::os::unix::fs::PermissionsExt;
        let p = dir("mode").join("instance.lock");
        let _g = ours(try_take(&p));
        assert_eq!(std::fs::metadata(&p).unwrap().permissions().mode() & 0o077, 0);
    }
}
