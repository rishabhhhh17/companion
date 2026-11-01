//! Anthropic's Claude, installed at first run (M22; AGENTS.md rule 4). Anthropic support wrote on 29 Oct 2026 that bundling
//! the Claude Code CLI inside our product needs a separate agreement, and suggested installing Anthropic's own build at
//! first run instead. So the app carries no Claude binary. On first run the shell fetches exactly the platform package
//! the runner's SDK is pinned to (`protocol/claude-pin.json`, kept equal to `runner/bun.lock` by a test) from the public
//! npm registry, and uses it only when:
//!   1. the download's sha512 equals the lockfile's, so it is byte for byte the build we test, and
//!   2. the binary carries Anthropic's own signature (their team and identifier), checked by `codesign`.
//! It is never changed or re-signed. It lives in Squibby's folder, one folder per version; every engine start is told
//! where (`COMPANION_CLAUDE_BIN`), and older versions are removed once a new one is in place.
//!
//! The decisions are plain code, tested here; the network goes through the Mac's own curl, the archive through its tar.

use base64::Engine;
use serde_json::Value;
use sha2::{Digest, Sha512};
use std::path::{Path, PathBuf};

/// The build the runner is pinned to: its package, version, the lockfile's integrity, and who must have signed it.
#[derive(Clone, Debug, PartialEq)]
pub struct Pin { pub package: String, pub version: String, pub integrity: String, pub team: String, pub identifier: String }

pub fn pin_from(json: &str) -> Option<Pin> {
    let v: Value = serde_json::from_str(json).ok()?;
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let p = Pin { package: s("package"), version: s("version"), integrity: s("integrity"), team: s("team"), identifier: s("identifier") };
    let ok = p.package.starts_with("@anthropic-ai/") && !p.version.is_empty() && p.integrity.starts_with("sha512-") && !p.team.is_empty() && !p.identifier.is_empty();
    ok.then_some(p)
}
/// The pin this build of the app carries.
pub fn pin() -> Pin { pin_from(include_str!("../../../protocol/claude-pin.json")).expect("protocol/claude-pin.json is checked by its test") }

/// The registry address of a scoped package's archive: `@scope/name` version `v` is `/@scope/name/-/name-v.tgz`.
pub fn tarball_url(package: &str, version: &str) -> Option<String> {
    let name = package.rsplit('/').next().filter(|n| !n.is_empty())?;
    if !package.starts_with('@') || !package.contains('/') { return None; }
    Some(format!("https://registry.npmjs.org/{package}/-/{name}-{version}.tgz"))
}

/// Whether `bytes` are exactly what the lockfile's `sha512-<base64>` names.
pub fn integrity_ok(bytes: &[u8], integrity: &str) -> bool {
    let Some(want) = integrity.strip_prefix("sha512-") else { return false };
    base64::engine::general_purpose::STANDARD.encode(Sha512::digest(bytes)) == want
}

/// What `codesign -dvv` printed (it prints on standard error) says about who signed it: only Anthropic's team, only their
/// identifier, and a Developer ID (a build Apple notarizes), never an ad hoc or someone else's signature.
pub fn signed_by_anthropic(codesign_info: &str, pin: &Pin) -> bool {
    let line = |k: &str| codesign_info.lines().find_map(|l| l.strip_prefix(k)).map(str::trim).unwrap_or("");
    line("TeamIdentifier=") == pin.team && line("Identifier=") == pin.identifier
        && codesign_info.lines().any(|l| l.starts_with("Authority=Developer ID Application:") && l.contains(&format!("({})", pin.team)))
}

/// Where a version lives: `<root>/<version>/claude`. The version must be a plain version, never a path.
pub fn dest(root: &Path, version: &str) -> Option<PathBuf> {
    let plain = !version.is_empty() && version.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    plain.then(|| root.join(version).join("claude"))
}

/// The installed binary for this pin, when it is there.
pub fn installed(root: &Path, pin: &Pin) -> Option<PathBuf> { dest(root, &pin.version).filter(|p| p.is_file()) }

