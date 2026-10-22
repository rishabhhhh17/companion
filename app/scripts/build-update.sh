#!/bin/bash
# Makes the files an update needs, from the FINISHED app (after release.sh has built, signed, notarized and stapled it):
#   installer/update/Squibby.app.tar.gz, Squibby.app.tar.gz.sig and latest.json
# It does NOT publish anything. It prints the command to publish; you run it. Needs the update key from make-update-key.sh.
# Usage: sh app/scripts/build-update.sh "what changed, in plain words"
set -eu
cd "$(dirname "$0")/.."
NOTES="${1:?say what changed, in plain words}"
CFG="src-tauri/updater.json"
ENDPOINT="$(python3 -c 'import json;print(json.load(open("'"$CFG"'"))["endpoint"])')"
[ -n "$ENDPOINT" ] || { echo "FAIL: updater.json is not filled in. Run make-update-key.sh first."; exit 1; }
BASE="${ENDPOINT%/latest.json}"
APP="${CARGO_TARGET_DIR:-src-tauri/target}/release/bundle/macos/Squibby.app"
[ -d "$APP" ] || { echo "FAIL: build the app first (release.sh)"; exit 1; }
spctl -a -t exec "$APP" 2>/dev/null || { echo "FAIL: the app is not notarized and signed for distribution; an update must be the finished app"; exit 1; }
VERSION="$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"
CARGO="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)"
[ "$VERSION" = "$CARGO" ] || { echo "FAIL: the version is $VERSION in tauri.conf.json but $CARGO in Cargo.toml; make them the same"; exit 1; }
OUT="installer/update"; rm -rf "$OUT"; mkdir -p "$OUT"
COPYFILE_DISABLE=1 tar -czf "$OUT/Squibby.app.tar.gz" -C "$(dirname "$APP")" Squibby.app
KEY="$(security find-generic-password -s "Companion update key" -w)" || { echo "FAIL: no update key in your Keychain"; exit 1; }
printf "Update key password: "; read -rs PW; echo
# The version is signed into the signature (the app refuses an update whose announced version differs, so a tampered
# manifest cannot pair a new number with an older build).
TAURI_SIGNING_PRIVATE_KEY="$KEY" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PW" cargo tauri signer sign --app-version "$VERSION" "$OUT/Squibby.app.tar.gz" >/dev/null
[ -f "$OUT/Squibby.app.tar.gz.sig" ] || { echo "FAIL: the update was not signed"; exit 1; }
base64 -d < "$OUT/Squibby.app.tar.gz.sig" | grep -q "$VERSION" || { echo "FAIL: the signature does not carry version $VERSION, so the app would refuse it"; exit 1; }
python3 - "$OUT" "$VERSION" "$NOTES" "$BASE" <<'PY'
import json, sys, datetime
out, version, notes, base = sys.argv[1:5]
sig = open(out + "/Squibby.app.tar.gz.sig").read().strip()
url = f"{base}/Squibby.app.tar.gz"
entry = {"signature": sig, "url": url}
latest = {"version": version, "notes": notes, "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "platforms": {"darwin-aarch64": entry}}
open(out + "/latest.json", "w").write(json.dumps(latest, indent=2) + "\n")
PY
# The unpacked copy must still be a valid, sealed app, or the update would be refused or broken.
CHECK="$(mktemp -d)"; tar -xzf "$OUT/Squibby.app.tar.gz" -C "$CHECK"
codesign --verify --deep --strict "$CHECK/Squibby.app" || { rm -rf "$CHECK"; echo "FAIL: the unpacked update is not a valid signed app"; exit 1; }
rm -rf "$CHECK"
echo "Note: this update is for Apple silicon Macs only (darwin-aarch64), like the app itself."
echo "Update $VERSION is ready in app/$OUT. To publish (this goes public, so check it first):"
echo "  gh release create v$VERSION $OUT/Squibby.app.tar.gz $OUT/Squibby.app.tar.gz.sig $OUT/latest.json --repo <your public releases repo> --title v$VERSION --notes \"$NOTES\""
