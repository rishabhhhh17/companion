# T05. Safety: hooks, deny rules and the sandbox

- **Status:** Accepted from research; open items checked in M1 hook tests. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 5; section 8 (also section 1 prototype lesson one, section 3 permission modes, section 19 pitfalls 6, 14, 15, 24 and 28, section 20 questions 6 and 7)
- **Related:** F03, T02, T06, T08, T09, T15

## Decision
Safety lives in `PreToolUse` hooks (code that runs before every tool call and can block it), scoped deny rules and the macOS sandbox. `canUseTool` is only the approval UI for calls that fall through.

## Why
- The SDK checks hooks, deny rules, ask rules, the permission mode and allow rules, and only then calls `canUseTool` (section 1, prototype lesson one).
- The prototype's outside the folder guard lived in `canUseTool`. Under `acceptEdits` the SDK approved `Write` and `Edit` first, so the guard was dead code.
- Deny rules hold "even in `bypassPermissions` mode". Among hooks, `deny` beats `defer` beats `ask` beats `allow`, and a hook `allow` does not skip deny or ask rules (section 8).
- Instructions are not controls: Replit's agent deleted a production database during a code freeze despite instructions (section 6).

## Alternatives considered
- A regex blocklist in `canUseTool` alone (the prototype): bypassed by `acceptEdits`. The regex list survives as one input to the hook.
- `auto` mode: an experiment only. Anthropic can turn it off server side, and it "does not guarantee safety" (pitfall 15).
- `bypassPermissions`: never.

## What this means for the build
The layers are in technical_research.md section 8. Rules a coding agent must never miss:
- Sandbox: `allowUnsandboxedCommands: false`; the network allowlist starts empty (add package registries and the project's declared API hosts). It covers shell commands only. If it cannot start, show `error_during_execution`; never run unsandboxed (pitfall 14).
- Deny rules in `disallowedTools`: `Bash(sudo *)`, `Bash(rm -rf *)`, publishing and deploy commands. Whether `Bash(git push*)` joins them is the open item below; deny beats ask, so a denied command can never reach an approval.
- Deploys run through the runner's Ship adapters (T08), not agent Bash, so the deploy deny rules do not block Ship.
- `PreToolUse` hook: resolve every path and deny writes outside the project; deny `.env*` edits unless the step is about secrets; classify irreversible actions; return `ask` for the approval UI. Agent commands that would change the user's git need approval (section 6).
- `canUseTool` renders approvals; leave `permissionPrompts: 'host'`.
- Pre ship gates: gitleaks on the diff and built client bundles; block shipping when a Supabase table exposed to the Data API lacks RLS (T08).
- Project trust: on first open of a folder, list its hooks and MCP servers and ask before loading them (pitfall 24). A project's `.claude/settings.json` can set `apiKeyHelper`, which outranks a plan login (T03).
- Never give the agent production database credentials; require approval for any command that targets production.
- Native Windows has no sandbox, so more Bash patterns move into ask rules there.
- M1 hook tests: a write to `../outside.txt` is denied under `acceptEdits`; `git push` behaves as the M1 plan settles it; a $0.05 budget ends with `error_max_budget_usd` (section 18).

## Open [verify] items
- **[verify]** whether the SDK applies Claude Code's workspace trust check to project hooks, or Companion must build it (section 20, question 6).
- The config shape for `sandbox.network` in the SDK options (section 20, question 7).
- `git push`, to settle in the M1 plan. The research disagrees: section 6 routes push to an approval, while section 8 lists `Bash(git push*)` as a deny rule and the M1 test expects "git push denied". Recommendation: an approval through the hook's `ask` and no deny rule, because the founder's rule says agent git changes need approval.

## What the build settled (hardening pass, 9 Oct 2026)
- The sandbox is on for macOS shell commands, `allowUnsandboxedCommands` is false, and writes are limited to the project, its caches and the package caches. The network allowlist holds the package registries and local servers only.
- The sandbox does not cover the Read tool, so private folders (keys, browser data, mail, Keychains, Companion's own data) also have `Read(...)` deny rules. Both were checked with real Claude.
- `settingSources` is empty, so a project cannot bring its own hooks, environment or `apiKeyHelper`. Its `CLAUDE.md` is passed as plain notes.
- Writes to `.git`, `.claude` and `.companion` are always refused, and shell commands are read through `sh -c`, `env`, `xargs` and similar before judging them.
- Account variables (`ANTHROPIC_*`, cloud and OAuth ones) and injection variables (`NODE_OPTIONS`, `DYLD_*`, `BASH_ENV`) never reach Claude Code or what it starts.
- `ToolSearch` is allowed (research needs it to reach web search).
- Known limit: installs inside the sandbox need Node 20 or newer, because Node 18 cannot reach the sandbox proxy.

## Revisit if
An SDK upgrade changes the permission order or hook precedence and the M1 hook tests fail. Upgrades happen only on a branch with the full suite (pitfall 28).
