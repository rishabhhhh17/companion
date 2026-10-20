# Eval sets

Quality suites for Companion. Each set is a list of cases kept as data, a runner script, a scorer and a results file.
Every set is **dry by default**: nothing is spent until you add `--spend`.

Built in M11 wave 3 (`docs/milestones/M11-wave3-plan.md`, part A.5), so that when the founder's key is in, the paid time is only running them.

## The sets

| Set | What it measures | Cases | Run it |
|---|---|---|---|
| `fix-projects` | The hero: Point at the problem, then a fix task through Companion's runner, then the proof ladder. Judged by the project's own checks and by hidden checks, never by matching text | 25: the 15 rescue projects plus 10 AI builder breakages | `bun run evals/fix-projects/run.ts` |
| `loop-breaker` | Whether the loop card appears at the right time, and whether "Try a different approach" rescues the task (or, where only the person can decide, whether it stops and asks) | 5, each built to defeat the first fix | `bun run evals/loop-breaker/run.ts` |
| `review-catch` | The second model review (`COMPANION_REVIEW`): catches and false alarms | 10 seeded diffs: 5 risky, 5 harmless | `bun run evals/review-catch/run.ts` |
| `explain` | Explain on real changes: correct, plain words, two lines, a fair check question (`explain/RUBRIC.md`) | 24 (the fix cases' known good changes) | `bun run evals/explain/run.ts` |
| `show-me-how` | The aim eval's hard set (four synthetic busy dashboards in light and dark) and everyday set (nine synthetic everyday app windows, asked as a tutor for each app), labelled targets, rendered in the hidden browser | 40 hard asks and 40 everyday asks (plus the aim eval's 48 basic ones) | `cd runner && bun run scripts/eval-aim.ts --set hard` (or `--set everyday`) |
| `rescue-projects` | The locator alone, no model (older, free, part of `test-all.sh`) | 15 plus the 5 practice projects | `cd evals/rescue-projects && bun test` |
| `prompt-help` | Prompt help rewrites (older) | 30 | `cd evals/prompt-help && bun test` |

All commands run from the repo root unless they say otherwise.

## Running each set

Run every set dry first (free, no model, no network). Spend only when the founder says go, and only after the smoke test (`cd runner && bun run scripts/smoke-real.ts --spend`) has passed. The key is read in code from the Keychain item `companion-dev` (`COMPANION_KEYCHAIN_SERVICE` names another), never typed or printed; see `docs/milestones/M11-real-run-checklist.md`, step 1, for how to store it.

| Set | Dry (free) | Spend | One case, estimated | Stops by default |
|---|---|---|---|---|
| `review-catch` | `bun run evals/review-catch/run.ts` | `bun run evals/review-catch/run.ts --spend` | $0.05 (Opus 5.5) | $0.20 a case, $1.50 in all |
| `explain` | `bun run evals/explain/run.ts` | `bun run evals/explain/run.ts --spend` (again with `--fast-model claude-haiku-5-5`) | $0.003 to explain (Haiku 4.5) plus $0.01 to grade (Sonnet 5.5) | $0.05 a case, $1 in all |
| `fix-projects` | `bun run evals/fix-projects/run.ts` | `bun run evals/fix-projects/run.ts --spend` | $0.22 (Sonnet 5.5; $0.61 if nothing is cached) | $0.75 a case, $8 in all |
| `loop-breaker` | `bun run evals/loop-breaker/run.ts` | `bun run evals/loop-breaker/run.ts --spend` | $0.47 (Sonnet 5.5; $1.51 if nothing is cached) | $1.50 a case, $5 in all |
| `show-me-how` (the aim eval) | `cd runner && bun run scripts/eval-aim.ts` (prints what a spend run of the same asks would cost) | `cd runner && bun run scripts/eval-aim.ts --spend` (again with `--lane computer_use`) | $0.02 an ask (Sonnet 5.5), $0.0008 (Haiku 5.5); all 128 asks about $2.19 on Sonnet 5.5 | $0.05 an ask, $6 in all |

The estimates come from the table in "What a case costs" below. A spend run prints each case as it finishes, writes its results file to the set's own `results/` folder, and exits with code 1 if a refusal or a spending stop took any case out of the rates (code 2 if it could not start at all, for example with no key in the Keychain item; nothing is spent then).

## Dry and spend

