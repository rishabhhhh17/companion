// What a round cost when it is stopped (audit A1, A7, A8). With the real engine, a round's cost arrives only in its final
// result, and Stop, Stop everything and a Drive pause end the Claude Code process, so no result may ever come. The engine
// then counts what Claude used from the token counts in its messages, at list price, so the daily limit, the receipt and a
// plan's budget never miss it. All with a fake SDK that behaves the way the pinned one does when it is stopped: it throws,
// or just ends, with no result. No real Claude runs.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SdkEngine, SessionTotals } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import { EngineStop, ScriptedEngine, type Turn } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { Ledger } from "../src/ledger.ts";
import { estimateUsd } from "../src/models.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-ss-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 5000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };
const MODEL = "claude-sonnet-5-5";
const USAGE = { input_tokens: 50_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const ONE = estimateUsd(MODEL, USAGE);   // what one such reply costs at list price

// A fake SDK: replies with `replies` assistant messages (each its own request), then waits to be stopped. On a stop it
// does what `onStop` says: throw (as the pinned SDK does when its process is ended), end quietly, or send a late result.
type OnStop = "throw" | "end" | { result: string; total: number };
function fakeSdk(replies: number, onStop: OnStop, o: { repeatIds?: boolean } = {}) {
  const sent = { replies: 0 };
  const q = (params: any) => {
    const signal: AbortSignal = params.options.abortController.signal;
    return (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      for (let i = 0; i < replies; i++) {
        const id = o.repeatIds ? "msg_1" : `msg_${i + 1}`;
        yield { type: "assistant", session_id: "s1", message: { id, content: [{ type: "text", text: `working ${i}` }], usage: USAGE } };
        sent.replies++;
      }
      if (!signal.aborted) await new Promise<void>((res) => signal.addEventListener("abort", () => res(), { once: true }));
      if (onStop === "throw") throw new Error("Claude Code process aborted by user");
      if (onStop === "end") return;
      yield { type: "result", subtype: onStop.result, session_id: "s1", total_cost_usd: onStop.total, usage: { input_tokens: 1, output_tokens: 1 } };
    })();
  };
  return { q: q as any, sent };
}

function setup(sdk: ReturnType<typeof fakeSdk>) {
  const project = tmp("p"); writeFileSync(join(project, "a.txt"), "start");
  const events: Event[] = [];
  const ledger = new Ledger(":memory:");
  const engine = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: sdk.q, totals: new SessionTotals() });
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, proof: async () => ({ verdict: "passed", steps: [] }) });
  return { project, events, ledger, runner };
}
const start = (r: ReturnType<typeof setup>) => r.runner.handle({ v: 1, id: "c", type: "agent.start", project: r.project, agent: "a", mode: "drive", prompt: "do it", model: MODEL, budgetUsd: 5 });

describe("a task stopped before its result still counts what it used", () => {
  for (const how of ["throw", "end"] as const) {
    test(`Stop with no result (the engine ${how === "throw" ? "throws" : "just ends"}): the day's total and the receipt carry the estimate`, async () => {
      const sdk = fakeSdk(5, how);
      const r = setup(sdk);
      const run = start(r);
      await waitFor(() => sdk.sent.replies >= 5);
      await r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "a" });
      await run;
      const want = 5 * ONE;
      expect(want).toBeGreaterThan(0.5);
      expect(r.ledger.spentToday(r.project)).toBeCloseTo(want, 6);
      expect(of(r.events, "receipt")[0].usdEstimate).toBeCloseTo(want, 6);
      // A stop is a stop: no engine error, and the agent goes back to idle.
      expect(of(r.events, "protocol.error")).toEqual([]);
      expect(of(r.events, "agent.state").at(-1).state).toBe("idle");
    });
  }
  test("one reply that arrives as several messages with the same id is counted once", async () => {
    const sdk = fakeSdk(3, "throw", { repeatIds: true });
    const r = setup(sdk);
    const run = start(r);
    await waitFor(() => sdk.sent.replies >= 3);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop" });
    await run;
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(ONE, 6);
  });
  test("a result that lands just after Stop is booked, not dropped", async () => {
    const sdk = fakeSdk(1, { result: "success", total: 0.75 });
    const r = setup(sdk);
    const run = start(r);
    await waitFor(() => sdk.sent.replies >= 1);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "a" });
    await run;
    // The result says what the round cost, so the estimate is not added to it.
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.75, 6);
    expect(of(r.events, "receipt")[0].usdEstimate).toBeCloseTo(0.75, 6);
  });
  test("an error result caused by the stop itself is a stop, not an engine error, and its cost is booked (A7)", async () => {
    const sdk = fakeSdk(1, { result: "error_during_execution", total: 0.4 });
    const r = setup(sdk);
    const run = start(r);
    await waitFor(() => sdk.sent.replies >= 1);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "a" });
    await run;
    expect(of(r.events, "protocol.error").map((e) => e.reason)).toEqual([]);
    expect(of(r.events, "agent.state").at(-1).state).toBe("idle");
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.4, 6);
  });
  test("Rescue, stopped while Claude is thinking, counts what it used too", async () => {
    const sdk = fakeSdk(2, "throw");
    const r = setup(sdk);
    const run = r.runner.handle({ v: 1, id: "rd", type: "rescue.diagnose", project: r.project, agent: "a", model: MODEL, budgetUsd: 2 } as never);
    await waitFor(() => sdk.sent.replies >= 2);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "a" });
    await run;
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(2 * ONE, 6);
    expect(of(r.events, "protocol.error")).toEqual([]);
  });
});

