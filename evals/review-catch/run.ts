// The second model review eval: 5 risky diffs and 5 harmless controls. DRY by default (a stand in answers each case's label).
//   bun run evals/review-catch/run.ts               dry, all 10
//   bun run evals/review-catch/run.ts --spend       the real reviewer (needs the real run harness), Opus 5.5 by default
import { COMMON_HELP, parseArgs } from "../lib/harness.ts";
import { explainFailure, runSet } from "../lib/runset.ts";
import { loadCases, runReviewCase, SET_DIR } from "./pipeline.ts";
import { summarize, summaryLine } from "./score.ts";

try {
  const args = parseArgs(process.argv.slice(2), { perCaseUsd: 0.2, totalUsd: 1.5 });
  if (args.help) { console.log(`bun run evals/review-catch/run.ts [options]${COMMON_HELP}`); process.exit(0); }
  const { results } = await runSet({
    set: "review-catch", setDir: SET_DIR, cases: loadCases(), args, summarize, models: { review: args.models.review },
    run: (c, ctx) => runReviewCase(c, { ...ctx, models: args.models }),
  });
  console.log(summaryLine(results.summary as ReturnType<typeof summarize>));
} catch (e) { explainFailure(e); }
