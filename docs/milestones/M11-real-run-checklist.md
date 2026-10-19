# M11: what stays unproven until a real run, and what proves it (17 Oct 2026)

Everything below is built and tested with fakes, but nobody has run it against real Claude. A fake proves our wiring, never the world. This is the one list of those items, each with the script and the step that will prove it. It was made by searching the docs and the code comments for "real run", "UNPROVEN", "[verify]", "not yet run against real Claude", "not yet tried on a real API key" and "still owed".

## How to run it

1. Before spending (M11 plan, step 0): make a separate API key in its own Anthropic workspace with a spend limit, then store it in the Keychain from Terminal, so it never goes through chat: `security add-generic-password -s companion-dev -a anthropic -w` (it asks for the value). The scripts read the item named by `COMPANION_KEYCHAIN_SERVICE`, `companion-dev` by default (`COMPANION_KEYCHAIN_ACCOUNT` for another account name).
2. Every script is a dry run unless it is given `--spend`. Run it once without, read the plan (each case, its model, its estimate and its stop), then add `--spend`.
3. In this order, each only after the one before it passes:

| Step | Command (from `runner/`) | Estimate | Stops at |
|---|---|---|---|
| A. Smoke test | `bun run scripts/smoke-real.ts --spend` (its `main-engine-opus55`, `rescue-sonnet55` and `fast-sonnet55` cases are the gate for the model choices in Settings: each that passes goes into `SMOKE_PASSED` in `runner/src/models.ts`) | about $0.75 | $0.30 a case, $1 in all |
| B. Real checks | `bun run scripts/real-verify.ts --spend` | about $3.51 | its own stop per scenario (at most $1.50), $12 in all |
| C. Prompt help eval | `bun run ../evals/prompt-help/run.ts --real --spend` (again with `COMPANION_FAST_MODEL=claude-haiku-5-5`) | about $0.08 each | $0.40 |
| D. Aim eval | `bun run scripts/eval-aim.ts --spend` (all 88 asks, basic and hard; again with `--lane computer_use` or `COMPANION_AIM=computer_use`) | about $1.50 on Sonnet 5.5 (about $0.07 with `--vision-model claude-haiku-5-5`) | $0.05 an ask, $6 in all; any stop ends the run |
| E. Sandbox backstop | `bun run scripts/real-sandbox.ts --spend` | about $0.10 | $0.20 a case, $0.40 in all |
| F. Eval sets | `bun run ../evals/<set>/run.ts --spend`, in the order in `evals/README.md` (review-catch, explain, fix-projects, loop-breaker) | review-catch about $0.50, explain about $0.45, fix-projects about $5.50, loop-breaker about $2.30 | each set's own: `evals/README.md` |

Each script prints PASS or FAIL per case, what it saw, and what it spent (Companion's estimate, from Claude Code's own cost figure and the token counts); the aim eval and the eval sets (D, F) print each case's outcome and write a results file instead. Every rule for real runs (the bundled binary, the key read in code and never printed, a throwaway Claude Code folder, a short plain environment so no shell setting changes the request, explicit `settingSources`, `strictMcpConfig`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, never `bypassPermissions`, the `system/init` check, the spending stops) lives in `runner/scripts/realrun-harness.ts`; the eval sets and the aim eval reach it through `evals/lib/harness.ts` (`realHarness()`).

What a FAIL means, and how the stops work:
- A refusal by the harness (an option or a `system/init` that breaks a rule) or a spending stop fails its case with the reason, even when the product code turned it into its own message. The case ends at once and nothing new starts after it, so a stop never becomes a 0% hit rate or an empty rewrite. Prompt help and the aim eval print no score for a run that did not finish cleanly, and the aim eval lists a lane error apart from the misses. In the eval sets (F) such a case is `refused` or `stopped`, left out of every rate, and the summary line starts with "Not a clean run"; a refusal ends the run, and so does the total stop.
- In process cases (A, C, D, E, F) are counted while they run, from each reply's token counts. B drives runner processes, and a runner books a round only when that round's result arrives, so a round still running is not seen until then. In B the hard bound is each task's own budget: it is cut to the room left under the stops before the command is sent, and a task cut short (Stop everything, a spending stop, a time limit, the end of a scenario) counts its whole budget, less what the runner booked. So `stop-everything` shows about its $0.40 budget as spent even if the real figure is lower. The small Explain and diagram calls a runner makes in the background are not bounded this way.
- In B, `approve-after-wait` says yes only to `git init` in its throwaway project; every other approval card is denied and noted with its command.

