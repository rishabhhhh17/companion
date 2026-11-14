#!/bin/bash
# M92: the signed, notarized release in one step, the day the Apple developer account arrives.
# It reads three names from the environment and nothing else: never a password, never a key or certificate file.
#   APPLE_SIGNING_IDENTITY   the certificate's full name, "Developer ID Application: Your Name (TEAMID1234)"
#   APPLE_TEAM_ID            the 10 character team ID, the same one as in the brackets above
#   SQUIBBY_NOTARY_PROFILE   the name you gave when you stored your notary login once with
#                            xcrun notarytool store-credentials <name> (you type the password there; we never see it)
# Usage:
#   sh app/scripts/sign-release.sh --dry-run          every check that needs no identity: green today, says what is missing
#   sh app/scripts/sign-release.sh                    the real release (release.sh does build, sign, notarize, staple, image)
#   sh app/scripts/sign-release.sh --verify-only APP  only the checks after signing, on an app you already built
#   sh app/scripts/sign-release.sh --check-claude F   only the Claude check, on one file
# The founder's steps, in plain words: docs/milestones/M92-signing-ready.md.
# Anthropic's Claude binary is never inside the app (M22: installed at first run, checked there by claude_install.rs) and
# never signed or changed by us (rule 4). This script checks the SDK package's copy, the one the first run install must
# match, still carries Anthropic's own signature, and that no Claude binary got into the app.
set -eu
cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"
MODE=real
case "${1:-}" in
  "") ;;
  --dry-run) MODE=dry ;;
  --verify-only) MODE=verify; TARGET_APP="${2:?give the path of the built Squibby.app}" ;;
  --check-claude) MODE=claude; TARGET_FILE="${2:?give the path of a claude binary}" ;;
  *) echo "Usage: sign-release.sh [--dry-run | --verify-only <Squibby.app> | --check-claude <file>]"; exit 2 ;;
esac

# The entitlements the app's own program carries, and why. Each one is checked, nothing more is allowed:
#   com.apple.security.device.audio-input   the talk keys: the hardened runtime blocks the microphone without it.
# Not needed, on purpose:
#   allow-jit and allow-unsigned-executable-memory: the pages run in WebKit, whose JavaScript runs in Apple's own web
#     content process, not in ours; Bun (the engine) is its own program and carries its own JIT entitlements in its maker's
#     signature, which we never touch.
#   camera: the camera check is switched off (presentation.rs CAMERA_CHECK_ON) and never opens a camera.
#   apple-events: every osascript use is one of the Mac's own dialogs (choose folder, save, delete everything), shown by
#     osascript itself; nothing sends events to another app.
#   screen capture and Accessibility have no entitlement: macOS asks the person itself the first time (rule 8).
EXPECTED_ENTITLEMENTS="com.apple.security.device.audio-input"
PIN="$ROOT/protocol/claude-pin.json"
pin() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$PIN" "$1"; }
CLAUDE_TEAM="$(pin team)"; CLAUDE_IDENTIFIER="$(pin identifier)"; CLAUDE_VERSION="$(pin version)"
SDK_CLAUDE="$ROOT/runner/node_modules/$(pin package)/claude"

# Problems with the three names, one per line (empty when all are well formed). Never touches the Keychain.
name_problems() {
  [ -n "${APPLE_SIGNING_IDENTITY:-}" ] || echo "APPLE_SIGNING_IDENTITY is not set"
  [ -n "${APPLE_TEAM_ID:-}" ] || echo "APPLE_TEAM_ID is not set"
  [ -n "${SQUIBBY_NOTARY_PROFILE:-}" ] || echo "SQUIBBY_NOTARY_PROFILE is not set"
  if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    case "$APPLE_SIGNING_IDENTITY" in "Developer ID Application: "*) ;; *) echo "APPLE_SIGNING_IDENTITY must be a Developer ID Application certificate (it starts with \"Developer ID Application: \"), not an Apple Development or Mac App Store one";; esac
  fi
  if [ -n "${APPLE_TEAM_ID:-}" ]; then
    echo "$APPLE_TEAM_ID" | grep -Eq '^[A-Z0-9]{10}$' || echo "APPLE_TEAM_ID must be 10 capital letters and digits, like ABCDE12345"
    if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
      case "$APPLE_SIGNING_IDENTITY" in *"($APPLE_TEAM_ID)") ;; *) echo "APPLE_SIGNING_IDENTITY does not end with ($APPLE_TEAM_ID), so it is another team's certificate or the team ID is wrong";; esac
    fi
  fi
  if [ -n "${SQUIBBY_NOTARY_PROFILE:-}" ]; then
    echo "$SQUIBBY_NOTARY_PROFILE" | grep -Eq '^[A-Za-z0-9._-]{1,64}$' || echo "SQUIBBY_NOTARY_PROFILE must be a plain name (letters, digits, dot, dash, underscore), the one you gave notarytool store-credentials"
  fi
  return 0
}

