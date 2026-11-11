//! The real Mac behind Show me how: one screenshot of the display under the pointer (with Companion's own windows and
//! password managers left out of the picture), a read of the text on it, and the clickable thing at a point.
//! It runs only after the hotkey, with the light already on, and never writes the picture to disk.
#![cfg(target_os = "macos")]

use crate::coords::{Pt, R};
use crate::frame::Frame;
use crate::showme::{Cand, Captured, Pic, Platform};
use crate::snap::OcrBox;
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::AnyThread;
use objc2_core_graphics::{CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo, CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess, CGDisplayPixelsWide};
use objc2_core_foundation::{CGPoint, CGRect, CGSize, CFRetained};
use objc2_foundation::{NSArray, NSData, NSDictionary, NSError};
use objc2_screen_capture_kit::{SCContentFilter, SCDisplay, SCScreenshotManager, SCShareableContent, SCStreamConfiguration, SCWindow};
use objc2_vision::{VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation, VNRequestTextRecognitionLevel};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

/// Apps whose pixels must never exist in a picture we take: these, and every app Prompt help never reads (`left_out_of_pictures`).
pub const NEVER_CAPTURE: &[&str] = &["com.1password.1password", "com.agilebits.onepassword7", "com.bitwarden.desktop", "com.apple.keychainaccess", "com.apple.Passwords", "org.keepassxc.keepassxc", "com.lastpass.LastPass", "com.dashlane.dashlanephonefinal"];
/// Show me how is often asked about System Settings, so it stays in pictures (Prompt help still never reads it).
const SYSTEM_SETTINGS: &str = "com.apple.systempreferences";
/// Is this app's every window left out of a picture? The list above, or one Prompt help never reads (the password managers,
/// Keychain Access, Passwords, the system's own password prompts), except System Settings. Case is ignored, as macOS does.
pub fn left_out_of_pictures(bundle: &str) -> bool {
    !bundle.is_empty() && (NEVER_CAPTURE.iter().any(|b| b.eq_ignore_ascii_case(bundle)) || (crate::prompthelp::built_in_never(bundle) && !bundle.eq_ignore_ascii_case(SYSTEM_SETTINGS)))
}

pub type SendImage = Box<dyn Fn(usize, &[u8], u32, u32) + Send + Sync>;
pub type AskFn = Box<dyn Fn(&str, &[Pic], &[Cand]) + Send + Sync>;
pub struct MacPlatform {
    pub send_image: SendImage,
    pub ask: AskFn,
    pub light: Box<dyn Fn(bool) + Send + Sync>,
    last_display: Mutex<Option<R>>,
    /// Whether the look is still wanted (false once Stop everything or a newer question came): asked right before the
    /// picture and throughout the wait for the page to settle.
    wanted: Option<Box<dyn Fn() -> bool + Send + Sync>>,
    /// A walkthrough step after a click (showme::Platform::settle): wait for the page to settle first.
    settles: bool,
}

impl MacPlatform {
    pub fn new(send_image: SendImage, ask: AskFn, light: Box<dyn Fn(bool) + Send + Sync>) -> MacPlatform {
        MacPlatform { send_image, ask, light, last_display: Mutex::new(None), wanted: None, settles: false }
    }
    /// `wanted`: false once Stop everything or a newer question came. Then no picture is taken, and a wait ends at once.
    pub fn while_wanted(mut self, wanted: Box<dyn Fn() -> bool + Send + Sync>) -> MacPlatform { self.wanted = Some(wanted); self }
    /// Waits for the page to settle before the picture (a walkthrough step after a click), when `on`.
    pub fn settling(mut self, on: bool) -> MacPlatform { self.settles = on; self }
}

/// A small look of the display under the pointer (showme::GLANCE_W pixels wide), with Companion's own windows and any
/// password manager left out, as every look. Only to see whether the page is still changing: kept in memory, never sent.
fn glance() -> Result<Frame, String> { capture_display(&[], Some(crate::showme::GLANCE_W)).map(|(f, _)| f) }

/// Asks macOS for permission. Called only the first time the feature is used.
pub fn request_screen_recording() -> bool { CGRequestScreenCaptureAccess() }

