// GLASS (the founder, 19 Nov 2026: "the liquid glass looks so very good. Also, the menu bar ... make it better"). The AppKit
// side of two things, with the decisions in traypop.rs:
//
// 1. The menu bar icon's glass popover (tray.html, trayPanel.tsx). A left click on the icon opens it under the icon, a second
//    click or a click anywhere else closes it, as other menu bar extras do. It is a non activating panel that never becomes
//    key (make_panel, not Home's subclass), so the app in front keeps the keyboard (rule 9). A press in it reaches the shell
//    as tray_do and does exactly what the same press does elsewhere, under the same words: Check my project (Find the
//    problem), Check before going live, Home, the review of changes, Settings, Stop everything, Quit, the folder chooser. The click away watch reads only whether the button is down and
//    where the pointer is, twenty times a second while it is open (as Home's does), never keys, never the screen.
// 2. macOS's own blur (an NSVisualEffectView behind the web view) under the popover and under Home's body while it is open
//    in the glass material, so the desktop really shows through (the rulebook's G1.1: CSS backdrop-filter in a see through
//    window blurs only the page itself). [verify] on a real Mac: the blur's edge against the page's rounded corners, and
//    Home's blur arriving once the shape has finished growing.

thread_local! {
    static TRAYPOP: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) };
    static HOME_FX: RefCell<Option<Retained<NSView>>> = const { RefCell::new(None) };
}
static TRAYPOP_OPEN: AtomicBool = AtomicBool::new(false);
/// Each open, so a late close or a late fade never acts on a newer open.
static TRAYPOP_GEN: AtomicU64 = AtomicU64::new(0);
/// When a click elsewhere last closed it: the click on the icon that closed it must not open it again at once.
static TRAYPOP_AWAY_AT: AtomicU64 = AtomicU64::new(0);
/// The dot on the icon now (something needs the person), so the image is swapped only on a change.
static TRAYPOP_DOT: AtomicBool = AtomicBool::new(false);
/// Where it is (AppKit points) and the visible frame of its screen, for the click away watch and a new height.
static TRAYPOP_AT: Mutex<Option<(traypop::Frame, traypop::Frame)>> = Mutex::new(None);
/// Home's blur: shown for this open (HOME_GEN-like), so a fade that arrives after a close does nothing.
static HOME_FX_GEN: AtomicU64 = AtomicU64::new(0);
/// How long Home's shape takes to grow before its blur fades in under it (homeShape.ts: width, then height, about 380 ms).
const HOME_FX_AFTER_MS: u64 = 380;

fn fr(f: NSRect) -> traypop::Frame { traypop::Frame { x: f.origin.x, y: f.origin.y, w: f.size.width, h: f.size.height } }
fn ns(f: traypop::Frame) -> NSRect { NSRect::new(NSPoint::new(f.x, f.y), NSSize::new(f.w, f.h)) }

