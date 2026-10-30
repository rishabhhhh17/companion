//! What Squibby made (M14, F23): the folders "make me something" made, listed so they can be opened as the project, shown in
//! Finder, or moved to the Trash. They are the folders directly inside the one folder for all of them (newfolder.rs
//! `parent_of`, in the place the setting make.folder names), and nothing else.
//!
//! This file is the pure part and the whole safety check; main.rs only calls it (list_made, open_made, reveal_made,
//! trash_made; card only, never reachable from the engine or a protocol message). It follows Remove my copy (practice.rs):
//!  - A folder is named by its name alone. The page never sends a path or the parent: the shell works the parent out from the
//!    setting each time. A name the list would not have shown is refused (`shown` is the list's own test, used by every
//!    command): not one plain name, a hidden name, a link (never followed), a file, something deeper, the parent itself.
//!  - Listing reads names, dates and sizes only (metadata of each entry, `symlink_metadata`): never what is in a file, so it
//!    cannot trip a permission prompt for a protected folder, and a locked file is still counted.
//!  - Nothing is deleted here. `trash` hands the one folder to the function it is given (main.rs gives it the Mac's own
//!    Trash, so it can always be put back); tests give it a recording double.
//!  - The project open now, a folder with the open project inside it, and everything while a task works or waits are refused.
//!  - A folder with git history (a .git, folder or file, at its top) is moved only when the person confirmed that too. It is
//!    only moved: no git command runs and no git file is read or changed (rule 10).
use serde_json::{json, Value};
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

/// One made folder, as the page draws it. `bytes` is None when it was not counted; `rough` says the count stopped early (a
/// big folder, or a part it could not look into), so the real size is at least that.
#[derive(Clone, Debug, PartialEq)]
pub struct Row { pub name: String, pub made_ms: Option<u64>, pub bytes: Option<u64>, pub rough: bool, pub open: bool, pub working: bool, pub git: bool }
impl Row {
    /// The row as the page reads it (protocol/fixtures/made-list.jsonl is run by this and by app/src/made.ts).
    pub fn to_json(&self) -> Value { json!({ "name": self.name, "madeMs": self.made_ms, "bytes": self.bytes, "rough": self.rough, "open": self.open, "working": self.working, "git": self.git }) }
}
#[derive(Debug)]
pub struct Listing { pub rows: Vec<Row>, pub more: usize }

/// The list shows at most this many folders, newest first; the rest are only counted.
pub const MAX_ROWS: usize = 200;
/// Entries looked at for one folder's size, and for the whole list: a rough size, never a long wait.
const PER_FOLDER_ENTRIES: usize = 5_000;
const LIST_ENTRIES: usize = 60_000;
const NAME_MAX_BYTES: usize = 255;

const NOT_LISTED: &str = concat!("That folder is not in the list of what ", crate::product!(), " made, so ", crate::product!(), " leaves it alone.");
const BUSY: &str = "Something is still working or waiting for you. Wait for it to finish, or press Stop, then try again.";

/// Where the folder is, in words: under the home folder as ~/..., anywhere else in full.
pub fn where_words(home_real: &Path, parent: &Path) -> String {
    match parent.strip_prefix(home_real) { Ok(rel) => format!("~/{}", rel.display()), Err(_) => parent.display().to_string() }
}

/// Newest first, then by name; a folder with no date goes last.
fn newest_first(a: &Row, b: &Row) -> std::cmp::Ordering { b.made_ms.cmp(&a.made_ms).then_with(|| a.name.cmp(&b.name)) }

/// Characters that draw nothing or change how the text around them is laid out: the text direction marks and isolates, the
/// Arabic letter mark, the line and paragraph separators, zero width and joining marks, the word joiner, the soft hyphen, the
/// byte order mark, the old Mongolian vowel separator, the other invisible format characters and the tag characters. A name
/// holding one can read the same as another name, or break the sentence that asks for the person's confirm.
fn invisible(c: char) -> bool {
    matches!(c, '\u{00ad}' | '\u{0600}'..='\u{0605}' | '\u{061c}' | '\u{06dd}' | '\u{070f}' | '\u{08e2}' | '\u{180e}' | '\u{200b}'..='\u{200f}' | '\u{2028}'..='\u{202e}'
        | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{206f}' | '\u{feff}' | '\u{fff9}'..='\u{fffb}' | '\u{110bd}' | '\u{1d173}'..='\u{1d17a}' | '\u{e0001}' | '\u{e0020}'..='\u{e007f}')
}
/// One plain folder name: not empty, not hidden, not . or .., no slash, no control, invisible or text direction characters (a
/// name that could look like another), and short enough for the Mac. A name the page sends is held to this first.
fn plain_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= NAME_MAX_BYTES && !name.starts_with('.') && !name.chars().any(|c| c == '/' || c.is_control() || invisible(c))
}