fn shareable() -> Result<Retained<SCShareableContent>, String> {
    let (tx, rx) = mpsc::channel::<Result<usize, String>>();
    let block = RcBlock::new(move |content: *mut SCShareableContent, err: *mut NSError| {
        if content.is_null() {
            let msg = if err.is_null() { "no answer".to_string() } else { unsafe { (*err).localizedDescription().to_string() } };
            let _ = tx.send(Err(msg));
        } else {
            // Keep the object alive past the callback.
            let kept = unsafe { Retained::retain(content) };
            let _ = tx.send(Ok(kept.map_or(0, |k| Retained::into_raw(k) as usize)));
        }
    });
    unsafe { SCShareableContent::getShareableContentWithCompletionHandler(&block) };
    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(p)) if p != 0 => Ok(unsafe { Retained::from_raw(p as *mut SCShareableContent) }.ok_or("empty")?),
        Ok(Ok(_)) => Err("empty".into()),
        Ok(Err(m)) => Err(m),
        Err(_) => Err("timed out".into()),
    }
}

/// The pointer in global top-left points. Read through Core Graphics (which already speaks in top-left points and may be asked
/// from any thread), not through AppKit's screen list, which belongs to the main thread and is called here sixty times a second.
pub fn pointer() -> Pt {
    use objc2_core_graphics::CGEvent;
    match CGEvent::new(None) {
        Some(ev) => { let p = CGEvent::location(Some(&ev)); Pt { x: p.x, y: p.y } }
        None => Pt { x: -1.0, y: -1.0 },
    }
}

fn cg_to_frame(img: &CGImage) -> Option<Frame> {
    let (w, h) = (CGImage::width(Some(img)), CGImage::height(Some(img)));
    if w == 0 || h == 0 { return None; }
    let mut data = vec![0u8; w * h * 4];
    let space = CGColorSpace::new_device_rgb()?;
    let ctx = unsafe { CGBitmapContextCreate(data.as_mut_ptr().cast(), w, h, 8, w * 4, Some(&space), CGImageAlphaInfo::PremultipliedLast.0) }?;
    CGContext::draw_image(Some(&ctx), CGRect { origin: CGPoint { x: 0.0, y: 0.0 }, size: CGSize { width: w as f64, height: h as f64 } }, Some(img));
    drop(ctx);
    Frame::new(w as u32, h as u32, data)
}

fn same_display(r: &R, f: &CGRect) -> bool { (r.x - f.origin.x).abs() < 1.0 && (r.y - f.origin.y).abs() < 1.0 && (r.w - f.size.width).abs() < 1.0 && (r.h - f.size.height).abs() < 1.0 }

impl MacPlatform {
    /// The display under the mouse, or the first one left when some have been looked at already (`exclude`).
    fn capture_excluding(&self, exclude: &[R]) -> Result<Captured, String> {
        let (fr, rect) = capture_display(exclude, None)?;
        *self.last_display.lock().unwrap_or_else(|e| e.into_inner()) = Some(rect);
        Ok(Captured { frame: fr, display: rect })
    }
}

