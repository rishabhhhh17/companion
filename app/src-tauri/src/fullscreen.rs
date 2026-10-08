//! Is the front app in full screen? macOS has no simple flag for it that works without a permission, so
//! we look at the front app's ordinary windows: a full screen window fills the whole display, menu bar
//! area included (y 0, full height), while a maximized one stops below the menu bar. Window sizes and
//! positions need no permission (names and contents would). Pure logic is tested with real numbers.

pub type Rect = [f64; 4];
/// One on screen window: owner process id, layer, bounds.
#[derive(Clone, Debug, PartialEq)]
pub struct Win { pub pid: i32, pub layer: i64, pub bounds: Rect }

fn same(a: Rect, b: Rect) -> bool { a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() <= 1.0) }

/// True when the front app has an ordinary (layer 0) window that exactly covers a whole display.
/// Overlay windows (layer above 0, like a click catcher) never count.
pub fn front_app_is_full_screen(wins: &[Win], front_pid: i32, displays: &[Rect]) -> bool {
    wins.iter().any(|w| w.pid == front_pid && w.layer == 0 && displays.iter().any(|d| same(w.bounds, *d)))
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
    const SAFARI: i32 = 100;
    const CLAUDE: i32 = 200;
    fn w(pid: i32, layer: i64, b: Rect) -> Win { Win { pid, layer, bounds: b } }

    #[test]
    fn a_window_filling_the_whole_display_is_full_screen() {
        // measured: Safari in full screen sat at x 0, y 0, 1512 by 982
        assert!(front_app_is_full_screen(&[w(SAFARI, 0, [0.0, 0.0, 1512.0, 982.0])], SAFARI, &[DISPLAY]));
    }
    #[test]
    fn a_maximized_window_below_the_menu_bar_is_not() {
        // measured: Safari maximized sat at x 0, y 33, 1512 by 949
        assert!(!front_app_is_full_screen(&[w(SAFARI, 0, [0.0, 33.0, 1512.0, 949.0])], SAFARI, &[DISPLAY]));
        assert!(!front_app_is_full_screen(&[w(SAFARI, 0, [188.0, 33.0, 1324.0, 949.0])], SAFARI, &[DISPLAY]));
    }
    #[test]
    fn an_invisible_overlay_the_size_of_the_screen_does_not_count() {
        // measured: Claude had a layer 1000 window of 1512 by 982
        assert!(!front_app_is_full_screen(&[w(CLAUDE, 1000, [0.0, 0.0, 1512.0, 982.0]), w(CLAUDE, 0, [0.0, 33.0, 1512.0, 949.0])], CLAUDE, &[DISPLAY]));
    }
    #[test]
    fn only_the_front_apps_windows_count() {
        let wins = [w(SAFARI, 0, [0.0, 0.0, 1512.0, 982.0]), w(CLAUDE, 0, [0.0, 33.0, 1512.0, 949.0])];
        assert!(!front_app_is_full_screen(&wins, CLAUDE, &[DISPLAY]));
        assert!(front_app_is_full_screen(&wins, SAFARI, &[DISPLAY]));
    }
    #[test]
    fn works_on_the_second_display_too() {
        let ext: Rect = [1512.0, 0.0, 1920.0, 1080.0];
        assert!(front_app_is_full_screen(&[w(SAFARI, 0, ext)], SAFARI, &[DISPLAY, ext]));
    }
    #[test]
    fn no_windows_or_no_displays_is_not_full_screen() {
        assert!(!front_app_is_full_screen(&[], SAFARI, &[DISPLAY]));
        assert!(!front_app_is_full_screen(&[w(SAFARI, 0, DISPLAY)], SAFARI, &[]));
    }
    #[test]
    fn a_rounding_difference_of_one_point_is_tolerated() {
        assert!(front_app_is_full_screen(&[w(SAFARI, 0, [0.0, 0.0, 1511.6, 982.4])], SAFARI, &[DISPLAY]));
    }
    #[test]
    fn looking_at_the_real_windows_works_and_never_prompts() {
        let _ = sys::on_screen_windows();   // would block on a permission prompt if it needed one
    }
}
