// M116 step 5: the server for the founder. The operator's `usage` command and scripts/usage-report.ts (the operator key read
// from the founder's Keychain in code, never typed anywhere), the update feed GET /v1/update/... with the operator's
// `release set` and `release stop`, GET /v1/switches, POST /v1/report/use, and POST /v1/account/delete with the kept "deleted"
// line keyed by an HMAC (this month's spend only, no trial: the founder dropped the trial on 19 Nov 2026). Every store test
// runs on both stores. Google and Dodo are stand ins. No network, no real key, nothing deployed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGoogleVerifier } from "../src/google.ts";
import { createProxy, type SafeEvent } from "../src/proxy.ts";
import { ACCOUNT_DELETE_PATH, GOOGLE_SIGNIN_PATH, ME_PATH, NONCE_PATH, REPORT_USE_PATH, SWITCHES_PATH } from "../src/account-routes.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { createDodoWebhook, MemoryDodoLedger, MemoryLinkBook, signDodoForTest, type LinkBook } from "../src/dodo.ts";
import { storeHooks } from "../src/billing-routes.ts";
import { DELETED_PREFIX, deletedKey } from "../src/deleted.ts";
import { runOperator } from "../src/operator.ts";
import { ceilingLines, FREE_ROWS_PER_DAY, USAGE_PAGE } from "../src/operator-usage.ts";
import { chargeableSub, liveSub } from "../src/store.ts";
import { UPDATE_PATH_PREFIX, compareVersions, createUpdateRoute } from "../src/updates.ts";
import { handle as workerHandle, OPERATOR_PATH, type Env } from "../src/worker.ts";
import { DurableLinkBook, DurableStore, DIRECTORY, OWNER } from "../src/store-do.ts";
import { dayKey, monthKey } from "../src/plans.ts";
import { FakeNamespace } from "./fake-do.ts";
import { claimsAt, googleKeys, keyPair, signIdToken, type Key } from "./google-stand-in.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";
import { withOwnerSig } from "./owner-sig-fixture.ts";
import { KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, usageReport } from "../scripts/usage-report.ts";

const ROOT = join(import.meta.dir, "..");
const SECRET = "founder-test-user-id-secret-0123456789abcdef";
const OPERATOR = "operator-key-for-founder-tests-0123456789ab";
const WH_SECRET = `whsec_${btoa("dodo-payments-test-secret-012345")}`;
const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const DAY = 86_400_000;
const SUB = "109876543210";
const OWNER_ID = `google:${SUB}`;
const EMAIL = "pat@example.com";
const OTHER_ID = "google:555000111";
const OTHER_EMAIL = "sam@example.com";
const REPO = "squibby-test/squibby-releases";
const ASSET = `https://github.com/${REPO}/releases/download/v1.3.0/Squibby_aarch64.app.tar.gz`;
const SIG = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTYW5kU2lnbmF0dXJlU3RhbmRJbg==";

const realFetch = globalThis.fetch;
let networkCalls = 0;
beforeAll(() => { globalThis.fetch = (async () => { networkCalls++; throw new Error("no network in tests"); }) as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = realFetch; });

let GOOD: Key;
beforeAll(async () => { GOOD = await keyPair("kid-good"); });

const writesOf = (s: TestStore) => (s instanceof FakeDurableStore ? [...s.fake.objects.values()].reduce((n, o) => n + o.storage.writes, 0) : 0);
const errMessage = async (r: Response) => ((await r.json()) as { error: { message: string } }).error.message;
const rec = (userId: string, model: string, usd: number, at: number, input = 1000, output = 200) =>
  ({ userId, model, usd, at, complete: true, usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 } });

for (const kind of TEST_STORES) describe(kind.name, () => {

function rig(o: { payments?: boolean; loop?: boolean } = {}) {
  const clock = { t: NOW };
  const store = kind.make(), events: SafeEvent[] = [];
  const handle = createProxy({
    store, anthropicKey: "", userIdSecret: SECRET, enabled: () => false,
    loopOn: () => o.loop === true, paymentsOn: () => o.payments === true,
    now: () => clock.t, log: (e) => events.push(e),
    googleSignIn: createGoogleVerifier({ clientId: "1234-test.apps.googleusercontent.com", fetch: googleKeys(() => [GOOD]), now: () => clock.t }),
  });
  const send = (path: string, init: RequestInit = {}) => handle(new Request(`https://api.example${path}`, init));
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const googleSignIn = async (over: Record<string, unknown> = {}) => {
    const nonce = ((await (await send(NONCE_PATH)).json()) as { nonce: string }).nonce;
    const idToken = await signIdToken(GOOD, claimsAt(clock.t, { nonce, ...over }));
    return { nonce, idToken, res: await send(GOOGLE_SIGNIN_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) }) };
  };
  const signedIn = async (owner = OWNER_ID, email = EMAIL) => {
    const t = await issueSignInToken(store, owner, "free", { email, nonceId: crypto.randomUUID(), nonceUntil: clock.t + 600_000, now: clock.t });
    if (!t.ok) throw new Error("setup");
    return t.token;
  };
  const useReport = (token: string, body?: unknown) => send(REPORT_USE_PATH, { method: "POST", headers: bearer(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const del = (token: string, body: unknown = { confirm: true }) => send(ACCOUNT_DELETE_PATH, { method: "POST", headers: bearer(token), body: JSON.stringify(body) });
  const me = (token: string) => send(ME_PATH, { headers: bearer(token) });
  return { clock, store, events, send, signedIn, googleSignIn, useReport, del, me, bearer };
}
const pro = (s: TestStore, status: "active" | "past_due" | "on_hold" | "cancelling" = "active", subId = "sub_1", until?: number) =>
  s.applySubscription(OWNER_ID, subId, { plan: status === "on_hold" ? "free" : "pro", status, ...(until !== undefined ? { until } : {}), customerId: "cus_1", customerMode: "test" }, NOW - 1000);

// ---- POST /v1/report/use ------------------------------------------------------------------------------------------------------
describe("POST /v1/report/use", () => {
  test("spends one credit once, then refuses with none left, in plain words", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.addReport(OWNER_ID, "pay_1", NOW - 5000);
    const first = await r.useReport(t);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, paidBy: "credit", left: 0 });
    expect((await r.store.billingOf(OWNER_ID)).reports[0][1].state).toBe("used");
    const second = await r.useReport(t);
    expect(second.status).toBe(402);
    expect(await errMessage(second)).toMatch(/no report to use/i);
  });
  test("the same use id sent again (a retry after a lost answer) never spends a second credit", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.addReport(OWNER_ID, "pay_1", NOW - 5000);
    await r.store.addReport(OWNER_ID, "pay_2", NOW - 4000);
    expect(await (await r.useReport(t, { useId: "use-a" })).json()).toEqual({ ok: true, paidBy: "credit", left: 1 });
    expect(await (await r.useReport(t, { useId: "use-a" })).json()).toEqual({ ok: true, paidBy: "credit", left: 1 });
    expect((await r.store.billingOf(OWNER_ID)).reports.filter(([, c]) => c.state === "unused")).toHaveLength(1);
    expect(await (await r.useReport(t, { useId: "use-b" })).json()).toEqual({ ok: true, paidBy: "credit", left: 0 });
    expect((await r.useReport(t, { useId: "use-c" })).status).toBe(402);
  });
  test("the oldest unused credit goes first; a removed (refunded) credit is never spent", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.addReport(OWNER_ID, "pay_new", NOW - 1000);
    await r.store.addReport(OWNER_ID, "pay_old", NOW - 9000);
    await r.store.addReport(OWNER_ID, "pay_gone", NOW - 20_000);
    await r.store.removeReport("pay_gone", NOW - 500);
    await r.useReport(t);
    const states = Object.fromEntries((await r.store.billingOf(OWNER_ID)).reports.map(([id, c]) => [id, c.state]));
    expect(states).toEqual({ pay_new: "unused", pay_old: "used", pay_gone: "removed" });
  });
  test("on Pro it is allowed without spending a credit, while Pro includes the report", async () => {
    const r = rig();
    const t = await r.signedIn();
    await pro(r.store);
    await r.store.addReport(OWNER_ID, "pay_1", NOW - 5000);
    const res = await r.useReport(t);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, paidBy: "pro" });
    expect((await r.store.billingOf(OWNER_ID)).reports[0][1].state).toBe("unused");
  });
  test("a Pro that ran out (cancelling past its date) spends a credit like Free", async () => {
    const r = rig();
    const t = await r.signedIn();
    await pro(r.store, "cancelling", "sub_1", NOW - 10);
    await r.store.addReport(OWNER_ID, "pay_1", NOW - 5000);
    expect(await (await r.useReport(t)).json()).toEqual({ ok: true, paidBy: "credit", left: 0 });
  });
  test("needs a working sign in token; a bad use id is refused; nothing is written on a refusal", async () => {
    const r = rig();
    expect((await r.send(REPORT_USE_PATH, { method: "POST" })).status).toBe(401);
    const t = await r.signedIn();
    const before = writesOf(r.store);
    expect((await r.useReport(t)).status).toBe(402);
    expect((await r.useReport(t, { useId: "has spaces and <tags>" })).status).toBe(400);
    expect(writesOf(r.store)).toBe(before);
  });
});

