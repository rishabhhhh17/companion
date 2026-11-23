// Audit run 2, finding 5, re-attack round 1: the go live order. Run on a fake of the Durable Object API, a stand in model on
// 127.0.0.1 and a stand in wrangler: no network beyond this machine, no real key, nothing deployed.
//
// The break: the webhook gave every event the Dodo mode of DODO_API_BASE at the moment it arrived, never the mode Dodo made it
// in. DODO_API_BASE is a var (deployed by scripts/deploy.sh --live-payments) and the webhook secret is a secret (its own
// `wrangler secret put`), so they never change in one step. In the window between them, or for good if the secret was
// forgotten, the server was on the live address and still took events signed with the test webhook's secret, and kept each one
// as live. A test card's Pro renewed in that window counted as live for good: once the live secret was put, test mode's cancel
// could never reach it.
//
// The fix: an event's mode comes from which secret verified it. DODO_WEBHOOK_SECRET is test mode's webhook secret and only ever
// gives test; DODO_WEBHOOK_SECRET_LIVE is live mode's and is the only way an event is kept as live. The address plays no part.
// A subscription once kept as test is never moved up to live by a later event. deploy.sh --live-payments needs
// DODO_WEBHOOK_SECRET_LIVE to be set.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALWAYS_SECRETS, FORWARDING_SECRETS, LIVE_PAYMENT_SECRETS, PAYMENT_SECRETS, handle, type Env } from "../src/worker.ts";
import { DurableStore } from "../src/store-do.ts";
import { MemoryStore } from "../src/store.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { PLANS } from "../src/plans.ts";
import { MemoryDodoLedger, MemoryLinkBook, createDodoWebhook, signDodoForTest } from "../src/dodo.ts";
import { DODO_LIVE_BASE, DODO_TEST_BASE } from "../src/dodo-api.ts";
import { ME_PATH, REPORT_USE_PATH } from "../src/account-routes.ts";
import { storeHooks } from "../src/billing-routes.ts";
import { FakeNamespace } from "./fake-do.ts";
import { withOwnerSig } from "./owner-sig-fixture.ts";
import { DODO_BASE_BINDING, WRANGLER_TABLE } from "./wrangler-vars-stub.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const KEY = "sk-ant-api03-STAND-IN-KEY-000000000000000000";
const USER_SECRET = "golive-test-user-id-secret-0123456789abcdef";
const TEST_HOOK = `whsec_${btoa("dodo-payments-test-secret-012345")}`;
const LIVE_HOOK = `whsec_${btoa("dodo-payments-LIVE-secret-0123456")}`;
const TABLE = JSON.stringify({ pdt_month: { item: "pro_monthly", plan: "pro" }, pdt_year: { item: "pro_yearly", plan: "pro" }, pdt_report: { item: "report", once: true } });
const MODEL = "claude-sonnet-5-5";
const OWNER_ID = "google:5550001";
const EMAIL = "pat@example.com";
const SPENT = (PLANS.free.dailyUsd + PLANS.pro.dailyUsd) / 2;   // more than Free allows in a day, less than Pro

let server: ReturnType<typeof Bun.serve>; let forwarded = 0;
beforeAll(() => { server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) { await req.text(); forwarded++; return Response.json({ id: "m", content: [], usage: { input_tokens: 10, output_tokens: 10 } }); } }); });
afterAll(() => server.stop(true));