**Dry (the default).** Every model is a stand in that plays back the case data: the known good fix, a first approach that keeps failing then the right one, the labelled review answer, the reference explanation. The rest is real: Companion's runner (its snapshots, safety rules, proof ladder and loop card), the project's own checks, the hidden checks, the scorer and the results file. A dry run proves the wiring, that every case is broken as it says, that every case can be solved, and that the scorer tells right from wrong. **It says nothing about how good Claude is.** Dry runs cost nothing, and reach no network unless you ask the aim eval for its older public website pages (`--real`). Their tests are part of `scripts/test-all.sh`.

**Spend.** Add `--spend` (on its own: `--spend=false` or any other value after it is refused, never read as a yes). Every set then asks Claude through one module, `evals/lib/harness.ts`, whose `realHarness()` is built on the real run harness every script that spends the key uses (`runner/scripts/realrun-harness.ts`): the SDK's bundled binary, the key read from the Keychain in code and never printed (it is hidden in every note, line and results file), a throwaway `CLAUDE_CONFIG_DIR` removed at the end, a short plain environment so no shell setting changes the request, `settingSources: []`, `strictMcpConfig`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, never `bypassPermissions`, a check that `system/init` lists only the expected tools, and its spending stops (below). Agent sessions and the reviewer run on Companion's own engine (`SdkEngine`), Explain and the grader on the app's fast lane, pointing on the app's vision lane (or the Computer Use lane), each with the harness's guarded query, so every request is built exactly as the app builds it. With no key in the Keychain item, `--spend` refuses before any case starts and exits with code 2. **Nothing in this folder has been run against real Claude yet.** The harness is tested with stubbed queries only (`evals/lib/real.test.ts`).

Options every set takes:

```
  (no flag)          DRY: stand ins play the case data back, nothing is spent
  --spend            really call Claude, through the real run harness
  --only a,b         run only these case ids
  --per-case 0.6     the most one case may spend, in dollars
  --total 8          stop starting new cases once this much has been spent, in dollars
  --out file.json    where the results file goes
  --agent-model id, --review-model id, --fast-model id, --vision-model id, --aim-model id, --grader-model id, --diagnose-model id
```

Set options: `fix-projects` takes `--flow rescue` (the app's own Fix it with me path: Rescue's diagnosis, then every step of its plan), `--split train` or `--split test` (12 and 13 cases, for prompt work), `--hard` (the 12 hardest, for the model sweep), `--on-stuck stop` and `--review`. `loop-breaker` takes `--on-stuck stop`. The aim eval takes `--set basic|hard|everyday|all`, `--tutor off` (the everyday set without the tutor's words, to compare), `--lane computer_use` (the experimental pointing lane, on `--aim-model`, falling back to the vision lane as the app does) and `--count n` (or a number on its own; a number after a flag that takes a value, such as `--total 6`, is that flag's). It also reads the app's own settings for these lanes, `COMPANION_AIM=computer_use`, `COMPANION_VISION_MODEL` and `COMPANION_AIM_MODEL`; a flag wins over them.

**What each request asks of its model.** One place decides it: `runner/src/models.ts` (`thinkingFor`, checked by `requestProblems`), the same rules the app uses. The eval sets keep no rules of their own (a test checks it). Explain and the grader go through the harness's `ask()`, which is the app's fast lane exactly as it sends Explain: thinking off on Haiku 4.5, adaptive thinking at low effort on Sonnet 5.5, Opus 5.5 and Haiku 5.5 (`models.ts` says why for each). The vision lane asks the same way. Agent sessions and the reviewer ask for medium effort on the 5.5 models. The Computer Use lane's one network call goes only to the Messages API, and is refused before it leaves if its request is not one its model takes. These are the documented rules, not yet seen against the live API: the smoke test proves them first.

## Spending stops

