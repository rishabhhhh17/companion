//! Where the character lives (F18 item 2): any edge of a display's work area (never under the menu bar or the Dock),
//! a position along it whose two ends are the corners, remembered per display, kept out of a clear zone at the top
//! centre (the notch island, F18 item 1), and moved back on screen when the displays change. Geometry is in points
//! with a top left origin. The pure functions are tested.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use crate::island;

pub type Rect = [f64; 4]; // x, y, width, height

/// Which edge of the work area. With the position along it (0 to 1) the two ends are the corners, so a corner is
/// Left 0 or Top 0 (top left), Right 0 or Top 1 (top right), Left 1 or Bottom 0, Right 1 or Bottom 1.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Edge { Left, Right, Top, Bottom }
impl Edge {
    /// The word dock.json and Settings use (character.edge).
    pub fn word(self) -> &'static str { match self { Edge::Left => "left", Edge::Right => "right", Edge::Top => "top", Edge::Bottom => "bottom" } }
    pub fn of(word: &str) -> Option<Edge> { match word { "left" => Some(Edge::Left), "right" => Some(Edge::Right), "top" => Some(Edge::Top), "bottom" => Some(Edge::Bottom), _ => None } }
}

/// A display: its frame and work area (top left points), whether it is the primary one, and its camera housing if it has
/// one (read from macOS, island.rs `notch_from`). The island in the notch reads the same type (island.rs `Display`).
#[derive(Clone, Debug, PartialEq)]
pub struct Screen { pub id: String, pub frame: Rect, pub work: Rect, pub primary: bool, pub notch: Option<crate::island::Notch> }

/// Saved choices (`dock.json`): the display used last, per display which edge and where along it (0 is the top or
/// left end, 1 the bottom or right end), the "Come to what it is about" switch (on unless turned off), and "Same place on
/// every display" (off unless turned on: then the place copied when it was turned on, or set in Settings since, for every
/// display with no place of its own yet).
/// A file saved before F18 (left or right with a height) reads back unchanged: the height along a side edge is the
/// position along it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Prefs {
    pub last_screen: String,
    pub per_screen: BTreeMap<String, (Edge, f64)>,
    #[serde(default = "on")]
    pub come_to: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub same_everywhere: Option<(Edge, f64)>,
    /// M37 (the founder: "make sure the water can go anywhere in the display"): a display where it was let go away from
    /// every edge, with where (0 to 1 across and down the room it has inside the work area). It stays there instead of
    /// snapping to an edge. A drop near an edge, or a change of edge or position in Settings, takes it back to an edge.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub free: BTreeMap<String, (f64, f64)>,
}
fn on() -> bool { true }
impl Default for Prefs { fn default() -> Self { Prefs { last_screen: String::new(), per_screen: BTreeMap::new(), come_to: true, same_everywhere: None, free: BTreeMap::new() } } }

impl Prefs {
    /// Reads `dock.json`. Never loses more than it must: an entry that cannot be read (an edge this version does not
    /// know, a position that is not a number) drops only itself, a position out of range is pulled back to the nearest
    /// end, and anything that is not a clear `false` leaves "Come to what it is about" on.
    pub fn from_text(text: Option<&str>) -> Prefs {
        let v: Value = text.and_then(|t| serde_json::from_str(t).ok()).unwrap_or(Value::Null);
        let mut p = Prefs::default();
        if let Some(s) = v.get("last_screen").and_then(Value::as_str) { p.last_screen = s.to_string(); }
        if let Some(m) = v.get("per_screen").and_then(Value::as_object) {
            for (id, entry) in m {
                let Ok((edge, pct)) = serde_json::from_value::<(Edge, f64)>(entry.clone()) else { continue };
                if pct.is_finite() { p.per_screen.insert(id.clone(), (edge, pct.clamp(0.0, 1.0))); }
            }
        }
        p.come_to = v.get("come_to").and_then(Value::as_bool) != Some(false);
        // Anything that is not a place leaves "Same place on every display" off.
        if let Some(m) = v.get("free").and_then(Value::as_object) {
            for (id, entry) in m {
                let Ok((fx, fy)) = serde_json::from_value::<(f64, f64)>(entry.clone()) else { continue };
                if fx.is_finite() && fy.is_finite() { p.free.insert(id.clone(), (fx.clamp(0.0, 1.0), fy.clamp(0.0, 1.0))); }
            }
        }
        p.same_everywhere = v.get("same_everywhere").and_then(|e| serde_json::from_value::<(Edge, f64)>(e.clone()).ok()).filter(|(_, pct)| pct.is_finite()).map(|(e, pct)| (e, pct.clamp(0.0, 1.0)));
        p
    }
}

/// The clear zone at the top centre of a display, left for the island in the notch (F18 item 1, island.rs): the width
/// of a notch (about 190 points on a MacBook) plus a margin each side, from the very top down past the menu bar. Kept
/// the same on displays without a notch, where the island is a pill (or a thin line) in the same place, and on every
/// display, since the island moves to the display the person uses. It always holds the island at its biggest (opened
/// downward with the status, island.rs `island_frame`) with CLEAR_MARGIN around it, should a notch read wider or off
/// centre; for every real display the fixed numbers already hold it. Trips beside a window keep clear of this zone.
pub const NOTCH_CLEAR: (f64, f64) = (420.0, 280.0);   // the hover panel at its tallest, with CLEAR_MARGIN (island.rs PANEL_W, PANEL_MAX; 27 Oct 2026)
pub fn notch_zone(s: &Screen) -> Rect {
    let (w, depth) = NOTCH_CLEAR;
    let below_menu = (s.work[1] - s.frame[1]).max(0.0);
    let fixed = [s.frame[0] + s.frame[2] / 2.0 - w / 2.0, s.frame[1], w, below_menu + depth];
    union(fixed, widen(island::island_frame(s, island::Mode::Peek), CLEAR_MARGIN))
}

/// Room kept between the character and the island or Home: the gap the card keeps from the character.
pub const CLEAR_MARGIN: f64 = 8.0;

/// Where Home reaches at its widest and tallest, with CLEAR_MARGIN around it: Home drops down from the island, centred
/// under it and inside the work area (island.rs `home_frame`), at the size in force (`home`: as wide as it is and as tall
/// as it grows). Taken from the very top of the display, so with the island it makes one column.
pub fn home_zone(s: &Screen, home: island::HomeSize) -> Rect {
    let h = island::home_frame(s, (home.w, home.max_h));
    widen([h[0], s.frame[1], h[2], h[1] + h[3] - s.frame[1]], CLEAR_MARGIN)
}

/// What the character's own place keeps clear of: the island at its biggest and Home at its tallest. Home opens and
/// grows often (a click on the island or the character, the card hotkey, a result coming in), so the place is clear of
/// it all the time: Home never covers the character and the character never has to move out of its way. Trips beside a
/// window keep clear of the island always and of Home only while it is open (roam.rs, main.rs `card_room`), so a closed
/// Home costs them no room.
pub fn dock_zone(s: &Screen, home: island::HomeSize) -> Rect { union(notch_zone(s), home_zone(s, home)) }

/// The smallest rectangle holding both.
fn union(a: Rect, b: Rect) -> Rect {
    let (x0, y0) = (a[0].min(b[0]), a[1].min(b[1]));
    [x0, y0, (a[0] + a[2]).max(b[0] + b[2]) - x0, (a[1] + a[3]).max(b[1] + b[3]) - y0]
}
/// `r` with `m` more on its left, its right and below it (not above: the island and Home hang from the top).
fn widen(r: Rect, m: f64) -> Rect { [r[0] - m, r[1], r[2] + 2.0 * m, r[3] + m] }

/// True when two rectangles share any area (touching edges do not count).
pub fn overlaps(a: Rect, b: Rect) -> bool { a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3] }

/// A saved position that is not a number (it never should be) puts the character in the middle of its edge.
fn along(pct: f64) -> f64 { if pct.is_finite() { pct.clamp(0.0, 1.0) } else { 0.5 } }

/// Side edges run top to bottom, the top and bottom edges left to right.
fn runs_across(edge: Edge) -> bool { matches!(edge, Edge::Top | Edge::Bottom) }

pub fn dock_frame(work: Rect, size: (f64, f64), edge: Edge, pct: f64) -> Rect {
    let free_x = (work[2] - size.0).max(0.0);
    let free_y = (work[3] - size.1).max(0.0);
    match edge {
        Edge::Left => [work[0], work[1] + along(pct) * free_y, size.0, size.1],
        Edge::Right => [work[0] + work[2] - size.0, work[1] + along(pct) * free_y, size.0, size.1],
        Edge::Top => [work[0] + along(pct) * free_x, work[1], size.0, size.1],
        Edge::Bottom => [work[0] + along(pct) * free_x, work[1] + work[3] - size.1, size.0, size.1],
    }
}

/// The position along its edge that puts the character at `frame` (the inverse of `dock_frame`).
fn pct_of(work: Rect, size: (f64, f64), edge: Edge, frame: Rect) -> f64 {
    let (start, free, at) = if runs_across(edge) { (work[0], work[2] - size.0, frame[0]) } else { (work[1], work[3] - size.1, frame[1]) };
    if free <= 0.0 { 0.0 } else { ((at - start) / free).clamp(0.0, 1.0) }
}

