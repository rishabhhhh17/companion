//! The practice projects: small projects broken on purpose that ship inside the app, one stuck moment each. One catalog
//! (app/sample/practices.json) lists them for the shell, the pages and the tests: their order, their folder, the name of
//! each copy and the files its house rule protects. A practice is copied into a new folder in the home folder, named
//! after the practice, never over anything and never with git, and then it is simply a project like any other. Only ids
//! in the catalog can be asked for. A copy goes to the Trash only after a tap (Remove my copy, Start over), and only a
//! copy Companion made and recorded (practice.json in Companion's own folder: the copy's path and the dates it was
//! started, found and done, nothing from its files).
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// One practice, as the shell needs it (the catalog has more for the pages: what it finds, how it is fixed and proven).
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub id: String,
    pub folder: String,
    pub order: u32,
    #[serde(rename = "copyName")] pub copy_name: String,
    pub protect: Vec<String>,
}
#[derive(Deserialize)]
struct Catalog { #[serde(rename = "copyBase")] copy_base: String, practices: Vec<Entry> }

pub const CATALOG_TEXT: &str = include_str!("../../sample/practices.json");
fn catalog() -> &'static Catalog {
    static C: OnceLock<Catalog> = OnceLock::new();
    C.get_or_init(|| { let mut c: Catalog = serde_json::from_str(CATALOG_TEXT).expect("the practice catalog is JSON"); c.practices.sort_by_key(|e| e.order); c })
}
/// Every practice, in the order a person meets them.
pub fn entries() -> &'static [Entry] { &catalog().practices }
/// The start of every copy's name ("Companion practice"), a placeholder like every name (rule 21).
pub fn copy_base() -> &'static str { &catalog().copy_base }
/// The first practice: the first run's, and the one used when a page names none.
pub fn first() -> &'static Entry { &entries()[0] }

/// The practice a page asked for, only if its id is in the catalog (none means the first one).
pub fn pick(which: Option<&str>) -> Result<&'static Entry, String> {
    match which {
        None => Ok(first()),
        Some(w) => entries().iter().find(|e| e.id == w).ok_or_else(|| "That practice project is not in this copy of the app.".to_string()),
    }
}

/// Where a practice project is: inside the installed app, else a development override, else next to the source.
pub fn source_of(folder: &str, exe: &Path, env: Option<&str>) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = vec![];
    if let Some(c) = exe.ancestors().find(|a| a.file_name().is_some_and(|n| n == "Contents")) { candidates.push(c.join("Resources/sample").join(folder)); }
    if let Some(e) = env { candidates.push(PathBuf::from(e).join(folder)); }
    // A development build: app/src-tauri/target/<profile>/companion-app, and the sample is app/sample.
    if let Some(app) = exe.ancestors().nth(4) { candidates.push(app.join("sample").join(folder)); }
    candidates.into_iter().find(|p| p.join("package.json").is_file())
}

/// "Companion practice signup page", then "Companion practice signup page 2" ... in the home folder: a name nobody uses,
/// or none when every one of them is taken (names are never freed, since an old copy's undo history keeps its name).
pub fn destination(home: &Path, e: &Entry, taken: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    // `taken` should say yes to anything that exists, a broken link included (use `exists_at` or `taken`).
    let name = format!("{} {}", copy_base(), e.copy_name);
    (1..100).map(|n| home.join(if n == 1 { name.clone() } else { format!("{name} {n}") })).find(|p| !taken(p))
}

/// True for anything at that path, even a link that leads nowhere.
pub fn exists_at(p: &Path) -> bool { fs::symlink_metadata(p).is_ok() }

