#!/bin/bash
# Build Companion.app: the engine staged, the web pages, the Rust shell, then sign and verify.
#  - Development (default): signed with the developer's Apple Development certificate, so macOS keeps remembering
#    permissions (like Accessibility) across rebuilds.
#  - Distribution: COMPANION_SIGN_ID="Developer ID Application: Name (TEAM)" signs with that, hardened runtime and a
#    secure timestamp, ready to notarize (release.sh does that).
# Anthropic's Claude binary inside the app is never touched (rule 4): its checksum is compared after signing.
set -eu
cd "$(dirname "$0")/.."
sh scripts/stage-engine.sh
bun run build
cd src-tauri
cargo tauri build --bundles app
APP="target/release/bundle/macos/Companion.app"
xattr -cr "$APP"
CLAUDE="$APP/Contents/Resources/engine/runner/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"
[ -f "$CLAUDE" ] || { echo "FAIL: the engine did not get into the app"; exit 1; }
BEFORE="$(shasum -a 256 "$CLAUDE" | cut -d' ' -f1)"
[ "$BEFORE" = "$(cat ../vendor/engine/claude.sha256)" ] || { echo "FAIL: the Claude binary in the app is not the one that was staged"; exit 1; }
if [ -n "${COMPANION_SIGN_ID:-}" ]; then
  # The app's own program and its seal only: nested programs (Bun, Claude) keep their makers' signatures.
  codesign --force --sign "$COMPANION_SIGN_ID" --options runtime --timestamp --entitlements Entitlements.plist --identifier dev.companion.app "$APP"
  echo "signed for distribution with: $COMPANION_SIGN_ID"
elif [ "${COMPANION_NO_DEV_SIGN:-}" != "1" ]; then
  ID="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Apple Development' | sed -E 's/^ *[0-9]+\) ([0-9A-F]{40}).*/\1/')"
  if [ -n "$ID" ]; then
    codesign --force --sign "$ID" --identifier dev.companion.app "$APP" && echo "signed with the Apple Development certificate (stable across rebuilds)"
  else
    echo "no Apple Development certificate found: using the throwaway signature (permissions will be forgotten on each rebuild)"
  fi
fi
AFTER="$(shasum -a 256 "$CLAUDE" | cut -d' ' -f1)"
[ "$BEFORE" = "$AFTER" ] || { echo "FAIL: signing changed Anthropic's Claude binary"; exit 1; }
echo "Anthropic's Claude binary is unchanged"
codesign --verify --deep --strict "$APP" && echo "signature verifies"
if [ "$(plutil -extract LSUIElement raw "$APP/Contents/Info.plist" 2>/dev/null)" = "true" ]; then echo "LSUIElement true (no Dock icon)"; else echo "FAIL: the app would show a Dock icon (LSUIElement is missing)"; exit 1; fi
plutil -extract NSMicrophoneUsageDescription raw "$APP/Contents/Info.plist" >/dev/null 2>&1 || { echo "FAIL: the microphone sentence is missing"; exit 1; }
# Info.plist promises a clean Mac relies on: macOS 14 or newer.
[ "$(plutil -extract LSMinimumSystemVersion raw "$APP/Contents/Info.plist" 2>/dev/null)" = "14.0" ] || { echo "FAIL: the minimum macOS version is not 14.0"; exit 1; }
if [ -n "${COMPANION_SIGN_ID:-}" ]; then
  # What Apple's notary checks, checked here first: a Developer ID signature, the hardened runtime and a secure timestamp.
  INFO="$(codesign -dvv "$APP" 2>&1)"
  echo "$INFO" | grep -q "Authority=Developer ID Application" || { echo "FAIL: the app is not signed with a Developer ID Application certificate"; exit 1; }
  echo "$INFO" | grep -q "flags=.*runtime" || { echo "FAIL: the app has no hardened runtime, so Apple would refuse it"; exit 1; }
  echo "$INFO" | grep -q "^Timestamp=" || { echo "FAIL: the app has no secure timestamp, so Apple would refuse it"; exit 1; }
  echo "ready for notarization: Developer ID, hardened runtime, secure timestamp"
fi
echo "built: $PWD/$APP"
