import { describe, expect, test } from "bun:test";
import { verifyStripeSignature, entitlementFromEvent, signForTest } from "../src/stripe.ts";

const SECRET = "whsec_test_secret";
const PRICES = { price_pro_monthly: "pro", price_max_monthly: "max" };
const NOW = 1_800_000_000;

describe("Stripe signature", () => {
  test("a correctly signed body passes", async () => {
    const body = '{"id":"evt_1"}';
    expect(await verifyStripeSignature(body, await signForTest(body, SECRET, NOW), SECRET, NOW)).toBe(true);
  });
  test("a changed body, a wrong secret, a missing header or a header with no v1 fails", async () => {
    const body = '{"id":"evt_1"}', h = await signForTest(body, SECRET, NOW);
    expect(await verifyStripeSignature(body + " ", h, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(body, h, "whsec_other", NOW)).toBe(false);
    expect(await verifyStripeSignature(body, "", SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${NOW}`, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(body, "garbage", SECRET, NOW)).toBe(false);
  });
  test("an old signature is refused (replay), a slightly old one is fine", async () => {
    const body = "{}";
    expect(await verifyStripeSignature(body, await signForTest(body, SECRET, NOW - 301), SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(body, await signForTest(body, SECRET, NOW - 200), SECRET, NOW)).toBe(true);
    expect(await verifyStripeSignature(body, await signForTest(body, SECRET, NOW + 400), SECRET, NOW)).toBe(false);   // from the future
  });
  test("any one of several v1 signatures is enough (Stripe sends two while a secret is being changed)", async () => {
    const body = "{}", good = await signForTest(body, SECRET, NOW);
    const v1 = /v1=([0-9a-f]+)/.exec(good)![1];
    expect(await verifyStripeSignature(body, `t=${NOW},v1=${"0".repeat(64)},v1=${v1}`, SECRET, NOW)).toBe(true);
  });
});

describe("what a subscription event means for a user's plan", () => {
  const sub = (type: string, status: string, over: Record<string, unknown> = {}) => ({ type, data: { object: { status, metadata: { companion_user_id: "u9" }, items: { data: [{ price: { id: "price_pro_monthly" } }] }, ...over } } });
  test("an active or trialing subscription gives that plan", () => {
    for (const status of ["active", "trialing"]) expect(entitlementFromEvent(sub("customer.subscription.updated", status), PRICES)).toEqual({ userId: "u9", plan: "pro", status: "active" });
    expect(entitlementFromEvent(sub("customer.subscription.created", "active", { items: { data: [{ price: { id: "price_max_monthly" } }] } }), PRICES)).toEqual({ userId: "u9", plan: "max", status: "active" });
  });
  test("a late payment keeps the plan for a grace period, marked past due", () => {
    for (const status of ["past_due", "unpaid"]) expect(entitlementFromEvent(sub("customer.subscription.updated", status), PRICES)).toEqual({ userId: "u9", plan: "pro", status: "past_due" });
  });
  test("a canceled or deleted subscription drops the user to the free plan, still active", () => {
    expect(entitlementFromEvent(sub("customer.subscription.deleted", "canceled"), PRICES)).toEqual({ userId: "u9", plan: "free", status: "active" });
    expect(entitlementFromEvent(sub("customer.subscription.updated", "canceled"), PRICES)).toEqual({ userId: "u9", plan: "free", status: "active" });
    expect(entitlementFromEvent(sub("customer.subscription.updated", "incomplete_expired"), PRICES)).toEqual({ userId: "u9", plan: "free", status: "active" });
  });
  test("what cannot be understood changes nothing: unknown price, no user, half set up, other events", () => {
    expect(entitlementFromEvent(sub("customer.subscription.updated", "active", { items: { data: [{ price: { id: "price_unknown" } }] } }), PRICES)).toBeNull();
    expect(entitlementFromEvent(sub("customer.subscription.updated", "active", { metadata: {} }), PRICES)).toBeNull();
    expect(entitlementFromEvent(sub("customer.subscription.updated", "incomplete"), PRICES)).toBeNull();
    expect(entitlementFromEvent({ type: "invoice.paid", data: { object: {} } }, PRICES)).toBeNull();
    expect(entitlementFromEvent(null as never, PRICES)).toBeNull();
    expect(entitlementFromEvent({ type: "customer.subscription.updated" } as never, PRICES)).toBeNull();
  });
  test("a plan name that is not in our table is never granted", () => {
    expect(entitlementFromEvent(sub("customer.subscription.updated", "active"), { price_pro_monthly: "enterprise" })).toBeNull();
  });
});
