# M75: features, batch one

Status: plan written 6 Nov 2026 on m48/launch (HEAD 1b3c376), then built in the same change. Not committed. The build status of each part is at the end, with what still needs a real Mac.

Sources: the founder, 6 Nov 2026 ("Build all the features... make sure this product actually works... very good and very fluid... unique"); the 6 Nov review's feature list (section 3, ranks 1, 2, 3 and 6); the 4 Nov roadmap (feature 19); the inspiration shortlist (item 10, and the "usage cap with a Keep going pause card" next in line); F29, F30; M57, M58 (A4 sign in handover, never built) and M74 (spend warning, budget.task).

## Rules this milestone keeps

- AGENTS.md rules never bend. Squibby never writes the person's git (rule 10). Nothing runs until a tap (rule 13). Stop everything stops all of it (rule 11). "Done" means proven (rule 14).
- F29 and M69: no cents and no amounts where a customer looks. The cost card says "a lot more than usual", never a number.
- F30: a hook in another tool's settings only after the person's yes, shown exactly first, removable with one press, and listed in Settings. The signal carries no content (rules 5 and 6): only "done in this folder".
- Squibby never types a password, never reads a sign in field and never solves a CAPTCHA. A sign in nobody finished is "not proven", never done.
- Honest words (M57): never "your AI did" or "your AI fixed".
- Strings only in strings.ts, colours only in tokens.css, the M71 parts and look, the M66 and M73 motion tokens. Plain words, no em dashes.
- New settings in the four registry files with safe defaults. Protocol changes with fixtures both sides read.
- Tests first for the risky logic (rule 17), stand in model and temporary fixture folders only, never a real project or its git, never a real model.

## 1. Review the moment your AI says it is done (roadmap 19, F30)

What the person gets: the review starts when Claude Code or Codex finishes a turn in the project, instead of after a guess at quiet time.

### The signal, checked against each tool's docs (6 Nov 2026)
- **Claude Code.** A `Stop` hook in the project's own `.claude/settings.local.json` (Claude Code hooks reference, code.claude.com/docs/en/hooks). Shape: `{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "..." } ] } ] } }`. Stop has no matcher and fires each time Claude finishes responding. Exit code 2 would keep Claude going, so the command always exits 0. The hook is given the turn's JSON (with the last assistant message) on its input; Squibby's command never reads it.
- **Codex.** Codex's `notify` setting is user level only (`~/.codex/config.toml`), takes one program, and hands it the turn's content (input messages, last assistant message). So it is **not** used. Codex's own lifecycle hooks have a `Stop` event in the same shape, in the project's `.codex/hooks.json` (learn.chatgpt.com/docs/hooks). Codex runs a new project hook only after the person trusts it with `/hooks`, and a Stop hook that exits 0 must print JSON, so the command prints `{}`.
- **The command** (both tools): `/usr/bin/touch -- '<Squibby's data folder>/done/<token>' 2>/dev/null; printf '{}'`. The token is a random name for this project, kept in Squibby's own `done-signals.json`. Nothing else is written, read or sent.
- **The user's own settings** (`~/.claude/settings.json`) are not used: a hook there runs for every folder, so it would have to read the folder from its input to say which one. One project at a time keeps the signal to "done in this folder".

