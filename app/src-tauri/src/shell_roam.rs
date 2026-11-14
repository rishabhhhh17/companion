// ---------- the companion comes to what it is about (F18 item 2; the rules are in roam.rs, tested) ----------

static ROAM: Mutex<roam::Roamer> = Mutex::new(roam::Roamer::new());
fn roamer() -> std::sync::MutexGuard<'static, roam::Roamer> { ROAM.lock().unwrap_or_else(|e| e.into_inner()) }
/// Each trip takes a number; a newer trip, a drag or a display change stops an older one where it is.
static ROAM_GEN: AtomicU64 = AtomicU64::new(0);
/// Where the character is right now (top left points), for the pointer check while it travels.
static ROAM_AT: Mutex<Option<Rect>> = Mutex::new(None);
/// The edge home is on, and the named state the character's page was last told.
static HOME_EDGE: Mutex<docking::Edge> = Mutex::new(docking::Edge::Right);
/// M37: the character was let go away from every edge and stays there (docking::Prefs::free); it never peeks then.
static HOME_FREE: AtomicBool = AtomicBool::new(false);
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
/// M83 Part D: a flying state also tells the page the trip's way, time and bend, so the body stretches, leans, grows and
/// lands along the same curve the window flies (flight.ts).
fn roam_say_flight(app: &AppHandle, phase: roam::Phase, toward: &str, from: Rect, to: Rect, ms: u64, up: bool) {
    *ROAM_PHASE.lock().unwrap_or_else(|e| e.into_inner()) = phase;
    let _ = app.emit_to("dock", "roam", json!({ "phase": phase.name(), "toward": toward, "ms": ms, "dx": to[0] - from[0], "dy": to[1] - from[1], "up": up }));
}

/// A drag in progress: while it is held, and for a second and a half after its last move (docking::drag_holds; one the
/// page never ended stops counting after DRAG_LOST_MS).
fn dragging() -> bool { docking::drag_holds(DRAG_LIVE.load(Ordering::SeqCst), DRAG_AT.load(Ordering::SeqCst), now() as u64) }
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

/// M83 Part D: home moved (a new edge or corner picked in Settings): it flies there from where it is, on the same curve as
/// any trip, or fades with Reduce motion. Main thread.
fn fly_home(app: &AppHandle, from: Rect, to: Rect) {
    *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(from);
    roam_animate(app, roam::Move { to, out: false }, reduce_motion());
}

/// One trip through the named states (roam::steps), telling the character's page each one. With reduced motion it
/// fades out, is put there, and fades back in (M83 Part D). A newer trip, a drag or a display change stops it where it is. Main thread (it reads the screens),
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
            let toward = roam::facing(phase, from, mv.to, side, edge);
            match phase {
                roam::Phase::Travel | roam::Phase::Return => {
                    roam_say_flight(&app, phase, toward, from, mv.to, ms, roam::bends_up(from, mv.to, ceiling));
                    if !roam_fly(&app, from, mv.to, ms, ceiling, gen) { return; }
                }
                _ => roam_say(&app, phase, toward),
            }
            match phase {
                roam::Phase::Travel | roam::Phase::Return => {}
                roam::Phase::Surface | roam::Phase::Settle | roam::Phase::Fade => std::thread::sleep(Duration::from_millis(ms)),
                roam::Phase::Visiting | roam::Phase::Home => roam_set(&app, mv.to, gen),
            }
        }
    });
}

/// The trip itself: the arrow's arc and easing (trip::Fly). M66: it runs on the display link of the character's window,
/// one move per refresh (trip_start); this thread only waits to hear that it arrived (true) or that a newer trip, a drag
/// or a display change stopped it (false).
fn roam_fly(app: &AppHandle, from: Rect, to: Rect, ms: u64, ceiling: f64, gen: u64) -> bool {
    let up = roam::bends_up(from, to, ceiling);
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let fly = trip::Fly::new(from, to, ms, up);
    let _ = app.run_on_main_thread(move || trip_start(fly, gen, tx));
    // A step that is dropped (a newer trip replaced it) drops its sender too, which ends this wait as not arrived.
    rx.recv().unwrap_or(false)
}

