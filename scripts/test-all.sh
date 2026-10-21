#!/bin/sh
# Runs every suite that exists today. Stops at the first failure. Run before every merge.
set -e
cd "$(dirname "$0")/.."
echo "== runner"; (cd runner && bun run typecheck && bun test)
echo "== usage proxy (managed usage, switched off: tokens, plans, limits, metering, no body kept)"; (cd usage-proxy && bun run typecheck && bun test)
echo "== rescue projects (does the hero find the real failing line?)"; (cd evals/rescue-projects && bun test)
echo "== prompt help eval, free (the scorer and its 30 cases; no model, no network)"; (cd evals/prompt-help && bun test)
echo "== eval sets, dry (the whole pipeline on stand ins: no model, no cost, no network)"; (cd evals && ../runner/node_modules/.bin/tsc -p . && bun test ./lib ./fix-projects ./loop-breaker ./review-catch ./explain ./show-me-how ./second-look)
echo "== rust shell"; (cd app/src-tauri && cargo test)
echo "== pages"; (cd app && bun run typecheck && bun test ./src)
echo "== release scripts (offline: parse, dry run, refuse without credentials)"; (cd app && bun test ./scripts)
echo "== acknowledgements (licence notices match the dependencies)"; python3 scripts/make-acknowledgements.py --check
echo "All suites passed. Real Claude checks are separate: cd runner && bun run scripts/real-verify.ts"
