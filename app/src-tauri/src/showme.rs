//! Show me how, start to finish, with the Mac parts behind a small interface so every rule can be tested without a screen:
//! the light comes on BEFORE anything is captured, secrets are covered BEFORE anything is sent, the picture lives in
//! memory only, and a missing permission or a password box on screen means no capture at all.
use crate::coords::{Pt, Shot, R};
use crate::frame::Frame;
use crate::redact::{is_sensitive, plan_blackouts};
use crate::snap::{snap, Ask, OcrBox, Snapped};

pub const MAX_EDGE: u32 = 1280;
const MAX_CANDIDATES: usize = 60;

pub struct Captured { pub frame: Frame, /// The display in global top-left points.
    pub display: R }

#[derive(Debug, PartialEq, Eq)]
pub enum Refusal { NeedsScreenRecording, SecureInput, CaptureFailed(String), PictureFailed(String) }

pub trait Platform {
    fn screen_recording_granted(&self) -> bool;
    fn secure_input_on(&self) -> bool;
    /// The visible "I am looking at your screen" light.
    fn indicator(&self, on: bool);
    fn capture(&self) -> Result<Captured, String>;
    /// Text on the picture, boxes in picture pixels (top left origin).
    fn read_text(&self, frame: &Frame) -> Vec<OcrBox>;
    /// A quicker, rougher read, tried first where speed matters. Defaults to the careful one.
    fn read_text_fast(&self, frame: &Frame) -> Vec<OcrBox> { self.read_text(frame) }
    /// The nearest clickable element at a global point, if the Mac reports one.
    fn element_at(&self, p: Pt) -> Option<R>;
    fn send_image(&self, jpeg: &[u8], w: u32, h: u32);
    fn ask(&self, question: &str, w: u32, h: u32, candidates: &[(String, String, R)]);
}

pub struct Prepared { pub shot: Shot, /// Text boxes in global points, for snapping.
    pub boxes: Vec<OcrBox>, pub covered: usize }

/// Covers secrets, shrinks, and lists the text the model may use as landmarks. Pure, so it can be tested on its own.
pub fn prepare_frame(mut frame: Frame, boxes: &[OcrBox]) -> (Frame, usize, Vec<OcrBox>) {
    let covers = plan_blackouts(boxes);
    for c in &covers { frame.black_out(*c); }
    let small = frame.shrink_to(MAX_EDGE);
    let k = small.w as f64 / frame.w as f64;
    let mut keep: Vec<OcrBox> = boxes.iter().filter(|b| !is_sensitive(&b.text) && !b.text.trim().is_empty())
        .map(|b| OcrBox { id: b.id.clone(), text: b.text.trim().chars().take(80).collect(), rect: R { x: b.rect.x * k, y: b.rect.y * k, w: b.rect.w * k, h: b.rect.h * k } }).collect();
    // Top to bottom, left to right, so the list reads like the screen; cut to a size the model can use.
    keep.sort_by(|a, b| (a.rect.y.round() as i64, a.rect.x.round() as i64).cmp(&(b.rect.y.round() as i64, b.rect.x.round() as i64)));
    keep.truncate(MAX_CANDIDATES);
    for (i, b) in keep.iter_mut().enumerate() { b.id = format!("t{}", i + 1); }
    (small, covers.len(), keep)
}

/// Light on, capture, cover, shrink, send. The light goes off again whatever happens.
pub fn start(p: &dyn Platform, question: &str) -> Result<Prepared, Refusal> {
    if !p.screen_recording_granted() { return Err(Refusal::NeedsScreenRecording); }
    if p.secure_input_on() { return Err(Refusal::SecureInput); }
    p.indicator(true);
    let result = (|| {
        let cap = p.capture().map_err(Refusal::CaptureFailed)?;
        let boxes = p.read_text(&cap.frame);
        let (small, covered, keep) = prepare_frame(cap.frame, &boxes);
        let jpeg = small.to_jpeg(80).map_err(Refusal::PictureFailed)?;
        p.send_image(&jpeg, small.w, small.h);
        let shot = Shot { display: cap.display, img_w: small.w as f64, img_h: small.h as f64 };
        let cands: Vec<(String, String, R)> = keep.iter().map(|b| (b.id.clone(), b.text.clone(), b.rect)).collect();
        p.ask(question, small.w, small.h, &cands);
        let global = keep.iter().map(|b| OcrBox { id: b.id.clone(), text: b.text.clone(), rect: shot.rect_to_global(b.rect) }).collect();
        Ok(Prepared { shot, boxes: global, covered })
    })();
    p.indicator(false);
    result
}

