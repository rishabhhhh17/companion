// The product's names come from protocol/names.json, the one file the pages, the engine and the shell read (rule 21).
// The shell needs them as text known at compile time (so a sentence can be built with concat! and used in a const or a
// format string), so they are handed to the compiler here as environment values. src/names.rs reads the same file again
// with include_str! and a test checks the two agree.
fn main() {
    println!("cargo:rerun-if-changed=../../protocol/names.json");
    let text = std::fs::read_to_string("../../protocol/names.json").expect("protocol/names.json is part of the build");
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
        assert!(!value.is_empty() && !value.contains('\n'), "protocol/names.json: {key} must be one line");
        println!("cargo:rustc-env={var}={value}");
    }
    tauri_build::build()
}
