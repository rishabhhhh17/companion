#!/bin/bash
# Rule 8: no permission prompt at install or launch. These calls ASK (show a dialog or request
# access), so none may appear in the shell code except where the feature that needs it lives.
cd "$(dirname "$0")/../src-tauri/src"
BAD='CGRequestListenEventAccess|CGRequestPostEventAccess|IOHIDRequestAccess|EventTap|CGEventTapCreate'
if grep -rnE "$BAD" . ; then echo "FAIL: a permission asking call is in the shell code"; exit 1; fi
# The Accessibility prompt is allowed only inside ax.rs (which defines it), and only Prompt help may ask for it (the first time its hotkey is used).
if grep -rnE 'AXIsProcessTrustedWithOptions|kAXTrustedCheckOptionPrompt' . | grep -v '^./ax.rs'; then echo "FAIL: the Accessibility prompt is used outside ax.rs"; exit 1; fi
if grep -rn 'trusted(true)' . | grep -v -e '^./ax.rs' -e '^./phelp.rs'; then echo "FAIL: something other than Prompt help asks for Accessibility"; exit 1; fi
# Screen Recording is asked only inside macos_see.rs, and only the first time Show me how is used (main.rs showme_start).
if grep -rn 'CGRequestScreenCaptureAccess' . | grep -v '^./macos_see.rs'; then echo "FAIL: the Screen Recording prompt is used outside macos_see.rs"; exit 1; fi
if grep -rn 'request_screen_recording' . | grep -v -e '^./macos_see.rs' -e '^./main.rs'; then echo "FAIL: something else asks for Screen Recording"; exit 1; fi
# The microphone question is asked only inside voice_mac.rs, and only from the hold to talk worker in main.rs.
if grep -rn 'requestAccessForMediaType' . | grep -v '^./voice_mac.rs'; then echo "FAIL: the microphone prompt is used outside voice_mac.rs"; exit 1; fi
if grep -rn 'ask_for_mic' . | grep -v -e '^./voice_mac.rs' -e '^./main.rs'; then echo "FAIL: something else asks for the microphone"; exit 1; fi
echo "PASS: no permission asking calls in the shell code"
