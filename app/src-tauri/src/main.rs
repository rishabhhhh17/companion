//! Companion shell. Tauri's web pages inside NSPanels that we create ourselves,
//! non activating from the start (T01: no tauri-nspanel, no convert after creation).
//! Rule 9: never steal keyboard focus. Nothing here calls show(), set_focus() or
//! makeKeyAndOrderFront on a panel.

mod docking;
mod island;
mod roam;
mod fullscreen;
mod anchor;
mod updates;
mod speak;
mod fuzz;
mod logfile;
mod permissions;
mod ax;
mod phelp;
mod errhelp;
#[allow(dead_code)] // wired to the hotkey in M5b
mod coords;
mod frame;
#[cfg(target_os = "macos")]
#[allow(dead_code)]
mod macos_see;
mod keystore;
mod projects;
mod redact;
#[allow(dead_code)]
mod showme;
mod pointat;
mod share;
mod yourturn;
mod wipe;
mod logexport;
mod practice;
mod diagram;
mod snap;
mod prompthelp;
mod errorsel;
#[allow(dead_code)]
mod voice;
#[cfg(target_os = "macos")]
#[allow(dead_code)]
mod voice_mac;
mod voiceset;
mod voicewords;
mod talkkeys;
mod visibility;
mod wheel;
mod presentation;

mod runner;
mod instance;

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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use docking::{choice, inside, pick, signature, snap_on, Prefs, Rect, Screen};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const DOCK: (f64, f64) = (160.0, 160.0);
// Home's size (the card, F18): CARD is its width (380, for its tabs) and its least height, CARD_MAX_H the tallest it
// grows. One definition, in island.rs, used by resize_card, by card_spot and by everything that keeps clear of Home.
use island::{CARD, CARD_MAX_H};

static RUN: OnceLock<String> = OnceLock::new();
static T0: OnceLock<u128> = OnceLock::new();
static SEQ: AtomicU64 = AtomicU64::new(0);
static CLICKS: AtomicU64 = AtomicU64::new(0);
static LOG: Mutex<()> = Mutex::new(());
static APP: OnceLock<AppHandle> = OnceLock::new();
static PROJECT: Mutex<Option<String>> = Mutex::new(None);
thread_local! { static OVERLAY: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) }; }
/// What Show me how last saw, kept in memory until the answer's last step or until the answer is ended, then dropped; and
/// where the last step of a multi step answer pointed, so the next flight starts there (showme::Pending).
static SHOWME: Mutex<showme::Pending> = Mutex::new(showme::Pending::new());
fn showme_pending() -> std::sync::MutexGuard<'static, showme::Pending> { SHOWME.lock().unwrap_or_else(|e| e.into_inner()) }
/// Point at the problem: each run takes a number; Stop, Close or a newer run changes it, and an older run then stops before it looks or draws.
static POINT_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn point_cancel() { POINT_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst); turn_cancel(); }
/// Your turn: the target the ring is waiting on (global points, label), and a number that Stop, Close or a newer ring changes.
static TURN: Mutex<Option<(coords::R, String)>> = Mutex::new(None);
static TURN_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Until when a pointer (ring, caption) is on the overlay, in ms since 1970: confetti waits. A pointer that fades by
/// itself after 10 s frees it then; one waiting for a click holds it until the overlay is hidden.
static OVERLAY_BUSY_UNTIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn overlay_busy() -> bool { (now() as u64) < OVERLAY_BUSY_UNTIL.load(std::sync::atomic::Ordering::SeqCst) }
/// Each celebration takes a number, so an older one's tidy up never cuts a newer one short.
static PARTY_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn turn_cancel() { TURN_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst); *TURN.lock().unwrap_or_else(|e| e.into_inner()) = None; }
static CARD_H: AtomicU64 = AtomicU64::new(150);
static USER_HID: AtomicBool = AtomicBool::new(false);      // hidden from the menu bar icon
static HIDDEN_BY_US: AtomicBool = AtomicBool::new(false);  // hidden because a full screen app is in front
static FS_SMOOTH: Mutex<Option<visibility::Debounce>> = Mutex::new(None);
static FS_RAW_LOGGED: AtomicU64 = AtomicU64::new(0);
static FS_LAST_RAW: AtomicBool = AtomicBool::new(false);

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

/// The id of the app in front (for example "com.apple.Terminal"). Only the id, never any window content.
fn front_id() -> String {
    NSWorkspace::sharedWorkspace().frontmostApplication().and_then(|a| a.bundleIdentifier()).map(|s| s.to_string()).unwrap_or_default()
}

static WHEEL: Mutex<Option<wheel::Wheel>> = Mutex::new(None);

fn active(mtm: MainThreadMarker) -> bool {
    NSApplication::sharedApplication(mtm).isActive()
}

fn app_folder() -> std::path::PathBuf { std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library/Application Support/dev.companion.app") }
static VERBOSE: OnceLock<bool> = OnceLock::new();

/// Writes one line to the small local log. By default only a few important events are written, never which apps you are
/// using. A developer can turn full detail on (the file `debug` in the app's folder, or COMPANION_DEBUG_LOG=1). It stays under 512 KB.
pub(crate) fn log(ev: &str, extra: Value) {
    let dir = app_folder();
    let verbose = *VERBOSE.get_or_init(|| logfile::verbose_enabled(&dir, std::env::var("COMPANION_DEBUG_LOG").ok().as_deref()));
    if !logfile::should_log(ev, verbose) { return; }
    let _ = std::fs::create_dir_all(&dir);
    let mut d = json!({ "run": RUN.get(), "seq": SEQ.fetch_add(1, Ordering::SeqCst) + 1, "ev": ev, "t": now() as u64, "ms": (now() - T0.get().copied().unwrap_or(0)) as u64 });
    if verbose { if let Value::Object(a) = &mut d { a.insert("front".into(), json!(front())); } }
    if let (Value::Object(a), Value::Object(b)) = (&mut d, extra) { a.extend(b); }
    let _g = LOG.lock().unwrap_or_else(|e| e.into_inner());
    logfile::append_line(&dir.join("events.jsonl"), &d.to_string(), logfile::MAX_BYTES);
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
    // By default the character stays out of full screen apps (the product default). Setting
    // COMPANION_OVER_FULLSCREEN=1 adds fullScreenAuxiliary so it shows over them (a user setting later).
    // fullScreenAuxiliary lets it be on a full screen Space; whether it stays there is decided by
    // visibility.rs, because on macOS 27 leaving the flag out did not hide it.
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

/// Where Home (the card) is when it is `h` tall (top left points, with the primary display's height for AppKit). The one
/// answer for placing it and for the character keeping clear of it (island::card_spot, tested): dropped down from the
/// island in the notch (F18 item 1) when the island's display is known, else beside the character's home as before F18,
/// never beside where the character may be visiting a window (F18 item 2).
fn card_spot(mtm: MainThreadMarker, d: &NSPanel, h: f64) -> Option<(Rect, f64)> {
    let list = screens_now(mtm);
    let first = list.first()?;
    let ph = first.frame[3];
    let on = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let home = roamer().home().unwrap_or_else(|| from_appkit(d.frame(), ph));
    let spot = island::card_spot(on.as_ref(), home, &list, |id| with_prefs(|p| choice(p, id).0), h)?;
    Some((spot, ph))
}

/// Place Home: under the island, or beside the character's home when no island display is known. It does not follow
/// the character to a window.
fn place_card(d: &NSPanel, c: &NSPanel) {
    let mtm = MainThreadMarker::new().unwrap();
    let Some((cf, ph)) = card_spot(mtm, d, CARD_H.load(Ordering::SeqCst) as f64) else { return };
    c.setFrame_display(to_appkit(cf, ph), true);
    // The card opened or grew. If at its tallest it could reach the character beside a window, the visit is planned
    // again clear of it (or ends).
    if let Some((room, _)) = card_spot(mtm, d, CARD_MAX_H) { roam_card_moved(mtm, room); }
}

/// Where our card can reach at its tallest while it is up, for the character to keep clear of. Nothing while it is
/// closed: if it opens later, place_card plans the visit again.
fn card_room(mtm: MainThreadMarker) -> Vec<Rect> {
    with_panels(|d, c| if c.isVisible() { card_spot(mtm, d, CARD_MAX_H).map(|(r, _)| r) } else { None }).flatten().into_iter().collect()
}

// ---------- screens and docking glue (the maths is in docking.rs, tested) ----------

fn data_dir() -> PathBuf { PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library/Application Support/dev.companion.app") }
fn prefs_path() -> PathBuf { data_dir().join("dock.json") }
static PREFS: Mutex<Option<Prefs>> = Mutex::new(None);
static SIG: Mutex<String> = Mutex::new(String::new());
static LAST_DRAG: Mutex<(f64, f64, f64, f64)> = Mutex::new((0.0, 0.0, 0.0, 0.0)); // x, y, work x, work width

fn with_prefs<R>(f: impl FnOnce(&mut Prefs) -> R) -> R {
    let mut g = PREFS.lock().unwrap_or_else(|e| e.into_inner());
    // The careful reader: a place saved before F18 reads back unchanged, and one bad entry never loses the others.
    let p = g.get_or_insert_with(|| Prefs::from_text(std::fs::read_to_string(prefs_path()).ok().as_deref()));
    f(p)
}
fn save_prefs() { with_prefs(|p| { let _ = logfile::write_atomic(&prefs_path(), serde_json::to_string(p).unwrap_or_default().as_bytes()); }); }

// AppKit counts from the bottom left of the primary screen; the maths counts from the top left.
fn to_appkit(r: Rect, primary_h: f64) -> NSRect { NSRect::new(NSPoint::new(r[0], primary_h - (r[1] + r[3])), NSSize::new(r[2], r[3])) }
fn from_appkit(f: NSRect, primary_h: f64) -> Rect { [f.origin.x, primary_h - (f.origin.y + f.size.height), f.size.width, f.size.height] }

/// Each display, with its notch if it has one, so the character keeps clear of the island and Home on it (docking.rs
/// `dock_zone`). The same reading as the island's (`displays_now`; island::Display is docking::Screen). Main thread.
fn screens_now(mtm: MainThreadMarker) -> Vec<Screen> { displays_now(mtm) }

/// Put the character where it belongs: the saved display, else the same size, else under the mouse,
/// else the primary one; inside the work area, on its saved edge at its saved height.
fn apply_dock(mtm: MainThreadMarker, reason: &str, quiet: bool) {
    let list = screens_now(mtm);
    let Some(first) = list.first() else { return };
    let ph = first.frame[3];
    let m = NSEvent::mouseLocation();
    let Some((target, how)) = with_prefs(|p| pick(&list, p, (m.x, ph - m.y)).map(|(s, h)| (s.clone(), h))) else { return };
    let (edge, pct) = with_prefs(|p| {
        if p.last_screen != target.id { p.last_screen = target.id.clone(); }
        choice(p, &target.id)
    });
    // On its edge, inside the work area, out of the clear zone at the top centre (the notch island).
    let f = docking::place(&target, DOCK, edge, pct);
    // This is home now. A drag or a display change also ends any visit beside a window, with no trip back, and stops a
    // trip that was under way where it is.
    ROAM_GEN.fetch_add(1, Ordering::SeqCst);
    roamer().placed_home(f);
    *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    *HOME_EDGE.lock().unwrap_or_else(|e| e.into_inner()) = edge;
    if let Some(app) = APP.get() { if roam_phase() != roam::Phase::Home { roam_say(app, roam::Phase::Home, roam::facing(roam::Phase::Home, f, f, None, edge)); } }
    with_panels(|d, c| {
        d.setFrame_display(to_appkit(f, ph), true);
        if c.isVisible() { place_card(d, c); }
    });
    if !quiet { log("redock", json!({ "reason": reason, "how": how, "screen": target.id, "frame": f, "inside_work": inside(f, target.work) })); }
}

/// Dragging the character: it snaps to the nearest edge or corner of the display under the cursor.
#[tauri::command]
fn drag_dock(app: AppHandle, x: f64, y: f64) {
    // While the person drags it nothing else moves it (F18 item 2).
    DRAG_AT.store(now() as u64, Ordering::SeqCst);
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        let list = screens_now(mtm);
        let Some(first) = list.first() else { return };
        let target = list.iter().find(|s| x >= s.frame[0] && x < s.frame[0] + s.frame[2] && y >= s.frame[1] && y < s.frame[1] + s.frame[3]).unwrap_or(first).clone();
        let (edge, pct) = snap_on(&target, DOCK, x, y);
        *LAST_DRAG.lock().unwrap() = (x, y, target.work[0], target.work[2]);
        with_prefs(|p| { p.last_screen = target.id.clone(); p.per_screen.insert(target.id.clone(), (edge, pct)); });
        apply_dock(mtm, "drag", true);
    });
}

#[tauri::command]
fn drop_dock(app: AppHandle) {
    DRAG_AT.store(0, Ordering::SeqCst);
    save_prefs();
    let _ = app.run_on_main_thread(|| {
        let (x, y, wx, ww) = *LAST_DRAG.lock().unwrap();
        log("dock_dropped", with_prefs(|p| json!({ "screen": p.last_screen, "choice": p.per_screen.get(&p.last_screen), "last_pointer": [x, y], "work_x_and_width": [wx, ww] })));
    });
}

// ---------- Home in the notch (F18.1; the maths is in island.rs, tested) ----------

thread_local! {
    static ISLAND: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) };
    // The tracking area on the island does not keep its owner alive, so it is kept here for as long as the app runs.
    static ISLAND_HOVER_OWNER: RefCell<Option<Retained<hover::HoverOwner>>> = const { RefCell::new(None) };
}
static ISLAND_STATE: Mutex<island::State> = Mutex::new(island::State { hover: false, alert: false, home_open: false });
static ISLAND_HOVER: Mutex<island::Hover> = Mutex::new(island::Hover::new());
/// The display the island was on last (`island.json`), read once.
static ISLAND_LAST: Mutex<Option<String>> = Mutex::new(None);
/// The display it is on now, for Home to drop down from.
static ISLAND_ON: Mutex<Option<island::Display>> = Mutex::new(None);
/// What the island page was last told: its size, and what it sits on (the notch, a pill, or the thin line on the top edge).
static ISLAND_SENT: Mutex<(String, String)> = Mutex::new((String::new(), String::new()));
/// Which display the pointer has stayed on, so the island can go to the one the person is using.
static ISLAND_FOLLOW: Mutex<island::Follow> = Mutex::new(island::Follow::new());
/// Home (the card) is open; each opening takes a number, so an older click away watch stops.
static HOME_OPEN: AtomicBool = AtomicBool::new(false);
static HOME_GEN: AtomicU64 = AtomicU64::new(0);
/// One of Companion's own native dialogs (the folder chooser, the delete question) is up: a click in it is not a click elsewhere.
static NATIVE_DIALOGS: AtomicU64 = AtomicU64::new(0);
struct NativeDialog;
impl NativeDialog { fn open() -> Self { NATIVE_DIALOGS.fetch_add(1, Ordering::SeqCst); NativeDialog } }
impl Drop for NativeDialog { fn drop(&mut self) { NATIVE_DIALOGS.fetch_sub(1, Ordering::SeqCst); } }

fn island_path() -> PathBuf { island::path(&data_dir()) }
fn island_last() -> String {
    ISLAND_LAST.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(|| island::parse_last(std::fs::read_to_string(island_path()).ok().as_deref())).clone()
}
fn remember_island(id: &str) {
    *ISLAND_LAST.lock().unwrap_or_else(|e| e.into_inner()) = Some(id.to_string());
    let _ = logfile::write_atomic(&island_path(), island::last_json(id).as_bytes());
}

/// Each display, with its notch if it has one (NSScreen's safe area and the two areas beside the camera). Main thread.
fn displays_now(mtm: MainThreadMarker) -> Vec<island::Display> {
    let list = NSScreen::screens(mtm);
    let primary_h = list.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    list.iter().enumerate().map(|(i, s)| {
        let (f, v) = (s.frame(), s.visibleFrame());
        let frame = from_appkit(f, primary_h);
        let notch = island::notch_from(f.size.width, s.safeAreaInsets().top, s.auxiliaryTopLeftArea().size.width, s.auxiliaryTopRightArea().size.width);
        island::Display { id: format!("{}x{}@{},{}", frame[2], frame[3], frame[0], frame[1]), frame, work: from_appkit(v, primary_h), primary: i == 0, notch }
    }).collect()
}

