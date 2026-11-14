//! Companion shell. Tauri's web pages inside NSPanels that we create ourselves,
//! non activating from the start (T01: no tauri-nspanel, no convert after creation).
//! Rule 9: never steal keyboard focus. Nothing here calls show(), set_focus() or
//! makeKeyAndOrderFront on a panel. Settings lives inside Home (F28, T17: the separate Settings window is retired).

mod docking;
mod peek;
mod peekout;
mod gaze;
mod google;
mod claude_install;
mod follow;
mod rest;
mod arrival;
mod island;
mod motion;
mod haptic;
mod trip;
mod esc;
mod roam;
mod fullscreen;
mod anchor;
mod updates;
mod speak;
mod fuzz;
mod logfile;
mod quit;
mod permissions;
mod ax;
mod phelp;
mod errhelp;
mod seclook;
#[allow(dead_code)] // wired to the hotkey in M5b
mod coords;
mod frame;
#[cfg(target_os = "macos")]
#[allow(dead_code)]
mod macos_see;
mod keystore;
mod license;
mod remoteswitch;
mod reportkey;
mod trial;
mod projects;
mod redact;
#[allow(dead_code)]
mod showme;
mod pointat;
mod share;
mod report;
mod yourturn;
mod wipe;
mod donehooks;
mod pastehere;
mod aitools;
mod golive;
mod notesfile;
mod numbersmail;
mod receiptfile;
mod logexport;
mod practice;
mod names;
mod newfolder;
mod made;
mod sharedfiles;
mod diagram;
mod labels;
mod snap;
mod prompthelp;
mod errorsel;
mod secondsel;
#[allow(dead_code)]
mod voice;
#[cfg(target_os = "macos")]
#[allow(dead_code)]
mod voice_mac;
mod speechmodel;
mod voiceset;
mod voicewords;
mod talkkeys;
mod dictate;
mod keymap;
mod visibility;
mod wheel;
mod everyday;
mod presentation;
mod settings;
mod groups;
mod convert;
mod docread;
mod homeset;
mod houserules;
mod loginitem;

mod runner;
mod instance;
mod exitlog;

use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSApplication, NSBackingStoreType, NSColor, NSPanel, NSScreen, NSView, NSWindow,
    NSWindowCollectionBehavior as B, NSWindowStyleMask as M,
    NSWorkspace, NSEvent, NSEventMask, NSEventType,
};
use block2::RcBlock;
use std::ptr::NonNull;
use objc2_foundation::{NSNumber, NSPoint, NSRect, NSSize, NSString};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use docking::{choice, inside, pick, signature, Prefs, Rect, Screen};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

const DOCK: (f64, f64) = (160.0, 160.0);
// Home's size (the card, F18): CARD is the usual width and least height (wide, M51), the size Home's window is made at. The
// size in force (look.layout: wide or tall, and home.size: standard or large) is `home_size()`, one definition in island.rs
// (HomeSize), used by resize_card, by card_spot and by everything that keeps clear of Home.
use island::CARD;

static RUN: OnceLock<String> = OnceLock::new();
static T0: OnceLock<u128> = OnceLock::new();
static SEQ: AtomicU64 = AtomicU64::new(0);
static CLICKS: AtomicU64 = AtomicU64::new(0);
static LOG: Mutex<()> = Mutex::new(());
static APP: OnceLock<AppHandle> = OnceLock::new();
static PROJECT: Mutex<Option<String>> = Mutex::new(None);
thread_local! { static OVERLAY: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) }; }
// The drop that follows the pointer (follow.rs): a tiny window that never takes clicks or the keyboard, made like the overlay.
thread_local! { static FOLLOW: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) }; }
/// What Show me how last saw, kept in memory until the answer's last step or until the answer is ended, then dropped; and
/// where the last step of a multi step answer pointed, so the next flight starts there (showme::Pending).
static SHOWME: Mutex<showme::Pending> = Mutex::new(showme::Pending::new());
fn showme_pending() -> std::sync::MutexGuard<'static, showme::Pending> { SHOWME.lock().unwrap_or_else(|e| e.into_inner()) }
/// Point at the problem: each run takes a number; Stop, Close or a newer run changes it, and an older run then stops before it looks or draws.
static POINT_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn point_cancel() { POINT_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst); turn_cancel(); follow_wake(); }
/// Your turn: the target the ring is waiting on (global points, label), and a number that Stop, Close or a newer ring changes.
static TURN: Mutex<Option<(coords::R, String)>> = Mutex::new(None);
static TURN_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Until when a pointer (ring, caption) is on the overlay, in ms since 1970: confetti waits. A pointer that fades by
/// itself frees it half a second after its ring time (10 s unless changed, point.ringSeconds); one waiting for a click,
/// or a Draw it for me picture kept until closed, holds it until the overlay is hidden.
static OVERLAY_BUSY_UNTIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn overlay_busy() -> bool { (now() as u64) < OVERLAY_BUSY_UNTIL.load(std::sync::atomic::Ordering::SeqCst) }
/// M46: how long until the pointer on the overlay goes by itself (ms), while one is up. None with none up, or with one that
/// waits for a click or is kept until closed: putting that away (hide_overlay) wakes the ring's thread instead.
fn overlay_busy_left_ms() -> Option<u64> {
    let (until, n) = (OVERLAY_BUSY_UNTIL.load(std::sync::atomic::Ordering::SeqCst), now() as u64);
    (until != u64::MAX && until > n).then(|| until - n)
}
/// A Draw it for me picture kept until it is closed (drawIt.seconds) is on the overlay: a new picture may replace it.
static DIAGRAM_KEPT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// Each celebration takes a number, so an older one's tidy up never cuts a newer one short.
static PARTY_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn turn_cancel() { TURN_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst); *TURN.lock().unwrap_or_else(|e| e.into_inner()) = None; }
static CARD_H: AtomicU64 = AtomicU64::new(150);
/// Settings is open in Home (the page says so with its height): Home uses the Large width and a fixed height (island.rs
/// `with_settings`, the overhaul spec 3.1).
static SETTINGS_OPEN: AtomicBool = AtomicBool::new(false);
/// M51: the next move of the character's window is a plain ease with no overshoot (set by a let go that goes in at an edge).
static LAND_EASE: AtomicBool = AtomicBool::new(false);
static USER_HID: AtomicBool = AtomicBool::new(false);      // hidden from the menu bar icon
static HIDDEN_BY_US: AtomicBool = AtomicBool::new(false);  // hidden because a full screen app is in front
static FS_SMOOTH: Mutex<Option<visibility::Debounce>> = Mutex::new(None);
/// What each display was seen to keep free while no full screen app was in front (fullscreen.rs).
static FS_SEEN: Mutex<fullscreen::Seen> = Mutex::new(fullscreen::Seen::new());
static FS_RAW_LOGGED: AtomicU64 = AtomicU64::new(0);
static FS_LAST_RAW: AtomicBool = AtomicBool::new(false);

thread_local! {
    static PANELS: RefCell<Option<(Retained<NSPanel>, Retained<NSPanel>)>> = const { RefCell::new(None) };
    static LAST: RefCell<(bool, String, bool)> = const { RefCell::new((false, String::new(), false)) };
    static LAST_STATE: RefCell<String> = const { RefCell::new(String::new()) };
    /// M55, adapts to you: the kind of app in front Home was told last (everyday.rs home_front), so it is told only a change.
    static FRONT_KIND_SENT: RefCell<String> = const { RefCell::new(String::new()) };
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
    // 5 Nov 2026: every ending also gets one plain line in ~/Library/Logs/Squibby/exits.log (exitlog.rs).
    if exitlog::mirrored(ev) { exitlog::note(ev, &extra); }
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
    // Borderless and non activating. M66: Home too (it was Titled, which may get a system rim and corner mask): its own
    // subclass (homepanel) can become key, only when the person clicks into it or a typing key opens it, never main, and
    // keeps its top at the display's top. A plain borderless panel never becomes key: the character never takes typing.
    let style = M::Borderless | M::NonactivatingPanel;
    let panel = if card { homepanel::HomePanel::make(mtm, frame, style) } else { NSPanel::initWithContentRect_styleMask_backing_defer(mtm.alloc::<NSPanel>(), frame, style, NSBackingStoreType::Buffered, false) };
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setFloatingPanel(true);
    panel.setHidesOnDeactivate(false);
    panel.setLevel(3);
    // By default the character stays out of full screen apps (the product default). The setting Show Companion over full
    // screen apps (character.overFullScreen), or a developer's COMPANION_OVER_FULLSCREEN=1, keeps it on screen over them.
    // fullScreenAuxiliary lets it be on a full screen Space; whether it stays there is decided by
    // visibility.rs, because on macOS 27 leaving the flag out did not hide it.
    panel.setCollectionBehavior(B::CanJoinAllSpaces | B::FullScreenAuxiliary | B::Stationary | B::IgnoresCycle);
    panel.setBackgroundColor(Some(&NSColor::whiteColor()));
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
    let hs = home_set();
    // With the island turned off in Settings there is no island to drop from: Home opens beside the character.
    let on = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).clone().filter(|_| hs.island_show);
    let home = roamer().home().unwrap_or_else(|| from_appkit(d.frame(), ph));
    let size = home_size();
    // M66 step 6: with no island, Home's window sits here at the widest size it may take (Settings' width in the tall Home),
    // so opening Settings never squeezes it; with the island, the body at the size in force, as the page draws it.
    let w = if on.is_some() { size.w } else { home_sizes(&hs).iter().map(|s| s.w).fold(0.0, f64::max) };
    let spot = island::card_spot(on.as_ref(), home, &list, |id| with_prefs(|p| choice(p, id).0), (w, h.clamp(size.min_h, size.max_h)))?;
    Some((spot, ph))
}

/// Place Home's window (M66: island.rs home_panel): top anchored on the island's display and centred on the notch, at a
/// fixed size that holds every state Home may take with this display and these settings, so it never changes during a
/// motion or with Home's content. With no island (turned off in Settings) it sits beside the character's home, as before
/// F18. The page is told the shape's measures when they change. It does not follow the character to a window.
fn place_card(d: &NSPanel, c: &NSPanel) {
    let mtm = MainThreadMarker::new().unwrap();
    let hs = home_set();
    let on = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).clone().filter(|_| hs.island_show);
    let sizes = home_sizes(&hs);
    let spot = if on.is_none() { card_spot(mtm, d, sizes.iter().map(|s| s.max_h).fold(0.0, f64::max)).map(|(r, _)| r) } else { None };
    // The window holds every size; the body is the size in force (Settings open or not), so the page draws it that wide.
    let Some(p) = island::home_panel(on.as_ref(), &sizes, home_size(), spot) else { return };
    // M66 step 5: grown from the wings while the island shows them (something running), so they never blink.
    let s = *ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner());
    let p = match on.as_ref() { Some(d) => island::grown_from(p, d, s.alert.then_some(f64::from(s.wing))), None => p };
    let ph = screens_now(mtm).first().map(|s| s.frame[3]).unwrap_or(0.0);
    // At once, never a motion, through the one helper; only when the frame really changes (a display or a setting).
    if from_appkit(c.frame(), ph) != p.frame { set_frame_moving(c, to_appkit(p.frame, ph), None, None, &CARD_MOVES); }
    let geom = p.json();
    *HOME_PANEL.lock().unwrap_or_else(|e| e.into_inner()) = Some(p);
    home_rects_now();
    // Counted as told only when the page really was (at launch this runs before the handle is kept), so a later placing with
    // the same measures still tells it.
    if let Some(app) = APP.get() { let mut g = HOME_GEOM.lock().unwrap_or_else(|e| e.into_inner()); if *g != geom { *g = geom.clone(); let _ = app.emit_to("card", "home-geom", geom); } }
    // If at its tallest Home could reach the character beside a window, the visit is planned again clear of it (or ends).
    // Only while Home is up: its window is always ordered in now, so a closed Home must not move the character.
    if card_visible() { if let Some((room, _)) = card_spot(mtm, d, home_size().max_h) { roam_card_moved(mtm, room); } }
}

/// Every size Home may take without a display or setting change: the size set, and the size with Settings open.
fn home_sizes(hs: &homeset::HomeSet) -> [island::HomeSize; 2] { [hs.size, island::with_settings(hs.size, true)] }

