// Audit run 2, finding 6, second re-attack (docs/security/2026-11-19-usage-proxy-run-2.md). Two breaks of the hold:
// 1. Web search: Second Look's search tool makes Anthropic bill each search ($0.01) and the results as input tokens, none of
//    it in the body, so a tiny body with a search tool held a few tenths of a cent and cost many times that.
// 2. The lease: in the Durable Object store a hold older than LEASE_MS was dropped even while its stream was still open, so
//    a client that kept a stream open past 30 minutes let the next request pass the budget at zero spend, wave after wave.
// The fake replies assume search result sizes (Anthropic's billing of results as input tokens is documented, not measured).
import { describe, expect, test } from "bun:test";
import { createProxy } from "../src/proxy.ts";
import { checkRequest } from "../src/filter.ts";
import { newToken } from "../src/tokens.ts";
import { PLANS } from "../src/plans.ts";
import { costOf } from "../src/usage.ts";
import { LEASE_MS } from "../src/store-do.ts";
import { TEST_STORES, type TestStore } from "./stores.ts";
import { MAX_SEARCHES, WEB_SEARCH_TOOL } from "../../runner/src/models.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
const zero = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
const SEARCH = { type: WEB_SEARCH_TOOL, name: "web_search", max_uses: MAX_SEARCHES };
const enc = new TextEncoder();
const ev = (e: unknown) => enc.encode(`event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`);

async function setup(kind: { make: () => TestStore }, fetchFn: typeof fetch, now: () => number) {
  const store = kind.make();
  const t = await newToken();
  await store.addUser(t.hash, { id: "u1", plan: "free", status: "active" });
  const handle = createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, fetch: fetchFn, now, log: () => {}, maxInFlight: 4 });
  const send = (body: unknown) => handle(new Request("https://proxy.example/v1/messages", { method: "POST",
    headers: { "content-type": "application/json", "x-api-key": t.token }, body: JSON.stringify(body) }));
  return { store, send };
}
/** What one request holds while it runs: its prompt and answer as the store sees them, read while the reply is held back. */
async function heldFor(kind: { make: () => TestStore }, body: unknown): Promise<number> {
  let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
  const fetchFn = (async () => { await gate; return json({ content: [], usage: { input_tokens: 1, output_tokens: 1 } }); }) as unknown as typeof fetch;
  const { store, send } = await setup(kind, fetchFn, () => NOW);
  const pending = send(body);
  await new Promise((r) => setTimeout(r, 20));
  const held = (await store.spent("u1", NOW)).day;
  open(); await (await pending).text();
  return held;
}