### How it works
- `runner/src/donesignal.ts` (new, tested first): the plan of what would be written (file, whether it is new, the exact entry), the write (merges into the file, keeps every other line, refuses a file that is not plain JSON, writes through a temporary file), the removal (only Squibby's own entry, found by its marker path; a file Squibby made and left empty is removed), and whether it is set up (read from the file itself, never from memory).
- The runner watches only its own `done` folder. A marker for the project being reviewed ends the quiet time at once: the batch is said after a short settle (1.5 seconds, for the last write to land). With nothing changed, nothing is said. A marker for another project, or with reviews off, does nothing. The marker is removed as it is read.
- No signal: the quiet time works exactly as before. The quiet time also still ends a batch the signal never closes.
- `.codex` joins the review's ignored folders, as `.claude` already is, so writing the hook is never reviewed as a change.
- Protocol: commands `donesignal.show { project }`, `donesignal.add { project, tool, confirm: true }`, `donesignal.remove { project, tool }`; event `donesignal.state { project, tools: [{ tool, on, file, adds, creates }], problem? }`. `adds` is the exact text the card shows before the yes. Fixtures both sides.
- Shell: the three commands are allowed from a page and bound to the open project (runner.rs).
- Pages: a "When your AI tool says it is done" part on the Fixing page, under Review changes, one row per tool with Set up or Remove. Set up opens an approval card with the exact file and the exact lines, Add it and Not now. Remove is one press. Search finds it by Claude Code, Codex, hook, done.

### Tests first
`runner/test/m75-done-signal.test.ts`: the plan names the exact file and lines; adding keeps every other key and hook of the file, and adding twice adds once; a file that is not JSON is refused and left exactly as it was; removal takes out only Squibby's entry; a file Squibby made is removed once empty, one the person had is kept; the command never reads its input and always exits 0 (run for real with a JSON input); a fixture project's `.git` is the same before and after; a marker reaches the batch before the quiet time; a marker with nothing changed says nothing; a marker for another folder does nothing; no marker means the quiet time still works.

## 2. The cost pause card

What the person gets: a fix that keeps going far past a usual task stops and asks: "This one is taking a lot more than usual. Keep going?" with Keep going, Stop, and Undo what it did.

- **Usual** is worked out from this project's own task history (the task log's spend per task): the middle value of the last 20 tasks that spent something. With fewer than 3, a fixed starting value. The pause comes at that usual times the setting, never below a small floor, and only once each time: Keep going asks again only at twice that.
- New setting `spend.pauseAt` "Pause a task that uses far more than usual": Off, 3 times usual, 5 times usual (usual: 3 times). Account page, beside the daily limit and `budget.task`. `budget.task` still ends a task at its own amount, as before.
- **Where it pauses.** The engine checks after each booked turn, and before letting any tool run. While it waits, nothing more runs in the task: tools are held at the gate. The task is on Needs you.
- **Stop** ends the task as a stop (never a fix, never counted). **Undo what it did** ends it the same way, then puts the files back to the task's own safety copy, as Undo does, with its receipt. **Stop everything** ends the wait at once (rule 11).
- Protocol: event `cost.pause { agent, project }` and `cost.resolved { agent, choice }`; command `cost.choose { agent, choice: "keep" | "stop" | "undo" }`. No amount in either. Fixtures both sides. The shell allows `cost.choose`.
- Pages: the card in Home's urgent cards, like the loop card, with the three buttons; Keep going is the main one.

Tests first: `runner/test/m75-cost-pause.test.ts` (usual from history, the floor, Off never pauses; with a stand in engine: the pause comes once past the line, nothing runs while it waits, Keep going goes on and asks again only at twice, Stop ends as stopped and never counts as a fix, Undo puts the files back, Stop everything ends the wait; no event carries an amount). `app/src/m75.test.ts` (the card's words carry no cents or digits; Stop everything clears it).

## 3. The sign in handover, and "this page should need a sign in"

### 3a. Handover (finishes M58 A4)
- When a task's browser check meets a sign in wall (M67's detection, unchanged), the ladder waits for the person instead of ending there: the step says `needs: "signIn"` and the card says "Your turn: sign in, then tap Continue, or skip this check."
- **Open the sign in page** opens a visible browser window on the page from a fresh temporary profile in Squibby's own folder. The person signs in there. Squibby never types, never reads a field, never solves a CAPTCHA, and the window is not watched.
- **Continue** takes the window's sign in (its cookies and site storage, in memory only, never written or logged), closes the window, deletes the profile and runs the browser check once more with it. A pass then counts; a page problem is a real problem.
- **Skip this check**, or no press in time (`point.yourTurnSeconds` for the first press, ten minutes once the window is open), keeps the gap: not proven, never done. Stop everything ends it, closes the window and deletes the profile.
- The visible window needs Playwright's full browser; the hidden check uses a smaller one that cannot show a window. When it is missing the card says so and offers the one time download on the person's press, as the browser check's own download does.
- Only a task's check hands over (someone is there to tap). A review's check that runs by itself in Automatic keeps the gap, as today.
- Protocol: command `proof.signIn { agent, choice: "open" | "continue" | "skip" | "getBrowser" }`; event `proof.signIn { agent, stage, percent?, reason? }`, stage one of waiting, needsBrowser, downloading, opened, checking, skipped, timedOut, failed. Fixtures both sides; the shell allows the command.
- Tests first: `runner/test/m75-signin-handover.test.ts` with a stand in window and browser: a wall waits and says waiting; Continue reruns the check with the sign in and a pass is passed; Skip and the wait running out keep passed with gaps, never passed; Stop everything ends it; the profile folder is gone after every ending; the stand in page records no fill, type or press; `m67-signin.test.ts` and `m58-signin.test.ts` stay green untouched.

