//! The product's names for the shell, from `protocol/names.json`: the one file the pages (`app/src/strings.ts`), the engine
//! (`runner/src/names.ts`) and this shell read, so the next rename is one edit (AGENTS.md rule 21, F24).
//!
//! Two ways to reach the same file. Sentences are written with `concat!("... ", crate::product!(), " ...")`, which the
//! compiler fills from `build.rs` (it reads the file and sets `NAMES_*`), so a name works inside a const, a format string
//! or a test. This module reads the file again with `include_str!` for code that needs the values at run time, and its
//! tests fail if the two ever disagree or if a name is missing.
//!
//! Not names, and never from here: the bundle identifier, the Keychain item names, the data folder names, the `.companion`
//! folder and the `COMPANION_*` environment names. They are identifiers; changing one loses a person's data or permissions.

use serde::Deserialize;
use std::sync::OnceLock;

pub const NAMES_TEXT: &str = include_str!("../../../protocol/names.json");

/// The checks on the file, shared with build.rs (which runs them first, so a file that would fail here stops the build
/// instead of panicking the first time a name is asked for).
#[cfg(test)]
mod check { include!("names_check.rs"); }

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
#[allow(dead_code)]
pub struct Names {
    pub version: u32,
    pub about: String,
    pub product: String,
    #[serde(rename = "productPossessive")] pub product_possessive: String,
    pub character: String,
    #[serde(rename = "characterPossessive")] pub character_possessive: String,
    #[serde(rename = "practiceCopyBase")] pub practice_copy_base: String,
    #[serde(rename = "earlierPracticeCopyBases")] pub earlier_practice_copy_bases: Vec<String>,
    #[serde(rename = "newFolderParent")] pub new_folder_parent: String,
}

pub fn names() -> &'static Names {
    static N: OnceLock<Names> = OnceLock::new();
    N.get_or_init(|| serde_json::from_str(NAMES_TEXT).expect("protocol/names.json is part of the build"))
}

/// The product's name ("Squibby") as a literal, for `concat!`.
#[macro_export]
macro_rules! product { () => { env!("NAMES_PRODUCT") }; }
/// The product's name with 's ("Squibby's") as a literal, for `concat!`.
#[macro_export]
macro_rules! product_s { () => { env!("NAMES_PRODUCT_S") }; }
/// The first character's name ("Flowflow") as a literal, for `concat!`.
#[macro_export]
macro_rules! character { () => { env!("NAMES_CHARACTER") }; }
/// The start of every practice copy's folder name ("Squibby practice") as a literal, for `concat!`.
#[macro_export]
macro_rules! practice_base { () => { env!("NAMES_PRACTICE_COPY_BASE") }; }
/// The folder every new folder goes in ("Squibby makes") as a literal, for `concat!`.
#[macro_export]
macro_rules! new_folder_parent { () => { env!("NAMES_NEW_FOLDER_PARENT") }; }

