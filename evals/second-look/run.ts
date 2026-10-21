// The Second Look eval (M14): 15 AI answers with one seeded mistake and 15 clean ones. DRY by default.
//   bun run evals/second-look/run.ts            dry, all 30 (the maths check is real; the model's look is a stand in)
//   bun run evals/second-look/run.ts --spend    the real fast lane, through the real run harness
import { COMMON_HELP, parseArgs } from "../lib/harness.ts";
import { isClean } from "../lib/results.ts";
import { explainFailure, runSet } from "../lib/runset.ts";
import { loadCases, runLookCase, SET_DIR } from "./pipeline.ts";
import { summarize, summaryLine } from "./score.ts";

try {
  const args = parseArgs(process.argv.slice(2), { perCaseUsd: 0.05, totalUsd: 1 });
  if (args.help) { console.log(`bun run evals/second-look/run.ts [options]${COMMON_HELP}`); process.exit(0); }
  const { results } = await runSet({
    set: "second-look", setDir: SET_DIR, cases: loadCases(), args, summarize, models: { fast: args.models.fast },
    run: (c, ctx) => runLookCase(c, { ...ctx, models: args.models }),
  });
  console.log(summaryLine(results.summary as ReturnType<typeof summarize>));
  if (!isClean(results)) process.exitCode = 1;
} catch (e) { explainFailure(e); }
