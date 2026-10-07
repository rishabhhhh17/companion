# Spike (a): a panel that never steals your typing

Throwaway code for M0 spike (a) (`docs/milestones/M0-spikes.md`). What we keep is `RESULTS.md`.

**Question:** can a Tauri window sit on the screen edge as a non activating panel, show over full screen apps and on every Space, and never take the keyboard from the app you're typing in, on macOS 27?

## Build and run

```bash
cd spikes/a-panel
./scripts/build-release.sh                      # builds Panel Spike.app, then checks the bundle
./scripts/stop.sh                               # always stop before relaunching (open on a running app activates it)
open --env PANEL_MODE=a --env PANEL_AFM=1 "src-tauri/target/release/bundle/macos/Panel Spike.app"
```

For a Finder launch (no environment), write the settings first: `./scripts/set-launch.sh a 1 0` (mode, acceptFirstMouse, preset).

| Setting | Values | Meaning |
|---|---|---|
| `PANEL_MODE` | `a` (default), `b` | A: the dock can take typing when you click its text box. B: the dock never takes typing; a separate card does |
| `PANEL_AFM` | `1` (default), `0` | acceptFirstMouse: whether the first click on the panel reaches the page |
| `PANEL_PRESET` | `0` to `8` | window level (floating 3, status 25, screen saver 1000) by Space behaviour (A, B, C) |
| `PANEL_REAPPLY_ON_SPACE` | `0` (default), `1` | plan B for tauri-nspanel issue 76: re-apply the preset on every Space change |

## Hotkeys (all Ctrl+Option+Cmd, none needs a permission)

| Key | Does |
|---|---|
| P | next preset |
| D | hide or show the dock |
| K | type: opens the card (mode B) or focuses the dock's text box (mode A) |
| R | start a new test segment and reset the click counter |
| M | move the dock to the next display |
| C | compact (56 by 56) or full size |

## Evidence

- Event log: `~/Library/Application Support/dev.companion.spike.panel/events.jsonl` (lengths only, never typed text).
- `python3 scripts/analyze.py [--run latest|all] [--expect-clicks 10]`: pass or fail per check.
- `python3 -m unittest scripts/test_analyze.py`: the analyzer's own tests.
- `./scripts/launch-check.sh` and `./scripts/launch-check.sh control`: quiet launch, with a control that must fail.
- `./scripts/lint-forbidden.sh`: no focus stealing or permission needing calls in the code.
- `cd src-tauri && cargo test`: launch settings, docking maths, display matching, presets.
