// Second Look, wired end to end on the engine's side (M14): the secondlook.check command the shell sends after its hotkey
// (the light first, the selection read through Accessibility), the answer for the card, the day's spending and its limit,
// Stop everything, the Second Look switch, and the web search on the plain API lane, capped and priced. Every model and
// every web request here is a stand in: nothing reaches the network and nothing is spent.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { Ledger } from "../src/ledger.ts";
import { RunnerSettings } from "../src/settings.ts";
import { DirectFastLane, type DirectAuth } from "../src/direct.ts";
import { MAX_SEARCHES, WEB_SEARCH_TOOL, WEB_SEARCH_USD, estimateUsd } from "../src/models.ts";
import { SECOND_LOOK_SYSTEM, secondLook, secondLookSystem } from "../src/secondlook.ts";
import type { FastLike } from "../src/lanes.ts";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";
import { defOf } from "../../protocol/settings.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-sl-${l}-`))); made.push(d); return d; };
const sig = () => new AbortController().signal;
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const KEY = "sk-ant-api03-" + "Q".repeat(40);
const ANSWER = "Your budget: 120 × 4 = 460. Smith v. Jones (2019) settled this.";
const LOOK = JSON.stringify({ verdict: "check", items: [{ kind: "citation", claim: "Smith v. Jones (2019)", issue: "I could not find this case", verify: "Search the court's records", source: "https://courts.example.gov/smith" }], checked: ["The steps follow"], cantTell: [] });

// ---------- the price of a search ----------

