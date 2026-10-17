//! The companion comes to what it is about (F18 item 2). When the character has something about a place on screen (a
//! ring from Point at the problem, a step of a Show me answer or a lesson, a result about a window), it moves beside
//! that window: outside it, on the side with the most room, never over the target or the window, never into the clear
//! zone at the top centre, and never onto another display unless the target is there. It stays while the ring or the
//! card is up and goes back to its home edge afterwards. It never moves while the person drags it or while the pointer
//! is over it. Window owners and sizes only (no permission, never content). Geometry is in points, top left origin.
//!
//! The motion is a short arc with the arrow's easing (pointer.ts), written as named states (surface, travel, settle,
//! return) so the founder's character art can replace the placeholder dot later. With reduced motion it appears in
//! place. The pure parts are here and tested; main.rs only reads the windows and moves the panel.

use crate::anchor::{self, Anchor, Verdict};
use crate::docking::{notch_zone, overlaps, Edge, Rect, Screen};
use crate::fullscreen::Win;

/// Space between the character and the window it comes to.
pub const GAP: f64 = 12.0;
/// If home is already this close (beyond where it would go), it stays home rather than move for nothing.
pub const CLOSE_SLACK: f64 = 160.0;
/// How long nothing about the visit (no ring, no card) must be up before it goes home, so a short gap between two
/// steps of an answer does not send it home and back.
pub const LINGER_MS: u64 = 1500;
/// How long the named states that do not travel last.
pub const SURFACE_MS: u64 = 160;
pub const SETTLE_MS: u64 = 220;

/// Which side of the window it sits on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side { Left, Right, Above, Below }
pub const SIDES: [Side; 4] = [Side::Right, Side::Left, Side::Below, Side::Above];

/// Why it stays home.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stay { NoRoom, AlreadyClose }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Plan { Go { spot: Rect, side: Side }, Stay(Stay) }

/// What the planner is told: the display the target is on, the window it is in, the target, the character's size,
/// anything of ours it must not cover (the card when it is up), and where the character lives now.
pub struct Ask<'a> {
    pub screen: &'a Screen,
    pub window: Rect,
    pub target: Rect,
    pub size: (f64, f64),
    pub avoid: &'a [Rect],
    pub home: Rect,
}

fn center(r: Rect) -> (f64, f64) { (r[0] + r[2] / 2.0, r[1] + r[3] / 2.0) }
fn dist(a: (f64, f64), b: (f64, f64)) -> f64 { (a.0 - b.0).hypot(a.1 - b.1) }
fn within(f: Rect, w: Rect) -> bool { f[0] >= w[0] - 0.01 && f[1] >= w[1] - 0.01 && f[0] + f[2] <= w[0] + w[2] + 0.01 && f[1] + f[3] <= w[1] + w[3] + 0.01 }
fn contains(r: Rect, p: (f64, f64)) -> bool { p.0 >= r[0] && p.0 < r[0] + r[2] && p.1 >= r[1] && p.1 < r[1] + r[3] }

/// The free distance between the window and the edge of the work area on one side (negative when the window goes past it).
pub fn room(a: &Ask, side: Side) -> f64 {
    let (w, win) = (a.screen.work, a.window);
    match side {
        Side::Left => win[0] - w[0],
        Side::Right => (w[0] + w[2]) - (win[0] + win[2]),
        Side::Above => win[1] - w[1],
        Side::Below => (w[1] + w[3]) - (win[1] + win[3]),
    }
}

/// Everything the character must not cover: the window, the target, the clear zone at the top centre, and ours.
fn blocks(a: &Ask) -> Vec<Rect> {
    let mut b = vec![a.window, a.target, notch_zone(a.screen)];
    b.extend_from_slice(a.avoid);
    b
}
fn clear(a: &Ask, f: Rect, blocks: &[Rect]) -> bool { within(f, a.screen.work) && !blocks.iter().any(|b| overlaps(f, *b)) }

/// The spot on one side, if that side has room for it clear of everything it must not cover. It sits `GAP` from the
/// window, level with the target, and if something is in the way there it slides along that side to the nearest place
/// that is clear.
pub fn spot_on(a: &Ask, side: Side) -> Option<Rect> {
    let (w, win, (cw, ch)) = (a.screen.work, a.window, a.size);
    let across = matches!(side, Side::Above | Side::Below);   // slides left and right
    if room(a, side) < if across { ch } else { cw } + GAP { return None; }
    let (tx, ty) = center(a.target);
    let fixed = match side {
        Side::Left => win[0] - GAP - cw,
        Side::Right => win[0] + win[2] + GAP,
        Side::Above => win[1] - GAP - ch,
        Side::Below => win[1] + win[3] + GAP,
    };
    let (lo, hi, len) = if across { (w[0], w[0] + w[2] - cw, cw) } else { (w[1], w[1] + w[3] - ch, ch) };
    if hi < lo { return None; }
    let at = |p: f64| if across { [p, fixed, cw, ch] } else { [fixed, p, cw, ch] };
    let want = (if across { tx - cw / 2.0 } else { ty - ch / 2.0 }).clamp(lo, hi);
    let bl = blocks(a);
    // Where it could go: level with the target, or just past either end of anything in the way along this side.
    let mut options = vec![want];
    for b in &bl {
        let (start, size) = if across { (b[0], b[2]) } else { (b[1], b[3]) };
        options.push((start - len - 0.5).clamp(lo, hi));
        options.push((start + size + 0.5).clamp(lo, hi));
    }
    options.into_iter().filter(|p| clear(a, at(*p), &bl)).min_by(|x, y| (x - want).abs().total_cmp(&(y - want).abs())).map(at)
}

/// Where it goes, or why it stays home: the side with the most room that has a clear spot (a tie goes to the spot
/// nearer the target), unless home is already a clear place on this display about as near the target.
pub fn plan(a: &Ask) -> Plan {
    let tc = center(a.target);
    let best = SIDES.into_iter().filter_map(|side| spot_on(a, side).map(|spot| (side, spot, room(a, side)))).max_by(|x, y| {
        if (x.2 - y.2).abs() > 0.5 { return x.2.total_cmp(&y.2); }
        dist(center(y.1), tc).total_cmp(&dist(center(x.1), tc))   // the nearer one is "greater"
    });
    let Some((side, spot, _)) = best else { return Plan::Stay(Stay::NoRoom) };
    let home_here = contains(a.screen.frame, center(a.home)) && clear(a, a.home, &blocks(a));
    if home_here && dist(center(a.home), tc) <= dist(center(spot), tc) + CLOSE_SLACK { return Plan::Stay(Stay::AlreadyClose); }
    Plan::Go { spot, side }
}

/// The display a target is on (its centre), or none when it is on no display.
pub fn display_of(screens: &[Screen], target: Rect) -> Option<&Screen> { let c = center(target); screens.iter().find(|s| contains(s.frame, c)) }

/// The front ordinary window of an app (for a result about the app's window: the error explainer, Prompt help).
/// Windows are listed front to back; floating layers and tiny windows (a status item, a tooltip) do not count.
pub fn front_window_of(wins: &[Win], pid: i32) -> Option<Rect> {
    wins.iter().find(|w| w.pid == pid && w.layer == 0 && w.bounds[2] >= 50.0 && w.bounds[3] >= 50.0).map(|w| w.bounds)
}

