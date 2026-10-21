// Stripe events for managed usage: checking that an event really came from Stripe, and turning a subscription event into the
// plan a user should have. Pure functions; the Worker that receives the webhook and updates the store is deployment work.
import { PLANS } from "./plans.ts";

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
const sameText = (a: string, b: string): boolean => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** Stripe's webhook signature: header "t=<seconds>,v1=<hex>[,v1=<hex>]", signed over "<t>.<raw body>". Refuses a timestamp more than
 *  five minutes old or in the future, so a captured event cannot be replayed. Compares without stopping at the first difference. */
export async function verifyStripeSignature(rawBody: string, header: string, secret: string, nowSec: number, toleranceSec = 300): Promise<boolean> {
  const parts = (header ?? "").split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find((p) => p[0] === "t")?.[1]);
  const sigs = parts.filter((p) => p[0] === "v1" && p[1]).map((p) => p[1]);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (t < nowSec - toleranceSec || t > nowSec + 60) return false;
  const want = await hmac(secret, `${t}.${rawBody}`);
  return sigs.some((s) => sameText(s, want));
}
/** For tests: a header Stripe would send. */
export async function signForTest(rawBody: string, secret: string, t: number): Promise<string> { return `t=${t},v1=${await hmac(secret, `${t}.${rawBody}`)}`; }

export type Entitlement = { userId: string; plan: string; status: "active" | "past_due" };
/** What a Stripe event says a user's plan is, or null when it says nothing we understand (nothing changes then).
 *  prices maps a Stripe price id to one of our plan names; a name that is not in the plan table is never granted. */
export function entitlementFromEvent(event: any, prices: Record<string, string>): Entitlement | null {
  const type = event?.type;
  if (!["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(type)) return null;
  const o = event?.data?.object;
  const userId = o?.metadata?.companion_user_id;
  if (typeof userId !== "string" || !userId) return null;
  const status = type === "customer.subscription.deleted" ? "canceled" : o?.status;
  if (status === "canceled" || status === "incomplete_expired") return { userId, plan: "free", status: "active" };
  if (status !== "active" && status !== "trialing" && status !== "past_due" && status !== "unpaid") return null;
  const plan = prices[o?.items?.data?.[0]?.price?.id];
  if (typeof plan !== "string" || !Object.hasOwn(PLANS, plan)) return null;
  return { userId, plan, status: status === "past_due" || status === "unpaid" ? "past_due" : "active" };
}
