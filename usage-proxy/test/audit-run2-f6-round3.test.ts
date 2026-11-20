// Audit run 2, finding 6, re-attack round 3 (docs/security/2026-11-19-usage-proxy-run-2.md). A streamed request the client
// cancels before Anthropic's first event (message_start, which carries the prompt's input_tokens) was booked with no prompt at
// all: a stream cut short had only its output raised to max_tokens. The prompt estimate was held while the request ran and then
// let go, so large prompts with max_tokens 1, sent one after another and cancelled at once, passed the day's limit for free.
// The three reproductions from the re-attack round are ported here, with the same pattern checked where else it can happen:
// a cut short stream with a cache marker or the search tool, and a reply that is not streamed whose body breaks while read.
import { describe, expect, test } from "bun:test";
import { createProxy, holdOf } from "../src/proxy.ts";
import { checkRequest } from "../src/filter.ts";
import { newToken } from "../src/tokens.ts";
import { PLANS } from "../src/plans.ts";
import { costOf } from "../src/usage.ts";
import { WEB_SEARCH_TOOL } from "../../runner/src/models.ts";
import { TEST_STORES, type TestStore } from "./stores.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const enc = new TextEncoder();
const zero = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
const PROMPT_TOKENS = 85_000;

/** Anthropic answers with headers at once and sends message_start (with the real input_tokens) `ms` later. */
const slowStart = (ms: number, inputTokens = PROMPT_TOKENS) => new Response(new ReadableStream({ async start(c) {
  await new Promise((r) => setTimeout(r, ms));
  try {
    c.enqueue(enc.encode(`event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":${inputTokens},"output_tokens":1}}}\n\n`));
    c.enqueue(enc.encode(`event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":1}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`));
    c.close();
  } catch { /* cancelled */ }
} }), { headers: { "content-type": "text/event-stream" } });

async function setUp(make: () => TestStore, fetchFn: typeof fetch) {
  const store = make();
  const t = await newToken();
  await store.addUser(t.hash, { id: "u1", plan: "free", status: "active" });
  const handle = createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, fetch: fetchFn, now: () => NOW, log: () => {}, maxInFlight: 4 });
  const send = (body: string) => handle(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": t.token }, body }));
  return { store, send };
}
const settle = () => new Promise((x) => setTimeout(x, 50));
const checkedOf = (body: string) => { const c = checkRequest("POST", "/v1/messages", body); if (!c.ok) throw new Error(`refused: ${c.message}`); return c; };

