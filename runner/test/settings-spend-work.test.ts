// Area 1 of the settings plan (docs/milestones/M11-customize-plan.md): spending and how work runs, on the engine's side.
// Each setting arrives through settings.apply (RunnerSettings, T16) and is read when a task, a plan, a request or a
// question starts. Every test here runs on stand ins: the scripted engine, fake checks, a fake SDK query on the plan route
// (no Keychain), temporary folders. No Claude runs, nothing reaches the network.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step, type ToolResult } from "../src/engine.ts";
import { createLanes, quickModelOf, readSettings } from "../src/engines.ts";
import { estimateUsd as planEstimate } from "../src/drive.ts";
import { Ledger } from "../src/ledger.ts";
import { canonicalModel, KNOWN_MODELS, listPrice, MODEL_CHOICES, MODELS, modelForChoice, offeredChoices, SMOKE_PASSED } from "../src/models.ts";
import { RunnerSettings } from "../src/settings.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";
import { defOf } from "../../protocol/settings.ts";

// Each task here takes real snapshots of a temporary folder; a busy Mac can take a few seconds over a Drive plan.
setDefaultTimeout(30_000);
const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-a1-${l}-`))); made.push(d); return d; };
const apply = (values: Record<string, unknown>) => ({ v: 1 as const, id: "s", type: "settings.apply" as const, values });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 5000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error("timed out waiting"); await Bun.sleep(10); } };
const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
const writes = (n: number) => Array.from({ length: n }, (_, i) => [write("a.txt", String(i + 1))]);
const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (detail: string): LadderResult => { const s = { rung: "tests", label: "Running the tests", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const planText = (...s: string[]): Step => ({ text: "```json\n" + JSON.stringify(s) + "\n```", costUsd: 0.01 });

function setup(rounds: Step[][], proofs: LadderResult[] = [ok()], o: { values?: Record<string, unknown>; ceiling?: number; now?: () => Date; executor?: (c: any) => Promise<ToolResult>; onCheck?: (n: number, s: RunnerSettings) => void } = {}) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  const settings = new RunnerSettings();
  if (o.values) settings.apply(apply(o.values));
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, ledger: new Ledger(":memory:"), settings, emit: (e) => events.push(e), proof: async () => { o.onCheck?.(n, settings); return proofs[Math.min(n++, proofs.length - 1)]; },
    ...(o.ceiling !== undefined ? { dailyCeilingUsd: o.ceiling } : {}), ...(o.now ? { now: o.now } : {}), ...(o.executor ? { executor: o.executor } : {}) });
  const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Fix the signup page", model: "m", budgetUsd: 3, ...extra } as never);
  const send = (extra: Record<string, unknown>) => runner.handle({ v: 1, id: "c2", type: "agent.send", agent: "builder-1", project, ...extra } as never);
  const choose = (choice: string) => runner.handle({ v: 1, id: "c", type: "loop.choose", agent: "builder-1", choice } as never);
  const plan = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "builder-1", goal: "Build a signup page", model: "m", budgetUsd: 5, ...extra } as never);
  // A Drive plan watches the folder for the person's own changes, and a file written just before it starts can be reported
  // late as one: the project's file is given a moment to be old, as a real project's files are.
  const approve = async (steps: string[]) => { await Bun.sleep(150); return runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "builder-1", steps } as never); };
  return { project, events, engine, log, settings, runner, start, send, choose, plan, approve, checks: () => n };
}

// ---------- the model choices (model.work, model.rescue, model.quick) ----------

describe("the models a person can choose", () => {
  test("option ids, never model ids, are what a setting holds, and each option is a model Companion knows", () => {
    for (const [job, key] of [["work", "model.work"], ["rescue", "model.rescue"], ["quick", "model.quick"]] as const) {
      expect(Object.keys(MODEL_CHOICES[job]).sort(), key).toEqual([...(defOf(key)!.options ?? [])].sort());
      for (const c of Object.values(MODEL_CHOICES[job])) expect(KNOWN_MODELS, `${key} ${c.model}`).toContain(canonicalModel(c.model));
    }
  });
  test("the usual option of each is the model its default names", () => {
    expect(modelForChoice("work", "recommended")).toBe(MODELS.agent);
    expect(modelForChoice("rescue", "careful")).toBe(MODELS.diagnose);
    expect(modelForChoice("quick", "fast")).toBe(MODELS.fast);
    expect(modelForChoice("work", defOf("model.work")!.default)).toBe(MODELS.agent);
    expect(modelForChoice("rescue", defOf("model.rescue")!.default)).toBe(MODELS.diagnose);
    // Quick answers default to Sonnet 5.5 since the real Explain eval (21 Oct 2026): 83% passed against 63% to 67% on Haiku 4.5,
    // for about $0.004 an explanation and about a second more.
    expect(defOf("model.quick")!.default).toBe("recommended");
    expect(modelForChoice("quick", defOf("model.quick")!.default)).toBe("claude-sonnet-5-5");
  });
  test("the smoke cases that passed on a real key (21 Oct 2026) are recorded, so every option is offered", () => {
    expect([...SMOKE_PASSED].sort()).toEqual(["fast-haiku45", "fast-sonnet55", "main-engine-opus55", "main-engine-sonnet55", "rescue-opus55", "rescue-sonnet55"]);
    for (const job of ["work", "rescue", "quick"] as const) for (const c of Object.values(MODEL_CHOICES[job])) expect(SMOKE_PASSED, c.smoke).toContain(c.smoke);
    expect(offeredChoices("work")).toEqual(["recommended", "careful"]);
    expect(offeredChoices("rescue")).toEqual(["careful", "recommended"]);
    expect(offeredChoices("quick")).toEqual(["fast", "recommended"]);
  });
  test("with no smoke case passed, only the usual option is offered and a saved other choice still gets the usual model", () => {
    expect(offeredChoices("work", [])).toEqual(["recommended"]);
    expect(offeredChoices("rescue", [])).toEqual(["careful"]);
    expect(offeredChoices("quick", [])).toEqual(["recommended"]);
    expect(modelForChoice("work", "careful", [])).toBe(MODELS.agent);
    expect(modelForChoice("rescue", "recommended", [])).toBe(MODELS.diagnose);
    expect(modelForChoice("quick", "fast", [])).toBe("claude-sonnet-5-5");
  });
  test("once an option's own smoke case has passed, it is offered and its model is used", () => {
    const passed = [MODEL_CHOICES.work.careful.smoke, MODEL_CHOICES.rescue.recommended.smoke, MODEL_CHOICES.quick.recommended.smoke];
    expect(offeredChoices("work", passed)).toEqual(["recommended", "careful"]);
    expect(modelForChoice("work", "careful", passed)).toBe("claude-opus-5-5");
    expect(modelForChoice("rescue", "recommended", passed)).toBe("claude-sonnet-5-5");
    expect(modelForChoice("quick", "recommended", passed)).toBe("claude-sonnet-5-5");
    // Another case passing never opens an option.
    expect(offeredChoices("work", [MODEL_CHOICES.quick.recommended.smoke])).toEqual(["recommended"]);
  });
  test("anything that is not an option gets the usual model, never a guess", () => {
    for (const v of ["claude-opus-5-5", "", null, 3, undefined, "__proto__", "constructor"]) {
      expect(modelForChoice("work", v as never, ["main-engine-opus55"]), String(v)).toBe(MODELS.agent);
      expect(modelForChoice("quick", v as never), String(v)).toBe("claude-sonnet-5-5");
    }
  });
  test("the cost words in Settings are true to the price list: careful costs twice recommended, recommended twice fast", () => {
    const p = (m: string) => listPrice(m)!;
    expect(p(MODEL_CHOICES.work.careful.model).in / p(MODEL_CHOICES.work.recommended.model).in).toBe(2);
    expect(p(MODEL_CHOICES.work.careful.model).out / p(MODEL_CHOICES.work.recommended.model).out).toBe(2);
    expect(p(MODEL_CHOICES.rescue.careful.model).in / p(MODEL_CHOICES.rescue.recommended.model).in).toBe(2);
    expect(p(MODEL_CHOICES.quick.recommended.model).in / p(MODEL_CHOICES.quick.fast.model).in).toBe(2);
    expect(p(MODEL_CHOICES.quick.recommended.model).out / p(MODEL_CHOICES.quick.fast.model).out).toBe(2);
  });
});

describe("Claude for quick answers (model.quick) is read for each request", () => {
  // The plan route needs no Keychain, and the fake query never starts Claude.
  const lanesWith = (env: Record<string, string>, quick: () => string) => {
    const asked: string[] = [];
    const queryFn = (p: any) => { asked.push(p.options.model); return (async function* () { yield { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }; yield { type: "result", subtype: "success", total_cost_usd: 0 }; })(); };
    const lanes = createLanes(readSettings({ COMPANION_ROUTE: "plan", COMPANION_CLAUDE_BIN: "/bin/ls", ...env }), { queryFn: queryFn as never }, { quickModel: quick });
    return { asked, ask: () => lanes.fast.run({ text: "hi", raw: true }, () => {}, new AbortController().signal) };
  };
  test("the usual choice is Sonnet 5.5; a change reaches the very next request", async () => {
    const s = new RunnerSettings();
    const l = lanesWith({}, () => quickModelOf(s));
    await l.ask();
    s.apply(apply({ "model.quick": "fast" }));
    await l.ask();
    s.apply(apply({}));
    await l.ask();
    expect(l.asked).toEqual(["claude-sonnet-5-5", MODELS.fast, "claude-sonnet-5-5"]);
  });
  test("until the other choice's smoke case passes, a saved fast choice still gets the usual model", async () => {
    const s = new RunnerSettings();
    s.apply(apply({ "model.quick": "fast" }));
    const l = lanesWith({}, () => quickModelOf(s, []));
    await l.ask();
    expect(l.asked).toEqual(["claude-sonnet-5-5"]);
  });
  test("a developer's COMPANION_FAST_MODEL in dev.json still wins", async () => {
    const s = new RunnerSettings();
    s.apply(apply({ "model.quick": "recommended" }));
    const l = lanesWith({ COMPANION_FAST_MODEL: "fast-x" }, () => quickModelOf(s, ["fast-sonnet55"]));
    await l.ask();
    expect(l.asked).toEqual(["fast-x"]);
  });
  test("the runner program reads it per request, from the settings the shell applied", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/createLanes\(settings, \{\}, \{ quickModel: \(\) => quickModelOf\(runnerSettings\) \}\)/);
  });
});

// ---------- budgets: never more than what is left of the day ----------

describe("a budget from Settings never goes above what is left of the daily limit", () => {
  test("the most a task may spend ($50) is cut to what the day has left", async () => {
    const r = setup([[write("a.txt", "x")]], [ok()], { ceiling: 10 });
    await r.start({ budgetUsd: 50 });
    expect(r.engine.calls[0].budgetUsd).toBeLessThanOrEqual(10);
  });
  test("so are a plan's, a Rescue's and a Research question's, and each step of a Rescue's plan", async () => {
    const r = setup([[planText("One")]], [ok()], { ceiling: 4 });
    await r.plan({ budgetUsd: 50 });
    expect(r.engine.calls[0].budgetUsd).toBeLessThanOrEqual(4);
    // A Rescue at $50 (Most a Rescue may spend, at its top) on a day with $4 left: the look is cut to $4, and the step it
    // plans gets only what the day has left after the look ($4 less the $0.01 the look cost), never what is left of $50.
    const diagnosis = { text: JSON.stringify({ summary: "A shop", works: ["the page"], broken: "The button calls a missing function.", steps: ["One", "Two", "Three"] }), costUsd: 0.01 };
    const d = setup([[diagnosis], [write("a.txt", "fixed")]], [bad("x"), ok()], { ceiling: 4 });
    await d.runner.handle({ v: 1, id: "r1", type: "rescue.diagnose", project: d.project, agent: "builder-1", model: "m", budgetUsd: 50 } as never);
    expect(d.engine.calls[0].budgetUsd).toBeLessThanOrEqual(4);
    expect(of(d.events, "plan.ready").length).toBe(1);
    await d.approve(["One"]);
    expect(d.engine.calls.length).toBe(2);
    expect(d.engine.calls[1].budgetUsd).toBeGreaterThan(0);
    expect(d.engine.calls[1].budgetUsd).toBeLessThanOrEqual(4 - 0.01 + 1e-9);
    const q = setup([[{ text: "nothing useful", costUsd: 0 }]], [ok()], { ceiling: 4 });
    await q.runner.handle({ v: 1, id: "r1", type: "research.ask", project: q.project, agent: "builder-1", question: "How do I take payments?", model: "m", budgetUsd: 50 } as never);
    expect(q.engine.calls[0].budgetUsd).toBeLessThanOrEqual(4);
  });
});

// ---------- work.tries and work.askOnAnyFailure ----------

describe("checks before Companion asks you what to do (work.tries)", () => {
  const same = bad("1 failed: expected blue, got grey");
  test("the usual 3: the card after the third identical failure, worded exactly as before", async () => {
    const r = setup(writes(4), [same]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(r.checks()).toBe(3);
    const card = of(r.events, "loop.stuck")[0];
    expect(card.tries).toBeUndefined();
    expect(card.same).toBeUndefined();
    await r.choose("different");
    await run;
    expect(r.engine.calls[3].prompt).toContain("The same check has failed three times in a row with the same problem, so the current approach is not working.");
  });
  test("at 1, the card comes after the first failed check, and a different approach gets one try", async () => {
    const r = setup(writes(3), [same], { values: { "work.tries": 1 } });
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(r.checks()).toBe(1);
    expect(of(r.events, "loop.stuck")[0]).toMatchObject({ tries: 1, same: true });
    await r.choose("different");
    await run;
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].prompt).toMatch(/different approach/i);
    expect(r.engine.calls[1].prompt).not.toMatch(/three times/);
    expect(r.log.list()[0].status).toBe("not_done");
  });
  test("at 5, four identical failures then a pass is a fix, and five identical failures ask", async () => {
    const fixed = setup(writes(5), [same, same, same, same, ok()], { values: { "work.tries": 5 } });
    await fixed.start();
    expect(of(fixed.events, "loop.stuck").length).toBe(0);
    expect(fixed.log.list()[0].status).toBe("done");
    const r = setup(writes(6), [same], { values: { "work.tries": 5 } });
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(r.checks()).toBe(5);
    expect(of(r.events, "loop.stuck")[0]).toMatchObject({ tries: 5, same: true });
    await r.choose("different");
    await run;
    expect(r.engine.calls[5].prompt).toContain("The same check has failed five times in a row with the same problem");
  });
  test("different failures still end the task as not done without asking, after that many checks", async () => {
    const r = setup(writes(5), [bad("one"), bad("two"), bad("three"), bad("four"), bad("five")], { values: { "work.tries": 5 } });
    await r.start();
    expect(of(r.events, "loop.stuck").length).toBe(0);
    expect(r.checks()).toBe(5);
    expect(r.log.list()[0].status).toBe("not_done");
  });
  test("a running task keeps the number it started with", async () => {
    // Changed to 1 during the first check: this task still asks after three, the next one after one.
    const r = setup([...writes(3), ...writes(1)], [same], { onCheck: (n, s) => { if (n === 0) s.apply(apply({ "work.tries": 1 })); } });
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(r.checks()).toBe(3);
    await r.choose("stop");
    await run;
    const next = r.start({ prompt: "Another fix" });
    await waitFor(() => of(r.events, "loop.stuck").length > 1);
    expect(r.checks()).toBe(4);
    await r.choose("stop");
    await next;
  });
  test("a value the rules refuse leaves the usual 3", async () => {
    const r = setup(writes(4), [same], { values: { "work.tries": 9 } });
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(r.checks()).toBe(3);
    await r.choose("stop");
    await run;
  });
  test("the task's budget still caps the cost, however many checks are allowed", async () => {
    const pricey: Step[][] = Array.from({ length: 5 }, (_, i) => [{ ...write("a.txt", String(i + 1)), costUsd: 0.4 }]);
    const r = setup(pricey, [same], { values: { "work.tries": 5 } });
    await r.start({ budgetUsd: 1 });
    expect(r.engine.calls.length).toBeLessThan(5);
    expect(r.log.list()[0].status).toBe("error_max_budget_usd");
  });
});

describe("ask me when the tries run out, even if each failure was different (work.askOnAnyFailure)", () => {
  test("off (usual): three different failures end the task without asking, as before", async () => {
    const r = setup(writes(3), [bad("first"), bad("second"), bad("third")]);
    await r.start();
    expect(of(r.events, "loop.stuck").length).toBe(0);
    expect(r.log.list()[0].status).toBe("not_done");
  });
  test("on: three different failures ask, saying they were not all the same, and Claude is told the truth", async () => {
    const r = setup(writes(4), [bad("first"), bad("second"), bad("third"), ok()], { values: { "work.askOnAnyFailure": true } });
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(of(r.events, "loop.stuck")[0]).toMatchObject({ tries: 3, same: false });
    expect(of(r.events, "loop.stuck")[0].failure.detail).toContain("third");
    await r.choose("different");
    await run;
    const p = r.engine.calls[3].prompt;
    expect(p).toContain("The checks have failed three times in a row, so the current approach is not working.");
    expect(p).not.toContain("same problem");
    expect(r.log.list()[0].status).toBe("done");
  });
  test("on: the card still appears at most once per task", async () => {
    const r = setup(writes(6), [bad("a"), bad("b"), bad("c"), bad("d"), bad("e"), bad("f")], { values: { "work.askOnAnyFailure": true } });
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("different");
    await run;
    expect(of(r.events, "loop.stuck").length).toBe(1);
    expect(r.checks()).toBe(6);
    expect(r.log.list()[0].status).toBe("not_done");
  });
  test("on: identical failures are still called the same", async () => {
    const r = setup(writes(4), [bad("x")], { values: { "work.askOnAnyFailure": true } });
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(of(r.events, "loop.stuck")[0].same).toBeUndefined();   // three identical: the card is exactly today's
    await r.choose("stop");
    await run;
  });
  test("on, in a Drive plan: a step whose checks failed in different ways asks once, with true words", async () => {
    const r = setup([[planText("Add the form")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "4")]], [bad("first"), bad("second"), bad("third"), ok()], { values: { "work.askOnAnyFailure": true } });
    await r.plan();
    const run = r.approve(["Add the form"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(of(r.events, "loop.stuck")[0]).toMatchObject({ index: 1, tries: 3, same: false });
    await r.choose("different");
    await run;
    expect(r.engine.calls[4].prompt).toContain("The checks have failed three times in a row, so the current approach is not working.");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 1 });
  });
  test("off, in a Drive plan: different failures end the step as not done, as before", async () => {
    const r = setup([[planText("Add the form")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [bad("first"), bad("second"), bad("third")]);
    await r.plan();
    await r.approve(["Add the form"]);
    expect(of(r.events, "loop.stuck").length).toBe(0);
    expect(of(r.events, "drive.done")[0].status).toBe("not_done");
  });
});

// ---------- drive.maxSteps ----------

const fifteen = Array.from({ length: 15 }, (_, i) => `Step ${i + 1}`);
describe("most steps in a plan (drive.maxSteps)", () => {
  test("the usual 12: the plan is asked for at most 12, a longer one is asked again and cut to 12", async () => {
    const r = setup([[planText(...fifteen)], [planText(...fifteen)]]);
    await r.plan({ model: MODELS.agent });
    expect(r.engine.calls[0].prompt).toContain("Never more than 12.");
    expect(r.engine.calls[1].prompt).toContain("at most 12 steps");
    expect(of(r.events, "plan.ready")[0].steps.length).toBe(12);
    expect(of(r.events, "plan.ready")[0].truncated).toBe(true);
    expect(of(r.events, "plan.ready")[0].estimateUsd).toBe(3);
  });
  test("at 3: asked for at most 3, cut to 3, and an approved plan of 5 runs only 3", async () => {
    const r = setup([[planText("A", "B", "C", "D", "E")], [planText("A", "B", "C", "D", "E")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [ok()], { values: { "drive.maxSteps": 3 } });
    await r.plan();
    expect(r.engine.calls[0].prompt).toContain("Never more than 3.");
    expect(r.engine.calls[1].prompt).toContain("at most 3 steps");
    expect(of(r.events, "plan.ready")[0].steps.length).toBe(3);
    await r.approve(["A", "B", "C", "D", "E"]);
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 3, total: 3 });
  });
  test("at 20: a plan of 15 is kept whole, not asked again", async () => {
    const r = setup([[planText(...fifteen)]], [ok()], { values: { "drive.maxSteps": 20 } });
    await r.plan();
    expect(r.engine.calls.length).toBe(1);
    expect(r.engine.calls[0].prompt).toContain("Never more than 20.");
    expect(of(r.events, "plan.ready")[0]).toMatchObject({ truncated: false });
    expect(of(r.events, "plan.ready")[0].steps.length).toBe(15);
  });
  test("a plan keeps the most it was made with, even if the setting changes before it is approved", async () => {
    const r = setup([[planText("A", "B", "C")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [ok()], { values: { "drive.maxSteps": 3 } });
    await r.plan();
    r.settings.apply(apply({ "drive.maxSteps": 20 }));
    await r.approve(["A", "B", "C", "D"]);
    expect(of(r.events, "drive.done")[0]).toMatchObject({ completed: 3, total: 3 });
  });
  test("Rescue plans keep their own 1 to 7 steps, whatever the setting", async () => {
    const diagnosis = { text: JSON.stringify({ summary: "A shop", works: ["the page"], broken: "The button calls a missing function.", steps: ["One", "Two", "Three", "Four", "Five"] }), costUsd: 0.01 };
    const r = setup([[diagnosis], [], [], [], [], []], [bad("x")], { values: { "drive.maxSteps": 3 } });
    await r.runner.handle({ v: 1, id: "r1", type: "rescue.diagnose", project: r.project, agent: "builder-1", model: "m", budgetUsd: 5 } as never);
    expect(of(r.events, "plan.ready")[0].steps.length).toBe(5);
    await r.approve(["One", "Two", "Three", "Four", "Five"]);
    expect(of(r.events, "drive.step").filter((s) => s.status === "started").map((s) => s.total)).toEqual([5, 5, 5, 5, 5]);
  });
});

// ---------- the rough cost shown before Start ----------

describe("the rough cost shown before Start (at most) follows the model the plan runs on", () => {
  const four = ["One", "Two", "Three", "Four"];
  const diagnosis = { text: JSON.stringify({ summary: "A shop", works: ["the page"], broken: "The button calls a missing function.", steps: four }), costUsd: 0.01 };
  const plan = async (model: string) => { const r = setup([[planText(...four)]]); await r.plan({ model }); return of(r.events, "plan.ready")[0].estimateUsd; };
  const rescue = async (model: string) => {
    const r = setup([[diagnosis]], [bad("x")]);
    await r.runner.handle({ v: 1, id: "r1", type: "rescue.diagnose", project: r.project, agent: "builder-1", model, budgetUsd: 5 } as never);
    const report = of(r.events, "rescue.report")[0].estimateUsd;
    expect(of(r.events, "plan.ready")[0].estimateUsd).toBe(report);
    return report;
  };
  test("on the usual models it is exactly today's: $0.25 a step, for a plan and for a Rescue", async () => {
    expect(await plan(MODELS.agent)).toBe(1);
    expect(await rescue(MODELS.diagnose)).toBe(1);
  });
  test("a plan made on Careful (Opus 5.5) shows about twice as much, as its words say", async () => {
    expect(await plan(MODEL_CHOICES.work.careful.model)).toBe(2);
  });
  test("a Rescue on Recommended (Sonnet 5.5) shows about half, as its words say", async () => {
    expect(await rescue(MODEL_CHOICES.rescue.recommended.model)).toBe(0.5);
  });
  test("a model Companion does not know counts as the dearest it knows, so the figure is never too low", async () => {
    const unknown = await plan("claude-future-9");
    for (const m of KNOWN_MODELS) expect(unknown, m).toBeGreaterThanOrEqual(planEstimate(4, m, MODELS.agent));
  });
  test("the step rate is today's for the job's usual model, scaled by the chosen model's list price against it", () => {
    expect(planEstimate(12)).toBe(3);
    expect(planEstimate(12, MODELS.agent, MODELS.agent)).toBe(3);
    expect(planEstimate(12, "claude-opus-5-5", MODELS.agent)).toBe(6);
    expect(planEstimate(4, MODELS.diagnose, MODELS.diagnose)).toBe(1);
    expect(planEstimate(4, "claude-sonnet-5-5", MODELS.diagnose)).toBe(0.5);
    expect(planEstimate(4, "claude-haiku-4-5-20251001", MODELS.agent)).toBe(0.5);
  });
});

// ---------- work.tryAgain ----------

describe("Try again (work.tryAgain)", () => {
  // Three different failures end the first task as not done (no loop card), then Try again.
  const failing = [bad("the form is missing"), bad("the button is grey"), bad("expected blue, got grey"), ok()];
  test("carry on (usual): Try again continues the same conversation, as before", async () => {
    const r = setup(writes(4), failing);
    await r.start();
    expect(r.log.list()[0].status).toBe("not_done");
    await r.send({ retry: true });
    const last = r.engine.calls[3];
    expect(last.resumeSession).toBe("scripted-session");
    expect(last.prompt).toContain("Please try this again: Fix the signup page");
  });
  test("fresh: a new conversation that is still told the request, how the last attempt ended and which check failed", async () => {
    const r = setup(writes(4), failing, { values: { "work.tryAgain": "fresh" } });
    await r.start();
    await r.send({ retry: true });
    const last = r.engine.calls[3];
    expect(last.resumeSession).toBeUndefined();
    expect(last.prompt).toContain("Fix the signup page");
    expect(last.prompt).toContain("did not pass the checks");
    expect(last.prompt).toContain("expected blue, got grey");
    expect(last.prompt).toMatch(/look before you change anything/);
  });
  test("fresh changes only Try again: a follow up still carries on the conversation", async () => {
    const r = setup([[write("a.txt", "v1")], [write("a.txt", "v2")]], [ok()], { values: { "work.tryAgain": "fresh" } });
    await r.start();
    await r.send({ text: "make it bigger" });
    expect(r.engine.calls[1].resumeSession).toBe("scripted-session");
  });
});

// ---------- approval.waitMinutes, with its floor ----------

const pushOnce: Step[] = [{ tool: { name: "Bash", input: { command: "git push" } }, costUsd: 0 }];
describe("how long a question waits for your answer (approval.waitMinutes)", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  const asked = async (values: Record<string, unknown>) => {
    const ran: string[] = [];
    const r = setup([pushOnce], [ok()], { values, now: () => now, executor: async () => { ran.push("ran"); return { ok: true, output: "" }; } });
    const run = r.start();
    await waitFor(() => of(r.events, "approval.request").length > 0);
    const req = of(r.events, "approval.request")[0];
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "test over" });
    await run;
    return { minutes: (Date.parse(req.expiresAt) - now.getTime()) / 60_000, ran };
  };
  // The top is 30 until a real run shows Claude Code honours a safety hook still waiting past 32 minutes (T05), so for now
  // the setting can only shorten the wait.
  test("30 minutes as usual and at the most, 5 at the least; a refused value leaves 30", async () => {
    expect((await asked({})).minutes).toBe(30);
    expect((await asked({ "approval.waitMinutes": 5 })).minutes).toBe(5);
    expect((await asked({ "approval.waitMinutes": 20 })).minutes).toBe(20);
    expect((await asked({ "approval.waitMinutes": 35 })).minutes).toBe(30);
    expect((await asked({ "approval.waitMinutes": 120 })).minutes).toBe(30);
    expect((await asked({ "approval.waitMinutes": 3 })).minutes).toBe(30);
  });
  test("it is read when each question is asked, so a change reaches the next question of a running task", async () => {
    const r = setup([[{ tool: { name: "Bash", input: { command: "git push" } }, costUsd: 0 }, { tool: { name: "Bash", input: { command: "git push origin main" } }, costUsd: 0 }]], [ok()], { now: () => now, executor: async () => ({ ok: true, output: "" }) });
    const run = r.start();
    await waitFor(() => of(r.events, "approval.request").length > 0);
    r.settings.apply(apply({ "approval.waitMinutes": 15 }));
    await r.runner.handle({ v: 1, id: "a", type: "approval.resolve", approval: of(r.events, "approval.request")[0].approval, decision: "deny", scope: "once" });
    await waitFor(() => of(r.events, "approval.request").length > 1);
    const [first, second] = of(r.events, "approval.request");
    expect((Date.parse(first.expiresAt) - now.getTime()) / 60_000).toBe(30);
    expect((Date.parse(second.expiresAt) - now.getTime()) / 60_000).toBe(15);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "test over" });
    await run;
  });
  // The floor: no answer always counts as no, at any wait the setting allows, and an expired card can never become a yes.
  // The wait itself is shortened here (only the timer for exactly that wait), so the test does not take minutes.
  for (const minutes of [5, 20]) {
    test(`at ${minutes} minutes, a question nobody answers is a no when its time is up, and a late yes does nothing`, async () => {
      const real = globalThis.setTimeout;
      const waits: number[] = [];
      globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => { if (ms === minutes * 60_000) { waits.push(ms); return real(fn, 5, ...a); } return real(fn, ms, ...a); }) as typeof setTimeout;
      try {
        const ran: string[] = [];
        const r = setup([pushOnce], [ok()], { values: { "approval.waitMinutes": minutes }, executor: async () => { ran.push("ran"); return { ok: true, output: "" }; } });
        await r.start();
        expect(waits).toEqual([minutes * 60_000]);
        expect(of(r.events, "approval.resolved")[0].outcome).toBe("expired");
        expect(ran).toEqual([]);
        expect(of(r.events, "agent.tool").some((t) => t.outcome === "denied")).toBe(true);
        await r.runner.handle({ v: 1, id: "late", type: "approval.resolve", approval: of(r.events, "approval.request")[0].approval, decision: "allow", scope: "once" });
        expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/unknown approval/);
        expect(ran).toEqual([]);
      } finally { globalThis.setTimeout = real; }
    });
  }
});
