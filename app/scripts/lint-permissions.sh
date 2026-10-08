#!/bin/bash
# Rule 8: no permission prompt at install or launch. These calls ASK (show a dialog or request
# access), so none may appear in the shell code until the feature that needs it exists.
cd "$(dirname "$0")/../src-tauri/src"
BAD='AXIsProcessTrustedWithOptions|CGRequestScreenCaptureAccess|CGRequestListenEventAccess|CGRequestPostEventAccess|requestAccess|NSMicrophoneUsageDescription|requestRecordPermission|kAXTrustedCheckOptionPrompt|IOHIDRequestAccess|EventTap|CGEventTapCreate'
if grep -rnE "$BAD" . ; then echo "FAIL: a permission asking call is in the shell code"; exit 1; fi
echo "PASS: no permission asking calls in the shell code"
