//! The Settings window (27 Oct 2026): Settings in a normal titled Mac window of its own, the way notch apps (NotchNook,
//! Alcove) keep theirs out of the notch. The person opens it on purpose (from Home or the island), so it may take the
//! keyboard (rule 9 is about never taking it unasked). One window: asking again brings the open one to the front.
//! The rules are here and tested; main.rs `open_settings_window` builds it.

/// Its label (capabilities/default.json names it, and the commands the Settings page calls accept it, settings.rs
/// `card_or_settings`).
pub const LABEL: &str = "settings";
/// The page it shows (vite.config.ts builds it).
pub const PAGE: &str = "settings.html";
/// Its size when it opens, and the least it can be made.
pub const SIZE: (f64, f64) = (760.0, 560.0);
pub const MIN: (f64, f64) = (640.0, 460.0);
/// Its title: the product's name (protocol/names.json) and the word Settings.
pub const TITLE: &str = concat!(crate::product!(), " Settings");

/// Who may open it: Home and the island, where the person asks for it. Never the character, the pointer's overlay, or
/// the Settings window itself (it is already open).
pub fn may_open(window: &str) -> Result<(), &'static str> { if matches!(window, "card" | "island") { Ok(()) } else { Err("notOffered") } }
/// Who may close it: only its own page (its Close button).
pub fn may_close(window: &str) -> Result<(), &'static str> { if window == LABEL { Ok(()) } else { Err("notOffered") } }

/// What a call does: show the one that is open, or make it.
#[derive(Debug, PartialEq, Eq)]
pub enum Open { Focus, Make }
pub fn open(already: bool) -> Open { if already { Open::Focus } else { Open::Make } }

/// What Home does when it opens from here (open_card_cmd's `then`): "Walk me through it" starts that lesson in Home, and
/// "Open the practice list" shows Learn. Only these two shapes pass, a lesson id being a short plain id; anything else is
/// dropped and Home just opens.
pub fn arrival(v: &serde_json::Value) -> Option<serde_json::Value> {
    let o = v.as_object()?;
    if o.len() != 1 { return None; }
    if let Some(l) = o.get("lesson") {
        let id = l.as_str()?;
        let ok = !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
        return ok.then(|| serde_json::json!({ "lesson": id }));
    }
    // The panel under the notch (islandPanel.ts): Find the problem, or the check before going live, once Home is open.
    if let Some(d) = o.get("do") {
        return match d.as_str() { Some("find") => Some(serde_json::json!({ "do": "find" })), Some("shipCheck") => Some(serde_json::json!({ "do": "shipCheck" })), _ => None };
    }
    // The notch's Settings button (M20): Settings inside Home.
    match o.get("place").and_then(|p| p.as_str()) { Some("learn") => Some(serde_json::json!({ "place": "learn" })), Some("settings") => Some(serde_json::json!({ "place": "settings" })), _ => None }
}

#[cfg(test)]
mod tests {
    use super::*;
    const MAIN: &str = include_str!("main.rs");
    fn body(name: &str) -> String { let at = MAIN.find(name).unwrap_or_else(|| panic!("{name}")); MAIN[at..at + MAIN[at..].find("\n}\n").unwrap()].to_string() }

    #[test]
    fn only_home_and_the_island_may_open_it_and_only_its_own_page_closes_it() {
        for w in ["card", "island"] { assert!(may_open(w).is_ok(), "{w}"); }
        for w in ["dock", "overlay", "settings", "", "Card"] { assert_eq!(may_open(w), Err("notOffered"), "{w}"); }
        assert!(may_close("settings").is_ok());
        for w in ["card", "island", "dock", "overlay", ""] { assert_eq!(may_close(w), Err("notOffered"), "{w}"); }
        let open = body("fn open_settings_window(");
        assert!(open.contains("settingswin::may_open(window.label())?"), "{open}");
        assert!(body("fn close_settings_window(").contains("settingswin::may_close(window.label())?"));
    }

    #[test]
    fn home_opened_from_here_starts_the_lesson_or_shows_learn_and_nothing_else() {
        use serde_json::json;
        assert_eq!(arrival(&json!({ "lesson": "settings-lesson" })), Some(json!({ "lesson": "settings-lesson" })));
        assert_eq!(arrival(&json!({ "place": "learn" })), Some(json!({ "place": "learn" })));
        // M20: the notch's Settings button opens Settings inside Home.
        assert_eq!(arrival(&json!({ "place": "settings" })), Some(json!({ "place": "settings" })));
        for bad in [json!({ "place": "elsewhere" }), json!({ "lesson": "" }), json!({ "lesson": "../x" }), json!({ "lesson": 3 }),
            json!({ "lesson": "a", "place": "learn" }), json!("learn"), json!(null), json!({}), json!({ "lesson": "a b" })] {
            assert_eq!(arrival(&bad), None, "{bad}");
        }
        let cmd = body("fn open_card_cmd(");
        assert!(cmd.contains("settingswin::arrival"), "{cmd}");
        assert!(body("fn open_card_then(").contains("\"then\": t"));
    }

    #[test]
    fn there_is_only_ever_one_and_a_second_call_brings_it_forward() {
        assert_eq!(open(true), Open::Focus);
        assert_eq!(open(false), Open::Make);
        let w = body("fn settings_window_now(");
        assert!(w.contains("app.get_webview_window(settingswin::LABEL)"), "{w}");
        assert!(w.contains("settingswin::Open::Focus =>") && w.contains("unminimize()") && w.contains("set_focus()"), "{w}");
    }

    #[test]
    fn it_is_a_normal_titled_resizable_window_with_the_products_name() {
        assert_eq!((SIZE, MIN), ((760.0, 560.0), (640.0, 460.0)));
        assert!(TITLE.ends_with(" Settings") && TITLE.starts_with(crate::product!()));
        let w = body("fn settings_window_now(");
        for want in ["WebviewWindowBuilder::new(app, \"settings\", WebviewUrl::App(settingswin::PAGE.into()))", ".title(settingswin::TITLE)",
            ".inner_size(settingswin::SIZE.0, settingswin::SIZE.1)", ".min_inner_size(settingswin::MIN.0, settingswin::MIN.1)", ".resizable(true)", ".decorations(true)", ".focused(true)"] {
            assert!(w.contains(want), "{want}");
        }
        assert_eq!(LABEL, "settings");
        // Named in the full capability, so its page can listen for the settings and the engine's events.
        let caps: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert!(caps["windows"].as_array().unwrap().iter().any(|w| w == LABEL));
        // Both commands are registered.
        for c in ["open_settings_window", "close_settings_window"] { assert!(MAIN.contains(&format!(", {c},")) || MAIN.contains(&format!(", {c}]")), "{c}"); }
    }
}
