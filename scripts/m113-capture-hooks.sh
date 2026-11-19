#!/bin/sh
# M113 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md): what does each AI tool really hand its after edit hook?
# Makes a throwaway practice folder (never a real project), writes ONE capture hook into that folder's own hook file for the
# chosen tool, and tells you what to do. The capture hook copies each note into the practice folder's .capture/ and exits 0.
# Then `scripts/m113-capture-hooks.sh check <folder>` prints what the notch's live feed would show (never the edit's text).
# No model is called by this script, nothing is sent anywhere, git is never run. Delete the folder when done.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
if [ "${1:-}" = "check" ]; then exec bun "$here/runner/scripts/m113-feed-check.ts" "${2:?the practice folder}"; fi
tool=${1:-}
case "$tool" in claude|codex|cursor|copilot|gemini) ;; *) echo "Usage: $0 claude|codex|cursor|copilot|gemini   or   $0 check <folder>"; exit 2;; esac
dir=$(mktemp -d "${TMPDIR:-/tmp}/squibby-m113-$tool-XXXX")
mkdir -p "$dir/.capture"
printf 'hello\nworld\n' > "$dir/hello.txt"
cap="n=\$(date +%s%N 2>/dev/null || date +%s); cat > '$dir/.capture/'\$n.json; exit 0"
q=$(printf '%s' "$cap" | sed 's/\\/\\\\/g; s/"/\\"/g')
case "$tool" in
  claude)  mkdir -p "$dir/.claude";  f="$dir/.claude/settings.local.json"; printf '{ "hooks": { "PostToolUse": [ { "matcher": "Edit|Write|MultiEdit|NotebookEdit", "hooks": [ { "type": "command", "command": "%s", "timeout": 5 } ] } ] } }\n' "$q" > "$f"; how="cd $dir && claude   (then ask: change world to there in hello.txt, and add a new file notes.md)";;
  codex)   mkdir -p "$dir/.codex";   f="$dir/.codex/hooks.json"; printf '{ "hooks": { "PostToolUse": [ { "matcher": "apply_patch|Edit|Write", "hooks": [ { "type": "command", "command": "%s", "timeout": 5 } ] } ] } }\n' "$q" > "$f"; how="cd $dir && codex   (trust the hook with /hooks, then ask the same edit). If nothing is captured, change the matcher to \"*\" and try again, and note it.";;
  cursor)  mkdir -p "$dir/.cursor";  f="$dir/.cursor/hooks.json"; printf '{ "version": 1, "hooks": { "afterFileEdit": [ { "command": "%s", "timeout": 5 } ] } }\n' "$q" > "$f"; how="open $dir in Cursor and ask the Agent for the same edit";;
  copilot) mkdir -p "$dir/.github/hooks"; f="$dir/.github/hooks/companion.json"; printf '{ "version": 1, "hooks": { "PostToolUse": [ { "type": "command", "command": "%s", "timeoutSec": 5 } ] } }\n' "$q" > "$f"; how="open $dir in VS Code and ask the Copilot agent for the same edit";;
  gemini)  mkdir -p "$dir/.gemini";  f="$dir/.gemini/settings.json"; printf '{ "hooks": { "AfterTool": [ { "matcher": "write_file|replace", "hooks": [ { "name": "companion-feed", "type": "command", "command": "%s", "timeout": 5000 } ] } ] } }\n' "$q" > "$f"; how="cd $dir && gemini   (then ask the same edit)";;
esac
echo "Practice folder: $dir"
echo "Hook written to: $f"
echo "1. $how"
echo "2. Then run: $0 check $dir"
echo "3. Write down: the tool and its version, PASS or FAIL, and the keys it printed."
