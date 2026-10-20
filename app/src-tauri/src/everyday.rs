//! Everyday stuck moments: the hero key works in any app, not only in a project. When it is pressed, the page is told
//! only what kind of app is in front (a code tool, a browser, another app, or Companion itself), never its id or anything
//! in it, so it can choose between checking the project and looking at the screen. The look itself is Show me's own
//! (light first, one capture, secrets covered, nothing kept); its question to the engine only carries a mode that says
//! which instructions to use (runner/src/everyday.ts).

use serde_json::{json, Value};
use crate::wheel;

/// Browsers: with a project chosen, the project's own page or a builder (Lovable, Bolt) is often what is in front, so the
/// key checks the project first there, as it always did.
const BROWSERS: &[&str] = &[
    "com.apple.Safari", "com.apple.SafariTechnologyPreview", "com.google.Chrome", "com.google.Chrome.canary", "org.mozilla.firefox",
    "org.mozilla.firefoxdeveloperedition", "company.thebrowser.Browser", "com.microsoft.edgemac", "com.brave.Browser",
    "com.operasoftware.Opera", "com.vivaldi.Vivaldi", "app.zen-browser.zen", "org.chromium.Chromium",
];

/// What kind of app is in front, from its id only: "code" (an editor or a terminal, the same list as Take the wheel),
/// "browser", "own" (Companion), "unknown" (no app could be read) or "other" (a spreadsheet, a document, Mail, System
/// Settings and everything else).
pub fn front_kind(bundle_id: &str) -> &'static str {
    if bundle_id.is_empty() { return "unknown"; }
    if bundle_id.starts_with("dev.companion") { return "own"; }
    if wheel::classify(bundle_id).is_some() { return "code"; }
    if BROWSERS.contains(&bundle_id) { return "browser"; }
    "other"
}

/// The only modes a page may ask a look for. Anything else is an ordinary Show me question.
pub fn mode(m: Option<&str>) -> Option<&'static str> {
    match m { Some("everyday") => Some("everyday"), Some("recheck") => Some("recheck"), _ => None }
}

/// The question to the engine with its mode, when there is one.
pub fn with_mode(mut cmd: Value, mode: Option<&'static str>) -> Value {
    if let (Some(m), Some(o)) = (mode, cmd.as_object_mut()) { o.insert("mode".into(), json!(m)); }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::showme;

    #[test]
    fn the_page_hears_only_the_kind_of_app_in_front() {
        for id in ["com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92", "com.apple.Terminal", "com.jetbrains.WebStorm", "dev.zed.Zed"] { assert_eq!(front_kind(id), "code", "{id}"); }
        for id in ["com.apple.Safari", "com.google.Chrome", "company.thebrowser.Browser", "org.mozilla.firefox"] { assert_eq!(front_kind(id), "browser", "{id}"); }
        for id in ["com.microsoft.Excel", "com.apple.iWork.Numbers", "com.apple.mail", "com.apple.systempreferences", "com.apple.Keynote", "notion.id"] { assert_eq!(front_kind(id), "other", "{id}"); }
        assert_eq!(front_kind("dev.companion.app"), "own");
        assert_eq!(front_kind(""), "unknown");
    }

    #[test]
    fn only_the_two_everyday_modes_reach_the_engine() {
        assert_eq!(mode(Some("everyday")), Some("everyday"));
        assert_eq!(mode(Some("recheck")), Some("recheck"));
        for m in [None, Some(""), Some("Everyday"), Some("locate"), Some("everyday; rm -rf")] { assert_eq!(mode(m), None, "{m:?}"); }
    }

    #[test]
    fn the_question_carries_its_mode_and_nothing_else_changes() {
        let pics = [showme::Pic { screen: 1, w: 1280, h: 800, label: None }];
        let plain = showme::locate_command("sm_1", "Find the problem on my screen.", &pics, &[]);
        assert!(plain.get("mode").is_none());
        let with = with_mode(plain.clone(), mode(Some("everyday")));
        assert_eq!(with["mode"], "everyday");
        let mut back = with.clone(); back.as_object_mut().unwrap().remove("mode");
        assert_eq!(back, plain);
        assert_eq!(with_mode(plain.clone(), None), plain);
    }

    #[test]
    fn the_hotkey_and_show_me_use_these_rules() {
        let main = include_str!("main.rs");
        assert!(main.contains(r#"app.emit("find-problem", json!({ "front": everyday::front_kind(&front_id()) }))"#), "the key tells the page the kind of app in front, never its id");
        assert!(main.contains("everyday::with_mode(showme::locate_command(&req2, q, pics, cands), mode)"), "Show me's question carries the mode");
        assert!(main.contains("let mode = everyday::mode(mode.as_deref());"));
    }
}
