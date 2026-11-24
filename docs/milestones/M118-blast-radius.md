# M118: Whole-codebase blast-radius check

*Status: built and tested (23 Nov 2026). Inspired by the CodeRabbit/Greptile whole-codebase review workflow for both non engineers and engineers.*

## What it does

When an AI agent edits a file and changes an exported function's required parameter count or removes an export, `runner/src/blastradius.ts` looks through the rest of the project locally (zero model calls, zero network) for other files that import that function from the changed file and still call it the old way. It is capped at 4,000 files and 2 seconds, yields while it reads, and ends at once on Stop (rule 11).

Corrected 24 Nov 2026 after a review found false stops. It reads names, not types, so its finding is `callers_may_break`, worth a look at most, never a stop, and `review.blastRadius` (on as usual, Settings, More) turns it off. A caller counts only when its own import or require names the changed module's path (relative paths, index files, extensions, `import * as`, `require`, `await import`); calls after a ".", method definitions, `declare function`, `.d.ts` files and comments are not callers; a function still exported another way (`export { f }`, `export { g as f }`, `export const f = function`, a re-export) is not removed; callers that are only tests are left out, and a test beside a real caller is labelled. Each file is read once for all the changed names.

Example plain finding:
`Changing applyDiscount in billing/cart.ts may break api/refunds.ts (line 14) and jobs/renewals.ts (line 8), which still pass 1 argument instead of 2.`

## Safety and rules

- Never runs git in the user's repo (rule 10).
- Skips symlinks, `node_modules`, `.git`, `dist`, `build`, `target`, `.next`, and files larger than 256 KB.
- Never reads `.env` or secret files; redacts any secret-looking text before formatting output.
- Plain words, no em dashes.

## Tests

- 24 Nov 2026: `runner/test/m118-blast-radius.test.ts` has a failing first test for each false positive the review named (a package or another module with the same name, `date-fns` `format`, member calls and `Map.get`, method definitions, `declare function`, `.d.ts`, comments, moved and re-exported functions, test only callers) and for true positives (index files, `.js` for `.ts`, aliases, `require`, namespaces, multi line calls, dynamic import), plus the abort signal, the file and time caps, and the kind never being a stop.

- `runner/test/m118-blast-radius.test.ts`: covers signature arity changes (the `applyDiscount` -> `api/refunds.ts` / `jobs/renewals.ts` case), optional/default parameter handling (no false positive when a new parameter is optional), removed exports, arrow function exports, ignored folders/symlinks, and plain-language formatting.
