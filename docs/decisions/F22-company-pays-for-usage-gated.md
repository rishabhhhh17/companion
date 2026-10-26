# F22. The company pays for the model: built behind a switch, off until Anthropic says yes in writing

- **Status:** Proposed from the founder's direction of 22 Oct 2026. It reopens F10 for the first time. The founder said people supplying their own Claude "is not good enough" and that "we as a company will pay", the way HeyClicky works. Confirm the wording when you read this.
- **Date:** 2026-10-22
- **Related:** F10, T03, T10, T09, M13 (`docs/milestones/M13-managed-usage-plan.md`), `docs/outreach/anthropic-managed-usage-question.md`

## Decision
Companion gets a second way to use Claude: **managed usage**. The user signs up, picks a plan, and never makes a key. Companion's own server (the usage proxy) takes each request from the app, checks the user's plan and daily limit, adds Companion's key, forwards it to Anthropic, and counts what it cost. Companion pays Anthropic and charges the user a monthly price.

The own key route (F10) stays, as the fallback and as the route for people who prefer it.

## The gate
Anthropic's terms for products built on Claude Code (which includes the Agent SDK) say a product "may not pay for, resell, or intermediate Claude usage on their end users' behalf". Companion's engine is Claude Code. So:
- Managed usage is **built, tested, and switched off**. A remote switch keeps it off for everyone until Anthropic confirms in writing that it is allowed (the same pattern as the plan sign in route, T03). The switch stays even after a yes.
- The written question is `docs/outreach/anthropic-managed-usage-question.md`. A chatbot reply is not approval.
- If the answer is no for the Claude Code engine but yes for the plain API, only the light features (guide on screen, Explain, Prompt help, voice answers) go through managed usage, and "do the work" keeps the user's own Claude.
- If the answer is no for both, the proxy is not launched and nothing is lost but the weeks spent; the own key route stays the only route.

## Update after the live check of the terms (22 Oct 2026)
- Confirmed: the Claude Code clause covers the Agent SDK, so the fix engine cannot be company paid without a written agreement. **Precedent to cite:** JetBrains includes its Claude Agent (built on the Agent SDK) in the JetBrains AI subscription.
- **New:** the Commercial Terms allow the plain Messages API "to power products and services Customer makes available to its own customers". So the light features (the guide, pointing, Explain, Second Look) **can be company paid today** if they call the Messages API directly and do not run Claude Code. That makes a free, no key front door possible without waiting. The email asks Anthropic to confirm this reading.
- **Built (22 Oct 2026):** the light lanes can run straight on the Messages API (`runner/src/direct.ts`), switched on by `COMPANION_LANES=direct`, or on managed usage (`COMPANION_ROUTE=managed`, `COMPANION_MANAGED_BASE`) through `usage-proxy/` with the Companion sign in token. On managed usage the fix engine refuses with a plain message and the token never reaches Claude Code. Default unchanged until one real run of each lane.
- **Second Look's web search (22 Oct 2026):** on the plain API lanes Second Look may search the web a few times per check (the basic web search tool, `secondLook.searches`, usually 3, at most 5), priced at $10 per 1,000 searches on top of tokens and counted in the day's spending and in the proxy's metering. The usage proxy forwards that one tool with its cap and refuses any other tool, `tool_choice`, `mcp_servers` and `container`, so managed usage cannot be used for unbounded searches or other server tools.
- Contact status (22 Oct 2026): sales@anthropic.com answers with an automatic reply (the inbox is no longer monitored); the sales chat could not escalate; the partner portal (partnerportal.anthropic.com/s/partner-registration) failed with a server error, to retry; **support (support.claude.com) handed the question to a person who handles commercial terms.** Wait for that reply.
- Hedges to look at: Claude Managed Agents with self hosted sandboxes [verify], and OpenAI's "Sign in with ChatGPT" (commercial apps on a waitlist).
- Source: `docs/research/2026-10-22-reality-check.md`, section 5.

## Payments through Dodo Payments (founder's choice, 23 Oct 2026)
Plans are sold and charged through Dodo Payments (a merchant of record), not Stripe. The gate above is unchanged: choosing a payment provider does not switch managed usage on, and with no provider set the proxy serves no payment route. `usage-proxy/src/dodo.ts` and `payments.ts` are built and tested, off by default; `stripe.ts` stays as the other choice. Fees, payout schedule and terms: Dodo's own docs and dashboard, not stated here. Not yet proven against a real Dodo test mode webhook (see `docs/milestones/M13-managed-usage-plan.md`).

## Anthropic support said yes for the plain API (23 Oct 2026)
- **What they wrote** (a support email, about 16 hours after the founder's follow up; see `docs/outreach/anthropic-support-reply-2-2026-10-23.md`): building a commercial product on the Messages API under your own organization's key, with that usage covered by a paid plan, "is a standard setup". The server design we described works: check the user's plan, enforce a daily cap, forward the request under your key, and record token counts only.
- **What it unlocks:** the company paid light features (the guide, Explain, Second Look, Prompt help, picture reading) through `usage-proxy/`. It is still a support email, not a signed agreement: have a lawyer read it before the business depends on its exact words.
- **What it does not unlock:** Claude Code usage paid by us (the fixing engine on Anthropic's own program). That still needs a written agreement. Points 1 (shipping the program inside the app) and 3 (who to talk to for an agreement) of the follow up are not answered yet.
- **Condition they stated:** we are responsible for Usage Policy compliance for everything our users send through our key. A rate limit alone does not cover that. We need our own acceptable use terms for users and a process to identify and cut off an offending account.
- **Not switched on:** the managed route stays off until the conditions below are met. Rule 1 in AGENTS.md is read as: the fixing engine is never company paid without a written agreement; the plain API light features may be company paid behind the switch, now that Anthropic's support has said it is a standard setup.

## Anthropic support, third reply (27 Oct 2026)
Scope confirmed: calls under our own organization key, billed inside the user's plan. Not Claude Code. `metadata.user_id` stays opaque and free of personal data. Anthropic gives no per user usage report, so **our own request log is the system of record** for any abuse case. Notices go to the org's owner, admin and billing roles (no security contact field). The abuse process must also include detection beyond a daily cap. Details and what we built: `docs/outreach/anthropic-support-reply-3-2026-10-27.md`. Still a support email, not a signed agreement.

## What changes in the rules
`AGENTS.md` rule 1 ("never pay for, resell or route anyone's Claude usage") now reads as true unless managed usage is switched on with Anthropic's written yes. Rule 2 (the key stays in the Keychain) is unchanged: on managed usage there is no user key, only a Companion sign in token, kept in the Keychain the same way, and Companion's own Anthropic key never leaves the server.

## What it costs and what it risks
- Companion carries every model bill. Measured on real Claude (22 Oct 2026): about $0.04 to $0.12 a fixed project, under one cent an explanation, about half a cent a pointing answer. Plans need a hard daily limit per user and a monthly one; the Console workspace spend limit is the last backstop.
- Prompts and project text pass through Companion's server. The proxy never stores or logs a request or reply body; only counts and the plan. The privacy policy and terms drafts must be rewritten for this, and the lawyer reviews them before it goes on.
- Companion becomes responsible for uptime, refunds, tax and abuse (a stolen sign in token can only spend one user's daily limit).
- "Privacy by architecture: own key, no proxy" stops being true on this route and must not be claimed for it.

## Revisit only if
Anthropic's answer or terms change.
