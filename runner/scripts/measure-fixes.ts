// M100: what a fix on Squibby's own loop costs, measured on 10 small fixture projects, each with one bug and a test that
// fails until it is fixed. The founder sets the fix allowance from these numbers ("measure, then decide", 15 Nov 2026).
//
//   bun run scripts/measure-fixes.ts
//       Free, the usual way: a stand in model on this Mac plays a short scripted fix for each project. It proves the
//       measuring works end to end (the real runner, the real safety box, Undo's snapshot, the project's own test as the
//       check). Its costs are the stand in's made up token counts priced at list price: NOT what a real fix costs.
//   bun run scripts/measure-fixes.ts --spend --base https://<the usage server>
//       Real fixes, paid by Squibby through its usage server, with the Squibby sign in token read from the Keychain in code
//       (never typed, never printed). Squibby's Anthropic key stays on the server. Each fix stops at the loop's own cap
//       (HARD_CAP_USD) and the whole run stops after MAX_TOTAL_USD. NOT YET RUN: nobody has spent anything on it.
//   --out costs.json   also save the costs, for usage-proxy/scripts/allowance.ts
//   --only add,clamp   only these projects
//
// Fixture folders are made in a fresh temporary folder and deleted at the end. Nothing is written anywhere else.
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { HARD_CAP_USD, MessagesLoopEngine } from "../src/engine/messages-loop/loop.ts";
import { boxedExecutor } from "../src/engine/messages-loop/executor.ts";
import { boxReady, nestedSandbox } from "../src/proof/box.ts";
import { runCommand } from "../src/proof/exec.ts";
import { DEFAULT_REF, resolveAuth } from "../src/keychain.ts";
import { MODELS } from "../src/models.ts";
import { PRODUCT, PRODUCT_S } from "../src/names.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";
import { PLANS, allowanceReport } from "../../usage-proxy/src/plans.ts";

/** The most a real run may spend on all ten together, whatever each fix's own cap leaves. */
export const MAX_TOTAL_USD = 15;
/** The budget for the next fix: the loop's cap, or what is left of the run's limit when that is less, so the run as a whole
 *  never passes MAX_TOTAL_USD. 0: too little is left, and no more fixes start. */
export function nextFixBudget(spent: number): number {
  const left = MAX_TOTAL_USD - spent;
  return left > 0.01 ? Math.min(HARD_CAP_USD, left) : 0;
}
/** What --out saves: the costs as usage-proxy/scripts/allowance.ts reads them (costsUsd), whether they are a stand in's made
 *  up numbers (standIn, which allowance.ts refuses), and each fix's own record. */
export function costsFile(fixes: Measured[], standIn: boolean): { standIn: boolean; costsUsd: number[]; fixes: Measured[] } {
  return { standIn, costsUsd: fixes.map((m) => m.costUsd), fixes };
}