// ---- POST /v1/account/delete --------------------------------------------------------------------------------------------------
describe("POST /v1/account/delete", () => {
  test("refused while a subscription could still charge: active, past due, on hold (paused is on hold)", async () => {
    for (const status of ["active", "past_due", "on_hold"] as const) {
      const r = rig();
      const t = await r.signedIn();
      await pro(r.store, status, "sub_1", status === "past_due" ? NOW + 3 * DAY : undefined);
      const before = writesOf(r.store);
      const res = await r.del(t);
      expect(res.status).toBe(409);
      expect(await errMessage(res)).toBe("Cancel Pro in billing first, then delete. Nothing was deleted.");
      expect(writesOf(r.store)).toBe(before);
      expect((await r.me(t)).status).toBe(200);
    }
  });
  test("allowed while cancelling (the paid days left are lost) and after the subscription ended", async () => {
    for (const setup of [
      (s: TestStore) => pro(s, "cancelling", "sub_1", NOW + 10 * DAY),
      (s: TestStore) => s.applySubscription(OWNER_ID, "sub_1", { plan: "free", status: "active" }, NOW - 1000),
    ]) {
      const r = rig();
      const t = await r.signedIn();
      await setup(r.store);
      const res = await r.del(t);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });
      expect((await r.me(t)).status).toBe(401);
    }
  });
  test("asks for confirm: true in the body, so a stray call deletes nothing", async () => {
    const r = rig();
    const t = await r.signedIn();
    for (const body of [{}, { confirm: "yes" }, null]) expect((await r.del(t, body)).status).toBe(400);
    expect((await r.me(t)).status).toBe(200);
  });
  test("refused while a model request is still running on the account", async () => {
    const r = rig();
    const t = await r.signedIn();
    expect(await r.store.start(OWNER_ID, { max: 4, usd: 0.01, now: NOW, limits: null, id: "req-1" })).toEqual({ ok: true });
    const res = await r.del(t);
    expect(res.status).toBe(409);
    expect(await errMessage(res)).toMatch(/still working/);
    await r.store.finish(OWNER_ID, { id: "req-1", now: NOW });
    expect((await r.del(t)).status).toBe(200);
  });
  test("afterwards nothing of the owner is left but the suspension lines and the deleted line, both under the HMAC, never the Google id", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.signedIn();   // a second Mac
    await r.store.suspendOwner(OWNER_ID, { at: NOW - 3 * DAY, caseId: "case-1" });
    await r.store.restoreOwner(OWNER_ID, { at: NOW - 2 * DAY, caseId: "case-1" });
    const t2 = await r.signedIn();
    await r.store.record(rec(OWNER_ID, "claude-sonnet-5-5", 0.12, NOW - 3600_000));
    await r.store.applySubscription(OWNER_ID, "sub_1", { plan: "free", status: "active", customerId: "cus_1", customerMode: "test" }, NOW - 1000);
    await r.store.addReport(OWNER_ID, "pay_1", NOW - 5000);
    expect((await r.del(t2)).status).toBe(200);
    expect((await r.me(t)).status).toBe(401);

    const key = await deletedKey(OWNER_ID, SECRET);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(SUB);
    const left = JSON.stringify(r.store.dump());
    expect(left).not.toContain(EMAIL);
    expect(left).toContain(key);
    // The suspension log keeps its two lines (suspended and restored), with their dates and case, under the HMAC marker.
    const logs = await r.store.suspensions();
    expect(logs).toEqual([
      { ownerId: `${DELETED_PREFIX}${key}`, kind: "suspended", at: NOW - 3 * DAY, caseId: "case-1" },
      { ownerId: `${DELETED_PREFIX}${key}`, kind: "restored", at: NOW - 2 * DAY, caseId: "case-1" },
    ]);
    expect(left).not.toContain(SUB);
    expect(await r.store.listOwnerIds()).not.toContain(OWNER_ID);
    expect(await r.store.isDeletedOwner(OWNER_ID, key, NOW)).toBe(true);
    expect(r.store.records.filter((x) => x.userId === OWNER_ID)).toEqual([]);
    if (r.store instanceof FakeDurableStore) {
      const line = r.store.fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as Record<string, unknown>;
      expect(Object.keys(line).sort()).toEqual(["at", "day", "dayUsd", "month", "monthUsd", "nonces", "until"]);
      expect(line).toMatchObject({ month: monthKey(NOW), monthUsd: 0.12, day: dayKey(NOW), dayUsd: 0.12 });
      expect(r.store.fake.storageOf(OWNER(OWNER_ID))?.data.size ?? 0).toBe(0);
    }
  });
  test("signing in again with the same Google account starts Free with the same month's spend, never a fresh allowance", async () => {
    const r = rig();
    const first = await r.googleSignIn();
    expect(first.res.status).toBe(200);
    const t = ((await first.res.json()) as { token: string }).token;
    await r.store.record(rec(OWNER_ID, "claude-sonnet-5-5", 1.5, NOW - 3600_000));
    const shareBefore = ((await (await r.me(t)).json()) as { use: { month: number; today: number } }).use;
    expect((await r.del(t)).status).toBe(200);
    expect((await r.store.spent(OWNER_ID, NOW)).month).toBe(0);   // nothing kept on the owner
    r.clock.t = NOW + 60_000;
    const again = await r.googleSignIn();
    expect(again.res.status).toBe(200);
    const body = (await again.res.json()) as { token: string; plan: string };
    expect(body.plan).toBe("free");
    expect(await r.store.spent(OWNER_ID, r.clock.t)).toEqual({ day: 1.5, month: 1.5 });
    expect(((await (await r.me(body.token)).json()) as { use: unknown }).use).toMatchObject(shareBefore);
    expect(await r.store.isDeletedOwner(OWNER_ID, await deletedKey(OWNER_ID, SECRET), r.clock.t)).toBe(false);
    // Spend booked after coming back adds to what was carried.
    await r.store.record(rec(OWNER_ID, "claude-sonnet-5-5", 0.25, r.clock.t));
    expect((await r.store.spent(OWNER_ID, r.clock.t)).month).toBe(1.75);
    // Deleting again keeps the whole month, and the next sign in carries it once, not twice.
    expect((await r.del(body.token)).status).toBe(200);
    const third = await r.googleSignIn();
    expect(third.res.status).toBe(200);
    expect((await r.store.spent(OWNER_ID, r.clock.t)).month).toBe(1.75);
  });
  test("the carried spend belongs to its month: next month starts at zero", async () => {
    const r = rig();
    const first = await r.googleSignIn();
    const t = ((await first.res.json()) as { token: string }).token;
    await r.store.record(rec(OWNER_ID, "claude-sonnet-5-5", 1.5, NOW - 3600_000));
    expect((await r.del(t)).status).toBe(200);
    r.clock.t = Date.UTC(2026, 11, 2, 9, 0, 0);
    expect((await r.googleSignIn()).res.status).toBe(200);
    expect(await r.store.spent(OWNER_ID, r.clock.t)).toEqual({ day: 0, month: 0 });
  });
  test("an ID token whose nonce was used before the delete cannot be used again after it", async () => {
    const r = rig();
    const first = await r.googleSignIn();
    const t = ((await first.res.json()) as { token: string }).token;
    expect((await r.del(t)).status).toBe(200);
    const replay = await r.send(GOOGLE_SIGNIN_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: first.idToken }) });
    expect(replay.status).toBe(401);
    expect(await r.store.listOwnerIds()).not.toContain(OWNER_ID);
  });
  test("a later Dodo event for the deleted account answers 200 and changes nothing, by metadata or by the customer link", async () => {
    const r = rig();
    const t = await r.signedIn();
    const links: LinkBook = r.store instanceof FakeDurableStore ? new DurableLinkBook(r.store.fake) : new MemoryLinkBook();
    await links.set("cus_1", OWNER_ID);
    await r.store.applySubscription(OWNER_ID, "sub_1", { plan: "pro", status: "cancelling", until: NOW + 5 * DAY, customerId: "cus_1", customerMode: "test" }, NOW - 1000);
    expect((await r.del(t)).status).toBe(200);
    const logs: { kind: string; reason?: string }[] = [];
    const hook = createDodoWebhook({ secret: () => WH_SECRET, products: () => ({ pdt_month: "pro" }), reportIds: () => ["pdt_report"],
      ledger: new MemoryDodoLedger(() => NOW), links, ...storeHooks(r.store, () => SECRET), now: () => NOW, log: (e) => logs.push(e) });
    const send = async (id: string, event: unknown) => {
      const body = JSON.stringify(await withOwnerSig(event, SECRET));
      return hook(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest(id, body, WH_SECRET, Math.floor(NOW / 1000)), body }));
    };
    const sub = (meta: Record<string, unknown>) => ({ business_id: "bus_1", type: "subscription.active", timestamp: new Date(NOW - 500).toISOString(),
      data: { payload_type: "Subscription", subscription_id: "sub_1", product_id: "pdt_month", status: "active", customer: { customer_id: "cus_1", email: EMAIL }, metadata: meta, next_billing_date: new Date(NOW + 30 * DAY).toISOString() } });
    const before = JSON.stringify(r.store.dump());
    for (const [id, ev] of [["msg_1", sub({ companion_user_id: OWNER_ID })], ["msg_2", sub({})]] as const) {
      const res = await send(id, ev);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { outcome: string }).outcome).toBe("ignored");
    }
    const refund = await send("msg_3", { business_id: "bus_1", type: "refund.succeeded", timestamp: new Date(NOW - 400).toISOString(),
      data: { payload_type: "Refund", refund_id: "rfd_1", payment_id: "pay_9", is_partial: false, customer: { customer_id: "cus_1" }, metadata: {} } });
    expect(refund.status).toBe(200);
    expect(await r.store.planOfOwner?.(OWNER_ID) ?? null).not.toBe("pro");
    expect((await r.store.billingOf(OWNER_ID)).subs).toEqual([]);
    expect(await r.store.listOwnerIds()).not.toContain(OWNER_ID);
    const after = JSON.stringify(r.store.dump());
    expect(after.includes(SUB) && !before.includes(SUB)).toBe(false);
    expect(logs.filter((l) => l.reason === "deleted_account").length).toBeGreaterThanOrEqual(2);
  });
  test("a deleted owner who signs in again is a person again: their new payments apply", async () => {
    const r = rig();
    const first = await r.googleSignIn();
    const t = ((await first.res.json()) as { token: string }).token;
    expect((await r.del(t)).status).toBe(200);
    expect((await r.googleSignIn()).res.status).toBe(200);
    const key = await deletedKey(OWNER_ID, SECRET);
    expect(await r.store.isDeletedOwner(OWNER_ID, key, r.clock.t)).toBe(false);
    expect(await r.store.applySubscription(OWNER_ID, "sub_2", { plan: "pro", status: "active" }, NOW + 1000)).toBe(true);
    expect(await r.store.planOfOwner?.(OWNER_ID)).toBe("pro");
  });
  test("needs a working sign in token", async () => {
    const r = rig();
    expect((await r.send(ACCOUNT_DELETE_PATH, { method: "POST", body: JSON.stringify({ confirm: true }) })).status).toBe(401);
  });
});

