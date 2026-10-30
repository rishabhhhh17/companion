//! The settings for Home, the island and the character that the shell applies (M11 area 4; the registry is
//! protocol/settings.json, T16), read in one place from settings.json. Plain code: main.rs reads them when it needs them
//! (each tick, each time the pointer comes to or leaves the island, each change), so a change takes effect at once. The
//! usual value of every one is exactly what the app did before the setting existed (`HomeSet::USUAL`, tested).
//!
//! The character's place (character.edge, character.position, character.sameEverywhere) is in dock.json with "Come to
//! what it is about", read and changed by settings.rs (`dock_value`, `dock_with`), not here.
use crate::island::{HomeSize, HoverTimes, Where, FOLLOW_MS};
use crate::roam::LINGER_MS;
use crate::settings::{value_of, File, Registry};
use serde_json::Value;

/// Every setting read here, so a test can prove each one is in the registry, kept in settings.json, for the shell.
#[cfg_attr(not(test), allow(dead_code))]   // checked by the tests
pub const KEYS: &[&str] = &[
    "island.show", "island.peekOnHover", "island.openDelay", "island.closeDelay", "island.display", "island.followDelay",
    "home.closeOnClickAway", "home.size", "character.linger", "character.motion", "character.overFullScreen",
    "character.peek", "character.stick", "character.peekIdle", "home.escStops",
];

/// What the shell does about Home, the island and the character, as the settings say now.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HomeSet {
    /// island.show: the island in the notch is shown (off: Home opens beside the character).
    pub island_show: bool,
    /// island.peekOnHover, island.openDelay, island.closeDelay: the status when the pointer rests on the island.
    pub hover: HoverTimes,
    /// island.display: which display the island and Home use.
    pub display: Where,
    /// island.followDelay: how long the pointer stays on another display before the island moves there (Follow me only).
    pub follow_ms: u64,
    /// home.closeOnClickAway: a click in another app may close Home (the page decides when, home.ts).
    pub click_away: bool,
    /// home.size: Home's width and tallest height; the character's clear zones come from the same numbers.
    pub size: HomeSize,
    /// character.linger: how long the character stays beside a window once nothing about it is up.
    pub linger_ms: u64,
    /// character.motion "less": the character appears in place instead of flying, inside Companion only.
    pub less_motion: bool,
    /// character.overFullScreen: Companion stays on screen over a full screen app.
    pub over_full_screen: bool,
    /// character.peek: the character rests tucked away past the edge of the screen and comes in at the pointer (peek.rs).
    pub peek: bool,
    /// character.stick (M37d): while tucked, half of it stays stuck to the edge instead of hiding fully past it.
    pub stick: bool,
    /// character.peekIdle ("Peek in on its own"): it also peeks in when something happens, and now and then while nothing does.
    pub peek_idle: bool,
    /// home.escStops (M26): Esc clears what Squibby draws on the screen and stops it talking, while it draws (esc.rs).
    pub esc_stops: bool,
}

impl HomeSet {
    /// Today's behaviour: the constants these settings replaced. Peeking (27 Oct 2026) was off from M31 (the founder found the
    /// character hidden past the edge when they wanted it there); since M37d (30 Oct 2026, the founder: "it needs to stick…
    /// it just needs to dwell there… when I pull it, it needs to come out") it is on, stuck half in view at the edge.
    pub const USUAL: HomeSet = HomeSet {
        island_show: true, hover: HoverTimes::USUAL, display: Where::Follow, follow_ms: FOLLOW_MS, click_away: true,
        size: HomeSize::STANDARD, linger_ms: LINGER_MS, less_motion: false, over_full_screen: false, peek: true, stick: true, peek_idle: false, esc_stops: true,
    };
}

/// Seconds in the registry, milliseconds here.
fn ms(v: &Value, usual: u64) -> u64 { v.as_f64().filter(|s| s.is_finite() && *s >= 0.0).map(|s| (s * 1000.0).round() as u64).unwrap_or(usual) }

