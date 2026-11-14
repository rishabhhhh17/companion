//! M86 (b), Label it, the Mac side. The engine answers a Label it look with up to 8 labels as data (runner/src/labelit.ts);
//! they are checked again here, hard, like Draw it for me's diagram (diagram.rs), before the overlay draws them: the count,
//! each label's length and words, no markup or control characters, a known tone, and every point inside the picture that
//! was taken. Nothing here looks at the screen: the one capture is Show me how's (light first, never written, with
//! Companion's own windows, the overlay among them, left out of it: macos_see.rs capture_display). The setup checklist is
//! chosen from the front window's title only, read on the press (guide_from_title).
use crate::coords::{Pt, Shot};
use serde_json::{json, Value};

pub const MAX_LABELS: usize = 8;
pub const MAX_WORDS: usize = 4;
pub const MAX_LABEL_CHARS: usize = 32;
pub const MAX_NOTE_CHARS: usize = 100;
pub const TONES: &[&str] = &["info", "look", "risk"];
/// The setup pages with a checklist (protocol/index.ts LABEL_GUIDES, runner/src/labelit.ts GUIDES): id and the name a title
/// shows it by.
pub const GUIDES: &[(&str, &str)] = &[("supabase", "supabase"), ("stripe", "stripe"), ("vercel", "vercel"), ("clerk", "clerk"), ("firebase", "firebase"), ("github", "github")];
/// How long labels stay when nothing else takes them away (Esc, Stop everything, a newer question, the window changing).
pub const SHOWN_MS: u64 = 30_000;
/// Labels revealed one after another, this far apart (the page's labelReveal.ts says the same).
pub const REVEAL_GAP_MS: u64 = 90;

fn text_ok(v: &Value, max: usize) -> bool { v.as_str().is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= max && !s.contains('<') && !s.contains('>') && !s.chars().any(|c| c.is_control())) }

/// The labelled thing's own box (optional): x, y, w, h in the picture's pixels, inside the picture, around the label's point
/// (give or take BOX_SLACK), with nothing else in it. The overlay keeps every label off every box (layout.ts placeLabels).
pub const BOX_SLACK: f64 = 4.0;
fn box_ok(b: &Value, l: &Value, img_w: f64, img_h: f64) -> bool {
    let Some(o) = b.as_object() else { return false };
    if o.len() != 4 { return false; }
    let n = |k: &str| o.get(k).and_then(|v| v.as_f64()).filter(|n| n.is_finite());
    let (Some(x), Some(y), Some(w), Some(h)) = (n("x"), n("y"), n("w"), n("h")) else { return false };
    let (px, py) = (l["x"].as_f64().unwrap_or(-1.0), l["y"].as_f64().unwrap_or(-1.0));
    x >= 0.0 && y >= 0.0 && w >= 1.0 && h >= 1.0 && x + w <= img_w && y + h <= img_h
        && px >= x - BOX_SLACK && px <= x + w + BOX_SLACK && py >= y - BOX_SLACK && py <= y + h + BOX_SLACK
}

/// The labels of one answer, against the picture they were placed on (its size in pixels).
pub fn validate(v: &Value, img_w: f64, img_h: f64) -> Result<(), String> {
    let list = v.as_array().ok_or("not a list of labels")?;
    if list.is_empty() || list.len() > MAX_LABELS { return Err("too many or too few labels".into()); }
    for l in list {
        let inside = |k: &str, hi: f64| l[k].as_f64().is_some_and(|n| n.is_finite() && n >= 0.0 && n <= hi);
        if !(inside("x", img_w) && inside("y", img_h)) { return Err("a label is not on the picture".into()); }
        if !text_ok(&l["label"], MAX_LABEL_CHARS) || l["label"].as_str().unwrap_or("").split_whitespace().count() > MAX_WORDS { return Err("a label is not a few plain words".into()); }
        if !(l["note"].is_null() || text_ok(&l["note"], MAX_NOTE_CHARS)) { return Err("a note is not one plain line".into()); }
        if !l["tone"].as_str().is_some_and(|t| TONES.contains(&t)) { return Err("a label has no known tone".into()); }
        if !(l["box"].is_null() || box_ok(&l["box"], l, img_w, img_h)) { return Err("a label's box is not around its point on the picture".into()); }
        if let Some(o) = l.as_object() { if o.keys().any(|k| !["x", "y", "box", "label", "note", "tone"].contains(&k.as_str())) { return Err("a label has more than its data".into()); } }
    }
    Ok(())
}

