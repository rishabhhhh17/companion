# F10. Bring your own Claude

- **Status:** Fixed. Founder decision; do not reopen without the founder. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 10
- **Related:** F02, F03, F09, T02, T03, T04, T10

## Decision
Users bring their own Claude: their own API key, cloud credential, or Claude subscription signed in through Anthropic's own flow (behind a switch until Anthropic confirms in writing). Companion never pays for, resells, routes or marks up model usage. It charges only for the companion itself.

## Why
- Anthropic's rule for products that run Claude Code, which includes the Agent SDK: they "may not pay for, resell, or intermediate Claude usage on their end users' behalf", and each end user authenticates with their own key, plan or cloud credential (product_research.md section 15). Running Claude Code in a product also requires accepting Anthropic's Commercial Terms, so the founder must accept them by hand before launch, for example through Companion's Claude Console organization.
- Third parties may not offer claude.ai login or "collect, store, or intermediate Claude.ai credentials or session tokens" (product_research.md section 15).
- The same legal page says developers building products, including with the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider, and may not route requests through Free, Pro or Max plan credentials on behalf of their users. Anthropic may enforce this without prior notice (T03).
- Suppliers have cut access to tools before (Windsurf, Cursor and OpenAI, OpenClaw). The lesson: follow vendor terms to the letter and plan a second engine (product_research.md section 14).
- Running costs stay tiny: a phone relay, update hosting, and fixed fees like Apple's $99 program and a $9 Rive seat (product_research.md section 15).

## What this means for the build
- The API key route, kept in the OS keychain, is the polished default. The key reaches only the runner and Claude Code; agent commands, hooks and MCP servers never see it (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`; T02, T03). Cloud credentials work through Bedrock, Vertex and Foundry (technical_research.md section 3; T03).
- The subscription route opens Anthropic's own `claude auth login` in Terminal. Companion never reads Claude's credentials. It detects the login from `accountInfo()` and `system/init` in a dedicated long lived SDK query that spends no tokens (T03). It runs `claude auth status` only while waiting for the Terminal sign in, when the user presses "Check again", and in diagnostics; never at first run or launch and never on a timer, because it can sign users out (open bug #95822; T03). The route ships behind a remote switch, off by default, until Anthropic confirms in writing, and the switch stays even after a yes (product_research.md section 15; technical_research.md section 3).
- The written question goes through contact sales (the buying agent chat, asking for escalation to a named person) and a written Claude Console support ticket. It asks explicitly whether the plan login may also run the non coding features (Prompt help, Show me how, recaps), quotes the legal page's clause against routing requests through Free, Pro or Max plan credentials, and asks whether a remote off switch counts as "restricting" a built in sign in method. The draft is in `docs/outreach/anthropic-subscription-question.md`. Keep the replies; a bot reply is not approval (T03).
- Option pending the founder's decision: a fourth way to connect, `claude auth login --console` in Terminal, billed by API usage to the user's Console org with no key handled by Companion (T03).
- Never read `~/.claude/.credentials.json` or Claude Code's Keychain item, and never ask users to paste a `claude setup-token` value (technical_research.md section 3).
- On the plan route, strip every credential that outranks the plan login from the child env (API key, auth token, OAuth token, profile and federation variables, base URL and every cloud provider flag; full list in T03) so a stray credential does not silently bill the user (technical_research.md section 3).
- Ship Anthropic's binary unmodified and never sign it again (T04). Say "Powered by Claude"; a plain sentence that Companion runs Anthropic's Claude Code is allowed, but never "Claude Code" in a feature name, UI label or logo (technical_research.md section 3; T03).
- Every feature spends the user's Claude: small, fast models for small jobs, estimated cost on receipts labelled as an estimate, spend caps on API keys (product_research.md section 15; T10).
- First run detects an existing login (through the SDK query above, never `auth status`), explains the options with honest costs and runs a demo before anything is connected. The connection shows one of four states: plan, API key, cloud or not connected, plus Unknown with the raw details for any other value (T03). "Engine connected" is a first class funnel metric, target 60%+ (product_research.md sections 15, 17).

## What it rules out
- Section 11 row: managed credits by default, Companion paying for models.
- Section 11 row: a Claude login inside Companion, or touching Claude tokens.
- Section 11 row: cash referral and free credits for shared timelapses, replaced by give a month, get a month.
- Credits in v1 (product_research.md section 15, pricing table).

## Revisit only if
The founder decides to. Managed credits are a later, separate decision that needs Companion's own agent loop on the Messages API and Anthropic's written terms (product_research.md section 15).
