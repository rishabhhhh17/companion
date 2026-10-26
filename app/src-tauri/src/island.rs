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
    /// The size a home.size word names; anything else is the usual one.
    pub fn of(word: &str) -> HomeSize { if word == "large" { HomeSize::LARGE } else { HomeSize::STANDARD } }
}
/// The usual size, as Home's window is made at launch (before any setting is read) and as the tests name it.
pub const CARD: (f64, f64) = (HomeSize::STANDARD.w, HomeSize::STANDARD.min_h);
#[cfg_attr(not(test), allow(dead_code))]   // the tests name the usual tallest; the app reads the size in force
pub const CARD_MAX_H: f64 = HomeSize::STANDARD.max_h;

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
    if !(w >= MIN_NOTCH_W && w <= MAX_NOTCH_W) { return None; }
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

/// How big the island is. Rest: quiet (the notch itself, the pill, or the thin line). Alert: something needs you, so a mark
/// shows (in a lip below the notch, in the pill, or the line grows into the pill). Peek: the pointer rests on it, so it opens
/// downward with the status. It only ever grows downward: the part of it inside the menu bar is always the notch or the
/// pill at rest, so it never covers the app menus and status icons beside the notch, nor more of the menu bar than the pill.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode { Rest, Alert, Peek }
impl Mode { pub fn word(self) -> &'static str { match self { Mode::Rest => "rest", Mode::Alert => "alert", Mode::Peek => "peek" } } }

pub const PILL_W: f64 = 120.0;
/// The thin line on the top edge where no menu bar shows.
pub const EDGE_H: f64 = 5.0;
/// Below the notch while something needs you: room for the mark and the number of questions waiting. island.tsx's `.lip`.
pub const LIP: f64 = 12.0;
/// One line of the status, and how many lines it may take (it wraps, at the notch's or the pill's width). style.css's
/// `.peekline` draws the same: three lines at most, 15 points each, with room around them.
pub const LINE_H: f64 = 15.0;
pub const PEEK_LINES: f64 = 3.0;
pub const PEEK_H: f64 = PEEK_LINES * LINE_H + 9.0;
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
        (None, Some(mb)) => { let h = pill_h(mb); [x, fy + (mb - h) / 2.0, w, h] }
        (None, None) => [x, fy, w, EDGE_H],
    }
}

/// Where the island is drawn, in global points: the rest frame, taller when something needs you or the pointer rests on it.
pub fn island_frame(d: &Display, mode: Mode) -> Rect {
    let r = rest_frame(d);
    let grow = match (kind(d), mode) {
        (_, Mode::Rest) | (Kind::Pill, Mode::Alert) => 0.0,
        (Kind::Notch, Mode::Alert) => LIP,
        (Kind::Edge, Mode::Alert) => pill_h(DEFAULT_MENU_BAR) - EDGE_H,
        (_, Mode::Peek) => PEEK_H,
    };
    [r[0], r[1], r[2], r[3] + grow]
}

// ---- the motion (HeyClicky v1.0.53 parity: the notch peek and Home open smoothly) ----
// Kept here so the timing can become a setting later. Never with Reduce motion or Less motion (main.rs reduce_motion).

/// How long the island takes to grow downward, and Home to drop open, in seconds.
pub const OPEN_SECS: f64 = 0.18;
/// How far above its place Home starts its drop, in points: the gap under the island, so it never starts over the island.
pub const DROP: f64 = GAP;
/// Only taller, with the same left edge, top and width: the part inside the menu bar never moves (F18 item 1).
pub fn grows_down(from: Rect, to: Rect) -> bool {
    (from[0] - to[0]).abs() < 0.5 && (from[1] - to[1]).abs() < 0.5 && (from[2] - to[2]).abs() < 0.5 && to[3] > from[3] + 0.5
}
/// The island's change of frame shown as a short motion: only when it grows downward, never when it shrinks back (that is
/// at once), moves to another display, or `reduced` motion is asked for.
pub fn island_motion(from: Rect, to: Rect, reduced: bool) -> Option<f64> { (!reduced && grows_down(from, to)).then_some(OPEN_SECS) }
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
/// Where Home starts its drop when it opens (`opening`; a resize while it is open is never animated): the same place
/// across and the same size, DROP higher, then down to `to` while it fades in. None with `reduced` motion.
pub fn home_drop(to: Rect, opening: bool, reduced: bool) -> Option<Rect> { (opening && !reduced).then_some([to[0], to[1] - DROP, to[2], to[3]]) }

