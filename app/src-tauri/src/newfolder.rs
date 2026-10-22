//! Make something with no project open (F23, M14 Part 1): "make me a website for my bakery", "research who competes with
//! X". Home sends `project.new` (protocol/index.ts `parseShellCommand`; `check` here takes and refuses exactly the same:
//! both run protocol/fixtures/project-new-cases.jsonl) to the shell only, through `start_in_new_folder` in main.rs. The shell
//! makes a new, empty folder named after the request in plain words, inside one folder for all of them (its name is in
//! protocol/newfolder.json, rule 21) in the place the setting make.folder names (the home folder, Documents or the Desktop),
//! chooses it as the project, and sends the engine an ordinary drive.plan (something to build: a plan first) or research.ask
//! (something to look up) for it (`task_command`, the task each shared case says). From there it is a project like any other:
//! the same safety hooks, approvals, undo points, proof, receipts and budgets, and no new trust shortcut. The engine never
//! makes a folder outside a project: it cannot even read project.new.
//!
//! The folder is made the way a practice copy is (practice.rs): never over anything (a name in use, a link that leads
//! nowhere, or a name an old folder's undo history still holds gets the next number), in one step so a folder that appears
//! at the same moment is never taken over. And it is never inside a git project (the home folder itself can be one), never
//! inside a project the person chose before, never through a link, never hidden, and never outside the home folder.
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// The longest request, in characters a person sees (protocol/index.ts MAX_REQUEST_CHARS, the ask box's longest draft).
pub const MAX_REQUEST_CHARS: usize = 4000;
/// The setting this reads (protocol/settings.json): where the folder for all of them goes.
pub const KEYS: &[&str] = &["make.folder"];
/// A folder name is at most this many words and characters: short enough to read in Finder, long enough to recognise.
const MAX_WORDS: usize = 6;
const MAX_NAME_CHARS: usize = 40;

#[derive(Deserialize)]
struct Fallback { build: String, research: String }
#[derive(Deserialize)]
struct Names { parent: String, fallback: Fallback }
pub const NAMES_TEXT: &str = include_str!("../../../protocol/newfolder.json");
fn names() -> &'static Names { static N: OnceLock<Names> = OnceLock::new(); N.get_or_init(|| serde_json::from_str(NAMES_TEXT).expect("protocol/newfolder.json is JSON")) }
/// The folder every new folder goes in ("Companion makes", a placeholder like every name).
pub fn parent_name() -> &'static str { &names().parent }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { Build, Research }
impl Kind { pub fn as_str(self) -> &'static str { match self { Kind::Build => "build", Kind::Research => "research" } } }

/// A request the page sent, checked.
#[derive(Clone, Debug, PartialEq)]
pub struct Request { pub id: String, pub kind: Kind, pub request: String, pub agent: String, pub model: String, budget: Value, pub off: bool }

/// Takes or refuses `project.new` exactly as protocol/index.ts parseShellCommand does (the shared cases).
pub fn check(v: &Value) -> Result<Request, String> {
    let bad = |what: &str| Err(format!("Companion could not read that request ({what})."));
    let Some(o) = v.as_object() else { return bad("not a message") };
    if o.get("v").and_then(Value::as_i64) != Some(1) { return bad("version"); }
    let text = |k: &str| o.get(k).and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string);
    let Some(id) = text("id") else { return bad("id") };
    if o.get("type").and_then(Value::as_str) != Some("project.new") { return bad("type"); }
    let kind = match o.get("kind").and_then(Value::as_str) { Some("build") => Kind::Build, Some("research") => Kind::Research, _ => return bad("kind") };
    let Some(request) = o.get("request").and_then(Value::as_str).map(str::to_string) else { return bad("words") };
    if request.trim().is_empty() || request.chars().count() > MAX_REQUEST_CHARS { return bad("words"); }
    let (Some(agent), Some(model)) = (text("agent"), text("model")) else { return bad("agent or model") };
    let budget = o.get("budgetUsd").cloned().unwrap_or(Value::Null);
    if !budget.as_f64().is_some_and(|b| b.is_finite() && b >= 0.0) { return bad("budget"); }
    let off = match o.get("offTheRecord") { None => false, Some(Value::Bool(b)) => *b, Some(_) => return bad("off the record") };
    // The shell makes the folder: a request never names one.
    if o.contains_key("project") { return bad("a project"); }
    Ok(Request { id, kind, request, agent, model, budget, off })
}

