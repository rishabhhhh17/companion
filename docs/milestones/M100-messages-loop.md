# M100: Squibby's own fixing loop on the Messages API, through the usage server

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written, including rewriting AGENTS.md rules 1 to 4 and the related docs to match F29). The fix allowance: the founder chose "measure, then decide" on 15 Nov 2026, so the $5 Pro allowance is not changed here; this milestone builds the measuring and leaves the number to the founder. Nothing was spent: no real model call, no Anthropic key, no deploy, no account. Stand in models and fixture projects only.

## Why (from the plan, 15 Nov 2026)

This is the one thing that turns a paying customer from "zero fixes" into "fixes work".

- F29 (1 Nov 2026) names "Squibby's own agent loop on the plain Messages API, under Squibby's key" as the route that needs no Anthropic agreement. Anthropic support called it "a standard setup" on 23 Oct 2026, as recorded in F29.
- The loop did not exist. `runner/src/agent.ts` defined `NO_EXECUTOR` and refused any loop of our own. Architecture listed `engine/messages-loop` as "later".
- The rival model is HeyClicky: one subscription, and its agents work (heyclicky.com, seen 15 Nov 2026: Free 25 agent messages a month, Pro $20 for 150, Max $100 for 1,000). Whether HeyClicky needs a key is not stated (unconfirmed). Orchestrators make you bring your own login or key.

What the person gets: Pro includes a set number of fixes each month, with nothing to sign in to. Every fix gets the same proof, Undo and receipt as today. Never called unlimited.

## What to build (from the plan)

