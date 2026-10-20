//! Everyday stuck moments: the hero key works in any app, not only in a project. When it is pressed, the page is told
//! only what kind of app is in front (a code tool, a browser, another app, or Companion itself), never its id or anything
//! in it, so it can choose between checking the project and looking at the screen. The look itself is Show me's own
//! (light first, one capture, secrets covered, nothing kept); its question to the engine only carries a mode that says
//! which instructions to use (runner/src/everyday.ts).

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::OnceLock;
use crate::phelp;

/// The one list of the apps Companion knows by kind (`protocol/apps.json`, read here with include_str!), the same one the
/// engine's everyday tutor reads (runner/src/tutor.ts appKind), so the shell and the engine never sort an app differently.
pub const APPS_TEXT: &str = include_str!("../../../protocol/apps.json");

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Apps {
    pub ours_prefix: String,
    pub editors: Vec<String>,
    pub editor_prefixes: Vec<String>,
    pub coding_tools: Vec<String>,
    pub browsers: Vec<String>,
    pub browser_prefixes: Vec<String>,
    /// The everyday apps known by name. The shell needs only that they are neither code tools nor browsers.
    pub everyday: BTreeMap<String, String>,
}

impl Apps {
    /// An editor, or an AI or developer tool a builder uses. Prompt help's terminals (phelp.rs) are code tools too.
    pub fn coding(&self, id: &str) -> bool {
        phelp::TERMINALS.contains(&id) || self.editors.iter().any(|e| e == id) || self.editor_prefixes.iter().any(|p| id.starts_with(p.as_str())) || self.coding_tools.iter().any(|t| t == id)
    }
    /// A web browser, or a web app added to the Dock from one (a page in that browser).
    pub fn browser(&self, id: &str) -> bool {
        self.browsers.iter().any(|b| b == id) || self.browser_prefixes.iter().any(|p| id.starts_with(p.as_str()))
    }
}

pub fn apps() -> &'static Apps {
    static A: OnceLock<Apps> = OnceLock::new();
    A.get_or_init(|| serde_json::from_str(APPS_TEXT).expect("protocol/apps.json is part of the build"))
}

/// What kind of app is in front, from its id only: "code" (an editor, a terminal, or another builder or chat app people
/// build with), "browser" (where, with a project chosen, the project's own page or a builder such as Lovable or Bolt is
/// often what is in front, so the key checks the project first there, as it always did), "own" (Companion), "unknown" (no
/// app could be read) or "other" (a spreadsheet, a document, Mail, System Settings and everything else). From the one list
/// (protocol/apps.json) the engine reads too.
pub fn front_kind(bundle_id: &str) -> &'static str {
    if bundle_id.is_empty() { return "unknown"; }
    let a = apps();
    if bundle_id.starts_with(a.ours_prefix.as_str()) { return "own"; }
    if a.coding(bundle_id) { return "code"; }
    if a.browser(bundle_id) { return "browser"; }
    "other"
}

/// The app id a look carries to the engine (showme::locate_command's `app`). An ordinary Show me question carries the id
/// of the app in front, read on the press, for the engine's everyday tutor (showme.everydayTutor, runner/src/tutor.ts). An
/// everyday look or a look again carries none: its own instructions never use it, and Companion's code knows the app in
/// front of the stuck key only by its kind.
pub fn app_for(mode: Option<&'static str>, front: impl FnOnce() -> String) -> String {
    if mode.is_some() { String::new() } else { front() }
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
        let plain = showme::locate_command("sm_1", "Find the problem on my screen.", &pics, &[], "");
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
        let plain = showme::locate_command("sm_1", "q", &pics, &[], "");
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
        assert!(main.contains("everyday::with_mode(showme::locate_command(&req2, q, pics, cands, &front), mode, before)"), "Show me's question carries the mode and the code read before");
        assert!(main.contains("let front = everyday::app_for(mode, front_id);"), "an everyday look carries no app id; an ordinary question carries it");
        assert!(main.contains("let mode = everyday::mode(mode.as_deref());"));
        assert!(main.contains("let before = everyday::before_code(before.as_deref());"));
    }

    #[test]
    fn the_shell_and_the_engine_sort_apps_from_one_list() {
        // protocol/apps.json is the one list; the engine reads the same file (runner/src/tutor.ts appKind).
        let tutor = include_str!("../../../runner/src/tutor.ts");
        assert!(tutor.contains("from \"../../protocol/apps.json\""), "the engine reads the same list");
        let a = apps();
        for id in a.editors.iter().chain(a.coding_tools.iter()) { assert_eq!(front_kind(id), "code", "{id}"); }
        for id in &a.browsers { assert_eq!(front_kind(id), "browser", "{id}"); }
        for id in a.everyday.keys() { assert_eq!(front_kind(id), "other", "{id}: an everyday app is neither a code tool nor a browser"); }
        for p in &a.editor_prefixes { assert_eq!(front_kind(&format!("{p}Example")), "code", "{p}"); }
        for p in &a.browser_prefixes { assert_eq!(front_kind(&format!("{p}Example")), "browser", "{p}"); }
        // No app is on two lists.
        let mut seen = std::collections::HashSet::new();
        for id in a.editors.iter().chain(&a.coding_tools).chain(&a.browsers).chain(a.everyday.keys()) { assert!(seen.insert(id.as_str()), "{id} is on two lists"); }
        // Prompt help's terminals and chat apps, and Take the wheel's editors and terminals, are code tools here too.
        for id in phelp::TERMINALS.iter().chain(phelp::CHAT_APPS).chain(crate::wheel::EDITORS).chain(crate::wheel::TERMINALS) { assert_eq!(front_kind(id), "code", "{id}"); }
        for p in crate::wheel::EDITOR_PREFIXES { assert!(a.editor_prefixes.iter().any(|q| q == p), "{p}"); }
        assert_eq!(front_kind(&format!("{}.app", a.ours_prefix)), "own");
    }

    #[test]
    fn only_an_ordinary_question_carries_the_app_in_front() {
        let pics = [showme::Pic { screen: 1, w: 1280, h: 800, label: None }];
        let ask = |m: Option<&'static str>, before: Option<&'static str>| with_mode(showme::locate_command("sm_1", "q", &pics, &[], &app_for(m, || "com.apple.mail".to_string())), m, before);
        // Show me how: the app in front by its id, for the engine's everyday tutor (showme.everydayTutor), and no mode.
        let plain = ask(None, None);
        assert_eq!(plain["app"], "com.apple.mail");
        assert!(plain.get("mode").is_none());
        // The stuck key's look and a look again: the mode (and the code read before), never the app's id.
        let look = ask(mode(Some("everyday")), None);
        assert_eq!(look["mode"], "everyday");
        assert!(look.get("app").is_none());
        let again = ask(mode(Some("recheck")), before_code(Some("#N/A")));
        assert_eq!((again["mode"].as_str(), again["before"].as_str()), (Some("recheck"), Some("#N/A")));
        assert!(again.get("app").is_none());
        // The id is not even read for an everyday look.
        assert_eq!(app_for(Some("everyday"), || panic!("read the app in front")), "");
    }
}
