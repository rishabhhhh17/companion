//! Everything in the Mac program that reads text or data it does not control must never panic and never hang: the
//! card page's JSON, text read from a screenshot, text from a log or from the model. Seeded, so a failure can be repeated.
#![cfg(test)]
use crate::coords::R;
use crate::snap::OcrBox;
use serde_json::{json, Value};
use std::time::Instant;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 { self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); self.0 >> 33 }
    fn below(&mut self, n: usize) -> usize { (self.next() as usize) % n.max(1) }
}
const PIECES: &[&str] = &["{", "}", "[", "]", "\"", ":", ",", "\n", "\t", " ", "\0", "\u{1b}[31m", "é", "😀", "\u{202e}", "<script>", "../../etc/passwd", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAA", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "4111 1111 1111 1111", "IBAN GB82WEST12345698765432", "password=hunter2", "null", "true", "1e999", "-0", "NaN", "\\", "%s", "`", "$(rm -rf /)", "https://example.com/x", "/Users/me/secret/project"];
fn junk(r: &mut Rng, max: usize) -> String { let n = 1 + r.below(max); (0..n).map(|_| PIECES[r.below(PIECES.len())]).collect::<Vec<_>>().join(if r.below(2) == 0 { "" } else { " " }) }
fn random_json(r: &mut Rng, depth: usize) -> Value {
    match r.below(if depth > 4 { 5 } else { 8 }) {
        0 => Value::Null,
        1 => json!(r.below(1000) as f64 - 500.0),
        2 => json!(f64::MAX),
        3 => Value::Bool(r.below(2) == 0),
        4 => Value::String(junk(r, 6)),
        5 => Value::Array((0..r.below(8)).map(|_| random_json(r, depth + 1)).collect()),
        _ => Value::Object((0..r.below(8)).map(|_| (junk(r, 1).chars().take(12).collect::<String>(), random_json(r, depth + 1))).collect()),
    }
}
fn quick(t: Instant, ms: u128, what: &str) { assert!(t.elapsed().as_millis() < ms, "{what} took {:?}", t.elapsed()); }

#[test]
fn the_diagram_check_survives_any_json_from_the_page() {
    let mut r = Rng(1);
    let t = Instant::now();
    for _ in 0..3000 { let _ = crate::diagram::validate(&random_json(&mut r, 0)); }
    // Close to valid but wrong in one place each.
    let good = json!({ "nodes": [{ "id": "a", "label": "A", "x": 0.0, "y": 0.0, "w": 100.0, "h": 40.0, "broken": false }, { "id": "b", "label": "B", "x": 200.0, "y": 0.0, "w": 100.0, "h": 40.0, "broken": true }],
        "edges": [{ "from": "a", "to": "b", "points": [[100.0, 20.0], [200.0, 20.0]], "broken": true }], "width": 300.0, "height": 40.0, "caption": "c", "reason": "r" });
    assert!(crate::diagram::validate(&good).is_ok(), "the control example must be valid or this test proves nothing");
    for key in ["nodes", "edges", "width", "height", "caption", "reason"] {
        for bad in [Value::Null, json!(-1), json!(1e308), json!("x"), json!([]), json!({})] {
            let mut d = good.clone(); d[key] = bad; let _ = crate::diagram::validate(&d);
        }
    }
    quick(t, 3000, "diagram checks");
}

#[test]
fn the_command_check_survives_any_json_from_the_page() {
    let mut r = Rng(2);
    for _ in 0..3000 { let _ = crate::runner::check_command(&random_json(&mut r, 0)); }
    for t in ["constructor", "__proto__", "toString", "", "agent.start\0", "AGENT.START"] { assert!(crate::runner::check_command(&json!({ "v": 1, "id": "a", "type": t })).is_err(), "{t}"); }
}

#[test]
fn secret_spotting_and_blackouts_survive_any_text_and_stay_fast() {
    let mut r = Rng(3);
    let t = Instant::now();
    for _ in 0..2000 { let s = junk(&mut r, 30); let _ = crate::redact::is_sensitive(&s); }
    let big = "1234 ".repeat(50_000); let _ = crate::redact::is_sensitive(&big);
    let big2 = "A".repeat(200_000); let _ = crate::redact::is_sensitive(&big2);
    let boxes: Vec<OcrBox> = (0..500).map(|i| OcrBox { id: format!("t{i}"), text: junk(&mut r, 5), rect: R { x: (i % 40) as f64 * 30.0, y: (i / 40) as f64 * 20.0, w: 25.0, h: 14.0 } }).collect();
    let _ = crate::redact::plan_blackouts(&boxes);
    quick(t, 5000, "secret spotting");
    assert!(crate::redact::is_sensitive("key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA here"), "a secret in plain text is still seen");
}

#[test]
fn the_log_scrubber_survives_any_text_and_never_lets_a_key_through() {
    let mut r = Rng(4);
    let t = Instant::now();
    for _ in 0..1000 {
        let s = junk(&mut r, 30);
        let out = crate::logexport::scrub(&s, "/Users/sam", &["Sam".to_string()], &["/Users/sam/Desktop/proj".to_string()]);
        assert!(!out.contains("sk-ant-api03-AAAAAAAAAAAAAAAAAAAA"), "a key survived scrubbing: {out}");
    }
    let _ = crate::logexport::scrub(&"x ".repeat(300_000), "/Users/sam", &[], &[]);
    quick(t, 6000, "log scrubbing");
}

#[test]
fn text_matching_survives_any_text_and_stays_fast() {
    let mut r = Rng(5);
    let t = Instant::now();
    for _ in 0..2000 { let (a, b) = (junk(&mut r, 8), junk(&mut r, 8)); let s = crate::snap::similarity(&a, &b); assert!((0.0..=1.0).contains(&s), "{s}"); }
    let boxes: Vec<OcrBox> = (0..300).map(|i| OcrBox { id: format!("o{i}"), text: junk(&mut r, 6), rect: R { x: 0.0, y: i as f64 * 20.0, w: 300.0, h: 16.0 } }).collect();
    for _ in 0..200 { let want = junk(&mut r, 6); let _ = crate::pointat::find_text(&boxes, &want); let _ = crate::pointat::find_line(&boxes, &want, 1 + r.below(100) as u32); }
    quick(t, 6000, "text matching");
}

#[test]
fn the_spoken_line_is_always_safe_to_say() {
    let mut r = Rng(6);
    for _ in 0..3000 {
        let s = junk(&mut r, 40);
        if let Some(l) = crate::speak::prepare(&s) {
            assert!(l.chars().count() <= crate::speak::MAX_CHARS && !l.contains('<') && !l.contains('>') && !l.chars().any(|c| c.is_control()), "{l:?}");
            assert!(!crate::redact::is_sensitive(&l), "{l:?}");
        }
    }
}

#[test]
fn a_key_glued_to_the_letters_before_it_is_still_covered_when_reading_the_screen() {
    for t in ["tokensk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA", "\u{e9}sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA", "keyghp_abcdefghijklmnopqrstuvwxyz0123456789", "xxsk_live_abcdefghijklmnopqrstu"] {
        assert!(crate::redact::is_sensitive(t), "{t}");
    }
    // Ordinary words that happen to contain the letters stay readable (the model needs them as landmarks).
    for t in ["ask-another-question-about-this", "Deploy to production", "task-management-service-settings", "highest_priority_item_list"] {
        assert!(!crate::redact::is_sensitive(t), "{t}");
    }
}

// ---------- text from the card page that becomes a file name or a path ----------

fn scratch(tag: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("companion-attack-{tag}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    std::fs::create_dir_all(&d).unwrap();
    std::fs::canonicalize(&d).unwrap()
}

#[test]
fn a_share_card_title_can_never_name_a_file_outside_the_downloads_folder() {
    let dir = std::path::Path::new("/Users/me/Downloads");
    let mut r = Rng(7);
    let mut titles: Vec<String> = ["../../../etc/passwd", "/etc/passwd", "..", ".", "", "   ", "a/b/c", "a\\b", "x\0y", "\n", "con", "-rf", "~", "$HOME", "`id`", "../x.jpg", "my project\u{202e}gpj.sh", &"a".repeat(5000), "\u{1f600}\u{1f600}", "title; rm -rf ~"].iter().map(|s| s.to_string()).collect();
    for _ in 0..300 { titles.push(junk(&mut r, 8)); }
    for t in &titles {
        let p = crate::share::card_path(dir, t, |_| false);
        assert_eq!(p.parent(), Some(dir), "{t:?} -> {p:?}");
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        assert!(name.ends_with("-is-live.jpg") && name.len() <= 80 && !name.starts_with('-') && !name.starts_with('.'), "{t:?} -> {name}");
        assert!(name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.'), "{t:?} -> {name}");
    }
}

#[test]
fn a_problem_file_name_can_never_open_anything_outside_the_project() {
    let outside = scratch("out");
    std::fs::write(outside.join("secret.txt"), "s").unwrap();
    let project = scratch("proj");
    std::fs::create_dir_all(project.join("src")).unwrap();
    std::fs::write(project.join("src/a.js"), "x").unwrap();
    std::os::unix::fs::symlink(outside.join("secret.txt"), project.join("link.txt")).unwrap();
    std::os::unix::fs::symlink(&outside, project.join("linkdir")).unwrap();
    let o = outside.join("secret.txt").to_string_lossy().to_string();
    for bad in ["../secret.txt", "../../etc/passwd", "src/../../x", &o, "/etc/passwd", "link.txt", "linkdir/secret.txt", "", ".", "src", "..", "src/a.js\0.png", "~/.ssh/id_rsa", "$HOME/x", "src//..//..//x"] {
        assert!(crate::pointat::file_in_project(&project, bad).is_err(), "{bad:?} must not open");
    }
    assert!(crate::pointat::file_in_project(&project, "src/a.js").is_ok(), "the control file must open or this test proves nothing");
    let _ = std::fs::remove_dir_all(&project); let _ = std::fs::remove_dir_all(&outside);
}

#[test]
fn the_project_folder_check_refuses_places_that_are_not_one_project() {
    let home = scratch("home");
    let data = home.join("Library/Application Support/dev.companion.app");
    std::fs::create_dir_all(&data).unwrap();
    let ok = home.join("Desktop/site"); std::fs::create_dir_all(&ok).unwrap();
    let file = home.join("Desktop/a.txt"); std::fs::write(&file, "x").unwrap();
    let h = home.to_string_lossy().to_string();
    let d = crate::projects::validate;
    for bad in ["/", "", "relative/path", "~", "~/Desktop/site", "$HOME", &h, "/System", "/usr/bin", "/etc", "/private/etc", &data.to_string_lossy(), &home.join("Library").to_string_lossy(), &file.to_string_lossy(), "/nonexistent/place", "/Users/../", "\0"] {
        assert!(d(bad, &h, &data).is_err(), "{bad:?} must be refused");
    }
    assert!(d(&ok.to_string_lossy(), &h, &data).is_ok(), "a real project folder must be accepted");
    // A link from an ordinary place to a refused one is judged by where it really leads.
    let sneaky = home.join("Desktop/lib-link");
    std::os::unix::fs::symlink(home.join("Library"), &sneaky).unwrap();
    assert!(d(&sneaky.to_string_lossy(), &h, &data).is_err(), "a link into Library must be refused");
    let _ = std::fs::remove_dir_all(&home);
}
