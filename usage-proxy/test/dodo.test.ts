import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DODO_SUBSCRIPTION_EVENTS, DODO_TIMESTAMP_TOLERANCE_SEC, MemoryDodoLedger, MemoryLinkBook, constantTimeEqual, createDodoWebhook, decideDodoEvent,
  entitledPlan, parseDodoProducts, signDodoForTest, verifyDodoWebhook, type DodoEntitlement, type SafeDodoEvent,
} from "../src/dodo.ts";

// Dodo's secret looks like "whsec_" + base64 (Standard Webhooks). These are made up for the tests.
const b64 = (s: string) => btoa(s);
const SECRET = `whsec_${b64("dodo-test-secret-key-0123456789")}`;
const OTHER = `whsec_${b64("another-secret-key-9876543210ab")}`;
const NOW = 1_800_000_000;
const PRODUCTS = { pdt_pro: "pro", pdt_max: "max" };
const MARK_EMAIL = "person.private@example.com", MARK_NAME = "Private Personname";

const iso = (sec: number) => new Date(sec * 1000).toISOString();
type Over = Record<string, unknown>;
const event = (type: string, status: string | undefined, over: Over = {}, at = NOW - 10) => ({
  business_id: "bus_1", type, timestamp: iso(at),
  data: {
    payload_type: "Subscription", subscription_id: "sub_1", product_id: "pdt_pro", ...(status ? { status } : {}),
    customer: { customer_id: "cus_1", email: MARK_EMAIL, name: MARK_NAME }, metadata: { companion_user_id: "u9" },
    next_billing_date: iso(NOW + 86400 * 30), ...over,
  },
});
const headersFor = (id: string, body: string, secret = SECRET, t = NOW) => signDodoForTest(id, body, secret, t);

