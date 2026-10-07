# F06. Two paths in one app; Geeked is parked

- **Status:** Fixed. Founder decision; do not reopen without the founder.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 6
- **Related:** F07, F08, F12, T02, T07

## Decision
One app holds two paths: Curious (for non engineers) and Geeked (the Pro path, for engineers). Geeked is parked. When it resumes it gets about a fifth of total effort.

## Why
- The earlier research verdict on Geeked: it is real but modest, worth about a fifth of total effort (product_research.md section 21).
- Its wedge when it resumes is a cross vendor proof and review queue, then a quota guard. The dock and approval inbox are free table stakes (product_research.md section 21).
- Solo founder bandwidth is a high likelihood, high impact risk, so slices stay strict (product_research.md section 19).

## What this means for the build
- Build nothing Geeked specific now, and block nothing for it (product_research.md section 21).
- Every protocol event can carry a `vendor` tag and an external session id (technical_research.md section 21).
- The proof ladder takes a folder and a "done" signal, without caring which engine produced it (technical_research.md section 21; T07).
- Engines stay thin adapters behind one `Engine` interface, so safety, checkpoints, proof, receipts and approvals live in the runner core (technical_research.md section 3; T02).
- Together these let a hooks based observer be added later without a rewrite (product_research.md section 21).
- "Curious" and "Geeked" are working names that will change (product_research.md header; F12).
- The full Geeked research lives outside this repo, in "Pro mode for engineers" (product_research.md section 21).

## What it rules out
- Any Geeked feature work during the Curious build: observing the user's own Claude Code, Codex and Cursor through their hooks, the cross vendor proof queue, collision warnings, the quota guard (technical_research.md section 21).
- Designs that would block Geeked later, such as a protocol with no vendor tag or proof tied to how an agent was started.
- When Geeked resumes: memory sync and pull request babysitting stay skipped (product_research.md section 21).

## Revisit only if
The founder decides to resume Geeked. The effort share of about a fifth is part of this decision.