/// The setup page in front, from its window's title only (a browser's title ends with the site's name: "Webhooks | Stripe",
/// "Project Settings | Supabase"). The name that comes last wins, so "Supabase starter · GitHub" is GitHub. Whole words only.
pub fn guide_from_title(title: &str) -> Option<&'static str> {
    let t = title.to_lowercase();
    let mut best: Option<(usize, &'static str)> = None;
    for (id, name) in GUIDES {
        let mut from = 0;
        while let Some(i) = t[from..].find(name) {
            let at = from + i;
            let before = t[..at].chars().next_back().is_none_or(|c| !c.is_alphanumeric());
            let after = t[at + name.len()..].chars().next().is_none_or(|c| !c.is_alphanumeric());
            if before && after && best.is_none_or(|(b, _)| at >= b) { best = Some((at, id)); }
            from = at + name.len();
        }
    }
    best.map(|(_, id)| id)
}

/// Each label's point moved from the picture's pixels to points on its display (the overlay covers that display), with the
/// rest of its data as it was.
pub fn to_display(v: &Value, shot: &Shot) -> Vec<Value> {
    v.as_array().map(|list| list.iter().map(|l| {
        let g = shot.to_global(Pt { x: l["x"].as_f64().unwrap_or(0.0), y: l["y"].as_f64().unwrap_or(0.0) });
        let mut o = json!({ "x": g.x - shot.display.x, "y": g.y - shot.display.y, "label": l["label"], "tone": l["tone"] });
        if let Some(n) = l["note"].as_str() { o["note"] = json!(n); }
        if let Some(b) = l["box"].as_object() {
            let f = |k: &str| b.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0);
            let a = shot.to_global(Pt { x: f("x"), y: f("y") });
            let z = shot.to_global(Pt { x: f("x") + f("w"), y: f("y") + f("h") });
            o["box"] = json!({ "x": a.x - shot.display.x, "y": a.y - shot.display.y, "w": z.x - a.x, "h": z.y - a.y });
        }
        o
    }).collect()).unwrap_or_default()
}

