import { describe, expect, test } from "bun:test";
import { createProxy, type SafeEvent } from "../src/proxy.ts";
import { MemoryStore } from "../src/store.ts";
import { newToken } from "../src/tokens.ts";
import { PLANS } from "../src/plans.ts";
import { costOf } from "../src/usage.ts";
import { PRODUCT_S } from "../src/names.ts";
import { deriveUserId, USER_ID_SECRET_SETTING } from "../src/userid.ts";

const OUR_KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
const PROMPT_MARK = "PROMPT-MARKER-9f3c", REPLY_MARK = "REPLY-MARKER-77ab";
const NOW = Date.UTC(2026, 9, 22, 10, 0, 0);
const enc = new TextEncoder();
const USER_ID_SECRET = "operator-secret-for-tests-0123456789abcdef";

type Seen = { url: string; headers: Headers; body: string };
function rig(o: { plan?: string; status?: "active" | "past_due" | "canceled" | "revoked" | "suspended"; owner?: string; secret?: string | null; enabled?: boolean; maxInFlight?: number; upstream?: (s: Seen) => Promise<Response> | Response } = {}) {
  const store = new MemoryStore();
  const seen: Seen[] = [], events: SafeEvent[] = [];
  const ready = (async () => {
    const t = await newToken();
    store.addUser(t.hash, { id: o.owner ?? "u1", plan: o.plan ?? "pro", status: o.status ?? "active" });
    return t.token;
  })();
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const s = { url: String(url), headers: new Headers(init?.headers), body: String(init?.body ?? "") };
    seen.push(s);
    return o.upstream ? o.upstream(s) : json({ id: "m", content: [{ type: "text", text: REPLY_MARK }], usage: { input_tokens: 1000, output_tokens: 500 } });
  }) as unknown as typeof fetch;
  const handle = createProxy({ store, anthropicKey: OUR_KEY, userIdSecret: o.secret === null ? undefined : (o.secret ?? USER_ID_SECRET), enabled: () => o.enabled ?? true, fetch: fetchFn, now: () => NOW, log: (e) => events.push(e), maxInFlight: o.maxInFlight ?? 4 });
  const send = async (over: { token?: string | null; path?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const token = over.token === undefined ? await ready : over.token;
    const body = over.body === undefined ? { model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content: PROMPT_MARK }] } : over.body;
    return handle(new Request(`https://proxy.example${over.path ?? "/v1/messages"}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-api-key": token } : {}), ...over.headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  };
  return { store, seen, events, send, token: () => ready };
}
const json = (b: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...h } });
const sse = (events: unknown[]) => events.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const STREAM = sse([
  { type: "message_start", message: { id: "m", usage: { input_tokens: 2000, cache_read_input_tokens: 8000, output_tokens: 1 } } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: REPLY_MARK } },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 700 } },
  { type: "message_stop" },
]);
const sseResponse = (text: string) => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(text)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
const errBody = async (r: Response) => (await r.json()) as { type: string; error: { type: string; message: string } };

describe("who may use it", () => {
  test("switched off: nothing is forwarded, and the message says what to do", async () => {
    const t = rig({ enabled: false });
    const r = await t.send();
    expect(r.status).toBe(503);
    expect((await errBody(r)).error.message).toMatch(/own Claude key/i);
    expect(t.seen.length).toBe(0);
  });
  test("no token, an unknown token, a real Anthropic key, a canceled or revoked user: refused, nothing forwarded", async () => {
    for (const [name, o] of [["none", { token: null }], ["unknown", { token: `cmp_${"z".repeat(40)}` }], ["anthropic key", { token: "sk-ant-api03-whatever-0000000000" }]] as const) {
      const t = rig(); const r = await t.send(o); expect([name, r.status]).toEqual([name, 401]); expect(t.seen.length).toBe(0);
    }
    for (const status of ["canceled", "revoked"] as const) {
      const t = rig({ status }); const r = await t.send(); expect([status, r.status]).toEqual([status, 403]); expect(t.seen.length).toBe(0);
    }
  });
  test("a user whose payment is late still works (a short grace); only canceled and revoked do not", async () => {
    const t = rig({ status: "past_due" }); expect((await t.send()).status).toBe(200);
  });
});

describe("what is forwarded", () => {
  test(`${PRODUCT_S} key replaces the user's token; the token, cookies and other headers never reach Anthropic`, async () => {
    const t = rig(); const token = await t.token();
    await t.send({ headers: { cookie: "session=abc", "x-forwarded-for": "1.2.3.4", "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31,foo bar" } });
    const s = t.seen[0];
    expect(s.url).toBe("https://api.anthropic.com/v1/messages");
    expect(s.headers.get("x-api-key")).toBe(OUR_KEY);
    expect(s.headers.get("authorization")).toBeNull();
    expect(s.headers.get("cookie")).toBeNull();
    expect(s.headers.get("x-forwarded-for")).toBeNull();
    expect(s.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(s.headers.get("anthropic-beta")).toBe("prompt-caching-2024-07-31,foo bar".replace(" ", ""));   // spaces are not valid in a beta list, so they are removed
    expect([...s.headers.values()].join(" ")).not.toContain(token);
  });
  test("the query beta=true that Claude Code adds is passed on, any other query is dropped", async () => {
    const t = rig(); await t.send({ path: "/v1/messages?beta=true" }); await t.send({ path: "/v1/messages?x=1&beta=true" }); await t.send({ path: "/v1/messages?x=1" });
    expect(t.seen[0].url).toBe("https://api.anthropic.com/v1/messages?beta=true");
    expect(t.seen[1].url).toBe("https://api.anthropic.com/v1/messages?beta=true");
    expect(t.seen[2].url).toBe("https://api.anthropic.com/v1/messages");
  });
  test("max_tokens is clamped in what is sent; the body is otherwise the same", async () => {
    const t = rig(); await t.send({ body: { model: "claude-sonnet-5-5", max_tokens: 900000, messages: [{ role: "user", content: PROMPT_MARK }] } });
    const sent = JSON.parse(t.seen[0].body); expect(sent.max_tokens).toBeLessThanOrEqual(64000); expect(sent.messages[0].content).toBe(PROMPT_MARK);
  });
  test("a disallowed path or model never reaches Anthropic", async () => {
    const t = rig();
    expect((await t.send({ path: "/v1/files" })).status).toBe(404);
    expect((await t.send({ body: { model: "gpt-4", max_tokens: 5, messages: [] } })).status).toBe(400);
    expect((await t.send({ body: "not json" })).status).toBe(400);
    expect(t.seen.length).toBe(0);
  });
  test("our key is never in anything the user gets back", async () => {
    const t = rig({ upstream: () => json({ type: "error", error: { type: "authentication_error", message: "bad" } }, 401, { "x-api-key": OUR_KEY, "set-cookie": "a=b" }) });
    const r = await t.send();
    expect([...r.headers.entries()].join(" ")).not.toContain(OUR_KEY);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.text()).not.toContain(OUR_KEY);
  });
});

