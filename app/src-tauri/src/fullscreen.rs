//! Is the front app in full screen? macOS has no simple flag for it that works without a permission, so
//! we look at the front app's ordinary windows: a full screen window fills the whole display, menu bar
//! area included (y 0, full height), while a maximized one stops below the menu bar. On a display that
//! keeps nothing free (no menu bar there and no Dock: a second display with Displays have separate Spaces
//! off, or a menu bar that hides itself with the Dock elsewhere), a maximized window fills it exactly too,
//! so there it counts only when the desktop picture is gone as well, as on a full screen Space. A full
//! screen Space hides the menu bar, so what a display keeps free is read only while no window of the front
//! app fills it (`Seen`); a display never seen that way keeps the size only check, which was measured.
//! Window sizes, layers and positions need no permission (names and contents would). Pure logic is tested
//! with real numbers.

pub type Rect = [f64; 4];
/// One on screen window: owner process id, layer, bounds.
#[derive(Clone, Debug, PartialEq)]
pub struct Win { pub pid: i32, pub layer: i64, pub bounds: Rect }

fn same(a: Rect, b: Rect) -> bool { a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() <= 1.0) }

/// The desktop picture's windows sit at the desktop level (kCGDesktopWindowLevel, kCGMinimumWindowLevel + 20): Dock's
/// before macOS 14, WindowManager's at one level either side of it on macOS 27 (measured 20 Oct 2026). Window Server keeps
/// one of its own three below it, which is not the picture.
const DESKTOP_LEVEL: i64 = -2147483623;
fn desktop_shows(wins: &[Win], display: Rect) -> bool { wins.iter().any(|w| (w.layer - DESKTOP_LEVEL).abs() <= 2 && same(w.bounds, display)) }

/// An ordinary (layer 0) window of the front app that exactly covers this display. Overlay windows (layer above 0, like a
/// click catcher) never count.
fn filled(wins: &[Win], front_pid: i32, frame: Rect) -> bool { wins.iter().any(|w| w.pid == front_pid && w.layer == 0 && same(w.bounds, frame)) }

/// What each display was seen to keep free, read only while no window of the front app filled it: then macOS reports the
/// display as it is on an ordinary Space. Keyed by the display's frame; a display that goes away is forgotten.
#[derive(Default, Debug)]
pub struct Seen { nothing_free: Vec<(Rect, bool)> }

impl Seen {
    pub const fn new() -> Self { Seen { nothing_free: Vec::new() } }
    /// Each display's frame and work area now, to each frame and whether it was seen keeping nothing free (false when it
    /// was never seen with nothing filling it: the size only check then decides).
    pub fn look(&mut self, wins: &[Win], front_pid: i32, displays: &[(Rect, Rect)]) -> Vec<(Rect, bool)> {
        self.nothing_free.retain(|(f, _)| displays.iter().any(|(d, _)| same(*f, *d)));
        displays.iter().map(|&(frame, work)| {
            let at = self.nothing_free.iter().position(|(f, _)| same(*f, frame));
            if !filled(wins, front_pid, frame) {
                let now = same(work, frame);
                match at { Some(i) => self.nothing_free[i].1 = now, None => self.nothing_free.push((frame, now)) }
                (frame, now)
            } else {
                (frame, at.map(|i| self.nothing_free[i].1).unwrap_or(false))
            }
        }).collect()
    }
}

/// True when the front app has an ordinary window that exactly covers a whole display. `displays` are each display's frame
/// and whether it was seen keeping nothing free (`Seen::look`). There a maximized window covers it too, so it counts only
/// when that display's desktop picture is not on screen either.
pub fn front_app_is_full_screen(wins: &[Win], front_pid: i32, displays: &[(Rect, bool)]) -> bool {
    displays.iter().any(|&(frame, nothing_free)| filled(wins, front_pid, frame) && (!nothing_free || !desktop_shows(wins, frame)))
}

#[cfg(target_os = "macos")]
pub mod sys {
    use super::{Rect, Win};
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::msg_send;
    use objc2_foundation::{NSArray, NSNumber, NSString};

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" { fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *mut NSArray<AnyObject>; }
    const ON_SCREEN_ONLY: u32 = 1;

    fn get(d: &AnyObject, key: &str) -> Option<Retained<AnyObject>> {
        let k = NSString::from_str(key);
        unsafe { msg_send![d, objectForKey: &*k] }
    }
    fn num(d: &AnyObject, key: &str) -> Option<f64> {
        let v = get(d, key)?;
        let n: &NSNumber = v.downcast_ref::<NSNumber>()?;
        Some(n.doubleValue())
    }

