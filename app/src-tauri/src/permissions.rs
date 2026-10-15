//! Permissions. Rule 8: each one is asked the first time its feature is used, never at install,
//! and nothing here asks. This file only LOOKS at the current state, without any prompt.
//! The asking functions arrive with the features that need them (Prompt help, Show me how, voice).

use serde::Serialize;

/// What macOS says about one permission. Which of these a permission can report depends on what macOS tells us:
/// - Accessibility (`AXIsProcessTrusted`) and Screen Recording (`CGPreflightScreenCaptureAccess`) answer only yes or no.
///   A no looks the same whether Companion was never asked or the person said no, so they are only ever `Granted` or
///   `NotGranted`, and the page says one plain line that covers both. Nothing here guesses which one it was.
/// - The microphone (`AVCaptureDevice.authorizationStatus`) does tell: never asked, turned off, blocked by a Screen Time
///   or management setting, or allowed.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status { Granted, NotGranted, NotAsked, Refused, Restricted, Unknown }

/// Accessibility and Screen Recording: yes or no, nothing more.
pub fn from_yes_no(granted: bool) -> Status { if granted { Status::Granted } else { Status::NotGranted } }

/// The microphone, from AVAuthorizationStatus: 0 not determined, 1 restricted, 2 denied, 3 authorized.
pub fn from_mic_status(raw: isize) -> Status {
    match raw { 0 => Status::NotAsked, 1 => Status::Restricted, 2 => Status::Refused, 3 => Status::Granted, _ => Status::Unknown }
}

/// The word the settings page gets (app/src/settings.ts turns it into plain words and says what to do).
pub fn page_word(s: Status) -> &'static str {
    match s { Status::Granted => "allowed", Status::NotGranted => "off", Status::NotAsked => "not_asked", Status::Refused => "not_allowed", Status::Restricted => "restricted", Status::Unknown => "unknown" }
}

/// The words in the support log a person may send.
pub fn support_words(s: Status) -> &'static str {
    match s {
        Status::Granted => "allowed", Status::NotGranted => "not on (never asked, or turned off; macOS does not say which)", Status::NotAsked => "not asked yet",
        Status::Refused => "turned off", Status::Restricted => "blocked by a Screen Time or management setting", Status::Unknown => "not checked",
    }
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Permissions { pub accessibility: Status, pub screen_recording: Status, pub microphone: Status }

#[cfg(target_os = "macos")]
mod sys {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" { pub fn AXIsProcessTrusted() -> bool; }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" { pub fn CGPreflightScreenCaptureAccess() -> bool; }
    /// The microphone's state as macOS keeps it. Only looks: it never asks.
    pub fn mic_raw() -> Option<isize> {
        use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeAudio};
        let kind = unsafe { AVMediaTypeAudio }?;
        Some(unsafe { AVCaptureDevice::authorizationStatusForMediaType(kind) }.0)
    }
}

/// What is granted right now. Never prompts.
pub fn current() -> Permissions {
    #[cfg(target_os = "macos")]
    {
        return Permissions {
            accessibility: from_yes_no(unsafe { sys::AXIsProcessTrusted() }),
            screen_recording: from_yes_no(unsafe { sys::CGPreflightScreenCaptureAccess() }),
            microphone: sys::mic_raw().map(from_mic_status).unwrap_or(Status::Unknown),
        };
    }
    #[allow(unreachable_code)]
    Permissions { accessibility: Status::Unknown, screen_recording: Status::Unknown, microphone: Status::Unknown }
}

#[allow(dead_code)] // used by the features that need a permission (Prompt help, Show me how, voice); tested here
/// Whether a feature should show its plain explanation before the system prompt: only when the
/// permission is missing, and only when the user has just used that feature.
pub fn should_explain(status: Status, feature_just_used: bool) -> bool {
    status != Status::Granted && feature_just_used
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nothing_is_explained_unless_the_user_just_used_the_feature() {
        assert!(!should_explain(Status::NotGranted, false));
        assert!(!should_explain(Status::Unknown, false));
        assert!(should_explain(Status::NotGranted, true));
        assert!(should_explain(Status::Unknown, true));
    }
    #[test]
    fn nothing_is_explained_when_already_granted() { assert!(!should_explain(Status::Granted, true)); }
    #[test]
    fn looking_never_prompts_and_always_answers() {
        let p = current();   // would hang or pop a dialog if it prompted
        // Accessibility and Screen Recording can only ever be yes or no.
        for s in [p.accessibility, p.screen_recording] { assert!(matches!(s, Status::Granted | Status::NotGranted), "{s:?}"); }
        // The microphone is really read now, never left unchecked.
        assert!(matches!(p.microphone, Status::Granted | Status::NotAsked | Status::Refused | Status::Restricted), "{:?}", p.microphone);
    }
    #[test]
    fn accessibility_and_screen_recording_cannot_tell_never_asked_from_refused() {
        assert_eq!(from_yes_no(true), Status::Granted);
        assert_eq!(from_yes_no(false), Status::NotGranted);
        // So the page is never told "refused" or "not asked" for them: one word that covers both.
        assert_eq!(page_word(from_yes_no(false)), "off");
        assert_eq!(page_word(from_yes_no(true)), "allowed");
    }
    #[test]
    fn the_microphone_says_which_one_it_is() {
        // AVAuthorizationStatus: 0 not determined, 1 restricted, 2 denied, 3 authorized.
        assert_eq!(from_mic_status(0), Status::NotAsked);
        assert_eq!(from_mic_status(1), Status::Restricted);
        assert_eq!(from_mic_status(2), Status::Refused);
        assert_eq!(from_mic_status(3), Status::Granted);
        assert_eq!(from_mic_status(7), Status::Unknown);
        assert_eq!(page_word(from_mic_status(0)), "not_asked");
        assert_eq!(page_word(from_mic_status(1)), "restricted");
        assert_eq!(page_word(from_mic_status(2)), "not_allowed");
        assert_eq!(page_word(from_mic_status(3)), "allowed");
        assert_eq!(page_word(from_mic_status(7)), "unknown");
    }
    #[test]
    fn the_support_log_words_are_plain_and_never_claim_more_than_macos_said() {
        assert_eq!(support_words(Status::Granted), "allowed");
        assert_eq!(support_words(Status::NotAsked), "not asked yet");
        assert_eq!(support_words(Status::Refused), "turned off");
        assert!(support_words(Status::NotGranted).contains("never asked") && support_words(Status::NotGranted).contains("turned off"));
        assert!(support_words(Status::Restricted).contains("blocked"));
        assert_eq!(support_words(Status::Unknown), "not checked");
    }
}
