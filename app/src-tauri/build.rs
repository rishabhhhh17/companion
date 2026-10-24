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
    tauri_build::build()
}
