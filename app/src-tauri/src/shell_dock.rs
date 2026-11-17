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
    // M111 review: tucked with the notch off (an old dock.json, or the notch turned off while the app was closed): it comes
    // out for good, so the notch turned on later never hides it by surprise.
    let island_on = home_set().island_show;
    if with_prefs(|p| docking::notch_turned(p, island_on)) { save_prefs(); }
    let Some((target, how)) = with_prefs(|p| pick(&list, p, (m.x, ph - m.y)).map(|(s, h)| (s.clone(), h))) else { return };
    let (edge, pct) = with_prefs(|p| {
        if p.last_screen != target.id { p.last_screen = target.id.clone(); }
        choice(p, &target.id)
    });
    // Another display, or the launch, can change the place Settings shows: the pages are told (a drag tells them once, on
    // the drop).
    if reason != "drag" && place_shown_changed() { if let Some(app) = APP.get() { place_told(app); } }
    // M111: tucked into the notch, it has no place on any display: its window stays out, any trip ends, and a display
    // change never brings it back by itself.
    if tucked() {
        ROAM_GEN.fetch_add(1, Ordering::SeqCst);
        if roamer().visit().is_some() { roamer().end(); }
        with_panels(|d, _| d.orderOut(None));
        if !quiet { log("redock", json!({ "reason": reason, "how": how, "screen": target.id, "tucked": true })); }
        return;
    }
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
    // M83 Part D: a new place picked in Settings (another edge or corner) is a trip: it flies there on the curve, as it
    // does to a window and home (a plain fade with Reduce motion). Every other reason is as before.
    let was = with_panels(|d, _| from_appkit(d.frame(), ph));
    let flies = reason == "setting" && was.is_some_and(|w| (w[0] - f[0]).hypot(w[1] - f[1]) > 4.0);
    if let (true, Some(app), Some(from)) = (flies, APP.get(), was) { fly_home(app, from, f); with_panels(place_card); } else {
    with_panels(|d, c| {
        if reason == "drag" { LAND_EASE.store(true, Ordering::SeqCst); }
        set_frame_moving(d, to_appkit(f, ph), secs, None, &DOCK_MOVES);
        place_card(d, c);
    });
    }
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
        // M111: let go over the notch, it tucks in (only while the notch shows).
        drag.set_tuck(home_set().island_show);
        *DRAG.lock().unwrap_or_else(|e| e.into_inner()) = Some(drag);
        // M111, the bubbles bug: Home opened beside the character (the notch off) is never left where it was.
        tied_close(docking::Change::DragBegan);
    });
}

/// M47: one move of a drag, from the mouse watch on the main thread the moment macOS reports it: only the window's origin
/// is set, with the pointer kept where it took hold (docking::Drag::follow). How hard it is pushed into an edge goes to the
/// page at most once a frame (Drag::press_due), for the water to flatten against it (M37c). No displays are read, nothing
/// is saved and nothing else is placed here. Only a drag on the character's own window: never one in Home or elsewhere.
fn drag_follow(ev: &NSEvent) {
    if !DRAG_LIVE.load(Ordering::Relaxed) || ev.r#type() != NSEventType::LeftMouseDragged { return; }
    let Some(mtm) = MainThreadMarker::new() else { return };
    // M111: a drag out of the notch began in the island's or Home's window, and its moves arrive there.
    if !DRAG_FROM_NOTCH.load(Ordering::Relaxed) { if let Some(w) = ev.window(mtm) { if with_panels(|d, _| !std::ptr::eq(&*w, &**d as &NSWindow)).unwrap_or(true) { return; } } }
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
    // M111: over the notch, the notch says it will take it and Flowflow shrinks toward it; moved away, both undone.
    let over = drag.over_notch();
    if (ISLAND_TAKE.load(Ordering::Relaxed) == island::TAKE_HINT) != over { drop(g); take_hint(over); return; }
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
        let from_notch = DRAG_FROM_NOTCH.swap(false, Ordering::SeqCst);
        // M111: the notch stops saying it will take it, and after a drag from or over the notch forgets any hover the drag
        // passed through and is placed again, so its row is never left drawn while the shell thinks it closed. An ordinary
        // drag never touches the notch's hover (the M111 review).
        let took = ISLAND_TAKE.load(Ordering::SeqCst) == island::TAKE_HINT;
        if took { take_hint(false); }
        if from_notch || took { reset_hover(); if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "drop"); } }
        if let (Some(l), Some(mtm)) = (&landed, MainThreadMarker::new()) {
            with_prefs(|p| p.land(&l.screen.id, l.how));
            save_prefs();
            // M111: let go over the notch: it shrinks up into it, then its window goes (no place on the screen to put it).
            let tuck = l.how == docking::Landing::Tuck;
            if tuck { tuck_away(&a, "drag"); log("dock_tucked", json!({ "screen": l.screen.id })); } else {
            tied_close(docking::Change::Landed);
            // Let go and left where it is: the water springs back (the page's spring does the wobble, it is playing). Gone in at
            // an edge: it settles flat against it with no wobble (M51).
            let _ = a.emit_to("dock", "dock-press", match l.how { docking::Landing::Edge(..) => json!({ "press": 0.5, "firm": true }), _ => json!({ "press": 0.0 }) });
            apply_dock(mtm, "drag", true);
            log("dock_dropped", json!({ "screen": l.screen.id, "free": matches!(l.how, docking::Landing::Free(_)), "last_pointer": [l.pointer.0, l.pointer.1], "frame": l.frame, "work": l.screen.work }));
            }
        }
        // A let go that decided nothing (no display): the water still lets go.
        if landed.is_none() { let _ = a.emit_to("dock", "dock-press", json!({ "press": 0.0 })); }
        // M111: pulled out of the notch but never moved: it goes back in, nothing is saved.
        if landed.is_none() && from_notch { with_prefs(|p| p.tucked = true); tuck_away(&a, "drag_back"); }
        // Only now, with the character at its new home, may anything else move it again.
        DRAG_LIVE.store(false, Ordering::SeqCst);
        DRAG_AT.store(0, Ordering::SeqCst);
        if landed.is_some() { place_told(&a); }
    });
}


