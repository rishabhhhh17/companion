# F14. Every user gets the browser check

- **Status:** Fixed. Founder decision; do not reopen without the founder.
- **Date:** 2026-10-07
- **Source:** the founder's reply to M0 plan decision 4 (`docs/milestones/M0-spikes.md`), 7 Oct 2026
- **Related:** F03, T07

## Decision
Every user, Free or Plus, gets proof ladder rungs 1 to 5: install, build and lint, tests, the dev server, and a real browser smoke check. Plus adds rungs 6 and 7: screenshot evidence and the second model review. "Done" means the same thing on every plan.

## Why
- The rule that never bends says "done" means proven: exit codes first, browser checks second (AGENTS.md rule 14). The earlier pricing hypothesis gave Free only build and tests, which would have let Free users see "done" with no browser check.
- False "done" is a high impact risk (product_research.md section 19), and Free users judge the product by it.
- Proof runs on the user's own Claude and machine, so the browser check costs Companion nothing.

## What this means for the build
- The `entitlements` helper never gates rungs 1 to 5. It gates only rungs 6 and 7 (docs/architecture.md).
- The pricing table in product_research.md section 15 says so.

## What it rules out
- A Free result called "done" after build and tests alone.
- Labelling Free results "built and tested, not checked in a browser" as a plan difference.

## Revisit only if
The founder decides to.
