# T01. Desktop shell: Tauri 2.12 with natively created non activating panels

- **Status:** Accepted. **Changed 7 Oct 2026** after spikes (a), (a2) and (a3) proved the research recipe wrong on macOS 27; the founder approved the new panel construction. (The file name keeps `tauri-nspanel` so links don't break.)
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 1; section 4 (also section 1 prototype lesson five, section 19 pitfalls 16, 18 and 19, section 20 questions 4 and 5); M0-desk-research-details.md section (a)
- **Related:** F01, F02, F04, F11, T04, T11, T12

## Decision
The desktop shell is Tauri 2.12 with a React UI. On macOS, our own Rust code creates each panel as an `NSPanel` (a floating window that does not take keyboard focus when clicked) with the non activating flag set **when the panel is created**, then moves Tauri's web view into it. The docked character is a panel that can never take the keyboard; typing happens in a separate card panel. We do not use `tauri-nspanel`. A small `windows-rs` layer comes later for Windows.

## Why
- One UI codebase for Mac and Windows, small RAM use, friendly to a solo founder (section 1, row 1).
- On macOS 27, only a panel created non activating from the start keeps the user's typing when clicked. tauri-nspanel converts a window after creation, and that panel brought the app to the front on every click, even when it could never take the keyboard (spike a, both designs). A natively created panel stayed quiet with or without a web view (spike a2), and with Tauri's own page inside, for the character, the hotkey, type and Esc route, and clicks inside the card (spike a3). Sources: `spikes/a-panel/RESULTS.md`, technical_research.md section 4.
- Never stealing keyboard focus is a fixed founder decision (F11).

## Alternatives considered
- Electron: the escape hatch, not the plan (section 1, row 1).
- Native Swift: doubles the work once Windows arrives.
- (7 Oct 2026) Keep tauri-nspanel and hand focus back to the previous app after each click: a visible flicker, briefly breaks F11, and macOS 26 may block it.
- (7 Oct 2026) Native character, web view only in the card, or everything native: not needed, since the web view was proven not to be the cause (spike a2).
- (7 Oct 2026) Hotkey only, character not clickable (how Clicky avoids the problem): works, but loses the clickable character.

## What this means for the build
The full panel recipe is in technical_research.md section 4. Rules a coding agent must never miss:
- Pin Tauri 2.12.1, call `Builder::activate_ignoring_other_apps(false)` (its default is true), and run as an accessory app with no Dock icon.
- Create the panel with `NSPanel initWithContentRect:styleMask:backing:defer:` and the `NonactivatingPanel` flag in that call. Never convert an existing window and add the flag afterwards: on macOS 27 that panel activates the app on click. Character: `Borderless | NonactivatingPanel`. Card: `Titled | NonactivatingPanel | FullSizeContentView`, title bar hidden. Level 3 for floating.
- Build the Tauri window hidden and unfocused with `accept_first_mouse(true)`, move its content view into the panel, and never show the Tauri window. Position the panel with `setFrame:display:`, not Tauri's `set_position`.
- Show with `orderFrontRegardless`, hide with `orderOut`. Never `window.show()`, `set_focus()`, `maximize()` or `fullscreen()`. The card takes the keyboard with `makeKeyWindow` only on the user's hotkey or click into it, never during Prompt help, and Esc hides it.
- Size windows tightly: a transparent webview drew about 620 mW of GPU against 75 mW opaque (pitfall 18).
- Store dock position as display UUID, edge and offset percent inside `Monitor::work_area()`; redock when screens change.
- Spawning lives in Rust. The webview gets a strict CSP and only named Rust commands (pitfall 16).

## Open [verify] items
Re-checked on the new construction in M2 (spike a's second session items move there), on macOS 27 unless noted.
- **Settled 7 Oct 2026:** tauri-nspanel issue 123 reproduced (spike a); a never key dock did not avoid it; natively created panels did (spikes a2, a3).
- **[verify] in M2:** while the card holds the keyboard, the app privately reports itself as active (`NSApp.isActive` true) although the front app never changes. Check it has no side effects.
- **[verify] in M2:** clicking the card while it is visible but not key (after the user switched to another app); in spike (a) that click activated the app.
- **[verify]** the lowest window level that shows over full screen Spaces; Apple DTS and shipping apps disagree.
- **[verify]** whether `canJoinAllApplications` is needed, with Stage Manager on and off (macOS 15 and 27).
- **[verify]** the panel stays put after a full screen app exits (tauri-nspanel issue 76), and a release build launched from Finder behaves like dev (tauri issue 5566).
- **[verify]** IPC, events and `backgroundThrottling` keep working after the web view moves into our panel, across sleep, display changes and long sessions.
- **[verify]** `backgroundThrottling: "disabled"` keeps animations and events running in a panel that is visible but never key.
- **[verify]** the first click on the idle panel reaches the webview with `acceptFirstMouse: true`, without making it key.
- **[verify]** presentation mode heuristics (microphone, camera, call app in front, full screen window) and their permission behaviour (section 20, question 5). Read only window owner PID and bounds, never names. **M11 (16 Oct 2026):** built the call app part (the front app's bundle id against a fixed list of native call apps, `presentation.rs`; the front app id was already read without a prompt elsewhere) and the "hide from screen sharing" setting (sharingType none on the overlay and the card, best effort, on by default). The camera part (AVFoundation `isInUseByAnotherApplication`) is written but switched off (`CAMERA_CHECK_ON = false`) until a real Mac shows that asking it never brings up a camera prompt; the full screen heuristic is not built. **M14 (22 Oct 2026):** the microphone part is written and switched off the same way (`MIC_CHECK_ON = false`). It reads Core Audio's list of the apps that use sound (`kAudioHardwarePropertyProcessObjectList`, each process's `kAudioProcessPropertyPID` and `kAudioProcessPropertyIsRunningInput`, macOS 14.2 and later) instead of the research's per device `kAudioDevicePropertyDeviceIsRunningSomewhere`, because only the per app list can leave out Companion's own hold to talk. To check on the founder's Mac before it is turned on: no microphone prompt, and no app of macOS's own (Siri, Voice Control, Dictation) shows as listening all day.
- **[verify]** with "Hide from screen sharing" on, Show me's own picture still leaves out the card and the overlay (our exclusion list is built from `SCShareableContent`, which may or may not list a sharingType none window; technical research "Presentation mode"). Quiet during calls looks only at the app in front, so during a Zoom screen share, where the shared app is in front, it stays off until the camera or microphone check is verified and on.
- **[verify]** Windows, later: `SHQueryUserNotificationState` for presentation mode, and an OV certificate at roughly $100 to $400 a year.

## Settled by desk research (7 Oct 2026)
- tauri-nspanel v2.1 API names match the old recipe (no longer used).
- `Monitor::work_area()` excludes the Dock and menu bar.
- The global shortcut plugin uses Carbon and needs no permission; include Cmd or Ctrl in every hotkey.
- Launch at login: `SMAppService.mainApp`, or the autostart plugin in LaunchAgent mode, never AppleScript mode.
- Tauri 2.12.1 transparency no longer needs `macOSPrivateApi` (F02).

## Revisit if
The natively created panel fails in M2: it does not show over full screen Safari and Terminal, a click brings the app forward, or it does not survive a Space switch and a monitor unplug. Then: native character with the web view only in the card, then Electron (section 1, row 1).


## Amendment (27 Oct 2026, M16, following the founder's F11 amendment)
Still an accessory app with no Dock icon, except while a window the person opened is in front: then the activation policy may be Regular so the app menu shows, and it returns to Accessory when that window closes or loses the front. To be proven in a spike on a real Mac before code depends on it (rule 18): the policy switch does not take focus from another app, the menu appears, and the Dock icon behaviour is what the founder accepted.
