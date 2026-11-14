# Releasing, and updates (for the founder)

Nothing here is published by an agent. Each step that goes public is yours to run. Every command is run from the repo root (the `companion` folder) in Terminal. Before the first real release, run `sh app/scripts/release.sh --dry-run`: it lists every step, what it needs from you, and which of those you already have. It touches nothing.

Checked offline on 20 Oct 2026 (build, disk image, bundle contents, Info.plist, entitlements, signatures of the programs inside). Not checked, because it needs your accounts: a Developer ID signature, Apple's notary, the stapled ticket, and the update key. Those are the steps below marked **first time only you can tell**.

## One time

1. **Apple Developer account** (paid, 99 USD a year). Wait for Apple to approve it; new accounts can wait days.
2. **Developer ID Application certificate.** In Xcode: Settings, Accounts, your team, Manage Certificates, plus, "Developer ID Application". Check it is there:
   `security find-identity -v -p codesigning`
   You expect a line like `"Developer ID Application: Your Name (TEAMID)"`. Copy that exact text in quotes; it is your `COMPANION_SIGN_ID`.
   - Nothing listed: the certificate is not in your login Keychain (made on another Mac, or the request was never finished). Make it again in Xcode.
3. **Notary credentials**, once. Make an app specific password at appleid.apple.com (Sign-In and Security, App-Specific Passwords), then:
   `xcrun notarytool store-credentials companion-notary --apple-id <your apple id> --team-id <TEAMID>`
   It asks for the app specific password and stores it in your Keychain under the name `companion-notary`. Expect "Credentials saved to Keychain".
   - "HTTP status code: 401": wrong app specific password, or you typed your normal Apple password.
   - "HTTP status code: 403 ... agreement": accept the new agreements at developer.apple.com, then retry.
4. **A public place for release files.** The source repo is private, and a private repo's release files cannot be downloaded by your friends. Make a second, **public** repo that holds only release files (no source), for example `companion-releases`. Updates and the installer are fetched from there.
5. **The update key**, once, and **before the first release build**:
   `sh app/scripts/make-update-key.sh https://github.com/<you>/companion-releases/releases/latest/download/latest.json`
   It asks for a password (remember it; you type it again at every publish). The private key goes into your Keychain only. Commit the changed `app/src-tauri/updater.json` (public key and address).
   - The address is baked into the app when it is built. A build made before this step can never update itself, and `release.sh` refuses to run until the file is filled in.
   - "A Companion update key already exists": good, do not make another. Making a second one would strand every installed copy.
   - If the private key is lost, installed copies can never update again and people must reinstall. If it leaks, someone could push a fake update. Back it up like a password.
6. **Where problem reports go**, once: put your email address (or an https page for reports) in `app/src-tauri/report.json`, and commit it. Until you do, Report a problem opens an email with no recipient, and `release.sh` refuses to build (`COMPANION_ALLOW_NO_REPORT=1` skips this on purpose).
7. **Tools on this Mac**: Apple Silicon, Bun 1.4.2 exactly (`bun --version`), Rust, and the Tauri tool (`cargo tauri --version`). The build checks and tells you what is wrong. If `cargo tauri` is not found, install it with `cargo install tauri-cli --version "^2" --locked`.

## Every release

1. **Checks.** `sh scripts/audit.sh` and `python3 scripts/make-acknowledgements.py --check`. Both must be clean. If the second says the licence notices are out of date, run it without `--check` and commit the result.
2. **Version.** Raise `version` in `app/src-tauri/tauri.conf.json` and `app/src-tauri/Cargo.toml` (same number in both). Write what changed in `whatsNew` in `app/src/strings.ts` (a few short plain sentences; Home shows them once after the update, and a page test fails until the new version has some).
3. **Commit, then everything passes.** Commit every change first, then run `sh scripts/test-all.sh` (it includes the release script tests and the permission lint). When every suite passes on a tree with nothing uncommitted, it notes the commit in `.tested-head`. `release.sh` builds only that exact commit, and the app shows it in About and in the support log, so a report can be matched to its source.
4. **Look at the plan.** `sh app/scripts/release.sh --dry-run`. Every line under "Your setup" should say found or set. `COMPANION_SIGN_ID: NOT SET` is normal here; you set it in the next step.
5. **Release.**
   `COMPANION_SIGN_ID="Developer ID Application: Your Name (TEAMID)" sh app/scripts/release.sh`
   It first checks the commit was tested and nothing is uncommitted, that `report.json` and `updater.json` are filled in, and installs Claude for real once from Anthropic (a few minutes, needs the internet). Then it builds, signs, sends the app to Apple, waits (usually 2 to 15 minutes; the first ones can be hours), staples, makes the disk image, signs it, sends it to Apple, waits, staples, and checks. Total about 20 to 40 minutes. macOS may ask once to let `codesign` use your key: choose Always Allow.
   Success ends with `ready to send: .../app/installer/Squibby-<version>.dmg`, and the lines `accepted` / `source=Notarized Developer ID` from `spctl`.
