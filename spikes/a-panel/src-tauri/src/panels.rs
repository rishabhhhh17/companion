//! The panel classes and how windows become panels. One `tauri_panel!` call
//! per module (the macro inserts `use` lines).
//!
//! Recipe rules from the research (each one a trap if missed):
//! - build the window hidden and unfocused, convert, then show only with
//!   `panel.show()` (orderFrontRegardless). Tauri's `window.show()` calls
//!   makeKeyAndOrderFront and would take the keyboard;
//! - `add_style_mask` (not `set_style_mask`) keeps Tauri's own flags;
//! - the event handler replaces Tauri's window delegate, so frames come from
//!   our own windowDidMove handler.

use crate::config::{Config, Mode};
use objc2_app_kit::NSWindowStyleMask;
use serde_json::json;
use std::sync::atomic::{AtomicIsize, Ordering};
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_nspanel::{tauri_panel, PanelHandle, StyleMask, WebviewWindowExt};

tauri_panel! {
    panel!(DockPanelA {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            becomes_key_only_if_needed: true,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })

    panel!(DockPanelB {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            becomes_key_only_if_needed: true,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })

    panel!(CardPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            becomes_key_only_if_needed: true,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })

    panel_event!(PanelEvents {
        window_did_become_key(notification: &NSNotification) -> (),
        window_did_resign_key(notification: &NSNotification) -> (),
        window_did_move(notification: &NSNotification) -> (),
        window_did_resize(notification: &NSNotification) -> (),
        window_did_change_occlusion_state(notification: &NSNotification) -> ()
    })
}

pub static DOCK_WIN: AtomicIsize = AtomicIsize::new(-1);
pub static CARD_WIN: AtomicIsize = AtomicIsize::new(-1);

pub const DOCK_SIZE: (f64, f64) = (260.0, 220.0);
pub const COMPACT_SIZE: (f64, f64) = (56.0, 56.0);
pub const CARD_SIZE: (f64, f64) = (320.0, 120.0);

fn build_window(
    app: &AppHandle,
    label: &str,
    page: &str,
    size: (f64, f64),
    afm: bool,
) -> tauri::Result<tauri::WebviewWindow> {
    let w = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title("Panel Spike")
        .inner_size(size.0, size.1)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .accept_first_mouse(afm)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .build()?;
    // wry 0.57 calls NSApplication::activate() every time it builds a webview
    // (wkwebview/mod.rs). Log the state right after, so a launch activation can
    // be traced to this rather than to the panel recipe.
    crate::log::ev(
        "webview_built",
        json!({ "label": label, "app_active": crate::appkit::app_is_active(), "front": crate::appkit::front_app() }),
    );
    Ok(w)
}

fn finish(app: &AppHandle, panel: &PanelHandle<tauri::Wry>, label: &str, class: &str, afm: bool) {
    let style_res = panel.add_style_mask(StyleMask::empty().nonactivating_panel().into());
    let ns = panel.as_panel();
    let raw = ns.styleMask();
    crate::log::ev(
        "panel_created",
        json!({
            "label": label, "class": class,
            "cbk": panel.can_become_key_window(),
            "bkoin": panel.becomes_key_only_if_needed(),
            "float": panel.is_floating_panel(),
            "hod": panel.hides_on_deactivate(),
            "style_raw": raw.bits(),
            "nonactivating": raw.contains(NSWindowStyleMask::NonactivatingPanel),
            "style_ok": style_res.is_ok(),
            "afm": afm,
        }),
    );
    let num = ns.windowNumber();
    match label {
        "dock" => DOCK_WIN.store(num, Ordering::SeqCst),
        _ => CARD_WIN.store(num, Ordering::SeqCst),
    }
    attach_events(app, panel, label);
}

fn attach_events(_app: &AppHandle, panel: &PanelHandle<tauri::Wry>, label: &str) {
    let h = PanelEvents::new();
    let l = label.to_string();
    h.window_did_become_key(move |_| crate::focus::on_became_key(&l));
    let l = label.to_string();
    h.window_did_resign_key(move |_| crate::focus::on_resigned_key(&l));
    let l = label.to_string();
    h.window_did_move(move |_| crate::docking::on_moved(&l, "did_move"));
    let l = label.to_string();
    h.window_did_resize(move |_| crate::docking::on_moved(&l, "did_resize"));
    let l = label.to_string();
    h.window_did_change_occlusion_state(move |_| crate::observers::on_occlusion(&l));
    panel.set_event_handler(Some(h.as_ref()));
}

pub fn create_dock(app: &AppHandle, cfg: &Config) -> tauri::Result<()> {
    let w = build_window(app, "dock", "dock.html", DOCK_SIZE, cfg.afm)?;
    let (panel, class) = match cfg.mode {
        Mode::A => (w.to_panel::<DockPanelA>()?, "DockPanelA"),
        Mode::B => (w.to_panel::<DockPanelB>()?, "DockPanelB"),
    };
    finish(app, &panel, "dock", class, cfg.afm);
    Ok(())
}

pub fn create_card(app: &AppHandle, cfg: &Config) -> tauri::Result<()> {
    let w = build_window(app, "card", "card.html", CARD_SIZE, cfg.afm)?;
    let panel = w.to_panel::<CardPanel>()?;
    finish(app, &panel, "card", "CardPanel", cfg.afm);
    Ok(())
}
