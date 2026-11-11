#!/bin/sh
# Runs every suite that exists today. Stops at the first failure. Run before every merge.
# Each Bun test run gives every test 30 seconds (must fix 5): Bun's own 5 s is too short on a busy Mac, and Bun ignores a
# timeout set in bunfig.toml, so the flag is the only way.
set -e
cd "$(dirname "$0")/.."
sh scripts/tested-mark.sh clear   # a run that fails leaves no note that this commit was tested (must fix 6)
echo "== runner"; (cd runner && bun run typecheck && bun test --timeout 30000)
echo "== usage proxy (managed usage, switched off: tokens, plans, limits, metering, no body kept)"; (cd usage-proxy && bun run typecheck && bun test --timeout 30000)
echo "== rescue projects (does the hero find the real failing line?)"; (cd evals/rescue-projects && bun test --timeout 30000)
echo "== prompt help eval, free (the scorer and its 30 cases; no model, no network)"; (cd evals/prompt-help && bun test --timeout 30000)
echo "== eval sets, dry (the whole pipeline on stand ins: no model, no cost, no network)"; (cd evals && ../runner/node_modules/.bin/tsc -p . && bun test --timeout 30000 ./lib ./fix-projects ./loop-breaker ./review-catch ./explain ./show-me-how ./second-look)
echo "== rust shell"; (cd app/src-tauri && cargo test)
echo "== permissions (rule 8: nothing asks at launch, each ask only where its feature is first used)"; sh app/scripts/lint-permissions.sh
echo "== pages"; (cd app && bun run typecheck && bun test --timeout 30000 ./src)
echo "== pages, rendered and clicked through (happy-dom and Testing Library, each file in its own fresh page)"; (cd app && bun test --timeout 30000 --isolate --preload ./dom/setup.ts ./dom)
echo "== the rules of hooks (React's hooks lint, as errors)"; (cd app && bun run scripts/lint-hooks.ts)
echo "== release scripts (offline: parse, dry run, refuse without credentials)"; (cd app && bun test --timeout 30000 ./scripts)
echo "== acknowledgements (licence notices match the dependencies)"; python3 scripts/make-acknowledgements.py --check
sh scripts/tested-mark.sh write
echo "All suites passed. Real Claude checks are separate: cd runner && bun run scripts/real-verify.ts"