for (const { name, make } of TEST_STORES) describe(`finding 6 round 3 (${name}): a stream cut short before message_start`, () => {
  test("re-attack 0: the prompt is booked when the client cancels before the first event, so the day's limit stops it", async () => {
    const { store, send } = await setUp(make, (async () => slowStart(40)) as unknown as typeof fetch);
    const body = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1, stream: true, messages: [{ role: "user", content: "word ".repeat(PROMPT_TOKENS * 3 / 5) }] });
    const { need } = holdOf(checkedOf(body));
    let passed = 0;
    for (let i = 0; i < 20; i++) {
      const r = await send(body);
      if (r.status !== 200) { await r.text(); break; }
      passed++;
      await r.body!.cancel();
      await new Promise((x) => setTimeout(x, 80));
    }
    expect(store.records[0].usd).toBeGreaterThanOrEqual(need);
    expect(passed).toBeLessThanOrEqual(Math.ceil(PLANS.free.dailyUsd / need) + 1);
  });

  test("re-attack 1: serial large prompts with max_tokens 1 cannot pass the day's limit", async () => {
    const { store, send } = await setUp(make, (async () => slowStart(200)) as unknown as typeof fetch);
    const body = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1, stream: true, messages: [{ role: "user", content: "word ".repeat(Math.floor(PROMPT_TOKENS * 3 / 5)) }] });
    let passed = 0;
    for (let i = 0; i < 10; i++) {
      const r = await send(body);
      if (r.status !== 200) { await r.text(); break; }
      passed++;
      await r.body!.cancel();
      await new Promise((x) => setTimeout(x, 300));
    }
    const billed = passed * costOf("claude-sonnet-5-5", { ...zero, input_tokens: PROMPT_TOKENS, output_tokens: 1 });
    expect(store.records.every((x) => x.usage.input_tokens + x.usage.cache_creation_input_tokens >= PROMPT_TOKENS * 0.9)).toBe(true);
    expect(billed).toBeLessThanOrEqual(PLANS.free.dailyUsd * 2);
  });

  test("re-attack 2: cancelling before message_start books at least what Anthropic bills for the prompt", async () => {
    let billedInput = 0;
    const fetchFn = (async (_u: string, init: RequestInit) => {
      billedInput += checkedOf(init.body as string).inputTokens;   // the proxy's own estimate, so no tokenizer guess
      return new Response(new ReadableStream({ start() { /* message_start has not arrived when the client leaves */ } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;
    const { store, send } = await setUp(make, fetchFn);
    const body = JSON.stringify({ model: "claude-opus-5-5", max_tokens: 1, stream: true, messages: [{ role: "user", content: "word ".repeat(27_000) }] });
    let passed = 0;
    for (let i = 0; i < 20; i++) {
      const r = await send(body);
      if (r.status !== 200) { await r.text(); continue; }
      passed++;
      await r.body!.cancel();
      await new Promise((x) => setTimeout(x, 5));
    }
    const spent = await store.spent("u1", NOW);
    const real = costOf("claude-opus-5-5", { ...zero, input_tokens: billedInput, output_tokens: passed });
    expect(spent.day).toBeGreaterThanOrEqual(real - 1e-9);
    expect(real).toBeLessThanOrEqual(PLANS.free.dailyUsd + real / passed);
  });

  test("a prompt with a cache marker, cut short before message_start, is booked as a cache write", async () => {
    const { store, send } = await setUp(make, (async () => slowStart(200)) as unknown as typeof fetch);
    const body = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1, stream: true, messages: [{ role: "user", content: [{ type: "text", text: "word ".repeat(30_000), cache_control: { type: "ephemeral" } }] }] });
    const c = checkedOf(body);
    expect(c.cacheWrite).toBe(true);
    const r = await send(body);
    expect(r.status).toBe(200);
    await r.body!.cancel();
    await settle();
    expect(store.records.length).toBe(1);
    expect(store.records[0].usage.cache_creation_input_tokens).toBeGreaterThanOrEqual(c.inputTokens);
    expect(store.records[0].usd).toBeGreaterThanOrEqual(holdOf(c).need);
  });

  test("a search request cut short books every search it allowed and room for their results", async () => {
    const { store, send } = await setUp(make, (async () => slowStart(200, 50)) as unknown as typeof fetch);
    const body = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1, stream: true, tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 3 }], messages: [{ role: "user", content: "look this up" }] });
    const c = checkedOf(body);
    expect(c.searches).toBe(3);
    const r = await send(body);
    expect(r.status).toBe(200);
    await r.body!.cancel();
    await settle();
    const u = store.records[0].usage;
    expect(u.web_search_requests).toBe(3);
    expect(u.input_tokens).toBeGreaterThanOrEqual(c.inputTokens + c.searchTokens);
    expect(store.records[0].usd).toBeGreaterThanOrEqual(holdOf(c).worst - 1e-9);
  });

  test("a stream cut short after message_start keeps Anthropic's own prompt count, not the estimate", async () => {
    const real = 1234;
    const fetchFn = (async () => new Response(new ReadableStream({ start(c) {
      c.enqueue(enc.encode(`event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":${real},"output_tokens":1}}}\n\n`));
    } }), { headers: { "content-type": "text/event-stream" } })) as unknown as typeof fetch;
    const { store, send } = await setUp(make, fetchFn);
    const body = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 50, stream: true, messages: [{ role: "user", content: "word ".repeat(6000) }] });
    expect(checkedOf(body).inputTokens).toBeGreaterThan(real);
    const r = await send(body);
    const reader = r.body!.getReader();
    await reader.read();   // message_start has reached the client
    await reader.cancel();
    await settle();
    expect(store.records[0].usage).toEqual({ ...zero, input_tokens: real, output_tokens: 50 });
  });

  test("a reply that is not streamed, whose body breaks while it is read, is booked as the whole request", async () => {
    const fetchFn = (async () => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode('{"id":"msg_1",')); c.error(new Error("connection reset")); } }),
      { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const { store, send } = await setUp(make, fetchFn);
    const body = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 100, messages: [{ role: "user", content: "word ".repeat(30_000) }] });
    const c = checkedOf(body);
    const r = await send(body);
    expect(r.status).toBe(502);
    await r.text();
    await settle();
    expect(store.records.length).toBe(1);
    expect(store.records[0].complete).toBe(false);
    expect(store.records[0].usage.input_tokens).toBeGreaterThanOrEqual(c.inputTokens);
    expect(store.records[0].usage.output_tokens).toBe(100);
    expect(store.inFlight("u1")).toBe(0);
  });
});
