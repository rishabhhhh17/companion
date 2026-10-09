#!/bin/sh
# Runs every suite that exists today. Stops at the first failure. Run before every merge.
set -e
cd "$(dirname "$0")/.."
echo "== runner"; (cd runner && bun test)
echo "== rust shell"; (cd app/src-tauri && cargo test)
echo "== pages"; (cd app && bun run typecheck && bun test)
echo "All suites passed. Real Claude checks are separate: cd runner && bun run scripts/real-verify.ts"
