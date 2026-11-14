// M89: the usage runway (research feature 5; complaints F1 to F9 in research-1113/user-needs.md, the loudest group: Codex
// threads of about 624, 324 and 210 comments, and Anthropic's own "hitting usage limits in Claude Code way faster than
// expected") and jobs saved for after the reset. Only what the pinned SDK really reports (m89-runway-spike.test.ts): the
// plan's rate_limit_event, or a request turned away. Fake query functions and temporary folders only; no Claude starts.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";
import { changed, fromRateLimitEvent, fromRetry, limitHit, percentOf } from "../src/runway.ts";
import { SdkEngine } from "../src/sdkEngine.ts";
import { MAX_PROMPT, MAX_SAVED, SavedJobs } from "../src/savedjobs.ts";
import { AgentRunner } from "../src/agent.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Engine, EngineOptions, ToolResult, Turn } from "../src/engine.ts";
import { Database } from "bun:sqlite";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m89r-${l}-`))); made.push(d); return d; };
const RESET = Math.floor(Date.UTC(2030, 0, 1, 15, 40) / 1000);
const ev = (info: Record<string, unknown>) => ({ type: "rate_limit_event", rate_limit_info: info, uuid: "u", session_id: "s" });

describe("reading what Claude Code says about the limit", () => {
  test("the plan's event: allowed is ok, allowed_warning is near, rejected is out, with the share used and the reset", () => {
    expect(fromRateLimitEvent(ev({ status: "allowed", utilization: 0.4, resetsAt: RESET, rateLimitType: "seven_day" }))).toEqual({ state: "ok", source: "plan", usedPct: 40, resetsAt: new Date(RESET * 1000).toISOString(), window: "seven_day" });
    expect(fromRateLimitEvent(ev({ status: "allowed_warning", utilization: 0.91 }))).toEqual({ state: "near", source: "plan", usedPct: 91 });
    expect(fromRateLimitEvent(ev({ status: "rejected", resetsAt: RESET, rateLimitType: "five_hour" }))).toMatchObject({ state: "out", window: "five_hour" });
  });
  test("a window it does not know is 'other'; a status it does not know, or anything that is not the event, is nothing", () => {
    expect(fromRateLimitEvent(ev({ status: "allowed", rateLimitType: "per_minute_mystery" }))?.window).toBe("other");
    expect(fromRateLimitEvent(ev({ status: "maybe" }))).toBeNull();
    expect(fromRateLimitEvent({ type: "assistant" })).toBeNull();
    expect(fromRateLimitEvent(null)).toBeNull();
  });
  test("the share used is a whole percent from 0 to 100, whether it comes as a fraction or a percent; nonsense is left out", () => {
    expect(percentOf(0.913)).toBe(91);
    expect(percentOf(1)).toBe(100);
    expect(percentOf(72)).toBe(72);
    expect(percentOf(140)).toBe(100);
    for (const bad of [-1, Number.NaN, "50", null]) expect(percentOf(bad)).toBeUndefined();
  });
  test("a reset time that makes no sense is left out (never a date in the year 50000)", () => {
    expect(fromRateLimitEvent(ev({ status: "allowed", resetsAt: 12 }))?.resetsAt).toBeUndefined();
    expect(fromRateLimitEvent(ev({ status: "allowed", resetsAt: RESET * 1000 }))?.resetsAt).toBe(new Date(RESET * 1000).toISOString());
  });
  test("api_retry: only a 429 or rate_limit is the person's limit; overloaded or a server error is not", () => {
    expect(fromRetry({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, retry_delay_ms: 1500, error_status: 429, error: "rate_limit" })).toEqual({ state: "out", source: "limit_hit", retryInS: 2 });
    expect(fromRetry({ type: "system", subtype: "api_retry", error_status: 529, error: "overloaded" })).toBeNull();
    expect(fromRetry({ type: "system", subtype: "api_retry", error_status: 500, error: "server_error" })).toBeNull();
    expect(fromRetry({ type: "system", subtype: "init" })).toBeNull();
  });
  test("the same plan reading is not told twice; a new number, state or reset is; every limit hit is news", () => {
    const a = fromRateLimitEvent(ev({ status: "allowed", utilization: 0.5 }))!;
    expect(changed(null, a)).toBe(true);
    expect(changed(a, { ...a })).toBe(false);
    expect(changed(a, { ...a, usedPct: 51 })).toBe(true);
    expect(changed(a, { ...a, state: "near" })).toBe(true);
    expect(changed(limitHit(), limitHit())).toBe(true);
  });
  test("every reading fits the protocol event, with numbers and times only", () => {
    for (const r of [fromRateLimitEvent(ev({ status: "allowed_warning", utilization: 0.91, resetsAt: RESET, rateLimitType: "five_hour" }))!, fromRetry({ type: "system", subtype: "api_retry", error: "rate_limit", retry_delay_ms: 30_000 })!, limitHit()]) {
      expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "usage.runway", ...r })).ok).toBe(true);
    }
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "usage.runway", state: "near", source: "plan", org: "acme" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "usage.runway", state: "near", source: "plan", usedPct: 101 })).ok).toBe(false);
  });
});

describe("the real engine passes the readings on, and keeps working", () => {
  const fakeQuery = (messages: any[]) => () => (async function* () { for (const m of messages) yield m; })();
  const opts = (got: unknown[]) => ({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: async () => ({ allow: true, reason: "" }), budgetUsd: 3, runway: (r: unknown) => got.push(r) }) as any;
  test("a rate_limit_event and an api_retry 429 are told, and are never shown as the agent's words", async () => {
    const got: unknown[] = [];
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fakeQuery([
      ev({ status: "allowed_warning", utilization: 0.9, resetsAt: RESET, rateLimitType: "five_hour" }),
      { type: "system", subtype: "api_retry", attempt: 1, max_retries: 3, retry_delay_ms: 2000, error_status: 429, error: "rate_limit", uuid: "u", session_id: "s" },
      { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
      { type: "result", subtype: "success", total_cost_usd: 0.01, is_error: false },
    ]) as any });
    const turns: Turn[] = [];
    for await (const t of e.start(opts(got))) turns.push(t);
    expect(got).toEqual([{ state: "near", source: "plan", usedPct: 90, resetsAt: new Date(RESET * 1000).toISOString(), window: "five_hour" }, { state: "out", source: "limit_hit", retryInS: 2 }]);
    expect(turns.filter((t) => t.text).map((t) => t.text)).toEqual(["done"]);
  });
  test("a reply that ended on rate_limit is told as a limit hit, and the turn still fails as before", async () => {
    const got: unknown[] = [];
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fakeQuery([
      { type: "assistant", error: "rate_limit", message: { content: [{ type: "text", text: "API Error: Request rejected (429)" }] } },
      { type: "result", subtype: "success", total_cost_usd: 0, is_error: true, result: "API Error: Request rejected (429)" },
    ]) as any });
    await expect((async () => { for await (const _ of e.start(opts(got))) { /* drain */ } })()).rejects.toThrow();
    expect(got).toEqual([{ state: "out", source: "limit_hit" }]);
  });
  test("a listener that throws never breaks the run", async () => {
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fakeQuery([ev({ status: "allowed" }), { type: "result", subtype: "success", total_cost_usd: 0.01, is_error: false }]) as any });
    const turns: Turn[] = [];
    for await (const t of e.start({ ...opts([]), runway: () => { throw new Error("boom"); } })) turns.push(t);
    expect(turns.length).toBe(1);
  });
});

/** An engine that says what the plan says about the limit, then finishes. */
class RunwayEngine implements Engine {
  readonly executesTools = true;
  constructor(private readings: unknown[]) {}
  async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    for (const r of this.readings) o.runway?.(r as never);
    yield { text: "done", costUsd: 0.01, sessionId: "s1" };
  }
}

describe("the runner tells the pages, once per change", () => {
  test("usage.runway goes out when the reading changes, not on every reply", async () => {
    const events: Event[] = [];
    const near = { state: "near", source: "plan", usedPct: 91, resetsAt: new Date(RESET * 1000).toISOString(), window: "five_hour" };
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new RunwayEngine([near, near, { ...near, usedPct: 93 }]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project: tmp("p"), agent: "a", mode: "drive", prompt: "do it", model: "m", budgetUsd: 3 });
    const told = events.filter((e) => e.type === "usage.runway") as any[];
    expect(told.map((e) => e.usedPct)).toEqual([91, 93]);
    for (const e of told) expect(parseEvent(JSON.stringify(e)).ok).toBe(true);
  });
});

describe("jobs saved for after the reset", () => {
  test("saved, listed newest first, dropped by id, and only in their own project", () => {
    const s = new SavedJobs(new Database(":memory:"));
    const a = s.save("/p", "job", "Add a contact form", "2026-11-14T13:00:00.000Z", "2026-11-14T15:40:00.000Z")!;
    const b = s.save("/p", "rescue", "", "2026-11-14T13:05:00.000Z")!;
    s.save("/other", "job", "Something else", "2026-11-14T13:06:00.000Z");
    expect(s.list("/p").map((j) => j.id)).toEqual([b.id, a.id]);
    expect(s.list("/p")[1]).toEqual({ id: a.id, kind: "job", prompt: "Add a contact form", savedAt: "2026-11-14T13:00:00.000Z", resetsAt: "2026-11-14T15:40:00.000Z" });
    expect(s.drop("/other", a.id)).toBe(false);
    expect(s.drop("/p", a.id)).toBe(true);
    expect(s.list("/p").map((j) => j.id)).toEqual([b.id]);
    expect(s.drop("/p", "1; DROP TABLE saved_jobs")).toBe(false);
  });
  test("a key in the words is hidden before it is kept; the words are cut at the most kept; an empty job is not kept", () => {
    const s = new SavedJobs(new Database(":memory:"));
    const j = s.save("/p", "job", "Use sk-ant-api03-abcdefghijklmnopqrstuvwx to call the API", "2026-11-14T13:00:00.000Z")!;
    expect(j.prompt).not.toContain("sk-ant-api03-abcdefghijklmnop");
    expect(s.save("/p", "job", "x".repeat(MAX_PROMPT + 50), "2026-11-14T13:00:00.000Z")!.prompt.length).toBe(MAX_PROMPT);
    expect(s.save("/p", "job", "   ", "2026-11-14T13:00:00.000Z")).toBeNull();
  });
  test(`at most ${MAX_SAVED} per project: the oldest go`, () => {
    const s = new SavedJobs(new Database(":memory:"));
    for (let i = 0; i < MAX_SAVED + 3; i++) s.save("/p", "job", `job ${i}`, "2026-11-14T13:00:00.000Z");
    const l = s.list("/p");
    expect(l.length).toBe(MAX_SAVED);
    expect(l[0].prompt).toBe(`job ${MAX_SAVED + 2}`);
    expect(l.at(-1)!.prompt).toBe("job 3");
  });
  test("through the runner: save, list and drop answer with jobs.saved, which fits the protocol", async () => {
    const events: Event[] = [];
    const project = tmp("p");
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new RunwayEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
    const cmd = async (c: Record<string, unknown>) => { const line = JSON.stringify({ v: 1, id: `c${Math.random()}`, project, ...c }); const r = parseCommand(line); expect(r.ok, line).toBe(true); if (r.ok) await runner.handle(r.msg); };
    await cmd({ type: "jobs.save", kind: "job", prompt: "Add a contact form", resetsAt: "2026-11-14T15:40:00.000Z" });
    await cmd({ type: "jobs.save", kind: "rescue", prompt: "" });
    const saved = (events.filter((e) => e.type === "jobs.saved") as any[]).at(-1);
    expect(saved.jobs.map((j: any) => j.kind)).toEqual(["rescue", "job"]);
    expect(parseEvent(JSON.stringify(saved)).ok).toBe(true);
    await cmd({ type: "jobs.drop", job: saved.jobs[1].id });
    expect((events.filter((e) => e.type === "jobs.saved") as any[]).at(-1).jobs.map((j: any) => j.kind)).toEqual(["rescue"]);
    await cmd({ type: "jobs.list" });
    expect((events.filter((e) => e.type === "jobs.saved") as any[]).at(-1).jobs.length).toBe(1);
  });
  test("the protocol refuses a job with no words (unless it is Rescue), too many words, or a bad id", () => {
    const c = (x: Record<string, unknown>) => parseCommand(JSON.stringify({ v: 1, id: "c", project: "/p", ...x })).ok;
    expect(c({ type: "jobs.save", kind: "job", prompt: "" })).toBe(false);
    expect(c({ type: "jobs.save", kind: "rescue", prompt: "" })).toBe(true);
    expect(c({ type: "jobs.save", kind: "job", prompt: "x".repeat(4001) })).toBe(false);
    expect(c({ type: "jobs.save", kind: "deploy", prompt: "x" })).toBe(false);
    expect(c({ type: "jobs.drop", job: "12" })).toBe(false);
    expect(c({ type: "jobs.save", kind: "job", prompt: "x", resetsAt: "soon" })).toBe(false);
  });
});
