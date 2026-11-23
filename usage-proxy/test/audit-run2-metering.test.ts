// Security audit run 2, findings 3, 6 and 8 (19 Nov 2026): the model proxy's metering.
// 3: count_tokens skipped the budget and wrote rows on every call. The app never calls it, so it is gone.
// 6: the budget hold priced only the output, so large prompts with max_tokens 1 sent at once all passed at zero spend.
//    Re-attack: documents fetched from a link, and PDFs, are billed far beyond their bytes, so only content the body carries
//    (text, base64 images, tool results, the model's own blocks) and a closed list of request fields go through.
// 8: a cache write with a 1 hour ttl was forwarded but booked at the 5 minute rate. Only the 5 minute ttl goes through, and
//    no anthropic-beta header is forwarded (the runner sends none). No network, no real key, every test on both stores.
import { describe, expect, test } from "bun:test";
import { createProxy } from "../src/proxy.ts";
import { checkRequest } from "../src/filter.ts";
import { newToken } from "../src/tokens.ts";
import { PLANS } from "../src/plans.ts";
import { costOf } from "../src/usage.ts";
import { FakeNamespace } from "./fake-do.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const zero = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };

type Seen = { url: string; headers: Headers; body: string };
function rig(store: TestStore, o: { plan?: string; upstream?: (s: Seen) => Promise<Response> | Response } = {}) {
  const seen: Seen[] = [];
  const ready = (async () => { const t = await newToken(); await store.addUser(t.hash, { id: "u1", plan: o.plan ?? "free", status: "active" }); return t.token; })();
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const s = { url: String(url), headers: new Headers(init?.headers), body: String(init?.body ?? "") };
    seen.push(s);
    return o.upstream ? o.upstream(s) : json({ content: [], usage: { input_tokens: 10, output_tokens: 10 } });
  }) as unknown as typeof fetch;
  const handle = createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, fetch: fetchFn, now: () => NOW, log: () => {}, maxInFlight: 4 });
  const send = async (over: { path?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const body = over.body ?? { model: "claude-sonnet-5-5", max_tokens: 1000, messages: [{ role: "user", content: "hi" }] };
    return handle(new Request(`https://proxy.example${over.path ?? "/v1/messages"}`, { method: "POST",
      headers: { "content-type": "application/json", "x-api-key": await ready, ...over.headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  };
  return { store, seen, send, ready };
}
const rowsOf = (s: FakeDurableStore) => [...s.fake.objects.values()].reduce((n, o) => n + o.storage.rows, 0);

// ---- Finding 3: count_tokens ----

describe("finding 3: count_tokens is not forwarded", () => {
  test("the filter refuses the path", () => {
    const r = checkRequest("POST", "/v1/messages/count_tokens", JSON.stringify({ model: "claude-sonnet-5-5", messages: [{ role: "user", content: "hi" }] }));
    expect(r.ok).toBe(false);
    expect((r as { status: number }).status).toBe(404);
  });
  test("an account over its budget gets a refusal, nothing is sent, and no row is written", async () => {
    const store = new FakeDurableStore(new FakeNamespace(), () => NOW);
    const t = rig(store, { upstream: () => json({ input_tokens: 5 }) });
    await t.ready;
    store.setSpent("u1", NOW, { day: PLANS.free.dailyUsd, month: PLANS.free.dailyUsd });
    const before = rowsOf(store);
    for (let i = 0; i < 20; i++) {
      const r = await t.send({ path: "/v1/messages/count_tokens", body: { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "x" }] } });
      expect(r.status).toBe(404);
    }
    expect(t.seen.length).toBe(0);
    expect(rowsOf(store) - before).toBe(0);
  });
});

// ---- Finding 6, re-attack: the filter's own checks ----

describe("finding 6 re-attack: only content the body carries goes through", () => {
  const user = (content: unknown) => JSON.stringify({ model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "user", content }] });
  const refused = (raw: string) => { const r = checkRequest("POST", "/v1/messages", raw); return !r.ok && r.status === 400; };
  const b64img = { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" };
  test("a document or image fetched from a link, or from the Files API, is refused, at any depth", () => {
    for (const source of [{ type: "url", url: "https://attacker.example/a.pdf" }, { type: "file", file_id: "file_abc" }]) {
      expect(refused(user([{ type: "document", source }]))).toBe(true);
      expect(refused(user([{ type: "image", source }]))).toBe(true);
      expect(refused(user([{ type: "tool_result", tool_use_id: "t", content: [{ type: "image", source }] }]))).toBe(true);
    }
  });
  test("a PDF or text document is refused even in base64 (each PDF page is billed as an image; the runner sends none)", () => {
    expect(refused(user([{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "A".repeat(20_000) } }]))).toBe(true);
    expect(refused(user([{ type: "document", source: { type: "text", media_type: "text/plain", data: "hi" } }]))).toBe(true);
    expect(refused(user([{ type: "tool_result", tool_use_id: "t", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "AA" } }] }]))).toBe(true);
  });
  test("other block kinds that pull content from elsewhere are refused (search results, container uploads, unknown kinds)", () => {
    expect(refused(user([{ type: "container_upload", file_id: "file_abc" }]))).toBe(true);
    expect(refused(user([{ type: "search_result", source: "https://x.example", title: "t", content: [{ type: "text", text: "x" }] }]))).toBe(true);
    expect(refused(user([{ type: "something_new", text: "x" }]))).toBe(true);
    expect(refused(JSON.stringify({ model: "claude-opus-5-5", max_tokens: 1, system: [{ type: "document", source: { type: "url", url: "https://a.example/a.pdf" } }], messages: [{ role: "user", content: "hi" }] }))).toBe(true);
    expect(refused(JSON.stringify({ model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "assistant", content: [{ type: "document", source: { type: "url", url: "https://a.example/a.pdf" } }] }, { role: "user", content: "hi" }] }))).toBe(true);
  });
  test("an image must be base64 with an image media type", () => {
    expect(refused(user([{ type: "image", source: { type: "base64", media_type: "application/pdf", data: "AA" } }]))).toBe(true);
    expect(refused(user([{ type: "image" }]))).toBe(true);
  });
  test("what the runner sends still goes through: text, base64 screenshots, tool results, and the model's own blocks sent back", () => {
    const ok = (raw: string) => checkRequest("POST", "/v1/messages", raw).ok;
    expect(ok(user("hi"))).toBe(true);
    expect(ok(user([{ type: "image", source: b64img }, { type: "text", text: "what is this?", cache_control: { type: "ephemeral" } }]))).toBe(true);
    expect(ok(JSON.stringify({ model: "claude-opus-5-5", max_tokens: 100, system: [{ type: "text", text: "s", cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" }, output_config: { effort: "high" }, stream: true,
      messages: [
        { role: "user", content: "fix it" },
        { role: "assistant", content: [{ type: "thinking", thinking: "t", signature: "sig" }, { type: "redacted_thinking", data: "x" }, { type: "text", text: "ok" }, { type: "tool_use", id: "t1", name: "read", input: { path: "a" } },
          { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } }, { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://a.example", title: "a", encrypted_content: "e" }] }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "text" }, { type: "tool_result", tool_use_id: "t2", is_error: true, content: [{ type: "text", text: "x" }, { type: "image", source: b64img }] }] },
      ] }))).toBe(true);
  });
  test("an image shape outside a real image block (here inside a tool_use input, which is billed as text) is priced as text", () => {
    const data = "A".repeat(600_000);
    const raw = JSON.stringify({ model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "assistant", content: [{ type: "tool_use", id: "t", name: "x", input: { type: "image", source: { type: "base64", media_type: "image/png", data } } }] }, { role: "user", content: "hi" }] });
    const r = checkRequest("POST", "/v1/messages", raw);
    expect(r.ok && r.inputTokens).toBeGreaterThanOrEqual(data.length / 3);
  });
  test("request fields that change the price (inference_geo) or that Companion never sends are refused", () => {
    const base = { model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
    for (const extra of [{ inference_geo: "us" }, { context_management: { edits: [] } }, { some_new_field: 1 }])
      expect(refused(JSON.stringify({ ...base, ...extra }))).toBe(true);
    for (const extra of [{ temperature: 0.2 }, { stop_sequences: ["x"] }, { top_p: 0.9 }, { top_k: 5 }])
      expect(checkRequest("POST", "/v1/messages", JSON.stringify({ ...base, ...extra })).ok).toBe(true);
  });
});

for (const kind of TEST_STORES) describe(kind.name, () => {

// ---- Finding 6: the hold covers the prompt too ----

describe("finding 6: the budget hold counts the prompt", () => {
  const BIG = "word ".repeat(114_000);   // about 570 KB: about 190,000 tokens by the estimate
  test("4 large prompts with max_tokens 1 sent at once stay under the day's limit plus one request", async () => {
    let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
    const t = rig(kind.make(), { upstream: async () => { await gate; return json({ content: [], usage: { input_tokens: 190_000, output_tokens: 1 } }); } });
    await t.ready;
    const body = { model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "user", content: BIG }] };
    const all = Promise.all([0, 1, 2, 3].map(() => t.send({ body })));
    await new Promise((r) => setTimeout(r, 20));
    open();
    const rs = await all;
    await Promise.all(rs.map((r) => r.text()));
    const one = costOf("claude-opus-5-5", { ...zero, input_tokens: 190_000, output_tokens: 1 });
    const spent = await t.store.spent("u1", NOW);
    expect(spent.day).toBeLessThanOrEqual(PLANS.free.dailyUsd + one);
    expect(rs.filter((r) => r.status === 402).length).toBeGreaterThanOrEqual(3);
  });
  test("a prompt that fits what is left goes through; the same prompt past what is left is refused before anything is sent", async () => {
    const t = rig(kind.make());
    await t.ready;
    const body = { model: "claude-sonnet-5-5", max_tokens: 1000, messages: [{ role: "user", content: "word ".repeat(18_000) }] };   // ~30k tokens, ~$0.06
    expect((await t.send({ body })).status).toBe(200);
    t.store.setSpent("u1", NOW, { day: PLANS.free.dailyUsd - 0.03, month: PLANS.free.dailyUsd - 0.03 });
    const sent = t.seen.length;
    const r = await t.send({ body });
    expect(r.status).toBe(402);
    expect(t.seen.length).toBe(sent);
    // A small request still fits in the same room.
    expect((await t.send()).status).toBe(200);
  });
  test("a screenshot's base64 bytes are not priced as text: a request with one large image still goes through on Free", async () => {
    const t = rig(kind.make());
    await t.ready;
    const data = "A".repeat(3_000_000);
    const body = { model: "claude-sonnet-5-5", max_tokens: 1000, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data } }, { type: "text", text: "what is this?" }] }] };
    expect((await t.send({ body })).status).toBe(200);
  });
});