// ---------- the ten projects ----------
/** One fixture: its source file, its test, the task said to the model, and the one change that fixes it (the stand in's). */
export type Fixture = { id: string; file: string; source: string; test: string; ask: string; from: string; to: string };
const t = (body: string) => `const f = require('./src/index.js');\n${body}\nconsole.log('ok');\n`;
const fail = (cond: string, msg: string) => `if (${cond}) { console.error(${JSON.stringify(msg)}); process.exit(1); }`;
export const FIXTURES: Fixture[] = [
  { id: "add", file: "src/index.js", source: "module.exports = (a, b) => a - b;\n", test: t(fail("f(2, 2) !== 4", "2 + 2 should be 4")), ask: "Adding two numbers gives the wrong answer. Fix it.", from: "a - b", to: "a + b" },
  { id: "sum-list", file: "src/index.js", source: "module.exports = (xs) => { let s = 0; for (let i = 1; i < xs.length; i++) s += xs[i]; return s; };\n", test: t(fail("f([1, 2, 3]) !== 6", "the total of 1, 2 and 3 should be 6")), ask: "The total of a list leaves out a number. Fix it.", from: "let i = 1", to: "let i = 0" },
  { id: "shout", file: "src/index.js", source: "module.exports = (s) => s.toLowerCase() + '!';\n", test: t(fail("f('hi') !== 'HI!'", "shout('hi') should be HI!")), ask: "Shouting a word should make it capitals with an exclamation mark. Fix it.", from: "toLowerCase", to: "toUpperCase" },
  { id: "greet", file: "src/index.js", source: "module.exports = (name) => { `Hello, ${name}`; };\n", test: t(fail("f('Sam') !== 'Hello, Sam'", "greet should say Hello, Sam")), ask: "The greeting comes back empty. Fix it.", from: "{ `Hello, ${name}`; }", to: "`Hello, ${name}`" },
  { id: "default-size", file: "src/index.js", source: "module.exports = (size = 0) => Array(size).fill('*').join('');\n", test: t(fail("f() !== '***'", "a bar with no size should have 3 stars")), ask: "A bar with no size given should have three stars. Fix it.", from: "size = 0", to: "size = 3" },
  { id: "divide", file: "src/index.js", source: "module.exports = (a, b) => b / a;\n", test: t(fail("f(10, 2) !== 5", "10 divided by 2 should be 5")), ask: "Dividing gives the wrong answer. Fix it.", from: "b / a", to: "a / b" },
  { id: "adult", file: "src/index.js", source: "module.exports = (age) => age > 18;\n", test: t(fail("f(18) !== true", "someone who is 18 is an adult")), ask: "Someone who is exactly 18 should count as an adult. Fix it.", from: "age > 18", to: "age >= 18" },
  { id: "total-price", file: "src/index.js", source: "module.exports = (item) => item.prise * item.qty;\n", test: t(fail("f({ price: 2, qty: 3 }) !== 6", "2 times 3 should be 6")), ask: "The total price comes out wrong. Fix it.", from: "item.prise", to: "item.price" },
  { id: "round", file: "src/index.js", source: "module.exports = (x) => Math.floor(x);\n", test: t(fail("f(2.6) !== 3", "2.6 should round to 3")), ask: "Rounding goes the wrong way. Fix it.", from: "Math.floor", to: "Math.round" },
  { id: "evens", file: "src/index.js", source: "module.exports = (xs) => xs.map((x) => x % 2 === 0);\n", test: t(fail("JSON.stringify(f([1, 2, 3, 4])) !== '[2,4]'", "the even numbers of 1 to 4 are 2 and 4")), ask: "Picking the even numbers gives true and false instead of the numbers. Fix it.", from: "xs.map", to: "xs.filter" },
];

/** Writes one fixture project into `root` and gives its folder. */
export function makeFixture(root: string, f: Fixture): string {
  const dir = join(root, f.id);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: f.id, private: true, scripts: { test: "node test.js" } }, null, 2));
  writeFileSync(join(dir, f.file), f.source);
  writeFileSync(join(dir, "test.js"), f.test);
  return dir;
}

// ---------- the stand in model ----------
/** A local stand in for the usage server: for each project, read the file, make the fix, run the test, say what changed.
 *  Its token counts are made up from the request's size; they are not a real model's. */
export function standInServer(fixtures: Fixture[]): { url: string; stop: () => void } {
  const byAsk = new Map(fixtures.map((f) => [f.ask, f]));
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(req) {
      const raw = await req.text();
      const body = JSON.parse(raw);
      const first = body.messages[0];
      const f = byAsk.get(typeof first.content === "string" ? first.content : "");
      const step = body.messages.filter((m: { role: string }) => m.role === "assistant").length;
      const use = (name: string, input: Record<string, unknown>) => ({ type: "tool_use", id: `tu_${step}`, name, input });
      const content = !f ? [{ type: "text", text: "I do not know this project." }]
        : step === 0 ? [{ type: "text", text: "Let me read the code." }, use("Read", { file_path: f.file })]
        : step === 1 ? [use("Edit", { file_path: f.file, old_string: f.from, new_string: f.to })]
        : step === 2 ? [use("Bash", { command: "npm test" })]
        : [{ type: "text", text: `I changed ${f.from} to ${f.to} in ${f.file}, and the test passes now.` }];
      const usage = { input_tokens: Math.ceil(raw.length / 4), output_tokens: 120 + 40 * step };
      return Response.json({ id: `msg_${step}`, type: "message", role: "assistant", model: body.model, content, stop_reason: content.some((c) => c.type === "tool_use") ? "tool_use" : "end_turn", usage });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

// ---------- one fix, through the real runner ----------
export type Measured = { id: string; proven: boolean; costUsd: number; requests: number; ended: string };
/** The check: the project's own test, in the safety box. Only it says "Proven". */
async function ownTest(project: string, signal: AbortSignal): Promise<LadderResult> {
  const r = await runCommand("npm test --silent", { cwd: project, timeoutMs: 60_000, box: { project, net: "local" }, signal });
  const step = { rung: "tests", label: "Tests", status: r.code === 0 ? "passed" : "failed", detail: r.code === 0 ? "" : (r.stderr || r.stdout).slice(-300), ms: r.ms };
  return r.code === 0 ? { verdict: "passed", steps: [step] as never } : { verdict: "failed", steps: [step] as never, failedAt: step as never };
}
export async function measureOne(f: Fixture, root: string, o: { base: string; token: string; model: string; fetchFn?: typeof fetch; budgetUsd?: number }): Promise<Measured> {
  const project = makeFixture(root, f);
  let requests = 0;
  const counted = (async (url: RequestInfo | URL, init?: RequestInit) => { requests++; return (o.fetchFn ?? fetch)(url, init); }) as typeof fetch;
  const engine = new MessagesLoopEngine({ auth: async () => ({ token: o.token, base: o.base }), fetchFn: counted, executor: boxedExecutor() });
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: join(root, `.shadow-${f.id}`), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 1, proof: (ctx) => ownTest(ctx.project, ctx.signal) });
  await runner.handle({ v: 1, id: f.id, type: "agent.start", project, agent: "measure", mode: "drive", prompt: f.ask, model: o.model, budgetUsd: Math.min(HARD_CAP_USD, o.budgetUsd ?? HARD_CAP_USD) } as never);
  const receipt = events.find((e) => e.type === "receipt") as { proof?: string; usdEstimate?: number; ended?: string } | undefined;
  return { id: f.id, proven: receipt?.proof === "passed", costUsd: Number(receipt?.usdEstimate ?? 0), requests, ended: receipt?.ended ?? "none" };
}

