import { describe, expect, test } from "bun:test";
import { newToken, hashToken, tokenFromHeaders } from "../src/tokens.ts";
import { PLANS, planOf, budgetCheck, dayKey, monthKey, nextReset } from "../src/plans.ts";
import { checkRequest, MAX_BODY_BYTES } from "../src/filter.ts";
import { UsageSniffer, usageFromJson, costOf } from "../src/usage.ts";
import { MAX_SEARCHES, WEB_SEARCH_TOOL, WEB_SEARCH_USD } from "../../runner/src/models.ts";

describe("sign in tokens", () => {
  test("a new token is random, prefixed, and only its hash is kept", async () => {
    const a = await newToken(), b = await newToken();
    expect(a.token).toMatch(/^cmp_[A-Za-z0-9_-]{40,}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(await hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
  test("a token is read from the key header Claude Code sends, or from a bearer header; nothing else", () => {
    const t = `cmp_${"a".repeat(40)}`;
    expect(tokenFromHeaders(new Headers({ "x-api-key": t }))).toBe(t);
    expect(tokenFromHeaders(new Headers({ authorization: `Bearer ${t}` }))).toBe(t);
    expect(tokenFromHeaders(new Headers({ authorization: `Basic ${t}` }))).toBeNull();
    expect(tokenFromHeaders(new Headers({ "x-api-key": "cmp_short" }))).toBeNull();
    expect(tokenFromHeaders(new Headers({ "x-api-key": "sk-ant-api03-realkey" }))).toBeNull();   // a real Anthropic key is never accepted as a sign in
    expect(tokenFromHeaders(new Headers())).toBeNull();
  });
});

describe("plans and budgets", () => {
  test("every plan has a daily limit under its monthly one, in dollars of Anthropic cost", () => {
    for (const p of Object.values(PLANS)) { expect(p.dailyUsd).toBeGreaterThan(0); expect(p.monthlyUsd).toBeGreaterThanOrEqual(p.dailyUsd); }
    expect(planOf("pro")).toBe(PLANS.pro);
    expect(planOf("nonsense")).toBe(PLANS.free);   // an unknown plan name is never better than free
  });
  test("a budget check refuses at or over the daily or monthly limit, and says which and when it resets", () => {
    const now = Date.UTC(2026, 9, 22, 10, 0, 0);
    expect(budgetCheck(PLANS.pro, { day: 0, month: 0 }, now)).toEqual({ ok: true });
    const d = budgetCheck(PLANS.pro, { day: PLANS.pro.dailyUsd, month: 1 }, now) as any;
    expect([d.ok, d.reason]).toEqual([false, "day"]);
    expect(d.resetsAt).toBe(Date.UTC(2026, 9, 23, 0, 0, 0));
    const m = budgetCheck(PLANS.pro, { day: 0.1, month: PLANS.pro.monthlyUsd + 0.01 }, now) as any;
    expect([m.ok, m.reason]).toEqual([false, "month"]);
    expect(m.resetsAt).toBe(Date.UTC(2026, 10, 1, 0, 0, 0));
    // when both are over, the one that resets last is named
    expect((budgetCheck(PLANS.pro, { day: 99, month: 999 }, now) as any).reason).toBe("month");
  });
  test("days and months are UTC", () => {
    expect(dayKey(Date.UTC(2026, 9, 22, 23, 59, 59))).toBe("2026-10-22");
    expect(dayKey(Date.UTC(2026, 9, 23, 0, 0, 0))).toBe("2026-10-23");
    expect(monthKey(Date.UTC(2026, 11, 31, 23, 0, 0))).toBe("2026-12");
    expect(nextReset("day", Date.UTC(2026, 11, 31, 12))).toBe(Date.UTC(2027, 0, 1));
    expect(nextReset("month", Date.UTC(2026, 11, 31, 12))).toBe(Date.UTC(2027, 0, 1));
  });
});

describe("the request filter", () => {
  const ok = (over: Record<string, unknown> = {}) => JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1024, messages: [{ role: "user", content: "hi" }], ...over });
  test("only POST to the messages paths", () => {
    expect(checkRequest("POST", "/v1/messages", ok()).ok).toBe(true);
    expect(checkRequest("POST", "/v1/messages/count_tokens", ok()).ok).toBe(true);
    for (const [m, p] of [["GET", "/v1/messages"], ["POST", "/v1/models"], ["POST", "/v1/files"], ["POST", "/v1/messages/batches"], ["POST", "/v1/complete"], ["POST", "/v1/messages/../files"], ["DELETE", "/v1/messages"]] as const) {
      const r = checkRequest(m, p, ok()); expect([r.ok, p], `${m} ${p}`).toEqual([false, p]);
    }
  });
  test("only the models Companion uses, in any dated spelling", () => {
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-haiku-4-5-20251001", "claude-sonnet-5-5[1m]"]) expect(checkRequest("POST", "/v1/messages", ok({ model: m })).ok, m).toBe(true);
    for (const m of ["claude-fable-5-1", "gpt-4", "", "claude-opus-4", "../x", 7]) expect(checkRequest("POST", "/v1/messages", ok({ model: m })).ok, String(m)).toBe(false);
  });
  test("counting tokens needs no max_tokens and is never charged", () => {
    const r = checkRequest("POST", "/v1/messages/count_tokens", JSON.stringify({ model: "claude-sonnet-5-5", messages: [{ role: "user", content: "hi" }] })) as any;
    expect([r.ok, r.free]).toEqual([true, true]);
  });
  test("max_tokens is clamped, never raised, and a missing one is refused", () => {
    const r = checkRequest("POST", "/v1/messages", ok({ max_tokens: 900000 })) as any;
    expect(r.ok).toBe(true); expect(JSON.parse(r.body).max_tokens).toBeLessThanOrEqual(64000);
    expect(JSON.parse((checkRequest("POST", "/v1/messages", ok({ max_tokens: 500 })) as any).body).max_tokens).toBe(500);
    expect(checkRequest("POST", "/v1/messages", JSON.stringify({ model: "claude-sonnet-5-5", messages: [] })).ok).toBe(false);
    expect(checkRequest("POST", "/v1/messages", ok({ max_tokens: -5 })).ok).toBe(false);
    expect(checkRequest("POST", "/v1/messages", ok({ max_tokens: "lots" })).ok).toBe(false);
  });
  test("a body that is too big, not JSON, or not an object is refused with a plain reason", () => {
    expect(checkRequest("POST", "/v1/messages", "x".repeat(MAX_BODY_BYTES + 1)).ok).toBe(false);
    for (const b of ["not json", "[]", "null", "42"]) expect(checkRequest("POST", "/v1/messages", b).ok, b).toBe(false);
    const r = checkRequest("POST", "/v1/messages", "not json") as any;
    expect(r.message).toMatch(/could not be read/i);
  });
  test("the model and the stream flag are reported for metering", () => {
    const r = checkRequest("POST", "/v1/messages", ok({ stream: true })) as any;
    expect([r.model, r.stream]).toEqual(["claude-sonnet-5-5", true]);
  });
});

describe("reading usage without keeping the text", () => {
  const sse = (events: unknown[]) => events.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const stream = [
    { type: "message_start", message: { id: "m1", usage: { input_tokens: 120, cache_read_input_tokens: 4000, cache_creation_input_tokens: 300, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "SECRET-REPLY-TEXT" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 250 } },
    { type: "message_stop" },
  ];
  test("the streaming events give the counts: input from the start, output from the last update", () => {
    const s = new UsageSniffer(); s.push(new TextEncoder().encode(sse(stream))); s.end();
    expect(s.usage()).toEqual({ input_tokens: 120, output_tokens: 250, cache_read_input_tokens: 4000, cache_creation_input_tokens: 300, web_search_requests: 0 });
    expect(s.complete()).toBe(true);
  });
  test("any way of cutting the bytes into chunks gives the same counts", () => {
    const bytes = new TextEncoder().encode(sse(stream));
    for (const size of [1, 2, 3, 7, 64, 1000]) {
      const s = new UsageSniffer();
      for (let i = 0; i < bytes.length; i += size) s.push(bytes.subarray(i, i + size));
      s.end();
      expect(s.usage().output_tokens, `chunk ${size}`).toBe(250);
      expect(s.usage().input_tokens, `chunk ${size}`).toBe(120);
    }
  });
  test("a stream that ends early still reports what it had, and says it is not complete", () => {
    const s = new UsageSniffer(); s.push(new TextEncoder().encode(sse(stream.slice(0, 3)))); s.end();
    expect(s.usage().input_tokens).toBe(120); expect(s.complete()).toBe(false);
  });
  test("the sniffer keeps no text: its state never holds the reply", () => {
    const s = new UsageSniffer(); s.push(new TextEncoder().encode(sse(stream)));
    expect(JSON.stringify(s)).not.toContain("SECRET-REPLY-TEXT");
    s.end(); expect(JSON.stringify(s)).not.toContain("SECRET-REPLY-TEXT");
  });
  test("a huge line without a newline cannot grow it without limit", () => {
    const s = new UsageSniffer();
    for (let i = 0; i < 200; i++) s.push(new Uint8Array(100_000).fill(65));
    expect(JSON.stringify(s).length).toBeLessThan(2_000_000);
  });
  test("a plain JSON reply gives its usage; garbage gives zero", () => {
    expect(usageFromJson(JSON.stringify({ content: [{ type: "text", text: "x" }], usage: { input_tokens: 10, output_tokens: 20 } }))).toEqual({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
    expect(usageFromJson("nope")).toEqual({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
  });
  test("cost uses the same price table the app uses, and an unknown model costs at least the dearest known one", () => {
    // Sonnet 5.5: $2 in, $10 out, $0.2 cache read, $2.5 cache write, per million
    const c = costOf("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 10000, cache_creation_input_tokens: 2000, web_search_requests: 0 });
    expect(c).toBeCloseTo((1000 * 2 + 1000 * 10 + 10000 * 0.2 + 2000 * 2.5) / 1e6, 8);
    expect(costOf("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 })).toBe(0);
    expect(costOf("unknown-model", { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 })).toBeGreaterThan(costOf("claude-opus-5-5", { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }));
  });
});

// Second Look (M14) is the one light feature that sends a tool: the basic web search, with a small cap. The proxy forwards
// exactly that and nothing more, and a search is counted in what the request cost.
describe("tools: only Second Look's capped web search", () => {
  const ok = (over: Record<string, unknown> = {}) => JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1024, messages: [{ role: "user", content: "hi" }], ...over });
  const search = (over: Record<string, unknown> = {}) => ({ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 3, ...over });
  test("no tools, or exactly the web search Second Look sends with a cap from 1 to the most allowed, goes through", () => {
    expect(checkRequest("POST", "/v1/messages", ok()).ok).toBe(true);
    expect(checkRequest("POST", "/v1/messages", ok({ tools: [] })).ok).toBe(true);
    for (const n of [1, 3, MAX_SEARCHES]) expect(checkRequest("POST", "/v1/messages", ok({ tools: [search({ max_uses: n })] })).ok, String(n)).toBe(true);
    const r = checkRequest("POST", "/v1/messages", ok({ tools: [search()] })) as any;
    expect(JSON.parse(r.body).tools).toEqual([search()]);
  });
  test("anything else is refused before it reaches Anthropic", () => {
    const bad: unknown[] = [
      [search({ max_uses: MAX_SEARCHES + 1 })], [search({ max_uses: 0 })], [search({ max_uses: 2.5 })], [search({ max_uses: "3" })], [{ type: WEB_SEARCH_TOOL, name: "web_search" }],
      [search({ allowed_domains: ["a.com"] })], [search({ user_location: { type: "approximate", city: "x" } })], [search({ allowed_callers: ["code_execution_20260120"] })],
      [search({ name: "search" })], [search({ type: "web_search_20260209" })], [search({ type: "web_fetch_20260209", name: "web_fetch" })],
      [search(), search()], [{ type: "computer_toolset_20260801" }], [{ type: "code_execution_20260521", name: "code_execution" }], [{ name: "my_tool", input_schema: { type: "object" } }],
      "web_search", {}, [null], [7],
    ];
    for (const tools of bad) {
      const r = checkRequest("POST", "/v1/messages", ok({ tools })) as any;
      expect(r.ok, JSON.stringify(tools)).toBe(false);
      expect(r.status).toBe(400);
    }
    for (const extra of [{ mcp_servers: [{ type: "url", url: "https://x", name: "x" }] }, { container: "c1" }, { tool_choice: { type: "auto" } }]) {
      expect(checkRequest("POST", "/v1/messages", ok({ ...extra })).ok, Object.keys(extra)[0]).toBe(false);
    }
  });
  test("a search is counted in what the request cost, streamed or not", () => {
    const u = usageFromJson(JSON.stringify({ usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } } }));
    expect(u.web_search_requests).toBe(2);
    expect(costOf("claude-sonnet-5-5", u)).toBeCloseTo((1000 * 2 + 100 * 10) / 1e6 + 2 * WEB_SEARCH_USD, 8);
    const s = new UsageSniffer();
    s.push(new TextEncoder().encode([
      `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } })}\n`,
      `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 5, server_tool_use: { web_search_requests: 3 } } })}\n`,
      `data: {"type":"message_stop"}\n`,
    ].join("")));
    s.end();
    expect(s.usage().web_search_requests).toBe(3);
    expect(costOf("claude-sonnet-5-5", s.usage())).toBeGreaterThanOrEqual(3 * WEB_SEARCH_USD);
  });
});
