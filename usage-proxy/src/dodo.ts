// Dodo Payments events for managed usage: checking that a webhook really came from Dodo, and turning a subscription event into the
// plan a person should have. It mirrors stripe.ts (pure checks first), and adds the handler a Worker would call. Dodo follows the
// Standard Webhooks scheme (https://docs.dodopayments.com/developer-resources/webhooks): headers webhook-id, webhook-timestamp and
// webhook-signature, an HMAC SHA256 over "<id>.<timestamp>.<raw body>" keyed with the base64 part of the whsec_ secret.
//
// Off unless the operator turns it on (see payments.ts and the README). No network, no secrets, and no request body is ever logged.
import { PLANS } from "./plans.ts";
import type { Entitlement } from "./stripe.ts";

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
export type DodoProducts = Record<string, string>;
export type ProductsParsed = { ok: true; products: DodoProducts } | { ok: false; message: string };
/** Reads the operator's table of Dodo product id to our plan name (JSON text, e.g. from the DODO_PRODUCTS setting). */
export function parseDodoProducts(text: string): ProductsParsed {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, message: "The Dodo product table is not valid JSON. It should look like {\"<dodo product id>\": \"pro\"}." }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "The Dodo product table must be an object that maps each Dodo product id to a plan name." };
  const products: DodoProducts = {};
  for (const [id, plan] of Object.entries(raw)) {
    if (!id || id === "__proto__") return { ok: false, message: "The Dodo product table has an empty or unusable product id." };
    if (typeof plan !== "string" || !Object.hasOwn(PLANS, plan)) return { ok: false, message: `The Dodo product table maps a product to "${safeText(plan)}", which is not one of our plans (${Object.keys(PLANS).join(", ")}).` };
    products[id] = plan;
  }
  return { ok: true, products };
}

// ---- what an event means ------------------------------------------------------------------------------------------------------------
/** The subscription event names Dodo's docs list (webhooks guide and subscription pages, 23 Oct 2026). */
export const DODO_SUBSCRIPTION_EVENTS = [
  "subscription.active", "subscription.updated", "subscription.past_due", "subscription.on_hold", "subscription.paused", "subscription.unpaused",
  "subscription.renewed", "subscription.plan_changed", "subscription.update_payment_method", "subscription.cancelled", "subscription.failed", "subscription.expired",
] as const;
/** The key checkout metadata carries, the same name as the Stripe path uses. */
export const USER_ID_KEY = "companion_user_id";

/** A plan for a person. `until` (ms) is set only for a grace period: after it, the person is on the free plan. */
export type DodoEntitlement = Entitlement & { until?: number };
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
  | { kind: "set"; entitlement: DodoEntitlement }
  | { kind: "ignore" }
  | { kind: "unknown_product"; productId: string; message: string; entitlement?: DodoEntitlement }
  | { kind: "unlinked" };

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const str = (x: unknown): string | null => (typeof x === "string" && x ? x : null);
/** Text that is safe to put in a log line or a message: a short identifier, or a placeholder. */
function safeText(x: unknown): string { return typeof x === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(x) ? x : "(unreadable)"; }
const safeOrUndefined = (x: unknown): string | undefined => (typeof x === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(x) ? x : undefined);

/** Who a payload belongs to: the checkout metadata first, then a link learned from a payment. */
async function ownerOf(data: Record<string, unknown>, links: LinkBook): Promise<string | null> {
  const fromMetadata = str(obj(data.metadata)?.[USER_ID_KEY]);
  if (fromMetadata) return fromMetadata;
  const customer = str(obj(data.customer)?.customer_id);
  return customer ? await links.get(customer) : null;
}

/**
 * What a Dodo event says a person's plan is. Rules, all leaning to not granting:
 *  - active, renewed, unpaused, updated, plan_changed: the mapped plan, only when the payload status is "active".
 *  - past_due (Dodo: access is kept in the grace period): the plan, but only until past_due_ends_at; no readable end means free.
 *  - on_hold, paused, failed, expired, cancelled: free at once. Dodo's docs say on_hold and paused remove access; they do not say whether
 *    a cancelled subscription keeps access to the end of the period, so we do not grant (a scheduled cancel shows as an updated event
 *    that is still "active", which keeps the plan until the cancelled or expired event arrives).
 *  - a product that is not in the table grants nothing; on plan_changed the person drops to free, as the old product is gone.
 */
