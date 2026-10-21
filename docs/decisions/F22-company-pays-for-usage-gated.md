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
- Hedges to look at: Claude Managed Agents with self hosted sandboxes [verify], and OpenAI's "Sign in with ChatGPT" (commercial apps on a waitlist).
- Source: `docs/research/2026-10-22-reality-check.md`, section 5.

## What changes in the rules
`AGENTS.md` rule 1 ("never pay for, resell or route anyone's Claude usage") now reads as true unless managed usage is switched on with Anthropic's written yes. Rule 2 (the key stays in the Keychain) is unchanged: on managed usage there is no user key, only a Companion sign in token, kept in the Keychain the same way, and Companion's own Anthropic key never leaves the server.

## What it costs and what it risks
- Companion carries every model bill. Measured on real Claude (22 Oct 2026): about $0.04 to $0.12 a fixed project, under one cent an explanation, about half a cent a pointing answer. Plans need a hard daily limit per user and a monthly one; the Console workspace spend limit is the last backstop.
- Prompts and project text pass through Companion's server. The proxy never stores or logs a request or reply body; only counts and the plan. The privacy policy and terms drafts must be rewritten for this, and the lawyer reviews them before it goes on.
- Companion becomes responsible for uptime, refunds, tax and abuse (a stolen sign in token can only spend one user's daily limit).
- "Privacy by architecture: own key, no proxy" stops being true on this route and must not be claimed for it.

## Revisit only if
Anthropic's answer or terms change.
