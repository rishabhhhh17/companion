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

/// How often a ring that does not wait for a click checks its window, and for how long at most (the overlay takes such a
/// ring away by itself after ten seconds).
pub const WATCH_POLL_MS: u64 = 250;
pub const WATCH_MAX_MS: u64 = 10_500;

/// Watches a ring that does not wait for a click (a step of a multi step answer, Point at the problem's line or error)
/// while it is up. Each turn: `wait`, then stop quietly if the ring is no longer the current one (`alive` false: a newer
/// ring, Stop, Esc, the overlay's own timer), otherwise `look` at the windows and the app in front and stop with the
/// verdict as soon as it is not Fine. Gives up quietly after `max_polls` turns. Rule 22.
#[allow(clippy::too_many_arguments)]
pub fn watch(a: &Anchor, ours: i32, x: f64, y: f64, max_polls: u32, mut alive: impl FnMut() -> bool, mut look: impl FnMut() -> (Vec<Win>, i32), mut wait: impl FnMut()) -> Option<Verdict> {
    for _ in 0..max_polls {
        wait();
        if !alive() { return None; }
        let (wins, front) = look();
        let v = check(&wins, ours, a, front, x, y);
        // Taken away by something else while it was looking: nothing more to say.
        if v != Verdict::Fine { return if alive() { Some(v) } else { None }; }
    }
    None
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

    // ---- a ring that does not wait for a click is watched too (found 16 Oct 2026) ----
    // Before this, only the "your turn" ring was watched. A step in the middle of a multi step answer, or Point at the
    // problem's ring on a line or an error, stayed drawn for up to ten seconds over whatever came to the front.
    use std::cell::{Cell, RefCell};
    /// Plays back what the windows look like at each turn (the last one repeats). Returns the verdict and how many looks.
    fn run(states: Vec<(Vec<Win>, i32)>, max: u32, alive_for: u32) -> (Option<Verdict>, u32) {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        let last = states.last().cloned().unwrap();
        let it = RefCell::new(states.into_iter());
        let (looks, turns) = (Cell::new(0u32), Cell::new(0u32));
        let v = watch(&a, OURS, 200.0, 200.0, max,
            || turns.get() <= alive_for,
            || { looks.set(looks.get() + 1); it.borrow_mut().next().unwrap_or_else(|| last.clone()) },
            || turns.set(turns.get() + 1));
        (v, looks.get())
    }
    #[test]
    fn a_ring_that_does_not_wait_goes_away_as_soon_as_another_app_comes_to_the_front() {
        let fine = (vec![w(SAFARI, 0, WIN)], SAFARI);
        let (v, looks) = run(vec![fine.clone(), fine, (vec![w(SAFARI, 0, WIN)], CURSOR)], 40, u32::MAX);
        assert_eq!(v, Some(Verdict::SwitchedApp));
        assert_eq!(looks, 3, "it stops looking the moment it has its answer");
    }
    #[test]
    fn a_ring_that_does_not_wait_goes_away_when_its_window_moves_closes_or_is_covered() {
        let fine = (vec![w(SAFARI, 0, WIN)], SAFARI);
        assert_eq!(run(vec![fine.clone(), (vec![w(SAFARI, 0, [160.0, 100.0, 800.0, 600.0])], SAFARI)], 40, u32::MAX).0, Some(Verdict::WindowChanged));
        assert_eq!(run(vec![fine.clone(), (vec![], SAFARI)], 40, u32::MAX).0, Some(Verdict::WindowChanged));
        assert_eq!(run(vec![fine, (vec![w(CURSOR, 0, [150.0, 150.0, 300.0, 300.0]), w(SAFARI, 0, WIN)], SAFARI)], 40, u32::MAX).0, Some(Verdict::Covered));
    }
    #[test]
    fn our_own_card_coming_up_does_not_take_the_ring_away_and_it_gives_up_quietly_after_its_time() {
        let card = (vec![w(OURS, 0, [150.0, 150.0, 300.0, 300.0]), w(SAFARI, 0, WIN)], SAFARI);
        let (v, looks) = run(vec![(vec![w(SAFARI, 0, WIN)], SAFARI), card], 6, u32::MAX);
        assert_eq!(v, None);
        assert_eq!(looks, 6, "never more looks than its time allows");
    }
    #[test]
    fn once_a_newer_ring_stop_or_esc_took_it_away_it_stops_and_never_looks_again() {
        // Alive for two turns, then gone: two looks, then nothing, whatever the windows do afterwards.
        let fine = (vec![w(SAFARI, 0, WIN)], SAFARI);
        let (v, looks) = run(vec![fine.clone(), fine, (vec![], CURSOR)], 40, 2);
        assert_eq!(v, None);
        assert_eq!(looks, 2);
    }
    #[test]
    fn its_time_matches_the_overlays_own_ten_seconds() {
        assert!(WATCH_POLL_MS <= 250, "four times a second, like the your turn ring");
        assert!((10_000..=11_000).contains(&WATCH_MAX_MS));
    }
    #[test]
    fn the_shell_watches_every_ring_that_does_not_wait_for_a_click() {
        // Wiring: a step of a multi step answer and Point at the problem's line or error ring both start the watch.
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        assert!(body("fn showme_aim(").contains("watch_ring("), "showme_aim must watch a step that does not wait");
        assert!(body("fn point_problem(").contains("watch_ring("), "point_problem must watch its ring when it does not wait");
        assert!(body("fn watch_ring(").contains("anchor::watch("));
    }
}
