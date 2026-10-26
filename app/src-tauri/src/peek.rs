//! Peeking (27 Oct 2026, the founder: "our guys can always be outside of the screen, it might take a sneak peek to see what
//! is already happening"). With character.peek on, the character rests mostly past the edge of the screen it lives on, with
//! a sliver of it showing. It peeks in about half way when something happens, comes fully in when the pointer reaches it,
//! and every few minutes while nothing happens it may take a short curious peek (character.peekIdle).
//!
//! Two pure parts, both tested here:
//! - the geometry (`frame`): where the window is for each pose, on each edge and display, never onto another display and
//!   never over the menu bar or the Dock;
//! - the timing (`Peeker`): which pose it should be in now, from what the engine and the shell said, the pointer and the time.
//!
//! main.rs moves the window through the one frame helper (`set_frame_moving`) and tells the character's page the pose, so
//! it can lean toward the screen (dock.tsx `data-peek`).
//!
//! Rule 5: the light shows first. While it listens or looks at the screen the character is always fully in view, and main.rs
//! brings it in at once (no motion) before the microphone opens or the screen is read.
use crate::docking::{self, Edge, Rect, Screen};
use serde_json::Value;
use std::collections::BTreeSet;

/// Where the character's body (its drawing, 112 by 80) sits inside its 160 by 160 window: centred across, the body and its
/// one line of words centred down (style.css `.dock`, `.character`). What is shown or hidden is counted on the body, not
/// the see through margin around it.
pub const BODY: Rect = [24.0, 28.0, 112.0, 80.0];
/// How much of the body shows at rest: about a quarter (three quarters hidden past the edge).
pub const REST_SHOWN: f64 = 0.25;
/// How much shows during a peek: about half.
pub const PEEK_SHOWN: f64 = 0.5;
/// The least of the body that is ever left on screen, in points, so the sliver is always something to point at and click.
pub const MIN_SHOWN: f64 = 10.0;
/// Within this many points of each other, two edges are the same edge (display sizes are whole points, a work area may not be).
const SAME: f64 = 1.0;

/// What the character is doing about the edge: resting mostly past it, peeking about half way in, or fully in view (its
/// usual place, docking.rs `place`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pose { Hidden, Peek, In }
impl Pose {
    /// The word the character's page is told (dock.tsx `data-peek`).
    pub fn word(self) -> &'static str { match self { Pose::Hidden => "hidden", Pose::Peek => "peek", Pose::In => "in" } }
    /// The part of the body that shows.
    pub fn shown(self) -> f64 { match self { Pose::Hidden => REST_SHOWN, Pose::Peek => PEEK_SHOWN, Pose::In => 1.0 } }
}

/// Whether the character may go past `edge` of `s` at all. Only where the work area reaches the display's own edge: past
/// the top there is always the menu bar (and on a notched Mac, the notch), past a side or the bottom there may be the Dock,
/// and the character never covers either. A display that has the Dock hidden, or the Dock on another side, lets it hide.
pub fn may_hide(s: &Screen, edge: Edge) -> bool {
    let (f, w) = (s.frame, s.work);
    match edge {
        Edge::Left => (w[0] - f[0]).abs() < SAME,
        Edge::Right => ((w[0] + w[2]) - (f[0] + f[2])).abs() < SAME,
        Edge::Top => (w[1] - f[1]).abs() < SAME,
        Edge::Bottom => ((w[1] + w[3]) - (f[1] + f[3])).abs() < SAME,
    }
}

/// The window's frame (top left points) for `pose`, from `home` (its usual place on `s`, docking.rs `place`, flush with
/// `edge`). Fully in is `home` itself. Otherwise the window slides straight out past the display's edge until only
/// `pose.shown()` of the body is left on screen (never less than MIN_SHOWN points), along the edge exactly where it was.
/// It stays at `home` instead when it may not hide past that edge (`may_hide`), when any part of it would then be on
/// another display (`others`: every display, this one included, is fine to pass), or when it would reach the island's clear
/// zone at the top centre.
pub fn frame(home: Rect, edge: Edge, s: &Screen, others: &[Screen], pose: Pose) -> Rect {
    if pose == Pose::In || !may_hide(s, edge) { return home; }
    let f = s.frame;
    let along = |len: f64| (pose.shown() * len).max(MIN_SHOWN).min(len);
    let mut r = home;
    match edge {
        Edge::Right => r[0] = (f[0] + f[2] - BODY[0] - along(BODY[2])).max(home[0]),
        Edge::Left => r[0] = (f[0] + along(BODY[2]) - BODY[0] - BODY[2]).min(home[0]),
        Edge::Bottom => r[1] = (f[1] + f[3] - BODY[1] - along(BODY[3])).max(home[1]),
        Edge::Top => r[1] = (f[1] + along(BODY[3]) - BODY[1] - BODY[3]).min(home[1]),
    }
    let onto_another = others.iter().any(|o| o.id != s.id && docking::overlaps(r, o.frame));
    if onto_another || docking::overlaps(r, docking::notch_zone(s)) { return home; }
    r
}

