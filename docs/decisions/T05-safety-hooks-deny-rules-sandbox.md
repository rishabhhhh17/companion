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
- **[verify]** a `PreToolUse` hook time limit longer than 32 minutes is honoured by the bundled Claude Code (the hook still waiting, and its answer used, after 32 minutes). Needed before "How long a question waits for your answer" may go above 30 minutes (19 Oct 2026, below).
- **[verify]** a command the hook allows still runs with `autoAllowBashIfSandboxed: false` (19 Oct 2026, below).
- `git push`, to settle in the M1 plan. The research disagrees: section 6 routes push to an approval, while section 8 lists `Bash(git push*)` as a deny rule and the M1 test expects "git push denied". Recommendation: an approval through the hook's `ask` and no deny rule, because the founder's rule says agent git changes need approval.

## What the build settled (hardening pass, 9 Oct 2026)
- The sandbox is on for macOS shell commands, `allowUnsandboxedCommands` is false, and writes are limited to the project, its caches and the package caches. The network allowlist holds the package registries and local servers only.
- The sandbox does not cover the Read tool, so private folders (keys, browser data, mail, Keychains, Companion's own data) also have `Read(...)` deny rules. Both were checked with real Claude.
- `settingSources` is empty, so a project cannot bring its own hooks, environment or `apiKeyHelper`. Its `CLAUDE.md` is passed as plain notes.
- Writes to `.git`, `.claude` and `.companion` are always refused, and shell commands are read through `sh -c`, `env`, `xargs` and similar before judging them.
- Account variables (`ANTHROPIC_*`, cloud and OAuth ones) and injection variables (`NODE_OPTIONS`, `DYLD_*`, `BASH_ENV`) never reach Claude Code or what it starts.
- `ToolSearch` is allowed (research needs it to reach web search).
- Known limit: installs inside the sandbox need Node 20 or newer, because Node 18 cannot reach the sandbox proxy.

## What the build settled (config and safety pass, 16 Oct 2026)
- The `PreToolUse` hook has its own time limit set (`HOOK_TIMEOUT_SECONDS` in `runner/src/sdkEngine.ts`, 32 minutes), longer than an approval card lives (30 minutes, `APPROVAL_TIMEOUT_MS`). An unanswered card ends as a no, and that no reaches the SDK before it could give up on the hook. Not yet seen on a real run: what the SDK does when a hook does time out.
- Background commands, read from the pinned SDK (0.3.293): a background command is stopped with `TaskStop` (`KillShell` and `KillBash` are its old names, mapped to it). `BashOutput` and `TaskOutput` were removed; output is read with `Read` from Claude Code's own file. The binary keeps it at `<CLAUDE_CODE_TMPDIR, or /tmp>/claude-<uid>/<project>/<session>/tasks/<id>.output`. Stopping or reading a command the same task started is allowed; anything else asks, and unknown tools still ask. The task learns the id from the shell result's `backgroundTaskId` in the `PostToolUse` hook. **[verify]** on a real run that the hook carries it; if it does not, these calls ask, as before.
- Reading that output file is allowed only at exactly that place (`claudeTempRoot` in `runner/src/safety.ts`), and only when no part of the way from Claude's temp folder to the file is a link. A review found the first version accepted any folder named `tasks` and followed links, so a link the agent made with a script could read a file outside the project without a card. Known limit, shared by every read the hook allows: a file can be swapped for a link after the check and before Claude reads it. The `Read(...)` deny rules on private folders still apply at read time.
- "Allow for the rest of this task" (`approval.resolve` with `scope: "task"`) remembers that exact action (the tool, the exact file, pattern or input, and the reason Companion asked) for that task and agent only, never across tasks, and is cleared by Stop and Stop everything. It covers only two kinds of question (`taskScopeCovers` in `runner/src/safety.ts`): a file tool reading outside the project, and a file edit or read inside it that only a house rule asks about. Every command asks every time (a script can change between runs, and git, installs and deploys are not safe to repeat), and so does every web fetch, every other tool (some send or publish) and anything that cannot be undone (rule 13). It never overrides a refusal. A Drive plan is one task: the yes holds for every step of that plan, including a retry and a resume after a pause, and ends with the plan. After Stop nothing more runs or is asked in that task. The app does not offer this answer yet; it still sends "once".
- Installs on the Mac (`brew`, `port`, `apt`, `gem`, a global `npm`, `pnpm` or `yarn` install, `pip install` outside a project environment) ask and are now marked not undoable, as technical_research.md section 6 says. They were marked undoable before.

## What the build settled (settings area 1 review, 19 Oct 2026)
- Claude Code's sandbox no longer runs a shell command on its own say so: `autoAllowBashIfSandboxed: false` in `sandboxSettings` (`runner/src/sandbox.ts`), checked by a test on `buildSdkOptions`. Claude Code's default is true, which lets a sandboxed command through its normal permission flow without asking. Companion's hook answers every command itself, so its explicit allow is what runs a command and normal work should not change; but if Claude Code ever gave up waiting on the hook while a card was open, a command in `acceptEdits` would have run inside the sandbox without a yes. With it off, such a command goes on to `canUseTool`, which always says no. Not proven on a real run: that a hook allow still runs a sandboxed command with it off (the real run checklist).
- "How long a question waits for your answer" (`approval.waitMinutes`) goes from 5 to 30 minutes, not to 120 as first planned, so the hook's limit stays at 32 minutes, exactly as before the setting. A longer limit is the open item above. Even with the auto allow off, an edit inside the project that only a house rule asks about would still go through `acceptEdits` if the hook were given up on, so the top rises only after a real run proves the longer limit.

## What the build settled (HeyClicky v1.0.53 parity, 19 Oct 2026)
- Built in tools the pinned SDK (0.3.293) has but Companion never gives the engine (T02, `runner/src/tools.ts`) are refused in the hook with a plain reason (`NOT_GIVEN` in `runner/src/safety.ts`), in tasks and in the read only flows alike. Before, each one, Claude's own question box `AskUserQuestion` among them, fell through to an approval card about an "unknown tool", which "yes for the rest of this task" did not cover either. `AskUserQuestion`'s reason tells Claude to do what it can and end its final message with one short question; the person answers it in the follow up box under the receipt. The others (`EnterPlanMode`, `Skill` and its old name `SlashCommand`, `Monitor`, the `TaskCreate` family, the scheduling, worktree, connector, notification, feedback and publishing tools, `EndConversation`) say Companion does not give that tool. This only makes things stricter: the sending and publishing tools that asked every time before are now refused every time, so there is no card to say yes to. A name that is no built in tool at all still asks, as before. The engine is given an exact tool list, so none of these should be asked for; this is the backstop.

## Revisit if
An SDK upgrade changes the permission order or hook precedence and the M1 hook tests fail. Upgrades happen only on a branch with the full suite (pitfall 28).