/// Home's window and the shape's measures inside it (island.rs HomePanel), as placed last, and what the page was told.
static HOME_PANEL: Mutex<Option<island::HomePanel>> = Mutex::new(None);
static HOME_GEOM: Mutex<Value> = Mutex::new(Value::Null);
/// The shape's rects in global points while Home is shown (island.rs shape_rects), for the click through, the click away
/// watch and the leave grace. Empty while closed: the island takes the pointer then.
static HOME_RECTS: Mutex<Vec<Rect>> = Mutex::new(Vec::new());
/// Home is shown: from its opening until its page says the close has folded back into the notch (M66). The panel itself
/// stays ordered in all the while, its shape collapsed and the pointer passing through, so this is what "Home is up" means.
static HOME_SHOWN: AtomicBool = AtomicBool::new(false);
/// Whether the window lets the pointer through now (set only when it changes).
static HOME_PASS: AtomicBool = AtomicBool::new(true);
/// The pointer's leave grace for a Home that pointing opened (island.rs Leave).
static HOME_LEAVE: Mutex<island::Leave> = Mutex::new(island::Leave::new(false));
/// M70 step 5: Home grew from the notch's small panel: the panel's width and until when (epoch ms) its band is drawn that
/// wide (island.rs FROM_BAND_MS), so the hit test takes the black the person sees. Set at the opening, cleared on close.
static HOME_FROM: Mutex<Option<(f64, u64)>> = Mutex::new(None);
fn home_rects_now() {
    let shown = HOME_SHOWN.load(Ordering::SeqCst);
    let from = island::from_band(*HOME_FROM.lock().unwrap_or_else(|e| e.into_inner()), now() as u64);
    let r = HOME_PANEL.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|p| island::shape_rects_from(p, shown, CARD_H.load(Ordering::SeqCst) as f64, from)).unwrap_or_default();
    *HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()) = r;
}
/// The window lets the pointer through unless it is on the shape (`on`). Main thread. Never takes focus.
fn home_pass(on: bool) {
    let pass = !on;
    if HOME_PASS.swap(pass, Ordering::SeqCst) == pass { return; }
    with_panels(|_, c| c.setIgnoresMouseEvents(pass));
}
/// A typing key opened Home (M26): its panel may take the keyboard though the pointer is elsewhere. Cleared when it folds.
static HOME_KEY_BY_KEY: AtomicBool = AtomicBool::new(false);
/// Whether the pointer is on Home's shape now (macOS's own pointer position; global points). Main thread.
fn home_on_shape_now() -> bool {
    let Some(mtm) = MainThreadMarker::new() else { return false };
    let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    let m = NSEvent::mouseLocation();
    island::inside_shape(&HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()), (m.x, ph - m.y), 0.0)
}
/// M66 step 6: each mouse move macOS reports (the ring's monitors, where the pointer is only), the click through follows at
/// once, so a quick flick from Home to the menu bar or an app beside it lands there first try, not after the 50 ms watch.
/// Main thread.
fn home_pointer_moved() {
    if !HOME_SHOWN.load(Ordering::SeqCst) || HOME_FOLDING.load(Ordering::SeqCst) != 0 { return; }
    let on = home_on_shape_now();
    home_pass(on);
}
/// Home's panel may become key only while the pointer is on its shape or a typing key opened it (island.rs home_can_key).
fn home_may_key() -> bool { island::home_can_key(!HOME_PASS.load(Ordering::SeqCst), HOME_KEY_BY_KEY.load(Ordering::SeqCst)) }
/// Home's panel checks each press itself, at the moment of the press: one on its clear parts (the click through had not yet
/// caught up with the pointer) is dropped, never handled by the page and never making Home key (rule 9), and the window
/// lets the pointer through from then on. True when the press was dropped. Main thread.
fn home_press_off_shape(w: &NSWindow, ev: &NSEvent) -> bool {
    use objc2_app_kit::NSEventType as T;
    let t = ev.r#type();
    if !(t == T::LeftMouseDown || t == T::RightMouseDown || t == T::OtherMouseDown) { return false; }
    let Some(mtm) = MainThreadMarker::new() else { return false };
    let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    let (f, l) = (w.frame(), ev.locationInWindow());
    let pt = (f.origin.x + l.x, ph - (f.origin.y + l.y));
    if island::inside_shape(&HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()), pt, 0.0) { return false; }
    home_pass(false);
    log("home_press_off_shape", json!({}));
    true
}
/// Home's window level for now (island.rs home_level): under our own macOS dialogs while one is up. Any thread.
fn home_level_now() {
    let Some(app) = APP.get() else { return };
    let _ = app.run_on_main_thread(|| { let l = island::home_level(NATIVE_DIALOGS.load(Ordering::SeqCst) > 0); with_panels(|_, c| c.setLevel(l)); });
}
/// For the page when it loads: the shape's measures now, and whether Home is shown.
#[tauri::command]
fn home_geom() -> Value { json!({ "geom": HOME_GEOM.lock().unwrap_or_else(|e| e.into_inner()).clone(), "shown": HOME_SHOWN.load(Ordering::SeqCst) }) }

/// The frames asked of the island and of Home (island::Moves): a motion still running when a frame is set at once must
/// not leave the panel on its own, older target.
static ISLAND_MOVES: Mutex<island::Moves> = Mutex::new(island::Moves::new());
static CARD_MOVES: Mutex<island::Moves> = Mutex::new(island::Moves::new());

/// Moves a panel to `f` (AppKit points), as a short motion of `secs` when given (island.rs decides; never with Reduce
/// motion or Less motion), with its see through value going to `alpha`. Every frame of the island and of Home goes through
/// here: AppKit lets a running motion finish on its old target when the frame is then set directly, so "at once" is a
/// motion of no length (which replaces one still running) and is also set at once, and when a motion ends, a frame set at
/// once after it is set again (`moves`). When the motion ends, `alpha` is set again without motion, so a panel is never
/// left faded. Main thread. Takes no focus.
fn set_frame_moving(p: &NSPanel, f: NSRect, secs: Option<f64>, alpha: Option<f64>, moves: &'static Mutex<island::Moves>) {
    use objc2::Message;
    use objc2_app_kit::{NSAnimatablePropertyContainer, NSAnimationContext};
    let want = [f.origin.x, f.origin.y, f.size.width, f.size.height];
    let mine = moves.lock().unwrap_or_else(|e| e.into_inner()).ask(want, secs.is_some());
    let (w, w2) = (p.retain(), p.retain());
    // The character's own moves (peeking, peek.rs) overshoot a little and settle, like a spring.
    // Peeking overshoots; going in at its edge after a let go never does (LAND_EASE, M51), and that is used up by this one move.
    let ease = LAND_EASE.swap(false, Ordering::SeqCst);
    let spring = !ease && secs.is_some() && std::ptr::eq(moves, &DOCK_MOVES);
    let changes = RcBlock::new(move |ctx: NonNull<NSAnimationContext>| {
        unsafe { ctx.as_ref() }.setDuration(secs.unwrap_or(0.0));
        if spring { spring_timing(unsafe { ctx.as_ref() }); }
        // M66: a landing at the edge eases out on the one motion system's curve (motion.rs), never the system default.
        else if ease { curve_timing(unsafe { ctx.as_ref() }, motion::EASE_OUT); }
        let a = w.animator();
        a.setFrame_display(f, true);
        if let Some(x) = alpha { a.setAlphaValue(x); }
    });
    let done = RcBlock::new(move || {
        if let Some(x) = alpha { w2.setAlphaValue(x); }
        if let Some(r) = moves.lock().unwrap_or_else(|e| e.into_inner()).ended(mine) { w2.setFrame_display(NSRect::new(NSPoint::new(r[0], r[1]), NSSize::new(r[2], r[3])), true); }
    });
    NSAnimationContext::runAnimationGroup_completionHandler(&changes, Some(&done));
    // At once: in place now as well, so whatever reads the frame next sees it.
    if secs.is_none() { p.setFrame_display(f, true); if let Some(a) = alpha { p.setAlphaValue(a); } }
}

/// Where our card can reach at its tallest while it is up, for the character to keep clear of. Nothing while it is
/// closed: if it opens later, place_card plans the visit again.
fn card_room(mtm: MainThreadMarker) -> Vec<Rect> {
    with_panels(|d, _| if card_visible() { card_spot(mtm, d, home_size().max_h).map(|(r, _)| r) } else { None }).flatten().into_iter().collect()
}

// Much of the shell lives in the shell_*.rs files beside this one. Each is pulled in here with include!, so its code
// is part of this file's own module, exactly as if it were still written here (main_src below puts the text back
// together for the tests that read the shell's source).
include!("shell_dock.rs");
// ---------- Home in the notch (F18.1; the maths is in island.rs, tested) ----------

thread_local! {
    static ISLAND: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) };
    // The tracking area on the island does not keep its owner alive, so it is kept here for as long as the app runs.
    static ISLAND_HOVER_OWNER: RefCell<Option<Retained<hover::HoverOwner>>> = const { RefCell::new(None) };
    // The same for the character's window (peeking).
    static DOCK_HOVER_OWNER: RefCell<Option<Retained<hover::DockHoverOwner>>> = const { RefCell::new(None) };
}
/// The wings widen for a moment when a fix is proven (island.tsx asks, island.rs cheered). Never with Reduce motion or Less motion.
static ISLAND_CHEER: AtomicBool = AtomicBool::new(false);
/// M73: a proven fix's tick shows on the island now (island.tsx tells), so the trackpad taps once as it lands.
static ISLAND_PROVEN: AtomicBool = AtomicBool::new(false);
/// M34: results finished while Home was closed, shown as a count on the notch (island::unseen_next).
static UNSEEN: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
/// M52 (F30): changes another AI tool made, ready to review, said quietly on the notch (island::ReviewReady).
static REVIEW_READY: Mutex<island::ReviewReady> = Mutex::new(island::ReviewReady::new());
fn review_ready() -> std::sync::MutexGuard<'static, island::ReviewReady> { REVIEW_READY.lock().unwrap_or_else(|e| e.into_inner()) }
/// Tells the island page when the dot changed (`changed`, from island::ReviewReady). The page shows it on the hover panel.
fn review_dot_told(app: &AppHandle, changed: bool) {
    if !changed { return; }
    let (on, key) = { let r = review_ready(); (r.on(), r.key()) };
    let _ = app.emit_to("island", "review-ready", json!({ "on": on, "key": key }));
}
/// The engine watches the open project for changes only while review.mode is not off and Flow is on (runner/src/review).
fn review_watched() -> bool { review_mode_now() != "off" && !group_off("flow.on") }
/// M74: the review mode in force for the open project (protocol/index.ts reviewModeOf): its own choice (review.modeHere),
/// or with Same as everywhere the usual review.mode. setting_now reads the open project's own values.
fn review_mode_now() -> String {
    let modes = ["ask", "automatic", "off"];
    let here = setting_now("review.modeHere");
    if let Some(h) = here.as_str().filter(|h| modes.contains(h)) { return h.to_string(); }
    setting_now("review.mode").as_str().filter(|m| modes.contains(m)).unwrap_or("ask").to_string()
}
/// An event from the engine (Runner::publish): a batch of changes ready to review, a result, or the engine starting again.
/// On the main thread, where Home's window lives, so whether Home is in front is read truly. Never a sound, never the wings.
pub(crate) fn review_heard(app: &AppHandle, v: &Value) {
    let t = v.get("type").and_then(Value::as_str).unwrap_or("");
    if !(t == "review.batch" || t == "review.result" || t == "runner.hello" || t == "app.runner_down") { return; }
    // Only what the dot needs: the type, the project, the batch's name, its count and whether the review was done, and
    // (M57 feature 5) how many places the instant key warning named, never the places themselves.
    let keys = v.get("keys").and_then(Value::as_array).map_or(0, |a| a.len());
    let v = json!({ "type": t, "project": v.get("project"), "batch": v.get("batch"), "count": v.get("count"), "ok": v.get("ok"), "keys": keys });
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let seen = HOME_OPEN.load(Ordering::SeqCst) && card_visible();
        let watched = review_watched();
        let changed = { let mut r = review_ready(); if watched { r.heard(&v, &current_project(), seen) } else { r.clear() } };
        review_dot_told(&a, changed);
    });
}
static ISLAND_STATE: Mutex<island::State> = Mutex::new(island::State { hover: false, alert: false, home_open: false, panel: 0, ask: false, quiet: false, wing: 0 });
static ISLAND_HOVER: Mutex<island::Hover> = Mutex::new(island::Hover::new());
/// The display the island was on last (`island.json`), read once.
static ISLAND_LAST: Mutex<Option<String>> = Mutex::new(None);
/// The display it is on now, for Home to drop down from.
static ISLAND_ON: Mutex<Option<island::Display>> = Mutex::new(None);
/// What the island page was last told: its size, what it sits on (the notch, a pill, or the thin line on the top edge), and
/// the frame it springs its shape to (island.rs `Look`). Null until the first time.
static ISLAND_SENT: Mutex<Value> = Mutex::new(Value::Null);
/// Counts each frame asked of the island, so a smaller frame that waits for the shape to tuck back (island.rs `retract_ms`)
/// is dropped when a newer one was asked meanwhile.
static ISLAND_GEN: AtomicU64 = AtomicU64::new(0);
/// Which display the pointer has stayed on, so the island can go to the one the person is using.
static ISLAND_FOLLOW: Mutex<island::Follow> = Mutex::new(island::Follow::new());
/// Home (the card) is open; each opening takes a number, so an older click away watch stops.
static HOME_OPEN: AtomicBool = AtomicBool::new(false);
static HOME_GEN: AtomicU64 = AtomicU64::new(0);
/// One of Companion's own native dialogs (the folder chooser, the delete question) is up: a click in it is not a click elsewhere.
static NATIVE_DIALOGS: AtomicU64 = AtomicU64::new(0);
struct NativeDialog;
impl NativeDialog { fn open() -> Self { NATIVE_DIALOGS.fetch_add(1, Ordering::SeqCst); home_level_now(); NativeDialog } }
impl Drop for NativeDialog { fn drop(&mut self) { NATIVE_DIALOGS.fetch_sub(1, Ordering::SeqCst); home_level_now(); } }

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

/// The id (as `displays_now` names it) of the Mac's own screen, when it is connected and on (CGDisplayIsBuiltin); None
/// with the lid closed or on a Mac with no screen of its own. Only for island.display "built in". Main thread.
fn builtin_display(mtm: MainThreadMarker) -> Option<String> {
    let list = NSScreen::screens(mtm);
    let primary_h = list.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    list.iter().find(|s| screen_number(s).is_some_and(|id| objc2_core_graphics::CGDisplayIsBuiltin(id))).map(|s| { let f = from_appkit(s.frame(), primary_h); format!("{}x{}@{},{}", f[2], f[3], f[0], f[1]) })
}

/// A screen's display id, from its device description (NSScreenNumber), which every macOS Companion runs on has. Never
/// NSScreen's own display id property: it is new in macOS 26, and on macOS 14 or 15 asking for it raises an Objective-C
/// exception that stops the app (homeset.rs wiring test). Main thread.
fn screen_number(s: &NSScreen) -> Option<u32> {
    let n = s.deviceDescription().objectForKey(&NSString::from_str("NSScreenNumber"))?.downcast::<NSNumber>().ok()?;
    Some(n.unsignedIntValue())
}

