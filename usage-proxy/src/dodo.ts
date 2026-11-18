// Dodo Payments events for managed usage: checking that a webhook really came from Dodo, and turning a subscription event into the
// plan a person should have. It mirrors stripe.ts (pure checks first), and adds the handler a Worker would call. Dodo follows the
// Standard Webhooks scheme (https://docs.dodopayments.com/developer-resources/webhooks): headers webhook-id, webhook-timestamp and
// webhook-signature, an HMAC SHA256 over "<id>.<timestamp>.<raw body>" keyed with the base64 part of the whsec_ secret.
//
// Off unless the operator turns it on (see payments.ts and the README). No network, no secrets, and no request body is ever logged.
import { PLANS } from "./plans.ts";
import type { DodoMode } from "./store.ts";

// ---- signature -------------------------------------------------------------------------------------------------------------------
/** How far the webhook-timestamp may be from now, in seconds, either way. Dodo's page says to reject a timestamp "too far from the
 *  current time" and that the Standard Webhooks libraries allow five minutes; it names no other number. */
export const DODO_TIMESTAMP_TOLERANCE_SEC = 300;
const MAX_SIGNATURES = 10;

const bytes = (s: string) => new TextEncoder().encode(s);
const toBase64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

/** Compares two texts without stopping at the first difference. Only the lengths can show. */
export function constantTimeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

/** The signing key: the secret without a leading "whsec_", base64 decoded. Null when it is empty or not base64. */
function signingKey(secret: string): Uint8Array<ArrayBuffer> | null {
  const s = typeof secret === "string" ? (secret.startsWith("whsec_") ? secret.slice(6) : secret) : "";
  if (!s || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  try { const key = Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); return key.length ? key : null; } catch { return null; }
}
async function sign(key: Uint8Array<ArrayBuffer>, id: string, timestamp: string, rawBody: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64(await crypto.subtle.sign("HMAC", k, bytes(`${id}.${timestamp}.${rawBody}`)));
}

type HeaderSource = Headers | Record<string, string | undefined>;
function header(h: HeaderSource, name: string): string {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? "";
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === name && typeof v === "string") return v;
  return "";
}

export type DodoRefusal = "missing_headers" | "bad_timestamp" | "outside_window" | "bad_secret" | "no_signature" | "mismatch";
export type DodoVerified = { ok: true; id: string; timestampSec: number } | { ok: false; reason: DodoRefusal };

/** Checks one webhook. The refusal says only why, never what the body held. */
export async function verifyDodoWebhook(rawBody: string, headers: HeaderSource, secret: string, nowSec: number, toleranceSec = DODO_TIMESTAMP_TOLERANCE_SEC): Promise<DodoVerified> {
  const id = header(headers, "webhook-id"), ts = header(headers, "webhook-timestamp"), list = header(headers, "webhook-signature");
  if (!id || id.length > 200 || !ts || !list.trim()) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, reason: "bad_timestamp" };
  const timestampSec = Number(ts);
  if (Math.abs(nowSec - timestampSec) > toleranceSec) return { ok: false, reason: "outside_window" };
  const key = signingKey(secret);
  if (!key) return { ok: false, reason: "bad_secret" };
  // "v1,<base64>" entries, space separated; only version v1 is understood (others are skipped, not trusted)
  const candidates = list.trim().split(/\s+/).slice(0, MAX_SIGNATURES).map((p) => p.split(",")).filter((p) => p.length === 2 && p[0] === "v1" && p[1]).map((p) => p[1]);
  if (!candidates.length) return { ok: false, reason: "no_signature" };
  const expectedSignature = await sign(key, id, ts, rawBody);
  let match = false;
  for (const c of candidates) if (constantTimeEqual(c, expectedSignature)) match = true;   // look at all of them, whatever matched
  return match ? { ok: true, id, timestampSec } : { ok: false, reason: "mismatch" };
}
/** For tests: the three headers Dodo would send. */
export async function signDodoForTest(id: string, rawBody: string, secret: string, t: number): Promise<Record<string, string>> {
  const key = signingKey(secret);
  if (!key) throw new Error("test secret is not base64");
  return { "webhook-id": id, "webhook-timestamp": String(t), "webhook-signature": `v1,${await sign(key, id, String(t), rawBody)}` };
}

