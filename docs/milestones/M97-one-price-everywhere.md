# M97: One price everywhere: Pro $15 a month, $144 a year, no Max

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 15 Nov 2026, tests pass. Committed 15 Nov 2026 (faba93a). Nothing was spent: no real model call, no key, no deploy, no account; fixture costs and temporary folders only.

The why: on 15 Nov 2026 the price disagreed in five places, so the founder, a lawyer or a checkout setup could act on a wrong number. Nothing user facing was wrong (payments are off), but the founder could have made Dodo products at $20 and $100 from the go live checklist, and a lawyer could have read "about $8 a month".

| Where | Said on 15 Nov 2026 | Right (F25 as changed 6 Nov 2026, F31 of 13 Nov 2026) |
|---|---|---|
| `app/src/prices.json` | $15 a month, $144 a year | already right |
| `usage-proxy/src/plans.ts` | $10, $96, and a `max` plan | no price at all, no `max` |
| `docs/launch/company-paid-go-live-checklist.md` | Pro $20, Max $100, limits $1.50 and $12 | $15 and $144, limits read from `plans.ts` ($0.75 and $5) |
| `docs/architecture.md` (M28 pricing row) | $10, $96 | points to F31 |
| `docs/launch/legal/lawyer-questions.md` | about $8 or $72, no billing code | $15 and $144, billing built and switched off |

## The founder's calls

- **15 Nov 2026: the whole plan, as written.**
- **The Pro model allowance: "measure, then decide".** The $0.75 a day and $5 a month stay exactly as they are. This milestone adds the measuring tool and a note; M100 measures the real cost of fixing under F29, and the founder sets the number.

## What to build (from the plan)

1. `app/src/prices.json` is the one source of truth (M79). Delete `priceUsdMonthly` and `priceUsdYearly` from `usage-proxy/src/plans.ts` (only its own test read them). Remove the `max` plan. Fix the header comment so it points to F25 (changed 6 Nov) and F31.
2. A note in `plans.ts` that the Pro model allowance was sized for light features and has not been checked against the cost of fixing under F29. The number does not change here.
3. Go live checklist: item 2 becomes Pro $15 a month and $144 a year, two Dodo products (monthly and yearly, F31), no Max. Items 4 to 6 use the real `plans.ts` limits.
4. `docs/architecture.md` pricing row: point to F31. `docs/launch/sales/pricing-options.md`: marked as replaced by F29 and F31.
5. Dated history docs (the Dodo payments spec and the UI/UX overhaul spec of 31 Oct): one line at the top, no rewrite.
6. F25: one dated pointer line only. Founder records are not reopened.
7. Optional, only once payments are on: the amount beside the percent in `S.m88.offers`. Not built: payments are off, so nothing would show.

## Tests first

- `usage-proxy/test/core.test.ts`: the test that pinned $10 and $96 is replaced by tests that the usage server holds no price, that no `max` plan exists (an old `max` entitlement reads as free), that each plan's model allowance stays under its price in `app/src/prices.json` (monthly, and yearly per month), and that the Pro allowance is still $0.75 and $5.
- The payment tests (`stripe.test.ts`, `dodo.test.ts`): a price or product mapped to `max` is never granted.
- The measuring tool (`allowanceReport`): fixture costs only.

## Built

