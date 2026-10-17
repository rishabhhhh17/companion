//! The open project's own words, for speech to text (M11 wave 4, item 2). The speech model on this Mac is given a short
//! list of names from the project folder the person chose (file and folder names, package names from package.json, the
//! setting names the project check reported) before it listens, so "supabase", "vercel" or "useAuth" come out as written.
//! Names only: no file is opened except package.json (and only its package names are used, never a version or a script),
//! no `.env` file is opened or named, no folder whose name sounds private is looked into, nothing that looks secret is
//! used, and the list is short. It stays on this Mac: it
//! goes only to the speech model running here, and the log records how many words, never which.
use serde_json::Value;
use std::path::Path;

pub const MAX_WORDS: usize = 40;
pub const MAX_CHARS: usize = 320;
pub const MAX_PACKAGE_WORDS: usize = 20;
pub const MAX_SETTING_WORDS: usize = 8;
pub const MAX_ENTRIES: usize = 4000;
pub const MAX_DEPTH: usize = 3;
pub const MAX_PACKAGE_BYTES: u64 = 512 * 1024;

/// Folders that hold what tools made or fetched, not the person's own names.
const SKIP_DIRS: &[&str] = &["node_modules", "dist", "build", "out", "target", "vendor", "coverage", "venv", "env", "__pycache__", "Pods", "DerivedData", "bower_components", "tmp", "temp", "logs"];
/// Names too common to be worth a place on the short list (the speech model knows these words already).
const GENERIC: &[&str] = &["index", "main", "app", "page", "layout", "readme", "license", "licence", "changelog", "package", "package-lock", "tsconfig", "jsconfig",
    "test", "tests", "spec", "specs", "utils", "util", "lib", "src", "styles", "style", "globals", "global", "favicon", "logo", "components", "component", "types", "type",
    "config", "setup", "public", "assets", "images", "image", "img", "icons", "fonts", "static", "docs", "scripts", "script", "bun", "yarn", "pnpm-lock", "yarn", "bun-lock",
    "makefile", "dockerfile", "procfile", "gemfile", "requirements", "pyproject", "cargo", "go", "mod", "sum", "lock", "eslint", "prettier", "postcss", "vite-env", "next-env", "robots", "sitemap", "manifest"];
/// Parts of a file name that suggest private material: such a file's name is left out entirely.
const PRIVATE_HINTS: &[&str] = &["env", "secret", "password", "passwd", "credential", "token", "apikey", "api-key", "api_key", "keys", "private", "id_rsa", "id_ed25519", ".pem", ".key", ".p12", ".pfx", ".keychain"];

/// A plain name: 2 to 40 letters, digits, `-` or `_` (a `.` inside is fine, as in Next.js), at least one letter, not six
/// digits or more, and nothing the secret checks would cover.
pub fn word_ok(w: &str) -> bool {
    let n = w.chars().count();
    if !(2..=40).contains(&n) { return false; }
    if !w.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.') { return false; }
    if !w.chars().any(|c| c.is_alphabetic()) || w.starts_with('.') || w.ends_with('.') { return false; }
    if w.chars().filter(|c| c.is_ascii_digit()).count() >= 6 { return false; }
    !crate::redact::is_sensitive(w)
}

fn push(out: &mut Vec<String>, w: &str) { if word_ok(w) && !out.iter().any(|x| x.eq_ignore_ascii_case(w)) { out.push(w.to_string()); } }

/// The package names in a package.json: the project's own name, then what it depends on, then its tools. A scoped name
/// gives its scope and its name ("@supabase/supabase-js" gives "supabase" and "supabase-js"). Never a version, a script or
/// any other value.
pub fn from_package(json: &str) -> Vec<String> {
    let Ok(v) = serde_json::from_str::<Value>(json) else { return vec![] };
    let mut out = Vec::new();
    if let Some(n) = v.get("name").and_then(Value::as_str) { for part in n.trim_start_matches('@').split('/') { push(&mut out, part); } }
    for section in ["dependencies", "peerDependencies", "devDependencies"] {
        let Some(deps) = v.get(section).and_then(Value::as_object) else { continue };
        for name in deps.keys() {
            if out.len() >= MAX_PACKAGE_WORDS { break; }
            for part in name.trim_start_matches('@').split('/') { push(&mut out, part); }
        }
    }
    out.truncate(MAX_PACKAGE_WORDS);
    out
}

