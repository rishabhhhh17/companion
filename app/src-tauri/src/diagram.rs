//! Draw it for me, the Mac side: a diagram laid out by the page is checked here before it is drawn on the overlay.
//! It is data only (a few boxes, arrows and short words), never a picture or markup, and never taken from the screen.
use serde_json::Value;

pub const MAX_NODES: usize = 6;
pub const MAX_EDGES: usize = 8;
const MAX_COORD: f64 = 2400.0;

fn num_ok(v: &Value, lo: f64, hi: f64) -> bool { v.as_f64().is_some_and(|n| n.is_finite() && n >= lo && n <= hi) }
fn text_ok(v: &Value, max: usize) -> bool { v.as_str().is_some_and(|s| s.chars().count() <= max && !s.contains('<') && !s.chars().any(|c| c.is_control())) }

/// A laid out diagram: `{ nodes:[{id,label,x,y,w,h,broken}], edges:[{from,to,label?,points:[[x,y],[x,y]],broken}], width, height, caption, reason }`.
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
