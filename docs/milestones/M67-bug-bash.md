# M67: bug bash

Branch `m48/launch`. A hunt for real bugs across the engine (runner), Home and Settings (pages) and the Mac shell, run without a real model: every test uses the runner's stand in engine or fixtures, temporary fixture folders and fixture git repos only. Nothing here spent money on Claude, touched a real project, or ran git on one.

## How it ran

1. **Hunt.** Probe tests were written against what the docs promise, in files named `bugbash-*.test.ts` (runner and app). A probe that fails points at a bug; one that passes refutes the worry.
2. **Fix.** Each confirmed bug got a failing test first (`m67-*.test.ts` in the runner, `bugbash-pages-fix.test.ts` and `bugbash-shell.test.ts` in the app), then the fix.
3. **Review.** A review of the whole diff found four more problems, all in the fixes themselves. All four were real and are fixed below, each with a failing test first.
4. **Second review.** Seven more findings, again in the fixes themselves. All seven were real and are fixed (see "Second review fixes"), each with a failing test first in `runner/test/m67-review-findings.test.ts`.

## What was hunted

- Ask and Fix it: a cut off answer stream, Stop in the middle of a turn, a fix that never proves, a fix that changes the test script.
- Git and databases: project scripts and tools that write the person's git, a commit made by an agent's command, destructive database commands, live connection strings, a git ignored SQLite file.
- The browser check: pages behind a sign in, during a check, a fix and Ship.
- The first run: what the first check says for small projects, Back then Check again.
- Memory: edit, forget, erase, no project chosen, dates west of UTC, a refusal staying shown.
- Review every change: three batches while a card is open, changes made while Squibby was closed, Fix it on an older card.
- Pages and shell: Return while a job works, empty Plan it and Look up, Forget everything, Home's stage opening, a right click on the character, the hover nudge.

## Confirmed bugs and their fixes

| Area | Bug | Fix | Pinned by |
|---|---|---|---|
| Ask | A stream cut off halfway, or ending on Claude Code's own failed request note, ended as done | It ends as a failure, named as out of reach | `runner/test/m67-cut-stream.test.ts` |
| Git (rule 10) | A project script (`npm run save`) or a tool (husky on install, changesets) that writes git ran with no card | It asks as git and says what it runs | `runner/test/m67-git-safety.test.ts` |
| Git (F13) | A commit an agent's command made was not on the receipt | The receipt says so, with the exact command to take it back; Companion never runs it | `runner/test/m67-agent-git-db.test.ts` |
| Databases (rule 12) | `sqlite3 DROP TABLE`, `psql TRUNCATE`, reset tools and live connection strings ran with no card | They ask on a card that names the database; a git ignored `dev.db` is kept first, so Undo brings the table back | `runner/test/m67-db-safety.test.ts`, `m67-agent-git-db.test.ts` |
| Fix it | The card for running a project's changed scripts said "add a tool" and could be answered in the notch | It says what it is and is answered on Home, where its why is shown | `runner/test/m67-scripts-card.test.ts` |
| Browser check | A page behind a sign in was blamed on the code, or called proven when only the login page was seen | A gap, never proven, never sent to the fix loop: a login page always, a 401 or 403 when the project has a sign in or the page asks for one (see review fix 4 and second review fixes 2 to 4) | `runner/test/m67-signin.test.ts` |
| First run | Tests that could not run (install refused) said nothing; Back then Check again said busy | It says why, with the command; the new press waits for the stopped one | `runner/test/m67-firstcheck.test.ts` |
| Memory | Edit took text in the store's own format, two lines could share an id, dates used the UTC day, erase with no project touched the engine's folder, a refusal was cleared at once | All fixed in the store and the runner | `runner/test/m67-memory-fixes.test.ts` |
| Pages | The first run hid what could not run; Return while working sent the words and showed an error; empty Plan it and Look up said nothing; Forget everything said Forgotten before the erases were answered; Home's stage could stick before open | Each fixed | `app/src/bugbash-pages-fix.test.ts` |
| Shell | A right click or Control click toggled Home or started a drag; Home kept the hover nudge after the shell forgot the hover | Primary button only; the shell tells the page | `app/src/bugbash-shell.test.ts` |

## Review fixes (step 5)