# The keys set to true in a plist read from standard input, sorted, one per line.
plist_keys() { python3 -c 'import plistlib,sys
d=plistlib.loads(sys.stdin.buffer.read() or b"<plist><dict/></plist>")
print("\n".join(sorted(k for k,v in d.items() if v is True)))'; }

check_entitlements_file() {
  GOT="$(plist_keys < src-tauri/Entitlements.plist)"
  [ "$GOT" = "$EXPECTED_ENTITLEMENTS" ] || { echo "FAIL: Entitlements.plist must hold exactly $EXPECTED_ENTITLEMENTS, but holds: $(echo "$GOT" | tr '\n' ' ')"; return 1; }
  echo "  entitlements: exactly $EXPECTED_ENTITLEMENTS (the talk keys); no JIT, camera or library validation switch"
  plutil -extract NSMicrophoneUsageDescription raw src-tauri/Info.plist >/dev/null 2>&1 || { echo "FAIL: Info.plist has no microphone sentence"; return 1; }
  echo "  Info.plist: the microphone sentence is there (macOS has no such sentence for screen recording; it asks itself)"
}

# Whether a file is Anthropic's own signed Claude: a valid signature, their Developer ID, their team and identifier, the
# hardened runtime; and, when it is not the SDK copy itself, byte for byte the SDK package's copy.
check_claude() {
  F="$1"
  [ -f "$F" ] || { echo "FAIL: no file at $F"; return 1; }
  # Bytes first: a changed copy is named as changed, whatever its signature now says.
  if [ -f "$SDK_CLAUDE" ] && [ "$(cd "$(dirname "$F")" && pwd)/$(basename "$F")" != "$SDK_CLAUDE" ]; then
    cmp -s "$F" "$SDK_CLAUDE" || { echo "FAIL: the Claude binary at $F is not the same bytes as the SDK package's copy"; return 1; }
    echo "  same bytes as the SDK package's copy"
  fi
  codesign --verify --strict "$F" 2>/dev/null || { echo "FAIL: the Claude binary's signature does not verify: $F"; return 1; }
  INFO="$(codesign -dvv "$F" 2>&1 || true)"
  echo "$INFO" | grep -q "^TeamIdentifier=$CLAUDE_TEAM\$" && echo "$INFO" | grep -q "^Identifier=$CLAUDE_IDENTIFIER\$" \
    && echo "$INFO" | grep -q "^Authority=Developer ID Application: .*($CLAUDE_TEAM)\$" && echo "$INFO" | grep -q "flags=.*runtime" \
    || { echo "FAIL: the Claude binary is not signed by Anthropic (team $CLAUDE_TEAM, $CLAUDE_IDENTIFIER): $F"; return 1; }
  WHO="$(echo "$INFO" | sed -n 's/^Authority=Developer ID Application: //p' | head -1)"
  echo "  Claude at $F: signed by $WHO"
}

check_sdk_claude() {
  [ -f "$SDK_CLAUDE" ] || { echo "  Claude in the SDK package: not installed here (run bun install in runner), so not checked"; return 0; }
  GOTV="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$(dirname "$SDK_CLAUDE")/package.json")"
  [ "$GOTV" = "$CLAUDE_VERSION" ] || { echo "FAIL: the SDK package's Claude is $GOTV but protocol/claude-pin.json pins $CLAUDE_VERSION"; return 1; }
  OUT="$(check_claude "$SDK_CLAUDE")" || { echo "$OUT"; return 1; }
  WHO="$(echo "$OUT" | sed -n 's/.*: signed by //p')"
  echo "  Claude in the SDK package: signed by $WHO, version $CLAUDE_VERSION as pinned (the first run install must match it)"
}

check_no_claude_inside() {
  INSIDE="$(find "$1" -type f -name claude 2>/dev/null | head -1)"
  [ -z "$INSIDE" ] || { echo "FAIL: a Claude binary is inside the app: $INSIDE. Anthropic's Claude is installed at first run, never shipped inside (M22)"; return 1; }
  echo "  no Claude binary inside the app (Anthropic's own build is installed at first run and checked there)"
}

