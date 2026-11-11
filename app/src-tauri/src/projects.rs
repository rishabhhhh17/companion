//! Which folder Companion works in. The person picks it; nothing is guessed from other apps. A folder is only ever
//! used after the person chose it, and some places (the whole home folder, system folders) are never accepted.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Default, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Projects {
    pub current: Option<String>,
    pub recent: Vec<String>,
}

const REFUSED_PREFIXES: &[&str] = &["/System", "/Library", "/usr", "/bin", "/sbin", "/etc", "/private", "/dev", "/Applications", "/opt", "/var"];

/// A folder is acceptable when it exists, is a real folder inside the person's own space, and is not so broad that
/// "work in here" would mean "work on everything".
pub fn validate(path: &str, home: &str, data_dir: &Path) -> Result<PathBuf, String> {
    let p = PathBuf::from(path.trim());
    if !p.is_absolute() { return Err("Pick a folder from the list so the whole path is known.".into()); }
    let real = std::fs::canonicalize(&p).map_err(|_| "That folder could not be found.".to_string())?;
    if !real.is_dir() { return Err("That is a file, not a folder.".into()); }
    let home_real = std::fs::canonicalize(home).unwrap_or_else(|_| PathBuf::from(home));
    if real == Path::new("/") || real == home_real { return Err("That folder is too broad. Pick the folder of one project.".into()); }
    for pre in REFUSED_PREFIXES {
        // /var/folders and /private/var hold temporary files of tests; a real project is never in a system place.
        if real.starts_with(pre) && !real.starts_with(&home_real) { return Err("That is a system folder. Pick the folder of one of your projects.".into()); }
    }
    let lib = home_real.join("Library");
    if real.starts_with(&lib) || real == lib { return Err("That is inside your Library folder, which holds app data. Pick one of your projects.".into()); }
    let data = std::fs::canonicalize(data_dir).unwrap_or_else(|_| data_dir.to_path_buf());
    if real.starts_with(&data) { return Err(concat!("That is ", crate::product_s!(), " own folder. Pick one of your projects.").into()); }
    for hidden in [".ssh", ".aws", ".gnupg", ".kube", ".docker", ".config", ".claude"] {
        if real.starts_with(home_real.join(hidden)) { return Err("That folder holds private settings. Pick one of your projects.".into()); }
    }
    Ok(real)
}

impl Projects {
    pub fn use_folder(&mut self, folder: &str) {
        self.current = Some(folder.to_string());
        self.recent.retain(|r| r != folder);
        self.recent.insert(0, folder.to_string());
        self.recent.truncate(8);
    }
    /// A folder that went to the Trash (a practice copy the person removed): off the list, and no longer the current one.
    pub fn forget(&mut self, folder: &str) {
        self.recent.retain(|r| r != folder);
        if self.current.as_deref() == Some(folder) { self.current = None; }
    }
    /// The same, with every entry that is not an acceptable folder dropped (`validate`): a stale entry from an older build or a
    /// hand edited file, such as ~/.ssh or Companion's own folder, is never the working folder.
    pub fn checked(&self, home: &str, data_dir: &Path) -> Projects {
        let ok = |p: &String| validate(p, home, data_dir).is_ok();
        Projects { current: self.current.clone().filter(|c| ok(c)), recent: self.recent.iter().filter(|r| ok(r)).cloned().collect() }
    }
    /// Recent folders that still exist, so a deleted project never lingers in the list.
    pub fn still_there(&self) -> Vec<String> { self.recent.iter().filter(|r| Path::new(r).is_dir()).cloned().collect() }
}