/// One picture of the display under the mouse (or the first one not in `exclude`), at its full pixel size, or `small`
/// pixels wide for a glance. Companion's own windows and password managers are never in it.
fn capture_display(exclude: &[R], small: Option<usize>) -> Result<(Frame, R), String> {
    let content = shareable()?;
    let me = std::process::id() as i32;
    let want = pointer();
    let displays = unsafe { content.displays() };
    let mut chosen: Option<(Retained<SCDisplay>, CGRect)> = None;
    for d in displays.iter() {
        let f = unsafe { d.frame() };
        if exclude.iter().any(|t| same_display(t, &f)) { continue; }
        if want.x >= f.origin.x && want.x < f.origin.x + f.size.width && want.y >= f.origin.y && want.y < f.origin.y + f.size.height { chosen = Some((d.clone(), f)); break; }
        if chosen.is_none() { chosen = Some((d.clone(), f)); }
    }
    let (display, frame) = chosen.ok_or("no display found")?;
    // Leave out Companion's own windows and any password manager, so their pixels never exist.
    let mut skip: Vec<Retained<SCWindow>> = Vec::new();
    for w in unsafe { content.windows() }.iter() {
        let Some(app) = (unsafe { w.owningApplication() }) else { continue };
        let bundle = unsafe { app.bundleIdentifier() }.to_string();
        if unsafe { app.processID() } == me || left_out_of_pictures(&bundle) { skip.push(w.clone()); }
    }
    let skip_arr = NSArray::from_retained_slice(&skip);
    let filter = unsafe { SCContentFilter::initWithDisplay_excludingWindows(SCContentFilter::alloc(), &display, &skip_arr) };
    let config = unsafe { SCStreamConfiguration::new() };
    let px_w = small.unwrap_or_else(|| CGDisplayPixelsWide(unsafe { display.displayID() }).max(frame.size.width as usize)).max(1);
    let scale = px_w as f64 / frame.size.width;
    unsafe { config.setWidth(px_w); config.setHeight((frame.size.height * scale).round() as usize); config.setShowsCursor(false); }

    let (tx, rx) = mpsc::channel::<Result<usize, String>>();
    let block = RcBlock::new(move |img: *mut CGImage, err: *mut NSError| {
        if img.is_null() {
            let msg = if err.is_null() { "no picture".to_string() } else { unsafe { (*err).localizedDescription().to_string() } };
            let _ = tx.send(Err(msg));
        } else {
            // Keep the picture alive past the callback.
            let kept: Option<CFRetained<CGImage>> = unsafe { CFRetained::retain(std::ptr::NonNull::new_unchecked(img)) }.into();
            let _ = tx.send(Ok(kept.map_or(0, |k| CFRetained::into_raw(k).as_ptr() as usize)));
        }
    });
    unsafe { SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(&filter, &config, Some(&block)) };
    let ptr = match rx.recv_timeout(Duration::from_secs(8)) { Ok(Ok(p)) if p != 0 => p, Ok(Ok(_)) => return Err("empty picture".into()), Ok(Err(m)) => return Err(m), Err(_) => return Err("timed out".into()) };
    let img = unsafe { CFRetained::from_raw(std::ptr::NonNull::new_unchecked(ptr as *mut CGImage)) };
    let fr = cg_to_frame(&img).ok_or("could not read the picture")?;
    let rect = R { x: frame.origin.x, y: frame.origin.y, w: frame.size.width, h: frame.size.height };
    Ok((fr, rect))
}

impl Platform for MacPlatform {
    fn screen_recording_granted(&self) -> bool { CGPreflightScreenCaptureAccess() }
    fn secure_input_on(&self) -> bool { crate::ax::secure_input_enabled() }
    fn indicator(&self, on: bool) { (self.light)(on) }

    fn capture(&self) -> Result<Captured, String> { self.capture_excluding(&[]) }

    fn capture_other(&self, tried: &[R]) -> Option<Result<Captured, String>> {
        let content = shareable().ok()?;
        let more = unsafe { content.displays() }.iter().any(|d| { let f = unsafe { d.frame() }; !tried.iter().any(|t| same_display(t, &f)) });
        if more { Some(self.capture_excluding(tried)) } else { None }
    }


    fn read_text(&self, frame: &Frame) -> Vec<OcrBox> { read_text_at(frame, true) }
    fn read_text_fast(&self, frame: &Frame) -> Vec<OcrBox> { read_text_at(frame, false) }

    /// Window owners and sizes (no permission needed) and the app in front, never titles or content.
    fn windows(&self) -> (Vec<crate::fullscreen::Win>, i32) {
        let front = objc2_app_kit::NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier()).unwrap_or(0);
        (crate::fullscreen::sys::on_screen_windows(), front)
    }
    fn element_at(&self, p: Pt) -> Option<R> { crate::ax::clickable_at(p.x, p.y).map(|(x, y, w, h)| R { x, y, w, h }) }
    fn send_image(&self, screen: usize, jpeg: &[u8], w: u32, h: u32) { (self.send_image)(screen, jpeg, w, h) }
    fn ask(&self, question: &str, pics: &[Pic], c: &[Cand]) { (self.ask)(question, pics, c) }
    fn still_wanted(&self) -> bool { self.wanted.as_ref().is_none_or(|w| w()) }
    /// Waits for the page to stop changing (showme::wait_to_settle), only when the page asked for it (`settling`).
    fn settle(&self) -> crate::showme::Settle {
        if !self.settles { return crate::showme::Settle::NotAsked; }
        let t0 = std::time::Instant::now();
        let how = crate::showme::wait_to_settle(|| glance().ok(), |ms| std::thread::sleep(Duration::from_millis(ms)), || self.still_wanted(), crate::showme::SETTLE_GAP_MS, crate::showme::SETTLE_MAX_MS);
        crate::log("showme_settled", serde_json::json!({ "how": format!("{how:?}"), "ms": t0.elapsed().as_millis() as u64 }));
        how
    }
}

