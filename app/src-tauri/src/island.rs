//! Home in the notch (F18.1). Where the island sits on a display (on the notch where there is one, a small pill at the top
//! center inside the menu bar where there is not), how it grows when something needs you or when the pointer is on it, where
//! Home drops down to, which display it lives on, and the two small judgements made from the pointer: is it on our own
//! island, and did a press start outside every Companion window while Home is open. Points with a top left origin, like
//! docking.rs. Pure and tested; the AppKit glue is in main.rs.

use crate::docking::Rect;

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

#[derive(Clone, Debug, PartialEq)]
pub struct Display { pub id: String, pub frame: Rect, pub work: Rect, pub primary: bool, pub notch: Option<Notch> }

/// How big the island is. Rest: quiet (the notch itself, or a small pill). Alert: a little wider, so a mark shows beside the
/// notch when something needs you. Peek: the pointer is on it, so it opens downward with one line of status.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode { Rest, Alert, Peek }
impl Mode { pub fn word(self) -> &'static str { match self { Mode::Rest => "rest", Mode::Alert => "alert", Mode::Peek => "peek" } } }

pub const PILL_W: f64 = 120.0;
pub const ALERT_W: f64 = 150.0;
pub const EARS: f64 = 28.0;
pub const PEEK_W: f64 = 340.0;
pub const LINE_H: f64 = 30.0;
/// The macOS menu bar on a display without a notch, used when the work area does not show it (it hides itself, or this
/// display has none).
pub const DEFAULT_MENU_BAR: f64 = 24.0;
/// Between the island and Home, and between Home and the bottom of the work area.
pub const GAP: f64 = 6.0;
/// The island's window level: above the menu bar (24) and its status items (25), so it can sit on the notch. Home stays
/// at the card's own floating level below the menu bar, and the pointer overlay at 25.
pub const LEVEL: isize = 27;

/// The menu bar's height on this display: the notch's, or the distance from the top of the display to its work area.
pub fn menu_bar_h(d: &Display) -> f64 {
    if let Some(n) = d.notch { return n.h; }
    let h = d.work[1] - d.frame[1];
    if (18.0..=44.0).contains(&h) { h } else { DEFAULT_MENU_BAR }
}

/// The island's middle: the notch's, or the display's.
fn center_x(d: &Display) -> f64 {
    match d.notch { Some(n) => d.frame[0] + n.x + n.w / 2.0, None => d.frame[0] + d.frame[2] / 2.0 }
}

/// A left edge for something `w` wide around `cx`, kept on the span from `x0`, `span` wide.
fn around(cx: f64, w: f64, x0: f64, span: f64) -> f64 { (cx - w / 2.0).clamp(x0, (x0 + span - w).max(x0)) }

/// Where the island is drawn, in global points.
pub fn island_frame(d: &Display, mode: Mode) -> Rect {
    let (fx, fy, fw) = (d.frame[0], d.frame[1], d.frame[2]);
    let cx = center_x(d);
    match (d.notch, mode) {
        (Some(n), Mode::Rest) => [fx + n.x, fy, n.w, n.h],
        (Some(n), Mode::Alert) => { let w = (n.w + 2.0 * EARS).min(fw); [around(cx, w, fx, fw), fy, w, n.h] }
        (Some(n), Mode::Peek) => { let w = PEEK_W.max(n.w + 2.0 * EARS).min(fw); [around(cx, w, fx, fw), fy, w, n.h + LINE_H] }
        (None, m) => {
            let mb = menu_bar_h(d);
            let h = (mb - 4.0).max(16.0).min(mb);
            let w = match m { Mode::Rest => PILL_W, Mode::Alert => ALERT_W, Mode::Peek => PEEK_W }.min(fw);
            [around(cx, w, fx, fw), fy + (mb - h) / 2.0, w, if m == Mode::Peek { h + LINE_H } else { h }]
        }
    }
}

/// Where Home drops down to: centered under the island, just below the menu bar, kept inside the work area (a tall Home is
/// made shorter, and scrolls, rather than running under the Dock).
pub fn home_frame(d: &Display, size: (f64, f64)) -> Rect {
    let [wx, wy, ww, wh] = d.work;
    let w = size.0.min(ww).max(0.0);
    // Just below the menu bar (the island at rest is never taller), and never above the work area.
    let top = ((d.frame[1] + menu_bar_h(d)).max(wy) + GAP).min(wy + wh);
    let h = size.1.min((wy + wh - top - GAP).max(0.0)).max(0.0);
    [around(center_x(d), w, wx, ww), top, w, h]
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

/// What decides the island's size: the pointer is on it, something needs the person, Home is open.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct State { pub hover: bool, pub alert: bool, pub home_open: bool }

/// Home open shows everything the line would, so the island does not open over it.
pub fn mode(s: State) -> Mode {
    if s.hover && !s.home_open { Mode::Peek } else if s.alert { Mode::Alert } else { Mode::Rest }
}

/// How long the pointer must stay on the island before the line opens (a pass on the way to the menu bar does not open
/// it), and how long off it before the line closes (a slip off the edge does not close it).
pub const HOVER_IN_MS: u64 = 120;
pub const HOVER_OUT_MS: u64 = 300;

/// The pointer on our own island. macOS tells us only when it enters and leaves that one window (a tracking area on it);
/// nothing is read anywhere else.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Hover { inside: bool, since: u64, shown: bool }
impl Hover {
    pub const fn new() -> Self { Hover { inside: false, since: 0, shown: false } }
    pub fn enter(&mut self, t: u64) { if !self.inside { self.inside = true; self.since = t; } }
    pub fn exit(&mut self, t: u64) { if self.inside { self.inside = false; self.since = t; } }
    fn need(&self) -> u64 { if self.inside { HOVER_IN_MS } else { HOVER_OUT_MS } }
    /// Whether the line shows at time `t`.
    pub fn at(&mut self, t: u64) -> bool {
        if self.inside != self.shown && t.saturating_sub(self.since) >= self.need() { self.shown = self.inside; }
        self.shown
    }
    /// How long until the answer may change, if it may.
    pub fn wait_ms(&self, t: u64) -> Option<u64> {
        (self.inside != self.shown).then(|| self.need().saturating_sub(t.saturating_sub(self.since)))
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
        assert_eq!(menu_bar_h(&d), 32.0);
    }
    #[test]
    fn on_a_notch_something_that_needs_you_shows_beside_it_and_the_pointer_opens_it_downward() {
        let d = mbp14();
        let a = island_frame(&d, Mode::Alert);
        assert_eq!(a, [663.5 - EARS, 0.0, 185.0 + 2.0 * EARS, 32.0]);
        let p = island_frame(&d, Mode::Peek);
        assert_eq!(p[1], 0.0, "it hangs from the top of the screen");
        assert_eq!(p[3], 32.0 + LINE_H, "one line below the notch");
        assert!((cx(p) - 756.0).abs() < 0.01, "centered on the notch");
        assert!(p[2] >= 185.0 + 2.0 * EARS && p[2] >= PEEK_W);
        assert!(inside(p, d.frame));
    }
    #[test]
    fn without_a_notch_it_is_a_small_pill_at_the_top_center_inside_the_menu_bar() {
        for d in [ext(), air()] {
            let mb = menu_bar_h(&d);
            assert_eq!(mb, 24.0, "{}", d.id);
            for m in [Mode::Rest, Mode::Alert] {
                let r = island_frame(&d, m);
                assert!((cx(r) - cx(d.frame)).abs() < 0.01, "{} {m:?} centered", d.id);
                assert!(r[1] >= d.frame[1] && r[1] + r[3] <= d.frame[1] + mb, "{} {m:?} inside the menu bar: {r:?}", d.id);
                assert!(r[2] <= ALERT_W && r[2] >= PILL_W);
            }
            assert_eq!(island_frame(&d, Mode::Rest)[2], PILL_W);
            assert_eq!(island_frame(&d, Mode::Alert)[2], ALERT_W);
            let p = island_frame(&d, Mode::Peek);
            assert_eq!(p[2], PEEK_W);
            assert!(p[1] + p[3] > d.frame[1] + mb, "the line opens below the menu bar");
            assert!((cx(p) - cx(d.frame)).abs() < 0.01);
        }
        // The external monitor's pill is on the external monitor, not the laptop.
        assert!((cx(island_frame(&ext(), Mode::Rest)) - (1512.0 + 1280.0)).abs() < 0.01);
    }
    #[test]
    fn a_hidden_menu_bar_or_a_display_without_one_uses_the_usual_height() {
        let mut d = air();
        d.work = [0.0, 0.0, 1440.0, 830.0];   // the menu bar hides itself: the work area starts at the top
        assert_eq!(menu_bar_h(&d), DEFAULT_MENU_BAR);
        let r = island_frame(&d, Mode::Rest);
        assert!(r[1] >= 0.0 && r[1] + r[3] <= DEFAULT_MENU_BAR);
        d.work = [0.0, 300.0, 1440.0, 500.0];   // nonsense
        assert_eq!(menu_bar_h(&d), DEFAULT_MENU_BAR);
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
        assert_eq!(s(true, true, true), Mode::Alert);
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
        let tmp = std::env::temp_dir().join(format!("companion-island-{}", std::process::id()));
        let (home, data) = (tmp.join("home"), tmp.join("home/Library/Application Support/dev.companion.app"));
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(data.join(FILE), last_json("x")).unwrap();
        let settings = crate::wipe::items(&home, &data).into_iter().find(|i| i.id == "settings").unwrap();
        assert!(settings.paths.contains(&data.join(FILE)));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
