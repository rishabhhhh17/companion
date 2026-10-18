# M11 wave 4 and 5: finish what does not need the key, then make it dependable (17 Oct 2026)

The founder said on 17 Oct 2026: keep doing everything that does not need the key, report only when something notable happens, and come back when it is all done; it must work as well as HeyClicky and be very dependable. General assistant features stay out of the launch (F18).

## Wave 4: the remaining HeyClicky parity work (part B of the wave 3 plan)
1. Keys: every Companion hotkey can be changed in Settings (chords only, nothing reads key events), with the "another app uses these keys" check, building on talkkeys.rs.
2. Voice: pick the Mac voice and its speed, choose the microphone with a fallback when it disappears, follow Bluetooth changes, show the words when the Mac is muted, and bias speech to text toward the project's own words (file and package names, on the Mac only).
3. Accessibility: VoiceOver labels, keyboard only use of every card and tab, reduced motion everywhere, contrast.
   Built and tested as text on m11/a11y (`app/src/a11y.test.ts`, `motion.test.ts`). Still open:
   - Text size is only partly done. The Mac's text size setting probably does not reach Home, because the pages run in WKWebView and every font size in `style.css` is set in px **[verify]**. So "Home stays usable with bigger text" is checked today only as "no fixed height cuts off words". To decide: a text size control in Settings (one scale for Home, the card and the island's words, with a safe default), or sizes the shell can scale. Not built yet.
   - Still needs a real Mac. None of these have been tried yet:
     - VoiceOver says each new question, loop card, pause, plan, finished task and error once, politely, on the live line, and the keyboard does not move.
     - VoiceOver reads each Settings row's group name, each tab with "something here needs you" when it waits, the character's name and state, and the island's one line.
     - The focus ring shows when moving with Tab and does not show after a mouse click (WKWebView's own `:focus-visible`).
     - Each "are you sure" step keeps Tab inside it, Esc closes it, and the keyboard goes back to the button that opened it.
     - Reduce motion turned on, then off, while Companion runs: the pages follow at once, and the character's next trip follows too.
     - Increase contrast: the muted words and lines turn darker, and nothing gets harder to read.
     - Larger text in System Settings: check whether Home changes at all. That settles the text size item above.
4. Small gaps: links open directly (web links only, after a check), a "what changed" card after an update, a bug report button (opens a prefilled report; the person attaches the exported log themselves), files dragged or pasted into the ask box (read on the Mac, secrets hidden, capped), a multi line ask box whose draft survives, copyable replies, search in What I did, and a zero cost warm up so the first reply is faster.
5. Which task broke it for Python projects, and tests that do not fail when the Mac is busy.

## Wave 5: dependability audit
Independent readers go through everything built in M11 (waves 1 to 4) by area and by risk (races, state that can get stuck, protocol drift between the runner, the shell and the pages, the AGENTS.md rules, request shapes, plain words), each finding checked by two skeptics, then fixed tests first and merged one by one with the full suite.

Nothing is launched, nothing makes a sound, no real Claude runs, no money is spent.
