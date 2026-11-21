#!/bin/sh
# M108 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md): is each tool handed Squibby's start notes as a session
# starts (and Codex after it compacts)? Uses the engine's own code (runner/scripts/m108-start-check.ts).
#   scripts/m108-check-start.sh <codex|gemini|antigravity>   makes a practice folder with one note and that tool's start line
#   scripts/m108-check-start.sh show <folder> <data folder>  prints exactly what the tool's hook prints
# The practice word lives only in Squibby's start file, in a data folder of its own outside the practice folder, so a tool
# that searches the folder cannot find it (M108 review). The script checks that before you start the tool.
# Every folder is a throwaway practice folder (never a real project). No model is called by this script, nothing is sent
# anywhere, git is never run. Delete both folders when done.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
t="$here/runner/scripts/m108-start-check.ts"
case "${1:-}" in
  show) exec bun "$t" show "${2:?the practice folder}" "${3:?the data folder}";;
  codex|gemini|antigravity) ;;
  *) echo "Usage: $0 codex|gemini|antigravity   or   $0 show <folder>"; exit 2;;
esac
tool=$1
dir=$(mktemp -d "${TMPDIR:-/tmp}/squibby-m108-$tool-XXXX")
data=$(mktemp -d "${TMPDIR:-/tmp}/squibby-m108-data-XXXX")
bun "$t" setup "$tool" "$dir" "$data"
if grep -rq PLUM-7 "$dir"; then echo "FAIL before starting: the practice word is in the practice folder, so the check would prove nothing."; exit 1; fi
echo "Practice folder: $dir"
echo "Data folder (outside it, do not open it in the tool): $data"
case "$tool" in
  codex)       echo "1. cd $dir && codex   (trust the new line with /hooks, then start a new session)";;
  gemini)      echo "1. cd $dir && gemini   (say yes when it asks to trust the project's settings)";;
  antigravity) echo "1. Open $dir in Antigravity and check Customizations lists companion-start";;
esac
echo "2. Ask: What is the practice word in your notes? Do not read any file. (expect PLUM-7)"
[ "$tool" = codex ] && echo "3. Run /compact, then ask again (expect PLUM-7 again), and once after /clear"
echo "Write down: the tool and its version, PASS or FAIL, and what it said. $0 show $dir $data prints what the hook hands over."
echo "Delete both folders when done."
