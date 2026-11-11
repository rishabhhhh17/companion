//! M66 (the plan's fix 6): a trip across the screen moves on the display's own clock. It used to run on a thread that
//! slept 16 ms, measured the time itself and queued a frame for the main thread each step; the sleep drifts and the queue
//! waits behind other work, so a trip on a 120 Hz screen stuttered. Now the character's window owns a display link (macOS
//! 14 and later, `NSWindow displayLinkWithTarget:selector:`), and each refresh moves the window once, to where the trip is
//! at the time that frame will show (the link's target timestamp). Nothing sleeps, nothing is queued.
//!
//! The rule is plain code here (`Fly`), so it can be tested: progress comes only from the frame times it is given, a
//! frame while the pointer is over the character or the person drags it does not count, and it ends exactly on its place.

use crate::docking::Rect;
use crate::roam;

/// One trip along the arrow's arc (roam::arc_at) from `from` to `to`, `ms` long, eased by roam::ease.
#[derive(Clone, Copy, Debug)]
pub struct Fly { from: Rect, to: Rect, total: f64, up: bool, done: f64, last: Option<f64> }

impl Fly {
    pub fn new(from: Rect, to: Rect, ms: u64, up: bool) -> Fly { Fly { from, to, total: ms.max(1) as f64, up, done: 0.0, last: None } }
    /// The frame that will show at `t` seconds (any clock that only goes forward). `held`: the pointer is over the
    /// character or the person drags it, so the time since the last frame does not count. Gives where the window goes and
    /// whether the trip has ended (then it is exactly at `to`). A frame time that goes back, or a gap of over a quarter
    /// of a second (the Mac slept, the screen changed), counts as one frame at most, so it never leaps.
    pub fn frame(&mut self, t: f64, held: bool) -> (Rect, bool) {
        let dt = match self.last { Some(l) if t > l => ((t - l) * 1000.0).min(FRAME_MAX_MS), _ => 0.0 };
        self.last = Some(t);
        if !held { self.done = (self.done + dt).min(self.total); }
        let end = self.done >= self.total;
        (if end { self.to } else { roam::arc_at(self.from, self.to, roam::ease(self.done / self.total), self.up) }, end)
    }
}
/// The most one frame counts for (ms): a long gap moves the trip on by one ordinary frame, never by the whole gap.
pub const FRAME_MAX_MS: f64 = 34.0;

/// The display link on the character's window, on the main thread. One trip at a time: a new one replaces the old,
/// whose step is dropped (its thread hears it ended without arriving).
pub mod clock {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::NSWindow;
    use objc2_foundation::{NSObject, NSRunLoop, NSRunLoopCommonModes};
    use std::cell::RefCell;

    define_class!(
        // SAFETY: NSObject has no rules for subclasses, and this class has no Drop and no instance variables. Its one
        // method has the signature CADisplayLink calls (one object argument, no result).
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "SquibbyTripClock"]
        pub struct TripClock;

