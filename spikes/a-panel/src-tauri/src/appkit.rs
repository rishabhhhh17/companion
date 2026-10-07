//! Small read only helpers over AppKit. None of these needs a privacy permission:
//! the front app comes from NSWorkspace, screens from NSScreen.

use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSEvent, NSRunningApplication, NSScreen, NSWorkspace};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

pub fn app_json(app: &NSRunningApplication) -> Value {
    json!({
        "name": app.localizedName().map(|s| s.to_string()),
        "bid": app.bundleIdentifier().map(|s| s.to_string()),
        "pid": app.processIdentifier(),
    })
}

pub fn front_app() -> Value {
    match NSWorkspace::sharedWorkspace().frontmostApplication() {
        Some(a) => app_json(&a),
        None => Value::Null,
    }
}

pub fn front_bid() -> String {
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .and_then(|a| a.bundleIdentifier())
        .map(|s| s.to_string())
        .unwrap_or_default()
}

pub fn app_is_active() -> Option<bool> {
    MainThreadMarker::new().map(|mtm| NSApplication::sharedApplication(mtm).isActive())
}

/// A display, in logical points with a top left origin (Tauri's convention).
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Screen {
    pub id: String,
    pub frame: [f64; 4],
    pub work: [f64; 4],
    pub primary: bool,
}

/// All screens, flipped from AppKit's bottom left origin to top left, using the
/// primary screen's height. Needs the main thread.
pub fn screens() -> Vec<Screen> {
    let Some(mtm) = MainThreadMarker::new() else { return vec![] };
    let list = NSScreen::screens(mtm);
    let mut out = Vec::new();
    let mut primary_h = 0.0;
    for (i, s) in list.iter().enumerate() {
        let f = s.frame();
        if i == 0 {
            primary_h = f.size.height;
        }
        let v = s.visibleFrame();
        let flip = |x: f64, y: f64, w: f64, h: f64| [x, primary_h - (y + h), w, h];
        let frame = flip(f.origin.x, f.origin.y, f.size.width, f.size.height);
        let work = flip(v.origin.x, v.origin.y, v.size.width, v.size.height);
        out.push(Screen {
            id: format!("{}x{}@{},{}", frame[2], frame[3], frame[0], frame[1]),
            frame,
            work,
            primary: i == 0,
        });
    }
    out
}

/// Mouse location in top left logical points.
pub fn mouse_location() -> (f64, f64) {
    let p = NSEvent::mouseLocation();
    let primary_h = screens().first().map(|s| s.frame[3]).unwrap_or(0.0);
    (p.x, primary_h - p.y)
}

/// Run `f` on the main thread: inline when already there, otherwise queued.
pub fn on_main<R: Runtime, F: FnOnce() + Send + 'static>(app: &AppHandle<R>, f: F) {
    if MainThreadMarker::new().is_some() {
        f();
    } else {
        let _ = app.run_on_main_thread(f);
    }
}

pub fn macos_version() -> String {
    std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}
