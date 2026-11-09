# M76: features, batch two

Status: plan written 6 Nov 2026 on m48/launch (HEAD b8a6a33), then built in the same change. Not committed. The build status of each part is at the end, with what still needs a real Mac.

Sources: the founder, 6 Nov 2026 ("Build all the features... make sure this product actually works... very good and very fluid... unique"); the 6 Nov review's feature list (section 3, ranks 4, 5 and 9); the 4 Nov roadmap (features 16 and 18, milestone M62); M75's status (the gap in Delete everything).

## Rules this milestone keeps

- AGENTS.md rules never bend. Rule 5: the other app's text box is touched only on the person's press, with the light on first, never in the background, never stored. Rule 8: Accessibility is asked the first time Show me where to paste is pressed, never before. Rule 9: nothing takes the keyboard. Rule 13: nothing is sent anywhere; the report is saved only where the person picks, after a tap. Rule 14: the report never says "safe" over a red or unchecked line. Rule 15: no secrets and no file contents in the report beyond short redacted lines (off unless chosen). Rule 22: a solid ring only on a target confirmed from the app's accessibility structure; otherwise a dashed hint and words, or words only.
- Squibby never types or pastes into the other app. The person pastes.
- Strings only in strings.ts, colours only in tokens.css, the M71 parts and look, the M66 and M73 motion tokens. Plain words, no em dashes.
- New settings in the four registry files with safe defaults. No protocol change is needed for these three (each is built from what the page already holds, and the shell's own `app.showme` stages); if one turns out to be needed, it comes with fixtures both sides read.
- Tests first for the risky logic (rule 17), stand in model and temporary fixture folders only, never a real project or its git, never a real model.

## 0. Close M75's gap: Delete everything and leaving a project remove the done signal hooks

M75 left a hook in `.claude/settings.local.json` and `.codex/hooks.json` after Delete everything. Now:
- `wipe.rs remove_done_hooks(project, runner_data)` takes out only Squibby's own Stop entries (a command that starts with `/usr/bin/touch -- ` and names Squibby's own `done` folder), exactly as Remove does in `runner/src/donesignal.ts`. Every other key, hook and the key order stay. A file that is not plain JSON, or a link, is left alone. A file Squibby made and that is now empty is removed, and its folder if Squibby made it and it is empty (read from Squibby's own `done-signals.json`).
- Delete everything: the helper removes the hooks from every project named in `done-signals.json` (and the recent folders), whether or not "my projects' notes" was ticked, since a hook is Squibby's machinery, not a note. It runs before the data folder goes, because it needs that index.
- Leaving a project (a folder or practice copy moved to the Trash from Home or Settings): the hooks go first, then the move. A folder put back from the Trash never brings back a hook.
- Tests first (Rust, temporary folders): only Squibby's entry goes; other hooks and keys stay in order; a file that is not JSON is untouched; a file Squibby made goes once empty, one the person had stays; the helper cleans a project from the index with the box unticked; trashing calls the cleaner before the move.

## 1. A shareable "Is this safe to go live" report (review rank 5)

What the person gets: one plain words page they can send a client: the answer on top, then what was checked and how it went, what was found, and what was not checked. Dated. Saved as a web page or a PDF where they choose.

- `app/src/goLiveReport.ts` (pure, tested first): `buildReport({ project name, date, proof, review, ship, receipt, withCode })` gives one answer:
  - **Ready to go live** only when the go live checks all passed, the last check of the work passed, and the review has no open Must fix or Should fix.
  - **Not ready yet** when anything is red (a blocked gate, a failed check, an open Must fix).
  - **Not fully checked** for everything else (a gate that could not check, checks with gaps, no review, no go live checks).
  - Never "safe" or "ready" over red or unchecked. Every part that was not run is listed under "What was not checked".
- Sections: the answer and its one line; the checks of the work (each step, passed, failed, skipped, with the command and exit code); the go live checks (secrets, database access, the work checked); the review findings in the fixed shape (what is wrong, what it means, how to fix it); what was not checked; a footer that says what Squibby is, that nothing was sent, and the date.
- Every line goes through `redact` (the runner's own), then is checked again for a key's shape; a line that still looks like a key is dropped. File names stay, file contents do not. With "Include short code lines" on (`report.codeLines`, off by default), the review's own short lines (already masked, at most three per finding, 120 characters each) are added.
- `reportHtml(doc)`: one self contained HTML file: inline styles, no scripts, no links out, no pictures from outside, a light printable look built from the M71 parts' shapes (its colours are fixed in the file, since a sent file cannot read Squibby's tokens; they are copied from `tokens.css` and pinned by a test).
- `reportPdf(doc)`: a small PDF writer of our own (`app/src/pdfText.ts`, no new dependency): text pages in the PDF's built in Helvetica, wrapped, with headings and status marks. Tested by parsing its own structure (header, objects, cross reference table, page count) and by `pdftotext`-free checks.
- **Saving**: the shell command `save_report(kind, name, data)`, only from Home, only on a press. It opens the Mac's own save dialog (another process, so Squibby never takes the keyboard), with a plain name like `mug-shop-go-live-report-2026-11-06.html`. The bytes are checked first (a web page starting with `<!doctype html>` and no `<script`, or a PDF starting with `%PDF-`, at most 5 MB). Nothing is sent anywhere. Rust tests: the name, the checks, the ending added when the person leaves it off.
- "Share report" sits on a proven result and on the go live checks. It opens a small panel: the answer as the report will say it, Save as a web page, Save as PDF, and the include short code lines switch.
- New setting `report.codeLines` "Include short code lines in reports" (Off).

## 2. Copy for my AI, then point at where to paste (roadmap 16)

What the person gets: after Copy for my AI, a "Show me where to paste" button. On the press, Squibby rings the chat box of the AI app in front: Cursor, the Claude app, ChatGPT, or Lovable, Claude or ChatGPT in a browser.

- Only on the press (no hotkey of its own in this batch: the button is where the copy happened). The light comes on first (`app.showme` "looking", then a short wait), then Accessibility is read. Accessibility is asked the first time (macOS's own prompt) and the card says why; nothing is read without it.
- `app/src-tauri/src/pastehere.rs` (pure, tested first): from the app in front (its bundle id, and for a browser its window title) and the text boxes Accessibility lists (role, placeholder, description, frame, whether it can be typed in), it decides:
  - **Confirmed**: a box whose own label or placeholder carries the chat words of that app ("Ask anything", "Message ChatGPT", "Reply to Claude", "Plan, search, build anything", "Ask Lovable"...), inside the front window. Solid ring.
  - **Guess**: a known AI app, but only a likely box (the widest typing box in the lower part of the window). Dashed ring, and words that say it is a guess.
  - **Words only**: anything else (an app we do not know, no box, a password box, Squibby itself in front): "Paste it into your AI tool's chat box, then press Return."
- Drawing reuses Point at the problem's ring (`draw_pointer_with`, `watch_ring`): clipped to the window it was found in, and gone when that window moves, closes or loses the front (rule 22).
- Squibby never types, pastes or presses in the other app: `pastehere.rs` and the command use no key posting, and a test reads the source to pin that.
- Electron apps (Cursor, the Claude app, ChatGPT) show their tree only after a wake; the same wake as Prompt help is used and switched off at once after.
- New setting `paste.showWhere` "Offer Show me where to paste" (On).

## 3. A plain words tour of a change (roadmap 18)

What the person gets: "Walk me through it" on a review card or a fix result. One place at a time: the file and line, two plain lines (what changed, why it matters), Open in my editor, Back and Next, and a one line summary at the end.

- `app/src/tour.ts` (pure, tested first): the steps come from data Squibby already has, with no model call:
  - From a review: each finding with a place, in the fixed shape's order (what is wrong; what it means), then each changed file with no finding ("Added", "Changed" or "Removed" this file; why it matters from the review's own summary, else a fixed line).
  - From a fix: each changed file of the receipt with its line counts, the changed place (`changedAt`) first, and the result's Explain bullets as the why where there are any.
  - At most 12 steps; the end says how many places, how many need a look, and the readiness line.
  - Every line is redacted before it is shown. A model call was not needed: every step has words from the review or the receipt, so no spend rule is touched.
- Open in my editor uses the existing open in editor path (Point at the problem's editor choice, `pointat.editor`), now its own shell command `open_in_editor(project, file, line)` that opens the file and does not look at the screen. Circle it (the existing Point at the problem) is offered on a step with a known line text.
- Keys: Back, Next and Close are buttons in Home (no global keys, rule 9).
- New setting `tour.offer` "Offer Walk me through it" (On).

## Shared files, small additions only
`strings.ts`, `protocol/settings.json`, `settingsPages.ts`, `runner/test/settings-registry.test.ts`; `card.tsx`, `reviewCard.tsx`, `shipPanels.tsx`, `tokens.css`, `commands.ts`; `app/src-tauri/src/main.rs` (commands), `wipe.rs`, `ax.rs`.

## Checks on a real Mac (the founder's hands, one per message)
1. Set up the Claude Code signal in a test project, then Delete everything: `.claude/settings.local.json` is as it was before. Again with a test folder moved to the Trash from Home.
2. A proven fix: Share report, Save as a web page, open it in Safari; Save as PDF, open it in Preview.
3. A review that found something: Copy for my AI, Show me where to paste with Cursor in front: a solid ring on Cursor's chat box. The same with the Claude app, ChatGPT, and Lovable in Safari and Chrome. [verify] each app's chat box placeholder words and that its tree shows after the wake.
4. Walk me through it on a review: Open in my editor opens each file at its line; Back and Next; the summary.

## Status, 6 Nov 2026 (built, not committed)

All three features and the M75 gap are built end to end with tests, stand in data and temporary fixture folders only. No model ran and nothing was spent. No protocol change was needed: each feature is built from what the page already holds, and the shell answers with its existing `app.showme` stages. One protocol file changed: `protocol/groups.json` lists the three new shell commands (`save_report` in ship, `point_paste` and `open_in_editor` in findProblem).

**0. Done signal hooks on Delete everything and on leaving: built.** `app/src-tauri/src/donehooks.rs` (an order keeping JSON reader and writer, so the person's file keeps its key order; only entries that start with `/usr/bin/touch -- ` and name Squibby's own `done` folder go; a file Squibby made and left empty goes, with its folder if Squibby made it), called by `wipe::run_helper` for every project in `done-signals.json` and the recent folders (whether or not the notes box was ticked), and by `leave_to_trash` before a folder or practice copy goes to the Trash. Tests: `donehooks.rs` (9) and `wipe.rs` (the helper with the box unticked).
- [verify] on a real Mac with a real Claude Code Stop hook added from Settings, then Delete everything.

**1. Go live report: built.** `app/src/goLiveReport.ts` (the answer, sections, redaction, HTML), `app/src/pdfText.ts` (our own PDF writer, Helvetica, no dependency), `app/src/m76Panels.tsx` ShareReport, the `--report-*` tokens in `ui/tokens.css`, `save_report` in `main.rs` with `golive.rs` (checks, name, path, no link followed). Share report sits on a proven result and on the go live checks. Setting `report.codeLines` (Off). Tests: `app/src/m76.test.ts`, `golive.rs` (5). The saved web page was opened in the browser and the PDF in Quick Look (shots below).
- Built a little differently from the plan: the report reads the page's state, so after Home is reopened it has only what the page still holds (a check, a review, the go live checks); anything missing is listed as not checked, never assumed.
- [verify] the save dialog on a real Mac: it opens on the press, does not take the keyboard from Squibby's panels afterwards, and a cancel writes nothing.

**2. Show me where to paste: built.** `app/src-tauri/src/pastehere.rs` (the decision: confirmed, guess, words), `ax::text_boxes` (the front window's typing boxes and what they say about themselves, never their value; the Electron and Chrome wake, then put back), `point_paste` in `main.rs` (only from Home, light first, Accessibility asked the first time, the ring through Point at the problem's `draw_pointer_with` and `watch_ring`), the button in `reviewCard.tsx` SendBack after a copy (`app/src/pasteHere.ts`). Setting `paste.showWhere` (On). Tests: `pastehere.rs` (6, including a source check that the command posts no key, presses nothing and writes no clipboard, and that the light comes before the read).
- Not built: a hotkey of its own. The button sits where the copy happened; a hotkey would need a keymap slot and a Settings row, and nothing in the flow needs it yet.
- [verify] each app's chat box placeholder words (Cursor, the Claude app, ChatGPT, Lovable, Claude and ChatGPT in Safari and Chrome), and that each tree shows after the wake.
- [verify] the ring lands on the box on a second display and on a Retina display (the frame is in global top left points, as Point at the problem's).

**3. Walk me through it: built.** `app/src/tour.ts` (steps from the review's findings and files, or the fix's receipt and Explain bullets; at most 12; the summary), WalkThrough in `m76Panels.tsx` on the review card and the proven result, `open_in_editor` in `main.rs` (the open in editor path, now shared with Point at the problem as `open_in_editor_at`), Circle it through the existing Point at the problem. Setting `tour.offer` (On). No model call was needed. Tests: `app/src/m76.test.ts`.
- [verify] Open in my editor on a real Mac with Cursor and VS Code.

**Found and fixed on the way:** Home read `review.whenNothing` behind `reviewOn &&` (M74), so the hook order changed when the first review card came and Home stopped drawing ("Cannot read properties of null (reading 'getSnapshot')"). It is now read on every render, and `m76.test.ts` checks Home never reads a setting behind a condition.

**Checks, 7 Nov 2026, each run alone:** pages `bun run test` 3782 pass, 0 fail; pages typecheck clean; engine typecheck clean; engine `bun test` 5240 pass, 3 skip, 0 fail; shell `cargo test` 1309 pass, 0 fail, 7 ignored. `scripts/test-all.sh` exit 0. The permission lint (`app/scripts/lint-permissions.sh`) now lists `main.rs:point_paste` as Accessibility's first use place for this feature.

Shots: scratchpad `m76-shots/` (result buttons, Share report open and saved, the go live checks with Share report, Copy for my AI then Show me where to paste, the review tour steps and end, the fix tour, tall layout, the saved report as a web page on a wide and a phone width, and the PDF as Quick Look draws it).
