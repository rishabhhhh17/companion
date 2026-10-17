// The real run harness under the eval sets: evals/lib/harness.ts realHarness(), built on runner/scripts/realrun-harness.ts.
// Stubbed queries and an injected key reader only: no Claude starts, nothing reaches the network, and the Keychain is never
// read (the key reader is a stand in, and the item it is asked for is a throwaway companion-test- name).
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessRefusal } from "../../runner/scripts/realrun-harness.ts";
import { API_URL } from "../../runner/src/aim.ts";
import type { Engine } from "../../runner/src/engine.ts";
import { KNOWN_MODELS, MODELS, apiShape, requestProblems, thinkingFor } from "../../runner/src/models.ts";
import * as harnessModule from "./harness.ts";
import { CannotSpend, DEFAULT_MODELS, parseArgs, realHarness, type RealDeps } from "./harness.ts";
import { checkResults, type CaseResult } from "./results.ts";
import { runSet } from "./runset.ts";
import { loadCases as loadFixCases, runFixCase } from "../fix-projects/pipeline.ts";
import { summarize as fixSummary, summaryLine as fixLine } from "../fix-projects/score.ts";
import { loadCases as loadExplainCases, runExplainCase } from "../explain/pipeline.ts";
import { summarize as explainSummary } from "../explain/score.ts";
import { summarize as loopSummary } from "../loop-breaker/score.ts";
import { summarize as reviewSummary } from "../review-catch/score.ts";
import { summarizeAim } from "../show-me-how/aim.ts";

