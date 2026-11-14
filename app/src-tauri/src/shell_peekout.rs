// M90 (F32): Flowflow peeks out of the notch. The glue for peekout.rs: the page's wish (peekout_want), the shell's own hard
// rules (peekout::allowed), where the window goes (beside the island, on its display), its click through and its hover
// (the pointer on the head is the pointer on the notch: the same hover panel opens), and hiding it at once for Stop
// everything. The panel never becomes key (make_panel, not Home's subclass), and only the pointer's place is read.

thread_local! { static PEEKOUT: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) }; }
/// The page wants to be out (its own rules, peekOut.ts).
static PEEKOUT_WANT: AtomicBool = AtomicBool::new(false);
/// Out now (allowed, and told to the page).
static PEEKOUT_ON: AtomicBool = AtomicBool::new(false);
/// Its window's frame while out (global top left points), for the click through and the hover.
static PEEKOUT_AT: Mutex<Option<Rect>> = Mutex::new(None);
/// The pointer is on the head (its window takes clicks), and the island was told the pointer is on it.
static PEEKOUT_ON_HEAD: AtomicBool = AtomicBool::new(false);
static PEEKOUT_HOVER: AtomicBool = AtomicBool::new(false);
/// Stop everything was pressed: no wish to be out counts until this time (peekout::STOP_HOLD_MS).
static PEEKOUT_STOP_UNTIL: AtomicU64 = AtomicU64::new(0);
/// Where the window would be now (beside the island, allowed or not), for the menu bar rule while it is aside.
static PEEKOUT_SPOT: Mutex<Option<Rect>> = Mutex::new(None);
/// The pointer is along the menu bar near it (peekout::menu_reach): it is aside until the pointer leaves.
static PEEKOUT_MENU: AtomicBool = AtomicBool::new(false);
/// Each change of out or in, so a late order out never hides a peek that came back.
static PEEKOUT_GEN: AtomicU64 = AtomicU64::new(0);
/// The last thing the page was told, so it is told only on a change.
static PEEKOUT_TOLD: Mutex<Option<(bool, &'static str)>> = Mutex::new(None);

/// The page says whether it wants to be out. Never makes the window key, never moves the pointer.
#[tauri::command]
fn peekout_want(app: AppHandle, show: bool) {
    PEEKOUT_WANT.store(show, Ordering::SeqCst);
    let _ = app.run_on_main_thread(|| peekout_apply("want"));
}

/// For the page when it loads: whether it is out now, and its side.
#[tauri::command]
fn peekout_state() -> Value {
    json!({ "on": PEEKOUT_ON.load(Ordering::SeqCst), "side": peekout::Side::of(&setting_now("notch.peekSide")).word() })
}

/// Puts the peek out or in, from the page's wish and the shell's own rules, beside the island on its display. Main thread.
fn peekout_apply(reason: &str) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let hs = home_set();
    let side = peekout::Side::of(&setting_now("notch.peekSide"));
    let on_display = ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let isl = *ISLAND_AT.lock().unwrap_or_else(|e| e.into_inner());
    let mode = island::mode({ let mut s = *ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()); s.home_open = HOME_OPEN.load(Ordering::SeqCst); s });
    let want = PEEKOUT_WANT.load(Ordering::SeqCst);
    // The rules cheapest first: nothing else is read while the page does not want to be out.
    let facts = peekout::Facts {
        on: setting_now("notch.peek") != json!(false),
        want,
        kind: on_display.as_ref().map(island::kind).unwrap_or(island::Kind::Edge),
        mode,
        island_shown: hs.island_show && on_display.is_some() && island_rect(NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0)).is_some(),
        home_open: HOME_OPEN.load(Ordering::SeqCst) || HOME_SHOWN.load(Ordering::SeqCst),
        quiet: want && quiet(),
        lit: peeker().light() || overlay_busy(),
        hidden: companion_hidden(),
        stopped: (now() as u64) < PEEKOUT_STOP_UNTIL.load(Ordering::SeqCst),
        menu: PEEKOUT_MENU.load(Ordering::SeqCst),
    };
    let spot = match (on_display.as_ref(), isl) { (Some(d), Some(isl)) => peekout::frame(d, isl, side), _ => None };
    *PEEKOUT_SPOT.lock().unwrap_or_else(|e| e.into_inner()) = spot;
    let place = if peekout::allowed(&facts).is_ok() { spot } else { None };
    let was = PEEKOUT_ON.load(Ordering::SeqCst);
    let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    match place {
        Some(f) => {
            PEEKOUT_ON.store(true, Ordering::SeqCst);
            if !was { PEEKOUT_GEN.fetch_add(1, Ordering::SeqCst); }
            *PEEKOUT_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
            PEEKOUT.with(|p| { if let Some(p) = p.borrow().as_ref() { p.setFrame_display(to_appkit(f, ph), true); p.orderFrontRegardless(); } });
            peekout_tell(true, side);
        }
        None => {
            PEEKOUT_ON.store(false, Ordering::SeqCst);
            *PEEKOUT_AT.lock().unwrap_or_else(|e| e.into_inner()) = None;
            peekout_unhover();
            peekout_tell(false, side);
            if was {
                // The page slides back first; the window goes once that has played (at once when hidden for a light or for
                // Stop everything: in this same main thread turn, so a caller waiting on it knows the peek is gone).
                let gen = PEEKOUT_GEN.fetch_add(1, Ordering::SeqCst) + 1;
                let ms = if facts.lit || facts.stopped || reduce_motion() { 0 } else { peekout::OUT_MS };
                if ms == 0 {
                    PEEKOUT.with(|p| { if let Some(p) = p.borrow().as_ref() { p.orderOut(None); } });
                } else if let Some(app) = APP.get() {
                    let a = app.clone();
                    std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(ms)); let _ = a.run_on_main_thread(move || if PEEKOUT_GEN.load(Ordering::SeqCst) == gen && !PEEKOUT_ON.load(Ordering::SeqCst) { PEEKOUT.with(|p| { if let Some(p) = p.borrow().as_ref() { p.orderOut(None); } }); }); });
                }
            }
        }
    }
    if was != PEEKOUT_ON.load(Ordering::SeqCst) { log("peekout", json!({ "on": !was, "reason": reason, "why": format!("{:?}", peekout::allowed(&facts).err()) })); }
}

