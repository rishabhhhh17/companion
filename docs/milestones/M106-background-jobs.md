# M106: Review Claude's background jobs too

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 21 Nov 2026, not committed. Nothing is spent: no model call of any kind, no key, no account. Fixtures, the engine's own shadow store and temporary folders only.

From "Review Claude's background jobs too" (the 15 Nov plan, Part 2). It is the small version of the worktree proposal.

## Why (from the plan, sources seen 15 Nov 2026)

- It closes a hole in the safety net. Claude Code's agent view puts sessions in `.claude/worktrees/` inside the repo (code.claude.com/docs/en/agent-view.md), and `runner/src/review/batcher.ts` ignored all of `.claude`. So those changes were never reviewed. The shadow store also leaves out every folder with its own `.git` (a worktree has a `.git` file), so the main review could never see them either.
- Orchestrators (Conductor, Vibe Kanban, Claude Squad, Paradev, Emdash, the Codex app) stop at "here is a diff, merge it" (orchestrators.md section 15).
- Evidence fixes: Augment says 2 to 4 parallel agents, not 4 to 8 (augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace). The 27.67% merge conflict figure is the AgenticFlict study (arXiv 2604.03551v2), seen through stepto.net, and unconfirmed first hand.

What the person gets: "3 files changed in Claude's background job "fix-login"." with the usual rating, and a proof run inside that job's folder. If two open jobs changed the same file, a plain note says so: "Two background jobs changed src/login.tsx ("fix-login" and "new-header"). Merge one, then check again."

## What to build (from the plan)

1. `batcher.ts`: stop ignoring `.claude/worktrees/<name>/`, but keep ignoring the rest of `.claude`.
2. One labelled batch per worktree in `review/service.ts`, and a proof run with that worktree as the folder.
3. An overlapping files note, with no merge simulation.
4. No reach outside the granted folder, so Codex worktrees are out, and no new grant.
5. The "do they still run together" check is dropped for now. Revisit only if real users run several agents at once (F13, and the 13 Nov research said not to compete as an orchestrator).

## Tests first (from the plan)

- The ignore rule change.
- One batch per worktree.
- The overlap note.
- Nothing writes `.git` anywhere.
- Paths outside the grant are never read.

## Rules it must hold

Rules 5, 6 and 10, F13, F30. Only the folder already open is watched (its own file events, as before). The engine never runs a git command in the person's repo or a job's folder: each job gets the engine's own shadow store (`GIT_DIR` is the shadow, as for every project), which never writes the person's git. A job folder that is a link, or sits behind one, is never read.

## How it works (built)