/// Puts the island on its display at the size it should be now, and tells its page. `follow_mouse`: the person is opening
/// Home, so the display with the pointer. Otherwise the display it was on last (`follow_pointer` changes that after the
/// pointer stays on another display), so a change of size alone never moves it. Main thread.
fn place_island(mtm: MainThreadMarker, follow_mouse: bool, reason: &str) {
    let list = displays_now(mtm);
    let Some(first) = list.first() else { return };
    let ph = first.frame[3];
    let last = island_last();
    let mouse = if follow_mouse || !list.iter().any(|d| d.id == last) { let m = NSEvent::mouseLocation(); (m.x, ph - m.y) } else { (f64::NAN, f64::NAN) };
    let Some((d, how)) = island::pick(&list, &last, mouse, follow_mouse) else { return };
    let d = d.clone();
    if d.id != last { remember_island(&d.id); }
    let moved = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).as_ref() != Some(&d);
    if moved { reset_hover(); }
    let state = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); s.home_open = HOME_OPEN.load(Ordering::SeqCst); *s };
    let mode = island::mode(state);
    let f = island::island_frame(&d, mode);
    *ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()) = Some(d.clone());
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { p.setFrame_display(to_appkit(f, ph), true); } });
    let kind = island::kind(&d);
    tell_island(mode, kind);
    if moved { log("island_placed", json!({ "reason": reason, "how": how, "screen": d.id, "kind": kind.word(), "frame": f })); }
}

fn tell_island(mode: island::Mode, kind: island::Kind) {
    {
        let mut g = ISLAND_SENT.lock().unwrap_or_else(|e| e.into_inner());
        if g.0 == mode.word() && g.1 == kind.word() { return; }
        *g = (mode.word().to_string(), kind.word().to_string());
    }
    if let Some(app) = APP.get() { let _ = app.emit_to("island", "island-mode", json!({ "mode": mode.word(), "kind": kind.word() })); }
}

/// The island goes to the display the person is using: the one the pointer has stayed on for a few seconds (island.rs
/// `Follow`), not while Home is open. Called from `tick`, twice a second. Only which display the pointer is on is used,
/// read with `NSEvent::mouseLocation` (no permission); never what is on the screen, never keys. Main thread.
fn follow_pointer(mtm: MainThreadMarker) {
    let list = displays_now(mtm);
    if list.len() < 2 { return; }
    let ph = list[0].frame[3];
    let m = NSEvent::mouseLocation();
    let p = (m.x, ph - m.y);
    let under = list.iter().find(|d| island::contains(d.frame, p)).map(|d| d.id.as_str());
    let current = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|d| d.id.clone()).unwrap_or_default();
    let to = ISLAND_FOLLOW.lock().unwrap_or_else(|e| e.into_inner()).sample(under, &current, HOME_OPEN.load(Ordering::SeqCst), now() as u64);
    if let Some(id) = to { remember_island(&id); place_island(mtm, false, "followed_pointer"); }
}

fn island_show(on: bool) {
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { if on { p.orderFrontRegardless(); } else { p.orderOut(None); } } });
    if !on { reset_hover(); }
}

/// The island's frame in global top left points, if it is on screen. Main thread.
fn island_rect(primary_h: f64) -> Option<Rect> {
    ISLAND.with(|i| i.borrow().as_ref().filter(|p| p.isVisible()).map(|p| from_appkit(p.frame(), primary_h)))
}

/// Forgets whether the pointer was on the island (it was hidden, moved, or Home opened or closed over it).
fn reset_hover() {
    *ISLAND_HOVER.lock().unwrap_or_else(|e| e.into_inner()) = island::Hover::new();
    ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()).hover = false;
}

/// Home went away (Esc, Close, a click elsewhere, the island or the character clicked again, a full screen app, Hide): the
/// click away watch stops and the island goes back to its own size. Main thread.
fn home_closed() {
    HOME_OPEN.store(false, Ordering::SeqCst);
    HOME_GEN.fetch_add(1, Ordering::SeqCst);
    reset_hover();
    if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "home_closed"); }
}

/// The page says whether a mark should show (a question waits, listening, just done; home.ts): below the notch, in the
/// pill, or the thin line on the top edge growing into the pill.
#[tauri::command]
fn island_alert(app: AppHandle, on: bool) {
    let _ = app.run_on_main_thread(move || {
        let changed = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); let c = s.alert != on; s.alert = on; c };
        if changed { if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "alert"); } }
    });
}

/// For the island page when it loads: its size now, and what it sits on.
#[tauri::command]
fn island_state() -> Value {
    let (mode, kind) = ISLAND_SENT.lock().unwrap_or_else(|e| e.into_inner()).clone();
    json!({ "mode": if mode.is_empty() { "rest".to_string() } else { mode }, "kind": if kind.is_empty() { "pill".to_string() } else { kind } })
}

/// macOS tells us the pointer entered or left the island: a tracking area on that one window, active even while another
/// app is in front. Nothing else about the pointer is read for this. Main thread.
fn island_hover_changed(inside: bool) {
    let t = now() as u64;
    { let mut h = ISLAND_HOVER.lock().unwrap_or_else(|e| e.into_inner()); if inside { h.enter(t) } else { h.exit(t) } }
    island_hover_settle();
}
fn island_hover_settle() {
    let t = now() as u64;
    let (shown, wait) = { let mut h = ISLAND_HOVER.lock().unwrap_or_else(|e| e.into_inner()); (h.at(t), h.wait_ms(t)) };
    let changed = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); let c = s.hover != shown; s.hover = shown; c };
    if changed { if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "hover"); } }
    // Not settled yet (the pointer has only just come or gone): look again when it may have.
    if let (Some(ms), Some(app)) = (wait, APP.get()) {
        let a = app.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(ms + 5)); let _ = a.run_on_main_thread(island_hover_settle); });
    }
}

fn add_hover_tracking(mtm: MainThreadMarker, panel: &NSPanel) {
    use objc2::AnyThread;
    use objc2_app_kit::{NSTrackingArea, NSTrackingAreaOptions};
    let Some(view) = panel.contentView() else { return };
    let owner = hover::HoverOwner::new(mtm);
    let opts = NSTrackingAreaOptions::MouseEnteredAndExited | NSTrackingAreaOptions::ActiveAlways | NSTrackingAreaOptions::InVisibleRect;
    let any: &objc2::runtime::AnyObject = owner.as_ref();
    let area = unsafe { NSTrackingArea::initWithRect_options_owner_userInfo(NSTrackingArea::alloc(), view.bounds(), opts, Some(any), None) };
    view.addTrackingArea(&area);
    ISLAND_HOVER_OWNER.with(|o| *o.borrow_mut() = Some(owner));
}

mod hover {
    use objc2::rc::Retained;
    use objc2::{define_class, msg_send, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::NSEvent;
    use objc2_foundation::NSObject;

    define_class!(
        // SAFETY: NSObject has no rules for subclasses, and this class has no Drop and no instance variables.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "CompanionIslandHover"]
        pub struct HoverOwner;

        impl HoverOwner {
            #[unsafe(method(mouseEntered:))]
            fn mouse_entered(&self, _event: &NSEvent) { super::island_hover_changed(true); }
            #[unsafe(method(mouseExited:))]
            fn mouse_exited(&self, _event: &NSEvent) { super::island_hover_changed(false); }
        }
    );

    impl HoverOwner {
        pub fn new(mtm: MainThreadMarker) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(());
            unsafe { msg_send![super(this), init] }
        }
    }
}

/// While Home is open, a press that starts outside every Companion window counts as a click elsewhere, and Home is told:
/// it closes unless something on it is waiting for the person (home.ts). Only whether the button is down and where the
/// pointer is are read, twenty times a second, and only while Home is open: never keys, never anything on the screen.
fn watch_click_away(app: &AppHandle) {
    let gen = HOME_GEN.load(Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        let down = || NSEvent::pressedMouseButtons() & 1 == 1;
        let mut w = island::ClickAway::new(down());
        // Companion's own windows, read at the moment of a press (Home grows and moves while it is open).
        let a2 = app.clone();
        let ours = move || -> Option<Vec<Rect>> {
            let (tx, rx) = std::sync::mpsc::channel::<Vec<Rect>>();
            let _ = a2.run_on_main_thread(move || {
                let mtm = MainThreadMarker::new().unwrap();
                let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
                let mut v: Vec<Rect> = with_panels(|d, c| [d, c].iter().filter(|p| p.isVisible()).map(|p| from_appkit(p.frame(), ph)).collect()).unwrap_or_default();
                if let Some(r) = island_rect(ph) { v.push(r); }
                let _ = tx.send(v);
            });
            rx.recv_timeout(Duration::from_millis(500)).ok()
        };
        while HOME_OPEN.load(Ordering::SeqCst) && HOME_GEN.load(Ordering::SeqCst) == gen {
            std::thread::sleep(Duration::from_millis(island::CLICK_POLL_MS));
            // A click in one of our own dialogs (another process) is not a click elsewhere, nor is the press that ends it.
            if NATIVE_DIALOGS.load(Ordering::SeqCst) > 0 { w = island::ClickAway::new(true); continue; }
            let p = macos_see::pointer();
            // If our windows cannot be read in time, the press counts as ours: Home never closes on a guess.
            if w.sample(down(), (p.x, p.y), || ours().unwrap_or_else(|| vec![[p.x - 1.0, p.y - 1.0, 2.0, 2.0]])) {
                log("home_click_away", json!({}));
                let _ = app.emit_to("card", "home-click-away", ());
            }
        }
    });
}

// ---------- the companion comes to what it is about (F18 item 2; the rules are in roam.rs, tested) ----------

static ROAM: Mutex<roam::Roamer> = Mutex::new(roam::Roamer::new());
fn roamer() -> std::sync::MutexGuard<'static, roam::Roamer> { ROAM.lock().unwrap_or_else(|e| e.into_inner()) }
/// Each trip takes a number; a newer trip, a drag or a display change stops an older one where it is.
static ROAM_GEN: AtomicU64 = AtomicU64::new(0);
/// Where the character is right now (top left points), for the pointer check while it travels.
static ROAM_AT: Mutex<Option<Rect>> = Mutex::new(None);
/// The edge home is on, and the named state the character's page was last told.
static HOME_EDGE: Mutex<docking::Edge> = Mutex::new(docking::Edge::Right);
static ROAM_PHASE: Mutex<roam::Phase> = Mutex::new(roam::Phase::Home);
/// When the person last dragged the character (ms since 1970), 0 once they let go.
static DRAG_AT: AtomicU64 = AtomicU64::new(0);

fn roam_phase() -> roam::Phase { *ROAM_PHASE.lock().unwrap_or_else(|e| e.into_inner()) }
/// Tells the character's page the named state (surface, travel, settle, visiting, return, home) and which way to face,
/// so the founder's art can follow (F18 item 4). The placeholder dot only hints at them.
fn roam_say(app: &AppHandle, phase: roam::Phase, toward: &str) {
    *ROAM_PHASE.lock().unwrap_or_else(|e| e.into_inner()) = phase;
    let _ = app.emit_to("dock", "roam", json!({ "phase": phase.name(), "toward": toward }));
}

/// A drag in progress (a drag the page never ended counts for a second and a half after its last move).
fn dragging() -> bool { let t = DRAG_AT.load(Ordering::SeqCst); t != 0 && (now() as u64).saturating_sub(t) < 1500 }
/// Never while the person drags it, never while the pointer is over it. Only the mouse position is read (no
/// permission, never keys).
fn roam_blocked() -> bool {
    if dragging() { return true; }
    let Some(at) = *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) else { return false };
    let p = macos_see::pointer();
    p.x >= at[0] && p.x < at[0] + at[2] && p.y >= at[1] && p.y < at[1] + at[3]
}
/// The Mac's own Reduce motion setting (Accessibility, Display). Read with no permission.
fn reduce_motion() -> bool { NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion() }

/// Something about a place on screen is up: the character comes beside the window it is in, unless the setting is off,
/// Companion is hidden, the place has no confirmed window (a menu, a dialog, the desktop), or there is no room outside
/// the window; then any older visit ends. Main thread.
fn roam_to(app: &AppHandle, mtm: MainThreadMarker, an: Option<&anchor::Anchor>, target: Rect) {
    use std::sync::atomic::Ordering::SeqCst;
    let going = (|| {
        if !with_prefs(|p| p.come_to) || HIDDEN_BY_US.load(SeqCst) || USER_HID.load(SeqCst) { return None; }
        let an = an?;
        let list = screens_now(mtm);
        let screen = roam::display_of(&list, target)?;
        let home = roamer().home()?;
        // Never over our own card, at the height it can grow to.
        let avoid = card_room(mtm);
        match roam::plan(&roam::Ask { screen, window: an.bounds, target, size: DOCK, avoid: &avoid, home }) {
            roam::Plan::Go { spot, side } => Some(roam::Visit { anchor: an.clone(), target, spot, side }),
            roam::Plan::Stay(why) => { log("roam_stay", json!({ "why": format!("{why:?}") })); None }
        }
    })();
    match going {
        Some(v) => { log("roam_go", json!({ "side": format!("{:?}", v.side) })); roamer().begin(v); }
        None => { if roamer().visit().is_none() { return; } roamer().end(); }
    }
    roam_kick(app);
}

/// The card opened or grew (place_card) and at its tallest reaches `room`: the rule decides whether the character
/// beside a window moves clear of it or goes home, and the trip starts. Main thread.
fn roam_card_moved(mtm: MainThreadMarker, room: Rect) {
    let Some(target) = roamer().visit().map(|v| v.target) else { return };
    let list = screens_now(mtm);
    let Some(screen) = roam::display_of(&list, target) else { return };
    let Some(p) = roamer().card_moved(room, screen, DOCK) else { return };
    log("roam_card_moved", json!({ "now": match p { roam::Plan::Go { side, .. } => format!("{side:?}"), roam::Plan::Stay(why) => format!("{why:?}") } }));
    if let Some(app) = APP.get() { roam_kick(app); }
}

/// A result about another app's window (the error explainer, Prompt help): the character comes beside that app's front
/// window while the card shows the result. Window owners and sizes only, never content.
pub(crate) fn roam_beside_window_of(app: &AppHandle, pid: i32) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(bounds) = roam::front_window_of(&fullscreen::sys::on_screen_windows(), pid) else { return };
        let an = anchor::Anchor { pid, bounds, front_pid: pid };
        roam_to(&a, MainThreadMarker::new().unwrap(), Some(&an), bounds);
    });
}

/// Ends any visit (Stop everything, the setting turned off): the character goes home.
fn roam_end(app: &AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || { if roamer().visit().is_some() { roamer().end(); roam_kick(&a); } });
}

/// Starts the trip the rules ask for, if any (after a new visit, and on every tick). Main thread.
fn roam_kick(app: &AppHandle) {
    // Nothing waiting (nearly every tick): the pointer is not even read.
    if !roamer().pending() { return; }
    let mv = roamer().next_move(roam_blocked());
    if let Some(mv) = mv { roam_animate(app, mv, reduce_motion()); }
}

/// Each tick: is the visit still right (its window there and unchanged, its app in front, a ring or the card up, the
/// setting on, Companion not hidden)? If not it goes home; when hidden, at once with no trip. Then a trip still wanted
/// starts (one held back by the pointer or a drag starts as soon as they are gone).
fn roam_tick(app: &AppHandle, wins: &[fullscreen::Win], front_pid: i32) {
    use std::sync::atomic::Ordering::SeqCst;
    let up = overlay_busy() || TURN.lock().unwrap_or_else(|e| e.into_inner()).is_some() || card_visible();
    let hidden = HIDDEN_BY_US.load(SeqCst) || USER_HID.load(SeqCst);
    let on = with_prefs(|p| p.come_to);
    let ended = roamer().tick(&roam::TickIn { now: now() as u64, on, hidden, up, wins, ours: std::process::id() as i32, front_pid });
    if let Some(why) = ended {
        log("roam_home", json!({ "why": format!("{why:?}") }));
        if why == roam::EndWhy::Hidden { roam_home_now(app); }
    }
    roam_kick(app);
}

/// Home at once, with no trip (Companion was hidden, so nobody would see it travel).
fn roam_home_now(app: &AppHandle) {
    let Some(home) = roamer().home() else { return };
    let gen = ROAM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    roamer().placed_home(home);
    roam_set(app, home, gen);
    let edge = *HOME_EDGE.lock().unwrap_or_else(|e| e.into_inner());
    roam_say(app, roam::Phase::Home, roam::facing(roam::Phase::Home, home, home, None, edge));
}

