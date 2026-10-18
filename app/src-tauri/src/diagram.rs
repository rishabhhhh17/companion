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

pub fn validate(d: &Value) -> Result<(), String> {
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
        let main = include_str!("main.rs");
        let f = &main[main.find("fn show_diagram(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("let chosen = setting_now(\"drawIt.seconds\");") && f.contains("diagram::timing(&chosen)"));
        assert!(f.contains("\"ms\": diagram::shown_ms(&chosen)"), "the page is sent the same time");
        assert!(!f.contains("16_000") && !f.contains("16_500"), "no second number of its own");
        assert!(f.contains("HIDDEN_BY_US") && f.contains("USER_HID"), "a picture kept until closed goes when Companion is hidden");
        let overlay = include_str!("../../src/overlay.ts");
        let draw = &overlay[overlay.find("function drawDiagram(").unwrap()..overlay.find("void listen(\"overlay-diagram\"").unwrap()];
        assert!(!draw.contains("15_000") && draw.contains("if (ms !== null) timer = setTimeout("), "the page fades it after the time it is sent");
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
}