/// How many points of the body are on `s` when the window is at `r`: the hit target that is left.
#[cfg_attr(not(test), allow(dead_code))]   // checked by the tests
pub fn body_on_screen(r: Rect, s: &Screen) -> (f64, f64) {
    let (bx, by) = (r[0] + BODY[0], r[1] + BODY[1]);
    let w = ((bx + BODY[2]).min(s.frame[0] + s.frame[2]) - bx.max(s.frame[0])).max(0.0);
    let h = ((by + BODY[3]).min(s.frame[1] + s.frame[3]) - by.max(s.frame[1])).max(0.0);
    (w, h)
}

/// The motion between two poses: a short spring (`SPRING`), or None for at once. Always at once with Reduce motion or Less
/// motion (`calm`), and always at once when coming fully in for a light (`light`: rule 5, the person must see it before
/// anything is heard or read).
pub fn motion(from: Pose, to: Pose, calm: bool, light: bool) -> Option<f64> {
    if calm || from == to || (light && to == Pose::In) { return None; }
    Some(if to == Pose::In { IN_SECS } else { OUT_SECS })
}
/// Coming in is quick; going back out is a little slower.
pub const IN_SECS: f64 = 0.32;
pub const OUT_SECS: f64 = 0.45;
/// The curve of a move (a CAMediaTimingFunction's control points): it overshoots a little and settles, like a spring.
pub const SPRING: [f32; 4] = [0.34, 1.45, 0.64, 1.0];

/// How long a peek lasts when something happens.
pub const PEEK_MS: u64 = 3_000;
/// How long it stays fully in after the pointer leaves it.
pub const LEAVE_MS: u64 = 3_000;
/// A curious peek while idle: how long it lasts, and how far apart (never closer than IDLE_MIN_MS, the founder's "every
/// few minutes": 3 to 7 minutes apart, chosen afresh each time).
pub const IDLE_PEEK_MS: u64 = 1_800;
pub const IDLE_MIN_MS: u64 = 180_000;
pub const IDLE_SPREAD_MS: u64 = 240_000;

/// The wait before the next curious peek, from a seed (the time it is chosen): IDLE_MIN_MS to IDLE_MIN_MS + IDLE_SPREAD_MS.
pub fn idle_wait(seed: u64) -> u64 {
    // splitmix64: spreads one number evenly, so waits look chosen at random, and a test can repeat them.
    let mut z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    IDLE_MIN_MS + z % IDLE_SPREAD_MS
}

/// What one engine or shell event means for peeking (runner events, protocol/index.ts).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum News {
    /// Something happened worth a look: a task started or finished, a check ran.
    Happened,
    /// An agent waits for the person (agent.state needsYou), or no longer does.
    AgentWaits(String, bool),
    /// A question for the person (approval.request), or its answer (approval.resolved).
    Asked(String, bool),
    /// The microphone is listening (hold to talk), or no longer.
    Listening(bool),
    /// The screen is being looked at (Show me, Point at the problem), or no longer.
    Looking(bool),
    /// Stop everything: nothing waits, nothing listens or looks any more.
    StopAll,
}

/// The news in one event. Only the event's type, its state or stage, and an id are read, never words.
pub fn news_of(v: &Value) -> Vec<News> {
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    match s("type").as_str() {
        "agent.state" => {
            let (agent, state) = (s("agent"), s("state"));
            let mut out = vec![News::AgentWaits(agent, state == "needsYou")];
            if matches!(state.as_str(), "working" | "checking" | "done" | "error") { out.push(News::Happened); }
            out
        }
        "approval.request" => vec![News::Asked(s("approval"), true)],
        "approval.resolved" => vec![News::Asked(s("approval"), false)],
        "app.voice" => vec![News::Listening(s("stage") == "listening")],
        "app.showme" => vec![News::Looking(s("stage") == "looking")],
        "app.stop_everything" => vec![News::StopAll],
        "receipt" | "drive.done" | "ship.status" => vec![News::Happened],
        _ => vec![],
    }
}