/// The Mac's own text reader, on a compressed copy that stays in memory. `accurate` is slower and reads small or
/// unusual text better; the fast mode is tried first where speed matters.
pub fn read_text_at(frame: &Frame, accurate: bool) -> Vec<OcrBox> {
    let Ok(jpeg) = frame.to_jpeg(90) else { return vec![] };
    let data = NSData::with_bytes(&jpeg);
    let opts = NSDictionary::<objc2_vision::VNImageOption, AnyObject>::new();
    let handler = VNImageRequestHandler::initWithData_options(VNImageRequestHandler::alloc(), &data, &opts);
    let req = VNRecognizeTextRequest::new();
    req.setRecognitionLevel(if accurate { VNRequestTextRecognitionLevel::Accurate } else { VNRequestTextRecognitionLevel::Fast }); req.setUsesLanguageCorrection(false);
    let arr = NSArray::from_retained_slice(&[req.clone().into_super().into_super()]);
    if handler.performRequests_error(&arr).is_err() { return vec![]; }
    let Some(results) = req.results() else { return vec![] };
    let (w, h) = (frame.w as f64, frame.h as f64);
    let mut out = Vec::new();
    for (i, o) in results.iter().enumerate() {
        let Some(obs) = o.downcast_ref::<VNRecognizedTextObservation>().map(|x| x.to_owned()) else { continue };
        let cands = obs.topCandidates(1);
        let Some(c) = cands.iter().next() else { continue };
        let bb = unsafe { obs.boundingBox() };
        let r = crate::coords::vision_box_to_image(bb.origin.x, bb.origin.y, bb.size.width, bb.size.height, w, h);
        out.push(OcrBox { id: format!("o{i}"), text: c.string().to_string(), rect: r });
    }
    out
}

#[cfg(test)]
mod never_in_a_picture_tests {
    use super::*;
    #[test]
    fn every_app_prompt_help_never_reads_is_left_out_of_every_picture_but_system_settings() {
        // One list: the apps Prompt help never reads (prompthelp.rs) are the password managers, Keychain Access, Passwords
        // and the system's own password prompts, and none of their windows may be in a picture Show me sends. macOS ignores
        // case in bundle ids, so this does too. System Settings stays in pictures: Show me how is often asked about it.
        for id in crate::prompthelp::BUILT_IN_NEVER.iter().filter(|b| **b != "com.apple.systempreferences") {
            assert!(left_out_of_pictures(id), "{id}");
            assert!(left_out_of_pictures(&id.to_uppercase()) && left_out_of_pictures(&id.to_lowercase()), "{id}, any case");
        }
        for id in ["com.agilebits.onepassword-osx", "com.nordsec.nordpass", "com.enpass.Enpass", "in.sinew.Enpass-Desktop", "com.dashlane.dashlane", "com.apple.SecurityAgent", "com.lastpass.lastpass", "com.dashlane.dashlanephonefinal"] {
            assert!(left_out_of_pictures(id), "{id}");
        }
        assert!(!left_out_of_pictures("com.apple.systempreferences") && !left_out_of_pictures("com.apple.Safari") && !left_out_of_pictures(""));
        // Every look (the picture that is sent, and the small looks while waiting) goes through capture_display, which asks this.
        let src = include_str!("macos_see.rs");
        let cap = &src[src.find("fn capture_display(").unwrap()..]; let cap = &cap[..cap.find("\n}\n").unwrap()];
        assert!(cap.contains("== me || left_out_of_pictures(&bundle)") && !cap.contains("NEVER_CAPTURE.contains("), "{cap}");
    }
}

#[cfg(test)]
mod pointer_tests {
    #[test]
    fn the_pointer_can_be_read_from_any_thread_without_touching_the_main_thread_only_parts_of_appkit() {
        // Your turn reads it sixty times a second from its own thread. It used to ask AppKit's screen list from there.
        let p = std::thread::spawn(super::pointer).join().expect("reading the pointer must not panic off the main thread");
        assert!(p.x.is_finite() && p.y.is_finite());
    }
}