/// One trip through the named states (roam::steps), telling the character's page each one. With reduced motion it
/// appears in place. A newer trip, a drag or a display change stops it where it is. Main thread (it reads the screens),
/// the trip itself runs on its own thread.
fn roam_animate(app: &AppHandle, mv: roam::Move, reduced: bool) {
    let gen = ROAM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let from = ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()).unwrap_or(mv.to);
    let side = if mv.out { roamer().visit().map(|v| v.side) } else { None };
    let edge = *HOME_EDGE.lock().unwrap_or_else(|e| e.into_inner());
    // The top of the screens it travels between, so the arc never rises into a menu bar.
    let ceiling = MainThreadMarker::new().map(|mtm| screens_now(mtm).iter()
        .filter(|s| [from, mv.to].iter().any(|r| { let (x, y) = (r[0] + r[2] / 2.0, r[1] + r[3] / 2.0); x >= s.frame[0] && x < s.frame[0] + s.frame[2] && y >= s.frame[1] && y < s.frame[1] + s.frame[3] }))
        .map(|s| s.work[1]).fold(f64::INFINITY, f64::min)).filter(|c| c.is_finite()).unwrap_or(from[1].min(mv.to[1]));
    let app = app.clone();
    std::thread::spawn(move || {
        let d = (mv.to[0] - from[0]).hypot(mv.to[1] - from[1]);
        for (phase, ms) in roam::steps(mv.out, reduced, roam::travel_ms(d)) {
            if ROAM_GEN.load(Ordering::SeqCst) != gen { return; }
            roam_say(&app, phase, roam::facing(phase, from, mv.to, side, edge));
            match phase {
                roam::Phase::Travel | roam::Phase::Return => { if !roam_fly(&app, from, mv.to, ms, ceiling, gen) { return; } }
                roam::Phase::Surface | roam::Phase::Settle => std::thread::sleep(Duration::from_millis(ms)),
                roam::Phase::Visiting | roam::Phase::Home => roam_set(&app, mv.to, gen),
            }
        }
    });
}

/// The trip itself: the arrow's arc and easing, about sixty steps a second. It holds still while the pointer is over
/// the character or the person drags it, and stops (false) when a newer trip takes over.
fn roam_fly(app: &AppHandle, from: Rect, to: Rect, ms: u64, ceiling: f64, gen: u64) -> bool {
    let up = roam::bends_up(from, to, ceiling);
    let total = ms.max(1) as f64;
    let (mut done, mut last) = (0.0f64, std::time::Instant::now());
    loop {
        std::thread::sleep(Duration::from_millis(16));
        if ROAM_GEN.load(Ordering::SeqCst) != gen { return false; }
        let dt = last.elapsed().as_secs_f64() * 1000.0;
        last = std::time::Instant::now();
        // Held still (the time does not count), looking a few times a second rather than every frame.
        if roam_blocked() { std::thread::sleep(Duration::from_millis(84)); last = std::time::Instant::now(); continue; }
        done = (done + dt).min(total);
        roam_set(app, roam::arc_at(from, to, roam::ease(done / total), up), gen);
        if done >= total { return true; }
    }
}

/// Puts the character at `r` (top left points) unless a newer trip took over. It only moves the panel: never orders it
/// in or gives it the keyboard.
fn roam_set(app: &AppHandle, r: Rect, gen: u64) {
    let _ = app.run_on_main_thread(move || {
        if ROAM_GEN.load(Ordering::SeqCst) != gen { return; }
        *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(r);
        let mtm = MainThreadMarker::new().unwrap();
        let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        with_panels(|d, _| d.setFrame_display(to_appkit(r, ph), true));
    });
}

/// Settings: whether the character comes to what it is about (on unless turned off). Kept in `dock.json`.
#[tauri::command]
fn dock_settings() -> Value { json!({ "comeTo": with_prefs(|p| p.come_to) }) }

/// Settings: turns it on or off. Only from the card. Off sends a visiting character home.
#[tauri::command]
fn set_come_to(app: AppHandle, window: tauri::WebviewWindow, on: bool) -> Result<Value, String> {
    if window.label() != "card" { return Err("This can only be changed from the card.".into()); }
    with_prefs(|p| p.come_to = on);
    save_prefs();
    if !on { roam_end(&app); }
    log("come_to_set", json!({ "on": on }));
    Ok(json!({ "comeTo": on }))
}

/// A page that has just loaded asks for the status messages it missed.
#[tauri::command]
fn replay_events(app: AppHandle) -> Vec<serde_json::Value> { app.state::<runner::Runner>().replay() }

// ---- Prompt help (M5b): the hotkey is the only way anything is read ----

fn sc_mods() -> Modifiers { Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER }
fn sc_showme() -> Shortcut { Shortcut::new(Some(sc_mods()), Code::KeyS) }
fn sc_problem() -> Shortcut { Shortcut::new(Some(sc_mods()), Code::KeyF) }
fn sc_read() -> Shortcut { Shortcut::new(Some(sc_mods()), Code::KeyR) }
fn sc_accept() -> Shortcut { Shortcut::new(Some(sc_mods()), Code::KeyA) }
fn sc_explain() -> Shortcut { Shortcut::new(Some(sc_mods()), Code::KeyE) }
fn sc_esc() -> Shortcut { Shortcut::new(None, Code::Escape) }
static ARMED: AtomicU64 = AtomicU64::new(0);

/// Accept and dismiss hotkeys exist only while a result is showing, and give themselves up after a minute and a half.
/// Esc is taken from the person's apps only for that long (T11).
fn arm_result_keys(app: &AppHandle, on: bool) {
    let gs = app.global_shortcut();
    if on {
        let gen = ARMED.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = gs.register(sc_accept()); let _ = gs.register(sc_esc());
        let a = app.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(90)); if ARMED.load(Ordering::SeqCst) == gen { arm_result_keys(&a, false); } });
    } else {
        ARMED.fetch_add(1, Ordering::SeqCst);
        let _ = gs.unregister(sc_accept()); let _ = gs.unregister(sc_esc());
    }
}

#[tauri::command] fn ph_consent(app: AppHandle, choice: String) { phelp::consent_answer(&app, &choice); }
#[tauri::command] fn ph_ready(app: AppHandle, text: String, handback: String) { phelp::ready(text, handback == "copy"); arm_result_keys(&app, true); }
#[tauri::command] fn ph_accept(app: AppHandle) { arm_result_keys(&app, false); phelp::put_back(&app, false); }
#[tauri::command] fn ph_restore(app: AppHandle) { arm_result_keys(&app, false); phelp::put_back(&app, true); }
#[tauri::command] fn ph_dismiss(app: AppHandle) { arm_result_keys(&app, false); phelp::dismiss(&app); }
#[tauri::command] fn ph_answer(app: AppHandle, answer: String) { arm_result_keys(&app, false); phelp::answer(&app, answer); }
// The error explainer's card: the answer about reading in this app (shared with Prompt help), and Close.
#[tauri::command] fn eh_consent(app: AppHandle, choice: String) { errhelp::consent_answer(&app, &choice); }
#[tauri::command] fn eh_dismiss(app: AppHandle) { errhelp::dismiss(&app); }

#[tauri::command]
fn permissions_status() -> permissions::Permissions { permissions::current() }

/// Show the card. `keyboard` is true only when the user asked to type (hotkey or Type button);
/// clicking the character shows the card without taking the keyboard.
fn open_card(app: &AppHandle, source: &str, keyboard: bool) {
    log("card_open", json!({ "source": source, "keyboard": keyboard }));
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        let was_open = HOME_OPEN.load(Ordering::SeqCst) && card_visible();
        if !was_open { HOME_OPEN.store(true, Ordering::SeqCst); HOME_GEN.fetch_add(1, Ordering::SeqCst); reset_hover(); }
        // Home opens on the display the person is using (the one with the pointer): the island goes there first.
        place_island(mtm, true, "home_opened");
        with_panels(|d, c| {
            place_card(d, c);
            c.orderFrontRegardless();
            if keyboard { c.makeKeyWindow(); }
            log("card_shown", json!({ "card_key": c.isKeyWindow(), "app_active": active(mtm) }));
        });
        if !was_open { watch_click_away(&a); }
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
    runner::check_project(&cmd, &current_project())?;
    app.state::<runner::Runner>().send(&cmd)
}

#[tauri::command]
fn open_card_cmd(app: AppHandle) {
    open_card(&app, "button", true);
}

/// Clicking the character shows or hides Home, and never takes the keyboard.
#[tauri::command]
fn toggle_card(app: AppHandle) { toggle_home(app, "character"); }

/// Clicking the island in the notch does the same (F18).
#[tauri::command]
fn island_click(app: AppHandle) { toggle_home(app, "island"); }

fn toggle_home(app: AppHandle, source: &'static str) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        if card_visible() {
            with_panels(|_, c| c.orderOut(None));
            home_closed();
            log("card_closed", json!({ "source": source }));
            card_closed_hush(&a);
        } else {
            open_card(&a, source, false);
        }
    });
}

/// The card page tells us how tall its content is; we resize the panel to fit.
#[tauri::command]
fn resize_card(app: AppHandle, height: f64) {
    let h = height.clamp(CARD.1, CARD_MAX_H);
    CARD_H.store(h as u64, Ordering::SeqCst);
    let _ = app.run_on_main_thread(move || { with_panels(|d, c| if c.isVisible() { place_card(d, c) }); });
}

/// The folder tasks run in. For now it comes from the dev settings file or a safe playground folder.
#[tauri::command]
fn get_project() -> String { current_project() }

fn projects_path() -> PathBuf { data_dir().join("projects.json") }
fn current_project() -> String { PROJECT.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or_default() }
fn home_dir() -> String { std::env::var("HOME").unwrap_or_default() }

/// The folders the person chose before (still on disk), newest first.
#[tauri::command]
fn list_projects() -> Vec<String> { projects::load(&projects_path()).still_there() }

/// Switch to a folder from the list, or one just picked. Only folders that pass the checks are ever used.
#[tauri::command]
fn use_project(app: AppHandle, path: String) -> Result<String, String> {
    // From a web page, only a folder that is already on the person's list of projects (new ones come from the folder chooser or a link).
    if !projects::load(&projects_path()).recent.iter().any(|r| *r == path) { return Err("Pick a folder from your list, or choose a new one with the folder button.".into()); }
    use_project_inner(app, path)
}
fn use_project_inner(app: AppHandle, path: String) -> Result<String, String> {
    let ok = projects::validate(&path, &home_dir(), &data_dir())?;
    let folder = ok.to_string_lossy().to_string();
    let mut p = projects::load(&projects_path());
    p.use_folder(&folder);
    let _ = logfile::write_atomic(&projects_path(), serde_json::to_string(&p).unwrap_or_default().as_bytes());
    *PROJECT.lock().unwrap_or_else(|e| e.into_inner()) = Some(folder.clone());
    log("project_changed", json!({}));
    let _ = app.emit("project-changed", &folder);
    Ok(folder)
}

/// Saves the person's own key into the Keychain. The page clears its box right after; nothing here is ever logged.
#[tauri::command]
fn save_api_key(app: AppHandle, key: String) -> Result<(), String> {
    keystore::save(&key)?;
    log("api_key_saved", json!({}));
    hand_key_over(&app, Some(&key));
    Ok(())
}

/// Gives the engine the key on its own pipe (never logged, never shown to a page). With None it reads the Keychain first,
/// which for a key saved by an older version also moves it to this app's own trust; that can show the Mac's one "allow?"
/// dialog, so it runs off the thread that reads the engine's output.
fn hand_key_over(app: &AppHandle, key: Option<&str>) {
    let (a, key) = (app.clone(), key.map(str::to_string));
    std::thread::spawn(move || {
        let key = key.or_else(|| { let moved = keystore::move_old_item(&data_dir()); log("key_move", json!({ "moved": moved })); keystore::read() });
        let _ = a.state::<runner::Runner>().hand_key(key.as_deref());
    });
}

/// Settings: removes the person's key from the Keychain, after the page asked them first, and tells the engine at once
/// that it has no key, so a removed key stops being used. Only from the card, only with the exact words.
#[tauri::command]
fn remove_api_key(app: AppHandle, window: tauri::WebviewWindow, confirm: String) -> Result<(), String> {
    let svc = keystore::service();
    // The tested gate: an unconfirmed call never reaches the Keychain, and the key counts as gone only once it is not there.
    keystore::remove_with(window.label(), &confirm, || keystore::delete_item(&svc, keystore::ACCOUNT), || keystore::exists(&svc, keystore::ACCOUNT))?;
    log("api_key_removed", json!({}));
    // If the engine is not running now, it is told the same when it starts again: it reads the Keychain, which is empty.
    let _ = app.state::<runner::Runner>().hand_key(None);
    Ok(())
}

/// Opens the Mac's own folder chooser (another process, so the keyboard is never taken), then uses the folder.
#[tauri::command]
async fn pick_project(app: AppHandle) -> Result<String, String> {
    let _dialog = NativeDialog::open();
    let chosen = tauri::async_runtime::spawn_blocking(projects::choose_folder).await.map_err(|_| "The folder chooser stopped.".to_string())?;
    match chosen { Some(path) => use_project_inner(app, path), None => Err(String::new()) }
}

/// Open a project from a link: the person picks where it goes, then the runner copies it into a new folder there.
#[tauri::command]
async fn clone_project(app: AppHandle, url: String) -> Result<(), String> {
    let url = url.trim().to_string();
    if !url.starts_with("https://") { return Err("Paste the project's link; it starts with https://".into()); }
    let dialog = NativeDialog::open();
    let chosen = tauri::async_runtime::spawn_blocking(projects::choose_parent).await.map_err(|_| "The folder chooser stopped.".to_string())?;
    drop(dialog);
    let Some(parent) = chosen else { return Err(String::new()) };
    let parent = projects::validate_parent(&parent, &home_dir(), &data_dir())?;
    let cmd = json!({ "v": 1, "id": format!("clone{}", now()), "type": "project.clone", "url": url, "parent": parent.to_string_lossy() });
    app.state::<runner::Runner>().send(&cmd).map_err(|_| "Companion's engine is not running. Try again in a moment.".to_string())
}

#[tauri::command]
fn close_card(app: AppHandle) {
    card_closed_hush(&app);   // closing the card silences it
    { let a = app.clone(); std::thread::spawn(move || arm_result_keys(&a, false)); }   // and gives back Esc and Accept, which Prompt help borrows system wide while a result waits
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        with_panels(|_, c| c.orderOut(None));
        home_closed();
        log("card_closed", json!({ "app_active": active(mtm) }));
    });
}

// ---------- Show me how: look, ask, point ----------

/// The pointer's panel: covers one display, draws only the arrow, ring and caption, ignores the mouse, never takes the keyboard.
fn make_overlay(mtm: MainThreadMarker, tauri_win: &NSWindow) -> Retained<NSPanel> {
    let p = make_panel(mtm, tauri_win, false, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(100.0, 100.0)));
    p.setOpaque(false);
    p.setHasShadow(false);
    p.setBackgroundColor(Some(&NSColor::clearColor()));
    p.setIgnoresMouseEvents(true);
    p.setLevel(25);
    p
}

fn say_showme(app: &AppHandle, stage: &str, message: &str, extra: Value) {
    let mut v = json!({ "v": 1, "id": format!("sm{}", now()), "type": "app.showme", "stage": stage, "message": message });
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) { for (k, x) in e { o.insert(k.clone(), x.clone()); } }
    runner::Runner::publish(app, v);
}

fn hide_overlay(app: &AppHandle) {
    OVERLAY_BUSY_UNTIL.store(0, std::sync::atomic::Ordering::SeqCst);
    let _ = app.emit_to("overlay", "overlay-clear", ());
    let _ = app.run_on_main_thread(|| { OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.orderOut(None); } }); });
}

/// The card was closed (Esc, or a click on the character): it goes quiet. What is being said stops, a Show me answer still
/// playing ends (no step still to come is drawn or said), and the page drops any line still waiting to be said. A ring that
/// waits for the person's own click stays: it is still their turn.
fn card_closed_hush(app: &AppHandle) {
    speech_off(app);
    showme_end_answer(app);
    let _ = app.emit("hush", ());
}

/// Ends a Show me answer still on its way or still playing (closing the card, holding to talk, Point at the problem): no
/// step still to come is drawn, the ring of a step in the middle goes away, what was seen is forgotten, and the page is told
/// ("done"), so it stops its own timers too. A ring waiting for the click is never touched here: the last step has already
/// taken the answer, so by then there is nothing left to end.
fn showme_end_answer(app: &AppHandle) {
    if !showme_pending().end() { return; }
    point_cancel(); hide_overlay(app);
    log("showme_answer_ended", json!({}));
    say_showme(app, "done", "", json!({}));
}

