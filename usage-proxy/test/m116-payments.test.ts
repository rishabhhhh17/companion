// M116 step 4: server payments. Checkout made on the server (item in, product id chosen here, owner from the token), the billing
// portal for the customer the server saved, the /paid return page that grants nothing and drops its query, the plan kept per
// subscription (the owner's plan is the best of them), cancel at period end and its undo, the failure statuses, and the $29
// report as a credit keyed by payment_id (removed on a full refund or a lost dispute). Dodo is a stand in: a fake fetch that
// writes down what it was asked. Every store test runs on both stores. No network, no real key, nothing deployed.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MemoryDodoLedger, MemoryLinkBook, createDodoWebhook, decideDodoEvent, parseDodoCatalog, parseDodoProducts, signDodoForTest,
  type DodoCatalog, type DodoWebhookDeps, type SafeDodoEvent,
} from "../src/dodo.ts";
import { DODO_LIVE_BASE, DODO_TEST_BASE, dodoSetup } from "../src/dodo-api.ts";
import { CHECKOUT_PATH, PAID_DONE_PATH, PAID_PATH, PORTAL_PATH, createBillingRoutes, storeHooks } from "../src/billing-routes.ts";
import type { SafeEvent } from "../src/proxy.ts";
import { issueSignInToken, issueToken } from "../src/accounts.ts";
import { handle as workerHandle, type Env } from "../src/worker.ts";
import { DurableStore, OWNER, PAYMENTS } from "../src/store-do.ts";
import { FakeNamespace } from "./fake-do.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";
import { OWNER_SECRET, withOwnerSig } from "./owner-sig-fixture.ts";
import { OWNER_SIG_KEY, signOwner } from "../src/owner-sig.ts";

const ROOT = join(import.meta.dir, "..");
const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const NOWS = Math.floor(NOW / 1000);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const SECRET = `whsec_${btoa("dodo-payments-test-secret-012345")}`;
const TEST_KEY = "dodo_test_STAND-IN-KEY-MUST-NOT-LEAK-0000";
const LIVE_KEY = "dodo_live_STAND-IN-KEY-MUST-NOT-LEAK-0000";
const EMAIL = "pat@example.com";
const OWNER_ID = "google:109876543210";
// The table as the plan writes it (section 2), with made up ids.
const TABLE = JSON.stringify({ pdt_month: { item: "pro_monthly", plan: "pro" }, pdt_year: { item: "pro_yearly", plan: "pro" }, pdt_report: { item: "report", once: true } });
const CATALOG = (() => { const c = parseDodoCatalog(TABLE); if (!c.ok) throw new Error(c.message); return c.catalog; })();

const writesOf = (s: TestStore) => (s instanceof FakeDurableStore ? [...s.fake.objects.values()].reduce((n, o) => n + o.storage.writes, 0) : 0);

