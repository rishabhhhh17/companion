#!/bin/bash
# The whole release, once Apple has approved the developer account. NOT YET RUN: it needs things only the founder has
# (a "Developer ID Application" certificate in the Keychain, and notary credentials stored once with
#   xcrun notarytool store-credentials companion-notary --apple-id <id> --team-id <team>  ).
# Usage: COMPANION_SIGN_ID="Developer ID Application: Name (TEAM)" sh app/scripts/release.sh
# Order: build and sign the app (hardened runtime) -> notarize the app -> staple -> disk image (signed) -> notarize -> staple.
set -eu
cd "$(dirname "$0")/.."
: "${COMPANION_SIGN_ID:?set COMPANION_SIGN_ID to the Developer ID Application identity}"
PROFILE="${COMPANION_NOTARY_PROFILE:-companion-notary}"
sh scripts/build-app.sh
APP="src-tauri/target/release/bundle/macos/Companion.app"
ZIPDIR="$(mktemp -d)"; trap 'rm -rf "$ZIPDIR"' EXIT
ZIP="$ZIPDIR/Companion.zip"
# A notarization that comes back Invalid must stop here, whatever the exit code of the tool.
notarize() {
  OUT="$(xcrun notarytool submit "$1" --keychain-profile "$PROFILE" --wait --output-format json)"
  echo "$OUT"
  echo "$OUT" | grep -q '"status" *: *"Accepted"' || { ID="$(echo "$OUT" | sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -1)"; [ -n "$ID" ] && xcrun notarytool log "$ID" --keychain-profile "$PROFILE"; echo "FAIL: Apple did not accept it"; exit 1; }
}
ditto -c -k --keepParent "$APP" "$ZIP"
notarize "$ZIP"
xcrun stapler staple "$APP"
spctl -a -t exec -vv "$APP"
sh scripts/make-dmg.sh
DMG="$(ls -t installer/Companion-*.dmg | head -1)"
notarize "$DMG"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature -v "$DMG"
echo "ready to send: $PWD/$DMG"
