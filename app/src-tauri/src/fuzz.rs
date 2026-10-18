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

// ---------- staying fast, measured so that a busy Mac cannot fail it ----------
// A number of seconds says as much about the other programs running as about this code: with a load of 15 to 30 the text
// matching below took six to seven seconds where an idle Mac takes three, on old code too, and failed a limit of six. So
// nothing here is compared with seconds. Instead:
// - Work is timed by this thread's own processor time, which leaves out the time it waits while other programs run.
// - The thread asks macOS for its fast cores (an M series Mac has fast and slow cores, and the same work takes two to three
//   times as long on a slow one, which a busy Mac hands out more often).
// - Each piece is called often enough per timing to last a few milliseconds, the pieces compared are timed in turn several
//   times, and each one's fastest timing counts: load only ever adds time.
// - What is checked is a ratio of two such times: the work on a bigger input against the work on a smaller one (does it
//   grow faster than it should for its size?), or the work against a reference of known cost (has it become many times
//   slower than it is today?). Either side of the ratio slowed by the Mac slows the other alike.
// - A check that is over its limit is measured again, and fails only when it is over every time: a pathological slowdown
//   is slow every time, a moment of bad luck is not.

/// Timings of each piece, taken in turn; the fastest counts.
const ROUNDS: usize = 5;
/// The shortest timing, in seconds of processor time, so the clock's grain never decides anything.
const MIN_SAMPLE: f64 = 0.003;
/// How many times a check over its limit is measured before it fails.
const TRIES: usize = 3;

/// This thread's own processor time, in seconds.
fn cpu_now() -> f64 {
    #[cfg(unix)]
    {
        let mut t = libc::timespec { tv_sec: 0, tv_nsec: 0 };
        if unsafe { libc::clock_gettime(libc::CLOCK_THREAD_CPUTIME_ID, &mut t) } == 0 { return t.tv_sec as f64 + t.tv_nsec as f64 * 1e-9; }
    }
    use std::sync::OnceLock;
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_secs_f64()
}

/// Ask macOS to run this thread on its fast cores (the class it gives to what a person is waiting on). Tests only.
fn prefer_fast_cores() {
    #[cfg(target_os = "macos")]
    unsafe { libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_USER_INTERACTIVE, 0); }
}

/// Seconds of processor time one call of each piece takes: each piece is called often enough per timing to last at least
/// MIN_SAMPLE, the pieces are timed in turn ROUNDS times, and each one's fastest timing counts.
fn per_call(runs: &mut [&mut dyn FnMut()]) -> Vec<f64> {
    prefer_fast_cores();
    let reps: Vec<usize> = runs.iter_mut().map(|f| { let t = cpu_now(); f(); let once = (cpu_now() - t).max(1e-7); ((MIN_SAMPLE / once).ceil() as usize).clamp(1, 100_000) }).collect();
    let mut best = vec![f64::INFINITY; runs.len()];
    for _ in 0..ROUNDS {
        for (i, f) in runs.iter_mut().enumerate() {
            let t = cpu_now();
            for _ in 0..reps[i] { f(); }
            best[i] = best[i].min((cpu_now() - t) / reps[i] as f64);
        }
    }
    best
}

/// A ratio of two timings must stay at most `most`: measured up to TRIES times, and over the limit only if over every time.
fn ratio_at_most(what: &str, most: f64, measure: &mut dyn FnMut() -> (f64, String)) {
    let mut seen = Vec::new();
    for _ in 0..TRIES {
        let (ratio, how) = measure();
        eprintln!("{what}: {how}");   // shown with --nocapture
        if ratio <= most { return; }
        seen.push(how);
    }
    panic!("{what}: over the limit of {most} every time it was measured: {}", seen.join("; "));
}

/// Making the input `factor` times bigger may make the work at most `most` times slower. Work that grows in step with its
/// input is `factor` times slower, work that grows with the square of it `factor * factor` times, so a limit between the
/// two (or between the square and the cube, for work that is meant to grow with the square) catches anything that grows
/// faster than it should.
fn grows_gently(what: &str, factor: usize, most: f64, small: &mut dyn FnMut(), big: &mut dyn FnMut()) {
    ratio_at_most(what, most, &mut || {
        let t = per_call(&mut [&mut *small, &mut *big]);
        let grew = t[1] / t[0].max(1e-12);
        (grew, format!("{factor} times the input took {grew:.1} times as long ({:.3} ms against {:.3} ms)", t[1] * 1e3, t[0] * 1e3))
    });
}

