#!/bin/bash
# The whole release, once Apple has approved the developer account. NOT YET RUN FOR REAL: it needs things only the founder has
# (a "Developer ID Application" certificate in the Keychain, and notary credentials stored once with
#   xcrun notarytool store-credentials companion-notary --apple-id <id> --team-id <team>  ).
# Usage: COMPANION_SIGN_ID="Developer ID Application: Name (TEAM)" sh app/scripts/release.sh
#        sh app/scripts/release.sh --dry-run     prints every step and what it needs; runs nothing risky (no build, no signing,
#                                                 no Keychain, no network). Safe on any Mac, with or without credentials.
# Before anything: the commit must be clean and tested (scripts/test-all.sh), report.json and updater.json filled in, and
# the real Claude install test must pass.
# Order: build and sign the app (hardened runtime) -> notarize the app -> staple -> disk image (signed) -> notarize -> staple.
set -eu
cd "$(dirname "$0")/.."
PROFILE="${COMPANION_NOTARY_PROFILE:-companion-notary}"

if [ "${1:-}" = "--dry-run" ]; then
  echo "DRY RUN: nothing below is run. Each step, and what it needs from you:"
  echo "  1. Build the app (scripts/build-app.sh)         needs: Apple Silicon Mac, bun 1.4.2, Rust, the Tauri tool; no credentials"
  echo "  2. Sign it for release (hardened runtime)       needs: a 'Developer ID Application' certificate in your login Keychain"
  echo "  3. Notarize the app (xcrun notarytool)          needs: notary profile '$PROFILE' stored once; internet; Apple's approval of the account"
  echo "  4. Staple the ticket to the app                 needs: the notarization to have been accepted"
  echo "  5. Make and sign the disk image (make-dmg.sh)   needs: the same certificate"
  echo "  6. Notarize, staple and check the disk image    needs: the same notary profile and internet"
  echo "Your setup, checked without touching the Keychain or the network:"
  if [ -n "${COMPANION_SIGN_ID:-}" ]; then echo "  COMPANION_SIGN_ID: set ($COMPANION_SIGN_ID)"; else echo "  COMPANION_SIGN_ID: NOT SET (the real run stops at once)"; fi
  echo "  notary profile name: $PROFILE (set COMPANION_NOTARY_PROFILE to use another)"
  for t in xcrun codesign hdiutil bun cargo python3 ditto; do command -v "$t" >/dev/null 2>&1 && echo "  tool $t: found" || echo "  tool $t: MISSING"; done
  xcrun --find notarytool >/dev/null 2>&1 && echo "  tool notarytool: found" || echo "  tool notarytool: MISSING (install Xcode or the Command Line Tools)"
  xcrun --find stapler >/dev/null 2>&1 && echo "  tool stapler: found" || echo "  tool stapler: MISSING (install Xcode or the Command Line Tools)"
  V="$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"
  C="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)"
  [ "$V" = "$C" ] && echo "  version: $V (same in tauri.conf.json and Cargo.toml)" || echo "  version: MISMATCH, tauri.conf.json says $V and Cargo.toml says $C"
  UP="$(python3 -c 'import json;d=json.load(open("src-tauri/updater.json"));print("set" if d.get("pubkey") and d.get("endpoint") else "EMPTY")')"
  echo "  updater.json (public key and address): $UP$([ "$UP" = EMPTY ] && echo ' (this build could not update itself; run make-update-key.sh BEFORE building)')"
  RP="$(python3 -c 'import json;d=json.load(open("src-tauri/report.json"));print("set" if d.get("email") or d.get("page") else "EMPTY")')"
  echo "  report.json (where problem reports go): $RP$([ "$RP" = EMPTY ] && echo ' (Report a problem would reach nobody; put your email address or an https page in it)')"
  echo "  tested commit: $(sh ../scripts/tested-mark.sh check 2>&1 | sed 's/^FAIL: //')"
  exit 0
fi