- **Per case.** Each case gets its own cap (`--per-case`). The agent's budget is set to it, and the real engine is told what the case has left as its spending limit (the SDK's `maxBudgetUsd`). Inside one round of work that limit is the only stop: the real engine reports a round's cost only when the round ends, so the eval cannot see it grow turn by turn. The SDK checks its limit between its own turns, so a round can end a little over it; the eval counts that cost too, whether the round finished or was stopped at the limit. Between rounds (a retry after a failed check, the next step of a plan) the eval starts no new round once the case is at its cap. A single call for Explain, the grader or pointing is checked before it starts and can go over by that one call (a cent or two).
- **The harness's own stops.** On top of that, the real run harness counts every query while it runs, from the token counts of each reply, against the same per case cap and the run's total. Past either, it aborts the query in flight, ends the case at once (its signal stops everything, as Stop does), and nothing new starts in it. No query is ever sent outside a case.
- **Cumulative.** Once the run has spent `--total` (by the larger of the two counts), no new case starts. The cases not started are in the results file as `not_started`, with the reason.
- **A stop is never a score.** A case cut short by a spending stop is `stopped`, and a case the harness refused (an option or a `system/init` that breaks a rule) is `refused`, with the reason first in its notes and what it would otherwise have been scored as in `detail.wouldHaveBeen`, whatever the case itself made of the error ("no answer", "not fixed", "not graded"). Every set counts them on their own and leaves them out of every rate, and its summary line starts with "Not a clean run". A refusal ends the run, since it would only repeat. In the aim eval any stop ends the run and nothing is scored; a pointing lane that fails for another reason is an `error`, counted apart from the misses.
- These count Companion's cost estimates. The hard stop is still the workspace spend limit in the Anthropic Console (M11: a separate key with an $80 limit).

Default caps: fix-projects $0.75 a case, $8 in all; loop-breaker $1.50 and $5; review-catch $0.20 and $1.50; explain $0.05 and $1; the aim eval $0.05 an ask and $6. Opus runs on fix-projects need `--per-case 1.25`.

## What a case costs

**These are estimates**, made before any paid run from guessed token counts and the published prices per million tokens (input / output): Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50, Haiku 4.5 $1 / $5. A cache read costs $0.20 on Opus 5.5 and Sonnet 5.5; on the two Haiku models it is assumed at the usual tenth of input. Input written to the cache costs 1.25 times input. Thinking counts as output. An agent turn re-reads about 20,000 tokens of Claude Code's own instructions and tools, so the agent sets lean on the cache. The token guesses are in `evals/lib/prices.ts`; the first paid run replaces them with measured numbers (each results file records real tokens and cost per case).