1. This plan, with the founder's yes, and in the same change: AGENTS.md rules 1 to 4 in the words F29 asks for; `product_research.md` section 11; `technical_research.md` and the T02 and T10 records, with notes on F22; the `plans.ts` header; the 13 Nov synthesis line that counts bring your own Claude as a strength.
2. `runner/src/engine/messages-loop/`, a new engine id behind the `Engine` interface and the `ToolExecutor` seam: `loop.ts` (a plain tool use loop through `usage-proxy` with the Squibby sign in token; the Mac never holds Squibby's Anthropic key), `tools.ts` (read, list, search, edit, write, run command; no Agent and no worktree tools), `executor.ts` (every command through `proof/box.ts` and `sandbox.ts`; no new sandbox). Anthropic models only.
3. The same safety as the Claude Code engine: `safety.ts` deny rules and allowlists before every call (with `livesystems.ts`, `dbsafety.ts` and `secretfiles.ts` inside them), the same approval cards, the git block (rule 10), a shadow snapshot before the first write, the proof ladder at the end, then Undo and the receipt, and Stop everything ends the loop at once.
4. Money limits: a hard dollar cap for each run, checked before each model call; every call booked through `bookSpend` and the proxy's per user budgets; the existing cost pause.
5. `usage-proxy/src/filter.ts`: let the loop's own client tool definitions through; still no server tools except Second Look's capped search.
6. Routing (`runner/src/engines.ts`): the managed route uses `messages-loop` for fixing; the own key and plan routes stay as developer switches; the light lanes on the managed route after one real run of each ([verify]).
7. The fix allowance: measure the cost of 10 fixes on fixture projects, then the founder sets the allowances. "N fixes left this month" on Home and Now.
8. Handing the fix back to the person's own AI tool stays free (F30), through `review/sendback.ts` and `handoff.ts`.
9. Everything stays off behind the remote switch until the go live checklist is done.

## Tests first (from the plan)

- Everything T05 tests for the Claude Code route, run again against `messages-loop`.
- The key never reaches a tool; no Squibby token in any child environment.
- Every git write is refused.
- A snapshot exists before the first write.
- The hard dollar cap stops the loop.
- Stop everything ends it mid tool.
- Deny rules hold when the model asks for a denied path.
- A prompt injection fixture in a project file cannot widen the allowlist.
- The proof ladder runs and its result decides "Proven".

## Rules it must hold

F29, F22 (the Claude Code route still needs Anthropic's written yes), rules 10 to 14, rule 12 (safety in code, never in prompts), never `bypassPermissions`.

## Built

Built 15 and 16 Nov 2026 in three steps, with the suites green between them. Not committed.

1. **The loop, its tools and its executor** (`runner/src/engine/messages-loop/`).
   - `tools.ts`: six tools by Claude Code's own names and input fields (Read, Glob, Grep, Edit, Write, Bash), so `safety.ts` judges a call from the loop exactly as it judges one from Claude Code. No sub agents, no worktrees, no web, no background commands. Plain data, so the usage server can compare every request to it (`isLoopToolList`). Looking only flows get Read, Glob and Grep.
   - `executor.ts`: `screen()` refuses before anyone is asked: any git write (in any part of a command, in any spelling, or in an inline script), a path outside the project, in `.git`, `.claude` or `.companion`, a settings or key file, and any tool the loop does not have. `boxedExecutor()` runs what the runner allowed: file tools walk the path part by part and never go through a link (`O_NOFOLLOW`), Glob and Grep skip installed packages and kept folders, and every command runs in the proof checks' safety box (`proof/box.ts` with the `sandbox.ts` rules) through `runCommand`, with the short allow list environment (`env.ts minimalEnv`) and the task's stop signal. No internet, except for an install that asked the person first; a project's own `npm install` gets no internet, and the proof ladder's install step asks and installs. With no box on the Mac, nothing runs. Output back to the model is cut to its end (20,000 characters) and keys in it are hidden.
   - `loop.ts`: `MessagesLoopEngine`, engine id `messages-loop`. A plain, non streamed tool use loop to `<usage server>/v1/messages` with the sign in token in `x-api-key`, redirects never followed. It yields each tool call to the runner and sends the result back. The system prompt has plain working rules only; the safety is all in code. Conversations are kept in memory only (at most 8, none off the record) so a failed check goes back into the same conversation. Stop ends a request or a command at once.
   - **Money.** A hard cap of $2 a task (`HARD_CAP_USD`), fix rounds after a failed check included (the runner clamps the task's budget to `Engine.maxTaskUsd` and gives each round only what is left), or the task's own budget when lower, checked before every request against its worst case: every byte of the body as an input token plus the longest answer, at list price. A request that cannot fit is never sent; one that nearly fits asks for a shorter longest answer. Each reply's cost goes with its first turn, so the runner books it (`bookSpend`), its cost pause asks "keep going or stop" as for any task, and its budget ends the task. The usage server's "used up" answer (402) is a spending limit.
2. **The runner seam** (`runner/src/engine.ts`, `agent.ts`). `Engine.ownExecutor`: an engine of Squibby's own loop carries its sandboxed executor, so `executorFor` uses it (the old "no executor" refusal still holds for any engine without one). `Engine.screen`: checked first in `authorizeTool` and in the looking flows, stricter only. The executor now gets the task's stop signal. Everything else is the runner as it was: the shadow snapshot before the first write, `safety.ts` and the house rules, the cards, the proof ladder deciding "Proven", the receipt, Undo, Stop everything.
3. **Routing, the server and the docs.**
   - `runner/src/engines.ts`: `COMPANION_FIXING_LOOP=on` on the managed route makes the fix engine the loop (`createEngine`); `managedAuth` gives it only a token shaped value, only for an https server named in the settings, never a person's own Claude key. Off, the managed route still refuses fixing with `MANAGED_FIXING_OFF`. The own key and plan routes keep Claude Code. The light lanes on the managed route already run on the direct lanes (M14).
   - `app/src-tauri/src/runner.rs`: `COMPANION_FIXING_LOOP` may come from the developer file, which only a development build reads. A release build cannot turn it on: the remote switch stays off.
   - `usage-proxy/src/filter.ts`: forwards the loop's client tools when each is exactly as defined, alone; Second Look's capped search still goes alone; no other server tool.
   - `runner/scripts/measure-fixes.ts`: 10 fixture projects, each with one bug and a test, fixed through the real runner, the real executor and the real safety box, with each project's own test (in the box) as the check. Free on a stand in model by default; `--spend --base https://<server>` for real fixes, with the sign in token read from the Keychain in code, each fix capped at $2 and given no more than what is left of the run's $15, so the run never passes it. `--out` saves `{ standIn, costsUsd, fixes }`, which `usage-proxy/scripts/allowance.ts` reads; it refuses a stand in file.
   - AGENTS.md rules 1 to 4 and the product paragraph rewritten for F29; `product_research.md` section 11; `technical_research.md` sections 3 and 20 (question 2 and item 45); T02 and T10 notes on F22; the 13 Nov synthesis line; the `usage-proxy/src/plans.ts` header; `docs/architecture.md`; `CHANGELOG.md`.

### The cost measuring, stand in output only (16 Nov 2026)

`cd runner && bun run scripts/measure-fixes.ts`: 10 of 10 proven, 4 requests each, $0.0165 each, $0.1652 together. These are the stand in's made up token counts at list price: they say the measuring works, nothing about what a real fix costs. The allowance lines it printed (Free 121 a month, Pro 302 a month) are therefore meaningless until a real run. Nothing was changed: the $5 Pro allowance is the founder's call.

## Tests

- `runner/test/m100-loop-executor.test.ts` (18): the tool list; the screen (13 git write spellings, looking git let through to the runner's judge, paths outside, kept folders, key files, other tools); files inside the project only and never through a link; Glob and Grep skip packages, `.git` and key files; commands only in the box with the task's stop signal, internet only for an install that asked, nothing with no box, a git write that reached the executor still refused, output cut and keys hidden; and on this Mac's real sandbox: no key or token in a command's environment, no write to `.git` from a script or outside the project.
- `runner/test/m100-loop-engine.test.ts` (18): a fix end to end through the runner on a stand in model (snapshot before the first write, proven by the check, Undo puts it back); every request to the server with the token, the exact tools, accepted by the server's own filter, no token in any body; the check, not the model, decides Proven; git writes refused with no card; deny rules for denied paths; a command that asks shows the card and a no means it never runs; a prompt injection in the README cannot widen anything; Stop everything mid command and Stop while waiting for the model; the hard cap (never sent, never passed, the lower budget wins, never raised, the answer shrunk to fit); the cost on the first turn; 402 as a limit and no token in an error; no sign in, no request; routing off and on; `managedAuth`; the hand back to the person's own tool spends nothing.
- `runner/test/m100-measure.test.ts` (4): each fixture fails before its fix and passes after; a real run refuses without an https server address; one stand in fix end to end in the real box.
- `usage-proxy/test/loop-tools.test.ts` (4): the loop's list goes through unchanged, whole or in part; any change, addition, duplicate or mixed in server tool is refused.

No old expectation changed in the first build. In the review fixes below, one did, on purpose: the loop's tools now need the server's loop switch, so the tests that expected them to pass the filter now pass `{ loopOn: true }`.

### Review fixes (16 Nov 2026)

Each with a failing test first.

- **The cap is per task, not per round.** `Engine.maxTaskUsd` (the loop: `HARD_CAP_USD`), applied in `agent.ts` `runOnce` and `readOnly` as `Math.min(budget, room, maxTaskUsd)`. Test: a failed check and two fix rounds on an honest stand in (every reply costs its own worst case) spent $3.91 before, and stays at or under $2 now.
- **An answer cut off at max_tokens.** The last `tool_use` of a `max_tokens` reply is never run; it is answered with an `is_error` result asking for smaller pieces, and the loop asks again. The complete calls before it still run.
- **Research needs the web.** `Engine.searchesWeb` (false on the loop): `research.ask` is refused in plain words before any request, so no notes with made up sources are filed. Routing Research to the direct lane's capped search is left for when the loop goes live.
- **The server's own switch.** `usage-proxy` `checkRequest(..., { loopOn })`, `Deps.loopOn`, and `LOOP_ON` in the worker, off unless on, 1 or true. Off, the loop's list is refused for every token; Second Look's search is unchanged.
- **The quick look before each round** checks the host the round talks to (`engines.ts` `taskReachHost`): the usage server on the loop, Anthropic on Claude Code.
- **No notes without a project.** The reviewer's run (project "") sends no `CLAUDE.md` from the runner's own folder.
- **The measuring run's $15** is now a real limit (`nextFixBudget`), and its words use the names from `names.ts`.
- **The git screen** reads each part of a command, fully unwrapped (env, xargs, find -exec, sh -c, eval, `$(...)`): git as its own word, and code given as text to an interpreter or piped into a shell. `grep -r "git commit" .` and `echo "then git add"` now pass to the runner's own judge; every old refusal still holds. The whole line is read as git words only when it cannot be parsed.

## Not done, and why

- **"N fixes left this month" on Home and Now.** The number is the founder's to set from real measurements ("measure, then decide"), and the usage server meters dollars, not fixes. Showing a count now would mean inventing one. When the founder sets it, the usage server's plan table gets the fix count and the line follows.
- **Prompt caching beyond the system block, and streaming.** The loop sends its system block as cached and waits for whole replies. Streaming would show words sooner; it is worth doing after the first real run shows the timing.
- **guard.ts.** It is the safety net for the person's own Claude Code sessions (their hooks). The loop's own commands are judged by `safety.ts` (which carries `dbsafety.ts` and `livesystems.ts`) and covered by the task's own snapshot, so the guard has nothing to add here.
- **Other providers' models.** Anthropic models only in this first cut, as the plan says.
- **For the founder:** the Pro daily allowance ($0.75) is below one run's hard cap ($2), so a long fix could be stopped by the server's daily limit partway. That is safe (the receipt says it stopped and Undo works), but worth deciding with the real numbers.

## [verify]

Also in `docs/research/technical_research.md` section 20 item 45.

1. One real fix through a deployed usage server with a real sign in token: `cd runner && bun run scripts/measure-fixes.ts --spend --base https://<server> --only add`. Check that the live API accepts the request shape on `claude-sonnet-5-5`: the six tool definitions, `output_config.effort`, the cached system block, and thinking blocks handed back unchanged between tool calls.
2. The 10 fixture fixes for real (`--spend --base https://<server> --out costs.json`), then `cd usage-proxy && bun scripts/allowance.ts costs.json`, for the founder to set the fix allowance. (The saved shape and the reader now agree, tested; a stand in file is refused.)
3. On a real Mac: Stop everything ends a long command of the loop within a second; a script the loop runs cannot write `.git` (tested here on this Mac's sandbox-exec, from a test run).
4. One real run of each light lane on the managed route (`direct.ts`) before they are the default there.
5. Wire the fixing switch to the remote switch: a go live checklist item. Until then a release build cannot turn the loop on. The server needs `LOOP_ON` set as well; without it the loop's tools are refused.