// ---- the product table (configuration, never code) -------------------------------------------------------------------------------
/** What the app may ask a checkout for (M116). The server maps each to a Dodo product id from its own table. */
export const CHECKOUT_ITEMS = ["pro_monthly", "pro_yearly", "report"] as const;
export type CheckoutItem = (typeof CHECKOUT_ITEMS)[number];
export const isCheckoutItem = (x: unknown): x is CheckoutItem => typeof x === "string" && (CHECKOUT_ITEMS as readonly string[]).includes(x);
/** Dodo product id to plan name, for the subscription products only. */
export type DodoProducts = Record<string, string>;
/** M116: the whole table. `plans`: subscription products to plan names. `items`: what each checkout item buys. `reports`: the
 *  one time report products (a payment for one adds a report credit; it is never a plan). */
export type DodoCatalog = { plans: DodoProducts; items: Partial<Record<CheckoutItem, string>>; reports: string[] };
export type CatalogParsed = { ok: true; catalog: DodoCatalog } | { ok: false; message: string };
export type ProductsParsed = { ok: true; products: DodoProducts } | { ok: false; message: string };
const TABLE_SHAPE = 'It should look like {"<dodo product id>": {"item": "pro_monthly", "plan": "pro"}, "<id>": {"item": "report", "once": true}}.';

/** Reads the operator's table (JSON text, the DODO_PRODUCTS setting). M116 form: each product id maps to its item, as
 *  {"item": "pro_monthly" | "pro_yearly", "plan": "pro"} or {"item": "report", "once": true}. The older form, a product id
 *  mapped to a plan name ("pro"), still reads, with no items (so no checkout can be made from it). */
export function parseDodoCatalog(text: string): CatalogParsed {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, message: `The Dodo product table is not valid JSON. ${TABLE_SHAPE}` }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: `The Dodo product table must be an object that maps each Dodo product id to what it sells. ${TABLE_SHAPE}` };
  const catalog: DodoCatalog = { plans: {}, items: {}, reports: [] };
  for (const [id, entry] of Object.entries(raw)) {
    if (!id || id === "__proto__") return { ok: false, message: "The Dodo product table has an empty or unusable product id." };
    if (typeof entry === "string") {
      if (!Object.hasOwn(PLANS, entry)) return { ok: false, message: `The Dodo product table maps a product to "${safeText(entry)}", which is not one of our plans (${Object.keys(PLANS).join(", ")}).` };
      catalog.plans[id] = entry;
      continue;
    }
    const e = obj(entry);
    if (!e || !isCheckoutItem(e.item)) return { ok: false, message: `The Dodo product table gives product "${safeText(id)}" no known item (${CHECKOUT_ITEMS.join(", ")}). ${TABLE_SHAPE}` };
    if (catalog.items[e.item] !== undefined) return { ok: false, message: `The Dodo product table names two products for "${e.item}". Keep one.` };
    if (e.item === "report") {
      if (e.once !== true || e.plan !== undefined) return { ok: false, message: `The Dodo product table must mark the report product "${safeText(id)}" as {"item": "report", "once": true}, with no plan.` };
      catalog.reports.push(id);
    } else {
      if (typeof e.plan !== "string" || !Object.hasOwn(PLANS, e.plan) || e.plan === "free" || e.once !== undefined)
        return { ok: false, message: `The Dodo product table gives "${safeText(id)}" the plan "${safeText(e.plan)}", which is not one of our paid plans (${Object.keys(PLANS).filter((p) => p !== "free").join(", ")}).` };
      catalog.plans[id] = e.plan;
    }
    catalog.items[e.item] = id;
  }
  return { ok: true, catalog };
}
/** The subscription products only: Dodo product id to plan name (see parseDodoCatalog). */
export function parseDodoProducts(text: string): ProductsParsed {
  const c = parseDodoCatalog(text);
  return c.ok ? { ok: true, products: c.catalog.plans } : c;
}

// ---- what an event means ------------------------------------------------------------------------------------------------------------
/** The subscription event names Dodo's docs list (webhooks guide and subscription pages, 23 Oct 2026). */
export const DODO_SUBSCRIPTION_EVENTS = [
  "subscription.active", "subscription.updated", "subscription.past_due", "subscription.on_hold", "subscription.paused", "subscription.unpaused",
  "subscription.renewed", "subscription.plan_changed", "subscription.update_payment_method", "subscription.cancelled", "subscription.failed", "subscription.expired",
] as const;
/** The key checkout metadata carries, the same name as the Stripe path uses. */
export const USER_ID_KEY = "companion_user_id";

