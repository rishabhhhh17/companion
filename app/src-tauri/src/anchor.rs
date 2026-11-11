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

/// What a ring is watched against while it is up: the window it was confirmed in, or, when no ordinary window was under it
/// (a menu, a dialog, the desktop; the ring is soft then and not clipped), the app that was in front when it went up. Either
/// way it goes away when another app comes to the front (rule 22).
#[derive(Clone, Debug, PartialEq)]
pub enum Watched { Window(Anchor), Front(i32) }
impl Watched {
    /// The window, when the ring has one.
    pub fn window(&self) -> Option<&Anchor> { match self { Watched::Window(a) => Some(a), Watched::Front(_) => None } }
}
/// The window under the target if there is one, otherwise the app in front.
pub fn watched_for(anchor: Option<Anchor>, front_pid: i32) -> Watched { anchor.map(Watched::Window).unwrap_or(Watched::Front(front_pid)) }

/// Is the ring still where it belongs? With a window: `check`. Without one: only whether the same app is in front.
pub fn check_watched(w: &Watched, wins: &[Win], ours: i32, front_pid: i32, x: f64, y: f64) -> Verdict {
    match w {
        Watched::Window(a) => check(wins, ours, a, front_pid, x, y),
        Watched::Front(p) => if front_pid == *p { Verdict::Fine } else { Verdict::SwitchedApp },
    }
}

/// How often a ring that does not wait for a click checks its window, and for how long at most. The overlay takes such a
/// ring away by itself a set time after the draw was ordered (How long a ring stays in Settings, point.ringSeconds, 5 to
/// 30 seconds, usual 10; the flight included), and the shell sends it that time with the ring; the watch starts at the
/// same moment and lasts half a second longer, worked out from the same setting, so no part of the ring's life goes
/// unwatched (rule 22).
pub const WATCH_POLL_MS: u64 = 250;
/// The usual ring time (pointer.ts RING_MS), used for anything the setting's rules refuse.
pub const RING_MS: u64 = 10_000;
/// How long a ring that does not wait for a click stays, from the setting's value.
pub fn ring_ms(v: &serde_json::Value) -> u64 {
    crate::settings::registry().get("point.ringSeconds").and_then(|d| crate::settings::validate(d, v).ok()).and_then(|n| n.as_f64()).map(|s| (s * 1000.0).round() as u64).unwrap_or(RING_MS)
}
/// How long its window is watched (and the overlay kept busy): the ring's time and half a second.
pub fn watch_ms(ring_ms: u64) -> u64 { ring_ms + 500 }
/// The number of looks that cover the whole watch.
pub fn watch_polls(ring_ms: u64) -> u32 { watch_ms(ring_ms).div_ceil(WATCH_POLL_MS) as u32 }

