// M116 step 3: the server cheaper and honest. At most 3 rows written per model request (one running slot and hold together,
// one record that also carries the day and month totals), the lighter stream reader that never reads a text delta, a local
// timing check for CPU (an early warning only: Cloudflare does not hold `wrangler dev` or Bun to its 10 ms, V1 settles it on
// the deployed server), the new over limit words that never tell anyone to add their own Claude key (F29), and payment event
// ids kept 48 hours, because Dodo retries for about 37. No network, no real key, every store test on both stores.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createProxy, type SafeEvent } from "../src/proxy.ts";
import { newToken } from "../src/tokens.ts";
import { PLANS, dayKey, monthKey, nextReset } from "../src/plans.ts";
import { costOf, UsageSniffer } from "../src/usage.ts";
import { checkRequest } from "../src/filter.ts";
import { PRODUCT } from "../src/names.ts";
import { DODO_TIMESTAMP_TOLERANCE_SEC, MemoryDodoLedger, createDodoWebhook, MemoryLinkBook, signDodoForTest, type DodoEntitlement } from "../src/dodo.ts";
import { DELETE_MAX, DurableDodoLedger, OWNER, PRUNE_BATCH, RECORD_KEEP_MS, WEBHOOK_KEEP_MS, nextTotals } from "../src/store-do.ts";
import { FakeNamespace } from "./fake-do.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";
import { OWNER_SECRET, withOwnerSig } from "./owner-sig-fixture.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const enc = new TextEncoder();
const SRC = join(import.meta.dir, "..", "src");
const OWN_KEY = /own Claude key|your own key|add (a|your) (Claude )?key/i;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const sse = (events: unknown[]) => events.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const sseResponse = (text: string) => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(text)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
const STREAM = sse([
  { type: "message_start", message: { id: "m", usage: { input_tokens: 2000, cache_read_input_tokens: 8000, output_tokens: 1 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "a reply" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 700 } },
  { type: "message_stop" },
]);
const message = async (r: Response) => ((await r.json()) as { error: { message: string } }).error.message;

type Rig = ReturnType<typeof rig>;
function rig(store: TestStore, o: { plan?: string; status?: "active" | "canceled"; enabled?: boolean; secret?: string | null; anthropicKey?: string; maxInFlight?: number; upstream?: (body: string) => Promise<Response> | Response; releaseRetryMs?: number[]; waitUntil?: (p: Promise<unknown>) => void } = {}) {
  const events: SafeEvent[] = [];
  let forwarded = 0;
  const tokens: string[] = [];
  const addToken = async () => { const t = await newToken(); await store.addUser(t.hash, { id: "u1", plan: o.plan ?? "pro", status: o.status ?? "active" }); tokens.push(t.token); return t.token; };
  const ready = addToken();
  const fetchFn = (async (_url: string, init?: RequestInit) => { forwarded++; const body = String(init?.body ?? ""); return o.upstream ? o.upstream(body) : json({ id: "m", content: [{ type: "text", text: "x" }], usage: { input_tokens: 1000, output_tokens: 500 } }); }) as unknown as typeof fetch;
  const handle = createProxy({ store, anthropicKey: o.anthropicKey ?? KEY, userIdSecret: o.secret === null ? undefined : (o.secret ?? SECRET), enabled: () => o.enabled ?? true, fetch: fetchFn, now: () => NOW, log: (e) => events.push(e), maxInFlight: o.maxInFlight ?? 4,
    ...(o.releaseRetryMs ? { releaseRetryMs: o.releaseRetryMs } : {}), ...(o.waitUntil ? { waitUntil: o.waitUntil } : {}) });
  const send = async (over: { token?: string; path?: string; body?: unknown } = {}) => {
    const token = over.token ?? (await ready);
    const body = over.body ?? { model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content: "hi" }] };
    return handle(new Request(`https://api.example${over.path ?? "/v1/messages"}`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": token }, body: JSON.stringify(body) }));
  };
  return { store, events, send, ready, addToken, forwarded: () => forwarded };
}

// ---------------------------------------------------------------------------------------------------------------------------
describe("the words never tell anyone to add their own Claude key (F29)", () => {
  test("no file of the server says it, in words or in a comment", () => {
    for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts"))) expect(readFileSync(join(SRC, f), "utf8"), f).not.toMatch(OWN_KEY);
  });
  for (const kind of TEST_STORES) describe(kind.name, () => {
    const pro = PLANS.pro, free = PLANS.free;
    test("today's included use used up, on Free: the new words, Pro has more, and when it comes back", async () => {
      const t = rig(kind.make(), { plan: "free" }); await t.ready;
      t.store.setSpent("u1", NOW, { day: free.dailyUsd, month: free.dailyUsd });
      const r = await t.send();
      expect(r.status).toBe(402);
      expect(r.headers.get("x-companion-resets-at")).toBe(new Date(nextReset("day", NOW)).toISOString());
      const m = await message(r);
      expect(m).toMatch(/^Today's included use is used up\. It comes back at /);
      expect(m).toContain("Pro has more each day.");
      expect(m).not.toMatch(OWN_KEY);
      expect(t.forwarded()).toBe(0);
    });
    test("today's included use used up, on Pro: no Pro line", async () => {
      const t = rig(kind.make(), { plan: "pro" }); await t.ready;
      t.store.setSpent("u1", NOW, { day: pro.dailyUsd, month: pro.dailyUsd });
      const m = await message(await t.send());
      expect(m).toMatch(/^Today's included use is used up\./);
      expect(m).not.toContain("Pro has more");
      expect(m).not.toMatch(OWN_KEY);
    });
    test("this month's included use used up: the month's words, and on Free that Pro has more", async () => {
      for (const plan of ["free", "pro"] as const) {
        const t = rig(kind.make(), { plan }); await t.ready;
        t.store.setSpent("u1", NOW, { day: 0, month: PLANS[plan].monthlyUsd });
        const r = await t.send();
        expect(r.status).toBe(402);
        expect(r.headers.get("x-companion-resets-at")).toBe(new Date(nextReset("month", NOW)).toISOString());
        const m = await message(r);
        expect(m).toMatch(/^This month's included use is used up\. It comes back on the 1st/);
        expect(m.includes("Pro has more each month."), plan).toBe(plan === "free");
        expect(m).not.toMatch(OWN_KEY);
      }
    });
    test("switched off, not ready, plan not active: plain words, nothing sent, no key to add", async () => {
      const cases: [string, Parameters<typeof rig>[1], RegExp][] = [
        ["switched off", { enabled: false }, /not switched on yet/],
        ["no user id secret", { secret: null }, /not ready yet\. Nothing was sent/],
        ["no Anthropic key", { anthropicKey: "" }, /not ready yet\. Nothing was sent/],
        ["plan not active", { status: "canceled" }, /plan is not active/],
      ];
      for (const [name, o, words] of cases) {
        const t = rig(kind.make(), o); await t.ready;
        const m = await message(await t.send());
        expect(m, name).toMatch(words);
        expect(m, name).not.toMatch(OWN_KEY);
        expect(t.forwarded(), name).toBe(0);
      }
    });
    test("two tokens of one owner at once are metered against the one limit, and past the running cap the words say the other Mac", async () => {
      // Room for one worst case (2,000 tokens out on Sonnet) and not two.
      const worst = costOf("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
      const t = rig(kind.make(), { plan: "pro", upstream: async () => { await new Promise((r) => setTimeout(r, 10)); return json({ usage: { input_tokens: 1000, output_tokens: 500 } }); } });
      const [a, b] = [await t.ready, await t.addToken()];
      t.store.setSpent("u1", NOW, { day: pro.dailyUsd - worst * 0.5, month: 1 });
      const rs = await Promise.all([t.send({ token: a }), t.send({ token: b })]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 402]);
      expect(t.forwarded()).toBe(1);

      let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
      const busy = rig(kind.make(), { maxInFlight: 1, upstream: async () => { await gate; return json({ usage: { input_tokens: 1, output_tokens: 1 } }); } });
      const [x, y] = [await busy.ready, await busy.addToken()];
      const first = busy.send({ token: x });
      while (busy.forwarded() === 0) await new Promise((r) => setTimeout(r, 1));   // the first one is running
      const second = await busy.send({ token: y });
      expect(second.status).toBe(429);
      expect(await message(second)).toBe(`${PRODUCT} is busy on your other Mac. Try again when it finishes.`);
      open();
      expect((await first).status).toBe(200);
      expect(busy.store.inFlight("u1")).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The Durable Object helper counts live slots against its clock, so it gets the test's fixed NOW (with the real clock, the
// 30 minute lease ran out on 19 Nov after 12:30 UTC and these failed).
const AT_NOW = TEST_STORES.map((k) => (k.name === "Durable Object store" ? { ...k, make: () => new FakeDurableStore(new FakeNamespace(), () => NOW) } : k));
for (const kind of AT_NOW) describe(`one step to start and one to finish: ${kind.name}`, () => {
  const pro = PLANS.pro;
  test("start takes the slot and the hold together; over the limit it takes nothing and says what is spent", async () => {
    const s = kind.make();
    s.setSpent("u1", NOW, { day: pro.dailyUsd - 0.1, month: 1 });
    expect(await s.start("u1", { max: 4, usd: 0.3, now: NOW, limits: pro, id: "a" })).toEqual({ ok: true });
    expect(s.inFlight("u1")).toBe(1);
    expect((await s.spent("u1", NOW)).day).toBeCloseTo(pro.dailyUsd + 0.2, 8);
    const over = await s.start("u1", { max: 4, usd: 0.3, now: NOW, limits: pro, id: "b" });
    expect(over.ok).toBe(false);
    expect(over).toMatchObject({ ok: false, why: "over" });
    expect((over as { spent: { day: number } }).spent.day).toBeCloseTo(pro.dailyUsd + 0.2, 8);
    expect(s.inFlight("u1")).toBe(1);
  });
  test("past the running cap start says busy and takes nothing; without limits it takes only a slot", async () => {
    const s = kind.make();
    expect(await s.start("u1", { max: 1, usd: 0, now: NOW, limits: null, id: "a" })).toEqual({ ok: true });
    expect(await s.start("u1", { max: 1, usd: 0.2, now: NOW, limits: pro, id: "b" })).toEqual({ ok: false, why: "busy" });
    expect((await s.spent("u1", NOW)).day).toBe(0);
    await s.finish("u1", { id: "a", now: NOW });
    expect(s.inFlight("u1")).toBe(0);
  });
  test("many starts at once never pass on the same last cent, nor past the cap", async () => {
    const s = kind.make();
    s.setSpent("u1", NOW, { day: pro.dailyUsd - 0.3, month: 1 });
    const r = await Promise.all(Array.from({ length: 5 }, (_, i) => s.start("u1", { max: 4, usd: 0.4, now: NOW, limits: pro, id: `r${i}` })));
    expect(r.filter((x) => x.ok).length).toBe(1);
  });
  test("finish lets go of only its own slot and hold, and books the record with the day and month totals", async () => {
    const s = kind.make();
    await s.start("u1", { max: 4, usd: 0.4, now: NOW, limits: pro, id: "a" });
    await s.start("u1", { max: 4, usd: 0.4, now: NOW, limits: pro, id: "b" });
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
    await s.finish("u1", { id: "a", now: NOW, record: { userId: "u1", model: "claude-sonnet-5-5", usage, usd: 0.05, at: NOW, complete: true } });
    expect(s.inFlight("u1")).toBe(1);
    expect((await s.spent("u1", NOW)).day).toBeCloseTo(0.45, 8);   // b's hold still counts
    await s.finish("u1", { id: "b", now: NOW, record: { userId: "u1", model: "claude-sonnet-5-5", usage, usd: 0.02, at: NOW, complete: true } });
    expect(await s.spent("u1", NOW)).toEqual({ day: 0.07, month: 0.07 });
    expect(s.records.map((r) => r.usd)).toEqual([0.05, 0.02]);
    expect(s.records[0]).toEqual({ userId: "u1", model: "claude-sonnet-5-5", usage, usd: 0.05, at: NOW, complete: true });
    expect(await s.spent("u1", NOW + DAY)).toEqual({ day: 0, month: 0.07 });   // a new day, the same month
    expect(await s.spent("u1", Date.UTC(2026, 11, 1, 0, 0, 1))).toEqual({ day: 0, month: 0 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe("rows written per model request: at most 3 (Durable Objects free plan, 100,000 rows a day)", () => {
  const rowsOf = (s: FakeDurableStore) => [...s.fake.objects.values()].reduce((n, o) => n + o.storage.rows, 0);
  async function measure(t: Rig & { store: FakeDurableStore }, send: () => Promise<Response>) {
    const rows = rowsOf(t.store), calls = t.store.fake.log.length;
    const r = await send();
    await r.text();
    return { status: r.status, rows: rowsOf(t.store) - rows, calls: t.store.fake.log.length - calls };
  }
  const durable = () => new FakeDurableStore(new FakeNamespace(), () => NOW);

  test("a plain reply, a streamed reply, a count, an upstream error: each at most 3 rows and 4 object calls, and booked as before", async () => {
    const t = rig(durable(), { upstream: (body) => (body.includes("STREAM") ? sseResponse(STREAM) : body.includes("FAIL") ? json({ type: "error", error: { type: "overloaded_error", message: "busy" } }, 529) : json({ usage: { input_tokens: 1000, output_tokens: 500 } })) }) as Rig & { store: FakeDurableStore };
    await t.ready;
    const msg = (content: string, extra: Record<string, unknown> = {}) => ({ model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content }], ...extra });
    const cases: [string, () => Promise<Response>][] = [
      ["first of the day", () => t.send({ body: msg("one") })],
      ["plain", () => t.send({ body: msg("two") })],
      ["streamed", () => t.send({ body: msg("STREAM", { stream: true }) })],
      ["count_tokens (refused, audit run 2 finding 3)", () => t.send({ path: "/v1/messages/count_tokens", body: { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "x" }] } })],
      ["upstream error", () => t.send({ body: msg("FAIL") })],
    ];
    const seen: Record<string, { status: number; rows: number; calls: number }> = {};
    for (const [name, send] of cases) seen[name] = await measure(t, send);
    for (const [name, m] of Object.entries(seen)) {
      expect([name, m.rows <= 3]).toEqual([name, true]);
      expect([name, m.calls <= 4]).toEqual([name, true]);
    }
    expect(seen.plain).toEqual({ status: 200, rows: 3, calls: 4 });
    expect(seen.streamed.rows).toBe(3);
    expect(seen["count_tokens (refused, audit run 2 finding 3)"]).toMatchObject({ status: 404, rows: 0 });
    // Metering unchanged: two plain replies and the stream booked, the count and the error not.
    const plainUsd = costOf("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
    const streamUsd = costOf("claude-sonnet-5-5", { input_tokens: 2000, output_tokens: 700, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0, web_search_requests: 0 });
    expect(t.store.records.map((r) => r.usd)).toEqual([plainUsd, plainUsd, streamUsd]);
    const spent = await t.store.spent("u1", NOW);
    expect(spent.day).toBeCloseTo(plainUsd * 2 + streamUsd, 10);
    expect(spent.month).toBeCloseTo(plainUsd * 2 + streamUsd, 10);
    expect(t.store.inFlight("u1")).toBe(0);
  });
  test("a refusal over the limit, or past the running cap, writes no row at all", async () => {
    const t = rig(durable(), { plan: "free" }) as Rig & { store: FakeDurableStore };
    await t.ready;
    t.store.setSpent("u1", NOW, { day: PLANS.free.dailyUsd, month: PLANS.free.dailyUsd });
    const m = await measure(t, () => t.send());
    expect(m).toMatchObject({ status: 402, rows: 0 });

    let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
    const b = rig(durable(), { maxInFlight: 1, upstream: async () => { await gate; return json({ usage: { input_tokens: 1, output_tokens: 1 } }); } }) as Rig & { store: FakeDurableStore };
    await b.ready;
    const first = b.send();
    while (b.forwarded() === 0) await new Promise((r) => setTimeout(r, 1));   // the first one is running
    expect(await measure(b, () => b.send())).toMatchObject({ status: 429, rows: 0 });
    open(); await (await first).text();
  });
  test("old records are dropped once a day, not on every request: the next request is back to 3 rows", async () => {
    let now = NOW;
    const store = new FakeDurableStore(new FakeNamespace(), () => now);
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
    const book = (at: number) => store.record({ userId: "u1", model: "m", usage, usd: 0.01, at, complete: true });
    await book(NOW - RECORD_KEEP_MS - 2 * DAY);   // old by the time of NOW
    const rows = () => rowsOf(store);
    const one = async (id: string) => {
      const before = rows();
      expect((await store.start("u1", { max: 4, usd: 0.1, now, limits: PLANS.pro, id })).ok).toBe(true);
      await store.finish("u1", { id, now, record: { userId: "u1", model: "m", usage, usd: 0.01, at: now, complete: true } });
      return rows() - before;
    };
    expect(await one("a")).toBe(4);   // 3, and the one old record let go
    expect(await one("b")).toBe(3);
    expect(await one("c")).toBe(3);
    expect(store.records.map((r) => r.at)).toEqual([NOW, NOW, NOW]);
    expect(store.fake.storageFor(OWNER("u1")).data.get("live")).toBeDefined();
    expect(dayKey(now)).toBe(dayKey(NOW));
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe("the lighter stream reader", () => {
  const long = (deltas: number) => {
    const parts = [
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m", usage: { input_tokens: 5000, cache_read_input_tokens: 90000, cache_creation_input_tokens: 2000, output_tokens: 1 } } })}\n\n`,
      `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
    ];
    const delta = `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "some words of the reply, " } })}\n\n`;
    for (let i = 0; i < deltas; i++) parts.push(delta);
    if (deltas > 0) parts.push(`event: ping\ndata: {"type": "ping"}\n\n`);
    parts.push(`event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`);
    parts.push(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 64000, server_tool_use: { web_search_requests: 1 } } })}\n\n`);
    parts.push(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
    return enc.encode(parts.join(""));
  };
  const chunks = (bytes: Uint8Array, size: number) => { const out: Uint8Array[] = []; for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size)); return out; };
  const read = (parts: Uint8Array[]) => { const s = new UsageSniffer(); for (const p of parts) s.push(p); s.end(); return s; };
  const WANT = { input_tokens: 5000, output_tokens: 64000, cache_read_input_tokens: 90000, cache_creation_input_tokens: 2000, web_search_requests: 1 };

  test("it counts exactly, however the bytes are cut, and reads only the start, the last update, the stop and an error", () => {
    const bytes = long(500);
    for (const size of [1, 2, 3, 5, 7, 13, 64, 1000, 4096, bytes.length]) {
      const s = read(chunks(bytes, size));
      expect([size, s.usage()]).toEqual([size, WANT]);
      expect(s.complete()).toBe(true);
      expect([size, s.dataLinesRead()]).toEqual([size, 3]);   // message_start, message_delta, message_stop; never a delta, a ping or a block line
    }
  });
  test("a text delta is never read, even one shaped like a usage line", () => {
    const bytes = enc.encode(sse([
      { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "x" }, usage: { output_tokens: 999999 } },
      { type: "message_delta", usage: { output_tokens: 7 } },
      { type: "message_stop" },
    ]));
    const s = read([bytes]);
    expect(s.usage().output_tokens).toBe(7);
    expect(s.dataLinesRead()).toBe(3);
  });
  test("lines ended with \\r\\n, data with no event lines, and an error event still work", () => {
    const crlf = enc.encode(STREAM.replace(/\n/g, "\r\n"));
    const a = read(chunks(crlf, 3));
    expect([a.usage().input_tokens, a.usage().output_tokens, a.complete()]).toEqual([2000, 700, true]);
    const bare = enc.encode(STREAM.split("\n").filter((l) => !l.startsWith("event:")).join("\n"));
    const b = read(chunks(bare, 5));
    expect([b.usage().input_tokens, b.usage().output_tokens, b.complete()]).toEqual([2000, 700, true]);
    const failed = read([enc.encode(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 3, output_tokens: 1 } } })}\n\nevent: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n`)]);
    expect(failed.failedUpstream()).toBe(true);
    expect(failed.complete()).toBe(false);
    expect(failed.usage().input_tokens).toBe(3);
  });
  test("a huge line is dropped, not held, and what follows it is still read", () => {
    const s = new UsageSniffer();
    s.push(enc.encode("event: message_start\ndata: "));
    for (let i = 0; i < 50; i++) s.push(new Uint8Array(100_000).fill(65));
    s.push(enc.encode(`\n\nevent: message_delta\ndata: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 9 } })}\n\n`));
    s.end();
    expect(s.usage().output_tokens).toBe(9);
    expect(s.heldBytes()).toBe(0);
  });

  // An early warning only (V1 settles it on the deployed server): a long fix's reply, read here, with room to spare.
  test("timing: a 64,000 token reply (about 20,000 deltas) is read in well under 10 ms of CPU on this Mac", () => {
    const parts = chunks(long(20_000), 4096);
    const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
    let best = Infinity;
    for (let run = 0; run < 7; run++) {
      const t0 = cpuMs();
      const s = read(parts);
      const ms = cpuMs() - t0;
      expect(s.usage()).toEqual(WANT);
      best = Math.min(best, ms);
    }
    console.log(`[timing] stream reader, 20,000 deltas in 4 KiB chunks: ${best.toFixed(2)} ms of CPU (best of 7)`);
    expect(best).toBeLessThan(3);   // the reader before M116 took about 3.2 ms here
  });
  test("timing: a long fix's request (a 400 KB prompt) is read and checked once, in well under 10 ms of CPU here", () => {
    const turns = Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `step ${i}: ${"the file says something long and plain. ".repeat(50)}` }));
    const raw = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 16000, stream: true, messages: turns });
    expect(raw.length).toBeGreaterThan(400_000);
    const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
    let best = Infinity;
    for (let run = 0; run < 7; run++) {
      const t0 = cpuMs();
      const c = checkRequest("POST", "/v1/messages", raw, "a".repeat(64));
      best = Math.min(best, cpuMs() - t0);
      expect(c.ok).toBe(true);
    }
    console.log(`[timing] request check, ${Math.round(raw.length / 1000)} KB prompt: ${best.toFixed(2)} ms of CPU (best of 7)`);
    expect(best).toBeLessThan(10);
  });
  test("timing: the whole proxy passes a 64,000 token streamed reply through and books it, in under 10 ms of CPU here", async () => {
    const bytes = long(20_000);
    const body = { model: "claude-sonnet-5-5", max_tokens: 64000, stream: true, messages: [{ role: "user", content: "fix it" }] };
    const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
    let best = Infinity, store!: FakeDurableStore;
    for (let run = 0; run < 5; run++) {
      // A fresh account each time: one 64,000 token reply uses up a day of Pro.
      store = new FakeDurableStore(new FakeNamespace(), () => NOW);
      const t = rig(store, { upstream: () => new Response(new ReadableStream({ start(c) { for (const p of chunks(bytes, 4096)) c.enqueue(p); c.close(); } }), { headers: { "content-type": "text/event-stream" } }) });
      await t.ready;
      const t0 = cpuMs();
      const r = await t.send({ body });
      const reader = r.body!.getReader();
      while (!(await reader.read()).done) { /* the app reading */ }
      best = Math.min(best, cpuMs() - t0);
    }
    console.log(`[timing] whole proxy, streamed 64,000 token reply: ${best.toFixed(2)} ms of CPU (best of 5, store stand in included)`);
    expect(store.records.length).toBe(1);
    expect(store.records[0].usage).toEqual(WANT);
    expect(best).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe("payment event ids are kept 48 hours (Dodo retries for about 37)", () => {
  test("both ledgers keep an id for 48 hours and then let it go", async () => {
    expect(WEBHOOK_KEEP_MS).toBe(48 * HOUR);
    expect(MemoryDodoLedger.KEEP_MS).toBe(48 * HOUR);
    let t = NOW;
    const fake = new FakeNamespace();
    for (const l of [new MemoryDodoLedger(() => t), new DurableDodoLedger(fake, () => t)]) {
      t = NOW;
      expect(await l.claim("msg_1")).toBe(true);
      t = NOW + 37 * HOUR;
      expect(await l.claim("msg_1")).toBe(false);
      t = NOW + 47 * HOUR;
      expect(await l.claim("msg_1")).toBe(false);
      t = NOW + 48 * HOUR + 1;
      expect(await l.claim("msg_2")).toBe(true);   // the old one is dropped here
      expect(await l.claim("msg_1")).toBe(true);
    }
  });
  test("a signed event Dodo delivers again 37 hours later (a fresh signature, the same id) is a duplicate and applies nothing", async () => {
    const secret = `whsec_${btoa("dodo-test-secret-key-0123456789")}`;
    let nowSec = Math.floor(NOW / 1000);
    const applied: DodoEntitlement[] = [];
    const hook = createDodoWebhook({ secret: () => secret, products: () => ({ pdt_pro: "pro" }), ledger: new MemoryDodoLedger(() => nowSec * 1000), links: new MemoryLinkBook(), ownerSecret: () => OWNER_SECRET, apply: async (e) => { applied.push(e); }, now: () => nowSec * 1000, log: () => {} });
    const body = JSON.stringify(await withOwnerSig({ business_id: "bus_1", type: "subscription.active", timestamp: new Date(NOW - 10_000).toISOString(), data: { payload_type: "Subscription", subscription_id: "sub_1", product_id: "pdt_pro", status: "active", customer: { customer_id: "cus_1" }, metadata: { companion_user_id: "u9" } } }));
    const deliver = async () => (await (await hook(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest("msg_late", body, secret, nowSec), body }))).json()).outcome;
    expect(await deliver()).toBe("applied");
    nowSec += 37 * 3600;
    expect(DODO_TIMESTAMP_TOLERANCE_SEC).toBeLessThan(37 * 3600);
    expect(await deliver()).toBe("duplicate");
    expect(applied.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// S3 review fixes.
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
const rec = (at: number, usd: number) => ({ userId: "u1", model: "m", usage: USAGE, usd, at, complete: true });
/** A signed in owner "u1": a booking onto an owner with nobody in it (a deleted account) writes nothing (audit run 2, finding 6,
 *  re-attack round 2). */
const withUser = async <S extends TestStore>(s: S): Promise<S> => { await s.addUser((await newToken()).hash, { id: "u1", plan: "free", status: "active" }); return s; };

for (const kind of TEST_STORES) describe(`bookings that arrive out of order at the turn of a day or month: ${kind.name}`, () => {
  test("a day turn: the cost stamped after midnight still counts today, and both count in the month", async () => {
    const s = await withUser(kind.make());
    const midnight = Date.UTC(2026, 10, 20), before = midnight - 100, after = midnight + 100;
    await s.finish("u1", { id: "b", now: after, record: rec(after, 0.3) });   // B, stamped after midnight, lands first
    await s.finish("u1", { id: "a", now: after, record: rec(before, 0.2) });  // A, stamped before, lands second
    const spent = await s.spent("u1", midnight + 1000);
    expect(spent.day).toBeCloseTo(0.3, 10);
    expect(spent.month).toBeCloseTo(0.5, 10);
  });
  test("a month turn: the new month's cost is not lost to the old month's totals", async () => {
    const s = await withUser(kind.make());
    const first = Date.UTC(2026, 11, 1), before = first - 100, after = first + 100;
    await s.finish("u1", { id: "b", now: after, record: rec(after, 0.3) });
    await s.finish("u1", { id: "a", now: after, record: rec(before, 0.2) });
    expect(await s.spent("u1", first + 1000)).toEqual({ day: 0.3, month: 0.3 });
    // and the next booking adds to the new day and month, not to a fresh 0
    await s.finish("u1", { id: "c", now: first + 2000, record: rec(first + 2000, 0.1) });
    const spent = await s.spent("u1", first + 3000);
    expect(spent.day).toBeCloseTo(0.4, 10);
    expect(spent.month).toBeCloseTo(0.4, 10);
  });
});

describe("the totals a record carries (nextTotals)", () => {
  const at = (iso: string) => Date.parse(iso);
  test("same day adds; a newer day starts again; an older day carries the newer totals forward", () => {
    const t = nextTotals(undefined, rec(at("2026-11-19T10:00:00Z"), 1));
    expect(t).toEqual({ day: "2026-11-19", dayUsd: 1, month: "2026-11", monthUsd: 1 });
    expect(nextTotals(t, rec(at("2026-11-19T11:00:00Z"), 2))).toEqual({ day: "2026-11-19", dayUsd: 3, month: "2026-11", monthUsd: 3 });
    expect(nextTotals(t, rec(at("2026-11-20T00:00:00Z"), 2))).toEqual({ day: "2026-11-20", dayUsd: 2, month: "2026-11", monthUsd: 3 });
    expect(nextTotals(t, rec(at("2026-11-18T23:59:59Z"), 2))).toEqual({ day: "2026-11-19", dayUsd: 1, month: "2026-11", monthUsd: 3 });
    expect(nextTotals(t, rec(at("2026-10-31T23:59:59Z"), 2))).toEqual({ day: "2026-11-19", dayUsd: 1, month: "2026-11", monthUsd: 1 });
    expect(nextTotals(t, rec(at("2026-12-01T00:00:00Z"), 2))).toEqual({ day: "2026-12-01", dayUsd: 2, month: "2026-12", monthUsd: 2 });
  });
});

describe("the 90 day keep holds for heavy users", () => {
  test(`more than ${PRUNE_BATCH} old records are all let go in the one daily tidy, ${DELETE_MAX} keys a delete at most`, async () => {
    const store = new FakeDurableStore(new FakeNamespace(), () => NOW);
    const storage = store.fake.storageFor(OWNER("u1"));
    const oldAt = NOW - RECORD_KEEP_MS - 2 * DAY, keptAt = NOW - 10 * DAY, oldCount = PRUNE_BATCH * 2 + 345;
    let seq = 0;
    const put = (at: number) => { seq++; storage.data.set(`rec:${String(seq).padStart(12, "0")}`, { ...rec(at, 0.01), totals: { day: dayKey(at), dayUsd: 0.01, month: monthKey(at), monthUsd: 0.01 } }); };
    for (let i = 0; i < oldCount; i++) put(oldAt + i);
    for (let i = 0; i < 3; i++) put(keptAt + i);
    storage.data.set("live", { running: [], holds: [], seq });
    expect((await store.start("u1", { max: 4, usd: 0.1, now: NOW, limits: PLANS.pro, id: "a" })).ok).toBe(true);
    await store.finish("u1", { id: "a", now: NOW, record: rec(NOW, 0.01) });   // the fake throws on a delete of more than 128 keys
    const left = [...storage.data.keys()].filter((k) => k.startsWith("rec:"));
    expect(left.length).toBe(4);
    expect(store.records.every((r) => r.at >= NOW - RECORD_KEEP_MS)).toBe(true);
  });
  test("a tidy that meets only old records, all of them, stops when there are none left", async () => {
    const store = await withUser(new FakeDurableStore(new FakeNamespace(), () => NOW));
    const storage = store.fake.storageFor(OWNER("u1"));
    const oldAt = NOW - RECORD_KEEP_MS - DAY;
    for (let i = 1; i <= PRUNE_BATCH; i++) storage.data.set(`rec:${String(i).padStart(12, "0")}`, { ...rec(oldAt, 0.01), totals: { day: dayKey(oldAt), dayUsd: 1, month: monthKey(oldAt), monthUsd: 1 } });
    storage.data.set("live", { running: [], holds: [], seq: PRUNE_BATCH });
    await store.finish("u1", { id: "a", now: NOW, record: rec(NOW, 0.01) });
    expect(store.records.map((r) => r.at)).toEqual([NOW]);
    expect(await store.spent("u1", NOW)).toEqual({ day: 0.01, month: 0.01 });
  });
});

for (const kind of TEST_STORES) describe(`a failed booking does not leave the slot taken for 30 minutes: ${kind.name}`, () => {
  test("the store fails the booking and the first let go, then comes back: the slot is let go in the background", async () => {
    const later: Promise<unknown>[] = [];
    const t = rig(kind.make(), { maxInFlight: 1, releaseRetryMs: [5, 5, 5], waitUntil: (p) => later.push(p) }); await t.ready;
    const real = t.store.finish;
    let down = 3;   // the booking, the let go right after it and the one after the reply all fail
    t.store.finish = async (userId, a) => { if (down-- > 0) throw new Error("store hiccup"); return real.call(t.store, userId, a); };
    const r = await t.send();
    expect(r.status).toBe(200);
    await r.text();
    expect(t.events).toContainEqual(expect.objectContaining({ kind: "request", reason: "booking_failed" }));
    await Promise.all(later);
    expect(t.store.inFlight("u1")).toBe(0);
    expect((await t.send()).status).toBe(200);   // not "busy on your other Mac"
    expect(t.events.some((e) => e.reason === "release_failed")).toBe(false);
  });
  test("the booking is never sent twice, so the person is never charged twice", async () => {
    const t = rig(kind.make(), { releaseRetryMs: [1] }); await t.ready;
    const real = t.store.finish;
    let withRecord = 0;
    t.store.finish = async (userId, a) => { if (a.record) { withRecord++; throw new Error("lost reply"); } return real.call(t.store, userId, a); };
    await (await t.send()).text();
    expect(withRecord).toBe(1);
  });
  test("a store that stays down: every try is made, then it is logged; the lease is the last resort", async () => {
    const later: Promise<unknown>[] = [];
    const t = rig(kind.make(), { releaseRetryMs: [1, 1, 1], waitUntil: (p) => later.push(p) }); await t.ready;
    let tries = 0;
    t.store.finish = async () => { tries++; throw new Error("down"); };
    expect((await t.send()).status).toBe(200);
    await Promise.all(later);
    expect(tries).toBeGreaterThanOrEqual(5);   // the booking, the let go now, and three in the background
    expect(t.events).toContainEqual(expect.objectContaining({ kind: "request", reason: "release_failed", userId: "u1" }));
  });
});