/// What the timing needs to know besides the events.
#[derive(Clone, Copy, Debug)]
pub struct Now {
    pub now: u64,
    /// character.peek: off, the character is always fully in, as before the setting.
    pub on: bool,
    /// character.peekIdle: the curious peeks while nothing happens.
    pub idle_on: bool,
    /// Reduce motion (the Mac) or Less motion (character.motion): no curious peeks, and every move is at once.
    pub calm: bool,
    /// The character is at its place on the edge: not beside a window (roam.rs), not being dragged.
    pub at_home: bool,
}

/// The timing: which pose the character should be in now. Fed the events (`hear`), the pointer (`pointer`) and asked
/// each tick (`pose`).
#[derive(Clone, Debug, Default)]
pub struct Peeker {
    waiting_agents: BTreeSet<String>,
    questions: BTreeSet<String>,
    listening: bool,
    looking: bool,
    over: bool,
    left_at: Option<u64>,
    peek_until: u64,
    idle_until: u64,
    next_idle: Option<u64>,
}

impl Peeker {
    pub const fn new() -> Self {
        Peeker { waiting_agents: BTreeSet::new(), questions: BTreeSet::new(), listening: false, looking: false, over: false, left_at: None, peek_until: 0, idle_until: 0, next_idle: None }
    }

    /// Something needs the person: a question or an agent waiting on them. It stays in view until answered.
    pub fn needs_you(&self) -> bool { !self.questions.is_empty() || !self.waiting_agents.is_empty() }
    /// A light is on: it listens or looks at the screen (rule 5).
    pub fn light(&self) -> bool { self.listening || self.looking }

    /// One event. `quiet` (presentation mode or a call, rule 7) is asked only when the event would make it peek: then it does
    /// not. What needs the person and the lights always count. True when a light just came on: main.rs brings the character
    /// in at once, before anything is heard or read.
    pub fn hear(&mut self, v: &Value, now: u64, quiet: impl FnOnce() -> bool) -> bool {
        let was_light = self.light();
        let mut quiet = Some(quiet);
        for n in news_of(v) {
            match n {
                News::Happened => {
                    if quiet.take().is_some_and(|q| !q()) {
                        self.peek_until = now + PEEK_MS;
                        // It has just been seen: the next curious peek is at least a few minutes from now.
                        self.idle_after(now);
                    }
                }
                News::AgentWaits(a, on) => { if on { self.waiting_agents.insert(a); } else { self.waiting_agents.remove(&a); } }
                News::Asked(id, on) => { if on { self.questions.insert(id); } else { self.questions.remove(&id); } }
                News::Listening(on) => self.listening = on,
                News::Looking(on) => self.looking = on,
                News::StopAll => { self.waiting_agents.clear(); self.questions.clear(); self.listening = false; self.looking = false; self.peek_until = 0; self.idle_until = 0; }
            }
        }
        !was_light && self.light()
    }

    /// The pointer came onto the character (or its sliver), or left it.
    pub fn pointer(&mut self, over: bool, now: u64) {
        if self.over && !over { self.left_at = Some(now); }
        if over { self.left_at = None; }
        self.over = over;
    }

    fn idle_after(&mut self, now: u64) {
        let soonest = now + IDLE_MIN_MS;
        if self.next_idle.is_none_or(|t| t < soonest) { self.next_idle = Some(now + idle_wait(now)); }
    }

