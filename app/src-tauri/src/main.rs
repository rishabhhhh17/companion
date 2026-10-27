//! Companion shell. Tauri's web pages inside NSPanels that we create ourselves,
//! non activating from the start (T01: no tauri-nspanel, no convert after creation).
//! Rule 9: never steal keyboard focus. Nothing here calls show(), set_focus() or
//! makeKeyAndOrderFront on a panel. The one window that takes the keyboard is the Settings window, a normal window the
//! person opens on purpose (settingswin.rs).

mod docking;
mod peek;
mod settingswin;
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
mod seclook;
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
mod report;
mod yourturn;
mod wipe;
mod logexport;
mod practice;
mod names;
mod newfolder;
mod made;
mod sharedfiles;
mod diagram;
mod snap;
mod prompthelp;
mod errorsel;
mod secondsel;
#[allow(dead_code)]
mod voice;
#[cfg(target_os = "macos")]
#[allow(dead_code)]
mod voice_mac;
mod voiceset;
mod voicewords;
mod talkkeys;
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
use objc2_foundation::{NSNumber, NSPoint, NSRect, NSSize, NSString};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use docking::{choice, inside, pick, signature, snap_on, Prefs, Rect, Screen};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

const DOCK: (f64, f64) = (160.0, 160.0);
// Home's size (the card, F18): CARD is the usual width (380, for its tabs) and least height, the size Home's window is made
// at. The size in force (home.size: standard or large) is `home_size()`, one definition in island.rs (HomeSize), used by
// resize_card, by card_spot and by everything that keeps clear of Home.
use island::CARD;

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
/// itself frees it half a second after its ring time (10 s unless changed, point.ringSeconds); one waiting for a click,
/// or a Draw it for me picture kept until closed, holds it until the overlay is hidden.
static OVERLAY_BUSY_UNTIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn overlay_busy() -> bool { (now() as u64) < OVERLAY_BUSY_UNTIL.load(std::sync::atomic::Ordering::SeqCst) }
/// A Draw it for me picture kept until it is closed (drawIt.seconds) is on the overlay: a new picture may replace it.
static DIAGRAM_KEPT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// Each celebration takes a number, so an older one's tidy up never cuts a newer one short.
static PARTY_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn turn_cancel() { TURN_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst); *TURN.lock().unwrap_or_else(|e| e.into_inner()) = None; }
static CARD_H: AtomicU64 = AtomicU64::new(150);
static USER_HID: AtomicBool = AtomicBool::new(false);      // hidden from the menu bar icon
static HIDDEN_BY_US: AtomicBool = AtomicBool::new(false);  // hidden because a full screen app is in front
static FS_SMOOTH: Mutex<Option<visibility::Debounce>> = Mutex::new(None);
/// What each display was seen to keep free while no full screen app was in front (fullscreen.rs).
static FS_SEEN: Mutex<fullscreen::Seen> = Mutex::new(fullscreen::Seen::new());
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
    // By default the character stays out of full screen apps (the product default). The setting Show Companion over full
    // screen apps (character.overFullScreen), or a developer's COMPANION_OVER_FULLSCREEN=1, keeps it on screen over them.
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
    let hs = home_set();
    // With the island turned off in Settings there is no island to drop from: Home opens beside the character.
    let on = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).clone().filter(|_| hs.island_show);
    let home = roamer().home().unwrap_or_else(|| from_appkit(d.frame(), ph));
    let spot = island::card_spot(on.as_ref(), home, &list, |id| with_prefs(|p| choice(p, id).0), (hs.size.w, h.clamp(hs.size.min_h, hs.size.max_h)))?;
    Some((spot, ph))
}

/// Place Home: under the island, or beside the character's home when no island display is known. It does not follow
/// the character to a window.
fn place_card(d: &NSPanel, c: &NSPanel) {
    let mtm = MainThreadMarker::new().unwrap();
    let Some((cf, ph)) = card_spot(mtm, d, CARD_H.load(Ordering::SeqCst) as f64) else { return };
    // At once, never a motion, through the one helper, so it replaces Home's drop if that is still running.
    set_frame_moving(c, to_appkit(cf, ph), None, None, &CARD_MOVES);
    // The card opened or grew. If at its tallest it could reach the character beside a window, the visit is planned
    // again clear of it (or ends).
    if let Some((room, _)) = card_spot(mtm, d, home_size().max_h) { roam_card_moved(mtm, room); }
}

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
    let spring = secs.is_some() && std::ptr::eq(moves, &DOCK_MOVES);
    let changes = RcBlock::new(move |ctx: NonNull<NSAnimationContext>| {
        unsafe { ctx.as_ref() }.setDuration(secs.unwrap_or(0.0));
        if spring { spring_timing(unsafe { ctx.as_ref() }); }
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
    with_panels(|d, c| if c.isVisible() { card_spot(mtm, d, home_size().max_h).map(|(r, _)| r) } else { None }).flatten().into_iter().collect()
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
    // Another display, or the launch, can change the place Settings shows: the pages are told (a drag tells them once, on
    // the drop).
    if reason != "drag" && place_shown_changed() { if let Some(app) = APP.get() { place_told(app); } }
    // On its edge, inside the work area, out of the clear zone at the top centre (the notch island).
    let f = docking::place(&target, DOCK, edge, pct, home_size());
    // This is home now. A drag or a display change also ends any visit beside a window, with no trip back, and stops a
    // trip that was under way where it is.
    ROAM_GEN.fetch_add(1, Ordering::SeqCst);
    roamer().placed_home(f);
    *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    *HOME_EDGE.lock().unwrap_or_else(|e| e.into_inner()) = edge;
    if let Some(app) = APP.get() { if roam_phase() != roam::Phase::Home { roam_say(app, roam::Phase::Home, roam::facing(roam::Phase::Home, f, f, None, edge)); } }
    with_panels(|d, c| {
        set_frame_moving(d, to_appkit(f, ph), None, None, &DOCK_MOVES);
        if c.isVisible() { place_card(d, c); }
    });
    // Put at its place fully in view; it goes back past the edge on the next look, if it should (peek_apply).
    peek_placed();
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
        let (edge, pct) = snap_on(&target, DOCK, x, y, home_size());
        *LAST_DRAG.lock().unwrap() = (x, y, target.work[0], target.work[2]);
        // With Same place on every display on, the place dragged to is the one copied to displays with no place yet.
        with_prefs(|p| { p.last_screen = target.id.clone(); p.per_screen.insert(target.id.clone(), (edge, pct)); if p.same_everywhere.is_some() { p.same_everywhere = Some((edge, pct)); } });
        apply_dock(mtm, "drag", true);
    });
}

/// The character's place as Settings shows it (dock.json, on the display it is on).
const PLACE_KEYS: [&str; 3] = ["character.edge", "character.position", "character.sameEverywhere"];
/// What the pages were last told of it.
static PLACE_SHOWN: Mutex<Option<[Option<Value>; 3]>> = Mutex::new(None);
/// Is the place Settings would show now not what the pages were last told? Keeps it as told.
fn place_shown_changed() -> bool {
    let shown = with_prefs(|p| PLACE_KEYS.map(|k| settings::dock_value(p, k)));
    PLACE_SHOWN.lock().unwrap_or_else(|e| e.into_inner()).replace(shown.clone()) != Some(shown)
}
/// Tells every page the character's place, after it changed outside settings_set (a drag, another display, the launch),
/// so its rows, their Reset, Reset this section and Undo start from where it is.
fn place_told(app: &AppHandle) { place_shown_changed(); settings_told(app, &PLACE_KEYS.map(String::from)); }

#[tauri::command]
fn drop_dock(app: AppHandle) {
    DRAG_AT.store(0, Ordering::SeqCst);
    save_prefs();
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let (x, y, wx, ww) = *LAST_DRAG.lock().unwrap();
        log("dock_dropped", with_prefs(|p| json!({ "screen": p.last_screen, "choice": p.per_screen.get(&p.last_screen), "last_pointer": [x, y], "work_x_and_width": [wx, ww] })));
        // After the drag's last move (each is run on the main thread in turn), the pages are told where it is now.
        place_told(&a);
    });
}

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
static ISLAND_STATE: Mutex<island::State> = Mutex::new(island::State { hover: false, alert: false, home_open: false, says: false });
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

/// The id (as `displays_now` names it) of the Mac's own screen, when it is connected and on (CGDisplayIsBuiltin); None
/// with the lid closed or on a Mac with no screen of its own. Only for island.display "built in". Main thread.
fn builtin_display(mtm: MainThreadMarker) -> Option<String> {
    let list = NSScreen::screens(mtm);
    let primary_h = list.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    list.iter().find(|s| screen_number(&s).is_some_and(|id| objc2_core_graphics::CGDisplayIsBuiltin(id))).map(|s| { let f = from_appkit(s.frame(), primary_h); format!("{}x{}@{},{}", f[2], f[3], f[0], f[1]) })
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
    let state = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); s.home_open = HOME_OPEN.load(Ordering::SeqCst); *s };
    let mode = island::mode(state);
    let look = island::look(&d, mode, state.says);
    let look = if ISLAND_CHEER.load(Ordering::SeqCst) && !reduce_motion() { island::cheered(&d, mode, look) } else { look };
    let f = look.frame;
    *ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()) = Some(d.clone());
    // The page springs its shape to the new size (island.tsx). Growing is at once, so the shape has room to grow into;
    // getting smaller in place waits while the shape tucks back (island.rs), unless Reduce motion or Less motion is on.
    let gen = ISLAND_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let from = ISLAND.with(|i| i.borrow().as_ref().filter(|p| p.isVisible()).map(|p| from_appkit(p.frame(), ph)));
    let kind = island::kind(&d);
    tell_island(mode, kind, &look);
    match from.filter(|_| !moved).and_then(|from| island::retract_ms(from, f, reduce_motion())) {
        None => set_island_frame(f, ph),
        Some(ms) => if let Some(app) = APP.get() {
            let a = app.clone();
            std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(ms)); let _ = a.run_on_main_thread(move || if ISLAND_GEN.load(Ordering::SeqCst) == gen { set_island_frame(f, ph) }); });
        },
    }
    if moved { log("island_placed", json!({ "reason": reason, "how": how, "screen": d.id, "kind": kind.word(), "frame": f })); }
}

/// Sets the island's window to `f` (global top left points) at once. Every frame of the island goes through here. Main thread.
fn set_island_frame(f: Rect, ph: f64) {
    ISLAND.with(|i| { if let Some(p) = i.borrow().as_ref() { set_frame_moving(p, to_appkit(f, ph), None, None, &ISLAND_MOVES); } });
}

fn tell_island(mode: island::Mode, kind: island::Kind, look: &island::Look) {
    let v = json!({ "mode": mode.word(), "kind": kind.word(), "w": look.frame[2], "h": look.frame[3], "core": look.core, "row": look.row });
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
}

/// Home went away (Esc, Close, a click elsewhere, the island or the character clicked again, a full screen app, Hide): the
/// click away watch stops and the island goes back to its own size. Main thread.
fn home_closed() {
    HOME_OPEN.store(false, Ordering::SeqCst);
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

/// The page says whether the wings are out (something is happening; home.ts islandWings) and whether it has a line to show
/// under the pointer (`says`), so a peek at the bare notch is wide enough for its line, or only for Flowflow.
#[tauri::command]
fn island_alert(app: AppHandle, on: bool, says: Option<bool>, cheer: Option<bool>) {
    let says = says.unwrap_or(false);
    let cheer = cheer.unwrap_or(false) && on;
    let _ = app.run_on_main_thread(move || {
        let cheer_changed = ISLAND_CHEER.swap(cheer, Ordering::SeqCst) != cheer;
        let changed = { let mut s = ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); let c = s.alert != on || s.says != says || cheer_changed; s.alert = on; s.says = says; c };
        if changed { if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "alert"); } }
    });
}

/// For the island page when it loads: its size now, what it sits on, and an update a check found (its version only).
#[tauri::command]
fn island_state() -> Value {
    let mut v = ISLAND_SENT.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if !v.is_object() { v = json!({ "mode": "rest", "kind": "pill" }); }
    v["update"] = UPDATE_READY.lock().unwrap_or_else(|e| e.into_inner()).clone().map(|u| json!({ "version": u })).unwrap_or(Value::Null);
    v
}

/// macOS tells us the pointer entered or left the island: a tracking area on that one window, active even while another
/// app is in front. Nothing else about the pointer is read for this. Main thread.
fn island_hover_changed(inside: bool) {
    let t = now() as u64;
    // The waits, and whether resting opens the status at all, as Settings says now (island.peekOnHover, openDelay, closeDelay).
    let times = home_set().hover;
    { let mut h = ISLAND_HOVER.lock().unwrap_or_else(|e| e.into_inner()); h.set_times(times); if inside { h.enter(t) } else { h.exit(t) } }
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
        // Turned off in Settings (home.closeOnClickAway), the watch stops: nothing more is read.
        while HOME_OPEN.load(Ordering::SeqCst) && HOME_GEN.load(Ordering::SeqCst) == gen && home_set().click_away {
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
/// The Mac's own Reduce motion setting (Accessibility, Display), read with no permission, or Companion's own Motion setting
/// set to less (character.motion), which changes only Companion.
fn reduce_motion() -> bool { home_set().less_motion || NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion() }

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
    // A Draw it for me picture kept until it is closed is not a pointer at that window: it never keeps the character there.
    let up = diagram::holds_a_visit(overlay_busy(), DIAGRAM_KEPT.load(SeqCst)) || TURN.lock().unwrap_or_else(|e| e.into_inner()).is_some() || card_visible();
    let hidden = HIDDEN_BY_US.load(SeqCst) || USER_HID.load(SeqCst);
    let on = with_prefs(|p| p.come_to);
    let ended = roamer().tick(&roam::TickIn { now: now() as u64, on, hidden, up, wins, ours: std::process::id() as i32, front_pid, linger_ms: home_set().linger_ms });
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
        with_panels(|d, _| set_frame_moving(d, to_appkit(r, ph), None, None, &DOCK_MOVES));
    });
}

// ---------- peeking from past the edge of the screen (character.peek; the rules are in peek.rs, tested) ----------

static PEEK: Mutex<peek::Peeker> = Mutex::new(peek::Peeker::new());
fn peeker() -> std::sync::MutexGuard<'static, peek::Peeker> { PEEK.lock().unwrap_or_else(|e| e.into_inner()) }
/// The pose the character's window was last moved for.
static PEEK_POSE: Mutex<peek::Pose> = Mutex::new(peek::Pose::In);
/// The frames asked of the character's own window (island::Moves): a peek still moving never ends on an older target
/// after a trip or a drag set the frame at once.
static DOCK_MOVES: Mutex<island::Moves> = Mutex::new(island::Moves::new());

/// The character was put at its place, fully in view (apply_dock): that is the pose now.
fn peek_placed() { *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) = peek::Pose::In; }

/// An event from the engine or the shell (Runner::publish, and Stop everything): it may make the character peek, need the
/// person (it stays in view), or be a light (listening, looking at the screen). A light brings it fully in at once, and
/// the caller waits for that before the microphone opens or the screen is read (rule 5).
pub(crate) fn peek_heard(app: &AppHandle, v: &Value) {
    // Most events are not news for peeking (a tool line, the cost): nothing more is done for them.
    if peek::news_of(v).is_empty() { return; }
    let lit = peeker().hear(v, now() as u64, quiet);
    if lit { peek_now(app, true); } else { let a = app.clone(); let _ = app.run_on_main_thread(move || peek_apply(&a, false)); }
}

/// Moves the character to the pose it should be in, on the main thread, and waits (at most a moment) until it has.
fn peek_now(app: &AppHandle, light: bool) {
    if MainThreadMarker::new().is_some() { peek_apply(app, light); return; }
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let a = app.clone();
    let _ = app.run_on_main_thread(move || { peek_apply(&a, light); let _ = tx.send(()); });
    let _ = rx.recv_timeout(Duration::from_millis(300));
}

/// The pointer came onto the character or left it: macOS's tracking area on its window (at once), and each tick (the
/// pointer's place only, never anything else, the same reading as a trip's pause).
fn dock_hover_changed(inside: bool) {
    peeker().pointer(inside, now() as u64);
    if let Some(app) = APP.get() { peek_apply(app, false); }
}

/// Puts the character in the pose the timing asks for (peek.rs `Peeker::pose`), where the geometry says (`peek::frame`),
/// with a short spring, or at once with Reduce motion or Less motion, or for a light. Only at its place on the edge: beside
/// a window or while dragged it is fully in and left to the trip. It only moves the panel: never orders it in, never
/// gives it the keyboard. Main thread.
fn peek_apply(app: &AppHandle, light: bool) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    if companion_hidden() { return; }
    let hs = home_set();
    let calm = reduce_motion();
    let at_home = roam_phase() == roam::Phase::Home && roamer().visit().is_none() && !dragging();
    let n = peek::Now { now: now() as u64, on: hs.peek, idle_on: hs.peek_idle, calm, at_home };
    let pose = peeker().pose(&n, quiet);
    let was = *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner());
    if pose == was || !at_home { if !at_home { *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) = peek::Pose::In; } return; }
    let Some(home) = roamer().home() else { return };
    let list = screens_now(mtm);
    let Some(first) = list.first() else { return };
    let ph = first.frame[3];
    let Some(s) = roam::display_of(&list, home) else { return };
    let edge = *HOME_EDGE.lock().unwrap_or_else(|e| e.into_inner());
    let f = peek::frame(home, edge, s, &list, pose);
    let secs = peek::motion(was, pose, calm, light);
    with_panels(|d, _| set_frame_moving(d, to_appkit(f, ph), secs, None, &DOCK_MOVES));
    *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) = pose;
    // The page leans toward the screen while it peeks (dock.tsx data-peek). Where it may not hide, it is simply in.
    let shown = if f == home { peek::Pose::In } else { pose };
    let _ = app.emit_to("dock", "peek", json!({ "pose": shown.word(), "edge": edge.word() }));
}

/// Each tick: the pointer on the character (its place only), then the pose.
fn peek_tick(app: &AppHandle) {
    if !home_set().peek { if *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) != peek::Pose::In { peek_apply(app, false); } return; }
    if let Some(on) = MainThreadMarker::new().and_then(pointer_on_character) { peeker().pointer(on, now() as u64); }
    peek_apply(app, false);
}

/// Whether the pointer is on the character: over its window, or, while it is tucked away, at the screen's edge beside it
/// (peek::at_edge). Only the pointer's place is read. None when its place is not known yet.
fn pointer_on_character(mtm: MainThreadMarker) -> Option<bool> {
    let at = (*ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()))?;
    let p = macos_see::pointer();
    if p.x >= at[0] && p.x < at[0] + at[2] && p.y >= at[1] && p.y < at[1] + at[3] { return Some(true); }
    if *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) != peek::Pose::Hidden { return Some(false); }
    let home = roamer().home()?;
    let list = screens_now(mtm);
    let s = roam::display_of(&list, home)?;
    let edge = *HOME_EDGE.lock().unwrap_or_else(|e| e.into_inner());
    Some(peek::at_edge(home, edge, s, &list, (p.x, p.y)))
}

