//! Screen sharing and calls (rule 7). Two settings, both on unless the person turns them off:
//!  - hide from screen sharing: the ring overlay, the card (Home) and, from F18, the island in the notch and the character
//!    ask macOS to be left out of other apps' screen captures (NSWindow sharingType none). Best effort only:
//!    ScreenCaptureKit apps do not reliably honour it (technical research,
//!    "Presentation mode"), so nothing private may rely on it. Companion's own look at the screen already leaves its own
//!    windows out by process (macos_see.rs), and the proof and receipt pictures come from the hidden browser, so neither
//!    is affected.
//!  - quiet during calls: while a known call app is in front, or the camera is in use, Companion does not speak and the
//!    character does not react. Only the front app's bundle id and whether a camera is in use are read, never any content.
//!    A call in a web browser (Meet) cannot be told apart from any other page without reading content, so it is not noticed.
//!    The camera part is written but switched off (CAMERA_CHECK_ON) until a real Mac shows it never asks for a permission
//!    (rule 18, and rule 8: Companion never asks for the camera).
use serde_json::{json, Value};

/// Native call apps, by bundle id. Only the id of the app in front is compared, exactly (macOS ignores case in ids).
pub const CALL_APPS: &[&str] = &[
    "us.zoom.xos",              // Zoom
    "com.microsoft.teams2",     // Microsoft Teams (the current app)
    "com.microsoft.teams",      // Microsoft Teams (classic)
    "com.apple.FaceTime",       // FaceTime
    "Cisco-Systems.Spark",      // Webex
    "com.webex.meetingmanager", // Webex Meetings
    "com.skype.skype",          // Skype
];

/// Whether "the camera is in use" is part of the check. Off until the founder's Mac session confirms that asking it never
/// shows a camera permission prompt (technical research section 20; T01 [verify]). Only then may this become true, together
/// with the Settings words that mention the camera.
pub const CAMERA_CHECK_ON: bool = false;

pub fn is_call_app(bundle: &str) -> bool { !bundle.is_empty() && CALL_APPS.iter().any(|c| c.eq_ignore_ascii_case(bundle)) }

