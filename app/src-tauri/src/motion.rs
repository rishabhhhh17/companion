//! One motion system (M66 Part 1), for the shell's own window moves. The same durations, curves and interface spring as
//! the pages (`app/src/ui/tokens.css` and `app/src/motionTokens.ts`); the test below reads tokens.css and fails the moment
//! the two disagree, and motionTokens.test.ts reads this file the same way. Pure: no AppKit here (main.rs sets the curve).
//! The whole table is kept here although the shell uses only part of it today, so later moves read it, never a new number.
#![allow(dead_code)]

/// The four durations, in ms: press, hover and every exit; menus, toasts and small panels; surfaces; window trips.
pub const DUR_1_MS: u64 = 120;
pub const DUR_2_MS: u64 = 200;
pub const DUR_3_MS: u64 = 240;
pub const DUR_4_MS: u64 = 320;

/// Ease out (every enter, move, land and grow) and exit (leaving only), as CAMediaTimingFunction control points.
pub const EASE_OUT: [f32; 4] = [0.23, 1.0, 0.32, 1.0];
pub const EASE_EXIT: [f32; 4] = [0.4, 0.0, 1.0, 1.0];

/// The interface spring: stiffness and damping per second (damping ratio about 0.99, it never passes its target).
pub const MOTION_SPRING_K: f64 = 640.0;
pub const MOTION_SPRING_C: f64 = 50.0;

/// A duration in seconds, for an NSAnimationContext.
pub fn secs(ms: u64) -> f64 { ms as f64 / 1000.0 }

/// Where a cubic-bezier curve is at time `t` (0 to 1).
pub fn bezier_at(p: [f32; 4], t: f64) -> f64 {
    let [x1, y1, x2, y2] = p.map(f64::from);
    let at = |a: f64, b: f64, s: f64| 3.0 * a * s * (1.0 - s).powi(2) + 3.0 * b * s * s * (1.0 - s) + s.powi(3);
    if t <= 0.0 { return 0.0; }
    if t >= 1.0 { return 1.0; }
    let (mut lo, mut hi, mut s) = (0.0, 1.0, t);
    for _ in 0..40 { s = (lo + hi) / 2.0; if at(x1, x2, s) < t { lo = s; } else { hi = s; } }
    at(y1, y2, s)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKENS: &str = include_str!("../../src/ui/tokens.css");

    /// The value a token is given first in tokens.css (the root's own, before any look changes it).
    fn token(name: &str) -> String {
        let key = format!("{name}:");
        let at = TOKENS.find(&key).unwrap_or_else(|| panic!("{name} is not in tokens.css"));
        let rest = &TOKENS[at + key.len()..];
        rest[..rest.find(';').unwrap()].trim().to_string()
    }
    fn ms(name: &str) -> u64 { token(name).trim_end_matches("ms").parse().unwrap_or_else(|_| panic!("{name}: {}", token(name))) }
    fn curve(name: &str) -> [f32; 4] {
        let v = token(name);
        let inner = v.trim_start_matches("cubic-bezier(").trim_end_matches(')');
        let n: Vec<f32> = inner.split(',').map(|x| x.trim().parse().unwrap()).collect();
        [n[0], n[1], n[2], n[3]]
    }

    #[test]
    fn the_shell_moves_on_the_same_table_as_the_pages() {
        assert_eq!([ms("--dur-1"), ms("--dur-2"), ms("--dur-3"), ms("--dur-4")], [DUR_1_MS, DUR_2_MS, DUR_3_MS, DUR_4_MS]);
        assert_eq!(curve("--ease-out"), EASE_OUT);
        assert_eq!(curve("--ease-exit"), EASE_EXIT);
        assert!(TOKENS.contains("(MOTION_SPRING, k 640, c 50)"), "tokens.css names the spring it was made from");
        assert_eq!((MOTION_SPRING_K, MOTION_SPRING_C), (640.0, 50.0));
    }

    #[test]
    fn no_look_changes_a_duration_or_a_curve() {
        for name in ["--dur-1:", "--dur-2:", "--dur-3:", "--dur-4:", "--ease-out:", "--ease-exit:", "--ease-spring:"] {
            assert_eq!(TOKENS.matches(name).count(), 1, "{name} is written once, for both looks");
        }
    }

    #[test]
    fn the_curves_stay_inside_their_ends_and_ease_out_answers_at_once() {
        for p in [EASE_OUT, EASE_EXIT] { assert!(p.iter().all(|&v| (0.0..=1.0).contains(&v)), "{p:?}: no control point outside 0 to 1"); }
        assert!(bezier_at(EASE_OUT, 0.25) > 0.6, "ease out is most of the way there a quarter in");
        assert!(bezier_at(EASE_EXIT, 0.25) < 0.1, "an exit starts gently and leaves fast");
        let mut last = 0.0;
        for i in 0..=100 { let y = bezier_at(EASE_OUT, i as f64 / 100.0); assert!(y + 1e-9 >= last && y <= 1.0 + 1e-9); last = y; }
    }

    #[test]
    fn the_spring_never_passes_its_target_and_settles_in_about_a_third_of_a_second() {
        assert!(MOTION_SPRING_C / (2.0 * MOTION_SPRING_K.sqrt()) > 0.98);
        let (mut x, mut v, h) = (0.0f64, 0.0f64, 1.0 / 4000.0);
        let mut settled = None;
        for i in 0..8000 {
            v += (-MOTION_SPRING_K * (x - 1.0) - MOTION_SPRING_C * v) * h;
            x += v * h;
            assert!(x <= 1.0 + 1e-6, "passed its target at {i}");
            if settled.is_none() && (1.0 - x).abs() < 0.5 / 240.0 { settled = Some(i as f64 * h); }
        }
        let t = settled.unwrap();
        assert!((0.25..=0.45).contains(&t), "settles within half a point of a 240 point move in {t} s");
    }
}