const env = (ns: FakeNamespace, base: string, over: Partial<Env> = {}): Env => ({
  STORE: ns, PROXY_ON: "on", ANTHROPIC_API_KEY: KEY, METADATA_USER_ID_SECRET: USER_SECRET, UPSTREAM_BASE: `http://127.0.0.1:${server.port}`,
  PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", DODO_API_BASE: base, DODO_WEBHOOK_SECRET: TEST_HOOK, DODO_PRODUCTS: TABLE,
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
const me = async (e: Env, token: string) => ((await (await call(e, ME_PATH, { headers: { authorization: `Bearer ${token}` } })).json()) as { plan: string }).plan;

let msg = 0;
/** An event as Dodo sends it, signed with the webhook secret of the mode it was made in. */
async function webhook(e: Env, event: unknown, signedWith: string = TEST_HOOK): Promise<Response> {
  const body = JSON.stringify(await withOwnerSig(event, USER_SECRET));
  return call(e, "/webhooks/dodo", { method: "POST", headers: await signDodoForTest(`msg_${++msg}`, body, signedWith, Math.floor(NOW / 1000)), body });
}
const subEvent = (type: string, subId: string, customerId: string, at: number, status = "active", next = NOW + 30 * DAY) => ({
  business_id: "bus_1", type, timestamp: iso(at),
  data: { payload_type: "Subscription", subscription_id: subId, product_id: "pdt_month", status, customer: { customer_id: customerId, email: EMAIL },
    metadata: { companion_user_id: OWNER_ID }, next_billing_date: iso(next), cancel_at_next_billing_date: false },
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

describe("the go live window: a test mode event is test mode whatever the address says", () => {
  test("re-attack r1-0: a test card's renewal after the live deploy, before the live secret, never counts once live", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    expect((await webhook(env(ns, DODO_TEST_BASE), subEvent("subscription.active", "sub_testcard", "cus_t", NOW - 2 * DAY))).status).toBe(200);
    // Step a: the live address is deployed; only the test webhook's secret is set.
    const window_ = env(ns, DODO_LIVE_BASE);
    expect((await webhook(window_, subEvent("subscription.renewed", "sub_testcard", "cus_t", NOW - DAY))).status).toBe(200);
    // Step b: the live webhook's secret is put. The test one is still set too (nothing says it was removed).
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK });
    forwarded = 0;
    expect(await me(live, token)).toBe("free");
    expect((await ask(live, token)).status).toBe(402);
    expect(forwarded).toBe(0);
    expect((await authed(live, token, REPORT_USE_PATH, "{}")).status).toBe(402);
    // And with the test secret removed afterwards, the same.
    const liveOnly = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET: undefined, DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK });
    expect((await ask(liveOnly, token)).status).toBe(402);
    expect(forwarded).toBe(0);
  });
  test("re-attack r1-0, its own steps: the live secret put into the old name, a test mode cancel refused", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    await webhook(env(ns, DODO_TEST_BASE), subEvent("subscription.active", "sub_testcard", "cus_t", NOW - 2 * DAY));
    expect((await webhook(env(ns, DODO_LIVE_BASE), subEvent("subscription.renewed", "sub_testcard", "cus_t", NOW - DAY))).status).toBe(200);
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET: LIVE_HOOK });
    expect((await webhook(live, subEvent("subscription.cancelled", "sub_testcard", "cus_t", NOW - 1000, "cancelled", NOW - 1000))).status).not.toBe(200);
    forwarded = 0;
    expect(await me(live, token)).toBe("free");
    expect((await ask(live, token)).status).toBe(402);
    expect(forwarded).toBe(0);
    expect((await authed(live, token, REPORT_USE_PATH, "{}")).status).toBe(402);
  });
  test("re-attack r1-1: a fresh 4242 checkout completed in the window is test mode", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    const window_ = env(ns, DODO_LIVE_BASE);
    expect((await webhook(window_, subEvent("subscription.active", "sub_fresh", "cus_t", NOW - DAY))).status).toBe(200);
    expect((await webhook(window_, reportPaid("pay_fresh"))).status).toBe(200);
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK });
    forwarded = 0;
    expect((await ask(live, token)).status).toBe(402);
    expect(forwarded).toBe(0);
    expect((await authed(live, token, REPORT_USE_PATH, "{}")).status).toBe(402);
  });
  test("re-attack r1-2: the old name holding the test secret on the live address keeps everything test, for good", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    await webhook(env(ns, DODO_TEST_BASE), subEvent("subscription.active", "sub_testcard", "cus_t", NOW - 2 * DAY));
    await webhook(env(ns, DODO_LIVE_BASE), subEvent("subscription.updated", "sub_testcard", "cus_t", NOW - DAY));
    const store = new DurableStore(ns, () => NOW);
    expect((await store.billingOf(OWNER_ID)).subs.map(([, s]) => s.mode)).toEqual(["test"]);
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK, DODO_PRODUCTS: JSON.stringify({ pdt_live_month: { item: "pro_monthly", plan: "pro" } }) });
    forwarded = 0;
    expect((await ask(live, token)).status).toBe(402);
    expect(forwarded).toBe(0);
  });
  test("the right order works: a live event signed with the live secret is live, even before the live address is deployed", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    // The live secret is put first (the go live order): the address is still test, so Pro is held to Free there.
    const before = env(ns, DODO_TEST_BASE, { DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK });
    expect((await webhook(before, subEvent("subscription.active", "sub_real", "cus_live", NOW - DAY), LIVE_HOOK)).status).toBe(200);
    forwarded = 0;
    expect((await ask(before, token)).status).toBe(402);
    // Then the live address: the live Pro counts.
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET: undefined, DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK });
    expect((await ask(live, token)).status).toBe(200);
    expect(forwarded).toBe(1);
    expect(await me(live, token)).toBe("pro");
    const b = await new DurableStore(ns, () => NOW).billingOf(OWNER_ID);
    expect([b.customerId, b.customerMode]).toEqual(["cus_live", "live"]);
  });
  test("a live report credit, signed with the live secret, is spent in live mode", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK });
    expect((await webhook(live, reportPaid("pay_real"), LIVE_HOOK)).status).toBe(200);
    expect((await authed(live, token, REPORT_USE_PATH, "{}")).status).toBe(200);
  });
  test("one value set as both secrets counts as test, never live", async () => {
    const ns = new FakeNamespace(), { token } = await owner(ns);
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET_LIVE: TEST_HOOK });
    expect((await webhook(live, subEvent("subscription.active", "sub_same", "cus_t", NOW - DAY))).status).toBe(200);
    forwarded = 0;
    expect((await ask(live, token)).status).toBe(402);
    expect(forwarded).toBe(0);
  });
  test("an event signed with neither secret is refused", async () => {
    const ns = new FakeNamespace();
    await owner(ns);
    const live = env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK });
    expect((await webhook(live, subEvent("subscription.active", "sub_x", "cus_t", NOW - DAY), `whsec_${btoa("someone-elses-secret-0123456789")}`)).status).toBe(401);
    expect((await webhook(env(ns, DODO_LIVE_BASE, { DODO_WEBHOOK_SECRET: undefined }), subEvent("subscription.active", "sub_y", "cus_t", NOW - DAY))).status).toBe(401);
  });
});