// ---- the step 5 review: money after a delete, failed subscriptions, the deleted line's end, usage in pages ----------------------
describe("step 5 review", () => {
  const hookFor = (r: ReturnType<typeof rig>, over: Partial<Parameters<typeof createDodoWebhook>[0]> = {}) => {
    const links: LinkBook = r.store instanceof FakeDurableStore ? new DurableLinkBook(r.store.fake) : new MemoryLinkBook();
    const logs: { kind: string; reason?: string; paymentId?: string }[] = [];
    const hook = createDodoWebhook({ secret: () => WH_SECRET, products: () => ({ pdt_month: "pro" }), reportIds: () => ["pdt_report"],
      ledger: new MemoryDodoLedger(() => r.clock.t), links, ...storeHooks(r.store, () => SECRET), now: () => r.clock.t, log: (e) => logs.push(e), ...over });
    const send = async (id: string, event: unknown) => {
      const body = JSON.stringify(await withOwnerSig(event, SECRET));
      return hook(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest(id, body, WH_SECRET, Math.floor(r.clock.t / 1000)), body }));
    };
    return { send, logs, links };
  };
  const meta = { companion_user_id: OWNER_ID };
  const paid = (paymentId: string, at: number) => ({ business_id: "bus_1", type: "payment.succeeded", timestamp: new Date(at).toISOString(),
    data: { payload_type: "Payment", payment_id: paymentId, product_cart: [{ product_id: "pdt_report", quantity: 1 }], customer: { customer_id: "cus_1", email: EMAIL }, metadata: meta } });
  const subEv = (type: string, status: string, at: number, subId = "sub_9") => ({ business_id: "bus_1", type, timestamp: new Date(at).toISOString(),
    data: { payload_type: "Subscription", subscription_id: subId, product_id: "pdt_month", status, customer: { customer_id: "cus_1", email: EMAIL }, metadata: meta, next_billing_date: new Date(at + 30 * DAY).toISOString() } });

  test("paying after a delete (a checkout opened before it) grants nothing, and is kept as a refund line the operator sees first", async () => {
    const r = rig();
    const t = await r.signedIn();
    expect((await r.del(t)).status).toBe(200);
    const h = hookFor(r);
    r.clock.t = NOW + 3 * 3600_000;   // the checkout was paid three hours after the delete
    for (const [id, ev] of [["msg_p", paid("pay_1", r.clock.t - 1000)], ["msg_s", subEv("subscription.active", "active", r.clock.t - 900)], ["msg_p2", paid("pay_1", r.clock.t - 800)], ["msg_c", subEv("subscription.cancelled", "cancelled", r.clock.t - 700, "sub_8")]] as const) {
      const res = await h.send(id, ev);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { outcome: string }).outcome).toBe("ignored");
    }
    // Nothing was given, and nothing names the person.
    expect(await r.store.listOwnerIds()).not.toContain(OWNER_ID);
    expect((await r.store.billingOf(OWNER_ID)).subs).toEqual([]);
    expect((await r.store.billingOf(OWNER_ID)).reports).toEqual([]);
    const refunds = await r.store.refundsNeeded();
    expect(refunds.map((x) => [x.kind, x.id]).sort()).toEqual([["payment", "pay_1"], ["subscription", "sub_9"]]);   // pay_1 once; a cancel is not money
    expect(JSON.stringify(refunds)).not.toContain(SUB);
    expect(JSON.stringify(refunds)).not.toContain(EMAIL);
    expect(h.logs.filter((l) => l.kind === "refund_needed").length).toBe(3);
    // The operator sees it at the top of usage, and with `refunds`, and clears it once refunded.
    const op = (argv: string[]) => runOperator(argv, { METADATA_USER_ID_SECRET: SECRET }, r.store, () => r.clock.t);
    const usage = (await op(["usage"])).lines;
    expect(usage[0]).toMatch(/^Refund needed: 2 payments reached Dodo for a deleted account/);
    expect(usage.join("\n")).toContain("  payment pay_1 (customer cus_1), 2026-11-19: refund it.");
    expect(usage.join("\n")).toContain("  subscription sub_9 (customer cus_1), 2026-11-19: cancel it, and refund its payments.");
    expect((await op(["refunds"])).lines.length).toBe(3);
    expect((await op(["refunds", "done", "pay_1"])).code).toBe(0);
    expect((await op(["refunds", "done", "pay_1"])).code).toBe(1);
    expect((await r.store.refundsNeeded()).map((x) => x.id)).toEqual(["sub_9"]);
    expect((await op(["refunds", "done"])).code).toBe(2);
  });
  test("when the refund line cannot be kept the answer is 500, so Dodo delivers the payment again", async () => {
    const r = rig();
    const t = await r.signedIn();
    expect((await r.del(t)).status).toBe(200);
    const h = hookFor(r, { refundNeeded: async () => { throw new Error("store down"); } });
    expect((await h.send("msg_p", paid("pay_1", NOW - 1000))).status).toBe(500);
  });
  test("a failed subscription (Dodo could not create it) never blocks a delete or a later Pro checkout; a paused one blocks the delete", async () => {
    const r = rig();
    const t = await r.signedIn();
    const h = hookFor(r);
    expect((await h.send("msg_f", subEv("subscription.failed", "failed", NOW - 2000, "sub_f"))).status).toBe(200);
    const kept = (await r.store.billingOf(OWNER_ID)).subs.find(([id]) => id === "sub_f")?.[1];
    expect(kept).toMatchObject({ plan: "free", status: "active" });
    expect(liveSub(kept!, NOW)).toBe(false);
    expect(chargeableSub(kept!)).toBe(false);
    expect((await h.send("msg_x", subEv("subscription.paused", "paused", NOW - 1000, "sub_p"))).status).toBe(200);
    expect((await r.del(t)).status).toBe(409);
    expect((await h.send("msg_y", subEv("subscription.expired", "expired", NOW - 500, "sub_p"))).status).toBe(200);
    expect((await r.del(t)).status).toBe(200);
  });
  test("the deleted line goes at the end of its month, and never sooner than 3 days after the delete", async () => {
    for (const [deletedAt, keptTo] of [[NOW, Date.UTC(2026, 11, 1)], [Date.UTC(2026, 10, 30, 23), Date.UTC(2026, 10, 30, 23) + 3 * DAY]] as const) {
      const r = rig();
      r.clock.t = deletedAt;
      const t = await r.signedIn();
      expect((await r.del(t)).status).toBe(200);
      const key = await deletedKey(OWNER_ID, SECRET);
      expect(await r.store.isDeletedOwner(OWNER_ID, key, keptTo - 1)).toBe(true);
      expect(await r.store.isDeletedOwner(OWNER_ID, key, keptTo)).toBe(false);
      // Gone from the store too, with its index, once due: nothing is kept past it.
      const left = JSON.stringify(r.store.dump());
      expect(left).not.toContain(key);
      if (r.store instanceof FakeDurableStore) expect([...(r.store.fake.storageOf(DIRECTORY)?.data.keys() ?? [])].filter((k) => k.startsWith("del:") || k.startsWith("dx:"))).toEqual([]);
      // A sign in after that starts with nothing carried.
      r.clock.t = keptTo + 1000;
      expect((await r.googleSignIn()).res.status).toBe(200);
      expect(await r.store.spent(OWNER_ID, r.clock.t)).toEqual({ day: 0, month: 0 });
    }
  });
  test("a second delete keeps one line with one index, and only the due lines go", async () => {
    const r = rig();
    const a = await r.signedIn(OWNER_ID, EMAIL);
    expect((await r.del(a)).status).toBe(200);
    r.clock.t = Date.UTC(2026, 11, 5);
    const b = await r.signedIn(OTHER_ID, OTHER_EMAIL);
    expect((await r.del(b)).status).toBe(200);   // the first line (due 1 Dec) goes as this one is written
    const ka = await deletedKey(OWNER_ID, SECRET), kb = await deletedKey(OTHER_ID, SECRET);
    const left = JSON.stringify(r.store.dump());
    expect(left).not.toContain(ka);
    expect(left).toContain(kb);
    if (r.store instanceof FakeDurableStore) expect([...(r.store.fake.storageOf(DIRECTORY)?.data.keys() ?? [])].filter((k) => k.startsWith("dx:")).length).toBe(1);
  });
  test("usage reads the owners a page at a time, and the script's report from every page counts them all", async () => {
    const r = rig(), count = 95;
    for (let i = 0; i < count; i++) {
      const o = `google:7${String(i).padStart(5, "0")}`;
      await issueSignInToken(r.store, o, "free", { email: `p${i}@example.com`, nonceId: `n${i}`, nonceUntil: NOW + 600_000, now: NOW });
      await r.store.record(rec(o, "claude-sonnet-5-5", 0.01, NOW - 3600_000));
    }
    const op = (argv: string[]) => runOperator(argv, { METADATA_USER_ID_SECRET: SECRET }, r.store, () => NOW);
    const calls = () => (r.store instanceof FakeDurableStore ? r.store.fake.log.length : 0);
    const before = calls();
    const first = await op(["usage"]);
    expect(first.code).toBe(0);
    const page = first.data as { owners: unknown[]; next: number | null };
    expect(page.owners.length).toBe(USAGE_PAGE);
    expect(page.next).not.toBeNull();
    if (r.store instanceof FakeDurableStore) expect(calls() - before).toBeLessThanOrEqual(USAGE_PAGE + 2);
    expect(first.lines.join("\n")).toContain(`--after ${page.next}`);
    expect((await op(["usage", "--after", "x"])).code).toBe(2);
    // The script asks for each page in turn, through the real operator route's logic.
    const printed: string[] = [], bodies: string[][] = [];
    const code = await usageReport([], {
      exec: async () => ({ code: 0, stdout: OPERATOR }),
      fetch: (async (_url: string, init: RequestInit) => {
        const argv = (JSON.parse(String(init.body)) as { argv: string[] }).argv;
        bodies.push(argv);
        const res = await op(argv);
        return Response.json(res, { status: res.code === 0 ? 200 : 422 });
      }) as unknown as typeof fetch,
      print: (l) => printed.push(l),
    });
    expect(code).toBe(0);
    expect(bodies.length).toBe(Math.ceil(count / USAGE_PAGE));
    expect(printed).toContain(`Usage for 2026-11 (UTC). ${count} accounts used Squibby's included use.`);
    expect(printed).toContain(`All accounts: ${count} requests, $0.95.`);
    expect(printed.filter((l) => l.startsWith("google:7")).length).toBe(count);
    expect(printed.join("\n")).not.toContain("@example.com");
    // --email finds the person on any page.
    const one: string[] = [];
    expect(await usageReport(["--email", "p90@example.com"], { exec: async () => ({ code: 0, stdout: OPERATOR }),
      fetch: (async (_u: string, init: RequestInit) => { const res = await op((JSON.parse(String(init.body)) as { argv: string[] }).argv); return Response.json(res, { status: res.code === 0 ? 200 : 422 }); }) as unknown as typeof fetch,
      print: (l) => one.push(l) })).toBe(0);
    expect(one.join("\n")).toContain("google:700090 (free), p90@example.com: 1 request");
  });
});