/// While it is tucked away, often (peek::EDGE_POLL_MS): the pointer reaching the edge brings it in at once, not on the
/// next tick. Main thread.
fn peek_edge_poll(app: &AppHandle) {
    if !home_set().peek { return; }
    let Some(mtm) = MainThreadMarker::new() else { return };
    if pointer_on_character(mtm) == Some(true) { peeker().pointer(true, now() as u64); peek_apply(app, false); }
}

/// The curve of the character's own moves (peek::SPRING), set on the motion's context. CAMediaTimingFunction is looked
/// up by name (QuartzCore is already loaded by AppKit), so no new dependency. If it is missing the move is the usual curve.
fn spring_timing(ctx: &objc2_app_kit::NSAnimationContext) {
    use objc2::runtime::{AnyClass, AnyObject, MessageReceiver};
    let Some(cls) = AnyClass::get(c"CAMediaTimingFunction") else { return };
    let [a, b, c, d] = peek::SPRING;
    let f: *mut AnyObject = unsafe { MessageReceiver::send_message(cls, objc2::sel!(functionWithControlPoints::::), (a, b, c, d)) };
    if f.is_null() { return; }
    let _: () = unsafe { objc2::msg_send![ctx, setTimingFunction: f] };
}

/// Settings: whether the character comes to what it is about (on unless turned off), the registry's character.comeTo
/// (settings.rs), kept in `dock.json` as before. Changed only through settings_set (card only). Off sends a visiting
/// character home.
fn come_to_set(app: &AppHandle, on: bool) {
    with_prefs(|p| p.come_to = on);
    save_prefs();
    if !on { roam_end(app); }
}

/// Settings: the character's place on the display it is on (character.edge, character.position) and Same place on every
/// display, kept in `dock.json` as a drag keeps them (settings.rs `dock_with`). Changed only through settings_set (card
/// only). The character goes there at once, which also ends any visit beside a window (apply_dock).
fn place_set(app: &AppHandle, next: Prefs) {
    with_prefs(|p| *p = next);
    save_prefs();
    let _ = app.run_on_main_thread(|| { if let Some(mtm) = MainThreadMarker::new() { apply_dock(mtm, "setting", false); } });
}

/// Home, the island and the character as Settings says now (homeset.rs): read each time it is needed, so a change takes
/// effect at once.
fn home_set() -> homeset::HomeSet { with_settings(|s| homeset::read(settings::registry(), &s.file)) }
/// Home's size in force (home.size): its width, least height and tallest height. The one size for placing Home, for the
/// character's clear zones and for the trips beside a window.
fn home_size() -> island::HomeSize { home_set().size }

/// What the shell does at once when one of these changes (homeset.rs). The rest are read where they are used (the waits on
/// the island, the wait beside a window, the motion, full screen apps) and need nothing more.
fn home_setting_applied(app: &AppHandle, key: &str) {
    match key {
        // The island shown or hidden, on another display, or Home another size: everything is put back where it belongs.
        "island.show" | "island.display" | "home.size" => {
            let size = key == "home.size";
            let _ = app.run_on_main_thread(move || {
                let Some(mtm) = MainThreadMarker::new() else { return };
                let hs = home_set();
                CARD_H.store((CARD_H.load(Ordering::SeqCst) as f64).clamp(hs.size.min_h, hs.size.max_h) as u64, Ordering::SeqCst);
                reset_hover();
                place_island(mtm, false, "setting");
                // Put in place first, then shown (unless Companion is hidden): it never shows where it was.
                island_show(!USER_HID.load(Ordering::SeqCst) && !HIDDEN_BY_US.load(Ordering::SeqCst));
                // Home's size: the character's own place keeps clear of Home at the new size (docking.rs dock_zone).
                if size { apply_dock(mtm, "setting", true); }
                with_panels(|d, c| if c.isVisible() { place_card(d, c) });
            });
        }
        // The status on pointing: what shows now is put back, and the next pointing uses the new waits.
        "island.peekOnHover" | "island.openDelay" | "island.closeDelay" => {
            let _ = app.run_on_main_thread(|| { reset_hover(); if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "setting"); } });
        }
        // Peeking turned on or off: the character goes where it should be now (fully in when off).
        "character.peek" | "character.peekIdle" => { let a = app.clone(); let _ = app.run_on_main_thread(move || peek_apply(&a, false)); }
        // Close Home when I click another app: an open Home's watch stops at once, or starts when it is turned on.
        "home.closeOnClickAway" => {
            HOME_GEN.fetch_add(1, Ordering::SeqCst);
            if HOME_OPEN.load(Ordering::SeqCst) && home_set().click_away { watch_click_away(app); }
        }
        _ => {}
    }
}

// ---------- Settings: the registry (settings.rs, T16) ----------
//
// One list of every setting (protocol/settings.json). Pages never write a file: every change comes here (settings_set,
// settings_reset, settings_migrate, card only), is checked, is kept in its store (settings.json, or the file it always
// had: dock.json, presentation.json, keys.json, voice.json; the engine's own three through its own commands), is
// applied, and every window is told ("settings-changed"). What the engine applies from settings.json reaches it as
// settings.apply, the first line it reads after every start. The activity log names the setting, never its value.

struct SettingsNow { file: settings::File, problems: Vec<settings::Problem> }
static SETTINGS: Mutex<Option<SettingsNow>> = Mutex::new(None);
fn with_settings<R>(f: impl FnOnce(&mut SettingsNow) -> R) -> R {
    let mut g = SETTINGS.lock().unwrap_or_else(|e| e.into_inner());
    let s = g.get_or_insert_with(|| {
        let (file, problems) = settings::load(settings::registry(), &data_dir());
        if !problems.is_empty() { log("settings_problems", json!({ "count": problems.len(), "damaged": problems.iter().any(|p| p.code == "damaged"), "unreadable": problems.iter().any(|p| p.code == settings::UNREADABLE) })); }
        SettingsNow { file, problems }
    });
    f(s)
}
fn project_opt() -> Option<String> { let p = current_project(); (!p.is_empty()).then_some(p) }
/// The value in force of a setting kept in settings.json (the usual one when it is not set), for the shell's own readers.
fn setting_now(key: &str) -> Value {
    let project = project_opt();
    with_settings(|s| settings::value_of(settings::registry(), &s.file, key, project.as_deref())).unwrap_or(Value::Null)
}
fn settings_snapshot(changed: &[String]) -> Value {
    let project = project_opt();
    let rules = project.as_deref().filter(|p| *p != runner::NO_PROJECT).map(|p| houserules::read(std::path::Path::new(p))).unwrap_or(Ok(None));
    let w = settings::Wrapped { dock: with_prefs(|p| p.clone()), presentation: presentation_now(), keys: keys_picked(), voice: voice_now(), ph_apps: phelp::apps_value(), rules };
    with_settings(|s| settings::snapshot(settings::registry(), &s.file, project.as_deref(), &w, &s.problems, changed))
}
/// Tells every window (card, dock, overlay, island) what is in force now.
fn settings_told(app: &AppHandle, changed: &[String]) { let _ = app.emit("settings-changed", settings_snapshot(changed)); }
fn settings_line() -> String {
    let project = project_opt();
    with_settings(|s| settings::apply_line(settings::registry(), &s.file, project.as_deref(), &format!("set-{}", now())))
}
/// The engine's settings again (after a change it applies, or another project). If it is not running it is given them
/// when it starts.
fn send_settings(app: &AppHandle) { let _ = app.state::<runner::Runner>().send_line(settings_line()); }
/// Before settings.json is written: one that could not be read is read again (settings::ready_to_save). Still not
/// readable, the change is refused and nothing is saved over it; readable now, the engine is given what it holds, and
/// Ok(true) says it was read again just now (the page was shown the usual values, not the person's own).
fn settings_writable(app: &AppHandle) -> Result<bool, &'static str> {
    let again = with_settings(|s| settings::ready_to_save(settings::registry(), &data_dir(), &mut s.file, &mut s.problems))?;
    if again { log("settings_read_again", json!({})); send_settings(app); }
    Ok(again)
}

/// What the page shows and reads: every value in force, the usual ones, the project, and the problems found.
#[tauri::command]
fn settings_get() -> Value { settings_snapshot(&[]) }

/// Changes one setting. Only from the card. The error is a code the page puts in words; nothing changed then.
#[tauri::command]
fn settings_set(app: AppHandle, window: tauri::WebviewWindow, key: String, value: Value, project: Option<String>) -> Result<Value, String> {
    settings::card_or_settings(window.label())?;
    let changed = setting_change(&app, &key, &value, project.as_deref()).map_err(|c| { log("setting_not_changed", json!({ "key": key, "why": c })); c.to_string() })?;
    log("setting_changed", json!({ "key": key }));
    settings_told(&app, &changed);
    Ok(settings_snapshot(&changed))
}

fn setting_change(app: &AppHandle, key: &str, value: &Value, asked: Option<&str>) -> Result<Vec<String>, &'static str> {
    let r = settings::registry();
    let d = r.get(key).ok_or("unknown")?;
    // A change for a project that is no longer the one in Home is refused (house rules always say theirs).
    let for_project = settings::for_project(d, asked, project_opt().as_deref())?.map(str::to_string);
    let one = vec![key.to_string()];
    match d.store.as_str() {
        "settings" => {
            settings_writable(app)?;
            let project = for_project.clone();
            let changed = with_settings(|s| -> Result<bool, &'static str> {
                let mut next = s.file.clone();
                let changed = settings::set(r, &mut next, key, value, project.as_deref())?;
                if changed { settings::save(&data_dir(), &next)?; s.file = next; }
                Ok(changed)
            })?;
            if !changed { return Ok(vec![]); }
            setting_applied(app, key);
            if settings::needs_apply(d) { send_settings(app); }
            Ok(one)
        }
        "dock" => {
            // A valid value, or for the position Undo's exact place after a reset (settings.rs dock_input).
            let v = settings::dock_input(d, value)?;
            // Nothing to change it on yet (no display known): said as a setting that could not be changed.
            let next = with_prefs(|p| settings::dock_with(p, key, &v)).ok_or("other")?;
            if key == "character.comeTo" { come_to_set(app, next.come_to); } else { place_set(app, next); }
            Ok(one)
        }
        "presentation" => {
            let v = settings::validate(d, value)?;
            let next = settings::presentation_with(&presentation_now(), key, &v).ok_or("unknown")?;
            presentation_set(app, next)?;
            Ok(one)
        }
        "spending" | "memory" | "metrics" => {
            let v = settings::validate(d, value)?;
            let cmd = settings::runner_command(key, &v, &current_project(), &format!("set-{}", now())).ok_or("unknown")?;
            app.state::<runner::Runner>().send(&cmd).map_err(|_| "engine")?;
            Ok(one)
        }
        // The per app answers (Prompt help and the error explainer, prompt_help.json): one operation from the editor, under
        // prompthelp.rs's rules (the built in never list cannot change; loosening a never needs the inline confirm). Only the
        // id of the app in front is read, for "Add the app in front to never read".
        "promptHelpApps" => {
            phelp::apps_change(value, &front_id())?;
            Ok(one)
        }
        // House rules: the project's own .companion/rules.txt, written only on the row's Save, every line it does not
        // understand kept exactly (houserules.rs). The engine reads the file itself before each action.
        "rules" => {
            let project = for_project.filter(|p| p != runner::NO_PROJECT).ok_or("noProject")?;
            let dir = std::path::Path::new(&project);
            let old = houserules::read(dir).map_err(|_| houserules::UNREADABLE)?;
            match houserules::change(d, old.as_deref(), value)? {
                None => Ok(vec![]),
                Some(text) => { houserules::write(dir, &text)?; Ok(one) }
            }
        }
        // Undo after a reset: the voice and the keys come back whole, exactly as the page was shown them (settings.rs).
        "voice" => {
            let next = settings::voice_from(value)?;
            voice_save(&voice_now(), &next)?;
            Ok(one)
        }
        "keys" => {
            let wanted = settings::keys_from(value)?;
            if !keys_restore(app, &wanted).is_empty() { return Err("keysTaken"); }
            Ok(one)
        }
        _ => Err("unknown"),
    }
}

/// What the shell does itself when a setting kept in settings.json changes.
fn setting_applied(app: &AppHandle, key: &str) {
    let off = |k: &str| with_settings(|s| settings::value_of(settings::registry(), &s.file, k, None)) == Some(json!(false));
    // Speak to me or Answer out loud turned off: silence at once.
    if (key == "talk.speak" || key == "talk.speakReplies") && off(key) { speech_off(app); }
    // A group was switched (F20): its keys are let go or taken again, and a group just switched off stops its tools.
    if groups::is_switch(key) { groups_applied(app); }
    home_setting_applied(app, key);
}

// ---------- Groups of tools (F20, M12; the catalog and its rules are in groups.rs) ----------

/// Is this group switch (a settings key) off? Read from settings.json as every shell setting is.
fn group_off(key: &str) -> bool { setting_now(key) == json!(false) }
/// The switches that are off now, one bit each in the catalog's order.
fn groups_mask() -> u32 {
    groups::catalog().switches().iter().enumerate().fold(0u32, |m, (i, k)| if group_off(k) { m | (1 << i) } else { m })
}

/// The shell refuses a command of a tool whose group is switched off with one plain line, before it runs
/// (`invoke_handler` below asks this for every command a page sends).
fn group_refusal(command: &str) -> Option<&'static str> { groups::refuse_command(&group_off, command) }

/// A group was switched on or off, or put back by Reset. Main thread (settings commands are sync). A job of a group that
/// is off gives its keys back through the key map, the choice stays saved; switched on again, the keys are taken again
/// (the keys in use, else the picked then the usual ones, the same two tries as at launch). A group that has just been
/// switched off also stops what it was doing here: hold to talk and speech, a Prompt help or error result, a pointer on the
/// screen, a conversion. (The engine stops its own work when it is given the switch, runner/src/groups.ts.)
fn groups_applied(app: &AppHandle) {
    let (was, now) = (GROUPS_OFF.swap(groups_mask(), Ordering::SeqCst), GROUPS_OFF.load(Ordering::SeqCst));
    {
        let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
        let gs = app.global_shortcut();
        for a in keymap::ACTIONS {
            let (held_now, held_before) = (groups::hotkey_held(&group_off, a.id()), key_held(a));
            if held_now == held_before { continue; }
            if held_now {
                // Let go of what is registered for the job, then mark it held (so nothing registers it again meanwhile).
                if let Some(c) = key_registered(a) { let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()); }
                KEYS_HELD[a.index()].store(true, Ordering::SeqCst);
                if a == keymap::Action::Accept && ACCEPT_ARMED.swap(false, Ordering::SeqCst) { let _ = gs.unregister(sc_esc()); }
                log("keys_held", json!({ "action": a.id() }));
            } else {
                KEYS_HELD[a.index()].store(false, Ordering::SeqCst);
                // Use a suggestion's keys are taken only while a result shows; the others are registered now.
                if keymap::registered_on_return(a) {
                    let got = keymap::arm(a, key_using(a), &keys_picked(), |c| gs.register(keymap::shortcut(c)).is_ok());
                    set_key_using(a, got);
                    log("keys_back", json!({ "action": a.id(), "id": got.map(keymap::id) }));
                }
            }
        }
    }
    let bit = |g: &str| groups::catalog().switches().iter().position(|k| *k == format!("{g}.on")).map_or(0, |i| 1u32 << i);
    let newly_off = now & !was;
    if newly_off & bit("voice") != 0 {
        TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset();
        voice_send(app, VoiceMsg::Cancel);
        speech_off(app);
        phelp::dismiss(app);
        errhelp::dismiss(app);
        seclook::dismiss(app);
    }
    if newly_off & bit("guide") != 0 { showme_stop(app); }
    if newly_off & bit("files") != 0 { drop_stop_all(); }
    if now != was { log("groups_applied", json!({ "off": now })); }
}

/// A real use of a tool, kept on this Mac: its id goes in the tried list (groups.tried) once. Only a tool that can be
/// tried, whose group is on, and not yet listed (groups::tried_after). Only ids are kept, never what was done.
fn mark_tried(app: &AppHandle, tool: &str) {
    let current: Vec<String> = match setting_now("groups.tried") { Value::Array(a) => a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(), _ => vec![] };
    let Some(next) = groups::tried_after(&current, tool, &group_off) else { return };
    if setting_change(app, "groups.tried", &json!(next), None).is_ok() { log("tool_tried", json!({ "tool": tool })); settings_told(app, &["groups.tried".to_string()]); }
}

/// Home says it saw a tool really used (a finished task, a Show me answer, a check that ran): the tool's id is kept as tried.
/// Only from Home, and only a tool a page can see used (the catalog's "page"); hold to talk, spoken answers, a conversion
/// and a practice are noted by the shell itself where they happen.
#[tauri::command]
fn tried_mark(app: AppHandle, window: tauri::WebviewWindow, tool: String) -> Result<(), String> {
    settings::only_card(window.label())?;
    if !groups::page_may_mark(&tool) { return Err("unknown".into()); }
    mark_tried(&app, &tool);
    Ok(())
}