/// The engine command the request becomes, in `project`: an ordinary drive.plan or research.ask with the request's own
/// words, model, budget and off the record, and nothing else.
pub fn task_command(r: &Request, project: &str) -> Value {
    let words = r.request.trim();
    let mut t = match r.kind {
        Kind::Build => json!({ "v": 1, "id": r.id, "type": "drive.plan", "project": project, "agent": r.agent, "goal": words, "model": r.model, "budgetUsd": r.budget }),
        Kind::Research => json!({ "v": 1, "id": r.id, "type": "research.ask", "project": project, "agent": r.agent, "question": words, "model": r.model, "budgetUsd": r.budget }),
    };
    if r.off { t["offTheRecord"] = json!(true); }
    t
}

/// The small words a request opens with, left out of its folder's name. Each is matched as whole words, again and again
/// from the start ("can you please build me a" is four of them), and only at the start: a word that says what it is stays.
const OPENERS: &[&str] = &[
    "please", "can you", "could you", "would you", "will you", "can u", "hey", "hi", "ok", "okay",
    "i want you to", "i want to", "i would like", "id like", "i want", "i need", "help me", "lets", "let us",
    "make me", "build me", "create me", "write me", "design me", "make", "build", "create", "write", "design",
    "research", "look up", "look into", "find out", "find", "tell me", "me", "a", "an", "the", "some",
];

/// The folder's name, in plain words from the request: the small opening words ("make me a", "can you", "research") are
/// left out, only letters, digits and dashes inside a word are kept, and it is cut to a few words. Off the record, or when
/// the words could hold a secret, or when nothing is left, it is the kind's plain fallback name instead, so nothing private
/// is kept in a folder name.
pub fn folder_name(request: &str, kind: Kind, off: bool) -> String {
    let fallback = || match kind { Kind::Build => names().fallback.build.clone(), Kind::Research => names().fallback.research.clone() };
    if off || crate::redact::is_sensitive(request) { return fallback(); }
    // Words: letters and digits, with an apostrophe dropped ("Mom's" is "Moms") and a dash kept only inside a word.
    let chars: Vec<char> = request.chars().filter(|c| *c != '\'' && *c != '\u{2019}').collect();
    let mut clean = String::new();
    for (i, c) in chars.iter().enumerate() {
        let inside = |j: Option<usize>| j.and_then(|j| chars.get(j)).is_some_and(|c| c.is_alphanumeric());
        clean.push(if c.is_alphanumeric() || (*c == '-' && inside(i.checked_sub(1)) && inside(Some(i + 1))) { *c } else { ' ' });
    }
    let mut words: Vec<&str> = clean.split_whitespace().collect();
    'strip: loop {
        let lower: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();
        for o in OPENERS {
            let p: Vec<&str> = o.split(' ').collect();
            if p.len() <= lower.len() && p.iter().zip(&lower).all(|(a, b)| a == b) { words.drain(..p.len()); continue 'strip; }
        }
        break;
    }
    let mut name = String::new();
    for (n, w) in words.iter().enumerate() {
        let len = name.chars().count() + usize::from(n > 0) + w.chars().count();
        if n >= MAX_WORDS || (n > 0 && len > MAX_NAME_CHARS) { break; }
        if n > 0 { name.push(' '); }
        name.extend(w.chars().take(MAX_NAME_CHARS));
    }
    let mut first = name.chars();
    match first.next() { Some(c) => c.to_uppercase().chain(first).collect(), None => fallback() }
}

/// The folders between the home folder and the folder for all of them, for each place the setting offers. Anything else is
/// the usual place, the home folder.
pub fn place_dirs(place: &str) -> &'static [&'static str] {
    match place { "documents" => &["Documents"], "desktop" => &["Desktop"], _ => &[] }
}