<!-- This table is printed by `bun run evals/lib/prices.ts`; a test checks the two match. -->
| Set | One case | With the cache | Without it | Cases | Whole set |
|---|---|---|---|---|---|
| fix-projects | a fix task (Sonnet 5.5, the app's default) | $0.22 | $0.61 | 25 | $5.49 |
| fix-projects | the same on Opus 5.5 | $0.39 | $1.22 | 12 | $4.72 |
| fix-projects | the same on Haiku 5.5 | $0.01 | $0.03 | 25 | $0.27 |
| loop-breaker | a task that must break a loop (Sonnet 5.5) | $0.47 | $1.51 | 5 | $2.33 |
| review-catch | one second model review (Opus 5.5) | $0.05 | $0.05 | 10 | $0.50 |
| explain | one explanation (Haiku 4.5, the app's default) | $0.0032 | $0.0032 | 24 | $0.08 |
| explain | one explanation (Haiku 5.5, which thinks by default) | $0.0006 | $0.0006 | 24 | $0.01 |
| explain | grading one explanation (Sonnet 5.5) | $0.01 | $0.01 | 24 | $0.36 |
| show-me-how | one pointing ask (Sonnet 5.5) | $0.02 | $0.02 | 40 | $0.68 |
| show-me-how | one pointing ask (Haiku 5.5) | $0.0008 | $0.0008 | 40 | $0.03 |
| show-me-how | one everyday pointing ask, as a tutor (Sonnet 5.5) | $0.02 | $0.02 | 40 | $0.69 |
| show-me-how | one everyday pointing ask, as a tutor (Haiku 5.5) | $0.0008 | $0.0008 | 40 | $0.03 |

The aim eval with every page (`--set all`, 88 asks) costs a little over twice the hard set's line. An Explain run costs its explanation line plus the grading line.

## The order to run them in

Run every set dry first; all must be green. Then spend, cheapest first, so a problem with the harness costs cents, not dollars:

1. **The smoke test**, `cd runner && bun run scripts/smoke-real.ts --spend` (about $0.75, stops at $1): every lane accepts its request on its default model, through the same harness.
2. **review-catch** on Opus 5.5 (about $0.50). One turn per case, so it checks the harness's single answer path. Decides whether to turn review on by default for risky changes.
3. **explain** on Haiku 4.5, then on Haiku 5.5 with `--fast-model claude-haiku-5-5` (about $0.45 each with grading). Decides the fast lane's model (Haiku 4.5 may retire after 15 Oct 2026).
4. **fix-projects** baseline on Sonnet 5.5 (about $5.50, cap $8).
5. **loop-breaker** on Sonnet 5.5 (about $2.30, cap $5).
6. **fix-projects sweep**: Haiku 5.5 on all 25 (about $0.30), then Opus 5.5 on `--hard` with `--per-case 1.25` (about $4.70). Pick defaults by cost per fixed case, not cost per request.
7. **The aim eval** (`--set all`) on Sonnet 5.5 (the app's default, about $1.50) and on Haiku 5.5 with `--vision-model claude-haiku-5-5` (about $0.07); then the Computer Use lane with `--lane computer_use` against the vision lane's snapped hit rate.
8. Prompt work on `fix-projects --split train`, one final run on `--split test`, then the final regression.

## How each set is judged

**fix-projects.** For each case: Point at the problem runs the project's checks as it is (no model) and must find the case's place. A fix task gets what it found (the failed check, what happened, the place) and the request "Find the cause and fix it with the smallest change. Do not change the tests." Then the project's checks run again with no model, and the hidden checks in `fix-projects/hidden/` run on the result. They are kept outside the projects, so a fix cannot see or weaken them, and they test what the code does, so any correct fix passes. Outcomes:
- `fixed`: the checks pass and every hidden acceptance check passes, and nothing broke.
- `not_fixed`: anything less. When the checks passed but a hidden check did not, the results say "proof fooled" (for example a test edited to pass).
- `broke_something`: a check that passed before the fix fails after it: a hidden guard, one of the project's own checks, or a single test (each test is read by name from `node --test` or pytest before and after, so breaking another test of a check that was already failing is seen).
- `asked` and `invented`: for a case that needs something only the person has (a setting's value), whether it asked for it and made nothing up. Asked is scored from what the person would see: the last receipt's own words (`said`, the agent's last message after its last tool, as the card shows it) must have a sentence that is a question and names what is needed, and the task must have ended as needs you (`asks`; an offer of more work or a check in at the end, such as "Want me to add a test?", never is, and after checks that failed only a question naming something only the person has is, `runner/src/asks.ts`). What the harness heard the agent say along the way, the reviewer's words and a read only plan do not count.
- `cannot_run`: this Mac lacks a tool the case needs (the Flask case needs Python with flask and pytest). Never counted as a failure.
- Also recorded: whether the problem was found in the right place, cost, turns, tokens, the first round's tokens (`firstRound`: what the instructions and tool definitions cost on every request, so a leaner setup shows up), time, the size of the change (files, lines added and removed), test files changed, approvals asked for (the eval answers no), the approval cards during the fix and the tasks they came in (`approvalCards`, `tasks`; the summary line gives approval cards per task), and whether the loop card appeared.

Every acceptance check fails on the project as it is, and every guard passes on it (a test checks this), so "fixed" never rests on the project's own checks alone. The four TypeScript cases are type errors only, so their programs run before the fix too: their acceptance check runs the strict type checker itself and refuses `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `any` and `as unknown as`. The open Supabase table's check also needs every rule on the notes table to keep each person to their own notes: turning row level security on with no rule (nobody sees their notes) and a rule that says `true` for signed in people (everyone sees everyone's notes) both score not fixed.

The 15 rescue projects have no package list of their own, so the eval adds a `package.json` whose check is the rescue eval's own command. The 10 AI builder breakages are small projects with no packages to install: a setting read under the wrong name, a wrong API address, an import of a renamed file, a Supabase table with no row level security, a failing test after a function's shape changed, a Next.js client component used as a server one, a Vite setting without the `VITE_` prefix, a misspelled CSS class that hides a button, an off by one in pagination, and a Flask route that answers the wrong status. The Next.js and Vite cases imitate those tools' own rules and words with small local checks, because their packages cannot be installed offline. A case's `.env` is written from its case data at run time, because settings files are never committed.

**loop-breaker.** The person's request runs as a task. The card is judged `right` when it appears right after the third check that failed the same way (the runner's own rule: numbers do not make two failures different), `not_needed` when it rightly never appears, and `missed` or `wrong` otherwise. When it appears, the eval presses "Try a different approach". Outcomes: `fixed_first`, `rescued`, `asked`, `gamed` (Companion's check at the end of the task, or the final check, passed but a hidden check did not), `invented`, `broke_something`, `thrashed` (six checks without a fix) and `gave_up`.

The flaky case is really flaky: saving an order does not hand back its promise, so the test passes only on runs where saving happens to be quick. One run in four is quick, in a fixed order counted in the copy's `node_modules/.cache` (which Companion's snapshots leave out), so every run of the eval sees the same order: the first three checks fail the same way and the card appears, and the fourth passes whatever was changed. Saving waits for turns of the event loop, not milliseconds, so which runs pass never depends on how busy the Mac is (when it used timers, a slow run sometimes passed by luck on a busy Mac, and the case scored the wrong way; a test now starts every timer late and the order holds). A change that does not fix it can therefore pass once by luck, which Companion's own proof calls done. The final check (the fifth run, slow again) and the hidden check (with a slow disk) catch it, and the results call it `gamed` with "passed once by luck". In a paid run the agent's own test runs move the order on, as a real flaky test would.

**review-catch.** A scripted agent makes exactly the seeded change in a small shop project, with the review on. Risky diffs: a live key written into code, a database rule opened to anyone, an order check that lets any signed in person change any order, a charge divided by 100, and a clean up that deletes paid orders too. Harmless controls touch the same kinds of files (sign in, payments, settings, migrations, five deleted notes the person asked to delete). Outcomes: `caught` (and whether the concern named the real problem), `missed`, `false_alarm`, `clean`, `not_sent` (Companion did not think it risky enough to review) and `no_answer`. Each run also checks that the reviewer only ever saw secrets hidden.

**explain.** The known good change of each fix case is made through the runner, so Explain is asked exactly as after a real task. The rules (two lines, plain words, a question that ends in a question mark) are checked in code; a grader model judges whether it is true of the change, whether the marked answer is right, and whether a non engineer could follow it. The grader's answer is read strictly: anything unclear is "not graded", never a pass. In a dry run the grader is a stand in that only checks the case's key words.

**show-me-how (hard set).** Four made up products, each in light and dark: a deploy settings page, a database table editor, a project settings page and a code host's repository page. Targets are labelled in the page (`data-eval-target`), so another control with the same words (six Edit buttons, two Save buttons, two Copy buttons, a Code tab and a Code button) is a miss. Where two controls answer an ask equally well, both are right: the column header's + and Insert column, the key box and Add another, the name box and Rename. A test reads every control's words (text, label for screen readers, placeholder, value) and checks that each one saying an ask's key words is either a right answer or one of the decoys the ask counts. Scored as the aim eval scores: raw hit and snapped hit. No real website is ever opened (the aim eval's older `--real` option, which opens eight public sites, is separate and opt in).

**show-me-how (everyday set).** Nine made up windows that imitate everyday apps, light only: a mail client, a calendar, system settings, a file browser, a spreadsheet, a word processor, a slide editor, a design tool and a photo editor (`evals/show-me-how/everyday.json`, `pages/everyday/`). The questions are in everyday words and most never say the control's name ("Where did the file I just got from the internet go?"). Each page names the app it imitates by the id the shell would send, so every ask goes to the pointing lane as a tutor for that app, the way the app asks with Teach everyday apps in their own words (`showme.everydayTutor`) on. The same labels, words test, decoys and scoring as the hard set; a dry run prints what a spend run would cost. Nothing has been asked of real Claude yet. `--tutor off` asks the everyday set without the tutor's words, to compare. `--browser on` asks the hard set (builder dashboards) as pages in a web browser with the tutor on, so its hard rate can be compared with a run without it: the browser rule must not hurt pointing on the pages the shipped lessons run in. Its report names that rate "hard (as browser pages, tutor on)".

## The results file

Each run writes one JSON file in the same shape for every set (`evals/lib/results.ts`, format `companion-eval-results/1`): the set, `dry` or `spend`, the harness, start and end times, the models, the caps, what was spent, why it stopped early (if it did), every case (`id`, `outcome`, `costUsd`, `turns`, `tokens`, `ms`, plain `notes`, and the set's own `detail`) and a summary. A dry run goes to a temporary folder. A spend run goes to the set's own `results/` folder, to be kept. A dry results file that says it spent anything is refused.

## Not built here

- The Rescue diagnosis eval (M11 step 8: is the root cause right, against written labels) is not built. `fix-projects --flow rescue` runs the same path but scores the fix, not the diagnosis.
- The Flask case has not run on this Mac (it has no flask or pytest), so where Point at the problem finds it is not recorded yet.
