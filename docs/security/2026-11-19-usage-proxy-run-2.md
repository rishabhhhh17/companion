# Security audit run 2: usage-proxy at 92f86ef (19 Nov 2026)

Copied from the audit run's `REPORT.md` (the report text, taken out of the run's JSON wrapper) on 19 Nov 2026, with a **Fixed in** line added under each finding. Every fix has a test that reproduced the attack first.

I couldn't write `REPORT.md` to `/Users/rishabhkapadia17/security-audit-skill/companion-usage-proxy/run-2/`. The harness blocks subagents from writing report files, so the report content is below instead.

**Counts:** 8 confirmed findings: 0 critical, 0 high, 3 medium, 5 low. No finding allows an account takeover, reading another person's data, or using the model without signing in. The costs fall on Squibby's own Anthropic bill or on the shared server's availability. AGENTS.md rules 1 and 2 are not broken.

Target `usage-proxy/` at commit `92f86ef` (clean worktree). Line numbers below are checked against that commit; some hunters had quoted older ones. No target file was changed, nothing was deployed, and no real service was contacted. All checks ran on copies under `run-2/agents/*/scratch/`.

**1. Medium: a Dodo static `/buy/` link can put an outsider's Dodo customer on someone else's account** (`usage-proxy/src/dodo.ts:440`; also `learnLink` :553, `owner.saveCustomer` `store-do.ts:357`)
- **Attack:** the attacker buys the report on the static link with `metadata_companion_user_id=google:<victimSub>`. The webhook trusts the metadata, so `learnLink` and `saveCustomer` replace the victim's saved customer with `cus_attacker`.
- **Result** (`agents/verify-static-link/scratch/up/poison.test.ts`): the victim's next checkout and portal use the attacker's customer. The attacker can see the victim's payments and cancel the victim's subscription. This only works if static links are on in the Dodo dashboard.
- **Fix:** sign the owner id at `/v1/checkout`, for example with `companion_sig = HMAC(METADATA_USER_ID_SECRET, label + ownerId)`. Trust the metadata only when that signature checks out, in `ownerOf`, `learnLink`, `decideDodoEvent` and `paymentEvent`. `saveCustomer` should not replace an existing customer id of the same mode.
- **Test:** an event naming owner B without a valid signature leaves B's `customerId` and the link book unchanged.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `src/owner-sig.ts` (new: HMAC of the owner id, key derived from `METADATA_USER_ID_SECRET` under its own label), `/v1/checkout` signs `companion_sig` and refuses without the secret, `dodo.ts` (`ownerOf`, `learnLink`, `decideDodoEvent`, `paymentEvent` trust only signed metadata), `owner.saveCustomer` and `MemoryStore.saveCustomer` never replace a saved id of the same mode. Tests: `test/m116-owner-sig.test.ts`.

**2. Medium: two delete requests sent at once overwrite the deleted line with zero spend** (`usage-proxy/src/store-do.ts:681`; `owner.wipe` :266)
- **Attack:** the second `owner.wipe` runs on an already empty owner. It builds a line with $0 and no nonces, and that line overwrites the real one.
- **Result** (`agents/verify-double-delete/scratch/dd.test.ts`): after signing in again, the full Free allowance is back. The user can repeat this daily.
- **Fix:** `owner.wipe` refuses when the caller's token hash is gone. `dir.deletedPut` keeps the larger amounts and the union of nonces.
- **Test:** send two parallel deletes, sign in again, and check that `/v1/me` still shows the spend.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `owner.deleteInfo` and `owner.wipe` refuse (`gone`) when the asking token is no longer on the owner, and `dir.deletedPut` merges with a kept line (`mergeDeletedLines`: larger amounts, union of nonces). Tests: `test/audit-run2-delete.test.ts`.

**3. Medium: `count_tokens` skips the budget and writes 2 Durable Object rows per call** (`usage-proxy/src/proxy.ts:155-156`, `filter.ts:14`, `filter.ts:52`)
- **Attack:** an account over its budget still gets 100 out of 100 calls served, with no rate limit. Each call writes 2 rows and makes 4 DO requests.
- **Result** (`agents/hunter-area4/scratch/wt/usage-proxy/test/zz-count-tokens-rows.test.ts`): about 25,000 calls use up the free daily DO quota, after which sign ins, model requests and Dodo webhooks fail for everyone. How Cloudflare enforces the quota once it is passed still needs checking on a real deploy.
- **Fix:** remove the path from `PATHS`, since the app never calls it. If it must stay, write no rows for it and refuse it when the account is over budget.
- **Test:** zero rows written per call, and a refusal when over budget.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `/v1/messages/count_tokens` removed from `PATHS` in `filter.ts`, and the free path removed from `proxy.ts`. Tests: `test/audit-run2-metering.test.ts` (finding 3).

**4. Low: a sign in racing an account delete skips the deleted line** (`usage-proxy/src/store-do.ts:621`)
- **Attack:** sign in reads the deleted line and writes the owner in two separate DO calls. A delete that lands between them is missed.
- **Result** (`agents/hunt-auth-sessions/scratch/repo/usage-proxy/test/zz-race.test.ts`): spend resets to zero, a following delete loses the carried spend for good, and an already used nonce is accepted again.
- **Fix:** read `deletedGet` again after `owner.signIn`. If a line now exists, use one owner op to refuse a used nonce or apply the carry.
- **Test:** hold a sign in between its two calls and run a delete in that gap.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `DurableStore.signIn` reads the deleted line again after `owner.signIn` and settles a new one in one owner op (`owner.lateLine`); re-attack: it checks the token is still held (`owner.holdsToken`) and drops only the very line it settled (`dir.deletedDropIf`). Tests: `test/audit-run2-delete.test.ts` (finding 4 and its re-attack).

