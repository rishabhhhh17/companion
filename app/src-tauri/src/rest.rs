//! M46 (F28): when the character rests. Resting, it holds still (one still frame, nothing scheduled), the eyes stop
//! following the pointer and Lively's water ring leaves the pointer. Listening and needs you still show (rule 5).
//!
//! It rests while a call or a presentation is on and Quiet during calls is on (calls.quiet; presentation.rs `quiet_with`
//! reads only the front app's id), or while the Mac is in Low Power Mode and Rest in Low Power Mode is on
//! (character.restLowPower). Only the front app's id and the power state are read, never any content (rule 7). Hidden
//! (a full screen app, or Hide in the menu bar) counts as rest for the threads too; main.rs adds that itself.

/// Whether the character rests now. `calls_quiet`: Quiet during calls is on. `quiet`: a call or presentation app is in
/// front. `rest_low_power`: Rest in Low Power Mode is on. `low_power`: the Mac is in Low Power Mode.
pub fn rest_now(calls_quiet: bool, quiet: bool, rest_low_power: bool, low_power: bool) -> bool {
    (calls_quiet && quiet) || (rest_low_power && low_power)
}

/// Rest in Low Power Mode (character.restLowPower): on unless clearly turned off.
pub fn rest_low_power_on(v: &serde_json::Value) -> bool { v.as_bool() != Some(false) }

/// Whether the Mac is in Low Power Mode (NSProcessInfo, macOS 12 and later; the NSProcessInfo feature of objc2-foundation,
/// on by default). No permission; nothing but the power state is read. Any thread.
pub fn low_power() -> bool { objc2_foundation::NSProcessInfo::processInfo().isLowPowerModeEnabled() }

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn it_rests_on_a_call_with_quiet_on_or_in_low_power_mode_with_rest_on() {
        // (calls_quiet, quiet, rest_low_power, low_power) -> rest
        let table = [
            ((false, false, false, false), false),
            ((true, false, false, false), false),
            ((true, true, false, false), true),
            ((false, true, false, false), false),
            ((false, false, true, false), false),
            ((false, false, true, true), true),
            ((false, false, false, true), false),
            ((true, true, true, true), true),
            ((false, true, false, true), false),
            ((true, false, true, true), true),
            ((true, true, false, true), true),
        ];
        for ((c, q, r, l), want) in table { assert_eq!(rest_now(c, q, r, l), want, "calls {c} quiet {q} rest {r} low power {l}"); }
    }

    #[test]
    fn rest_in_low_power_mode_is_on_unless_turned_off() {
        assert!(rest_low_power_on(&json!(true)));
        assert!(rest_low_power_on(&serde_json::Value::Null));
        assert!(!rest_low_power_on(&json!(false)));
    }

    #[test]
    fn the_power_state_can_be_read_here() {
        // Reads it on this Mac: true or false, with no prompt and nothing else read.
        let _ = low_power();
    }

    fn fn_body<'a>(main: &'a str, start: &str) -> &'a str {
        let b = &main[main.find(start).unwrap_or_else(|| panic!("{start}"))..];
        &b[..b.find("\n}\n").map(|i| i + 2).unwrap_or(b.len())]
    }

    #[test]
    fn the_shell_works_rest_out_twice_a_second_and_tells_every_live_character_only_on_a_change() {
        let main = include_str!("main.rs");
        assert!(fn_body(main, "fn tick(").contains("rest_tick(app, mtm);"));
        let t = fn_body(main, "fn rest_tick(");
        assert!(t.contains("rest::rest_now(presentation_now().quiet_on_calls, q, rest::rest_low_power_on(&setting_now(\"character.restLowPower\")), rest::low_power())"), "{t}");
        assert!(t.contains("REST.swap(rest, Ordering::SeqCst) != rest"), "only a change is told");
        assert!(t.contains("\"flowflow-rest\"") && t.contains("json!({ \"rest\": rest })"), "{t}");
        assert!(t.contains("gaze_recompute()") && t.contains("follow_wake()"));
        // A page that loads while it rests asks once.
        assert!(main.contains("fn flowflow_rest() -> bool { REST.load(Ordering::SeqCst) }"));
        // Rule 7: only the front app's id and the power state; never content.
        assert!(!t.contains("pointer()") && !t.contains("on_screen_windows"));
    }
}
