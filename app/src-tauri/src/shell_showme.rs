// ---------- Show me how: look, ask, point ----------

/// The pointer's panel: covers one display, draws only the arrow, ring and caption, ignores the mouse, never takes the keyboard.
fn make_overlay(mtm: MainThreadMarker, tauri_win: &NSWindow) -> Retained<NSPanel> {
    let p = make_panel(mtm, tauri_win, false, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(100.0, 100.0)));
    p.setOpaque(false);
    p.setHasShadow(false);
    p.setBackgroundColor(Some(&NSColor::clearColor()));
    p.setIgnoresMouseEvents(true);
    // M66 step 6: above Home (island.rs POINTER_LEVEL), so an arrow pointing near the notch is never under Home's body.
    p.setLevel(island::POINTER_LEVEL);
    p
}

fn say_showme(app: &AppHandle, stage: &str, message: &str, extra: Value) {
    let mut v = json!({ "v": 1, "id": format!("sm{}", now()), "type": "app.showme", "stage": stage, "message": message });
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) { for (k, x) in e { o.insert(k.clone(), x.clone()); } }
    runner::Runner::publish(app, v);
}

fn hide_overlay(app: &AppHandle) {
    esc_screen(app, false);
    OVERLAY_BUSY_UNTIL.store(0, std::sync::atomic::Ordering::SeqCst);
    DIAGRAM_KEPT.store(false, std::sync::atomic::Ordering::SeqCst);
    let _ = app.emit_to("overlay", "overlay-clear", ());
    let _ = app.run_on_main_thread(|| { OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.orderOut(None); } }); });
    // The pointing ring is gone: the water ring may show again.
    follow_wake();
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
            Err(showme::Refusal::CaptureFailed(e)) => { log("failure_detail", json!({ "what": "capture", "detail": e.to_string() })); say_showme(&app, "error", "I could not look at your screen just now. Try again in a moment.", json!({})) }
            Err(showme::Refusal::PictureFailed(e)) => { log("failure_detail", json!({ "what": "picture", "detail": e.to_string() })); say_showme(&app, "error", "I could not prepare the picture just now. Try again in a moment.", json!({})) }
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
    // The pointing ring is the ring now: the water ring steps aside at once (spec M46 section 0 item 4).
    follow_wake();
    // M46: Fly to the place first (point.fly, off unless chosen). Off, the ring shows at the place at once: no drop
    // leaves the character (no poke, so no drop sound) and no flight time is asked of the overlay.
    let fly = follow::flies(&setting_now("point.fly"));
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
        let hop = look.from.filter(|p| d.contains(*p)).map(|p| (p.x, p.y));
        let from = hop.unwrap_or(here);
        // The water pointer (M17): a drop splits off Flowflow's side facing the target (the overlay draws it from `from`),
        // so the character is poked on that side; a hop from the last step's target leaves it be.
        if fly && hop.is_none() { let _ = a.emit_to("dock", "flowflow-move", json!({ "kind": "give", "dx": rect.x + rect.w / 2.0 - from.0, "dy": rect.y + rect.h / 2.0 - from.1 })); }
        // The character comes beside the window the ring is in (F18 item 2); a ring with no confirmed window leaves it home.
        roam_to(&a, mtm, anchored.as_ref(), [rect.x, rect.y, rect.w, rect.h]);
        let payload = json!({ "rect": { "x": rect.x - d.x, "y": rect.y - d.y, "w": rect.w, "h": rect.h }, "from": { "x": from.0 - d.x, "y": from.1 - d.y }, "caption": caption2, "exact": exact, "hold": hold, "clip": clip,
            "mark": look.mark, "flyMs": look.fly_ms.filter(|_| fly).map(|v| v.clamp(300, 1600)), "fadeMs": look.fade_ms.map(|v| v.clamp(1000, 12_000)), "ringMs": ring, "settings": settings });
        let ak = coords::rect_to_appkit(d, primary_h);
        OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setFrame_display(NSRect::new(NSPoint::new(ak.x, ak.y), NSSize::new(ak.w, ak.h)), true); p.orderFrontRegardless(); } });
        let _ = a.emit_to("overlay", "overlay-point", payload);
        esc_screen(&a, true);
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
                    // The overlay only listens (its capability), so it is given the settings in force with the event, and
                    // where the character is now (read on the main thread), for the water drop's trip home (M17).
                    let settings = settings_snapshot(&[]);
                    // M46: the drop flies home (and the confetti may play) only in Lively with Little reactions on and
                    // motion allowed (follow::flies_home). Otherwise no `home` is sent: the ring turns green and the tick draws.
                    let home_trip = follow::flies_home(&setting_now("character.lively"), &setting_now("fun.reactions"), reduce_motion());
                    let a2 = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        let mtm = MainThreadMarker::new().unwrap();
                        let primary_h = NSScreen::screens(mtm).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
                        let home = with_panels(|dock, _| from_appkit(dock.frame(), primary_h)).filter(|_| home_trip).map(|f| roam::arrow_start(Some(f), (0.0, 0.0))).map(|(x, y)| json!({ "x": x - display.x, "y": y - display.y }));
                        let _ = a2.emit_to("overlay", "overlay-celebrate", json!({ "rect": r, "home": home, "settings": settings }));
                    });
                    say_showme(&app, "your_turn_done", "That's it.", json!({}));
                    // The drop lands back on the character (water.ts HOME_DELAY_MS + HOME_MS), which ripples as it does.
                    std::thread::sleep(Duration::from_millis(980));
                    if alive() && home_trip { let _ = app.emit_to("dock", "flowflow-move", json!({ "kind": "catch" })); }
                    std::thread::sleep(Duration::from_millis(420));
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