/// Moves a character that would sit in the clear zone along its own edge, to the nearer side of the zone that still
/// fits in the work area. On a screen too small for either side it stays where it was put (inside the work area).
fn clear_of_zone(f: Rect, zone: Rect, work: Rect, edge: Edge) -> Rect {
    if !overlaps(f, zone) { return f; }
    let (lo, hi, at, len, z0, zlen) = if runs_across(edge) { (work[0], work[0] + work[2] - f[2], f[0], f[2], zone[0], zone[2]) } else { (work[1], work[1] + work[3] - f[3], f[1], f[3], zone[1], zone[3]) };
    let best = [z0 - len, z0 + zlen].into_iter().filter(|p| *p >= lo - 0.01 && *p <= hi + 0.01)
        .min_by(|a, b| (a - at).abs().total_cmp(&(b - at).abs()));
    match best {
        Some(p) if runs_across(edge) => [p, f[1], f[2], f[3]],
        Some(p) => [f[0], p, f[2], f[3]],
        None => f,
    }
}

/// Where the character sits on a display: on its edge at its position, inside the work area, out of the island's zone
/// and Home's drop down area at Home's size in force (`dock_zone`).
pub fn place(s: &Screen, size: (f64, f64), edge: Edge, pct: f64, home: island::HomeSize) -> Rect {
    clear_of_zone(dock_frame(s.work, size, edge, pct), dock_zone(s, home), s.work, edge)
}

/// The card sits beside the character, on the side facing into the screen, and is kept inside the work area: beside a
/// character on a side edge with its top level with the character's top, below one on the top edge, above one on the
/// bottom edge, with its left side level with the character's. Since F18 Home drops down from the island in the notch
/// instead (island.rs `card_spot`); this is used only when no display is known for the island.
pub fn card_frame(dock: Rect, card: (f64, f64), work: Rect, edge: Edge) -> Rect {
    let gap = 8.0;
    let (x, y) = match edge {
        Edge::Right => (dock[0] - card.0 - gap, dock[1]),
        Edge::Left => (dock[0] + dock[2] + gap, dock[1]),
        Edge::Top => (dock[0], dock[1] + dock[3] + gap),
        Edge::Bottom => (dock[0], dock[1] - card.1 - gap),
    };
    let x = x.clamp(work[0], (work[0] + work[2] - card.0).max(work[0]));
    let y = y.clamp(work[1], (work[1] + work[3] - card.1).max(work[1]));
    [x, y, card.0, card.1]
}

/// How close to a corner (in points from both edges) the pointer must be for the character to go exactly into it.
pub const CORNER_REACH: f64 = 140.0;

/// Dragging snaps to the nearest of the four edges, at the pointer's place along it; near a corner, exactly into the
/// corner. What is returned places the character where it is shown (out of the clear zone), so what is saved is what
/// the person saw when they let go.
pub fn snap_on(s: &Screen, size: (f64, f64), cursor_x: f64, cursor_y: f64, home: island::HomeSize) -> (Edge, f64) {
    let w = s.work;
    let x = cursor_x.clamp(w[0], w[0] + w[2]);
    let y = cursor_y.clamp(w[1], w[1] + w[3]);
    let (dl, dr, dt, db) = (x - w[0], w[0] + w[2] - x, y - w[1], w[1] + w[3] - y);
    // The nearest edge; a tie goes to a side edge, as before F18.
    let edge = [(Edge::Left, dl), (Edge::Right, dr), (Edge::Top, dt), (Edge::Bottom, db)].into_iter()
        .min_by(|a, b| a.1.total_cmp(&b.1)).map(|(e, _)| e).unwrap_or(Edge::Right);
    let free = |len: f64, sz: f64| (len - sz).max(1.0);
    let mut pct = if runs_across(edge) { (x - size.0 / 2.0 - w[0]) / free(w[2], size.0) } else { (y - size.1 / 2.0 - w[1]) / free(w[3], size.1) };
    // Near a corner it goes exactly into it.
    let (near_l, near_r, near_t, near_b) = (dl < CORNER_REACH, dr < CORNER_REACH, dt < CORNER_REACH, db < CORNER_REACH);
    if (near_l || near_r) && (near_t || near_b) {
        pct = if runs_across(edge) { if near_l { 0.0 } else { 1.0 } } else if near_t { 0.0 } else { 1.0 };
    }
    let pct = along(pct);
    // What is shown, read back as a position, so it is saved out of the clear zone too.
    (edge, pct_of(w, size, edge, place(s, size, edge, pct, home)))
}

/// M37: how far from every edge (points) the pointer must let go for the character to stay where it is, not snap.
pub const FREE_REACH: f64 = 56.0;   // M41 (the founder: pulled out, it went back to the edge): a short pull is enough

/// Where a drag lets go, as a free place (0 to 1 across and down its room in the work area), or None when it is near an
/// edge and should snap to it (`snap_on`).
pub fn free_on(s: &Screen, size: (f64, f64), cursor_x: f64, cursor_y: f64) -> Option<(f64, f64)> {
    let w = s.work;
    let (dl, dr, dt, db) = (cursor_x - w[0], w[0] + w[2] - cursor_x, cursor_y - w[1], w[1] + w[3] - cursor_y);
    if [dl, dr, dt, db].into_iter().any(|d| !(d >= FREE_REACH)) { return None; }
    let room = |len: f64, sz: f64| (len - sz).max(1.0);
    Some((along((cursor_x - size.0 / 2.0 - w[0]) / room(w[2], size.0)), along((cursor_y - size.1 / 2.0 - w[1]) / room(w[3], size.1))))
}

/// A free place on a display: inside the work area, and out of the notch's zone (moved sideways out of it).
pub fn place_free(s: &Screen, size: (f64, f64), at: (f64, f64), home: island::HomeSize) -> Rect {
    let w = s.work;
    let f = [w[0] + along(at.0) * (w[2] - size.0).max(0.0), w[1] + along(at.1) * (w[3] - size.1).max(0.0), size.0, size.1];
    // M37d (the founder: "it still can't go in the middle"): free, it keeps clear of the notch only; Home may drop over it.
    let _ = home;
    let z = notch_zone(s);
    if !overlaps(f, z) { return f; }
    // Out of the zone sideways, to the nearer side that fits; on a display too narrow for either, below it.
    let (lo, hi) = (w[0], w[0] + w[2] - size.0);
    let side = [z[0] - size.0, z[0] + z[2]].into_iter().filter(|x| *x >= lo - 0.01 && *x <= hi + 0.01).min_by(|a, b| (a - f[0]).abs().total_cmp(&(b - f[0]).abs()));
    match side { Some(x) => [x, f[1], f[2], f[3]], None => [f[0], (z[1] + z[3]).min(w[1] + w[3] - size.1), f[2], f[3]] }
}

/// The edge nearest a free place: which way it faces, and where its trips come back to.
pub fn nearest_edge(frame: Rect, work: Rect) -> Edge {
    let (cx, cy) = (frame[0] + frame[2] / 2.0, frame[1] + frame[3] / 2.0);
    [(Edge::Left, cx - work[0]), (Edge::Right, work[0] + work[2] - cx), (Edge::Top, cy - work[1]), (Edge::Bottom, work[1] + work[3] - cy)]
        .into_iter().min_by(|a, b| a.1.total_cmp(&b.1)).map(|(e, _)| e).unwrap_or(Edge::Right)
}

/// M37c (the founder: "the more I push it towards it, the flatter it gets"): how hard a drag presses the character into
/// its edge, 0 to 1. Nothing while the pointer is at the character's middle or further from the edge; all of it once the
/// pointer reaches the edge of the screen itself. The page flattens the water against that side by this much.
pub fn press_of(s: &Screen, size: (f64, f64), edge: Edge, cursor: (f64, f64)) -> f64 {
    let w = s.work;
    let (dist, half) = match edge {
        Edge::Left => (cursor.0 - w[0], size.0 / 2.0),
        Edge::Right => (w[0] + w[2] - cursor.0, size.0 / 2.0),
        Edge::Top => (cursor.1 - w[1], size.1 / 2.0),
        Edge::Bottom => (w[1] + w[3] - cursor.1, size.1 / 2.0),
    };
    if !dist.is_finite() || half <= 0.0 { return 0.0; }
    (1.0 - dist / half).clamp(0.0, 1.0)
}

/// M37d: where the display's own edge on `edge` is, in points from the window's top left (its left for a side edge, its
/// top for the top or bottom), so the character's page flattens the water against the real edge, not its window's.
pub fn screen_at(edge: Edge, s: &Screen, win: Rect) -> f64 {
    match edge { Edge::Right => s.frame[0] + s.frame[2] - win[0], Edge::Left => s.frame[0] - win[0], Edge::Top => s.frame[1] - win[1], Edge::Bottom => s.frame[1] + s.frame[3] - win[1] }
}

pub fn inside(frame: Rect, work: Rect) -> bool {
    let e = 1.0;
    frame[0] >= work[0] - e && frame[1] >= work[1] - e && frame[0] + frame[2] <= work[0] + work[2] + e && frame[1] + frame[3] <= work[1] + work[3] + e
}

