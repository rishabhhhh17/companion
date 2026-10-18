// The parts every eval set shares, and above all the spending stops: a dry run spends nothing, a case stops at its cap, and
// the run stops starting cases at its total. The real run harness itself (what --spend builds) is tested in real.test.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AgentRunner } from "../../runner/src/agent.ts";
import { EngineStop, ScriptedEngine, type Engine, type EngineOptions, type Step, type ToolResult, type Turn } from "../../runner/src/engine.ts";
import { TaskLog } from "../../runner/src/tasklog.ts";
import { CAP_REACHED, CaseMeter, SpendGuard } from "./budget.ts";
import { DEFAULT_MODELS, parseArgs, type EvalHarness } from "./harness.ts";
import { estimateUsd as modelsUsd } from "../../runner/src/models.ts";
import { costTable, estimateUsd, PRICES, uncachedUsd } from "./prices.ts";
import { checkResults, readResults, type CaseResult } from "./results.ts";
import { runSet } from "./runset.ts";
import { changeSize, lineChanges, parsePytest, parseTap, removeDir, runCheck, tempDir, testRegressions } from "./project.ts";

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
  test("--spend takes no value: --spend=false is refused, never read as a yes", () => {
    for (const bad of ["--spend=false", "--spend=no", "--spend=0", "--spend=", "--spend=true"]) expect(() => parseArgs([bad], d), bad).toThrow(/--spend on its own/);
    expect(parseArgs(["--spend"], d).spend).toBe(true);
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

  // The real engine (runner/src/sdkEngine.ts) gives every assistant turn a cost of $0: a round's cost comes only with its
  // result, and when the SDK stops a round at its spending limit, that cost comes inside the EngineStop it throws.
  class SdkShaped implements Engine {
    readonly calls: EngineOptions[] = [];
    constructor(private overUsd = 0.1) {}
    async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
      this.calls.push(opts);
      yield { text: "Looking at the project.", costUsd: 0, sessionId: "sdk-session" };
      yield { text: "Still looking.", costUsd: 0 };
      // The SDK checks its budget between its own turns, so it stops a little over it, as real Claude does.
      throw new EngineStop("error_max_budget_usd: the run stopped", opts.budgetUsd + this.overUsd);
    }
  }

  test("the cost of a round the real engine stops at its limit is counted, so the run's total stop still works", async () => {
    const seen: { id: string; usd: number; capped: boolean; receipt: number }[] = [];
    const engines: SdkShaped[] = [];
    const { results } = await runSet({ set: "t", setDir: tmp("set"), cases: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      harness: { name: "stub", agent: () => new SdkShaped(), reviewer: () => new SdkShaped(), ask: () => async () => ({ text: "", costUsd: 0 }), vision: () => ({ locate: async () => ({ point: null, costUsd: 0 }) }) },
      args: parseArgs(["--spend", "--per-case", "0.75", "--total", "1", "--out", join(tmp("out"), "r.json")], { perCaseUsd: 1, totalUsd: 2 }), models: {}, summarize: () => ({}), log: () => {},
      run: async (c, ctx) => {
        const project = tmp("p"), shadow = tmp("s");
        const inner = ctx.harness!.agent() as SdkShaped; engines.push(inner);
        const events: any[] = [];
        const runner = new AgentRunner({ shadowRoot: shadow, engine: ctx.meter.engine(inner), log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
        await runner.handle({ v: 1, id: "s", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: ctx.meter.capUsd } as never);
        seen.push({ id: c.id, usd: ctx.meter.usd, capped: ctx.meter.capped, receipt: events.find((e) => e.type === "receipt")?.usdEstimate ?? -1 });
        return { id: c.id, outcome: "fine", costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: { ...ctx.meter.tokens }, ms: 1, notes: [] };
      } });
    expect(engines[0].calls[0].budgetUsd).toBeCloseTo(0.75);
    expect(seen[0].usd).toBeCloseTo(0.85);        // what the runner booked too
    expect(seen[0].receipt).toBeCloseTo(0.85);
    expect(seen[0].capped).toBe(true);
    expect(engines[1].calls[0].budgetUsd).toBeCloseTo(0.15);   // the second case was told only what the run had left
    expect(results.spentUsd).toBeCloseTo(1.1);   // the run's own count (SpendGuard.spentUsd), which decides what may start
    // Both cases were cut short by the spending limit, so neither is scored, whatever the case said: they fail with the reason.
    expect(results.cases.map((x) => x.outcome)).toEqual(["stopped", "stopped", "not_started", "not_started"]);
    expect(results.cases[0].detail?.wouldHaveBeen).toBe("fine");
    expect(results.cases[0].costUsd).toBeCloseTo(0.85);
    expect(results.cases[0].notes[0]).toMatch(/^Stopped: .*spending limit/);
  });

  test("a single text call that fails with a cost is counted too", async () => {
    const m = new CaseMeter(0.5);
    await expect(m.ask(async () => { throw new EngineStop("error_max_budget_usd: the run stopped", 0.02); })({ text: "", system: "" }, noSignal())).rejects.toBeInstanceOf(EngineStop);
    await expect(m.vision({ locate: async () => { throw new EngineStop("error_during_execution: the run stopped", 0.03); } }).locate({ image: { base64: "", mediaType: "image/png" }, question: "q", ocr: [] }, noSignal())).rejects.toBeInstanceOf(EngineStop);
    expect(m.usd).toBeCloseTo(0.05);
  });

  test("what the agent says is kept apart from what the reviewer and a read only plan say", async () => {
    const m = new CaseMeter(1);
    const drain = async (e: Engine, o: EngineOptions) => { const g = e.start(o); for (let n = await g.next(); !n.done; n = await g.next(undefined)); };
    await drain(m.engine(new ScriptedEngine([{ text: "Here is my plan: ask for the key?", costUsd: 0 }])), { ...startOpts(1), planOnly: true });
    await drain(m.engine(new ScriptedEngine([{ text: "I changed the code.", costUsd: 0 }])), startOpts(1));
    await drain(m.engine(new ScriptedEngine([{ text: '{"verdict":"concerns","concerns":["What is STRIPE_SECRET_KEY?"]}', costUsd: 0 }]), "reviewer"), { ...startOpts(1), planOnly: true });
    expect(m.said).toEqual(["I changed the code."]);
    expect(m.planSaid).toEqual(["Here is my plan: ask for the key?"]);
    expect(m.reviewerSaid).toEqual(['{"verdict":"concerns","concerns":["What is STRIPE_SECRET_KEY?"]}']);
    expect(m.turns).toBe(3);
  });
});

describe("a run of a set", () => {
  type C = { id: string };
  const cases: C[] = [{ id: "one" }, { id: "two" }, { id: "three" }];
  const result = (id: string, usd: number, turns: number): CaseResult => ({ id, outcome: "fine", costUsd: usd, turns, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 1, notes: [] });
  const quiet = () => {};

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

describe("reading a change and the tests one by one", () => {
  test("lines added and removed, and new and deleted files counted by their lines", () => {
    expect(lineChanges("a\nb\nc\n", "a\nB\nc\n")).toEqual({ added: 1, removed: 1 });
    expect(lineChanges("a\n", "a\nb\n")).toEqual({ added: 1, removed: 0 });
    expect(changeSize({ "x.js": "a\nb\n", "gone.js": "1\n2\n" }, { "x.js": "a\nc\n", "new.js": "n" })).toEqual({ files: 3, added: 2, removed: 3 });
    expect(changeSize({ "x.js": "a" }, { "x.js": "a" })).toEqual({ files: 0, added: 0, removed: 0 });
  });
  test("node --test's TAP: inner tests named with their parents, a skipped test never a pass", () => {
    const tap = ["TAP version 13", "# Subtest: /tmp/p/test/a.js", "    # Subtest: adds", "    ok 1 - adds", "      ---", "      ...", "    # Subtest: rounds", "    not ok 2 - rounds", "not ok 1 - /tmp/p/test/a.js", "ok 2 - prices show the currency", "ok 3 - later # SKIP not now", "ok 4 - todo one # TODO", "1..4"].join("\n");
    expect(parseTap(tap)).toEqual({ "/tmp/p/test/a.js > adds": true, "/tmp/p/test/a.js > rounds": false, "prices show the currency": true, later: false, "todo one": false });
  });
  test("pytest's short summary", () => {
    expect(parsePytest("== short test summary info ==\nPASSED test_app.py::test_ok\nFAILED test_app.py::test_status - assert 200 == 201\nSKIPPED [1] test_app.py:9: later\n")).toEqual({ "test_app.py::test_ok": true, "test_app.py::test_status": false });
  });
  test("a test that passed before and fails, is switched off or is gone after is a regression; one that failed before is not", () => {
    expect(testRegressions({ a: true, b: true, c: false, d: true }, { a: true, b: false, c: false })).toEqual(['the test "b" passed before and fails now', 'the test "d" passed before and no longer runs']);
    expect(testRegressions(null, { a: false })).toEqual([]);
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
  test("the estimates use the same prices as the runner's model table, the one the spending stops count by", () => {
    for (const model of Object.keys(PRICES)) {
      const p = PRICES[model];
      // One small request of each kind (well under Haiku 5.5's long prompt line), priced both ways.
      expect(modelsUsd(model, { input_tokens: 10_000 }), model).toBeCloseTo(estimateUsd(model, { fresh: 10_000, written: 0, cacheRead: 0, out: 0 }), 9);
      expect(modelsUsd(model, { output_tokens: 10_000 }), model).toBeCloseTo((10_000 * p.out) / 1e6, 9);
      expect(modelsUsd(model, { cache_read_input_tokens: 10_000 }), model).toBeCloseTo((10_000 * p.cacheRead) / 1e6, 9);
      expect(modelsUsd(model, { cache_creation_input_tokens: 10_000 }), model).toBeCloseTo(estimateUsd(model, { fresh: 0, written: 10_000, cacheRead: 0, out: 0 }), 9);
    }
  });
  test("evals/README.md carries the table these numbers make", () => {
    const readme = join(import.meta.dir, "..", "README.md");
    expect(existsSync(readme)).toBe(true);
    expect(readFileSync(readme, "utf8")).toContain(costTable());
  });
});


// A very busy Mac can have no room to start one more program. A case's own checks (the hidden ones, each test on its own)
// are run again after a moment, as the proof ladder does, so that is never what a case's result says.
describe("a check this Mac had no room to start", () => {
  // A stand in check: the first `fails` runs say what npm says then, and each run is counted in a file next to it.
  const check = (dir: string, fails: number) => ["sh", "-c", `n=$(cat runs 2>/dev/null || echo 0); n=$((n+1)); echo $n > runs; if [ $n -le ${fails} ]; then echo 'npm error spawn sh EAGAIN' >&2; exit 1; fi; echo ok`];
  const runs = (dir: string) => Number(readFileSync(join(dir, "runs"), "utf8").trim());
  test("is run again, and its real answer counts", async () => {
    const dir = tmp("nr");
    const r = await runCheck(check(dir, 1), dir, {}, 10_000, [0, 0]);
    expect(r).toMatchObject({ pass: true, code: 0 });
    expect(runs(dir)).toBe(2);
  });
  test("one that never starts fails with what it said, after three tries", async () => {
    const dir = tmp("nr");
    const r = await runCheck(check(dir, 9), dir, {}, 10_000, [0, 0]);
    expect(r.pass).toBe(false);
    expect(r.output).toMatch(/EAGAIN/);
    expect(runs(dir)).toBe(3);
  });
  test("a check that fails for its own reasons is run once", async () => {
    const dir = tmp("nr");
    const r = await runCheck(["sh", "-c", "n=$(cat runs 2>/dev/null || echo 0); echo $((n+1)) > runs; echo 'read EAGAIN' >&2; exit 1"], dir, {}, 10_000, [0, 0]);
    expect(r.pass).toBe(false);
    expect(runs(dir)).toBe(1);
  });
});
