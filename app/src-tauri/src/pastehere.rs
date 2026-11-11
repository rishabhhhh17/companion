//! M76 (roadmap 16): after Copy for my AI, Show me where to paste. This file decides WHERE, from what Accessibility says about
//! the app in front, with no Mac call, so every rule is tested without a screen. main.rs `point_paste` runs it only on the
//! person's press, with the light on first (rule 5), asks for Accessibility the first time (rule 8), and draws the ring with
//! Point at the problem's own pointer, clipped to the window and gone when it changes (rule 22).
//! - Confirmed: a typing box whose own placeholder, label or description carries that app's chat words. Solid ring.
//! - Guess: a known AI app, but no box says so: the widest typing box in the lower part of the window. Dashed ring and words.
//! - Words: anything else (an app we do not know, no box, a password box, Squibby itself in front). No ring.
//! Squibby never types, pastes or presses in the other app: nothing here or in `point_paste` posts a key (pinned by a test).
use crate::coords::R;

/// One typing box as Accessibility lists it (global top-left points). `words`: its placeholder, title, description and help,
/// never its value (what the person typed is not read).
#[derive(Clone, Debug, PartialEq)]
pub struct Box_ { pub role: String, pub subrole: String, pub words: Vec<String>, pub rect: R, pub editable: bool }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum App { Cursor, Claude, ChatGpt, VsCode, Windsurf, Browser, Other }

/// The app by its bundle id. A browser is only "known" when its window title names a chat site we know (below).
pub fn app_of(bundle: &str) -> App {
    match bundle {
        "com.todesktop.230313mzl4w4u92" => App::Cursor,
        "com.anthropic.claudefordesktop" => App::Claude,
        "com.openai.chat" => App::ChatGpt,
        "com.microsoft.VSCode" => App::VsCode,
        "com.exafunction.windsurf" => App::Windsurf,
        "com.apple.Safari" | "com.google.Chrome" | "company.thebrowser.Browser" | "com.microsoft.edgemac" | "com.brave.Browser" | "org.mozilla.firefox" | "com.vivaldi.Vivaldi" | "com.operasoftware.Opera" => App::Browser,
        _ => App::Other,
    }
}

/// The chat site a browser window shows, from its title only ("Lovable", "Claude", "ChatGPT", "Bolt", "v0", "Replit").
pub fn site_of(title: &str) -> Option<&'static str> {
    let t = title.to_lowercase();
    [("lovable", "Lovable"), ("chatgpt", "ChatGPT"), ("claude", "Claude"), ("bolt", "Bolt"), ("v0", "v0"), ("replit", "Replit")].into_iter().find(|(k, _)| t.split(|c: char| !c.is_alphanumeric()).any(|w| w == *k)).map(|(_, n)| n)
}

/// Words a chat box of each kind says about itself (placeholders and labels, lower case). [verify] on a real Mac per app.
fn chat_words(app: App, site: Option<&str>) -> &'static [&'static str] {
    match (app, site) {
        (App::Cursor | App::VsCode | App::Windsurf, _) => &["plan, search, build", "ask anything", "add a follow-up", "ask, search", "ask copilot", "ask cascade", "message", "chat input", "type your task"],
        (App::Claude, _) | (App::Browser, Some("Claude")) => &["reply to claude", "how can i help", "talk with claude", "write your prompt", "message claude", "ask claude"],
        (App::ChatGpt, _) | (App::Browser, Some("ChatGPT")) => &["ask anything", "message chatgpt", "send a message", "chat with chatgpt"],
        (App::Browser, Some("Lovable")) => &["ask lovable", "message lovable", "what do you want to build", "describe what you want"],
        (App::Browser, Some(_)) => &["ask", "message", "prompt", "what do you want to build", "describe"],
        _ => &[],
    }
}

/// A box one can type in (never a password box).
fn typing(b: &Box_) -> bool {
    b.editable && matches!(b.role.as_str(), "AXTextArea" | "AXTextField" | "AXComboBox") && b.subrole != "AXSecureTextField" && b.rect.w >= 60.0 && b.rect.h >= 14.0
}

