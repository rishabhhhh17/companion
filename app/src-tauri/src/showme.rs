//! Show me how, start to finish, with the Mac parts behind a small interface so every rule can be tested without a screen:
//! the light comes on BEFORE anything is captured, secrets are covered BEFORE anything is sent, the picture lives in
//! memory only, and a missing permission or a password box on screen means no capture at all. With more than one display,
//! every display is looked at under the same light (the one the pointer is on first) and each picture is labelled for the
//! model as "Screen N of M".
use crate::coords::{screen_label, shot_for, Pt, Shot, R};
use crate::fullscreen::Win;
use crate::frame::Frame;
use crate::redact::{is_sensitive, plan_blackouts};
use crate::snap::{snap, Ask, OcrBox, Snapped};
use serde_json::{json, Value};

pub const MAX_EDGE: u32 = 1280;
const MAX_CANDIDATES: usize = 60;
/// Most displays looked at for one press of the key.
const MAX_DISPLAYS: usize = 4;

pub struct Captured { pub frame: Frame, /// The display in global top-left points.
    pub display: R }

#[derive(Debug, PartialEq, Eq)]
pub enum Refusal { NeedsScreenRecording, SecureInput, CaptureFailed(String), PictureFailed(String) }

/// One picture as it is sent: its screen number (1 is the pointer's), its size in pixels, and its label (only when there
/// is more than one screen).
#[derive(Clone, Debug, PartialEq)]
pub struct Pic { pub screen: usize, pub w: u32, pub h: u32, pub label: Option<String> }
/// A piece of text on a screen the model may use as a landmark, in that screen's picture pixels.
#[derive(Clone, Debug, PartialEq)]
pub struct Cand { pub id: String, pub text: String, pub rect: R, pub screen: usize }

pub trait Platform {
    fn screen_recording_granted(&self) -> bool;
    fn secure_input_on(&self) -> bool;
    /// The visible "I am looking at your screen" light.
    fn indicator(&self, on: bool);
    fn capture(&self) -> Result<Captured, String>;
    /// The next display not in `tried`, if there is one (a second monitor). None when every display has been looked at.
    fn capture_other(&self, _tried: &[R]) -> Option<Result<Captured, String>> { None }
    /// The windows on screen (owners and sizes only, no permission) and the app in front, noted with the picture so a ring
    /// is never drawn over a window that has changed since (rule 22).
    fn windows(&self) -> (Vec<Win>, i32) { (vec![], 0) }
    /// Text on the picture, boxes in picture pixels (top left origin).
    fn read_text(&self, frame: &Frame) -> Vec<OcrBox>;
    /// A quicker, rougher read, tried first where speed matters and nothing is sent (Point at the problem). Never used for a
    /// picture that is sent: covering secrets needs the careful read. Defaults to the careful one.
    fn read_text_fast(&self, frame: &Frame) -> Vec<OcrBox> { self.read_text(frame) }
    /// The nearest clickable element at a global point, if the Mac reports one.
    fn element_at(&self, p: Pt) -> Option<R>;
    fn send_image(&self, screen: usize, jpeg: &[u8], w: u32, h: u32);
    fn ask(&self, question: &str, pics: &[Pic], candidates: &[Cand]);
}

/// What one press saw, kept in memory until the model answers. shots: one per screen, the pointer's first.
#[derive(Clone)]
pub struct Prepared { pub shots: Vec<Shot>, /// Text boxes in global points, for snapping (ids unique across screens).
    pub boxes: Vec<OcrBox>, pub covered: usize, /// The windows and the app in front when the pictures were taken.
    pub wins: Vec<Win>, pub front_pid: i32 }

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

/// The name each screen's picture is sent under: the request itself for the pointer's screen, then "-s2", "-s3"...
pub fn image_ref(req: &str, screen: usize) -> String { if screen <= 1 { req.to_string() } else { format!("{req}-s{screen}") } }

/// Landmark names never clash between screens: screen 1 keeps t1, t2..., screen 2 is s2t1, s2t2...
fn landmark_id(id: &str, screen: usize) -> String { if screen <= 1 { id.to_string() } else { format!("s{screen}{id}") } }

/// The question to the engine: the first picture as `image`, and every picture with its label in `screens` only when there
/// is more than one.
pub fn locate_command(req: &str, question: &str, pics: &[Pic], cands: &[Cand]) -> Value {
    let first = pics.first().map(|p| (p.w, p.h)).unwrap_or((0, 0));
    let ocr: Vec<Value> = cands.iter().map(|c| json!({ "id": c.id, "text": c.text, "box": [c.rect.x, c.rect.y, c.rect.w, c.rect.h], "screen": c.screen })).collect();
    let mut v = json!({ "v": 1, "id": format!("loc-{req}"), "type": "assist.locate", "req": req, "question": question, "image": { "ref": req, "w": first.0, "h": first.1 }, "ocr": ocr });
    if pics.len() > 1 {
        v["screens"] = Value::Array(pics.iter().map(|p| json!({ "ref": image_ref(req, p.screen), "w": p.w, "h": p.h, "label": p.label.clone().unwrap_or_else(|| screen_label(p.screen, pics.len())) })).collect());
    }
    v
}

