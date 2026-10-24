# usage-proxy (managed usage, M13, F22): built, tested, switched off

The server that lets people use Squibby without their own Claude key: the app sends its requests here, this checks the user's
plan and daily limit, adds Squibby's own Anthropic key, forwards the request, and counts what it cost.

**It is not deployed and it is switched off.** Anthropic's terms forbid it for the Claude Code engine unless they say yes in
writing (`docs/decisions/F22-company-pays-for-usage-gated.md`, `docs/outreach/anthropic-managed-usage-question.md`). Nothing here
runs anywhere until you say so.

Run the tests: `cd usage-proxy && bun test` (and `bun run typecheck`). No dependencies, no network, no spending.

## What is here
| File | What it does |
|---|---|
| `src/tokens.ts` | Sign in tokens (random, only the hash kept). A real Anthropic key is never accepted as one |
| `src/plans.ts` | The plan table (Free, Pro, Max) and the daily and monthly limits, in dollars of Anthropic cost |
| `src/filter.ts` | What may be forwarded: two paths, the models Squibby uses, a size limit, `max_tokens` clamped |
| `src/usage.ts` | Reads token counts from a reply (streaming or not) without keeping any text; prices them with the app's own table |
| `src/proxy.ts` | The request handler: switch, token, plan, budget, forward, stream back, book the cost |
| `src/store.ts` | What is kept (users, spend, one small record per request) and an in memory store for tests |
| `src/stripe.ts` | Checking a Stripe webhook is genuine, and turning a subscription event into a plan |
| `src/dodo.ts` | The same for Dodo Payments: the signature check, the table of Dodo products to plans, subscription events to plans, once only and in order, and the webhook handler |
| `src/payments.ts` | Which payment provider is on (`none`, `stripe` or `dodo`; default none) and the one webhook address each has |
| `dodo-products.example.json` | The shape of the product table the operator fills in (placeholders only) |

## What is not here (and would be next, after a written yes)
- A real store. The in memory one is not safe across many server instances: two at once could each let a request through. The real one needs one atomic place per user (a Cloudflare Durable Object, or a database transaction), and the same tests must pass against it.
- The Worker that receives requests and Stripe webhooks, the secrets (Squibby's Anthropic key, the Stripe secret), the domain.
- Sign up, email checks, abuse limits on new accounts.
- The app side: a "managed" route in the runner and the sign up screen.

## Promises the tests hold it to
- No prompt, reply, token or Anthropic key is ever in a log event, a stored record or an error message.
- Squibby's key never reaches the user, and the user's token never reaches Anthropic.
- A user cannot run past a limit by more than the requests that were already running together (at most 4 at once, `maxInFlight`): the budget is checked before a request starts and booked when it ends, so those few can each pass it. One request is limited in size and in `max_tokens`, so the overshoot is bounded, not zero.
- The address requests are forwarded to must be https (this machine aside), a redirect from it is never followed (our key would travel with it), and a body is read only up to its size limit.
- A stream that is cut short is still charged for what was used.

## Payments through Dodo Payments (founder's choice, 23 Oct 2026)

Dodo Payments is a merchant of record: it sells the plans, takes the payment and tells this server what happened through webhooks.
Fees, payout timing and terms are Dodo's: read them in the Dodo dashboard and Dodo's own docs, nothing here states them.

**It is off, and it stays off.** Nothing in this folder is deployed or listening. With no provider set (`PAYMENT_PROVIDER` empty or
`none`, the default) no webhook address exists at all. Choosing a provider does not switch managed usage on: that is the separate
remote switch, and it stays off until Anthropic confirms in writing (`docs/decisions/F22-company-pays-for-usage-gated.md`).

### Setting it up (operator, later, after a written yes)
1. In the Dodo dashboard (test mode first) create one product per paid plan and note each product id.
2. Fill in the product table, a JSON object of Dodo product id to plan name (`pro` or `max`). The shape is in
   `dodo-products.example.json`. It is read from the `DODO_PRODUCTS` setting. Product ids are never written in code. A product that
   is not in the table is given no plan, and the webhook answers 503 with a plain sentence naming it, so Dodo tries again after you
   fix the table.
3. Add a webhook in the dashboard that points to `https://<the proxy's own address>/webhooks/dodo` and subscribe it to the
   subscription events (and `payment.succeeded`, which teaches the link below). Copy its signing secret (it starts with `whsec_`) into
   the operator's environment as `DODO_WEBHOOK_SECRET`. **The secret goes in the environment or the host's secret store, never in this
   repo, never in a log.**
4. Set `PAYMENT_PROVIDER=dodo`. The server then serves `POST /webhooks/dodo` and nothing else for payments.
5. When you create a checkout session (on the server, never from the app), put our user id in its `metadata` under
   `companion_user_id`.

### What the code does with a webhook
- **Signature** (Standard Webhooks, as Dodo documents it): headers `webhook-id`, `webhook-timestamp`, `webhook-signature`. HMAC
  SHA256 over `<id>.<timestamp>.<raw body>`, keyed with the base64 part of the secret after `whsec_`, base64 encoded, in a header that
  may hold several `v1,<signature>` entries separated by spaces. Any one match is enough; the comparison does not stop at the first
  difference; a timestamp more than 300 seconds (`DODO_TIMESTAMP_TOLERANCE_SEC`) from now, either way, is refused.
- **Once only:** each `webhook-id` is taken before anything is applied. The same event twice (Dodo retries up to 8 times) changes
  nothing the second time. If applying fails the id is given back, the answer is 500 and Dodo retries.
- **In order:** Dodo says events can arrive out of order and to order them by the payload's `timestamp`. An event older than the newest
  one already applied for that person is skipped.
- **Plans:** active, renewed, unpaused, updated and plan_changed give the mapped plan when the payload status is `active`. `past_due`
  keeps the plan only until `past_due_ends_at`. `on_hold`, `paused`, `failed`, `expired` and `cancelled` drop the person to free at once.
  We chose "at once" for `cancelled` because Dodo's docs do not say whether access runs to the end of the period; a cancel that is only
  scheduled shows as an updated event that is still `active`, which keeps the plan until the cancelled or expired event.
- **Who it is:** the `companion_user_id` in the payload's `metadata`, or else the person learned from an earlier `payment.succeeded`
  that carried it for the same Dodo customer id (the first link wins). Email and name are never used and never logged. An event that
  cannot be matched answers 503 so Dodo delivers it again.
- **Logs:** only a short kind, the event type, the webhook id, our own user id, the plan and an unknown product id. Never the body,
  the secret, an email, a name or an error message. A test greps the output for this.

### What is not proven
No real Dodo test mode webhook has been received yet: the founder has to create the Dodo account. Until then these are unproven and
are marked in `docs/milestones/M13-managed-usage-plan.md`: that checkout `metadata` reaches the subscription events (Dodo's docs say
it is "associated with the payment" and do not say it is copied to the subscription, hence the link learned from the payment);
that the subscription event payload carries `product_id`, `status`, `customer.customer_id` and `past_due_ends_at` as the
subscription API lists them; what `cancelled` means for timing; and the exact request Dodo sends. The store behind the ledger is
in memory: two server instances at once need one atomic place (a Durable Object or a database transaction), as the main note above says.
