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

## What is not here (and would be next, after a written yes)
- A real store. The in memory one is not safe across many server instances: two at once could each let a request through. The real one needs one atomic place per user (a Cloudflare Durable Object, or a database transaction), and the same tests must pass against it.
- The Worker that receives requests and Stripe webhooks, the secrets (Squibby's Anthropic key, the Stripe secret), the domain.
- Sign up, email checks, abuse limits on new accounts.
- The app side: a "managed" route in the runner and the sign up screen.

## Promises the tests hold it to
- No prompt, reply, token or Anthropic key is ever in a log event, a stored record or an error message.
- Squibby's key never reaches the user, and the user's token never reaches Anthropic.
- A user cannot run past a limit by more than one request.
- A stream that is cut short is still charged for what was used.