/// Where the arrow leaves from: the middle of where the character is right now (home, beside a window, or part way along
/// a trip), read before it sets off. Never the spot it is heading to: that spot is empty until the trip ends, and the
/// trip may be held back while the pointer is over the character. The character then follows the arrow to the window.
/// The arrow is not held back for the trip, so the ring, its words and the watch of its window stay in step.
pub fn arrow_start(at: Option<Rect>, fallback: (f64, f64)) -> (f64, f64) { at.map(center).unwrap_or(fallback) }

// ---------- the motion ----------

/// The arrow's easing (overlay.ts through pointer.ts `ease`): slow out, quick through the middle, slow in.
pub fn ease(t: f64) -> f64 { let t = t.clamp(0.0, 1.0); if t < 0.5 { 2.0 * t * t } else { 1.0 - (-2.0 * t + 2.0).powi(2) / 2.0 } }

/// How far the arc bends: the arrow's (pointer.ts `bend`), a quarter of the way, at most 80 points.
fn bend(distance: f64) -> f64 { (distance / 4.0).min(80.0) }

/// How long the trip takes: short (about a third to two thirds of a second), and longer for a longer way.
pub fn travel_ms(distance: f64) -> u64 { ((distance.max(0.0) / 1600.0) * 1000.0).clamp(320.0, 700.0) as u64 }

/// Whether the arc bends up (like the arrow's) or, near the top of the screens, down, so it never rises above `ceiling`.
pub fn bends_up(from: Rect, to: Rect, ceiling: f64) -> bool {
    let d = dist((from[0], from[1]), (to[0], to[1]));
    from[1].min(to[1]) - bend(d) / 2.0 >= ceiling
}

/// Where the character is part way along the arc, `e` being the eased time (0 at the start, 1 at the end). The arc is
/// the arrow's: a curve through a point above the middle by a quarter of the distance, at most 80 points.
pub fn arc_at(from: Rect, to: Rect, e: f64, up: bool) -> Rect {
    let e = e.clamp(0.0, 1.0);
    let (x0, y0, x1, y1) = (from[0], from[1], to[0], to[1]);
    let b = bend(dist((x0, y0), (x1, y1))) * if up { 1.0 } else { -1.0 };
    let (mx, my) = ((x0 + x1) / 2.0, (y0 + y1) / 2.0 - b);
    let q = |a: f64, m: f64, c: f64| (1.0 - e).powi(2) * a + 2.0 * (1.0 - e) * e * m + e * e * c;
    [q(x0, mx, x1), q(y0, my, y1), to[2], to[3]]
}

/// The named states (F18 item 4). The founder's art follows these; the placeholder dot only hints at them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase { Home, Surface, Travel, Settle, Visiting, Return }
impl Phase {
    pub fn name(self) -> &'static str {
        match self { Phase::Home => "home", Phase::Surface => "surface", Phase::Travel => "travel", Phase::Settle => "settle", Phase::Visiting => "visiting", Phase::Return => "return" }
    }
}

/// Which way the character faces in a state, for the art: towards the window while it settles and visits, the way it
/// is going while it surfaces, travels and returns, and into the screen from its edge at home.
pub fn facing(phase: Phase, from: Rect, to: Rect, side: Option<Side>, home: Edge) -> &'static str {
    let inward = match home { Edge::Left => "right", Edge::Right => "left", Edge::Top => "down", Edge::Bottom => "up" };
    match phase {
        Phase::Home => inward,
        Phase::Settle | Phase::Visiting => match side { Some(Side::Left) => "right", Some(Side::Right) => "left", Some(Side::Above) => "down", Some(Side::Below) => "up", None => inward },
        Phase::Surface | Phase::Travel | Phase::Return => {
            let (dx, dy) = (to[0] - from[0], to[1] - from[1]);
            if dx.abs() >= dy.abs() { if dx >= 0.0 { "right" } else { "left" } } else if dy >= 0.0 { "down" } else { "up" }
        }
    }
}

/// The named states of one move and how long each lasts. Going out: it surfaces from its edge, travels, settles beside
/// the window, then is visiting. Going home: it returns, then is home. With reduced motion it appears in place.
pub fn steps(out: bool, reduced: bool, travel: u64) -> Vec<(Phase, u64)> {
    match (out, reduced) {
        (true, false) => vec![(Phase::Surface, SURFACE_MS), (Phase::Travel, travel), (Phase::Settle, SETTLE_MS), (Phase::Visiting, 0)],
        (false, false) => vec![(Phase::Return, travel), (Phase::Home, 0)],
        (true, true) => vec![(Phase::Visiting, 0)],
        (false, true) => vec![(Phase::Home, 0)],
    }
}

// ---------- the visit ----------

/// One visit: the window it came to (as a ring's anchor), the target in it, and where the character sits.
#[derive(Clone, Debug, PartialEq)]
pub struct Visit { pub anchor: Anchor, pub target: Rect, pub spot: Rect, pub side: Side }

/// Why a visit ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EndWhy { Done, WindowChanged, SwitchedApp, Covered, Hidden, SettingOff }

/// Is the window it came to still there, where it was, uncovered, with the same app in front? Our own app in front (or
/// none known) counts as the same.
pub fn still_there(v: &Visit, wins: &[Win], ours: i32, front_pid: i32) -> Verdict {
    let front = if front_pid == ours || front_pid == 0 { v.anchor.front_pid } else { front_pid };
    let (x, y) = center(v.target);
    anchor::check(wins, ours, &v.anchor, front, x, y)
}

/// Waits for nothing about the visit to have been up for LINGER_MS.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Linger { since: Option<u64> }
impl Linger {
    /// `up`: is a ring or the card up. True once nothing has been up for LINGER_MS.
    pub fn done(&mut self, up: bool, now: u64) -> bool {
        if up { self.since = None; return false; }
        let since = *self.since.get_or_insert(now);
        now.saturating_sub(since) >= LINGER_MS
    }
    pub fn reset(&mut self) { self.since = None; }
}

/// What each tick knows.
pub struct TickIn<'a> { pub now: u64, pub on: bool, pub hidden: bool, pub up: bool, pub wins: &'a [Win], pub ours: i32, pub front_pid: i32 }

/// A move to start: where to, and whether it goes out to a window (true) or home (false).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Move { pub to: Rect, pub out: bool }

