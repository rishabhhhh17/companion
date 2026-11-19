// The payment routes (M116 step 4). Paying happens on Dodo's own pages in the person's browser; these routes only make the
// address to open, and the page the browser lands on afterwards. Pro and the report are granted only by a verified Dodo
// webhook (dodo.ts), never here.
//
//   POST /v1/checkout   {item: "pro_monthly" | "pro_yearly" | "report"}, with the sign in token. The server picks the product id
//                       from its own table, takes the owner from the token (never from the body), and asks Dodo for a checkout
//                       with that owner in its metadata and the account's email locked. Answers {url}. Writes nothing.
//   POST /v1/portal     with the sign in token: Dodo's billing portal for the customer id this server saved. Answers {url}.
//   GET  /paid          where Dodo sends the browser after paying. It drops the query (Dodo adds payment_id, status and the
//                       email there) with a 303 to /paid/done, keeps no copy, logs nothing, and grants nothing.
//   GET  /paid/done, /paid/cancelled   the small pages the person sees.
//
// Both POST routes refuse unless payments are switched on here (PAYMENTS_ON) and Dodo's webhook is served (PAYMENT_PROVIDER is
// dodo), so an old app cannot open a checkout that nothing would ever turn into Pro. Logs hold a kind, an owner id and the item.
import { planNow } from "./account-routes.ts";
import { PRO_INCLUDES_REPORT } from "./plans.ts";
import { createCheckout, createPortal, dodoMode, dodoSetup, type DodoApi } from "./dodo-api.ts";
import { isCheckoutItem, USER_ID_KEY, type DodoCatalog, type DodoEntitlement, type DodoWebhookDeps, type SubDetail } from "./dodo.ts";
import { error, jsonNoStore, readCapped } from "./http.ts";
import { PRODUCT } from "./names.ts";
import type { SafeEvent } from "./proxy.ts";
import { createRateLimiter } from "./ratelimit.ts";
import { countsNow, liveSub, type Billing, type DodoMode, type Store } from "./store.ts";
import { hashToken, tokenFromHeaders } from "./tokens.ts";
import { deletedKey } from "./deleted.ts";
import { secretProblem } from "./userid.ts";
import { OWNER_SIG_KEY, signOwner } from "./owner-sig.ts";

export const CHECKOUT_PATH = "/v1/checkout";
export const PORTAL_PATH = "/v1/portal";
export const PAID_PATH = "/paid";
export const PAID_DONE_PATH = "/paid/done";
export const PAID_CANCELLED_PATH = "/paid/cancelled";
/** F25, M116 section 9 call 3 (kept in plans.ts, so the account routes read the same one). */
export { PRO_INCLUDES_REPORT };
/** Checkout and portal presses per account a minute, counted in this server instance's memory (writes nothing). */
export const BILLING_PRESSES_PER_MINUTE = 10;
const BILLING_MAX_BODY_BYTES = 4096;
const BILLING_PATHS = new Set([CHECKOUT_PATH, PORTAL_PATH]);
/** True for the routes that read the store, so a store failure there gets the account sentence. */
export const isBillingPath = (path: string) => BILLING_PATHS.has(path);

export const PAYMENTS_OFF_WORDS = "Paying is not switched on yet. Nothing was charged.";
export const PAYMENTS_NOT_SET_UP_WORDS = `Paying is not set up on this ${PRODUCT} server yet. Nothing was charged.`;
export const ALREADY_PRO_WORDS = "You already have Pro. Use Manage billing to change it.";
export const PRO_HAS_REPORT_WORDS = "Pro already includes the report. You can start it from your project.";
export const CHECKOUT_FAILED_WORDS = "The checkout could not be opened. Nothing was charged. Try again in a moment.";
export const PORTAL_FAILED_WORDS = "Billing could not be opened just now. Try again in a moment.";
export const NO_BILLING_WORDS = "There is no billing account yet. It is made the first time you pay.";

export type BillingDeps = {
  store: Store;
  now: () => number;
  log: (e: SafeEvent) => void;
  /** PAYMENTS_ON. Missing means off. */
  paymentsOn?: () => boolean;
  /** PAYMENT_PROVIDER, as read (none, stripe or dodo). Only dodo serves a checkout. */
  provider?: () => string;
  /** The product table (DODO_PRODUCTS), or null when it is not set or not readable. */
  catalog: () => DodoCatalog | null;
  /** DODO_API_BASE and DODO_PAYMENTS_API_KEY. */
  dodoBase: () => string | undefined;
  dodoKey: () => string | undefined;
  fetch?: typeof fetch;
  /** METADATA_USER_ID_SECRET: signs the owner id in the checkout metadata (owner-sig.ts), the only metadata the webhook trusts.
   *  Missing or short: no checkout is made, since nothing it paid for could be matched to the person. */
  ownerSecret?: () => string | undefined;
  /** True while this account may press again (one limiter per server instance). Missing: one made here. */
  pressLimit?: (key: string, now: number) => boolean;
};

const pageHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex", "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" };
const redirectTo = (path: string) => new Response(null, { status: 303, headers: { location: path, ...pageHeaders } });
const page = (title: string, line: string) => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b0b0c;color:#f2f2f3}main{max-width:28rem;padding:2rem 1rem;text-align:center}h1{font-size:1.4rem;margin:0 0 .5rem}p{margin:0;color:#b9b9be}</style>
</head><body><main><h1>${title}</h1><p>${line}</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...pageHeaders } });

/** The return pages. They read nothing, write nothing and log nothing; a query is dropped with a redirect to the same page. */
export function paidPage(url: URL): Response | null {
  if (url.pathname === PAID_PATH) return redirectTo(PAID_DONE_PATH);
  if (url.pathname !== PAID_DONE_PATH && url.pathname !== PAID_CANCELLED_PATH) return null;
  if (url.search) return redirectTo(url.pathname);
  return url.pathname === PAID_DONE_PATH
    ? page("Thanks", `Go back to ${PRODUCT}: what you bought shows there in a moment. You can close this tab.`)
    : page("Nothing was charged", `You can close this tab and go back to ${PRODUCT}.`);
}

/** The payment routes. Answers null for any other request. */
export function createBillingRoutes(d: BillingDeps): (req: Request, url: URL) => Promise<Response | null> {
  const pressLimit = d.pressLimit ?? createRateLimiter({ limit: BILLING_PRESSES_PER_MINUTE, windowMs: 60_000 });
  const refuse = (reason: string, res: Response, userId?: string) => { d.log({ kind: "refused", reason, status: res.status, ...(userId ? { userId } : {}) }); return res; };
  const signInAgain = (reason: string) => refuse(reason, error(401, "authentication_error", `Sign in to ${PRODUCT} again.`));

  /** The switches, the token, the account and the press limit, shared by both routes. */
  async function who(req: Request): Promise<{ ok: true; userId: string; plan: string; mode: DodoMode; api: DodoApi } | { ok: false; res: Response }> {
    if (d.paymentsOn?.() !== true || d.provider?.() !== "dodo") return { ok: false, res: refuse("payments_off", error(503, "api_error", PAYMENTS_OFF_WORDS)) };
    const token = tokenFromHeaders(req.headers);
    if (!token) return { ok: false, res: signInAgain("no_token") };
    const now = d.now(), acct = await d.store.account(await hashToken(token), now);
    if (!acct) return { ok: false, res: signInAgain("unknown_token") };
    const u = acct.user;
    if (u.status === "suspended") return { ok: false, res: refuse("suspended", error(403, "permission_error", `Your ${PRODUCT} account is paused. If you think this is a mistake, you can appeal: see the acceptable use page.`), u.id) };
    if (u.status === "revoked" || u.status === "canceled") return { ok: false, res: signInAgain("inactive") };
    if (!pressLimit(u.id, now)) return { ok: false, res: refuse("billing_rate_limit", error(429, "rate_limit_error", "That was pressed many times. Wait a minute, then try again.", { "retry-after": "60" }), u.id) };
    const setup = dodoSetup(d.dodoBase(), d.dodoKey());
    if (!setup.ok) return { ok: false, res: refuse(`dodo_${setup.reason}`, error(503, "api_error", PAYMENTS_NOT_SET_UP_WORDS), u.id) };
    const mode = dodoMode(setup.base) ?? "test";
    return { ok: true, userId: u.id, plan: planNow(u, now, mode === "live").plan, mode, api: { base: setup.base, key: setup.key, fetch: d.fetch ?? fetch } };
  }

  async function checkout(req: Request, url: URL): Promise<Response> {
    const w = await who(req);
    if (!w.ok) return w.res;
    const bad = () => refuse("checkout_bad_body", error(400, "invalid_request_error", "That is not something you can buy here."), w.userId);
    if (Number(req.headers.get("content-length") ?? 0) > BILLING_MAX_BODY_BYTES) return bad();
    const raw = await readCapped(req, BILLING_MAX_BODY_BYTES);
    let item: unknown;
    try { item = raw === null ? undefined : (JSON.parse(raw) as { item?: unknown })?.item; } catch { item = undefined; }
    if (!isCheckoutItem(item)) return bad();   // only the item is read from the body: never a product id, an owner or an email
    const productId = d.catalog()?.items[item];
    if (!productId) return refuse("checkout_no_product", error(503, "api_error", PAYMENTS_NOT_SET_UP_WORDS), w.userId);
    const ownerSecret = d.ownerSecret?.();
    if (!ownerSecret || secretProblem(ownerSecret)) return refuse("checkout_no_owner_secret", error(503, "api_error", PAYMENTS_NOT_SET_UP_WORDS), w.userId);

    const now = d.now(), billing = await d.store.billingOf(w.userId);
    // Audit run 2, finding 5 re-attack: once Dodo is live, a test mode subscription is not Pro and does not refuse a real one.
    if (item !== "report" && billing.subs.some(([, s]) => countsNow(s, w.mode === "live") && liveSub(s, now))) return refuse("checkout_already_pro", error(409, "invalid_request_error", ALREADY_PRO_WORDS), w.userId);
    if (item === "report" && PRO_INCLUDES_REPORT && w.plan !== "free") return refuse("checkout_pro_has_report", error(409, "invalid_request_error", PRO_HAS_REPORT_WORDS), w.userId);
    const customerId = billing.customerMode === w.mode ? billing.customerId : null;   // an id from the other Dodo mode is unknown here
    const customer = customerId ? { customer_id: customerId } : billing.email ? { email: billing.email } : null;
    if (!customer) return refuse("checkout_no_email", error(409, "invalid_request_error", `Sign in to ${PRODUCT} again, then try once more.`), w.userId);

    const address = await createCheckout(w.api, {
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer,
      // The owner id is signed: Dodo copies this metadata onto the payment and subscription events, and the webhook trusts it
      // only with a good signature, because a static /buy/ link lets anyone set companion_user_id (audit run 2, finding 1).
      metadata: { [USER_ID_KEY]: w.userId, [OWNER_SIG_KEY]: await signOwner(w.userId, ownerSecret) },
      return_url: `${url.origin}${PAID_PATH}`,
      cancel_url: `${url.origin}${PAID_CANCELLED_PATH}`,
      feature_flags: { allow_customer_editing_email: false },
    });
    if (!address) return refuse("checkout_failed", error(502, "api_error", CHECKOUT_FAILED_WORDS), w.userId);
    d.log({ kind: "checkout", userId: w.userId, reason: item });
    return jsonNoStore({ url: address });
  }

  async function portal(req: Request): Promise<Response> {
    const w = await who(req);
    if (!w.ok) return w.res;
    // The customer comes from this server's own record, never from the app.
    const customerId = portalCustomer(await d.store.billingOf(w.userId), w.mode, d.now());
    if (!customerId) return refuse("portal_no_customer", error(404, "not_found_error", NO_BILLING_WORDS), w.userId);
    const address = await createPortal(w.api, customerId);
    if (!address) return refuse("portal_failed", error(502, "api_error", PORTAL_FAILED_WORDS), w.userId);
    d.log({ kind: "portal", userId: w.userId });
    return jsonNoStore({ url: address });
  }

  return async (req, url) => {
    if (req.method === "GET") return paidPage(url);
    if (req.method === "POST" && url.pathname === CHECKOUT_PATH) return checkout(req, url);
    if (req.method === "POST" && url.pathname === PORTAL_PATH) return portal(req);
    return null;
  };
}

