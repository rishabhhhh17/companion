# F03. Agents from day one

- **Status:** Fixed. Founder decision; do not reopen without the founder.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 3
- **Related:** F07, F10, T02, T05, T06, T07

## Decision
Companion ships with agents that do the work from the first release. It is not a suggestion tool that slowly earns autonomy.

## Why
- The promise is "you finish what you start": projects get built, checked and shipped with proof (product_research.md section 1).
- Models now handle short, verifiable tasks. Long autonomous runs are still unreliable: the best model completes 20.6% of OSWorld 2.0's long tasks (product_research.md section 14). So agents work in short steps, each one proven.
- Instructions are not controls. Replit's agent deleted a production database during a code freeze despite instructions (product_research.md section 6).

## What this means for the build
- The private alpha includes Drive, Rescue, Research, proof, undo, receipts, house rules, and Ship with safety gate, preview and live (product_research.md section 18).
- Drive breaks a request into short steps, shows the plan for approval, runs each step through Claude Code via the Agent SDK, snapshots, proves, and continues unless a stop condition hits (product_research.md section 6).
- Stop conditions: three failed fixes on the same error, a step over its time or cost budget, a change outside the step's files, or anything on the always ask list (product_research.md section 6).
- Agents from day one still means asking first before destructive commands, anything outside the project folder, every live deploy, and anything sent to another person (product_research.md section 4, manners 6).
- The trust core comes before features: safety in `PreToolUse` hooks and deny rules (T05), shadow snapshots (T06), the proof ladder (T07). M1 to M3 come first because every feature shares them (technical_research.md section 18).
- Permission modes: `plan` for planning, `acceptEdits` with the macOS sandbox for steps, never `bypassPermissions` (technical_research.md section 3).
- Take the wheel: the agent pauses within about a second when the user brings the project's editor or terminal to the front or edits a project file (product_research.md section 6).

## What it rules out
- Section 11 row: "Next Move" suggestion cards with Send, Edit, Skip through a wrapper command, earning autonomy slowly. Replaced by Drive mode agents from day one, plus Prompt help for when the user prompts their own tools.
- An alpha that only suggests and leaves every step for the user to run.

## Revisit only if
The founder decides to.