/// Stop everything also takes the pointer away and forgets what was seen.
fn showme_stop(app: &AppHandle) {
    // Prompt help reading or waiting for a decision ends too, and the keys it borrowed (Accept, and Esc everywhere) are given back.
    // Changing shortcuts from inside a shortcut handler can deadlock, so that part runs on its own thread.
    phelp::dismiss(app);
    errhelp::dismiss(app);   // an error being read is dropped unsent
    let a = app.clone(); std::thread::spawn(move || arm_result_keys(&a, false));
    showme_stop_rest(app);
}
fn showme_stop_rest(app: &AppHandle) { speech_off(app); point_cancel(); voice_send(app, VoiceMsg::Cancel); hide_overlay(app); showme_pending().end(); roam_end(app); }

/// The hotkey or the button: look at the screen once (light first), cover secrets, and ask the engine where to click.
/// `all_screens`: the person's setting to include every display, not only the one under the pointer (off unless turned on).
#[tauri::command]
fn showme_start(app: AppHandle, question: String, all_screens: Option<bool>) {
    // A new question replaces whatever ring was up (and any pointing still on its way); what an older answer saw is forgotten.
    point_cancel(); hide_overlay(&app); showme_pending().end();
    let question = question.split_whitespace().collect::<Vec<_>>().join(" ");
    if question.is_empty() { say_showme(&app, "error", "Type what you want to find, then press Show me.", json!({})); return; }
    // Stop everything (or a newer press) moves this on: a look already under way must not send its picture afterwards.
    let gen = POINT_GEN.load(std::sync::atomic::Ordering::SeqCst);
    let current = move || POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) == gen;
    std::thread::spawn(move || {
        use showme::Platform;
        let req = format!("sm_{}", now());
        let (a1, a2, a3, req1, req2) = (app.clone(), app.clone(), app.clone(), req.clone(), req.clone());
        let plat = macos_see::MacPlatform::new(
            // One picture per screen (the pointer's first), each under its own name; then one question about all of them.
            Box::new(move |screen, jpeg, w, h| {
                if !current() { return; }
                use base64::Engine;
                let cmd = json!({ "v": 1, "id": format!("img{}-{screen}", now()), "type": "assist.image", "ref": showme::image_ref(&req1, screen), "mediaType": "image/jpeg", "base64": base64::engine::general_purpose::STANDARD.encode(jpeg), "w": w, "h": h });
                let _ = a1.state::<runner::Runner>().send(&cmd);
            }),
            Box::new(move |q, pics, cands| {
                if !current() { return; }
                let _ = a2.state::<runner::Runner>().send(&showme::locate_command(&req2, q, pics, cands));
            }),
            Box::new(move |on| { if !on { return; } say_showme(&a3, "looking", "Looking at your screen", json!({})); std::thread::sleep(Duration::from_millis(250)); /* the light is on screen before the capture */ }),
        );
        if !plat.screen_recording_granted() {
            // Asked here, the first time the feature is used, with a plain sentence first.
            macos_see::request_screen_recording();
            say_showme(&app, "needs_permission", "Allow Screen Recording for Companion in System Settings, then press Show me again. macOS may ask you to reopen Companion.", json!({}));
            return;
        }
        log("showme_start", json!({}));
        match showme::start_on(&plat, &question, all_screens.unwrap_or(false)) {
            Ok(prep) => {
                if !current() { return; }
                let covered = prep.covered;
                log("showme_screens", json!({ "screens": prep.shots.len() }));
                showme_pending().begin(&req, prep);
                say_showme(&app, "thinking", if covered > 0 { "Finding it. I covered some private text first." } else { "Finding it" }, json!({ "req": req, "covered": covered }));
            }
            Err(showme::Refusal::NeedsScreenRecording) => say_showme(&app, "needs_permission", "Allow Screen Recording for Companion in System Settings, then press Show me again.", json!({})),
            Err(showme::Refusal::SecureInput) => say_showme(&app, "error", "A password box is active, so I did not look at your screen. Click away from it and try again.", json!({})),
            Err(showme::Refusal::CaptureFailed(e)) => say_showme(&app, "error", &format!("I could not look at your screen ({e})."), json!({})),
            Err(showme::Refusal::PictureFailed(e)) => say_showme(&app, "error", &format!("I could not prepare the picture ({e})."), json!({})),
        }
    });
}

/// The window a ring at this spot belongs to (rule 22: a ring is drawn inside it and goes away if it changes).
fn front_pid() -> i32 { NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier()).unwrap_or(0) }
fn anchor_for(target: coords::R) -> Option<anchor::Anchor> {
    let c = target.center();
    anchor::anchor_at(&fullscreen::sys::on_screen_windows(), std::process::id() as i32, front_pid(), c.x, c.y)
}

/// How a pointer is drawn beyond its place and words: a hand drawn mark for a confirmed target, how long the flight takes
/// (a step of a multi step answer flies for its lead in), how long the mark stays, and where the flight starts (the last
/// target of the same answer, or the character).
#[derive(Clone, Copy, Default)]
struct Look { mark: Option<&'static str>, fly_ms: Option<u64>, fade_ms: Option<u64>, from: Option<coords::Pt> }

/// Draws the arrow flying from the character to `rect` (global top-left points) on display `d`, then the ring and caption.
/// The ring is clipped to the window under it. What it belongs to (that window, or with none the app in front) is handed
/// back so the caller can watch it (`your_turn` for a ring that waits for a click, `watch_ring` for one that does not).
fn draw_pointer(app: &AppHandle, d: coords::R, rect: coords::R, caption: &str, exact: bool, hold: bool) -> anchor::Watched { draw_pointer_with(app, d, rect, caption, exact, hold, Look::default()) }
fn draw_pointer_with(app: &AppHandle, d: coords::R, rect: coords::R, caption: &str, exact: bool, hold: bool, look: Look) -> anchor::Watched {
    // The overlay takes a ring that does not wait away ten seconds after this order (the flight included); the watch and
    // this busy time last a little longer, so confetti never plays over it and no part of it goes unwatched.
    OVERLAY_BUSY_UNTIL.store(if hold { u64::MAX } else { now() as u64 + anchor::WATCH_MAX_MS }, std::sync::atomic::Ordering::SeqCst);
    let a = app.clone();
    let caption2 = caption.to_string();
    let watched = anchor::watched_for(anchor_for(rect), front_pid());
    // Rule 22: a solid ring only where the window it sits in is confirmed. Over a menu, a dialog or anything that is not
    // an ordinary window the ring is soft and says it is a guess.
    let exact = exact && watched.window().is_some();
    let clip = watched.window().map(|an| json!({ "x": an.bounds[0] - d.x, "y": an.bounds[1] - d.y, "w": an.bounds[2], "h": an.bounds[3] }));
    let anchored = watched.window().cloned();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        let primary_h = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        // The flight starts at the last target of the same answer on this display, or else where the character is now,
        // read before it sets off: it follows the arrow to the window.
        let here = roam::arrow_start(with_panels(|dock, _| from_appkit(dock.frame(), primary_h)), (d.x + d.w - 40.0, d.y + d.h / 2.0));
        let from = look.from.filter(|p| d.contains(*p)).map(|p| (p.x, p.y)).unwrap_or(here);
        // The character comes beside the window the ring is in (F18 item 2); a ring with no confirmed window leaves it home.
        roam_to(&a, mtm, anchored.as_ref(), [rect.x, rect.y, rect.w, rect.h]);
        let payload = json!({ "rect": { "x": rect.x - d.x, "y": rect.y - d.y, "w": rect.w, "h": rect.h }, "from": { "x": from.0 - d.x, "y": from.1 - d.y }, "caption": caption2, "exact": exact, "hold": hold, "clip": clip,
            "mark": look.mark, "flyMs": look.fly_ms.map(|v| v.clamp(300, 1600)), "fadeMs": look.fade_ms.map(|v| v.clamp(1000, 12_000)) });
        let ak = coords::rect_to_appkit(d, primary_h);
        OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setFrame_display(NSRect::new(NSPoint::new(ak.x, ak.y), NSSize::new(ak.w, ak.h)), true); p.orderFrontRegardless(); } });
        let _ = a.emit_to("overlay", "overlay-point", payload);
    });
    watched
}

/// What the person is told when a ring went away because its window changed (moved, closed, covered, another app in front).
const RING_WINDOW_CHANGED: &str = "The window changed, so I took the ring away. Press Show me where to point again.";

/// A ring that does not wait for a click (a step in the middle of a multi step answer, Point at the problem's line or
/// error) is watched while it is up, like the your turn ring: if its window moves, closes, is covered or another app comes
/// to the front, it goes away at once and the page is told (rule 22). It stops by itself when a newer ring, Stop or Esc
/// takes it away, or after the overlay's own ten seconds. Window owners and sizes only, no permission, never content.
fn watch_ring(app: &AppHandle, target: coords::R, an: anchor::Watched, showme_req: Option<String>) {
    use std::sync::atomic::Ordering::SeqCst;
    let gen = POINT_GEN.load(SeqCst);
    let alive = move || POINT_GEN.load(SeqCst) == gen && overlay_busy();
    let app = app.clone();
    std::thread::spawn(move || {
        let c = target.center();
        let polls = (anchor::WATCH_MAX_MS / anchor::WATCH_POLL_MS) as u32;
        let v = anchor::watch(&an, std::process::id() as i32, c.x, c.y, polls, alive,
            || (fullscreen::sys::on_screen_windows(), front_pid()), || std::thread::sleep(Duration::from_millis(anchor::WATCH_POLL_MS)));
        let Some(v) = v else { return };
        log("ring_window_changed", json!({ "why": format!("{v:?}"), "showme": showme_req.is_some() }));
        // What was seen no longer shows what is there, so the rest of a multi step answer is not drawn either.
        if let Some(req) = &showme_req { showme_pending().end_if(req); }
        point_cancel(); hide_overlay(&app);
        say_showme(&app, "window_changed", RING_WINDOW_CHANGED, json!({}));
    });
}

/// The engine chose a point in one screen's picture: snap it to something real, then draw the pointer. A multi step answer
/// sends one step at a time (the page plays them in order, sequence.ts): every step but the last keeps what was seen for
/// the next one and does not wait for a click; the last one takes it and waits. Nothing is drawn over a window that changed
/// since the picture was taken (rule 22): then the answer is over and the page is told why.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn showme_aim(app: AppHandle, req: String, x: f64, y: f64, ocr_id: Option<String>, target_text: String, caption: String, mark: Option<String>, screen: Option<u32>, step: Option<u32>, of: Option<u32>, hold: Option<bool>, fly_ms: Option<u64>, fade_ms: Option<u64>) -> Value {
    let last = showme::is_last(step, of);
    let hold = hold.unwrap_or(true) && last;
    // Gone: the answer was ended (Stop, the card closed, hold to talk, Point at the problem, a newer question) or is over.
    let Some((prep, from)) = showme_pending().step(&req, last) else { return json!({ "ok": false, "why": "gone" }) };
    let plat = macos_see::MacPlatform::new(Box::new(|_, _, _, _| {}), Box::new(|_, _, _| {}), Box::new(|_| {}));
    let Some((s, display)) = showme::aim(&plat, &prep, screen.unwrap_or(1) as usize, x, y, ocr_id.as_deref(), &target_text) else {
        showme_pending().end_if(&req);
        return json!({ "ok": false, "why": "gone" });
    };
    // The window under the target must still be the one in the picture.
    if !showme::unchanged(&prep, std::process::id() as i32, &fullscreen::sys::on_screen_windows(), front_pid(), s.rect) {
        log("showme_window_changed", json!({}));
        showme_pending().end_if(&req);
        point_cancel(); hide_overlay(&app);
        return json!({ "ok": false, "why": "window_changed" });
    }
    POINT_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);   // a point_problem still on its way must not draw over this
    if !last { showme_pending().pointed(&req, s.rect.center()); }
    log("showme_aimed", json!({ "how": format!("{:?}", s.how), "exact": s.exact, "step": step, "of": of, "screen": screen.unwrap_or(1) }));
    let look = Look { mark: showme::mark_name(mark.as_deref()), fly_ms, fade_ms, from: if step.unwrap_or(1) > 1 { from } else { None } };
    let watched = draw_pointer_with(&app, display, s.rect, &caption, s.exact, hold, look);
    // The ring goes away the moment its window changes (or, with no window under it, another app comes to the front): the
    // last step's while it waits for the click, the others while they are up.
    if hold { your_turn(&app, display, s.rect, &target_text); } else { watch_ring(&app, s.rect, watched, Some(req.clone())); }
    say_showme(&app, if s.exact { "pointing" } else { "pointing_roughly" }, &caption, showme::pointing_extra(&req, step.unwrap_or(1), of.unwrap_or(1), hold));
    json!({ "ok": true })
}

/// A step of a multi step answer is said in words instead of drawn: the pointer goes away, what was seen is kept for the
/// steps after it.
#[tauri::command]
fn showme_hide(app: AppHandle) { turn_cancel(); hide_overlay(&app); }

/// The pointer goes away: a click, Esc, Stop everything, or the ten seconds running out.
#[tauri::command]
fn showme_clear(app: AppHandle) { point_cancel(); hide_overlay(&app); showme_pending().end(); say_showme(&app, "done", "", json!({})); }

// ---------- Your turn ----------

/// The ring stays up and waits for the person's own click. Only the mouse position and whether a button is down are
/// read, only while the ring is up (no permission needed, never keys, never screen content).
fn your_turn(app: &AppHandle, display: coords::R, target: coords::R, label: &str) {
    turn_cancel();
    *TURN.lock().unwrap_or_else(|e| e.into_inner()) = Some((target, label.to_string()));
    let gen = TURN_GEN.load(std::sync::atomic::Ordering::SeqCst);
    let alive = move || TURN_GEN.load(std::sync::atomic::Ordering::SeqCst) == gen;
    let app = app.clone();
    std::thread::spawn(move || {
        let down = || NSEvent::pressedMouseButtons() & 1 == 1;
        let mut w = yourturn::Watch::new(target, down());
        // Companion's own character and card, read at the moment of a press (the card grows and moves while the ring is up).
        let a2 = app.clone();
        let ours = move || -> Vec<coords::R> {
            let (tx, rx) = std::sync::mpsc::channel::<Vec<coords::R>>();
            let _ = a2.run_on_main_thread(move || {
                let mtm = MainThreadMarker::new().unwrap();
                let primary_h = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
                let mut v = with_panels(|dock, card| [dock, card].iter().filter(|p| p.isVisible()).map(|p| { let f = p.frame(); coords::R { x: f.origin.x, y: primary_h - f.origin.y - f.size.height, w: f.size.width, h: f.size.height } }).collect::<Vec<_>>()).unwrap_or_default();
                if let Some(r) = island_rect(primary_h) { v.push(coords::R { x: r[0], y: r[1], w: r[2], h: r[3] }); }
                let _ = tx.send(v);
            });
            rx.recv_timeout(Duration::from_millis(500)).unwrap_or_default()
        };
        let t0 = std::time::Instant::now();
        log("your_turn", json!({}));
        // The window it was confirmed in, or with none under it (a menu, a dialog, the desktop) the app in front.
        let watched = anchor::watched_for(anchor_for(target), front_pid());
        let (mut polls, tc) = (0u32, target.center());
        while alive() && t0.elapsed().as_millis() < yourturn::WAIT_MS as u128 {
            std::thread::sleep(Duration::from_millis(yourturn::POLL_MS));
            polls += 1;
            // Four times a second: is the ring still on the window it was confirmed in (or the same app in front)? If not,
            // it goes away.
            if polls % 15 == 0 {
                let v = anchor::check_watched(&watched, &fullscreen::sys::on_screen_windows(), std::process::id() as i32, front_pid(), tc.x, tc.y);
                if v != anchor::Verdict::Fine && alive() {
                    log("your_turn_window_changed", json!({ "why": format!("{v:?}") }));
                    turn_cancel(); hide_overlay(&app);
                    say_showme(&app, "window_changed", RING_WINDOW_CHANGED, json!({}));
                    return;
                }
            }
            match w.sample(down(), macos_see::pointer(), &ours) {
                Some(yourturn::Heard::Hit) => {
                    if !alive() { return; }
                    *TURN.lock().unwrap_or_else(|e| e.into_inner()) = None;
                    log("your_turn_hit", json!({ "misses": w.misses }));
                    let r = json!({ "x": target.x - display.x, "y": target.y - display.y, "w": target.w, "h": target.h });
                    let _ = app.emit_to("overlay", "overlay-celebrate", json!({ "rect": r }));
                    say_showme(&app, "your_turn_done", "That's it.", json!({}));
                    std::thread::sleep(Duration::from_millis(1400));
                    if alive() { hide_overlay(&app); }
                    return;
                }
                Some(yourturn::Heard::Miss) => {
                    let m = if w.misses >= 3 { "Not quite. Click inside the ring, or press Do it for me." } else { "Not quite. Click inside the ring." };
                    say_showme(&app, "your_turn_miss", m, json!({ "misses": w.misses }));
                }
                _ => {}
            }
        }
        // Waited long enough: the ring goes away quietly.
        if alive() { turn_cancel(); hide_overlay(&app); say_showme(&app, "done", "", json!({})); }
    });
}