/// The name a file or folder gives: up to its first dot ("next.config.js" gives "next"). None for hidden files, anything
/// that sounds private, and names too common to help.
pub fn from_file_name(name: &str) -> Option<String> {
    if name.starts_with('.') || sounds_private(name) { return None; }
    let stem = name.split('.').next().unwrap_or("");
    if GENERIC.contains(&stem.to_lowercase().as_str()) || !word_ok(stem) { return None; }
    Some(stem.to_string())
}

/// A name that suggests private material (PRIVATE_HINTS): left out, and a folder with such a name is not looked into.
fn sounds_private(name: &str) -> bool { let low = name.to_lowercase(); PRIVATE_HINTS.iter().any(|h| low.contains(h)) }

fn walk(dir: &Path, depth: usize, seen: &mut usize, by_depth: &mut Vec<Vec<String>>) {
    if depth > MAX_DEPTH || *seen >= MAX_ENTRIES { return; }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<(String, bool)> = Vec::new();
    for e in rd.flatten() {
        if *seen >= MAX_ENTRIES { break; }
        *seen += 1;
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_symlink() { continue; }   // never followed out of the project
        entries.push((e.file_name().to_string_lossy().to_string(), ft.is_dir()));
    }
    entries.sort();
    while by_depth.len() <= depth { by_depth.push(Vec::new()); }
    for (name, is_dir) in &entries {
        if let Some(w) = from_file_name(name) { by_depth[depth].push(w); }
        if *is_dir && !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) && !sounds_private(name) { walk(&dir.join(name), depth + 1, seen, by_depth); }
    }
}

/// The project's own words, most useful first: package names, then the setting names the project check reported, then
/// folder and file names, shallow ones first. Only package.json is opened, and only when it is a sensible size.
pub fn collect(project: &Path, settings: &[String]) -> Vec<String> {
    if !project.is_dir() { return vec![]; }
    let mut out = Vec::new();
    let pkg = project.join("package.json");
    if std::fs::metadata(&pkg).is_ok_and(|m| m.is_file() && m.len() <= MAX_PACKAGE_BYTES) {
        if let Ok(t) = std::fs::read_to_string(&pkg) { for w in from_package(&t) { push(&mut out, &w); } }
    }
    for w in settings.iter().take(MAX_SETTING_WORDS) { push(&mut out, w); }
    let (mut seen, mut by_depth) = (0usize, Vec::new());
    walk(project, 0, &mut seen, &mut by_depth);
    for w in by_depth.into_iter().flatten() { if out.len() >= MAX_WORDS { break; } push(&mut out, &w); }
    out.truncate(MAX_WORDS);
    out
}

/// The text the speech model is given before it listens: the words, once each, comma separated, at most MAX_WORDS and
/// MAX_CHARS. Anything that is not a plain name is dropped here too, whoever handed it over.
pub fn prompt(words: &[String]) -> String {
    let mut kept: Vec<String> = Vec::new();
    let mut len = 0usize;
    for w in words {
        if kept.len() >= MAX_WORDS { break; }
        if !word_ok(w) || kept.iter().any(|k| k.eq_ignore_ascii_case(w)) { continue; }
        let add = w.chars().count() + if kept.is_empty() { 1 } else { 2 };
        if len + add > MAX_CHARS { break; }
        len += add; kept.push(w.clone());
    }
    if kept.is_empty() { String::new() } else { format!("{}.", kept.join(", ")) }
}

fn words_of(s: &str) -> Vec<String> { s.split(|c: char| !(c.is_alphanumeric() || c == '-' || c == '_')).filter(|w| !w.is_empty()).map(|w| w.to_lowercase()).collect() }

