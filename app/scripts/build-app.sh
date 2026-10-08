#!/bin/bash
# Build Companion.app: the web pages first, then the Rust shell, then verify the bundle.
set -eu
cd "$(dirname "$0")/.."
bun run build
cd src-tauri
cargo tauri build --bundles app
APP="target/release/bundle/macos/Companion.app"
xattr -cr "$APP"
codesign --verify --deep --strict "$APP" && echo "signature verifies"
[ "$(plutil -extract LSUIElement raw "$APP/Contents/Info.plist")" = "true" ] && echo "LSUIElement true (no Dock icon)"
echo "built: $PWD/$APP"