/// The folder for all of them, as a real folder (never a link or a file), or the reason it is not.
fn real_parent(parent: &Path) -> Result<PathBuf, String> {
    match fs::symlink_metadata(parent) {
        Ok(m) if m.is_dir() => fs::canonicalize(parent).map_err(|_| "The folder for what was made could not be read.".to_string()),
        Ok(_) => Err(format!(concat!("{} is a link or a file, so ", crate::product!(), " will not use it. Move it, or pick another place for new folders in Settings."), parent.display())),
        Err(_) => Err(format!("{} is not there.", parent.display())),
    }
}

/// The list's own test, used by every command: `name` is a real folder directly inside the folder for all of them. Returns its
/// real path. Anything else (a link, a file, a hidden or odd name, something deeper, the parent itself, a name that is not
/// there) is refused with the same plain line.
pub fn shown(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let parent = real_parent(parent).map_err(|_| NOT_LISTED.to_string())?;
    if !plain_name(name) { return Err(NOT_LISTED.into()); }
    let child = parent.join(name);
    if !fs::symlink_metadata(&child).is_ok_and(|m| m.is_dir()) { return Err(NOT_LISTED.into()); }
    // Still directly inside after every link is resolved, and by the name it is stored under.
    let real = fs::canonicalize(&child).map_err(|_| NOT_LISTED.to_string())?;
    if real.parent() != Some(parent.as_path()) || real.file_name().and_then(|n| n.to_str()) != Some(name) { return Err(NOT_LISTED.into()); }
    Ok(real)
}

/// Is the project open now this folder or inside it (`open`), or is this folder inside the project (`over`, when the
/// project is the folder for all of them)? A project that is empty, not a full path or gone is no project here.
fn relation(real: &Path, current: &str) -> (bool, bool) {
    let cur = current.trim();
    if cur.is_empty() || !Path::new(cur).is_absolute() { return (false, false); }
    let Ok(c) = fs::canonicalize(cur) else { return (false, false) };
    let open = c.starts_with(real);
    (open, !open && real.starts_with(&c))
}
fn has_git(real: &Path) -> bool { fs::symlink_metadata(real.join(".git")).is_ok() }

fn millis(t: std::io::Result<std::time::SystemTime>) -> Option<u64> { t.ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64) }

/// About how much room a folder takes: the space its entries use, from their metadata only. Links are counted as links and
/// never followed. Stops at the folder's share of the budget (then `rough`), and a part it cannot look into makes it rough.
fn size_of(dir: &Path, budget: &mut usize) -> (Option<u64>, bool) {
    if *budget == 0 { return (None, true); }
    let mut left = (*budget).min(PER_FOLDER_ENTRIES);
    let (mut bytes, mut rough) = (0u64, false);
    let mut todo = vec![dir.to_path_buf()];
    'walk: while let Some(d) = todo.pop() {
        let Ok(entries) = fs::read_dir(&d) else { rough = true; continue };
        for e in entries.flatten() {
            if left == 0 { rough = true; break 'walk; }
            left -= 1; *budget = budget.saturating_sub(1);
            let Ok(m) = fs::symlink_metadata(e.path()) else { rough = true; continue };
            bytes += m.blocks() * 512;
            if m.is_dir() { todo.push(e.path()); }
        }
    }
    (Some(bytes), rough)
}

pub fn list(parent: &Path, current: &str, busy: bool) -> Result<Listing, String> { list_with(parent, current, busy, MAX_ROWS, LIST_ENTRIES) }

/// The folders made, newest first. A folder for all of them that is not there yet is an empty list (nothing is made by
/// looking); one that is a link or a file is refused. `busy`: a task works or waits, so the open project says it is working.
pub fn list_with(parent: &Path, current: &str, busy: bool, max_rows: usize, entry_budget: usize) -> Result<Listing, String> {
    match fs::symlink_metadata(parent) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Listing { rows: vec![], more: 0 }),
        _ => {}
    }
    let real = real_parent(parent)?;
    let entries = fs::read_dir(&real).map_err(|_| "The folder for what was made could not be read.".to_string())?;
    let mut found: Vec<(Row, PathBuf)> = vec![];
    for e in entries.flatten() {
        let Some(name) = e.file_name().to_str().map(str::to_string) else { continue };
        let Ok(path) = shown(&real, &name) else { continue };
        let m = fs::symlink_metadata(&path).ok();
        let (open, _) = relation(&path, current);
        found.push((Row { name, made_ms: m.as_ref().and_then(|m| millis(m.created().or_else(|_| m.modified()))), bytes: None, rough: false, open, working: open && busy, git: has_git(&path) }, path));
    }
    found.sort_by(|a, b| newest_first(&a.0, &b.0));
    let more = found.len().saturating_sub(max_rows);
    found.truncate(max_rows);
    let mut budget = entry_budget;
    let rows = found.into_iter().map(|(mut r, path)| { let (b, rough) = size_of(&path, &mut budget); r.bytes = b; r.rough = rough; r }).collect();
    Ok(Listing { rows, more })
}