Retired on 17 Oct 2026: `real-run.ts`, `e2e-plan.ts` and `real-sandbox-net.ts` started real Claude on the old plan route test login with no dry run and no stops. They now start nothing and name what replaced them (A, B and E).

## Unproven until a real Claude run

| What is unproven | Where it is marked | What proves it | Pass looks like |
|---|---|---|---|
| Every request is one its model accepts: adaptive thinking at low effort for short answers on Sonnet 5.5, Opus 5.5 and Haiku 5.5, thinking off on Haiku 4.5, medium effort for working sessions on the 5.5 models | `runner/src/models.ts`, T10 (17 Oct 2026) | A: every case, in particular `fast-haiku45`, `fast-haiku55`, `vision-sonnet55`, `vision-opus55`, `main-engine-sonnet55`, `rescue-opus55` | No 400, an answer in each case |
| What the bundled Claude Code really sends for `--thinking adaptive --effort low` (read from its strings, not run) | T10 (17 Oct 2026) | A, the same cases; note the time each answer takes | As above; Show me how answers in a few seconds |
| The vision lane waits past a reply that begins with thinking | `runner/src/lanes.ts` | A: `vision-sonnet55`, `vision-opus55` | A point is returned (a QUALITY note if it misses the box) |
| The pointing lane on the computer toolset: the request, the member `tool_use` answer, the one screenshot round, `toolset_name` on results | `runner/src/aim.ts` (UNPROVEN) | A: `aim-toolset-sonnet55`; then D with `COMPANION_AIM=computer_use` | At least one request, no 400, a point; the eval's snapped hit rate against the vision lane |
| `system/init` lists only the tools each case expects: since 19 Oct 2026 exactly the tools Companion gives (`runner/src/tools.ts`, `AGENT_TOOLS`), which may differ from what the binary really lists (`TodoWrite` or the `TaskCreate` family, tools held back behind `ToolSearch`; `EndConversation`, which no tools list can remove, is accepted as `ALWAYS_LISTED`) | `runner/scripts/realrun-harness.ts`, T02 (19 Oct 2026), technical_research.md section 20, question 26 | A: `main-engine-sonnet55`, `rescue-opus55`; B: `init-check` | No "tools this check does not expect" (it stops at `system/init`, before anything is spent). If it names one, read what it does; add it to `tools.ts` only if Companion should give it, and refuse it in `safety.ts` `NOT_GIVEN` otherwise (and add it to `ALWAYS_LISTED` only if no tools list can leave it out). The A notes also give each first round's tokens: compare them with an older run to see what the shorter tool list saves |
| Claude Code takes a fresh folder on the API key route and asks for nothing on first use | T03 (16 Oct 2026, still owed) | A: `main-engine-sonnet55` (throwaway folder), `resumed-companion-folder` (Companion's own folder inside its data folder, as the app does) | Answers arrive; nothing is written to `~/.claude` |
| A finished conversation carries over when it is continued on the API key route, and what a continued round costs | T02 (not yet proven) | A: `resumed-companion-folder`, `follow-up`; B: `memory` | The second answer is "plum"; the follow up continues the same conversation; each round is booked once |
| Off the record writes no saved conversation and no memory | `runner/test/engine-privacy.test.ts` (still owed) | A: `off-the-record`; B: `memory` | No new conversation file, memory unchanged, the log does not mention the private words |
| The engine books what each round cost, not the running total again | `runner/test/engine-cost.test.ts` (still owed) | A: compare each case's receipt with what the harness booked; B: the ledger | The two agree within a cent |
| The real engine: the safety hook asks before every tool and its answer is final | `runner/src/sdkEngine.ts` (UNPROVEN) | B: `house-rule-and-undo` (a blocked edit), `approve-after-wait` (a card answered yes after five seconds), `research` (look only tools) | Blocked edits stay blocked; the allowed command runs once |
| A command the safety hook allows still runs with Claude Code's own sandbox auto allow off (`autoAllowBashIfSandboxed: false`, so a command the hook gave no answer for is a no) | `runner/src/sandbox.ts`, T05 (19 Oct 2026) | B: `approve-after-wait` (the `git init` said yes to), and every scenario whose agent runs the project's tests; E: `sandbox-network` | The allowed commands run; none is refused by `canUseTool` ("Companion decides in its safety hook") after the hook allowed it |
| The operating system sandbox under Companion's own checks holds on the API key route: no write outside the project or in the home folder, no read of a private file, no site off the allow list, while package downloads from the allowed registries work | `runner/src/sandbox.ts` (shown once on the plan route test login, before the key route) | E: `sandbox-files`, `sandbox-network` | No write happened, the private file's word is not in the report, example.com fails, left-pad installs |
| Stop everything during a real task (real Claude throws when stopped) | M11 plan step 3 (never run) | B: `stop-everything` | Idle within 10 s, no error |
| The loop breaker on a single task never leaves a run waiting; how often a different approach rescues a task | T07 (not yet proven), M11 plan step 7 | B: `loop-breaker` (answers stop); again with `--loop-different`; F: the loop breaker eval set for rates | A receipt arrives, the test file is untouched; any loop card is noted |
| The eval sets on the real run harness: each set's requests accepted, its costs counted, its stops and refusals failing a case rather than scoring it | `evals/lib/harness.ts` (tested with stubbed queries only) | F, cheapest first: `review-catch`, then `explain` | Every case has a quality outcome (none `refused`); what each case cost is close to the estimate in `evals/README.md` |
| Explain on a real key, from the real change | T10 (16 Oct 2026, not yet tried) | B: `explain`; M11 plan step 11 scores it | One or two lines about the change, never about the prompt |
| The error explainer on real Claude | T10 (16 Oct 2026, not yet run) | B: `error-explainer` | Two plain sentences, placed at `src/App.tsx` line 5 |
| Draw it for me, Rescue on Opus 5.5, Research, the visual receipt, take the wheel, the practice project, memory, the daily limit, the ship gates | `runner/scripts/real-verify.ts` (last run on the test login with Haiku 4.5, before the key route) | B: the scenario of the same name | PASS |
| The second model review on Opus 5.5 | M11 plan step 9 | B: `second-model-review`; the seeded risky diffs for the catch rate | The harmless change passes; the exposed live key is stopped |
| The whole loop on broken sample projects | M10 plan | B: `practice` and `rescue`; then the fix eval (M11 plan step 4) | Fixed with proof, tests untouched |
| The practice library's fixes on a real key: each task practice through the shipped request and its $0.60 cap (`runner/src/fixfound.ts`, the same the page sends), the house rule written into the copy, and the times and costs the Learn tab shows (estimates in `app/sample/practices.json` until measured) | `app/sample/practices.json`, F17 practice library (19 Oct 2026, built and tested with the stand in agent only) | B: `practice` (signup, on the API key route and the shipped model, again), `practice-route`, `practice-import`, `practice-open-table`; see "The practice library" below | Each PASS: Find again shows it fixed, the protected file untouched, the receipt names its practice; then put the measured seconds and dollars into the catalog |
| Haiku 5.5 in place of Haiku 4.5 for the fast lane (Haiku 4.5 may retire after 15 Oct 2026) | `runner/src/models.ts`, M11 plan step 11 | A: `fast-haiku55`; C with `COMPANION_FAST_MODEL=claude-haiku-5-5` | It holds the Prompt help score at a lower cost |
| The list prices behind every estimate (Haiku 5.5 has two rate cards: a prompt over 100K tokens is priced five times higher) | `runner/src/models.ts` | A and B: the estimate in each case against Claude Code's own cost figure in the summary | Close; a large gap means a price in the table is wrong |
| The engine staged inside the installed app | `runner/scripts/real-verify.ts` | B again with `COMPANION_ENGINE_DIR` set to the staged engine | The same results |
| A task that ends on a question (Claude Code's own question box refused, one short question in the final message) ends as needs you, with the question on the receipt and no fix round over it | T02, T05 (19 Oct 2026) | F: the fix eval's ask case (`rescue-missing-setting`, scored from the receipt the card shows); B notes | The ask case is `asked`, never `invented`; no "unknown tool" card in any run |
| How often work stops for an approval card | T02 (19 Oct 2026); HeyClicky v1.0.53 "long tasks pause less often for approval" | F: the fix eval's summary line (approval cards in so many tasks, and per task); B: every scenario's notes (`approval cards: n in m tasks`) | A number to decide from; nothing is changed until it is known |

## The practice library (19 Oct 2026): what needs a real key, and what needs a person

Built and tested with no model: the five practices in `app/sample/practices.json` run start to finish in
`runner/test/practice-e2e.test.ts` with a stand in agent (snapshot, safety and house rules, proof ladder, receipt, Find
again, Undo), and the pages follow the same events (`app/src/practice.test.ts`). Nothing below has been run.

**Real Claude runs (item 22; only when the founder says go; each about $0.30, stop at $1):**
1. `cd runner && bun run scripts/real-verify.ts practice` prints the plan. With the founder's go, add `--spend`. Signup, on
   the API key route and the shipped model (the earlier 3 of 3 were on the test login with Haiku 4.5).
2. The same for `practice-route`, `practice-import` and `practice-open-table`.
3. For each, note the seconds and the dollars the scenario prints, and whether the protected file stayed untouched.
4. Put the measured times (rounded up to whole minutes) and costs (rounded up to the cent) into `minutes` and `costUsd` in
   `app/sample/practices.json`, and say in the change that they are measured.
5. If a fix tried to edit its protected file, read the house rule's refusal in the run's notes: it should be refused and the
   fix should then go elsewhere. The open table's fix should add a new migration, never change the old one.
6. The open table passes only when the check shows no open table (`runner/src/ship/opentables.ts`, the rule the page uses
   too): a fix that turns row level security on with a rule that says "true" leaves the table open, and is a FAIL.

**A person tries each practice (item 23; the founder Mac session, one step per message):**
1. A fresh first run: after Connect, the practice step. Try the recommended one; also check Pick another opens the list,
   and Skip goes on to the folder.
2. From the Learn tab's list, each of the five, to Done: Find (the key for four, Check it before it goes live for the open
   table), Show me where, Why? Draw it, Fix it with me (or the lesson for the setting), the result with Undo, Explain.
3. Undo the fix from the practice panel: the practice says the problem is back; Try again fixes it again.
4. Start over: the old copy is in the Trash (put it back from Finder to check), the fresh copy opens.
5. Remove my copy: it goes to the Trash and leaves the recent folders.
6. Quit in the middle of a practice and open Companion again: the practice is there and waits for Find; open the copy from
   the recent folders: Find runs by itself and nothing is pointed at on the screen until Show me where is pressed.
7. Next and Back to my project after a Done. Leave one practice half way, finish another, press Next until it names the
   one left half way: its copy opens, and no second copy appears in the home folder.
8. In a practice copy, press Skip the practice, then open the Learn tab again and wait: the panel stays closed and nothing
   is checked. Continue on its row brings it back.
9. With Node moved out of the way (a test account), the list says Needs Node and Start waits.
10. VoiceOver and the keyboard alone through the list and the panel, including each are you sure step.
11. Record each answer in the readiness table in `docs/status/`.

## Known gaps: unproven, and no script covers them yet

| What | Where it is marked | Next step |
|---|---|---|
| A command left running in the background is noticed (`backgroundTaskId` from the after tool hook) | `runner/src/sdkEngine.ts` (UNPROVEN) | A real-verify scenario that starts a dev server in the background and stops it with `TaskStop` |
| The safety hook outlives an approval card left open for 30 minutes | T05 | Only a 30 minute wait proves it; the unit test covers the setting |
| Claude out of reach: what Claude Code sends with the Wi-Fi off (the words, `api_error_status`, whether the synthetic message has `error` set) and how long it retries first | `runner/src/reach.ts`, T02 (19 Oct 2026, review fixes 20 Oct 2026), technical_research.md pitfall 58 | A founder Mac session: start a small task, then Prompt help, then a plan, with the Wi-Fi off. It costs nothing, since no request reaches Anthropic. The task's card should say Companion could not reach Claude, with Try again; Prompt help and the plan should say to ask again, with nothing to paste back; if the retries take long, add a "still trying to reach Claude" line from `system/api_retry` |
| A failed request of another kind is said plainly: a wrong key (no credit and too many requests if they happen) | `runner/src/reach.ts` `turnStop`, `app/src/strings.ts` `S.claudeStopped`, T02 (20 Oct 2026) | A founder Mac session with a wrong test key in Settings (costs nothing): start a small task. The card should say Claude did not accept the key and to check it in Settings, never "/login" or Claude Code's own words; note the kind and status Claude Code sent |
| A hook time limit longer than 32 minutes is honoured (the hook still waiting, and its no used, past 32 minutes). Needed before "How long a question waits for your answer" may go above 30 minutes; until then its top is 30 | T05 **[verify]** (19 Oct 2026), `runner/src/sdkEngine.ts` | A real-verify scenario that raises the top in a test build, leaves a card open past 32 minutes, lets it expire, and checks the command never ran; only then raise the top in `protocol/settings.json` |
| A decline by the new safety classifiers (`stop_reason: "refusal"`) has no plain message of its own; it shows as no answer or an engine error | Claude API notes (Sonnet 5.5, Opus 5.5, Haiku 5.5) | Watch every run for an empty answer; if one appears, look for a refusal before changing anything |
| On the 5.5 models, text between tool calls can come back as thinking blocks, which the card does not show, so a long turn can look quiet | Claude API notes | Watch `drive` and `rescue` for long silent stretches |
| The reviewer runs with no project folder; where Claude Code keeps its conversation then | `runner/src/agent.ts` (`askReviewer`) | Look in the data folder after `second-model-review` (with `--keep-files`) |
| Whether Claude Code writes a received picture to disk even with `persistSession: false` (high impact) | T10, T12 **[verify]** | Spike (e) watches the temp folders during a real run; the smoke test checks only Claude Code's own folder and that the in memory drive is used |
| The 2000 px picture cap | T10 **[verify]** | Spike (e); the pointing lane refuses larger pictures before sending |

## Marked [verify], but settled on a real Mac or with an account, not with a Claude key

These are listed so nothing is lost; the hands on session and the spikes own them.

- T01: panel focus, clicks, levels over full screen Spaces, Stage Manager, sleep and display changes, presentation mode, hiding from screen sharing (also `technical_research.md` section 20 and F18's "open, to settle on a real Mac": how the home at the notch looks and behaves).
- `app/src-tauri/src/presentation.rs`: listing cameras never shows a camera prompt.
- T02: `interrupt()` settles (spike g); T05 and T02: the workspace trust check for project hooks.
- T03: the plan login items (`auth status` output, several processes on one login, a `.command` file needing no Automation consent). The plan route stays behind its switch.
- T04: notarization of a nested executable signed by another team; the hardened runtime entitlements; fish shells; whether the bundled binary calls git at start.
- T08: Cloudflare sign in for a desktop app. T09: X25519 in iOS Safari. T11: reading a selection in each terminal, browser console and builder chat.
- F01 and F02: Windows certificate prices; Homebrew rules. `docs/architecture.md`: the Windows build items.
