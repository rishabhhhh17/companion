# T31. Pro and the report live on the Squibby account, set by Dodo's webhooks. No license keys.

- **Status:** Accepted, 19 Nov 2026. The founder approved `docs/milestones/M116-accounts.md` ("Yes, build it") and dropped the trial. Replaces T17. Not yet proven against Dodo's test mode (see Open items).
- **Number:** T31, as the plan names it. T19 to T30 are not used; the plan and its reviews already say T31, so the number stays.
- **Date:** 2026-11-19
- **Source:** the founder, 19 Nov 2026: "When someone downloads it and when they pay us, directly, there should not be any license key or something like that." And: "When you pay, it does not give you some code." And: "I don't want to pay anything." The plan: `docs/milestones/M116-accounts.md`.
- **Related:** F22, F25, F29, F31, T17 (replaced), M99, M100, M116; AGENTS.md rules 1 to 4, 9, 13 and 17.

## Decision
- **One Squibby account per person, made with Google.** The app runs Google's desktop sign in in the person's own browser (PKCE, loopback on 127.0.0.1, only `openid email profile`, a nonce the server signed and that works once) and sends the ID token to Squibby's server (`usage-proxy`, `POST /v1/signin/google`). The server answers with a Squibby sign in token. The account is `google:<sub>`, never the email.
- **The plan lives on the account, on the server.** The app asks `GET /v1/me`. A new Mac signs in and has the same plan. No limit on Macs: use is metered per account.
- **Paying happens in the browser on a checkout the server makes.** Upgrade asks `POST /v1/checkout`; the server calls Dodo's checkout sessions with `metadata.companion_user_id` and the account email (locked), and the app opens the address. Dodo's signed webhook sets Pro, or adds one report credit keyed by `payment_id`. Nothing is ever granted from the return page or from anything the app sends. The server refuses a second Pro checkout while one subscription is live, and the owner's plan is the best of their subscriptions, so one stray cancel never drops a paying person.
- **Manage billing is Dodo's customer portal**, opened through `POST /v1/portal` for the customer id the server saved.
- **License keys are off** on all three Dodo products (`pdt_0Ns9hxjhJZsk7pMWwfkxu`, `pdt_0Ns9hxlcgAdzkLwOdb8Pm`, `pdt_0Ns9hxmgR1RJhY26t6orM`). The app has no key field, no code, no activation and no offline grace clock.
- **The Dodo API key and Squibby's Anthropic key are server secrets only**, typed by the founder with `wrangler secret put`. The app holds only its sign in token, in its own Keychain item, sent only to Squibby's https server.
- **No trial.** The founder dropped the 14 day trial on 19 Nov 2026 (F25): the Free plan, then pay. The Mac only trial is removed, and the server has no trial. Deleting the account and signing up again gives no new month's allowance: a small line keyed by an HMAC of the Google `sub` remembers this month's spend until the month ends, with no email.
- **The report is spent on the server** (`POST /v1/report/use`), never decided by the app.
- **Updates come through the same server.** `GET /v1/update/...` answers the Tauri updater; bundles sit on GitHub Releases in a public repo; the updater key is the founder's.
- **Everything runs free:** Cloudflare Workers Free with SQLite Durable Objects, Google sign in, Dodo test mode, GitHub Releases. The $5 Workers plan and the $99 Apple program are the founder's later choices, never automatic.

## Rules a coding agent must never miss
- Grant only from a verified Dodo webhook. Keep event ids at least 48 hours; key one time purchases by `payment_id`.
- Take the user id from the sign in token and the customer id from the server's record, never from the app's request.
- No token, key or email in any address or log. The `/paid` return page logs nothing, redirects away from its query, and Cloudflare's invocation logs are off (they would store Dodo's `email` query).
- The sign in nonce comes from the server, lasts 10 minutes and works once. A nonce the app makes up proves nothing.
- Never sell a second Pro to someone who has one; keep the plan per subscription and take the best.
- The payments switch is checked on the server for checkout and portal, not only in the app. A failed switch read means off.
- The Dodo address (`DODO_API_BASE`) and key must match: test with test, live with live.
- The over limit words never tell a customer to add their own Claude key (F29).
- Only the M100 loop and the light lanes run on Squibby's bill; Claude Code never without Anthropic's written yes (F22, rule 1). Payments and fixing each stay behind a server switch (rule 3).
- The server keeps the account id, email, plan, Dodo ids, token hashes and per request token counts and cost (90 days). Never a prompt, reply, name or picture.
- Build no trial anywhere.

## Why
- It is what the founder asked for, and how HeyClicky works: make an account, pay, use it.
- Squibby already pays for the model (F29), so the server already sits in every model request. The plan belongs there, where it is enforced.
- Accounts across Macs, real usage numbers and a live update feed come with it.
- Most of it is built (M99, M100): Google token checks, sign in tokens, plans per owner, the Dodo webhook, metering.

## What T17 said that no longer holds
- "No Squibby account and no Squibby server for Pro." Now both.
- The license key, its Keychain item `pro-license`, the report key item `report-licenses`, activation limits per Mac, and the 14 day offline grace clock: removed.
- "The usage proxy carries no Pro traffic." It carries all of it.
- The 14 day trial and "Delete everything keeps the trial date": there is no trial any more, so there is no trial date to keep.
- What still holds from T17: checkout and billing open in the person's own browser, never a card field or login form inside Squibby; payments stay off until the founder switches them on (F25).

## Open items [verify]
Listed with their steps in M116 section 11: CPU per request on the free plan, rows written per request, checkout metadata on subscription events, the report's product id on its payment event, the scheduled cancel event, renewal metadata, permission grants across ad hoc signed updates, the free rate limiting binding, the Desktop client's audience, GitHub Releases for the updater, customer reuse by email, what a refund or lost dispute does to a subscription, no email in Cloudflare's logs, Dodo's checkout and portal host names, and webhooks passing the zone's security settings.

## Revisit only if
- Dodo changes its checkout, webhook or portal APIs.
- The free Cloudflare limits are reached (then the founder picks the $5 plan or another host). These caps are shared, so free use can stop paying customers for the rest of a UTC day; that is the signal to move.
- The founder wants website sign in or buying from the website (a Google Web client and a link back into the app).