- **The watcher.** A path under `.claude/worktrees/<name>/` goes to that job, never into the main batch (`batcher.ts` `jobPath`, the `onJob` option). The rest of the path is checked against the same ignore list as the project (so a job's `node_modules`, its `.git` file and its own `.claude` stay out). Everything else in `.claude` is still ignored. A name is letters, digits, dot, dash and underscore, up to 64.
- **A job's starting point.** A job folder that is already there when the project opens is copied at once (the engine's own shadow store for that folder). A job folder that appears while watching is first left to settle (3 seconds with no change in it), so the checkout Claude Code makes is the starting point, not a change. Changes after that are the job's.
- **One batch per job.** Once a job's folder has been quiet for the quiet time, its changes since the starting point are one batch (`review.batch` with `job: "<name>"`). It is said only when no main batch is waiting and no review runs, so it never pushes the main card aside; it is said as soon as that card is closed. A batch that grows comes again under a new id, as the main one does.
- **The review.** The same rules, words and lanes as every batch. The proof run (Review them, or Automatic) runs the project's checks in the job's folder. A job folder with a `package.json` and no `node_modules` is not checked: the card says the job's packages are not installed there, rather than a false "did not pass".
- **The overlap note.** A file this batch changed that another open job changed too (since that job's starting point) is listed in `review.result` `overlap` (the file and the other jobs' names, at most 5). The card says it in one plain line each. No merge is simulated.
- **What a job card does not offer.** Fix it (it would run in the project, not in the job) and Put these files back (a job's folder is Claude Code's to keep or throw away). Copy for my AI, Looks fine and Skip this work as usual; Copy for my AI is the way to hand the review back to the job, and the line under the presses says so. A job's review that found something still leads Now (`findingsOpen`), as a project's does.
- **Off.** Settings, Fixing, more: Review Claude's background jobs (`review.jobs`, on). Off: job folders are ignored, as before M106.
- **Which job, always.** Once a review ran, the headline is the finding, so a job's card says "In Claude's background job "name"." under it (and under the review's own summary on a card that found nothing). The line under the presses names the job Copy for my AI hands the review to. A job's instant key warning says the job under its headline, and offers Copy for my AI, never Fix it. Home's greeting says "shop has 2 changes to review in a background job".
- **Other jobs waiting.** `review.batch` and `review.result` carry `waiting`: how many other jobs' changes wait for a review behind this card. The card says "2 more background jobs wait for a review." as a status line; a job's result always says the count (0 too, so an older count goes).
- **Its own folder.** Walk me through it opens and circles a job's file at `.claude/worktrees/<name>/<file>`, inside the granted folder, never the project's copy of that path.
- **Its own versions.** A job's review row in History keeps no versions: the job's shadow store numbers its versions as the project's does, so the same ids mean other versions there. Put these files back is never offered for it, and nothing in the project is put back (`review.undoPlan` says `gone`). A job's shadow store (a full copy of its folder) is removed once the folder is gone, at once while the project is open, or the next time it opens (the names of the jobs followed are kept in the project's store notes).
- **Limits.** At most 8 jobs are followed at once (the research says 2 to 4 run in parallel). A job whose folder goes away is forgotten, and its waiting batch closes (`count: 0`).

## Compared with the best (21 Nov 2026)

Against HeyClicky (the notch companion), CodeRabbit (AI code review: clear findings, one click fixes, summaries) and Coucou (the notch agent watcher, github.com/Louis-CFM/coucou). Research notes: `beat-1115/heyclicky.md`, `coderabbit.md`, `orchestrators.md`. Copied what works; never their names, characters, sounds or look.

**Where we match.**
- CodeRabbit reviews every pull request, whichever branch it comes from, with a short summary on top. Ours reviews each background job's folder on its own, with the same summary and rating, with no setup: nothing to connect, no pull request to open.
- Coucou shows each Claude Code session on its own line. Ours names the job in the card's headline, so two jobs are never mixed into one review.

**Where we are better.**
- Steps: one press (Review them), or none in Automatic. The job's changes are reviewed where the job works, before anything is merged. CodeRabbit needs a pushed branch and an open pull request; the orchestrators stop at "here is a diff, merge it".
- Proof: Review them runs the project's own checks inside the job's folder. CodeRabbit's review reads the diff; it does not run the app.
- The overlap note warns before a merge that two jobs changed the same file, in one plain line. None of the three does.
- Nothing leaves the Mac that a review does not already send, and nothing writes git. Coucou and HeyClicky show status only.

**Gaps.**
- Closed here: a job's checks with packages missing said "did not pass" in the first build. Now the card says plainly that the job's packages are not installed in its folder.
- Closed here: a job card offered Fix it and Put these files back, which would act on the project, not the job. Both are left out on a job card.
- Closed here (found in the shots): the overlap line sat behind Why does this matter? on a card that found something, and the job's review dropped off the top of Now because it had no Fix it. The overlap line now shows at the top with the other untold lines, and the review leads Now as any other does.
- Closed in the review round (21 Nov 2026): after the review a job's card no longer said which job (CodeRabbit always shows which pull request a review is for). It says it now, under the headline. Coucou lists every session at once; ours showed one job card and said nothing of the others waiting. The card now says how many more wait.
- Left (later milestones): CodeRabbit's one click fix has no job version yet ("Put it in" is M107, and a fix inside a job's folder would need its own plan). History's Put back does not reach a job's versions. Claude Code's done signal from a background job is not used yet: the job's batch waits for the quiet time ([verify] (d)). Coucou's jump to the session's terminal (M115) does not know a job's session.

## Built (21 Nov 2026)

Runner: `runner/src/review/batcher.ts` (`jobPath`, `onJob`), new `runner/src/review/jobs.ts` (`JobWatch`, `jobFolder`), `runner/src/review/service.ts` (`jobReady`, `sayJobs`, a batch's `dir` and `job`, Fix it and Put back refused for a job, checks in the job's folder, `overlap`). Protocol: `job` on `review.batch` and `review.result`, `overlap` on `review.result` (`REVIEW_JOB_NAME`), fixtures `m106e1`, `m106e2`. Setting `review.jobs` (on). Pages: `app/src/review.ts` (`job`, `changedLead`, `overlapLines`, `findingsOpen`; `canFix` false on a job), `reviewUndo.ts`, `homeHero.ts`, `reviewHead.ts`, `reviewCard.tsx`, `strings.ts`, `settingsPages.ts`.