: "${COMPANION_SIGN_ID:?set COMPANION_SIGN_ID to the Developer ID Application identity, or run with --dry-run to see what is needed}"
PROFILE="${COMPANION_NOTARY_PROFILE:-companion-notary}"
# Must fix 6: only a commit the whole gate passed on, with nothing uncommitted, is ever built for release. First, before
# any tool, the Keychain or the network. Read only git commands (rule 10); scripts/test-all.sh leaves the note.
sh ../scripts/tested-mark.sh check || exit 1
# Plain checks first, so a missing piece shows up now and not after a ten minute build.
for t in xcrun codesign hdiutil bun cargo python3 ditto; do command -v "$t" >/dev/null 2>&1 || { echo "FAIL: the tool '$t' is missing"; exit 1; }; done
xcrun --find notarytool >/dev/null 2>&1 || { echo "FAIL: notarytool is missing (install Xcode or the Command Line Tools)"; exit 1; }
xcrun --find stapler >/dev/null 2>&1 || { echo "FAIL: stapler is missing (install Xcode or the Command Line Tools)"; exit 1; }
# Lists the names of signing certificates (not their keys).
security find-identity -v -p codesigning 2>/dev/null | grep -qF "$COMPANION_SIGN_ID" || { echo "FAIL: no valid signing certificate named \"$COMPANION_SIGN_ID\" in your Keychain. Check the exact name with: security find-identity -v -p codesigning"; exit 1; }
V="$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"
C="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)"
[ "$V" = "$C" ] || { echo "FAIL: the version is $V in tauri.conf.json but $C in Cargo.toml; make them the same"; exit 1; }
[ "${COMPANION_ALLOW_NO_UPDATER:-}" = "1" ] || python3 -c 'import json,sys;d=json.load(open("src-tauri/updater.json"));sys.exit(0 if d.get("pubkey") and d.get("endpoint") else 1)' || { echo "FAIL: updater.json is empty, so this build could never update itself. Run make-update-key.sh first, commit the file, then release. (To skip on purpose: COMPANION_ALLOW_NO_UPDATER=1.)"; exit 1; }
# Must fix 22: a build whose problem reports reach nobody is refused too, with an override like the updater one.
[ "${COMPANION_ALLOW_NO_REPORT:-}" = "1" ] || python3 -c 'import json,sys;d=json.load(open("src-tauri/report.json"));sys.exit(0 if d.get("email") or d.get("page") else 1)' || { echo "FAIL: report.json is empty, so Report a problem in this build would reach nobody. Put your email address (or an https page) in app/src-tauri/report.json, commit it, then release. (To skip on purpose: COMPANION_ALLOW_NO_REPORT=1.)"; exit 1; }
# Must fix 22: the real Claude install, once, from Anthropic's registry (network, a few minutes), so a release never ships an
# installer path nobody ran for real.
(cd src-tauri && cargo test real_install -- --ignored) || { echo "FAIL: installing Claude for real did not work. Check the internet, then read the test's output above."; exit 1; }
sh scripts/build-app.sh
APP="${CARGO_TARGET_DIR:-src-tauri/target}/release/bundle/macos/Squibby.app"
ZIPDIR="$(mktemp -d)"; trap 'rm -rf "$ZIPDIR"' EXIT
ZIP="$ZIPDIR/Squibby.zip"
# A notarization that comes back Invalid must stop here, whatever the exit code of the tool.
notarize() {
  OUT="$(xcrun notarytool submit "$1" --keychain-profile "$PROFILE" --wait --output-format json)" || { echo "FAIL: notarytool could not submit. Is the profile '$PROFILE' stored (xcrun notarytool store-credentials $PROFILE ...), is the internet on, and is the Apple account approved?"; exit 1; }
  echo "$OUT"
  echo "$OUT" | grep -q '"status" *: *"Accepted"' || { ID="$(echo "$OUT" | sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -1)"; [ -n "$ID" ] && xcrun notarytool log "$ID" --keychain-profile "$PROFILE"; echo "FAIL: Apple did not accept it"; exit 1; }
}
ditto -c -k --keepParent "$APP" "$ZIP"
notarize "$ZIP"
xcrun stapler staple "$APP"
spctl -a -t exec -vv "$APP"
sh scripts/make-dmg.sh
DMG="$(ls -t installer/Squibby-*.dmg | head -1)"
notarize "$DMG"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature -v "$DMG"
echo "ready to send: $PWD/$DMG"
