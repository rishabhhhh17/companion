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

/// What a look in the Keychain found. A look that failed (the Keychain is locked, access was refused or cancelled) is not
/// the same as an item that is not there, so it is never taken for "the key is gone".
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Presence { Found, NotFound, Error }
/// errSecItemNotFound: the Keychain looked and there is no such item.
pub const ITEM_NOT_FOUND: i32 = -25300;
/// The answer of a search: how many items it found, or the Keychain's error code.
pub fn presence_from(found: Result<usize, i32>) -> Presence {
    match found { Ok(0) => Presence::NotFound, Ok(_) => Presence::Found, Err(ITEM_NOT_FOUND) => Presence::NotFound, Err(_) => Presence::Error }
}
/// The key counts as gone only when the Keychain looked and said there is no such item.
pub fn is_gone(p: Presence) -> bool { p == Presence::NotFound }

/// Looks for an item. Asks for its description only, never the secret, so the Mac shows no dialog.
#[cfg(target_os = "macos")]
pub fn presence(service: &str, account: &str) -> Presence {
    use security_framework::item::{ItemClass, ItemSearchOptions};
    presence_from(ItemSearchOptions::new().class(ItemClass::generic_password()).service(service).account(account).load_attributes(true).search().map(|r| r.len()).map_err(|e| e.code()))
}
/// Whether an item was found (a failed look counts as not found here: for showing, never for deciding a key is gone).
pub fn exists(service: &str, account: &str) -> bool { presence(service, account) == Presence::Found }
/// Whether the Keychain says for sure that the item is not there.
pub fn gone(service: &str, account: &str) -> bool { is_gone(presence(service, account)) }

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

/// The file that says the key's item was made by this app (so only this app is trusted to read it).
pub fn marker(data: &std::path::Path) -> std::path::PathBuf { data.join("key-owner-v2") }

/// Saves the key. An item this app made is updated where it is, so a Keychain that refuses the new key leaves the working
/// one in place. Only an item an older version made is replaced (taken away, then added), so it is not left behind with
/// wider trust. Either way the item is this app's own afterwards, and that is remembered.
#[cfg(target_os = "macos")]
pub fn save(raw: &str, data: &std::path::Path) -> Result<(), String> {
    save_with(raw, data,
        || { let _ = delete_item(&service(), ACCOUNT); gone(&service(), ACCOUNT) },   // the delete's own answer is not trusted: the look decides
        |k| security_framework::passwords::set_generic_password(&service(), ACCOUNT, k.as_bytes()).map_err(|_| ()))
}

/// The save, with the Keychain passed in. `clear_old` takes an older version's item away and says whether it is gone; it
/// is asked only when the item is not known to be this app's own. The item counts as this app's own (the marker) only when
/// the old one is gone, so an old item that could not be taken away is not marked and the move is tried again next time.
pub fn save_with(raw: &str, data: &std::path::Path, clear_old: impl FnOnce() -> bool, set: impl FnOnce(&str) -> Result<(), ()>) -> Result<(), String> {
    let key = check(raw)?;
    let old_gone = if marker(data).exists() { true } else { clear_old() };
    set(&key).map_err(|_| "The Keychain did not accept the key. Try again.".to_string())?;
    if old_gone { let _ = std::fs::write(marker(data), "1"); }
    Ok(())
}

/// A key saved by an older version sits in an item that Apple's `security` tool is trusted to read, which any program
/// can use. Read it once (the Mac asks the person to allow that), save it again as this app's own, and remember that.
/// Returns whether the key is now this app's own, or None when there was nothing to move.
#[cfg(target_os = "macos")]
pub fn move_old_item(data: &std::path::Path) -> Option<bool> {
    static TRIED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    move_with(&marker(data), &TRIED, || exists(&service(), ACCOUNT), read, |k| save(k, data))
}

