//! M88 (b): Share what my AI did. The page (app/src/shareReceipt.ts) makes one self contained web page from a History row or
//! This week, shows it first, and on Save the shell writes it where the person picks, through the Mac's own save dialog
//! (another process, so Squibby never takes the keyboard, rule 9). No server and no upload. Before anything is written the
//! page is checked again here: a web page that starts as one, nothing that runs or loads from outside, at most one picture
//! and only as a JPEG or PNG inside the page itself, and no folder path of this Mac in it. The page itself is never logged.
use std::path::PathBuf;

/// The largest page: the words are small; the proof picture is the bulk.
pub const MAX_BYTES: usize = 8 * 1024 * 1024;
/// Shapes of a folder on this Mac (or another computer): the page names the project only, never where it lives.
const PATHS: [&str; 7] = ["/users/", "/home/", "/private/", "/var/folders/", "/volumes/", "~/", "c:\\"];
/// Schemes that could load something. Each is refused only where it works as one: followed by `//`, or straight after a
/// quote, `=`, `(` or a backtick (an attribute or a style). The same letters in plain words ("Fix the profile: avatar") are
/// words: every text part is escaped, and nothing in a text part can load.
const SCHEMES: [(&str, &str); 3] = [("file:", "path"), ("http:", "loads"), ("https:", "loads")];

/// Whether `scheme` is used as one anywhere in `low` (lower case).
fn scheme_used(low: &str, scheme: &str) -> bool {
    let b = low.as_bytes();
    low.match_indices(scheme).any(|(i, _)| {
        let before = if i == 0 { b' ' } else { b[i - 1] };
        let after = &low[i + scheme.len()..];
        // Inside a longer word ("xhttp:") it is still refused when it can load: the slashes decide.
        matches!(before, b'"' | b'\'' | b'=' | b'(' | b'`') || after.starts_with("//") || after.starts_with("\\\\") || after.starts_with("/\\") || after.starts_with("\\/")
    })
}

/// The meta lines a receipt may have, as the page writes them (lower case here): the charset, the width, light colours, and
/// a policy that lets nothing load but the styles and the picture inside the page.
const META: [&str; 4] = [
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<meta name=\"color-scheme\" content=\"light\">",
    "<meta http-equiv=\"content-security-policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:\">",
];

/// The page must be a self contained receipt before anything is written.
pub fn check(html: &str) -> Result<(), &'static str> {
    if html.is_empty() || html.len() > MAX_BYTES { return Err("notReceipt"); }
    let all = html.to_ascii_lowercase();
    if !all.starts_with("<!doctype html>") { return Err("notReceipt"); }
    // At most one picture, and only one carried inside the page: its bytes are checked, then left out of every other check
    // (picture data can spell anything).
    let imgs = all.matches("<img").count();
    if imgs > 1 || all.matches("src=").count() != imgs { return Err("loads"); }
    let low = match all.find("src=") {
        None => all,
        Some(i) => {
            let v = &html[i + 4..];
            let head = if v.starts_with("\"data:image/jpeg;base64,") { 24 } else if v.starts_with("\"data:image/png;base64,") { 23 } else { return Err("loads") };
            let data = &v[head..];
            let end = data.find('"').ok_or("loads")?;
            if end == 0 || !data[..end].bytes().all(|c| c.is_ascii_alphanumeric() || c == b'+' || c == b'/' || c == b'=') { return Err("loads"); }
            format!("{}{}", &all[..i + 4 + head], &all[i + 4 + head + end..])
        }
    };
    for bad in ["<script", "<iframe", "<link", "<object", "<embed", "<form", "<svg", "<base", "<video", "<audio", "<source", "href=", "srcset=", "@import", "url(", "javascript:"] {
        if low.contains(bad) { return Err("loads"); }
    }
    // Only the page's own meta lines (shareReceipt.ts RECEIPT_META), never a refresh to somewhere else.
    if low.matches("<meta").count() != META.iter().map(|m| low.matches(m).count()).sum::<usize>() { return Err("loads"); }
    // No handler that runs on an event (onload=, onerror= ...), with or without a space before it.
    let b = low.as_bytes();
    for (i, _) in low.match_indices("on") {
        let before = if i == 0 { b' ' } else { b[i - 1] };
        if !(before.is_ascii_whitespace() || before == b'"' || before == b'\'' || before == b'/') { continue; }
        let rest = &b[i + 2..];
        let n = rest.iter().take_while(|c| c.is_ascii_lowercase()).count();
        if n > 0 && rest.get(n) == Some(&b'=') { return Err("loads"); }
    }
    for (scheme, why) in SCHEMES { if scheme_used(&low, scheme) { return Err(why); } }
    if PATHS.iter().any(|p| low.contains(p)) { return Err("path"); }
    Ok(())
}

/// The name offered in the dialog: letters, digits, dashes and dots only, never a folder, ending in .html.
pub fn offered_name(name: &str) -> String {
    let base: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let base = base.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
    let base = base.trim_matches(|c| c == '.' || c == '-').chars().take(80).collect::<String>();
    let stem = base.strip_suffix(".html").unwrap_or(&base).trim_end_matches('.').to_string();
    format!("{}.html", if stem.is_empty() { "what-my-ai-did".to_string() } else { stem })
}

/// The path the person chose: absolute, in a folder that exists, ending in .html (golive.rs's rule).
pub fn chosen_path(picked: &str) -> Option<PathBuf> { crate::golive::chosen_path(picked, crate::golive::Kind::Html) }