describe("metadata.user_id: who the request is for, without saying who", () => {
  const sentBody = (t: ReturnType<typeof rig>, i = 0) => JSON.parse(t.seen[i].body);
  const base = (over: Record<string, unknown> = {}) => ({ model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content: PROMPT_MARK }], ...over });
  test("every forwarded message request carries the derived id, plain and streamed", async () => {
    const t = rig({ upstream: () => sseResponse(STREAM) });
    await (await t.send({ body: base({ stream: true }) })).text();
    await (await t.send({ body: base() })).text();
    expect(t.seen.length).toBe(2);
    const want = await deriveUserId("u1", USER_ID_SECRET);
    for (const i of [0, 1]) expect(sentBody(t, i).metadata).toEqual({ user_id: want });
  });
  test("whatever the client sent as metadata is replaced: a client can neither choose its id nor borrow someone else's", async () => {
    const someoneElse = await deriveUserId("u2", USER_ID_SECRET);
    for (const metadata of [{ user_id: someoneElse }, { user_id: "jane@example.com", extra: "x" }, { user_id: null }, "text", [1], { }]) {
      const t = rig(); await t.send({ body: base({ metadata }) });
      expect(sentBody(t).metadata, JSON.stringify(metadata)).toEqual({ user_id: await deriveUserId("u1", USER_ID_SECRET) });
    }
  });
  test("the id is stable for one person and different between people; no email or name is in what is sent", async () => {
    const a = rig({ owner: "owner-1" }), a2 = rig({ owner: "owner-1" }), b = rig({ owner: "owner-2" }), e = rig({ owner: "jane.doe@example.com" });
    for (const t of [a, a2, b, e]) await t.send();
    const id = (t: ReturnType<typeof rig>) => sentBody(t).metadata.user_id as string;
    expect(id(a)).toBe(id(a2));
    expect(id(a)).not.toBe(id(b));
    expect(id(e)).toMatch(/^[0-9a-f]{64}$/);
    expect(t_has(e.seen[0].body, "jane")).toBe(false);
    expect(t_has(e.seen[0].body, "example.com")).toBe(false);
  });
  test("a different operator secret gives different ids for the same person", async () => {
    const a = rig(), b = rig({ secret: "another-operator-secret-0123456789abcdefgh" });
    await a.send(); await b.send();
    expect(sentBody(a).metadata.user_id).not.toBe(sentBody(b).metadata.user_id);
  });
  test("everything else in the request is untouched (max_tokens is still clamped, as before)", async () => {
    const t = rig(); const original = base({ stream: false, system: "be brief", temperature: 0.2, max_tokens: 900000 });
    await t.send({ body: original });
    const { metadata, max_tokens, ...rest } = sentBody(t); const { max_tokens: _m, ...origRest } = original as any;
    expect(rest).toEqual(origRest); expect(max_tokens).toBe(64000); expect(metadata.user_id).toMatch(/^[0-9a-f]{64}$/);
  });
  test("no secret, or a short one: nothing is forwarded, the user gets a plain sentence, and nothing is charged", async () => {
    for (const secret of [null, "", "short"]) {
      const t = rig({ secret }); const r = await t.send();
      expect([String(secret), r.status]).toEqual([String(secret), 503]);
      const m = (await errBody(r)).error.message;
      expect(m).toMatch(/not ready/i); expect(m).toMatch(/nothing was sent/i); expect(m).not.toContain(USER_ID_SECRET_SETTING);
      expect(t.seen.length).toBe(0); expect(t.store.records.length).toBe(0); expect(t.store.inFlight("u1")).toBe(0);
      expect(t.events.map((e) => e.reason)).toContain("no_user_id_secret");
    }
  });
  test("switched off still comes first: with the switch off the message is the switch's, not the secret's", async () => {
    const t = rig({ enabled: false, secret: null }); const r = await t.send();
    expect((await errBody(r)).error.message).toMatch(/own Claude key/i);
  });
  test("counting tokens: that endpoint documents no metadata field, so none is sent, even if the client sent one", async () => {
    const t = rig({ upstream: () => json({ input_tokens: 5 }) });
    await t.send({ path: "/v1/messages/count_tokens", body: { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "x" }], metadata: { user_id: "evil" } } });
    expect(t.seen.length).toBe(1); expect("metadata" in sentBody(t)).toBe(false);
  });
  test("the derived id and the secret are never in a log event, a stored record, or anything the user gets back", async () => {
    const t = rig(); const r = await t.send(); const text = await r.text();
    const id = await deriveUserId("u1", USER_ID_SECRET);
    const kept = JSON.stringify({ events: t.events, store: t.store.dump(), text, headers: [...r.headers.entries()] });
    expect(kept).not.toContain(id); expect(kept).not.toContain(USER_ID_SECRET);
  });
  test("a suspended person is refused with a plain message and nothing is forwarded", async () => {
    const t = rig({ status: "suspended" }); const r = await t.send();
    expect(r.status).toBe(403); expect((await errBody(r)).error.message).toMatch(/paused|suspended/i);
    expect(t.seen.length).toBe(0);
  });
  test("the body is still never in a log event or stored record (the id adds no text)", async () => {
    const t = rig(); await t.send({ body: base({ metadata: { user_id: PROMPT_MARK } }) }).then((r) => r.text());
    expect(JSON.stringify({ events: t.events, store: t.store.dump() })).not.toContain(PROMPT_MARK);
  });
});
const t_has = (body: string, s: string) => body.toLowerCase().includes(s);

