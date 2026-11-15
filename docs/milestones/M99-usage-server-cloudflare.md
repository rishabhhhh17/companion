# M99: The usage server ready to deploy on Cloudflare (nothing deployed, no account)

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written, including the two new developer tools named below). Built 15 Nov 2026, tests pass. Not committed. Nothing was spent and nothing was deployed: no Cloudflare account, no domain, no secret, no real model call, no Anthropic key. Stand in models, a fake of the Durable Object storage and a stub `wrangler` only.

## Why (repo, read 15 Nov 2026)

M100's fixing loop needs the usage server to carry Squibby's key, so the key never sits on a customer's Mac. `usage-proxy/` was built and tested, but it could not be deployed:

- There was no Worker entry and no `wrangler.toml`.
- `package.json` had only `test` and `typecheck`.
- The store was in memory only. The README said it was "not safe across many server instances" and needed one atomic place per user.
- M50 step 1 (planned 1 Nov) was still not built.

What the person gets: nothing visible yet. It is the base that lets Squibby pay for fixes safely.

## What to build (from the plan)

1. `usage-proxy/src/worker.ts`: the Worker `fetch` entry that wires the existing `proxy`, `filter`, `usage`, `tokens`, `payments`, `dodo`, `google` and `operator` modules. Keep the switch: off unless `PROXY_ON` is set.
2. `usage-proxy/src/store-do.ts`: a Durable Object class with one object per owner id. It implements the existing store interface (budgets, metering, suspension flag, ids and dates only log) with an atomic read, check and write in one object. It never stores a request or reply body.
3. `usage-proxy/wrangler.toml`: name, `main = "src/worker.ts"`, `compatibility_date`, the Durable Object binding and a `[[migrations]]` block, placeholder routes with no real domain, every secret named only in a comment, no account id.
4. `usage-proxy/scripts/deploy.sh`: a dry run by default (`wrangler deploy --dry-run --outdir dist`, then a check that the bundle builds and the bindings resolve). `--apply` is needed to really deploy, and it refuses unless every named secret is already set (`wrangler secret list`). Plain sentences only, never a secret, never creates an account or a namespace.
5. `package.json` scripts: `dry-run`, `dev` (`wrangler dev`, local only) and `deploy` (calls the script).
6. Dev dependencies pinned to exact versions, no caret: `wrangler` and `@cloudflare/workers-types` (both "MIT OR Apache-2.0", read from npm on 15 Nov 2026).
7. Update `usage-proxy/README.md` "What is not here" and the architecture row.

## Tests first (from the plan)

- The existing store tests run against `store-do.ts` through a small fake of the Durable Object storage API, so the same tests pass on both stores.
- Two requests at once for one owner cannot both pass a limit that only one fits.
- The Worker refuses to forward without `METADATA_USER_ID_SECRET`, as the proxy does.
- The Worker answers "off" when the switch is unset.
- `deploy.sh` without `--apply` never calls a real deploy (a stub `wrangler` on PATH).
- [verify] `wrangler dev` starts locally and serves one fake metered request.

## Rules it must hold

- Rule 1 changes only with the M100 plan (left alone here).
- Never keep a request or reply body.
- Never commit a secret (`.gitignore`).
- No account created, nothing deployed.
- The fix allowance stays as it is ($5 a month on Pro). The founder chose "measure, then decide" on 15 Nov 2026; `scripts/allowance.ts` (M97) does the measuring.

## Built

- **The real store** (`usage-proxy/src/store-do.ts`). One Durable Object class, `StoreObject`, reached only through its binding with `stub.fetch` (so building and testing it needs nothing from Cloudflare). Objects by name:
  - `owner:<id>`: the person's token hashes and each one's plan and status, the suspension flag, the plan a payment gave them and that event's time, today's and this month's spend, the running slots, the holds, and one record per request (counts, cost, model, time; only those fields are kept, whatever else is passed).
  - `token:<hash>`: which owner a token hash belongs to. A hash never moves to another owner.
  - `directory`: the owners in the order they came, and the suspension log (ids, dates, case references only).
  - `payments`: Dodo event ids (dropped after the 15 minute keep window) and Dodo customer links.
  Each object runs its calls one at a time with its own queue, so the read, check and write of `hold`, `begin`, `suspend`, `setPlan` and `claim` are one step, whatever they wait on. `DurableStore` implements the existing `Store` interface on top; `DurableDodoLedger` and `DurableLinkBook` implement Dodo's.