// ---- the product table -------------------------------------------------------------------------------------------------------
describe("the product table (DODO_PRODUCTS) with item names", () => {
  test("the new form names each item, and the plan map still holds only the two Pro products", () => {
    expect(CATALOG).toEqual({ plans: { pdt_month: "pro", pdt_year: "pro" }, items: { pro_monthly: "pdt_month", pro_yearly: "pdt_year", report: "pdt_report" }, reports: ["pdt_report"] });
    expect(parseDodoProducts(TABLE)).toEqual({ ok: true, products: { pdt_month: "pro", pdt_year: "pro" } });
  });
  test("the old form (product id to plan name) still reads, with no items", () => {
    expect(parseDodoCatalog('{"pdt_a":"pro"}')).toEqual({ ok: true, catalog: { plans: { pdt_a: "pro" }, items: {}, reports: [] } });
  });
  test("an unknown item, a Pro item with no real plan, a report that is not once, or two products for one item are refused", () => {
    for (const bad of [
      { pdt_a: { item: "pro_weekly", plan: "pro" } },
      { pdt_a: { item: "pro_monthly", plan: "max" } },
      { pdt_a: { item: "pro_monthly" } },
      { pdt_a: { item: "report" } },
      { pdt_a: { item: "report", once: true, plan: "pro" } },
      { pdt_a: { item: "pro_monthly", plan: "pro" }, pdt_b: { item: "pro_monthly", plan: "pro" } },
      { pdt_a: 5 },
    ]) {
      const r = parseDodoCatalog(JSON.stringify(bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/product table/i);
    }
  });
  test("the example file is the new form, and no product id is written in the source", () => {
    const ex = parseDodoCatalog(readFileSync(join(ROOT, "dodo-products.example.json"), "utf8"));
    expect(ex.ok).toBe(true);
    if (ex.ok) expect(Object.keys(ex.catalog.items).sort()).toEqual(["pro_monthly", "pro_yearly", "report"]);
    for (const f of ["dodo.ts", "dodo-api.ts", "billing-routes.ts", "worker.ts"]) expect(readFileSync(join(ROOT, "src", f), "utf8")).not.toMatch(/pdt_[A-Za-z0-9]/);
  });
});

// ---- what a subscription event means now -------------------------------------------------------------------------------------
const subEvent = (type: string, status: string | undefined, over: Record<string, unknown> = {}, at = NOW - 10_000, subId = "sub_1") => ({
  business_id: "bus_1", type, timestamp: iso(at),
  data: {
    payload_type: "Subscription", subscription_id: subId, product_id: "pdt_month", ...(status ? { status } : {}),
    customer: { customer_id: "cus_1", email: EMAIL, name: "Pat Example" }, metadata: { companion_user_id: OWNER_ID },
    next_billing_date: iso(NOW + 30 * DAY), cancel_at_next_billing_date: false, ...over,
  },
});
const payEvent = (type: string, data: Record<string, unknown>, at = NOW - 10_000) => ({ business_id: "bus_1", type, timestamp: iso(at), data });
const reportPaid = (paymentId: string, over: Record<string, unknown> = {}, at = NOW - 10_000) => payEvent("payment.succeeded", {
  payload_type: "Payment", payment_id: paymentId, status: "succeeded", customer: { customer_id: "cus_1", email: EMAIL },
  metadata: { companion_user_id: OWNER_ID }, product_cart: [{ product_id: "pdt_report", quantity: 1 }], ...over,
}, at);
const refund = (paymentId: string, isPartial: boolean, at = NOW - 5000) => payEvent("refund.succeeded", {
  payload_type: "Refund", refund_id: `rfd_${paymentId}`, payment_id: paymentId, is_partial: isPartial, status: "succeeded",
  customer: { customer_id: "cus_1", email: EMAIL }, metadata: {},
}, at);
const dispute = (type: string, paymentId: string, at = NOW - 5000) => payEvent(type, {
  payload_type: "Dispute", dispute_id: `dsp_${paymentId}`, payment_id: paymentId, dispute_status: type === "dispute.lost" ? "dispute_lost" : "dispute_opened",
}, at);

describe("what each subscription event means (M116)", () => {
  const decide = async (e: unknown) => decideDodoEvent(await withOwnerSig(e), CATALOG.plans, new MemoryLinkBook(), "test", OWNER_SECRET);
  test("cancelled with cancel_at_next_billing_date and a future next_billing_date keeps Pro until then, as cancelling", async () => {
    expect(await decide(subEvent("subscription.cancelled", "cancelled", { cancel_at_next_billing_date: true }))).toMatchObject({
      kind: "set", entitlement: { userId: OWNER_ID, plan: "pro", status: "cancelling", until: NOW + 30 * DAY },
    });
  });
  test("cancelled without the flag, or with a next date already past, is Free now; expired is Free", async () => {
    expect(await decide(subEvent("subscription.cancelled", "cancelled"))).toMatchObject({ kind: "set", entitlement: { plan: "free", status: "active" } });
    expect(await decide(subEvent("subscription.cancelled", "cancelled", { cancel_at_next_billing_date: true, next_billing_date: iso(NOW - 20_000) }))).toMatchObject({ kind: "set", entitlement: { plan: "free" } });
    expect(await decide(subEvent("subscription.expired", "expired"))).toMatchObject({ kind: "set", entitlement: { plan: "free", status: "active" } });
  });
  test("on_hold and paused set Free with status on_hold (the app says the payment failed); failed is plain Free", async () => {
    for (const [type, status] of [["on_hold", "on_hold"], ["paused", "paused"]]) {
      expect(await decide(subEvent(`subscription.${type}`, status))).toMatchObject({ kind: "set", entitlement: { plan: "free", status: "on_hold" } });
    }
    // Dodo could not create it and sends nothing after: it can never charge, so it is kept as ended, never on hold.
    expect(await decide(subEvent("subscription.failed", "failed"))).toMatchObject({ kind: "set", entitlement: { plan: "free", status: "active" } });
  });
  test("a scheduled cancel on an active subscription is cancelling until next_billing_date; the flag back to false is active again", async () => {
    expect(await decide(subEvent("subscription.updated", "active", { cancel_at_next_billing_date: true }))).toMatchObject({ entitlement: { plan: "pro", status: "cancelling", until: NOW + 30 * DAY } });
    const undone = await decide(subEvent("subscription.updated", "active"));
    expect(undone).toMatchObject({ kind: "set", entitlement: { plan: "pro", status: "active" } });
    expect((undone as { entitlement: { until?: number } }).entitlement.until).toBeUndefined();
  });
  test("the detail carries the subscription id, the renew date, and the customer id only when the metadata names the owner", async () => {
    expect(await decide(subEvent("subscription.renewed", "active"))).toMatchObject({ detail: { subscriptionId: "sub_1", customerId: "cus_1", renewsOn: NOW + 30 * DAY } });
    const links = new MemoryLinkBook(); await links.set("cus_1", OWNER_ID);
    const viaLink = await decideDodoEvent(subEvent("subscription.renewed", "active", { metadata: {} }), CATALOG.plans, links, "test", OWNER_SECRET);
    expect(viaLink).toMatchObject({ kind: "set", detail: { subscriptionId: "sub_1" } });
    expect((viaLink as { detail: { customerId?: string } }).detail.customerId).toBeUndefined();
  });
  test("plan_changed from monthly to yearly keeps Pro", async () => {
    expect(await decide(subEvent("subscription.plan_changed", "active", { product_id: "pdt_year" }))).toMatchObject({ kind: "set", entitlement: { plan: "pro", status: "active" } });
  });
});

// ---- the store: per subscription, best of them, reports -------------------------------------------------------------------------
for (const kind of TEST_STORES) describe(`${kind.name}: subscriptions and report credits`, () => {
  const planOf = async (s: TestStore) => (await s.billingOf(OWNER_ID));
  test("the owner's plan is the best of their subscriptions: one cancelled or expired keeps Pro while another is active", async () => {
    const s = kind.make();
    await issueToken(s, OWNER_ID, "free");
    expect(await s.applySubscription(OWNER_ID, "sub_a", { plan: "pro", status: "active", renewsOn: NOW + DAY, customerId: "cus_1" }, NOW - 100)).toBe(true);
    expect(await s.applySubscription(OWNER_ID, "sub_b", { plan: "pro", status: "active" }, NOW - 90)).toBe(true);
    expect(await s.applySubscription(OWNER_ID, "sub_b", { plan: "free", status: "active" }, NOW - 50)).toBe(true);
    expect(await s.planOfOwner!(OWNER_ID)).toBe("pro");
    expect(await s.applySubscription(OWNER_ID, "sub_a", { plan: "free", status: "on_hold" }, NOW - 40)).toBe(true);
    expect(await s.planOfOwner!(OWNER_ID)).toBe("free");
    const b = await planOf(s);
    expect(b.customerId).toBe("cus_1");
    expect(b.subs.map(([id]) => id).sort()).toEqual(["sub_a", "sub_b"]);
  });
  test("an older event for one subscription is stale for it, but never stops a newer one of another subscription", async () => {
    const s = kind.make();
    await s.applySubscription(OWNER_ID, "sub_a", { plan: "pro", status: "active" }, NOW - 10);
    expect(await s.applySubscription(OWNER_ID, "sub_a", { plan: "free", status: "active" }, NOW - 20)).toBe(false);
    expect(await s.applySubscription(OWNER_ID, "sub_b", { plan: "free", status: "active" }, NOW - 500)).toBe(true);
    expect(await s.planOfOwner!(OWNER_ID)).toBe("pro");
  });
  test("cancelling keeps Pro until its date; with an active one too, the plan is plainly active", async () => {
    const s = kind.make();
    await s.applySubscription(OWNER_ID, "sub_a", { plan: "pro", status: "cancelling", until: NOW + 5 * DAY }, NOW - 10);
    const t = await issueToken(s, OWNER_ID, "free"); if (!t.ok) throw new Error("setup");
    const { hashToken } = await import("../src/tokens.ts");
    expect(await s.userByTokenHash(await hashToken(t.token))).toMatchObject({ plan: "pro", status: "cancelling", planUntil: NOW + 5 * DAY });
    await s.applySubscription(OWNER_ID, "sub_b", { plan: "pro", status: "active", renewsOn: NOW + 20 * DAY }, NOW - 5);
    expect(await s.userByTokenHash(await hashToken(t.token))).toMatchObject({ plan: "pro", status: "active", renewsOn: NOW + 20 * DAY });
  });
  test("a report credit is added once per payment_id, removed once, and a used one stays used", async () => {
    const s = kind.make();
    expect(await s.addReport(OWNER_ID, "pay_1", NOW)).toBe("added");
    expect(await s.addReport(OWNER_ID, "pay_1", NOW + 40 * 3600_000)).toBe("known");
    expect(await s.addReport(OWNER_ID, "pay_2", NOW)).toBe("added");
    expect((await planOf(s)).reports.filter(([, r]) => r.state === "unused").length).toBe(2);
    expect(await s.removeReport("pay_1")).toEqual({ result: "removed", ownerId: OWNER_ID });
    expect(await s.removeReport("pay_1")).toEqual({ result: "already", ownerId: OWNER_ID });
    expect(await s.removeReport("pay_unknown")).toEqual({ result: "unknown" });
    expect(await s.addReport(OWNER_ID, "pay_1", NOW + 1)).toBe("known");   // a late retry never brings a refunded credit back
    expect((await planOf(s)).reports.filter(([, r]) => r.state === "unused").map(([id]) => id)).toEqual(["pay_2"]);
  });
  test("a refund before its payment leaves a marker, so the payment's credit is added as removed", async () => {
    const s = kind.make();
    expect(await s.removeReport("pay_early")).toEqual({ result: "unknown" });
    expect(await s.addReport(OWNER_ID, "pay_early", NOW)).toBe("known");
    expect((await planOf(s)).reports).toEqual([["pay_early", { at: NOW, state: "removed" }]]);
    expect(await s.removeReport("pay_early")).toEqual({ result: "already", ownerId: OWNER_ID });
  });
  test("a customer id is kept with its Dodo mode; one kept before modes were kept counts as test", async () => {
    const s = kind.make();
    await s.applySubscription(OWNER_ID, "sub_a", { plan: "pro", status: "active", customerId: "cus_old" }, NOW - 10);
    let b = await planOf(s);
    expect([b.customerId, b.customerMode]).toEqual(["cus_old", "test"]);
    await s.saveCustomer(OWNER_ID, "cus_live", "live");
    b = await planOf(s);
    expect([b.customerId, b.customerMode]).toEqual(["cus_live", "live"]);
    expect((await s.billingOf("google:nobody")).customerMode).toBeNull();
  });
  test("reading the billing record writes nothing", async () => {
    const s = kind.make();
    await s.applySubscription(OWNER_ID, "sub_a", { plan: "pro", status: "active" }, NOW);
    const before = JSON.stringify(s.dump()), w = writesOf(s);
    await s.billingOf(OWNER_ID); await s.billingOf("google:nobody");
    expect(JSON.stringify(s.dump())).toBe(before);
    expect(writesOf(s)).toBe(w);
  });
});

describe("Durable Object store: a refund between the payment's owner and its credit being written", () => {
  test("the refund still leaves the credit removed", async () => {
    const s = new FakeDurableStore() as FakeDurableStore & { call<T>(name: string, op: string, args?: Record<string, unknown>): Promise<T> };
    // addReport's first step done (the payment's owner kept), its second (the credit) not yet.
    await s.call(PAYMENTS, "pay.setReportOwner", { paymentId: "pay_mid", ownerId: OWNER_ID });
    expect((await s.removeReport("pay_mid")).result).toBe("unknown");
    expect(await s.addReport(OWNER_ID, "pay_mid", NOW)).toBe("known");
    expect((await s.billingOf(OWNER_ID)).reports.filter(([, r]) => r.state === "unused")).toEqual([]);
  });
});

// ---- the webhook against the store --------------------------------------------------------------------------------------------
for (const kind of TEST_STORES) describe(`${kind.name}: the Dodo webhook sets plans and report credits`, () => {
  let store: TestStore, logs: SafeDodoEvent[], nowMs: number, ledger: MemoryDodoLedger, links: MemoryLinkBook, lookups: string[];
  const consoleText: string[] = [];
  const realLog = console.log;
  beforeEach(() => {
    store = kind.make(); logs = []; nowMs = NOW; ledger = new MemoryDodoLedger(() => nowMs); links = new MemoryLinkBook(); lookups = [];
    consoleText.length = 0; console.log = (...a: unknown[]) => { consoleText.push(a.map(String).join(" ")); };
  });
  afterEach(() => { console.log = realLog; });
  const hook = (paymentProducts?: (id: string) => Promise<string[] | null>, over: Partial<DodoWebhookDeps> = {}) => createDodoWebhook({
    secret: () => SECRET, products: () => CATALOG.plans, reportIds: () => CATALOG.reports, ledger, links,
    ...storeHooks(store), ownerSecret: () => OWNER_SECRET, now: () => nowMs, log: (e) => logs.push(e),
    ...(paymentProducts ? { paymentProducts: async (id: string) => { lookups.push(id); return paymentProducts(id); } } : {}),
    ...over,
  });
  const send = async (h: ReturnType<typeof hook>, ev: unknown, id: string) => {
    const body = JSON.stringify(await withOwnerSig(ev));
    return h(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest(id, body, SECRET, Math.floor(nowMs / 1000)), body }));
  };
  const plan = async () => (await store.planOfOwner!(OWNER_ID)) ?? "none";
  const credits = async () => (await store.billingOf(OWNER_ID)).reports.filter(([, r]) => r.state === "unused").length;

  test("active grants Pro and saves the customer id and the subscription", async () => {
    const r = await send(hook(), subEvent("subscription.active", "active"), "msg_1");
    expect(r.status).toBe(200);
    expect(await plan()).toBe("pro");
    const b = await store.billingOf(OWNER_ID);
    expect(b.customerId).toBe("cus_1");
    expect(b.subs).toEqual([["sub_1", expect.objectContaining({ plan: "pro", status: "active", renewsOn: NOW + 30 * DAY })]]);
  });
  test("a payment for a subscription saves the customer id too, and adds no report", async () => {
    const pay = payEvent("payment.succeeded", { payload_type: "Payment", payment_id: "pay_sub", subscription_id: "sub_1", customer: { customer_id: "cus_9" }, metadata: { companion_user_id: OWNER_ID } });
    expect((await send(hook(), pay, "msg_p")).status).toBe(200);
    expect((await store.billingOf(OWNER_ID)).customerId).toBe("cus_9");
    expect(await credits()).toBe(0);
  });
  test("cancel at period end keeps Pro until next_billing_date, undo makes it active, expired drops it", async () => {
    const h = hook();
    await send(h, subEvent("subscription.active", "active", {}, NOW - 9000), "m1");
    await send(h, subEvent("subscription.cancelled", "cancelled", { cancel_at_next_billing_date: true }, NOW - 8000), "m2");
    expect((await store.billingOf(OWNER_ID)).subs[0][1]).toMatchObject({ status: "cancelling", until: NOW + 30 * DAY });
    expect(await plan()).toBe("pro");
    await send(h, subEvent("subscription.updated", "active", { cancel_at_next_billing_date: false }, NOW - 7000), "m3");
    expect((await store.billingOf(OWNER_ID)).subs[0][1]).toMatchObject({ status: "active" });
    await send(h, subEvent("subscription.expired", "expired", {}, NOW - 6000), "m4");
    expect(await plan()).toBe("free");
  });
  test("past due keeps Pro until past_due_ends_at; on hold and paused drop it with status on_hold, failed as ended", async () => {
    const h = hook();
    await send(h, subEvent("subscription.past_due", "past_due", { past_due_ends_at: iso(NOW + 3 * DAY) }, NOW - 9000), "m1");
    expect((await store.billingOf(OWNER_ID)).subs[0][1]).toMatchObject({ plan: "pro", status: "past_due", until: NOW + 3 * DAY });
    let at = NOW - 8000;
    for (const [type, status] of [["on_hold", "on_hold"], ["failed", "failed"], ["paused", "paused"]]) {
      await send(h, subEvent("subscription.active", "active", {}, at++), `ok_${type}`);
      expect(await plan()).toBe("pro");
      await send(h, subEvent(`subscription.${type}`, status, {}, at++), `bad_${type}`);
      expect(await plan()).toBe("free");
      expect((await store.billingOf(OWNER_ID)).subs[0][1]).toMatchObject({ plan: "free", status: type === "failed" ? "active" : "on_hold" });
    }
  });
  test("renewed and plan_changed (monthly to yearly) keep Pro and refresh the renew date", async () => {
    const h = hook();
    await send(h, subEvent("subscription.active", "active", {}, NOW - 9000), "m1");
    await send(h, subEvent("subscription.plan_changed", "active", { product_id: "pdt_year", next_billing_date: iso(NOW + 365 * DAY) }, NOW - 8000), "m2");
    expect(await plan()).toBe("pro");
    expect((await store.billingOf(OWNER_ID)).subs[0][1]).toMatchObject({ renewsOn: NOW + 365 * DAY });
    await send(h, subEvent("subscription.renewed", "active", { product_id: "pdt_year", next_billing_date: iso(NOW + 400 * DAY) }, NOW - 7000), "m3");
    expect((await store.billingOf(OWNER_ID)).subs[0][1]).toMatchObject({ renewsOn: NOW + 400 * DAY });
  });
  test("two subscriptions: cancelling or expiring one keeps Pro while the other is active", async () => {
    const h = hook();
    await send(h, subEvent("subscription.active", "active", {}, NOW - 9000, "sub_a"), "m1");
    await send(h, subEvent("subscription.active", "active", {}, NOW - 8000, "sub_b"), "m2");
    await send(h, subEvent("subscription.cancelled", "cancelled", {}, NOW - 7000, "sub_a"), "m3");
    expect(await plan()).toBe("pro");
    // an older event for the other subscription still applies to it (it is ordered per subscription, not per person)
    await send(h, subEvent("subscription.expired", "expired", {}, NOW - 8500, "sub_a"), "m4");
    expect(await plan()).toBe("pro");
    await send(h, subEvent("subscription.expired", "expired", {}, NOW - 6000, "sub_b"), "m5");
    expect(await plan()).toBe("free");
  });
  test("the report adds one credit per payment_id, even sent three times over 40 hours", async () => {
    const h = hook();
    expect((await send(h, reportPaid("pay_r1"), "msg_r1")).status).toBe(200);
    nowMs = NOW + 20 * 3600_000;
    expect((await send(h, reportPaid("pay_r1"), "msg_r1")).status).toBe(200);   // Dodo's retry: same webhook id
    nowMs = NOW + 40 * 3600_000;
    expect((await send(h, reportPaid("pay_r1"), "msg_r1_again")).status).toBe(200);   // a repeated event with a new id
    expect(await credits()).toBe(1);
    expect(await plan()).not.toBe("pro");   // a report is never Pro
  });
  test("an event id is still known after 37 hours", async () => {
    const h = hook();
    await send(h, subEvent("subscription.active", "active"), "msg_old");
    nowMs = NOW + 37 * 3600_000;
    const again = await send(h, subEvent("subscription.active", "active"), "msg_old");
    expect(((await again.json()) as { outcome: string }).outcome).toBe("duplicate");
  });
  test("a full refund removes an unused credit; a partial refund does not; a used credit stays used", async () => {
    const h = hook();
    await send(h, reportPaid("pay_a"), "m1");
    await send(h, reportPaid("pay_b"), "m2");
    await send(h, refund("pay_b", true), "m3");
    expect(await credits()).toBe(2);
    await send(h, refund("pay_a", false), "m4");
    expect(await credits()).toBe(1);
    expect(logs.some((l) => l.kind === "report_removed")).toBe(true);
  });
  test("a refund of a subscription payment changes no plan, and is logged for the operator", async () => {
    const h = hook();
    await send(h, subEvent("subscription.active", "active"), "m1");
    const r = await send(h, refund("pay_sub_1", false), "m2");
    expect(r.status).toBe(200);
    expect(await plan()).toBe("pro");
    expect(logs.at(-1)).toMatchObject({ kind: "refund_logged" });
  });
  test("dispute.lost on a report payment removes the unused credit; on a subscription payment it changes no plan; opened is only logged", async () => {
    const h = hook();
    await send(h, subEvent("subscription.active", "active"), "m1");
    await send(h, reportPaid("pay_d"), "m2");
    await send(h, dispute("dispute.opened", "pay_d"), "m3");
    expect(await credits()).toBe(1);
    expect(logs.at(-1)).toMatchObject({ kind: "dispute_logged" });
    await send(h, dispute("dispute.lost", "pay_d"), "m4");
    expect(await credits()).toBe(0);
    await send(h, dispute("dispute.lost", "pay_sub_9"), "m5");
    expect(await plan()).toBe("pro");
  });
  test("a report payment with no product_cart and no subscription is read back from Dodo (V4); unreadable means retry", async () => {
    const noCart = reportPaid("pay_x", { product_cart: undefined });
    let answer: string[] | null = ["pdt_report"];
    const h = hook(async () => answer);
    expect((await send(h, noCart, "m1")).status).toBe(200);
    expect(lookups).toEqual(["pay_x"]);
    expect(await credits()).toBe(1);
    answer = null;
    const r = await send(h, reportPaid("pay_y", { product_cart: undefined }), "m2");
    expect(r.status).toBe(503);
    expect(await credits()).toBe(1);
  });
  test("a report payment whose product is not in the table is 503 and retried, never a silent 200; once the table is fixed the credit lands", async () => {
    // The report product missing from DODO_PRODUCTS, or no readable table at all (worker.ts catalog() null: no ids at all).
    let given = 0;
    for (const [name, over] of [["missing", { reportIds: () => [] }], ["no table", { reportIds: () => [], products: () => ({}) }]] as const) {
      const id = `pay_lost_${name.replace(" ", "_")}`;
      const r = await send(hook(undefined, over), reportPaid(id), `m_${id}`);
      expect(r.status).toBe(503);
      expect(((await r.json()) as { outcome: string }).outcome).toBe("unknown_product");
      expect(logs.at(-1)).toMatchObject({ kind: "unknown_product", productId: "pdt_report" });
      expect(await credits()).toBe(given);
      // Dodo's retry, same webhook id, after the table is fixed: the id was given back, so it is handled again.
      expect((await send(hook(), reportPaid(id), `m_${id}`)).status).toBe(200);
      expect(await credits()).toBe(++given);
    }
    expect(await credits()).toBe(2);
  });
  test("a payment read back from Dodo with products we do not know is 503 too; a subscription or Pro product payment is still only acknowledged", async () => {
    const h = hook(async () => ["pdt_unknown"]);
    const r = await send(h, reportPaid("pay_u", { product_cart: undefined }), "m1");
    expect(r.status).toBe(503);
    expect(logs.at(-1)).toMatchObject({ kind: "unknown_product", productId: "pdt_unknown" });
    const subPay = payEvent("payment.succeeded", { payload_type: "Payment", payment_id: "pay_s", subscription_id: "sub_1", product_cart: [{ product_id: "pdt_unknown" }], customer: { customer_id: "cus_1" }, metadata: { companion_user_id: OWNER_ID } });
    expect((await send(hook(), subPay, "m2")).status).toBe(200);
    const proPay = reportPaid("pay_pro", { product_cart: [{ product_id: "pdt_month", quantity: 1 }] });
    expect((await send(hook(), proPay, "m3")).status).toBe(200);
    expect(await credits()).toBe(0);
  });
  test("a full refund or a lost dispute that arrives before its payment leaves the credit removed when the payment comes", async () => {
    const h = hook();
    expect((await send(h, refund("pay_early", false), "m1")).status).toBe(200);
    expect((await send(h, dispute("dispute.lost", "pay_early_2"), "m2")).status).toBe(200);
    expect((await send(h, refund("pay_partial", true), "m3")).status).toBe(200);   // a partial refund takes nothing back
    for (const [id, msg] of [["pay_early", "m4"], ["pay_early_2", "m5"], ["pay_partial", "m6"]]) expect((await send(h, reportPaid(id), msg)).status).toBe(200);
    expect(await credits()).toBe(1);
    const b = await store.billingOf(OWNER_ID);
    expect(Object.fromEntries(b.reports.map(([id, r]) => [id, r.state]))).toEqual({ pay_early: "removed", pay_early_2: "removed", pay_partial: "unused" });
    expect(logs.some((l) => l.kind === "report_known" && l.paymentId === "pay_early")).toBe(true);
  });
  test("a customer already linked to another person is never saved on this one, from a payment or a subscription", async () => {
    await links.set("cus_1", "google:someone-else");
    const h = hook();
    expect((await send(h, subEvent("subscription.active", "active"), "m1")).status).toBe(200);
    expect(await plan()).toBe("pro");   // the metadata names this person, so the plan is theirs
    expect(logs.some((l) => l.kind === "link_conflict")).toBe(true);
    expect((await send(h, reportPaid("pay_c"), "m2")).status).toBe(200);
    const b = await store.billingOf(OWNER_ID);
    expect(b.customerId).toBeNull();
    expect(b.subs[0][1].customerId).toBeUndefined();
    expect(await links.get("cus_1")).toBe("google:someone-else");
  });
  test("the customer id is kept with the Dodo mode it came from (live only when live mode's webhook secret verified it)", async () => {
    await send(hook(undefined, { secret: () => "", liveSecret: () => SECRET }), subEvent("subscription.active", "active"), "m1");
    let b = await store.billingOf(OWNER_ID);
    expect([b.customerId, b.customerMode, b.subs[0][1].customerMode]).toEqual(["cus_1", "live", "live"]);
    await send(hook(), reportPaid("pay_t", { customer: { customer_id: "cus_1" } }), "m2");   // test mode's secret: test
    b = await store.billingOf(OWNER_ID);
    expect([b.customerId, b.customerMode]).toEqual(["cus_1", "test"]);
  });
  test("an unsigned mock (dodo wh trigger) changes nothing", async () => {
    const h = hook();
    const body = JSON.stringify(reportPaid("pay_mock"));
    const r = await h(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: { "content-type": "application/json" }, body }));
    expect(r.status).toBe(401);
    const sub = JSON.stringify(subEvent("subscription.active", "active"));
    expect((await h(new Request("https://api.example/webhooks/dodo", { method: "POST", body: sub }))).status).toBe(401);
    expect(await credits()).toBe(0);
    expect(await store.planOfOwner!(OWNER_ID)).toBeNull();
  });
  test("no email, name or secret in any log line or answer", async () => {
    const h = hook(), seen: string[] = [];
    for (const [ev, id] of [[subEvent("subscription.active", "active"), "a"], [reportPaid("pay_q"), "b"], [refund("pay_q", false), "c"], [dispute("dispute.lost", "pay_z"), "d"]] as const) {
      seen.push(await (await send(h, ev, id)).text());
    }
    const all = JSON.stringify(logs) + consoleText.join("\n") + seen.join("\n");
    for (const s of [EMAIL, "Pat Example", SECRET, SECRET.slice(6)]) expect(all).not.toContain(s);
  });
});

