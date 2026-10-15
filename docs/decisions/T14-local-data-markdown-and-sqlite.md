# T14. Local data in markdown files and SQLite

- **Status:** Accepted from research; open items checked in M1. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 14; section 11 (also sections 3, 16, 18 and 19)
- **Related:** F05, T06, T10, T15

## Decision
Memory the user can read lives in plain markdown files. The task log, timeline, decisions, and loop and pattern candidates live in SQLite (`bun:sqlite` in the runner). Nothing is stored on Companion servers.

## Why
- Readable memory plus queryable history for Where was I, recaps, Loop Closer and Pattern Catcher (section 1, row 14).
- `AGENTS.md` is the cross vendor convention, read by Codex, Cursor, Copilot and others (section 11).
- Turning off Claude Code's auto memory means nothing is remembered where the user cannot see it (section 11).

## Alternatives considered
- A cloud database: privacy and cost (section 1, row 14).
- Memory synced to the cloud in v1: dropped; local only, opt in sync later (product_research.md section 11).
- Claude Code's auto memory: turned off with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (section 3; section 11).

## What this means for the build
Details are in technical_research.md section 11. Rules a coding agent must never miss:
- Files: `AGENTS.md` (shared by all agents), `CLAUDE.md` (first line `@AGENTS.md`), `.claude/launch.json`, `.companion/project.md`, `~/Library/Application Support/Companion/profile.md`, and `.companion/session.md`, which is cleared when the Drive run ends (section 11).
- Ask before creating `AGENTS.md` in a project that already has a team convention (section 11).
- Inject `profile.md` and `project.md` through `systemPrompt.append` for agent sessions and as a short context block for fast lane jobs (section 11). For fast lane jobs the block goes inside the user message, because a warm handle fixes the system prompt (T10).
- Project memory may come from the granted folder and agent runs, always visibly with its source. The profile learns only from explicit signals inside Companion. Never health, money, relationships or moods; never secrets or `.env` values. Add tests that such statements are not saved (section 11; section 19, pitfall 43).
- Every memory line has provenance plus Edit and Forget; also Pause, Erase all, an "off the record" switch, a ten second Undo toast (`memory.saved`), export, and a cap near 200 lines for `profile.md` (section 11).
- The SQLite task log sits in Application Support and holds tasks, timeline events (minus off the record content), decisions, house rules, approvals, Loop Closer items, Pattern Catcher candidates and saved tasks. Never synced in v1; the privacy page has "delete all" (section 11).
- M1 check: task log rows are written for every task (section 18). M8 checks the memory page: every line shows its source and can be forgotten, and off the record tasks write nothing (section 18).

## What the build settled (M8a, 9 Oct 2026)
- Project memory is `.companion/project.md` inside the project, and the profile is `profile.md` in Companion's data folder (mode 0600). Each line is `- text — source, date {id}`; a line typed by hand is read as "you wrote it" and kept when the file is rewritten.
- Every line passes a filter in code before it is written (health, money, relationships, moods, secrets, contact details); strict wins ties. A forgotten line is remembered only as an id, so it is not learned again.
- The founder chose (9 Oct 2026) to write the shared `AGENTS.md` and a `CLAUDE.md` that imports it. Project facts and house rules only, never the profile. A person's existing files are never changed without a yes, and then only one marked block is added or removed.
- Off the record tasks read and write no memory, and the task log and snapshot name hold only "Off the record task".

## What the build settled (config and safety pass, 16 Oct 2026)
- New stored data: `spending.json` in the runner's part of Companion's data folder (`runner/spending.json`, mode 0600). It holds one number, the daily spending limit the person chose in Settings (`{"dailyLimitUsd": 25}`), between 1 and 500 dollars. It is read at start; a missing, damaged or out of range file means the default of 10 dollars. Why: before this the limit could only be changed by an environment variable, so a person could not change it at all. It holds no spending history (that stays in `ledger.db`) and nothing about any task. Delete everything lists it under settings and removes it (`app/src-tauri/src/wipe.rs`). Code: `runner/src/spending.ts`.

## Open [verify] items
- None.

## Revisit if
Opt in memory sync is taken up, which the product doc places in a later release (product_research.md sections 3 and 11). Until then the task log and memory stay on the device.
