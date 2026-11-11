// M74: Open when you log in (app.openAtLogin). A standing change to the Mac, so it happens only when the person turns the
// switch on in Settings, after the page asked them first (settingsPage.tsx). It uses macOS's own login item for this app
// (ServiceManagement's SMAppService.mainApp, macOS 13 and later): no launch agent file is written and no helper is added.
// Turning the switch off removes the login item. Nothing here runs at launch or on a timer.

/// What macOS says about the login item (SMAppServiceStatus).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status { NotRegistered, Enabled, RequiresApproval, NotFound, Unknown }

impl Status {
    pub fn from_raw(n: i64) -> Status {
        match n { 0 => Status::NotRegistered, 1 => Status::Enabled, 2 => Status::RequiresApproval, 3 => Status::NotFound, _ => Status::Unknown }
    }
    /// The switch's value that matches what macOS has: on only while the item is enabled or waiting for the person's
    /// approval in System Settings.
    pub fn is_on(self) -> bool { matches!(self, Status::Enabled | Status::RequiresApproval) }
}

/// The settings key this file applies.
pub const KEY: &str = "app.openAtLogin";

#[cfg(target_os = "macos")]
mod mac {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};

    #[link(name = "ServiceManagement", kind = "framework")]
    unsafe extern "C" {}

    fn main_app() -> Option<*mut AnyObject> {
        let cls = AnyClass::get(c"SMAppService")?;
        let svc: *mut AnyObject = unsafe { msg_send![cls, mainAppService] };
        (!svc.is_null()).then_some(svc)
    }
    pub fn status() -> Option<i64> {
        let svc = main_app()?;
        let n: isize = unsafe { msg_send![svc, status] };
        Some(n as i64)
    }
    pub fn set(on: bool) -> Result<(), &'static str> {
        let svc = main_app().ok_or("loginItem")?;
        let mut err: *mut AnyObject = std::ptr::null_mut();
        let ok: bool = unsafe {
            if on { msg_send![svc, registerAndReturnError: &mut err] } else { msg_send![svc, unregisterAndReturnError: &mut err] }
        };
        if ok { Ok(()) } else { Err("loginItem") }
    }
}

/// What macOS says now (Unknown off a Mac, or before macOS 13).
pub fn status() -> Status {
    #[cfg(target_os = "macos")]
    { mac::status().map_or(Status::Unknown, Status::from_raw) }
    #[cfg(not(target_os = "macos"))]
    { Status::Unknown }
}

/// Removes the login item if there is one (the setting went back to off, for example by Restore usual).
pub fn off() { let _ = set(false); }

/// Adds or removes the login item. Turning it off when it is already off is fine. The error is a code the page puts in
/// words (S.setProblem.loginItem); then the setting is not changed.
pub fn set(on: bool) -> Result<(), &'static str> {
    if !on && !status().is_on() { return Ok(()); }
    #[cfg(target_os = "macos")]
    { mac::set(on) }
    #[cfg(not(target_os = "macos"))]
    { let _ = on; Err("loginItem") }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn the_status_reads_as_macos_says_it_and_only_enabled_or_waiting_counts_as_on() {
        assert_eq!(Status::from_raw(0), Status::NotRegistered);
        assert_eq!(Status::from_raw(1), Status::Enabled);
        assert_eq!(Status::from_raw(2), Status::RequiresApproval);
        assert_eq!(Status::from_raw(3), Status::NotFound);
        assert_eq!(Status::from_raw(9), Status::Unknown);
        assert!(Status::Enabled.is_on() && Status::RequiresApproval.is_on());
        assert!(!Status::NotRegistered.is_on() && !Status::NotFound.is_on() && !Status::Unknown.is_on());
    }
    #[test]
    fn the_login_item_changes_only_through_the_setting_and_never_at_launch() {
        let main = crate::main_src();
        // Only the Settings change turns it on, before the value is saved (a refusal leaves the setting as it was); a reset
        // to the usual value only ever removes it.
        assert_eq!(main.matches("loginitem::set(").count(), 1, "one caller");
        let change = &main[main.find("fn setting_change(").unwrap()..];
        let change = &change[..change.find("\n}\n").unwrap()];
        assert!(change.contains("loginitem::KEY") && change.contains("loginitem::set("), "{change}");
        assert!(change.find("loginitem::set(").unwrap() < change.find("settings::save(").unwrap(), "asked of macOS before it is saved");
        let applied = &main[main.find("fn setting_applied(").unwrap()..];
        let applied = &applied[..applied.find("\n}\n").unwrap()];
        assert!(applied.contains("loginitem::off()"), "{applied}");
        // Delete everything removes it too, with the settings it belongs to.
        let wipe = &main[main.find("async fn delete_everything(").unwrap()..];
        assert!(wipe[..wipe.find("\n}\n").unwrap()].contains("loginitem::off();"));
        // Nothing in setup or on a timer registers it.
        let setup = &main[main.find(".setup(").unwrap_or(0)..];
        assert!(!setup[..setup.len().min(20000)].contains("loginitem::set("));
        // No launch agent file, no helper app.
        let me = include_str!("loginitem.rs");
        assert!(!me.contains(concat!("Launch", "Agents/")) && !me.contains(concat!("SMLogin", "ItemSetEnabled")));
    }
}
