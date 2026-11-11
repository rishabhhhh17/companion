//! Draw it for me, the Mac side: a diagram laid out by the page is checked here before it is drawn on the overlay.
//! It is data only (a few boxes, arrows and short words), never a picture or markup, and never taken from the screen.
use serde_json::Value;

pub const MAX_NODES: usize = 6;
pub const MAX_EDGES: usize = 8;
const MAX_COORD: f64 = 2400.0;

fn num_ok(v: &Value, lo: f64, hi: f64) -> bool { v.as_f64().is_some_and(|n| n.is_finite() && n >= lo && n <= hi) }
fn text_ok(v: &Value, max: usize) -> bool { v.as_str().is_some_and(|s| s.chars().count() <= max && !s.contains('<') && !s.chars().any(|c| c.is_control())) }

/// A laid out diagram: `{ nodes:[{id,label,x,y,w,h,broken}], edges:[{from,to,label?,points:[[x,y],[x,y]],broken}], width, height, caption, reason }`.
/// How long the picture stays (How long Draw it for me stays, drawIt.seconds): 10, 15 or 30 seconds, or None until it is
/// closed. Anything else is the usual 15 seconds. The page fades it then; the shell tidies up one second later.
pub fn shown_ms(v: &Value) -> Option<u64> {
    match v.as_str() { Some("10") => Some(10_000), Some("30") => Some(30_000), Some("untilClosed") => None, _ => Some(15_000) }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Timing { pub hide_after_ms: Option<u64>, pub busy_ms: u64 }
/// The shell's side of the same setting: it hides the overlay one second after the page's time (15 s gives today's 16 s)
/// and keeps it busy half a second more (16.5 s), so nothing else lands on the picture meanwhile. Until closed: no timer.
pub fn timing(v: &Value) -> Timing {
    match shown_ms(v) { Some(ms) => Timing { hide_after_ms: Some(ms + 1000), busy_ms: ms + 1500 }, None => Timing { hide_after_ms: None, busy_ms: u64::MAX } }
}

/// Whether what is on the overlay keeps the character beside a window (main.rs roam_tick): a ring or a timed picture does,
/// for its own time (at most 31.5 seconds for a picture); a picture kept until closed has no time, so it does not, and the
/// character goes home as it would with nothing up.
pub fn holds_a_visit(overlay_busy: bool, kept_until_closed: bool) -> bool { overlay_busy && !kept_until_closed }

pub fn validate(d: &Value) -> Result<(), String> {
    if d.get("sketch").is_some() { return validate_sketch(&d["sketch"]); }
    let o = d.as_object().ok_or("not a diagram")?;
    let nodes = o.get("nodes").and_then(Value::as_array).ok_or("no boxes")?;
    let edges = o.get("edges").and_then(Value::as_array).ok_or("no arrows")?;
    if nodes.len() < 2 || nodes.len() > MAX_NODES || edges.is_empty() || edges.len() > MAX_EDGES { return Err("too many or too few parts".into()); }
    for n in nodes {
        if !(text_ok(&n["id"], 24) && text_ok(&n["label"], 60) && num_ok(&n["x"], 0.0, MAX_COORD) && num_ok(&n["y"], 0.0, MAX_COORD) && num_ok(&n["w"], 20.0, 400.0) && num_ok(&n["h"], 20.0, 200.0) && n["broken"].is_boolean()) { return Err("a box is not valid".into()); }
    }
    for e in edges {
        let pts = e["points"].as_array().ok_or("an arrow has no points")?;
        if pts.len() != 2 || !pts.iter().all(|p| p.as_array().is_some_and(|a| a.len() == 2 && num_ok(&a[0], 0.0, MAX_COORD) && num_ok(&a[1], 0.0, MAX_COORD))) { return Err("an arrow is not valid".into()); }
        if !(text_ok(&e["from"], 24) && text_ok(&e["to"], 24) && (e["label"].is_null() || text_ok(&e["label"], 40)) && e["broken"].is_boolean()) { return Err("an arrow is not valid".into()); }
    }
    if !(num_ok(&o["width"], 20.0, MAX_COORD) && num_ok(&o["height"], 20.0, MAX_COORD) && text_ok(&o["caption"], 200) && text_ok(&o["reason"], 200)) { return Err("the words are not valid".into()); }
    Ok(())
}

/// M33: a drawn picture, checked again in the shell before it reaches the overlay (the engine's sketch.ts checked it first):
/// a title, a caption, 3 to 80 shapes of known kinds, numbers near the 400 by 300 board, colours from the palette, a pen
/// path of drawing commands and numbers only, plain short labels.
pub const SKETCH_PALETTE: &[&str] = &["ink", "white", "gray", "blue", "sky", "navy", "yellow", "orange", "red", "pink", "purple", "green", "teal", "brown", "skin", "none"];
pub fn validate_sketch(s: &Value) -> Result<(), String> {
    let o = s.as_object().ok_or("not a picture")?;
    if !(text_ok(&o["title"], 48) && text_ok(&o["caption"], 160)) { return Err("the words are not valid".into()); }
    let shapes = o.get("shapes").and_then(Value::as_array).ok_or("no shapes")?;
    if shapes.len() < 3 || shapes.len() > 80 { return Err("too many or too few shapes".into()); }
    let colour = |v: &Value| v.is_null() || v.as_str().is_some_and(|c| SKETCH_PALETTE.contains(&c));
    let n = |v: &Value, hi: f64| num_ok(v, -1.0, hi);
    for sh in shapes {
        let ok = colour(&sh["stroke"]) && colour(&sh["fill"]) && (sh["w"].is_null() || num_ok(&sh["w"], 0.5, 6.0)) && match sh["k"].as_str() {
            Some("circle") => n(&sh["x"], 401.0) && n(&sh["y"], 301.0) && n(&sh["r"], 201.0),
            Some("ellipse") => n(&sh["x"], 401.0) && n(&sh["y"], 301.0) && n(&sh["rx"], 201.0) && n(&sh["ry"], 151.0),
            Some("rect") => n(&sh["x"], 401.0) && n(&sh["y"], 301.0) && n(&sh["width"], 401.0) && n(&sh["height"], 301.0),
            Some("line") => n(&sh["x1"], 401.0) && n(&sh["y1"], 301.0) && n(&sh["x2"], 401.0) && n(&sh["y2"], 301.0),
            Some("path") => sh["d"].as_str().is_some_and(|d| d.len() <= 800 && d.trim_start().starts_with(['M', 'm']) && d.chars().all(|c| "MmLlHhVvCcSsQqTtZz0123456789.,eE+- ".contains(c))),
            Some("text") => n(&sh["x"], 401.0) && n(&sh["y"], 301.0) && text_ok(&sh["s"], 40),
            _ => false,
        };
        if !ok { return Err("a shape is not valid".into()); }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn draw_it_for_me_stays_as_long_as_the_setting_says_and_the_shell_keeps_one_second_more() {
        // drawIt.seconds: 10, 15 or 30 seconds, or until it is closed; usual 15 (today). One setting drives the page's fade
        // and the shell's tidy up, which comes one second later (busy half a second more, so nothing lands on it meanwhile).
        assert_eq!(shown_ms(&serde_json::json!("15")), Some(15_000));
        assert_eq!(timing(&serde_json::json!("15")), Timing { hide_after_ms: Some(16_000), busy_ms: 16_500 }, "today's numbers");
        assert_eq!(timing(&serde_json::json!("10")), Timing { hide_after_ms: Some(11_000), busy_ms: 11_500 });
        assert_eq!(timing(&serde_json::json!("30")), Timing { hide_after_ms: Some(31_000), busy_ms: 31_500 });
        // Until closed: no timer at all; Close and Stop everything still take it away (hide_overlay), and so does Companion
        // being hidden (main.rs show_diagram).
        assert_eq!(shown_ms(&serde_json::json!("untilClosed")), None);
        assert_eq!(timing(&serde_json::json!("untilClosed")), Timing { hide_after_ms: None, busy_ms: u64::MAX });
        for odd in [serde_json::json!("5"), serde_json::json!(15), serde_json::json!(null), serde_json::json!("forever")] {
            assert_eq!(timing(&odd), timing(&serde_json::json!("15")), "{odd}");
        }
        let main = crate::main_src();
        let f = &main[main.find("fn show_diagram(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("let chosen = setting_now(\"drawIt.seconds\");") && f.contains("diagram::timing(&chosen)"));
        assert!(f.contains("\"ms\": diagram::shown_ms(&chosen)"), "the page is sent the same time");
        assert!(!f.contains("16_000") && !f.contains("16_500"), "no second number of its own");
        assert!(f.contains("HIDDEN_BY_US") && f.contains("USER_HID"), concat!("a picture kept until closed goes when ", crate::product!(), " is hidden"));
        let overlay = include_str!("../../src/overlay.ts");
        let draw = &overlay[overlay.find("function drawDiagram(").unwrap()..overlay.find("void listen(\"overlay-diagram\"").unwrap()];
        assert!(!draw.contains("15_000") && draw.contains("if (ms !== null) timer = setTimeout("), "the page fades it after the time it is sent");
    }
    #[test]
    fn confetti_never_plays_while_companion_is_hidden() {
        // The same rule as a picture: nothing is drawn over what the person chose not to share (a full screen video or show,
        // or Companion hidden from the menu bar). The dock page still hears a task pass while it is hidden, so the shell
        // refuses, as the command comes in and again on the main thread just before drawing.
        let main = crate::main_src();
        let f = &main[main.find("fn celebrate(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("if !free() || quiet() || companion_hidden() { return; }"), "{f}");
        let on_main = &f[f.find("run_on_main_thread(").unwrap()..];
        assert!(on_main.contains("if !free() || companion_hidden() || POINT_GEN.load(SeqCst) != gen { return; }"), "{on_main}");
        // M46: outside Lively, or with reactions off or less motion, nothing would be drawn, so the overlay never comes forward.
        let gate = f.find("if !follow::is_lively(&setting_now(\"character.lively\")) { return; }").expect("Lively is checked before the main thread hop");
        assert!(gate < f.find("run_on_main_thread(").unwrap(), "{f}");
        assert!(f.contains("follow::flies_home(&setting_now(\"character.lively\"), &setting_now(\"fun.reactions\"), reduce_motion())"), "{f}");
        let front = on_main.find("orderFrontRegardless()").unwrap();
        assert!(on_main.find("if !plays() { return; }").unwrap() < front, "{on_main}");
    }
    #[test]
    fn a_picture_kept_until_closed_never_keeps_the_character_beside_a_window() {
        // The character goes home once nothing about the window it visits is up (roam.rs). A ring and a timed picture keep
        // it there for their own time, as today; a picture kept until closed has no time, so it does not keep it at all.
        assert!(holds_a_visit(true, false), "a ring or a timed picture");
        assert!(!holds_a_visit(true, true), "a picture kept until closed");
        assert!(!holds_a_visit(false, false) && !holds_a_visit(false, true), "nothing on the overlay");
        let main = crate::main_src();
        let f = &main[main.find("fn roam_tick(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("let up = diagram::holds_a_visit(overlay_busy(), DIAGRAM_KEPT.load(SeqCst)) ||"), "roam_tick asks the rule");
    }
    use serde_json::json;
    fn good() -> Value {
        json!({ "nodes": [{ "id": "a", "label": "Page", "x": 0, "y": 0, "w": 120, "h": 46, "broken": false }, { "id": "b", "label": "API", "x": 176, "y": 0, "w": 120, "h": 46, "broken": true }],
                "edges": [{ "from": "a", "to": "b", "label": "sends", "points": [[120, 23], [176, 23]], "broken": true }], "width": 296, "height": 46, "caption": "Renamed route.", "reason": "It does not exist." })
    }
    #[test] fn a_laid_out_diagram_is_accepted() { assert!(validate(&good()).is_ok()); }
    #[test] fn too_many_boxes_or_none_is_refused() {
        let mut d = good(); let n = d["nodes"][0].clone(); d["nodes"] = json!(vec![n; 7]); assert!(validate(&d).is_err());
        let mut d = good(); d["edges"] = json!([]); assert!(validate(&d).is_err());
    }
    #[test] fn markup_control_characters_and_huge_numbers_are_refused() {
        let mut d = good(); d["nodes"][0]["label"] = json!("<img src=x onerror=alert(1)>"); assert!(validate(&d).is_err());
        let mut d = good(); d["caption"] = json!("a\u{0007}b"); assert!(validate(&d).is_err());
        let mut d = good(); d["nodes"][1]["x"] = json!(1e9); assert!(validate(&d).is_err());
        let mut d = good(); d["nodes"][1]["w"] = json!(-5); assert!(validate(&d).is_err());
        let mut d = good(); d["edges"][0]["points"] = json!([[0, 0]]); assert!(validate(&d).is_err());
    }
    #[test] fn long_words_are_refused() {
        let mut d = good(); d["nodes"][0]["label"] = json!("x".repeat(61)); assert!(validate(&d).is_err());
        let mut d = good(); d["reason"] = json!("x".repeat(201)); assert!(validate(&d).is_err());
    }
    #[test] fn not_an_object_is_refused() { assert!(validate(&json!("hi")).is_err()); assert!(validate(&json!(null)).is_err()); }

    #[test]
    fn a_drawn_picture_is_checked_again_in_the_shell() {
        use serde_json::json;
        let ok = json!({ "sketch": { "title": "Sun", "caption": "A sun.", "shapes": [
            { "k": "circle", "x": 80, "y": 150, "r": 40, "fill": "yellow", "stroke": "orange", "w": 3 },
            { "k": "path", "d": "M 1 2 C 3 4 5 6 7 8 Z", "fill": "blue", "stroke": "ink", "w": 2 },
            { "k": "text", "x": 200, "y": 40, "s": "Day", "size": 18, "fill": "ink" } ] } });
        assert!(validate(&ok).is_ok());
        for bad in [
            json!({ "sketch": { "title": "S", "caption": "", "shapes": [{ "k": "image", "href": "x" }, { "k": "circle", "x": 1, "y": 1, "r": 1 }, { "k": "circle", "x": 1, "y": 1, "r": 1 }] } }),
            json!({ "sketch": { "title": "S", "caption": "", "shapes": [{ "k": "path", "d": "M1 2 url(x)" }, { "k": "circle", "x": 1, "y": 1, "r": 1 }, { "k": "circle", "x": 1, "y": 1, "r": 1 }] } }),
            json!({ "sketch": { "title": "S", "caption": "", "shapes": [{ "k": "circle", "x": 1, "y": 1, "r": 1, "fill": "url(#x)" }, { "k": "circle", "x": 1, "y": 1, "r": 1 }, { "k": "circle", "x": 1, "y": 1, "r": 1 }] } }),
            json!({ "sketch": { "title": "<b>", "caption": "", "shapes": [] } }),
        ] { assert!(validate(&bad).is_err(), "{bad}"); }
    }
}
