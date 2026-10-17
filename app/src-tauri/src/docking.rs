//! Where the character lives (F18 item 2): any edge of a display's work area (never under the menu bar or the Dock),
//! a position along it whose two ends are the corners, remembered per display, kept out of a clear zone at the top
//! centre (the notch island, F18 item 1), and moved back on screen when the displays change. Geometry is in points
//! with a top left origin. The pure functions are tested.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub type Rect = [f64; 4]; // x, y, width, height

/// Which edge of the work area. With the position along it (0 to 1) the two ends are the corners, so a corner is
/// Left 0 or Top 0 (top left), Right 0 or Top 1 (top right), Left 1 or Bottom 0, Right 1 or Bottom 1.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Edge { Left, Right, Top, Bottom }

#[derive(Clone, Debug, PartialEq)]
pub struct Screen { pub id: String, pub frame: Rect, pub work: Rect, pub primary: bool }

/// Saved choices (`dock.json`): the display used last, per display which edge and where along it (0 is the top or
/// left end, 1 the bottom or right end), and the "Come to what it is about" switch (on unless turned off).
/// A file saved before F18 (left or right with a height) reads back unchanged: the height along a side edge is the
/// position along it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Prefs {
    pub last_screen: String,
    pub per_screen: BTreeMap<String, (Edge, f64)>,
    #[serde(default = "on")]
    pub come_to: bool,
}
fn on() -> bool { true }
impl Default for Prefs { fn default() -> Self { Prefs { last_screen: String::new(), per_screen: BTreeMap::new(), come_to: true } } }

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
        p
    }
}

/// The clear zone at the top centre of a display, left for the notch island (another part of F18): the width of a
/// notch (about 190 points on a MacBook) plus a margin each side, from the very top down past the menu bar. Kept the
/// same on displays without a notch, where the home is a pill in the same place.
pub const NOTCH_CLEAR: (f64, f64) = (360.0, 120.0);
pub fn notch_zone(s: &Screen) -> Rect {
    let (w, depth) = NOTCH_CLEAR;
    let below_menu = (s.work[1] - s.frame[1]).max(0.0);
    [s.frame[0] + s.frame[2] / 2.0 - w / 2.0, s.frame[1], w, below_menu + depth]
}

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

/// Where the character sits on a display: on its edge at its position, inside the work area, out of the clear zone.
pub fn place(s: &Screen, size: (f64, f64), edge: Edge, pct: f64) -> Rect {
    clear_of_zone(dock_frame(s.work, size, edge, pct), notch_zone(s), s.work, edge)
}

