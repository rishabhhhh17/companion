import { describe, expect, test } from "bun:test";
import { createProxy } from "../src/proxy.ts";
import { MemoryStore, type UsageRecord } from "../src/store.ts";
import { newToken } from "../src/tokens.ts";
import { deriveUserId } from "../src/userid.ts";
import { findSignals, signalLines, LIMITS } from "../src/signals.ts";
import { PLANS } from "../src/plans.ts";

// Anthropic's support (27 Oct 2026): our own log, mapping the opaque user id to a request to a time, is the system of record for an
// abuse investigation, and detection must go beyond a daily cap. These tests pin both, on counts only (never text).
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const DAY = 86_400_000;
const PROMPT_MARK = "PROMPT-MARKER-5d21", REPLY_MARK = "REPLY-MARKER-88ce";

async function oneRequest(upstreamHeaders: Record<string, string>) {
  const store = new MemoryStore();
  const t = await newToken();
  store.addUser(t.hash, { id: "owner-zed", plan: "pro", status: "active" });
  const fetchFn = (async () => new Response(JSON.stringify({ id: "m", content: [{ type: "text", text: REPLY_MARK }], usage: { input_tokens: 1000, output_tokens: 500 } }), { status: 200, headers: { "content-type": "application/json", ...upstreamHeaders } })) as unknown as typeof fetch;
  const handle = createProxy({ store, anthropicKey: "sk-ant-api03-OUR-KEY-000000000000", userIdSecret: SECRET, enabled: () => true, fetch: fetchFn, now: () => NOW, log: () => {}, maxInFlight: 4 });
  const res = await handle(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": t.token }, body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content: PROMPT_MARK }] }) }));
  await res.text();
  return store;
}

describe("the request log we keep ourselves", () => {
  test("each record carries the opaque id Anthropic saw, Anthropic's request id, and the plan, so a notice can be traced to one request and one time", async () => {
    const store = await oneRequest({ "request-id": "req_011CAbCdEf" });
    expect(store.records.length).toBe(1);
    const r = store.records[0];
    expect(r.metadataUserId).toBe(await deriveUserId("owner-zed", SECRET));
    expect(r.requestId).toBe("req_011CAbCdEf");
    expect(r.plan).toBe("pro");
    expect(r.at).toBe(NOW);
    expect(r.userId).toBe("owner-zed");
  });
  test("a reply without a request id is still recorded, just without one", async () => {
    const store = await oneRequest({});
    expect(store.records.length).toBe(1);
    expect(store.records[0].requestId).toBeUndefined();
  });
  test("a request id that is not a plain token is not kept (nothing odd goes into the log)", async () => {
    const store = await oneRequest({ "request-id": "req ok; forged=1" });
    expect(store.records[0].requestId).toBeUndefined();
  });
  test("still no text and no secret anywhere in what is held", async () => {
    const store = await oneRequest({ "request-id": "req_011CAbCdEf" });
    const all = JSON.stringify(store.dump());
    expect(all).not.toContain(PROMPT_MARK);
    expect(all).not.toContain(REPLY_MARK);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain("sk-ant");
  });
  test("recordsSince returns only newer records, oldest first", async () => {
    const s = new MemoryStore();
    for (const at of [NOW - 3 * DAY, NOW - DAY, NOW - 2 * DAY]) await s.record(rec({ at }));
    const got = await s.recordsSince(NOW - 2.5 * DAY);
    expect(got.map((r) => r.at)).toEqual([NOW - 2 * DAY, NOW - DAY]);
  });
});

function rec(o: Partial<UsageRecord> = {}): UsageRecord {
  return { userId: "owner-a", model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }, usd: 0.01, at: NOW - 1000, complete: true, plan: "pro", metadataUserId: "x".repeat(64), ...o };
}
const day = (n: number, h = 10) => Date.UTC(2026, 9, 27 - n, h);   // n days before NOW's day

