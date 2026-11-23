# usage-proxy (Squibby's server, M13, M99, M116): built, tested, not deployed

Squibby's own server. People make an account with one Google click, pay in their browser on Dodo's page, and Pro turns on by
itself from Dodo's signed webhook: no license key and no code to paste (M116, T31). The app sends its model requests here with
its sign in token; this checks the person's plan and daily limit, adds Squibby's own Anthropic key, forwards the request, and
counts what it cost. It also serves the update feed and the switches the app reads.

The flow, route by route:
1. `GET /v1/signin/nonce`: a nonce the server made and signed itself, good for 10 minutes. It writes nothing.
2. The app opens Google in the browser with that nonce; Google gives the app an ID token.
3. `POST /v1/signin/google` with `{"idToken"}`: checked against Google's keys, the client id and the nonce (each nonce works once).
   It answers `{token, plan, email, name, picture}`. The owner is `google:<sub>`, never the email. This works while the model
   switch is off, so people can make an account before forwarding is on.
4. `GET /v1/me` with the token: plan, status, until, renews on, today's and this month's use as a share of the
   limit, and the switches. It writes nothing.
5. `POST /v1/messages` with the token: metered against the plan and forwarded only while `PROXY_ON` is on.
6. `POST /v1/checkout` and `POST /v1/portal`: the server makes Dodo's checkout or billing portal and answers its address. Pro and
   the report are granted only by `POST /webhooks/dodo`, signed by Dodo, never by the return page `/paid`.
7. `POST /v1/signout` and `POST /v1/signout/all`, `POST /v1/report/use`, `POST /v1/account/delete`, `GET /v1/switches`, and the
   update feed `GET /v1/update/{target}/{arch}/{version}` (no token).

**It is not deployed and model requests are switched off.** Only Squibby's own Messages loop and the light lanes may ever run on
Squibby's bill (F29). Anthropic's terms forbid it for the Claude Code engine unless they say yes in writing (`docs/decisions/F22-company-pays-for-usage-gated.md`, `docs/outreach/anthropic-managed-usage-question.md`). Nothing here
runs anywhere until you say so.

Run the tests: `cd usage-proxy && bun test` (and `bun run typecheck`). No dependencies needed for the tests, no network beyond
this Mac, no spending. Check the Cloudflare build without an account: `bun run dry-run` (needs `bun install` first, see below).
Run the whole server on this Mac, end to end: `sh scripts/verify-dev.sh` (below).

