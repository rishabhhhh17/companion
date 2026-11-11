// ---------- screens and docking glue (the maths is in docking.rs, tested) ----------

fn data_dir() -> PathBuf { PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library/Application Support/dev.companion.app") }
fn prefs_path() -> PathBuf { data_dir().join("dock.json") }
static PREFS: Mutex<Option<Prefs>> = Mutex::new(None);
static SIG: Mutex<String> = Mutex::new(String::new());

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
    // On its edge, inside the work area, out of the clear zone at the top centre (the notch island). M37: or where it was
    // let go, away from every edge; it then faces the nearest edge and does not peek.
    let free = with_prefs(|p| p.free.get(&target.id).copied());
    let f = match free { Some(at) => docking::place_free(&target, DOCK, at, home_size()), None => docking::place(&target, DOCK, edge, pct, home_size()) };
    let edge = if free.is_some() { docking::nearest_edge(f, target.work) } else { edge };
    HOME_FREE.store(free.is_some(), Ordering::SeqCst);
    // This is home now. A drag or a display change also ends any visit beside a window, with no trip back, and stops a
    // trip that was under way where it is.
    ROAM_GEN.fetch_add(1, Ordering::SeqCst);
    roamer().placed_home(f);
    *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    *HOME_EDGE.lock().unwrap_or_else(|e| e.into_inner()) = edge;
    if let Some(app) = APP.get() { if roam_phase() != roam::Phase::Home { roam_say(app, roam::Phase::Home, roam::facing(roam::Phase::Home, f, f, None, edge)); } }
    // M47, M51: let go and gone in at an edge, a short plain ease onto it, no overshoot (at once with Reduce motion or Less
    // motion); let go in the middle
    // it is already where it belongs, and every other reason puts it there at once.
    let landing = match free { Some(at) => docking::Landing::Free(at), None => docking::Landing::Edge(edge, pct) };
    let secs = if reason == "drag" { docking::land_secs(&landing, reduce_motion()) } else { None };
    with_panels(|d, c| {
        if reason == "drag" { LAND_EASE.store(true, Ordering::SeqCst); }
        set_frame_moving(d, to_appkit(f, ph), secs, None, &DOCK_MOVES);
        place_card(d, c);
    });
    // Put at its place fully in view; it goes back past the edge on the next look, if it should (peek_apply).
    peek_placed();
    if !quiet { log("redock", json!({ "reason": reason, "how": how, "screen": target.id, "frame": f, "inside_work": inside(f, target.work) })); }
}

/// M47: the drag in progress (docking::Drag), followed by the shell itself from the mouse watch (`drag_follow`). Main thread.
static DRAG: Mutex<Option<docking::Drag>> = Mutex::new(None);
/// A drag began and was not let go yet (read off the main thread too, by `dragging()`).
static DRAG_LIVE: AtomicBool = AtomicBool::new(false);

/// Dragging the character (M47, the founder: "it cannot genuinely move freely in the middle. It just lags"): the page says
/// once that a drag began. From then on the shell moves the window itself, straight from the mouse watch (`drag_follow`),
/// with the pointer kept where it took hold; nothing crosses to the page and back on each move, and no placement runs
/// until the let go (`drop_dock`). Only the character's own page can begin one.
#[tauri::command]
fn drag_dock(app: AppHandle, window: tauri::WebviewWindow) {
    if window.label() != "dock" { return; }
    // A drag left behind by a release that never came is dropped first, so the first moves of this one never follow its
    // old grab (drag_follow runs as soon as DRAG_LIVE is set, before the new Drag begins on the main thread).
    *DRAG.lock().unwrap_or_else(|e| e.into_inner()) = None;
    // While the person drags it nothing else moves it (F18 item 2).
    DRAG_AT.store(now() as u64, Ordering::SeqCst);
    DRAG_LIVE.store(true, Ordering::SeqCst);
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let list = screens_now(mtm);
        let Some(first) = list.first() else { return };
        let ph = first.frame[3];
        let m = NSEvent::mouseLocation();
        // A trip under way stops where it is, and a peek still moving is replaced by where the window is now, so nothing
        // pulls the window away from the pointer.
        ROAM_GEN.fetch_add(1, Ordering::SeqCst);
        let Some(win) = with_panels(|d, _| { let f = d.frame(); set_frame_moving(d, f, None, None, &DOCK_MOVES); from_appkit(f, ph) }) else { return };
        let mut drag = docking::Drag::begin((m.x, ph - m.y), win, list);
        drag.set_dock_when(docking::DockWhen::from_value(&setting_now("character.dockWhen")));
        *DRAG.lock().unwrap_or_else(|e| e.into_inner()) = Some(drag);
    });
}

