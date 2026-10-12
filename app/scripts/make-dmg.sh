#!/bin/bash
# Put the built Companion.app in a disk image with a shortcut to Applications. Run build-app.sh first.
# Output: app/installer/Companion-<version>.dmg (never committed). With COMPANION_SIGN_ID the image is signed too.
set -eu
cd "$(dirname "$0")/.."
APP="src-tauri/target/release/bundle/macos/Companion.app"
[ -d "$APP" ] || { echo "FAIL: build the app first (sh scripts/build-app.sh)"; exit 1; }
if ! codesign -dvv "$APP" 2>&1 | grep -q "(runtime)"; then echo "NOTE: this app is NOT NOTARIZABLE (no hardened runtime): fine for friends who press Open Anyway, not for a release. Use release.sh."; fi
VERSION="$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")"
OUT="installer"; mkdir -p "$OUT"
DMG="$OUT/Companion-$VERSION.dmg"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/Companion.app"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "Companion $VERSION" -srcfolder "$STAGE" -format UDZO -fs HFS+ -ov "$DMG" >/dev/null
if [ -n "${COMPANION_SIGN_ID:-}" ]; then codesign --force --sign "$COMPANION_SIGN_ID" --timestamp "$DMG" && echo "image signed"; fi
hdiutil verify "$DMG" >/dev/null && echo "image verifies"
ls -lh "$DMG" | awk '{print "disk image: " $9 " (" $5 ")"}'