/// Puts one setting, a section or everything back to its usual value, in every store. Never a protective setting in a
/// section or everything. What changes is decided from what the page was shown (settings::reset_plan), so the page names
/// each one first and keeps each one for Undo: `engine` is the engine's own settings the page has heard away from usual;
/// one it has not heard is left as it is. Only from the card.
#[tauri::command]
fn settings_reset(app: AppHandle, window: tauri::WebviewWindow, key: Option<String>, section: Option<String>, all: Option<bool>, engine: Option<Vec<String>>, project: Option<String>) -> Result<Value, String> {
    settings::card_or_settings(window.label())?;
    // `project`: the folder the page showed this reset for; another folder in Home by now means nothing is reset.
    settings::reset_project_ok(project.as_deref(), project_opt().as_deref())?;
    let which = match (key.as_deref(), section.as_deref(), all == Some(true)) {
        (Some(k), None, false) => settings::Which::Key(k),
        (None, Some(s), false) => settings::Which::Section(s),
        (None, None, true) => settings::Which::All,
        _ => return Err("unknown".into()),
    };
    let r = settings::registry();
    // A settings.json that could not be read stays as it is (nothing in it is in force, so the reset below changes
    // nothing there). One readable again holds the person's own values, which the page was never shown, so it could
    // neither name them first nor put them back with Undo: nothing is reset, every window is told what is in force now,
    // and the page asks again.
    if let Ok(true) = settings_writable(&app) { settings_told(&app, &[]); return Err("readAgain".into()); }
    let shown = settings_snapshot(&[]);
    let (none, mut problems) = (serde_json::Map::new(), Vec::<&'static str>::new());
    let plan = settings::reset_plan(r, which, shown["values"].as_object().unwrap_or(&none), shown["usual"].as_object().unwrap_or(&none), &engine.unwrap_or_default())?;
    let project = project_opt();
    let mut changed = with_settings(|s| -> Result<Vec<String>, &'static str> {
        let mut next = s.file.clone();
        let c = settings::reset(r, &mut next, which, project.as_deref())?;
        if next != s.file { settings::save(&data_dir(), &next)?; s.file = next; }
        Ok(c)
    })?;
    for k in &changed { setting_applied(&app, k); }
    if changed.iter().any(|k| r.get(k).is_some_and(settings::needs_apply)) { send_settings(&app); }
    for d in plan.iter().filter_map(|k| r.get(k)).filter(|d| d.store != "settings") {
        let done = match d.store.as_str() {
            "dock" | "presentation" => setting_change(&app, &d.key, &d.default, None).map(|_| ()),
            // The engine's own: its command with the usual value (the engine answers with its new state).
            "spending" | "memory" | "metrics" => setting_change(&app, &d.key, &d.default, None).map(|_| ()),
            "keys" => keys_to_usual(&app).map(|_| ()),
            "voice" => voice_save(&voice_now(), &voiceset::Saved::default()),
            _ => Ok(()),
        };
        match done { Ok(()) => changed.push(d.key.clone()), Err(c) => problems.push(c) }
    }
    log("settings_reset", json!({ "which": match which { settings::Which::Key(_) => "one", settings::Which::Section(_) => "section", settings::Which::All => "all" }, "changed": changed.len(), "problems": problems }));
    settings_told(&app, &changed);
    let mut v = settings_snapshot(&changed);
    v["notReset"] = json!(problems);
    Ok(v)
}

/// The choices the pages kept before the registry, read by the card with today's meaning and sent once. Only from the card.
#[tauri::command]
fn settings_migrate(app: AppHandle, window: tauri::WebviewWindow, from: String, values: Value) -> Result<Value, String> {
    settings::only_card(window.label())?;
    let values = values.as_object().cloned().ok_or("custom")?;
    settings_writable(&app)?;
    let written = with_settings(|s| -> Result<Vec<String>, &'static str> {
        let mut next = s.file.clone();
        let w = settings::migrate(settings::registry(), &mut next, &from, &values)?;
        settings::save(&data_dir(), &next)?;
        s.file = next;
        Ok(w)
    })?;
    log("settings_migrated", json!({ "from": from, "written": written.len() }));
    // A choice carried over that the engine reads too (Your turn) reaches it at once, as any other change it applies does.
    if written.iter().any(|k| settings::registry().get(k).is_some_and(settings::needs_apply)) { send_settings(&app); }
    settings_told(&app, &written);
    Ok(settings_snapshot(&written))
}

/// Settings' "Add the app in front" (Apps that count as a call, and Apps Prompt help may read): the id and name of the app
/// in front. Home is a panel that never takes the keyboard, so the app in front is the one the person was using. Only its
/// id and name are read, never anything in it (rule 7). Companion itself is refused. Only from the card.
#[tauri::command]
fn front_app(window: tauri::WebviewWindow) -> Result<Value, String> {
    settings::card_or_settings(window.label())?;
    let id = front_id();
    if id.is_empty() || id.starts_with("dev.companion") { return Err("ownApp".into()); }
    Ok(json!({ "id": id, "name": front() }))
}

/// The names of apps by their ids, for the lists in Settings (an app that is not on this Mac keeps its id). Names only.
/// Only from the card.
#[tauri::command]
fn app_names(window: tauri::WebviewWindow, ids: Vec<String>) -> Result<Value, String> {
    settings::card_or_settings(window.label())?;
    let ws = NSWorkspace::sharedWorkspace();
    let mut out = serde_json::Map::new();
    for id in ids.into_iter().take(64) {
        let name = ws.URLForApplicationWithBundleIdentifier(&objc2_foundation::NSString::from_str(&id))
            .and_then(|u| u.lastPathComponent()).map(|n| n.to_string().trim_end_matches(".app").to_string()).filter(|n| !n.is_empty());
        if let Some(n) = name { out.insert(id, json!(n)); }
    }
    Ok(Value::Object(out))
}

/// A page that has just loaded asks for the status messages it missed.
#[tauri::command]
fn replay_events(app: AppHandle) -> Vec<serde_json::Value> { app.state::<runner::Runner>().replay() }

// ---- Prompt help (M5b): the hotkey is the only way anything is read ----

// Every job's keys come from the key map (keymap.rs, the Keys section below); only the bare Esc that dismisses a result is
// fixed, and it is on no list.
fn sc_esc() -> Shortcut { Shortcut::new(None, Code::Escape) }
static ARMED: AtomicU64 = AtomicU64::new(0);

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
        let _ = gs.register(sc_esc());
        let a = app.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(90)); if ARMED.load(Ordering::SeqCst) == gen { arm_result_keys(&a, false); } });
    } else {
        ARMED.fetch_add(1, Ordering::SeqCst);
        if ACCEPT_ARMED.swap(false, Ordering::SeqCst) { if let Some(c) = key_using(accept) { let _ = gs.unregister(keymap::shortcut(c)); } }
        let _ = gs.unregister(sc_esc());
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
// Second Look's card: the same answer about reading in this app (shared with Prompt help and the error explainer), and Close.
#[tauri::command] fn sl_consent(app: AppHandle, choice: String) { seclook::consent_answer(&app, &choice); }
#[tauri::command] fn sl_dismiss(app: AppHandle) { seclook::dismiss(&app); }

#[tauri::command]
fn permissions_status() -> permissions::Permissions { permissions::current() }

/// Show the card. `keyboard` is true only when the user asked to type (hotkey or Type button);
/// clicking the character shows the card without taking the keyboard.
fn open_card(app: &AppHandle, source: &str, keyboard: bool) {
    log("card_open", json!({ "source": source, "keyboard": keyboard }));
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        HOME_CLOSE_GEN.fetch_add(1, Ordering::SeqCst);   // a close still rolling up is called off
        let was_open = HOME_OPEN.load(Ordering::SeqCst) && card_visible();
        if !was_open { HOME_OPEN.store(true, Ordering::SeqCst); HOME_GEN.fetch_add(1, Ordering::SeqCst); reset_hover(); }
        // Home opens on the display the person is using (the one with the pointer): the island goes there first.
        place_island(mtm, true, "home_opened");
        with_panels(|d, c| {
            place_card(d, c);
            // Opening (not already open): a short drop from just under the island while it fades in (island.rs home_drop),
            // unless Reduce motion or Less motion is on. A resize while it is open is never animated.
            let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
            match island::home_drop(from_appkit(c.frame(), ph), !was_open, reduce_motion()) {
                Some(start) => { let end = c.frame(); c.setAlphaValue(0.0); c.setFrame_display(to_appkit(start, ph), false); c.orderFrontRegardless(); set_frame_moving(c, end, Some(island::OPEN_SECS), Some(1.0), &CARD_MOVES); }
                None => { c.setAlphaValue(1.0); c.orderFrontRegardless(); }
            }
            if keyboard { c.makeKeyWindow(); }
            log("card_shown", json!({ "card_key": c.isKeyWindow(), "app_active": active(mtm) }));
        });
        if !was_open && home_set().click_away { watch_click_away(&a); }
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
    // A tool whose group is switched off does nothing (groups.rs): one plain line, and the engine is not even asked.
    if let Some(line) = groups::refuse_runner(&group_off, &cmd) { return Err(line.into()); }
    app.state::<runner::Runner>().send(&cmd)
}

#[tauri::command]
fn open_card_cmd(app: AppHandle) {
    open_card(&app, "button", true);
}

/// Opens the Settings window (settingswin.rs), from Home or the island, on the person's press. The one window a click
/// gives the keyboard to: the person asked for it (rule 9 is about never taking it unasked). A second call brings the open
/// one to the front.
#[tauri::command]
fn open_settings_window(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    settingswin::may_open(window.label())?;
    let a = app.clone();
    let _ = app.run_on_main_thread(move || settings_window_now(&a));
    Ok(())
}

/// Makes the Settings window, or shows the one already open. Main thread.
fn settings_window_now(app: &AppHandle) {
    let open = app.get_webview_window(settingswin::LABEL);
    match settingswin::open(open.is_some()) {
        settingswin::Open::Focus => { if let Some(w) = open { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); } }
        settingswin::Open::Make => {
            let made = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(settingswin::PAGE.into()))
                .title(settingswin::TITLE)
                .inner_size(settingswin::SIZE.0, settingswin::SIZE.1)
                .min_inner_size(settingswin::MIN.0, settingswin::MIN.1)
                .resizable(true)
                .decorations(true)
                .center()
                .focused(true)
                .build();
            match made { Ok(w) => { let _ = w.set_focus(); log("settings_window_opened", json!({})); } Err(e) => log("settings_window_failed", json!({ "why": e.to_string() })) }
        }
    }
}

/// The Settings page's own Close button.
#[tauri::command]
fn close_settings_window(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    settingswin::may_close(window.label())?;
    if let Some(w) = app.get_webview_window(settingswin::LABEL) { let _ = w.close(); }
    Ok(())
}

/// Clicking the character shows or hides Home, and never takes the keyboard.
#[tauri::command]
fn toggle_card(app: AppHandle) { toggle_home(app, "character"); }

/// Clicking the island in the notch does the same (F18).
#[tauri::command]
fn island_click(app: AppHandle) { toggle_home(app, "island"); }

/// Home rolls back up into the notch as it closes (style.css .home.closing, the reverse of its opening), then its panel goes.
/// At once with Reduce motion or Less motion. Must match style.css home-roll-up (motion.test.ts checks).
const HOME_CLOSE_MS: u64 = 200;
/// Bumped by every opening and every close asked, so a close that waits never hides a Home opened again meanwhile.
static HOME_CLOSE_GEN: AtomicU64 = AtomicU64::new(0);
/// Closes Home after its page has rolled it up (Close, Esc, the island or the character clicked again). Main thread.
fn close_home_rolled(a: &AppHandle, extra: Value) {
    let gen = HOME_CLOSE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let go = move |extra: Value| { with_panels(|_, c| c.orderOut(None)); home_closed(); log("card_closed", extra); };
    if reduce_motion() || !card_visible() { go(extra); return; }
    let _ = a.emit_to("card", "closing", json!({}));
    let a2 = a.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(HOME_CLOSE_MS));
        let _ = a2.run_on_main_thread(move || if HOME_CLOSE_GEN.load(Ordering::SeqCst) == gen && card_visible() { go(extra) });
    });
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

/// The card page tells us how tall its content is; we resize the panel to fit.
#[tauri::command]
fn resize_card(app: AppHandle, height: f64) {
    let hs = home_size();
    let h = height.clamp(hs.min_h, hs.max_h);
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
fn list_projects() -> Vec<String> { projects::load(&projects_path()).checked(&home_dir(), &data_dir()).still_there() }

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
    project_now(&app, &folder);
    Ok(folder)
}
/// The project folder changed (`folder`, or "" for none): every page is told, and this project's own settings go to the
/// engine (the line names the folder) and to the pages (T16). The one place that says so.
fn project_now(app: &AppHandle, folder: &str) {
    log("project_changed", json!({ "none": folder.is_empty() }));
    let _ = app.emit("project-changed", folder);
    send_settings(app);
    settings_told(app, &[]);
}

/// Saves the person's own key into the Keychain. The page clears its box right after; nothing here is ever logged.
#[tauri::command]
fn save_api_key(app: AppHandle, key: String) -> Result<(), String> {
    keystore::save(&key, &data_dir())?;
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
    keystore::remove_with(window.label(), &confirm, || keystore::delete_item(&svc, keystore::ACCOUNT), || !keystore::gone(&svc, keystore::ACCOUNT))?;
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
    app.state::<runner::Runner>().send(&cmd).map_err(|_| concat!(crate::product_s!(), " engine is not running. Try again in a moment.").to_string())
}

/// One new folder at a time (two presses at once never race for the same name).
static NEW_FOLDER: Mutex<()> = Mutex::new(());
/// Make something with no project open (F23, M14 Part 1; newfolder.rs): Home's ask box sends project.new on the person's
/// press. A new empty folder is made for it, named after the request, in the place Settings names (make.folder), chosen as
/// the project, and the engine is sent an ordinary drive.plan or research.ask for it, checked like one from a page. Nothing
/// is made when that tool is switched off. Returns the new folder.
#[tauri::command]
fn start_in_new_folder(window: tauri::WebviewWindow, app: AppHandle, cmd: Value) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let req = newfolder::check(&cmd)?;
    // A tool whose group is switched off does nothing, and no folder is made for it (groups.rs).
    if let Some(line) = groups::refuse_runner(&group_off, &newfolder::task_command(&req, "")) { return Err(line.into()); }
    let made = {
        let _g = NEW_FOLDER.lock().unwrap_or_else(|x| x.into_inner());
        let (home, data) = (PathBuf::from(home_dir()), data_dir());
        let mut known = projects::load(&projects_path()).recent;
        known.push(current_project());
        let name = newfolder::folder_name(&req.request, req.kind, req.off);
        newfolder::make(&home, setting_now("make.folder").as_str().unwrap_or(""), &name, &data, &known, practice::taken(&data))?
    };
    log("new_folder_made", json!({ "kind": req.kind.as_str() }));
    let folder = use_project_inner(app.clone(), made.to_string_lossy().to_string())?;
    let task = newfolder::task_command(&req, &folder);
    runner::check_command(&task)?;
    runner::check_project(&task, &current_project())?;
    app.state::<runner::Runner>().send(&task).map_err(|_| concat!("Your new folder is made and open, but ", crate::product_s!(), " engine is not running. Press the button again in a moment.").to_string())?;
    Ok(folder)
}

// ---------- What Squibby made (M14, made.rs): list, open, show in Finder, move to the Trash ----------

/// The folder for all of them (newfolder.rs), worked out from the setting every time and never taken from a page, with the real
/// home folder it is under. The folder may not exist yet.
fn made_parent() -> Result<(PathBuf, PathBuf), String> {
    newfolder::parent_of(std::path::Path::new(&home_dir()), setting_now("make.folder").as_str().unwrap_or(""))
}
/// What Squibby made, newest first: names, dates and rough sizes only, never what is in a file. `busy`: the page knows a task
/// works or waits; the shell knows too (updates::running_now), and either one makes every folder wait. Counted off the main
/// thread, since a big folder takes a moment.
#[tauri::command]
async fn list_made(window: tauri::WebviewWindow, busy: bool) -> Result<Value, String> {
    settings::card_or_settings(window.label())?;   // only Home, on the person's press
    let (home, parent) = made_parent()?;
    let (current, busy) = (current_project(), busy || updates::running_now());
    tauri::async_runtime::spawn_blocking(move || {
        let l = made::list(&parent, &current, busy)?;
        Ok(json!({ "where": made::where_words(&home, &parent), "busy": busy, "folders": l.rows.iter().map(made::Row::to_json).collect::<Vec<_>>(), "more": l.more }))
    }).await.map_err(|_| "The list could not be read.".to_string())?
}
/// Open as project: a folder from the list becomes the project (checked like any folder: projects::validate).
#[tauri::command]
fn open_made(window: tauri::WebviewWindow, app: AppHandle, name: String, busy: bool) -> Result<String, String> {
    settings::card_or_settings(window.label())?;   // only Home, on the person's press
    let (_, parent) = made_parent()?;
    let path = made::open_path(&parent, &name, busy || updates::running_now())?;
    use_project_inner(app, path.to_string_lossy().to_string())
}
/// Show in Finder: a folder from the list, selected in its place.
#[tauri::command]
fn reveal_made(window: tauri::WebviewWindow, name: String) -> Result<(), String> {
    settings::card_or_settings(window.label())?;   // only Home, on the person's press
    let (_, parent) = made_parent()?;
    let path = made::open_path(&parent, &name, false)?;
    std::process::Command::new("/usr/bin/open").arg("-R").arg(&path).env_clear().env("PATH", "/usr/bin:/bin").stdin(std::process::Stdio::null()).spawn().map(|_| ()).map_err(|_| "Finder could not be opened.".to_string())
}
/// Move to the Trash, after the person confirmed it (`git`: and, for a folder with git history, confirmed that too). Only a
/// folder from the list, never the project open now, never while a task works or waits (made::trash). The Mac's own Trash, so
/// it can be put back; nothing is deleted. Then it leaves the recent folders. Its undo points stay in Companion's own folder.
#[tauri::command]
fn trash_made(window: tauri::WebviewWindow, app: AppHandle, name: String, git: bool, busy: bool) -> Result<String, String> {
    settings::card_or_settings(window.label())?;   // only Home, on the person's press
    let moved = {
        let _g = NEW_FOLDER.lock().unwrap_or_else(|x| x.into_inner());   // never while a new folder is being made
        let (_, parent) = made_parent()?;
        made::trash(&parent, &name, &current_project(), busy || updates::running_now(), git, move_to_trash)?
    };
    log("made_trashed", json!({ "git": git }));
    forget_folder(&app, &moved);
    Ok(name)
}

/// The Memory tab's shared files row (M14, sharedfiles.rs): is the project open now a folder Squibby made, and what is the state
/// of AGENTS.md and CLAUDE.md in it? The folder for all of them and the project both come from here, never from the page.
#[tauri::command]
fn shared_files_state(window: tauri::WebviewWindow) -> Result<Value, String> {
    settings::only_card(window.label())?;   // only Home
    let (_, parent) = made_parent()?;
    Ok(sharedfiles::shared_files(&parent, &current_project()).to_json())
}

#[tauri::command]
fn close_card(app: AppHandle) {
    card_closed_hush(&app);   // closing the card silences it (home_closed gives back the keys Prompt help borrowed)
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().unwrap();
        close_home_rolled(&a, json!({ "app_active": active(mtm) }));
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
    DIAGRAM_KEPT.store(false, std::sync::atomic::Ordering::SeqCst);
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
    seclook::dismiss(app);   // so is an answer Second Look was reading
    drop_stop_all();         // a file being converted (F19): the tool is ended and nothing half made is kept
    let a = app.clone(); std::thread::spawn(move || arm_result_keys(&a, false));
    showme_stop_rest(app);
}
fn showme_stop_rest(app: &AppHandle) {
    speech_off(app); point_cancel();
    // Counted at once: the Cancel waits behind whatever hold to talk is doing (the light's wait, a slow microphone, the words
    // being turned into text), and the worker looks at this count after each of those.
    VOICE_STOPS.fetch_add(1, Ordering::SeqCst);
    voice_send(app, VoiceMsg::Cancel); hide_overlay(app); showme_pending().end(); roam_end(app);
}

