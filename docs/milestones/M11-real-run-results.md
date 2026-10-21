# The first real run: results (21 Oct 2026)

First time Companion's own checks ran against real Claude, on a separate key in its own workspace (cap $30; credits $100). Companion's own count of the spend is about **$6.9**. The Anthropic Console is the true figure; compare it.

Every run used the SDK's bundled Claude binary, a throwaway folder for Claude Code's files, no settings files, no MCP servers, never `bypassPermissions`, and the key read from the Keychain item `companion-dev` in code (never printed, never in chat). Runs were started from a clean environment (`env -i HOME PATH TMPDIR`), because a shell inside the Claude desktop app carries sign in variables that sent one call down the wrong billing route (see finding 2).

## Results

| Check | Result | Spent |
|---|---|---|
| Smoke test (13 cases: both agent models, Rescue on both models, the three fast models, Show me how on two models, pointing, resume, follow up, off the record) | 13 of 13 passed | about $0.30 over four runs |
| Real verify (21 cases: house rules and Undo, Drive, visual receipt, the five practice projects, take the wheel, Rescue, memory, Explain, Research, daily limit, second model review, error explainer, approvals, Stop everything, loop breaker, ship gates) | 21 of 21 passed after the fixes below | about $1.4 with reruns |
| Fix eval, 25 projects, Sonnet 5.5 | 23 fixed, 1 asked (correct: a missing setting only the person can supply), 1 could not run (this Mac has no Flask). Broke something: 0. Invented something: 0. The problem found in the right place: 24 of 24. Median fix 2 lines | $0.82 ($0.04 a fixed case) |
| Pointing eval, 128 asks | Basic 100%, hard 95%, everyday 93%. Median 2.7 s, slowest 5.9 s | $0.67 |
| Second model review, 10 diffs | Caught 100% of the 5 risky ones (all 5 named the real problem). False alarms on the 5 harmless ones: 0 | $0.14 |
| Loop breaker, 5 cases | Card at the right time 5 of 5. Where only the person can decide, it asked instead of guessing: 100%. Thrashed 0, gamed 0, invented 0 | $0.19 |
| Explain, 24 cases | 17% at first, 79% after the prompt and model changes, **92% with the plain words retry** (correct 100%, plain 100%, fair question 100%, two lines 92%) | about $0.75 over ten runs |
| Fix eval through the app's own Fix it with me path (Rescue diagnosis, then every step of its plan), 25 projects | 20 fixed, 1 asked, 3 handed back, broke something 0, invented 0, found in the right place 24 of 24. $0.12 a fixed case (the direct path is $0.04) | $2.44 |
| `git add` and `git commit` in an existing repo under the sandbox | Both ask first, both run after a yes, the commit exists | $0.04 |

Real cost came in at 15% to 35% of the estimates: a fixed project is $0.04, not $0.22.

## What the real run found, and what was done

1. **Anthropic's own binary registers three built in plugins** (`cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-plugin-authoring`) that the harness refused as "plugins were loaded". They do not come from the person's settings. The harness now accepts exactly those three by name and still refuses any other plugin (`BUILT_IN_PLUGINS`, tested).
2. **A call made from the live shell of the Claude desktop app failed with "credit balance too low"** while the same key worked in a clean environment. The shell carries about 30 `CLAUDE_CODE_*` sign in variables. Run the paid checks from a plain Terminal or with `env -i`. [verify] Does the shipped app, started from Finder, carry none of those? It should, but a real launch should confirm it.
3. **Rescue padded its plan.** For a page with one wrong name it planned five steps, including "add your photos" and "optionally add styling", plus a step that only opened the page, which made the agent hunt for a browser with a shell command (denied). The prompt now asks for 1 to 7 steps, only what is broken, no optional extras, no step that only opens or checks (Companion checks each step itself), and anything that needs the person's own files last. Real result after the change: one step, done, proved, $0.08.
4. **Explain failed the plain words check on 79% of cases** because the model was never told which words are off limits (the rubric was only applied in code and by the grader). The rules are now in the prompt, with two examples and rules for the check question. On Haiku 4.5 that reached 63% to 67%; Haiku 5.5 79%; Sonnet 5.5 83%. So **"Claude for quick answers" now defaults to Recommended (Sonnet 5.5)**: about $0.004 an explanation, about one second more. "Fast: Haiku 4.5" stays one tap away in Settings. The three model rows in Settings now show, because their smoke cases passed. The eval's default fast model now follows the app's default.
5. **`stop-everything` costs more than the runner books.** A task cut short by Stop everything counts its whole budget as spent, $0.40 more than the runner booked. That is the safe side. Noted, not changed.
6. **Fixed test script, not product:** `approve-after-wait` let Claude run `git init && echo hello > README.md` as one command; Companion correctly denied it. The prompt now asks for `git init` on its own.

