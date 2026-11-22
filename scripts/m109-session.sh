#!/bin/sh
# M109 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md): the guided session that proves Squibby's safety net in
# one of the seven tools. Uses the engine's own code (runner/scripts/m109-session.ts, runner/src/realmac.ts).
#   scripts/m109-session.sh <claude|codex|cursor|copilot|gemini|windsurf|antigravity>   new practice and data folders, first step
#   scripts/m109-session.sh watch <data> [block]     the practice guard (leave it running in its own tab)
#   scripts/m109-session.sh next <data>              the next step, as one message
#   scripts/m109-session.sh check <data>             what the guard and the folder show, judged per step
#   scripts/m109-session.sh record <data> <step> <pass|fail|skip> [what was seen]
#   scripts/m109-session.sh results <data> [folder]  writes the RESULTS file into docs/status (or the folder given)
#   scripts/m109-session.sh summary [folder]         all seven tools, and only the proven ones to claim
# Every folder is a throwaway practice folder (never a real project). No model is called by this script, nothing is sent
# anywhere, git is never run in a project. Delete both folders when done.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
t="$here/runner/scripts/m109-session.ts"
case "${1:-}" in
  watch|next|check|record|results|summary|template) exec bun "$t" "$@";;
  claude|codex|cursor|copilot|gemini|windsurf|antigravity) ;;
  *) echo "Usage: $0 claude|codex|cursor|copilot|gemini|windsurf|antigravity   or   $0 watch|next|check|record|results|summary ..."; exit 2;;
esac
tool=$1
dir=$(mktemp -d "${TMPDIR:-/tmp}/m109-practice-$tool-XXXX")
data=$(mktemp -d "${TMPDIR:-/tmp}/m109-data-XXXX")
bun "$t" setup "$tool" "$dir" "$data"
echo "Next: $0 next $data"
bun "$t" next "$data"