const KEY = "sk-ant-api03-evals-harness-test-0123456789";
const BIN = "/bundled/claude";
const REF = { service: "companion-test-evals", account: "anthropic" };
const AGENT_INIT = ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", "TodoWrite"];
const SONNET = "claude-sonnet-5-5";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-evals-${l}-`))); made.push(d); return d; };

/** A stand in for the SDK's query: system/init (listing the tools the options ask for), one reply, a result. */
type Reply = { text?: string; usage?: Record<string, number>; usd?: number; init?: Record<string, unknown> };
function stubSdk(reply: (options: Record<string, any>, n: number) => Reply = () => ({ text: "ok" })) {
  const calls: Record<string, any>[] = [];
  const fn = (params: { prompt: unknown; options?: Record<string, any> }) => {
    const options = params.options ?? {};
    calls.push(options);
    const n = calls.length;
    const r = reply(options, n);
    const aborted = () => options.abortController?.signal.aborted;
    return (async function* () {
      yield { type: "system", subtype: "init", session_id: `s${n}`, tools: Array.isArray(options.tools) ? options.tools : AGENT_INIT, mcp_servers: [], plugins: [], model: options.model, permissionMode: options.permissionMode ?? "default", apiKeySource: "ANTHROPIC_API_KEY", ...r.init };
      if (aborted()) throw new Error("aborted");
      if (r.text !== undefined) yield { type: "assistant", session_id: `s${n}`, message: { id: `m${n}`, content: [{ type: "text", text: r.text }], usage: r.usage ?? { input_tokens: 200, output_tokens: 20 } } };
      if (aborted()) throw new Error("aborted");
      yield { type: "result", subtype: "success", session_id: `s${n}`, total_cost_usd: r.usd ?? 0.001, usage: { input_tokens: 200, output_tokens: 20 } };
    })();
  };
  return { fn, calls };
}

/** Everything realHarness reads from the world, as stand ins. */
function deps(query: RealDeps["query"], o: Partial<RealDeps> = {}) {
  const asked: unknown[] = [];
  const root = tmp("root");
  const d: RealDeps = {
    readKey: async (ref) => { asked.push(ref); return KEY; }, keyRef: REF, query, claudeBinary: () => BIN, tmpRoot: root,
    parentEnv: { PATH: "/usr/bin:/bin", HOME: tmpdir() },
    tmpDrive: { ensure: async () => tmp("drive"), wipe: async () => {} }, releaseDrive: async () => {},
    fetch: (async () => { throw new Error("no network in tests"); }) as unknown as typeof fetch,
    ...o,
  };
  return { d, asked, root };
}

const quiet = () => {};
const fine = (id: string, outcome: string, m: { usd: number; turns: number }): CaseResult => ({ id, outcome, costUsd: m.usd, turns: m.turns, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 1, notes: [] });
const drain = async (e: Engine, o: Parameters<Engine["start"]>[0]) => { const g = e.start(o); for (let n = await g.next(); !n.done; n = await g.next(undefined)); };

describe("--spend builds the real run harness", () => {
  test("every model call goes through its guards: the key read in code from the named Keychain item, the bundled binary, a throwaway Claude Code folder, no settings, strict MCP and both switches", async () => {
    const sdk = stubSdk(() => ({ text: "fine" }));
    const { d, asked, root } = deps(sdk.fn);
    const out = join(tmp("out"), "r.json");
    const { results } = await runSet({ set: "t", setDir: tmp("set"), cases: [{ id: "one" }], args: parseArgs(["--spend", "--out", out], { perCaseUsd: 0.5, totalUsd: 1 }), models: {}, summarize: () => ({}), log: quiet, harnessDeps: d,
      run: async (c, ctx) => {
        const r = await ctx.harness!.ask(DEFAULT_MODELS.fast)({ text: "Explain this.", system: "Be brief." }, ctx.signal);
        return fine(c.id, r.text === "fine" ? "fine" : "bad", ctx.meter);
      } });
    expect(asked).toEqual([REF]);
    expect(sdk.calls).toHaveLength(1);
    const o = sdk.calls[0];
    expect(o.pathToClaudeCodeExecutable).toBe(BIN);
    expect(o.settingSources).toEqual([]);
    expect(o.strictMcpConfig).toBe(true);
    expect(o.permissionMode).not.toBe("bypassPermissions");
    expect(o.env.ANTHROPIC_API_KEY).toBe(KEY);
    expect(o.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1");
    expect(o.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe("1");
    expect(String(o.env.CLAUDE_CONFIG_DIR).startsWith(join(root, "companion-realrun-claude-"))).toBe(true);
    expect(existsSync(o.env.CLAUDE_CONFIG_DIR)).toBe(false);   // the throwaway folder is removed after the run
    expect(results.mode).toBe("spend");
    expect(results.harness).toMatch(/real run harness/);
    expect(results.cases[0].outcome).toBe("fine");
    expect(results.cases[0].costUsd).toBeGreaterThan(0);
    expect(results.spentUsd).toBeGreaterThan(0);
    expect(readFileSync(out, "utf8")).not.toContain(KEY);
  });

  test("a dry run never reads the key, never builds the harness and never starts a query", async () => {
    const sdk = stubSdk();
    const { d, asked } = deps(sdk.fn);
    await runSet({ set: "t", setDir: tmp("set"), cases: [{ id: "one" }], args: parseArgs(["--out", join(tmp("out"), "r.json")], { perCaseUsd: 0.5, totalUsd: 1 }), models: {}, summarize: () => ({}), log: quiet, harnessDeps: d,
      run: async (c, ctx) => { expect(ctx.harness).toBeUndefined(); return fine(c.id, "fine", ctx.meter); } });
    expect(asked).toEqual([]);
    expect(sdk.calls).toHaveLength(0);
  });

  test("with no key in the Keychain item, --spend is refused in plain words before any case starts, and nothing is left behind", async () => {
    const sdk = stubSdk();
    const { d, root } = deps(sdk.fn, { readKey: async () => null });
    let ran = 0;
    const err = await runSet({ set: "t", setDir: tmp("set"), cases: [{ id: "one" }], args: parseArgs(["--spend"], { perCaseUsd: 0.5, totalUsd: 1 }), models: {}, summarize: () => ({}), log: quiet, harnessDeps: d,
      run: async (c, ctx) => { ran++; return fine(c.id, "fine", ctx.meter); } }).catch((e) => e);
    expect(err).toBeInstanceOf(CannotSpend);
    expect(String(err.message)).toContain("companion-test-evals");
    expect(String(err.message)).toMatch(/Nothing was spent/);
    expect(ran).toBe(0);
    expect(sdk.calls).toHaveLength(0);
    expect(readdirSync(root)).toEqual([]);
  });

  test("nothing is sent outside a case", async () => {
    const sdk = stubSdk();
    const h = await realHarness({ perCaseUsd: 0.5, totalUsd: 1 }, deps(sdk.fn).d);
    try { await expect(h.ask(DEFAULT_MODELS.fast)({ text: "x", system: "y" }, new AbortController().signal)).rejects.toBeInstanceOf(HarnessRefusal); }
    finally { await h.close?.(); }
    expect(sdk.calls).toHaveLength(0);
  });

  test("the key never reaches the results file, even in a note that carries it", async () => {
    const out = join(tmp("out"), "r.json");
    await runSet({ set: "t", setDir: tmp("set"), cases: [{ id: "one" }], args: parseArgs(["--spend", "--out", out], { perCaseUsd: 0.5, totalUsd: 1 }), models: {}, summarize: () => ({}), log: quiet, harnessDeps: deps(stubSdk().fn).d,
      run: async (c, ctx) => ({ ...fine(c.id, "fine", ctx.meter), notes: [`Companion said: bad key ${KEY}`] }) });
    expect(readFileSync(out, "utf8")).not.toContain(KEY);
    expect(readFileSync(out, "utf8")).toContain("[key hidden]");
  });

  test("an eval set runs end to end on it: Explain on the fast lane, graded by the grader model, each call guarded and counted", async () => {
    const cases = loadExplainCases().slice(0, 1);
    const good = JSON.stringify(cases[0].good);
    const grade = JSON.stringify({ correct: true, questionRight: true, plain: true, why: "true of the change and plain" });
    const sdk = stubSdk((o) => ({ text: o.model === DEFAULT_MODELS.grader ? grade : good }));
    const args = parseArgs(["--spend", "--out", join(tmp("out"), "r.json")], { perCaseUsd: 0.05, totalUsd: 1 });
    const { results } = await runSet({ set: "explain", setDir: tmp("set"), cases, args, models: {}, summarize: explainSummary, log: quiet, harnessDeps: deps(sdk.fn).d,
      run: (c, ctx) => runExplainCase(c, { ...ctx, models: args.models }) });
    expect(results.cases[0].outcome).toBe("pass");
    expect(sdk.calls.map((o) => o.model)).toEqual([DEFAULT_MODELS.fast, DEFAULT_MODELS.grader]);
    for (const o of sdk.calls) { expect(o.tools).toEqual([]); expect(o.persistSession).toBe(false); expect(o.maxTurns).toBe(1); }
    expect(results.cases[0].costUsd).toBeGreaterThan(0);
  });
});

describe("the real harness's spending stops", () => {
  // Each answer costs $0.40 by its token counts: 40,000 output tokens on Sonnet 5.5 at $10 a million.
  const costly = () => stubSdk(() => ({ text: "fine", usage: { input_tokens: 0, output_tokens: 40_000 }, usd: 0.4 }));
  // Product code that turns any failure into its own answer, as the aim eval once did: a stop must still fail the case.
  const swallowing = async (c: { id: string }, ctx: any) => {
    let text = "";
    try { text = (await ctx.harness!.ask(SONNET)({ text: "x", system: "y" }, ctx.signal)).text; } catch { text = ""; }
    return fine(c.id, text ? "fine" : "no_answer", ctx.meter);
  };
  const five = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

  test("the total stop ends a set mid way: the case that crossed it fails with its reason, and every case after it is not started", async () => {
    const sdk = costly();
    const { results } = await runSet({ set: "t", setDir: tmp("set"), cases: five, args: parseArgs(["--spend", "--per-case", "0.5", "--total", "1", "--out", join(tmp("out"), "r.json")], { perCaseUsd: 1, totalUsd: 2 }), models: {}, summarize: () => ({}), log: quiet, harnessDeps: deps(sdk.fn).d, run: swallowing });
    expect(results.cases.map((c) => c.outcome)).toEqual(["fine", "fine", "stopped", "not_started", "not_started"]);
    expect(results.cases[2].notes[0]).toMatch(/^Stopped: the total spending stop of \$1\.00 was reached/);
    expect(results.cases[2].detail?.wouldHaveBeen).toBe("no_answer");
    expect(results.cases[3].notes[0]).toMatch(/total spending stop/);
    expect(results.stopped).toMatch(/total spending stop/);
    expect(sdk.calls).toHaveLength(3);
    expect(results.spentUsd).toBeCloseTo(1.2, 6);
    expect(results.cases[2].costUsd).toBeCloseTo(0.4, 6);   // what the cut short answer cost is counted, though no answer came back
    expect(checkResults(results)).toEqual([]);
  });

  test("a case's own stop fails that case only; the run goes on unless the set says a stop ends it", async () => {
    const args = (o: string) => parseArgs(["--spend", "--per-case", "0.3", "--total", "5", "--out", join(tmp(o), "r.json")], { perCaseUsd: 1, totalUsd: 5 });
    const one = costly();
    const a = await runSet({ set: "t", setDir: tmp("set"), cases: five.slice(0, 3), args: args("o1"), models: {}, summarize: () => ({}), log: quiet, harnessDeps: deps(one.fn).d, run: swallowing });
    expect(a.results.cases.map((c) => c.outcome)).toEqual(["stopped", "stopped", "stopped"]);
    expect(a.results.cases[0].notes[0]).toMatch(/this case's spending stop of \$0\.30/);
    expect(one.calls).toHaveLength(3);
    const two = costly();
    const b = await runSet({ set: "t", setDir: tmp("set"), cases: five.slice(0, 3), args: args("o2"), models: {}, summarize: () => ({}), log: quiet, harnessDeps: deps(two.fn).d, run: swallowing, endRunOnCaseStop: true });
    expect(b.results.cases.map((c) => c.outcome)).toEqual(["stopped", "not_started", "not_started"]);
    expect(b.results.stopped).toMatch(/spending stop ended the run/);
    expect(two.calls).toHaveLength(1);
  });

  test("a refusal at system/init fails a fix case with its reason, never as a bad fix, and nothing more is started", async () => {
    const sdk = stubSdk(() => ({ text: "I fixed it.", init: { tools: ["Read", "Edit", "mcp__claude_ai_Gmail__send"] } }));
    const cases = loadFixCases().filter((c) => c.id === "rescue-failing-test" || c.id === "rescue-undefined-variable");
    const args = parseArgs(["--spend", "--out", join(tmp("out"), "r.json")], { perCaseUsd: 0.75, totalUsd: 8 });
    const { results } = await runSet({ set: "fix-projects", setDir: tmp("set"), cases, args, models: {}, summarize: fixSummary, log: quiet, harnessDeps: deps(sdk.fn).d,
      run: (c, ctx) => runFixCase(c, { ...ctx, models: args.models }) });
    expect(results.cases.map((c) => c.outcome)).toEqual(["refused", "not_started"]);
    expect(results.cases[0].notes[0]).toMatch(/^Refused by the harness: Stopped at system\/init: tools this check does not expect: mcp__claude_ai_Gmail__send/);
    expect(results.cases[0].detail?.wouldHaveBeen).toBe("not_fixed");
    expect(results.cases[1].notes[0]).toMatch(/refusal/);
    expect(results.stopped).toMatch(/refusal/);
    expect(sdk.calls).toHaveLength(1);
    const s = results.summary as ReturnType<typeof fixSummary>;
    expect(s.ran).toBe(0);
    expect(fixLine(s)).toMatch(/^Not a clean run/);
  });
});

describe("only runner/src/models.ts decides the request shape", () => {
  const ids = [...KNOWN_MODELS, "claude-haiku-4-5-20251001"];
  const pick = (o: Record<string, any>) => ({ ...(o.thinking ? { thinking: o.thinking } : {}), ...(o.effort ? { effort: o.effort } : {}) });

  test("a text call, a pointing call and an agent session carry exactly the thinking and effort models.ts names, on every model it knows", async () => {
    const sdk = stubSdk((o) => ({ text: typeof o.systemPrompt === "string" && /screenshot/.test(o.systemPrompt) ? '{"none":true}' : "ok" }));
    const h = await realHarness({ perCaseUsd: 1, totalUsd: 50 }, deps(sdk.fn).d);
    try {
      for (const model of ids) {
        const signal = h.startCase!(`shape-${model}`, 1);
        await h.ask(model)({ text: "x", system: "Answer." }, signal);
        await h.vision(model).locate({ image: { base64: "AAAA", mediaType: "image/png", w: 10, h: 10 }, question: "Where?", ocr: [] }, signal);
        await drain(h.agent(), { prompt: "p", project: tmp("p"), model, signal, budgetUsd: 0.5, authorize: async () => ({ allow: false, reason: "no" }) });
        await h.endCase!();
      }
    } finally { await h.close?.(); }
    expect(sdk.calls).toHaveLength(ids.length * 3);
    ids.forEach((model, i) => {
      const [ask, vision, agent] = sdk.calls.slice(i * 3, i * 3 + 3);
      expect([ask.model, vision.model, agent.model]).toEqual([model, model, model]);
      expect(pick(ask), model).toEqual(thinkingFor(model, "quick"));
      expect(pick(vision), model).toEqual(thinkingFor(model, "quick"));
      expect(pick(agent), model).toEqual(thinkingFor(model, "agent"));
      for (const o of [ask, vision, agent]) expect(requestProblems(model, { thinking: o.thinking, effort: o.effort, via: "sdk" }), model).toEqual([]);
    });
  });

  const answer = { content: [{ type: "text", text: "Click Save" }, { type: "tool_use", id: "t1", name: "left_click", toolset_name: "computer", input: { coordinate: [5, 5] } }], usage: { input_tokens: 1000, output_tokens: 50 }, stop_reason: "tool_use" };
  const picture = { image: { base64: "AAAA", mediaType: "image/png", w: 10, h: 10 }, question: "Where is Save?", ocr: [] };

  test("the computer use lane sends the Messages API exactly the shape models.ts gives, with the key read in code, metered from its usage", async () => {
    const sent: { url: string; body: any; headers: any }[] = [];
    const fetchStub = (async (url: string, init: RequestInit) => { sent.push({ url, body: JSON.parse(String(init.body)), headers: init.headers }); return new Response(JSON.stringify(answer), { status: 200 }); }) as unknown as typeof fetch;
    const sdk = stubSdk();
    const h = await realHarness({ perCaseUsd: 1, totalUsd: 2 }, deps(sdk.fn, { fetch: fetchStub }).d);
    let end;
    try {
      const signal = h.startCase!("aim", 1);
      const r = await h.vision(MODELS.vision, "computer_use", MODELS.aim).locate(picture, signal);
      expect(r.point).toMatchObject({ x: 5, y: 5 });
      end = await h.endCase!();
    } finally { await h.close?.(); }
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(API_URL);
    const b = sent[0].body;
    expect(b.model).toBe(MODELS.aim);
    expect({ ...(b.thinking ? { thinking: b.thinking } : {}), ...(b.output_config ? { output_config: b.output_config } : {}) }).toEqual(apiShape(MODELS.aim, "quick"));
    expect(requestProblems(b.model, { thinking: b.thinking, effort: b.output_config?.effort, tools: b.tools, via: "api" })).toEqual([]);
    expect(sent[0].headers["x-api-key"]).toBe(KEY);
    expect(end!.spentUsd).toBeGreaterThan(0);
    expect(sdk.calls).toHaveLength(0);   // no fallback to the vision lane: the pointing lane answered
  });

  test("after a spending stop the computer use lane sends nothing more and never falls back to the other lane", async () => {
    const sent: string[] = [];
    const big = { ...answer, usage: { input_tokens: 0, output_tokens: 20_000 } };   // $0.20 on Sonnet 5.5, over a $0.05 stop
    const fetchStub = (async (url: string) => { sent.push(url); return new Response(JSON.stringify(big), { status: 200 }); }) as unknown as typeof fetch;
    const sdk = stubSdk();
    const h = await realHarness({ perCaseUsd: 0.05, totalUsd: 2 }, deps(sdk.fn, { fetch: fetchStub }).d);
    let end;
    try {
      const signal = h.startCase!("aim", 0.05);
      await expect(h.vision(MODELS.vision, "computer_use", MODELS.aim).locate(picture, signal)).rejects.toThrow(/spending stop/);
      await expect(h.vision(MODELS.vision, "computer_use", MODELS.aim).locate(picture, signal)).rejects.toThrow();
      end = await h.endCase!();
    } finally { await h.close?.(); }
    expect(sent).toHaveLength(1);
    expect(sdk.calls).toHaveLength(0);
    expect(end!.stops[0]).toMatchObject({ kind: "stopped" });
  });

  test("the eval sets keep no request rules of their own", () => {
    const root = join(import.meta.dir, "..");
    const files = ["lib", "fix-projects", "loop-breaker", "review-catch", "explain", "show-me-how"].flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(root, d, f)));
    files.push(join(root, "..", "runner", "scripts", "eval-aim.ts"));
    // No model table of its own, and no thinking, effort or output setting written out: reading a request to check it
    // against models.ts (the pointing lane's guard) is fine; deciding one is not.
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/REFUSES_THINKING_OFF|askOptions|budget_tokens|\b(thinking|effort|output_config)\s*:\s*[{"'`]|\.\.\.\s*\{\s*(thinking|effort)\b/);
    expect("askOptions" in harnessModule).toBe(false);
    expect("REFUSES_THINKING_OFF" in harnessModule).toBe(false);
  });
});