describe("money", () => {
  test("a plain reply is charged by its token counts at the app's price table, and the spend adds up", async () => {
    const t = rig(); await t.send(); await t.send();
    const each = costOf("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
    expect(t.store.records.length).toBe(2);
    expect(t.store.records[0].usd).toBeCloseTo(each, 8);
    expect((await t.store.spent("u1", NOW)).day).toBeCloseTo(each * 2, 8);
    expect((await t.store.spent("u1", NOW)).month).toBeCloseTo(each * 2, 8);
  });
  test("a streamed reply passes through byte for byte and is charged from its events", async () => {
    const t = rig({ upstream: () => sseResponse(STREAM) });
    const r = await t.send({ body: { model: "claude-sonnet-5-5", max_tokens: 2000, stream: true, messages: [{ role: "user", content: PROMPT_MARK }] } });
    expect(await r.text()).toBe(STREAM);
    const want = costOf("claude-sonnet-5-5", { input_tokens: 2000, output_tokens: 700, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0, web_search_requests: 0 });
    expect(t.store.records[0].usd).toBeCloseTo(want, 8);
    expect(t.store.records[0].complete).toBe(true);
    expect(t.store.inFlight("u1")).toBe(0);
  });
  test("a client that goes away mid stream is still charged for what was used, and the slot is freed", async () => {
    const t = rig({ upstream: () => new Response(new ReadableStream({ async start(c) { c.enqueue(enc.encode(STREAM.split("event: content_block_delta")[0])); await new Promise((r) => setTimeout(r, 50)); try { c.enqueue(enc.encode("more")); c.close(); } catch { /* cancelled */ } } }), { headers: { "content-type": "text/event-stream" } }) });
    const r = await t.send({ body: { model: "claude-sonnet-5-5", max_tokens: 2000, stream: true, messages: [] } });
    const reader = r.body!.getReader(); await reader.read(); await reader.cancel();
    await new Promise((x) => setTimeout(x, 20));
    expect(t.store.records.length).toBe(1);
    expect(t.store.records[0].complete).toBe(false);
    expect(t.store.records[0].usd).toBeGreaterThan(0);
    expect(t.store.inFlight("u1")).toBe(0);
  });
  test("at the daily limit the next request is refused with a plain message and never reaches Anthropic", async () => {
    const t = rig({ plan: "free" });
    t.store.setSpent("u1", NOW, { day: PLANS.free.dailyUsd, month: 0.5 });
    const r = await t.send();
    expect(r.status).toBe(402);
    const b = await errBody(r);
    expect(b.error.type).toBe("billing_error");
    expect(b.error.message).toMatch(/today/i);
    expect(r.headers.get("x-companion-resets-at")).toBe(new Date(Date.UTC(2026, 9, 23)).toISOString());
    expect(t.seen.length).toBe(0);
  });
  test("a user cannot spend past the day limit by more than one request, however many they send", async () => {
    const t = rig({ plan: "free", upstream: () => json({ content: [], usage: { input_tokens: 40000, output_tokens: 4000 } }) });   // about $0.12 a request on Sonnet
    const results: number[] = [];
    for (let i = 0; i < 6; i++) results.push((await t.send()).status);
    expect(results.filter((s) => s === 200).length).toBe(2);   // $0.12 + $0.12 reaches the $0.20 limit; the third is refused
    expect(results.slice(2).every((s) => s === 402)).toBe(true);
    expect(t.seen.length).toBe(2);
  });
  test("an error from Anthropic is passed on, costs nothing, and frees the slot", async () => {
    for (const status of [429, 500, 529]) {
      const t = rig({ upstream: () => json({ type: "error", error: { type: "overloaded_error", message: "busy" } }, status) });
      const r = await t.send(); expect(r.status).toBe(status);
      expect(t.store.records.length).toBe(0); expect(t.store.inFlight("u1")).toBe(0);
    }
  });
  test("counting tokens is allowed and never charged", async () => {
    const t = rig({ upstream: () => json({ input_tokens: 123 }) });
    const r = await t.send({ path: "/v1/messages/count_tokens", body: { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "x" }] } });
    expect(r.status).toBe(200); expect(t.store.records.length).toBe(0);
  });
  test("only a few requests run at once for one user", async () => {
    let release!: () => void; const gate = new Promise<void>((r) => (release = r));
    const t = rig({ maxInFlight: 2, upstream: async () => { await gate; return json({ content: [], usage: { input_tokens: 1, output_tokens: 1 } }); } });
    const a = t.send(), b = t.send();
    await new Promise((x) => setTimeout(x, 10));
    const c = await t.send();
    expect(c.status).toBe(429);
    release(); expect((await a).status).toBe(200); expect((await b).status).toBe(200);
    expect(t.store.inFlight("u1")).toBe(0);
  });
});