/// Puts the island on its display at the size it should be now, and tells its page. `follow_mouse`: the person is opening
/// Home, so the display with the pointer. Otherwise the display it was on last (`follow_pointer` changes that after the
/// pointer stays on another display), so a change of size alone never moves it. Main thread.
fn place_island(mtm: MainThreadMarker, follow_mouse: bool, reason: &str) {
    let hs = home_set();
    // Turned off in Settings (island.show): no island, and Home opens beside the character (card_spot).
    if !hs.island_show { *ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()) = None; island_show(false); return; }
    let list = displays_now(mtm);
    let Some(first) = list.first() else { return };
    let ph = first.frame[3];
    let last = island_last();
    let mouse = if follow_mouse || !list.iter().any(|d| d.id == last) { let m = NSEvent::mouseLocation(); (m.x, ph - m.y) } else { (f64::NAN, f64::NAN) };
    // Which display (island.display): the one being used (today's), the Mac's own screen, or the main one.
    let builtin = if hs.display == island::Where::BuiltIn { builtin_display(mtm) } else { None };
    let Some((d, how)) = island::pick_where(&list, hs.display, builtin.as_deref(), &last, mouse, follow_mouse) else { return };
    let d = d.clone();
    if d.id != last { remember_island(&d.id); }
    let moved = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).as_ref() != Some(&d);
    if moved { reset_hover(); }
    // M46: on a call or presenting (Quiet during calls), or hidden, the island never opens by itself and never cheers; its
    // marks still show, and the pointer still opens it (island.rs `mode`). Only the front app's id is read (rule 7).
    let state = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); s.home_open = HOME_OPEN.load(Ordering::SeqCst); s.quiet = quiet() || companion_hidden(); *s };
    let mode = island::mode(state);
    let look = island::look_winged(&d, mode, f64::from(state.panel), f64::from(state.wing));
    let look = if ISLAND_CHEER.load(Ordering::SeqCst) && !reduce_motion() && !state.quiet { island::cheered(&d, mode, look) } else { look };
    let f = look.frame;
    *ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()) = Some(d.clone());
    // The page springs its shape to the new size (island.tsx). Growing is at once, so the shape has room to grow into;
    // getting smaller in place waits while the shape tucks back (island.rs), unless Reduce motion or Less motion is on.
    let gen = ISLAND_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let from = ISLAND.with(|i| i.borrow().as_ref().filter(|p| p.isVisible()).map(|p| from_appkit(p.frame(), ph)));
    let kind = island::kind(&d);
    // M70 step 5: what the island draws now (or is tucking into), for its click through (island_pointer_moved); set before
    // the window's frame may wait for the tuck, so the clear rest of the old frame lets clicks through at once.
    *ISLAND_SHAPE.lock().unwrap_or_else(|e| e.into_inner()) = Some((f, island::island_corner(mode, kind)));
    tell_island(mode, kind, &look, state.hover);
    match from.filter(|_| !moved).and_then(|from| island::retract_ms(from, f, reduce_motion())) {
        None => set_island_frame(f, ph),
        Some(ms) => if let Some(app) = APP.get() {
            let a = app.clone();
            std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(ms)); let _ = a.run_on_main_thread(move || if ISLAND_GEN.load(Ordering::SeqCst) == gen { set_island_frame(f, ph) }); });
        },
    }
    if moved { log("island_placed", json!({ "reason": reason, "how": how, "screen": d.id, "kind": kind.word(), "frame": f })); }
    // M90: the peek beside it follows (its place, and hidden while the island's panel or Home is out).
    peekout_apply("island");
}

/// Sets the island's window to `f` (global top left points) at once. Every frame of the island goes through here. Main thread.
/// The island's frame as set last (global top left points), for the Home watch thread to read without a main thread hop.
static ISLAND_AT: Mutex<Option<Rect>> = Mutex::new(None);
fn set_island_frame(f: Rect, ph: f64) {
    *ISLAND_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { set_frame_moving(p, to_appkit(f, ph), None, None, &ISLAND_MOVES); } });
}

/// M70 step 5: the shape the island draws (its frame, or the one it is tucking into, and its bottom corner, island.rs
/// island_corner), and whether its window lets the pointer through now (set only when it changes).
static ISLAND_SHAPE: Mutex<Option<(Rect, f64)>> = Mutex::new(None);
static ISLAND_PASS: AtomicBool = AtomicBool::new(false);
/// Each mouse move macOS reports (the ring's monitors, where the pointer is only, never keys): the island's window lets
/// the pointer through where it is clear (beside the small panel's round corners, or the old panel's frame while the
/// shape tucks back), as Home's does, so a click there reaches the menu bar or the app behind (rule 9). Its tracking area
/// may say nothing while the window lets the pointer through, so moving into a clear part leaves the island, and coming
/// back onto the black enters it again. Main thread.
fn island_pointer_moved() {
    // M90: the peek's click through and hover follow the same moves.
    peekout_pointer_moved();
    let Some(mtm) = MainThreadMarker::new() else { return };
    let Some(shape) = *ISLAND_SHAPE.lock().unwrap_or_else(|e| e.into_inner()) else { return };
    let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    let m = NSEvent::mouseLocation();
    let pt = (m.x, ph - m.y);
    let window = island_rect(ph);
    let pass = island::island_pass(window, shape, pt);
    if ISLAND_PASS.swap(pass, Ordering::SeqCst) == pass { return; }
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { p.setIgnoresMouseEvents(pass); } });
    if pass { island_hover_changed(false); } else if window.is_some_and(|w| island::contains(w, pt)) { island_hover_changed(true); }
}

/// `hover`: the pointer is what opened the panel (M26): otherwise it opened by itself for a question or for work going on,
/// and the page shows only the cards.
fn tell_island(mode: island::Mode, kind: island::Kind, look: &island::Look, hover: bool) {
    let v = json!({ "mode": mode.word(), "kind": kind.word(), "w": look.frame[2], "h": look.frame[3], "core": look.core, "row": look.row, "wing": look.wing, "hover": hover });
    {
        let mut g = ISLAND_SENT.lock().unwrap_or_else(|e| e.into_inner());
        if *g == v { return; }
        *g = v.clone();
    }
    if let Some(app) = APP.get() { let _ = app.emit_to("island", "island-mode", v); }
}

/// The island goes to the display the person is using: the one the pointer has stayed on for a few seconds (island.rs
/// `Follow`), not while Home is open. Called from `tick`, twice a second. Only which display the pointer is on is used,
/// read with `NSEvent::mouseLocation` (no permission); never what is on the screen, never keys. Main thread.
fn follow_pointer(mtm: MainThreadMarker) {
    // Only with Follow me (island.display), and only while there is an island.
    let hs = home_set();
    if hs.display != island::Where::Follow || !hs.island_show { return; }
    let list = displays_now(mtm);
    if list.len() < 2 { return; }
    let ph = list[0].frame[3];
    let m = NSEvent::mouseLocation();
    let p = (m.x, ph - m.y);
    let under = list.iter().find(|d| island::contains(d.frame, p)).map(|d| d.id.as_str());
    let current = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|d| d.id.clone()).unwrap_or_default();
    let to = ISLAND_FOLLOW.lock().unwrap_or_else(|e| e.into_inner()).sample(under, &current, HOME_OPEN.load(Ordering::SeqCst), now() as u64, hs.follow_ms);
    if let Some(id) = to { remember_island(&id); place_island(mtm, false, "followed_pointer"); }
}

fn island_show(on: bool) {
    // Turned off in Settings (island.show): never shown, whatever asks.
    let on = on && home_set().island_show;
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { if on { p.orderFrontRegardless(); } else { p.orderOut(None); } } });
    if !on { reset_hover(); }
    // M90: the peek beside it goes and comes with it.
    peekout_apply("island");
}

/// The island's frame in global top left points, if it is on screen. Main thread.
fn island_rect(primary_h: f64) -> Option<Rect> {
    ISLAND.with(|i| i.borrow().as_ref().filter(|p| p.isVisible()).map(|p| from_appkit(p.frame(), primary_h)))
}

/// Forgets whether the pointer was on the island (it was hidden, moved, or Home opened or closed over it).
fn reset_hover() {
    let times = home_set().hover;
    *ISLAND_HOVER.lock().unwrap_or_else(|e| e.into_inner()) = { let mut h = island::Hover::new(); h.set_times(times); h };
    ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()).hover = false;
    // Home's page drops its hover nudge too: a hidden or moved island sends no mouseExited (bug bash 5 Nov).
    if let Some(a) = APP.get() { let _ = a.emit_to("card", "home-hover", json!({ "on": false })); }
}

/// Home went away (Esc, Close, a click elsewhere, the island or the character clicked again, a full screen app, Hide): the
/// click away watch stops and the island goes back to its own size. Main thread.
fn home_closed() {
    HOME_OPEN.store(false, Ordering::SeqCst);
    *HOME_FROM.lock().unwrap_or_else(|e| e.into_inner()) = None;
    HOME_GEN.fetch_add(1, Ordering::SeqCst);
    reset_hover();
    if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "home_closed"); }
    if let Some(a) = APP.get() {
        // A Prompt help result no longer shows, so the keys it borrows from every app (Esc, and Use a suggestion's) go back
        // now, whichever way Home went away (T11); the page takes them again if the result shows again. On its own thread,
        // because this can run inside a hotkey handler, where changing shortcuts can deadlock.
        { let a = a.clone(); std::thread::spawn(move || arm_result_keys(&a, false)); }
        // The page is told, so it forgets the pointer was on a part of it (a hidden window sends no pointerleave).
        let _ = a.emit_to("card", "closed", json!({}));
    }
}

/// The page says whether the wings are out (something is happening; home.ts islandWings) and how tall its hover panel's
/// contents are (`panel`, points, measured; island.rs keeps it between PANEL_MIN and PANEL_MAX). M55: `wing`, how wide each
/// wing must be to say a job's step in a word (measured; island.rs keeps it between WING and WING_MAX; none: the usual).
#[tauri::command]
fn island_alert(app: AppHandle, on: bool, panel: Option<f64>, cheer: Option<bool>, ask: Option<bool>, wing: Option<f64>, proven: Option<bool>) {
    let panel = island::panel_h(panel.unwrap_or(0.0)).round() as u16;
    let wing = island::wing_w(wing.unwrap_or(0.0)).round() as u16;
    let cheer = cheer.unwrap_or(false) && on;
    let ask = ask.unwrap_or(false) && on;
    let proven = proven.unwrap_or(false);
    let _ = app.run_on_main_thread(move || {
        // M73 (fluid, item 11): one light tap on the trackpad as a fix is proven, only with the switch on (haptic.rs).
        let was_proven = ISLAND_PROVEN.swap(proven, Ordering::SeqCst);
        if haptic::ticks_on_proven(&setting_now(haptic::KEY), was_proven, proven) { haptic::tick(); }
        let cheer_changed = ISLAND_CHEER.swap(cheer, Ordering::SeqCst) != cheer;
        let changed = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); let c = s.alert != on || s.panel != panel || s.ask != ask || s.wing != wing || cheer_changed; s.alert = on; s.panel = panel; s.ask = ask; s.wing = wing; c };
        if changed {
            if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "alert"); }
            // M66 step 5: Home grows from (and folds back into) the wings the island shows; its page hears when they change.
            with_panels(place_card);
        }
    });
}

/// For the island page when it loads: its size now, what it sits on, and an update a check found (its version only).
#[tauri::command]
fn island_state() -> Value {
    let mut v = ISLAND_SENT.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if !v.is_object() { v = json!({ "mode": "rest", "kind": "pill" }); }
    v["update"] = UPDATE_READY.lock().unwrap_or_else(|e| e.into_inner()).clone().map(|u| json!({ "version": u })).unwrap_or(Value::Null);
    v["unseen"] = json!(UNSEEN.load(Ordering::SeqCst));
    { let r = review_ready(); v["review"] = json!(r.on()); v["reviewKey"] = json!(r.key()); }
    v["home"] = json!(HOME_SHOWN.load(Ordering::SeqCst));
    v
}

/// macOS tells us the pointer entered or left the island: a tracking area on that one window, active even while another
/// app is in front. Nothing else about the pointer is read for this. Main thread.
fn island_hover_changed(inside: bool) {
    let t = now() as u64;
    // The waits, and whether resting opens the status at all, as Settings says now (island.peekOnHover, openDelay, closeDelay).
    let times = home_set().hover;
    let nudge = { let mut h = ISLAND_HOVER.lock().unwrap_or_else(|e| e.into_inner()); h.set_times(times); if inside { h.enter(t) } else { h.exit(t) } h.inside() };
    // M66: the hover nudge answers at once (Home's collapsed shape grows a little under the island, homeShape.ts), not
    // after the open wait. Never while Home is up.
    if let Some(a) = APP.get() { let _ = a.emit_to("card", "home-hover", json!({ "on": nudge && !card_visible() })); }
    island_hover_settle();
}
fn island_hover_settle() {
    let t = now() as u64;
    let (shown, wait) = { let mut h = ISLAND_HOVER.lock().unwrap_or_else(|e| e.into_inner()); (h.at(t), h.wait_ms(t)) };
    // 2 Nov 2026 (island.pointOpens): resting on the notch opens Home itself, the usual; Status line keeps the peek. A
    // question already open under the wings stays there (island.rs on_point).
    let act = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); s.home_open = HOME_OPEN.load(Ordering::SeqCst); island::on_point(*s, home_set().point_opens) };
    let peek = island::peek_hover(shown, act);
    let changed = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); let c = s.hover != peek; s.hover = peek; c };
    if changed { if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "hover"); } }
    if shown && act == island::PointDo::OpenHome { if let Some(app) = APP.get() { open_card(app, "point", false); } return; }
    // Not settled yet (the pointer has only just come or gone): look again when it may have.
    if let (Some(ms), Some(app)) = (wait, APP.get()) {
        let a = app.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(ms + 5)); let _ = a.run_on_main_thread(island_hover_settle); });
    }
}

