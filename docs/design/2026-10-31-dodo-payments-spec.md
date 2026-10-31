# Dodo Payments integration spec (F25 Pro)

- **Status:** Accepted and built in M47 (31 Oct 2026), with payments off. The founder left the open calls to the build ("U tell me"); the calls made are in section 16 and `docs/milestones/M47-pro-plan.md`. Nothing here is proven against Dodo's test mode yet (section 15).
- **Scope:** sell F25 Pro ($10 a month, $96 a year) through Dodo Payments for the Squibby Mac app.
- **Out of scope:** F22 managed usage. It stays off and this work does not touch it.
- **Code read:** `/Users/rishabhkapadia17/Developer/companion-wt/m36-type`, read only. No git commands and no tests were run.
- **Decision records this rests on:** F25 (pricing), F22 (Dodo chosen, managed usage gated), F28 (one product at launch, a calm and planned interface), and AGENTS.md rules 1, 2, 5, 8, 9, 12, 13, 16, 17, 20 and 21.

## 0. One billing design, chosen before M47

The UI spec and this spec described two billing systems that cannot both be built:

- The UI spec has a Squibby account, a trial kept on a server, and billing routes on usage-proxy that return `renewsAt`, `priceDisplay` and `trialEndsAt`.
- This spec has no account and no server. It uses a Dodo license key and a trial kept on the Mac.

**This spec proposes the license key design.** It is recorded in a new technical record, T17, before M47 starts. If the founder picks it, the UI spec changes in these ways:

