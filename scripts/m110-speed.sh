#!/bin/sh
# M110 (docs/milestones/M110-daily-feel.md): measures the 7 speed budgets on this Mac and fails if any is over.
# No model calls, no money spent.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
(cd "$here/app" && bun --bun vite build >/dev/null 2>&1)
cd "$here/runner"
exec bun scripts/m110-speed.ts