/// Do it for me: press the target through Accessibility (asked for the first time this is used). Never anything that
/// sends, pays, deletes or publishes: the label is checked again on the real element at the moment of pressing.
#[tauri::command]
fn do_it_for_me(app: AppHandle) {
    let Some((target, label)) = TURN.lock().unwrap_or_else(|e| e.into_inner()).clone() else { return };
    let gen = TURN_GEN.load(std::sync::atomic::Ordering::SeqCst);
    // Off the main thread: an app that is not answering can hold Accessibility for seconds, and Stop must still work.
    std::thread::spawn(move || {
        const SELF: &str = "This one sends, pays, deletes, publishes or answers a question, so please click it yourself.";
        if yourturn::risky(&label) { say_showme(&app, "your_turn_miss", SELF, json!({})); return; }
        if !ax::trusted(false) {
            ax::trusted(true);
            say_showme(&app, "needs_permission", "To click for you, Companion needs Accessibility. Allow it in System Settings, then press Do it for me again. Or click it yourself.", json!({}));
            return;
        }
        if TURN_GEN.load(std::sync::atomic::Ordering::SeqCst) != gen { return; }
        let c = target.center();
        match ax::press_at_checked(c.x, c.y, yourturn::may_press) {
            Ok(()) => { turn_cancel(); hide_overlay(&app); log("done_for_you", json!({})); say_showme(&app, "done_for_you", "Done. I clicked it for you.", json!({})); }
            Err(why) => {
                log("do_it_for_me_refused", json!({ "why": why }));
                let m = match why { "risky" | "dialog" | "no_label" => SELF, _ => "I could not click that one. Please click it yourself." };
                say_showme(&app, "your_turn_miss", m, json!({}));
            }
        }
    });
}

// ---------- Updates ----------

static PENDING_UPDATE: Mutex<Option<tauri_plugin_updater::Update>> = Mutex::new(None);

/// Is the updater set up in this build, and which version is running.
#[tauri::command]
fn update_status(app: AppHandle) -> Value { json!({ "configured": updates::parse_config(include_str!("../updater.json")).is_some(), "version": app.package_info().version.to_string() }) }

/// Asks the update address whether a newer version exists. Only when the person asked (or turned on the daily check).
#[tauri::command]
async fn check_update(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    if window.label() != "card" { return Err("Updates can only be started from the card.".into()); }
    let cfg = updates::parse_config(include_str!("../updater.json")).ok_or("Updates are not set up in this build yet.")?;
    let url = tauri::Url::parse(&cfg.endpoint).map_err(|_| "Updates are not set up in this build yet.".to_string())?;
    let upd = app.updater_builder().pubkey(cfg.pubkey).timeout(Duration::from_secs(20)).endpoints(vec![url]).map_err(|e| updates::failure_words(&e.to_string()).to_string())?
        .build().map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    match upd.check().await {
        Ok(Some(u)) => {
            let out = json!({ "available": true, "version": u.version, "notes": u.body.clone().unwrap_or_default().chars().take(600).collect::<String>() });
            *PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(u);
            log("update_found", json!({}));
            Ok(out)
        }
        Ok(None) => { *PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()) = None; Ok(json!({ "available": false })) }
        Err(e) => { log("update_check_failed", json!({})); Err(updates::failure_words(&e.to_string()).to_string()) }
    }
}

/// Downloads the update found by check_update, checks its signature, installs it and restarts. Only on a press.
#[tauri::command]
async fn install_update(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "card" { return Err("Updates can only be started from the card.".into()); }
    let u = PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()).take().ok_or("Check for updates first.")?;
    u.download_and_install(|_, _| {}, || {}).await.map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    log("update_installed", json!({}));
    // `restart` goes round the normal exit path: end the engine (and what it runs) properly first, so nothing is left running.
    app.state::<runner::Runner>().shut_down();
    app.restart();
}

// ---------- Screen sharing and calls (rule 7) ----------

fn presentation_path() -> PathBuf { data_dir().join("presentation.json") }
static PRESENTATION: Mutex<Option<presentation::Settings>> = Mutex::new(None);
fn presentation_now() -> presentation::Settings {
    *PRESENTATION.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(|| presentation::parse(std::fs::read_to_string(presentation_path()).ok().as_deref()))
}

/// Asks macOS to leave the overlay and the card out of other apps' screen captures, or puts back the default. Main thread.
/// Best effort (see presentation.rs). Companion's own capture leaves its own windows out by process either way.
fn apply_sharing(s: &presentation::Settings) {
    let t = objc2_app_kit::NSWindowSharingType(presentation::sharing_type(s));
    // F18: the character too, wherever it is (at home or beside a window).
    with_panels(|dock, card| { card.setSharingType(t); dock.setSharingType(t); });
    OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setSharingType(t); } });
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { p.setSharingType(t); } });
}

/// Quiet during calls: a known call app is in front (and, once verified, a camera is in use). Only the front app's id (and
/// whether a camera is on) is looked at, and only at the moment something would be said or a reaction would play.
fn quiet() -> bool { presentation::quiet(&presentation_now(), &front_id(), || presentation::CAMERA_CHECK_ON && presentation::mac::camera_in_use()) }

#[tauri::command]
fn presentation_settings() -> Value { presentation::to_json(&presentation_now()) }

/// Settings: both switches at once. Only from the card. Saved in Companion's own folder, applied at once.
#[tauri::command]
fn set_presentation(app: AppHandle, window: tauri::WebviewWindow, hide_from_sharing: bool, quiet_on_calls: bool) -> Result<Value, String> {
    if window.label() != "card" { return Err("This can only be changed from the card.".into()); }
    let s = presentation::Settings { hide_from_sharing, quiet_on_calls };
    logfile::write_atomic(&presentation_path(), presentation::to_json(&s).to_string().as_bytes()).map_err(|_| "Could not save that setting.".to_string())?;
    *PRESENTATION.lock().unwrap_or_else(|e| e.into_inner()) = Some(s);
    let _ = app.run_on_main_thread(move || apply_sharing(&s));
    log("presentation_set", json!({ "hide": hide_from_sharing, "quiet": quiet_on_calls }));
    if s.quiet_on_calls && quiet() { speech_off(&app); }
    Ok(presentation::to_json(&s))
}

/// For the character: should it hold back its reaction right now?
#[tauri::command]
fn quiet_now() -> bool { quiet() }

// ---------- Spoken replies ----------

static LAST_SAID: Mutex<Option<speak::Last>> = Mutex::new(None);

/// The "your Mac's sound is off" line is said once each time the sound goes off (voiceset::SoundNote).
static SOUND_NOTE: Mutex<voiceset::SoundNote> = Mutex::new(voiceset::SoundNote::new());

/// Says one short line with the Mac's built in voice, in the voice and at the speed picked in Settings (voice.json). The
/// page only calls this when the person turned "Speak to me" on, or "Answer out loud" for a question they asked by voice
/// (`whole`: a whole short answer, with `rest` said when it had to be cut). Only from the card, only plain text of a
/// sensible length, nothing secret looking, never over the person's own voice (nothing is said while hold to talk listens,
/// so the Mac's voice never plays into the open microphone), never during a call, and never into a Mac whose sound is off:
/// then nothing is said, the words stay on the card, and the page is told once so it can say so.
#[tauri::command]
fn speak(app: AppHandle, window: tauri::WebviewWindow, text: String, whole: Option<bool>, rest: Option<String>) -> Result<Value, String> {
    if window.label() != "card" { return Err("Speaking can only be started from the card.".into()); }
    let line = if whole == Some(true) { speak::prepare_reply(&text, rest.as_deref().unwrap_or("")) } else { speak::prepare(&text) };
    let Some(line) = line else { return Ok(json!({ "said": false, "why": "nothing" })) };
    // The person is talking: the line is dropped, its words stay on the card.
    if listening_now() { log("speak_listening", json!({})); return Ok(json!({ "said": false, "why": "listening" })); }
    // Quiet during calls (rule 7): nothing is said while a call app is in front (presentation.rs).
    if quiet() { log("speak_quiet", json!({})); return Ok(json!({ "said": false, "why": "quiet" })); }
    let sound = speak::mac::sound_now();
    let tell = SOUND_NOTE.lock().unwrap_or_else(|e| e.into_inner()).tell(sound);
    if sound != voiceset::Sound::On {
        log("speak_no_sound", json!({ "sound": voiceset::sound_word(sound) }));
        return Ok(json!({ "said": false, "why": "sound", "sound": voiceset::sound_word(sound), "tell": tell }));
    }
    let ok = LAST_SAID.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(Default::default).should_say(&line, now() as u64);
    if !ok { return Ok(json!({ "said": false, "why": "repeat" })); }
    log("speak", json!({ "chars": line.chars().count(), "whole": whole == Some(true) }));   // how long, never what
    let set = voice_now();
    let _ = app.run_on_main_thread(move || speak::mac::say(&line, set.voice.as_ref(), set.speed));
    Ok(json!({ "said": true }))
}

// ---------- Voice settings (M11 wave 4 item 2; the rules are in voiceset.rs) ----------

fn voice_path() -> PathBuf { data_dir().join("voice.json") }
static VOICE_SET: Mutex<Option<voiceset::Saved>> = Mutex::new(None);
/// The voice, speed, microphone and language picked in Settings (the Mac's own choices until then).
fn voice_now() -> voiceset::Saved {
    VOICE_SET.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(|| voiceset::parse(std::fs::read_to_string(voice_path()).ok().as_deref())).clone()
}
/// The "your microphone is not connected" line is said once each time it goes away (voiceset::MicNote).
static MIC_NOTE: Mutex<voiceset::MicNote> = Mutex::new(voiceset::MicNote::new());

fn voice_state(set: &voiceset::Saved, voices: &[voiceset::VoiceInfo]) -> Value {
    let (inputs, default_id) = voice_mac::inputs();
    voiceset::state_json(set, voices, &speak::mac::mac_language(), &inputs, default_id.as_deref(), speak::mac::sound_now())
}

/// Settings: the Mac's voices and microphones, what is picked, what is away, and whether the sound is on. Only from the
/// card. A sync command, so it runs on the main thread, where the voice list is read. Reads names only; nothing listens.
#[tauri::command]
fn voice_settings(window: tauri::WebviewWindow) -> Result<Value, String> {
    if window.label() != "card" { return Err("not_card".into()); }
    Ok(voice_state(&voice_now(), &speak::mac::voices()))
}

/// The card's start: only the speed picked in Settings, for Show me's timing (sequence.ts lineMs). Nothing is listed: the
/// voices and microphones are read only when Settings is opened.
#[tauri::command]
fn voice_speed(window: tauri::WebviewWindow) -> Result<f64, String> {
    if window.label() != "card" { return Err("not_card".into()); }
    Ok(voice_now().speed)
}

/// Settings: pick a voice, a speed, a microphone and a language. Only from the card, only what is on this Mac now (or what
/// was already picked), saved in voice.json in Companion's folder. The error is a code the page turns into words.
#[tauri::command]
fn set_voice_settings(window: tauri::WebviewWindow, voice: Option<String>, speed: f64, mic: Option<String>, language: String) -> Result<Value, String> {
    if window.label() != "card" { return Err("not_card".into()); }
    let voices = speak::mac::voices();
    let (inputs, _) = voice_mac::inputs();
    let before = voice_now();
    let ask = voiceset::Ask { voice: voice.as_deref(), speed, mic: mic.as_deref(), language: &language };
    let next = voiceset::apply(&before, &ask, &voices, &inputs).map_err(|c| { log("voice_not_set", json!({ "why": c })); c.to_string() })?;
    let _ = std::fs::create_dir_all(data_dir());
    logfile::write_atomic(&voice_path(), voiceset::to_json(&next).to_string().as_bytes()).map_err(|_| "not_saved".to_string())?;
    if next.mic != before.mic { *MIC_NOTE.lock().unwrap_or_else(|e| e.into_inner()) = voiceset::MicNote::new(); }
    *VOICE_SET.lock().unwrap_or_else(|e| e.into_inner()) = Some(next.clone());
    // Whether each was picked, never which voice or microphone.
    log("voice_set", json!({ "voice": next.voice.is_some(), "speed": next.speed, "mic": next.mic.is_some(), "language": next.language }));
    Ok(voice_state(&next, &voices))
}

/// Silence, at once. Also part of Stop everything.
#[tauri::command]
fn speak_stop(app: AppHandle) { speech_off(&app); }
fn speech_off(app: &AppHandle) { let _ = app.run_on_main_thread(|| speak::mac::silence()); }

/// Opens the licence notices that ship inside the app, in the person's default text app. Fixed file, no input.
#[tauri::command]
fn open_acknowledgements() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|_| "Could not find the notices.".to_string())?;
    let bundled = exe.ancestors().find(|a| a.file_name().is_some_and(|n| n == "Contents")).map(|c| c.join("Resources/ACKNOWLEDGEMENTS.txt"));
    let file = bundled.filter(|p| p.is_file()).ok_or("The notices are only in the installed app.".to_string())?;
    std::process::Command::new("/usr/bin/open").arg("-t").arg(file).status().map(|_| ()).map_err(|_| "Could not open the notices.".to_string())
}

// ---------- Settings, and delete everything ----------

fn key_saved() -> bool { keystore::exists(&keystore::service(), keystore::ACCOUNT) }

/// What Companion keeps on this Mac, for the settings page. Sizing a big folder can take a moment, so off the main thread.
#[tauri::command]
async fn data_inventory() -> Value {
    tauri::async_runtime::spawn_blocking(|| {
        let projects: Vec<std::path::PathBuf> = projects::load(&projects_path()).still_there().into_iter().map(std::path::PathBuf::from).collect();
        wipe::inventory(std::path::Path::new(&home_dir()), &data_dir(), key_saved(), &projects)
    }).await.unwrap_or(Value::Null)
}

/// The three permissions as the settings page shows them. Never prompts. The microphone says whether it was never asked,
/// turned off or blocked; Accessibility and Screen Recording can only say on or off (see permissions.rs).
#[tauri::command]
fn permission_overview() -> Value {
    let p = permissions::current();
    json!({ "accessibility": permissions::page_word(p.accessibility), "screen_recording": permissions::page_word(p.screen_recording), "microphone": permissions::page_word(p.microphone) })
}

/// Opens the right page of System Settings (opening a page changes nothing; the person decides there).
#[tauri::command]
fn open_permission_page(which: String) -> Result<(), String> {
    let pane = match which.as_str() {
        "accessibility" => "Privacy_Accessibility", "screen_recording" => "Privacy_ScreenCapture", "microphone" => "Privacy_Microphone",
        _ => return Err("unknown page".into()),
    };
    std::process::Command::new("/usr/bin/open").arg(format!("x-apple.systempreferences:com.apple.preference.security?{pane}")).status().map(|_| ()).map_err(|_| "Could not open System Settings.".to_string())
}