/// The same for the character's window (peeking: the pointer on its sliver brings it in). Kept for as long as the app runs.
fn add_dock_hover_tracking(mtm: MainThreadMarker, panel: &NSPanel) {
    use objc2::AnyThread;
    use objc2_app_kit::{NSTrackingArea, NSTrackingAreaOptions};
    let Some(view) = panel.contentView() else { return };
    let owner = hover::DockHoverOwner::new(mtm);
    let opts = NSTrackingAreaOptions::MouseEnteredAndExited | NSTrackingAreaOptions::ActiveAlways | NSTrackingAreaOptions::InVisibleRect;
    let any: &objc2::runtime::AnyObject = owner.as_ref();
    let area = unsafe { NSTrackingArea::initWithRect_options_owner_userInfo(NSTrackingArea::alloc(), view.bounds(), opts, Some(any), None) };
    view.addTrackingArea(&area);
    DOCK_HOVER_OWNER.with(|o| *o.borrow_mut() = Some(owner));
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

/// Home's panel (M66): a borderless, non activating panel that may become key, so the person can type in the ask box after
/// clicking into it (never by itself: rule 9), never main, and whose top may sit at the display's very top, under the notch.
mod homepanel {
    use objc2::rc::Retained;
    use objc2::{define_class, msg_send, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSBackingStoreType, NSEvent, NSPanel, NSResponder, NSScreen, NSWindow, NSWindowStyleMask};
    use objc2_foundation::{NSObject, NSRect};

    define_class!(
        // SAFETY: NSPanel may be subclassed. This class has no instance variables and no Drop, and overrides four methods
        // with the signatures AppKit declares (two BOOL getters, sendEvent: and constrainFrameRect:toScreen:).
        #[unsafe(super(NSPanel, NSWindow, NSResponder, NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "SquibbyHomePanel"]
        pub struct HomePanel;

        impl HomePanel {
            #[unsafe(method(canBecomeKeyWindow))]
            fn can_become_key(&self) -> bool { super::home_may_key() }
            #[unsafe(method(sendEvent:))]
            fn send_event(&self, event: &NSEvent) {
                if super::home_press_off_shape(self, event) { return; }
                let _: () = unsafe { msg_send![super(self), sendEvent: event] };
            }
            #[unsafe(method(canBecomeMainWindow))]
            fn can_become_main(&self) -> bool { false }
            #[unsafe(method(constrainFrameRect:toScreen:))]
            fn constrain(&self, frame: NSRect, _screen: Option<&NSScreen>) -> NSRect { frame }
        }
    );

    impl HomePanel {
        pub fn make(mtm: MainThreadMarker, frame: NSRect, style: NSWindowStyleMask) -> Retained<NSPanel> {
            let this = Self::alloc(mtm).set_ivars(());
            let p: Retained<Self> = unsafe { msg_send![super(this), initWithContentRect: frame, styleMask: style, backing: NSBackingStoreType::Buffered, defer: false] };
            Retained::into_super(p)
        }
    }
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

    define_class!(
        // SAFETY: as above: NSObject has no rules for subclasses, and this class has no Drop and no instance variables.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "CompanionDockHover"]
        pub struct DockHoverOwner;

        impl DockHoverOwner {
            #[unsafe(method(mouseEntered:))]
            fn mouse_entered(&self, _event: &NSEvent) { super::dock_hover_changed(true); }
            #[unsafe(method(mouseExited:))]
            fn mouse_exited(&self, _event: &NSEvent) { super::dock_hover_changed(false); }
        }
    );

    impl DockHoverOwner {
        pub fn new(mtm: MainThreadMarker) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(());
            unsafe { msg_send![super(this), init] }
        }
    }
}

/// While Home is shown, twenty times a second: where the pointer is and whether the button is down, never keys, never
/// anything on the screen. Three things come of it (M66). The window lets the pointer through wherever it is off the shape
/// (island.rs inside_shape), so the menu bar and the apps beside Home take their clicks first try. A press that starts
/// outside every Companion window and off Home's shape is a click elsewhere, and Home is told: it closes unless something on
/// it is waiting for the person (home.ts); not with Close when I click elsewhere off (home.closeOnClickAway). And a Home that
/// pointing opened folds back once the pointer has been off it for a moment, unless the person pressed in it (island.rs Leave).
fn watch_home(app: &AppHandle) {
    let gen = HOME_GEN.load(Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        let down = || NSEvent::pressedMouseButtons() & 1 == 1;
        let mut w = island::ClickAway::new(down());
        let mut was_down = down();
        // Companion's own windows, read at the moment of a press: the character, the island, and Home's shape (never its
        // whole window, which is mostly clear).
        let a2 = app.clone();
        let ours = move || -> Option<Vec<Rect>> {
            let (tx, rx) = std::sync::mpsc::channel::<Vec<Rect>>();
            let _ = a2.run_on_main_thread(move || {
                let mtm = MainThreadMarker::new().unwrap();
                let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
                let mut v: Vec<Rect> = with_panels(|d, _| [d].iter().filter(|p| p.isVisible()).map(|p| from_appkit(p.frame(), ph)).collect()).unwrap_or_default();
                v.extend(HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()).iter().copied());
                if let Some(r) = island_rect(ph) { v.push(r); }
                let _ = tx.send(v);
            });
            rx.recv_timeout(Duration::from_millis(500)).ok()
        };
        while HOME_OPEN.load(Ordering::SeqCst) && HOME_GEN.load(Ordering::SeqCst) == gen {
            std::thread::sleep(Duration::from_millis(island::CLICK_POLL_MS));
            let p = macos_see::pointer();
            let is_down = down();
            // Folding back: the pointer already passes through; nothing more to decide.
            if HOME_FOLDING.load(Ordering::SeqCst) != 0 { was_down = is_down; continue; }
            let on = island::inside_shape(&HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()), (p.x, p.y), 0.0);
            // Compared with what the window really does now (HOME_PASS), never with a value kept here: an open, a close or a
            // reopen during a fold may have changed it meanwhile (M66 step 5).
            if HOME_PASS.load(Ordering::SeqCst) == on { let _ = app.run_on_main_thread(move || if HOME_SHOWN.load(Ordering::SeqCst) && HOME_FOLDING.load(Ordering::SeqCst) == 0 { home_pass(on) }); }
            // A press on the shape makes a Home that pointing opened the person's: it stays when the pointer leaves.
            if on && is_down && !was_down { HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).pressed_inside(); }
            was_down = is_down;
            let near = island::inside_shape(&HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()), (p.x, p.y), 6.0) || ISLAND_AT.lock().unwrap_or_else(|e| e.into_inner()).is_some_and(|r| island::contains(r, (p.x, p.y)));
            // The person's settings (M66 step 6): leaving folds Home only with Close Home when I click another app on, and
            // after the close delay (island.closeDelay), as the status waits.
            let hs = home_set();
            if hs.click_away && HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).sample(near, now() as u64, hs.hover.out_ms) {
                // M66 step 5: the page decides, as for a click elsewhere: it folds Home only when nothing on it waits for
                // the person (home.ts closesOnClickAway). Asked once: if the page keeps Home open, it is the person's now.
                log("home_pointer_left", json!({}));
                *HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()) = island::Leave::new(false);
                let _ = app.emit_to("card", "home-pointer-left", ());
                continue;
            }
            // Turned off in Settings (home.closeOnClickAway): no click away; the rest goes on.
            if !hs.click_away { w = island::ClickAway::new(is_down); continue; }
            // A click in one of our own dialogs (another process) is not a click elsewhere, nor is the press that ends it.
            if NATIVE_DIALOGS.load(Ordering::SeqCst) > 0 { w = island::ClickAway::new(true); continue; }
            // If our windows cannot be read in time, the press counts as ours: Home never closes on a guess.
            if w.sample(is_down, (p.x, p.y), || ours().unwrap_or_else(|| vec![[p.x - 1.0, p.y - 1.0, 2.0, 2.0]])) {
                log("home_click_away", json!({}));
                let _ = app.emit_to("card", "home-click-away", ());
            }
        }
    });
}
include!("shell_roam.rs");
include!("shell_settings.rs");
// ---- Prompt help (M5b): the hotkey is the only way anything is read ----

// Every job's keys come from the key map (keymap.rs, the Keys section below); only the bare Esc that dismisses a result is
// fixed, and it is on no list.
fn sc_esc() -> Shortcut { Shortcut::new(None, Code::Escape) }
static ARMED: AtomicU64 = AtomicU64::new(0);
/// Why Esc is borrowed from the person's apps now (esc.rs).
static ESC: Mutex<esc::Holds> = Mutex::new(esc::Holds::new());
static ESC_SCREEN_GEN: AtomicU64 = AtomicU64::new(0);
/// Takes or gives back Esc for one reason. Main thread, with the keys lock held by the caller (as every change of keys).
fn esc_apply(app: &AppHandle, why: u8, on: bool) {
    let change = ESC.lock().unwrap_or_else(|e| e.into_inner()).set(why, on);
    let gs = app.global_shortcut();
    match change { esc::Change::Take => { let _ = gs.register(sc_esc()); } esc::Change::GiveBack => { let _ = gs.unregister(sc_esc()); } esc::Change::Keep => {} }
}
/// Squibby started or stopped drawing on the screen (M26): Esc clears it while it shows, with Esc stops what Squibby shows
/// on (home.escStops). A drawing nothing cleared gives Esc back after esc::SCREEN_MAX_SECS.
fn esc_screen(app: &AppHandle, on: bool) {
    if on && !home_set().esc_stops { return; }
    let gen = ESC_SCREEN_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let a = app.clone();
    let _ = app.run_on_main_thread(move || { let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner()); esc_apply(&a, esc::SCREEN, on); });
    if on {
        let a = app.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(esc::SCREEN_MAX_SECS)); if ESC_SCREEN_GEN.load(Ordering::SeqCst) == gen { esc_screen(&a, false); } });
    }
}
/// Esc while Squibby draws on the screen: the drawing, a Show me walk and anything being said all stop, at once.
fn esc_take_back(app: &AppHandle) {
    log("esc_take_back", json!({}));
    point_cancel(); turn_cancel(); speech_off(app); showme_end_answer(app);
    hide_overlay(app); showme_pending().end(); say_showme(app, "done", "", json!({}));
    let _ = app.emit("hush", ());
}

/// Use a suggestion and Esc exist only while a result is showing, and give themselves up after a minute and a half. Esc
/// is taken from the person's apps only for that long (T11). The work runs on the main thread, like every change of keys
/// (so it never races a change in Settings), and a caller on another thread waits for it, as before.
fn arm_result_keys(app: &AppHandle, on: bool) {
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let a = app.clone();
    if app.run_on_main_thread(move || { arm_now(&a, on); let _ = tx.send(()); }).is_ok() { let _ = rx.recv_timeout(Duration::from_secs(2)); }
}
fn arm_now(app: &AppHandle, on: bool) {
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let gs = app.global_shortcut();
    let accept = keymap::Action::Accept;
    // Prompt help is in Voice: with that group off no result is ever armed (its commands are refused too).
    if on && key_held(accept) { return; }
    if on {
        let gen = ARMED.fetch_add(1, Ordering::SeqCst) + 1;
        // The keys in use, else the picked then the usual ones (keymap::arm), so keys another app held at launch work once
        // it lets go. None when another app holds them all: then only the button and Esc work.
        if !ACCEPT_ARMED.load(Ordering::SeqCst) {
            let was = key_using(accept);
            let got = keymap::arm(accept, was, &keys_picked(), |c| gs.register(keymap::shortcut(c)).is_ok());
            if got != was { set_key_using(accept, got); log("accept_keys", json!({ "id": got.map(keymap::id) })); }
            ACCEPT_ARMED.store(got.is_some(), Ordering::SeqCst);
        }
        esc_apply(app, esc::RESULT, true);
        let a = app.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(90)); if ARMED.load(Ordering::SeqCst) == gen { arm_result_keys(&a, false); } });
    } else {
        ARMED.fetch_add(1, Ordering::SeqCst);
        if ACCEPT_ARMED.swap(false, Ordering::SeqCst) { if let Some(c) = key_using(accept) { let _ = gs.unregister(keymap::shortcut(c)); } }
        esc_apply(app, esc::RESULT, false);
    }
}

#[tauri::command] fn ph_consent(app: AppHandle, choice: String) { phelp::consent_answer(&app, &choice); }
/// Answers which keys use a suggestion has for this result (keymap::arm may take other keys than the page knew, or none
/// when another app holds them all), so the result names them only when they work. A sync command: on the main thread,
/// arming runs before the answer. Only while Home shows: the keys work in every app, so never for a result nobody sees.
/// `req`: the request the result answers; one that is not the request waiting now (cancelled since, or an older box's)
/// is not kept and arms nothing.
#[tauri::command] fn ph_ready(app: AppHandle, text: String, handback: String, req: String) -> Option<String> {
    if !card_visible() || !phelp::ready(text, handback == "copy", &req) { return None; }
    arm_result_keys(&app, true); key_registered(keymap::Action::Accept).map(keymap::id)
}
/// The result stopped showing (another tab was picked, or Home closed): the keys go back; ph_ready takes them again when it
/// shows again. Nothing else changes, so the result can still be used with its button.
#[tauri::command] fn ph_disarm(app: AppHandle) { arm_result_keys(&app, false); }
#[tauri::command] fn ph_accept(app: AppHandle) { arm_result_keys(&app, false); phelp::put_back(&app, false); }
#[tauri::command] fn ph_restore(app: AppHandle) { arm_result_keys(&app, false); phelp::put_back(&app, true); }
#[tauri::command] fn ph_dismiss(app: AppHandle) { arm_result_keys(&app, false); phelp::dismiss(&app); }
#[tauri::command] fn ph_answer(app: AppHandle, answer: String) { arm_result_keys(&app, false); phelp::answer(&app, answer); }
// The error explainer's card: the answer about reading in this app (shared with Prompt help), and Close.
#[tauri::command] fn eh_consent(app: AppHandle, choice: String) { errhelp::consent_answer(&app, &choice); }
#[tauri::command] fn eh_dismiss(app: AppHandle) { errhelp::dismiss(&app); }
/// A page's press failed inside Squibby's own machinery: the person read one plain sentence (app/src/failwords.ts), and the
/// raw words are kept here for a report, the home folder written as ~, short. Nothing else is done with them.
#[tauri::command] fn note_failure(kind: String, detail: String) {
    let kind: String = kind.chars().filter(|c| c.is_ascii_alphanumeric()).take(20).collect();
    log("failure_detail", runner::detail_line("page", Some(&kind), &detail));
}
/// The Explain chip with words in Home's ask box (errhelp.rs `typed`). Only Home may ask.
#[tauri::command] fn eh_typed(app: AppHandle, window: tauri::WebviewWindow, text: String) -> Result<(), String> {
    if window.label() != "card" { return Err("notOffered".into()); }
    errhelp::typed(&app, &text).map_err(String::from)
}
// Second Look's card: the same answer about reading in this app (shared with Prompt help and the error explainer), and Close.
#[tauri::command] fn sl_consent(app: AppHandle, choice: String) { seclook::consent_answer(&app, &choice); }
#[tauri::command] fn sl_dismiss(app: AppHandle) { seclook::dismiss(&app); }