- **`usage-proxy/src/plans.ts`**: a plan is only a name and its model allowance (`dailyUsd`, `monthlyUsd`). `priceUsdMonthly` and `priceUsdYearly` are gone (nothing but their own test read them). The `max` plan is gone, so a payment table that names it is refused (`parseDodoProducts`), a Stripe price or Dodo product mapped to it grants nothing, and an entitlement that says `max` reads as Free (`planOf`, "never better than free"). No real entitlement says `max`: payments were never on. The header points to F25 (changed 6 Nov) and F31, and says the Pro allowance has not been checked against the cost of fixing under F29.
- **The measuring, not the number** (the founder's "measure, then decide"): `allowanceReport(plan, costsUsd)` takes measured costs of whole fixes and says, for a typical (median) fix and the dearest one, how many the monthly and the daily allowance cover, in plain sentences that end "Nothing was changed. The allowance is the founder's call". `costsFrom` reads a list of amounts, records with `costUsd`, or `{ costsUsd }`. `usage-proxy/scripts/allowance.ts <costs.json> [plan]` prints it with Pro's price read from `app/src/prices.json`, and changes nothing. M100 feeds it real costs.
- **`usage-proxy/dodo-products.example.json`**: two Pro products, monthly and yearly. `usage-proxy/README.md`: the plan table row and the set up steps say Free and Pro, two Pro products, no Max.
- **Docs**:
  - `docs/launch/company-paid-go-live-checklist.md`: item 2 is two Dodo products for Pro, $15 monthly and $144 yearly, no Max; item 4 maps both to `pro`; item 5's table is Free and Pro with the real limits ($0.75 and $5), read from `plans.ts`, with the measuring command; item 6's worst case is worked out again (101 Pro accounts pass $500, or 251 Free).
  - `docs/launch/legal/lawyer-questions.md`: the price fact is Pro $15 or $144, the $29 report, Dodo as merchant of record, billing built and switched off.
  - `docs/architecture.md`: the M28 pricing row points to `prices.json` and F31.
  - `docs/launch/sales/pricing-options.md`: marked at the top as replaced by F29 and F31.
  - `docs/design/2026-10-31-dodo-payments-spec.md` and `docs/design/2026-10-31-uiux-overhaul-spec.md`: one line at the top, no rewrite.
  - `docs/decisions/F25-pricing-free-and-pro.md`: one dated pointer, "Yearly set by F31, 13 Nov 2026: $144." Nothing else in the record changed.
  - `docs/research/product_research.md`: the old Plus row's note now points to today's price (it said "Pro $10 a month, $8 yearly").

## Expectations changed on purpose

- `usage-proxy/test/core.test.ts`: the F25 test that pinned $10 and $96 now says the usage server holds no price, that each plan's allowance stays under its price in `prices.json` (the kept check, now against the real price), that there is no Max plan, and that the Pro allowance is still $0.75 and $5. The old "a plan sold before F25 is never more than Pro" test is replaced by the no Max test, since that plan is gone.
- `usage-proxy/test/stripe.test.ts`, `dodo.test.ts`, `abuse.test.ts`: the second product or price, and the plans written in set up, are Pro (monthly and yearly) instead of Max. Each test checks the same thing as before. Each payment file gains a test that `max` is never granted.

## Not built, and why

- Item 7 of the plan (the amount beside the percent in `S.m88.offers`): payments are off, so nothing would show. Build it when payments go on.
- The rest of the go live checklist and the lawyer brief still describe the fixing engine on the person's own Claude (before F29). That is M98's and M100's job, which rewrite the F29 story and AGENTS.md rules 1 to 4.
- Settings, Account still shows a Spending group (`spend.dailyLimit`, $10 a day, and `budget.task`, $3 a task, in `protocol/settings.json`) right under "Squibby pays for the AI it uses" (`setGroupFoot["account.plan"]` in `app/src/strings.ts`). A reader takes these for their own dollars, and they disagree with the allowances in `usage-proxy/src/plans.ts` (Pro $0.75 a day and $5 a month, Free $0.20 a day and $2 a month), so the server stops a person long before either limit they can see. Renaming or hiding the group (for example as the plan's real allowance) is a change to what the person sees and controls, so it waits for M100's "measure, then decide" under F29.

## Found on the way

- In the 2x shots, the Get Pro sheet opened from Settings, Account drew under the Settings sidebar and header, with its title hidden and its text cut on the left. Every Settings sheet shared it: the page's fade at its foot is a CSS mask, and a mask clips everything inside it, the fixed sheet layer too. **Fixed in the review round:** while a sheet is open the page's mask is lifted, and in the wide Settings a sheet is as wide as the page column (`--w-sheet: calc(100% - var(--w-side))`), so the list of pages stays beside it under the scrim (`app/src/ui/look.css`, test `app/src/m97Sheet.test.ts`). Shot again wide, tall and narrow: the title, every line and the key row read in full.

## Tests

- `usage-proxy/test/core.test.ts` (4 in the pricing group), `usage-proxy/test/m97-allowance.test.ts` (8: the median and the dearest, an even count, amounts left out, the exact sentences with no dashes, a fix that fits, an allowance smaller than a fix, reading costs, the script on a temporary file), `usage-proxy/test/m97-one-price.test.ts` (4: the documents people act on say $15 and $144 from `prices.json`, none says an old price or Max, the example table is Pro twice, the history docs carry their top line), and one new `max` test each in `stripe.test.ts` and `dodo.test.ts`.

## [verify] with the founder

These are also listed in `docs/research/technical_research.md` section 20, item 42.

- When the Dodo account exists: make the two Pro products in test mode (monthly $15, yearly $144), map both to `pro` in `DODO_PRODUCTS`, send one test mode webhook for each, and see Pro granted; the checkout shows $15 and $144.
- In M100: run real fixes on fixture projects, save their costs as JSON, run `cd usage-proxy && bun scripts/allowance.ts costs.json`, and the founder sets the Pro and Free allowances from what it says.

## Shots

Headless Chromium at 2x, the pages built from this tree and served with a stand in for `window.__TAURI__` (license_status with payments on, as a check only; payments stay off in every build): Settings, Account with Get Pro, and the Get Pro sheet showing "Yearly, $144 a year" and "Monthly, $15 a month". Paths are in the final report.