/// The middle of the labelled points in global points: the window under it must stay the one in the picture, or the labels
/// go (the same rule as a Show me ring, F17 rule 22).
pub fn middle(v: &Value, shot: &Shot) -> Option<Pt> {
    let pts: Vec<Pt> = v.as_array()?.iter().map(|l| shot.to_global(Pt { x: l["x"].as_f64().unwrap_or(0.0), y: l["y"].as_f64().unwrap_or(0.0) })).collect();
    if pts.is_empty() { return None; }
    let n = pts.len() as f64;
    Some(Pt { x: pts.iter().map(|p| p.x).sum::<f64>() / n, y: pts.iter().map(|p| p.y).sum::<f64>() / n })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coords::R;
    fn good() -> Value {
        json!([{ "x": 220, "y": 140, "label": "Webhook endpoint", "note": "It must point at your live site.", "tone": "look" },
               { "x": 640, "y": 410, "label": "Signing secret", "tone": "risk" }])
    }
    #[test]
    fn good_labels_are_accepted() { assert!(validate(&good(), 1280.0, 800.0).is_ok()); }
    #[test]
    fn the_count_is_one_to_eight() {
        assert!(validate(&json!([]), 1280.0, 800.0).is_err());
        let one = good()[0].clone();
        assert!(validate(&json!(vec![one.clone(); 8]), 1280.0, 800.0).is_ok());
        assert!(validate(&json!(vec![one; 9]), 1280.0, 800.0).is_err());
        assert!(validate(&json!({ "labels": good() }), 1280.0, 800.0).is_err());
    }
    #[test]
    fn every_point_is_inside_the_picture() {
        for (x, y) in [(-1.0, 10.0), (1281.0, 10.0), (10.0, 801.0), (f64::NAN, 1.0)] {
            let mut v = good(); v[0]["x"] = json!(x); v[0]["y"] = json!(y);
            assert!(validate(&v, 1280.0, 800.0).is_err(), "{x} {y}");
        }
        let mut v = good(); v[0]["x"] = json!("10"); assert!(validate(&v, 1280.0, 800.0).is_err());
    }
    #[test]
    fn words_are_few_plain_and_short() {
        let bad = [json!("five words is too many"), json!("<b>Keys</b>"), json!("a\u{0007}b"), json!("x".repeat(33)), json!("  "), json!(3)];
        for b in bad { let mut v = good(); v[0]["label"] = b.clone(); assert!(validate(&v, 1280.0, 800.0).is_err(), "{b}"); }
        for n in [json!("two\nlines"), json!("<script>"), json!("x".repeat(101))] { let mut v = good(); v[0]["note"] = n.clone(); assert!(validate(&v, 1280.0, 800.0).is_err(), "{n}"); }
        let mut v = good(); v[0]["tone"] = json!("shout"); assert!(validate(&v, 1280.0, 800.0).is_err());
        let mut v = good(); v[0]["onclick"] = json!("x"); assert!(validate(&v, 1280.0, 800.0).is_err(), "nothing but its data");
    }
    #[test]
    fn a_box_is_optional_around_its_point_and_inside_the_picture() {
        let mut v = good(); v[0]["box"] = json!({ "x": 200, "y": 125, "w": 300, "h": 30 });
        assert!(validate(&v, 1280.0, 800.0).is_ok());
        for b in [json!({ "x": 400, "y": 125, "w": 300, "h": 30 }), json!({ "x": 1200, "y": 125, "w": 300, "h": 30 }), json!({ "x": 200, "y": 125, "w": 0, "h": 30 }),
                  json!({ "x": 200, "y": 125, "w": 300 }), json!({ "x": 200, "y": 125, "w": 300, "h": 30, "z": 1 }), json!([200, 125, 300, 30]), json!({ "x": "200", "y": 125, "w": 300, "h": 30 })] {
            let mut v = good(); v[0]["box"] = b.clone();
            assert!(validate(&v, 1280.0, 800.0).is_err(), "{b}");
        }
        let shot = Shot { display: R { x: 1440.0, y: 0.0, w: 1280.0, h: 800.0 }, img_w: 2560.0, img_h: 1600.0 };
        let v = json!([{ "x": 300, "y": 200, "box": { "x": 200, "y": 180, "w": 400, "h": 40 }, "label": "Keys", "tone": "risk" }]);
        assert_eq!(to_display(&v, &shot)[0]["box"], json!({ "x": 100.0, "y": 90.0, "w": 200.0, "h": 20.0 }));
    }
    #[test]
    fn the_checklist_is_chosen_from_the_title_alone_by_the_last_product_named() {
        assert_eq!(guide_from_title("Webhooks | Stripe"), Some("stripe"));
        assert_eq!(guide_from_title("Table Editor | Supabase"), Some("supabase"));
        assert_eq!(guide_from_title("Environment Variables – my-app – Settings – Vercel"), Some("vercel"));
        assert_eq!(guide_from_title("Clerk Dashboard"), Some("clerk"));
        assert_eq!(guide_from_title("Firestore Database - Firebase console"), Some("firebase"));
        assert_eq!(guide_from_title("acme/supabase-starter: Settings · GitHub"), Some("github"), "the site's name comes last");
        assert_eq!(guide_from_title("Stripe and Supabase notes - Google Docs"), Some("supabase"), "whatever is named last");
        assert_eq!(guide_from_title("Clerks of the court"), None, "whole words only");
        assert_eq!(guide_from_title("stripes.css - VS Code"), None);
        assert_eq!(guide_from_title(""), None);
        assert_eq!(guide_from_title("AWS console"), None);
        // The engine takes only these ids (runner/src/labelit.ts GUIDES, protocol LABEL_GUIDES).
        let proto = include_str!("../../../protocol/index.ts");
        let ids: Vec<&str> = GUIDES.iter().map(|(id, _)| *id).collect();
        assert!(proto.contains(&format!("LABEL_GUIDES = [{}] as const", ids.iter().map(|i| format!("\"{i}\"")).collect::<Vec<_>>().join(", "))));
    }
    #[test]
    fn points_move_from_the_picture_to_the_display_and_keep_their_words() {
        let shot = Shot { display: R { x: 1440.0, y: 0.0, w: 1280.0, h: 800.0 }, img_w: 2560.0, img_h: 1600.0 };
        let v = json!([{ "x": 1280, "y": 800, "label": "Keys", "tone": "risk", "note": "Never in the browser." }, { "x": 0, "y": 0, "label": "Menu", "tone": "info" }]);
        let out = to_display(&v, &shot);
        assert_eq!(out[0], json!({ "x": 640.0, "y": 400.0, "label": "Keys", "tone": "risk", "note": "Never in the browser." }));
        assert_eq!(out[1], json!({ "x": 0.0, "y": 0.0, "label": "Menu", "tone": "info" }));
        let m = middle(&v, &shot).unwrap();
        assert_eq!((m.x, m.y), (1440.0 + 320.0, 200.0));
    }
    #[test]
    fn the_overlay_is_never_in_a_picture_squibby_takes() {
        // The overlay is one of Companion's own windows, and every capture leaves out every window of this process (and the
        // password managers), so labels, rings and replays are never sent to the model as part of the screen.
        let see = include_str!("macos_see.rs");
        let f = &see[see.find("fn capture_display(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("let me = std::process::id() as i32;"));
        assert!(f.contains("if unsafe { app.processID() } == me || left_out_of_pictures(&bundle) { skip.push(w.clone()); }"));
        assert!(f.contains("SCContentFilter::initWithDisplay_excludingWindows"));
        // And no capture is ever written: nothing in the look or here writes a file.
        for src in [see, include_str!("labels.rs"), include_str!("shell_showme.rs")] {
            for bad in ["std::fs::write", "File::create", "writeToFile", "write_all("] {
                let code: String = src.lines().filter(|l| !l.trim_start().starts_with("//") && !l.contains("assert!") && !l.contains("for bad in")).collect::<Vec<_>>().join("\n");
                assert!(!code.contains(bad), "{bad}");
            }
        }
    }
    #[test]
    fn labels_are_drawn_only_through_show_me_hows_own_answer_and_checked_first() {
        let sm = include_str!("shell_showme.rs");
        let f = &sm[sm.find("fn showme_labels(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        // Only the answer to the press that took the picture: what was seen is taken once, and ended after.
        assert!(f.contains("showme_pending().step(&req, true)"), "{f}");
        let check = f.find("labels::validate(&labels, shot.img_w, shot.img_h)").expect("checked here");
        let draw = f.find("\"overlay-labels\"").expect("drawn on the overlay");
        assert!(check < draw);
        // Never over what the person chose not to share, and never after Stop everything or a newer question.
        assert!(f.contains("HIDDEN_BY_US.load(SeqCst) || USER_HID.load(SeqCst)"));
        assert!(f.contains("POINT_GEN.compare_exchange(asked, asked + 1, SeqCst, SeqCst)"));
        // Esc clears it, and it goes when the window under it changes.
        assert!(f.contains("esc_screen(&a, true)"));
        assert!(f.contains("crate::anchor::check("));
        // When they go by themselves, Home hears it, so its line about them ends with them (and a voice Show me ends).
        assert!(f.contains("say_showme(&app, \"done\", \"\", json!({ \"req\": req }))"), "{f}");
        assert!(f.contains("say_showme(&app, \"window_changed\", LABELS_WINDOW_CHANGED, json!({ \"req\": req }))"), "{f}");
        // The window's title is read only for a Label it press, only to choose a checklist, and only once the light is on and
        // the capture was taken (rule 5): inside the ask callback, which start_on calls after the light and the picture.
        let start = &sm[sm.find("fn showme_start(").unwrap()..];
        let start = &start[..start.find("\n}\n").unwrap()];
        let read = "let guide = if mode == Some(\"label\") { labels::guide_from_title(&ax::front_window_title(front_pid()).unwrap_or_default()) } else { None };";
        assert_eq!(start.matches("front_window_title(").count(), 1, "{start}");
        let at = start.find(read).expect("the title is read on a Label it press");
        let ask = start.find("Box::new(move |q, pics, cands| {").expect("the ask callback");
        let light = start.find("Box::new(move |on| {").expect("the light callback");
        assert!(at > start.find("std::thread::spawn(").unwrap(), "not on the press itself, before the light");
        assert!(ask < at && at < light, "read inside the ask callback, never before it");
        let see = include_str!("showme.rs");
        let s = &see[see.find("pub fn start_on").unwrap()..];
        let (lit, cap, asked) = (s.find("p.indicator(true)").expect("the light first"), s.find("p.capture()").expect("the capture"), s.find("p.ask(").expect("the question"));
        assert!(lit < cap && cap < asked, "the light, then the capture, then the question (and the title with it)");
    }
}
