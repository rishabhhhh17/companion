# M116: Accounts, paying and updates through Squibby's server

**Approved by the founder, 19 Nov 2026** ("Yes, build it"), with the trial dropped. Every mention of a trial below (/v1/trial/start, trial end, trial caps, "trial used") is void: build no trial anywhere and remove the existing one.

Status: plan for the founder to approve. Written 19 Nov 2026. Nothing is built, deployed, bought or signed up for. No feature code until the founder says yes to this plan (AGENTS.md, "How we work").

Replaces: T17 (Pro as a Dodo license key pasted into the app), which the founder rejected on 19 Nov 2026. New record: T31 (draft beside this file, `T31-draft.md`).

Builds on: F29 (Squibby pays and picks the model), F22 (Claude Code never on Squibby's bill without Anthropic's written yes), F25 and F31 (Free, Pro $15 a month or $144 a year, the $29 report), F30, M99 (the server on Cloudflare), M100 (Squibby's own loop on the Messages API).

Sources read for this plan: the four research notes of 19 Nov 2026 (`research-code.md`, `research-dodo.md`, `research-cloudflare.md`, `research-google.md`, same folder), the reviewer's checklist (`checklist.md`, same folder), and in the m48-launch repo: `AGENTS.md`, `docs/decisions/F22`, `F25`, `F29`, `F30`, `T17`, `docs/architecture.md`, `usage-proxy/README.md`, `usage-proxy/src/*.ts`, `usage-proxy/wrangler.toml`.

## Why (the founder's words, 19 Nov 2026)

- "When someone downloads it and when they pay us, directly, there should not be any license key or something like that. Do some server shit so that it's connected to the server, so we can have app updates, and we can track how much someone is using our tokens and shit like that internally."
- "How does HeyClicky do? They don't email you the code or something like that. You just make an account, and then you start doing shit... When you pay, it does not give you some code."
- "I don't want to pay anything."

What this means in one line: one Squibby account, made with one Google click, holds the plan. Paying in the browser turns Pro on for that account. The app asks Squibby's server what plan it is on. Nobody ever sees a key or a code.

Most of the server already exists (`usage-proxy/`: Google sign in, sign in tokens, plans per person, the Dodo webhook, metering, limits). The app never talks to it today, and Pro still runs on T17's license key. This milestone joins the two and removes the key.

## 1. What the person sees

### First open
1. Squibby opens with one screen: "Make your Squibby account". One button: "Continue with Google". A small "Not now" link under it.
2. The button opens Google's page in the person's own browser (never a window inside Squibby; Google blocks those, and AGENTS.md rule 2 forbids login forms). If they are already signed in to Google there, it is one click to pick the account.
3. The browser tab says "You're signed in. You can close this tab and go back to Squibby."
4. Squibby shows "You're in. You're on the Free plan." with their name and picture from Google. The free plan works right away. No card, no email to confirm, no code.
5. "Not now" lets them look around. Anything that needs the model (asking, fixing, Explain, Second Look) shows "Sign in to use this" with the same Google button. Undo, receipts and snapshots work without an account, because they run on the Mac.

### Upgrade
1. The person presses Upgrade (Plan card, the limit card, or a Pro tag). They pick monthly ($15) or yearly ($144). Prices come only from `app/src/prices.json`. Someone already on Pro (active, past due, on hold or cancelling) never sees Upgrade; they see Manage billing. The server refuses a second Pro checkout for them too, so two Macs pressing at once cannot make two subscriptions.
2. Squibby asks its server for a checkout. The server makes a Dodo checkout for this account and gives back its address. Squibby opens it in the person's browser. The payment is matched to the account by the account id the server puts on the checkout (`metadata`), not by the email. The email is filled with the Google email and locked, so receipts and the billing portal use the same address.
3. The person pays on Dodo's own checkout page. Squibby never shows a card field.
4. The browser lands on a short Squibby page: "Thanks. Go back to Squibby, Pro is turning on." That page grants nothing.
5. Back in Squibby, the Plan card says "Waiting for your payment" with a small spinner and a "Check again" button. Squibby asks the server every few seconds, then less often, for up to 10 minutes, and again whenever its window comes forward.
6. As soon as Dodo's webhook reaches the server, the next answer says Pro. The card turns to "Pro. Renews on 19 Dec." No key, no code, no email step. If Dodo is slow, "Check again" and the next window focus pick it up.
7. If the person closes the checkout without paying, nothing is charged. After 10 minutes the card goes back to the plan they had, with Upgrade still there.

Outside a checkout, Squibby asks `/v1/me` only at launch, when its window comes forward (at most once every 5 minutes) and once an hour. Never a tight loop, so polling stays far inside Cloudflare's free request limit.

The $29 report works the same way: "Buy the report" opens a Dodo checkout, and when the payment lands the report is ready to use. No report key. Starting a report asks the server to spend one credit (`POST /v1/report/use`); the app never decides on its own that a report is paid for. While Pro includes the report (section 9, call 3), Pro users do not see "Buy the report" and the server refuses that checkout for them.

### Manage billing
- On Pro, the Plan card has "Manage billing". The server asks Dodo for a portal link for this person's own Dodo customer, and Squibby opens it in the browser. Invoices, card changes, switching monthly and yearly, and cancelling all happen there.
- A cancel at the end of the period keeps Pro until that date. The card says "Pro until 19 Dec. It will not renew." If they undo the cancel in the portal before then, the card goes back to "Renews on".
- Switching monthly to yearly (or back) in the portal changes nothing in the app but the renew date. Pro stays on through the switch.
- A refund of a Pro payment, or a lost chargeback, is handled by Dodo and the subscription events that follow (V13). Squibby never takes Pro away on its own guess.
- A failed renewal: while Dodo is still retrying (past due) Pro stays on and the card says "Your last payment didn't go through. Fix it in billing." with the Manage billing button. When Dodo puts it on hold, the plan goes back to Free with the same line.

### Signing out
- Settings, Account: the Google email, the plan, this month's use as a simple bar ("You've used 40% of this month's included use"), and "Sign out".
- Sign out removes the Squibby sign in token from this Mac's Keychain and tells the server to stop that token. The app goes back to the signed out state. Google connections for Gmail, Calendar and Drive are separate and stay as they are; the screen says so.
- "Sign out on all Macs" stops every token of the account. Shown under Sign out, smaller.

### A new Mac
- Install Squibby, press "Continue with Google", pick the same account. Pro is already on, because the plan lives on the account, not on the Mac. No transfer, no key, no deactivate step.
- There is no limit on Macs. Use is metered per account, so two Macs share one allowance. Sharing an account only shares its limit.
- Two Macs can work at the same time. The server already caps how many requests one account runs at once (`owner.begin` with `max` in `src/store-do.ts`). If that cap is hit, the words say "Squibby is busy on your other Mac. Try again when it finishes.", never "signed out" or "limit used up".

### When the server cannot be reached
- The Plan card shows the last known plan with "as of 10:42". Model features say "Can't reach Squibby right now. Your work is safe. Try again in a minute." Local features keep working.
- No grace clock and no 14 day timer (T17's are removed): the model needs the server anyway, so there is nothing to unlock offline.
- If the switches cannot be read, payments count as off (Upgrade hidden) and fixing on Squibby's bill counts as off. Nothing is turned on by a failed read.
- If Cloudflare's free daily limit is hit (section 4), the app shows "Squibby's server is full for today. It opens again at 1:00 (your time)." It reads Cloudflare's daily limit page (error 1027) and the server's own "full" 503 as this case, never as "signed out". A one off CPU error (1102) only says "Squibby's server could not finish that. Try again."

### Delete my account
- Settings, Account, "Delete my account": asks once, names what goes, and refuses while a subscription could still charge the person (active, past due, on hold or paused): "Cancel Pro in billing first, then delete." A subscription that is already cancelling can be deleted; the screen says the paid days left are lost. Delete everything (the existing wipe) also offers it.
- Deleting and making the account again does not give a fresh trial or a fresh month's allowance (section 8, "kept after delete").

## 2. What the server does

All of it in `usage-proxy/`, on the Cloudflare Workers Free plan, at `https://api.getsquibby.com` (a custom domain on the founder's existing Cloudflare zone, free; `workers.dev` is the fallback). Routes are new unless marked.

### Accounts
- `GET /v1/signin/nonce`: answers a fresh nonce the server made and signed itself (random part, time, HMAC with a key derived from `METADATA_USER_ID_SECRET` under its own label, so no new secret), good for 10 minutes. It writes nothing. The app puts it in the Google request.
- `POST /v1/signin/google` (exists, moved): takes the Google ID token, checks it (`src/google.ts`: RS256, Google's keys, issuer, audience equals `GOOGLE_CLIENT_ID`, expiry, verified email), checks that the token's `nonce` claim is one the server signed in the last 10 minutes and has not been used (it is marked used in the same write that stores the new token hash), makes the account if new (owner id `google:<sub>`, never the email), keeps the email on the owner record and updates it if the Google email changed, and answers `{token, plan, email, name, picture}`. A nonce the app makes up itself would prove nothing, because anyone holding the ID token can read its nonce claim. It moves ahead of the `PROXY_ON`, `METADATA_USER_ID_SECRET` and `ANTHROPIC_API_KEY` checks (`src/proxy.ts` lines 135 to 142 today), so people can make an account while forwarding is off. Rate limited per IP (see section 7).
- `GET /v1/me`: with the `cmp_` token. Answers plan, status (`active`, `past_due`, `on_hold`, `cancelling`, `free`), until, renews on, trial end, report credits, today's and this month's use as a share of the limit, and the switches (payments on, fixing on). Reads only. It writes nothing, so polling it costs no row writes.
- `POST /v1/signout`: stops the token that called it (deletes its hash). `POST /v1/signout/all`: stops every token of the owner.
- `POST /v1/trial/start`: starts the 14 day trial once per account (section 9, call 1). Refused if a trial was ever started for this Google account, including one deleted before (the kept hash in section 8).
- `POST /v1/report/use`: spends one report credit, or allows it on Pro if Pro includes the report. The app starts a report only after a yes from here.
- `POST /v1/account/delete`: refused while any Dodo subscription of the owner could still charge (active, past due, on hold, paused). Allowed when it is cancelling or ended. Removes the owner record, every token hash, the usage records and the email. Keeps two things: the suspension log line if one exists (it holds no email), because that is how an Anthropic notice is matched (F22 condition); and a small "deleted" line keyed by an HMAC of the Google `sub` (never the email or the `sub` itself) holding only "trial used" and this month's spend until the month ends, so delete and sign up again cannot reset the trial or the allowance. It also keeps the Dodo customer id to owner link marked deleted, so a late Dodo event for that customer answers 200 and changes nothing, instead of 503 and 8 retries.

### Plan from Dodo webhooks
- `POST /v1/checkout` with the token and `{"item": "pro_monthly" | "pro_yearly" | "report"}`. The server maps the item to a product id from its own table, takes the user id from the token (never from the request body), and calls Dodo's `POST /checkouts` with plain `fetch` (no new dependency): `product_cart`, `customer` (the stored Dodo customer id when there is one, else the account email), `metadata: {companion_user_id}`, `return_url` = `https://api.getsquibby.com/paid`, `cancel_url`, and `feature_flags.allow_customer_editing_email: false`. It answers `{url}`. Docs: https://docs.dodopayments.com/developer-resources/checkout-session, metadata limits https://docs.dodopayments.com/api-reference/metadata. A new session per press; each lasts 24 hours.
  - Refuses `pro_monthly` and `pro_yearly` with a plain sentence when the owner already has a subscription that is active, past due, on hold, paused or cancelling ("You already have Pro. Use Manage billing to change it."). Refuses `report` while Pro includes it. This stops double charges from two Macs or a double press.
  - The Dodo address comes from a server setting `DODO_API_BASE`: `https://test.dodopayments.com` in test mode, `https://live.dodopayments.com` only when live payments start. The deploy script refuses a `dodo_test_` key with the live address and the other way round.
- `GET /paid`: a tiny static page ("Go back to Squibby"). It ignores the query (Dodo adds `payment_id`, `status` and the email there). It answers with a 303 to `/paid/done` without the query, so the email leaves the address bar, and sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The Worker never logs the address, and Cloudflare's own request logs are set not to keep it: `wrangler.toml` today has `[observability] enabled = true`, which stores each request's URL in Workers Logs, so invocation logs are turned off (`[observability.logs] invocation_logs = false`, https://developers.cloudflare.com/workers/observability/logs/workers-logs/) and only the Worker's own short log lines stay (V14).
- `POST /v1/portal` with the token: calls Dodo's `POST /customers/{customer_id}/customer-portal/session` with the customer id from the server's own owner record, never from the app, and answers `{url}`. No customer id yet means no portal (the app hides the button). Docs: https://docs.dodopayments.com/features/customer-portal.
- `POST /webhooks/dodo` (exists, changed). Signature check stays as is (Standard Webhooks, 5 minute window, constant time, `src/dodo.ts`). Unsigned mocks (`dodo wh trigger`) stay refused. Changes:
  - Saves the Dodo customer id and subscription id on the owner from `subscription.active` and `payment.succeeded` when the metadata matches.
  - `subscription.cancelled` with `cancel_at_next_billing_date` true and a future `next_billing_date` keeps Pro until that date (status `cancelling`). Otherwise Free now. `subscription.expired` sets Free.
  - `past_due` keeps Pro until `past_due_ends_at` (exists). `on_hold` and `paused` set Free with status `on_hold`, which the app shows as "Payment failed, fix in billing". `failed` (Dodo could not create the subscription, and sends nothing after it) is kept as ended, plain Free: it can never charge, so it never blocks a delete or a later Pro checkout (step 5 review).
  - `subscription.updated`, `subscription.renewed` and `subscription.plan_changed` (exist) keep Pro and refresh the renew date. An `updated` event with `cancel_at_next_billing_date` false on an active subscription undoes a pending cancel (status back to `active`).
  - The plan is kept per subscription id, and the owner's plan is the best of their subscriptions. Today one event sets the owner's plan directly, so a `cancelled` or `expired` event for an old or duplicate subscription would turn Free a person who still has another active one. The operator `usage` command lists anyone with two live subscriptions so the founder can refund one in Dodo.
  - `refund.succeeded` for a subscription payment and `dispute.opened` or `dispute.lost` change no plan by themselves; they are logged for the operator. Pro follows the subscription events Dodo sends after them (V13). `dispute.lost` on a report payment removes that credit if unused.
  - An event whose customer belongs to a deleted account answers 200 and changes nothing.
  - The report: `payment.succeeded` for the report product adds one report credit, keyed by `payment_id`, so a retried or repeated event never adds two. `refund.succeeded` with `is_partial` false removes the credit for that `payment_id` if unused (the owner is found through the stored `payment_id`, because a refund's metadata is its own). A used report stays used, and the operator sees the refund.
  - Event ids are kept 48 hours, not 15 minutes (`WEBHOOK_KEEP_MS` in `src/store-do.ts`), because Dodo retries for about 37 hours (https://docs.dodopayments.com/developer-resources/webhooks).
  - The product table (`DODO_PRODUCTS`) gains the item names: `{"pdt_0Ns9hxjhJZsk7pMWwfkxu": {"item": "pro_monthly", "plan": "pro"}, "pdt_0Ns9hxlcgAdzkLwOdb8Pm": {"item": "pro_yearly", "plan": "pro"}, "pdt_0Ns9hxmgR1RJhY26t6orM": {"item": "report", "once": true}}`. Product ids stay out of code and out of the app.
- Pro and the report are granted only from a verified webhook. Never from the return page, never from a `license_key` in any address, never from anything the app sends.

### Metering every model request
- Every model request from the app already goes through the server with the `cmp_` token (`src/proxy.ts`, `src/filter.ts`, `src/usage.ts`). It is checked against the plan's daily and monthly dollar limits (`src/plans.ts`), forwarded with Squibby's key, and its token counts and cost are booked. Nothing changes in that promise.
- Only the M100 Messages loop and the light lanes run on Squibby's bill. Claude Code never does without Anthropic's written yes (F22, AGENTS.md rule 1). Fixing on the managed route stays behind its own server switch, `LOOP_ON` (rule 3).
- The over limit words (`src/proxy.ts` lines 126 and 127), the "switched off" and "not ready" words (lines 137 and 138), the "plan is not active" words (line 148) and the switch comment (line 26) stop telling customers to "add your own Claude key" or "use your own Claude key". New words: "Today's included use is used up. It comes back at 1:00 (your time)." and, on Free, "Pro has more each day." Nobody adds a key (F29).
  - Changed in step 3 (S3 review, 19 Nov 2026): the server does not know the person's time zone, so its own words say "It comes back at midnight UTC." and "It comes back on the 1st (UTC)." They are only the fallback. Every over limit answer carries the exact reset time in the `x-companion-resets-at` header, and the app (step 9) shows that time in the person's own zone, as "It comes back at 1:00 (your time)." Step 9 has a UI test that ties those words to the header.
- Cheaper on Cloudflare (section 4): fewer row writes per request, a lighter stream reader.

### Usage numbers the founder can see
- `POST /v1/operator` (exists, behind `OPERATOR_KEY`, at least 32 characters) gains a read only `usage` command: for a month, each account's owner id, plan, requests, input and output tokens and cost, sorted by cost, plus totals by plan and by model. With `--email` the operator can find one person. No prompt or reply exists to show.
- `scripts/usage-report.ts` prints it on the founder's own Mac. It reads `OPERATOR_KEY` from the founder's Keychain in code, never from chat.
- The same command shows the day's requests and rows written so far against the free limits, so the founder sees the Cloudflare ceiling coming (section 4).

### Update feed
- `GET /v1/update/{target}/{arch}/{current_version}`: answers 204 (no update) or a small JSON with `version`, `notes`, `pub_date`, `url` and `signature`, as the Tauri updater expects (https://v2.tauri.app/plugin/updater/). No token is sent and no account is tied to an update check.
- The newest release is set by the operator command `release set` (version, notes, the GitHub Releases file address, the `.sig` text). `release stop` pulls a bad release at once. The `url` must be on `github.com` in the public releases repo. Even if `OPERATOR_KEY` leaked, the app installs nothing that is not signed with the founder's updater key (`requireSignedVersion: true` in `tauri.conf.json`); the server is never the last check.
- The bundle itself lives on GitHub Releases in a separate public repo (free, no card). Not R2, which needs a card on file (https://developers.cloudflare.com/billing/understand/billing-policy/). Not Worker static files, which stop at 25 MiB a file.
- Versions in use are counted from the Worker's own short log line for each update check (version and arch only), not stored, so update checks cost no row writes. The app checks once a day at most.

### Switches
- `GET /v1/switches` answers `{"payments": bool, "fixing": bool}` from the server's own settings (`PAYMENTS_ON`, `LOOP_ON`). The app's existing remote switch (`remoteswitch.rs`, `remoteSwitchUrl`) points here. Both the build's `paymentsOn` and this switch must say yes before Upgrade shows (F25). A failed or slow read counts as both off. The server also checks `PAYMENTS_ON` itself on `/v1/checkout` and `/v1/portal`, so an old app cannot open a checkout while payments are off. Keep the switches even after go live (rule 3).

## 3. What is removed

T17 is marked "Replaced by T31". Nothing a customer sees ever asks for a key or a code again.

- `app/src-tauri/src/license.rs`: the key parts (`activate`, `check`, `deactivate`, their bodies and readers, `key_ok`, `Stored`, the `pro-license` Keychain item, the grace clock `WARN_AFTER`, `FREE_AFTER`, `INACTIVE_RECHECK_FOR`, the 12 hour timer, the key `REASONS`, the static `checkout_url`). What stays is reused for the host checks.
- `app/src-tauri/src/reportkey.rs`: the whole file (Keychain item `report-licenses`).
- `app/src-tauri/src/trial.rs`: the Mac only trial. The trial moves to the account on the server (section 9, call 1).
- `app/src-tauri/src/shell_plan.rs`: `license_activate`, `license_check_now`, `license_deactivate`, `report_activate`, the key timer, and their lines in `main.rs` (around line 1566). `license_status` is replaced by `plan_status`, fed by `/v1/me`.
- `app/src/planCard.tsx`: the "Paste key" field, `pasteFromClipboard`, "Paste new key". `app/src/m76Panels.tsx`: the Report key field and `turnOnKey`. `app/src/tauri.ts`: `reportActivate`. `app/src/strings.ts`: `S.plan.pasteKey`, `keyLabel`, `haveKey`, `notActiveWhy`, `pasteHint`, `turnOn`, `turningOn`, `S.m79.reportKeyLabel` and every license reason word.
- `app/src/plan.ts`, `plan.test.ts`, `usePlan.ts`: the license status reading, replaced by the server's states.
- `wipe.rs` and `privacydoc.test.ts`: the license and report key items leave the list; the new sign in token item joins it. On first launch of this version, any old `pro-license` or `report-licenses` item left on a test Mac is deleted quietly (no customer ever had one; payments were never on).
- `usage-proxy/src/proxy.ts`: the "add your own Claude key" words.
- `billing.test.json`, `billing.live.json`: product ids and the business id leave the app. It keeps only the server address and `paymentsOn`.
- In Dodo's dashboard (the founder): license keys turned OFF on all three products, or Dodo still emails a key and adds `license_key` to the return address.
- The static `/buy/` link with `metadata_companion_user_id` is not used at all. A person could edit or drop the id, and the email would have to go in the address.
- `docs/design/2026-10-31-dodo-payments-spec.md` sections 5, 8, 9 and 13 (the license key flow) get a line at the top: "Replaced by T31 and M116." Nobody builds from them again.

## 4. The free plan: limits and costs

### What the free plan gives a person
- Unchanged by this milestone: the model allowance in `usage-proxy/src/plans.ts` (Free $0.20 a day and $2 a month of model cost; Pro $0.75 a day and $5 a month) and the friendly "3 proven fixes a month" rule in `runner/src/plan.ts`. M100's measuring sets the real numbers; the founder picks them. The server's dollar limits are the hard meter. The local fix count is only the friendly rule, so a wipe that resets it can never spend past the server's limit.
- No plan is ever called unlimited (rule 1).

### What it costs Squibby: $0 to build and test
| Piece | Cost | Source |
|---|---|---|
| Cloudflare Workers Free, SQLite Durable Objects, secrets, custom domain | $0 | https://developers.cloudflare.com/workers/platform/pricing/, https://developers.cloudflare.com/durable-objects/platform/pricing/ |
| Google sign in (Desktop OAuth client, only `openid email profile`) | $0, no billing account | https://developers.google.com/identity/protocols/oauth2/native-app |
| Dodo test mode (checkout, webhooks, portal) | $0 | https://docs.dodopayments.com/developer-resources/webhooks |
| Tauri updater key | $0 | https://v2.tauri.app/plugin/updater/ |
| GitHub Releases in a public repo | $0 | GitHub |
| Model calls during build and tests | $0: tests use a stand in model; the server can be deployed with no Anthropic key at all (step 11) | `usage-proxy/scripts/stand-in-model.ts` |

The one cost that is not zero, said plainly: once the founder turns forwarding on with a real Anthropic key, every free account can spend up to its allowance (today $2 a month) of model cost, and every trial up to its cap (section 9, call 1). That is Squibby's bill. Backstop: the founder sets a monthly spend limit on the workspace in the Anthropic Console (free, F22).

Later costs, none in M116 and none automatic: Dodo takes a share of each live sale as merchant of record (no monthly fee; rates at https://dodopayments.com/pricing); the getsquibby.com domain renewal the founder already pays; the $5 Workers plan and the $99 Apple program if he chooses them.

### Cloudflare's free limits, and what happens at each
1. **CPU: 10 ms per request** (https://developers.cloudflare.com/workers/platform/limits/). Waiting on Anthropic does not count. Reading every streamed chunk and parsing the whole prompt does. Plan: the stream reader looks only at `message_start` and `message_delta` lines and skips text deltas; the prompt is parsed once. A local timing test is an early warning only, because Cloudflare does not enforce limits in `wrangler dev`. The real answer is a measured long fix on the deployed server (**[verify]** V1). Over the limit, Cloudflare answers error 1102 for that one request (not for the day); the app says "Squibby's server could not finish that. Try again." If it does not fit, the $5 Workers Paid plan is the founder's choice, never automatic.
2. **Rows written: 100,000 a day** in Durable Objects. Today about 8 rows per model request (about 12,000 requests a day, roughly 30 to 60 active people). Plan: cut to at most 3 rows per request (one running slot and hold together, one record that also carries the day and month totals). That is about 33,000 requests a day (**[verify]** V2 with the real counts in the dashboard). Over the limit, writes fail until 00:00 UTC; the server answers its own plain 503 ("Squibby's server is full for today") and the app shows the opening time.
3. **Requests: 100,000 a day** for the Worker, and 100,000 a day for Durable Objects. Each model request makes about 3 store requests, so the store is the tighter one, near the same 33,000 calls. Over the Worker limit, Cloudflare answers error 1027 (its own page); the app reads that as "server full for today".
4. `/v1/me` polls, update checks and switch reads write nothing.
5. The founder's usage report shows the day's count against these limits. When it passes 70% on several days, it says so in one line. Moving to the $5 plan then is the founder's call.
6. Said plainly: these daily caps are shared by everyone. If free accounts use up the day's row writes, paying Pro customers are stopped too until 00:00 UTC. That is the main reason to move to the $5 plan once real Pro customers exist. Until then, the free plan's per account daily limit is the guard.

## 5. What the founder does, and when

Only the founder makes accounts, types secrets, deploys and buys anything. Agents never do. Each item names the step that needs it; nothing is needed before step 9.

| When | What the founder does |
|---|---|
| Before step 9 (real sign in on a Mac) | Google Cloud: a new project only for sign in (for example "Squibby sign in"), the consent screen (Branding, Audience External), scopes `openid email profile` only, one OAuth client of type Desktop app, then "Publish app". Put the client id and secret in `app/google.json` (a Desktop secret is not secret, Google says so). Keep Gmail, Calendar and Drive on their own client, so publishing sign in never waits on Gmail's paid review (today both use the one `app/google.json`, so step 7 adds a second file for the connectors client). https://support.google.com/cloud/answer/15549945 || Before step 11 (first deploy) | Cloudflare: make the login, run `wrangler login` on his Mac, and allow `api.getsquibby.com` as a custom domain (the agent writes the `routes` line in `wrangler.toml`; the founder approves it). In the getsquibby.com zone, check that Bot Fight Mode and "I'm Under Attack" are off for `api.getsquibby.com` (or a free WAF skip rule covers `/webhooks/dodo` and `/v1/`), or Cloudflare may challenge Dodo's webhooks and the app's requests (V16). |
| Before step 11 | Type each server secret with `wrangler secret put <NAME>`: `METADATA_USER_ID_SECRET`, `OPERATOR_KEY`, `GOOGLE_CLIENT_ID`. For payments: `DODO_PAYMENTS_API_KEY` (the test key, `dodo_test_...`), `DODO_WEBHOOK_SECRET` (test mode's webhook secret, from the webhook in the next row; an event it verifies is always kept as test mode), `DODO_PRODUCTS`, `PAYMENTS_ON`. Not yet: `ANTHROPIC_API_KEY`, `PROXY_ON`, `LOOP_ON` (those turn on spending, step 13). Also the plain setting `DODO_API_BASE` = `https://test.dodopayments.com`. Back up `METADATA_USER_ID_SECRET` and `OPERATOR_KEY` in a password manager. Save `OPERATOR_KEY` in his own Mac's Keychain too, under the item name the usage report script names, so the script can read it without it ever being typed into chat. |
| Before step 11 | Dodo dashboard (test mode, business `bus_0Ns9CMnuAOdjU3Y9QE9g0`): make a test API key; add the webhook endpoint `https://api.getsquibby.com/webhooks/dodo` with the events `subscription.*`, `payment.succeeded`, `payment.failed`, `refund.succeeded`, `dispute.opened`, `dispute.lost`; copy the endpoint's signing secret into `DODO_WEBHOOK_SECRET`; decide the past due grace period under Settings, Subscriptions (with none, a failed renewal goes straight to on hold and Pro stops at once; Squibby follows whatever Dodo sends); turn license keys OFF on `pdt_0Ns9hxjhJZsk7pMWwfkxu`, `pdt_0Ns9hxlcgAdzkLwOdb8Pm` and `pdt_0Ns9hxmgR1RJhY26t6orM`; in Settings, Subscriptions, keep "cancel at next billing date" on. |
| Before step 10 | Make the updater key pair on his own Mac: `bun tauri signer generate -w ~/.tauri/squibby.key`. Give the agent only the public key. Back up the private key and its password in a password manager (lost means no more updates to anyone who has the app). Make a public repo for builds only (for example `squibby-releases`). |
| Each release, from step 12 on | Build and sign on his Mac with the release script (the updater key comes from his environment, never read by an agent), upload the `.app.tar.gz` and `.sig` to a GitHub Release in the public repo himself (publishing is his tap), then run the `release set` line the script prints. |
| Step 11 | Approve and run the deploy (`bun run deploy`). |
| Step 12 | In test mode, with Dodo's test card `4242 4242 4242 4242`, buy monthly once, yearly once and the report once, then cancel one in the portal and refund the report. No real money. This settles the Dodo [verify] items. |
| Step 13, only when ready to spend | First move Dodo to live, in this order (audit run 2, finding 5, re-attack round 1; each `wrangler secret put` goes out on its own, so the order matters): (1) in Dodo's live mode add the webhook to the same address and `wrangler secret put DODO_WEBHOOK_SECRET_LIVE` with its secret; (2) put the live `DODO_PAYMENTS_API_KEY` (`dodo_live_...`) and the live product ids in `DODO_PRODUCTS`; (3) set `DODO_API_BASE` = `https://live.dodopayments.com` in `wrangler.toml` and deploy with `--live-payments`, which refuses while `DODO_WEBHOOK_SECRET_LIVE` is not set; (4) delete the test mode webhook in Dodo's test dashboard and `wrangler secret delete DODO_WEBHOOK_SECRET`. Never put the live secret into `DODO_WEBHOOK_SECRET`: that name is test mode's, and what it verifies is always kept as test. The server takes an event's mode only from the secret that verified it, never from `DODO_API_BASE`, so a test mode event sent during these steps stays test and never counts once live (or, to try forwarding before that, delete `PAYMENTS_ON` and keep `PAYMENT_PROVIDER` at none). Then type `ANTHROPIC_API_KEY`, set a monthly spend limit in the Anthropic Console, then `PROXY_ON` (and later `LOOP_ON` after the go live checklist, `docs/launch/company-paid-go-live-checklist.md`). `scripts/deploy.sh` refuses `PROXY_ON` together with payments on Dodo's test address (audit run 2, finding 5), and while Dodo is in test mode the server holds every paid plan to Free's limits, apart from owner ids listed in the `TEST_PAYERS` setting (for example the founder's own `google:<sub>`). |
| Later, not in M116 | Live payments: website pages for pricing, terms, privacy, refunds and contact; Dodo KYC; live products, a live API key, a live webhook and secret (https://docs.dodopayments.com/miscellaneous/verification-process). Apple Developer Program ($99 a year) when he chooses (section 6). For live: change `DODO_API_BASE` to `https://live.dodopayments.com`, `DODO_PRODUCTS` to the live ids, and turn license keys off on the live products too. |

## 6. The one clash with "pay nothing": Apple signing for updates

Said plainly, so it is not hidden:
- The app is ad hoc signed today. macOS ties Accessibility, Screen Recording and Microphone grants to the app's signature. If an ad hoc signed update counts as a new app, every update makes the person grant those again (**[verify]** V7).
- Notarization, which also removes the "unidentified developer" warning, needs the Apple Developer Program at $99 a year. Sign in with Apple needs it too, so there is no Apple sign in in M116.
- Free things to try first, in order: (a) check V7 with two ad hoc builds on a real Mac; (b) if grants are lost, check whether a free self signed code signing certificate the founder makes in Keychain Access keeps grants across builds (**[verify]** V8; it touches signing material, so the founder makes and holds it, and it changes nothing about Anthropic's binary, which Squibby installs at first run and never re-signs, rule 4).
- Until one of those passes, the updater is built and the feed is live, but "Install update" says before it starts: "After this update, macOS may ask you to allow Squibby again in Privacy & Security." Honest, not hidden. The real fix is the Apple program, the founder's call.

## 7. Security: holes ruled out

- **Grants only from a verified webhook.** Never from the return page or a `license_key` in any address. A test sends a forged return and a mock without a signature; neither changes the plan.
- **No tokens or personal data in addresses.** The `cmp_` token travels only in the `Authorization` header to `https://api.getsquibby.com`. No email in a checkout address (the server makes the session). The `/paid` page never logs its query.
- **Checkout made on the server.** Item name in, product id chosen by the server, user id from the token. A product id or user id in the request body is ignored.
- **Portal customer from the server's record**, never from the app.
- **Keys stay on the server.** The Dodo API key and Squibby's Anthropic key are Worker secrets only. They never reach the Mac, `billing.*.json`, the runner's environment, a log or a reply. A test greps every reply and log line.
- **The sign in token has its own Keychain item** (service `companion-squibby`, account `signin`), not the developer key slot. The shell reads it and hands it to the runner in process; it is never in an agent command, hook or MCP server's environment (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, and the loop's safety box keeps its short allow list environment; rule 2). It is sent only to Squibby's https server.
- **Sign in hardening.** The nonce comes from the server (`GET /v1/signin/nonce`), is signed by it, lasts 10 minutes and works once. The app puts it in the Google request; the server checks the token's `nonce` claim against it. A nonce the app made up would not help, since anyone holding the ID token can read the claim. So a leaked ID token cannot be traded for a Squibby token later or twice. Rate limit on `/v1/signin/google` per IP: Cloudflare's Workers rate limiting binding if the free plan has it (**[verify]** V9), else a per isolate counter that writes nothing.
- **Sign out really stops the token** (`/v1/signout`, `/v1/signout/all`).
- **Webhook ids kept 48 hours**, and the report keyed by `payment_id`, so a late retry never grants twice.
- **Operator routes** (`usage`, `release`, suspend and restore) only with `OPERATOR_KEY`.
- **Abuse.** Many free Google accounts each get a small allowance. Limits: the sign in rate limit, the per account daily and monthly limits, the trial's own cap (section 9, call 1), delete and sign up again keeping the trial and the month's spend (section 8), the operator's suspend command (exists), and the Anthropic Console spend limit as the last backstop.
- **No double charges.** The server refuses a second Pro checkout while one subscription is live, and the plan is the best of all the owner's subscriptions, so a stray cancel never drops a paying person.
- **Payments switch on the server too.** `/v1/checkout` and `/v1/portal` refuse while `PAYMENTS_ON` is off, whatever the app thinks.

## 8. Privacy: what the server keeps

Kept, per account:
- The owner id (`google:<sub>`), the email (needed to make a checkout, and to find a person when they write in), the plan, its status and dates, the trial end.
- The Dodo customer id, subscription id, and report payment ids.
- Sign in token hashes (never a token itself), the newest 50.
- One small record per model request: input and output token counts, cost, model, time. Kept 90 days. Day and month totals.
- Payment event ids, 48 hours.

Never kept, never logged: a prompt, a reply, a file, a screen capture, the ID token, the name or picture (shown on the Mac only), a card, the return address query. Logs hold only a short kind, an owner id, a plan and a count. A test greps for this (exists for the proxy; extended to every new route).

Deleted: all of it on "Delete my account", except small things that hold no email and no Google id. (1) The account's suspension log lines, if any exist: their kind, date and case number stay, and the owner id in them is replaced by an HMAC of it. (2) A "deleted" line under the same HMAC with this month's spend and the sign in nonces still good. There is no trial (founder, 19 Nov 2026), so there is no trial flag. The line goes at the end of the month, and never sooner than 3 days after the delete, so a checkout opened before the delete (a Dodo checkout lasts 24 hours, and Dodo retries a webhook for about 37) is still known as a deleted account's. (3) The Dodo customer id stays marked deleted (the HMAC) so late payment events are dropped quietly. (4) If money still reaches Dodo for a deleted account (a checkout paid after the delete), nothing is granted, and a refund line with only Dodo's ids (payment or subscription, customer) is kept for the operator until it is refunded (step 5 review). The privacy policy must say all of this in plain words. Dodo keeps its own payment records as the merchant of record. The privacy policy draft (`docs/launch/legal/`) gets these lines in step 14.

## 9. Calls in this plan

Defaults are chosen so building can go on. Say if you want a different one.
1. **The 14 day trial (F25): DROPPED.** The founder chose "Drop the trial" (19 Nov 2026). Free plan, then pay. Remove the Mac only trial (`trial.rs` and its UI and words); build no server trial and no `/v1/trial/start`. F25 gets a line saying the trial is dropped.
2. **No limit on Macs.** The meter is per account, so sharing shares the allowance.
3. **Pro includes the report** stays as M79 has it (F25 marks it "to be confirmed by the founder").
4. **`api.getsquibby.com`** as the address, `workers.dev` only if the domain cannot be used.
5. **Buying happens in the app.** The website's Get Pro button leads to the download, like HeyClicky. Website sign in (Google Web client plus a `squibby://` link back) is a later milestone.

## 10. Tests to write first (rule 17)

Server (`cd usage-proxy && bun test`), against the in memory store and the Durable Object store both:
- Sign in works with `PROXY_ON` off and no Anthropic key; model requests are still refused then.
- Sign in: wrong nonce refused; email stored on the owner; name and picture not stored; rate limit refuses the 11th try a minute from one IP.
- `/v1/me` answers each status (free, active, past due with until, on hold, cancelling with until, trial) and writes zero rows.
- Sign out stops only that token; sign out on all stops every token; a stopped token gets 401.
- Checkout: the body sent to Dodo (a stand in Dodo) has the right product id for each item, the user id from the token, the stored customer id or the email, the locked email flag; a product id or user id in the request is ignored; no Dodo key in the reply.
- Portal: uses the stored customer id; none stored means 404 with a plain sentence.
- Webhook: active grants Pro and saves the customer id; cancelled with `cancel_at_next_billing_date` keeps Pro until `next_billing_date`; expired drops it; past due keeps until `past_due_ends_at`; on hold and paused drop it with status `on_hold`, failed drops it as ended; the report adds one credit per `payment_id` even when sent three times over 40 hours; a full refund removes an unused credit; a partial refund does not; an unsigned mock and a forged return change nothing; an event id is still known after 37 hours.
- `/paid` grants nothing and its query never reaches a log.
- Over limit and switched off words never say "your own Claude key" (grep the source and the replies).
- Rows written per model request are at most 3 (a counting store wrapper).
- The stream reader still counts usage exactly on the existing fixtures, and skips text deltas.
- Operator `usage` needs `OPERATOR_KEY`, prints no email unless `--email` asked for one, and shows totals that match the records.
- Update feed: 204 when current, the JSON shape Tauri expects when behind, 204 again after `release stop`, refuses a `url` that is not the releases repo.
- Account delete refused while active, past due, on hold or paused, allowed while cancelling; afterwards nothing of the owner is left but the suspension lines and the "deleted" line, both under the HMAC; the line goes at the month's end and never sooner than 3 days after the delete; signing in again with the same Google account gets the same month's spend; a later Dodo event for the deleted customer answers 200 and changes nothing, and a payment that still reached Dodo is kept as a refund line the operator's `usage` shows first; a failed subscription never blocks a delete; the operator's `usage` reads the owners a page at a time.
- Sign in nonce: a nonce the server did not sign, one older than 10 minutes, and one used before are each refused; `GET /v1/signin/nonce` writes nothing.
- Checkout refuses a second Pro while a subscription is active, past due, on hold, paused or cancelling; refuses the report while Pro includes it; refuses everything while `PAYMENTS_ON` is off; the deploy script refuses a test key with the live Dodo address and the other way round.
- Two subscriptions on one owner: cancelling or expiring one keeps Pro while the other is active.
- `subscription.updated` with `cancel_at_next_billing_date` false after a scheduled cancel sets status back to `active`; `plan_changed` monthly to yearly keeps Pro.
- `dispute.lost` on a report payment removes the unused credit; on a subscription payment it changes no plan.
- `POST /v1/report/use` spends one credit once, refuses with none, allows on Pro when Pro includes it. `POST /v1/trial/start` works once per Google account, and the trial's total spend stops at its cap.
- `/paid` answers 303 to `/paid/done` with no query, `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; `wrangler.toml` has invocation logs off.
- Two tokens of one owner run at once; both are metered against the one limit; past the per account running cap the refusal says "busy on your other Mac".
- No email, token, key, prompt or reply in any log line or error, across every new route (extends the existing grep test).
- Deploy script: with payments on it needs `DODO_PAYMENTS_API_KEY`; it no longer needs `ANTHROPIC_API_KEY` while `PROXY_ON` is not set.

App shell (`cd app/src-tauri && cargo test`):
- The sign in request asks only `openid email profile`, with `prompt=select_account`, the nonce fetched from the server, PKCE S256, no `access_type=offline`, no refresh token kept for sign in alone.
- A failed or slow switch read means payments off and fixing off.
- `/v1/me` is asked at launch, on focus at most once every 5 minutes, hourly, and during a checkout wait with backoff that stops after 10 minutes.
- The token goes to its own Keychain item and only to the built in https server address.
- A release build sets the managed route and the server address from the built in config, never from the dev file.
- The runner's child environment never holds the token (scrub test).
- Checkout and portal addresses are opened only when they are https on Dodo's checkout or portal hosts (the exact host list is settled in V15, test and live).
- The plan state from each `/v1/me` answer, from a timeout (last known plan, "as of"), from a Cloudflare 1027 page or the server's "full" 503 ("server full for today"), from a 1102 page ("could not finish that, try again"), and from a 401 (signed out).
- Wipe lists the new item and no longer the license items; old license items are removed once.

UI (`cd app && bun run test`):
- Plan card states: signed out, Free, waiting for payment, Pro, cancelling, payment failed, offline. No state has a key or code field (a test searches the rendered card and `strings.ts` for "key" in plan copy).
- First run account screen, Not now, and the signed out "Sign in to use this" line.

Then `scripts/test-all.sh`, then build and open the app (a new plugin or command can crash launch while tests pass).

## 11. [verify] items

Each is settled in the step named, and the result goes into `docs/research/technical_research.md` and T31.

- V1. A long fix fits in 10 ms of CPU per request on the deployed free plan (`wrangler tail`, outcome not `exceededCpu`). Step 12.
- V2. Real rows written per model request, and Durable Object requests per model request, from the Cloudflare dashboard. Step 12.
- V3. Checkout `metadata` reaches `subscription.*` events (the link learned from `payment.succeeded` covers it if not). Step 12.
- V4. The payment webhook for the report carries the product id (`product_cart`); if not, the server reads the payment with Dodo's API. Step 12.
- V5. Which event a scheduled cancel sends, and when. Step 12.
- V6. Renewal payments carry the checkout metadata. Step 12 (simulated renewal).
- V7. Two ad hoc signed builds keep or lose Accessibility, Screen Recording and Microphone grants after an update. Step 12, on the founder's Mac.
- V8. A free self signed certificate keeps those grants across builds. Only if V7 fails.
- V9. Cloudflare's rate limiting binding is on the Workers Free plan.
- V10. A Desktop client's ID token has `aud` equal to that client id, and the server's check passes with it. Step 9.
- V11. GitHub Releases serves the update bundle to the Tauri updater without a token from a public repo. Step 12.
- V12. `customer: {email}` on a checkout reuses the same Dodo customer for a returning buyer. Step 12.
- V13. What Dodo does to a subscription after a full refund of its payment, and after a lost dispute (cancels it, or leaves it active). Step 12, one refund of a test Pro payment.
- V14. With invocation logs off, Workers Logs and `wrangler tail` show no `/paid` query (no email). Step 12.
- V15. The exact checkout and portal host names in test and live mode, for the app's allow list. Step 12.
- V16. Dodo's webhooks and the app's requests reach `api.getsquibby.com` with the zone's security settings as they are (no challenge page). Step 12, from Dodo's delivery log.

## 12. Order of work, in small gated steps

Built on a new branch and worktree (`m116/accounts`) taken from `m48/launch` after the build running there is finished. Never in the m48-launch worktree while it is busy. Commit only when asked. Every step: tests first, then the code, then its suite and `scripts/test-all.sh` green, joined with `&&` before any merge.

1. **Records.** T31 added, T17 marked "Replaced by T31", the decisions README table, a pointer in F25. Gate: the founder approved this plan.
2. **Server accounts.** Sign in moved ahead of the switches, the server signed nonce route, email on the owner, rate limit, `/v1/me`, sign out and sign out on all, the deploy script's split secret lists. Gate: server suite.
3. **Server cheaper and honest.** At most 3 rows per request, the lighter stream reader, the local timing check, the new over limit words, event ids kept 48 hours. Gate: server suite, including the existing metering tests unchanged.
4. **Server payments.** Checkout (with the second Pro refusal, the server side payments switch and `DODO_API_BASE`), portal, `/paid` with invocation logs off, customer and subscription ids saved, plan as the best of the owner's subscriptions, cancel, undo cancel and failure statuses, the report credit, refunds and disputes, the new product table. Gate: server suite with a stand in Dodo.
5. **Server for the founder.** Operator `usage`, `scripts/usage-report.ts`, the update feed with `release set` and `release stop`, `/v1/switches`, `/v1/trial/start` with its cap, `/v1/report/use`, account delete with the kept "deleted" line. Gate: server suite.
6. **Local run of the whole server.** `wrangler dev` on this Mac with the stand in model and a stand in Google verifier; sign in, `/v1/me`, a metered request, a signed test webhook. No account, no network beyond this Mac. Gate: `scripts/verify-dev.sh` extended and green.
7. **App shell account.** Sign in only Google request, post the ID token, the token's own Keychain item, sign out, built in server address and managed route for release builds, the scrub test. Gate: Rust suite.
8. **App shell plan.** `plan_status` from `/v1/me`, the waiting poll, the offline and server full states, checkout and portal opening, the trial on the server, the T17 code removed, wipe updated. Gate: Rust suite and `scripts/test-all.sh`.
9. **App screens.** First run account screen, Plan card, Settings Account with the use bar, the payment failed line, all words in `strings.ts`, every key word gone, the over limit line in the person's own time from `x-companion-resets-at` (a UI test turns a header value into the expected local words). Gate: UI suite, then build and open the app. Real Google sign in on the founder's Mac needs the Google client (section 5).
10. **Updates.** `createUpdaterArtifacts`, `tauri-plugin-updater` pinned to an exact version, `updater.json` pointing at the feed, the public key the founder gives, a release script that builds and signs with the key from the environment (never read by an agent) and prints the `release set` command. Gate: Rust suite, a build that makes `.app.tar.gz` and `.sig`.
11. **First deploy, payments in test mode, no forwarding.** The founder sets the secrets in section 5 (without the Anthropic key) and runs the deploy. Gate: the founder's yes to deploy.
12. **Proof on the real server.** With the founder: real Google sign in on his Mac, the three test purchases, a cancel, a refund, a simulated renewal, two builds through the update feed, and the V items. Gate: every V item written down, and each finding fixed or listed.
13. **Turn on spending, only when the founder chooses.** Dodo moved to live first (live address, live key, live webhook secret, `--live-payments`), or payments switched off while forwarding is tried. Then the Anthropic key, Console spend limit, `PROXY_ON`; a long fix measured for V1. `LOOP_ON` only after the go live checklist. Never `PROXY_ON` with test mode payments: anyone can pay with a test card (audit run 2, finding 5). `scripts/deploy.sh` refuses that pair, and in test mode the server gives every paid plan Free's limits unless the owner is in `TEST_PAYERS`. Gate: the founder's yes.
14. **Docs that must stay true.** `usage-proxy/README.md` rewritten for this flow, `docs/architecture.md` rows (plan, payments, google, updates, managed credits, pricing), the AGENTS.md repo map line for `usage-proxy/` (it still says "switched off" and "Stripe events") and its test table line, `docs/research/technical_research.md`, the "Replaced" line on `docs/design/2026-10-31-dodo-payments-spec.md`, the privacy policy draft (including the kept "deleted" line), `CHANGELOG.md` in plain words ("Make your account with one Google click. Pay in your browser and Pro turns on by itself. No keys.").

## Rules it must hold

- Rule 1 and F22: only the M100 loop and the light lanes on Squibby's bill; Claude Code never without Anthropic's written yes; no plan called unlimited.
- Rule 2: Squibby's keys only on the server; the sign in token only in the Keychain and only to Squibby's https server; never in an agent's environment; no login form inside the app (Google opens in the browser).
- Rule 3: payments and fixing each behind a server switch, kept after go live.
- Rule 4: Anthropic's binary is never shipped or re-signed; updates carry only Squibby's app.
- Rule 9: nothing steals focus; the browser opens only on the person's press.
- Rule 13: nothing is paid without the person's own press on Dodo's page.
- Rule 16: plain words, no streaks, no guilt in the use bar.
- Rule 17: tests first for payments, tokens, wipe and the scrub.
