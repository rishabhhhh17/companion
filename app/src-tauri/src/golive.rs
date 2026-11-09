//! M76: saving the go live report (app/src/goLiveReport.ts) where the person picks. Only from Home, only on a press, through
//! the Mac's own save dialog (another process, so Squibby never takes the keyboard, rule 9). Nothing is sent anywhere (rule
//! 13). The bytes are checked before anything is written: a web page that starts as one, with no script and nothing loaded
//! from outside, or a PDF that starts and ends as one; 5 MB at most. The report's content itself is never logged.
use std::path::{Path, PathBuf};

pub const MAX_BYTES: usize = 5 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { Html, Pdf }
impl Kind {
    pub fn of(s: &str) -> Option<Kind> { match s { "html" => Some(Kind::Html), "pdf" => Some(Kind::Pdf), _ => None } }
    pub fn ext(self) -> &'static str { match self { Kind::Html => "html", Kind::Pdf => "pdf" } }
}

/// The bytes must really be a report of that kind before anything is written.
pub fn check(kind: Kind, bytes: &[u8]) -> Result<(), &'static str> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES { return Err("the report is empty or too big"); }
    match kind {
        Kind::Pdf => {
            let tail = &bytes[bytes.len().saturating_sub(32)..];
            if !bytes.starts_with(b"%PDF-") || !String::from_utf8_lossy(tail).contains("%%EOF") { return Err("that is not a PDF"); }
        }
        Kind::Html => {
            let Ok(t) = std::str::from_utf8(bytes) else { return Err("that is not a web page") };
            let low = t.to_ascii_lowercase();
            if !low.starts_with("<!doctype html>") { return Err("that is not a web page"); }
            // Self contained: nothing runs and nothing is fetched when the client opens it.
            for bad in ["<script", "<iframe", "<link", "<img", "src=", "href=", "@import", "url(", "javascript:"] { if low.contains(bad) { return Err("the web page must not load or run anything"); } }
        }
    }
    Ok(())
}

/// The name offered in the dialog: letters, digits, dashes and dots only, never a folder, with the right ending.
pub fn offered_name(name: &str, kind: Kind) -> String {
    let base: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let base = base.trim_matches(|c| c == '.' || c == '-').chars().take(80).collect::<String>();
    let stem = base.strip_suffix(&format!(".{}", kind.ext())).unwrap_or(&base).trim_end_matches('.').to_string();
    format!("{}.{}", if stem.is_empty() { "go-live-report".to_string() } else { stem }, kind.ext())
}

/// The path the person chose, with the ending added when they took it off. Only an absolute path to a file in a folder
/// that exists.
pub fn chosen_path(picked: &str, kind: Kind) -> Option<PathBuf> {
    let p = PathBuf::from(picked.trim_end_matches('\n'));
    if !p.is_absolute() || p.components().any(|c| c.as_os_str() == "..") { return None; }
    let p = if p.extension().is_some_and(|e| e.eq_ignore_ascii_case(kind.ext())) { p } else { let mut s = p.into_os_string(); s.push(format!(".{}", kind.ext())); PathBuf::from(s) };
    p.parent().filter(|d| d.is_dir())?;
    p.file_name()?;
    Some(p)
}

/// The words for the dialog's AppleScript, with quotes and backslashes taken out.
pub fn script_text(s: &str) -> String { s.chars().filter(|c| *c != '"' && *c != '\\' && !c.is_control()).collect() }

/// Writes the file, never through a link at that name.
pub fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) { return Err(std::io::Error::other("a link")); }
    let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).custom_flags(0x0100 /* O_NOFOLLOW */).mode(0o644).open(path)?;
    f.write_all(bytes)?;
    f.sync_all()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_a_real_report_is_written() {
        assert!(check(Kind::Html, b"<!doctype html>\n<html><body>Hi</body></html>").is_ok());
        assert!(check(Kind::Html, b"<!doctype html><script>alert(1)</script>").is_err());
        assert!(check(Kind::Html, b"<!doctype html><a href=\"https://x\">x</a>").is_err());
        assert!(check(Kind::Html, b"<html>no doctype</html>").is_err());
        assert!(check(Kind::Pdf, b"%PDF-1.4\n...\n%%EOF\n").is_ok());
        assert!(check(Kind::Pdf, b"%PDF-1.4\nno end").is_err());
        assert!(check(Kind::Pdf, b"<!doctype html>").is_err());
        assert!(check(Kind::Pdf, &vec![b'%'; MAX_BYTES + 1]).is_err());
        assert!(check(Kind::Html, b"").is_err());
    }
    #[test]
    fn the_offered_name_is_plain_and_has_its_ending() {
        assert_eq!(offered_name("mug-shop-go-live-report-2026-11-06.pdf", Kind::Pdf), "mug-shop-go-live-report-2026-11-06.pdf");
        assert_eq!(offered_name("../../etc/passwd", Kind::Html), "etc-passwd.html");
        assert_eq!(offered_name("", Kind::Pdf), "go-live-report.pdf");
        assert_eq!(offered_name("a\"b\\c.html", Kind::Html), "a-b-c.html");
    }
    #[test]
    fn the_chosen_path_must_be_absolute_in_a_real_folder_and_gets_its_ending() {
        let d = std::env::temp_dir();
        let p = chosen_path(&format!("{}/report", d.display()), Kind::Pdf).unwrap();
        assert!(p.to_string_lossy().ends_with("/report.pdf"));
        assert!(chosen_path(&format!("{}/r.PDF\n", d.display()), Kind::Pdf).unwrap().to_string_lossy().ends_with("r.PDF"));
        assert!(chosen_path("report.pdf", Kind::Pdf).is_none());
        assert!(chosen_path("/no/such/folder/r.pdf", Kind::Pdf).is_none());
        assert!(chosen_path(&format!("{}/../x.pdf", d.display()), Kind::Pdf).is_none());
    }
    #[test]
    fn a_link_at_the_chosen_name_is_never_written_through() {
        let d = std::env::temp_dir().join(format!("companion-golive-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap();
        let outside = d.join("precious.txt"); std::fs::write(&outside, "mine").unwrap();
        std::os::unix::fs::symlink(&outside, d.join("r.pdf")).unwrap();
        assert!(write(&d.join("r.pdf"), b"%PDF-").is_err());
        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "mine");
        write(&d.join("ok.pdf"), b"%PDF-1.4").unwrap();
        assert_eq!(std::fs::read(d.join("ok.pdf")).unwrap(), b"%PDF-1.4");
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn saving_is_only_from_home_on_a_press_and_never_logs_the_report() {
        let main = include_str!("main.rs");
        let f = &main[main.find("fn save_report(").expect("save_report")..]; let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("settings::only_card(window.label())"), "{f}");
        assert!(f.find("golive::check(").unwrap() < f.find("golive::write(").unwrap(), "checked before anything is written");
        assert!(!f.contains("\"data\":") && !f.contains("http"), "{f}");
        assert!(f.contains("choose file name"));
    }
}
