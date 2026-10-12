//! A ring belongs to the window it was confirmed in. It is drawn only inside that window, and it goes away the moment
//! that window moves, is covered, closes, or the person switches to another app. Window owners and sizes need no
//! permission. Windows are listed front to back, like the system lists them.
use crate::fullscreen::{Rect, Win};

/// The window a ring was confirmed in: who owns it, where it is, and which app was in front when the ring went up.
#[derive(Clone, Debug, PartialEq)]
pub struct Anchor { pub pid: i32, pub bounds: Rect, pub front_pid: i32 }

fn near(a: Rect, b: Rect) -> bool { a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() <= 2.0) }
fn has(b: Rect, x: f64, y: f64) -> bool { x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3] }

/// The ordinary window that is topmost at this point, ignoring our own windows. None when nothing ordinary is there.
fn topmost(wins: &[Win], ours: i32, x: f64, y: f64) -> Option<&Win> {
    wins.iter().find(|w| w.pid != ours && w.layer == 0 && has(w.bounds, x, y))
}

/// The window under the target's centre. None when it cannot be told (then nothing is drawn solid over it).
pub fn anchor_at(wins: &[Win], ours: i32, front_pid: i32, x: f64, y: f64) -> Option<Anchor> {
    topmost(wins, ours, x, y).map(|w| Anchor { pid: w.pid, bounds: w.bounds, front_pid })
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Verdict { Fine, SwitchedApp, WindowChanged, Covered }

/// Is the ring still on the window it was confirmed in?
pub fn check(wins: &[Win], ours: i32, a: &Anchor, front_pid: i32, x: f64, y: f64) -> Verdict {
    if front_pid != a.front_pid { return Verdict::SwitchedApp; }
    match topmost(wins, ours, x, y) {
        Some(w) if w.pid == a.pid && near(w.bounds, a.bounds) => Verdict::Fine,
        Some(w) if w.pid == a.pid => Verdict::WindowChanged,
        Some(_) => Verdict::Covered,
        None => Verdict::WindowChanged,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const OURS: i32 = 1;
    fn w(pid: i32, layer: i64, b: Rect) -> Win { Win { pid, layer, bounds: b } }
    const SAFARI: i32 = 100;
    const CURSOR: i32 = 200;
    const WIN: Rect = [100.0, 100.0, 800.0, 600.0];

    #[test]
    fn the_anchor_is_the_topmost_ordinary_window_under_the_target() {
        let wins = [w(OURS, 25, [0.0, 0.0, 1512.0, 982.0]), w(CURSOR, 0, [300.0, 200.0, 400.0, 300.0]), w(SAFARI, 0, WIN)];
        let a = anchor_at(&wins, OURS, SAFARI, 350.0, 250.0).unwrap();
        assert_eq!((a.pid, a.bounds), (CURSOR, [300.0, 200.0, 400.0, 300.0]));
        let b = anchor_at(&wins, OURS, SAFARI, 150.0, 150.0).unwrap();
        assert_eq!(b.pid, SAFARI);
    }
    #[test]
    fn our_own_windows_and_floating_layers_never_count() {
        let wins = [w(OURS, 25, [0.0, 0.0, 1512.0, 982.0]), w(SAFARI, 3, [0.0, 0.0, 1512.0, 982.0])];
        assert_eq!(anchor_at(&wins, OURS, SAFARI, 10.0, 10.0), None);
    }
    #[test]
    fn nothing_under_the_target_means_no_anchor() {
        assert_eq!(anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 5.0, 5.0), None);
    }
    #[test]
    fn the_same_window_in_the_same_place_is_fine() {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        assert_eq!(check(&[w(OURS, 25, [0.0, 0.0, 1512.0, 982.0]), w(SAFARI, 0, [101.0, 100.0, 799.0, 601.0])], OURS, &a, SAFARI, 200.0, 200.0), Verdict::Fine);
    }
    #[test]
    fn a_window_that_moved_or_resized_clears_the_ring() {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        assert_eq!(check(&[w(SAFARI, 0, [160.0, 100.0, 800.0, 600.0])], OURS, &a, SAFARI, 200.0, 200.0), Verdict::WindowChanged);
        assert_eq!(check(&[w(SAFARI, 0, [100.0, 100.0, 500.0, 600.0])], OURS, &a, SAFARI, 200.0, 200.0), Verdict::WindowChanged);
    }
    #[test]
    fn a_window_that_closed_clears_the_ring() {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        assert_eq!(check(&[], OURS, &a, SAFARI, 200.0, 200.0), Verdict::WindowChanged);
    }
    #[test]
    fn another_window_in_front_of_it_clears_the_ring() {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        assert_eq!(check(&[w(CURSOR, 0, [150.0, 150.0, 300.0, 300.0]), w(SAFARI, 0, WIN)], OURS, &a, SAFARI, 200.0, 200.0), Verdict::Covered);
    }
    #[test]
    fn switching_to_another_app_clears_the_ring() {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        assert_eq!(check(&[w(SAFARI, 0, WIN)], OURS, &a, CURSOR, 200.0, 200.0), Verdict::SwitchedApp);
    }
    #[test]
    fn our_own_card_in_front_does_not_count_as_covering() {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        assert_eq!(check(&[w(OURS, 0, [150.0, 150.0, 300.0, 300.0]), w(SAFARI, 0, WIN)], OURS, &a, SAFARI, 200.0, 200.0), Verdict::Fine);
    }
}
