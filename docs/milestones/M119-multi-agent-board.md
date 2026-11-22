# M119: Cross-repo shared context board and multi-agent attention state

*Status: built and tested (23 Nov 2026). Inspired by the cmux multi-agent attention ring and Linear MCP cross-repo shared context workflow.*

## What it does

1. **Cross-repo shared context board (`runner/src/sharedboard.ts`):**
   - Stores active tasks and shared decisions across linked repos (for example `web`, `api`, `ios`, `infra`) in Squibby's own data folder (never touching any repo's `.git`, rule 10).
   - Redacts any secret-looking string before saving or formatting (rule 15).
   - `formatBoardForStart(board, repo)` renders a compact, plain-words context block (at most 20 lines) that any AI tool session can read at startup without configuring Linear or MCP.
2. **Multi-agent attention state (`runner/src/attention.ts`):**
   - Tracks active sessions across multiple repos, worktrees, and AI tools (`claude`, `codex`, `cursor`, `copilot`, `gemini`, `windsurf`, `antigravity`).
   - Computes which sessions need an attention ring (`needs_approval`, `blocked`, `finished_with_issues`) and sorts them by urgency so the notch can highlight exactly which agent is waiting on the person.

## Tests

- `runner/test/m119-multi-agent-board.test.ts`: covers cross-repo CRUD, atomic persistence, secret redaction, 20-line start block cap, attention ring detection, and urgency ordering.
