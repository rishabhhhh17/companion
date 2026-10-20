# T15. Connectors, folder watching and scheduled tasks

- **Status:** Accepted from research; open items checked in M12. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 15; section 16 (also sections 17, 18, 19 and 20)
- **Related:** F07, F11, T05, T06, T14

## Decision
Use MCP servers the user connects, with OAuth run by Rust and tokens kept in the keychain and passed as headers. Watch folders through FSEvents. Run scheduled saved tasks in `dontAsk` mode with explicit allowlists. These ship in v1.1, but the alpha already records what they need in the task log (section 16).

## Why
- The SDK supports MCP but runs no OAuth itself (section 1, row 15).
- Unattended runs must never prompt or exceed their allowlist (section 1, row 15).
- In `dontAsk`, listed tools run and anything that would prompt is denied without calling back (section 16).

## Alternatives considered
- Built in Gmail and Slack first: verification cost (section 1, row 15). Gmail's restricted scopes need an annual security assessment, our estimate $540 to $4,500 a year and 6 to 10 weeks; unverified apps are capped at 100 users. Slack apps outside its Marketplace get one history request per minute (section 16).
- `bypassPermissions`: never; `allowedTools` "does not constrain" it (section 16).
- A launchd agent so tasks run while Companion is quit: a heavier trust ask; later (section 16).
- Reading Mail through its index: needs Full Disk Access, too big an ask; use AppleScript or JXA scoped to Mail.app instead (section 16).

## What this means for the build
Details are in technical_research.md section 16. Rules a coding agent must never miss:
- The SDK has no scheduler. Rust owns timers, FSEvents triggers and OAuth (PKCE with a loopback redirect) and asks the runner to start the task. If Companion is quit, nothing runs (section 16).
- MCP tools need explicit `allowedTools` entries. Any send, pay or delete tool carries `_meta["anthropic/requiresUserInteraction"]` so it never runs unattended (section 16).
- A saved task stores its prompt, exact `allowedTools` (no bare `Bash`), `disallowedTools`, MCP servers, working directory, trigger, budget and approval time. Fixed steps compile to a plain script the user can read (section 16).
- Each run snapshots first if it touches a project, writes a receipt, counts against a per task daily budget, and pauses itself after two failures with a card saying why. A `PreToolUse` hook is the hard gate (section 16).
- Never combine private data, untrusted content and an outbound send in one unattended run (section 16; section 19, pitfall 42).
- Per source and per purpose toggles; the index stays on the device; disconnecting a source deletes it (section 17). Keep any Gmail OAuth app "In production", since "Testing" refresh tokens expire after 7 days (section 19, pitfall 40).
- M12 checks: no send without a tap in any code path (test); saved tasks never exceed their allowlist (test); disconnecting a source deletes its index; Loop Closer items marked useful at least 60% in dogfooding (section 18).

## Open [verify] items
- None marked [verify]. Open questions: is a local desktop app that sends Gmail snippets to Claude subject to Google's security assessment? Plan as if yes and ask Google (section 20, question 17). How reliable and fast is Apple Mail automation through AppleScript on large mailboxes? (section 20, question 18)

## Revisit if
Users need saved tasks to run while Companion is quit (then weigh a launchd agent), or Pattern Catcher recall is poor with labels and tool signatures alone (then try a local embedding model) (section 16).

## Note, 22 Oct 2026 (F21)
Watch routines are not saved tasks and are not MCP connectors. They are read only checks, so the runner owns their small scheduler (`runner/src/watch.ts`, ticking only while the engine runs) instead of Rust, they never call Claude, and nothing needs `dontAsk`. They read through the person's own `vercel` and `gh` tools (no OAuth, no tokens held by Companion) and one web address the person typed. The "Rust owns timers" rule above still holds for saved tasks (v1.1).

