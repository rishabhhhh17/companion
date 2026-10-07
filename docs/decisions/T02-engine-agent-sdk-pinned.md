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

## Revisit if
Anthropic gives written terms for managed credits, which need a Companion owned loop on the Messages API (section 20, question 2; product_research.md section 15, point 4). A routine SDK upgrade is not a revisit.
