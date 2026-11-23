// Security audit run 2, finding 1: a Dodo static /buy/ link lets anyone set metadata_companion_user_id to someone else's owner
// id. Before the fix the webhook trusted that metadata, so an outsider's Dodo customer was saved on the victim (their next
// checkout and billing portal then opened the outsider's customer). Now /v1/checkout signs the owner id (companion_sig, an HMAC
// keyed from METADATA_USER_ID_SECRET under its own label), and the webhook trusts metadata only with a signature that checks out.
// A customer id once saved for a Dodo mode is never replaced by another of the same mode. No network, no real key.
import { describe, expect, test } from "bun:test";
import { MemoryStore } from "../src/store.ts";
import { createDodoWebhook, decideDodoEvent, decidePaymentEvent, MemoryDodoLedger, MemoryLinkBook, signDodoForTest, type DodoWebhookDeps } from "../src/dodo.ts";
import { OWNER_SIG_KEY, signOwner, verifiedOwner } from "../src/owner-sig.ts";
import { createBillingRoutes, storeHooks } from "../src/billing-routes.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { TEST_STORES } from "./stores.ts";

const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const WH = "whsec_" + btoa("dummy-webhook-secret-for-tests-only");
const SECRET = "owner-sig-test-secret-0123456789abcdef-xyz";
const OTHER_SECRET = "a-different-secret-0123456789abcdef-xyz-0";
const VICTIM = "google:111", ATTACKER = "google:666", ATTACKER_CUS = "cus_attacker", VICTIM_CUS = "cus_victim";
const CATALOG = { plans: { pdt_month: "pro" }, items: { pro_monthly: "pdt_month", report: "pdt_report" }, reports: ["pdt_report"] } as const;
const iso = (ms: number) => new Date(ms).toISOString();

function rig(over: Partial<DodoWebhookDeps> = {}) {
  const store = new MemoryStore(), links = new MemoryLinkBook(), logs: unknown[] = [];
  const hook = createDodoWebhook({ secret: () => WH, products: () => ({ pdt_month: "pro" }), reportIds: () => ["pdt_report"],
    ledger: new MemoryDodoLedger(() => NOW), links, ...storeHooks(store, () => SECRET), ownerSecret: () => SECRET, now: () => NOW, log: (e) => logs.push(e), ...over });
  const send = async (id: string, ev: unknown) => { const b = JSON.stringify(ev); return hook(new Request("https://x/webhooks/dodo", { method: "POST", headers: await signDodoForTest(id, b, WH, Math.floor(NOW / 1000)), body: b })); };
  return { store, links, logs, send };
}
const reportPaid = (paymentId: string, customer: string, metadata: Record<string, unknown>, at = NOW - 1000) => ({ type: "payment.succeeded", timestamp: iso(at),
  data: { payment_id: paymentId, product_cart: [{ product_id: "pdt_report", quantity: 1 }], customer: { customer_id: customer, email: "someone@example.test" }, metadata } });
const subActive = (customer: string, metadata: Record<string, unknown>, at = NOW - 1000) => ({ type: "subscription.active", timestamp: iso(at),
  data: { payload_type: "Subscription", subscription_id: "sub_x", product_id: "pdt_month", status: "active", customer: { customer_id: customer }, metadata, next_billing_date: iso(NOW + 30 * 86_400_000) } });
const signed = async (owner: string, secret = SECRET) => ({ companion_user_id: owner, [OWNER_SIG_KEY]: await signOwner(owner, secret) });

