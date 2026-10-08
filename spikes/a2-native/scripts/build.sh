#!/bin/bash
# Build "Native Spike.app" (AppKit only, ad hoc signed, no Dock icon).
set -eu
cd "$(dirname "$0")/.."
OUT="$HOME/Library/Application Support/dev.companion.spike.native/build"; APP="$OUT/Native Spike.app"
rm -rf "$OUT" && mkdir -p "$APP/Contents/MacOS"
swiftc -O -o "$APP/Contents/MacOS/native-spike" main.swift
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.companion.spike.native</string>
<key>CFBundleName</key><string>Native Spike</string>
<key>CFBundleExecutable</key><string>native-spike</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>
PL
codesign --force -s - "$APP"
echo "built $APP"
