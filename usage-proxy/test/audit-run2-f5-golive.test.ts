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
  PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", DODO_API_BASE: base, DODO_WEBHOOK_SECRET: HOOK_SECRET, DODO_PRODUCTS: TABLE,
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

describe("break 1: what test mode gave never counts once Dodo is live", () => {
  test("a Pro plan paid with the test card in test mode has Free's limits after the switch to live", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    expect((await webhook(env(ns, DODO_TEST_BASE), subActive("sub_testcard", "cus_t"))).status).toBe(200);
    forwarded = 0;
    expect((await ask(env(ns, DODO_TEST_BASE), token)).status).toBe(402);   // held to Free in test mode (the first fix)
    expect(forwarded).toBe(0);
    const live = env(ns, DODO_LIVE_BASE);
    const r = await ask(live, token);
    expect(r.status).toBe(402);   // the break: this was 200, with Pro's limits on Squibby's key
    expect(forwarded).toBe(0);
    const me = await (await call(live, ME_PATH, { headers: { authorization: `Bearer ${token}` } })).json() as { plan: string };
    expect(me.plan).toBe("free");
  });
  test("a subscription kept before modes were kept counts as test (the re-attack's own repro)", async () => {
    const ns = new FakeNamespace(), { store, token } = await owner(ns);
    await store.applySubscription(OWNER_ID, "sub_old", { plan: "pro", status: "active", customerId: "cus_test1", customerMode: "test" }, NOW - DAY);
    forwarded = 0;
    expect((await ask(env(ns, DODO_LIVE_BASE), token)).status).toBe(402);
    expect(forwarded).toBe(0);
  });
  test("TEST_PAYERS does not carry a test mode plan into live mode", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    await webhook(env(ns, DODO_TEST_BASE), subActive("sub_testcard", "cus_t"));
    forwarded = 0;
    expect((await ask(env(ns, DODO_LIVE_BASE, { TEST_PAYERS: OWNER_ID }), token)).status).toBe(402);
    expect(forwarded).toBe(0);
  });
  test("a Pro plan paid in live mode has Pro's limits there, even beside an old test one", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    await webhook(env(ns, DODO_TEST_BASE), subActive("sub_testcard", "cus_t", NOW - 2 * DAY));
    const live = env(ns, DODO_LIVE_BASE);
    expect((await webhook(live, subActive("sub_real", "cus_live"))).status).toBe(200);
    forwarded = 0;
    expect((await ask(live, token)).status).toBe(200);
    expect(forwarded).toBe(1);
  });
  test("the report: a test mode Pro plan does not include it in live mode, and a test mode credit is not spent there", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    const test_ = env(ns, DODO_TEST_BASE), live = env(ns, DODO_LIVE_BASE);
    await webhook(test_, subActive("sub_testcard", "cus_t"));
    expect((await webhook(test_, reportPaid("pay_testcard"))).status).toBe(200);
    const r = await authed(live, token, REPORT_USE_PATH, "{}");
    expect(r.status).toBe(402);   // was 200 {paidBy: "pro"}
    // In test mode the test credit and plan still work, so the flow can be tried before go live.
    expect((await authed(test_, token, REPORT_USE_PATH, "{}")).status).toBe(200);
  });
  test("a report credit paid in live mode is spent in live mode", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    const live = env(ns, DODO_LIVE_BASE);
    expect((await webhook(live, reportPaid("pay_real"))).status).toBe(200);
    const r = await authed(live, token, REPORT_USE_PATH, "{}");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, paidBy: "credit", left: 0 });
  });
  test("in live mode a test subscription neither blocks a real Pro checkout nor the account delete", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    await webhook(env(ns, DODO_TEST_BASE), subActive("sub_testcard", "cus_t"));
    const live = env(ns, DODO_LIVE_BASE);
    const realFetch = globalThis.fetch, seen: string[] = [];
    globalThis.fetch = (async (u: string, init?: RequestInit) => {
      if (String(u).startsWith("http://127.0.0.1")) return realFetch(u, init);
      seen.push(String(u));
      return Response.json({ session_id: "s", checkout_url: "https://checkout.dodopayments.com/s" });
    }) as unknown as typeof fetch;
    try {
      const c = await authed(live, token, CHECKOUT_PATH, '{"item":"pro_monthly"}');
      expect(c.status).toBe(200);
      expect(seen).toEqual([`${DODO_LIVE_BASE}/checkouts`]);
    } finally { globalThis.fetch = realFetch; }
    // In test mode the same test subscription still blocks the delete (it could still charge the test card).
    expect((await authed(env(ns, DODO_TEST_BASE), token, ACCOUNT_DELETE_PATH, '{"confirm":true}')).status).toBe(409);
    expect((await authed(live, token, ACCOUNT_DELETE_PATH, '{"confirm":true}')).status).toBe(200);
  });
  test("bestPlan: a live subscription wins over a test one, and the plan says which mode it came from", () => {
    const sub = (over: Partial<Sub>): Sub => ({ plan: "pro", status: "active", at: 1, ...over });
    expect(bestPlan([["a", sub({ mode: "test" })]]).mode).toBe("test");
    expect(bestPlan([["a", sub({})]]).mode).toBe("test");   // kept before modes: test
    expect(bestPlan([["a", sub({ mode: "live" })]]).mode).toBe("live");
    // A live one that is cancelling beats a test one that is active: only the live one counts once Dodo is live.
    const both = bestPlan([["t", sub({ mode: "test" })], ["l", sub({ mode: "live", status: "cancelling", until: NOW + DAY })]]);
    expect(both).toEqual({ plan: "pro", status: "cancelling", until: NOW + DAY, mode: "live" });
  });
});