### 3b. A page that should need a sign in
- `runner/src/proof/privatepages.ts` (new, pure): the project's own private looking pages from its files: Next.js `app/` and `pages/` routes, SvelteKit `src/routes`, plain `.html` files, named dashboard, settings, account, admin, profile or billing; and the plain paths in the project's own `middleware` matcher. Dynamic parts (`[id]`) and API routes are left out. At most five.
- They are looked at only in a project that has a sign in (`knownSignIn`) or its own middleware matcher, so a site with no sign in at all is never told its settings page "should" have one.
- After the page check passes, each one is opened once in the hidden browser with no sign in, only read, nothing pressed. A page that answers, stays on its own address, and shows no password field and no sign in words "loads without a sign in".
- It is a **Worth a look** finding in the fixed finding shape (M58 C1): what is wrong "This page should need a sign in but does not", what it means, how to fix it, and when it may be fine on purpose. A new review reason kind `open_private_page`, level Worth a look, never a stop. On a task's check it is a line on the browser step and on the result.
- New setting `check.privatePages` "Look for pages that should need a sign in" (On), Fixing, More, Checks.
- Tests first: `runner/test/m75-private-pages.test.ts` (which routes are found and which are not; no routes without a sign in; the probe through a real local server with the hidden browser when it is on this Mac: an open dashboard is found, one that sends to a login page is not); `app/src/findingShape.test.ts` keeps every kind shaped.

## 4. Tappable choices when the ask is vague (shortlist 10)

- A vague ask in the ask box ("make it better", "fix it", "clean this up") gets two to four choices before anything runs. Nothing runs until one is tapped (rule 13). Typing more words and pressing Return still works: words that are no longer vague run as usual.
- **Vague** is a small tested rule (`app/src/vagueAsk.ts`), no model: a short ask, every word from a short list of general verbs and filler words, at least one verb, no file name, number or quote. A model call is not needed: the rule covers the examples and a wrong "vague" only costs one tap, since "Do it as I typed it" is always one of the buttons.
- **The choices** come from the project's real state on the page: a failing check (Fix the failing check), the open review's lead finding (Fix what the review found), changes waiting for review (Look over the latest changes), the page (Make the page look cleaner, Make the page load faster), and when nothing is known, Look for problems in my project and Tidy the code without changing what it does. Fix words favour a problem; clean words favour tidying; better words favour the page.
- A tapped choice runs the way its own button does: a task asks first for anything that changes files, a check checks, a review reviews.
- Protocol: none. Every choice is built from what the page already holds, and a tap sends a command that exists. (The shortlist expected new fields; they were not needed.)
- New setting `ask.choices` "Offer choices when an ask is vague" (On), General, More, Home.
- Tests first: `app/src/m75.test.ts` (the examples are vague; specific asks, file names, numbers and long asks are not; two to four choices, each from real state; nothing is sent without a tap; Do it as I typed it is always there).

## Shared files, small additions only
`protocol/index.ts` and fixtures; `protocol/settings.json`, `strings.ts`, `settingsPages.ts`, `runner/test/settings-registry.test.ts`; `runner/src/plan.ts` NEVER_GATED; `app/src-tauri/src/runner.rs` lists and a fixture test; `runner/src/agent.ts` (the cost gate, the handover, the private pages on the result); `runner/src/review/service.ts` and `batcher.ts` (the signal); `runner/src/proof/ladder.ts` and `browser.ts`; `app/src/model.ts`, `card.tsx`, `home.ts`, `settingsPage.tsx`.

## Checks on a real Mac (the founder's hands, one per message)
1. Set up the Claude Code signal in a test project. Ask Claude Code for a small change. The review card comes as Claude Code finishes, not a minute later. Remove it in Settings: the file is back as it was.
2. The same with Codex after trusting the hook in `/hooks`. [verify] that Codex accepts `{}` from a Stop hook and runs a trusted project hook.
3. A long fix: the pause card comes, Keep going goes on, Undo what it did puts the files back.
4. A project with a login: Your turn, Open the sign in page, sign in, Continue: the check passes behind the sign in. [verify] the visible window opens only on the press and takes focus only then (rule 9).
5. A project with a dashboard that opens without a sign in: Worth a look.
6. Type "make it better": choices, nothing runs until one is tapped.

