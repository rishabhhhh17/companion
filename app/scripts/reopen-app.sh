#!/bin/bash
# Quit the running Squibby, wait until it has really ended, open the given build as a fresh copy, and check it stays open.
#   app/scripts/reopen-app.sh /path/to/Squibby.app
#
# Use this after build-app.sh instead of "osascript quit; sleep 2; open". On 5 Nov 2026 that chain left Squibby not running:
# two builds overlapped, and the later one's quit landed on the copy the earlier one had just opened (macOS's own log showed
# the quit Apple Event coming from osascript six seconds after the open). A fixed wait also loses to a slow quit, and then
# `open` only hands the launch to the copy that is quitting. So:
#  - two runs of this script never overlap (a lock folder; one left by a run that died is cleared),
#  - the quit is asked only if Squibby is running, and never in a way that could start it,
#  - the new copy opens only once the old one is gone, with `open -n`, so it is never handed to a quitting copy,
#  - and it fails loudly if the new copy is not still running a few seconds later.
# The tools and waits can be swapped for tests (REOPEN_*); the real ones are the defaults.
set -eu
APP="${1:?usage: reopen-app.sh /path/to/Squibby.app}"
BUNDLE_ID="${REOPEN_BUNDLE_ID:-dev.companion.app}"
OSASCRIPT="${REOPEN_OSASCRIPT:-/usr/bin/osascript}"
OPEN="${REOPEN_OPEN:-/usr/bin/open}"
PGREP="${REOPEN_PGREP:-/usr/bin/pgrep}"
LOCK="${REOPEN_LOCK:-${TMPDIR:-/tmp}/squibby-reopen.lock}"
QUIT_WAIT="${REOPEN_QUIT_WAIT:-30}"   # tenths of a second: how long the old copy may take to end, times ten
STAY="${REOPEN_STAY:-8}"              # seconds the new copy must stay open (longer than its own wait for the old one)
LOCK_WAIT="${REOPEN_LOCK_WAIT:-600}"  # tenths of a second to wait for another run of this script
EXE="$(/usr/bin/plutil -extract CFBundleExecutable raw "$APP/Contents/Info.plist")"
running() { "$PGREP" -x "$EXE" >/dev/null 2>&1; }

# One run at a time.
n=0
until mkdir "$LOCK" 2>/dev/null; do
  holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  n=$((n + 1)); [ "$n" -le "$LOCK_WAIT" ] || { echo "FAIL: another reopen is still running"; exit 1; }
  sleep 0.1
done
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

if running; then
  # "if ... is running" first: a plain tell would start Squibby just to quit it if it ended a moment ago.
  "$OSASCRIPT" -e "if application id \"$BUNDLE_ID\" is running then tell application id \"$BUNDLE_ID\" to quit" >/dev/null
  n=0
  while running; do
    n=$((n + 1)); [ "$n" -le "$QUIT_WAIT" ] || { echo "FAIL: the running copy did not quit, so a second one was not opened"; exit 1; }
    sleep 0.1
  done
  echo "the running copy quit"
fi
"$OPEN" -n "$APP"
sleep "$STAY"
running || { echo "FAIL: the new copy opened but is not running now. See ~/Library/Logs/Squibby/exits.log"; exit 1; }
echo "opened and still running: $APP"