describe("what is never kept", () => {
  test("no prompt or reply text is in any log event, stored record, or error message, success or failure", async () => {
    const t = rig({ upstream: (s) => (s.body.includes("FAILME") ? json({ type: "error", error: { type: "api_error", message: `echo ${PROMPT_MARK}` } }, 500) : sseResponse(STREAM)) });
    await (await t.send({ body: { model: "claude-sonnet-5-5", max_tokens: 100, stream: true, messages: [{ role: "user", content: PROMPT_MARK }] } })).text();
    await t.send({ body: { model: "claude-sonnet-5-5", max_tokens: 100, messages: [{ role: "user", content: `${PROMPT_MARK} FAILME` }] } }).then((r) => r.text());
    await t.send({ body: `{"model": "claude-sonnet-5-5", "messages": "${PROMPT_MARK}` }).then((r) => r.text());   // unreadable
    await t.send({ body: { model: "gpt-4", max_tokens: 10, messages: [{ role: "user", content: PROMPT_MARK }] } }).then((r) => r.text());
    const kept = JSON.stringify({ events: t.events, records: t.store.records, store: t.store.dump() });
    expect(kept).not.toContain(PROMPT_MARK);
    expect(kept).not.toContain(REPLY_MARK);
    expect(kept).not.toContain(OUR_KEY);
  });
  test("the token is never kept in the clear, only its hash", async () => {
    const t = rig(); const token = await t.token(); await t.send();
    expect(JSON.stringify({ events: t.events, store: t.store.dump() })).not.toContain(token);
  });
  test("log events carry only safe fields", async () => {
    const t = rig(); await t.send();
    const allowed = new Set(["kind", "userId", "reason", "model", "usd", "status", "complete"]);
    for (const e of t.events) for (const k of Object.keys(e)) expect(allowed.has(k), k).toBe(true);
  });
});