/** A plan for a person. `until` (ms) is set only for a grace period or a cancel at the end of the period: after it, the person
 *  is on the free plan. M116: `cancelling` is Pro until `until`; `on_hold` is Free with "payment failed, fix in billing". */
export type DodoEntitlement = { userId: string; plan: string; status: "active" | "past_due" | "cancelling" | "on_hold"; until?: number };
/** M116: which subscription an event is about, its renew date, and the Dodo customer (only when the checkout metadata named the
 *  person and the link book does not give that customer to someone else, so a customer id is never saved from a guess), with
 *  the Dodo mode it came from. The plan is kept per subscription; the owner's is the best of them. */
export type SubDetail = { subscriptionId: string; customerId?: string; customerMode?: DodoMode; renewsOn?: number };
export const FREE = (userId: string): DodoEntitlement => ({ userId, plan: "free", status: "active" });
/** The plan to use right now: a grace period that has run out counts as free. */
export const entitledPlan = (e: DodoEntitlement, nowMs: number): string => (e.until !== undefined && nowMs >= e.until ? "free" : e.plan);

export interface LinkBook {
  /** Our user id for a Dodo customer id, or null. */
  get(customerId: string): Promise<string | null>;
  set(customerId: string, userId: string): Promise<void>;
}
export class MemoryLinkBook implements LinkBook {
  #m = new Map<string, string>();
  async get(customerId: string) { return this.#m.get(customerId) ?? null; }
  async set(customerId: string, userId: string) { this.#m.set(customerId, userId); }
}

export type DodoDecision =
  | { kind: "set"; entitlement: DodoEntitlement; detail?: SubDetail }
  | { kind: "ignore" }
  | { kind: "unknown_product"; productId: string; message: string; entitlement?: DodoEntitlement; detail?: SubDetail }
  | { kind: "unlinked" };

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const str = (x: unknown): string | null => (typeof x === "string" && x ? x : null);
/** Text that is safe to put in a log line or a message: a short identifier, or a placeholder. */
function safeText(x: unknown): string { return typeof x === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(x) ? x : "(unreadable)"; }
const safeOrUndefined = (x: unknown): string | undefined => (typeof x === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(x) ? x : undefined);

/** True when this Dodo customer may be saved on this person: the link book has no one else for it. The first link stays
 *  (learnLink), so a customer linked to someone else is never written onto a second person, where a billing portal could
 *  open it. */
async function customerIsTheirs(customerId: string, userId: string, links: LinkBook): Promise<boolean> {
  const known = await links.get(customerId);
  return known === null || known === userId;
}

/** Who a payload belongs to: the checkout metadata first, then a link learned from a payment. */
async function ownerOf(data: Record<string, unknown>, links: LinkBook): Promise<string | null> {
  const fromMetadata = str(obj(data.metadata)?.[USER_ID_KEY]);
  if (fromMetadata) return fromMetadata;
  const customer = str(obj(data.customer)?.customer_id);
  return customer ? await links.get(customer) : null;
}

/**
 * What a Dodo event says a person's plan is. Rules, all leaning to not granting:
 *  - active, renewed, unpaused, updated, plan_changed on an active subscription: the mapped plan. M116: with
 *    cancel_at_next_billing_date true and a future next_billing_date, it is `cancelling` until that date; with it false, a
 *    pending cancel is undone (plain `active`).
 *  - past_due (Dodo: access is kept in the grace period): the plan, but only until past_due_ends_at; no readable end means free.
 *  - cancelled: M116, with cancel_at_next_billing_date true and a future next_billing_date, Pro is kept until then (`cancelling`);
 *    otherwise free at once. expired: free.
 *  - on_hold, paused, failed: free with status `on_hold`, which the app shows as "payment failed, fix it in billing".
 *  - a product that is not in the table grants nothing; on plan_changed the person drops to free, as the old product is gone.
 */
export async function decideDodoEvent(event: unknown, products: DodoProducts, links: LinkBook, mode: DodoMode | null = "test"): Promise<DodoDecision> {
  const e = obj(event), type = e?.type, data = obj(e?.data);
  if (typeof type !== "string" || !data || !(DODO_SUBSCRIPTION_EVENTS as readonly string[]).includes(type) || type === "subscription.update_payment_method") return { kind: "ignore" };
  const fromMetadata = str(obj(data.metadata)?.[USER_ID_KEY]);
  const userId = await ownerOf(data, links);
  if (!userId) return { kind: "unlinked" };

  const at = Date.parse(String(e?.timestamp));
  const nextBilling = Date.parse(String(data.next_billing_date));
  const subscriptionId = safeOrUndefined(data.subscription_id);
  // The customer id is saved only when the metadata names the person, the link book does not give it to someone else, and
  // the Dodo mode is readable (an id from test mode is unknown to live mode).
  const named = fromMetadata && mode ? safeOrUndefined(obj(data.customer)?.customer_id) : undefined;
  const customerId = named && (await customerIsTheirs(named, fromMetadata as string, links)) ? named : undefined;
  const detail: SubDetail | undefined = subscriptionId
    ? { subscriptionId, ...(customerId && mode ? { customerId, customerMode: mode } : {}), ...(Number.isFinite(nextBilling) ? { renewsOn: nextBilling } : {}) }
    : undefined;
  const withDetail = (d: { kind: "set"; entitlement: DodoEntitlement }): DodoDecision => (detail ? { ...d, detail } : d);
  // A cancel at the end of the period: kept until the next billing date, when that date is readable and still ahead.
  const cancelsLater = data.cancel_at_next_billing_date === true && Number.isFinite(nextBilling) && (!Number.isFinite(at) || nextBilling > at);

  const status = typeof data.status === "string" ? data.status : "";
  const free = withDetail({ kind: "set", entitlement: FREE(userId) });
  const onHold = withDetail({ kind: "set", entitlement: { userId, plan: "free", status: "on_hold" } });
  const HOLD = ["on_hold", "paused", "failed"], ENDED = ["cancelled", "expired"];
  let wants: "grant" | "grace" | "free" | "hold" | "keep" | "ignore";
  switch (type) {
    case "subscription.on_hold": case "subscription.paused": case "subscription.failed": wants = "hold"; break;
    case "subscription.expired": wants = "free"; break;
    case "subscription.cancelled": wants = cancelsLater ? "keep" : "free"; break;
    case "subscription.past_due": wants = "grace"; break;
    default:
      wants = status === "active" ? (cancelsLater ? "keep" : "grant") : status === "past_due" ? "grace" : HOLD.includes(status) ? "hold"
        : status === "cancelled" ? (cancelsLater ? "keep" : "free") : ENDED.includes(status) ? "free" : "ignore";
  }
  if (wants === "ignore") return { kind: "ignore" };
  if (wants === "free") return free;
  if (wants === "hold") return onHold;

  const productId = str(data.product_id);
  const plan = productId && Object.hasOwn(products, productId) ? products[productId] : null;
  if (!productId || !plan || !Object.hasOwn(PLANS, plan)) {
    const named = productId ? `"${safeText(productId)}"` : "(none)";
    return {
      kind: "unknown_product", productId: productId ? safeText(productId) : "", entitlement: type === "subscription.plan_changed" ? FREE(userId) : undefined,
      ...(type === "subscription.plan_changed" && detail ? { detail } : {}),
      message: `Dodo product ${named} is not in the product table, so it was given no plan. Add it to the product table (DODO_PRODUCTS) and Dodo will deliver this event again.`,
    };
  }
  if (wants === "grant") return withDetail({ kind: "set", entitlement: { userId, plan, status: "active" } });
  if (wants === "keep") return withDetail({ kind: "set", entitlement: { userId, plan, status: "cancelling", until: nextBilling } });
  const ends = Date.parse(String(data.past_due_ends_at));
  if (!Number.isFinite(ends) || !Number.isFinite(at) || ends <= at) return free;
  return withDetail({ kind: "set", entitlement: { userId, plan, status: "past_due", until: ends } });
}

// ---- payments, refunds and disputes (M116: the report) -----------------------------------------------------------------------------
export type PaymentDecision =
  | { kind: "ignore" }
  | { kind: "unlinked" }
  /** No product_cart and no subscription on the payment: read its products back from Dodo (V4), then decide again. */
  | { kind: "lookup"; paymentId: string }
  | { kind: "report_add"; userId: string; paymentId: string }
  /** A one time payment (no subscription) for products that are neither the report nor Pro in the table: the table is
   *  missing the report product, or could not be read. Answered 503 so Dodo delivers it again once the table is fixed. */
  | { kind: "unknown_product"; productId: string; paymentId: string }
  | { kind: "report_remove"; paymentId: string; why: "refund" | "dispute" }
  | { kind: "note"; note: "partial_refund" | "dispute_opened"; paymentId?: string };

/**
 * What a payment, refund or dispute event means. Only the report is decided here; Pro follows the subscription events Dodo
 * sends (V13), so a refund or a dispute of a subscription payment changes no plan.
 *  - payment.succeeded for a report product adds one credit, keyed by payment_id. Its products come from product_cart, or from
 *    `knownProducts` (read back from Dodo when the event has none). A payment for a subscription, or for a Pro product in
 *    `planIds`, adds nothing. A one time payment for none of those is `unknown_product`, never ignored: someone paid, and a
 *    200 would stop Dodo's retries for good.
 *  - refund.succeeded with is_partial exactly false, and dispute.lost, remove that payment's credit if it is unused.
 *  - a partial refund and dispute.opened change nothing; they are noted for the operator.
 */
export async function decidePaymentEvent(event: unknown, reportIds: readonly string[], links: LinkBook, knownProducts?: readonly string[], planIds: readonly string[] = []): Promise<PaymentDecision> {
  const e = obj(event), type = e?.type, data = obj(e?.data);
  if (typeof type !== "string" || !data) return { kind: "ignore" };
  const paymentId = safeOrUndefined(data.payment_id);
  if (type === "payment.succeeded") {
    if (!paymentId) return { kind: "ignore" };
    const cart = Array.isArray(data.product_cart) ? data.product_cart.map((x) => str(obj(x)?.product_id)).filter((x): x is string => !!x) : null;
    const products = cart?.length ? cart : knownProducts ? [...knownProducts] : null;
    if (!products) return str(data.subscription_id) ? { kind: "ignore" } : { kind: "lookup", paymentId };
    if (!products.some((p) => reportIds.includes(p))) {
      if (str(data.subscription_id) || products.some((p) => planIds.includes(p))) return { kind: "ignore" };
      return { kind: "unknown_product", productId: products.length ? safeText(products[0]) : "", paymentId };
    }
    const userId = await ownerOf(data, links);
    return userId ? { kind: "report_add", userId, paymentId } : { kind: "unlinked" };
  }
  if (type === "refund.succeeded") {
    if (!paymentId) return { kind: "ignore" };
    return data.is_partial === false ? { kind: "report_remove", paymentId, why: "refund" } : { kind: "note", note: "partial_refund", paymentId };
  }
  if (type === "dispute.lost") return paymentId ? { kind: "report_remove", paymentId, why: "dispute" } : { kind: "ignore" };
  if (type === "dispute.opened") return { kind: "note", note: "dispute_opened", ...(paymentId ? { paymentId } : {}) };
  return { kind: "ignore" };
}

/** Where report credits live (the owner's record), found by payment_id for a refund, whose metadata is its own. */
export interface ReportBook {
  add(userId: string, paymentId: string, at: number): Promise<"added" | "known">;
  /** `at`: the event's time (ms). For a payment not seen yet ("unknown"), a marker is kept, so its credit is never given. */
  remove(paymentId: string, why: "refund" | "dispute", at: number): Promise<{ result: "removed" | "used" | "already" | "unknown"; ownerId?: string }>;
}

// ---- once only, in order ---------------------------------------------------------------------------------------------------------
export interface DodoLedger {
  /** Take an event id. False when it is already taken or done. A real store must make this one atomic step. */
  claim(webhookId: string): Promise<boolean>;
  /** Give the id back, so Dodo's retry is handled again. */
  release(webhookId: string): Promise<void>;
  /** The time (ms) of the newest event applied for a person, or null. M116: with `scope` (a subscription id), the newest for
   *  that one subscription: an owner's subscriptions are ordered each on their own, so an old event for one never blocks another. */
  lastAppliedAt(userId: string, scope?: string): Promise<number | null>;
  setLastAppliedAt(userId: string, ms: number, scope?: string): Promise<void>;
}
/** How long a payment event id is remembered: 48 hours, past Dodo's retries of about 37 hours
 *  (https://docs.dodopayments.com/developer-resources/webhooks). The Durable Object ledger keeps the same (WEBHOOK_KEEP_MS). */
export const DODO_WEBHOOK_KEEP_MS = 48 * 3600 * 1000;
const scopeKey = (userId: string, scope?: string) => (scope ? `${userId}\u0000${scope}` : userId);
export class MemoryDodoLedger implements DodoLedger {
  // id -> when it was taken (ms). M116: kept 48 hours, because Dodo retries a delivery for about 37 hours, each retry signed
  // afresh (so it passes the time window) with the same id. Older ones are dropped, so the list stays small.
  #ids = new Map<string, number>();
  #last = new Map<string, number>();
  constructor(private clock: () => number = Date.now) {}
  static readonly KEEP_MS = DODO_WEBHOOK_KEEP_MS;
  size() { return this.#ids.size; }
  async claim(id: string) {
    const at = this.clock();
    for (const [k, v] of this.#ids) { if (at - v > MemoryDodoLedger.KEEP_MS) this.#ids.delete(k); else break; }   // oldest first
    if (this.#ids.has(id)) return false;
    this.#ids.set(id, at); return true;
  }
  async release(id: string) { this.#ids.delete(id); }
  async lastAppliedAt(userId: string, scope?: string) { return this.#last.get(scopeKey(userId, scope)) ?? null; }
  async setLastAppliedAt(userId: string, ms: number, scope?: string) { const k = scopeKey(userId, scope); this.#last.set(k, Math.max(ms, this.#last.get(k) ?? 0)); }
}

/** What the handler logs, and nothing else. Short identifiers only: no body, no email, no name, no secret. */
export type SafeDodoEvent = {
  kind: "refused" | "bad_request" | "duplicate" | "stale" | "ignored" | "applied" | "unknown_product" | "unlinked" | "apply_failed" | "link_learned" | "link_conflict"
    | "report_added" | "report_known" | "report_removed" | "report_kept_used" | "refund_logged" | "dispute_logged" | "lookup_failed";
  reason?: string; eventType?: string; webhookId?: string; userId?: string; plan?: string; productId?: string; paymentId?: string;
};
export type DodoOutcome = "refused" | "bad_request" | "duplicate" | "stale" | "ignored" | "applied" | "unknown_product" | "unlinked" | "apply_failed";
export type DodoWebhookDeps = {
  /** The signing secret, read from the operator's environment. Empty means everything is refused. */
  secret: () => string;
  /** Dodo product id to plan name (see parseDodoProducts). */
  products: () => DodoProducts;
  ledger: DodoLedger;
  links: LinkBook;
  /** Writes the person's plan to the store. Throwing makes the answer 500, so Dodo retries. `at` is the event's own time (ms):
   *  a store shared by many server instances uses it to skip an older event in the same step as the write (M99). Answering
   *  false means it was not written for that reason, and the event is answered and logged as stale (M99 review). M116:
   *  `detail` names the subscription (the plan is kept per subscription) and the customer to save. */
  apply: (e: DodoEntitlement, at: number, detail?: SubDetail) => Promise<boolean | void>;
  /** M116: the report product ids (see parseDodoCatalog). Missing: no report credits are given. */
  reportIds?: () => readonly string[];
  /** M116: where report credits are kept. Missing: payment, refund and dispute events are only acknowledged, as before. */
  reports?: ReportBook;
  /** M116: keep the Dodo customer id on the owner, from a payment.succeeded whose checkout metadata names them, with the mode. */
  saveCustomer?: (userId: string, customerId: string, mode: DodoMode) => Promise<void>;
  /** M116: which Dodo this server talks to, from DODO_API_BASE (see dodoMode). Null: unreadable, so no customer id is saved.
   *  Missing: test, the default address. */
  mode?: () => DodoMode | null;
  /** M116 (V4): a payment's product ids read back from Dodo, for a payment event with no product_cart. Null: could not read. */
  paymentProducts?: (paymentId: string) => Promise<string[] | null>;
  now?: () => number;
  log?: (e: SafeDodoEvent) => void;
};
export const MAX_WEBHOOK_BYTES = 1_000_000;

const answer = (status: number, outcome: DodoOutcome, message?: string) =>
  new Response(JSON.stringify({ outcome, ...(message ? { message } : {}) }), { status, headers: { "content-type": "application/json" } });

async function readCapped(req: Request): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** The webhook for POST /webhooks/dodo. A Worker serves it only when the provider setting is "dodo". */
export function createDodoWebhook(d: DodoWebhookDeps): (req: Request) => Promise<Response> {
  const now = d.now ?? Date.now, log = d.log ?? (() => {});
  const modeNow = (): DodoMode | null => (d.mode ? d.mode() : "test");
  // One person's events are applied one after the other here, so an older event that is slower to save cannot land after a newer one.
  // (Across several server instances the store must do the same in one atomic step, as the README says.)
  const queue = new Map<string, Promise<unknown>>();
  const oneAtATime = async <T>(key: string, job: () => Promise<T>): Promise<T> => {
    const before = queue.get(key) ?? Promise.resolve();
    const mine = before.catch(() => {}).then(job);
    const tail = mine.catch(() => {});
    queue.set(key, tail);
    try { return await mine; } finally { if (queue.get(key) === tail) queue.delete(key); }
  };
  /** M116: a payment, refund or dispute event. Only the report credit changes here; everything else is noted or ignored. */
  async function paymentEvent(event: Record<string, unknown>, eventType: string | undefined, webhookId: string | undefined): Promise<Response> {
    const reports = d.reports as ReportBook, reportIds = d.reportIds?.() ?? [], planIds = Object.keys(d.products());
    const data = obj(event.data), mode = modeNow();
    if (event.type === "payment.succeeded" && data && d.saveCustomer && mode) {
      const userId = str(obj(data.metadata)?.[USER_ID_KEY]), customerId = safeOrUndefined(obj(data.customer)?.customer_id);
      // Never onto a second person: a customer the link book gives to someone else is left where it is (learnLink logged it).
      if (userId && customerId && (await customerIsTheirs(customerId, userId, d.links))) await d.saveCustomer(userId, customerId, mode);
    }
    let decision = await decidePaymentEvent(event, reportIds, d.links, undefined, planIds);
    if (decision.kind === "lookup") {
      const paymentId = decision.paymentId;
      const known = d.paymentProducts ? await d.paymentProducts(paymentId).catch(() => null) : null;
      if (!known) {
        log({ kind: "lookup_failed", eventType, webhookId, paymentId });
        return answer(503, "unknown_product", "This payment's products could not be read yet. Dodo will deliver it again.");
      }
      decision = await decidePaymentEvent(event, reportIds, d.links, known, planIds);
      if (decision.kind === "lookup") decision = { kind: "ignore" };
    }
    switch (decision.kind) {
      case "ignore": log({ kind: "ignored", eventType, webhookId }); return answer(200, "ignored");
      case "unlinked": log({ kind: "unlinked", eventType, webhookId }); return answer(503, "unlinked", "This event could not be matched to a person yet. Dodo will deliver it again.");
      case "unknown_product": {
        log({ kind: "unknown_product", eventType, webhookId, productId: decision.productId || undefined, paymentId: decision.paymentId });
        const named = decision.productId ? `"${decision.productId}"` : "(none)";
        return answer(503, "unknown_product", `This payment is for Dodo product ${named}, which is not the report or Pro in the product table, so no credit was given. Add it to the product table (DODO_PRODUCTS) and Dodo will deliver this event again.`);
      }
      case "note":
        log({ kind: decision.note === "partial_refund" ? "refund_logged" : "dispute_logged", eventType, webhookId, reason: decision.note, paymentId: decision.paymentId });
        return answer(200, "ignored");
      case "report_add": {
        const r = await reports.add(decision.userId, decision.paymentId, Date.parse(String(event.timestamp)));
        log({ kind: r === "added" ? "report_added" : "report_known", eventType, webhookId, userId: safeOrUndefined(decision.userId), paymentId: decision.paymentId });
        return answer(200, r === "added" ? "applied" : "duplicate");
      }
      case "report_remove": {
        const r = await reports.remove(decision.paymentId, decision.why, Date.parse(String(event.timestamp)));
        const userId = r.ownerId ? safeOrUndefined(r.ownerId) : undefined;
        // Not a report payment we know: a subscription payment (Pro follows the subscription events Dodo sends after it, V13),
        // or a report payment not delivered yet. Either way a marker is kept by payment_id, so a late report credit is never given.
        if (r.result === "unknown") log({ kind: decision.why === "refund" ? "refund_logged" : "dispute_logged", eventType, webhookId, reason: "not_a_report", paymentId: decision.paymentId });
        else log({ kind: r.result === "used" ? "report_kept_used" : "report_removed", eventType, webhookId, userId, paymentId: decision.paymentId, reason: decision.why });
        return answer(200, r.result === "removed" ? "applied" : "ignored");
      }
    }
  }

  return async (req) => {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
    const body = await readCapped(req);
    if (body === null) { log({ kind: "bad_request", reason: "too_big" }); return answer(413, "bad_request", "That request is too big."); }
    const verified = await verifyDodoWebhook(body, req.headers, d.secret(), Math.floor(now() / 1000));
    if (!verified.ok) { log({ kind: "refused", reason: verified.reason }); return answer(401, "refused", "This request could not be verified."); }
    const webhookId = safeOrUndefined(verified.id);

    let event: Record<string, unknown> | null = null;
    try { event = obj(JSON.parse(body)); } catch { event = null; }
    const at = Date.parse(String(event?.timestamp));
    const eventType = typeof event?.type === "string" && /^[a-z_.]{1,60}$/.test(event.type) ? event.type : undefined;
    if (!event || !Number.isFinite(at)) { log({ kind: "bad_request", reason: "unreadable_event", webhookId }); return answer(400, "bad_request", "The event could not be read."); }

    if (!(await d.ledger.claim(verified.id))) { log({ kind: "duplicate", eventType, webhookId }); return answer(200, "duplicate"); }
    try {
      await learnLink(event, d.links, log, eventType, webhookId);
      if (d.reports && !eventType?.startsWith("subscription.")) {
        const paid = await paymentEvent(event, eventType, webhookId);
        if (paid.status !== 200) await d.ledger.release(verified.id);   // not done: Dodo's retry gets another go
        return paid;
      }
      const decision = await decideDodoEvent(event, d.products(), d.links, modeNow());
      if (decision.kind === "ignore") { log({ kind: "ignored", eventType, webhookId }); return answer(200, "ignored"); }
      if (decision.kind === "unlinked") {
        await d.ledger.release(verified.id);
        log({ kind: "unlinked", eventType, webhookId });
        return answer(503, "unlinked", "This event could not be matched to a person yet. Dodo will deliver it again.");
      }
      const entitlement = decision.entitlement, detail = decision.detail, scope = detail?.subscriptionId;
      let outcome: DodoOutcome = "applied";
      if (entitlement) {
        // One subscription's events one after the other; the store checks the order again in the same step as its write.
        outcome = await oneAtATime(scope ? `${entitlement.userId}\u0000${scope}` : entitlement.userId, async () => {
          const last = await d.ledger.lastAppliedAt(entitlement.userId, scope);
          if (last !== null && at < last) return "stale" as const;
          if ((await d.apply(entitlement, at, detail)) === false) return "stale" as const;
          await d.ledger.setLastAppliedAt(entitlement.userId, at, scope);
          return "applied" as const;
        });
        log({ kind: outcome === "stale" ? "stale" : "applied", eventType, webhookId, userId: safeOrUndefined(entitlement.userId), plan: entitlement.plan });
      }
      if (decision.kind === "unknown_product") {
        await d.ledger.release(verified.id);   // not done: Dodo's retry gets another go once the table is fixed
        log({ kind: "unknown_product", eventType, webhookId, productId: decision.productId || undefined });
        return answer(503, "unknown_product", decision.message);
      }
      return answer(200, outcome);
    } catch {
      // never log the error: it could carry a body, an email or a secret
      await d.ledger.release(verified.id).catch(() => {});
      log({ kind: "apply_failed", eventType, webhookId });
      return answer(500, "apply_failed", "Something went wrong on our side. Dodo will deliver this event again.");
    }
  };
}

/** Payments and subscription events both carry the checkout metadata and the Dodo customer: remember which person that customer is. */
async function learnLink(event: Record<string, unknown>, links: LinkBook, log: (e: SafeDodoEvent) => void, eventType: string | undefined, webhookId: string | undefined): Promise<void> {
  const type = event.type, data = obj(event.data);
  if (!data || typeof type !== "string" || !(type === "payment.succeeded" || type.startsWith("subscription."))) return;
  const userId = str(obj(data.metadata)?.[USER_ID_KEY]), customerId = str(obj(data.customer)?.customer_id);
  if (!userId || !customerId) return;
  const known = await links.get(customerId);
  if (known === null) { await links.set(customerId, userId); log({ kind: "link_learned", eventType, webhookId, userId: safeOrUndefined(userId) }); }
  else if (known !== userId) log({ kind: "link_conflict", eventType, webhookId, userId: safeOrUndefined(userId) });
}
