# M92 (A): Signing ready

Status: built 14 Nov 2026, tests pass. Not committed. Nothing was signed, notarized or sent to Apple. No Keychain item was read, no certificate was made, no signing material was looked at.

## Why

The app is not signed yet, because that needs the Apple developer account. Until then, friends must press Open Anyway, and the updater and the permissions macOS remembers depend on a signature. This milestone makes the day the account arrives one step: set three names, run one script.

## What was already there

- `app/scripts/release.sh`: the release order (tested commit, tools, the certificate's name, version, updater.json, report.json, the real Claude install test, build, sign, notarize, staple, disk image, notarize, staple, Gatekeeper). It reads `COMPANION_SIGN_ID` and `COMPANION_NOTARY_PROFILE` and notarizes with `xcrun notarytool submit --keychain-profile`.
- `app/scripts/build-app.sh`: signs only the app's own program and seal with the hardened runtime, a secure timestamp and `Entitlements.plist`, and refuses a Claude binary inside the app.
- `app/scripts/stage-engine.sh`: with a signing identity set, refuses any program in the engine that is not signed with a Developer ID, the hardened runtime and a timestamp (Bun is, by its maker).
- `app/scripts/make-dmg.sh`: the disk image, signed when an identity is set.

## Built

`app/scripts/sign-release.sh`, which reads only three names from the environment:

| Name | What it is |
|---|---|
| `APPLE_SIGNING_IDENTITY` | The certificate's full name, `Developer ID Application: Your Name (TEAMID1234)` |
| `APPLE_TEAM_ID` | The 10 character team ID, the same as in the brackets |
| `SQUIBBY_NOTARY_PROFILE` | The name you gave when you stored your notary login with `xcrun notarytool store-credentials` |

It never reads a password, a key file or a certificate file, and the repo holds none (it checks that no `.p12`, `.p8`, `.cer` or profile is tracked, with a read only `git ls-files`).

- **`--dry-run`**: every check that needs no identity. Green today. It lists the three names (set or NOT SET), checks the repo, the entitlements, the Info.plist sentence, Bun's own entitlements, Anthropic's Claude in the SDK package, that Tauri has no `externalBin`, then runs `release.sh --dry-run` with the names, and ends with a list of what is missing. Today that list is the three names, `updater.json` and `report.json`. It exits 1 only when the repo itself is wrong.
- **The real run**: refuses at once, naming each problem, when a name is missing, the identity is not a Developer ID Application, the team ID is not 10 capital letters and digits or does not match the identity's brackets, or the profile name is not plain. Nothing else runs before that. Then the repo checks, then `release.sh` with the names (which builds with the hardened runtime and the entitlements, signs, notarizes with `--keychain-profile`, staples, makes and notarizes the disk image), then the checks after signing.
- **`--verify-only <Squibby.app>`**: the checks after signing on an app already built: no Claude binary inside; `codesign --verify --deep --strict`; a Developer ID Application signature from `APPLE_TEAM_ID`'s team, the hardened runtime and a secure timestamp; the signed app's entitlements exactly as listed below; Bun inside still verifies and has the bytes staged (`bun.sha256`); `spctl -a -t exec -vv` says accepted, Notarized Developer ID; `xcrun stapler validate` finds the ticket.
- **`--check-claude <file>`**: whether one file is Anthropic's own Claude: the same bytes as the SDK package's copy (when it is another file), a signature that verifies, `TeamIdentifier=Q6L2SF6YDW`, `Identifier=com.anthropic.claude-code`, a Developer ID Application authority of that team, and the hardened runtime. The team and identifier come from `protocol/claude-pin.json`, the same pin the first run installer uses.

### Anthropic's Claude binary (rule 4)

Since M22 the app carries no Claude binary: Anthropic support wrote that bundling it needs an agreement, so the app installs Anthropic's own build at first run, and `claude_install.rs` uses it only when its download matches the lockfile's sha512 and `codesign` shows Anthropic's team and identifier. So the release checks are: no Claude binary inside the app (build and after signing), and the SDK package's copy, the build the first run install must match, still carries Anthropic's signature at the pinned version. We never sign, change or re-sign it, and no `codesign --sign` in our scripts is aimed at it. If an agreement ever allows bundling, it must go in through `bundle.macOS.files`, never `externalBin` (Tauri re-signs those), and `--check-claude` is the check to run on the copy inside.

### The entitlements, each one and why

The app's own program carries exactly one, and the script refuses any other:

- `com.apple.security.device.audio-input`: the talk keys. Under the hardened runtime the microphone is blocked without it. The sentence macOS shows is `NSMicrophoneUsageDescription` in `Info.plist`.

Left out on purpose, each checked:

- **JIT** (`allow-jit`, `allow-unsigned-executable-memory`): not needed. The pages run in WebKit, whose JavaScript runs in Apple's own web content process, not in ours. Bun, the engine, is its own program and carries its own `allow-jit` (and four others) in its maker's signature (team 7FRXF46ZSN), which we never touch: the dry run reads them and says so.
- **Camera**: the camera check is written but switched off (`presentation.rs CAMERA_CHECK_ON`), and it never opens a camera.
- **Apple Events** (`automation.apple-events`): every `osascript` use is one of the Mac's own dialogs (choose a folder, save a file, delete everything), shown by `osascript` itself, never an event sent to another app.
- **Screen recording and Accessibility**: there is no entitlement or usage sentence for either. macOS asks the person itself the first time the feature is used (rule 8).

## Your steps, the day the account arrives

You do each of these yourself. We never see a password and never make a certificate. The real run does use your Keychain, in three ways, and only those: it lists the names of your signing certificates (`security find-identity`, names only, never a key) to find yours; `codesign` signs with that certificate, which macOS keeps in your Keychain (macOS may ask you once to allow it); and `notarytool` uses the login you stored under your profile name. None of them ever shows us a password or a key. The dry run touches none of this.

1. **Enrol.** At developer.apple.com, join the Apple Developer Program as an individual (99 US dollars a year). Wait for Apple's email that the membership is active; it can take a day or two.
2. **Find your team ID.** At developer.apple.com, Account, Membership details. It is 10 capital letters and digits. Write it down.
3. **Make the certificate in Xcode.** Open Xcode, then Settings, Accounts, add your Apple ID if it is not there, pick your team, press Manage Certificates, press the plus, and pick **Developer ID Application**. Xcode makes it and keeps it in your login Keychain.
4. **Read its exact name.** In Terminal: `security find-identity -v -p codesigning`. Copy the line that starts with `Developer ID Application:`, without the long number in front or the quotes. It ends with your team ID in brackets.
5. **Make an app specific password.** At account.apple.com, Sign In and Security, App Specific Passwords, make one named "notary". Keep it in your password manager. Never paste it into a chat.
6. **Store the notary login once.** In Terminal: `xcrun notarytool store-credentials squibby-notary --apple-id <your Apple ID email> --team-id <your team ID>`. It asks for the app specific password; type it there. It is kept in your Keychain under the name `squibby-notary`.
7. **Set the three names** in the same Terminal window:
   ```
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID1234)"
   export APPLE_TEAM_ID="TEAMID1234"
   export SQUIBBY_NOTARY_PROFILE="squibby-notary"
   ```
8. **Check first.** `sh app/scripts/sign-release.sh --dry-run`. Every line should say set or found. What is left is listed at the end, and that list is the one to trust: it holds every name not set, every tool the release steps found MISSING (for example notarytool, when Xcode or the Command Line Tools are not installed), a version MISMATCH, and a tested commit that is not a pass. Today that is also `updater.json` (run `app/scripts/make-update-key.sh` once), `report.json` (your email address or a page) and the tested commit (step 9). It says READY only when the list is empty.
9. **Commit and test.** The release is built only from a committed commit that `scripts/test-all.sh` passed on.
10. **Run it.** `sh app/scripts/sign-release.sh`. It takes a while (the build, then Apple's notary, usually a few minutes each). It ends with `SIGNED, NOTARIZED AND VERIFIED` and the disk image's path.

## Tests

`app/scripts/sign-release.test.ts` (11, in the release scripts suite, offline). A stand in for `security`, `cargo`, `hdiutil`, `ditto`, `spctl`, `curl`, `npm` and `npx`, and for `xcrun` except `--find`, is first on PATH and leaves a mark if it runs; every test checks no mark was left.

- The dry run is green with no names, lists each as NOT SET, and ends NOT READY with the list.
- The dry run with good names: the entitlements, no signing files, Bun's own JIT, Claude in the SDK package signed by Anthropic PBC (Q6L2SF6YDW), and the team ID matching the identity.
- M92 review: on a Mac where xcrun finds no notarytool or stapler (a stand in xcrun), with every name set, the final list names `tool notarytool: MISSING` and `tool stapler: MISSING` and it ends NOT READY, never READY. release.sh's dry run output is kept, not piped, so a crash there is a FAIL.
- M92 review: a tested commit that is not a pass (this worktree has changes) is in the final list.
- The real run refuses each missing name, by name, before the tested commit check and anything after it.
- The real run refuses an Apple Development identity, a team that does not match, a team ID that is not 10 capital letters and digits, and a profile name that is not plain.
- The script reads names only: no password flag, no key or issuer flag, no Keychain write or read of a password; key file names appear only in the check that refuses them; notarizing goes through `--keychain-profile`.
- The entitlements file holds exactly the microphone.
- `--verify-only` refuses an app with a Claude binary inside before the signature checks, and fails an unsigned app at `codesign --verify`.
- `--check-claude` passes the SDK package's copy and refuses a copy changed by one byte.

The existing release script tests (`release-scripts.test.ts`) are unchanged and still pass; its "every script parses" test now also covers `sign-release.sh`.

## [verify] on a real Mac, once the account is active (also in `docs/research/technical_research.md` section 20, item 36)

- The whole real run, once: Apple's notary accepts the app and the disk image, `spctl` says Notarized Developer ID, and the ticket staples.
- That the signed app works with only the microphone entitlement: the talk keys and the on device speech (whisper with Metal) under the hardened runtime, the screen look (ScreenCaptureKit), the native dialogs through `osascript`, the Keychain key, and the engine (Bun keeps its own entitlements as a separate program).
- That macOS keeps Accessibility, Screen Recording and Microphone answers across an update signed with the same Developer ID.
- That the first run Claude install still verifies Anthropic's signature from inside the signed, hardened app.

## Suites (14 Nov 2026, again after the M92 review fixes)

- Runner: `bun test` 5767 pass, 3 skip, 0 fail (5770 tests, 282 files); `bunx tsc --noEmit -p .` clean.
- Pages: `bun run test` 4104 pass (src) and 106 pass (dom), 0 fail; typecheck clean; `vite build` built.
- Release scripts (`cd app && bun test ./scripts`): 25 pass, 0 fail (3 files, 11 of them new in `sign-release.test.ts`, 2 added after the M92 review).
- Rust: `cargo test` 1375 passed, 8 ignored, 0 failed (no Rust change, so clippy is unchanged).

No page changed, so no shots were taken.
