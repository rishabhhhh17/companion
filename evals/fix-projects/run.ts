// The fix eval. DRY by default: the known good fixes run through the whole pipeline and nothing is spent.
//   bun run evals/fix-projects/run.ts                         dry, all 25 cases
//   bun run evals/fix-projects/run.ts --spend                 real Claude (through the real run harness), Sonnet 5.5 by default
//   bun run evals/fix-projects/run.ts --spend --hard --agent-model claude-opus-5-5 --per-case 1.25
//   --flow rescue    the app's own Fix it with me path: Rescue's diagnosis, then every step of its plan
//   --split train    only the train cases (or test), for prompt work
//   --hard           only the 12 hard cases
//   --on-stuck stop  press Stop here on the loop card instead of Try a different approach
//   --review         also run the second model review on risky changes
import { COMMON_HELP, parseArgs } from "../lib/harness.ts";
import { isClean } from "../lib/results.ts";
import { explainFailure, runSet } from "../lib/runset.ts";
import { loadCases, runFixCase, SET_DIR, type Flow } from "./pipeline.ts";
import { summarize, summaryLine } from "./score.ts";

try {
  const args = parseArgs(process.argv.slice(2), { perCaseUsd: 0.75, totalUsd: 8 });
  if (args.help) { console.log(`bun run evals/fix-projects/run.ts [options]${COMMON_HELP}\n  --flow task|rescue, --split train|test, --hard, --on-stuck different|stop, --review`); process.exit(0); }
  const flow = (args.extra.flow ?? "task") as Flow;
  if (flow !== "task" && flow !== "rescue") throw new Error("--flow is task or rescue");
  const onStuck = args.extra["on-stuck"] === "stop" ? "stop" : "different";
  let cases = loadCases();
  if (args.extra.split) cases = cases.filter((c) => c.split === args.extra.split);
  if ("hard" in args.extra) cases = cases.filter((c) => c.hard);
  const { results } = await runSet({
    set: "fix-projects", setDir: SET_DIR, cases, args, summarize, models: { ...args.models },
    run: (c, ctx) => runFixCase(c, { ...ctx, models: args.models, flow, onStuck, review: "review" in args.extra }),
  });
  console.log(summaryLine(results.summary as ReturnType<typeof summarize>));
  // A refusal or a spending stop took cases out of the rates: the run is not a clean result.
  if (!isClean(results)) process.exitCode = 1;
} catch (e) { explainFailure(e); }
