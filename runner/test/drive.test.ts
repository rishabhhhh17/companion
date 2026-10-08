// Drive: plan first (read only), you approve, then one step at a time with a snapshot and a check per step.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parsePlan } from "../src/drive.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-dr-${l}-`))); made.push(d); return d; };
const say = (text: string, costUsd = 0.01): Step => ({ text, costUsd });
const write = (file_path: string, content: string, costUsd = 0.01): Step => ({ tool: { name: "Write", input: { file_path, content } }, costUsd });
const plan = (...steps: string[]) => say("Here is the plan:\n```json\n" + JSON.stringify(steps) + "\n```");
const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (detail = "broken"): LadderResult => { const s = { rung: "checks", label: "Building", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };

function setup(rounds: Step[][], proofs: LadderResult[] = [ok()]) {
  const project = tmp("p");
  writeFileSync(join(project, "notes.txt"), "start");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
  const plan = (budgetUsd = 5) => runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "d1", goal: "build a booking page", model: "m", budgetUsd });
  const approve = (steps: string[]) => runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps });
  return { project, events, engine, log, runner, plan, approve };
}
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const steps = (e: Event[]) => of(e, "drive.step").map((x) => `${x.index}:${x.status}`);

describe("reading the plan Claude wrote", () => {
  test("a list inside a code block", () => expect(parsePlan('Plan:\n```json\n["Make the page","Add a form"]\n```')).toEqual(["Make the page", "Add a form"]));
  test("a bare list in the middle of other words", () => expect(parsePlan('Sure! ["one", "two"] Does that work?')).toEqual(["one", "two"]));
  test("a numbered list is understood too", () => expect(parsePlan("1. Make the page\n2. Add a form\n3) Test it")).toEqual(["Make the page", "Add a form", "Test it"]));
  test("a bulleted list is understood too", () => expect(parsePlan("- Make the page\n* Add a form")).toEqual(["Make the page", "Add a form"]));
  test("nothing usable gives an empty plan", () => { expect(parsePlan("I am not sure what you want")).toEqual([]); expect(parsePlan("")).toEqual([]); });
  test("blank, duplicate-space and non text entries are cleaned up", () => expect(parsePlan('["  Make   the page ", "", 5, "Add a form"]')).toEqual(["Make the page", "Add a form"]));
});

describe("the planning phase", () => {
  test("it produces a plan for you to approve, and changes nothing", async () => {
    const r = setup([[plan("Make the page", "Add a form", "Test it")]]);
    await r.plan();
    const ev = of(r.events, "plan.ready")[0];
    expect(ev.steps.map((s: any) => s.title)).toEqual(["Make the page", "Add a form", "Test it"]);
    expect(ev.steps.map((s: any) => s.id)).toEqual([1, 2, 3]);
    expect(ev.truncated).toBe(false);
    expect(ev.estimateUsd).toBeGreaterThan(0);
    expect(readFileSync(join(r.project, "notes.txt"), "utf8")).toBe("start");
    expect(of(r.events, "receipt").length).toBe(0);
  });
  test("it can read but never write: a write attempt in the plan is refused in code", async () => {
    const r = setup([[write("sneaky.txt", "oops"), plan("Only step")]]);
    await r.plan();
    expect(existsSync(join(r.project, "sneaky.txt"))).toBe(false);
    expect(of(r.events, "agent.tool").some((t) => t.outcome === "blocked")).toBe(true);
    expect(of(r.events, "plan.ready").length).toBe(1);
  });
  test("a plan nobody could read is reported plainly, with no plan card", async () => {
    const r = setup([[say("I do not know")]]);
    await r.plan();
    expect(of(r.events, "plan.ready").length).toBe(0);
    expect(of(r.events, "protocol.error")[0].reason).toMatch(/usable plan/i);
  });
  test("a plan that is too long is sent back once, then cut to twelve and marked", async () => {
    const big = Array.from({ length: 15 }, (_, i) => `Step ${i + 1}`);
    const r = setup([[plan(...big)], [plan(...big)]]);
    await r.plan();
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].prompt).toMatch(/12/);
    const ev = of(r.events, "plan.ready")[0];
    expect(ev.steps.length).toBe(12);
    expect(ev.truncated).toBe(true);
  });
  test("a long plan that comes back short is accepted whole", async () => {
    const big = Array.from({ length: 15 }, (_, i) => `Step ${i + 1}`);
    const r = setup([[plan(...big)], [plan("Short one", "Short two")]]);
    await r.plan();
    const ev = of(r.events, "plan.ready")[0];
    expect(ev.steps.map((s: any) => s.title)).toEqual(["Short one", "Short two"]);
    expect(ev.truncated).toBe(false);
  });
});

