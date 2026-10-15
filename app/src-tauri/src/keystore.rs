//! The person's own API key in the macOS Keychain. The key goes in through the page's password box, once, straight to the
//! Keychain: it is never logged and never kept in the page. This app saves and reads it itself (not through Apple's
//! `security` tool), so only this app is trusted to read it, and hands it to the engine on the engine's own pipe.

pub const SERVICE: &str = "companion";
pub const ACCOUNT: &str = "anthropic";

/// The Keychain item Companion uses. Tests may point it at an item of their own, but only one whose name starts with
/// "companion-test-", so this can never be turned toward anything real.
pub fn service() -> String { match std::env::var("COMPANION_KEYCHAIN_SERVICE") { Ok(v) if v.starts_with("companion-test-") => v, _ => SERVICE.to_string() } }

/// A key as Anthropic issues them: starts "sk-ant-", letters, digits, dashes and underscores, no spaces.
pub fn check(raw: &str) -> Result<String, String> {
    let k = raw.trim();
    if k.is_empty() { return Err("Paste your key first.".into()); }
    if !k.starts_with("sk-ant-") { return Err("That does not look like an Anthropic key. It starts with sk-ant-.".into()); }
    if k.len() < 40 || k.len() > 400 { return Err("That key looks too short or too long. Copy the whole key.".into()); }
    if !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') { return Err("That key has characters a key should not have. Copy it again without spaces.".into()); }
    Ok(k.to_string())
}

/// Whether an item exists. Asks for its description only, never the secret, so the Mac shows no dialog.
#[cfg(target_os = "macos")]
pub fn exists(service: &str, account: &str) -> bool {
    use security_framework::item::{ItemClass, ItemSearchOptions};
    ItemSearchOptions::new().class(ItemClass::generic_password()).service(service).account(account).load_attributes(true).search().is_ok_and(|r| !r.is_empty())
}

/// Removes one Keychain item by exact service and account. Only ever called with Companion's own.
#[cfg(target_os = "macos")]
pub fn delete_item(service: &str, account: &str) -> bool { security_framework::passwords::delete_generic_password(service, account).is_ok() }

/// The saved key, or None. The Keychain item is made by this app, so only this app is trusted to read it: any other
/// program that asks gets the Mac's own "allow?" dialog. (An item an older version saved through Apple's `security`
/// tool is moved by `move_old_item`.)
#[cfg(target_os = "macos")]
pub fn read() -> Option<String> {
    let bytes = security_framework::passwords::get_generic_password(&service(), ACCOUNT).ok()?;
    String::from_utf8(bytes).ok().map(|k| k.trim().to_string()).filter(|k| !k.is_empty())
}

/// Saves the key. The item is replaced, so a key saved by an older version is not left behind with wider trust.
#[cfg(target_os = "macos")]
pub fn save(raw: &str) -> Result<(), String> {
    let key = check(raw)?;
    let _ = delete_item(&service(), ACCOUNT);   // gone or not there: either is fine, the add below says if it really failed
    security_framework::passwords::set_generic_password(&service(), ACCOUNT, key.as_bytes()).map_err(|_| "The Keychain did not accept the key. Try again.".to_string())
}

/// A key saved by an older version sits in an item that Apple's `security` tool is trusted to read, which any program
/// can use. Read it once (the Mac asks the person to allow that), save it again as this app's own, and remember that.
/// Returns whether the key is now this app's own, or None when there was nothing to move.
#[cfg(target_os = "macos")]
pub fn move_old_item(data: &std::path::Path) -> Option<bool> {
    let marker = data.join("key-owner-v2");
    if marker.exists() || !exists(&service(), ACCOUNT) { return None; }
    let Some(k) = read() else { return Some(false) };   // the person said no, or it cannot be read: leave it, they can paste the key again
    if save(&k).is_err() { return Some(false); }
    let _ = std::fs::write(&marker, "1");
    Some(true)
}

#[cfg(not(target_os = "macos"))]
pub fn exists(_: &str, _: &str) -> bool { false }
#[cfg(not(target_os = "macos"))]
pub fn delete_item(_: &str, _: &str) -> bool { false }
#[cfg(not(target_os = "macos"))]
pub fn read() -> Option<String> { None }
#[cfg(not(target_os = "macos"))]
pub fn save(raw: &str) -> Result<(), String> { check(raw).map(|_| ()) }
#[cfg(not(target_os = "macos"))]
pub fn move_old_item(_: &std::path::Path) -> Option<bool> { None }