describe("signals beyond a daily cap (counts only, for a person to look at)", () => {
  test("a quiet owner raises nothing", () => {
    const rs = [rec({ at: day(0), usd: 0.05 }), rec({ at: day(1), usd: 0.05 }), rec({ at: day(3), usd: 0.04 })];
    expect(findSignals(rs, NOW)).toEqual([]);
  });
  test("near the daily limit on several days of the last week is flagged, once, with the days", () => {
    const limit = PLANS.pro.dailyUsd;
    const rs = [0, 1, 2].map((n) => rec({ at: day(n), usd: limit * 0.95 }));
    const s = findSignals(rs, NOW);
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({ ownerId: "owner-a", kind: "at_limit" });
    expect(s[0].detail).toContain("3 of the last 7 days");
  });
  test("two days at the limit is not enough, and days older than a week do not count", () => {
    const limit = PLANS.pro.dailyUsd;
    const kinds = (ns: number[]) => findSignals(ns.map((n) => rec({ at: day(n), usd: limit })), NOW).map((s) => s.kind);
    expect(kinds([0, 1])).not.toContain("at_limit");
    expect(kinds([0, 1, 8, 9])).not.toContain("at_limit");
  });
  test("the limit follows the plan: the same spend is a signal on free and not on max", () => {
    const rs = (plan: string) => [0, 1, 2].map((n) => rec({ at: day(n), usd: 0.19, plan }));
    expect(findSignals(rs("free"), NOW).map((s) => s.kind)).toEqual(["at_limit"]);
    expect(findSignals(rs("max"), NOW)).toEqual([]);
  });
  test("a burst of requests in a few minutes is flagged", () => {
    const rs = Array.from({ length: LIMITS.burstRequests }, (_, i) => rec({ at: NOW - i * 5000, usd: 0.001 }));
    const s = findSignals(rs, NOW);
    expect(s.map((x) => x.kind)).toEqual(["burst"]);
    expect(findSignals(rs.slice(1), NOW)).toEqual([]);
  });
  test("a sudden jump against the owner's own week is flagged", () => {
    const rs = [1, 2, 3, 4, 5, 6].map((n) => rec({ at: day(n), usd: 0.1 })).concat([rec({ at: day(0), usd: 0.9 })]);
    const s = findSignals(rs, NOW);
    expect(s.map((x) => x.kind)).toEqual(["jump"]);
    expect(findSignals([...rs.slice(0, 6), rec({ at: day(0), usd: 0.3 })], NOW)).toEqual([]);
  });
  test("owners are judged separately and the output is ordered the same way every time", () => {
    const burst = (owner: string) => Array.from({ length: LIMITS.burstRequests }, (_, i) => rec({ userId: owner, at: NOW - i * 1000, usd: 0.001 }));
    const s = findSignals([...burst("owner-b"), ...burst("owner-a")], NOW);
    expect(s.map((x) => `${x.ownerId}:${x.kind}`)).toEqual(["owner-a:burst", "owner-b:burst"]);
  });
  test("an unknown plan is treated as free, like everywhere else", () => {
    const rs = [0, 1, 2].map((n) => rec({ at: day(n), usd: 0.19, plan: "nonsense" }));
    expect(findSignals(rs, NOW).map((x) => x.kind)).toEqual(["at_limit"]);
  });
  test("the lines for the operator are plain, name the owner and the opaque id, and hold no text", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < LIMITS.burstRequests; i++) await store.record(rec({ at: NOW - i * 1000, usd: 0.001, metadataUserId: "ab".repeat(32) }));
    const lines = await signalLines(store, NOW);
    const text = lines.join("\n");
    expect(text).toContain("owner-a");
    expect(text).toContain("ab".repeat(32));
    expect(text).toMatch(/burst/i);
    expect(text).not.toContain("—");
    expect(lines.length).toBeGreaterThan(0);
    expect(await signalLines(new MemoryStore(), NOW)).toEqual(["No signals. Nothing looks unusual in the last 7 days."]);
  });
});
