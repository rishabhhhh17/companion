#!/bin/bash
# Build Companion.app: the web pages first, then the Rust shell, then verify the bundle.
set -eu
cd "$(dirname "$0")/.."
bun run build
cd src-tauri
cargo tauri build --bundles app
APP="target/release/bundle/macos/Companion.app"
xattr -cr "$APP"
# Development builds are signed with the developer's own Apple Development certificate, so macOS keeps remembering
# permissions (like Accessibility) across rebuilds. A throwaway signature makes it forget every time.
# Never re-sign Anthropic's Claude binary (rule 4): if it is inside the bundle, this step refuses.
if [ "${COMPANION_NO_DEV_SIGN:-}" != "1" ]; then
  ID="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Apple Development' | sed -E 's/^ *[0-9]+\) ([0-9A-F]{40}).*/\1/')"
  if [ -n "$ID" ]; then
    if find "$APP" -type f -name claude | grep -q .; then
      echo "NOT signing with the developer certificate: Anthropic's Claude binary is inside the bundle and must stay untouched"
    else
      codesign --force --sign "$ID" --identifier dev.companion.app "$APP" && echo "signed with the Apple Development certificate (stable across rebuilds)"
    fi
  else
    echo "no Apple Development certificate found: using the throwaway signature (permissions will be forgotten on each rebuild)"
  fi
fi
codesign --verify --deep --strict "$APP" && echo "signature verifies"
if [ "$(plutil -extract LSUIElement raw "$APP/Contents/Info.plist" 2>/dev/null)" = "true" ]; then echo "LSUIElement true (no Dock icon)"; else echo "FAIL: the app would show a Dock icon (LSUIElement is missing)"; exit 1; fi
plutil -extract NSMicrophoneUsageDescription raw "$APP/Contents/Info.plist" >/dev/null 2>&1 || { echo "FAIL: the microphone sentence is missing"; exit 1; }
echo "built: $PWD/$APP"
