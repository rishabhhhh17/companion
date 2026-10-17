# Releasing, and updates (for the founder)

Nothing here is published by an agent. Each step that goes public is yours to run.

## One time

1. **Apple**: a Developer ID certificate and notary credentials (see the top of `app/scripts/release.sh`). Waits on Apple's approval.
2. **A public place for release files.** The source repo is private, and a private repo's release files cannot be downloaded by your friends. Make a second, **public** repo that holds only release files (no source), for example `companion-releases`. Updates and the installer are fetched from there.
3. **The update key**, once: `sh app/scripts/make-update-key.sh https://github.com/<you>/companion-releases/releases/latest/download/latest.json`. The private key goes into your Keychain only. Commit the changed `app/src-tauri/updater.json` (it holds the public key and the address). Until you do, the app says "Updates are not set up in this build yet" and nothing is checked.
   - If the private key is lost, installed copies can never update again and people must reinstall. If it leaks, someone could push a fake update. Back it up like a password.

## Every release

0. `sh scripts/audit.sh` (known problems in Rust, runner and page dependencies) and `python3 scripts/make-acknowledgements.py --check` (licence notices up to date). Both must be clean.

1. Raise `version` in `app/src-tauri/tauri.conf.json` and `app/src-tauri/Cargo.toml`, and write what changed for that version in `whatsNew` in `app/src/strings.ts` (a few short plain sentences; Home shows them once after the update, and a page test fails until the new version has some).
2. `COMPANION_SIGN_ID="Developer ID Application: ..." sh app/scripts/release.sh` (build, sign, notarize, staple, disk image).
3. `sh app/scripts/build-update.sh "what changed, in plain words"` makes the update files from the finished app and prints the one command that publishes them. Check them, then run it.
4. The first friends install the disk image by hand. After that, installed copies find new versions by themselves (once a day, if on) and install only when the person presses Install and nothing is running.

## What an update check sends

Companion asks the address for `latest.json`. It is a plain request: it names the update tool, and the address sees the person's internet address like any web request. No project, no words, no ids. Installs happen only on a press, never while something is running, and only if the file's signature matches the public key inside the app.
