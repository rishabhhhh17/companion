//! What Companion keeps on this Mac, and "delete everything".
//! Rules: only Companion's own folders are ever removed; a link is never followed; the developer settings file
//! (dev.json) stays; inside the person's projects only Companion's own `.companion` folder and its marked block in
//! AGENTS.md and CLAUDE.md go, every other line of those files stays exactly as it was.
//!
//! The Keychain items of Companion's own service (`keystore::service()`), exactly:
//! - `anthropic`, the person's Claude key: removed by the helper, last, and only when everything else went.
//! - `pro-license`, the Pro key (license.rs): removed only when the person answers yes to "Also turn off Pro on this
//!   Mac?". Then the app first lets this Mac's activation go at Dodo (`license::deactivate`, which deletes the item)
//!   before the helper starts; with no answer from Dodo nothing is deleted and the page says so. With no, the item
//!   stays and the screen names it. The helper itself never touches it.
//! - `pro-trial`, when the Pro trial started (trial.rs): always kept (payments spec section 10, Option 2, the founder's
//!   call of 31 Oct 2026), so a trial cannot restart by deleting everything. The screen names it. Removing it is a
//!   Keychain Access job, as for any honest user check.
//!
//! The free fix count lives in the engine's data folder (runner SQLite), so it goes with everything else and starts
//! again at 0; the screen says so. Questions about Pro appear only while payments are on (`pro_inventory`).
//!
//! Google connections live under their own service (google.rs `SERVICE`): the list of accounts and one item per account
//! holding its refresh token. The helper removes them all, just before the Claude key and under the same rule (only when
//! everything else went): each refresh token is first revoked at Google, best effort (with no answer from Google the item
//! still goes), then each item, then the list (google.rs `forget_all`). Otherwise the app, opened again, would trade the
//! kept tokens for new ones and Gmail, Calendar and Drive would work again for whoever uses this Mac next.
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

/// The marked block Companion adds to AGENTS.md and CLAUDE.md (see runner/src/memory/agentsmd.ts).
/// How a block opens, whatever name it was written under (the words after it name the product, and the product has been renamed once).
const BEGIN_MARK: &str = "<!-- companion:begin";
/// The whole opening line as the engine writes it now (runner/src/memory/agentsmd.ts), for the tests.
#[cfg(test)]
const BEGIN: &str = concat!("<!-- companion:begin (kept up to date by ", crate::product!(), "; delete this whole block to stop) -->");
const END: &str = "<!-- companion:end -->";

/// One thing Companion keeps, in the person's words.
#[derive(Debug, Clone, PartialEq)]
pub struct Item { pub id: &'static str, pub label: &'static str, pub paths: Vec<PathBuf> }

/// Which group a file or folder directly inside the runner's data folder belongs to.
fn runner_group(name: &str) -> &'static str {
    match name {
        // "claude": Claude Code's own folder on the API key route (saved task conversations), see runner/src/engines.ts.
        n if n.starts_with("tasks.db") || n.starts_with("ledger.db") || n == "claude" => "history",
        "shadow" => "undo",
        "receipts" | "work" => "pictures",
        n if n.starts_with("metrics.json") => "numbers",
        "walks" => "lessons",
        n if n.starts_with("spending.json") => "settings",   // the daily spending limit chosen in Settings
        n if n.starts_with("watch.") => "settings",   // the watch list (watch.json, watch.damaged.json) and its temporary files (F21)
        _ => "memory",
    }
}

/// Everything Companion keeps, grouped. `data` is `~/Library/Application Support/dev.companion.app`.
pub fn items(home: &Path, data: &Path) -> Vec<Item> {
    let mut groups: Vec<Item> = vec![
        Item { id: "history", label: "Your task history and spending record", paths: vec![] },
        Item { id: "undo", label: "The undo snapshots of your projects", paths: vec![] },
        Item { id: "pictures", label: "Receipt pictures and the it's live cards", paths: vec![] },
        Item { id: "numbers", label: "Your beta numbers (counts only, if you turned them on)", paths: vec![] },
        Item { id: "lessons", label: "Where you are in each guided lesson", paths: vec![] },
        Item { id: "practice", label: "Which practice projects you tried, and where their copies are", paths: vec![] },
        Item { id: "memory", label: concat!("What ", crate::product!(), " knows about you and your projects"), paths: vec![] },
        Item { id: "speech", label: "The speech model for hold to talk", paths: vec![data.join("models")] },
        Item { id: "browser", label: concat!("The hidden browser ", crate::product!(), " checks your pages with"), paths: vec![home.join("Library/Application Support/Companion/browsers")] },
        Item { id: "settings", label: "Settings, recent folders and the activity log", paths: vec![] },
    ];
    let mut add = |id: &str, p: PathBuf| { if let Some(g) = groups.iter_mut().find(|g| g.id == id) { g.paths.push(p); } };
    if let Ok(rd) = fs::read_dir(data.join("runner")) {
        for e in rd.flatten() { let n = e.file_name().to_string_lossy().to_string(); add(runner_group(&n), e.path()); }
    }
    if let Ok(rd) = fs::read_dir(data) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            // "runner" is grouped above, the speech model has its own group, and dev.json is the developer's own setup, not user data.
            if n == "runner" || n == "models" || n == "dev.json" { continue; }
            // The practice record (practice.rs): its own line. The copies it names are folders in the home folder, the
            // person's like any project, so they are never in a group; Delete everything moves them to the Trash only when
            // the person ticks that line.
            add(if n == "practice.json" || n.starts_with("practice.json.tmp") { "practice" } else { "settings" }, e.path());
        }
    }
    // What the page part of the app keeps (first run done, reactions, voice choices).
    for sub in ["Library/WebKit/dev.companion.app", "Library/Caches/dev.companion.app", "Library/HTTPStorages/dev.companion.app"] { add("settings", home.join(sub)); }
    groups
}

