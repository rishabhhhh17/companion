// Audit run 2, finding 5 (test mode payments after go live), re-attack round 3. Three gaps, each proven by a test here first:
// 1. Once Dodo is live, the operator's usage view counted a test card's Pro as "pro", and counted a test subscription beside a
//    real live one as "Two live subscriptions ... Refund one in Dodo", for a person live Dodo holds one subscription for.
// 2. A test card's payment for a deleted account, verified by test mode's webhook secret still set after go live, wrote a
//    "Refund needed" line for a payment that does not exist in live Dodo.
// 3. scripts/deploy.sh read DODO_API_BASE from the text of wrangler.toml, anywhere in the file. A live line outside [vars] is
//    bound by nothing, so the Worker ran on Dodo's test address while the script believed live and deployed PROXY_ON with
//    payments. The script now reads the address the dry run binds, and refuses when the text and the binding disagree.
// Fake Durable Objects, a stand in model on 127.0.0.1 and a stand in wrangler. Nothing is deployed and no real key is used.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle, type Env, ALWAYS_SECRETS, FORWARDING_SECRETS } from "../src/worker.ts";
import { DurableLinkBook, DurableStore } from "../src/store-do.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { PLANS } from "../src/plans.ts";
import { createDodoWebhook, MemoryDodoLedger, MemoryLinkBook, signDodoForTest, type LinkBook } from "../src/dodo.ts";
import { DODO_LIVE_BASE, DODO_TEST_BASE } from "../src/dodo-api.ts";
import { storeHooks } from "../src/billing-routes.ts";
import { runOperator } from "../src/operator.ts";
import { FakeNamespace } from "./fake-do.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";
import { withOwnerSig } from "./owner-sig-fixture.ts";
import { rowsFrom, wranglerTable } from "./wrangler-vars-stub.ts";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const USER_SECRET = "golive-test-user-id-secret-0123456789abcdef";
const OPERATOR_KEY = "operator-key-0123456789abcdef0123456789abcdef";
const TEST_HOOK = `whsec_${btoa("dodo-payments-test-secret-012345")}`;
const LIVE_HOOK = `whsec_${btoa("dodo-payments-LIVE-secret-0123456")}`;
const TABLE = JSON.stringify({ pdt_month: { item: "pro_monthly", plan: "pro" }, pdt_report: { item: "report", once: true } });
const MODEL = "claude-sonnet-5-5";
const A = "google:5550001", B = "google:5550002";
const LIVE_ENV = { DODO_API_BASE: DODO_LIVE_BASE, METADATA_USER_ID_SECRET: USER_SECRET };
const TEST_ENV = { DODO_API_BASE: DODO_TEST_BASE, METADATA_USER_ID_SECRET: USER_SECRET };

const sub = (owner: string, subId: string, customerId: string) => ({
  business_id: "bus_1", type: "subscription.active", timestamp: iso(NOW - DAY),
  data: { payload_type: "Subscription", subscription_id: subId, product_id: "pdt_month", status: "active", customer: { customer_id: customerId, email: `${subId}@example.com` },
    metadata: { companion_user_id: owner }, next_billing_date: iso(NOW + 30 * DAY), cancel_at_next_billing_date: false },
});
const paid = (owner: string, paymentId: string, customerId: string) => ({
  business_id: "bus_1", type: "payment.succeeded", timestamp: iso(NOW - 1000),
  data: { payload_type: "Payment", payment_id: paymentId, product_cart: [{ product_id: "pdt_report", quantity: 1 }], customer: { customer_id: customerId, email: "x@example.com" }, metadata: { companion_user_id: owner } },
});