/// The hotkey or the button: look at the screen once (light first), cover secrets, and ask the engine where to click.
/// `all_screens`: the person's setting to include every display, not only the one under the pointer (off unless turned on).
#[tauri::command]
/// `settle`: a walkthrough step after a click, so the look first waits (bounded, under the light, Stop ends it) for the page
/// to stop changing (showme::wait_to_settle). The page asks for it only when its settings say so (anywhere.ts waitsForPage).
/// `mode`: an everyday stuck moment's look (everyday.rs): "everyday" or "recheck"; anything else is an ordinary question.
/// `before`: with "recheck", the spreadsheet error code the first look read (only one of the table's codes).
fn showme_start(app: AppHandle, question: String, all_screens: Option<bool>, settle: Option<bool>, mode: Option<String>, before: Option<String>) {
    let mode = everyday::mode(mode.as_deref());
    let before = everyday::before_code(before.as_deref());
    // Nothing of Companion can be seen (hidden, with Home closed): the light could not be seen either, so nothing is looked
    // at, not even a lesson's next step (rule 5: a walkthrough looks again only while it is visibly on).
    if light_unseen() { log("showme_hidden", json!({})); say_showme(&app, "error", showme::HIDDEN_WORDS, json!({})); return; }
    // A new question replaces whatever ring was up (and any pointing still on its way); what an older answer saw is forgotten.
    point_cancel(); hide_overlay(&app); showme_pending().end();
    let question = question.split_whitespace().collect::<Vec<_>>().join(" ");
    if question.is_empty() { say_showme(&app, "error", "Type what you want to find, then press Show me.", json!({})); return; }
    // Stop everything (or a newer press) moves this on: a look already under way must not send its picture afterwards.
    let gen = POINT_GEN.load(std::sync::atomic::Ordering::SeqCst);
    let current = move || POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) == gen;
    // Only the id of the app in front, read on this press (as Prompt help does), so the engine can answer as a tutor for an
    // everyday app (showme.everydayTutor). Nothing in the app is read. An everyday look (a mode) has its own instructions
    // and carries no id: Companion's code knows the app in front of the stuck key only by its kind (everyday.rs app_for).
    let front = everyday::app_for(mode, front_id);
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
                let _ = a2.state::<runner::Runner>().send(&showme::with_project(everyday::with_mode(showme::locate_command(&req2, q, pics, cands, &front), mode, before), &current_project()));
            }),
            Box::new(move |on| { if !on { return; } say_showme(&a3, "looking", "Looking at your screen", json!({})); std::thread::sleep(Duration::from_millis(250)); /* the light is on screen before the capture */ }),
        );
        // Stop everything or a newer press after the light came on, or Companion hidden meanwhile: no picture is taken (and a
        // wait for the page ends).
        let plat = plat.while_wanted(Box::new(move || current() && !light_unseen())).settling(settle.unwrap_or(false));
        if !plat.screen_recording_granted() {
            // Asked here, the first time the feature is used, with a plain sentence first.
            macos_see::request_screen_recording();
            say_showme(&app, "needs_permission", concat!("Allow Screen Recording for ", crate::product!(), " in System Settings, then press Show me again. macOS may ask you to reopen ", crate::product!(), "."), json!({}));
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
            Err(showme::Refusal::NeedsScreenRecording) => say_showme(&app, "needs_permission", concat!("Allow Screen Recording for ", crate::product!(), " in System Settings, then press Show me again."), json!({})),
            Err(showme::Refusal::SecureInput) => say_showme(&app, "error", "A password box is active, so I did not look at your screen. Click away from it and try again.", json!({})),
            Err(showme::Refusal::CaptureFailed(e)) => say_showme(&app, "error", &format!("I could not look at your screen ({e})."), json!({})),
            Err(showme::Refusal::PictureFailed(e)) => say_showme(&app, "error", &format!("I could not prepare the picture ({e})."), json!({})),
            // Stop everything or a newer question already said what happens next: nothing more is said. Still current, it
            // was ended because Companion was hidden meanwhile, and the person is told why.
            Err(showme::Refusal::Stopped) => { if current() { say_showme(&app, "error", showme::HIDDEN_WORDS, json!({})); } }
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
/// The ring is clipped to `under`, the window under the target, which the caller looked up once (`anchor_for`) and also
/// used to decide whether a guess is said in words only (point.guesses), so the two can never disagree. What it belongs
/// to (that window, or with none the app in front) is handed back so the caller can watch it (`your_turn` for a ring that
/// waits for a click, `watch_ring` for one that does not), with how long a ring that does not wait stays (How long a ring
/// stays, point.ringSeconds).
#[allow(clippy::too_many_arguments)]
fn draw_pointer_with(app: &AppHandle, d: coords::R, rect: coords::R, caption: &str, exact: bool, hold: bool, look: Look, under: Option<anchor::Anchor>, point: u64) -> Option<(anchor::Watched, u64)> {
    // The overlay takes a ring that does not wait away this long after this order (the flight included; it is sent the
    // same number); the watch and this busy time last half a second longer, so confetti never plays over it and no part
    // of it goes unwatched.
    // `point`: the pointer number the caller claimed for this ring. Stop everything or a newer pointer since then (a caller
    // off the main thread) means nothing is set, drawn or said (None). It is checked before the busy time is set and again
    // after, since Stop may reset that time in between; then only this ring's busy time is taken back.
    if POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) != point { return None; }
    let ring = anchor::ring_ms(&setting_now("point.ringSeconds"));
    let until = if hold { u64::MAX } else { now() as u64 + anchor::watch_ms(ring) };
    OVERLAY_BUSY_UNTIL.store(until, std::sync::atomic::Ordering::SeqCst);
    if POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) != point {
        let _ = OVERLAY_BUSY_UNTIL.compare_exchange(until, 0, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst);
        return None;
    }
    DIAGRAM_KEPT.store(false, std::sync::atomic::Ordering::SeqCst);   // a ring is never replaced by a new picture
    let a = app.clone();
    let caption2 = caption.to_string();
    let watched = anchor::watched_for(under, front_pid());
    // Rule 22: a solid ring only where the window it sits in is confirmed. Over a menu, a dialog or anything that is not
    // an ordinary window the ring is soft and says it is a guess.
    let exact = showme::solid(exact, watched.window().is_some());
    let clip = watched.window().map(|an| json!({ "x": an.bounds[0] - d.x, "y": an.bounds[1] - d.y, "w": an.bounds[2], "h": an.bounds[3] }));
    let anchored = watched.window().cloned();
    // The overlay only listens (its capability), so it is given the settings in force with the pointer (the motion, and
    // the ring's colour, lettering and pace).
    let settings = settings_snapshot(&[]);
    let _ = app.run_on_main_thread(move || {
        if POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) != point { return; }
        let mtm = MainThreadMarker::new().unwrap();
        let primary_h = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        // The flight starts at the last target of the same answer on this display, or else where the character is now,
        // read before it sets off: it follows the arrow to the window.
        let here = roam::arrow_start(with_panels(|dock, _| from_appkit(dock.frame(), primary_h)), (d.x + d.w - 40.0, d.y + d.h / 2.0));
        let from = look.from.filter(|p| d.contains(*p)).map(|p| (p.x, p.y)).unwrap_or(here);
        // The character comes beside the window the ring is in (F18 item 2); a ring with no confirmed window leaves it home.
        roam_to(&a, mtm, anchored.as_ref(), [rect.x, rect.y, rect.w, rect.h]);
        let payload = json!({ "rect": { "x": rect.x - d.x, "y": rect.y - d.y, "w": rect.w, "h": rect.h }, "from": { "x": from.0 - d.x, "y": from.1 - d.y }, "caption": caption2, "exact": exact, "hold": hold, "clip": clip,
            "mark": look.mark, "flyMs": look.fly_ms.map(|v| v.clamp(300, 1600)), "fadeMs": look.fade_ms.map(|v| v.clamp(1000, 12_000)), "ringMs": ring, "settings": settings });
        let ak = coords::rect_to_appkit(d, primary_h);
        OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setFrame_display(NSRect::new(NSPoint::new(ak.x, ak.y), NSSize::new(ak.w, ak.h)), true); p.orderFrontRegardless(); } });
        let _ = a.emit_to("overlay", "overlay-point", payload);
    });
    Some((watched, ring))
}

/// What the person is told when a ring went away because its window changed (moved, closed, covered, another app in front).
const RING_WINDOW_CHANGED: &str = "The window changed, so I took the ring away. Press Show me where to point again.";

