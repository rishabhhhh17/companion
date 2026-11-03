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
    /// Which code tools are terminals, and which are AI coding apps (M55, adapts to you: Home's main action). Every one of
    /// them is a code tool already; these lists only say which kind.
    pub terminals: Vec<String>,
    pub ai_apps: Vec<String>,
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
    /// A terminal: Prompt help's and Take the wheel's terminals, and the others on the one list.
    pub fn terminal(&self, id: &str) -> bool {
        phelp::TERMINALS.contains(&id) || crate::wheel::TERMINALS.contains(&id) || self.terminals.iter().any(|t| t == id)
    }
    /// An AI coding app a person builds with by chatting (Claude, Codex, ChatGPT, Gemini).
    pub fn ai_app(&self, id: &str) -> bool { phelp::CHAT_APPS.contains(&id) || self.ai_apps.iter().any(|t| t == id) }
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

/// The kinds Home is told about (app/src/homeHero.ts FRONT_KINDS, the same words).
pub const HOME_KINDS: &[&str] = &["editor", "aiApp", "browser", "terminal", "other"];

/// What kind of app is in front, for Home's main action (M55, adapts to you): an editor (or another builder's tool), an AI
/// coding app, a browser, a terminal, or anything else. From its id only, never its name, a window's title or anything in
/// it (rules 5 and 7). None for Companion itself, so Home keeps what it had (it is a panel that never takes the front).
pub fn home_kind(bundle_id: &str) -> Option<&'static str> {
    let a = apps();
    match front_kind(bundle_id) {
        "own" => None,
        "code" if a.terminal(bundle_id) => Some("terminal"),
        "code" if a.ai_app(bundle_id) => Some("aiApp"),
        "code" => Some("editor"),
        "browser" => Some("browser"),
        _ => Some("other"),
    }
}

/// What Home is told about the app in front: its kind and nothing else. With Home follows the app in front off
/// (home.followFrontApp false) it is always "other" and the app in front is not even read, so Home goes by the project.
pub fn home_front(follow: &Value, front: impl FnOnce() -> String) -> Option<Value> {
    let kind = if follow == &Value::Bool(false) { Some("other") } else { home_kind(&front()) };
    kind.map(|k| json!({ "kind": k }))
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
    fn home_hears_only_the_kind_of_app_in_front() {
        // M55, adapts to you: an editor or another builder's tool, an AI coding app, a browser, a terminal, or other.
        for id in ["com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92", "com.google.antigravity-ide", "com.apple.dt.Xcode", "dev.zed.Zed", "com.jetbrains.WebStorm", "com.exafunction.windsurf", "com.github.GitHubClient"] { assert_eq!(home_kind(id), Some("editor"), "{id}"); }
        for id in ["com.anthropic.claudefordesktop", "com.openai.codex", "com.openai.chat", "com.google.gemini", "com.google.GeminiMacOS"] { assert_eq!(home_kind(id), Some("aiApp"), "{id}"); }
        for id in ["com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "com.mitchellh.ghostty", "io.alacritty", "org.alacritty", "org.tabby", "dev.commandline.waveterm"] { assert_eq!(home_kind(id), Some("terminal"), "{id}"); }
        for id in ["com.apple.Safari", "com.google.Chrome", "company.thebrowser.dia", "com.google.Chrome.app.abc"] { assert_eq!(home_kind(id), Some("browser"), "{id}"); }
        for id in ["com.microsoft.Excel", "com.apple.mail", "notion.id", "com.example.unknown", ""] { assert_eq!(home_kind(id), Some("other"), "{id}"); }
        // Companion itself: Home keeps what it had.
        assert_eq!(home_kind("dev.companion.app"), None);
        // Every kind is one of the words the page knows (homeHero.ts FRONT_KINDS), and the page knows exactly these.
        let page = include_str!("../../../app/src/homeHero.ts");
        let line = page.lines().find(|l| l.starts_with("export const FRONT_KINDS")).expect("FRONT_KINDS in homeHero.ts");
        for k in HOME_KINDS { assert!(line.contains(&format!("\"{k}\"")), "{k}"); }
        assert_eq!(line.matches('"').count(), HOME_KINDS.len() * 2);
    }

    #[test]
    fn home_is_told_the_kind_alone_and_nothing_with_the_setting_off() {
        let v = home_front(&json!(true), || "com.apple.Terminal".into()).unwrap();
        assert_eq!(v, json!({ "kind": "terminal" }));
        // Only the kind: never the id, the name, a title or anything in the app.
        assert_eq!(v.as_object().unwrap().keys().collect::<Vec<_>>(), vec!["kind"]);
        assert!(!v.to_string().contains("com.apple"));
        // The usual (no value yet) follows the app in front too.
        assert_eq!(home_front(&Value::Null, || "com.apple.Safari".into()), Some(json!({ "kind": "browser" })));
        // Off: always other, and the app in front is not even read.
        assert_eq!(home_front(&json!(false), || panic!("read the app in front")), Some(json!({ "kind": "other" })));
        // Companion in front: nothing is said, so Home keeps what it had.
        assert_eq!(home_front(&json!(true), || "dev.companion.app".into()), None);
        for id in ["com.microsoft.VSCode", "com.openai.codex", "com.google.Chrome", "com.apple.mail", ""] {
            let k = home_front(&json!(true), || id.into()).unwrap();
            assert!(HOME_KINDS.contains(&k["kind"].as_str().unwrap()), "{id}");
        }
    }

    #[test]
    fn terminals_and_ai_apps_are_code_tools_from_the_one_list() {
        let a = apps();
        for id in a.terminals.iter().chain(&a.ai_apps) { assert_eq!(front_kind(id), "code", "{id}"); }
        // Prompt help's and Take the wheel's terminals, and Prompt help's chat apps, are on the one list too.
        for id in phelp::TERMINALS.iter().chain(crate::wheel::TERMINALS) { assert!(a.terminals.iter().any(|t| t == id), "{id}"); }
        for id in phelp::CHAT_APPS { assert!(a.ai_apps.iter().any(|t| t == id), "{id}"); }
        // No app is both a terminal and an AI app.
        for id in &a.terminals { assert!(!a.ai_apps.contains(id), "{id}"); }
    }

    #[test]
    fn the_shell_tells_home_the_kind_only_when_it_changes_and_when_home_opens() {
        let main = include_str!("main.rs");
        assert!(main.contains(r#"everyday::home_front(&setting_now("home.followFrontApp"), front_id)"#), "the tick asks the one rule");
        assert!(main.contains(r#"let _ = app.emit_to("card", "front-kind", v);"#), "only Home is told, and only the kind");
        assert!(main.contains(r#"opened["front"] = k;"#), "Home is told the kind as it opens");
        // The pages' state no longer carries the name of the app in front: only Home hears about it, as a kind.
        assert!(main.contains(r#"let state = json!({ "clicks": CLICKS.load(Ordering::SeqCst), "card_key": ck });"#));
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