/// Which display the character should be on, and why.
pub fn pick<'a>(list: &'a [Screen], prefs: &Prefs, mouse: (f64, f64)) -> Option<(&'a Screen, &'static str)> {
    if let Some(s) = list.iter().find(|s| s.id == prefs.last_screen) { return Some((s, "exact")); }
    let size = prefs.last_screen.split('@').next().unwrap_or("");
    if !size.is_empty() {
        if let Some(s) = list.iter().find(|s| s.id.split('@').next() == Some(size)) { return Some((s, "same_size")); }
    }
    if let Some(s) = list.iter().find(|s| mouse.0 >= s.frame[0] && mouse.0 < s.frame[0] + s.frame[2] && mouse.1 >= s.frame[1] && mouse.1 < s.frame[1] + s.frame[3]) {
        return Some((s, "under_mouse"));
    }
    list.iter().find(|s| s.primary).map(|s| (s, "primary"))
}

/// The edge and height to use on a display: its saved choice, else the place copied for every display (Same place on
/// every display, when on), else the right edge, halfway down.
pub fn choice(prefs: &Prefs, screen_id: &str) -> (Edge, f64) {
    prefs.per_screen.get(screen_id).copied().or(prefs.same_everywhere).unwrap_or((Edge::Right, 0.5))
}

/// A signature of the display layout including each work area, so moving or resizing the Dock
/// is noticed as well as plugging in a screen.
pub fn signature(list: &[Screen]) -> String {
    list.iter().map(|s| format!("{}[{:.0},{:.0},{:.0},{:.0}]", s.id, s.work[0], s.work[1], s.work[2], s.work[3])).collect::<Vec<_>>().join("|")
}

// ---------- M47: dragging, followed by the shell itself ----------
// The founder (31 Oct 2026): "it cannot genuinely move freely in the middle. It just lags." Each pointer move used to cross
// from the page to the shell and run the whole placement (displays, saved places, trips, peeking, Home). Now the page says
// once that a drag began; the shell then moves the window itself from the mouse watch it already has, setting only where
// the window is, with the pointer kept where it took hold. Letting go decides once: stay (free) or snap (an edge), one save.

/// How often (ms) a drag tells the character's page how hard it presses into an edge: about once a frame, never more.
pub const PRESS_EVERY_MS: u64 = 16;
/// The short spring onto its edge when it is let go near one. None with Reduce motion or Less motion, and none when it
/// stays where it was let go (it is already there).
pub const LAND_SECS: f64 = 0.22;
/// A drag counts for this long after its last move (ms), as before M47.
pub const DRAG_QUIET_MS: u64 = 1_500;
/// A drag whose let go never reached the shell (the page went away mid drag) stops counting after this long (ms), so
/// nothing that waits for the end of a drag (trips, peeking) waits forever.
pub const DRAG_LOST_MS: u64 = 20_000;

/// Where a let go puts the character: where it is (0 to 1 across and down its room, as `Prefs::free`), or on an edge.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Landing { Free((f64, f64)), Edge(Edge, f64) }

/// What a let go decided, on the display under the pointer.
#[derive(Clone, Debug, PartialEq)]
pub struct Let { pub screen: Screen, pub how: Landing, pub pointer: (f64, f64), pub frame: Rect }

/// One drag of the character, from the moment the page says it began to the let go. Top left points.
#[derive(Clone, Debug, PartialEq)]
pub struct Drag { offset: (f64, f64), size: (f64, f64), screens: Vec<Screen>, pointer: (f64, f64), frame: Rect, last_press: Option<u64>, done: bool }

impl Drag {
    /// The pointer took hold of the window at `window`; `screens` are the displays as they are now (read once, not on
    /// every move).
    pub fn begin(pointer: (f64, f64), window: Rect, screens: Vec<Screen>) -> Drag {
        let ok = |v: f64| if v.is_finite() { v } else { 0.0 };
        let offset = (ok(pointer.0 - window[0]), ok(pointer.1 - window[1]));
        Drag { offset, size: (window[2], window[3]), screens, pointer, frame: window, last_press: None, done: false }
    }
    /// Where the window goes for the pointer at `p`: the same offset, kept inside the work area of the display under the
    /// pointer (or the nearest one). Pushed into an edge the window stops there and the pointer goes on: that is the press.
    /// None once it was let go.
    pub fn follow(&mut self, p: (f64, f64)) -> Option<Rect> {
        if self.done { return None; }
        if !(p.0.is_finite() && p.1.is_finite()) { return Some(self.frame); }
        let want = [p.0 - self.offset.0, p.1 - self.offset.1, self.size.0, self.size.1];
        let f = match screen_near(&self.screens, p) { Some(s) => keep_in(want, s.work), None => want };
        self.pointer = p;
        self.frame = f;
        Some(f)
    }
    /// Where the window is now.
    #[cfg(test)]
    pub fn frame(&self) -> Rect { self.frame }
    /// The primary display's height, to turn top left points into AppKit's (0 with no display).
    pub fn primary_h(&self) -> f64 { self.screens.first().map(|s| s.frame[3]).unwrap_or(0.0) }
    /// Is it time to tell the page the press again? At most once each `PRESS_EVERY_MS`.
    pub fn press_due(&mut self, now_ms: u64) -> bool {
        if let Some(t) = self.last_press { if now_ms < t.saturating_add(PRESS_EVERY_MS) { return false; } }
        self.last_press = Some(now_ms);
        true
    }
    /// The edge it is pushed against, how hard (0 to 1, `press_of`) and where the display's own edge is from the window's
    /// top left (`screen_at`). None in the middle of the screen, where it would stay if let go.
    pub fn press(&self) -> Option<(Edge, f64, f64)> {
        let s = screen_near(&self.screens, self.pointer)?;
        let (x, y) = self.pointer;
        if free_on(s, self.size, x, y).is_some() { return None; }
        let edge = edge_near(s.work, x, y);
        Some((edge, press_of(s, self.size, edge, self.pointer), screen_at(edge, s, self.frame)))
    }
    /// The let go: away from every edge it stays exactly where the window is (`free_on` decides, `free_at` keeps the very
    /// frame); near one it snaps to it (`snap_on`). Once per drag: asked again, or after, it is None.
    pub fn release(&mut self, home: island::HomeSize) -> Option<Let> {
        if self.done { return None; }
        self.done = true;
        let s = screen_near(&self.screens, self.pointer)?.clone();
        let (x, y) = self.pointer;
        let how = match free_on(&s, self.size, x, y) {
            Some(_) => Landing::Free(free_at(s.work, self.size, self.frame)),
            None => { let (e, pct) = snap_on(&s, self.size, x, y, home); Landing::Edge(e, pct) }
        };
        Some(Let { screen: s, how, pointer: self.pointer, frame: self.frame })
    }
}

/// The display under `p`, else the one nearest it (the pointer can sit on the last point of a screen, or in a gap).
fn screen_near(list: &[Screen], p: (f64, f64)) -> Option<&Screen> {
    let gap = |r: Rect| { let dx = (r[0] - p.0).max(p.0 - (r[0] + r[2])).max(0.0); let dy = (r[1] - p.1).max(p.1 - (r[1] + r[3])).max(0.0); dx.hypot(dy) };
    list.iter().find(|s| island::contains(s.frame, p)).or_else(|| list.iter().min_by(|a, b| gap(a.frame).total_cmp(&gap(b.frame))))
}

/// `r` moved (never resized) to lie inside `work`; where it cannot fit, at the work area's top left.
fn keep_in(r: Rect, work: Rect) -> Rect {
    let x = r[0].min(work[0] + work[2] - r[2]).max(work[0]);
    let y = r[1].min(work[1] + work[3] - r[3]).max(work[1]);
    [x, y, r[2], r[3]]
}

/// The nearest of the four edges of the work area to a point (a tie goes to a side edge, as `snap_on`).
fn edge_near(w: Rect, x: f64, y: f64) -> Edge {
    let x = x.clamp(w[0], w[0] + w[2]);
    let y = y.clamp(w[1], w[1] + w[3]);
    [(Edge::Left, x - w[0]), (Edge::Right, w[0] + w[2] - x), (Edge::Top, y - w[1]), (Edge::Bottom, w[1] + w[3] - y)].into_iter()
        .min_by(|a, b| a.1.total_cmp(&b.1)).map(|(e, _)| e).unwrap_or(Edge::Right)
}

/// A window's frame as a free place (the inverse of `place_free`): put back from it, the window is where it was.
pub fn free_at(work: Rect, size: (f64, f64), frame: Rect) -> (f64, f64) {
    let room = |len: f64, sz: f64| (len - sz).max(1.0);
    (along((frame[0] - work[0]) / room(work[2], size.0)), along((frame[1] - work[1]) / room(work[3], size.1)))
}

/// How long the move onto its place takes after a let go: a short spring onto an edge, nothing when it stays free (it is
/// already there) or with Reduce motion or Less motion (`calm`).
pub fn land_secs(how: &Landing, calm: bool) -> Option<f64> { match how { Landing::Edge(..) if !calm => Some(LAND_SECS), _ => None } }