describe("in every set a stopped or refused case is counted on its own, never as a bad answer", () => {
  let n = 0;
  const c = (outcome: string, detail: Record<string, unknown> = {}): CaseResult => ({ id: `c${++n}`, outcome, costUsd: 0, turns: 0, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 0, notes: [], detail });
  test("each set's rates leave them out, and its counts name them", () => {
    const fix = fixSummary([c("fixed"), c("stopped"), c("refused")]);
    expect(fix).toMatchObject({ ran: 1, goodRate: 1 });
    expect(fix.counts).toMatchObject({ stopped: 1, refused: 1 });
    const loop = loopSummary([c("fixed_first", { timing: "not_needed", expect: "fix" }), c("stopped", { timing: "missed", expect: "fix" }), c("refused", { expect: "ask" })]);
    expect(loop).toMatchObject({ ran: 1, cardRightRate: 1, askRate: null });
    const review = reviewSummary([c("caught", { label: "risky" }), c("stopped", { label: "risky" }), c("refused", { label: "harmless" })]);
    expect(review).toMatchObject({ catchRate: 1, falseAlarmRate: null });
    const explain = explainSummary([c("pass", { correct: true, plain: true, twoLines: true, question: true }), c("stopped"), c("refused")]);
    expect(explain.passRate).toBe(1);
    const aim = summarizeAim([c("snapped", { set: "hard" }), c("stopped", { set: "hard" }), c("refused", { set: "basic" }), c("error", { set: "hard" })]);
    expect(aim).toMatchObject({ asked: 1, hard: { asked: 1, snapped: 1, raw: 1 }, basic: { asked: 0 } });
    expect(aim.counts).toMatchObject({ stopped: 1, refused: 1, error: 1 });
  });
});
