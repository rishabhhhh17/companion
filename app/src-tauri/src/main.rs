//! Companion shell. Tauri's web pages inside NSPanels that we create ourselves,
//! non activating from the start (T01: no tauri-nspanel, no convert after creation).
//! Rule 9: never steal keyboard focus. Nothing here calls show(), set_focus() or
//! makeKeyAndOrderFront on a panel.

mod runner;

use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSApplication, NSBackingStoreType, NSColor, NSPanel, NSScreen, NSView, NSWindow,
    NSWindowButton, NSWindowCollectionBehavior as B, NSWindowStyleMask as M, NSWindowTitleVisibility,
    NSWorkspace, NSEvent, NSEventMask,
};
use block2::RcBlock;
use std::ptr::NonNull;
use objc2_foundation::{NSPoint, NSRect, NSSize};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const DOCK: (f64, f64) = (160.0, 160.0);
const CARD: (f64, f64) = (340.0, 150.0);

static RUN: OnceLock<String> = OnceLock::new();
static T0: OnceLock<u128> = OnceLock::new();
static SEQ: AtomicU64 = AtomicU64::new(0);
static CLICKS: AtomicU64 = AtomicU64::new(0);
static LOG: Mutex<()> = Mutex::new(());
static APP: OnceLock<AppHandle> = OnceLock::new();
static PROJECT: OnceLock<String> = OnceLock::new();
static CARD_H: AtomicU64 = AtomicU64::new(150);

thread_local! {
    static PANELS: RefCell<Option<(Retained<NSPanel>, Retained<NSPanel>)>> = const { RefCell::new(None) };
    static LAST: RefCell<(bool, String, bool)> = RefCell::new((false, String::new(), false));
    static LAST_STATE: RefCell<String> = const { RefCell::new(String::new()) };
}

fn now() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()
}

fn front() -> String {
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .and_then(|a| a.localizedName())
        .map(|s| s.to_string())
        .unwrap_or_default()
}

fn active(mtm: MainThreadMarker) -> bool {
    NSApplication::sharedApplication(mtm).isActive()
}

fn log(ev: &str, extra: Value) {
    let dir = format!("{}/Library/Application Support/dev.companion.app", std::env::var("HOME").unwrap_or_default());
    let _ = std::fs::create_dir_all(&dir);
    let mut d = json!({ "run": RUN.get(), "seq": SEQ.fetch_add(1, Ordering::SeqCst) + 1, "ev": ev,
        "t": now() as u64, "ms": (now() - T0.get().copied().unwrap_or(0)) as u64, "front": front() });
    if let (Value::Object(a), Value::Object(b)) = (&mut d, extra) {
        a.extend(b);
    }
    let _g = LOG.lock();
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(format!("{dir}/events.jsonl")) {
        let _ = writeln!(f, "{d}");
    }
}

fn with_panels<R>(f: impl FnOnce(&NSPanel, &NSPanel) -> R) -> Option<R> {
    PANELS.with(|p| p.borrow().as_ref().map(|(d, c)| f(d, c)))
}

/// Make a panel natively, non activating from the first moment, and move the
/// Tauri window's web view into it. The Tauri window itself is never shown.
fn make_panel(mtm: MainThreadMarker, tauri_win: &NSWindow, card: bool, frame: NSRect) -> Retained<NSPanel> {
    let style = if card {
        // Titled panels can become key (needed for typing); hide the title bar.
        M::Titled | M::NonactivatingPanel | M::FullSizeContentView
    } else {
        // Borderless panels never become key: the character never takes typing.
        M::Borderless | M::NonactivatingPanel
    };
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(mtm.alloc::<NSPanel>(), frame, style, NSBackingStoreType::Buffered, false);
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setFloatingPanel(true);
    panel.setHidesOnDeactivate(false);
    panel.setLevel(3);
    panel.setCollectionBehavior(B::CanJoinAllSpaces | B::FullScreenAuxiliary | B::Stationary | B::IgnoresCycle);
    panel.setBackgroundColor(Some(&NSColor::whiteColor()));
    if card {
        panel.setTitlebarAppearsTransparent(true);
        panel.setTitleVisibility(NSWindowTitleVisibility::Hidden);
        for b in [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton] {
            if let Some(btn) = panel.standardWindowButton(b) {
                btn.setHidden(true);
            }
        }
    }
    let content: Retained<NSView> = tauri_win.contentView().expect("tauri window has a content view");
    tauri_win.setContentView(Some(&NSView::new(mtm)));
    panel.setContentView(Some(&content));
    log("panel_made", json!({ "card": card, "nonactivating": panel.styleMask().contains(M::NonactivatingPanel),
        "can_key": panel.canBecomeKeyWindow() }));
    panel
}

