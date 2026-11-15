# M101: Undo on the review card, for any tool's change

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 16 Nov 2026, tests pass. Not committed. Nothing was spent: no model call of any kind, no key, no account. Stand ins, temporary fixture folders and the engine's own shadow store only.

This merges "one tap to take back what another tool did" and "Undo this change on the review card" (the 15 Nov plan, Part 2).

## Why (from the plan, sources seen 15 Nov 2026)

- Orchestrators undo by "do not merge the branch". The Codex app snapshots only when it prunes or archives a worktree (learn.chatgpt.com/docs/environments/git-worktrees). With Copilot you close the pull request. Deleting a Claude Code agent view session loses uncommitted work (code.claude.com/docs/en/agent-view.md).
- Claude `/code-review --fix` edits are outside the session's checkpoints, so `/rewind` cannot undo them (code.claude.com/docs/en/code-review-local).
- CodeRabbit's Fix with AI hands the work to the agent and has no revert (docs.coderabbit.ai/ide/fix-with-ai).
- Bugbot Autofix writing a separate branch is unconfirmed (not fetched).
- The honest edge: Cursor checkpoints and Claude Code rewind undo only that tool's own edits. They miss terminal edits and most subagent edits (13 Nov research). Squibby's put back works across tools and covers those gaps.

What the person gets: on the card that explained a change by Cursor, Codex or any connected tool, one button puts back just the files that change touched. The same button is on the review's row in History.

## What to build (from the plan)

Most parts exist: each batch's from and to snapshots (`runner/src/review/service.ts`), the per file put back and undo one task (`runner/src/checkpoints.ts`), the undo limits line (`app/src/savePoints.ts` `undoLimitsLine`).

1. A "Put these files back" button on `app/src/reviewCard.tsx` and on review rows in History (`app/src/card.tsx`). Offer it only once the batch is closed (reviewed). If the tool is still writing, say "stop it first".
2. Put back only that batch's files, from the batch's from snapshot. Never restore the whole project.
3. A confirm step that lists the files. If any changed after the batch, name them and ask before overwriting, and keep the person's versions in the recovery folder ("Put those back too" step).
4. Review snapshots use `envCopies: false`, so say plainly that `.env` changes are not put back.
5. If the tool made a commit, say the files are back but the commit stays. Show the exact git command, and never run it (rule 10, F13).
6. Put the undo limits line under the button: installs, databases, deploys and anything sent are not undone. If the snapshot was cleaned up under the 2 GB cap, or is gone after a restart, grey the button and say why.
7. A record linking review id to undo checkpoint, so M94 can count review undos (counts only, on device).

## Tests first (from the plan)

- Only the batch's files change.
- Later edits are listed and kept.
- Undo is not offered while the batch is open.
- The commit case shows the command and writes no git.
- A missing snapshot greys the button.
- The link record is written.

## Rules it must hold

Rules 10 and 13, F13, F30. Undo is itself a tap, with a confirm naming the files. Nothing of the person's git is written; the commit check only reads where `.git/HEAD` points and when that pointer last moved, never the history.

## How it works (as built)