// ---- Finding 6, re-attack: content the body does not carry ----

describe("finding 6 re-attack: content fetched from a link, or a PDF, is refused before anything is sent", () => {
  const urlDocs = { model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "user", content: [
    ...Array.from({ length: 20 }, (_, i) => ({ type: "document", source: { type: "url", url: `https://attacker.example/p${i}.pdf` } })),
    { type: "text", text: "hi" }] }] };
  test("4 parallel requests with 20 linked documents each, max_tokens 1, Free at zero spend: all refused, nothing sent, nothing booked", async () => {
    let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
    const t = rig(kind.make(), { upstream: async () => { await gate; return json({ content: [], usage: { input_tokens: 190_000, output_tokens: 1 } }); } });
    await t.ready;
    const all = Promise.all([0, 1, 2, 3].map(() => t.send({ body: urlDocs })));
    await new Promise((r) => setTimeout(r, 20));
    open();
    const rs = await all;
    await Promise.all(rs.map((r) => r.text()));
    expect(rs.map((r) => r.status)).toEqual([400, 400, 400, 400]);
    expect(t.seen.length).toBe(0);
    expect((await t.store.spent("u1", NOW)).day).toBe(0);
  });
  test("sent one after another, the same request is refused every time", async () => {
    const t = rig(kind.make(), { upstream: () => json({ content: [], usage: { input_tokens: 190_000, output_tokens: 1 } }) });
    await t.ready;
    for (let i = 0; i < 3; i++) expect((await t.send({ body: urlDocs })).status).toBe(400);
    expect(t.seen.length).toBe(0);
    expect((await t.store.spent("u1", NOW)).day).toBe(0);
  });
});