## Still open

- **Closed (22 Oct 2026): an approved `git init` did not create `.git`.** Proven cause: Claude Code's sandbox refuses to create a `.git` folder (git printed `.git: Operation not permitted`), so a yes did nothing, though Claude said so honestly. Fix: `sandboxSettings` now lists exactly one excluded command, the bare text `git init` (no arguments, no wildcard), which runs outside the sandbox. It still goes through the safety hook first, so the card still appears and it runs only after a yes. Every other git change, and `git init` with arguments, stays inside the sandbox. Real result: card, yes after the wait, `.git` made, nothing staged or committed, `approve-after-wait` green. Rules 10 and 12 hold (Companion itself still never runs git on the person's project; the safety stays in the hook). Checked later the same day: `git add hello.txt` and `git commit -m "add hello"` in a repo that already exists both ask, run after a yes, and make the commit (case `approve-git-save`). Only `git init` needed the exemption.
- Explain is at 92%. The two misses are lines slightly too long.
- Flask based case `flask-wrong-status` and Go, Rust and Swift cases need those tools installed.
- Everything here is proven with a key and in headless runs. The app itself, on screen, with the Keychain prompt, signed and installed, is still unproven.

## The Fix it with me path: what the three handed back cases are (22 Oct 2026)

The app's own path fixed 20 of 24 runnable projects, against 23 on the direct path. The three "not fixed" are the safety design, not bugs, and each told the person plainly what to do:
- `rescue-ts-missing-property`: the fix needs Sam's real email address, which only the person has. It asked instead of inventing one.
- `missing-setting-name` and `vite-env-prefix`: both need a line in `.env`, which Companion deliberately never opens (secrets). Each said which line to change and where. **Closed the next day** with the settings card below.

## The plain words retry (Explain)

An Explain answer that fails the same plain words check the eval uses (`explainPlain` in `runner/src/explain.ts`, shared with `evals/explain/score.ts`) is asked for once more, naming what was wrong. The answer with fewer problems is kept; a failed or unreadable retry changes nothing; both asks are paid and counted in the day's spending. The eval now scores plain words and the grader on what the person is shown, and keeps "two lines" on the model's own reply (the app trims, so what is shown could never fail it).

## The settings card (22 Oct 2026)

Found while building it: the safety hook never guarded `.env` at all (T05 said it should). A normal task could read it and edit it with no card. Now every write to a private settings file asks, showing the setting's name and never its value, and a key, token or password is refused (see T05). Real checks: `approve-env-line` (card shows `SITE_NAME` only; after a yes the line is added and the old line is kept) and `env-secret-refused` both pass. The three cases that were handed back (`rescue-ts-missing-property`, `missing-setting-name`, `vite-env-prefix`) now all fix, on both paths; `vite-env-prefix` after one card for `VITE_API_URL`. The Fix it path is at 23 of 24. Cost of the re-check $0.28.

**Reading `.env`: closed the same day** (founder said yes). See T05. A task now refuses to read a private settings file, in any spelling; a line can be renamed in place with a tapped `sed -i`. The Fix it eval was not re-run (no more spending was allowed), so the effect of closing reads on the three `.env` cases is unmeasured: `vite-env-prefix` needed to see an old value before, and now has to use the in place rename.

## The attack on the guard (22 Oct 2026, no spending)

131 disguised writes and reads in two rounds, tried against the safety hook directly. 16 got through at first, and every one is closed or asked now. The most important was older than the guard: a redirect hidden inside `sh -c "..."` was never checked, for any file. Details in T05.
