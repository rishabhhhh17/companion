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

## Settled in spike (d), 8 Oct 2026 (`spikes/d-paste/RESULTS.md`)
- Read and replace worked first try in TextEdit, Claude desktop, claude.ai in Dia and Dia's address bar (reads 3 to 31 ms, pastes 107 to 161 ms); a password field was refused with nothing logged. Only Accessibility was asked.
- **Rules added by the spike:** select all through Accessibility (`AXSelectedTextRange`), not by sending Cmd+A, and send paste keys from a private event source so held modifier keys never merge with ours. Hold Esc only while our own card is visible, and time out after a few seconds.
- **Indicator rules added by the spike:** let the indicator draw (about 0.15 s) before touching the other app; set the panel level last, because turning on the floating flag resets it to 3. With both, the banner was seen over Dia at level 25. Over a true full screen app: still to check in M2 (T01 [verify]).
- Per app checks for Chrome, Safari, ChatGPT, Cursor, Lovable, Cmd+Z, Send and Enter, a clipboard image, switching apps, Terminal and the clipboard alert move to M5.

## Settled in M5b, 9 Oct 2026 (TextEdit, on the founder's Mac, with a free stand in for Claude)
- The whole loop works: hotkey, light first, Accessibility read, consent per app, diff card, paste back, restore. Reads took about 0.2 s. Only Accessibility was asked.
- **Pasting by sending Cmd+V did not land** from inside the app, although the spike's did. Pressing the app's own **Edit > Paste** menu item through Accessibility did land, so that is now the first method and Cmd+V the fallback. The menu route only works for apps with an English Edit menu, so other languages and apps without that menu still need checking.
- **Clicking our card makes it the active window** (it can take the keyboard), so a paste would go to our own card. Before pasting we hand the keyboard back to the app the text came from, and if that fails we copy instead.
- **Hotkey handlers must not change hotkeys themselves.** Registering or unregistering a shortcut inside a shortcut handler froze the shortcut plugin. The work now runs on its own thread.
- **Dev builds must be signed with a stable certificate** (the developer's own Apple Development one), or macOS forgets the Accessibility permission on every rebuild. The build script does this and refuses to sign anything if Anthropic's Claude binary is inside the bundle.
- The clipboard is not read or restored yet; after a paste it holds our text, and the card says so. Checking the clipboard alert is still open.

## Changed 16 Oct 2026 (built and unit tested, not yet tried on a Mac)
- The clipboard rule above is now wired to the Mac: before a paste, Companion asks `NSPasteboard.accessBehavior` (asking reads nothing). Only "always allow" (the person's own choice in System Settings), or a macOS older than 15.4 (no such setting and no alert), lets it save the person's clipboard and put it back. "Default" and "ask" both mean macOS would ask, so on macOS 15.4 and later with the usual setting the clipboard is still not read, and the card still says it holds the text.
- It is put back only after a paste that landed, or when nothing was pasted because the person moved on, and only if nothing else wrote to the clipboard since (change count). After a copy instead of a paste, or a paste that could not be confirmed, the text stays on the clipboard so the person can press Cmd+V.
- "Landed" now needs the box to change as well as to hold the text: putting the original back into a box whose improved text starts with the same words used to count as landed at once, which would have given the clipboard back before the app had pasted.
- The rules are pure functions in `prompthelp.rs` (`access_behavior`, `restore_after`, `paste_seen`, `paste_words`) with tests; `ax.rs` only reads the setting and moves the items.
- A clipboard marked private or short lived (the nspasteboard.org Concealed, Transient and AutoGenerated markers, and the older markers some password managers write) is never saved or put back: only the type names are read first (`may_save`, `clipboard_plan_with`), and no data is read when one matches. Putting it back would have moved the change count, so a password manager that clears a copied password after a while would never have cleared it.
- Putting the original back after only a selection was read replaces only where the improved text went (`paste_target`): where the selection started, read again just before the improved text was pasted, and only if the box still holds exactly the improved text there. Before this, it selected the whole box, so everything outside the old selection was deleted. If the place cannot be found or selected, the box is left alone and the original is only copied.

## Added 16 Oct 2026: the error explainer reads a selection the same way (M11, built and unit tested, not tried on a Mac)
- Control, Option, Command and E reads only the text selected in the focused element of the app in front (`ax::read_selection`, the same wake up steps as Prompt help), never the whole box and never the clipboard. The light comes first, Accessibility is the only permission, and password boxes, secure typing and never-read apps are refused before anything is read.
- One answer per app covers both features: the explainer asks with its own words ("Allow Companion to read what you select in Terminal? The same answer covers Prompt help there.") and keeps the answer in Prompt help's existing file, so no new file is stored.
- The text lives only in memory, goes to the engine over its own pipe and is never logged (the log line holds its length only). The engine hides secrets in it with `redact` before using it for anything; the fast lane that explains it saves no conversation.
- **[verify] on a real Mac:** that a selection is readable this way in Terminal, iTerm2, Warp, Chrome's and Safari's developer console, Cursor's terminal and a builder's chat (Lovable, Bolt). A console selection may sit outside the focused element; if so the card says it could not read a selection.

## Open [verify] items
- **[verify]** pasteboard privacy prompt enforcement on macOS 26 and 27 (section 20, question 13). Apple removed the preview switch in the macOS 27.2 betas without saying why, so default enforcement may be close. Keep the test Mac off 27.2 until spike (d) runs.
- Rich editors ignoring value writes is an inference to verify per app.
- Is a pasted improved prompt followed as well as a typed one in Claude Code (section 20, question 12)? Spike (d), or M5 if the founder picks the trimmed or lean M0 plan.
- **[verify] in M5:** whether web fields in Chrome and Safari (claude.ai, Lovable) are readable on the first press (settled for Dia).
- **[verify] in M5:** password inputs in Chrome and Safari (settled for Dia: refused).
- Read the source of `win-text-inject` (0.1.1, 3 stars) before depending on it.

## Revisit if
macOS enforces the pasteboard privacy prompt on our save and restore, or a pasted prompt is followed worse than a typed one in Claude Code. Either way, keep preferring the Accessibility read so the clipboard is untouched whenever possible (section 13).
