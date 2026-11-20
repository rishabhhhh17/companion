//! GLASS, the menu bar (the founder, 19 Nov 2026: "the menu bar, I think you need to change it and make it better"). The
//! plain decisions for the menu bar icon's glass popover, with no AppKit, so each is tested: which of its presses the page
//! may ask for (anything else is dropped), where the popover goes under the icon (inside the screen it is on, under the menu
//! bar), how tall it may be, and which template image the icon shows (with a small dot when something needs the person).
//! shell_traypop.rs does the AppKit side.

/// The popover's width in points (tokens.css --mat-pop-w, the page's own width) and its corner radius (--mat-pop-r).
pub const POP_W: f64 = 320.0;
pub const POP_R: f64 = 14.0;
/// Its height before the page has measured itself, and the most it may take.
pub const POP_H: f64 = 420.0;
pub const POP_MAX_H: f64 = 640.0;
/// The gap under the menu bar, and the least room kept from the screen's sides.
pub const GAP: f64 = 6.0;
pub const MARGIN: f64 = 8.0;

/// What a press in the popover may ask the shell for. Each does what the same press does elsewhere in the app, under the
/// same words: Check my project (Find the problem, as Home's button of that name), Check before going live, opening Home,
/// the top line's way to Now or to the review of changes, Settings in Home, Stop everything, Quit, and the folder chooser.
/// Nothing here sends, pastes or deletes anything on its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAct { Check, ShipCheck, Open, Now, Review, Settings, Stop, Quit, Pick }

impl TrayAct {
    pub fn parse(s: &str) -> Option<TrayAct> {
        match s {
            "check" => Some(TrayAct::Check),
            "shipCheck" => Some(TrayAct::ShipCheck),
            "open" => Some(TrayAct::Open),
            "now" => Some(TrayAct::Now),
            "review" => Some(TrayAct::Review),
            "settings" => Some(TrayAct::Settings),
            "stop" => Some(TrayAct::Stop),
            "quit" => Some(TrayAct::Quit),
            "pick" => Some(TrayAct::Pick),
            _ => None,
        }
    }
    /// Every press but Stop closes the popover first (Stop keeps it, so the person sees "Nothing needs you" come back).
    pub fn closes(self) -> bool { !matches!(self, TrayAct::Stop) }
    /// What Home does once it opens for this press: the same arrivals the notch's panel sends (arrival.rs). None for a press
    /// that just opens Home (Open, the top line to Now) or does not open it.
    pub fn arrival(self) -> Option<serde_json::Value> {
        match self {
            TrayAct::Check => Some(serde_json::json!({ "do": "find" })),
            TrayAct::ShipCheck => Some(serde_json::json!({ "do": "shipCheck" })),
            TrayAct::Review => Some(serde_json::json!({ "do": "review" })),
            TrayAct::Settings => Some(crate::arrival::menu_settings()),
            TrayAct::Open | TrayAct::Now | TrayAct::Stop | TrayAct::Quit | TrayAct::Pick => None,
        }
    }
}

/// A rectangle in AppKit points (origin at the bottom left of the primary display), as NSScreen gives them.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frame { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

/// Where the popover goes: centred under the click's x (the icon), its top just under the menu bar of the screen that was
/// clicked (`visible` is that screen's visible frame, whose top is the menu bar's bottom), kept inside the screen's sides.
/// `h` is clamped to what fits between the menu bar and the bottom of the visible frame.
pub fn place(click_x: f64, visible: Frame, h: f64) -> Frame {
    let room = (visible.h - GAP - MARGIN).max(120.0);
    let h = h.clamp(120.0, POP_MAX_H.min(room));
    let lo = visible.x + MARGIN;
    let hi = (visible.x + visible.w - MARGIN - POP_W).max(lo);
    let x = (click_x - POP_W / 2.0).clamp(lo, hi);
    let top = visible.y + visible.h - GAP;
    Frame { x: x.round(), y: (top - h).round(), w: POP_W, h: h.round() }
}

/// The same popover grown or shrunk to `h`, its top kept where it is (it hangs from the menu bar).
pub fn resize(now: Frame, visible: Frame, h: f64) -> Frame {
    let top = now.y + now.h;
    let room = (top - visible.y - MARGIN).max(120.0);
    let h = h.clamp(120.0, POP_MAX_H.min(room)).round();
    Frame { x: now.x, y: top - h, w: now.w, h }
}

/// Whether a click at `p` (AppKit points) is outside the popover: such a click closes it, as other menu bar extras do.
pub fn outside(f: Frame, p: (f64, f64)) -> bool {
    !(p.0 >= f.x && p.0 <= f.x + f.w && p.1 >= f.y && p.1 <= f.y + f.h)
}

/// The menu bar icon: a template image (macOS draws it in the menu bar's own ink, light or dark), drawn on the 18 point
/// grid at 36 pixels so it is sharp at 2x and lands on whole pixels at 1x. With something waiting on the person it carries
/// a small dot, cut out of the ring.
pub const ICON: &[u8] = include_bytes!("../icons/tray/tray-template.png");
pub const ICON_DOT: &[u8] = include_bytes!("../icons/tray/tray-template-dot.png");
pub fn icon(needs: bool) -> &'static [u8] { if needs { ICON_DOT } else { ICON } }

#[cfg(test)]
mod tests {
    use super::*;
    const VIS: Frame = Frame { x: 0.0, y: 0.0, w: 1512.0, h: 945.0 };

