# M47: Pro, built and switched off

- **Status:** Built on branch `m47/pro` (stacked on `m46/quiet`), 31 Oct 2026. Payments are off in both billing files. Nothing changes for anyone until the founder switches them on.
- **Sources:** F25 (pricing), F22 (Dodo chosen), F28, T17 (Pro is a Dodo license key), `docs/design/2026-10-31-dodo-payments-spec.md` (the payments spec), AGENTS.md rules 1, 2, 5, 9, 12, 13, 16, 17, 20 and 21.
- **Founder's word:** "U tell me" and "keep going until you finish everything". The calls this left to the build are listed in section 2.

## 1. What M47 is

Squibby can sell Pro ($10 a month, $96 a year) through Dodo Payments, with no account and no server of ours:

- Pro unlocks with a Dodo license key, pasted once and kept in the Keychain. Dodo's public license endpoints check it. The app carries no secret.
- Checkout and billing open in the person's own browser. There is no card form, no login form and no web view.
- A 14 day trial with no card runs on the Mac. One tap starts it, once per Mac.
- Free keeps 3 proven fixes a month and every safety feature. Ship with rollback, Recaps and the extra water colours are Pro.

**With payments off, which is how it ships, the app behaves exactly as before.** There is no gate, no network call to Dodo, no timer, no Pro tag, and the Plan card shows Early access. Tests prove this in all three suites.

## 2. Calls made for this build (31 Oct 2026)

| Call | Choice | Why |
|---|---|---|
| Free fixes a month | 3 proven fixes per calendar month, local time | The spec's proposal |
| Does Undo give a fix back? | No. Bring the fix back never counts again | Otherwise fix, Undo, new fix, Bring back keeps any number of fixes |
| Trial | In app (Option A), 14 days, offered only after the first proven fix in Settings, always on the limit card and the card behind a Pro tag | No email, no browser, no network, no open check |
| Activation limit | 3 Macs, set in the Dodo dashboard | It is Dodo's setting, not code |
| Delete everything | Keeps the trial item and names it on its screen; the free fix count starts again (spec section 10, Option 2) | Option 1 would let anyone restart the trial with one button |
| Get Pro | Yearly first, then Monthly, nothing chosen for the person | Yearly costs us less in fees and has fewer renewals that can fail |
| The portal button | "Billing and invoices", not "Manage billing" | The house copy test bars buttons that start with "Manage"; the label is one line in `strings.ts` |
| How long the trial end shows | 7 days after the end, then the usual Free rows | The end is news once, not for the life of the Mac |

## 3. What is built

**Shell (Rust, `app/src-tauri/src/`):**

- `license.rs`: the billing files, the request bodies, reading Dodo's answers, the decide function, the grace clock (day 10 warns, day 14 sends new tasks to Free), the inactive key's daily recheck for 30 days, the steady clock, the Plan card's status, and the activate, check and deactivate flows. Every HTTP call goes through a `Transport` that tests replace; the real one is the Mac's own curl with the body (which holds the key) on standard input.
- `trial.rs`: the trial item (`pro-trial`), started once per Mac.
- `main.rs`: the commands (`license_status`, `license_activate`, `license_check_now`, `license_deactivate`, `plan_open_checkout`, `plan_open_portal`, `trial_start`), the plan push to the engine and the pages, and the check timer.
- `runner.rs`: the `plan.state` line, sent only by the shell, never with the key.
- `wipe.rs`: "Also turn off Pro on this Mac?" and Option 2.
- `billing.test.json` and `billing.live.json`: hosts, empty product ids, empty business id, `paymentsOn: false`.

**Engine (`runner/src/plan.ts`, `db.ts`, `main.ts`, `agent.ts`):** the gate, the three command lists of spec section 2a (a test fails for any command in none or two), the free fix count in `tasks.db`, and `plan.usage` and `plan.limit`.

**Pages (`app/src/plan.ts`, `planCard.tsx`, `usePlan.ts`, `card.tsx`, `settingsPage.tsx`, `strings.ts`):** every row of spec section 9a, the Get Pro sheet, the limit card, the Pro tags, the last free fix line and Delete everything's Pro lines.

**Protocol:** `plan.state`, `plan.usage` and `plan.limit`, with `protocol/fixtures/plan-cases.jsonl` shared by the Rust and engine suites.