#[derive(Clone, Debug, PartialEq)]
pub enum Where { Confirmed(R), Guess(R), Words }

/// The decision. `window`: the front window's frame; a box outside it is never taken. `own`: Squibby itself is in front.
pub fn decide(app: App, site: Option<&str>, window: Option<R>, boxes: &[Box_], own: bool) -> Where {
    if own || boxes.iter().any(|b| b.subrole == "AXSecureTextField" && b.editable) && boxes.iter().all(|b| !typing(b)) { return Where::Words; }
    let known = !matches!(app, App::Other) && !(app == App::Browser && site.is_none());
    if !known { return Where::Words; }
    let inside = |b: &&Box_| window.is_none_or(|w| { let c = b.rect.center(); c.x >= w.x && c.x <= w.x + w.w && c.y >= w.y && c.y <= w.y + w.h });
    let cands: Vec<&Box_> = boxes.iter().filter(|b| typing(b)).filter(inside).collect();
    if cands.is_empty() { return Where::Words; }
    let words = chat_words(app, site);
    let says = |b: &Box_| b.words.iter().any(|w| { let w = w.to_lowercase(); words.iter().any(|k| w.contains(k)) });
    let confirmed: Vec<&&Box_> = cands.iter().filter(|b| says(b)).collect();
    // One box says it is the chat box: confirmed. Two that say so (two chats open): the lower one, still confirmed only when
    // they do not overlap in doubt (they are separate boxes the app itself labelled).
    if let Some(b) = confirmed.iter().max_by(|a, b| (a.rect.y + a.rect.h).total_cmp(&(b.rect.y + b.rect.h))) { return Where::Confirmed(b.rect); }
    // No label: a guess, only a wide box in the lower half of the window (where chat boxes sit).
    let lower = |b: &&&Box_| window.is_none_or(|w| b.rect.y + b.rect.h / 2.0 >= w.y + w.h * 0.45) && window.is_none_or(|w| b.rect.w >= w.w * 0.25);
    cands.iter().filter(lower).max_by(|a, b| (a.rect.w * a.rect.h).total_cmp(&(b.rect.w * b.rect.h))).map(|b| Where::Guess(b.rect)).unwrap_or(Where::Words)
}