/// Where the engine keeps a project's undo history (runner/src/agent.ts store(): the first 16 characters of the sha256 of
/// the folder's path).
pub fn shadow_of(data: &Path, project: &Path) -> PathBuf {
    let h: String = Sha256::digest(project.to_string_lossy().as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
    data.join("runner/shadow").join(format!("{}.git", &h[..16]))
}
/// A name is taken by anything at that path, and by the undo history an old copy left there, so a fresh copy never shows
/// an old copy's undo points or tasks as its own.
pub fn taken(data: &Path) -> impl Fn(&Path) -> bool + '_ { move |p| exists_at(p) || exists_at(&shadow_of(data, p)) }

/// Makes a new folder, only if nothing is at that path (one step, so a folder that appears at the same moment is never
/// taken over).
fn new_folder(dst: &Path) -> Result<(), String> {
    fs::create_dir(dst).map_err(|e| if e.kind() == std::io::ErrorKind::AlreadyExists { "That folder is already there.".to_string() } else { e.to_string() })
}
/// Copies the project's files into a new folder. Links are never copied and nothing is ever written over.
pub fn copy_tree(src: &Path, dst: &Path) -> Result<(), String> {
    new_folder(dst)?;
    copy_into(src, dst)
}
/// Copies the files into a folder this copy has just made.
fn copy_into(src: &Path, dst: &Path) -> Result<(), String> {
    for e in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let (from, to) = (e.path(), dst.join(e.file_name()));
        let m = fs::symlink_metadata(&from).map_err(|e| e.to_string())?;
        if m.is_symlink() { continue; }
        if m.is_dir() { copy_tree(&from, &to)?; } else { fs::copy(&from, &to).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

/// The first line of the house rules Companion writes into a practice copy. It says who wrote them (they show in Settings
/// as this project's house rules), and it marks the folder as a copy Companion made, so Remove my copy never takes a
/// folder the person made with the same name.
pub const RULES_MARK: &str = "# Companion added these rules to its practice copy, so the fix cannot pass by changing the check.";
/// The house rules for a copy: one "never edit" line per protected file. The engine enforces them in code before every
/// action (runner/src/rules.ts), so a fix that changes the check is refused (rule 12), not only asked against in words.
pub fn rules_text(e: &Entry) -> String { let mut s = format!("{RULES_MARK}\n"); for f in &e.protect { s.push_str(&format!("never edit {f}\n")); } s }

/// Makes the practice folder and its house rules, or leaves nothing behind: a copy that fails halfway is removed. Only a
/// folder this call made is ever removed: when the name is already in use, or no name is free, nothing is touched.
pub fn make(src: &Path, home: &Path, e: &Entry, taken: impl Fn(&Path) -> bool) -> Result<PathBuf, String> {
    if !home.is_absolute() { return Err("Your home folder was not found.".into()); }
    let dst = destination(home, e, taken).ok_or("Every name for a copy of this practice is in use in your home folder. Move or rename an old copy, then try again.".to_string())?;
    new_folder(&dst).map_err(|err| format!("Could not make the practice project ({err})."))?;
    // From here the folder is this call's own and brand new, so nothing of the person's is in it to write over or remove.
    let done = copy_into(src, &dst).and_then(|_| {
        fs::create_dir_all(dst.join(".companion")).map_err(|e| e.to_string())?;
        fs::write(dst.join(".companion/rules.txt"), rules_text(e)).map_err(|e| e.to_string())
    });
    match done {
        Ok(()) => Ok(dst),
        Err(err) => { let _ = fs::remove_dir_all(&dst); Err(format!("Could not make the practice project ({err}).")) }
    }
}

/// Start (and Next, and the first run): a new copy, recorded with the day. Never a second copy while the recorded one is
/// still there: the record keeps one copy per practice, and a copy it forgot could never be listed or removed again.
pub fn create(r: &mut Record, e: &Entry, src: &Path, home: &Path, data: &Path, day: &str) -> Result<PathBuf, String> {
    if r.practices.get(&e.id).and_then(|p| p.path.as_deref()).is_some_and(|x| copy_path_ok(Path::new(x), home) && Path::new(x).is_dir()) {
        return Err("Your copy of this practice is still in your home folder. Press Continue to open it, or Start over for a fresh one.".into());
    }
    let p = make(src, home, e, taken(data))?;
    r.started(&e.id, &p, day);
    Ok(p)
}

// ---------- the record ----------

/// One practice's progress: where its copy is (none once it was removed) and the day it was started, found and done.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
pub struct Progress {
    #[serde(default, skip_serializing_if = "Option::is_none")] pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub started: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub found: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub done: Option<String>,
}
#[derive(Default, Clone, Debug, PartialEq)]
pub struct Record { pub practices: BTreeMap<String, Progress> }

fn is_day(s: &str) -> bool { s.len() == 10 && s.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() }) }
/// A path a practice copy may have: directly in the home folder, with a practice copy's name.
pub fn copy_path_ok(p: &Path, home: &Path) -> bool {
    p.is_absolute() && p.parent() == Some(home) && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with(&format!("{} ", copy_base())))
}

impl Record {
    /// What was read, checked like keys.json: an id not in the catalog, a path that is not a practice copy's place or a
    /// date that is not a day is dropped, and the file counts as damaged (a file that is not JSON reads as empty).
    pub fn parse(text: Option<&str>, home: &Path) -> (Record, bool) {
        let Some(text) = text else { return (Record::default(), false) };
        let Ok(v) = serde_json::from_str::<Value>(text) else { return (Record::default(), true) };
        let Some(rows) = v.get("practices").and_then(Value::as_object) else { return (Record::default(), true) };
        let (mut r, mut damaged) = (Record::default(), false);
        for (id, row) in rows {
            let ok = entries().iter().any(|e| &e.id == id);
            let p: Option<Progress> = serde_json::from_value(row.clone()).ok();
            let good = p.filter(|p| p.path.as_deref().is_none_or(|x| copy_path_ok(Path::new(x), home)) && [&p.started, &p.found, &p.done].iter().all(|d| d.as_deref().is_none_or(is_day)));
            match good { Some(p) if ok => { r.practices.insert(id.clone(), p); } _ => damaged = true }
        }
        (r, damaged)
    }
    pub fn to_text(&self) -> String { serde_json::to_string_pretty(&json!({ "version": 1, "practices": self.practices })).unwrap_or_default() }
    /// A new copy of this practice was made: its path, and the day. Once done, a practice stays done (a plain Done, rule 16).
    pub fn started(&mut self, id: &str, path: &Path, day: &str) {
        let p = self.practices.entry(id.to_string()).or_default();
        p.path = Some(path.to_string_lossy().to_string()); p.started = Some(day.to_string()); p.found = None;
    }
    /// The practice open in `current` reached a stage ("found" or "done"). Only for its own recorded copy.
    pub fn mark(&mut self, id: &str, stage: &str, day: &str, current: &Path) -> bool {
        let Some(p) = self.practices.get_mut(id) else { return false };
        if p.path.as_deref() != Some(&*current.to_string_lossy()) { return false; }
        match stage {
            "found" => { p.found.get_or_insert(day.to_string()); true }
            "done" => { p.found.get_or_insert(day.to_string()); p.done = Some(day.to_string()); true }
            _ => false,
        }
    }
    /// What the pages show: every practice in catalog order, its copy (and whether it is still there) and its dates.
    pub fn listed(&self) -> Value {
        let rows: Vec<Value> = entries().iter().map(|e| {
            let p = self.practices.get(&e.id).cloned().unwrap_or_default();
            let mut o = json!({ "id": e.id, "there": p.path.as_deref().is_some_and(|x| Path::new(x).is_dir()) });
            for (k, v) in [("path", &p.path), ("started", &p.started), ("found", &p.found), ("done", &p.done)] { if let Some(v) = v { o[k] = json!(v); } }
            o
        }).collect();
        json!({ "practices": rows })
    }
}

