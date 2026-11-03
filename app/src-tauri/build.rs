// The product's names come from protocol/names.json, the one file the pages, the engine and the shell read (rule 21).
// The shell needs them as text known at compile time (so a sentence can be built with concat! and used in a const or a
// format string), so they are handed to the compiler here as environment values. src/names.rs reads the same file again
// with include_str! and a test checks the two agree.
// What the file may hold, checked here first so a bad one stops the build with a plain line, never the first time a name is
// asked for. The same file is included by src/names.rs, whose tests run the same function.
mod names_check { include!("src/names_check.rs"); }

fn main() {
    println!("cargo:rerun-if-changed=../../protocol/names.json");
    println!("cargo:rerun-if-changed=src/names_check.rs");
    let text = std::fs::read_to_string("../../protocol/names.json").expect("protocol/names.json is part of the build");
    if let Err(why) = names_check::check(&text) { panic!("protocol/names.json cannot be used: {why}"); }
    let v: serde_json::Value = serde_json::from_str(&text).expect("protocol/names.json is JSON");
    for (key, var) in [
        ("product", "NAMES_PRODUCT"),
        ("productPossessive", "NAMES_PRODUCT_S"),
        ("character", "NAMES_CHARACTER"),
        ("characterPossessive", "NAMES_CHARACTER_S"),
        ("practiceCopyBase", "NAMES_PRACTICE_COPY_BASE"),
        ("newFolderParent", "NAMES_NEW_FOLDER_PARENT"),
    ] {
        let value = v[key].as_str().unwrap_or_else(|| panic!("protocol/names.json has no text for {key}"));
        println!("cargo:rustc-env={var}={value}");
    }
    commit();
    tauri_build::build()
}

/// Must fix 6: the commit this build came from, so a tester's report can be matched to its source. Read only git commands
/// (rule 10). "unknown" outside a git checkout. release.sh only builds from a clean, tested commit, so a released build's
/// commit is exact; a developer's build says "with changes" when files differed from the commit as it was built.
fn commit() {
    let git = |args: &[&str]| std::process::Command::new("git").args(args).output().ok().filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).filter(|s| !s.is_empty());
    let id = git(&["rev-parse", "--short=12", "HEAD"]);
    let dirty = id.is_some() && git(&["--no-optional-locks", "status", "--porcelain", "--untracked-files=no"]).is_some();
    let label = match id { Some(id) if dirty => format!("{id} with changes"), Some(id) => id, None => "unknown".into() };
    println!("cargo:rustc-env=SQUIBBY_COMMIT={label}");
    // Built again when HEAD moves (a new commit or another branch) or the staging area changes.
    for p in ["HEAD", "index", "packed-refs"] { if let Some(path) = git(&["rev-parse", "--git-path", p]) { println!("cargo:rerun-if-changed={path}"); } }
    if let Some(r) = git(&["symbolic-ref", "-q", "HEAD"]) { if let Some(path) = git(&["rev-parse", "--git-path", &r]) { println!("cargo:rerun-if-changed={path}"); } }
}