1. **Stop everything could be beaten by a check waiting to start (rule 11).** A Check again press that waited for a stopped check to end sat in no tracking map, so Stop everything could not see it, and it then ran the project's install, build, tests and server after Stop everything. Its 10 second timer was never cleared either. Now the waiting press is registered (`findWaits` in `runner/src/agent.ts`), Stop, Stop everything and Flow going off all reach it, it ends at once as cancelled, and the timer is cleared. Test: `runner/test/m67-review-fixes.test.ts`, which failed before the fix with a test step running after Stop everything.
2. **The receipt's undo-a-commit line fired on any move of HEAD.** A branch switch, a fast forward pull or merge, a rebase or an amend all read as "A Git commit was made", with a `git reset --soft` that would drop a branch's commits. Now `runner/src/githead.ts` records the branch as well as the commit, and reads HEAD's own log (`.git/logs/HEAD`, a file read, no git process). The reset is offered only when the branch is the same and every step since the task started was a plain commit. A branch switch says so and offers `git switch <branch>`; anything else is said plainly with `git log --oneline -5` to look. Because the person's own commits look the same in the log, the line now says "If you did not make it yourself". Tests: six cases on fixture repos in `m67-review-fixes.test.ts`.
3. **Forget everything could say Forgotten when the profile erase was refused.** The page assumed the refusal came before its memory.state, but the runner sends it after (so the Memory page keeps showing it), and any stray memory.state counted as an answer. Now each memory.state that answers a command names it (`answers`, the command id) and carries its refusal (`refused`), both optional in protocol v1. The memory.refused for the Memory page still comes after. Settings matches each answer to the erase it sent (`forgetStart`, `forgetStep` in `app/src/settings.ts`). Tests: `m67-review-fixes.test.ts` (runner) and `app/src/bugbash-pages-fix.test.ts`, now in the runner's real order.
4. **The sign in gap covered up a change that broke the whole app.** Any 401 or 403, or any redirect to a password page, became a gap, so a broken middleware read as a partial pass and the fix loop never ran. Now it is a gap only when the project is known to have a sign in (`knownSignIn` in `runner/src/proof/browser.ts`: a sign in package such as next-auth, Clerk, Supabase auth, Auth0, Passport, Lucia, Flask-Login or django-allauth, a login page of its own such as `app/login/` or `templates/login.html`, or `"signIn": true` in `.claude/proof.json`). Ship's Vercel preview always counts as expected. Anywhere else a 401 or 403 is the old error, and being sent to a login page is a problem. Tests: `runner/test/m67-signin.test.ts`.

## Second review fixes (step 6)

1. **The first check could wait unseen for a question.** With no safety box on the Mac, the first check asks whether to run the project's scripts without it (a card that cannot be undone). The first run screen showed only install and Go online cards, and it covers Home, so nobody saw the question until it ran out after 30 minutes. Now every question a check asks carries `check: true` (optional in protocol v1, `approval.request`), the page keeps it on the card, and the first run screen shows any question its check asked (`installAsks` in `app/src/onboarding.ts`). A tool's own question is never marked. Tests: `m67-review-findings.test.ts` (the real ladder with no box) and `app/src/onboarding.test.ts`.
2. **A redirect to a login page failed working apps.** Review fix 4 made it a problem when `knownSignIn` found no sign in, but it misses many real setups (firebase, `@supabase/supabase-js`, `LoginPage.tsx`, hand written logins), and the fix loop then asked Claude to take the sign in out. Now a redirect to a different page with a password field is a gap in every project, never a problem. The test in `m67-signin.test.ts` that asked for a problem there was changed to ask for the gap; it still never passes clean.
3. **The same, seen from a project with express and express-session.** Covered by fix 2.
4. **Bug 23's own sign in wall still failed.** A 401 was a gap only when `knownSignIn` was true. Now a 401 or 403 is also a gap when the answer itself asks for a sign in: a WWW-Authenticate header (HTTP Basic auth, a staging password), a password field, or sign in words on the page. A bare 401 or 403 error page in a project with no sign in is still a problem, so a broken middleware is still told and fixed. `knownSignIn` also knows firebase, `@supabase/supabase-js`, `basic-auth`, `express-basic-auth`, `http-auth` and the like, and names such as `LoginPage.tsx`, `SignInForm.tsx` and `sign-in-page.vue` (never `author.ts`).
5. **After Squibby's own task and a restart, its own work was offered as changed while closed.** Changes said but not reviewed keep a note of where they start (bug 10's fix), but the note did not know about Squibby's own work after it. Now when Squibby's own work ends while that note is waiting, the engine also notes the version the work left and the other tool's files up to then (`review.pendingOwn`, `runner/src/review/service.ts`). A restart offers only those files plus whatever changed after the work. The version is kept from pruning while the note stands.
6. **A git writing script in a workspace package ran with no card.** `npm --prefix`, `-C`, `-w`, `--workspace`, `-ws`, `pnpm -C`, `--dir`, `--filter`, `-r`, `yarn workspace <name>`, `yarn --cwd` and `bun --cwd` now find the package they run in. A workspace or filter is checked against every package in the project, a few folders deep, so a script that writes git (or resets a database) anywhere it could run asks. A folder the command decides while it runs asks too. The flag's value is no longer read as the command's name either.
7. **`cd prisma && sqlite3 dev.db` kept the wrong file for Undo.** The engine now follows `cd` the same way the safety check does (`commandsWithFolder` in `runner/src/safety.ts`), so it keeps `prisma/dev.db` before the command and Undo brings the table back.

