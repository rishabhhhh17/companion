// Bug bash (m67): the Fix it flow end to end with the stand in model (ScriptedEngine), the real proof ladder, temporary
// fixture folders only. Prints what the person would see.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { fixFoundPrompt } from "../src/fixfound.ts";
import type { Event } from "../../protocol/index.ts";
// Loaded by path (M67), so the runner's type check does not take in the page's files (model.ts reaches icons.tsx).
const MODEL = "../../app/src/model.ts", ISLAND = "../../app/src/islandPanel.ts", APPROVALS = "../../app/src/approvals.ts";
const { initial, reduce, receiptVerdict, characterWords } = await import(MODEL) as Record<string, (...a: any[]) => any>;
const { islandJobs } = await import(ISLAND) as Record<string, (...a: any[]) => any>;
const { approvalWords } = await import(APPROVALS) as Record<string, (...a: any[]) => any>;

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `bugbash-${l}-`))); made.push(d); return d; };
const write = (file: string, content: string): Step => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });
const waitFor = async (cond: () => boolean, ms = 60000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 20)); } };

function setup(script: Step[] | Step[][], files: Record<string, string>) {
  const project = tmp("proj");
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(project, p, ".."), { recursive: true }); writeFileSync(join(project, p), c); }
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine(script), log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 20000 });
  return { project, events, runner };
}
const start = (project: string, prompt: string) => ({ v: 1 as const, id: "c1", type: "agent.start" as const, project, agent: "builder-1", mode: "drive" as const, prompt, model: "claude-sonnet-5-5", budgetUsd: 3 });

test("a fix that changes the test script: the card the person sees for running it", async () => {
  const pkg = (t: string) => JSON.stringify({ name: "x", scripts: { test: t } });
  const r = setup([write("package.json", pkg("node t.js && echo ok")), write("t.js", "process.exit(0)")], { "package.json": pkg("node t.js"), "t.js": "process.exit(1)" });
  const run = r.runner.handle(start(r.project, fixFoundPrompt({ label: "test", detail: "test failed" })));
  await waitFor(() => r.events.some((e) => e.type === "approval.request" || e.type === "receipt"));
  const ap = r.events.find((e) => e.type === "approval.request") as any;
  if (ap) {
    let m = initial();
    for (const e of r.events) m = reduce(m, e as never);
    console.log("CARD EVENT:", JSON.stringify({ risk: ap.risk, title: ap.title, action: ap.action, undoable: ap.undoable }));
    console.log("CARD WORDS:", JSON.stringify(approvalWords(ap, r.project)));
    console.log("NOTCH:", JSON.stringify(islandJobs(m).filter((j: { approval?: unknown }) => j.approval)));
    await r.runner.handle({ v: 1, id: "c2", type: "approval.resolve", approval: ap.approval, decision: "deny", scope: "once" } as never);
  }
  await run;
  const rc = r.events.find((e) => e.type === "receipt") as any;
  console.log("RECEIPT:", JSON.stringify({ ended: rc.ended, proof: rc.proof, endedWhy: rc.endedWhy }));
}, 120000);

const pageOf = (events: Event[]) => { let m = initial(); for (const e of events) m = reduce(m, e as never); return m; };
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0.01 });