/// Place the card next to the character, keeping its top level with the character's top.
fn place_card(d: &NSPanel, c: &NSPanel) {
    let (df, h) = (d.frame(), CARD_H.load(Ordering::SeqCst) as f64);
    c.setFrame_display(NSRect::new(NSPoint::new(df.origin.x - CARD.0 - 8.0, df.origin.y + df.size.height - h), NSSize::new(CARD.0, h)), true);
}

/// Show the card. `keyboard` is true only when the user asked to type (hotkey or Type button);
/// clicking the character shows the card without taking the keyboard.
fn open_card(app: &AppHandle, source: &str, keyboard: bool) {
    log("card_open", json!({ "source": source, "keyboard": keyboard }));
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        with_panels(|d, c| {
            place_card(d, c);
            c.orderFrontRegardless();
            if keyboard { c.makeKeyWindow(); }
            log("card_shown", json!({ "card_key": c.isKeyWindow(), "app_active": active(mtm) }));
        });
        let _ = a.emit_to("card", "opened", json!({ "keyboard": keyboard }));
    });
}

fn card_visible() -> bool { with_panels(|_, c| c.isVisible()).unwrap_or(false) }

#[tauri::command]
fn char_click(app: AppHandle) -> u64 {
    let n = CLICKS.fetch_add(1, Ordering::SeqCst) + 1;
    click_log(&app, "dock", n);
    n
}

#[tauri::command]
fn ui_click(app: AppHandle, label: String) {
    click_log(&app, &label, 0);
}

fn click_log(app: &AppHandle, label: &str, n: u64) {
    let l = label.to_string();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        log("click", json!({ "label": l, "n": n, "app_active": active(mtm) }));
    });
    let a = app.clone();
    let l = label.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        let _ = a.clone().run_on_main_thread(move || {
            let mtm = MainThreadMarker::new().unwrap();
            log("click_after_150ms", json!({ "label": l, "n": n, "app_active": active(mtm) }));
        });
    });
}

/// The only way a page can talk to the runner. Rust checks every command first.
#[tauri::command]
fn send_command(app: AppHandle, cmd: serde_json::Value) -> Result<(), String> {
    runner::check_command(&cmd)?;
    app.state::<runner::Runner>().send(&cmd)
}

#[tauri::command]
fn open_card_cmd(app: AppHandle) {
    open_card(&app, "button", true);
}

/// Clicking the character shows or hides the card, and never takes the keyboard.
#[tauri::command]
fn toggle_card(app: AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        if card_visible() {
            with_panels(|_, c| c.orderOut(None));
            log("card_closed", json!({ "source": "character" }));
        } else {
            open_card(&a, "character", false);
        }
    });
}

/// The card page tells us how tall its content is; we resize the panel to fit.
#[tauri::command]
fn resize_card(app: AppHandle, height: f64) {
    let h = height.clamp(150.0, 520.0);
    CARD_H.store(h as u64, Ordering::SeqCst);
    let _ = app.run_on_main_thread(move || { with_panels(|d, c| if c.isVisible() { place_card(d, c) }); });
}

/// The folder tasks run in. For now it comes from the dev settings file or a safe playground folder.
#[tauri::command]
fn get_project() -> String { PROJECT.get().cloned().unwrap_or_default() }

#[tauri::command]
fn close_card(app: AppHandle) {
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        with_panels(|_, c| c.orderOut(None));
        log("card_closed", json!({ "app_active": active(mtm) }));
    });
}

fn tick(app: &AppHandle) {
    let mtm = MainThreadMarker::new().unwrap();
    let act = active(mtm);
    let fr = front();
    let ck = with_panels(|_, c| c.isKeyWindow()).unwrap_or(false);
    LAST.with(|l| {
        let mut l = l.borrow_mut();
        if l.0 != act {
            log(if act { "app_became_active" } else { "app_resigned_active" }, json!({}));
        }
        if l.1 != fr {
            log("front_app_changed", json!({ "to": fr }));
        }
        if l.2 != ck {
            log(if ck { "card_became_key" } else { "card_resigned_key" }, json!({ "app_active": act }));
        }
        *l = (act, fr.clone(), ck);
    });
    // Only tell the pages when something changed, so an idle app does almost no work.
    let state = json!({ "clicks": CLICKS.load(Ordering::SeqCst), "front": fr, "card_key": ck });
    let sig = state.to_string();
    if LAST_STATE.with(|l| l.replace(sig.clone())) != sig {
        let _ = app.emit("state", state);
    }
}