/// A ring that does not wait for a click (a step in the middle of a multi step answer, Point at the problem's line or
/// error) is watched while it is up, like the your turn ring: if its window moves, closes, is covered or another app comes
/// to the front, it goes away at once and the page is told (rule 22). It stops by itself when a newer ring, Stop or Esc
/// takes it away, or after the ring's own time (`ring`) and half a second. Window owners and sizes only, no permission,
/// never content.
fn watch_ring(app: &AppHandle, target: coords::R, an: anchor::Watched, ring: u64, showme_req: Option<String>) {
    use std::sync::atomic::Ordering::SeqCst;
    let gen = POINT_GEN.load(SeqCst);
    let alive = move || POINT_GEN.load(SeqCst) == gen && overlay_busy();
    let app = app.clone();
    std::thread::spawn(move || {
        let c = target.center();
        let polls = anchor::watch_polls(ring);
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
/// Async: snapping asks the app under the point through Accessibility, which a busy app can hold for seconds, so this runs
/// on the thread pool, never on the main thread (the hotkeys, Stop everything, the island and Home live there).
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
fn showme_aim(app: AppHandle, req: String, x: f64, y: f64, ocr_id: Option<String>, target_text: String, caption: String, mark: Option<String>, screen: Option<u32>, step: Option<u32>, of: Option<u32>, hold: Option<bool>, fly_ms: Option<u64>, fade_ms: Option<u64>) -> Value {
    use std::sync::atomic::Ordering::SeqCst;
    let last = showme::is_last(step, of);
    let hold = hold.unwrap_or(true) && last;
    // Stop everything, a newer question or Point at the problem can come in while this aims (off the main thread): noted
    // now, so the ring is drawn only if none did.
    let asked = POINT_GEN.load(SeqCst);
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
    // Claimed in one step: a point_problem still on its way must not draw over this, and a Stop, a newer question or a
    // point_problem since the aim began means this one is gone and nothing is drawn.
    if POINT_GEN.compare_exchange(asked, asked + 1, SeqCst, SeqCst).is_err() {
        log("showme_aim_gone", json!({}));
        showme_pending().end_if(&req);
        return json!({ "ok": false, "why": "gone" });
    }
    // When Companion is only guessing (point.guesses), words only: nothing is drawn, the page says where to look. What was
    // seen is kept for the steps after this one (as a step said in words below the confidence line), and an earlier step's
    // ring goes. A confirmed target is drawn either way, and a guess is never drawn solid.
    let under = anchor_for(s.rect);   // looked up once: the words only choice and the ring both read this
    if showme::said_in_words(s.exact, under.is_some(), &setting_now("point.guesses")) {
        log("showme_guess_in_words", json!({ "step": step, "of": of }));
        turn_cancel(); hide_overlay(&app);
        return json!({ "ok": false, "why": "guess" });
    }
    if !last { showme_pending().pointed(&req, s.rect.center()); }
    log("showme_aimed", json!({ "how": format!("{:?}", s.how), "exact": s.exact, "step": step, "of": of, "screen": screen.unwrap_or(1) }));
    let look = Look { mark: showme::mark_name(mark.as_deref()), fly_ms, fade_ms, from: if step.unwrap_or(1) > 1 { from } else { None } };
    let Some((watched, ring)) = draw_pointer_with(&app, display, s.rect, &caption, s.exact, hold, look, under, asked + 1) else {
        // Stop everything or a newer question came in after the claim (while the window was looked up): nothing drawn.
        log("showme_aim_gone", json!({}));
        showme_pending().end_if(&req);
        return json!({ "ok": false, "why": "gone" });
    };
    // The ring goes away the moment its window changes (or, with no window under it, another app comes to the front): the
    // last step's while it waits for the click, the others while they are up.
    if hold { your_turn(&app, display, s.rect, &target_text, asked + 1); } else { watch_ring(&app, s.rect, watched, ring, Some(req.clone())); }
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
/// read, only while the ring is up (no permission needed, never keys, never screen content). `point`: the pointer number
/// the ring was drawn for; Stop everything or a newer pointer since then (a caller off the main thread) means no wait.
fn your_turn(app: &AppHandle, display: coords::R, target: coords::R, label: &str, point: u64) {
    turn_cancel();
    *TURN.lock().unwrap_or_else(|e| e.into_inner()) = Some((target, label.to_string()));
    let gen = TURN_GEN.load(std::sync::atomic::Ordering::SeqCst);
    // Stop bumps the pointer number before the ring's: one that came before this point is seen here, one after it ends
    // the wait below.
    if POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) != point { turn_cancel(); return; }
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
        // How long it waits for the click (point.yourTurnSeconds, usual 90 s), read as the ring goes up. The mouse is read
        // only inside this loop, while the ring is up.
        let wait = yourturn::wait_ms(&setting_now("point.yourTurnSeconds"));
        while alive() && t0.elapsed().as_millis() < wait as u128 {
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
                    // The overlay only listens (its capability), so it is given the settings in force with the event.
                    let _ = app.emit_to("overlay", "overlay-celebrate", json!({ "rect": r, "settings": settings_snapshot(&[]) }));
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
/// sends, pays, deletes, publishes, signs in or connects an account: the label is checked again on the real element at the
/// moment of pressing.
#[tauri::command]
fn do_it_for_me(app: AppHandle) {
    let Some((target, label)) = TURN.lock().unwrap_or_else(|e| e.into_inner()).clone() else { return };
    let gen = TURN_GEN.load(std::sync::atomic::Ordering::SeqCst);
    // Off the main thread: an app that is not answering can hold Accessibility for seconds, and Stop must still work.
    std::thread::spawn(move || {
        const SELF: &str = "This one signs in, sends, pays, deletes, publishes, connects an account or answers a question, so please click it yourself.";
        if yourturn::risky(&label) { say_showme(&app, "your_turn_miss", SELF, json!({})); return; }
        if !ax::trusted(false) {
            ax::trusted(true);
            say_showme(&app, "needs_permission", concat!("To click for you, ", crate::product!(), " needs Accessibility. Allow it in System Settings, then press Do it for me again. Or click it yourself."), json!({}));
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

/// The version the last check found ready to install, for the island's status (island_state). Only a version number.
static UPDATE_READY: Mutex<Option<String>> = Mutex::new(None);

/// Is the updater set up in this build, and which version is running.
#[tauri::command]
fn update_status(app: AppHandle) -> Value { json!({ "configured": updates::parse_config(include_str!("../updater.json")).is_some(), "version": app.package_info().version.to_string() }) }

/// Asks the update address whether a newer version exists. Only when the person asked (or turned on the daily check).
#[tauri::command]
async fn check_update(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    if settings::card_or_settings(window.label()).is_err() { return Err("Updates can only be started from the card.".into()); }
    let cfg = updates::parse_config(include_str!("../updater.json")).ok_or("Updates are not set up in this build yet.")?;
    let url = tauri::Url::parse(&cfg.endpoint).map_err(|_| "Updates are not set up in this build yet.".to_string())?;
    let upd = app.updater_builder().pubkey(cfg.pubkey).timeout(Duration::from_secs(20)).endpoints(vec![url]).map_err(|e| updates::failure_words(&e.to_string()).to_string())?
        .build().map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    match upd.check().await {
        Ok(Some(u)) => {
            let out = json!({ "available": true, "version": u.version, "notes": u.body.clone().unwrap_or_default().chars().take(600).collect::<String>() });
            // Every window is told (Home's notice with Install, the island's status), and the island can ask when it loads.
            *UPDATE_READY.lock().unwrap_or_else(|e| e.into_inner()) = Some(u.version.clone());
            let _ = app.emit("update-ready", json!({ "version": u.version }));
            *PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(u);
            log("update_found", json!({}));
            Ok(out)
        }
        Ok(None) => {
            *PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()) = None;
            *UPDATE_READY.lock().unwrap_or_else(|e| e.into_inner()) = None;
            let _ = app.emit("update-ready", Value::Null);
            Ok(json!({ "available": false }))
        }
        Err(e) => { log("update_check_failed", json!({})); Err(updates::failure_words(&e.to_string()).to_string()) }
    }
}

/// Downloads the update found by check_update, checks its signature, installs it and restarts. Only on a press.
#[tauri::command]
async fn install_update(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if settings::card_or_settings(window.label()).is_err() { return Err("Updates can only be started from the card.".into()); }
    // Never while something runs: the restart would cut it off. The page asks first (updates.ts installAllowed); this is
    // the backstop, before the update is taken, so it can still be installed once the task is done.
    if updates::running_now() { return Err(updates::BUSY_WORDS.into()); }
    // One install at a time (the card and Settings both have an Install). The guard lets go on every way out, errors too.
    let Some(_flight) = updates::INSTALLING.try_start() else { return Err(updates::INSTALLING_WORDS.into()) };
    // Only a copy is used: if the download fails (the Wi-Fi drops), the found update stays, so Install can be pressed again.
    let u = PENDING_UPDATE.lock().unwrap_or_else(|e| e.into_inner()).clone().ok_or("Check for updates first.")?;
    let bytes = u.download(|_, _| {}, || {}).await.map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
    // A task may have started during a long download: the restart would cut it off, so it waits for another press.
    if updates::running_now() { return Err(updates::BUSY_WORDS.into()); }
    u.install(bytes).map_err(|e| updates::failure_words(&e.to_string()).to_string())?;
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

/// Quiet during calls: a known call app is in front (and, once verified, a camera is in use, or another app uses a
/// microphone). Only the front app's id (and whether a camera or another app's microphone is on) is looked at, and only at
/// the moment something would be said or a reaction would play.
fn quiet() -> bool { presentation::quiet_with(&presentation_now(), &presentation::call_apps_from(&setting_now("calls.apps")), &front_id(), || presentation::CAMERA_CHECK_ON && presentation::mac::camera_in_use(), || presentation::MIC_CHECK_ON && presentation::mac::mic_in_use_by_another_app()) }

/// Settings: hide from screen sharing and quiet during calls (the registry's sharing.hide and calls.quiet), kept in
/// `presentation.json` in Companion's own folder as before, applied at once. Changed only through settings_set.
fn presentation_set(app: &AppHandle, s: presentation::Settings) -> Result<(), &'static str> {
    logfile::write_atomic(&presentation_path(), presentation::to_json(&s).to_string().as_bytes()).map_err(|_| "notSaved")?;
    *PRESENTATION.lock().unwrap_or_else(|e| e.into_inner()) = Some(s);
    let _ = app.run_on_main_thread(move || apply_sharing(&s));
    if s.quiet_on_calls && quiet() { speech_off(app); }
    Ok(())
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
    if settings::card_or_settings(window.label()).is_err() { return Err("Speaking can only be started from the card.".into()); }
    let line = if whole == Some(true) { speak::prepare_reply(&text, rest.as_deref().unwrap_or("")) } else { speak::prepare(&text) };
    let Some(line) = line else { return Ok(json!({ "said": false, "why": "nothing" })) };
    // The person is talking: the line is dropped, its words stay on the card.
    if listening_now() { log("speak_listening", json!({})); return Ok(json!({ "said": false, "why": "listening" })); }
    // Quiet during calls (rule 7): nothing is said while a call app is in front (presentation.rs).
    if quiet() { log("speak_quiet", json!({})); return Ok(json!({ "said": false, "why": "quiet" })); }
    let sound = sound_reading();
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
    if whole.is_some() { mark_tried(&app, "speak"); }   // an answer really said out loud; the voice sample in Settings sends no `whole`, so trying a voice is not a use
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

/// The microphones and the sound, read from Core Audio off the main thread (voiceset::Recent): Core Audio can stall just
/// after the Mac wakes or while Bluetooth headphones connect, and every panel shares the main thread, so a slow read gives
/// the last answer instead of a beachball. The sound counts as on when nothing is known (it is never claimed off without a
/// reading); no microphone is listed when nothing is known yet.
const CORE_AUDIO_WAIT: Duration = Duration::from_millis(300);
/// The microphones, the Mac's default and those that cannot hear now (the Mac's own with the lid closed), read together.
static MIC_LIST: voiceset::Recent<(Vec<voiceset::Input>, Option<String>, Vec<String>)> = voiceset::Recent::new();
static SOUND_NOW: voiceset::Recent<voiceset::Sound> = voiceset::Recent::new();
fn mics_now() -> (Vec<voiceset::Input>, Option<String>, Vec<String>) { MIC_LIST.read(CORE_AUDIO_WAIT, || (Vec::new(), None, Vec::new()), voice_mac::mics) }
fn inputs_now() -> (Vec<voiceset::Input>, Option<String>) { let (inputs, default_id, _) = mics_now(); (inputs, default_id) }
fn sound_reading() -> voiceset::Sound { SOUND_NOW.read(CORE_AUDIO_WAIT, || voiceset::Sound::On, speak::mac::sound_now) }

fn voice_state(set: &voiceset::Saved, voices: &[voiceset::VoiceInfo]) -> Value {
    // With the lid closed, Settings names the microphone that will really listen (voiceset::state_json).
    let (inputs, default_id, quiet) = mics_now();
    voiceset::state_json(set, voices, &speak::mac::mac_language(), &inputs, default_id.as_deref(), sound_reading(), &quiet)
}

/// Settings: the Mac's voices and microphones, what is picked, what is away, and whether the sound is on. Only from the
/// card. A sync command, so it runs on the main thread, where the voice list is read. Reads names only; nothing listens.
#[tauri::command]
fn voice_settings(window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::card_or_settings(window.label()).is_err() { return Err("not_card".into()); }
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
fn set_voice_settings(app: AppHandle, window: tauri::WebviewWindow, voice: Option<String>, speed: f64, mic: Option<String>, language: String) -> Result<Value, String> {
    if settings::card_or_settings(window.label()).is_err() { return Err("not_card".into()); }
    let voices = speak::mac::voices();
    let (inputs, _) = inputs_now();
    let before = voice_now();
    let ask = voiceset::Ask { voice: voice.as_deref(), speed, mic: mic.as_deref(), language: &language };
    let next = voiceset::apply(&before, &ask, &voices, &inputs).map_err(|c| { log("voice_not_set", json!({ "why": c })); c.to_string() })?;
    voice_save(&before, &next).map_err(|_| "not_saved".to_string())?;
    // Whether each was picked, never which voice or microphone.
    log("voice_set", json!({ "voice": next.voice.is_some(), "speed": next.speed, "mic": next.mic.is_some(), "language": next.language }));
    settings_told(&app, &["talk.voice".to_string()]);
    Ok(voice_state(&next, &voices))
}
/// Keeps the voice settings in voice.json (Settings, and Reset and Undo through the registry).
fn voice_save(before: &voiceset::Saved, next: &voiceset::Saved) -> Result<(), &'static str> {
    let _ = std::fs::create_dir_all(data_dir());
    logfile::write_atomic(&voice_path(), voiceset::to_json(next).to_string().as_bytes()).map_err(|_| "notSaved")?;
    if next.mic != before.mic { *MIC_NOTE.lock().unwrap_or_else(|e| e.into_inner()) = voiceset::MicNote::new(); }
    *VOICE_SET.lock().unwrap_or_else(|e| e.into_inner()) = Some(next.clone());
    Ok(())
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
        let mut v = wipe::inventory(std::path::Path::new(&home_dir()), &data_dir(), key_saved(), &projects);
        // How many practice copies Delete everything could also move to the Trash (only when the person ticks that line).
        v["practiceCopies"] = json!(practice::copies(&practice_record().0, std::path::Path::new(&home_dir())).len());
        v
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
    tauri::async_runtime::spawn_blocking(write_support_log).await.map_err(|_| "The export stopped.".to_string())?
}

fn cmd_out(c: &str, a: &[&str]) -> String { std::process::Command::new(c).args(a).output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default() }

/// Report a problem (Settings, report.rs): saves the same support log as export_logs and shows it in Finder, then opens an
/// email draft (or the report page set in report.json) with only Companion's version and the Mac's version filled in. The
/// subject and words are the page's own (strings.ts), with {version} and {macos} filled in here. Only from Home, only on the
/// person's press. Nothing is sent: the person attaches the file and sends it themselves. Returns the saved file's name.
#[tauri::command]
async fn report_problem(window: tauri::WebviewWindow, subject: String, body: String) -> Result<String, String> {
    if settings::card_or_settings(window.label()).is_err() { return Err(concat!("A report can only be started from ", crate::product_s!(), " own window.").into()); }
    let cfg = report::parse_config(include_str!("../report.json"));
    // The words are checked before anything is written, so a refusal leaves nothing behind.
    report::address(&cfg, &subject, &body, "0", "0")?;
    tauri::async_runtime::spawn_blocking(move || {
        let name = write_support_log()?;
        let to = report::address(&cfg, &subject, &body, env!("CARGO_PKG_VERSION"), &cmd_out("/usr/bin/sw_vers", &["-productVersion"]))?;
        let ok = std::process::Command::new("/usr/bin/open").arg(&to).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success());
        log("report_opened", json!({ "ok": ok, "page": !cfg.page.is_empty() }));
        if ok { Ok(name) } else { Err(format!("The log was saved as {name} in your Downloads folder, but no email or report page could be opened. Send the file to the person running the beta yourself.")) }
    }).await.map_err(|_| "The report stopped.".to_string())?
}

/// The support log itself (blocking): written to Downloads under a new name and shown in Finder. Returns its file name.
fn write_support_log() -> Result<String, String> {
        let (home, data) = (home_dir(), data_dir());
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
}

// ---------- the practice projects (practice.rs, app/sample/practices.json) ----------

fn practice_path() -> PathBuf { data_dir().join("practice.json") }
/// One change to the practice record at a time (a read, a change, a write).
static PRACTICE: Mutex<()> = Mutex::new(());
fn today() -> String { let d = cmd_out("/bin/date", &["+%Y-%m-%d"]); if d.len() == 10 { d } else { "1970-01-01".into() } }
/// The record as it is on disk, checked (a damaged file reads as empty, and the page says so once).
fn practice_record() -> (practice::Record, bool) {
    let (r, damaged) = practice::Record::parse(std::fs::read_to_string(practice_path()).ok().as_deref(), std::path::Path::new(&home_dir()));
    practice::keep_damaged(&practice_path(), damaged);   // a row it did not understand is kept aside before the next save drops it
    (r, damaged)
}
fn save_practice(r: &practice::Record) -> Result<(), String> {
    let _ = std::fs::create_dir_all(data_dir());
    logfile::write_atomic(&practice_path(), r.to_text().as_bytes()).map_err(|_| "Could not save your practice progress.".to_string())
}
fn practice_source(e: &practice::Entry) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|_| "Could not find the practice project.".to_string())?;
    practice::source_of(&e.folder, &exe, std::env::var("COMPANION_SAMPLE_DIR").ok().as_deref()).ok_or("The practice project is missing from this copy of the app.".to_string())
}
/// The Mac's own Trash (NSFileManager), so a removed copy can always be put back from there. Nothing is deleted outright.
fn move_to_trash(p: &std::path::Path) -> Result<(), String> {
    use objc2_foundation::{NSFileManager, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(&p.to_string_lossy()));
    NSFileManager::defaultManager().trashItemAtURL_resultingItemURL_error(&url, None).map_err(|e| e.localizedDescription().to_string())
}
/// The folder Companion was in is gone (its practice copy went to the Trash): it leaves the recent list, and if it was the
/// project in use, Companion has no folder until the person picks one.
fn forget_folder(app: &AppHandle, folder: &std::path::Path) {
    let f = folder.to_string_lossy().to_string();
    let mut p = projects::load(&projects_path());
    p.forget(&f);
    let _ = logfile::write_atomic(&projects_path(), serde_json::to_string(&p).unwrap_or_default().as_bytes());
    let mut cur = PROJECT.lock().unwrap_or_else(|e| e.into_inner());
    // The removed project's own settings are no longer in force anywhere: the engine and the pages are told.
    if cur.as_deref() == Some(f.as_str()) { *cur = None; drop(cur); project_now(app, ""); }
}

/// A practice project (the first one unless the page names another in the catalog): copied into a new folder in the home
/// folder, named after the practice, with its house rules, recorded, then chosen as the project. Never over anything, and
/// never a second copy while the recorded one is still there (the page opens that one instead; this refuses it anyway).
#[tauri::command]
fn create_practice(window: tauri::WebviewWindow, app: AppHandle, which: Option<String>) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(which.as_deref())?;
    let src = practice_source(e)?;
    let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
    let (mut r, _) = practice_record();
    let dst = practice::create(&mut r, e, &src, std::path::Path::new(&home_dir()), &data_dir(), &today())?;
    // A copy that cannot be recorded is taken away again (it could never be listed, removed or moved).
    practice::save_or_discard(|| save_practice(&r), || { let _ = move_to_trash(&dst); })?;
    log("practice_created", json!({ "practice": e.id }));
    use_project_inner(app, dst.to_string_lossy().to_string())
}

/// The practice record for the Learn tab's list: every practice in order, its copy and the days it was started, found
/// and done. `damaged`: the file could not be read as a record, so the list starts empty (said once on the list).
#[tauri::command]
fn practice_list() -> Value {
    let (r, damaged) = practice_record();
    let mut v = r.listed();
    v["damaged"] = json!(damaged);
    v
}

/// The practice open now reached a stage ("found" or "done"). Only counts for its own recorded copy, open as the project.
#[tauri::command]
fn practice_mark(app: AppHandle, window: tauri::WebviewWindow, which: String, stage: String) -> Result<(), String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
    let (mut r, _) = practice_record();
    if !r.mark(&e.id, &stage, &today(), std::path::Path::new(&current_project())) { return Err("That practice is not the project open now.".into()); }
    let saved = save_practice(&r);
    if saved.is_ok() && stage == "done" { mark_tried(&app, "practice"); }   // a practice finished
    saved
}

/// Continue: opens a practice's recorded copy as the project (it may have left the recent list).
#[tauri::command]
fn open_practice(window: tauri::WebviewWindow, app: AppHandle, which: String) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let (r, _) = practice_record();
    let p = r.practices.get(&e.id).and_then(|p| p.path.clone()).ok_or("There is no copy of that practice yet. Press Start.".to_string())?;
    if !practice::copy_path_ok(std::path::Path::new(&p), std::path::Path::new(&home_dir())) || !std::path::Path::new(&p).is_dir() { return Err("That practice copy is not there any more. Press Start for a fresh one.".into()); }
    use_project_inner(app, p)
}

/// Start over, after the person confirmed it: the old copy goes to the Trash, a fresh copy is made in a new folder and
/// opened. `busy`: something works on the project open now (the page knows), so its copy is left alone.
#[tauri::command]
fn restart_practice(window: tauri::WebviewWindow, app: AppHandle, which: String, busy: bool) -> Result<Value, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let src = practice_source(e)?;
    let out = {
        let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
        let (mut r, _) = practice_record();
        let home = PathBuf::from(home_dir());
        let out = practice::restart(&mut r, e, &src, &home, &data_dir(), &current_project(), busy, &today(), move_to_trash)?;
        let fresh = out.path.clone();
        practice::save_or_discard(|| save_practice(&r), || { let _ = move_to_trash(&fresh); }).map_err(|_| match &out.kept_old { None => "Could not save your practice progress. Your old copy is in the Trash, and the new one was not kept. Press Start for a fresh one.".to_string(), Some(_) => "Could not save your practice progress, so the new copy was not kept. Your old copy is still in your home folder.".to_string() })?;
        out
    };
    log("practice_restarted", json!({ "practice": e.id, "keptOld": out.kept_old.is_some() }));
    let path = use_project_inner(app.clone(), out.path.to_string_lossy().to_string())?;
    Ok(json!({ "path": path, "keptOld": out.kept_old.map(|p| p.to_string_lossy().to_string()) }))
}

/// Remove my copy, after the person confirmed it: to the Trash, and out of the recent list.
#[tauri::command]
fn remove_practice(window: tauri::WebviewWindow, app: AppHandle, which: String, busy: bool) -> Result<String, String> {
    settings::only_card(window.label())?;   // only Home, on the person's press
    let e = practice::pick(Some(&which))?;
    let moved = {
        let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
        let (mut r, _) = practice_record();
        let moved = practice::remove(&mut r, &e.id, std::path::Path::new(&home_dir()), &current_project(), busy, move_to_trash)?;
        let _ = save_practice(&r);
        moved
    };
    log("practice_removed", json!({ "practice": e.id }));
    forget_folder(&app, &moved);
    Ok(moved.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

/// Settings: every practice copy to the Trash, after the person confirmed it. A copy something works on stays.
/// Returns how many went and the names of any that stayed.
#[tauri::command]
fn remove_all_practices(window: tauri::WebviewWindow, app: AppHandle, busy: bool) -> Result<Value, String> {
    settings::card_or_settings(window.label())?;   // only Home, on the person's press
    let (moved, kept) = trash_practice_copies(&current_project(), busy);
    for p in &moved { forget_folder(&app, p); }
    log("practice_removed_all", json!({ "moved": moved.len(), "kept": kept.len() }));
    Ok(json!({ "moved": moved.len(), "kept": kept }))
}
fn trash_practice_copies(current: &str, busy: bool) -> (Vec<PathBuf>, Vec<String>) {
    let _g = PRACTICE.lock().unwrap_or_else(|x| x.into_inner());
    let (mut r, _) = practice_record();
    let home = PathBuf::from(home_dir());
    let (mut moved, mut kept) = (vec![], vec![]);
    for (id, p) in practice::copies(&r, &home) {
        match practice::remove(&mut r, &id, &home, current, busy, move_to_trash) { Ok(m) => moved.push(m), Err(_) => kept.push(p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()) }
    }
    let _ = save_practice(&r);
    (moved, kept)
}

static WIPING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// A question macOS itself asks, so a script in a page can never answer it. Cancel is the default button.
fn confirm_delete_natively() -> bool {
    let script = concat!(r#"display dialog "Delete everything "#, crate::product!(), r#" keeps on this Mac? This cannot be undone." buttons {"Cancel", "Delete everything"} default button "Cancel" cancel button "Cancel" with icon caution with title ""#, crate::product!(), r#"""#);
    std::process::Command::new("/usr/bin/osascript").args(["-e", script]).output().is_ok_and(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("Delete everything"))
}

/// Deletes everything Companion keeps. The work is done by a helper (this same program, started with --wipe-everything)
/// after the app has quit, so nothing is holding or rewriting the files; the helper then opens Companion again fresh.
/// The person is asked twice: on the page, and by macOS itself. `with_projects` also removes Companion's own notes inside
/// the person's recent projects.
#[tauri::command]
async fn delete_everything(app: AppHandle, confirm: String, with_projects: bool, with_practice: Option<bool>) -> Result<(), String> {
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
    // The person ticked "Also move my practice copies to the Trash": each copy Companion made and recorded goes to the
    // Trash now that the engine has stopped (so no task, check or lesson still works in one), and before the record itself
    // is deleted with everything else by the helper, which waits for the app to quit.
    if with_practice == Some(true) { let (moved, kept) = trash_practice_copies("", false); log("practice_removed_all", json!({ "moved": moved.len(), "kept": kept.len() })); }
    // A file being converted: its tool is ended and its work folder removed before the app quits.
    let _ = tauri::async_runtime::spawn_blocking(drop_end_for_quit).await;
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
        delete_key: &|| { keystore::delete_item(&keystore::service(), keystore::ACCOUNT) || keystore::gone(&keystore::service(), keystore::ACCOUNT) },
        relaunch: &|| { if let Some(b) = &bundle { let _ = std::process::Command::new("/usr/bin/open").arg("-n").arg(b).status(); } },   // not from a built app (a development run): nothing to open
        wait: &|| std::thread::sleep(Duration::from_millis(150)),
    });
    true
}

// ---------- Draw it for me ----------

/// Draws a diagram the page laid out, beside the dock's screen edge, for as long as How long Draw it for me stays says
/// (drawIt.seconds: 10, 15 or 30 seconds, or until it is closed). It replaces any pointer and leaves with Stop everything
/// or the Close button; one kept until closed also goes when Companion is hidden. Nothing here looks at the screen.
#[tauri::command]
fn show_diagram(app: AppHandle, diagram: Value) -> Result<(), String> {
    use std::sync::atomic::Ordering::SeqCst;
    diagram::validate(&diagram)?;
    // Never over a ring the person is meant to click, never over a pointer in use, and never while the dock is hidden
    // (a full screen app is in front, or the person hid it): the sketch would land on top of what they chose not to share.
    // A picture kept until closed may be replaced by a new one (it is only waiting for Close).
    if TURN.lock().unwrap_or_else(|e| e.into_inner()).is_some() || (overlay_busy() && !DIAGRAM_KEPT.load(SeqCst)) { return Err("busy".into()); }
    if HIDDEN_BY_US.load(SeqCst) || USER_HID.load(SeqCst) { return Err("hidden".into()); }
    point_cancel();
    let gen = POINT_GEN.load(SeqCst);
    // One setting drives both sides: the page fades the picture after its time, and the shell tidies up a second later
    // (busy half a second more). Until closed: no timer here at all.
    let chosen = setting_now("drawIt.seconds");
    let timing = diagram::timing(&chosen);
    OVERLAY_BUSY_UNTIL.store(if timing.busy_ms == u64::MAX { u64::MAX } else { now() as u64 + timing.busy_ms }, SeqCst);
    DIAGRAM_KEPT.store(timing.hide_after_ms.is_none(), SeqCst);
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let a = app.clone();
    let settings = settings_snapshot(&[]);
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
        let _ = a.emit_to("overlay", "overlay-diagram", json!({ "diagram": diagram, "dockX": cx - d.x, "ms": diagram::shown_ms(&chosen), "settings": settings }));
        let _ = tx.send(true);
    });
    if !rx.recv_timeout(Duration::from_secs(2)).unwrap_or(false) { OVERLAY_BUSY_UNTIL.store(0, SeqCst); DIAGRAM_KEPT.store(false, SeqCst); return Err("no_screen".into()); }
    std::thread::spawn(move || {
        match timing.hide_after_ms {
            Some(after) => { std::thread::sleep(Duration::from_millis(after)); if POINT_GEN.load(SeqCst) == gen { hide_overlay(&app); } }
            // Kept until closed: Close or Stop everything takes it away (hide_overlay, which also ends this). It never stays
            // over what the person chose not to share: when Companion is hidden (a full screen app, or hidden from the menu
            // bar) it goes too.
            None => loop {
                std::thread::sleep(Duration::from_millis(250));
                if POINT_GEN.load(SeqCst) != gen || !overlay_busy() { return; }
                if HIDDEN_BY_US.load(SeqCst) || USER_HID.load(SeqCst) { hide_overlay(&app); return; }
            },
        }
    });
    Ok(())
}

// ---------- Celebration ----------

/// Confetti from the character for the big moments (proof passed, it went live). Never over a ring that is waiting
/// for the person, and it leaves the moment anything else needs the pointer. Never while Companion is hidden (a full
/// screen app is in front, or the person hid it): it would land on a video, a show or what they chose not to share.
#[tauri::command]
fn celebrate(app: AppHandle) {
    use std::sync::atomic::Ordering::SeqCst;
    let free = || TURN.lock().unwrap_or_else(|e| e.into_inner()).is_none() && !overlay_busy();
    if !free() || quiet() || companion_hidden() { return; }
    let (gen, party) = (POINT_GEN.load(SeqCst), PARTY_GEN.fetch_add(1, SeqCst) + 1);
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        // Checked again here: a pointer may have been drawn, or Companion hidden, since the command came in.
        if !free() || companion_hidden() || POINT_GEN.load(SeqCst) != gen { return; }
        let mtm = MainThreadMarker::new().unwrap();
        let screens = NSScreen::screens(mtm);
        let primary_h = screens.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        let Some(dock) = with_panels(|dock, _| dock.frame()) else { return };
        let (cx, cy) = (dock.origin.x + dock.size.width / 2.0, dock.origin.y + dock.size.height / 2.0);   // AppKit points
        let Some(scr) = screens.iter().map(|s| s.frame()).find(|f| cx >= f.origin.x && cx < f.origin.x + f.size.width && cy >= f.origin.y && cy < f.origin.y + f.size.height) else { return };
        let d = coords::R { x: scr.origin.x, y: primary_h - scr.origin.y - scr.size.height, w: scr.size.width, h: scr.size.height };
        let ak = coords::rect_to_appkit(d, primary_h);
        OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setFrame_display(NSRect::new(NSPoint::new(ak.x, ak.y), NSSize::new(ak.w, ak.h)), true); p.orderFrontRegardless(); } });
        let _ = a.emit_to("overlay", "overlay-party", json!({ "x": cx - d.x, "y": (primary_h - cy) - d.y, "settings": settings_snapshot(&[]) }));
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
            // Open files in (pointat.editor): the editor in front unless another was picked; one not on this Mac falls back
            // to that order, and the person is told.
            let pick = pointat::choose_editor_for(setting_now("pointat.editor").as_str().unwrap_or(""), &front_id(), editor_installed);
            let note = pick.missing.map(pointat::missing_words).unwrap_or_default();
            let (ok, name, bundle) = match pick.editor.and_then(|i| pointat::editor_link(i, &file, line.max(1), column).map(|l| (i, l))) {
                Some((i, link)) => (std::process::Command::new("/usr/bin/open").arg(&link).status().map(|s| s.success()).unwrap_or(false), pointat::EDITORS[i].2.to_string(), Some(pointat::EDITORS[i].0.to_string())),
                None => (std::process::Command::new("/usr/bin/open").arg("-t").arg(&file).status().map(|s| s.success()).unwrap_or(false), "your text editor".to_string(), None),
            };
            log("point_open", json!({ "editor": name, "ok": ok, "fell_back": pick.missing.is_some() }));
            if !ok { say_showme(&app, "error", &format!("{note}I could not open {short} in {name}."), json!({})); return; }
            opened = Some((format!("{note}Opened {short} at line {line} in {name}."), bundle));
        }
        // Give the editor a moment to come forward and draw the line.
        if let Some((_, Some(bundle))) = &opened {
            for _ in 0..20 { if front_id() == *bundle { break; } std::thread::sleep(Duration::from_millis(150)); }
            std::thread::sleep(Duration::from_millis(700));
        }
        if !alive() { return; }
        let said = opened.as_ref().map(|o| o.0.clone()).unwrap_or_default();
        // Nothing of Companion can be seen (hidden, with Home closed): the file is open, but the screen is not looked at.
        if light_unseen() {
            log("point_hidden", json!({}));
            say_showme(&app, "error", format!("{said} {}", showme::HIDDEN_WORDS).trim(), json!({}));
            return;
        }
        let a3 = app.clone();
        let plat = macos_see::MacPlatform::new(Box::new(|_, _, _, _| {}), Box::new(|_, _, _| {}),
            Box::new(move |on| { if !on { return; } say_showme(&a3, "looking", "Looking at your screen", json!({})); std::thread::sleep(Duration::from_millis(250)); }))
            // Stop, a newer run, or Companion hidden after the light came on: no picture.
            .while_wanted(Box::new(move || alive() && !light_unseen()));
        {
            use showme::Platform;
            if !plat.screen_recording_granted() {
                macos_see::request_screen_recording();
                let lead = if said.is_empty() { String::new() } else { format!("{said} ") };
                say_showme(&app, "needs_permission", &format!(concat!("{lead}To have me circle it on your screen, allow Screen Recording for ", crate::product!(), " in System Settings, then try again."), lead = lead), json!({}));
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
                // Hidden meanwhile (not Stop or a newer run, which said what happens next): the person is told why.
                Err(showme::Refusal::Stopped) => { if alive() { say_showme(&app, "error", format!("{said} {}", showme::HIDDEN_WORDS).trim(), json!({})); } return; }
            }
        }
        if !alive() { return; }
        log("point_found", json!({ "kind": kind, "found": found.is_some(), "exact": found.map(|f| f.exact) }));
        let what = match kind { "line" => "the line", "button" => "that button", _ => "that error" };
        let lead = if said.is_empty() { String::new() } else { format!("{said} ") };
        // The window under what was found, looked up once: the words only choice and the ring both read this.
        let under = found.and_then(|f| anchor_for(f.rect));
        match (found, display) {
            // Only guessing where it is, and the person asked for words then (point.guesses): no ring at all.
            (Some(f), Some(_)) if showme::said_in_words(f.exact, under.is_some(), &setting_now("point.guesses")) => {
                log("point_guess_in_words", json!({ "kind": kind }));
                say_showme(&app, "opened", &format!("{lead}I am only guessing where {what} is on your screen, so I did not draw a ring. {cap}"), json!({}));
            }
            (Some(f), Some(d)) => {
                let button = kind == "button";
                let Some((watched, ring)) = draw_pointer_with(&app, d, f.rect, &cap, f.exact, button, Look::default(), under, gen) else { return; };
                say_showme(&app, if f.exact { "pointing" } else { "pointing_roughly" }, &cap, json!({ "turn": button }));
                if button { your_turn(&app, d, f.rect, &label, gen); } else { watch_ring(&app, f.rect, watched, ring, None); }
            }
            _ => {
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

/// Copy link: only a web address, only on a press. The address as checked is what is copied.
#[tauri::command]
fn copy_link(url: String) -> Result<(), String> {
    let Some(url) = share::web_link(&url) else { return Err("that is not a web address".into()) };
    ax::write_clipboard(&url);
    Ok(())
}

/// Copy on a reply or a receipt (copytext.ts): only from Home, only on a press, only the lines the card shows (the page hid
/// anything that looks like a key again first), checked here (share::copyable). The text is not logged.
#[tauri::command]
fn copy_text(window: tauri::WebviewWindow, text: String) -> Result<(), String> {
    if window.label() != "card" { return Err(concat!("Only ", crate::product_s!(), " own window can copy.").into()); }
    let Some(text) = share::copyable(&text) else { return Err("That could not be copied.".into()) };
    ax::write_clipboard(text);
    Ok(())
}

/// Files into the ask box: the text of a PDF, Word or Excel document Home's page was given by a drop or a paste
/// (attachfiles.ts), read on this Mac with the Mac's own tools in a private folder that is removed at once (docread.rs).
/// Only from Home. The text goes back to the page only; nothing about the document, its name or its text is logged.
#[tauri::command]
async fn read_document(window: tauri::WebviewWindow, name: String, data: String) -> Value {
    if window.label() != "card" { return docread::reply(Err(docread::Refuse::Kind)); }
    if data.len() > docread::MAX_INPUT.div_ceil(3) * 4 { return docread::reply(Err(docread::Refuse::TooBig)); }
    use base64::Engine as _;
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(data.as_bytes()) else { return docread::reply(Err(docread::Refuse::Unreadable)) };
    let r = tauri::async_runtime::spawn_blocking(move || docread::read(&docread::read_root(), &name, &bytes)).await;
    docread::reply(r.unwrap_or(Err(docread::Refuse::Unreadable)))
}

/// Open a link in the person's own browser, through the Mac's own `open`: only from Home, only a plain web address
/// (share::web_link), only the address as checked. The page calls this only from a button the person pressed (a test reads
/// card.tsx for that); nothing the model wrote is ever opened by itself. The address is not logged.
#[tauri::command]
fn open_link(window: tauri::WebviewWindow, url: String) -> Result<(), String> {
    if window.label() != "card" { return Err(concat!("Links can only be opened from ", crate::product_s!(), " own window.").into()); }
    let Some(url) = share::web_link(&url) else { return Err("That is not a plain web address, so it was not opened.".into()) };
    let ok = std::process::Command::new("/usr/bin/open").arg(&url).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success());
    log("link_opened", json!({ "ok": ok }));
    if ok { Ok(()) } else { Err("The link could not be opened. Copy it into your browser instead.".into()) }
}

// ---------- Keys: every hotkey, each changeable in Settings (M11 wave 4; the rules are in keymap.rs, tested) ----------

/// The chord each job uses now (keymap::encode), keymap::NONE when it has none because another app holds its keys. For
/// use a suggestion, the chord armed while a Prompt help result shows. Read without a lock, because the hotkey handler
/// reads it on every press.
static KEYS_USING: [AtomicU32; keymap::N] = [const { AtomicU32::new(keymap::NONE) }; keymap::N];
/// What the person picked (saved on this Mac in keys.json), the usual keys until they pick.
static KEYS_PICKED: Mutex<keymap::Map> = Mutex::new(keymap::Map::DEFAULT);
/// Jobs held back because their group is switched off (groups.rs, F20): their keys are let go through the key map so other
/// apps may use them, and what the person picked stays saved. Never Stop everything or the ask box.
static KEYS_HELD: [AtomicBool; keymap::N] = [const { AtomicBool::new(false) }; keymap::N];
fn key_held(a: keymap::Action) -> bool { KEYS_HELD[a.index()].load(Ordering::SeqCst) }
/// Which groups were off when they were last applied (one bit for each switch, in the catalog's order), so only a group
/// that has just been switched off stops what it was doing.
static GROUPS_OFF: AtomicU32 = AtomicU32::new(0);
/// One change or check at a time. Taken only on the main thread (the commands and arm_now run there), never while the
/// hotkey handler runs, and nothing that holds it waits for the main thread.
static KEYS_SWITCH: Mutex<()> = Mutex::new(());
/// Whether use a suggestion's keys are registered now (only while a Prompt help result shows).
static ACCEPT_ARMED: AtomicBool = AtomicBool::new(false);
/// Key repeats while the hold to talk keys are held restart nothing (talkkeys::Held).
static TALK_HELD: Mutex<talkkeys::Held> = Mutex::new(talkkeys::Held::new());

fn keys_path() -> PathBuf { data_dir().join(keymap::FILE) }
fn key_using(a: keymap::Action) -> Option<keymap::Chord> { keymap::decode(KEYS_USING[a.index()].load(Ordering::SeqCst)) }
fn set_key_using(a: keymap::Action, c: Option<keymap::Chord>) { KEYS_USING[a.index()].store(c.map(keymap::encode).unwrap_or(keymap::NONE), Ordering::SeqCst); }
fn keys_using() -> keymap::Using { keymap::ACTIONS.map(key_using) }
fn keys_picked() -> keymap::Map { *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) }
/// What is registered for a job right now: use a suggestion only while a Prompt help result shows.
fn key_registered(a: keymap::Action) -> Option<keymap::Chord> { keymap::registered(a, key_using(a), ACCEPT_ARMED.load(Ordering::SeqCst)).filter(|_| !key_held(a)) }
/// Whether a job's keys stay registered once they work: not use a suggestion's outside a result, and not a job whose group is off.
fn key_keep(a: keymap::Action, armed: bool) -> bool { keymap::keep_registered_in(a, armed, key_held(a)) }
/// Every other job's keys, in use and picked: Companion's own, never offered to this job and never touched for it.
fn key_others(a: keymap::Action, picked: &keymap::Map) -> Vec<(keymap::Action, keymap::Chord)> {
    keymap::others(a, &keys_using(), picked)
}
/// Which job a shortcut the plugin reports belongs to, among the keys in use now.
fn key_action(s: &Shortcut) -> Option<keymap::Action> {
    keymap::ACTIONS.into_iter().find(|a| key_using(*a).is_some_and(|c| keymap::shortcut(c) == *s))
}
/// Whether a shortcut the plugin reports is the hold to talk chord in use right now.
fn is_talk(s: &Shortcut) -> bool { key_action(s) == Some(keymap::Action::Talk) }
/// Saves what the person picked. Only one file keeps the keys: hold to talk's old one goes once the new one is written.
fn save_keys(m: &keymap::Map) -> bool {
    let _ = std::fs::create_dir_all(data_dir());
    let ok = logfile::write_atomic(&keys_path(), keymap::to_json(m).to_string().as_bytes()).is_ok();
    if ok { let _ = std::fs::remove_file(data_dir().join(keymap::OLD_TALK_FILE)); }
    ok
}
fn let_go_logged(c: keymap::Chord, gone: bool) { if !gone { log("keys_not_let_go", json!({ "id": keymap::id(c) })); } }