/// The move, with its look, read and save passed in. The Mac is asked once per run of Companion: after a "Don't allow", or a
/// key that cannot be saved again, the engine starting again (up to six times after a crash) never asks again.
pub fn move_with(marker: &std::path::Path, tried: &std::sync::atomic::AtomicBool, exists: impl FnOnce() -> bool, read: impl FnOnce() -> Option<String>, save: impl FnOnce(&str) -> Result<(), String>) -> Option<bool> {
    use std::sync::atomic::Ordering::SeqCst;
    if marker.exists() || !exists() { return None; }
    if tried.swap(true, SeqCst) { return Some(false); }
    let Some(k) = read() else { return Some(false) };   // the person said no, or it cannot be read: leave it, they can paste the key again
    if save(&k).is_err() { return Some(false); }
    let _ = std::fs::write(marker, "1");
    Some(true)
}

#[cfg(not(target_os = "macos"))]
pub fn presence(_: &str, _: &str) -> Presence { Presence::NotFound }
#[cfg(not(target_os = "macos"))]
pub fn exists(_: &str, _: &str) -> bool { false }
#[cfg(not(target_os = "macos"))]
pub fn gone(_: &str, _: &str) -> bool { true }
#[cfg(not(target_os = "macos"))]
pub fn delete_item(_: &str, _: &str) -> bool { false }
#[cfg(not(target_os = "macos"))]
pub fn read() -> Option<String> { None }
#[cfg(not(target_os = "macos"))]
pub fn save(raw: &str, _: &std::path::Path) -> Result<(), String> { check(raw).map(|_| ()) }
#[cfg(not(target_os = "macos"))]
pub fn move_old_item(_: &std::path::Path) -> Option<bool> { None }

