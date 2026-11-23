// Re-attack round 2 on audit run 2, finding 5 (lens: mode switching and missing fields). Fake Durable Object, stand in model
// on 127.0.0.1, no network, no real key.
//
// A sign in copies the owner's plan NAME ("pro") onto the new token, with no Dodo mode. When an account delete wipes the owner
// between the sign in's plan read and its token write, the new token holds plan "pro" and the owner holds no plan record. Such
// a user has no planMode, and paidPlanCounts treats a missing planMode as "counts". Once Dodo is live, a Pro bought with a free
// test card then gives full Pro limits on Squibby's key, with no end date, and every later sign in copies it on.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { handle, type Env } from "../src/worker.ts";
import { createProxy } from "../src/proxy.ts";
import { createGoogleVerifier } from "../src/google.ts";
import { DurableStore } from "../src/store-do.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { PLANS } from "../src/plans.ts";
import { signDodoForTest } from "../src/dodo.ts";
import { DODO_LIVE_BASE, DODO_TEST_BASE } from "../src/dodo-api.ts";
import { ACCOUNT_DELETE_PATH, GOOGLE_SIGNIN_PATH, ME_PATH, NONCE_PATH } from "../src/account-routes.ts";
import { FakeNamespace } from "./fake-do.ts";
import { withOwnerSig } from "./owner-sig-fixture.ts";
import { claimsAt, googleKeys, keyPair, signIdToken } from "./google-stand-in.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const KEY = "sk-ant-api03-STAND-IN-KEY-000000000000000000";
const USER_SECRET = "golive-test-user-id-secret-0123456789abcdef";
const HOOK_SECRET = `whsec_${btoa("dodo-payments-test-secret-012345")}`;
const TABLE = JSON.stringify({ pdt_month: { item: "pro_monthly", plan: "pro" }, pdt_report: { item: "report", once: true } });
const MODEL = "claude-sonnet-5-5";
const SUB = "5550001", OWNER_ID = `google:${SUB}`, EMAIL = "pat@example.com";
const SPENT = (PLANS.free.dailyUsd + PLANS.pro.dailyUsd) / 2;   // over Free's day, under Pro's

let server: ReturnType<typeof Bun.serve>; let forwarded = 0;
const realFetch = globalThis.fetch;
beforeAll(() => { server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) { await req.text(); forwarded++; return Response.json({ id: "m", content: [], usage: { input_tokens: 10, output_tokens: 10 } }); } }); });
afterAll(() => { server.stop(true); globalThis.fetch = realFetch; });