/// How the keys started at launch, for the one launch notice.
struct KeysLaunch { started: [keymap::Started; keymap::N], damaged: bool }

/// At launch: every job's saved keys, else its usual ones (keymap::start). Use a suggestion's are only tried and let go
/// (they are registered while a result shows, keymap::arm). A saved file that could not be read is written back
/// repaired, so the person is told once. Main thread.
fn start_keys(app: &AppHandle) -> KeysLaunch {
    // Only a missing keys.json is nothing saved; one that cannot be read as text is damaged (keymap::saved_text).
    let saved = keymap::saved_text(std::fs::read(keys_path()));
    let old_talk = std::fs::read_to_string(data_dir().join(keymap::OLD_TALK_FILE)).ok();
    let (picked, damaged) = keymap::parse(saved.as_deref(), old_talk.as_deref());
    let gs = app.global_shortcut();
    // Use a suggestion's keys are let go again at once (keymap::keep_registered): they are taken only for a result.
    // A job whose group is switched off is tried and let go at once, like use a suggestion (groups.rs).
    let mut held = [false; keymap::N];
    for a in keymap::ACTIONS { held[a.index()] = groups::hotkey_held(&group_off, a.id()); KEYS_HELD[a.index()].store(held[a.index()], Ordering::SeqCst); }
    GROUPS_OFF.store(groups_mask(), Ordering::SeqCst);
    let started = keymap::start_held(&picked, &held,
        |_, c| gs.register(keymap::shortcut(c)).is_ok(),
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = picked;
    for a in keymap::ACTIONS { set_key_using(a, started[a.index()].using()); }
    if damaged { let _ = save_keys(&picked); }
    let without: Vec<&str> = keymap::ACTIONS.iter().filter(|a| started[a.index()].using().is_none()).map(|a| a.id()).collect();
    log("keys", json!({ "changed": keymap::to_json(&picked)["keys"], "damaged": damaged, "without": without }));
    // The launch notice speaks only of jobs that are meant to work: a job whose group is off is not "taken" by anyone.
    let mut shown = started;
    for a in keymap::ACTIONS { if held[a.index()] { shown[a.index()] = keymap::Started::Ready(started[a.index()].picked()); } }
    KeysLaunch { started: shown, damaged }
}

/// Settings and the first run: the keys every job uses now (none when another app holds them) and the ones picked.
/// Registers nothing.
#[tauri::command]
fn key_map() -> Value { keymap::state_json(&keys_using(), &keys_picked()) }

/// Settings, Change: which of one job's short list can be pressed on this Mac now. Each chord on it that no job has is
/// registered and let go again at once (keymap::free); the job's own keys are never touched. Only from the card, one
/// change or check at a time. A sync command, so it runs on the main thread.
#[tauri::command]
fn key_choices(app: AppHandle, window: tauri::WebviewWindow, action: String) -> Result<Value, String> {
    if settings::card_or_settings(window.label()).is_err() { return Err("not_card".into()); }
    let Some(a) = keymap::Action::from_id(&action) else { return Err("unknown".into()) };
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let gs = app.global_shortcut();
    let free = keymap::free(a, key_registered(a), &key_others(a, &keys_picked()),
        |c| gs.register(keymap::shortcut(c)).is_ok(),
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    Ok(keymap::choices_json(a, &free))
}

/// Settings: other keys for one job. Only from the card, only a chord on its list that no other job has. Registered at
/// once and saved on this Mac only if it works; otherwise nothing changes, so Stop everything never loses working keys.
/// The error is a code the page puts in words.
#[tauri::command]
fn set_key(app: AppHandle, window: tauri::WebviewWindow, action: String, id: String) -> Result<Value, String> {
    if settings::card_or_settings(window.label()).is_err() { return Err("not_card".into()); }
    let (Some(a), Some(wanted)) = (keymap::Action::from_id(&action), keymap::from_id(&id)) else { return Err("unknown".into()) };
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let (picked, before, was) = (keys_picked(), key_registered(a), key_using(a));
    let gs = app.global_shortcut();
    let keep = key_keep(a, ACCEPT_ARMED.load(Ordering::SeqCst));
    let r = keymap::switch(a, wanted, before, keep, &picked, &key_others(a, &picked),
        |c| gs.register(keymap::shortcut(c)).is_ok(),
        save_keys,
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    match r {
        Ok(next) => {
            *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = next;
            set_key_using(a, Some(wanted));
            // The old hold to talk keys no longer reach it, so a hold still going on them is ended here, not left open.
            if a == keymap::Action::Talk && was != Some(wanted) { TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset(); voice_send(&app, VoiceMsg::Cancel); }
            log("key_set", json!({ "action": a.id(), "id": keymap::id(wanted) }));
            settings_told(&app, &["keys.hotkeys".to_string()]);
            Ok(keymap::state_json(&keys_using(), &next))
        }
        Err(p) => { log("key_not_set", json!({ "action": a.id(), "id": keymap::id(wanted), "why": p.code() })); Err(p.code().into()) }
    }
}

/// Settings: every job back on its usual keys (keymap::reset). A job whose usual keys another app holds keeps what it
/// has, and the answer names it. Only from the card.
#[tauri::command]
fn reset_keys(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::card_or_settings(window.label()).is_err() { return Err("not_card".into()); }
    let v = keys_to_usual(&app).map_err(str::to_string)?;
    settings_told(&app, &["keys.hotkeys".to_string()]);
    Ok(v)
}
/// Every job back on its usual keys (Settings' own Reset, and Reset this section or Reset all). Main thread.
fn keys_to_usual(app: &AppHandle) -> Result<Value, &'static str> {
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let (picked, using) = (keys_picked(), keys_using());
    let registered = keymap::ACTIONS.map(key_registered);
    let armed = ACCEPT_ARMED.load(Ordering::SeqCst);
    let gs = app.global_shortcut();
    let r = keymap::reset(&picked, &using, &registered, |a| key_keep(a, armed),
        |c| gs.register(keymap::shortcut(c)).is_ok(),
        save_keys,
        |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok()));
    match r {
        Ok(done) => {
            *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = done.picked;
            for a in keymap::ACTIONS { set_key_using(a, done.using[a.index()]); }
            let talk = keymap::Action::Talk.index();
            if using[talk] != done.using[talk] { TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset(); voice_send(app, VoiceMsg::Cancel); }
            let kept: Vec<&str> = done.kept.iter().map(|a| a.id()).collect();
            log("keys_reset", json!({ "kept": kept }));
            let mut v = keymap::state_json(&done.using, &done.picked);
            v["kept"] = json!(kept);
            Ok(v)
        }
        Err(p) => { log("keys_not_reset", json!({ "why": p.code() })); Err(p.code()) }
    }
}

/// Undo after a reset: each job back on the keys it had, one at a time, through the same switch as Change (the new keys
/// are registered before the old ones go, and kept only if they work). Coming back from the usual keys no two jobs can
/// want the same keys. The jobs that could not have their keys back are named. Main thread.
fn keys_restore(app: &AppHandle, wanted: &keymap::Map) -> Vec<keymap::Action> {
    let _one = KEYS_SWITCH.lock().unwrap_or_else(|e| e.into_inner());
    let gs = app.global_shortcut();
    let mut failed = vec![];
    for a in keymap::ACTIONS {
        let (picked, want) = (keys_picked(), wanted.get(a));
        if picked.get(a) == want { continue; }
        let (before, was) = (key_registered(a), key_using(a));
        let keep = key_keep(a, ACCEPT_ARMED.load(Ordering::SeqCst));
        match keymap::switch(a, want, before, keep, &picked, &key_others(a, &picked), |c| gs.register(keymap::shortcut(c)).is_ok(), save_keys, |c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok())) {
            Ok(next) => {
                *KEYS_PICKED.lock().unwrap_or_else(|e| e.into_inner()) = next;
                set_key_using(a, Some(want));
                if a == keymap::Action::Talk && was != Some(want) { TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()).reset(); voice_send(app, VoiceMsg::Cancel); }
            }
            Err(_) => failed.push(a),
        }
    }
    failed
}


