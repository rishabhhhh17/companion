#!/bin/bash
# Put the built Squibby.app in a disk image with a shortcut to Applications. Run build-app.sh first.
# Output: app/installer/Squibby-<version>.dmg (never committed), or the folder in COMPANION_DMG_DIR (used by tests). With COMPANION_SIGN_ID the image is signed too.
set -eu
cd "$(dirname "$0")/.."
APP="${CARGO_TARGET_DIR:-src-tauri/target}/release/bundle/macos/Squibby.app"
[ -d "$APP" ] || { echo "FAIL: build the app first (sh scripts/build-app.sh)"; exit 1; }
SIGINFO="$(codesign -dvv "$APP" 2>&1)"
if ! echo "$SIGINFO" | grep -q "flags=.*runtime" || echo "$SIGINFO" | grep -q "Signature=adhoc"; then echo "NOTE: this app is NOT NOTARIZABLE (not signed with a Developer ID and the hardened runtime): fine for friends who press Open Anyway, not for a release. Use release.sh."; fi
VERSION="$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")"
OUT="${COMPANION_DMG_DIR:-installer}"; mkdir -p "$OUT"
DMG="$OUT/Squibby-$VERSION.dmg"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/Squibby.app"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "Squibby $VERSION" -srcfolder "$STAGE" -format UDZO -fs HFS+ -ov "$DMG" >/dev/null
if [ -n "${COMPANION_SIGN_ID:-}" ]; then codesign --force --sign "$COMPANION_SIGN_ID" --timestamp "$DMG" && echo "image signed"; fi
hdiutil verify "$DMG" >/dev/null && echo "image verifies"
ls -lh "$DMG" | awk '{print "disk image: " $9 " (" $5 ")"}'
