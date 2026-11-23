// Audit run 2, finding 5, re-attack round 2 (a test mode credit's retry key replayed after go live). Built on the setup of
// audit-run2-f5-golive.test.ts.
// Audit run 2, finding 5, re-attack. Run on a fake of the Durable Object API, a stand in model on 127.0.0.1 and a stand in
// wrangler: no network beyond this machine, no real key, nothing deployed.
//
// Break 1: the cap on paid plans asked only whether Dodo is live now. A Pro plan bought with a free test card during test mode
// stayed active in the store (no live event ever ends a test subscription), so the day Dodo moved to live it got full Pro limits
// on Squibby's Anthropic key. The same went for the $29 report (Pro's included report, and credits bought in test mode). Now each
// subscription, plan and report credit keeps the Dodo mode it came from (a record kept before modes counts as test), and once
// Dodo is live only live ones count. A test subscription no longer blocks a live Pro checkout or a delete there either.
//
// Break 2: scripts/deploy.sh saw payments on only from the exact text env.PAYMENT_PROVIDER ("dodo"). The Worker reads the
// setting ignoring case and spaces, and from a secret too.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALWAYS_SECRETS, FORWARDING_SECRETS, PAYMENT_SECRETS, handle, type Env } from "../src/worker.ts";
import { DurableStore } from "../src/store-do.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { PLANS } from "../src/plans.ts";
import { signDodoForTest } from "../src/dodo.ts";
import { DODO_LIVE_BASE, DODO_TEST_BASE } from "../src/dodo-api.ts";
import { bestPlan, type Sub } from "../src/store.ts";
import { ACCOUNT_DELETE_PATH, ME_PATH, REPORT_USE_PATH } from "../src/account-routes.ts";
import { CHECKOUT_PATH } from "../src/billing-routes.ts";
import { FakeNamespace } from "./fake-do.ts";
import { withOwnerSig } from "./owner-sig-fixture.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const KEY = "sk-ant-api03-STAND-IN-KEY-000000000000000000";
const USER_SECRET = "golive-test-user-id-secret-0123456789abcdef";
const HOOK_SECRET = `whsec_${btoa("dodo-payments-test-secret-012345")}`;
const TABLE = JSON.stringify({ pdt_month: { item: "pro_monthly", plan: "pro" }, pdt_year: { item: "pro_yearly", plan: "pro" }, pdt_report: { item: "report", once: true } });
const MODEL = "claude-sonnet-5-5";
const OWNER_ID = "google:5550001";
const EMAIL = "pat@example.com";
// More than Free allows in a day, less than Pro.
const SPENT = (PLANS.free.dailyUsd + PLANS.pro.dailyUsd) / 2;

let server: ReturnType<typeof Bun.serve>; let forwarded = 0;
beforeAll(() => { server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) { await req.text(); forwarded++; return Response.json({ id: "m", content: [], usage: { input_tokens: 10, output_tokens: 10 } }); } }); });
afterAll(() => server.stop(true));