/// "Website for my bakery", then "Website for my bakery 2" ... in `parent`: a name nobody uses, or none when every one is.
pub fn destination(parent: &Path, base: &str, taken: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    (1..100).map(|n| parent.join(if n == 1 { base.to_string() } else { format!("{base} {n}") })).find(|p| !taken(p))
}

/// The first folder at or above `p` that holds a .git (a folder, or the file a git worktree has), if any.
fn in_git(p: &Path) -> Option<PathBuf> { p.ancestors().find(|a| fs::symlink_metadata(a.join(".git")).is_ok()).map(Path::to_path_buf) }
/// The project the person chose that `p` would be inside, if any.
fn in_project(p: &Path, known: &[String]) -> Option<String> {
    known.iter().filter(|k| !k.is_empty()).filter_map(|k| fs::canonicalize(k).ok()).find(|k| p.starts_with(k)).map(|k| k.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

/// Makes the new folder and returns its full real path. `known`: the projects the person chose before (the current one
/// and the recent list), which a new folder may never be inside. `taken` says yes to anything at a path, and to a path an
/// old folder's undo history still holds (practice::taken). On a refusal nothing is made, except that the folder for all
/// of them may stay, empty.
pub fn make(home: &Path, place: &str, base: &str, data: &Path, known: &[String], taken: impl Fn(&Path) -> bool) -> Result<PathBuf, String> {
    let settings_hint = "Pick another place for new folders in Settings.";
    if !home.is_absolute() { return Err("Your home folder was not found.".into()); }
    let home_real = fs::canonicalize(home).ok().filter(|h| h.is_dir()).ok_or("Your home folder was not found.")?;
    // Documents or the Desktop: a real folder, never a link to somewhere else.
    let mut at = home_real.clone();
    for d in place_dirs(place) {
        at = at.join(d);
        match fs::symlink_metadata(&at) {
            Ok(m) if m.is_dir() => {}
            Ok(_) => return Err(format!("Your {d} folder is a link or a file, so Companion will not put a new folder there. {settings_hint}")),
            Err(_) => return Err(format!("Your {d} folder was not found. {settings_hint}")),
        }
    }
    let parent = at.join(parent_name());
    // Checked before anything is made, so a refusal leaves nothing behind.
    if let Some(g) = in_git(&parent) { return Err(format!("{} is inside a git project, so Companion will not make a new folder there. {settings_hint}", g.display())); }
    if let Some(p) = in_project(&parent, known) { return Err(format!("That place is inside your project {p}, so Companion will not make a new folder there. {settings_hint}")); }
    match fs::symlink_metadata(&parent) {
        Ok(m) if m.is_dir() => {}
        Ok(_) => return Err(format!("{} is a link or a file, so Companion will not put anything in it. Move it, or pick another place for new folders in Settings.", parent.display())),
        Err(_) => fs::create_dir(&parent).or_else(|e| if e.kind() == std::io::ErrorKind::AlreadyExists && fs::symlink_metadata(&parent).is_ok_and(|m| m.is_dir()) { Ok(()) } else { Err(format!("Could not make the folder for new projects ({e}).")) })?,
    }
    // The same checks a folder the person picks passes (never a system, private or Companion's own folder).
    crate::projects::validate_parent(&parent.to_string_lossy(), &home_real.to_string_lossy(), data)?;
    let dst = destination(&parent, base, taken).ok_or_else(|| format!("Every name for this is in use in {}. Move or rename an old folder, then try again.", parent.display()))?;
    // One step, so a folder that appears at the same moment is never taken over.
    fs::create_dir(&dst).map_err(|e| if e.kind() == std::io::ErrorKind::AlreadyExists { "A folder with that name is already there. Try again.".to_string() } else { format!("Could not make the new folder ({e}).") })?;
    // From here the folder is this call's own, new and empty: if it is not a folder Companion may work in, it goes again.
    match crate::projects::validate(&dst.to_string_lossy(), &home_real.to_string_lossy(), data) {
        Ok(real) => Ok(real),
        Err(e) => { let _ = fs::remove_dir(&dst); Err(e) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::practice::{exists_at, shadow_of, taken};
    fn tmp(n: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-newfolder-{n}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); fs::canonicalize(&d).unwrap() }
    fn cases() -> Vec<Value> { include_str!("../../../protocol/fixtures/project-new-cases.jsonl").lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str(l).expect("a case is JSON")).collect() }
    fn files_in(d: &Path) -> Vec<String> { let mut v: Vec<String> = fs::read_dir(d).map(|r| r.flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect()).unwrap_or_default(); v.sort(); v }
    fn mk(home: &Path, place: &str, base: &str, known: &[String]) -> Result<PathBuf, String> { let data = home.join("Library/Application Support/dev.companion.app"); make(home, place, base, &data, known, taken(&data)) }

    // ---------- the command, shared with the page and the engine's side ----------

    #[test]
    fn the_shared_cases_are_taken_or_refused_as_the_protocol_does_and_become_the_same_task() {
        let all = cases();
        assert!(all.len() >= 20);
        for c in &all {
            let name = c["name"].as_str().unwrap();
            let got = check(&c["cmd"]);
            assert_eq!(got.is_ok(), c["ok"].as_bool().unwrap(), "{name}: {got:?}");
            if let Ok(r) = got { assert_eq!(task_command(&r, "P"), c["task"], "{name}"); }
        }
    }
    #[test]
    fn the_longest_request_is_the_same_number_as_the_protocol_says() {
        assert!(include_str!("../../../protocol/index.ts").contains(&format!("export const MAX_REQUEST_CHARS = {MAX_REQUEST_CHARS};")));
        let at = |n: usize, s: &str| check(&json!({ "v": 1, "id": "x", "type": "project.new", "kind": "build", "request": s.repeat(n), "agent": "a", "model": "m", "budgetUsd": 1 })).is_ok();
        assert!(at(4000, "a") && !at(4001, "a"));
        assert!(at(4000, "\u{1F370}"), "a picture letter is one character");
    }
    #[test]
    fn the_task_is_an_ordinary_command_a_page_may_send_and_only_for_the_new_folder() {
        for c in cases().iter().filter(|c| c["ok"] == json!(true)) {
            let t = task_command(&check(&c["cmd"]).unwrap(), "/Users/sam/Companion makes/Website for my bakery");
            assert!(crate::runner::check_command(&t).is_ok(), "{t}");
            assert!(crate::runner::check_project(&t, "/Users/sam/Companion makes/Website for my bakery").is_ok(), "{t}");
            assert!(crate::runner::check_project(&t, "/Users/sam/shop").is_err(), "{t}");
            assert!(crate::runner::check_project(&t, "").is_err(), "{t}");
        }
    }
    #[test]
    fn a_page_can_never_hand_the_engine_project_new_itself() {
        let c = &cases()[0]["cmd"];
        assert_eq!(c["type"], "project.new");
        assert!(crate::runner::check_command(c).is_err(), "send_command must refuse it: only start_in_new_folder takes it");
    }

    // ---------- the folder's name ----------

    #[test]
    fn the_name_is_the_request_in_plain_words_without_the_opening_ones() {
        let b = |s: &str| folder_name(s, Kind::Build, false);
        assert_eq!(b("Make me a website for my bakery"), "Website for my bakery");
        assert_eq!(b("make me a website for my bakery"), "Website for my bakery");
        assert_eq!(b("Can you please build me a todo app?"), "Todo app");
        assert_eq!(b("I want a page for my band"), "Page for my band");
        assert_eq!(folder_name("Research who competes with Acme", Kind::Research, false), "Who competes with Acme");
        assert_eq!(folder_name("look up the best flour for sourdough", Kind::Research, false), "Best flour for sourdough");
        assert_eq!(b("Mom's bakery"), "Moms bakery");
        assert_eq!(b("Café für Oma"), "Café für Oma");
        assert_eq!(b("a small business website"), "Small business website", "only opening words go, never a word that says what it is");
    }
    #[test]
    fn the_name_is_cut_to_a_few_words_at_a_word() {
        assert_eq!(folder_name("A website for my grandmother's wonderful little bakery on the corner", Kind::Build, false), "Website for my grandmothers wonderful");
        assert_eq!(folder_name("one two three four five six seven eight", Kind::Build, false), "One two three four five six");
        assert_eq!(folder_name(&"x".repeat(100), Kind::Build, false), format!("X{}", "x".repeat(39)));
        // A long run of letters that could be a key is never a name (redact.rs reads 32 hex letters as one).
        assert_eq!(folder_name(&"a".repeat(100), Kind::Build, false), "New project");
    }
    #[test]
    fn a_name_is_never_a_path_hidden_a_link_or_odd() {
        let b = |s: &str| folder_name(s, Kind::Build, false);
        assert_eq!(b("../../etc/passwd"), "Etc passwd");
        assert_eq!(b(".ssh keys"), "Ssh keys");
        assert_eq!(b("~/Library/Keychains"), "Library Keychains");
        assert_eq!(b("a/b\\c:d*e?f\"g<h>i|j"), "B c d e f g");
        assert_eq!(b("-rf the site"), "Rf the site");
        assert_eq!(b("line one\nline two\ttab\u{0}nul"), "Line one line two tab nul");
        for nasty in ["..", ".", "/", "~", "", " ", "\u{202e}gnp.exe", "con", "\u{feff}x", "x\u{0}", "a\u{200b}b", "🎂 cake 🎂", "名前 ウェブサイト"] {
            let n = b(nasty);
            assert!(!n.is_empty() && !n.starts_with('.') && !n.starts_with('-') && n.chars().count() <= MAX_NAME_CHARS, "{nasty:?} -> {n:?}");
            assert!(n.chars().all(|c| c.is_alphanumeric() || c == ' ' || c == '-'), "{nasty:?} -> {n:?}");
            assert_eq!(n.trim(), n, "{nasty:?}");
            assert!(!n.contains("  "), "{nasty:?}");
        }
    }
    #[test]
    fn with_nothing_to_name_it_by_it_gets_the_plain_name_for_its_kind() {
        let fb = names();
        for s in ["make me a", "please", "🎂🎂🎂", "!!!", "\n\t", "the"] { assert_eq!(folder_name(s, Kind::Build, false), fb.fallback.build, "{s:?}"); }
        assert_eq!(folder_name("research", Kind::Research, false), fb.fallback.research);
        assert_eq!((fb.fallback.build.as_str(), fb.fallback.research.as_str(), parent_name()), ("New project", "Research", "Companion makes"));
    }
    #[test]
    fn a_secret_or_anything_off_the_record_never_names_a_folder() {
        assert_eq!(folder_name("make a site that uses sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789", Kind::Build, false), "New project");
        assert_eq!(folder_name("a shop page, my card is 4111 1111 1111 1111", Kind::Build, false), "New project");
        assert_eq!(folder_name("password: hunter22 for the admin page", Kind::Build, false), "New project");
        assert_eq!(folder_name("Make me a website for my bakery", Kind::Build, true), "New project");
        assert_eq!(folder_name("who competes with Acme", Kind::Research, true), "Research");
    }

    // ---------- where it goes ----------

    #[test]
    fn the_setting_offers_three_places_in_the_home_folder_and_anything_else_is_the_usual_one() {
        let r = crate::settings::registry();
        let d = r.get("make.folder").expect("make.folder is in the registry");
        assert_eq!(d.default, json!("home"));
        assert_eq!(d.options, ["home", "documents", "desktop"]);
        assert!(d.applies == ["shell"] && !d.project && d.store == "settings");
        for k in KEYS { assert!(r.get(k).is_some(), "{k}"); }
        assert_eq!(place_dirs("home"), &[] as &[&str]);
        assert_eq!(place_dirs("documents"), &["Documents"]);
        assert_eq!(place_dirs("desktop"), &["Desktop"]);
        for odd in ["", "/etc", "..", "../Library", "Home", "downloads", "~/Projects"] { assert_eq!(place_dirs(odd), &[] as &[&str], "{odd:?}"); }
    }
    #[test]
    fn each_name_gets_a_number_only_when_it_is_taken() {
        let p = Path::new("/Users/sam/Companion makes");
        assert_eq!(destination(p, "Website", |_| false), Some(p.join("Website")));
        assert_eq!(destination(p, "Website", |x| x.ends_with("Website")), Some(p.join("Website 2")));
        assert_eq!(destination(p, "Website", |x| x.ends_with("Website") || x.ends_with("Website 2")), Some(p.join("Website 3")));
        assert_eq!(destination(p, "Website", |_| true), None);
    }

    // ---------- making it ----------

    #[test]
    fn it_makes_a_new_empty_folder_in_the_folder_for_all_of_them_in_the_home_folder() {
        let home = tmp("plain");
        let made = mk(&home, "home", "Website for my bakery", &[]).unwrap();
        assert_eq!(made, home.join("Companion makes/Website for my bakery"));
        assert!(made.is_dir() && files_in(&made).is_empty());
        assert_eq!(files_in(&home), ["Companion makes"]);
        // It is a folder Companion accepts as a project, by the same checks a picked folder passes.
        assert_eq!(crate::projects::validate(made.to_str().unwrap(), home.to_str().unwrap(), &home.join("Library/Application Support/dev.companion.app")).unwrap(), made);
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn it_never_writes_over_a_folder_and_names_around_one_a_link_and_old_undo_history() {
        let home = tmp("over");
        let first = mk(&home, "home", "Website", &[]).unwrap();
        fs::write(first.join("index.html"), "mine").unwrap();
        let second = mk(&home, "home", "Website", &[]).unwrap();
        assert_eq!(second, home.join("Companion makes/Website 2"));
        assert_eq!(fs::read_to_string(first.join("index.html")).unwrap(), "mine");
        assert_eq!(files_in(&first), ["index.html"]);
        std::os::unix::fs::symlink("/nowhere", home.join("Companion makes/Website 3")).unwrap();   // a link that leads nowhere
        let data = home.join("Library/Application Support/dev.companion.app");
        fs::create_dir_all(shadow_of(&data, &home.join("Companion makes/Website 4"))).unwrap();   // an old folder's undo history
        assert_eq!(mk(&home, "home", "Website", &[]).unwrap(), home.join("Companion makes/Website 5"));
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_folder_that_appears_at_the_chosen_name_is_never_taken_over() {
        let home = tmp("raced");
        let theirs = home.join("Companion makes/Website"); fs::create_dir_all(&theirs).unwrap(); fs::write(theirs.join("mine.txt"), "mine").unwrap();
        let data = home.join("data");
        assert!(make(&home, "home", "Website", &data, &[], |_| false).is_err());   // the name looked free a moment before
        assert_eq!(files_in(&theirs), ["mine.txt"]);
        let err = make(&home, "home", "Website", &data, &[], |_| true).unwrap_err();
        assert!(err.contains("name"), "{err}");
        assert_eq!(files_in(&home.join("Companion makes")), ["Website"]);
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn the_folder_for_all_of_them_is_never_a_link_or_a_file() {
        let home = tmp("parentlink");
        let elsewhere = tmp("parentlink-target");
        std::os::unix::fs::symlink(&elsewhere, home.join("Companion makes")).unwrap();
        assert!(mk(&home, "home", "Website", &[]).is_err());
        assert!(files_in(&elsewhere).is_empty(), "nothing was made through the link");
        fs::remove_file(home.join("Companion makes")).unwrap();
        fs::write(home.join("Companion makes"), "a file").unwrap();
        assert!(mk(&home, "home", "Website", &[]).is_err());
        assert_eq!(fs::read_to_string(home.join("Companion makes")).unwrap(), "a file");
        let _ = fs::remove_dir_all(&home); let _ = fs::remove_dir_all(&elsewhere);
    }
    #[test]
    fn documents_and_the_desktop_are_used_only_when_they_are_real_folders() {
        let home = tmp("places");
        assert!(mk(&home, "documents", "Website", &[]).is_err(), "no Documents folder: nothing is made");
        assert_eq!(files_in(&home), Vec::<String>::new());
        fs::create_dir(home.join("Documents")).unwrap();
        assert_eq!(mk(&home, "documents", "Website", &[]).unwrap(), home.join("Documents/Companion makes/Website"));
        let elsewhere = tmp("places-target");
        std::os::unix::fs::symlink(&elsewhere, home.join("Desktop")).unwrap();
        assert!(mk(&home, "desktop", "Website", &[]).is_err(), "a Desktop that is a link is never followed");
        assert!(files_in(&elsewhere).is_empty());
        // An unknown place is the usual one.
        assert_eq!(mk(&home, "/etc", "Website", &[]).unwrap(), home.join("Companion makes/Website"));
        let _ = fs::remove_dir_all(&home); let _ = fs::remove_dir_all(&elsewhere);
    }
    #[test]
    fn it_needs_a_real_home_folder() {
        let data = Path::new("/nowhere/data");
        for h in ["", "relative/home", "/no/such/home/folder"] { assert!(make(Path::new(h), "home", "Website", data, &[], |_| false).is_err(), "{h:?}"); }
    }
    #[test]
    fn never_inside_a_git_project_even_when_the_home_folder_is_one() {
        let home = tmp("git");
        fs::create_dir(home.join(".git")).unwrap();   // a home folder kept in git (dotfiles)
        let err = mk(&home, "home", "Website", &[]).unwrap_err();
        assert!(err.contains("git"), "{err}");
        assert_eq!(files_in(&home), [".git"], "not even the folder for all of them is made");
        fs::remove_dir(home.join(".git")).unwrap();
        fs::write(home.join(".git"), "gitdir: /elsewhere").unwrap();   // a git worktree marks itself with a file
        assert!(mk(&home, "home", "Website", &[]).is_err());
        fs::remove_file(home.join(".git")).unwrap();
        fs::create_dir_all(home.join("Companion makes/.git")).unwrap();   // the person ran git init in the folder for all of them
        assert!(mk(&home, "home", "Website", &[]).is_err());
        assert_eq!(files_in(&home.join("Companion makes")), [".git"]);
        fs::create_dir_all(home.join("Documents/.git")).unwrap();
        assert!(mk(&home, "documents", "Website", &[]).is_err());
        assert!(!exists_at(&home.join("Documents/Companion makes")));
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn never_inside_a_project_the_person_chose() {
        let home = tmp("inside");
        fs::create_dir_all(home.join("Documents")).unwrap();
        let docs = home.join("Documents").to_string_lossy().to_string();
        assert!(mk(&home, "documents", "Website", &[docs.clone()]).is_err(), "Documents is one of their projects");
        assert!(!exists_at(&home.join("Documents/Companion makes")));
        fs::create_dir_all(home.join("Companion makes")).unwrap();
        let parent = home.join("Companion makes").to_string_lossy().to_string();
        assert!(mk(&home, "home", "Website", &[parent]).is_err(), "they chose the folder for all of them as a project");
        // A folder made here before, chosen as a project, sits beside the new one, never around it.
        let old = mk(&home, "home", "Old", &[]).unwrap();
        assert_eq!(mk(&home, "home", "Website", &[old.to_string_lossy().to_string(), docs, String::new(), "/no/such".into()]).unwrap(), home.join("Companion makes/Website"));
        let _ = fs::remove_dir_all(&home);
    }

    // ---------- the shell's own command ----------

    #[test]
    fn the_shell_checks_the_press_and_the_groups_before_it_makes_anything_and_chooses_the_folder_before_it_sends() {
        let main = include_str!("main.rs");
        let s = &main[main.find("fn start_in_new_folder(").expect("start_in_new_folder")..];
        let body = &s[..s.find("\n}\n").unwrap()];
        let at = |w: &str| body.find(w).unwrap_or_else(|| panic!("{w}"));
        assert!(at("settings::only_card(") < at("newfolder::check(") && at("newfolder::check(") < at("groups::refuse_runner(") && at("groups::refuse_runner(") < at("newfolder::make("));
        assert!(at("newfolder::make(") < at("use_project_inner(") && at("use_project_inner(") < at("runner::check_project(") && at("runner::check_project(") < at(".send(&task)"));
        assert!(body.contains("practice::taken(") && body.contains("setting_now(\"make.folder\")"));
        assert!(main.contains("start_in_new_folder, ") || main.contains(", start_in_new_folder]"), "registered");
        // send_command never takes it: it is not on the page allow list (a_page_can_never_hand_the_engine_project_new_itself).
        let send = &main[main.find("fn send_command(").unwrap()..]; let send = &send[..send.find("\n}\n").unwrap()];
        assert!(!send.contains("project.new") && !send.contains("newfolder::"));
    }
}