/// Watches a ring that does not wait for a click (a step of a multi step answer, Point at the problem's line or error)
/// while it is up. Each turn: `wait`, then stop quietly if the ring is no longer the current one (`alive` false: a newer
/// ring, Stop, Esc, the overlay's own timer), otherwise `look` at the windows and the app in front and stop with the
/// verdict as soon as it is not Fine. Gives up quietly after `max_polls` turns. Rule 22.
#[allow(clippy::too_many_arguments)]
pub fn watch(a: &Watched, ours: i32, x: f64, y: f64, max_polls: u32, mut alive: impl FnMut() -> bool, mut look: impl FnMut() -> (Vec<Win>, i32), mut wait: impl FnMut()) -> Option<Verdict> {
    for _ in 0..max_polls {
        wait();
        if !alive() { return None; }
        let (wins, front) = look();
        let v = check_watched(a, &wins, ours, front, x, y);
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
        let v = watch(&Watched::Window(a), OURS, 200.0, 200.0, max,
            || turns.get() <= alive_for,
            || { looks.set(looks.get() + 1); it.borrow_mut().next().unwrap_or_else(|| last.clone()) },
            || turns.set(turns.get() + 1));
        (v, looks.get())
    }
    /// The same, for a ring that had no ordinary window under it when it went up (a menu, a dialog, the desktop).
    fn run_front(front_then: i32, states: Vec<(Vec<Win>, i32)>, max: u32) -> (Option<Verdict>, u32) {
        let last = states.last().cloned().unwrap();
        let it = RefCell::new(states.into_iter());
        let looks = Cell::new(0u32);
        let v = watch(&Watched::Front(front_then), OURS, 200.0, 200.0, max, || true,
            || { looks.set(looks.get() + 1); it.borrow_mut().next().unwrap_or_else(|| last.clone()) }, || {});
        (v, looks.get())
    }
    #[test]
    fn a_ring_with_no_window_under_it_still_goes_away_when_another_app_comes_to_the_front() {
        // Found in review, 16 Oct 2026: a soft ring over a menu, a dialog or the desktop had nothing to be watched against,
        // so it stayed for ten seconds over whatever app came to the front.
        let (v, looks) = run_front(SAFARI, vec![(vec![], SAFARI), (vec![], SAFARI), (vec![w(CURSOR, 0, WIN)], CURSOR)], 40);
        assert_eq!(v, Some(Verdict::SwitchedApp));
        assert_eq!(looks, 3);
    }
    #[test]
    fn a_ring_with_no_window_under_it_stays_while_the_same_app_is_in_front() {
        // A menu opening or closing over it changes the windows, not the app in front: nothing to take away.
        let (v, looks) = run_front(SAFARI, vec![(vec![], SAFARI), (vec![w(SAFARI, 0, WIN)], SAFARI), (vec![], SAFARI)], 6);
        assert_eq!(v, None);
        assert_eq!(looks, 6);
    }
    #[test]
    fn what_a_ring_is_watched_against_is_its_window_when_it_has_one_and_otherwise_the_app_in_front() {
        let a = anchor_at(&[w(SAFARI, 0, WIN)], OURS, SAFARI, 200.0, 200.0).unwrap();
        assert_eq!(watched_for(Some(a.clone()), SAFARI), Watched::Window(a.clone()));
        assert_eq!(watched_for(None, SAFARI), Watched::Front(SAFARI));
        assert_eq!(Watched::Window(a.clone()).window(), Some(&a));
        assert_eq!(Watched::Front(SAFARI).window(), None, "no window: the ring can only be soft and is not clipped");
        assert_eq!(check_watched(&Watched::Front(SAFARI), &[], OURS, SAFARI, 5.0, 5.0), Verdict::Fine);
        assert_eq!(check_watched(&Watched::Front(SAFARI), &[], OURS, CURSOR, 5.0, 5.0), Verdict::SwitchedApp);
        assert_eq!(check_watched(&Watched::Window(a), &[w(SAFARI, 0, WIN)], OURS, CURSOR, 200.0, 200.0), Verdict::SwitchedApp);
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
    fn its_time_covers_the_overlays_own_ring_time_with_the_flight_included_for_every_allowed_value() {
        // How long a ring stays (point.ringSeconds, 5 to 30 seconds, usual 10). The overlay takes such a ring away that long
        // after the draw was ordered, not after it landed (the flight takes 0.3 to 2.1 s), and the shell sends it that time
        // with the ring, so this watch, which starts when the draw is ordered, always covers the ring's whole life with half
        // a second to spare. Worked out from the same setting, for every value it can have.
        assert!(WATCH_POLL_MS <= 250, "four times a second, like the your turn ring");
        for secs in 5..=30u64 {
            let ring = ring_ms(&serde_json::json!(secs));
            assert_eq!(ring, secs * 1000, "{secs}");
            assert_eq!(watch_ms(ring), secs * 1000 + 500, "{secs}");
            assert!(u64::from(watch_polls(ring)) * WATCH_POLL_MS >= watch_ms(ring), "{secs}: the polls cover the watch");
        }
        // The usual value is today's: a ten second ring watched for ten and a half.
        assert_eq!(RING_MS, 10_000);
        assert_eq!(ring_ms(&serde_json::json!(10)), 10_000);
        assert_eq!(watch_ms(RING_MS), 10_500);
        // Anything the rules refuse is the usual ten seconds; a value between steps goes on its step.
        for odd in [serde_json::json!(4), serde_json::json!(31), serde_json::json!(0), serde_json::json!("10"), serde_json::json!(null), serde_json::json!(-1)] {
            assert_eq!(ring_ms(&odd), RING_MS, "{odd}");
        }
        assert_eq!(ring_ms(&serde_json::json!(12.4)), 12_000);
        // The overlay counts from the order, with the time the shell sent (pointer.ts ringMsOf keeps it inside 5 to 30 s).
        let overlay = include_str!("../../src/overlay.ts");
        let show = &overlay[overlay.find("function show(").unwrap()..overlay.find("void listen(\"overlay-point\"").unwrap()];
        let land = &show[show.find("const land =").unwrap()..show.find("if (reduced) { land(); return; }").unwrap()];
        assert!(show.contains("setTimeout(clear, ringMsOf(p.ringMs))"), "the overlay counts the ring's time from the order");
        assert!(!land.contains("setTimeout(clear"), "not from landing");
        let pointer = include_str!("../../src/pointer.ts");
        assert!(pointer.contains("export const RING_MS = 10_000;"));
    }
    #[test]
    fn the_shell_watches_every_ring_that_does_not_wait_for_a_click() {
        // Wiring: a step of a multi step answer and Point at the problem's line or error ring both start the watch, with or
        // without a window under them (no window: the app in front is watched).
        let main = crate::main_src();
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        assert!(body("fn showme_aim(").contains("watch_ring("), "showme_aim must watch a step that does not wait");
        assert!(body("fn point_problem(").contains("watch_ring("), "point_problem must watch its ring when it does not wait");
        assert!(body("fn watch_ring(").contains("anchor::watch("));
        for name in ["fn showme_aim(", "fn point_problem("] {
            assert!(!body(name).contains("if let Some(an) = anchored"), "{name}: a ring with no window under it is watched too");
        }
        assert!(body("fn draw_pointer_with(").contains("anchor::watched_for("));
        assert!(body("fn your_turn(").contains("anchor::check_watched("), "the ring waiting for a click too");
        let draw = body("fn draw_pointer_with(");
        assert!(draw.contains("anchor::ring_ms(&setting_now(\"point.ringSeconds\"))"), "the ring's time comes from the setting");
        assert!(draw.contains("now() as u64 + anchor::watch_ms(ring)"), "confetti waits as long as the watch");
        assert!(draw.contains("\"ringMs\": ring"), "the overlay is sent the same time");
        assert!(body("fn watch_ring(").contains("anchor::watch_polls(ring)"), "the watch lasts the ring's time plus half a second");
    }
}