/// Light on, capture the display under the pointer, note the windows, cover, shrink, send. The light goes off again
/// whatever happens. This is the default (product doc sections 5 and 10: one press, the display under the cursor).
pub fn start(p: &dyn Platform, question: &str) -> Result<Prepared, Refusal> { start_on(p, question, false) }

/// The same, and with `all_screens` (a setting the person turns on) every other display too, under the same light: the
/// pointer's first, at most four. A second display that cannot be captured or prepared is left out; the first must work.
pub fn start_on(p: &dyn Platform, question: &str, all_screens: bool) -> Result<Prepared, Refusal> {
    if !p.screen_recording_granted() { return Err(Refusal::NeedsScreenRecording); }
    if p.secure_input_on() { return Err(Refusal::SecureInput); }
    p.indicator(true);
    let result = (|| {
        let mut caps = vec![p.capture().map_err(Refusal::CaptureFailed)?];
        while all_screens && caps.len() < MAX_DISPLAYS {
            let tried: Vec<R> = caps.iter().map(|c| c.display).collect();
            match p.capture_other(&tried) { Some(Ok(c)) => caps.push(c), _ => break }
        }
        let (wins, front_pid) = p.windows();
        // Each picture: its text read, secrets covered, shrunk. Every picture that is sent is read with the careful reader:
        // those boxes are all the covering has to go on, and the quick reader can misread one character of a card number or
        // a token, which would leave it uncovered (found in review, 16 Oct 2026). More screens cost time, never safety.
        let mut ready: Vec<(Frame, Vec<OcrBox>, usize, R)> = Vec::new();
        for cap in caps {
            let boxes = p.read_text(&cap.frame);
            let display = cap.display;
            let (small, covered, keep) = prepare_frame(cap.frame, &boxes);
            ready.push((small, keep, covered, display));
        }
        let mut jpegs = Vec::new();
        for (i, (small, keep, covered, display)) in ready.into_iter().enumerate() {
            match small.to_jpeg(80) {
                Ok(j) => jpegs.push((j, small.w, small.h, keep, covered, display)),
                Err(e) if i == 0 => return Err(Refusal::PictureFailed(e)),
                Err(_) => {}
            }
        }
        let m = jpegs.len();
        let (mut shots, mut pics, mut cands, mut global, mut covered_all) = (vec![], vec![], vec![], vec![], 0);
        for (i, (jpeg, w, h, keep, covered, display)) in jpegs.into_iter().enumerate() {
            let n = i + 1;
            p.send_image(n, &jpeg, w, h);
            let shot = Shot { display, img_w: w as f64, img_h: h as f64 };
            pics.push(Pic { screen: n, w, h, label: if m > 1 { Some(screen_label(n, m)) } else { None } });
            for b in keep {
                let id = landmark_id(&b.id, n);
                cands.push(Cand { id: id.clone(), text: b.text.clone(), rect: b.rect, screen: n });
                global.push(OcrBox { id, text: b.text, rect: shot.rect_to_global(b.rect) });
            }
            covered_all += covered;
            shots.push(shot);
        }
        p.ask(question, &pics, &cands);
        Ok(Prepared { shots, boxes: global, covered: covered_all, wins, front_pid })
    })();
    p.indicator(false);
    result
}

/// Point at the problem: light on, a capture of the display you are on (and, only if the place is not there, the other
/// displays), read the text (quickly first, carefully only if `find` came up empty),
/// light off. `find` gets the text boxes in global points. The picture is dropped right here: nothing is sent anywhere.
pub fn look_for<T>(p: &dyn Platform, find: impl Fn(&[OcrBox]) -> Option<T>) -> Result<(R, Option<T>), Refusal> {
    if !p.screen_recording_granted() { return Err(Refusal::NeedsScreenRecording); }
    if p.secure_input_on() { return Err(Refusal::SecureInput); }
    p.indicator(true);
    let result = (|| {
        // The display the mouse is on first; if the place is not there, the other displays, one after another, all under
        // the same light. Each picture is dropped as soon as its text has been read.
        let mut cap = p.capture().map_err(Refusal::CaptureFailed)?;
        let first = cap.display;
        let mut tried = vec![first];
        loop {
            let shot = Shot { display: cap.display, img_w: cap.frame.w as f64, img_h: cap.frame.h as f64 };
            let global = |boxes: Vec<OcrBox>| boxes.into_iter().map(|b| OcrBox { rect: shot.rect_to_global(b.rect), ..b }).collect::<Vec<_>>();
            let mut hit = find(&global(p.read_text_fast(&cap.frame)));
            if hit.is_none() { hit = find(&global(p.read_text(&cap.frame))); }
            let shown = shot.display;
            drop(cap.frame);
            if hit.is_some() { return Ok((shown, hit)); }
            if tried.len() >= MAX_DISPLAYS { return Ok((first, None)); }
            match p.capture_other(&tried) {
                Some(Ok(next)) => { tried.push(next.display); cap = next; }
                Some(Err(_)) | None => return Ok((first, None)),
            }
        }
    })();
    p.indicator(false);
    result
}