#[tauri::command]
fn permissions_status() -> permissions::Permissions { permissions::current() }

/// Show the card. `keyboard` is true only when the user asked to type (hotkey or Type button);
/// clicking the character shows the card without taking the keyboard.
fn open_card(app: &AppHandle, source: &str, keyboard: bool) { open_card_then(app, source, keyboard, None); }

/// Show the card, and tell Home what to do once it is open (`then`, arrival::arrival): start a lesson, show Learn or Settings.
fn open_card_then(app: &AppHandle, source: &str, keyboard: bool, then: Option<serde_json::Value>) {
    log("card_open", json!({ "source": source, "keyboard": keyboard }));
    let a = app.clone();
    let src = source.to_string();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        HOME_CLOSE_GEN.fetch_add(1, Ordering::SeqCst);   // a close still rolling up is called off
        HOME_FOLDING.store(0, Ordering::SeqCst);         // and with it the fold (M66 step 5: else the watch stood still)
        let was_open = HOME_OPEN.load(Ordering::SeqCst) && card_visible();
        // M70: the small panel the island shows now, read before the hover is forgotten, so Home grows on from it.
        let from = if was_open { None } else {
            let st = *ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner());
            ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|d| island::panel_rect(d, st))
        };
        if !was_open {
            // M70 step 5: grown from the panel, Home's band is drawn the panel's width while it opens: so is its hit test,
            // until the band has eased back (island.rs FROM_BAND_MS), then the rects are asked again.
            let kept = from.filter(|_| island::animates_open(&src)).map(|(w, _)| (w, now() as u64 + island::FROM_BAND_MS));
            *HOME_FROM.lock().unwrap_or_else(|e| e.into_inner()) = kept;
            if kept.is_some() {
                let a2 = a.clone();
                std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(island::FROM_BAND_MS + 5)); let _ = a2.run_on_main_thread(|| { home_rects_now(); home_pointer_moved(); }); });
            }
            HOME_OPEN.store(true, Ordering::SeqCst); HOME_GEN.fetch_add(1, Ordering::SeqCst); reset_hover();
        }
        // M66: a light tap on the trackpad as the notch opens under the person's own pointer, only when turned on (haptic.rs).
        if haptic::ticks(&setting_now(haptic::KEY), &src, was_open) { haptic::tick(); }
        // Home opens on the display the person is using (the one with the pointer): the island goes there first.
        place_island(mtm, true, "home_opened");
        with_panels(|d, c| {
            // M66: Home's window is already there (ordered in, its shape collapsed under the notch, the pointer passing
            // through): opening is the page's own motion, one clock, no drop, no fade of the window and no stale first frame.
            // Ordered in here only if something hid it (Hide, a full screen app), never shown with focus.
            place_card(d, c);
            if !c.isVisible() { c.orderFrontRegardless(); }
            HOME_SHOWN.store(true, Ordering::SeqCst);
            home_rects_now();
            // M70: a Home opened from the notch's small panel folds when the pointer leaves it, as one opened by pointing.
            if !was_open { *HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()) = island::Leave::new(src == "point" || src == "notch_panel"); }
            // A Home that pointing opened, taken over by a click on the notch or a key, is the person's: it stays when the
            // pointer leaves (M66 step 5).
            if was_open && (src != "point" || keyboard) { HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).pressed_inside(); }
            // The pointer may already be on the shape (a click on the notch): it takes that click at once.
            let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
            let m = NSEvent::mouseLocation();
            home_pass(island::inside_shape(&HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()), (m.x, ph - m.y), 0.0));
            // Key only: taking the keyboard needs no mouse events, and the click through keeps following the pointer.
            if keyboard { HOME_KEY_BY_KEY.store(true, Ordering::SeqCst); c.makeKeyWindow(); }
            log("card_shown", json!({ "card_key": c.isKeyWindow(), "app_active": active(mtm) }));
        });
        // The island stops drawing once Home's shape has grown over it (island.tsx, a short delay there), so the two never
        // show a gap; it draws again when Home has folded back (home_fold).
        let _ = a.emit_to("island", "home-state", json!({ "shown": true }));
        if !was_open { watch_home(&a); }
        let instant = !island::animates_open(&src);
        if UNSEEN.swap(0, Ordering::SeqCst) > 0 { let _ = a.emit_to("island", "unseen", json!({ "n": 0 })); }
        // M52: the review card is in Home, so changes ready to review are seen now.
        let cleared = review_ready().clear();
        review_dot_told(&a, cleared);
        let mut opened = match then { Some(t) => json!({ "keyboard": keyboard, "instant": instant, "then": t }), None => json!({ "keyboard": keyboard, "instant": instant }) };
        if let (Some((w, h)), false) = (from, instant) { opened["from"] = json!({ "w": w, "h": h }); }
        // M55, adapts to you: the kind of app in front as Home opens (Home is a panel, so it is the app the person was using).
        if let Some(k) = everyday::home_front(&setting_now("home.followFrontApp"), front_id).and_then(|v| v.get("kind").cloned()) { opened["front"] = k; }
        let _ = a.emit_to("card", "opened", opened);
    });
}

/// Home is up: shown (M66, HOME_SHOWN: from its opening until its fold back ends) and its window on screen.
fn card_visible() -> bool { HOME_SHOWN.load(Ordering::SeqCst) && with_panels(|_, c| c.isVisible()).unwrap_or(false) }

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
    // M58 (feature 9): the key practice's pretend AI and its fixed fix run only in that practice's own recorded copy.
    if cmd.get("type").and_then(serde_json::Value::as_str) == Some("practice.key") && !practice_record().0.is_copy_of("key", std::path::Path::new(&current_project())) {
        return Err("This only works in the key practice's own copy. Start the practice on Learn.".into());
    }
    // A tool whose group is switched off does nothing (groups.rs): one plain line, and the engine is not even asked.
    if let Some(line) = groups::refuse_runner(&group_off, &cmd) { return Err(line.into()); }
    app.state::<runner::Runner>().send(&cmd)?;
    // M52: Review now, Looks fine or Fix it: the person has the review in front of them, so the dot goes out.
    let changed = review_ready().asked(&cmd);
    review_dot_told(&app, changed);
    Ok(())
}

/// M33: a short line beside the pointer (a fix just proven), said by the drop that follows it, for follow::SAY_MS. Never
/// during a call or screen sharing (quiet), and only while the drop is shown.
static FOLLOW_SAY: Mutex<Option<(String, std::time::Instant)>> = Mutex::new(None);
/// M37: a move of the water ring is waiting on the main thread (never more than one at a time).
static FOLLOW_QUEUED: AtomicBool = AtomicBool::new(false);
/// M41: the ring is on screen now (follow_loop shows and hides it); the mouse watch moves it only then.
static FOLLOW_LIVE: AtomicBool = AtomicBool::new(false);
/// M66: the ring's lead (follow::Lead): the last place and time of the pointer, so each move can go a touch ahead of it.
static FOLLOW_LEAD: Mutex<follow::Lead> = Mutex::new(follow::LEAD_NONE);
fn follow_lead() -> std::sync::MutexGuard<'static, follow::Lead> { FOLLOW_LEAD.lock().unwrap_or_else(|e| e.into_inner()) }
/// M41: put the ring's middle on the pointer now. Main thread, from the mouse watch: the freshest place there is. M66: a
/// touch ahead of a moving pointer (follow::Lead), so it lands on the cursor when the screen shows it, even on a fast sweep.
fn follow_to_pointer() {
    if !FOLLOW_LIVE.load(Ordering::SeqCst) { return; }
    let m = NSEvent::mouseLocation();   // bottom left points, the same as a window's origin
    let (x, y) = follow_lead().place((m.x, m.y), follow::clock_s());
    FOLLOW.with(|f| { if let Some(pn) = f.borrow().as_ref() { pn.setFrameOrigin(NSPoint::new(x + follow::OFFSET.0 - follow::SIZE / 2.0, y - follow::OFFSET.1 - follow::SIZE / 2.0)); } });
}
/// M66: the pointer stopped while the ring was ahead of it: exactly on it again. Main thread.
fn follow_settle() {
    if !FOLLOW_LIVE.load(Ordering::SeqCst) { return; }
    let m = NSEvent::mouseLocation();
    FOLLOW.with(|f| { if let Some(pn) = f.borrow().as_ref() { pn.setFrameOrigin(NSPoint::new(m.x + follow::OFFSET.0 - follow::SIZE / 2.0, m.y - follow::OFFSET.1 - follow::SIZE / 2.0)); } });
}
#[tauri::command]
fn follow_say(app: AppHandle, text: String) {
    let Some(line) = follow::say_line(&text) else { return };
    if quiet() || companion_hidden() { return; }
    *FOLLOW_SAY.lock().unwrap_or_else(|e| e.into_inner()) = Some((line.clone(), std::time::Instant::now()));
    let _ = app.emit_to("follow", "follow-say", json!({ "text": line }));
}

/// M28: Home's Restart, beside "Squibby keeps stopping": the engine starts again now (runner.rs Runner::retry).
#[tauri::command]
fn restart_engine(app: AppHandle) { log("engine_restart_pressed", json!({})); app.state::<runner::Runner>().retry(); }

#[tauri::command]
fn open_card_cmd(app: AppHandle, then: Option<serde_json::Value>) {
    // Only the two known shapes pass (a lesson to start, or Learn to show); anything else just opens Home.
    open_card_then(&app, "button", true, then.as_ref().and_then(arrival::arrival));
}

/// Home's own page asks for this when it loads and the first run has not been finished on this Mac (M15 wave 1: "nothing
/// opens at launch, people do not know to click the notch"). Once per launch, only from Home's own page, and without the
/// keyboard (rule 9): the person just opened the app, and Home is what they see first.
static FIRST_RUN_OPENED: AtomicBool = AtomicBool::new(false);
#[tauri::command]
fn first_run_open(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "card" { return Err("only Home opens itself".into()); }
    if FIRST_RUN_OPENED.swap(true, Ordering::SeqCst) { return Ok(()); }
    open_card(&app, "first_run", false);
    Ok(())
}

/// Clicking the character shows or hides Home, and never takes the keyboard.
#[tauri::command]
fn toggle_card(app: AppHandle) { toggle_home(app, "character"); }

/// Clicking the island in the notch opens Home at once (F18), and never closes it (2 Nov 2026: pointing may have opened it
/// a moment before, and the click that meant to open it must not close it). Home closes by Esc, Close or a click elsewhere.
/// Never with the keyboard (rule 9): Home takes it only when the person clicks into it.
#[tauri::command]
fn island_click(app: AppHandle) { open_card(&app, "island", false); }

/// M70: a press in the notch's small panel (Ask, Review changes, Check my project, Check before going live, Undo last change,
/// the gear, Open). Home opens at that place, never with the keyboard (rule 9: the keys move only when the person clicks into
/// Home), and grows on from the panel (open_card_then). Only the arrivals arrival.rs knows pass; anything else just opens Home.
/// Nothing runs from here: what each one starts asks, snapshots and keeps a receipt in Home as it always does.
#[tauri::command]
fn island_go(app: AppHandle, then: Option<serde_json::Value>) {
    open_card_then(&app, "notch_panel", false, then.as_ref().and_then(arrival::arrival));
}