## What is here
| File | What it does |
|---|---|
| `src/tokens.ts` | Sign in tokens (random, only the hash kept). A real Anthropic key is never accepted as one |
| `src/plans.ts` | The plan table (Free and Pro) and the daily and monthly limits, in dollars of Anthropic cost. No prices: they live only in `app/src/prices.json` (M97). `allowanceReport` and `scripts/allowance.ts` say how many measured fixes an allowance covers |
| `src/filter.ts` | What may be forwarded: only `/v1/messages`, the models Squibby uses, a size limit, `max_tokens` clamped, prompt cache markers with the 5 minute life only; estimates the prompt's tokens for the hold; sets `metadata.user_id` and removes any `metadata` the client sent |
| `src/userid.ts` | The opaque user id Anthropic sees (keyed hash of the owner id) and the lookup from an id back to an owner |
| `src/accounts.ts` | Issuing a sign in token; refused for a suspended owner |
| `src/google.ts` | Sign in with Google (M21): checks a Google ID token (RS256 against Google's keys, issuer, audience = `GOOGLE_CLIENT_ID`, expiry, verified email) with Web Crypto; the owner is `google:<sub>`. The key set comes from Google's own address, or on a local run only from the stand in Google (`GOOGLE_KEYS_URL`) |
| `src/account-routes.ts`, `src/nonce.ts`, `src/ratelimit.ts` | M116: the sign in nonce, sign in (ahead of the model switch, 10 tries a minute per address), `/v1/me`, sign out, report use, account delete and `/v1/switches` |
| `src/billing-routes.ts`, `src/dodo-api.ts` | M116: checkout and the billing portal, made by the server with Dodo's API (plain `fetch`), and the `/paid` return page that grants nothing |
| `src/updates.ts` | M116: the update feed the Tauri updater reads; the operator's `release set` and `release stop` |
| `src/deleted.ts` | M116: the small "deleted" line kept after "Delete my account", under an HMAC |
| `src/operator-usage.ts`, `scripts/usage-report.ts` | M116: the operator's read only `usage` view (cost per account, totals by plan and model, the day's rows against the free limits), printed on the founder's Mac with the key from his Keychain |
| `src/operator.ts`, `scripts/suspend.ts` | The operator's tool to find, suspend and restore one person (dry run by default) |
| `src/usage.ts` | Reads token counts from a reply (streaming or not) without keeping any text; prices them with the app's own table |
| `src/proxy.ts` | The request handler: switch, token, plan, budget, forward, stream back, book the cost |
| `src/store.ts` | What is kept (users, spend, one small record per request, the plan a payment gave) and an in memory store for tests |
| `src/store-do.ts` | The real store (M99): Cloudflare Durable Objects, one per owner, each doing its read, check and write as one step; small shared ones for a token's owner, the list of owners and the suspension log, and payment event ids. A running slot and a hold free themselves after 30 minutes (`LEASE_MS`). Never a body, a token (only its hash) or a key |
| `src/entry.ts` | The module Cloudflare runs (`wrangler.toml` `main`, M116 step 6): exports only the Worker and `StoreObject`, because workerd refuses a main module that exports anything else |
| `src/worker.ts` | The Cloudflare Worker (M99): every request in, to the update feed, billing, the account routes, the chosen payment webhook, the proxy, or the operator's route (`POST /v1/operator`, only with `OPERATOR_KEY`). `GET /v1/status` says whether the switch is on |
| `wrangler.toml`, `scripts/deploy.sh` | The Cloudflare settings (no account id, no domain, no secret) and the deploy script: a dry run unless `--apply`, and `--apply` refuses until every secret is set |
| `scripts/verify-dev.sh`, `scripts/stand-in-model.ts`, `scripts/stand-in-google.ts`, `scripts/send-test-webhook.ts` | The local run of the whole server under `wrangler dev` (M116 step 6): sign in with a stand in Google, `/v1/me`, a metered request to a stand in model, a signed test webhook, sign out. No account, no key, nothing beyond this Mac |
| `src/stripe.ts` | Checking a Stripe webhook is genuine, and turning a subscription event into a plan |
| `src/dodo.ts` | The same for Dodo Payments: the signature check, the table of Dodo products to plans, subscription events to plans, once only and in order, and the webhook handler |
| `src/payments.ts` | Which payment provider is on (`none`, `stripe` or `dodo`; default none) and the one webhook address each has |
| `dodo-products.example.json` | The shape of the product table the operator fills in (placeholders only) |

## What is not here (and would be next, after a written yes)
- Go live steps, in order: `docs/launch/company-paid-go-live-checklist.md`.
- Done in M99 (15 Nov 2026): the real store (`src/store-do.ts`, the same tests pass against it and the in memory one) and the
  Worker (`src/worker.ts`), with `wrangler.toml` and `scripts/deploy.sh`. Nothing is deployed and no account exists.
- Done in M116 steps 1 to 6 (19 Nov 2026): accounts with Google sign in, `/v1/me`, sign out, checkout and portal, the plan from
  Dodo's webhooks, the report credit, account delete, the operator's `usage` view, the update feed and the switches, and the
  local run of all of it (`scripts/verify-dev.sh`).