/// Point at the problem: light on, ONE capture, read the text (quickly first, carefully only if `find` came up empty),
/// light off. `find` gets the text boxes in global points. The picture is dropped right here: nothing is sent anywhere.
pub fn look_for<T>(p: &dyn Platform, find: impl Fn(&[OcrBox]) -> Option<T>) -> Result<(R, Option<T>), Refusal> {
    if !p.screen_recording_granted() { return Err(Refusal::NeedsScreenRecording); }
    if p.secure_input_on() { return Err(Refusal::SecureInput); }
    p.indicator(true);
    let result = (|| {
        let cap = p.capture().map_err(Refusal::CaptureFailed)?;
        let shot = Shot { display: cap.display, img_w: cap.frame.w as f64, img_h: cap.frame.h as f64 };
        let global = |boxes: Vec<OcrBox>| boxes.into_iter().map(|b| OcrBox { rect: shot.rect_to_global(b.rect), ..b }).collect::<Vec<_>>();
        let mut hit = find(&global(p.read_text_fast(&cap.frame)));
        if hit.is_none() { hit = find(&global(p.read_text(&cap.frame))); }
        drop(cap.frame);
        Ok((shot.display, hit))
    })();
    p.indicator(false);
    result
}

/// The model answered with a point in its picture: turn it into a real place on the screen.
pub fn aim(p: &dyn Platform, prep: &Prepared, x: f64, y: f64, ocr_id: Option<&str>, target_text: &str) -> Snapped {
    let global = prep.shot.to_global(Pt { x, y });
    let ax = p.element_at(global);
    snap(&Ask { point: global, ocr_id, target_text, ocr: &prep.boxes, ax, display: prep.shot.display })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snap::How;
    use std::cell::RefCell;

    struct Fake { granted: bool, secure: bool, log: RefCell<Vec<String>>, text: Vec<OcrBox>, ax: Option<R>, fail_capture: bool }
    impl Fake { fn new() -> Fake { Fake { granted: true, secure: false, log: RefCell::new(vec![]), text: vec![], ax: None, fail_capture: false } } fn said(&self) -> Vec<String> { self.log.borrow().clone() } }
    impl Platform for Fake {
        fn screen_recording_granted(&self) -> bool { self.log.borrow_mut().push("permission".into()); self.granted }
        fn secure_input_on(&self) -> bool { self.secure }
        fn indicator(&self, on: bool) { self.log.borrow_mut().push(format!("light {}", if on { "on" } else { "off" })); }
        fn capture(&self) -> Result<Captured, String> {
            self.log.borrow_mut().push("capture".into());
            if self.fail_capture { return Err("no display".into()); }
            Ok(Captured { frame: Frame::new(2560, 1600, vec![255; 2560 * 1600 * 4]).unwrap(), display: R { x: 0.0, y: 0.0, w: 1280.0, h: 800.0 } })
        }
        fn read_text(&self, _f: &Frame) -> Vec<OcrBox> { self.text.clone() }
        fn element_at(&self, _p: Pt) -> Option<R> { self.ax }
        fn send_image(&self, jpeg: &[u8], w: u32, h: u32) { self.log.borrow_mut().push(format!("send {}x{} jpeg={}", w, h, jpeg.starts_with(&[0xFF, 0xD8]))); }
        fn ask(&self, q: &str, _w: u32, _h: u32, c: &[(String, String, R)]) { self.log.borrow_mut().push(format!("ask {q} [{}]", c.iter().map(|x| x.1.clone()).collect::<Vec<_>>().join("|"))); }
    }
    fn tb(id: &str, text: &str, x: f64, y: f64) -> OcrBox { OcrBox { id: id.into(), text: text.into(), rect: R { x, y, w: 200.0, h: 30.0 } } }

    #[test]
    fn looking_for_the_problem_lights_up_first_captures_once_and_sends_nothing() {
        let mut f = Fake::new(); f.text = vec![tb("a", "const total = 1;", 400.0, 200.0)];
        let (d, hit) = look_for(&f, |b| b.first().map(|x| x.rect)).unwrap();
        assert_eq!(f.said(), vec!["permission", "light on", "capture", "light off"]);
        // full size picture pixels -> points on a half size display
        let r = hit.unwrap(); assert_eq!((r.x, r.y), (200.0, 100.0)); assert_eq!(d.w, 1280.0);
    }
    #[test]
    fn when_the_quick_read_misses_the_same_picture_is_read_again_carefully() {
        let f = Fake::new();
        let tries = std::cell::Cell::new(0);
        let (_, hit) = look_for(&f, |_| { tries.set(tries.get() + 1); None::<()> }).unwrap();
        assert!(hit.is_none()); assert_eq!(tries.get(), 2);
        assert_eq!(f.said().iter().filter(|x| *x == "capture").count(), 1);
    }
    #[test]
    fn looking_for_the_problem_respects_the_permission_and_password_boxes() {
        let mut f = Fake::new(); f.granted = false;
        assert_eq!(look_for(&f, |_| Some(())).err(), Some(Refusal::NeedsScreenRecording));
        let mut f = Fake::new(); f.secure = true;
        assert_eq!(look_for(&f, |_| Some(())).err(), Some(Refusal::SecureInput));
        assert!(!f.said().iter().any(|x| x.starts_with("capture") || x.starts_with("light")));
    }
    #[test]
    fn the_light_comes_on_before_the_capture_and_goes_off_after_the_send() {
        let f = Fake::new(); start(&f, "where?").unwrap();
        let s = f.said(); let at = |k: &str| s.iter().position(|x| x.starts_with(k)).unwrap();
        assert!(at("light on") < at("capture") && at("capture") < at("send") && at("send") < at("ask") && at("ask") < at("light off"));
    }
    #[test]
    fn without_permission_nothing_is_captured_and_no_light_comes_on() {
        let mut f = Fake::new(); f.granted = false;
        assert_eq!(start(&f, "q").err(), Some(Refusal::NeedsScreenRecording));
        assert!(!f.said().iter().any(|x| x.starts_with("capture") || x.starts_with("light")));
    }
    #[test]
    fn with_a_password_box_active_nothing_is_captured() {
        let mut f = Fake::new(); f.secure = true;
        assert_eq!(start(&f, "q").err(), Some(Refusal::SecureInput));
        assert!(!f.said().iter().any(|x| x.starts_with("capture")));
    }
    #[test]
    fn a_failed_capture_still_turns_the_light_off_and_sends_nothing() {
        let mut f = Fake::new(); f.fail_capture = true;
        assert!(matches!(start(&f, "q").err(), Some(Refusal::CaptureFailed(_))));
        let s = f.said(); assert_eq!(s.last().unwrap(), "light off"); assert!(!s.iter().any(|x| x.starts_with("send") || x.starts_with("ask")));
    }
    #[test]
    fn the_picture_is_shrunk_and_is_a_jpeg() {
        let f = Fake::new(); start(&f, "q").unwrap();
        assert!(f.said().iter().any(|x| x == "send 1280x800 jpeg=true"));
    }
    #[test]
    fn secret_text_is_covered_and_never_offered_as_a_landmark() {
        let mut f = Fake::new();
        f.text = vec![tb("a", "Deploy to production", 100.0, 100.0), tb("b", "sk_live_abcdefghijklmnop1234", 100.0, 200.0), tb("c", "Card 4242 4242 4242 4242", 100.0, 300.0)];
        let prep = start(&f, "q").unwrap();
        assert_eq!(prep.covered, 2);
        let asked = f.said().into_iter().find(|x| x.starts_with("ask")).unwrap();
        assert!(asked.contains("Deploy to production") && !asked.contains("sk_live") && !asked.contains("4242"));
        assert_eq!(prep.boxes.len(), 1);
    }
    #[test]
    fn the_covers_are_applied_to_the_pixels_before_shrinking() {
        let frame = Frame::new(2560, 1600, vec![255; 2560 * 1600 * 4]).unwrap();
        let (small, covered, keep) = prepare_frame(frame, &[tb("b", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", 200.0, 400.0)]);
        assert_eq!(covered, 1); assert!(keep.is_empty());
        let (x, y) = (150usize, 205usize);   // inside the covered box after halving
        let i = (y * small.w as usize + x) * 4; assert_eq!(&small.rgba[i..i + 3], &[0, 0, 0]);
    }
    #[test]
    fn landmarks_are_numbered_in_reading_order_and_capped() {
        let frame = Frame::new(1000, 1000, vec![255; 1000 * 1000 * 4]).unwrap();
        let mut boxes = vec![tb("z", "second row", 10.0, 100.0), tb("y", "first row right", 300.0, 10.0), tb("x", "first row left", 10.0, 10.0)];
        let (_, _, keep) = prepare_frame(frame.clone(), &boxes);
        assert_eq!(keep.iter().map(|b| (b.id.as_str(), b.text.as_str())).collect::<Vec<_>>(), vec![("t1", "first row left"), ("t2", "first row right"), ("t3", "second row")]);
        boxes = (0..200).map(|i| tb("n", &format!("word{i}"), (i % 20) as f64 * 40.0, (i / 20) as f64 * 40.0)).collect();
        assert_eq!(prepare_frame(frame, &boxes).2.len(), MAX_CANDIDATES);
    }
    #[test]
    fn the_models_point_becomes_a_real_button_on_the_screen() {
        let mut f = Fake::new(); f.ax = Some(R { x: 600.0, y: 380.0, w: 120.0, h: 36.0 });
        let prep = start(&f, "q").unwrap();
        let s = aim(&f, &prep, 650.0, 395.0, None, "Save");   // the picture is the display's own size here
        assert_eq!(s.how, How::Accessibility); assert!(s.rect.contains(Pt { x: 650.0, y: 395.0 }));
    }
    #[test]
    fn a_text_landmark_named_by_the_model_wins_and_is_in_screen_points() {
        let mut f = Fake::new(); f.text = vec![tb("a", "Deploy", 1100.0, 700.0)];   // full size picture pixels; the display is half that in points
        let prep = start(&f, "q").unwrap();
        let s = aim(&f, &prep, 560.0, 360.0, Some("t1"), "Deploy");
        assert_eq!(s.how, How::OcrId); assert!((s.rect.x - 550.0).abs() < 1.0 && (s.rect.y - 350.0).abs() < 1.0);
    }
}
