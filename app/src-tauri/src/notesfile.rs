//! M78: the notes export file (runner/src/memory/backup.ts) saved where the person picks, and read back for a restore. Only
//! from Home, only on a press, through the Mac's own save and open dialogs (another process, so Squibby never takes the
//! keyboard, rule 9). Nothing is sent anywhere. Before anything is written or handed to the page, the text must be one of
//! Squibby's notes exports: plain text, 1 MB at most, with the export's own line. A link is never written through or read.
//! The notes themselves are never logged.
use std::path::{Path, PathBuf};

/// The largest export (the runner's RESTORE_MAX).
pub const MAX_BYTES: usize = 1024 * 1024;
/// The line every export carries (backup.ts EXPORT_MARK).
pub const MARK: &str = "notes export, version 1.";

/// The text must really be an export before it is written or read back.
pub fn check(text: &str) -> Result<(), &'static str> {
    if text.is_empty() || text.len() > MAX_BYTES { return Err("the notes file is empty or too big"); }
    if text.contains('\0') || !text.contains(MARK) { return Err("that is not a notes export"); }
    Ok(())
}

/// The name offered in the save dialog: letters, digits, dashes and dots only, never a folder, ending in .txt.
pub fn offered_name(name: &str) -> String {
    let base: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let base = base.trim_matches(|c| c == '.' || c == '-').chars().take(80).collect::<String>();
    let stem = base.strip_suffix(".txt").unwrap_or(&base).trim_end_matches('.').to_string();
    format!("{}.txt", if stem.is_empty() { "notes".to_string() } else { stem })
}

/// The path the person chose to save to, with .txt added when they took it off. Only an absolute path to a file in a folder
/// that exists.
pub fn chosen_path(picked: &str) -> Option<PathBuf> {
    let p = PathBuf::from(picked.trim_end_matches('\n'));
    if !p.is_absolute() || p.components().any(|c| c.as_os_str() == "..") { return None; }
    let p = if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("txt")) { p } else { let mut s = p.into_os_string(); s.push(".txt"); PathBuf::from(s) };
    p.parent().filter(|d| d.is_dir())?;
    p.file_name()?;
    Some(p)
}

/// Reads a file the person chose in the open dialog: a plain file (never a link), at most MAX_BYTES, text, an export.
pub fn read(path: &Path) -> Result<String, &'static str> {
    if !path.is_absolute() { return Err("that file cannot be read"); }
    let meta = std::fs::symlink_metadata(path).map_err(|_| "that file cannot be read")?;
    if !meta.file_type().is_file() { return Err("that file cannot be read"); }
    if meta.len() as usize > MAX_BYTES { return Err("the notes file is empty or too big"); }
    let bytes = std::fs::read(path).map_err(|_| "that file cannot be read")?;
    let text = String::from_utf8(bytes).map_err(|_| "that is not a notes export")?;
    check(&text)?;
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    const OK: &str = "# Everything Squibby remembers\n\nSquibby notes export, version 1. Saved 2026-11-10.\n\n## About this project\n- Uses Vite\n";
    struct T(PathBuf);
    impl Drop for T { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
    fn dir(name: &str) -> T { let d = std::env::temp_dir().join(format!("companion-notesfile-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap(); T(d) }

    #[test]
    fn only_an_export_is_written_or_read_back() {
        assert!(check(OK).is_ok());
        assert!(check("").is_err());
        assert!(check("# My notes\n- Uses Vite\n").is_err());
        assert!(check(&format!("{OK}\0")).is_err());
        assert!(check(&format!("{OK}{}", "x".repeat(MAX_BYTES))).is_err());
    }
    #[test]
    fn the_name_and_the_path() {
        assert_eq!(offered_name("mug shop notes 2026-11-10"), "mug-shop-notes-2026-11-10.txt");
        assert_eq!(offered_name("../../x.txt"), "x.txt");
        assert_eq!(offered_name(""), "notes.txt");
        let d = dir("path");
        assert_eq!(chosen_path(&format!("{}/mine", d.0.display())), Some(d.0.join("mine.txt")));
        assert_eq!(chosen_path(&format!("{}/mine.TXT", d.0.display())), Some(d.0.join("mine.TXT")));
        assert!(chosen_path("relative.txt").is_none());
        assert!(chosen_path(&format!("{}/../x.txt", d.0.display())).is_none());
        assert!(chosen_path(&format!("{}/nofolder/x.txt", d.0.display())).is_none());
    }
    #[test]
    fn a_link_a_folder_a_big_file_or_another_file_is_never_read() {
        let d = dir("read");
        let good = d.0.join("notes.txt"); std::fs::write(&good, OK).unwrap();
        assert_eq!(read(&good).unwrap(), OK);
        let link = d.0.join("link.txt"); std::os::unix::fs::symlink(&good, &link).unwrap();
        assert!(read(&link).is_err());
        assert!(read(&d.0).is_err());
        let other = d.0.join("other.txt"); std::fs::write(&other, "hello").unwrap();
        assert!(read(&other).is_err());
        let big = d.0.join("big.txt"); std::fs::write(&big, format!("{OK}{}", "x".repeat(MAX_BYTES))).unwrap();
        assert!(read(&big).is_err());
        let bin = d.0.join("bin.txt"); std::fs::write(&bin, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read(&bin).is_err());
    }
    #[test]
    fn the_mark_is_the_runners_own() {
        let ts = include_str!("../../../runner/src/memory/backup.ts");
        assert!(ts.contains(&format!("EXPORT_MARK = \"{MARK}\"")) && ts.contains("RESTORE_MAX = 1024 * 1024"));
    }
}