/// Behind the window: Apple's Liquid Glass (NSGlassEffectView) where the Mac has it (macOS 26 and later; M125, the founder
/// 28 Nov 2026: "I need it to be like liquid glass"), else a dark, always active blur. Rounded (`bottom_only`: only its two
/// bottom corners, for Home's body, whose top joins the notch). Main thread.
fn glass_view(mtm: MainThreadMarker, frame: NSRect, radius: f64, bottom_only: bool) -> Retained<NSView> {
    use objc2_app_kit::{NSAppearance, NSAppearanceCustomization, NSAppearanceNameDarkAqua, NSAutoresizingMaskOptions, NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView};
    let v: Retained<NSView> = if liquid_glass_here() {
        use objc2_app_kit::{NSGlassEffectView, NSGlassEffectViewStyle};
        let g = NSGlassEffectView::initWithFrame(mtm.alloc::<NSGlassEffectView>(), frame);
        g.setStyle(NSGlassEffectViewStyle::Regular);
        g.setCornerRadius(radius);
        // A light dark tint, so white words read over any wallpaper; the glass itself stays clear and bright at its edges.
        g.setTintColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(0.04, 0.04, 0.06, LIQUID_TINT)));
        Retained::into_super(g)
    } else {
        let e = NSVisualEffectView::initWithFrame(mtm.alloc::<NSVisualEffectView>(), frame);
        e.setMaterial(NSVisualEffectMaterial::HUDWindow);
        e.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
        e.setState(NSVisualEffectState::Active);
        Retained::into_super(e)
    };
    if let Some(dark) = NSAppearance::appearanceNamed(unsafe { NSAppearanceNameDarkAqua }) { v.setAppearance(Some(&dark)); }
    v.setAutoresizingMask(NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable);
    v.setWantsLayer(true);
    unsafe {
        let layer: *mut objc2::runtime::AnyObject = objc2::msg_send![&*v, layer];
        if !layer.is_null() {
            let _: () = objc2::msg_send![layer, setCornerRadius: radius];
            let _: () = objc2::msg_send![layer, setMasksToBounds: true];
            // kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner: the bottom two (a view's layer is not flipped).
            if bottom_only { let _: () = objc2::msg_send![layer, setMaskedCorners: 3usize]; }
        }
    }
    v
}

/// How dark the Liquid Glass's own tint is (0 clear, 1 solid): enough for white words over a bright wallpaper.
const LIQUID_TINT: f64 = 0.38;
/// Whether this Mac has Liquid Glass (the class exists from macOS 26). Looked up by name, so an older Mac never touches it.
fn liquid_glass_here() -> bool { objc2::runtime::AnyClass::get(c"NSGlassEffectView").is_some() }

/// Puts the glass under a panel's web view (below every view already in it). Main thread.
fn put_glass_under(content: &NSView, v: &NSView) {
    content.addSubview_positioned_relativeTo(v, objc2_app_kit::NSWindowOrderingMode::Below, None);
}

/// Made once at launch (main.rs setup): the popover's panel, hidden, see through, with the blur under its page.
fn traypop_make(mtm: MainThreadMarker, tray_ns: &NSWindow) {
    let f = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(traypop::POP_W, traypop::POP_H));
    let p = make_panel(mtm, tray_ns, false, f);
    p.setOpaque(false);
    p.setHasShadow(true);
    p.setBackgroundColor(Some(&NSColor::clearColor()));
    // Over the menu bar's own level, like a menu: it hangs from the bar.
    p.setLevel(island::LEVEL);
    if let Some(content) = p.contentView() {
        let fx = glass_view(mtm, content.bounds(), traypop::POP_R, false);
        put_glass_under(&content, &fx);
    }
    TRAYPOP.with(|t| *t.borrow_mut() = Some(p));
}

/// The icon was clicked (left button): open the popover under it, or close it if it is open. Main thread.
fn traypop_toggle(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    if TRAYPOP_OPEN.load(Ordering::SeqCst) { traypop_hide("icon"); return; }
    // The press on the icon that a click away watch already took as "elsewhere" closed it: that is the toggle.
    if (now() as u64).saturating_sub(TRAYPOP_AWAY_AT.load(Ordering::SeqCst)) < 400 { return; }
    let at = NSEvent::mouseLocation();
    let screens = NSScreen::screens(mtm);
    let screen = screens.iter().find(|s| { let f = s.frame(); at.x >= f.origin.x && at.x <= f.origin.x + f.size.width && at.y >= f.origin.y && at.y <= f.origin.y + f.size.height + 1.0 }).or_else(|| screens.iter().next());
    let Some(screen) = screen else { return };
    let vis = fr(screen.visibleFrame());
    let h = TRAYPOP.with(|t| t.borrow().as_ref().map(|p| p.frame().size.height)).unwrap_or(traypop::POP_H);
    let f = traypop::place(at.x, vis, h);
    *TRAYPOP_AT.lock().unwrap_or_else(|e| e.into_inner()) = Some((f, vis));
    let gen = TRAYPOP_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    TRAYPOP_OPEN.store(true, Ordering::SeqCst);
    // The window is there at once (the shell moves no window but the island and Home); the page fades its own content in
    // (rulebook G5.3, glass.css .tray), at once with Reduce motion.
    TRAYPOP.with(|t| if let Some(p) = t.borrow().as_ref() { p.setFrame_display(ns(f), true); p.orderFrontRegardless(); });
    let _ = app.emit_to("tray", "tray-open", json!({}));
    log("tray_open", json!({}));
    traypop_watch(app, gen);
}


