// The Cloudflare Worker (M99): the one entry that receives every request and hands it to the parts already built and tested:
// the proxy (switch, token, plan, budget, forward, meter), Google sign in, the payment webhook the operator chose, and the
// operator's suspend and restore. It is not deployed. With the switch off, which is the default, it forwards nothing.
//
// What is set where (never in this repo):
//   PROXY_ON                  the switch. Off unless it is exactly on, 1 or true. Set it with `wrangler secret put PROXY_ON`.
//   LOOP_ON                   M100: the fixing loop's switch, off the same way. Off, a request with the loop's tools is refused
//                             for every sign in token. Turned on only by the go live checklist.
//   ANTHROPIC_API_KEY         Squibby's key. Without it nothing is forwarded.
//   METADATA_USER_ID_SECRET   the key for the opaque metadata.user_id (userid.ts). Without it nothing is forwarded.
//   GOOGLE_CLIENT_ID          Sign in with Google. Without it the sign in route answers 503.
//   PAYMENT_PROVIDER          none (the default, in wrangler.toml), or dodo. Stripe's webhook is not built here.
//   DODO_WEBHOOK_SECRET, DODO_PRODUCTS   Dodo's signing secret and the product table (dodo.ts).
//   OPERATOR_KEY              the operator's own key for POST /v1/operator (suspend and restore). Without it that route is not served.
//   UPSTREAM_BASE             only for `wrangler dev` against a stand in model on this machine (https only, loopback aside).
//   DEV_TOKENS                only for `wrangler dev`: "on" serves POST /v1/dev/token, which gives a test sign in token, and only
//                             when the request's address and UPSTREAM_BASE are both this machine. scripts/deploy.sh --apply
//                             refuses while DEV_TOKENS or UPSTREAM_BASE is set on Cloudflare, or is a var in wrangler.toml
//                             or the dry run's bindings.
// Logs are the SafeEvent lines the proxy and the webhook already make: ids, reasons, counts and dollars, never a body or a secret.
import { createProxy, storeFailed, type SafeEvent } from "./proxy.ts";
import { createGoogleVerifier } from "./google.ts";
import { createDodoWebhook, parseDodoProducts, constantTimeEqual, type SafeDodoEvent } from "./dodo.ts";
import { paymentProviderFromSetting, webhookRouteFor } from "./payments.ts";
import { runOperator } from "./operator.ts";
import { issueToken } from "./accounts.ts";
import { USER_ID_SECRET_SETTING } from "./userid.ts";
import { DurableDodoLedger, DurableLinkBook, DurableStore, type NamespaceLike } from "./store-do.ts";
import { PRODUCT } from "./names.ts";

export { StoreObject } from "./store-do.ts";

export type Env = {
  STORE: NamespaceLike;
  PROXY_ON?: string;
  LOOP_ON?: string;
  ANTHROPIC_API_KEY?: string;
  METADATA_USER_ID_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  PAYMENT_PROVIDER?: string;
  DODO_WEBHOOK_SECRET?: string;
  DODO_PRODUCTS?: string;
  OPERATOR_KEY?: string;
  UPSTREAM_BASE?: string;
  DEV_TOKENS?: string;
};
export type Ctx = { waitUntil(p: Promise<unknown>): void };

/** Every secret the server needs before a real deploy. scripts/deploy.sh --apply refuses unless each is set. */
export const REQUIRED_SECRETS = ["ANTHROPIC_API_KEY", "METADATA_USER_ID_SECRET", "OPERATOR_KEY", "GOOGLE_CLIENT_ID", "DODO_WEBHOOK_SECRET", "DODO_PRODUCTS"] as const;
export const STATUS_PATH = "/v1/status";
export const OPERATOR_PATH = "/v1/operator";
export const DEV_TOKEN_PATH = "/v1/dev/token";
/** Settings that exist only for a local run. A real deploy refuses while either is set on Cloudflare. */
export const DEV_ONLY_SETTINGS = ["DEV_TOKENS", "UPSTREAM_BASE"] as const;
/** The operator's key must be at least this long, like the user id secret. */
export const MIN_OPERATOR_KEY_CHARS = 32;
const OPERATOR_MAX_BODY = 4096;

/** M100 review: the fixing loop's switch (LOOP_ON), read the same way as the main one: off unless on, 1 or true. */
export function loopSwitchOn(value: unknown): boolean { return switchOn(value); }