const env = (ns: FakeNamespace, base: string): Env => ({
  STORE: ns, PROXY_ON: "on", ANTHROPIC_API_KEY: KEY, METADATA_USER_ID_SECRET: USER_SECRET, UPSTREAM_BASE: `http://127.0.0.1:${server.port}`,
  PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", DODO_API_BASE: base, DODO_PRODUCTS: TABLE,
  ...(base === DODO_LIVE_BASE ? { DODO_WEBHOOK_SECRET_LIVE: HOOK_SECRET } : { DODO_WEBHOOK_SECRET: HOOK_SECRET }),
  DODO_PAYMENTS_API_KEY: base === DODO_LIVE_BASE ? "dodo_live_STAND-IN-KEY-0000" : "dodo_test_STAND-IN-KEY-0000",
} as Env);
async function call(e: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const waits: Promise<unknown>[] = [];
  const r = await handle(new Request(`https://usage.example${path}`, init), e, { waitUntil: (p) => { waits.push(p); } }, () => NOW);
  await Promise.all(waits);
  return r;
}
const ask = (e: Env, token: string) => call(e, "/v1/messages", { method: "POST", headers: { "x-api-key": token, "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 100, messages: [{ role: "user", content: "hi" }] }) });

test("F5 re-attack r2: a test card Pro survives a delete raced with a sign in, and counts as Pro once Dodo is live", async () => {
  const ns = new FakeNamespace(), store = new DurableStore(ns, () => NOW);
  const t1 = await issueSignInToken(store, OWNER_ID, "free", { email: EMAIL, nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW });
  if (!t1.ok) throw new Error("setup");
  // Spend over Free's day (carried over the delete as the deleted line promises).
  const s = await store.start(OWNER_ID, { max: 4, usd: 0, now: NOW, limits: PLANS.pro, id: "seed", need: 0 });
  if (!s.ok) throw new Error("seed");
  await store.finish(OWNER_ID, { id: "seed", now: NOW, record: { userId: OWNER_ID, model: MODEL, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }, usd: SPENT, at: NOW, complete: true } });

  // Test mode: Pro with the free test card.
  const body = JSON.stringify(await withOwnerSig({ business_id: "bus_1", type: "subscription.active", timestamp: iso(NOW - DAY),
    data: { payload_type: "Subscription", subscription_id: "sub_testcard", product_id: "pdt_month", status: "active", customer: { customer_id: "cus_t", email: EMAIL },
      metadata: { companion_user_id: OWNER_ID }, next_billing_date: iso(NOW + 30 * DAY), cancel_at_next_billing_date: false } }, USER_SECRET));
  expect((await call(env(ns, DODO_TEST_BASE), "/webhooks/dodo", { method: "POST", headers: await signDodoForTest("msg_1", body, HOOK_SECRET, Math.floor(NOW / 1000)), body })).status).toBe(200);

  // Dodo is live now. The same production proxy and account routes, on the same store, with a stand in Google.
  globalThis.fetch = (async () => { throw new Error("no network in tests"); }) as unknown as typeof fetch;
  const GOOD = await keyPair("kid-good");
  const live = env(ns, DODO_LIVE_BASE);
  const raceStore = new DurableStore(ns, () => NOW);
  const proxy = createProxy({ store: raceStore, anthropicKey: "", userIdSecret: USER_SECRET, enabled: () => false, now: () => NOW, log: () => {},
    paymentsTestMode: () => false,
    googleSignIn: createGoogleVerifier({ clientId: "1234-test.apps.googleusercontent.com", fetch: googleKeys(() => [GOOD]), now: () => NOW }) } as never);
  const send = (p: string, init: RequestInit = {}) => proxy(new Request(`https://api.example${p}`, init));

  // The interleaving: the delete request (allowed once live: the test subscription no longer counts as chargeable) runs
  // whole after the sign in read the owner's plan and before it wrote its token.
  // The sign in's plan read: grantedPlanOf since the fix (planOfOwner before it). The race is the same window either way.
  type Read = (id: string) => Promise<string | null>;
  const r_ = raceStore as unknown as Record<string, Read | undefined>;
  const which = typeof r_.grantedPlanOf === "function" ? "grantedPlanOf" : "planOfOwner";
  const planOf = (r_[which] as Read).bind(raceStore);
  let raced = false;
  r_[which] = async (id: string) => {
    const p = await planOf(id);
    if (!raced) {
      raced = true;
      const del = await send(ACCOUNT_DELETE_PATH, { method: "POST", headers: { authorization: `Bearer ${t1.token}` }, body: JSON.stringify({ confirm: true }) });
      expect(del.status).toBe(200);
    }
    return p;
  };
  const nonce = ((await (await send(NONCE_PATH)).json()) as { nonce: string }).nonce;
  const idToken = await signIdToken(GOOD, claimsAt(NOW, { nonce, sub: SUB }));
  const si = await send(GOOGLE_SIGNIN_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
  globalThis.fetch = realFetch;
  expect(raced).toBe(true);
  expect(si.status).toBe(200);
  const t2 = ((await si.json()) as { token: string }).token;

  // What the live server says about this person: nothing was ever paid in live mode.
  const me = (await (await call(live, ME_PATH, { headers: { authorization: `Bearer ${t2}` } })).json()) as { plan: string };
  forwarded = 0;
  const r = await ask(live, t2);
  console.log(JSON.stringify({ mePlan: me.plan, askStatus: r.status, forwarded }));
  expect(me.plan).toBe("free");
  expect(r.status).toBe(402);   // over Free's day: must be refused
  expect(forwarded).toBe(0);
});
