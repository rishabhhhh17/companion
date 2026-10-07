//! Panel Spike: M0 spike (a). Throwaway code; the answer goes in RESULTS.md.
//!
//! Startup order matters:
//! 1. witnesses are installed before Tauri starts, so an activation at launch is caught;
//! 2. `activate_ignoring_other_apps(false)` (Tauri's default activates the app at launch);
//! 3. the Accessory policy is set between `build()` and `run()` (Handy found that
//!    setting it in `setup` leaves a Dock icon on macOS 26+). LSUIElement covers the bundle;
//! 4. windows are created hidden and unfocused, converted to panels, and only then
//!    shown with `panel.show()`.

mod appkit;
mod commands;
mod config;
mod docking;
mod focus;
mod hotkeys;
mod log;
mod observers;
mod panels;
mod presets;
mod state;

use serde_json::json;
use std::time::Duration;
use tauri::{AppHandle, RunEvent};
use tauri_nspanel::ManagerExt;

fn settled(app: &AppHandle, at: &str) {
    let dock = app.get_webview_panel("dock").ok();
    ev_settled(app, at, dock.as_ref().map(|p| (p.as_panel().isVisible(), p.as_panel().isKeyWindow())));
}

fn ev_settled(app: &AppHandle, at: &str, dock: Option<(bool, bool)>) {
    log::ev(
        "launch_settled",
        json!({ "at": at, "front": appkit::front_app(), "app_active": appkit::app_is_active(),
                "panel_visible": dock.map(|d| d.0), "panel_key": dock.map(|d| d.1),
                "frame": docking::panel_frame(app, "dock") }),
    );
}

fn setup(app: &AppHandle) -> tauri::Result<()> {
    let _ = state::APP.set(app.clone());
    let cfg = state::with(|s| s.cfg.clone());
    panels::create_dock(app, &cfg)?;
    if cfg.mode == config::Mode::B {
        panels::create_card(app, &cfg)?;
    }
    presets::apply(app, cfg.preset);
    docking::load_pref();
    docking::check(app, "launch");
    docking::redock(app, "launch");
    if let Ok(p) = app.get_webview_panel("dock") {
        p.show();
        log::ev("panel_shown", json!({ "label": "dock", "source": "launch" }));
    }
    observers::install_mouse_monitor();
    observers::start_poller(app.clone());
    hotkeys::register(app);
    for secs in [2u64, 5] {
        let a = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(secs));
            let b = a.clone();
            let _ = a.run_on_main_thread(move || settled(&b, &format!("+{secs}s")));
        });
    }
    Ok(())
}

fn main() {
    let cfg = config::load();
    log::init(&cfg);
    observers::install_early();
    state::init(cfg.clone());
    state::with(|s| s.last_front = appkit::front_bid());
    log::ev(
        "launch",
        json!({ "front_before": appkit::front_app(), "pid": std::process::id(),
                "exe": std::env::current_exe().ok().map(|p| p.display().to_string()),
                "macos": appkit::macos_version(), "cfg": cfg }),
    );

    let mut app = tauri::Builder::default()
        .activate_ignoring_other_apps(false)
        // No app menu: while a panel is key, Cmd+Q, Cmd+H, Option+Cmd+H or
        // Ctrl+Cmd+F would otherwise act on Panel Spike (and full screen on a
        // full screen auxiliary panel crashes).
        .enable_macos_default_menu(false)
        .plugin(tauri_nspanel::init())
        .plugin(hotkeys::plugin())
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::char_click,
            commands::ui_event,
            commands::request_key,
            commands::release_key,
            commands::open_card,
            commands::close_card,
            commands::js_heartbeat,
            commands::toggle_compact,
            commands::next_preset,
        ])
        .setup(|app| {
            if let Err(e) = setup(app.handle()) {
                log::ev("error", json!({ "where": "setup", "msg": e.to_string() }));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Panel Spike");

    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    log::ev("policy_set", json!({ "policy": "accessory" }));

    app.run(|_app, event| match event {
        RunEvent::Reopen { .. } => log::ev("reopen", json!({})),
        RunEvent::Exit => log::ev("quit", json!({})),
        _ => {}
    });
}
