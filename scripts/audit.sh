#!/bin/sh
# Known security problems in what Squibby is built from. Run before every release (the advisory lists change every
# day, so this is not part of test-all.sh: a new advisory must not block an unrelated merge).
#   cargo install cargo-audit --locked   (once)
set -e
cd "$(dirname "$0")/.."
echo "== Rust"; (cd app/src-tauri && cargo audit)
echo "== runner"; (cd runner && bun audit)
echo "== pages"; (cd app && bun audit)
echo "No known problems. (Warnings about unmaintained build tools or Linux-only code are not shipped code.)"
