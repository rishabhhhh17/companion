#!/bin/bash
# Write launch.json, used when Panel Spike is opened from Finder (no environment).
# Usage: set-launch.sh MODE(a|b) AFM(1|0) PRESET(0-8)
set -eu
DIR="$HOME/Library/Application Support/dev.companion.spike.panel"
mkdir -p "$DIR"
MODE="${1:-a}"; AFM="${2:-1}"; PRESET="${3:-0}"
[ "$AFM" = "1" ] && AFMJ=true || AFMJ=false
printf '{"mode":"%s","afm":%s,"preset":%s}\n' "$MODE" "$AFMJ" "$PRESET" > "$DIR/launch.json"
echo "launch.json: $(cat "$DIR/launch.json")"