/// The model answered with a point in one screen's picture: turn it into a real place on that screen, with the display it
/// is on. None for a screen that was not shown.
pub fn aim(p: &dyn Platform, prep: &Prepared, screen: usize, x: f64, y: f64, ocr_id: Option<&str>, target_text: &str) -> Option<(Snapped, R)> {
    let shot = shot_for(&prep.shots, screen)?;
    let global = shot.to_global(Pt { x, y });
    let ax = p.element_at(global);
    Some((snap(&Ask { point: global, ocr_id, target_text, ocr: &prep.boxes, ax, display: shot.display }), shot.display))
}

/// Is the window under this target still the one that was there when the picture was taken (same app, same place and
/// size, nothing in front of it, the same app in front)? If it has changed, the picture no longer shows what is there, so
/// nothing is drawn (rule 22). With no ordinary window under it then (a menu, the desktop) this cannot tell, and the ring
/// can only be soft (main.rs draws it soft when it has no window to belong to).
pub fn unchanged(prep: &Prepared, ours: i32, now: &[Win], now_front: i32, target: R) -> bool {
    let c = target.center();
    match crate::anchor::anchor_at(&prep.wins, ours, prep.front_pid, c.x, c.y) {
        Some(a) => crate::anchor::check(now, ours, &a, now_front, c.x, c.y) == crate::anchor::Verdict::Fine,
        None => true,
    }
}

/// One Show me answer at a time: what was seen, kept in memory from the press until the answer's last step (or until the
/// answer is ended), and where its last step pointed, so the next flight starts there. Ending it (Stop everything, closing
/// the card, holding to talk, Point at the problem, a newer question, its window changing) means no step still to come is
/// drawn, and what was seen is forgotten at once.
#[derive(Default)]
pub struct Pending { cur: Option<(String, Prepared)>, last: Option<Pt> }
impl Pending {
    pub const fn new() -> Pending { Pending { cur: None, last: None } }
    /// A new question was asked and its pictures sent: nothing of an older answer is left over.
    pub fn begin(&mut self, req: &str, prep: Prepared) { self.cur = Some((req.to_string(), prep)); self.last = None; }
    /// A step of answer `req`: what was seen, and where the step before it pointed (None for the first). The last step
    /// takes what was seen, so it is forgotten then. None when that answer is not the current one or has ended.
    pub fn step(&mut self, req: &str, last: bool) -> Option<(Prepared, Option<Pt>)> {
        if !self.cur.as_ref().is_some_and(|(r, _)| r == req) { return None; }
        let from = self.last;
        if last { self.last = None; self.cur.take().map(|(_, p)| (p, from)) } else { self.cur.as_ref().map(|(_, p)| (p.clone(), from)) }
    }
    /// A step of answer `req` that was not its last was drawn here.
    pub fn pointed(&mut self, req: &str, at: Pt) { if self.cur.as_ref().is_some_and(|(r, _)| r == req) { self.last = Some(at); } }
    /// Ends whatever answer is on its way or playing. True when there was one.
    pub fn end(&mut self) -> bool { self.last = None; self.cur.take().is_some() }
    /// Ends answer `req` only, if it is still the current one (a late tidy up never ends a newer answer).
    pub fn end_if(&mut self, req: &str) { if self.cur.as_ref().is_some_and(|(r, _)| r == req) { self.end(); } }
    /// Is an answer on its way or still playing (steps still to come)?
    pub fn is_on(&self) -> bool { self.cur.is_some() }
}

/// The hand drawn mark a target asked for, passed to the overlay only when it is one of the four known kinds.
pub fn mark_name(m: Option<&str>) -> Option<&'static str> { ["ring", "arrow", "underline", "box"].into_iter().find(|k| Some(*k) == m) }

/// Whether this step of a multi step answer is its last (the one that waits for the click). No list means one target.
pub fn is_last(step: Option<u32>, of: Option<u32>) -> bool { match (step, of) { (Some(s), Some(o)) => s >= o, _ => true } }

