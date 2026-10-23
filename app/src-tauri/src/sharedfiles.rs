//! The shared files row in the Memory tab (M14): may the person add AGENTS.md and CLAUDE.md to a folder Squibby made?
//!
//! The engine never writes or asks about those two files in a folder Squibby made (runner/src/memory/agentsmd.ts
//! `madeBySquibby`) until the person says yes (`memory.agents`). The page learns from here whether the open project is such a
//! folder, and the state of the two files, so it can draw one plain row. This is the only place that looks at the two files.
//! It is kept out of made.rs on purpose: that file never opens a file. Here AGENTS.md alone is read, never through a link and
//! never when it is huge, only to see whether the block in it is the engine's own. Nothing is written or changed.
//!
//! The folder for all of them is worked out by the shell from the setting (newfolder::parent_of, made_parent in main.rs) and the
//! project is the one open now (current_project): the page sends no path, no name and no parent.
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

/// What the Memory tab shows about the shared files for the project open now (M14). `Offer`: a folder Squibby made, with
/// neither file yet, so the page offers to add them. `Added`: the engine's own block is already there. `Own`: the person has
/// their own AGENTS.md or CLAUDE.md (or one is a link or not a plain file), so nothing is offered and nothing is touched.
/// `No`: not a made folder, so the row is not drawn.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Shared { No, Offer, Added, Own }
impl Shared {
    pub fn word(self) -> &'static str { match self { Shared::No => "no", Shared::Offer => "offer", Shared::Added => "added", Shared::Own => "own" } }
    /// The answer as the page reads it (protocol/fixtures/shared-files.jsonl is run by this and by app/src/sharedFiles.ts).
    pub fn to_json(self) -> Value { json!({ "state": self.word() }) }
}
/// The engine's own mark (runner/src/memory/agentsmd.ts BLOCK is found by this opening alone).
const OUR_MARK: &str = "<!-- companion:begin";
/// A file this large is not read; it counts as the person's own.
const SHARED_READ_MAX: u64 = 2_000_000;

enum FileKind { Absent, Ours, Theirs }
/// Looks at one of the two files without following a link: absent, a plain file carrying the engine's mark, or anything else.
fn shared_file(dir: &Path, name: &str) -> FileKind {
    let p = dir.join(name);
    let Ok(m) = fs::symlink_metadata(&p) else { return FileKind::Absent };
    if !m.is_file() || m.len() > SHARED_READ_MAX { return FileKind::Theirs; }
    match fs::read_to_string(&p) { Ok(t) if t.contains(OUR_MARK) => FileKind::Ours, _ => FileKind::Theirs }
}

