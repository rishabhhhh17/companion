# Spike (a) results: INTERIM, 7 Oct 2026

**Status:** partly run. Everything that could be checked without your hands is done. The rest is in `TESTING.md` (about 45 minutes). This file is final only after that session.

## Headline

**The research's panel recipe (design A) fails on macOS 27.** A panel that is allowed to take the keyboard makes the whole app active when it's clicked, even though it's marked "non activating". That's the bug reported as tauri-nspanel issue 123, now reproduced on this Mac 4 times out of 4. Design B, where the docked character can never take the keyboard and typing happens in a separate card, is the plan B; it hasn't been clicked yet, so it's first in your session.

Everything else checked so far passes: quiet launch, no Dock icon, no permissions, docking inside the work area, staying on the active Space through every switch, and nothing typed ever written to the log.

## Environment

macOS 27.0.1 (26A434), MacBook Pro, Apple Silicon, built in Retina display only (no external monitor). Rust 1.99.0, tauri-cli 2.12.1. Crates (from `Cargo.lock`): tauri 2.12.1, tao 0.37.1, wry 0.57.0, tauri-nspanel 2.1.0, tauri-plugin-global-shortcut 2.4.0, objc2 0.6.5, objc2-app-kit 0.3.2. Release build, ad hoc signed.

## The M0 pass checks

| M0 check | Result | Evidence |
|---|---|---|
| Opening it doesn't interrupt you (no Dock icon, front app unchanged) | **Passed** (automated, both designs) | `launch-check.sh`: front app unchanged, macOS saw no activation, app type `UIElement`. Control run with Calculator correctly failed. Typing in Terminal during launch, and opening from Finder: your session, test 1 |
| Clicking the character 10 times never steals typing | **Failed for design A.** Design B not run yet | Event log, 4 of 4 clicks on a design A panel: the panel became key within 3 to 8 ms of the mouse down, before any request, with the app already active, then Panel Spike became the front app. Your session, test 2 |
| Typing in the panel, then Esc hands typing back | **Failed for design A** (clicking the text box activated the app). Design B and "design A by hotkey" not run yet | Event log, run `...-9018` at +70.8 s. Your session, test 3 |
| Visible over full screen apps | Not run | Your session, test 4 |
| Same place on every Space | **Passed so far** (6 of 6 Space switches during your own use, preset 0: level 3, all Spaces) | `space_sample` after every switch: visible, on the active Space, not key. Those apps were in maximized windows, not true full screen. Your session, test 5 |
| Display unplug redocks within 2 s | Not run (no external monitor) | Your session, test 6, if you can borrow one; otherwise stays "not run" |
| Stage Manager | Not run | Your session, test 5 |
| No permission prompt; not listed under any privacy section | **Passed so far** (no prompt appeared; the bundle has no usage descriptions or privacy entitlements) | `check-bundle.sh`. The System Settings lists: your session, test 7 |
| Release build behaves like dev | **Passed so far** (every run above was the release build opened like a user would) | |

## What else was checked

| Check | Result |
|---|---|
| tauri-nspanel 2.1.0 compiles with Tauri 2.12.1 (never tested together before) | Passed, first try, one copy of each objc2 library |
| Rust unit tests (launch settings, docking maths, display matching, preset table) | 7 of 7 pass |
| Analyzer tests (every check fails a bad log and passes a good one) | 27 of 27 pass |
| Lint: no focus stealing, activation or permission needing calls | Passes. Clippy refuses the dangerous calls by type (it caught a planted multi line `show()` and `set_focus()`), plus a text search over Rust, JS and config for permission APIs |
| All 6 hotkeys register (no permission) | Passed |
| Presets: level and Space behaviour read back exactly as set, no AppKit exception | Passed |
| Docked on the right edge inside the work area, below the menu bar | Passed |
| Nothing typed ever reaches the log | Passed (privacy check over every run) |

## Things we learned along the way

1. **Design A is out on macOS 27** (above). Whether design B survives clicks, and whether taking the keyboard by hotkey (no click) is safe, decide the recipe for M2.
2. **Wispr Flow keeps an invisible overlay** at the highest window level over the right 490 points of the screen, top to bottom. Our panel sits under it, and clicks still reached our panel (your clicks were logged), so the overlay lets clicks through. Worth remembering: other always on top tools may cover our edge.
3. **Computer use can't drive this test.** It refuses clicks on apps it can't grant, and Panel Spike (never installed) can't be granted. A click control did prove its clicks travel the real path (clicking Calculator behind TextEdit brought Calculator forward), but the panel clicks have to be yours.
4. **wry asks macOS to activate the app every time it builds a page** (`NSApplication::activate()` in wry 0.57), which the research didn't know about. On macOS 27 the request wasn't granted in any of 6 launches: the app stayed inactive right after each page was built (logged as `webview_built`). Worth watching in M2.
5. **The witness needed tightening.** When someone uses the Mac during a test, "the front app changed" is not the panel's fault. The checks now fail only when Panel Spike itself takes the front.

## Independent review before your session

Two reviewers checked the spike's code and its checks, and found 20 problems. All are fixed. The ones that mattered most:

- **The checks were too lenient about activation.** They waited for macOS's "became active" notification, which arrived up to 1.7 s late. Now any sign of Panel Spike being active counts, so design A's failure is caught at the moment of the click.
- **Esc could look like it worked when it didn't.** The release now checks the app's real key window, not just the panel's own flag, and fails if Panel Spike is still active.
- **Small traps removed:** no app menu (so Cmd+Q or Ctrl+Cmd+F can't act on the panel), Esc works anywhere in the panel, every click on the panel is matched to a page event, moving the macOS Dock now redocks the panel, and iCloud's file tags no longer break the signature check.

## Analyzer output

The full `analyze.py --run all` output is pasted here after your session.

## [verify] items settled so far

- tauri-nspanel 2.1 builds and runs on Tauri 2.12.1 and macOS 27: **yes**.
- tauri-nspanel issue 123 on macOS 27: **reproduced** for a key capable panel. Plan B under test.
- `activate_ignoring_other_apps(false)`, Accessory policy between `build()` and `run()`, and `LSUIElement`: no Dock icon and no activation at launch: **confirmed**.
- Global hotkeys need no permission: **confirmed** (6 registered, no prompt).
- Floating level 3 with "all Spaces" stays on the active Space through Space switches: **yes, in normal windows**. Over true full screen: your session.