- **Leases.** A running slot and a hold lapse after 30 minutes (`LEASE_MS`, longer than the longest answer the proxy allows), so a server instance that stopped mid request cannot leave a person stuck at "too many at once" or short of budget for good. The in memory store needs none (it lives and dies with its instance).
- **One store interface change.** `Store.hold` takes the plan's limits as data (`Plan`) instead of a function, because a function cannot be sent to another place to be checked there. The check is the same `budgetCheck`. `Store.setOwnerPlan` is new (both stores): the plan from a payment event wins over the plan written with each token; an event older than one already applied changes nothing, in the same step; a suspension still wins over everything; a revoked token stays revoked. `User.planUntil` carries Dodo's `past_due_ends_at`, and the proxy treats the person as Free from then on.
- **Dodo's `apply` gets the event's time** (`apply(entitlement, at)`), so the Worker writes the plan with that time on the owner's own object.
- **The Worker** (`usage-proxy/src/worker.ts`), wiring the proxy, filter, usage, tokens, payments, dodo, google and operator modules:
  - Every request goes to the proxy (switch, token, plan, budget, forward, meter) unless it is one of the routes below.
  - The switch `PROXY_ON`: off unless it is exactly on, 1 or true; unset is off.
  - Without `METADATA_USER_ID_SECRET` (or one too short) nothing is forwarded, as before. New in the proxy: without `ANTHROPIC_API_KEY` nothing is forwarded either.
  - `GET /v1/status` answers `{ service, on }`, nothing more.
  - The payment webhook only for the provider set in `PAYMENT_PROVIDER` (default none, in `wrangler.toml`). Stripe answers a plain sentence that its webhook is not built here.
  - `POST /v1/operator`: the operator's suspend and restore on the real store (the same options as `scripts/suspend.ts`, a dry run unless `--apply`), only with `Authorization: Bearer <OPERATOR_KEY>` (at least 32 characters, compared in constant time). Without the key the route is not served.
  - A streamed reply's booking is kept alive with `ctx.waitUntil` (new `waitUntil` in the proxy's deps).
  - Google's key set is kept per client id for the instance's life; everything else is made per request, so one request's `waitUntil` is never used for another's.
  - For local runs only: `UPSTREAM_BASE` (a stand in model on this Mac) and `DEV_TOKENS=on`, which serves `POST /v1/dev/token` only when the request's address and `UPSTREAM_BASE` are both this machine.