/// Home folds back into the notch as it closes (homeShape.css, on the CLOSE spring), and its page says when the fold has
/// ended (`home_folded`, from its own transitionend): one clock, the page's. The window stays ordered in, its shape collapsed
/// under the notch, the pointer passing through. This is only a backstop for a page that never says so (a hung or hidden
/// page): longer than the fold (homeShape.ts foldMs, about 840 ms: the content leaving, then CLOSE), so it never cuts a fold
/// short.
const HOME_FOLD_BACKSTOP_MS: u64 = 1200;
/// Bumped by every opening and every close asked, so a close that waits never hides a Home opened again meanwhile.
static HOME_CLOSE_GEN: AtomicU64 = AtomicU64::new(0);
/// The close the page is folding now (its HOME_CLOSE_GEN), 0 when none.
static HOME_FOLDING: AtomicU64 = AtomicU64::new(0);
/// Closes Home: its page folds it back into the notch, then says so (Close, Esc, the island or the character clicked again,
/// a click elsewhere, the pointer leaving a Home pointing opened). At once with Reduce motion or Less motion. Main thread.
fn close_home_rolled(a: &AppHandle, extra: Value) {
    let gen = HOME_CLOSE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    if !card_visible() { home_fold(extra); return; }
    // The pointer passes through at once, so a click right after lands in the app behind.
    home_pass(false);
    HOME_FOLDING.store(gen, Ordering::SeqCst);
    let _ = a.emit_to("card", "closing", json!({ "reduced": reduce_motion() }));
    let a2 = a.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(HOME_FOLD_BACKSTOP_MS));
        let _ = a2.run_on_main_thread(move || if HOME_CLOSE_GEN.load(Ordering::SeqCst) == gen && HOME_FOLDING.load(Ordering::SeqCst) == gen { log("home_fold_backstop", json!({})); home_fold(extra) });
    });
}
/// The page's fold back ended (its transitionend, homeShape.ts). Only the close it was folding: a Home opened again
/// meanwhile is left alone.
#[tauri::command]
fn home_folded(app: AppHandle) {
    let _ = app.run_on_main_thread(move || {
        let gen = HOME_FOLDING.load(Ordering::SeqCst);
        if gen != 0 && HOME_CLOSE_GEN.load(Ordering::SeqCst) == gen { home_fold(json!({ "by": "page" })); }
    });
}
/// Home has gone: the shape is the notch again. The window stays ordered in and lets the pointer through; if it held the
/// keyboard, it gives it back now (ordered out and in again, invisibly, so macOS returns the keys to the app in front);
/// the island draws again. Main thread.
fn home_fold(extra: Value) {
    HOME_FOLDING.store(0, Ordering::SeqCst);
    let was = HOME_SHOWN.swap(false, Ordering::SeqCst);
    HOME_KEY_BY_KEY.store(false, Ordering::SeqCst);
    home_rects_now();
    home_pass(false);
    with_panels(|_, c| if c.isKeyWindow() { c.orderOut(None); if !USER_HID.load(Ordering::SeqCst) && !HIDDEN_BY_US.load(Ordering::SeqCst) { c.orderFrontRegardless(); } });
    if let Some(a) = APP.get() { let _ = a.emit_to("island", "home-state", json!({ "shown": false })); }
    home_closed();
    if was { log("card_closed", extra); }
}
/// Closes Home at once, with no motion: Stop everything, a display change, Hide, a full screen app. The page is told to drop
/// to closed (`closed`, from home_closed).
fn home_stop_now(why: &str) {
    HOME_CLOSE_GEN.fetch_add(1, Ordering::SeqCst);
    home_fold(json!({ "source": why }));
}

fn toggle_home(app: AppHandle, source: &'static str) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        if card_visible() {
            close_home_rolled(&a, json!({ "source": source }));
            card_closed_hush(&a);
        } else {
            open_card(&a, source, false);
        }
    });
}

/// The card page tells us how tall its content is; we resize the panel to fit. `settings`: Settings is open in Home, which
/// then uses the Large width and a fixed height (island.rs `with_settings`).
#[tauri::command]
fn resize_card(app: AppHandle, height: f64, settings: Option<bool>) {
    let open = settings.unwrap_or(false);
    let was = SETTINGS_OPEN.swap(open, Ordering::SeqCst);
    let hs = home_size();
    let h = height.clamp(hs.min_h, hs.max_h);
    // M66 fix 14: Settings shown or left, with the height asked and held, so a report says whether it got its room.
    if was != open { log("settings_shown", json!({ "open": open, "asked": height, "held": h, "min": hs.min_h, "max": hs.max_h })); }
    CARD_H.store(h as u64, Ordering::SeqCst);
    // M66: the window never resizes with the content; the page sizes the shape itself. The rects for the hit test and the
    // character's room follow the new height.
    let _ = app.run_on_main_thread(move || {
        // M66 step 6: Settings opened or closed: placed again for the body's width in force (the window keeps its frame).
        if was != open { with_panels(place_card); }
        home_rects_now();
        if card_visible() { if let Some(mtm) = MainThreadMarker::new() { if let Some((room, _)) = with_panels(|d, _| card_spot(mtm, d, home_size().max_h)).flatten() { roam_card_moved(mtm, room); } } }
    });
}

/// The folder tasks run in. For now it comes from the dev settings file or a safe playground folder.
#[tauri::command]
fn get_project() -> String { current_project() }

fn projects_path() -> PathBuf { data_dir().join("projects.json") }
fn current_project() -> String { PROJECT.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or_default() }
fn home_dir() -> String { std::env::var("HOME").unwrap_or_default() }

/// The folders the person chose before (still on disk), newest first.
#[tauri::command]
fn list_projects() -> Vec<String> { projects::load(&projects_path()).checked(&home_dir(), &data_dir()).still_there() }

/// Switch to a folder from the list, or one just picked. Only folders that pass the checks are ever used.
#[tauri::command]
fn use_project(app: AppHandle, path: String) -> Result<String, String> {
    // From a web page, only a folder that is already on the person's list of projects (new ones come from the folder chooser or a link).
    if !projects::load(&projects_path()).recent.contains(&path) { return Err("Pick a folder from your list, or choose a new one with the folder button.".into()); }
    use_project_inner(app, path)
}
fn use_project_inner(app: AppHandle, path: String) -> Result<String, String> {
    let ok = projects::validate(&path, &home_dir(), &data_dir())?;
    let folder = ok.to_string_lossy().to_string();
    let mut p = projects::load(&projects_path());
    p.use_folder(&folder);
    let _ = logfile::write_atomic(&projects_path(), serde_json::to_string(&p).unwrap_or_default().as_bytes());
    *PROJECT.lock().unwrap_or_else(|e| e.into_inner()) = Some(folder.clone());
    project_now(&app, &folder);
    Ok(folder)
}
/// The project folder changed (`folder`, or "" for none): every page is told, and this project's own settings go to the
/// engine (the line names the folder) and to the pages (T16). The one place that says so.
fn project_now(app: &AppHandle, folder: &str) {
    log("project_changed", json!({ "none": folder.is_empty() }));
    let _ = app.emit("project-changed", folder);
    // M52: the engine watches the new folder from a fresh starting point, so no batch of the old one is waiting.
    let cleared = review_ready().clear();
    review_dot_told(app, cleared);
    send_settings(app);
    settings_told(app, &[]);
}

include!("shell_setup.rs");
include!("shell_showme.rs");
include!("shell_updates.rs");
include!("shell_speech.rs");
include!("shell_data.rs");
include!("shell_plan.rs");
include!("shell_tools.rs");
include!("shell_keys.rs");
include!("shell_voice.rs");
include!("shell_tick.rs");
include!("shell_drop.rs");
include!("shell_peekout.rs");

