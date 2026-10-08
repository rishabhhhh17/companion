#!/bin/bash
# Build "Paste Spike.app", signed with the founder's free Apple Development identity,
# so the Accessibility permission survives rebuilds. Falls back to ad hoc signing.
set -eu
cd "$(dirname "$0")/.."
APP="build/Paste Spike.app"
rm -rf build && mkdir -p "$APP/Contents/MacOS"
swiftc -O -o "$APP/Contents/MacOS/paste-spike" main.swift -framework Carbon
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.companion.spike.paste</string>
<key>CFBundleName</key><string>Paste Spike</string>
<key>CFBundleExecutable</key><string>paste-spike</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>
PL
ID="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)"
if [ -n "$ID" ]; then codesign --force --options runtime -s "$ID" "$APP"; echo "signed with: $ID"; else codesign --force -s - "$APP"; echo "ad hoc signed"; fi
codesign --verify --strict "$APP" && echo "signature verifies"
