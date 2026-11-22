# M118: Whole-codebase blast-radius check

*Status: built and tested (23 Nov 2026). Inspired by the CodeRabbit/Greptile whole-codebase review workflow for both non engineers and engineers.*

## What it does

When an AI agent edits a file and changes an exported function's required parameter count or removes an export, `runner/src/blastradius.ts` scans the rest of the project locally (milliseconds, zero model calls, zero network) and flags every caller in other files that would break.

Example plain finding:
`Changing applyDiscount in billing/cart.ts may break api/refunds.ts (line 14) and jobs/renewals.ts (line 8), which still pass 1 argument instead of 2.`

## Safety and rules

- Never runs git in the user's repo (rule 10).
- Skips symlinks, `node_modules`, `.git`, `dist`, `build`, `target`, `.next`, and files larger than 256 KB.
- Never reads `.env` or secret files; redacts any secret-looking text before formatting output.
- Plain words, no em dashes.

## Tests

- `runner/test/m118-blast-radius.test.ts`: covers signature arity changes (the `applyDiscount` -> `api/refunds.ts` / `jobs/renewals.ts` case), optional/default parameter handling (no false positive when a new parameter is optional), removed exports, arrow function exports, ignored folders/symlinks, and plain-language formatting.