- **Protocol.** Two commands, both from a page and only for the chosen folder: `review.undoPlan {project, batch}` (looks only) and `review.undo {project, batch, confirm: true, overwrite?}`. Two events: `review.undoPlan` and `review.undone`. When something cannot be done, the engine sends a short code (`why`: open, writing, busy, gone, done, nothing, failed) and the page says it in its own words (`app/src/strings.ts`). Fixtures in `protocol/fixtures/commands.jsonl` and `events.jsonl`, read by the runner, the pages and the shell.
- **The engine** (`runner/src/review/service.ts` `undoPlan` and `undo`). The batch's two versions come from the review kept in memory, or from its History row after a restart (`tasklog.ts` keeps `from_cp` and `to_cp` beside each review, never file text). The look takes one shadow snapshot of the folder as it is now and compares the three versions (`checkpoints.ts` `batchPlan`). Put back (`checkpoints.ts` `undoBatch`) takes a safety snapshot first, reverts only the files that batch changed, leaves alone every file changed after it unless the person said "Put those back too" (then their version is copied to the recovery folder first), never writes a `.env` file, a file behind a link or a file too big for a saved copy. It runs as the engine's own work (`around`), so the put back is never reviewed as the other tool's change.
- **The commit check** (`runner/src/review/gitcommit.ts`). Reads `.git/HEAD` (or a worktree's `gitdir`), and the time its branch file (or `packed-refs`) last changed. Newer than the batch's start means a commit was made since. The batch's start is when its first change was written (the oldest time among its changed files, never before its starting point, kept in the review's row as `began_ms` for after a restart), not the starting point's own time, which can be hours older: a commit the person made in that gap is theirs and is never offered to be taken back. The confirm step says a commit was made; the result shows `git reset HEAD~1` with a Copy button. Nothing runs it.
- **The record** (`tasklog.ts` `reviewUndone`, `reviewUndos`). The review row gets the safety checkpoint of its put back (`undone_by`). `reviewUndos(project, since)` counts them, for M94 to show later.
- **Kept for History.** The from and to versions of the newest 10 reviews are guarded from pruning. Older ones may go under the 2 GB cap or the count limit; their row's button is greyed with the reason.
- **The page** (`app/src/reviewUndo.ts`, tested in `reviewUndo.test.ts`; drawn by `app/src/reviewUndoPart.tsx`). One flow at a time, for the card or a History row: Put these files back, then the confirm step (the files, the later edits with their own Put those back too, the `.env` line, the commit line, the undo limits line), then Putting the files back, then the result. Stop everything closes an open question.

## Built

Built 16 Nov 2026, tests first for the risky logic (the store's put back, the engine's checks, the commit check, the record), then the pages.

1. **The store** (`runner/src/checkpoints.ts`). `planOneNow` was split so its file by file reasons (`classifyNow`) serve both Undo one task and the new `batchPlan`. `undoBatch` takes a safety snapshot, puts back only the batch's files, removes files the batch added, copies the person's later version aside before a Put those back too, and updates what our last work left so the files are not taken for the person's own later. `has` and `info` read only. Undo one task works exactly as before (its suite passes unchanged).
2. **The engine** (`runner/src/review/service.ts`). `undoPlan` and `undo`, with the checks in one place (`undoable`): open, done, gone, writing (the batcher still has paths waiting for the quiet time), busy (Squibby's own work, a watch's check, or a review running). Writing also covers a newer change that is open, not reviewed and under a minute old: the tool may only have paused for longer than the quiet time. The put back runs inside `around`, so the folder's events from it are the engine's own. The card of a review whose files were put back is closed with "Changed since, it no longer applies" in History.
3. **The commit check** (`runner/src/review/gitcommit.ts`): reads `.git/HEAD`, a worktree's `gitdir` and `commondir`, the branch file or `packed-refs`, their size bounded, links never followed for HEAD. No git command.
4. **The record** (`runner/src/tasklog.ts`): `from_cp`, `to_cp` and `undone_by` on the reviews table (ids only), `reviewPoints`, `reviewUndone`, `reviewUndos`, `recentReviewPoints`. `tasks.list` rows carry `batch` and `undo` (ok, gone, done) (`agent.ts`).
5. **Protocol** (`protocol/index.ts`, `commands.json`, `groups.json` `stays`, fixtures `m101c1`, `m101c2`, `m101e1` to `m101e4`). The shell's tests read the same fixtures.
6. **The pages.** `app/src/reviewUndo.ts` (the flow, its words, and the checks on every event), `reviewUndoPart.tsx` (drawn), `reviewCard.tsx` (shown once the review ran, and the card's other presses step aside while it is open: one question at a time, and once the files are back they no longer apply), `card.tsx` History rows (Put back, greyed with "The copy from before is gone.", and "Put back" in the row's line once done), `ui/parts.tsx` (`RowAction.disabled`), `strings.ts` (`S.reviewUndo`), `ui/homeNow.css` and `ui/parts.css` (tokens only).

## Tests

