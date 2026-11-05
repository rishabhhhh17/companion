# M58, Fix it means fix, and a first run that shows both jobs

Status: plan only (5 Nov 2026). No product code until the founder approves it.

Sources: the 4 Nov review roadmap (features 8 and 9; UI items 1, 4, 5, 6, 13 and 20) and the inspiration shortlist (items 3, 4, 5, 8 and 9). Read at HEAD 685b890 on `m48/launch`.

## Corrections that win over the roadmap

1. **F29: Squibby pays and picks the model.** Nobody pastes a key or signs in to an AI provider. UI items 2 and 3 ("Add your key to fix it", "ask for the key at the first Fix") are not built. Where the engine is not ready, the found problem stays on screen and one honest line says what is missing, as M69 left it ("Squibby is getting ready on this Mac", with Try again). Nothing asks for a key. What shows before the managed engine is live stays a founder question (M69).
2. **Honest words (M57).** Never credit or blame another tool for edits. In the practice where Squibby plays the AI tool, the words say "the practice's pretend AI", never a real product's name.
3. **F28: no new default hotkeys.** Nothing here adds a key.
4. **Rule 16.** No praise, no streaks, no "Great job". The first run ends on a fact (a key caught, a fix proven).
5. **Rule 10.** Last working, starred and named saves are shadow snapshots only, never git. Rolling back always needs a tap.
6. **Rule 14.** A sign in wall nobody answered is "not proven", never done. A stopped run is never a fix.
7. **M67 sign in detection stays.** Bugs 23 and 24 (`knownSignIn`, `SIGN_IN_GAP`, the 401 and 403 rules in `runner/src/proof/browser.ts`) are built on, not changed. `runner/test/m67-signin.test.ts` stays green untouched.

## Already done (do not rebuild)

- **UI 7, the found problem in plain words:** M69 (point card, `homeHero.ts`). Done.
- **Run list and receipt (M69 item 6):** the steps row and the failed rung named. Area A only adds the try counter and the ladder on top.
- **Stopped runs never count against Free:** `agent.ts` counts a fix only on `status === "done" && proof === "passed"` (`fixes.proven`), and `fixes.ended` gives the place back. Shortlist 9 only adds a test that pins it and the words that say it.
- **The loop breaker:** `work.tries` (usual 3), `failureSignature`, `loop.stuck` with Try a different approach or Stop (`drive.ts`, `agent.ts` about line 1270). Shortlist 4 makes it visible and adds rungs; it does not replace it.
- **Last proven version per project:** `agent.ts setProven` already stores `{ verdict, snapshot }`. Last working reads it.
- **The receipt's `notUndoable` list:** exists in the protocol. Shortlist 5 adds fixed lines beside it.
- **Keep it anyway never silences a stop (M69 correction 4):** unchanged.

## Area A, "fix" (feature 8, shortlist 4, 5, 8, 9, UI 4, 5)