// ---- the operator's usage view ------------------------------------------------------------------------------------------------
describe("operator usage", () => {
  const seed = async (s: TestStore) => {
    await issueSignInToken(s, OWNER_ID, "free", { email: EMAIL, nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW });
    await issueSignInToken(s, OTHER_ID, "free", { email: OTHER_EMAIL, nonceId: "n2", nonceUntil: NOW + 600_000, now: NOW });
    await s.applySubscription(OWNER_ID, "sub_1", { plan: "pro", status: "active" }, NOW - DAY);
    await s.record(rec(OWNER_ID, "claude-sonnet-5-5", 0.3, NOW - 2 * DAY, 3000, 400));
    await s.record(rec(OWNER_ID, "claude-haiku-5", 0.02, NOW - 3600_000, 500, 100));
    await s.record(rec(OTHER_ID, "claude-sonnet-5-5", 0.11, NOW - 1800_000, 1200, 300));
    await s.record(rec(OTHER_ID, "claude-sonnet-5-5", 0.5, Date.UTC(2026, 9, 30, 12), 9999, 9999));   // last month
  };
  const op = (s: TestStore, argv: string[]) => runOperator(argv, { METADATA_USER_ID_SECRET: SECRET }, s, () => NOW);
  test("lists each account by owner id, sorted by cost, with totals that match the records, and no email", async () => {
    const s = kind.make();
    await seed(s);
    const r = await op(s, ["usage"]);
    expect(r.code).toBe(0);
    const text = r.lines.join("\n");
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(OTHER_EMAIL);
    const ownerLines = r.lines.filter((l) => l.startsWith("google:"));
    expect(ownerLines).toEqual([
      `${OWNER_ID} (pro): 2 requests, 3,500 input and 500 output tokens, $0.32`,
      `${OTHER_ID} (free): 1 request, 1,200 input and 300 output tokens, $0.11`,
    ]);
    const month = s.records.filter((x) => monthKey(x.at) === monthKey(NOW));
    const total = month.reduce((n, x) => n + x.usd, 0);
    expect(text).toContain(`All accounts: ${month.length} requests, $${total.toFixed(2)}.`);
    expect(text).toContain("By plan: pro 2 requests $0.32; free 1 request $0.11.");
    expect(text).toContain("By model: claude-sonnet-5-5 2 requests $0.41; claude-haiku-5 1 request $0.02.");
  });
  test("--month picks another month; --email finds one person and only then shows the email", async () => {
    const s = kind.make();
    await seed(s);
    const oct = await op(s, ["usage", "--month", "2026-10"]);
    expect(oct.lines.filter((l) => l.startsWith("google:"))).toEqual([`${OTHER_ID} (free): 1 request, 9,999 input and 9,999 output tokens, $0.50`]);
    const one = await op(s, ["usage", "--email", "PAT@example.com"]);
    expect(one.code).toBe(0);
    expect(one.lines.join("\n")).toContain(`${OWNER_ID} (pro), ${EMAIL}: 2 requests`);
    expect(one.lines.join("\n")).not.toContain(OTHER_ID);
    const none = await op(s, ["usage", "--email", "nobody@example.com"]);
    expect(none.code).toBe(1);
    expect(none.lines.join(" ")).toMatch(/No account has that email/);
    expect((await op(s, ["usage", "--month", "November"])).code).toBe(2);
  });
  test("shows today's model requests against the free daily limits, and anyone with two live subscriptions", async () => {
    const s = kind.make();
    await seed(s);
    await s.applySubscription(OWNER_ID, "sub_2", { plan: "pro", status: "active" }, NOW - 500);
    const text = (await op(s, ["usage"])).lines.join("\n");
    expect(text).toContain("Today (UTC): 2 model requests. About 6 of 100,000 rows written (0%) and about 6 of 100,000 store requests (0%).");
    expect(text).toContain(`Two live subscriptions: ${OWNER_ID} (2). Refund one in Dodo.`);
  });
  test("writes nothing", async () => {
    const s = kind.make();
    await seed(s);
    const before = JSON.stringify(s.dump()), w = writesOf(s);
    await op(s, ["usage"]);
    await op(s, ["usage", "--email", EMAIL]);
    expect(JSON.stringify(s.dump())).toBe(before);
    expect(writesOf(s)).toBe(w);
  });
});