## Status, 6 Nov 2026 (built, not committed)

All four are built end to end with tests, the stand in model and temporary fixture folders only. No real model ran and nothing was spent.

**1. Done signal: built.** `runner/src/donesignal.ts` (plan, add, remove, state, the marker folder), `ReviewService.doneSignal` and `ChangeBatcher.settle` (1.5 second settle), `.codex` ignored by reviews, commands and event in `protocol/` with fixtures m75d1 to m75d3 and m75e1, m75e2, the shell's lists in `runner.rs` with a Rust fixture test, the Fixing page's "Start reviews sooner" group (`settingsPage.tsx` DoneSignalRows, `doneSignal.ts`). Tests: `runner/test/m75-done-signal.test.ts` (the hook command is run for real with a JSON input and ends 0, prints {} and writes nothing of it).
- [verify] Claude Code runs the project's `.claude/settings.local.json` Stop hook in the shape written, and does not mind a hook that never reads its input.
- [verify] Codex accepts `{}` from a Stop hook in `.codex/hooks.json`, and runs it after it is trusted with `/hooks`.
- [verify] macOS file events for Squibby's own `done` folder arrive within the settle time on a real Mac.
- Not built: Delete everything does not remove a hook already added to a project. It then does nothing (the touch fails quietly), and Remove in Settings still takes it out. The user level settings route is not built on purpose (it would have to read the folder from the tool's input).

**2. Cost pause: built.** `runner/src/costpause.ts`, the gate in `agent.ts` (after each booked turn, after the budget check, and before any tool), Undo what it did through the same restore as Undo, `cost.pause`, `cost.resolved` and `cost.choose` with fixtures m75c1, m75c2, m75e3, m75e4, the card in Home's urgent cards, setting `spend.pauseAt` (3 times usual) on the Account page. A line at or past the task's own budget never pauses, since the budget ends the task first. Tests: `runner/test/m75-cost-pause.test.ts`, `app/src/m75.test.ts`. One older test (`followup.test.ts`, a plan's budget) now turns the pause off, since its steps cost far more than a usual task.

**3a. Sign in handover: built.** The ladder's `signIn` hook (the server still runs while the person signs in), `agent.ts signInFor` for a task's check, the window in `browsersetup.ts visibleWindow` (Playwright's full browser, downloaded only on Download it), the sign in passed to the hidden check in memory only (`BrowserOptions.storageState`), `proof.signIn` command and event with fixtures m75s1 to m75s4, m75e5 to m75e7, the card on Home. Tests: `runner/test/m75-signin-handover.test.ts`; `m67-signin.test.ts` and `m58-signin.test.ts` are untouched and green.
- [verify] the full browser's folder name and app name with Playwright 1.64 (`visibleBrowserExecutable`), and its download progress lines.
- [verify] the window opens only on the press and takes focus only then (rule 9).
- [verify] a sign in from the visible window carries to the hidden check's browser (cookies and site storage), including a hosted sign in such as Clerk or Supabase, which the hidden check cannot reach over the internet.
- Not built: the handover for a review's check (nobody may be there) and for Check my project. Both keep the gap, not proven.

**3b. Pages that should need a sign in: built.** `runner/src/proof/privatepages.ts`, `browser.ts openWithoutSignIn`, the ladder's `privatePages`, `proof.result.privateOpen`, the review reason `open_private_page` (Worth a look) with its four parts, setting `check.privatePages` (On). Tests: `runner/test/m75-private-pages.test.ts` (with a real local server and the hidden browser on this Mac).

**4. Vague ask choices: built.** `app/src/vagueAsk.ts`, the ask box in `card.tsx`, setting `ask.choices` (On). No protocol change and no model call: the rule and the page's own state are enough. Tests: `app/src/m75.test.ts`.

Shots: scratchpad `m75-shots/` (wide and tall: cost pause, sign in waiting, opened and needs browser, vague choices empty and with state, the private page finding, the done signal rows and card).
