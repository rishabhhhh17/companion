// M99: the Cloudflare Worker entry, run with Bun on a fake of the Durable Object API and a stand in model on 127.0.0.1.
// No network beyond this machine, no real key, nothing deployed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import worker, { handle, switchOn, ALL_SECRETS, OPERATOR_PATH, STATUS_PATH, type Env } from "../src/worker.ts";
import { DurableStore, OWNER, PAYMENTS } from "../src/store-do.ts";
import { issueToken } from "../src/accounts.ts";
import { signDodoForTest } from "../src/dodo.ts";
import { hashToken } from "../src/tokens.ts";
import { deriveUserId } from "../src/userid.ts";
import { FakeNamespace } from "./fake-do.ts";

const KEY = "sk-ant-api03-STAND-IN-KEY-000000000000000000";
const SECRET = "worker-test-user-id-secret-0123456789abcdef";
const OPERATOR = "operator-key-for-worker-tests-0123456789abcd";
const DODO = `whsec_${btoa("dodo-worker-test-secret-0123456789")}`;
const PROMPT = "PROMPT-MARKER-worker-5521", REPLY = "REPLY-MARKER-worker-9034";
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

type Seen = { path: string; key: string | null; body: string };
let seen: Seen[] = [];
let server: ReturnType<typeof Bun.serve>;
const sse = (events: unknown[]) => events.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
beforeAll(() => {
  // The stand in model: answers like the Messages API, with usage, and never with anything real.
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    const body = await req.text();
    seen.push({ path: new URL(req.url).pathname, key: req.headers.get("x-api-key"), body });
    if (JSON.parse(body).stream) return new Response(sse([
      { type: "message_start", message: { id: "m", usage: { input_tokens: 1200, output_tokens: 1 } } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: REPLY } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 300 } },
      { type: "message_stop" },
    ]), { headers: { "content-type": "text/event-stream" } });
    return Response.json({ id: "m", content: [{ type: "text", text: REPLY }], usage: { input_tokens: 1000, output_tokens: 200 } });
  } });
});
afterAll(() => server.stop(true));

let logs: string[] = [];
const realLog = console.log;
beforeEach(() => { seen = []; logs = []; console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); }; });
afterEach(() => { console.log = realLog; });