/// A speech model given a word list sometimes writes the list back when it hears little. Three words or more, every one
/// of them from the list and in the list's order, is taken as that, not as what the person said.
pub fn is_echo(transcript: &str, prompt: &str) -> bool {
    let (t, p) = (words_of(transcript), words_of(prompt));
    if t.len() < 3 || p.is_empty() { return false; }
    let mut at = 0usize;
    for w in &t {
        match p[at..].iter().position(|x| x == w) { Some(i) => at += i + 1, None => return false }
    }
    true
}

/// The setting names the last project check reported for a project (names only, from `project.report`'s `missing`).
static REPORTED: std::sync::Mutex<Option<(String, Vec<String>)>> = std::sync::Mutex::new(None);

/// Called with every event from the engine; keeps only a project check's setting names, checked as names.
pub fn note_report(v: &Value) {
    if v.get("type").and_then(Value::as_str) != Some("project.report") { return; }
    let Some(project) = v.get("project").and_then(Value::as_str) else { return };
    let mut names = Vec::new();
    for n in v.get("missing").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str) {
        if names.len() >= MAX_SETTING_WORDS { break; }
        push(&mut names, n);
    }
    *REPORTED.lock().unwrap_or_else(|e| e.into_inner()) = Some((project.to_string(), names));
}
pub fn settings_for(project: &str) -> Vec<String> {
    match REPORTED.lock().unwrap_or_else(|e| e.into_inner()).as_ref() { Some((p, n)) if p == project => n.clone(), _ => vec![] }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs::{create_dir_all, write};

    fn fixture(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("companion-test-words-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d); create_dir_all(&d).unwrap(); d
    }

    #[test]
    fn package_names_are_used_never_versions_scripts_or_values() {
        let pkg = json!({ "name": "my-shop", "version": "1.2.3", "scripts": { "dev": "next dev --port 3000", "deploy": "vercel --token abc" },
            "dependencies": { "next": "15.0.0", "@supabase/supabase-js": "^2.45.0", "stripe": "latest" },
            "devDependencies": { "@vercel/analytics": "1.0.0", "tailwindcss": "4" } }).to_string();
        let w = from_package(&pkg);
        for want in ["my-shop", "next", "supabase", "supabase-js", "stripe", "vercel", "analytics", "tailwindcss"] { assert!(w.contains(&want.to_string()), "{want} in {w:?}"); }
        for never in ["1.2.3", "15.0.0", "^2.45.0", "latest", "dev", "deploy", "--token", "abc", "--port", "3000"] { assert!(!w.contains(&never.to_string()), "{never} in {w:?}"); }
        assert!(w.iter().position(|x| x == "next") < w.iter().position(|x| x == "tailwindcss"), "what the app runs on comes before its tools");
    }
    #[test]
    fn a_broken_or_huge_package_file_gives_few_or_no_words_never_a_crash() {
        assert!(from_package("").is_empty()); assert!(from_package("{").is_empty()); assert!(from_package("[1,2]").is_empty());
        assert!(from_package("{\"name\": 5, \"dependencies\": \"x\"}").is_empty());
        let many: serde_json::Map<String, Value> = (0..500).map(|i| (format!("pkg{i}"), json!("1"))).collect();
        assert!(from_package(&json!({ "dependencies": many }).to_string()).len() <= MAX_PACKAGE_WORDS);
    }
    #[test]
    fn file_names_give_their_name_and_private_or_generic_ones_give_nothing() {
        assert_eq!(from_file_name("useAuth.ts").as_deref(), Some("useAuth"));
        assert_eq!(from_file_name("vercel.json").as_deref(), Some("vercel"));
        assert_eq!(from_file_name("next.config.js").as_deref(), Some("next"));
        assert_eq!(from_file_name("supabase").as_deref(), Some("supabase"));
        assert_eq!(from_file_name("CheckoutForm.tsx").as_deref(), Some("CheckoutForm"));
        for none in [".env", ".env.local", ".env.example", "env.local", ".gitignore", ".DS_Store", "secrets.json", "api-keys.txt", "id_rsa", "cert.pem", "token.txt", "password-list.md", "credentials.json",
                     "index.ts", "main.rs", "README.md", "package.json", "package-lock.json", "tsconfig.json", "a.ts", "x"] {
            assert_eq!(from_file_name(none), None, "{none}");
        }
    }
    #[test]
    fn a_word_must_look_like_a_name_never_a_secret_a_value_or_a_path() {
        for ok in ["supabase", "useAuth", "next", "supabase-js", "NEXT_PUBLIC_SUPABASE_URL", "my_app", "Stripe"] { assert!(word_ok(ok), "{ok}"); }
        for bad in ["", "a", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "KEY=value", "a/b", "C:\\x", "x:y", "one two", "tab\there", "nul\u{0}", "line\nbreak",
                    "4111111111111111", "123456", "3f9a8c7d6e5b4a3f9a8c7d6e5b4a3f9a", &"x".repeat(60)] {
            assert!(!word_ok(bad), "{bad:?}");
        }
    }
    #[test]
    fn the_prompt_is_short_unique_and_plain() {
        let words: Vec<String> = ["supabase", "Supabase", "vercel", "useAuth", "vercel"].iter().map(|s| s.to_string()).collect();
        assert_eq!(prompt(&words), "supabase, vercel, useAuth.");
        assert_eq!(prompt(&[]), "");
        let many: Vec<String> = (0..200).map(|i| format!("component{i}")).collect();
        let p = prompt(&many);
        assert!(p.chars().count() <= MAX_CHARS, "{}", p.len());
        assert!(p.split(", ").count() <= MAX_WORDS);
        assert!(p.ends_with('.') && !p.contains(",."), "{p}");
        let mixed: Vec<String> = ["ok_name", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "A=B", "nul\u{0}x"].iter().map(|s| s.to_string()).collect();
        assert_eq!(prompt(&mixed), "ok_name.", "nothing that is not a name gets in, even if handed over");
        assert!(!prompt(&mixed).contains('\0'));
    }
    #[test]
    fn the_project_folder_gives_its_names_and_never_its_private_files_or_their_content() {
        let d = fixture("collect");
        write(d.join("package.json"), json!({ "name": "shop", "dependencies": { "@supabase/supabase-js": "2" } }).to_string()).unwrap();
        write(d.join(".env"), "STRIPE_SECRET=sk_live_abcdefghijklmnopqrstuvwxyz123456\n").unwrap();
        write(d.join(".env.local"), "NEXT_PUBLIC_THING=hello_private_value\n").unwrap();
        write(d.join("notes.md"), "my password is hunter2-private-content\n").unwrap();
        write(d.join("vercel.json"), "{}").unwrap();
        create_dir_all(d.join("src/hooks")).unwrap(); write(d.join("src/hooks/useAuth.ts"), "export const s = 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'").unwrap();
        create_dir_all(d.join("node_modules/lodash")).unwrap(); write(d.join("node_modules/lodash/lodashThing.js"), "").unwrap();
        create_dir_all(d.join(".git")).unwrap(); write(d.join(".git/HEAD"), "ref").unwrap();
        create_dir_all(d.join("dist")).unwrap(); write(d.join("dist/bundleOutput.js"), "").unwrap();
        create_dir_all(d.join("a/b/c/d")).unwrap(); write(d.join("a/b/c/d/tooDeepFile.ts"), "").unwrap();
        // A folder that sounds private is not looked into: the names inside it are left out too.
        create_dir_all(d.join("secrets")).unwrap(); write(d.join("secrets/acmeProdDatabase.json"), "").unwrap();
        create_dir_all(d.join("credentials/old")).unwrap(); write(d.join("credentials/old/clientBetaLogin.txt"), "").unwrap();
        create_dir_all(d.join("private-notes")).unwrap(); write(d.join("private-notes/salaryReview.md"), "").unwrap();
        let w = collect(&d, &["STRIPE_SECRET_KEY".to_string(), "bad value=1".to_string()]);
        let p = prompt(&w);
        for want in ["shop", "supabase", "vercel", "useAuth", "hooks", "STRIPE_SECRET_KEY"] { assert!(w.contains(&want.to_string()), "{want} in {w:?}"); }
        for never in ["sk_live", "hello_private_value", "hunter2", "sk-ant", "NEXT_PUBLIC_THING", "lodashThing", "bundleOutput", "HEAD", "tooDeepFile", "bad value", "env", "acmeProdDatabase", "clientBetaLogin", "salaryReview", "old"] { assert!(!p.contains(never), "{never} in {p}"); }
        assert!(w.iter().position(|x| x == "supabase") < w.iter().position(|x| x == "STRIPE_SECRET_KEY"), "package names first");
        assert!(w.iter().position(|x| x == "STRIPE_SECRET_KEY") < w.iter().position(|x| x == "useAuth"), "then setting names, then file names");
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn a_link_out_of_the_project_is_never_followed() {
        let (d, outside) = (fixture("link"), fixture("link-outside"));
        create_dir_all(outside.join("Documents")).unwrap(); write(outside.join("Documents/taxReturnDraft.pdf"), "").unwrap();
        write(outside.join("bankStatement.csv"), "").unwrap();
        write(d.join("checkoutPage.tsx"), "").unwrap();
        std::os::unix::fs::symlink(&outside, d.join("linkedHome")).unwrap();
        let w = collect(&d, &[]);
        assert!(w.contains(&"checkoutPage".to_string()), "{w:?}");
        for never in ["linkedHome", "Documents", "taxReturnDraft", "bankStatement"] { assert!(!w.contains(&never.to_string()), "{never} in {w:?}"); }
        let _ = std::fs::remove_dir_all(&d); let _ = std::fs::remove_dir_all(&outside);
    }
    #[test]
    fn a_huge_folder_is_read_only_so_far_and_stays_fast() {
        let d = fixture("huge");
        for i in 0..60 { let sub = d.join(format!("dir{i}")); create_dir_all(&sub).unwrap(); for j in 0..90 { write(sub.join(format!("file{i}x{j}.ts")), "").unwrap(); } }
        let t0 = std::time::Instant::now();
        let w = collect(&d, &[]);
        assert!(t0.elapsed() < std::time::Duration::from_secs(3), "{:?}", t0.elapsed());
        assert!(w.len() <= MAX_WORDS);
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn a_missing_folder_or_a_package_file_too_big_to_read_gives_no_crash() {
        assert!(collect(Path::new("/nonexistent/companion-test-nope"), &[]).is_empty());
        let d = fixture("bigpkg");
        write(d.join("package.json"), format!("{{\"name\":\"big\",\"x\":\"{}\"}}", "y".repeat(MAX_PACKAGE_BYTES as usize + 10))).unwrap();
        assert!(!collect(&d, &[]).contains(&"big".to_string()), "a package file over the size limit is not read");
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn when_the_model_only_repeats_the_word_list_it_is_not_taken_as_what_was_said() {
        let p = "supabase, vercel, useAuth, stripe, next.";
        assert!(is_echo("supabase, vercel, useAuth, stripe", p));
        assert!(is_echo("Supabase vercel useAuth.", p));
        assert!(!is_echo("deploy this to vercel", p));
        assert!(!is_echo("why does useAuth fail with supabase", p));
        assert!(!is_echo("next", p), "one word that happens to be on the list is a real answer");
        assert!(!is_echo("anything", ""));
    }
    #[test]
    fn setting_names_from_the_project_check_are_kept_for_that_project_only_names_only() {
        note_report(&json!({ "type": "project.report", "project": "/Users/me/shop", "missing": ["SUPABASE_URL", "STRIPE_KEY=sk_live_abc", "NEXT_PUBLIC_SITE"], "missingCount": 3 }));
        assert_eq!(settings_for("/Users/me/shop"), vec!["SUPABASE_URL".to_string(), "NEXT_PUBLIC_SITE".to_string()]);
        assert!(settings_for("/Users/me/other").is_empty());
        note_report(&json!({ "type": "agent.state", "project": "/Users/me/shop", "missing": ["X_Y"] }));
        assert_eq!(settings_for("/Users/me/shop").len(), 2, "only the project check's report counts");
        let many: Vec<String> = (0..50).map(|i| format!("NAME_{i}")).collect();
        note_report(&json!({ "type": "project.report", "project": "/Users/me/shop", "missing": many }));
        assert!(settings_for("/Users/me/shop").len() <= MAX_SETTING_WORDS);
    }
}