check_repo_clean_of_signing_files() {
  # Read only (rule 10): which tracked files look like signing material. None may ever be committed.
  FOUND="$(cd "$ROOT" && git ls-files -- '*.p12' '*.p8' '*.cer' '*.certSigningRequest' '*.mobileprovision' '*.provisionprofile' 2>/dev/null || true)"
  [ -z "$FOUND" ] || { echo "FAIL: signing files are committed to the repo: $FOUND"; return 1; }
  echo "  no signing files in the repo (no .p12, .p8, .cer or profiles tracked)"
}

bun_note() {
  B="vendor/engine/bin/bun"; [ -f "$B" ] || B="$(command -v bun || true)"
  [ -n "$B" ] && [ -f "$B" ] || { echo "  Bun: not found, its own entitlements not shown"; return 0; }
  E="$(codesign -d --entitlements - --xml "$B" 2>/dev/null | plist_keys | grep -c 'allow-jit' || true)"
  T="$(codesign -dvv "$B" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
  if [ "$E" = "1" ]; then echo "  Bun ($B): carries its own allow-jit in its maker's signature (team ${T:-unknown}), so the app needs none"
  else echo "  Bun ($B): no allow-jit of its own; check the engine still runs in the signed build"; fi
}

# The checks after signing, on a built app.
verify_app() {
  APP="$1"
  [ -d "$APP" ] || { echo "FAIL: no app at $APP"; return 1; }
  echo "Checking $APP"
  check_no_claude_inside "$APP" || return 1
  codesign --verify --deep --strict "$APP" 2>/dev/null || { echo "FAIL: the app's signature does not verify (codesign --verify --deep --strict)"; return 1; }
  echo "  signature verifies (deep, strict)"
  INFO="$(codesign -dvv "$APP" 2>&1)"
  echo "$INFO" | grep -q "^Authority=Developer ID Application: " || { echo "FAIL: the app is not signed with a Developer ID Application certificate"; return 1; }
  [ -z "${APPLE_TEAM_ID:-}" ] || echo "$INFO" | grep -q "^TeamIdentifier=$APPLE_TEAM_ID\$" || { echo "FAIL: the app is signed by another team than $APPLE_TEAM_ID"; return 1; }
  echo "$INFO" | grep -q "flags=.*runtime" || { echo "FAIL: the app has no hardened runtime"; return 1; }
  echo "$INFO" | grep -q "^Timestamp=" || { echo "FAIL: the app has no secure timestamp"; return 1; }
  echo "  Developer ID, hardened runtime and a secure timestamp"
  GOT="$(codesign -d --entitlements - --xml "$APP" 2>/dev/null | plist_keys)"
  [ "$GOT" = "$EXPECTED_ENTITLEMENTS" ] || { echo "FAIL: the signed app carries these entitlements: $(echo "$GOT" | tr '\n' ' '), not exactly $EXPECTED_ENTITLEMENTS"; return 1; }
  echo "  the signed app's entitlements: exactly $EXPECTED_ENTITLEMENTS"
  B="$APP/Contents/Resources/engine/bin/bun"
  if [ -f "$B" ]; then
    codesign --verify --strict "$B" 2>/dev/null || { echo "FAIL: Bun inside the app no longer verifies"; return 1; }
    WANT="$(cat "$APP/Contents/Resources/engine/bun.sha256" 2>/dev/null || true)"
    [ -z "$WANT" ] || [ "$(shasum -a 256 "$B" | cut -d' ' -f1)" = "$WANT" ] || { echo "FAIL: Bun inside the app was changed after staging"; return 1; }
    echo "  Bun inside keeps its maker's signature, unchanged"
  fi
  SP="$(spctl -a -t exec -vv "$APP" 2>&1 || true)"
  echo "$SP" | grep -q "accepted" && echo "$SP" | grep -q "Notarized Developer ID" || { echo "FAIL: Gatekeeper does not accept it as notarized: $SP"; return 1; }
  echo "  Gatekeeper accepts it: Notarized Developer ID"
  xcrun stapler validate "$APP" >/dev/null 2>&1 || { echo "FAIL: no notarization ticket is stapled to the app"; return 1; }
  echo "  the notarization ticket is stapled"
}

if [ "$MODE" = claude ]; then check_claude "$TARGET_FILE"; exit $?; fi
if [ "$MODE" = verify ]; then verify_app "$TARGET_APP" && echo "VERIFIED"; exit $?; fi

