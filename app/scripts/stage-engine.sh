#!/bin/bash
# Stage the engine that goes inside Squibby.app: Bun, the runner and its production packages. Anthropic's Claude binary is
# NOT staged (M22, AGENTS.md rule 4: bundling it needs an agreement with Anthropic): the SDK's platform package is left out
# here, and the app installs Anthropic's own build at first run (claude_install.rs).
# Output: app/vendor/engine (never committed). Apple Silicon only for now.
set -eu
cd "$(dirname "$0")/../.."
ROOT="$PWD"
OUT="$ROOT/app/vendor/engine"
[ "$(uname -m)" = "arm64" ] || { echo "FAIL: this build needs an Apple Silicon Mac (the engine staged here is arm64)"; exit 1; }
BUN="$(command -v bun)" || { echo "FAIL: bun is not installed"; exit 1; }
# Bun is pinned: a different one on the next build would change the runtime for every friend without a word.
BUN_PIN="1.4.2"
[ "$("$BUN" --version)" = "$BUN_PIN" ] || { echo "FAIL: this build is pinned to Bun $BUN_PIN but found $("$BUN" --version). Install that version, or change the pin on purpose (and run the full suite)."; exit 1; }
SDK_PIN="$(grep -m1 '"@anthropic-ai/claude-agent-sdk"' runner/package.json | sed -E 's/.*: *"([^"]+)".*/\1/')"
rm -rf "$OUT"; mkdir -p "$OUT/bin" "$OUT/runner" "$OUT/protocol"
cp -L "$BUN" "$OUT/bin/bun"; chmod 755 "$OUT/bin/bun"
cp -R runner/src "$OUT/runner/src"
cp runner/package.json runner/bun.lock "$OUT/runner/"
cp protocol/index.ts protocol/settings.ts protocol/settings.json protocol/apps.json protocol/groups.json protocol/names.json protocol/package.json "$OUT/protocol/"   # settings: the registry (T16); apps: the one list of apps by kind; groups: which tool is in which group (F20); names: the product and character names (rule 21)
cp -R lessons "$OUT/lessons"
# Only what the runner needs to run, exactly as locked.
(cd "$OUT/runner" && bun install --production --frozen-lockfile --ignore-scripts >/dev/null)
# Anthropic's Claude binary stays out of the app (M22): the platform package is removed, and nothing named claude may be left.
rm -rf "$OUT/runner/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64"
LEFT="$(find "$OUT" -type f -name claude | head -1)"
[ -z "$LEFT" ] || { echo "FAIL: a Claude binary is still in the staged engine: $LEFT"; exit 1; }
echo "Anthropic's Claude binary left out of the app (installed at first run)"
# The staged Claude binary must be the pinned SDK version's (the SDK package and its platform package move together).
GOT="$(grep -m1 '"version"' "$OUT/runner/node_modules/@anthropic-ai/claude-agent-sdk/package.json" | sed -E 's/.*: *"([^"]+)".*/\1/')"
[ "$GOT" = "$SDK_PIN" ] || { echo "FAIL: the staged SDK is $GOT but the runner pins $SDK_PIN"; exit 1; }
shasum -a 256 "$OUT/bin/bun" | cut -d' ' -f1 > "$OUT/bun.sha256"
# Test and type files are not needed at run time.
find "$OUT/runner/src" -name '*.test.ts' -delete
# Source maps and hidden folders from the packages are not needed in the app.
find "$OUT" -type f -name '*.map' -delete
find "$OUT" -type d -name '.github' -prune -exec rm -rf {} +
# Every program inside the engine (any Mach-O file, whatever its name) must carry its maker's real signature: a notarized app
# is refused otherwise. A release build (COMPANION_SIGN_ID set) fails here, minutes before Apple would; a development build
# only says so.
BAD=""
LIST="$(mktemp)"; trap 'rm -f "$LIST"' EXIT
find "$OUT" -type f -print0 | xargs -0 file | grep 'Mach-O' | cut -d: -f1 > "$LIST" || true
while IFS= read -r f; do
  [ -z "$f" ] && continue
  INFO="$(codesign -dvv "$f" 2>&1 || true)"
  echo "$INFO" | grep -q "Authority=Developer ID" && echo "$INFO" | grep -q "(runtime)" && echo "$INFO" | grep -q "Timestamp=" || BAD="$BAD$f
"
done < "$LIST"
if [ -n "$BAD" ]; then
  if [ -n "${COMPANION_SIGN_ID:-}" ]; then echo "FAIL: these programs inside the engine are not signed with a Developer ID, hardened runtime and a timestamp, so Apple would refuse the app:"; printf '%s' "$BAD"; exit 1; fi
  echo "NOTE: these programs inside the engine are not signed for notarization (fine for a development build):"; printf '%s' "$BAD"
fi
chmod -R u+w "$OUT"   # read only files would stop the bundler from cleaning attributes
du -sh "$OUT" | sed 's/^/staged engine: /'
