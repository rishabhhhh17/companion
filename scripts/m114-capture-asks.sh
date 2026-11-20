#!/bin/sh
# M114 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md): what does Claude Code or Codex really hand its
# PermissionRequest hook (and Claude Code its AskUserQuestion hook), and does it honour the replies Squibby would print?
# Makes a throwaway practice folder (never a real project), writes ONE capture hook into that folder's own hook file, and
# tells you what to do. The mode stands in for your press: watch (prints nothing), allow, deny, always or answer.
# Then `scripts/m114-capture-asks.sh check <folder>` prints what the notch's card would show for each request.
# No model is called by this script, nothing is sent anywhere, git is never run. Delete the folder when done.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
if [ "${1:-}" = "check" ]; then exec bun "$here/runner/scripts/m114-ask-check.ts" check "${2:?the practice folder}"; fi
tool=${1:-}; mode=${2:-watch}
case "$tool" in claude|codex) ;; *) echo "Usage: $0 claude|codex [watch|allow|deny|always|answer]   or   $0 check <folder>"; exit 2;; esac
case "$mode" in watch|allow|deny|always|answer) ;; *) echo "The mode is one of watch, allow, deny, always, answer"; exit 2;; esac
dir=$(mktemp -d "${TMPDIR:-/tmp}/squibby-m114-$tool-$mode-XXXX")
bun "$here/runner/scripts/m114-ask-check.ts" setup "$tool" "$mode" "$dir"
echo "Practice folder: $dir"
case "$tool" in
  claude) echo "1. cd $dir && claude   (ask: run 'echo hi > hi.txt'; for answer mode ask: 'ask me which colour to use with your question tool')";;
  codex)  echo "1. cd $dir && codex   (trust the hook with /hooks, then ask it to run 'echo hi > hi.txt' with approvals on request)";;
esac
echo "2. Watch what the tool does: watch = its own prompt as usual; allow = it runs with no prompt; deny = it is told no;"
echo "   always = it runs and the rule appears in .claude/settings.local.json; answer = it goes on with the first choice."
echo "3. Then run: $0 check $dir"
echo "4. Write down: the tool and its version, the mode, PASS or FAIL, and whether its own prompt showed while the hook waited."