/// The copy that may go to the Trash for this practice: the recorded one, a real folder (never a link or a file) directly
/// in the home folder with a practice copy's name and Companion's mark in its house rules, and not the project open now
/// while something works on it.
pub fn removable(r: &Record, id: &str, home: &Path, current: &str, busy: bool) -> Result<PathBuf, String> {
    let path = r.practices.get(id).and_then(|p| p.path.clone()).ok_or("There is no practice copy to remove.".to_string())?;
    let p = PathBuf::from(&path);
    if !copy_path_ok(&p, home) { return Err("That folder is not a practice copy, so Companion leaves it alone.".into()); }
    let m = fs::symlink_metadata(&p).map_err(|_| "That practice copy is not there any more.".to_string())?;
    if !m.is_dir() || m.is_symlink() { return Err("That is not the practice copy Companion made, so Companion leaves it alone.".into()); }
    let ours = fs::symlink_metadata(p.join(".companion/rules.txt")).is_ok_and(|m| m.is_file()) && fs::read_to_string(p.join(".companion/rules.txt")).is_ok_and(|t| t.lines().next() == Some(RULES_MARK));
    if !ours { return Err("That folder does not look like the practice copy Companion made, so Companion leaves it alone.".into()); }
    if busy && current == path { return Err("Something is still working on this practice. Wait for it to finish, or press Stop.".into()); }
    Ok(p)
}

/// Remove my copy: moves it to the Trash (`trash`, the Mac's own, so it can be put back), then forgets its path. Done stays.
pub fn remove(r: &mut Record, id: &str, home: &Path, current: &str, busy: bool, trash: impl Fn(&Path) -> Result<(), String>) -> Result<PathBuf, String> {
    let p = removable(r, id, home, current, busy)?;
    trash(&p).map_err(|e| format!("The copy could not be moved to the Trash ({e}). It is still in your home folder."))?;
    if let Some(x) = r.practices.get_mut(id) { x.path = None; }
    Ok(p)
}

#[derive(Debug)]
pub struct Restarted { pub path: PathBuf, pub kept_old: Option<PathBuf> }
/// Start over: a fresh copy is made in a new folder first, and only when it is made does the old copy go to the Trash (the
/// person tapped Start over and confirmed it). So a copy that cannot be made leaves the old one where it was. If the Trash
/// refuses, the old copy is left exactly as it is.
#[allow(clippy::too_many_arguments)]
pub fn restart(r: &mut Record, e: &Entry, src: &Path, home: &Path, data: &Path, current: &str, busy: bool, day: &str, trash: impl Fn(&Path) -> Result<(), String>) -> Result<Restarted, String> {
    let recorded = r.practices.get(&e.id).and_then(|p| p.path.clone());
    if busy && recorded.as_deref() == Some(current) && !current.is_empty() { return Err("Something is still working on this practice. Wait for it to finish, or press Stop.".into()); }
    let old = removable(r, &e.id, home, current, busy);
    let path = make(src, home, e, taken(data))?;
    let kept_old = match old { Ok(old) => if trash(&old).is_ok() { None } else { Some(old) }, Err(_) => recorded.map(PathBuf::from).filter(|p| exists_at(p)) };
    r.started(&e.id, &path, day);
    Ok(Restarted { path, kept_old })
}

/// Records a copy that was just made. If the record cannot be saved (the data folder is full or not writable), the save is
/// tried once more, and then the new copy is taken away (`discard`, it has none of the person's work in it): a copy that no
/// list knows could never be removed or moved again.
pub fn save_or_discard(save: impl Fn() -> Result<(), String>, discard: impl FnOnce()) -> Result<(), String> {
    if save().is_ok() || save().is_ok() { return Ok(()); }
    discard();
    Err("Could not save your practice progress, so the new copy was not kept. Try again.".into())
}

/// A practice record that was read as damaged (a row it did not understand) is copied aside once as `practice.damaged.json`
/// before anything is saved over it, so one bad row never silently deletes the other rows for good.
pub fn keep_damaged(file: &Path, damaged: bool) {
    if !damaged { return; }
    if let Some(dir) = file.parent() { let aside = dir.join("practice.damaged.json"); if !aside.exists() { let _ = fs::copy(file, aside); } }
}

