# T11. Read text through Accessibility, write back by paste

- **Status:** Accepted from research; open items checked in M0 spike (d). Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 11; section 13 (also sections 18, 19 and 20); M0-desk-research-details.md section (d)
- **Related:** F07, F11, T01, T10

## Decision
For Prompt help, Rust reads the focused field through the macOS Accessibility API (UI Automation on Windows) and falls back to a synthetic copy. It **always writes back by pasting**, with our item marked transient. It saves and restores the user's clipboard only when macOS allows the read without an alert.

## Why
- Pasting is what every shipping insertion tool does (Wispr Flow, Superwhisper, OpenWhispr; vendor docs) (section 13).
- Chromium handles a value write on `contenteditable` by setting `innerText`, which bypasses editor input events, so rich editors are likely to lose sync (inference; verify per app).
- The Accessibility read touches no clipboard. The only Mac permission is Accessibility, and the Carbon hotkey needs none, as long as the copy fallback is native: an AppleScript copy adds an Automation prompt.

## Alternatives considered
- Setting the field's value directly (`AXValue`): leaves rich editors stale (pitfall 29).
- Global listeners like `rdev`: need Input Monitoring and break under secure input.
- Sending keys to terminals: Ctrl+C interrupts a running task and Esc Esc can open the rewind menu (pitfall 33).
- The `get-selected-text` crate: dormant, selection only, AppleScript fallback; a reference only.

## What this means for the build
The read order, Electron and Chromium triggers, crates and pasteboard steps are in technical_research.md section 13. Rules a coding agent must never miss:
- The panel never becomes key in this flow. Accept is a click or a hotkey held only while the card is visible; Esc is released the moment the card closes (pitfall 31).
- Refuse secure fields (`AXSecureTextField`), secure keyboard input and denylisted apps such as password managers.
- Light the "reading your text" indicator on every read, ask per app the first time, and log no content. Keep the original for one click Restore.
- Before pasting, confirm the same process and focused element are still in front; if not, copy and say so.
- Check `NSPasteboard.accessBehavior` first. Save and restore the clipboard only if reading would not prompt; otherwise paste and tell the user the clipboard now holds the improved prompt. Mark our item transient and current host only, so Universal Clipboard does not send it to other devices.
- The copy fallback is native (CGEvents or the app's Edit > Copy menu), never AppleScript. Avoid `enigo` 0.6.1, which crashes off the main thread in Tauri apps.
- Terminals: the user selects the prompt first, and the answer is "copied; press Cmd+V".
- Spike (d) passes when read and replace works in Claude desktop, ChatGPT, claude.ai in Chrome and Safari, Cursor chat and Lovable; the terminal flow copies; send button state and Cmd+Z behave; and we record which apps need `AXManualAccessibility` (section 18).

## Open [verify] items
- **[verify]** pasteboard privacy prompt enforcement on macOS 26 and 27 (section 20, question 13). Apple removed the preview switch in the macOS 27.2 betas without saying why, so default enforcement may be close. Keep the test Mac off 27.2 until spike (d) runs.
- Rich editors ignoring value writes is an inference to verify per app.
- Is a pasted improved prompt followed as well as a typed one in Claude Code (section 20, question 12)? Spike (d), or M5 if the founder picks the trimmed or lean M0 plan.
- **[verify]** whether web fields in Chrome (claude.ai, Lovable) are readable on the first press.
- **[verify]** whether Chromium password inputs report the `AXSecureTextField` subrole.
- Read the source of `win-text-inject` (0.1.1, 3 stars) before depending on it.

## Revisit if
macOS enforces the pasteboard privacy prompt on our save and restore, or a pasted prompt is followed worse than a typed one in Claude Code. Either way, keep preferring the Accessibility read so the clipboard is untouched whenever possible (section 13).