/// Is `project` (the folder open now, from the shell, never from the page) a real folder directly inside `parent` (the
/// same test as the list: `shown`), and what is the state of its two shared files? Only the file names are looked at, and
/// AGENTS.md is read (never through a link, never when it is huge) only to see whether the block in it is the engine's own.
/// This is stricter than the engine's own rule (runner madeBySquibby: the parent's name alone), so a yes here is only
/// offered where the engine certainly holds the files back until a yes.
pub fn shared_files(parent: &Path, project: &str) -> Shared {
    let cur = project.trim();
    if cur.is_empty() || !Path::new(cur).is_absolute() { return Shared::No; }
    let Ok(real) = fs::canonicalize(cur) else { return Shared::No };
    let Some(name) = real.file_name().and_then(|n| n.to_str()) else { return Shared::No };
    match crate::made::shown(parent, name) { Ok(s) if s == real => {} _ => return Shared::No }
    let a = shared_file(&real, "AGENTS.md");
    match (a, shared_file(&real, "CLAUDE.md")) {
        (FileKind::Ours, _) => Shared::Added,
        (FileKind::Absent, FileKind::Absent) => Shared::Offer,
        _ => Shared::Own,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::os::unix::fs::symlink;
    use std::path::PathBuf;

    fn tmp(n: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-shared-{n}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); fs::canonicalize(&d).unwrap() }
    fn world(n: &str, made: &[&str]) -> (PathBuf, PathBuf) {
        let home = tmp(n);
        let parent = home.join(crate::new_folder_parent!());
        fs::create_dir_all(&parent).unwrap();
        for m in made { fs::create_dir_all(parent.join(m)).unwrap(); }
        (home, parent)
    }
    fn shared_in(home: &Path, project: &Path) -> Shared { shared_files(&home.join(crate::new_folder_parent!()), &project.to_string_lossy()) }
    const OURS: &str = "# AGENTS.md\n\n<!-- companion:begin (kept up to date by Squibby; delete this whole block to stop) -->\n- Uses React\n<!-- companion:end -->\n";

    #[test]
    fn only_a_folder_directly_inside_the_parent_is_a_made_folder_and_it_offers_the_files() {
        let (home, parent) = world("made", &["Website"]);
        assert_eq!(shared_in(&home, &parent.join("Website")), Shared::Offer);
        // Not made: a project beside it, the parent itself, something deeper, a hidden name, nothing open, a path that is not full or not there.
        fs::create_dir_all(home.join("Project")).unwrap(); fs::create_dir_all(parent.join("Website/inner")).unwrap(); fs::create_dir_all(parent.join(".hidden")).unwrap();
        for p in [home.join("Project"), parent.clone(), parent.join("Website/inner"), parent.join(".hidden"), parent.join("Missing"), home.clone()] { assert_eq!(shared_in(&home, &p), Shared::No, "{}", p.display()); }
        for p in ["", "  ", "Website", "../Website", "~/Website"] { assert_eq!(shared_files(&parent, p), Shared::No, "{p:?}"); }
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_link_to_a_made_folder_a_file_and_a_missing_parent_are_not_made_folders() {
        let (home, parent) = world("links", &["Website"]);
        // A project that is a link into somewhere else is judged by where it really is.
        let elsewhere = home.join("elsewhere"); fs::create_dir_all(&elsewhere).unwrap();
        symlink(&elsewhere, parent.join("Linked")).unwrap();
        assert_eq!(shared_in(&home, &parent.join("Linked")), Shared::No);
        fs::write(parent.join("afile"), "x").unwrap();
        assert_eq!(shared_in(&home, &parent.join("afile")), Shared::No);
        assert_eq!(shared_files(&home.join("no-such-parent"), &parent.join("Website").to_string_lossy()), Shared::No);
        // The folder for all of them as a link is never trusted.
        let other = tmp("links-other"); let lp = other.join(crate::new_folder_parent!()); symlink(&parent, &lp).unwrap();
        assert_eq!(shared_files(&lp, &parent.join("Website").to_string_lossy()), Shared::No);
        let _ = fs::remove_dir_all(&home); let _ = fs::remove_dir_all(&other);
    }
    #[test]
    fn what_the_engine_wrote_is_added_and_never_offered_again_and_a_persons_own_file_is_left_alone() {
        let (home, parent) = world("files", &["A", "B", "C", "D", "E", "F"]);
        let at = |n: &str| parent.join(n);
        // The engine's own files (after a yes): its block in AGENTS.md and the import in CLAUDE.md.
        fs::write(at("A").join("AGENTS.md"), OURS).unwrap(); fs::write(at("A").join("CLAUDE.md"), "@AGENTS.md\n").unwrap();
        assert_eq!(shared_in(&home, &at("A")), Shared::Added);
        // The person's own AGENTS.md, CLAUDE.md, or both.
        fs::write(at("B").join("AGENTS.md"), "# My rules\nBe careful.\n").unwrap();
        fs::write(at("C").join("CLAUDE.md"), "# Mine\n").unwrap();
        fs::write(at("D").join("AGENTS.md"), "mine").unwrap(); fs::write(at("D").join("CLAUDE.md"), "@AGENTS.md\n").unwrap();   // an import with nothing of ours
        for n in ["B", "C", "D"] { assert_eq!(shared_in(&home, &at(n)), Shared::Own, "{n}"); }
        // A link is the person's own setup, and is never read through.
        let target = home.join("notes.md"); fs::write(&target, OURS).unwrap();
        symlink(&target, at("E").join("AGENTS.md")).unwrap();
        assert_eq!(shared_in(&home, &at("E")), Shared::Own);
        // A folder named AGENTS.md is not our file.
        fs::create_dir(at("F").join("AGENTS.md")).unwrap();
        assert_eq!(shared_in(&home, &at("F")), Shared::Own);
        // Nothing was changed by looking.
        assert_eq!(fs::read_to_string(at("B").join("AGENTS.md")).unwrap(), "# My rules\nBe careful.\n");
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_very_big_agents_file_is_not_read_and_counts_as_the_persons_own() {
        let (home, parent) = world("big", &["Big"]);
        let mut text = vec![b'x'; 3_000_000]; text.extend_from_slice(OURS.as_bytes());
        fs::write(parent.join("Big/AGENTS.md"), text).unwrap();
        assert_eq!(shared_in(&home, &parent.join("Big")), Shared::Own);
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn the_answers_are_the_shared_cases_the_page_also_reads() {
        for l in include_str!("../../../protocol/fixtures/shared-files.jsonl").lines().filter(|l| !l.trim().is_empty()) {
            let c: Value = serde_json::from_str(l).unwrap();
            let want = c["state"].as_str().unwrap();
            let got = [Shared::No, Shared::Offer, Shared::Added, Shared::Own].into_iter().find(|s| s.word() == want);
            assert!(got.is_some(), "{want} is not a state the shell sends");
            assert_eq!(got.unwrap().to_json(), json!({ "state": want }), "{}", c["name"]);
        }
        let seen: Vec<String> = include_str!("../../../protocol/fixtures/shared-files.jsonl").lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str::<Value>(l).unwrap()["state"].as_str().unwrap().to_string()).collect();
        for w in ["no", "offer", "added", "own"] { assert!(seen.iter().any(|s| s == w), "no shared case for {w}"); }
    }
    #[test]
    fn the_shared_files_command_is_card_only_takes_nothing_from_the_page_and_judges_the_open_project() {
        let main = include_str!("main.rs");
        let at = main.find("fn shared_files_state(").expect("fn shared_files_state(");
        let rest = &main[at..]; let b = &rest[..rest.find("\n}\n").unwrap()];
        assert!(b.contains("settings::only_card(window.label())?") && b.contains("made_parent()") && b.contains("current_project()") && b.contains("sharedfiles::shared_files("), "{b}");
        let sig = &b[..b.find('{').unwrap()];
        assert!(!sig.contains("path") && !sig.contains("parent") && !sig.contains("name") && !sig.contains("project"), "no folder comes from the page: {sig}");
        assert!(main.contains(", shared_files_state,") || main.contains(", shared_files_state]"), "not registered");
        let runner = include_str!("runner.rs");
        assert!(!runner.contains("shared_files"), "not reachable from the engine");
    }
    #[test]
    fn this_module_only_looks_and_never_writes_deletes_or_runs_anything() {
        let src = include_str!("sharedfiles.rs");
        let code = &src[..src.find("#[cfg(test)]").unwrap()];
        for banned in ["remove_dir", "remove_file", "fs::rename", "File::create", "OpenOptions", "fs::write", "fs::copy", "create_dir", "set_permissions", "Command::new"] { assert!(!code.contains(banned), "{banned}"); }
    }
}