fn peekout_tell(on: bool, side: peekout::Side) {
    { let mut g = PEEKOUT_TOLD.lock().unwrap_or_else(|e| e.into_inner()); if *g == Some((on, side.word())) { return; } *g = Some((on, side.word())); }
    if let Some(app) = APP.get() { let _ = app.emit_to("peekout", "peekout-allow", json!({ "on": on, "side": side.word() })); }
}

/// Every event the pages get (peek_heard, after the character's light is set): Stop everything hides the peek at once and
/// holds it in for a moment; a light (listening, looking, Show me how) hides it before anything is heard or read (rule 5).
/// Off the main thread it waits (at most a moment) until the peek is gone, as peek_now does for the character, so the
/// caller's own wait before the microphone opens or the screen is read covers the peek too.
pub(crate) fn peekout_heard(app: &AppHandle, v: &Value) {
    let t = v.get("type").and_then(Value::as_str).unwrap_or("");
    if !matches!(t, "app.stop_everything" | "app.voice" | "app.showme") { return; }
    if t == "app.stop_everything" { PEEKOUT_STOP_UNTIL.store(now() as u64 + peekout::STOP_HOLD_MS, Ordering::SeqCst); }
    if MainThreadMarker::new().is_some() { peekout_apply(t); return; }
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let _ = app.run_on_main_thread(move || { peekout_apply("heard"); let _ = tx.send(()); });
    let _ = rx.recv_timeout(Duration::from_millis(300));
}

/// Twice a second (tick): a call starting or ending, and the end of the hold after Stop. Nothing is read while the page
/// does not want to be out.
fn peekout_tick() {
    if !PEEKOUT_WANT.load(Ordering::SeqCst) && !PEEKOUT_ON.load(Ordering::SeqCst) { return; }
    peekout_apply("tick");
}

/// Each mouse move (the ring's monitors, the pointer's place only): the window takes clicks only on the head, and the
/// pointer on the head is the pointer on the notch, so the same hover panel opens. Main thread.
fn peekout_pointer_moved() {
    let menu_was = PEEKOUT_MENU.load(Ordering::SeqCst);
    if PEEKOUT_AT.lock().unwrap_or_else(|e| e.into_inner()).is_none() && !PEEKOUT_HOVER.load(Ordering::SeqCst) && !menu_was { return; }
    let Some(mtm) = MainThreadMarker::new() else { return };
    let ph = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    let m = NSEvent::mouseLocation();
    let pt = (m.x, ph - m.y);
    let side = peekout::Side::of(&setting_now("notch.peekSide"));
    // Along the menu bar near it: aside until the pointer leaves that part of the row (a menu or an icon is wanted there).
    let spot = *PEEKOUT_SPOT.lock().unwrap_or_else(|e| e.into_inner());
    let isl = *ISLAND_AT.lock().unwrap_or_else(|e| e.into_inner());
    let menu = match (spot, isl) { (Some(s), Some(i)) => peekout::menu_reach(s, side, i, pt, menu_was), _ => false };
    if menu != menu_was { PEEKOUT_MENU.store(menu, Ordering::SeqCst); peekout_apply("menu"); }
    let at = *PEEKOUT_AT.lock().unwrap_or_else(|e| e.into_inner());
    let on = at.is_some_and(|f| peekout::on_head(f, side, pt));
    if PEEKOUT_ON_HEAD.swap(on, Ordering::SeqCst) != on { PEEKOUT.with(|p| { if let Some(p) = p.borrow().as_ref() { p.setIgnoresMouseEvents(!on); } }); }
    if on && !PEEKOUT_HOVER.swap(true, Ordering::SeqCst) { island_hover_changed(true); return; }
    // Left the head: unless the notch's panel opened under the pointer (the island follows it from there).
    if !on && PEEKOUT_HOVER.load(Ordering::SeqCst) && !island_rect(ph).is_some_and(|r| island::contains(r, pt)) { PEEKOUT_HOVER.store(false, Ordering::SeqCst); island_hover_changed(false); }
}

/// The peek went in: the pointer is no longer on it, and clicks pass through again.
fn peekout_unhover() {
    if PEEKOUT_ON_HEAD.swap(false, Ordering::SeqCst) { PEEKOUT.with(|p| { if let Some(p) = p.borrow().as_ref() { p.setIgnoresMouseEvents(true); } }); }
}