    /// All windows currently on screen. Needs no permission for sizes and owners.
    pub fn on_screen_windows() -> Vec<Win> {
        let raw = unsafe { CGWindowListCopyWindowInfo(ON_SCREEN_ONLY, 0) };
        let Some(list) = (unsafe { Retained::from_raw(raw) }) else { return vec![] };
        list.iter().filter_map(|d| {
            let d: &AnyObject = &d;
            let pid = num(d, "kCGWindowOwnerPID")? as i32;
            let layer = num(d, "kCGWindowLayer")? as i64;
            let b = get(d, "kCGWindowBounds")?;
            let bounds: Rect = [num(&b, "X")?, num(&b, "Y")?, num(&b, "Width")?, num(&b, "Height")?];
            Some(Win { pid, layer, bounds })
        }).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const DISPLAY: Rect = [0.0, 0.0, 1512.0, 982.0];
    /// Its work area: below the 33 point menu bar, with the Dock hidden (measured).
    const WORK: Rect = [0.0, 33.0, 1512.0, 949.0];
    const MAC: (Rect, bool) = (DISPLAY, false);
    const MAC_AREAS: (Rect, Rect) = (DISPLAY, WORK);
    const SAFARI: i32 = 100;
    const CLAUDE: i32 = 200;
    const WINDOW_MANAGER: i32 = 300;
    const WINDOW_SERVER: i32 = 400;
    fn w(pid: i32, layer: i64, b: Rect) -> Win { Win { pid, layer, bounds: b } }
    /// The desktop picture's windows on an ordinary Space, as measured on this Mac (macOS 27, 20 Oct 2026): WindowManager at
    /// one level either side of the desktop level, and Window Server's own one three below it.
    fn desktop(d: Rect) -> Vec<Win> { vec![w(WINDOW_MANAGER, -2147483622, d), w(WINDOW_MANAGER, -2147483624, d), w(WINDOW_SERVER, -2147483626, d)] }

    #[test]
    fn a_window_filling_the_whole_display_is_full_screen() {
        // measured: Safari in full screen sat at x 0, y 0, 1512 by 982
        assert!(front_app_is_full_screen(&[w(SAFARI, 0, [0.0, 0.0, 1512.0, 982.0])], SAFARI, &[MAC]));
    }
    #[test]
    fn a_maximized_window_below_the_menu_bar_is_not() {
        // measured: Safari maximized sat at x 0, y 33, 1512 by 949
        assert!(!front_app_is_full_screen(&[w(SAFARI, 0, [0.0, 33.0, 1512.0, 949.0])], SAFARI, &[MAC]));
        assert!(!front_app_is_full_screen(&[w(SAFARI, 0, [188.0, 33.0, 1324.0, 949.0])], SAFARI, &[MAC]));
    }
    #[test]
    fn on_a_display_that_keeps_nothing_free_a_maximized_window_is_not_full_screen() {
        // A second display with no menu bar (Displays have separate Spaces off) and no Dock, or a menu bar that hides itself
        // with the Dock elsewhere: the work area is the whole display, so a maximized window fills it exactly. Size alone
        // cannot tell, so it counts only once the desktop picture is gone too, as it is on a full screen Space.
        let ext: Rect = [1512.0, 0.0, 1920.0, 1080.0];
        let edge = (ext, true);   // seen keeping nothing free while no full screen app was in front
        let mut wins = desktop(ext);
        wins.extend(desktop(DISPLAY));
        wins.push(w(SAFARI, 0, ext));
        assert!(!front_app_is_full_screen(&wins, SAFARI, &[MAC, edge]), "maximized on the display with nothing kept free");
        // A full screen Space on that display: the desktop picture is not on screen there.
        let mut fs = desktop(DISPLAY);
        fs.push(w(SAFARI, 0, ext));
        assert!(front_app_is_full_screen(&fs, SAFARI, &[MAC, edge]));
        // Window Server's own window below the desktop level is not the desktop picture, and only a window over the same
        // display counts.
        let mut ws = vec![w(WINDOW_SERVER, -2147483626, ext), w(WINDOW_MANAGER, -2147483622, DISPLAY), w(SAFARI, 0, ext)];
        assert!(front_app_is_full_screen(&ws, SAFARI, &[MAC, edge]));
        ws.push(w(WINDOW_MANAGER, -2147483623, ext));   // the desktop level itself (Dock's, before macOS 14)
        assert!(!front_app_is_full_screen(&ws, SAFARI, &[MAC, edge]));
        // Where the menu bar or the Dock keeps room, size alone decides, as measured: the desktop picture changes nothing.
        let mut on_mac = desktop(DISPLAY);
        on_mac.push(w(SAFARI, 0, DISPLAY));
        assert!(front_app_is_full_screen(&on_mac, SAFARI, &[MAC]));
    }
    #[test]
    fn an_invisible_overlay_the_size_of_the_screen_does_not_count() {
        // measured: Claude had a layer 1000 window of 1512 by 982
        assert!(!front_app_is_full_screen(&[w(CLAUDE, 1000, [0.0, 0.0, 1512.0, 982.0]), w(CLAUDE, 0, [0.0, 33.0, 1512.0, 949.0])], CLAUDE, &[MAC]));
    }
    #[test]
    fn only_the_front_apps_windows_count() {
        let wins = [w(SAFARI, 0, [0.0, 0.0, 1512.0, 982.0]), w(CLAUDE, 0, [0.0, 33.0, 1512.0, 949.0])];
        assert!(!front_app_is_full_screen(&wins, CLAUDE, &[MAC]));
        assert!(front_app_is_full_screen(&wins, SAFARI, &[MAC]));
    }
    #[test]
    fn works_on_the_second_display_too() {
        let ext: Rect = [1512.0, 0.0, 1920.0, 1080.0];
        assert!(front_app_is_full_screen(&[w(SAFARI, 0, ext)], SAFARI, &[MAC, (ext, false)]));
    }
    #[test]
    fn no_windows_or_no_displays_is_not_full_screen() {
        assert!(!front_app_is_full_screen(&[], SAFARI, &[MAC]));
        assert!(!front_app_is_full_screen(&[w(SAFARI, 0, DISPLAY)], SAFARI, &[]));
    }
    #[test]
    fn a_rounding_difference_of_one_point_is_tolerated() {
        assert!(front_app_is_full_screen(&[w(SAFARI, 0, [0.0, 0.0, 1511.6, 982.4])], SAFARI, &[MAC]));
    }
    #[test]
    fn looking_at_the_real_windows_works_and_never_prompts() {
        let _ = sys::on_screen_windows();   // would block on a permission prompt if it needed one
    }
    #[test]
    fn a_display_counts_as_keeping_nothing_free_only_when_seen_so_with_no_full_screen_app() {
        // A full screen Space hides the menu bar, so there macOS may report the Mac's own display as all free (not measured).
        // What a display keeps free is therefore recorded only while no window of the front app fills it, and a display
        // never seen that way keeps the size only check, which was measured.
        let mut seen = Seen::default();
        let ext: Rect = [1512.0, 0.0, 1920.0, 1080.0];
        // First look: Safari full screen on the Mac's display, which now reports nothing kept free. Not recorded.
        let full = [w(SAFARI, 0, DISPLAY)];
        assert_eq!(seen.look(&full, SAFARI, &[(DISPLAY, DISPLAY)]), vec![(DISPLAY, false)], "unknown means the measured size check");
        assert!(front_app_is_full_screen(&full, SAFARI, &seen.look(&full, SAFARI, &[(DISPLAY, DISPLAY)])), concat!("a full screen video hides ", crate::product!()));
        // Out of full screen: the menu bar is back and the display keeps room. Recorded as keeping room.
        assert_eq!(seen.look(&[w(SAFARI, 0, WORK)], SAFARI, &[MAC_AREAS]), vec![MAC]);
        // Full screen again, with the desktop picture still listed (not measured either): it still counts.
        let mut again = desktop(DISPLAY);
        again.push(w(SAFARI, 0, DISPLAY));
        assert!(front_app_is_full_screen(&again, SAFARI, &seen.look(&again, SAFARI, &[(DISPLAY, DISPLAY)])));
        // A second display with no menu bar and no Dock, seen with nothing filling it: recorded as keeping nothing free, so
        // a window maximized there later does not count while its desktop picture shows.
        let mut quiet = desktop(ext);
        quiet.push(w(SAFARI, 0, [1600.0, 100.0, 800.0, 600.0]));
        assert_eq!(seen.look(&quiet, SAFARI, &[MAC_AREAS, (ext, ext)]), vec![MAC, (ext, true)]);
        let mut maxed = desktop(ext);
        maxed.push(w(SAFARI, 0, ext));
        assert!(!front_app_is_full_screen(&maxed, SAFARI, &seen.look(&maxed, SAFARI, &[MAC_AREAS, (ext, ext)])));
        // A display that goes away is forgotten, and one seen again starts over.
        seen.look(&[], SAFARI, &[MAC_AREAS]);
        assert_eq!(seen.look(&maxed, SAFARI, &[MAC_AREAS, (ext, ext)]), vec![MAC, (ext, false)]);
        // Only the front app's ordinary windows hold a reading back; another app's window or an overlay does not.
        let mut s2 = Seen::default();
        assert_eq!(s2.look(&[w(CLAUDE, 0, ext), w(SAFARI, 1000, ext)], SAFARI, &[(ext, ext)]), vec![(ext, true)]);
    }
    #[test]
    fn the_shell_gives_each_display_with_what_it_was_seen_to_keep_free() {
        let main = include_str!("main.rs");
        let tick = &main[main.find("fn tick(").unwrap()..]; let tick = &tick[..tick.find("\n}\n").unwrap()];
        assert!(tick.contains("let areas: Vec<(Rect, Rect)> = screens_now(mtm).iter().map(|s| (s.frame, s.work)).collect();"), "{tick}");
        assert!(tick.contains("let displays = FS_SEEN.lock().unwrap_or_else(|e| e.into_inner()).look(&wins, front_pid, &areas);"), "{tick}");
        assert!(tick.contains("fullscreen::front_app_is_full_screen(&wins, front_pid, &displays)"), "{tick}");
    }
}