- Still to come: the domain, the secrets on Cloudflare (the founder's), the real Google client and Dodo products, and the proof
  on the real server (M116 steps 11 and 12). Stripe's webhook is not built (Dodo Payments is the provider).
- The app side (M116 steps 7 to 10): the sign in, the token's own Keychain item, the Plan card, checkout and portal, updates.

## On Cloudflare (M99): ready, not deployed

**Nothing here creates an account, signs in or deploys by itself.** The founder makes the Cloudflare account and sets the secrets.

1. Install the two tools, pinned to exact versions in `package.json` (both MIT or Apache-2.0): `wrangler` 4.156.0 and
   `@cloudflare/workers-types` 5.20261029.1. The `node_modules` committed here is a link to itself, so remove it first:
   `rm node_modules && bun install`.
2. `bun run dry-run`: builds the Worker into `dist/` and checks that it holds the store and that the `STORE` binding resolves.
   Deploys nothing and needs no account.
3. `sh scripts/verify-dev.sh`: runs the whole server on this Mac (see "Running the whole server on this Mac" below).
4. When the founder is ready: `wrangler login` (his own), then `wrangler secret put <NAME>` for each secret the deploy needs (what
   each is: the comment at the top of `wrangler.toml`). Always `METADATA_USER_ID_SECRET`, `OPERATOR_KEY` and `GOOGLE_CLIENT_ID`;
   `ANTHROPIC_API_KEY` only once `PROXY_ON` is set; `DODO_PAYMENTS_API_KEY`, `DODO_WEBHOOK_SECRET` and `DODO_PRODUCTS` only once
   payments are on (on Dodo's live address `DODO_WEBHOOK_SECRET_LIVE` in place of `DODO_WEBHOOK_SECRET`). Then `bun run deploy`, which refuses while a needed one is missing, and while `DEV_TOKENS`, `UPSTREAM_BASE` or
   `GOOGLE_KEYS_URL` (local only) is set there or written as a var in `wrangler.toml`. It prints plain sentences only; what
   wrangler said goes to `dist/`.
5. The switches: `wrangler secret put PROXY_ON` and type on. Off: `wrangler secret delete PROXY_ON`. Without it nothing is
   forwarded, but sign in, `/v1/me` and sign out still work. `PAYMENTS_ON` and `LOOP_ON` work the same way.
   Audit run 2, finding 5: `PROXY_ON` and payments never go together on Dodo's test address, where anyone can pay with a test
   card. The deploy refuses that pair; move Dodo to live first (deploy with `--live-payments`). While Dodo is in test mode the
   server also gives every paid plan Free's limits, apart from the owner ids listed in `TEST_PAYERS` (comma separated, such as
   the founder's own `google:<sub>`). Each subscription, plan and report credit keeps the Dodo mode it was paid in (one kept
   before modes counts as test). Once Dodo is live, only live ones count: a test card's Pro or report gives nothing there,
   `TEST_PAYERS` no longer applies, and a test subscription blocks neither a real Pro checkout nor an account delete. The deploy
   check reads `PAYMENT_PROVIDER` ignoring case and spaces, and counts it as on when it is a secret.
   Re-attack round 1: an event's Dodo mode comes only from which webhook secret verified it. `DODO_WEBHOOK_SECRET` is test
   mode's and always gives test; `DODO_WEBHOOK_SECRET_LIVE` is live mode's and is the only way an event is kept as live
   (one value in both counts as test). `DODO_API_BASE` plays no part, because it and the secrets never change in one step. A
   subscription kept as test is never moved up to live by a later event. Go live order: put `DODO_WEBHOOK_SECRET_LIVE`, the
   live key and the live `DODO_PRODUCTS`; then deploy the live address with `--live-payments`, which refuses without
   `DODO_WEBHOOK_SECRET_LIVE` and refuses a `DODO_API_BASE` it cannot read for sure (single quotes, a second line in an
   `[env.*]` section, or set as a secret); then delete the test mode webhook in Dodo and the `DODO_WEBHOOK_SECRET` secret.
   Re-attack round 3: the deploy check also reads the `DODO_API_BASE` the dry run binds, and refuses when it is not the same
   as the line in `wrangler.toml` (a line outside `[vars]` binds nothing, which the server reads as test mode). It reads the
   bindings only from wrangler's bindings table, and refuses the deploy unless every row is one binding with a plain name, so
   a var name or value with a line break in it cannot print a binding the Worker does not have. Once live, the
   operator's `usage` view and `refunds` count only live mode payments: a test card's Pro shows as free, a test subscription
   is never a second live one, and a test card's payment for a deleted account is no refund line.

### Running the whole server on this Mac (M116 step 6)
`sh scripts/verify-dev.sh` starts `wrangler dev --local` on 127.0.0.1 with made up settings in a `.dev.vars` file (removed after
the run), and three stand ins, all on this Mac: a model (`scripts/stand-in-model.ts`), Google (`scripts/stand-in-google.ts`,
which makes its own key pair and signs ID tokens for one made up person) and Dodo's webhook (`scripts/send-test-webhook.ts`,
signed with a made up `whsec_` secret). No Cloudflare, Google or Dodo account, no real key, nothing beyond this Mac. It then
proves, each with a `PASS:` line:
1. Sign in: the server's nonce, the stand in's ID token for it, a sign in token on the free plan. The same nonce again is refused.
2. `/v1/me` answers the free plan.
3. One metered request goes to the stand in model with the server's key, never the token, and `/v1/me` then shows today's use.
4. A signed `subscription.active` webhook for that person turns Pro on, and `/v1/me` says so. An unsigned `subscription.expired` (a forged cancel) is refused and Pro stays.
5. After sign out the token gets 401.
6. The server's log holds no sign in token, ID token, email or key.

