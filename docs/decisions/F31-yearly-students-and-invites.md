# F31. Yearly billing, a student offer, and invite and earn

- **Status:** Founder decision, 13 Nov 2026 (choices taken from HeyClicky's plans, which the research of 13 Nov 2026 read on heyclicky.com and in its changelog).
- **Date:** 2026-11-13
- **Related:** F25 (pricing; Pro $15 a month since 6 Nov 2026), T17 (Pro is a Dodo license key), M79 (prices in one config, payments built and switched off), M88 (built)

## Decision
- **Pro stays $15 a month.**
- **Yearly billing is 20% off:** twelve months of the monthly price less 20%, so $144 a year. Get Pro shows Yearly first, as the payments spec's section 4 always wanted once a yearly price was set.
- **Students get 50% off their first month** of Pro (monthly).
- **Invite and earn:** the invited friend gets 25% off their first monthly month. The person who invited them gets 25% of the friend's plan as credit, for up to 12 months (a monthly friend: 25% of each month's plan price, at most 12 months; a yearly friend: 25% of the yearly price once, since it covers those 12 months).

## Why
- HeyClicky, the closest product (a YC company), offers the same three: "yearly billing 20% off; students get 50% off the first Pro month", and since 24 Sep 2026 invite and earn ("the friend gets 25% off their first monthly month and you get 25% of their plan for up to 12 months"). Sources: `research-1113/competitors.md` and `yc-companies.md` of 13 Nov 2026, from heyclicky.com and its changelog.
- The research also found no pricing evidence for Squibby yet (synthesis section 5, item 7), so these are bets to test, not proven numbers.

## What changes
- `app/src/prices.json` holds every number: `proYearly` 144 and an `offers` block (yearly 20, student 50, friend 25, inviter 25, months 12). `app/src/plan.ts` reads them (`offersFrom`, `yearlyAgrees`, `studentFirstMonth`, `friendFirstMonth`, `inviterCredit`, `offerLines`), with tests in `app/src/m88.test.ts`. The words are in `strings.ts` (`S.m88.offers`), in percents only.
- **Payments stay off.** Both switches stay off (`paymentsOn` false in `billing.live.json` and `billing.test.json`, and the remote switch empty), so nothing is charged and none of this shows to anyone. `offerLines` is empty while payments are off.

## Not built yet
- How a student is checked, and how an invite is tracked and the credit paid, at Dodo (discount codes, a referral program or our own ledger). That needs the founder's Dodo account and a choice of method before any code.
- A yearly product id at Dodo (the checkout's Yearly button stays not ready until it is filled in).

## Revisit only if
The founder changes a price or an offer, or Dodo cannot carry an offer as written.
