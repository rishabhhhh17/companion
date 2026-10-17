// The loop breaker eval. DRY by default: the stand ins play a failing first approach, then the right one.
//   bun run evals/loop-breaker/run.ts               dry, all 5 cases
//   bun run evals/loop-breaker/run.ts --spend       real Claude (through the real run harness), Sonnet 5.5 by default
//   --on-stuck stop   press Stop here on the loop card instead of Try a different approach
import { COMMON_HELP, parseArgs } from "../lib/harness.ts";
import { isClean } from "../lib/results.ts";
import { explainFailure, runSet } from "../lib/runset.ts";
import { loadCases, runLoopCase, SET_DIR } from "./pipeline.ts";
import { summarize, summaryLine } from "./score.ts";

try {
  const args = parseArgs(process.argv.slice(2), { perCaseUsd: 1.5, totalUsd: 5 });
  if (args.help) { console.log(`bun run evals/loop-breaker/run.ts [options]${COMMON_HELP}\n  --on-stuck different|stop`); process.exit(0); }
  const onStuck = args.extra["on-stuck"] === "stop" ? "stop" : "different";
  const { results } = await runSet({
    set: "loop-breaker", setDir: SET_DIR, cases: loadCases(), args, summarize, models: { agent: args.models.agent },
    run: (c, ctx) => runLoopCase(c, { ...ctx, models: args.models, onStuck }),
  });
  console.log(summaryLine(results.summary as ReturnType<typeof summarize>));
  // A refusal or a spending stop took cases out of the rates: the run is not a clean result.
  if (!isClean(results)) process.exitCode = 1;
} catch (e) { explainFailure(e); }
