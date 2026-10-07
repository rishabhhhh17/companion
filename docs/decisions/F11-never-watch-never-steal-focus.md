# F11. Never watch passively; never steal focus

- **Status:** Fixed. Founder decision; do not reopen without the founder. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 11
- **Related:** F04, F05, F07, T01, T07, T11, T12, T13, T15

## Decision
Companion never passively watches the screen or tracks activity. It sees only what the user gives it, when they ask. It never steals keyboard focus.

## Why
- Watching failed before. Windows Recall was delayed a year and relaunched opt in; Rewind's capture was shut down after Meta bought it (product_research.md section 14).
- HeyClicky removed its proactive agents and "all the local activity tracking" within weeks (product_research.md section 7).
- Grammarly was called a "keylogger" and Wispr Flow drew concern for reading keystrokes (both secondhand; product_research.md section 5).
- Trust backlash is a medium likelihood, high impact risk; "never watches" is part of the pitch (product_research.md section 19).
- Clippy's lesson: never interrupt typing, never steal keyboard focus (product_research.md section 4, manners 3).

## What this means for the build
- The screen, other apps' text and the microphone are touched only on a user hotkey, after a visible indicator lights. One press means one capture, never written to disk by Companion (product_research.md section 10; technical_research.md section 17). Whether Claude Code itself keeps received images in a temp image store is **[verify]** in M0 spike (e). If it does, the founder picks the fix before Show me how is built; the options, and which of them keep this promise, are in T12 (technical_research.md section 3). Proof screenshots of the app being built, taken in a headless browser, are stored with receipts; they are never of the user's screen (T07).
- Each permission is asked the first time its feature is used, never at install. Nothing ever asks for Input Monitoring (technical_research.md sections 4, 17).
- Hotkeys use Carbon `RegisterEventHotKey`, which needs no permission, not global listeners like `rdev` (technical_research.md section 13).
- Take the wheel watches only the frontmost app and file changes in the project, never keystrokes (product_research.md section 10).
- Presentation mode reads only whether a call app is in front and whether the camera or microphone is in use, never content, and can be turned off (product_research.md section 10).
- Loop Closer and Pattern Catcher read only Companion's own task log, folders the user granted, and sources the user connected. Connected sources are read on the user's schedule or request, indexed on the device, and deleted on disconnect. Pull before push (product_research.md sections 7, 10; T15).
- Panels are non activating with no Dock icon and never become key while idle. M0 spike (a) proves typing in Terminal continues while clicking the character (technical_research.md sections 4, 18; T01).
- During Prompt help the panel never becomes key, so the paste lands in the user's field. Esc is registered only while the card is visible (technical_research.md section 13; T11).
- No keystroke logging and no training on user data. Analytics carry counts only, never prompts, screenshots or transcripts (product_research.md section 10; technical_research.md section 17).
- The later "show me once" recorder stays inside this rule: user started, visible indicator, stops itself (product_research.md section 7).

## What it rules out
- Section 11 row: passive screen watching, activity tracking, unasked proactive suggestions.
- Section 11 row: detecting take the wheel by reading keystrokes.
- Continuous capture, and hacks that edit the macOS approvals file (technical_research.md sections 1, 14).

## Revisit only if
The founder decides to.