fn main() {
    // The helper of "delete everything" runs before anything of the app starts.
    if wipe_helper_mode() { return; }
    let _ = T0.set(now());
    let _ = RUN.set(format!("{}-{}", now(), std::process::id()));
    // One copy at a time: a second copy would own the same hotkeys and start a second engine. It leaves quietly before it
    // shows anything. It waits a few seconds first, because an update starts the new copy just before the old one ends.
    // 5 Nov 2026: a problem or a signal that ends the app leaves a line in the exits log too (exitlog.rs).
    install_panic_note();
    watch_signals();
    let instance = instance::take_waiting(&data_dir().join("instance.lock"), instance::START_WAIT, Duration::from_millis(100));
    if instance::should_leave(&instance) { log("second_copy_left", json!({})); return; }
    if let instance::Taken::CouldNotCheck(why) = &instance { log("instance_not_checked", json!({ "why": why })); }
    // F19: work folders a Companion ended mid job left behind. Only when this copy surely is the one that runs, so no other
    // copy's job is using them.
    if matches!(instance, instance::Taken::Ours(_)) && convert::sweep(&convert::work_root()) { log("drop_work_swept", json!({})); }
    // Files into the ask box: a document read a Companion ended mid read left behind (its private folder, docread.rs).
    if matches!(instance, instance::Taken::Ours(_)) { docread::sweep(&docread::read_root()); }
    let _instance = instance;   // held until Companion quits; macOS lets the lock go when the program ends
    let app = tauri::Builder::default()
        .activate_ignoring_other_apps(false)
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, s, e| {
                    // Esc dismisses a Prompt help result while one shows (it is registered only then, and is on no list).
                    // M26: and it takes back control while Squibby draws on the screen (registered only then too, esc.rs).
                    if s == &sc_esc() {
                        if e.state == ShortcutState::Pressed {
                            let (result, screen) = { let h = ESC.lock().unwrap_or_else(|e| e.into_inner()); (h.has(esc::RESULT), h.has(esc::SCREEN)) };
                            let a = app.clone();
                            std::thread::spawn(move || {
                                if result { arm_result_keys(&a, false); phelp::dismiss(&a); }
                                if screen { esc_take_back(&a); }
                            });
                        }
                        return;
                    }
                    // Hold to talk and the Type key (M36) need to know when the keys come up as well as down.
                    if let Some(mode) = hold_mode(s) {
                        let down = e.state == ShortcutState::Pressed;
                        // A key repeat while held, a let go that ends no press, or the other hold key while one is held,
                        // restarts nothing and is not logged (one microphone, talkkeys::Holding).
                        let counts = { let mut h = TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()); if down { h.press(mode, now() as u64) } else { h.release(mode) } };
                        if !counts { return; }
                        log("hotkey", json!({ "id": if mode == talkkeys::Mode::Type { "dictate" } else { "talk" }, "down": down }));
                        // Never talk over the person: what is being said stops, a Show me answer still playing ends (no
                        // later step is drawn or said), and the page drops any line still waiting to be said.
                        if down { SHOWME_LISTENING.store(false, Ordering::SeqCst); speech_off(app); showme_end_answer(app); let _ = app.emit("hush", ()); }
                        voice_send(app, if down { VoiceMsg::Down(now() as u64, mode) } else { VoiceMsg::Up(now() as u64) });
                        return;
                    }
                    if e.state != ShortcutState::Pressed { return; }
                    // Every other job: whichever keys it uses now (keymap.rs), never fixed ones.
                    let Some(job) = key_action(s) else { return };
                    if job != keymap::Action::Stop { log("hotkey", json!({ "id": job.id() })); }
                    match job {
                        keymap::Action::ShowMe => show_me_key(app),
                        keymap::Action::Problem => {
                            // Stuck? Check the project as it is, then point at where it fails; with no project, or another
                            // kind of app in front, the page looks at the screen instead (everyday.rs). Only the kind of app
                            // in front is told, never its id. Nothing is captured until the page asks, under the light.
                            open_card(app, "hotkey", false);
                            let _ = app.emit("find-problem", json!({ "front": everyday::front_kind(&front_id()) }));
                        }
                        keymap::Action::Card => open_card(app, "hotkey", true),
                        keymap::Action::Read => {
                            // Changing hotkeys from inside a hotkey handler can deadlock the shortcut plugin, so hand the work to another thread.
                            let a = app.clone();
                            std::thread::spawn(move || { arm_result_keys(&a, false); phelp::on_hotkey(&a, open_card); });
                        }
                        // Explain the error the person selected in another app. The light comes on before anything is read.
                        keymap::Action::Explain => errhelp::on_hotkey(app, open_card),
                        // Second Look: check the AI answer the person selected in another app. The light comes on before anything is read.
                        keymap::Action::SecondLook => seclook::on_hotkey(app, open_card),
                        keymap::Action::Accept => {
                            let a = app.clone();
                            std::thread::spawn(move || { arm_result_keys(&a, false); phelp::put_back(&a, false); });
                        }
                        keymap::Action::Stop => {
                            let r = app.state::<runner::Runner>().stop_everything("kill switch");
                            log("hotkey", json!({ "id": "stop", "stop_everything": true, "sent": r.is_ok() }));
                            let stop = json!({ "v": 1, "id": "app-kill", "type": "app.stop_everything" });
                            peek_heard(app, &stop);
                            let _ = app.emit("runner-event", stop);
                            showme_stop(app);
                            // M66 (rule 11): Home closes at once too, no fold.
                            let _ = app.run_on_main_thread(|| home_stop_now("stop_everything"));
                        }
                        keymap::Action::Talk | keymap::Action::Dictate => {}
                    }
                })
                .build(),
        )
        .manage(runner::Runner::new())
        .invoke_handler({
            let handler: Box<dyn Fn(tauri::ipc::Invoke) -> bool + Send + Sync> = Box::new(tauri::generate_handler![char_click, island_go, ui_click, restart_engine, follow_say, flowflow_rest, open_card_cmd, first_run_open, toggle_card, island_click, island_alert, island_state, resize_card, home_geom, home_folded, get_project, list_projects, use_project, pick_project, clone_project, start_in_new_folder, list_made, open_made, reveal_made, trash_made, shared_files_state, save_api_key, remove_api_key, data_inventory, permission_overview, open_permission_page, delete_everything, export_logs, report_problem, create_practice, practice_list, practice_mark, open_practice, restart_practice, remove_practice, remove_all_practices, showme_start, showme_aim, showme_labels, showme_clear, showme_hide, quiet_now, point_problem, do_it_for_me, show_diagram, open_acknowledgements, speak, speak_stop, voice_settings, voice_speed, set_voice_settings, update_status, check_update, install_update, update_note_take, celebrate, save_share_card, copy_link, copy_text, open_link, voice_download, key_map, key_choices, set_key, reset_keys, keys_notice_seen, close_card, send_command, drag_dock, drop_dock, settings_get, settings_set, settings_reset, settings_migrate, front_app, app_names, permissions_status, replay_events, ph_consent, ph_ready, ph_disarm, ph_accept, ph_restore, ph_dismiss, ph_answer, eh_consent, eh_dismiss, eh_typed, note_failure, sl_consent, sl_dismiss, drop_now, drop_pick, drop_stop, drop_close, drop_reveal, drop_trim, tried_mark, read_document, google_accounts, google_start, google_disconnect, claude_status, claude_install_now, license_status, license_activate, license_check_now, license_deactivate, plan_open_checkout, plan_open_portal, trial_start, save_report, report_status, report_activate, point_paste, open_in_editor, save_notes, save_receipt, numbers_mail, open_notes_file, ai_tools_find, handoff_prompt, handoff_put_in, peekout_want, peekout_state]);
            move |invoke: tauri::ipc::Invoke| {
                // F20: a command of a tool whose group is switched off answers with one plain line and does nothing.
                if let Some(line) = group_refusal(invoke.message.command()) { invoke.resolver.reject(line); return true; }
                handler(invoke)
            }
        })
        .setup(move |app| {
            log("launch", json!({ "commit": logexport::BUILD_COMMIT }));   // must fix 6: which build this is
            // 5 Nov 2026: Squibby has no ordinary window, so macOS counted it as an app it may quit by itself to free memory
            // ("automatic termination", seen in the system log as _kLSApplicationWouldBeTerminatedByTALKey=1). It stays on
            // until the person quits it.
            keep_running_until_quit();
            let _ = speak::WORD_HOOK.set(speech_word);   // M38: drawing keeps pace with the voice
            let mtm = MainThreadMarker::new().unwrap();
            let dock_frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(DOCK.0, DOCK.1));
            let mk = |label: &str, page: &str, size: (f64, f64)| {
                let b = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
                    .visible(false)
                    .focused(false)
                    .decorations(false)
                    .accept_first_mouse(true)
                    .inner_size(size.0, size.1);
                // Files into the ask box: Home's page reads a file the person drops on it (attachfiles.ts), so Tauri's own
                // drop handler, which would keep the file from the page, is off for Home only. The page stops a drop from
                // ever opening the file in its place. Nothing is read here and no path reaches the shell.
                let b = if label == "card" { b.disable_drag_drop_handler() } else { b };
                // The character floats on the desktop with nothing behind it (the dock page paints no background either,
                // style.css `.dock-page`). Home is see through too: its page paints one black shape that hangs from the
                // notch, square at the top and round at the bottom (style.css `.home-page`), and nothing around it.
                let b = if label == "dock" || label == "card" { b.transparent(true) } else { b };
                b.build()
            };
            let dock_w = mk("dock", "dock.html", DOCK)?;
            let card_w = mk("card", "card.html", CARD)?;
            let overlay_w = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into())).visible(false).focused(false).decorations(false).transparent(true).inner_size(100.0, 100.0).build()?;
            // The ring's page may load after the ring first shows (Lively at launch): when it has loaded, the ring's thread
            // tells it again for a moment (follow::reshow), since the first follow-show had nobody listening.
            let follow_w = WebviewWindowBuilder::new(app, "follow", WebviewUrl::App("follow.html".into())).visible(false).focused(false).decorations(false).transparent(true).inner_size(follow::SIZE, follow::SIZE)
                .on_page_load(|_, p| if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) { FOLLOW_PAGE_AT.store(now() as u64, Ordering::SeqCst); follow_wake(); })
                .build()?;
            let island_w = WebviewWindowBuilder::new(app, "island", WebviewUrl::App("island.html".into())).visible(false).focused(false).decorations(false).transparent(true).accept_first_mouse(true).inner_size(185.0, 32.0).build()?;
            // M90 (F32): Flowflow peeking out of the notch, in its own small window beside the island (shell_peekout.rs).
            let peekout_w = WebviewWindowBuilder::new(app, "peekout", WebviewUrl::App("peekout.html".into())).visible(false).focused(false).decorations(false).transparent(true).accept_first_mouse(true).inner_size(peekout::PEEK_W, 32.0).build()?;
            // F19: a file dropped on the character or the island. Tauri's own drop events, on these two windows only.
            for (w, at) in [(&dock_w, "dock"), (&island_w, "island")] {
                let a = app.handle().clone();
                w.on_window_event(move |e| if let tauri::WindowEvent::DragDrop(ev) = e { drop_event(&a, at, ev); });
            }
            let dock_ns: &NSWindow = unsafe { &*(dock_w.ns_window()? as *const NSWindow) };
            let card_ns: &NSWindow = unsafe { &*(card_w.ns_window()? as *const NSWindow) };
            let dock = make_panel(mtm, dock_ns, false, dock_frame);
            // See through, like the island and the pointer's panel: make_panel paints every panel white, which showed as a square.
            dock.setOpaque(false);
            dock.setHasShadow(false);
            dock.setBackgroundColor(Some(&NSColor::clearColor()));
            // Peeking: the pointer on the character, or on the sliver of it past the edge, brings it in.
            add_dock_hover_tracking(mtm, &dock);
            let card = make_panel(mtm, card_ns, true, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(CARD.0, CARD.1)));
            // See through, as the character's is: make_panel paints every panel white, which would show as a white square
            // around Home's rounded black shape. No window shadow either: it would follow the square, not the shape.
            card.setOpaque(false);
            card.setHasShadow(false);
            card.setBackgroundColor(Some(&NSColor::clearColor()));
            // M66: just under the island (island.rs HOME_LEVEL), so its shape can hang from the top edge like the notch; the
            // pointer passes through until Home opens and then everywhere off its shape (watch_home).
            card.setLevel(island::home_level(false));
            card.setIgnoresMouseEvents(true);
            // Native witness: every mouse down macOS delivers to our panels, independent of the page.
            let block = RcBlock::new(|e: NonNull<NSEvent>| -> *mut NSEvent {
                let ev = unsafe { e.as_ref() };
                let mtm = MainThreadMarker::new().unwrap();
                let which = ev.window(mtm).map(|w| {
                    with_panels(|d, c| if std::ptr::eq(&*w, &**c as &NSWindow) { "card" } else if std::ptr::eq(&*w, &**d as &NSWindow) { "dock" } else { "other" }).unwrap_or("other")
                }).unwrap_or("none");
                let ck = with_panels(|_, c| c.isKeyWindow()).unwrap_or(false);
                // M66 step 5: any press macOS gives Home's window makes a Home that pointing opened the person's, even a tap
                // too short for the 50 ms watch to see.
                // Only a press on the shape: one on the clear window is dropped by the panel (home_press_off_shape).
                if which == "card" && home_on_shape_now() { HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).pressed_inside(); }
                log("native_mousedown", json!({ "panel": which, "app_active": active(mtm), "card_key_before": ck }));
                e.as_ptr()
            });
            let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown, &block) };
            std::mem::forget(monitor);
            let overlay_ns: &NSWindow = unsafe { &*(overlay_w.ns_window()? as *const NSWindow) };
            let overlay = make_overlay(mtm, overlay_ns);
            OVERLAY.with(|o| *o.borrow_mut() = Some(overlay));
            let follow_ns: &NSWindow = unsafe { &*(follow_w.ns_window()? as *const NSWindow) };
            let follow_p = make_overlay(mtm, follow_ns);
            follow_p.setFrame_display(NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(follow::SIZE, follow::SIZE)), false);
            FOLLOW.with(|f| *f.borrow_mut() = Some(follow_p));
            // M41 (the founder: "ring is laggy"): the ring moves the moment macOS says the mouse moved, on the main thread,
            // straight to where the pointer is, so it keeps up with the cursor. Only mouse moves and drags are watched (where
            // the pointer is), never keys and never clicks' content; nothing is kept. A global monitor for mouse events needs
            // no permission (only key events would need Accessibility, rule 8). Ours (local) and every other app's (global).
            // M46: they stay installed in every choice; follow_to_pointer's early return while the ring is away (FOLLOW_LIVE
            // false, so always in Still and Gentle at rest) is their whole cost. They read the pointer only, never keys.
            let follow_moves = NSEventMask::MouseMoved | NSEventMask::LeftMouseDragged | NSEventMask::RightMouseDragged | NSEventMask::OtherMouseDragged;
            // M66 step 6: Home's click through follows the same moves at once (home_pointer_moved); M70 step 5: so does the island's (island_pointer_moved).
            let follow_global = RcBlock::new(|_e: NonNull<NSEvent>| { follow_to_pointer(); home_pointer_moved(); island_pointer_moved(); });
            let gm = unsafe { NSEvent::addGlobalMonitorForEventsMatchingMask_handler(follow_moves, &follow_global) };
            std::mem::forget(gm);
            // M47: the same local watch moves the character while the person drags it (drag_follow): our own drags only.
            let follow_local = RcBlock::new(|e: NonNull<NSEvent>| -> *mut NSEvent { follow_to_pointer(); home_pointer_moved(); island_pointer_moved(); drag_follow(unsafe { e.as_ref() }); e.as_ptr() });
            let lm = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(follow_moves, &follow_local) };
            std::mem::forget(lm);
            // The island in the notch (F18): borderless, so it can never become the key window, and above the menu bar.
            let island_ns: &NSWindow = unsafe { &*(island_w.ns_window()? as *const NSWindow) };
            let island = make_panel(mtm, island_ns, false, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(185.0, 32.0)));
            island.setOpaque(false);
            island.setHasShadow(false);
            island.setBackgroundColor(Some(&NSColor::clearColor()));
            island.setLevel(island::LEVEL);
            add_hover_tracking(mtm, &island);
            ISLAND.with(|i| *i.borrow_mut() = Some(island));
            // M90: borderless and non activating like the island (never key), see through, at the island's level, and
            // letting every click through until the pointer is on Flowflow's head (peekout_pointer_moved).
            let peekout_ns: &NSWindow = unsafe { &*(peekout_w.ns_window()? as *const NSWindow) };
            let peekout = make_panel(mtm, peekout_ns, false, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(peekout::PEEK_W, 32.0)));
            peekout.setOpaque(false);
            peekout.setHasShadow(false);
            peekout.setBackgroundColor(Some(&NSColor::clearColor()));
            peekout.setLevel(island::LEVEL);
            peekout.setIgnoresMouseEvents(true);
            PEEKOUT.with(|p| *p.borrow_mut() = Some(peekout));
            PANELS.with(|p| *p.borrow_mut() = Some((dock, card)));
            // Hide from screen sharing (on unless turned off), set before anything is ever drawn.
            apply_sharing(&presentation_now());
            apply_dock(mtm, "launch", false);
            place_island(mtm, false, "launch");
            *SIG.lock().unwrap() = signature(&screens_now(mtm));
            with_panels(|d, c| { d.orderFrontRegardless(); place_card(d, c); c.orderFrontRegardless(); });
            island_show(true);
            log("dock_shown", json!({ "app_active": active(mtm) }));
            let _ = APP.set(app.handle().clone());
            // The place was set above, before the handle was kept: the pages are told it now.
            place_told(app.handle());
            let h = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || tick(&h2));
            });
            // Tucked away past the edge, the character is called in by the pointer at that edge: the pointer's place is
            // read often while it is hidden, and not by this loop otherwise.
            let h = app.handle().clone();
            // Must fix 33: parked (no timer) while it is not tucked away; peek_apply wakes it when it tucks away.
            std::thread::spawn(move || { let _ = EDGE_THREAD.set(std::thread::current()); loop {
                if *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) != peek::Pose::Hidden { std::thread::park(); continue; }
                std::thread::sleep(Duration::from_millis(peek::EDGE_POLL_MS));
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || peek_edge_poll(&h2));
            } });
            // Follow my pointer (gaze.rs): the pointer's place, a few times a second, only while the eyes follow it (Lively)
            // and the character is in view; otherwise the thread sleeps with no timer (M46).
            gaze_recompute();
            let h = app.handle().clone();
            std::thread::spawn(move || gaze_loop(h));
            // Google (google.rs): the engine gets fresh access tokens for the connected accounts soon after launch and
            // again every 45 minutes, before Google's hour runs out. Nothing happens with no account connected.
            let h = app.handle().clone();
            std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(5)); loop { google_push(&h); std::thread::sleep(Duration::from_secs(45 * 60)); } });
            // A drop that follows the pointer (follow.rs), only with A drop of water chosen.
            let h = app.handle().clone();
            std::thread::spawn(move || follow_loop(h));
            // Every job's keys: the saved ones, else the usual ones (keymap.rs; hold to talk is two keys, F18.3). Another app
            // may already own some of them. That must never stop Companion from opening; the one notice says what to do.
            let launch = start_keys(app.handle());
            if launch.damaged || launch.started.iter().any(|s| s.using() != s.picked()) {
                let off: Vec<&str> = keymap::ACTIONS.iter().filter(|a| launch.started[a.index()].using() != launch.started[a.index()].picked()).map(|a| a.id()).collect();
                log("hotkey_unavailable", json!({ "which": off, "damaged": launch.damaged }));
            }
            // One launch notice, not two: a page that loads later replays only the latest app.notice. The hotkey line comes
            // first. If a "delete everything" could not remove some of it, the helper left a note; it is said once, here too.
            let hotkey_notice = keymap::launch_notice(&launch.started, launch.damaged);
            let wipe_note = std::fs::read_to_string(data_dir().join("wipe-note.txt")).ok();
            if wipe_note.is_some() { let _ = std::fs::remove_file(data_dir().join("wipe-note.txt")); }
            // A copy started again after a problem ended the last one says so, once.
            let wipe_note = join_notes(wipe_note, problem_note_now());
            if let Some(message) = runner::join_launch_notices(hotkey_notice, wipe_note) {
                runner::Runner::publish(app.handle(), json!({ "v": 1, "id": "app-launch-notice", "type": "app.notice", "message": message }));
            }
            start_runner(app.handle());
            // Pro's key check (payments on and a key saved only; with payments off this starts nothing).
            start_plan_timer(app.handle());
            // M79: the remote payments switch, asked once in the background only when the build's own file switch is on
            // and names an address (today's files do neither, so nothing is asked). Only a plain yes turns payments on;
            // then the pages and the engine hear the plan and the key check starts. Launch never waits for it.
            if license::file_billing().asks_remote() {
                let a = app.handle().clone();
                std::thread::spawn(move || {
                    if remoteswitch::ask(license::file_billing(), &remoteswitch::Curl) { plan_push(&a, true); start_plan_timer(&a); }
                    log("payments_switch", json!({ "on": remoteswitch::said_yes() }));
                });
            }
            // The menu bar icon: Settings…, hide or show, stop everything, quit. Only Settings… opens anything: Home, on
            // Settings, at the page last viewed (the overhaul spec, 3.1), because the person clicked it.
            let settings = MenuItemBuilder::with_id("settings", "Settings…").build(app)?;
            let hide = MenuItemBuilder::with_id("hide", concat!("Hide or show ", crate::product!())).build(app)?;
            let stop = MenuItemBuilder::with_id("stop", "Stop everything").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", concat!("Quit ", crate::product!())).build(app)?;
            let menu = MenuBuilder::new(app).items(&[&settings, &hide, &stop, &quit]).build()?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
                .tooltip(crate::product!())
                .menu(&menu)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "settings" => open_card_then(app, "menu", true, Some(arrival::menu_settings())),
                    "hide" => { let a = app.clone(); let _ = app.run_on_main_thread(move || set_user_hidden(&a, !USER_HID.load(Ordering::SeqCst))); }
                    "stop" => {
                        let r = app.state::<runner::Runner>().stop_everything("menu");
                        log("menu_stop_everything", json!({ "sent": r.is_ok() }));
                        let stop = json!({ "v": 1, "id": "app-kill", "type": "app.stop_everything" });
                        peek_heard(app, &stop);
                        let _ = app.emit("runner-event", stop);
                        showme_stop(app);
                        let _ = app.run_on_main_thread(|| home_stop_now("stop_everything"));
                    }
                    "quit" => { quit::mark(quit::MENU); app.exit(0) }
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
    let handle = app.handle().clone();
    // 5 Nov 2026: a panic on the main thread stops macOS's event loop and ends the app with no crash report. It is caught
    // here instead: the quit's steps run (the engine shuts down), the app opens again once (never in a loop), and the new
    // copy says why.
    let ended = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || app.run(|app, ev| match ev {
        // The last window closing never ends Squibby (its windows live inside panels, so this should never happen, but a
        // quiet quit is the worst way to find out). Only a quit someone asked for does: the menu, an update, Delete
        // everything, macOS, or a signal.
        RunEvent::ExitRequested { code: None, api, .. } => { log("exit_prevented", json!({})); api.prevent_exit(); }
        // Must fixes 1 and 15: the speech models go first, the quit is written down with where it came from, then the
        // engine shuts down. A speech model that may still be loaded never reaches the clean up at exit (the crash on
        // quit): the process ends at once instead, after the engine has shut down.
        RunEvent::Exit => {
            // 5 Nov 2026: a quit another program asked for (an Apple Event) names that program and macOS's reason.
            if let Some((by, why)) = exitlog::quit_sender() { log("quit_asked", json!({ "by": by, "why": why, "uptime_s": (now() - T0.get().copied().unwrap_or(0)) / 1000 })); }
            quit_now(app, quit::from(), quit::VOICE_WAIT);
            match quit::ending(quit::hard(), quit::restarting()) {
                quit::Ending::Usual => {}
                quit::Ending::AtOnce => unsafe { libc::_exit(0) },
                quit::Ending::RelaunchThenAtOnce => { relaunch_now(app); unsafe { libc::_exit(0) } }
            }
        }
        // Companion opened again while it runs (Finder, Spotlight, Launchpad): macOS asks this copy to reopen.
        RunEvent::Reopen { .. } => reopened(app),
        _ => {}
    })));
    if ended.is_err() { ended_by_problem(&handle); }
}

