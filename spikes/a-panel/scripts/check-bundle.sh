#!/bin/bash
# Bundle checks that need no permission. Prints PASS or FAIL per line.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${APP:-$HERE/../src-tauri/target/release/bundle/macos/Panel Spike.app}"
PL="$APP/Contents/Info.plist"
fail=0
ok() { echo "PASS  $1"; }
no() { echo "FAIL  $1"; fail=1; }
[ -d "$APP" ] || { no "bundle exists at $APP"; exit 1; }
[ "$(plutil -extract LSUIElement raw "$PL" 2>/dev/null)" = "true" ] && ok "LSUIElement is true (no Dock icon)" || no "LSUIElement is true"
[ "$(plutil -extract CFBundleIdentifier raw "$PL")" = "dev.companion.spike.panel" ] && ok "bundle id dev.companion.spike.panel" || no "bundle id"
if plutil -p "$PL" | grep -q "UsageDescription"; then no "no privacy usage descriptions (found one)"; else ok "no privacy usage descriptions in Info.plist"; fi
# iCloud Drive (Desktop sync) adds a FinderInfo xattr that --strict rejects; it is
# not part of the signature. Clear it on our build output, then verify.
xattr -cr "$APP" 2>/dev/null
if OUT=$(codesign --verify --deep --strict "$APP" 2>&1); then ok "codesign verifies"; else no "codesign verifies: $OUT"; fi
codesign -dv --verbose=4 "$APP" 2>&1 | grep -q "Signature=adhoc" && ok "ad hoc signature (no Apple account needed)" || no "ad hoc signature"
ENT="$(codesign -d --entitlements - "$APP" 2>/dev/null)"
if echo "$ENT" | grep -qiE "device\.(camera|audio-input)|personal-information|automation\.apple-events"; then no "no privacy entitlements"; else ok "no privacy entitlements"; fi
exit $fail