/// A reference of known cost, the same kind of work as matching text: a plain edit distance between two fixed lines of
/// code, worked out in full, ten times.
fn reference() {
    let a: Vec<char> = "export default function App() { const [count, setCount] = useState(0);".chars().collect();
    let b: Vec<char> = "return <button onClick={() => setCount(count + 1)}>Count {count}</button>".chars().collect();
    let mut total = 0usize;
    for _ in 0..10 {
        let mut prev: Vec<usize> = (0..=b.len()).collect();
        for i in 1..=a.len() {
            let mut cur = vec![i];
            for j in 1..=b.len() { cur.push((prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(a[i - 1] != b[j - 1]))); }
            prev = cur;
        }
        total += prev[b.len()];
    }
    std::hint::black_box(total);
}

/// The work may cost at most `most` references: a limit a few times above what it costs today, so ordinary changes pass
/// and a pathological one (a pattern built again for every line, a search inside a search) does not.
fn costs_at_most(what: &str, most: f64, work: &mut dyn FnMut()) {
    ratio_at_most(what, most, &mut || {
        let t = per_call(&mut [&mut reference, &mut *work]);
        let cost = t[1] / t[0].max(1e-12);
        (cost, format!("{cost:.0} references ({:.3} ms against {:.4} ms)", t[1] * 1e3, t[0] * 1e3))
    });
}

/// Work that grows with the square of its input, `n` steps of `n`, and work that grows in step with it, to show the
/// checks above tell them apart.
fn quadratic(n: usize) { let mut s = 0u64; for i in 0..n { for j in 0..n { s = s.wrapping_add((i ^ j) as u64); } } std::hint::black_box(s); }
fn linear(n: usize) { let mut s = 0u64; for i in 0..n * 64 { s = s.wrapping_add(i as u64 ^ (s >> 3)); } std::hint::black_box(s); }

#[test]
fn the_growth_check_passes_work_that_grows_in_step_with_its_input() {
    grows_gently("a plain loop", 8, 20.0, &mut || linear(2_000), &mut || linear(16_000));
}
#[test]
#[should_panic(expected = "every time")]
fn the_growth_check_catches_work_that_grows_with_the_square_of_its_input() {
    grows_gently("a loop inside a loop", 8, 20.0, &mut || quadratic(150), &mut || quadratic(1200));
}
#[test]
fn the_cost_check_passes_work_that_costs_what_it_did() {
    costs_at_most("four references", 10.0, &mut || { for _ in 0..4 { reference(); } });
}
#[test]
#[should_panic(expected = "every time")]
fn the_cost_check_catches_work_many_times_dearer_than_it_should_be() {
    costs_at_most("forty references", 10.0, &mut || { for _ in 0..40 { reference(); } });
}

#[test]
fn the_diagram_check_survives_any_json_from_the_page() {
    let mut r = Rng(1);
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
    // Checking what a page sends costs next to nothing, however odd it is.
    let pages: Vec<Value> = { let mut r = Rng(10); (0..3000).map(|_| random_json(&mut r, 0)).collect() };
    costs_at_most("checking 3000 odd diagrams", 20.0, &mut || { for d in &pages { let _ = crate::diagram::validate(d); } });
    // A page can send any length of text: the check reads it once.
    let long = |n: usize| { let mut d = good.clone(); d["caption"] = json!("x".repeat(n)); d };
    let (small, big) = (long(2_000_000), long(16_000_000));
    grows_gently("the diagram check on a long caption", 8, 20.0, &mut || { let _ = crate::diagram::validate(&small); }, &mut || { let _ = crate::diagram::validate(&big); });
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
    for _ in 0..2000 { let s = junk(&mut r, 30); let _ = crate::redact::is_sensitive(&s); }
    let boxes = |r: &mut Rng, n: usize| -> Vec<OcrBox> { (0..n).map(|i| OcrBox { id: format!("t{i}"), text: junk(r, 5), rect: R { x: (i % 40) as f64 * 30.0, y: (i / 40) as f64 * 20.0, w: 25.0, h: 14.0 } }).collect() };
    let _ = crate::redact::plan_blackouts(&boxes(&mut r, 500));
    // Text built to be slow for a careless pattern (long runs of digits and spaces, of letters, of a key's own letters)
    // costs time in step with its length, never more: a pattern that tries again from every place would grow with the
    // square of it.
    for (what, piece, n) in [("long runs of card like digits", "1234 ", 6_250), ("a long run of letters", "A", 25_000), ("a key that never ends", "sk-ant-api03-A", 1_000)] {
        let (small, big) = (piece.repeat(n), piece.repeat(n * 8));
        grows_gently(&format!("secret spotting on {what}"), 8, 20.0, &mut || { let _ = crate::redact::is_sensitive(&small); }, &mut || { let _ = crate::redact::is_sensitive(&big); });
    }
    let (few, many) = (boxes(&mut Rng(30), 60), boxes(&mut Rng(30), 480));
    grows_gently("blackouts for a screen of text", 8, 20.0, &mut || { let _ = crate::redact::plan_blackouts(&few); }, &mut || { let _ = crate::redact::plan_blackouts(&many); });
    assert!(crate::redact::is_sensitive("key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA here"), "a secret in plain text is still seen");
}

