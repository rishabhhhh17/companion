// The parts every eval set shares, and above all the spending stops: a dry run spends nothing, --spend is refused until
// the real harness is plugged in, a case stops at its cap, and the run stops starting cases at its total.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AgentRunner } from "../../runner/src/agent.ts";
import { EngineStop, ScriptedEngine, type EngineOptions, type Step } from "../../runner/src/engine.ts";
import { TaskLog } from "../../runner/src/tasklog.ts";
import { CAP_REACHED, CaseMeter, SpendGuard } from "./budget.ts";
import { DEFAULT_MODELS, HarnessMissing, parseArgs, realHarness, type EvalHarness } from "./harness.ts";
import { costTable, estimateUsd, uncachedUsd } from "./prices.ts";
import { checkResults, readResults, type CaseResult } from "./results.ts";
import { runSet } from "./runset.ts";
import { removeDir, tempDir } from "./project.ts";

const made: string[] = [];
afterEach(() => { while (made.length) removeDir(made.pop()!); });
const tmp = (l: string) => { const d = tempDir(l); made.push(d); return d; };
const noSignal = () => new AbortController().signal;
const costly = (n: number, usd: number): Step[] => Array.from({ length: n }, (_, i) => ({ text: `turn ${i + 1}`, costUsd: usd }));
const startOpts = (budgetUsd: number): EngineOptions => ({ prompt: "p", project: "/nowhere", model: "m", signal: noSignal(), budgetUsd, authorize: async () => ({ allow: true, reason: "" }) });

describe("the command line", () => {
  const d = { perCaseUsd: 0.5, totalUsd: 5 };
  test("with no flags it is a dry run with the set's caps and the app's models", () => {
    const a = parseArgs([], d);
    expect(a).toMatchObject({ spend: false, only: [], perCaseUsd: 0.5, totalUsd: 5 });
    expect(a.models).toEqual({ ...DEFAULT_MODELS });
  });
  test("--spend, the caps, the cases and the models are read", () => {
    const a = parseArgs(["--spend", "--per-case", "0.25", "--total=2", "--only", "a,b", "--agent-model", "claude-haiku-5-5", "--flow", "rescue"], d);
    expect(a).toMatchObject({ spend: true, perCaseUsd: 0.25, totalUsd: 2, only: ["a", "b"], extra: { flow: "rescue" } });
    expect(a.models.agent).toBe("claude-haiku-5-5");
  });
  test("a set's own switch can stand alone", () => {
    expect(parseArgs(["--hard", "--agent-model", "m", "--review"], d).extra).toEqual({ hard: "", review: "" });
  });
  test("a cap that is not a positive number is refused, never guessed", () => {
    for (const bad of [["--per-case"], ["--per-case", "0"], ["--total", "-1"], ["--total", "lots"]]) expect(() => parseArgs(bad, d)).toThrow(/dollar amount above zero/);
    expect(() => parseArgs(["--per-case", "6"], d)).toThrow(/cannot be more than --total/);
    expect(() => parseArgs(["stray"], d)).toThrow(/Unknown argument/);
  });
});

