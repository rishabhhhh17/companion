// Runs the Prompt help cases and prints how many a good rewrite would satisfy.
//   bun run evals/prompt-help/run.ts outputs.json     scores saved outputs, free
//   bun run evals/prompt-help/run.ts --real           the plan for asking real Claude for every case: spends nothing
//   bun run evals/prompt-help/run.ts --real --spend   asks real Claude on the founder's API key (estimated about $0.08)
// A real run goes through the real run harness (runner/scripts/realrun-harness.ts): the bundled binary, the key read in
// code from the companion-dev Keychain item, a throwaway Claude Code folder, the system/init check and the spending stops.
// COMPANION_FAST_MODEL switches the model (for example claude-haiku-5-5).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AssistService, FastLane, ImageStore } from "../../runner/src/lanes.ts";
import { MODELS } from "../../runner/src/models.ts";
import { parseArgs, runCases } from "../../runner/scripts/realrun-harness.ts";
import { summarize, type Case } from "./score.ts";

const cases: Case[] = JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8"));
const arg = process.argv[2];
let outputs: Record<string, string> = {};

if (arg === "--real") {
  const args = parseArgs(process.argv.slice(3), ["--save"]);
  if ("error" in args) { console.error(args.error); process.exit(2); }
  const model = process.env.COMPANION_FAST_MODEL?.trim() || MODELS.fast;
  const code = await runCases("Prompt help eval", [{
    name: "prompt-help", what: `${cases.length} rough prompts rewritten on the fast lane`, models: [model], estimateUsd: 0.08, capUsd: 0.4, timeoutS: 900,
    async run(ctx) {
      const events: any[] = [];
      const fast = new FastLane({ claudeBinary: ctx.claudeBinary, env: ctx.env, model, queryFn: ctx.guard({ tools: [], model }) as never });
      const svc = new AssistService({ fast, vision: { locate: async () => ({ point: null, costUsd: 0 }) }, images: new ImageStore(), emit: (e) => events.push(e) });
      for (const c of cases) {
        if (ctx.signal.aborted) break;
        events.length = 0;
        await svc.handle({ v: 1, id: c.id, type: "assist.prompt", req: c.id, app: "eval", target: c.target, text: c.rough, style: "full", noQuestion: true } as never);
        const done = events.find((e) => e.type === "assist.prompt.done");
        outputs[c.id] = done?.text ?? "";
        process.stdout.write(done ? "." : "x");
      }
      console.log();
      return Object.keys(outputs).length === cases.length;
    },
  }], args, { totalUsd: 0.5, perCaseUsd: 0.4 });
  if (!args.spend || code === 2) process.exit(code);
  // --save keeps the rewrites, so they can be scored again for free: bun run evals/prompt-help/run.ts outputs.json
  if (args.flags.has("--save")) writeFileSync(join(import.meta.dir, "outputs.json"), JSON.stringify(outputs, null, 2));
} else if (arg) outputs = JSON.parse(readFileSync(arg, "utf8"));
else { console.error("Give a file of outputs, or --real (add --spend to spend)."); process.exit(2); }

const s = summarize(cases, outputs);
for (const r of s.rows.filter((r) => !r.pass)) console.log(`FAIL ${r.id}: ${r.problems.join(" ")}`);
console.log(`${s.passed} of ${s.total} passed (${Math.round(s.rate * 100)}%)`);