- **Plan card states come only from `license_status` and the trial item** (the full list is in section 9a).
- **The renewal date and price live only in Dodo's portal.** Dodo's validate endpoint returns only `{valid}` (https://docs.dodopayments.com/api-reference/licenses/validate-license). So these UI spec lines go:
  - "Renews {date} for {price}"
  - "Ends {date}. No card on file."
  - "Due today"
- **The "Delete your Squibby account" row and any account sign in go.** No account exists.
- **Pro billing never runs through usage-proxy.** Every route there, Google sign in included, sits behind F22's switch (`usage-proxy/src/proxy.ts:112`).

Choosing between the two designs is the founder's call (section 16).

## 1. The short version

- **Pro unlocks with a Dodo license key, checked on the Mac.** There is no Squibby account and no Squibby server at launch.
  - Dodo's `/licenses/activate`, `/licenses/validate` and `/licenses/deactivate` endpoints are public. The docs mark them "No API Key Required", so the app never carries a secret.
  - Sources: https://docs.dodopayments.com/features/license-keys and https://docs.dodopayments.com/api-reference/licenses/validate-license
- **Checkout and billing open in the person's own browser.** Checkout is a static Dodo link. Manage billing is Dodo's customer portal.
  - Squibby never shows a card field, a login form or an in-app checkout window (rules 2 and 9).
- **The 14 day trial with no card runs inside Squibby.** One tap starts it, with no email and no browser. Dodo's own cardless trial is the fallback (section 6).
- **The usage proxy is not used for Pro.** No Claude traffic goes anywhere new (rule 1), and F22 stays off.
- **Payments stay off until the founder switches them on** (F25). While they are off there is no gate and everyone gets everything.

## 2. What Free and Pro mean in the product

| | Free | Pro (and trial) |
|---|---|---|
| Fixes | 3 proven fixes per calendar month (the number is the founder's call, see section 16) | Unlimited |
| Check my project, browser check (F14), proof, receipts | Yes | Yes |
| Undo, Bring the fix back, Stop everything, every safety feature | Yes, always | Yes |
| Show me how, voice, Prompt help, Explain an error | Yes | Yes |
| Ship with rollback | No: a Pro tag, and a tap shows the Pro card | Yes |
| Recaps | No | Yes |
| Water colours (`look.water`) | The default colour (`ocean`) | Every colour |
| Theme, liveliness (Still, Gentle, Lively), size, text size, Less motion | Yes, always | Yes |

**"Looks" means only the extra water colours.** That is every `look.water` option except the default.

- These stay free and are never gated: liveliness (F28 says the person chooses it), the theme (Paper included), size, text size and motion.
- Some of these are accessibility needs, and the founder's "customizable everything" rule applies to all of them.
- A test enforces this (section 13).

**Rules for the gate:**

- **The gate is checked only when a counted fix or a Pro feature starts.** Every command that starts one is listed in section 2a.
- **A running task is never stopped, slowed or downgraded because the plan changed.** That holds for trial end, a revoked key and a failed check alike.
- **Safety, Undo, Bring the fix back, Stop, the browser check and receipts are never gated.** A test walks every protocol command (section 13).

**What counts as one free fix:**

- A Fix it task whose result the proof ladder proves. It counts once, when it is proven.
- Failed, stopped and unproven tasks do not count.
- A follow up or "Try again" on the same task counts once.
- Practice project fixes never count.
- **Undo does not give the free fix back, and Bring the fix back does not count again.** The count changes only when a fix is proven.

Why Undo no longer gives the fix back:

- The UI already has "Bring the fix back" (`checkpoint.putBack`, `strings.ts:264`). If Undo returned the fix, then fix, Undo, new fix, Bring back would keep any number of fixes for free, using only normal buttons.
- Counting again on Bring back does not close that gap either, because Bring back is a restore and must never be gated.
- The cost is that a person who undoes an unwanted fix does not get that fix back this month. The founder can reverse this (section 16).

### 2a. Gated and never gated commands

These lists are the contract for `runner/src/plan.ts`. Every type in `protocol/index.ts`'s `Command` union must appear in exactly one of them, and a test checks this.

**Gated as a counted fix (Free limit):**

- `agent.start` in drive or rescue mode.
- `drive.plan` and `drive.approve`.
  - The gate is checked on `drive.plan`.
  - `drive.approve` passes only for an agent whose plan the gate already admitted.
- `watch.fix`.
- `rescue.diagnose`:
  - Finding the problem stays free (Check my project).
  - The gate runs at the point where diagnosis turns into edits. [verify] in the runner where that hand off is.
- `agent.send`:
  - Free for a task the gate already admitted (it counts once).
  - Gated like a start for any other task.

**Gated as Pro only:**

- `ship.check`, `ship.preview`, `ship.live`.
- `recap.ask`.
- `settings.apply` when it sets `look.water` to a value other than the default.

**Never gated:**

- Stopping: `agent.interrupt`, `agent.interruptAll`, `drive.pause`, `drive.resume`.
- Undo and restore: `checkpoint.restore`, `checkpoint.putBack`, `bisect.undo`, `ship.rollback`.
- Approvals: `approval.resolve`.
- Checks and proof: `browser.check`, `browser.install`, `doctor.check`, `problem.find`, `secondlook.check`.
- Help: `error.explain`, `assist.*`, `walk.*`, `teach.*`, `research.ask`, `diagram.ask`.
- Everything else: `memory.*`, `tasks.list`, `where.wasI`, `spending.*`, `metrics.*`, `watch.add`, `watch.list`, `watch.remove`, `watch.pause`, `watch.check`, `bisect.start`, `project.*`, `auth.check`, `google.accounts`, `engine.warm`, `runner.ping`, `loop.choose`, `explain.set`.
- `settings.apply` for every other key.

## 3. How a Free person meets the limit

The tone is calm and planned. There is no nagging, no guilt and no sad character (rule 16).

1. **Before the last free fix:** one quiet line appears under the Fix it button on Home: "Last free fix this month. More on 1 Nov." Nothing else changes.
2. **At the limit, on pressing Fix it:** the task does not start. One card replaces the result area, with three lines and two buttons:
   - "You have used this month's 3 free fixes."
   - "They come back on 1 Nov. Checking your project, Undo and Stop still work."
   - If the trial is unused, the main button is **Try Pro free for 14 days** and the second is **Get Pro**.
   - Once the trial is used, the main button is **Get Pro** and the second is **Not now**.
3. **On a Pro only feature** (Ship, Recaps, a water colour): the feature shows a small "Pro" tag. A tap shows the same card, worded for that feature, for example "Ship with rollback is part of Pro."
4. **Flowflow stays in its normal "done" or resting state.** The limit is not an error and never uses the "not fixed" look.

## 4. How a person upgrades

1. **Get Pro** opens a small panel with two choices. The panel is non activating (rule 9).
   - "**Yearly**, $96 a year (save $24)"
   - "**Monthly**, $10 a month"
   - Under them: "US prices. Your local price and tax show at checkout."
     - Dodo has no public API for the local price. PPP country percentages are set only in the dashboard and applied at checkout. Source: https://docs.dodopayments.com/features/purchasing-power-parity
   - Yearly is listed first. Nothing is preselected or hidden.
2. **A tap opens Dodo's static checkout link in the default browser.**
   - The link form is `{checkoutHost}/buy/{product_id}?redirect_url=…`.
   - `redirect_url` is required on static links from launch, not phase 2. Source: https://docs.dodopayments.com/developer-resources/integration-guide
   - At launch it points to the dashboard's default success page if the link works without our own page (check **V0**). Otherwise it points to a plain one file thank you page, which needs the founder's yes because website work is paused.
   - Squibby opens the link with `open` through the shell. It never opens a webview.
3. **The person pays in the browser.** Dodo is the merchant of record and handles tax, receipts and invoices. Source: https://docs.dodopayments.com/features/mor-introduction
4. **Dodo emails the license key** when the subscription becomes active.
5. **Meanwhile the panel shows "Waiting for your key"** with a key field and a **Paste key** button.
   - The clipboard is read only when the person taps that button. It is never read automatically and never watched (rule 5).
6. **Phase 2 (optional):** a return path brings the key back without a paste. See section 9.

## 5. Getting Pro on this Mac: license key, not an account

**The choice: a Dodo license key, activated on the Mac and kept in the Keychain.**

Why a license key:

- **No login form and no account server.**
  - Rule 2 forbids showing a Claude login form. The same spirit says Squibby should not invent a password account just to sell a $10 app.
  - With no account server, there is nothing of ours to secure, breach or keep running.
- **No dependency on the usage proxy or on Anthropic's yes.**
  - Pro is sold on top of the person's own Claude.
  - The usage proxy's whole request path sits behind F22's `enabled()` switch (`usage-proxy/src/proxy.ts:112`).
- **Dodo already does the hard parts.**
  - It issues the key and emails it.
  - It turns the key off on cancel or expiry, and on hold or pause. Resuming a paused plan turns the key back on.
  - The key stays active through the past_due grace period, but only if grace is switched on in the dashboard (section 12). It is off by default.
  - The portal shows the person their keys, which recovers a lost key.
  - Sources: https://docs.dodopayments.com/features/license-keys and https://docs.dodopayments.com/features/subscription
- **Less personal data.** Only the key, a random instance name and Dodo's instance id ever leave the Mac.

Costs we accept:

- **The person pastes a key once.** Phase 2 removes the paste.
- **No renewal date in the app.** `validate` returns only `{valid}`, so the app cannot show a renewal date or price. The portal shows them.
- **A plan change issues a new key.** A switch between monthly and yearly makes the old key's `validate` return false. The app must handle that calmly (section 8).
- **Local counts can be tampered with.** Free counts and the trial clock live on the Mac. For a $10 app with BYO Claude this is accepted and stated openly: client side checks are honest user checks.

**When to revisit and move to accounts** (Google sign in plus a server): when Squibby runs a server for another reason (phone relay, recaps sync), or when team plans arrive.

**Activation details:**

- **Activate:** `POST /licenses/activate {license_key, name}`.
  - The name is built from `protocol/names.json` (product name) plus " Mac " and 4 random characters. It is never the Mac's own name, and no product name is hard coded in logic (rule 21).
  - Keep the returned `id` (`lki_…`), `product.product_id` and `customer.email`.
  - Never store `customer.name` or `customer.phone_number`.
- **Wrong product:** if `product_id` is not one of the configured Pro ids, refuse with "This key is for a different product."
- **Confirm once:** "Pro is on for r…@gmail.com." After this first view the UI masks the email.
- **Validate:** `POST /licenses/validate {license_key, license_key_instance_id}`.
- **Deactivate:** "Use Pro on another Mac" in Settings calls `POST /licenses/deactivate` and returns this Mac to Free.
- **Hosts are a build setting, never a user setting.**
  - Each mode has its own API, checkout and portal hosts (section 12).
  - API hosts: `test.dodopayments.com` in dev builds and `live.dodopayments.com` in release. Source: https://docs.dodopayments.com/miscellaneous/test-mode-vs-live-mode

## 6. Trial: 14 days, no card

**Launch choice: an in-app trial (Option A).**

**Where the trial button shows:**

- On the limit card.
- On the card behind any Pro tag, because tapping a Pro tag is a clear request.
- In Settings > Plan only after the person's first proven fix. Before that, the plan row reads "Free. 3 fixes a month." with **Get Pro**.
- The trial never starts on its own.

**What is stored:** one Keychain item (section 9) holding `trial started at` and the latest clock time seen.

- Days left are counted from the later of the clock and that latest time. Turning the clock back does not extend the trial.
  - While the app runs, the time Pro is judged by also moves on in real time (a monotonic clock that counts sleep), so a clock set back does not pause the trial or the grace period either (`license.rs` `steady_now`).
- The item survives a reinstall, so the trial is once per Mac.
- Delete everything keeps it (section 10, Option 2, chosen 31 Oct 2026).

**During the trial:**

- The plan row reads "Pro trial. 9 days left. No card needed."
- Get Pro shows the line "Billing starts today if you buy now."

**At the end:** "Your Pro trial ended. Free still works: 3 fixes a month, every safety feature. Get Pro to keep unlimited fixes." It never shows an error.

- The end copy shows for 7 days after the trial ends. After that the Plan card shows the usual Free rows, with the trial counted as used.

**Why Option A:**

- It is the fewest steps: no email, no browser and no network.
- It works offline.
- It depends on no open [verify] about Dodo.

**Option B, the fallback:** Dodo's native cardless trial (`trial_period_days: 14` with "Start the trial without a card"). Source: https://docs.dodopayments.com/features/subscription

- It gives Dodo's own reminder email.
- With "Prevent Trial Misuse" on, it matches repeat emails. That setting is off by default.
- It needs an email at checkout.
- It is usable only if test mode proves a key is issued at the start of a cardless trial (V2).
- A cardless trial with no card added goes `on_hold`, which turns the key off. That case reuses the same calm copy.

With Option A, both Dodo products are created with a 0 day trial.

## 7. Yearly, students, manage and cancel

**Yearly:**

- A separate Dodo product ($96 a year) in the same Product Collection as Monthly.
- People switch between the two in the portal only if **Allow Subscription Updates** is on (off by default). Dodo handles proration.
- A switch issues a new key (section 8).
- No switch is possible during a grace period.
- Fee math from the pricing page (https://dodopayments.com/pricing):
  - Monthly costs us about $0.85 a month on a US card and $1.00 on an international one, so about $10.20 to $12.00 a year.
  - Yearly costs about $4.72 to $6.16 a year.
  - Yearly is cheaper for us and has fewer renewals that can fail.

**Students half off:** Dodo discounts but does not verify students. Source: https://docs.dodopayments.com/features/discount-codes

- **Launch version:** single use 50% codes, made by hand in the dashboard.
  - Each code is limited to the Pro products and to 1 redemption.
  - It has a 12 billing cycle limit, because students re-verify yearly.
  - `preserve_on_plan_change` is on.
  - A student emails support from a school address. The founder checks it and sends a code.
  - The person types the code at the static checkout. `showDiscounts` defaults to true on static links. V5 checks only whether a 50% code applies on a PPP priced static link.
- **Later:** a server made checkout session pre-applies the code (phase 2, section 11).
- **Stacking:**
  - PPP stacks with the code. The code applies to the PPP price.
  - A country percentage can be no lower than 30% of the list price. So the lowest student monthly price is about $1.50 (30% × 50% × $10), and a 50% country gives $2.50.
  - Dodo's docs state no minimum charge after discounts. The only minimum is an optional per currency order value, checked against the original price before discounts.
  - The fee on a $1.50 to $2.50 charge is about $0.55, roughly a fifth to a third of the price. The founder should know this before choosing student codes on PPP prices.

**Manage or cancel:**

- Settings > Plan shows **Billing and invoices**. It opens Dodo's static portal login, `{portalHost}/login/{business_id}`, in the browser. Source: https://docs.dodopayments.com/features/customer-portal
- Dodo's portal handles everything below. Squibby rebuilds none of it.
  - Cancel.
  - Revoke Cancellation, which undoes a scheduled cancel.
  - Plan switch.
  - Card change.
  - Invoices.
  - Resuming an on hold plan.
  - Lost keys.
- Recommended portal settings:
  - Cancel at period end on.
  - Immediate cancel on, because an easy cancel builds trust.
  - Allow Subscription Updates on.
  - Retention discount off unless the founder wants it.
  - The portal's Design page has themes, typography and colours. Pick the closest dark theme so the hand off looks planned. No exact `#0B0B0C` field is documented.

## 8. Offline, invalid and revoked keys

**When checks run:** 10 seconds after launch, then every 12 hours with random jitter, and on "Check again". Checks never block launch, and Free features never wait on them.

| Result | What Squibby does | What the person sees |
|---|---|---|
| `valid: true` | Pro. Record the time of this successful check. | Nothing new |
| Network error, timeout, 5xx, 429 | Keep the last known plan. | Nothing until day 10 with no successful check. Then "Squibby could not check your Pro key for 10 days. Connect to the internet to keep Pro." |
| 14 days with no successful check | New fixes follow the Free rules. Running tasks are untouched. The key stays in the Keychain. | "Connect to the internet to check Pro." with **Check again** |
| `valid: false`, or a 403 whose body is Dodo's own JSON error | Plan becomes Free for new tasks. Keep the key, marked inactive, and recheck once a day for 30 days, because on hold and paused keys come back when the card is fixed or the plan resumes. | "This Pro key is not active now. If you changed plans, paste the new key from your email. If a payment failed, fix it in billing." Buttons: **Billing and invoices**, **Paste new key**, **Check again** |
| 404 on activate or validate, with Dodo's own JSON error | Refuse. Store nothing. | "Squibby could not find that key. Check it against the email from Dodo." |
| 422 on activate (limit reached) | Refuse. | "This key is already on 3 Macs. Choose 'Use Pro on another Mac' on one of them, or contact support." The portal may also show activations ([verify] V6). |

- Grace is measured from the last successful check, using the later of the clock and the latest time seen.
- Only a definite answer from Dodo changes the plan. A network failure never does.
  - A 403 or 404 counts as Dodo's answer only when its body is a JSON object with a `code` or a `message`. An empty body or a web page (a proxy, a firewall, a captive portal, a moved route) is "unknown". [verify] V1 records the exact shape of Dodo's error bodies.
  - A Keychain that cannot be read is never "no key": the last plan decided stays, and the timer looks again in 15 minutes. With no plan decided yet, the Plan card says the Keychain could not be read, and nothing is gated.
- **The 30 day daily recheck assumes the end of grace goes to `on_hold`.**
  - If the dashboard ends grace with `cancelled` instead, keys are disabled for good and the recheck is wasted.
  - Section 12 therefore sets the end of grace to on_hold.
  - The app cannot know when grace ends, because `validate` stays `{valid: true}` during grace. It shows nothing until the key turns off.

## 9. Where things are stored

**Keychain item (service `keystore::service()`, account `pro-license`):**

- Holds JSON: the key, the `lki_` instance id, the product id, the email, the time of the last successful check and the inactive mark.
- It uses the existing `keystore.rs` service, not a product named one:
  - `service()` is `companion` (`app/src-tauri/src/keystore.rs:10`), and tests override it with `COMPANION_KEYCHAIN_SERVICE=companion-test-*`. So license tests never touch the real Keychain.
  - A product rename cannot orphan the item (rule 21).
- Only the shell reads the item.
- The key is never logged, never sent to the runner and never put in a command line. HTTP calls go through the Mac's own curl with the key on standard input, as in `app/src-tauri/src/google.rs`.
- The UI shows only the last 4 characters.

**Keychain item (service `keystore::service()`, account `pro-trial`):** the trial start time and the latest clock time seen.

**Runner SQLite (`runner/src/db.ts`):** a `free_fixes` table with task id, month and time. It holds no key. Delete everything wipes it with the rest of the runner data (section 10).

**What the runner gets:** the shell pushes `plan.state {plan: "free"|"trial"|"pro", trialEndsAt?, paymentsOn}`. The runner never gets the key.

### 9a. What the Plan card can show

Every state comes from `license_status` plus the `pro-trial` item.

| State | Plan card text | Buttons |
|---|---|---|
| Payments off | No plan row at all | None |
| Free, before the first proven fix | "Free. 3 fixes a month." | **Get Pro** |
| Free, after the first proven fix | "Free. 1 of 3 fixes used this month." | **Try Pro free for 14 days**, **Get Pro** |
| Free, last fix left | The same, plus "Last free fix this month." | Same as above |
| Free, at the limit | "You have used this month's 3 free fixes." | Trial or **Get Pro** |
| Trial | "Pro trial. N days left. No card needed." | **Get Pro** |
| Trial ended (7 days after the end; then the Free rows) | The calm end copy (section 6) | **Get Pro** |
| Pro | "Pro. Key ends in ABCD." | **Billing and invoices**, **Use Pro on another Mac** |
| Pro, check overdue (day 10) | The day 10 warning copy (section 8) | **Check again** |
| Pro, offline over 14 days | "Connect to the internet to check Pro." | **Check again** |
| Key not active | The inactive copy (section 8) | **Billing and invoices**, **Paste new key**, **Check again** |
| Keychain could not be read (no plan decided yet) | "Squibby could not read your plan from the Keychain just now. Nothing is held back meanwhile." | **Check again** |

There is no renewal date, no price, no "Due today" line and no account row.

- **Billing and invoices** shows only once the portal host and the business id are filled in. Until then the Pro card shows only **Use Pro on another Mac**, and the inactive card **Paste new key** and **Check again**.
- **Why "Billing and invoices", not "Manage billing" (31 Oct 2026):** the house copy test (`app/src/settingsPages.test.ts`) bars buttons that start with "Manage", because the word says nothing about what happens. "Billing and invoices" names what the portal shows. The founder can rename it in `strings.ts` alone.

### 9b. Phase 2 return path

- Dodo appends `payment_id`, `status`, `email` and `license_key` to the return URL. Source: https://docs.dodopayments.com/developer-resources/integration-guide
- **First choice: a custom app scheme.** If `redirect_url` accepts `squibby://pro?license_key=…` ([verify] V3):
  - The app opens the Plan card with the key filled in, and **Turn on Pro** is one tap.
  - A link never activates anything silently.
  - The scheme name comes from the names table.
- **Fallback: a one file static page.** If the scheme is not accepted:
  - The page reads the key, removes both `license_key` and `email` from the address bar with `history.replaceState`, and offers **Open Squibby** and **Copy key**.
  - The page has no analytics.
  - [verify] whether browser history or sync keeps the original URL with the key and email before `replaceState` runs. If it does, do not use a web page that carries the key. Keep the paste, or use the app scheme.
- Phase 2 needs a new Tauri deep link plugin. Build and open the app to test it, not just the unit tests. A web page also needs the founder's yes, because website work is paused.

## 10. What Squibby sends to Dodo

- **Sent:** the license key, the instance name and the instance id.
- **Never sent:** anything about projects, files, Claude or usage.
- The privacy page and `app/src/privacydoc.test.ts` must say this.

**Delete everything (`wipe.rs`)** asks "Also turn off Pro on this Mac?"

- Yes: deactivate, then delete the `pro-license` item.
- No: the `pro-license` item stays. The screen names it.

**Chosen, 31 Oct 2026: Option 2.** Delete everything keeps `pro-trial` and names it on its screen, and the free fix count starts again. Option 1 would let anyone restart the 14 day trial with one button; naming the one kept item keeps the wipe honest.

**The trial item and the free fix count were a founder call (section 16).** Before M47, `wipe.rs:3` promised the Keychain item it removes is Squibby's own key "and nothing else". The free fix count lives in runner SQLite, which the wipe deletes, so a wipe resets it. The two options:

- **Option 1 (recommended):** Delete everything also deletes `pro-trial`.
  - It keeps the promise to delete everything.
  - It treats the count and the trial the same way.
  - A person could restart the trial this way. That fits section 5's honest user checks.
- **Option 2:** keep `pro-trial` and name it on the Delete everything screen: "Kept: the date your trial started, so it cannot restart." The privacy doc says the same.
  - The free fix count still resets, and the screen says so.

Either way, `wipe.rs`'s contract comment, its tests and the privacy doc are updated to list exactly which Keychain items it removes and keeps.

## 11. Server side and client side

| Concern | Where it is enforced | Notes |
|---|---|---|
| Is this subscription paid and active? | **Dodo (server)** | Through the license key status. This is the only real server truth at launch. |
| Pro or Free for this Mac | Client, from Dodo's answer | The shell decides; the runner obeys `plan.state`. |
| Free fix count, trial clock | **Client only** | Honest user checks. Tampering is accepted. |
| Prices, tax, PPP, currency | **Dodo (server)** | Dashboard settings, no code. |
| Student eligibility | Founder by hand (launch), a server later | Dodo has no verification. |
| Checkout sessions with pre-applied codes or metadata | **Server only (phase 2)** | `POST /checkouts` needs the API key, which must never ship in the app. |
| Webhooks | None at launch | See below. |

**Is the usage proxy needed? No.**

- Dodo's public license endpoints are enough for launch.
- Rule 1 holds: Pro never routes Claude usage, and the usage proxy stays F22 only and off.
- Pro work must not touch the usage proxy's known gaps:
  - The store cannot set a plan from a payment.
  - No Worker entry point exists.
  - Grace end dates cannot be stored.
  - Some data still names `max`.

**If a server is added (phase 2: student checkout sessions, attribution):**

- It is a separate small Worker, `billing/`.
  - It does not share the proxy's switch or its routes.
  - It has its own on and off switch.
  - It never carries Claude traffic.
- Secrets live in Cloudflare secrets: the `dodo_live_` and `dodo_test_` keys and `whsec_`.
  - If it uses the TypeScript SDK, always pass `environment` explicitly, because the SDK defaults to `live_mode` (https://github.com/dodopayments/dodopayments-typescript).
  - Plain `fetch` avoids the dependency.
- **Webhook:** `POST /webhooks/dodo`.
  - Reuse `verifyDodoWebhook` from `usage-proxy/src/dodo.ts` by moving it to a shared module.
  - It follows Standard Webhooks: HMAC SHA256 over `id.timestamp.body` with a 5 minute window. Source: https://docs.dodopayments.com/developer-resources/webhooks
  - Events to handle:
    - `subscription.active`, `renewed`, `plan_changed`, `on_hold`, `past_due`, `cancelled`, `expired`, `failed`
    - `license_key.created`
    - `entitlement_grant.revoked`
  - Keep handled `webhook-id`s in a durable store for at least 3 days. Dodo's retries span about 27.5 hours, and retries may be signed again ([verify] V11).
  - Record an id only after processing succeeds. Answer 2xx quickly.
  - Never log keys or emails. Store only the subscription id, status, product and period end.

## 12. Products and settings to create in Dodo (test mode first, then copy to live)

| Item | Settings |
|---|---|
| **Pro Monthly** | Subscription, $10.00 USD, every 1 month. Trial 0 days (Option A). Tax category SaaS or digital. PPP on. License key entitlement: activation limit 3, length follows the subscription, activation message "Open Squibby, then Settings, Account, Plan, and paste this key." |
| **Pro Yearly** | Same, $96.00 USD every 1 year. |
| **Product Collection "Squibby Pro"** | Holds both products, so the portal can switch between them. |
| **Pro Daily (test mode only)** | $1.00 a day, if a Day interval is allowed ([verify] V13). Used to test renewals and renewal failures without waiting a month. Never copied to live. |
| **Subscription Grace Period** | **On.** N days is the founder's call (default 3, allowed 1 to 30). Off by default, and without it a failed renewal goes straight to on_hold. |
| **Status after grace period** | **On hold, not cancelled.** A cancelled subscription disables keys for good, and section 8's daily recheck assumes on_hold. |
| **Allow Subscription Updates** (portal) | **On.** Off by default, and monthly to yearly switching needs it. |
| Business settings | Adaptive Currency on. Fees Inclusive on, so the price shown is the price paid. PPP percentages reviewed (World Bank defaults, 30% floor). Optional localized prices for India, the EU and the UK (founder's call). |
| Discount codes | Student codes as in section 7. |
| Customer portal | As in section 7, closest dark theme. |

The app needs only non-secret values: the two product ids, the business id and three hosts per mode. They go in a per-build config file:

| File | Mode | API host | Checkout host | Portal host |
|---|---|---|---|---|
| `app/src-tauri/billing.test.json` | Dev builds | `test.dodopayments.com` | Test static checkout host, [verify] V0 (none is documented) | `test.customer.dodopayments.com` |
| `app/src-tauri/billing.live.json` | Release | `live.dodopayments.com` | `checkout.dodopayments.com` | `customer.dodopayments.com` |

Each file also holds `redirect_url` (section 4) and `paymentsOn`. It is parsed like the update config in `updates.rs` and refused unless every URL is https.

## 13. Tests to write first (rule 17)

**Rust, `license.rs` and `trial.rs`, no network, Keychain through `COMPANION_KEYCHAIN_SERVICE=companion-test-*`:**

- Parsing each answer: activate 201, 403, 404 and 422, and validate true and false.
- Network failures map to "unknown", never to "invalid".
- Grace: day 9 shows nothing, day 10 warns, day 14 drops new tasks to Free, and a successful check resets the clock.
- An inactive key is rechecked daily and comes back to Pro on `valid: true`.
- Request bodies never contain the Mac's name. The instance name is built from `protocol/names.json` and has no hard coded product name.
- The curl argument list never contains the key, because the key goes on standard input.
- No API, checkout or portal host in a release config can be a test host, and no host in a dev config can be a live one.
- A wrong product id is refused. Name and phone are dropped from the activate answer before anything is stored.
- Both items use `keystore::service()` with the accounts `pro-license` and `pro-trial`. No test writes to the real `companion` service.
- Trial:
  - It starts once, and a second start is refused.
  - Setting the clock back does not add days.
  - It ends at exactly 14 × 24 hours.
- Wipe: the items removed and kept match section 10's chosen option, and the screen copy names any item kept.

**Runner, `plan.ts`:**

- Counting:
  - Only proven fixes count.
  - Failed, stopped and unproven tasks do not count.
  - A follow up on the same task counts once.
  - Practice fixes never count.
- **Fix, Undo, Bring back on Free at the limit:**
  - The count does not change.
  - Undo and Bring back both still work, because they are never gated.
  - A new Fix it is refused.
  - Fix, Undo, new fix, Bring back cannot keep more fixes than the limit allows.
- The month resets on the 1st, local time.
- A plan change during a task never stops it.
- With `paymentsOn: false`, nothing is gated.
- **Command walk:** every type in `protocol/index.ts`'s `Command` union is in exactly one list from section 2a.
  - Every gated command refuses at the limit.
  - Every never gated command works at the limit.
  - A new command type that is in neither list fails the test.
- **Looks:**
  - Only non-default `look.water` values are gated.
  - `look.theme`, `look.size`, liveliness, text size and motion are never gated, on any plan.

**Protocol:** `protocol/fixtures/plan-cases.jsonl` is shared by both suites, so Rust and TypeScript agree on `plan.state`, `plan.usage` and `plan.limit`.

**UI, `app/src/plan.ts`:**

- The words and buttons for each state in section 9a.
- The trial button is hidden in Settings > Plan before the first proven fix, and shown on the limit card and Pro tag cards.
- Every card has a way out. The existing `nodeadbuttons.test.ts` covers this.
- No hard coded `$` amounts outside `strings.ts`.
- No renewal date or local price is shown anywhere.

## 14. Code changes by file

**Shell (Rust):**

- `app/src-tauri/src/license.rs` (new):
  - The pure parts: request bodies, answer parsing, the decide function and grace.
  - Network through curl with standard input.
  - Keychain through `keystore::service()`, account `pro-license`.
  - Commands: `license_activate`, `license_status`, `license_check_now`, `license_deactivate`, `plan_open_checkout(monthly|yearly)` and `plan_open_portal`.
- `app/src-tauri/src/trial.rs` (new): the trial clock in account `pro-trial`. Command: `trial_start`.
- `app/src-tauri/src/runner.rs`: push `plan.state` when the runner starts and whenever the plan changes.
- `app/src-tauri/src/main.rs`: register the commands and the 12 hour check timer.
- `app/src-tauri/src/wipe.rs`: the "Also turn off Pro" step, section 10's chosen option, and an updated contract comment.
- `app/src-tauri/billing.*.json`: per-build ids, hosts, `redirect_url` and `paymentsOn`.
- Phase 2 only: the Info.plist URL scheme and a deep link handler.

**Protocol:** `protocol/index.ts` gets three new message types.

- `plan.state`: a command from the app to the runner.
- `plan.usage {used, limit, resetsOn}`: an event from the runner to the app.
- `plan.limit {reason: "fixes"|"ship"|"recaps"|"looks", resetsOn?}`: an event from the runner to the app.

**Runner:**

- `runner/src/plan.ts` (new): the gate, the two command lists from section 2a and the counting rules.
- `runner/src/db.ts`: the `free_fixes` table.
- `runner/src/main.ts`: handle `plan.state`, and call the gate for every command in the gated lists.
- `runner/src/agent.ts`: record a fix on a proven verdict. Undo and Bring back leave the count alone.
- `runner/src/ship/*`: gate `ship.check`, `ship.preview` and `ship.live`. `ship.rollback` is never gated.
- `runner/src/recap.ts`: gate `recap.ask`.

**UI:**

- `app/src/plan.ts` (new): a pure mapping from plan state to the words and buttons in section 9a.
- `app/src/planCard.tsx` (new): the Settings plan card, the Get Pro panel and the limit card.
- `app/src/settingsPages.ts`: `account.fixed: ["plan", "key", "google"]`. Plan comes first: one card, one state line, one main button.
- `app/src/settingsPage.tsx`: render the plan group.
- `app/src/strings.ts`:
  - All copy (rule 21).
  - `fixedGroups.plan`, with search words "pro, plan, billing, subscription, trial, license, key, student".
  - A new Account subtitle: "Your plan and your Claude key."
- `app/src/home.ts` and `homeHero.ts`: the last free fix line.
- `app/src/cardlogic.ts` and `card.tsx`: the limit card.
- `app/src/skins.ts` and `lookfeel.ts`: the Pro tag on non-default water colours only. Liveliness (`livelyOf`), the theme and size stay untouched.
- `app/src/tauri.ts`: the command bindings.

**Usage proxy (F22 cleanup, a separate change):**

- `dodo-products.example.json`: two Pro ids.
- `parseDodoProducts`: stop accepting `max` as a new target.
- README: say that the limits are model usage limits, not Pro features.

**Docs:**

- A new technical record, `docs/decisions/T17-pro-unlock-dodo-license-key.md`, which records section 0's choice.
- `docs/architecture.md`: a `plan` module row.
- A note in F25 that the trial runs in the app.
- Privacy doc: section 10.
- `CHANGELOG.md`.
- Old prices to fix:
  - `docs/launch/company-paid-go-live-checklist.md`
  - `docs/milestones/M13-managed-usage-plan.md`
  - `usage-proxy/README.md`
  - `docs/launch/sales/pricing-options.md` (mark it as replaced by F25)

**Payments switch:**

- At launch it is a release build setting, `paymentsOn` in `billing.live.json`, and it starts off (F25).
- The remote switch should share whatever mechanism the T03 plan route switch uses. That mechanism is not built yet.
- When the switch is off, Squibby fails open: everyone keeps everything.

## 15. End to end test mode plan

Test cards come from https://docs.dodopayments.com/miscellaneous/testing-process. Use expiry 06/32 and CVV 123 except where noted.

**Test portal access:**

- Test mode sends no portal sign in emails, so the static portal login cannot be used in steps 6 to 8 and 15 to 16.
- Open the test portal from the Dodo dashboard instead, or from a local script that reads the test API key from the Keychain and creates a portal session at `test.customer.dodopayments.com`.
- The key never goes in the app, the repo or chat.

**Steps:**

1. Create the products and settings in test mode (section 12). Copy the ids and hosts into `billing.test.json`.
2. **V0:** check that a static link works with the configured `redirect_url`. Check whether the dashboard's default success page is enough, and find the test static checkout host.
3. **V1:** call activate and validate with no Authorization header. Expect 201 and `{valid: true}`. If a header is required, stop and rethink, because the app cannot carry a secret.
4. **Buy monthly** with `4242 4242 4242 4242`.
   - Get the key from the redirect URL or the dashboard's license keys list. Test mode may not email it ([verify] V14).
   - Paste it. Check that Pro shows and that the `pro-license` item exists under the test service.
5. **Decline paths:**
   - `4000 0000 0000 0002`, a generic decline: the app stays Free and shows no error.
   - `4000 0000 0000 9995`, insufficient funds: the same result.
6. **India and PPP:** buy with the India Visa `4576 2389 1277 1450`, or UPI `success@upi`, with an India billing address. Check the local price and that Fees Inclusive applies.
7. **Renewal failure:** subscribe on Pro Daily with `4000 0000 0000 0341` (expiry 12/34), with grace on and the end of grace set to on_hold.
   - The next charge fails and the subscription goes past_due. Expect the key to stay valid.
   - It then goes on_hold. Expect validate to return false and the inactive copy to show.
   - Fix the card in the portal. Expect Pro to come back on the daily recheck. V4 measures how long that takes.
8. **Plan switch** from monthly to yearly in the portal: the old key returns false, and the new key activates.
9. **Cancel** immediately in the portal: the key turns off, and the app shows Free on the next check.
10. **Activation limit:** activate on 3 instances and expect 422 on the fourth. Deactivate one, and the fourth succeeds.
11. **Offline:** block the network. Use a test hook to move the last successful check time back 10 days, then 15.
    - Check the warning appears at 10 days.
    - Check new tasks follow the Free rules after 14 days.
    - Check a running task is untouched.
12. **Student code:** apply a 50% code at the static checkout on a PPP priced link (V5). Check the price, then check that a second use is refused.
13. **Trial (Option A):**
    - Start it and check Pro.
    - Push the clock back: no extra days.
    - Push it forward 14 days: the calm end copy shows.
    - Pressing Get Pro during the trial shows "Billing starts today if you buy now."
14. **Free loop:** on Free at the limit, run fix, Undo, new fix, Bring back. Confirm the gate holds (section 13).
15. **V15, refund and dispute:** refund a test payment from the dashboard, and open a test dispute if test mode allows one. Record what `validate` returns afterwards.
16. **V16, scheduled cancel undo:** schedule a cancel at period end, then use the portal's Revoke Cancellation. Expect the key to stay valid throughout.
17. **Payments off build:** no plan row, no tags and no gate.
18. **Clean up:** deactivate every test instance. Never carry test keys into a live build.

**Open checks to settle in this run:**

| Id | Question |
|---|---|
| V0 | Does a static link work with our `redirect_url` or the default success page, and what is the test static checkout host? |
| V1 | Do the public endpoints work with no Authorization header? |
| V2 | Is a key issued at the start of a cardless trial? (Option B only) |
| V3 | Does `redirect_url` accept a custom app scheme? |
| V4 | How soon does a key come back after on_hold once the card is fixed? (The docs already say keys come back after on_hold and pause, and that a plan change issues new keys.) |
| V5 | Does a 50% code apply on a PPP priced static link? (`showDiscounts` defaults to true.) |
| V6 | Does the portal list or remove activations? (The docs say only that it shows keys.) |
| V7 | Rate limits on validate. |
| V8 | The payout fee: the pricing table says free, the FAQ says $5 under $1,000. |
| V11 | Are webhook retries signed again? (Server only.) |
| V13 | Is a Day billing interval allowed? |
| V14 | Are license emails sent in test mode? |
| V15 | What happens to a license key after a refund or a chargeback? |
| V16 | Does the portal's Revoke Cancellation keep the key valid with no gap? (The docs show the button exists.) |
| Browser history | Does a browser keep the original redirect URL, with key and email, in history or sync before `replaceState` runs? (Phase 2 page only.) |

## 16. Only the founder can do these

1. **Choose the billing design** before M47: the license key design here, or the account design in the UI spec. Record it in T17 (section 0).
2. **Dodo account:** sign up as an individual in India and complete verification (ID and payout bank). Live payments need this (https://docs.dodopayments.com/miscellaneous/merchant-acceptance).
   - Describe the product as "SaaS & AI: a Mac app. Users bring their own Claude; we sell the app, not model access."
3. **Business details:**
   - A support email.
   - Terms, refund and privacy URLs, which Dodo's review will likely ask for. This touches the paused website work, so how minimal those pages are is your call. The same goes for the thank you page if V0 needs one.
   - A refund policy, for example 14 days.
4. **Create the products and settings** in section 12, in test and then live, including grace on, the end of grace set to on_hold, and Allow Subscription Updates on. Then share the non-secret product ids and the business id.
5. **Keep secrets out of chat.** API keys and webhook secrets are needed only for the test portal script and the phase 2 server. They go straight into the Keychain or Cloudflare secrets, never into chat or the repo.
6. **Numbers and policies to choose.** Settled for M47 on 31 Oct 2026 (the founder: "U tell me"): 3 free proven fixes a calendar month; activation limit 3, set in the Dodo dashboard; Undo does not give a fix back and Bring back never counts again; Delete everything keeps the trial item (Option 2); the in-app trial (Option A); Get Pro lists Yearly, then Monthly. Still open: the grace length, the student check, the retention discount and local prices.
   - Free fixes per month (3 proposed).
   - Activation limit (3 proposed).
   - Grace period length (3 days is Dodo's default).
   - Whether Undo gives a free fix back. The proposal is no, because of the Bring back loop in section 2.
   - What Delete everything does with the trial item (section 10; Option 1 recommended).
   - The student check method, and whether student codes apply on top of PPP, given the roughly $0.55 fee on a $1.50 to $2.50 charge.
   - Retention discount on or off.
   - India and EU localized prices, or PPP defaults.
   - Option A (in-app trial) or Option B (Dodo's trial).
7. **Switch payments on** when ready. Until then, nothing is charged and nobody is gated.