The Worker reads the stand in's keys only through `GOOGLE_KEYS_URL`, and only when both the request and that address are this
machine; anywhere else it uses Google's own keys. A real deploy refuses the setting. `bun test` runs the same script against a
stand in for `wrangler dev` (Bun serving the real Worker on a fake of the Durable Object API,
`test/dev-stand-in-worker.ts`), so the steps are proven on every test run. The run under real workerd passed on this Mac on
19 Nov 2026 (wrangler 4.156.0, its own workerd, Node 24 or later: wrangler refuses Node 18). It needs the two pinned tools
installed: `rm node_modules && bun install`, or install them in another folder and point `WRANGLER` at that wrangler. The local
store is kept in a temporary folder the script removes, so each run starts empty.

That first real run found three things Bun allows and Cloudflare's runtime refuses, now fixed and tested on a workerd shaped
fetch (`test/workerd-fetch.test.ts`) and an exports check (`test/deploy.test.ts`):
- The main module may export only handlers and classes, so `wrangler.toml` now points at `src/entry.ts`, which exports only
  the Worker and `StoreObject`. `src/worker.ts` still holds everything else.
- `fetch` with `redirect: "error"` throws, so the Google key fetch uses `"manual"` and counts a redirect as no keys.
- The global `fetch` called as a method of another object throws "Illegal invocation", so Dodo's calls call it as a plain
  function. Without this fix every checkout and portal link would have failed (nothing charged).

The operator's suspend and restore work on the real store through the Worker: `POST /v1/operator` with
`Authorization: Bearer <OPERATOR_KEY>` and `{"argv": [...]}`, the same options as `scripts/suspend.ts` (a dry run unless
`--apply`). Without `OPERATOR_KEY` (at least 32 characters) the route is not served.

