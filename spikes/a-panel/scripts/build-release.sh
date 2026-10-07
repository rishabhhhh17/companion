#!/bin/bash
# Build the release .app (ad hoc signed, no Apple account), then check the bundle.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HOME/.cargo/env"
cd "$HERE/../src-tauri"
cargo tauri build --bundles app
"$HERE/check-bundle.sh"
