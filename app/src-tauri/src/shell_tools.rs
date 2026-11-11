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
        esc_screen(&a, true);
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

// ---------- Captions while Squibby talks (M26) ----------

static CAPTION_GEN: AtomicU64 = AtomicU64::new(0);
/// Shows what is being said at the bottom of the display the character is on, a page at a time (speak::caption_pages), and
/// takes it away the moment the voice stops (or is stopped). Never while Squibby is hidden. The overlay is see through to
/// clicks, so the caption is never in the way; it goes away with the overlay only when nothing else is drawn on it.
fn show_caption(app: &AppHandle, line: &str, speed: f64) {
    if companion_hidden() { return; }
    let pages: Vec<Value> = speak::caption_pages(line).into_iter().map(|p| { let ms = speak::caption_ms(p.chars().count(), speed); json!({ "text": p, "ms": ms }) }).collect();
    if pages.is_empty() { return; }
    let gen = CAPTION_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let screens = NSScreen::screens(mtm);
        let primary_h = screens.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        let Some(dock) = with_panels(|dock, _| dock.frame()) else { return };
        let (cx, cy) = (dock.origin.x + dock.size.width / 2.0, dock.origin.y + dock.size.height / 2.0);
        let Some(scr) = screens.iter().map(|s| s.frame()).find(|f| cx >= f.origin.x && cx < f.origin.x + f.size.width && cy >= f.origin.y && cy < f.origin.y + f.size.height) else { return };
        let busy = overlay_busy() || TURN.lock().unwrap_or_else(|e| e.into_inner()).is_some();
        if !busy {
            let d = coords::R { x: scr.origin.x, y: primary_h - scr.origin.y - scr.size.height, w: scr.size.width, h: scr.size.height };
            let ak = coords::rect_to_appkit(d, primary_h);
            OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.setFrame_display(NSRect::new(NSPoint::new(ak.x, ak.y), NSSize::new(ak.w, ak.h)), true); p.orderFrontRegardless(); } });
        }
        let _ = a.emit_to("overlay", "overlay-caption", json!({ "pages": pages }));
    });
    // The caption stays exactly as long as the voice: checked five times a second, at most two minutes.
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        for _ in 0..600 {
            if CAPTION_GEN.load(Ordering::SeqCst) != gen { return; }
            let (tx, rx) = std::sync::mpsc::channel();
            let _ = a.run_on_main_thread(move || { let _ = tx.send(speak::mac::speaking()); });
            if !rx.recv_timeout(Duration::from_secs(1)).unwrap_or(false) { break; }
            std::thread::sleep(Duration::from_millis(200));
        }
        if CAPTION_GEN.load(Ordering::SeqCst) != gen { return; }
        let _ = a.emit_to("overlay", "overlay-caption-end", ());
        std::thread::sleep(Duration::from_millis(300));
        let free = !overlay_busy() && TURN.lock().unwrap_or_else(|e| e.into_inner()).is_none();
        if CAPTION_GEN.load(Ordering::SeqCst) == gen && free {
            let _ = a.run_on_main_thread(|| { OVERLAY.with(|o| { if let Some(p) = o.borrow().as_ref() { p.orderOut(None); } }); });
        }
    });
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
    // M46 (F28): confetti only in Lively, with Little reactions on and motion allowed (the overlay page's own rule). Any
    // other way nothing would be drawn, so the full screen overlay is never brought forward for it.
    let plays = || follow::flies_home(&setting_now("character.lively"), &setting_now("fun.reactions"), reduce_motion());
    if !follow::is_lively(&setting_now("character.lively")) { return; }
    let (gen, party) = (POINT_GEN.load(SeqCst), PARTY_GEN.fetch_add(1, SeqCst) + 1);
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        // Checked again here: a pointer may have been drawn, or Companion hidden, since the command came in.
        if !free() || companion_hidden() || POINT_GEN.load(SeqCst) != gen { return; }
        if !plays() { return; }
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

/// The open in editor path, shared by Point at the problem and Walk me through it (M76): the file must really be inside the
/// project, and opens at its line in the editor picked in Settings (Open files in, pointat.editor), else the editor in front,
/// else the first installed, else the Mac's default. Returns what is said, and the editor's bundle id when it is known.
fn open_in_editor_at(project: &str, rel: &str, line: u32, column: Option<u32>) -> Result<(String, Option<String>), String> {
    let file = pointat::file_in_project(std::path::Path::new(project), rel).map_err(|e| format!("I could not open that file: {e}."))?;
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
    if !ok { return Err(format!("{note}I could not open {short} in {name}.")); }
    Ok((format!("{note}Opened {short} at line {line} in {name}.", line = line.max(1)), bundle))
}

/// M76 (roadmap 18): Open in my editor on a Walk me through it step. Only from Home, only on a press, only a file inside the
/// project open now. It opens the file and does not look at the screen. Returns what is said.
#[tauri::command]
fn open_in_editor(window: tauri::WebviewWindow, project: String, file: String, line: u32) -> Result<String, String> {
    settings::only_card(window.label())?;
    let current = current_project();
    if current.is_empty() || project != current { return Err("That change was in a different project folder, so I did not open anything.".into()); }
    open_in_editor_at(&project, &file, line.max(1), None).map(|o| o.0)
}