function world(over: Partial<Env> = {}) {
  const fake = new FakeNamespace();
  const env: Env = { STORE: fake, PROXY_ON: "on", ANTHROPIC_API_KEY: KEY, METADATA_USER_ID_SECRET: SECRET, UPSTREAM_BASE: `http://127.0.0.1:${server.port}`, ...over };
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); } };
  const store = new DurableStore(fake, () => NOW);
  const send = (path: string, init: RequestInit = {}) => handle(new Request(`https://usage.example${path}`, init), env, ctx, () => NOW);
  const ask = (token: string, body: Record<string, unknown> = {}) => send("/v1/messages", { method: "POST", headers: { "x-api-key": token, "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1000, messages: [{ role: "user", content: PROMPT }], ...body }) });
  return { fake, env, store, send, ask, waits };
}
async function signedIn(w: ReturnType<typeof world>, owner = "google:42", plan = "pro") {
  const t = await issueToken(w.store, owner, plan); if (!t.ok) throw new Error("setup");
  return t.token;
}
const message = async (r: Response) => ((await r.json()) as { error: { message: string } }).error.message;

describe("the switch", () => {
  test("off unless it is exactly on, 1 or true", () => {
    for (const v of ["on", "ON", " 1 ", "true", "True"]) expect(switchOn(v)).toBe(true);
    for (const v of [undefined, "", "off", "0", "false", "yes", "onn", 1, true]) expect(switchOn(v)).toBe(false);
  });
  test("unset: the status says off, and a request is refused and never reaches the model", async () => {
    const w = world({ PROXY_ON: undefined });
    expect(await (await w.send(STATUS_PATH)).json()).toEqual({ service: "Squibby usage", on: false });
    const token = await signedIn(w);
    const r = await w.ask(token);
    expect(r.status).toBe(503);
    expect(await message(r)).toMatch(/not switched on/);
    expect(seen.length).toBe(0);
  });
  test("on: the status says so", async () => {
    expect(await (await world().send(STATUS_PATH)).json()).toEqual({ service: "Squibby usage", on: true });
  });
});

describe("refusing to forward when a secret is missing", () => {
  test("no METADATA_USER_ID_SECRET (or one too short): 503, nothing sent", async () => {
    for (const secret of [undefined, "short"]) {
      const w = world({ METADATA_USER_ID_SECRET: secret });
      const r = await w.ask(await signedIn(w));
      expect(r.status).toBe(503);
      expect(await message(r)).toMatch(/not ready yet\. Nothing was sent/);
    }
    expect(seen.length).toBe(0);
  });
  test("no ANTHROPIC_API_KEY: 503, nothing sent", async () => {
    for (const key of [undefined, "", "   "]) {
      const w = world({ ANTHROPIC_API_KEY: key });
      const r = await w.ask(await signedIn(w));
      expect(r.status).toBe(503);
      expect(await message(r)).toMatch(/Nothing was sent/);
    }
    expect(seen.length).toBe(0);
  });
});

describe("a metered request, end to end", () => {
  test("forwarded with Squibby's key and the opaque id, booked on the owner's object, the reply passed back", async () => {
    const w = world();
    const token = await signedIn(w);
    const r = await w.ask(token);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(REPLY);
    expect(seen.length).toBe(1);
    expect(seen[0].key).toBe(KEY);
    expect(JSON.parse(seen[0].body).metadata).toEqual({ user_id: await deriveUserId("google:42", SECRET) });
    const spent = await w.store.spent("google:42", NOW);
    expect(spent.day).toBeGreaterThan(0);
    expect(spent.day).toBe(spent.month);
  });
  test("a streamed reply is booked when it ends, and the Worker is kept alive until then", async () => {
    const w = world();
    const token = await signedIn(w);
    const r = await w.ask(token, { stream: true });
    expect(w.waits.length).toBe(1);
    expect(await r.text()).toContain(REPLY);
    await Promise.all(w.waits);
    expect((await w.store.spent("google:42", NOW)).day).toBeGreaterThan(0);
    expect((w.fake.storageFor(OWNER("google:42")).data.get("live") as { running: unknown[] }).running).toEqual([]);   // M116: slot and hold live in one key
  });
  test("logs and the objects hold no prompt, reply, token, key or secret", async () => {
    const w = world();
    const token = await signedIn(w);
    await (await w.ask(token)).text();
    await (await w.ask(token, { stream: true })).text();
    await Promise.all(w.waits);
    const all = JSON.stringify({ logs, kept: w.fake.dump() });
    for (const mark of [PROMPT, REPLY, token, KEY, SECRET]) expect(all).not.toContain(mark);
    expect(logs.some((l) => l.includes('"kind":"request"'))).toBe(true);
  });
  test("the default export is the same Worker", async () => {
    const w = world({ PROXY_ON: undefined });
    const r = await worker.fetch(new Request(`https://usage.example${STATUS_PATH}`), w.env, { waitUntil: () => {} });
    expect(((await r.json()) as { on: boolean }).on).toBe(false);
  });
});

describe("payments", () => {
  const event = (status: string, at: number, plan = "pdt_pro") => ({
    business_id: "bus_1", type: "subscription.active", timestamp: new Date(at).toISOString(),
    data: { payload_type: "Subscription", subscription_id: "sub_1", product_id: plan, status, customer: { customer_id: "cus_1" }, metadata: { companion_user_id: "google:42" } },
  });
  const deliver = async (w: ReturnType<typeof world>, ev: unknown, id: string) => {
    const body = JSON.stringify(ev);
    return w.send("/webhooks/dodo", { method: "POST", headers: await signDodoForTest(id, body, DODO, Math.floor(NOW / 1000)), body });
  };
  test("no provider set: the webhook is not served, and nothing about payments is kept", async () => {
    const w = world({ PROXY_ON: undefined, DODO_WEBHOOK_SECRET: DODO, DODO_PRODUCTS: '{"pdt_pro":"pro"}' });
    const r = await deliver(w, event("active", NOW - 1000), "msg_1");
    expect(r.status).toBe(503);   // the switch's answer: it went to the proxy, not to a webhook
    expect(w.fake.storageOf(PAYMENTS)).toBeUndefined();
  });
  test("Dodo on: a signed event puts the plan on the owner's object, once, and an older one after it changes nothing", async () => {
    const w = world({ PAYMENT_PROVIDER: "dodo", DODO_WEBHOOK_SECRET: DODO, DODO_PRODUCTS: '{"pdt_pro":"pro"}' });
    const token = await signedIn(w, "google:42", "free");
    expect((await deliver(w, event("active", NOW - 1000), "msg_1")).status).toBe(200);
    expect((await w.store.userByTokenHash(await hashToken(token)))?.plan).toBe("pro");
    expect(await ((await deliver(w, event("active", NOW - 1000), "msg_1")).json())).toEqual({ outcome: "duplicate" });
    const cancelled = { ...event("cancelled", NOW - 5000), type: "subscription.cancelled" };
    expect(await ((await deliver(w, cancelled, "msg_2")).json())).toEqual({ outcome: "stale" });
    expect(await w.store.planOfOwner("google:42")).toBe("pro");
  });
  test("a wrong signature changes nothing", async () => {
    const w = world({ PAYMENT_PROVIDER: "dodo", DODO_WEBHOOK_SECRET: DODO, DODO_PRODUCTS: '{"pdt_pro":"pro"}' });
    const body = JSON.stringify(event("active", NOW));
    const r = await w.send("/webhooks/dodo", { method: "POST", headers: await signDodoForTest("msg_1", body, `whsec_${btoa("not-the-secret-0123456789abcdef")}`, Math.floor(NOW / 1000)), body });
    expect(r.status).toBe(401);
    expect(await w.store.planOfOwner("google:42")).toBeNull();
  });
  test("Stripe chosen: a plain answer that its webhook is not built here", async () => {
    const w = world({ PAYMENT_PROVIDER: "stripe" });
    const r = await w.send("/webhooks/stripe", { method: "POST", body: "{}" });
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).toMatch(/not built/);
  });
});

describe("the operator's route", () => {
  const op = (w: ReturnType<typeof world>, argv: unknown, key: string | null = OPERATOR) =>
    w.send(OPERATOR_PATH, { method: "POST", headers: key ? { authorization: `Bearer ${key}` } : {}, body: JSON.stringify({ argv }) });
  test("not served at all without an operator key of at least 32 characters", async () => {
    for (const k of [undefined, "short-key"]) expect((await op(world({ OPERATOR_KEY: k }), ["--owner", "google:42"])).status).toBe(404);
  });
  test("a wrong key or none is refused and changes nothing", async () => {
    const w = world({ OPERATOR_KEY: OPERATOR });
    await signedIn(w);
    expect((await op(w, ["--owner", "google:42", "--apply"], "x".repeat(44))).status).toBe(401);
    expect((await op(w, ["--owner", "google:42", "--apply"], null)).status).toBe(401);
    expect(await w.store.isSuspended("google:42")).toBe(false);
  });
  test("a dry run by default; --apply suspends on the real store; the key is never echoed", async () => {
    const w = world({ OPERATOR_KEY: OPERATOR });
    const token = await signedIn(w);
    const dry = await (await op(w, ["--owner", "google:42"])).json() as { code: number; lines: string[] };
    expect(dry.lines.join(" ")).toMatch(/Dry run/);
    expect(await w.store.isSuspended("google:42")).toBe(false);
    const real = await op(w, ["--user-id", await deriveUserId("google:42", SECRET), "--apply", "--case", "c-1"]);
    const text = await real.text();
    expect(text).toMatch(/Suspended/);
    expect(await w.store.isSuspended("google:42")).toBe(true);
    expect((await w.ask(token)).status).toBe(403);
    expect(JSON.stringify({ text, logs })).not.toContain(OPERATOR);
  });
  test("M99 review: a step that did not happen is not answered 200, and the body still says why", async () => {
    const w = world({ OPERATOR_KEY: OPERATOR });
    await signedIn(w);
    const none = await op(w, ["--owner", "nobody:1", "--apply"]);
    expect(none.status).toBe(422);
    expect(((await none.json()) as { code: number; lines: string[] })).toEqual({ code: 1, lines: ["No owner matches that id. Nothing was changed."] });
    const badOption = await op(w, ["--owner", "google:42", "--wipe"]);
    expect(badOption.status).toBe(422);
    expect(((await badOption.json()) as { code: number }).code).toBe(2);
    expect(await w.store.isSuspended("google:42")).toBe(false);
    expect((await op(w, ["--owner", "google:42"])).status).toBe(200);   // a dry run that worked
  });
  test("a body that is not a list of options is refused", async () => {
    const w = world({ OPERATOR_KEY: OPERATOR });
    for (const argv of [undefined, "x", [1, 2]]) expect((await op(w, argv)).status).toBe(400);
  });
});

describe("M116 step 6: the retired test token route for a local run", () => {
  // POST /v1/dev/token used to mint a token for a made up owner when DEV_TOKENS was on. A local run now signs in through the
  // stand in Google, so the route is gone: even on this machine, with DEV_TOKENS on and a stand in upstream, it is just a
  // request with no token, and no owner is made.
  const at = (w: ReturnType<typeof world>, host: string) => handle(new Request(`http://${host}/v1/dev/token`, { method: "POST" }), w.env, { waitUntil: () => {} }, () => NOW);
  test("never served, whatever the settings say", async () => {
    for (const extra of [{}, { DEV_TOKENS: "on" }, { DEV_TOKENS: "on", UPSTREAM_BASE: "http://127.0.0.1:8788" }]) {
      const w = world(extra as unknown as Partial<Env>);   // DEV_TOKENS is no longer an Env field
      for (const host of ["127.0.0.1:8787", "localhost:8787", "usage.example.com"]) {
        const r = await at(w, host);
        expect(r.status).toBe(401);
        expect(await r.text()).not.toMatch(/cmp_/);
      }
      expect(await w.store.listOwnerIds()).toEqual([]);
    }
  });
});

describe("M99 review: when the store fails", () => {
  test("a store that answers 500: the Worker answers an API shaped 503 that nothing was sent, and logs only the reason", async () => {
    const broken = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response(JSON.stringify({ error: "failed" }), { status: 500 }) }) };
    const w = world({ STORE: broken, OPERATOR_KEY: OPERATOR, PAYMENT_PROVIDER: "dodo", DODO_WEBHOOK_SECRET: DODO, DODO_PRODUCTS: '{"pdt_pro":"pro"}' });
    const r = await w.ask("cmp_some-token-that-cannot-be-looked-up-000");
    expect(r.status).toBe(503);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    const body = await r.json() as { type: string; error: { type: string; message: string } };
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("api_error");
    expect(body.error.message).toMatch(/Nothing was sent to Claude/);
    expect(seen.length).toBe(0);
    expect(logs.some((l) => l.includes('"reason":"store_failed"'))).toBe(true);
    // The other routes that use the store answer too, never with Cloudflare's own error page.
    const opR = await w.send(OPERATOR_PATH, { method: "POST", headers: { authorization: `Bearer ${OPERATOR}` }, body: JSON.stringify({ argv: ["--owner", "google:42"] }) });
    expect(opR.status).toBe(503);
    expect(await opR.json()).toEqual(expect.objectContaining({ error: expect.stringMatching(/Nothing was changed/) }));
    const ev = JSON.stringify({ business_id: "b", type: "subscription.active", timestamp: new Date(NOW).toISOString(), data: {} });
    const hook = await w.send("/webhooks/dodo", { method: "POST", headers: await signDodoForTest("msg_x", ev, DODO, Math.floor(NOW / 1000)), body: ev });
    expect(hook.status).toBe(503);
    for (const l of logs) expect(l).not.toContain(PROMPT);
  });
});