/// Closes the popover (a press in it, the icon again, a click elsewhere, Stop everything with it open). Main thread.
fn traypop_hide(why: &str) {
    if !TRAYPOP_OPEN.swap(false, Ordering::SeqCst) { return; }
    TRAYPOP_GEN.fetch_add(1, Ordering::SeqCst);
    if why == "away" { TRAYPOP_AWAY_AT.store(now() as u64, Ordering::SeqCst); }
    TRAYPOP.with(|t| if let Some(p) = t.borrow().as_ref() { p.orderOut(None); });
    if let Some(app) = APP.get() { let _ = app.emit_to("tray", "tray-close", json!({})); }
    log("tray_close", json!({ "by": why }));
}

/// While it is open: a press that starts outside it closes it. Only the button's state and the pointer's place are read.
fn traypop_watch(app: &AppHandle, gen: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        let down = || NSEvent::pressedMouseButtons() & 3 != 0;
        let mut was = down();
        while TRAYPOP_OPEN.load(Ordering::SeqCst) && TRAYPOP_GEN.load(Ordering::SeqCst) == gen {
            std::thread::sleep(Duration::from_millis(island::CLICK_POLL_MS));
            let is = down();
            if is && !was {
                let _ = app.run_on_main_thread(move || {
                    if TRAYPOP_GEN.load(Ordering::SeqCst) != gen { return; }
                    let p = NSEvent::mouseLocation();
                    let at = *TRAYPOP_AT.lock().unwrap_or_else(|e| e.into_inner());
                    if at.is_some_and(|(f, _)| traypop::outside(f, (p.x, p.y))) { traypop_hide("away"); }
                });
            }
            was = is;
        }
    });
}

/// A press in the popover. Only the presses traypop.rs knows pass; each does what the same press does elsewhere.
#[tauri::command]
fn tray_do(app: AppHandle, action: String) {
    let Some(act) = traypop::TrayAct::parse(&action) else { return };
    log("tray_do", json!({ "action": action }));
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        if act.closes() { traypop_hide("press"); }
        match act {
            // Each opens Home on the tool its words name, by the notch panel's own arrivals (traypop.rs TrayAct::arrival).
            traypop::TrayAct::Check | traypop::TrayAct::ShipCheck | traypop::TrayAct::Review | traypop::TrayAct::Settings => open_card_then(&a, "menu", true, act.arrival()),
            traypop::TrayAct::Open | traypop::TrayAct::Now => open_card(&a, "menu", true),
            traypop::TrayAct::Stop => stop_everything_from_menu(&a),
            traypop::TrayAct::Quit => { quit::mark(quit::MENU); a.exit(0) }
            traypop::TrayAct::Pick => { let a2 = a.clone(); tauri::async_runtime::spawn(async move { let _ = pick_project(a2).await; }); }
        }
    });
}

/// The page says whether something needs the person: the icon takes its dot, or loses it. Only on a change.
#[tauri::command]
fn tray_dot(app: AppHandle, on: bool) {
    if TRAYPOP_DOT.swap(on, Ordering::SeqCst) == on { return; }
    if let Some(t) = app.tray_by_id("main") {
        if let Ok(img) = Image::from_bytes(traypop::icon(on)) { let _ = t.set_icon(Some(img)); let _ = t.set_icon_as_template(true); }
    }
}