/// M76 (roadmap 16): Show me where to paste, after Copy for my AI. Only on the person's press. The light comes on first, then
/// the front app's typing boxes are read once through Accessibility (asked the first time, rule 8), and pastehere.rs decides:
/// a solid ring on a confirmed chat box, a dashed one for a guess, or words only. The ring is Point at the problem's, clipped
/// to the window and gone when it changes (rule 22). Squibby never types, pastes or presses in the other app.
#[tauri::command]
fn point_paste(window: tauri::WebviewWindow, app: AppHandle) -> Result<(), String> {
    settings::only_card(window.label())?;
    showme_end_answer(&app);
    point_cancel(); hide_overlay(&app);
    let gen = POINT_GEN.load(std::sync::atomic::Ordering::SeqCst);
    let alive = move || POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) == gen;
    std::thread::spawn(move || {
        const WORDS: &str = "Paste it into your AI tool's chat box, then press Return.";
        if light_unseen() { say_showme(&app, "error", showme::HIDDEN_WORDS, json!({})); return; }
        if !ax::trusted(false) {
            let _ = ax::trusted(true);   // macOS's own prompt, the first time only
            say_showme(&app, "needs_permission", concat!("To find the chat box, allow Accessibility for ", crate::product!(), " in System Settings, then press Show me where to paste again. ", "Until then: paste it into your AI tool's chat box."), json!({}));
            return;
        }
        // The light first (rule 5), then a short moment so it is seen before anything is read.
        say_showme(&app, "looking", "Looking for the chat box", json!({}));
        std::thread::sleep(Duration::from_millis(250));
        if !alive() { return; }
        let Some(front) = ax::front_app() else { say_showme(&app, "opened", WORDS, json!({})); return; };
        let own = front.pid == std::process::id() as i32;
        let read = if own { None } else { ax::text_boxes(front.pid) };
        ax::let_apps_sleep();
        if !alive() { return; }
        let kind = pastehere::app_of(&front.bundle_id);
        let (win, title, boxes) = read.unwrap_or((coords::R { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }, String::new(), vec![]));
        let site = if kind == pastehere::App::Browser { pastehere::site_of(&title) } else { None };
        let place = pastehere::decide(kind, site, (win.w > 0.0).then_some(win), &boxes, own);
        let name = pastehere::name_of(kind, site, &front.name);
        log("paste_where", json!({ "app": format!("{kind:?}"), "found": match place { pastehere::Where::Confirmed(_) => "confirmed", pastehere::Where::Guess(_) => "guess", pastehere::Where::Words => "words" } }));
        let (rect, exact) = match place {
            pastehere::Where::Confirmed(r) => (r, true),
            pastehere::Where::Guess(r) => (r, false),
            pastehere::Where::Words => { say_showme(&app, "opened", &if name.is_empty() { WORDS.to_string() } else { format!("Paste it into {name}'s chat box, then press Return.") }, json!({})); return; }
        };
        let cap = if exact { if name.is_empty() { "Paste here".to_string() } else { format!("Paste into {name} here") } } else { "Probably here. I am guessing, so check it is the chat box.".to_string() };
        let Some(d) = display_of(&app, rect) else { say_showme(&app, "opened", WORDS, json!({})); return; };
        let under = anchor_for(rect);
        let Some((watched, ring)) = draw_pointer_with(&app, d, rect, &cap, exact, false, Look::default(), under, gen) else { return; };
        say_showme(&app, if exact { "pointing" } else { "pointing_roughly" }, &cap, json!({}));
        watch_ring(&app, rect, watched, ring, None);
    });
    Ok(())
}