The open probes from the first pass are now closed too:

- `app/src/bugbash-review.test.ts`: Don't flag again is no longer offered on any reason of a Fix this first card (`silenceOffered` in `app/src/review.ts`). Its other probes, and the memory date probe, were already fixed by the earlier fixers and pass.
- `runner/test/bugbash-git.test.ts` and `bugbash-db.test.ts` now answer their card No, so they end instead of waiting past bun's 5 second limit. Their check (a card is shown) is unchanged.
- `runner/test/bugbash-memory.test.ts`, "two identical hand written lines", asserted the bug itself as its setup. It now asserts the promise: each line has its own id and Forget takes one.
- The runner's type check failed on the probes that import the page's model (it reaches `icons.tsx`), so those probes now load the page's files by path, as the other runner tests do. No assertion changed.
- The ladder told the browser check `signInExpected: false` for every project, which broke the promise that the usual settings ask the browser exactly as before (`check-ladder-settings.test.ts`). It is now said only when true.

## Refuted

- Stop in the middle of a turn: the receipt says stopped and Home never says done (`runner/test/bugbash-ask-flow.test.ts` passes).
- Stop mid task, then Undo: the files come back and the history says undone (`bugbash-fixflow.test.ts`).
- A fix that never proves stops after its rounds and does not loop (`bugbash-fixflow.test.ts`).
- In the engine, changes said but not reviewed before it closed are offered again when it opens, and Fix it still works on an older Fix this first card (two of the three probes in `runner/test/bugbash-review.test.ts`).
- What the first check answers for small fixture projects (`bugbash-firstcheck-verdicts.test.ts`).

## Still open

Nothing from the hunt is still open. Every probe in the `bugbash-*.test.ts` files passes or is a printing probe that passes.

## What needs the founder's hands on a real Mac

- Press Back on a running Check my project whose tests are slow to stop, press Check again, then the stop everything hotkey within a few seconds: nothing should start, and Home should settle as stopped.
- In a test project with git, let a task run an approved `git switch` and read the receipt: it should say the branch moved and offer `git switch`, never `git reset`. Then let a task run an approved commit: the receipt should offer the soft reset.
- Settings, Privacy, Forget everything with a profile folder made read only: it should show why, never "Forgotten."
- A project with its own login (next-auth, firebase, a login page, or a staging password with basic auth): the receipt should say the page needs a sign in, never that it is broken, and no fix round should start. A plain project whose home page answers a bare 403: the check should fail and Fix it should take over.
- On a Mac where the safety box for checks does not work, the first run's Check: the question about running without the box should show on the first run screen with Don't allow first.
- Review set to Ask: let another AI tool change a file, leave the batch unreviewed, ask Squibby for a small change, quit and reopen. The "Changed while Squibby was closed" card should list only the other tool's file.
- In a test monorepo, let a task run `npm --prefix packages/app run <a script that commits>`: a git card should come first.
