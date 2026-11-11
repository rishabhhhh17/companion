//! Home in the notch (F18.1). Where the island sits on a display (on the notch where there is one, a small pill at the top
//! center inside the menu bar where there is not, a thin line on the top edge where no menu bar shows), how it grows (only
//! ever downward) when something needs you or when the pointer rests on it, where Home drops down to, which display it
//! lives on, and the small judgements made from the pointer: is it on our own island, which display is it on, and did a
//! press start outside every Companion window while Home is open. Points with a top left origin, like docking.rs. Pure and
//! tested; the AppKit glue is in main.rs.

use crate::docking::{card_frame, Edge, Rect};
use std::path::{Path, PathBuf};

/// Home's size (the card, F18; the home.size setting): its width, wide enough for its five tabs, the least height it has,
/// and the tallest it grows (its page asks for its content's height, and main.rs `resize_card` holds it between the two).
/// The character keeps clear of Home at its tallest: its own place always (docking.rs `dock_zone`), a trip beside a window
/// while Home is open (main.rs `card_room`, from `card_spot`). Both come from the size in force (main.rs `home_size`), so
/// they always agree with where Home is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HomeSize { pub w: f64, pub min_h: f64, pub max_h: f64 }
impl HomeSize {
    /// The usual size: 640 wide, 300 to 640 tall. Home is one black panel that hangs from the notch (27 Oct 2026: the founder
    /// asked for the notch apps' look, "this needs to be fun"): the character on the left, the job and the ask box beside it.
    /// It is as tall as what it shows, from 300.
    pub const STANDARD: HomeSize = HomeSize { w: 640.0, min_h: 300.0, max_h: 640.0 };
    /// Large: 680 wide, 320 to 760 tall, for larger text. No wider: on the smallest display we place on (1024 wide) the
    /// character, 160 plus its margin, must still fit beside Home (docking.rs, never under it); 720 failed that (27 Oct 2026).
    pub const LARGE: HomeSize = HomeSize { w: 680.0, min_h: 320.0, max_h: 760.0 };
    /// Wide (M51, 1 Nov 2026, the founder: the tall panel "looks so vertical"; HeyClicky's wide window "looks so much
    /// better"): the usual layout (look.layout). A landscape window with the places and the recent work in a list on the
    /// left and the work on the right, and one height, so its list stays put and the work scrolls beside it.
    /// 688 wide is the widest Home can be: on the smallest display we place on (1024 wide) the character, 160 plus the
    /// clear margin, must still fit beside Home on the top edge and on the side edges (docking.rs, never under it); 720, the
    /// first guess, failed that. 480 tall leaves a 13 inch MacBook Air (1470 by 956, its work area 850 tall with the Dock
    /// below) well over 300 points free under Home, and fits under the notch of a 14 inch at its largest text (745 tall).
    pub const WIDE: HomeSize = HomeSize { w: 688.0, min_h: 480.0, max_h: 480.0 };
    /// Wide and Large (home.size large): as wide, and taller, for larger text. The display still bounds it (home_frame).
    pub const WIDE_LARGE: HomeSize = HomeSize { w: 688.0, min_h: 560.0, max_h: 560.0 };
    /// The usual size: wide, at the standard size.
    pub const USUAL: HomeSize = HomeSize::WIDE;
    /// The size the home.size word and the look.layout word name together. Tall is the panel from before M51; anything
    /// else is wide, the usual layout. A size word other than large is the standard size.
    pub fn of(size: &str, layout: &str) -> HomeSize {
        let large = size == "large";
        match (layout == "tall", large) {
            (true, false) => HomeSize::STANDARD,
            (true, true) => HomeSize::LARGE,
            (false, false) => HomeSize::WIDE,
            (false, true) => HomeSize::WIDE_LARGE,
        }
    }
    /// A size with one height: the wide ones. Home keeps that height whatever it shows (its list on the left stays put).
    pub fn fixed(&self) -> bool { self.min_h == self.max_h }
}
/// Settings' fixed height inside the tall Home (the overhaul spec, 3.1): its sidebar stays put and its pages scroll.
pub const SETTINGS_H: f64 = 640.0;
/// The size Home takes while Settings is open in it. In the tall Home: at least the Large width (its 184 sidebar and 520
/// column fit), and one fixed height, so moving between pages never makes Home jump. In the wide Home: Home's own size, which
/// already has one height and is wider than Large, with Settings' own list on the left in place of Home's; so opening
/// Settings never makes Home jump either. The display still bounds it (card_spot). Closed: as set.
pub fn with_settings(base: HomeSize, open: bool) -> HomeSize {
    if !open || base.fixed() { return base; }
    HomeSize { w: base.w.max(HomeSize::LARGE.w), min_h: SETTINGS_H, max_h: SETTINGS_H }
}
/// The usual size, as Home's window is made at launch (before any setting is read) and as the tests name it.
pub const CARD: (f64, f64) = (HomeSize::USUAL.w, HomeSize::USUAL.min_h);
#[cfg_attr(not(test), allow(dead_code))]   // the tests name the usual tallest; the app reads the size in force
pub const CARD_MAX_H: f64 = HomeSize::USUAL.max_h;

/// The camera housing of a display that has one: its left edge counted from the display's left edge, its width and height.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Notch { pub x: f64, pub w: f64, pub h: f64 }

/// A notch narrower or wider than this is not a notch (a bad reading), and the pill is used instead.
pub const MIN_NOTCH_W: f64 = 60.0;
pub const MAX_NOTCH_W: f64 = 400.0;

/// Reads the notch from what NSScreen reports: `safeAreaInsets.top`, and the widths of `auxiliaryTopLeftArea` and
/// `auxiliaryTopRightArea` (the menu bar either side of the camera). Only the widths are used, so it does not matter whether
/// macOS gives those two areas in the display's own coordinates or in global ones. None for a display without a notch.
pub fn notch_from(screen_w: f64, safe_top: f64, left_w: f64, right_w: f64) -> Option<Notch> {
    // Written so that a NaN fails every check.
    if !(screen_w > 0.0 && safe_top > 0.0 && safe_top <= 80.0 && left_w > 0.0 && right_w > 0.0) { return None; }
    let w = screen_w - left_w - right_w;
    if !(MIN_NOTCH_W..=MAX_NOTCH_W).contains(&w) { return None; }
    Some(Notch { x: left_w, w, h: safe_top })
}

/// A display as the island and the character both see it: its frame and work area, and its notch if it has one. One type
/// for both (docking.rs `Screen`), so the character keeps clear of the island and Home from the same reading.
pub use crate::docking::Screen as Display;