describe("a subscription kept as test is never moved up to live", () => {
  for (const [name, make] of [
    ["MemoryStore", () => new MemoryStore()],
    ["DurableStore", () => new DurableStore(new FakeNamespace(), () => NOW)],
  ] as const) {
    test(`${name}: a later live labelled event keeps the subscription test`, async () => {
      const store = make();
      await store.applySubscription(OWNER_ID, "sub_t", { plan: "pro", status: "active", mode: "test" }, NOW - 2 * DAY);
      await store.applySubscription(OWNER_ID, "sub_t", { plan: "pro", status: "active", mode: "live" }, NOW - DAY);
      expect((await store.billingOf(OWNER_ID)).subs.map(([, s]) => s.mode)).toEqual(["test"]);
      // One kept before modes (no mode) counts as test, and stays test too.
      await store.applySubscription(OWNER_ID, "sub_old", { plan: "pro", status: "active" }, NOW - 2 * DAY);
      await store.applySubscription(OWNER_ID, "sub_old", { plan: "pro", status: "active", mode: "live" }, NOW - DAY);
      expect((await store.billingOf(OWNER_ID)).subs.find(([id]) => id === "sub_old")?.[1].mode).toBe("test");
      // A new live one is live; a test labelled event moves it down to test (the safe way).
      await store.applySubscription(OWNER_ID, "sub_l", { plan: "pro", status: "active", mode: "live" }, NOW - DAY);
      expect((await store.billingOf(OWNER_ID)).subs.find(([id]) => id === "sub_l")?.[1].mode).toBe("live");
      await store.applySubscription(OWNER_ID, "sub_l", { plan: "pro", status: "active", mode: "test" }, NOW);
      expect((await store.billingOf(OWNER_ID)).subs.find(([id]) => id === "sub_l")?.[1].mode).toBe("test");
    });
  }
  test("the webhook itself: a test secret event and a live secret event for one subscription id leave it test", async () => {
    const store = new MemoryStore(), links = new MemoryLinkBook();
    const hook = createDodoWebhook({ secret: () => TEST_HOOK, liveSecret: () => LIVE_HOOK, products: () => ({ pdt_month: "pro" }), ledger: new MemoryDodoLedger(() => NOW), links, ...storeHooks(store, () => USER_SECRET), now: () => NOW });
    const send = async (event: unknown, s: string) => {
      const body = JSON.stringify(await withOwnerSig(event, USER_SECRET));
      return hook(new Request("https://usage.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest(`m_${++msg}`, body, s, Math.floor(NOW / 1000)), body }));
    };
    expect((await send(subEvent("subscription.active", "sub_1", "cus_t", NOW - 2 * DAY), TEST_HOOK)).status).toBe(200);
    expect((await send(subEvent("subscription.renewed", "sub_1", "cus_t", NOW - DAY), LIVE_HOOK)).status).toBe(200);
    expect((await store.billingOf(OWNER_ID)).subs.map(([, s]) => s.mode)).toEqual(["test"]);
  });
});

// ---- scripts/deploy.sh: live payments need live mode's webhook secret ------------------------------------------------------
const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts", "deploy.sh");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function deploy(o: { secrets: string[]; base: string; args: string[]; toml?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-golive-order-")); dirs.push(dir);
  const calls = join(dir, "calls.txt"), bin = join(dir, "wrangler");
  writeFileSync(join(dir, "names.json"), JSON.stringify(o.secrets.map((name) => ({ name, type: "secret_text" })), null, 2));
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run")
    out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
    echo "export class StoreObject {}" > "$out/entry.js"
    {
    echo 'env.STORE (StoreObject)      Durable Object'
    echo 'env.PAYMENT_PROVIDER ("dodo")      Environment Variable'
    ${DODO_BASE_BINDING}
    } | ${WRANGLER_TABLE}
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
  writeFileSync(join(dir, "proj", "wrangler.toml"), o.toml ?? `name = "x"\nmain = "src/entry.ts"\n[vars]\nPAYMENT_PROVIDER = "dodo"\nDODO_API_BASE = "${o.base}"\n`);
  const p = Bun.spawnSync(["sh", script, ...o.args], { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: join(dir, "dist"), HOME: dir } });
  const c = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [];
  return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), deploys: c.filter((x) => x.startsWith("deploy") && !x.includes("--dry-run")) };
}