/// Size of a file or folder in bytes, never following a link.
pub fn size_of(p: &Path) -> u64 {
    let Ok(m) = fs::symlink_metadata(p) else { return 0 };
    if m.is_symlink() { return 0; }
    if m.is_file() { return m.len(); }
    fs::read_dir(p).map(|rd| rd.flatten().map(|e| size_of(&e.path())).sum()).unwrap_or(0)
}

/// A path may be removed only when it lies inside one of Companion's own places and is not one of those places' parents.
pub fn safe_to_remove(p: &Path, home: &Path, data: &Path) -> bool {
    let roots = [data.to_path_buf(), home.join("Library/Application Support/Companion/browsers"), home.join("Library/WebKit/dev.companion.app"), home.join("Library/Caches/dev.companion.app"), home.join("Library/HTTPStorages/dev.companion.app")];
    home.is_absolute() && data.is_absolute() && roots.iter().any(|r| p == r || p.starts_with(r)) && p != home && p != data.parent().unwrap_or(Path::new("/")) && !p.components().any(|c| c.as_os_str() == "..") && p.file_name().is_some_and(|n| n != "dev.json")
}

/// Removes one path (a file, or a folder and everything in it) without following links. True when it is gone.
fn remove_path(p: &Path) -> Result<(), String> {
    match fs::symlink_metadata(p) {
        Err(_) => Ok(()),   // already gone
        Ok(m) if m.is_dir() && !m.is_symlink() => fs::remove_dir_all(p).map_err(|e| e.to_string()),
        Ok(_) => fs::remove_file(p).map_err(|e| e.to_string()),
    }
}

/// What the page shows before anything is deleted: each group, what it holds in bytes, and whether a key is saved.
pub fn inventory(home: &Path, data: &Path, key_saved: bool, projects: &[PathBuf]) -> Value {
    let rows: Vec<Value> = items(home, data).iter().map(|i| json!({ "id": i.id, "label": i.label, "bytes": i.paths.iter().filter(|p| safe_to_remove(p, home, data)).map(|p| size_of(p)).sum::<u64>() })).filter(|r| r["bytes"].as_u64().unwrap_or(0) > 0).collect();
    let with_notes = projects.iter().filter(|p| project_has_ours(p)).count();
    json!({ "items": rows, "keySaved": key_saved, "projectsWithNotes": with_notes, "receiptPictures": receipt_pictures(data) })
}

/// What the Delete everything screen says about Pro: nothing at all while payments are off (no Keychain look, the screen
/// is as it was before Pro). With payments on: whether a Pro key is saved (the screen asks "Also turn off Pro on this
/// Mac?" and names the key when the answer is no), whether the trial's start is kept (always kept, and named), and that
/// the free fix count starts again.
pub fn pro_inventory(payments_on: bool, key_saved: impl FnOnce() -> bool, trial_kept: impl FnOnce() -> bool) -> Value {
    if !payments_on { return Value::Null; }
    json!({ "keySaved": key_saved(), "trialKept": trial_kept(), "fixCountResets": true })
}

/// How many receipt pictures are kept (plain .jpg files in the runner's receipts folder, never through a link), so that
/// lowering "Pictures to keep" in Settings can say first how many will go.
pub fn receipt_pictures(data: &Path) -> usize {
    fs::read_dir(data.join("runner/receipts")).map(|rd| rd.flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".jpg") && fs::symlink_metadata(e.path()).is_ok_and(|m| m.file_type().is_file())).count()).unwrap_or(0)
}

/// Removes every group (the developer settings file stays). Returns the groups removed and any that could not be.
pub fn erase(home: &Path, data: &Path) -> (Vec<String>, Vec<String>) {
    let (mut done, mut failed) = (vec![], vec![]);
    for item in items(home, data) {
        let mut ok = true;
        for p in &item.paths {
            if !safe_to_remove(p, home, data) { ok = false; continue; }
            if remove_path(p).is_err() { ok = false; }
        }
        // The folder above Companion's browsers is named like the product, and macOS ignores capital letters in names: it is
        // only removed if nothing else is in it (another product with the same name keeps its data).
        if item.id == "browser" { if let Some(parent) = home.join("Library/Application Support/Companion").canonicalize().ok().or_else(|| Some(home.join("Library/Application Support/Companion"))) { let _ = fs::remove_dir(parent); } }
        if ok { done.push(item.label.to_string()); } else { failed.push(item.label.to_string()); }
    }
    (done, failed)
}

// ---------- inside the person's projects ----------

/// The text without Companion's marked block (every one, if there are several); every other line is exactly as it was,
/// with the file's own line endings. None when there is no block.
pub fn remove_block(text: &str) -> Option<String> {
    let nl = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut cur = text.to_string();
    let mut found = false;
    while let Some(a) = cur.find(BEGIN_MARK) {
        let Some(end) = cur[a..].find(END).map(|i| a + i + END.len()) else { break };
        found = true;
        let mut out = String::new();
        out.push_str(cur[..a].trim_end_matches(['\n', '\r']));
        let rest = cur[end..].trim_start_matches(['\n', '\r']);
        if !out.is_empty() && !rest.is_empty() { out.push_str(nl); out.push_str(nl); }
        out.push_str(rest);
        if !out.is_empty() && !out.ends_with('\n') { out.push_str(nl); }
        cur = out;
    }
    if found { Some(cur) } else { None }
}

/// The files and folders Companion itself writes inside a project's `.companion` folder. `rules.txt` is the person's own
/// list of house rules, so it is never in this list.
const OURS_IN_DOT: &[&str] = &["project.md", "ships.json", "research"];

pub fn project_has_ours(project: &Path) -> bool {
    let dot = project.join(".companion");
    if fs::symlink_metadata(&dot).is_ok_and(|m| m.is_dir() && !m.is_symlink()) && OURS_IN_DOT.iter().any(|n| fs::symlink_metadata(dot.join(n)).is_ok()) { return true; }
    ["AGENTS.md", "CLAUDE.md"].iter().any(|f| fs::read_to_string(project.join(f)).is_ok_and(|t| t.contains(BEGIN_MARK)))
}

