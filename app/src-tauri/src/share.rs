//! The "it's live" card leaves Companion only when the person presses a button: Save picture writes it to their
//! Downloads folder (never over an existing file), Copy link puts the live address on the clipboard.
use std::path::{Path, PathBuf};

/// "Mug shop" -> "mug-shop-is-live.jpg", and "-2", "-3" ... when that name is taken. Never leaves the folder.
pub fn card_path(dir: &Path, title: &str, taken: impl Fn(&Path) -> bool) -> PathBuf {
    let slug: String = title.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' }).collect();
    let slug = slug.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
    let slug = if slug.is_empty() { "my-project".to_string() } else { slug.chars().take(40).collect() };
    for n in 1..1000 {
        let name = if n == 1 { format!("{slug}-is-live.jpg") } else { format!("{slug}-is-live-{n}.jpg") };
        let p = dir.join(name);
        if !taken(&p) { return p; }
    }
    dir.join(format!("{slug}-is-live-{}.jpg", std::process::id()))
}

/// The bytes must really be a JPEG of a sensible size before anything is written.
pub fn check_jpeg(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 { return Err("that is not a picture".into()); }
    if bytes.len() > 8 * 1024 * 1024 { return Err("the picture is too big".into()); }
    Ok(())
}

/// Only a web address may be put on the clipboard from this button.
pub fn is_web_link(s: &str) -> bool {
    (s.starts_with("https://") || s.starts_with("http://")) && s.len() < 2048 && !s.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn the_file_is_named_after_the_project_and_never_replaces_one() {
        let d = Path::new("/Users/me/Downloads");
        assert_eq!(card_path(d, "Mug shop", |_| false), d.join("mug-shop-is-live.jpg"));
        assert_eq!(card_path(d, "Mug shop", |p| p.ends_with("mug-shop-is-live.jpg")), d.join("mug-shop-is-live-2.jpg"));
        assert_eq!(card_path(d, "../../etc/passwd", |_| false), d.join("etc-passwd-is-live.jpg"));
        assert_eq!(card_path(d, "★★", |_| false), d.join("my-project-is-live.jpg"));
    }
    #[test]
    fn only_a_real_jpeg_is_saved() {
        assert!(check_jpeg(&[0xFF, 0xD8, 0xFF, 0xE0]).is_ok());
        assert!(check_jpeg(b"<html>").is_err());
        assert!(check_jpeg(&[]).is_err());
    }
    #[test]
    fn only_web_links_are_copied() {
        assert!(is_web_link("https://mug-shop.vercel.app"));
        assert!(!is_web_link("rm -rf ~"));
        assert!(!is_web_link("https://a.com\nrm -rf"));
        assert!(!is_web_link("javascript:alert(1)"));
    }
}
