// Audit round 3 (24 Oct 2026): each test here first failed against the code as it was, then the smallest fix made it pass.
import { describe, expect, test } from "bun:test";
import { createProxy, type SafeEvent } from "../src/proxy.ts";
import { MemoryStore, type UsageRecord } from "../src/store.ts";
import { newToken } from "../src/tokens.ts";
import { checkRequest, MAX_BODY_BYTES } from "../src/filter.ts";

const NOW = Date.UTC(2026, 9, 24, 10, 0, 0);
const enc = new TextEncoder();
const BODY = { model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content: "hi" }] };

class FailingRecordStore extends MemoryStore {
  async record(_r: UsageRecord): Promise<void> { throw new Error("store is down"); }
}
async function rig(store: MemoryStore, upstream: (url: string, init?: RequestInit) => Response, opts: { upstreamBase?: string } = {}) {
  const t = await newToken();
  store.addUser(t.hash, { id: "u1", plan: "pro", status: "active" });
  const calls: { url: string; init?: RequestInit }[] = [], events: SafeEvent[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init }); return upstream(String(url), init); }) as unknown as typeof fetch;
  const handle = createProxy({ store, anthropicKey: "sk-ant-api03-OUR-KEY-0000000000000000", enabled: () => true, fetch: fetchFn, now: () => NOW, log: (e) => events.push(e), ...(opts.upstreamBase ? { upstream: opts.upstreamBase } : {}) });
  return { handle, calls, events, token: t.token };
}
const STREAM = [
  { type: "message_start", message: { id: "m", usage: { input_tokens: 2000, output_tokens: 1 } } },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 700 } },
  { type: "message_stop" },
].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const sse = () => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(STREAM)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });

describe("a failing store must not strand a request slot", () => {
  test("if booking the cost of a stream fails, the user's running slot is still given back", async () => {
    const store = new FailingRecordStore();
    const r = await rig(store, () => sse());
    const res = await r.handle(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "x-api-key": r.token }, body: JSON.stringify({ ...BODY, stream: true }) }));
    try { await res.text(); } catch { /* the stream may end with an error: that is fine */ }
    expect(store.inFlight("u1")).toBe(0);
  });
});

describe("the body is read with a cap, not whole", () => {
  test("a body with no length that never ends is refused after the cap and not read to the end", async () => {
    const store = new MemoryStore();
    const r = await rig(store, () => new Response("{}"));
    let pulled = 0;
    const chunk = new Uint8Array(1_000_000).fill(120);
    const body = new ReadableStream<Uint8Array>({ pull(c) { pulled++; if (pulled > 200) { c.close(); return; } c.enqueue(chunk); } });
    const req = new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "x-api-key": r.token }, body, duplex: "half" } as RequestInit);
    const res = await r.handle(req);
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(40);   // MAX_BODY_BYTES is 8 MB; a few extra chunks may already be queued
    expect(r.calls.length).toBe(0);
  });
});

describe("the upstream address", () => {
  test("a request is never sent on to an address that is not https (loopback aside)", async () => {
    const store = new MemoryStore();
    expect(() => createProxy({ store, anthropicKey: "k", enabled: () => true, upstream: "http://api.anthropic.com" })).toThrow();
    expect(() => createProxy({ store, anthropicKey: "k", enabled: () => true, upstream: "ftp://x" })).toThrow();
    expect(() => createProxy({ store, anthropicKey: "k", enabled: () => true, upstream: "https://api.anthropic.com" })).not.toThrow();
    expect(() => createProxy({ store, anthropicKey: "k", enabled: () => true, upstream: "http://127.0.0.1:8787" })).not.toThrow();
  });
  test("Squibby's key is never carried along a redirect", async () => {
    const store = new MemoryStore();
    const r = await rig(store, () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await r.handle(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "x-api-key": r.token }, body: JSON.stringify(BODY) }));
    expect(r.calls[0].init?.redirect).toBe("manual");
  });
});

describe("fields that change what a request costs, which Squibby never sends", () => {
  const ok = (over: Record<string, unknown>) => checkRequest("POST", "/v1/messages", JSON.stringify({ ...BODY, ...over })).ok;
  test("speed and service_tier are refused (the price table counts the standard price only)", () => {
    expect(ok({})).toBe(true);
    expect(ok({ speed: "fast" })).toBe(false);
    expect(ok({ service_tier: "auto" })).toBe(false);
  });
  test("the cap still holds at the edge", () => {
    expect(checkRequest("POST", "/v1/messages", "x".repeat(MAX_BODY_BYTES + 1)).ok).toBe(false);
  });
});

// ---- Dodo ----
import { MemoryDodoLedger, MemoryLinkBook, createDodoWebhook, signDodoForTest, type DodoEntitlement } from "../src/dodo.ts";
describe("Dodo events that arrive at the same moment", () => {
  const SECRET = `whsec_${btoa("dodo-test-secret-key-0123456789")}`;
  const NOWS = 1_800_000_000;
  const iso = (sec: number) => new Date(sec * 1000).toISOString();
  const ev = (type: string, status: string, at: number) => ({ type, timestamp: iso(at), data: { product_id: "pdt_pro", status, customer: { customer_id: "cus_1" }, metadata: { companion_user_id: "u9" } } });
  const post = async (h: (r: Request) => Promise<Response>, e: unknown, id: string) => {
    const body = JSON.stringify(e);
    return h(new Request("https://squibby.test/webhooks/dodo", { method: "POST", headers: await signDodoForTest(id, body, SECRET, NOWS), body }));
  };
  test("an older event that is already being handled cannot overwrite a newer one that finished first", async () => {
    let plan = "none";
    const h = createDodoWebhook({
      secret: () => SECRET, products: () => ({ pdt_pro: "pro" }), ledger: new MemoryDodoLedger(), links: new MemoryLinkBook(), now: () => NOWS * 1000,
      apply: async (e: DodoEntitlement) => { await new Promise((r) => setTimeout(r, e.plan === "free" ? 5 : 20)); plan = e.plan; },   // the older "active" is slower to save
    });
    // cancelled (newer) and active (older) are delivered together; both look at the order before either has saved
    const rs = await Promise.all([post(h, ev("subscription.cancelled", "cancelled", NOWS - 5), "msg_new"), post(h, ev("subscription.active", "active", NOWS - 500), "msg_old")]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(plan).toBe("free");
  });
  test("the list of handled event ids does not grow for ever: ids older than the time window are forgotten", async () => {
    let t = 1_000_000;
    const ledger = new MemoryDodoLedger(() => t * 1000);
    for (let i = 0; i < 50; i++) await ledger.claim(`msg_${i}`);
    expect(ledger.size()).toBe(50);
    t += 3600;   // an hour later no signed copy of those events can pass the five minute window any more
    await ledger.claim("msg_new");
    expect(ledger.size()).toBe(1);
    expect(await ledger.claim("msg_new")).toBe(false);   // a recent id is still remembered
  });
});