/// What the pages see.
#[derive(Clone, Debug, PartialEq)]
pub enum Status { Ready, Missing, Installing { received: u64, total: Option<u64> }, Failed(String) }
impl Status {
    pub fn json(&self) -> Value {
        match self {
            Status::Ready => serde_json::json!({ "state": "ready" }),
            Status::Missing => serde_json::json!({ "state": "missing" }),
            Status::Installing { received, total } => serde_json::json!({ "state": "installing", "received": received, "total": total }),
            Status::Failed(m) => serde_json::json!({ "state": "failed", "message": m }),
        }
    }
}

/// Folders of other versions under `root` to remove once this one is in place (never a file, never this version).
pub fn old_versions(entries: &[String], keep: &str) -> Vec<String> {
    entries.iter().filter(|e| e.as_str() != keep && !e.starts_with('.') && dest(Path::new("/"), e).is_some()).cloned().collect()
}

/// Installs the pinned build under `root`, telling `progress` how far the download is. Plain words on failure.
pub fn install(root: &Path, pin: &Pin, progress: &dyn Fn(u64, Option<u64>)) -> Result<PathBuf, String> {
    let fail = |m: &str| m.to_string();
    let target = dest(root, &pin.version).ok_or_else(|| fail("The pinned version is not valid."))?;
    if target.is_file() && verify(&target, pin) { return Ok(target); }
    let url = tarball_url(&pin.package, &pin.version).ok_or_else(|| fail("The pinned package is not valid."))?;
    let work = root.join(format!(".download-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|_| fail("Could not make a folder for the download."))?;
    let tgz = work.join("package.tgz");
    let r = (|| -> Result<PathBuf, String> {
        let total = content_length(&url);
        let mut child = std::process::Command::new("/usr/bin/curl").args(["-fsSL", "--retry", "2", "--max-time", "1200", "-o"]).arg(&tgz).arg(&url)
            .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
            .spawn().map_err(|_| fail("Could not start the download."))?;
        loop {
            if let Some(st) = child.try_wait().map_err(|_| fail("The download stopped."))? {
                if !st.success() { return Err(fail("Could not download Claude from Anthropic. Check the internet connection and try again.")); }
                break;
            }
            progress(std::fs::metadata(&tgz).map(|m| m.len()).unwrap_or(0), total);
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
        let bytes = std::fs::read(&tgz).map_err(|_| fail("Could not read the download."))?;
        progress(bytes.len() as u64, total.or(Some(bytes.len() as u64)));
        if !integrity_ok(&bytes, &pin.integrity) { return Err(fail("The download did not match Anthropic's published build, so it was not used. Try again.")); }
        drop(bytes);
        let ok = std::process::Command::new("/usr/bin/tar").arg("-xzf").arg(&tgz).arg("-C").arg(&work).arg("package/claude")
            .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().map(|s| s.success()).unwrap_or(false);
        let got = work.join("package").join("claude");
        if !ok || !got.is_file() { return Err(fail(concat!("The download was not the package ", crate::product!(), " expected."))); }
        if !verify(&got, pin) { return Err(fail("The program was not signed by Anthropic, so it was not used.")); }
        let dir = target.parent().ok_or_else(|| fail("The pinned version is not valid."))?;
        std::fs::create_dir_all(dir).map_err(|_| fail("Could not make Claude's folder."))?;
        std::fs::rename(&got, &target).map_err(|_| fail("Could not put Claude in place."))?;
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755));
        Ok(target.clone())
    })();
    let _ = std::fs::remove_dir_all(&work);
    if r.is_ok() {
        let names: Vec<String> = std::fs::read_dir(root).map(|d| d.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().into_string().ok()).collect()).unwrap_or_default();
        for old in old_versions(&names, &pin.version) { let _ = std::fs::remove_dir_all(root.join(old)); }
    }
    r
}

/// The archive's size, when the registry says it (for real progress); None otherwise.
fn content_length(url: &str) -> Option<u64> {
    let out = std::process::Command::new("/usr/bin/curl").args(["-sIL", "--max-time", "20", url]).output().ok()?;
    String::from_utf8_lossy(&out.stdout).lines().rev().find_map(|l| { let (k, v) = l.split_once(':')?; k.eq_ignore_ascii_case("content-length").then(|| v.trim().parse().ok()).flatten() })
}

