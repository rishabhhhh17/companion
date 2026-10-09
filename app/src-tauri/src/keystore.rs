//! Saving the person's own API key into the macOS Keychain. The key goes in through the page's password box, once,
//! straight to the Keychain: it is never logged, never kept in the page, and the command that stores it is fed through
//! standard input, so it never appears in a process list. The engine reads it back from the same place.

pub const SERVICE: &str = "companion";
pub const ACCOUNT: &str = "anthropic";

/// A key as Anthropic issues them: starts "sk-ant-", letters, digits, dashes and underscores, no spaces.
pub fn check(raw: &str) -> Result<String, String> {
    let k = raw.trim();
    if k.is_empty() { return Err("Paste your key first.".into()); }
    if !k.starts_with("sk-ant-") { return Err("That does not look like an Anthropic key. It starts with sk-ant-.".into()); }
    if k.len() < 40 || k.len() > 400 { return Err("That key looks too short or too long. Copy the whole key.".into()); }
    if !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') { return Err("That key has characters a key should not have. Copy it again without spaces.".into()); }
    Ok(k.to_string())
}

/// The one line fed to the Keychain tool. Only a checked key can get here, so nothing in it needs quoting.
pub fn script(key: &str) -> String { format!("add-generic-password -U -s {SERVICE} -a {ACCOUNT} -w {key}\n") }

pub fn save(raw: &str) -> Result<(), String> {
    use std::io::Write;
    let key = check(raw)?;
    let mut child = std::process::Command::new("/usr/bin/security").arg("-i")
        .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped())
        .spawn().map_err(|_| "Could not reach the Keychain.".to_string())?;
    child.stdin.take().ok_or("Could not reach the Keychain.")?.write_all(script(&key).as_bytes()).map_err(|_| "Could not reach the Keychain.".to_string())?;
    let out = child.wait_with_output().map_err(|_| "Could not reach the Keychain.".to_string())?;
    // The tool's own words may repeat the command, so they are never passed on.
    if out.status.success() && out.stderr.is_empty() { Ok(()) } else { Err("The Keychain did not accept the key. Try again.".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    const GOOD: &str = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefgh";
    #[test]
    fn a_real_looking_key_passes_and_surrounding_spaces_are_ignored() { assert_eq!(check(&format!("  {GOOD}\n")).unwrap(), GOOD); }
    #[test]
    fn mistakes_are_explained_in_plain_words_without_repeating_the_key() {
        for bad in ["", "hello", "sk-ant-short", "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789abcdef", &format!("{GOOD} extra"), &format!("{GOOD}\"; rm -rf ~"), &"sk-ant-".repeat(80)] {
            let e = check(bad).unwrap_err(); assert!(!e.contains("sk-ant-api03") && e.ends_with('.'), "{e}");
        }
    }
    #[test]
    fn the_keychain_line_holds_only_what_it_should() {
        let s = script(GOOD); assert!(s.starts_with("add-generic-password -U -s companion -a anthropic -w ")); assert_eq!(s.matches('\n').count(), 1);
    }
}