/// M47: one move of a drag, from the mouse watch on the main thread the moment macOS reports it: only the window's origin
/// is set, with the pointer kept where it took hold (docking::Drag::follow). How hard it is pushed into an edge goes to the
/// page at most once a frame (Drag::press_due), for the water to flatten against it (M37c). No displays are read, nothing
/// is saved and nothing else is placed here. Only a drag on the character's own window: never one in Home or elsewhere.
fn drag_follow(ev: &NSEvent) {
    if !DRAG_LIVE.load(Ordering::Relaxed) || ev.r#type() != NSEventType::LeftMouseDragged { return; }
    let Some(mtm) = MainThreadMarker::new() else { return };
    if let Some(w) = ev.window(mtm) { if with_panels(|d, _| !std::ptr::eq(&*w, &**d as &NSWindow)).unwrap_or(true) { return; } }
    let mut g = DRAG.lock().unwrap_or_else(|e| e.into_inner());
    let Some(drag) = g.as_mut() else { return };
    let ph = drag.primary_h();
    let m = NSEvent::mouseLocation();
    let Some(f) = drag.follow((m.x, ph - m.y)) else { return };
    let t = now() as u64;
    DRAG_AT.store(t, Ordering::Relaxed);
    // Noted as set at once, so a motion that ends now never puts the window back where it was (island::Moves).
    let at = to_appkit(f, ph);
    DOCK_MOVES.lock().unwrap_or_else(|e| e.into_inner()).ask([at.origin.x, at.origin.y, at.size.width, at.size.height], false);
    with_panels(|d, _| d.setFrameOrigin(at.origin));
    if !drag.press_due(t) { return; }
    let said = match drag.press() {
        Some((edge, press, screen_at)) => json!({ "edge": edge.word(), "press": press, "screenAt": screen_at }),
        None => json!({ "edge": Value::Null, "press": 0.0 }),
    };
    drop(g);
    if let Some(app) = APP.get() { let _ = app.emit_to("dock", "dock-press", said); }
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

/// The let go (M47): decided once, on the main thread after the drag's last move. Away from every edge it stays exactly
/// where it is; near one it snaps to it (docking::Drag::release). The place is saved once, the character is placed once
/// (apply_dock: home, trips, peeking, Home), and the pages are told where it is. A second let go saves nothing.
#[tauri::command]
fn drop_dock(app: AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let landed = DRAG.lock().unwrap_or_else(|e| e.into_inner()).take().and_then(|mut d| d.release(home_size()));
        if let (Some(l), Some(mtm)) = (&landed, MainThreadMarker::new()) {
            with_prefs(|p| p.land(&l.screen.id, l.how));
            save_prefs();
            // Let go and left where it is: the water springs back (the page's spring does the wobble, it is playing). Gone in at
            // an edge: it settles flat against it with no wobble (M51).
            let _ = a.emit_to("dock", "dock-press", match l.how { docking::Landing::Edge(..) => json!({ "press": 0.5, "firm": true }), _ => json!({ "press": 0.0 }) });
            apply_dock(mtm, "drag", true);
            log("dock_dropped", json!({ "screen": l.screen.id, "free": matches!(l.how, docking::Landing::Free(_)), "last_pointer": [l.pointer.0, l.pointer.1], "frame": l.frame, "work": l.screen.work }));
        }
        // A let go that decided nothing (no display): the water still lets go.
        if landed.is_none() { let _ = a.emit_to("dock", "dock-press", json!({ "press": 0.0 })); }
        // Only now, with the character at its new home, may anything else move it again.
        DRAG_LIVE.store(false, Ordering::SeqCst);
        DRAG_AT.store(0, Ordering::SeqCst);
        if landed.is_some() { place_told(&a); }
    });
}