// ---------- the program ----------
const usd = (n: number) => `$${n.toFixed(4)}`;
async function main() {
  const args = process.argv.slice(2);
  const spend = args.includes("--spend");
  const at = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const only = at("--only")?.split(",");
  const fixtures = FIXTURES.filter((f) => !only || only.includes(f.id));
  if (!boxReady() || (await nestedSandbox())) { console.error("The safety box for commands cannot be made here (not a Mac, or started inside another app's sandbox). Run this from Terminal on a Mac."); process.exit(1); }
  let base: string, token: string, stop = () => {};
  if (spend) {
    const b = at("--base");
    if (!b || !/^https:\/\/[^/]+\/?$/.test(b)) { console.error("A real run needs the usage server's address: --base https://<server>. Nothing was spent."); process.exit(1); }
    const a = await resolveAuth(DEFAULT_REF);
    if (a.method !== "api_key" || !/^cmp_[A-Za-z0-9_-]{20,}$/.test(a.apiKey ?? "")) { console.error(`No ${PRODUCT_S} sign in token was found in the Keychain. Sign in to ${PRODUCT} first. Nothing was spent.`); process.exit(1); }
    base = b.replace(/\/+$/, ""); token = a.apiKey!;
    console.log(`A real run: up to ${fixtures.length} fixes, each stopped at $${HARD_CAP_USD}, all together stopped at $${MAX_TOTAL_USD}. ${PRODUCT} pays, through the usage server.`);
  } else {
    const s = standInServer(fixtures);
    base = s.url; token = "cmp_" + "standin".repeat(4); stop = s.stop;
    console.log("A free run on a stand in model. The costs below are made up from the stand in's token counts: they are NOT real fix costs.");
  }
  const root = realpathSync(mkdtempSync(join(tmpdir(), "squibby-measure-")));
  const out: Measured[] = [];
  try {
    for (const f of fixtures) {
      // Each fix gets only what is left of the run's limit, so the run never passes it (a fix may spend all it is given).
      const budgetUsd = nextFixBudget(out.reduce((s, m) => s + m.costUsd, 0));
      if (budgetUsd <= 0) { console.log(`Stopped: the run reached $${MAX_TOTAL_USD}.`); break; }
      const m = await measureOne(f, root, { base, token, model: at("--model") ?? MODELS.agent, budgetUsd });
      out.push(m);
      console.log(`${m.id.padEnd(13)} ${m.proven ? "proven    " : "not proven"} ${usd(m.costUsd)}  ${m.requests} requests  (${m.ended})`);
    }
  } finally { stop(); rmSync(root, { recursive: true, force: true }); }
  const costs = out.map((m) => m.costUsd);
  console.log(`\n${out.filter((m) => m.proven).length} of ${out.length} proven. All together ${usd(costs.reduce((a, b) => a + b, 0))}.`);
  for (const plan of Object.values(PLANS)) { const r = allowanceReport(plan, costs); if (r) { console.log(""); for (const l of r.lines) console.log(l); } }
  if (!spend) console.log("\n(Stand in numbers. Run again with --spend --base https://<server> for real ones.)");
  const file = at("--out");
  if (file) { writeFileSync(file, JSON.stringify(costsFile(out, !spend), null, 2)); console.log(`Saved to ${file}.`); }
}
if (import.meta.main) await main();
