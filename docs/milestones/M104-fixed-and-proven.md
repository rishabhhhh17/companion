# M104: Fixed and proven, finding by finding

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 18 Nov 2026. Not committed. Nothing is spent: no model call of any kind, no key, no account. Stand in engines, fixtures and temporary folders only.

From "Fixed and proven, finding by finding" (the 15 Nov plan, Part 2).

## Why (from the plan, sources seen 15 Nov 2026)

- It beats CodeRabbit, whose next review "doesn't re-check earlier findings, so a finding that no longer appears isn't confirmed as fixed" (docs.coderabbit.ai/ide/fix-with-ai; `coderabbit.md` section 3 point 4).
  - Do not claim CodeRabbit never runs code: it has runtime verification in closed beta for Deep Scan (its changelog, 23 Oct 2026).
- Squibby already ran the proof ladder and the before and after pictures after every fix.
- The gap: pressing Fix it deleted the review record (`service.ts`), so the rule recheck (`recheck()`) never ran against Squibby's own fix.

What the person gets: after Fix it, the receipt lists each problem as Gone, Still there or Look at it, next to the proof and the before and after pictures. Any problem still there means Not fixed yet, never Proven, with Try again or Undo.

## What to build (from the plan)

1. Keep the review record after Fix it.
2. When the fix task ends, run `recheck()` and `recheckHolds` (rules only, no model) against the task's end checkpoint.
3. Add one line per finding to the receipt.
4. No second model review, because under F29 it would cost money on Squibby's bill.

## Tests first (from the plan)

- The record survives Fix it.
- A fixed finding shows Gone.
- A remaining one blocks Proven.
- No model call is made by the recheck.

## Rules it must hold

Rules 13, 14 and 17. Depends on M100 for customers: until the M100 route is switched on it works only on the developer's own key route, so it is not marketed before then. It runs on any engine behind the task runner, M100's `messages-loop` included, because the check is in the runner, not the engine.

## How it works (as built)

- **The review is kept.** Fix it no longer deletes the review record. It hands the fix's task a check (`ReviewDeps.fix(cmd, check)`); `main.ts` gives it to the runner (`AgentRunner.checkAfter`) under the command's id. A second press while that fix runs is refused in plain words ("The fix for these changes is already running. Wait for its result.").
- **Checked before the receipt.** When the task's last change is saved, and before its receipt and its History row, the runner calls the check with that version and the proof (`agent.ts`). The check (`review/service.ts fixCheckOf`, `review/fixcheck.ts outcomeOf`) reads only the files the rules need from the undo store, never a model, never a script:
  - **Gone:** the rule no longer finds it (a key's line is gone, the removed file's import is gone, the table is closed, the files are back as they were), or a problem about the checks (checks failed, risky with failing checks, said it passed) and the fix's own checks passed.
  - **Still there:** the rule still finds it; a check problem and the fix's checks failed; or a problem about the change as a whole whose files the fix never touched.
  - **Look at it:** the fix changed the files a problem is about, but no rule can check that kind (a written concern, "this changes sign in"), or the checks did not run. Never rounded up to Gone.
