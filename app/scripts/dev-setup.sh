#!/bin/bash
# Tells the app where Bun and the runner are, and makes a safe playground folder for tasks.
# Developer use only: shipped builds will carry their own runner.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HOME/Library/Application Support/dev.companion.app"
BUN="$(command -v bun)"
PLAY="$HOME/Developer/companion-playground"
mkdir -p "$DIR" "$PLAY"
if [ "${1:-}" = "--plan" ]; then
  # Use the separate test sign in (never a key) and a cheaper model, for trying real tasks.
  ENVJ=',"env":{"COMPANION_ROUTE":"plan","COMPANION_MODEL":"claude-haiku-4-5-20251001","CLAUDE_CONFIG_DIR":"'"$HOME"'/Library/Application Support/Companion-test-claude"}'
else
  ENVJ=''
fi
printf '{"bun":"%s","runner":"%s","project":"%s"%s}\n' "$BUN" "$HERE/../runner/src/main.ts" "$PLAY" "$ENVJ" > "$DIR/dev.json"
echo "wrote $DIR/dev.json"; cat "$DIR/dev.json"
echo "playground folder: $PLAY (tasks run here, never in a real project)"
