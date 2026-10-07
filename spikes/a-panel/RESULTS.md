# Spike (a) results, with follow ups (a2) and (a3): 7 Oct 2026

**Status:** done for the question that mattered: can a panel on macOS 27 be clicked without taking the user's typing? **Yes, but only if we create the panel ourselves, non activating from the start.** The founder approved that construction for M2 (T01, technical doc section 4). The checks this spike did not run move to M2 and are re-run on the new construction.

## Headline

1. **The research's recipe (design A) fails on macOS 27.** Clicking the panel made Panel Spike the front app and took the keyboard: 4 of 4 clicks in the interim run, and 7 activations in the founder's session (design A, first click off).
2. **Plan B (design B) fails too.** The docked panel never took the keyboard, but a click still brought Panel Spike to the front (first click from Terminal), and clicking inside the typing card did the same. Only the keyboard route (hotkey, type, Esc) worked.
3. **The cause is how the panel is built, not the web view and not macOS 27 itself.** tauri-nspanel turns an ordinary window into a panel and adds the "don't activate" flag afterwards. A panel created with that flag from the start stayed quiet with no web view (spike a2, 13 clicks) and with a web view (25 clicks).
4. **The fix works with Tauri's own pages (spike a3).** Our own `NSPanel`, created non activating, holding Tauri's web view: 25 clicks on the character, the hotkey, type and Esc route, and two clicks inside the card all left the front app unchanged. The card clicks were recorded both by the page and by a native mouse monitor.

## Environment

macOS 27.0.1 (26A434), MacBook Pro, Apple Silicon, built in display only. Rust 1.99.0, Tauri 2.12.1 (wry 0.57.0, tao 0.37.1), tauri-nspanel 2.1.0 (spike a only), Swift 6.4 (spike a2). Release builds, ad hoc signed, opened like a user would.

## The click test, all designs

In the founder's session, the founder typed in Terminal or Claude while clicking. "Front app" is what macOS reports as frontmost, and the app's own log is cross checked with the founder's eyes and screenshots.

| Design | Clicks on the character | Typing card: hotkey, type, Esc | Click inside the card | Verdict |
|---|---|---|---|---|
| A: tauri-nspanel, key capable panel | App came to the front and took the keyboard (interim 4 of 4; session: 7 activations, typing went into the panel) | not run | not run | **Fail** |
| B: tauri-nspanel, never key dock plus card | App came to the front from the first click (14 clicks) | Pass | App came to the front | **Fail** |
| a2: native panel, no web view | 13 clicks, never active | n/a | n/a | Pass |
| a2: native panel, web view inside | 25 clicks, never active | n/a | n/a | Pass |
| **a3: native panel, Tauri page inside** | **25 clicks, never active** | **Pass** | **Pass (2 clicks, logged twice)** | **Pass** |

Logs: `~/Library/Application Support/dev.companion.spike.panel/events.jsonl` (spike a; `python3 scripts/analyze.py --run all`), `.../dev.companion.spike.native/events.jsonl` (a2), `.../dev.companion.spike.a3/events.jsonl` (a3). Session runs: spike a `1791388602328-29545` (B1 clicks), `1791388696963-29736` (A0 clicks), `1791388805367-29909` (B1 card); a3 `1791389647499-34274` onward. Pre-flight runs `1791387236059-23108` to `1791387287022-24543` are not evidence.

## The M0 pass checks

| M0 check | Result |
|---|---|
| Opening it doesn't interrupt you | **Passed** for every launch from Terminal across the three spikes, with a control that correctly failed. Finder double click: not run, moves to M2 |
| Clicking the character 10 times never steals typing | **Failed** on tauri-nspanel (both designs). **Passed** on the a3 construction |
| Typing in the panel, then Esc hands typing back | **Passed** by hotkey on design B and on a3. Clicking into the card: failed on B, **passed** on a3 |
| Visible over full screen apps | Not run, moves to M2 (on a3) |
| Same place on every Space | **Mostly** in normal windows: 12 of 13 samples visible at preset 0 (the interim report's "6 of 6" was wrong; one sample right after switching to Claude reported the panel covered). Re-run in M2 |
| Display unplug redocks within 2 s | Not run (no second display), moves to M2 |
| Stage Manager | Not run, moves to M2 |
| No permission prompt; not listed under any privacy section | No prompt appeared; the bundles have no usage descriptions or privacy entitlements. System Settings lists: not run, moves to M2 |
| Release build behaves like dev | Passed (every run was a release build) |

## To re-check in M2

- **The app privately counts itself as active while the card has the keyboard.** In spike a (design B) and in a3, `NSApp.isActive` reports true while the card is key, although the front app never changes and typing elsewhere is unaffected. Check it has no side effects (menus, focus rings, other apps).
- **Clicking the card when it is visible but not key** (after the user switched to another app). In spike a this activated the app; a3 only tested clicks while the card already had the keyboard.
- Everything marked "moves to M2" above, plus IPC, events and background throttling after the web view moves into our panel.
- The counter reset hotkey (Ctrl+Option+Cmd+R) never reached spike a in the founder's session; harmless there, but check hotkey delivery in M2.

## Things we learned along the way

1. **wry asks macOS to activate the app every time it builds a page.** On macOS 27 the request was not granted in any launch. Worth watching.
2. **Wispr Flow keeps an invisible, click through overlay** at the highest level over the right 490 points of the screen. Clicks still reached our panel.
3. **Computer use can't drive this test** (it can't be granted access to an app that isn't installed), so the clicks were the founder's.
4. **Clicky avoids the problem** by making its overlay ignore clicks entirely, so it offers no technique for a clickable character.
5. **Reading the chat between steps moves the keyboard.** Steps that test typing must be done in one go before switching apps.

## Research (7 Oct 2026)

- tauri-nspanel issue 123, "In macOS 27 the panel focuses like a window" (opened 15 Sept 2026): open, no replies or fix. https://github.com/ahkohd/tauri-nspanel/issues/123
- tauri-nspanel converts after creation (`setStyleMask` in `lib.rs`). FunWithPanels notes that a converted window can still activate its app. https://github.com/mitchchn/FunWithPanels
- macOS 26 tightened app activation (Apple forum thread 807805). https://developer.apple.com/forums/thread/807805
- Clicky: native panels, non activating at creation, overlays ignore mouse events. https://github.com/farzaa/clicky
- No public reports from Raycast, Alfred, Wispr Flow and similar apps about clicks on macOS 27.

## [verify] items settled

- tauri-nspanel 2.1 builds and runs on Tauri 2.12.1 and macOS 27: yes, but its panels activate the app on click on macOS 27. **Dropped.**
- `activate_ignoring_other_apps(false)`, Accessory policy between `build()` and `run()`, and `LSUIElement`: no Dock icon and no activation at launch: confirmed.
- Global hotkeys need no permission: confirmed.
- A natively created non activating panel holding Tauri's web view keeps the user's typing on click: confirmed (spike a3).