/// The real path of a listed folder, for Open as project and Show in Finder. Not while a task works or waits (a project is not
/// switched under it).
pub fn open_path(parent: &Path, name: &str, busy: bool) -> Result<PathBuf, String> {
    if busy { return Err(BUSY.into()); }
    shown(parent, name)
}

/// Moves one listed folder to the Trash by handing it to `trash` (the Mac's own, so it can be put back). Refused, with a plain
/// line and nothing moved: while a task works or waits, a name the list would not show, the project open now (or one with the
/// project inside it, or the folder for all of them as the project), and a folder with git history unless `git_ok` (the
/// person confirmed that too). Nothing is deleted.
pub fn trash(parent: &Path, name: &str, current: &str, busy: bool, git_ok: bool, trash: impl Fn(&Path) -> Result<(), String>) -> Result<PathBuf, String> {
    if busy { return Err(BUSY.into()); }
    let real = shown(parent, name)?;
    let (open, over) = relation(&real, current);
    if open { return Err(concat!("That folder is the project open now, so ", crate::product!(), " leaves it alone. Open another project first.").into()); }
    if over { return Err(concat!("The project open now is the folder that holds these, so ", crate::product!(), " leaves what is inside it alone. Open another project first.").into()); }
    if has_git(&real) && !git_ok { return Err("That folder has git history. Confirm that too to move it.".into()); }
    trash(&real).map_err(|e| format!("The folder could not be moved to the Trash ({e}). It is still where it was."))?;
    Ok(real)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::cell::RefCell;
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};

    fn tmp(n: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-made-{n}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); fs::canonicalize(&d).unwrap() }
    /// A home folder with the folder for all of them in it, and the folders named made inside that.
    fn world(n: &str, made: &[&str]) -> (PathBuf, PathBuf) {
        let home = tmp(n);
        let parent = home.join(crate::new_folder_parent!());
        fs::create_dir_all(&parent).unwrap();
        for m in made { fs::create_dir_all(parent.join(m)).unwrap(); }
        (home, parent)
    }
    /// A Trash double: remembers every path it was asked to move and moves nothing. The real Trash is never used here.
    struct Rec(RefCell<Vec<PathBuf>>);
    impl Rec {
        fn new() -> Self { Rec(RefCell::new(vec![])) }
        fn it(&self) -> impl Fn(&Path) -> Result<(), String> + '_ { move |p| { self.0.borrow_mut().push(p.to_path_buf()); Ok(()) } }
        fn seen(&self) -> Vec<PathBuf> { self.0.borrow().clone() }
    }
    fn names(l: &Listing) -> Vec<String> { l.rows.iter().map(|r| r.name.clone()).collect() }
    fn sorted(mut v: Vec<String>) -> Vec<String> { v.sort(); v }
    fn row(name: &str) -> Row { Row { name: name.into(), made_ms: Some(1), bytes: Some(1), rough: false, open: false, working: false, git: false } }

    // ---------- what is listed: only real folders directly inside the folder for all of them ----------

    #[test]
    fn only_real_folders_directly_inside_are_listed_not_files_not_hidden_ones_not_what_is_deeper() {
        let (home, parent) = world("direct", &["Website", "Todo app"]);
        fs::create_dir_all(parent.join("Website/deeper/deepest")).unwrap();
        fs::write(parent.join("notes.txt"), "a file").unwrap();
        fs::write(parent.join(".DS_Store"), "x").unwrap();
        fs::create_dir_all(parent.join(".git")).unwrap();   // the person ran git init in the folder for all of them
        fs::create_dir_all(parent.join(".hidden")).unwrap();
        let l = list(&parent, "", false).unwrap();
        assert_eq!(sorted(names(&l)), ["Todo app", "Website"]);
        assert_eq!(l.more, 0);
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_link_is_never_listed_or_followed_even_when_named_like_a_folder_and_a_file_named_like_one_is_not_a_folder() {
        let (home, parent) = world("links", &["Real one"]);
        let elsewhere = home.join("elsewhere"); fs::create_dir_all(elsewhere.join("inner")).unwrap(); fs::write(elsewhere.join("big.bin"), vec![1u8; 100_000]).unwrap();
        symlink(&elsewhere, parent.join("Website")).unwrap();   // a link named like a project folder
        symlink("/nowhere", parent.join("Dangling")).unwrap();
        fs::write(parent.join("Todo app"), "a file named like a folder").unwrap();
        // A link inside a folder is not followed when the size is added up.
        symlink(&elsewhere, parent.join("Real one/shortcut")).unwrap();
        let l = list(&parent, "", false).unwrap();
        assert_eq!(names(&l), ["Real one"]);
        assert!(l.rows[0].bytes.unwrap() < 50_000, "the 100 KB file behind the link was not counted: {:?}", l.rows[0].bytes);
        let r = Rec::new();
        for n in ["Website", "Dangling", "Todo app"] {
            assert!(trash(&parent, n, "", false, false, r.it()).is_err(), "{n}");
            assert!(shown(&parent, n).is_err(), "{n}");
        }
        assert!(r.seen().is_empty());
        assert!(elsewhere.join("big.bin").is_file() && parent.join("Website").exists());
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn the_folder_for_all_of_them_is_never_in_its_own_list_and_never_moved() {
        let (home, parent) = world("self", &["Website"]);
        let l = list(&parent, "", false).unwrap();
        assert!(!names(&l).contains(&crate::new_folder_parent!().to_string()));
        let r = Rec::new();
        let own = crate::new_folder_parent!();
        for n in ["", ".", "..", "./", own, &format!("../{own}"), &format!("../{own}/Website"), &parent.to_string_lossy()] {
            assert!(trash(&parent, n, "", false, true, r.it()).is_err(), "{n:?}");
            assert!(open_path(&parent, n, false).is_err(), "{n:?}");
        }
        assert!(r.seen().is_empty() && parent.join("Website").is_dir());
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_name_that_is_not_one_plain_name_is_refused_and_nothing_is_touched() {
        let (home, parent) = world("badnames", &["Website"]);
        fs::create_dir_all(home.join("outside")).unwrap(); fs::write(home.join("outside/keep.txt"), "mine").unwrap();
        fs::create_dir_all(parent.join("Website/inner")).unwrap();
        let abs_outside = home.join("outside").to_string_lossy().to_string();
        let long = "x".repeat(300);
        let r = Rec::new();
        for n in ["", ".", "..", "../outside", "../../outside", "Website/inner", "Website/", "./Website", "/etc", "/", abs_outside.as_str(), "~", "~/Documents", "Website\0", "Web\nsite", "Web\tsite", "\u{202e}Website", ".Website", ".git", long.as_str()] {
            assert!(shown(&parent, n).is_err(), "{n:?} must not be in the list");
            assert!(trash(&parent, n, "", false, true, r.it()).is_err(), "{n:?} must be refused");
        }
        assert!(r.seen().is_empty());
        assert!(home.join("outside/keep.txt").is_file() && parent.join("Website/inner").is_dir());
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn names_with_invisible_or_line_breaking_characters_are_not_listed_and_are_refused() {
        // plain_name promises "no control or text direction characters (a name that could look like another)", and the
        // confirm shows the name in a sentence. These were not in its list: the Arabic letter mark (a text direction mark
        // like the others), the line and paragraph separators (they break the confirm's sentence into lines), the zero
        // width and joining marks, the word joiner and the byte order mark (a name that reads the same as another one's),
        // the soft hyphen, the old Mongolian vowel separator, and the tag characters (invisible text).
        let odd = ["Web\u{200b}site", "Web\u{200c}site", "Web\u{200d}site", "Web\u{2060}site", "\u{feff}Website", "Web\u{00ad}site", "Web\u{061c}site", "Web\u{2028}site", "Web\u{2029}site",
            "Web\u{180e}site", "Web\u{e0041}site", "Web\u{206a}site", "Web\u{fff9}site"];
        let (home, parent) = world("invisible", &["Website"]);
        for n in odd { fs::create_dir_all(parent.join(n)).unwrap(); }
        let l = list(&parent, "", false).unwrap();
        assert_eq!(names(&l), ["Website"], "only the plain name is listed");
        let r = Rec::new();
        for n in odd {
            assert!(shown(&parent, n).is_err(), "{n:?} must not be in the list");
            assert!(trash(&parent, n, "", false, true, r.it()).is_err(), "{n:?} must be refused");
            assert!(open_path(&parent, n, false).is_err(), "{n:?}");
        }
        assert!(r.seen().is_empty());
        // A name Squibby itself makes holds letters, digits, spaces and dashes only, so none of it is ever refused here.
        assert!((0u32..0x110000).filter_map(char::from_u32).filter(|c| invisible(*c)).all(|c| !c.is_alphanumeric()));
        // Letters, accents and the marks of other scripts, spaces and pictures stay fine.
        for ok in ["Cafe\u{301}", "Ünï", "名前 ウェブサイト", "🎂 cake", "नमस्ते दुनिया"] { assert!(plain_name(ok), "{ok:?}"); }
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_folder_beside_the_folder_for_all_of_them_is_not_in_the_list_and_is_refused() {
        let (home, parent) = world("beside", &["Website"]);
        fs::create_dir_all(home.join("Documents")).unwrap(); fs::create_dir_all(home.join("Project")).unwrap();
        let r = Rec::new();
        for n in ["Documents", "Project", "../Project"] { assert!(trash(&parent, n, "", false, true, r.it()).is_err(), "{n}"); }
        assert!(r.seen().is_empty());
        assert_eq!(names(&list(&parent, "", false).unwrap()), ["Website"]);
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn names_with_spaces_accents_pictures_quotes_and_dashes_are_listed_and_can_be_moved() {
        let odd = ["Website for my bakery", "Café für Oma", "名前 ウェブサイト", "🎂 cake", "100% done", "it's \"mine\"", "-rf the site", "a:b", "ends with a space ", "a  double  space", "Ünï", "a&b <c> $HOME `x`"];
        let (home, parent) = world("odd", &odd);
        let l = list(&parent, "", false).unwrap();
        assert_eq!(sorted(names(&l)), sorted(odd.iter().map(|s| s.to_string()).collect()));
        let r = Rec::new();
        for n in odd { assert_eq!(trash(&parent, n, "", false, false, r.it()), Ok(parent.join(n)), "{n:?}"); }
        assert_eq!(r.seen().len(), odd.len());
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_folder_swapped_for_a_link_after_the_list_was_drawn_is_refused() {
        let (home, parent) = world("swap", &["Website"]);
        let l = list(&parent, "", false).unwrap(); assert_eq!(names(&l), ["Website"]);
        let elsewhere = home.join("elsewhere"); fs::create_dir_all(&elsewhere).unwrap(); fs::write(elsewhere.join("keep.txt"), "mine").unwrap();
        fs::remove_dir(parent.join("Website")).unwrap(); symlink(&elsewhere, parent.join("Website")).unwrap();
        let r = Rec::new();
        assert!(trash(&parent, "Website", "", false, false, r.it()).is_err());
        assert!(r.seen().is_empty() && elsewhere.join("keep.txt").is_file());
        let _ = fs::remove_dir_all(&home);
    }

    // ---------- the folder for all of them itself ----------

    #[test]
    fn a_missing_folder_for_all_of_them_is_an_empty_list_and_nothing_to_move() {
        let home = tmp("noparent");
        let parent = home.join(crate::new_folder_parent!());
        let l = list(&parent, "", false).unwrap();
        assert!(l.rows.is_empty() && l.more == 0);
        assert!(!parent.exists(), "listing never makes it");
        assert!(trash(&parent, "Website", "", false, false, Rec::new().it()).is_err());
        assert!(open_path(&parent, "Website", false).is_err());
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_folder_for_all_of_them_that_is_a_link_or_a_file_is_not_followed() {
        let home = tmp("badparent");
        let elsewhere = home.join("elsewhere"); fs::create_dir_all(elsewhere.join("Website")).unwrap();
        let parent = home.join(crate::new_folder_parent!());
        symlink(&elsewhere, &parent).unwrap();
        assert!(list(&parent, "", false).is_err(), "a link is not read through");
        assert!(trash(&parent, "Website", "", false, false, Rec::new().it()).is_err());
        assert!(open_path(&parent, "Website", false).is_err());
        fs::remove_file(&parent).unwrap(); fs::write(&parent, "a file").unwrap();
        assert!(list(&parent, "", false).is_err());
        assert!(trash(&parent, "Website", "", false, false, Rec::new().it()).is_err());
        assert!(elsewhere.join("Website").is_dir() && fs::read_to_string(&parent).unwrap() == "a file");
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn the_place_is_told_in_words_from_the_home_folder() {
        let home = Path::new("/Users/sam");
        assert_eq!(where_words(home, &home.join(crate::new_folder_parent!())), concat!("~/", crate::new_folder_parent!()));
        assert_eq!(where_words(home, &home.join("Documents").join(crate::new_folder_parent!())), concat!("~/Documents/", crate::new_folder_parent!()));
        assert_eq!(where_words(home, &Path::new("/Volumes/x").join(crate::new_folder_parent!())), concat!("/Volumes/x/", crate::new_folder_parent!()));
    }
    #[test]
    fn the_parent_name_is_the_one_new_folders_are_made_in_and_there_is_no_earlier_name_to_list() {
        // newfolder::parent_of is the one place that works the folder out, for making and for listing.
        let (home, parent) = world("same", &[]);
        assert_eq!(crate::newfolder::parent_of(&home, "home").unwrap(), (home.clone(), parent.clone()));
        fs::create_dir(home.join("Documents")).unwrap();
        assert_eq!(crate::newfolder::parent_of(&home, "documents").unwrap().1, home.join("Documents").join(crate::new_folder_parent!()));
        assert_eq!(crate::newfolder::parent_of(&home, "/etc").unwrap().1, parent, "an unknown place is the usual one");
        assert!(crate::newfolder::parent_of(&home, "desktop").is_err(), "no Desktop folder");
        // names.json has an earlier key for practice copies only: the parent name was never recorded under an earlier one.
        let n = include_str!("../../../protocol/names.json");
        assert!(n.contains("earlierPracticeCopyBases") && !n.contains("earlierNewFolderParent"));
        let _ = fs::remove_dir_all(&home);
    }

    // ---------- the open project and a running task ----------

    #[test]
    fn the_project_open_now_is_marked_and_never_moved() {
        let (home, parent) = world("open", &["Website", "Todo app"]);
        let open = parent.join("Website").to_string_lossy().to_string();
        let l = list(&parent, &open, false).unwrap();
        assert_eq!(l.rows.iter().filter(|r| r.open).map(|r| r.name.as_str()).collect::<Vec<_>>(), ["Website"]);
        let r = Rec::new();
        let e = trash(&parent, "Website", &open, false, true, r.it()).unwrap_err();
        assert!(e.contains("open") , "{e}");
        assert!(r.seen().is_empty());
        // The other folder can go.
        assert_eq!(trash(&parent, "Todo app", &open, false, false, r.it()), Ok(parent.join("Todo app")));
        // The same project said another way (a trailing slash, a link to it) is still the open one.
        fs::create_dir_all(home.join("links")).unwrap(); symlink(parent.join("Website"), home.join("links/w")).unwrap();
        for c in [format!("{open}/"), home.join("links/w").to_string_lossy().to_string(), format!("{open}/../Website")] {
            assert!(trash(&parent, "Website", &c, false, true, r.it()).is_err(), "{c}");
            assert!(list(&parent, &c, false).unwrap().rows.iter().any(|x| x.open), "{c}");
        }
        assert_eq!(r.seen().len(), 1);
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_project_open_inside_a_made_folder_keeps_that_folder_and_the_folder_above_a_project_is_not_moved_under_it() {
        let (home, parent) = world("inside", &["Website", "Todo app"]);
        fs::create_dir_all(parent.join("Website/site")).unwrap();
        let inner = parent.join("Website/site").to_string_lossy().to_string();
        let r = Rec::new();
        assert!(trash(&parent, "Website", &inner, false, true, r.it()).is_err());
        assert!(list(&parent, &inner, false).unwrap().rows.iter().any(|x| x.name == "Website" && x.open));
        // The person made the folder for all of them their project: everything in it is the project's.
        let p = parent.to_string_lossy().to_string();
        assert!(trash(&parent, "Todo app", &p, false, true, r.it()).is_err());
        assert!(r.seen().is_empty());
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn with_no_project_or_one_that_is_gone_nothing_is_open_and_nothing_breaks() {
        let (home, parent) = world("gone", &["Website"]);
        for c in ["", "/no/such/project", "relative/path", "  "] {
            let l = list(&parent, c, false).unwrap();
            assert!(l.rows.iter().all(|r| !r.open && !r.working), "{c:?}");
            assert!(trash(&parent, "Website", c, false, false, Rec::new().it()).is_ok(), "{c:?}");
        }
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn while_a_task_works_or_waits_nothing_is_moved_or_opened_and_the_open_folder_says_so() {
        let (home, parent) = world("busy", &["Website", "Todo app"]);
        let open = parent.join("Website").to_string_lossy().to_string();
        let l = list(&parent, &open, true).unwrap();
        for r in &l.rows { assert_eq!(r.working, r.name == "Website", "{}", r.name); }
        let none = list(&parent, "", true).unwrap();
        assert!(none.rows.iter().all(|r| !r.working), "a task is not in a folder that is not open");
        let r = Rec::new();
        for n in ["Website", "Todo app"] {
            let e = trash(&parent, n, &open, true, true, r.it()).unwrap_err();
            assert!(e.contains("working") || e.contains("waiting"), "{e}");
            assert!(open_path(&parent, n, true).is_err());
        }
        assert!(r.seen().is_empty());
        assert!(open_path(&parent, "Todo app", false).is_ok());
        let _ = fs::remove_dir_all(&home);
    }

    // ---------- git: the person's own history is never touched ----------

    #[test]
    fn a_folder_with_git_history_is_flagged_and_moved_only_when_the_person_confirmed_that_too() {
        let (home, parent) = world("git", &["Plain", "Repo", "Worktree"]);
        fs::create_dir_all(parent.join("Repo/.git/objects")).unwrap(); fs::write(parent.join("Repo/.git/HEAD"), "ref: refs/heads/main").unwrap();
        fs::write(parent.join("Worktree/.git"), "gitdir: /elsewhere/.git/worktrees/w").unwrap();   // a git worktree marks itself with a file
        let l = list(&parent, "", false).unwrap();
        for r in &l.rows { assert_eq!(r.git, r.name != "Plain", "{}", r.name); }
        let r = Rec::new();
        for n in ["Repo", "Worktree"] {
            let e = trash(&parent, n, "", false, false, r.it()).unwrap_err();
            assert!(e.contains("git"), "{e}");
        }
        assert!(r.seen().is_empty());
        assert_eq!(trash(&parent, "Plain", "", false, false, r.it()), Ok(parent.join("Plain")), "the confirm is not needed without git");
        assert_eq!(trash(&parent, "Repo", "", false, true, r.it()), Ok(parent.join("Repo")));
        assert_eq!(r.seen(), [parent.join("Plain"), parent.join("Repo")], "only the folder is handed to the Trash, never a path inside it");
        assert!(parent.join("Repo/.git/HEAD").is_file(), "no git file was touched");
        // A .git that is a link is a git folder too.
        let (home2, parent2) = world("gitlink", &["Linked"]);
        symlink("/nowhere", parent2.join("Linked/.git")).unwrap();
        assert!(list(&parent2, "", false).unwrap().rows[0].git);
        assert!(trash(&parent2, "Linked", "", false, false, Rec::new().it()).is_err());
        let _ = fs::remove_dir_all(&home); let _ = fs::remove_dir_all(&home2);
    }

    // ---------- the Trash itself ----------

    #[test]
    fn a_folder_goes_to_the_trash_whole_and_a_refused_trash_leaves_it_where_it_was() {
        let (home, parent) = world("moves", &["Website"]);
        fs::write(parent.join("Website/index.html"), "mine").unwrap();
        let bin = home.join("Trash"); fs::create_dir_all(&bin).unwrap();
        let moved = trash(&parent, "Website", "", false, false, |p: &Path| fs::rename(p, bin.join(p.file_name().unwrap())).map_err(|e| e.to_string())).unwrap();
        assert_eq!(moved, parent.join("Website"));
        assert!(!parent.join("Website").exists() && fs::read_to_string(bin.join("Website/index.html")).unwrap() == "mine", "moved whole, nothing deleted");
        fs::create_dir_all(parent.join("Again")).unwrap();
        let e = trash(&parent, "Again", "", false, false, |_: &Path| Err("The Trash is full".to_string())).unwrap_err();
        assert!(e.contains("Trash") && e.contains("still"), "{e}");
        assert!(parent.join("Again").is_dir());
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn this_module_never_deletes_or_reads_a_file() {
        let src = include_str!("made.rs");
        let code = &src[..src.find("#[cfg(test)]").unwrap()];
        // Rule 13: nothing is deleted outright (the Trash is the function the caller passes in), and listing reads names,
        // dates and sizes only, never what is in a file.
        for banned in ["remove_dir", "remove_file", "fs::rename", "fs::read(", "read_to_string", "File::open", "File::create", "OpenOptions", "fs::write", "fs::copy", "create_dir", "set_permissions", "Command::new"] {
            assert!(!code.contains(banned), "{banned}");
        }
    }

    // ---------- the list: sizes, dates, order, caps, and nothing read ----------

    #[test]
    fn the_list_counts_sizes_and_reads_dates_without_opening_a_single_file() {
        let (home, parent) = world("noread", &["Locked", "Plain"]);
        fs::write(parent.join("Locked/secret.txt"), vec![7u8; 40_000]).unwrap();
        fs::set_permissions(parent.join("Locked/secret.txt"), fs::Permissions::from_mode(0o000)).unwrap();   // cannot be opened at all
        fs::create_dir_all(parent.join("Locked/private")).unwrap(); fs::write(parent.join("Locked/private/a.txt"), "x").unwrap();
        fs::set_permissions(parent.join("Locked/private"), fs::Permissions::from_mode(0o000)).unwrap();   // cannot be listed
        let l = list(&parent, "", false).unwrap();
        let locked = l.rows.iter().find(|r| r.name == "Locked").unwrap();
        assert!(locked.bytes.unwrap() >= 40_000, "the locked file still counts by its size: {:?}", locked.bytes);
        assert!(locked.made_ms.is_some());
        let plain = l.rows.iter().find(|r| r.name == "Plain").unwrap();
        assert_eq!(plain.bytes, Some(0), "an empty folder is empty");
        fs::set_permissions(parent.join("Locked/private"), fs::Permissions::from_mode(0o755)).unwrap();
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn a_big_folder_is_counted_only_so_far_and_says_so_and_a_long_list_is_cut() {
        let (home, parent) = world("caps", &["Big", "A", "B", "C"]);
        for i in 0..30 { fs::write(parent.join(format!("Big/f{i}.txt")), vec![1u8; 5000]).unwrap(); }
        let l = list_with(&parent, "", false, 2, 10).unwrap();
        assert_eq!(l.rows.len(), 2);
        assert_eq!(l.more, 2, "the rows not drawn are counted");
        let l = list_with(&parent, "", false, 10, 10).unwrap();
        let big = l.rows.iter().find(|r| r.name == "Big").unwrap();
        assert!(big.rough && big.bytes.is_some_and(|b| b > 0), "{big:?}");
        // Once the whole list's budget is spent, a folder's size is not counted at all.
        let l = list_with(&parent, "", false, 10, 0).unwrap();
        assert!(l.rows.iter().all(|r| r.bytes.is_none() && r.rough));
        let _ = fs::remove_dir_all(&home);
    }
    #[test]
    fn the_newest_folder_is_first_then_by_name() {
        let mut rows = vec![row("b"), row("a"), row("c"), row("none")];
        rows[0].made_ms = Some(300); rows[1].made_ms = Some(300); rows[2].made_ms = Some(900); rows[3].made_ms = None;
        rows.sort_by(newest_first);
        assert_eq!(rows.iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), ["c", "a", "b", "none"]);
        // A made folder gets its date from the folder itself.
        let (home, parent) = world("dates", &["One"]);
        let ms = list(&parent, "", false).unwrap().rows[0].made_ms.unwrap();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
        assert!(ms <= now + 2000 && now - ms < 3_600_000, "{ms} vs {now}");
        let _ = fs::remove_dir_all(&home);
    }

    // ---------- shared with the page ----------

    #[test]
    fn a_row_is_sent_the_way_the_page_reads_it_the_shared_cases() {
        let all: Vec<Value> = include_str!("../../../protocol/fixtures/made-list.jsonl").lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str(l).unwrap()).collect();
        assert!(all.len() >= 5);
        for c in &all {
            let r = &c["row"];
            let built = Row {
                name: r["name"].as_str().unwrap().into(), made_ms: r["madeMs"].as_u64(), bytes: r["bytes"].as_u64(), rough: r["rough"].as_bool().unwrap(),
                open: r["open"].as_bool().unwrap(), working: r["working"].as_bool().unwrap(), git: r["git"].as_bool().unwrap(),
            };
            assert_eq!(built.to_json(), *r, "{}", c["name"]);
        }
        assert_eq!(json!(null), Value::Null);
    }

    // ---------- the shell's own commands ----------

    #[test]
    fn the_shell_commands_are_card_only_work_out_the_folder_themselves_and_move_to_the_trash_through_this_check() {
        let main = include_str!("main.rs");
        let body = |s: &str| { let at = main.find(s).unwrap_or_else(|| panic!("{s}")); let rest = &main[at..]; rest[..rest.find("\n}\n").unwrap()].to_string() };
        for f in ["fn list_made(", "fn open_made(", "fn reveal_made(", "fn trash_made("] {
            let b = body(f);
            // Home only (Settings lives inside it), never another window.
            assert!(b.contains("settings::only_card(window.label())?"), "{f} must be Home only");
            // The folder for all of them comes from the setting, never from the page: no command takes a path or a parent.
            assert!(b.contains("made_parent()"), "{f} works the folder out itself");
            let sig = &b[..b.find('{').unwrap()];
            assert!(!sig.contains("parent") && !sig.contains("path"), "{f} takes no folder from the page: {sig}");
        }
        let mp = body("fn made_parent(");
        assert!(mp.contains("newfolder::parent_of(") && mp.contains("setting_now(\"make.folder\")"));
        let t = body("fn trash_made(");
        assert!(t.contains("made::trash(") && t.contains("move_to_trash") && t.contains("forget_folder("), "{t}");
        assert!(t.contains("NEW_FOLDER.lock()"), "never while a new folder is being made");
        assert!(t.contains("updates::running_now()") && t.contains("current_project()"), "the shell knows a task runs and what is open, not only the page");
        assert!(body("async fn list_made(").contains("spawn_blocking"), "the count of sizes never runs on the main thread");
        assert!(body("fn open_made(").contains("made::open_path(") && body("fn open_made(").contains("use_project_inner("));
        assert!(body("fn reveal_made(").contains("made::open_path(") && body("fn reveal_made(").contains("/usr/bin/open"));
        for c in ["list_made", "open_made", "reveal_made", "trash_made"] { assert!(main.contains(&format!(", {c},")) || main.contains(&format!(", {c}]")), "{c} is not registered"); }
        // Nothing here is reachable from the engine or a protocol message.
        let runner = include_str!("runner.rs");
        for c in ["list_made", "open_made", "reveal_made", "trash_made", "made::"] { assert!(!runner.contains(c), "{c}"); }
    }
}