/// The card sits beside the character, on the side facing into the screen, and is kept inside the work area: beside a
/// character on a side edge with its top level with the character's top, below one on the top edge, above one on the
/// bottom edge, with its left side level with the character's.
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
pub fn snap_on(s: &Screen, size: (f64, f64), cursor_x: f64, cursor_y: f64) -> (Edge, f64) {
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
    (edge, pct_of(w, size, edge, place(s, size, edge, pct)))
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

/// The edge and height to use on a display: its saved choice, or the right edge, halfway down.
pub fn choice(prefs: &Prefs, screen_id: &str) -> (Edge, f64) {
    prefs.per_screen.get(screen_id).copied().unwrap_or((Edge::Right, 0.5))
}

/// A signature of the display layout including each work area, so moving or resizing the Dock
/// is noticed as well as plugging in a screen.
pub fn signature(list: &[Screen]) -> String {
    list.iter().map(|s| format!("{}[{:.0},{:.0},{:.0},{:.0}]", s.id, s.work[0], s.work[1], s.work[2], s.work[3])).collect::<Vec<_>>().join("|")
}

#[cfg(test)]
mod tests {
    use super::*;
    const WORK: Rect = [0.0, 33.0, 1512.0, 949.0];
    fn screen(id: &str, frame: Rect, work: Rect, primary: bool) -> Screen { Screen { id: id.into(), frame, work, primary } }
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
        let c = card_frame(d, (340.0, 300.0), WORK, Edge::Right);
        assert!(c[0] + c[2] <= d[0]);
        assert!(inside(c, WORK));
        let dl = dock_frame(WORK, (160.0, 160.0), Edge::Left, 0.5);
        let cl = card_frame(dl, (340.0, 300.0), WORK, Edge::Left);
        assert!(cl[0] >= dl[0] + dl[2]);
    }
    #[test]
    fn a_tall_card_near_the_bottom_is_pulled_up_to_fit() {
        let d = dock_frame(WORK, (160.0, 160.0), Edge::Right, 1.0);
        let c = card_frame(d, (340.0, 520.0), WORK, Edge::Right);
        assert!(inside(c, WORK));
    }
    #[test]
    fn dragging_snaps_to_the_nearer_edge_and_a_height() {
        assert_eq!(snap_on(&mac(), (160.0, 160.0), 30.0, 33.0 + 300.0).0, Edge::Left);
        assert_eq!(snap_on(&mac(), (160.0, 160.0), 1490.0, 500.0).0, Edge::Right);
        let (e, top) = snap_on(&mac(), (160.0, 160.0), 1500.0, 0.0);
        assert_eq!(place(&mac(), SIZE, e, top), [1352.0, 33.0, 160.0, 160.0], "past the top right is the top right corner");
        let (e, bottom) = snap_on(&mac(), (160.0, 160.0), 1500.0, 5000.0);
        assert_eq!(place(&mac(), SIZE, e, bottom), [1352.0, 982.0 - 160.0, 160.0, 160.0], "past the bottom right is the bottom right corner");
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
        let p = Prefs { last_screen: "1920x1080@1512,0".into(), per_screen: [("1920x1080@1512,0".to_string(), (Edge::Left, 0.2))].into(), come_to: true };
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
        assert_eq!(place(&s, SIZE, Edge::Left, 0.5)[0], 0.0);
        let r = place(&s, SIZE, Edge::Right, 0.5); assert_eq!(r[0] + r[2], 1512.0);
        let t = place(&s, SIZE, Edge::Top, 0.2); assert_eq!(t[1], 33.0, "the top edge is just below the menu bar");
        assert_eq!(t[0], 0.2 * (1512.0 - 160.0));
        let b = place(&s, SIZE, Edge::Bottom, 0.7); assert_eq!(b[1] + b[3], 982.0);
        assert_eq!(b[0], 0.7 * (1512.0 - 160.0));
        let bd = place(&dock_bottom(), SIZE, Edge::Bottom, 0.5); assert_eq!(bd[1] + bd[3], 33.0 + 879.0, "the bottom edge stops above the Dock");
        for e in EDGES { assert!(inside(place(&s, SIZE, e, 0.3), s.work), "{e:?}"); }
    }
    #[test]
    fn each_corner_is_reachable_and_both_ways_of_naming_it_agree() {
        for s in screens() {
            let w = s.work;
            let (l, t, r, b) = (w[0], w[1], w[0] + w[2] - 160.0, w[1] + w[3] - 160.0);
            assert_eq!(place(&s, SIZE, Edge::Left, 0.0), [l, t, 160.0, 160.0], "{} top left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Top, 0.0), [l, t, 160.0, 160.0], "{} top left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Right, 0.0), [r, t, 160.0, 160.0], "{} top right", s.id);
            assert_eq!(place(&s, SIZE, Edge::Top, 1.0), [r, t, 160.0, 160.0], "{} top right", s.id);
            assert_eq!(place(&s, SIZE, Edge::Left, 1.0), [l, b, 160.0, 160.0], "{} bottom left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Bottom, 0.0), [l, b, 160.0, 160.0], "{} bottom left", s.id);
            assert_eq!(place(&s, SIZE, Edge::Right, 1.0), [r, b, 160.0, 160.0], "{} bottom right", s.id);
            assert_eq!(place(&s, SIZE, Edge::Bottom, 1.0), [r, b, 160.0, 160.0], "{} bottom right", s.id);
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
                let f = place(&s, SIZE, e, i as f64 / 200.0);
                assert!(!overlaps(f, z), "{} {e:?} {i}: {f:?} is in the clear zone {z:?}", s.id);
                assert!(inside(f, s.work), "{} {e:?} {i}: {f:?}", s.id);
            } }
        }
        // Just left of the middle it goes to the left of the zone, just right of it to the right.
        let (s, z) = (mac(), notch_zone(&mac()));
        let l = place(&s, SIZE, Edge::Top, 0.49); assert!(l[0] + l[2] <= z[0] && z[0] - (l[0] + l[2]) < 2.0, "{l:?} {z:?}");
        let r = place(&s, SIZE, Edge::Top, 0.51); assert!(r[0] >= z[0] + z[2] && r[0] - (z[0] + z[2]) < 2.0, "{r:?} {z:?}");
        // Away from the middle the top edge is untouched.
        assert_eq!(place(&s, SIZE, Edge::Top, 0.1), [0.1 * 1352.0, 33.0, 160.0, 160.0]);
    }
    #[test]
    fn never_under_the_menu_bar_the_dock_or_off_the_screen_whatever_was_saved() {
        let tiny = screen("640x480@0,0", [0.0, 0.0, 640.0, 480.0], [0.0, 25.0, 640.0, 455.0], true);
        for s in screens().into_iter().chain([tiny]) {
            for e in EDGES { for pct in [-3.0, 0.0, 0.3, 0.5, 1.0, 9.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
                let f = place(&s, SIZE, e, pct);
                assert!(f.iter().all(|v| v.is_finite()), "{} {e:?} {pct}: {f:?}", s.id);
                assert!(inside(f, s.work), "{} {e:?} {pct}: {f:?}", s.id);
            } }
        }
    }
    #[test]
    fn dragging_snaps_to_the_nearest_of_the_four_edges_at_the_pointers_place() {
        let s = mac();
        assert_eq!(snap_on(&s, SIZE, 30.0, 500.0).0, Edge::Left);
        assert_eq!(snap_on(&s, SIZE, 1490.0, 500.0).0, Edge::Right);
        assert_eq!(snap_on(&s, SIZE, 400.0, 50.0).0, Edge::Top);
        assert_eq!(snap_on(&s, SIZE, 900.0, 960.0).0, Edge::Bottom);
        let (e, p) = snap_on(&s, SIZE, 400.0, 50.0);
        assert!((place(&s, SIZE, e, p)[0] - (400.0 - 80.0)).abs() < 0.5, "it follows the pointer along the top");
        let (e, p) = snap_on(&s, SIZE, 900.0, 960.0);
        assert!((place(&s, SIZE, e, p)[0] - (900.0 - 80.0)).abs() < 0.5, "and along the bottom");
        let (e, p) = snap_on(&s, SIZE, 20.0, 600.0);
        assert!((place(&s, SIZE, e, p)[1] - (600.0 - 80.0)).abs() < 0.5, "and along a side, as before");
    }
    #[test]
    fn dragging_into_a_corner_snaps_exactly_into_it() {
        for s in screens() {
            let w = s.work;
            let (l, t, r, b) = (w[0], w[1], w[0] + w[2] - 160.0, w[1] + w[3] - 160.0);
            for ((x, y), want) in [((w[0] + 40.0, w[1] + 60.0), [l, t]), ((w[0] + w[2] - 50.0, w[1] + 30.0), [r, t]),
                                   ((w[0] + 70.0, w[1] + w[3] - 20.0), [l, b]), ((w[0] + w[2] - 10.0, w[1] + w[3] - 90.0), [r, b])] {
                let (e, p) = snap_on(&s, SIZE, x, y);
                let f = place(&s, SIZE, e, p);
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
                let (e, p) = snap_on(&s, SIZE, x, w[1] + 20.0);
                let f = place(&s, SIZE, e, p);
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
        let card = (340.0, 300.0);
        let t = place(&s, SIZE, Edge::Top, 0.2);
        let ct = card_frame(t, card, s.work, Edge::Top);
        assert!(ct[1] >= t[1] + t[3], "below a character on the top edge: {ct:?}");
        let b = place(&s, SIZE, Edge::Bottom, 0.6);
        let cb = card_frame(b, card, s.work, Edge::Bottom);
        assert!(cb[1] + cb[3] <= b[1], "above a character on the bottom edge: {cb:?}");
        for e in EDGES { for pct in [0.0, 0.5, 1.0] {
            let d = place(&s, SIZE, e, pct);
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
                assert_eq!(place(&s, SIZE, Edge::Left, pct), old_dock_frame(s.work, SIZE, true, pct), "{} left {pct}", s.id);
                assert_eq!(place(&s, SIZE, Edge::Right, pct), old_dock_frame(s.work, SIZE, false, pct), "{} right {pct}", s.id);
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
        let p = Prefs { last_screen: "1920x1080@1512,-98".into(), per_screen: [("1920x1080@1512,-98".to_string(), (Edge::Top, 0.5))].into(), come_to: true };
        let only = [mac()];
        let (s, _) = pick(&only, &p, (400.0, 400.0)).unwrap();
        let (e, pct) = choice(&p, &s.id);
        let f = place(s, SIZE, e, pct);
        assert!(inside(f, s.work) && !overlaps(f, notch_zone(s)), "{f:?}");
        // Plugged back in, each screen still has its own place.
        let both = [mac(), ext_menu()];
        let (s2, how) = pick(&both, &p, (400.0, 400.0)).unwrap();
        assert_eq!((s2.id.as_str(), how), ("1920x1080@1512,-98", "exact"));
        let f2 = place(s2, SIZE, Edge::Top, 0.5);
        assert!(inside(f2, s2.work) && !overlaps(f2, notch_zone(s2)), "{f2:?}");
    }
}