### 3a. Fixed after review (31 Oct 2026)

- A Keychain that cannot be read is never "no key". The last plan decided stays, the timer waits and looks again, and with no plan decided yet the Plan card says so calmly and nothing is gated.
- Plan pushes are worked out and sent under one lock, so an older plan can never be the last one the engine or the pages hear.
- A 403 or 404 counts as Dodo's answer only when its body is Dodo's own JSON error. A proxy's or a firewall's 403 is "unknown" and never turns Pro off.
- The trial's end reaches the pages and the engine on time: the timer wakes just after the end, and pushes once more before it stops.
- A clock set back neither adds days nor pauses the trial or the grace period: while the app runs, Pro is judged by a steady clock that moves on in real time.
- A fresh key after a clock set back starts with a fresh check, never in grace.
- The month resets on the pages too: on the 1st, Home no longer holds back Fix it with last month's count.
- Every way into Ship (the main button, the Is it safe chip, Put it online, the notch and the confirm rows) shows the Pro card first on a plan without Pro, and sends and clears nothing. Plan it at the free limit keeps the goal in the box.
- The Pro tag inside the main button takes the button's own words, readable on the silver and the ink fills.
- The trial end copy shows for 7 days, then the usual Free rows.
- Billing and invoices shows only once the portal is filled in, and the portal and a browser that did not open have their own calm words.

## 4. What waits on the founder's Dodo test account

The founder creates the test products and settings (spec section 12) and copies the non secret ids and the test checkout host into `billing.test.json`. Then the test mode run of spec section 15 settles these. Until then, every Dodo behaviour above is read from Dodo's docs, not proven.

| Id | Question | What depends on it |
|---|---|---|
| V0 | Does a static link work with our `redirect_url` or the default success page, and what is the test static checkout host? | `checkoutHost` in `billing.test.json`; whether a thank you page is needed |
| V1 | Do the public endpoints work with no Authorization header? Also: the exact shape of Dodo's 403 and 404 bodies | The whole design (the app carries no secret); `license.rs` `from_dodo` |
| V2 | Is a key issued at the start of a cardless trial? | Option B only, the fallback |
| V3 | Does `redirect_url` accept a custom app scheme? | Phase 2's return path |
| V4 | How soon does a key come back after on_hold once the card is fixed? | The 30 day daily recheck |
| V5 | Does a 50% code apply on a PPP priced static link? | Student codes |
| V6 | Does the portal list or remove activations? | The "already on 3 Macs" copy |
| V7 | Rate limits on validate | The 12 hour check and Check again |
| V8 | The payout fee: free, or $5 under $1,000? | The founder's numbers |
| V9, V10, V12 | Not in the spec's list (the spec skips these numbers) | Nothing |
| V11 | Are webhook retries signed again? | Phase 2 server only |
| V13 | Is a Day billing interval allowed? | Testing renewals without waiting a month |
| V14 | Are license emails sent in test mode? | How the test key is found |
| V15 | What happens to a license key after a refund or a chargeback? | The inactive copy |
| V16 | Does the portal's Revoke Cancellation keep the key valid with no gap? | Nothing breaks if not; the recheck brings it back |

Also before payments go on:

- Fill in the product ids, the business id and the hosts in both billing files, then switch `paymentsOn` on in the test file only and run spec section 15 end to end.
- Copy the products and settings to live, fill in `billing.live.json`, and switch it on only when the founder says so (F25).

## 5. How it was checked

- Rust: `cd app/src-tauri && cargo test` (license, trial, wipe, runner plan lines, the shared fixtures). No test reaches the network or the real `companion` Keychain service; the one real Keychain test uses a `companion-test-*` service and runs only with `--ignored`.
- Pages: `cd app && bun test ./src && bun run typecheck`, and the page build.
- Engine: `cd runner && bun test`, the full suite.
- No test calls Dodo or any network service: every call goes through a transport the tests replace.

## 6. Not in M47

- Dodo's own cardless trial (Option B), the phase 2 return path (a deep link or a one file page), and any server.
- The remote payments switch: it will share whatever the T03 plan route switch uses, which is not built yet.
- F22 managed usage stays off and untouched.
