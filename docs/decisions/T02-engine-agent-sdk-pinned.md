# T02. Engine: the Claude Agent SDK, pinned to an exact version

- **Status:** Accepted from research; open items checked in M0 spikes (b) and (g). Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 2; section 3 (also section 1 prototype lesson four, section 19 pitfalls 1, 2, 8 and 28, section 20 questions 2 and 16); M0-desk-research-details.md sections (b), (c) and (g)
- **Related:** F03, F10, T03, T04, T05, T06, T10

## Decision
The runner drives Claude Code through the Claude Agent SDK for TypeScript, `@anthropic-ai/claude-agent-sdk`, pinned exactly to 0.3.291 (it bundles Claude Code 2.1.291). Each agent card gets one streaming input `query()`.

## Why
- The SDK already gives a supervisor what it needs: hooks, permission modes, budget caps, interrupt, resume, sandbox and image input (section 1, row 2).
- Streaming input lets the user add "also make it blue" mid run, and images reach Claude only in streaming input mode (section 3).
- Each SDK patch moves the bundled Claude Code version and can change behaviour silently (pitfall 28). M0 keeps 0.3.291 even though 0.3.292 shipped on 6 Oct 2026.
- The prototype spawned a fresh `node` process per step: no session continuity, no interjection, a cold start every step (prototype lesson four).

## Alternatives considered
- Our own loop on the Messages API: later. It is the only route to managed credits; confirm with Anthropic sales before building billing (section 3).
- A Codex engine through `codex app-server`: a later adapter behind the same `Engine` interface (section 3).

## What this means for the build
The full option set is in technical_research.md section 3. Rules a coding agent must never miss:
- Pin the exact version, no caret, and upgrade only on a branch with the full headless suite. Always run the SDK's bundled binary, never a `claude` on `PATH`.
- Safety, checkpoints, proof, receipts and approvals live in the runner core; engines are thin adapters.
- `env` replaces the environment. `buildChildEnv()` starts from `process.env`, sets the login shell `PATH` (T04) and `CLAUDE_AGENT_SDK_CLIENT_APP`, and adds `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `DISABLE_UPDATES=1` and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`. The scrub strips credentials from the subprocesses Claude Code starts (Bash commands, hooks, stdio MCP servers) while Claude Code keeps them for its own API calls; it leaves GitHub tokens and proxy settings (env var docs).
- The runner's own spawns (dev server, Playwright, gitleaks, its own package installs) get no `ANTHROPIC_*` keys. M1 test: an agent Bash `env` shows no `ANTHROPIC_API_KEY`.
- Every session sets `settingSources` explicitly (`["project"]` for agents) and `strictMcpConfig: true`, or a plan login loads the user's claude.ai connectors; approved project servers go in `mcpServers` (T05). Agents use the `claude_code` prompt preset with `append`.
- `interrupt()` is Stop; `abortController` is the hard kill on quit. Persist `session_id` per card and `resume` after a restart.
- Validate the project folder before spawning (pitfall 2). Map all 13 error values to plain sentences, with a fallback.
- Modes: `acceptEdits` normally, `plan` for Drive planning, `auto` only as an experiment, `bypassPermissions` never.
- Fuses: `maxBudgetUsd` and `maxTurns: 80`. Cost fields are estimates; never sum them across resumed calls (pitfall 8; T10).
- `prewarm()` is alpha and freezes most options; use it only after they settle.