/// What the island sits on. Notch: the camera housing, on a display that has one. Pill: a small pill in the middle of the
/// menu bar, on a display without a notch. Edge: a thin line on the top edge, where no menu bar shows (it hides itself, or
/// this display has none), so that nothing sits on the front app's own window (its title, tabs or toolbar) all day.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { Notch, Pill, Edge }
impl Kind { pub fn word(self) -> &'static str { match self { Kind::Notch => "notch", Kind::Pill => "pill", Kind::Edge => "edge" } } }

/// How big the island is (the fun island, 27 Oct 2026). Rest: the bare notch (the pill, or the thin line), with nothing on
/// it. On a notch the window is exactly the notch, so nothing beside it takes a click (F28: the sun is gone). Wings:
/// something is happening, so it grows short wings either side, in the menu bar row only: a tiny Flowflow on the left, a
/// live mark on the right. Peek: the pointer rests on the bare notch, so Flowflow peeks out below it (and a line,
/// wider, when there is something to say). WingsPeek: the pointer rests on the wings, so one line opens below them.
/// `Alert` is the wings (the name docking.rs and roam.rs know); its word for the page is "wings".
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode { Rest, Alert, Peek, WingsPeek }
impl Mode { pub fn word(self) -> &'static str { match self { Mode::Rest => "rest", Mode::Alert => "wings", Mode::Peek => "peek", Mode::WingsPeek => "wingsPeek" } } }

/// The bare pill in the middle of a menu bar without a notch: small, and nothing written on it.
pub const PILL_W: f64 = 72.0;
/// The thin line on the top edge where no menu bar shows.
pub const EDGE_H: f64 = 5.0;
/// Each wing, either side of the notch or the pill: room for a tiny Flowflow or one mark, and no more of the menu bar.
pub const WING: f64 = 40.0;
/// M55, live progress: while a job works, the right wing says its step in a word with a thin line of the four steps under
/// it, and the page asks for wings as wide as the longest word needs (island_alert `wing`). Both wings take that width, so
/// the shape stays centred on the notch, and never more than this of the menu bar each side. Off (island.showStep), or
/// with nothing at work, the usual WING.
pub const WING_MAX: f64 = 96.0;
/// The width each wing is drawn at, from what the page asked: never narrower than WING, never wider than WING_MAX, and
/// nonsense (or nothing asked) is the usual WING.
pub fn wing_w(asked: f64) -> f64 { if asked.is_finite() && asked > WING { asked.min(WING_MAX) } else { WING } }
/// The hover panel (27 Oct 2026, the founder: "like HeyClicky's notch hover", "Flowflow is not the main guy"): resting the
/// pointer on the island opens a small black panel hanging from it, the notch grown down, with the ask bar, the two things
/// Squibby is for, and each job at work as a little card with its plan and then its result (island.tsx). This wide, so it
/// fits on the smallest MacBook screen and inside the character's clear zone (docking.rs NOTCH_CLEAR, with CLEAR_MARGIN).
pub const PANEL_W: f64 = 400.0;
/// How tall the panel may be below the notch's row: the page measures what it shows and asks (island_alert `panel`).
pub const PANEL_MIN: f64 = 56.0;
pub const PANEL_MAX: f64 = 240.0;
/// The height the page asked for, kept between PANEL_MIN and PANEL_MAX (nonsense is the smallest).
pub fn panel_h(asked: f64) -> f64 { if asked.is_finite() { asked.clamp(PANEL_MIN, PANEL_MAX) } else { PANEL_MIN } }
/// The usual macOS menu bar on a display without a notch: the pill's size where no menu bar shows.
pub const DEFAULT_MENU_BAR: f64 = 24.0;
/// Between the island and Home, and between Home and the bottom of the work area.
pub const GAP: f64 = 6.0;
/// The island's window level: above the menu bar (24) and its status items (25), so it can sit on the notch and show over
/// a menu bar that hides itself. Home stays at the card's own floating level below the menu bar, and the pointer overlay at 25.
pub const LEVEL: isize = 27;

/// The height of the menu bar this display shows: the notch's on a display with one, else the distance from the top of the
/// display to its work area. None when no menu bar shows (it hides itself, or this display has none) or the reading makes
/// no sense.
pub fn menu_bar(d: &Display) -> Option<f64> {
    if let Some(n) = d.notch { return Some(n.h); }
    let h = d.work[1] - d.frame[1];
    (18.0..=44.0).contains(&h).then_some(h)
}

pub fn kind(d: &Display) -> Kind {
    if d.notch.is_some() { Kind::Notch } else if menu_bar(d).is_some() { Kind::Pill } else { Kind::Edge }
}

/// The island's middle: the notch's, or the display's.
fn center_x(d: &Display) -> f64 {
    match d.notch { Some(n) => d.frame[0] + n.x + n.w / 2.0, None => d.frame[0] + d.frame[2] / 2.0 }
}

/// A left edge for something `w` wide around `cx`, kept on the span from `x0`, `span` wide.
fn around(cx: f64, w: f64, x0: f64, span: f64) -> f64 { (cx - w / 2.0).clamp(x0, (x0 + span - w).max(x0)) }

/// The pill's height in a menu bar `mb` tall: a little inside it.
fn pill_h(mb: f64) -> f64 { (mb - 4.0).max(16.0).min(mb) }

/// The island at rest, in global points.
fn rest_frame(d: &Display) -> Rect {
    let (fx, fy, fw) = (d.frame[0], d.frame[1], d.frame[2]);
    let w = PILL_W.min(fw);
    let x = around(center_x(d), w, fx, fw);
    match (d.notch, menu_bar(d)) {
        (Some(n), _) => [fx + n.x, fy, n.w, n.h],
        // M66: the pill hangs from the top edge, as a notch does, so Home grows from the edge, never from a point 2 pt down.
        (None, Some(mb)) => [x, fy, w, pill_h(mb)],
        (None, None) => [x, fy, w, EDGE_H],
    }
}

/// What the island page is told along with its size: the window's frame, the width of the notch (or the pill) in its
/// middle, which the wings sit either side of, the height of the top row they sit in, and how wide each wing is (WING,
/// or wider while a job's step is shown, M55).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Look { pub frame: Rect, pub core: f64, pub row: f64, pub wing: f64 }

/// Where the island is drawn and what it holds. `panel`: how tall the hover panel is below the row (island.tsx measures it).
/// Every size is centred on the notch (or the display) and hangs from the same top, so the page's shape, centred in the
/// window, stays in place on the screen when the window changes.
pub fn look(d: &Display, mode: Mode, panel: f64) -> Look { look_winged(d, mode, panel, 0.0) }
/// The same, with the wings the page asked for (`wing`, island_alert; wing_w keeps it between WING and WING_MAX). Only the
/// wings and the panel under them change with it; the bare notch and the panel under it never do.
pub fn look_winged(d: &Display, mode: Mode, panel: f64, wing: f64) -> Look {
    let wing = match mode { Mode::Alert | Mode::WingsPeek => wing_w(wing), Mode::Rest | Mode::Peek => WING };
    let r = rest_frame(d);
    let (fx, fw, cx) = (d.frame[0], d.frame[2], center_x(d));
    let core = r[2];
    // The wings' row: the notch's height, the pill's, or (where only the thin line shows) the pill it grows into.
    let (top, row) = match kind(d) { Kind::Edge => (d.frame[1], pill_h(DEFAULT_MENU_BAR)), _ => (r[1], r[3]) };
    let at = |w: f64, top: f64, h: f64| { let w = w.min(fw); [around(cx, w, fx, fw), top, w, h] };
    let winged = core + 2.0 * wing;
    let frame = match mode {
        // F28: the bare notch at rest. On a notch the window, and so the click and hover area, is exactly the notch.
        Mode::Rest => r,
        Mode::Alert => at(winged, top, row),
        Mode::Peek => at(winged.max(PANEL_W), r[1], r[3] + panel_h(panel)),
        Mode::WingsPeek => at(winged.max(PANEL_W), top, row + panel_h(panel)),
    };
    let row = match mode { Mode::Rest | Mode::Peek => r[3], Mode::Alert | Mode::WingsPeek => row };
    Look { frame, core, row, wing }
}

/// How much wider the wings get for a moment when a fix is proven (the done tick): the page springs its shape out and back.
pub const CHEER: f64 = 8.0;
/// The wings during that moment: CHEER wider around the same middle, the same top and height, kept on the display. Only the
/// wings (Alert, WingsPeek) cheer; the bare notch and the peek stay as they are.
pub fn cheered(d: &Display, mode: Mode, l: Look) -> Look {
    if !matches!(mode, Mode::Alert | Mode::WingsPeek) { return l; }
    let w = (l.frame[2] + CHEER).min(d.frame[2]);
    Look { frame: [around(center_x(d), w, d.frame[0], d.frame[2]), l.frame[1], w, l.frame[3]], ..l }
}

/// Where the island is drawn, in global points.
pub fn frame_of(d: &Display, mode: Mode, panel: f64) -> Rect { look(d, mode, panel).frame }
/// The biggest the island gets in `mode` (the tallest panel): what the character keeps clear of (docking.rs, roam.rs).
pub fn island_frame(d: &Display, mode: Mode) -> Rect { frame_of(d, mode, PANEL_MAX) }

// ---- the motion (the fun island: springs, 27 Oct 2026) ----
// The window changes at once and the page springs its black shape inside it (island.tsx). Growing is at once, so the shape
// has room to grow into. Shrinking waits RETRACT_MS, so the shape can tuck back before the window is cut to the new size.
// Never with Reduce motion or Less motion (main.rs reduce_motion).

/// How long the hover panel's words take to leave before the page's shape starts to tuck back (islandSpring.ts
/// PANEL_EXIT_MS, M66 step 5: the words go first, never cut by the shape's edge).
pub const PANEL_EXIT_MS: u64 = 80;
/// How long the window waits before it gets smaller, while the shape tucks back: the same as islandSpring.ts TUCK_MS (the
/// panel's words leaving, then CLOSE from the wings to the notch, within a point by then; island.test.ts pins the two equal).
pub const RETRACT_MS: u64 = 540;
/// The new frame fits inside the old one around the same middle and top: the island is getting smaller where it is.
pub fn shrinks_in_place(from: Rect, to: Rect) -> bool {
    let mid = |r: Rect| r[0] + r[2] / 2.0;
    (mid(from) - mid(to)).abs() < 0.5 && (from[1] - to[1]).abs() < 0.5 && to[2] <= from[2] + 0.5 && to[3] <= from[3] + 0.5 && (to[2] < from[2] - 0.5 || to[3] < from[3] - 0.5)
}
/// How long to wait before the window takes the frame `to`: RETRACT_MS when it gets smaller in place (the shape tucks back
/// first), else nothing (growing, the same size, another display, or `reduced` motion: at once).
pub fn retract_ms(from: Rect, to: Rect, reduced: bool) -> Option<u64> { (!reduced && shrinks_in_place(from, to)).then_some(RETRACT_MS) }
/// The frames asked of one moving panel (the island, Home). AppKit lets a motion that is still running finish on its old
/// target when the frame is then set at once, so each change is noted here, and a motion that ends sets the frame asked
/// last again when that was set at once after it (`ended`). A newer motion ends on its own target.
#[derive(Clone, Copy, Debug, Default)]
pub struct Moves { n: u64, last: Option<(Rect, bool)> }
impl Moves {
    pub const fn new() -> Self { Moves { n: 0, last: None } }
    /// A frame is asked, as a motion (`moving`) or at once. Gives the number to hand back when that motion ends.
    pub fn ask(&mut self, f: Rect, moving: bool) -> u64 { self.n += 1; self.last = Some((f, moving)); self.n }
    /// The motion asked as `mine` ended: the frame to set again now, if a newer one was set at once meanwhile.
    pub fn ended(&self, mine: u64) -> Option<Rect> { match self.last { Some((f, false)) if self.n != mine => Some(f), _ => None } }
}
// ---- M66 Part 2: Home grows out of the notch as one black shape ----
// Home's window is made once at a fixed size, top anchored on the island's display and centred on the notch, and it never
// changes during a motion (only on a display, setting or Settings change). Its page draws one black shape inside it that is
// the island at rest, widens, drops into Home and folds back (homeShape.ts), moving only by transform and opacity, so Core
// Animation runs it at the display's rate. Clicks pass through the clear part of the window: the shell sets
// ignoresMouseEvents from the pointer against the shape's rects (`shape_rects`, `inside_shape`), never from key events.

/// The notch's springs: mass 1, stiffness and damping per second, from a response and a damping ratio (islandSpring.ts NOTCH,
/// pinned equal by islandSpring.test.ts). The page runs them as CSS curves; these are for the tests and any native move.
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spring { pub k: f64, pub c: f64 }
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
impl Spring {
    /// From a response (seconds for one swing) and a damping ratio: k = (2 pi / response) squared, c = 4 pi x damping / response.
    pub fn of(response: f64, damping: f64) -> Spring {
        let w = 2.0 * std::f64::consts::PI / response;
        Spring { k: w * w, c: 4.0 * std::f64::consts::PI * damping / response }
    }
    pub fn damping(&self) -> f64 { self.c / (2.0 * self.k.sqrt()) }
}
/// The hover nudge, a press, the done pulse: response 0.38 s, damping 0.80.
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
pub const NOTCH_HOVER: Spring = Spring { k: 273.0, c: 26.5 };
/// The width when Home opens: 0.36 s, 0.82.
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
pub const NOTCH_OPEN_W: Spring = Spring { k: 305.0, c: 28.6 };
/// The height when Home opens, OPEN_H_DELAY_MS after the width: 0.42 s, 0.84.
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
pub const NOTCH_OPEN_H: Spring = Spring { k: 224.0, c: 25.1 };
/// Every close and tuck back, never past its target: 0.45 s, 1.0.
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
pub const NOTCH_CLOSE: Spring = Spring { k: 195.0, c: 27.9 };
/// The busy strip and its caption line: 0.30 s, 0.85.
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
pub const NOTCH_WORK: Spring = Spring { k: 439.0, c: 35.6 };
/// The height starts this long after the width, so the notch reads as stretching sideways first, then dropping.
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
pub const OPEN_H_DELAY_MS: u64 = 60;

/// Room kept around the open shape inside Home's window, so the overshoot and the shoulders are never clipped.
pub const HEADROOM: f64 = 24.0;
/// Home's window level: just under the island (LEVEL), above the menu bar (24) and its status items (25), so its shape can
/// hang from the top edge of the display like the notch it grows from.
pub const HOME_LEVEL: isize = 26;
/// The Show me how pointer's panel and the ring (main.rs make_overlay): above Home and the island, so an arrow pointing at
/// something near the notch is never drawn under Home's body, and still below pop up menus (101).
pub const POINTER_LEVEL: isize = 28;
/// Home's level while one of our own macOS dialogs is up (the folder chooser, Open from a link, the Delete everything
/// question, at the modal panel level 8): under them, as Home was before M66, so a dialog is never hidden behind it.
pub const UNDER_DIALOG_LEVEL: isize = 3;
/// Home's window level now: under our own dialogs while one is up, else above the menu bar (HOME_LEVEL).
pub fn home_level(dialog_up: bool) -> isize { if dialog_up { UNDER_DIALOG_LEVEL } else { HOME_LEVEL } }
/// Whether Home's panel may become the key window (take typing): only while the pointer is on its shape (the person is
/// clicking into it) or a typing key opened it. Never from a press on its clear parts (rule 9).
pub fn home_can_key(on_shape: bool, by_key: bool) -> bool { on_shape || by_key }
/// Home's bottom corner when open, and the hardware notch's own corner it grows from (homeShape.ts OPEN_R, REST_R).
pub const OPEN_R: f64 = 24.0;
#[cfg_attr(not(test), allow(dead_code))]   // the page runs these; the tests pin them
pub const REST_R: f64 = 11.0;

/// The height of the island's row on a display: the menu bar's (the notch's on a notched Mac), or the thin line's where no
/// menu bar shows. Home's band sits in it, and Home's body hangs under it.
pub fn band_h(d: &Display) -> f64 { menu_bar(d).unwrap_or_else(|| rest_frame(d)[3]) }

/// Home's window and the shape's measures inside it, as the page is told them (homeShape.ts HomeGeom). `kind`: what the
/// shape grows from ("notch", "pill", "edge"), or "free" with no island (turned off in Settings): then the body only fades in
/// where it sits. `cx`: the shape's centre from the window's left. `rest`: the island at rest. `band`: the band in the menu
/// bar row when open (the notch and its wings, F18). `body_top`: from the window's top.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HomePanel { pub frame: Rect, pub kind: &'static str, pub cx: f64, pub rest: (f64, f64), pub band: (f64, f64), pub body_w: f64, pub min_h: f64, pub max_h: f64, pub body_top: f64 }
impl HomePanel {
    pub fn json(&self) -> serde_json::Value {
        serde_json::json!({ "kind": self.kind, "pw": self.frame[2], "ph": self.frame[3], "cx": self.cx,
            "rest": { "w": self.rest.0, "h": self.rest.1 }, "band": { "w": self.band.0, "h": self.band.1 },
            "body": { "w": self.body_w, "minH": self.min_h, "maxH": self.max_h, "top": self.body_top } })
    }
    /// The body's height for a content height, between its least and its tallest.
    pub fn body_h(&self, h: f64) -> f64 { if h.is_finite() { h.clamp(self.min_h, self.max_h) } else { self.min_h } }
}

/// Home's window for the size in force. `sizes`: every size Home may take without a display or setting change (the size, and
/// the size with Settings open), so opening Settings never resizes the window. With the island's display (`on`): top
/// anchored at the display's top, centred on the notch, as wide as the widest body or band plus HEADROOM each side, and as
/// tall as the band, the tallest body and HEADROOM, kept on the display. Without one: `spot`, Home's own place beside the
/// character at its tallest and widest, with HEADROOM all round. `now`: the size in force; the body is its width (held to
/// the window), so a tall Standard Home is 640 wide with Settings closed and 680 with it open, in the same window.
pub fn home_panel(on: Option<&Display>, sizes: &[HomeSize], now: HomeSize, spot: Option<Rect>) -> Option<HomePanel> {
    let w = sizes.iter().map(|s| s.w).fold(0.0, f64::max);
    let max_h = sizes.iter().map(|s| s.max_h).fold(0.0, f64::max);
    let min_h = sizes.iter().map(|s| s.min_h).fold(f64::INFINITY, f64::min);
    if !(w > 0.0 && max_h > 0.0 && min_h.is_finite()) { return None; }
    let Some(d) = on else {
        let s = spot?;
        let frame = [s[0] - HEADROOM, s[1] - HEADROOM, s[2] + 2.0 * HEADROOM, s[3] + 2.0 * HEADROOM];
        return Some(HomePanel { frame, kind: "free", cx: HEADROOM + s[2] / 2.0, rest: (0.0, 0.0), band: (0.0, 0.0), body_w: now.w.min(s[2]).max(0.0), min_h: min_h.min(s[3]), max_h: s[3], body_top: HEADROOM });
    };
    let (fx, fy, fw, fh) = (d.frame[0], d.frame[1], d.frame[2], d.frame[3]);
    let r = rest_frame(d);
    let bh = band_h(d);
    let band_w = (r[2] + 2.0 * WING).min(fw);
    let wide_w = w.min(d.work[2]).max(0.0);
    let body_w = now.w.min(wide_w).max(0.0);
    // Hanging from the band; never above the work area (a reading where the work area starts lower).
    let top = (fy + bh).max(d.work[1]).min(d.work[1] + d.work[3]);
    let room = (d.work[1] + d.work[3] - top - GAP).max(0.0);
    let max_h = max_h.min(room);
    let pw = (wide_w.max(band_w) + 2.0 * HEADROOM).min(fw);
    let ph = (top - fy + max_h + HEADROOM).min(fh);
    let cx = center_x(d);
    let x = around(cx, pw, fx, fw);
    Some(HomePanel { frame: [x, fy, pw, ph], kind: kind(d).word(), cx: cx - x, rest: (r[2], r[3]), band: (band_w, bh), body_w, min_h: min_h.min(max_h), max_h, body_top: top - fy })
}

/// Home grows from what the island shows, and folds back into it (M66 step 5): with something running (`wing`: the wings
/// out, as wide as the page asked, island_alert), its shape at rest is the wings, not the bare notch, so the wings never
/// vanish as Home opens over them nor pop back as it closes. The band open is never narrower than the wings it grew from,
/// and so never wider than they are (F18). The window and the body are unchanged. Without an island ("free") nothing changes.
pub fn grown_from(p: HomePanel, d: &Display, wing: Option<f64>) -> HomePanel {
    let Some(asked) = wing else { return p };
    if p.kind == "free" { return p; }
    let f = look_winged(d, Mode::Alert, PANEL_MIN, asked).frame;
    // Kept inside the window's headroom, centred on the notch.
    let room = (2.0 * p.cx.min(p.frame[2] - p.cx) - 2.0 * HEADROOM).max(0.0);
    let w = f[2].min(room.max(p.rest.0));
    HomePanel { rest: (w, f[3]), band: (p.band.0.max(w), p.band.1), ..p }
}

/// The shape's rects in global points, for the hit test, the click away watch and the character keeping clear: open, the
/// band and the body `h` tall (its content's height, held in range); closed, nothing (the island takes the pointer).
pub fn shape_rects(p: &HomePanel, open: bool, h: f64) -> Vec<Rect> {
    if !open { return Vec::new(); }
    let (x, y) = (p.frame[0], p.frame[1]);
    let body = [x + p.cx - p.body_w / 2.0, y + p.body_top, p.body_w, p.body_h(h)];
    if p.kind == "free" { return vec![body]; }
    vec![[x + p.cx - p.band.0 / 2.0, y, p.band.0, p.band.1], body]
}

/// Whether `pt` is on the shape: in one of its rects grown by `slack`, except outside the body's round bottom corners (the
/// last rect, radius OPEN_R). Pure: the shell sets the window's click through from it.
pub fn inside_shape(rects: &[Rect], pt: (f64, f64), slack: f64) -> bool {
    let Some(last) = rects.len().checked_sub(1) else { return false };
    rects.iter().enumerate().any(|(i, r)| {
        let (x0, y0, x1, y1) = (r[0] - slack, r[1] - slack, r[0] + r[2] + slack, r[1] + r[3] + slack);
        if !(pt.0 >= x0 && pt.0 < x1 && pt.1 >= y0 && pt.1 < y1) { return false; }
        i != last || on_foot(*r, OPEN_R, pt, slack)
    })
}
/// Whether `pt` (already in `r` grown by `slack`) is on its round bottom corners of radius `rad`: below a corner's centre
/// line and beside it, the point must be within the corner's circle.
fn on_foot(r: Rect, rad: f64, pt: (f64, f64), slack: f64) -> bool {
    let rad = rad.min(r[2] / 2.0).min(r[3]).max(0.0);
    let cy = r[1] + r[3] - rad;
    if pt.1 <= cy { return true; }
    let cxl = r[0] + rad;
    let cxr = r[0] + r[2] - rad;
    let dx = if pt.0 < cxl { cxl - pt.0 } else if pt.0 > cxr { pt.0 - cxr } else { 0.0 };
    let dy = pt.1 - cy;
    (dx * dx + dy * dy).sqrt() <= rad + slack
}

/// M70 step 5: Home grown from the notch's small panel. While it opens, homeShape.ts draws the band at the panel's width
/// (`from`), so the hit test takes that band too: the band is never narrower than `from_w`. Otherwise `shape_rects`.
pub fn shape_rects_from(p: &HomePanel, open: bool, h: f64, from_w: Option<f64>) -> Vec<Rect> {
    let mut r = shape_rects(p, open, h);
    if let (Some(w), Some(band)) = (from_w, r.first_mut()) {
        if p.kind != "free" && w > band[2] { *band = [p.frame[0] + p.cx - w / 2.0, band[1], w, band[3]]; }
    }
    r
}
/// How long after the opening starts the panel's band stays in Home's hit test: the opening (the height's delay and its
/// spring, --seq-notch-height-at and --dur-notch-open-h), then the close curve's middle as the band eases back to the
/// notch and its wings (homeShape.css data-from). Pinned against tokens.css.
pub const FROM_BAND_MS: u64 = 780;
/// The panel's band width now, from what the shell kept at the opening (`(width, until)`, epoch ms) and the time `t`.
pub fn from_band(kept: Option<(f64, u64)>, t: u64) -> Option<f64> { kept.filter(|k| t < k.1).map(|k| k.0) }

/// The small panel's bottom corners when fully open (style.css `.island.notch { --r-open: 22px }`, and the usual --r-card
/// on the pill and the line). The window is exactly the panel, so the clear parts are only beside these corners.
pub const PANEL_R_NOTCH: f64 = 22.0;
pub const PANEL_R_CARD: f64 = 12.0;
/// The bottom corner the island's shape is drawn with in a mode, for the click through: only the small panel (Peek,
/// WingsPeek) is cut; at rest and with the wings out the window is the shape, as before.
pub fn island_corner(mode: Mode, kind: Kind) -> f64 {
    match (mode, kind) { (Mode::Peek | Mode::WingsPeek, Kind::Notch) => PANEL_R_NOTCH, (Mode::Peek | Mode::WingsPeek, _) => PANEL_R_CARD, _ => 0.0 }
}
/// Whether the island's window should let the pointer at `pt` through: it is on the window (`window`, its frame now) but
/// not on the shape drawn in it (`shape`: the frame the shape is at or tucking into, and its bottom corner). Off the
/// window there is nothing to pass, so the window stays as it is and its hover tracking keeps working. Pure.
pub fn island_pass(window: Option<Rect>, shape: (Rect, f64), pt: (f64, f64)) -> bool {
    let Some(w) = window else { return false };
    if !contains(w, pt) { return false; }
    let (r, rad) = shape;
    !(contains(r, pt) && on_foot(r, rad, pt, 0.0))
}

/// A Home that pointing opened folds back once the pointer has been off its shape for the grace (island.closeDelay, the
/// same wait as the status's); a return inside the grace cancels it. Only with home.closeOnClickAway on (main.rs watch_home). Once the person presses inside it (to type, to choose), it is theirs and stays until Esc, Close or a
/// click elsewhere. A Home opened by a click or a key never folds on leaving.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Leave { by_point: bool, owned: bool, out_since: Option<u64> }
impl Leave {
    pub const fn new(by_point: bool) -> Self { Leave { by_point, owned: false, out_since: None } }
    pub fn pressed_inside(&mut self) { self.owned = true; self.out_since = None; }
    /// The pointer is (`inside`) on the shape at `t`: true once it should fold back now.
    pub fn sample(&mut self, inside: bool, t: u64, grace_ms: u64) -> bool {
        if !self.by_point || self.owned || inside { self.out_since = None; return false; }
        let since = *self.out_since.get_or_insert(t);
        t.saturating_sub(since) >= grace_ms
    }
}

/// Where Home's body is: centered under the island, hanging from the menu bar line (or the thin line) as one shape with the
/// notch (M66: no gap), kept inside the work area (a tall Home is made shorter, and scrolls, rather than running under the
/// Dock). The same body home_panel draws.
pub fn home_frame(d: &Display, size: (f64, f64)) -> Rect {
    let [wx, wy, ww, wh] = d.work;
    let w = size.0.min(ww).max(0.0);
    let top = (d.frame[1] + band_h(d)).max(wy).min(wy + wh);
    let h = size.1.min((wy + wh - top - GAP).max(0.0)).max(0.0);
    [around(center_x(d), w, wx, ww), top, w, h]
}

/// Where Home (the card) is at `size` (its width and its height now): the one answer used both to place it and to keep the
/// character clear of it (main.rs `place_card`, `card_room`). With the island's display known (`on`), it drops down from
/// the island (`home_frame`). Otherwise (no display found for the island yet, or the island turned off in Settings) it
/// goes beside the character's home as before F18, on the display that home is on (else the first), facing into the
/// screen from that display's edge (`edge_of`, then docking.rs `card_frame`). Never beside where the character may be
/// visiting a window.
pub fn card_spot(on: Option<&Display>, home: Rect, screens: &[Display], edge_of: impl FnOnce(&str) -> Edge, size: (f64, f64)) -> Option<Rect> {
    if let Some(d) = on { return Some(home_frame(d, size)); }
    let c =(home[0] + home[2] / 2.0, home[1] + home[3] / 2.0);
    let s = screens.iter().find(|s| contains(s.frame, c)).or(screens.first())?;
    Some(card_frame(home, size, s.work, edge_of(&s.id)))
}

pub fn contains(r: Rect, p: (f64, f64)) -> bool { p.0 >= r[0] && p.0 < r[0] + r[2] && p.1 >= r[1] && p.1 < r[1] + r[3] }

/// Which display the island lives on, and why. When the person opens Home (`follow_mouse`), the display with the mouse
/// pointer: that is the one they are using. Otherwise the one it was on last (the same id, else a display of the same size,
/// which is the same monitor plugged in at another place), else the one with the pointer, else the primary one.
pub fn pick<'a>(list: &'a [Display], last: &str, mouse: (f64, f64), follow_mouse: bool) -> Option<(&'a Display, &'static str)> {
    let under = || list.iter().find(|d| contains(d.frame, mouse));
    if follow_mouse { if let Some(d) = under() { return Some((d, "under_mouse")); } }
    if !last.is_empty() {
        if let Some(d) = list.iter().find(|d| d.id == last) { return Some((d, "remembered")); }
        let size = last.split('@').next().unwrap_or("");
        if !size.is_empty() { if let Some(d) = list.iter().find(|d| d.id.split('@').next() == Some(size)) { return Some((d, "same_size")); } }
    }
    if let Some(d) = under() { return Some((d, "under_mouse")); }
    list.iter().find(|d| d.primary).or(list.first()).map(|d| (d, "primary"))
}

/// Which display the island and Home use (the island.display setting). Follow me: the one the person is using (`pick`,
/// today's rule). Built in: the Mac's own screen, else the main one (the lid is closed, or the Mac has no screen of its
/// own). Main: the display with the menu bar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Where { Follow, BuiltIn, Main }
impl Where {
    /// The display an island.display word names; anything else is Follow me (the usual one).
    pub fn of(word: &str) -> Where { match word { "builtIn" => Where::BuiltIn, "main" => Where::Main, _ => Where::Follow } }
}

/// Which display the island lives on, with the setting: `builtin` is the id of the Mac's own screen when it is connected
/// and on (main.rs reads it from macOS), never a guess. The main display is the first macOS lists (the one with the menu
/// bar), marked `primary`.
pub fn pick_where<'a>(list: &'a [Display], wanted: Where, builtin: Option<&str>, last: &str, mouse: (f64, f64), follow_mouse: bool) -> Option<(&'a Display, &'static str)> {
    let main = || list.iter().find(|d| d.primary).or(list.first()).map(|d| (d, "main"));
    match wanted {
        Where::Follow => pick(list, last, mouse, follow_mouse),
        Where::BuiltIn => builtin.and_then(|id| list.iter().find(|d| d.id == id)).map(|d| (d, "built_in")).or_else(main),
        Where::Main => main(),
    }
}

/// How long the pointer must stay on another display before the island moves there, unless Settings says otherwise
/// (island.followDelay; main.rs looks twice a second).
pub const FOLLOW_MS: u64 = 3000;

/// The island goes to the display the person is using: the one the pointer has stayed on for a few seconds. A quick trip
/// to another display does not move it, and while Home is open it stays (Home drops from it). Only which display the pointer
/// is on is used; never what is on the screen.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Follow { on: String, since: u64 }
impl Follow {
    pub const fn new() -> Self { Follow { on: String::new(), since: 0 } }
    /// `under`: the display the pointer is on now (None in a gap between displays); `current`: the island's display;
    /// `hold`: Home is open; `wait_ms`: how long the pointer must stay (FOLLOW_MS unless changed in Settings). Returns the
    /// display to move to, once.
    pub fn sample(&mut self, under: Option<&str>, current: &str, hold: bool, t: u64, wait_ms: u64) -> Option<String> {
        let Some(u) = under.filter(|u| !hold && *u != current) else { self.on.clear(); return None };
        if self.on != u { self.on = u.to_string(); self.since = t; return None; }
        if t.saturating_sub(self.since) < wait_ms { return None; }
        self.on.clear();
        Some(u.to_string())
    }
}

/// What decides the island's size: the pointer is on it, something is happening (the wings), Home is open, and how tall
/// the hover panel's contents are (`panel`, whole points, as the page measured them). `quiet` (M46): a call or a
/// presentation is on with Quiet during calls on, or Companion is hidden; the island then never opens by itself.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct State { pub hover: bool, pub alert: bool, pub home_open: bool, pub panel: u16, pub ask: bool, pub quiet: bool, pub wing: u16 }

/// M34 (HeyClicky's notch shows how many results are new): results finished while Home was closed, counted up to 99 (the
/// hover panel says "9+" past nine, M46); any result while Home is open is seen at once.
pub fn unseen_next(n: u32, home_open: bool) -> u32 { if home_open { 0 } else { (n + 1).min(99) } }

