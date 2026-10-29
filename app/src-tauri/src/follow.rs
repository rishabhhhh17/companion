//! The water ring around the pointer (M37, the founder, 30 Oct 2026: "a water ring would be really cool that follows the
//! pointer… make sure it is nice"; it replaces M20's drop, which trailed on a spring and felt laggy). A small ring of the
//! character's water sits centred on the pointer's tip, open in the middle so it never covers what you point at. It is its
//! own tiny window that never takes clicks or the keyboard (main.rs makes it like the pointer's overlay). The shell reads
//! only where the pointer is (macos_see::pointer, no permission), moves the window with it, and tells the page how fast it
//! goes so the ring can stretch a little. Nothing is kept.
//!
//! The rule is plain code here, so it can be tested: the ring is always exactly on the pointer (no spring, so it never
//! trails), and only the speed it reports is smoothed, so the stretch eases in and out.

/// How often the drop moves (milliseconds): about 120 times a second, so it keeps up with a ProMotion screen (M29).
pub const TICK_MS: u64 = 8;
/// The ring's window, square, in points.
pub const SIZE: f64 = 44.0;
/// Where the ring's middle sits from the pointer's tip: right on it.
pub const OFFSET: (f64, f64) = (0.0, 0.0);
/// The fastest speed it reports (points a second), and how quickly the reported speed follows the real one (per second).
pub const MAX_SPEED: f64 = 6_000.0;
pub const SPEED_EASE: f64 = 20.0;
/// A jump this far (another display) reports no speed at all.
pub const LEAP: f64 = 900.0;

/// M33: how wide the window grows to say a short line beside the pointer, and how long a line stays.
pub const SAY_W: f64 = 260.0;
pub const SAY_MS: u64 = 3_500;
/// A line said beside the pointer: kept short so it fits in one line of the bubble.
pub fn say_line(text: &str) -> Option<String> {
    let t: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!t.is_empty() && t.chars().count() <= 40).then_some(t)
}

/// Whether the ring is wanted: only with "drop" chosen (the setting's id from M20; Settings calls it the water ring now).
pub fn wanted(v: &serde_json::Value) -> bool { v.as_str() == Some("drop") }

/// The ring: its middle and the speed it reports, in global top left points.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Drop { pub x: f64, pub y: f64, pub vx: f64, pub vy: f64, pub placed: bool }

impl Drop {
    /// Moves on by `dt` seconds: always exactly onto the pointer. The speed eases toward how fast the pointer went, so the
    /// stretch never flickers. The first time, or after a leap, it is simply there with no speed.
    pub fn step(&mut self, pointer: (f64, f64), dt: f64) {
        let (tx, ty) = (pointer.0 + OFFSET.0, pointer.1 + OFFSET.1);
        if !self.placed || (tx - self.x).hypot(ty - self.y) > LEAP {
            *self = Drop { x: tx, y: ty, vx: 0.0, vy: 0.0, placed: true };
            return;
        }
        let dt = dt.clamp(0.0, 0.1);
        if dt > 0.0 {
            let (ix, iy) = ((tx - self.x) / dt, (ty - self.y) / dt);
            let k = 1.0 - (-dt * SPEED_EASE).exp();
            self.vx += (ix - self.vx) * k; self.vy += (iy - self.vy) * k;
            let s = self.vx.hypot(self.vy);
            if s > MAX_SPEED { self.vx *= MAX_SPEED / s; self.vy *= MAX_SPEED / s; }
        }
        self.x = tx; self.y = ty;
    }
    /// The window's frame for the ring now (global top left points), centred on the pointer.
    pub fn frame(&self) -> [f64; 4] { [self.x - SIZE / 2.0, self.y - SIZE / 2.0, SIZE, SIZE] }
    /// M33: while it says something beside the pointer, the window widens to the right to hold the words; the ring stays
    /// exactly where it was, at the left of the window.
    pub fn frame_saying(&self) -> [f64; 4] { [self.x - SIZE / 2.0, self.y - SIZE / 2.0, SAY_W, SIZE] }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_a_drop_of_water_wants_it() {
        assert!(wanted(&json!("drop")));
        for v in [json!("eyes"), json!("off"), serde_json::Value::Null] { assert!(!wanted(&v), "{v}"); }
    }

    #[test]
    fn it_is_always_exactly_on_the_pointer_with_no_lag() {
        let mut d = Drop::default();
        d.step((100.0, 100.0), 0.008);
        assert_eq!((d.x, d.y), (100.0, 100.0));
        for i in 0..240 {
            let p = (100.0 + i as f64 * 5.0, 100.0 + i as f64 * 2.0);   // a sweep at about 670 points a second
            d.step(p, 0.008);
            assert_eq!((d.x, d.y), p, "never behind the pointer");
            assert!(d.vx.hypot(d.vy) <= MAX_SPEED + 1e-6);
        }
    }
    #[test]
    fn its_speed_eases_in_and_settles_to_nothing_when_the_pointer_stops() {
        let mut d = Drop::default();
        d.step((0.0, 0.0), 0.008);
        for i in 1..=60 { d.step((i as f64 * 8.0, 0.0), 0.008); }   // 1000 points a second
        assert!((d.vx - 1000.0).abs() < 30.0, "{d:?}");
        for _ in 0..60 { d.step((480.0, 0.0), 0.008); }
        assert!(d.vx.hypot(d.vy) < 1.0, "it rests: {d:?}");
    }
    #[test]
    fn a_leap_to_another_display_jumps_instead_of_flying_across() {
        let mut d = Drop::default();
        d.step((100.0, 100.0), 0.016);
        d.step((3000.0, 100.0), 0.016);
        assert_eq!((d.x, d.vx), (3000.0, 0.0));
    }

    #[test]
    fn the_window_is_centred_on_the_ring() {
        let d = Drop { x: 100.0, y: 50.0, vx: 0.0, vy: 0.0, placed: true };
        assert_eq!(d.frame(), [100.0 - SIZE / 2.0, 50.0 - SIZE / 2.0, SIZE, SIZE]);
    }

    #[test]
    fn the_shell_moves_it_only_when_wanted_and_hides_it_under_a_ring() {
        let main = include_str!("main.rs");
        let body = &main[main.find("fn follow_loop(").unwrap()..];
        let body = &body[..body.find("\n}\n").unwrap()];
        assert!(body.contains("follow::wanted(&setting_now(\"character.follow\"))"));
        assert!(body.contains("overlay_busy()"), "it steps aside while a pointer ring is up");
        assert!(body.contains("macos_see::pointer()"));
        assert!(!body.contains("log("), "the pointer's place is never written down");
        let make = &main[main.find("let follow_w = ").unwrap()..];
        assert!(make[..make.find(";\n").unwrap()].contains("\"follow\""));
        assert!(main.contains("FOLLOW.with(|f| { if let Some(p) = f.borrow().as_ref() { p.setSharingType(t); } });"), "it hides from screen sharing like the rest");
    }

    #[test]
    fn a_line_beside_the_pointer_is_short_and_the_drop_does_not_move() {
        assert_eq!(say_line("  Fixed.   Checks pass. ").as_deref(), Some("Fixed. Checks pass."));
        assert_eq!(say_line(""), None);
        assert_eq!(say_line(&"x".repeat(41)), None);
        let d = Drop { x: 100.0, y: 50.0, vx: 0.0, vy: 0.0, placed: true };
        assert_eq!(&d.frame_saying()[..2], &d.frame()[..2]);
        assert_eq!(d.frame_saying()[2], SAY_W);
    }
}
