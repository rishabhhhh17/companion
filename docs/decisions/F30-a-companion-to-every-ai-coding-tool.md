# F30. A companion to every AI coding tool, for everyone ("CodeRabbit for everyone")

- **Status:** Founder decision, 1 Nov 2026.
- **Related:** F06 (Geeked path parked; partly unparked here), F14 (browser check for everyone), F16 (rescue is the launch hero), F29 (Squibby pays and picks the model), T06 (shadow snapshots), T07 (proof ladder). Plan: `docs/milestones/M52-review-every-change.md`.

## Decision
The founder (1 Nov 2026), condensed:
- "I want to be CodeRabbit, but I want to be CodeRabbit for everyone."
- "It is a companion to your things."
- "If you have this, you don't need to have CodeRabbit unless you're a very professional developer."
- He also asked whether Squibby works when someone uses Codex, or Claude Code in the Claude desktop app, VS Code or Antigravity, and wanted that to be the use case.

What this means: Squibby sits next to whatever AI tool a person builds with, and keeps their project working and safe. It looks at every change that tool makes, says in plain words what changed and what it touches, rates it, proves the project still works, and fixes or hands the fix back.

## Why
- **Retention.** The founder's worry is that beginners alone will not retain. A tool you open only when stuck is forgotten; a companion that checks every change your AI makes is used every day.
- **The research already pointed here.** The parked Geeked path's wedge was "a cross vendor proof and review queue" (product_research.md, section on the Geeked path). This decision brings that wedge to everyone, not only engineers.
- **CodeRabbit (checked 1 Nov 2026)** reviews pull requests for engineering teams on GitHub and GitLab, priced per developer seat. Nobody does the same for people who do not use pull requests.

## What it changes
- **Positioning.** Not only "rescue for beginners". It is "the second pair of eyes for anything AI builds for you". F16's rescue stays as the first thing a new person sees.
- **F06.** The cross vendor review and proof queue comes out of parking, for everyone. Watching another agent's live session through its hooks stays a later step, done only with the person's yes.
- **New on the product map:**
  - A review of every change: what changed, what it touches, a rating (safe, worth a look, stop) and a security look.
  - Proof by running the project.
  - A one tap fix with undo, or hand the review back to the coding tool.
  - The person's house rules applied.
- **Rules that hold:**
  - Only the folder the person granted is looked at, never the screen (rules 5 and 6).
  - Squibby never writes the person's git (rule 10).
  - Nothing goes live without a tap (rule 13).
  - No streaks or guilt (rule 16).

## Revisit only if
Real use shows people want Squibby only when stuck, or the cost of reviewing every change cannot fit the plans.
