//! Quitting (must fixes 1 and 15, review of 4 Nov 2026).
//!
//! 1. Every crash report on the founder's Mac after a normal Quit, an update restart or Delete everything ended in an abort
//!    inside the C++ clean up that runs at exit. The likely cause (an inference: the frames were not symbolicated) is the
//!    speech model still loaded at that moment. So a quit first asks the hold to talk worker to let both of its models go,
//!    and waits about a second for its answer. Only then does the engine shut down. If the worker does not answer (it is
//!    still turning speech into words, or a model is still loading), the process ends at once after the engine has shut
//!    down, without that clean up (`_exit`), so it can never be reported as a crash.
//! 2. Each quit is written to the small log with where it came from (the menu, an update, Delete everything, or the system),
//!    so a report from a friend says how the app ended.
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

/// How long a quit waits for the hold to talk worker to let its models go.
pub const VOICE_WAIT: Duration = Duration::from_secs(1);
/// An update restart can wait a little longer: the person pressed Install and expects a moment's pause, and the restart
/// itself always runs the clean up at exit (Tauri's own restart), so the models must be gone first.
pub const VOICE_WAIT_UPDATE: Duration = Duration::from_secs(3);

/// Where a quit came from. The first one named wins (an update's restart also ends in the app's own exit).
pub const MENU: &str = "menu";
pub const UPDATE: &str = "update";
pub const WIPE: &str = "wipe";
pub const SYSTEM: &str = "system";
/// 5 Nov 2026: a problem in the app's own code ended the event loop (main.rs ended_by_problem).
pub const PROBLEM: &str = "problem";
/// 5 Nov 2026: a TERM, HUP or INT signal (main.rs watch_signals).
pub const SIGNAL: &str = "signal";
static FROM: Mutex<Option<&'static str>> = Mutex::new(None);
pub fn mark(from: &'static str) { let mut g = FROM.lock().unwrap_or_else(|e| e.into_inner()); if g.is_none() { *g = Some(from); } }
/// The quit's source: named by the menu, an update or Delete everything; anything else (logging out, shutting down, a
/// signal) is the system's.
pub fn from() -> &'static str { FROM.lock().unwrap_or_else(|e| e.into_inner()).unwrap_or(SYSTEM) }

static DONE: AtomicBool = AtomicBool::new(false);
static HARD: AtomicBool = AtomicBool::new(false);
/// A quit's steps found a speech model that may still be loaded: the app's own exit then ends the process at once.
pub fn set_hard() { HARD.store(true, Ordering::SeqCst); }
pub fn hard() -> bool { HARD.load(Ordering::SeqCst) }
/// The quit's steps run once: an update or Delete everything runs them first, and the app's own exit after it then has
/// nothing left to do.
pub fn first() -> bool { !DONE.swap(true, Ordering::SeqCst) }

static RESTARTING: AtomicBool = AtomicBool::new(false);
/// An update was installed and the app is about to restart (must fix 22).
pub fn set_restarting() { RESTARTING.store(true, Ordering::SeqCst); }
pub fn restarting() -> bool { RESTARTING.load(Ordering::SeqCst) }

/// How the app's own exit ends the process.
#[derive(Debug, PartialEq, Eq)]
pub enum Ending {
    /// The usual way: Tauri's clean up runs, and on an update Tauri starts the new copy itself.
    Usual,
    /// At once, without the clean up at exit (a speech model may still be loaded).
    AtOnce,
    /// Must fix 22: an update restart where a speech model may still be loaded. Tauri starts the new copy only after the
    /// exit handler returns, which `_exit` never does, so the new copy is started here first. It waits for this copy's
    /// one copy lock (instance.rs), which macOS lets go the moment this process ends.
    RelaunchThenAtOnce,
}
pub fn ending(hard: bool, restarting: bool) -> Ending {
    match (hard, restarting) { (false, _) => Ending::Usual, (true, false) => Ending::AtOnce, (true, true) => Ending::RelaunchThenAtOnce }
}

/// What starts the new copy. Inside an app bundle, `open -n` on the bundle: macOS starts a fresh copy from the bundle
/// as it now is (the update may have renamed the program inside it), and -n stops it only bringing this copy forward.
/// Outside a bundle (a build run by hand), the program itself.
pub fn relaunch_command(binary: &std::path::Path) -> (std::path::PathBuf, Vec<std::ffi::OsString>) {
    let bundle = binary.parent().filter(|d| d.ends_with("Contents/MacOS")).and_then(|d| d.parent()).and_then(|c| c.parent()).filter(|b| b.extension().is_some_and(|e| e == "app"));
    match bundle {
        Some(b) => ("/usr/bin/open".into(), vec!["-n".into(), b.as_os_str().to_owned()]),
        None => (binary.to_path_buf(), vec![]),
    }
}

/// The steps of a quit, in order: the speech models go first (`voice_quit`, true when none is left loaded), then the quit is
/// written down, then what is still running ends (`others`), and last the engine shuts down. Returns true when the process
/// must end at once, without the clean up at exit, because a speech model may still be loaded.
pub fn exit_steps(from: &str, voice_quit: impl FnOnce() -> bool, others: impl FnOnce(), shut_down: impl FnOnce(), log: &mut dyn FnMut(&str, Value)) -> bool {
    let clean = voice_quit();
    log("app_quit", json!({ "from": from, "voice": if clean { "closed" } else { "not_answered" } }));
    others();
    shut_down();
    !clean
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn a_quit_lets_the_speech_models_go_before_the_engine_shuts_down_and_says_where_it_came_from() {
        let order = RefCell::new(Vec::<String>::new());
        let mut logged = Vec::new();
        let hard = exit_steps(MENU, || { order.borrow_mut().push("voice".into()); true }, || order.borrow_mut().push("others".into()), || order.borrow_mut().push("engine".into()), &mut |e, x| { order.borrow_mut().push(e.into()); logged.push(x); });
        assert_eq!(*order.borrow(), ["voice", "app_quit", "others", "engine"]);
        assert_eq!(logged[0], json!({ "from": "menu", "voice": "closed" }));
        assert!(!hard, "a clean quit runs the usual clean up");
    }
    #[test]
    fn when_the_worker_does_not_answer_the_process_ends_at_once_but_only_after_the_engine_shut_down() {
        let order = RefCell::new(Vec::<&str>::new());
        let mut logged = Vec::new();
        let hard = exit_steps(UPDATE, || { order.borrow_mut().push("voice"); false }, || {}, || order.borrow_mut().push("engine"), &mut |_, x| logged.push(x));
        assert!(hard);
        assert_eq!(*order.borrow(), ["voice", "engine"]);
        assert_eq!(logged[0]["voice"], "not_answered");
        assert_eq!(logged[0]["from"], "update");
    }
    #[test]
    fn the_app_runs_these_steps_on_every_way_out() {
        let main = crate::main_src();
        // The app's own exit, the menu's Quit, an update's restart and Delete everything.
        let exit = main.split("RunEvent::Exit =>").nth(1).expect("the exit handler").split("RunEvent::Reopen").next().unwrap();
        assert!(exit.contains("quit_now(app, quit::from(), quit::VOICE_WAIT)"), "{exit}");
        assert!(exit.contains("quit::Ending::AtOnce => unsafe { libc::_exit(0) }"), "{exit}");
        assert!(exit.find("quit_now(").unwrap() < exit.find("libc::_exit").unwrap(), "{exit}");
        assert!(main.contains("\"quit\" => { quit::mark(quit::MENU); app.exit(0) }"));
        let update = main.split("async fn install_update").nth(1).unwrap().split("app.restart();").next().unwrap();
        assert!(update.contains("quit::mark(quit::UPDATE)") && update.contains("quit_now(&a, quit::UPDATE, quit::VOICE_WAIT_UPDATE)"), "{update}");
        let wipe = main.split("helper.arg(\"--wipe-everything\")").nth(1).unwrap().split("app.exit(0);").next().unwrap();
        assert!(wipe.contains("quit::mark(quit::WIPE)") && wipe.contains("quit_now(&a, quit::WIPE, quit::VOICE_WAIT)"), "{wipe}");
        // quit_now runs the steps once and remembers when the process must end at once.
        let now = main.split("fn quit_now(").nth(1).expect("quit_now").split("\n}").next().unwrap();
        assert!(now.contains("quit::first()") && now.contains("quit::exit_steps(") && now.contains("voice_quit(wait)") && now.contains("quit::set_hard()"), "{now}");
        // The worker lets both models go and answers whether any is still loading.
        let worker = main.split("fn voice_worker").nth(1).unwrap();
        let quit_arm = worker.split("Ok(VoiceMsg::Quit(ack)) =>").nth(1).expect("the worker answers Quit").split("Ok(VoiceMsg::").next().unwrap();
        assert!(quit_arm.contains("drop(speech.take())") && quit_arm.contains("= None;") && quit_arm.contains("ack.send(") && quit_arm.contains("break"), "{quit_arm}");
    }
    #[test]
    fn an_update_restart_that_must_end_at_once_starts_the_new_copy_first() {
        // Must fix 22: Tauri starts the new copy only after the exit handler returns, so `_exit` there would leave the
        // person with an updated app that never came back.
        assert_eq!(ending(false, false), Ending::Usual);
        assert_eq!(ending(false, true), Ending::Usual, "a clean restart is Tauri's own");
        assert_eq!(ending(true, false), Ending::AtOnce);
        assert_eq!(ending(true, true), Ending::RelaunchThenAtOnce);
    }
    #[test]
    fn the_new_copy_is_opened_as_a_fresh_app_not_handed_to_the_running_one() {
        let b = std::path::Path::new("/Applications/Squibby.app/Contents/MacOS/squibby");
        let (prog, args) = relaunch_command(b);
        assert_eq!(prog, std::path::PathBuf::from("/usr/bin/open"));
        // -n: without it macOS would only bring the copy that is quitting to the front.
        assert_eq!(args, vec![std::ffi::OsString::from("-n"), "/Applications/Squibby.app".into()]);
        // A build run outside an app bundle starts the program itself.
        let dev = std::path::Path::new("/tmp/target/debug/squibby");
        assert_eq!(relaunch_command(dev), (dev.to_path_buf(), vec![]));
    }
    #[test]
    fn the_exit_handler_relaunches_before_ending_at_once_on_an_update() {
        let main = crate::main_src();
        let exit = main.split("RunEvent::Exit =>").nth(1).expect("the exit handler").split("RunEvent::Reopen").next().unwrap();
        assert!(exit.contains("quit::ending(quit::hard(), quit::restarting())"), "{exit}");
        assert!(exit.contains("relaunch_now(app)"), "{exit}");
        assert!(exit.find("relaunch_now(app)").unwrap() < exit.rfind("libc::_exit").unwrap(), "{exit}");
        let update = main.split("async fn install_update").nth(1).unwrap().split("app.restart();").next().unwrap();
        assert!(update.contains("quit::set_restarting()"), "{update}");
    }
    #[test]
    fn the_first_source_named_wins_and_the_steps_run_once() {
        // FROM and DONE are the process's own: this is the only test that touches them.
        assert_eq!(from(), SYSTEM);
        mark(UPDATE); mark(MENU);
        assert_eq!(from(), UPDATE);
        assert!(first());
        assert!(!first());
    }
}