Tests: `runner/test/m106-background-jobs.test.ts` (17: the ignore rule, one batch per job, the overlap note, nothing writes `.git`, links never read), `runner/test/settings-registry.test.ts`, `app/src/m106.test.ts` (8), `app/dom/m106.test.tsx` (4), the Rust `runner.rs` m106 fixture test. Changed on purpose: `app/src/reviewEveryDay.test.ts` (the more fixing list now has `review.jobs`).

Shots (2x, dark, stand in for the app): `scratchpad/m106shots/out/`. Retaken in the review round with a window tall enough that the ask box never covers the card (the harness checks it and prints `covered: none`), plus `7-job-key-*` (a job's key warning: no Fix it, the job named). Worst case: the overlap lines say the file's own name (the path in their title) and "and 2 other jobs". `1-demo-ready-*` and `3-worst-ready-*` (the job's headline before the review; worst case a 64 character job name and a deep path, wide and narrow), `2-demo-reviewed-*` and `4-worst-reviewed-*` (the overlap line at the top, no Fix it, the job's line under the presses; worst case three jobs), `5-one-safe-*` (one file, safe), `6-demo-reviewed-reduce` (Reduce Motion: nothing here moves). In the reviewed shots the card is scrolled to its top, so the glass tabs sit over its first line; that is the harness's scroll, not the layout.

## [verify] on a real Mac

Each in a throwaway practice project, never a real one. Also in `docs/research/technical_research.md` section 20, item 57. Ready script: `scripts/m106-check-jobs.sh` (it prints what to do and checks only the practice folder it is given; it runs no git command in it).

(a) Claude Code's agent view (or `claude --worktree`) puts a background job's folder at `<project>/.claude/worktrees/<name>/`, with a `.git` file, and the name matches `jobPath`.
(b) The checkout of a new job lands within the 3 second settle, and Claude Code's first edit comes after it (otherwise the first edit is part of the starting point and is not reviewed). If not, raise `JOB_SETTLE_MS`.
(c) A change in the job's folder shows the card "N files changed in Claude's background job "name"." after the quiet time, and the main project's card is never replaced by it.
(d) Whether a background job runs the project's Claude Code hooks (its own copy of `.claude/settings.json`), so its done signal could move the job's batch on at once. Until then it waits for the quiet time.
(e) Review them in a job whose packages are installed runs the checks in the job's folder, and nothing in the main folder changes.
(f) Two jobs editing the same file show the overlap line on the second review.
(g) The person's `.git` folder and each job's `.git` file are byte for byte the same before and after (the script compares them).
(h) A job's shadow store under Application Support goes once its folder is removed (at once, or at the next open), and the project's own store stays.

## Review round (21 Nov 2026)

Eight findings, all taken. Runner: a job's review row keeps no versions and `undoable` refuses a job's batch (test: review a job batch, Looks fine, then `review.undoPlan` is `ok: false`, `why: "gone"`, and the project's file is untouched); a job's shadow store is removed when its folder is gone, now or at the next open (three tests, one that `removeAt` removes only a `<id>.git` folder); `waiting` on `review.batch` and `review.result` (two tests). Pages: `jobFile`, `jobWhere`, `jobRiskyLine`, `jobsWaiting`, `jobReassure(name)`, `hello.jobChanges`, the overlap line's base name and count, no Fix it on a job's key warning (pure tests in `app/src/m106.test.ts`, rendered ones in `app/dom/m106.test.tsx`, each seen failing first). Changed on purpose: the dom overlap test now expects the file's base name and the path in the line's title.

ecc_applied (this round; the first build's own record was not found in the doc or the scratchpad, so it is not claimed): ecc-tdd-workflow (each fix had a failing test first; the dom tests were checked red by undoing the fix), ecc-frontend-a11y (the waiting count is a `role="status"` line because it changes while the card is open; the overlap lines are static text that arrives with the result, which the card's existing status already announces, so they are not live regions; the full path is in `title`), ecc-react-patterns (`jobFile` and `overlapLines` derive from the card in render, no stored copies), ecc-motion-foundations (nothing new moves; the Reduce Motion shot is unchanged), ecc-verification-loop (every suite run alone, counts below in the report).
