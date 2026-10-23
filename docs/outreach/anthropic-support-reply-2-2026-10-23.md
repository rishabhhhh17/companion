# Anthropic support, second reply (23 Oct 2026): the plain API is a standard setup

**Status:** a support email from "Ricardo from Anthropic", 7:45 PM on 23 Oct 2026, about 16 hours after the founder's follow up (`anthropic-support-reply-2026-10-23.md`). It answers **point 2 only** of the three. Save the email itself. It is written evidence, not a signed agreement.

## What it said (summary)
- Building a commercial product on the Messages API under your own organization's key, with that usage covered by a paid plan, is a standard setup.
- The server design described works: check the user's plan, enforce a daily cap, forward the request under your key, and record token counts only.
- Read before shipping: the Commercial Terms (they govern use of the API as a business customer), the Usage Policy (it applies to everything that goes through your key), and the Agent SDK overview.
- As the API customer you are responsible for Usage Policy compliance for everything your end users send through your key. A rate limit alone does not cover that. You need your own acceptable use terms for your users, and a process for handling abuse, including a way to identify and cut off offending accounts.

## What it settles, and what it does not
| Question from the follow up | Answer now |
|---|---|
| 2. Light features on the plain Messages API, paid by us in a plan | **Yes, a standard setup** (this email) |
| 1. Shipping the SDK's own unmodified binary inside the app | Not answered |
| 3. Who to talk to for an agreement to include Claude Code usage in paid plans | Not answered |

## Work this creates (nothing is switched on)
1. **Acceptable use terms for Squibby's users** (what people may not send through the app, what happens when they do). A draft for a lawyer to review; the founder's lawyer decides the final words.
2. **An abuse process:** how an offending account is found and cut off. The usage server already has per person tokens that can be revoked. The new part is the written steps, who looks, and how fast.
3. **An opaque user id on every forwarded request** (Anthropic's `metadata.user_id` field, a hash that is not an email or a name) so Anthropic can attribute abuse to one person and not to the whole key. Check `usage-proxy/src/filter.ts` and `proxy.ts`: today they must not drop or invent it.
4. **A go live checklist:** Dodo account and product, the webhook secret in the operator's environment, the plan limits, a higher Anthropic usage tier (the Start tier cap is $500 a month), the legal pages, and the order of rollout (a few friends first).
5. **The tension to design for:** the usage server keeps no prompts or replies (a privacy promise). Handling abuse therefore relies on Anthropic's notices and on the opaque user id, not on reading what people sent. Say that plainly in the terms.

## What the founder decides next
- **The fixing engine.** Our own loop on the plain API is now legally clean on this answer, but it is about 4 to 6 weeks of work. The alternative is to wait for the written agreement (point 3) and for the answer on bundling the binary (point 1). The recommendation on 23 Oct 2026 was to wait a few more days for those two answers, because point 1 also decides the installer.
