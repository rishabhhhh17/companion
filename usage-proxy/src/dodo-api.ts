// The few calls this server makes to Dodo's API (M116 step 4), with plain fetch (no new dependency): make a checkout session,
// make a billing portal link, and read back a payment's products (V4). Nothing else.
//
// The address comes from DODO_API_BASE (test mode by default) and must agree with the key: a dodo_test_ key only with the test
// address, a dodo_live_ key only with the live one (https://docs.dodopayments.com/api-reference/introduction). A mismatch, or
// any other address, means no call at all. The key travels only in the Authorization header to that address. Nothing Dodo
// answers is ever logged or passed on except the one https address the app opens; an error says only that it failed.

export const DODO_TEST_BASE = "https://test.dodopayments.com";
export const DODO_LIVE_BASE = "https://live.dodopayments.com";
/** How long one call to Dodo may take before it counts as failed. */
export const DODO_TIMEOUT_MS = 10_000;

export type DodoApi = { base: string; key: string; fetch: typeof fetch; timeoutMs?: number };
export type DodoSetup = { ok: true; base: string; key: string } | { ok: false; reason: "no_key" | "bad_base" | "key_mode_mismatch" };

/** Which Dodo the address is: test (also when none is set) or live. Null for any other address. Customer ids are kept with
 *  this, because test mode and live mode keep separate customers. */
export function dodoMode(base: string | undefined): "test" | "live" | null {
  const b = (base ?? "").trim() || DODO_TEST_BASE;
  return b === DODO_TEST_BASE ? "test" : b === DODO_LIVE_BASE ? "live" : null;
}

/** The Dodo address and key, checked against each other. No base set means the test address. */
export function dodoSetup(base: string | undefined, key: string | undefined): DodoSetup {
  const b = (base ?? "").trim() || DODO_TEST_BASE, k = (key ?? "").trim();
  if (!k) return { ok: false, reason: "no_key" };
  if (b !== DODO_TEST_BASE && b !== DODO_LIVE_BASE) return { ok: false, reason: "bad_base" };
  const wants = b === DODO_TEST_BASE ? "dodo_test_" : "dodo_live_";
  if (!k.startsWith(wants)) return { ok: false, reason: "key_mode_mismatch" };
  return { ok: true, base: b, key: k };
}

export type CheckoutBody = {
  product_cart: { product_id: string; quantity: number }[];
  customer: { customer_id: string } | { email: string };
  metadata: Record<string, string>;
  return_url: string;
  cancel_url: string;
  feature_flags: { allow_customer_editing_email: boolean };
};

const httpsAddress = (x: unknown): string | null => {
  if (typeof x !== "string" || x.length > 2048) return null;
  try { const u = new URL(x); return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null; } catch { return null; }
};

async function call(api: DodoApi, method: string, path: string, body?: unknown): Promise<unknown | null> {
  try {
    // Called as a plain function, never as api.fetch(...): Cloudflare's runtime throws "Illegal invocation" when the global
    // fetch is called as a method of another object (found under real workerd in M116 step 6).
    const send = api.fetch;
    const res = await send(`${api.base}${path}`, {
      method,
      headers: { authorization: `Bearer ${api.key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(api.timeoutMs ?? DODO_TIMEOUT_MS),
    });
    if (!res.ok) { await res.body?.cancel().catch(() => {}); return null; }
    return await res.json();
  } catch { return null; }   // never the error itself: it could hold the address, the key or Dodo's words
}

/** POST /checkouts. The checkout's address, or null when it failed (nothing is charged then). */
export async function createCheckout(api: DodoApi, body: CheckoutBody): Promise<string | null> {
  const r = await call(api, "POST", "/checkouts", body);
  return httpsAddress((r as { checkout_url?: unknown } | null)?.checkout_url);
}

/** POST /customers/{customer_id}/customer-portal/session. The portal link, or null. */
export async function createPortal(api: DodoApi, customerId: string): Promise<string | null> {
  const r = await call(api, "POST", `/customers/${encodeURIComponent(customerId)}/customer-portal/session`);
  return httpsAddress((r as { link?: unknown } | null)?.link);
}

/** GET /payments/{payment_id}: the product ids on a payment, for a payment event that came without product_cart (V4). */
export async function paymentProducts(api: DodoApi, paymentId: string): Promise<string[] | null> {
  const r = await call(api, "GET", `/payments/${encodeURIComponent(paymentId)}`);
  const cart = (r as { product_cart?: unknown } | null)?.product_cart;
  if (!Array.isArray(cart)) return null;
  return cart.map((x) => (x && typeof x === "object" ? (x as { product_id?: unknown }).product_id : null)).filter((x): x is string => typeof x === "string" && x.length > 0);
}