/// What goes with the pointing message: the request it answers (so a lesson or a walkthrough knows its own ring was
/// clicked), whether it waits for a click, and for a multi step answer which step of how many it is.
pub fn pointing_extra(req: &str, step: u32, of: u32, hold: bool) -> Value {
    let mut v = json!({ "req": req, "turn": hold });
    if of > 1 { v["step"] = json!(step); v["of"] = json!(of); }
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snap::How;
    use std::cell::RefCell;

    /// The display the pointer is on is 1280 by 800 points with a picture twice that size. `others` are more displays, each
    /// with the text on it; their pictures are 1920 + 8 times their place in the list pixels wide, so each can be told apart.
    /// `fast_misses`: text the quick reader misreads (it leaves those boxes out), as Vision's fast level can with small or
    /// unusual text; the careful reader finds them.
    struct Fake { granted: bool, secure: bool, log: RefCell<Vec<String>>, text: Vec<OcrBox>, ax: Option<R>, fail_capture: bool, others: Vec<(R, Vec<OcrBox>)>, fail_other: bool, tried: RefCell<Vec<R>>, wins: (Vec<Win>, i32), fast_misses: Vec<&'static str> }
    impl Fake { fn new() -> Fake { Fake { granted: true, secure: false, log: RefCell::new(vec![]), text: vec![], ax: None, fail_capture: false, others: vec![], fail_other: false, tried: RefCell::new(vec![]), wins: (vec![], 0), fast_misses: vec![] } } fn said(&self) -> Vec<String> { self.log.borrow().clone() } }
    impl Platform for Fake {
        fn read_text_fast(&self, f: &Frame) -> Vec<OcrBox> {
            self.read_text(f).into_iter().filter(|b| !self.fast_misses.iter().any(|m| b.text.contains(m))).collect()
        }
        fn screen_recording_granted(&self) -> bool { self.log.borrow_mut().push("permission".into()); self.granted }
        fn secure_input_on(&self) -> bool { self.secure }
        fn indicator(&self, on: bool) { self.log.borrow_mut().push(format!("light {}", if on { "on" } else { "off" })); }
        fn capture(&self) -> Result<Captured, String> {
            self.log.borrow_mut().push("capture".into());
            if self.fail_capture { return Err("no display".into()); }
            Ok(Captured { frame: Frame::new(2560, 1600, vec![255; 2560 * 1600 * 4]).unwrap(), display: R { x: 0.0, y: 0.0, w: 1280.0, h: 800.0 } })
        }
        fn read_text(&self, f: &Frame) -> Vec<OcrBox> {
            if f.w >= 1920 && f.w < 2560 { self.others.get(((f.w - 1920) / 8) as usize).map(|s| s.1.clone()).unwrap_or_default() } else { self.text.clone() }
        }
        fn capture_other(&self, tried: &[R]) -> Option<Result<Captured, String>> {
            let (i, (d, _)) = self.others.iter().enumerate().find(|(_, (d, _))| !tried.contains(d))?;
            self.tried.borrow_mut().push(*d);
            self.log.borrow_mut().push("capture other".into());
            if self.fail_other { return Some(Err("that display went away".into())); }
            let w = 1920 + 8 * i as u32;
            Some(Ok(Captured { frame: Frame::new(w, 1200, vec![255; (w * 1200 * 4) as usize]).unwrap(), display: *d }))
        }
        fn windows(&self) -> (Vec<Win>, i32) { self.log.borrow_mut().push("windows".into()); self.wins.clone() }
        fn element_at(&self, _p: Pt) -> Option<R> { self.ax }
        fn send_image(&self, screen: usize, jpeg: &[u8], w: u32, h: u32) { self.log.borrow_mut().push(format!("send {screen} {}x{} jpeg={}", w, h, jpeg.starts_with(&[0xFF, 0xD8]))); }
        fn ask(&self, q: &str, pics: &[Pic], c: &[Cand]) {
            let labels: Vec<String> = pics.iter().map(|p| format!("{}:{}", p.screen, p.label.clone().unwrap_or_default())).collect();
            self.log.borrow_mut().push(format!("ask {q} [{}] ids=[{}] screens=[{}]", c.iter().map(|x| x.text.clone()).collect::<Vec<_>>().join("|"), c.iter().map(|x| format!("{}@{}", x.id, x.screen)).collect::<Vec<_>>().join(","), labels.join(",")));
        }
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
    fn when_the_line_is_not_on_this_display_the_other_displays_are_looked_at_too_under_the_same_light() {
        let mut f = Fake::new();
        f.text = vec![tb("a", "nothing useful here", 400.0, 200.0)];
        let second = R { x: 1280.0, y: 0.0, w: 1920.0, h: 1200.0 };   // a second, larger display to the right
        f.others = vec![(second, vec![tb("b", "const total: number = \"three\";", 400.0, 300.0)])];
        let (d, hit) = look_for(&f, |b| b.iter().find(|x| x.text.contains("const total")).map(|x| x.rect)).unwrap();
        assert_eq!(d, second);
        let r = hit.unwrap(); assert!(r.x >= 1280.0, "the place is on the second display, in global points: {r:?}");
        let said = f.said();
        assert_eq!(said.first().map(String::as_str), Some("permission"));
        assert_eq!(said.iter().filter(|x| *x == "light on").count(), 1, "one light for the whole look: {said:?}");
        assert_eq!(said.last().map(String::as_str), Some("light off"));
        assert!(said.iter().position(|x| x == "capture other").unwrap() < said.iter().position(|x| x == "light off").unwrap());
    }
    #[test]
    fn a_hit_on_the_first_display_never_looks_at_the_others() {
        let mut f = Fake::new();
        f.text = vec![tb("a", "const total = 1;", 400.0, 200.0)];
        f.others = vec![(R { x: 1280.0, y: 0.0, w: 1920.0, h: 1200.0 }, vec![tb("b", "const total = 1;", 400.0, 300.0)])];
        let (d, hit) = look_for(&f, |b| b.first().map(|x| x.rect)).unwrap();
        assert!(hit.is_some() && d.x == 0.0);
        assert!(!f.said().iter().any(|x| x == "capture other"));
    }
    #[test]
    fn nothing_found_anywhere_looks_at_each_display_once_and_says_nothing_found() {
        let mut f = Fake::new();
        f.text = vec![tb("a", "nope", 400.0, 200.0)];
        f.others = vec![(R { x: 1280.0, y: 0.0, w: 1920.0, h: 1200.0 }, vec![tb("b", "also nope", 400.0, 300.0)])];
        let (_, hit) = look_for(&f, |_: &[OcrBox]| None::<R>).unwrap();
        assert!(hit.is_none());
        assert_eq!(f.said().iter().filter(|x| *x == "capture other").count(), 1);
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
        assert!(f.said().iter().any(|x| x == "send 1 1280x800 jpeg=true"));
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
        let (s, _) = aim(&f, &prep, 1, 650.0, 395.0, None, "Save").unwrap();   // the picture is the display's own size here
        assert_eq!(s.how, How::Accessibility); assert!(s.rect.contains(Pt { x: 650.0, y: 395.0 }));
    }
    #[test]
    fn a_text_landmark_named_by_the_model_wins_and_is_in_screen_points() {
        let mut f = Fake::new(); f.text = vec![tb("a", "Deploy", 1100.0, 700.0)];   // full size picture pixels; the display is half that in points
        let prep = start(&f, "q").unwrap();
        let (s, _) = aim(&f, &prep, 1, 560.0, 360.0, Some("t1"), "Deploy").unwrap();
        assert_eq!(s.how, How::OcrId); assert!((s.rect.x - 550.0).abs() < 1.0 && (s.rect.y - 350.0).abs() < 1.0);
    }

    // ---- more than one screen in one Show me (M11) ----
    const RIGHT: R = R { x: 1280.0, y: 0.0, w: 1920.0, h: 1200.0 };
    const LEFT: R = R { x: -1440.0, y: 100.0, w: 1440.0, h: 900.0 };
    #[test]
    fn with_two_screens_both_are_looked_at_under_one_light_and_sent_labelled_the_pointers_screen_first() {
        let mut f = Fake::new();
        f.text = vec![tb("a", "Home", 100.0, 100.0)];
        f.others = vec![(RIGHT, vec![tb("b", "Deploy", 400.0, 300.0)])];
        let prep = start_on(&f, "where is Deploy?", true).unwrap();
        let s = f.said();
        assert_eq!(s.iter().filter(|x| *x == "light on").count(), 1, "{s:?}");
        let at = |k: &str| s.iter().position(|x| x.starts_with(k)).unwrap_or_else(|| panic!("{k} missing: {s:?}"));
        assert!(at("light on") < at("capture") && at("capture") < at("capture other") && at("capture other") < at("send 1") && at("send 1") < at("send 2") && at("send 2") < at("ask") && at("ask") < at("light off"), "{s:?}");
        let ask = &s[at("ask")];
        assert!(ask.contains("screens=[1:Screen 1 of 2 (the mouse pointer is on this one),2:Screen 2 of 2]"), "{ask}");
        // Landmark names never clash between screens: screen 1 keeps t1, t2..., screen 2 is s2t1, s2t2...
        assert!(ask.contains("ids=[t1@1,s2t1@2]"), "{ask}");
        assert_eq!(prep.shots.len(), 2);
        assert_eq!(prep.shots[0].display, R { x: 0.0, y: 0.0, w: 1280.0, h: 800.0 });
        assert_eq!(prep.shots[1].display, RIGHT);
        let deploy = prep.boxes.iter().find(|b| b.id == "s2t1").unwrap();
        assert!(deploy.rect.x >= 1280.0, "boxes are in global points: {:?}", deploy.rect);
    }
    #[test]
    fn unless_the_person_turned_on_all_screens_only_the_display_under_the_pointer_is_looked_at() {
        // Product doc sections 5 and 10: one press, the display under the cursor. All screens is the person's own choice.
        let mut f = Fake::new();
        f.others = vec![(RIGHT, vec![tb("b", "Deploy", 400.0, 300.0)])];
        let prep = start(&f, "q").unwrap();
        assert_eq!(prep.shots.len(), 1);
        assert!(!f.said().iter().any(|x| x == "capture other"), "{:?}", f.said());
        assert_eq!(f.said().iter().filter(|x| x.starts_with("send")).count(), 1);
    }
    #[test]
    fn with_one_screen_the_picture_is_sent_without_a_label_as_before() {
        let f = Fake::new();
        start(&f, "q").unwrap();
        let ask = f.said().into_iter().find(|x| x.starts_with("ask")).unwrap();
        assert!(ask.contains("screens=[1:]"), "{ask}");
        assert!(!f.said().iter().any(|x| x == "capture other"));
    }
    #[test]
    fn never_more_than_four_screens_and_a_screen_that_fails_is_left_out() {
        let mut f = Fake::new();
        f.others = (0..6).map(|i| (R { x: 1280.0 + i as f64 * 2000.0, y: 0.0, w: 1920.0, h: 1200.0 }, vec![])).collect();
        let prep = start_on(&f, "q", true).unwrap();
        assert_eq!(prep.shots.len(), 4);
        assert_eq!(f.said().iter().filter(|x| x.starts_with("send")).count(), 4);
        let mut g = Fake::new(); g.others = vec![(RIGHT, vec![])]; g.fail_other = true;
        let p = start_on(&g, "q", true).unwrap();
        assert_eq!(p.shots.len(), 1, "the screen the pointer is on is still asked about");
        assert!(g.said().iter().any(|x| x.starts_with("ask") && x.contains("screens=[1:]")));
    }
    #[test]
    fn every_screen_that_is_sent_is_read_carefully_so_a_secret_on_screen_two_is_covered_too() {
        // Found in review, 16 Oct 2026: screens 2 to 4 were read with the quick reader only, and those boxes are all the
        // covering has to go on. A secret the quick reader misread was left uncovered in the picture sent to the model.
        let mut f = Fake::new();
        f.text = vec![tb("a", "Home", 100.0, 100.0)];
        f.others = vec![(RIGHT, vec![tb("b", "Deploy", 400.0, 300.0), tb("c", "sk_live_abcdefghijklmnop1234", 400.0, 500.0)])];
        f.fast_misses = vec!["sk_live"];
        let prep = start_on(&f, "where is Deploy?", true).unwrap();
        assert_eq!(prep.shots.len(), 2);
        assert_eq!(prep.covered, 1, "the secret on screen 2 is blacked out in its picture before it is sent");
        let ask = f.said().into_iter().find(|x| x.starts_with("ask")).unwrap();
        assert!(ask.contains("Deploy") && !ask.contains("sk_live"), "{ask}");
    }
    #[test]
    fn the_model_names_a_screen_and_its_point_becomes_a_place_on_that_screen() {
        let mut f = Fake::new();
        f.others = vec![(LEFT, vec![])];
        let prep = start_on(&f, "q", true).unwrap();
        // The left screen's picture is 1920 + 0 wide in this fake, shrunk to 1280 on the long side.
        let pic = prep.shots[1];
        let (s, d) = aim(&f, &prep, 2, pic.img_w / 2.0, pic.img_h / 2.0, None, "x").unwrap();
        assert_eq!(d, LEFT);
        let c = s.rect.center();
        assert!((c.x - (LEFT.x + LEFT.w / 2.0)).abs() < 2.0 && (c.y - (LEFT.y + LEFT.h / 2.0)).abs() < 2.0, "{c:?}");
        assert!(s.rect.x >= LEFT.x && s.rect.x + s.rect.w <= LEFT.x + LEFT.w, "the ring stays on that screen: {:?}", s.rect);
        assert!(aim(&f, &prep, 3, 1.0, 1.0, None, "x").is_none(), "a screen that was not shown is not pointed at");
        assert!(aim(&f, &prep, 0, 1.0, 1.0, None, "x").is_none());
    }
    #[test]
    fn pictures_of_each_screen_have_their_own_name() {
        assert_eq!(image_ref("sm_7", 1), "sm_7");
        assert_eq!(image_ref("sm_7", 2), "sm_7-s2");
        assert_eq!(image_ref("sm_7", 4), "sm_7-s4");
    }
    #[test]
    fn the_question_names_every_screen_only_when_there_is_more_than_one() {
        let one = locate_command("sm_1", "q", &[Pic { screen: 1, w: 1280, h: 800, label: None }], &[Cand { id: "t1".into(), text: "Save".into(), rect: R { x: 1.0, y: 2.0, w: 3.0, h: 4.0 }, screen: 1 }]);
        assert_eq!(one["type"], "assist.locate");
        assert_eq!(one["image"], serde_json::json!({ "ref": "sm_1", "w": 1280, "h": 800 }));
        assert!(one.get("screens").is_none());
        assert_eq!(one["ocr"][0], serde_json::json!({ "id": "t1", "text": "Save", "box": [1.0, 2.0, 3.0, 4.0], "screen": 1 }));
        let two = locate_command("sm_2", "q", &[Pic { screen: 1, w: 1280, h: 800, label: Some(crate::coords::screen_label(1, 2)) }, Pic { screen: 2, w: 1280, h: 720, label: Some(crate::coords::screen_label(2, 2)) }], &[]);
        assert_eq!(two["image"]["ref"], "sm_2");
        assert_eq!(two["screens"], serde_json::json!([{ "ref": "sm_2", "w": 1280, "h": 800, "label": "Screen 1 of 2 (the mouse pointer is on this one)" }, { "ref": "sm_2-s2", "w": 1280, "h": 720, "label": "Screen 2 of 2" }]));
    }

    // ---- the window the picture was taken of (rule 22) ----
    use crate::fullscreen::Win;
    const OURS: i32 = 1;
    const SAFARI: i32 = 100;
    const WIN: [f64; 4] = [100.0, 100.0, 800.0, 600.0];
    fn prep_with(wins: Vec<Win>, front: i32) -> Prepared { let mut f = Fake::new(); f.wins = (wins, front); start(&f, "q").unwrap() }
    const TARGET: R = R { x: 300.0, y: 300.0, w: 80.0, h: 30.0 };
    #[test]
    fn the_windows_are_noted_with_the_picture_under_the_same_light() {
        let mut f = Fake::new(); f.wins = (vec![Win { pid: SAFARI, layer: 0, bounds: WIN }], SAFARI);
        let prep = start(&f, "q").unwrap();
        let s = f.said(); let at = |k: &str| s.iter().position(|x| x == k).unwrap();
        assert!(at("light on") < at("windows") && at("windows") < at("light off"));
        assert_eq!(prep.front_pid, SAFARI); assert_eq!(prep.wins.len(), 1);
    }
    #[test]
    fn a_target_is_drawn_only_while_its_window_is_as_it_was_when_the_picture_was_taken() {
        let prep = prep_with(vec![Win { pid: SAFARI, layer: 0, bounds: WIN }], SAFARI);
        assert!(unchanged(&prep, OURS, &[Win { pid: SAFARI, layer: 0, bounds: WIN }], SAFARI, TARGET));
        // moved, resized, covered by another app's window, closed, or another app came to the front
        assert!(!unchanged(&prep, OURS, &[Win { pid: SAFARI, layer: 0, bounds: [160.0, 100.0, 800.0, 600.0] }], SAFARI, TARGET));
        assert!(!unchanged(&prep, OURS, &[Win { pid: 200, layer: 0, bounds: [250.0, 250.0, 300.0, 300.0] }, Win { pid: SAFARI, layer: 0, bounds: WIN }], SAFARI, TARGET));
        assert!(!unchanged(&prep, OURS, &[], SAFARI, TARGET));
        assert!(!unchanged(&prep, OURS, &[Win { pid: SAFARI, layer: 0, bounds: WIN }], 200, TARGET));
        // Companion's own card coming up in front does not count.
        assert!(unchanged(&prep, OURS, &[Win { pid: OURS, layer: 0, bounds: [280.0, 280.0, 340.0, 150.0] }, Win { pid: SAFARI, layer: 0, bounds: WIN }], SAFARI, TARGET));
    }
    #[test]
    fn with_no_ordinary_window_under_the_target_when_the_picture_was_taken_it_cannot_be_checked_here() {
        // A menu or the desktop: the ring is still drawn, and draw time decides it can only be soft.
        let prep = prep_with(vec![], SAFARI);
        assert!(unchanged(&prep, OURS, &[], SAFARI, TARGET));
    }

    // ---- what the page may ask for ----
    #[test]
    fn only_the_four_known_marks_are_passed_on() {
        for k in ["ring", "arrow", "underline", "box"] { assert_eq!(mark_name(Some(k)), Some(k)); }
        for k in [Some("sparkles"), Some("<script>"), Some(""), None] { assert_eq!(mark_name(k), None); }
    }
    #[test]
    fn the_pointing_message_carries_its_request_so_a_lesson_or_a_walkthrough_moves_on_after_the_click() {
        let v = pointing_extra("sm_9", 1, 1, true);
        assert_eq!(v["req"], "sm_9"); assert_eq!(v["turn"], true);
        assert!(v.get("step").is_none() && v.get("of").is_none(), "one target is said as before");
        let mid = pointing_extra("sm_9", 2, 3, false);
        assert_eq!(mid["req"], "sm_9"); assert_eq!(mid["turn"], false); assert_eq!(mid["step"], 2); assert_eq!(mid["of"], 3);
    }
    #[test]
    fn the_shell_sends_the_request_with_every_show_me_ring() {
        // Found 16 Oct 2026: the ring's message carried no request, so a lesson step or a walkthrough never moved on by
        // itself after the person's click (the page waits for its own request's "your turn done").
        let main = include_str!("main.rs");
        let aim = &main[main.find("fn showme_aim(").unwrap()..];
        let aim = &aim[..aim.find("\n}\n").unwrap()];
        assert!(aim.contains("showme::pointing_extra(&req"), "showme_aim must say which request it points for");
    }
    // ---- one answer at a time, and what ends it (found in review, 16 Oct 2026) ----
    // Before this, closing the card or holding to talk only silenced the current line: the rest of a multi step answer went
    // on pointing and talking with the card closed. And Point at the problem did not end an answer still playing, so its
    // next step took Point at the problem's ring away.
    fn three_steps() -> (Pending, Prepared) {
        let prep = prep_with(vec![], SAFARI);
        let mut a = Pending::default();
        a.begin("sm_1", prep.clone());
        (a, prep)
    }
    #[test]
    fn each_step_of_an_answer_gets_what_was_seen_and_the_last_one_takes_it() {
        let (mut a, _) = three_steps();
        assert!(a.is_on());
        let (_, from) = a.step("sm_1", false).expect("step 1");
        assert_eq!(from, None, "the first step flies from the character");
        a.pointed("sm_1", Pt { x: 10.0, y: 20.0 });
        let (_, from) = a.step("sm_1", false).expect("step 2");
        assert_eq!(from, Some(Pt { x: 10.0, y: 20.0 }), "the next flight starts where the last step pointed");
        assert!(a.step("sm_1", true).is_some(), "step 3, the last");
        assert!(!a.is_on(), "what was seen is forgotten after the last step");
        assert!(a.step("sm_1", false).is_none() && a.step("sm_1", true).is_none());
    }
    #[test]
    fn a_step_of_another_answer_gets_nothing() {
        let (mut a, _) = three_steps();
        assert!(a.step("sm_0", false).is_none());
        assert!(a.is_on(), "and the current answer is left as it is");
    }
    #[test]
    fn once_an_answer_is_ended_no_step_still_to_come_is_drawn() {
        // Closing the card, holding to talk, Point at the problem and Stop all end it the same way.
        let (mut a, _) = three_steps();
        assert!(a.step("sm_1", false).is_some());
        a.pointed("sm_1", Pt { x: 1.0, y: 1.0 });
        assert!(a.end(), "an answer with steps still to come was ended");
        assert!(!a.is_on());
        assert!(a.step("sm_1", false).is_none(), "step 2 is gone");
        assert!(a.step("sm_1", true).is_none(), "and so is the last one");
        assert!(!a.end(), "ending again reports nothing was playing");
    }
    #[test]
    fn an_answer_still_on_its_way_is_ended_too() {
        // The question was asked and the answer has not come yet: it is dropped when it comes.
        let (mut a, _) = three_steps();
        assert!(a.end());
        assert!(a.step("sm_1", true).is_none());
    }
    #[test]
    fn ending_one_answer_never_ends_a_newer_one() {
        let (mut a, prep) = three_steps();
        a.begin("sm_2", prep);
        a.end_if("sm_1");
        assert!(a.is_on(), "a late tidy up of sm_1 leaves sm_2 alone");
        a.pointed("sm_1", Pt { x: 5.0, y: 5.0 });
        assert_eq!(a.step("sm_2", false).unwrap().1, None, "nor does a late point of sm_1 move sm_2's flight");
        a.end_if("sm_2");
        assert!(!a.is_on());
    }
    #[test]
    fn a_new_question_starts_with_nothing_left_over() {
        let (mut a, prep) = three_steps();
        a.step("sm_1", false); a.pointed("sm_1", Pt { x: 9.0, y: 9.0 });
        a.begin("sm_2", prep);
        assert_eq!(a.step("sm_2", false).unwrap().1, None);
    }
    #[test]
    fn the_shell_ends_an_answer_when_the_card_closes_on_hold_to_talk_and_on_point_at_the_problem() {
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let hush = body("fn card_closed_hush(");
        assert!(hush.contains("speech_off(app)") && hush.contains("showme_end_answer(app)") && hush.contains("emit(\"hush\""), "closing the card silences it and ends an answer still playing");
        assert!(body("fn close_card(").contains("card_closed_hush(&app)"), "Esc in the card");
        // A click on the character, or on the island in the notch (F18 item 1), closes Home through toggle_home.
        let line = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find('\n').unwrap()].to_string() };
        assert!(line("fn toggle_card(").contains("toggle_home(app, \"character\")") && line("fn island_click(").contains("toggle_home(app, \"island\")"));
        assert!(body("fn toggle_home(").contains("card_closed_hush("), "and a click on the character or the island");
        // Hold to talk is the two key chord in use (F18 item 3): found by is_talk(s).
        let hold = &main[main.find("if is_talk(s) {").unwrap()..];
        let hold = &hold[..hold.find("voice_send(app").unwrap()];
        assert!(hold.contains("showme_end_answer(app)") && hold.contains("emit(\"hush\""), "so does starting to hold to talk");
        let pp = body("fn point_problem(");
        let start = &pp[..pp.find("std::thread::spawn").unwrap()];
        assert!(start.contains("showme_end_answer(&app)") && start.contains("hide_overlay(&app)"), "Point at the problem ends any Show me answer and takes its ring away first");
        assert!(body("fn showme_end_answer(").contains("say_showme(app, \"done\""), "and the page is told, so it stops too");
        assert!(main.contains("if t == \"runner.hello\" { showme_pending().end(); }"), "a restarted engine knows no question: what was seen is forgotten");
    }
    #[test]
    fn a_step_is_the_last_one_when_it_is_the_end_of_the_list_or_when_no_list_was_given() {
        assert!(is_last(None, None) && is_last(Some(3), Some(3)) && is_last(Some(1), Some(1)));
        assert!(!is_last(Some(1), Some(3)) && !is_last(Some(2), Some(3)));
        assert!(is_last(Some(9), Some(3)), "past the end is never left waiting");
    }
}