/// Where Home drops down to: centered under the island, just below the menu bar (or the thin line), kept inside the work
/// area (a tall Home is made shorter, and scrolls, rather than running under the Dock).
pub fn home_frame(d: &Display, size: (f64, f64)) -> Rect {
    let [wx, wy, ww, wh] = d.work;
    let w = size.0.min(ww).max(0.0);
    // While Home is open the island is at rest (`mode`), so Home starts just below that, and never above the work area.
    let r = rest_frame(d);
    let top = ((r[1] + r[3]).max(wy) + GAP).min(wy + wh);
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

/// What decides the island's size: the pointer is on it, something needs the person, Home is open.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct State { pub hover: bool, pub alert: bool, pub home_open: bool }

/// Home open shows everything the line or the mark would, right below, so the island stays at rest over it.
pub fn mode(s: State) -> Mode {
    if s.home_open { Mode::Rest } else if s.hover { Mode::Peek } else if s.alert { Mode::Alert } else { Mode::Rest }
}

/// How long the pointer must rest on the island before the line opens (crossing the notch on the way along the menu bar,
/// even slowly, does not open it), and how long off it before the line closes (a slip off the edge does not close it),
/// unless Settings says otherwise (island.openDelay, island.closeDelay).
pub const HOVER_IN_MS: u64 = 400;
pub const HOVER_OUT_MS: u64 = 300;

/// The waits in force, and whether resting on the island opens the status at all (island.peekOnHover; off, the island
/// opens only on a click).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HoverTimes { pub in_ms: u64, pub out_ms: u64, pub peek: bool }
impl HoverTimes { pub const USUAL: HoverTimes = HoverTimes { in_ms: HOVER_IN_MS, out_ms: HOVER_OUT_MS, peek: true }; }

/// The pointer on our own island. macOS tells us only when it enters and leaves that one window (a tracking area on it);
/// nothing is read anywhere else.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hover { inside: bool, since: u64, shown: bool, times: HoverTimes }
impl Default for Hover { fn default() -> Self { Hover::new() } }
impl Hover {
    pub const fn new() -> Self { Hover { inside: false, since: 0, shown: false, times: HoverTimes::USUAL } }
    /// The waits from Settings (main.rs gives them each time the pointer comes or goes).
    pub fn set_times(&mut self, times: HoverTimes) { self.times = times; }
    pub fn enter(&mut self, t: u64) { if !self.inside { self.inside = true; self.since = t; } }
    pub fn exit(&mut self, t: u64) { if self.inside { self.inside = false; self.since = t; } }
    fn need(&self) -> u64 { if self.inside { self.times.in_ms } else { self.times.out_ms } }
    /// Whether the line shows at time `t`. Never with the status on pointing turned off.
    pub fn at(&mut self, t: u64) -> bool {
        if !self.times.peek { self.shown = false; return false; }
        if self.inside != self.shown && t.saturating_sub(self.since) >= self.need() { self.shown = self.inside; }
        self.shown
    }
    /// How long until the answer may change, if it may.
    pub fn wait_ms(&self, t: u64) -> Option<u64> {
        (self.times.peek && self.inside != self.shown).then(|| self.need().saturating_sub(t.saturating_sub(self.since)))
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
    fn on_a_notch_the_island_at_rest_is_the_notch_itself() {
        let d = mbp14();
        assert_eq!(island_frame(&d, Mode::Rest), [663.5, 0.0, 185.0, 32.0]);
        let big = mbp16();
        assert_eq!(island_frame(&big, Mode::Rest), [771.5, 0.0, 185.0, 32.0]);
        assert_eq!(menu_bar(&d), Some(32.0));
    }
    // The menu bar beside the notch holds app menus and status icons, and the middle of a menu bar without a notch can
    // hold menu titles. The island must never take those clicks: whatever its size, the part of it inside the menu bar is
    // exactly the notch, or the pill at rest. It only ever grows downward, below the menu bar.
    #[test]
    fn on_a_notch_the_island_never_grows_sideways_over_the_menu_bar() {
        for d in [mbp14(), mbp16()] {
            let n = d.notch.unwrap();
            for m in [Mode::Rest, Mode::Alert, Mode::Peek] {
                let r = island_frame(&d, m);
                assert_eq!((r[0], r[2]), (d.frame[0] + n.x, n.w), "{} {m:?}: as wide as the notch, where the notch is: {r:?}", d.id);
                assert_eq!(r[1], d.frame[1], "{} {m:?} hangs from the top", d.id);
                assert!(r[3] >= n.h, "{} {m:?} covers the notch", d.id);
            }
        }
    }
    #[test]
    fn no_size_of_the_island_is_wider_than_it_is_at_rest_on_any_display() {
        let mut hidden = air(); hidden.work = [0.0, 0.0, 1440.0, 830.0];
        for d in [mbp14(), mbp16(), ext(), air(), hidden] {
            let rest = island_frame(&d, Mode::Rest);
            for m in [Mode::Alert, Mode::Peek] {
                let r = island_frame(&d, m);
                assert_eq!((r[0], r[1], r[2]), (rest[0], rest[1], rest[2]), "{} {m:?} grows only downward: {r:?} from {rest:?}", d.id);
                assert!(r[3] >= rest[3], "{} {m:?}", d.id);
            }
        }
    }
    #[test]
    fn on_a_notch_something_that_needs_you_shows_as_a_lip_below_it_and_the_pointer_opens_it_downward() {
        let d = mbp14();
        assert_eq!(island_frame(&d, Mode::Alert), [663.5, 0.0, 185.0, 32.0 + LIP], "a lip below the menu bar, under the notch");
        let p = island_frame(&d, Mode::Peek);
        assert_eq!(p, [663.5, 0.0, 185.0, 32.0 + PEEK_H], "the line opens below the notch");
        assert!((cx(p) - 756.0).abs() < 0.01, "centered on the notch");
        assert!(inside(p, d.frame));
    }
    #[test]
    fn without_a_notch_it_is_a_small_pill_at_the_top_center_inside_the_menu_bar() {
        for d in [ext(), air()] {
            assert_eq!(kind(&d), Kind::Pill, "{}", d.id);
            let mb = menu_bar(&d).unwrap();
            assert_eq!(mb, 24.0, "{}", d.id);
            for m in [Mode::Rest, Mode::Alert] {
                let r = island_frame(&d, m);
                assert!((cx(r) - cx(d.frame)).abs() < 0.01, "{} {m:?} centered", d.id);
                assert!(r[1] >= d.frame[1] && r[1] + r[3] <= d.frame[1] + mb, "{} {m:?} inside the menu bar: {r:?}", d.id);
                assert_eq!(r[2], PILL_W);
            }
            // Something that needs you changes the pill's mark and word, not its size.
            assert_eq!(island_frame(&d, Mode::Alert), island_frame(&d, Mode::Rest));
            let p = island_frame(&d, Mode::Peek);
            assert_eq!(p[2], PILL_W);
            assert!(p[1] + p[3] > d.frame[1] + mb + LINE_H, "the line opens below the menu bar");
            assert!((cx(p) - cx(d.frame)).abs() < 0.01);
        }
        // The external monitor's pill is on the external monitor, not the laptop.
        assert!((cx(island_frame(&ext(), Mode::Rest)) - (1512.0 + 1280.0)).abs() < 0.01);
    }
    #[test]
    fn where_the_menu_bar_hides_itself_or_there_is_none_it_is_a_thin_line_at_the_top_edge() {
        // With no menu bar showing, a pill would sit on the front app's own window (its title, tabs or toolbar) all day.
        // So at rest it is only a thin line on the top edge; it grows into the pill when something needs you.
        let mut hidden = air();
        hidden.work = [0.0, 0.0, 1440.0, 830.0];   // the menu bar hides itself: the work area starts at the top
        let mut second = ext();
        second.work = second.frame;   // a second display with no menu bar ("Displays have separate Spaces" off)
        let mut junk = air();
        junk.work = [0.0, 300.0, 1440.0, 500.0];   // a reading that makes no sense: no menu bar is assumed
        for d in [hidden, second, junk] {
            assert_eq!(kind(&d), Kind::Edge, "{}", d.id);
            assert_eq!(menu_bar(&d), None, "{}", d.id);
            let r = island_frame(&d, Mode::Rest);
            assert_eq!(r[1], d.frame[1], "{} on the top edge", d.id);
            assert_eq!(r[3], EDGE_H, "{} only a thin line", d.id);
            assert!((cx(r) - cx(d.frame)).abs() < 0.01, "{} centered", d.id);
            let a = island_frame(&d, Mode::Alert);
            assert!(a[3] > EDGE_H && a[3] <= DEFAULT_MENU_BAR, "{} the pill shows when something needs you: {a:?}", d.id);
            assert_eq!(island_frame(&d, Mode::Peek)[3], EDGE_H + PEEK_H);
            let h = home_frame(&d, (380.0, 420.0));
            assert!(inside(h, d.work) && h[1] >= r[1] + r[3], "{} Home below the line: {h:?}", d.id);
        }
        assert_eq!(Kind::Edge.word(), "edge");
        assert_eq!(kind(&mbp14()), Kind::Notch);
    }
    #[test]
    fn a_display_narrower_than_the_line_keeps_the_island_on_it() {
        let d = Display { id: "300x500@0,0".into(), frame: [0.0, 0.0, 300.0, 500.0], work: [0.0, 24.0, 300.0, 476.0], primary: true, notch: None };
        for m in [Mode::Rest, Mode::Alert, Mode::Peek] { assert!(inside(island_frame(&d, m), d.frame), "{m:?}"); }
    }
    #[test]
    fn home_drops_down_from_the_island_centered_and_inside_the_work_area() {
        for d in [mbp14(), mbp16(), ext(), air()] {
            let h = home_frame(&d, (380.0, 420.0));
            let island = island_frame(&d, Mode::Rest);
            assert!(inside(h, d.work), "{}: {h:?} inside {:?}", d.id, d.work);
            assert!((cx(h) - cx(island)).abs() < 0.01, "{} centered under the island", d.id);
            assert!(h[1] >= island[1] + island[3], "{} below the island", d.id);
            assert!(h[1] <= d.work[1] + GAP + 0.01, "{} right under the menu bar", d.id);
            assert_eq!((h[2], h[3]), (380.0, 420.0));
        }
        assert_eq!(home_frame(&mbp14(), (380.0, 420.0)), [756.0 - 190.0, 32.0 + GAP, 380.0, 420.0]);
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
            assert!((cx(spot) - cx(island_frame(&mac, Mode::Rest))).abs() < 0.01 && spot[1] >= 32.0 + GAP, "under the notch: {spot:?}");
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
        assert_eq!((CARD, CARD_MAX_H), ((640.0, 300.0), 640.0), "Home is 640 wide, from 300 tall, and grows to 640");
    }
    fn main_body(name: &str) -> String {
        let main = include_str!("main.rs");
        let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..];
        s[..s.find("\n}\n").unwrap()].to_string()
    }
    #[test]
    fn the_shell_has_one_place_for_home_and_one_tallest_height() {
        let main = include_str!("main.rs");
        let spot = main_body("fn card_spot(");
        assert!(spot.contains("island::card_spot(") && spot.contains("ISLAND_ON") && spot.contains("roamer().home()"), "card_spot asks the rule, with the island's display and the character's home");
        assert_eq!(main.matches("island::home_frame(").count(), 0, "Home is placed only through card_spot");
        assert_eq!(main.matches("card_frame(").count(), 0, "and only card_spot puts it beside the character");
        // One size definition (island.rs HomeSize), and the size in force comes from one place (home.size, home_size()).
        assert!(main.contains("use island::CARD;") && !main.contains("const CARD:") && !main.contains("CARD_MAX_H") && !main.contains("HomeSize { w:"), "one card size, defined here");
        assert!(main.contains("fn home_size() -> island::HomeSize { home_set().size }"));
        let rc = main_body("fn resize_card(");
        assert!(rc.contains("let hs = home_size();") && rc.contains("height.clamp(hs.min_h, hs.max_h)"), "Home never grows past what the character keeps clear of");
        assert!(main_body("fn card_room(").contains("card_spot(mtm, d, home_size().max_h)"), "trips keep clear of Home where card_spot says, at its tallest");
        let pc = main_body("fn place_card(");
        assert!(pc.contains("card_spot(mtm, d, CARD_H.load(") && pc.contains("card_spot(mtm, d, home_size().max_h)"), "placed, then the visit checked against the tallest");
        // Home is placed at its width in force, its height held inside its range, and the character keeps clear of it at
        // the same size, on its own place and when dragged.
        assert!(spot.contains("(hs.size.w, h.clamp(hs.size.min_h, hs.size.max_h))"), "{spot}");
        assert!(main_body("fn apply_dock(").contains("docking::place(&target, DOCK, edge, pct, home_size())"));
        assert!(main_body("fn drag_dock(").contains("snap_on(&target, DOCK, x, y, home_size())"));
    }
    #[test]
    fn a_change_of_displays_puts_the_character_the_island_and_home_back_and_both_features_keep_their_wiring() {
        let main = include_str!("main.rs");
        let tick = main_body("fn tick(");
        let order = ["apply_dock(mtm, \"screens_changed\", false)", "place_island(mtm, false, \"screens_changed\")", "if c.isVisible() { place_card(d, c) }", "follow_pointer(mtm)", "roam_tick(app, &wins, front_pid)"];
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
    #[test]
    fn the_size_follows_the_pointer_the_need_and_home() {
        let s = |hover, alert, home_open| mode(State { hover, alert, home_open });
        assert_eq!(s(false, false, false), Mode::Rest);
        assert_eq!(s(false, true, false), Mode::Alert);
        assert_eq!(s(true, false, false), Mode::Peek);
        assert_eq!(s(true, true, false), Mode::Peek);
        assert_eq!(s(true, false, true), Mode::Rest, "Home open: the line does not open over it");
        assert_eq!(s(true, true, true), Mode::Rest, "nor the lip: Home shows what needs you, right below");
        assert_eq!(s(false, true, true), Mode::Rest);
        assert_eq!(Mode::Peek.word(), "peek");
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
    fn crossing_the_notch_along_the_menu_bar_even_slowly_does_not_open_it() {
        // From the menus on the left to the icons on the right: 185 points at a slow 500 points a second is 370 ms.
        let crossing = (185.0 / 500.0 * 1000.0) as u64;
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
        let main = include_str!("main.rs");
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
    fn home_is_600_by_420_to_640_and_large_is_680_by_460_to_760() {
        assert_eq!(HomeSize::STANDARD, HomeSize { w: 640.0, min_h: 300.0, max_h: 640.0 });
        assert_eq!(HomeSize::LARGE, HomeSize { w: 680.0, min_h: 320.0, max_h: 760.0 });
        assert_eq!((CARD, CARD_MAX_H), ((HomeSize::STANDARD.w, HomeSize::STANDARD.min_h), HomeSize::STANDARD.max_h), "the usual size is today's");
        assert_eq!(HomeSize::of("standard"), HomeSize::STANDARD);
        assert_eq!(HomeSize::of("large"), HomeSize::LARGE);
        for junk in ["", "Large", "huge"] { assert_eq!(HomeSize::of(junk), HomeSize::STANDARD, "{junk}"); }
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
        assert_eq!(HoverTimes::USUAL, HoverTimes { in_ms: 400, out_ms: 300, peek: true }, "the usual waits are today's");
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
        assert_eq!(pick_where(&[main_ext.clone()], Where::BuiltIn, None, "", on_ext, true).map(|(d, w)| (d.id.clone(), w)), Some((ext.id.clone(), "main")));
        assert_eq!(pick_where(&[main_ext], Where::BuiltIn, Some(&mac.id), "", on_ext, true).map(|(_, w)| w), Some("main"), "a built in display that is not there");
        // Main: the display with the menu bar (the first macOS lists), even with the pointer on the other one.
        assert_eq!(pick_where(&both, Where::Main, Some(&mac.id), &ext.id, on_ext, true).map(|(d, w)| (d.id.clone(), w)), Some((mac.id.clone(), "main")));
        assert!(pick_where(&[], Where::Main, None, "", on_ext, true).is_none());
        assert_eq!((Where::of("follow"), Where::of("builtIn"), Where::of("main"), Where::of("junk")), (Where::Follow, Where::BuiltIn, Where::Main, Where::Follow));
    }

    // ---- HeyClicky v1.0.53 parity: the island and Home open with a short motion, instead of jumping ----
    #[test]
    fn the_island_grows_downward_with_a_short_motion_and_the_part_in_the_menu_bar_never_moves() {
        for d in [mbp14(), mbp16(), ext(), air()] {
            let rest = island_frame(&d, Mode::Rest);
            for m in [Mode::Alert, Mode::Peek] {
                let to = island_frame(&d, m);
                if to[3] > rest[3] {
                    assert!(grows_down(rest, to), "{}: only taller, same left, top and width", d.id);
                    assert_eq!(island_motion(rest, to, false), Some(OPEN_SECS), "{}", d.id);
                }
                // Shrinking back, or the same size, is at once: nothing is left hanging below the menu bar.
                assert_eq!(island_motion(to, rest, false), None, "{}", d.id);
            }
        }
        assert!((0.15..=0.2).contains(&OPEN_SECS), "short: it should feel like opening, not waiting");
    }
    #[test]
    fn reduce_motion_or_less_motion_makes_it_appear_at_once() {
        let d = mbp14();
        assert_eq!(island_motion(island_frame(&d, Mode::Rest), island_frame(&d, Mode::Peek), true), None);
        let to = home_frame(&d, (380.0, 400.0));
        assert_eq!(home_drop(to, true, true), None);
    }
    #[test]
    fn a_move_to_another_display_or_sideways_is_never_animated() {
        let (a, b) = (mbp14(), ext());
        assert_eq!(island_motion(island_frame(&a, Mode::Rest), island_frame(&b, Mode::Peek), false), None);
        let r = island_frame(&a, Mode::Rest);
        assert!(!grows_down(r, [r[0] + 10.0, r[1], r[2], r[3] + 40.0]));
        assert!(!grows_down(r, [r[0], r[1], r[2] + 10.0, r[3] + 40.0]));
    }
    /// Home is one black shape hanging from the notch (27 Oct 2026): its window and panel paint nothing, so the shape's round
    /// bottom corners float on the desktop instead of sitting in a white square, and no square shadow is drawn around it.
    #[test]
    fn home_floats_as_its_own_shape_on_a_see_through_panel() {
        let main = include_str!("main.rs");
        assert!(main.contains(r#"let b = if label == "dock" || label == "card" { b.transparent(true) } else { b };"#), "the web view paints nothing");
        let at = main.find("let card = make_panel(mtm, card_ns, true,").expect("Home's panel");
        let after = &main[at..at + 500];
        for want in ["card.setOpaque(false);", "card.setHasShadow(false);", "card.setBackgroundColor(Some(&NSColor::clearColor()));"] {
            assert!(after.contains(want), "{want}");
        }
    }
    #[test]
    fn home_drops_open_from_just_under_the_island_only_when_it_opens_never_on_a_resize() {
        for d in [mbp14(), ext(), air()] {
            let to = home_frame(&d, (380.0, 500.0));
            let start = home_drop(to, true, false).expect("opening");
            assert_eq!([start[0], start[2], start[3]], [to[0], to[2], to[3]], "same place across and the same size");
            assert!(start[1] < to[1] && to[1] - start[1] <= DROP + 0.01, "{}: a little higher, then down", d.id);
            let rest = island_frame(&d, Mode::Rest);
            assert!(start[1] >= rest[1] + rest[3] - 0.01, "{}: never over the island", d.id);
            // Home grows and shrinks as its page changes: that is never animated.
            assert_eq!(home_drop(to, false, false), None);
        }
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
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap()..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let pc = body("fn place_card(");
        assert!(pc.contains("set_frame_moving(c, to_appkit(cf, ph), None, None, &CARD_MOVES)"), "a resize is at once, never a motion: {pc}");
        assert!(!pc.contains("setFrame_display"), "{pc}");
        let helper = body("fn set_frame_moving(");
        assert!(helper.contains("let mine = moves.lock().unwrap_or_else(|e| e.into_inner()).ask(want, secs.is_some());"), "{helper}");
        assert!(helper.contains(".ended(mine)"), "{helper}");
        // At once is a motion of no length, which replaces one still running, and then set at once as well.
        assert!(helper.contains("setDuration(secs.unwrap_or(0.0))"), "{helper}");
        assert!(body("fn place_island(").contains("&ISLAND_MOVES)"));
        assert!(body("fn open_card(").contains("&CARD_MOVES)"));
    }

}
