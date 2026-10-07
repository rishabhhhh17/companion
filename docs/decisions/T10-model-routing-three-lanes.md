# T10. Model routing in three lanes

- **Status:** Accepted from research; open items checked in M0 spikes (g) and (e) plus the Show me how eval. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 10; section 3 (cost and models, the fast lane, the vision lane); also sections 7, 14, 18 and 20; M0-desk-research-details.md sections (e) and (g)
- **Related:** F10, T02, T03, T11, T12

## Decision
Use three lanes. **Agent sessions** run Sonnet 5.5 by default and Opus 5.5 for planning and diagnosis. The **fast lane** runs Haiku 4.5 with no tools in a warm process, for Prompt help, Where was I, recaps and extraction. The **vision session** runs Sonnet 5.5 with only custom pointing tools.

## Why
- Small jobs must feel instant and cheap on the user's plan; agents need strong models (section 1, row 10).
- Every feature spends the user's Claude, so small, fast models go to small jobs; a full agent session would be slow and bloat context (section 3; product_research.md section 15).
- Price per million tokens, input and output: Haiku 4.5 $1 and $5, Sonnet 5.5 $2 and $10, Opus 5.5 $4 and $20 (section 3).

## Alternatives considered
- One session for everything: slow, and context bloat.
- `--bare` mode for the fast lane: it cannot serve plan users, and may become the default for `-p`, so retest plan auth on every upgrade (T02).
- Fable 5.1 ($10 and $50): never by default; only for stuck long horizon work.
- Haiku 4.5 for pointing: limited to 1568 px and the standard image tier; only a cheap "is this step done?" check.

## What this means for the build
Lane recipes are in technical_research.md section 3. Rules a coding agent must never miss:
- Keep model ids in config, not code. Haiku 4.5 retires "not sooner than October 15, 2026" (still Active on 7 Oct 2026; Anthropic gives at least 60 days' notice).
- `strictMcpConfig: true` is required in the fast lane, the vision lane and agent sessions, so the user's claude.ai connectors never load. Check `system/init`: zero tools in the fast lane; only `point_at`, `zoom` and `finish` in the vision lane.
- Fast lane: one warm `startup()` handle, whose `query()` runs once, so start the next in the background. One generic `systemPrompt`; each job's rubric and context go in the user message, never starting with "/" (the SDK runs slash commands from prompt text). Options: `model: "haiku"`, `tools: []` plus `disallowedTools: ["*"]`, `settingSources: []`, `maxTurns: 1`, thinking disabled, no `effort`, `persistSession: false`. Log the resolved model ID. The warm handle is not used for login detection (T03).
- API key users may skip the subprocess with a direct streaming Messages API call on their own key; one line about it goes in the written question to Anthropic.
- Vision lane: `tools: []` plus an in process MCP server with `point_at`, `zoom` and `finish`; `persistSession: false` and `settingSources: []`. Pre resize images to at most 2000 px on the long edge, about 1280 px by default (T12).
- Budgets: $1 a step, $5 for Drive, plus a daily per project ceiling, always labelled an estimate (T02).

## Open [verify] items
- **[verify]** (high impact) whether Claude Code writes received images to disk, even with `persistSession: false`. Owned by T12, where the fix is a pending founder decision.
- **[verify]** image resizing: answered from reading the Claude Code 2.1.288 binary (a 2000 x 2000 px cap for Sonnet 5.5 and Opus 5.5, recompression above about 3.75 MB raw). Spike (e) confirms it on 2.1.291 (section 20, question 14). The pre resize rule holds either way.
- Warm process memory and latency on both auth routes, and the cost of one spare (section 20, question 16). Spike (g) target: first streamed token within about one second warm.
- Whether fast lane and vision sessions may run on a plan login: part of the written question to Anthropic (T03).

## Revisit if
The Show me how eval shows Sonnet 5.5 misses the bar on hard multi step questions (route those to Opus 5.5), spike (g) misses the one second target, or Haiku 4.5 is retired (section 3; section 14).
