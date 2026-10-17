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

## What the build settled (16 Oct 2026)
- Model ids live in one module, `runner/src/models.ts`; the app's pages take the agent ones from it. The ids did not change when they moved.
- For testing, settings switch them: `COMPANION_MODEL` (agent sessions), `COMPANION_FAST_MODEL` and `COMPANION_VISION_MODEL` (the two small lanes), `COMPANION_AIM_MODEL` (the experimental pointing lane). The app's developer file may pass all four.
- Open: Drive's planning runs on Sonnet 5.5, not Opus 5.5 as this record says. It was left as it was; the founder decides.

## Explain from the real change (16 Oct 2026, M11)
- Explain's request now carries the task's real change (the lines taken away and added, about 6,000 characters at most), built by `runner/src/teach.ts`. Every secret looking value is hidden over the whole text before it is cut (a key can span lines, `redact.ts`), and settings and key files (`isEnvFile`), `.git`, `.claude`, `.companion`, installed packages, build output and lock files are never shown; a settings file is named only. It goes to the same fast lane on the person's own Claude, as before, and nothing from the screen is in it.
- Explain now also runs once after every finished Drive step, and its cost is added to the day's spending (it was not counted before). It is not asked for once the day's limit is reached.
- The answer is two short lines and one check question with two or three options; a question with more options, repeated options or no valid answer is dropped, the lines stay.
- Not yet tried on a real API key (M11 best coding plan step 11 scores it on real diffs).

## The error explainer (16 Oct 2026, M11)
- The error explainer uses the fast lane too: one turn, no tools, no saved conversation, the person's own key. It is sent the selected error with secrets already hidden and, when one was confirmed, the file and line it points at, and its answer is kept only as two plain sentences. Not yet run against real Claude (no key in this build session).

## Request shapes per model (17 Oct 2026, M11 wave 3)
- Checked against the Claude API notes of 17 Oct 2026, not yet against the live API (no key was used). Sonnet 5.5 refuses `thinking: {type: "disabled"}` (400; its own off switch is `between_tools`, at effort high or below, with no other field). Opus 5.5 refuses thinking off and a thinking budget at every effort; effort is the only control (default medium). Haiku 5.5 takes thinking off only at effort high or below. Haiku 4.5 takes no effort setting. Forced `tool_choice` (`any` or `tool`) is refused on Sonnet 5.5 and Opus 5.5; an assistant prefill on the 5.5 family; a non default temperature, `top_p` or `top_k` on Sonnet 5.5 and Haiku 5.5. On the Claude API, Sonnet 5.5 and Opus 5.5 take computer use only as `computer_toolset_20260801`.
- So the rule "fast lane: thinking disabled, no effort" above holds for Haiku 4.5 only. The rule for every model is now in `runner/src/models.ts`: short answers (the fast and vision lanes, the pointing lane) send thinking off where the model allows it through the SDK (Haiku 4.5), otherwise adaptive thinking at low effort (Sonnet 5.5, Opus 5.5, Haiku 5.5, and the previous Sonnet 5 and Opus 5). Working sessions state medium effort on the 5.5 models and send nothing extra elsewhere. A model the table does not know gets the plain request (no thinking setting, no effort, no computer use).
- `between_tools` cannot be sent: the pinned Agent SDK 0.3.293 has no such thinking type (its `ThinkingConfig` and its flag mapping know adaptive, enabled and disabled only). Adaptive at low effort is the notes' preferred first try anyway; whether it keeps Show me how near the 2.6 s it had with thinking off on Sonnet 5 is for the aim eval to measure.
- Read from the bundled Claude Code binary's model table (static strings, not a run): it marks Sonnet 5.5, Opus 5.5 and Haiku 5.5 as refusing thinking off and appears to leave the field out for them, so the old setting may have run as adaptive at the default effort rather than failing. Either way the new shape is the documented one.
- The pointing lane (`aim.ts`) sends the computer toolset with no beta header and zoom turned off, reads the member `tool_use` blocks (the action is the block's name, with `toolset_name: "computer"`), answers one request to see the screen with the same picture (every result echoes `toolset_name`), refuses pictures over 2000 px and models it knows no toolset for before sending anything, and after a 400 that names the refused tool type stops asking for the rest of the run. It stays off by default and falls back to the vision lane.
- A vision lane answer can now begin with a thinking block (the 5.5 models think first); the lane waits for the text instead of taking the empty block as no answer.
- Cost estimates in the lanes use each model's own list price (`estimateUsd`), not Haiku 4.5's or an older Sonnet's. Haiku 5.5 has two rate cards, chosen per request by prompt length: $0.10 / $0.50 a million tokens at 100K prompt tokens or fewer (input, cache reads and cache writes together), $0.50 / $2.50 above that; both are in the table, so a long Haiku 5.5 session is never estimated five times too low.
- If the pointing lane's second round fails (refused, overloaded, the network, its time limit), what the first round cost is kept: it travels with the error, and the vision lane's answer that replaces it carries both costs. The words written beside a request to see the screen become the caption when the click comes without words.
- All of it is checked by `runner/test/model-shapes.test.ts` for every model id, and proven only by the real smoke test (`runner/scripts/smoke-real.ts --spend`).

## Revisit if
The Show me how eval shows Sonnet 5.5 misses the bar on hard multi step questions (route those to Opus 5.5), spike (g) misses the one second target, or Haiku 4.5 is retired (section 3; section 14).
