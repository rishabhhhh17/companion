//! Follow my pointer (M20, character.follow): the character's eyes and body lean toward the pointer anywhere on the screen.
//! M46 (F28): only when How lively is Lively. While the character is in view, not resting, and the setting is not Off, the
//! shell reads where the pointer is a few times a second (macos_see::pointer, Core Graphics: the place only, no
//! permission, never what is on the screen) and tells the character's page how far it is from the middle of its window,
//! only when it moved. Nothing is kept. In Still and Gentle the eyes stay ahead, so the thread that reads the pointer
//! sleeps (parks) and costs nothing until a change wakes it (main.rs gaze_wake).

/// How often the pointer's place is read while the character is in view (milliseconds).
pub const POLL_MS: u64 = 50;
/// The least move, in points, worth telling the page about.
pub const MOVED: f64 = 1.5;

/// Whether the character's eyes follow the pointer: only with How lively at Lively (character.lively), and then with Its
/// eyes or A water ring (character.follow), never with No. Nothing set (Null) is the usual one: Lively for How lively
/// (M51), so the eyes follow, and A water ring for what follows. A word it does not know is Still.
pub fn follows(follow: &serde_json::Value, lively: &serde_json::Value) -> bool {
    crate::follow::is_lively(lively) && follow.as_str() != Some("off")
}

/// What the thread that reads the pointer does next: read it again after POLL_MS while the eyes follow it, else sleep
/// until it is woken (no timer at all).
pub fn next(wanted: bool) -> crate::follow::Next { if wanted { crate::follow::Next::Tick(POLL_MS) } else { crate::follow::Next::Park } }

/// The pointer's place from the middle of the character's window (global top left points, y down).
pub fn relative(pointer: (f64, f64), frame: [f64; 4]) -> (f64, f64) {
    (pointer.0 - (frame[0] + frame[2] / 2.0), pointer.1 - (frame[1] + frame[3] / 2.0))
}

/// Whether a new place is worth sending: the first one, or one that moved at least `MOVED` points.
pub fn worth_sending(last: Option<(f64, f64)>, now: (f64, f64)) -> bool {
    last.is_none_or(|l| (l.0 - now.0).hypot(l.1 - now.1) >= MOVED)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_lively_with_its_eyes_or_the_water_ring_follows_the_pointer() {
        let null = serde_json::Value::Null;
        // How lively (Null is the usual Lively, and a word it does not know is Still) by what follows (Null is the usual
        // water ring).
        for lively in [json!("still"), json!("gentle"), json!("lively"), null.clone(), json!("calm"), json!(true)] {
            for follow in [json!("eyes"), json!("drop"), json!("off"), null.clone()] {
                let want = (lively == json!("lively") || lively.is_null()) && follow != json!("off");
                assert_eq!(follows(&follow, &lively), want, "lively {lively}, follow {follow}");
            }
        }
        assert!(follows(&null, &null), "the usual: Lively, so the eyes follow the pointer");
    }
    #[test]
    fn the_thread_reads_the_pointer_only_while_the_eyes_follow_it_and_otherwise_sleeps_with_no_timer() {
        assert_eq!(next(true), crate::follow::Next::Tick(POLL_MS));
        assert_eq!(next(false), crate::follow::Next::Park);
    }

    #[test]
    fn the_place_is_counted_from_the_middle_of_the_window() {
        assert_eq!(relative((180.0, 100.0), [100.0, 20.0, 160.0, 160.0]), (0.0, 0.0));
        assert_eq!(relative((180.0, 80.0), [100.0, 20.0, 160.0, 160.0]), (0.0, -20.0));
        assert_eq!(relative((0.0, 0.0), [100.0, 100.0, 160.0, 160.0]), (-180.0, -180.0));
    }

    #[test]
    fn only_a_real_move_is_sent() {
        assert!(worth_sending(None, (0.0, 0.0)));
        assert!(!worth_sending(Some((10.0, 10.0)), (10.5, 10.5)));
        assert!(worth_sending(Some((10.0, 10.0)), (12.0, 10.0)));
    }

    fn body<'a>(main: &'a str, start: &str) -> &'a str {
        let b = &main[main.find(start).unwrap_or_else(|| panic!("{start}"))..];
        &b[..b.find("\n}\n").map(|i| i + 2).unwrap_or(b.len())]
    }
    #[test]
    fn the_shell_reads_only_while_in_view_and_never_keeps_it() {
        let main = include_str!("main.rs");
        let tick = body(main, "fn gaze_tick(");
        assert!(tick.contains("GAZE_WANTED.load("), "nothing is read unless the eyes follow the pointer now");
        assert!(tick.contains("peek::Pose::Hidden"));
        assert!(tick.contains("macos_see::pointer()"));
        assert!(tick.contains("emit_to(\"dock\", \"gaze\""));
        assert!(!tick.contains("log("), "the pointer's place is never written down");
        // Whether it follows: the two settings, not resting, not hidden, worked out again whenever one of them changes.
        let wanted = body(main, "fn gaze_recompute(");
        assert!(wanted.contains("gaze::follows(&setting_now(\"character.follow\"), &setting_now(\"character.lively\"))"), "{wanted}");
        assert!(wanted.contains("REST.load(") && wanted.contains("companion_hidden()") && wanted.contains("gaze_wake()"), "{wanted}");
    }
    #[test]
    fn in_still_and_gentle_the_thread_sleeps_with_no_timer_and_never_asks_the_main_thread() {
        let main = include_str!("main.rs");
        let at = main.find("fn gaze_loop(").expect("the eyes' thread is its own function");
        let thread = body(main, "fn gaze_loop(");
        let (load, hop) = (thread.find("GAZE_WANTED.load(").expect("it reads whether it is wanted"), thread.find("run_on_main_thread").expect("it asks the main thread"));
        assert!(load < hop, "whether it is wanted is read before the main thread is asked");
        assert!(thread.contains("gaze::next(") && thread.contains("follow::Next::Park => std::thread::park()"), "{thread}");
        assert!(thread.contains("GAZE_THREAD.set(std::thread::current())"), "the thread can be woken from the moment it reads");
        assert!(main[..at].contains("fn gaze_wake()") || main[at..].contains("fn gaze_wake()"));
        // Every change that can make the eyes follow again wakes it: the settings, rest, hiding and showing.
        for f in ["fn home_setting_applied(", "fn set_user_hidden(", "fn rest_tick("] { assert!(body(main, f).contains("gaze_recompute()"), "{f}"); }
        let tick = body(main, "fn tick(");
        assert!(tick.matches("gaze_recompute()").count() >= 2, "hidden for a full screen app and shown again");
    }
}
