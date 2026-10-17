//! The "it's live" card leaves Companion only when the person presses a button: Save picture writes it to their
//! Downloads folder (never over an existing file), Copy link puts the live address on the clipboard. Links on Home (the
//! live and preview addresses, a research note's source) open in the person's own browser only on a press, and only when
//! they are a plain web address (`web_link`).
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

/// Only a web address may be put on the clipboard from this button (the same check as opening one).
pub fn is_web_link(s: &str) -> bool { web_link(s).is_some() }

/// Characters that change how text looks without showing (right to left overrides, zero width spaces, a soft hyphen).
pub fn hidden_char(c: char) -> bool { matches!(c, '\u{ad}' | '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{2069}' | '\u{feff}') }

fn parsed(s: &str) -> Option<tauri::Url> {
    if !(s.starts_with("https://") || s.starts_with("http://")) || s.len() >= 2048 { return None; }
    if s.chars().any(|c| c.is_whitespace() || c.is_control() || hidden_char(c)) { return None; }
    let u = tauri::Url::parse(s).ok()?;
    // A name and password before the site ("https://paypal.com@evil.example") hides where the link really goes.
    if !matches!(u.scheme(), "https" | "http") || !u.username().is_empty() || u.password().is_some() { return None; }
    if u.host_str().map_or(true, str::is_empty) { return None; }
    Some(u)
}

/// The address to open, or None when it is not a plain web address: http or https only, a real site name, no name or
/// password in it, no spaces or hidden characters. What is opened is the address as checked (a look alike site name from
/// another alphabet becomes its punycode name), so it always starts with http:// or https:// and is never read as an option.
pub fn web_link(s: &str) -> Option<String> { parsed(s).map(|u| u.as_str().to_string()) }

/// The name of the site, as it will really be opened (a look alike name shows as its punycode name).
pub fn link_host(s: &str) -> Option<String> { parsed(s).and_then(|u| u.host_str().map(str::to_string)) }

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
    #[test]
    fn a_plain_web_address_is_opened_as_it_was_checked() {
        assert_eq!(web_link("https://mug-shop.vercel.app").as_deref(), Some("https://mug-shop.vercel.app/"));
        assert_eq!(web_link("https://docs.stripe.com/payments?lang=en#cards").as_deref(), Some("https://docs.stripe.com/payments?lang=en#cards"));
        assert_eq!(web_link("http://localhost:3000/signup").as_deref(), Some("http://localhost:3000/signup"));
        // A look alike name from another alphabet is opened by its real (punycode) name, never by how it looks.
        assert_eq!(web_link("https://g\u{456}thub.com/x").as_deref(), Some("https://xn--gthub-n2e.com/x"));
        assert_eq!(link_host("https://g\u{456}thub.com/x").as_deref(), Some("xn--gthub-n2e.com"));
        assert_eq!(link_host("https://Docs.Stripe.com/a").as_deref(), Some("docs.stripe.com"));
        assert_eq!(link_host("rm -rf ~"), None);
    }
    #[test]
    fn anything_but_a_plain_web_address_is_refused() {
        for bad in [
            "", "example.com", "www.example.com", "ftp://example.com/file", "file:///etc/passwd", "javascript:alert(1)",
            "data:text/html,<script>1</script>", "mailto:a@b.c", "x-apple.systempreferences:com.apple.preference.security",
            "vscode://file/etc/passwd", "-a Terminal", "--args https://x.com", "HTTPS://EXAMPLE.COM", "https:example.com",
            "https:/example.com", "https://", "https:// example.com", "https://exa mple.com", "https://example.com/a b",
            "https://example.com\n", "\nhttps://example.com", " https://example.com", "https://example.com\t", "https://a.com\u{0}",
            "https://user:pass@example.com", "https://paypal.com@evil.example", "https://user@example.com",
            "https://example.com/\u{202e}moc.live", "https://\u{200b}example.com", "https://example.com/\u{feff}",
        ] {
            assert_eq!(web_link(bad), None, "{bad:?} must not be opened");
            assert!(!is_web_link(bad), "{bad:?} must not be copied");
        }
        assert_eq!(web_link(&format!("https://example.com/{}", "a".repeat(2100))), None, "too long");
    }
}