// ---------- M111: Flowflow tucked into the notch (the rules are in docking.rs, tested) ----------

/// What the notch's take row says now (island::take_word): nothing, that it will take Flowflow (the pointer is over it
/// during a drag), or for a moment after a tuck where it went.
static ISLAND_TAKE: AtomicU8 = AtomicU8::new(island::TAKE_NONE);
/// Each "where it went" line takes a number, so a late clear never ends a newer one.
static TAKE_SAID_GEN: AtomicU64 = AtomicU64::new(0);
/// This drag began by pulling Flowflow out of the notch (its moves arrive in the island's or Home's window).
static DRAG_FROM_NOTCH: AtomicBool = AtomicBool::new(false);
/// Each tuck or bring out takes a number, so a late order out never hides a Flowflow brought out meanwhile.
static TUCK_GEN: AtomicU64 = AtomicU64::new(0);

/// Tucked into the notch, and the notch is there to hold it (docking::tucked_in).
fn tucked() -> bool { let on = home_set().island_show; with_prefs(|p| docking::lives(p, &p.last_screen, on) == docking::Lives::Tucked) }

/// Orders the character's window in, unless it lives in the notch now. Never takes focus.
fn dock_front(d: &NSPanel) { if !tucked() { d.orderFrontRegardless(); } }

/// Home when it opens beside the character (the notch off) is tied to it: it closes at once rather than float where the
/// character was (docking::tied_after). Home dropped from the notch is not tied to the character and stays. Main thread.
fn tied_close(change: docking::Change) {
    let beside = !home_set().island_show && card_visible();
    if docking::tied_after(change, beside) == docking::Tied::Close { home_stop_now("character_moved"); }
}

/// The pointer came over the notch during a drag, or left it: the notch grows its row with the line and the glow, and the
/// character's page shrinks toward it. Main thread.
fn take_hint(on: bool) {
    take_say(if on { island::TAKE_HINT } else { island::TAKE_NONE });
    if let Some(app) = APP.get() { let _ = app.emit_to("dock", "tuck-hint", json!({ "on": on })); }
}

/// Sets what the notch's take row says and places the island for it. After a tuck (TAKE_TUCKED) it says where the
/// character went for island::TUCKED_SAY_MS, then the notch goes back to its rest. Main thread.
fn take_say(n: u8) {
    ISLAND_TAKE.store(n, Ordering::SeqCst);
    let gen = TAKE_SAID_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "take"); }
    if n != island::TAKE_TUCKED { return; }
    let Some(app) = APP.get() else { return };
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(island::TUCKED_SAY_MS));
        let _ = a.run_on_main_thread(move || if TAKE_SAID_GEN.load(Ordering::SeqCst) == gen { take_said_clear(); });
    });
}

/// Ends the "where it went" line now (its time is up, or the pointer came onto the notch to see it). Main thread.
fn take_said_clear() {
    if ISLAND_TAKE.compare_exchange(island::TAKE_TUCKED, island::TAKE_NONE, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "take"); }
    }
}

