//! Keep the dock on the right edge of a display's work area (never under the
//! menu bar or the Dock), and bring it back within 2 s when displays change.
//! Geometry is in logical points with a top left origin. Main thread only,
//! except the pure functions, which are tested.

use crate::appkit::{mouse_location, screens, Screen};
use crate::log::{ev, now_ms};
use crate::panels::{CARD_SIZE, COMPACT_SIZE, DOCK_SIZE};
use crate::state::{self, DockPref, PendingRedock};
use serde_json::json;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager};
use tauri_nspanel::ManagerExt;

pub fn dock_frame(work: [f64; 4], size: (f64, f64), pct: f64) -> [f64; 4] {
    let free = (work[3] - size.1).max(0.0);
    let x = work[0] + work[2] - size.0;
    let y = work[1] + pct.clamp(0.0, 1.0) * free;
    [x, y, size.0, size.1]
}

pub fn inside(frame: [f64; 4], work: [f64; 4]) -> bool {
    let e = 1.0;
    frame[0] >= work[0] - e
        && frame[1] >= work[1] - e
        && frame[0] + frame[2] <= work[0] + work[2] + e
        && frame[1] + frame[3] <= work[1] + work[3] + e
}

pub fn close(a: [f64; 4], b: [f64; 4]) -> bool {
    a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() <= 1.0)
}

/// Which display the dock should be on, and why.
pub fn pick<'a>(list: &'a [Screen], pref: &DockPref, mouse: (f64, f64)) -> Option<(&'a Screen, &'static str)> {
    if let Some(s) = list.iter().find(|s| s.id == pref.screen_id) {
        return Some((s, "exact"));
    }
    let want = pref.screen_id.split('@').next().unwrap_or("");
    if !want.is_empty() {
        if let Some(s) = list.iter().find(|s| s.id.split('@').next() == Some(want)) {
            return Some((s, "same_size"));
        }
    }
    if let Some(s) = list.iter().find(|s| {
        mouse.0 >= s.frame[0] && mouse.0 < s.frame[0] + s.frame[2] && mouse.1 >= s.frame[1] && mouse.1 < s.frame[1] + s.frame[3]
    }) {
        return Some((s, "under_mouse"));
    }
    list.iter().find(|s| s.primary).map(|s| (s, "primary"))
}

fn pref_path() -> std::path::PathBuf {
    crate::config::data_dir().join("dock.json")
}

pub fn load_pref() {
    if let Some(p) = std::fs::read_to_string(pref_path()).ok().and_then(|s| serde_json::from_str::<DockPref>(&s).ok()) {
        state::with(|s| s.dock_pref = p);
    }
}

fn save_pref(p: &DockPref) {
    let _ = std::fs::write(pref_path(), serde_json::to_string(p).unwrap_or_default());
}

pub fn dock_size() -> (f64, f64) {
    if state::with(|s| s.compact) {
        COMPACT_SIZE
    } else {
        DOCK_SIZE
    }
}

pub fn panel_frame(app: &AppHandle, label: &str) -> Option<[f64; 4]> {
    let p = app.get_webview_panel(label).ok()?;
    let f = p.as_panel().frame();
    let primary_h = screens().first().map(|s| s.frame[3])?;
    Some([f.origin.x, primary_h - (f.origin.y + f.size.height), f.size.width, f.size.height])
}

pub fn redock(app: &AppHandle, reason: &str) {
    let list = screens();
    let mut pref = state::with(|s| s.dock_pref.clone());
    let Some((target, how)) = pick(&list, &pref, mouse_location()) else {
        ev("error", json!({ "where": "redock", "msg": "no screens" }));
        return;
    };
    if pref.screen_id.is_empty() {
        pref.screen_id = target.id.clone();
        state::with(|s| s.dock_pref = pref.clone());
        save_pref(&pref);
    }
    let size = dock_size();
    let tf = dock_frame(target.work, size, pref.offset_pct);
    state::with(|s| {
        s.pending_redock = Some(PendingRedock { target: tf, work: target.work, started_ms: now_ms(), reason: reason.into() })
    });
    ev(
        "redock_start",
        json!({ "reason": reason, "how": how, "target_screen": target.id, "target": tf,
                "work": target.work, "old": panel_frame(app, "dock") }),
    );
    if let Some(w) = app.get_webview_window("dock") {
        let _ = w.set_size(LogicalSize::new(size.0, size.1));
        let _ = w.set_position(LogicalPosition::new(tf[0], tf[1]));
    }
    check_pending(app, "immediate");
}

fn check_pending(app: &AppHandle, cause: &str) {
    let Some(p) = state::with(|s| s.pending_redock.clone()) else { return };
    if let Some(f) = panel_frame(app, "dock") {
        if close(f, p.target) {
            state::with(|s| s.pending_redock = None);
            ev(
                "redock_done",
                json!({ "reason": p.reason, "ms": now_ms().saturating_sub(p.started_ms) as u64, "frame": f, "work": p.work,
                        "inside_work": inside(f, p.work), "cause": cause }),
            );
        }
    }
}