/// M52 (F30): changes another AI tool made in the open project, ready to review (the engine's review.batch, and a result
/// that arrived while Home was closed). Said quietly on the notch's hover panel, the way the count of new results is: no
/// wings, no peek, no sound (rule 16). It goes out when Home is opened, when the page asks for the review, closes it (Looks
/// fine) or fixes it, when the changes went away again (count 0), or when the engine starts again (it knows no batch then).
/// Only the batch's name is kept, never a file name or a word of the review.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ReviewReady { batch: Option<String>, key: bool }
/// A batch's name as the engine makes them ("rv_" and a few hex characters); anything else is not one.
fn review_batch(v: &serde_json::Value) -> Option<&str> {
    v.get("batch").and_then(serde_json::Value::as_str)
        .filter(|b| b.len() > 3 && b.len() <= 40 && b.starts_with("rv_") && b[3..].chars().all(|c| c.is_ascii_alphanumeric()))
}
fn same_folder(a: &str, b: &str) -> bool { let (a, b) = (a.trim_end_matches('/'), b.trim_end_matches('/')); !a.is_empty() && a == b }
/// M57 feature 5: the batch carries the instant key warning (its places, or only their count as the shell passes it on).
fn has_keys(v: &serde_json::Value) -> bool {
    match v.get("keys") { Some(serde_json::Value::Array(a)) => !a.is_empty(), Some(k) => k.as_u64().unwrap_or(0) > 0, None => false }
}
impl ReviewReady {
    pub const fn new() -> Self { ReviewReady { batch: None, key: false } }
    pub fn on(&self) -> bool { self.batch.is_some() }
    /// M57 feature 5: the lit batch has the instant key warning, so the panel's quiet line says a key was written.
    pub fn key(&self) -> bool { self.batch.is_some() && self.key }
    /// Puts it out. True when it was on.
    pub fn clear(&mut self) -> bool { self.key = false; self.batch.take().is_some() }
    fn light(&mut self, id: &str) -> bool { let was = self.batch.replace(id.to_string()); was.as_deref() != Some(id) }
    /// An event from the engine. `project`: the folder open now (an event about another one is not news here). `seen`: Home
    /// is open and in front, so what it says is seen at once. True when the dot changed.
    pub fn heard(&mut self, v: &serde_json::Value, project: &str, seen: bool) -> bool {
        let t = v.get("type").and_then(serde_json::Value::as_str).unwrap_or("");
        if t == "runner.hello" || t == "app.runner_down" { return self.clear(); }
        if t != "review.batch" && t != "review.result" { return false; }
        if !v.get("project").and_then(serde_json::Value::as_str).is_some_and(|p| same_folder(p, project)) { return false; }
        let Some(id) = review_batch(v) else { return false };
        if t == "review.result" {
            // A review that could not be done is nothing new to look at; a finished one is, unless Home shows it now.
            if v.get("ok") != Some(&serde_json::Value::Bool(true)) { return false; }
            // Once reviewed, the review's own words say any key; the warning's line gives way.
            if seen { return self.clear(); }
            let was_key = std::mem::replace(&mut self.key, false);
            return self.light(id) || was_key;
        }
        if v.get("count").and_then(serde_json::Value::as_u64).unwrap_or(0) == 0 {
            // The changes went away again. A batch that already moved on says nothing about the newer one.
            return self.batch.as_deref() == Some(id) && self.clear();
        }
        if seen { return self.clear(); }
        let key = has_keys(v);
        let was_key = std::mem::replace(&mut self.key, key);
        self.light(id) || was_key != key
    }
    /// A command a page sent, after the shell's checks: Review now, Looks fine or Fix it. One that names a batch that already
    /// moved on leaves the newer one lit. True when the dot changed.
    pub fn asked(&mut self, v: &serde_json::Value) -> bool {
        let t = v.get("type").and_then(serde_json::Value::as_str).unwrap_or("");
        if !matches!(t, "review.now" | "review.dismiss" | "review.fix") { return false; }
        match v.get("batch").and_then(serde_json::Value::as_str) {
            Some(b) if self.batch.as_deref() != Some(b) => false,
            _ => self.clear(),
        }
    }
}

/// M26: Home opened by a keyboard shortcut is simply there, with no drop and no spring (like Raycast: something opened
/// many times a day by a key must feel instant). Every other way in (a click, the notch, a drop) still drops from the notch.
pub fn animates_open(source: &str) -> bool { source != "hotkey" }

/// Home open shows everything the line or the wings would, right below, so the island stays the bare notch over it.
/// A question waiting for the person (`ask`, M23: the page says so only with Open the notch for questions on) opens the
/// panel under the wings without the pointer, so it can be answered there, but never while `quiet` (M46: a call or a
/// presentation): then the wings and their marks still show (the listening light, needs you), and the pointer still
/// opens the panel, since the person did that.
pub fn mode(s: State) -> Mode {
    if s.ask && !s.home_open && !s.quiet { return Mode::WingsPeek; }
    match (s.home_open, s.hover, s.alert) {
        (true, _, _) => Mode::Rest,
        (false, true, true) => Mode::WingsPeek,
        (false, true, false) => Mode::Peek,
        (false, false, true) => Mode::Alert,
        (false, false, false) => Mode::Rest,
    }
}

/// What resting the pointer on the island opens (island.pointOpens). M70 (the founder, 4 Nov 2026: "When you first hover
/// over it, a small text or some normal things come, and then when you go to the settings, everything else comes"): the
/// small panel first (Status), the usual, or Home right away. A word the file holds wrongly is the usual.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointOpens { Home, Status }
impl PointOpens { pub fn of(word: &str) -> PointOpens { if word == "home" { PointOpens::Home } else { PointOpens::Status } } }

/// M70: the size of the small panel the island shows now (its window, width and height from the top edge), or None when it
/// shows none. Home opening at that moment grows on from it (homeShape.ts `from`), so the black shape is one shape all the
/// way from the panel into Home. Read before the hover is forgotten (main.rs open_card_then).
pub fn panel_rect(d: &Display, s: State) -> Option<(f64, f64)> {
    let m = mode(State { home_open: false, ..s });
    if !matches!(m, Mode::Peek | Mode::WingsPeek) { return None; }
    let f = look_winged(d, m, f64::from(s.panel), f64::from(s.wing)).frame;
    Some((f[2], f[3]))
}

/// What the pointer resting on the island does once the open wait has passed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointDo { OpenHome, Status, Nothing }
/// Home already open: nothing. A question already open under the wings by itself (not quiet) stays there, since the person
/// may be about to answer it in the panel. Otherwise what the setting says.
pub fn on_point(s: State, opens: PointOpens) -> PointDo {
    if s.home_open { return PointDo::Nothing; }
    if s.ask && !s.quiet { return PointDo::Status; }
    match opens { PointOpens::Home => PointDo::OpenHome, PointOpens::Status => PointDo::Status }
}
/// Whether the island is told the pointer is on it (the peek): only when the status line is what pointing does now.
pub fn peek_hover(shown: bool, act: PointDo) -> bool { shown && act == PointDo::Status }

/// How long the pointer must rest on the island before the line opens (crossing the notch on the way along the menu bar,
/// even slowly, does not open it), and how long off it before the line closes (a slip off the edge does not close it),
/// unless Settings says otherwise (island.openDelay, island.closeDelay).
pub const HOVER_IN_MS: u64 = 300;
pub const HOVER_OUT_MS: u64 = 300;
/// M73 (fluid, item 3): once what pointing opened has folded back, coming back onto the island within this long opens it
/// again at once, with no rest (the "second tooltip" rule): the person is clearly still using it.
pub const HOVER_WARM_MS: u64 = 1500;

/// The waits in force, and whether resting on the island opens the status at all (island.peekOnHover; off, the island
/// opens only on a click).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HoverTimes { pub in_ms: u64, pub out_ms: u64, pub peek: bool }
impl HoverTimes { pub const USUAL: HoverTimes = HoverTimes { in_ms: HOVER_IN_MS, out_ms: HOVER_OUT_MS, peek: true }; }

/// The pointer on our own island. macOS tells us only when it enters and leaves that one window (a tracking area on it);
/// nothing is read anywhere else.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hover { inside: bool, since: u64, shown: bool, times: HoverTimes, dismissed: bool, hid: Option<u64> }
impl Default for Hover { fn default() -> Self { Hover::new() } }
impl Hover {
    pub const fn new() -> Self { Hover { inside: false, since: 0, shown: false, times: HoverTimes::USUAL, dismissed: false, hid: None } }
    /// The waits from Settings (main.rs gives them each time the pointer comes or goes).
    pub fn set_times(&mut self, times: HoverTimes) { self.times = times; }
    pub fn enter(&mut self, t: u64) { if !self.inside { self.inside = true; self.since = t; } }
    pub fn exit(&mut self, t: u64) { self.dismissed = false; if self.inside { self.inside = false; self.since = t; } }
    /// M66: what pointing opened was put away (Esc, a click elsewhere, Close) while the pointer is still on the island: it
    /// does not open again until the pointer has left once.
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn dismiss(&mut self) { if self.inside { self.dismissed = true; self.shown = false; self.hid = None; } }
    /// The pointer is on the island now (for the hover nudge, which answers at once).
    pub fn inside(&self) -> bool { self.inside && !self.dismissed }
    fn need(&self) -> u64 {
        if !self.inside { return self.times.out_ms; }
        // M73: back within HOVER_WARM_MS of it folding: at once.
        if self.hid.is_some_and(|h| self.since >= h && self.since - h <= HOVER_WARM_MS) { return 0; }
        self.times.in_ms
    }
    /// Whether the line shows at time `t`. Never with the status on pointing turned off.
    pub fn at(&mut self, t: u64) -> bool {
        if !self.times.peek || self.dismissed { self.shown = false; return false; }
        if self.inside != self.shown && t.saturating_sub(self.since) >= self.need() {
            // It folds back at the end of the grace: kept, for the quick reopen.
            if self.shown { self.hid = Some(self.since.saturating_add(self.times.out_ms)); }
            self.shown = self.inside;
        }
        self.shown
    }
    /// How long until the answer may change, if it may.
    pub fn wait_ms(&self, t: u64) -> Option<u64> {
        (self.times.peek && !self.dismissed && self.inside != self.shown).then(|| self.need().saturating_sub(t.saturating_sub(self.since)))
    }
}

/// How often the mouse button is looked at while Home is open.
pub const CLICK_POLL_MS: u64 = 50;

/// While Home is open: a press of the mouse button that starts outside every Companion window (the island, Home, the
/// character) is a click elsewhere. Only whether the button is down and where the pointer is are read, and only while Home
/// is open; never keys, never anything on the screen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClickAway { was_down: bool }
impl ClickAway {
    /// A button already down when Home opened (the click that opened it) is not a click elsewhere.
    pub fn new(down_now: bool) -> Self { ClickAway { was_down: down_now } }
    pub fn sample(&mut self, down: bool, pointer: (f64, f64), ours: impl FnOnce() -> Vec<Rect>) -> bool {
        let pressed = down && !self.was_down;
        self.was_down = down;
        pressed && !ours().iter().any(|r| contains(*r, pointer))
    }
}

/// The file in Companion's own data folder that keeps the display the island was on last. Everything that reads or writes
/// it goes through here, so delete everything finds it (it removes every file directly in that folder).
pub fn path(data: &Path) -> PathBuf { data.join(FILE) }

/// The display the island was on last, kept in `island.json` in Companion's own folder (delete everything removes it).
pub const FILE: &str = "island.json";
pub fn parse_last(text: Option<&str>) -> String {
    text.and_then(|t| serde_json::from_str::<serde_json::Value>(t).ok()).and_then(|v| v.get("screen").and_then(|s| s.as_str().map(str::to_string))).unwrap_or_default()
}
pub fn last_json(id: &str) -> String { serde_json::json!({ "screen": id }).to_string() }

#[cfg(test)]
mod tests {
    #[test]
    fn settings_in_home_is_large_and_one_fixed_height() {
        for base in [HomeSize::STANDARD, HomeSize::LARGE, HomeSize::WIDE, HomeSize::WIDE_LARGE] { assert_eq!(with_settings(base, false), base); }
        // The tall Home: Settings takes the Large width and its own one height.
        for base in [HomeSize::STANDARD, HomeSize::LARGE] {
            let s = with_settings(base, true);
            assert_eq!((s.w, s.min_h, s.max_h), (HomeSize::LARGE.w, SETTINGS_H, SETTINGS_H));
        }
        // The wide Home (M51): Settings opens at Home's own size, which is wider than Large and has one height, so Home never
        // jumps when Settings opens or closes.
        for base in [HomeSize::WIDE, HomeSize::WIDE_LARGE] {
            assert_eq!(with_settings(base, true), base);
            assert!(base.fixed() && base.w >= HomeSize::LARGE.w);
        }
        assert!(!HomeSize::STANDARD.fixed() && !HomeSize::LARGE.fixed(), "the tall Home grows with what it shows");
        // The page tells the shell (card.tsx), and every place the size is read goes through home_size (main.rs).
        let main = crate::main_src();
        assert!(main.contains("fn home_size() -> island::HomeSize { island::with_settings(home_set().size, SETTINGS_OPEN.load(Ordering::SeqCst)) }"));
        assert!(main.contains("fn resize_card(app: AppHandle, height: f64, settings: Option<bool>) {"));
        assert!(!main.contains("hs.size.min_h"), "the size in force is home_size(), Settings included");
    }
    use super::*;

    // Real Macs, in points at their default "looks like" size (top left origin).
    // 14 inch MacBook Pro: 1512 x 982, a notch about 185 wide and 32 tall, the menu bar as tall as the notch, the Dock below.
    fn mbp14() -> Display {
        Display { id: "1512x982@0,0".into(), frame: [0.0, 0.0, 1512.0, 982.0], work: [0.0, 32.0, 1512.0, 875.0], primary: true,
            notch: notch_from(1512.0, 32.0, 663.5, 663.5) }
    }
    // 16 inch MacBook Pro: 1728 x 1117, the same notch.
    fn mbp16() -> Display {
        Display { id: "1728x1117@0,0".into(), frame: [0.0, 0.0, 1728.0, 1117.0], work: [0.0, 32.0, 1728.0, 1010.0], primary: true,
            notch: notch_from(1728.0, 32.0, 771.5, 771.5) }
    }
    // An external 2560 x 1440 monitor to the right of the laptop, its top 458 points higher, a 24 point menu bar, no Dock.
    fn ext() -> Display {
        Display { id: "2560x1440@1512,-458".into(), frame: [1512.0, -458.0, 2560.0, 1440.0], work: [1512.0, -434.0, 2560.0, 1416.0], primary: false, notch: None }
    }
    // An older MacBook Air without a notch: 1440 x 900, a 24 point menu bar.
    fn air() -> Display { Display { id: "1440x900@0,0".into(), frame: [0.0, 0.0, 1440.0, 900.0], work: [0.0, 24.0, 1440.0, 806.0], primary: true, notch: None } }
    fn inside(r: Rect, outer: Rect) -> bool { r[0] >= outer[0] - 0.01 && r[1] >= outer[1] - 0.01 && r[0] + r[2] <= outer[0] + outer[2] + 0.01 && r[1] + r[3] <= outer[1] + outer[3] + 0.01 }
    fn cx(r: Rect) -> f64 { r[0] + r[2] / 2.0 }

