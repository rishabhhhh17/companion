// What a continued conversation costs. The pinned SDK says a resumed session's results carry on from the total its saved
// conversation holds, so the first result of a continued round already includes the rounds before it (sdk.d.ts, the
// total_cost_usd note). Companion continues conversations all the time: every fix after a failed check, and every Drive
// step (each one continues the plan's conversation). Without care, spend already counted is booked again, and the error
// grows with every step: costs shown too high, the daily limit reached early, plans stopped "over budget" early.
// All with a fake SDK that behaves the way the SDK's own notes say. A real run with a real API key is still owed.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SdkEngine, SessionTotals } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import type { Turn } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-cost-${l}-`))); made.push(d); return d; };
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

// A fake SDK. Each call spends the next amount. A call that continues a conversation (resume) carries on from the total
// that conversation saved, as the pinned SDK says; `savesTotal: false` is a saved conversation that held no total. With
// `write`, a call that is not planning writes one file, through the safety hook, as the real SDK's tools do.
function fakeSdk(spends: number[][], o: { savesTotal?: boolean; say?: (i: number) => string; idPrefix?: string; write?: boolean } = {}) {
  const saved = new Map<string, number>();
  const calls: any[] = [];
  const prefix = o.idPrefix ?? `s${Math.random().toString(36).slice(2)}-`;
  const q = (params: any) => {
    const opt = params.options; const i = calls.push(opt) - 1;
    const id: string = opt.resume ?? `${prefix}${i + 1}`;
    let total = opt.resume && o.savesTotal !== false ? saved.get(opt.resume) ?? 0 : 0;
    return (async function* () {
      yield { type: "system", subtype: "init", session_id: id };
      if (o.write && opt.permissionMode !== "plan") {
        const file = join(opt.cwd, `f${i}.txt`), t = `t${i}`;
        await opt.hooks.PreToolUse[0].hooks[0]({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: file, content: String(i) }, tool_use_id: t }, t, { signal: opt.abortController.signal });
        writeFileSync(file, String(i));
        await opt.hooks.PostToolUse[0].hooks[0]({ hook_event_name: "PostToolUse", tool_use_id: t }, t, { signal: opt.abortController.signal });
      }
      for (const spend of spends[i] ?? [0]) {
        yield { type: "assistant", session_id: id, message: { content: [{ type: "text", text: o.say?.(i) ?? "done" }] } };
        total = r6(total + spend); saved.set(id, total);
        yield { type: "result", subtype: "success", session_id: id, total_cost_usd: total, usage: { input_tokens: 1, output_tokens: 1 } };
      }
    })();
  };
  return { q: q as any, calls, saved };
}
const engine = (f: ReturnType<typeof fakeSdk>, totals?: SessionTotals) => new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: f.q, ...(totals ? { totals } : {}) });
const costs = async (e: SdkEngine, resumeSession?: string, extra: Record<string, unknown> = {}) => {
  const out: Turn[] = [];
  for await (const t of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: async () => ({ allow: true, reason: "" }), budgetUsd: 3, ...(resumeSession ? { resumeSession } : {}), ...extra } as any)) out.push(t);
  return { usd: out.filter((t) => t.costUsd).map((t) => t.costUsd), id: out.find((t) => t.sessionId)?.sessionId };
};