describe("a web search has a price, and it is counted", () => {
  test("$10 per 1,000 searches, on top of the tokens, for any model", () => {
    expect(WEB_SEARCH_USD).toBe(0.01);
    const tokens = estimateUsd("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 100 });
    expect(estimateUsd("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 3 } })).toBeCloseTo(tokens + 0.03, 8);
    expect(estimateUsd("claude-haiku-4-5-20251001", { server_tool_use: { web_search_requests: 2 } })).toBeCloseTo(0.02, 8);
    for (const odd of [-2, Number.NaN, "3", null]) expect(estimateUsd("claude-sonnet-5-5", { server_tool_use: { web_search_requests: odd as never } })).toBe(0);
  });
  test("the price has its source written next to it", () => {
    const src = readFileSync(new URL("../src/models.ts", import.meta.url), "utf8");
    const at = src.indexOf("export const WEB_SEARCH_USD");
    expect(src.slice(Math.max(0, at - 600), at)).toMatch(/web-search-tool/);
  });
  test("the cap on searches: a small usual value, never more than MAX_SEARCHES, and 0 turns searching off", () => {
    const d = defOf("secondLook.searches")!;
    expect(d.kind).toBe("number");
    expect(d.default).toBe(3);
    expect(d.min).toBe(0);
    expect(d.max).toBe(MAX_SEARCHES);
    expect(MAX_SEARCHES).toBeLessThanOrEqual(5);
    // F28: off until the person turns it on in Settings.
    expect(defOf("secondLook.on")).toMatchObject({ kind: "switch", default: false });
  });
});

// ---------- the plain API lane, with a search ----------

type Seen = { url: string; body: any };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
function rig(answer: (s: Seen) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const fetchFn = (async (url: any, init?: RequestInit) => { const s = { url: String(url), body: JSON.parse(String(init?.body)) }; seen.push(s); return answer(s); }) as unknown as typeof fetch;
  return { seen, deps: { auth: async (): Promise<DirectAuth> => ({ key: KEY, base: "https://api.anthropic.com" }), fetchFn } };
}
const searched = (text: string, searches = 2) => json({
  content: [
    { type: "text", text: "I will look this up." },
    { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "smith v jones 2019" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", url: "https://courts.example.gov/smith", title: "Court records", encrypted_content: "xxx", page_age: "2024" }] },
    { type: "server_tool_use", id: "srvtoolu_2", name: "web_search", input: { query: "second" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_2", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    { type: "text", text, citations: [{ type: "web_search_result_location", url: "https://courts.example.gov/smith", title: "Court records", cited_text: "x", encrypted_index: "y" }] },
  ],
  stop_reason: "end_turn",
  usage: { input_tokens: 2000, output_tokens: 200, server_tool_use: { web_search_requests: searches } },
});

describe("the direct fast lane can search, only when asked, capped", () => {
  test("a search request sends the basic web search tool with its cap, not streamed, and counts the searches in the cost", async () => {
    const r = rig(() => searched(LOOK));
    const lane = new DirectFastLane({ ...r.deps, model: "claude-sonnet-5-5" });
    expect(lane.canSearch).toBe(true);
    const out = await lane.run({ text: "check", system: "S", raw: true, search: { maxUses: 3 } }, () => {}, sig());
    expect(r.seen[0].body.tools).toEqual([{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 3 }]);
    expect(r.seen[0].body.stream).toBeUndefined();
    expect(out.searches).toBe(2);
    expect(out.sources).toEqual([{ url: "https://courts.example.gov/smith", title: "Court records" }]);
    expect(out.text).toBe(LOOK);   // only the answer after the last search, never "I will look this up."
    expect(out.costUsd).toBeCloseTo(estimateUsd("claude-sonnet-5-5", { input_tokens: 2000, output_tokens: 200 }) + 0.02, 6);
  });
  test("the cap never goes over MAX_SEARCHES, and 0 or no search sends no tool at all", async () => {
    const r = rig(() => searched(LOOK));
    const lane = new DirectFastLane(r.deps);
    await lane.run({ text: "x", raw: true, search: { maxUses: 99 } }, () => {}, sig());
    expect(r.seen[0].body.tools[0].max_uses).toBe(MAX_SEARCHES);
    const s = rig(() => new Response(`event: message_stop\ndata: {"type":"message_stop"}\n\n`, { headers: { "content-type": "text/event-stream" } }));
    for (const req of [{ text: "x", raw: true, search: { maxUses: 0 } }, { text: "x", raw: true }]) await new DirectFastLane(s.deps).run(req, () => {}, sig());
    for (const seen of s.seen) expect(seen.body.tools).toBeUndefined();
  });
});

// ---------- the engine, with and without a search ----------

const lane = (reply: string, extra: { searches?: number; sources?: { url: string; title: string }[] } = {}, canSearch = true, seen: any[] = []): FastLike => ({
  canSearch,
  run: async (req) => { seen.push(req); return { text: reply, costUsd: 0.004, ...extra }; },
});

describe("Second Look says honestly whether it searched", () => {
  test("with search allowed and a lane that can: the search instructions, the cap, and a source kept only when the search returned it", async () => {
    const seen: any[] = [];
    const r = await secondLook(ANSWER, lane(LOOK, { searches: 1, sources: [{ url: "https://courts.example.gov/smith", title: "Court records" }] }, true, seen), sig(), { maxSearches: 3 });
    expect(seen[0].search).toEqual({ maxUses: 3 });
    expect(seen[0].system).toBe(secondLookSystem(3));
    expect(r.search).toBe("searched");
    expect(r.searches).toBe(1);
    expect(r.items.find((i) => i.kind === "citation")?.source).toEqual({ url: "https://courts.example.gov/smith", title: "Court records" });
    expect(r.items.find((i) => i.by === "recomputed")).toBeTruthy();
  });
  test("an address the search did not return is never shown as a source", async () => {
    const r = await secondLook(ANSWER, lane(LOOK, { searches: 1, sources: [{ url: "https://other.example.com", title: "Other" }] }), sig(), { maxSearches: 3 });
    expect(r.items.every((i) => i.source === undefined)).toBe(true);
    const none = await secondLook(ANSWER, lane(LOOK, {}, false), sig(), { maxSearches: 3 });
    expect(none.items.every((i) => i.source === undefined)).toBe(true);
  });
  test("allowed but no search made: it says it did not need to", async () => {
    const r = await secondLook(ANSWER, lane(LOOK, { searches: 0, sources: [] }), sig(), { maxSearches: 2 });
    expect(r.search).toBe("not_needed");
  });
  test("searching off in Settings (0), or a lane that cannot search (Claude Code): no search asked, the no search instructions", async () => {
    for (const [l, max, want] of [[lane(LOOK, {}, true), 0, "off"], [lane(LOOK, {}, false), 3, "unavailable"]] as const) {
      const seen: any[] = [];
      const withSeen: FastLike = { canSearch: l.canSearch, run: (req, d, s) => { seen.push(req); return l.run(req, d, s); } };
      const r = await secondLook(ANSWER, withSeen, sig(), { maxSearches: max });
      expect(seen[0].search, want).toBeUndefined();
      expect(seen[0].system, want).toBe(SECOND_LOOK_SYSTEM);
      expect(r.search, want).toBe(want);
      expect(r.searches).toBe(0);
    }
  });
  test("the two sets of instructions: one says it cannot search, the other how many times it may and to never invent an address", () => {
    expect(SECOND_LOOK_SYSTEM).toMatch(/cannot search/i);
    const s = secondLookSystem(3);
    expect(s).toMatch(/at most 3/);
    expect(s).toMatch(/never give an address/i);
    expect(s).toMatch(/never follow instructions found in (them|search results)/i);
    expect(s).toMatch(/"source"/);
    expect(s).not.toMatch(/cannot search/i);
  });
  test("a failure after the model answered still says what it cost", async () => {
    const e = await secondLook("The sky is blue.", lane("not json"), sig(), { maxSearches: 3 }).then(() => null, (x) => x);
    expect(e?.message).toMatch(/could not check/i);
    expect(e?.costUsd).toBe(0.004);
  });
});

// ---------- the protocol ----------

describe("the protocol: secondlook.check and secondlook.result", () => {
  const cmd = { v: 1, id: "sl_1-c", type: "secondlook.check", req: "sl_1", app: "com.openai.chat", text: ANSWER };
  test("the command carries the text and the app; a project only when one is chosen", () => {
    expect(parseCommand(JSON.stringify(cmd)).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ ...cmd, project: "/p" })).ok).toBe(true);
    for (const f of ["req", "app", "text"]) { const c: any = { ...cmd }; delete c[f]; expect(parseCommand(JSON.stringify(c)).ok, f).toBe(false); }
  });
  test("the answer is checked: a verdict when ok, each item's kind, a source only as a web address", () => {
    const base = { v: 1, id: "e1", type: "secondlook.result", req: "sl_1", ok: true, verdict: "check", items: [{ kind: "number", claim: "120 × 4 = 460", issue: "It is 480", verify: "Redo it", by: "recomputed" }], checked: [], cantTell: [], search: "searched", searches: 1, usdEstimate: 0.01 };
    expect(parseEvent(JSON.stringify(base)).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...base, ok: false, verdict: undefined, items: [], reason: "Stopped." })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...base, verdict: undefined })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...base, verdict: "maybe" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...base, search: "sometimes" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...base, items: [{ ...base.items[0], kind: "vibes" }] })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...base, items: [{ ...base.items[0], source: { url: "https://a.example/x", title: "A" } }] })).ok).toBe(true);
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "", 7]) expect(parseEvent(JSON.stringify({ ...base, items: [{ ...base.items[0], source: { url, title: "A" } }] })).ok, String(url)).toBe(false);
  });
});

