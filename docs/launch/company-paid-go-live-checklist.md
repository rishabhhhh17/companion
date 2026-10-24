> **DRAFT checklist, written 24 Oct 2026. Not legal advice.** The managed route (`usage-proxy/`) is built, tested and **switched off**. Nothing below has been done. Do the items in order; do not skip ahead to the switch.

# Go live checklist: company paid plans (plain API light features only)

**What goes live:** the light features (the guide, Explain, Second Look, Prompt help, picture reading) on Anthropic's plain Messages API under our own key, paid for by us and covered by plan prices. **What does not:** the fixing engine (Claude Code) stays on the person's own Claude. On the managed route it refuses with a plain message.

**Who each item waits on.** `[F]` the founder. `[L]` a lawyer. `[A]` Anthropic. `[B]` code still to be built. `[F+A]` both.

## What does and does not block this
- **Does NOT block the plain API light features:** Anthropic's answers on shipping the program inside the app (point 1) and on an agreement for Claude Code usage (point 3) of the 23 Oct follow up. Those decide the installer and the fixing engine, not this route. Anthropic's support has said the plain API setup is "a standard setup" (`docs/outreach/anthropic-support-reply-2-2026-10-23.md`). It is a support email, not a signed agreement: **[L]** read it before the business depends on its exact words.
- **Does block it:** the acceptable use terms and the abuse process (Anthropic's condition), the real store and Worker, the lawyer reading the legal pages, the higher usage tier.

## The list

### A. Accounts and money
- [ ] **1. Dodo account and identity check.** `[F]` Create the account, finish the identity and business checks, switch from test mode to live when ready. Fees, payout schedule and terms are Dodo's own: read them in the dashboard; nothing in the repo states them.
- [ ] **2. The product and the price.** `[F]` One Dodo product per paid plan: Pro ($20 a month) and Max ($100 a month) are the numbers in `usage-proxy/src/plans.ts` today. Free has no product. The price is a founder decision; if it changes, the limits in item 5 must be re-checked against it.
- [ ] **3. The webhook secret** `[F]` In the Dodo dashboard add a webhook to `https://<the proxy's address>/webhooks/dodo`, subscribe it to the subscription events and `payment.succeeded`, copy its signing secret (starts with `whsec_`) into the operator's environment as `DODO_WEBHOOK_SECRET`. Never in the repo or a log.
- [ ] **4. `DODO_PRODUCTS` config.** `[F]` The JSON table from Dodo product id to plan name (`pro` or `max`), shape in `usage-proxy/dodo-products.example.json`. Set `PAYMENT_PROVIDER=dodo`. A product missing from the table gets no plan and the webhook answers 503 until it is fixed.
- [ ] **4b. The metadata secret.** `[F]` Make a long random value (at least 32 characters) and put it in the operator's environment as `METADATA_USER_ID_SECRET`. It makes the opaque `user_id` Anthropic sees. **Keep a safe copy apart from the server. Never change it casually:** changing it changes every id, and ids in older Anthropic notices can no longer be matched to people. Without it the proxy refuses to forward anything.
- [ ] **4c. One real Dodo test mode webhook received.** `[F]` then me. Still unproven: that checkout `metadata` (`companion_user_id`) reaches the subscription events, the payload fields, what `cancelled` means for timing, the exact request. See `docs/milestones/M13-managed-usage-plan.md`.

### B. Money limits
- [ ] **5. Plan limits reviewed.** `[F]` The real numbers today (`usage-proxy/src/plans.ts`, dollars of Anthropic cost, day and month in UTC):

  | Plan | Price | Daily limit | Monthly limit |
  |---|---|---|---|
  | Free | $0 | $0.20 | $2 |
  | Pro | $20 a month | $1.50 | $12 |
  | Max | $100 a month | $8 | $60 |

  Also: at most 4 requests at once per person, and an answer may not be longer than 64,000 tokens. A person can run past a limit by about one request. Check these against a price you are happy with and against item 6.
- [ ] **6. A higher Anthropic usage tier requested.** `[F+A]` The Start tier has a **$500 a month** cap. Worst case, if every account used its full monthly limit: 42 Pro accounts would pass $500 (42 x $12 = $504), or 250 Free accounts (250 x $2 = $500), or 9 Max accounts (9 x $60 = $540). Real use will be lower, but a viral day could hit the cap and **stop the service for everyone**. Request the next tier before the rollout goes past friends. Also set the Console workspace spend limit as the last backstop (it is mentioned in F22; the amount is yours to choose).
- [ ] **7. A prepaid balance in the Console** `[F]` large enough for the first month, with a low balance alert to your email. Check how Anthropic bills at your tier (balance or invoice): not stated in the repo.

### C. Terms, abuse and legal
- [ ] **8. Acceptable use rules published.** `[L]` then `[F]`. Draft: `docs/legal/acceptable-use-draft.md`. Re-read Anthropic's live Usage Policy and copy its categories exactly. Fill in the support and abuse addresses.
- [ ] **9. Terms of use, privacy policy and refund and billing rewritten for this route and published.** `[L]` then `[F]`. The current drafts in `docs/launch/legal/` say "no server of ours"; that is false on this route and **must not be claimed for it**. Cover: prompts and screen pictures pass through our server to Anthropic and are not kept; counts and a code that stands for the person are kept; who the merchant of record is; refunds. A lawyer reads all of it before it is public (`docs/launch/legal/lawyer-questions.md` lists the questions; add the new ones from the acceptable use draft).
- [ ] **10. The abuse process walked through once.** `[F]` Read `docs/legal/abuse-process.md`. Do a dry run of the suspend command against a test store with a made up owner. Know who answers the abuse address and how fast.
- [ ] **11. Anthropic's contact for misuse notices.** `[A]` The founder asked on 23 Oct 2026. Write the answer into the abuse process. Until then replies go to the support thread.

### D. Things still to build (nothing runs without them)
- [ ] **12. The Worker, the real store, sign up and sign in.** `[B]` The Worker that receives requests and webhooks; a store with the same interface as `MemoryStore` (including the suspend and restore methods) that is atomic per user (a Durable Object or a database transaction), and the same tests must pass against it; sign up with a verified email and abuse limits on new accounts (the Free plan is the easiest to abuse); `issueToken` is what sign in must use so a suspended person cannot get a new token.
- [ ] **13. The remote switch.** `[B]` then `[F]`. The proxy takes an `enabled` function; the switch behind it (a setting the proxy reads) is not built. **The founder flips it, nobody else.** It stays off until every item above is ticked. It stays in place even after a yes (F22). The app side is switched on separately by `COMPANION_ROUTE=managed`.
- [ ] **14. The app side.** `[B]` The sign up screen and the key screen's new option wait for the founder's word on the look.

### E. Rollout
- [ ] **15. Staged rollout.** `[F]` Ten friends first, on Free and Pro, for at least a week, with you watching the daily total (item 16). Then a few dozen. Only then public. Between stages: read the counts, check no limit was passed by more than one request, and run the suspend command once on a friend who agrees, to prove the whole path (a dry run, then a real suspend, then restore).
- [ ] **16. Monitoring by hand.** `[F]` Every day: the day's total spend (the sum of the day's records in the store) against the Console balance and usage page. They should match closely. A gap means a bug in metering and is money. Set a rule for yourself: if the day's spend is more than [an amount you pick] above the day before, switch the route off first and look after. There is no automatic alert yet: it is an alert by hand until one is built.
- [ ] **17. The refund and cancel path.** `[F]` then `[L]`. Where a person cancels (Dodo's customer portal or a link), what happens on cancel (the code drops them to Free at once; Dodo's docs do not say whether access should run to the end of the period), how a refund is requested and who decides. Test a cancel and a refund in Dodo test mode first.
- [ ] **18. A way to switch off in a hurry.** `[F]` Know where the switch is and how to flip it from your phone. Practise once.