describe("the engine's own count", () => {
  const drain = async (e: SdkEngine, signal: AbortSignal, unbilled: (usd: number) => void) => {
    const out: Turn[] = [];
    try { for await (const t of e.start({ prompt: "p", project: "/p", model: MODEL, signal, authorize: async () => ({ allow: true, reason: "" }), budgetUsd: 3, unbilled } as any)) out.push(t); } catch { /* the stop */ }
    return out;
  };
  test("a round that ends with its result books nothing extra", async () => {
    const q = ((_p: any) => (async function* () {
      yield { type: "assistant", session_id: "s1", message: { id: "m1", content: [{ type: "text", text: "hi" }], usage: USAGE } };
      yield { type: "result", subtype: "success", session_id: "s1", total_cost_usd: 0.2 };
    })()) as any;
    const extra: number[] = [];
    const t = await drain(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q, totals: new SessionTotals() }), new AbortController().signal, (u) => extra.push(u));
    expect(extra).toEqual([]);
    expect(t.map((x) => x.costUsd).filter(Boolean)).toEqual([0.2]);
  });
  test("an unknown model is priced as the dearest known one, never low", async () => {
    const q = ((p: any) => (async function* () {
      yield { type: "assistant", session_id: "s1", message: { id: "m1", content: [{ type: "text", text: "hi" }], usage: USAGE } };
      throw new Error("Claude Code process exited with code 1");
    })()) as any;
    const extra: number[] = [];
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q, totals: new SessionTotals() });
    try { for await (const _ of e.start({ prompt: "p", project: "/p", model: "claude-unheard-of-9", signal: new AbortController().signal, authorize: async () => ({ allow: true, reason: "" }), budgetUsd: 3, unbilled: (u: number) => extra.push(u) } as any)) { /* drain */ } } catch { /* the crash */ }
    expect(extra.length).toBe(1);
    expect(extra[0]).toBeCloseTo(estimateUsd("claude-unheard-of-9", USAGE), 9);
    expect(extra[0]).toBeGreaterThanOrEqual(estimateUsd("claude-opus-5-5", USAGE));
  });
});

describe("the second reviewer's spend is booked when it stops on a limit (A8)", () => {
  test("an EngineStop from the reviewer still counts its cost in the task", async () => {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "start");
    const events: Event[] = [];
    const ledger = new Ledger(":memory:");
    // A change to package.json is one the second reviewer reads (review.ts needsReview).
    const engine = new ScriptedEngine([[{ tool: { name: "Write", input: { file_path: "package.json", content: '{"name":"x"}' } }, costUsd: 0.01 }]]);
    const reviewer = { start: async function* (): AsyncGenerator<Turn, void, any> { yield { text: "thinking", costUsd: 0.05 }; throw new EngineStop("error_max_budget_usd: the spending limit was reached", 0.3); } };
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, reviewer, log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger,
      proof: async (ctx) => { await ctx.review?.().catch(() => null); return { verdict: "passed", steps: [] }; } });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 5 });
    const receipt = of(events, "receipt")[0];
    // The task's own turn, the reviewer's turn and what its limit stop said it cost.
    expect(receipt.usdEstimate).toBeCloseTo(0.36, 6);
    expect(ledger.spentToday(project)).toBeCloseTo(receipt.usdEstimate, 6);
  });
});
