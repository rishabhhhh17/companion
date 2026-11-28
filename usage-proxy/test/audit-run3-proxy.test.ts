// Audit run 3 (account server): S2 one request can no longer spend past the cap, S3 a per account cap on requests a minute,
// S12 a forward that breaks is booked as cut short. Both stores.
import { describe, expect, test } from "bun:test";
import { createProxy, type SafeEvent } from "../src/proxy.ts";
import { newToken } from "../src/tokens.ts";
import { PLANS, REQUESTS_PER_MINUTE } from "../src/plans.ts";
import { costOf } from "../src/usage.ts";
import { TEST_STORES, type TestStore } from "./stores.ts";

const NOW = Date.UTC(2026, 10, 28, 12, 0, 0);
const KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

function rig(store: TestStore, o: { plan?: string; upstream?: (body: string) => Promise<Response>; clock?: () => number } = {}) {
  const events: SafeEvent[] = [], bodies: string[] = [];
  const ready = (async () => { const t = await newToken(); await store.addUser(t.hash, { id: "u1", plan: o.plan ?? "free", status: "active" }); return t.token; })();
  const fetchFn = (async (_u: string, init?: RequestInit) => { const b = String(init?.body ?? ""); bodies.push(b); return o.upstream ? o.upstream(b) : json({ usage: { input_tokens: 10, output_tokens: 10 } }); }) as unknown as typeof fetch;
  const handle = createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, fetch: fetchFn, now: o.clock ?? (() => NOW), log: (e) => events.push(e), maxInFlight: 4 });
  const send = async (body: unknown = { model: "claude-haiku-4-5", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }) =>
    handle(new Request("https://api.example/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": await ready }, body: JSON.stringify(body) }));
  return { store, events, bodies, send };
}

for (const kind of TEST_STORES) describe(kind.name, () => {
  test("S2: Free, nothing spent, the longest answer on the dearest model is cut so its worst case fits the day", async () => {
    const t = rig(kind.make());
    const r = await t.send({ model: "claude-opus-5-5", max_tokens: 64_000, messages: [{ role: "user", content: "hi" }] });
    expect(r.status).toBe(200);
    const sent = JSON.parse(t.bodies[0]).max_tokens as number;
    expect(sent).toBeLessThan(64_000);
    const answer = costOf("claude-opus-5-5", { input_tokens: 0, output_tokens: sent, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
    expect(answer).toBeLessThanOrEqual(PLANS.free.dailyUsd);
    expect(answer).toBeGreaterThan(PLANS.free.dailyUsd * 0.9);   // cut to what is left, not further
  });
  test("S2: when not even a short answer fits, the request is refused and nothing is sent", async () => {
    const t = rig(kind.make());
    t.store.setSpent("u1", NOW, { day: PLANS.free.dailyUsd - 0.001, month: 1 });
    const r = await t.send({ model: "claude-opus-5-5", max_tokens: 64_000, messages: [{ role: "user", content: "hi" }] });
    expect(r.status).toBe(402);
    expect(t.bodies.length).toBe(0);
  });
  test("S2: an answer that fits is sent as asked", async () => {
    const t = rig(kind.make());
    expect((await t.send({ model: "claude-opus-5-5", max_tokens: 2000, messages: [{ role: "user", content: "hi" }] })).status).toBe(200);
    expect(JSON.parse(t.bodies[0]).max_tokens).toBe(2000);
  });
  test(`S3: past ${REQUESTS_PER_MINUTE} requests in a minute, a plain 429 with retry-after; a minute later it works again`, async () => {
    let clock = NOW;
    const t = rig(kind.make(), { clock: () => clock });
    for (let i = 0; i < REQUESTS_PER_MINUTE; i++) expect((await t.send()).status).toBe(200);
    const r = await t.send();
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/too many requests in a minute/);
    expect(t.bodies.length).toBe(REQUESTS_PER_MINUTE);
    clock = NOW + 60_000;
    expect((await t.send()).status).toBe(200);
  });
  test("S12: a forward that breaks after it started is booked as cut short, and its hold is let go", async () => {
    const t = rig(kind.make(), { upstream: async () => { throw new Error("connection reset"); } });
    const r = await t.send({ model: "claude-haiku-4-5", max_tokens: 500, messages: [{ role: "user", content: "hi" }] });
    expect(r.status).toBe(502);
    expect(t.store.records.length).toBe(1);
    expect(t.store.records[0].complete).toBe(false);
    expect(t.store.records[0].usage.output_tokens).toBe(500);
    expect((await t.store.spent("u1", NOW)).day).toBeCloseTo(t.store.records[0].usd, 10);
    expect(t.store.inFlight("u1")).toBe(0);
  });
});

test("S3 rest: refused requests are capped before the store, so a client that ignores the 429 cannot use up store requests", async () => {
  const { createRateLimiter } = await import("../src/ratelimit.ts");
  const store = TEST_STORES[0].make();
  let lookups = 0;
  const real = store.userByTokenHash.bind(store);
  store.userByTokenHash = (async (h: string) => { lookups++; return real(h); }) as typeof store.userByTokenHash;
  const t = await newToken();
  await store.addUser(t.hash, { id: "u1", plan: "free", status: "active" });
  store.setSpent("u1", NOW, { day: PLANS.free.dailyUsd, month: 1 });   // past the day's cap: every request is refused 'over'
  const limit = createRateLimiter({ limit: REQUESTS_PER_MINUTE, windowMs: 60_000 });
  const handle = createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, now: () => NOW, requestLimit: (k) => limit(k, NOW) });
  const statuses: number[] = [];
  for (let i = 0; i < 100; i++) statuses.push((await handle(new Request("https://api.example/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": t.token }, body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }) }))).status);
  expect(lookups).toBe(REQUESTS_PER_MINUTE);
  expect(statuses.at(-1)).toBe(429);
});