pub fn load(file: &Path) -> Projects {
    std::fs::read_to_string(file).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// Asks the Mac's own folder chooser. It runs in another process, so Companion never takes the keyboard.
pub fn choose_folder() -> Option<String> { choose(concat!("Pick the folder of the project ", crate::product!(), " should work in")) }

/// Where a project copied from a link should go: the new folder is made inside the one chosen here.
pub fn choose_parent() -> Option<String> { choose("Pick where to put the project (a new folder is made inside it)") }

/// The folder a copied project goes into. Your home folder itself is fine here (the project gets its own folder
/// inside it); system places, your Library, Companion's own data and private settings folders are not.
pub fn validate_parent(path: &str, home: &str, data_dir: &Path) -> Result<PathBuf, String> {
    let home_real = std::fs::canonicalize(home).unwrap_or_else(|_| PathBuf::from(home));
    if std::fs::canonicalize(path.trim()).ok().as_deref() == Some(home_real.as_path()) { return Ok(home_real); }
    validate(path, home, data_dir).map_err(|e| if e.contains("too broad") { "That folder cannot hold a project. Pick another one.".into() } else { e })
}

fn choose(prompt: &str) -> Option<String> {
    let script = format!("POSIX path of (choose folder with prompt \"{prompt}\")");
    let out = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output().ok()?;
    if !out.status.success() { return None; }          // cancelled
    let s = String::from_utf8_lossy(&out.stdout).trim().trim_end_matches('/').to_string();
    if s.is_empty() { None } else { Some(s) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_copied_project_may_go_in_the_home_folder_but_never_a_system_or_private_place() {
        let home = tmp("home-p"); let data = tmp("data-p");
        assert!(validate_parent(home.to_str().unwrap(), home.to_str().unwrap(), &data).is_ok());
        std::fs::create_dir_all(home.join(".ssh")).unwrap();
        assert!(validate_parent(home.join(".ssh").to_str().unwrap(), home.to_str().unwrap(), &data).is_err());
        assert!(validate_parent("/", home.to_str().unwrap(), &data).is_err());
        assert!(validate_parent(data.to_str().unwrap(), home.to_str().unwrap(), &data).is_err());
    }
    fn tmp(name: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("proj-{}-{}", name, std::process::id())); let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap(); d }

    #[test]
    fn a_stale_or_hand_edited_entry_that_validate_refuses_is_never_loaded_as_the_folder() {
        let home = tmp("home-chk"); let data = home.join("Library/Application Support/dev.companion.app");
        let (good, ssh) = (home.join("Developer/shop"), home.join(".ssh"));
        for d in [&good, &ssh, &data] { std::fs::create_dir_all(d).unwrap(); }
        let good_real = std::fs::canonicalize(&good).unwrap().to_string_lossy().to_string();
        let p = Projects { current: Some(ssh.to_string_lossy().to_string()), recent: vec![data.to_string_lossy().to_string(), good_real.clone(), ssh.to_string_lossy().to_string()] };
        let c = p.checked(home.to_str().unwrap(), &data);
        assert_eq!(c, Projects { current: None, recent: vec![good_real.clone()] });
        let ok = Projects { current: Some(good_real.clone()), recent: vec![good_real.clone()] };
        assert_eq!(ok.checked(home.to_str().unwrap(), &data), ok);
        let main = crate::main_src();
        let start = &main[main.find("let saved = projects::load(").unwrap()..]; let start = &start[..start.find('\n').unwrap()];
        assert!(start.contains(".checked("), "{start}");
    }
    #[test]
    fn a_folder_can_be_forgotten_from_the_list_and_as_the_current_one() {
        let mut p = Projects::default();
        p.use_folder("/Users/sam/a"); p.use_folder(concat!("/Users/sam/", crate::practice_base!(), " signup page"));
        p.forget(concat!("/Users/sam/", crate::practice_base!(), " signup page"));
        assert_eq!(p, Projects { current: None, recent: vec!["/Users/sam/a".into()] });
        p.forget("/Users/sam/never-there");
        assert_eq!(p.recent, vec!["/Users/sam/a".to_string()]);
        p.use_folder("/Users/sam/b"); p.forget("/Users/sam/a");
        assert_eq!(p, Projects { current: Some("/Users/sam/b".into()), recent: vec!["/Users/sam/b".into()] });
    }
    #[test]
    fn an_ordinary_project_folder_is_accepted() {
        let home = tmp("home"); let p = home.join("Developer/shop"); std::fs::create_dir_all(&p).unwrap();
        let ok = validate(p.to_str().unwrap(), home.to_str().unwrap(), &home.join("Library/Application Support/dev.companion.app")).unwrap();
        assert!(ok.ends_with("Developer/shop"));
    }
    #[test]
    fn the_whole_home_folder_and_the_root_are_too_broad() {
        let home = tmp("home2");
        assert!(validate(home.to_str().unwrap(), home.to_str().unwrap(), &home).is_err());
        assert!(validate("/", home.to_str().unwrap(), &home).is_err());
    }
    #[test]
    fn system_places_are_refused() {
        let home = tmp("home3");
        for p in ["/System", "/usr/bin", "/Library", "/Applications"] { assert!(validate(p, home.to_str().unwrap(), &home).is_err(), "{p}"); }
    }
    #[test]
    fn private_places_inside_home_are_refused() {
        let home = tmp("home4");
        for d in [".ssh", ".aws", "Library/Keychains", ".claude"] { let p = home.join(d); std::fs::create_dir_all(&p).unwrap(); assert!(validate(p.to_str().unwrap(), home.to_str().unwrap(), &home).is_err(), "{d}"); }
    }
    #[test]
    fn companions_own_folder_is_refused() {
        let home = tmp("home5"); let data = home.join("data"); std::fs::create_dir_all(data.join("shadow")).unwrap();
        assert!(validate(data.join("shadow").to_str().unwrap(), home.to_str().unwrap(), &data).is_err());
    }
    #[test]
    fn a_missing_folder_a_file_and_a_relative_path_are_refused_in_plain_words() {
        let home = tmp("home6"); let f = home.join("a.txt"); std::fs::write(&f, "x").unwrap();
        for p in [home.join("nope").to_str().unwrap().to_string(), f.to_str().unwrap().to_string(), "relative/path".to_string()] {
            let e = validate(&p, home.to_str().unwrap(), &home).unwrap_err();
            assert!(!e.contains("Err") && e.ends_with('.'), "{e}");
        }
    }
    #[test]
    fn a_link_to_a_system_folder_does_not_get_past() {
        let home = tmp("home7"); let l = home.join("sneaky"); std::os::unix::fs::symlink("/System", &l).unwrap();
        assert!(validate(l.to_str().unwrap(), home.to_str().unwrap(), &home).is_err());
    }
    #[test]
    fn recent_folders_keep_the_newest_first_without_repeats_and_at_most_eight() {
        let mut p = Projects::default();
        for i in 0..10 { p.use_folder(&format!("/x/{i}")); }
        p.use_folder("/x/5");
        assert_eq!(p.recent.len(), 8); assert_eq!(p.recent[0], "/x/5"); assert_eq!(p.recent.iter().filter(|r| *r == "/x/5").count(), 1);
        assert_eq!(p.current.as_deref(), Some("/x/5"));
    }
    #[test]
    fn deleted_folders_drop_out_of_the_list() {
        let d = tmp("keep"); let mut p = Projects::default(); p.use_folder(d.to_str().unwrap()); p.use_folder("/definitely/not/here");
        assert_eq!(p.still_there(), vec![d.to_str().unwrap().to_string()]);
    }
    #[test]
    fn a_damaged_file_reads_as_empty() {
        let d = tmp("dmg"); let f = d.join("projects.json"); std::fs::write(&f, "{ nope").unwrap();
        assert_eq!(load(&f), Projects::default());
    }
}