/// Starts a trip on the display's clock. Each refresh: stop if a newer trip took over, hold while the pointer is over the
/// character or it is dragged (the time does not count), else one setFrameOrigin to where the trip is when that frame
/// shows. Main thread. Takes no focus and never orders the panel in.
fn trip_start(mut fly: trip::Fly, gen: u64, tx: std::sync::mpsc::Sender<bool>) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    if ROAM_GEN.load(Ordering::SeqCst) != gen { return; }
    let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    let _ = with_panels(|d, _| {
        // Any peek still moving the window is replaced at once, so it never ends on its own older target mid trip.
        let f = d.frame();
        set_frame_moving(d, f, None, None, &DOCK_MOVES);
        let d2 = objc2::Message::retain(d);
        trip::clock::run(mtm, d, Box::new(move |t| {
            if ROAM_GEN.load(Ordering::SeqCst) != gen { let _ = tx.send(false); return false; }
            let (r, end) = fly.frame(t, roam_blocked());
            *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(r);
            DOCK_MOVES.lock().unwrap_or_else(|e| e.into_inner()).ask([r[0], ph - (r[1] + r[3]), r[2], r[3]], false);
            d2.setFrameOrigin(NSPoint::new(r[0], ph - (r[1] + r[3])));
            if end { let _ = tx.send(true); return false; }
            true
        }));
    });
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
    // Most events are not news for peeking (a tool line, the cost): nothing more is done for them. Stop everything and the
    // lights are all news (peek::news_of), so the peek out of the notch hears each of them below.
    if peek::news_of(v).is_empty() { return; }
    let lit = peeker().hear(v, now() as u64, quiet);
    // M90: Stop everything and the lights hide Flowflow peeking out of the notch (shell_peekout.rs). After the light is set,
    // so the peek reads it on, and waited for, so it is gone before the microphone opens or the screen is read (rule 5).
    peekout_heard(app, v);
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
    let n = peek::Now { now: now() as u64, on: hs.peek, stick: hs.stick, idle_on: hs.peek_idle, calm, at_home };
    // M37: a character let go in the middle of the screen has no edge to tuck into, so it stays fully in.
    let pose = if HOME_FREE.load(Ordering::SeqCst) { peek::Pose::In } else { peeker().pose(&n, quiet) };
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
    PEEK_IN.store(peek::coming_in(was, pose), Ordering::SeqCst);
    with_panels(|d, _| set_frame_moving(d, to_appkit(f, ph), secs, None, &DOCK_MOVES));
    *ROAM_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) = pose;
    if pose == peek::Pose::Hidden { edge_wake(); }
    // The page leans toward the screen while it peeks (dock.tsx data-peek). Where it may not hide, it is simply in.
    let shown = if f == home { peek::Pose::In } else { pose };
    // M37d: and where the screen's edge is from the window's own top left, so the water flattens against the real edge.
    // M66: and how long the move takes, so the water's lag and splash end with it.
    let _ = app.emit_to("dock", "peek", json!({ "pose": shown.word(), "edge": edge.word(), "screenAt": docking::screen_at(edge, s, f), "ms": secs.map(|s| (s * 1000.0).round() as u64).unwrap_or(0) }));
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
/// The last place of the pointer the character's page was told (gaze.rs), so only a real move is sent.
static LAST_GAZE: Mutex<Option<(f64, f64)>> = Mutex::new(None);

/// M46: the eyes follow the pointer now (gaze.rs `follows`: Lively, and not No), the character is not resting and
/// Companion is not hidden. While false the eyes' thread sleeps with no timer and never asks the main thread.
static GAZE_WANTED: AtomicBool = AtomicBool::new(false);
/// The eyes' thread and the ring's thread, kept so a change can wake them (std::thread::park and unpark).
static GAZE_THREAD: OnceLock<std::thread::Thread> = OnceLock::new();
static FOLLOW_THREAD: OnceLock<std::thread::Thread> = OnceLock::new();
/// When the ring's page last finished loading (now(), in ms); 0 until it has. follow::reshow.
static FOLLOW_PAGE_AT: AtomicU64 = AtomicU64::new(0);
fn gaze_wake() { if let Some(t) = GAZE_THREAD.get() { t.unpark(); } }
/// The thread that watches for the pointer at the edge while the character is tucked away (must fix 33): parked otherwise.
static EDGE_THREAD: OnceLock<std::thread::Thread> = OnceLock::new();
fn edge_wake() { if let Some(t) = EDGE_THREAD.get() { t.unpark(); } }
/// Wakes the ring's thread, so it looks again at once whether the water ring should show (listening, a ring pointing at a
/// place put up or put away, a setting, hidden or shown, rest). Any thread.
fn follow_wake() { if let Some(t) = FOLLOW_THREAD.get() { t.unpark(); } }
/// Works out again whether the eyes follow the pointer, and wakes their thread. Called when How lively or what follows
/// changes, when rest changes, and when Companion is hidden or shown. Any thread.
fn gaze_recompute() {
    let w = gaze::follows(&setting_now("character.follow"), &setting_now("character.lively")) && !REST.load(Ordering::SeqCst) && !companion_hidden();
    GAZE_WANTED.store(w, Ordering::SeqCst);
    gaze_wake();
}
/// The eyes' own thread: while they follow the pointer, a look every gaze::POLL_MS (on the main thread, gaze_tick);
/// otherwise it parks until gaze_wake, so in Still and Gentle it costs nothing.
fn gaze_loop(app: AppHandle) {
    let _ = GAZE_THREAD.set(std::thread::current());
    loop {
        match gaze::next(GAZE_WANTED.load(Ordering::SeqCst)) {
            follow::Next::Tick(ms) => std::thread::sleep(Duration::from_millis(ms)),
            follow::Next::Park => std::thread::park(),
            follow::Next::ParkFor(ms) => std::thread::park_timeout(Duration::from_millis(ms)),
        }
        if !GAZE_WANTED.load(Ordering::SeqCst) { continue; }
        if *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) == peek::Pose::Hidden { continue; }
        let h2 = app.clone();
        let _ = app.run_on_main_thread(move || gaze_tick(&h2));
    }
}

