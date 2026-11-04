//! M66: a light tap on the trackpad as the notch opens (the plan, Part 2 "Open", frame 0). Off unless the person turns it on
//! (island.haptics, like sounds: rule 16), and only when the notch opens under their own click or pointing, never for
//! anything that opens by itself, a key or the menu. macOS plays it only on a Force Touch trackpad with a finger on it.

/// The setting (protocol/settings.json).
pub const KEY: &str = "island.haptics";

/// The ways Home opens that are the person's own pointer on the notch or the character (main.rs open_card sources).
const POINTER_OPENS: [&str; 3] = ["island", "point", "character"];

/// Does this opening tap the trackpad? `on`: the setting as kept (anything but true is off); `source`: how Home opened;
/// `was_open`: Home was already up, so nothing new opened.
pub fn ticks(on: &serde_json::Value, source: &str, was_open: bool) -> bool {
    on.as_bool() == Some(true) && !was_open && POINTER_OPENS.contains(&source)
}

/// One light tap, now. Main thread. Touches no window and takes no focus.
pub fn tick() {
    use objc2_app_kit::{NSHapticFeedbackManager, NSHapticFeedbackPattern, NSHapticFeedbackPerformanceTime, NSHapticFeedbackPerformer};
    NSHapticFeedbackManager::defaultPerformer().performFeedbackPattern_performanceTime(NSHapticFeedbackPattern::Generic, NSHapticFeedbackPerformanceTime::Now);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_when_turned_on_and_only_for_the_persons_own_pointer() {
        for s in POINTER_OPENS { assert!(ticks(&json!(true), s, false), "{s}"); }
        // Off, or a value that is not a plain yes: never.
        for v in [json!(false), json!(null), json!("true"), json!(1)] { for s in POINTER_OPENS { assert!(!ticks(&v, s, false), "{v} {s}"); } }
        // Anything that opens by itself, by a key, the menu or a drop: never (rule 16, only the person's own pointer).
        for s in ["hotkey", "menu", "button", "first_run", "drop", "drop_project", "reopen", "prompt_help", "second_look", ""] { assert!(!ticks(&json!(true), s, false), "{s}"); }
        // Home already open: nothing new opened.
        assert!(!ticks(&json!(true), "island", true));
    }
    #[test]
    fn the_setting_is_off_by_default_and_the_shells() {
        let d = crate::settings::registry().get(KEY).expect("island.haptics is in the registry");
        assert!(d.applies_to("shell") && d.store == "settings" && !d.project);
        assert_eq!(d.default, json!(false));
    }
    #[test]
    fn main_taps_once_as_a_new_opening_starts_never_in_a_loop() {
        let main = include_str!("main.rs");
        let at = main.find("fn open_card_then(").expect("open_card_then");
        let body = &main[at..at + main[at..].find("\n}\n").unwrap()];
        assert!(body.contains("if haptic::ticks(&setting_now(haptic::KEY), &src, was_open) { haptic::tick(); }"), "{body}");
        assert_eq!(main.matches("haptic::tick()").count(), 1, "one place taps");
        assert!(main.contains("mod haptic;"));
    }
}