Files: `app/src/card.tsx` (only `fixKnown`, the point card's Fix it, `JobLive`, `FollowUpBox`, the failed and stopped results), `app/src/practice.ts` (`pointFixRoute`, `usesSmallFix`), `app/src/homeHero.ts` (`homeFixRoute` only), `app/src/verdict.ts`, `app/src/model.ts` (the new events), new pure `app/src/fixLadder.ts`, new pure `app/src/savePoints.ts`, `runner/src/agent.ts` (the try loop and stuck choice), `runner/src/drive.ts`, `runner/src/checkpoints.ts` (star and name notes), `runner/src/proof/browser.ts` (hand over only), `runner/src/proof/ladder.ts`.

### A1. Fix it means fix (feature 8, UI 4)
- `protocol/settings.json point.fixWith` usual becomes `smallFix`. Rescue (`rescue`) stays for a problem that is not one line, or nothing specific found. The setting stays, so a person can still pick Look deeper first.
- Pressing Fix it shows "Starting the fix" at once, in the point card's place. The found problem (title, file and line, the pointed code) stays on screen until the engine's first event for that agent (`agent.state` working, `checkpoint.created` or `agent.tool`). Today `fixKnown` sends `ui.pointClosed` first, so the card goes blank. New model field `point.fixing: agent` instead of closing; it clears on that first event, or on a refusal (then the problem stays, with the reason).
- Engine not ready (F29): Fix it keeps the problem and shows the M69 line "Squibby is getting ready on this Mac" with Try again. No key words.
- When there is a plan card, Start the plan and What I found go above the step fields.
- Words: `S.fix.starting` "Starting the fix", `S.fix.startingLine` "Saving a safety copy first."
- Tests first: `fixRoute.test.ts` (line problem gives smallFix with the usual setting; no line gives rescue; practice route unchanged); `fixStart.test.ts` on the model (Fix it keeps the point, sets fixing, first event clears it, a refusal keeps the point); `settings-registry.test.ts` for the new usual.

### A2. "Try 1 of 3" and a fixed ladder (shortlist 4)
- The counter: "Try 1 of 3" from `proof.result.tries` and a new `of` (the task's `work.tries`). The card never guesses the limit.
- The ladder, shown as three quiet rows under the run list, the current one marked:
  1. Try again, with the error in plain words (the existing fix rounds).
  2. Look up this exact error (only when `work.webSearch` is on; hidden, not greyed, when off). Runs the existing read only `research` lane on the failing check's words (redacted by `followup.ts evidence`), then one more fix round with the notes.
  3. Go back to Last working and plan. Asks first (an approval style card: "Put your files back to Last working (2:14 pm)? You can undo this."), then starts Rescue from there. No Last working: this rung says "No working version saved yet" and offers Look deeper instead.
- The stuck card's options grow from `different | stop` to `different | research | lastWorking | stop`. `research` only when web search is on.
- UI 5, after a failure: one next step in view. Order: the verdict, Try again (main), Undo, then the changes and checks. "Still failing after 2 tries" moves into the subline. The inline "What is still wrong?" box becomes a quiet button that focuses the main ask box with the task attached.
- Protocol: `proof.result.of?: number`; `loop.stuck.rung?: "retry" | "research" | "lastWorking"`; `loop.choose.choice` adds `"research"` and `"lastWorking"`. Fixtures in `protocol/fixtures/commands.jsonl` and `events.jsonl` for both Rust and TypeScript.
- Words: `S.fix.tryOf(n, of)` "Try 1 of 3", `S.fix.ladder` rows "Try again with the error explained", "Look up this exact error", "Go back to the last working version and plan", `S.fix.stillFailing(n)` "Still failing after 2 tries".
- Tests first: runner `drive.test.ts` (the options list with and without web search, never research when off); runner `agent-ladder.test.ts` on the stand in model and a temporary fixture folder (a failing check three times gives `loop.stuck` with the rungs; `lastWorking` restores only after the confirm; `research` refused when off); `fixLadder.test.ts` (rows, current rung, counter); `followup.test.ts` (Try again fits the 480 point Home, the box is gone, the button focuses the ask box).

### A3. Last working, starred and named saves (shortlist 5)
- Last working: the snapshot in `setProven` with verdict `passed`. Shown in History and in the Undo menu as "Last working, 2:14 pm".
- Star or name any save point in History. Kept in the store's own notes (`checkpoints.ts note/setNote`, never the project, never git). A starred or named save is a prune guard, so it is never pruned.
- Undo line, fixed and plain, under every Undo: "Undo puts your files back. It does not bring back a database, a live site, emails sent or installed packages (node_modules)." Added to whatever `notUndoable` already names, never a duplicate.
- Rolling back to any save needs a tap and makes its own safety copy first (as `checkpoint.restore` already does).
- Protocol: `TaskSummary.lastWorking?: boolean`, `TaskSummary.star?: boolean`, `TaskSummary.name?: string`; new command `checkpoint.mark` `{ project, checkpoint, star?: boolean, name?: string }` (name at most 40 characters, cleaned). Fixtures for both sides.
- Tests first: runner `checkpoints-mark.test.ts` (mark, read back, survives a restart, guards prune, never touches the project's `.git`: the fixture's git log is the same before and after); `savePoints.test.ts` (Last working label, the Undo line once, names cleaned); protocol fixtures.

### A4. Sign in wall hands over (shortlist 8)
- Today a sign in wall is a gap (`SIGN_IN_GAP`) and the check ends. New: the step carries `needs: "signIn"` and the card says "Your turn: sign in, then tap Continue, or skip this check."
- Continue opens a visible browser window on the page, from a fresh temporary profile in Squibby's own folder. The person signs in there. Squibby never types, never reads the fields, never solves a CAPTCHA. Continue again runs the browser check once in that profile, then the profile is deleted.
- Skip, or no answer before `point.yourTurnSeconds`, keeps the gap: "not proven", never done. `yourturn.rs` is the pointer's click wait and is not used for this; the wait time reuses its setting only.
- [verify] that a headed Playwright window from the runner opens without stealing focus beyond the click the person made (rule 9), on a real Mac.
- Protocol: `ProofStep.needs` adds `"signIn"`; new command `proof.signIn` `{ agent, choice: "open" | "continue" | "skip" }`. Fixtures for both sides.
- Tests first: `m67-signin.test.ts` unchanged and green; new runner `signin-handover.test.ts` (a sign in wall gives `needs: "signIn"`; skip and timeout give `passed_with_gaps`, never `passed`; the temporary profile is gone after; no fill or type call on the page, pinned by a fake page); page test that the card never says proven while it waits.

### A5. Stopped leaves Undo ready (shortlist 9)
- After Stop everything, a stopped run that changed files shows "Undo what it did" as the main button, ready. One tap, never automatic.
- Its line says "This run does not count as a fix."
- Tests first: `verdict.test.ts` (stopped with changes: Undo is main; with no changes: no Undo); runner test that a stopped task never calls `fixes.proven` (pins today's code); page test that no restore is sent without the tap.

## Area B, "first run" (feature 9, UI 1, UI 20)

Files: `app/src/onboarding.ts`, `app/src/onboarding.tsx`, `ui/onboarding.css` (or the first run's block of `app/src/style.css`), `app/sample/practices.json`, new `app/sample/stuck-key/`, `app/src-tauri/src/practice.rs` (catalog only), `runner/src/proof/practicerun.ts`, new `runner/src/practicekey.ts`, `app/src/practice.ts` (the new practice's stages only), `app/src/reviewCard.tsx` (the wording slips only), `app/src/model.ts formatUsd`.

### B1. Hello names both jobs
- Hello title stays M69's welcome. The line becomes "I look over every change your AI makes, and fix what breaks." (`S.screens` block.)
- Optional "Which AI do you build with?" chips: Lovable, Bolt, Replit, Cursor, Claude Code, Something else, Skip. It only picks a tip (which lesson to show first, which "copy for my AI" wording). Stored as `you.buildsWith`, never sent anywhere, Forget in Settings.
- New setting `you.buildsWith`: `protocol/settings.json` (choice, usual empty, scope app, pages only), `strings.ts set`, `settingsPages.ts` (General, under Show all options), `runner/test/settings-registry.test.ts`.

### B2. A practice where Squibby plays the AI tool (the sixth practice)
- New catalog entry `key` (`stuck-key`, order 0 so it comes first in the first run; the others keep their order). The copy is a tiny page project.
- On Start, the runner (no model, a fixed script in `practicekey.ts`) writes one file into the practice copy as "the practice's pretend AI": a made up key in the shape of a payments key, clearly fake (a fixed test value that no provider issues). Only inside a folder that `practice.json` records as a practice copy; refused anywhere else.
- The review (M52 watcher) catches it as `secret_in_code`, the card shows the stop, Fix it, Keep it anyway and Copy for my AI (Send back). The first run waits on that card. No model, no sign in, no cost.
- Fix it in this practice is a fixed move (the key goes to `.env.local`, the code reads it), shown with the receipt and Undo, also without a model. The other five practices keep their model fix.
- Words: "The practice's pretend AI just changed a file." and "Squibby stopped it: a secret key is written into the code." `S.practice.key*`.
- Tests first: Rust `practice.rs` tests (catalog order, the new entry, copy names); runner `practicekey.test.ts` (writes only into a recorded practice copy in a temporary folder; refuses a normal folder; the value is the fixed fake one); runner review test that the written file gives `secret_in_code` with a stop rating; `onboarding.test.ts` (the practice is reachable from both screens, the review card shows, no key or cost words); `writing.test.ts` bans a real tool's name as the doer.

### B3. Keep Fix it in view (UI 1) and the first run parts
- The check screen's buttons pin to the bottom like the other screens. The four folds (Make it yours, More tools, How you like things, Keys) show only after Fix it or Go to my project, or behind one "Set up more (optional)" link.
- Test first: `onboarding.test.ts` or `layout.test.ts`: Fix it's top plus height fits in 480 points with the folds closed; folds hidden until the link.

### B4. Small wording slips (UI 20)
- "About less than 1 cent" becomes "Less than 1 cent" (where any cost is still shown to a developer; customers see none under F29).
- A passing card is titled "Checks pass" and names the real button, "Look at my screen".
- More ways to ask shows each way's one line when it opens (the `more-desc` line shows the first way's words, not a blank).
- Tests first: `writing.test.ts` (no "About less"), `homeWords.test.ts` (passing title), `askChips.test.ts` (the line is filled on open).

## Area C, "findings and going live" (shortlist 3, UI 6, UI 13)

Files: `app/src/review.ts`, `app/src/reviewCard.tsx` (findings body; Area B touches only its wording slip), new pure `app/src/findingShape.ts`, `runner/src/review/words.ts`, `runner/src/review/look.ts` (read only use of `STOP_KINDS`), `app/src/card.tsx` (only the ship gates panel and `OnlineBox`), `runner/src/ship/deploy.ts`, `runner/src/ship/gates.ts`, new `lessons/vercel-sign-in.json`.

### C1. A fixed shape for every finding (shortlist 3)
- One readiness line on top: "Ready", "Check these N things", or "Not safe yet". Never Ready over a stop, failed checks or checks that did not run (rule 14).
- Each finding is Must fix, Should fix or Worth a look. Mapped in code: STOP_KINDS are Must fix; `secret_file_changed`, `touches_risky`, `signed_in_open`, `house_rule_ask` Should fix; the rest Worth a look.
- Each finding has four short parts: what is wrong, what it means for you, how to fix it, when it may be fine on purpose. Fixed sentences per reason kind in `strings.ts`, no model. "When it may be fine" is left out for Must fix kinds that never are (a key in code).
- No number score anywhere.
- Protocol: none. The shape is built on the page from `ReviewReason.kind`.
- Tests first: `findingShape.test.ts` (every kind in `REVIEW_REASONS` has a level and all four parts or a deliberate gap; readiness never Ready with a stop, failed or unchecked; N counts what is listed); `review.test.ts` order (Must fix first).

### C2. Going live has a finish line (UI 6)
- When every gate passed, the gates panel gets a main "Put it online" button that reuses the check that just passed (no second check of the same version).
- A blocked gate gets its own Fix it, through the same route as Area A (the found problem stays on screen).
- Tests first: page test (all passed: the button, and it sends the deploy with the passed version; one blocked: Fix it on that row, no Put it online).

### C3. Sign in to Vercel without Terminal (UI 13)
- `NOT_SIGNED_IN` stops saying "Open Terminal". The card shows "Sign in to Vercel" as a step the person starts. It runs the person's own `vercel login` as a visible step, with one line first: "Your browser opens Vercel's own sign in page. Squibby never sees your password." Squibby never reads or stores the Vercel login.
- If that cannot run, a short lesson (`lessons/vercel-sign-in.json`) shows it step by step.
- Check again is the person's tap, never a timer.
- Protocol: new command `ship.signIn` `{ project }` and event `ship.signIn` `{ project, stage: "opened" | "done" | "failed", reason? }`. Fixtures for both sides.
- Tests first: runner `deploy-signin.test.ts` with a fake Vercel tool (runs only on the command, never at launch; no token read; the Terminal words are gone); `lessons.test.ts` for the new lesson.

## Shared files, small additions only

- `app/src/strings.ts`: A adds a `fix` block after `fr`; B adds to the end of `fr` and `screens` and a `practice.key*` group; C adds a `finding` block after `review`. No edits inside another area's block.
- `ui/tokens.css`: none expected. If a level colour is needed, C adds three tokens at the end of the status block, in both themes.
- Motion: only the M66 tokens.
- `protocol/index.ts` and `protocol/fixtures/*`: each area adds its own types and checks at the end of the matching list. A: `proof.result.of`, `loop.stuck.rung`, `loop.choose` choices, `checkpoint.mark`, `ProofStep.needs` signIn, `proof.signIn`, `TaskSummary` marks. C: `ship.signIn`. B: none.
- `protocol/settings.json`: A changes the usual of `point.fixWith`; B adds `you.buildsWith`.

## Founder questions

- Sign in handover: keep the person's sign in only for that one check (the plan), or remember it per project until they forget it?
- What shows before the managed engine is live (open from M69). This plan keeps today's honest line.

## Hands on checks for the founder (one per message)

1. Open a practice, find the problem, press Fix it. "Starting the fix" shows at once and the problem stays until the work starts.
2. Make a fix fail twice. The card says "Try 2 of 3", shows the ladder, and Try again is the one main button.
3. Turn off Let tasks search the web. The ladder has no "Look up this exact error".
4. In History, star a save and name it. Restart the app. Both are still there.
5. Press Undo. The line says what Undo does not bring back.
6. Start a fix and press Stop everything. "Undo what it did" is ready and nothing is undone until you tap it.
7. Check a project with its own login. The card says "Your turn: sign in". Skip it. The result says not proven.
8. Fresh first run. Hello says both jobs. The key practice catches the pretend key, and Copy for my AI is there. No key or sign in asked.
9. On the first run's check screen, Fix it is in view without scrolling.
10. A review with several findings shows the readiness line and Must fix first.
11. With every gate passed, Put it online is the main button.
12. Not signed in to Vercel: Sign in to Vercel opens Vercel's page in your browser, with no Terminal.

## Order of work and checks

Areas A, B and C can run side by side; they touch different files except the shared ones above. In each: tests first, then code. After each: `cd app && bun run test` and `bun run typecheck`; `cd runner && bun test` on touched files plus `test/protocol.test.ts` and `test/settings-registry.test.ts`; `cd app/src-tauri && cargo test` when Rust changed (B, and the fixtures). `CHANGELOG.md` in plain words. Every runner test uses the stand in model and temporary fixture folders, never a real project or its git, never `bypassPermissions`.


## Review fixes of 5 Nov 2026 (step 3): what was built, rejected or left open

Built, each with a test first (`app/src/m58-review3.test.ts`, `runner/test/deploy-signin.test.ts`, `app/src/runList.test.ts`):

- Stuck card: the hero says "Pick one of the choices just below." (not the ask box); the card's title is for VoiceOver only; the ladder's current row is the main button's step in the same words (`stuckRung`, row 1 now reads "Try a different approach"); a saved version with no known time shows no "(Last working)" bracket.
- Fix it pressed: Home is in the working mode, says "Fixing it" with "Saving a safety copy first.", is not Needs you, has Stop, no Close, and the "Fix what the check found" chip waits.
- Working card: one counter (a retry shows the try, not "2 of 4" too); the clock never reads less than the listed checks; the safety line promises no Undo button.
- Go live and Home agree (`goLiveAnswer`): checks pass, or not ready to go online, never "Not checked yet" over the go live card.
- Finished practice: Next is the one main step, Undo is quiet, the rest sits under More with a line on what each does; the key practice says Found it once; Skip the practice is a quiet button; the tall Home's title is not repeated.
- First run: Continue sticks to the bottom; the which AI question is behind one link; the check button says "Look for problems in my-shop" with "I read your files and run your tests."
- History: marks are tags, Last working has a one line hint, Remove star looks like Star.
- Review card: the title is the headline only, what it means is its own paragraph, the lead finding shows how to fix it and when it may be fine on the card, and a key in the code closes with "Leave the key in the code" (never "Keep it anyway").
- Browser check stopped at a sign in page: its proof tick is unfinished ("Browser check: stopped at the sign in page"), the page says the result once with "Sign in to check the rest.", no "Your turn" wording until a handover exists, "Carry on" steps back to secondary after Stop with Undo ready, and the line under a headline wraps balanced.
- Vercel sign in: Check again runs the check before going live only (no preview deploy); `ship.signIn` takes `stop: true` to end a waiting login (protocol, fixture `m58r1`, runner `signIns`), shown as Stop signing in in place of Close; the old "Press Sign in to Vercel" line is hidden after the press; the done line says "Vercel's sign in finished."

Rejected or only partly done, with the reason:

- "Show a disabled Look up this exact error when search is off": rejected. The plan and `drive.test.ts` say hidden, not greyed, and the shot only had search on.
- Raw compiler error as the Fix it headline in plain words: not changed here. That is M69's found problem wording (done); the shot stub sent a raw message. While the fix starts the headline is now "Fixing it".
- Cards cut under the composer: rejected as a bug. The work scrolls under the composer by design (a hairline marks it, M69), and the "-bottom" shots show the last card in full at the end. Pinning the primary action of every attention state above the fold is not built.
- "Hide the empty practice card once a check exists" and an "I signed in, check again" button on the sign in wall: not built. The sign in handover (`proof.signIn`, Continue and Skip, a temporary browser profile) of A4 is still not built, and stays [verify] for a headed browser that does not take focus (rule 9).
- A real Vercel session check (`vercel whoami`) in place of the login file test: not built; the done line only says the sign in finished. [verify] with the current Vercel tool.
- The "Last task:" prefix stays in general (M51 founder polish); only the sign in wall case says the result once.
