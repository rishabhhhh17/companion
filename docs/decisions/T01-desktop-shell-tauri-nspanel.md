# T01. Desktop shell: Tauri 2.12 with non activating panels

- **Status:** Accepted from research; open items checked in M0 spike (a). Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 1; section 4 (also section 1 prototype lesson five, section 19 pitfalls 16, 18 and 19, section 20 questions 4 and 5); M0-desk-research-details.md section (a)
- **Related:** F01, F02, F04, F11, T04, T11, T12

## Decision
The desktop shell is Tauri 2.12 with a React UI. On macOS each window becomes a non activating `NSPanel` (a floating window that does not take keyboard focus when clicked) through `tauri-nspanel` v2.1. A small `windows-rs` layer comes later for Windows.

## Why
- One UI codebase for Mac and Windows, small RAM use, friendly to a solo founder (section 1, row 1).
- tauri-nspanel reaches the panel behaviour we need: float over full screen apps, join every Space, never take keyboard focus (section 4).
- Never stealing keyboard focus is a fixed founder decision (F11).

## Alternatives considered
- Electron: the escape hatch, not the plan (section 1, row 1).
- Native Swift: doubles the work once Windows arrives.

## What this means for the build
The full panel recipe is in technical_research.md section 4. Rules a coding agent must never miss:
- Pin Tauri 2.12.1, call `Builder::activate_ignoring_other_apps(false)` (its default is true), and run as an accessory app with no Dock icon.
- Add `nonactivating_panel` with `add_style_mask`, never `set_style_mask`. Pass level 3 for floating; the crate's `PanelLevel::Floating` is 4.
- Show and hide only with `panel.show()` and `panel.hide()`. Never `window.show()`, `set_focus()`, `maximize()` or `fullscreen()` on a panel. `make_key_window()` only when the user clicks into a card's text field, never during Prompt help.
- Size windows tightly: a transparent webview drew about 620 mW of GPU against 75 mW opaque (pitfall 18).
- Store dock position as display UUID, edge and offset percent inside `Monitor::work_area()`; redock when screens change.
- Spawning lives in Rust. The webview gets a strict CSP and only named Rust commands (pitfall 16).

## Open [verify] items
Checked in spike (a) on macOS 27 unless noted.
- **[verify]** tauri-nspanel issue 123: clicking a panel made key may activate the app. Plan B: the dock never becomes key; typing moves to a separate card window.
- **[verify]** the lowest window level that shows over full screen Spaces; Apple DTS and shipping apps disagree.
- **[verify]** whether `canJoinAllApplications` is needed, with Stage Manager on and off (macOS 15 and 27).
- **[verify]** the panel stays put after a full screen app exits (tauri-nspanel issue 76), and a release build launched from Finder behaves like dev (tauri issue 5566).
- **[verify]** Tauri's `set_position` and `set_size` still work on the panel after `to_panel()`.
- **[verify]** `backgroundThrottling: "disabled"` keeps animations and events running in a panel that is visible but never key.
- **[verify]** the first click on the idle panel reaches the webview with `acceptFirstMouse: true`, without making it key.
- **[verify]** presentation mode heuristics (microphone, camera, call app in front, full screen window) and their permission behaviour (section 20, question 5). Read only window owner PID and bounds, never names.
- **[verify]** Windows, later: `SHQueryUserNotificationState` for presentation mode, and an OV certificate at roughly $100 to $400 a year.

## Settled by desk research (7 Oct 2026)
- tauri-nspanel v2.1 API names match the recipe in section 4.
- `Monitor::work_area()` excludes the Dock and menu bar.
- The global shortcut plugin uses Carbon and needs no permission; include Cmd or Ctrl in every hotkey.
- Launch at login: `SMAppService.mainApp`, or the autostart plugin in LaunchAgent mode, never AppleScript mode.
- Tauri 2.12.1 transparency no longer needs `macOSPrivateApi` (F02).

## Revisit if
Spike (a) fails: the panel does not show over a full screen Safari and Terminal, becomes key while idle (typing in Terminal must continue while clicking the character), or does not survive a Space switch and a monitor unplug. Electron is the named escape hatch (section 1, row 1).