// ---- the update feed and the operator's releases -------------------------------------------------------------------------------
describe("the update feed", () => {
  const env = { METADATA_USER_ID_SECRET: SECRET, RELEASES_REPO: REPO };
  const op = (s: TestStore, argv: string[], e: Record<string, string | undefined> = env) => runOperator(argv, e, s, () => NOW);
  const setArgs = (over: Record<string, string> = {}) => {
    const a: Record<string, string> = { "--platform": "darwin-aarch64", "--version": "1.3.0", "--url": ASSET, "--signature": SIG, "--notes": "Faster fixes.", ...over };
    return ["release", "set", ...Object.entries(a).flat(), "--apply"];
  };
  const check = async (s: TestStore, path: string, events: SafeEvent[] = []) => {
    const req = new Request(`https://api.example${UPDATE_PATH_PREFIX}${path}`);
    const res = await createUpdateRoute({ store: s, log: (e) => events.push(e) })(req, new URL(req.url));
    if (!res) throw new Error("not served");
    return res;
  };
  test("204 with no release; the JSON shape Tauri expects when behind; 204 when current or ahead", async () => {
    const s = kind.make();
    expect((await check(s, "darwin/aarch64/1.2.0")).status).toBe(204);
    const set = await op(s, setArgs());
    expect(set.code).toBe(0);
    const behind = await check(s, "darwin/aarch64/1.2.0");
    expect(behind.status).toBe(200);
    expect(behind.headers.get("cache-control")).toBe("no-store");
    expect(await behind.json()).toEqual({ version: "1.3.0", notes: "Faster fixes.", pub_date: new Date(NOW).toISOString(), url: ASSET, signature: SIG });
    for (const v of ["1.3.0", "1.4.0", "2.0.0"]) expect((await check(s, `darwin/aarch64/${v}`)).status).toBe(204);
    expect((await check(s, "darwin/x86_64/1.2.0")).status).toBe(204);   // no release for that platform
  });
  test("204 again after release stop; a dry run changes nothing", async () => {
    const s = kind.make();
    await op(s, setArgs());
    const dry = await op(s, ["release", "stop", "--platform", "darwin-aarch64"]);
    expect(dry.lines.join(" ")).toMatch(/Dry run/);
    expect((await check(s, "darwin/aarch64/1.2.0")).status).toBe(200);
    const stop = await op(s, ["release", "stop", "--platform", "darwin-aarch64", "--apply"]);
    expect(stop.code).toBe(0);
    expect((await check(s, "darwin/aarch64/1.2.0")).status).toBe(204);
    const show = await op(s, ["release", "show"]);
    expect(show.lines.join("\n")).toMatch(/darwin-aarch64: 1\.3\.0, stopped/);
    // A new release set after a stop is served again.
    await op(s, setArgs({ "--version": "1.3.1", "--url": ASSET.replace("v1.3.0", "v1.3.1") }));
    expect(((await (await check(s, "darwin/aarch64/1.2.0")).json()) as { version: string }).version).toBe("1.3.1");
  });
  test("refuses a url that is not a file in the public releases repo, and refuses without RELEASES_REPO", async () => {
    const s = kind.make();
    for (const url of [
      "https://github.com/someone-else/squibby-releases/releases/download/v1.3.0/Squibby.app.tar.gz",
      "https://evil.example/squibby-test/squibby-releases/releases/download/v1.3.0/Squibby.app.tar.gz",
      `http://github.com/${REPO}/releases/download/v1.3.0/Squibby.app.tar.gz`,
      `https://github.com/${REPO}/archive/main.zip`,
      `https://github.com.evil.example/${REPO}/releases/download/v1.3.0/Squibby.app.tar.gz`,
      `https://github.com/${REPO}/releases/download/v1.3.0/../../x.app.tar.gz`,
    ]) {
      const r = await op(s, setArgs({ "--url": url }));
      expect(r.code, url).toBe(2);
      expect(r.lines.join(" ")).toMatch(/releases repo/);
    }
    const noRepo = await op(s, setArgs(), { METADATA_USER_ID_SECRET: SECRET });
    expect(noRepo.code).toBe(1);
    expect(noRepo.lines.join(" ")).toMatch(/RELEASES_REPO/);
    for (const bad of [{ "--version": "1.3" }, { "--signature": "not base64 <script>" }, { "--platform": "plan9-mips" }] as Record<string, string>[]) expect((await op(s, setArgs(bad))).code).toBe(2);
    expect((await check(s, "darwin/aarch64/1.2.0")).status).toBe(204);
  });
  test("an update check writes nothing, needs no token, and logs only the version and the platform", async () => {
    const s = kind.make();
    await op(s, setArgs());
    const events: SafeEvent[] = [];
    const before = JSON.stringify(s.dump()), w = writesOf(s);
    const res = await check(s, "darwin/aarch64/1.2.0", events);
    expect(res.status).toBe(200);
    expect(JSON.stringify(s.dump())).toBe(before);
    expect(writesOf(s)).toBe(w);
    expect(events).toEqual([{ kind: "update_check", version: "1.2.0", reason: "darwin-aarch64" }]);
  });
  test("a version or a platform that cannot be read is answered 400, and nothing about it is logged", async () => {
    const s = kind.make();
    const events: SafeEvent[] = [];
    for (const p of ["darwin/aarch64/latest", "darwin/aarch64/1.2.0/extra", "darwin/../1.2.0", "darwin/aarch64/1.2.0%3Cx%3E"]) expect((await check(s, p, events)).status).toBe(400);
    expect(JSON.stringify(events)).not.toMatch(/latest|extra|<x>/);
  });
});

});   // each store