/// The page's own height: the popover grows or shrinks to it, its top kept under the menu bar.
#[tauri::command]
fn tray_size(app: AppHandle, h: f64) {
    if !h.is_finite() { return; }
    let _ = app.run_on_main_thread(move || {
        let mut at = TRAYPOP_AT.lock().unwrap_or_else(|e| e.into_inner());
        TRAYPOP.with(|t| if let Some(p) = t.borrow().as_ref() {
            let now = fr(p.frame());
            let vis = at.map(|(_, v)| v).unwrap_or(traypop::Frame { x: now.x, y: 0.0, w: now.w, h: now.y + now.h });
            let f = traypop::resize(now, vis, h);
            if f != now { p.setFrame_display(ns(f), true); }
            if let Some((_, v)) = *at { *at = Some((f, v)); }
        });
    });
}

/// The menu's Stop everything, and the popover's: every agent, task, capture and the microphone (rule 11).
fn stop_everything_from_menu(app: &AppHandle) {
    let r = app.state::<runner::Runner>().stop_everything("menu");
    log("menu_stop_everything", json!({ "sent": r.is_ok() }));
    let stop = json!({ "v": 1, "id": "app-kill", "type": "app.stop_everything" });
    peek_heard(app, &stop);
    let _ = app.emit("runner-event", stop);
    showme_stop(app);
    let _ = app.run_on_main_thread(|| home_stop_now("stop_everything"));
}

/// Home's blur under its body, in the glass material only, while Home is open and not folding: placed on the body's rect
/// (the last of HOME_RECTS) in the window's own points, its two bottom corners rounded like the body. It fades in once the
/// shape has grown, and goes at once when Home starts to fold or the material is Before. Main thread.
fn home_glass_sync() {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let glass = setting_now("look.material") != json!("classic");
    let shown = HOME_SHOWN.load(Ordering::SeqCst) && HOME_FOLDING.load(Ordering::SeqCst) == 0;
    let body = HOME_RECTS.lock().unwrap_or_else(|e| e.into_inner()).last().copied();
    let hide = || {
        HOME_FX_GEN.fetch_add(1, Ordering::SeqCst);
        HOME_FX.with(|f| if let Some(v) = f.borrow().as_ref() { v.setHidden(true); v.setAlphaValue(0.0); });
    };
    let Some(body) = body.filter(|_| glass && shown) else { hide(); return };
    let ph = screens_now(mtm).first().map(|s| s.frame[3]).unwrap_or(0.0);
    let Some(fresh) = with_panels(|_, c| {
        let win = from_appkit(c.frame(), ph);
        // The body in the window's own points (AppKit: from the bottom left).
        let local = NSRect::new(NSPoint::new(body[0] - win[0], win[3] - (body[1] - win[1]) - body[3]), NSSize::new(body[2], body[3]));
        let content = c.contentView()?;
        Some(HOME_FX.with(|f| {
            let mut f = f.borrow_mut();
            if f.is_none() {
                let v = glass_view(mtm, local, island::OPEN_R, true);
                v.setAutoresizingMask(objc2_app_kit::NSAutoresizingMaskOptions::empty());
                v.setHidden(true);
                put_glass_under(&content, &v);
                *f = Some(v);
            }
            let v = f.as_ref().unwrap();
            v.setFrame(local);
            v.isHidden()
        }))
    }).flatten() else { return };
    if !fresh { return; }
    // Just opened: it waits for the shape to grow, then shows under it (the shell runs no fade of its own; the page's tint
    // is already there, so only the blur arrives). At once with Reduce motion.
    let gen = HOME_FX_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    if reduce_motion() { HOME_FX.with(|f| if let Some(v) = f.borrow().as_ref() { v.setAlphaValue(1.0); v.setHidden(false); }); return; }
    if let Some(app) = APP.get().cloned() {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(HOME_FX_AFTER_MS));
            let _ = app.run_on_main_thread(move || {
                if HOME_FX_GEN.load(Ordering::SeqCst) != gen { return; }
                HOME_FX.with(|f| if let Some(v) = f.borrow().as_ref() { v.setAlphaValue(1.0); v.setHidden(false); });
            });
        });
    }
}
