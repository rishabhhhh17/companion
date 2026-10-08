#!/bin/bash
# Fail if the spike calls anything that could steal focus, activate the app, or
# need a privacy permission.
# 1. clippy with disallowed-methods (src-tauri/clippy.toml): catches calls by type,
#    however they are formatted or named.
# 2. a text search, comments stripped, over Rust, JS and config, for APIs that
#    clippy does not cover (permission APIs, builder flags, AppleScript).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/.."
fail=0
. "$HOME/.cargo/env"
if (cd "$ROOT/src-tauri" && cargo clippy --quiet -- -D clippy::disallowed_methods >/tmp/panelspike-clippy.txt 2>&1); then
  echo "PASS  clippy: no disallowed focus or activation calls"
else
  echo "FAIL  clippy:"; grep -E "disallowed|-->|^error" /tmp/panelspike-clippy.txt | head -20; fail=1
fi
PATTERNS='set_focus\(|\.maximize\(|set_fullscreen\(|show_and_make_key|makeKeyAndOrderFront|make_key_and_order_front|activateIgnoringOtherApps|NSApplication::activate|\.activate\(|ActivationPolicy::Regular|activate_ignoring_other_apps\(true\)|\.visible\(true\)|\.focused\(true\)|addGlobalMonitor|CGEventTap|KeyDown|osascript|NSAppleScript|AXIsProcessTrustedWithOptions|CGRequestScreenCaptureAccess|CGWindowListCreateImage|SCShareableContent|SCScreenshotManager|AVCaptureDevice|PanelLevel::Floating'
hits=""
while IFS= read -r f; do
  out=$(sed -e 's#//.*$##' "$f" | grep -nE "$PATTERNS")
  [ -n "$out" ] && hits="$hits"$'\n'"$f: $out"
done < <(find "$ROOT/src-tauri/src" "$ROOT/src-tauri/build.rs" "$ROOT/ui" -type f \( -name '*.rs' -o -name '*.js' -o -name '*.html' \))
if grep -qE '"(focus|visible)"\s*:\s*true' "$ROOT/src-tauri/tauri.conf.json"; then hits="$hits"$'\n'"tauri.conf.json: a window is focused or visible at start"; fi
if [ -n "$(echo "$hits" | tr -d '[:space:]')" ]; then echo "FAIL  forbidden calls:"; echo "$hits"; fail=1; else echo "PASS  text search: no forbidden or permission needing calls"; fi
exit $fail
