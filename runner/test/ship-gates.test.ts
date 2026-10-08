// The ship report: every gate with its status, and one clear answer to "may this go on the internet?"
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proofGate, runGates, type ProofRecord } from "../src/ship/gates.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l = "p") => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-sg-${l}-`))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };
const proofOk: ProofRecord = { verdict: "passed", unchangedSince: true };

describe("were the checks done on exactly this version?", () => {
  test("passed on the current version is ready", () => expect(proofGate(proofOk).status).toBe("passed"));
  test("no checks at all: blocked, and says to run them", () => {
    const g = proofGate(undefined);
    expect(g.status).toBe("blocked"); expect(g.detail).toMatch(/not been checked|no checks/i);
  });
  test("the project changed after the last check: blocked", () => {
    const g = proofGate({ verdict: "passed", unchangedSince: false });
    expect(g.status).toBe("blocked"); expect(g.detail).toMatch(/changed since/i);
  });
  test("a failed check: blocked", () => expect(proofGate({ verdict: "failed", unchangedSince: true }).status).toBe("blocked"));
  test("a cancelled check: blocked", () => expect(proofGate({ verdict: "cancelled", unchangedSince: true }).status).toBe("blocked"));
  test("checks that were not complete (a step was skipped) cannot be called a pass", () => {
    const g = proofGate({ verdict: "passed_with_gaps", unchangedSince: true });
    expect(g.status).toBe("could_not_check"); expect(g.overridable).toBe(false);
  });
  test("nothing to check: could not check, and you may confirm it yourself", () => {
    const g = proofGate({ verdict: "nothing_to_check", unchangedSince: true });
    expect(g.status).toBe("could_not_check"); expect(g.overridable).toBe(true);
  });
});

