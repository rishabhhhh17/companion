//! What Home does when it is opened with something to do (open_card_cmd's `then`): the notch panel's two jobs, a lesson
//! to start, Learn to show, or Settings inside Home (F28, T17: the one Settings; the separate Settings window is retired,
//! so the menu bar's Settings… and the notch open Home on Settings). Only these shapes pass; anything else is dropped and
//! Home just opens.

/// "Walk me through it" starts that lesson in Home, "Open the practice list" shows Learn, and Settings opens Settings in
/// Home. A lesson id is a short plain id.
pub fn arrival(v: &serde_json::Value) -> Option<serde_json::Value> {
    let o = v.as_object()?;
    if o.len() != 1 { return None; }
    if let Some(l) = o.get("lesson") {
        let id = l.as_str()?;
        let ok = !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
        return ok.then(|| serde_json::json!({ "lesson": id }));
    }
    // Find the problem, or the check before going live, once Home is open; and the notch's Undo this fix (F28, the
    // overhaul spec 4.3), which only asks the receipt's own question in Home: nothing is undone without the person's yes.
    if let Some(d) = o.get("do") {
        return match d.as_str() {
            Some("find") => Some(serde_json::json!({ "do": "find" })),
            Some("shipCheck") => Some(serde_json::json!({ "do": "shipCheck" })),
            Some("undo") => Some(serde_json::json!({ "do": "undo" })),
            _ => None,
        };
    }
    // The notch's Add your key: Settings inside Home at one place ("account.claude"), named as a deep link names it.
    if let Some(p) = o.get("set") {
        let id = p.as_str()?;
        let ok = !id.is_empty() && id.len() <= 60 && id.split('.').all(|w| w.chars().next().is_some_and(|c| c.is_ascii_lowercase()) && w.chars().all(|c| c.is_ascii_alphabetic()));
        return ok.then(|| serde_json::json!({ "set": id }));
    }
    // The notch's Settings button (M20) and the menu bar's Settings…: Settings inside Home.
    match o.get("place").and_then(|p| p.as_str()) { Some("learn") => Some(serde_json::json!({ "place": "learn" })), Some("settings") => Some(serde_json::json!({ "place": "settings" })), _ => None }
}

/// What the menu bar's Settings… asks Home for.
pub fn menu_settings() -> serde_json::Value { serde_json::json!({ "place": "settings" }) }

#[cfg(test)]
mod tests {
    use super::*;
    const MAIN: &str = include_str!("main.rs");
    fn body(name: &str) -> String { let at = MAIN.find(name).unwrap_or_else(|| panic!("{name}")); MAIN[at..at + MAIN[at..].find("\n}\n").unwrap()].to_string() }

    #[test]
    fn home_opened_with_something_to_do_does_it_and_nothing_else() {
        use serde_json::json;
        assert_eq!(arrival(&json!({ "lesson": "settings-lesson" })), Some(json!({ "lesson": "settings-lesson" })));
        assert_eq!(arrival(&json!({ "place": "learn" })), Some(json!({ "place": "learn" })));
        // M20: the notch's Settings button opens Settings inside Home; so does the menu bar's Settings….
        assert_eq!(arrival(&json!({ "place": "settings" })), Some(json!({ "place": "settings" })));
        assert_eq!(arrival(&menu_settings()), Some(json!({ "place": "settings" })));
        // F28 (4.3): the notch's Undo this fix asks in Home; its Add your key opens Settings at Account, Your Claude.
        assert_eq!(arrival(&json!({ "do": "undo" })), Some(json!({ "do": "undo" })));
        assert_eq!(arrival(&json!({ "set": "account.claude" })), Some(json!({ "set": "account.claude" })));
        for bad in [json!({ "do": "delete" }), json!({ "set": "" }), json!({ "set": "../x" }), json!({ "set": "Account.claude" }), json!({ "set": "a..b" }), json!({ "set": "a b" }), json!({ "set": 3 }), json!({ "set": "x".repeat(61) })] {
            assert_eq!(arrival(&bad), None, "{bad}");
        }
        for bad in [json!({ "place": "elsewhere" }), json!({ "lesson": "" }), json!({ "lesson": "../x" }), json!({ "lesson": 3 }),
            json!({ "lesson": "a", "place": "learn" }), json!("learn"), json!(null), json!({}), json!({ "lesson": "a b" })] {
            assert_eq!(arrival(&bad), None, "{bad}");
        }
        let cmd = body("fn open_card_cmd(");
        assert!(cmd.contains("arrival::arrival"), "{cmd}");
        assert!(body("fn open_card_then(").contains("\"then\": t"));
    }

    #[test]
    fn there_is_no_settings_window_any_more_and_the_menu_bar_opens_settings_in_home() {
        // T17: one Settings, inside Home. No command makes or closes a window of its own, and no window is named for it.
        for gone in ["fn open_settings_window(", "fn close_settings_window(", "fn settings_window_now(", "settings.html", "WebviewWindowBuilder::new(app, \"settings\""] {
            assert!(!MAIN.contains(gone), "{gone}");
        }
        let caps: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert!(!caps["windows"].as_array().unwrap().iter().any(|w| w == "settings"));
        // The menu bar's Settings… opens Home on Settings, on the person's own click (it may take the keyboard: rule 9 is
        // about never taking it unasked).
        assert!(MAIN.contains("MenuItemBuilder::with_id(\"settings\", \"Settings…\")"));
        assert!(MAIN.contains("\"settings\" => open_card_then(app, \"menu\", true, Some(arrival::menu_settings())),"));
    }
}