**5. Low: in Dodo test mode, a free test card gives real Pro limits** (`usage-proxy/src/worker.ts:147`, `proxy.ts:148`, `scripts/deploy.sh:80-111`)
- **Attack:** in the state M116 steps 11 and 13 describe (Dodo test mode, `PROXY_ON` on), anyone pays with the 4242 test card and gets Pro limits.
- **Result:** about $3 a month extra per account, paid on Squibby's key. M116 step 13 contradicts go live checklist item 13.
- **Fix:** `deploy.sh` refuses `PROXY_ON` with `PAYMENTS_ON` on the test Dodo address. Or the proxy caps any paid plan at Free in test mode, with an optional `TEST_PAYERS` allowlist.
- **Test:** a test mode `subscription.active` gives Free limits.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `scripts/deploy.sh` refuses `PROXY_ON` with payments on the test Dodo address (reading `PAYMENT_PROVIDER` ignoring case and spaces, and as a secret); the proxy holds paid plans to Free in test mode apart from `TEST_PAYERS`; re-attack: subscriptions, plans and report credits keep their Dodo mode, and once live only live ones count (limits, `/v1/me`, report use, checkout, delete). Tests: `test/audit-run2-f5f7.test.ts`, `test/audit-run2-f5-golive.test.ts`.

**6. Low: the budget hold covers output tokens only** (`usage-proxy/src/proxy.ts:155`)
- **Attack:** 4 parallel requests with `max_tokens: 1` and about 190k token prompts all pass the budget check at zero spend.
- **Result** (`agents/verify-input-hold/scratch/hold.test.ts`): $3.04 booked against a $0.20 day limit and a $2 month limit, about 1.5x the designed monthly cost per Free account.
- **Fix:** add an input estimate (body bytes divided by about 3, capped at the context window) to the hold, and refuse when spent plus hold exceeds the limit.
- **Test:** 4 concurrent large prompts stay under the limit plus one request.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `filter.ts` estimates the prompt (bytes / 3, images at a flat rate, capped at the context window) and the hold covers it; `budgetCheck` refuses when spent plus the prompt passes a limit; re-attack: only known request fields and content blocks the body carries (no url or file sources). Tests: `test/audit-run2-metering.test.ts` (finding 6 and its re-attack).

**7. Low: non streamed requests are not kept alive with `waitUntil`** (`usage-proxy/src/proxy.ts:220-222`)
- **Attack:** a client that sends `stream:false` and disconnects may cancel the booking.
- **Result:** not reproduced. Whether this costs money depends on whether Anthropic bills an aborted call, which the source can't show.
- **Fix:** wrap the fetch through book and release in one promise passed to `d.waitUntil`.
- **Test:** an abandoned handler still books.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `proxy.ts` runs the forward, the reading of a non streamed reply, the booking and the let go as one promise passed to `waitUntil`. Tests: `test/audit-run2-f5f7.test.ts` (finding 7).

**8. Low: 1 hour cache writes are booked at the 5 minute rate** (`usage-proxy/src/usage.ts:10`, `filter.ts` `checkRequest`)
- **Attack:** the filter forwards `cache_control.ttl:"1h"` unchanged, but the server books every cache write at the 5 minute rate.
- **Result** (`agents/verify-ttl/scratch/t.ts`): 190k tokens of 1 hour writes booked at $0.95 against about $1.52 real, so about 37.5% under booked. The live rate still needs checking.
- **Fix:** refuse any TTL other than `5m` at every depth, or price `ephemeral_1h_input_tokens` at 2x input. Consider allowing no `anthropic-beta` values.
- **Test:** a request with a `1h` TTL is refused.
- **Fixed in:** the commit "M116: Fix the 8 findings from security audit run 2" on `m116/accounts`. `filter.ts` refuses any `cache_control` other than `{type: "ephemeral"}` with no ttl or `5m`, at every depth, and `proxy.ts` forwards no `anthropic-beta` header. Tests: `test/audit-run2-metering.test.ts` (finding 8).

**Covered** (53 units in `run-2/coverage-ledger.md`):
- Dodo webhook: signature checks, replay, owner attribution, customer links, plan states, report credits.
- Google sign in: ID token verification, key cache, nonce, suspension.
- Account tokens and account routes, including account delete.
- Billing routes and the Dodo API client.
- Operator route and update feed.
- Model proxy: request filter, metering, budget holds, headers passed through.
- Cross cutting: route order, error and log leaks, multi step DO sequences, storage growth, deploy config, secrets.
- Runner client token handling.

**Not covered:**
- App steps 7 to 10 of M116, which are not built at this commit.
- Cloudflare, Dodo, Google and Anthropic dashboard settings, and any live deploy.
- Outside facts the findings depend on: Cloudflare's behaviour past the free quota, Anthropic billing of dropped calls, the 1 hour cache rate, and whether longer context betas are accepted.
- The existing test suite was not run against the target itself, because two of its tests may start workerd or wrangler and write files next to the target.
- This was one standard pass with no earlier run of this code, so units with no finding are reviewed, not proven safe.