// ---- pieces that need no store ------------------------------------------------------------------------------------------------
describe("versions", () => {
  test("compares major, minor and patch as numbers, and a pre release before its release", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0-beta.1", "1.2.0")).toBeLessThan(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBeLessThan(0);
  });
});

describe("the free daily limit warning", () => {
  test("says so in one line when model requests passed 70% of a free daily limit on several of the last 7 days", () => {
    const busy = Math.ceil((FREE_ROWS_PER_DAY * 0.7) / 3);
    const days: [string, number][] = [["2026-11-13", 10], ["2026-11-14", busy], ["2026-11-15", 10], ["2026-11-16", busy + 5], ["2026-11-17", 3], ["2026-11-18", 1], ["2026-11-19", 2]];
    const lines = ceilingLines(days, "2026-11-19");
    expect(lines.filter((l) => /70%/.test(l))).toEqual(["On 2 of the last 7 days the server passed 70% of a free daily limit. Moving to the $5 Workers plan is your call."]);
    expect(ceilingLines([["2026-11-19", 2], ["2026-11-14", busy]], "2026-11-19").some((l) => /70%/.test(l))).toBe(false);
  });
});

describe("the Worker", () => {
  let logs: string[] = [];
  const realLog = console.log, realErr = console.error;
  beforeEach(() => { logs = []; console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); }; console.error = console.log; });
  afterEach(() => { console.log = realLog; console.error = realErr; });
  const env = (over: Partial<Env> = {}): Env => ({ STORE: new FakeNamespace(), METADATA_USER_ID_SECRET: SECRET, OPERATOR_KEY: OPERATOR, RELEASES_REPO: REPO, ...over });
  const send = (e: Env, path: string, init: RequestInit = {}) => workerHandle(new Request(`https://api.example${path}`, init), e, { waitUntil: () => {} }, () => NOW);
  const operator = (e: Env, argv: string[], key: string | null = OPERATOR) => send(e, OPERATOR_PATH, { method: "POST", headers: key ? { authorization: `Bearer ${key}` } : {}, body: JSON.stringify({ argv }) });

  test("GET /v1/switches answers both switches from PAYMENTS_ON and LOOP_ON, needs no token and touches no store", async () => {
    const off = env();
    const a = await send(off, SWITCHES_PATH);
    expect(a.status).toBe(200);
    expect(a.headers.get("cache-control")).toBe("no-store");
    expect(await a.json()).toEqual({ payments: false, fixing: false });
    const on = env({ PAYMENTS_ON: "on", LOOP_ON: "true" });
    expect(await (await send(on, SWITCHES_PATH)).json()).toEqual({ payments: true, fixing: true });
    expect(await (await send(env({ PAYMENTS_ON: "off", LOOP_ON: "yes" }), SWITCHES_PATH)).json()).toEqual({ payments: false, fixing: false });
    expect((off.STORE as FakeNamespace).objects.size).toBe(0);
    expect((on.STORE as FakeNamespace).objects.size).toBe(0);
  });
  test("operator usage needs OPERATOR_KEY: not served without one, refused with a wrong one", async () => {
    expect((await operator(env({ OPERATOR_KEY: undefined }), ["usage"])).status).toBe(404);
    expect((await operator(env(), ["usage"], "x".repeat(44))).status).toBe(401);
    const ok = await operator(env(), ["usage"]);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { lines: string[] }).lines.join(" ")).toMatch(/Usage for 2026-11/);
  });
  test("release set through the operator route, then the update feed through the Worker", async () => {
    const e = env();
    const set = await operator(e, ["release", "set", "--platform", "darwin-aarch64", "--version", "1.3.0", "--url", ASSET, "--signature", SIG, "--notes", "Faster fixes.", "--apply"]);
    expect(set.status).toBe(200);
    const feed = await send(e, `${UPDATE_PATH_PREFIX}darwin/aarch64/1.2.0`);
    expect(feed.status).toBe(200);
    expect(((await feed.json()) as { url: string }).url).toBe(ASSET);
    expect((await send(e, `${UPDATE_PATH_PREFIX}darwin/aarch64/1.3.0`)).status).toBe(204);
    expect(logs.some((l) => l.includes('"update_check"') && l.includes("1.2.0"))).toBe(true);
  });
  test("an update check whose store fails gets a plain 503, never Cloudflare's page", async () => {
    const ns = new FakeNamespace();
    const broken = { idFromName: (n: string) => ns.idFromName(n), get: () => ({ fetch: async () => new Response("x", { status: 500 }) }) };
    const r = await send(env({ STORE: broken as unknown as Env["STORE"] }), `${UPDATE_PATH_PREFIX}darwin/aarch64/1.2.0`);
    expect(r.status).toBe(503);
  });
  test("delete and report use through the Worker; a store failure gets the account sentence; no email, token or key in any log line", async () => {
    const ns = new FakeNamespace(), e = env({ STORE: ns });
    const store = new DurableStore(ns, () => NOW);
    const t = await issueSignInToken(store, OWNER_ID, "free", { email: EMAIL, nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW });
    if (!t.ok) throw new Error("setup");
    await store.addReport(OWNER_ID, "pay_1", NOW - 1000);
    const auth = { authorization: `Bearer ${t.token}` };
    expect((await send(e, REPORT_USE_PATH, { method: "POST", headers: auth })).status).toBe(200);
    const broken = { idFromName: (n: string) => ns.idFromName(n), get: () => ({ fetch: async () => new Response("x", { status: 500 }) }) };
    for (const p of [REPORT_USE_PATH, ACCOUNT_DELETE_PATH]) {
      const b = await send(env({ STORE: broken as unknown as Env["STORE"] }), p, { method: "POST", headers: auth, body: JSON.stringify({ confirm: true }) });
      expect(b.status).toBe(503);
      expect(await errMessage(b)).toMatch(/account could not be reached/);
    }
    expect((await send(e, ACCOUNT_DELETE_PATH, { method: "POST", headers: auth, body: JSON.stringify({ confirm: true }) })).status).toBe(200);
    await operator(e, ["usage"]);
    await operator(e, ["usage", "--email", EMAIL]);
    const all = logs.join("\n");
    for (const s of [EMAIL, t.token, OPERATOR, SECRET, SIG]) expect(all).not.toContain(s);
    expect(all).toContain('"account_deleted"');
    expect(all).not.toMatch(/"account_deleted"[^\n]*google:/);
  });
  test("there is no trial route anywhere on the server", async () => {
    for (const f of readdirSync(join(ROOT, "src")).filter((n) => n.endsWith(".ts"))) expect(readFileSync(join(ROOT, "src", f), "utf8"), f).not.toMatch(/trial\/start|trialEnd|trial_used|trialUsed/);
    const r = await send(env(), "/v1/trial/start", { method: "POST" });
    expect(r.status).not.toBe(200);
  });
  test("a deleted marker in the link book never blocks a new account that pays with the same Dodo customer", async () => {
    const ns = new FakeNamespace();
    const links = new DurableLinkBook(ns);
    await links.set("cus_1", `${DELETED_PREFIX}${"a".repeat(64)}`);
    const store = new DurableStore(ns, () => NOW);
    const hook = createDodoWebhook({ secret: () => WH_SECRET, products: () => ({ pdt_month: "pro" }), ledger: new MemoryDodoLedger(() => NOW), links, ...storeHooks(store, () => SECRET), now: () => NOW });
    const body = JSON.stringify(await withOwnerSig({ business_id: "bus_1", type: "subscription.active", timestamp: new Date(NOW - 500).toISOString(),
      data: { payload_type: "Subscription", subscription_id: "sub_9", product_id: "pdt_month", status: "active", customer: { customer_id: "cus_1" }, metadata: { companion_user_id: OTHER_ID }, next_billing_date: new Date(NOW + 30 * DAY).toISOString() } }, SECRET));
    const r = await hook(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest("msg_x", body, WH_SECRET, Math.floor(NOW / 1000)), body }));
    expect(r.status).toBe(200);
    expect(await store.planOfOwner(OTHER_ID)).toBe("pro");
    expect((await store.billingOf(OTHER_ID)).customerId).toBe("cus_1");
    expect(await links.get("cus_1")).toBe(OTHER_ID);
  });
  test("no network was used by any test here", () => { expect(networkCalls).toBe(0); });
});

