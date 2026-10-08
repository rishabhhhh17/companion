#!/bin/bash
# Tells the app where Bun and the runner are, and makes a safe playground folder for tasks.
# Developer use only: shipped builds will carry their own runner.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HOME/Library/Application Support/dev.companion.app"
BUN="$(command -v bun)"
PLAY="$HOME/Developer/companion-playground"
mkdir -p "$DIR" "$PLAY"
printf '{"bun":"%s","runner":"%s","project":"%s"}\n' "$BUN" "$HERE/../runner/src/main.ts" "$PLAY" > "$DIR/dev.json"
echo "wrote $DIR/dev.json"; cat "$DIR/dev.json"
echo "playground folder: $PLAY (tasks run here, never in a real project)"