/// Writes a file next to `target` under a random name, then renames it over the target: a link planted at the temporary
/// name is never written through, the file's permissions are kept, and a half written file is never left.
pub(crate) fn replace_file(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let mut tag = [0u8; 6];
    let _ = fs::File::open("/dev/urandom").and_then(|mut f| std::io::Read::read_exact(&mut f, &mut tag));
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = target.with_file_name(format!(".{name}.{}.companion-tmp", tag.iter().map(|b| format!("{b:02x}")).collect::<String>()));
    let mode = fs::metadata(target).map(|m| m.permissions().mode() & 0o7777).unwrap_or(0o644);
    let result = (|| {
        let mut f = fs::OpenOptions::new().write(true).create_new(true).custom_flags(0x0100 /* O_NOFOLLOW */).mode(mode).open(&tmp)?;
        f.write_all(bytes)?; f.sync_all()?;
        fs::rename(&tmp, target)
    })();
    if result.is_err() { let _ = fs::remove_file(&tmp); }
    result
}

/// Takes Companion's own notes out of one project: what Companion wrote in its `.companion` folder (the person's
/// `rules.txt` stays, and the folder goes only if nothing is left in it) and the marked block in AGENTS.md and CLAUDE.md.
/// Files Companion created are left in place (they may hold the person's own words now). Never touches anything else,
/// never the project's git. Returns what was removed, in plain words.
pub fn clean_project(project: &Path) -> Vec<String> {
    let mut said = vec![];
    let dot = project.join(".companion");
    if fs::symlink_metadata(&dot).is_ok_and(|m| m.is_dir() && !m.is_symlink()) {
        let mut removed = false;
        for n in OURS_IN_DOT { if fs::symlink_metadata(dot.join(n)).is_ok() && remove_path(&dot.join(n)).is_ok() { removed = true; } }
        if removed { said.push(concat!(crate::product_s!(), " notes in the .companion folder").into()); }
        let _ = fs::remove_dir(&dot);   // only if empty: the person's rules.txt keeps it
        if dot.exists() { said.push("kept your rules.txt".into()); }
    }
    for f in ["AGENTS.md", "CLAUDE.md"] {
        let p = project.join(f);
        if !fs::symlink_metadata(&p).is_ok_and(|m| m.is_file() && !m.is_symlink()) { continue; }
        let Ok(text) = fs::read_to_string(&p) else { continue };
        if let Some(next) = remove_block(&text) { if replace_file(&p, next.as_bytes()).is_ok() { said.push(format!(concat!(crate::product_s!(), " block in {f}"), f = f)); } }
    }
    said
}

// ---------- the helper that does the wipe after the app has quit ----------