/// Writes a support log to Downloads (never over a file), scrubbed of project content and anything secret, and shows it in
/// Finder. Nothing is sent anywhere: the person decides whether to share it.
#[tauri::command]
async fn export_logs() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (home, data) = (home_dir(), data_dir());
        let cmd_out = |c: &str, a: &[&str]| std::process::Command::new(c).args(a).output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        let perms = permissions::current();
        let word = |k: &str| permissions::support_words(match k { "screen_recording" => perms.screen_recording, "accessibility" => perms.accessibility, _ => perms.microphone });
        let pj = projects::load(&projects_path());
        let mut projects: Vec<String> = pj.recent.clone();
        if let Some(c) = pj.current.clone() { if !projects.contains(&c) { projects.push(c); } }
        let inv = wipe::inventory(std::path::Path::new(&home), &data, key_saved(), &[]);
        let kept: Vec<(String, u64)> = inv["items"].as_array().map(|a| a.iter().map(|r| (r["label"].as_str().unwrap_or("").to_string(), r["bytes"].as_u64().unwrap_or(0))).collect()).unwrap_or_default();
        let facts = logexport::Facts {
            version: env!("CARGO_PKG_VERSION").to_string(), macos: cmd_out("/usr/bin/sw_vers", &["-productVersion"]), arch: cmd_out("/usr/bin/uname", &["-m"]),
            permissions: vec![("Screen Recording".into(), word("screen_recording").into()), ("Accessibility".into(), word("accessibility").into()), ("Microphone".into(), word("microphone").into())],
            key_saved: key_saved(), speech_ready: voice_mac::model_ready(&data), browser_installed: std::fs::read_dir(std::path::Path::new(&home).join("Library/Application Support/Companion/browsers")).is_ok_and(|mut d| d.next().is_some()), kept,
        };
        let activity = [data.join("events.jsonl.1"), data.join("events.jsonl")].iter().filter_map(|p| std::fs::read_to_string(p).ok()).collect::<Vec<_>>().join("\n");
        let crash = logexport::latest_crash(&std::path::Path::new(&home).join("Library/Logs/DiagnosticReports"), std::time::SystemTime::now());
        // Words that identify the person or the machine: the user name and the computer's names.
        let mut names: Vec<String> = vec![std::env::var("USER").unwrap_or_else(|_| home.rsplit('/').next().unwrap_or("").to_string()), cmd_out("/usr/sbin/scutil", &["--get", "ComputerName"]), cmd_out("/usr/sbin/scutil", &["--get", "LocalHostName"]), cmd_out("/bin/hostname", &[])];
        names.retain(|n| !n.is_empty()); names.dedup();
        let text = logexport::compose(&facts, &activity, crash.as_ref().map(|(n, t)| (n.as_str(), t.as_str())), &home, &names, &projects);
        let dir = std::path::Path::new(&home).join("Downloads");
        if !dir.is_dir() { return Err("Your Downloads folder was not found.".to_string()); }
        let stamp = cmd_out("/bin/date", &["+%Y-%m-%d-%H%M"]);
        // create_new never replaces a file; if another file takes the name a moment before us, the next name is tried.
        let (mut path, mut file) = (std::path::PathBuf::new(), None);
        for attempt in 0..5 {
            path = logexport::unique_path(&dir, &if attempt == 0 { stamp.clone() } else { format!("{stamp}-{attempt}") }, |p| p.exists());
            match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) { Ok(f) => { file = Some(f); break; } Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue, Err(e) => return Err(format!("Could not save the log ({e}).")) }
        }
        let mut f = file.ok_or("Could not save the log (the name was taken).".to_string())?;
        std::io::Write::write_all(&mut f, text.as_bytes()).map_err(|e| format!("Could not save the log ({e})."))?;
        let _ = std::process::Command::new("/usr/bin/open").arg("-R").arg(&path).status();   // shows the file in Finder
        Ok(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
    }).await.map_err(|_| "The export stopped.".to_string())?
}

/// A practice project (the first run's unless the page names another on the list): copied into a new folder in the home
/// folder, then chosen as the project. Never over anything that is there already.
#[tauri::command]
fn create_practice(app: AppHandle, which: Option<String>) -> Result<String, String> {
    let name = practice::pick(which.as_deref())?;
    let exe = std::env::current_exe().map_err(|_| "Could not find the practice project.".to_string())?;
    let src = practice::source_of(name, &exe, std::env::var("COMPANION_SAMPLE_DIR").ok().as_deref()).ok_or("The practice project is missing from this copy of the app.".to_string())?;
    let dst = practice::make(&src, std::path::Path::new(&home_dir()))?;
    log("practice_created", json!({}));
    use_project_inner(app, dst.to_string_lossy().to_string())
}

static WIPING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// A question macOS itself asks, so a script in a page can never answer it. Cancel is the default button.
fn confirm_delete_natively() -> bool {
    let script = r#"display dialog "Delete everything Companion keeps on this Mac? This cannot be undone." buttons {"Cancel", "Delete everything"} default button "Cancel" cancel button "Cancel" with icon caution with title "Companion""#;
    std::process::Command::new("/usr/bin/osascript").args(["-e", script]).output().is_ok_and(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("Delete everything"))
}

/// Deletes everything Companion keeps. The work is done by a helper (this same program, started with --wipe-everything)
/// after the app has quit, so nothing is holding or rewriting the files; the helper then opens Companion again fresh.
/// The person is asked twice: on the page, and by macOS itself. `with_projects` also removes Companion's own notes inside
/// the person's recent projects.
#[tauri::command]
async fn delete_everything(app: AppHandle, confirm: String, with_projects: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering::SeqCst;
    if confirm != "delete everything" { return Err("Not confirmed.".into()); }
    if WIPING.swap(true, SeqCst) { return Err("Already deleting.".into()); }
    let dialog = NativeDialog::open();
    let asked = tauri::async_runtime::spawn_blocking(confirm_delete_natively).await.unwrap_or(false);
    drop(dialog);
    if !asked { WIPING.store(false, SeqCst); return Err(String::new()); }   // cancelled: nothing happened, nothing to say
    let projects: Vec<String> = if with_projects { projects::load(&projects_path()).still_there() } else { vec![] };
    let exe = std::env::current_exe().map_err(|_| { WIPING.store(false, SeqCst); "Could not start the cleanup.".to_string() })?;
    let mut helper = std::process::Command::new(exe);
    helper.arg("--wipe-everything").arg(std::process::id().to_string()).arg(if with_projects { "1" } else { "0" }).args(&projects)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    if helper.spawn().is_err() { WIPING.store(false, SeqCst); return Err("Could not start the cleanup.".into()); }
    // Everything stops, then the app quits; the helper is waiting for that.
    showme_stop(&app);
    let _ = app.state::<runner::Runner>().stop_everything("delete everything");
    app.state::<runner::Runner>().shut_down();
    app.exit(0);
    Ok(())
}

/// The helper side: `--wipe-everything <app pid> <1 or 0 for project notes> [project folders]`. Runs before anything else
/// of the app starts. Returns true when this run was the helper.
fn wipe_helper_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    let Some(i) = args.iter().position(|a| a == "--wipe-everything") else { return false };
    let pid = args.get(i + 1).cloned().unwrap_or_default();
    let with_projects = args.get(i + 2).is_some_and(|a| a == "1");
    let projects: Vec<std::path::PathBuf> = args.iter().skip(i + 3).map(std::path::PathBuf::from).collect();
    let (home, data) = (home_dir(), data_dir());
    let (home, data) = (std::path::PathBuf::from(home), data);
    let bundle = std::env::current_exe().ok().and_then(|e| e.ancestors().find(|a| a.extension().is_some_and(|x| x == "app")).map(|p| p.to_path_buf()));
    wipe::run_helper(&home, &data, &projects, with_projects, &wipe::Helper {
        parent_gone: &|| !std::process::Command::new("/bin/kill").args(["-0", &pid]).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success()),
        delete_key: &|| { keystore::delete_item(&keystore::service(), keystore::ACCOUNT) || !keystore::exists(&keystore::service(), keystore::ACCOUNT) },
        relaunch: &|| { if let Some(b) = &bundle { let _ = std::process::Command::new("/usr/bin/open").arg("-n").arg(b).status(); } },   // not from a built app (a development run): nothing to open
        wait: &|| std::thread::sleep(Duration::from_millis(150)),
    });
    true
}

// ---------- Draw it for me ----------

/// Draws a diagram the page laid out, beside the dock's screen edge, for a short while. It replaces any pointer and
/// leaves with Stop everything or the Close button. Nothing here looks at the screen.
#[tauri::command]
fn show_diagram(app: AppHandle, diagram: Value) -> Result<(), String> {
    use std::sync::atomic::Ordering::SeqCst;
    diagram::validate(&diagram)?;
    // Never over a ring the person is meant to click, never over a pointer in use, and never while the dock is hidden
    // (a full screen app is in front, or the person hid it): the sketch would land on top of what they chose not to share.
    if TURN.lock().unwrap_or_else(|e| e.into_inner()).is_some() || overlay_busy() { return Err("busy".into()); }
    if HIDDEN_BY_US.load(SeqCst) || USER_HID.load(SeqCst) { return Err("hidden".into()); }
    point_cancel();
    let gen = POINT_GEN.load(SeqCst);
    OVERLAY_BUSY_UNTIL.store(now() as u64 + 16_500, SeqCst);
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        let screens = NSScreen::screens(mtm);
        let primary_h = screens.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        let Some(dock) = with_panels(|dock, _| dock.frame()) else { let _ = tx.send(false); return };
        let (cx, cy) = (dock.origin.x + dock.size.width / 2.0, dock.origin.y + dock.size.height / 2.0);
        let Some(scr) = screens.iter().map(|s| s.frame()).find(|f| cx >= f.origin.x && cx < f.origin.x + f.size.width && cy >= f.origin.y && cy < f.origin.y + f.size.height) else { let _ = tx.send(false); return };
        let d = coords::R { x: scr.origin.x, y: primary_h - scr.origin.y - scr.size.height, w: scr.size.width, h: scr.size.height };
        let ak = coords::rect_to_appkit(d, primary_h);
        OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setFrame_display(NSRect::new(NSPoint::new(ak.x, ak.y), NSSize::new(ak.w, ak.h)), true); p.orderFrontRegardless(); } });
        let _ = a.emit_to("overlay", "overlay-diagram", json!({ "diagram": diagram, "dockX": cx - d.x }));
        let _ = tx.send(true);
    });
    if !rx.recv_timeout(Duration::from_secs(2)).unwrap_or(false) { OVERLAY_BUSY_UNTIL.store(0, SeqCst); return Err("no_screen".into()); }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(16_000));
        if POINT_GEN.load(SeqCst) == gen { hide_overlay(&app); }
    });
    Ok(())
}

// ---------- Celebration ----------

/// Confetti from the character for the big moments (proof passed, it went live). Never over a ring that is waiting
/// for the person, and it leaves the moment anything else needs the pointer.
#[tauri::command]
fn celebrate(app: AppHandle) {
    use std::sync::atomic::Ordering::SeqCst;
    let free = || TURN.lock().unwrap_or_else(|e| e.into_inner()).is_none() && !overlay_busy();
    if !free() || quiet() { return; }
    let (gen, party) = (POINT_GEN.load(SeqCst), PARTY_GEN.fetch_add(1, SeqCst) + 1);
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        // Checked again here: a pointer may have been drawn since the command came in.
        if !free() || POINT_GEN.load(SeqCst) != gen { return; }
        let mtm = MainThreadMarker::new().unwrap();
        let screens = NSScreen::screens(mtm);
        let primary_h = screens.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        let Some(dock) = with_panels(|dock, _| dock.frame()) else { return };
        let (cx, cy) = (dock.origin.x + dock.size.width / 2.0, dock.origin.y + dock.size.height / 2.0);   // AppKit points
        let Some(scr) = screens.iter().map(|s| s.frame()).find(|f| cx >= f.origin.x && cx < f.origin.x + f.size.width && cy >= f.origin.y && cy < f.origin.y + f.size.height) else { return };
        let d = coords::R { x: scr.origin.x, y: primary_h - scr.origin.y - scr.size.height, w: scr.size.width, h: scr.size.height };
        let ak = coords::rect_to_appkit(d, primary_h);
        OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setFrame_display(NSRect::new(NSPoint::new(ak.x, ak.y), NSSize::new(ak.w, ak.h)), true); p.orderFrontRegardless(); } });
        let _ = a.emit_to("overlay", "overlay-party", json!({ "x": cx - d.x, "y": (primary_h - cy) - d.y }));
    });
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1700));
        // Only the latest celebration tidies up, and never while a pointer has come up meanwhile.
        if PARTY_GEN.load(SeqCst) == party && POINT_GEN.load(SeqCst) == gen && free() {
            let _ = app.run_on_main_thread(|| { OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.orderOut(None); } }); });
        }
    });
}

// ---------- Point at the problem ----------

fn editor_installed(bundle: &str) -> bool {
    NSWorkspace::sharedWorkspace().URLForApplicationWithBundleIdentifier(&objc2_foundation::NSString::from_str(bundle)).is_some()
}

/// Opens the failing file at its line (in the editor in front, or the first one installed, or the Mac's default),
/// waits for it to come forward, then looks once (light first) and circles the line. Nothing is sent to a model.
#[tauri::command]
fn point_problem(app: AppHandle, project: String, problem: Value) {
    let current = current_project();
    if current.is_empty() { say_showme(&app, "error", "Choose your project folder first.", json!({})); return; }
    // A check that finished after the folder changed belongs to the old project: never open its file in the new one.
    if project != current { say_showme(&app, "error", "That problem was found in a different project folder, so I did not open anything.", json!({})); return; }
    // Any Show me answer still playing ends first (no later step may take this ring away), and whatever ring is up goes now,
    // before the editor comes to the front, rather than sitting unwatched over it.
    showme_end_answer(&app);
    point_cancel(); hide_overlay(&app);
    let gen = POINT_GEN.load(std::sync::atomic::Ordering::SeqCst);
    let alive = move || POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) == gen;
    std::thread::spawn(move || {
        let kind = problem.get("kind").and_then(Value::as_str).unwrap_or("");
        let message = problem.get("message").and_then(Value::as_str).unwrap_or("");
        let mut opened: Option<(String, Option<String>)> = None;   // (what we say, the editor's bundle id)
        if kind == "line" {
            let rel = problem.get("file").and_then(Value::as_str).unwrap_or("");
            let line = problem.get("line").and_then(Value::as_u64).unwrap_or(0) as u32;
            let column = problem.get("column").and_then(Value::as_u64).map(|c| c as u32);
            let file = match pointat::file_in_project(std::path::Path::new(&project), rel) { Ok(f) => f, Err(e) => { say_showme(&app, "error", &format!("I could not open that file: {e}."), json!({})); return; } };
            let short = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let editor = pointat::choose_editor(&front_id(), editor_installed);
            let (ok, name, bundle) = match editor.and_then(|i| pointat::editor_link(i, &file, line.max(1), column).map(|l| (i, l))) {
                Some((i, link)) => (std::process::Command::new("/usr/bin/open").arg(&link).status().map(|s| s.success()).unwrap_or(false), pointat::EDITORS[i].2.to_string(), Some(pointat::EDITORS[i].0.to_string())),
                None => (std::process::Command::new("/usr/bin/open").arg("-t").arg(&file).status().map(|s| s.success()).unwrap_or(false), "your text editor".to_string(), None),
            };
            log("point_open", json!({ "editor": name, "ok": ok }));
            if !ok { say_showme(&app, "error", &format!("I could not open {short} in {name}."), json!({})); return; }
            opened = Some((format!("Opened {short} at line {line} in {name}."), bundle));
        }
        // Give the editor a moment to come forward and draw the line.
        if let Some((_, Some(bundle))) = &opened {
            for _ in 0..20 { if front_id() == *bundle { break; } std::thread::sleep(Duration::from_millis(150)); }
            std::thread::sleep(Duration::from_millis(700));
        }
        if !alive() { return; }
        let said = opened.as_ref().map(|o| o.0.clone()).unwrap_or_default();
        let a3 = app.clone();
        let plat = macos_see::MacPlatform::new(Box::new(|_, _, _, _| {}), Box::new(|_, _, _| {}),
            Box::new(move |on| { if !on { return; } say_showme(&a3, "looking", "Looking at your screen", json!({})); std::thread::sleep(Duration::from_millis(250)); }));
        {
            use showme::Platform;
            if !plat.screen_recording_granted() {
                macos_see::request_screen_recording();
                let lead = if said.is_empty() { String::new() } else { format!("{said} ") };
                say_showme(&app, "needs_permission", &format!("{lead}To have me circle it on your screen, allow Screen Recording for Companion in System Settings, then try again."), json!({}));
                return;
            }
        }
        let fallback = match kind { "button" => "Pressing this button breaks the page", "line" => "This line fails", _ => "This is the error" };
        let cap = pointat::caption(message, fallback);
        let line_text = problem.get("lineText").and_then(Value::as_str).unwrap_or("").to_string();
        let line_no = problem.get("line").and_then(Value::as_u64).unwrap_or(0) as u32;
        let label = problem.get("label").and_then(Value::as_str).unwrap_or("").to_string();
        let find = |boxes: &[snap::OcrBox]| match kind {
            "line" => pointat::find_line(boxes, &line_text, line_no),
            "button" => pointat::find_text(boxes, &label),
            _ => pointat::find_text(boxes, message),
        };
        let mut found = None;
        let mut display = None;
        // The editor may still be drawing: one more look a moment later if the first finds nothing.
        for attempt in 0..2 {
            if attempt > 0 { std::thread::sleep(Duration::from_millis(800)); }
            if !alive() { return; }
            match showme::look_for(&plat, &find) {
                Ok((d, hit)) => { display = Some(d); found = hit; if found.is_some() { break; } }
                Err(showme::Refusal::SecureInput) => { say_showme(&app, "error", format!("{said} A password box is active, so I did not look at your screen.").trim(), json!({})); return; }
                Err(showme::Refusal::CaptureFailed(e)) | Err(showme::Refusal::PictureFailed(e)) => { say_showme(&app, "error", format!("{said} I could not look at your screen ({e}).").trim(), json!({})); return; }
                Err(showme::Refusal::NeedsScreenRecording) => break,
            }
        }
        if !alive() { return; }
        log("point_found", json!({ "kind": kind, "found": found.is_some(), "exact": found.map(|f| f.exact) }));
        match (found, display) {
            (Some(f), Some(d)) => {
                let button = kind == "button";
                let watched = draw_pointer(&app, d, f.rect, &cap, f.exact, button);
                say_showme(&app, if f.exact { "pointing" } else { "pointing_roughly" }, &cap, json!({ "turn": button }));
                if button { your_turn(&app, d, f.rect, &label); } else { watch_ring(&app, f.rect, watched, None); }
            }
            _ => {
                let what = match kind { "line" => "the line", "button" => "that button", _ => "that error" };
                let lead = if said.is_empty() { String::new() } else { format!("{said} ") };
                say_showme(&app, "opened", &format!("{lead}I could not spot {what} on your screen. {cap}"), json!({}));
            }
        }
    });
}