export async function decideDodoEvent(event: unknown, products: DodoProducts, links: LinkBook): Promise<DodoDecision> {
  const e = obj(event), type = e?.type, data = obj(e?.data);
  if (typeof type !== "string" || !data || !(DODO_SUBSCRIPTION_EVENTS as readonly string[]).includes(type) || type === "subscription.update_payment_method") return { kind: "ignore" };
  const userId = await ownerOf(data, links);
  if (!userId) return { kind: "unlinked" };

  const status = typeof data.status === "string" ? data.status : "";
  const free: DodoDecision = { kind: "set", entitlement: FREE(userId) };
  const BAD = ["on_hold", "paused", "cancelled", "failed", "expired"];
  let wants: "grant" | "grace" | "free" | "ignore";
  switch (type) {
    case "subscription.on_hold": case "subscription.paused": case "subscription.failed": case "subscription.expired": case "subscription.cancelled": wants = "free"; break;
    case "subscription.past_due": wants = "grace"; break;
    default: wants = status === "active" ? "grant" : status === "past_due" ? "grace" : BAD.includes(status) ? "free" : "ignore";
  }
  if (wants === "ignore") return { kind: "ignore" };
  if (wants === "free") return free;

  const productId = str(data.product_id);
  const plan = productId && Object.hasOwn(products, productId) ? products[productId] : null;
  if (!productId || !plan || !Object.hasOwn(PLANS, plan)) {
    const named = productId ? `"${safeText(productId)}"` : "(none)";
    return {
      kind: "unknown_product", productId: productId ? safeText(productId) : "", entitlement: type === "subscription.plan_changed" ? FREE(userId) : undefined,
      message: `Dodo product ${named} is not in the product table, so it was given no plan. Add it to the product table (DODO_PRODUCTS) and Dodo will deliver this event again.`,
    };
  }
  if (wants === "grant") return { kind: "set", entitlement: { userId, plan, status: "active" } };
  const ends = Date.parse(String(data.past_due_ends_at)), at = Date.parse(String(e?.timestamp));
  if (!Number.isFinite(ends) || !Number.isFinite(at) || ends <= at) return free;
  return { kind: "set", entitlement: { userId, plan, status: "past_due", until: ends } };
}

// ---- once only, in order ---------------------------------------------------------------------------------------------------------
export interface DodoLedger {
  /** Take an event id. False when it is already taken or done. A real store must make this one atomic step. */
  claim(webhookId: string): Promise<boolean>;
  /** Give the id back, so Dodo's retry is handled again. */
  release(webhookId: string): Promise<void>;
  /** The time (ms) of the newest event applied for a person, or null. */
  lastAppliedAt(userId: string): Promise<number | null>;
  setLastAppliedAt(userId: string, ms: number): Promise<void>;
}
export class MemoryDodoLedger implements DodoLedger {
  // id -> when it was taken (ms). An id is only worth keeping while a signed copy of its event could still pass the time window
  // (the window is DODO_TIMESTAMP_TOLERANCE_SEC either side of the event's own time), so older ones are dropped and the list stays small.
  #ids = new Map<string, number>();
  #last = new Map<string, number>();
  constructor(private clock: () => number = Date.now) {}
  static readonly KEEP_MS = 3 * DODO_TIMESTAMP_TOLERANCE_SEC * 1000;
  size() { return this.#ids.size; }
  async claim(id: string) {
    const at = this.clock();
    for (const [k, v] of this.#ids) { if (at - v > MemoryDodoLedger.KEEP_MS) this.#ids.delete(k); else break; }   // oldest first
    if (this.#ids.has(id)) return false;
    this.#ids.set(id, at); return true;
  }
  async release(id: string) { this.#ids.delete(id); }
  async lastAppliedAt(userId: string) { return this.#last.get(userId) ?? null; }
  async setLastAppliedAt(userId: string, ms: number) { this.#last.set(userId, Math.max(ms, this.#last.get(userId) ?? 0)); }
}

/** What the handler logs, and nothing else. Short identifiers only: no body, no email, no name, no secret. */
export type SafeDodoEvent = {
  kind: "refused" | "bad_request" | "duplicate" | "stale" | "ignored" | "applied" | "unknown_product" | "unlinked" | "apply_failed" | "link_learned" | "link_conflict";
  reason?: string; eventType?: string; webhookId?: string; userId?: string; plan?: string; productId?: string;
};
export type DodoOutcome = "refused" | "bad_request" | "duplicate" | "stale" | "ignored" | "applied" | "unknown_product" | "unlinked" | "apply_failed";
export type DodoWebhookDeps = {
  /** The signing secret, read from the operator's environment. Empty means everything is refused. */
  secret: () => string;
  /** Dodo product id to plan name (see parseDodoProducts). */
  products: () => DodoProducts;
  ledger: DodoLedger;
  links: LinkBook;
  /** Writes the person's plan to the store. Throwing makes the answer 500, so Dodo retries. */
  apply: (e: DodoEntitlement) => Promise<void>;
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
      const decision = await decideDodoEvent(event, d.products(), d.links);
      if (decision.kind === "ignore") { log({ kind: "ignored", eventType, webhookId }); return answer(200, "ignored"); }
      if (decision.kind === "unlinked") {
        await d.ledger.release(verified.id);
        log({ kind: "unlinked", eventType, webhookId });
        return answer(503, "unlinked", "This event could not be matched to a person yet. Dodo will deliver it again.");
      }
      const entitlement = decision.entitlement;
      let outcome: DodoOutcome = "applied";
      if (entitlement) {
        outcome = await oneAtATime(entitlement.userId, async () => {
          const last = await d.ledger.lastAppliedAt(entitlement.userId);
          if (last !== null && at < last) return "stale" as const;
          await d.apply(entitlement); await d.ledger.setLastAppliedAt(entitlement.userId, at);
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
