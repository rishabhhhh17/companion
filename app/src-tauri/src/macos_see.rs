//! The real Mac behind Show me how: one screenshot of the display under the pointer (with Companion's own windows and
//! password managers left out of the picture), a read of the text on it, and the clickable thing at a point.
//! It runs only after the hotkey, with the light already on, and never writes the picture to disk.
#![cfg(target_os = "macos")]

use crate::coords::{Pt, R};
use crate::frame::Frame;
use crate::showme::{Captured, Platform};
use crate::snap::OcrBox;
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::AnyThread;
use objc2_app_kit::NSEvent;
use objc2_core_graphics::{CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo, CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess, CGDisplayPixelsWide};
use objc2_core_foundation::{CGPoint, CGRect, CGSize, CFRetained};
use objc2_foundation::{NSArray, NSData, NSDictionary, NSError};
use objc2_screen_capture_kit::{SCContentFilter, SCDisplay, SCScreenshotManager, SCShareableContent, SCStreamConfiguration, SCWindow};
use objc2_vision::{VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation, VNRequestTextRecognitionLevel};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

/// Apps whose pixels must never exist in a picture we take.
pub const NEVER_CAPTURE: &[&str] = &["com.1password.1password", "com.agilebits.onepassword7", "com.bitwarden.desktop", "com.apple.keychainaccess", "com.apple.Passwords", "org.keepassxc.keepassxc", "com.lastpass.LastPass", "com.dashlane.dashlanephonefinal"];

pub struct MacPlatform {
    pub send_image: Box<dyn Fn(&[u8], u32, u32) + Send + Sync>,
    pub ask: Box<dyn Fn(&str, u32, u32, &[(String, String, R)]) + Send + Sync>,
    pub light: Box<dyn Fn(bool) + Send + Sync>,
    last_display: Mutex<Option<R>>,
}

impl MacPlatform {
    pub fn new(send_image: Box<dyn Fn(&[u8], u32, u32) + Send + Sync>, ask: Box<dyn Fn(&str, u32, u32, &[(String, String, R)]) + Send + Sync>, light: Box<dyn Fn(bool) + Send + Sync>) -> MacPlatform {
        MacPlatform { send_image, ask, light, last_display: Mutex::new(None) }
    }
}

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

/// The pointer in global top-left points.
pub fn pointer() -> Pt {
    let p = NSEvent::mouseLocation();
    let primary_h = objc2_app_kit::NSScreen::screens(objc2::MainThreadMarker::new().unwrap_or_else(|| unsafe { objc2::MainThreadMarker::new_unchecked() })).iter().next().map(|s| s.frame().size.height).unwrap_or(0.0);
    Pt { x: p.x, y: primary_h - p.y }
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
            if unsafe { app.processID() } == me || NEVER_CAPTURE.contains(&bundle.as_str()) { skip.push(w.clone()); }
        }
        let skip_arr = NSArray::from_retained_slice(&skip);
        let filter = unsafe { SCContentFilter::initWithDisplay_excludingWindows(SCContentFilter::alloc(), &display, &skip_arr) };
        let config = unsafe { SCStreamConfiguration::new() };
        let px_w = CGDisplayPixelsWide(unsafe { display.displayID() }).max(frame.size.width as usize);
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
        *self.last_display.lock().unwrap_or_else(|e| e.into_inner()) = Some(rect);
        Ok(Captured { frame: fr, display: rect })
    }
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

    fn element_at(&self, p: Pt) -> Option<R> { crate::ax::clickable_at(p.x, p.y).map(|(x, y, w, h)| R { x, y, w, h }) }
    fn send_image(&self, jpeg: &[u8], w: u32, h: u32) { (self.send_image)(jpeg, w, h) }
    fn ask(&self, question: &str, w: u32, h: u32, c: &[(String, String, R)]) { (self.ask)(question, w, h, c) }
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