// ---- Finding 8: cache ttl and beta headers ----

describe("finding 8: only the 5 minute cache goes through, and no beta header", () => {
  const msg = (extra: Record<string, unknown>) => ({ model: "claude-sonnet-5-5", max_tokens: 100, messages: [{ role: "user", content: "hi" }], ...extra });
  test("a 1 hour ttl at any depth is refused before anything is sent", async () => {
    const t = rig(kind.make());
    const cc = { type: "ephemeral", ttl: "1h" };
    const bodies = [
      msg({ system: [{ type: "text", text: "x", cache_control: cc }] }),
      msg({ messages: [{ role: "user", content: [{ type: "text", text: "x", cache_control: cc }] }] }),
      msg({ messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: [{ type: "text", text: "x", cache_control: cc }] }] }] }),
      msg({ cache_control: cc }),
      msg({ system: [{ type: "text", text: "x", cache_control: { type: "ephemeral", ttl: "60m" } }] }),
      msg({ system: [{ type: "text", text: "x", cache_control: { type: "ephemeral", ttl: 3600 } }] }),
      msg({ system: [{ type: "text", text: "x", cache_control: { type: "ephemeral", other: 1 } }] }),
    ];
    for (const b of bodies) { const r = await t.send({ body: b }); expect([r.status, JSON.stringify(b).slice(0, 80)]).toEqual([400, JSON.stringify(b).slice(0, 80)]); }
    // A key spelled with a JSON escape is the same key once read.
    const escaped = JSON.stringify(msg({ system: [{ type: "text", text: "x", cache_control: cc }] })).replace("cache_control", "cache\\u005fcontrol");
    expect((await t.send({ body: escaped })).status).toBe(400);
    expect(t.seen.length).toBe(0);
  });
  test("the 5 minute cache (no ttl, or ttl 5m) still goes through, as the runner sends it", async () => {
    const t = rig(kind.make());
    expect((await t.send({ body: msg({ system: [{ type: "text", text: "x", cache_control: { type: "ephemeral" } }] }) })).status).toBe(200);
    expect((await t.send({ body: msg({ system: [{ type: "text", text: "x", cache_control: { type: "ephemeral", ttl: "5m" } }] }) })).status).toBe(200);
    expect(t.seen.length).toBe(2);
  });
  test("an anthropic-beta header from the client is never forwarded", async () => {
    const t = rig(kind.make());
    const r = await t.send({ headers: { "anthropic-beta": "extended-cache-ttl-2025-04-11,context-1m-2025-08-07" } });
    expect(r.status).toBe(200);
    expect(t.seen[0].headers.get("anthropic-beta")).toBeNull();
  });
});

});