/// Start the runner. If it cannot start, say so to the pages in plain words; the app still opens.
fn start_runner(app: &AppHandle) {
    let data = PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library/Application Support/dev.companion.app");
    let dev = std::fs::read_to_string(data.join("dev.json")).ok();
    let project = dev.as_deref().and_then(|d| serde_json::from_str::<serde_json::Value>(d).ok())
        .and_then(|v| v.get("project").and_then(|p| p.as_str().map(String::from)))
        .unwrap_or_else(|| format!("{}/Developer/companion-playground", std::env::var("HOME").unwrap_or_default()));
    let _ = PROJECT.set(project);
    let result = runner::locations(dev.as_deref(), &|k| std::env::var(k).ok(), data.join("runner"))
        .and_then(|loc| app.state::<runner::Runner>().start(app, &loc, |t| log("runner_event", json!({ "kind": t }))));
    match result {
        Ok(()) => log("runner_started", json!({})),
        Err(e) => {
            log("runner_failed", json!({ "reason": e }));
            let a = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(1));
                let _ = a.emit("runner-event", json!({ "v": 1, "id": "app-norunner", "type": "app.runner_down", "reason": e }));
            });
        }
    }
}

fn main() {
    let _ = T0.set(now());
    let _ = RUN.set(format!("{}-{}", now(), std::process::id()));
    let mods = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER;
    let k = Shortcut::new(Some(mods), Code::KeyK);   // open the ask box
    let x = Shortcut::new(Some(mods), Code::KeyX);   // stop everything
    let app = tauri::Builder::default()
        .activate_ignoring_other_apps(false)
        .enable_macos_default_menu(false)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, s, e| {
                    if e.state != ShortcutState::Pressed { return; }
                    if s == &k {
                        log("hotkey", json!({ "id": "K" }));
                        open_card(app, "hotkey", true);
                    } else if s == &x {
                        let r = app.state::<runner::Runner>().stop_everything("kill switch");
                        log("hotkey", json!({ "id": "X", "stop_everything": true, "sent": r.is_ok() }));
                        let _ = app.emit("runner-event", json!({ "v": 1, "id": "app-kill", "type": "app.stop_everything" }));
                    }
                })
                .build(),
        )
        .manage(runner::Runner::new())
        .invoke_handler(tauri::generate_handler![char_click, ui_click, open_card_cmd, toggle_card, resize_card, get_project, close_card, send_command])
        .setup(move |app| {
            log("launch", json!({}));
            let mtm = MainThreadMarker::new().unwrap();
            let vf = NSScreen::mainScreen(mtm).map(|s| s.visibleFrame()).unwrap();
            let dock_frame = NSRect::new(NSPoint::new(vf.origin.x + vf.size.width - DOCK.0, vf.origin.y + vf.size.height / 2.0 - DOCK.1 / 2.0), NSSize::new(DOCK.0, DOCK.1));
            let mk = |label: &str, page: &str, size: (f64, f64)| {
                WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
                    .visible(false)
                    .focused(false)
                    .decorations(false)
                    .accept_first_mouse(true)
                    .inner_size(size.0, size.1)
                    .build()
            };
            let dock_w = mk("dock", "dock.html", DOCK)?;
            let card_w = mk("card", "card.html", CARD)?;
            let dock_ns: &NSWindow = unsafe { &*(dock_w.ns_window()? as *const NSWindow) };
            let card_ns: &NSWindow = unsafe { &*(card_w.ns_window()? as *const NSWindow) };
            let dock = make_panel(mtm, dock_ns, false, dock_frame);
            let card = make_panel(mtm, card_ns, true, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(CARD.0, CARD.1)));
            // Native witness: every mouse down macOS delivers to our panels, independent of the page.
            let block = RcBlock::new(|e: NonNull<NSEvent>| -> *mut NSEvent {
                let ev = unsafe { e.as_ref() };
                let mtm = MainThreadMarker::new().unwrap();
                let which = ev.window(mtm).map(|w| {
                    with_panels(|d, c| if std::ptr::eq(&*w, &**c as &NSWindow) { "card" } else if std::ptr::eq(&*w, &**d as &NSWindow) { "dock" } else { "other" }).unwrap_or("other")
                }).unwrap_or("none");
                let ck = with_panels(|_, c| c.isKeyWindow()).unwrap_or(false);
                log("native_mousedown", json!({ "panel": which, "app_active": active(mtm), "card_key_before": ck }));
                e.as_ptr()
            });
            let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown, &block) };
            std::mem::forget(monitor);
            dock.orderFrontRegardless();
            log("dock_shown", json!({ "app_active": active(mtm) }));
            PANELS.with(|p| *p.borrow_mut() = Some((dock, card)));
            let _ = APP.set(app.handle().clone());
            let h = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(100));
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || tick(&h2));
            });
            app.global_shortcut().register(k)?;
            app.global_shortcut().register(x)?;
            start_runner(app.handle());
            let h = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(2));
                let _ = h.run_on_main_thread(|| log("launch_settled", json!({ "app_active": active(MainThreadMarker::new().unwrap()) })));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("build");
    let mut app = app;
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    app.run(|app, ev| {
        if let RunEvent::Exit = ev {
            app.state::<runner::Runner>().shut_down();
        }
    });
}