describe("the owner id in checkout metadata is signed, and only a good signature is trusted (audit run 2, finding 1)", () => {
  test("a static link payment naming the victim with no signature leaves the victim's customer and the link book unchanged", async () => {
    const r = rig();
    const t = await issueSignInToken(r.store, VICTIM, "free", { email: "victim@example.test", nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW });
    if (!t.ok) throw new Error("setup");
    // The victim paid once through Squibby's own checkout: a signed owner id.
    expect((await r.send("msg_v", reportPaid("pay_v", VICTIM_CUS, await signed(VICTIM), NOW - 5000))).status).toBe(200);
    expect((await r.store.billingOf(VICTIM)).customerId).toBe(VICTIM_CUS);

    // The attacker buys on the static link with metadata_companion_user_id=<victim>: no signature.
    const res = await r.send("msg_a", reportPaid("pay_a", ATTACKER_CUS, { companion_user_id: VICTIM }));
    expect(res.status).toBe(503);   // matched to nobody: Dodo retries, and nothing is written
    const b = await r.store.billingOf(VICTIM);
    expect(b.customerId).toBe(VICTIM_CUS);
    expect(b.reports.map(([id]) => id)).toEqual(["pay_v"]);
    expect(await r.links.get(ATTACKER_CUS)).toBeNull();

    // The victim's next checkout still names their own customer, and carries a good signature.
    let sent: any = null;
    const routes = createBillingRoutes({ store: r.store, now: () => NOW, log: () => {}, paymentsOn: () => true, provider: () => "dodo",
      catalog: () => CATALOG as any, dodoBase: () => "https://test.dodopayments.com", dodoKey: () => "dodo_test_dummy", ownerSecret: () => SECRET,
      fetch: (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return Response.json({ checkout_url: "https://test.checkout.dodopayments.com/session/x" }); }) as any });
    const u = "https://api.example/v1/checkout";
    const out = await routes(new Request(u, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: JSON.stringify({ item: "pro_monthly" }) }), new URL(u));
    expect(out?.status).toBe(200);
    expect(sent.customer).toEqual({ customer_id: VICTIM_CUS });
    expect(sent.metadata).toEqual({ companion_user_id: VICTIM, [OWNER_SIG_KEY]: await signOwner(VICTIM, SECRET) });
    expect(await verifiedOwner(sent.metadata, SECRET)).toBe(VICTIM);
  });

  test("a forged signature is refused: another owner's, one made with another secret, garbage, or not text", async () => {
    for (const sig of [await signOwner(ATTACKER, SECRET), await signOwner(VICTIM, OTHER_SECRET), "00".repeat(32), "", 5, null]) {
      const r = rig();
      const res = await r.send("msg_f", reportPaid("pay_f", ATTACKER_CUS, { companion_user_id: VICTIM, [OWNER_SIG_KEY]: sig }));
      expect(res.status, String(sig)).toBe(503);
      const b = await r.store.billingOf(VICTIM);
      expect(b.customerId).toBeNull();
      expect(b.reports).toEqual([]);
      expect(await r.links.get(ATTACKER_CUS)).toBeNull();
    }
  });

  test("a subscription event naming the victim with no good signature grants nothing and saves no customer", async () => {
    const r = rig();
    for (const [i, meta] of [{ companion_user_id: VICTIM }, { companion_user_id: VICTIM, [OWNER_SIG_KEY]: await signOwner(ATTACKER, SECRET) }].entries()) {
      expect((await r.send(`msg_s${i}`, subActive(ATTACKER_CUS, meta))).status).toBe(503);
    }
    expect(await r.store.planOfOwner!(VICTIM)).not.toBe("pro");
    expect((await r.store.billingOf(VICTIM)).customerId).toBeNull();
    expect((await r.store.billingOf(VICTIM)).subs).toEqual([]);
    expect(await r.links.get(ATTACKER_CUS)).toBeNull();
  });

  test("a signed subscription event still grants Pro, saves the customer and learns the link", async () => {
    const r = rig();
    expect((await r.send("msg_ok", subActive(VICTIM_CUS, await signed(VICTIM)))).status).toBe(200);
    expect(await r.store.planOfOwner!(VICTIM)).toBe("pro");
    expect((await r.store.billingOf(VICTIM)).customerId).toBe(VICTIM_CUS);
    expect(await r.links.get(VICTIM_CUS)).toBe(VICTIM);
  });

  test("without the secret on the webhook, metadata is never trusted, even with a good signature", async () => {
    for (const ownerSecret of [() => undefined, () => "short"]) {
      const r = rig({ ownerSecret });
      expect((await r.send("msg_n", subActive(VICTIM_CUS, await signed(VICTIM)))).status).toBe(503);
      expect((await r.store.billingOf(VICTIM)).customerId).toBeNull();
      expect(await r.links.get(VICTIM_CUS)).toBeNull();
    }
  });

  test("decideDodoEvent and decidePaymentEvent trust only signed metadata", async () => {
    const links = new MemoryLinkBook();
    expect(await decideDodoEvent(subActive(ATTACKER_CUS, { companion_user_id: VICTIM }), CATALOG.plans, links, "test", SECRET)).toEqual({ kind: "unlinked" });
    expect(await decideDodoEvent(subActive(VICTIM_CUS, await signed(VICTIM)), CATALOG.plans, links, "test")).toEqual({ kind: "unlinked" });
    expect(await decideDodoEvent(subActive(VICTIM_CUS, await signed(VICTIM)), CATALOG.plans, links, "test", SECRET))
      .toMatchObject({ kind: "set", entitlement: { userId: VICTIM, plan: "pro" }, detail: { customerId: VICTIM_CUS } });
    expect(await decidePaymentEvent(reportPaid("pay_1", ATTACKER_CUS, { companion_user_id: VICTIM }), ["pdt_report"], links, undefined, [], SECRET)).toEqual({ kind: "unlinked" });
    expect(await decidePaymentEvent(reportPaid("pay_1", VICTIM_CUS, await signed(VICTIM)), ["pdt_report"], links, undefined, [], SECRET))
      .toEqual({ kind: "report_add", userId: VICTIM, paymentId: "pay_1" });
  });

  test("checkout is refused, and Dodo is not called, when the secret to sign the owner is missing", async () => {
    const store = new MemoryStore();
    const t = await issueSignInToken(store, VICTIM, "free", { email: "victim@example.test", nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW });
    if (!t.ok) throw new Error("setup");
    let called = false;
    const routes = createBillingRoutes({ store, now: () => NOW, log: () => {}, paymentsOn: () => true, provider: () => "dodo",
      catalog: () => CATALOG as any, dodoBase: () => "https://test.dodopayments.com", dodoKey: () => "dodo_test_dummy", ownerSecret: () => undefined,
      fetch: (async () => { called = true; return Response.json({}); }) as any });
    const u = "https://api.example/v1/checkout";
    const out = await routes(new Request(u, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: JSON.stringify({ item: "pro_monthly" }) }), new URL(u));
    expect(out?.status).toBe(503);
    expect(called).toBe(false);
  });
});

for (const kind of TEST_STORES) describe(`${kind.name}: a saved customer id is never replaced by another of the same mode`, () => {
  test("saveCustomer keeps the first id of a mode; another mode may still be saved", async () => {
    const s = kind.make();
    await s.saveCustomer(VICTIM, VICTIM_CUS, "test");
    await s.saveCustomer(VICTIM, ATTACKER_CUS, "test");
    let b = await s.billingOf(VICTIM);
    expect([b.customerId, b.customerMode]).toEqual([VICTIM_CUS, "test"]);
    await s.saveCustomer(VICTIM, "cus_live", "live");
    b = await s.billingOf(VICTIM);
    expect([b.customerId, b.customerMode]).toEqual(["cus_live", "live"]);
    await s.saveCustomer(VICTIM, "cus_live_2", "live");
    expect((await s.billingOf(VICTIM)).customerId).toBe("cus_live");
  });
});