/// The settings in force. A value settings.json does not hold (or holds wrongly, settings.rs `parse_file`) is the usual one.
pub fn read(r: &Registry, f: &File) -> HomeSet {
    let v = |k: &str| value_of(r, f, k, None).unwrap_or(Value::Null);
    let on = |k: &str, usual: bool| v(k).as_bool().unwrap_or(usual);
    let word = |k: &str| v(k).as_str().unwrap_or("").to_string();
    let u = HomeSet::USUAL;
    HomeSet {
        island_show: on("island.show", u.island_show),
        hover: HoverTimes { in_ms: ms(&v("island.openDelay"), u.hover.in_ms), out_ms: ms(&v("island.closeDelay"), u.hover.out_ms), peek: on("island.peekOnHover", u.hover.peek) },
        display: Where::of(&word("island.display")),
        follow_ms: ms(&v("island.followDelay"), u.follow_ms),
        click_away: on("home.closeOnClickAway", u.click_away),
        size: HomeSize::of(&word("home.size")),
        linger_ms: ms(&v("character.linger"), u.linger_ms),
        less_motion: word("character.motion") == "less",
        over_full_screen: on("character.overFullScreen", u.over_full_screen),
        peek: on("character.peek", u.peek),
        stick: on("character.stick", u.stick),
        esc_stops: on("home.escStops", u.esc_stops),
        peek_idle: on("character.peekIdle", u.peek_idle),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{parse_file, registry, set};
    use serde_json::json;

    #[test]
    fn with_nothing_changed_every_one_is_todays_behaviour() {
        assert_eq!(read(registry(), &File::default()), HomeSet::USUAL);
        let u = HomeSet::USUAL;
        assert_eq!((u.hover.in_ms, u.hover.out_ms, u.hover.peek, u.follow_ms, u.linger_ms), (400, 300, true, 3000, 1500));
        assert_eq!((u.island_show, u.display, u.click_away, u.size, u.less_motion, u.over_full_screen), (true, Where::Follow, true, HomeSize::STANDARD, false, false));
        assert_eq!((u.peek, u.stick, u.peek_idle), (true, true, false), "M37d: stuck half in view at its edge, out when the pointer comes");
    }
    #[test]
    fn each_one_is_read_from_settings_json_at_both_ends_of_its_range() {
        let r = registry();
        let with = |pairs: &[(&str, Value)]| { let mut f = File::default(); for (k, v) in pairs { set(r, &mut f, k, v, None).unwrap(); } read(r, &f) };
        let low = with(&[("island.openDelay", json!(0.1)), ("island.closeDelay", json!(0.1)), ("island.followDelay", json!(1)), ("character.linger", json!(0.5))]);
        assert_eq!((low.hover.in_ms, low.hover.out_ms, low.follow_ms, low.linger_ms), (100, 100, 1000, 500));
        let high = with(&[("island.openDelay", json!(1.5)), ("island.closeDelay", json!(1.0)), ("island.followDelay", json!(10)), ("character.linger", json!(10))]);
        assert_eq!((high.hover.in_ms, high.hover.out_ms, high.follow_ms, high.linger_ms), (1500, 1000, 10_000, 10_000));
        let flipped = with(&[("island.show", json!(false)), ("island.peekOnHover", json!(false)), ("home.closeOnClickAway", json!(false)), ("character.overFullScreen", json!(true)), ("character.motion", json!("less")), ("home.size", json!("large"))]);
        assert!(!flipped.island_show && !flipped.hover.peek && !flipped.click_away && flipped.over_full_screen && flipped.less_motion);
        assert_eq!(flipped.size, HomeSize::LARGE);
        let still = with(&[("character.peek", json!(false)), ("character.peekIdle", json!(false))]);
        assert!(!still.peek && !still.peek_idle);
        assert!(with(&[("character.peekIdle", json!(true))]).peek_idle, "turned on, it peeks in on its own");
        assert_eq!(with(&[("island.display", json!("builtIn"))]).display, Where::BuiltIn);
        assert_eq!(with(&[("island.display", json!("main"))]).display, Where::Main);
        // A value the file holds wrongly falls back to the usual one (and is listed by parse_file).
        let (f, problems, _) = parse_file(r, Some(r#"{"version":1,"values":{"island.openDelay":9,"island.show":"no","character.linger":0.4}}"#));
        assert_eq!(problems.len(), 3);
        assert_eq!(read(r, &f), HomeSet::USUAL);
    }
    #[test]
    fn every_one_is_a_setting_the_shell_applies_kept_in_settings_json() {
        for k in KEYS {
            let d = registry().get(k).unwrap_or_else(|| panic!("{k} is not in the registry"));
            assert!(d.applies_to("shell") && d.store == "settings" && !d.project, "{k}");
        }
        // The rest of the area: the character's place is in dock.json, and When something needs me is the page's.
        for k in ["character.edge", "character.position", "character.sameEverywhere"] { assert_eq!(registry().get(k).unwrap().store, "dock", "{k}"); }
        assert_eq!(registry().get("home.goToNeeds").unwrap().applies, vec!["pages".to_string()]);
    }
}

/// How main.rs applies these: what the pure tests above cannot reach (it needs a real Mac), read as text, the way the other
/// shell modules check their wiring.
#[cfg(test)]
mod wiring {
    const MAIN: &str = include_str!("main.rs");
    fn body_in(src: &str, name: &str) -> String {
        let at = src.find(name).unwrap_or_else(|| panic!("{name} is missing"));
        src[at..at + src[at..].find("\n}\n").unwrap()].to_string()
    }
    fn body(name: &str) -> String { body_in(MAIN, name) }

    #[test]
    fn each_setting_is_read_where_it_is_used_so_a_change_takes_effect_at_once() {
        assert!(MAIN.contains("fn home_set() -> homeset::HomeSet { with_settings(|s| homeset::read(settings::registry(), &s.file)) }"));
        // island.show: never shown while off, and no island for Home to drop from (Home opens beside the character).
        assert!(body("fn island_show(").contains("let on = on && home_set().island_show;"));
        let place = body("fn place_island(");
        assert!(place.contains("if !hs.island_show { *ISLAND_ON.lock().unwrap_or_else(|e| e.into_inner()) = None; island_show(false); return; }"), "{place}");
        assert!(body("fn card_spot(").contains(".filter(|_| hs.island_show)"));
        // island.display and island.followDelay.
        assert!(place.contains("island::pick_where(&list, hs.display, builtin.as_deref(), &last, mouse, follow_mouse)"));
        let follow = body("fn follow_pointer(");
        assert!(follow.contains("if hs.display != island::Where::Follow || !hs.island_show { return; }") && follow.contains("now() as u64, hs.follow_ms)"));
        // island.peekOnHover, openDelay and closeDelay: given to the hover each time the pointer comes or goes.
        let hover = body("fn island_hover_changed(");
        assert!(hover.contains("let times = home_set().hover;") && hover.contains("h.set_times(times);"));
        assert!(body("fn reset_hover(").contains("h.set_times(times)"));
        // home.closeOnClickAway: no watch at all while it is off; an open Home's watch stops when it is turned off.
        assert!(body("fn open_card(").contains("if !was_open && home_set().click_away { watch_click_away(&a); }"));
        assert!(body("fn watch_click_away(").contains("&& home_set().click_away {"));
        // home.size: see island.rs (one place for Home, at the size in force).
        // character.linger, character.motion, character.overFullScreen.
        assert!(body("fn roam_tick(").contains("linger_ms: home_set().linger_ms"));
        assert!(MAIN.contains("fn reduce_motion() -> bool { home_set().less_motion || NSWorkspace::sharedWorkspace()."), concat!("the Mac's setting or ", crate::product_s!(), " own (motion.test.ts checks the rest)"));
        let tick = body("fn tick(");
        assert!(tick.contains(r#"visibility::over_full_screen(std::env::var("COMPANION_OVER_FULLSCREEN").ok().as_deref(), home_set().over_full_screen)"#));
        assert!(tick.contains("show_over_full_screen: over,"));
        // A change is applied at once by the shell, and the character's place goes through dock.json.
        assert!(body("fn setting_applied(").contains("home_setting_applied(app, key);"));
        let applied = body("fn home_setting_applied(");
        for k in ["\"island.show\" | \"island.display\" | \"home.size\"", "\"island.peekOnHover\" | \"island.openDelay\" | \"island.closeDelay\"", "\"home.closeOnClickAway\""] { assert!(applied.contains(k), "{k}"); }
        let change = body("fn setting_change(");
        assert!(change.contains("if key == \"character.comeTo\" { come_to_set(app, next.come_to); } else { place_set(app, next); }"));
        let set = body("fn place_set(");
        assert!(set.contains("save_prefs();") && set.contains("apply_dock(mtm, \"setting\", false)"));
        // The overlay is told the settings with each pointer and each sketch, so less motion reaches it too.
        assert!(body("fn draw_pointer_with(").contains("\"settings\": settings"));
        assert!(body("fn show_diagram(").contains("\"settings\": settings"));
    }

    #[test]
    fn the_built_in_display_is_found_on_every_supported_macos() {
        // NSScreen's CGDirectDisplayID property is new in macOS 26, and Companion runs from macOS 14 (tauri.conf.json):
        // sending it on an older Mac raises an Objective-C exception and stops the app, at every launch once the choice
        // is saved. The display id is read from the screen's device description instead, there since macOS 10.0.
        let code: String = MAIN.lines().filter(|l| !l.trim_start().starts_with("//")).collect::<Vec<_>>().join("\n");
        assert!(!code.contains(".CGDirectDisplayID()"), "no call to NSScreen's CGDirectDisplayID anywhere in main.rs");
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["bundle"]["macOS"]["minimumSystemVersion"], "14.0", "if this moves to 26 or later, the property may be used");
        let b = body("fn builtin_display(");
        assert!(b.contains("screen_number(&s)") && b.contains("objc2_core_graphics::CGDisplayIsBuiltin("), "{b}");
        let n = body("fn screen_number(");
        assert!(n.contains("s.deviceDescription()") && n.contains("NSString::from_str(\"NSScreenNumber\")") && n.contains("downcast::<NSNumber>()"), "{n}");
    }

    #[test]
    fn the_pages_are_told_when_the_characters_place_changes_outside_settings() {
        // The character's place (character.edge, character.position, character.sameEverywhere) is read from dock.json for
        // the display it is on. A drag, a display change or the launch can change it without settings_set, so the pages
        // are told then too: the rows, their Reset, Reset this section and its Undo always start from where it is.
        assert!(MAIN.contains("const PLACE_KEYS: [&str; 3] = [\"character.edge\", \"character.position\", \"character.sameEverywhere\"];"));
        assert!(MAIN.contains("fn place_told(app: &AppHandle) { place_shown_changed(); settings_told(app, &PLACE_KEYS.map(String::from)); }"));
        assert!(body("fn place_shown_changed(").contains("PLACE_KEYS.map(|k| settings::dock_value(p, k))"));
        // M47: the let go is decided on the main thread after the drag's last move, then saved, placed, and told, in order.
        let drop = body("fn drop_dock(");
        let main_thread = drop.find("app.run_on_main_thread(move || {").expect("on the main thread, after the drag's last move");
        let order = ["d.release(home_size())", "p.land(", "save_prefs();", "apply_dock(mtm, \"drag\", true);", "place_told(&a);"];
        let at: Vec<usize> = order.iter().map(|p| drop.find(p).unwrap_or_else(|| panic!("drop_dock lost {p}: {drop}"))).collect();
        assert!(main_thread < at[0] && at.windows(2).all(|w| w[0] < w[1]), "in this order: {order:?}");
        // apply_dock is how every display change and the launch move it: it tells the pages whenever what they show of the
        // place is not what they were last told (while dragging, the drop tells them once).
        let apply = body("fn apply_dock(");
        assert!(apply.contains("if reason != \"drag\" && place_shown_changed() { if let Some(app) = APP.get() { place_told(app); } }"), "{apply}");
        for reason in ["\"screens_changed\"", "\"launch\""] { assert!(MAIN.contains(&format!("apply_dock(mtm, {reason}, false);")), "{reason}"); }
        // At launch the place is set before the app handle is kept: the pages are told once it is.
        let at = MAIN.find("let _ = APP.set(app.handle().clone());").unwrap();
        assert!(MAIN[at..at + 200].contains("place_told(app.handle());"));
    }

    #[test]
    fn with_the_island_off_every_capture_still_lights_the_character_or_opens_home_before_anything_is_read() {
        // Rule 5: the screen, other apps' text boxes and the microphone are touched only with a light the person can see
        // lit first. The island is never that light: turning it off (island.show) leaves every path below as it is.
        let showme = body("fn showme_start(");
        let point = body("fn point_problem(");
        let voice = body("fn voice_worker(");
        let phelp = body_in(include_str!("phelp.rs"), "pub fn on_hotkey(");
        let errhelp = body_in(include_str!("errhelp.rs"), "fn press(");
        let seclook = body_in(include_str!("seclook.rs"), "pub fn on_hotkey(");
        for (name, b) in [("show me", &showme), ("point at the problem", &point), ("hold to talk", &voice), ("prompt help", &phelp), ("error explainer", &errhelp), ("second look", &seclook)] {
            assert!(!b.contains("island") && !b.contains("ISLAND") && !b.contains("home_set()"), "{name} depends on the island or a Home setting");
        }
        // Show me and Point at the problem: the character says "looking" (the character's checking state, model.ts
        // visualState) and gets a moment to draw it before the screen is captured.
        for (name, b, capture) in [("show me", &showme, "showme::start_on("), ("point at the problem", &point, "showme::look_for(")] {
            let light = b.find("say_showme(&a3, \"looking\"").unwrap_or_else(|| panic!("{name} has no light"));
            assert!(b[light..].contains("std::thread::sleep(Duration::from_millis(250))"), "{name}");
            assert!(light < b.find(capture).unwrap(), "{name}: the light is made before the capture");
        }
        // Hold to talk: refused while the character cannot be seen (hidden for a full screen app, or by the person), never
        // because of the island; the character says "listening" and gets a moment before the microphone opens.
        // The hidden check is one helper (area 5 also closes an open microphone with it the moment Companion is hidden),
        // and it reads only those two ways of hiding, never the island.
        assert!(MAIN.contains("fn companion_hidden() -> bool { HIDDEN_BY_US.load(Ordering::SeqCst) || USER_HID.load(Ordering::SeqCst) }"), "the hidden check reads only the two ways of hiding");
        let gate = voice.find("if companion_hidden() {").expect("the hidden check");
        let listening = voice.find("say_voice(&app, \"listening\", LISTENING").unwrap();
        let wait = voice.find("std::thread::sleep(Duration::from_millis(150));").unwrap();
        let mic = voice.find("voice_mac::Recorder::start(").unwrap();
        assert!(gate < listening && listening < wait && wait < mic, "hidden check, then the light, then a moment, then the microphone");
        // Prompt help and the error explainer: Home opens (beside the character when there is no island, card_spot) with
        // "Reading", and gets a moment to draw, before the text box is read.
        // The error explainer's press is its own function (errhelp.rs `press`, finding D) and wakes the app in front while it
        // looks for the box (`ax::focused_waking`), so it names its call and the `app` it holds a little differently.
        for (name, b, opened, said_at, reads) in [
            ("prompt help", &phelp, "open_card(&app, \"prompt_help\", false);", "say(&app, \"reading\"", "ax::focused("),
            ("error explainer", &errhelp, "open_card(app, \"explain_error\", false);", "say(app, \"reading\"", "ax::focused_waking("),
            ("second look", &seclook, "open_card(&app, \"second_look\", false);", "say(&app, \"reading\"", "ax::focused("),
        ] {
            let said = b.find(said_at).unwrap();
            let after = |what: &str| b[said..].find(what).map(|i| said + i).unwrap_or_else(|| panic!("{name}: no {what} after the light"));
            let (open, draw, read) = (after(opened), after("std::thread::sleep(INDICATOR_DRAW);"), after(reads));
            assert!(!b[..said].contains("ax::focused"), "{name}: nothing is read before the light");
            assert!(open < draw && draw < read, "{name}: the light, Home, a moment, then the read");
        }
        // Turning the island off hides only the island: never the character or Home's own window.
        let show = body("fn island_show(");
        assert!(!show.contains("with_panels") && !show.contains("PANELS"), "{show}");
        let applied = body("fn home_setting_applied(");
        assert!(!applied.contains("orderOut") && !applied.contains("d.orderOut"), "{applied}");
        // Home still opens with the island off (open_card does not ask for it), and its keys still open it.
        assert!(!body("fn open_card(").contains("island_show"));
        assert!(body("fn card_spot(").contains("island::card_spot(on.as_ref()"), "None when off: beside the character (island.rs card_spot, tested)");
    }
}
