//! Window level by Space behaviour presets. Index = level * 3 + behaviour.
//!
//! Levels are raw numbers on purpose: tauri-nspanel's `PanelLevel::Floating`
//! is 4, but AppKit's NSFloatingWindowLevel is 3.
//! Apple: at most one of Primary, Auxiliary or CanJoinAllApplications (the
//! Stage Manager flags), so B = A plus CanJoinAllApplications is allowed.

use objc2_app_kit::NSWindowCollectionBehavior as B;
use serde_json::json;
use std::panic::AssertUnwindSafe;
use tauri::AppHandle;
use tauri_nspanel::ManagerExt;

pub const LEVELS: [(i64, &str); 3] = [(3, "floating"), (25, "status"), (1000, "screen_saver")];
pub const COUNT: usize = 9;

pub fn behavior(i: usize) -> (B, &'static str) {
    let a = B::CanJoinAllSpaces | B::FullScreenAuxiliary | B::Stationary | B::IgnoresCycle;
    match i % 3 {
        0 => (a, "A_all_spaces"),
        1 => (a | B::CanJoinAllApplications, "B_all_spaces_all_apps"),
        _ => (B::MoveToActiveSpace | B::FullScreenAuxiliary | B::IgnoresCycle, "C_move_to_active_space"),
    }
}

pub fn describe(idx: usize) -> String {
    let (lvl, lname) = LEVELS[(idx / 3) % 3];
    let (_, bname) = behavior(idx);
    format!("{idx}: level {lvl} {lname}, {bname}")
}

/// Apply a preset to every panel that exists. Main thread only.
pub fn apply(app: &AppHandle, idx: usize) {
    let idx = idx % COUNT;
    let (level, lname) = LEVELS[idx / 3];
    let (beh, bname) = behavior(idx);
    for label in ["dock", "card"] {
        let Ok(p) = app.get_webview_panel(label) else { continue };
        p.set_level(level);
        let res = objc2::exception::catch(AssertUnwindSafe(|| p.set_collection_behavior(beh)));
        let ns = p.as_panel();
        let rb_level = ns.level() as i64;
        let rb_beh = ns.collectionBehavior().bits();
        let visible = ns.isVisible();
        if visible {
            // Re-order it on the current Space without making it key.
            p.show();
        }
        crate::log::ev(
            "preset_applied",
            json!({
                "label": label, "idx": idx, "level_req": level, "level_name": lname, "level_rb": rb_level,
                "beh_name": bname, "beh_req": beh.bits(), "beh_rb": rb_beh,
                "exception": res.is_err(), "visible": visible,
            }),
        );
    }
    crate::state::with(|s| s.preset = idx);
    crate::log::set_ctx("preset", json!(idx));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nine_distinct_presets() {
        let mut seen = std::collections::HashSet::new();
        for i in 0..COUNT {
            let (lvl, _) = LEVELS[i / 3];
            let (b, _) = behavior(i);
            assert!(seen.insert((lvl, b.bits())));
        }
    }

    #[test]
    fn floating_is_appkit_three_and_b_keeps_fullscreen_auxiliary() {
        assert_eq!(LEVELS[0].0, 3);
        let (b, _) = behavior(1);
        assert!(b.contains(B::FullScreenAuxiliary));
        assert!(b.contains(B::CanJoinAllApplications));
        let (c, _) = behavior(2);
        assert!(!c.contains(B::CanJoinAllSpaces));
        assert!(c.contains(B::MoveToActiveSpace));
    }
}
