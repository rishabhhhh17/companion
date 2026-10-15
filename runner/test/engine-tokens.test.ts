// How many tokens a task used, reported with its cost as the task goes. The real engine reads them from each SDK result's
// own main loop usage; the scripted engine plays them back. A real run is still owed.
// Not from the per model totals: the SDK says those continue from the saved totals when a conversation is continued, and
// Companion continues conversations all the time (the fix loop, every Drive step), so each round would count the ones
// before it again. The cost carries on the same way; engine-cost.test.ts covers how only each round's own spend is booked.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SdkEngine } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step, type Turn } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-tok-${l}-`))); made.push(d); return d; };

const fake = (msgs: any[]) => ((_p: any) => (async function* () { for (const m of msgs) yield m; })()) as any;
const assistant = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }], usage: { input_tokens: 999, output_tokens: 999 } } });
const mu = (input: number, cacheWrite: number, cacheRead: number, output: number) => ({ inputTokens: input, cacheCreationInputTokens: cacheWrite, cacheReadInputTokens: cacheRead, outputTokens: output, webSearchRequests: 0, costUSD: 0, contextWindow: 0, maxOutputTokens: 0 });
const turns = async (msgs: any[]) => {
  const out: Turn[] = [];
  const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fake(msgs) });
  for await (const t of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: async () => ({ allow: true, reason: "" }), budgetUsd: 3 } as any)) out.push(t);
  return out;
};

describe("the real engine reports tokens", () => {
  const usage = (i: number, w: number, r: number, o: number) => ({ input_tokens: i, cache_creation_input_tokens: w, cache_read_input_tokens: r, output_tokens: o });
  test("from each result's own usage (one round each), with cache writes counted as input", async () => {
    const t = await turns([
      assistant("hi"), { type: "result", subtype: "success", total_cost_usd: 0.02, usage: usage(100, 20, 500, 30) },
      assistant("more"), { type: "result", subtype: "success", total_cost_usd: 0.05, usage: usage(50, 0, 400, 20) },
    ]);
    expect(t.filter((x) => x.usage).map((x) => x.usage)).toEqual([{ in: 120, cacheRead: 500, out: 30 }, { in: 50, cacheRead: 400, out: 20 }]);
  });
  test("an assistant message's own usage is not counted (the result holds it, and one reply can come as several messages)", async () => {
    const t = await turns([assistant("hi"), assistant("hi again"), { type: "result", subtype: "success", total_cost_usd: 0.01, usage: usage(1, 0, 2, 3) }]);
    expect(t[0].usage).toBeUndefined(); expect(t[1].usage).toBeUndefined();
    expect(t[2].usage).toEqual({ in: 1, cacheRead: 2, out: 3 });
  });
  test("a continued conversation's carried over totals are not counted again", async () => {
    const t = await turns([{ type: "result", subtype: "success", total_cost_usd: 0.01, usage: usage(7, 3, 40, 9), modelUsage: { m: mu(90_000, 0, 800_000, 7_000) } }]);
    expect(t[0].usage).toEqual({ in: 10, cacheRead: 40, out: 9 });
  });
  test("a result with no usage at all reports none, rather than a made up zero", async () => {
    const t = await turns([{ type: "result", subtype: "success", total_cost_usd: 0.01 }]);
    expect(t[0].usage).toBeUndefined();
  });
  test("bad numbers are never passed on", async () => {
    const t = await turns([{ type: "result", subtype: "success", total_cost_usd: 0.01, usage: { input_tokens: -5, cache_read_input_tokens: Number.NaN, cache_creation_input_tokens: "x", output_tokens: 4 } }]);
    expect(t[0].usage).toEqual({ in: 0, cacheRead: 0, out: 4 });
  });
});

describe("the task's cost updates carry the tokens", () => {
  const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
  const bad = (): LadderResult => { const s = { rung: "checks", label: "Building", status: "failed", detail: "boom", ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
  const w = (f: string, usage?: Turn["usage"]): Step => ({ tool: { name: "Write", input: { file_path: f, content: "x" } }, costUsd: 0.01, ...(usage ? { usage } : {}) });
  function run(rounds: Step[][], proofs: LadderResult[]) {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    let n = 0;
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
    return { events, go: () => runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "p", model: "m", budgetUsd: 3 }) };
  }
  const tokens = (e: Event[]) => e.filter((x) => x.type === "cost.update").map((x: any) => x.tokens);

  test("they add up as the task goes", async () => {
    const r = run([[w("one.txt", { in: 100, cacheRead: 1000, out: 20 }), w("two.txt"), w("three.txt", { in: 50, cacheRead: 500, out: 10 })]], [ok()]);
    await r.go();
    expect(tokens(r.events)).toEqual([{ in: 100, cacheRead: 1000, out: 20 }, { in: 100, cacheRead: 1000, out: 20 }, { in: 150, cacheRead: 1500, out: 30 }]);
  });
  test("and keep adding up across a follow up after a failed check", async () => {
    const r = run([[w("one.txt", { in: 100, cacheRead: 0, out: 20 })], [w("two.txt", { in: 30, cacheRead: 200, out: 5 })]], [bad(), ok()]);
    await r.go();
    expect(tokens(r.events).at(-1)).toEqual({ in: 130, cacheRead: 200, out: 25 });
  });
});