/// Where the character lives, where it is visiting, and where it is (or is on its way to).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Roamer { home: Option<Rect>, visit: Option<Visit>, heading: Option<Rect>, linger: Linger }
impl Roamer {
    pub const fn new() -> Self { Roamer { home: None, visit: None, heading: None, linger: Linger { since: None } } }
    pub fn home(&self) -> Option<Rect> { self.home }
    pub fn visit(&self) -> Option<&Visit> { self.visit.as_ref() }
    /// The character was put at home directly (launch, a drag, the displays changed, hidden): any visit is over and
    /// there is no trip back to make.
    pub fn placed_home(&mut self, home: Rect) { self.home = Some(home); self.heading = Some(home); self.end(); }
    /// Something about a window came up: go beside it (a newer visit replaces an older one).
    pub fn begin(&mut self, v: Visit) { self.visit = Some(v); self.linger.reset(); }
    /// The visit is over (the setting was turned off): go home.
    pub fn end(&mut self) { self.visit = None; self.linger.reset(); }
    /// Each tick: ends the visit and says why when it is no longer right.
    pub fn tick(&mut self, t: &TickIn) -> Option<EndWhy> {
        let v = self.visit.as_ref()?;
        let why = if t.hidden { Some(EndWhy::Hidden) } else if !t.on { Some(EndWhy::SettingOff) } else {
            match still_there(v, t.wins, t.ours, t.front_pid) {
                Verdict::Fine => None,
                Verdict::WindowChanged => Some(EndWhy::WindowChanged),
                Verdict::SwitchedApp => Some(EndWhy::SwitchedApp),
                Verdict::Covered => Some(EndWhy::Covered),
            }
        };
        let why = why.or_else(|| self.linger.done(t.up, t.now).then_some(EndWhy::Done));
        if why.is_some() { self.end(); }
        why
    }
    /// Our card opened or grew after the trip was planned (it opens when a result comes and grows as the result comes
    /// in). `room` is where the card can reach at its tallest. While that is clear of the spot nothing changes. Once it
    /// is not, the visit is planned again from the same window and target, clear of the card: a new spot (one move, since
    /// the tallest card holds every shorter one), or home when there is none. Says what it decided, if anything.
    pub fn card_moved(&mut self, room: Rect, screen: &Screen, size: (f64, f64)) -> Option<Plan> {
        let v = self.visit.as_ref()?;
        if !overlaps(v.spot, room) { return None; }
        let home = self.home?;
        let p = plan(&Ask { screen, window: v.anchor.bounds, target: v.target, size, avoid: &[room], home });
        match p {
            Plan::Go { spot, side } => { let next = Visit { spot, side, ..v.clone() }; self.begin(next); }
            Plan::Stay(_) => self.end(),
        }
        Some(p)
    }
    /// Where it should be: beside the window while it visits, otherwise home.
    pub fn want(&self) -> Option<Rect> { self.visit.as_ref().map(|v| v.spot).or(self.home) }
    /// The move to start now, if any: none when it is already there or on its way, and none while the person drags it or
    /// the pointer is over it (`blocked`); then it is still wanted, and the next tick starts it.
    pub fn next_move(&mut self, blocked: bool) -> Option<Move> {
        if !self.pending() || blocked { return None; }
        let want = self.want()?;
        self.heading = Some(want);
        Some(Move { to: want, out: self.visit.is_some() })
    }
    /// Whether a trip is waiting to start: it should be somewhere it is not, and is not on its way there.
    pub fn pending(&self) -> bool {
        let Some(want) = self.want() else { return false };
        !self.heading.is_some_and(|h| h.iter().zip(want.iter()).all(|(a, b)| (a - b).abs() < 0.5))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PHASES: [Phase; 6] = [Phase::Home, Phase::Surface, Phase::Travel, Phase::Settle, Phase::Visiting, Phase::Return];
    const SIZE: (f64, f64) = (160.0, 160.0);
    const OURS: i32 = 1;
    const EDITOR: i32 = 200;
    const OTHER: i32 = 300;
    fn scr(id: &str, frame: Rect, work: Rect, primary: bool) -> Screen { Screen { id: id.into(), frame, work, primary } }
    fn laptop() -> Screen { scr("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [0.0, 33.0, 1512.0, 949.0], true) }
    fn ext() -> Screen { scr("1920x1080@1512,0", [1512.0, 0.0, 1920.0, 1080.0], [1512.0, 25.0, 1920.0, 1000.0], false) }
    fn dock_left() -> Screen { scr("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [70.0, 33.0, 1442.0, 949.0], true) }
    const HOME_RIGHT: Rect = [1352.0, 427.5, 160.0, 160.0];
    const HOME_LEFT: Rect = [0.0, 427.5, 160.0, 160.0];
    fn ask<'a>(screen: &'a Screen, window: Rect, target: Rect, avoid: &'a [Rect], home: Rect) -> Ask<'a> { Ask { screen, window, target, size: SIZE, avoid, home } }
    fn go(p: Plan) -> (Rect, Side) { match p { Plan::Go { spot, side } => (spot, side), other => panic!("expected a trip, got {other:?}") } }
    fn win(pid: i32, b: Rect) -> Win { Win { pid, layer: 0, bounds: b } }

    // ---- where it goes ----
    #[test]
    fn it_goes_beside_the_window_on_the_side_with_the_most_room_level_with_the_target() {
        let s = laptop();
        // Room: left 100, right 512, above 67, below 182: the right.
        let (spot, side) = go(plan(&ask(&s, [100.0, 100.0, 900.0, 700.0], [300.0, 300.0, 100.0, 30.0], &[], HOME_LEFT)));
        assert_eq!(side, Side::Right);
        assert_eq!(spot, [1000.0 + GAP, 315.0 - 80.0, 160.0, 160.0]);
        // The same window moved right: now the left has the room.
        let (spot, side) = go(plan(&ask(&s, [600.0, 100.0, 800.0, 700.0], [900.0, 500.0, 100.0, 30.0], &[], HOME_RIGHT)));
        assert_eq!(side, Side::Left);
        assert_eq!(spot, [600.0 - GAP - 160.0, 515.0 - 80.0, 160.0, 160.0]);
    }
    #[test]
    fn below_or_above_when_only_there_is_room() {
        let s = laptop();
        let (spot, side) = go(plan(&ask(&s, [0.0, 33.0, 1512.0, 600.0], [700.0, 300.0, 100.0, 30.0], &[], HOME_LEFT)));
        assert_eq!((side, spot), (Side::Below, [670.0, 633.0 + GAP, 160.0, 160.0]));
        let (spot, side) = go(plan(&ask(&s, [0.0, 400.0, 1512.0, 582.0], [200.0, 700.0, 100.0, 30.0], &[], HOME_LEFT)));
        assert_eq!((side, spot), (Side::Above, [170.0, 400.0 - GAP - 160.0, 160.0, 160.0]));
    }
    #[test]
    fn it_stays_home_when_the_window_fills_the_screen() {
        let s = laptop();
        assert_eq!(plan(&ask(&s, s.work, [700.0, 300.0, 100.0, 30.0], &[], HOME_RIGHT)), Plan::Stay(Stay::NoRoom));
        assert_eq!(plan(&ask(&s, s.frame, [700.0, 300.0, 100.0, 30.0], &[], HOME_RIGHT)), Plan::Stay(Stay::NoRoom), "a full screen window");
        // A window with less room on every side than the character needs.
        assert_eq!(plan(&ask(&s, [100.0, 120.0, 1312.0, 760.0], [700.0, 300.0, 100.0, 30.0], &[], HOME_RIGHT)), Plan::Stay(Stay::NoRoom));
    }
    #[test]
    fn it_keeps_out_of_the_clear_zone_at_the_top_centre() {
        let s = laptop();
        let z = notch_zone(&s);
        // Only above has room, and level with the target is right under the notch island: it slides to the nearer side.
        let (spot, side) = go(plan(&ask(&s, [100.0, 220.0, 1300.0, 700.0], [700.0, 240.0, 100.0, 20.0], &[], HOME_RIGHT)));
        assert_eq!(side, Side::Above);
        assert!(!overlaps(spot, z), "{spot:?} {z:?}");
        assert_eq!(spot[1], 220.0 - GAP - 160.0);
        assert!((spot[0] + spot[2] - z[0]).abs() < 1.0, "just left of the zone, the nearer side: {spot:?}");
    }
    #[test]
    fn it_keeps_off_its_own_card() {
        let s = laptop();
        let card = [1012.0, 200.0, 340.0, 300.0];   // right where it would go
        let (spot, side) = go(plan(&ask(&s, [100.0, 100.0, 900.0, 700.0], [300.0, 300.0, 100.0, 30.0], &[card], HOME_LEFT)));
        assert!(!overlaps(spot, card), "{spot:?}");
        assert_eq!(side, Side::Right, "it slides along the same side when it can");
    }
    #[test]
    fn it_stays_home_when_home_is_already_beside_the_window() {
        let s = laptop();
        // Home on the right edge, the window's right side 152 points away, the target near it.
        assert_eq!(plan(&ask(&s, [100.0, 100.0, 1100.0, 700.0], [1000.0, 460.0, 80.0, 30.0], &[], HOME_RIGHT)), Plan::Stay(Stay::AlreadyClose));
        // Home on the far side of the screen: it goes.
        assert!(matches!(plan(&ask(&s, [100.0, 100.0, 1100.0, 700.0], [1000.0, 460.0, 80.0, 30.0], &[], HOME_LEFT)), Plan::Go { .. }));
        // Home covering the window is never "already close".
        assert!(matches!(plan(&ask(&s, [100.0, 100.0, 1100.0, 700.0], [300.0, 460.0, 80.0, 30.0], &[], [200.0, 400.0, 160.0, 160.0])), Plan::Go { .. }));
        // Nor is home on another display, however near it looks.
        assert!(matches!(plan(&ask(&s, [100.0, 100.0, 1100.0, 700.0], [1000.0, 460.0, 80.0, 30.0], &[], [1520.0, 400.0, 160.0, 160.0])), Plan::Go { .. }));
    }
    #[test]
    fn it_goes_to_the_display_the_target_is_on_and_only_there() {
        let both = [laptop(), ext()];
        let target = [2400.0, 500.0, 120.0, 30.0];
        let s = display_of(&both, target).unwrap();
        assert_eq!(s.id, "1920x1080@1512,0");
        let (spot, _) = go(plan(&ask(s, [1900.0, 200.0, 1000.0, 700.0], target, &[], HOME_RIGHT)));
        assert!(within(spot, s.work), "{spot:?}");
        // A window across both displays: the display with the target, even if most of the window is on the other.
        let t2 = [1400.0, 500.0, 60.0, 30.0];
        assert_eq!(display_of(&both, t2).unwrap().id, "1512x982@0,0");
        let (spot2, _) = go(plan(&ask(display_of(&both, t2).unwrap(), [900.0, 200.0, 1400.0, 600.0], t2, &[], [3272.0, 400.0, 160.0, 160.0])));
        assert!(within(spot2, laptop().work), "never onto the other display: {spot2:?}");
        assert!(display_of(&both, [-500.0, -500.0, 10.0, 10.0]).is_none(), "a target on no display");
    }
    #[test]
    fn a_window_partly_off_the_screen_has_no_room_on_that_side() {
        let s = laptop();
        let a = ask(&s, [-300.0, 100.0, 900.0, 700.0], [300.0, 300.0, 100.0, 30.0], &[], HOME_LEFT);
        assert!(room(&a, Side::Left) < 0.0);
        assert_eq!(spot_on(&a, Side::Left), None);
        assert_eq!(go(plan(&a)).1, Side::Right);
    }
    /// Many layouts: windows of many sizes and places on three kinds of display, targets in many places in them, home on
    /// every edge, the card up or not. Whatever the plan, the spot is outside the window and the target, inside the work
    /// area of the target's display, out of the clear zone and off the card, on a side with the most room among the
    /// sides that fit, and it never moves when there is nowhere to go.
    #[test]
    fn many_window_and_screen_layouts_never_cover_the_target_or_the_window() {
        let (mut goes, mut stays, mut cases) = (0u32, 0u32, 0u32);
        for s in [laptop(), ext(), dock_left()] {
            let w = s.work;
            let homes = [[w[0], w[1] + 300.0, 160.0, 160.0], [w[0] + w[2] - 160.0, w[1] + 300.0, 160.0, 160.0], [w[0] + 100.0, w[1], 160.0, 160.0], [w[0] + w[2] - 500.0, w[1] + w[3] - 160.0, 160.0, 160.0]];
            for wx in [-100.0, 0.0, 60.0, 180.0, 300.0, 520.0, 800.0] { for wy in [-20.0, 0.0, 40.0, 200.0, 420.0] { for ww in [300.0, 600.0, 900.0, 1300.0, 2000.0] { for wh in [200.0, 450.0, 700.0, 1100.0] {
                let window = [w[0] + wx, w[1] + wy, ww, wh];
                for (fx, fy) in [(0.1, 0.1), (0.5, 0.5), (0.9, 0.2), (0.3, 0.95)] {
                    let target = [window[0] + window[2] * fx - 30.0, window[1] + window[3] * fy - 10.0, 60.0, 20.0];
                    for home in homes { for card in [None, Some([home[0] - 348.0, home[1], 340.0, 300.0])] {
                        cases += 1;
                        let avoid: Vec<Rect> = card.into_iter().collect();
                        let a = ask(&s, window, target, &avoid, home);
                        match plan(&a) {
                            Plan::Go { spot, side } => {
                                goes += 1;
                                let why = format!("{} window {window:?} target {target:?} home {home:?} card {card:?}: {spot:?} {side:?}", s.id);
                                assert!(!overlaps(spot, window), "covers the window: {why}");
                                assert!(!overlaps(spot, target), "covers the target: {why}");
                                assert!(within(spot, w), "outside the work area: {why}");
                                assert!(!overlaps(spot, notch_zone(&s)), "in the clear zone: {why}");
                                for c in &avoid { assert!(!overlaps(spot, *c), "covers the card: {why}"); }
                                assert_eq!(spot_on(&a, side), Some(spot), "{why}");
                                for other in SIDES { if spot_on(&a, other).is_some() { assert!(room(&a, side) + 0.5 >= room(&a, other), "not the side with the most room ({other:?} has more): {why}"); } }
                                assert!(spot[2] == 160.0 && spot[3] == 160.0);
                            }
                            Plan::Stay(Stay::NoRoom) => { stays += 1; for side in SIDES { assert_eq!(spot_on(&a, side), None, "said no room but {side:?} fits"); } }
                            Plan::Stay(Stay::AlreadyClose) => { stays += 1; assert!(!overlaps(home, window) && !overlaps(home, target)); }
                        }
                    } }
                }
            } } } }
        }
        assert!(cases > 10_000, "{cases}");
        assert!(goes > cases / 5 && stays > cases / 20, "not vacuous: {goes} trips, {stays} stays of {cases}");
    }

    #[test]
    fn the_front_window_of_an_app_is_its_topmost_ordinary_window() {
        let wins = [Win { pid: OURS, layer: 25, bounds: [0.0, 0.0, 1512.0, 982.0] }, Win { pid: EDITOR, layer: 3, bounds: [0.0, 0.0, 300.0, 30.0] },
                    win(EDITOR, [0.0, 0.0, 20.0, 20.0]), win(OTHER, [10.0, 10.0, 500.0, 500.0]), win(EDITOR, [100.0, 100.0, 800.0, 600.0]), win(EDITOR, [50.0, 50.0, 400.0, 400.0])];
        assert_eq!(front_window_of(&wins, EDITOR), Some([100.0, 100.0, 800.0, 600.0]), "not a floating layer, not a tiny one");
        assert_eq!(front_window_of(&wins, 999), None);
    }

    // ---- the motion ----
    #[test]
    fn the_easing_is_the_arrows() {
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(1.0), 1.0);
        assert!((ease(0.5) - 0.5).abs() < 1e-12);
        assert!((ease(0.25) - 0.125).abs() < 1e-12, "slow out, as 2t squared");
        let mut last = 0.0;
        for i in 1..=100 { let t = i as f64 / 100.0; let e = ease(t); assert!(e >= last); assert!((e + ease(1.0 - t) - 1.0).abs() < 1e-9); last = e; }
        // The same formula and bend as the arrow in the page, which takes them from pointer.ts.
        let pointer = include_str!("../../src/pointer.ts");
        assert!(pointer.contains("export function ease(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }"));
        assert!(pointer.contains("export function bend(distance: number): number { return Math.min(80, distance / 4); }"));
        let overlay = include_str!("../../src/overlay.ts");
        assert!(overlay.contains("e = ease(t)") && overlay.contains("bend(dist)"), "the overlay flies the arrow with the same two");
    }
    #[test]
    fn the_arc_starts_and_ends_in_place_and_bends_like_the_arrow() {
        let (a, b) = ([100.0, 500.0, 160.0, 160.0], [900.0, 500.0, 160.0, 160.0]);
        assert_eq!(arc_at(a, b, 0.0, true), a);
        assert_eq!(arc_at(a, b, 1.0, true), b);
        let mid = arc_at(a, b, 0.5, true);
        assert_eq!(mid[0], 500.0);
        assert!((mid[1] - (500.0 - 80.0 / 2.0)).abs() < 1e-9, "up by half the bend at the middle: {mid:?}");
        assert!((arc_at(a, b, 0.5, false)[1] - 540.0).abs() < 1e-9);
        assert_eq!((mid[2], mid[3]), (160.0, 160.0), "its size never changes");
        let near = arc_at([100.0, 500.0, 160.0, 160.0], [140.0, 500.0, 160.0, 160.0], 0.5, true);
        assert!((near[1] - (500.0 - 10.0 / 2.0)).abs() < 1e-9, "a short trip bends a quarter of its length");
    }
    #[test]
    fn along_the_top_the_arc_bends_down_so_it_never_rises_into_the_menu_bar() {
        let (a, b) = ([0.0, 33.0, 160.0, 160.0], [1000.0, 33.0, 160.0, 160.0]);
        assert!(!bends_up(a, b, 33.0));
        for i in 0..=50 { assert!(arc_at(a, b, ease(i as f64 / 50.0), bends_up(a, b, 33.0))[1] >= 33.0 - 1e-9); }
        assert!(bends_up([0.0, 500.0, 160.0, 160.0], [1000.0, 400.0, 160.0, 160.0], 33.0), "lower down it bends up like the arrow");
    }
    #[test]
    fn the_trip_is_short() {
        assert!(travel_ms(0.0) >= 300 && travel_ms(10.0) >= 300);
        assert!(travel_ms(3000.0) <= 700);
        assert!(travel_ms(800.0) > travel_ms(200.0));
    }
    #[test]
    fn the_motion_is_written_as_named_states_and_reduced_motion_appears_in_place() {
        let names = |v: Vec<(Phase, u64)>| v.into_iter().map(|(p, _)| p.name()).collect::<Vec<_>>();
        assert_eq!(names(steps(true, false, 500)), ["surface", "travel", "settle", "visiting"]);
        assert_eq!(names(steps(false, false, 500)), ["return", "home"]);
        assert_eq!(names(steps(true, true, 500)), ["visiting"]);
        assert_eq!(names(steps(false, true, 500)), ["home"]);
        let out = steps(true, false, 480);
        assert_eq!(out[0].1, SURFACE_MS);
        assert_eq!(out[1].1, 480);
        assert_eq!(out[2].1, SETTLE_MS);
        let all: std::collections::BTreeSet<&str> = PHASES.iter().map(|p| p.name()).collect();
        assert_eq!(all.len(), 6);
    }
    #[test]
    fn the_art_is_told_which_way_to_face() {
        let (home, spot) = ([1352.0, 400.0, 160.0, 160.0], [1012.0, 235.0, 160.0, 160.0]);
        assert_eq!(facing(Phase::Surface, home, spot, Some(Side::Right), Edge::Right), "left", "the way it is going");
        assert_eq!(facing(Phase::Travel, home, spot, Some(Side::Right), Edge::Right), "left");
        assert_eq!(facing(Phase::Settle, home, spot, Some(Side::Right), Edge::Right), "left", "towards the window on its left");
        assert_eq!(facing(Phase::Visiting, home, spot, Some(Side::Below), Edge::Right), "up", "below the window it looks up");
        assert_eq!(facing(Phase::Visiting, home, spot, Some(Side::Above), Edge::Right), "down");
        assert_eq!(facing(Phase::Visiting, home, spot, Some(Side::Left), Edge::Right), "right");
        assert_eq!(facing(Phase::Return, spot, [500.0, 33.0, 160.0, 160.0], None, Edge::Top), "left");
        assert_eq!(facing(Phase::Return, [500.0, 600.0, 160.0, 160.0], [500.0, 33.0, 160.0, 160.0], None, Edge::Top), "up");
        for (edge, want) in [(Edge::Left, "right"), (Edge::Right, "left"), (Edge::Top, "down"), (Edge::Bottom, "up")] {
            assert_eq!(facing(Phase::Home, spot, home, None, edge), want, "into the screen from {edge:?}");
        }
    }

    // ---- the visit ----
    const WIN: Rect = [100.0, 100.0, 900.0, 700.0];
    const TARGET: Rect = [300.0, 300.0, 100.0, 30.0];
    fn visit() -> Visit { Visit { anchor: Anchor { pid: EDITOR, bounds: WIN, front_pid: EDITOR }, target: TARGET, spot: [1012.0, 235.0, 160.0, 160.0], side: Side::Right } }
    fn tin(now: u64, up: bool, wins: &[Win], front: i32) -> TickIn<'_> { TickIn { now, on: true, hidden: false, up, wins, ours: OURS, front_pid: front } }

    #[test]
    fn the_window_it_came_to_must_still_be_there_where_it_was_with_its_app_in_front() {
        let v = visit();
        assert_eq!(still_there(&v, &[win(EDITOR, WIN)], OURS, EDITOR), Verdict::Fine);
        assert_eq!(still_there(&v, &[win(EDITOR, [160.0, 100.0, 900.0, 700.0])], OURS, EDITOR), Verdict::WindowChanged, "moved");
        assert_eq!(still_there(&v, &[], OURS, EDITOR), Verdict::WindowChanged, "closed");
        assert_eq!(still_there(&v, &[win(OTHER, [200.0, 200.0, 400.0, 400.0]), win(EDITOR, WIN)], OURS, EDITOR), Verdict::Covered);
        assert_eq!(still_there(&v, &[win(EDITOR, WIN)], OURS, OTHER), Verdict::SwitchedApp);
        // Our own card over it, our own app in front, or no app known: still fine.
        assert_eq!(still_there(&v, &[win(OURS, [250.0, 250.0, 300.0, 300.0]), win(EDITOR, WIN)], OURS, EDITOR), Verdict::Fine);
        assert_eq!(still_there(&v, &[win(EDITOR, WIN)], OURS, OURS), Verdict::Fine);
        assert_eq!(still_there(&v, &[win(EDITOR, WIN)], OURS, 0), Verdict::Fine);
    }
    #[test]
    fn it_goes_home_once_the_ring_and_the_card_have_been_gone_a_moment() {
        let wins = [win(EDITOR, WIN)];
        let mut r = Roamer::new();
        r.placed_home(HOME_LEFT);
        r.begin(visit());
        assert_eq!(r.want(), Some(visit().spot));
        assert_eq!(r.tick(&tin(0, true, &wins, EDITOR)), None);
        assert_eq!(r.tick(&tin(500, false, &wins, EDITOR)), None, "just gone");
        assert_eq!(r.tick(&tin(1500, false, &wins, EDITOR)), None, "a second later");
        assert_eq!(r.tick(&tin(2000, false, &wins, EDITOR)), Some(EndWhy::Done));
        assert_eq!(r.want(), Some(HOME_LEFT));
        assert!(r.visit().is_none());
        assert_eq!(r.tick(&tin(2500, false, &wins, EDITOR)), None, "said once");
    }
    #[test]
    fn a_short_gap_between_two_steps_does_not_send_it_home_and_back() {
        let wins = [win(EDITOR, WIN)];
        let mut r = Roamer::new();
        r.placed_home(HOME_LEFT);
        r.begin(visit());
        for (t, up) in [(0, true), (500, false), (1000, false), (1500, true), (2000, false), (3000, false), (3400, true)] {
            assert_eq!(r.tick(&tin(t, up, &wins, EDITOR)), None, "{t}");
        }
        let mut l = Linger::default();
        assert!(!l.done(false, 10)); assert!(!l.done(false, 10 + LINGER_MS - 1)); assert!(l.done(false, 10 + LINGER_MS));
        assert!(!l.done(true, 10 + LINGER_MS + 1)); assert!(!l.done(false, 20 + LINGER_MS));
    }
    #[test]
    fn it_goes_home_at_once_when_the_window_moves_closes_is_covered_or_another_app_comes_to_the_front() {
        for (wins, front, why) in [
            (vec![win(EDITOR, [160.0, 100.0, 900.0, 700.0])], EDITOR, EndWhy::WindowChanged),
            (vec![], EDITOR, EndWhy::WindowChanged),
            (vec![win(OTHER, [200.0, 200.0, 400.0, 400.0]), win(EDITOR, WIN)], EDITOR, EndWhy::Covered),
            (vec![win(EDITOR, WIN)], OTHER, EndWhy::SwitchedApp),
        ] {
            let mut r = Roamer::new();
            r.placed_home(HOME_LEFT);
            r.begin(visit());
            assert_eq!(r.tick(&tin(0, true, &wins, front)), Some(why), "even with the ring up");
            assert_eq!(r.want(), Some(HOME_LEFT));
        }
    }
    #[test]
    fn hiding_it_or_turning_the_setting_off_ends_the_visit() {
        let wins = [win(EDITOR, WIN)];
        let mut r = Roamer::new(); r.placed_home(HOME_LEFT); r.begin(visit());
        assert_eq!(r.tick(&TickIn { hidden: true, ..tin(0, true, &wins, EDITOR) }), Some(EndWhy::Hidden));
        let mut r = Roamer::new(); r.placed_home(HOME_LEFT); r.begin(visit());
        assert_eq!(r.tick(&TickIn { on: false, ..tin(0, true, &wins, EDITOR) }), Some(EndWhy::SettingOff));
        let mut r = Roamer::new(); r.placed_home(HOME_LEFT); r.begin(visit());
        r.end();
        assert_eq!(r.want(), Some(HOME_LEFT));
        assert_eq!(r.tick(&tin(0, true, &wins, EDITOR)), None, "nothing left to end");
    }
    #[test]
    fn it_never_moves_while_dragged_or_under_the_pointer_but_the_move_is_not_lost() {
        let mut r = Roamer::new();
        r.placed_home(HOME_LEFT);
        assert_eq!(r.next_move(false), None, "already home");
        r.begin(visit());
        assert_eq!(r.next_move(true), None);
        assert_eq!(r.next_move(true), None);
        assert_eq!(r.next_move(false), Some(Move { to: visit().spot, out: true }));
        assert_eq!(r.next_move(false), None, "already on its way");
        r.end();
        assert_eq!(r.next_move(true), None);
        assert_eq!(r.next_move(false), Some(Move { to: HOME_LEFT, out: false }));
        assert_eq!(r.next_move(false), None);
    }
    #[test]
    fn an_idle_tick_has_nothing_to_do_so_the_pointer_is_not_even_read() {
        // Low idle CPU (AGENTS.md "The bar" 12): the shell reads the pointer only when a trip is waiting.
        let mut r = Roamer::new();
        assert!(!r.pending());
        r.placed_home(HOME_LEFT);
        assert!(!r.pending(), "at home, nothing to do");
        r.begin(visit());
        assert!(r.pending());
        assert!(r.next_move(true).is_none());
        assert!(r.pending(), "held back, still waiting");
        assert!(r.next_move(false).is_some());
        assert!(!r.pending(), "on its way");
        r.end();
        assert!(r.pending());
        let kick = body(MAIN, "fn roam_kick(");
        assert!(kick.find("pending()").unwrap() < kick.find("roam_blocked()").unwrap(), "checked before the pointer is read");
    }
    #[test]
    fn a_drag_or_a_display_change_puts_it_home_with_no_trip_back() {
        let mut r = Roamer::new();
        r.placed_home(HOME_LEFT);
        r.begin(visit());
        assert!(r.next_move(false).is_some());
        r.placed_home(HOME_RIGHT);
        assert!(r.visit().is_none());
        assert_eq!(r.want(), Some(HOME_RIGHT));
        assert_eq!(r.next_move(false), None, "it is already there");
        assert_eq!(r.home(), Some(HOME_RIGHT));
    }
    #[test]
    fn a_newer_visit_replaces_the_older_one() {
        let mut r = Roamer::new();
        r.placed_home(HOME_LEFT);
        r.begin(visit());
        assert!(r.next_move(false).is_some());
        let newer = Visit { spot: [400.0, 820.0, 160.0, 160.0], side: Side::Below, ..visit() };
        r.begin(newer.clone());
        assert_eq!(r.visit(), Some(&newer));
        assert_eq!(r.next_move(false), Some(Move { to: newer.spot, out: true }));
    }
    // ---- the arrow leaves from the character ----
    #[test]
    fn the_arrow_leaves_from_where_the_character_is_now_never_from_where_it_is_going() {
        assert_eq!(arrow_start(Some(HOME_RIGHT), (0.0, 0.0)), (1432.0, 507.5), "from the middle of the character at home");
        let mid = arc_at(HOME_RIGHT, visit().spot, ease(0.5), true);
        assert_eq!(arrow_start(Some(mid), (0.0, 0.0)), center(mid), "part way along a trip: from where it is on the way");
        assert_eq!(arrow_start(Some(visit().spot), (0.0, 0.0)), center(visit().spot), "already beside the window: from there");
        assert_eq!(arrow_start(None, (10.0, 20.0)), (10.0, 20.0), "nothing known: the given place");
    }

    // ---- the card opening or growing after the trip was planned ----
    fn visit_to(window: Rect, target: Rect, spot: Rect, side: Side) -> Visit { Visit { anchor: Anchor { pid: EDITOR, bounds: window, front_pid: EDITOR }, target, spot, side } }
    #[test]
    fn the_card_growing_over_the_spot_moves_the_character_clear_of_it() {
        let s = laptop();
        // Home on the right edge, a Terminal window on the left. Level with the error line is beside the short card, so the
        // spot slides to just below it; then the card grows down over it as the explanation comes in.
        let (window, target) = ([40.0, 100.0, 900.0, 500.0], [400.0, 505.0, 200.0, 30.0]);
        let short = crate::docking::card_frame(HOME_RIGHT, (340.0, 150.0), s.work, Edge::Right);
        let tallest = crate::docking::card_frame(HOME_RIGHT, (340.0, 520.0), s.work, Edge::Right);
        let (spot, side) = go(plan(&ask(&s, window, target, &[short], HOME_RIGHT)));
        assert!(!overlaps(spot, short) && overlaps(spot, tallest), "the layout the review found: {spot:?}");
        let mut r = Roamer::new();
        r.placed_home(HOME_RIGHT);
        r.begin(visit_to(window, target, spot, side));
        assert!(r.next_move(false).is_some());
        let p = r.card_moved(tallest, &s, SIZE).expect("planned again");
        let v = r.visit().expect("still visiting, somewhere clear").clone();
        assert_eq!(p, Plan::Go { spot: v.spot, side: v.side });
        for b in [tallest, window, target, notch_zone(&s)] { assert!(!overlaps(v.spot, b), "{v:?} covers {b:?}"); }
        assert!(within(v.spot, s.work));
        assert_eq!((v.anchor.bounds, v.target), (window, target), "the same window and target");
        assert_eq!(r.next_move(false), Some(Move { to: v.spot, out: true }), "it moves there");
        assert_eq!(r.card_moved(tallest, &s, SIZE), None, "once clear of the tallest card it stays put while the card keeps growing");
        assert_eq!(r.next_move(false), None);
    }
    #[test]
    fn when_the_card_leaves_no_clear_spot_beside_the_window_it_goes_home() {
        // A small display: the card at its tallest fills the room right of a window on the left half.
        let s = scr("1024x640@0,0", [0.0, 0.0, 1024.0, 640.0], [0.0, 25.0, 1024.0, 615.0], true);
        let home = [864.0, 252.5, 160.0, 160.0];
        let (window, target) = ([20.0, 25.0, 500.0, 615.0], [200.0, 300.0, 120.0, 24.0]);
        let (spot, side) = go(plan(&ask(&s, window, target, &[], home)));
        let tallest = crate::docking::card_frame(home, (340.0, 520.0), s.work, Edge::Right);
        assert!(overlaps(spot, tallest));
        let mut r = Roamer::new();
        r.placed_home(home);
        r.begin(visit_to(window, target, spot, side));
        assert!(r.next_move(false).is_some());
        assert_eq!(r.card_moved(tallest, &s, SIZE), Some(Plan::Stay(Stay::NoRoom)));
        assert!(r.visit().is_none());
        assert_eq!(r.next_move(false), Some(Move { to: home, out: false }), "it goes home");
    }
    #[test]
    fn a_card_clear_of_the_spot_or_no_visit_changes_nothing() {
        let s = laptop();
        let mut r = Roamer::new();
        r.placed_home(HOME_LEFT);
        assert_eq!(r.card_moved([170.0, 427.5, 340.0, 520.0], &s, SIZE), None, "no visit");
        r.begin(visit());
        assert!(r.next_move(false).is_some());
        assert_eq!(r.card_moved([170.0, 427.5, 340.0, 520.0], &s, SIZE), None, "clear of the spot");
        assert_eq!(r.visit(), Some(&visit()));
        assert_eq!(r.next_move(false), None, "no trip");
    }
    /// The card at its tallest holds every shorter card for every edge, so keeping clear of the tallest keeps clear of
    /// the card however far it grows.
    #[test]
    fn the_tallest_card_holds_every_shorter_one() {
        let small = scr("1024x640@0,0", [0.0, 0.0, 1024.0, 640.0], [0.0, 25.0, 1024.0, 615.0], true);
        for s in [laptop(), ext(), dock_left(), small] {
            let w = s.work;
            for edge in [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom] { for pct in [0.0, 0.3, 0.5, 0.8, 1.0] {
                let home = crate::docking::place(&s, SIZE, edge, pct);
                let tallest = crate::docking::card_frame(home, (340.0, 520.0), w, edge);
                for h in (150..=520).step_by(10) {
                    let c = crate::docking::card_frame(home, (340.0, h as f64), w, edge);
                    assert!(within(c, tallest), "{} {edge:?} {pct} {h}: {c:?} not in {tallest:?}", s.id);
                }
            } }
        }
    }
    /// Many layouts: the trip is planned with the card closed, then the card opens at its tallest beside home. Whatever
    /// comes of it, the character is never under the card, over the window or the target, or outside the work area.
    #[test]
    fn many_layouts_the_card_opening_later_never_ends_over_the_character() {
        let (mut cases, mut replans, mut homes) = (0u32, 0u32, 0u32);
        for s in [laptop(), ext(), dock_left()] {
            let w = s.work;
            for (edge, pct) in [(Edge::Left, 0.5), (Edge::Right, 0.5), (Edge::Right, 0.1), (Edge::Top, 0.2), (Edge::Bottom, 0.7)] {
                let home = crate::docking::place(&s, SIZE, edge, pct);
                let tallest = crate::docking::card_frame(home, (340.0, 520.0), w, edge);
                for wx in [0.0, 60.0, 300.0, 520.0, 800.0] { for wy in [0.0, 40.0, 200.0, 420.0] { for ww in [300.0, 600.0, 900.0, 1300.0] { for wh in [200.0, 450.0, 700.0] {
                    let window = [w[0] + wx, w[1] + wy, ww, wh];
                    for (fx, fy) in [(0.1, 0.1), (0.5, 0.5), (0.9, 0.2), (0.3, 0.95)] {
                        let target = [window[0] + window[2] * fx - 30.0, window[1] + window[3] * fy - 10.0, 60.0, 20.0];
                        let Plan::Go { spot, side } = plan(&ask(&s, window, target, &[], home)) else { continue };
                        cases += 1;
                        let mut r = Roamer::new();
                        r.placed_home(home);
                        r.begin(visit_to(window, target, spot, side));
                        let why = format!("{} {edge:?} window {window:?} target {target:?} spot {spot:?}", s.id);
                        match r.card_moved(tallest, &s, SIZE) {
                            None => assert!(!overlaps(spot, tallest), "kept a spot under the card: {why}"),
                            Some(Plan::Go { spot: n, .. }) => {
                                replans += 1;
                                assert_eq!(r.visit().map(|v| v.spot), Some(n));
                                for b in [tallest, window, target, notch_zone(&s)] { assert!(!overlaps(n, b), "{n:?} covers {b:?}: {why}"); }
                                assert!(within(n, w), "{why}");
                            }
                            Some(Plan::Stay(_)) => { homes += 1; assert!(r.visit().is_none() && r.want() == Some(home), "{why}"); }
                        }
                    }
                } } } }
            }
        }
        assert!(cases > 2_000 && replans > 50 && homes > 0, "not vacuous: {cases} trips, {replans} planned again, {homes} sent home");
    }

    // ---- the shell's wiring (main.rs moves the panel; the rules above decide) ----
    fn body(src: &str, name: &str) -> String {
        let s = &src[src.find(name).unwrap_or_else(|| panic!("{name} missing"))..];
        s[..s.find("\n}\n").unwrap()].to_string()
    }
    const MAIN: &str = include_str!("main.rs");
    #[test]
    fn every_ring_on_a_window_and_every_result_about_a_window_brings_the_character() {
        let draw = body(MAIN, "fn draw_pointer_with(");
        assert!(draw.contains("roam_to(") && draw.contains("watched.window()"), "a ring in a confirmed window brings it; one with no window does not");
        // The arrow leaves from where the character is before it sets off (it follows the arrow to the window), never from
        // the spot it is heading to: that spot is empty until the trip ends, and the trip may be held back by the pointer.
        let (here, go) = (draw.find("roam::arrow_start(").expect("the arrow's start comes from the rule"), draw.find("roam_to(").unwrap());
        assert!(here < go, "read where the character is before it sets off");
        assert!(!draw.contains("spot"), "the arrow never starts from where the character is going");
        assert!(!body(MAIN, "fn roam_to(").contains("-> Option<Rect>"), "roam_to does not hand back where it is going");
        for f in [include_str!("errhelp.rs"), include_str!("phelp.rs")] { assert!(f.contains("crate::roam_beside_window_of(app, pid)"), "a result about a window brings it"); }
        let to = body(MAIN, "fn roam_to(");
        for gate in ["come_to", "HIDDEN_BY_US", "USER_HID", "roam::display_of(", "roam::plan("] { assert!(to.contains(gate), "{gate}"); }
    }
    #[test]
    fn the_shell_follows_the_rules_and_never_moves_it_under_the_pointer_or_while_dragged() {
        assert!(body(MAIN, "fn tick(").contains("roam_tick("), "every tick checks the visit");
        let rt = body(MAIN, "fn roam_tick(");
        assert!(rt.contains(".tick(&roam::TickIn") && rt.contains("EndWhy::Hidden"), "hidden: home at once, with no trip");
        assert!(rt.contains("card_visible()") && rt.contains("overlay_busy()") && rt.contains("TURN.lock()"), "a ring or the card keeps it there");
        assert!(body(MAIN, "fn roam_kick(").contains("next_move(roam_blocked())"));
        let fly = body(MAIN, "fn roam_fly(");
        assert!(fly.contains("roam_blocked()") && fly.contains("roam::ease(") && fly.contains("roam::arc_at("), "it pauses under the pointer and flies the arrow's arc");
        let blocked = body(MAIN, "fn roam_blocked(");
        assert!(blocked.contains("dragging()") && blocked.contains("macos_see::pointer()"));
        assert!(body(MAIN, "fn drag_dock(").contains("DRAG_AT.store(now() as u64"));
        assert!(body(MAIN, "fn drop_dock(").contains("DRAG_AT.store(0"));
        let apply = body(MAIN, "fn apply_dock(");
        assert!(apply.contains("docking::place(") && apply.contains("placed_home("), "a drag or a display change puts it home and ends any visit");
        assert!(body(MAIN, "fn place_card(").contains("card_spot(") && body(MAIN, "fn card_spot(").contains("roamer().home()"), "the card stays by home while the character visits");
        assert!(body(MAIN, "fn roam_animate(").contains("reduced"), "reduced motion appears in place");
        assert!(MAIN.contains("accessibilityDisplayShouldReduceMotion()"));
    }
    #[test]
    fn the_card_opening_or_growing_plans_the_visit_again_and_trips_keep_clear_of_its_tallest() {
        let pc = body(MAIN, "fn place_card(");
        assert!(pc.contains("roam_card_moved(") && pc.contains("CARD_MAX_H"), "every time the card opens or grows, checked against its tallest");
        assert!(pc.find("setFrame_display").unwrap() < pc.find("roam_card_moved(").unwrap(), "after the card is placed");
        let moved = body(MAIN, "fn roam_card_moved(");
        assert!(moved.contains(".card_moved(") && moved.contains("roam_kick("), "planned again by the rule, and the trip starts");
        assert!(body(MAIN, "fn roam_to(").contains("card_room("), "planned clear of where the card can grow to");
        assert!(body(MAIN, "fn card_room(").contains("CARD_MAX_H"));
        assert!(body(MAIN, "fn resize_card(").contains("CARD_MAX_H"), "the card never grows past what the plan keeps clear of");
        for name in ["fn open_card(", "fn resize_card("] { assert!(body(MAIN, name).contains("place_card("), "{name} places the card, so it rechecks the visit"); }
    }
    #[test]
    fn moving_it_never_takes_focus_or_shows_a_window() {
        for name in ["fn roam_to(", "fn roam_kick(", "fn roam_animate(", "fn roam_fly(", "fn roam_set(", "fn roam_tick(", "fn roam_beside_window_of(", "fn roam_home_now(", "fn roam_card_moved(", "fn card_room("] {
            let b = body(MAIN, name);
            for bad in ["makeKey", "orderFront", "set_focus", "activate", ".show("] { assert!(!b.contains(bad), "{name} must not {bad}"); }
        }
    }
    #[test]
    fn the_setting_is_kept_by_the_app_changed_only_from_the_card_and_the_character_hides_from_sharing_too() {
        let set = body(MAIN, "fn set_come_to(");
        assert!(set.contains("window.label() != \"card\"") && set.contains("save_prefs()"));
        for c in ["dock_settings", "set_come_to"] { assert!(MAIN.contains(&format!(", {c},")) || MAIN.contains(&format!(", {c}]")), "{c} is not a command"); }
        assert!(body(MAIN, "fn apply_sharing(").contains("dock.setSharingType(t)"), "F18: hiding from screen sharing applies to the character");
    }

    #[test]
    fn nothing_moves_before_it_has_a_home() {
        let mut r = Roamer::new();
        r.begin(visit());
        assert_eq!(r.next_move(false), Some(Move { to: visit().spot, out: true }));
        let mut r = Roamer::new();
        assert_eq!(r.want(), None);
        assert_eq!(r.next_move(false), None);
    }
}