// ---------- checked again at every engine start ----------
//
// The install checks the download by hash and signature, but the file then sits in Squibby's own folder, which any program
// of this Mac user can write. So before each engine start the shell checks the file again (the same `verify`) and hands
// the engine its path only when it passes. The answer is remembered for one version of the file (its inode, size and
// times of change, `file_id`), so the check runs once per change, not at every restart. Remembered in memory only: a note
// on disk could be written by the same programs that could change the file.

/// Which version of a file this is: its inode, size, and modification and change times in nanoseconds. A file that is
/// replaced or written again has a different one: any program can put the modification time back, but not the change
/// time. The engine compares the same four before each Claude start (sdkEngine.ts fileId).
pub fn file_id(p: &Path) -> Option<String> {
    use std::os::unix::fs::MetadataExt;
    let m = std::fs::metadata(p).ok().filter(|m| m.is_file())?;
    let ns = |s: i64, n: i64| s as i128 * 1_000_000_000 + n as i128;
    Some(format!("{}:{}:{}:{}", m.ino(), m.len(), ns(m.mtime(), m.mtime_nsec()), ns(m.ctime(), m.ctime_nsec())))
}

/// What the last check found: the file's version and whether it passed.
pub type Seen = Option<(String, bool)>;

/// Whether `p` may be handed to the engine now, and the version that was checked. `verify` runs only for a version not
/// checked before; a file that changes while it is checked is refused.
pub fn launch_check(p: &Path, seen: &mut Seen, verify: &dyn Fn(&Path) -> bool) -> Option<String> {
    let id = file_id(p)?;
    if let Some((was, ok)) = seen.as_ref() { if *was == id { return ok.then_some(id); } }
    let ok = verify(p) && file_id(p).as_deref() == Some(id.as_str());
    *seen = Some((id.clone(), ok));
    ok.then_some(id)
}

static SEEN: std::sync::Mutex<Seen> = std::sync::Mutex::new(None);

/// The installed build at `p`, checked against this app's pin (once per change of the file). Some(version) when it may
/// be used. The engine start logs a refusal (without the path), and Home shows it (`refused`).
pub fn cleared(p: &Path) -> Option<String> {
    let mut seen = SEEN.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let before = seen.clone();
    let pin = pin();
    let r = launch_check(p, &mut seen, &|f| verify(f, &pin));
    if seen != before { *SEEN.lock().unwrap_or_else(|e| e.into_inner()) = seen; }
    r
}

/// Whether the file at `p` is the very version the last check refused (Home then says so and offers to get it again).
/// It never runs the check itself, so it never waits on codesign.
pub fn refused(p: &Path) -> bool {
    let Some(id) = file_id(p) else { return false };
    matches!(SEEN.lock().unwrap_or_else(|e| e.into_inner()).as_ref(), Some((was, false)) if *was == id)
}

/// What Home says when the check refused the installed build. Calm, and the way on is Get it again (`install` puts a
/// fresh copy from Anthropic in its place).
pub const CHANGED: &str = concat!("Claude on this Mac has changed since it was installed, so ", crate::product!(), " is not using it. Get it again from Anthropic to go on.");