describe("spending stops", () => {
  test("each case gets the per case cap, or less once the run is near its total", () => {
    const g = new SpendGuard(1, 2.5);
    const a = g.startCase("a")!; a.charge(1);
    const b = g.startCase("b")!; b.charge(1);
    const c = g.startCase("c")!;
    expect([a.capUsd, b.capUsd, c.capUsd]).toEqual([1, 1, 0.5]);
    c.charge(0.5);
    expect(g.startCase("d")).toBeNull();
    expect(g.stopped).toContain("before d");
    expect(g.spentUsd).toBe(2.5);
  });

  test("an engine is told the smaller budget, and the next turn never starts once the case is over its cap", async () => {
    const m = new CaseMeter(0.5);
    const inner = new ScriptedEngine(costly(5, 0.2));
    const gen = m.engine(inner).start(startOpts(3));
    const seen: string[] = [];
    await expect((async () => { for (let n = await gen.next(); !n.done; n = await gen.next(undefined)) seen.push(n.value.text!); })()).rejects.toThrow(CAP_REACHED);
    expect(inner.calls[0].budgetUsd).toBe(0.5);
    expect(seen).toEqual(["turn 1", "turn 2", "turn 3"]);   // 0.6 after the third: over, so the fourth is never asked for
    expect(m.usd).toBeCloseTo(0.6);
    expect(m.capped).toBe(true);
  });

  test("a case already at its cap starts nothing more, engine or text call", async () => {
    const m = new CaseMeter(0.1); m.charge(0.1);
    await expect(m.engine(new ScriptedEngine([])).start(startOpts(1)).next()).rejects.toBeInstanceOf(EngineStop);
    let called = false;
    await expect(m.ask(async () => { called = true; return { text: "x", costUsd: 0 }; })({ text: "", system: "" }, noSignal())).rejects.toThrow(CAP_REACHED);
    expect(called).toBe(false);
  });

  test("through Companion's runner, a task stops at the case's cap with the cost it really had", async () => {
    const project = tmp("p"), shadow = tmp("s");
    const m = new CaseMeter(0.3);
    const events: any[] = [];
    const runner = new AgentRunner({ shadowRoot: shadow, engine: m.engine(new ScriptedEngine(costly(10, 0.1))), log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
    await runner.handle({ v: 1, id: "s", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 5 } as never);
    expect(events.some((e) => e.type === "protocol.error" && /error_max_budget_usd/.test(e.reason))).toBe(true);
    expect(m.turns).toBe(3);
    expect(events.find((e) => e.type === "receipt").usdEstimate).toBeCloseTo(0.3);
  });
});

describe("a run of a set", () => {
  type C = { id: string };
  const cases: C[] = [{ id: "one" }, { id: "two" }, { id: "three" }];
  const result = (id: string, usd: number, turns: number): CaseResult => ({ id, outcome: "fine", costUsd: usd, turns, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 1, notes: [] });
  const quiet = () => {};

  test("--spend is refused while the real harness is not plugged in, before any case starts", async () => {
    await expect(realHarness()).rejects.toBeInstanceOf(HarnessMissing);
    let ran = 0;
    await expect(runSet({ set: "t", setDir: tmp("set"), cases, args: parseArgs(["--spend"], { perCaseUsd: 1, totalUsd: 2 }), models: {}, summarize: () => ({}), log: quiet, run: async (c) => { ran++; return result(c.id, 0, 0); } })).rejects.toBeInstanceOf(HarnessMissing);
    expect(ran).toBe(0);
  });

  test("a dry run spends nothing, says so in its results file, and the file reads back", async () => {
    const out = join(tmp("out"), "r.json");
    const { results } = await runSet({ set: "t", setDir: tmp("set"), cases, args: parseArgs(["--out", out], { perCaseUsd: 1, totalUsd: 2 }), models: { agent: "m" }, summarize: (c) => ({ n: c.length }), log: quiet,
      run: async (c, ctx) => { expect(ctx.mode).toBe("dry"); expect(ctx.harness).toBeUndefined(); return result(c.id, 0.5, 2); } });
    expect(results.mode).toBe("dry");
    expect(results.spentUsd).toBe(0);
    expect(results.cases.every((c) => c.costUsd === 0)).toBe(true);
    expect(readResults(out).summary).toEqual({ n: 3 });
  });

  test("a spend run stops starting cases at its total, and records why", async () => {
    const stub: EvalHarness = { name: "stub", agent: () => new ScriptedEngine([]), reviewer: () => new ScriptedEngine([]), ask: () => async () => ({ text: "", costUsd: 0 }), vision: () => ({ locate: async () => ({ point: null, costUsd: 0 }) }) };
    const out = join(tmp("out"), "r.json");
    const { results } = await runSet({ set: "t", setDir: tmp("set"), cases, harness: stub, args: parseArgs(["--spend", "--per-case", "0.6", "--total", "1", "--out", out], { perCaseUsd: 1, totalUsd: 2 }), models: {}, summarize: () => ({}), log: quiet,
      run: async (c, ctx) => { ctx.meter.charge(0.6); return result(c.id, ctx.meter.usd, 1); } });
    expect(results.cases.map((c) => c.outcome)).toEqual(["fine", "fine", "not_started"]);
    expect(results.spentUsd).toBeCloseTo(1.2);   // the second case started with $0.40 left and went one charge over, as documented
    expect(results.stopped).toContain("before three");
    expect(checkResults(results)).toEqual([]);
  });

  test("--only runs just those cases, and an unknown one is refused", async () => {
    const seen: string[] = [];
    await runSet({ set: "t", setDir: tmp("set"), cases, args: parseArgs(["--only", "two", "--out", join(tmp("o"), "r.json")], { perCaseUsd: 1, totalUsd: 2 }), models: {}, summarize: () => ({}), log: quiet, run: async (c) => { seen.push(c.id); return result(c.id, 0, 0); } });
    expect(seen).toEqual(["two"]);
    await expect(runSet({ set: "t", setDir: tmp("set"), cases, args: parseArgs(["--only", "four"], { perCaseUsd: 1, totalUsd: 2 }), models: {}, summarize: () => ({}), log: quiet, run: async (c) => result(c.id, 0, 0) })).rejects.toThrow(/No case called four/);
  });

  test("a results file in the wrong shape is caught, and a dry one that spent is refused", () => {
    expect(checkResults(null)).not.toEqual([]);
    const ok = { format: "companion-eval-results/1", set: "t", mode: "dry", harness: "dry", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), models: {}, caps: { perCaseUsd: 1, totalUsd: 2 }, spentUsd: 0, stopped: null, cases: [result("a", 0, 0)], summary: {} };
    expect(checkResults(ok)).toEqual([]);
    expect(checkResults({ ...ok, spentUsd: 1 }).join(" ")).toMatch(/must spend nothing/);
    expect(checkResults({ ...ok, cases: [result("a", 0, 0), result("a", 0, 0)] }).join(" ")).toMatch(/twice/);
  });
});

describe("cost estimates", () => {
  test("prices are per million tokens, with cache writes at 1.25 and reads at the model's rate", () => {
    expect(estimateUsd("claude-sonnet-5-5", { fresh: 1_000_000, written: 0, cacheRead: 0, out: 0 })).toBeCloseTo(2);
    expect(estimateUsd("claude-opus-5-5", { fresh: 0, written: 0, cacheRead: 0, out: 1_000_000 })).toBeCloseTo(20);
    expect(estimateUsd("claude-haiku-5-5", { fresh: 0, written: 1_000_000, cacheRead: 1_000_000, out: 0 })).toBeCloseTo(0.135);
    expect(uncachedUsd("claude-haiku-4-5-20251001", { fresh: 0, written: 1_000_000, cacheRead: 1_000_000, out: 0 })).toBeCloseTo(2);
    expect(() => estimateUsd("some-model", { fresh: 1, written: 0, cacheRead: 0, out: 0 })).toThrow(/No price/);
  });
  test("evals/README.md carries the table these numbers make", () => {
    const readme = join(import.meta.dir, "..", "README.md");
    expect(existsSync(readme)).toBe(true);
    expect(readFileSync(readme, "utf8")).toContain(costTable());
  });
});