// ---- break 2: the deploy check ----------------------------------------------------------------------------------------------
const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts", "deploy.sh");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
/** A stand in wrangler (the same shape as deploy.test.ts), run from a copy of the script beside the given wrangler.toml. */
function deploy(o: { secrets: string[]; provider: string; base?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-golive-")); dirs.push(dir);
  const calls = join(dir, "calls.txt"), bin = join(dir, "wrangler");
  writeFileSync(join(dir, "names.json"), JSON.stringify(o.secrets.map((name) => ({ name, type: "secret_text" })), null, 2));
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run")
    out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
    echo "export class StoreObject {}" > "$out/entry.js"
    echo 'env.STORE (StoreObject)      Durable Object'
    echo 'env.PAYMENT_PROVIDER ("${o.provider}")      Environment Variable'
    exit 0 ;;
  "secret list") cat "${join(dir, "names.json")}"; exit 0 ;;
  "deploy ") echo "Uploaded"; exit 0 ;;
esac
exit 9
`);
  chmodSync(bin, 0o755);
  mkdirSync(join(dir, "proj", "scripts"), { recursive: true });
  const script = join(dir, "proj", "scripts", "deploy.sh");
  copyFileSync(SCRIPT, script);
  writeFileSync(join(dir, "proj", "wrangler.toml"), `name = "x"\nmain = "src/entry.ts"\n[vars]\nPAYMENT_PROVIDER = "${o.provider}"\n${o.base ? `DODO_API_BASE = "${o.base}"\n` : ""}`);
  const p = Bun.spawnSync(["sh", script, "--apply"], { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: join(dir, "dist"), HOME: dir } });
  const c = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [];
  return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), deploys: c.filter((x) => x.startsWith("deploy") && !x.includes("--dry-run")) };
}
const FORWARDING_ON = [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS, ...PAYMENT_SECRETS];

describe("break 2: scripts/deploy.sh sees payments on however the provider is written", () => {
  for (const [name, o] of [
    ["PAYMENT_PROVIDER \"Dodo\"", { secrets: FORWARDING_ON, provider: "Dodo" }],
    ["PAYMENT_PROVIDER \" dodo\"", { secrets: FORWARDING_ON, provider: " dodo" }],
    ["PAYMENT_PROVIDER \"DODO \"", { secrets: FORWARDING_ON, provider: "DODO " }],
    ["PAYMENT_PROVIDER set as a secret", { secrets: [...FORWARDING_ON, "PAYMENT_PROVIDER"], provider: "none" }],
  ] as const) {
    test(`${name} with PROXY_ON on the test address is refused and nothing is deployed`, () => {
      const r = deploy({ ...o, secrets: [...o.secrets], base: DODO_TEST_BASE });
      expect(r.code).toBe(1);
      expect(r.text).toContain("test mode");
      expect(r.deploys).toEqual([]);
    });
  }
  test("a provider that only looks like dodo, or none, with PROXY_ON still deploys", () => {
    for (const provider of ["none", "dodox"]) {
      const r = deploy({ secrets: [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS], provider, base: DODO_TEST_BASE });
      expect(r.code).toBe(0);
      expect(r.deploys).toEqual(["deploy"]);
    }
  });
});
