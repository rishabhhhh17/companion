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
/// M37c (the founder, sweeping fast: "not working"): a window that follows the pointer is always shown a frame or two after
/// the pointer got there, so on a fast sweep it sits behind the cursor. The ring is placed ahead along the way the pointer
/// moves by this long (seconds), about the time from reading the pointer to the screen showing the move, so it lands on
/// the cursor. Only the place is led; when the pointer stops, the speed eases to nothing and the ring settles exactly on it.
pub const LEAD_S: f64 = 0.024;
/// The most it leads by (points), so a sudden flick never throws it far ahead.
pub const LEAD_MAX: f64 = 60.0;

/// Where to put the ring's middle for a pointer at `p` moving at `v` (points a second): ahead by the time a move takes to show.
pub fn led(p: (f64, f64), v: (f64, f64)) -> (f64, f64) {
    let (mut dx, mut dy) = (v.0 * LEAD_S, v.1 * LEAD_S);
    let m = dx.hypot(dy);
    if !m.is_finite() { return p; }
    if m > LEAD_MAX { dx *= LEAD_MAX / m; dy *= LEAD_MAX / m; }
    (p.0 + dx, p.1 + dy)
}

/// M33: how wide the window grows to say a short line beside the pointer, and how long a line stays.
pub const SAY_W: f64 = 260.0;
pub const SAY_MS: u64 = 3_500;
/// A line said beside the pointer: kept short so it fits in one line of the bubble.
pub fn say_line(text: &str) -> Option<String> {
    let t: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!t.is_empty() && t.chars().count() <= 40).then_some(t)
}

/// Whether the ring is wanted: only with "drop" chosen (the setting's id from M20; Settings calls it the water ring now).
/// Nothing set (Null) is the usual one, the water ring.
pub fn wanted(v: &serde_json::Value) -> bool { v.is_null() || v.as_str() == Some("drop") }

/// M46 (F28), M51: How lively is Lively (character.lively). Nothing set is the usual, Lively (the founder, 1 Nov 2026: "I do
/// not see the water ring following me"). A word it does not know is Still, the quiet side.
pub fn is_lively(v: &serde_json::Value) -> bool { v.is_null() || v.as_str() == Some("lively") }

/// M46 (F28): whether the water ring is on the pointer now. Never while Companion is hidden, never while a ring points at a
/// place (that ring is the ring: Show me how or Point at the problem; spec section 0 item 4), and only with A water ring
/// chosen (`follow`; No means nothing, not even while it listens). Then: always while it listens, in every choice, and at
/// rest only in Lively and not while `quiet` (on a call or presenting, or resting in Low Power Mode). Still and Gentle keep
/// it off at rest.
pub fn shown(lively: &serde_json::Value, follow: &serde_json::Value, listening: bool, pointing: bool, quiet: bool, hidden: bool) -> bool {
    if hidden || pointing || !wanted(follow) { return false; }
    listening || (is_lively(lively) && !quiet)
}

/// What a thread that watches the pointer does next. Tick: again after this many milliseconds. Park: sleep with no timer
/// until it is woken (main.rs follow_wake, gaze_wake). ParkFor: sleep until it is woken or this many milliseconds pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Next { Tick(u64), Park, ParkFor(u64) }

/// The ring's thread: TICK_MS ticks while the ring is shown. While a ring points at a place and would go by itself in
/// `busy_left_ms` (one that waits for a click, or that is kept, has none: putting it away wakes the thread), it sleeps that
/// long, but only when the water ring would show once it is gone. Otherwise it sleeps until woken.
pub fn next(shown: bool, busy_left_ms: Option<u64>, ring_otherwise_wanted: bool) -> Next {
    if shown { return Next::Tick(TICK_MS); }
    match busy_left_ms { Some(ms) if ring_otherwise_wanted => Next::ParkFor(ms.max(1)), _ => Next::Park }
}

/// The ring's page learns that the ring shows only from follow-show, and it cannot ask the shell (it only listens). Events
/// are not kept: a follow-show sent before the page's listeners are up (at launch the ring can show in Lively before its
/// page has loaded) is lost, and the ring would stay blank while it shows. So for RESHOW_MS after the page finishes
/// loading, while the ring shows, the thread tells it again every RESHOW_EVERY ticks (about every 100 ms). After that,
/// nothing more is sent.
pub const RESHOW_MS: u64 = 1_500;
pub const RESHOW_EVERY: u64 = 12;
pub fn reshow(shown: bool, tick: u64, since_load_ms: Option<u64>) -> bool {
    shown && tick % RESHOW_EVERY == 0 && since_load_ms.is_some_and(|ms| ms <= RESHOW_MS)
}

/// M46: after a Your turn click, the drop flies back to the character and confetti may play only in Lively with Little
/// reactions on (fun.reactions) and no Reduce motion or Less motion. Otherwise the ring turns green, the tick draws, and
/// nothing flies home.
pub fn flies_home(lively: &serde_json::Value, reactions: &serde_json::Value, reduced: bool) -> bool {
    is_lively(lively) && reactions.as_bool() != Some(false) && !reduced
}