/// Tucks Flowflow into the notch: it shrinks up into it on a short spring (a fade with Reduce Motion or Less motion), then
/// its window is ordered out. Any visit beside a window ends. Main thread.
fn tuck_away(app: &AppHandle, why: &str) {
    let calm = reduce_motion();
    ROAM_GEN.fetch_add(1, Ordering::SeqCst);
    if roamer().visit().is_some() { roamer().end(); }
    tied_close(docking::Change::Tucked);
    let gen = TUCK_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = app.emit_to("dock", "dock-tuck", json!({ "on": true, "calm": calm, "ms": docking::tuck_ms(calm) }));
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(docking::tuck_ms(calm)));
        let _ = a.run_on_main_thread(move || if TUCK_GEN.load(Ordering::SeqCst) == gen && tucked() { with_panels(|d, _| d.orderOut(None)); });
    });
    settings_told(app, &["character.lives".to_string()]);
    // The notch says for a moment where it went, so a tuck by accident never looks like it vanished (the M111 review).
    take_say(island::TAKE_TUCKED);
    log("tucked", json!({ "why": why }));
}

/// Brings Flowflow out of the notch to the edge and place it last had (tucking kept them). Main thread.
fn come_out(app: &AppHandle, why: &str) {
    TUCK_GEN.fetch_add(1, Ordering::SeqCst);
    let Some(mtm) = MainThreadMarker::new() else { return };
    apply_dock(mtm, "untuck", true);
    // Anything placed beside it is placed again with it (place_card in apply_dock).
    tied_close(docking::Change::Untucked);
    let _ = app.emit_to("dock", "dock-tuck", json!({ "on": false, "calm": reduce_motion() }));
    if !companion_hidden() { with_panels(|d, _| d.orderFrontRegardless()); }
    settings_told(app, &["character.lives".to_string()]);
    log("untucked", json!({ "why": why }));
}

/// Settings: Where Flowflow lives (character.lives), kept in dock.json. Changed only through settings_set (card only).
fn lives_set(app: &AppHandle, next: Prefs) {
    let tuck = next.tucked;
    with_prefs(|p| *p = next);
    save_prefs();
    let a = app.clone();
    let _ = app.run_on_main_thread(move || if tuck { if tucked() { tuck_away(&a, "setting"); } } else { come_out(&a, "setting"); });
}

/// The Bring Flowflow out button in the opened notch. Only from the notch's own pages.
#[tauri::command]
fn untuck(app: AppHandle, window: tauri::WebviewWindow) {
    if !matches!(window.label(), "card" | "island") { return; }
    let changed = with_prefs(|p| { let was = p.tucked; p.untuck(); was });
    if !changed { return; }
    save_prefs();
    let a = app.clone();
    let _ = app.run_on_main_thread(move || come_out(&a, "button"));
}

/// Dragging Flowflow's face out of the hovered or opened notch: the character's window shows centred under the pointer and
/// the shell follows it exactly as any drag (docking::Drag); the let go (drop_dock) lands it where it is let go, snapped
/// to an edge as usual, or tucks it again over the notch. Only from the notch's own pages, only while tucked. Never takes
/// focus.
#[tauri::command]
fn untuck_drag(app: AppHandle, window: tauri::WebviewWindow) {
    if !matches!(window.label(), "card" | "island") || !tucked() { return; }
    *DRAG.lock().unwrap_or_else(|e| e.into_inner()) = None;
    DRAG_AT.store(now() as u64, Ordering::SeqCst);
    DRAG_LIVE.store(true, Ordering::SeqCst);
    DRAG_FROM_NOTCH.store(true, Ordering::SeqCst);
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let list = screens_now(mtm);
        let Some(first) = list.first() else { return };
        let ph = first.frame[3];
        let m = NSEvent::mouseLocation();
        let p = (m.x, ph - m.y);
        // Untucked in memory now, so nothing hides it mid drag; the let go saves where it lands (or tucks it again).
        with_prefs(|pr| pr.untuck());
        TUCK_GEN.fetch_add(1, Ordering::SeqCst);
        ROAM_GEN.fetch_add(1, Ordering::SeqCst);
        let win = [p.0 - DOCK.0 / 2.0, p.1 - DOCK.1 / 2.0, DOCK.0, DOCK.1];
        with_panels(|d, _| { set_frame_moving(d, to_appkit(win, ph), None, None, &DOCK_MOVES); if !companion_hidden() { d.orderFrontRegardless(); } });
        let _ = a.emit_to("dock", "dock-tuck", json!({ "on": false, "calm": reduce_motion(), "drag": true }));
        let mut drag = docking::Drag::begin(p, win, list);
        drag.set_dock_when(docking::DockWhen::from_value(&setting_now("character.dockWhen")));
        drag.set_tuck(home_set().island_show);
        *DRAG.lock().unwrap_or_else(|e| e.into_inner()) = Some(drag);
        log("untuck_drag", json!({ "from": "notch" }));
    });
}