    /// The pose now. `quiet` (presentation mode or a call) is asked only when a curious peek is due.
    pub fn pose(&mut self, n: &Now, quiet: impl FnOnce() -> bool) -> Pose {
        if !n.on || !n.at_home { return Pose::In; }
        if self.light() || self.needs_you() || self.over { return Pose::In; }
        if self.left_at.is_some_and(|t| n.now < t + LEAVE_MS) { return Pose::In; }
        if n.now < self.peek_until || n.now < self.idle_until { return Pose::Peek; }
        // A curious peek, when one is due: never with less motion, never during a presentation or a call. Either way the
        // next one is chosen afresh.
        match self.next_idle {
            None => self.next_idle = Some(n.now + idle_wait(n.now)),
            Some(t) if n.now >= t => {
                self.next_idle = Some(n.now + idle_wait(n.now));
                if n.idle_on && !n.calm && !quiet() {
                    self.idle_until = n.now + IDLE_PEEK_MS;
                    return Pose::Peek;
                }
            }
            _ => {}
        }
        Pose::Hidden
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::docking::{place, Edge};
    use crate::island::{HomeSize, Notch};
    use serde_json::json;

    const DOCK: (f64, f64) = (160.0, 160.0);
    fn screen(id: &str, frame: Rect, work: Rect, notch: Option<Notch>) -> Screen { Screen { id: id.into(), frame, work, primary: frame[0] == 0.0 && frame[1] == 0.0, notch } }
    /// A MacBook with a notch and the Dock hidden: the menu bar is the only thing the work area leaves out.
    fn mac() -> Screen { screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [0.0, 38.0, 1512.0, 944.0], Some(Notch { x: 661.0, w: 190.0, h: 38.0 })) }
    /// The same Mac with the Dock showing at the bottom.
    fn mac_dock_bottom() -> Screen { screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [0.0, 38.0, 1512.0, 870.0], Some(Notch { x: 661.0, w: 190.0, h: 38.0 })) }
    /// A display to the right of the Mac, with the Dock on its own right side.
    fn right_of_mac() -> Screen { screen("1920x1080@1512,0", [1512.0, 0.0, 1920.0, 1080.0], [1512.0, 25.0, 1850.0, 1055.0], None) }
    fn home(s: &Screen, e: Edge) -> Rect { place(s, DOCK, e, 0.5, HomeSize::STANDARD) }
    fn shown(r: Rect, s: &Screen, e: Edge) -> f64 { let (w, h) = body_on_screen(r, s); if matches!(e, Edge::Left | Edge::Right) { w } else { h } }

    // ---- the geometry ----

    #[test]
    fn at_rest_about_three_quarters_of_the_body_is_past_the_right_edge_and_a_peek_shows_about_half() {
        let s = mac();
        let h = home(&s, Edge::Right);
        let rest = frame(h, Edge::Right, &s, &[s.clone()], Pose::Hidden);
        assert_eq!(rest[1], h[1], "along the edge it stays exactly where it was");
        assert_eq!((rest[2], rest[3]), (160.0, 160.0));
        assert_eq!(shown(rest, &s, Edge::Right), 28.0, "a quarter of 112");
        let peek = frame(h, Edge::Right, &s, &[s.clone()], Pose::Peek);
        assert_eq!(shown(peek, &s, Edge::Right), 56.0, "half of 112");
        assert_eq!(frame(h, Edge::Right, &s, &[s.clone()], Pose::In), h, "fully in is its usual place");
        assert_eq!(shown(h, &s, Edge::Right), 112.0);
        assert!(rest[0] > peek[0] && peek[0] > h[0], "rest, peek and in, each further into the screen");
    }

    #[test]
    fn the_left_edge_and_the_bottom_with_the_dock_hidden_hide_the_same_way() {
        let s = mac();
        for e in [Edge::Left, Edge::Bottom] {
            let h = home(&s, e);
            let rest = frame(h, e, &s, &[s.clone()], Pose::Hidden);
            let peek = frame(h, e, &s, &[s.clone()], Pose::Peek);
            let len = if e == Edge::Left { 112.0 } else { 80.0 };
            assert_eq!(shown(rest, &s, e), len * REST_SHOWN, "{e:?}");
            assert_eq!(shown(peek, &s, e), len * PEEK_SHOWN, "{e:?}");
            if e == Edge::Left { assert_eq!(rest[1], h[1]); assert!(rest[0] < 0.0); } else { assert_eq!(rest[0], h[0]); assert!(rest[1] + rest[3] > 982.0); }
        }
    }

    #[test]
    fn the_sliver_is_always_at_least_ten_points_of_the_body_on_every_edge_and_pose() {
        // A top edge with no menu bar (a display where it hides), to reach every edge.
        let bare = screen("800x600@0,0", [0.0, 0.0, 800.0, 600.0], [0.0, 0.0, 800.0, 600.0], None);
        for e in [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom] {
            for p in [Pose::Hidden, Pose::Peek, Pose::In] {
                let h = home(&bare, e);
                let r = frame(h, e, &bare, &[bare.clone()], p);
                let (w, ht) = body_on_screen(r, &bare);
                assert!(w >= MIN_SHOWN && ht >= MIN_SHOWN, "{e:?} {p:?}: {w} by {ht}");
            }
        }
    }

    #[test]
    fn it_never_hides_under_the_menu_bar_or_the_notch_or_over_the_dock() {
        // The top of a notched Mac: the menu bar and the notch are there, so it stays fully in.
        let s = mac();
        let h = home(&s, Edge::Top);
        for p in [Pose::Hidden, Pose::Peek] { assert_eq!(frame(h, Edge::Top, &s, &[s.clone()], p), h, "{p:?}"); }
        assert!(!may_hide(&s, Edge::Top));
        // The Dock showing at the bottom: the bottom edge stays in, the sides still hide.
        let d = mac_dock_bottom();
        assert!(!may_hide(&d, Edge::Bottom) && may_hide(&d, Edge::Right) && may_hide(&d, Edge::Left));
        let hb = home(&d, Edge::Bottom);
        assert_eq!(frame(hb, Edge::Bottom, &d, &[d.clone()], Pose::Hidden), hb);
        // The Dock on the right of the other display: its right edge stays in.
        let r = right_of_mac();
        assert!(!may_hide(&r, Edge::Right));
        // A hidden top edge with a notch is still kept out of the island's clear zone.
        let no_menu = screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [0.0, 0.0, 1512.0, 982.0], Some(Notch { x: 661.0, w: 190.0, h: 38.0 }));
        for pct in [0.0, 0.3, 0.5, 0.7, 1.0] {
            let h = place(&no_menu, DOCK, Edge::Top, pct, HomeSize::STANDARD);
            let r = frame(h, Edge::Top, &no_menu, &[no_menu.clone()], Pose::Hidden);
            assert!(!docking::overlaps(r, docking::notch_zone(&no_menu)), "{pct}: {r:?}");
        }
    }

    #[test]
    fn it_never_peeks_onto_another_display() {
        let (m, x) = (mac(), right_of_mac());
        let both = [m.clone(), x.clone()];
        // The Mac's right edge touches the display to its right: hiding there would show it on that display.
        let h = home(&m, Edge::Right);
        for p in [Pose::Hidden, Pose::Peek] { assert_eq!(frame(h, Edge::Right, &m, &both, p), h, "{p:?}"); }
        // The other edges have nothing beyond them, so it hides there.
        let hl = home(&m, Edge::Left);
        assert_ne!(frame(hl, Edge::Left, &m, &both, Pose::Hidden), hl);
        // The display on the right: its left edge touches the Mac.
        let hx = home(&x, Edge::Left);
        assert_eq!(frame(hx, Edge::Left, &x, &both, Pose::Hidden), hx);
        // A display above another (stacked): the top of the lower one hides into nothing only if nothing is there.
        let lower = screen("1920x1080@0,982", [0.0, 982.0, 1920.0, 1080.0], [0.0, 982.0, 1920.0, 1080.0], None);
        let hb = home(&m, Edge::Bottom);
        assert_eq!(frame(hb, Edge::Bottom, &m, &[m.clone(), lower.clone()], Pose::Hidden), hb, "the Mac's bottom touches the display below");
        assert_ne!(frame(hb, Edge::Bottom, &m, &[m.clone()], Pose::Hidden), hb);
    }

    #[test]
    fn it_works_on_a_display_that_does_not_start_at_zero() {
        let mut x = right_of_mac();
        x.work = x.frame;   // the Dock hidden
        let h = home(&x, Edge::Right);
        let r = frame(h, Edge::Right, &x, &[x.clone()], Pose::Hidden);
        assert_eq!(shown(r, &x, Edge::Right), 28.0);
        assert_eq!(r[0], 1512.0 + 1920.0 - 24.0 - 28.0);
        let l = frame(home(&x, Edge::Left), Edge::Left, &x, &[x.clone()], Pose::Hidden);
        assert_eq!(shown(l, &x, Edge::Left), 28.0);
    }

    #[test]
    fn coming_in_for_a_light_is_at_once_and_reduced_motion_is_always_at_once() {
        assert_eq!(motion(Pose::Hidden, Pose::In, false, false), Some(IN_SECS));
        assert_eq!(motion(Pose::In, Pose::Hidden, false, false), Some(OUT_SECS));
        assert_eq!(motion(Pose::Hidden, Pose::Peek, false, false), Some(OUT_SECS));
        assert_eq!(motion(Pose::Hidden, Pose::In, false, true), None, "rule 5: the light is there before anything is heard or read");
        for (a, b) in [(Pose::Hidden, Pose::In), (Pose::In, Pose::Hidden), (Pose::Hidden, Pose::Peek)] { assert_eq!(motion(a, b, true, false), None); }
        assert_eq!(motion(Pose::In, Pose::In, false, false), None);
        // The spring overshoots a little and settles.
        assert!(SPRING[1] > 1.0 && SPRING[3] == 1.0);
    }

    // ---- the timing ----

    fn now(t: u64) -> Now { Now { now: t, on: true, idle_on: true, calm: false, at_home: true } }
    const LOUD: fn() -> bool = || false;
    fn state(agent: &str, s: &str) -> Value { json!({ "type": "agent.state", "agent": agent, "state": s }) }

    #[test]
    fn it_rests_hidden_and_is_always_in_when_the_setting_is_off_or_it_is_away_from_its_place() {
        let mut p = Peeker::new();
        assert_eq!(p.pose(&now(1_000), LOUD), Pose::Hidden);
        assert_eq!(p.pose(&Now { on: false, ..now(1_000) }, LOUD), Pose::In, "off: as before the setting");
        assert_eq!(p.pose(&Now { at_home: false, ..now(1_000) }, LOUD), Pose::In, "beside a window or dragged: in view");
    }

    #[test]
    fn something_happening_makes_it_peek_for_a_few_seconds() {
        let mut p = Peeker::new();
        for (i, ev) in [state("builder-1", "working"), state("builder-1", "done"), state("builder-1", "error"), json!({ "type": "receipt" })].iter().enumerate() {
            let t = 10_000 * (i as u64 + 1);
            assert!(!p.hear(ev, t, LOUD));
            assert_eq!(p.pose(&now(t), LOUD), Pose::Peek, "{ev}");
            assert_eq!(p.pose(&now(t + PEEK_MS - 1), LOUD), Pose::Peek);
            assert_eq!(p.pose(&now(t + PEEK_MS), LOUD), Pose::Hidden);
        }
        // Idle and thinking are not news.
        let mut q = Peeker::new();
        q.hear(&state("a", "idle"), 5, LOUD);
        q.hear(&state("a", "thinking"), 5, LOUD);
        assert_eq!(q.pose(&now(6), LOUD), Pose::Hidden);
    }

    #[test]
    fn during_a_presentation_or_a_call_it_does_not_peek_but_what_needs_you_still_shows() {
        let mut p = Peeker::new();
        p.hear(&state("a", "working"), 100, || true);
        assert_eq!(p.pose(&now(200), || true), Pose::Hidden);
        p.hear(&json!({ "type": "approval.request", "approval": "ap1" }), 300, || true);
        assert_eq!(p.pose(&now(400), || true), Pose::In);
    }

    #[test]
    fn while_it_needs_you_it_stays_in_view_until_answered() {
        let mut p = Peeker::new();
        p.hear(&json!({ "type": "approval.request", "approval": "ap1" }), 0, LOUD);
        p.hear(&state("builder-1", "needsYou"), 0, LOUD);
        for t in [1_000, 60_000, 3_600_000] { assert_eq!(p.pose(&now(t), LOUD), Pose::In, "{t}"); }
        p.hear(&json!({ "type": "approval.resolved", "approval": "ap1" }), 3_600_000, LOUD);
        assert_eq!(p.pose(&now(3_600_001), LOUD), Pose::In, "the agent still waits");
        p.hear(&state("builder-1", "working"), 3_600_002, LOUD);
        assert_eq!(p.pose(&now(3_600_003), LOUD), Pose::Peek, "answered: it goes on working, and peeks");
        assert_eq!(p.pose(&now(3_600_003 + PEEK_MS), LOUD), Pose::Hidden);
        // Stop everything clears what waited.
        p.hear(&json!({ "type": "approval.request", "approval": "ap2" }), 4_000_000, LOUD);
        p.hear(&json!({ "type": "app.stop_everything" }), 4_000_001, LOUD);
        assert_ne!(p.pose(&now(4_000_002), LOUD), Pose::In, "nothing waits now (a curious peek may be due)");
    }

    #[test]
    fn listening_or_looking_brings_it_fully_in_and_says_so_the_moment_it_starts() {
        let mut p = Peeker::new();
        assert!(p.hear(&json!({ "type": "app.voice", "stage": "listening" }), 0, LOUD), "the light came on: in at once");
        assert!(!p.hear(&json!({ "type": "app.voice", "stage": "listening" }), 1, LOUD), "still on: nothing new");
        assert_eq!(p.pose(&now(100_000), LOUD), Pose::In);
        p.hear(&json!({ "type": "app.voice", "stage": "transcribing" }), 100_001, LOUD);
        assert_eq!(p.pose(&now(100_002), LOUD), Pose::Hidden);
        assert!(p.hear(&json!({ "type": "app.showme", "stage": "looking" }), 200_000, LOUD));
        // Even off the setting's way: with Reduce motion, and with the setting on, it is in.
        assert_eq!(p.pose(&Now { calm: true, ..now(200_001) }, LOUD), Pose::In);
        p.hear(&json!({ "type": "app.showme", "stage": "pointing" }), 200_002, LOUD);
        assert_eq!(p.pose(&now(200_003), LOUD), Pose::Hidden);
        // Quiet (a call) never keeps the light hidden.
        assert!(p.hear(&json!({ "type": "app.voice", "stage": "listening" }), 300_000, || true));
        assert_eq!(p.pose(&now(300_001), || true), Pose::In);
    }

    #[test]
    fn the_pointer_brings_it_in_and_it_goes_back_out_a_few_seconds_after_the_pointer_leaves() {
        let mut p = Peeker::new();
        p.pointer(true, 1_000);
        assert_eq!(p.pose(&now(1_000), LOUD), Pose::In);
        assert_eq!(p.pose(&now(500_000), LOUD), Pose::In, "as long as the pointer stays");
        p.pointer(false, 500_000);
        assert_eq!(p.pose(&now(500_000 + LEAVE_MS - 1), LOUD), Pose::In);
        assert_eq!(p.pose(&now(500_000 + LEAVE_MS), LOUD), Pose::Hidden);
        // Coming back before the wait is over keeps it in.
        p.pointer(true, 600_000);
        p.pointer(false, 600_100);
        p.pointer(true, 600_200);
        assert_eq!(p.pose(&now(610_000), LOUD), Pose::In);
        // Leaving while something needs the person: it stays.
        p.hear(&json!({ "type": "approval.request", "approval": "x" }), 610_000, LOUD);
        p.pointer(false, 610_000);
        assert_eq!(p.pose(&now(700_000), LOUD), Pose::In);
    }

    #[test]
    fn a_curious_peek_comes_every_few_minutes_never_closer_than_three() {
        for seed in [0, 1, 42, 1_761_000_000_000, u64::MAX / 3] {
            let w = idle_wait(seed);
            assert!((IDLE_MIN_MS..IDLE_MIN_MS + IDLE_SPREAD_MS).contains(&w), "{w}");
        }
        assert_eq!(IDLE_MIN_MS, 180_000, "never more often than every 3 minutes");
        let mut p = Peeker::new();
        let mut peeks = vec![];
        let mut t = 0;
        let mut was = Pose::Hidden;
        while t < 3_600_000 {
            let now_pose = p.pose(&now(t), LOUD);
            if now_pose == Pose::Peek && was != Pose::Peek { peeks.push(t); }
            was = now_pose;
            t += 500;
        }
        assert!(peeks.len() >= 8 && peeks.len() <= 20, "{peeks:?}");
        for w in peeks.windows(2) { assert!(w[1] - w[0] >= IDLE_MIN_MS, "{peeks:?}"); }
    }

    #[test]
    fn no_curious_peek_with_less_motion_the_setting_off_or_a_call_and_none_right_after_a_real_one() {
        let run = |n: &dyn Fn(u64) -> Now, quiet: bool| {
            let mut p = Peeker::new();
            (0..7_200).map(|i| i * 500).filter(|t| p.pose(&n(*t), || quiet) == Pose::Peek).count()
        };
        assert_eq!(run(&|t| Now { calm: true, ..now(t) }, false), 0);
        assert_eq!(run(&|t| Now { idle_on: false, ..now(t) }, false), 0);
        assert_eq!(run(&|t| now(t), true), 0, "presentation mode or a call");
        assert!(run(&|t| now(t), false) > 0);
        // A real peek pushes the next curious one at least three minutes away.
        let mut p = Peeker::new();
        p.pose(&now(0), LOUD);
        p.hear(&state("a", "done"), 1_000, LOUD);
        let first_idle = (2..2_000).map(|i| 1_000 + PEEK_MS + i * 500).find(|t| p.pose(&now(*t), LOUD) == Pose::Peek).unwrap();
        assert!(first_idle >= 1_000 + IDLE_MIN_MS, "{first_idle}");
    }

    #[test]
    fn only_the_type_state_stage_and_id_of_an_event_are_read() {
        assert_eq!(news_of(&json!({ "type": "agent.state", "agent": "a", "state": "needsYou" })), vec![News::AgentWaits("a".into(), true)]);
        assert_eq!(news_of(&json!({ "type": "agent.tool", "summary": "secret words" })), vec![]);
        assert_eq!(news_of(&json!({ "type": "approval.request", "approval": "x", "title": "Delete?" })), vec![News::Asked("x".into(), true)]);
        assert_eq!(news_of(&json!({ "type": "app.voice", "stage": "listening", "message": "Listening" })), vec![News::Listening(true)]);
        assert_eq!(news_of(&json!("not an object")), vec![]);
    }
}