/// The one line the engine is sent: the key itself (or null for none). It is written to the engine's pipe and nowhere else.
/// `fresh`: the person has just saved this key, so the engine checks it once with Anthropic (free, runner/src/keytest.ts)
/// and setup can say whether it works. Never set at launch, when the key comes from the Keychain.
pub fn handoff_line(key: Option<&str>, fresh: bool) -> String {
    let fresh = if fresh && key.is_some() { r#","fresh":true"# } else { "" };
    format!(r#"{{"v":1,"type":"auth.key","key":{}{fresh}}}"#, serde_json::to_string(&key).unwrap_or_else(|_| "null".into()))
}

/// The exact words the settings page sends to remove the key, so a stray call removes nothing.
pub const REMOVE_PHRASE: &str = "remove the key";

/// After a removal, looked up again: the key counts as gone only when the Keychain no longer has it (the delete's own
/// answer is not enough, and a "no" from it is fine when there was nothing to delete). Otherwise plain words.
pub fn removal_result(still_there: bool) -> Result<(), String> {
    if still_there { Err("The Keychain did not let me remove the key. Try again, or remove it in the Keychain Access app.".into()) } else { Ok(()) }
}

/// May this call remove the key? Only from Home (Settings lives inside it, settings.rs `only_card`), and only with the exact
/// words, so a stray call from another window or a slip of the page removes nothing.
pub fn may_remove(window_label: &str, confirm: &str) -> bool { crate::settings::only_card(window_label).is_ok() && confirm == REMOVE_PHRASE }

/// The whole removal: the gate first (an unconfirmed call never reaches the Keychain), then `delete`, then `still_there`
/// looks again, and the key counts as gone only when the Keychain no longer has it.
pub fn remove_with(window_label: &str, confirm: &str, delete: impl FnOnce() -> bool, still_there: impl FnOnce() -> bool) -> Result<(), String> {
    if !may_remove(window_label, confirm) { return Err("Not confirmed.".into()); }
    let _ = delete();   // its "no" is fine when there was nothing to delete; the look below decides
    removal_result(still_there())
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
        let data = std::env::temp_dir().join(format!("companion-test-ks-{}", std::process::id())); std::fs::create_dir_all(&data).unwrap();
        save(GOOD, &data).unwrap();
        assert!(exists(&svc, ACCOUNT)); assert_eq!(read().as_deref(), Some(GOOD));
        save(&GOOD.replace("Ab", "Zz"), &data).unwrap();   // saving again replaces it
        assert_eq!(read().as_deref(), Some(GOOD.replace("Ab", "Zz").as_str()));
        set_generic_password(&other, ACCOUNT, b"dummy-value-not-a-key").unwrap();
        assert!(delete_item(&svc, ACCOUNT)); assert!(!exists(&svc, ACCOUNT)); assert!(exists(&other, ACCOUNT));
        assert!(!delete_item(&svc, ACCOUNT)); assert!(delete_item(&other, ACCOUNT));
        assert!(read().is_none());
    }
    #[test]
    fn a_failed_look_is_not_the_same_as_a_key_that_is_gone() {
        assert_eq!(presence_from(Ok(1)), Presence::Found);
        assert_eq!(presence_from(Ok(0)), Presence::NotFound);
        assert_eq!(presence_from(Err(ITEM_NOT_FOUND)), Presence::NotFound);
        // Locked (errSecInteractionNotAllowed -25308), refused (-25293) or cancelled (-128): nothing is known.
        for code in [-25308, -25293, -128, -25299] { assert_eq!(presence_from(Err(code)), Presence::Error, "{code}"); }
        assert!(is_gone(Presence::NotFound) && !is_gone(Presence::Found) && !is_gone(Presence::Error));
    }
    #[test]
    fn a_denied_move_is_asked_for_once_not_on_every_engine_restart() {
        use std::cell::Cell;
        let d = std::env::temp_dir().join(format!("ks-deny-{}", std::process::id())); std::fs::create_dir_all(&d).unwrap();
        let (marker, tried, reads) = (d.join("key-owner-v2"), std::sync::atomic::AtomicBool::new(false), Cell::new(0));
        let go = || move_with(&marker, &tried, || true, || { reads.set(reads.get() + 1); None }, |_| Ok(()));
        assert_eq!(go(), Some(false));
        for _ in 0..5 { assert_eq!(go(), Some(false)); }
        assert_eq!(reads.get(), 1, "the Mac was asked once");
        assert!(!marker.exists());
        // A key that reads but cannot be saved is not retried either.
        let (tried2, saves) = (std::sync::atomic::AtomicBool::new(false), Cell::new(0));
        let go2 = || move_with(&marker, &tried2, || true, || Some("k".into()), |_| { saves.set(saves.get() + 1); Err("no".into()) });
        assert_eq!((go2(), go2()), (Some(false), Some(false)));
        assert_eq!(saves.get(), 1);
        // A move that works is remembered, and then nothing more is asked.
        let tried3 = std::sync::atomic::AtomicBool::new(false);
        assert_eq!(move_with(&marker, &tried3, || true, || Some("k".into()), |_| Ok(())), Some(true));
        assert!(marker.exists());
        assert_eq!(move_with(&marker, &tried3, || panic!("asked again"), || panic!("asked again"), |_| panic!("saved again")), None);
        let _ = std::fs::remove_dir_all(&d);
    }
    fn fresh(name: &str) -> std::path::PathBuf { let d = std::env::temp_dir().join(format!("ks-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap(); d }
    const KEY: &str = "sk-ant-test-0123456789012345678901234567890123456789";
    #[test]
    fn saving_an_item_this_app_made_does_not_delete_it_first() {
        let d = fresh("own"); std::fs::write(marker(&d), "1").unwrap();
        let mut cleared = false; let mut set = false;
        let r = save_with(KEY, &d, || { cleared = true; true }, |_| { set = true; Ok(()) });
        assert!(r.is_ok() && set && !cleared, "updated where it is, nothing taken away first");
        // A refusing Keychain leaves the marker and reports plainly.
        let r = save_with(KEY, &d, || true, |_| Err(()));
        assert!(r.is_err() && marker(&d).exists());
    }
    #[test]
    fn an_older_item_is_taken_away_and_then_marked() {
        let d = fresh("old");
        assert!(save_with(KEY, &d, || true, |_| Ok(())).is_ok());
        assert!(marker(&d).exists());
    }
    #[test]
    fn an_old_item_that_could_not_be_taken_away_is_not_marked_so_the_move_is_tried_again() {
        let d = fresh("stuck");
        assert!(save_with(KEY, &d, || false, |_| Ok(())).is_ok(), "the key is still saved");
        assert!(!marker(&d).exists(), "not marked as this app's own");
        let mut cleared = false;
        let _ = save_with(KEY, &d, || { cleared = true; true }, |_| Ok(()));
        assert!(cleared && marker(&d).exists(), "asked again next time, then marked");
    }
    #[test]
    fn a_key_that_does_not_check_out_touches_nothing() {
        let d = fresh("bad"); let touched = std::cell::Cell::new(false);
        assert!(save_with("nope", &d, || { touched.set(true); true }, |_| { touched.set(true); Ok(()) }).is_err() && !touched.get());
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
        let l = handoff_line(Some("sk-ant-x"), false); assert!(!l.contains('\n')); assert!(l.starts_with(r#"{"v":1,"type":"auth.key""#));
        assert!(handoff_line(None, false).contains(r#""key":null"#));
        assert!(!l.contains("fresh"), "a key read at launch is not tested again");
        let saved: serde_json::Value = serde_json::from_str(&handoff_line(Some("sk-ant-x"), true)).unwrap();
        assert_eq!((saved["key"].as_str(), saved["fresh"].as_bool()), (Some("sk-ant-x"), Some(true)), "a key just saved is checked once");
        assert!(!handoff_line(None, true).contains("fresh"), "no key, nothing to check");
    }
    #[test]
    fn removing_the_key_needs_the_exact_words_and_is_done_only_when_it_is_really_gone() {
        assert_eq!(REMOVE_PHRASE, "remove the key");
        assert!(removal_result(false).is_ok());          // gone, whether the delete removed it or there was nothing there
        let e = removal_result(true).unwrap_err();
        assert!(e.ends_with('.') && e.contains("Keychain") && !e.contains("sk-ant"), "{e}");
    }
    #[test]
    fn only_the_card_with_the_exact_words_may_remove_the_key() {
        assert!(may_remove("card", REMOVE_PHRASE));
        // The Settings window is retired (T17): Settings lives inside Home.
        assert!(!may_remove("settings", REMOVE_PHRASE));
        for (window, words) in [("dock", REMOVE_PHRASE), ("island", REMOVE_PHRASE), ("overlay", REMOVE_PHRASE), ("settings", "remove"), ("card", "remove the key "), ("card", "Remove the key"), ("card", ""), ("", REMOVE_PHRASE), ("cardx", REMOVE_PHRASE)] {
            assert!(!may_remove(window, words), "{window:?} {words:?}");
        }
    }
    #[test]
    fn a_call_that_is_not_confirmed_never_reaches_the_keychain() {
        use std::cell::Cell;
        for (window, words) in [("dock", REMOVE_PHRASE), ("card", "yes")] {
            let (deleted, looked) = (Cell::new(false), Cell::new(false));
            let r = remove_with(window, words, || { deleted.set(true); true }, || { looked.set(true); false });
            assert_eq!(r, Err("Not confirmed.".to_string()), "{window:?} {words:?}");
            assert!(!deleted.get() && !looked.get(), "{window:?} {words:?}: the Keychain was touched");
        }
    }
    #[test]
    fn the_key_counts_as_removed_only_when_the_keychain_no_longer_has_it() {
        use std::cell::Cell;
        let deleted = Cell::new(false);
        assert_eq!(remove_with("card", REMOVE_PHRASE, || { deleted.set(true); true }, || false), Ok(()));
        assert!(deleted.get());
        // Nothing was there to delete: the delete says no, but the key is gone, so that is fine.
        assert_eq!(remove_with("card", REMOVE_PHRASE, || false, || false), Ok(()));
        // The delete said yes, but the Keychain still has it: not removed.
        assert!(remove_with("card", REMOVE_PHRASE, || true, || true).unwrap_err().contains("Keychain"));
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
