//! Turning a point the model chose in the screenshot back into a place on the screen.
//! Three spaces are involved, and mixing them up is the classic way a pointer lands in the wrong place:
//!  - the picture the model saw (pixels, origin top left, possibly shrunk),
//!  - the display (points, origin top left of that display, in the global top-left space macOS Quartz uses),
//!  - AppKit windows (points, origin BOTTOM left of the primary display).

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pt { pub x: f64, pub y: f64 }
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct R { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

impl R {
    pub fn contains(&self, p: Pt) -> bool { p.x >= self.x && p.x <= self.x + self.w && p.y >= self.y && p.y <= self.y + self.h }
    pub fn center(&self) -> Pt { Pt { x: self.x + self.w / 2.0, y: self.y + self.h / 2.0 } }
}

/// The size the screenshot is sent in: never bigger than `max_edge` on the long side, never enlarged.
pub fn fit(width_px: u32, height_px: u32, max_edge: u32) -> (u32, u32) {
    let long = width_px.max(height_px);
    if long == 0 || long <= max_edge { return (width_px, height_px); }
    let s = max_edge as f64 / long as f64;
    (((width_px as f64 * s).round() as u32).max(1), ((height_px as f64 * s).round() as u32).max(1))
}

/// One display as the model's picture relates to it.
#[derive(Clone, Copy, Debug)]
pub struct Shot {
    /// The display's top left in the global top-left space, and its size in points.
    pub display: R,
    /// The size of the picture the model saw, in pixels.
    pub img_w: f64,
    pub img_h: f64,
}

impl Shot {
    /// A point in the model's picture -> global top-left points. Retina does not matter: the picture always covers the whole display.
    pub fn to_global(&self, p: Pt) -> Pt {
        Pt { x: self.display.x + p.x * self.display.w / self.img_w, y: self.display.y + p.y * self.display.h / self.img_h }
    }
    /// A rectangle in the model's picture -> global top-left points.
    pub fn rect_to_global(&self, r: R) -> R {
        let a = self.to_global(Pt { x: r.x, y: r.y });
        R { x: a.x, y: a.y, w: r.w * self.display.w / self.img_w, h: r.h * self.display.h / self.img_h }
    }
    /// A global point -> the picture (to draw a block over a secret, or to compare with the model's answer).
    pub fn to_image(&self, p: Pt) -> Pt {
        Pt { x: (p.x - self.display.x) * self.img_w / self.display.w, y: (p.y - self.display.y) * self.img_h / self.display.h }
    }
}

/// Global top-left space -> AppKit window space (origin bottom left of the primary display).
pub fn to_appkit(p: Pt, primary_height: f64) -> Pt { Pt { x: p.x, y: primary_height - p.y } }
pub fn rect_to_appkit(r: R, primary_height: f64) -> R { R { x: r.x, y: primary_height - r.y - r.h, w: r.w, h: r.h } }

/// Vision gives boxes with a lower left origin, normalised 0..1. Flip into picture pixels (top left origin).
pub fn vision_box_to_image(nx: f64, ny: f64, nw: f64, nh: f64, img_w: f64, img_h: f64) -> R {
    R { x: nx * img_w, y: (1.0 - ny - nh) * img_h, w: nw * img_w, h: nh * img_h }
}

#[cfg(test)]
mod tests {
    use super::*;
    const CLOSE: f64 = 1e-6;
    fn near(a: f64, b: f64) -> bool { (a - b).abs() < CLOSE }

    #[test]
    fn a_big_picture_is_shrunk_to_the_limit_and_a_small_one_is_left_alone() {
        assert_eq!(fit(2880, 1800, 1280), (1280, 800));
        assert_eq!(fit(1000, 600, 1280), (1000, 600));
        assert_eq!(fit(1800, 2880, 1280), (800, 1280));
        assert_eq!(fit(0, 0, 1280), (0, 0));
        assert_eq!(fit(5120, 1440, 2000).0, 2000);
    }
    #[test]
    fn the_middle_of_the_picture_is_the_middle_of_the_display_at_any_scale() {
        let s = Shot { display: R { x: 0.0, y: 0.0, w: 1512.0, h: 982.0 }, img_w: 1280.0, img_h: 831.0 };
        let c = s.to_global(Pt { x: 640.0, y: 415.5 });
        assert!(near(c.x, 756.0) && near(c.y, 491.0));
    }
    #[test]
    fn a_second_display_to_the_right_or_above_the_first_is_offset_correctly() {
        let right = Shot { display: R { x: 1512.0, y: 0.0, w: 1920.0, h: 1080.0 }, img_w: 1280.0, img_h: 720.0 };
        let p = right.to_global(Pt { x: 0.0, y: 0.0 }); assert!(near(p.x, 1512.0) && near(p.y, 0.0));
        let above = Shot { display: R { x: 0.0, y: -1080.0, w: 1920.0, h: 1080.0 }, img_w: 960.0, img_h: 540.0 };
        let q = above.to_global(Pt { x: 960.0, y: 540.0 }); assert!(near(q.x, 1920.0) && near(q.y, 0.0));
    }
    #[test]
    fn going_there_and_back_gives_the_same_point() {
        let s = Shot { display: R { x: -1440.0, y: 200.0, w: 1440.0, h: 900.0 }, img_w: 1280.0, img_h: 800.0 };
        let p = Pt { x: 333.0, y: 77.0 };
        let b = s.to_image(s.to_global(p)); assert!(near(b.x, p.x) && near(b.y, p.y));
    }
    #[test]
    fn rectangles_scale_in_size_as_well_as_position() {
        let s = Shot { display: R { x: 100.0, y: 50.0, w: 1000.0, h: 500.0 }, img_w: 500.0, img_h: 250.0 };
        let r = s.rect_to_global(R { x: 10.0, y: 10.0, w: 50.0, h: 20.0 });
        assert!(near(r.x, 120.0) && near(r.y, 70.0) && near(r.w, 100.0) && near(r.h, 40.0));
    }
    #[test]
    fn appkit_space_flips_up_and_down_only() {
        let p = to_appkit(Pt { x: 50.0, y: 100.0 }, 982.0); assert!(near(p.x, 50.0) && near(p.y, 882.0));
        let r = rect_to_appkit(R { x: 10.0, y: 100.0, w: 40.0, h: 30.0 }, 982.0); assert!(near(r.y, 852.0) && near(r.h, 30.0));
        let back = rect_to_appkit(r, 982.0); assert!(near(back.y, 100.0));
    }
    #[test]
    fn vision_boxes_with_a_lower_left_origin_are_flipped() {
        // A box at the very top of the picture has a large y in Vision's space.
        let r = vision_box_to_image(0.1, 0.9, 0.2, 0.1, 1000.0, 500.0);
        assert!(near(r.x, 100.0) && near(r.y, 0.0) && near(r.w, 200.0) && near(r.h, 50.0));
        let bottom = vision_box_to_image(0.0, 0.0, 0.5, 0.1, 1000.0, 500.0); assert!(near(bottom.y, 450.0));
    }
    #[test]
    fn contains_includes_the_edges() {
        let r = R { x: 0.0, y: 0.0, w: 10.0, h: 10.0 };
        assert!(r.contains(Pt { x: 10.0, y: 10.0 }) && !r.contains(Pt { x: 10.1, y: 5.0 }));
    }
}