- **`usage-proxy/wrangler.toml`**: name `squibby-usage`, `main = "src/worker.ts"`, `compatibility_date = "2026-10-15"`, `workers_dev = false`, `preview_urls = false`, a commented placeholder route with no real domain, `PAYMENT_PROVIDER = "none"`, the `STORE` binding to `StoreObject`, the `v1` migration with `new_sqlite_classes`, observability on (the logs are the proxy's safe events only). Every secret is named in a comment, never a value. No account id.
- **`usage-proxy/scripts/deploy.sh`**: always the dry run first (`wrangler deploy --dry-run --outdir dist`), then a check that `dist/worker.js` holds `StoreObject` and that the dry run named the `env.STORE` binding. With no option it stops there and says nothing was deployed. `--apply` reads only the secret names (`wrangler secret list --format json`), refuses while any required one is missing (naming each, with the command to set it), refuses while a local only setting (`DEV_TOKENS`, `UPSTREAM_BASE`) is set on Cloudflare, and only then deploys. It prints plain sentences only; what wrangler said is saved in `dist/`. It never signs in, and never creates an account or anything on one by itself.
- **`package.json`**: `dry-run`, `dev` (`wrangler dev --local --ip 127.0.0.1`) and `deploy` (the script with `--apply`). Dev dependencies pinned with no caret: `wrangler` 4.156.0 (29 Oct 2026) and `@cloudflare/workers-types` 5.20261029.1 (29 Oct 2026), both at least two weeks old and both "MIT OR Apache-2.0" (npm, read 15 Nov 2026). They are named, not installed: the tests and the type check need neither.
- **The local check of `wrangler dev`**: `usage-proxy/scripts/verify-dev.sh` with `usage-proxy/scripts/stand-in-model.ts`.
- **Docs**: `usage-proxy/README.md` ("What is not here" and a new "On Cloudflare" section), the architecture row, the go live checklist items 12 and 13, a note in the M50 plan, `docs/research/technical_research.md` section 20 item 44, and `CHANGELOG.md`.

## Tests

Before: 215 tests in `usage-proxy`. After: 361, all passing.

- `test/stores.ts` and `test/fake-do.ts`: the two stores, and a fake of Durable Object storage whose every call yields, so other work runs in between as it can on Cloudflare. `test/proxy.test.ts`, `test/abuse.test.ts` and `test/google.test.ts` now run every test on both stores. The only edits to them: the store comes from `TEST_STORES`, and the few `addUser` calls a test made without waiting now wait (the Durable Object store's is asynchronous). No expectation changed.
- `test/store-do.test.ts`: the store's promises on both stores (two holds where one fits, never more slots than allowed, payment plans, suspension wins, the owner list); that the fake really loses an update without the object's queue; two requests at once from two server instances, only one passes; leases; nothing kept but ids, dates, counts and dollars; unknown and failing steps answer without detail; Dodo event ids once only across instances, the keep window, links. With the object's queue removed, five of these fail.
- `test/worker.test.ts`: the switch (unset is off, and nothing reaches the stand in model), the refusals without `METADATA_USER_ID_SECRET` or `ANTHROPIC_API_KEY`, one metered request end to end to a stand in model on 127.0.0.1 (plain and streamed, the booking kept alive), no prompt, reply, token, key or secret in logs or objects, payments off by default, Dodo on with once only and stale events, Stripe's plain answer, the operator's route, and the local only token route.
- `test/deploy.test.ts`: `deploy.sh` with a stand in `wrangler` on PATH (no option never calls a real deploy; a failed build or binding stops it; `--apply` refuses while a secret is missing, while the names cannot be read, and while a local only setting is set; it deploys once when all are set and prints no secret and none of wrangler's words); `verify-dev.sh` end to end on a stand in for `wrangler dev` that serves the real Worker with Bun; and `wrangler.toml` and `package.json` read as text (no account id, no route, no secret, the store bound to the exported class, exact versions).

## Changed from the plan, and why

- **`TOKEN_SIGNING_KEY` is not a secret here.** The plan listed it, but sign in tokens are random and only their hash is kept (`src/tokens.ts`); nothing signs them. The operator's route needs its own key instead, so the list has `OPERATOR_KEY`.
- **Stripe's webhook secret is named but not required.** Stripe's webhook is not built (Dodo Payments is the founder's choice, 23 Oct 2026), so the Worker answers Stripe with a plain sentence and the deploy does not ask for its secret. `DODO_PRODUCTS` (the product table) is required alongside Dodo's secret.
- **The switch lives in a secret, not in `[vars]`.** `[vars]` would be rewritten by every deploy; a secret stays until the founder deletes it. With nothing set it is off.
- **One object per owner, plus a few small shared ones.** A token is looked up by its hash and the operator lists owners and the log, which one object per owner cannot answer alone.
- **The operator's route and the local only token route are new.** The plan wires the operator module; on Cloudflare the store can only be reached through the Worker, so the operator needs a route. The test token route exists so `wrangler dev` can serve one metered request with no Google sign in; it is served only on this machine.

## Review fixes (16 Nov 2026)

Eight findings from the M99 review, all fixed, each with a test that failed first. 361 tests before, 376 after, all passing.

- **A store failure gets a plain answer.** A Durable Object call that fails now gets a 503 in the API's own error shape ("Nothing was sent to Claude"), from the proxy and, as a backstop, from the Worker for every route (operator, webhook, local token). Before, the Worker threw and Cloudflare sent its own HTML page. The log line is `{kind: "refused", reason: "store_failed"}`.
- **A hold that fails lets the slot go.** Before, the slot stayed taken for the 30 minute lease.
- **A booking that fails after Claude answered still sends the answer back.** It is logged as `booking_failed`, and the hold and slot are let go. Letting go is best effort; a step the store cannot finish frees itself after the lease.
- **Each slot and hold has its request's own id** (`crypto.randomUUID()`). A request that ends after its lease ran out lets go of only its own, never another request's of the same amount. Without an id (an older caller) the old behaviour stays.
- **`deploy.sh --apply` also refuses `DEV_TOKENS` or `UPSTREAM_BASE` as a plain var**, in the dry run's bindings or in `wrangler.toml` (comments aside).
- **A payment event out of date across server instances is answered and logged as stale**, not applied: `apply` can answer false.
- **`POST /v1/operator` answers 200 only when the step happened** (or a dry run worked), and 422 otherwise, with the same body.
- **What is kept has a stated limit** (README, "How long things are kept"): request records 90 days, day totals this month only, month totals for the months those records cover, the newest 50 sign ins per person (stopped ones dropped first, and their token objects cleared). Pruning runs at most once a day per person.

## [verify] on a real Mac

Also in `docs/research/technical_research.md` section 20, item 44. None needs money; (c) needs the founder's Cloudflare login.

- (a) In `usage-proxy`: `rm node_modules && bun install` (the committed link points at itself), then `bun run dry-run`. It should say "The dry run passed". This checks wrangler 4.156.0's real dry run output (the script looks for `env.STORE` and `StoreObject`) and that `preview_urls` and `[observability]` are accepted.
- (b) `sh scripts/verify-dev.sh`. It should end with "PASS: one metered request went through wrangler dev to the stand in". This checks the real workerd run: the Durable Object, the stand in reply, and the booking (one `"kind":"request"` line with a usd above 0 in `dist/dev.log`).
- (c) At the first real deploy, with the founder's own `wrangler login`: that `wrangler secret list --format json` prints `"name": "X"` as the script reads it, and that setting a secret before the first deploy behaves as wrangler says (it may offer to create the Worker; that is the founder's yes).
- (d) Under real load, that the object's one at a time order holds. Cloudflare's input gates already hold storage calls; the object's own queue covers the rest.

## Not done here (on purpose)

- Nothing deployed, no account, no domain, no secret set, no real model call.
- AGENTS.md rules 1 to 4 are unchanged (M100).
- The proxy's own refusals still mention "your own Claude key". They reach only the app's managed route, which is off; M100 rewrites them with rules 1 to 4.
- The $5 Pro allowance is unchanged (the founder's call after measuring).