describe("working through an approved plan", () => {
  test("each step runs in order with its own snapshot, check and cost, in the same conversation", async () => {
    const r = setup([[plan("Make the page", "Add a form")], [write("index.html", "<h1>hi</h1>")], [write("form.html", "<form></form>")]]);
    await r.plan();
    await r.approve(["Make the page", "Add a form"]);
    expect(steps(r.events)).toEqual(["1:started", "1:done", "2:started", "2:done"]);
    expect(of(r.events, "checkpoint.created").length).toBe(2);
    expect(of(r.events, "receipt").length).toBe(2);
    expect(r.engine.calls[1].prompt).toContain("Make the page");
    expect(r.engine.calls[1].prompt).toMatch(/step 1 of 2/i);
    expect(r.engine.calls[2].prompt).toContain("Add a form");
    expect(r.engine.calls[2].resumeSession).toBeTruthy();
    const done = of(r.events, "drive.done")[0];
    expect(done).toMatchObject({ status: "done", completed: 2, total: 2 });
  });
  test("you can change the plan before approving: the edited list is what runs", async () => {
    const r = setup([[plan("A", "B", "C")], [write("b.txt", "b")]]);
    await r.plan();
    await r.approve(["Only B, reworded"]);
    expect(steps(r.events)).toEqual(["1:started", "1:done"]);
    expect(r.engine.calls[1].prompt).toContain("Only B, reworded");
    expect(r.engine.calls[1].prompt).not.toContain("Step 1 of 3");
  });
  test("approving an empty plan, or with no plan waiting, is refused plainly", async () => {
    const r = setup([[plan("A")]]);
    await r.approve(["A"]);
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/no plan/i);
    await r.plan();
    await r.approve([]);
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/at least one step/i);
    expect(steps(r.events)).toEqual([]);
  });
  test("a plan can only be approved once", async () => {
    const r = setup([[plan("A")], [write("a.txt", "a")]]);
    await r.plan();
    await r.approve(["A"]);
    const before = r.engine.calls.length;
    await r.approve(["A"]);
    expect(r.engine.calls.length).toBe(before);
  });
  test("a step that fails its check stops the plan, with the evidence, and later steps never run", async () => {
    const r = setup([[plan("One", "Two", "Three")], [write("1.txt", "1")], [write("2.txt", "2")], [write("2.txt", "2")], [write("2.txt", "2")], [write("3.txt", "3")]], [ok(), bad("the build exploded")]);
    await r.plan();
    await r.approve(["One", "Two", "Three"]);
    expect(steps(r.events)).toContain("1:done");
    expect(steps(r.events)).toContain("2:not_done");
    expect(steps(r.events).some((s) => s.startsWith("3:"))).toBe(false);
    expect(existsSync(join(r.project, "3.txt"))).toBe(false);
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "not_done", completed: 1, total: 3 });
  });
  test("one budget covers the whole plan, not each step", async () => {
    const r = setup([[plan("One", "Two", "Three")], [write("1.txt", "1", 0.04)], [write("2.txt", "2", 0.04)], [write("3.txt", "3", 0.04)]]);
    await r.plan(0.1);
    await r.approve(["One", "Two", "Three"]);
    const done = of(r.events, "drive.done")[0];
    expect(done.status).toBe("error_max_budget_usd");
    expect(done.completed).toBeLessThan(3);
    expect(of(r.events, "receipt").at(-1).usdEstimate).toBeLessThanOrEqual(0.12);
  });
  test("the stop key ends the plan after the current step and never starts another", async () => {
    const r = setup([[plan("One", "Two")], [write("1.txt", "1"), { text: "slow", costUsd: 0, delayMs: 4000 }], [write("2.txt", "2")]]);
    await r.plan();
    const run = r.approve(["One", "Two"]);
    for (let i = 0; i < 300 && !steps(r.events).includes("1:started"); i++) await Bun.sleep(10);
    await Bun.sleep(100);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(steps(r.events).some((s) => s.startsWith("2:"))).toBe(false);
    expect(of(r.events, "drive.done")[0].status).toBe("interrupted");
  });
});

describe("a stop that lands between two steps", () => {
  test("is honoured: the next step never starts", async () => {
    const project = tmp("p");
    const events: Event[] = [];
    const engine = new ScriptedEngine([[plan("One", "Two")], [write("1.txt", "1")], [write("2.txt", "2")]]);
    let runner!: AgentRunner;
    runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), proof: async () => ok(),
      emit: (e) => { events.push(e); if (e.type === "drive.step" && (e as any).status === "done" && (e as any).index === 1) void runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" }); } });
    await runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "d1", goal: "g", model: "m", budgetUsd: 5 });
    await runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps: ["One", "Two"] });
    expect(steps(events)).toEqual(["1:started", "1:done"]);
    expect(existsSync(join(project, "2.txt"))).toBe(false);
    expect(of(events, "drive.done")[0]).toMatchObject({ status: "interrupted", completed: 1, total: 2 });
  });
});

describe("every step can be undone on its own", () => {
  test("restoring step 2's snapshot undoes step 2 and keeps step 1", async () => {
    const r = setup([[plan("One", "Two")], [write("one.txt", "1")], [write("two.txt", "2")]]);
    await r.plan();
    await r.approve(["One", "Two"]);
    const cps = of(r.events, "checkpoint.created").map((c) => c.checkpoint);
    expect(new Set(cps).size).toBe(2);
    await r.runner.handle({ v: 1, id: "u", type: "checkpoint.restore", project: r.project, checkpoint: cps[1] });
    expect(existsSync(join(r.project, "one.txt"))).toBe(true);
    expect(existsSync(join(r.project, "two.txt"))).toBe(false);
  });
});
