# M13: the company pays for the model (managed usage), built and switched off (plan, 22 Oct 2026)

Decision: `docs/decisions/F22-company-pays-for-usage-gated.md`. The question that unlocks it: `docs/outreach/anthropic-managed-usage-question.md`. **Read this plan and veto anything. No deployment, no money, and no change to what a user sees happens until you say so and Anthropic says yes in writing.**

## What the user sees (when it is on)
Sign up, pick a plan, use the app. No Anthropic account, no key. When a daily limit is reached, a plain message says so and when it resets, with a button to use their own key instead. That is all. (The sign up screen is a page change, so it waits for your word on the look; this plan builds only what sits behind it.)

## How it works
```
app (runner + Claude Code)  --->  usage proxy  --->  Anthropic
   sends its Companion token        checks the token and plan,
   as the key, base address         adds Companion's key,
   set to the proxy                 counts the cost
```
Claude Code can be pointed at another address with an environment setting, and it sends whatever key it is given. So on this route the runner gives it the user's Companion token as the key, and the proxy's address as the base address. The real Anthropic key lives only in the proxy's secret store. [verify] on a real run that the pinned Claude Code honours the base address on the API key route and passes the Companion token through; not checked yet.

## What the proxy does with each request
1. Takes the token from the key header. Looks up its hash. Unknown, revoked or expired: refused with a plain message, nothing forwarded.
2. Allows only the paths and models Companion uses (`/v1/messages`, `/v1/messages/count_tokens`; the models in `runner/src/models.ts`). Everything else is refused. Limits the request size and clamps `max_tokens`.
3. Checks the user's plan and what is left today and this month. Out of budget: refused with a message the app shows as is, and nothing is sent to Anthropic.
4. Replaces the key with Companion's, forwards the request, and streams the reply back unchanged.
5. Reads the token counts from the reply (the streaming events or the JSON), prices them with the same table the app uses, and takes that off the user's budget. A request that ends early still counts what was used.
6. **Never stores or logs a request or a reply body.** Only the user, the model, the token counts, the cost and the time.

## Plans and limits (defaults, yours to change; they are one table)
| Plan | Price | Daily limit | Monthly limit | Notes |
|---|---|---|---|---|
| Free | $0 | $0.20 | $2 | Enough for several explanations and pointing answers, and about two fixes a day. Needs a verified email |
| Pro | $20 a month | $1.50 | $12 | About 12 fixed projects a day at today's measured cost. Leaves room for card fees and some margin |
| Max | $100 a month | $8 | $60 | |

The limits are real dollars of Anthropic cost, so they stay true when prices change. The Console workspace spend limit is the last backstop on top.

## What gets built now (all offline, no spending, off by default)
`usage-proxy/`, a small TypeScript program that runs on Cloudflare Workers, with a store interface so the real database can be plugged in later:
- sign in tokens (random, only the hash is stored) and a revoke list;
- the plan table and the budget rules (daily, monthly, a reserve so a request cannot overshoot far);
- the request filter (paths, models, size, `max_tokens`);
- the usage reader for streaming and non streaming replies;
- Payment event handling: verifying the signature, and turning subscription events into plan changes. Stripe first; **Dodo Payments added 23 Oct 2026** (see below);
- a test that nothing in any log, error or stored record contains a request or reply body.

## What is not built, and why
- **Deployment, the Stripe or Dodo account, the domain and the sign up pages:** need you (accounts, money, names).
- **The app side** (a "managed" route in the runner, the sign up screen, the key screen's new option): the runner change is small and comes next; the screens wait for the look.
- **Accounts, email verification and abuse limits on sign up:** needs a real database and an email service. Planned after the core.
- **Privacy policy and terms:** the drafts in `docs/launch/legal/` say "no proxy". They must be rewritten and reviewed by the lawyer before this is on.

## Order, and what would stop it
1. The core above, with tests (this plan).
2. The runner's managed route, still switched off.
3. You send the question to Anthropic. **Nothing past this line without a written yes.**
4. A real run: Claude Code through the proxy on a test token, with a small real spend, to settle the [verify] above.
5. Deployment, Stripe, sign up, privacy rewrite, lawyer.
6. A closed beta with a few friends on Free and Pro.

If Anthropic says no, steps 4 to 6 do not happen. The core is not wasted if they say yes for the light features only: it is the same proxy.

## Risks to say out loud
- You carry every user's model bill. A bug in the limits is money. So the limits are tested first, and the Console spend limit stays on.
- A leaked Companion token can spend one user's daily limit, no more.
- Prompts pass through your server. You can truthfully say the server does not store them, only if the tests keep proving it.
- Anthropic can change its terms. The own key route stays as the way out.

## Payments through Dodo Payments (23 Oct 2026, founder's choice)
The founder will charge through Dodo Payments, a merchant of record, instead of Stripe. `usage-proxy/src/dodo.ts` does for Dodo what `stripe.ts` does for Stripe, with the same safety: the signature is checked (Standard Webhooks), a replay window of 300 seconds, each event applied once and in order, the Dodo product to plan table is configuration, an unknown product grants nothing, nothing is logged but short identifiers. `payments.ts` holds one provider setting (`none`, `stripe`, `dodo`; default none) and one webhook path each; with none, no route is served. Set up and behaviour: `usage-proxy/README.md`. Dodo's fees, payout schedule and terms are Dodo's own: check the dashboard and its docs.

**Unproven until a real Dodo test mode webhook is received** (the founder creates the account):
- [verify] checkout `metadata` reaching the subscription events. Dodo's docs call it metadata "associated with the payment" and do not say it is copied to the subscription. The code also learns the link from `payment.succeeded` (same Dodo customer id).
- [verify] the subscription webhook payload carries `product_id`, `status`, `customer.customer_id`, `metadata` and `past_due_ends_at`. Dodo's subscription API lists them, but its webhook payload page has no sample.
- [verify] what `cancelled` means for access timing. We drop to free at once (leans to not granting).
- [verify] the real request: header names, timestamp unit, the retry on a 503.

## Anthropic's condition, and what answers it so far (24 Oct 2026)
Anthropic's support said on 23 Oct 2026 that the plain API under our own key, with usage covered by a paid plan, is a standard setup, and that we are responsible for Usage Policy compliance for everything users send: we need our own acceptable use terms and a way to identify and cut off offending accounts (`docs/outreach/anthropic-support-reply-2-2026-10-23.md`).
- **Built (tested, off):** every forwarded message request carries an opaque `metadata.user_id` (a keyed hash of the owner id; secret `METADATA_USER_ID_SECRET`, no default, no secret means no forwarding; a client's own `metadata` is removed; count_tokens gets none). A person can be found from that id and suspended or restored with `usage-proxy/scripts/suspend.ts` (dry run by default). A suspended owner cannot be issued a new token and a payment event cannot lift the block. Details: `usage-proxy/README.md`.
- **Drafted (a lawyer decides the words):** `docs/legal/acceptable-use-draft.md`, `docs/legal/abuse-process.md`.
- **Listed:** `docs/launch/company-paid-go-live-checklist.md`, with the real plan numbers and the $500 a month cap of Anthropic's Start tier.
- **Unproven:** how Anthropic will contact us about misuse and whether its notices carry our `user_id`; whether `count_tokens` ignores or rejects an extra `metadata` field (we do not send one, based on its documented body); the suspend command against a real store (only the in memory one exists); that Anthropic is satisfied with this process (no one has said so).
- **Still open and not blocking the plain API light features:** shipping the binary inside the app, and an agreement for Claude Code usage.
