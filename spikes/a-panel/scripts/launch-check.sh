#!/bin/bash
# Quiet launch check (no permission needed).
#   launch-check.sh            open Panel Spike; the front app must not change
#   launch-check.sh control    positive control: open Calculator; this MUST report FAIL,
#                              which proves the witness sees front app changes
# Extra `open` arguments (for example --env PANEL_MODE=b) can follow "panel".
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${APP:-$HERE/../src-tauri/target/release/bundle/macos/Panel Spike.app}"
WHAT="${1:-panel}"; shift || true
front_bid() { lsappinfo info "$(lsappinfo front)" | sed -n 's/.*bundleID="\([^"]*\)".*/\1/p' | head -1; }
"$HERE/stop.sh"
CALC_WAS_RUNNING=0; pgrep -x Calculator >/dev/null && CALC_WAS_RUNNING=1
BEFORE="$(front_bid)"
W="$(mktemp -t panelspike-witness)"
lsappinfo listen +becameFrontmost +menuBarAcquired wait -duration 9 > "$W" 2>&1 &
LPID=$!
sleep 0.5
if [ "$WHAT" = "control" ]; then
  open -a Calculator
  TARGET_BID="com.apple.calculator"
else
  open "$@" "$APP"
  TARGET_BID="dev.companion.spike.panel"
fi
sleep 6
AFTER="$(front_bid)"
ASN="$(lsappinfo find bundleid="$TARGET_BID" | head -1)"
TYPE="$(lsappinfo info "$ASN" 2>/dev/null | sed -n 's/.*type="\([^"]*\)".*/\1/p' | head -1)"
wait $LPID 2>/dev/null
# Count only notifications where OUR target became frontmost or took the menu bar.
if [ "$WHAT" = "control" ]; then TARGET_NAME="Calculator"; else TARGET_NAME="Panel Spike"; fi
WIT="$(grep -E 'kLSNotify(BecameFrontmost|MenuBarAcquired)' "$W" | grep -cE "CFBundleIdentifier\"=\"$TARGET_BID\"|affectedASN=\"$TARGET_NAME\"")"
OTHERS="$(grep -E 'kLSNotifyBecameFrontmost' "$W" | sed -n 's/.*CFBundleIdentifier"="\([^"]*\)".*/\1/p' | sort -u | tr '\n' ' ')"
echo "front before: $BEFORE"
echo "front after:  $AFTER"
echo "app type:     $TYPE"
echo "witness hits: $WIT"
fail=0
echo "fronts seen:  ${OTHERS:-none}"
if [ "$BEFORE" = "$AFTER" ]; then echo "PASS  front app unchanged"
elif [ "$AFTER" = "$TARGET_BID" ]; then echo "FAIL  the target took the front"; fail=1
else echo "NOTE  front changed to $AFTER by another app (someone using the Mac?); judge by the witness line"; fi
[ "$WIT" = "0" ] && echo "PASS  witness saw no activation" || { echo "FAIL  witness saw an activation"; fail=1; }
if [ "$WHAT" = "control" ] && [ "$WIT" = "0" ]; then echo "CONTROL BROKEN: the witness did not see Calculator take the front"; fail=2; fi
if [ "$WHAT" != "control" ]; then
  [ "$TYPE" = "UIElement" ] && echo "PASS  app type UIElement (no Dock icon)" || { echo "FAIL  app type is '$TYPE', expected UIElement"; fail=1; }
fi
if [ "$WHAT" = "control" ] && [ "$CALC_WAS_RUNNING" = "0" ]; then pkill -x Calculator; fi
rm -f "$W"
exit $fail
