//! Everyday stuck moments: the hero key works in any app, not only in a project. When it is pressed, the page is told
//! only what kind of app is in front (a code tool, a browser, another app, or Companion itself), never its id or anything
//! in it, so it can choose between checking the project and looking at the screen. The look itself is Show me's own
//! (light first, one capture, secrets covered, nothing kept); its question to the engine only carries a mode that says
//! which instructions to use (runner/src/everyday.ts).

use serde_json::{json, Value};
use crate::{phelp, wheel};

/// Browsers: with a project chosen, the project's own page or a builder (Lovable, Bolt) is often what is in front, so the
/// key checks the project first there, as it always did.
const BROWSERS: &[&str] = &[
    "com.apple.Safari", "com.apple.SafariTechnologyPreview", "com.google.Chrome", "com.google.Chrome.canary", "org.mozilla.firefox",
    "org.mozilla.firefoxdeveloperedition", "company.thebrowser.Browser", "com.microsoft.edgemac", "com.brave.Browser",
    "com.operasoftware.Opera", "com.vivaldi.Vivaldi", "app.zen-browser.zen", "org.chromium.Chromium",
];

/// Builder tools that are not in Take the wheel's list of editors and terminals: with a project chosen, the key checks the
/// project there too, as it always did. The chat apps people build with are Prompt help's own list (phelp.rs).
const BUILDERS: &[&str] = &["com.vscodium", "com.google.android.studio"];

/// What kind of app is in front, from its id only: "code" (an editor or a terminal, the same list as Take the wheel, or
/// another builder or chat app people build with), "browser", "own" (Companion), "unknown" (no app could be read) or
/// "other" (a spreadsheet, a document, Mail, System Settings and everything else).
pub fn front_kind(bundle_id: &str) -> &'static str {
    if bundle_id.is_empty() { return "unknown"; }
    if bundle_id.starts_with("dev.companion") { return "own"; }
    if wheel::classify(bundle_id).is_some() || BUILDERS.contains(&bundle_id) || phelp::CHAT_APPS.contains(&bundle_id) { return "code"; }
    if BROWSERS.contains(&bundle_id) { return "browser"; }
    "other"
}

/// The only modes a page may ask a look for. Anything else is an ordinary Show me question.
pub fn mode(m: Option<&str>) -> Option<&'static str> {
    match m { Some("everyday") => Some("everyday"), Some("recheck") => Some("recheck"), _ => None }
}

/// The spreadsheet error codes of the engine's table (protocol/index.ts SHEET_CODES, runner/src/everyday.ts).
pub const SHEET_CODES: &[&str] = &["#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "circular reference"];

/// The code the first look read on the screen, which a look again carries so the engine can say fixed only when that
/// code is no longer read. Only one of the table's codes, exactly; anything else is dropped.
pub fn before_code(c: Option<&str>) -> Option<&'static str> {
    c.and_then(|c| SHEET_CODES.iter().copied().find(|k| *k == c))
}

/// The question to the engine with its mode, when there is one, and (a look again only) the code read before.
pub fn with_mode(mut cmd: Value, mode: Option<&'static str>, before: Option<&'static str>) -> Value {
    if let (Some(m), Some(o)) = (mode, cmd.as_object_mut()) {
        o.insert("mode".into(), json!(m));
        if let (Some(b), "recheck") = (before, m) { o.insert("before".into(), json!(b)); }
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::showme;

    #[test]
    fn the_page_hears_only_the_kind_of_app_in_front() {
        for id in ["com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92", "com.apple.Terminal", "com.jetbrains.WebStorm", "dev.zed.Zed"] { assert_eq!(front_kind(id), "code", "{id}"); }
        // Builder and chat apps a person builds with: with a project chosen, the key checks the project there, as before.
        for id in ["com.anthropic.claudefordesktop", "com.openai.codex", "com.openai.chat", "com.google.gemini", "com.vscodium", "com.google.android.studio"] { assert_eq!(front_kind(id), "code", "{id}"); }
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
        let with = with_mode(plain.clone(), mode(Some("everyday")), None);
        assert_eq!(with["mode"], "everyday");
        let mut back = with.clone(); back.as_object_mut().unwrap().remove("mode");
        assert_eq!(back, plain);
        assert_eq!(with_mode(plain.clone(), None, None), plain);
    }

    #[test]
    fn a_look_again_carries_only_a_known_code_the_first_look_read() {
        for c in ["#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "circular reference"] { assert_eq!(before_code(Some(c)), Some(c), "{c}"); }
        for c in [None, Some(""), Some("#ref!"), Some("#REF! and more"), Some("anything")] { assert_eq!(before_code(c), None, "{c:?}"); }
        // The same list as the protocol's SHEET_CODES (protocol/index.ts), which the engine checks again.
        let protocol = include_str!("../../../protocol/index.ts");
        let line = protocol.lines().find(|l| l.starts_with("export const SHEET_CODES")).expect("SHEET_CODES in the protocol");
        for c in SHEET_CODES { assert!(line.contains(&format!("\"{c}\"")), "{c}"); }
        assert_eq!(line.matches('"').count(), SHEET_CODES.len() * 2);
        let pics = [showme::Pic { screen: 1, w: 1280, h: 800, label: None }];
        let plain = showme::locate_command("sm_1", "q", &pics, &[]);
        let again = with_mode(plain.clone(), mode(Some("recheck")), before_code(Some("#REF!")));
        assert_eq!(again["before"], "#REF!");
        // Only a look again carries it.
        assert!(with_mode(plain.clone(), mode(Some("everyday")), before_code(Some("#REF!"))).get("before").is_none());
        assert!(with_mode(plain.clone(), None, before_code(Some("#REF!"))).get("before").is_none());
    }

    #[test]
    fn the_hotkey_and_show_me_use_these_rules() {
        let main = include_str!("main.rs");
        assert!(main.contains(r#"app.emit("find-problem", json!({ "front": everyday::front_kind(&front_id()) }))"#), "the key tells the page the kind of app in front, never its id");
        assert!(main.contains("everyday::with_mode(showme::locate_command(&req2, q, pics, cands), mode, before)"), "Show me's question carries the mode and the code read before");
        assert!(main.contains("let mode = everyday::mode(mode.as_deref());"));
        assert!(main.contains("let before = everyday::before_code(before.as_deref());"));
    }
}