const env = (ns: FakeNamespace, base: string, over: Partial<Env> = {}): Env => ({
  STORE: ns, PROXY_ON: "on", ANTHROPIC_API_KEY: KEY, METADATA_USER_ID_SECRET: USER_SECRET, UPSTREAM_BASE: `http://127.0.0.1:${server.port}`,
  // A clean switch: on the live address the webhook is live mode's (an event's mode is the secret that verified it).
  PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", DODO_API_BASE: base, DODO_PRODUCTS: TABLE,
  ...(base === DODO_LIVE_BASE ? { DODO_WEBHOOK_SECRET_LIVE: HOOK_SECRET } : { DODO_WEBHOOK_SECRET: HOOK_SECRET }),
  DODO_PAYMENTS_API_KEY: base === DODO_LIVE_BASE ? "dodo_live_STAND-IN-KEY-0000" : "dodo_test_STAND-IN-KEY-0000", ...over,
} as Env);
async function call(e: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const waits: Promise<unknown>[] = [];
  const r = await handle(new Request(`https://usage.example${path}`, init), e, { waitUntil: (p) => { waits.push(p); } }, () => NOW);
  await Promise.all(waits);
  return r;
}
const ask = (e: Env, token: string) => call(e, "/v1/messages", { method: "POST", headers: { "x-api-key": token, "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 100, messages: [{ role: "user", content: "hi" }] }) });
const authed = (e: Env, token: string, path: string, body: string) => call(e, path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body });

let msg = 0;
async function webhook(e: Env, event: unknown): Promise<Response> {
  const body = JSON.stringify(await withOwnerSig(event, USER_SECRET));
  return call(e, "/webhooks/dodo", { method: "POST", headers: await signDodoForTest(`msg_${++msg}`, body, HOOK_SECRET, Math.floor(NOW / 1000)), body });
}
const subActive = (subId: string, customerId: string, at = NOW - DAY) => ({
  business_id: "bus_1", type: "subscription.active", timestamp: iso(at),
  data: { payload_type: "Subscription", subscription_id: subId, product_id: "pdt_month", status: "active", customer: { customer_id: customerId, email: EMAIL },
    metadata: { companion_user_id: OWNER_ID }, next_billing_date: iso(NOW + 30 * DAY), cancel_at_next_billing_date: false },
});
const reportPaid = (paymentId: string, at = NOW - DAY) => ({
  business_id: "bus_1", type: "payment.succeeded", timestamp: iso(at),
  data: { payload_type: "Payment", payment_id: paymentId, status: "succeeded", customer: { customer_id: "cus_t", email: EMAIL },
    metadata: { companion_user_id: OWNER_ID }, product_cart: [{ product_id: "pdt_report", quantity: 1 }] },
});

/** A signed in owner who has spent more today than Free allows. */
async function owner(ns: FakeNamespace) {
  const store = new DurableStore(ns, () => NOW);
  const t = await issueSignInToken(store, OWNER_ID, "free", { email: EMAIL, nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW });
  if (!t.ok) throw new Error("setup");
  const s = await store.start(OWNER_ID, { max: 4, usd: 0, now: NOW, limits: PLANS.pro, id: "seed", need: 0 });
  if (!s.ok) throw new Error("seed");
  await store.finish(OWNER_ID, { id: "seed", now: NOW, record: { userId: OWNER_ID, model: MODEL, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }, usd: SPENT, at: NOW, complete: true } });
  return { store, token: t.token };
}


import { MemoryStore } from "../src/store.ts";
describe("re-attack round 2: a test mode report credit's useId, replayed after go live", () => {
  test("Durable Object store: the retry key of a credit spent in test mode still says yes once Dodo is live", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    const test_ = env(ns, DODO_TEST_BASE), live = env(ns, DODO_LIVE_BASE);
    expect((await webhook(test_, reportPaid("pay_testcard"))).status).toBe(200);
    // Before go live: spend the free test card's credit with a retry key.
    expect((await authed(test_, token, REPORT_USE_PATH, '{"useId":"use-testcard-1"}')).status).toBe(200);
    // After go live: a fresh use is refused (the round 1 fix) ...
    expect((await authed(live, token, REPORT_USE_PATH, '{"useId":"use-new-1"}')).status).toBe(402);
    // ... but replaying the test mode retry key is a yes, every time.
    const r = await authed(live, token, REPORT_USE_PATH, '{"useId":"use-testcard-1"}');
    expect(r.status).toBe(402);
    // Spent in test mode, the retry key still answers yes while Dodo is in test mode (a real retry of the same report).
    expect((await authed(test_, token, REPORT_USE_PATH, '{"useId":"use-testcard-1"}')).status).toBe(200);
  });
  test("memory store: the same replay", async () => {
    const m = new MemoryStore();
    await m.addReport(OWNER_ID, "pay_testcard", NOW - DAY, "test");
    expect((await m.useReport(OWNER_ID, { now: NOW, useId: "use-testcard-1" })).ok).toBe(true);
    expect((await m.useReport(OWNER_ID, { now: NOW, useId: "use-new-1", liveNow: true })).ok).toBe(false);
    expect((await m.useReport(OWNER_ID, { now: NOW, useId: "use-testcard-1", liveNow: true })).ok).toBe(false);
    // A live credit's retry key still answers yes once live, and is not spent twice.
    await m.addReport(OWNER_ID, "pay_live", NOW, "live");
    expect(await m.useReport(OWNER_ID, { now: NOW, useId: "use-live-1", liveNow: true })).toEqual({ ok: true, left: 0 });
    expect(await m.useReport(OWNER_ID, { now: NOW, useId: "use-live-1", liveNow: true })).toEqual({ ok: true, left: 0 });
  });
});
