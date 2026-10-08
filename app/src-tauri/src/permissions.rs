//! Permissions. Rule 8: each one is asked the first time its feature is used, never at install,
//! and nothing here asks. This file only LOOKS at the current state, without any prompt.
//! The asking functions arrive with the features that need them (Prompt help, Show me how, voice).

use serde::Serialize;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status { Granted, NotGranted, Unknown }

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Permissions { pub accessibility: Status, pub screen_recording: Status, pub microphone: Status }

#[cfg(target_os = "macos")]
mod sys {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" { pub fn AXIsProcessTrusted() -> bool; }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" { pub fn CGPreflightScreenCaptureAccess() -> bool; }
}

/// What is granted right now. Never prompts. The microphone is checked when voice arrives.
pub fn current() -> Permissions {
    #[cfg(target_os = "macos")]
    {
        let s = |b: bool| if b { Status::Granted } else { Status::NotGranted };
        return Permissions {
            accessibility: s(unsafe { sys::AXIsProcessTrusted() }),
            screen_recording: s(unsafe { sys::CGPreflightScreenCaptureAccess() }),
            microphone: Status::Unknown,
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
        for s in [p.accessibility, p.screen_recording, p.microphone] {
            assert!(matches!(s, Status::Granted | Status::NotGranted | Status::Unknown));
        }
    }
}
