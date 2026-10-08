//! Where the character lives: an edge of a display's work area (never under the menu bar or
//! the Dock), how high along it, remembered per display, and moved back on screen when the
//! displays change. Geometry is in points with a top left origin. The pure functions are tested.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type Rect = [f64; 4]; // x, y, width, height

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Edge { Left, Right }

#[derive(Clone, Debug, PartialEq)]
pub struct Screen { pub id: String, pub frame: Rect, pub work: Rect, pub primary: bool }

/// Saved choices: the display used last, and per display which edge and how high (0 top, 1 bottom).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Prefs {
    pub last_screen: String,
    pub per_screen: BTreeMap<String, (Edge, f64)>,
}

pub fn dock_frame(work: Rect, size: (f64, f64), edge: Edge, pct: f64) -> Rect {
    let free = (work[3] - size.1).max(0.0);
    let x = match edge { Edge::Left => work[0], Edge::Right => work[0] + work[2] - size.0 };
    [x, work[1] + pct.clamp(0.0, 1.0) * free, size.0, size.1]
}

/// The card sits beside the character, on the side facing into the screen, with its top level
/// with the character's top, and is kept inside the work area.
pub fn card_frame(dock: Rect, card: (f64, f64), work: Rect, edge: Edge) -> Rect {
    let gap = 8.0;
    let x = match edge { Edge::Right => dock[0] - card.0 - gap, Edge::Left => dock[0] + dock[2] + gap };
    let x = x.clamp(work[0], (work[0] + work[2] - card.0).max(work[0]));
    let y = dock[1].clamp(work[1], (work[1] + work[3] - card.1).max(work[1]));
    [x, y, card.0, card.1]
}

/// Dragging snaps to the nearest side edge and a height along it.
pub fn snap(work: Rect, size: (f64, f64), cursor_x: f64, cursor_y: f64) -> (Edge, f64) {
    let edge = if cursor_x < work[0] + work[2] / 2.0 { Edge::Left } else { Edge::Right };
    let free = (work[3] - size.1).max(1.0);
    let top = cursor_y - size.1 / 2.0 - work[1];
    (edge, (top / free).clamp(0.0, 1.0))
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
        assert_eq!(snap(WORK, (160.0, 160.0), 100.0, 33.0 + 80.0).0, Edge::Left);
        assert_eq!(snap(WORK, (160.0, 160.0), 1400.0, 500.0).0, Edge::Right);
        let (_, top) = snap(WORK, (160.0, 160.0), 1400.0, 0.0);
        assert_eq!(top, 0.0);
        let (_, bottom) = snap(WORK, (160.0, 160.0), 1400.0, 5000.0);
        assert_eq!(bottom, 1.0);
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
        let p = Prefs { last_screen: "1920x1080@1512,0".into(), per_screen: [("1920x1080@1512,0".to_string(), (Edge::Left, 0.2))].into() };
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
    }
}