/// The display a rect (global top-left points) is on, in the same points. Asked on the main thread, where AppKit answers.
fn display_of(app: &AppHandle, rect: coords::R) -> Option<coords::R> {
    let c = rect.center();
    let (tx, rx) = std::sync::mpsc::channel();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { let _ = tx.send(None); return };
        let screens = NSScreen::screens(mtm);
        let primary_h = screens.iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
        let found = screens.iter().map(|s| s.frame()).map(|f| coords::R { x: f.origin.x, y: primary_h - f.origin.y - f.size.height, w: f.size.width, h: f.size.height })
            .find(|d| c.x >= d.x && c.x < d.x + d.w && c.y >= d.y && c.y < d.y + d.h);
        let _ = tx.send(found);
    });
    rx.recv_timeout(Duration::from_millis(1500)).ok().flatten()
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
            match open_in_editor_at(&project, rel, line, column) {
                Ok(o) => opened = Some(o),
                Err(e) => { say_showme(&app, "error", &e, json!({})); return; }
            }
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
            match showme::look_for(&plat, find) {
                Ok((d, hit)) => { display = Some(d); found = hit; if found.is_some() { break; } }
                Err(showme::Refusal::SecureInput) => { say_showme(&app, "error", format!("{said} A password box is active, so I did not look at your screen.").trim(), json!({})); return; }
                Err(showme::Refusal::CaptureFailed(e)) | Err(showme::Refusal::PictureFailed(e)) => { log("failure_detail", json!({ "what": "capture", "detail": e.to_string() })); say_showme(&app, "error", format!("{said} I could not look at your screen just now. Try again in a moment.").trim(), json!({})); return; }
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

/// M76: Save the go live report (golive.rs). Only from Home, only on a press: the Mac's own save dialog opens in another
/// process (so Squibby never takes the keyboard), the person picks where, and the checked bytes are written there. Nothing is
/// sent anywhere and the report is never logged. Returns the saved file's name, or "" when the person cancelled.
#[tauri::command]
async fn save_report(window: tauri::WebviewWindow, kind: String, name: String, data: String) -> Result<String, String> {
    use base64::Engine;
    settings::only_card(window.label())?;
    // M79: with payments on, saving the shareable report needs Pro or a report key for this project. With payments off
    // (today) nothing is gated, and nothing is read for this.
    let (includes, covered) = tauri::async_runtime::spawn_blocking(report_inputs).await.unwrap_or((true, true));
    if !reportkey::save_allowed(license::billing().payments_on(), includes, covered) { return Err("reportNotBought".into()); }
    let kind = golive::Kind::of(&kind).ok_or("that is not a report")?;
    if data.len() > golive::MAX_BYTES.div_ceil(3) * 4 + 4 { return Err("the report is too big".into()); }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.as_bytes()).map_err(|_| "that is not a report".to_string())?;
    golive::check(kind, &bytes).map_err(String::from)?;
    let offered = golive::script_text(&golive::offered_name(&name, kind));
    let dialog = NativeDialog::open();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let script = format!("POSIX path of (choose file name with prompt \"Save the go live report\" default name \"{offered}\" default location (path to downloads folder))");
        std::process::Command::new("/usr/bin/osascript").args(["-e", &script]).env_clear().env("PATH", "/usr/bin:/bin").output().ok()
            .filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }).await.unwrap_or(None);
    drop(dialog);
    let Some(picked) = picked.filter(|p| !p.is_empty()) else { return Ok(String::new()) };   // cancelled: nothing written
    let path = golive::chosen_path(&picked, kind).ok_or("that place cannot be saved to")?;
    golive::write(&path, &bytes).map_err(|e| format!("could not save it ({e})"))?;
    log("report_saved", json!({ "kind": kind.ext() }));
    Ok(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

/// M78: Export notes, on a press on the Memory page: the engine's export (memory.exported) saved where the person picks,
/// through the Mac's own save dialog. Only from Home. The text must be a notes export (notesfile.rs); it is never logged.
#[tauri::command]
async fn save_notes(window: tauri::WebviewWindow, name: String, text: String) -> Result<String, String> {
    settings::only_card(window.label())?;
    notesfile::check(&text).map_err(String::from)?;
    let offered = golive::script_text(&notesfile::offered_name(&name));
    let dialog = NativeDialog::open();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let script = format!("POSIX path of (choose file name with prompt \"Save your notes\" default name \"{offered}\" default location (path to documents folder))");
        std::process::Command::new("/usr/bin/osascript").args(["-e", &script]).env_clear().env("PATH", "/usr/bin:/bin").output().ok()
            .filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }).await.unwrap_or(None);
    drop(dialog);
    let Some(picked) = picked.filter(|p| !p.is_empty()) else { return Ok(String::new()) };   // cancelled: nothing written
    let path = notesfile::chosen_path(&picked).ok_or("that place cannot be saved to")?;
    golive::write(&path, text.as_bytes()).map_err(|e| format!("could not save it ({e})"))?;
    log("notes_saved", json!({}));
    Ok(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

/// M78: Restore from a file, on a press on the Memory page: the Mac's own open dialog, then the chosen file's text, only
/// when it is a notes export (notesfile.rs). The page shows how many lines it holds and asks before memory.restore. Only
/// from Home. A cancel reads nothing. The text is never logged.
#[tauri::command]
async fn open_notes_file(window: tauri::WebviewWindow) -> Result<String, String> {
    settings::only_card(window.label())?;
    let dialog = NativeDialog::open();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let script = "POSIX path of (choose file with prompt \"Choose your saved notes\" of type {\"public.plain-text\"} default location (path to documents folder))";
        std::process::Command::new("/usr/bin/osascript").args(["-e", script]).env_clear().env("PATH", "/usr/bin:/bin").output().ok()
            .filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }).await.unwrap_or(None);
    drop(dialog);
    let Some(picked) = picked.filter(|p| !p.is_empty()) else { return Ok(String::new()) };   // cancelled: nothing read
    let text = notesfile::read(std::path::Path::new(&picked)).map_err(String::from)?;
    log("notes_opened", json!({}));
    Ok(text)
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

