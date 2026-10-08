# M7: Ship and safety gates. Plan for approval

**Status:** approved by the founder on 9 Oct 2026, with the recommended split (M7a the safety gates now, M7b preview, live and rollback after). **M7a built and checked on the real runner (9 Oct 2026):** the secret scan (including keys that every visitor can read, with Supabase anon keys and Stripe publishable keys correctly allowed), the Supabase row level security check from migration files and from a live database query, and the ship report that blocks on a leaked key, an unprotected table, a project that changed since it was checked, or a gate that could not run. **Left for M7b:** the Vercel preview, "Make it live", rollback and ship receipts. **Written:** 9 Oct 2026. **Source:** technical doc section 9 (Ship), the pre ship gates in section 8, the M7 row in section 18, product doc section 3 (Ship); decisions F13 (undo never touches your git), F14 and T07 (proof), rule 13 (never send, pay, delete or go live without a tap). Decisions behind it: F15 (agents first and best).

## Where Build mode stands

| Part of "Do the work" | State |
|---|---|
| Drive (plan, approve, step by step, snapshot and check per step) | Built and merged. Seen working with real Claude only as far as the plan card |
| Rescue (diagnose a stuck project, finish plan) | Built and merged, scripted tests only |
| Research (cited notes, safe web only) | Built and merged, scripted tests only |
| Proof ladder, rungs 1 to 5, fix loop, "Not done" | Built, merged and tried with real Claude |
| Second model review (rung 7) | Built and merged, off until switched on, scripted tests only |
| Undo, receipts, house rules, fix loop breaker, take the wheel, daily limit | Built and merged |
| **Ship** (safety gates, preview, "Make it live", rollback) | **Not built. This is M7** |
| Plan decisions saved to memory | Waits for the memory milestone |
| Screenshot evidence on the receipt (rung 6) | Not built. A Plus feature, not needed to finish Build mode |

So Ship is the one real piece of Build mode left.

## What M7 is

When the work is done and proven, Companion helps you put it on the internet **without the usual disasters**. First it checks the project for the mistakes beginners ship most (a secret key visible to every visitor, a database anyone can read). Then it puts up a **preview** link, opens it in the hidden browser to check it works, and only then offers **Make it live**, which is an approval you give once and which names exactly what goes live. A rollback is one click.

## What gets built, in two parts

**M7a, the safety gates (about 4 to 5 working days, no accounts, no spending):**
1. **Secret scan.** Looks at what you are about to publish (the changed files and the built website files) for keys, tokens and passwords, including the ones that end up readable in the browser (`NEXT_PUBLIC_` style names). A hit **blocks** shipping and says in plain words which file and what to do. Built as our own scanner, tested on seeded leaks, rather than adding a new tool now; gitleaks can be added later.
2. **Database access check.** If the project uses Supabase, check that every table that the public API can reach has row level security on, and block shipping if one does not. The checking logic is tested with fake database answers; the real check runs against your project when you connect it.
3. **A gate report** on the card: each gate passed, blocked or could not run, with the plain reason. "Could not run" never counts as a pass.
4. **Ship readiness rule:** nothing ships unless the proof ladder passed on the exact snapshot being shipped (so a change after the check means checking again).

**M7b, preview, live and rollback (about 4 to 5 working days, then a short session with you):**
1. **Deploy through your own account, with your own login.** Vercel first, because its command line tool is already on your Mac and its preview links are free; Cloudflare second. Companion never stores a deploy token except in the Keychain, and prefers driving the vendor's own login.
2. **Preview first, always.** The preview link is opened in the hidden browser and checked the same way as the proof ladder.
3. **"Make it live":** one approval card, tied to the exact snapshot and preview that passed, says it cannot be undone by Undo (it is on the internet) and says how to roll back. Never automatic, never silent.
4. **Rollback in one click** to the previous live version.
5. **Receipts for ships:** what went live, when, which snapshot, which gates passed.

## How we will know it worked

Automatic, written first:
- a seeded `NEXT_PUBLIC_` secret in a source file, in a built file, and in a changed `.env` each block shipping;
- a seeded table without row level security blocks shipping; a table with it passes; no Supabase means that gate says "not applicable", not "passed";
- a gate that cannot run (offline, no connection) is shown as "could not check" and does not let "Make it live" through;
- shipping is refused if the proof ladder has not passed on the same snapshot, or the project changed after it;
- with a fake deploy tool: the preview is checked before "Make it live" is even offered, "Make it live" is impossible without a tap, rollback restores the previous version, and an agent can never run the deploy command itself without the approval card;
- no token or key appears in any log, event or receipt.

Then a real try with you on a throwaway project and your own Vercel login, with a deliberately leaked fake key to see it blocked.

## What I need from you

1. **Approve this plan** (the split is my recommendation).
2. For M7b only: a free Vercel account logged in on this Mac (the `vercel` tool is already installed) and a throwaway project to ship. Nothing to buy. I will ask again before anything goes onto the internet.

## Risks and plan B

- **Hosting rules differ.** Vercel's free plan is for personal, non commercial use, so the card says so for business users. Cloudflare is the fallback for commercial sites.
- **The vendor's login works differently than expected.** Plan B is a pasted, narrowly scoped token kept only in the Keychain.
- **Secret scanners have false alarms.** A blocked ship shows exactly what matched, and you can mark one finding as "not a secret" for that project, recorded in the receipt.

## Approval

Say **approved** (or **approved, all in one**), and I'll start with the tests for the secret scan.