describe("M99 review: a payment event out of date across two server instances", () => {
  const event = (status: string, at: number, type = "subscription.active") => ({
    business_id: "bus_1", type, timestamp: new Date(at).toISOString(),
    data: { payload_type: "Subscription", subscription_id: "sub_1", product_id: "pdt_pro", status, customer: { customer_id: "cus_1" }, metadata: { companion_user_id: "google:42" } },
  });
  test("the older one, which read the owner's time before the newer one wrote it, is answered and logged as stale", async () => {
    const fake = new FakeNamespace();
    // Instance B reads the owner's newest applied time first, then waits while instance A applies a newer event.
    let letBGo!: () => void; const bWaits = new Promise<void>((r) => (letBGo = r));
    let lastAtCalls = 0;
    const slowB = { idFromName: (n: string) => fake.idFromName(n), get: (id: { name: string }) => {
      const stub = fake.get(id);
      return { fetch: async (input: string, init?: RequestInit) => {
        const res = await stub.fetch(input, init);
        if (new URL(input).pathname === "/owner.lastAt" && lastAtCalls++ === 0) await bWaits;
        return res;
      } };
    } };
    const env = (STORE: Env["STORE"]): Env => ({ STORE, PAYMENT_PROVIDER: "dodo", DODO_WEBHOOK_SECRET: DODO, DODO_PRODUCTS: '{"pdt_pro":"pro"}' });
    const deliver = async (e: Env, ev: unknown, id: string) => {
      const body = JSON.stringify(ev);
      return handle(new Request("https://usage.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest(id, body, DODO, Math.floor(NOW / 1000)), body }), e, { waitUntil: () => {} }, () => NOW);
    };
    const store = new DurableStore(fake, () => NOW);
    const b = deliver(env(slowB), { ...event("cancelled", NOW - 5000, "subscription.cancelled") }, "msg_old");
    while (lastAtCalls === 0) await new Promise((r) => setTimeout(r, 1));
    const a = await deliver(env(fake), event("active", NOW - 1000), "msg_new");
    expect(await a.json()).toEqual({ outcome: "applied" });
    letBGo();
    const rb = await b;
    expect(await rb.json()).toEqual({ outcome: "stale" });
    expect(await store.planOfOwner("google:42")).toBe("pro");
    const kinds = logs.map((l) => JSON.parse(l).kind);
    expect(kinds.filter((k) => k === "applied").length).toBe(1);
    expect(kinds).toContain("stale");
  });
});

test("the secrets a real deploy needs are the ones the Worker reads", () => {
  expect([...ALL_SECRETS].sort()).toEqual(["ANTHROPIC_API_KEY", "DODO_PAYMENTS_API_KEY", "DODO_PRODUCTS", "DODO_WEBHOOK_SECRET", "GOOGLE_CLIENT_ID", "METADATA_USER_ID_SECRET", "OPERATOR_KEY"]);
});