- `runner/test/m101-review-undo.test.ts` (18): only the batch's files change (modified, added and deleted; the person's edit before the batch and another file changed after it stay); a later edit is listed and kept, and Put those back too keeps the person's version in the recovery folder; a `.env` change is named and never put back; a version that is gone is refused; the commit check (a moved branch file, packed refs, a worktree, no git, a broken HEAD); the command text; not offered while the batch is open; the put back is never reviewed as a new change, and a second press says done; writing and busy; the commit case says committed and no file under `.git` changes; after a restart the History row's versions are used, and a cleaned up version is gone; the link record and its count; History's rows say ok, gone, done or nothing; the protocol (the yes needs `confirm`, bad lists and bad codes refused) and the shared fixtures.
- `app/src/reviewUndo.test.ts` (13) and `app/dom/m101.test.tsx` (5): offered only once the review ran (never while waiting, reviewing, after Fix it, or in the practice); the press looks first and nothing is sent before the yes; the confirm step names the files, the later edits, the settings files, the commit and the undo limits; Put those back too goes with the yes; the result and the command with Copy; each refusal in words with a next step; Stop everything closes an open question; History's Put back, greyed when gone, and "Put back" once done; the page's command text is the engine's own constant.
- One old expectation changed on purpose: `runner/test/review-history.test.ts` lists the reviews table's columns, which now include `from_cp`, `to_cp` and `undone_by` (ids only, still no file text). Two in `app/src-tauri/src/runner.rs` list the review commands and events in the shared fixtures, which now include the two new ones of each.

## Fixed after the review (16 Nov 2026)

- A safe card set to Close it quietly no longer closes by itself while its Put these files back is open, at any stage (`review.ts` `closesQuietly`).
- The commit check measures from when the change began, not from the starting point (above).
- When every file of the change was changed again since, the confirm step says so and Put them back waits for Put those back too, so it never asks to put 0 files back.
- Once the files are back, the card's findings, its readiness line, the line pointed at and the waiting item in the side step aside, and one line says they no longer apply. A put back from History closes Home's card of the same change.
- Fix it's reassurance line sits above Put these files back, never under it.
- History: a row with Put back shows one press on the right (its Review fact steps aside); a greyed Put back has no colour and regular weight. A row put back says "Files put back".
- Product names in the new words come from the strings file, and the settings files line says only that a review keeps no copy of them.
- The writing check above.

## Not done, and why

- **Counting review put backs on screen.** The record and `reviewUndos` are there; showing the count is M94's own surface and its words are not in this plan.
- **Taking back the commit.** Rule 10 and F13: shown, never run. The command assumes one commit, and the line says so.
- **A commit between two writes of the same file.** The change's start is read from its files' times, so a tool that writes a file, commits, then writes that same file again before the folder goes quiet (and touches no other file) is not said to have committed. The card then only leaves out the commit line; it never offers to take back the person's own commit.
- **Moved and renamed files.** A rename is seen as a removal and an addition, so both are put back (the old name comes back, the new one goes). That is the right result for the person, and the confirm step names both.

## [verify]

Also in `docs/research/technical_research.md` section 20 item 46. A guide for a guided session on a real Mac, one step at a time, with a throwaway copy of a project (never the founder's real project), and no model spend: the review can run with Checks only (Settings, What a review may send).

1. Open a throwaway project in Squibby with reviews on. In Cursor (or Codex), ask for a small change to two files. When it says it is done, open the review card, press Review, then Put these files back. Check the confirm step names the two files, press Put them back, and check both files are back and nothing else changed (`git status` in Terminal shows only what was there before).
2. Ask the tool for a longer change and press Put these files back while it is still writing. The card must say "Your AI tool is still changing files. Stop it first, then press this again."
3. Ask the tool for a change and to commit it. Put these files back: the confirm step must say a commit was made, and the result shows `git reset HEAD~1` with Copy. In Terminal, `git status` shows the put back files as changes against the commit; run the copied command and check `git status` is clean.
4. The same as 3 in a worktree project (a Codex worktree, or a Claude Code agent view one): the commit line must still show.
5. Quit and reopen Squibby. In History, the newest review's Put back must still work. For an old review, after the undo store has pruned, the button is greyed with "The copy from before is gone."