async function seedOwner(store: TestStore | DurableStore, o: string) {
  const t = await issueSignInToken(store, o, "free", { email: `${o}@example.com`, nonceId: `n-${o}-${crypto.randomUUID()}`, nonceUntil: NOW + 600_000, now: NOW });
  if (!t.ok) throw new Error("setup");
  const s = await store.start(o, { max: 4, usd: 0, now: NOW, limits: PLANS.pro, id: "seed", need: 0 });
  if (!s.ok) throw new Error("seed");
  await store.finish(o, { id: "seed", now: NOW, record: { userId: o, model: MODEL, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }, usd: 0.01, at: NOW, complete: true } });
}

// ---- 1. The operator's usage view, through the Worker (the re-attack's own reproduction) ---------------------------------------
describe("F5 round 3: the operator's usage view once Dodo is live", () => {
  let server: ReturnType<typeof Bun.serve>;
  beforeAll(() => { server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) { await req.text(); return Response.json({ id: "m", content: [], usage: { input_tokens: 10, output_tokens: 10 } }); } }); });
  afterAll(() => server.stop(true));
  // Live: the live address, the live secret set, and test mode's secret still set (deploy.sh allows this and only says so).
  const env = (ns: FakeNamespace): Env => ({
    STORE: ns, PROXY_ON: "on", ANTHROPIC_API_KEY: "sk-ant-api03-STAND-IN", METADATA_USER_ID_SECRET: USER_SECRET, OPERATOR_KEY,
    UPSTREAM_BASE: `http://127.0.0.1:${server.port}`, PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", DODO_API_BASE: DODO_LIVE_BASE,
    DODO_WEBHOOK_SECRET: TEST_HOOK, DODO_WEBHOOK_SECRET_LIVE: LIVE_HOOK, DODO_PRODUCTS: TABLE, DODO_PAYMENTS_API_KEY: "dodo_live_STAND-IN",
  } as Env);
  const call = (e: Env, path: string, init: RequestInit = {}) => handle(new Request(`https://usage.example${path}`, init), e, { waitUntil: () => {} }, () => NOW);
  let msg = 0;
  async function webhook(e: Env, event: unknown, secret: string) {
    const body = JSON.stringify(await withOwnerSig(event, USER_SECRET));
    return call(e, "/webhooks/dodo", { method: "POST", headers: await signDodoForTest(`msg_w_${++msg}`, body, secret, Math.floor(NOW / 1000)), body });
  }

  test("a test card's Pro is not shown as pro, and a test subscription beside a live one is not a second live one", async () => {
    const ns = new FakeNamespace(), e = env(ns), store = new DurableStore(ns, () => NOW);
    for (const o of [A, B]) await seedOwner(store, o);
    expect((await webhook(e, sub(A, "sub_test_a", "cus_test_a"), TEST_HOOK)).status).toBe(200);
    expect((await webhook(e, sub(A, "sub_live_a", "cus_live_a"), LIVE_HOOK)).status).toBe(200);
    expect((await webhook(e, sub(B, "sub_test_b", "cus_test_b"), TEST_HOOK)).status).toBe(200);
    const r = await call(e, "/v1/operator", { method: "POST", headers: { authorization: `Bearer ${OPERATOR_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ argv: ["usage"] }) });
    const out = (await r.json()) as { code: number; lines: string[]; data: { owners: [string, { plan: string; liveSubs: number }][] } };
    expect(out.lines.some((l) => l.startsWith("Two live subscriptions"))).toBe(false);
    expect(out.lines.some((l) => l.startsWith(`${B} (pro)`))).toBe(false);
    expect(out.lines.some((l) => l.startsWith(`${B} (free)`))).toBe(true);
    expect(out.lines.some((l) => l.startsWith(`${A} (pro)`))).toBe(true);
    // The data the founder's script reads agrees too.
    const by = new Map(out.data.owners);
    expect(by.get(A)).toMatchObject({ plan: "pro", liveSubs: 1 });
    expect(by.get(B)).toMatchObject({ plan: "free", liveSubs: 0 });
  });
});

// ---- 1b. The same on both stores, straight through the operator -------------------------------------------------------------
for (const kind of TEST_STORES) describe(`F5 round 3 (${kind.name})`, () => {
  const op = (store: TestStore, env: Record<string, string | undefined>, argv: string[]) => runOperator(argv, env, store, () => NOW);
  async function rig() {
    const store = kind.make();
    for (const o of [A, B]) await seedOwner(store, o);
    const sub = (mode: "test" | "live") => ({ plan: "pro", status: "active" as const, renewsOn: NOW + 30 * DAY, mode });
    await store.applySubscription(A, "sub_test_a", sub("test"), NOW - DAY);
    await store.applySubscription(A, "sub_live_a", sub("live"), NOW - DAY + 1);
    await store.applySubscription(B, "sub_test_b", sub("test"), NOW - DAY);
    return store;
  }

  test("live: only live subscriptions count in the plan shown and in the two subscriptions warning", async () => {
    const store = await rig();
    const out = await op(store, LIVE_ENV, ["usage"]);
    expect(out.lines.some((l) => l.startsWith("Two live subscriptions"))).toBe(false);
    expect(out.lines.some((l) => l.startsWith(`${B} (free)`))).toBe(true);
    expect(out.lines.some((l) => l.startsWith(`${A} (pro)`))).toBe(true);
    expect(out.lines.find((l) => l.startsWith("By plan:"))).toBe("By plan: free 1 request $0.01; pro 1 request $0.01.");
  });
  test("live: two live subscriptions are still reported, so a real double payment is never hidden", async () => {
    const store = await rig();
    await store.applySubscription(A, "sub_live_a2", { plan: "pro", status: "active", renewsOn: NOW + 31 * DAY, mode: "live" }, NOW - DAY + 2);
    const out = await op(store, LIVE_ENV, ["usage"]);
    expect(out.lines).toContain(`Two live subscriptions: ${A} (2). Refund one in Dodo.`);
  });
  test("test mode: test subscriptions still count, so the flows can be tried", async () => {
    const store = await rig();
    for (const env of [TEST_ENV, { METADATA_USER_ID_SECRET: USER_SECRET }]) {
      const out = await op(store, env, ["usage"]);
      expect(out.lines).toContain(`Two live subscriptions: ${A} (2). Refund one in Dodo.`);
      expect(out.lines.some((l) => l.startsWith(`${B} (pro)`))).toBe(true);
    }
  });
  test("an address that is neither test nor live counts as test, the safe side the server takes everywhere", async () => {
    const store = await rig();
    const out = await op(store, { DODO_API_BASE: `${DODO_LIVE_BASE}/`, METADATA_USER_ID_SECRET: USER_SECRET }, ["usage"]);
    expect(out.lines.some((l) => l.startsWith(`${B} (pro)`))).toBe(true);
  });

  // ---- 2. A refund line for a deleted account's test payment ------------------------------------------------------------------
  const hookFor = (store: TestStore) => {
    const links: LinkBook = store instanceof FakeDurableStore ? new DurableLinkBook(store.fake) : new MemoryLinkBook();
    const hook = createDodoWebhook({ secret: () => TEST_HOOK, liveSecret: () => LIVE_HOOK, products: () => ({ pdt_month: "pro" }), reportIds: () => ["pdt_report"],
      ledger: new MemoryDodoLedger(() => NOW), links, ...storeHooks(store, () => USER_SECRET), deleted: async () => true, now: () => NOW });
    let n = 0;
    return async (event: unknown, secret: string) => {
      const body = JSON.stringify(await withOwnerSig(event, USER_SECRET));
      return hook(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest(`msg_r_${++n}`, body, secret, Math.floor(NOW / 1000)), body }));
    };
  };
  test("live: a test card's payment for a deleted account writes no refund line the operator sees; a live one does", async () => {
    const store = kind.make(), send = hookFor(store);
    expect((await send(paid(A, "pay_test_1", "cus_test_1"), TEST_HOOK)).status).toBe(200);
    expect((await send(sub(A, "sub_test_1", "cus_test_1"), TEST_HOOK)).status).toBe(200);
    let usage = (await op(store, LIVE_ENV, ["usage"])).lines;
    expect(usage.some((l) => l.startsWith("Refund needed"))).toBe(false);
    expect((await op(store, LIVE_ENV, ["refunds"])).lines).toEqual(["No refund is needed."]);
    // A live payment for a deleted account is real money: it is shown.
    expect((await send(paid(A, "pay_live_1", "cus_live_1"), LIVE_HOOK)).status).toBe(200);
    usage = (await op(store, LIVE_ENV, ["usage"])).lines;
    expect(usage[0]).toMatch(/^Refund needed: 1 payment reached Dodo/);
    expect(usage.join("\n")).toContain("payment pay_live_1");
    expect(usage.join("\n")).not.toContain("pay_test_1");
    expect(usage.join("\n")).not.toContain("sub_test_1");
    const refunds = (await op(store, LIVE_ENV, ["refunds"])).lines;
    expect(refunds.length).toBe(2);
    expect(refunds.join("\n")).toContain("pay_live_1");
  });
  test("test mode: a test card's payment for a deleted account is still a refund line, to clear in Dodo's test dashboard", async () => {
    const store = kind.make(), send = hookFor(store);
    expect((await send(paid(A, "pay_test_1", "cus_test_1"), TEST_HOOK)).status).toBe(200);
    const usage = (await op(store, TEST_ENV, ["usage"])).lines;
    expect(usage[0]).toMatch(/^Refund needed: 1 payment reached Dodo/);
    expect(usage.join("\n")).toContain("pay_test_1");
  });
});

// ---- 3. scripts/deploy.sh reads Dodo's address from the dry run's bindings ----------------------------------------------------
const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts", "deploy.sh");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
/** A stand in wrangler. `bound`: the DODO_API_BASE value the dry run lists as a binding (as the real wrangler 4.156.0 prints
 *  a var), or none. The wrangler.toml text is given apart, so the two can disagree the way they did in the break. */
function deploy(o: { toml: string; bound?: string; boundLines?: string; secrets: string[]; args: string[] }) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-f5r3-")); dirs.push(dir);
  const calls = join(dir, "calls.txt"), bin = join(dir, "wrangler");
  writeFileSync(join(dir, "names.json"), JSON.stringify(o.secrets.map((name) => ({ name, type: "secret_text" })), null, 2));
  const extra = o.boundLines ?? (o.bound !== undefined ? `env.DODO_API_BASE ("${o.bound}")      Environment Variable\n` : "");
  // Close out round 1: the whole table, as the real wrangler prints it (deploy.sh reads nothing else).
  writeFileSync(join(dir, "binding.txt"), wranglerTable(rowsFrom(`env.STORE (StoreObject)      Durable Object\nenv.PAYMENT_PROVIDER ("dodo")      Environment Variable\n${extra}`)));
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run")
    out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
    echo "export class StoreObject {}" > "$out/entry.js"
    cat "${join(dir, "binding.txt")}"
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
  writeFileSync(join(dir, "proj", "wrangler.toml"), o.toml);
  const p = Bun.spawnSync(["sh", script, ...o.args], { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: join(dir, "dist"), HOME: dir } });
  const c = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [];
  return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), deploys: c.filter((x) => x.startsWith("deploy") && !x.includes("--dry-run")) };
}
const LIVE_SECRETS = [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS, "PAYMENTS_ON", "DODO_PAYMENTS_API_KEY", "DODO_WEBHOOK_SECRET_LIVE", "DODO_PRODUCTS"];
const HEAD = `name = "x"\nmain = "src/entry.ts"\n[vars]\nPAYMENT_PROVIDER = "dodo"\n`;

describe("F5 round 3: scripts/deploy.sh trusts the address the dry run binds, not the text of wrangler.toml", () => {
  test("the break: the live line sits outside [vars], so nothing is bound and the Worker is on the test address; refused", () => {
    const toml = `${HEAD}\n[observability.logs]\nenabled = true\nDODO_API_BASE = "${DODO_LIVE_BASE}"\n`;
    const r = deploy({ toml, secrets: LIVE_SECRETS, args: ["--apply", "--live-payments"] });
    expect(r.deploys).toEqual([]);
    expect(r.code).toBe(1);
    expect(r.text).toContain("DODO_API_BASE");
    expect(r.text).toContain("Nothing was deployed.");
  });
  test("the same misplaced line without --live-payments is refused too", () => {
    const toml = `${HEAD}\n[observability.logs]\nDODO_API_BASE = "${DODO_LIVE_BASE}"\n`;
    const r = deploy({ toml, secrets: LIVE_SECRETS, args: ["--apply"] });
    expect(r.deploys).toEqual([]);
    expect(r.code).toBe(1);
  });
  test("the binding says live while the text the script can read says nothing (a quoted key): refused, not read as test", () => {
    const r = deploy({ toml: `${HEAD}"DODO_API_BASE" = "${DODO_LIVE_BASE}"\n`, bound: DODO_LIVE_BASE, secrets: LIVE_SECRETS, args: ["--apply", "--live-payments"] });
    expect(r.deploys).toEqual([]);
    expect(r.code).toBe(1);
    expect(r.text).toContain("DODO_API_BASE");
  });
  test("the text says test while the binding says live (or the other way): refused", () => {
    for (const [text, bound] of [[DODO_TEST_BASE, DODO_LIVE_BASE], [DODO_LIVE_BASE, DODO_TEST_BASE]]) {
      for (const args of [["--apply"], ["--apply", "--live-payments"]]) {
        const r = deploy({ toml: `${HEAD}DODO_API_BASE = "${text}"\n`, bound, secrets: LIVE_SECRETS, args });
        expect(r.deploys).toEqual([]);
        expect(r.code).toBe(1);
      }
    }
  });
  test("two bindings, or one the script cannot read plainly, are refused", () => {
    const toml = `${HEAD}DODO_API_BASE = "${DODO_LIVE_BASE}"\n`;
    for (const boundLines of [
      `env.DODO_API_BASE ("${DODO_LIVE_BASE}")      Environment Variable\nenv.DODO_API_BASE ("${DODO_TEST_BASE}")      Environment Variable\n`,
      `env.DODO_API_BASE ("${DODO_LIVE_BASE} ")      Environment Variable\n`,
      `env.DODO_API_BASE ("https://live.dodopayme...")      Environment Variable\n`,
      `env.DODO_API_BASE (secret)      Environment Variable\n`,
    ]) {
      const r = deploy({ toml, boundLines, secrets: LIVE_SECRETS, args: ["--apply", "--live-payments"] });
      expect(r.deploys).toEqual([]);
      expect(r.code).toBe(1);
    }
  });
  test("a live line in [vars] that the dry run binds as live still deploys with --live-payments", () => {
    const r = deploy({ toml: `${HEAD}DODO_API_BASE = "${DODO_LIVE_BASE}"\n`, bound: DODO_LIVE_BASE, secrets: LIVE_SECRETS, args: ["--apply", "--live-payments"] });
    expect(r.text).toContain("Deployed.");
    expect(r.code).toBe(0);
    expect(r.deploys).toEqual(["deploy"]);
  });
  test("no line and no binding is the test address, as the server reads it: PROXY_ON with payments is refused", () => {
    const r = deploy({ toml: HEAD, secrets: LIVE_SECRETS, args: ["--apply"] });
    expect(r.deploys).toEqual([]);
    expect(r.code).toBe(1);
    expect(r.text).toContain("test mode");
  });
});
