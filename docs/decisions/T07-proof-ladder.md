# T07. Proof: exit codes first, eyes last

- **Status:** Accepted from research; open items checked in M3. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 7; section 7 (also section 18 M3 and M4, section 19 pitfalls 21 to 23); product_research.md sections 6, 15, 17 and 19
- **Related:** T05, T06, T08, T10

## Decision
"Done" means proven. After each turn that changed files, the runner climbs a proof ladder: exit code gates, then the dev server from `.claude/launch.json` with `autoPort`, then a Playwright smoke check, then a vision judgment shown only as evidence, then a second model review of the diff.

## Why
- It mirrors Claude Code Desktop's auto verify, which starts dev servers, screenshots, inspects the DOM and fixes what it finds (section 7).
- A vision judge can approve a page with dead buttons. Exit codes and a Playwright click through decide (pitfall 21).
- Agents edit or skip tests to pass. Diffing test files and counts against the checkpoint catches it (pitfall 22).
- False "done" is a high impact risk (product_research.md section 19).

## Alternatives considered
- A vision judge as pass or fail: rejected; screenshots are evidence only (section 1, row 7).

## Founder decision (7 Oct 2026, F14)
Every user, Free or Plus, gets rungs 1 to 5, including the real browser check, so "done" means the same thing on every plan. Plus adds rungs 6 and 7 (screenshot evidence and the second model review). The pricing table in product_research.md section 15 now says so.

## What this means for the build
Pass signals and timeouts per rung are in technical_research.md section 7.
- Rung 1: install if the lockfile changed, with the lockfile's manager.
- Rung 2: build, typecheck and lint exit 0 per script present (`CI=1`, 5 minute timeout).
- Rung 3: tests exit 0 and the count is not lower than at the checkpoint. Fail if the step edited, deleted or skipped tests (`.skip`, `.only`).
- Rung 4: the dev server answers within 60 s. Never attach to a server started before the step (pitfall 23).
- Rung 5: Playwright smoke: the page loads, no console errors, no failed requests, expected text present, one click through of the changed flow.
- Rung 6: a vision verdict with a screenshot, on the receipt only, never the pass signal.
- Rung 7: a separate read only review session (Opus 5.5 by default) reads the request and the diff, not the author's transcript, and can approve, comment or send back.
- On failure, send the evidence back into the same session, up to two retries within budget, then stop with "not done". The character goes to `error`, never `done`.
- Use Playwright's bundled Chromium, downloaded on first proof, never the user's real Chrome. Proof screenshots show the app under build, never the user's screen.
- M3 builds rungs 1 to 5, the retry loop, receipts and the timeline; rung 7 lands in M4. Rung 6 has no milestone in technical doc section 18 yet; the M3 plan assigns it. M3 passes when five seeded broken projects (Vite, Next.js, static HTML, Express API, Supabase app) never reach `done` while a rung fails, a deleted test is flagged, and the receipt diff matches the snapshot diff exactly.

## Open [verify] items
- None marked [verify]. The Chromium download size was not found in sources; measure it in M3, when Playwright is first downloaded (section 7).

## Revisit if
The false "done" rate does not stay near zero, its target in product_research.md section 17.