// ---------- The it's live card ----------

/// Save picture: the card goes to the person's Downloads folder, under a new name, only when they press the button.
#[tauri::command]
fn save_share_card(image: String, title: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(image.as_bytes()).map_err(|_| "that is not a picture".to_string())?;
    share::check_jpeg(&bytes)?;
    let home = std::env::var("HOME").map_err(|_| "your home folder was not found".to_string())?;
    let dir = std::path::Path::new(&home).join("Downloads");
    if !dir.is_dir() { return Err("your Downloads folder was not found".into()); }
    let path = share::card_path(&dir, &title, |p| p.exists());
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| format!("could not save it ({e})"))?;
    std::io::Write::write_all(&mut f, &bytes).map_err(|e| format!("could not save it ({e})"))?;
    log("share_card_saved", json!({}));
    Ok(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

/// Copy link: only a web address, only on a press.
#[tauri::command]
fn copy_link(url: String) -> Result<(), String> {
    if !share::is_web_link(&url) { return Err("that is not a web address".into()); }
    ax::write_clipboard(&url);
    Ok(())
}

// ---------- Hold to talk keys (F18.3, the rules are in talkkeys.rs) ----------

const NO_CHORD: usize = usize::MAX;
/// The chord registered for hold to talk now (an index into talkkeys::CHOICES), or none when another app holds it.
/// Read without a lock, because the hotkey handler reads it on every press.
static TALK_USING: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(NO_CHORD);
/// The chord the person picked (saved on this Mac), the default until they pick.
static TALK_PICKED: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
/// One change at a time, never held while the hotkey handler runs.
static TALK_SWITCH: Mutex<()> = Mutex::new(());
/// Key repeats while the keys are held restart nothing (talkkeys::Held).
static TALK_HELD: Mutex<talkkeys::Held> = Mutex::new(talkkeys::Held::new());

fn talk_keys_path() -> PathBuf { data_dir().join("talk-keys.json") }
fn talk_using() -> Option<&'static talkkeys::Chord> { talkkeys::at(TALK_USING.load(Ordering::SeqCst)) }
fn talk_picked() -> &'static talkkeys::Chord { talkkeys::at(TALK_PICKED.load(Ordering::SeqCst)).unwrap_or(talkkeys::DEFAULT) }
fn set_talk_using(c: Option<&'static talkkeys::Chord>) { TALK_USING.store(c.map(talkkeys::index).unwrap_or(NO_CHORD), Ordering::SeqCst); }
/// Whether a shortcut the plugin reports is the hold to talk chord in use right now.
fn is_talk(s: &Shortcut) -> bool { talk_using().is_some_and(|c| &talkkeys::shortcut(c) == s) }

/// At launch: the saved chord, else the default (talkkeys::start). Returns how it went, for the one launch notice.
fn start_talk_keys(app: &AppHandle) -> talkkeys::Started {
    let picked = talkkeys::parse(std::fs::read_to_string(talk_keys_path()).ok().as_deref());
    let gs = app.global_shortcut();
    let started = talkkeys::start(picked, |c| gs.register(talkkeys::shortcut(c)).is_ok());
    TALK_PICKED.store(talkkeys::index(picked), Ordering::SeqCst);
    set_talk_using(started.using());
    log("talk_keys", json!({ "picked": picked.id, "using": started.using().map(|c| c.id) }));
    started
}

/// What the page is told (talkkeys::state_json), with which chords are free on this Mac now: each chord not in use is
/// registered and let go again at once (talkkeys::free), never the one in use. Called with TALK_SWITCH held.
fn talk_state(app: &AppHandle) -> Value {
    let gs = app.global_shortcut();
    let using = talk_using();
    let free = talkkeys::free(using,
        |c| gs.register(talkkeys::shortcut(c)).is_ok(),
        |c| { if gs.unregister(talkkeys::shortcut(c)).is_err() { log("talk_keys_not_let_go", json!({ "id": c.id })); } });
    talkkeys::state_json(using, talk_picked(), &free)
}

/// Settings and the first run: what hold to talk uses now, what the person picked, the short list and which of it is free.
/// Only from the card, since it briefly registers chords. A sync command, so it runs on the main thread like set_talk_keys.
#[tauri::command]
fn talk_keys(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    if window.label() != "card" { return Err("not_card".into()); }
    let _one = TALK_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    Ok(talk_state(&app))
}

/// Settings: use other keys for hold to talk. Only from the card, only a chord on the list. Registered at once and saved
/// on this Mac only if it works; otherwise nothing changes. The error is a code the page turns into words.
#[tauri::command]
fn set_talk_keys(app: AppHandle, window: tauri::WebviewWindow, id: String) -> Result<Value, String> {
    if window.label() != "card" { return Err("not_card".into()); }
    let Some(wanted) = talkkeys::find(&id) else { return Err("unknown".into()) };
    let _one = TALK_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let before = talk_using();
    let gs = app.global_shortcut();
    let r = talkkeys::switch(before, wanted,
        |c| gs.register(talkkeys::shortcut(c)).is_ok(),
        |c| { let _ = std::fs::create_dir_all(data_dir()); logfile::write_atomic(&talk_keys_path(), talkkeys::to_json(c).to_string().as_bytes()).is_ok() },
        |c| { if gs.unregister(talkkeys::shortcut(c)).is_err() { log("talk_keys_not_let_go", json!({ "id": c.id })); } });
    match r {
        Ok(c) => {
            TALK_PICKED.store(talkkeys::index(c), Ordering::SeqCst);
            if before != Some(c) {
                set_talk_using(Some(c));
                // The old keys no longer reach hold to talk, so a hold still going on them is ended here, not left open.
                TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset();
                voice_send(&app, VoiceMsg::Cancel);
            }
            log("talk_keys_set", json!({ "id": c.id }));
            Ok(talk_state(&app))
        }
        Err(p) => { log("talk_keys_not_set", json!({ "id": wanted.id, "why": p.code() })); Err(p.code().into()) }
    }
}

// ---------- Hold to talk ----------

enum VoiceMsg { Down(u64), Up(u64), Cancel }
const LISTENING: &str = "Listening. Let go of the keys when you are done.";
/// Hold to talk is listening: from just before the light comes on until the microphone is closed (let go, Stop everything,
/// the minute running out, or a microphone that would not start). Nothing is said meanwhile (`speak`).
static LISTENING_NOW: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
fn listening_now() -> bool { LISTENING_NOW.load(std::sync::atomic::Ordering::SeqCst) }
fn listening(on: bool) { LISTENING_NOW.store(on, std::sync::atomic::Ordering::SeqCst); }
static VOICE_TX: Mutex<Option<std::sync::mpsc::Sender<VoiceMsg>>> = Mutex::new(None);

fn say_voice(app: &AppHandle, stage: &str, message: &str, extra: Value) {
    let mut v = json!({ "v": 1, "id": format!("vo{}", now()), "type": "app.voice", "stage": stage, "message": message });
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) { for (k, x) in e { o.insert(k.clone(), x.clone()); } }
    runner::Runner::publish(app, v);
}

fn voice_send(app: &AppHandle, m: VoiceMsg) {
    let mut g = VOICE_TX.lock().unwrap_or_else(|e| e.into_inner());
    if g.is_none() {
        let (tx, rx) = std::sync::mpsc::channel::<VoiceMsg>();
        *g = Some(tx);
        let a = app.clone();
        std::thread::spawn(move || voice_worker(a, rx));
    }
    if let Some(tx) = g.as_ref() { let _ = tx.send(m); }
}

/// One thread handles the key going down and up in order, so the microphone can never be left open or opened late.
fn voice_worker(app: AppHandle, rx: std::sync::mpsc::Receiver<VoiceMsg>) {
    let mut hold = voice::Hold::new();
    let mut rec: Option<voice_mac::Recorder> = None;
    let data = data_dir();
    // The speech model is loaded while the person talks and let go after five idle minutes.
    let mut speech: Option<voice_mac::Speech> = None;
    // Loaded by a helper while the person talks, so a Stop or a let-go is never queued behind a 1 to 3 second load.
    let preload: std::sync::Arc<Mutex<Option<voice_mac::Speech>>> = std::sync::Arc::new(Mutex::new(None));
    // The open project's own words for the speech model (voicewords.rs), gathered by a helper while the person talks.
    // Each press has its own number, so a helper still running from an earlier press never hands over its words late.
    let words_slot: std::sync::Arc<Mutex<Option<(u64, String)>>> = std::sync::Arc::new(Mutex::new(None));
    let mut press = 0u64;
    let mut last_used = std::time::Instant::now();
    loop {
        let msg = rx.recv_timeout(Duration::from_secs(1));
        if matches!(msg, Err(std::sync::mpsc::RecvTimeoutError::Disconnected)) { break; }
        if speech.is_some() && hold.phase == voice::Phase::Idle && last_used.elapsed() > Duration::from_secs(300) { speech = None; }
        // The microphone is closed by force after a minute, whatever the key is doing.
        if hold.too_long(now() as u64) {
            if let Some(r) = rec.take() { let _ = r.finish(); }
            listening(false);
            hold.cancel();
            say_voice(&app, "error", "I stopped listening after a minute. Hold the keys and talk again.", json!({}));
        }
        match msg {
            Ok(VoiceMsg::Down(t)) => {
                if hold.down(t) != voice::Step::Start { continue; }
                if !voice_mac::model_ready(&data) { hold.cancel(); say_voice(&app, "needs_model", "To talk to Companion, it needs a speech model on this Mac (about 140 MB, downloaded once). Your voice never leaves this Mac.", json!({})); continue; }
                match voice_mac::mic_status() {
                    voice_mac::Mic::NotAsked => { hold.cancel(); voice_mac::ask_for_mic(); say_voice(&app, "needs_mic", "Allow the microphone in the box macOS shows, then hold the keys again.", json!({})); continue; }
                    voice_mac::Mic::Refused => { hold.cancel(); say_voice(&app, "mic_refused", "The microphone is switched off for Companion. Turn it on in System Settings, Privacy and Security, Microphone. If it is not in the list, run this in Terminal and reopen Companion: tccutil reset Microphone dev.companion.app", json!({})); continue; }
                    voice_mac::Mic::Allowed => {}
                }
                // The light is the dock character (and the card). If the person cannot see it (a full screen app is in front, or they hid it) nothing is recorded (rule 5).
                if HIDDEN_BY_US.load(std::sync::atomic::Ordering::SeqCst) || USER_HID.load(std::sync::atomic::Ordering::SeqCst) {
                    hold.cancel();
                    say_voice(&app, "error", "Companion is hidden right now, so I cannot show you that I am listening, and I will not record without that. Show Companion from the menu bar icon, then hold the keys again.", json!({}));
                    continue;
                }
                // From here nothing is said, and a line that began after the keys went down is cut off before the microphone opens.
                listening(true);
                speech_off(&app);
                say_voice(&app, "listening", LISTENING, json!({}));
                std::thread::sleep(Duration::from_millis(150));   // the light is on screen before the microphone opens
                // The microphone picked in Settings, or the Mac's default (voiceset::pick_mic).
                match voice_mac::Recorder::start(voice_now().mic) {
                    Ok((r, opened)) => {
                        rec = Some(r); log("voice_listening", json!({ "fell_back": opened.missing.is_some() }));
                        // The picked microphone is not connected, so the default listens: one plain line, once each time it goes away.
                        if MIC_NOTE.lock().unwrap_or_else(|e| e.into_inner()).tell(opened.missing.as_deref()) {
                            say_voice(&app, "listening", LISTENING, json!({ "micMissing": opened.missing, "micUsing": opened.name }));
                        }
                        press += 1;
                        *words_slot.lock().unwrap_or_else(|e| e.into_inner()) = None;
                        let (slot, project, this) = (words_slot.clone(), current_project(), press);
                        if !project.is_empty() {   // names only, on this Mac only, never a file's content (voicewords.rs)
                            std::thread::spawn(move || { let w = voicewords::prompt(&voicewords::collect(std::path::Path::new(&project), &voicewords::settings_for(&project))); *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some((this, w)); });
                        }
                        if speech.is_none() {   // while the person is talking, on a helper thread
                            let (slot, path) = (preload.clone(), voice_mac::model_path(&data));
                            std::thread::spawn(move || { if let Ok(m) = voice_mac::load(&path) { *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(m); } });
                        }
                    }
                    Err(e) => { hold.cancel(); listening(false); say_voice(&app, "error", &format!("I could not use the microphone ({e})."), json!({})); }
                }
            }
            Ok(VoiceMsg::Up(t)) => {
                let (step, long_enough) = hold.up(t);
                if step != voice::Step::Stop { continue; }
                let Some(r) = rec.take() else { listening(false); hold.finished(); continue };
                let heard = r.finish();
                listening(false);
                if !long_enough { hold.finished(); say_voice(&app, "idle", "", json!({})); continue; }
                match heard {
                    Err(e) => { hold.finished(); say_voice(&app, "error", &format!("I could not use the microphone ({e})."), json!({})); }
                    Ok(h) => {
                        let mono = h.mono;
                        // Another microphone took over while the keys were held, or the one in use went away: the page says so in one line.
                        let mut mic = json!({});
                        if let Some(to) = &h.switched_to { mic["micSwitched"] = json!(to); }
                        if h.lost { mic["micLost"] = json!(true); }
                        if h.switched_to.is_some() || h.lost { log("voice_mic_changed", json!({ "switched": h.switched_to.is_some(), "lost": h.lost })); }
                        match voice::heard(&mono) {
                            voice::Heard::Blocked => { hold.finished(); say_voice(&app, "blocked", "The microphone gave me only silence. It may be switched off for Companion in System Settings, Privacy and Security, Microphone.", mic); }
                            voice::Heard::Silent => { hold.finished(); say_voice(&app, "silent", "I did not hear anything. Try again a little closer.", mic); }
                            voice::Heard::Sound => {
                                say_voice(&app, "transcribing", "Understanding what you said", json!({}));
                                let t0 = now();
                                if speech.is_none() { speech = preload.lock().unwrap_or_else(|e| e.into_inner()).take(); }
                                if speech.is_none() { speech = voice_mac::load(&voice_mac::model_path(&data)).ok(); }
                                // The project's own words (empty if the helper is not done) and the language picked in Settings.
                                let words = words_slot.lock().unwrap_or_else(|e| e.into_inner()).take().filter(|(n, _)| *n == press).map(|(_, w)| w).unwrap_or_default();
                                let language = voiceset::language(&voice_now().language);
                                let out = match speech.as_ref() { Some(c) => voice_mac::transcribe_with(c, &mono, &words, language).map(|t| voice::clean_transcript(&t)), None => Err("The speech model could not be loaded.".to_string()) };
                                last_used = std::time::Instant::now();
                                // Timing and how many project words were given, never the words or what was said.
                                log("voice_transcribed", json!({ "ms": (now() - t0) as u64, "words": words.split(", ").filter(|w| !w.is_empty()).count(), "language": language.is_some() }));
                                hold.finished();
                                match out {
                                    // Only the word list written back is not what the person said (voicewords::is_echo).
                                    Ok(text) if voicewords::is_echo(&text, &words) => say_voice(&app, "silent", "I did not catch any words. Try again.", mic),
                                    Ok(text) if !text.is_empty() => { mic["text"] = json!(text); say_voice(&app, "heard", "", mic) }
                                    Ok(_) => say_voice(&app, "silent", "I did not catch any words. Try again.", mic),
                                    Err(e) => say_voice(&app, "error", &e, mic),
                                }
                            }
                        }
                    }
                }
            }
            Ok(VoiceMsg::Cancel) => { if let Some(r) = rec.take() { let _ = r.finish(); } listening(false); if hold.cancel() { say_voice(&app, "idle", "", json!({})); } }
            Err(_) => {}
        }
    }
}

/// Download the speech model once (the person asked for it with a button).
#[tauri::command]
fn voice_download(app: AppHandle) {
    std::thread::spawn(move || {
        let data = data_dir();
        say_voice(&app, "downloading", "Downloading the speech model", json!({ "percent": 0 }));
        let a = app.clone();
        let r = voice_mac::download_model(&data, &move |got| {
            let pct = ((got as f64 / voice_mac::MODEL_BYTES as f64) * 100.0).min(99.0) as u64;
            say_voice(&a, "downloading", "Downloading the speech model", json!({ "percent": pct }));
        });
        match r {
            Ok(()) => say_voice(&app, "model_ready", &talkkeys::ready_words(talk_using()), json!({})),
            Err(e) => say_voice(&app, "error", &e, json!({})),
        }
    });
}

fn tick(app: &AppHandle) {
    let mtm = MainThreadMarker::new().unwrap();
    // Stay out of full screen apps unless the setting says otherwise.
    let front_pid = NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier()).unwrap_or(0);
    let displays: Vec<Rect> = screens_now(mtm).iter().map(|s| s.frame).collect();
    let wins = fullscreen::sys::on_screen_windows();
    let raw = fullscreen::front_app_is_full_screen(&wins, front_pid, &displays);
    // The raw reading flickered in the field, so it must agree three times in a row before it counts.
    // Raw changes are logged (a limited number) so the cause can be found from the log.
    if FS_LAST_RAW.swap(raw, Ordering::SeqCst) != raw && FS_RAW_LOGGED.fetch_add(1, Ordering::SeqCst) < 60 {
        let front: Vec<_> = wins.iter().filter(|w| w.pid == front_pid).take(4).map(|w| json!([w.layer, w.bounds])).collect();
        log("fullscreen_raw", json!({ "raw": raw, "front_pid": front_pid, "our_panels_hidden": HIDDEN_BY_US.load(Ordering::SeqCst), "front_windows": front }));
    }
    let fs = FS_SMOOTH.lock().unwrap().get_or_insert_with(|| visibility::Debounce::new(false, 3)).push(raw);
    let show = visibility::should_show(visibility::Inputs { full_screen_app_in_front: fs, show_over_full_screen: std::env::var("COMPANION_OVER_FULLSCREEN").is_ok_and(|v| v == "1"), user_hid_it: USER_HID.load(Ordering::SeqCst) });
    if !show && !USER_HID.load(Ordering::SeqCst) && !HIDDEN_BY_US.swap(true, Ordering::SeqCst) {
        with_panels(|d, c| { d.orderOut(None); c.orderOut(None); });
        island_show(false);
        home_closed();
        log("hidden_for_full_screen", json!({}));
    } else if show && HIDDEN_BY_US.swap(false, Ordering::SeqCst) {
        with_panels(|d, _| d.orderFrontRegardless());
        island_show(true);
        log("shown_after_full_screen", json!({}));
    }
    // A screen plugged in or out, a resolution change, or the macOS Dock moving: put the character back inside.
    let sig = signature(&screens_now(mtm));
    // The island and Home go back on their display too, and Home is placed again if it is open.
    if { let mut g = SIG.lock().unwrap(); if *g != sig { *g = sig; true } else { false } } {
        apply_dock(mtm, "screens_changed", false);
        place_island(mtm, false, "screens_changed");
        with_panels(|d, c| if c.isVisible() { place_card(d, c) });
    }
    // With more than one display, the island moves to the one the person has been using for a few seconds.
    follow_pointer(mtm);
    // The character beside a window goes home when its window changed, its app left the front, or nothing about it is up.
    roam_tick(app, &wins, front_pid);
    let act = active(mtm);
    let fr = front();
    // Take the wheel: the editor or terminal came to the front while a plan runs, so ask it to pause.
    if let Some(reason) = WHEEL.lock().unwrap().get_or_insert_with(wheel::Wheel::default).on_front(&front_id()) {
        let cmd = json!({ "v": 1, "id": format!("wheel{}", now()), "type": "drive.pause", "agent": "builder-1", "reason": reason });
        let _ = app.state::<runner::Runner>().send(&cmd);
        log("take_the_wheel", json!({ "reason": reason }));
    }
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
    // Only a developer's settings file names a first folder; on anyone else's Mac the person chooses one.
    let first = dev.as_deref().and_then(|d| serde_json::from_str::<serde_json::Value>(d).ok())
        .and_then(|v| v.get("project").and_then(|p| p.as_str().map(String::from)));
    // The folder the person chose last wins; the development settings file only supplies the first one.
    let saved = projects::load(&projects_path()).current.filter(|c| std::path::Path::new(c).is_dir());
    *PROJECT.lock().unwrap_or_else(|e| e.into_inner()) = saved.or(first);
    let bundle = std::env::current_exe().ok().and_then(|e| runner::bundled_engine(&e));
    let result = runner::locations_with_bundle(dev.as_deref(), &|k| std::env::var(k).ok(), data.join("runner"), bundle)
        .and_then(|loc| app.state::<runner::Runner>().start(app, &loc, { let handle = app.clone(); move |t| {
            log("runner_event", json!({ "kind": t }));
            // Each time the engine (re)starts it has no key yet; it is handed one as soon as it says hello.
            if t == "runner.hello" { hand_key_over(&handle, None); }
            // An engine that has just (re)started knows no question, so an answer is not coming: what was seen is forgotten.
            if t == "runner.hello" { showme_pending().end(); }
            WHEEL.lock().unwrap().get_or_insert_with(wheel::Wheel::default).on_runner_event(t);
        } }));
    match result {
        Ok(()) => log("runner_started", json!({})),
        Err(e) => {
            log("runner_failed", json!({ "reason": e }));
            let a = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(1));
                runner::Runner::publish(&a, json!({ "v": 1, "id": "app-norunner", "type": "app.runner_down", "reason": e }));
            });
        }
    }
}

