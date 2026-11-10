# F25. Pricing: Free, and Pro at $10 a month

- **Status:** Founder decision, 29 Oct 2026 (picked "Free + Pro $10/mo" from three options in the M28 overhaul).
- **Date:** 2026-10-29
- **Related:** F10 (bring your own Claude), F22 (company paid usage, gated), F14 (browser check for everyone), product_research.md section on plans, `usage-proxy/src/plans.ts`, M28

## Decision
- **Free:** the daily habit features (Show me how, voice, Prompt help, Explain an error) and a few fixes a month, with every safety feature, the browser check (F14), undo and receipts.
- **Pro:** $10 a month, or $8 a month billed yearly ($96). Unlimited fixes, Ship with rollback, recaps, all looks. A 14 day trial with no card. Students half off. Regional prices through the merchant of record (Dodo, F22).
- **The message:** "You pay Anthropic directly. We never mark up your AI." Squibby prices the app, not the model.

## Why
- **Anchors (research, 29 Oct 2026):**
  - Apps that run on your own key charge about $8 to $10 (Raycast Pro $10, Superwhisper $8.49).
  - Apps that pay for the model charge $15 to $20 (Wispr Flow $15, HeyClicky Pro $20).
  - a16z finds generous free tiers produce paid users who stay past month 12.
- **Half of HeyClicky's $20,** with no message caps from us, because the user's own Claude pays for the model.

## What changes
- **The usage proxy's plan table** (`usage-proxy/src/plans.ts`) follows this decision for the light features it may carry (F22). Managed usage stays switched off until its own conditions are met.
- **The earlier Plus at $8 in the product research** is replaced by this record.
- **Payments stay off.** Nothing is charged until payments are switched on.

## Changed by the founder, 6 Nov 2026 (built in M79, 11 Nov 2026)
- **Pro is $15 a month** (the founder's answer of 6 Nov 2026, after F29 moved model costs to Squibby). No yearly price is set yet, so no yearly choice shows until the founder sets one.
- **A one time "Is this safe to go live" report at $29** for one project, sold through Dodo like Pro and switched off with it. Pro includes it (to be confirmed by the founder).
- Prices live in one config only, `app/src/prices.json`. What Free and Pro include is one list in `strings.ts` (`S.m79.includes`), with every limit written as "with limits" until it is measured.
- Payments stay off: the build's own switch (`paymentsOn` in `billing.*.json`) and a remote switch (`remoteSwitchUrl`, empty today) must both say yes. Dodo test mode until the founder's account, lawyer and domain exist.

## Revisit only if
The founder changes the price, or Anthropic's terms change what Squibby may pay for.
