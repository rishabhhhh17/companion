//! M90 (F32, the founder, 14 Nov 2026): Flowflow peeks out of the notch. A small window beside the island, as tall as the
//! menu bar row, touching the island's left or right edge (notch.peekSide), in which the page (peekOutPage.tsx) draws
//! Flowflow's eyes and the top of its head sliding out from behind the notch. The page decides when it wants to be out
//! (app/src/peekOut.ts, from the events every page reads); the shell adds its own hard rules here and places the window.
//! Two pure parts, tested here:
//! - `allowed`: whether it may be out at all now (turned off, nothing wanted, no menu bar, the island hidden or not at
//!   rest, Home open, a call in front (rule 7), a light on (rule 5), Squibby hidden, or just after Stop everything);
//! - `frame` and `on_head`: where the window is, and whether a point is on the drawn head (the rest of the window lets
//!   clicks through to the menu bar, rule 9).
//!
//! The panel is made like the island's (main.rs make_panel: borderless and non activating, so it never takes the keyboard),
//! hidden from screen sharing with the rest (apply_sharing), and on the island's display (Follow you, Built in or Main).
//! Only the pointer's place is read for its hover and its click through, from the monitors the ring already has; never
//! keys, never the screen.
use crate::docking::Rect;
use crate::island::{self, Display, Kind, Mode};
use serde_json::Value;

/// The window's width (tokens.css --peekout-w).
pub const PEEK_W: f64 = 60.0;
/// How far the window reaches under the island's edge (tokens.css --peekout-overlap): the black lip fills the notch's own
/// round corner, so the notch and the lip read as one shape. Under the hardware notch nothing shows.
pub const OVERLAP: f64 = 10.0;
/// The head's size at most (tokens.css --peekout-head), and in a short menu bar this many times its height (135vh).
pub const HEAD: f64 = 44.0;
pub const HEAD_PER_H: f64 = 1.35;
/// How much of the head shows above the row's lower edge (tokens.css --peekout-shown).
pub const SHOWN: f64 = 0.64;
/// How long after it stops being allowed the window is ordered out: the page's slide back (peekOutPage.tsx UNMOUNT_MS).
pub const OUT_MS: u64 = 220;
/// After Stop everything, no wish to be out is taken for this long, so a page that has not yet heard the stop never brings
/// it back (the page itself then keeps it in until something new happens).
pub const STOP_HOLD_MS: u64 = 1500;
/// A row shorter than this is no menu bar to peek from.
const MIN_ROW: f64 = 12.0;

/// Which side of the island it peeks from (notch.peekSide): left unless set to right.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side { Left, Right }
impl Side {
    pub fn of(v: &Value) -> Side { if v.as_str() == Some("right") { Side::Right } else { Side::Left } }
    pub fn word(self) -> &'static str { match self { Side::Left => "left", Side::Right => "right" } }
}

/// Why it is not out now.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Why { Off, NotWanted, NoMenuBar, IslandHidden, IslandBusy, Home, Call, Light, Hidden, Stopped, MenuBar }

/// What the shell knows when it decides.
#[derive(Clone, Copy, Debug)]
pub struct Facts {
    /// notch.peek.
    pub on: bool,
    /// The page wants to be out (peekout_want).
    pub want: bool,
    pub kind: Kind,
    /// The island's size now: only at rest or with its wings out may the peek be beside it; its panel covers that place.
    pub mode: Mode,
    pub island_shown: bool,
    pub home_open: bool,
    /// A call or presenting (main.rs quiet, rule 7).
    pub quiet: bool,
    /// Listening, looking at the screen, or Show me how pointing (rule 5: only the light shows then).
    pub lit: bool,
    /// Squibby hidden from the menu bar icon, or for a full screen app.
    pub hidden: bool,
    /// Within STOP_HOLD_MS of Stop everything.
    pub stopped: bool,
    /// The pointer is along the menu bar near it (menu_reach): a menu title or a status item under it is wanted, not the peek.
    pub menu: bool,
}