if [ "$MODE" = dry ]; then
  echo "DRY RUN: nothing is built, signed, sent to Apple or read from the Keychain."
  echo "The three names:"
  PROBLEMS="$(name_problems)"
  for n in APPLE_SIGNING_IDENTITY APPLE_TEAM_ID SQUIBBY_NOTARY_PROFILE; do
    eval "v=\${$n:-}"
    if [ -z "$v" ]; then echo "  $n: NOT SET"
    elif [ "$n" = APPLE_TEAM_ID ] && [ -n "${APPLE_SIGNING_IDENTITY:-}" ] && ! echo "$PROBLEMS" | grep -q "APPLE_TEAM_ID\|($APPLE_TEAM_ID)"; then echo "  $n: set ($v, matches the identity)"
    else echo "  $n: set ($v)"; fi
  done
  FAULT=0
  echo "The repo:"
  check_repo_clean_of_signing_files || FAULT=1
  check_entitlements_file || FAULT=1
  bun_note
  echo "Anthropic's Claude:"
  check_sdk_claude || FAULT=1
  if grep -q '"externalBin"' src-tauri/tauri.conf.json; then echo "FAIL: tauri.conf.json has an externalBin, which Tauri re-signs (rule 4)"; FAULT=1; else echo "  no externalBin in tauri.conf.json (Tauri never re-signs a bundled program)"; fi
  echo "The release steps (release.sh --dry-run, with your names):"
  # Kept, not piped (M92 review): a crash in release.sh's dry run is a FAIL, and what it finds missing joins the final list.
  RELEASE_OUT="$(COMPANION_SIGN_ID="${APPLE_SIGNING_IDENTITY:-}" COMPANION_NOTARY_PROFILE="${SQUIBBY_NOTARY_PROFILE:-squibby-notary}" bash scripts/release.sh --dry-run 2>&1)" \
    || { echo "$RELEASE_OUT" | sed 's/^/  /'; echo "FAIL: release.sh --dry-run stopped with an error"; FAULT=1; RELEASE_OUT=""; }
  [ -z "$RELEASE_OUT" ] || echo "$RELEASE_OUT" | sed 's/^/  /'
  # A tool MISSING, a version MISMATCH, and a tested commit that is not a pass are each something left to do.
  RELEASE_LEFT="$(echo "$RELEASE_OUT" | sed -En 's/^ *//; /MISSING|MISMATCH/p; /^tested commit: /{/^tested commit: Tested:/!p;}')"
  [ -z "$RELEASE_LEFT" ] || PROBLEMS="$(printf '%s\n%s' "$PROBLEMS" "$RELEASE_LEFT")"
  echo "Then, after notarizing: codesign --verify --deep --strict, Gatekeeper (spctl -a -vv), the stapled ticket, the signed"
  echo "app's entitlements, no Claude binary inside, and Bun unchanged (the same checks as --verify-only)."
  [ "$FAULT" = 0 ] || { echo "DRY RUN FAILED: fix the FAIL lines above first."; exit 1; }
  # What release.sh would also refuse, said here in the same list (each has its own override there).
  python3 -c 'import json,sys;d=json.load(open("src-tauri/updater.json"));sys.exit(0 if d.get("pubkey") and d.get("endpoint") else 1)' \
    || PROBLEMS="$(printf '%s\n%s' "$PROBLEMS" "updater.json is empty: run app/scripts/make-update-key.sh once, so the signed build can update itself")"
  python3 -c 'import json,sys;d=json.load(open("src-tauri/report.json"));sys.exit(0 if d.get("email") or d.get("page") else 1)' \
    || PROBLEMS="$(printf '%s\n%s' "$PROBLEMS" "report.json is empty: put your email address or an https page in app/src-tauri/report.json")"
  PROBLEMS="$(echo "$PROBLEMS" | sed '/^$/d')"
  if [ -n "$PROBLEMS" ]; then
    echo "Missing before a real run:"
    echo "$PROBLEMS" | sed 's/^/  - /'
    echo "NOT READY: every check of the repo passed; the list above is what is left (docs/milestones/M92-signing-ready.md)."
  else
    echo "READY to run for real, once the certificate is in your Keychain and the notary profile is stored."
  fi
  exit 0
fi

# The real run. The names first, before anything else runs.
PROBLEMS="$(name_problems)"
if [ -n "$PROBLEMS" ]; then
  echo "$PROBLEMS" | sed 's/^/FAIL: /'
  echo "Nothing was run. Set the names (docs/milestones/M92-signing-ready.md), or see what is missing with --dry-run."
  exit 1
fi
check_repo_clean_of_signing_files
check_entitlements_file
check_sdk_claude
COMPANION_SIGN_ID="$APPLE_SIGNING_IDENTITY" COMPANION_NOTARY_PROFILE="$SQUIBBY_NOTARY_PROFILE" bash scripts/release.sh
APP="${CARGO_TARGET_DIR:-src-tauri/target}/release/bundle/macos/Squibby.app"
verify_app "$APP"
echo "SIGNED, NOTARIZED AND VERIFIED: $APP"