        impl TripClock {
            #[unsafe(method(tick:))]
            fn tick(&self, link: &AnyObject) { super::clock::on_tick(link); }
        }
    );

    /// What runs on each refresh, given the time that frame shows (seconds): true to keep going.
    pub type Step = Box<dyn FnMut(f64) -> bool>;
    struct Running { link: Retained<NSObject>, _target: Retained<TripClock>, step: Option<Step> }
    thread_local! { static RUN: RefCell<Option<Running>> = const { RefCell::new(None) }; }

    /// Starts calling `step` once per refresh of the display `win` is on, from the next frame. Main thread.
    pub fn run(mtm: MainThreadMarker, win: &NSWindow, step: Step) {
        stop();
        let this = TripClock::alloc(mtm).set_ivars(());
        let target: Retained<TripClock> = unsafe { msg_send![super(this), init] };
        let link = unsafe { win.displayLinkWithTarget_selector(&target, sel!(tick:)) };
        let link: Retained<NSObject> = Retained::into_super(link);
        let _: () = unsafe { msg_send![&*link, addToRunLoop: &*NSRunLoop::mainRunLoop(), forMode: NSRunLoopCommonModes] };
        RUN.with(|r| *r.borrow_mut() = Some(Running { link, _target: target, step: Some(step) }));
    }

    /// Stops the trip in hand, if any (its step is dropped). Main thread.
    pub fn stop() {
        if let Some(old) = RUN.with(|r| r.borrow_mut().take()) { let _: () = unsafe { msg_send![&*old.link, invalidate] }; }
    }

    fn on_tick(link: &AnyObject) {
        let t: f64 = unsafe { msg_send![link, targetTimestamp] };
        // The step runs with nothing borrowed, so it may start or stop a trip itself.
        let Some(mut step) = RUN.with(|r| r.borrow_mut().as_mut().and_then(|x| x.step.take())) else { return };
        let more = step(t);
        let same = RUN.with(|r| r.borrow().as_ref().is_some_and(|x| std::ptr::eq(&*x.link as *const NSObject as *const AnyObject, link as *const AnyObject)));
        if !same { return; }   // replaced or stopped meanwhile: this step is done
        if more { RUN.with(|r| if let Some(x) = r.borrow_mut().as_mut() { x.step = Some(step); }); } else { stop(); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: Rect = [100.0, 300.0, 132.0, 94.0];
    const B: Rect = [900.0, 500.0, 132.0, 94.0];

    #[test]
    fn progress_comes_only_from_the_frame_times() {
        let mut f = Fly::new(A, B, 400, true);
        // The first frame only starts the clock: it is where it was.
        assert_eq!(f.frame(10.0, false), (roam::arc_at(A, B, 0.0, true), false));
        // 120 Hz frames: each one moves it on by its own share of the time, on the arc and the ease.
        let mut t = 10.0;
        let mut last = A;
        for i in 1..48 {
            t += 1.0 / 120.0;
            let (r, end) = f.frame(t, false);
            let want = roam::arc_at(A, B, roam::ease((i as f64 * 1000.0 / 120.0).min(400.0) / 400.0), true);
            assert!((r[0] - want[0]).abs() < 1e-6 && (r[1] - want[1]).abs() < 1e-6, "frame {i}");
            assert!(r[0] >= last[0], "it never goes back");
            last = r;
            assert!(!end, "frame {i}");
        }
        // 400 ms at 120 Hz is 48 frames: it ends on the 48th (or the next, by a rounding hair), exactly on its place.
        let mut ended = None;
        for _ in 0..2 { t += 1.0 / 120.0; let (r, end) = f.frame(t, false); if end { ended = Some(r); break; } }
        assert_eq!(ended, Some(B), "it ends exactly on its place");
    }

    #[test]
    fn held_frames_do_not_count_and_a_long_gap_never_leaps() {
        let mut f = Fly::new(A, B, 400, false);
        f.frame(0.0, false);
        let (r1, _) = f.frame(0.1, false);
        // Held for a second (the pointer over it): it stays where it was.
        for i in 1..=120 { let (r, end) = f.frame(0.1 + i as f64 / 120.0, true); assert_eq!(r, r1); assert!(!end); }
        // Then a two second gap (the Mac slept): one ordinary frame at most.
        let (r2, _) = f.frame(3.2, false);
        let want = roam::arc_at(A, B, roam::ease((34.0 + 34.0) / 400.0), false);
        assert!((r2[0] - want[0]).abs() < 1e-6, "{r2:?} {want:?}");
        // A frame time that goes back counts for nothing.
        assert_eq!(f.frame(3.0, false).0, r2);
    }

    #[test]
    fn the_trip_runs_on_the_display_link_never_on_a_sleeping_thread() {
        let main = crate::main_src();
        let body = |name: &str| { let a = main.find(name).unwrap_or_else(|| panic!("{name}")); &main[a..a + main[a..].find("\n}\n").unwrap()] };
        let fly = body("fn roam_fly(");
        assert!(fly.contains("trip::Fly::new(from, to, ms, up)"), "{fly}");
        assert!(fly.contains("rx.recv()"), "{fly}");
        let start = body("fn trip_start(");
        assert!(start.contains("trip::clock::run(mtm, d, Box::new(move |t| {"), "{start}");
        // Once per refresh: one origin set, no motion helper, no sleep, no queue to the main thread.
        for bad in ["thread::sleep", "set_frame_moving(", "run_on_main_thread", "setFrame_display"] {
            let tick = &start[start.find("Box::new(move |t|").unwrap()..];
            assert!(!tick.contains(bad), "the frame step must not {bad}");
        }
        assert!(start.contains("d2.setFrameOrigin("), "{start}");
        assert!(start.contains("if ROAM_GEN.load(Ordering::SeqCst) != gen {"), "a newer trip or a drag stops it, checked each frame");
        // The roam thread no longer steps the trip itself.
        assert!(!main.contains("std::thread::sleep(Duration::from_millis(16));\n        if ROAM_GEN"));
    }
}