/// M46: Fly to the place first (point.fly). Off (the usual), the Show me how ring shows at the place at once, with no drop
/// leaving the character and no poke on it.
pub fn flies(v: &serde_json::Value) -> bool { v.as_bool() == Some(true) }

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
        assert!(wanted(&serde_json::Value::Null), "nothing set is the usual one, the water ring");
        for v in [json!("eyes"), json!("off"), json!(true)] { assert!(!wanted(&v), "{v}"); }
    }

    #[test]
    fn the_ring_shows_at_rest_only_in_lively_and_while_listening_in_every_choice() {
        let null = serde_json::Value::Null;
        let (still, gentle, lively, drop) = (json!("still"), json!("gentle"), json!("lively"), json!("drop"));
        // At rest: Still and Gentle keep it off, Lively shows it. Nothing set is Lively, the usual (M51: the founder could not
        // see the ring following his pointer).
        assert!(!shown(&still, &drop, false, false, false, false));
        assert!(!shown(&gentle, &drop, false, false, false, false));
        assert!(shown(&null, &drop, false, false, false, false), "nothing set is the usual, Lively");
        assert!(!shown(&json!("calm"), &drop, false, false, false, false), "an unknown word is Still");
        assert!(shown(&lively, &drop, false, false, false, false));
        assert!(shown(&lively, &null, false, false, false, false), "nothing set for what follows is the water ring");
        // Listening shows it in every choice with the water ring.
        for l in [&still, &gentle, &lively, &null] { assert!(shown(l, &drop, true, false, false, false), "{l}"); }
        // Its eyes and No never show it, not even while listening.
        for f in [json!("eyes"), json!("off")] {
            for l in [&still, &gentle, &lively] { for listening in [false, true] { assert!(!shown(l, &f, listening, false, false, false), "{l} {f} {listening}"); } }
        }
        // A ring pointing at a place is the ring, and hidden always hides it.
        for l in [&still, &lively] { for listening in [false, true] {
            assert!(!shown(l, &drop, listening, true, false, false), "pointing: {l} {listening}");
            assert!(!shown(l, &drop, listening, false, false, true), "hidden: {l} {listening}");
            assert!(!shown(l, &drop, listening, false, true, true), "hidden and quiet: {l} {listening}");
        } }
        // On a call (or resting): Lively's ring at rest goes, the listening ring stays.
        assert!(!shown(&lively, &drop, false, false, true, false));
        assert!(shown(&lively, &drop, true, false, true, false));
        assert!(shown(&still, &drop, true, false, true, false));
    }

    #[test]
    fn the_rings_thread_ticks_only_while_shown_and_otherwise_sleeps() {
        assert_eq!(next(true, None, true), Next::Tick(TICK_MS));
        assert_eq!(next(true, Some(500), true), Next::Tick(8));
        assert_eq!(next(false, None, false), Next::Park);
        assert_eq!(next(false, None, true), Next::Park, "a ring that waits for a click: putting it away wakes the thread");
        assert_eq!(next(false, Some(4_000), true), Next::ParkFor(4_000), "a ring that goes by itself: back when it is gone");
        assert_eq!(next(false, Some(4_000), false), Next::Park, "nothing to come back for in Still at rest");
        assert_eq!(next(false, Some(0), true), Next::ParkFor(1));
    }

    #[test]
    fn a_page_that_loads_under_a_ring_already_shown_is_told_again_for_a_moment_then_never() {
        assert!(reshow(true, RESHOW_EVERY, Some(0)), "the page just loaded under a shown ring");
        assert!(reshow(true, RESHOW_EVERY * 5, Some(RESHOW_MS)));
        assert!(!reshow(true, RESHOW_EVERY + 1, Some(10)), "only every few ticks");
        assert!(!reshow(true, RESHOW_EVERY, Some(RESHOW_MS + 1)), "once the page has had time, nothing more is sent");
        assert!(!reshow(true, RESHOW_EVERY, None), "before the page has loaded there is nobody to tell");
        assert!(!reshow(false, RESHOW_EVERY, Some(0)), "a ring that is not shown is not shown again");
        assert!(RESHOW_EVERY * TICK_MS <= 100 && RESHOW_MS >= 1_000);
    }

    #[test]
    fn the_drop_flies_home_only_in_lively_with_reactions_and_motion_and_flies_out_only_when_chosen() {
        let null = serde_json::Value::Null;
        assert!(flies_home(&json!("lively"), &json!(true), false));
        assert!(flies_home(&json!("lively"), &null, false), "Little reactions is on unless turned off");
        assert!(!flies_home(&json!("lively"), &json!(false), false));
        assert!(!flies_home(&json!("lively"), &json!(true), true), "Reduce motion or Less motion");
        for l in [json!("still"), json!("gentle")] { assert!(!flies_home(&l, &json!(true), false), "{l}"); }
        assert!(flies_home(&null, &json!(true), false), "nothing set is the usual, Lively");
        assert!(flies(&json!(true)));
        for v in [json!(false), null, json!("on")] { assert!(!flies(&v), "{v}"); }
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

    fn fn_body<'a>(main: &'a str, start: &str) -> &'a str {
        let b = &main[main.find(start).unwrap_or_else(|| panic!("{start}"))..];
        &b[..b.find("\n}\n").map(|i| i + 2).unwrap_or(b.len())]
    }

    #[test]
    fn the_rings_thread_sleeps_with_no_timer_while_the_ring_is_not_shown() {
        let main = include_str!("main.rs");
        let body = fn_body(main, "fn follow_loop(");
        assert!(body.contains("follow::shown(") && body.contains("follow::next("), "{body}");
        assert!(body.contains("setting_now(\"character.follow\")") && body.contains("setting_now(\"character.lively\")"));
        assert!(body.contains("listening_now()") && body.contains("overlay_busy()") && body.contains("companion_hidden()") && body.contains("REST.load("));
        assert!(body.contains("FOLLOW_THREAD.set(std::thread::current())"), "it can be woken from the moment it reads");
        // The not shown path: the window is put away once, the page is told to draw nothing, then it parks. No sleep on it.
        let at = body.find("follow::Next::Park").expect("a park branch");
        let hidden = &body[at..at + body[at..].find("continue;").expect("the park branch ends with continue")];
        assert!(hidden.contains("std::thread::park()") && hidden.contains("std::thread::park_timeout("), "{hidden}");
        assert!(hidden.contains("\"follow-hide\"") && hidden.contains("FOLLOW_LIVE.store(false"), "{hidden}");
        assert!(!hidden.contains("sleep("), "no timer on the not shown path: {hidden}");
        assert!(body.contains("\"follow-show\""), "the page is told once when it shows");
        // A page that loads under a ring already shown is told again (reshow), before any early continue skips it.
        let re = body.find("follow::reshow(shown, tick, ").expect("the page is told again after it loads");
        assert!(re < body.find("let p = macos_see::pointer();").unwrap(), "{body}");
        assert!(body.contains("FOLLOW_PAGE_AT.load("));
        let make = &main[main.find("let follow_w = ").unwrap()..];
        let make = &make[..make.find(".build()?;").unwrap()];
        assert!(make.contains("on_page_load(") && make.contains("PageLoadEvent::Finished") && make.contains("FOLLOW_PAGE_AT.store(") && make.contains("follow_wake()"), "{make}");
        // The only sleep is the tick while it is shown.
        assert_eq!(body.matches("sleep(").count(), 1, "{body}");
        assert!(body.contains("follow::Next::Tick(ms) => std::thread::sleep(Duration::from_millis(ms))"));
        // Everything that can show it again wakes it.
        assert!(fn_body(main, "fn listening(").contains("follow_wake()"));
        let worker = fn_body(main, "fn voice_worker(");
        let (light, wake) = (worker.find("say_voice(&app, \"listening\", LISTENING, json!({}));").unwrap(), worker.find("follow_wake();").expect("the worker wakes the ring"));
        assert!(light < wake, "rule 5: the light is lit first, then the listening ring wakes");
        for f in ["fn draw_pointer_with(", "fn hide_overlay(", "fn point_cancel(", "fn home_setting_applied(", "fn set_user_hidden(", "fn rest_tick("] {
            assert!(fn_body(main, f).contains("follow_wake()"), "{f}");
        }
        let draw = fn_body(main, "fn draw_pointer_with(");
        assert!(draw.find("OVERLAY_BUSY_UNTIL.store(until").unwrap() < draw.find("follow_wake()").unwrap(), "woken after the busy time is set");
        assert!(fn_body(main, "fn tick(").matches("follow_wake()").count() >= 2, "hidden for a full screen app and shown again");
        // The mouse watch costs nothing while the ring is away: it returns at once.
        assert!(fn_body(main, "fn follow_to_pointer(").contains("if !FOLLOW_LIVE.load(Ordering::SeqCst) { return; }"));
    }

    #[test]
    fn the_shell_moves_it_only_when_wanted_and_hides_it_under_a_ring() {
        let main = include_str!("main.rs");
        let body = fn_body(main, "fn follow_loop(");
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
    #[test]
    fn it_leads_a_fast_pointer_by_the_time_a_move_takes_and_sits_exactly_on_a_still_one() {
        assert_eq!(led((100.0, 100.0), (0.0, 0.0)), (100.0, 100.0));
        let (x, y) = led((100.0, 100.0), (1000.0, 0.0));
        assert!((x - 124.0).abs() < 1e-9 && y == 100.0);
        let (fx, fy) = led((0.0, 0.0), (100_000.0, 100_000.0));
        assert!((fx.hypot(fy) - LEAD_MAX).abs() < 1e-9, "a flick never throws it far ahead");
        assert_eq!(led((5.0, 5.0), (f64::NAN, 1.0)), (5.0, 5.0));
    }
}