// ---- checkout and portal ------------------------------------------------------------------------------------------------------
type DodoCall = { url: string; method: string; auth: string | null; body: any };
for (const kind of TEST_STORES) describe(`${kind.name}: POST /v1/checkout and POST /v1/portal`, () => {
  function rig(o: { payments?: boolean; provider?: string; base?: string; key?: string; dodo?: (c: DodoCall) => Response; catalog?: DodoCatalog } = {}) {
    const store = kind.make(), calls: DodoCall[] = [], events: SafeEvent[] = [];
    const fetchStub = (async (input: string | URL, init?: RequestInit) => {
      const c: DodoCall = { url: String(input), method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : null };
      calls.push(c);
      return o.dodo ? o.dodo(c) : c.url.includes("/customer-portal/session")
        ? Response.json({ link: "https://test.customer.dodopayments.com/session/abc" })
        : Response.json({ session_id: "cks_1", checkout_url: "https://test.checkout.dodopayments.com/session/cks_1" });
    }) as unknown as typeof fetch;
    const routes = createBillingRoutes({
      store, now: () => NOW, log: (e) => events.push(e),
      paymentsOn: () => o.payments ?? true, provider: () => o.provider ?? "dodo",
      catalog: () => o.catalog ?? CATALOG, dodoBase: () => ("base" in o ? o.base : DODO_TEST_BASE), dodoKey: () => ("key" in o ? o.key : TEST_KEY), fetch: fetchStub, ownerSecret: () => OWNER_SECRET,
    });
    const send = async (path: string, init: RequestInit = {}) => (await routes(new Request(`https://api.example${path}`, init), new URL(`https://api.example${path}`))) ?? new Response("not served", { status: 404 });
    const signedIn = async (owner = OWNER_ID, email = EMAIL) => {
      const r = await issueSignInToken(store, owner, "free", { email, nonceId: `n_${Math.random()}`, nonceUntil: NOW + 600_000, now: NOW });
      if (!r.ok) throw new Error("setup");
      return r.token;
    };
    const checkout = (token: string, body: unknown) => send(CHECKOUT_PATH, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    const portal = (token: string) => send(PORTAL_PATH, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    return { store, calls, events, send, signedIn, checkout, portal };
  }
  const msg = async (r: Response) => ((await r.clone().json()) as { error: { message: string } }).error.message;

  test("the body sent to Dodo has the right product for each item, the owner from the token, the email, and the locked email flag", async () => {
    const r = rig();
    const t = await r.signedIn();
    for (const [item, product] of [["pro_monthly", "pdt_month"], ["pro_yearly", "pdt_year"], ["report", "pdt_report"]]) {
      const res = await r.checkout(t, { item });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ url: "https://test.checkout.dodopayments.com/session/cks_1" });
      const c = r.calls.at(-1)!;
      expect(c.url).toBe(`${DODO_TEST_BASE}/checkouts`);
      expect(c.method).toBe("POST");
      expect(c.auth).toBe(`Bearer ${TEST_KEY}`);
      expect(c.body).toEqual({
        product_cart: [{ product_id: product, quantity: 1 }],
        customer: { email: EMAIL },
        metadata: { companion_user_id: OWNER_ID, [OWNER_SIG_KEY]: await signOwner(OWNER_ID, OWNER_SECRET) },
        return_url: "https://api.example/paid",
        cancel_url: "https://api.example/paid/cancelled",
        feature_flags: { allow_customer_editing_email: false },
      });
    }
  });
  test("a product id or a user id in the request is ignored", async () => {
    const r = rig();
    const t = await r.signedIn();
    const res = await r.checkout(t, { item: "pro_monthly", product_id: "pdt_evil", companion_user_id: "google:someone-else", metadata: { companion_user_id: "x" }, customer: { email: "evil@example.com" } });
    expect(res.status).toBe(200);
    const c = r.calls.at(-1)!;
    expect(c.body.product_cart).toEqual([{ product_id: "pdt_month", quantity: 1 }]);
    expect(c.body.metadata).toEqual({ companion_user_id: OWNER_ID, [OWNER_SIG_KEY]: await signOwner(OWNER_ID, OWNER_SECRET) });
    expect(c.body.customer).toEqual({ email: EMAIL });
  });
  test("the stored Dodo customer id is used when there is one", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.applySubscription(OWNER_ID, "sub_old", { plan: "free", status: "active", customerId: "cus_42" }, NOW - DAY);
    await r.checkout(t, { item: "pro_yearly" });
    expect(r.calls.at(-1)!.body.customer).toEqual({ customer_id: "cus_42" });
  });
  test("a second Pro is refused while a subscription is active, past due, on hold or cancelling", async () => {
    for (const sub of [
      { plan: "pro", status: "active" }, { plan: "pro", status: "past_due", until: NOW + DAY },
      { plan: "free", status: "on_hold" }, { plan: "pro", status: "cancelling", until: NOW + DAY },
    ] as const) {
      const r = rig();
      const t = await r.signedIn();
      await r.store.applySubscription(OWNER_ID, "sub_1", sub, NOW - 1000);
      for (const item of ["pro_monthly", "pro_yearly"]) {
        const res = await r.checkout(t, { item });
        expect(res.status).toBe(409);
        expect(await msg(res)).toBe("You already have Pro. Use Manage billing to change it.");
      }
      expect(r.calls).toEqual([]);
    }
  });
  test("an ended subscription, or a cancel whose date has passed, does not block a new Pro", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.applySubscription(OWNER_ID, "sub_1", { plan: "free", status: "active" }, NOW - 1000);
    await r.store.applySubscription(OWNER_ID, "sub_2", { plan: "pro", status: "cancelling", until: NOW - 1 }, NOW - 1000);
    expect((await r.checkout(t, { item: "pro_monthly" })).status).toBe(200);
  });
  test("the report is refused while Pro includes it", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.applySubscription(OWNER_ID, "sub_1", { plan: "pro", status: "active" }, NOW - 1000);
    const res = await r.checkout(t, { item: "report" });
    expect(res.status).toBe(409);
    expect(await msg(res)).toMatch(/Pro already includes the report/);
    expect(r.calls).toEqual([]);
  });
  test("everything is refused while PAYMENTS_ON is off, or while Dodo's webhook is not served", async () => {
    for (const o of [{ payments: false }, { provider: "none" }]) {
      const r = rig(o);
      const t = await r.signedIn();
      const a = await r.checkout(t, { item: "pro_monthly" });
      expect(a.status).toBe(503);
      expect(await msg(a)).toMatch(/Paying is not switched on/);
      expect((await r.portal(t)).status).toBe(503);
      expect(r.calls).toEqual([]);
    }
  });
  test("a test key with the live address, or a live key with the test address, is refused before Dodo is called", async () => {
    for (const o of [{ base: DODO_LIVE_BASE, key: TEST_KEY }, { base: DODO_TEST_BASE, key: LIVE_KEY }, { base: "https://evil.example", key: TEST_KEY }, { key: "" }]) {
      const r = rig(o);
      const t = await r.signedIn();
      const res = await r.checkout(t, { item: "pro_monthly" });
      expect(res.status).toBe(503);
      expect(await msg(res)).toMatch(/not set up/);
      for (const k of [TEST_KEY, LIVE_KEY]) expect(JSON.stringify(r.events)).not.toContain(k);
      expect(r.calls).toEqual([]);
    }
    const live = rig({ base: DODO_LIVE_BASE, key: LIVE_KEY });
    expect((await live.checkout(await live.signedIn(), { item: "pro_monthly" })).status).toBe(200);
    expect(live.calls[0].url).toBe(`${DODO_LIVE_BASE}/checkouts`);
  });
  test("no sign in token, an unknown one, a bad body or an unknown item is refused, and Dodo is never called", async () => {
    const r = rig();
    const t = await r.signedIn();
    expect((await r.send(CHECKOUT_PATH, { method: "POST", body: '{"item":"pro_monthly"}' })).status).toBe(401);
    expect((await r.checkout("cmp_unknownunknownunknownunknown00", { item: "pro_monthly" })).status).toBe(401);
    expect((await r.checkout(t, { item: "pro_weekly" })).status).toBe(400);
    expect((await r.send(CHECKOUT_PATH, { method: "POST", headers: { authorization: `Bearer ${t}` }, body: "not json" })).status).toBe(400);
    await r.store.suspendOwner(OWNER_ID, { at: NOW });
    expect((await r.checkout(t, { item: "pro_monthly" })).status).toBe(403);
    expect(r.calls).toEqual([]);
  });
  test("Dodo failing, or answering an address that is not https, is a plain 502 with nothing charged", async () => {
    for (const dodo of [() => new Response("boom " + TEST_KEY, { status: 500 }), () => Response.json({ session_id: "x", checkout_url: "http://evil.example" }), () => Response.json({}),
      () => { throw new Error("network down " + TEST_KEY); }]) {
      const r = rig({ dodo });
      const res = await r.checkout(await r.signedIn(), { item: "pro_monthly" });
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(text).toContain("Nothing was charged");
      expect(text).not.toContain(TEST_KEY);
      expect(JSON.stringify(r.events)).not.toContain(TEST_KEY);
    }
  });
  test("no Dodo key, no email and no token in any reply or log line, and checkout writes nothing", async () => {
    const r = rig();
    const t = await r.signedIn();
    const before = JSON.stringify(r.store.dump()), w = writesOf(r.store);
    const replies = [await (await r.checkout(t, { item: "pro_monthly" })).text(), await (await r.portal(t)).text()];
    expect(JSON.stringify(r.store.dump())).toBe(before);
    expect(writesOf(r.store)).toBe(w);
    const all = replies.join("\n") + JSON.stringify(r.events);
    for (const s of [TEST_KEY, EMAIL, t]) expect(all).not.toContain(s);
    expect(r.events.map((e) => e.kind)).toContain("checkout");
  });
  test("portal uses the customer id the server saved, never one from the app", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.applySubscription(OWNER_ID, "sub_1", { plan: "pro", status: "active", customerId: "cus_saved" }, NOW - 1000);
    const res = await r.send(PORTAL_PATH, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ customer_id: "cus_someone_else" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://test.customer.dodopayments.com/session/abc" });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].url).toBe(`${DODO_TEST_BASE}/customers/cus_saved/customer-portal/session`);
    expect(r.calls[0].method).toBe("POST");
    expect(r.calls[0].auth).toBe(`Bearer ${TEST_KEY}`);
  });
  test("a customer id from test mode is never sent to the live address: checkout uses the email, portal says there is no billing yet", async () => {
    const r = rig({ base: DODO_LIVE_BASE, key: LIVE_KEY });
    const t = await r.signedIn();
    await r.store.applySubscription(OWNER_ID, "sub_old", { plan: "free", status: "active", customerId: "cus_test", customerMode: "test" }, NOW - DAY);
    expect((await r.checkout(t, { item: "pro_monthly" })).status).toBe(200);
    expect(r.calls.at(-1)!.body.customer).toEqual({ email: EMAIL });
    expect(r.calls.at(-1)!.url).toBe(`${DODO_LIVE_BASE}/checkouts`);
    const p = await r.portal(t);
    expect(p.status).toBe(404);
    expect(r.calls).toHaveLength(1);
    // A live one is used on the live address.
    await r.store.saveCustomer(OWNER_ID, "cus_live", "live");
    expect((await r.portal(t)).status).toBe(200);
    expect(r.calls.at(-1)!.url).toBe(`${DODO_LIVE_BASE}/customers/cus_live/customer-portal/session`);
  });
  test("portal opens the customer of a live subscription, even when a newer customer id was saved after it", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.applySubscription(OWNER_ID, "sub_a", { plan: "pro", status: "active", customerId: "cus_a", customerMode: "test" }, NOW - 1000);
    await r.store.saveCustomer(OWNER_ID, "cus_b", "test");
    expect((await r.portal(t)).status).toBe(200);
    expect(r.calls.at(-1)!.url).toBe(`${DODO_TEST_BASE}/customers/cus_a/customer-portal/session`);
  });
  test("portal with no customer id saved is 404 with a plain sentence, and Dodo is not called", async () => {
    const r = rig();
    const res = await r.portal(await r.signedIn());
    expect(res.status).toBe(404);
    expect(await msg(res)).toMatch(/no billing account yet/i);
    expect(r.calls).toEqual([]);
  });
  test("checkout presses are limited per account, so a stuck button cannot flood Dodo", async () => {
    const r = rig();
    const t = await r.signedIn();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await r.checkout(t, { item: "pro_monthly" })).status);
    expect(statuses.filter((s) => s === 200).length).toBe(10);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("dodoSetup: the Dodo address and key must agree", () => {
  test("test with test, live with live; nothing else", () => {
    expect(dodoSetup(undefined, TEST_KEY)).toMatchObject({ ok: true, base: DODO_TEST_BASE });
    expect(dodoSetup(DODO_TEST_BASE, TEST_KEY).ok).toBe(true);
    expect(dodoSetup(DODO_LIVE_BASE, LIVE_KEY).ok).toBe(true);
    expect(dodoSetup(DODO_LIVE_BASE, TEST_KEY).ok).toBe(false);
    expect(dodoSetup(DODO_TEST_BASE, LIVE_KEY).ok).toBe(false);
    expect(dodoSetup("https://test.dodopayments.com.evil.example", TEST_KEY).ok).toBe(false);
    expect(dodoSetup(DODO_TEST_BASE, "").ok).toBe(false);
  });
});