/// Apps that count as a call (calls.apps in Settings): each built in one on or off, and up to this many added with Add the
/// app in front. Only bundle ids are kept and compared (rule 7).
pub const MAX_ADDED: usize = 20;
/// The list in force from the setting's value: the built in ones it holds, and its first twenty others. A value the
/// setting's rules refuse is the built in seven (today).
pub fn call_apps_from(v: &Value) -> Vec<String> {
    let ok = crate::settings::registry().get("calls.apps").and_then(|d| crate::settings::validate(d, v).ok());
    let Some(list) = ok.as_ref().and_then(Value::as_array) else { return CALL_APPS.iter().map(|s| s.to_string()).collect() };
    let mut added = 0;
    list.iter().filter_map(Value::as_str).filter(|id| {
        if CALL_APPS.iter().any(|c| c.eq_ignore_ascii_case(id)) { return true; }
        added += 1;
        added <= MAX_ADDED
    }).map(str::to_string).collect()
}
/// Whether the app in front is one of these (macOS ignores case in ids).
pub fn is_call_app_in(apps: &[String], bundle: &str) -> bool { !bundle.is_empty() && apps.iter().any(|c| c.eq_ignore_ascii_case(bundle)) }
/// `quiet`, with the apps from Settings.
pub fn quiet_with(s: &Settings, apps: &[String], front_bundle: &str, camera_in_use: impl FnOnce() -> bool) -> bool {
    s.quiet_on_calls && (is_call_app_in(apps, front_bundle) || camera_in_use())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Settings { pub hide_from_sharing: bool, pub quiet_on_calls: bool }
impl Default for Settings { fn default() -> Self { Settings { hide_from_sharing: true, quiet_on_calls: true } } }

/// The settings file's text (None when there is none yet). Anything that is not a clear `false` leaves a setting on.
pub fn parse(text: Option<&str>) -> Settings {
    let v: Value = text.and_then(|t| serde_json::from_str(t).ok()).unwrap_or(Value::Null);
    let on = |k: &str| v.get(k).and_then(Value::as_bool) != Some(false);
    Settings { hide_from_sharing: on("hideFromSharing"), quiet_on_calls: on("quietOnCalls") }
}
pub fn to_json(s: &Settings) -> Value { json!({ "hideFromSharing": s.hide_from_sharing, "quietOnCalls": s.quiet_on_calls }) }

/// Whether Companion stays quiet right now. `camera_in_use` is asked only when the setting is on and no call app is in
/// front (so the camera is not even looked at when there is no need).
pub fn quiet(s: &Settings, front_bundle: &str, camera_in_use: impl FnOnce() -> bool) -> bool {
    s.quiet_on_calls && (is_call_app(front_bundle) || camera_in_use())
}

/// NSWindowSharingType for our overlay, card, island and character: 0 is none (left out of other apps' captures), 1 is read only (the default).
pub fn sharing_type(s: &Settings) -> usize { if s.hide_from_sharing { 0 } else { 1 } }

#[cfg(target_os = "macos")]
pub mod mac {
    /// Whether any camera is in use by another app. Never opens a camera and never reads a frame: AVFoundation's
    /// isInUseByAnotherApplication only. **[verify]** on a real Mac that listing cameras this way never shows a camera
    /// permission prompt (the M0 desk research found it documented but not its permission behaviour). Not run by tests.
    #[allow(deprecated)]
    pub fn camera_in_use() -> bool {
        use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeVideo};
        let Some(video) = (unsafe { AVMediaTypeVideo }) else { return false };
        let devices = unsafe { AVCaptureDevice::devicesWithMediaType(video) };
        devices.iter().any(|d| unsafe { d.isInUseByAnotherApplication() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn known_call_apps_are_recognised_by_their_exact_id() {
        for b in ["us.zoom.xos", "com.microsoft.teams2", "com.microsoft.teams", "com.apple.FaceTime", "Cisco-Systems.Spark", "com.skype.skype"] { assert!(is_call_app(b), "{b}"); }
        assert!(is_call_app("US.ZOOM.XOS"), "macOS ignores case in bundle ids");
    }
    #[test]
    fn browsers_editors_and_lookalike_ids_are_not_call_apps() {
        // A call in a browser cannot be known without reading the page, so a browser is never a call app.
        for b in ["com.google.Chrome", "com.apple.Safari", "org.mozilla.firefox", "company.thebrowser.Browser", "com.todesktop.230313mzl4w4u92", "com.apple.Terminal", "", "us.zoom", "us.zoom.xos.helper", "com.microsoft.teams2.notifier", "zoom"] {
            assert!(!is_call_app(b), "{b:?}");
        }
    }
    #[test]
    fn quiet_when_a_call_app_is_in_front_or_the_camera_is_on_and_never_when_turned_off() {
        let on = Settings::default();
        assert!(quiet(&on, "us.zoom.xos", || false));
        assert!(quiet(&on, "com.apple.Safari", || true), "the camera is on, for example a Meet call in a browser");
        assert!(!quiet(&on, "com.apple.Safari", || false));
        let off = Settings { quiet_on_calls: false, ..on };
        assert!(!quiet(&off, "us.zoom.xos", || true));
    }
    #[test]
    fn the_camera_is_not_even_asked_about_when_it_does_not_matter() {
        let asked = Cell::new(0);
        let ask = || { asked.set(asked.get() + 1); true };
        quiet(&Settings { quiet_on_calls: false, hide_from_sharing: true }, "com.apple.Safari", ask);
        quiet(&Settings::default(), "us.zoom.xos", || { asked.set(asked.get() + 1); true });
        assert_eq!(asked.get(), 0);
    }
    #[test]
    fn both_settings_are_on_until_the_person_turns_them_off() {
        assert_eq!(parse(None), Settings { hide_from_sharing: true, quiet_on_calls: true });
        for junk in ["", "not json", "[]", "7", "{\"hideFromSharing\":\"no\",\"quietOnCalls\":0}", "{}"] { assert_eq!(parse(Some(junk)), Settings::default(), "{junk:?}"); }
        assert_eq!(parse(Some("{\"hideFromSharing\":false}")), Settings { hide_from_sharing: false, quiet_on_calls: true });
        assert_eq!(parse(Some("{\"quietOnCalls\":false,\"hideFromSharing\":true}")), Settings { hide_from_sharing: true, quiet_on_calls: false });
    }
    #[test]
    fn what_is_saved_reads_back_the_same() {
        for s in [Settings::default(), Settings { hide_from_sharing: false, quiet_on_calls: false }, Settings { hide_from_sharing: true, quiet_on_calls: false }] {
            assert_eq!(parse(Some(&to_json(&s).to_string())), s);
        }
    }
    #[test]
    fn the_apps_that_count_as_a_call_are_the_seven_built_in_ones_unless_changed() {
        // calls.apps, usual the seven built in ids: exactly today's answers.
        let usual = call_apps_from(&json!(CALL_APPS));
        assert_eq!(usual, CALL_APPS.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        for b in ["us.zoom.xos", "US.ZOOM.XOS", "com.apple.FaceTime", "com.skype.skype", "com.apple.Safari", "us.zoom", "", "zoom"] {
            assert_eq!(is_call_app_in(&usual, b), is_call_app(b), "{b:?}");
        }
        // A built in one turned off no longer counts; an app added with Add the app in front does.
        let mine = call_apps_from(&json!(["com.apple.FaceTime", "com.example.calls"]));
        assert!(!is_call_app_in(&mine, "us.zoom.xos"));
        assert!(is_call_app_in(&mine, "com.example.calls") && is_call_app_in(&mine, "COM.EXAMPLE.CALLS"));
        assert!(quiet_with(&Settings::default(), &mine, "com.example.calls", || false));
        assert!(!quiet_with(&Settings::default(), &mine, "us.zoom.xos", || false));
        assert!(!quiet_with(&Settings { quiet_on_calls: false, ..Settings::default() }, &mine, "com.example.calls", || false), "the switch still turns it off");
        // At most 20 added apps count, whatever the list holds; a list the rules refuse is the built in seven.
        let many: Vec<String> = (0..27).map(|i| format!("com.example.app{i}")).collect();
        let kept = call_apps_from(&json!(many));
        assert_eq!(kept.len(), MAX_ADDED);
        assert!(is_call_app_in(&kept, "com.example.app19") && !is_call_app_in(&kept, "com.example.app20"));
        for odd in [json!(null), json!("us.zoom.xos"), json!([1, 2]), json!(["a\nb"])] { assert_eq!(call_apps_from(&odd), usual, "{odd}"); }
        assert!(call_apps_from(&json!([])).is_empty(), "every one turned off: nothing counts as a call");
        // Only the id of the app in front is compared: quiet() in main.rs gives it the list from the setting.
        let main = include_str!("main.rs");
        let q = &main[main.find("fn quiet() -> bool").unwrap()..];
        let q = &q[..q.find('\n').unwrap()];
        assert!(q.contains("presentation::quiet_with(&presentation_now(), &presentation::call_apps_from(&setting_now(\"calls.apps\")), &front_id()"), "{q}");
    }
    #[test]
    fn the_camera_is_not_looked_at_until_a_real_mac_shows_it_never_asks_for_a_permission() {
        // Rule 18: code may depend on a [verify] item only after a real check. Turning this on needs that check first,
        // and the Settings words (quietOnCallsHelp) must then say the camera too.
        assert!(!CAMERA_CHECK_ON);
        assert!(!include_str!("../../src/strings.ts").contains("or your camera is on"));
    }
    #[test]
    fn hiding_from_sharing_asks_for_no_sharing_and_off_puts_back_the_macos_default() {
        assert_eq!(sharing_type(&Settings::default()), 0);
        assert_eq!(sharing_type(&Settings { hide_from_sharing: false, quiet_on_calls: true }), 1);
    }
}