/// Is a drag on (nothing else moves the character then)? For `DRAG_QUIET_MS` after its last move, and while it is still
/// held (`live`: begun and not let go), up to `DRAG_LOST_MS` after its last move.
pub fn drag_holds(live: bool, last_ms: u64, now_ms: u64) -> bool {
    if last_ms == 0 { return false; }
    let since = now_ms.saturating_sub(last_ms);
    since < DRAG_QUIET_MS || (live && since < DRAG_LOST_MS)
}

impl Prefs {
    /// A let go, written as a drag always wrote it: the display used last; free there, or on the edge (and copied for
    /// every display with no place yet when Same place on every display is on).
    pub fn land(&mut self, screen_id: &str, how: Landing) {
        self.last_screen = screen_id.to_string();
        match how {
            Landing::Free(at) => { self.free.insert(screen_id.to_string(), at); }
            Landing::Edge(edge, pct) => {
                self.free.remove(screen_id);
                self.per_screen.insert(screen_id.to_string(), (edge, pct));
                if self.same_everywhere.is_some() { self.same_everywhere = Some((edge, pct)); }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // The card's real size (one definition, island.rs): 600 wide, at most 640 tall.
    use crate::island::{CARD, CARD_MAX_H};
    const WORK: Rect = [0.0, 33.0, 1512.0, 949.0];
    fn screen(id: &str, frame: Rect, work: Rect, primary: bool) -> Screen { Screen { id: id.into(), frame, work, primary, notch: None } }
    fn mac() -> Screen { screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], WORK, true) }
    fn ext() -> Screen { screen("1920x1080@1512,0", [1512.0, 0.0, 1920.0, 1080.0], [1512.0, 0.0, 1920.0, 1055.0], false) }

    #[test]
    fn docks_flush_to_the_chosen_edge_inside_the_work_area() {
        let r = dock_frame(WORK, (160.0, 160.0), Edge::Right, 0.5);
        assert_eq!(r, [1352.0, 33.0 + 0.5 * (949.0 - 160.0), 160.0, 160.0]);
        assert!(inside(r, WORK));
        assert_eq!(dock_frame(WORK, (160.0, 160.0), Edge::Left, 0.0)[0], 0.0);
    }
    #[test]
    fn never_goes_above_the_menu_bar_or_below_the_bottom() {
        assert_eq!(dock_frame(WORK, (160.0, 160.0), Edge::Right, -3.0)[1], 33.0);
        let low = dock_frame(WORK, (160.0, 160.0), Edge::Right, 9.0);
        assert!(inside(low, WORK));
    }
    #[test]
    fn a_work_area_smaller_than_the_character_does_not_panic() {
        let r = dock_frame([0.0, 0.0, 100.0, 100.0], (160.0, 160.0), Edge::Right, 0.5);
        assert!(r[3] == 160.0);
    }
    #[test]
    fn the_card_faces_into_the_screen_and_stays_inside() {
        let d = dock_frame(WORK, (160.0, 160.0), Edge::Right, 0.5);
        let c = card_frame(d, (CARD.0, 300.0), WORK, Edge::Right);
        assert!(c[0] + c[2] <= d[0]);
        assert!(inside(c, WORK));
        let dl = dock_frame(WORK, (160.0, 160.0), Edge::Left, 0.5);
        let cl = card_frame(dl, (CARD.0, 300.0), WORK, Edge::Left);
        assert!(cl[0] >= dl[0] + dl[2]);
    }
    #[test]
    fn a_tall_card_near_the_bottom_is_pulled_up_to_fit() {
        let d = dock_frame(WORK, (160.0, 160.0), Edge::Right, 1.0);
        let c = card_frame(d, (CARD.0, CARD_MAX_H), WORK, Edge::Right);
        assert!(inside(c, WORK));
    }
    #[test]
    fn dragging_snaps_to_the_nearer_edge_and_a_height() {
        assert_eq!(snap_on(&mac(), (160.0, 160.0), 30.0, 33.0 + 300.0, STD).0, Edge::Left);
        assert_eq!(snap_on(&mac(), (160.0, 160.0), 1490.0, 500.0, STD).0, Edge::Right);
        let (e, top) = snap_on(&mac(), (160.0, 160.0), 1500.0, 0.0, STD);
        assert_eq!(place(&mac(), SIZE, e, top, STD), [1352.0, 33.0, 160.0, 160.0], "past the top right is the top right corner");
        let (e, bottom) = snap_on(&mac(), (160.0, 160.0), 1500.0, 5000.0, STD);
        assert_eq!(place(&mac(), SIZE, e, bottom, STD), [1352.0, 982.0 - 160.0, 160.0, 160.0], "past the bottom right is the bottom right corner");
    }
    #[test]
    fn prefers_the_saved_display_then_the_same_size_then_the_mouse_then_the_primary() {
        let both = [mac(), ext()];
        let mut p = Prefs { last_screen: "1920x1080@1512,0".into(), ..Default::default() };
        assert_eq!(pick(&both, &p, (10.0, 10.0)).unwrap().1, "exact");
        let only_mac = [mac()];
        assert_eq!(pick(&only_mac, &p, (10.0, 10.0)).unwrap().1, "under_mouse");
        // the same monitor plugged back in at a different position
        let moved = [mac(), screen("1920x1080@1512,-200", [1512.0, -200.0, 1920.0, 1080.0], [1512.0, -200.0, 1920.0, 1055.0], false)];
        assert_eq!(pick(&moved, &p, (10.0, 10.0)).unwrap().1, "same_size");
        p.last_screen = String::new();
        assert_eq!(pick(&both, &p, (99999.0, 99999.0)).unwrap().1, "primary");
    }
    #[test]
    fn unplugging_the_screen_the_character_was_on_brings_it_back_inside_the_laptop_screen() {
        let p = Prefs { last_screen: "1920x1080@1512,0".into(), per_screen: [("1920x1080@1512,0".to_string(), (Edge::Left, 0.2))].into(), come_to: true, same_everywhere: None, free: Default::default() };
        let only = [mac()];
        let (s, _) = pick(&only, &p, (400.0, 400.0)).unwrap();
        let (e, pct) = choice(&p, &s.id);
        assert!(inside(dock_frame(s.work, (160.0, 160.0), e, pct), s.work));
    }
    #[test]
    fn each_display_remembers_its_own_choice() {
        let mut p = Prefs::default();
        p.per_screen.insert("a".into(), (Edge::Left, 0.1));
        assert_eq!(choice(&p, "a"), (Edge::Left, 0.1));
        assert_eq!(choice(&p, "b"), (Edge::Right, 0.5));
    }
    #[test]
    fn moving_the_dock_or_resizing_changes_the_signature() {
        let a = signature(&[mac()]);
        let mut m = mac(); m.work = [0.0, 33.0, 1400.0, 949.0];
        assert_ne!(a, signature(&[m]));
        assert_eq!(a, signature(&[mac()]));
    }
    #[test]
    fn prefs_survive_being_saved_and_loaded() {
        let mut p = Prefs { last_screen: "x".into(), ..Default::default() };
        p.per_screen.insert("x".into(), (Edge::Left, 0.25));
        let back: Prefs = serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
        assert_eq!(back, p);
        // Every edge, and the switch off, read back the same through the careful reader the app uses.
        let mut q = Prefs { last_screen: "y".into(), come_to: false, ..Default::default() };
        for (i, e) in EDGES.into_iter().enumerate() { q.per_screen.insert(format!("s{i}"), (e, 0.125 * i as f64)); }
        assert_eq!(Prefs::from_text(Some(&serde_json::to_string(&q).unwrap())), q);
        assert_eq!(Prefs::from_text(Some(&serde_json::to_string(&p).unwrap())), p);
    }

    // ---- F18 item 2: any edge or corner, out of the notch island's way (17 Oct 2026) ----
    const SIZE: (f64, f64) = (160.0, 160.0);
    const EDGES: [Edge; 4] = [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom];
    /// The laptop with the Dock at the bottom, on the left, on the right; an external screen with its own menu bar;
    /// the laptop with the menu bar hidden.
    fn dock_bottom() -> Screen { screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [0.0, 33.0, 1512.0, 879.0], true) }
    fn dock_left() -> Screen { screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [70.0, 33.0, 1442.0, 949.0], true) }
    fn dock_right() -> Screen { screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [0.0, 33.0, 1442.0, 949.0], true) }
    fn ext_menu() -> Screen { screen("1920x1080@1512,-98", [1512.0, -98.0, 1920.0, 1080.0], [1512.0, -73.0, 1920.0, 1055.0], false) }
    fn no_menu_bar() -> Screen { screen("1512x982@0,0", [0.0, 0.0, 1512.0, 982.0], [0.0, 0.0, 1512.0, 982.0], true) }
    fn screens() -> Vec<Screen> { vec![mac(), ext(), dock_bottom(), dock_left(), dock_right(), ext_menu(), no_menu_bar()] }
    /// What the version before F18 computed for a side edge (left or right with a height), kept here to prove nobody moves.
    fn old_dock_frame(work: Rect, size: (f64, f64), left: bool, pct: f64) -> Rect {
        let free = (work[3] - size.1).max(0.0);
        [if left { work[0] } else { work[0] + work[2] - size.0 }, work[1] + pct.clamp(0.0, 1.0) * free, size.0, size.1]
    }

    #[test]
    fn docks_flush_on_every_edge_inside_the_work_area() {
        let s = mac();
        assert_eq!(place(&s, SIZE, Edge::Left, 0.5, STD)[0], 0.0);
        let r = place(&s, SIZE, Edge::Right, 0.5, STD); assert_eq!(r[0] + r[2], 1512.0);
        // At a tenth of the way along: clear of the 640 wide Home in the middle of the top (further along it keeps clear of it).
        let t = place(&s, SIZE, Edge::Top, 0.1, STD); assert_eq!(t[1], 33.0, "the top edge is just below the menu bar");
        assert_eq!(t[0], 0.1 * (1512.0 - 160.0));
        let b = place(&s, SIZE, Edge::Bottom, 0.7, STD); assert_eq!(b[1] + b[3], 982.0);
        assert_eq!(b[0], 0.7 * (1512.0 - 160.0));
        let bd = place(&dock_bottom(), SIZE, Edge::Bottom, 0.5, STD); assert_eq!(bd[1] + bd[3], 33.0 + 879.0, "the bottom edge stops above the Dock");
        for e in EDGES { assert!(inside(place(&s, SIZE, e, 0.3, STD), s.work), "{e:?}"); }
    }
    #[test]
    fn each_corner_is_reachable_and_both_ways_of_naming_it_agree() {
        for s in screens() {
            let w = s.work;
            let (l, t, r, b) = (w[0], w[1], w[0] + w[2] - 160.0, w[1] + w[3] - 160.0);
            assert_eq!(place(&s, SIZE, Edge::Left, 0.0, STD), [l, t, 160.0, 160.0], "{} top left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Top, 0.0, STD), [l, t, 160.0, 160.0], "{} top left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Right, 0.0, STD), [r, t, 160.0, 160.0], "{} top right", s.id);
            assert_eq!(place(&s, SIZE, Edge::Top, 1.0, STD), [r, t, 160.0, 160.0], "{} top right", s.id);
            assert_eq!(place(&s, SIZE, Edge::Left, 1.0, STD), [l, b, 160.0, 160.0], "{} bottom left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Bottom, 0.0, STD), [l, b, 160.0, 160.0], "{} bottom left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Right, 1.0, STD), [r, b, 160.0, 160.0], "{} bottom right", s.id);
            assert_eq!(place(&s, SIZE, Edge::Bottom, 1.0, STD), [r, b, 160.0, 160.0], "{} bottom right", s.id);
        }
    }
    #[test]
    fn the_clear_zone_sits_at_the_top_centre_of_the_display_and_reaches_below_the_menu_bar() {
        for s in screens() {
            let z = notch_zone(&s);
            assert_eq!(z[0] + z[2] / 2.0, s.frame[0] + s.frame[2] / 2.0, "{}: centred on the display, not the work area", s.id);
            assert_eq!(z[1], s.frame[1], "{}: from the very top", s.id);
            assert!(z[2] >= 190.0 + 2.0 * 60.0, "{}: a notch plus a margin each side", s.id);
            assert!(z[1] + z[3] >= s.work[1] + 100.0, "{}: down past the menu bar", s.id);
        }
    }
    #[test]
    fn the_character_never_sits_in_the_clear_zone_on_any_edge_or_position() {
        for s in screens() {
            let z = notch_zone(&s);
            for e in EDGES { for i in 0..=200 {
                let f = place(&s, SIZE, e, i as f64 / 200.0, STD);
                assert!(!overlaps(f, z), "{} {e:?} {i}: {f:?} is in the clear zone {z:?}", s.id);
                assert!(inside(f, s.work), "{} {e:?} {i}: {f:?}", s.id);
            } }
        }
        // Just left of the middle it goes to the left of the zone its place keeps clear of (the island, and Home below it
        // since the merge of F18 items 1 and 2), just right of it to the right; either way out of the island's zone.
        let (s, z) = (mac(), dock_zone(&mac(), STD));
        let l = place(&s, SIZE, Edge::Top, 0.49, STD); assert!(l[0] + l[2] <= z[0] && z[0] - (l[0] + l[2]) < 2.0, "{l:?} {z:?}");
        let r = place(&s, SIZE, Edge::Top, 0.51, STD); assert!(r[0] >= z[0] + z[2] && r[0] - (z[0] + z[2]) < 2.0, "{r:?} {z:?}");
        for f in [l, r] { assert!(!overlaps(f, notch_zone(&s)), "{f:?}"); }
        // Away from the middle the top edge is untouched.
        assert_eq!(place(&s, SIZE, Edge::Top, 0.1, STD), [0.1 * 1352.0, 33.0, 160.0, 160.0]);
    }
    #[test]
    fn never_under_the_menu_bar_the_dock_or_off_the_screen_whatever_was_saved() {
        let tiny = screen("640x480@0,0", [0.0, 0.0, 640.0, 480.0], [0.0, 25.0, 640.0, 455.0], true);
        for s in screens().into_iter().chain([tiny]) {
            for e in EDGES { for pct in [-3.0, 0.0, 0.3, 0.5, 1.0, 9.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
                let f = place(&s, SIZE, e, pct, STD);
                assert!(f.iter().all(|v| v.is_finite()), "{} {e:?} {pct}: {f:?}", s.id);
                assert!(inside(f, s.work), "{} {e:?} {pct}: {f:?}", s.id);
            } }
        }
    }
    #[test]
    fn dragging_snaps_to_the_nearest_of_the_four_edges_at_the_pointers_place() {
        let s = mac();
        assert_eq!(snap_on(&s, SIZE, 30.0, 500.0, STD).0, Edge::Left);
        assert_eq!(snap_on(&s, SIZE, 1490.0, 500.0, STD).0, Edge::Right);
        // Along the top, away from Home's place under the notch (600 wide in the middle).
        assert_eq!(snap_on(&s, SIZE, 250.0, 50.0, STD).0, Edge::Top);
        assert_eq!(snap_on(&s, SIZE, 900.0, 960.0, STD).0, Edge::Bottom);
        let (e, p) = snap_on(&s, SIZE, 250.0, 50.0, STD);
        assert!((place(&s, SIZE, e, p, STD)[0] - (250.0 - 80.0)).abs() < 0.5, "it follows the pointer along the top");
        let (e, p) = snap_on(&s, SIZE, 900.0, 960.0, STD);
        assert!((place(&s, SIZE, e, p, STD)[0] - (900.0 - 80.0)).abs() < 0.5, "and along the bottom");
        let (e, p) = snap_on(&s, SIZE, 20.0, 600.0, STD);
        assert!((place(&s, SIZE, e, p, STD)[1] - (600.0 - 80.0)).abs() < 0.5, "and along a side, as before");
    }
    #[test]
    fn dragging_into_a_corner_snaps_exactly_into_it() {
        for s in screens() {
            let w = s.work;
            let (l, t, r, b) = (w[0], w[1], w[0] + w[2] - 160.0, w[1] + w[3] - 160.0);
            for ((x, y), want) in [((w[0] + 40.0, w[1] + 60.0), [l, t]), ((w[0] + w[2] - 50.0, w[1] + 30.0), [r, t]),
                                   ((w[0] + 70.0, w[1] + w[3] - 20.0), [l, b]), ((w[0] + w[2] - 10.0, w[1] + w[3] - 90.0), [r, b])] {
                let (e, p) = snap_on(&s, SIZE, x, y, STD);
                let f = place(&s, SIZE, e, p, STD);
                assert_eq!([f[0], f[1]], want, "{} pointer at {x},{y}", s.id);
            }
        }
    }
    #[test]
    fn dragging_along_the_top_past_the_middle_never_lands_in_the_clear_zone_and_what_is_saved_is_what_was_shown() {
        for s in screens() {
            let z = notch_zone(&s);
            let w = s.work;
            let mut x = w[0];
            while x <= w[0] + w[2] {
                let (e, p) = snap_on(&s, SIZE, x, w[1] + 20.0, STD);
                let f = place(&s, SIZE, e, p, STD);
                assert!(!overlaps(f, z), "{} x {x}: {f:?}", s.id);
                // Saved and loaded again (the position alone, on the same screen), it is in the same place.
                let again = dock_frame(s.work, SIZE, e, p);
                assert!(again.iter().zip(f.iter()).all(|(a, b)| (a - b).abs() < 1e-6), "{} x {x}: {again:?} {f:?}", s.id);
                x += 7.0;
            }
        }
    }
    #[test]
    fn the_card_faces_into_the_screen_from_every_edge() {
        let s = mac();
        let card = (CARD.0, 300.0);
        let t = place(&s, SIZE, Edge::Top, 0.2, STD);
        let ct = card_frame(t, card, s.work, Edge::Top);
        assert!(ct[1] >= t[1] + t[3], "below a character on the top edge: {ct:?}");
        let b = place(&s, SIZE, Edge::Bottom, 0.6, STD);
        let cb = card_frame(b, card, s.work, Edge::Bottom);
        assert!(cb[1] + cb[3] <= b[1], "above a character on the bottom edge: {cb:?}");
        for e in EDGES { for pct in [0.0, 0.5, 1.0] {
            let d = place(&s, SIZE, e, pct, STD);
            let c = card_frame(d, card, s.work, e);
            assert!(inside(c, s.work), "{e:?} {pct}: {c:?}");
            assert!(!overlaps(c, d), "{e:?} {pct}: the card never covers the character");
        } }
    }
    #[test]
    fn a_place_saved_before_f18_loads_unchanged_and_the_character_does_not_move() {
        // The exact file the version before F18 writes (serde of the old Prefs: left or right with a height).
        let old = r#"{"last_screen":"1512x982@0,0","per_screen":{"1512x982@0,0":["left",0.25],"1920x1080@1512,0":["right",0.8]}}"#;
        let p = Prefs::from_text(Some(old));
        assert_eq!(p.last_screen, "1512x982@0,0");
        assert_eq!(choice(&p, "1512x982@0,0"), (Edge::Left, 0.25));
        assert_eq!(choice(&p, "1920x1080@1512,0"), (Edge::Right, 0.8));
        assert!(p.come_to, "everyone who had the old file gets the new switch on");
        // Each old place is the very same frame now, on every screen of normal size.
        for s in [mac(), ext(), dock_bottom(), dock_left(), dock_right(), no_menu_bar()] {
            for i in 0..=20 {
                let pct = i as f64 / 20.0;
                assert_eq!(place(&s, SIZE, Edge::Left, pct, STD), old_dock_frame(s.work, SIZE, true, pct), "{} left {pct}", s.id);
                assert_eq!(place(&s, SIZE, Edge::Right, pct, STD), old_dock_frame(s.work, SIZE, false, pct), "{} right {pct}", s.id);
            }
        }
    }
    #[test]
    fn a_broken_or_unknown_entry_loses_only_itself() {
        let mixed = r#"{"last_screen":"a","per_screen":{"a":["top",0.3],"b":["sideways",0.5],"c":["left","high"],"d":["bottom",7],"e":["right",-2],"f":"left"},"come_to":false}"#;
        let p = Prefs::from_text(Some(mixed));
        assert_eq!(p.last_screen, "a");
        assert_eq!(p.per_screen.get("a"), Some(&(Edge::Top, 0.3)));
        assert_eq!(p.per_screen.get("d"), Some(&(Edge::Bottom, 1.0)), "out of range is pulled back to the nearest end");
        assert_eq!(p.per_screen.get("e"), Some(&(Edge::Right, 0.0)));
        for gone in ["b", "c", "f"] { assert!(!p.per_screen.contains_key(gone), "{gone}"); }
        assert!(!p.come_to, "a clear false turns it off");
        for junk in [None, Some(""), Some("not json"), Some("[]"), Some("7"), Some(r#"{"per_screen":7,"come_to":"no"}"#)] {
            assert_eq!(Prefs::from_text(junk), Prefs::default(), "{junk:?}");
        }
        assert!(Prefs::default().come_to, "on unless the person turns it off");
    }
    #[test]
    fn a_top_place_on_a_screen_that_went_away_comes_back_inside_the_laptop_screen_and_out_of_the_zone() {
        let p = Prefs { last_screen: "1920x1080@1512,-98".into(), per_screen: [("1920x1080@1512,-98".to_string(), (Edge::Top, 0.5))].into(), come_to: true, same_everywhere: None, free: Default::default() };
        let only = [mac()];
        let (s, _) = pick(&only, &p, (400.0, 400.0)).unwrap();
        let (e, pct) = choice(&p, &s.id);
        let f = place(s, SIZE, e, pct, STD);
        assert!(inside(f, s.work) && !overlaps(f, notch_zone(s)), "{f:?}");
        // Plugged back in, each screen still has its own place.
        let both = [mac(), ext_menu()];
        let (s2, how) = pick(&both, &p, (400.0, 400.0)).unwrap();
        assert_eq!((s2.id.as_str(), how), ("1920x1080@1512,-98", "exact"));
        let f2 = place(s2, SIZE, Edge::Top, 0.5, STD);
        assert!(inside(f2, s2.work) && !overlaps(f2, notch_zone(s2)), "{f2:?}");
    }

    // ---- F18 items 1 and 2 together: the character keeps clear of the island and of Home below it (17 Oct 2026) ----
    /// A display with a notch `notch_w` wide and 32 tall in the middle of its top edge, read the way macOS reports it.
    fn notched(w: f64, h: f64, work: Rect, notch_w: f64) -> Screen {
        let side = (w - notch_w) / 2.0;
        Screen { id: format!("{w}x{h}@0,0"), frame: [0.0, 0.0, w, h], work, primary: true, notch: island::notch_from(w, 32.0, side, side) }
    }
    /// Real Macs and odd readings: notched laptops (14 and 16 inch with the Dock below, a 13 inch Air, a 14 inch at its
    /// largest text, the Dock on the left, the menu bar and the Dock hidden), the widest notch reading island.rs accepts,
    /// an uneven reading, the displays without a notch above, and a small 1024 x 640 display.
    fn island_screens() -> Vec<Screen> {
        let mut v = vec![
            notched(1512.0, 982.0, [0.0, 32.0, 1512.0, 875.0], 185.0),
            notched(1728.0, 1117.0, [0.0, 32.0, 1728.0, 1010.0], 185.0),
            notched(1470.0, 956.0, [0.0, 32.0, 1470.0, 850.0], 185.0),
            notched(1147.0, 745.0, [0.0, 32.0, 1147.0, 640.0], 140.0),
            notched(1512.0, 982.0, [70.0, 32.0, 1442.0, 950.0], 185.0),
            notched(1512.0, 982.0, [0.0, 0.0, 1512.0, 982.0], 185.0),
            notched(1512.0, 982.0, [0.0, 32.0, 1512.0, 950.0], island::MAX_NOTCH_W),
        ];
        let mut uneven = notched(1512.0, 982.0, [0.0, 32.0, 1512.0, 875.0], 185.0);
        uneven.notch = island::notch_from(1512.0, 32.0, 640.0, 687.0);
        v.push(uneven);
        assert!(v.iter().all(|s| s.notch.is_some()), "every notch reading above is taken as a notch");
        v.extend(screens());
        v.push(screen("1024x640@0,0", [0.0, 0.0, 1024.0, 640.0], [0.0, 25.0, 1024.0, 615.0], true));
        v
    }
    fn holds(outer: Rect, r: Rect) -> bool { r[0] >= outer[0] - 1e-9 && r[1] >= outer[1] - 1e-9 && r[0] + r[2] <= outer[0] + outer[2] + 1e-9 && r[1] + r[3] <= outer[1] + outer[3] + 1e-9 }
    const MODES: [island::Mode; 3] = [island::Mode::Rest, island::Mode::Alert, island::Mode::Peek];

    #[test]
    fn the_zones_hold_the_island_at_every_size_and_home_at_every_height_as_island_rs_draws_them() {
        for s in island_screens() {
            let (nz, hz, dz) = (notch_zone(&s), home_zone(&s, STD), dock_zone(&s, STD));
            for m in MODES {
                let i = island::island_frame(&s, m);
                assert!(holds(nz, i) && holds(dz, i), "{} {m:?}: the island {i:?} is outside the zone {nz:?}", s.id);
            }
            for h in (CARD.1 as i32..=CARD_MAX_H as i32).step_by(10) {
                let home = island::home_frame(&s, (CARD.0, h as f64));
                assert!(holds(hz, home) && holds(dz, home), "{} Home {h} tall: {home:?} outside {hz:?}", s.id);
                assert!(home[0] - hz[0] >= CLEAR_MARGIN - 1e-9 && (hz[0] + hz[2]) - (home[0] + home[2]) >= CLEAR_MARGIN - 1e-9
                    && (hz[1] + hz[3]) - (home[1] + home[3]) >= CLEAR_MARGIN - 1e-9, "{} with the gap on each side and below: {home:?} {hz:?}", s.id);
            }
            assert!(holds(dz, nz) && holds(dz, hz), "{}", s.id);
            assert_eq!(dz[1], s.frame[1], "{}: from the very top", s.id);
        }
        // For a real notch (up to 200 points, centred) and every display without one, the island's own zone keeps the
        // numbers it had before the merge, so trips beside a window lose no room to it.
        let (w, depth) = NOTCH_CLEAR;
        for s in island_screens().into_iter().filter(|s| s.notch.is_none_or(|n| n.w <= 200.0 && (n.x + n.w / 2.0 - s.frame[2] / 2.0).abs() < 1.0)) {
            assert_eq!(notch_zone(&s), [s.frame[0] + s.frame[2] / 2.0 - w / 2.0, s.frame[1], w, (s.work[1] - s.frame[1]).max(0.0) + depth], "{}", s.id);
        }
    }
    #[test]
    fn the_character_never_docks_inside_the_island_or_homes_drop_down_zone() {
        for s in island_screens() {
            let island_big = island::island_frame(&s, island::Mode::Peek);
            let homes: Vec<Rect> = [CARD.1, 300.0, 450.0, CARD_MAX_H].iter().map(|h| island::home_frame(&s, (CARD.0, *h))).collect();
            for e in EDGES { for i in 0..=200 {
                let f = place(&s, SIZE, e, i as f64 / 200.0, STD);
                let why = format!("{} {e:?} {i}: {f:?}", s.id);
                assert!(inside(f, s.work), "outside the work area: {why}");
                for m in MODES { assert!(!overlaps(f, island::island_frame(&s, m)), "under the island ({m:?}): {why}"); }
                for home in &homes { assert!(!overlaps(f, *home), "under Home {home:?}: {why}"); }
                assert!(!overlaps(f, dock_zone(&s, STD)), "{why}");
            } }
            // A drag along the top and along the bottom, the whole width: what is shown, and so saved, is clear too.
            let w = s.work;
            let mut x = w[0];
            while x <= w[0] + w[2] {
                for y in [w[1] + 10.0, w[1] + w[3] - 10.0] {
                    let (e, p) = snap_on(&s, SIZE, x, y, STD);
                    let f = place(&s, SIZE, e, p, STD);
                    assert!(!overlaps(f, island_big) && !overlaps(f, homes[3]), "{} drag at {x},{y}: {f:?}", s.id);
                }
                x += 9.0;
            }
        }
        // On a 14 inch MacBook Pro the top edge stops just beside Home at its widest, with the card's gap between them;
        // the bottom edge, below Home at its tallest, is not moved at all.
        let s = &island_screens()[0];
        let home = island::home_frame(s, (CARD.0, CARD_MAX_H));
        let l = place(s, SIZE, Edge::Top, 0.49, STD);
        assert!((home[0] - (l[0] + l[2]) - CLEAR_MARGIN).abs() < 0.01, "{l:?} {home:?}");
        let r = place(s, SIZE, Edge::Top, 0.51, STD);
        assert!((r[0] - (home[0] + home[2]) - CLEAR_MARGIN).abs() < 0.01, "{r:?} {home:?}");
        assert_eq!(place(s, SIZE, Edge::Bottom, 0.5, STD), dock_frame(s.work, SIZE, Edge::Bottom, 0.5));
    }

    // ---- M11 area 4: Home's size, and the character's place from Settings (protocol/settings.json) ----
    const STD: island::HomeSize = island::HomeSize::STANDARD;
    const LARGE: island::HomeSize = island::HomeSize::LARGE;
    #[test]
    fn with_a_large_home_the_character_never_docks_under_it_at_its_tallest() {
        for s in island_screens() {
            let homes: Vec<Rect> = [LARGE.min_h, 300.0, 600.0, LARGE.max_h].iter().map(|h| island::home_frame(&s, (LARGE.w, *h))).collect();
            let hz = home_zone(&s, LARGE);
            for home in &homes { assert!(holds(hz, *home), "{} {home:?} outside {hz:?}", s.id); }
            assert!(holds(home_zone(&s, LARGE), home_zone(&s, STD)), "{}: the large zone holds the usual one", s.id);
            for e in EDGES { for i in 0..=100 {
                let f = place(&s, SIZE, e, i as f64 / 100.0, LARGE);
                assert!(inside(f, s.work), "{} {e:?} {i}: {f:?}", s.id);
                for home in &homes { assert!(!overlaps(f, *home), "{} {e:?} {i}: under the large Home {home:?}: {f:?}", s.id); }
            } }
            // A drag along the top: what is shown, and so saved, is clear of the large Home too.
            let w = s.work;
            let mut x = w[0];
            while x <= w[0] + w[2] { let (e, p) = snap_on(&s, SIZE, x, w[1] + 10.0, LARGE); assert!(!overlaps(place(&s, SIZE, e, p, LARGE), homes[3]), "{} drag at {x}", s.id); x += 11.0; }
        }
        // The usual size keeps every place exactly where it was.
        let s = &island_screens()[0];
        assert_eq!(home_zone(s, STD), { let h = island::home_frame(s, (island::CARD.0, 640.0)); widen([h[0], s.frame[1], h[2], h[1] + h[3] - s.frame[1]], CLEAR_MARGIN) });
    }
    #[test]
    fn same_place_on_every_display_fills_only_displays_with_no_place_yet() {
        let mut p = Prefs::default();
        assert_eq!(p.same_everywhere, None, "off unless turned on");
        p.per_screen.insert("a".into(), (Edge::Top, 0.7));
        assert_eq!(choice(&p, "b"), (Edge::Right, 0.5), "off: the usual place, as today");
        p.same_everywhere = Some((Edge::Left, 0.2));
        assert_eq!(choice(&p, "a"), (Edge::Top, 0.7), "a display with its own place keeps it");
        assert_eq!(choice(&p, "b"), (Edge::Left, 0.2), "one with no place yet gets the copy");
        // Kept in dock.json, read back carefully; a file from before has it off.
        let back = Prefs::from_text(Some(&serde_json::to_string(&p).unwrap()));
        assert_eq!(back, p);
        let old = r#"{"last_screen":"a","per_screen":{"a":["left",0.25]},"come_to":true}"#;
        assert_eq!(Prefs::from_text(Some(old)).same_everywhere, None);
        for junk in [r#"{"same_everywhere":"left"}"#, r#"{"same_everywhere":["sideways",0.5]}"#, r#"{"same_everywhere":["left","x"]}"#, r#"{"same_everywhere":null}"#] {
            assert_eq!(Prefs::from_text(Some(junk)).same_everywhere, None, "{junk}");
        }
        assert_eq!(Prefs::from_text(Some(r#"{"same_everywhere":["bottom",4]}"#)).same_everywhere, Some((Edge::Bottom, 1.0)), "pulled back to the nearest end");
    }
    #[test]
    fn each_edge_has_the_word_settings_use() {
        for e in EDGES { assert_eq!(Edge::of(e.word()), Some(e)); }
        assert_eq!([Edge::Left.word(), Edge::Right.word(), Edge::Top.word(), Edge::Bottom.word()], ["left", "right", "top", "bottom"]);
        assert_eq!(Edge::of("middle"), None);
        // The same words dock.json has always used.
        assert_eq!(serde_json::to_string(&Edge::Top).unwrap(), "\"top\"");
    }
    #[test]
    fn let_go_away_from_every_edge_it_stays_there_and_near_one_it_snaps() {
        let s = Screen { id: "a".into(), frame: [0.0, 0.0, 1440.0, 900.0], work: [0.0, 25.0, 1440.0, 875.0], primary: true, notch: None };
        let size = (160.0, 160.0);
        assert_eq!(free_on(&s, size, 40.0, 450.0), None, "right at the left edge: snap");
        assert_eq!(free_on(&s, size, 720.0, 880.0), None, "right at the bottom: snap");
        let (fx, fy) = free_on(&s, size, 300.0, 500.0).expect("away from every edge: stays");
        let f = place_free(&s, size, (fx, fy), island::HomeSize::STANDARD);
        assert!(((f[0] + 80.0) - 300.0).abs() < 1.0 && ((f[1] + 80.0) - 500.0).abs() < 1.0, "{f:?}");
        // Let go in the very middle of the screen: it stays right there (M37d), Home may drop over it.
        let mid = place_free(&s, size, free_on(&s, size, 720.0, 500.0).unwrap(), island::HomeSize::STANDARD);
        assert!(((mid[0] + 80.0) - 720.0).abs() < 1.0 && (mid[1] + 80.0 - 500.0).abs() < 1.0, "{mid:?}");
        assert!(inside(f, s.work));
        assert_eq!(free_on(&s, size, f64::NAN, 500.0), None);
    }
    #[test]
    fn a_free_place_keeps_out_of_the_notch() {
        let s = Screen { id: "a".into(), frame: [0.0, 0.0, 1440.0, 900.0], work: [0.0, 25.0, 1440.0, 875.0], primary: true, notch: None };
        let f = place_free(&s, (160.0, 160.0), (0.5, 0.0), island::HomeSize::STANDARD);
        assert!(!overlaps(f, notch_zone(&s)), "{f:?}");
        assert!(inside(f, s.work));
        assert_eq!(nearest_edge([10.0, 400.0, 100.0, 100.0], s.work), Edge::Left);
        assert_eq!(nearest_edge([600.0, 760.0, 100.0, 100.0], s.work), Edge::Bottom);
    }
    #[test]
    fn a_saved_free_place_reads_back_and_a_bad_one_is_dropped() {
        let p = Prefs::from_text(Some(r#"{"last_screen":"a","per_screen":{},"free":{"a":[0.4,2.0],"b":["x",1],"c":[0.1,0.2]}}"#));
        assert_eq!(p.free.get("a"), Some(&(0.4, 1.0)));
        assert_eq!(p.free.get("b"), None);
        assert_eq!(p.free.get("c"), Some(&(0.1, 0.2)));
        assert!(!serde_json::to_string(&Prefs::default()).unwrap().contains("free"), "nothing written when it is always on an edge");
    }
    #[test]
    fn the_harder_it_is_pushed_into_its_edge_the_more_it_presses() {
        let s = Screen { id: "a".into(), frame: [0.0, 0.0, 1440.0, 900.0], work: [0.0, 25.0, 1440.0, 875.0], primary: true, notch: None };
        let size = (160.0, 160.0);
        assert_eq!(press_of(&s, size, Edge::Right, (1300.0, 400.0)), 0.0, "pointer at or past its middle: no press");
        assert!((press_of(&s, size, Edge::Right, (1400.0, 400.0)) - 0.5).abs() < 1e-9);
        assert_eq!(press_of(&s, size, Edge::Right, (1440.0, 400.0)), 1.0, "at the screen's edge: all of it");
        assert_eq!(press_of(&s, size, Edge::Left, (-5.0, 400.0)), 1.0);
        assert!((press_of(&s, size, Edge::Top, (700.0, 65.0)) - 0.5).abs() < 1e-9);
        assert_eq!(press_of(&s, size, Edge::Bottom, (700.0, f64::NAN)), 0.0);
    }
    #[test]
    fn the_screen_edge_is_found_from_the_window() {
        let s = Screen { id: "a".into(), frame: [0.0, 0.0, 1440.0, 900.0], work: [0.0, 25.0, 1440.0, 875.0], primary: true, notch: None };
        assert_eq!(screen_at(Edge::Right, &s, [1280.0, 300.0, 160.0, 160.0]), 160.0);
        assert_eq!(screen_at(Edge::Right, &s, [1360.0, 300.0, 160.0, 160.0]), 80.0, "half past the edge");
        assert_eq!(screen_at(Edge::Left, &s, [-80.0, 300.0, 160.0, 160.0]), 80.0);
        assert_eq!(screen_at(Edge::Bottom, &s, [600.0, 740.0, 160.0, 160.0]), 160.0);
    }

    // ---------- M47: a drag followed by the shell itself ----------
    const DOCK_SIZE: (f64, f64) = (160.0, 160.0);
    fn wide() -> Screen { Screen { id: "a".into(), frame: [0.0, 0.0, 1440.0, 900.0], work: [0.0, 25.0, 1440.0, 875.0], primary: true, notch: None } }
    fn second() -> Screen { Screen { id: "b".into(), frame: [1440.0, 0.0, 1920.0, 1080.0], work: [1440.0, 0.0, 1920.0, 1080.0], primary: false, notch: None } }
    #[test]
    fn a_drag_keeps_the_pointer_where_it_took_hold_of_the_character() {
        // Taken hold of 30 across and 50 down inside the window.
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![wide(), second()]);
        assert_eq!(d.follow((700.0, 420.0)), Some([670.0, 370.0, 160.0, 160.0]));
        assert_eq!(d.follow((300.5, 600.25)), Some([270.5, 550.25, 160.0, 160.0]), "the same offset wherever it goes, to the point");
        assert_eq!(d.frame(), [270.5, 550.25, 160.0, 160.0]);
        // Onto the second display: the same offset there.
        assert_eq!(d.follow((2000.0, 500.0)), Some([1970.0, 450.0, 160.0, 160.0]));
    }
    #[test]
    fn a_drag_stays_inside_the_work_area_of_the_display_under_the_pointer() {
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![wide(), second()]);
        // Pushed past the right edge: the window stops at it, the pointer goes on (that is the press).
        assert_eq!(d.follow((1430.0, 350.0)), Some([1280.0, 300.0, 160.0, 160.0]));
        // Never under the menu bar, never past the bottom.
        assert_eq!(d.follow((630.0, 10.0)), Some([600.0, 25.0, 160.0, 160.0]));
        assert_eq!(d.follow((630.0, 899.0)), Some([600.0, 740.0, 160.0, 160.0]));
        // A pointer that is not a number leaves it where it is.
        assert_eq!(d.follow((f64::NAN, 400.0)), Some([600.0, 740.0, 160.0, 160.0]));
        // Off every display (past the last point of the screen, or in a gap between two): kept on the nearest one.
        let mut d = Drag::begin((80.0, 80.0), [0.0, 25.0, 160.0, 160.0], vec![wide()]);
        assert_eq!(d.follow((2000.0, 80.0)), Some([1280.0, 25.0, 160.0, 160.0]));
    }
    #[test]
    fn the_press_against_an_edge_goes_to_the_page_at_most_once_a_frame() {
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![wide()]);
        assert!(d.press_due(1_000));
        assert!(!d.press_due(1_005), "the same frame");
        assert!(!d.press_due(1_000 + PRESS_EVERY_MS - 1));
        assert!(d.press_due(1_000 + PRESS_EVERY_MS));
        // A clock that went back never floods it either.
        assert!(!d.press_due(900));
        // A hundred moves in one second: at most one each frame.
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![wide()]);
        let sent = (0..1000u64).step_by(2).filter(|t| d.press_due(5_000 + t)).count();
        assert!(sent <= (1000 / PRESS_EVERY_MS + 1) as usize, "{sent}");
    }
    #[test]
    fn the_press_is_nothing_in_the_middle_and_measured_against_the_real_edge_near_one() {
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![wide()]);
        assert_eq!(d.press(), None, "in the middle there is nothing to press against");
        d.follow((1440.0, 350.0));
        let (edge, press, at) = d.press().unwrap();
        assert_eq!(edge, Edge::Right);
        assert_eq!(press, 1.0, "the pointer at the screen's edge");
        assert_eq!(at, 160.0, "the screen's edge from the window it is really in");
    }
    #[test]
    fn let_go_in_the_middle_it_stays_exactly_where_it_is() {
        let s = wide();
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![s.clone()]);
        d.follow((513.0, 471.0));
        let at = d.frame();
        let l = d.release(island::HomeSize::STANDARD).unwrap();
        assert_eq!(l.screen.id, "a");
        let Landing::Free(free) = l.how else { panic!("free, not snapped: {:?}", l.how) };
        // Placed back from what is saved, it is the very frame it was let go at: no jump, no drift to an edge.
        let back = place_free(&s, DOCK_SIZE, free, island::HomeSize::STANDARD);
        for i in 0..4 { assert!((back[i] - at[i]).abs() < 1e-6, "{back:?} vs {at:?}"); }
        assert_eq!(land_secs(&l.how, false), None, "nothing to move");
    }
    #[test]
    fn let_go_near_an_edge_it_snaps_to_it() {
        let s = wide();
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![s.clone()]);
        d.follow((1420.0, 400.0));
        let l = d.release(island::HomeSize::STANDARD).unwrap();
        assert_eq!(l.how, Landing::Edge(snap_on(&s, DOCK_SIZE, 1420.0, 400.0, island::HomeSize::STANDARD).0, snap_on(&s, DOCK_SIZE, 1420.0, 400.0, island::HomeSize::STANDARD).1));
        assert!(matches!(l.how, Landing::Edge(Edge::Right, _)));
        assert_eq!(land_secs(&l.how, false), Some(LAND_SECS), "a short spring onto the edge");
        assert_eq!(land_secs(&l.how, true), None, "at once with Reduce motion or Less motion");
        // On the second display, the one under the pointer.
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![s, second()]);
        d.follow((3350.0, 500.0));
        assert_eq!(d.release(island::HomeSize::STANDARD).unwrap().screen.id, "b");
    }
    #[test]
    fn a_drag_lands_and_is_saved_once() {
        let mut d = Drag::begin((630.0, 350.0), [600.0, 300.0, 160.0, 160.0], vec![wide()]);
        for i in 0..200 { d.follow((630.0 + i as f64, 350.0)); }
        let mut saves = 0;
        let mut p = Prefs::default();
        for _ in 0..3 { if let Some(l) = d.release(island::HomeSize::STANDARD) { p.land(&l.screen.id, l.how); saves += 1; } }
        assert_eq!(saves, 1, "one let go, one save, however many times it is asked");
        assert_eq!(d.follow((900.0, 400.0)), None, "after the let go nothing follows the pointer");
        assert!(p.free.contains_key("a") && p.last_screen == "a");
    }
    #[test]
    fn landing_writes_the_place_as_a_drag_always_did() {
        let mut p = Prefs::default();
        p.land("a", Landing::Free((0.3, 0.6)));
        assert_eq!(p.free.get("a"), Some(&(0.3, 0.6)));
        assert_eq!(p.last_screen, "a");
        // Snapped: off the free place, onto the edge, and copied for other displays when Same place on every display is on.
        p.same_everywhere = Some((Edge::Left, 0.1));
        p.land("a", Landing::Edge(Edge::Bottom, 0.25));
        assert!(p.free.get("a").is_none());
        assert_eq!(p.per_screen.get("a"), Some(&(Edge::Bottom, 0.25)));
        assert_eq!(p.same_everywhere, Some((Edge::Bottom, 0.25)));
        let mut q = Prefs::default();
        q.land("b", Landing::Edge(Edge::Top, 0.5));
        assert_eq!(q.same_everywhere, None, "not turned on by a drag");
    }
    #[test]
    fn a_drag_counts_while_it_is_held_and_never_forever() {
        assert!(!drag_holds(false, 0, 10_000), "no drag");
        assert!(drag_holds(false, 10_000, 10_000 + DRAG_QUIET_MS - 1), "just moved");
        assert!(!drag_holds(false, 10_000, 10_000 + DRAG_QUIET_MS));
        assert!(drag_holds(true, 10_000, 10_000 + 5_000), "held still mid drag: still a drag");
        assert!(!drag_holds(true, 10_000, 10_000 + DRAG_LOST_MS), "a let go that never arrived stops counting");
    }
}
