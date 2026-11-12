#!/bin/bash
# Rule 8: no permission prompt at install or launch. These calls ASK (show a dialog or request access), so none may appear
# in the shell code except in the function of the feature that needs it, the first time it is used. Part of
# scripts/test-all.sh (must fix 19). Each asking call is allowed only in the functions named below ("file:function"); a new
# caller must be added here on purpose, after checking it runs only on a press of its own feature.
# Patterns are awk regular expressions: a bracket [(] stands for a plain parenthesis.
# Usage: lint-permissions.sh [folder]   (the folder of the shell's Rust code; app/src-tauri/src unless given, for its test)
DIR="${1:-$(dirname "$0")/../src-tauri/src}"
cd "$DIR" || { echo "FAIL: no folder $DIR"; exit 1; }
fail=0

# Never, anywhere: these read key events or ask for Input Monitoring (rule 8: nothing ever asks for it).
BAD='CGRequestListenEventAccess|CGRequestPostEventAccess|IOHIDRequestAccess|EventTap|CGEventTapCreate'
if grep -rnE "$BAD" --include='*.rs' . ; then echo "FAIL: a call that reads key events or asks for Input Monitoring is in the shell code"; fail=1; fi

# Each line that calls PATTERN, as file:function:line (the function is the nearest "fn name" above it).
callers() {
  for f in *.rs; do
    [ -f "$f" ] || continue
    awk -v F="$f" -v P="$1" '
      /^[[:space:]]*(pub(\([a-z]+\))? )?(async )?(unsafe )?fn [A-Za-z_0-9]+/ { match($0, /fn [A-Za-z_0-9]+/); fn = substr($0, RSTART + 3, RLENGTH - 3) }
      /^[[:space:]]*\/\// { next }
      $0 ~ P { print F ":" fn ":" NR }' "$f"
  done
}
# allow PATTERN WHAT "file:function ..." : every caller of PATTERN must be one of the listed functions.
allow() {
  for c in $(callers "$1"); do
    where="${c%:*}"
    case " $3 " in *" $where "*) ;; *) echo "FAIL: $2 is asked in $c, which is not one of its first use places ($3)"; fail=1 ;; esac
  done
}

# Accessibility: macOS's question is defined in ax.rs (trusted) and asked only on the first press of a feature that needs it.
allow 'AXIsProcessTrustedWithOptions|kAXTrustedCheckOptionPrompt' "the Accessibility question" "ax.rs:AXIsProcessTrustedWithOptions ax.rs:trusted"
# M76: Show me where to paste asks on its first press (rule 8), never before. M82: so does Put it in (the hand off).
allow 'trusted[(]true[)]' "Accessibility" "phelp.rs:on_hotkey seclook.rs:on_hotkey errhelp.rs:press shell_showme.rs:do_it_for_me shell_voice.rs:voice_worker shell_tools.rs:point_paste shell_tools.rs:handoff_put_in_now"
# Screen Recording: defined in macos_see.rs, asked the first time Show me how (or point at the problem) is used.
allow 'CGRequestScreenCaptureAccess[(]' "the Screen Recording question" "macos_see.rs:request_screen_recording"
allow 'request_screen_recording[(][)]' "Screen Recording" "macos_see.rs:request_screen_recording shell_showme.rs:showme_start shell_tools.rs:point_problem"
# The microphone: defined in voice_mac.rs, asked on the first hold of the talk keys.
allow 'requestAccessForMediaType' "the microphone question" "voice_mac.rs:ask_for_mic"
allow 'ask_for_mic[(][)]' "the microphone" "voice_mac.rs:ask_for_mic shell_voice.rs:voice_worker"

# Launch itself: the app's setup never asks for anything, directly or through one of the functions above.
if [ -f main.rs ]; then
  SETUP="$(awk '/\.setup\(move \|app\|/ { on = 1 } on { print } on && /^        \}\)$/ { exit }' main.rs)"
  if printf '%s\n' "$SETUP" | grep -nE 'trusted\(true\)|request_screen_recording\(|ask_for_mic\(|CGRequestScreenCaptureAccess|requestAccessForMediaType|do_it_for_me\(|showme_start\(|point_problem\(|point_paste\('; then
    echo "FAIL: the app's setup asks for a permission at launch"; fail=1
  fi
fi

[ "$fail" = 0 ] || exit 1
echo "PASS: no permission is asked at launch, and each is asked only where its feature is first used"