/// The product's name at run time.
pub fn product() -> &'static str { &names().product }
/// The start of every practice copy's folder name ("Squibby practice").
pub fn practice_copy_base() -> &'static str { &names().practice_copy_base }
/// Every start a practice copy's folder name may have: today's, then the names it had before a rename, so copies made
/// earlier are still known as copies (Remove my copy, Back to my project).
pub fn practice_copy_bases() -> Vec<&'static str> {
    let n = names();
    std::iter::once(n.practice_copy_base.as_str()).chain(n.earlier_practice_copy_bases.iter().map(|s| s.as_str())).collect()
}
/// The folder every new folder goes in ("Squibby makes").
pub fn new_folder_parent() -> &'static str { &names().new_folder_parent }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_compiled_names_and_the_file_agree() {
        let n = names();
        assert_eq!(crate::product!(), n.product);
        assert_eq!(crate::product_s!(), n.product_possessive);
        assert_eq!(crate::character!(), n.character);
        assert_eq!(env!("NAMES_CHARACTER_S"), n.character_possessive);
        assert_eq!(env!("NAMES_PRACTICE_COPY_BASE"), n.practice_copy_base);
        assert_eq!(env!("NAMES_NEW_FOLDER_PARENT"), n.new_folder_parent);
        assert_eq!(product(), n.product);
    }

    #[test]
    fn every_name_is_one_plain_line_and_the_forms_follow_the_name() {
        let n = names();
        for (what, v) in [("product", &n.product), ("character", &n.character), ("practice copy base", &n.practice_copy_base), ("new folder parent", &n.new_folder_parent)] {
            assert!(!v.trim().is_empty() && !v.contains('\n') && !v.contains('/'), "{what}: {v:?}");
        }
        assert_eq!(n.product_possessive, format!("{}'s", n.product));
        assert_eq!(n.character_possessive, format!("{}'s", n.character));
        assert!(n.practice_copy_base.starts_with(&n.product) && n.new_folder_parent.starts_with(&n.product));
    }

    #[test]
    fn the_file_is_the_one_the_pages_and_the_engine_read() {
        // Same bytes, one path: the include_str! above is protocol/names.json, and the other two readers name it too.
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        assert_eq!(std::fs::read_to_string(root.join("protocol/names.json")).unwrap(), NAMES_TEXT);
        for reader in ["app/src/strings.ts", "runner/src/names.ts"] {
            let text = std::fs::read_to_string(root.join(reader)).unwrap();
            assert!(text.contains("protocol/names.json\""), "{reader} must import protocol/names.json");
        }
    }

    /// The file with one change, as text.
    fn with(change: impl Fn(&mut serde_json::Value)) -> String {
        let mut v: serde_json::Value = serde_json::from_str(NAMES_TEXT).unwrap();
        change(&mut v);
        v.to_string()
    }

    #[test]
    fn the_file_in_the_repo_passes_the_build_check() {
        check::check(NAMES_TEXT).expect("protocol/names.json");
    }

    #[test]
    fn a_file_the_shell_could_not_read_stops_the_build_instead_of_panicking_at_run() {
        // names() needs every key, no others, the right kinds. build.rs used to check only six of the keys, so a file
        // without "version" or "earlierPracticeCopyBases" built fine and panicked the first time a name was asked for.
        for key in ["version", "about", "product", "productPossessive", "character", "characterPossessive", "practiceCopyBase", "earlierPracticeCopyBases", "newFolderParent"] {
            assert!(check::check(&with(|v| { v.as_object_mut().unwrap().remove(key); })).is_err(), "no {key}");
        }
        assert!(check::check(&with(|v| { v["extra"] = serde_json::json!("x"); })).is_err(), "an unknown key (names() refuses it)");
        for (key, bad) in [("version", serde_json::json!("1")), ("version", serde_json::json!(-1)), ("about", serde_json::json!(5)), ("product", serde_json::json!(5)), ("earlierPracticeCopyBases", serde_json::json!("Earlier practice copy")), ("earlierPracticeCopyBases", serde_json::json!([1]))] {
            assert!(check::check(&with(|v| { v[key] = bad.clone(); })).is_err(), "{key} = {bad}");
        }
        for text in ["", "not json", "[]", "null", "{"] { assert!(check::check(text).is_err(), "{text:?}"); }
    }

    #[test]
    fn a_name_that_could_break_a_sentence_or_a_path_stops_the_build() {
        // A name goes into concat!/format! sentences and (the folder ones) into paths under the home folder.
        let shown = ["product", "character"];
        for key in shown {
            for bad in ["", " ", " Squibby", "Squibby ", "Squi\nbby", "Squi\rbby", "Squi\tbby", "Squi\0bby", "Squi{bby", "Squi}bby", "Squi\u{202e}bby", "Squi\u{200b}bby", &"x".repeat(41)] {
                assert!(check::check(&with(|v| { v[key] = serde_json::json!(bad); })).is_err(), "{key} = {bad:?}");
            }
        }
        // Quotes, percent signs and backslashes are only text to env!() and concat!(): they are allowed.
        assert!(check::check(&with(|v| { v["product"] = serde_json::json!("Squ\"ibby 100% \\o/"); })).is_ok());
        for key in ["practiceCopyBase", "newFolderParent"] {
            for bad in ["", ".", "..", ".hidden", "a/b", "../x", "a\\b", "a:b", "x\ny", " lead", "trail ", &"x".repeat(61)] {
                assert!(check::check(&with(|v| { v[key] = serde_json::json!(bad); })).is_err(), "{key} = {bad:?}");
            }
        }
        for bad in ["", "..", "a/b", ".x"] { assert!(check::check(&with(|v| { v["earlierPracticeCopyBases"] = serde_json::json!(["Earlier practice copy", bad]); })).is_err(), "earlier = {bad:?}"); }
        assert!(check::check(&with(|v| { v["earlierPracticeCopyBases"] = serde_json::json!([]); })).is_ok());
    }

    #[test]
    fn the_build_runs_that_check_before_it_hands_any_name_to_the_compiler() {
        let b = include_str!("../build.rs");
        assert!(b.contains("names_check") && b.contains("src/names_check.rs"));
        assert!(b.find("names_check::check(").unwrap() < b.find("cargo:rustc-env").unwrap());
        assert!(b.contains("rerun-if-changed=src/names_check.rs"));
    }
}
