//! Who has the keyboard. The whole spike is about this file.
//!
//! Never call `window.show()`, `set_focus()`, `maximize()`, `set_fullscreen()`,
//! `show_and_make_key()` or makeKeyAndOrderFront on a panel. `scripts/lint-forbidden.sh`
//! checks.

use crate::appkit::{app_is_active, front_app, on_main};
use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSWindow};
use crate::config::Mode;
use crate::log::{ev, now_ms};
use crate::state;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tauri_nspanel::ManagerExt;

fn is_key(app: &AppHandle, label: &str) -> Option<bool> {
    app.get_webview_panel(label).ok().map(|p| p.as_panel().isKeyWindow())
}

/// The stronger test: is this panel NSApp.keyWindow? A direct resignKeyWindow
/// can clear isKeyWindow without moving NSApp's key window, so keystrokes would
/// still go to the panel. Main thread only.
fn app_key_is(app: &AppHandle, label: &str) -> Option<bool> {
    let mtm = MainThreadMarker::new()?;
    let p = app.get_webview_panel(label).ok()?;
    let me: &NSWindow = p.as_panel();
    let kw = NSApplication::sharedApplication(mtm).keyWindow();
    Some(kw.map(|k| std::ptr::eq(&*k, me)).unwrap_or(false))
}

fn holds_keyboard(app: &AppHandle, label: &str) -> bool {
    is_key(app, label).unwrap_or(false) || app_key_is(app, label).unwrap_or(false)
}

pub fn on_became_key(label: &str) {
    let since = state::with(|s| s.last_key_request_ms.map(|t| (now_ms().saturating_sub(t)) as u64));
    ev(
        "became_key",
        json!({ "label": label, "front": front_app(), "app_active": app_is_active(), "since_key_request_ms": since }),
    );
}

pub fn on_resigned_key(label: &str) {
    ev("resigned_key", json!({ "label": label, "front": front_app(), "app_active": app_is_active() }));
}

/// Mode A only: let the dock's text box take typing.
pub fn request_key(app: &AppHandle, label: &str, source: &str) {
    let (mode, visible, compact, card_open) = state::with(|s| (s.cfg.mode, s.dock_visible, s.compact, s.card_open));
    let refuse = if label == "dock" && mode == Mode::B {
        Some("mode_b_dock_never_key")
    } else if label == "dock" && (!visible || compact) {
        Some("dock_hidden_or_compact")
    } else if label == "card" && !card_open {
        Some("card_not_open")
    } else {
        None
    };
    if let Some(why) = refuse {
        ev("key_request_refused", json!({ "label": label, "source": source, "why": why }));
        return;
    }
    state::with(|s| s.last_key_request_ms = Some(now_ms()));
    ev("key_requested", json!({ "label": label, "source": source }));
    let a = app.clone();
    let l = label.to_string();
    on_main(app, move || {
        if let Ok(p) = a.get_webview_panel(&l) {
            p.make_key_window();
        }
    });
}

/// Esc: hand the keyboard back. `resignKeyWindow` is documented as a hook apps
/// should not call directly, so check on the next tick and fall back to
/// hide then show (orderOut, orderFrontRegardless), which always drops key.
pub fn release_key(app: &AppHandle, label: &str, reason: &str, len: Option<u32>) {
    let a = app.clone();
    let l = label.to_string();
    let r = reason.to_string();
    on_main(app, move || {
        if let Ok(p) = a.get_webview_panel(&l) {
            p.resign_key_window();
        }
        let a2 = a.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(60));
            let a3 = a2.clone();
            let _ = a2.run_on_main_thread(move || {
                let is_key_after = is_key(&a3, &l);
                let app_key_after = app_key_is(&a3, &l);
                let still = holds_keyboard(&a3, &l);
                let mut fallback = false;
                if still {
                    if let Ok(p) = a3.get_webview_panel(&l) {
                        p.hide();
                        p.show();
                        fallback = true;
                    }
                }
                ev(
                    "key_release",
                    json!({ "label": l, "reason": r, "len": len, "still_key_after": still,
                            "is_key_after": is_key_after, "app_key_window_after": app_key_after,
                            "fallback_used": fallback, "key_after_fallback": holds_keyboard(&a3, &l),
                            "app_active": app_is_active() }),
                );
            });
        });
    });
}

/// Mode B: show the card next to the dock and let it take typing.
pub fn open_card(app: &AppHandle, source: &str) {
    if state::with(|s| s.cfg.mode) != Mode::B {
        // In Mode A the "type" hotkey targets the dock's own text box instead.
        request_key(app, "dock", source);
        let _ = app.emit_to("dock", "focus-textbox", ());
        return;
    }
    state::with(|s| {
        s.last_key_request_ms = Some(now_ms());
        s.card_open = true;
    });
    ev("card_opened", json!({ "source": source }));
    let a = app.clone();
    on_main(app, move || {
        crate::docking::place_card(&a);
        if let Ok(p) = a.get_webview_panel("card") {
            p.show();
            p.make_key_window();
        }
        let _ = a.emit_to("card", "card-opened", ());
    });
}

pub fn close_card(app: &AppHandle, reason: &str, len: Option<u32>) {
    state::with(|s| s.card_open = false);
    ev("card_closed", json!({ "reason": reason, "len": len }));
    let a = app.clone();
    on_main(app, move || {
        if let Ok(p) = a.get_webview_panel("card") {
            // orderOut drops key status; no direct resignKeyWindow (Apple: don't call it).
            p.hide();
        }
        let a2 = a.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(60));
            let a3 = a2.clone();
            let _ = a2.run_on_main_thread(move || {
                ev(
                    "card_close_check",
                    json!({ "key_after": is_key(&a3, "card"), "app_key_window": app_key_is(&a3, "card"),
                            "app_active": app_is_active() }),
                );
            });
        });
    });
}

pub fn toggle_dock(app: &AppHandle, source: &str) {
    let show = state::with(|s| {
        s.dock_visible = !s.dock_visible;
        s.dock_visible
    });
    ev(if show { "panel_shown" } else { "panel_hidden" }, json!({ "label": "dock", "source": source }));
    let a = app.clone();
    on_main(app, move || {
        if let Ok(p) = a.get_webview_panel("dock") {
            if show {
                p.show();
            } else {
                p.hide();
                if let Ok(c) = a.get_webview_panel("card") {
                    c.hide();
                }
            }
        }
    });
}
