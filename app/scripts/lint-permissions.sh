#!/bin/bash
# Rule 8: no permission prompt at install or launch. These calls ASK (show a dialog or request
# access), so none may appear in the shell code except where the feature that needs it lives.
cd "$(dirname "$0")/../src-tauri/src"
BAD='CGRequestScreenCaptureAccess|CGRequestListenEventAccess|CGRequestPostEventAccess|requestAccess|NSMicrophoneUsageDescription|requestRecordPermission|IOHIDRequestAccess|EventTap|CGEventTapCreate'
if grep -rnE "$BAD" . ; then echo "FAIL: a permission asking call is in the shell code"; exit 1; fi
# The Accessibility prompt is allowed only inside ax.rs (which defines it), and only Prompt help may ask for it (the first time its hotkey is used).
if grep -rnE 'AXIsProcessTrustedWithOptions|kAXTrustedCheckOptionPrompt' . | grep -v '^./ax.rs'; then echo "FAIL: the Accessibility prompt is used outside ax.rs"; exit 1; fi
if grep -rn 'trusted(true)' . | grep -v -e '^./ax.rs' -e '^./phelp.rs'; then echo "FAIL: something other than Prompt help asks for Accessibility"; exit 1; fi
echo "PASS: no permission asking calls in the shell code"