describe("the report", () => {
  const clean = () => { const d = tmp(); put(d, { "index.html": "<h1>hi</h1>" }); return d; };
  test("a clean project that passed its checks may ship", async () => {
    const r = await runGates({ project: clean(), proof: proofOk });
    expect(r.canShip).toBe(true);
    expect(r.gates.map((g) => g.id)).toEqual(["checked", "secrets", "database_access"]);
    expect(r.gates.map((g) => g.status)).toEqual(["passed", "passed", "not_applicable"]);
    expect(r.blockedBy).toEqual([]);
  });
  test("a leaked key blocks it and says which file", async () => {
    const d = clean(); put(d, { "src/pay.js": 'const k = "sk_live_abcdefghijklmnopqrstuvwxyz"' });
    const r = await runGates({ project: d, proof: proofOk });
    expect(r.canShip).toBe(false);
    expect(r.blockedBy).toEqual(["secrets"]);
    const g = r.gates.find((x) => x.id === "secrets")!;
    expect(g.status).toBe("blocked"); expect(g.detail).toContain("src/pay.js"); expect(g.findings?.length).toBe(1);
    expect(JSON.stringify(r)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
  test("a secret in the built site is called out as readable by every visitor", async () => {
    const d = clean(); put(d, { "dist/main.js": 'k="sk_live_abcdefghijklmnopqrstuvwxyz"' });
    const g = (await runGates({ project: d, proof: proofOk })).gates.find((x) => x.id === "secrets")!;
    expect(g.detail).toMatch(/anyone who opens your site/i);
  });
  test("an unprotected table blocks it", async () => {
    const d = clean(); put(d, { "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "2" } }), "supabase/migrations/1.sql": "create table orders (id int);" });
    const r = await runGates({ project: d, proof: proofOk });
    expect(r.canShip).toBe(false); expect(r.blockedBy).toEqual(["database_access"]);
  });
  test("a gate that could not run keeps it from shipping, and is listed as needing you", async () => {
    const d = clean(); put(d, { "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "2" } }), "supabase/migrations/1.sql": "create table notes (id int); alter table notes enable row level security;" });
    const r = await runGates({ project: d, proof: proofOk });
    expect(r.canShip).toBe(false);
    expect(r.needsYou).toEqual(["database_access"]);
    expect(r.blockedBy).toEqual([]);
  });
  test("you can confirm a gate that could not run, and then it may ship, with the confirmation on the record", async () => {
    const d = clean(); put(d, { "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "2" } }), "supabase/migrations/1.sql": "create table notes (id int); alter table notes enable row level security;" });
    const r = await runGates({ project: d, proof: proofOk, confirmed: ["database_access"] });
    expect(r.canShip).toBe(true);
    expect(r.confirmed).toEqual(["database_access"]);
    expect(r.gates.find((g) => g.id === "database_access")!.detail).toMatch(/you confirmed/i);
  });
  test("a blocked gate cannot be confirmed away", async () => {
    const d = clean(); put(d, { "src/pay.js": 'k="sk_live_abcdefghijklmnopqrstuvwxyz"' });
    const r = await runGates({ project: d, proof: proofOk, confirmed: ["secrets"] });
    expect(r.canShip).toBe(false);
  });
  test("checks that were incomplete cannot be confirmed away either", async () => {
    const r = await runGates({ project: clean(), proof: { verdict: "passed_with_gaps", unchangedSince: true }, confirmed: ["checked"] });
    expect(r.canShip).toBe(false);
  });
  test("one finding can be marked 'not a secret' and then stops blocking", async () => {
    const d = clean(); put(d, { "src/pay.js": 'const k = "sk_live_abcdefghijklmnopqrstuvwxyz"' });
    const first = await runGates({ project: d, proof: proofOk });
    const fp = first.gates.find((g) => g.id === "secrets")!.fingerprints![0];
    const again = await runGates({ project: d, proof: proofOk, allowSecrets: new Set([fp]) });
    expect(again.canShip).toBe(true);
    expect(again.allowedCount).toBe(1);
  });
  test("a gate that crashes counts as could not check, never as passed", async () => {
    const r = await runGates({ project: clean(), proof: proofOk, rlsQuery: undefined, overrideScan: () => { throw new Error("scanner exploded"); } });
    expect(r.gates.find((g) => g.id === "secrets")!.status).toBe("could_not_check");
    expect(r.canShip).toBe(false);
  });
});

describe("asking the runner", () => {
  const w = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.001 });
  function setup(script: Step[], verdict = "passed") {
    const project = tmp("r"); put(project, { "index.html": "<h1>hi</h1>" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([script]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: verdict as never, steps: [] }) });
    const task = () => runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    const check = () => runner.handle({ v: 1, id: "q", type: "ship.check", project } as never);
    const gates = () => (events.filter((e) => e.type === "ship.gates") as any[]).at(-1);
    return { project, events, task, check, gates };
  }
  test("after a task that passed its checks, a clean project may ship", async () => {
    const r = setup([w("about.html", "<p>about</p>")]);
    await r.task(); await r.check();
    expect(r.gates().canShip).toBe(true);
    expect(r.gates().gates.map((g: any) => g.id)).toEqual(["checked", "secrets", "database_access"]);
  });
  test("with no task ever run, the project has not been checked", async () => {
    const r = setup([]); await r.check();
    expect(r.gates().canShip).toBe(false);
    expect(r.gates().gates.find((g: any) => g.id === "checked").status).toBe("blocked");
  });
  test("a change after the last check blocks it until it is checked again", async () => {
    const r = setup([w("about.html", "<p>about</p>")]);
    await r.task();
    writeFileSync(join(r.project, "about.html"), "<p>edited by hand</p>");
    await r.check();
    expect(r.gates().canShip).toBe(false);
    expect(r.gates().gates.find((g: any) => g.id === "checked").detail).toMatch(/changed since/i);
  });
  test("a task whose checks failed does not make the project shippable", async () => {
    const r = setup([w("about.html", "<p>about</p>")], "failed");
    await r.task(); await r.check();
    expect(r.gates().canShip).toBe(false);
  });
  test("asking to run the checks now checks the project as it is, then it may ship", async () => {
    const calls: any[] = [];
    const project = tmp("rc"); put(project, { "index.html": "<h1>hi</h1>" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async (c: any) => { calls.push(c); return { verdict: "passed", steps: [] }; } });
    await runner.handle({ v: 1, id: "q", type: "ship.check", project, runChecks: true } as never);
    const g = (events.filter((e) => e.type === "ship.gates") as any[]).at(-1);
    expect(calls.length).toBe(1);
    expect(calls[0].beforeId).toBe(calls[0].afterId);
    expect(g.canShip).toBe(true);
  });
  test("it does not run the checks again when this exact version was already checked", async () => {
    const calls: any[] = [];
    const project = tmp("rc2"); put(project, { "index.html": "<h1>hi</h1>" });
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[]]), log: new TaskLog(":memory:"), emit: () => {}, proof: async (c: any) => { calls.push(c); return { verdict: "passed", steps: [] }; } });
    await runner.handle({ v: 1, id: "q", type: "ship.check", project, runChecks: true } as never);
    await runner.handle({ v: 1, id: "q2", type: "ship.check", project, runChecks: true } as never);
    expect(calls.length).toBe(1);
  });
  test("running the checks now on a project that fails them does not make it shippable", async () => {
    const project = tmp("rc3"); put(project, { "index.html": "<h1>hi</h1>" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "failed", steps: [] }) });
    await runner.handle({ v: 1, id: "q", type: "ship.check", project, runChecks: true } as never);
    expect((events.filter((e) => e.type === "ship.gates") as any[]).at(-1).canShip).toBe(false);
  });
  test("you can confirm a gate that could not run, through the command", async () => {
    const project = tmp("rc4"); put(project, { "index.html": "<h1>hi</h1>" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "nothing_to_check", steps: [] }) });
    await runner.handle({ v: 1, id: "q", type: "ship.check", project, runChecks: true } as never);
    expect((events.filter((e) => e.type === "ship.gates") as any[]).at(-1).canShip).toBe(false);
    await runner.handle({ v: 1, id: "q2", type: "ship.check", project, confirm: ["checked"] } as never);
    const g = (events.filter((e) => e.type === "ship.gates") as any[]).at(-1);
    expect(g.canShip).toBe(true); expect(g.confirmed).toEqual(["checked"]);
  });
  test("a leaked key blocks the ship, and the answer carries no secret", async () => {
    const r = setup([w("src/pay.js", 'const k = "sk_live_abcdefghijklmnopqrstuvwxyz"')]);
    await r.task(); await r.check();
    expect(r.gates().canShip).toBe(false);
    expect(JSON.stringify(r.events)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