    #[test]
    fn the_notch_is_read_from_the_two_areas_beside_it() {
        let n = notch_from(1512.0, 32.0, 663.5, 663.5).unwrap();
        assert_eq!(n, Notch { x: 663.5, w: 185.0, h: 32.0 });
        // An uneven reading still puts it where the left area ends.
        assert_eq!(notch_from(1512.0, 32.0, 660.0, 667.0).unwrap().x, 660.0);
    }
    #[test]
    fn a_display_without_a_notch_or_a_reading_that_makes_no_sense_has_none() {
        assert_eq!(notch_from(2560.0, 0.0, 0.0, 0.0), None, "an external monitor reports no safe area and empty side areas");
        assert_eq!(notch_from(1512.0, 32.0, 0.0, 0.0), None, "a safe area but no side areas");
        assert_eq!(notch_from(1512.0, 32.0, 756.0, 756.0), None, "no room left for a camera");
        assert_eq!(notch_from(1512.0, 32.0, 300.0, 300.0), None, "912 points is not a notch");
        assert_eq!(notch_from(1512.0, -5.0, 663.5, 663.5), None);
        assert_eq!(notch_from(1512.0, f64::NAN, 663.5, 663.5), None);
    }
    #[test]
    fn home_grows_from_the_small_panel_only_while_the_island_shows_it() {
        let d = mbp14();
        let st = |hover: bool, alert: bool, ask: bool| State { hover, alert, home_open: false, panel: 132, ask, quiet: false, wing: 40 };
        // The pointer opened the small panel: Home grows from exactly that window, PANEL_W wide, the row and 132 tall.
        let (w, h) = panel_rect(&d, st(true, false, false)).unwrap();
        assert_eq!((w, h), (PANEL_W, frame_of(&d, Mode::Peek, 132.0)[3]));
        assert_eq!(h, look(&d, Mode::Rest, PANEL_MIN).row + 132.0);
        // Under the wings while something runs, and for a question that opened it by itself.
        assert_eq!(panel_rect(&d, st(true, true, false)).map(|r| r.0), Some(PANEL_W));
        assert!(panel_rect(&d, st(false, true, true)).is_some());
        // No panel: none (Home grows from the notch or the wings as before). Home already open counts as not open here.
        assert_eq!(panel_rect(&d, st(false, false, false)), None);
        assert_eq!(panel_rect(&d, st(false, true, false)), None);
        assert!(panel_rect(&d, State { home_open: true, ..st(true, false, false) }).is_some());
        // The pill and the edge line show the same panel.
        assert_eq!(panel_rect(&air(), st(true, false, false)).map(|r| r.0), Some(PANEL_W));
    }
    #[test]
    fn pointing_opens_the_small_panel_by_default_and_home_right_away_is_a_choice() {
        assert_eq!(PointOpens::of("status"), PointOpens::Status);
        assert_eq!(PointOpens::of("home"), PointOpens::Home);
        assert_eq!(PointOpens::of(""), PointOpens::Status, "nothing stored is the usual: the small panel first");
        assert_eq!(PointOpens::of("nonsense"), PointOpens::Status);
    }
    #[test]
    fn stop_everything_closes_the_small_panel_and_forgets_the_hover_until_the_pointer_leaves() {
        let main = crate::main_src();
        let body = |n: &str| { let at = main.find(n).unwrap(); main[at..at + main[at..].find("\n}\n").unwrap()].to_string() };
        assert!(body("fn home_stop_now(").contains("home_fold("));
        assert!(body("fn home_fold(").contains("home_closed();"));
        let closed = body("fn home_closed(");
        assert!(closed.contains("reset_hover();") && closed.contains("place_island(mtm, false, \"home_closed\")"), "{closed}");
        assert_eq!(main.matches("home_stop_now(\"stop_everything\")").count(), 2, "the hotkey and the menu");
        // Forgetting the hover leaves the pointer counted outside: macOS tells only of entering and leaving, so the panel
        // opens again only once the pointer has left and come back.
        let mut h = Hover::new();
        h.enter(0);
        assert!(h.at(400));
        let mut h = Hover::new();   // reset_hover
        assert!(!h.at(10_000) && h.wait_ms(10_000).is_none());
        h.exit(10_100);
        assert!(!h.at(20_000));
        h.enter(20_000);
        assert!(h.at(20_400));
    }
    #[test]
    fn on_a_notch_the_island_at_rest_is_exactly_the_notch() {
        // F28: the bare notch at rest, the sun gone. The window, and so the click and hover area, is the notch itself, so
        // nothing beside the camera takes a click from the menu bar.
        let d = mbp14();
        assert_eq!(frame_of(&d, Mode::Rest, PANEL_MIN), [663.5, 0.0, 185.0, 32.0]);
        let l = look(&d, Mode::Rest, PANEL_MIN);
        assert_eq!(l.core, l.frame[2], "the page is told the notch's own width, the whole window");
        assert_eq!(l.core, 185.0);
        let big = mbp16();
        assert_eq!(frame_of(&big, Mode::Rest, PANEL_MIN), [771.5, 0.0, 185.0, 32.0]);
        assert_eq!(look(&big, Mode::Rest, PANEL_MIN).core, look(&big, Mode::Rest, PANEL_MIN).frame[2]);
        assert_eq!(menu_bar(&d), Some(32.0));
    }
    // The menu bar beside the notch holds app menus and status icons, and the middle of a menu bar without a notch can
    // hold menu titles. The island must never take those clicks: whatever its size, the part of it inside the menu bar is
    // exactly the notch, or the pill at rest. It only ever grows downward, below the menu bar.
    // The fun island (27 Oct 2026): the founder asked for wings like the best notch apps. The menu bar beside the notch holds
    // app menus and status icons, so the wings take only a little of it: WING either side, in the notch's own row, never
    // taller than the notch. Wider than that only while the pointer rests on it and it has a line to show.
    #[test]
    fn on_a_notch_the_wings_take_only_a_little_of_the_menu_bar_either_side() {
        assert!((36.0..=44.0).contains(&WING), "about 36 to 44 points each side");
        for d in [mbp14(), mbp16()] {
            let n = d.notch.unwrap();
            let w = frame_of(&d, Mode::Alert, PANEL_MIN);
            assert_eq!(w, [d.frame[0] + n.x - WING, d.frame[1], n.w + 2.0 * WING, n.h], "{}: the notch plus a wing each side, as tall as the notch", d.id);
            assert_eq!(frame_of(&d, Mode::Alert, PANEL_MAX), w, "the panel's height changes nothing until the pointer rests on it");
            // The pointer on the bare notch: the panel hangs from it, PANEL_W wide, as tall as the page asked.
            let p = frame_of(&d, Mode::Peek, 120.0);
            assert_eq!((p[1], p[2], p[3]), (d.frame[1], PANEL_W, n.h + 120.0), "{}", d.id);
            assert!((cx(p) - (d.frame[0] + n.x + n.w / 2.0)).abs() < 0.01, "{} centred on the notch", d.id);
            let look = look(&d, Mode::Alert, PANEL_MIN);
            assert_eq!((look.core, look.row), (n.w, n.h), "the page is told the notch's width and the wings' row");
        }
    }
    #[test]
    fn every_size_hangs_from_the_top_centred_and_only_the_panel_under_the_pointer_is_wider_than_the_wings() {
        let mut hidden = air(); hidden.work = [0.0, 0.0, 1440.0, 830.0];
        for d in [mbp14(), mbp16(), ext(), air(), hidden] {
            let rest = frame_of(&d, Mode::Rest, PANEL_MIN);
            let wings = frame_of(&d, Mode::Alert, PANEL_MIN);
            for m in [Mode::Rest, Mode::Alert, Mode::Peek, Mode::WingsPeek] {
                for panel in [PANEL_MIN, PANEL_MAX] {
                    let r = frame_of(&d, m, panel);
                    assert!((cx(r) - cx(rest)).abs() < 0.01, "{} {m:?} centred on the notch or the display", d.id);
                    assert!(r[1] <= rest[1] + 0.01 && r[1] >= d.frame[1], "{} {m:?} hangs from the top", d.id);
                    assert!(inside(r, d.frame), "{} {m:?}", d.id);
                    if matches!(m, Mode::Peek | Mode::WingsPeek) { assert_eq!(r[2], PANEL_W.max(wings[2]).min(d.frame[2]), "{} {m:?}: the panel", d.id); } else { assert!(r[2] <= wings[2] + 0.01, "{} {m:?} no wider than the wings", d.id); }
                }
            }
        }
    }
    #[test]
    fn on_a_notch_the_pointer_opens_the_panel_below_the_notch_or_the_wings_as_tall_as_the_page_asks_within_limits() {
        let d = mbp14();
        assert_eq!(frame_of(&d, Mode::WingsPeek, 150.0), [756.0 - PANEL_W / 2.0, 0.0, PANEL_W, 32.0 + 150.0], "below the wings");
        assert_eq!(frame_of(&d, Mode::Peek, 150.0), [756.0 - PANEL_W / 2.0, 0.0, PANEL_W, 32.0 + 150.0], "below the bare notch");
        assert_eq!(frame_of(&d, Mode::Peek, 9999.0)[3], 32.0 + PANEL_MAX, "never taller than PANEL_MAX");
        assert_eq!(frame_of(&d, Mode::Peek, -3.0)[3], 32.0 + PANEL_MIN);
        assert_eq!(panel_h(f64::NAN), PANEL_MIN, "nonsense is the smallest");
        assert!(PANEL_W + 2.0 * crate::docking::CLEAR_MARGIN <= crate::docking::NOTCH_CLEAR.0, "the character's clear zone holds the panel");
    }
    #[test]
    fn without_a_notch_it_is_a_small_bare_pill_at_the_top_center_and_its_wings_stay_inside_the_menu_bar() {
        for d in [ext(), air()] {
            assert_eq!(kind(&d), Kind::Pill, "{}", d.id);
            let mb = menu_bar(&d).unwrap();
            assert_eq!(mb, 24.0, "{}", d.id);
            for (m, w) in [(Mode::Rest, PILL_W), (Mode::Alert, PILL_W + 2.0 * WING)] {
                let r = frame_of(&d, m, PANEL_MIN);
                assert!((cx(r) - cx(d.frame)).abs() < 0.01, "{} {m:?} centred", d.id);
                assert!(r[1] >= d.frame[1] && r[1] + r[3] <= d.frame[1] + mb, "{} {m:?} inside the menu bar: {r:?}", d.id);
                assert_eq!(r[2], w);
            }
            assert_eq!(frame_of(&d, Mode::Alert, PANEL_MIN)[3], frame_of(&d, Mode::Rest, PANEL_MIN)[3], "the wings are as tall as the pill");
            let p = frame_of(&d, Mode::WingsPeek, PANEL_MAX);
            assert_eq!(p[2], PANEL_W);
            assert!(p[1] + p[3] >= d.frame[1] + mb + PANEL_MIN, "the panel opens below the menu bar");
            assert!((cx(p) - cx(d.frame)).abs() < 0.01);
            assert_eq!(look(&d, Mode::Alert, PANEL_MIN).core, PILL_W);
        }
        // The external monitor's pill is on the external monitor, not the laptop.
        assert!((cx(frame_of(&ext(), Mode::Rest, PANEL_MIN)) - (1512.0 + 1280.0)).abs() < 0.01);
    }
    #[test]
    fn where_the_menu_bar_hides_itself_or_there_is_none_it_is_a_thin_line_at_the_top_edge() {
        // With no menu bar showing, a pill would sit on the front app's own window (its title, tabs or toolbar) all day.
        // So at rest it is only a thin line on the top edge; it grows into a pill with wings while something happens.
        let mut hidden = air();
        hidden.work = [0.0, 0.0, 1440.0, 830.0];   // the menu bar hides itself: the work area starts at the top
        let mut second = ext();
        second.work = second.frame;   // a second display with no menu bar ("Displays have separate Spaces" off)
        let mut junk = air();
        junk.work = [0.0, 300.0, 1440.0, 500.0];   // a reading that makes no sense: no menu bar is assumed
        for d in [hidden, second, junk] {
            assert_eq!(kind(&d), Kind::Edge, "{}", d.id);
            assert_eq!(menu_bar(&d), None, "{}", d.id);
            let r = frame_of(&d, Mode::Rest, PANEL_MIN);
            assert_eq!(r[1], d.frame[1], "{} on the top edge", d.id);
            assert_eq!(r[3], EDGE_H, "{} only a thin line", d.id);
            assert!((cx(r) - cx(d.frame)).abs() < 0.01, "{} centred", d.id);
            let a = frame_of(&d, Mode::Alert, PANEL_MIN);
            assert!(a[3] > EDGE_H && a[3] <= DEFAULT_MENU_BAR && a[1] == d.frame[1], "{} the pill with wings shows while something happens: {a:?}", d.id);
            assert_eq!(frame_of(&d, Mode::Peek, PANEL_MIN)[3], EDGE_H + PANEL_MIN);
            let h = home_frame(&d, (380.0, 420.0));
            assert!(inside(h, d.work) && h[1] >= r[1] + r[3], "{} Home below the line: {h:?}", d.id);
        }
        assert_eq!(Kind::Edge.word(), "edge");
        assert_eq!(kind(&mbp14()), Kind::Notch);
    }
    #[test]
    fn a_display_narrower_than_the_line_keeps_the_island_on_it() {
        let d = Display { id: "250x500@0,0".into(), frame: [0.0, 0.0, 250.0, 500.0], work: [0.0, 24.0, 250.0, 476.0], primary: true, notch: None };
        for m in [Mode::Rest, Mode::Alert, Mode::Peek, Mode::WingsPeek] { for panel in [PANEL_MIN, PANEL_MAX] { assert!(inside(frame_of(&d, m, panel), d.frame), "{m:?} {panel}"); } }
    }
    #[test]
    fn home_drops_down_from_the_island_centered_and_inside_the_work_area() {
        for d in [mbp14(), mbp16(), ext(), air()] {
            let h = home_frame(&d, (380.0, 420.0));
            let island = frame_of(&d, Mode::Rest, PANEL_MIN);
            assert!(inside(h, d.work), "{}: {h:?} inside {:?}", d.id, d.work);
            assert!((cx(h) - cx(island)).abs() < 0.01, "{} centered under the island", d.id);
            assert!(h[1] >= island[1] + island[3], "{} below the island", d.id);
            assert!(h[1] <= d.work[1] + GAP + 0.01, "{} right under the menu bar", d.id);
            assert_eq!((h[2], h[3]), (380.0, 420.0));
        }
        // M66: one shape with the notch, so no gap: Home's body hangs from the menu bar line.
        assert_eq!(home_frame(&mbp14(), (380.0, 420.0)), [756.0 - 190.0, 32.0, 380.0, 420.0]);
    }

