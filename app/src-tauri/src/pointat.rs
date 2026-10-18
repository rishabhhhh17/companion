//! Point at the problem: open the failing file at its line in the person's own editor, then find that line (or an error
//! sentence, or a button) on the screen by its text, so the pointer circles the real thing. The finding uses the Mac's
//! own text reader on a picture that stays in memory; nothing is sent to a model for this.
use crate::coords::R;
use crate::snap::{similarity, OcrBox};
use std::path::{Path, PathBuf};

/// Editors that open a file at a line from a link: (bundle id, link scheme, name). VS Code's forks share its link format.
pub const EDITORS: &[(&str, &str, &str)] = &[
    ("com.todesktop.230313mzl4w4u92", "cursor", "Cursor"),
    ("com.microsoft.VSCode", "vscode", "VS Code"),
    ("com.exafunction.windsurf", "windsurf", "Windsurf"),
];

/// The editor in front wins (that is where the person is working); otherwise the first one installed; otherwise none.
pub fn choose_editor(front_bundle: &str, installed: impl Fn(&str) -> bool) -> Option<usize> {
    EDITORS.iter().position(|e| e.0 == front_bundle).or_else(|| EDITORS.iter().position(|e| installed(e.0)))
}

/// Which editor opens the failing file: one picked in Settings (Open files in, pointat.editor) or today's order.
/// `missing`: the picked one is not on this Mac, so today's order was used, and the person is told.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pick { pub editor: Option<usize>, pub missing: Option<&'static str> }

/// editorInFront (the usual): the editor in front, else the first installed, else the Mac's default (today). cursor,
/// vscode, windsurf: that one when it is installed, else today's order. macDefault: the Mac's own default (`open -t`).
pub fn choose_editor_for(pref: &str, front_bundle: &str, installed: impl Fn(&str) -> bool) -> Pick {
    let chosen = match pref { "cursor" => Some(0), "vscode" => Some(1), "windsurf" => Some(2), "macDefault" => return Pick { editor: None, missing: None }, _ => None };
    match chosen {
        Some(i) if installed(EDITORS[i].0) => Pick { editor: Some(i), missing: None },
        Some(i) => Pick { editor: choose_editor(front_bundle, installed), missing: Some(EDITORS[i].2) },
        None => Pick { editor: choose_editor(front_bundle, installed), missing: None },
    }
}
/// The words in front of what was opened, when the picked editor is not on this Mac.
pub fn missing_words(name: &str) -> String { format!("{name} is not on this Mac, so I used another editor. ") }

fn encode_path(p: &str) -> String {
    let mut out = String::new();
    for b in p.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~/".contains(&b) { out.push(b as char); } else { out.push_str(&format!("%{b:02X}")); }
    }
    out
}

/// The link that opens `file` at `line` in editor `i`: scheme://file/absolute/path:line:column
pub fn editor_link(i: usize, file: &Path, line: u32, column: Option<u32>) -> Option<String> {
    let (_, scheme, _) = EDITORS.get(i)?;
    let path = file.to_str()?;
    if !path.starts_with('/') || line == 0 { return None; }
    Some(format!("{scheme}://file{}:{line}:{}", encode_path(path), column.unwrap_or(1).max(1)))
}