### F. Afterwards
- [ ] **19. If Anthropic's terms change.** `[F]` Anthropic can change its Commercial Terms, Usage Policy or prices. Re-read them every month and when you get an email from them. If a change makes the setup not allowed or not worth it: flip the switch off (people keep using their own key, which is the way out); tell the paying people in plain words; stop new sales in Dodo; refund unused time as the terms say; update `docs/decisions/F22-company-pays-for-usage-gated.md`. Also re-check the prices in `runner/src/models.ts` when Anthropic changes them, because the limits are in dollars priced by that table.
- [ ] **20. Written confirmation kept.** `[F]` Save the 23 Oct 2026 support email and every later Anthropic message that matters.

## Open questions and who answers them
| Question | Who | Blocks the plain API light features? |
|---|---|---|
| May we ship the SDK's own unmodified binary inside the app? (point 1) | Anthropic | No. It decides the installer |
| Who do we talk to for an agreement that includes Claude Code usage in paid plans? (point 3) | Anthropic | No. It decides whether the fixing engine can ever be company paid |
| Who contacts us about misuse and how | Anthropic | Not to switch on, but needed for the abuse process |
| Higher usage tier | Anthropic | Yes for anything past friends |
| Governing law, liability, refunds, data protection wording | Lawyer | Yes for public launch |
| Price, plan limits, the entity and payout account | Founder | Yes |
