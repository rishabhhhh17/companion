# T03. Auth: bring your own Claude

- **Status:** Accepted from research; open items checked in M0 spike (c) and the written question to Anthropic. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 3; section 3 (Auth: detect, guide, never touch) (also section 19 pitfall 7, section 20 questions 1 and 2); product_research.md section 15; M0-desk-research-details.md section (c) and the Anthropic terms check
- **Related:** F10, T02, T04, T10

## Decision
Users bring their own Claude: an API key in the OS keychain (the polished default), a cloud credential, or their own plan signed in with `claude auth login` in Terminal. The plan route sits behind a remote switch, off until Anthropic confirms in writing, and the switch stays even after a yes.

## Why
- Anthropic's legal page bars products from paying for, reselling or intermediating Claude usage, and from collecting Claude.ai credentials. A user may sign in to the unmodified binary with their own plan, but that does not cover Companion running its own sessions on it (section 3).
- The page says Agent SDK products "should use API key authentication" and may not "route requests through Free, Pro, or Max plan credentials on behalf of their users". Anthropic may enforce without notice.
- It also bars products from restricting "any authentication method built into it". A remote off switch, or an API key that outranks the plan login, could be read that way.
- The founder must accept Anthropic's Commercial Terms by hand before launch (F10).

## Alternatives considered
- Managed credits: blocked for the Claude Code engine; a later, separate decision.
- A Claude login inside Companion, touching Claude tokens, or asking users to paste a `claude setup-token` value: dropped.

## Pending founder decision (an option, not part of the build)
A fourth route: `claude auth login --console` in Terminal, billed by API usage to the user's Console org, with no key handled by Companion; the fast lane could not use the direct Messages API. Only on the founder's yes (M0 decision 2) does spike (c) add a Console step.

## What this means for the build
The full flow is in technical_research.md section 3. Rules a coding agent must never miss:
- Detect at first run and routinely through a dedicated long lived streaming `query()` whose prompt has not yielded anything, reading `accountInfo()` or `initializationResult()` and `system/init`. No tokens are spent. This is not the warm fast lane handle: a `startup()` handle has only `query()` and `close()`, and `accountInfo()` lives on `Query`.
- `auth status` runs only while waiting for the Terminal sign in (every 3 seconds, stopping when signed in or after 5 minutes), on "Check again", and in diagnostics. Never at first run or launch, never on a timer: it can spend the refresh token and sign the user out (open bug #95822).
- Leave `CLAUDE_CONFIG_DIR` unset, never `~/.claude`; adopt the user's own value if their shell exports one.
- Never read `~/.claude/.credentials.json` or Claude Code's Keychain item.
- API key: Rust keeps it in the Keychain and passes it only to the runner, which passes it only to Claude children with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`. The runner's own spawns get no `ANTHROPIC_*` keys (T02). The webview never sees the key.
- Plan chosen: strip every credential that outranks the plan login, including any `apiKeyHelper` (list in section 3, step 4). One user was billed $447 on the API instead of their Max plan (pitfall 7). An M1 test checks this.
- States: Plan, API key, Cloud, Not connected, plus Unknown with the raw details. The plan label comes from `accountInfo()`.
- "Powered by Claude" is fine; never "Claude Code" as a feature name, UI label or logo (F10).

## Open [verify] items
- The written question (section 20, question 1; draft in `docs/outreach/`): may a plan login run SDK sessions for a commercial app, including Prompt help, Show me how and recaps? Send through contact sales and a Console support ticket and keep the replies; a bot reply is not approval.
- Whether switching the plan route off remotely, or offering only API keys, counts as "restricting" a built in method (email question 3). The switch design depends on it.
- **[verify]** the unprompted `query()` detection works with no login at all (spike (c)).
- **[verify]** several processes on one plan login race the refresh token (bug #88583); log how often users must sign in again.
- **[verify]** the real `auth status` JSON and `accountInfo()` values; a keyless Console sign in only if the founder adds that route.
- **[verify]** our shipped binary sees another install's login without a Keychain prompt.
- **[verify]** `auth status` reads user settings that sessions skip; sessions trust `system/init` and `accountInfo()`.
- **[verify]** opening Terminal through a `.command` file needs no Automation consent.

## Settled by desk research (7 Oct 2026)
- Keychain access: `keyring-core` 1.0.0 with the native Apple and Windows stores.

## Revisit if
Anthropic answers. A yes turns the plan route on, and the switch stays. A no switches it off remotely while the API key and cloud routes keep working. Managed credits wait for written terms (section 20, question 2).
