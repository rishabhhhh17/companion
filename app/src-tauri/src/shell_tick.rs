/// M46: the character rests now (rest.rs): on a call or presenting with Quiet during calls on, or in Low Power Mode with
/// Rest in Low Power Mode on. Worked out twice a second (tick).
static REST: AtomicBool = AtomicBool::new(false);
/// Whether the island may not open by itself, as `tick` saw it last: a call or presentation app in front with Quiet during
/// calls on (presentation.rs), or Companion hidden. The same reading as place_island's `quiet`.
static QUIET_NOW: AtomicBool = AtomicBool::new(false);
/// For a page that loads while the character rests (the dock, the island, Home's hero): whether it rests now. After that,
/// each change comes as flowflow-rest.
#[tauri::command]
fn flowflow_rest() -> bool { REST.load(Ordering::SeqCst) }

/// Twice a second (tick): is it a call, and does the character rest? Only the front app's id and the power state are read,
/// never any content (rule 7). A change of rest tells every live character (flowflow-rest) and wakes the eyes' and the
/// ring's threads; a call that starts or ends, or Companion hidden or shown again, while a question waits puts the island
/// where it belongs (it opens by itself only off a call and while shown, so a question that waited drops once). Main thread.
fn rest_tick(app: &AppHandle, mtm: MainThreadMarker) {
    let q = quiet();
    let island_quiet = q || companion_hidden();
    let quiet_changed = QUIET_NOW.swap(island_quiet, Ordering::SeqCst) != island_quiet;
    let rest = rest::rest_now(presentation_now().quiet_on_calls, q, rest::rest_low_power_on(&setting_now("character.restLowPower")), rest::low_power());
    if REST.swap(rest, Ordering::SeqCst) != rest {
        let _ = app.emit("flowflow-rest", json!({ "rest": rest }));
        gaze_recompute(); follow_wake();
        log("character_rest", json!({ "rest": rest }));
    }
    if quiet_changed && ISLAND_STATE.lock().unwrap_or_else(|e| e.into_inner()).ask { place_island(mtm, false, "quiet"); }
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
        home_stop_now("full_screen");
        voice_tell_hidden();
        pointers_gone_hidden(app);
        gaze_recompute(); follow_wake();
        log("hidden_for_full_screen", json!({}));
    } else if show && HIDDEN_BY_US.swap(false, Ordering::SeqCst) {
        with_panels(|d, c| { d.orderFrontRegardless(); c.orderFrontRegardless(); });
        island_show(true);
        gaze_recompute(); follow_wake();
        log("shown_after_full_screen", json!({}));
    }
    // M46: rest (a call, or Low Power Mode) and whether the island may open by itself.
    rest_tick(app, mtm);
    // M90: a call starting or ending, and Stop's hold ending, for Flowflow peeking out of the notch.
    peekout_tick();
    // M89: an update found may install while the person is away (shell_updates.rs; every 30 seconds, times and yes or no only).
    quiet_update_tick(app);
    // A screen plugged in or out, a resolution change, or the macOS Dock moving: put the character back inside.
    let sig = signature(&screens_now(mtm));
    // The island and Home go back on their display too, and Home is placed again if it is open.
    let res = { let mut g = SIG.lock().unwrap(); if *g != sig { *g = sig; true } else { false } }; if res {
        apply_dock(mtm, "screens_changed", false);
        place_island(mtm, false, "screens_changed");
        // M66: Home's window goes with it, and a Home that was open closes without motion (its display changed under it).
        with_panels(place_card);
        if card_visible() { home_stop_now("screens_changed"); }
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
    // M55, adapts to you: Home's main action follows the kind of app in front (home.followFrontApp). Only the kind is told,
    // only to Home, and only when it changes; never the app's id, name, a window's title or anything in it (rules 5 and 7).
    if let Some(v) = everyday::home_front(&setting_now("home.followFrontApp"), front_id) {
        let sig = v.to_string();
        if FRONT_KIND_SENT.with(|l| l.replace(sig.clone())) != sig { let _ = app.emit_to("card", "front-kind", v); }
    }
    // Only tell the pages when something changed, so an idle app does almost no work. The app in front is only logged (in
    // debug mode): no page needs its name, so none is told it.
    let state = json!({ "clicks": CLICKS.load(Ordering::SeqCst), "card_key": ck });
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
        // Anthropic's Claude as installed at first run (claude_install.rs, M22), used once it is there.
        .map(|mut loc| { loc.claude = claude_install::dest(&claude_root(), &claude_install::pin().version); loc })
        .and_then(|loc| app.state::<runner::Runner>().start(app, &loc, { let handle = app.clone(); move |t| {
            log("runner_event", json!({ "kind": t }));
            // Each time the engine (re)starts it has no key yet; it is handed one as soon as it says hello.
            if t == "runner.hello" { hand_key_over(&handle, None); google_push(&handle); plan_push(&handle, true); }
            // An engine that has just (re)started knows no question, so an answer is not coming: what was seen is forgotten.
            if t == "runner.hello" { showme_pending().end(); }
            WHEEL.lock().unwrap().get_or_insert_with(wheel::Wheel::default).on_runner_event(t);
            // M34: a result finished while Home is closed is counted on the notch until Home opens.
            if t == "receipt" { let n = island::unseen_next(UNSEEN.load(Ordering::SeqCst), HOME_OPEN.load(Ordering::SeqCst) && card_visible()); UNSEEN.store(n, Ordering::SeqCst); let _ = handle.emit_to("island", "unseen", json!({ "n": n })); }
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