/// The app's name as the words say it.
pub fn name_of(app: App, site: Option<&str>, front_name: &str) -> String {
    match (app, site) {
        (App::Browser, Some(s)) => s.to_string(),
        (App::Other, _) | (App::Browser, None) => String::new(),
        _ => front_name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn bx(role: &str, words: &[&str], x: f64, y: f64, w: f64, h: f64) -> Box_ { Box_ { role: role.into(), subrole: String::new(), words: words.iter().map(|s| s.to_string()).collect(), rect: R { x, y, w, h }, editable: true } }
    const WIN: R = R { x: 0.0, y: 0.0, w: 1200.0, h: 800.0 };

    #[test]
    fn a_box_that_says_it_is_the_chat_box_is_confirmed() {
        let boxes = [bx("AXTextField", &["Search files"], 100.0, 10.0, 300.0, 24.0), bx("AXTextArea", &["Plan, search, build anything"], 800.0, 700.0, 380.0, 60.0)];
        assert_eq!(decide(App::Cursor, None, Some(WIN), &boxes, false), Where::Confirmed(R { x: 800.0, y: 700.0, w: 380.0, h: 60.0 }));
        let claude = [bx("AXTextArea", &["Reply to Claude..."], 300.0, 680.0, 600.0, 50.0)];
        assert!(matches!(decide(App::Claude, None, Some(WIN), &claude, false), Where::Confirmed(_)));
        let gpt = [bx("AXTextArea", &["Ask anything"], 300.0, 680.0, 600.0, 50.0)];
        assert!(matches!(decide(App::ChatGpt, None, Some(WIN), &gpt, false), Where::Confirmed(_)));
        let lovable = [bx("AXTextArea", &["Ask Lovable..."], 20.0, 700.0, 380.0, 60.0)];
        assert!(matches!(decide(App::Browser, site_of("My shop - Lovable"), Some(WIN), &lovable, false), Where::Confirmed(_)));
    }
    #[test]
    fn a_known_app_with_no_label_gets_a_guess_only_for_a_wide_low_box() {
        let boxes = [bx("AXTextArea", &[], 300.0, 690.0, 600.0, 60.0), bx("AXTextField", &[], 20.0, 20.0, 200.0, 24.0)];
        assert_eq!(decide(App::ChatGpt, None, Some(WIN), &boxes, false), Where::Guess(R { x: 300.0, y: 690.0, w: 600.0, h: 60.0 }));
        let top_only = [bx("AXTextField", &[], 20.0, 20.0, 200.0, 24.0)];
        assert_eq!(decide(App::ChatGpt, None, Some(WIN), &top_only, false), Where::Words);
    }
    #[test]
    fn an_app_we_do_not_know_a_browser_on_another_site_or_squibby_itself_get_words_only() {
        let boxes = [bx("AXTextArea", &["Ask anything"], 300.0, 690.0, 600.0, 60.0)];
        assert_eq!(decide(App::Other, None, Some(WIN), &boxes, false), Where::Words);
        assert_eq!(decide(App::Browser, site_of("Inbox (3) - Mail"), Some(WIN), &boxes, false), Where::Words);
        assert_eq!(decide(App::ChatGpt, None, Some(WIN), &boxes, true), Where::Words);
        assert_eq!(decide(App::ChatGpt, None, Some(WIN), &[], false), Where::Words);
    }
    #[test]
    fn a_password_box_is_never_a_target_and_a_box_outside_the_window_is_never_taken() {
        let mut pw = bx("AXTextField", &["Ask anything"], 300.0, 690.0, 600.0, 60.0); pw.subrole = "AXSecureTextField".into();
        assert_eq!(decide(App::ChatGpt, None, Some(WIN), &[pw], false), Where::Words);
        let away = [bx("AXTextArea", &["Ask anything"], 1500.0, 690.0, 600.0, 60.0)];
        assert_eq!(decide(App::ChatGpt, None, Some(WIN), &away, false), Where::Words);
        let mut ro = bx("AXTextArea", &["Ask anything"], 300.0, 690.0, 600.0, 60.0); ro.editable = false;
        assert_eq!(decide(App::ChatGpt, None, Some(WIN), &[ro], false), Where::Words);
    }
    #[test]
    fn the_site_is_read_from_whole_words_of_the_title() {
        assert_eq!(site_of("Lovable"), Some("Lovable"));
        assert_eq!(site_of("ChatGPT - New chat"), Some("ChatGPT"));
        assert_eq!(site_of("Claude"), Some("Claude"));
        assert_eq!(site_of("Claudette's bakery"), None);
        assert_eq!(app_of("com.google.Chrome"), App::Browser);
        assert_eq!(name_of(App::Browser, Some("Lovable"), "Google Chrome"), "Lovable");
        assert_eq!(name_of(App::Cursor, None, "Cursor"), "Cursor");
    }
    #[test]
    fn squibby_never_types_or_pastes_into_the_other_app() {
        let main = crate::main_src();
        let f = &main[main.find("fn point_paste(").expect("point_paste")..]; let f = &f[..f.find("\n}\n").unwrap()];
        for bad in ["press_paste", "post_key", "press_at", "press_menu", "write_clipboard", "set_value", "AXPress", "select_all"] { assert!(!f.contains(bad), "{bad}"); }
        // The light first: the looking stage is said before Accessibility is read.
        assert!(f.find("\"looking\"").unwrap() < f.find("ax::text_boxes(").unwrap(), "{f}");
        let src = include_str!("pastehere.rs");
        let code = &src[..src.find("#[cfg(test)]").unwrap()];
        assert!(!code.contains("ax::") && !code.contains("Command::new"));
        let ax = include_str!("ax.rs");
        let tb = &ax[ax.find("pub fn text_boxes(").expect("text_boxes")..]; let tb = &tb[..tb.find("\n}\n").unwrap()];
        assert!(!tb.contains("\"AXValue\"") && !tb.contains("post_key") && !tb.contains("AXPress"), "the boxes' words never include what was typed");
    }
}