/// The runner names a file relative to the project. It must really be inside the project, links included,
/// whatever a page sends.
pub fn file_in_project(project: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() || Path::new(rel).is_absolute() || rel.contains('\0') { return Err("not a file in the project".into()); }
    let root = project.canonicalize().map_err(|_| "the project folder is not there".to_string())?;
    let real = root.join(rel).canonicalize().map_err(|_| "the file is not there any more".to_string())?;
    if !real.starts_with(&root) || real == root || !real.is_file() { return Err("not a file in the project".into()); }
    Ok(real)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Found { pub rect: R, pub exact: bool }

fn norm(s: &str) -> String { s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect() }

/// How well a piece of text read off the screen matches what we are looking for. Lines in an editor are often cut off
/// at the window's edge, and the text reader sometimes joins the line number on, so "one holds the other" counts too.
fn text_score(seen: &str, want: &str) -> f64 {
    let (a, b) = (norm(seen), norm(want));
    if a.is_empty() || b.is_empty() { return 0.0; }
    let sim = similarity(seen, want);
    if b.chars().count() <= 6 { return if sim >= 0.85 { sim } else { 0.0 }; }   // short words must match nearly exactly
    let (la, lb) = (a.chars().count(), b.chars().count());
    let part = if la.min(lb) >= 8 && (a.contains(&b) || b.contains(&a)) { 0.7 + 0.3 * la.min(lb) as f64 / la.max(lb) as f64 } else { 0.0 };
    sim.max(part)
}

const ENOUGH: f64 = 0.72;

fn same_row(a: &R, b: &R) -> bool { ((a.y + a.h / 2.0) - (b.y + b.h / 2.0)).abs() < a.h.max(b.h) * 0.6 }

/// The line number in the editor's gutter, if the text reader saw it just left of this box on the same row.
fn numbered(boxes: &[OcrBox], r: &R, line: u32) -> bool {
    let n = line.to_string();
    // Deeply indented code sits far from its number, so the reach is wide; the number must still be on the same row, to the left.
    boxes.iter().any(|b| b.text.trim() == n && same_row(&b.rect, r) && b.rect.x + b.rect.w <= r.x + 4.0 && r.x - (b.rect.x + b.rect.w) < 600.0)
}

/// The failing line on screen: by its text (helped by the line number beside it), or, when the line is too short to
/// recognise ("}" or blank), by the line number alone, drawn as "around here".
pub fn find_line(boxes: &[OcrBox], line_text: &str, line: u32) -> Option<Found> {
    if norm(line_text).chars().count() >= 4 {
        let mut hits: Vec<(f64, R, bool)> = boxes.iter().filter_map(|b| {
            let s = text_score(&b.text, line_text);
            let num = s > 0.0 && numbered(boxes, &b.rect, line);
            let s = if num { s + 0.15 } else { s };
            (s >= ENOUGH).then_some((s, b.rect, num))
        }).collect();
        hits.sort_by(|a, b| b.0.total_cmp(&a.0));
        // Two equally good places and no line number to tell them apart (the same code twice on screen): do not guess.
        let tied = hits.len() > 1 && !hits[0].2 && hits[0].0 - hits[1].0 < 0.05;
        if let (Some(&(_, r, _)), false) = (hits.first(), tied) { return Some(Found { rect: pad(r), exact: true }); }
    }
    // A gutter number counts only with its neighbours above and below, so a stray "5" elsewhere is not taken.
    let (n, up, down) = (line.to_string(), line.saturating_sub(1).to_string(), (line + 1).to_string());
    let near = |t: &str, r: &R, dir: f64| boxes.iter().any(|b| b.text.trim() == t && (b.rect.x - r.x).abs() < 24.0 && ((b.rect.y - r.y) * dir) > 0.0 && ((b.rect.y - r.y) * dir) < r.h * 2.5);
    boxes.iter().find(|b| b.text.trim() == n && (line == 1 || near(&up, &b.rect, -1.0)) && near(&down, &b.rect, 1.0))
        .map(|b| Found { rect: R { x: b.rect.x + b.rect.w + 6.0, y: b.rect.y - 2.0, w: 420.0, h: b.rect.h + 4.0 }, exact: false })
}

/// An error sentence or a button's label on screen.
pub fn find_text(boxes: &[OcrBox], want: &str) -> Option<Found> {
    let mut best: Option<(f64, R)> = None;
    for b in boxes {
        let s = text_score(&b.text, want);
        if s >= ENOUGH && best.map_or(true, |(bs, _)| s > bs) { best = Some((s, b.rect)); }
    }
    best.map(|(_, r)| Found { rect: pad(r), exact: true })
}

fn pad(r: R) -> R { R { x: r.x - 4.0, y: r.y - 3.0, w: r.w + 8.0, h: r.h + 6.0 } }

/// The caption beside the circle: short, plain, and never a wall of compiler text.
pub fn caption(message: &str, fallback: &str) -> String {
    let m = message.split_whitespace().collect::<Vec<_>>().join(" ");
    let m = if m.is_empty() { fallback.to_string() } else { m };
    if m.chars().count() <= 110 { m } else { format!("{}…", m.chars().take(109).collect::<String>()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn b(text: &str, x: f64, y: f64, w: f64) -> OcrBox { OcrBox { id: String::new(), text: text.into(), rect: R { x, y, w, h: 16.0 } } }
    /// A small editor as the text reader sees it: line numbers in the gutter, code to the right.
    fn editor() -> Vec<OcrBox> {
        vec![
            b("1", 60.0, 100.0, 8.0), b("import { useState } from \"react\";", 90.0, 100.0, 300.0),
            b("2", 60.0, 120.0, 8.0),
            b("3", 60.0, 140.0, 8.0), b("export default function App() {", 90.0, 140.0, 280.0),
            b("4", 60.0, 160.0, 8.0), b("const [count, setCount] = useState(0);", 106.0, 160.0, 330.0),
            b("5", 60.0, 180.0, 8.0), b("const total: number = \"three\";", 106.0, 180.0, 260.0),
            b("6", 60.0, 200.0, 8.0), b("return <button onClick={() => setCount(count + 1)}>Count {count", 106.0, 200.0, 520.0),
            b("7", 60.0, 220.0, 8.0), b("}", 90.0, 220.0, 6.0),
            b("8", 60.0, 240.0, 8.0),
        ]
    }

    #[test]
    fn the_failing_line_is_found_by_its_text() {
        let f = find_line(&editor(), "const total: number = \"three\";", 5).unwrap();
        assert!(f.exact); assert!((f.rect.y - 177.0).abs() < 0.1 && f.rect.x < 106.0);
    }
    #[test]
    fn a_line_cut_off_at_the_window_edge_still_counts() {
        let f = find_line(&editor(), "return <button onClick={() => setCount(count + 1)}>Count {count} {totl}</button>;", 6).unwrap();
        assert!(f.exact && (f.rect.y - 197.0).abs() < 0.1);
    }
    #[test]
    fn small_misreads_by_the_text_reader_are_forgiven() {
        let mut e = editor(); e[10].text = "const tota1: number = \"three\";".into();
        assert!(find_line(&e, "const total: number = \"three\";", 5).is_some());
    }
    #[test]
    fn when_the_same_line_is_on_screen_twice_the_one_beside_its_line_number_wins() {
        let mut e = editor();
        e.push(b("const total: number = \"three\";", 900.0, 600.0, 260.0));   // the same text in a terminal, no line number
        let f = find_line(&e, "const total: number = \"three\";", 5).unwrap();
        assert!(f.rect.x < 200.0);
    }
    #[test]
    fn the_same_code_twice_with_no_line_number_beside_either_is_not_guessed() {
        // The text reader split both lines, and the numbers were not seen next to them: fall back to the gutter.
        let e = vec![
            b("265", 60.0, 80.0, 20.0), b("266", 60.0, 100.0, 20.0), b("restore(parsed.text, spans).text;", 450.0, 100.0, 234.0),
            b("272", 60.0, 220.0, 20.0), b("restore(parsed.text, spans).text;", 450.0, 240.0, 234.0), b("274", 60.0, 260.0, 20.0),
        ];
        let f = find_line(&e, "final = restore(parsed.text, spans).text;", 273);
        assert!(f.is_none(), "{f:?}");   // 273 itself was not read, so there is honestly no place
        let mut e2 = e.clone(); e2.push(b("273", 60.0, 240.0, 20.0));
        let f = find_line(&e2, "final = restore(parsed.text, spans).text;", 273).unwrap();
        assert!((f.rect.y - 237.0).abs() < 0.1, "{f:?}");
    }
    #[test]
    fn a_number_on_the_same_row_counts_even_when_the_code_is_deeply_indented() {
        let e = vec![b("273", 260.0, 220.0, 21.0), b("restore(parsed.text, spans).text;", 436.0, 223.0, 234.0), b("restore(parsed.text, spans).text;", 450.0, 97.0, 234.0)];
        let f = find_line(&e, "final = restore(parsed.text, spans).text;", 273).unwrap();
        assert!(f.exact && (f.rect.y - 220.0).abs() < 0.1, "{f:?}");
    }
    #[test]
    fn a_short_line_is_found_by_its_line_number_and_its_neighbours_and_drawn_as_around_here() {
        let f = find_line(&editor(), "}", 7).unwrap();
        assert!(!f.exact); assert!((f.rect.y - 218.0).abs() < 0.1 && f.rect.x > 68.0);
    }
    #[test]
    fn a_stray_number_somewhere_else_is_not_a_line_number() {
        let e = vec![b("7", 500.0, 300.0, 8.0), b("Total 7 items", 100.0, 100.0, 100.0)];
        assert!(find_line(&e, "}", 7).is_none());
    }
    #[test]
    fn a_line_that_is_not_on_screen_is_not_invented() {
        assert!(find_line(&editor(), "throw new Error(\"payment failed\");", 42).is_none());
    }
    #[test]
    fn an_error_sentence_in_a_terminal_is_found() {
        let t = vec![b("$ npm run dev", 40.0, 500.0, 120.0), b("ReferenceError: undefinedThing is not defined", 40.0, 520.0, 380.0), b("at go (/Users/me/site/src/crash.js:3:10)", 60.0, 540.0, 360.0)];
        let f = find_text(&t, "ReferenceError: undefinedThing is not defined").unwrap();
        assert!((f.rect.y - 517.0).abs() < 0.1);
    }
    #[test]
    fn a_short_button_label_must_match_nearly_exactly() {
        let page = vec![b("Saved", 100.0, 100.0, 50.0), b("Save", 300.0, 100.0, 40.0), b("Cancel", 400.0, 100.0, 50.0)];
        assert_eq!(find_text(&page, "Save").unwrap().rect.x, 296.0);
        assert!(find_text(&page, "Pay").is_none());
    }
    #[test]
    fn open_files_in_the_chosen_editor_or_fall_back_to_todays_order_and_say_so() {
        // pointat.editor, usual editorInFront: exactly today's choice.
        let all = |_: &str| true;
        for (front, installed) in [("com.exafunction.windsurf", "all"), ("com.apple.Safari", "vscode"), ("com.apple.Safari", "none")] {
            let inst = |b: &str| installed == "all" || (installed == "vscode" && b == "com.microsoft.VSCode");
            assert_eq!(choose_editor_for("editorInFront", front, inst), Pick { editor: choose_editor(front, inst), missing: None });
        }
        // A chosen editor wins over the one in front, when it is on this Mac.
        assert_eq!(choose_editor_for("cursor", "com.microsoft.VSCode", all), Pick { editor: Some(0), missing: None });
        assert_eq!(choose_editor_for("vscode", "com.todesktop.230313mzl4w4u92", all), Pick { editor: Some(1), missing: None });
        assert_eq!(choose_editor_for("windsurf", "", all), Pick { editor: Some(2), missing: None });
        // Not on this Mac: today's order, and the person is told which one was missing.
        let only_code = |b: &str| b == "com.microsoft.VSCode";
        assert_eq!(choose_editor_for("cursor", "com.apple.Safari", only_code), Pick { editor: Some(1), missing: Some("Cursor") });
        assert_eq!(choose_editor_for("windsurf", "com.apple.Safari", |_| false), Pick { editor: None, missing: Some("Windsurf") });
        // The Mac's default: never an editor link, even with Cursor in front.
        assert_eq!(choose_editor_for("macDefault", "com.todesktop.230313mzl4w4u92", all), Pick { editor: None, missing: None });
        // Anything else is today's choice.
        assert_eq!(choose_editor_for("emacs", "com.exafunction.windsurf", all), Pick { editor: Some(2), missing: None });
        assert_eq!(missing_words("Cursor"), "Cursor is not on this Mac, so I used another editor. ");
        let main = include_str!("main.rs");
        let f = &main[main.find("fn point_problem(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("pointat::choose_editor_for(setting_now(\"pointat.editor\").as_str().unwrap_or(\"\"), &front_id(), editor_installed)"));
        assert!(f.contains("pick.missing.map(pointat::missing_words)"), "a missing editor is said");
    }
    #[test]
    fn the_editor_in_front_wins_then_the_first_installed() {
        assert_eq!(choose_editor("com.exafunction.windsurf", |_| true), Some(2));
        assert_eq!(choose_editor("com.apple.Safari", |b| b == "com.microsoft.VSCode"), Some(1));
        assert_eq!(choose_editor("com.apple.Safari", |_| false), None);
    }
    #[test]
    fn the_link_opens_the_file_at_the_line_and_spaces_and_odd_characters_are_escaped() {
        assert_eq!(editor_link(0, Path::new("/Users/me/my site/src/App.tsx"), 5, Some(9)).unwrap(), "cursor://file/Users/me/my%20site/src/App.tsx:5:9");
        assert_eq!(editor_link(1, Path::new("/a/b#c?.ts"), 2, None).unwrap(), "vscode://file/a/b%23c%3F.ts:2:1");
        assert!(editor_link(0, Path::new("relative.ts"), 2, None).is_none());
        assert!(editor_link(0, Path::new("/a.ts"), 0, None).is_none());
    }
    #[test]
    fn only_files_really_inside_the_project_can_be_opened() {
        let root = std::env::temp_dir().join(format!("companion-pa-{}", std::process::id()));
        let out = std::env::temp_dir().join(format!("companion-pa-out-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root); let _ = std::fs::remove_dir_all(&out);
        std::fs::create_dir_all(root.join("src")).unwrap(); std::fs::create_dir_all(&out).unwrap();
        std::fs::write(root.join("src/App.tsx"), "x").unwrap(); std::fs::write(out.join("secret.txt"), "x").unwrap();
        std::os::unix::fs::symlink(out.join("secret.txt"), root.join("src/link.txt")).unwrap();
        assert!(file_in_project(&root, "src/App.tsx").unwrap().ends_with("src/App.tsx"));
        let climb = format!("../companion-pa-out-{}/secret.txt", std::process::id());
        for bad in [climb.as_str(), "src/link.txt", "/etc/hosts", "", "src", "nope.ts"] { assert!(file_in_project(&root, bad).is_err(), "{bad}"); }
        let _ = std::fs::remove_dir_all(&root); let _ = std::fs::remove_dir_all(&out);
    }
    #[test]
    fn the_caption_is_short_and_plain() {
        assert_eq!(caption("  Type 'string'   is not\nassignable ", "x"), "Type 'string' is not assignable");
        assert_eq!(caption("", "This line fails"), "This line fails");
        assert_eq!(caption(&"a ".repeat(200), "x").chars().count(), 110);
    }
    /// MANUAL: the editor screens made by runner/scripts/eval-point.ts, read by the Mac's own text reader.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn point_eval() {
        use crate::showme::Platform;
        let dir = std::env::var("COMPANION_POINT_EVAL").expect("set COMPANION_POINT_EVAL to the folder eval-point.ts printed");
        let cases: Vec<serde_json::Value> = serde_json::from_str(&std::fs::read_to_string(format!("{dir}/cases.json")).unwrap()).unwrap();
        let plat = crate::macos_see::MacPlatform::new(Box::new(|_, _, _, _| {}), Box::new(|_, _, _| {}), Box::new(|_| {}));
        let (mut lines, mut exact, mut rough, mut msgs, mut wrong, mut total_ms) = (0, 0, 0, 0, 0, 0u128);
        let inside = |f: &Found, t: &serde_json::Value| { let v: Vec<f64> = t.as_array().unwrap().iter().map(|x| x.as_f64().unwrap()).collect(); let (cx, cy) = (f.rect.x + f.rect.w / 2.0, f.rect.y + f.rect.h / 2.0); cy >= v[1] - 4.0 && cy <= v[1] + v[3] + 4.0 && cx >= v[0] - 30.0 && f.rect.x <= v[0] + v[2] };
        for c in &cases {
            let (w, h, scale) = (c["w"].as_u64().unwrap() as u32, c["h"].as_u64().unwrap() as u32, c["scale"].as_f64().unwrap());
            let frame = crate::frame::Frame::new(w, h, std::fs::read(c["rgba"].as_str().unwrap()).unwrap()).unwrap();
            let t0 = std::time::Instant::now();
            let fast: Vec<OcrBox> = crate::macos_see::read_text_at(&frame, false).into_iter().map(|b| OcrBox { rect: R { x: b.rect.x / scale, y: b.rect.y / scale, w: b.rect.w / scale, h: b.rect.h / scale }, ..b }).collect();
            let quick_hit = find_line(&fast, c["lineText"].as_str().unwrap(), c["line"].as_u64().unwrap() as u32).is_some();
            let read = if quick_hit { vec![] } else { plat.read_text(&frame) };
            let careful: Vec<OcrBox> = read.into_iter().map(|b| OcrBox { rect: R { x: b.rect.x / scale, y: b.rect.y / scale, w: b.rect.w / scale, h: b.rect.h / scale }, ..b }).collect();
            let ms = t0.elapsed().as_millis(); total_ms += ms;
            let boxes = if quick_hit { fast.clone() } else { careful };
            let f = find_line(&boxes, c["lineText"].as_str().unwrap(), c["line"].as_u64().unwrap() as u32);
            let ok = f.as_ref().is_some_and(|f| inside(f, &c["truth"]));
            if ok { lines += 1; if f.unwrap().exact { exact += 1 } else { rough += 1 } } else if f.is_some() { wrong += 1; }
            let m = find_text(&fast, c["message"].as_str().unwrap()).or_else(|| find_text(&boxes, c["message"].as_str().unwrap())).is_some_and(|f| inside(&f, &c["messageTruth"]));
            if m { msgs += 1; }
            if !ok && std::env::var("COMPANION_POINT_DEBUG").is_ok() { let want = c["lineText"].as_str().unwrap(); for b in boxes.iter().filter(|b| text_score(&b.text, want) > 0.5 || b.text.trim() == c["line"].to_string()) { println!("   seen {:?} at ({:.0},{:.0},{:.0}) score {:.2} numbered {}", b.text, b.rect.x, b.rect.y, b.rect.w, text_score(&b.text, want), numbered(&boxes, &b.rect, c["line"].as_u64().unwrap() as u32)); } println!("   truth {}", c["truth"]); }
            if !ok || !m { println!("MISS {} line {} {:?} found={:?} message_ok={} ({} ms)", c["id"], c["line"], c["lineText"].as_str().unwrap(), f.map(|f| (f.rect.x.round(), f.rect.y.round(), f.exact)), m, ms); }
        }
        let n = cases.len();
        println!("\nline found in the right place: {lines}/{n} ({exact} exact, {rough} around here); pointed at the wrong place: {wrong}; error sentence found: {msgs}/{n}; reading the screen took {} ms on average", total_ms / n.max(1) as u128);
    }
}