describe("the real engine books only what a round itself spent", () => {
  test("a continued conversation's first result carries the earlier rounds, which are not booked again", async () => {
    const f = fakeSdk([[0.10], [0.15], [0.05, 0.07]]);
    const e = engine(f, new SessionTotals());
    const one = await costs(e);
    expect(one.usd).toEqual([0.10]);
    expect((await costs(e, one.id)).usd).toEqual([0.15]);
    expect((await costs(e, one.id)).usd).toEqual([0.05, 0.07]);
    expect(f.calls[1].resume).toBe(one.id);
  });
  test("a new engine for each round, as the app makes one per task, still knows what the conversation had cost", async () => {
    const f = fakeSdk([[0.10], [0.15]]);
    const one = await costs(engine(f));
    expect((await costs(engine(f), one.id)).usd).toEqual([0.15]);
  });
  test("a conversation that is not continued starts from nothing", async () => {
    const f = fakeSdk([[0.10], [0.20]]);
    const e = engine(f, new SessionTotals());
    await costs(e);
    expect((await costs(e)).usd).toEqual([0.20]);
  });
  test("a saved conversation that held no total starts from nothing, so its spend is still booked", async () => {
    const f = fakeSdk([[0.10], [0.04]], { savesTotal: false });
    const e = engine(f, new SessionTotals());
    const one = await costs(e);
    expect((await costs(e, one.id)).usd).toEqual([0.04]);
  });
  test("continuing a conversation this run never saw counts it from nothing (no task continues across a restart today)", async () => {
    const f = fakeSdk([[0.10]]);
    f.saved.set("from-before", 0.50);
    expect((await costs(engine(f, new SessionTotals()), "from-before")).usd).toEqual([0.60]);
  });
  test("a stop by a limit books only the round's own spend too", async () => {
    const totals = new SessionTotals();
    const first = fakeSdk([[0.10]], { idPrefix: "stop-" });
    await costs(engine(first, totals));
    const q = (() => (async function* () { yield { type: "result", subtype: "error_max_budget_usd", session_id: "stop-1", total_cost_usd: 0.18 }; })()) as any;
    let stopped: any;
    try { await costs(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q, totals }), "stop-1"); } catch (e) { stopped = e; }
    expect(stopped?.costUsd).toBe(0.08);
  });
  test("a zeroed total from a crash is not taken as what the conversation cost", async () => {
    const totals = new SessionTotals();
    await costs(engine(fakeSdk([[0.10]], { idPrefix: "crash-" }), totals));
    const q = (() => (async function* () { yield { type: "result", subtype: "error_during_execution", session_id: "crash-1", total_cost_usd: 0 }; })()) as any;
    try { await costs(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q, totals }), "crash-1"); } catch { /* the crash */ }
    expect(totals.get("crash-1")).toBe(0.10);
  });
  test("nothing is remembered about an off the record conversation (it can never be continued)", async () => {
    const totals = new SessionTotals();
    const f = fakeSdk([[0.10]], { idPrefix: "otr-" });
    expect((await costs(engine(f, totals), undefined, { offTheRecord: true })).usd).toEqual([0.10]);
    expect(totals.get("otr-1")).toBeUndefined();
  });
  test("a total that is not a number books nothing, rather than breaking the running cost", async () => {
    const q = (() => (async function* () { yield { type: "result", subtype: "success", session_id: "nan-1", total_cost_usd: "lots" }; })()) as any;
    const t: Turn[] = [];
    for await (const x of new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q, totals: new SessionTotals() }).start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: async () => ({ allow: true, reason: "" }), budgetUsd: 3 } as any)) t.push(x);
    expect(t.map((x) => x.costUsd)).toEqual([0]);
  });
  test("only so many conversations are remembered; the oldest is forgotten first", () => {
    const t = new SessionTotals(2);
    t.set("a", 1); t.set("b", 2); t.set("a", 3); t.set("c", 4);
    expect(t.get("b")).toBeUndefined(); expect(t.get("a")).toBe(3); expect(t.get("c")).toBe(4);
  });
});

// ---------- in the runner ----------

const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (): LadderResult => { const s = { rung: "checks", label: "Building", status: "failed", detail: "boom", ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
function runner(f: ReturnType<typeof fakeSdk>, proofs: LadderResult[]) {
  const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
  const events: Event[] = [];
  let n = 0;
  const r = new AgentRunner({ shadowRoot: tmp("s"), engine: engine(f, new SessionTotals()), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
  return { project, events, r };
}
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

describe("what the person is shown and charged against their limits", () => {
  test("a fix after a failed check continues the conversation, and the task costs what was really spent", async () => {
    const f = fakeSdk([[0.10], [0.15]], { write: true });
    const t = runner(f, [bad(), ok()]);
    await t.r.handle({ v: 1, id: "c", type: "agent.start", project: t.project, agent: "a", mode: "drive", prompt: "p", model: "m", budgetUsd: 3 });
    expect(f.calls[1].resume).toBeTruthy();
    expect(of(t.events, "receipt")[0].usdEstimate).toBeCloseTo(0.25, 6);
    expect(of(t.events, "cost.update").at(-1).usdEstimate).toBeCloseTo(0.25, 6);
  });
  test("a plan's steps each continue the plan's conversation, and the plan costs what was really spent", async () => {
    const f = fakeSdk([[0.05], [0.10], [0.20]], { write: true, say: (i) => (i === 0 ? '```json\n["One","Two"]\n```' : "done") });
    const t = runner(f, [ok()]);
    await Bun.sleep(100); // the project files were made a moment ago, like a real project's files
    await t.r.handle({ v: 1, id: "p1", type: "drive.plan", project: t.project, agent: "d", goal: "g", model: "m", budgetUsd: 5 });
    await t.r.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d", steps: ["One", "Two"] });
    expect(f.calls[1].resume).toBeTruthy(); expect(f.calls[2].resume).toBe(f.calls[1].resume);
    expect(of(t.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2, total: 2 });
    expect(of(t.events, "drive.done")[0].usdEstimate).toBeCloseTo(0.35, 6);
  });
  test("a plan is not stopped as over its limit by spend that was counted twice", async () => {
    // Really spent: 0.05 + 0.10 + 0.20 = 0.35, under the 0.50 limit. Counted twice it would pass 0.50 at the second step.
    const f = fakeSdk([[0.05], [0.10], [0.20]], { write: true, say: (i) => (i === 0 ? '```json\n["One","Two"]\n```' : "done") });
    const t = runner(f, [ok()]);
    await Bun.sleep(100);
    await t.r.handle({ v: 1, id: "p1", type: "drive.plan", project: t.project, agent: "d", goal: "g", model: "m", budgetUsd: 0.5 });
    await t.r.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d", steps: ["One", "Two"] });
    expect(of(t.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2 });
  });
});
