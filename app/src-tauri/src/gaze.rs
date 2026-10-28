//! Follow my pointer (M20, character.follow): the character's eyes and body lean toward the pointer anywhere on the screen.
//! While the character is in view and the setting is not Off, the shell reads where the pointer is a few times a second
//! (macos_see::pointer, Core Graphics: the place only, no permission, never what is on the screen) and tells the character's
//! page how far it is from the middle of its window, only when it moved. Nothing is kept.

/// How often the pointer's place is read while the character is in view (milliseconds).
pub const POLL_MS: u64 = 50;
/// The least move, in points, worth telling the page about.
pub const MOVED: f64 = 1.5;

/// Whether the character follows the pointer at all: Its eyes and A drop of water do, Off does not. Anything else
/// (nothing set yet) is the usual, Its eyes.
pub fn follows(v: &serde_json::Value) -> bool { v.as_str() != Some("off") }

/// The pointer's place from the middle of the character's window (global top left points, y down).
pub fn relative(pointer: (f64, f64), frame: [f64; 4]) -> (f64, f64) {
    (pointer.0 - (frame[0] + frame[2] / 2.0), pointer.1 - (frame[1] + frame[3] / 2.0))
}

/// Whether a new place is worth sending: the first one, or one that moved at least `MOVED` points.
pub fn worth_sending(last: Option<(f64, f64)>, now: (f64, f64)) -> bool {
    last.map_or(true, |l| (l.0 - now.0).hypot(l.1 - now.1) >= MOVED)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn off_is_the_only_choice_that_does_not_follow() {
        assert!(follows(&json!("eyes")));
        assert!(follows(&json!("drop")));
        assert!(follows(&serde_json::Value::Null));
        assert!(!follows(&json!("off")));
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

    #[test]
    fn the_shell_reads_only_while_in_view_and_never_keeps_it() {
        let main = include_str!("main.rs");
        let body = &main[main.find("fn gaze_tick(").unwrap()..];
        let body = &body[..body.find("\n}\n").unwrap()];
        assert!(body.contains("gaze::follows(&setting_now(\"character.follow\"))"));
        assert!(body.contains("peek::Pose::Hidden"));
        assert!(body.contains("macos_see::pointer()"));
        assert!(body.contains("emit_to(\"dock\", \"gaze\""));
        assert!(!body.contains("log("), "the pointer's place is never written down");
    }
}