## Open [verify] items
- Warm process memory and latency for `startup()` on both auth routes, and the cost of one spare (section 20, question 16; spike (g)).
- **[verify]** `interrupt()` settles in 0.3.291 (SDK issues #425, #429). Spike (g) falls back to `close()` or an abort.
- **[verify]** whether the SDK applies Claude Code's workspace trust check to project hooks (section 20, question 6). Owned by T05.

## Settled by desk research (7 Oct 2026)
- Login shell `PATH`: our own `$SHELL -ilc` read with a 3 s timeout and a fixed fallback list (owned by T04).

## What the build settled (follow ups, 16 Oct 2026)
- A follow up from the card (`agent.send`) is not streamed into a running `query()`. It is refused while the agent or its project is busy, and once the task has ended it runs as a new task that resumes the last task's session (`resume`), so it gets its own snapshot, the same safety rules, the proof ladder, a receipt, cost booked to the day and the daily limit. Try again (`agent.send` with `retry`) is the same, with the last failing check as evidence. This differs from the streaming input design above and in technical_research.md section 3 ("fed by agent.send"): interjecting while a task runs ("also make it blue" mid run) is not built. Stop, then a follow up, does that job with a clear undo point.
- `agent.send` now names its project, so the app holds it to the folder the person chose (project bound in `app/src-tauri/src/runner.rs`), and the runner refuses it for any project other than the last task's.
- Off the record tasks keep no session (`persistSession: false`), so a follow up or Try again starts a fresh session and is told the request again. The last task's request is kept in the engine's memory only, never on disk.
- Not yet proven with real Claude: that resuming a finished session with the bundled binary carries the conversation over on the API key route, and what a resumed follow up costs. It needs a real-verify scenario with a real key.

## What the build settled (HeyClicky v1.0.53 parity, engine side, 19 Oct 2026)
- **Exact tools per flow.** The engine no longer gets the whole `claude_code` tool set. `runner/src/tools.ts` names what each flow uses, passed as the SDK's `tools` option: a task gets Read, Grep, Glob, Edit, Write, Bash, TaskStop, WebFetch, WebSearch, TodoWrite and ToolSearch; planning and Rescue's diagnosis get Read, Grep, Glob, TodoWrite and ExitPlanMode; Research gets those and WebSearch, WebFetch and ToolSearch; the second model review gets none. Left out on purpose: sub agents (`Agent`), Claude's own question box (`AskUserQuestion`), `EnterPlanMode`, the notebook editor and every scheduling, connector and hosted tool. WebSearch stays in tasks as before, but it is a paid search on the person's own key: the fix eval decides on it. The safety hook refuses every other built in tool with a plain reason (T05), and the real run harness checks `system/init` against the same list (`AGENT_TOOLS`). Not yet proven on a real run: that `system/init` lists exactly these, whether this binary has `TodoWrite` or only the `TaskCreate` family, whether a held back tool still needs ToolSearch, and how much the first round saves (technical_research.md section 20, question 26; the smoke test and the fix eval note the first round's tokens). Whether leaving out sub agents changes fix quality is for the fix eval rerun, when the founder says go.
- **Do what it can, then ask one short question.** The appended instructions now say: when only the person can give what is missing, do every part you can, then end the final message with one short question, and never make up a value. The runner reads the agent's last words (its text after its last tool, `runner/src/asks.ts`): when one of the last three sentences is a question, the task ends as needs you (`needs_you` in the task log, the agent's state `needsYou`). Its work is checked once and no fix round is started over the question, which would bury it and spend more of the person's money; the receipt carries the words (`said`, secrets hidden, at most 600 characters) and `asks`. The person's answer in the follow up box carries on the same conversation, told it is the answer. A step of a Drive plan that asks ends the plan there. If the checks pass anyway, the task is done and proven, and the question still shows on the receipt. To the real engine, a tool call is a turn of its own (`usedTool`), so words before it are never taken for the last ones.
- **Claude out of reach is named.** A turn that ends on a failed request comes back as a `success` result with `is_error` (technical_research.md pitfall 58). Before, such a task ended as done with nothing changed. Now it stops the round. A dropped connection (no answer at all, a name that does not resolve, a timeout) is `no_connection` and a busy or failing Claude on Anthropic's side (529, 5xx, overloaded) is `claude_busy` (`runner/src/reach.ts`); either is the task's status, the card says it in plain words with Try again, and Try again tells Claude truly how the last attempt ended. Problems with the key, the account or the request are never called a connection problem. Claude Code's own error message is never shown as the agent's words. After Stop, nothing is named this way. Not yet seen on a real Mac: what Claude Code sends with the Wi-Fi off, and how long it retries first (it says so in `system/api_retry` messages, which are not shown yet; a "still trying to reach Claude" line waits for that check). This costs nothing to check, since no request reaches Anthropic. The fast lane and the vision lane (Prompt help, Show me, Explain) still read results their own way and are not covered by this change.

## Revisit if
Anthropic gives written terms for managed credits, which need a Companion owned loop on the Messages API (section 20, question 2; product_research.md section 15, point 4). A routine SDK upgrade is not a revisit.
