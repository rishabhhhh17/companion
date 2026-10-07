# F08. Build first; later modes gated on retention

- **Status:** Fixed. Founder decision; do not reopen without the founder.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 8
- **Related:** F03, F06, F07, T07, T14

## Decision
Build mode comes first. Learn, Work and Team follow in that order, and each one starts only after the previous release retains users.

## Why
- AI subscription apps retain worse than non AI apps: annual retention of 21.1% against 30.7% (RevenueCat via TechCrunch; product_research.md section 17).
- "Doing many things at 60%" is a high likelihood, high impact risk. Sliced releases and gated modes are the answer (product_research.md sections 3, 19).
- If Build earns retention through verified ships and the hotkey helpers earn a daily habit, every later mode inherits a trusted companion. If not, no number of features will rescue it (product_research.md Conclusion).

## What this means for the build
- The north star is verified ships per week, with "things finished" per active user as the supporting measure (product_research.md section 1).
- The habit metrics show whether a release retains: active 3 or more days a week in week 4, a second project shipped within 14 days, with an early target of flat retention above zero across three cohorts (product_research.md section 17).
- v1.1 (M12) also waits until the beta retains (product_research.md section 18; technical_research.md section 18).
- Learn, then Work, then Team run from 2027 onward, each behind its gate (product_research.md section 18).
- The foundation must let these modes land without a rewrite, so build nothing for them now but block nothing (product_research.md header and section 3).
- What each later mode adds: Learn brings Tutor, a mentor seat, a class dashboard and a Campus plan; Work brings Analyst and meeting notes to actions; Team brings Supervisor, policies and spend controls (product_research.md section 3).
- Closer, Watcher, Analyst and Supervisor get new character shapes only when their modes arrive (product_research.md section 3).
- Pricing follows the gates: Team (about $20 per seat a month) only after teams ask; Campus is Later (product_research.md section 15).

## What it rules out
- Building Tutor, Analyst, Supervisor or team features during the alpha or beta.
- Starting Learn, Work or Team before the previous release retains.
- Team pricing before teams ask for it.

## Revisit only if
The founder decides to. Passing a retention gate starts the next mode; it does not change this order.