pub fn check_timeout(app: &AppHandle) {
    let Some(p) = state::with(|s| s.pending_redock.clone()) else { return };
    if now_ms().saturating_sub(p.started_ms) > 1500 {
        state::with(|s| s.pending_redock = None);
        ev("redock_timeout", json!({ "reason": p.reason, "target": p.target, "frame": panel_frame(app, "dock") }));
    }
}

pub fn on_moved(label: &str, cause: &str) {
    let Some(app) = state::app() else { return };
    let frame = panel_frame(app, label);
    ev("frame", json!({ "label": label, "frame": frame, "cause": cause }));
    if label == "dock" {
        check_pending(app, cause);
    }
}

/// Compare the display set with the last one; redock when it changed.
pub fn check(app: &AppHandle, trigger: &str) {
    let list = screens();
    // Include the work area, so moving or resizing the macOS Dock also redocks.
    let sig = list
        .iter()
        .map(|s| format!("{}[{:.0},{:.0},{:.0},{:.0}]", s.id, s.work[0], s.work[1], s.work[2], s.work[3]))
        .collect::<Vec<_>>()
        .join("|");
    let (old, pref) = state::with(|s| (std::mem::replace(&mut s.screens_sig, sig.clone()), s.dock_pref.clone()));
    if old == sig {
        return;
    }
    let pref_missing = !list.iter().any(|s| s.id == pref.screen_id);
    ev("monitors_changed", json!({ "old": old, "new": list, "trigger": trigger, "pref_missing": pref_missing }));
    if !old.is_empty() {
        redock(app, "display_change");
    }
}

pub fn place_card(app: &AppHandle) {
    let Some(d) = panel_frame(app, "dock") else { return };
    if let Some(w) = app.get_webview_window("card") {
        let x = d[0] - CARD_SIZE.0 - 8.0;
        let _ = w.set_position(LogicalPosition::new(x, d[1]));
    }
}

pub fn move_to_next_display(app: &AppHandle) {
    let list = screens();
    if list.is_empty() {
        return;
    }
    let mut pref = state::with(|s| s.dock_pref.clone());
    let i = list.iter().position(|s| s.id == pref.screen_id).map(|i| (i + 1) % list.len()).unwrap_or(0);
    pref.screen_id = list[i].id.clone();
    state::with(|s| s.dock_pref = pref.clone());
    save_pref(&pref);
    ev("dock_pref_set", json!({ "screen_id": pref.screen_id }));
    redock(app, "hotkey_next_display");
}

pub fn toggle_compact(app: &AppHandle) {
    let c = state::with(|s| {
        s.compact = !s.compact;
        s.compact
    });
    ev("compact", json!({ "on": c }));
    let _ = app.emit_to("dock", "compact", c);
    redock(app, "compact_toggle");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scr(id: &str, frame: [f64; 4], primary: bool) -> Screen {
        Screen { id: id.into(), frame, work: frame, primary }
    }

    #[test]
    fn dock_sits_on_right_edge_inside_work_area() {
        let work = [0.0, 33.0, 1512.0, 949.0];
        let f = dock_frame(work, (260.0, 220.0), 0.4);
        assert_eq!(f[0], 1512.0 - 260.0);
        assert!(inside(f, work));
        let top = dock_frame(work, (260.0, 220.0), 0.0);
        assert_eq!(top[1], 33.0);
        let bottom = dock_frame(work, (260.0, 220.0), 1.0);
        assert!((bottom[1] + 220.0 - (33.0 + 949.0)).abs() < 1e-9);
    }

    #[test]
    fn pick_prefers_exact_then_size_then_mouse_then_primary() {
        let a = scr("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], true);
        let b = scr("1920x1080@1512,0", [1512.0, 0.0, 1920.0, 1080.0], false);
        let list = vec![a.clone(), b.clone()];
        let pref = DockPref { screen_id: b.id.clone(), offset_pct: 0.4 };
        assert_eq!(pick(&list, &pref, (10.0, 10.0)).unwrap().1, "exact");
        let moved = DockPref { screen_id: "1920x1080@-1920,0".into(), offset_pct: 0.4 };
        assert_eq!(pick(&list, &moved, (10.0, 10.0)).unwrap().0.id, b.id);
        let gone = DockPref { screen_id: "2560x1440@1512,0".into(), offset_pct: 0.4 };
        let (s, how) = pick(&list, &gone, (2000.0, 500.0)).unwrap();
        assert_eq!((s.id.as_str(), how), (b.id.as_str(), "under_mouse"));
        let only_a = vec![a.clone()];
        let (s, how) = pick(&only_a, &gone, (9999.0, 9999.0)).unwrap();
        assert_eq!((s.id.as_str(), how), (a.id.as_str(), "primary"));
    }
}