- **One still there is never proven.** The receipt carries `rechecked` (the review's batch and each problem's own sentence with its answer, at most 20, masked). The task log keeps `still` (how many), so History says the same. `verdict.ts` has one new row: the checks passed but a problem is still there reads "Not fixed yet. One problem the review found is still there." It does not count toward Free's proven fixes. After an Undo the result is the Undo, as before.
- **Try again or Undo, side by side.** With one still there, the list ends with Try again (Fix it again for the same review, through the same gates: the drive group on, Free's limit) and Undo these changes. Try again asks only for what is still there: the prompt names the open problems, not those already gone. When nothing is still there, the review is closed and nothing more is offered.
- **Home says it, once.** The hero over that result says "signup-page is not fixed yet. One problem the review found is still there." (the Not fixed yet pill over it), not "A check failed". The receipt's own verdict line and the bar's "Undo is ready" step aside, as for every proven or failed result. A result with something to Look at never reads as plainly fixed: the hero says "... fixed, but check these first." (the M85 flagged path).

## Built

- `runner/src/review/fixcheck.ts` (new: `outcomeOf`, `findingsOf`, `stillCount`, `FixCheck`), `runner/src/review/service.ts` (Fix it keeps the record, `fixCheckOf`, `FIX_RUNNING`), `runner/src/agent.ts` (`checkAfter`, `dropCheck`, the check before the receipt, `rechecked` on the receipt, `still` in the log, not counted when still), `runner/src/tasklog.ts` (`still` column), `runner/src/main.ts` (the wiring).
- `protocol/index.ts` (`Receipt.rechecked`, `FIX_OUTCOMES`, `recheckedOk`, `TaskSummary.still`, the receipt check), fixtures `m104e1` to `m104e3` in `protocol/fixtures/events.jsonl`.
- `app/src/fixRecheck.ts` (new), `app/src/recheckList.tsx` (new), `app/src/verdict.ts` (`stillThere`), `app/src/model.ts` (the receipt's `rechecked`, `retrying`, History's `still`, Try again's waits and refusals), `app/src/homeHero.ts`, `app/src/homeRest.ts`, `app/src/card.tsx`, `app/src/strings.ts` (`S.fixRecheck`, `S.verdict.stillThere`, `stillAgo`), `app/src/ui/fix.css` (no new colour: the tags carry the meaning).
- `app/src-tauri/src/runner.rs`: `m104_a_fix_receipt_names_each_problem_checked_again_with_known_words_only`.

## Tests

- `runner/test/m104-fixed-and-proven.test.ts` (13): each problem's answer by its rule (a key's line, the change as a whole, the check problems by the fix's proof, one taken out earlier is looked at again, and keeps Gone only for a problem about the change as a whole); the record survives Fix it and the fix gets the check; a fixed key shows Gone and closes the review; a key still there shows Still there, the review stays, and Try again asks only for what is left; no model call; a press while the fix runs is refused and not written to History; a Try again that puts a key back shows it Still there and the next Try again asks for it; a version that is gone gives no answer, never a guess; end to end with the real task runner, the plan gate and a scripted engine (a fix that takes the key out is Gone, proven and counted; one that leaves it is Still there, kept in History and not counted); the shared fixtures, and every other shape of `rechecked` refused.
- `app/src/m104.test.ts` (6) and `app/dom/m104.test.tsx` (5): the receipt's part of its known shape only and masked again, still there first, the verdict, the receipt and History never proven with one still there, Try again waits and stops waiting on a refusal; rendered, the list, Not fixed yet, Undo beside it, and Try again sends Fix it for that review once; the hero says Still there once (no receipt verdict line, no "Undo is ready" in the bar); all gone with one to Look at is never the plain fixed headline; no follow up box beside Try again; with the checks failed too, exactly one Undo and one Try again.
- No old M104 area expectation changed, except two on purpose after the M104 review: the outcome test "one a newer change had already taken out is gone" now expects Still there for a key line that is back (Gone is kept only for a whole change problem), and the rendered still there test now finds Not fixed yet in the hero instead of the receipt's verdict line. Round 1 (the founder's notch fixes) changed three notch expectations on purpose; see its own record.
- The M104 runner and protocol half landed in commit 9ff4e52 ("Restore: Bring back the approved look"); its test and app half are committed with this record.

## Compared with the best (18 Nov 2026)

Sources: `coderabbit.md`, `heyclicky.md`, `orchestrators.md` (15 Nov research) and the Coucou notes in the 17 Nov plan section.

| | CodeRabbit | HeyClicky | Coucou and notch monitors | Squibby after M104 |
|---|---|---|---|---|
| After a fix, is each finding checked again? | No: a finding that vanishes "isn't confirmed as fixed"; the agent loop re-reviews with the model until clean | Does not review code | Shows that an agent finished, not whether it worked | Yes, each one, by the same rule that found it, before the receipt |
| Is the app run after the fix? | Not after Fix with AI (Deep Scan runtime checks are a closed beta, for security scans) | No | No | Yes: build, tests and the browser check, then the pictures, as before |
| Steps for the person | Fix with AI, pick an agent, wait, review again | Ask, wait | Look at the notch | Fix it once; the answer is on the receipt; Try again or Undo is one press |
| Speed | A re-review takes minutes ("7 to 30+ minutes" in the CLI docs) | Instant chat | Instant | [verify] 3, not measured yet. By design a few file reads from the undo store, no network, no model |
| Words | Engineer findings with severity | Plain | Short status | Plain: Gone, Still there, Look at it, with the review's own sentence |
| Cost | A re-review is another paid review | n/a | Free | Nothing: rules only, nothing on Squibby's bill (F29) |
| Look and motion | GitHub comments and sidebar | Notch cards | Notch ticker | The receipt's existing card in the M71 look, the existing meaning tags, no new motion |

Where we match: one press to fix a finding (CodeRabbit's Fix with AI, its "Fix all issues"); plain status words (HeyClicky); a clear finished state (Coucou).

Where we are better: each finding is checked again after the fix and said one by one, and the app is run; a finding still there blocks Proven instead of disappearing; Try again fixes only what is left; Undo is one press from the same card; it costs nothing and needs no second review.

Gaps closed here:
- The hero first said "A check failed just now" over a fix whose checks passed but left a problem; it now says "Checked again just now: a problem is still there".
- Undo was below the proof, away from Try again; with a problem still there it sits beside Try again (CodeRabbit and HeyClicky keep the next step next to the finding).
- The summary line repeated the verdict when something was still there; it is said once.
- The answers did not line up when tags had different widths; the tags now share one column.
- (M104 review) A result whose only open items were Look at it read "What the review found fixed." with no catch; the hero now says "..., but check these first." (CodeRabbit keeps a needs review state for the same reason).
- (M104 review) Still there was said four times (pill, headline, subline, the receipt's verdict, plus "Undo is ready" in the bar, which ran under Close on the tall Home); the hero now says it once, the receipt does not repeat it, and the bar's line is cut before Close.
- (M104 review) With the checks failed and a problem still there there were two Undo and two Try again buttons doing different things; the review's Try again and Undo under its list are now the only ones, and the follow up box steps aside while something is still there, so Try again is the one next step.
- (M104 review) A Try again that put a key back still showed it Gone, because a problem taken out once was never looked at again. Every line, import and table problem is now checked again on each fix; one found again is Still there and the next Try again asks for it. A refused second press is no longer written to the review's History row.

Gaps left (not this milestone):
- A written concern from the model ("this changes how people sign in") can only be said as Look at it: checking it again would need a model, which F29 puts on Squibby's bill. The founder decides whether a cheap second look is worth it once M100 measures cost.
- CodeRabbit can put its fix in as a reviewable suggestion on a PR; Squibby works on the folder with Undo (M107, "Put it in", covers its fix in the person's own tool).
- The notch does not yet say "1 still there" after a fix; M113's live feed is the place.
- After the engine restarts, the kept review is gone (it lives in memory, as before), so Try again on an older receipt is refused with "Review these changes first"; Review them again, then Fix it.

## [verify]

Each on a real Mac, in a throwaway practice project in a temporary folder (the key practice copy or a fresh one), with the engine on the developer's own key route or the M100 route behind its switch. One run each; the model spend is that run's own.

1. Write `export const k = "sk_live_..."` (a made up key) into a file, Review them, Fix it. The receipt shows the key's line as Gone, the result is Proven, and History's row is Fixed and proven.
2. In the same project, add two made up keys in two files; Fix it; if the fix takes out only one (or stop it after one), the receipt says Still there for the other, the result says Not fixed yet, History agrees, Try again's prompt names only that one, and Undo puts the files back.
3. Time from the fix's last change to the receipt on a large project (a few thousand files): the recheck adds no wait a person would notice.
4. With Reduce Motion on, the receipt and the list appear with no new motion.