/** The switch, from its setting. Anything but on, 1 or true (spaces and case aside) is off, and so is no setting at all. */
export function switchOn(value: unknown): boolean {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "on" || v === "1" || v === "true";
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const logLine = (e: SafeEvent | SafeDodoEvent | { kind: "operator"; code: number } | { kind: "refused"; reason: string }) => console.log(JSON.stringify(e));

type Parts = { proxy: (req: Request) => Promise<Response>; dodo: (req: Request) => Promise<Response>; store: DurableStore };
// Google's keys are fetched once per server instance and kept as long as Google says, so the checker is kept per client id.
// Everything else is made fresh for each request (it is cheap), so one request's waitUntil is never used for another's work.
const googleCheckers = new Map<string, ReturnType<typeof createGoogleVerifier>>();
function googleFor(clientId: string, now: () => number) {
  let g = googleCheckers.get(clientId);
  if (!g) { g = createGoogleVerifier({ clientId, now }); googleCheckers.set(clientId, g); }
  return g;
}

function partsFor(env: Env, ctx: Ctx, now: () => number): Parts {
  const store = new DurableStore(env.STORE, now);
  const proxy = createProxy({
    store,
    anthropicKey: env.ANTHROPIC_API_KEY ?? "",
    userIdSecret: env.METADATA_USER_ID_SECRET,
    enabled: () => switchOn(env.PROXY_ON),
    loopOn: () => loopSwitchOn(env.LOOP_ON),
    now,
    log: logLine,
    ...(env.UPSTREAM_BASE ? { upstream: env.UPSTREAM_BASE } : {}),
    ...(env.GOOGLE_CLIENT_ID ? { googleSignIn: googleFor(env.GOOGLE_CLIENT_ID, now) } : {}),
    waitUntil: (p) => ctx.waitUntil(p),
  });
  const products = () => { const p = parseDodoProducts(env.DODO_PRODUCTS ?? ""); return p.ok ? p.products : {}; };
  const dodo = createDodoWebhook({
    secret: () => env.DODO_WEBHOOK_SECRET ?? "",
    products,
    ledger: new DurableDodoLedger(env.STORE, now),
    links: new DurableLinkBook(env.STORE),
    // The plan goes on the owner's own object, and an event older than one already applied is skipped there in the same step.
    // False: another server instance already applied a newer event for this owner, so this one is answered and logged as stale.
    apply: (e, at) => store.setOwnerPlan(e.userId, { plan: e.plan, status: e.status, ...(e.until !== undefined ? { until: e.until } : {}) }, at),
    now,
    log: logLine,
  });
  return { proxy, dodo, store };
}

async function operatorRoute(req: Request, env: Env, store: DurableStore, now: () => number): Promise<Response> {
  const want = env.OPERATOR_KEY ?? "";
  if (want.trim().length < MIN_OPERATOR_KEY_CHARS) return json(404, { error: "Not found." });   // not served at all without the key
  const given = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!constantTimeEqual(given, want)) { logLine({ kind: "refused", reason: "operator_key" }); return json(401, { error: "That key is not the operator's key." }); }
  if (Number(req.headers.get("content-length") ?? 0) > OPERATOR_MAX_BODY) return json(400, { error: "That request is too big." });
  let argv: unknown;
  try { const text = await req.text(); if (text.length > OPERATOR_MAX_BODY) return json(400, { error: "That request is too big." }); argv = (JSON.parse(text) as { argv?: unknown })?.argv; } catch { argv = undefined; }
  if (!Array.isArray(argv) || !argv.every((a) => typeof a === "string")) return json(400, { error: "Send {\"argv\": [...]} with the same options as scripts/suspend.ts." });
  const r = await runOperator(argv as string[], { [USER_ID_SECRET_SETTING]: env.METADATA_USER_ID_SECRET }, store, now);
  logLine({ kind: "operator", code: r.code });
  // 200 only when the step happened (or a dry run worked); otherwise 422 with the same body, so a script can tell from the status.
  return json(r.code === 0 ? 200 : 422, r);
}

const loopback = (host: string) => host === "127.0.0.1" || host === "localhost" || host === "[::1]";
/** Local runs only: a test sign in token for a made up owner, so `wrangler dev` can serve one metered request to a stand in. */
function devTokenServed(url: URL, env: Env): boolean {
  if (env.DEV_TOKENS !== "on" || !env.UPSTREAM_BASE) return false;
  let up: URL;
  try { up = new URL(env.UPSTREAM_BASE); } catch { return false; }
  return loopback(url.hostname) && loopback(up.hostname);
}

/** The Worker. `now` is for tests only. A store step that fails anywhere (a Durable Object call that throws) is answered here
 *  with a plain 503, never left to Cloudflare's own error page, and logged by its reason only. */
export async function handle(req: Request, env: Env, ctx: Ctx, now: () => number = Date.now): Promise<Response> {
  try { return await route(req, env, ctx, now); }
  catch {
    logLine({ kind: "refused", reason: "store_failed" });   // never the error itself: it could carry something it should not
    const path = new URL(req.url).pathname;
    if (path === OPERATOR_PATH || path === DEV_TOKEN_PATH) return json(503, { error: "The store could not finish that step. Nothing was changed. Try again in a moment." });
    if (path.startsWith("/webhooks/")) return json(503, { outcome: "apply_failed", message: "Something went wrong on our side. Nothing was changed, and the sender can deliver this again." });
    return storeFailed();
  }
}

async function route(req: Request, env: Env, ctx: Ctx, now: () => number): Promise<Response> {
  const url = new URL(req.url);
  const parts = partsFor(env, ctx, now);
  if (req.method === "GET" && url.pathname === STATUS_PATH) return json(200, { service: `${PRODUCT} usage`, on: switchOn(env.PROXY_ON) });
  if (req.method === "POST" && url.pathname === OPERATOR_PATH) return operatorRoute(req, env, parts.store, now);
  if (req.method === "POST" && url.pathname === DEV_TOKEN_PATH && devTokenServed(url, env)) {
    const t = await issueToken(parts.store, "dev:stand-in", "pro");
    return t.ok ? json(200, { token: t.token, owner: "dev:stand-in" }) : json(403, { error: t.message });
  }
  const provider = paymentProviderFromSetting(env.PAYMENT_PROVIDER);
  const hook = webhookRouteFor(provider, req.method, url.pathname);
  if (hook === "dodo") return parts.dodo(req);
  if (hook === "stripe") return json(503, { outcome: "refused", message: "Stripe's webhook is not built on this server. Dodo Payments is the provider." });
  return parts.proxy(req);
}

export default { fetch: (req: Request, env: Env, ctx: Ctx) => handle(req, env, ctx) };