/// What the helper process does, in order, with every outside effect passed in so it can be tested. The app is gone, so
/// nothing is holding or rewriting the files. Returns the groups that could not be removed (after three tries).
pub struct Helper<'a> {
    pub parent_gone: &'a dyn Fn() -> bool,
    pub delete_key: &'a dyn Fn() -> bool,
    /// Revokes every Google connection at Google (best effort) and removes its Keychain items (google.rs forget_all).
    pub delete_google: &'a dyn Fn() -> bool,
    pub relaunch: &'a dyn Fn(),
    pub wait: &'a dyn Fn(),
}
pub fn run_helper(home: &Path, data: &Path, projects: &[PathBuf], with_projects: bool, h: &Helper) -> Vec<String> {
    let mut gone = false;
    for _ in 0..200 { if (h.parent_gone)() { gone = true; break; } (h.wait)(); }
    // The app is still running (it is slow to close, or hung): deleting under it could leave a half wipe or be written over
    // again, so nothing is deleted. The person is told on the next start, and nothing else of theirs changes.
    if !gone {
        let _ = fs::create_dir_all(data);
        let _ = fs::write(data.join("wipe-note.txt"), concat!(crate::product!(), " did not close in time, so nothing was deleted. Quit ", crate::product!(), ", then use Settings, Delete everything again."));
        return vec![concat!(crate::product!(), " did not close in time").to_string()];
    }
    if with_projects { for p in projects { let _ = clean_project(p); } }
    // M76: the done signal hooks (M75) are Squibby's machinery in another tool's settings, not notes, so they go whether or
    // not the notes box was ticked: every project the engine's own index names, and the recent folders. This runs before the
    // data folder goes, since the index that says which files Squibby made is in it (donehooks.rs).
    let runner_data = data.join("runner");
    let mut hooked = crate::donehooks::projects_with_hooks(&runner_data);
    for p in projects { if !hooked.contains(p) { hooked.push(p.clone()); } }
    for p in &hooked { let _ = crate::donehooks::remove(p, &runner_data); }
    let mut failed = vec![];
    for _ in 0..3 {
        failed = erase(home, data).1;
        if failed.is_empty() { break; }
        (h.wait)();
    }
    // The key goes only when everything else did, so a half finished wipe never leaves the app without its key. The
    // Google connections go just before it.
    if failed.is_empty() && !(h.delete_google)() {
        let _ = fs::create_dir_all(data);
        let _ = fs::write(data.join("wipe-note.txt"), "Everything else was deleted, but your Google connections could not all be removed from the Keychain, so your saved Claude key was kept too. Use Settings, Delete everything again, or disconnect each Google account in Settings.");
        failed.push("your Google connections".to_string());
    } else if failed.is_empty() {
        if !(h.delete_key)() {
            // A key that could not be removed must not be reported as deleted.
            let _ = fs::create_dir_all(data);
            let _ = fs::write(data.join("wipe-note.txt"), "Everything else was deleted, but your saved Claude key could not be removed from the Keychain. Open Keychain Access, search for \"companion\", and delete it, or use Settings, Delete everything again.");
            failed.push("your saved key".to_string());
        }
    } else {
        // Told to the person on the next start, because the data folder is where the note has to live.
        let _ = fs::create_dir_all(data);
        let _ = fs::write(data.join("wipe-note.txt"), format!(concat!("Some of what ", crate::product!(), " keeps could not be deleted: {}. Quit ", crate::product!(), " and use Settings, Delete everything again."), failed.join(", ")));
    }
    (h.relaunch)();
    failed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir_all, write};

    struct Mac { root: PathBuf, home: PathBuf, data: PathBuf }
    impl Drop for Mac { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); } }
    fn mac(name: &str) -> Mac {
        let root = std::env::temp_dir().join(format!("companion-wipe-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let home = root.join("home"); let data = home.join("Library/Application Support/dev.companion.app");
        create_dir_all(data.join("runner/shadow/x")).unwrap(); create_dir_all(data.join("runner/receipts")).unwrap(); create_dir_all(data.join("models")).unwrap();
        create_dir_all(home.join("Library/Application Support/Companion/browsers")).unwrap();
        write(data.join("runner/tasks.db"), "t").unwrap(); write(data.join("runner/ledger.db-wal"), "l").unwrap(); write(data.join("runner/profile.md"), "- likes short answers").unwrap();
        write(data.join("runner/receipts/a.jpg"), "jpeg").unwrap(); write(data.join("runner/shadow/x/obj"), "snap").unwrap();
        write(data.join("models/ggml-base.bin"), vec![0u8; 1000]).unwrap(); write(data.join("dock.json"), "{}").unwrap(); write(data.join("events.jsonl"), "{}\n").unwrap(); write(data.join("dev.json"), "{\"project\":\"/x\"}").unwrap();
        write(home.join("Library/Application Support/Companion/browsers/chrome"), "big").unwrap();
        Mac { root, home, data }
    }

    #[test]
    fn claude_codes_saved_conversations_are_task_history_and_are_removed() {
        // On the API key route the runner points Claude Code's own folder at runner/claude (runner/src/engines.ts).
        assert_eq!(runner_group("claude"), "history");
        let m = mac("claude");
        create_dir_all(m.data.join("runner/claude/projects/-Users-x-site")).unwrap();
        write(m.data.join("runner/claude/projects/-Users-x-site/s1.jsonl"), "{\"prompt\":\"make the page\"}\n").unwrap();
        write(m.data.join("runner/claude/.claude.json"), "{}").unwrap();
        let g = items(&m.home, &m.data);
        assert!(g.iter().find(|i| i.id == "history").unwrap().paths.iter().any(|p| p.ends_with("runner/claude")));
        let (_, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!m.data.join("runner/claude").exists());
    }
    #[test]
    fn beta_numbers_and_lesson_places_are_listed_and_removed_with_everything_else() {
        assert_eq!(runner_group("metrics.json"), "numbers");
        assert_eq!(runner_group("metrics.json.123.tmp"), "numbers");
        assert_eq!(runner_group("walks"), "lessons");
        assert_eq!(runner_group("memory-profile.json"), "memory");
    }
    #[test]
    fn the_daily_spending_limit_is_listed_as_a_setting_and_removed_with_everything_else() {
        assert_eq!(runner_group("spending.json"), "settings");
        assert_eq!(runner_group("spending.json.123.tmp"), "settings");
        let m = mac("spending");
        write(m.data.join("runner/spending.json"), "{\"dailyLimitUsd\":25}").unwrap();
        let g = items(&m.home, &m.data);
        assert!(g.iter().find(|i| i.id == "settings").unwrap().paths.iter().any(|p| p.ends_with("runner/spending.json")));
        assert!(!g.iter().find(|i| i.id == "memory").unwrap().paths.iter().any(|p| p.ends_with("spending.json")));
        let (_, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!m.data.join("runner/spending.json").exists());
    }
    #[test]
    fn the_watch_list_is_listed_as_a_setting_and_removed_with_everything_else() {
        for n in ["watch.json", "watch.damaged.json", "watch.json.1a2b3c4d.tmp"] { assert_eq!(runner_group(n), "settings", "{n}"); }
        let m = mac("watch");
        write(m.data.join("runner/watch.json"), "{\"version\":1,\"watches\":[]}").unwrap();
        write(m.data.join("runner/watch.damaged.json"), "{").unwrap();
        let g = items(&m.home, &m.data);
        assert!(g.iter().find(|i| i.id == "settings").unwrap().paths.iter().any(|p| p.ends_with("runner/watch.json")));
        assert!(!g.iter().find(|i| i.id == "memory").unwrap().paths.iter().any(|p| p.ends_with("watch.json")));
        let (_, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!m.data.join("runner/watch.json").exists() && !m.data.join("runner/watch.damaged.json").exists());
    }
    #[test]
    fn the_keys_picked_in_settings_are_listed_as_a_setting_and_removed_with_everything_else() {
        // keymap.rs keeps every job's keys in one file, and reads hold to talk's from before when there is no new one yet.
        let m = mac("keys");
        for f in [crate::keymap::FILE, crate::keymap::OLD_TALK_FILE] { write(m.data.join(f), "{}").unwrap(); }
        let g = items(&m.home, &m.data);
        let settings = &g.iter().find(|i| i.id == "settings").unwrap().paths;
        for f in [crate::keymap::FILE, crate::keymap::OLD_TALK_FILE] { assert!(settings.iter().any(|p| p.ends_with(f)), "{f}"); }
        let (_, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}");
        for f in [crate::keymap::FILE, crate::keymap::OLD_TALK_FILE] { assert!(!m.data.join(f).exists(), "{f}"); }
    }
    #[test]
    fn the_settings_file_and_its_damaged_copy_are_settings_and_go_with_everything_else() {
        // settings.rs (T16) keeps every choice in settings.json, and moves a damaged one aside for support.
        let m = mac("registry");
        for f in [crate::settings::FILE, crate::settings::DAMAGED] { write(m.data.join(f), "{}").unwrap(); }
        let g = items(&m.home, &m.data);
        let settings = &g.iter().find(|i| i.id == "settings").unwrap().paths;
        for f in [crate::settings::FILE, crate::settings::DAMAGED] { assert!(settings.iter().any(|p| p.ends_with(f)), "{f}"); }
        let (_, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}");
        for f in [crate::settings::FILE, crate::settings::DAMAGED] { assert!(!m.data.join(f).exists(), "{f}"); }
        assert!(m.data.join("dev.json").exists(), "the developer's own file stays");
    }
    #[test]
    fn the_practice_record_is_its_own_line_and_goes_with_everything_else_while_the_copies_stay_in_the_home_folder() {
        // practice.rs keeps which practices were tried and where their copies are (practice.json in Companion's folder).
        let m = mac("practice");
        write(m.data.join("practice.json"), "{}").unwrap();
        let copy = m.home.join(concat!(crate::practice_base!(), " signup page")); create_dir_all(&copy).unwrap(); write(copy.join("package.json"), "{}").unwrap();
        let g = items(&m.home, &m.data);
        let practice = g.iter().find(|i| i.id == "practice").unwrap();
        assert_eq!(practice.paths, vec![m.data.join("practice.json")]);
        assert!(!g.iter().find(|i| i.id == "settings").unwrap().paths.iter().any(|p| p.ends_with("practice.json")));
        assert!(!g.iter().any(|i| i.paths.iter().any(|p| p.starts_with(&copy))), "a practice copy is the person's folder: never in a group");
        let (_, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!m.data.join("practice.json").exists());
        assert!(copy.join("package.json").is_file(), "Delete everything moves copies to the Trash only when the person ticks that line");
    }
    #[test]
    fn everything_is_grouped_in_the_persons_words_and_dev_json_is_not_among_it() {
        let m = mac("group");
        let g = items(&m.home, &m.data);
        let by = |id: &str| g.iter().find(|i| i.id == id).unwrap().paths.iter().map(|p| p.file_name().unwrap().to_string_lossy().to_string()).collect::<Vec<_>>();
        let (mut history, undo, pictures, memory, settings) = (by("history"), by("undo"), by("pictures"), by("memory"), by("settings"));
        history.sort();
        assert_eq!(history, vec!["ledger.db-wal", "tasks.db"]); assert_eq!(undo, vec!["shadow"]); assert_eq!(pictures, vec!["receipts"]); assert_eq!(memory, vec!["profile.md"]);
        assert!(settings.contains(&"dock.json".to_string()) && settings.contains(&"events.jsonl".to_string()));
        assert!(!g.iter().any(|i| i.paths.iter().any(|p| p.ends_with("dev.json"))));
    }
    #[test]
    fn the_inventory_shows_sizes_and_skips_empty_groups() {
        let m = mac("inv");
        let v = inventory(&m.home, &m.data, true, &[]);
        let rows = v["items"].as_array().unwrap();
        assert!(rows.iter().any(|r| r["id"] == "speech" && r["bytes"] == 1000));
        assert!(rows.iter().all(|r| r["bytes"].as_u64().unwrap() > 0));
        assert_eq!(v["keySaved"], true);
    }
    #[test]
    fn the_inventory_counts_the_receipt_pictures_so_lowering_pictures_to_keep_can_say_how_many_go() {
        let m = mac("pics");
        for n in ["b.jpg", "c.jpg", "note.txt"] { write(m.data.join("runner/receipts").join(n), "x").unwrap(); }
        create_dir_all(m.data.join("runner/receipts/sub.jpg")).unwrap();
        assert_eq!(inventory(&m.home, &m.data, false, &[])["receiptPictures"], 3);
        #[cfg(unix)] {
            // A link is never followed, and never counted.
            std::os::unix::fs::symlink(m.data.join("runner/receipts/a.jpg"), m.data.join("runner/receipts/link.jpg")).unwrap();
            assert_eq!(inventory(&m.home, &m.data, false, &[])["receiptPictures"], 3);
        }
        fs::remove_dir_all(m.data.join("runner/receipts")).unwrap();
        assert_eq!(inventory(&m.home, &m.data, false, &[])["receiptPictures"], 0);
    }
    #[test]
    fn erasing_removes_every_group_but_keeps_dev_json_and_never_leaves_companions_own_places() {
        let m = mac("erase");
        let (done, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}"); assert!(done.len() >= 6);
        assert!(!m.data.join("runner/tasks.db").exists() && !m.data.join("runner/shadow").exists() && !m.data.join("models").exists() && !m.data.join("dock.json").exists());
        assert!(!m.home.join("Library/Application Support/Companion/browsers").exists());
        assert!(m.data.join("dev.json").exists());
        assert!(m.home.exists());   // the home folder itself is never touched
    }
    #[test]
    fn nothing_outside_companions_places_is_ever_removable() {
        let m = mac("safe");
        for bad in [m.home.clone(), m.home.join("Documents"), m.home.join("Library"), m.home.join("Library/Application Support"), m.data.parent().unwrap().to_path_buf(), PathBuf::from("/"), PathBuf::from("/Applications"), m.data.join("../../Documents"), m.data.join("dev.json")] {
            assert!(!safe_to_remove(&bad, &m.home, &m.data), "{bad:?}");
        }
        assert!(safe_to_remove(&m.data.join("runner/tasks.db"), &m.home, &m.data));
    }
    #[test]
    fn a_link_inside_companions_folder_is_removed_as_a_link_and_never_followed() {
        let m = mac("link");
        let outside = m.root.join("outside"); create_dir_all(&outside).unwrap(); write(outside.join("precious.txt"), "mine").unwrap();
        std::os::unix::fs::symlink(&outside, m.data.join("runner/receipts/escape")).unwrap();
        std::os::unix::fs::symlink(&outside, m.data.join("linked")).unwrap();
        assert_eq!(size_of(&m.data.join("linked")), 0);
        erase(&m.home, &m.data);
        assert!(outside.join("precious.txt").exists());
        assert!(!m.data.join("linked").exists());
    }
    #[test]
    fn the_marked_block_goes_and_every_other_line_stays_exactly() {
        let text = format!(concat!("# My rules\n\nUse tabs.\n\n{BEGIN}\n## Project notes (from ", crate::product!(), ")\n- Uses Vite\n{END}\n\n## Other\nKeep it short.\n"), BEGIN = BEGIN, END = END);
        assert_eq!(remove_block(&text).unwrap(), "# My rules\n\nUse tabs.\n\n## Other\nKeep it short.\n");
        assert_eq!(remove_block(&format!("Before\n{BEGIN}\nx\n{END}\n")).unwrap(), "Before\n");
        assert_eq!(remove_block(&format!("{BEGIN}\n@AGENTS.md\n{END}\n")).unwrap(), "");
        assert!(remove_block("no block here\n").is_none());
        assert!(remove_block(&format!("{BEGIN} but never closed")).is_none());
    }
    #[test]
    fn a_block_written_under_the_earlier_name_is_still_ours_to_remove() {
        let old = "<!-- companion:begin (kept up to date by Companion; delete this whole block to stop) -->";
        assert_eq!(remove_block(&format!("Mine\n\n{old}\n- fact\n{END}\n")).unwrap(), "Mine\n");
    }
    #[test]
    fn cleaning_a_project_removes_only_what_companion_wrote_and_keeps_the_persons_rules() {
        let m = mac("proj");
        let p = m.root.join("site"); create_dir_all(p.join(".companion/research")).unwrap(); create_dir_all(p.join("src")).unwrap();
        write(p.join(".companion/project.md"), "- fact").unwrap(); write(p.join(".companion/ships.json"), "[]").unwrap(); write(p.join(".companion/research/a.md"), "notes").unwrap();
        write(p.join(".companion/rules.txt"), "Never delete the database").unwrap();
        write(p.join("src/app.js"), "code").unwrap(); write(p.join(".gitignore"), "node_modules\n").unwrap();
        write(p.join("AGENTS.md"), format!("# Mine\n\n{BEGIN}\n- fact\n{END}\n")).unwrap();
        write(p.join("CLAUDE.md"), "@AGENTS.md\n").unwrap();   // no block: never changed
        assert!(project_has_ours(&p));
        let said = clean_project(&p);
        assert_eq!(said, vec![concat!(crate::product_s!(), " notes in the .companion folder").to_string(), "kept your rules.txt".to_string(), concat!(crate::product_s!(), " block in AGENTS.md").to_string()]);
        assert!(!p.join(".companion/project.md").exists() && !p.join(".companion/research").exists() && !p.join(".companion/ships.json").exists());
        assert_eq!(fs::read_to_string(p.join(".companion/rules.txt")).unwrap(), "Never delete the database");
        assert_eq!(fs::read_to_string(p.join("AGENTS.md")).unwrap(), "# Mine\n");
        assert_eq!(fs::read_to_string(p.join("CLAUDE.md")).unwrap(), "@AGENTS.md\n");
        assert_eq!(fs::read_to_string(p.join("src/app.js")).unwrap(), "code"); assert_eq!(fs::read_to_string(p.join(".gitignore")).unwrap(), "node_modules\n");
        assert!(!project_has_ours(&p));
    }
    #[test]
    fn the_companion_folder_goes_when_only_companions_files_were_in_it() {
        let m = mac("proj2");
        let p = m.root.join("site3"); create_dir_all(p.join(".companion")).unwrap(); write(p.join(".companion/project.md"), "- fact").unwrap();
        clean_project(&p);
        assert!(!p.join(".companion").exists());
    }
    #[test]
    fn windows_line_endings_and_several_blocks_are_handled() {
        let crlf = format!("# Mine\r\n\r\n{BEGIN}\r\n- a\r\n{END}\r\n\r\nKeep\r\n");
        assert_eq!(remove_block(&crlf).unwrap(), "# Mine\r\n\r\nKeep\r\n");
        let two = format!("One\n{BEGIN}\nx\n{END}\nTwo\n{BEGIN}\ny\n{END}\nThree\n");
        let out = remove_block(&two).unwrap();
        assert!(!out.contains("companion:begin") && out.contains("One") && out.contains("Two") && out.contains("Three"));
    }
    #[test]
    fn a_link_planted_at_the_temporary_name_is_never_written_through() {
        let m = mac("tmp-link");
        let p = m.root.join("site4"); create_dir_all(&p).unwrap();
        let victim = m.root.join("zshrc"); write(&victim, "export PATH=1").unwrap();
        write(p.join("AGENTS.md"), format!("A\n{BEGIN}\nx\n{END}\n")).unwrap();
        std::os::unix::fs::symlink(&victim, p.join("AGENTS.companion-tmp")).unwrap();
        std::os::unix::fs::symlink(&victim, p.join(".AGENTS.md.000000000000.companion-tmp")).unwrap();
        clean_project(&p);
        assert_eq!(fs::read_to_string(&victim).unwrap(), "export PATH=1");
        assert_eq!(fs::read_to_string(p.join("AGENTS.md")).unwrap(), "A\n");
    }
    #[test]
    fn a_files_permissions_survive_the_edit() {
        use std::os::unix::fs::PermissionsExt;
        let m = mac("perm");
        let p = m.root.join("site5"); create_dir_all(&p).unwrap();
        write(p.join("AGENTS.md"), format!("A\n{BEGIN}\nx\n{END}\n")).unwrap();
        fs::set_permissions(p.join("AGENTS.md"), fs::Permissions::from_mode(0o600)).unwrap();
        clean_project(&p);
        assert_eq!(fs::metadata(p.join("AGENTS.md")).unwrap().permissions().mode() & 0o777, 0o600);
    }
    #[test]
    fn a_relative_or_missing_home_never_lets_anything_be_removed() {
        let m = mac("rel");
        assert!(!safe_to_remove(&PathBuf::from("Library/Application Support/dev.companion.app/x"), Path::new(""), Path::new("Library/Application Support/dev.companion.app")));
        assert!(!safe_to_remove(&m.data.join("runner/tasks.db"), Path::new(""), &m.data));
    }
    #[test]
    fn the_helper_waits_for_the_app_to_quit_wipes_deletes_the_key_last_and_opens_the_app_again() {
        use std::cell::RefCell;
        let m = mac("helper");
        let p = m.root.join("site6"); create_dir_all(p.join(".companion")).unwrap(); write(p.join(".companion/project.md"), "x").unwrap();
        let log = RefCell::new(Vec::<String>::new()); let polls = RefCell::new(0);
        let failed = run_helper(&m.home, &m.data, std::slice::from_ref(&p), true, &Helper {
            parent_gone: &|| { *polls.borrow_mut() += 1; *polls.borrow() > 3 }, delete_key: &|| { log.borrow_mut().push("key".into()); true }, delete_google: &|| { log.borrow_mut().push("google".into()); true }, relaunch: &|| log.borrow_mut().push("relaunch".into()), wait: &|| {},
        });
        assert!(failed.is_empty());
        assert_eq!(*polls.borrow(), 4);   // it kept waiting until the app had gone
        assert_eq!(*log.borrow(), vec!["google", "key", "relaunch"], "Google connections go too, and the Claude key last");
        assert!(!m.data.join("runner/tasks.db").exists() && !p.join(".companion").exists() && m.data.join("dev.json").exists());
    }
    #[test]
    fn a_helper_that_gives_up_waiting_for_the_app_deletes_nothing_and_leaves_a_note() {
        use std::cell::RefCell;
        let m = mac("helper-wait");
        let p = m.root.join("site7"); create_dir_all(p.join(".companion")).unwrap(); write(p.join(".companion/project.md"), "x").unwrap();
        let log = RefCell::new(Vec::<String>::new()); let waits = RefCell::new(0);
        let failed = run_helper(&m.home, &m.data, std::slice::from_ref(&p), true, &Helper {
            parent_gone: &|| false, delete_key: &|| { log.borrow_mut().push("key".into()); true }, delete_google: &|| { log.borrow_mut().push("google".into()); true }, relaunch: &|| log.borrow_mut().push("relaunch".into()), wait: &|| *waits.borrow_mut() += 1,
        });
        assert_eq!(failed, vec![concat!(crate::product!(), " did not close in time").to_string()]);
        assert_eq!(*waits.borrow(), 200, "it waited the whole time");
        assert!(log.borrow().is_empty(), "the key is not deleted and the app is not opened a second time");
        assert!(m.data.join("runner/tasks.db").exists() && p.join(".companion/project.md").exists(), "nothing was deleted");
        assert!(fs::read_to_string(m.data.join("wipe-note.txt")).unwrap().contains("nothing was deleted"));
    }
    #[test]
    fn if_something_cannot_be_removed_the_key_stays_a_note_is_left_and_the_app_still_opens() {
        use std::cell::RefCell;
        use std::os::unix::fs::PermissionsExt;
        let m = mac("helper-fail");
        // A folder that cannot be emptied: no permission to remove things from it.
        let stuck = m.data.join("runner/shadow/x"); fs::set_permissions(&stuck, fs::Permissions::from_mode(0o500)).unwrap();
        let log = RefCell::new(Vec::<String>::new());
        let failed = run_helper(&m.home, &m.data, &[], false, &Helper { parent_gone: &|| true, delete_key: &|| { log.borrow_mut().push("key".into()); true }, delete_google: &|| { log.borrow_mut().push("google".into()); true }, relaunch: &|| log.borrow_mut().push("relaunch".into()), wait: &|| {} });
        fs::set_permissions(&stuck, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(!failed.is_empty());
        assert_eq!(*log.borrow(), vec!["relaunch"]);   // no key deletion, but the app opens
        assert!(fs::read_to_string(m.data.join("wipe-note.txt")).unwrap().contains("could not be deleted"));
    }
    #[test]
    fn a_companion_folder_that_is_really_a_link_is_not_followed() {
        let m = mac("proj-link");
        let p = m.root.join("site2"); create_dir_all(&p).unwrap();
        let elsewhere = m.root.join("elsewhere"); create_dir_all(&elsewhere).unwrap(); write(elsewhere.join("keep.txt"), "x").unwrap();
        std::os::unix::fs::symlink(&elsewhere, p.join(".companion")).unwrap();
        assert!(!project_has_ours(&p));
        assert!(clean_project(&p).is_empty());
        assert!(elsewhere.join("keep.txt").exists());
    }

    #[test]
    fn another_products_data_in_a_folder_with_the_same_name_survives() {
        let m = mac("samename");
        let other = m.home.join("Library/Application Support/Companion/their-data.db");
        write(&other, "not ours").unwrap();
        run_helper(&m.home, &m.data, &[], false, &Helper { parent_gone: &|| true, delete_key: &|| true, delete_google: &|| true, relaunch: &|| {}, wait: &|| {} });
        assert!(other.exists(), "only our own browsers folder may be removed from a folder named like the product");
        assert!(!m.home.join("Library/Application Support/Companion/browsers").exists());
    }
    #[test]
    fn pro_is_asked_about_only_while_payments_are_on_and_the_trial_start_is_always_named_as_kept() {
        assert_eq!(pro_inventory(false, || panic!("looked"), || panic!("looked")), Value::Null);
        assert_eq!(pro_inventory(true, || true, || true), json!({ "keySaved": true, "trialKept": true, "fixCountResets": true }));
        assert_eq!(pro_inventory(true, || false, || false), json!({ "keySaved": false, "trialKept": false, "fixCountResets": true }));
    }
    #[test]
    fn the_wipe_removes_the_claude_key_the_pro_key_only_on_a_yes_and_never_the_trial() {
        let main = include_str!("main.rs");
        let helper = &main[main.find("fn wipe_helper_mode()").unwrap()..]; let helper = &helper[..helper.find("\n}\n").unwrap()];
        assert!(helper.contains("keystore::delete_item(&keystore::service(), keystore::ACCOUNT)"), "the Claude key");
        for never in ["license::", "trial::", "pro-license", "pro-trial"] { assert!(!helper.contains(never), "the helper touches {never}"); }
        let del = &main[main.find("async fn delete_everything(").unwrap()..]; let del = &del[..del.find("\n}\n").unwrap()];
        let off = del.find("license::deactivate(").expect("a yes lets the activation go at Dodo");
        assert!(del[..off].contains("with_pro == Some(true)") && del[..off].contains("license::billing().payments_on()"), "only on a yes, only with payments on");
        assert!(off > del.find("confirm_delete_natively").unwrap(), "after the Mac's own question");
        assert!(off < del.find("helper.spawn()").unwrap(), "before anything is deleted");
        assert!(!del.contains("trial::") && !del.contains("pro-trial"), "the trial's start is kept (Option 2)");
        // The contract above says the same.
        let top = &include_str!("wipe.rs")[..1600];
        assert!(top.contains("`pro-trial`") && top.contains("always kept") && top.contains("Option 2") && top.contains("`pro-license`"), "{top}");
    }
    #[test]
    fn the_free_fix_count_starts_again_because_every_file_of_the_engine_goes() {
        let m = mac("fixes");
        for n in ["tasks.db", "tasks.db-wal", "plan.db", "free_fixes.json"] { write(m.data.join("runner").join(n), "count").unwrap(); }
        let (_, failed) = erase(&m.home, &m.data);
        assert!(failed.is_empty(), "{failed:?}");
        assert_eq!(fs::read_dir(m.data.join("runner")).map(|d| d.count()).unwrap_or(0), 0, "nothing of the engine's is left");
    }
    #[test]
    fn google_connections_that_could_not_be_removed_are_named_and_the_key_stays() {
        use std::cell::RefCell;
        let m = mac("googlefail");
        let log = RefCell::new(Vec::<String>::new());
        let failed = run_helper(&m.home, &m.data, &[], false, &Helper { parent_gone: &|| true, delete_key: &|| { log.borrow_mut().push("key".into()); true }, delete_google: &|| false, relaunch: &|| log.borrow_mut().push("relaunch".into()), wait: &|| {} });
        assert!(failed.iter().any(|f| f.contains("Google")), "{failed:?}");
        assert_eq!(*log.borrow(), vec!["relaunch"], "the Claude key stays until everything else went");
        let note = fs::read_to_string(m.data.join("wipe-note.txt")).unwrap();
        assert!(note.contains("Google") && note.contains("Delete everything again"), "{note}");
    }
    #[test]
    fn the_wipe_helper_removes_the_google_connections_of_companions_own_google_service() {
        let main = include_str!("main.rs");
        let helper = &main[main.find("fn wipe_helper_mode()").unwrap()..]; let helper = &helper[..helper.find("\n}\n").unwrap()];
        let g = &helper[helper.find("delete_google:").expect("a Google step")..];
        assert!(g.contains("google::forget_all(") && g.contains("google::REVOKE_URL") && g.contains("google::SERVICE"), "{g}");
        // The contract at the top of this file says so too.
        let top = &include_str!("wipe.rs")[..2400];
        assert!(top.contains("Google connections") && top.contains("revoked") && !top.contains("are not touched here"), "{top}");
    }
    #[test]
    fn delete_everything_takes_out_the_done_signal_hooks_even_with_the_notes_box_unticked() {
        let m = mac("donehooks");
        let p = m.root.join("site"); create_dir_all(p.join(".claude")).unwrap();
        let cmd = format!("/usr/bin/touch -- '{}/done/0123456789abcdef01234567' 2>/dev/null; printf '{{}}'", m.data.join("runner").display());
        let file = json!({ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "say done" } ] }, { "hooks": [ { "type": "command", "command": cmd } ] } ] } });
        write(p.join(".claude/settings.local.json"), file.to_string()).unwrap();
        write(m.data.join("runner/done-signals.json"), json!({ p.to_string_lossy().to_string(): { "token": "0123456789abcdef01234567", "made": [], "folders": [] } }).to_string()).unwrap();
        let failed = run_helper(&m.home, &m.data, &[], false, &Helper { parent_gone: &|| true, delete_key: &|| true, delete_google: &|| true, relaunch: &|| {}, wait: &|| {} });
        assert!(failed.is_empty(), "{failed:?}");
        let after = fs::read_to_string(p.join(".claude/settings.local.json")).unwrap();
        assert!(!after.contains("/usr/bin/touch") && after.contains("say done"), "{after}");
        assert!(!m.data.join("runner/done-signals.json").exists(), "the index goes with everything else, after the hooks");
    }
    #[test]
    fn a_key_that_could_not_be_removed_is_never_reported_as_deleted() {
        let m = mac("keyfail");
        let failed = run_helper(&m.home, &m.data, &[], false, &Helper { parent_gone: &|| true, delete_key: &|| false, delete_google: &|| true, relaunch: &|| {}, wait: &|| {} });
        assert!(failed.iter().any(|f| f.contains("key")), "{failed:?}");
        let note = fs::read_to_string(m.data.join("wipe-note.txt")).unwrap();
        assert!(note.contains("Keychain Access"), "{note}");
    }
}
