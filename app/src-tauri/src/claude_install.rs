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
        if !ok || !got.is_file() { return Err(fail("The download was not the package Squibby expected.")); }
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
