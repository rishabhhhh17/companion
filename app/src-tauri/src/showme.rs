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

/// What is said when Show me or Point at the problem would look while nothing of Companion can be seen (hidden from the
/// menu bar, or for a full screen app, with Home closed): the light could not be seen, so nothing is looked at (rule 5).
pub const HIDDEN_WORDS: &str = "Companion is hidden right now, so I did not look at your screen. Leave full screen or show Companion from the menu bar icon, then try again.";

#[derive(Debug, PartialEq, Eq)]
/// Stopped: Stop everything or a newer question came after the light went on, so no picture was taken at all.
pub enum Refusal { NeedsScreenRecording, SecureInput, CaptureFailed(String), PictureFailed(String), Stopped }

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
    /// Before the picture of a walkthrough step that follows a click: wait, under the light, until the page stops changing
    /// (wait_to_settle), and say how the wait ended. Not asked by default; the Mac's platform waits only when the page
    /// asked for it. Stopped means no picture is taken.
    fn settle(&self) -> Settle { Settle::NotAsked }
    /// Is this look still wanted (no Stop everything, no newer question since it began)? Asked under the light, right
    /// before the one picture, so a look stopped meanwhile takes none.
    fn still_wanted(&self) -> bool { true }
}

// ---- waiting for the page to settle (HeyClicky v1.0.53 parity) ----
// After a click in a walkthrough, a slow page can be looked at half loaded, and the next ring then lands on the old page or
// is only a guess. When the page asks (anywhere.ts waitsForPage), small looks of the same display are taken a moment apart,
// in memory only, and the real look goes ahead as soon as two match, or after at most SETTLE_MAX_MS. The light is on the
// whole time (rule 5: a walkthrough the person started may look again at each step while it is visibly on), nothing of the
// small looks is ever sent or kept, and Stop everything or a newer question ends the wait at once.
pub const SETTLE_GAP_MS: u64 = 300;
pub const SETTLE_MAX_MS: u64 = 3000;
/// How wide a small look is, in pixels: enough to see a page draw, far too small to read.
pub const GLANCE_W: usize = 192;
/// Two small looks are the same when at most 0.3 percent of their pixels changed clearly: a blinking caret, a ticking
/// clock or a small spinner is still a page that has settled; a page still drawing is not. Another size never matches.
pub fn looks_same(a: &Frame, b: &Frame) -> bool {
    if a.w != b.w || a.h != b.h || a.rgba.len() != b.rgba.len() { return false; }
    let n = (a.w as usize) * (a.h as usize);
    if n == 0 { return false; }
    let changed = a.rgba.chunks_exact(4).zip(b.rgba.chunks_exact(4)).filter(|(p, q)| p[..3].iter().zip(&q[..3]).any(|(x, y)| x.abs_diff(*y) > 24)).count();
    changed * 1000 <= n * 3
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Settle { Still, TimedOut, Stopped, NoLook, NotAsked }
/// Looks, waits `gap_ms`, looks again, until two looks match (Still), `max_ms` of waiting has passed (TimedOut), the look
/// is no longer wanted (Stopped: Stop everything, a newer question) or a look fails (NoLook). The real look goes ahead in
/// every case except Stopped, where start_on takes no picture (Refusal::Stopped).
pub fn wait_to_settle(mut look: impl FnMut() -> Option<Frame>, mut pause: impl FnMut(u64), wanted: impl Fn() -> bool, gap_ms: u64, max_ms: u64) -> Settle {
    if !wanted() { return Settle::Stopped; }
    let Some(mut prev) = look() else { return Settle::NoLook };
    let mut waited = 0;
    while waited < max_ms {
        if !wanted() { return Settle::Stopped; }
        pause(gap_ms);
        waited += gap_ms;
        if !wanted() { return Settle::Stopped; }
        let Some(next) = look() else { return Settle::NoLook };
        if looks_same(&prev, &next) { return Settle::Still; }
        prev = next;
    }
    Settle::TimedOut
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
        // A walkthrough step after a click: the page may still be loading (settle; nothing unless the page asked). Stop
        // everything or a newer question during the wait, or since the light came on, means no picture at all. A password
        // box that took focus meanwhile (a sign in page loading) is checked again right before the picture.
        if p.settle() == Settle::Stopped || !p.still_wanted() { return Err(Refusal::Stopped); }
        if p.secure_input_on() { return Err(Refusal::SecureInput); }
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
        // Stop, a newer run or Companion hidden since the light came on: no picture.
        if !p.still_wanted() { return Err(Refusal::Stopped); }
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

/// Rule 22: a ring is solid only on a confirmed target inside a known window. Nothing else, no setting, makes it solid.
pub fn solid(exact: bool, has_window: bool) -> bool { exact && has_window }
/// When Companion is only guessing (point.guesses): the usual soft ring called a guess, or, with words only, no ring at
/// all and the place said in words. A confirmed target is drawn either way.
pub fn said_in_words(exact: bool, has_window: bool, guesses: &Value) -> bool { guesses.as_str() == Some("wordsOnly") && !solid(exact, has_window) }

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
    #[test]
    fn a_guess_is_never_drawn_solid_and_with_words_only_it_is_not_drawn_at_all() {
        // point.guesses, usual softRing (today: a soft ring called a guess). Solid needs a confirmed target in a known window,
        // whatever the setting says; words only takes away the soft ring too, never a confirmed one.
        for g in [serde_json::json!("softRing"), serde_json::json!("wordsOnly"), serde_json::json!(null), serde_json::json!("solid")] {
            assert!(!solid(false, true) && !solid(true, false) && !solid(false, false), "{g}");
            assert!(solid(true, true));
            assert!(!said_in_words(true, true, &g), "{g}: a confirmed target is always drawn");
        }
        for (exact, window) in [(false, true), (true, false), (false, false)] {
            assert!(!said_in_words(exact, window, &serde_json::json!("softRing")), "the usual: the soft ring, as today");
            assert!(said_in_words(exact, window, &serde_json::json!("wordsOnly")));
            assert!(!said_in_words(exact, window, &serde_json::json!("solid")), "an odd value is the usual");
        }
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap()..]; s[..s.find("\n}\n").unwrap()].to_string() };
        assert!(body("fn draw_pointer_with(").contains("showme::solid(exact, watched.window().is_some())"));
        for f in ["fn showme_aim(", "fn point_problem("] {
            assert!(body(f).contains("showme::said_in_words("), "{f} must say a guess in words when asked to");
            assert!(body(f).contains("setting_now(\"point.guesses\")"), "{f}");
        }
    }
    #[test]
    fn words_only_and_the_ring_come_from_one_look_at_the_window() {
        // The window under the target is looked up once, and both the words only choice and the ring use that one reading,
        // so a window that comes or goes in between can never bring a soft ring back under Words only.
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap()..]; s[..s.find("\n}\n").unwrap()].to_string() };
        for f in ["fn showme_aim(", "fn point_problem("] {
            let b = body(f);
            assert_eq!(b.matches("anchor_for(").count(), 1, "{f}: the window under the target is looked up once");
            assert!(b.contains("said_in_words(") && b.contains("under.is_some()"), "{f}: words only reads that one look");
            assert!(b.contains("draw_pointer_with(") && b.contains(", under)"), "{f}: and the ring is drawn from it");
        }
        let draw = body("fn draw_pointer_with(");
        assert!(!draw.contains("anchor_for("), "the ring never looks again");
        assert!(draw.contains("anchor::watched_for(under, front_pid())"));
        assert!(!main.contains("fn draw_pointer("), "one way to draw a ring");
        // With no window confirmed under the target, Words only draws nothing, however sure the reading was.
        for exact in [true, false] { assert!(said_in_words(exact, false, &serde_json::json!("wordsOnly"))); }
    }
    use crate::snap::How;
    use std::cell::RefCell;

    /// The display the pointer is on is 1280 by 800 points with a picture twice that size. `others` are more displays, each
    /// with the text on it; their pictures are 1920 + 8 times their place in the list pixels wide, so each can be told apart.
    /// `fast_misses`: text the quick reader misreads (it leaves those boxes out), as Vision's fast level can with small or
    /// unusual text; the careful reader finds them.
    /// `settles`: the page asked to wait for the page to settle; `settled`: how that wait ends. `secure_after`: a password box
    /// takes focus during the wait. `unwanted`: Stop everything or a newer question came after the light went on.
    struct Fake { granted: bool, secure: std::cell::Cell<bool>, log: RefCell<Vec<String>>, text: Vec<OcrBox>, ax: Option<R>, fail_capture: bool, others: Vec<(R, Vec<OcrBox>)>, fail_other: bool, tried: RefCell<Vec<R>>, wins: (Vec<Win>, i32), fast_misses: Vec<&'static str>, settles: bool, settled: Settle, secure_after: bool, unwanted: bool }
    impl Fake { fn new() -> Fake { Fake { granted: true, secure: std::cell::Cell::new(false), log: RefCell::new(vec![]), text: vec![], ax: None, fail_capture: false, others: vec![], fail_other: false, tried: RefCell::new(vec![]), wins: (vec![], 0), fast_misses: vec![], settles: false, settled: Settle::Still, secure_after: false, unwanted: false } } fn said(&self) -> Vec<String> { self.log.borrow().clone() } }
    impl Platform for Fake {
        fn settle(&self) -> Settle {
            if !self.settles { return Settle::NotAsked; }
            self.log.borrow_mut().push("settle".into());
            if self.secure_after { self.secure.set(true); }
            self.settled
        }
        fn still_wanted(&self) -> bool { !self.unwanted }
        fn read_text_fast(&self, f: &Frame) -> Vec<OcrBox> {
            self.read_text(f).into_iter().filter(|b| !self.fast_misses.iter().any(|m| b.text.contains(m))).collect()
        }
        fn screen_recording_granted(&self) -> bool { self.log.borrow_mut().push("permission".into()); self.granted }
        fn secure_input_on(&self) -> bool { self.secure.get() }
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
        let f = Fake::new(); f.secure.set(true);
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
        let f = Fake::new(); f.secure.set(true);
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
    #[test]
    fn aiming_runs_off_the_main_thread_and_never_draws_after_stop() {
        // Finding what is clickable under the point asks the app under it, through Accessibility, which a busy app can hold
        // for seconds. That must never freeze the main thread (the hotkeys, Stop everything, the island, Home), so the
        // command runs on the thread pool, and the questions to that app are short.
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        assert!(main.contains("#[tauri::command(async)]\n#[allow(clippy::too_many_arguments)]\nfn showme_aim("), "showme_aim runs off the main thread");
        // Off the main thread, Stop everything or a newer question can come in while it aims: then nothing is drawn. The
        // ring is claimed in one step after the aim, and checked again on the main thread just before it is drawn.
        let aim = body("fn showme_aim(");
        let (asked, claim) = (aim.find("let asked = POINT_GEN.load(SeqCst);").expect("noted before the aim"), aim.find("POINT_GEN.compare_exchange(asked, asked + 1, SeqCst, SeqCst).is_err()").expect("claimed after"));
        assert!(asked < aim.find("showme::aim(").unwrap() && aim.find("showme::aim(").unwrap() < claim && claim < aim.find("draw_pointer_with(").unwrap(), "{aim}");
        assert!(!aim.contains("POINT_GEN.fetch_add("), "{aim}");
        assert!(aim.contains("your_turn(&app, display, s.rect, &target_text, asked + 1)"), "{aim}");
        let draw = body("fn draw_pointer_with(");
        let on_main = &draw[draw.find("run_on_main_thread(").unwrap()..];
        assert!(draw.contains("let gen = POINT_GEN.load(std::sync::atomic::Ordering::SeqCst);") && on_main.contains("if POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) != gen { return; }"), "{draw}");
        let turn = body("fn your_turn(");
        let (set, check) = (turn.find("*TURN.lock()").unwrap(), turn.find("if POINT_GEN.load(std::sync::atomic::Ordering::SeqCst) != point { turn_cancel(); return; }").expect("a ring stopped before it waits never waits"));
        assert!(set < check && check < turn.find("std::thread::spawn(").unwrap(), "{turn}");
        assert!(body("fn point_problem(").contains("your_turn(&app, d, f.rect, &label, gen)"));
        // Each question to the app under the point may take half a second at most; the system wide element (which would
        // change every Accessibility call Companion makes) is never given a timeout.
        let ax = include_str!("ax.rs");
        let click = &ax[ax.find("pub fn clickable_at(").unwrap()..]; let click = &click[..click.find("\n}\n").unwrap()];
        assert_eq!(click.matches("quick(&cur);").count(), 2, "the element under the point and each parent asked: {click}");
        assert!(!click.contains("quick(&sys)"));
        assert!(ax.contains("fn quick(el: &Cf) { unsafe { AXUIElementSetMessagingTimeout(el.0, QUICK_S); } }"));
        // Stop everything and Cancel run on the main thread, and switching another app's Accessibility off again writes into
        // it: that is done on a helper thread, with what was woken taken at once (so a newer read keeps what it wakes).
        let ph = include_str!("phelp.rs");
        let dismiss = &ph[ph.find("pub fn dismiss(").unwrap()..]; let dismiss = &dismiss[..dismiss.find('\n').unwrap()];
        assert!(dismiss.contains("ax::let_apps_sleep_soon();") && !dismiss.contains("ax::let_apps_sleep();"), "{dismiss}");
        let soon = &ax[ax.find("pub fn let_apps_sleep_soon(").unwrap()..]; let soon = &soon[..soon.find("\n}\n").unwrap()];
        assert!(soon.find("std::mem::take(").unwrap() < soon.find("std::thread::spawn(").unwrap(), "{soon}");
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

    // ---- waiting for the page to settle (HeyClicky v1.0.53 parity: walkthroughs wait for slow pages to load) ----
    fn flat(w: u32, h: u32, v: u8) -> Frame { Frame::new(w, h, vec![v; (w * h * 4) as usize]).unwrap() }
    fn with_dots(mut f: Frame, n: usize) -> Frame { for i in 0..n { let k = i * 4; f.rgba[k] = 255 - f.rgba[k]; f.rgba[k + 1] = 255 - f.rgba[k + 1]; } f }
    #[test]
    fn two_small_looks_match_when_nothing_or_only_a_caret_or_a_clock_changed() {
        let a = flat(192, 120, 40);
        assert!(looks_same(&a, &a.clone()));
        // A blinking caret or a ticking clock: a few pixels.
        assert!(looks_same(&a, &with_dots(a.clone(), 20)));
        // A tiny change in shade (a shadow fading) is not a change.
        assert!(looks_same(&a, &flat(192, 120, 50)));
        // A page still drawing: many pixels change.
        assert!(!looks_same(&a, &with_dots(a.clone(), 5000)));
        assert!(!looks_same(&a, &flat(192, 120, 200)));
        // A look of another size (the display changed) never matches.
        assert!(!looks_same(&a, &flat(96, 60, 40)));
    }
    #[test]
    fn the_wait_goes_on_as_soon_as_two_looks_match() {
        let looks = RefCell::new(vec![flat(8, 8, 0), flat(8, 8, 200), flat(8, 8, 90), flat(8, 8, 90)]);
        let paused = RefCell::new(0u64);
        let r = wait_to_settle(|| { let mut l = looks.borrow_mut(); (!l.is_empty()).then(|| l.remove(0)) }, |ms| *paused.borrow_mut() += ms, || true, SETTLE_GAP_MS, SETTLE_MAX_MS);
        assert_eq!(r, Settle::Still);
        assert_eq!(*paused.borrow(), 3 * SETTLE_GAP_MS, "three gaps: changing, changing, the same");
        assert!(looks.borrow().is_empty());
    }
    #[test]
    fn a_page_that_never_settles_costs_at_most_the_limit() {
        let n = std::cell::Cell::new(0u8);
        let paused = RefCell::new(0u64);
        let r = wait_to_settle(|| { n.set(n.get().wrapping_add(97)); Some(flat(8, 8, n.get())) }, |ms| *paused.borrow_mut() += ms, || true, SETTLE_GAP_MS, SETTLE_MAX_MS);
        assert_eq!(r, Settle::TimedOut);
        assert_eq!(*paused.borrow(), SETTLE_MAX_MS, "bounded: about 3 seconds");
        assert!(SETTLE_MAX_MS <= 3000 && SETTLE_GAP_MS >= 200);
    }
    #[test]
    fn stop_everything_or_a_newer_question_ends_the_wait_at_once_and_no_more_looks_are_taken() {
        let looks = std::cell::Cell::new(0u32);
        let asks = std::cell::Cell::new(0u32);
        let r = wait_to_settle(|| { looks.set(looks.get() + 1); Some(flat(8, 8, (looks.get() * 60) as u8)) }, |_| {}, || { asks.set(asks.get() + 1); asks.get() < 3 }, SETTLE_GAP_MS, SETTLE_MAX_MS);
        assert_eq!(r, Settle::Stopped);
        assert!(looks.get() <= 2, "nothing looked at after the stop: {}", looks.get());
        // Stopped before anything: one look at most, no pause.
        let paused = std::cell::Cell::new(0u64);
        assert_eq!(wait_to_settle(|| Some(flat(8, 8, 1)), |ms| paused.set(paused.get() + ms), || false, SETTLE_GAP_MS, SETTLE_MAX_MS), Settle::Stopped);
        assert_eq!(paused.get(), 0);
    }
    #[test]
    fn a_look_that_fails_ends_the_wait_and_the_real_look_goes_ahead() {
        assert_eq!(wait_to_settle(|| None, |_| {}, || true, SETTLE_GAP_MS, SETTLE_MAX_MS), Settle::NoLook);
    }
    #[test]
    fn the_wait_happens_under_the_light_before_the_one_picture_that_is_sent() {
        let mut f = Fake::new(); f.settles = true;
        start(&f, "where?").unwrap();
        let s = f.said(); let at = |k: &str| s.iter().position(|x| x.starts_with(k)).unwrap();
        assert!(at("light on") < at("settle") && at("settle") < at("capture") && at("capture") < at("send"), "{s:?}");
        assert_eq!(s.iter().filter(|x| x.starts_with("send")).count(), 1, "the small looks are never sent");
        // Point at the problem never waits.
        let mut g = Fake::new(); g.settles = true; g.text = vec![tb("a", "x", 1.0, 1.0)];
        look_for(&g, |b| b.first().map(|x| x.rect)).unwrap();
        assert!(!g.said().iter().any(|x| x == "settle"));
    }
    // Found in review (19 Oct 2026): a wait ended by Stop everything or a newer question still took the full picture right
    // after, read it and made it ready to send, with the light already said to be off. And a password box that took focus
    // during the wait (a sign in page loading) was not seen: it was checked once, before the light.
    #[test]
    fn stop_during_the_wait_takes_no_picture_at_all_and_the_light_goes_off() {
        let mut f = Fake::new(); f.settles = true; f.settled = Settle::Stopped;
        assert_eq!(start(&f, "where?").err(), Some(Refusal::Stopped));
        let s = f.said();
        assert!(!s.iter().any(|x| x == "capture" || x.starts_with("send") || x.starts_with("ask") || x == "windows"), "{s:?}");
        assert_eq!(s.last().map(String::as_str), Some("light off"));
    }
    #[test]
    fn a_look_no_longer_wanted_after_the_light_takes_no_picture_waiting_or_not() {
        for settles in [false, true] {
            let mut f = Fake::new(); f.settles = settles; f.unwanted = true;
            assert_eq!(start(&f, "where?").err(), Some(Refusal::Stopped), "settles {settles}");
            let s = f.said();
            assert!(!s.iter().any(|x| x == "capture" || x.starts_with("send") || x.starts_with("ask")), "{s:?}");
            assert_eq!(s.last().map(String::as_str), Some("light off"));
        }
    }
    #[test]
    fn point_at_the_problem_takes_no_picture_once_it_is_no_longer_wanted() {
        // Companion hidden after the light came on (Hide in the menu bar, a full screen app), or Stop meanwhile: the light
        // goes off again and nothing is captured.
        let mut f = Fake::new(); f.unwanted = true;
        assert_eq!(look_for(&f, |b| b.first().map(|x| x.rect)).err(), Some(Refusal::Stopped));
        let s = f.said();
        assert!(!s.iter().any(|x| x.starts_with("capture")), "{s:?}");
        assert_eq!(s.last().map(String::as_str), Some("light off"));
    }
    #[test]
    fn nothing_is_looked_at_while_companion_cannot_be_seen_and_hiding_it_ends_every_pointer() {
        // Rule 5: the light is the character, the island and Home. Hidden (from the menu bar, or for a full screen app) with
        // Home closed, none of it can be seen, so no look starts, and a look already under the light takes no picture.
        assert!(HIDDEN_WORDS.starts_with("Companion is hidden right now, so I did not look at your screen.") && !HIDDEN_WORDS.contains('\u{2014}'));
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let unseen = body("fn light_unseen(");
        assert!(unseen.contains("companion_hidden()") && unseen.contains("!HOME_OPEN.load("), "{unseen}");
        let start = body("fn showme_start(");
        let check = start.find("if light_unseen() {").expect("showme_start checks before anything");
        for later in ["point_cancel();", "std::thread::spawn(", "showme::start_on("] { assert!(check < start.find(later).unwrap(), "{later}"); }
        assert!(start[check..].contains("showme::HIDDEN_WORDS"));
        assert!(start.contains(".while_wanted(Box::new(move || current() && !light_unseen()))"), "hidden during the light or the wait: no picture");
        let point = body("fn point_problem(");
        let look = point.find("showme::look_for(").unwrap();
        assert!(point[..look].contains("if light_unseen() {") && point[..look].contains("showme::HIDDEN_WORDS"), "{point}");
        assert!(point.contains(".while_wanted(Box::new(move || alive() && !light_unseen()))"), "{point}");
        // Both ways of hiding take every pointer away, so no ring stays drawn and no your turn watch keeps reading the mouse
        // (its next step would look at the screen with nothing of Companion showing).
        let gone = body("fn pointers_gone_hidden(");
        for p in ["point_cancel();", "hide_overlay(app);", "showme_pending().end()"] { assert!(gone.contains(p), "{p}: {gone}"); }
        let tick = body("fn tick(");
        let hide = &tick[tick.find("HIDDEN_BY_US.swap(true").unwrap()..tick.find("} else if show && HIDDEN_BY_US.swap(false").unwrap()];
        assert!(hide.contains("pointers_gone_hidden(app);"), "the full screen hide: {hide}");
        let user = body("fn set_user_hidden(");
        assert!(user.contains("if hide { home_closed(); voice_tell_hidden(); pointers_gone_hidden(app); }"), "Hide in the menu bar: {user}");
        assert!(main.contains("\"hide\" => { let a = app.clone(); let _ = app.run_on_main_thread(move || set_user_hidden(&a, !USER_HID.load(Ordering::SeqCst))); }"));
    }
    #[test]
    fn a_password_box_that_takes_focus_during_the_wait_stops_the_look() {
        let mut f = Fake::new(); f.settles = true; f.secure_after = true;
        assert_eq!(start(&f, "where?").err(), Some(Refusal::SecureInput));
        let s = f.said();
        assert!(!s.iter().any(|x| x == "capture" || x.starts_with("send") || x.starts_with("ask")), "{s:?}");
        assert_eq!(s.last().map(String::as_str), Some("light off"));
        // Every other way the wait ends, the one picture goes ahead as before.
        for how in [Settle::Still, Settle::TimedOut, Settle::NoLook] {
            let mut g = Fake::new(); g.settles = true; g.settled = how;
            assert!(start(&g, "where?").is_ok(), "{how:?}");
            assert_eq!(g.said().iter().filter(|x| x.starts_with("send")).count(), 1, "{how:?}");
        }
    }
    #[test]
    fn a_stopped_look_says_nothing_and_point_at_the_problem_never_waits() {
        let main = include_str!("main.rs");
        let b = &main[main.find("fn showme_start(").unwrap()..]; let b = &b[..b.find("\n}\n").unwrap()];
        assert!(b.contains("Err(showme::Refusal::Stopped) => { if current() { say_showme(&app, \"error\", showme::HIDDEN_WORDS, json!({})); } }"), "a look ended by Stop or a newer question says nothing; only one ended by hiding says why: {b}");
        assert!(b.contains(".while_wanted(Box::new(move || current() && !light_unseen()))"), "{b}");
        let see = include_str!("macos_see.rs");
        assert!(see.contains("fn still_wanted(&self) -> bool { self.wanted.as_ref().map_or(true, |w| w()) }"));
    }
    #[test]
    fn the_shell_waits_only_when_the_page_asks_and_stop_ends_the_wait() {
        let main = include_str!("main.rs");
        let b = &main[main.find("fn showme_start(").unwrap()..]; let b = &b[..b.find("\n}\n").unwrap()];
        assert!(b.contains("settle: Option<bool>"), "{b}");
        assert!(b.contains(".settling(settle.unwrap_or(false))"), "{b}");
        let see = include_str!("macos_see.rs");
        let st = &see[see.find("fn settle(&self)").unwrap()..]; let st = &st[..st.find("\n    }\n").unwrap()];
        assert!(st.contains("crate::showme::wait_to_settle("), "{st}");
        assert!(st.contains("glance()"), "small looks of the display under the pointer");
        // The small looks are kept in memory only, and never sent: nothing in the wait writes or sends.
        assert!(!st.contains("send_image") && !st.contains("write") && !st.contains("to_jpeg"), "{st}");
    }
}
