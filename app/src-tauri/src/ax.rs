//! The real macOS pieces behind Prompt help: reading the focused text box through Accessibility, selecting it,
//! the pasteboard and posting Cmd+V. Everything that decides WHETHER to do these things lives in `prompthelp.rs`.
//! This file only does them. It runs only after the hotkey, with the indicator already lit, and never logs text.

#![cfg(target_os = "macos")]

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_app_kit::{NSPasteboard, NSPasteboardItem, NSPasteboardTypeString, NSPasteboardWriting, NSWorkspace};
use objc2_foundation::{NSData, NSString};
use std::ffi::c_void;
use std::time::Duration;

type CFTypeRef = *const c_void;
type AXError = i32;
const AX_OK: AXError = 0;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFTypeRef) -> bool;
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(el: CFTypeRef, attr: CFTypeRef, value: *mut CFTypeRef) -> AXError;
    fn AXUIElementSetAttributeValue(el: CFTypeRef, attr: CFTypeRef, value: CFTypeRef) -> AXError;
    fn AXValueCreate(kind: u32, ptr: *const c_void) -> CFTypeRef;
    fn AXUIElementPerformAction(el: CFTypeRef, action: CFTypeRef) -> AXError;
    fn AXUIElementCreateSystemWide() -> CFTypeRef;
    fn AXUIElementCopyElementAtPosition(el: CFTypeRef, x: f32, y: f32, out: *mut CFTypeRef) -> AXError;
    fn AXValueGetValue(v: CFTypeRef, kind: u32, out: *mut c_void) -> bool;
    fn AXUIElementGetPid(el: CFTypeRef, pid: *mut i32) -> AXError;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: CFTypeRef);
    fn CFGetTypeID(cf: CFTypeRef) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFHash(cf: CFTypeRef) -> usize;
    fn CFArrayGetTypeID() -> usize;
    fn CFArrayGetCount(a: CFTypeRef) -> isize;
    fn CFArrayGetValueAtIndex(a: CFTypeRef, i: isize) -> CFTypeRef;
    fn CFRetain(cf: CFTypeRef) -> CFTypeRef;
    fn CFDictionaryCreate(alloc: CFTypeRef, keys: *const CFTypeRef, values: *const CFTypeRef, n: isize, kcb: CFTypeRef, vcb: CFTypeRef) -> CFTypeRef;
    static kCFBooleanTrue: CFTypeRef;
    static kCFBooleanFalse: CFTypeRef;
    static kCFTypeDictionaryKeyCallBacks: c_void;
    static kCFTypeDictionaryValueCallBacks: c_void;
}
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceCreate(state: i32) -> CFTypeRef;
    fn CGEventCreateKeyboardEvent(src: CFTypeRef, key: u16, down: bool) -> CFTypeRef;
    fn CGEventSetFlags(ev: CFTypeRef, flags: u64);
    fn CGEventPost(tap: u32, ev: CFTypeRef);
    #[allow(dead_code)] fn CGPreflightPostEventAccess() -> bool;
}
/// Is this app allowed to send key presses? (A question only; it never asks.)
#[allow(dead_code)]
pub fn may_post_events() -> bool { unsafe { CGPreflightPostEventAccess() } }

#[link(name = "Carbon", kind = "framework")]
extern "C" { fn IsSecureEventInputEnabled() -> bool; }
/// True while some app (a password box, a terminal in secure mode) has asked macOS to protect what is typed.
pub fn secure_input_enabled() -> bool { unsafe { IsSecureEventInputEnabled() } }

const AX_VALUE_CFRANGE: u32 = 4;
const SOURCE_PRIVATE: i32 = -1;       // a private source ignores modifier keys the person is still holding
const TAP_SESSION: u32 = 1;
const FLAG_COMMAND: u64 = 1 << 20;
const KEY_A: u16 = 0;
const KEY_V: u16 = 9;

/// An owned Core Foundation object, released when dropped.
pub struct Cf(CFTypeRef);
unsafe impl Send for Cf {}
unsafe impl Sync for Cf {}   // Accessibility element handles may be used from any thread
impl Drop for Cf { fn drop(&mut self) { if !self.0.is_null() { unsafe { CFRelease(self.0) } } } }
impl Cf {
    fn new(p: CFTypeRef) -> Option<Cf> { if p.is_null() { None } else { Some(Cf(p)) } }
    /// Two handles to the same element have the same number, which is how we notice the person moved to another box.
    pub fn id(&self) -> u64 { unsafe { CFHash(self.0) as u64 } }
}