fn main() {
    // The helper of "delete everything" runs before anything of the app starts.
    if wipe_helper_mode() { return; }
    let _ = T0.set(now());
    let _ = RUN.set(format!("{}-{}", now(), std::process::id()));
    // One copy at a time: a second copy would own the same hotkeys and start a second engine. It leaves quietly before it
    // shows anything. It waits a few seconds first, because an update starts the new copy just before the old one ends.
    let instance = instance::take_waiting(&data_dir().join("instance.lock"), Duration::from_secs(5), Duration::from_millis(100));
    if instance::should_leave(&instance) { log("second_copy_left", json!({})); return; }
    if let instance::Taken::CouldNotCheck(why) = &instance { log("instance_not_checked", json!({ "why": why })); }
    let _instance = instance;   // held until Companion quits; macOS lets the lock go when the program ends
    let mods = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER;
    let k = Shortcut::new(Some(mods), Code::KeyK);   // open the ask box
    let x = Shortcut::new(Some(mods), Code::KeyX);   // stop everything
    let app = tauri::Builder::default()
        .activate_ignoring_other_apps(false)
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, s, e| {
                    // Hold to talk (two keys, talkkeys.rs) needs to know when the keys come up as well as down.
                    if is_talk(s) {
                        let down = e.state == ShortcutState::Pressed;
                        // A key repeat while held, or a let go that ends no press, restarts nothing and is not logged.
                        let counts = { let mut h = TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()); if down { h.press(now() as u64) } else { h.release() } };
                        if !counts { return; }
                        log("hotkey", json!({ "id": "talk", "down": down }));
                        // Never talk over the person: what is being said stops, a Show me answer still playing ends (no
                        // later step is drawn or said), and the page drops any line still waiting to be said.
                        if down { speech_off(app); showme_end_answer(app); let _ = app.emit("hush", ()); }
                        voice_send(app, if down { VoiceMsg::Down(now() as u64) } else { VoiceMsg::Up(now() as u64) });
                        return;
                    }
                    if e.state != ShortcutState::Pressed { return; }
                    if s == &sc_showme() {
                        // Open the box ready for a question about the screen; nothing is captured until the question is sent.
                        log("hotkey", json!({ "id": "S" }));
                        open_card(app, "hotkey", true);
                        let _ = app.emit("showme-mode", true);
                        return;
                    }
                    if s == &sc_problem() {
                        // Stuck? Check the project as it is, then point at where it fails. Nothing is captured until a place is known.
                        log("hotkey", json!({ "id": "F" }));
                        open_card(app, "hotkey", false);
                        let _ = app.emit("find-problem", true);
                        return;
                    }
                    if s == &k {
                        log("hotkey", json!({ "id": "K" }));
                        open_card(app, "hotkey", true);
                    } else if s == &sc_read() {
                        // Changing hotkeys from inside a hotkey handler can deadlock the shortcut plugin, so hand the work to another thread.
                        log("hotkey", json!({ "id": "R" }));
                        let a = app.clone();
                        std::thread::spawn(move || { arm_result_keys(&a, false); phelp::on_hotkey(&a, open_card); });
                    } else if s == &sc_explain() {
                        // Explain the error the person selected in another app. The light comes on before anything is read.
                        log("hotkey", json!({ "id": "E" }));
                        errhelp::on_hotkey(app, open_card);
                    } else if s == &sc_accept() {
                        log("hotkey", json!({ "id": "A" }));
                        let a = app.clone();
                        std::thread::spawn(move || { arm_result_keys(&a, false); phelp::put_back(&a, false); });
                    } else if s == &sc_esc() {
                        let a = app.clone();
                        std::thread::spawn(move || { arm_result_keys(&a, false); phelp::dismiss(&a); });
                    } else if s == &x {
                        let r = app.state::<runner::Runner>().stop_everything("kill switch");
                        log("hotkey", json!({ "id": "X", "stop_everything": true, "sent": r.is_ok() }));
                        let _ = app.emit("runner-event", json!({ "v": 1, "id": "app-kill", "type": "app.stop_everything" }));
                        showme_stop(&app);
                    }
                })
                .build(),
        )
        .manage(runner::Runner::new())
        .invoke_handler(tauri::generate_handler![char_click, ui_click, open_card_cmd, toggle_card, island_click, island_alert, island_state, resize_card, get_project, list_projects, use_project, pick_project, clone_project, save_api_key, remove_api_key, data_inventory, permission_overview, open_permission_page, delete_everything, export_logs, create_practice, showme_start, showme_aim, showme_clear, showme_hide, presentation_settings, set_presentation, quiet_now, point_problem, do_it_for_me, show_diagram, open_acknowledgements, speak, speak_stop, voice_settings, voice_speed, set_voice_settings, update_status, check_update, install_update, celebrate, save_share_card, copy_link, voice_download, talk_keys, set_talk_keys, close_card, send_command, drag_dock, drop_dock, dock_settings, set_come_to, permissions_status, replay_events, ph_consent, ph_ready, ph_accept, ph_restore, ph_dismiss, ph_answer, eh_consent, eh_dismiss])
        .setup(move |app| {
            log("launch", json!({}));
            let mtm = MainThreadMarker::new().unwrap();
            let dock_frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(DOCK.0, DOCK.1));
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
            let overlay_w = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into())).visible(false).focused(false).decorations(false).transparent(true).inner_size(100.0, 100.0).build()?;
            let island_w = WebviewWindowBuilder::new(app, "island", WebviewUrl::App("island.html".into())).visible(false).focused(false).decorations(false).transparent(true).accept_first_mouse(true).inner_size(185.0, 32.0).build()?;
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
            let overlay_ns: &NSWindow = unsafe { &*(overlay_w.ns_window()? as *const NSWindow) };
            let overlay = make_overlay(mtm, overlay_ns);
            OVERLAY.with(|o| *o.borrow_mut() = Some(overlay));
            // The island in the notch (F18): borderless, so it can never become the key window, and above the menu bar.
            let island_ns: &NSWindow = unsafe { &*(island_w.ns_window()? as *const NSWindow) };
            let island = make_panel(mtm, island_ns, false, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(185.0, 32.0)));
            island.setOpaque(false);
            island.setHasShadow(false);
            island.setBackgroundColor(Some(&NSColor::clearColor()));
            island.setLevel(island::LEVEL);
            add_hover_tracking(mtm, &island);
            ISLAND.with(|i| *i.borrow_mut() = Some(island));
            PANELS.with(|p| *p.borrow_mut() = Some((dock, card)));
            // Hide from screen sharing (on unless turned off), set before anything is ever drawn.
            apply_sharing(&presentation_now());
            apply_dock(mtm, "launch", false);
            place_island(mtm, false, "launch");
            *SIG.lock().unwrap() = signature(&screens_now(mtm));
            with_panels(|d, _| d.orderFrontRegardless());
            island_show(true);
            log("dock_shown", json!({ "app_active": active(mtm) }));
            let _ = APP.set(app.handle().clone());
            let h = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || tick(&h2));
            });
            // Another app may already own one of our hotkeys. That must never stop Companion from opening.
            let mut taken: Vec<&str> = Vec::new();
            for (sc, what) in [(k, "open the ask box"), (x, "stop everything"), (sc_read(), "Prompt help"), (sc_showme(), "Show me how"), (sc_problem(), "point at the problem"), (sc_explain(), "explain an error")] {
                if app.global_shortcut().register(sc).is_err() { taken.push(what); }
            }
            // Hold to talk is two keys the person can change (F18.3): the saved ones, else Option and Space.
            let talk = start_talk_keys(app.handle());
            if !taken.is_empty() || talk.using() != Some(talk.picked()) {
                log("hotkey_unavailable", json!({ "which": taken, "hold_to_talk": talk.using().map(|c| c.id) }));
            }
            if let Some(message) = talkkeys::launch_notice(&taken, &talk) {
                runner::Runner::publish(app.handle(), json!({ "v": 1, "id": "app-hotkeys", "type": "app.notice", "message": message }));
            }
            start_runner(app.handle());
            // If a "delete everything" could not remove some of it, the helper left a note; say it once.
            if let Ok(note) = std::fs::read_to_string(data_dir().join("wipe-note.txt")) {
                let _ = std::fs::remove_file(data_dir().join("wipe-note.txt"));
                runner::Runner::publish(app.handle(), json!({ "v": 1, "id": "app-wipe-note", "type": "app.notice", "message": note }));
            }
            // The menu bar icon: hide or show, stop everything, quit. Clicking it never takes your typing.
            let hide = MenuItemBuilder::with_id("hide", "Hide or show Companion").build(app)?;
            let stop = MenuItemBuilder::with_id("stop", "Stop everything").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Companion").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&hide, &stop, &quit]).build()?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
                .tooltip("Companion")
                .menu(&menu)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "hide" => { let _ = app.run_on_main_thread(|| {
                        let hide = !USER_HID.load(Ordering::SeqCst);
                        USER_HID.store(hide, Ordering::SeqCst);
                        with_panels(|d, c| if hide { d.orderOut(None); c.orderOut(None); } else if !HIDDEN_BY_US.load(Ordering::SeqCst) { d.orderFrontRegardless(); });
                        island_show(!hide && !HIDDEN_BY_US.load(Ordering::SeqCst));
                        if hide { home_closed(); }
                        log("menu_hide", json!({ "hidden": hide }));
                    }); }
                    "stop" => {
                        let r = app.state::<runner::Runner>().stop_everything("menu");
                        log("menu_stop_everything", json!({ "sent": r.is_ok() }));
                        let _ = app.emit("runner-event", json!({ "v": 1, "id": "app-kill", "type": "app.stop_everything" }));
                        showme_stop(&app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
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

#[cfg(test)]
mod bundle_tests {
    /// The app must never show a Dock icon, and must explain the microphone before macOS asks.
    #[test]
    fn the_info_file_keeps_the_no_dock_icon_setting_and_the_microphone_sentence() {
        let plist = include_str!("../Info.plist");
        assert!(plist.contains("<key>LSUIElement</key>") && plist.contains("<true/>"));
        assert!(plist.contains("<key>NSMicrophoneUsageDescription</key>"));
    }
    #[test]
    fn the_entitlements_allow_the_microphone() {
        assert!(include_str!("../Entitlements.plist").contains("com.apple.security.device.audio-input"));
    }
}
