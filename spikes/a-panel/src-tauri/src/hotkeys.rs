//! Global hotkeys through tauri-plugin-global-shortcut (Carbon RegisterEventHotKey:
//! no Accessibility or Input Monitoring permission). All are Ctrl+Option+Cmd plus a
//! letter. No media keys (those would need an event tap).

use crate::log::ev;
use serde_json::json;
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{Builder, Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MODS: Modifiers = Modifiers::CONTROL.union(Modifiers::ALT).union(Modifiers::SUPER);

const KEYS: [(&str, Code, &str); 6] = [
    ("P", Code::KeyP, "next_preset"),
    ("D", Code::KeyD, "toggle_dock"),
    ("K", Code::KeyK, "type"),
    ("R", Code::KeyR, "mark_segment"),
    ("M", Code::KeyM, "next_display"),
    ("C", Code::KeyC, "toggle_compact"),
];

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            for (id, code, action) in KEYS {
                if shortcut.matches(MODS, code) {
                    ev("hotkey", json!({ "id": id, "action": action }));
                    if let Some(a) = crate::state::app() {
                        dispatch(a, action);
                    }
                    let _ = app;
                }
            }
        })
        .build()
}

pub fn register(app: &AppHandle) {
    for (id, code, action) in KEYS {
        let res = app.global_shortcut().register(Shortcut::new(Some(MODS), code));
        ev(
            "hotkey_registered",
            json!({ "id": id, "combo": format!("Ctrl+Option+Cmd+{id}"), "action": action,
                    "ok": res.is_ok(), "err": res.err().map(|e| e.to_string()) }),
        );
    }
}

fn dispatch(app: &AppHandle, action: &str) {
    match action {
        "next_preset" => {
            let next = crate::state::with(|s| (s.preset + 1) % crate::presets::COUNT);
            let a = app.clone();
            crate::appkit::on_main(app, move || crate::presets::apply(&a, next));
        }
        "toggle_dock" => crate::focus::toggle_dock(app, "hotkey"),
        "type" => crate::focus::open_card(app, "hotkey"),
        "mark_segment" => {
            let n = crate::state::with(|s| {
                s.mark += 1;
                s.char_clicks = 0;
                s.mark
            });
            ev("mark", json!({ "n": n }));
        }
        "next_display" => {
            let a = app.clone();
            crate::appkit::on_main(app, move || crate::docking::move_to_next_display(&a));
        }
        "toggle_compact" => {
            let a = app.clone();
            crate::appkit::on_main(app, move || crate::docking::toggle_compact(&a));
        }
        _ => {}
    }
}