## Promises the tests hold it to
- No prompt, reply, token or Anthropic key is ever in a log event, a stored record or an error message.
- Squibby's key never reaches the user, and the user's token never reaches Anthropic.
- A user cannot run past a limit by more than the requests that were already running together (at most 4 at once, `maxInFlight`): the budget is checked before a request starts and booked when it ends, so those few can each pass it. Each request holds its worst case while it runs (its prompt, estimated from the body as it is sent on, not as the client wrote it, at about 3 bytes a token with a fixed amount per image, plus its whole `max_tokens` as output), checked and held in one step, on the Durable Object store too, even from two server instances at once. The prompt part must fit under the limits with what is spent and held, so large prompts sent at once cannot all pass at zero spend (audit run 2, finding 6); only the answers can run past. One request is limited in size and in `max_tokens`, so the overshoot is bounded, not zero. A delete is refused as busy while any request may still be running, including one kept open past its 30 minute lease (for up to a day, `HOLD_BUSY_MS`), and a request that ends after a delete writes nothing on the deleted account (audit run 2, finding 6, re-attack round 2).
- Only `/v1/messages` is forwarded: `count_tokens` is refused before the store is touched (audit run 2, finding 3; the app never calls it). A `cache_control` at any depth must be `{ type: "ephemeral" }`, with `ttl` absent or `"5m"`: a 1 hour cache costs more than the price table counts (finding 8). No `anthropic-beta` header is forwarded (the runner sends none).
- The prompt estimate can only price what the body carries, so content that is billed for more than its bytes is refused (audit run 2, finding 6 re-attack). Content blocks are a closed list: `text`, `image`, `tool_result`, `tool_use`, `thinking`, `redacted_thinking`, `server_tool_use`, `web_search_tool_result`, with a tool result holding only text and images. An image must be base64 with an image media type. A document (a PDF is billed per page as an image plus its text, whatever its size in bytes), any `source` of type `url` or `file` (billed in full, a few bytes here), and any other block kind are refused; the runner sends none of them. Only images in real image blocks are priced at the flat image amount. Request fields are a closed list too (`model`, `max_tokens`, `messages`, `system`, `stream`, `metadata`, `tools`, `thinking`, `output_config`, `temperature`, `top_p`, `top_k`, `stop_sequences`), so price changing fields such as `speed`, `service_tier` and `inference_geo` are refused.
- The address requests are forwarded to must be https (this machine aside), a redirect from it is never followed (our key would travel with it), and a body is read only up to its size limit.
- A stream that is cut short is still charged for what was used.
- A store failure is answered with a plain 503 in the API's own error shape ("Nothing was sent to Claude"), never with Cloudflare's
  own error page. A slot taken before the failure is let go. A cost that cannot be booked after Claude answered still sends the
  answer back, and the log says `booking_failed`. The slot and hold are then let go alone, right away and again a few times in
  the background within 20 seconds (`RELEASE_RETRY_MS`), so a short store outage does not leave the person "busy on your other
  Mac" for the 30 minute lease; if every try fails the log says `release_failed`. The booking is never sent twice, because the
  store may have kept it before its reply was lost.
- Two bookings that end around midnight UTC can arrive in the other order. The day and month totals never step back to the
  older day or month: the newer ones are carried forward, and an older day's cost still counts in its month.
- Each running slot and hold carries its request's own id, so a request that ends after its 30 minutes ran out never lets go of
  another request's slot or hold of the same amount.
- Rows written (M116 step 3, the free plan allows 100,000 a day): a model request takes its slot and hold in one step (one
  row), then lets them go and books its record, which also carries the day and month totals, in one more (two rows). At most 3
  rows per request, and none for a refusal (over the limit, or busy on another Mac). Once a day per person, records past 90 days
  are deleted, one row each: that one request writes more rows, as many as there are records to drop (128 keys a delete, until
  the oldest kept record is reached, so even a person with thousands a day never keeps one past 90 days). A model request makes 4 calls to the objects (the token, the person, start, finish).
- The stream reader passes over the reply's own words (text deltas and block lines) as bytes, never decoding them; it reads only
  the start, the last usage update, the stop and an error event. `test/m116-cheaper.test.ts` times it on this Mac as an early
  warning only; the real check is a long fix on the deployed server (V1 in M116).