// ---------- The Show me key ----------

/// The Show me key started the listening that is open now (voice::show_me_key). Only trusted while the microphone is open.
static SHOWME_LISTENING: AtomicBool = AtomicBool::new(false);
/// The Show me key (finding M). With voice on and the microphone allowed it starts listening at once, the same way hold to talk
/// does (the worker checks the speech model, the permission, that Companion is not hidden, and lights the character and
/// the card before the microphone opens); a second press ends it. Otherwise it opens the question box as it always did.
/// Nothing on the screen is captured until the question is sent, under the light (showme_start).
fn show_me_key(app: &AppHandle) {
    let state = voice::ShowMeKeyState {
        setting_on: setting_now("showme.listen").as_bool().unwrap_or(true),
        voice_on: setting_now("voice.on").as_bool().unwrap_or(true),
        model_ready: voice_mac::model_ready(&data_dir()),
        mic_allowed: voice_mac::mic_status() == voice_mac::Mic::Allowed,
        hidden: companion_hidden(),
        listening: listening_now(),
        started_by_key: SHOWME_LISTENING.load(Ordering::SeqCst),
    };
    let plan = voice::show_me_key(&state);
    log("showme_key", json!({ "plan": format!("{plan:?}").to_lowercase() }));
    match plan {
        voice::ShowMeKey::Box => {
            // Open the box ready for a question about the screen; nothing is captured until the question is sent.
            open_card(app, "hotkey", true);
            let _ = app.emit("showme-mode", true);
        }
        voice::ShowMeKey::Listen => {
            // The card shows the light and its line; it does not take the keyboard, so the app in front stays in front.
            open_card(app, "hotkey", false);
            let _ = app.emit("showme-mode", "listening");
            SHOWME_LISTENING.store(true, Ordering::SeqCst);
            // As hold to talk starts: nothing talks over the person, a Show me answer still playing ends.
            speech_off(app); showme_end_answer(app); let _ = app.emit("hush", ());
            voice_send(app, VoiceMsg::Down(now() as u64));
        }
        voice::ShowMeKey::Finish => {
            SHOWME_LISTENING.store(false, Ordering::SeqCst);
            voice_send(app, VoiceMsg::Up(now() as u64));
        }
    }
}

// ---------- Hold to talk ----------

/// Hidden: Companion was just hidden (a full screen app came forward, or Hide from the menu bar). It only wakes the worker,
/// which then closes an open microphone at once instead of at its next one second check.
enum VoiceMsg { Down(u64), Up(u64), Cancel, Hidden }
const LISTENING: &str = "Listening. Let go of the keys when you are done.";
/// Hold to talk is listening: from just before the light comes on until the microphone is closed (let go, Stop everything,
/// the cap running out, Companion being hidden, or a microphone that would not start). Nothing is said meanwhile (`speak`).
static LISTENING_NOW: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
fn listening_now() -> bool { LISTENING_NOW.load(std::sync::atomic::Ordering::SeqCst) }
fn listening(on: bool) { LISTENING_NOW.store(on, std::sync::atomic::Ordering::SeqCst); }
static VOICE_TX: Mutex<Option<std::sync::mpsc::Sender<VoiceMsg>>> = Mutex::new(None);
/// How many times Stop everything was pressed. Bumped before its Cancel is queued, so the worker sees a Stop that came while
/// it was busy: the microphone never opens after one, and words heard before one are dropped (rule 11).
static VOICE_STOPS: AtomicU64 = AtomicU64::new(0);

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
/// Companion is hidden: a full screen app is in front, or the person hid it from the menu bar. The light (the character)
/// cannot be seen, so the microphone is never open (rule 5).
fn companion_hidden() -> bool { HIDDEN_BY_US.load(Ordering::SeqCst) || USER_HID.load(Ordering::SeqCst) }
/// Nothing of Companion can be seen: it is hidden and Home is closed too (a hotkey can open Home while it is hidden, and
/// then Home's own line is the light). Show me and Point at the problem never look then (rule 5). Any thread.
fn light_unseen() -> bool { companion_hidden() && !HOME_OPEN.load(Ordering::SeqCst) }
/// Companion was just hidden (a full screen app came forward, or Hide in the menu bar): every pointer goes, so no ring stays
/// drawn over what the person chose not to share, and no your turn watch keeps reading the mouse to start the next step's
/// look with nothing of Companion showing. The page is told only when something was up.
fn pointers_gone_hidden(app: &AppHandle) {
    let up = overlay_busy() || TURN.lock().unwrap_or_else(|e| e.into_inner()).is_some();
    let seen = showme_pending().end();
    point_cancel(); hide_overlay(app);
    if up || seen { log("pointers_gone_hidden", json!({})); say_showme(app, "done", "", json!({})); }
}
/// Hide or show Companion (the menu bar icon): the character, the island and Home. Main thread.
fn set_user_hidden(app: &AppHandle, hide: bool) {
    USER_HID.store(hide, Ordering::SeqCst);
    with_panels(|d, c| if hide { d.orderOut(None); c.orderOut(None); } else if !HIDDEN_BY_US.load(Ordering::SeqCst) { d.orderFrontRegardless(); });
    island_show(!hide && !HIDDEN_BY_US.load(Ordering::SeqCst));
    if hide { home_closed(); voice_tell_hidden(); pointers_gone_hidden(app); }
    log("menu_hide", json!({ "hidden": hide }));
}
/// Companion was just hidden: wake the hold to talk worker if it is running, so a microphone that is open closes at once.
/// A worker that was never started has nothing open, so none is started here.
fn voice_tell_hidden() {
    if let Some(tx) = VOICE_TX.lock().unwrap_or_else(|e| e.into_inner()).as_ref() { let _ = tx.send(VoiceMsg::Hidden); }
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
    // The microphone that listened cannot hear now (the Mac's own with the lid closed): its silence is the lid, not the permission.
    let mut quiet_mic = false;
    // Stop everything's count as the keys went down: any Stop since then ends this hold.
    let mut stops_at = VOICE_STOPS.load(Ordering::SeqCst);
    loop {
        let msg = rx.recv_timeout(Duration::from_secs(1));
        if matches!(msg, Err(std::sync::mpsc::RecvTimeoutError::Disconnected)) { break; }
        if speech.is_some() && hold.phase == voice::Phase::Idle && last_used.elapsed() > Duration::from_secs(300) { speech = None; }
        // The microphone is closed by force, whatever the keys are doing, the moment Companion is hidden (the light can no
        // longer be seen) and at its cap (a minute unless changed, Longest hold to talk). What was heard is dropped.
        if let Some(why) = hold.must_close(now() as u64, companion_hidden()) {
            if let Some(r) = rec.take() { let _ = r.finish(); }
            listening(false);
            let cap = hold.cap();
            hold.cancel();
            let words = match why { voice::Close::Hidden => voice::HIDDEN_WORDS.to_string(), voice::Close::Cap => voice::stopped_words(cap) };
            log("voice_closed", json!({ "why": format!("{why:?}") }));
            say_voice(&app, "error", &words, json!({}));
        }
        match msg {
            Ok(VoiceMsg::Down(t)) => {
                // The cap is read as the keys go down and kept for this hold (there is always one, at most two minutes).
                let cap = voice::max_hold_ms(&setting_now("talk.maxHold"));
                if hold.down_for(t, cap) != voice::Step::Start { continue; }
                stops_at = VOICE_STOPS.load(Ordering::SeqCst);
                voice_mac::set_buffer_room(voice::buffer_samples(cap));
                if !voice_mac::model_ready(&data) { hold.cancel(); if DOWNLOADING.load(Ordering::SeqCst) { say_voice(&app, "downloading", "Downloading the speech model", json!({ "percent": DOWNLOAD_PERCENT.load(Ordering::SeqCst) })); } else { say_voice(&app, "needs_model", concat!("To talk to ", crate::product!(), ", it needs a speech model on this Mac (about 140 MB, downloaded once). Your voice never leaves this Mac."), json!({})); } continue; }
                match voice_mac::mic_status() {
                    voice_mac::Mic::NotAsked => { hold.cancel(); voice_mac::ask_for_mic(); say_voice(&app, "needs_mic", "Allow the microphone in the box macOS shows, then hold the keys again.", json!({})); continue; }
                    voice_mac::Mic::Refused => { hold.cancel(); say_voice(&app, "mic_refused", concat!("The microphone is switched off for ", crate::product!(), ". Turn it on in System Settings, Privacy and Security, Microphone. If it is not in the list, run this in Terminal and reopen ", crate::product!(), ": tccutil reset Microphone dev.companion.app"), json!({})); continue; }
                    voice_mac::Mic::Allowed => {}
                }
                // The light is the dock character (and the card). If the person cannot see it (a full screen app is in front, or they hid it) nothing is recorded (rule 5).
                if companion_hidden() {
                    hold.cancel();
                    say_voice(&app, "error", voice::HIDDEN_WORDS, json!({}));
                    continue;
                }
                // With the lid closed and only the Mac's own microphone (cut off in hardware), nothing could be heard: one plain
                // line, before the light, and nothing listens. With another microphone, that one listens (voiceset::unheard).
                let (mics, quiet) = if voice_mac::lid_closed() { voice_mac::hearing() } else { (Vec::new(), Vec::new()) };
                if voiceset::only_unheard(&mics, &quiet) { hold.cancel(); log("voice_lid_closed", json!({})); say_voice(&app, "blocked", voice::Silence::Lid.fallback(), json!({ "why": "lid" })); continue; }
                // From here nothing is said, and a line that began after the keys went down is cut off before the microphone opens.
                listening(true);
                speech_off(&app);
                say_voice(&app, "listening", LISTENING, json!({}));
                std::thread::sleep(Duration::from_millis(150));   // the light is on screen before the microphone opens
                // Hidden meanwhile: the light is gone again, so the microphone never opens.
                if companion_hidden() { hold.cancel(); listening(false); say_voice(&app, "error", voice::HIDDEN_WORDS, json!({})); continue; }
                // Stop everything meanwhile: the microphone never opens.
                if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { hold.cancel(); listening(false); say_voice(&app, "idle", "", json!({})); continue; }
                // The microphone picked in Settings, or the Mac's default when it is not connected or will not open (voiceset::open_at_start).
                match voice_mac::Recorder::start(voice_now().mic) {
                    Ok((r, opened)) => {
                        // Stop everything while it opened (a Bluetooth microphone can take seconds): closed again at once.
                        if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { let _ = r.finish(); hold.cancel(); listening(false); log("voice_stopped_opening", json!({})); say_voice(&app, "idle", "", json!({})); continue; }
                        quiet_mic = opened.quiet;
                        rec = Some(r); log("voice_listening", json!({ "fell_back": opened.missing.is_some(), "quiet": opened.quiet }));
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
                            voice::Heard::Blocked => { hold.finished(); let why = voice::why_silent(crate::permissions::current().microphone == crate::permissions::Status::Granted, quiet_mic); mic["why"] = json!(why.word()); say_voice(&app, "blocked", why.fallback(), mic); }
                            voice::Heard::Silent => { hold.finished(); say_voice(&app, "silent", "I did not hear anything. Try again a little closer.", mic); }
                            voice::Heard::Sound => {
                                // Stop everything since the keys went down: nothing is turned into text.
                                if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { hold.finished(); say_voice(&app, "idle", "", json!({})); continue; }
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
                                // Stop everything while the words were turned into text: they are dropped, never sent on (to
                                // Show me after its key, or as a task with auto send on).
                                if VOICE_STOPS.load(Ordering::SeqCst) != stops_at { log("voice_dropped_after_stop", json!({})); say_voice(&app, "idle", "", json!({})); continue; }
                                match out {
                                    // Only the word list written back is not what the person said (voicewords::is_echo).
                                    Ok(text) if voicewords::is_echo(&text, &words) => say_voice(&app, "silent", "I did not catch any words. Try again.", mic),
                                    // The language picked in Settings goes with the words: the page sends by itself only in English for now.
                                    Ok(text) if !text.is_empty() => { mic["text"] = json!(text); mic["language"] = json!(voice_now().language); say_voice(&app, "heard", "", mic); mark_tried(&app, "talk") }
                                    Ok(_) => say_voice(&app, "silent", "I did not catch any words. Try again.", mic),
                                    Err(e) => say_voice(&app, "error", &e, mic),
                                }
                            }
                        }
                    }
                }
            }
            Ok(VoiceMsg::Cancel) => { if let Some(r) = rec.take() { let _ = r.finish(); } listening(false); if hold.cancel() { say_voice(&app, "idle", "", json!({})); } }
            // Already closed by the check at the top of the loop.
            Ok(VoiceMsg::Hidden) | Err(_) => {}
        }
    }
}

/// A speech model download is running, and how far it got: one at a time (a second one would remove the first one's half
/// written file), and holding the talk keys meanwhile says it is still going instead of offering Download again.
static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_PERCENT: AtomicU64 = AtomicU64::new(0);

/// Download the speech model once (the person asked for it with a button). A press while one runs does nothing.
#[tauri::command]
fn voice_download(app: AppHandle) {
    if DOWNLOADING.swap(true, Ordering::SeqCst) { return; }
    DOWNLOAD_PERCENT.store(0, Ordering::SeqCst);
    std::thread::spawn(move || {
        let data = data_dir();
        say_voice(&app, "downloading", "Downloading the speech model", json!({ "percent": 0 }));
        let a = app.clone();
        let r = voice_mac::download_model(&data, &move |got| {
            let pct = ((got as f64 / voice_mac::MODEL_BYTES as f64) * 100.0).min(99.0) as u64;
            DOWNLOAD_PERCENT.store(pct, Ordering::SeqCst);
            say_voice(&a, "downloading", "Downloading the speech model", json!({ "percent": pct }));
        });
        DOWNLOADING.store(false, Ordering::SeqCst);
        match r {
            Ok(()) => say_voice(&app, "model_ready", &talkkeys::ready_words(key_using(keymap::Action::Talk)), json!({})),
            Err(e) => say_voice(&app, "error", &e, json!({})),
        }
    });
}