fn cfstr(s: &str) -> Retained<NSString> { NSString::from_str(s) }          // an NSString is a CFString
fn as_ref(s: &Retained<NSString>) -> CFTypeRef { &**s as *const NSString as CFTypeRef }

fn attr(el: &Cf, name: &str) -> Option<Cf> {
    let n = cfstr(name);
    let mut out: CFTypeRef = std::ptr::null();
    let e = unsafe { AXUIElementCopyAttributeValue(el.0, as_ref(&n), &mut out) };
    if e == AX_OK { Cf::new(out) } else { None }
}
fn text_attr(el: &Cf, name: &str) -> Option<String> {
    let v = attr(el, name)?;
    unsafe { if CFGetTypeID(v.0) != CFStringGetTypeID() { return None; } }
    Some(unsafe { &*(v.0 as *const NSString) }.to_string())
}
fn set_bool(el: &Cf, name: &str, on: bool) { let n = cfstr(name); unsafe { AXUIElementSetAttributeValue(el.0, as_ref(&n), if on { kCFBooleanTrue } else { kCFBooleanFalse }) }; }
fn set_true(el: &Cf, name: &str) { let n = cfstr(name); unsafe { AXUIElementSetAttributeValue(el.0, as_ref(&n), kCFBooleanTrue) }; }

/// Is this app allowed to use Accessibility? With `ask`, macOS shows its own prompt the first time.
pub fn trusted(ask: bool) -> bool {
    unsafe {
        if !ask { return AXIsProcessTrusted(); }
        let key = cfstr("AXTrustedCheckOptionPrompt");
        let keys = [as_ref(&key)];
        let vals = [kCFBooleanTrue];
        let d = CFDictionaryCreate(std::ptr::null(), keys.as_ptr(), vals.as_ptr(), 1, &kCFTypeDictionaryKeyCallBacks as *const c_void, &kCFTypeDictionaryValueCallBacks as *const c_void);
        let r = AXIsProcessTrustedWithOptions(d);
        if !d.is_null() { CFRelease(d); }
        r
    }
}

pub struct Front { pub pid: i32, pub bundle_id: String, pub name: String }
pub fn front_app() -> Option<Front> {
    let a = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    Some(Front { pid: a.processIdentifier(), bundle_id: a.bundleIdentifier().map(|s| s.to_string()).unwrap_or_default(), name: a.localizedName().map(|s| s.to_string()).unwrap_or_default() })
}

/// Our own card can take the keyboard when it is clicked, and then a paste would land in our card instead of the person's box.
/// Before pasting, give the keyboard back to the app the text came from (the person is returning to it anyway). True when it is in front.
pub fn ensure_front(pid: i32) -> bool {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
    let in_front = || front_app().is_some_and(|f| f.pid == pid) && !NSRunningApplication::currentApplication().isActive();
    if in_front() { return true; }
    if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        #[allow(deprecated)]
        app.activateWithOptions(NSApplicationActivationOptions::empty());
    }
    for _ in 0..20 { std::thread::sleep(Duration::from_millis(50)); if in_front() { return true; } }
    false
}

pub struct Focused { pub element: Cf, pub role: String, pub subrole: String }
pub fn focused(pid: i32) -> Option<Focused> {
    let app = Cf::new(unsafe { AXUIElementCreateApplication(pid) })?;
    let element = attr(&app, "AXFocusedUIElement")?;
    let role = text_attr(&element, "AXRole").unwrap_or_default();
    let subrole = text_attr(&element, "AXSubrole").unwrap_or_default();
    Some(Focused { element, role, subrole })
}