## How long things are kept (M99 review)
- One small record per request (counts, cost, model, time): 90 days, then dropped, checked at most once a day per person.
- Day and month totals: carried by the newest record, so they go when the records go.
- Sign in token hashes: the newest 50 sign ins per person. Past that the oldest go first, stopped ones before working ones; a
  dropped token stops working and its small object is cleared, so the person signs in again.
- Payment event ids: 48 hours, because Dodo retries a delivery for about 37 hours, each time signed afresh with the same id. The suspension log and the list of owners are kept while the
  service runs, because they are how a notice from Anthropic is matched to a person.
- After "Delete my account" (M116 step 5): the owner's suspension log lines stay, with an HMAC of the owner id in place of it.
  One "deleted" line, under the same HMAC, holds that month's spend and the sign in nonces still good; it goes at the end of
  that month, and never sooner than 3 days after the delete (a checkout lasts 24 hours and Dodo retries for about 37). A
  payment that still reaches Dodo for a deleted account in that time grants nothing and is kept as a refund line (Dodo ids
  only) until the operator refunds it and runs `refunds done <id>`; `usage` shows these first. Two deletes sent at once merge
  their lines (the larger spend stays), and a sign in drops the line only when it is still the exact one that sign in read,
  in one step; a sign in whose token a delete wiped while it ran is refused and the person signs in again (security audit run
  2, findings 2 and 4).

## Telling Anthropic who a request is for, and cutting one person off (24 Oct 2026)

Anthropic's support said (23 Oct 2026) that we are responsible for Usage Policy compliance for everything our users send, so we need our own acceptable use rules and a way to identify and cut off an account (`docs/outreach/anthropic-support-reply-2-2026-10-23.md`). The rules and the runbook are drafts: `docs/legal/acceptable-use-draft.md`, `docs/legal/abuse-process.md`. This is the code side. Still off: nothing here turns the route on.

**The opaque id.** Every forwarded message request carries `metadata: { user_id }`, which Anthropic documents as an opaque identifier for the end user. Ours is HMAC SHA256 of the owner id, keyed with the operator's secret, as 64 hex characters: stable per person, different between people, no email or name, not reversible without the key.
- The secret is the setting `METADATA_USER_ID_SECRET`, at least 32 characters, in the operator's environment (the proxy gets it as `userIdSecret`). **There is no default.** Missing or short, the proxy forwards nothing and answers 503 with a plain sentence ("not ready yet. Nothing was sent to Claude"). With the switch off, the switch's message still comes first.
- Whatever `metadata` the client sent is removed and replaced, so no client can choose its own id or use someone else's.
- `count_tokens` is no longer forwarded at all (audit run 2, finding 3), so the question of its `metadata` field is gone.
- The id and the secret are never logged or stored, and not in any reply to the user.
- **Back up the secret apart from the server. Changing it changes every id**, so ids in older Anthropic notices can no longer be matched.

**Cutting one person off.** `Store` has `suspendOwner` (every token of the owner stops at once, and a flag blocks new ones), `restoreOwner` (new tokens allowed again; old ones stay dead), `isSuspended`, `listOwnerIds` and `suspensions` (a log of owner id, date, case id; no text). The flag is separate from a token's status, so a late payment event that writes a plan cannot lift it. `issueToken` refuses a suspended owner. The proxy answers a suspended person with a 403 and "account is paused".

**The operator command**, `scripts/suspend.ts` (Bun). A dry run unless `--apply`:
```
bun scripts/suspend.ts --store <module> --user-id <the id Anthropic reported> [--apply] [--case <ref>]
bun scripts/suspend.ts --store <module> --owner <our owner id> [--apply] [--case <ref>]
bun scripts/suspend.ts --store <module> --owner <our owner id> --restore [--apply]
```
`--user-id` needs `METADATA_USER_ID_SECRET` in the environment: it derives each owner's id again and prints the owner whose id matches. `--case` is a short reference of ours (letters, digits, - and _), never a message. It prints only ids and plain sentences. The real store lives on Cloudflare (M99), where the same steps run through the Worker's operator route (above). Run here, the script loads a store from a module you name (`--store`, or the `SUSPEND_STORE` setting) whose default export is a `Store` or a function returning one; with none it says so and stops. It is tested against the in memory store only. Any real store must implement the same interface and pass the same tests in `test/abuse.test.ts`, including that a payment update cannot lift a suspension.