for (const kind of TEST_STORES) describe(kind.name, () => {
  describe("finding 6 re-attack: web search", () => {
    const tiny = { model: "claude-opus-5-5", max_tokens: 300, tools: [SEARCH],
      messages: [{ role: "user", content: "Search five separate times for five different topics and quote each page in full." }] };

    test("a request with the search tool holds every search fee and room for the results", async () => {
      const c = checkRequest("POST", "/v1/messages", JSON.stringify(tiny));
      expect(c.ok).toBe(true);
      const est = (c as { inputTokens: number }).inputTokens;
      const held = await heldFor(kind, tiny);
      // At least the fees, and at least 8k tokens of results a search (the re-attack's assumed size) on top of the body.
      const floor = costOf("claude-opus-5-5", { ...zero, input_tokens: est + MAX_SEARCHES * 8_000, output_tokens: 300, web_search_requests: MAX_SEARCHES });
      expect(held).toBeGreaterThanOrEqual(floor);
    });

    test("a search request near the long prompt line is held at the long rate card", async () => {
      // About 90k tokens of body on Haiku 5.5: under its 100k line alone, over it once search results come back.
      const body = { model: "claude-haiku-5-5", max_tokens: 300, tools: [SEARCH], messages: [{ role: "user", content: "x".repeat(270_000) }] };
      const c = checkRequest("POST", "/v1/messages", JSON.stringify(body));
      const est = (c as { inputTokens: number }).inputTokens;
      expect(est).toBeLessThan(100_000);
      const held = await heldFor(kind, body);
      const longCard = costOf("claude-haiku-5-5", { ...zero, input_tokens: est + MAX_SEARCHES * 8_000, output_tokens: 300, web_search_requests: MAX_SEARCHES });
      expect(held).toBeGreaterThanOrEqual(longCard);
    });

    for (const [name, usage] of [
      ["8k tokens a search", { input_tokens: 40_000, output_tokens: 300, server_tool_use: { web_search_requests: MAX_SEARCHES } }],
      ["6k tokens a search", { input_tokens: 30_000, output_tokens: 300, server_tool_use: { web_search_requests: MAX_SEARCHES } }],
    ] as const) test(`4 tiny search requests at once on Free, zero spend, ${name}: day spend stays under the limit plus one request`, async () => {
      let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
      let sent = 0;
      const fetchFn = (async () => { sent++; await gate; return json({ content: [], usage }); }) as unknown as typeof fetch;
      const { store, send } = await setup(kind, fetchFn, () => NOW);
      const all = Promise.all([0, 1, 2, 3].map(() => send(tiny)));
      await new Promise((r) => setTimeout(r, 20));
      open();
      const rs = await all;
      await Promise.all(rs.map((r) => r.text()));
      const one = costOf("claude-opus-5-5", { ...zero, input_tokens: usage.input_tokens, output_tokens: 300, web_search_requests: MAX_SEARCHES });
      const spent = await store.spent("u1", NOW);
      expect(sent).toBe(1);
      expect(spent.day).toBeLessThanOrEqual(PLANS.free.dailyUsd + one);
    });

    test("a cache marker holds the prompt at the cache write rate", async () => {
      const body = { model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "user", content: [{ type: "text", text: "y".repeat(30_000), cache_control: { type: "ephemeral" } }] }] };
      const est = (checkRequest("POST", "/v1/messages", JSON.stringify(body)) as { inputTokens: number }).inputTokens;
      const held = await heldFor(kind, body);
      expect(held).toBeGreaterThanOrEqual(costOf("claude-opus-5-5", { ...zero, cache_creation_input_tokens: est, output_tokens: 1 }));
    });
  });

  describe("finding 6 re-attack: the lease", () => {
    const T0 = Date.UTC(2026, 10, 19, 1, 0, 0);
    const MODEL = "claude-opus-5-5", PROMPT = "word ".repeat(18_000), MAXT = 64_000, IN = 30_000;

    test("a stream held open past the lease does not let more requests pass the budget", async () => {
      let clock = T0;
      const ends: (() => void)[] = [];
      const fetchFn = (async () => {
        let end!: () => void; const gate = new Promise<void>((r) => { end = r; }); ends.push(end);
        return new Response(new ReadableStream({ async start(c) {
          c.enqueue(ev({ type: "message_start", message: { id: "m", usage: { input_tokens: IN, output_tokens: 1 } } }));
          await gate;
          c.enqueue(ev({ type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: MAXT } }));
          c.enqueue(ev({ type: "message_stop" })); c.close();
        } }), { status: 200, headers: { "content-type": "text/event-stream" } });
      }) as unknown as typeof fetch;
      const { store, send } = await setup(kind, fetchFn, () => clock);
      const body = { model: MODEL, max_tokens: MAXT, stream: true, messages: [{ role: "user", content: PROMPT }] };
      const open: ReadableStreamDefaultReader<Uint8Array>[] = [];
      let passed = 0;
      for (let wave = 0; wave < 6; wave++) {
        clock = T0 + wave * (LEASE_MS + 60_000);
        const r = await send(body);
        if (r.status === 200) { passed++; const rd = r.body!.getReader(); await rd.read(); open.push(rd); }
        else await r.text();
        expect((await send(body)).status).toBe(402);   // the hold works while it is alive
      }
      expect(passed).toBe(1);
      for (const e of ends) e();
      for (const rd of open) { while (!(await rd.read()).done) { /* drain */ } }
      await new Promise((r) => setTimeout(r, 20));
      const one = costOf(MODEL, { ...zero, input_tokens: IN, output_tokens: MAXT });
      // The stream that ran is booked once, at its real cost: its lapsed hold is not counted on top.
      const spent = await store.spent("u1", clock);
      expect(spent.day).toBeCloseTo(one, 6);
    });

    test("a hold whose request has not ended keeps counting after the lease, for its day and month, until it is booked", async () => {
      const store = kind.make();
      await store.start("u1", { max: 4, usd: 0.15, now: T0, limits: PLANS.free, id: "a", need: 0 });
      const later = T0 + LEASE_MS + 1;
      expect((await store.spent("u1", later)).day).toBeCloseTo(0.15, 9);
      // The next request sees it, as with a live hold.
      expect((await store.start("u1", { max: 4, usd: 0.1, now: later, limits: PLANS.free, id: "b", need: 0.06 })).ok).toBe(false);
      if (kind.name === "Durable Object store") {
        // The lapsed hold counts for the day and month it lapsed in, like a booking made then (the in memory store has no lease).
        const nextDay = Date.UTC(2026, 10, 20, 12, 0, 0);
        expect(await store.spent("u1", nextDay)).toEqual({ day: 0, month: expect.closeTo(0.15, 9) });
        expect(await store.spent("u1", Date.UTC(2026, 11, 2))).toEqual({ day: 0, month: 0 });
      }
      // A late finish books its real cost in place of the held amount.
      await store.finish("u1", { id: "a", now: later + 1000, record: { userId: "u1", model: MODEL, usage: { ...zero, output_tokens: 1 }, usd: 0.05, at: later + 1000, complete: true } });
      expect((await store.spent("u1", later + 2000)).day).toBeCloseTo(0.05, 9);
    });
  });
});