// Waking another app's accessibility tree (Chrome, Electron) changes how that app behaves until it is told to stop (Chrome's
// "enhanced user interface" switches off window animations and confuses window snapping tools). What was switched on is
// remembered here and switched off again when Prompt help is finished with the text, never left on.
static WOKEN: std::sync::Mutex<Vec<(i32, &'static str)>> = std::sync::Mutex::new(Vec::new());
fn wake(app: &Cf, pid: i32, name: &'static str) { set_true(app, name); WOKEN.lock().unwrap_or_else(|e| e.into_inner()).push((pid, name)); }
/// Switches off whatever reading switched on in other apps.
pub fn let_apps_sleep() {
    let woken: Vec<(i32, &'static str)> = std::mem::take(&mut *WOKEN.lock().unwrap_or_else(|e| e.into_inner()));
    for (pid, name) in woken { if let Some(app) = Cf::new(unsafe { AXUIElementCreateApplication(pid) }) { set_bool(&app, name, false); } }
}

pub struct Read { pub text: String, pub had_selection: bool, pub rung: &'static str }

fn read_field(el: &Cf) -> Option<(String, bool)> {
    // A selection wins; otherwise the whole box.
    if let Some(s) = text_attr(el, "AXSelectedText").filter(|s| !s.is_empty()) { return Some((s, true)); }
    if let Some(v) = text_attr(el, "AXValue").filter(|s| !s.is_empty()) { return Some((v, false)); }
    None
}

/// Reads the focused box. Chromium and Electron apps build their Accessibility tree late, so this wakes it and retries
/// a few times. It never touches the clipboard. Returns None when the app exposes nothing readable.
pub fn read_ladder(pid: i32) -> Option<(Cf, Read)> {
    let app = Cf::new(unsafe { AXUIElementCreateApplication(pid) })?;
    let attempt = |rung: &'static str| -> Option<(Cf, Read)> {
        let f = focused(pid)?;
        let (text, sel) = read_field(&f.element)?;
        Some((f.element, Read { text, had_selection: sel, rung }))
    };
    if let Some(r) = attempt("plain") { return Some(r); }
    let _ = text_attr(&app, "AXRole");                       // asking for the role wakes the basic tree
    for _ in 0..3 { std::thread::sleep(Duration::from_millis(400)); if let Some(r) = attempt("role_retry") { return Some(r); } }
    wake(&app, pid, "AXManualAccessibility");                 // Electron
    for _ in 0..3 { std::thread::sleep(Duration::from_millis(700)); if let Some(r) = attempt("manual_accessibility") { return Some(r); } }
    wake(&app, pid, "AXEnhancedUserInterface");               // Chrome
    for _ in 0..3 { std::thread::sleep(Duration::from_millis(700)); if let Some(r) = attempt("enhanced_ui") { return Some(r); } }
    None
}

/// Selects the whole box through Accessibility (not by sending Cmd+A, which the person's held keys could disturb).
pub fn select_all(el: &Cf, text_len_utf16: usize) -> bool {
    #[repr(C)] struct Range { location: isize, length: isize }
    let r = Range { location: 0, length: text_len_utf16 as isize };
    let v = match Cf::new(unsafe { AXValueCreate(AX_VALUE_CFRANGE, &r as *const Range as *const c_void) }) { Some(v) => v, None => return false };
    let n = cfstr("AXSelectedTextRange");
    unsafe { AXUIElementSetAttributeValue(el.0, as_ref(&n), v.0) == AX_OK }
}

/// The current text of a box, to check a paste landed.
pub fn value_of(el: &Cf) -> Option<String> { text_attr(el, "AXValue") }

fn post_key(key: u16, flags: u64) {
    unsafe {
        let src = CGEventSourceCreate(SOURCE_PRIVATE);
        for down in [true, false] {
            let ev = CGEventCreateKeyboardEvent(src, key, down);
            if ev.is_null() { continue; }
            CGEventSetFlags(ev, flags);
            CGEventPost(TAP_SESSION, ev);
            CFRelease(ev);
        }
        if !src.is_null() { CFRelease(src); }
    }
}
/// The children of an element, each retained so they stay valid after the list is released.
fn children(el: &Cf) -> Vec<Cf> {
    let Some(list) = attr(el, "AXChildren") else { return vec![] };
    unsafe {
        if CFGetTypeID(list.0) != CFArrayGetTypeID() { return vec![]; }
        (0..CFArrayGetCount(list.0)).filter_map(|i| { let v = CFArrayGetValueAtIndex(list.0, i); if v.is_null() { None } else { Cf::new(CFRetain(v)) } }).collect()
    }
}

/// Presses a menu item of the app (for example Edit, then Paste) the way a person would, through Accessibility.
/// This does not depend on sending key presses. It only works for apps with an English menu of that name.
pub fn press_menu(pid: i32, menu: &str, item: &str) -> bool {
    let Some(app) = Cf::new(unsafe { AXUIElementCreateApplication(pid) }) else { return false };
    let Some(bar) = attr(&app, "AXMenuBar") else { return false };
    for top in children(&bar) {
        if text_attr(&top, "AXTitle").as_deref() != Some(menu) { continue; }
        for sub in children(&top) {
            for entry in children(&sub) {
                if text_attr(&entry, "AXTitle").as_deref() == Some(item) {
                    let a = cfstr("AXPress");
                    return unsafe { AXUIElementPerformAction(entry.0, as_ref(&a)) == AX_OK };
                }
            }
        }
    }
    false
}

pub fn press_paste() { post_key(KEY_V, FLAG_COMMAND); }
#[allow(dead_code)]
pub fn press_select_all() { post_key(KEY_A, FLAG_COMMAND); }

// ---------- the pasteboard ----------

/// The person's clipboard as it was before Companion wrote to it, kept in memory only, until it is put back or dropped.
pub struct SavedClipboard { items: Vec<Vec<(Retained<objc2_app_kit::NSPasteboardType>, Retained<NSData>)>>, count: isize }

pub fn clipboard_change_count() -> isize { NSPasteboard::generalPasteboard().changeCount() }

/// What macOS says about this app reading the clipboard (`accessBehavior`, macOS 15.4 and later) as its raw number, or None
/// on an older macOS that has no such setting. Asking this reads nothing from the clipboard and never shows an alert.
/// `prompthelp::access_behavior` decides what the number means.
pub fn clipboard_access_raw() -> Option<isize> {
    use objc2::runtime::NSObjectProtocol;
    let pb = NSPasteboard::generalPasteboard();
    if pb.respondsToSelector(objc2::sel!(accessBehavior)) { Some(pb.accessBehavior().0) } else { None }
}

/// Saves every item on the clipboard so it can be put back. Only call this when macOS will not show an alert for it.
pub fn save_clipboard() -> SavedClipboard {
    let pb = NSPasteboard::generalPasteboard();
    let mut items = Vec::new();
    if let Some(list) = pb.pasteboardItems() {
        for item in list.iter() {
            let mut one = Vec::new();
            for t in item.types().iter() { if let Some(d) = item.dataForType(&t) { one.push((t.clone(), d)); } }
            items.push(one);
        }
    }
    SavedClipboard { items, count: pb.changeCount() }
}

/// Puts the saved items back, but only if nobody else has changed the clipboard since we wrote ours.
pub fn restore_clipboard(saved: &SavedClipboard, ours: isize) -> bool {
    let pb = NSPasteboard::generalPasteboard();
    if pb.changeCount() != ours { return false; }
    pb.clearContents();
    let mut objs: Vec<Retained<ProtocolObject<dyn NSPasteboardWriting>>> = Vec::new();
    for one in &saved.items {
        let it = NSPasteboardItem::new();
        for (t, d) in one { it.setData_forType(d, t); }
        objs.push(ProtocolObject::from_retained(it));
    }
    let arr = objc2_foundation::NSArray::from_retained_slice(&objs);
    pb.writeObjects(&arr);
    let _ = saved.count;
    true
}

/// Puts our text on the clipboard, marked so clipboard managers ignore it and other devices never get it.
/// Returns the clipboard's change number after our write.
pub fn write_clipboard(text: &str) -> isize {
    let pb = NSPasteboard::generalPasteboard();
    pb.clearContents();
    let it = NSPasteboardItem::new();
    unsafe { it.setString_forType(&NSString::from_str(text), NSPasteboardTypeString) };
    for marker in ["org.nspasteboard.TransientType", "org.nspasteboard.ConcealedType", "org.nspasteboard.AutoGeneratedType"] {
        it.setData_forType(&NSData::new(), &NSString::from_str(marker));
    }
    let arr = objc2_foundation::NSArray::from_retained_slice(&[ProtocolObject::<dyn NSPasteboardWriting>::from_retained(it)]);
    pb.writeObjects(&arr);
    pb.changeCount()
}

// ---------- what is clickable at a place on the screen (Show me how) ----------

const AX_VALUE_CGPOINT: u32 = 1;
const AX_VALUE_CGSIZE: u32 = 2;
const CLICKABLE: &[&str] = &["AXButton", "AXLink", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXMenuButton", "AXMenuItem", "AXMenuBarItem", "AXTextField", "AXTextArea", "AXComboBox", "AXTab", "AXSlider", "AXDisclosureTriangle", "AXToolbarButton", "AXSegmentedControl", "AXSwitch", "AXRow", "AXCell"];

fn frame_of(el: &Cf) -> Option<(f64, f64, f64, f64)> {
    #[repr(C)] #[derive(Default)] struct P { x: f64, y: f64 }
    #[repr(C)] #[derive(Default)] struct S { w: f64, h: f64 }
    let (pos, size) = (attr(el, "AXPosition")?, attr(el, "AXSize")?);
    let (mut p, mut s) = (P::default(), S::default());
    unsafe {
        if !AXValueGetValue(pos.0, AX_VALUE_CGPOINT, &mut p as *mut P as *mut c_void) || !AXValueGetValue(size.0, AX_VALUE_CGSIZE, &mut s as *mut S as *mut c_void) { return None; }
    }
    Some((p.x, p.y, s.w, s.h))
}

/// The nearest clickable thing at a point (global top-left points): the element the Mac reports there, or the closest
/// parent that is a button, link, tab, field or similar. None if Accessibility is off or the app exposes nothing there.
pub fn clickable_at(x: f64, y: f64) -> Option<(f64, f64, f64, f64)> {
    if !trusted(false) { return None; }
    let sys = Cf::new(unsafe { AXUIElementCreateSystemWide() })?;
    let mut out: CFTypeRef = std::ptr::null();
    if unsafe { AXUIElementCopyElementAtPosition(sys.0, x as f32, y as f32, &mut out) } != AX_OK { return None; }
    let mut cur = Cf::new(out)?;
    for _ in 0..6 {
        let role = text_attr(&cur, "AXRole").unwrap_or_default();
        if CLICKABLE.contains(&role.as_str()) { return frame_of(&cur); }
        cur = attr(&cur, "AXParent")?;
    }
    None
}

/// Do it for me: press the clickable thing at a global point, the way a person would, through Accessibility.
/// `check` sees the element's role, everything it says about itself (title, description, help, value, the text inside
/// it), whether it sits in a dialog or sheet, and whether it is Companion's own; it decides at the moment of pressing.
pub fn press_at_checked(x: f64, y: f64, check: impl Fn(&str, &[String], bool, bool) -> Result<(), &'static str>) -> Result<(), &'static str> {
    if !trusted(false) { return Err("no_permission"); }
    let el = clickable_el(x, y).ok_or("nothing_there")?;
    let role = text_attr(&el, "AXRole").unwrap_or_default();
    let mut texts: Vec<String> = ["AXTitle", "AXDescription", "AXHelp", "AXValue"].iter().filter_map(|a| text_attr(&el, a)).collect();
    for c in children(&el).iter().take(12) {
        texts.extend(["AXTitle", "AXDescription", "AXValue"].iter().filter_map(|a| text_attr(c, a)));
        for g in children(c).iter().take(12) { texts.extend(["AXTitle", "AXDescription", "AXValue"].iter().filter_map(|a| text_attr(g, a))); }
    }
    let mut in_dialog = false;
    let mut cur = attr(&el, "AXParent");
    for _ in 0..12 {
        let Some(p) = cur else { break };
        let (r, sr) = (text_attr(&p, "AXRole").unwrap_or_default(), text_attr(&p, "AXSubrole").unwrap_or_default());
        if r == "AXSheet" || sr == "AXDialog" || sr == "AXSystemDialog" || sr == "AXFloatingWindow" && r == "AXWindow" { in_dialog = true; break; }
        cur = attr(&p, "AXParent");
    }
    let mut pid: i32 = 0;
    let ours = unsafe { AXUIElementGetPid(el.0, &mut pid) } == AX_OK && pid == std::process::id() as i32;
    check(&role, &texts, in_dialog, ours)?;
    let a = cfstr("AXPress");
    if unsafe { AXUIElementPerformAction(el.0, as_ref(&a)) } == AX_OK { Ok(()) } else { Err("refused") }
}

fn clickable_el(x: f64, y: f64) -> Option<Cf> {
    if !trusted(false) { return None; }
    let sys = Cf::new(unsafe { AXUIElementCreateSystemWide() })?;
    let mut out: CFTypeRef = std::ptr::null();
    if unsafe { AXUIElementCopyElementAtPosition(sys.0, x as f32, y as f32, &mut out) } != AX_OK { return None; }
    let mut cur = Cf::new(out)?;
    for _ in 0..6 {
        let role = text_attr(&cur, "AXRole").unwrap_or_default();
        if CLICKABLE.contains(&role.as_str()) { return Some(cur); }
        cur = attr(&cur, "AXParent")?;
    }
    None
}