/// How main.rs applies this (it needs a real Mac to see), read as text, the way the other shell modules check their wiring.
#[cfg(test)]
mod wiring {
    const MAIN: &str = include_str!("main.rs");
    fn body(name: &str) -> String {
        let at = MAIN.find(name).unwrap_or_else(|| panic!("{name} is missing"));
        MAIN[at..at + MAIN[at..].find("\n}\n").unwrap()].to_string()
    }

    #[test]
    fn every_event_and_stop_everything_reach_the_timing() {
        assert!(include_str!("runner.rs").contains("crate::peek_heard(app, &v);"), "every event the pages get (Runner::publish)");
        assert_eq!(MAIN.matches("peek_heard(app, &stop);").count(), 2, "Stop everything, from its key and from the menu");
        let heard = body("fn peek_heard(");
        assert!(heard.contains("peek::news_of(v).is_empty()") && heard.contains(".hear(v, now() as u64, quiet)"), "{heard}");
    }

    #[test]
    fn a_light_brings_it_in_at_once_before_the_microphone_or_the_screen() {
        // Listening and looking are said through Runner::publish (say_voice, say_showme), before the wait and the capture.
        assert!(body("fn say_voice(").contains("runner::Runner::publish(app, v);"));
        assert!(body("fn say_showme(").contains("runner::Runner::publish(app, v);"));
        let heard = body("fn peek_heard(");
        assert!(heard.contains("if lit { peek_now(app, true); }"), "{heard}");
        let now = body("fn peek_now(");
        assert!(now.contains("rx.recv_timeout(") && now.contains("peek_apply(&a, light)"), "the caller waits until it is in: {now}");
        // In for a light is at once (peek::motion), never a motion the person might not see yet.
        assert!(body("fn peek_apply(").contains("peek::motion(was, pose, calm, light)"));
    }