/// Follow my pointer (gaze.rs): while the eyes follow it (GAZE_WANTED) and the character is in view, where the pointer is
/// from the middle of the character's window, sent only when it moved. Main thread (the window's frame).
fn gaze_tick(app: &AppHandle) {
    if !GAZE_WANTED.load(Ordering::SeqCst) { return; }
    if *PEEK_POSE.lock().unwrap_or_else(|e| e.into_inner()) == peek::Pose::Hidden { return; }
    let Some(mtm) = MainThreadMarker::new() else { return };
    let primary_h = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    let Some(frame) = with_panels(|dock, _| from_appkit(dock.frame(), primary_h)) else { return };
    let p = macos_see::pointer();
    if p.x < 0.0 && p.y < 0.0 { return; }
    let rel = gaze::relative((p.x, p.y), frame);
    let mut last = LAST_GAZE.lock().unwrap_or_else(|e| e.into_inner());
    if !gaze::worth_sending(*last, rel) { return; }
    *last = Some(rel);
    let _ = app.emit_to("dock", "gaze", json!({ "dx": rel.0, "dy": rel.1 }));
}

/// The water ring around the pointer (follow.rs, M37; M46): about 120 times a second while it shows (follow::shown: at
/// rest only in Lively, in every choice while listening, never under a ring pointing at a place, never while hidden or
/// resting), its window is put on the pointer. Otherwise the window is put away once, the page is told to draw nothing
/// (follow-hide), and the thread sleeps with no timer until follow_wake, or until a pointing ring goes by itself when the
/// water ring would show after it. Its own thread.
fn follow_loop(app: AppHandle) {
    let _ = FOLLOW_THREAD.set(std::thread::current());
    let mut d = follow::Drop::default();
    let (mut shown, mut tick, mut fresh) = (false, 0u64, true);
    let (mut lively, mut follow_v, mut water) = (Value::Null, Value::Null, Value::Null);
    let mut last = std::time::Instant::now();
    let mut last_fr = [f64::NAN; 4];
    let mut sent_speed = 0.0f64;
    loop {
        // The settings: on the first pass, after every sleep, and every 30 ticks while it shows.
        if fresh || tick % 30 == 0 { lively = setting_now("character.lively"); follow_v = setting_now("character.follow"); water = setting_now("look.water"); }
        fresh = false;
        tick += 1;
        // Resting (a call with Quiet during calls on, or Low Power Mode) takes Lively's ring off the pointer, never the
        // listening one (rest.rs).
        let (listening, pointing, quiet, hidden) = (listening_now(), overlay_busy(), REST.load(Ordering::SeqCst), companion_hidden());
        let want = follow::shown(&lively, &follow_v, listening, pointing, quiet, hidden);
        let after = follow::shown(&lively, &follow_v, listening, false, quiet, hidden);
        match follow::next(want, overlay_busy_left_ms(), after) {
            follow::Next::Tick(ms) => std::thread::sleep(Duration::from_millis(ms)),
            park @ (follow::Next::Park | follow::Next::ParkFor(_)) => {
                if shown {
                    shown = false; d.placed = false; FOLLOW_LIVE.store(false, Ordering::SeqCst);
                    let _ = app.run_on_main_thread(|| FOLLOW.with(|f| { if let Some(p) = f.borrow().as_ref() { p.orderOut(None); } }));
                    let _ = app.emit_to("follow", "follow-hide", json!({}));
                }
                if let follow::Next::ParkFor(ms) = park { std::thread::park_timeout(Duration::from_millis(ms)); } else { std::thread::park(); }
                fresh = true;
                last = std::time::Instant::now();
                continue;
            }
        }
        // A page that loaded under a ring already shown missed its follow-show: tell it again for a moment (follow::reshow).
        let loaded = FOLLOW_PAGE_AT.load(Ordering::SeqCst);
        if follow::reshow(shown, tick, (loaded > 0).then(|| (now() as u64).saturating_sub(loaded))) {
            let _ = app.emit_to("follow", "follow-show", json!({ "water": water, "lively": lively }));
        }
        let now = std::time::Instant::now();
        let dt = (now - last).as_secs_f64();
        last = now;
        let p = macos_see::pointer();
        if p.x < 0.0 && p.y < 0.0 { continue; }
        d.step((p.x, p.y), dt);
        if FOLLOW_LIVE.load(Ordering::SeqCst) && follow_lead().settle(follow::clock_s()) { let _ = app.run_on_main_thread(follow_settle); }
        let saying = { let mut g = FOLLOW_SAY.lock().unwrap_or_else(|e| e.into_inner()); if g.as_ref().is_some_and(|(_, at)| at.elapsed() > Duration::from_millis(follow::SAY_MS)) { *g = None; let _ = app.emit_to("follow", "follow-say", json!({ "text": "" })); } g.is_some() };
        let (fr, first) = (if saying { d.frame_saying() } else { d.frame() }, !shown);
        // The speed goes to the page while it moves and until it has eased back to nothing (M37: the ring's stretch).
        let speed = d.vx.hypot(d.vy);
        if tick % 2 == 0 && (speed > 1.0 || sent_speed > 1.0) { let _ = app.emit_to("follow", "follow-move", json!({ "vx": d.vx, "vy": d.vy, "water": water, "lively": lively })); sent_speed = speed; }
        // Still: nothing to move (no work for the main thread while the pointer rests), compared with the frame last set.
        if !first && fr.iter().zip(last_fr.iter()).all(|(a, b)| (a - b).abs() < 0.25) { continue; }
        // M41: once shown, the mouse watch moves it (follow_to_pointer); this loop only shows it and changes its width.
        if !first && (fr[2] - last_fr[2]).abs() < 0.5 { last_fr = fr; continue; }
        // M37 (the founder: "it lags a bit"): one move waits on the main thread at most. A move that is still queued is not
        // queued again (they used to pile up behind other work and the ring fell behind), and the move reads where the
        // pointer is at the moment it runs, so it is always the latest place, never an old one.
        if !first && FOLLOW_QUEUED.swap(true, Ordering::SeqCst) { continue; }
        if first { FOLLOW_QUEUED.store(true, Ordering::SeqCst); }
        last_fr = fr;
        shown = true;
        let (w, h, vx, vy) = (fr[2], fr[3], d.vx, d.vy);
        let _ = app.run_on_main_thread(move || {
            FOLLOW_QUEUED.store(false, Ordering::SeqCst);
            let Some(mtm) = MainThreadMarker::new() else { return };
            let primary_h = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
            let p = macos_see::pointer();
            // Placed a touch ahead of a moving pointer, so it lands on the cursor when the screen shows it (follow::led).
            let (lx, ly) = follow::led((p.x, p.y), (vx, vy));
            let (x, y) = if p.x < 0.0 && p.y < 0.0 { (fr[0], fr[1]) } else { (lx + follow::OFFSET.0 - follow::SIZE / 2.0, ly + follow::OFFSET.1 - follow::SIZE / 2.0) };
            FOLLOW.with(|f| { if let Some(pn) = f.borrow().as_ref() {
                if (pn.frame().size.width - w).abs() > 0.5 { pn.setFrame_display(NSRect::new(NSPoint::new(x, primary_h - (y + h)), NSSize::new(w, h)), true); }
                else { pn.setFrameOrigin(NSPoint::new(x, primary_h - (y + h))); }
                if first { pn.orderFrontRegardless(); FOLLOW_LIVE.store(true, Ordering::SeqCst); }
            } });
        });
        // The first time it shows, the page draws again (follow-show) and learns the water colour and whether Lively is
        // chosen (only Lively keeps the ring's small waves moving at rest, M46).
        if first {
            let _ = app.emit_to("follow", "follow-show", json!({ "water": water, "lively": lively }));
            let _ = app.emit_to("follow", "follow-move", json!({ "vx": 0.0, "vy": 0.0, "water": water, "lively": lively }));
        }
    }
}