// ---- scripts/usage-report.ts --------------------------------------------------------------------------------------------------
describe("scripts/usage-report.ts", () => {
  type Call = { url: string; auth: string | null; body: unknown };
  const rigScript = (o: { key?: string | null; status?: number } = {}) => {
    const execs: { cmd: string; args: string[] }[] = [], calls: Call[] = [], printed: string[] = [];
    const deps = {
      exec: async (cmd: string, args: string[]) => { execs.push({ cmd, args }); return o.key === null ? { code: 44, stdout: "" } : { code: 0, stdout: `${o.key ?? OPERATOR}\n` }; },
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
        return Response.json({ code: 0, lines: ["Usage for 2026-11 (UTC).", "All accounts: 0 requests, $0.00."] }, { status: o.status ?? 200 });
      }) as unknown as typeof fetch,
      print: (l: string) => { printed.push(l); },
    };
    return { execs, calls, printed, deps };
  };
  test("reads the operator key from the founder's Keychain item in code, and sends it only in the Authorization header", async () => {
    const r = rigScript();
    const code = await usageReport(["--month", "2026-11", "--email", EMAIL], r.deps);
    expect(code).toBe(0);
    expect(r.execs).toEqual([{ cmd: "/usr/bin/security", args: ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"] }]);
    expect(r.calls).toEqual([{ url: `https://api.getsquibby.com${OPERATOR_PATH}`, auth: `Bearer ${OPERATOR}`, body: { argv: ["usage", "--month", "2026-11", "--email", EMAIL] } }]);
    expect(r.printed).toEqual(["Usage for 2026-11 (UTC).", "All accounts: 0 requests, $0.00."]);
    expect(r.printed.join("\n")).not.toContain(OPERATOR);
  });
  test("with no Keychain item it says which item to make, and sends nothing", async () => {
    const r = rigScript({ key: null });
    expect(await usageReport([], r.deps)).toBe(1);
    expect(r.calls).toEqual([]);
    expect(r.printed.join(" ")).toContain(KEYCHAIN_SERVICE);
  });
  test("a key shorter than 32 characters is refused before anything is sent", async () => {
    const r = rigScript({ key: "short" });
    expect(await usageReport([], r.deps)).toBe(1);
    expect(r.calls).toEqual([]);
  });
  test("--server must be https (or this Mac for a local run); the key never goes anywhere else", async () => {
    const r = rigScript();
    expect(await usageReport(["--server", "http://api.example.com"], r.deps)).toBe(2);
    expect(r.calls).toEqual([]);
    expect(await usageReport(["--server", "http://127.0.0.1:8787"], r.deps)).toBe(0);
    expect(r.calls[0].url).toBe(`http://127.0.0.1:8787${OPERATOR_PATH}`);
  });
  test("a refusal from the server is printed in plain words, never with the key", async () => {
    const r = rigScript({ status: 401 });
    expect(await usageReport([], r.deps)).toBe(1);
    expect(r.printed.join(" ")).not.toContain(OPERATOR);
  });
  test("the script never reads the key from an environment setting", () => {
    const text = readFileSync(join(ROOT, "scripts", "usage-report.ts"), "utf8");
    expect(text).not.toMatch(/process\.env\.OPERATOR_KEY|Bun\.env\.OPERATOR_KEY/);
  });
});
