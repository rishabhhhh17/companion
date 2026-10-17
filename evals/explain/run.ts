// The Explain eval: 24 real changes (the fix cases' known good fixes), scored on RUBRIC.md. DRY by default.
//   bun run evals/explain/run.ts                       dry: reference explanations and a stand in grader
//   bun run evals/explain/run.ts --spend               the fast lane (Haiku 4.5 by default) and a grader model (Sonnet 5.5)
//   bun run evals/explain/run.ts --spend --fast-model claude-haiku-5-5
import { COMMON_HELP, parseArgs } from "../lib/harness.ts";
import { isClean } from "../lib/results.ts";
import { explainFailure, runSet } from "../lib/runset.ts";
import { loadCases, runExplainCase, SET_DIR } from "./pipeline.ts";
import { summarize, summaryLine } from "./score.ts";

try {
  const args = parseArgs(process.argv.slice(2), { perCaseUsd: 0.05, totalUsd: 1 });
  if (args.help) { console.log(`bun run evals/explain/run.ts [options]${COMMON_HELP}`); process.exit(0); }
  const { results } = await runSet({
    set: "explain", setDir: SET_DIR, cases: loadCases(), args, summarize, models: { fast: args.models.fast, grader: args.models.grader },
    run: (c, ctx) => runExplainCase(c, { ...ctx, models: args.models }),
  });
  console.log(summaryLine(results.summary as ReturnType<typeof summarize>));
  // A refusal or a spending stop took cases out of the rates: the run is not a clean result.
  if (!isClean(results)) process.exitCode = 1;
} catch (e) { explainFailure(e); }