    #[test]
    fn only_the_popovers_own_presses_pass() {
        for (s, a) in [("check", TrayAct::Check), ("shipCheck", TrayAct::ShipCheck), ("open", TrayAct::Open), ("now", TrayAct::Now), ("review", TrayAct::Review), ("settings", TrayAct::Settings), ("stop", TrayAct::Stop), ("quit", TrayAct::Quit), ("pick", TrayAct::Pick)] {
            assert_eq!(TrayAct::parse(s), Some(a));
        }
        // The GLASS review: "explain" is gone (it ran Find the problem under another tool's name).
        for s in ["", "Check", "explain", "delete", "send", "paste", "quit ", "open_link"] { assert_eq!(TrayAct::parse(s), None, "{s:?}"); }
    }

    #[test]
    fn every_press_but_stop_closes_the_popover() {
        assert!(!TrayAct::Stop.closes());
        for a in [TrayAct::Check, TrayAct::ShipCheck, TrayAct::Open, TrayAct::Now, TrayAct::Review, TrayAct::Settings, TrayAct::Quit, TrayAct::Pick] { assert!(a.closes()); }
    }

    /// The GLASS review: each press starts the tool its words name, by the same arrival the notch's panel uses, so Home
    /// does exactly what its own button of that name does. Every arrival passes arrival.rs as it is.
    #[test]
    fn each_press_opens_home_on_the_tool_its_words_name() {
        assert_eq!(TrayAct::Check.arrival(), Some(serde_json::json!({ "do": "find" })), "Check my project is Find the problem, as in Home");
        assert_eq!(TrayAct::ShipCheck.arrival(), Some(serde_json::json!({ "do": "shipCheck" })));
        assert_eq!(TrayAct::Review.arrival(), Some(serde_json::json!({ "do": "review" })));
        assert_eq!(TrayAct::Settings.arrival(), Some(crate::arrival::menu_settings()));
        for a in [TrayAct::Open, TrayAct::Now, TrayAct::Stop, TrayAct::Quit, TrayAct::Pick] { assert_eq!(a.arrival(), None, "{a:?}"); }
        for a in [TrayAct::Check, TrayAct::ShipCheck, TrayAct::Review, TrayAct::Settings] {
            let v = a.arrival().unwrap();
            assert_eq!(crate::arrival::arrival(&v), Some(v.clone()), "{a:?} passes arrival.rs");
        }
        let src = crate::main_src();
        let body = &src[src.find("fn tray_do(").unwrap()..];
        let body = &body[..body.find("\n}\n").unwrap()];
        assert!(body.contains("act.arrival()"), "tray_do opens Home with the press's own arrival");
        assert!(!body.contains("find-problem"), "no second route to Find the problem");
    }

    /// The GLASS review: switching Material with Home open re-syncs macOS's blur at once (never only at the next resize), on
    /// the main thread, so Glass never lacks its blur and Before never shows one.
    #[test]
    fn a_change_of_material_re_syncs_homes_blur() {
        let src = crate::main_src();
        let at = src.find("fn setting_applied(").unwrap();
        let body = &src[at..at + src[at..].find("\n}\n").unwrap()];
        assert!(body.contains(r#"if key == "look.material" { let _ = app.run_on_main_thread(home_glass_sync); }"#), "{body}");
    }

    #[test]
    fn it_hangs_under_the_icon_just_below_the_menu_bar() {
        let f = place(1200.0, VIS, 400.0);
        assert_eq!(f.w, POP_W);
        assert_eq!(f.x, 1200.0 - POP_W / 2.0);
        assert_eq!(f.y + f.h, VIS.y + VIS.h - GAP, "its top is just under the menu bar");
        assert_eq!(f.h, 400.0);
    }

    #[test]
    fn near_a_side_it_stays_on_the_screen() {
        let right = place(1505.0, VIS, 400.0);
        assert_eq!(right.x + right.w, VIS.w - MARGIN);
        let left = place(4.0, VIS, 400.0);
        assert_eq!(left.x, MARGIN);
        // A second display to the left of the primary (negative x) works the same way.
        let other = Frame { x: -1920.0, y: 0.0, w: 1920.0, h: 1055.0 };
        let f = place(-10.0, other, 400.0);
        assert_eq!(f.x + f.w, -MARGIN);
    }

    #[test]
    fn it_is_never_taller_than_the_screen_allows_nor_than_its_most() {
        assert_eq!(place(600.0, VIS, 5000.0).h, POP_MAX_H);
        let small = Frame { x: 0.0, y: 0.0, w: 800.0, h: 300.0 };
        let f = place(400.0, small, 5000.0);
        assert!(f.y >= small.y, "{f:?}");
        assert_eq!(place(600.0, VIS, 10.0).h, 120.0, "a page that says it is tiny still shows");
    }

    #[test]
    fn a_new_height_keeps_the_top_under_the_menu_bar() {
        let f = place(700.0, VIS, 400.0);
        let g = resize(f, VIS, 300.0);
        assert_eq!(g.y + g.h, f.y + f.h);
        assert_eq!((g.x, g.w, g.h), (f.x, f.w, 300.0));
    }

    #[test]
    fn a_click_outside_closes_it_and_one_inside_does_not() {
        let f = place(700.0, VIS, 400.0);
        assert!(!outside(f, (700.0, f.y + 10.0)));
        assert!(outside(f, (700.0, f.y - 1.0)));
        assert!(outside(f, (f.x - 1.0, f.y + 10.0)));
    }

    #[test]
    fn the_icon_is_a_template_at_2x_with_a_dot_only_when_something_needs_you() {
        assert_ne!(icon(true), icon(false));
        for png in [ICON, ICON_DOT] {
            assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
            // IHDR width and height: 36 by 36 pixels, 18 points at 2x.
            assert_eq!(u32::from_be_bytes([png[16], png[17], png[18], png[19]]), 36);
            assert_eq!(u32::from_be_bytes([png[20], png[21], png[22], png[23]]), 36);
            // Colour type 6 (RGBA): a template image is its alpha only.
            assert_eq!(png[25], 6);
        }
    }
}