6. **Try it on a Mac that is not yours** (or a fresh user account on your Mac): copy the `.dmg` over by AirDrop or a download, open it, drag Squibby to Applications, open it. It must open with no "Open Anyway" and no "damaged" message. Do not skip this: it is the only test of the real thing.
7. **Update files.** `sh app/scripts/build-update.sh "what changed, in plain words"`. It asks for the update key password and prints the one `gh release create ...` command that publishes. The update file names this version's own download (`.../releases/download/v<version>/Squibby.app.tar.gz`), never the "latest" one, which moves on with the next release. Read what it made in `app/installer/update`, then run that command. It goes public.
8. **The installer for friends.** Upload `app/installer/Squibby-<version>.dmg` to the same public release (the `gh release create` command above can take it as one more file), and send the release page link. The first friends install the disk image by hand. After that, installed copies find new versions by themselves (once a day, if on) and install only when the person presses Install and nothing is running.

## What goes wrong, and what you will see

| You see | Meaning | Fix |
|---|---|---|
| `COMPANION_SIGN_ID: set COMPANION_SIGN_ID ...` | You ran release.sh with no identity | Add `COMPANION_SIGN_ID="..."` in front, exact text from step 2 |
| `FAIL: no valid signing certificate named ...` | The name does not match any certificate in your Keychain | Copy the exact name from `security find-identity -v -p codesigning` |
| `FAIL: there are uncommitted changes ...` | Something is not committed | Commit it (or put it aside), run `sh scripts/test-all.sh`, release again |
| `FAIL: the full test suite has not passed on commit ...` | test-all.sh was not run on this commit, or it failed | Run `sh scripts/test-all.sh` until it ends with "All suites passed", then release again |
| `FAIL: updater.json is empty ...` | Step 5 of One time was skipped | Run make-update-key.sh, commit, release again. `COMPANION_ALLOW_NO_UPDATER=1` skips this on purpose |
| `FAIL: report.json is empty ...` | Step 6 of One time was skipped | Put your email address or page in it, commit, release again. `COMPANION_ALLOW_NO_REPORT=1` skips this on purpose |
| `FAIL: installing Claude for real did not work` | No internet, or Anthropic's download changed | Check the internet and read the test's output; if it is about the signature or the pin, tell the agent session |
| `FAIL: this build is pinned to Bun 1.4.2 ...` | Wrong Bun | Install Bun 1.4.2 |
| `FAIL: this build needs an Apple Silicon Mac` | Built on an Intel Mac | Use an Apple Silicon Mac |
| `FAIL: these programs inside the engine are not signed with a Developer ID ...` | A program in the engine lost its maker's signature | Do not re-sign it. Reinstall the pinned packages (`stage-engine.sh` reruns on every build) |
| `FAIL: the Claude binary in the app is not the one that was staged` / `signing changed Anthropic's Claude binary` | Anthropic's binary was altered (rule 4) | Stop. Do not ship. Tell the agent session |
| `FAIL: the app is not signed with a Developer ID Application certificate` | Signing used the wrong or no identity | Check the name; make sure the certificate's private key is on this Mac |
| `FAIL: notarytool could not submit ...` | Profile not stored, no internet, or the account is not yet approved | Redo One time step 3; check the internet; check developer.apple.com |
| `FAIL: Apple did not accept it` followed by a log | Apple found a problem; the log lists each file and reason | Fix what the log names; the usual causes are a program inside the app without a Developer ID signature, hardened runtime or secure timestamp. The log mentioning the Claude binary or Bun is the open question in T04: tell the agent session |
| Notary error 7000 | New team not yet enabled for notarization | Wait (days) or contact Apple Developer Support |
| `spctl ... rejected` on the app after stapling | The ticket did not attach | Run release.sh again; check the internet |
| `FAIL: the app is not notarized and signed for distribution` (build-update.sh) | You ran it on a build that release.sh did not finish | Run release.sh to the end first |
| `FAIL: no update key in your Keychain` | Key made on another Mac, or never made | Restore from your backup; if there is none, installed copies cannot be updated |
| Signing fails with a password or "invalid" message | Wrong update key password | Retry; if forgotten, see the lost key warning above |
| `FAIL: the version is X in tauri.conf.json but Y in Cargo.toml` | Only one was raised | Make them the same |

## What an update check sends

Squibby asks the address for `latest.json`. It is a plain request: it names the update tool, and the address sees the person's internet address like any web request. No project, no words, no ids. An update installs on a press, or (M89, Install updates while away, on unless turned off) by itself after 5 minutes with no keyboard, mouse or trackpad input. Never while something is running, during a call, while Squibby looks at the screen, listens or speaks, and only if the file's signature matches the public key inside the app. After a quiet install, Home says which version it updated to. The shell checks every condition again before it downloads and again before it installs (`updates.rs quiet_install_ok`).

## Known soft spots (not blockers)

- The program file carries the developer's home folder name in some internal paths (about 700 places, from Rust library paths). Harmless, but a `strip = true` line under `[profile.release]` in `app/src-tauri/Cargo.toml` would remove them and shrink the file.
- The bundle ships library `.map` and `.github` files from the runner's packages (a few MB). Harmless.
- The app is about 375 MB and the disk image about 160 MB, almost all of it Anthropic's Claude binary and Bun.
- The update only supports Apple Silicon (`darwin-aarch64`).