## Payments through Dodo Payments (founder's choice, 23 Oct 2026)

Dodo Payments is a merchant of record: it sells the plans, takes the payment and tells this server what happened through webhooks.
Fees, payout timing and terms are Dodo's: read them in the Dodo dashboard and Dodo's own docs, nothing here states them.

**It is off, and it stays off.** Nothing in this folder is deployed or listening. With no provider set (`PAYMENT_PROVIDER` empty or
`none`, the default) no webhook address exists at all. Choosing a provider does not switch managed usage on: that is the separate
remote switch, and it stays off until Anthropic confirms in writing (`docs/decisions/F22-company-pays-for-usage-gated.md`).

### Setting it up (operator, later, after a written yes)
1. In the Dodo dashboard (test mode first) create the two Pro products, monthly ($15) and yearly ($144) as in `app/src/prices.json` (F31),
   and the $29 report (one time), and note each product id. Turn license keys off on all three (T31).
2. Fill in the product table (M116): each Dodo product id with its item, `{"item": "pro_monthly", "plan": "pro"}`,
   `{"item": "pro_yearly", "plan": "pro"}` and `{"item": "report", "once": true}`. The shape is in
   `dodo-products.example.json`. It is read from the `DODO_PRODUCTS` setting. Product ids are never written in code. A product that
   is not in the table is given no plan, and the webhook answers 503 with a plain sentence naming it, so Dodo tries again after you
   fix the table.
3. Add a webhook in the dashboard that points to `https://<the proxy's own address>/webhooks/dodo` and subscribe it to the
   events `subscription.*`, `payment.succeeded`, `payment.failed`, `refund.succeeded`, `dispute.opened` and `dispute.lost`. Copy its signing secret (it starts with `whsec_`) into
   the operator's environment as `DODO_WEBHOOK_SECRET` (test mode's; live mode's webhook goes in `DODO_WEBHOOK_SECRET_LIVE`). **The secret goes in the environment or the host's secret store, never in this
   repo, never in a log.**
4. Set `PAYMENT_PROVIDER=dodo`, `PAYMENTS_ON` and `DODO_PAYMENTS_API_KEY` (a `dodo_test_` key while `DODO_API_BASE` in
   `wrangler.toml` is `https://test.dodopayments.com`). The server then serves the webhook, `POST /v1/checkout` and `POST /v1/portal`.
5. Checkouts are made only here (M116, `src/billing-routes.ts`): the app sends an item name, the server picks the product id, puts
   the owner from the sign in token in `metadata.companion_user_id` with its signature in `metadata.companion_sig` (an HMAC keyed
   from `METADATA_USER_ID_SECRET` under its own label, `src/owner-sig.ts`), locks the account's email, and answers the checkout
   address. Without a usable `METADATA_USER_ID_SECRET` no checkout is made.
   A second Pro is refused while one subscription is live, and the report while Pro includes it. The browser comes back to
   `/paid`, which drops its query (Dodo puts the email there) with a 303 to `/paid/done`, logs nothing and grants nothing.
   Cloudflare's invocation logs are off in `wrangler.toml` for the same reason.

### What the code does with a webhook
- **Signature** (Standard Webhooks, as Dodo documents it): headers `webhook-id`, `webhook-timestamp`, `webhook-signature`. HMAC
  SHA256 over `<id>.<timestamp>.<raw body>`, keyed with the base64 part of the secret after `whsec_`, base64 encoded, in a header that
  may hold several `v1,<signature>` entries separated by spaces. Any one match is enough; the comparison does not stop at the first
  difference; a timestamp more than 300 seconds (`DODO_TIMESTAMP_TOLERANCE_SEC`) from now, either way, is refused.
