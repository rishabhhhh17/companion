// Runs the Prompt help cases and prints how many a good rewrite would satisfy.
//   bun run evals/prompt-help/run.ts outputs.json     scores saved outputs, free
//   bun run evals/prompt-help/run.ts --real           asks real Claude for every case: uses a little of the plan, so it only runs when asked
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AssistService, ImageStore } from "../../runner/src/lanes.ts";
import { createLanes, readSettings } from "../../runner/src/engines.ts";
import { summarize, type Case } from "./score.ts";

const cases: Case[] = JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8"));
const arg = process.argv[2];
let outputs: Record<string, string> = {};

if (arg === "--real") {
  const events: any[] = [];
  const lanes = createLanes(readSettings(process.env));
  const svc = new AssistService({ ...lanes, images: new ImageStore(), emit: (e) => events.push(e) });
  for (const c of cases) {
    events.length = 0;
    await svc.handle({ v: 1, id: c.id, type: "assist.prompt", req: c.id, app: "eval", target: c.target, text: c.rough, style: "full", noQuestion: true } as never);
    const done = events.find((e) => e.type === "assist.prompt.done");
    outputs[c.id] = done?.text ?? "";
    process.stdout.write(done ? "." : "x");
  }
  console.log();
} else if (arg) outputs = JSON.parse(readFileSync(arg, "utf8"));
else { console.error("Give a file of outputs, or --real."); process.exit(2); }

const s = summarize(cases, outputs);
for (const r of s.rows.filter((r) => !r.pass)) console.log(`FAIL ${r.id}: ${r.problems.join(" ")}`);
console.log(`${s.passed} of ${s.total} passed (${Math.round(s.rate * 100)}%)`);