/// The note for a copy started again after a problem (exitlog.rs), read once.
fn problem_note_now() -> Option<String> {
    let p = data_dir().join("problem-restart-note");
    let at = exitlog::read_secs(std::fs::read_to_string(&p).ok());
    if at.is_some() { let _ = std::fs::remove_file(&p); }
    exitlog::note_is_fresh(at, (now() / 1000) as u64).then(|| exitlog::RESTARTED_WORDS.to_string())
}
fn join_notes(a: Option<String>, b: Option<String>) -> Option<String> {
    match (a, b) { (Some(a), Some(b)) => Some(format!("{} {}", a.trim_end(), b)), (a, b) => a.or(b) }
}

/// A panic anywhere leaves one line in the exits log: where it happened (file and line) and on which thread, nothing else.
/// Rust's usual message still goes to the error output.
fn install_panic_note() {
    let before = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let at = info.location().map(|l| exitlog::short_location(l.file(), l.line())).unwrap_or_else(|| "unknown".into());
        let main = std::thread::current().name() == Some("main");
        exitlog::note("app_panic", &json!({ "at": at, "thread": if main { "main" } else { "other" } }));
        before(info);
    }));
}

/// The main thread's event loop ended with a panic. The quit's steps run (so the engine and anything it runs end), then the
/// app opens again, at most once in ten minutes, and the new copy tells the person. The process ends at once afterwards.
fn ended_by_problem(app: &AppHandle) -> ! {
    quit::mark(quit::PROBLEM);
    quit_now(app, quit::PROBLEM, quit::VOICE_WAIT);
    let guard = data_dir().join("problem-restart");
    let now_s = (now() / 1000) as u64;
    if exitlog::may_restart(exitlog::read_secs(std::fs::read_to_string(&guard).ok()), now_s) {
        let _ = std::fs::write(&guard, now_s.to_string());
        let _ = std::fs::write(data_dir().join("problem-restart-note"), now_s.to_string());
        let started = start_new_copy(app);
        log("app_problem_restart", json!({ "started": started }));
    } else {
        log("app_problem_no_restart", json!({}));
    }
    unsafe { libc::_exit(1) }
}

/// Automatic and sudden termination off: macOS may never quit Squibby by itself, only when someone asks.
fn keep_running_until_quit() {
    let p = objc2_foundation::NSProcessInfo::processInfo();
    p.disableAutomaticTermination(&NSString::from_str("Squibby stays on until the person quits it"));
    p.disableSuddenTermination();
}

/// The write end of the pipe the signal handler writes to (a signal handler may only do the simplest things).
static SIGNAL_PIPE: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(-1);
extern "C" fn on_signal(sig: libc::c_int) {
    let fd = SIGNAL_PIPE.load(Ordering::Relaxed);
    if fd >= 0 { let b = sig as u8; unsafe { libc::write(fd, (&b as *const u8).cast(), 1); } }
}
/// 5 Nov 2026: a TERM, HUP or INT signal (`kill`, `pkill`, a terminal closing) used to end the app at once with no word.
/// Now it is a quit like any other: written down, the engine shut down, and the app ends. If that quit has not ended the
/// app within ten seconds, it ends at once.
fn watch_signals() {
    let mut fds = [0 as libc::c_int; 2];
    if unsafe { libc::pipe(fds.as_mut_ptr()) } != 0 { return; }
    for fd in fds { unsafe { libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC); } }   // never handed to the engine
    SIGNAL_PIPE.store(fds[1], Ordering::SeqCst);
    for sig in [libc::SIGTERM, libc::SIGHUP, libc::SIGINT] { unsafe { libc::signal(sig, on_signal as *const () as libc::sighandler_t); } }
    let read_fd = fds[0];
    std::thread::spawn(move || {
        let mut b = [0u8; 1];
        loop {
            let n = unsafe { libc::read(read_fd, b.as_mut_ptr().cast(), 1) };
            if n == 1 { break; }
            if n == 0 { return; }
        }
        let name = match b[0] as libc::c_int { libc::SIGTERM => "term", libc::SIGHUP => "hup", libc::SIGINT => "int", _ => "other" };
        log("app_signal", json!({ "signal": name }));
        quit::mark(quit::SIGNAL);
        match APP.get() { Some(a) => a.exit(0), None => unsafe { libc::_exit(0) } }
        std::thread::sleep(Duration::from_secs(10));
        unsafe { libc::_exit(0) }
    });
}

/// Opening Companion again shows it if the person hid it from the menu bar (that icon can be out of reach: behind the notch,
/// or turned off in macOS's menu bar settings), the same way the menu does; otherwise it opens Home. Never the keyboard.
/// Main thread (the app's own event loop).
/// Must fix 22: starts the updated copy before this one ends at once. Waits up to two seconds for `open` to hand the
/// launch to macOS, so the request is not lost when this process ends.
fn relaunch_now(app: &AppHandle) {
    if start_new_copy(app) { log("update_relaunched", json!({})); } else { log("update_relaunch_failed", json!({})); }
}
/// Starts a fresh copy of the app (quit.rs relaunch_command) and waits up to two seconds for `open` to hand it to macOS.
fn start_new_copy(app: &AppHandle) -> bool {
    let Ok(binary) = tauri::process::current_binary(&app.env()) else { return false };
    let (prog, args) = quit::relaunch_command(&binary);
    match std::process::Command::new(prog).args(args).spawn() {
        Ok(mut child) => {
            let until = std::time::Instant::now() + Duration::from_secs(2);
            while std::time::Instant::now() < until { if let Ok(Some(_)) = child.try_wait() { break } std::thread::sleep(Duration::from_millis(50)); }
            true
        }
        Err(_) => false,
    }
}
fn reopened(app: &AppHandle) {
    log("reopened", json!({ "hidden": USER_HID.load(Ordering::SeqCst) }));
    if USER_HID.load(Ordering::SeqCst) { set_user_hidden(app, false); } else { open_card(app, "reopen", false); }
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

#[cfg(test)]
mod drop_tests {
    use super::*;
    use tauri::{DragDropEvent, PhysicalPosition};

    fn at() -> PhysicalPosition<f64> { PhysicalPosition::new(10.0, 10.0) }

    #[test]
    fn only_a_drag_of_files_lights_the_character_or_opens_the_menu() {
        let file = vec![PathBuf::from("/Users/me/photo.png")];
        assert_eq!(drag_news(&DragDropEvent::Enter { paths: file.clone(), position: at() }, true), DragNews::Hover(true));
        assert_eq!(drag_news(&DragDropEvent::Drop { paths: file.clone(), position: at() }, true), DragNews::Dropped(file.clone()));
        // Text, a link, or a picture from Photos, Mail or a browser: no file comes with it.
        assert_eq!(drag_news(&DragDropEvent::Enter { paths: vec![], position: at() }, true), DragNews::Nothing);
        assert_eq!(drag_news(&DragDropEvent::Drop { paths: vec![], position: at() }, true), DragNews::Hover(false));
        assert_eq!(drag_news(&DragDropEvent::Over { position: at() }, true), DragNews::Nothing);
        // Leaving always puts the window back; with the setting off nothing else happens.
        assert_eq!(drag_news(&DragDropEvent::Leave, false), DragNews::Hover(false));
        assert_eq!(drag_news(&DragDropEvent::Enter { paths: file.clone(), position: at() }, false), DragNews::Nothing);
        assert_eq!(drag_news(&DragDropEvent::Drop { paths: file, position: at() }, false), DragNews::Nothing);
    }

    fn menu(id: u64, running: Option<std::sync::Arc<convert::Job>>) -> DropNow {
        DropNow { id, paths: vec![], actions: vec![], menu: Value::Null, job: None, made: vec![], running }
    }

    #[test]
    fn a_new_drop_never_lets_go_of_a_running_job() {
        let job = std::sync::Arc::new(convert::Job::default());
        let mut now = Some(menu(1, Some(job.clone())));
        assert!(!put_menu(&mut now, menu(2, None)), "a drop while a job runs changes nothing");
        assert_eq!(now.as_ref().map(|d| d.id), Some(1));
        assert!(now.as_ref().and_then(|d| d.running.as_ref()).is_some_and(|j| std::sync::Arc::ptr_eq(j, &job)), "Stop everything can still reach it");
        // Once it has ended, the next drop takes its place.
        now.as_mut().unwrap().running = None;
        assert!(put_menu(&mut now, menu(2, None)));
        assert_eq!(now.as_ref().map(|d| d.id), Some(2));
        let mut empty = None;
        assert!(put_menu(&mut empty, menu(3, None)));
    }
}

/// The shell's whole source as one text, the way it read before it was split into the shell_*.rs files: this file with
/// each include! line replaced by the file it pulls in. Many tests read the shell's source and look for exact lines.
#[cfg(test)]
pub(crate) fn main_src() -> &'static str {
    static SRC: OnceLock<String> = OnceLock::new();
    SRC.get_or_init(|| {
        let parts = [
            ("shell_dock.rs", include_str!("shell_dock.rs")),
            ("shell_roam.rs", include_str!("shell_roam.rs")),
            ("shell_settings.rs", include_str!("shell_settings.rs")),
            ("shell_setup.rs", include_str!("shell_setup.rs")),
            ("shell_showme.rs", include_str!("shell_showme.rs")),
            ("shell_updates.rs", include_str!("shell_updates.rs")),
            ("shell_speech.rs", include_str!("shell_speech.rs")),
            ("shell_data.rs", include_str!("shell_data.rs")),
            ("shell_plan.rs", include_str!("shell_plan.rs")),
            ("shell_tools.rs", include_str!("shell_tools.rs")),
            ("shell_keys.rs", include_str!("shell_keys.rs")),
            ("shell_voice.rs", include_str!("shell_voice.rs")),
            ("shell_tick.rs", include_str!("shell_tick.rs")),
            ("shell_drop.rs", include_str!("shell_drop.rs")),
            ("shell_peekout.rs", include_str!("shell_peekout.rs")),
        ];
        let mut src = include_str!("main.rs").to_string();
        for (name, text) in parts {
            let line = format!("include!({name:?});\n");
            assert_eq!(src.matches(&line).count(), 1, "{name} is pulled in once");
            src = src.replacen(&line, text, 1);
        }
        assert!(!src.contains("\ninclude!("), "every file pulled in is listed above");
        src
    })
}