/// Every recorded copy still there, for "Move all my practice copies to the Trash" and Delete everything's opt in line.
pub fn copies(r: &Record, home: &Path) -> Vec<(String, PathBuf)> {
    entries().iter().filter_map(|e| r.practices.get(&e.id).and_then(|p| p.path.clone()).map(|x| (e.id.clone(), PathBuf::from(x)))).filter(|(_, p)| copy_path_ok(p, home) && p.is_dir()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(n: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-practice-{n}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); d }
    fn files_under(d: &Path) -> Vec<String> { let mut out = vec![]; for e in fs::read_dir(d).unwrap().flatten() { let p = e.path(); let n = e.file_name().to_string_lossy().to_string(); if p.is_dir() { for f in files_under(&p) { out.push(format!("{n}/{f}")); } } else { out.push(n); } } out.sort(); out }
    fn signup() -> &'static Entry { pick(Some("signup")).unwrap() }
    const D: &str = "2026-10-19";

    #[test]
    fn the_catalog_lists_all_five_in_order_and_each_folder_is_shipped() {
        let ids: Vec<&str> = entries().iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, ["signup", "setting", "route", "import", "open-table"]);
        for (i, e) in entries().iter().enumerate() {
            assert_eq!(e.order as usize, i + 1, "{}", e.id);
            assert!(Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample").join(&e.folder).join("package.json").is_file(), "{}", e.folder);
            assert!(!e.copy_name.is_empty() && !e.protect.is_empty(), "{}", e.id);
        }
        assert_eq!(first().id, "signup");
        assert_eq!(copy_base(), "Companion practice");
    }
    #[test]
    fn the_source_is_found_in_the_app_then_the_override_then_next_to_the_source() {
        let source = |exe: &Path, env: Option<&str>| source_of("stuck-signup", exe, env);
        let root = tmp("src");
        let app = root.join("Companion.app/Contents"); fs::create_dir_all(app.join("Resources/sample/stuck-signup")).unwrap(); fs::write(app.join("Resources/sample/stuck-signup/package.json"), "{}").unwrap();
        assert_eq!(source(&app.join("MacOS/companion-app"), None), Some(app.join("Resources/sample/stuck-signup")));
        let env = root.join("env"); fs::create_dir_all(env.join("stuck-signup")).unwrap(); fs::write(env.join("stuck-signup/package.json"), "{}").unwrap();
        assert_eq!(source(Path::new("/x/y/companion-app"), Some(env.to_str().unwrap())), Some(env.join("stuck-signup")));
        assert_eq!(source(Path::new("/nowhere/companion-app"), None), None);
        // a development build: <repo>/app/src-tauri/target/debug/companion-app, sample at <repo>/app/sample
        let dev = root.join("repo/app"); fs::create_dir_all(dev.join("sample/stuck-signup")).unwrap(); fs::write(dev.join("sample/stuck-signup/package.json"), "{}").unwrap();
        assert_eq!(source(&dev.join("src-tauri/target/debug/companion-app"), None), Some(dev.join("sample/stuck-signup")));
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn each_copy_is_named_after_its_practice_with_a_number_only_when_the_name_is_taken() {
        let h = Path::new("/Users/sam");
        assert_eq!(destination(h, signup(), |_| false), Some(h.join("Companion practice signup page")));
        assert_eq!(destination(h, signup(), |p| p.ends_with("Companion practice signup page")), Some(h.join("Companion practice signup page 2")));
        let route = pick(Some("route")).unwrap();
        assert_eq!(destination(h, route, |p| p.ends_with("Companion practice signup page")), Some(h.join("Companion practice missing page")));
        let names: Vec<PathBuf> = entries().iter().map(|e| destination(h, e, |_| false).unwrap()).collect();
        for (i, a) in names.iter().enumerate() { for b in &names[i + 1..] { assert_ne!(a, b); } }
    }
    #[test]
    fn a_name_with_undo_history_left_by_an_old_copy_counts_as_taken() {
        let root = tmp("hist"); let (home, data) = (root.join("home"), root.join("data")); fs::create_dir_all(&home).unwrap();
        let old = home.join("Companion practice signup page");
        fs::create_dir_all(shadow_of(&data, &old)).unwrap();   // the old copy is gone, but Companion still has its history
        assert!(taken(&data)(&old));
        assert!(!taken(&data)(&home.join("Companion practice signup page 2")));
        // the runner keeps a project's history under the first 16 characters of the sha256 of its path
        assert_eq!(shadow_of(Path::new("/d"), Path::new("/Users/sam/x")), PathBuf::from(format!("/d/runner/shadow/{}.git", &sha2::Sha256::digest(b"/Users/sam/x").iter().map(|b| format!("{b:02x}")).collect::<String>()[..16])));
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn copying_keeps_the_files_skips_links_and_never_writes_over_a_folder() {
        let root = tmp("copy");
        let src = root.join("src"); fs::create_dir_all(src.join("public")).unwrap(); fs::write(src.join("package.json"), "{}").unwrap(); fs::write(src.join("public/a.js"), "a").unwrap();
        std::os::unix::fs::symlink("/etc/hosts", src.join("link")).unwrap();
        let dst = root.join("dst");
        copy_tree(&src, &dst).unwrap();
        assert_eq!(fs::read_to_string(dst.join("public/a.js")).unwrap(), "a"); assert!(!dst.join("link").exists());
        assert!(copy_tree(&src, &dst).is_err());
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn making_it_needs_a_real_home_names_around_a_dangling_link_and_leaves_nothing_after_a_failure() {
        let root = tmp("make");
        let src = root.join("src"); fs::create_dir_all(&src).unwrap(); fs::write(src.join("package.json"), "{}").unwrap();
        assert!(make(&src, Path::new(""), signup(), exists_at).is_err()); assert!(make(&src, Path::new("relative"), signup(), exists_at).is_err());
        let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        std::os::unix::fs::symlink("/nowhere", home.join("Companion practice signup page")).unwrap();   // a link to nothing holds the first name
        let made = make(&src, &home, signup(), exists_at).unwrap();
        assert_eq!(made, home.join("Companion practice signup page 2")); assert!(made.join("package.json").is_file());
        // a source that cannot be copied leaves no half made folder
        let bad = root.join("missing");
        assert!(make(&bad, &home, signup(), exists_at).is_err());
        assert!(!home.join("Companion practice signup page 3").exists());
        let _ = fs::remove_dir_all(&root);
    }
    // Review fix (20 Oct 2026): names are never freed (an old copy's undo history keeps its name taken), and a copy that
    // failed used to remove its destination whatever the reason, even a folder that was already there.
    #[test]
    fn when_every_name_is_taken_nothing_is_made_and_a_folder_of_the_persons_is_never_touched() {
        let root = tmp("full"); let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        let src = root.join("src"); fs::create_dir_all(&src).unwrap(); fs::write(src.join("package.json"), "{}").unwrap();
        let theirs = home.join("Companion practice signup page"); fs::create_dir_all(&theirs).unwrap(); fs::write(theirs.join("mine.txt"), "mine").unwrap();
        assert_eq!(destination(&home, signup(), |_| true), None);
        let err = make(&src, &home, signup(), |_| true).unwrap_err();
        assert!(err.contains("name"), "{err}");
        assert_eq!(fs::read_dir(&home).unwrap().count(), 1);   // nothing new in the home folder
        assert_eq!(fs::read_to_string(theirs.join("mine.txt")).unwrap(), "mine");
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn a_folder_already_at_the_chosen_name_is_never_written_into_or_removed() {
        // `taken` says the name is free (the folder appeared a moment after the name was chosen): the copy refuses and leaves it.
        let root = tmp("raced"); let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-signup");
        let theirs = home.join("Companion practice signup page"); fs::create_dir_all(&theirs).unwrap(); fs::write(theirs.join("mine.txt"), "mine").unwrap();
        assert!(make(&src, &home, signup(), |_| false).is_err());
        assert_eq!(fs::read_to_string(theirs.join("mine.txt")).unwrap(), "mine");
        assert_eq!(fs::read_dir(&theirs).unwrap().count(), 1);   // nothing copied into it, no house rules written
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn the_copy_gets_a_house_rule_for_each_protected_file_and_nothing_else_is_added() {
        let root = tmp("rules"); let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-signup");
        let made = make(&src, &home, signup(), exists_at).unwrap();
        let rules = fs::read_to_string(made.join(".companion/rules.txt")).unwrap();
        assert_eq!(rules, format!("{RULES_MARK}\nnever edit test/signup.test.js\nnever edit package.json\n"));   // the test command is protected with the test (second audit)
        // Each line is a rule the engine enforces (the same reading as houserules.rs and runner/src/rules.ts).
        assert!(crate::houserules::rule_of("never edit test/signup.test.js").is_some());
        // byte for byte the sample, plus only that one file
        let mut want = files_under(&src); want.push(".companion/rules.txt".into()); want.sort();
        assert_eq!(files_under(&made), want);
        for f in files_under(&src) { assert_eq!(fs::read(src.join(&f)).unwrap(), fs::read(made.join(&f)).unwrap(), "{f}"); }
        let table = pick(Some("open-table")).unwrap();
        let t = make(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-open-table"), &home, table, exists_at).unwrap();
        assert!(fs::read_to_string(t.join(".companion/rules.txt")).unwrap().contains("never edit supabase/migrations/20261001090000_create_notes.sql\n"));
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn the_real_samples_are_complete() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample");
        let want: &[(&str, &[&str])] = &[
            ("stuck-signup", &["package.json", "server.js", "index.html", "public/signup.js", "test/signup.test.js"]),
            ("stuck-setting", &["package.json", "server.js", "settings.js", "README.md", "test/page.test.js"]),
            ("stuck-route", &["package.json", "server.js", "index.html", "pricing.html", "test/links.test.js"]),
            ("stuck-import", &["package.json", "server.js", "lib/money.js", "test/prices.test.js"]),
            ("stuck-open-table", &["package.json", "server.js", "index.html", "supabase/migrations/20261001090000_create_notes.sql", "supabase/migrations/20261002090000_create_profiles.sql"]),
        ];
        assert_eq!(want.len(), entries().len());
        for (folder, files) in want { for f in *files { assert!(base.join(folder).join(f).is_file(), "{folder}/{f}"); } }
        for e in entries() { for f in &e.protect { assert!(base.join(&e.folder).join(f).is_file(), "{} protects {f}", e.id); } }
    }
    #[test]
    fn a_page_may_choose_only_a_practice_in_the_catalog() {
        assert_eq!(pick(None).unwrap().id, "signup");
        for id in ["signup", "setting", "route", "import", "open-table"] { assert_eq!(pick(Some(id)).unwrap().id, id); }
        for bad in ["../signup", "/etc", "signup/../../x", "", "stuck-signup", "Setting", "open_table", "open-table ", "deploy"] { assert!(pick(Some(bad)).is_err(), "{bad}"); }
    }
    #[test]
    fn each_practice_is_found_the_same_way() {
        let root = tmp("names");
        let env = root.join("env");
        for e in entries() { fs::create_dir_all(env.join(&e.folder)).unwrap(); fs::write(env.join(&e.folder).join("package.json"), "{}").unwrap(); }
        for e in entries() { assert_eq!(source_of(&e.folder, Path::new("/x/y/companion-app"), Some(env.to_str().unwrap())), Some(env.join(&e.folder))); }
        let _ = fs::remove_dir_all(&root);
    }

    // ---------- the practice record (practice.json in Companion's own folder) ----------

    #[test]
    fn the_record_keeps_only_paths_and_dates_and_reads_back_what_it_wrote() {
        let home = Path::new("/Users/sam");
        let mut r = Record::default();
        r.started("signup", &home.join("Companion practice signup page"), D);
        assert!(r.mark("signup", "found", D, &home.join("Companion practice signup page")));
        assert!(r.mark("signup", "done", "2026-10-20", &home.join("Companion practice signup page")));
        let text = r.to_text();
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v, serde_json::json!({ "version": 1, "practices": { "signup": { "path": "/Users/sam/Companion practice signup page", "started": D, "found": D, "done": "2026-10-20" } } }));
        let (back, damaged) = Record::parse(Some(&text), home);
        assert!(!damaged); assert_eq!(back, r);
    }
    #[test]
    fn marking_counts_only_for_the_recorded_copy_and_a_stage_on_the_list() {
        let home = Path::new("/Users/sam"); let p = home.join("Companion practice signup page");
        let mut r = Record::default();
        assert!(!r.mark("signup", "found", D, &p));   // never started
        r.started("signup", &p, D);
        assert!(!r.mark("signup", "found", D, &home.join("Elsewhere")));
        assert!(!r.mark("signup", "praised", D, &p));
        assert!(!r.mark("route", "done", D, &p));
        assert!(r.mark("signup", "done", D, &p));
        assert_eq!(r.practices["signup"].found.as_deref(), Some(D));   // done means it was found too
    }
    #[test]
    fn a_fresh_copy_keeps_a_done_practice_done() {
        let home = Path::new("/Users/sam"); let p = home.join("Companion practice signup page");
        let mut r = Record::default(); r.started("signup", &p, D); r.mark("signup", "done", D, &p);
        r.started("signup", &home.join("Companion practice signup page 2"), "2026-10-21");
        let s = &r.practices["signup"];
        assert_eq!((s.path.as_deref(), s.found.as_deref(), s.done.as_deref()), (Some("/Users/sam/Companion practice signup page 2"), None, Some(D)));
    }
    #[test]
    fn the_record_is_checked_when_read_and_a_damaged_one_reads_as_empty() {
        let home = Path::new("/Users/sam");
        assert_eq!(Record::parse(None, home), (Record::default(), false));
        for bad in ["not json", "[]", "{\"practices\": 3}", "\u{0}"] { let (r, damaged) = Record::parse(Some(bad), home); assert!(damaged, "{bad}"); assert!(r.practices.is_empty()); }
        // An id not in the catalog, a path outside the home folder, a path that is not a practice copy's name and a date that
        // is not a date are each dropped; the rest stays.
        let text = r#"{"version":1,"practices":{
            "signup":{"path":"/Users/sam/Companion practice signup page","started":"2026-10-19"},
            "deploy":{"path":"/Users/sam/Companion practice deploy","started":"2026-10-19"},
            "route":{"path":"/etc","started":"2026-10-19"},
            "import":{"path":"/Users/sam/Projects/Companion practice renamed file","started":"2026-10-19"},
            "setting":{"path":"/Users/sam/My shop","started":"2026-10-19"},
            "open-table":{"path":"/Users/sam/Companion practice open table","started":"yesterday"}}}"#;
        let (r, damaged) = Record::parse(Some(text), home);
        assert!(damaged);
        assert_eq!(r.practices.keys().collect::<Vec<_>>(), ["signup"]);
    }
    #[test]
    fn the_list_says_for_each_practice_whether_its_copy_is_still_there() {
        let root = tmp("list"); let home = root.join("home"); fs::create_dir_all(home.join("Companion practice signup page")).unwrap();
        let mut r = Record::default();
        r.started("signup", &home.join("Companion practice signup page"), D);
        r.started("route", &home.join("Companion practice missing page"), D);
        let v = r.listed();
        let rows = v["practices"].as_array().unwrap();
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[0]["id"], "signup"); assert_eq!(rows[0]["there"], true);
        assert_eq!(rows[2]["id"], "route"); assert_eq!(rows[2]["there"], false);
        assert_eq!(rows[1]["id"], "setting"); assert!(rows[1].get("path").is_none());
        let _ = fs::remove_dir_all(&root);
    }

    // ---------- Remove my copy and Start over: to the Trash, only after a tap, never anything else ----------

    fn copy_for(home: &Path, id: &str) -> (Record, PathBuf) {
        let e = pick(Some(id)).unwrap();
        let p = make(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample").join(&e.folder), home, e, exists_at).unwrap();
        let mut r = Record::default(); r.started(id, &p, D);
        (r, p)
    }
    #[test]
    fn a_copy_can_be_removed_only_when_it_is_the_recorded_practice_copy_and_nothing_is_working_on_it() {
        let root = tmp("removable"); let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        let (r, p) = copy_for(&home, "signup");
        assert_eq!(removable(&r, "signup", &home, "", false), Ok(p.clone()));
        assert!(removable(&r, "signup", &home, p.to_str().unwrap(), false).is_ok());   // the current project, nothing running
        assert!(removable(&r, "signup", &home, p.to_str().unwrap(), true).is_err());   // the current project while a task runs
        assert!(removable(&r, "signup", &home, "/Users/sam/other", true).is_ok());   // busy on another project is fine
        assert!(removable(&r, "route", &home, "", false).is_err());   // no copy recorded
        assert!(removable(&r, "nope", &home, "", false).is_err());
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn a_folder_the_person_made_with_the_same_name_a_link_or_a_file_is_never_removed() {
        let root = tmp("notours"); let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        let p = home.join("Companion practice signup page");
        let mut r = Record::default(); r.started("signup", &p, D);
        fs::create_dir_all(&p).unwrap(); fs::write(p.join("notes.txt"), "mine").unwrap();   // the person's own folder, same name
        assert!(removable(&r, "signup", &home, "", false).is_err());
        fs::create_dir_all(p.join(".companion")).unwrap(); fs::write(p.join(".companion/rules.txt"), "never edit secrets.txt\n").unwrap();   // their own house rules
        assert!(removable(&r, "signup", &home, "", false).is_err());
        fs::remove_dir_all(&p).unwrap();
        let elsewhere = root.join("elsewhere"); fs::create_dir_all(elsewhere.join(".companion")).unwrap(); fs::write(elsewhere.join(".companion/rules.txt"), format!("{RULES_MARK}\n")).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &p).unwrap();   // a link with the copy's name
        assert!(removable(&r, "signup", &home, "", false).is_err());
        fs::remove_file(&p).unwrap(); fs::write(&p, "a file").unwrap();
        assert!(removable(&r, "signup", &home, "", false).is_err());
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn removing_moves_the_copy_to_the_trash_and_the_record_forgets_the_path_but_not_that_it_was_done() {
        let root = tmp("remove"); let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        let (mut r, p) = copy_for(&home, "signup"); r.mark("signup", "done", D, &p);
        let trash = root.join("Trash"); fs::create_dir_all(&trash).unwrap();
        let moved = remove(&mut r, "signup", &home, "", false, |x: &Path| fs::rename(x, trash.join(x.file_name().unwrap())).map_err(|e| e.to_string())).unwrap();
        assert_eq!(moved, p);
        assert!(!p.exists() && trash.join("Companion practice signup page/package.json").is_file());
        assert_eq!(r.practices["signup"].path, None); assert_eq!(r.practices["signup"].done.as_deref(), Some(D));
        // A refused Trash leaves the copy where it is, and the record still points at it.
        let (mut r2, p2) = copy_for(&home, "route");
        assert!(remove(&mut r2, "route", &home, "", false, |_: &Path| Err("no".into())).is_err());
        assert!(p2.join("package.json").is_file()); assert_eq!(r2.practices["route"].path.as_deref(), p2.to_str());
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn start_over_makes_a_fresh_copy_and_moves_the_old_one_to_the_trash_never_writing_over_it() {
        let root = tmp("restart"); let (home, data) = (root.join("home"), root.join("data")); fs::create_dir_all(&home).unwrap();
        let e = signup(); let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-signup");
        let (mut r, old) = copy_for(&home, "signup");
        fs::write(old.join("public/signup.js"), "fixed by the person").unwrap();
        fs::create_dir_all(shadow_of(&data, &old)).unwrap();   // Companion has undo history for the old copy
        let trash = root.join("Trash"); fs::create_dir_all(&trash).unwrap();
        let out = restart(&mut r, e, &src, &home, &data, "", false, "2026-10-20", |x: &Path| fs::rename(x, trash.join(x.file_name().unwrap())).map_err(|e| e.to_string())).unwrap();
        assert!(out.kept_old.is_none());
        assert_eq!(fs::read_to_string(trash.join("Companion practice signup page/public/signup.js")).unwrap(), "fixed by the person");
        // The fresh copy never takes over the old copy's undo history, so it gets the next name.
        assert_eq!(out.path, home.join("Companion practice signup page 2"));
        for f in files_under(&src) { assert_eq!(fs::read(src.join(&f)).unwrap(), fs::read(out.path.join(&f)).unwrap(), "{f}"); }
        assert_eq!(r.practices["signup"].path.as_deref(), out.path.to_str());
        // A refused Trash leaves both copies in place: the old one untouched, the new one fresh.
        let (mut r2, old2) = copy_for(&home, "import");
        fs::write(old2.join("server.js"), "mine").unwrap();
        let out2 = restart(&mut r2, pick(Some("import")).unwrap(), &Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-import"), &home, &data, "", false, D, |_: &Path| Err("no".into())).unwrap();
        assert_eq!(out2.kept_old.as_deref(), Some(old2.as_path()));
        assert_eq!(fs::read_to_string(old2.join("server.js")).unwrap(), "mine");
        assert_ne!(out2.path, old2); assert!(out2.path.join("server.js").is_file());
        // A fresh copy that cannot be made leaves the old one exactly where it was, in the home folder and in the record.
        let (mut r3, old3) = copy_for(&home, "route");
        fs::write(old3.join("server.js"), "mine too").unwrap();
        let before = r3.clone();
        let err = restart(&mut r3, pick(Some("route")).unwrap(), &root.join("no such source"), &home, &data, "", false, D, |x: &Path| fs::rename(x, trash.join("gone route")).map_err(|e| e.to_string())).unwrap_err();
        assert!(err.contains("Could not make"), "{err}");
        assert_eq!(fs::read_to_string(old3.join("server.js")).unwrap(), "mine too", "the old copy was not moved");
        assert!(!trash.join("gone route").exists());
        assert_eq!(r3, before, "the record still points at the old copy");
        // Never while something works on the copy that is open.
        assert!(restart(&mut r2, pick(Some("import")).unwrap(), &Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-import"), &home, &data, out2.path.to_str().unwrap(), true, D, |_: &Path| Ok(())).is_err());
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn a_copy_that_cannot_be_recorded_is_taken_away_and_a_damaged_record_is_kept_aside() {
        use std::cell::Cell;
        let (tries, gone) = (Cell::new(0), Cell::new(false));
        assert!(save_or_discard(|| { tries.set(tries.get() + 1); Ok(()) }, || gone.set(true)).is_ok());
        assert_eq!((tries.get(), gone.get()), (1, false));
        // One failure is retried.
        let n = Cell::new(0);
        assert!(save_or_discard(|| { n.set(n.get() + 1); if n.get() == 1 { Err("x".into()) } else { Ok(()) } }, || gone.set(true)).is_ok());
        assert!(!gone.get());
        // A save that keeps failing takes the new copy away and says so.
        let err = save_or_discard(|| Err("disk full".into()), || gone.set(true)).unwrap_err();
        assert!(gone.get() && err.contains("not kept"), "{err}");
        let root = tmp("damaged-record"); let f = root.join("practice.json");
        fs::write(&f, r#"{"practices":{"signup":{"path":"/etc/x"},"route":{}}}"#).unwrap();
        keep_damaged(&f, false);
        assert!(!root.join("practice.damaged.json").exists());
        keep_damaged(&f, true);
        assert!(fs::read_to_string(root.join("practice.damaged.json")).unwrap().contains("/etc/x"));
        fs::write(&f, "{}").unwrap();
        keep_damaged(&f, true);
        assert!(fs::read_to_string(root.join("practice.damaged.json")).unwrap().contains("/etc/x"), "the first damaged copy is not replaced by a later one");
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn the_copies_listed_for_removal_are_only_the_recorded_ones_still_there() {
        let root = tmp("all"); let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        let (mut r, p) = copy_for(&home, "signup");
        r.started("route", &home.join("Companion practice missing page"), D);   // recorded, but gone
        assert_eq!(copies(&r, &home), vec![("signup".to_string(), p)]);
        let _ = fs::remove_dir_all(&root);
    }

    // Review fix (20 Oct 2026): Next on a practice in progress made a second copy and the record forgot the first, so Remove
    // my copy, Move all and Delete everything's line could never reach it.
    #[test]
    fn a_practice_whose_copy_is_still_there_is_never_copied_again_so_the_record_never_loses_a_copy() {
        let root = tmp("again"); let (home, data) = (root.join("home"), root.join("data")); fs::create_dir_all(&home).unwrap();
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-signup");
        let (mut r, p) = copy_for(&home, "signup");
        let err = create(&mut r, signup(), &src, &home, &data, D).unwrap_err();
        assert!(err.contains("Continue") && err.contains("Start over"), "{err}");
        assert_eq!(r.practices["signup"].path.as_deref(), p.to_str());
        assert_eq!(fs::read_dir(&home).unwrap().count(), 1);   // no second copy
        // Once that copy is gone (removed, or moved away by the person), Start makes a fresh one and records it.
        fs::remove_dir_all(&p).unwrap();
        let made = create(&mut r, signup(), &src, &home, &data, "2026-10-20").unwrap();
        assert!(made.join("package.json").is_file());
        assert_eq!(r.practices["signup"].path.as_deref(), made.to_str());
        assert_eq!(r.practices["signup"].started.as_deref(), Some("2026-10-20"));
        // A practice never started is made at once, and its record has its own row.
        let route = create(&mut r, pick(Some("route")).unwrap(), &Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-route"), &home, &data, D).unwrap();
        assert_eq!(r.practices["route"].path.as_deref(), route.to_str());
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn the_shell_starts_a_practice_through_that_check_and_moves_copies_to_the_trash_only_once_the_engine_has_stopped() {
        let main = include_str!("main.rs");
        let body = |start: &str| { let s = &main[main.find(start).unwrap_or_else(|| panic!("{start}"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let c = body("fn create_practice(");
        assert!(c.contains("practice::create(") && !c.contains("practice::make("), "create_practice must refuse a practice whose copy is there");
        let d = body("async fn delete_everything(");
        let (spawned, stopped, trashed) = (d.find("helper.spawn()").unwrap(), d.find(".shut_down()").unwrap(), d.find("trash_practice_copies(").unwrap());
        assert!(spawned < stopped && stopped < trashed, "the cleanup starts (or is refused) first, then the engine stops, then the copies go");
    }
}