describe("Dodo signature (Standard Webhooks)", () => {
  const body = '{"type":"subscription.active"}';
  test("a correctly signed body passes and reports its id and time", async () => {
    const r = await verifyDodoWebhook(body, await headersFor("msg_1", body), SECRET, NOW);
    expect(r).toEqual({ ok: true, id: "msg_1", timestampSec: NOW });
  });
  test("a wrong secret, a wrong id and a tampered body fail", async () => {
    const h = await headersFor("msg_1", body);
    expect(await verifyDodoWebhook(body, h, OTHER, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(await verifyDodoWebhook(body, { ...h, "webhook-id": "msg_2" }, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(await verifyDodoWebhook(body + " ", h, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(await verifyDodoWebhook(body, { ...h, "webhook-timestamp": String(NOW + 1) }, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });
  test("missing headers fail, whatever else is right", async () => {
    const h = await headersFor("msg_1", body);
    for (const k of ["webhook-id", "webhook-timestamp", "webhook-signature"]) {
      const { [k]: _gone, ...rest } = h;
      expect((await verifyDodoWebhook(body, rest, SECRET, NOW)).ok).toBe(false);
    }
    expect(await verifyDodoWebhook(body, {}, SECRET, NOW)).toEqual({ ok: false, reason: "missing_headers" });
  });
  test("header names are matched without caring about case, and a real Headers object works", async () => {
    const h = await headersFor("msg_1", body);
    const upper = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toUpperCase(), v]));
    expect((await verifyDodoWebhook(body, upper, SECRET, NOW)).ok).toBe(true);
    expect((await verifyDodoWebhook(body, new Headers(h), SECRET, NOW)).ok).toBe(true);
  });
  test("the time window is a named constant: too old and too far ahead are refused, inside is fine", async () => {
    expect(DODO_TIMESTAMP_TOLERANCE_SEC).toBe(300);   // Standard Webhooks libraries, as Dodo's page names them
    const at = async (t: number) => verifyDodoWebhook(body, await signDodoForTest("msg_1", body, SECRET, t), SECRET, NOW);
    expect((await at(NOW - DODO_TIMESTAMP_TOLERANCE_SEC - 1)).ok).toBe(false);
    expect((await at(NOW + DODO_TIMESTAMP_TOLERANCE_SEC + 1)).ok).toBe(false);
    expect(await at(NOW - DODO_TIMESTAMP_TOLERANCE_SEC - 1)).toEqual({ ok: false, reason: "outside_window" });
    expect((await at(NOW - 200)).ok).toBe(true);
    expect((await at(NOW + 200)).ok).toBe(true);
  });
  test("a timestamp that is not a plain whole number is refused", async () => {
    const h = await headersFor("msg_1", body);
    for (const t of ["abc", "", "1.5e9", "-5", `${NOW} `, "0x10"]) expect((await verifyDodoWebhook(body, { ...h, "webhook-timestamp": t }, SECRET, NOW)).ok).toBe(false);
  });
  test("a malformed, empty or wrong version signature list fails", async () => {
    const h = await headersFor("msg_1", body);
    const sig = h["webhook-signature"].split(",")[1];
    for (const s of ["", "   ", "garbage", "v1", "v1,", ",abc", `v2,${sig}`, `v1a,${sig}`, `${sig}`, "v1,!!!not-base64!!!"]) {
      expect((await verifyDodoWebhook(body, { ...h, "webhook-signature": s }, SECRET, NOW)).ok).toBe(false);
    }
    expect(await verifyDodoWebhook(body, { ...h, "webhook-signature": "" }, SECRET, NOW)).toEqual({ ok: false, reason: "missing_headers" });
    expect(await verifyDodoWebhook(body, { ...h, "webhook-signature": "garbage" }, SECRET, NOW)).toEqual({ ok: false, reason: "no_signature" });
  });
  test("one good signature among several (space separated) is enough, in any position", async () => {
    const h = await headersFor("msg_1", body);
    const good = h["webhook-signature"];
    const bad = `v1,${btoa("x".repeat(32))}`;
    for (const s of [`${bad} ${good}`, `${good} ${bad}`, `${bad} v2,abc ${good} ${bad}`, `  ${bad}   ${good}  `]) {
      expect((await verifyDodoWebhook(body, { ...h, "webhook-signature": s }, SECRET, NOW)).ok).toBe(true);
    }
    expect((await verifyDodoWebhook(body, { ...h, "webhook-signature": `${bad} ${bad}` }, SECRET, NOW)).ok).toBe(false);
  });
  test("a secret that is empty or not base64 refuses everything and never throws", async () => {
    const h = await headersFor("msg_1", body);
    for (const s of ["", "whsec_", "whsec_%%%not base64%%%"]) expect(await verifyDodoWebhook(body, h, s, NOW)).toEqual({ ok: false, reason: "bad_secret" });
  });
  test("the same secret without the whsec_ prefix works (the prefix is only removed when present)", async () => {
    const h = await headersFor("msg_1", body);
    expect((await verifyDodoWebhook(body, h, SECRET.slice(6), NOW)).ok).toBe(true);
  });
  test("signatures are compared in constant time", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "xbc")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    const src = readFileSync(new URL("../src/dodo.ts", import.meta.url), "utf8");
    expect(src).toContain("constantTimeEqual(");
    // no direct equality on a signature anywhere in the verifier
    expect(src).not.toMatch(/(sig|signature|want|expected)\w*\s*===?\s*(sig|signature|want|expected)/i);
  });
});

describe("the product table is configuration", () => {
  test("a table of product id to plan name is read from JSON", () => {
    expect(parseDodoProducts('{"pdt_a":"pro","pdt_b":"max"}')).toEqual({ ok: true, products: { pdt_a: "pro", pdt_b: "max" } });
  });
  test("a plan we do not have, a non text value, or bad JSON is refused in plain words", () => {
    for (const bad of ['{"pdt_a":"enterprise"}', '{"pdt_a":5}', "not json", "[]", "null", '{"":"pro"}', '{"__proto__":"pro"}']) {
      const r = parseDodoProducts(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
    }
  });
  test("the example file in the repo reads cleanly and holds only placeholders", () => {
    const text = readFileSync(new URL("../dodo-products.example.json", import.meta.url), "utf8");
    const r = parseDodoProducts(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.products).every((k) => k.startsWith("REPLACE_WITH"))).toBe(true);
  });
  test("no product ids are written in the source code", () => {
    const src = readFileSync(new URL("../src/dodo.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/pdt_[A-Za-z0-9]/);
  });
});

describe("what each Dodo subscription event means for a plan", () => {
  const links = () => new MemoryLinkBook();
  const decide = (e: unknown, books = links()) => decideDodoEvent(e, PRODUCTS, books);
  const free: DodoEntitlement = { userId: "u9", plan: "free", status: "active" };
  const pro: DodoEntitlement = { userId: "u9", plan: "pro", status: "active" };

  test("the documented subscription event names are all known (taken from Dodo's docs, not invented)", () => {
    expect([...DODO_SUBSCRIPTION_EVENTS].sort()).toEqual([
      "subscription.active", "subscription.cancelled", "subscription.expired", "subscription.failed", "subscription.on_hold",
      "subscription.past_due", "subscription.paused", "subscription.plan_changed", "subscription.renewed", "subscription.unpaused",
      "subscription.update_payment_method", "subscription.updated",
    ]);
  });
  test("active, renewed, unpaused, updated and plan_changed on an active subscription give the mapped plan", async () => {
    for (const type of ["subscription.active", "subscription.renewed", "subscription.unpaused", "subscription.updated", "subscription.plan_changed"]) {
      expect(await decide(event(type, "active"))).toMatchObject({ kind: "set", entitlement: pro });
    }
    expect(await decide(event("subscription.plan_changed", "active", { product_id: "pdt_max" }))).toMatchObject({ kind: "set", entitlement: { plan: "max" } });
  });
  test("an event that says active without a status, or with a status we do not know, grants nothing", async () => {
    expect((await decide(event("subscription.active", undefined)).then((d) => d.kind))).toBe("ignore");
    expect((await decide(event("subscription.active", "weird")).then((d) => d.kind))).toBe("ignore");
    expect((await decide(event("subscription.active", "pending")).then((d) => d.kind))).toBe("ignore");
  });
  test("on_hold, paused, failed, expired and cancelled drop to the free plan at once", async () => {
    for (const [type, status] of [["on_hold", "on_hold"], ["paused", "paused"], ["failed", "failed"], ["expired", "expired"], ["cancelled", "cancelled"]]) {
      expect(await decide(event(`subscription.${type}`, status))).toMatchObject({ kind: "set", entitlement: free });
    }
  });
  test("an updated event whose status is a bad state drops to free, even if the type is only 'updated'", async () => {
    for (const status of ["on_hold", "paused", "cancelled", "failed", "expired"]) expect(await decide(event("subscription.updated", status))).toMatchObject({ kind: "set", entitlement: free });
  });
  test("failed never grants even if it carries an active looking status", async () => {
    expect(await decide(event("subscription.failed", "active"))).toMatchObject({ kind: "set", entitlement: free });
  });
  test("a cancel that is only scheduled (still active) keeps the plan until the cancelled event", async () => {
    expect(await decide(event("subscription.updated", "active", { cancel_at_next_billing_date: true }))).toMatchObject({ kind: "set", entitlement: pro });
  });
  test("past_due keeps the plan only until past_due_ends_at, and nothing without it", async () => {
    const until = NOW + 3 * 86400;
    expect(await decide(event("subscription.past_due", "past_due", { past_due_ends_at: iso(until) }))).toMatchObject({
      kind: "set", entitlement: { userId: "u9", plan: "pro", status: "past_due", until: until * 1000 },
    });
    expect(await decide(event("subscription.past_due", "past_due"))).toMatchObject({ kind: "set", entitlement: free });
    expect(await decide(event("subscription.past_due", "past_due", { past_due_ends_at: "soon" }))).toMatchObject({ kind: "set", entitlement: free });
    expect(await decide(event("subscription.past_due", "past_due", { past_due_ends_at: iso(NOW - 100) }))).toMatchObject({ kind: "set", entitlement: free });
  });
  test("a grace period that has ended counts as free when the plan is looked up", () => {
    const e: DodoEntitlement = { userId: "u9", plan: "pro", status: "past_due", until: 5000 };
    expect(entitledPlan(e, 4999)).toBe("pro");
    expect(entitledPlan(e, 5000)).toBe("free");
    expect(entitledPlan({ userId: "u9", plan: "max", status: "active" }, 9e15)).toBe("max");
  });
  test("update_payment_method and other events change nothing", async () => {
    expect((await decide(event("subscription.update_payment_method", "active"))).kind).toBe("ignore");
    expect((await decide({ ...event("payment.succeeded", "active") })).kind).toBe("ignore");
    expect((await decide({ ...event("dispute.opened", "active") })).kind).toBe("ignore");
  });
  test("an unknown product id grants nothing and says so in plain words", async () => {
    const d = await decide(event("subscription.active", "active", { product_id: "pdt_mystery" }));
    expect(d.kind).toBe("unknown_product");
    expect((d as any).entitlement).toBeUndefined();
    expect((d as any).message).toContain("pdt_mystery");
    expect((d as any).message).toMatch(/product table/i);
    for (const type of ["subscription.renewed", "subscription.unpaused", "subscription.updated"]) {
      expect((await decide(event(type, "active", { product_id: "pdt_mystery" }))).kind).toBe("unknown_product");
    }
    expect((await decide(event("subscription.active", "active", { product_id: undefined }))).kind).toBe("unknown_product");
    expect((await decide(event("subscription.active", "active", { product_id: 7 }))).kind).toBe("unknown_product");
  });
  test("a plan change to an unknown product drops to free (the old product is no longer theirs)", async () => {
    const d = await decide(event("subscription.plan_changed", "active", { product_id: "pdt_mystery" }));
    expect(d.kind).toBe("unknown_product");
    expect((d as any).entitlement).toEqual(free);
  });
  test("a product mapped to a plan name that is not in the plan table is never granted", async () => {
    const d = await decideDodoEvent(event("subscription.active", "active"), { pdt_pro: "enterprise" }, links());
    expect(d.kind).toBe("unknown_product");
    const proto = await decideDodoEvent(event("subscription.active", "active", { product_id: "toString" }), {}, links());
    expect(proto.kind).toBe("unknown_product");
  });
  test("the person comes from the checkout metadata, then from a link learned from a payment", async () => {
    const noMeta = event("subscription.active", "active", { metadata: {} });
    expect((await decide(noMeta)).kind).toBe("unlinked");
    const book = links(); await book.set("cus_1", "u_linked");
    expect(await decide(noMeta, book)).toMatchObject({ kind: "set", entitlement: { userId: "u_linked", plan: "pro" } });
    // metadata wins over a link
    expect(await decide(event("subscription.active", "active"), book)).toMatchObject({ entitlement: { userId: "u9" } });
    for (const bad of [{ companion_user_id: 5 }, { companion_user_id: "" }, null, "x", undefined]) {
      expect((await decide(event("subscription.active", "active", { metadata: bad }))).kind).toBe("unlinked");
    }
  });
  test("garbage in changes nothing", async () => {
    for (const e of [null, undefined, 5, "x", {}, { type: 5 }, { type: "subscription.active" }, { type: "subscription.active", data: 5 }]) expect((await decide(e)).kind).toBe("ignore");
  });
});

// ---- the whole webhook: verify, once only, in order, apply ------------------------------------------------------------------------
describe("the webhook handler", () => {
  let logs: SafeDodoEvent[], applied: DodoEntitlement[], ledger: MemoryDodoLedger, links: MemoryLinkBook, now: number;
  const real = { fetch: globalThis.fetch, log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  let consoleText: string[];
  beforeEach(() => {
    logs = []; applied = []; ledger = new MemoryDodoLedger(); links = new MemoryLinkBook(); now = NOW; consoleText = [];
    const grab = (...a: unknown[]) => { consoleText.push(a.map(String).join(" ")); };
    console.log = grab; console.warn = grab; console.error = grab; console.info = grab; console.debug = grab;
    (globalThis as any).fetch = () => { throw new Error("network used"); };
  });
  afterEach(() => { Object.assign(console, { log: real.log, warn: real.warn, error: real.error, info: real.info, debug: real.debug }); globalThis.fetch = real.fetch; });
  const hook = (over: Partial<Parameters<typeof createDodoWebhook>[0]> = {}) =>
    createDodoWebhook({ secret: () => SECRET, products: () => PRODUCTS, ledger, links, apply: async (e) => { applied.push(e); }, now: () => now * 1000, log: (e) => logs.push(e), ...over });
  const send = async (h: ReturnType<typeof hook>, ev: unknown, id = "msg_1", over: { body?: string; headers?: Record<string, string>; method?: string; secret?: string; t?: number } = {}) => {
    const body = over.body ?? JSON.stringify(ev);
    const headers = over.headers ?? (await headersFor(id, body, over.secret ?? SECRET, over.t ?? NOW));
    return h(new Request("https://squibby.test/webhooks/dodo", { method: over.method ?? "POST", headers, body: over.method === "GET" ? undefined : body }));
  };
  const outcome = async (r: Response) => (await r.json()).outcome as string;

  test("a good event is applied and answered with 200", async () => {
    const r = await send(hook(), event("subscription.active", "active"));
    expect(r.status).toBe(200);
    expect(await outcome(r)).toBe("applied");
    expect(applied).toEqual([{ userId: "u9", plan: "pro", status: "active" }]);
  });
  test("a bad signature, a stale time, a missing header or the wrong method applies nothing", async () => {
    const h = hook(), ev = event("subscription.active", "active");
    expect((await send(h, ev, "msg_1", { secret: OTHER })).status).toBe(401);
    expect((await send(h, ev, "msg_2", { t: NOW - 1000 })).status).toBe(401);
    expect((await send(h, ev, "msg_3", { headers: {} })).status).toBe(401);
    expect((await send(h, ev, "msg_4", { method: "GET" })).status).toBe(405);
    expect(applied).toEqual([]);
    expect(await ledger.claim("msg_1")).toBe(true);   // a refused event leaves no mark
  });
  test("the same event delivered twice is applied once", async () => {
    const h = hook(), ev = event("subscription.active", "active");
    expect(await outcome(await send(h, ev, "msg_1"))).toBe("applied");
    const again = await send(h, ev, "msg_1");
    expect(again.status).toBe(200);
    expect(await outcome(again)).toBe("duplicate");
    expect(applied.length).toBe(1);
  });
  test("two deliveries of the same event at the same moment still apply once", async () => {
    let release!: () => void; const gate = new Promise<void>((r) => (release = r));
    const h = hook({ apply: async (e) => { await gate; applied.push(e); } });
    const ev = event("subscription.active", "active");
    const both = Promise.all([send(h, ev, "msg_1"), send(h, ev, "msg_1")]);
    await Promise.resolve(); release();
    const rs = await both;
    expect(applied.length).toBe(1);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 200]);
  });
  test("a replay of a captured event inside the time window is caught by its id", async () => {
    const h = hook(), ev = event("subscription.renewed", "active");
    await send(h, ev, "msg_77");
    now = NOW + 120;
    const r = await send(h, ev, "msg_77", { t: NOW });
    expect(await outcome(r)).toBe("duplicate");
    expect(applied.length).toBe(1);
  });
  test("an older event never undoes a newer one (out of order)", async () => {
    const h = hook();
    await send(h, event("subscription.cancelled", "cancelled", {}, NOW - 5), "msg_new");
    const old = await send(h, event("subscription.active", "active", {}, NOW - 500), "msg_old");
    expect(await outcome(old)).toBe("stale");
    expect(applied.map((a) => a.plan)).toEqual(["free"]);
    // and the other way round: the newer one still applies after an older one
    await send(h, event("subscription.renewed", "active", {}, NOW - 1), "msg_newer");
    expect(applied.map((a) => a.plan)).toEqual(["free", "pro"]);
  });
  test("a stale event is remembered as handled, so its retry is a duplicate", async () => {
    const h = hook();
    await send(h, event("subscription.cancelled", "cancelled", {}, NOW - 5), "msg_new");
    await send(h, event("subscription.active", "active", {}, NOW - 500), "msg_old");
    expect(await outcome(await send(h, event("subscription.active", "active", {}, NOW - 500), "msg_old"))).toBe("duplicate");
  });
  test("each person has their own order: an older event for someone else still applies", async () => {
    const h = hook();
    await send(h, event("subscription.cancelled", "cancelled", {}, NOW - 5), "msg_a");
    await send(h, event("subscription.active", "active", { metadata: { companion_user_id: "u10" } }, NOW - 500), "msg_b");
    expect(applied.map((a) => a.userId)).toEqual(["u9", "u10"]);
  });
  test("an event with no readable time cannot be put in order, so it is refused", async () => {
    const ev: any = event("subscription.active", "active"); ev.timestamp = "yesterday";
    const r = await send(hook(), ev);
    expect(r.status).toBe(400);
    expect(applied).toEqual([]);
  });
  test("a cancelled subscription drops the person to free", async () => {
    const h = hook();
    await send(h, event("subscription.active", "active", {}, NOW - 100), "msg_1");
    await send(h, event("subscription.cancelled", "cancelled", {}, NOW - 50), "msg_2");
    expect(applied.map((a) => a.plan)).toEqual(["pro", "free"]);
  });
  test("an unknown product grants nothing, is reported, and asks Dodo to try again later", async () => {
    const h = hook();
    const r = await send(h, event("subscription.active", "active", { product_id: "pdt_mystery" }));
    expect(r.status).toBe(503);
    const j = await r.json();
    expect(j.outcome).toBe("unknown_product");
    expect(j.message).toContain("pdt_mystery");
    expect(applied).toEqual([]);
    expect(logs.at(-1)).toMatchObject({ kind: "unknown_product", productId: "pdt_mystery" });
    // after the operator adds the product, the same delivery is accepted
    const fixed = hook({ products: () => ({ ...PRODUCTS, pdt_mystery: "max" }) });
    expect(await outcome(await send(fixed, event("subscription.active", "active", { product_id: "pdt_mystery" }), "msg_1"))).toBe("applied");
    expect(applied.at(-1)?.plan).toBe("max");
  });
  test("an event for a person we cannot identify applies nothing and asks Dodo to try again", async () => {
    const r = await send(hook(), event("subscription.active", "active", { metadata: {} }));
    expect(r.status).toBe(503);
    expect((await r.json()).outcome).toBe("unlinked");
    expect(applied).toEqual([]);
  });
  test("a payment with the checkout metadata teaches the link, so a later subscription event without metadata finds the person", async () => {
    const h = hook();
    const pay = { business_id: "bus_1", type: "payment.succeeded", timestamp: iso(NOW - 20), data: { payload_type: "Payment", payment_id: "pay_1", customer: { customer_id: "cus_1", email: MARK_EMAIL }, metadata: { companion_user_id: "u_paid" } } };
    expect(await outcome(await send(h, pay, "msg_pay"))).toBe("ignored");
    expect(await links.get("cus_1")).toBe("u_paid");
    const r = await send(h, event("subscription.active", "active", { metadata: {} }), "msg_sub");
    expect(await outcome(r)).toBe("applied");
    expect(applied).toEqual([{ userId: "u_paid", plan: "pro", status: "active" }]);
  });
  test("a link already learned is not overwritten by a different person", async () => {
    await links.set("cus_1", "u_first");
    const pay = { business_id: "bus_1", type: "payment.succeeded", timestamp: iso(NOW - 20), data: { customer: { customer_id: "cus_1" }, metadata: { companion_user_id: "u_other" } } };
    await send(hook(), pay, "msg_pay");
    expect(await links.get("cus_1")).toBe("u_first");
    expect(logs.some((l) => l.kind === "link_conflict")).toBe(true);
  });
  test("events that are not about subscriptions are acknowledged and ignored", async () => {
    const r = await send(hook(), { business_id: "b", type: "refund.succeeded", timestamp: iso(NOW - 1), data: {} });
    expect(r.status).toBe(200);
    expect(await outcome(r)).toBe("ignored");
    expect(applied).toEqual([]);
  });
  test("if applying fails the answer is 500 (Dodo retries) and the event is not marked done", async () => {
    let fail = true;
    const h = hook({ apply: async (e) => { if (fail) throw new Error(`database says ${MARK_EMAIL}`); applied.push(e); } });
    const ev = event("subscription.active", "active");
    expect((await send(h, ev, "msg_1")).status).toBe(500);
    fail = false;
    expect(await outcome(await send(h, ev, "msg_1"))).toBe("applied");
  });
  test("a body that is not JSON, or not an object, is refused after the signature passes", async () => {
    const h = hook();
    expect((await send(h, null, "msg_1", { body: "not json {" })).status).toBe(400);
    expect((await send(h, null, "msg_2", { body: "[1,2]" })).status).toBe(400);
    expect((await send(h, null, "msg_3", { body: "" })).status).toBe(400);
  });
  test("a body that is too big is refused before it is read", async () => {
    const body = "x".repeat(1_100_000);
    expect((await send(hook(), null, "msg_1", { body })).status).toBe(413);
  });
  test("if the operator has no secret set, everything is refused", async () => {
    const r = await send(hook({ secret: () => "" }), event("subscription.active", "active"));
    expect(r.status).toBe(401);
    expect(applied).toEqual([]);
  });
  test("the body, the secret and the person's email and name are never in a log line, an answer, or the console", async () => {
    const h = hook();
    const collected: string[] = [];
    const run = async (ev: unknown, id: string, over: Parameters<typeof send>[3] = {}) => { const r = await send(h, ev, id, over); collected.push(await r.clone().text()); };
    await run(event("subscription.active", "active"), "msg_1");                                              // applied
    await run(event("subscription.active", "active"), "msg_1");                                              // duplicate
    await run(event("subscription.active", "active", {}, NOW - 9999), "msg_2");                              // stale? (newer applied first)
    await run(event("subscription.active", "active", { product_id: "pdt_mystery" }), "msg_3");               // unknown product
    await run(event("subscription.active", "active", { metadata: {} , customer: { customer_id: "cus_9", email: MARK_EMAIL, name: MARK_NAME } }), "msg_4"); // unlinked
    await run(event("subscription.active", "active"), "msg_5", { secret: OTHER });                           // bad signature
    await run(null, "msg_6", { body: `{"email":"${MARK_EMAIL}","name":"${MARK_NAME}"` });                    // not JSON, body full of private text
    const failing = hook({ apply: async () => { throw new Error(`${MARK_EMAIL} ${SECRET}`); } });
    collected.push(await (await send(failing, event("subscription.cancelled", "cancelled"), "msg_7")).text());
    const everything = JSON.stringify(logs) + consoleText.join("\n") + collected.join("\n");
    for (const secret of [MARK_EMAIL, MARK_NAME, SECRET, SECRET.slice(6), "dodo-test-secret", "payload_type", "next_billing_date"]) expect(everything).not.toContain(secret);
    expect(logs.length).toBeGreaterThan(5);
    for (const l of logs) expect(Object.keys(l).every((k) => ["kind", "reason", "eventType", "webhookId", "userId", "plan", "productId"].includes(k))).toBe(true);
  });
  test("the code and the tests never reach the network", () => {
    const src = readFileSync(new URL("../src/dodo.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(http|https|net|dgram|tls)|\bimport\(/);
  });
});