/// Whether the peek may be out now, or why not (first that holds).
pub fn allowed(f: &Facts) -> Result<(), Why> {
    if !f.on { return Err(Why::Off); }
    if f.stopped { return Err(Why::Stopped); }
    if !f.want { return Err(Why::NotWanted); }
    if f.hidden { return Err(Why::Hidden); }
    if f.kind == Kind::Edge { return Err(Why::NoMenuBar); }
    if !f.island_shown { return Err(Why::IslandHidden); }
    if f.home_open { return Err(Why::Home); }
    if !matches!(f.mode, Mode::Rest | Mode::Alert) { return Err(Why::IslandBusy); }
    if f.quiet { return Err(Why::Call); }
    if f.lit { return Err(Why::Light); }
    if f.menu { return Err(Why::MenuBar); }
    Ok(())
}

/// The window beside the island's frame `isl` on display `d` (global top left points): as tall as the island's shape and at
/// its top (the notch's height; on a display without a notch the pill's, a little shorter than the menu bar row, so the lip
/// ends where the pill ends and the two are one shape), touching the island on `side`, never off the display. None where
/// there is no menu bar row.
pub fn frame(d: &Display, isl: Rect, side: Side) -> Option<Rect> {
    if island::kind(d) == Kind::Edge { return None; }
    let row = island::menu_bar(d)?;
    if isl[3].is_nan() { return None; }
    let h = isl[3].min(row);
    if h.is_nan() || h < MIN_ROW || isl[1].is_nan() || isl[2].is_nan() || isl[2] <= 0.0 { return None; }
    let x = match side { Side::Left => isl[0] - PEEK_W + OVERLAP, Side::Right => isl[0] + isl[2] - OVERLAP };
    let (left, right) = (d.frame[0], d.frame[0] + d.frame[2]);
    if x < left || x + PEEK_W > right { return None; }
    Some([x, isl[1], PEEK_W, h])
}

/// How far either side of the window the menu bar row counts as near it, in points.
pub const MENU_REACH: f64 = 24.0;

/// M90 review: the peek sits over the menu bar, where long app menus run up to the notch on the left and status items sit on
/// the right. Whether the pointer at `pt` is along the menu bar near the window `spot` (its row, the window and MENU_REACH
/// either side of it, never the island `isl` itself): then a menu or an icon under it is wanted, and the peek moves aside
/// until the pointer leaves. Coming straight onto the head, with nothing aside yet (`was` false), is pointing at the peek
/// (the notch's hover), not the menu bar; once aside, the head's place is the menu bar's too.
pub fn menu_reach(spot: Rect, side: Side, isl: Rect, pt: (f64, f64), was: bool) -> bool {
    let band = [spot[0] - MENU_REACH, spot[1], spot[2] + 2.0 * MENU_REACH, spot[3]];
    if !island::contains(band, pt) || island::contains(isl, pt) { return false; }
    was || !on_head(spot, side, pt)
}

/// The head's size in a row `h` tall (tokens.css: min(--peekout-head, 135vh)).
pub fn head_size(h: f64) -> f64 { HEAD.min(h * HEAD_PER_H) }