describe("scripts/deploy.sh: the live address only with live mode's webhook secret already set", () => {
  const forwarding = [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS];
  test("the live address with only the test webhook secret is refused and nothing is deployed", () => {
    const r = deploy({ secrets: [...forwarding, ...PAYMENT_SECRETS], base: DODO_LIVE_BASE, args: ["--apply", "--live-payments"] });
    expect(r.code).toBe(1);
    expect(r.text).toContain("The secret DODO_WEBHOOK_SECRET_LIVE is not set");
    expect(r.deploys).toEqual([]);
  });
  test("the live address with the live webhook secret set deploys, and says the test secret is still set", () => {
    const r = deploy({ secrets: [...forwarding, ...LIVE_PAYMENT_SECRETS, "DODO_WEBHOOK_SECRET"], base: DODO_LIVE_BASE, args: ["--apply", "--live-payments"] });
    expect(r.code).toBe(0);
    expect(r.deploys).toEqual(["deploy"]);
    expect(r.text).toContain("wrangler secret delete DODO_WEBHOOK_SECRET");
  });
  test("live mode's list names the live webhook secret, not the test one", () => {
    expect(LIVE_PAYMENT_SECRETS).toContain("DODO_WEBHOOK_SECRET_LIVE");
    expect(LIVE_PAYMENT_SECRETS).not.toContain("DODO_WEBHOOK_SECRET");
    expect(PAYMENT_SECRETS).toContain("DODO_WEBHOOK_SECRET");
  });
});

describe("scripts/deploy.sh reads Dodo's address only when it can be sure which one is deployed", () => {
  const head = `name = "x"\nmain = "src/entry.ts"\n[vars]\nPAYMENT_PROVIDER = "dodo"\n`;
  const secrets = [...ALWAYS_SECRETS, ...PAYMENT_SECRETS, "PAYMENTS_ON"];
  test("single quotes, or a second DODO_API_BASE in an [env.*] section, are refused", () => {
    for (const toml of [
      `${head}DODO_API_BASE = '${DODO_LIVE_BASE}'\n`,
      `${head}DODO_API_BASE = "${DODO_TEST_BASE}"\n[env.prod.vars]\nDODO_API_BASE = "${DODO_LIVE_BASE}"\n`,
      `${head}DODO_API_BASE = "${DODO_LIVE_BASE}"\n[env.staging.vars]\nDODO_API_BASE = "${DODO_TEST_BASE}"\n`,
    ]) {
      const r = deploy({ secrets, base: DODO_TEST_BASE, args: ["--apply"], toml });
      expect(r.code).toBe(1);
      expect(r.text).toContain("DODO_API_BASE must be written once");
      expect(r.deploys).toEqual([]);
    }
  });
  test("DODO_API_BASE set as a secret is refused", () => {
    const r = deploy({ secrets: [...secrets, "DODO_API_BASE"], base: DODO_TEST_BASE, args: ["--apply"] });
    expect(r.code).toBe(1);
    expect(r.text).toContain("wrangler secret delete DODO_API_BASE");
    expect(r.deploys).toEqual([]);
  });
  test("one plain line, and no line at all (the test address), still deploy", () => {
    expect(deploy({ secrets, base: DODO_TEST_BASE, args: ["--apply"] }).code).toBe(0);
    expect(deploy({ secrets, base: DODO_TEST_BASE, args: ["--apply"], toml: head }).code).toBe(0);
  });
});
