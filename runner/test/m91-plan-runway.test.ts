// M91: the real plan usage reading. One real run on 14 Nov 2026 (the founder's own plan login, approved in chat) showed what
// the plan route really sends (fixtures/real-run-1114/plan-route-say-ok.json): a rate_limit_event on every turn, even with
// status "allowed"; no top level utilization; the share used per window as a fraction (0 to 1) with its reset in seconds, in
// unifiedWindows. runway.ts reads that, and shows the window closest to its limit. Fixtures and fake query functions only;
// no Claude starts.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, type Event } from "../../protocol/index.ts";
import { fractionPct, fromRateLimitEvent } from "../src/runway.ts";
import { SdkEngine } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Engine, EngineOptions, ToolResult, Turn } from "../src/engine.ts";

const REAL = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "real-run-1114", "plan-route-say-ok.json"), "utf8"));
const iso = (s: number) => new Date(s * 1000).toISOString();
const ev = (info: Record<string, unknown>) => ({ type: "rate_limit_event", rate_limit_info: info, uuid: "u", session_id: "s" });
const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m91-${l}-`))); made.push(d); return d; };

describe("the plan route's real event", () => {
  test("the real run's event: room left, the week is the window closest to its limit, 46% used, with its own reset", () => {
    expect(fromRateLimitEvent(REAL.rate_limit_event)).toEqual({ state: "ok", source: "plan", usedPct: 46, resetsAt: iso(1794888000), window: "seven_day" });
  });
  test("the fixture keeps the real shape: no top level utilization, fractions per window, nothing personal", () => {
    const i = REAL.rate_limit_event.rate_limit_info;
    expect(i.utilization).toBeUndefined();
    expect(Object.keys(i.unifiedWindows)).toEqual(["five_hour", "seven_day"]);
    expect(REAL.order).toEqual(["system/init", "assistant", "assistant", "rate_limit_event", "result/success"]);
    expect(JSON.stringify(REAL)).not.toMatch(/@|org_[a-z0-9]{6,}|sk-ant|account_uuid|email/i);
  });
  test("the 5 hour window is shown when it is the closer one", () => {
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "five_hour", resetsAt: 1794646200, unifiedWindows: { five_hour: { utilization: 0.83, resetsAt: 1794646200 }, seven_day: { utilization: 0.46, resetsAt: 1794888000 } } })))
      .toEqual({ state: "ok", source: "plan", usedPct: 83, resetsAt: iso(1794646200), window: "five_hour", nextPct: 46, nextResetsAt: iso(1794888000), nextWindow: "seven_day" });
  });
  test("allowed is room, allowed_warning is near, rejected is out", () => {
    const w = { five_hour: { utilization: 0.2, resetsAt: 1794646200 }, seven_day: { utilization: 0.46, resetsAt: 1794888000 } };
    expect(fromRateLimitEvent(ev({ status: "allowed", unifiedWindows: w }))?.state).toBe("ok");
    expect(fromRateLimitEvent(ev({ status: "allowed_warning", unifiedWindows: w }))?.state).toBe("near");
    expect(fromRateLimitEvent(ev({ status: "rejected", unifiedWindows: w }))?.state).toBe("out");
  });
  test("near or reached: the window Claude named is shown, with the reset that lets work go on", () => {
    const w = { five_hour: { utilization: 0.98, resetsAt: 1794646200 }, seven_day: { utilization: 0.99, resetsAt: 1794888000 } };
    expect(fromRateLimitEvent(ev({ status: "rejected", rateLimitType: "five_hour", resetsAt: 1794646200, unifiedWindows: w }))).toEqual({ state: "out", source: "plan", usedPct: 98, resetsAt: iso(1794646200), window: "five_hour", nextPct: 99, nextResetsAt: iso(1794888000), nextWindow: "seven_day" });
    // Allowed: the closest window, whichever Claude named.
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "five_hour", unifiedWindows: w }))?.window).toBe("seven_day");
  });
  test("a tie goes to the window Claude named", () => {
    const w = { five_hour: { utilization: 0.5, resetsAt: 1794646200 }, seven_day: { utilization: 0.5, resetsAt: 1794888000 } };
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "seven_day", unifiedWindows: w }))?.window).toBe("seven_day");
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "five_hour", unifiedWindows: w }))?.window).toBe("five_hour");
  });
  test("a window's share is always a fraction: 1.02 is 100%, never 1%", () => {
    expect(fractionPct(0.2)).toBe(20);
    expect(fractionPct(0.455)).toBe(46);
    expect(fractionPct(1)).toBe(100);
    expect(fractionPct(1.02)).toBe(100);
    expect(fractionPct(0)).toBe(0);
    for (const bad of [-0.1, Number.NaN, "0.5", null, undefined]) expect(fractionPct(bad)).toBeUndefined();
    expect(fromRateLimitEvent(ev({ status: "rejected", unifiedWindows: { five_hour: { utilization: 1.02, resetsAt: 1794646200 } } }))?.usedPct).toBe(100);
  });
  test("broken window entries are left out; with none left, the top level fields are read as before", () => {
    const r = fromRateLimitEvent(ev({ status: "allowed_warning", utilization: 0.91, resetsAt: 1794646200, rateLimitType: "five_hour", unifiedWindows: { five_hour: { utilization: "lots" }, seven_day: null, x: 3 } }));
    expect(r).toEqual({ state: "near", source: "plan", usedPct: 91, resetsAt: iso(1794646200), window: "five_hour" });
    expect(fromRateLimitEvent(ev({ status: "allowed", unifiedWindows: "nope" }))).toEqual({ state: "ok", source: "plan" });
  });
  test("a top level utilization is still read alongside the windows, for the window it names", () => {
    expect(fromRateLimitEvent(ev({ status: "allowed", utilization: 0.7, rateLimitType: "seven_day_opus", resetsAt: 1794888000, unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: 1794646200 } } })))
      .toEqual({ state: "ok", source: "plan", usedPct: 70, resetsAt: iso(1794888000), window: "seven_day_opus" });
  });
  test("a window with no reset of its own takes the top level reset only when it is the window Claude named", () => {
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "seven_day", resetsAt: 1794888000, unifiedWindows: { seven_day: { utilization: 0.46 } } }))?.resetsAt).toBe(iso(1794888000));
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "five_hour", resetsAt: 1794646200, unifiedWindows: { seven_day: { utilization: 0.46 } } }))?.resetsAt).toBeUndefined();
  });
  test("a window name it does not know is 'other'", () => {
    expect(fromRateLimitEvent(ev({ status: "allowed", unifiedWindows: { seven_day_overage_included: { utilization: 0.3, resetsAt: 1794888000 } } }))?.window).toBe("other");
  });
  test("the M91 review: the next window is kept, so the reading outlives the reset of the one shown", () => {
    // 5 hour 85% (resets first), week 84%: the 5 hour window is shown, and the week is carried as the next one.
    const r = fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "five_hour", unifiedWindows: { five_hour: { utilization: 0.85, resetsAt: 1794646200 }, seven_day: { utilization: 0.84, resetsAt: 1794888000 } } }));
    expect(r).toEqual({ state: "ok", source: "plan", usedPct: 85, resetsAt: iso(1794646200), window: "five_hour", nextPct: 84, nextResetsAt: iso(1794888000), nextWindow: "seven_day" });
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "usage.runway", ...r })).ok).toBe(true);
    // The fullest window resets last: nothing to carry.
    expect(fromRateLimitEvent(REAL.rate_limit_event)).not.toHaveProperty("nextPct");
    // Of the windows that reset later, the fullest is carried.
    const three = fromRateLimitEvent(ev({ status: "allowed", unifiedWindows: { five_hour: { utilization: 0.9, resetsAt: 1794646200 }, seven_day: { utilization: 0.5, resetsAt: 1794888000 }, seven_day_opus: { utilization: 0.6, resetsAt: 1794800000 } } }));
    expect(three).toMatchObject({ window: "five_hour", nextPct: 60, nextWindow: "seven_day_opus", nextResetsAt: iso(1794800000) });
    // A later window with no reset of its own is not carried (it could not say when it ends).
    expect(fromRateLimitEvent(ev({ status: "allowed", unifiedWindows: { five_hour: { utilization: 0.9, resetsAt: 1794646200 }, seven_day: { utilization: 0.5 } } }))).not.toHaveProperty("nextPct");
  });
  test("the M91 review: near or reached on a window with no share of its own is that window, never a fuller other one", () => {
    const w = { five_hour: { utilization: 0.4, resetsAt: 1794646200 }, seven_day: { utilization: 0.6, resetsAt: 1794888000 } };
    expect(fromRateLimitEvent(ev({ status: "rejected", rateLimitType: "seven_day_opus", resetsAt: 1794900000, unifiedWindows: w })))
      .toEqual({ state: "out", source: "plan", resetsAt: iso(1794900000), window: "seven_day_opus" });
    expect(fromRateLimitEvent(ev({ status: "allowed_warning", rateLimitType: "seven_day_opus", resetsAt: 1794700000, unifiedWindows: w })))
      .toEqual({ state: "near", source: "plan", resetsAt: iso(1794700000), window: "seven_day_opus", nextPct: 60, nextResetsAt: iso(1794888000), nextWindow: "seven_day" });
    // Allowed: the fullest window as before, whichever was named.
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "seven_day_opus", resetsAt: 1794900000, unifiedWindows: w }))?.window).toBe("seven_day");
  });
  test("the reading fits the protocol event, numbers and times only", () => {
    const r = fromRateLimitEvent(REAL.rate_limit_event)!;
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "usage.runway", ...r })).ok).toBe(true);
    expect(Object.keys(r).sort()).toEqual(["resetsAt", "source", "state", "usedPct", "window"]);
  });
});

describe("through the engine and the runner, as the real run sent it", () => {
  const fakeQuery = (messages: any[]) => () => (async function* () { for (const m of messages) yield m; })();
  test("the real order of messages: the reading is passed on once, never shown as the agent's words", async () => {
    const got: unknown[] = [];
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fakeQuery([
      { ...REAL.init, session_id: "s" },
      { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
      { type: "assistant", message: { content: [] } },
      REAL.rate_limit_event,
      { type: "result", subtype: "success", total_cost_usd: 0, is_error: false, result: "ok" },
    ]) as any });
    const turns: Turn[] = [];
    for await (const t of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: async () => ({ allow: true, reason: "" }), budgetUsd: 3, runway: (r: unknown) => got.push(r) } as any)) turns.push(t);
    expect(got).toEqual([{ state: "ok", source: "plan", usedPct: 46, resetsAt: iso(1794888000), window: "seven_day" }]);
    expect(turns.filter((t) => t.text).map((t) => t.text)).toEqual(["ok"]);
  });
  test("the event on every turn with the same numbers is told to the pages once", async () => {
    class Every implements Engine {
      readonly executesTools = true;
      async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
        for (let i = 0; i < 3; i++) o.runway?.(fromRateLimitEvent(REAL.rate_limit_event)!);
        yield { text: "done", costUsd: 0, sessionId: "s1" };
      }
    }
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new Every(), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project: tmp("p"), agent: "a", mode: "drive", prompt: "do it", model: "m", budgetUsd: 3 });
    const told = events.filter((e) => e.type === "usage.runway") as any[];
    expect(told.length).toBe(1);
    expect(told[0]).toMatchObject({ state: "ok", source: "plan", usedPct: 46, window: "seven_day" });
  });
});
