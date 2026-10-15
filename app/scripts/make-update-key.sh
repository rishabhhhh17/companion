#!/bin/bash
# ONE TIME, run by the founder (not by an agent): makes Companion's update signing key.
#  - The PRIVATE key goes into your login Keychain (item "Companion update key") and nowhere else. It is never written
#    into the repo, never shown, never sent anywhere. If you lose it, updates for installed copies stop and people must
#    reinstall; if it leaks, someone could ship an "update" to your users. Back it up like a password.
#  - The PUBLIC key (safe to share) and the address updates are fetched from go into app/src-tauri/updater.json.
# Usage: sh app/scripts/make-update-key.sh https://github.com/<you>/<public-releases-repo>/releases/latest/download/latest.json
set -eu
cd "$(dirname "$0")/.."
ENDPOINT="${1:?give the address updates are fetched from (https://.../latest.json)}"
case "$ENDPOINT" in https://*) ;; *) echo "FAIL: the address must start with https://"; exit 1;; esac
if security find-generic-password -s "Companion update key" >/dev/null 2>&1; then
  echo "A Companion update key already exists in your Keychain. Not making another (that would orphan installed copies)."; exit 1
fi
DIR="$(mktemp -d)"; trap 'rm -rf "$DIR"' EXIT
printf "Choose a password for the update key (you will type it again when publishing): "; read -rs PW; echo
[ -n "$PW" ] || { echo "FAIL: the password cannot be empty"; exit 1; }
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PW" cargo tauri signer generate --ci -w "$DIR/key" >/dev/null   # the password goes in the environment, not on a command line
# Given to `security` on its standard input, not as an argument: arguments can be seen by other programs while it runs.
printf 'add-generic-password -a "%s" -s "Companion update key" -w "%s" -U\n' "$USER" "$(cat "$DIR/key")" | security -i >/dev/null
python3 - "$DIR/key.pub" "$ENDPOINT" <<'PY'
import json, sys
pub = open(sys.argv[1]).read().strip()
open("src-tauri/updater.json", "w").write(json.dumps({"pubkey": pub, "endpoint": sys.argv[2]}, indent=2) + "\n")
PY
echo "Done. The public key and address are in app/src-tauri/updater.json: commit that file. The private key is in your Keychain."