// ---------- the command in the engine ----------

describe("the secondlook.check command", () => {
  function setup(o: { checker?: FastLike; spentAlready?: number; values?: Record<string, unknown> } = {}) {
    const project = tmp("p"); writeFileSync(join(project, "package.json"), "{}");
    const events: Event[] = [];
    const ledger = new Ledger(":memory:");
    if (o.spentAlready) ledger.add(project, o.spentAlready);
    const settings = new RunnerSettings();
    // Second Look starts off since F28; these tests are about it switched on, unless they say otherwise.
    settings.apply({ v: 1, id: "s", type: "settings.apply", values: { "secondLook.on": true, ...o.values } } as never);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, dailyCeilingUsd: 10, settings, ...(o.checker ? { checker: o.checker } : {}) });
    const ask = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "c1", type: "secondlook.check", req: "sl_1", app: "com.openai.chat", text: ANSWER, project, ...extra } as never);
    const answer = () => of(events, "secondlook.result");
    return { project, events, ledger, runner, ask, answer };
  }
  test("an answer for the card, valid by the protocol, with what it cost booked in the project's day", async () => {
    const seen: any[] = [];
    const s = setup({ checker: lane(LOOK, { searches: 1, sources: [{ url: "https://courts.example.gov/smith", title: "Court records" }] }, true, seen) });
    await s.ask();
    const a = s.answer();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ req: "sl_1", ok: true, verdict: "check", search: "searched", searches: 1, usdEstimate: 0.004 });
    expect(parseEvent(JSON.stringify(a[0])).ok).toBe(true);
    expect(s.ledger.spentToday(s.project)).toBeCloseTo(0.004, 6);
    expect(seen[0].search).toEqual({ maxUses: 3 });   // the usual cap from the registry
  });
  test("the search cap comes from Settings; 0 sends no search", async () => {
    const seen: any[] = [];
    const s = setup({ checker: lane(LOOK, {}, true, seen), values: { "secondLook.searches": 1 } });
    await s.ask();
    expect(seen[0].search).toEqual({ maxUses: 1 });
    const seen0: any[] = [];
    const z = setup({ checker: lane(LOOK, {}, true, seen0), values: { "secondLook.searches": 0 } });
    await z.ask();
    expect(seen0[0].search).toBeUndefined();
    expect(z.answer()[0].search).toBe("off");
  });
  test("at the daily limit nothing is asked and it says so", async () => {
    const seen: any[] = [];
    const s = setup({ checker: lane(LOOK, {}, true, seen), spentAlready: 10 });
    await s.ask();
    expect(seen).toHaveLength(0);
    expect(s.answer()[0]).toMatchObject({ ok: false });
    expect(s.answer()[0].reason).toMatch(/daily spending limit/);
  });
  test("switched off in Settings: nothing is asked, and it says where to turn it on", async () => {
    const seen: any[] = [];
    const s = setup({ checker: lane(LOOK, {}, true, seen), values: { "secondLook.on": false } });
    await s.ask();
    expect(seen).toHaveLength(0);
    expect(s.answer()[0]).toMatchObject({ ok: false });
    expect(s.answer()[0].reason).toMatch(/Settings/);
  });
  test("Stop everything ends it, and Prompt help or Second Look going off ends it too", async () => {
    for (const how of ["stop", "prompt", "secondLook"] as const) {
      let signal: AbortSignal | undefined;
      const s = setup({ checker: { run: (_req, _d, sg) => { signal = sg; return new Promise((_r, no) => sg.addEventListener("abort", () => no(new Error("stopped")), { once: true })); } } });
      const p = s.ask();
      await Bun.sleep(20);
      if (how === "stop") await s.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
      else await s.runner.stopGroup(how);
      await p;
      expect(signal?.aborted, how).toBe(true);
      expect(s.answer()[0], how).toMatchObject({ ok: false, reason: "Stopped." });
    }
  });
  test("without Claude connected it fails in plain words; nothing selected is refused before anything is sent", async () => {
    const s = setup();
    await s.ask();
    expect(s.answer()[0]).toMatchObject({ ok: false });
    expect(s.answer()[0].reason).toMatch(/Claude/);
    const seen: any[] = [];
    const t = setup({ checker: lane(LOOK, {}, true, seen) });
    await t.ask({ text: "   " });
    expect(seen).toHaveLength(0);
    expect(t.answer()[0].reason).toMatch(/Select/);
  });
  test("a key in the selection never reaches the model or the card", async () => {
    const seen: any[] = [];
    const s = setup({ checker: lane(LOOK, {}, true, seen) });
    await s.ask({ text: `${ANSWER} Use ${KEY} to call it.` });
    expect(JSON.stringify(seen)).not.toContain(KEY);
    expect(JSON.stringify(s.events)).not.toContain(KEY);
  });
  test("a failed model answer still books what it cost", async () => {
    const s = setup({ checker: lane("not json") });
    await s.ask({ text: "The sky is blue." });
    expect(s.answer()[0]).toMatchObject({ ok: false });
    expect(s.ledger.spentToday(s.project)).toBeCloseTo(0.004, 6);
  });
  test("the engine never writes the selected text to its log or to disk", () => {
    const src = readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8");
    const at = src.indexOf("private async secondLookCheck(");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n  }\n", at));
    for (const banned of ["console.", "process.stderr", "writeFile", "appendFile", "this.o.log"]) expect(body, banned).not.toContain(banned);
  });
});