- **Once only:** each `webhook-id` is taken before anything is applied. The same event twice (Dodo retries up to 8 times) changes
  nothing the second time. If applying fails the id is given back, the answer is 500 and Dodo retries.
- **In order:** Dodo says events can arrive out of order and to order them by the payload's `timestamp`. M116: an event older than the
  newest one already applied for that subscription is skipped (each subscription is ordered on its own).
- **Plans (M116):** the plan is kept per subscription, and the person's plan is the best of their subscriptions, so a cancel or an
  expiry of one never drops someone who has another that is live. Active, renewed, unpaused, updated and plan_changed give the mapped
  plan when the payload status is `active`; with `cancel_at_next_billing_date` true and a future `next_billing_date` it is
  `cancelling` (Pro until that date), and the flag back to false undoes it. `cancelled` keeps Pro until `next_billing_date` the same
  way, otherwise it is Free at once, as is `expired`. `past_due` keeps the plan only until `past_due_ends_at`. `on_hold`, `paused` and
  `failed` are Free with status `on_hold` ("payment failed, fix it in billing"). The Dodo customer id is saved from events whose
  metadata names the person, for the billing portal, unless that customer is already linked to someone else (then it is left
  where it is and `link_conflict` is logged). It is kept with the Dodo mode of the webhook secret that verified the event (test or live): checkout and the
  portal use only an id from the mode the server is in now, so test ids are never sent to live Dodo. The portal opens the
  customer of the newest live subscription first.
- **The report (M116):** `payment.succeeded` for the report product adds one credit keyed by `payment_id` (a retry or a repeat never
  adds two). Its product comes from `product_cart`, or is read back from Dodo when the event has none. A one time payment whose
  product is neither the report nor Pro in the table (the report product is missing, or the table cannot be read) answers 503
  `unknown_product`, so Dodo delivers it again once the table is fixed; it is never dropped with a 200. `refund.succeeded` with
  `is_partial` false, or `dispute.lost`, takes back that credit if unused; a used one stays used and is logged. One that arrives
  before its payment leaves a marker by `payment_id`, so the payment, when Dodo delivers it, gives no credit. A refund or dispute of
  a subscription payment changes no plan: Pro follows the subscription events Dodo sends after it.
- **Who it is:** the `companion_user_id` in the payload's `metadata`, only when its `companion_sig` checks out with
  `METADATA_USER_ID_SECRET`, or else the person learned from an earlier `payment.succeeded` that carried a signed one for the same
  Dodo customer id (the first link wins). Unsigned metadata is never trusted: a Dodo static `/buy/` link lets anyone set
  `metadata_companion_user_id` to someone else's id (security audit run 2, finding 1). A customer id once saved for a Dodo mode is
  never replaced by another of the same mode. Email and name are never used and never logged. An event that
  cannot be matched answers 503 so Dodo delivers it again.
- **Logs:** only a short kind, the event type, the webhook id, our own user id, the plan and an unknown product id. Never the body,
  the secret, an email, a name or an error message. A test greps the output for this.

### What is not proven
No real Dodo test mode webhook has been received yet: the founder has to create the Dodo account. Until then these are unproven and
are marked in `docs/milestones/M13-managed-usage-plan.md`: that checkout `metadata` reaches the subscription events (Dodo's docs say
it is "associated with the payment" and do not say it is copied to the subscription, hence the link learned from the payment);
that the subscription event payload carries `product_id`, `status`, `customer.customer_id` and `past_due_ends_at` as the
subscription API lists them; what `cancelled` means for timing; and the exact request Dodo sends. On Cloudflare (M99) the ledger's
event ids live in one Durable Object and each person's newest applied time and plan in their own, so an older event is skipped in
the same step as the write, across server instances too.
