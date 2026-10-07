//! Witnesses. None of these needs a privacy permission:
//! - NSApplication active or resigned (the failure signal: we must never become active);
//! - NSWorkspace front app changes and Space changes;
//! - a LOCAL mouse down monitor, which only sees clicks on our own windows.
//!   Never a global monitor and never key events (AGENTS.md rule 8).

use crate::appkit::{app_is_active, front_app, front_bid};
use crate::log::ev;
use crate::panels::{CARD_WIN, DOCK_WIN};
use crate::state;
use block2::RcBlock;
use objc2_app_kit::{
    NSApplicationDidBecomeActiveNotification, NSApplicationDidChangeScreenParametersNotification,
    NSApplicationDidResignActiveNotification, NSEvent, NSEventMask, NSWindowOcclusionState, NSWorkspace,
    NSWorkspaceActiveSpaceDidChangeNotification, NSWorkspaceDidActivateApplicationNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSNotificationName};
use serde_json::json;
use std::ptr::NonNull;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_nspanel::ManagerExt;

fn observe(center: &NSNotificationCenter, name: &NSNotificationName, f: impl Fn(&NSNotification) + 'static) {
    let block = RcBlock::new(move |n: NonNull<NSNotification>| f(unsafe { n.as_ref() }));
    let token = unsafe { center.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block) };
    // The observers live for the whole process.
    std::mem::forget(token);
}

/// Install before Tauri starts, so an activation at launch is caught.
pub fn install_early() {
    let center = NSNotificationCenter::defaultCenter();
    unsafe {
        observe(&center, NSApplicationDidBecomeActiveNotification, |_| {
            ev("app_became_active", json!({ "front": front_app() }))
        });
        observe(&center, NSApplicationDidResignActiveNotification, |_| {
            ev("app_resigned_active", json!({ "front": front_app() }))
        });
        observe(&center, NSApplicationDidChangeScreenParametersNotification, |_| {
            if let Some(app) = state::app() {
                crate::docking::check(app, "notification");
            }
        });
    }
    let ws = NSWorkspace::sharedWorkspace().notificationCenter();
    unsafe {
        observe(&ws, NSWorkspaceDidActivateApplicationNotification, |_| {
            let bid = front_bid();
            let from = state::with(|s| std::mem::replace(&mut s.last_front, bid));
            ev("front_app_changed", json!({ "from": from, "to": front_app(), "via": "notify" }));
        });
        observe(&ws, NSWorkspaceActiveSpaceDidChangeNotification, |_| on_space_changed());
    }
}

fn panel_sample(app: &AppHandle, label: &str) -> Option<serde_json::Value> {
    let p = app.get_webview_panel(label).ok()?;
    let ns = p.as_panel();
    Some(json!({
        "label": label,
        "visible": ns.isVisible(),
        "on_active_space": ns.isOnActiveSpace(),
        "occl_visible": ns.occlusionState().contains(NSWindowOcclusionState::Visible),
        "key": ns.isKeyWindow(),
        "level": ns.level() as i64,
        "frame": crate::docking::panel_frame(app, label),
    }))
}

fn on_space_changed() {
    ev("space_changed", json!({ "front": front_app() }));
    let Some(app) = state::app().cloned() else { return };
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(700));
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            for label in ["dock", "card"] {
                if let Some(s) = panel_sample(&a, label) {
                    ev("space_sample", json!({ "sample": s, "front": front_app() }));
                }
            }
            let (reapply, preset) = state::with(|s| (s.cfg.reapply_on_space, s.preset));
            if reapply {
                crate::presets::apply(&a, preset);
            }
        });
    });
}

pub fn on_occlusion(label: &str) {
    let Some(app) = state::app() else { return };
    if let Ok(p) = app.get_webview_panel(label) {
        let visible = p.as_panel().occlusionState().contains(NSWindowOcclusionState::Visible);
        ev("occlusion_changed", json!({ "label": label, "visible": visible }));
    }
}

/// Local monitor: sees only mouse downs delivered to our own windows. Gives a
/// native ground truth to compare with the webview's own click events.
pub fn install_mouse_monitor() {
    let block = RcBlock::new(|e: NonNull<NSEvent>| -> *mut NSEvent {
        let ev_ref = unsafe { e.as_ref() };
        let wn = ev_ref.windowNumber();
        let label = if wn == DOCK_WIN.load(Ordering::SeqCst) {
            "dock"
        } else if wn == CARD_WIN.load(Ordering::SeqCst) {
            "card"
        } else {
            "other"
        };
        let key_before = state::app()
            .and_then(|a| a.get_webview_panel(label).ok())
            .map(|p| p.as_panel().isKeyWindow());
        ev("native_mousedown", json!({ "label": label, "key_before": key_before, "app_active": app_is_active() }));
        e.as_ptr()
    });
    let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown, &block) };
    std::mem::forget(monitor);
}

fn state_dto(app: &AppHandle) -> serde_json::Value {
    let dock_key = app.get_webview_panel("dock").ok().map(|p| p.as_panel().isKeyWindow());
    let card_key = app.get_webview_panel("card").ok().map(|p| p.as_panel().isKeyWindow());
    let (cfg, clicks, preset, compact, card_open, mark) =
        state::with(|s| (s.cfg.clone(), s.char_clicks, s.preset, s.compact, s.card_open, s.mark));
    json!({
        "mode": cfg.mode, "afm": cfg.afm, "preset": preset, "preset_desc": crate::presets::describe(preset),
        "clicks": clicks, "dock_key": dock_key, "card_key": card_key, "front": front_app(),
        "app_active": app_is_active(), "compact": compact, "card_open": card_open, "mark": mark,
        "screens": crate::appkit::screens().len(),
    })
}

pub fn get_state(app: &AppHandle) -> serde_json::Value {
    state_dto(app)
}

fn tick(app: &AppHandle) {
    let bid = front_bid();
    let changed = state::with(|s| {
        if s.last_front != bid {
            Some(std::mem::replace(&mut s.last_front, bid.clone()))
        } else {
            None
        }
    });
    if let Some(from) = changed {
        ev("front_app_changed", json!({ "from": from, "to": front_app(), "via": "poll" }));
    }
    crate::docking::check(app, "poll");
    crate::docking::check_timeout(app);
    let dto = state_dto(app);
    let _ = app.emit_to("dock", "state", dto.clone());
    let _ = app.emit_to("card", "state", dto);
}

pub fn start_poller(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let a = app.clone();
        let _ = app.run_on_main_thread(move || tick(&a));
    });
}