#[test]
fn the_log_scrubber_survives_any_text_and_never_lets_a_key_through() {
    let mut r = Rng(4);
    for _ in 0..1000 {
        let s = junk(&mut r, 30);
        let out = crate::logexport::scrub(&s, "/Users/sam", &["Sam".to_string()], &["/Users/sam/Desktop/proj".to_string()]);
        assert!(!out.contains("sk-ant-api03-AAAAAAAAAAAAAAAAAAAA"), "a key survived scrubbing: {out}");
    }
    // A long log costs time in step with its length.
    let names = ["Sam".to_string()]; let projects = ["/Users/sam/Desktop/proj".to_string()];
    let line = "at /Users/sam/Desktop/proj/src/app.js:12 key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA sam@example.com x ";
    let (small, big) = (line.repeat(250), line.repeat(2_000));
    grows_gently("log scrubbing on a long log", 8, 20.0, &mut || { let _ = crate::logexport::scrub(&small, "/Users/sam", &names, &projects); }, &mut || { let _ = crate::logexport::scrub(&big, "/Users/sam", &names, &projects); });
    let (small, big) = ("x ".repeat(37_500), "x ".repeat(300_000));
    grows_gently("log scrubbing on a long run of short words", 8, 20.0, &mut || { let _ = crate::logexport::scrub(&small, "/Users/sam", &[], &[]); }, &mut || { let _ = crate::logexport::scrub(&big, "/Users/sam", &[], &[]); });
}

#[test]
fn text_matching_survives_any_text_and_stays_fast() {
    let mut r = Rng(5);
    for _ in 0..2000 { let (a, b) = (junk(&mut r, 8), junk(&mut r, 8)); let s = crate::snap::similarity(&a, &b); assert!((0.0..=1.0).contains(&s), "{s}"); }
    let junk_boxes = |r: &mut Rng| -> Vec<OcrBox> { (0..300).map(|i| OcrBox { id: format!("o{i}"), text: junk(r, 6), rect: R { x: 0.0, y: i as f64 * 20.0, w: 300.0, h: 16.0 } }).collect() };
    let boxes = junk_boxes(&mut r);
    for _ in 0..200 { let want = junk(&mut r, 6); let _ = crate::pointat::find_text(&boxes, &want); let _ = crate::pointat::find_line(&boxes, &want, 1 + r.below(100) as u32); }
    // A screen of junk, looked through for two things, against the reference: about 40 references on an idle Mac and 50 on
    // a busy one (its memory is shared with everything else running), so 250 leaves room for both and still catches work
    // that has become many times dearer (a pattern built again for every box, a search inside a search).
    let screen = junk_boxes(&mut Rng(50));
    let wants: Vec<(String, u32)> = { let mut r = Rng(51); (0..2).map(|_| (junk(&mut r, 6), 1 + r.below(100) as u32)).collect() };
    costs_at_most("looking through a screen of text", 250.0, &mut || { for (w, l) in &wants { let _ = crate::pointat::find_text(&screen, w); let _ = crate::pointat::find_line(&screen, w, *l); } });
    // An editor's screen: line numbers in the gutter, a line of code beside each. Matching grows with the square of the
    // text (an edit distance) and of the boxes (each box's line number is looked for among the others) by design, so up to
    // the square (64 times for 8 times the input) is fine, and the cube (512 times) is not.
    let editor = |lines: usize, width: usize| -> Vec<OcrBox> {
        (0..lines).flat_map(|i| {
            let code: String = format!("const value{i} = compute(item{i}, total + {i}); ").repeat(width / 40 + 1).chars().take(width).collect();
            [OcrBox { id: format!("n{i}"), text: (i + 1).to_string(), rect: R { x: 60.0, y: i as f64 * 20.0, w: 8.0, h: 16.0 } },
             OcrBox { id: format!("c{i}"), text: code, rect: R { x: 90.0, y: i as f64 * 20.0, w: 600.0, h: 16.0 } }]
        }).collect()
    };
    let look = |b: &[OcrBox], width: usize| { let want: String = "const value7 = compute(item7, total + 7); ".repeat(width / 40 + 1).chars().take(width).collect(); let _ = crate::pointat::find_line(b, &want, 8); let _ = crate::pointat::find_text(b, &want); };
    let (few, many) = (editor(30, 60), editor(240, 60));
    grows_gently("finding a line among more lines", 8, 100.0, &mut || look(&few, 60), &mut || look(&many, 60));
    let (short, long) = (editor(40, 30), editor(40, 240));
    grows_gently("finding a line in longer lines", 8, 100.0, &mut || look(&short, 30), &mut || look(&long, 240));
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
