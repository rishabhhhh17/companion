# Pricing options

Drafted 20 Oct 2026. This is a thinking document for the founder. No price here has been tested with a real customer, and billing, terms and a merchant of record are not set up. The founder owns the decision (market research section 7).

## What is fixed before any option

1. **The customer pays Claude directly** (AGENTS.md rules 1 and 3, F10). We never pay for, resell, mark up or route model usage. So our cost per user is close to nothing that grows with use: update hosting, and fixed costs (Apple's $99 developer program, Windows signing later, and a $9 Rive seat). Voice runs on the device. This is what makes a low price possible, and also what makes it hard to charge a lot: the customer already pays about $20 a month to Anthropic if they use a plan, or pay per use on an API key.
2. **Every user gets the browser check** (F14). Proof up to a real browser check is not a paid feature.
3. **What we sell is not model access.** It is the finish: find, fix, prove, undo, explain. Pricing must not look like a Claude markup.
4. **The subscription (plan sign in) route is off until Anthropic confirms in writing.** Until then every customer needs an API key with credit, which is a friction point for beginners. Price must not make that worse.
5. **Anchors from the research** (market research section 7, product research pricing table):
   - Bring your own key tools sit at $8 to $15 a month (Raycast, Superwhisper, Wispr).
   - All inclusive tools sit at $20 to $25 (HeyClicky Pro $20 [recheck], Cursor, Lovable) because they pay for the model.
   - Prompt help apps sell at $7.99 a month, or $29 lifetime (vendor pages).
   - India anchor: ChatGPT Go at 399 rupees a month. Suggested tests: 299, 399, 499.
   - Students: 40 to 50 percent off.
   - Test $8, $12 and $15.
6. **Retention risk:** AI apps convert to paid well but keep users worse (21 percent still subscribed after a year, against 31 percent for other apps, per RevenueCat 2026 as cited in the market research). A subscription needs a reason to be open every month. Companion's job (getting unstuck) is episodic, which is a real concern for a monthly price.
7. **Nothing is proven about willingness to pay.** The product research lists "Will non engineers pay $8 on top of a Claude plan?" as an open question (assumption: core revenue). Every option below is a hypothesis to test with a fake door, then a direct ask with a payment link.

---

## Option A: One time purchase

**Shape:** Pay once, about $29 to $49, use forever. Updates for one year (or all 1.x versions).

**Why it could work**
- Matches how people value a tool with no running cost to us. Our cost per user is low, so no usage to pay for.
- Reduces the "another subscription on top of Claude" resistance, which is the biggest objection for a bring your own key product.
- Prompt Enhancer sells at $29 lifetime (vendor page), so there is a buyer precedent in the nearest category.
- Simple to explain. Good for students and for building in public.

**Why it could fail**
- Revenue stops after the early buyers. There is no recurring income to fund the character art, lessons and new tools that people will expect.
- Lessons for Lovable, Vercel and other tools go out of date as those tools change their screens. That is continuing cost with no continuing revenue. This is the strongest argument against.
- A lifetime price is hard to raise later, and hard to withdraw.
- Does not use the "plus features" split in the research.

**Fits if:** the founder wants to find out fast whether anyone pays, and accepts low lifetime revenue.

---

## Option B: Subscription only

**Shape:** About $8 a month or $72 a year, a 50 percent student discount, regional pricing (about 299 rupees in India). A free trial of 14 days or a fixed number of fixes.

**Why it could work**
- It is the form that pays for upkeep of lessons, which change as the builder tools change.
- $8 sits well below the $20 all inclusive anchors and inside the $8 to $15 bring your own key band.
- A merchant of record handles global tax. Paddle supports UPI Autopay for subscriptions in India (since June 2026 per the market research); Dodo Payments is the comparison. Razorpay alone is not a merchant of record.

**Why it could fail**
- The customer already pays Claude. A second monthly bill for a beginner is a real objection.
- Use is episodic: people are stuck in bursts. They may subscribe, finish the project and cancel. Churn will be high.
- With no free tier, there is no daily habit and no word of mouth. The trial must show the hero (a real fix with proof) before it ends, which depends on the user having an API key in the first place.
- The weakest part of the product today (the character, the real screen drawing) is the part a trial user would judge.

**Fits if:** the founder believes the hero is strong enough to be bought blind, and wants recurring revenue from day one. Not recommended before real users have seen the hero on a real screen.

---

## Option C: Free plus paid (recommended)

**Shape:** A free tier that does the hero well, and a paid tier (Plus) for finishing and shipping and extras. The company never pays for model use, so a generous free tier costs almost nothing to run, and that is the unusual advantage here.

**Why it could work**
- It matches the product research as written: Free carries the daily habit features (Prompt help, Show me how, voice) because they cost Companion nothing and bring people back; Plus carries finishing and shipping.
- It gets the hero into many hands with no friction beyond the API key. The market research says the pain is being stuck, and the first fix is the proof it works.
- It lets the beta measure what the market research asks for (D7, D30, who ships at least one project) before choosing what to charge for.
- Price testing is natural: fake door on Plus features, then a direct ask.

**Why it could fail**
- If the free tier is too good, nobody upgrades. If it is too thin, nobody trusts the hero. The line has to be drawn after the beta, using what people actually use.
- Plus features in the research (phone approvals, projects shelf, timelapse, extra characters, Loop Closer, recaps) are mostly **not built or not in the launch scope** (F17 and F18 park a lot). Today there is not yet enough to put behind a paywall without it feeling arbitrary.
- Two tiers means more support and more explaining.

**Fits if:** the founder wants to learn first and charge second. This is the safest order given the facts above.

---

## Recommendation: Option C, with a plan to charge later

1. **Launch the friends preview and the first public build free**, with the whole hero. Measure.
2. **Introduce Plus only when there is something real to put in it**: from the research, unlimited ships with rollback, screenshot evidence and a second model review on top of the browser check, full receipt history, extra characters when the art exists, phone approvals when built.
3. **Test price with a fake door first**: $8, $12 and $15 a month, India 299, 399 and 499 rupees, and an annual option at $72. A student discount of 40 to 50 percent. Compare to a one time $39 offer as a fourth cell in the same test, to learn whether a one time price pulls more buyers than a subscription.
4. **Offer an early supporter one time price** to the first friends only if the founder wants cash early and accepts the upkeep risk in Option A. Keep it small and clearly labelled.
5. **Do not include credits or managed Claude** (research: not offered in v1; needs Anthropic's written terms).

### What the free tier would contain

Everything that makes the hero work, on the customer's own Claude:

- The stuck key: find the problem in your project or on your screen, name the cause in two sentences
- Fix in small steps, with a snapshot before each step, Undo, and the fix loop breaker
- Proof up to a real browser check (install, build, tests, dev server, browser check), for everyone (F14)
- Explain (two short lines of why)
- Show me how and Your turn mode, and the lessons
- Prompt help (rewrite a prompt in any app, show a diff, paste back on accept)
- Hold to talk (voice, on the device)
- Drop a file to convert (works with no Claude at all)
- Stop everything, house rules, the safety checks, the practice projects
- Memory you can read and edit, and receipts for the last 7 days
- One project shipped with the safety gate, preview and live
- One character (the plain dot until the art arrives)

Free must **never** hold back safety. Undo, Stop and the safety checks are not features to sell.

### What a Plus tier could contain (only things that exist when it launches)

- Unlimited ships with rollback
- Screenshot evidence and the second model review on top of the browser check
- Full receipt history (free keeps 7 days)
- More characters and skins, once the founder supplies the art
- Phone approvals, project shelf, timelapse, recaps: not built, not to be sold until they are

### Questions the founder must settle before any price is shown

1. Does a one time buyer get lessons and updates for life, or one year?
2. Student proof: how is a student verified, and who pays the fee?
3. Where is the merchant of record, and is the legal entity set up (legal checklist item 11: not done)?
4. Is the plan sign in route allowed? If yes, the same customer pays Anthropic a flat plan; the price message changes ("on top of a plan you already have").
5. A refund rule, in writing, on the website.

### What we must not say about price on the landing page

- No "free forever", no "lifetime", no number, until the founder fixes it.
- No "save $X vs HeyClicky" unless the HeyClicky price is rechecked that day.
- No claim that it "costs less than doing it yourself with Claude". It costs extra on top of Claude, and the honest line is that the customer pays Claude directly for what they use.
