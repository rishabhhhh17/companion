# M3: Proof before "done". Plan for approval

**Status:** built and tried for real on 9 Oct 2026. The real run with the founder found three holes, all fixed: the browser check did not press buttons, a task could pass by turning the build into an `echo`, and the character said "Something went wrong" for a failed check. Left: merge the branch, then rungs 6 and 7 move to M4. **Written:** 8 Oct 2026. **Source:** technical doc section 7, the M3 row in section 18, decision T07 (the proof ladder) and F14 (every user gets the browser check), product doc section 6. Decisions behind it: F14, T07, T05, T06.

## What M3 is

Today, when Claude says it finished, Companion believes it. M3 stops that. After a task changes files, Companion **checks the work itself** before it lets the character say "Done". "Done" has to mean something, because a false "done" is the biggest way this product can lose a user's trust.

You'll see it in the card: after Claude stops, the character switches to **Checking**, and the card shows each check as it passes or fails. If one fails, the failure goes back to Claude to fix (up to two tries, inside the spending limit). If it still fails, the card says **Not done** and says why, in plain words. It never says Done when a check failed.

## The ladder (rungs 1 to 5, for every user, free or paid)

| Rung | In plain words | Passes when |
|---|---|---|
| 1. Install | If the project's list of ingredients changed, install them | The install finishes without error |
| 2. Build | Run the project's build, type check and lint, whichever exist | Each one finishes without error |
| 3. Tests | Run the project's tests | They pass, and **there are not fewer tests than before** (a task that deleted or switched off tests to make them pass is flagged) |
| 4. Start | Start the project's own server, on a free port | It answers within about a minute |
| 5. Browser check | Open the page in a hidden browser and click through the part that changed | The page loads, there are no errors in its console, no failed requests, the expected words are there, and the one flow clicks through |

Rungs 6 (a screenshot shown as evidence) and 7 (a second model reviews the change) come in M4, with Drive, where they have a card to live in. A screenshot is only ever evidence on the receipt, never the thing that decides pass or fail, because a picture can look fine while a button does nothing.

## What gets built

1. **The ladder runner:** works out what the project has (scripts in its package file, a start command in `.claude/launch.json`, or a plain static page), runs each rung, and times it out sensibly.
2. **The browser check:** a hidden browser (Playwright's own, never your Chrome), downloaded the first time it's needed. It only ever looks at the app being built, never your screen.
3. **The retry loop:** a failure goes back to Claude with the evidence (the error text, not a guess); two tries at most.
4. **Receipts that include proof:** the receipt says which rungs passed, which failed and why, and flags removed or skipped tests. The receipt's file list must match the snapshot's list exactly.
5. **The card and character:** the Checking state, a checklist of rungs, and the plain-words **Not done** with the reason.
6. **A basic timeline:** a list of past tasks per project (from the task log we already keep) so a receipt can be found again.

## How we'll know it worked

Automatic checks, run after every change:
- every piece of the ladder has tests written first (project detection, running a command with a timeout, comparing test counts, parsing console errors);
- **seeded broken projects** that must never reach "Done" while a rung fails:
  1. a plain web page with an error in its code, which only the browser check catches;
  2. a small Vite app whose build fails;
  3. a small server (Express) that returns an error on its main route;
  4. a project where the task deleted a test to make things pass, which must be flagged;
- and the opposite: the same projects, fixed, **must pass** (so we know the checks aren't just always saying no);
- the receipt's changed files equal the snapshot's changed files exactly;
- a server started by an earlier task is never mistaken for the new one.

A Next.js app and a Supabase app are in the technical plan's list of seeded projects. They need much bigger downloads and an account, so I'd add them later, when Drive needs them.

Then a short real run with you: ask Claude for a small page, watch the Checking step, and see one deliberately broken request end in **Not done**.

## What I need from you

1. **Approve this plan,** including leaving rungs 6 and 7 for M4 and two of the five seeded projects for later.
2. **Approve downloads.** All free, none needs your password or an account:
   - Playwright and its hidden browser: roughly 150 to 300 MB, downloaded once into a private folder. I'll measure the real size and tell you.
   - A few small test packages (Vite, Express and Playwright) used only by the seeded test projects, about 50 MB.
3. Nothing else. The tests start small servers on your own Mac, reachable only from your Mac (localhost), and stop them when done.

## Time

About **6 to 8 working days**, mostly on my own. You're needed for the approvals and one short try-out at the end.

## Risks and plan B

- **Projects vary a lot.** A project with no scripts and no start command can still be checked as a static page; if even that isn't possible, the receipt says "could not be checked" instead of pretending, and the character never shows Done.
- **The hidden browser download is slow or blocked.** The ladder still runs rungs 1 to 4 and says plainly that the browser check was skipped.
- **A check is flaky.** We rerun a failing rung once before sending it back to Claude, so a hiccup doesn't waste a retry.

## Approval

Say **approved**, and I'll start with the tests for project detection and the ladder runner.
