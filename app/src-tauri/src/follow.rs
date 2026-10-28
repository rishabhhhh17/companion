//! A drop that follows you (M20, character.follow "drop", the founder: "use some water based tool that will work as a
//! pointer, and if they don't want it, it won't be there"). A small drop of the character's water trails the pointer on a
//! spring and settles beside it when the pointer stops. It is its own tiny window that never takes clicks or the keyboard
//! (main.rs makes it like the pointer's overlay). The shell reads only where the pointer is (macos_see::pointer, no
//! permission), moves the window, and tells the page how fast it goes so the drop can stretch. Nothing is kept.
//!
//! The spring is plain code here, so it can be tested: it settles beside the pointer, never runs away, and jumps straight
//! there the first time or after the pointer leaps (another display).

/// How often the drop moves (milliseconds): about sixty times a second.
pub const TICK_MS: u64 = 16;
/// The drop's window, square, in points.
pub const SIZE: f64 = 44.0;
/// Where the drop rests from the pointer's tip: a little below and to the right, never under it.
pub const OFFSET: (f64, f64) = (16.0, 18.0);
/// The spring: stiffness and damping per second (a touch under critical, so it wobbles once as it settles).
pub const K: f64 = 170.0;
pub const C: f64 = 20.0;
/// The fastest it may go (points a second) and the leap that makes it jump instead of fly (points).
pub const MAX_SPEED: f64 = 6_000.0;
pub const LEAP: f64 = 900.0;

/// Whether the drop is wanted: only with A drop of water chosen.
pub fn wanted(v: &serde_json::Value) -> bool { v.as_str() == Some("drop") }

/// The drop: its middle and its speed, in global top left points.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Drop { pub x: f64, pub y: f64, pub vx: f64, pub vy: f64, pub placed: bool }

impl Drop {
    /// Moves on by `dt` seconds toward its place beside `pointer`. The first time, or after a leap, it is simply there.
    pub fn step(&mut self, pointer: (f64, f64), dt: f64) {
        let (tx, ty) = (pointer.0 + OFFSET.0, pointer.1 + OFFSET.1);
        if !self.placed || (tx - self.x).hypot(ty - self.y) > LEAP {
            *self = Drop { x: tx, y: ty, vx: 0.0, vy: 0.0, placed: true };
            return;
        }
        let dt = dt.clamp(0.0, 0.1);
        let steps = (dt / 0.004).ceil().max(1.0) as usize;
        let h = dt / steps as f64;
        for _ in 0..steps {
            let ax = K * (tx - self.x) - C * self.vx;
            let ay = K * (ty - self.y) - C * self.vy;
            self.vx += ax * h; self.vy += ay * h;
            let s = self.vx.hypot(self.vy);
            if s > MAX_SPEED { self.vx *= MAX_SPEED / s; self.vy *= MAX_SPEED / s; }
            self.x += self.vx * h; self.y += self.vy * h;
        }
    }
    /// The window's frame for the drop now (global top left points).
    pub fn frame(&self) -> [f64; 4] { [self.x - SIZE / 2.0, self.y - SIZE / 2.0, SIZE, SIZE] }
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
    fn it_starts_beside_the_pointer_and_settles_there_after_a_move() {
        let mut d = Drop::default();
        d.step((100.0, 100.0), 0.016);
        assert_eq!((d.x, d.y), (100.0 + OFFSET.0, 100.0 + OFFSET.1));
        for _ in 0..120 { d.step((400.0, 300.0), 0.016); }   // two seconds after the pointer moved
        assert!((d.x - (400.0 + OFFSET.0)).abs() < 0.5 && (d.y - (300.0 + OFFSET.1)).abs() < 0.5, "{d:?}");
        assert!(d.vx.hypot(d.vy) < 2.0);
    }

    #[test]
    fn it_trails_behind_while_the_pointer_moves_and_never_runs_away() {
        let mut d = Drop::default();
        d.step((0.0, 0.0), 0.016);
        let mut max_over: f64 = 0.0;
        for i in 0..240 {
            let p = (i as f64 * 5.0, 0.0);   // the pointer sweeps right at 300 points a second
            d.step(p, 0.016);
            assert!(d.vx.hypot(d.vy) <= MAX_SPEED + 1e-6);
            max_over = max_over.max(d.x - (p.0 + OFFSET.0));
            if i == 60 { assert!(d.x < p.0 + OFFSET.0, "it lags behind a moving pointer"); }
        }
        assert!(max_over < 40.0, "a small overshoot at most: {max_over}");
        for _ in 0..200 { d.step((1195.0, 0.0), 0.016); }
        assert!((d.x - (1195.0 + OFFSET.0)).abs() < 0.5);
    }

    #[test]
    fn a_leap_to_another_display_jumps_instead_of_flying_across() {
        let mut d = Drop::default();
        d.step((100.0, 100.0), 0.016);
        d.step((3000.0, 100.0), 0.016);
        assert_eq!((d.x, d.vx), (3000.0 + OFFSET.0, 0.0));
    }

    #[test]
    fn the_window_is_centred_on_the_drop() {
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
}