/// Anthropic's signature on `path`, checked by the Mac: valid and strict, and Anthropic's team and identifier.
pub fn verify(path: &Path, pin: &Pin) -> bool {
    let valid = std::process::Command::new("/usr/bin/codesign").args(["--verify", "--strict"]).arg(path)
        .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().map(|s| s.success()).unwrap_or(false);
    if !valid { return false; }
    let Ok(out) = std::process::Command::new("/usr/bin/codesign").args(["-dvv"]).arg(path).output() else { return false };
    signed_by_anthropic(&String::from_utf8_lossy(&out.stderr), pin)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p() -> Pin { pin() }

    #[test]
    fn the_pin_is_anthropics_package_with_a_lockfile_hash_and_its_signer() {
        let p = p();
        assert_eq!(p.package, "@anthropic-ai/claude-agent-sdk-darwin-arm64");
        assert!(p.integrity.starts_with("sha512-"));
        assert_eq!((p.team.as_str(), p.identifier.as_str()), ("Q6L2SF6YDW", "com.anthropic.claude-code"));
        assert!(pin_from(r#"{"package":"left-pad","version":"1","integrity":"sha512-x","team":"T","identifier":"i"}"#).is_none(), "only Anthropic's packages");
        assert!(pin_from(r#"{"package":"@anthropic-ai/x","version":"1","integrity":"sha1-x","team":"T","identifier":"i"}"#).is_none(), "only a sha512 hash");
    }

    #[test]
    fn the_download_address_is_the_registrys_own_for_that_exact_version() {
        assert_eq!(tarball_url("@anthropic-ai/claude-agent-sdk-darwin-arm64", "0.3.293").unwrap(), "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/claude-agent-sdk-darwin-arm64-0.3.293.tgz");
        assert!(tarball_url("unscoped", "1").is_none());
    }

    #[test]
    fn one_changed_byte_is_refused() {
        let data = b"anthropic build".to_vec();
        let good = format!("sha512-{}", base64::engine::general_purpose::STANDARD.encode(Sha512::digest(&data)));
        assert!(integrity_ok(&data, &good));
        let mut bad = data.clone(); bad[0] ^= 1;
        assert!(!integrity_ok(&bad, &good));
        assert!(!integrity_ok(&data, "sha256-abc"));
    }

    #[test]
    fn only_anthropics_developer_id_signature_counts() {
        let good = "Executable=/x/claude\nIdentifier=com.anthropic.claude-code\nAuthority=Developer ID Application: Anthropic PBC (Q6L2SF6YDW)\nAuthority=Developer ID Certification Authority\nTeamIdentifier=Q6L2SF6YDW\n";
        assert!(signed_by_anthropic(good, &p()));
        assert!(!signed_by_anthropic(&good.replace("Q6L2SF6YDW", "ABCDE12345"), &p()), "another team");
        assert!(!signed_by_anthropic(&good.replace("com.anthropic.claude-code", "com.evil.claude"), &p()), "another program");
        assert!(!signed_by_anthropic("Signature=adhoc\nTeamIdentifier=not set\n", &p()), "ad hoc");
        assert!(!signed_by_anthropic(&good.replace("Authority=Developer ID Application: Anthropic PBC (Q6L2SF6YDW)\n", ""), &p()), "not a Developer ID");
    }

    #[test]
    fn each_version_has_its_own_folder_and_a_version_is_never_a_path() {
        let root = Path::new("/r");
        assert_eq!(dest(root, "0.3.293").unwrap(), PathBuf::from("/r/0.3.293/claude"));
        for bad in ["../x", "", "a/b", "1 2"] { assert!(dest(root, bad).is_none(), "{bad}"); }
        assert_eq!(old_versions(&["0.3.290".into(), "0.3.293".into(), ".download-1".into(), "../etc".into()], "0.3.293"), vec!["0.3.290".to_string()]);
    }

    #[test]
    fn the_status_the_pages_see() {
        assert_eq!(Status::Ready.json()["state"], "ready");
        assert_eq!(Status::Installing { received: 5, total: Some(10) }.json()["total"], 10);
        assert_eq!(Status::Failed("no".into()).json()["message"], "no");
    }

    #[test]
    fn a_real_anthropic_build_on_this_mac_passes_the_signature_check() {
        // The SDK package the runner installed holds the same build: on a development Mac it must pass, unchanged.
        let local = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude");
        if local.is_file() { assert!(verify(&local, &p()), "Anthropic's own build is accepted as it is"); }
        let not_signed = std::env::temp_dir().join(format!("not-claude-{}", std::process::id()));
        std::fs::write(&not_signed, b"#!/bin/sh\n").unwrap();
        assert!(!verify(&not_signed, &p()), "an unsigned file is refused");
        let _ = std::fs::remove_file(&not_signed);
    }

    #[test]
    fn the_installed_build_is_checked_once_per_change_of_the_file_and_never_used_when_it_fails() {
        use std::cell::Cell;
        let dir = std::env::temp_dir().join(format!("claude-launch-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("claude");
        std::fs::write(&f, b"anthropic build").unwrap();
        let calls = Cell::new(0); let pass = Cell::new(true);
        let fake = |_: &Path| { calls.set(calls.get() + 1); pass.get() };
        let mut seen: Seen = None;
        let first = launch_check(&f, &mut seen, &fake);
        assert_eq!(first, file_id(&f));
        assert!(first.is_some());
        assert_eq!(launch_check(&f, &mut seen, &fake), first, "the same file again");
        assert_eq!(calls.get(), 1, "checked once, not at every start");
        // The file is written again (another program swapped its bytes): checked again, and refused when it fails.
        pass.set(false);
        std::fs::write(&f, b"something else entirely").unwrap();
        assert_eq!(launch_check(&f, &mut seen, &fake), None);
        assert_eq!(calls.get(), 2);
        assert_eq!(launch_check(&f, &mut seen, &fake), None, "still refused");
        assert_eq!(calls.get(), 2, "a refusal is remembered for that version too");
        // Replaced by a new file (a new inode): checked again; the good build passes.
        pass.set(true);
        let tmp = dir.join("new"); std::fs::write(&tmp, b"anthropic build").unwrap(); std::fs::rename(&tmp, &f).unwrap();
        assert!(launch_check(&f, &mut seen, &fake).is_some());
        assert_eq!(calls.get(), 3);
        // Gone: nothing to hand over, and no check runs.
        std::fs::remove_file(&f).unwrap();
        assert_eq!(launch_check(&f, &mut seen, &fake), None);
        assert_eq!(calls.get(), 3);
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn a_file_rewritten_in_place_with_its_old_size_and_time_put_back_is_checked_again() {
        // Any program of this user can set a file's modification time back (utimes), but not its change time: the version
        // of a file includes the change time, so the same size and the old time never pass for the checked file.
        use std::cell::Cell;
        let dir = std::env::temp_dir().join(format!("claude-utimes-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("claude");
        std::fs::write(&f, b"anthropic build").unwrap();
        let calls = Cell::new(0);
        let fake = |_: &Path| { calls.set(calls.get() + 1); calls.get() == 1 };
        let mut seen: Seen = None;
        assert!(launch_check(&f, &mut seen, &fake).is_some());
        let old = std::fs::metadata(&f).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&f, b"someone's build").unwrap();   // the same length
        std::fs::File::options().write(true).open(&f).unwrap().set_modified(old).unwrap();
        assert_eq!(std::fs::metadata(&f).unwrap().modified().unwrap(), old, "the old time is back");
        assert_eq!(launch_check(&f, &mut seen, &fake), None, "checked again, and refused");
        assert_eq!(calls.get(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn a_file_that_changes_while_it_is_checked_is_refused() {
        let dir = std::env::temp_dir().join(format!("claude-swap-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("claude");
        std::fs::write(&f, b"anthropic build").unwrap();
        // The verifier sees the good file, and something swaps it before the engine would start.
        let swap = |p: &Path| { let t = p.with_file_name("evil"); std::fs::write(&t, b"another program").unwrap(); std::fs::rename(&t, p).unwrap(); true };
        let mut seen: Seen = None;
        assert_eq!(launch_check(&f, &mut seen, &swap), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn an_unsigned_file_at_the_installed_place_is_never_cleared_for_the_engine() {
        // The real check (codesign) on a file that is not Anthropic's: refused, and Home can say so.
        let dir = std::env::temp_dir().join(format!("claude-cleared-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("claude");
        std::fs::write(&f, b"#!/bin/sh\necho not claude\n").unwrap();
        assert_eq!(cleared(&f), None);
        assert!(refused(&f));
        // Anthropic's own build (the SDK package's copy, on a development Mac) is cleared as it is, and is then not refused.
        // In this one test, because the remembered answer is one for the whole app.
        let local = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude");
        if local.is_file() { assert_eq!(cleared(&local), file_id(&local)); assert!(!refused(&local)); assert!(!refused(&f), "only the last check is remembered"); }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The whole install for real (network, about the size of Anthropic's build). Run by hand: cargo test real_install -- --ignored
    #[test]
    #[ignore]
    fn real_install_from_the_registry() {
        let root = std::env::temp_dir().join(format!("claude-install-{}", std::process::id()));
        let got = install(&root, &p(), &|_, _| {}).expect("installs");
        assert!(got.is_file() && verify(&got, &p()));
        assert_eq!(installed(&root, &p()), Some(got));
        let _ = std::fs::remove_dir_all(&root);
    }
}