    // ---- F18 items 1 and 2 together: one place for Home, used to put it there and to keep the character clear of it ----
    #[test]
    fn home_is_under_the_island_when_its_display_is_known_and_beside_the_character_otherwise() {
        let (mac, ext) = (mbp14(), ext());
        let both = [mac.clone(), ext.clone()];
        // The character lives on the right edge of the laptop, halfway down.
        let home = [1352.0, 427.5, 160.0, 160.0];
        let mut asked: Vec<String> = Vec::new();
        for h in [CARD.1, 420.0, CARD_MAX_H] {
            // The island's display known: Home drops from the island, wherever the character lives, and no edge is read.
            let spot = card_spot(Some(&mac), home, &both, |id: &str| { asked.push(id.to_string()); Edge::Right }, (CARD.0, h)).unwrap();
            assert_eq!(spot, home_frame(&mac, (CARD.0, h)), "{h}");
            assert!((cx(spot) - cx(frame_of(&mac, Mode::Rest, PANEL_MIN))).abs() < 0.01 && spot[1] >= 32.0, "under the notch, hanging from the menu bar line (M66): {spot:?}");
            assert!(!crate::docking::overlaps(spot, home), "never over the character");
            // On the external display when the island is there, even with the character on the laptop.
            assert_eq!(card_spot(Some(&ext), home, &both, |_: &str| Edge::Right, (CARD.0, h)), Some(home_frame(&ext, (CARD.0, h))));
            // No display known for the island: beside the character's home, facing into the screen from its edge, as before F18.
            let beside = card_spot(None, home, &both, |id: &str| { asked.push(id.to_string()); Edge::Right }, (CARD.0, h)).unwrap();
            assert_eq!(beside, card_frame(home, (CARD.0, h), mac.work, Edge::Right), "{h}");
            assert!(beside[0] + beside[2] <= home[0], "to the left of a character on the right edge: {beside:?}");
            // At its tallest it holds every shorter Home, so keeping clear of the tallest keeps clear of Home however it grows.
            for on in [Some(&mac), None] {
                let tallest = card_spot(on, home, &both, |_: &str| Edge::Right, (CARD.0, CARD_MAX_H)).unwrap();
                let now = card_spot(on, home, &both, |_: &str| Edge::Right, (CARD.0, h)).unwrap();
                assert!(inside(now, tallest), "{on:?} {h}: {now:?} not in {tallest:?}");
            }
        }
        assert_eq!(asked, vec![mac.id.clone(); 3], "an edge is read only for Home beside the character, for the display home is on");
        // A home on the external display, with no island display known: beside it there, with that display's edge.
        let on_ext = [3912.0, 300.0, 160.0, 160.0];
        let e = card_spot(None, on_ext, &both, |id: &str| if id == ext.id { Edge::Right } else { Edge::Left }, (CARD.0, 300.0)).unwrap();
        assert_eq!(e, card_frame(on_ext, (CARD.0, 300.0), ext.work, Edge::Right));
        // A home on no display at all: kept on the first display.
        let l = card_spot(None, [-5000.0, -5000.0, 160.0, 160.0], &both, |_: &str| Edge::Left, (CARD.0, 300.0)).unwrap();
        assert!(inside(l, mac.work), "{l:?}");
        assert_eq!(card_spot(None, home, &[], |_: &str| Edge::Right, (CARD.0, 300.0)), None, "no display at all: nowhere");
        assert_eq!(card_spot(Some(&mac), home, &[], |_: &str| Edge::Right, (CARD.0, 300.0)), Some(home_frame(&mac, (CARD.0, 300.0))));
        // M51 (1 Nov 2026, the founder approved the wide Home): the usual Home is 688 wide with one height, 480.
        assert_eq!((CARD, CARD_MAX_H), ((688.0, 480.0), 480.0), "Home is 688 wide and 480 tall");
    }
    fn main_body(name: &str) -> String {
        let main = crate::main_src();
        let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..];
        s[..s.find("\n}\n").unwrap()].to_string()
    }
    #[test]
    fn the_shell_has_one_place_for_home_and_one_tallest_height() {
        let main = crate::main_src();
        let spot = main_body("fn card_spot(");
        assert!(spot.contains("island::card_spot(") && spot.contains("ISLAND_ON") && spot.contains("roamer().home()"), "card_spot asks the rule, with the island's display and the character's home");
        assert_eq!(main.matches("island::home_frame(").count(), 0, "Home is placed only through card_spot");
        assert_eq!(main.matches("card_frame(").count(), 0, "and only card_spot puts it beside the character");
        // One size definition (island.rs HomeSize), and the size in force comes from one place (home.size, home_size()).
        assert!(main.contains("use island::CARD;") && !main.contains("const CARD:") && !main.contains("CARD_MAX_H") && !main.contains("HomeSize { w:"), "one card size, defined here");
        // While Settings is open, Large and one fixed height (with_settings); otherwise the size home.size names.
        assert!(main.contains("fn home_size() -> island::HomeSize { island::with_settings(home_set().size, SETTINGS_OPEN.load(Ordering::SeqCst)) }"));
        let rc = main_body("fn resize_card(");
        assert!(rc.contains("let hs = home_size();") && rc.contains("height.clamp(hs.min_h, hs.max_h)"), "Home never grows past what the character keeps clear of");
        assert!(main_body("fn card_room(").contains("card_spot(mtm, d, home_size().max_h)"), "trips keep clear of Home where card_spot says, at its tallest");
        let pc = main_body("fn place_card(");
        assert!(pc.contains("island::home_panel(") && pc.contains("card_spot(mtm, d, home_size().max_h)"), "placed, then the visit checked against the tallest");
        // Home is placed at its width in force, its height held inside its range, and the character keeps clear of it at
        // the same size, on its own place and when dragged.
        assert!(spot.contains("let size = home_size();") && spot.contains("(w, h.clamp(size.min_h, size.max_h))"), "{spot}");
        assert!(main_body("fn apply_dock(").contains("docking::place(&target, DOCK, edge, pct, home_size())"));
        // M47: the let go decides snap or stay (docking::Drag::release calls snap_on with the size in force).
        assert!(main_body("fn drop_dock(").contains(".release(home_size())"));
    }
    #[test]
    fn a_change_of_displays_puts_the_character_the_island_and_home_back_and_both_features_keep_their_wiring() {
        let main = crate::main_src();
        let tick = main_body("fn tick(");
        let order = ["apply_dock(mtm, \"screens_changed\", false)", "place_island(mtm, false, \"screens_changed\")", "with_panels(place_card);", "follow_pointer(mtm)", "roam_tick(app, &wins, front_pid)"];
        let at: Vec<usize> = order.iter().map(|p| tick.find(p).unwrap_or_else(|| panic!("tick lost {p}"))).collect();
        assert!(at.windows(2).all(|w| w[0] < w[1]), "in this order: {order:?}");
        // The character's displays carry the notch, read once the same way as the island's.
        assert!(main.contains("fn screens_now(mtm: MainThreadMarker) -> Vec<Screen> { displays_now(mtm) }"));
        // Every command from both sides reaches the pages.
        let h = &main[main.find("generate_handler![").unwrap()..];
        let h = &h[..h.find(']').unwrap()];
        let cmds: Vec<&str> = h["generate_handler![".len()..].split(',').map(str::trim).collect();
        for c in ["toggle_card", "island_click", "island_alert", "island_state", "resize_card", "key_map", "key_choices", "set_key", "reset_keys", "settings_get", "settings_set", "settings_reset", "settings_migrate", "drag_dock", "drop_dock", "close_card"] {
            assert_eq!(cmds.iter().filter(|x| **x == c).count(), 1, "{c} is a command once");
        }
        // Hidden from screen sharing: the island, Home (the card), the ring overlay and the character.
        let share = main_body("fn apply_sharing(");
        for p in ["ISLAND.with", "card.setSharingType(t)", "OVERLAY.with", "dock.setSharingType(t)"] { assert!(share.contains(p), "{p}"); }
    }
    #[test]
    fn a_home_taller_than_the_work_area_is_made_shorter_and_never_runs_under_the_dock() {
        let d = air();
        let h = home_frame(&d, (380.0, 2000.0));
        assert!(inside(h, d.work));
        assert!(h[3] > 600.0, "it still uses the room there is");
        let tiny = Display { id: "t".into(), frame: [0.0, 0.0, 200.0, 60.0], work: [0.0, 24.0, 200.0, 30.0], primary: true, notch: None };
        let t = home_frame(&tiny, (380.0, 400.0));
        assert!(t[2] <= 200.0 && t[3] >= 0.0 && inside(t, tiny.work), "{t:?}");
    }
    #[test]
    fn the_island_goes_to_the_display_being_used_and_remembers_it() {
        let both = [mbp14(), ext()];
        let on_ext = (2000.0, 100.0);
        let on_mac = (100.0, 500.0);
        // Opening Home: the display with the pointer.
        assert_eq!(pick(&both, "1512x982@0,0", on_ext, true).map(|(d, w)| (d.id.as_str(), w)), Some(("2560x1440@1512,-458", "under_mouse")));
        // Otherwise the one it was on last, wherever the pointer is.
        assert_eq!(pick(&both, "2560x1440@1512,-458", on_mac, false).map(|(d, w)| (d.id.as_str(), w)), Some(("2560x1440@1512,-458", "remembered")));
        // The same monitor plugged back in at another place.
        let moved = [mbp14(), Display { id: "2560x1440@-2560,0".into(), frame: [-2560.0, 0.0, 2560.0, 1440.0], work: [-2560.0, 24.0, 2560.0, 1416.0], primary: false, notch: None }];
        assert_eq!(pick(&moved, "2560x1440@1512,-458", on_mac, false).map(|(d, w)| (d.id.as_str(), w)), Some(("2560x1440@-2560,0", "same_size")));
        // Nothing remembered: the pointer, then the primary.
        assert_eq!(pick(&both, "", on_ext, false).map(|(_, w)| w), Some("under_mouse"));
        assert_eq!(pick(&both, "", (-9999.0, -9999.0), false).map(|(d, w)| (d.id.as_str(), w)), Some(("1512x982@0,0", "primary")));
        // The pointer off every display while opening: back to the remembered one.
        assert_eq!(pick(&both, "2560x1440@1512,-458", (-9999.0, -9999.0), true).map(|(_, w)| w), Some("remembered"));
        assert!(pick(&[], "x", on_mac, true).is_none());
        // When the pointer was not read (only a size change), the remembered display, else the primary.
        let unread = (f64::NAN, f64::NAN);
        assert_eq!(pick(&both, "2560x1440@1512,-458", unread, false).map(|(_, w)| w), Some("remembered"));
        assert_eq!(pick(&both, "", unread, false).map(|(_, w)| w), Some("primary"));
    }
    #[test]
    fn the_island_sits_above_the_menu_bar_and_its_icons_but_is_never_a_screen_saver_or_a_menu() {
        assert!(LEVEL > 25, "above the menu bar (24) and status items (25)");
        assert!(LEVEL < 101, "below pop up menus, so a menu opened from the menu bar is never covered");
    }
    /// M66 step 6: Home above the menu bar must never hide the Show me how pointer or our own macOS dialogs.
    #[test]
    fn home_never_covers_the_pointer_or_our_own_dialogs() {
        assert!(HOME_LEVEL > 25 && HOME_LEVEL < LEVEL, "above the menu bar and its icons, under the island");
        assert!(POINTER_LEVEL > HOME_LEVEL && POINTER_LEVEL > LEVEL, "the pointer's arrow and ring draw over Home and the island");
        assert!(POINTER_LEVEL < 101, "and below pop up menus");
        assert_eq!(home_level(false), HOME_LEVEL);
        assert!(home_level(true) < 8, "under the modal panel level (8) our osascript dialogs use");
        let main = crate::main_src();
        assert!(main_body("fn make_overlay(").contains("p.setLevel(island::POINTER_LEVEL);"));
        assert!(!main.contains("card.setLevel(island::HOME_LEVEL)"), "Home's level is always home_level, never set around it");
        let lv = main_body("fn home_level_now(");
        assert!(lv.contains("island::home_level(NATIVE_DIALOGS.load(Ordering::SeqCst) > 0)") && lv.contains("c.setLevel("), "{lv}");
        // Every dialog lowers Home while it is up and raises it again after.
        assert!(main.contains("impl NativeDialog { fn open() -> Self { NATIVE_DIALOGS.fetch_add(1, Ordering::SeqCst); home_level_now(); NativeDialog } }"));
        assert!(main.contains("impl Drop for NativeDialog { fn drop(&mut self) { NATIVE_DIALOGS.fetch_sub(1, Ordering::SeqCst); home_level_now(); } }"));
    }
    /// M66 step 6: Home's clear window never eats a click meant for the menu bar or an app beside it, and never takes typing
    /// from a press on its clear parts (rule 9).
    #[test]
    fn a_press_off_homes_shape_is_never_homes() {
        assert!(home_can_key(true, false) && home_can_key(false, true));
        assert!(!home_can_key(false, false), "a press on the clear window never makes Home key");
        let main = crate::main_src();
        // The panel itself checks each press against the shape, at the moment of the press (not the 50 ms watch).
        let hp = &main[main.find("mod homepanel {").unwrap()..];
        let hp = &hp[..hp.find("\n}\n").unwrap()];
        assert!(hp.contains("fn can_become_key(&self) -> bool { super::home_may_key() }"), "{hp}");
        assert!(hp.contains("#[unsafe(method(sendEvent:))]") && hp.contains("if super::home_press_off_shape(self, event) { return; }"), "{hp}");
        let off = main_body("fn home_press_off_shape(");
        assert!(off.contains("island::inside_shape(") && off.contains("home_pass(false)"), "{off}");
        assert!(main_body("fn home_may_key(").contains("island::home_can_key(!HOME_PASS.load(Ordering::SeqCst), HOME_KEY_BY_KEY.load(Ordering::SeqCst))"));
        // The click through follows each mouse move at once (the monitors the ring already has), not only the 50 ms watch.
        assert!(main.contains("let follow_global = RcBlock::new(|_e: NonNull<NSEvent>| { follow_to_pointer(); home_pointer_moved(); island_pointer_moved(); });"));
        assert!(main.contains("let follow_local = RcBlock::new(|e: NonNull<NSEvent>| -> *mut NSEvent { follow_to_pointer(); home_pointer_moved(); island_pointer_moved(); drag_follow(unsafe { e.as_ref() }); e.as_ptr() });"));
        assert!(main_body("fn home_pointer_moved(").contains("home_pass(on)"));
        // Only a press on the shape makes a pointing opened Home the person's.
        assert!(main.contains("if which == \"card\" && home_on_shape_now() { HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).pressed_inside(); }"));
    }
    #[test]
    fn the_size_follows_the_pointer_the_wings_and_home() {
        let s = |hover, alert, home_open| mode(State { hover, alert, home_open, panel: 0, ask: false, quiet: false, wing: 0 });
        assert_eq!(s(false, false, false), Mode::Rest);
        assert_eq!(s(false, true, false), Mode::Alert);
        assert_eq!(s(true, false, false), Mode::Peek);
        assert_eq!(s(true, true, false), Mode::WingsPeek);
        assert_eq!(s(true, false, true), Mode::Rest, "Home open: the line does not open over it");
        assert_eq!(s(true, true, true), Mode::Rest, "nor the wings: Home shows what is happening, right below");
        assert_eq!(s(false, true, true), Mode::Rest);
        assert_eq!([Mode::Rest, Mode::Alert, Mode::Peek, Mode::WingsPeek].map(Mode::word), ["rest", "wings", "peek", "wingsPeek"], "island.tsx reads these words");
    }
    #[test]
    fn a_pass_over_the_island_does_not_open_it_and_a_slip_off_does_not_close_it() {
        let mut h = Hover::default();
        assert!(!h.at(0));
        h.enter(1000);
        assert!(!h.at(1000 + HOVER_IN_MS - 1), "not yet");
        assert_eq!(h.wait_ms(1000), Some(HOVER_IN_MS));
        assert!(h.at(1000 + HOVER_IN_MS));
        assert_eq!(h.wait_ms(1000 + HOVER_IN_MS), None, "settled");
        h.exit(2000);
        assert!(h.at(2000 + HOVER_OUT_MS - 1), "a slip off the edge keeps it open");
        h.enter(2100);
        assert!(h.at(2100 + HOVER_OUT_MS + 50), "came back in time: still open");
        h.exit(3000);
        assert!(!h.at(3000 + HOVER_OUT_MS));
        // Passing over on the way to the menu bar.
        h.enter(4000); h.exit(4050);
        assert!(!h.at(4000 + HOVER_IN_MS + 10));
        assert!(!h.at(5000));
    }
    #[test]
    fn coming_back_soon_after_it_folded_opens_it_at_once_and_later_waits_again() {
        let mut h = Hover::default();
        h.enter(0);
        assert!(h.at(HOVER_IN_MS), "the first open waits its rest");
        h.exit(1000);
        assert!(!h.at(1000 + HOVER_OUT_MS), "folded at the end of the grace");
        // Back within 1.5 s of folding: open at once, no rest.
        let folded = 1000 + HOVER_OUT_MS;
        h.enter(folded + 900);
        assert_eq!(h.wait_ms(folded + 900), Some(0));
        assert!(h.at(folded + 900), "the second open is at once");
        // Folded again, and back much later: the usual rest again.
        h.exit(5000);
        assert!(!h.at(5000 + HOVER_OUT_MS));
        h.enter(5000 + HOVER_OUT_MS + HOVER_WARM_MS + 1);
        assert!(!h.at(5000 + HOVER_OUT_MS + HOVER_WARM_MS + 2), "too late for the quick reopen");
        assert!(h.at(5000 + HOVER_OUT_MS + HOVER_WARM_MS + 1 + HOVER_IN_MS));
        // A pass long after anything showed still never opens it.
        let mut p = Hover::default();
        p.enter(0); p.exit(50);
        assert!(!p.at(60) && !p.at(10_000));
        // After a dismiss, no quick reopen: the pointer must leave, and then the rest applies.
        let mut d = Hover::default();
        d.enter(0); assert!(d.at(HOVER_IN_MS)); d.dismiss(); d.exit(400); d.enter(500);
        assert!(!d.at(501), "a dismiss is not a fold");
        assert!(d.at(500 + HOVER_IN_MS));
    }
    #[test]
    fn crossing_the_notch_along_the_menu_bar_even_slowly_does_not_open_it() {
        // From the menus on the left to the icons on the right: 185 points at an unhurried 700 points a second is 264 ms. (M66
        // shortened the wait to 300 ms; a very slow pass, under about 620 points a second, can now open it: island.openDelay.)
        let crossing = (185.0 / 700.0 * 1000.0) as u64;
        assert!(HOVER_IN_MS > crossing, "{HOVER_IN_MS} ms is shorter than a slow crossing ({crossing} ms)");
        let mut h = Hover::default();
        h.enter(0); h.exit(crossing);
        for t in [crossing, crossing + 1, HOVER_IN_MS, HOVER_IN_MS + HOVER_OUT_MS, 10_000] { assert!(!h.at(t), "{t}"); }
        // Resting on it does open it, and soon enough to feel like a reply.
        h.enter(20_000);
        assert!(h.at(20_000 + HOVER_IN_MS));
        assert!(HOVER_IN_MS <= 600);
    }
    #[test]
    fn the_island_follows_the_person_to_another_display_after_the_pointer_stays_there() {
        let (mac, ext) = ("1512x982@0,0", "2560x1440@1512,-458");
        let mut f = Follow::new();
        assert_eq!(f.sample(Some(mac), mac, false, 0, FOLLOW_MS), None, "already there");
        // A quick trip to the other display and back does not move it.
        assert_eq!(f.sample(Some(ext), mac, false, 1000, FOLLOW_MS), None);
        assert_eq!(f.sample(Some(ext), mac, false, 1000 + FOLLOW_MS - 1, FOLLOW_MS), None);
        assert_eq!(f.sample(Some(mac), mac, false, 1000 + FOLLOW_MS + 10, FOLLOW_MS), None);
        assert_eq!(f.sample(Some(ext), mac, false, 1000 + FOLLOW_MS + 500, FOLLOW_MS), None, "the wait starts again");
        // Staying there does, once.
        let t = 1000 + FOLLOW_MS + 500;
        assert_eq!(f.sample(Some(ext), mac, false, t + FOLLOW_MS, FOLLOW_MS), Some(ext.to_string()));
        assert_eq!(f.sample(Some(ext), ext, false, t + FOLLOW_MS + 500, FOLLOW_MS), None, "it is there now");
        assert_eq!(f.sample(Some(ext), ext, false, t + 10 * FOLLOW_MS, FOLLOW_MS), None);
    }
    #[test]
    fn the_island_stays_with_home_while_home_is_open_and_a_third_display_starts_the_wait_again() {
        let (a, b, c) = ("A", "B", "C");
        let mut f = Follow::new();
        assert_eq!(f.sample(Some(b), a, true, 0, FOLLOW_MS), None);
        assert_eq!(f.sample(Some(b), a, true, 10 * FOLLOW_MS, FOLLOW_MS), None, "Home is open: it drops from the island, so neither moves");
        // Home closed: the wait starts from now, not from when the pointer first went there.
        assert_eq!(f.sample(Some(b), a, false, 10 * FOLLOW_MS + 1, FOLLOW_MS), None);
        assert_eq!(f.sample(Some(c), a, false, 10 * FOLLOW_MS + FOLLOW_MS / 2, FOLLOW_MS), None);
        assert_eq!(f.sample(Some(c), a, false, 11 * FOLLOW_MS + 2, FOLLOW_MS), None, "C only since half a wait ago");
        assert_eq!(f.sample(Some(c), a, false, 11 * FOLLOW_MS + FOLLOW_MS / 2, FOLLOW_MS), Some(c.to_string()));
        // The pointer between displays (in a gap) is no reading at all.
        let mut g = Follow::new();
        assert_eq!(g.sample(Some(b), a, false, 0, FOLLOW_MS), None);
        assert_eq!(g.sample(None, a, false, FOLLOW_MS / 2, FOLLOW_MS), None);
        assert_eq!(g.sample(Some(b), a, false, FOLLOW_MS + 1, FOLLOW_MS), None, "a gap starts the wait again");
        assert!(FOLLOW_MS >= 1500 && FOLLOW_MS <= 5000, "a few seconds");
    }
    #[test]
    fn a_press_outside_every_companion_window_is_a_click_elsewhere() {
        let ours = || vec![[663.5, 0.0, 185.0, 32.0], [566.0, 38.0, 380.0, 420.0]];
        let mut c = ClickAway::new(false);
        assert!(!c.sample(false, (10.0, 10.0), ours), "no press");
        assert!(c.sample(true, (10.0, 600.0), ours), "a press in another app");
        assert!(!c.sample(true, (10.0, 600.0), ours), "the same press held down is not a second one");
        assert!(!c.sample(false, (10.0, 600.0), ours));
        assert!(!c.sample(true, (700.0, 100.0), ours), "a press inside Home");
        assert!(!c.sample(false, (700.0, 100.0), ours));
        assert!(!c.sample(true, (700.0, 10.0), ours), "a press on the island");
    }
    #[test]
    fn the_press_that_opened_home_is_not_a_click_elsewhere() {
        let mut c = ClickAway::new(true);
        assert!(!c.sample(true, (10.0, 600.0), Vec::new));
        assert!(!c.sample(false, (10.0, 600.0), Vec::new));
        assert!(c.sample(true, (10.0, 600.0), Vec::new));
    }
    #[test]
    fn our_windows_are_only_looked_up_for_a_new_press() {
        let mut asked = 0;
        let mut c = ClickAway::new(false);
        c.sample(false, (0.0, 0.0), || { asked += 1; vec![] });
        assert_eq!(asked, 0);
        c.sample(true, (0.0, 0.0), || { asked += 1; vec![] });
        assert_eq!(asked, 1);
    }
    #[test]
    fn the_remembered_display_reads_back_and_junk_is_nothing() {
        assert_eq!(parse_last(Some(&last_json("2560x1440@1512,-458"))), "2560x1440@1512,-458");
        for junk in [None, Some(""), Some("not json"), Some("[]"), Some("{\"screen\":7}")] { assert_eq!(parse_last(junk), "", "{junk:?}"); }
    }
    #[test]
    fn the_remembered_display_is_kept_where_delete_everything_finds_it() {
        // The app reads and writes the file only through `path`, given its own data folder.
        let main = crate::main_src();
        assert!(main.contains("fn island_path() -> PathBuf { island::path(&data_dir()) }"), "main.rs names the file through island::path");
        assert_eq!(main.matches("island::FILE").count(), 0, "and never builds the path itself");
        let tmp = std::env::temp_dir().join(format!("companion-island-{}", std::process::id()));
        let (home, data) = (tmp.join("home"), tmp.join("home/Library/Application Support/dev.companion.app"));
        std::fs::create_dir_all(&data).unwrap();
        let p = path(&data);
        assert_eq!(p.parent(), Some(data.as_path()), concat!("directly in ", crate::product_s!(), " own folder"));
        crate::logfile::write_atomic(&p, last_json("x").as_bytes()).unwrap();
        let items = crate::wipe::items(&home, &data);
        let settings = items.iter().find(|i| i.id == "settings").unwrap();
        assert!(settings.paths.contains(&p), "delete everything removes it with the settings");
        assert_eq!(items.iter().filter(|i| i.paths.contains(&p)).count(), 1, "and only once");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    // ---- M11 area 4: the settings for Home, the island and the character (protocol/settings.json) ----
    #[test]
    fn home_is_wide_by_default_and_the_tall_panel_keeps_its_two_sizes() {
        // The tall panel (look.layout tall): exactly the sizes it had before M51.
        assert_eq!(HomeSize::STANDARD, HomeSize { w: 640.0, min_h: 300.0, max_h: 640.0 });
        assert_eq!(HomeSize::LARGE, HomeSize { w: 680.0, min_h: 320.0, max_h: 760.0 });
        // The wide Home (M51, the usual): landscape, one height each.
        assert_eq!(HomeSize::WIDE, HomeSize { w: 688.0, min_h: 480.0, max_h: 480.0 });
        assert_eq!(HomeSize::WIDE_LARGE, HomeSize { w: 688.0, min_h: 560.0, max_h: 560.0 });
        assert!(HomeSize::WIDE.w > HomeSize::WIDE.max_h && HomeSize::WIDE_LARGE.w > HomeSize::WIDE_LARGE.max_h, "landscape");
        assert_eq!(HomeSize::USUAL, HomeSize::WIDE);
        assert_eq!((CARD, CARD_MAX_H), ((HomeSize::USUAL.w, HomeSize::USUAL.min_h), HomeSize::USUAL.max_h), "the window is made at the usual size");
        assert_eq!(HomeSize::of("standard", "wide"), HomeSize::WIDE);
        assert_eq!(HomeSize::of("large", "wide"), HomeSize::WIDE_LARGE);
        assert_eq!(HomeSize::of("standard", "tall"), HomeSize::STANDARD);
        assert_eq!(HomeSize::of("large", "tall"), HomeSize::LARGE);
        for junk in ["", "Large", "huge"] {
            assert_eq!(HomeSize::of(junk, "wide"), HomeSize::WIDE, "{junk}");
            assert_eq!(HomeSize::of(junk, "tall"), HomeSize::STANDARD, "{junk}");
            assert_eq!(HomeSize::of("standard", junk), HomeSize::WIDE, "a layout word that is not tall is the usual, wide");
        }
    }
    #[test]
    fn the_wide_home_fits_a_13_inch_air_under_the_notch_with_room_at_both_sizes() {
        // A 13 inch MacBook Air at its default size: 1470 by 956, the notch 32 tall, the Dock below (work area 850 tall).
        let air = Display { id: "1470x956@0,0".into(), frame: [0.0, 0.0, 1470.0, 956.0], work: [0.0, 32.0, 1470.0, 850.0], primary: true, notch: notch_from(1470.0, 32.0, 642.5, 642.5) };
        for size in [HomeSize::WIDE, HomeSize::WIDE_LARGE] {
            let h = home_frame(&air, (size.w, size.max_h));
            assert_eq!((h[2], h[3]), (size.w, size.max_h), "never cut by the display: {h:?}");
            assert!(inside(h, air.work) && h[1] >= 32.0, "under the notch, inside the work area: {h:?}");
            assert!((cx(h) - 735.0).abs() < 0.01, "centred under the notch: {h:?}");
            let below = air.work[1] + air.work[3] - (h[1] + h[3]);
            assert!(below >= 240.0, "room under Home on an Air: {below}");
            let beside = (air.work[2] - h[2]) / 2.0;
            assert!(beside >= 160.0 + 2.0 * crate::docking::CLEAR_MARGIN, "room for the character beside Home: {beside}");
        }
    }
    #[test]
    fn a_large_home_drops_from_the_island_or_sits_beside_the_character_at_its_own_size() {
        let (mac, ext) = (mbp14(), ext());
        let both = [mac.clone(), ext.clone()];
        let home = [1352.0, 427.5, 160.0, 160.0];
        let l = HomeSize::LARGE;
        for h in [l.min_h, 420.0, l.max_h] {
            let spot = card_spot(Some(&mac), home, &both, |_: &str| Edge::Right, (l.w, h)).unwrap();
            assert_eq!(spot, home_frame(&mac, (l.w, h)));
            assert_eq!((spot[2], spot[3]), (680.0, h));
            assert!(inside(spot, mac.work) && !crate::docking::overlaps(spot, home), "{spot:?}");
            let beside = card_spot(None, home, &both, |_: &str| Edge::Right, (l.w, h)).unwrap();
            assert_eq!(beside, card_frame(home, (l.w, h), mac.work, Edge::Right));
            assert!(beside[0] + beside[2] <= home[0], "{beside:?}");
        }
        // The usual size gives exactly today's places.
        assert_eq!(card_spot(Some(&mac), home, &both, |_: &str| Edge::Right, (CARD.0, 420.0)), Some(home_frame(&mac, (CARD.0, 420.0))));
    }
    #[test]
    fn the_waits_before_the_status_opens_and_closes_follow_the_setting_at_both_ends() {
        assert_eq!(HoverTimes::USUAL, HoverTimes { in_ms: 300, out_ms: 300, peek: true }, "the usual waits (M66: 300 ms to open)");
        assert_eq!(Hover::new(), Hover::default());
        for (open, close) in [(100u64, 100u64), (1500, 1000), (HOVER_IN_MS, HOVER_OUT_MS)] {
            let mut h = Hover::new();
            h.set_times(HoverTimes { in_ms: open, out_ms: close, peek: true });
            h.enter(1000);
            assert!(!h.at(1000 + open - 1), "{open}: not yet");
            assert_eq!(h.wait_ms(1000), Some(open));
            assert!(h.at(1000 + open), "{open}: open");
            h.exit(5000);
            assert!(h.at(5000 + close - 1), "{close}: still open");
            assert!(!h.at(5000 + close), "{close}: closed");
        }
    }
    #[test]
    fn with_status_on_pointing_turned_off_the_island_never_opens_by_itself() {
        let mut h = Hover::new();
        h.set_times(HoverTimes { peek: false, ..HoverTimes::USUAL });
        h.enter(0);
        for t in [0, HOVER_IN_MS, 10 * HOVER_IN_MS, 60_000] { assert!(!h.at(t), "{t}"); }
        assert_eq!(h.wait_ms(10), None, "nothing to look at again");
        // Turned back on, resting opens it again after the usual wait.
        h.set_times(HoverTimes::USUAL);
        h.exit(70_000); h.enter(70_001);
        assert!(h.at(70_001 + HOVER_IN_MS));
    }
    #[test]
    fn pointing_at_the_notch_opens_what_the_setting_says() {
        // 2 Nov 2026 made Home the usual; M70 (4 Nov 2026, the founder: "just like HeyClicky's notch") makes the small panel
        // the usual again, with Home right away a choice. Either opens after island.openDelay (the Hover above).
        assert_eq!(PointOpens::of("home"), PointOpens::Home);
        assert_eq!(PointOpens::of("status"), PointOpens::Status);
        for odd in ["", "Home", "peek", "nonsense"] { assert_eq!(PointOpens::of(odd), PointOpens::Status, "{odd:?} is the usual"); }
        let rest = State::default();
        assert_eq!(on_point(rest, PointOpens::Home), PointDo::OpenHome);
        assert_eq!(on_point(rest, PointOpens::Status), PointDo::Status);
        // Wings out (something is happening): pointing still opens Home, where the whole job is.
        assert_eq!(on_point(State { alert: true, ..rest }, PointOpens::Home), PointDo::OpenHome);
        // A call or a presentation (quiet): the person pointed, so it opens, as the status always did.
        assert_eq!(on_point(State { quiet: true, ..rest }, PointOpens::Home), PointDo::OpenHome);
        // Home already open: nothing more to open.
        for o in [PointOpens::Home, PointOpens::Status] { assert_eq!(on_point(State { home_open: true, ..rest }, o), PointDo::Nothing, "{o:?}"); }
        // A question already open under the wings stays where it is: the person may be about to answer it there.
        assert_eq!(on_point(State { ask: true, alert: true, ..rest }, PointOpens::Home), PointDo::Status);
        // Unless it is quiet, when the question never opened by itself: then pointing opens Home.
        assert_eq!(on_point(State { ask: true, alert: true, quiet: true, ..rest }, PointOpens::Home), PointDo::OpenHome);
    }
    #[test]
    fn when_pointing_opens_home_the_status_peek_never_shows_from_the_pointer() {
        // The island's own size stays the bare notch (or the wings) while Home opens below it: hover is only said to the
        // island when the status line is what pointing does.
        let rest = State::default();
        assert!(!peek_hover(true, PointDo::OpenHome));
        assert!(peek_hover(true, PointDo::Status));
        assert!(!peek_hover(false, PointDo::Status));
        assert!(!peek_hover(true, PointDo::Nothing));
        assert_eq!(mode(State { hover: peek_hover(true, on_point(rest, PointOpens::Home)), ..rest }), Mode::Rest);
        assert_eq!(mode(State { hover: peek_hover(true, on_point(rest, PointOpens::Status)), ..rest }), Mode::Peek);
    }
    #[test]
    fn a_click_on_the_notch_always_opens_home_at_once_and_pointing_opens_it_without_the_keyboard() {
        // Wiring in main.rs (it needs a real Mac): a click opens, never closes (a Home that pointing just opened would
        // otherwise close under the click that meant to open it), with no wait; pointing opens through the same door,
        // never taking the keyboard (rule 9) until the person clicks into Home.
        let main = crate::main_src();
        let body = |name: &str| { let at = main.find(name).unwrap_or_else(|| panic!("{name}")); main[at..at + main[at..].find("\n}\n").unwrap()].to_string() };
        let click = body("fn island_click(");
        assert!(click.contains("open_card(&app, \"island\", false)") && !click.contains("toggle_home"), "{click}");
        let settle = body("fn island_hover_settle(");
        assert!(settle.contains("island::on_point(") && settle.contains("home_set().point_opens"), "{settle}");
        assert!(settle.contains("open_card(app, \"point\", false)"), "{settle}");
        assert!(settle.contains("island::peek_hover(shown, act)"), "{settle}");
    }
    #[test]
    fn the_wait_before_the_island_moves_to_another_display_follows_the_setting() {
        let (mac, ext) = ("A", "B");
        for wait in [1000u64, FOLLOW_MS, 10_000] {
            let mut f = Follow::new();
            assert_eq!(f.sample(Some(ext), mac, false, 0, wait), None);
            assert_eq!(f.sample(Some(ext), mac, false, wait - 1, wait), None, "{wait}: not yet");
            assert_eq!(f.sample(Some(ext), mac, false, wait, wait), Some(ext.to_string()), "{wait}");
        }
        assert_eq!(FOLLOW_MS, 3000, "the usual wait is today's");
    }
    #[test]
    fn the_island_lives_on_the_display_the_setting_names() {
        let (mac, ext) = (mbp14(), ext());
        let both = [mac.clone(), ext.clone()];
        let on_ext = (2000.0, 100.0);
        // Follow me is today's rule, whatever the built in display is.
        for (last, mouse, open) in [("1512x982@0,0", on_ext, true), ("2560x1440@1512,-458", (100.0, 500.0), false), ("", on_ext, false)] {
            assert_eq!(pick_where(&both, Where::Follow, Some(&mac.id), last, mouse, open), pick(&both, last, mouse, open));
        }
        // Built in: the laptop's own screen, wherever the pointer is and wherever it was last.
        assert_eq!(pick_where(&both, Where::BuiltIn, Some(&mac.id), &ext.id, on_ext, true).map(|(d, w)| (d.id.clone(), w)), Some((mac.id.clone(), "built_in")));
        // With the lid closed (or a Mac with no screen of its own) there is no built in display: the main one.
        let main_ext = Display { primary: true, ..ext.clone() };
        assert_eq!(pick_where(std::slice::from_ref(&main_ext), Where::BuiltIn, None, "", on_ext, true).map(|(d, w)| (d.id.clone(), w)), Some((ext.id.clone(), "main")));
        assert_eq!(pick_where(&[main_ext], Where::BuiltIn, Some(&mac.id), "", on_ext, true).map(|(_, w)| w), Some("main"), "a built in display that is not there");
        // Main: the display with the menu bar (the first macOS lists), even with the pointer on the other one.
        assert_eq!(pick_where(&both, Where::Main, Some(&mac.id), &ext.id, on_ext, true).map(|(d, w)| (d.id.clone(), w)), Some((mac.id.clone(), "main")));
        assert!(pick_where(&[], Where::Main, None, "", on_ext, true).is_none());
        assert_eq!((Where::of("follow"), Where::of("builtIn"), Where::of("main"), Where::of("junk")), (Where::Follow, Where::BuiltIn, Where::Main, Where::Follow));
    }

    // ---- HeyClicky v1.0.53 parity: the island and Home open with a short motion, instead of jumping ----
    #[test]
    fn the_window_grows_at_once_and_waits_for_the_shape_to_tuck_back_before_it_gets_smaller() {
        for d in [mbp14(), mbp16(), ext(), air()] {
            let rest = frame_of(&d, Mode::Rest, PANEL_MIN);
            for (m, says) in [(Mode::Alert, PANEL_MIN), (Mode::Peek, PANEL_MIN), (Mode::Peek, PANEL_MAX), (Mode::WingsPeek, PANEL_MAX)] {
                let to = frame_of(&d, m, says);
                assert_eq!(retract_ms(rest, to, false), None, "{} {m:?}: growing is at once, the page springs the shape", d.id);
                assert_eq!(retract_ms(to, rest, false), Some(RETRACT_MS), "{} {m:?}: back to the bare notch after the tuck", d.id);
                assert_eq!(retract_ms(to, to, false), None, "{} the same size: nothing to wait for", d.id);
            }
            // From the line under the pointer back to the wings: smaller, so it waits too.
            assert_eq!(retract_ms(frame_of(&d, Mode::WingsPeek, PANEL_MAX), frame_of(&d, Mode::Alert, PANEL_MIN), false), Some(RETRACT_MS));
        }
        // M66 step 5: the CLOSE spring's tuck (0.45 s, no bounce), after the hover panel's words have left (80 ms).
        assert!((150..=600).contains(&RETRACT_MS), "the CLOSE spring's tuck, after the panel's words");
        assert_eq!(RETRACT_MS, 460 + PANEL_EXIT_MS);
    }
    #[test]
    fn a_proven_fix_widens_the_wings_a_little_then_they_tuck_back_in_place() {
        for d in [mbp14(), mbp16(), ext(), air()] {
            for (m, says) in [(Mode::Alert, PANEL_MIN), (Mode::WingsPeek, PANEL_MAX)] {
                let l = look(&d, m, says);
                let c = cheered(&d, m, l);
                assert_eq!(c.frame[2], l.frame[2] + CHEER, "{} {m:?}: CHEER wider", d.id);
                assert!((c.frame[0] + c.frame[2] / 2.0 - (l.frame[0] + l.frame[2] / 2.0)).abs() < 0.5, "{} {m:?}: around the same middle", d.id);
                assert_eq!((c.frame[1], c.frame[3], c.core, c.row), (l.frame[1], l.frame[3], l.core, l.row), "{} {m:?}: same top, height and row", d.id);
                assert_eq!(retract_ms(l.frame, c.frame, false), None, "{} {m:?}: out at once, the page springs the shape", d.id);
                assert_eq!(retract_ms(c.frame, l.frame, false), Some(RETRACT_MS), "{} {m:?}: back after the shape settles", d.id);
            }
            for (m, says) in [(Mode::Rest, PANEL_MIN), (Mode::Peek, PANEL_MAX)] { assert_eq!(cheered(&d, m, look(&d, m, says)), look(&d, m, says), "{} {m:?}: only the wings cheer", d.id); }
        }
        assert!((4.0..=12.0).contains(&CHEER), "a small bounce, not a new size");
    }
    #[test]
    fn reduce_motion_or_less_motion_makes_it_appear_at_once() {
        let d = mbp14();
        assert_eq!(retract_ms(frame_of(&d, Mode::Alert, PANEL_MIN), frame_of(&d, Mode::Rest, PANEL_MIN), true), None);
    }
    #[test]
    fn a_move_to_another_display_never_waits() {
        let (a, b) = (mbp14(), ext());
        assert_eq!(retract_ms(frame_of(&b, Mode::Alert, PANEL_MIN), frame_of(&a, Mode::Rest, PANEL_MIN), false), None);
        let r = frame_of(&a, Mode::Alert, PANEL_MIN);
        assert!(!shrinks_in_place(r, [r[0] + 30.0, r[1], r[2] - 80.0, r[3]]), "another middle");
        assert!(!shrinks_in_place(r, [r[0], r[1] + 5.0, r[2], r[3] - 10.0]), "another top");
    }
    /// Home is one black shape hanging from the notch (27 Oct 2026): its window and panel paint nothing, so the shape's round
    /// bottom corners float on the desktop instead of sitting in a white square, and no square shadow is drawn around it.
    #[test]
    fn home_floats_as_its_own_shape_on_a_see_through_panel() {
        let main = crate::main_src();
        assert!(main.contains(r#"let b = if label == "dock" || label == "card" { b.transparent(true) } else { b };"#), "the web view paints nothing");
        let at = main.find("let card = make_panel(mtm, card_ns, true,").expect("Home's panel");
        let after = &main[at..at + 500];
        for want in ["card.setOpaque(false);", "card.setHasShadow(false);", "card.setBackgroundColor(Some(&NSColor::clearColor()));"] {
            assert!(after.contains(want), "{want}");
        }
    }
    // ---- M66 Part 2: Home grows out of the notch in a window that never resizes ----
    fn panel(d: &Display) -> HomePanel { home_panel(Some(d), &[HomeSize::WIDE, with_settings(HomeSize::WIDE, true)], HomeSize::WIDE, None).unwrap() }
    #[test]
    fn the_notch_springs_match_their_response_and_damping_and_closing_never_passes_its_target() {
        for (s, r, z) in [(NOTCH_HOVER, 0.38, 0.80), (NOTCH_OPEN_W, 0.36, 0.82), (NOTCH_OPEN_H, 0.42, 0.84), (NOTCH_CLOSE, 0.45, 1.0), (NOTCH_WORK, 0.30, 0.85)] {
            let want = Spring::of(r, z);
            assert!((s.k - want.k).abs() <= 1.0 && (s.c - want.c).abs() <= 0.1, "{s:?} vs {want:?}");
        }
        // Step each spring from 0 to 1 for two seconds.
        let peak = |s: Spring| { let (mut x, mut v, mut p) = (0.0f64, 0.0f64, 0.0f64); for _ in 0..8000 { v += (-s.k * (x - 1.0) - s.c * v) / 4000.0; x += v / 4000.0; p = p.max(x); } p };
        assert!(peak(NOTCH_CLOSE) <= 1.0 + 1e-9, "closing never overshoots");
        for s in [NOTCH_OPEN_W, NOTCH_OPEN_H] { let p = peak(s); assert!(p > 1.005 && p < 1.04, "a gentle settle: {p}"); }
        assert!(NOTCH_CLOSE.damping() > 0.99 && NOTCH_OPEN_W.damping() < 0.9);
        assert_eq!(OPEN_H_DELAY_MS, 60);
    }
    #[test]
    fn homes_window_hangs_from_the_top_of_the_display_centred_on_the_notch_with_room_for_every_state() {
        for d in [mbp14(), mbp16(), ext(), air()] {
            let p = panel(&d);
            let rest = frame_of(&d, Mode::Rest, PANEL_MIN);
            assert_eq!(p.frame[1], d.frame[1], "{}: top anchored at the display's top", d.id);
            assert!((p.frame[0] + p.cx - cx(rest)).abs() < 0.01, "{}: the shape's centre is the notch's", d.id);
            assert!(inside(p.frame, d.frame), "{}: on the display", d.id);
            // At rest the shape is exactly the island, hanging from the same top.
            assert_eq!(p.rest, (rest[2], rest[3]), "{}", d.id);
            assert_eq!(rest[1], d.frame[1], "{}: the island hangs from the top edge too", d.id);
            // Open: the band in the menu bar row, never wider than the notch and its wings (F18), and the body under it.
            let open = shape_rects(&p, true, p.max_h);
            assert_eq!(open[0][3], menu_bar(&d).unwrap(), "{}: the band is the menu bar row", d.id);
            assert!(open[0][2] <= rest[2] + 2.0 * WING + 0.01, "{}: F18", d.id);
            assert_eq!(open[1], home_frame(&d, (HomeSize::WIDE.w, HomeSize::WIDE.max_h)), "{}: the body is where Home is", d.id);
            // Every state, plus the headroom each side and below, fits in the window: the overshoot is never clipped.
            for r in open.iter().chain([rest].iter()) {
                let grown = [r[0] - HEADROOM, r[1], r[2] + 2.0 * HEADROOM, r[3] + HEADROOM];
                assert!(inside(*r, p.frame), "{} {r:?} in {:?}", d.id, p.frame);
                if p.frame[2] + 0.01 < d.frame[2] && p.frame[3] + 0.01 < d.frame[3] { assert!(inside(grown, p.frame), "{} headroom {grown:?} in {:?}", d.id, p.frame); }
            }
        }
    }
    /// M66 step 5: with something running the island shows its wings, so Home grows from them and folds back into them; it
    /// never starts from (or ends on) the bare notch while the wings show, which made the wings vanish and pop back.
    #[test]
    fn home_grows_from_the_wings_the_island_shows_and_folds_back_into_them() {
        for d in [mbp14(), mbp16(), ext(), air()] {
            let p = panel(&d);
            assert_eq!(grown_from(p, &d, None), p, "{}: nothing running, the bare notch", d.id);
            for asked in [0.0, WING, 70.0, WING_MAX] {
                let g = grown_from(p, &d, Some(asked));
                let wings = look_winged(&d, Mode::Alert, PANEL_MIN, asked).frame;
                assert_eq!(g.rest, (wings[2], wings[3]), "{} {asked}: at rest it is the wings", d.id);
                assert!(g.band.0 >= g.rest.0 - 0.01, "{} {asked}: the band open never narrower than the wings it grew from", d.id);
                assert!(g.band.0 <= wings[2] + 0.01 && g.band.0 >= p.band.0, "{} {asked}: and never wider than the wings (F18)", d.id);
                assert_eq!((g.frame, g.cx, g.body_w, g.max_h, g.body_top), (p.frame, p.cx, p.body_w, p.max_h, p.body_top), "{}: the same window", d.id);
                // The wings and the open band fit in the window with headroom, centred on the notch.
                assert!(g.cx - g.band.0 / 2.0 >= HEADROOM - 0.01 && g.cx + g.band.0 / 2.0 <= g.frame[2] - HEADROOM + 0.01, "{} {asked}", d.id);
            }
        }
        // Free (no island): nothing to grow from.
        let free = home_panel(None, &[HomeSize::WIDE], HomeSize::WIDE, Some([100.0, 200.0, 688.0, 480.0])).unwrap();
        assert_eq!(grown_from(free, &mbp14(), Some(WING)), free);
    }
    #[test]
    fn homes_window_never_changes_with_its_content_or_with_settings_open() {
        let d = mbp14();
        let tall = [HomeSize::STANDARD, with_settings(HomeSize::STANDARD, true)];
        let p = home_panel(Some(&d), &tall, HomeSize::STANDARD, None).unwrap();
        // The tall Home grows with what it shows and takes the Large width with Settings open: one window holds them all.
        // The body is the width in force (M66 step 6): Standard with Settings closed, Large with it open, in the same window.
        assert_eq!(p.body_w, HomeSize::STANDARD.w);
        let set = home_panel(Some(&d), &tall, with_settings(HomeSize::STANDARD, true), None).unwrap();
        assert_eq!(set.body_w, HomeSize::LARGE.w);
        assert_eq!((set.frame, set.cx, set.body_top), (p.frame, p.cx, p.body_top), "the window and the centre never change with Settings");
        assert!(p.frame[2] >= HomeSize::LARGE.w + 2.0 * HEADROOM, "the window holds the widest");
        // The body the page draws is the room the character keeps clear of (card_spot, home_frame at the size in force).
        assert_eq!(shape_rects(&p, true, 400.0)[1], home_frame(&d, (HomeSize::STANDARD.w, 400.0)));
        assert_eq!((p.min_h, p.max_h), (HomeSize::STANDARD.min_h, HomeSize::STANDARD.max_h));
        for h in [0.0, 300.0, 420.0, 640.0, 9999.0] { assert!(inside(shape_rects(&p, true, h)[1], p.frame), "{h}"); }
        assert_eq!(p.body_h(9999.0), p.max_h);
        assert_eq!(p.body_h(f64::NAN), p.min_h);
        // The shell never makes the window from a content height (main.rs place_card reads only the sizes).
        let _main = crate::main_src();
        let pc = main_body("fn place_card(");
        assert!(pc.contains("island::home_panel(") && !pc.contains("CARD_H"), "{pc}");
        // A content height never places it again; only Settings opening or closing does, and that keeps the window (above).
        assert_eq!(main_body("fn resize_card(").matches("place_card").count(), 1, "a content height never resizes the window");
    }
    #[test]
    fn a_large_home_on_a_small_display_is_held_inside_it() {
        let d = air();
        let p = home_panel(Some(&d), &[HomeSize::LARGE, with_settings(HomeSize::LARGE, true)], HomeSize::LARGE, None).unwrap();
        assert!(inside(p.frame, d.frame));
        assert!(p.frame[1] + p.body_top + p.max_h <= d.work[1] + d.work[3] - GAP + 0.01, "never under the Dock");
    }
    #[test]
    fn without_a_notch_the_pill_hangs_from_the_top_edge_and_home_grows_from_it_and_without_a_menu_bar_from_the_line() {
        for d in [air(), ext()] {
            let p = panel(&d);
            assert_eq!(p.kind, "pill");
            assert_eq!(p.rest, (PILL_W, 20.0));
            assert_eq!(p.band.1, 24.0, "{}: the band fills the menu bar row", d.id);
            assert_eq!(frame_of(&d, Mode::Rest, PANEL_MIN)[1], d.frame[1], "{}: from the top edge, never 2 pt down", d.id);
        }
        let mut hidden = air(); hidden.work = [0.0, 0.0, 1440.0, 830.0];
        let p = panel(&hidden);
        assert_eq!((p.kind, p.rest.1, p.band.1, p.body_top), ("edge", EDGE_H, EDGE_H, EDGE_H));
    }
    #[test]
    fn with_the_island_off_home_sits_where_it_was_with_headroom_and_only_fades() {
        let spot = [100.0, 200.0, 688.0, 480.0];
        let p = home_panel(None, &[HomeSize::WIDE], HomeSize::WIDE, Some(spot)).unwrap();
        assert_eq!(p.kind, "free");
        assert_eq!(p.frame, [100.0 - HEADROOM, 200.0 - HEADROOM, 688.0 + 2.0 * HEADROOM, 480.0 + 2.0 * HEADROOM]);
        assert_eq!(shape_rects(&p, true, 480.0), vec![spot]);
        assert_eq!(home_panel(None, &[HomeSize::WIDE], HomeSize::WIDE, None), None);
        assert_eq!(home_panel(Some(&mbp14()), &[], HomeSize::WIDE, None), None);
        // M66 step 6: with the island off, the spot is the widest size (Settings' Large width in the tall Home) and the body
        // is the width in force, centred in it; opening Settings never squeezes it.
        let wide = [100.0, 200.0, HomeSize::LARGE.w, 640.0];
        let tall = [HomeSize::STANDARD, with_settings(HomeSize::STANDARD, true)];
        let closed = home_panel(None, &tall, HomeSize::STANDARD, Some(wide)).unwrap();
        let open = home_panel(None, &tall, with_settings(HomeSize::STANDARD, true), Some(wide)).unwrap();
        assert_eq!((closed.body_w, open.body_w), (HomeSize::STANDARD.w, HomeSize::LARGE.w));
        assert_eq!(closed.frame, open.frame);
        assert_eq!(shape_rects(&open, true, 640.0)[0], wide, "Settings gets its whole width");
        let spot_fn = main_body("fn card_spot(");
        assert!(spot_fn.contains("let w = if on.is_some() { size.w } else { home_sizes(&hs).iter().map(|s| s.w).fold(0.0, f64::max) };"), "{spot_fn}");
        assert!(main_body("fn place_card(").contains("island::home_panel(on.as_ref(), &sizes, home_size(), spot)"));
        // Settings opened or closed: placed again, so the page is told the new body width (the window stays as it is).
        assert!(main_body("fn resize_card(").contains("if was != open { with_panels(place_card); }"));
    }
    #[test]
    fn the_hit_test_follows_the_shape_its_round_corners_and_the_slack() {
        let p = panel(&mbp14());
        let r = shape_rects(&p, true, 480.0);
        let (band, body) = (r[0], r[1]);
        // Closed: nothing is ours; the island takes the pointer.
        assert!(shape_rects(&p, false, 480.0).is_empty());
        assert!(!inside_shape(&[], (756.0, 10.0), 0.0));
        // The band in the menu bar row, and the body.
        assert!(inside_shape(&r, (cx(band), 5.0), 0.0));
        assert!(inside_shape(&r, (cx(body), 300.0), 0.0));
        // The menu bar beside the band is not ours: its clicks go to the menus and icons there.
        assert!(!inside_shape(&r, (band[0] - 1.0, 5.0), 0.0));
        assert!(!inside_shape(&r, (band[0] + band[2] + 1.0, 5.0), 0.0));
        // The clear corner outside the body's round foot is not ours; just inside the curve is.
        let (bx, by) = (body[0], body[1] + body[3]);
        assert!(!inside_shape(&r, (bx + 1.0, by - 1.0), 0.0), "the clear corner");
        assert!(inside_shape(&r, (bx + OPEN_R, by - 1.0), 0.0), "on the foot, under the corner's middle");
        assert!(inside_shape(&r, (bx + 1.0, by - OPEN_R), 0.0), "beside the corner's middle, on the straight side");
        // The slack: 6 points around the notch for the nudge, 14 for a forgiving edge.
        assert!(!inside_shape(&r, (cx(body), by + 5.0), 0.0));
        assert!(inside_shape(&r, (cx(body), by + 5.0), 6.0));
        assert!(!inside_shape(&r, (cx(body), by + 15.0), 14.0));
        assert!(inside_shape(&r, (body[0] - 13.0, 300.0), 14.0));
        // Under the band's shoulders, between the band and the wider body, the body starts at the menu bar line.
        assert!(!inside_shape(&r, (band[0] - 20.0, band[3] - 1.0), 0.0));
        assert!(inside_shape(&r, (band[0] - 20.0, band[3] + 1.0), 0.0));
    }
    #[test]
    fn a_home_pointing_opened_folds_back_after_a_short_grace_unless_the_person_came_back_or_pressed_in_it() {
        let g = HoverTimes::USUAL.out_ms;
        let mut l = Leave::new(true);
        assert!(!l.sample(true, 0, g));
        assert!(!l.sample(false, 1000, g));
        assert!(!l.sample(false, 1000 + g - 1, g), "the grace");
        assert!(l.sample(false, 1000 + g, g), "then it folds");
        // The grace is the person's: a longer close delay waits longer.
        let mut l = Leave::new(true);
        assert!(!l.sample(false, 0, 1000) && !l.sample(false, 999, 1000) && l.sample(false, 1000, 1000));
        // A return inside the grace cancels it, and the grace starts again on the next leave.
        let mut l = Leave::new(true);
        l.sample(false, 0, g); l.sample(true, 100, g);
        assert!(!l.sample(false, 200, g) && !l.sample(false, 200 + g - 1, g));
        assert!(l.sample(false, 200 + g, g));
        // Pressed in it: the person's now, it never folds on leaving.
        let mut l = Leave::new(true);
        l.pressed_inside();
        assert!(!l.sample(false, 0, g) && !l.sample(false, 60_000, g));
        // Opened by a click or a key: never on leaving.
        let mut l = Leave::new(false);
        assert!(!l.sample(false, 0, g) && !l.sample(false, 60_000, g));
        // M66 step 6: the shell folds on leaving only with Close Home when I click another app on, after the close delay.
        let w = main_body("fn watch_home(");
        assert!(w.contains("if hs.click_away && HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).sample(near, now() as u64, hs.hover.out_ms) {"), "{w}");
        assert!(w.contains("if !hs.click_away { w = island::ClickAway::new(is_down); continue; }"), "{w}");
    }
    #[test]
    fn after_a_dismiss_pointing_does_not_open_it_again_until_the_pointer_has_left_once() {
        let mut h = Hover::default();
        h.enter(0);
        assert!(h.inside() && h.at(HOVER_IN_MS), "the nudge at once, open at the wait");
        h.dismiss();
        assert!(!h.inside() && !h.at(HOVER_IN_MS + 10) && !h.at(60_000), "dismissed: no nudge, no reopen");
        assert_eq!(h.wait_ms(60_000), None);
        h.exit(70_000); h.enter(70_001);
        assert!(h.inside() && h.at(70_001 + HOVER_IN_MS), "left once: it opens again");
        assert_eq!(HOVER_IN_MS, 300, "M66: 300 ms of resting opens it");
    }
    #[test]
    fn home_never_drops_from_a_gap_it_grows_out_of_the_notch_in_a_window_that_never_resizes() {
        // M66: no drop and no second clock; the old helpers are gone from the shell.
        let main = crate::main_src();
        for gone in ["home_drop", "OPEN_SECS", "island::DROP"] { assert!(!main.contains(gone), "{gone}"); }
    }
    // Found in review (19 Oct 2026): AppKit lets a running motion finish on its old target when the frame is then set at
    // once. The island grew for the peek, the pointer left within 0.18 s, the rest frame was set at once, and the grow
    // finished anyway: the island stayed peek sized while its page was in rest mode. Home's drop overwrote a resize the
    // same way. Each moving panel now keeps the frame asked last, and a motion that ends sets it again when it was newer.
    #[test]
    fn a_frame_set_at_once_during_a_motion_wins_when_the_motion_ends() {
        let (peek, rest) = ([10.0, 0.0, 200.0, 80.0], [10.0, 0.0, 200.0, 37.0]);
        let mut m = Moves::new();
        let grow = m.ask(peek, true);
        m.ask(rest, false);
        assert_eq!(m.ended(grow), Some(rest), "the grow ends on the peek frame: the rest frame is set again");
        // A motion that ends with nothing newer asked leaves its frame alone.
        let mut m = Moves::new();
        let drop = m.ask(peek, true);
        assert_eq!(m.ended(drop), None);
        // A frame set at once is never set again for itself.
        let mut m = Moves::new();
        let now = m.ask(rest, false);
        assert_eq!(m.ended(now), None);
        // A newer motion ends on its own target: the older one leaves it alone, and the newer one sets nothing either.
        let mut m = Moves::new();
        let first = m.ask(peek, true);
        let second = m.ask(rest, true);
        assert_eq!((m.ended(first), m.ended(second)), (None, None));
        // Several at once while one motion runs: the last one wins.
        let mut m = Moves::new();
        let grow = m.ask(peek, true);
        m.ask([1.0, 2.0, 3.0, 4.0], false);
        m.ask(rest, false);
        assert_eq!(m.ended(grow), Some(rest));
    }
    #[test]
    fn every_frame_of_the_island_and_home_goes_through_the_one_helper() {
        let main = crate::main_src();
        let body = |name: &str| { let s = &main[main.find(name).unwrap()..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let pc = body("fn place_card(");
        assert!(pc.contains("set_frame_moving(c, to_appkit(p.frame, ph), None, None, &CARD_MOVES)"), "a resize is at once, never a motion: {pc}");
        assert!(!pc.contains("setFrame_display"), "{pc}");
        let helper = body("fn set_frame_moving(");
        assert!(helper.contains("let mine = moves.lock().unwrap_or_else(|e| e.into_inner()).ask(want, secs.is_some());"), "{helper}");
        assert!(helper.contains(".ended(mine)"), "{helper}");
        // At once is a motion of no length, which replaces one still running, and then set at once as well.
        assert!(helper.contains("setDuration(secs.unwrap_or(0.0))"), "{helper}");
        assert!(body("fn set_island_frame(").contains("&ISLAND_MOVES)"));
        let place = body("fn place_island(");
        assert!(place.contains("None => set_island_frame(f, ph)") && place.contains("if ISLAND_GEN.load(Ordering::SeqCst) == gen { set_island_frame(f, ph) }"), "at once, or after the tuck unless a newer frame was asked");
        assert!(place.contains("island::retract_ms(from, f, reduce_motion())"));
        assert!(!body("fn open_card(").contains("set_frame_moving"), "M66: opening never moves or resizes Home's window");
    }


    #[test]
    fn a_question_opens_the_panel_unless_home_is_open() {
        let s = |hover, home_open, ask| mode(State { hover, alert: true, home_open, panel: 0, ask, quiet: false, wing: 0 });
        assert_eq!(s(false, false, true), Mode::WingsPeek);
        assert_eq!(s(true, false, true), Mode::WingsPeek);
        assert_eq!(s(false, true, true), Mode::Rest);
        assert_eq!(s(false, false, false), Mode::Alert);
    }

    #[test]
    fn on_a_call_the_island_never_opens_by_itself_but_its_marks_show_and_the_pointer_still_opens_it() {
        let q = |hover, alert, ask| mode(State { hover, alert, home_open: false, panel: 0, ask, quiet: true, wing: 0 });
        assert_eq!(q(false, true, true), Mode::Alert, "a question waiting: the wings and their mark, no panel");
        assert_eq!(q(true, true, true), Mode::WingsPeek, "the person rested the pointer on it: it opens");
        assert_eq!(q(true, false, false), Mode::Peek, "the same on the bare notch");
        assert_eq!(q(false, true, false), Mode::Alert, "listening (or needs you) while quiet: the wings with the light");
        assert_eq!(q(false, false, false), Mode::Rest);
        assert_eq!(mode(State { hover: false, alert: true, home_open: true, panel: 0, ask: true, quiet: true, wing: 0 }), Mode::Rest, "Home open");
        assert!(!State::default().quiet);
    }

    #[test]
    fn the_shell_keeps_the_island_quiet_on_a_call_and_when_hidden_and_looks_again_when_that_changes() {
        let main = crate::main_src();
        let body = |name: &str| { let b = &main[main.find(name).unwrap_or_else(|| panic!("{name}"))..]; b[..b.find("\n}\n").unwrap()].to_string() };
        assert!(main.contains("island::State { hover: false, alert: false, home_open: false, panel: 0, ask: false, quiet: false, wing: 0 }"));
        let place = body("fn place_island(");
        assert!(place.contains("s.quiet = quiet() || companion_hidden();"), "{place}");
        assert!(place.contains("ISLAND_CHEER.load(Ordering::SeqCst) && !reduce_motion() && !state.quiet"), "no cheer on a call");
        let rest = body("fn rest_tick(");
        assert!(rest.contains("let island_quiet = q || companion_hidden();"), "shown again counts as quiet ending, as in place_island: {rest}");
        assert!(rest.contains("QUIET_NOW.swap(island_quiet, Ordering::SeqCst) != island_quiet") && rest.contains("place_island(mtm, false, \"quiet\")"), "{rest}");
        // Every tick looks, after the hide and show branches, so a question that waited drops once Companion is shown again.
        let tick = body("fn tick(");
        assert!(tick.find("shown_after_full_screen").unwrap() < tick.find("rest_tick(app, mtm);").unwrap(), "{tick}");
        assert!(rest.contains(".ask"), "it looks again only while a question waits");
    }

    #[test]
    fn home_opened_by_a_key_is_there_at_once() {
        assert!(!animates_open("hotkey"));
        for s in ["button", "island", "dock", "drop", "first_run", "reopen"] { assert!(animates_open(s), "{s}"); }
    }

    #[test]
    fn results_finished_while_home_is_closed_are_counted_past_nine_so_the_panel_can_say_9_plus() {
        assert_eq!(unseen_next(0, false), 1);
        assert_eq!(unseen_next(8, false), 9);
        assert_eq!(unseen_next(9, false), 10, "ten reads \"9+ new\" on the hover panel, never \"9 new\"");
        assert_eq!(unseen_next(99, false), 99);
        assert_eq!(unseen_next(4, true), 0);
    }

    // ---------- M52 (F30): changes ready to review ----------

    /// The shared fixtures (protocol/fixtures, read by the runner's suite too), with their project put as the one open here.
    fn review_lines(file: &str) -> Vec<serde_json::Value> {
        file.lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str::<serde_json::Value>(l).expect("a fixture is JSON"))
            .filter(|v| v["type"].as_str().is_some_and(|t| t.starts_with("review."))).collect()
    }
    fn events() -> Vec<serde_json::Value> { review_lines(include_str!("../../../protocol/fixtures/events.jsonl")) }
    fn commands() -> Vec<serde_json::Value> { review_lines(include_str!("../../../protocol/fixtures/commands.jsonl")) }
    fn by_id<'a>(list: &'a [serde_json::Value], id: &str) -> &'a serde_json::Value { list.iter().find(|v| v["id"] == id).expect(id) }
    const P: &str = "p_9f2c";

    #[test]
    fn a_batch_of_changes_lights_the_dot_until_the_changes_go_away_again() {
        let ev = events();
        let mut r = ReviewReady::new();
        assert!(!r.on());
        assert!(r.heard(by_id(&ev, "erv1"), P, false), "a batch with changes, Home closed");
        assert!(r.on());
        assert!(!r.heard(by_id(&ev, "erv1"), P, false), "the same batch again changes nothing");
        // The review starting and its results (by itself in automatic mode) keep it: there is something to look at.
        for id in ["erv3", "erv4", "erv5", "erv6"] { r.heard(by_id(&ev, id), P, false); assert!(r.on(), "{id}"); }
        // count 0 with no files: the changes went away again, so the card closes and the dot goes out.
        assert!(r.heard(by_id(&ev, "erv2"), P, false));
        assert!(!r.on());
    }

    #[test]
    fn a_batch_that_grows_is_one_dot_and_an_old_batch_closing_leaves_the_new_one() {
        let mut r = ReviewReady::new();
        let batch = |id: &str, count: u64| serde_json::json!({ "v": 1, "id": "e", "type": "review.batch", "project": P, "batch": id, "files": [], "count": count, "capped": false, "secretFiles": [], "auto": false });
        assert!(r.heard(&batch("rv_aaaaaaaaaa", 2), P, false));
        assert!(r.heard(&batch("rv_bbbbbbbbbb", 3), P, false), "said again under a new id");
        assert!(!r.heard(&batch("rv_aaaaaaaaaa", 0), P, false), "the old id moved on: closing it says nothing about the new one");
        assert!(r.on());
        assert!(r.heard(&batch("rv_bbbbbbbbbb", 0), P, false));
        assert!(!r.on());
    }

    #[test]
    fn the_instant_key_warning_is_said_on_the_quiet_line_until_a_review_or_a_newer_batch_without_one() {
        // M57 feature 5: erv10 carries a key's place; the shell passes on only how many (main.rs review_heard).
        let ev = events();
        let mut r = ReviewReady::new();
        assert!(r.heard(by_id(&ev, "erv10"), P, false));
        assert!(r.on() && r.key());
        let mut counted = by_id(&ev, "erv10").clone();
        counted["keys"] = serde_json::json!(1);
        let mut r2 = ReviewReady::new();
        assert!(r2.heard(&counted, P, false) && r2.key(), "a count from the shell works the same");
        // The same batch said again without the warning (it grew, and the key is gone): the line changes, the dot stays.
        let mut plain = by_id(&ev, "erv10").clone();
        plain.as_object_mut().unwrap().remove("keys");
        assert!(r.heard(&plain, P, false), "the line changed");
        assert!(r.on() && !r.key());
        assert!(r.heard(by_id(&ev, "erv10"), P, false) && r.key());
        // A finished review takes over: its own words say the key.
        let mut done = by_id(&ev, "erv4").clone();
        done["batch"] = by_id(&ev, "erv10")["batch"].clone();
        assert!(r.heard(&done, P, false), "the warning gives way");
        assert!(r.on() && !r.key());
        assert!(r.heard(by_id(&ev, "erv10"), P, false) && r.key());
        assert!(r.clear() && !r.key());
        // Seen at once while Home is in front: nothing lit, nothing said.
        assert!(!r.heard(by_id(&ev, "erv10"), P, true));
        assert!(!r.key());
    }

    #[test]
    fn a_batch_said_while_home_is_in_front_is_seen_at_once() {
        let ev = events();
        let mut r = ReviewReady::new();
        assert!(!r.heard(by_id(&ev, "erv1"), P, true));
        assert!(!r.on());
        // A result that arrives after Home was closed (automatic mode, or Review now and then away) is still to be seen.
        assert!(r.heard(by_id(&ev, "erv4"), P, false));
        assert!(r.on());
        assert!(r.heard(by_id(&ev, "erv5"), P, true), "and seen at once while Home is in front");
        assert!(!r.on());
        assert!(!r.heard(by_id(&ev, "erv6"), P, false), "a review that could not be done is nothing new to look at");
    }

    #[test]
    fn only_the_open_project_and_a_proper_batch_name_light_it() {
        let ev = events();
        let mut r = ReviewReady::new();
        assert!(!r.heard(by_id(&ev, "erv1"), "/somewhere/else", false));
        assert!(!r.heard(by_id(&ev, "erv1"), "", false), "no folder chosen");
        let mut odd = by_id(&ev, "erv1").clone();
        for b in [serde_json::json!(""), serde_json::json!("cp_0001"), serde_json::json!("rv_../../x"), serde_json::json!(7), serde_json::json!("rv_".to_string() + &"a".repeat(80))] {
            odd["batch"] = b.clone();
            assert!(!r.heard(&odd, P, false), "{b}");
        }
        assert!(!r.on());
        // A project written with a trailing slash is still the same folder.
        assert!(r.heard(by_id(&ev, "erv1"), "p_9f2c/", false));
    }

    #[test]
    fn opening_the_review_closing_it_or_fixing_it_puts_the_dot_out() {
        let (ev, cmds) = (events(), commands());
        for id in ["rv1", "rv2", "rv3", "rv4"] {
            let mut r = ReviewReady::new();
            r.heard(by_id(&ev, "erv1"), P, false);
            assert!(r.asked(by_id(&cmds, id)), "{id}");
            assert!(!r.on(), "{id}");
            assert!(!r.asked(by_id(&cmds, id)), "{id} again changes nothing");
        }
        // Looks fine for a batch that already moved on leaves the newer one lit.
        let mut r = ReviewReady::new();
        r.heard(by_id(&ev, "erv1"), P, false);
        let mut old = by_id(&cmds, "rv3").clone();
        old["batch"] = serde_json::json!("rv_0000000000");
        assert!(!r.asked(&old));
        assert!(r.on());
        assert!(!r.asked(&serde_json::json!({ "v": 1, "id": "x", "type": "agent.start", "project": P })), "other commands are not about it");
    }

    #[test]
    fn an_engine_that_started_again_knows_no_batch_so_the_dot_goes_out() {
        let ev = events();
        for t in ["runner.hello", "app.runner_down"] {
            let mut r = ReviewReady::new();
            r.heard(by_id(&ev, "erv1"), P, false);
            assert!(r.heard(&serde_json::json!({ "v": 1, "id": "h", "type": t }), P, false), "{t}");
            assert!(!r.on(), "{t}");
        }
        let mut r = ReviewReady::new();
        r.heard(by_id(&ev, "erv1"), P, false);
        assert!(r.clear());
        assert!(!r.clear(), "clearing twice is no change");
    }

    #[test]
    fn the_review_dot_is_quiet_no_peek_no_wings_and_it_is_cleared_where_home_opens() {
        // Rule 16: the dot is said on the hover panel only, like the count of new results. No review event makes the
        // character peek or the wings open, and the shell plays no sound for one.
        for v in events() { assert!(crate::peek::news_of(&v).is_empty(), "{v}"); }
        let main = crate::main_src();
        let body = |name: &str| { let at = main.find(name).unwrap_or_else(|| panic!("{name}")); main[at..at + main[at..].find("\n}\n").unwrap()].to_string() };
        let heard = body("pub(crate) fn review_heard(");
        assert!(heard.contains("run_on_main_thread") && heard.contains("HOME_OPEN.load(Ordering::SeqCst) && card_visible()"), "{heard}");
        assert!(heard.contains("review_watched()"), "{heard}");
        assert!(!heard.contains("sound") && !heard.contains("island_alert") && !heard.contains("speak"), "{heard}");
        assert!(include_str!("runner.rs").contains("crate::review_heard(app, &v);"), "every engine event passes by it");
        let watched = body("fn review_watched(");
        assert!(watched.contains("\"review.mode\"") && watched.contains("\"off\"") && watched.contains("group_off(\"flow.on\")"), "{watched}");
        // M74: the open project's own choice (review.modeHere) comes first, then the usual review.mode.
        let mode = body("fn review_mode_now(");
        assert!(mode.contains("\"review.modeHere\"") && mode.contains("\"review.mode\""), "{mode}");
        // Cleared when Home opens (with the count of new results), when the page asks for the review or closes it, when
        // another folder is opened, and when reviews or Flow are turned off.
        let open = body("fn open_card_then(");
        assert!(open.contains("review_ready().clear()"), "Home opened");
        assert!(body("fn send_command(").contains("review_ready().asked(&cmd)"), "Review now, Looks fine, Fix it");
        assert!(body("fn project_now(").contains("review_ready().clear()"), "another folder");
        let applied = body("fn setting_applied(");
        assert!(applied.contains("\"review.mode\"") && applied.contains("\"flow.on\"") && applied.contains("!review_watched()"), "{applied}");
        // M57 feature 5: a page that loads late also learns whether the waiting batch carries the instant key warning.
        let state = body("fn island_state(");
        assert!(state.contains("v[\"review\"] = json!(r.on())") && state.contains("v[\"reviewKey\"] = json!(r.key())"), "a page that loads late");
    }

    // ---------- M55 section 2: live progress on the notch ----------
    // While a job works, the right wing says its step in a word (Finding, Fixing, Checking, Proven) with a thin line of the
    // four steps under it (island.tsx, islandPanel.ts notchStep). The page measures the longest of the four words and asks
    // for wings that wide (island_alert `wing`), so they grow once when work starts and never at each step. Both wings take
    // the same width, so the shape stays centred on the notch, and never more than WING_MAX of the menu bar each side.

    #[test]
    fn while_a_job_works_the_wings_widen_to_fit_its_step_and_no_further() {
        assert!(WING_MAX > WING && (80.0..=100.0).contains(&WING_MAX), "room for one short word and the mark, no more");
        assert_eq!(wing_w(0.0), WING, "no step shown: the usual wings");
        assert_eq!(wing_w(30.0), WING, "never narrower than the usual wings");
        assert_eq!(wing_w(86.0), 86.0);
        assert_eq!(wing_w(400.0), WING_MAX, "never more of the menu bar than WING_MAX");
        for bad in [f64::NAN, f64::INFINITY, -5.0] { assert_eq!(wing_w(bad), WING, "nonsense is the usual wings"); }
        for d in [mbp14(), mbp16(), ext(), air()] {
            let usual = look(&d, Mode::Alert, PANEL_MIN);
            assert_eq!(look_winged(&d, Mode::Alert, PANEL_MIN, 0.0), usual, "{}: without a step, exactly as before", d.id);
            assert_eq!(usual.wing, WING, "{}", d.id);
            let w = look_winged(&d, Mode::Alert, PANEL_MIN, 86.0);
            assert_eq!(w.wing, 86.0, "{}: the page is told the wing it drew for", d.id);
            assert_eq!(w.frame[2], usual.core + 2.0 * 86.0, "{}: the same width each side", d.id);
            assert!((cx(w.frame) - cx(usual.frame)).abs() < 0.01, "{}: still centred on the notch", d.id);
            assert_eq!((w.frame[1], w.frame[3], w.core, w.row), (usual.frame[1], usual.frame[3], usual.core, usual.row), "{}: the same row, only wider", d.id);
            assert!(inside(w.frame, d.frame), "{}", d.id);
            // The bare notch and the panel under it are not changed by it; the panel under the wings is as wide as both.
            for m in [Mode::Rest, Mode::Peek] { assert_eq!(look_winged(&d, m, 120.0, 86.0), look(&d, m, 120.0), "{} {m:?}", d.id); }
            assert_eq!(look_winged(&d, Mode::WingsPeek, 120.0, 96.0).frame[2], (usual.core + 2.0 * 96.0).max(PANEL_W).min(d.frame[2]), "{}", d.id);
        }
    }
    #[test]
    fn the_character_keeps_clear_of_the_widest_wings_too() {
        for d in [mbp14(), mbp16()] {
            let widest = look_winged(&d, Mode::Alert, PANEL_MIN, WING_MAX).frame;
            assert!(widest[2] + 2.0 * crate::docking::CLEAR_MARGIN <= crate::docking::NOTCH_CLEAR.0, "{}: {widest:?}", d.id);
            assert!(widest[2] <= island_frame(&d, Mode::Peek)[2], "{}: inside what the character already keeps clear of", d.id);
        }
    }
    #[test]
    fn the_step_never_changes_when_the_island_opens_by_itself() {
        // The size of the wings is the page's to ask; what opens is still only a question waiting, or the pointer.
        let base = State { alert: true, ..State::default() };
        for wing in [0u16, 60, 96] {
            assert_eq!(mode(State { wing, ..base }), Mode::Alert);
            assert_eq!(mode(State { wing, hover: true, ..base }), Mode::WingsPeek);
            assert_eq!(mode(State { wing, home_open: true, ..base }), Mode::Rest);
        }
        let main = crate::main_src();
        let at = main.find("fn island_alert(").unwrap();
        let f = &main[at..at + main[at..].find("\n}\n").unwrap()];
        assert!(f.contains("wing: Option<f64>") && f.contains("island::wing_w(wing.unwrap_or(0.0))"), "{f}");
        assert!(main.contains("island::look_winged(&d, mode, f64::from(state.panel), f64::from(state.wing))"), "placed with the wings the page asked for");
        assert!(main.contains("\"wing\": look.wing"), "and the page is told the wing it is drawn with");
    }
    #[test]
    fn the_shared_file_events_reach_the_pages_as_whole_lines_with_no_detail() {
        // M55: agent.file (runner/src/livefile.ts) is news for the pages only. The shell passes it on as it is: a path from the
        // project down and how it changed, nothing for the log, and nothing kept to replay (it is not a state).
        let lines: Vec<serde_json::Value> = include_str!("../../../protocol/fixtures/events.jsonl").lines().filter(|l| !l.trim().is_empty())
            .map(|l| serde_json::from_str::<serde_json::Value>(l).expect("a fixture is JSON")).filter(|v| v["type"] == "agent.file").collect();
        assert_eq!(lines.len(), 3);
        let mut kinds = Vec::new();
        for v in &lines {
            assert_eq!(v["v"].as_i64(), Some(1));
            assert!(v["agent"].as_str().is_some_and(|a| !a.is_empty()), "{v}");
            let f = v["file"].as_str().unwrap_or("");
            assert!(!f.is_empty() && !f.starts_with('/') && !f.split('/').any(|p| p == ".." || p.is_empty()), "{v}");
            assert!(v.get("detail").is_none(), "{v}");
            let mut sticky = std::collections::BTreeMap::new();
            assert!(!crate::runner::remember(&mut sticky, v), "never replayed to a page that loads later");
            kinds.push(v["kind"].as_str().unwrap_or("").to_string());
        }
        kinds.sort();
        assert_eq!(kinds, ["added", "deleted", "modified"]);
    }
    #[test]
    fn settings_in_the_tall_home_stays_on_a_13_inch_screen() {
        // M66 fix 14: Settings asks for its one height (settingsFit.ts SETTINGS_H). On a 13 inch MacBook Air with a notch
        // (1470 by 956, the Dock below) and an older 13 inch (1440 by 900, no notch), and at the smallest scaled 13 inch
        // (1280 by 800), the shape holding Settings is inside the display and above the Dock, and on the first two it is the
        // full SETTINGS_H. Where the room is less, it is held to the room and Settings' pages scroll.
        let air13 = Display { id: "1470x956@0,0".into(), frame: [0.0, 0.0, 1470.0, 956.0], work: [0.0, 32.0, 1470.0, 850.0], primary: true, notch: notch_from(1470.0, 32.0, 642.5, 642.5) };
        let small = Display { id: "1280x800@0,0".into(), frame: [0.0, 0.0, 1280.0, 800.0], work: [0.0, 24.0, 1280.0, 706.0], primary: true, notch: None };
        for (d, full) in [(air13, true), (air(), true), (small, false)] {
            for base in [HomeSize::STANDARD, HomeSize::LARGE] {
                let p = home_panel(Some(&d), &[base, with_settings(base, true)], with_settings(base, true), None).unwrap();
                let body = shape_rects(&p, true, SETTINGS_H)[1];
                assert!(inside(p.frame, d.frame), "{}", d.id);
                assert!(inside(body, d.frame), "{}", d.id);
                assert!(body[1] + body[3] <= d.work[1] + d.work[3] - GAP + 0.01, "{}: never under the Dock", d.id);
                assert!(body[2] >= HomeSize::LARGE.w - 0.01, "{}: Settings' sidebar and page fit", d.id);
                if full { assert_eq!(body[3], SETTINGS_H, "{}", d.id); } else { assert!(body[3] >= 480.0, "{}: still room to read", d.id); }
            }
        }
    }
    // ---- M70 step 5: the small panel and Home grown from it never take a click outside what is drawn ----
    #[test]
    fn the_small_panel_lets_clicks_beside_its_round_corners_through() {
        for d in [mbp14(), air(), ext()] {
            for m in [Mode::Peek, Mode::WingsPeek] {
                let f = frame_of(&d, m, 120.0);
                let rad = island_corner(m, kind(&d));
                assert!(rad > 0.0, "{} {m:?}: the panel has round bottom corners", d.id);
                let shape = (f, rad);
                let (x0, x1, y1) = (f[0], f[0] + f[2], f[1] + f[3]);
                // The clear corners beside the round foot pass the click on to what is behind.
                assert!(island_pass(Some(f), shape, (x0 + 1.0, y1 - 1.0)), "{} {m:?}: bottom left corner", d.id);
                assert!(island_pass(Some(f), shape, (x1 - 1.0, y1 - 1.0)), "{} {m:?}: bottom right corner", d.id);
                // On the black: the panel's.
                assert!(!island_pass(Some(f), shape, (cx(f), y1 - 1.0)), "{} {m:?}: the foot's middle", d.id);
                assert!(!island_pass(Some(f), shape, (x0 + rad, y1 - 1.0)), "{} {m:?}: under the corner's middle", d.id);
                assert!(!island_pass(Some(f), shape, (x0 + 1.0, y1 - rad)), "{} {m:?}: the straight side", d.id);
                assert!(!island_pass(Some(f), shape, (x0 + 1.0, f[1] + 1.0)), "{} {m:?}: the top corners are square", d.id);
                // Off the window: nothing to decide (the window stays as it is, so its hover tracking keeps working).
                assert!(!island_pass(Some(f), shape, (x0 - 1.0, y1 - 1.0)));
                assert!(!island_pass(None, shape, (cx(f), y1 - 1.0)));
                // While the shape tucks back after the pointer left, the window keeps the panel's frame for RETRACT_MS:
                // only the shape it is tucking into is the island's; the clear rest of the old frame lets clicks through.
                let rest = frame_of(&d, Mode::Rest, 0.0);
                let tuck = (rest, island_corner(Mode::Rest, kind(&d)));
                assert!(island_pass(Some(f), tuck, (x0 + 2.0, rest[1] + 2.0)), "{} {m:?}: the old panel's strip beside the notch", d.id);
                assert!(island_pass(Some(f), tuck, (cx(f), y1 - 2.0)), "{} {m:?}: where the panel was", d.id);
                assert!(!island_pass(Some(f), tuck, (cx(rest), rest[1] + rest[3] / 2.0)), "{} {m:?}: the notch itself", d.id);
            }
            // At rest and with the wings out the window is the shape, as before: no corner is cut.
            for m in [Mode::Rest, Mode::Alert] {
                let f = frame_of(&d, m, 0.0);
                assert_eq!(island_corner(m, kind(&d)), 0.0);
                assert!(!island_pass(Some(f), (f, 0.0), (f[0] + 0.5, f[1] + f[3] - 0.5)), "{} {m:?}", d.id);
            }
        }
        // The corners are the page's (style.css): 22 on the notch, the card radius on the pill and the line.
        let css = include_str!("../../src/style.css");
        assert!(css.contains(".island.notch { --r-open: 22px; }"), "PANEL_R_NOTCH matches style.css");
        assert_eq!(PANEL_R_NOTCH, 22.0);
        let tokens = include_str!("../../src/ui/tokens.css");
        assert!(tokens.contains(&format!("--r-card: {}px;", PANEL_R_CARD as i64)), "PANEL_R_CARD matches the usual --r-card");
    }
    #[test]
    fn the_island_window_follows_the_pointer_against_its_shape_never_keys() {
        let main = crate::main_src();
        let moved = main_body("fn island_pointer_moved(");
        assert!(moved.contains("island::island_pass(") && moved.contains("setIgnoresMouseEvents("), "{moved}");
        assert!(moved.contains("NSEvent::mouseLocation()"), "only where the pointer is");
        // Both the global and the local mouse move monitors drive it, as they drive Home's click through.
        assert_eq!(main.matches("home_pointer_moved(); island_pointer_moved();").count(), 2);
        // The shape is set the moment the island is placed, before the window's frame waits for the tuck.
        let place = main_body("fn place_island(");
        let set = place.find("*ISLAND_SHAPE.lock()").expect("place_island sets the shape");
        assert!(set < place.find("island::retract_ms(").unwrap(), "the shape before the retract wait");
        assert!(place.contains("island::island_corner(mode, kind)"));
        // A pointer that moves into a clear corner leaves the island (its tracking area may say nothing while the window
        // lets the pointer through), and coming back onto the black enters it again.
        assert!(moved.contains("island_hover_changed(false)") && moved.contains("island_hover_changed(true)"), "{moved}");
    }
    #[test]
    fn home_grown_from_the_small_panel_keeps_the_panels_band_in_its_hit_test_while_drawn() {
        let d = mbp14();
        let p = panel(&d);
        let plain = shape_rects(&p, true, 480.0);
        let from = shape_rects_from(&p, true, 480.0, Some(PANEL_W));
        // The band is the panel's 400 points, centred on the notch, in the menu bar row, as homeShape.ts draws it while
        // opening (notchQuick.test.ts: band [cx - 200, 0, 400, 32]); the body is unchanged.
        assert_eq!(from[0], [p.frame[0] + p.cx - PANEL_W / 2.0, p.frame[1], PANEL_W, p.band.1]);
        assert_eq!(from[1], plain[1]);
        assert!(p.band.0 < PANEL_W, "the wings band is narrower than the panel");
        assert!(inside_shape(&from, (from[0][0] + 2.0, 5.0), 0.0), "the black beside the notch, drawn 400 wide, is Home's");
        assert!(!inside_shape(&plain, (from[0][0] + 2.0, 5.0), 0.0));
        // Never narrower than the band; nothing while closed; none for a Home with no island.
        assert_eq!(shape_rects_from(&p, true, 480.0, Some(10.0)), plain);
        assert_eq!(shape_rects_from(&p, true, 480.0, None), plain);
        assert!(shape_rects_from(&p, false, 480.0, Some(PANEL_W)).is_empty());
        // Only until the band has eased halfway back to the wings (open, then the close curve's middle).
        assert_eq!(from_band(Some((PANEL_W, 1_000)), 999), Some(PANEL_W));
        assert_eq!(from_band(Some((PANEL_W, 1_000)), 1_000), None);
        assert_eq!(from_band(None, 0), None);
        let tokens = include_str!("../../src/ui/tokens.css");
        let ms = |name: &str| -> f64 { let s = &tokens[tokens.find(&format!("{name}: ")).unwrap() + name.len() + 2..]; s[..s.find("ms").unwrap()].parse().unwrap() };
        let close = &tokens[tokens.find("--ease-notch-close: linear(").unwrap() + 27..];
        let pts: Vec<f64> = close[..close.find(')').unwrap()].split(',').map(|x| x.trim().parse().unwrap()).collect();
        let half = pts.iter().position(|y| *y >= 0.5).unwrap() as f64 / (pts.len() - 1) as f64 * ms("--dur-notch-close");
        let want = ms("--seq-notch-height-at") + ms("--dur-notch-open-h") + half;
        assert!((FROM_BAND_MS as f64 - want).abs() <= 10.0, "FROM_BAND_MS {FROM_BAND_MS} vs {want}");
        // The shell keeps it from the opening and asks again when it ends.
        let open = main_body("fn open_card_then(");
        assert!(open.contains("*HOME_FROM.lock()") && open.contains("island::FROM_BAND_MS"), "{open}");
        assert!(main_body("fn home_rects_now(").contains("island::shape_rects_from(") && main_body("fn home_rects_now(").contains("island::from_band("));
    }
}
