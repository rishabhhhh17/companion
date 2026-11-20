#!/bin/sh
# M115 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md): does each new tool run Squibby's done line, and does
# Go to find the session's app and tab? Uses the engine's own code (runner/scripts/m115-tools-check.ts).
#   scripts/m115-check-tools.sh <copilotcli|opencode|amp|cline|kiro>   makes a practice folder with that tool's done line
#   scripts/m115-check-tools.sh check <folder>                         says which tools touched their done marker
#   scripts/m115-check-tools.sh where                                  run in a terminal: the app and tab Go to would find
#   scripts/m115-check-tools.sh go [notab]                             run in a terminal tab, then switch away: it comes back
# Every folder is a throwaway practice folder (never a real project). No model is called by this script, nothing is sent
# anywhere, git is never run. Delete the folder when done.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
t="$here/runner/scripts/m115-tools-check.ts"
case "${1:-}" in
  check) exec bun "$t" check "${2:?the practice folder}";;
  where) exec bun "$t" where;;
  go) sleep "${GO_AFTER:-3}"; exec bun "$t" go "${2:-}";;
  copilotcli|opencode|amp|cline|kiro) ;;
  *) echo "Usage: $0 copilotcli|opencode|amp|cline|kiro   or   $0 check <folder>   or   $0 where   or   $0 go [notab]"; exit 2;;
esac
tool=$1
dir=$(mktemp -d "${TMPDIR:-/tmp}/squibby-m115-$tool-XXXX")
bun "$t" setup "$tool" "$dir"
echo "Practice folder: $dir"
case "$tool" in
  copilotcli) echo "1. cd $dir && copilot   (ask it to change 'world' to 'there' in hello.txt; the done line runs when it stops)";;
  opencode)   echo "1. cd $dir && opencode   (ask the same; the plugin in .opencode/plugins runs when the session is idle)";;
  amp)        echo "1. cd $dir && amp   (ask the same; note whether Amp loads .amp/plugins at all)";;
  cline)      echo "1. Open $dir in VS Code with Cline, turn hooks on in Cline's settings, ask the same";;
  kiro)       echo "1. Open $dir in Kiro, check Agent Hooks lists the done signal, ask the same";;
esac
echo "2. When it has finished, run: $0 check $dir"
echo "3. Write down: the tool and its version, PASS or FAIL, and anything the tool said about the new line or file."