/// The one line the engine is sent: the key itself (or null for none). It is written to the engine's pipe and nowhere else.
pub fn handoff_line(key: Option<&str>) -> String { format!(r#"{{"v":1,"type":"auth.key","key":{}}}"#, serde_json::to_string(&key).unwrap_or_else(|_| "null".into())) }

/// The exact words the settings page sends to remove the key, so a stray call removes nothing.
pub const REMOVE_PHRASE: &str = "remove the key";

/// After a removal, looked up again: the key counts as gone only when the Keychain no longer has it (the delete's own
/// answer is not enough, and a "no" from it is fine when there was nothing to delete). Otherwise plain words.
pub fn removal_result(still_there: bool) -> Result<(), String> {
    if still_there { Err("The Keychain did not let me remove the key. Try again, or remove it in the Keychain Access app.".into()) } else { Ok(()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    /// Real Keychain, throwaway items of their own (dummy values, never Companion's real key), made by this test program:
    /// save then read gives the key back, the delete reaches only the item it is told to, and a second delete is a harmless no.
    /// Run with --ignored.
    #[test]
    #[ignore]
    fn the_app_owns_what_it_saves_and_delete_reaches_only_the_named_item() {
        use security_framework::passwords::set_generic_password;
        let (svc, other) = (format!("companion-test-{}", std::process::id()), format!("companion-test-other-{}", std::process::id()));
        std::env::set_var("COMPANION_KEYCHAIN_SERVICE", &svc);
        save(GOOD).unwrap();
        assert!(exists(&svc, ACCOUNT)); assert_eq!(read().as_deref(), Some(GOOD));
        save(&GOOD.replace("Ab", "Zz")).unwrap();   // saving again replaces it
        assert_eq!(read().as_deref(), Some(GOOD.replace("Ab", "Zz").as_str()));
        set_generic_password(&other, ACCOUNT, b"dummy-value-not-a-key").unwrap();
        assert!(delete_item(&svc, ACCOUNT)); assert!(!exists(&svc, ACCOUNT)); assert!(exists(&other, ACCOUNT));
        assert!(!delete_item(&svc, ACCOUNT)); assert!(delete_item(&other, ACCOUNT));
        assert!(read().is_none());
    }
    #[test]
    fn nothing_to_move_when_there_is_no_old_item() {
        let d = std::env::temp_dir().join(format!("ks-{}", std::process::id())); std::fs::create_dir_all(&d).unwrap();
        std::env::set_var("COMPANION_KEYCHAIN_SERVICE", format!("companion-test-none-{}", std::process::id()));
        assert_eq!(move_old_item(&d), None);
        std::fs::write(d.join("key-owner-v2"), "1").unwrap();
        assert_eq!(move_old_item(&d), None);   // already moved: never asks the Mac again
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn the_handoff_line_is_one_line_and_a_missing_key_is_null() {
        let l = handoff_line(Some("sk-ant-x")); assert!(!l.contains('\n')); assert!(l.starts_with(r#"{"v":1,"type":"auth.key""#));
        assert!(handoff_line(None).contains(r#""key":null"#));
    }
    #[test]
    fn removing_the_key_needs_the_exact_words_and_is_done_only_when_it_is_really_gone() {
        assert_eq!(REMOVE_PHRASE, "remove the key");
        assert!(removal_result(false).is_ok());          // gone, whether the delete removed it or there was nothing there
        let e = removal_result(true).unwrap_err();
        assert!(e.ends_with('.') && e.contains("Keychain") && !e.contains("sk-ant"), "{e}");
    }
    const GOOD: &str = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefgh";
    #[test]
    fn a_real_looking_key_passes_and_surrounding_spaces_are_ignored() { assert_eq!(check(&format!("  {GOOD}\n")).unwrap(), GOOD); }
    #[test]
    fn mistakes_are_explained_in_plain_words_without_repeating_the_key() {
        for bad in ["", "hello", "sk-ant-short", "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789abcdef", &format!("{GOOD} extra"), &format!("{GOOD}\"; rm -rf ~"), &"sk-ant-".repeat(80)] {
            let e = check(bad).unwrap_err(); assert!(!e.contains("sk-ant-api03") && e.ends_with('.'), "{e}");
        }
    }
}