fn tick(app: &AppHandle) {
    let mtm = MainThreadMarker::new().unwrap();
    // Stay out of full screen apps unless the setting says otherwise.
    let front_pid = NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier()).unwrap_or(0);
    let areas: Vec<(Rect, Rect)> = screens_now(mtm).iter().map(|s| (s.frame, s.work)).collect();
    let wins = fullscreen::sys::on_screen_windows();
    let displays = FS_SEEN.lock().unwrap_or_else(|e| e.into_inner()).look(&wins, front_pid, &areas);
    let raw = fullscreen::front_app_is_full_screen(&wins, front_pid, &displays);
    // The raw reading flickered in the field, so it must agree three times in a row before it counts.
    // Raw changes are logged (a limited number) so the cause can be found from the log.
    if FS_LAST_RAW.swap(raw, Ordering::SeqCst) != raw && FS_RAW_LOGGED.fetch_add(1, Ordering::SeqCst) < 60 {
        let front: Vec<_> = wins.iter().filter(|w| w.pid == front_pid).take(4).map(|w| json!([w.layer, w.bounds])).collect();
        log("fullscreen_raw", json!({ "raw": raw, "front_pid": front_pid, "our_panels_hidden": HIDDEN_BY_US.load(Ordering::SeqCst), "front_windows": front }));
    }
    let fs = FS_SMOOTH.lock().unwrap().get_or_insert_with(|| visibility::Debounce::new(false, 3)).push(raw);
    let over = visibility::over_full_screen(std::env::var("COMPANION_OVER_FULLSCREEN").ok().as_deref(), home_set().over_full_screen);
    let show = visibility::should_show(visibility::Inputs { full_screen_app_in_front: fs, show_over_full_screen: over, user_hid_it: USER_HID.load(Ordering::SeqCst) });
    if !show && !USER_HID.load(Ordering::SeqCst) && !HIDDEN_BY_US.swap(true, Ordering::SeqCst) {
        with_panels(|d, c| { d.orderOut(None); c.orderOut(None); });
        island_show(false);
        home_closed();
        voice_tell_hidden();
        pointers_gone_hidden(app);
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
    // Peeking from past the edge: the pointer, then the pose (character.peek).
    peek_tick(app);
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
    let saved = projects::load(&projects_path()).checked(&home_dir(), &data_dir()).current.filter(|c| std::path::Path::new(c).is_dir());
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
        } }, || Some(settings_line())));
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

// ---------- F19: drop a file on the companion (convert.rs) ----------
//
// Tauri's drop events on the character's window and the island only (setup below): never a global drag watch, never a key
// event. A drop is checked here (regular files, not links, readable, of one kind), and the pages are sent a menu with the
// files' names only; the paths stay in the shell. A choice runs the Mac's own tools on a thread of its own; Stop
// everything ends it. Nothing about a file goes to the engine, Claude or the network, and the log names no file.

struct DropNow { id: u64, paths: Vec<PathBuf>, actions: Vec<&'static str>, menu: Value, job: Option<Value>, made: Vec<PathBuf>, running: Option<std::sync::Arc<convert::Job>> }
static DROP: Mutex<Option<DropNow>> = Mutex::new(None);
static DROP_SEQ: AtomicU64 = AtomicU64::new(0);
static CAPS: OnceLock<convert::Caps> = OnceLock::new();
fn drop_now_lock() -> std::sync::MutexGuard<'static, Option<DropNow>> { DROP.lock().unwrap_or_else(|e| e.into_inner()) }

/// Drop a file on the character to convert it (drop.on, usual on).
fn drop_on() -> bool { setting_now("drop.on") != json!(false) && !group_off("files.on") }
/// What this Mac's own tools can write (WebP, GIF, FLAC, the other Word formats, the video sizes, ...): asked once, the first
/// time anything is dropped, by running the tools' own help and format lists. Nothing is converted to find out.
fn mac_can() -> &'static convert::Caps { CAPS.get_or_init(convert::probe_tools) }
fn file_name(p: &std::path::Path) -> String { p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default() }

/// What a drag over one of the two windows does. Only files count: a drag of text, a link, or a picture from another app
/// (Photos, Mail, a browser) comes with no file at all, so it neither lights the character nor opens anything.
#[derive(Debug, PartialEq)]
enum DragNews { Hover(bool), Dropped(Vec<PathBuf>), Nothing }
fn drag_news(ev: &tauri::DragDropEvent, on: bool) -> DragNews {
    match ev {
        // Leaving always puts the window back, even if the setting was turned off during the drag.
        tauri::DragDropEvent::Leave => DragNews::Hover(false),
        _ if !on => DragNews::Nothing,
        tauri::DragDropEvent::Enter { paths, .. } if !paths.is_empty() => DragNews::Hover(true),
        tauri::DragDropEvent::Drop { paths, .. } if !paths.is_empty() => DragNews::Dropped(paths.clone()),
        // A drop of something that is not a file only makes sure the window is put back.
        tauri::DragDropEvent::Drop { .. } => DragNews::Hover(false),
        _ => DragNews::Nothing,
    }
}

/// A drag over, off or dropped on one of the two windows.
fn drop_event(app: &AppHandle, at: &'static str, ev: &tauri::DragDropEvent) {
    match drag_news(ev, drop_on()) {
        DragNews::Hover(over) => { let _ = app.emit_to(at, "drop-hover", json!({ "over": over })); }
        DragNews::Dropped(paths) => {
            let _ = app.emit_to(at, "drop-hover", json!({ "over": false }));
            let a = app.clone();
            std::thread::spawn(move || drop_arrived(&a, at, paths));
        }
        DragNews::Nothing => {}
    }
}

/// Puts a new drop's menu in place of the old one, unless a job is running: the running job is never let go of, so Stop
/// everything can always reach it. Checked and done under one hold of the lock. False when a job runs.
fn put_menu(now: &mut Option<DropNow>, new: DropNow) -> bool {
    if now.as_ref().is_some_and(|d| d.running.is_some()) { return false; }
    *now = Some(new);
    true
}

/// What a drop gets. One job at a time: a drop while one runs is told so and changes nothing.
fn drop_arrived(app: &AppHandle, at: &'static str, paths: Vec<PathBuf>) {
    let busy = |app: &AppHandle| { let _ = app.emit("drop-said", json!({ "why": "busy" })); };
    if drop_now_lock().as_ref().is_some_and(|d| d.running.is_some()) { busy(app); return; }
    let refused = paths.iter().take(convert::MAX_FILES).find_map(|p| convert::check_input(p).err());
    let offer = match refused {
        Some(code) => convert::Offer::Refused(code),
        None => convert::offer(&paths, mac_can(), &convert::Prefs::read(setting_now)),
    };
    let id = DROP_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    let (kind, actions, refused) = match offer { convert::Offer::Actions(k, a) => (Some(k.id()), a, None), convert::Offer::Refused(r) => (None, vec![], Some(r)) };
    let names: Vec<String> = paths.iter().take(convert::MAX_FILES).map(|p| file_name(p)).collect();
    let menu = json!({ "id": id, "names": names, "kind": kind, "actions": actions, "refused": refused, "at": at });
    let count = paths.len();
    // A job may have started while the files were checked (from Home's list): then this drop changes nothing.
    if !put_menu(&mut drop_now_lock(), DropNow { id, paths, actions, menu: menu.clone(), job: None, made: vec![], running: None }) { busy(app); return; }
    log("drop_menu", json!({ "at": at, "count": count, "kind": kind, "refused": refused }));
    let _ = app.emit("drop-menu", menu);
    // Dropped on the island: its choices are in Home, which opens below it (never taking the keyboard).
    if at == "island" { open_card(app, "drop", false); }
}

/// What the pages show when they start: the menu open now and its job, if any.
#[tauri::command]
fn drop_now() -> Value {
    drop_now_lock().as_ref().map(|d| json!({ "menu": d.menu, "job": d.job })).unwrap_or(Value::Null)
}

#[derive(serde::Deserialize)]
struct TrimIn { start: f64, end: f64 }

/// Runs one of the menu's actions on the dropped files. From the character's window or Home only. The page names the menu
/// and the action; the files are the ones the shell checked at the drop, and are checked again before each tool runs.
#[tauri::command]
fn drop_pick(app: AppHandle, window: tauri::WebviewWindow, id: u64, action: String, trim: Option<TrimIn>) -> Result<(), String> {
    if !matches!(window.label(), "dock" | "card") { return Err("notOffered".into()); }
    let prefs = convert::Prefs::read(setting_now);
    let work = convert::work_root().join(format!("{id}-{}", now()));
    let trim = trim.map(|t| convert::Trim { start: t.start, end: t.end });
    let (units, job) = {
        let mut g = drop_now_lock();
        let d = g.as_mut().filter(|d| d.id == id).ok_or("gone")?;
        if d.running.is_some() { return Err("busy".into()); }
        if !d.actions.contains(&action.as_str()) { return Err("notOffered".into()); }
        let units = convert::plan(&action, &d.paths, &work, &prefs, trim)?;
        let job = std::sync::Arc::new(convert::Job::default());
        d.running = Some(job.clone());
        d.made.clear();
        let running = json!({ "id": id, "phase": "running", "done": 0, "of": units.len(), "percent": null });
        d.job = Some(running.clone());
        let _ = app.emit("drop-job", running);
        (units, job)
    };
    log("drop_job_started", json!({ "action": action, "count": units.len() }));
    std::thread::spawn(move || {
        let last = Mutex::new((0u128, usize::MAX));
        let tell = |done: usize, of: usize, percent: Option<f64>| {
            let mut l = last.lock().unwrap_or_else(|e| e.into_inner());
            // At most five a second, and every time a result is done.
            if l.1 == done && now() - l.0 < 200 { return; }
            *l = (now(), done);
            let v = json!({ "id": id, "phase": "running", "done": done, "of": of, "percent": percent });
            if let Some(d) = drop_now_lock().as_mut().filter(|d| d.id == id) { d.job = Some(v.clone()); }
            let _ = app.emit("drop-job", v);
        };
        let home = PathBuf::from(home_dir());
        let dest = |u: &convert::Unit| convert::dest_dir(&u.source, prefs.save_to, &home);
        let ended = convert::run(&units, &work, &dest, &job, &tell);
        // What was made is named even when the job was stopped or failed part way, so the person can find it.
        let end = convert::end_news(id, &ended);
        // Files really made: the first use of Convert a file.
        if !ended.made.is_empty() { mark_tried(&app, "convert"); }
        log("drop_job_ended", json!({ "action": action, "made": ended.made.len(), "skipped": ended.skipped, "failed": ended.failed, "ended": end["phase"], "why": end["why"] }));
        if let Some(d) = drop_now_lock().as_mut().filter(|d| d.id == id) { d.running = None; d.made = ended.made; d.job = Some(end.clone()); }
        let _ = app.emit("drop-job", end);
    });
    Ok(())
}

/// The menu's own Stop.
#[tauri::command]
fn drop_stop() { drop_stop_all(); }
/// Stop everything ends a conversion too.
fn drop_stop_all() { if let Some(j) = drop_now_lock().as_ref().and_then(|d| d.running.clone()) { j.stop(); } }
/// Companion is quitting (Quit in the menu bar, Delete everything, or macOS): a running conversion is stopped and waited
/// for, at most two seconds, so its tool is ended and its work folder removed before Companion goes.
fn drop_end_for_quit() {
    let Some(job) = drop_now_lock().as_ref().and_then(|d| d.running.clone()) else { return };
    job.stop();
    let ended = job.wait_ended(Duration::from_secs(2));
    log("drop_job_quit", json!({ "ended": ended }));
}

/// Closes the menu (never while its job runs: Stop ends it first), in every window.
#[tauri::command]
fn drop_close(app: AppHandle, id: u64) {
    let mut g = drop_now_lock();
    if g.as_ref().is_some_and(|d| d.id == id && d.running.is_none()) { *g = None; drop(g); let _ = app.emit("drop-menu", Value::Null); }
}

/// Shows a result in Finder: only one this menu's job made, by its number in the list.
#[tauri::command]
fn drop_reveal(id: u64, i: usize) -> Result<(), String> {
    let p = drop_now_lock().as_ref().filter(|d| d.id == id).and_then(|d| d.made.get(i).cloned()).ok_or("gone")?;
    std::process::Command::new("/usr/bin/open").arg("-R").arg(&p).env_clear().env("PATH", "/usr/bin:/bin").stdin(std::process::Stdio::null()).spawn().map(|_| ()).map_err(|_| "toolMissing".to_string())
}

/// Trim chosen on the ring: its two times are typed in Home, which opens for them (the character's window never takes the
/// keyboard).
#[tauri::command]
fn drop_trim(app: AppHandle, id: u64) {
    if !drop_now_lock().as_ref().is_some_and(|d| d.id == id && d.actions.contains(&"trim") && d.running.is_none()) { return; }
    open_card(&app, "drop", true);
    let _ = app.emit_to("card", "drop-trim", json!({ "id": id }));
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
                    if s == &sc_esc() {
                        if e.state == ShortcutState::Pressed { let a = app.clone(); std::thread::spawn(move || { arm_result_keys(&a, false); phelp::dismiss(&a); }); }
                        return;
                    }
                    // Hold to talk (two keys, talkkeys.rs) needs to know when the keys come up as well as down.
                    if is_talk(s) {
                        let down = e.state == ShortcutState::Pressed;
                        // A key repeat while held, or a let go that ends no press, restarts nothing and is not logged.
                        let counts = { let mut h = TALK_HELD.lock().unwrap_or_else(|e| e.into_inner()); if down { h.press(now() as u64) } else { h.release() } };
                        if !counts { return; }
                        log("hotkey", json!({ "id": "talk", "down": down }));
                        // Never talk over the person: what is being said stops, a Show me answer still playing ends (no
                        // later step is drawn or said), and the page drops any line still waiting to be said.
                        if down { SHOWME_LISTENING.store(false, Ordering::SeqCst); speech_off(app); showme_end_answer(app); let _ = app.emit("hush", ()); }
                        voice_send(app, if down { VoiceMsg::Down(now() as u64) } else { VoiceMsg::Up(now() as u64) });
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
                            showme_stop(&app);
                        }
                        keymap::Action::Talk => {}
                    }
                })
                .build(),
        )
        .manage(runner::Runner::new())
        .invoke_handler({
            let handler: Box<dyn Fn(tauri::ipc::Invoke) -> bool + Send + Sync> = Box::new(tauri::generate_handler![char_click, ui_click, open_card_cmd, toggle_card, island_click, island_alert, island_state, resize_card, get_project, list_projects, use_project, pick_project, clone_project, start_in_new_folder, list_made, open_made, reveal_made, trash_made, shared_files_state, save_api_key, remove_api_key, data_inventory, permission_overview, open_permission_page, delete_everything, export_logs, report_problem, create_practice, practice_list, practice_mark, open_practice, restart_practice, remove_practice, remove_all_practices, showme_start, showme_aim, showme_clear, showme_hide, quiet_now, point_problem, do_it_for_me, show_diagram, open_acknowledgements, speak, speak_stop, voice_settings, voice_speed, set_voice_settings, update_status, check_update, install_update, celebrate, save_share_card, copy_link, copy_text, open_link, voice_download, key_map, key_choices, set_key, reset_keys, close_card, send_command, drag_dock, drop_dock, settings_get, settings_set, settings_reset, settings_migrate, front_app, app_names, permissions_status, replay_events, ph_consent, ph_ready, ph_disarm, ph_accept, ph_restore, ph_dismiss, ph_answer, eh_consent, eh_dismiss, sl_consent, sl_dismiss, drop_now, drop_pick, drop_stop, drop_close, drop_reveal, drop_trim, tried_mark, read_document, open_settings_window, close_settings_window]);
            move |invoke: tauri::ipc::Invoke| {
                // F20: a command of a tool whose group is switched off answers with one plain line and does nothing.
                if let Some(line) = group_refusal(invoke.message.command()) { invoke.resolver.reject(line); return true; }
                handler(invoke)
            }
        })
        .setup(move |app| {
            log("launch", json!({}));
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
            let island_w = WebviewWindowBuilder::new(app, "island", WebviewUrl::App("island.html".into())).visible(false).focused(false).decorations(false).transparent(true).accept_first_mouse(true).inner_size(185.0, 32.0).build()?;
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
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(peek::EDGE_POLL_MS));
                if *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) != peek::Pose::Hidden { continue; }
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || peek_edge_poll(&h2));
            });
            // Every job's keys: the saved ones, else the usual ones (keymap.rs; hold to talk is two keys, F18.3). Another app
            // may already own some of them. That must never stop Companion from opening; the one notice says what to do.
            let launch = start_keys(app.handle());
            if launch.damaged || launch.started.iter().any(|s| s.using() != Some(s.picked())) {
                let off: Vec<&str> = keymap::ACTIONS.iter().filter(|a| launch.started[a.index()].using() != Some(launch.started[a.index()].picked())).map(|a| a.id()).collect();
                log("hotkey_unavailable", json!({ "which": off, "damaged": launch.damaged }));
            }
            if let Some(message) = keymap::launch_notice(&launch.started, launch.damaged) {
                runner::Runner::publish(app.handle(), json!({ "v": 1, "id": "app-hotkeys", "type": "app.notice", "message": message }));
            }
            start_runner(app.handle());
            // If a "delete everything" could not remove some of it, the helper left a note; say it once.
            if let Ok(note) = std::fs::read_to_string(data_dir().join("wipe-note.txt")) {
                let _ = std::fs::remove_file(data_dir().join("wipe-note.txt"));
                runner::Runner::publish(app.handle(), json!({ "v": 1, "id": "app-wipe-note", "type": "app.notice", "message": note }));
            }
            // The menu bar icon: hide or show, stop everything, quit. Clicking it never takes your typing.
            let hide = MenuItemBuilder::with_id("hide", concat!("Hide or show ", crate::product!())).build(app)?;
            let stop = MenuItemBuilder::with_id("stop", "Stop everything").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", concat!("Quit ", crate::product!())).build(app)?;
            let menu = MenuBuilder::new(app).items(&[&hide, &stop, &quit]).build()?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
                .tooltip(crate::product!())
                .menu(&menu)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "hide" => { let a = app.clone(); let _ = app.run_on_main_thread(move || set_user_hidden(&a, !USER_HID.load(Ordering::SeqCst))); }
                    "stop" => {
                        let r = app.state::<runner::Runner>().stop_everything("menu");
                        log("menu_stop_everything", json!({ "sent": r.is_ok() }));
                        let stop = json!({ "v": 1, "id": "app-kill", "type": "app.stop_everything" });
                        peek_heard(app, &stop);
                        let _ = app.emit("runner-event", stop);
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
    app.run(|app, ev| match ev {
        RunEvent::Exit => { drop_end_for_quit(); app.state::<runner::Runner>().shut_down(); }
        // Companion opened again while it runs (Finder, Spotlight, Launchpad): macOS asks this copy to reopen.
        RunEvent::Reopen { .. } => reopened(app),
        _ => {}
    });
}

/// Opening Companion again shows it if the person hid it from the menu bar (that icon can be out of reach: behind the notch,
/// or turned off in macOS's menu bar settings), the same way the menu does; otherwise it opens Home. Never the keyboard.
/// Main thread (the app's own event loop).
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
