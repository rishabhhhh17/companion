// The daily ceiling: the runner keeps its own count of what each project spent today, and stops new work at the limit.
import { afterEach, describe, expect, test } from "bun:test";
// Must fix 29: an engine that does not run tools itself is given the test tool runner by the test, never by default.
import { testToolRunner } from "../src/engine.ts";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../src/ledger.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-lg-${l}-`))); made.push(d); return d; };
const at = (iso: string) => () => new Date(iso);

describe("the ledger", () => {
  test("adds up what a project spent today", () => {
    const l = new Ledger(":memory:", at("2026-10-09T10:00:00"));
    l.add("/a", 0.5); l.add("/a", 0.25);
    expect(l.spentToday("/a")).toBeCloseTo(0.75, 6);
  });
  test("projects are counted separately", () => {
    const l = new Ledger(":memory:", at("2026-10-09T10:00:00"));
    l.add("/a", 1);
    expect(l.spentToday("/b")).toBe(0);
  });
  test("a new day starts from zero", () => {
    const path = join(tmp("db"), "l.db");
    new Ledger(path, at("2026-10-09T23:59:00")).add("/a", 3);
    const next = new Ledger(path, at("2026-10-10T00:01:00"));
    expect(next.spentToday("/a")).toBe(0);
  });
  test("it remembers across restarts", () => {
    const path = join(tmp("db"), "l.db");
    new Ledger(path, at("2026-10-09T10:00:00")).add("/a", 2);
    expect(new Ledger(path, at("2026-10-09T18:00:00")).spentToday("/a")).toBeCloseTo(2, 6);
  });
  test("negative or broken amounts are ignored", () => {
    const l = new Ledger(":memory:", at("2026-10-09T10:00:00"));
    l.add("/a", -5); l.add("/a", NaN);
    expect(l.spentToday("/a")).toBe(0);
  });
});

describe("the ceiling in the runner", () => {
  const say = (costUsd: number): Step => ({ text: "ok", costUsd });
  const write = (f: string, costUsd: number): Step => ({ tool: { name: "Write", input: { file_path: f, content: "x" } }, costUsd });
  function setup(rounds: Step[][], ceiling: number, ledger = new Ledger(":memory:")) {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    const engine = new ScriptedEngine(rounds);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, dailyCeilingUsd: ceiling, proof: async () => ({ verdict: "passed", steps: [] }) });
    const start = (budgetUsd = 3) => runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd });
    return { project, events, engine, runner, ledger, start };
  }
  const errors = (e: Event[]) => e.filter((x) => x.type === "protocol.error").map((x: any) => x.reason);

  test("what a task spends is added to today's total", async () => {
    const r = setup([[write("n.txt", 0.04)]], 10);
    await r.start();
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.04, 6);
  });
  test("at the ceiling, a new task does not start, and says why in plain words", async () => {
    const r = setup([[say(0.01)]], 1);
    r.ledger.add(r.project, 1);
    await r.start();
    expect(r.engine.calls.length).toBe(0);
    expect(errors(r.events)[0]).toMatch(/daily limit/i);
    expect(r.events.some((e) => e.type === "checkpoint.created")).toBe(false);
  });
  test("a task near the ceiling gets only what is left, not its full budget", async () => {
    const r = setup([[say(0.01)]], 1);
    r.ledger.add(r.project, 0.9);
    await r.start(3);
    expect(r.engine.calls[0].budgetUsd).toBeCloseTo(0.1, 6);
  });
  test("a task that runs into the ceiling stops there", async () => {
    const r = setup([[write("a.txt", 0.06), write("b.txt", 0.06)]], 1);
    r.ledger.add(r.project, 0.9);
    await r.start(3);
    expect(r.events.some((e) => e.type === "protocol.error" && /error_max_budget_usd|daily limit/i.test((e as any).reason))).toBe(true);
    expect(r.ledger.spentToday(r.project)).toBeLessThanOrEqual(1.07);
  });
  test("another project is not affected", async () => {
    const r = setup([[say(0.01)]], 1);
    r.ledger.add("/some/other/project", 5);
    await r.start();
    expect(r.engine.calls.length).toBe(1);
  });
  test("a plan stops starting new steps once the ceiling is reached", async () => {
    const plan: Step = { text: '```json\n["One","Two","Three"]\n```', costUsd: 0.01 };
    const r = setup([[plan], [write("1.txt", 0.3)], [write("2.txt", 0.3)], [write("3.txt", 0.3)]], 0.7);
    await Bun.sleep(100);
    await Bun.sleep(100);
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "d", goal: "g", model: "m", budgetUsd: 5 });
    await r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d", steps: ["One", "Two", "Three"] });
    const done = r.events.find((e) => e.type === "drive.done") as any;
    expect(done.completed).toBeLessThan(3);
    expect(done.status).toMatch(/daily_limit|error_max_budget_usd/);
    // A single turn cannot be cut short by the scripted engine; the real engine enforces the remaining budget.
    expect(r.ledger.spentToday(r.project)).toBeLessThanOrEqual(0.95);
  });
  test("planning counts toward the ceiling too", async () => {
    const r = setup([[{ text: '["One"]', costUsd: 0.2 }]], 10);
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "d", goal: "g", model: "m", budgetUsd: 5 });
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.2, 6);
  });
  test("planning is refused at the ceiling", async () => {
    const r = setup([[{ text: '["One"]', costUsd: 0.2 }]], 1);
    r.ledger.add(r.project, 1);
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "d", goal: "g", model: "m", budgetUsd: 5 });
    expect(r.engine.calls.length).toBe(0);
    expect(errors(r.events)[0]).toMatch(/daily limit/i);
  });
});

describe("spending counts as it happens, not only when a job ends", () => {
  const w = (f: string, costUsd: number, delayMs?: number): Step => ({ tool: { name: "Write", input: { file_path: f, content: "x" } }, costUsd, ...(delayMs ? { delayMs } : {}) });
  test("during a task, what it has spent so far is already in the ledger", async () => {
    const project = tmp("live"); writeFileSync(join(project, "a.txt"), "x");
    const ledger = new Ledger(":memory:");
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[w("a.txt", 0.05), { text: "later", costUsd: 0.01, delayMs: 1500 }]]), log: new TaskLog(":memory:"), emit: () => {}, ledger, dailyCeilingUsd: 10, proof: async () => ({ verdict: "passed", steps: [] }) });
    const run = runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    await Bun.sleep(600);
    expect(ledger.spentToday(project)).toBeCloseTo(0.05, 6);
    await run;
    expect(ledger.spentToday(project)).toBeCloseTo(0.06, 6);
  });
  test("a plan's cost is in the ledger the moment the plan card appears, so the next job already sees it", async () => {
    const project = tmp("plan"); writeFileSync(join(project, "a.txt"), "x");
    const ledger = new Ledger(":memory:");
    let seenAtPlan = -1;
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[{ text: '["One"]', costUsd: 0.2 }]]), log: new TaskLog(":memory:"), emit: (e) => { if (e.type === "plan.ready") seenAtPlan = ledger.spentToday(project); }, ledger, dailyCeilingUsd: 10 });
    await Bun.sleep(100);
    await runner.handle({ v: 1, id: "p", type: "drive.plan", project, agent: "d", goal: "g", model: "m", budgetUsd: 5 });
    expect(seenAtPlan).toBeCloseTo(0.2, 6);
  });
  test("each cost is counted once, not twice", async () => {
    const project = tmp("once"); writeFileSync(join(project, "a.txt"), "x");
    const ledger = new Ledger(":memory:");
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[w("a.txt", 0.03), w("b.txt", 0.04)]]), log: new TaskLog(":memory:"), emit: () => {}, ledger, dailyCeilingUsd: 10, proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    expect(ledger.spentToday(project)).toBeCloseTo(0.07, 6);
  });
});

import { EngineStop, type Engine } from "../src/engine.ts";
describe("the cost of a run that stopped on its limit is still counted", () => {
  const stopping = (cost: number): Engine => ({ async *start() { throw new EngineStop("error_max_budget_usd: the run stopped", cost); } });
  test("a plan that hit its budget leaves its cost in the ledger", async () => {
    const project = tmp("stopcost"); const ledger = new Ledger(":memory:");
    const runner = new AgentRunner({ executor: testToolRunner, shadowRoot: tmp("s"), engine: stopping(0.04), log: new TaskLog(":memory:"), emit: () => {}, ledger, dailyCeilingUsd: 10 });
    await Bun.sleep(50);
    await runner.handle({ v: 1, id: "p", type: "drive.plan", project, agent: "d", goal: "g", model: "m", budgetUsd: 5 });
    expect(ledger.spentToday(project)).toBeCloseTo(0.04, 6);
  });
  test("so do a diagnosis and a research", async () => {
    const project = tmp("stopcost2"); const ledger = new Ledger(":memory:");
    const runner = new AgentRunner({ executor: testToolRunner, shadowRoot: tmp("s"), engine: stopping(0.03), log: new TaskLog(":memory:"), emit: () => {}, ledger, dailyCeilingUsd: 10, proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project, agent: "r", model: "m", budgetUsd: 5 });
    await runner.handle({ v: 1, id: "q", type: "research.ask", project, agent: "x", question: "q?", model: "m", budgetUsd: 5 });
    expect(ledger.spentToday(project)).toBeCloseTo(0.06, 6);
  });
  test("a task that hit its budget counts too", async () => {
    const project = tmp("stopcost3"); writeFileSync(join(project, "a.txt"), "x"); const ledger = new Ledger(":memory:");
    const runner = new AgentRunner({ executor: testToolRunner, shadowRoot: tmp("s"), engine: stopping(0.05), log: new TaskLog(":memory:"), emit: () => {}, ledger, dailyCeilingUsd: 10 });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    expect(ledger.spentToday(project)).toBeCloseTo(0.05, 6);
  });
});