fn peek_edge_poll(app: &AppHandle) {
    if !home_set().peek { return; }
    let Some(mtm) = MainThreadMarker::new() else { return };
    if pointer_on_character(mtm) == Some(true) { peeker().pointer(true, now() as u64); peek_apply(app, false); }
}

/// The curve of the character's own moves (peek::curve: easing out as it comes in, the exit curve as it goes back past the
/// edge, never past its place), set on the motion's context. CAMediaTimingFunction is looked up by name (QuartzCore is
/// already loaded by AppKit), so no new dependency. If it is missing the move is the usual curve.
fn spring_timing(ctx: &objc2_app_kit::NSAnimationContext) { curve_timing(ctx, peek::curve(PEEK_IN.load(Ordering::SeqCst))); }
/// M66: whether the character's last peek move shows more of it (peek::coming_in), for its curve.
static PEEK_IN: AtomicBool = AtomicBool::new(true);

/// Any curve as a CAMediaTimingFunction's four control points, set on the motion's context (M66: motion.rs's curves).
fn curve_timing(ctx: &objc2_app_kit::NSAnimationContext, curve: [f32; 4]) {
    use objc2::runtime::{AnyClass, AnyObject, MessageReceiver};
    let Some(cls) = AnyClass::get(c"CAMediaTimingFunction") else { return };
    let [a, b, c, d] = curve;
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
fn home_size() -> island::HomeSize { island::with_settings(home_set().size, SETTINGS_OPEN.load(Ordering::SeqCst)) }

/// What the shell does at once when one of these changes (homeset.rs). The rest are read where they are used (the waits on
/// the island, the wait beside a window, the motion, full screen apps) and need nothing more.
fn home_setting_applied(app: &AppHandle, key: &str) {
    match key {
        // The island shown or hidden, on another display, or Home another size: everything is put back where it belongs.
        "island.show" | "island.display" | "home.size" | "look.layout" => {
            let size = key == "home.size" || key == "look.layout";
            let _ = app.run_on_main_thread(move || {
                let Some(mtm) = MainThreadMarker::new() else { return };
                let _hs = home_set();
                let now = home_size();
                CARD_H.store((CARD_H.load(Ordering::SeqCst) as f64).clamp(now.min_h, now.max_h) as u64, Ordering::SeqCst);
                reset_hover();
                place_island(mtm, false, "setting");
                // Put in place first, then shown (unless Companion is hidden): it never shows where it was.
                island_show(!USER_HID.load(Ordering::SeqCst) && !HIDDEN_BY_US.load(Ordering::SeqCst));
                // Home's size: the character's own place keeps clear of Home at the new size (docking.rs dock_zone).
                if size { apply_dock(mtm, "setting", true); }
                with_panels(place_card);
            });
        }
        // The status on pointing: what shows now is put back, and the next pointing uses the new waits.
        "island.peekOnHover" | "island.openDelay" | "island.closeDelay" => {
            let _ = app.run_on_main_thread(|| { reset_hover(); if let Some(mtm) = MainThreadMarker::new() { place_island(mtm, false, "setting"); } });
        }
        // M46: How lively or what follows the pointer changed: the eyes' and the ring's threads look again at once (each
        // sleeps with no timer while it has nothing to do). Rest in Low Power Mode is looked at on the next tick.
        "character.lively" | "character.follow" | "character.restLowPower" => { gaze_recompute(); follow_wake(); }
        // Peeking turned on or off: the character goes where it should be now (fully in when off).
        "character.peek" | "character.peekIdle" => { let a = app.clone(); let _ = app.run_on_main_thread(move || peek_apply(&a, false)); }
        // M90: Flowflow peeking out of the notch turned on or off, or moved to the other side.
        "notch.peek" | "notch.peekSide" => { let _ = app.run_on_main_thread(|| { PEEKOUT_TOLD.lock().unwrap_or_else(|e| e.into_inner()).take(); peekout_apply("setting"); }); }
        // Close Home when I click another app: the watch reads the setting at each look (watch_home), so the click away
        // stops at once when it is turned off, or starts when it is turned on; the click through goes on either way.
        "home.closeOnClickAway" => {}
        _ => {}
    }
}