test("Stop mid task, then Undo: files come back, the history says undone", async () => {
  const r = setup([write("a.txt", "agent 1"), { delayMs: 5000, text: "still going", costUsd: 0.01 }, write("b.txt", "agent 2")], { "a.txt": "orig" });
  const run = r.runner.handle(start(r.project, "Fix it"));
  await waitFor(() => existsSync(join(r.project, "a.txt")) && readFileSync(join(r.project, "a.txt"), "utf8") === "agent 1");
  await r.runner.handle({ v: 1, id: "s", type: "agent.interrupt", agent: "builder-1" } as never);
  await run;
  const rc = r.events.find((e) => e.type === "receipt") as any;
  const cp = (r.events.find((e) => e.type === "checkpoint.created") as any).checkpoint;
  console.log("STOP RECEIPT:", JSON.stringify({ ended: rc.ended, proof: rc.proof, changed: rc.changed }));
  console.log("STOP PAGE:", JSON.stringify(receiptVerdict(pageOf(r.events))));
  // The person edits a file of their own after the stop, then presses Undo.
  writeFileSync(join(r.project, "mine.txt"), "my note");
  await r.runner.handle({ v: 1, id: "u", type: "checkpoint.restore", project: r.project, checkpoint: cp } as never);
  const rs = r.events.find((e) => e.type === "checkpoint.restored") as any;
  const err = r.events.filter((e) => e.type === "protocol.error").map((e: any) => e.reason);
  console.log("RESTORED:", JSON.stringify(rs), "ERRORS:", JSON.stringify(err));
  console.log("FILES:", readFileSync(join(r.project, "a.txt"), "utf8"), existsSync(join(r.project, "b.txt")), existsSync(join(r.project, "mine.txt")));
  console.log("UNDO PAGE:", JSON.stringify(receiptVerdict(pageOf(r.events))));
  expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("orig");
}, 60000);

test("a fix that never proves: the same failing test three times", async () => {
  const pkg = JSON.stringify({ name: "x", scripts: { test: "node t.js" } });
  const r = setup([[write("src.js", "v1")], [write("src.js", "v2")], [write("src.js", "v3")], [write("src.js", "v4")]], { "package.json": pkg, "t.js": "console.error('AssertionError: expected 2 got 3'); process.exit(1)", "src.js": "v0" });
  const run = r.runner.handle(start(r.project, fixFoundPrompt({ label: "test", detail: "AssertionError" })));
  await waitFor(() => r.events.some((e) => e.type === "loop.stuck" || e.type === "receipt" || (e.type as string).includes("stuck")), 90000);
  console.log("TYPES:", JSON.stringify([...new Set(r.events.map((e) => e.type))]));
  const stuck = r.events.find((e) => (e.type as string).includes("stuck")) as any;
  if (stuck) { console.log("STUCK:", JSON.stringify(stuck)); await r.runner.handle({ v: 1, id: "l", type: "loop.choose", agent: "builder-1", choice: "stop" } as never); }
  await run;
  const rc = r.events.find((e) => e.type === "receipt") as any;
  console.log("NOPROVE RECEIPT:", JSON.stringify({ ended: rc.ended, proof: rc.proof, endedWhy: rc.endedWhy, changed: rc.changed.length }));
  const m = pageOf(r.events);
  console.log("NOPROVE PAGE:", JSON.stringify(receiptVerdict(m)), characterWords(m));
}, 120000);

test("a sign in wall in the browser check during a fix", async () => {
  const srv = `bun -e "Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT),fetch:()=>new Response('<h1>Please sign in</h1>',{status:401,headers:{'content-type':'text/html'}})})"`;
  const pkg = JSON.stringify({ name: "x", scripts: { start: srv } });
  const engine = new ScriptedEngine([[write("app.txt", "v1")], [write("app.txt", "v2")], [write("app.txt", "v3")]]);
  const project = tmp("proj");
  writeFileSync(join(project, "package.json"), pkg); writeFileSync(join(project, "app.txt"), "v0");
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 20000 });
  const run = runner.handle(start(project, "Make the home page say hello"));
  await waitFor(() => events.some((e) => e.type === "loop.stuck" || e.type === "receipt"), 150000);
  if (events.some((e) => e.type === "loop.stuck")) await runner.handle({ v: 1, id: "l", type: "loop.choose", agent: "builder-1", choice: "stop" } as never);
  await run;
  const results = events.filter((e) => e.type === "proof.result").map((e: any) => ({ verdict: e.verdict, failed: e.steps.find((s: any) => s.status === "failed")?.detail }));
  console.log("SIGNIN RESULTS:", JSON.stringify(results));
  console.log("SIGNIN ENGINE ROUNDS:", engine.calls.length, JSON.stringify(engine.calls.slice(1).map((c) => c.prompt.slice(0, 200))));
  const rc = events.find((e) => e.type === "receipt") as any;
  console.log("SIGNIN RECEIPT:", JSON.stringify({ ended: rc.ended, proof: rc.proof }), "STUCK:", events.some((e) => e.type === "loop.stuck"));
}, 180000);