/// Whether `pt` is on the drawn head in window `f` (its circle, above the row's lower edge). Everywhere else in the window
/// lets the pointer through.
pub fn on_head(f: Rect, side: Side, pt: (f64, f64)) -> bool {
    if !island::contains(f, pt) { return false; }
    let d = head_size(f[3]);
    // Centred in the part of the window beside the island (the rest reaches under it).
    let mid = match side { Side::Left => f[0] + (f[2] - OVERLAP) / 2.0, Side::Right => f[0] + OVERLAP + (f[2] - OVERLAP) / 2.0 };
    let (cx, cy) = (mid, f[1] + f[3] - d * SHOWN + d / 2.0);
    let (dx, dy) = (pt.0 - cx, pt.1 - cy);
    dx * dx + dy * dy <= (d / 2.0) * (d / 2.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::island::{notch_from, Notch};
    use serde_json::json;
    fn mbp14() -> Display { Display { id: "1512x982@0,0".into(), frame: [0.0, 0.0, 1512.0, 982.0], work: [0.0, 32.0, 1512.0, 875.0], primary: true, notch: notch_from(1512.0, 32.0, 663.5, 663.5) } }
    fn air() -> Display { Display { id: "1440x900@0,0".into(), frame: [0.0, 0.0, 1440.0, 900.0], work: [0.0, 24.0, 1440.0, 806.0], primary: true, notch: None } }
    fn ext() -> Display { Display { id: "2560x1440@1512,-458".into(), frame: [1512.0, -458.0, 2560.0, 1440.0], work: [1512.0, -458.0, 2560.0, 1440.0], primary: false, notch: None } }
    fn notch_rect(d: &Display) -> Rect { let n: Notch = d.notch.unwrap(); [d.frame[0] + n.x, d.frame[1], n.w, n.h] }
    const OK: Facts = Facts { on: true, want: true, kind: Kind::Notch, mode: Mode::Rest, island_shown: true, home_open: false, quiet: false, lit: false, hidden: false, stopped: false, menu: false };

    #[test]
    fn it_tucks_against_the_notchs_left_or_right_edge_as_tall_as_the_notch() {
        let d = mbp14();
        let n = notch_rect(&d);
        let l = frame(&d, n, Side::Left).unwrap();
        assert_eq!(l, [n[0] - PEEK_W + OVERLAP, 0.0, PEEK_W, 32.0]);
        let r = frame(&d, n, Side::Right).unwrap();
        assert_eq!(r, [n[0] + n[2] - OVERLAP, 0.0, PEEK_W, 32.0]);
        // With the wings out, it is beside the wings, never over them.
        let wings = [n[0] - island::WING, 0.0, n[2] + 2.0 * island::WING, 32.0];
        assert_eq!(frame(&d, wings, Side::Left).unwrap()[0], n[0] - island::WING - PEEK_W + OVERLAP);
    }
    #[test]
    fn without_a_notch_it_peeks_from_the_pill_and_where_no_menu_bar_shows_it_never_does() {
        let a = air();
        // M90 review: as tall as the pill and at its top (the pill is a little shorter than the menu bar row), so the lip and
        // the pill are one shape, never a lip 4 points longer than the pill under its round end.
        let pill = island::look(&a, Mode::Rest, island::PANEL_MIN).frame;
        assert_eq!(pill[3], 20.0, "the pill in a 24 point menu bar");
        let f = frame(&a, pill, Side::Left).unwrap();
        assert_eq!(f, [pill[0] - PEEK_W + OVERLAP, pill[1], PEEK_W, pill[3]]);
        assert_eq!(f[1] + f[3], pill[1] + pill[3], "the lip ends where the pill ends");
        // A display whose menu bar hides itself: the island is a thin line on the edge, and there is nothing to peek from.
        assert_eq!(frame(&ext(), [2700.0, -458.0, 100.0, 5.0], Side::Left), None);
        // Never off the display.
        assert_eq!(frame(&a, [10.0, 0.0, 72.0, 20.0], Side::Left), None);
        assert_eq!(frame(&a, [1400.0, 0.0, 30.0, 20.0], Side::Right), None);
        // A shape too short to peek from, or nonsense, is nothing.
        assert_eq!(frame(&a, [700.0, 0.0, 72.0, 6.0], Side::Left), None);
        assert_eq!(frame(&a, [700.0, 0.0, 72.0, f64::NAN], Side::Left), None);
    }
    #[test]
    fn it_follows_the_island_to_its_display() {
        let d = Display { id: "e".into(), frame: [1512.0, -458.0, 2560.0, 1440.0], work: [1512.0, -434.0, 2560.0, 1416.0], primary: false, notch: None };
        let pill = [1512.0 + 1280.0 - 36.0, -458.0, 72.0, 20.0];
        let f = frame(&d, pill, Side::Right).unwrap();
        assert_eq!(f, [1512.0 + 1280.0 + 36.0 - OVERLAP, -458.0, PEEK_W, 20.0]);
    }
    #[test]
    fn pointing_along_the_menu_bar_near_it_moves_it_aside_but_coming_onto_the_head_does_not() {
        let d = mbp14();
        let n = notch_rect(&d);
        let f = frame(&d, n, Side::Left).unwrap();
        let hc = (f[0] + (f[2] - OVERLAP) / 2.0, 20.0);
        assert!(on_head(f, Side::Left, hc));
        // A menu title just outside the window, in the row: aside.
        assert!(menu_reach(f, Side::Left, n, (f[0] - 10.0, 12.0), false));
        // The window's own corner above the head: aside.
        assert!(menu_reach(f, Side::Left, n, (f[0] + 1.0, 1.0), false));
        // Onto the head from below, with nothing aside yet: that is pointing at it (the notch's hover), not the menu bar.
        assert!(!menu_reach(f, Side::Left, n, hc, false));
        // Once aside, the head's place is the menu bar's too, until the pointer leaves the row near it.
        assert!(menu_reach(f, Side::Left, n, hc, true));
        assert!(!menu_reach(f, Side::Left, n, (f[0] - MENU_REACH - 1.0, 12.0), true), "far along the menu bar");
        assert!(!menu_reach(f, Side::Left, n, (hc.0, 40.0), true), "below the menu bar");
        // The notch is the island's own: never the menu bar's.
        assert!(!menu_reach(f, Side::Left, n, (n[0] + 20.0, 10.0), true));
        // The right side: status items past its outer edge.
        let r = frame(&d, n, Side::Right).unwrap();
        assert!(menu_reach(r, Side::Right, n, (r[0] + r[2] + 10.0, 12.0), false));
        assert!(!menu_reach(r, Side::Right, n, (r[0] + r[2] + MENU_REACH + 1.0, 12.0), false));
    }
    #[test]
    fn the_click_through_is_everywhere_but_the_head() {
        let f = [600.0, 0.0, PEEK_W, 32.0];
        let d = head_size(32.0);
        assert_eq!(d, 32.0 * HEAD_PER_H, "a 32 point notch row: a little under the most");
        assert_eq!(head_size(40.0), HEAD);
        let cy = 32.0 - d * SHOWN + d / 2.0;
        let left_mid = 600.0 + (PEEK_W - OVERLAP) / 2.0;
        assert!(on_head(f, Side::Left, (left_mid, cy - 5.0)), "the eyes");
        assert!(on_head(f, Side::Left, (left_mid, 32.0 - d * SHOWN + 2.0)), "the top of the head");
        assert!(!on_head(f, Side::Left, (601.0, 1.0)), "a corner above the head is the menu bar's");
        assert!(!on_head(f, Side::Left, (651.0, 1.0)), "the part under the notch is never the head's");
        assert!(!on_head(f, Side::Left, (left_mid, 33.0)), "under the row is never the head");
        assert!(!on_head(f, Side::Left, (500.0, 10.0)));
        // On the right side the head sits past the part under the notch.
        assert!(on_head(f, Side::Right, (600.0 + OVERLAP + (PEEK_W - OVERLAP) / 2.0, cy)));
        assert!(!on_head(f, Side::Right, (601.0, cy)));
        assert_eq!(head_size(24.0), 24.0 * HEAD_PER_H);
    }
    #[test]
    fn the_numbers_are_the_pages_own_tokens() {
        let tokens = include_str!("../../src/ui/tokens.css");
        assert!(tokens.contains(&format!("--peekout-w: {}px;", PEEK_W as u32)), "--peekout-w");
        assert!(tokens.contains(&format!("--peekout-head: {}px;", HEAD as u32)), "--peekout-head");
        assert!(tokens.contains(&format!("--peekout-overlap: {}px;", OVERLAP as u32)), "--peekout-overlap");
        assert!(tokens.contains(&format!("--peekout-shown: {};", format!("{SHOWN}").trim_start_matches('0'))), "--peekout-shown");
        let css = include_str!("../../src/ui/peekout.css");
        assert!(css.contains("--peekout-size: min(var(--peekout-head), 135vh);"));
        let page = include_str!("../../src/peekOutPage.tsx");
        assert!(page.contains("export const UNMOUNT_MS = EXIT_MS.sheet + 40;"));
        let motion = include_str!("../../src/motionTokens.ts");
        assert!(motion.contains("sheet: 180,"), "EXIT_MS.sheet + 40 is OUT_MS");
        assert_eq!(OUT_MS, 180 + 40);
    }
    #[test]
    fn the_side_is_left_unless_set_to_right() {
        assert_eq!(Side::of(&json!("right")), Side::Right);
        for v in [json!("left"), json!(null), json!(3), json!("up")] { assert_eq!(Side::of(&v), Side::Left); }
    }
    #[test]
    fn the_hard_rules_presentation_stop_lights_home_and_the_island() {
        assert_eq!(allowed(&OK), Ok(()));
        assert_eq!(allowed(&Facts { mode: Mode::Alert, ..OK }), Ok(()), "beside the wings while something happens");
        assert_eq!(allowed(&Facts { on: false, ..OK }), Err(Why::Off));
        assert_eq!(allowed(&Facts { want: false, ..OK }), Err(Why::NotWanted));
        assert_eq!(allowed(&Facts { quiet: true, ..OK }), Err(Why::Call), "presentation mode: a call in front (rule 7)");
        assert_eq!(allowed(&Facts { stopped: true, ..OK }), Err(Why::Stopped), "Stop everything");
        assert_eq!(allowed(&Facts { lit: true, ..OK }), Err(Why::Light), "a capture, listening or Show me how (rule 5)");
        assert_eq!(allowed(&Facts { home_open: true, ..OK }), Err(Why::Home));
        assert_eq!(allowed(&Facts { mode: Mode::Peek, ..OK }), Err(Why::IslandBusy), "the hover panel covers that place");
        assert_eq!(allowed(&Facts { mode: Mode::WingsPeek, ..OK }), Err(Why::IslandBusy));
        assert_eq!(allowed(&Facts { island_shown: false, ..OK }), Err(Why::IslandHidden));
        assert_eq!(allowed(&Facts { kind: Kind::Edge, ..OK }), Err(Why::NoMenuBar));
        assert_eq!(allowed(&Facts { hidden: true, ..OK }), Err(Why::Hidden));
        assert_eq!(allowed(&Facts { menu: true, ..OK }), Err(Why::MenuBar), "the pointer along the menu bar near it");
        // Stop wins over a page that has not heard it yet.
        assert_eq!(allowed(&Facts { stopped: true, quiet: false, ..OK }), Err(Why::Stopped));
    }
    #[test]
    fn hook_busy_carries_only_the_project_and_its_yes_or_no() {
        let events = include_str!("../../../protocol/fixtures/events.jsonl");
        let busy: Vec<Value> = events.lines().filter(|l| l.contains("\"type\":\"hook.busy\"")).map(|l| serde_json::from_str(l).unwrap()).collect();
        assert_eq!(busy.len(), 2);
        for b in &busy {
            for k in b.as_object().unwrap().keys() { assert!(["v", "id", "ts", "type", "project", "busy"].contains(&k.as_str()), "{k}"); }
            assert!(b["busy"].is_boolean() && b["project"].is_string());
        }
    }

    // ---------- the wiring in the shell (main.rs and shell_peekout.rs), read as text like the island's own pins ----------
    fn body(name: &str) -> &'static str {
        let main = crate::main_src();
        let at = main.find(name).unwrap_or_else(|| panic!("{name}"));
        let rest = &main[at..];
        &rest[..rest.find("\n}\n").unwrap()]
    }
    #[test]
    fn the_panel_is_made_non_activating_like_the_islands_and_never_takes_the_keyboard() {
        let main = crate::main_src();
        assert!(main.contains("let peekout_w = WebviewWindowBuilder::new(app, \"peekout\", WebviewUrl::App(\"peekout.html\".into())).visible(false).focused(false).decorations(false).transparent(true).accept_first_mouse(true)"), "made hidden and unfocused");
        assert!(main.contains("let peekout = make_panel(mtm, peekout_ns, false,"), "a borderless, non activating panel (make_panel, card false: never key)");
        let set = &main[main.find("let peekout = make_panel(").unwrap()..];
        let set = &set[..set.find("PEEKOUT.with(").unwrap()];
        for p in ["peekout.setOpaque(false);", "peekout.setHasShadow(false);", "peekout.setBackgroundColor(Some(&NSColor::clearColor()));", "peekout.setLevel(island::LEVEL);", "peekout.setIgnoresMouseEvents(true);"] { assert!(set.contains(p), "{p}"); }
        // It is never ordered front by anything but peekout_apply, and never made key.
        let ap = body("fn peekout_apply(");
        assert!(ap.contains("orderFrontRegardless()") && !ap.contains("makeKey"), "{ap}");
        assert!(!main.contains("peekout.makeKey") && !include_str!("shell_peekout.rs").contains("makeKey"), "never key");
        // Hidden from screen sharing with the rest.
        assert!(body("fn apply_sharing(").contains("PEEKOUT.with"));
        // The capability lets the page call its commands.
        assert!(include_str!("../capabilities/default.json").contains("\"peekout\""));
    }
    #[test]
    fn presentation_stop_lights_and_home_hide_it_in_the_shell() {
        let ap = body("fn peekout_apply(");
        for p in ["quiet()", "peeker().light()", "overlay_busy()", "HOME_OPEN.load(Ordering::SeqCst)", "companion_hidden()", "PEEKOUT_STOP_UNTIL", "peekout::allowed(", "setting_now(\"notch.peek\")", "setting_now(\"notch.peekSide\")"] {
            assert!(ap.contains(p), "{p}");
        }
        let heard = body("fn peekout_heard(");
        assert!(heard.contains("\"app.stop_everything\"") && heard.contains("PEEKOUT_STOP_UNTIL.store("), "{heard}");
        assert!(body("fn peek_heard(").contains("peekout_heard(app, v);"), "every event the pages get, Stop from the key and the menu among them");
        // M90 review (rule 5): the light is set first, so the peek reads it on and hides; and the caller waits for that, as
        // it waits for the character (peek_now), before the microphone opens or the screen is read.
        let ph = body("fn peek_heard(");
        let hear = ph.find("peeker().hear(").expect("hear");
        assert!(!ph[..hear].contains("peekout_heard("), "never before the light is set: {ph}");
        assert!(ph[hear..].contains("peekout_heard(app, v);"), "{ph}");
        assert!(ph.find("peek::news_of(v).is_empty()").unwrap() < hear, "{ph}");
        let heard = body("fn peekout_heard(");
        assert!(heard.contains("recv_timeout(Duration::from_millis(300))"), "waits on the main thread: {heard}");
        // For a light the window goes at once, in the same main thread turn, not a moment later.
        assert!(ap.contains("if ms == 0 {") && ap.contains("p.orderOut(None)"), "{ap}");
        // The menu bar: the pointer along the row near it moves it aside (only the pointer's place is read).
        let mv = body("fn peekout_pointer_moved(");
        assert!(mv.contains("peekout::menu_reach(") && mv.contains("PEEKOUT_MENU.store(") && mv.contains("peekout_apply(\"menu\")"), "{mv}");
        assert!(ap.contains("menu: PEEKOUT_MENU.load(Ordering::SeqCst)"), "{ap}");
        assert!(body("fn tick(").contains("peekout_tick();"), "a call starting or ending is looked at twice a second");
        assert!(body("fn place_island(").contains("peekout_apply(\"island\");"), "the island moving, opening or closing");
        assert!(body("fn island_pointer_moved(").contains("peekout_pointer_moved();"), "the click through and the hover follow the pointer");
        let h = body("fn peekout_pointer_moved(");
        assert!(h.contains("peekout::on_head(") && h.contains("setIgnoresMouseEvents(") && h.contains("island_hover_changed("), "{h}");
        assert!(body("fn home_setting_applied(").contains("\"notch.peek\" | \"notch.peekSide\""));
        // Every command once.
        let main = crate::main_src();
        let hd = &main[main.find("generate_handler![").unwrap()..];
        let hd = &hd[..hd.find(']').unwrap()];
        for c in ["peekout_want", "peekout_state"] { assert_eq!(hd.matches(&format!("{c},")).count() + hd.matches(&format!("{c}\n")).count() + usize::from(hd.trim_end().ends_with(c)), 1, "{c}"); }
    }
}