#[cfg(test)]
mod tests {
    use super::*;
    const OK: &str = "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta charset=\"utf-8\"><title>What my AI did</title><style>body{color:#1A1A1A}</style></head><body><h1>What my AI did</h1><p>Its checks passed.</p><img src=\"data:image/jpeg;base64,/9j/4AAQSkZJRg==\" alt=\"The page\"></body></html>";

    #[test]
    fn a_self_contained_receipt_is_written() {
        assert!(check(OK).is_ok());
        assert!(check(&OK.replace("<img src=\"data:image/jpeg;base64,/9j/4AAQSkZJRg==\" alt=\"The page\">", "")).is_ok(), "no picture is fine");
        assert!(check(&OK.replace("jpeg", "png")).is_ok());
        assert!(check(&format!("{OK}{}", "x".repeat(MAX_BYTES))).is_err());
        assert!(check("").is_err() && check("<html>no doctype</html>").is_err());
    }
    #[test]
    fn nothing_that_runs_or_loads_from_outside() {
        for bad in [
            "<script>alert(1)</script>", "<a href=\"https://x.com\">x</a>", "<img src=\"https://x.com/a.jpg\">", "<link rel=stylesheet href=x>",
            "<iframe srcdoc=x></iframe>", "<style>@import 'x.css'</style>", "<div style=\"background:url(x)\"></div>", "<svg onload=alert(1)>",
            "<body onload=\"x()\">", "<p onclick='x()'>", "<img/onerror=x src=\"data:image/jpeg;base64,AA==\">", "<meta http-equiv=\"refresh\" content=\"0;x\">",
            "<img src=\"data:image/svg+xml;base64,AA==\">", "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\">", "<img src=\"data:image/jpeg;base64,AA==\" onerror=\"x\">", "<object data=x></object>", "<form action=x></form>",
            "<img src=\"data:image/jpeg;base64,A A\">", "<base target=x>",
        ] {
            assert!(check(&OK.replace("<p>Its checks passed.</p>", bad)).is_err(), "{bad}");
        }
        let two = OK.replace("</body>", "<img src=\"data:image/jpeg;base64,AA==\"></body>");
        // Picture data that happens to spell a handler or a folder is only data.
        assert!(check(&OK.replace("/9j/4AAQSkZJRg==", "/9j/onAB/Users/x==")).is_ok());
        assert!(check(&two).is_err(), "one picture at most");
        // Words that only look like a handler are fine.
        assert!(check(&OK.replace("<p>Its checks passed.</p>", "<p>One check ran on the button.</p>")).is_ok());
    }
    #[test]
    fn no_folder_of_this_mac_is_ever_in_it() {
        for bad in ["/Users/me/mug-shop/src", "/home/me/x", "~/Desktop/shop", "/private/var/folders/x", "file:///x", "C:\\Users\\me"] {
            assert_eq!(check(&OK.replace("Its checks passed.", bad)), Err("path"), "{bad}");
        }
    }
    #[test]
    fn a_colon_in_plain_words_is_not_a_link_or_a_path() {
        for ok in ["Fix the profile: avatar upload", "Update user profile: name", "Make http: redirects work", "Fix https: on the shop", "Read the file: notes"] {
            assert_eq!(check(&OK.replace("Its checks passed.", ok)), Ok(()), "{ok}");
        }
        // As a scheme that could load something, they are still refused.
        assert!(check(&OK.replace("Its checks passed.", "see file:///etc")).is_err());
        assert!(check(&OK.replace("Its checks passed.", "go to https://x.com")).is_err());
        assert!(check(&OK.replace("<p>Its checks passed.</p>", "<p title=\"file:x\">x</p>")).is_err());
        assert!(check(&OK.replace("<p>Its checks passed.</p>", "<p title=http:x>x</p>")).is_err());
    }
    #[test]
    fn the_pages_own_receipt_passes_the_check() {
        // Made by app/src/shareReceipt.ts receiptHtml; app/src/m88.test.ts holds that the page still makes exactly this.
        let page = include_str!("../../../protocol/fixtures/m88-receipt.html");
        assert_eq!(check(page), Ok(()));
        assert!(check(&page.replace("Fix the contact form", "Fixed /Users/sam/shop/src/App.tsx")).is_err());
    }
    #[test]
    fn the_name_and_the_place() {
        assert_eq!(offered_name("mug shop what my AI did 2026-11-14"), "mug-shop-what-my-AI-did-2026-11-14.html");
        assert_eq!(offered_name("../../etc/passwd"), "etc-passwd.html");
        assert_eq!(offered_name(""), "what-my-ai-did.html");
        let d = std::env::temp_dir();
        assert!(chosen_path(&format!("{}/shop", d.display())).unwrap().to_string_lossy().ends_with("/shop.html"));
        assert!(chosen_path("shop.html").is_none());
    }
    #[test]
    fn saving_is_home_only_checked_first_through_the_macs_own_dialog_and_never_logs_the_page() {
        let src = include_str!("shell_tools.rs");
        let f = &src[src.find("fn save_receipt(").expect("save_receipt")..]; let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("settings::only_card(window.label())"));
        assert!(f.find("receiptfile::check(").unwrap() < f.find("golive::write(").unwrap(), "checked before anything is written");
        assert!(f.contains("choose file name"));
        assert!(!f.contains("json!({ \"html\"") && !f.contains("http"), "{f}");
    }
}