/** The customer whose billing portal to open, from this Dodo mode only: the one of the newest live subscription (so a person
 *  whose newer payment saved a second customer id still reaches the subscription that charges them), else the one saved last. */
export function portalCustomer(b: Billing, mode: DodoMode, now: number): string | null {
  const live = b.subs.map(([, s]) => s).filter((s) => s.customerId && (s.customerMode ?? "test") === mode && liveSub(s, now));
  if (live.length) return live.reduce((a, s) => (s.at > a.at ? s : a)).customerId ?? null;
  return b.customerMode === mode ? b.customerId : null;
}

/** What the Dodo webhook writes, on any store: the plan per subscription (the owner's is the best of them), the customer id,
 *  and the report credits. M116 step 5: with the user id secret, it also knows a deleted account (deleted.ts), whose late
 *  events change nothing; money that still reached Dodo for one is kept as a refund line for the operator. */
export function storeHooks(store: Store, userIdSecret?: () => string | undefined): Pick<DodoWebhookDeps, "apply" | "reports" | "saveCustomer" | "deleted" | "refundNeeded" | "ownerSecret"> {
  return {
    // The same secret checks the signed owner id in checkout metadata (owner-sig.ts). Without it no metadata is trusted.
    ownerSecret: () => userIdSecret?.(),
    deleted: async (userId, now) => {
      const secret = userIdSecret?.();
      return !!secret && !secretProblem(secret) && store.isDeletedOwner(userId, await deletedKey(userId, secret), now);
    },
    refundNeeded: (r) => store.flagRefund(r),
    apply: (e: DodoEntitlement, at: number, detail?: SubDetail, mode?: DodoMode) => detail
      ? store.applySubscription(e.userId, detail.subscriptionId, {
        plan: e.plan, status: e.status, ...(e.until !== undefined ? { until: e.until } : {}),
        // Audit run 2, finding 5 re-attack: the subscription keeps its Dodo mode, so a test card's Pro never counts once live.
        mode: detail.mode ?? mode ?? "test",
        ...(e.status === "active" && detail.renewsOn !== undefined ? { renewsOn: detail.renewsOn } : {}),
        ...(detail.customerId ? { customerId: detail.customerId, customerMode: detail.customerMode ?? "test" } : {}),
      }, at)
      : (store.setOwnerPlan?.(e.userId, { plan: e.plan, status: e.status, ...(e.until !== undefined ? { until: e.until } : {}), mode: mode ?? "test" }, at) ?? Promise.resolve(false)),
    reports: { add: (userId, paymentId, at, mode) => store.addReport(userId, paymentId, at, mode), remove: (paymentId, _why, at) => store.removeReport(paymentId, at) },
    saveCustomer: (userId, customerId, mode) => store.saveCustomer(userId, customerId, mode),
  };
}
