//! The practice projects: small projects broken on purpose that ship inside the app. The first run offers the signup page,
//! so a person who is not stuck this week still sees the whole loop (find it, fix it, prove it); Settings also offers a
//! missing setting. Each is copied into a new folder in the home folder, never over anything, and then it is simply a
//! project like any other. Only names on the list can be asked for.
use std::fs;
use std::path::{Path, PathBuf};

/// The first run's practice: a signup page whose Join button sends to the wrong address.
pub const NAME: &str = "stuck-signup";
/// The practice projects a page may ask for, by name: the first run's, and a missing setting (taught with the lesson made
/// from the project). The other stuck moments in app/sample are eval cases for now, not offered here.
pub const NAMES: &[&str] = &[NAME, "stuck-setting"];

/// The practice a page asked for, only if it is on the list (none means the first run's).
pub fn pick(which: Option<&str>) -> Result<&'static str, String> {
    match which {
        None => Ok(NAME),
        Some(w) => NAMES.iter().copied().find(|n| *n == w).ok_or_else(|| "That practice project is not in this copy of the app.".to_string()),
    }
}

/// Where a practice project is: inside the installed app, else a development override, else next to the source.
pub fn source_of(name: &str, exe: &Path, env: Option<&str>) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = vec![];
    if let Some(c) = exe.ancestors().find(|a| a.file_name().is_some_and(|n| n == "Contents")) { candidates.push(c.join("Resources/sample").join(name)); }
    if let Some(e) = env { candidates.push(PathBuf::from(e).join(name)); }
    // A development build: app/src-tauri/target/<profile>/companion-app, and the sample is app/sample.
    if let Some(app) = exe.ancestors().nth(4) { candidates.push(app.join("sample").join(name)); }
    candidates.into_iter().find(|p| p.join("package.json").is_file())
}

/// "Companion practice", then "Companion practice 2" ... in the home folder: a name nobody else is using.
pub fn destination(home: &Path, taken: impl Fn(&Path) -> bool) -> PathBuf {
    // `taken` should say yes to anything that exists, a broken link included (use `exists_at`).
    for n in 1..100 {
        let p = home.join(if n == 1 { "Companion practice".to_string() } else { format!("Companion practice {n}") });
        if !taken(&p) { return p; }
    }
    home.join(format!("Companion practice {}", std::process::id()))
}

/// True for anything at that path, even a link that leads nowhere.
pub fn exists_at(p: &Path) -> bool { fs::symlink_metadata(p).is_ok() }

/// Copies the project's files. Links are never copied and nothing is ever written over.
pub fn copy_tree(src: &Path, dst: &Path) -> Result<(), String> {
    if exists_at(dst) { return Err("That folder is already there.".into()); }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for e in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let (from, to) = (e.path(), dst.join(e.file_name()));
        let m = fs::symlink_metadata(&from).map_err(|e| e.to_string())?;
        if m.is_symlink() { continue; }
        if m.is_dir() { copy_tree(&from, &to)?; } else { fs::copy(&from, &to).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

/// Makes the practice folder, or leaves nothing behind: a copy that fails halfway is removed.
pub fn make(src: &Path, home: &Path) -> Result<PathBuf, String> {
    if !home.is_absolute() { return Err("Your home folder was not found.".into()); }
    let dst = destination(home, exists_at);
    match copy_tree(src, &dst) {
        Ok(()) => Ok(dst),
        Err(e) => { let _ = fs::remove_dir_all(&dst); Err(format!("Could not make the practice project ({e}).")) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(n: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-practice-{n}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); d }

    #[test]
    fn the_source_is_found_in_the_app_then_the_override_then_next_to_the_source() {
        let source = |exe: &Path, env: Option<&str>| source_of(NAME, exe, env);
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
    fn the_folder_name_is_one_nobody_uses() {
        let h = Path::new("/Users/sam");
        assert_eq!(destination(h, |_| false), h.join("Companion practice"));
        assert_eq!(destination(h, |p| p.ends_with("Companion practice")), h.join("Companion practice 2"));
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
        assert!(make(&src, Path::new("")).is_err()); assert!(make(&src, Path::new("relative")).is_err());
        let home = root.join("home"); fs::create_dir_all(&home).unwrap();
        std::os::unix::fs::symlink("/nowhere", home.join("Companion practice")).unwrap();   // a link to nothing holds the first name
        let made = make(&src, &home).unwrap();
        assert_eq!(made, home.join("Companion practice 2")); assert!(made.join("package.json").is_file());
        // a source that cannot be copied leaves no half made folder
        let bad = root.join("missing");
        assert!(make(&bad, &home).is_err());
        assert!(!home.join("Companion practice 3").exists());
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn the_real_sample_is_complete() {
        let exe = std::env::current_exe().unwrap();
        let _ = exe;
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample").join(NAME);
        for f in ["package.json", "server.js", "index.html", "public/signup.js", "test/signup.test.js"] { assert!(repo.join(f).is_file(), "{f}"); }
        let setting = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample/stuck-setting");
        for f in ["package.json", "server.js", "settings.js", "README.md", "test/page.test.js"] { assert!(setting.join(f).is_file(), "{f}"); }
    }
    #[test]
    fn a_page_may_choose_only_a_practice_on_the_list() {
        assert_eq!(pick(None), Ok(NAME));
        assert_eq!(pick(Some("stuck-signup")), Ok("stuck-signup"));
        assert_eq!(pick(Some("stuck-setting")), Ok("stuck-setting"));
        for bad in ["../stuck-signup", "/etc", "stuck-signup/../../x", "", "stuck-open-table", "Stuck-Setting"] { assert!(pick(Some(bad)).is_err(), "{bad}"); }
    }
    #[test]
    fn each_practice_on_the_list_is_found_the_same_way() {
        let root = tmp("names");
        let env = root.join("env");
        for n in NAMES { fs::create_dir_all(env.join(n)).unwrap(); fs::write(env.join(n).join("package.json"), "{}").unwrap(); }
        for n in NAMES { assert_eq!(source_of(n, Path::new("/x/y/companion-app"), Some(env.to_str().unwrap())), Some(env.join(n))); }
        let _ = fs::remove_dir_all(&root);
    }
}