// ---- the return page and the Worker -------------------------------------------------------------------------------------------
describe("GET /paid, through the Worker", () => {
  let logs: string[] = [];
  const realLog = console.log, realErr = console.error;
  beforeEach(() => { logs = []; console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); }; console.error = console.log; });
  afterEach(() => { console.log = realLog; console.error = realErr; });
  const env = (over: Partial<Env> = {}): Env => ({ STORE: new FakeNamespace(), PAYMENT_PROVIDER: "dodo", PAYMENTS_ON: "on", DODO_WEBHOOK_SECRET: SECRET, DODO_PRODUCTS: TABLE, DODO_PAYMENTS_API_KEY: TEST_KEY, METADATA_USER_ID_SECRET: "paid-test-user-id-secret-0123456789abcdef", ...over });
  const get = (e: Env, path: string) => workerHandle(new Request(`https://api.example${path}`), e, { waitUntil: () => {} }, () => NOW);

  test("answers 303 to /paid/done with no query, no-store and no-referrer, and grants nothing", async () => {
    const e = env();
    const q = `?payment_id=pay_1&subscription_id=sub_1&status=succeeded&email=${encodeURIComponent(EMAIL)}&license_key=LK-123`;
    const r = await get(e, `${PAID_PATH}${q}`);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(PAID_DONE_PATH);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    const done = await get(e, PAID_DONE_PATH);
    expect(done.status).toBe(200);
    expect(done.headers.get("content-type")).toMatch(/text\/html/);
    expect(done.headers.get("cache-control")).toBe("no-store");
    expect(done.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await done.text()).toMatch(/Go back to Squibby/);
    expect((e.STORE as FakeNamespace).objects.size).toBe(0);   // the store was never touched
    for (const s of [EMAIL, "pay_1", "LK-123", "sub_1"]) expect(logs.join("\n")).not.toContain(s);
  });
  test("/paid/done and /paid/cancelled with a query redirect to themselves without it; cancelled says nothing was charged", async () => {
    const e = env();
    for (const p of [PAID_DONE_PATH, "/paid/cancelled"]) {
      const r = await get(e, `${p}?email=${encodeURIComponent(EMAIL)}`);
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toBe(p);
    }
    expect(await (await get(e, "/paid/cancelled")).text()).toMatch(/Nothing was charged/);
  });
  test("the page is served even while payments are off (an old checkout can still land), and still grants nothing", async () => {
    const r = await get(env({ PAYMENTS_ON: undefined, PAYMENT_PROVIDER: "none" }), `${PAID_PATH}?payment_id=pay_1`);
    expect(r.status).toBe(303);
  });
  test("checkout through the Worker uses the Worker's settings, and a store failure gets the account sentence", async () => {
    const ns = new FakeNamespace();
    const store = new DurableStore(ns, () => NOW);
    const t = await issueSignInToken(store, OWNER_ID, "free", { email: EMAIL, nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW });
    if (!t.ok) throw new Error("setup");
    const realFetch = globalThis.fetch, seen: string[] = [];
    globalThis.fetch = (async (u: string) => { seen.push(String(u)); return Response.json({ session_id: "s", checkout_url: "https://test.checkout.dodopayments.com/s" }); }) as unknown as typeof fetch;
    try {
      const r = await workerHandle(new Request(`https://api.example${CHECKOUT_PATH}`, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: '{"item":"report"}' }), env({ STORE: ns }), { waitUntil: () => {} }, () => NOW);
      expect(r.status).toBe(200);
      expect(seen).toEqual([`${DODO_TEST_BASE}/checkouts`]);
      const broken = { idFromName: (n: string) => ns.idFromName(n), get: () => ({ fetch: async () => new Response("x", { status: 500 }) }) };
      const b = await workerHandle(new Request(`https://api.example${CHECKOUT_PATH}`, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: '{"item":"report"}' }), env({ STORE: broken }), { waitUntil: () => {} }, () => NOW);
      expect(b.status).toBe(503);
      expect(await b.text()).toMatch(/account could not be reached/);
    } finally { globalThis.fetch = realFetch; }
  });
  test("a signed Dodo webhook through the Worker saves the customer and grants Pro on the owner's object", async () => {
    const ns = new FakeNamespace(), e = env({ STORE: ns });
    const body = JSON.stringify(await withOwnerSig(subEvent("subscription.active", "active"), e.METADATA_USER_ID_SECRET));
    const r = await workerHandle(new Request("https://api.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest("msg_w", body, SECRET, NOWS), body }), e, { waitUntil: () => {} }, () => NOW);
    expect(r.status).toBe(200);
    const s = new DurableStore(ns, () => NOW);
    expect(await s.planOfOwner(OWNER_ID)).toBe("pro");
    expect((await s.billingOf(OWNER_ID)).customerId).toBe("cus_1");
    expect(ns.storageOf(OWNER(OWNER_ID))?.data.has("billing")).toBe(true);
  });
});

describe("wrangler.toml and the deploy script", () => {
  const toml = readFileSync(join(ROOT, "wrangler.toml"), "utf8");
  const settings = toml.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  test("invocation logs are off (they would keep /paid's query, the email), and the Dodo address is the test one", () => {
    expect(settings).toMatch(/\[observability\.logs\]\s*\n(?:[^\[]*\n)?invocation_logs = false/);
    expect(settings).toMatch(/^DODO_API_BASE = "https:\/\/test\.dodopayments\.com"$/m);
  });
  test("the deploy script names both Dodo addresses and asks for --live-payments before the live one", () => {
    const text = readFileSync(join(ROOT, "scripts", "deploy.sh"), "utf8");
    expect(text).toContain(DODO_TEST_BASE);
    expect(text).toContain(DODO_LIVE_BASE);
    expect(text).toContain("--live-payments");
  });
});