    #[test]
    fn it_moves_only_at_its_place_through_the_one_helper_and_never_takes_focus() {
        let apply = body("fn peek_apply(");
        assert!(apply.contains("if companion_hidden() { return; }"));
        assert!(apply.contains("roam_phase() == roam::Phase::Home && roamer().visit().is_none() && !dragging()"), "never beside a window or while dragged");
        assert!(apply.contains("peek::frame(home, edge, s, &list, pose)"));
        assert!(apply.contains("let calm = reduce_motion();"));
        for name in ["fn peek_apply(", "fn peek_tick(", "fn peek_now(", "fn peek_heard(", "fn dock_hover_changed("] {
            let b = body(name);
            for bad in ["makeKey", "orderFront", "set_focus", "activate", ".show("] { assert!(!b.contains(bad), "{name} must not {bad}"); }
        }
        // The character's place and its trips go through the same helper, so a peek still moving never ends on an old target.
        assert!(body("fn apply_dock(").contains("set_frame_moving(d, to_appkit(f, ph), None, None, &DOCK_MOVES)"));
        assert!(body("fn apply_dock(").contains("peek_placed();"));
        assert!(body("fn roam_set(").contains("set_frame_moving(d, to_appkit(r, ph), None, None, &DOCK_MOVES)"));
        assert!(body("fn set_frame_moving(").contains("let spring = secs.is_some() && std::ptr::eq(moves, &DOCK_MOVES);"));
    }

    #[test]
    fn the_pointer_and_the_setting_are_read_where_they_matter() {
        // The tracking area on the character's window, and each tick (the pointer's place only).
        assert!(MAIN.contains("add_dock_hover_tracking(mtm, &dock);"));
        assert!(MAIN.contains("fn mouse_entered(&self, _event: &NSEvent) { super::dock_hover_changed(true); }"));
        assert!(body("fn tick(").contains("peek_tick(app);"));
        let tick = body("fn peek_tick(");
        assert!(tick.contains("macos_see::pointer()") && tick.contains("peek_apply(app, false)"));
        // Turned on or off in Settings: applied at once.
        assert!(body("fn home_setting_applied(").contains("\"character.peek\" | \"character.peekIdle\""));
    }
}
