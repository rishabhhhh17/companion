// The Cloudflare Worker (M99): the one entry that receives every request and hands it to the parts already built and tested:
// the proxy (switch, token, plan, budget, forward, meter), Google sign in, the payment webhook the operator chose, and the
// operator's suspend and restore. It is not deployed. With the switch off, which is the default, it forwards nothing.
//
// What is set where (never in this repo):
//   PROXY_ON                  the switch. Off unless it is exactly on, 1 or true. Set it with `wrangler secret put PROXY_ON`.
//                             M116: only model requests sit behind it. Sign in, /v1/me and sign out work while it is off.
//   PAYMENTS_ON               M116: the payments switch, off the same way. /v1/me tells the app; checkout and portal check it.
//   LOOP_ON                   M100: the fixing loop's switch, off the same way. Off, a request with the loop's tools is refused
//                             for every sign in token. Turned on only by the go live checklist.
//   ANTHROPIC_API_KEY         Squibby's key. Without it nothing is forwarded. Needed to deploy only once PROXY_ON is set.
//   METADATA_USER_ID_SECRET   the key for the opaque metadata.user_id (userid.ts), and (under its own label) for the sign in
//                             nonce (nonce.ts). Without it nothing is forwarded and nobody can sign in.
//   GOOGLE_CLIENT_ID          Sign in with Google. Without it the sign in route answers 503.
//   PAYMENT_PROVIDER          none (the default, in wrangler.toml), or dodo. Stripe's webhook is not built here.
//   DODO_WEBHOOK_SECRET       test mode's webhook signing secret. An event it verifies is always kept as test mode.
//   DODO_WEBHOOK_SECRET_LIVE  live mode's webhook signing secret. Only an event it verifies is kept as live mode (audit run 2,
//                             finding 5, re-attack round 1): an event's mode comes from the secret that verified it, never from
//                             DODO_API_BASE, because the address and the secrets change in separate steps at go live.
//   DODO_PRODUCTS             the product table (dodo.ts).
//   DODO_PAYMENTS_API_KEY     M116: Dodo's API key, for checkouts and the billing portal. Needed to deploy once payments are on.
//   DODO_API_BASE             M116: Dodo's address, a plain var in wrangler.toml: https://test.dodopayments.com (the default)
//                             or https://live.dodopayments.com. It must agree with the key (dodo_test_ or dodo_live_), or no
//                             checkout or portal is made (dodo-api.ts).
//   OPERATOR_KEY              the operator's own key for POST /v1/operator (suspend and restore, M116: `usage` and `release`).
//                             Without it that route is not served. scripts/usage-report.ts reads it from the founder's Keychain.
//   RELEASES_REPO             M116: the public releases repo (owner/name), a plain var. `release set` takes only a file there.
//   TEST_PAYERS               audit run 2, finding 5: owner ids (google:<sub>), separated by commas, that keep their paid
//                             plan's limits while Dodo is in test mode. Everyone else's paid plan has Free's limits there,
//                             because anyone can pay with a test card. Not needed once Dodo is live.
//   UPSTREAM_BASE             only for `wrangler dev` against a stand in model on this machine (https only, loopback aside).
//   GOOGLE_KEYS_URL           M116 step 6, only for `wrangler dev`: where Google's key set is read from, so a stand in Google on
//                             this machine (scripts/stand-in-google.ts) can sign the ID tokens of a local run. Used only when the
//                             request's address and this address are both this machine; otherwise Google's own keys.
//   DEV_TOKENS                retired in M116 step 6: it served POST /v1/dev/token (a test token for a made up owner). A local
//                             run now signs in through the stand in Google instead, so that route is gone. The name stays in
//                             DEV_ONLY_SETTINGS so a leftover is still noticed.
// scripts/deploy.sh --apply refuses while any of DEV_ONLY_SETTINGS (UPSTREAM_BASE, GOOGLE_KEYS_URL, DEV_TOKENS) is set on
// Cloudflare, or is a var in wrangler.toml or the dry run's bindings.
// Logs are the SafeEvent lines the proxy and the webhook already make: ids, reasons, counts and dollars, never a body or a secret.
import { makeTeamRoutes } from "./team-routes.ts";
import { hashToken } from "./tokens.ts";
import { DAILY_LINKS, makeLinkRoutes, type LinkStore } from "./receipt-links.ts";
import { createProxy, parseTestPayers, storeFailed, type SafeEvent } from "./proxy.ts";
import { createGoogleVerifier } from "./google.ts";
import { createDodoWebhook, parseDodoCatalog, constantTimeEqual, type SafeDodoEvent } from "./dodo.ts";
import { createBillingRoutes, isBillingPath, storeHooks, BILLING_PRESSES_PER_MINUTE } from "./billing-routes.ts";
import { dodoMode, dodoSetup, paymentProducts } from "./dodo-api.ts";
import { paymentProviderFromSetting, webhookRouteFor } from "./payments.ts";
import { runOperator } from "./operator.ts";
import { accountStoreFailed, isAccountPath } from "./account-routes.ts";
import { USER_ID_SECRET_SETTING } from "./userid.ts";
import { callObject, DurableDodoLedger, DurableLinkBook, DurableStore, OWNER, type NamespaceLike } from "./store-do.ts";
import { PRODUCT } from "./names.ts";
import { createRateLimiter, SIGNIN_TRIES_PER_MINUTE } from "./ratelimit.ts";
import { REQUESTS_PER_MINUTE } from "./plans.ts";
import { createUpdateRoute, RELEASES_REPO_SETTING, UPDATE_PATH_PREFIX } from "./updates.ts";

export { StoreObject } from "./store-do.ts";

export type Env = {
  STORE: NamespaceLike;
  PROXY_ON?: string;
  LOOP_ON?: string;
  PAYMENTS_ON?: string;
  /** M123 slice 5: the share link switch, off the same way, and the KV namespace that keeps the pages for 30 days. */
  SHARE_ON?: string;
  /** M124: the teams switch, off the same way. */
  TEAMS_ON?: string;
  RECEIPTS?: LinkStore;
  DODO_PAYMENTS_API_KEY?: string;
  DODO_API_BASE?: string;
  ANTHROPIC_API_KEY?: string;
  METADATA_USER_ID_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  PAYMENT_PROVIDER?: string;
  DODO_WEBHOOK_SECRET?: string;
  DODO_WEBHOOK_SECRET_LIVE?: string;
  DODO_PRODUCTS?: string;
  OPERATOR_KEY?: string;
  RELEASES_REPO?: string;
  UPSTREAM_BASE?: string;
  GOOGLE_KEYS_URL?: string;
  TEST_PAYERS?: string;
};
export type Ctx = { waitUntil(p: Promise<unknown>): void };

/** M116: the secrets a real deploy needs, in three lists. scripts/deploy.sh --apply refuses unless each needed one is set.
 *  Always: accounts and the operator. */
export const ALWAYS_SECRETS = ["METADATA_USER_ID_SECRET", "OPERATOR_KEY", "GOOGLE_CLIENT_ID"] as const;
/** Only once forwarding is on (PROXY_ON is set): Squibby's Anthropic key. Until then the server holds no Anthropic key at all. */
export const FORWARDING_SECRETS = ["ANTHROPIC_API_KEY"] as const;
/** Only once payments are on (PAYMENTS_ON is set, or PAYMENT_PROVIDER is dodo) on Dodo's test address: Dodo's API key, test
 *  mode's webhook secret and the product table. */
export const PAYMENT_SECRETS = ["DODO_PAYMENTS_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_PRODUCTS"] as const;
/** The same on Dodo's live address (deploy.sh --live-payments): live mode's webhook secret in place of test mode's. Audit run 2,
 *  finding 5, re-attack round 1: so the live address is never deployed before live mode's secret is set. */
export const LIVE_PAYMENT_SECRETS = ["DODO_PAYMENTS_API_KEY", "DODO_WEBHOOK_SECRET_LIVE", "DODO_PRODUCTS"] as const;
export const ALL_SECRETS = [...ALWAYS_SECRETS, ...FORWARDING_SECRETS, ...PAYMENT_SECRETS, "DODO_WEBHOOK_SECRET_LIVE"] as const;
export const STATUS_PATH = "/v1/status";
export const OPERATOR_PATH = "/v1/operator";
/** Settings that exist only for a local run (DEV_TOKENS is retired and kept only so a leftover is refused). A real deploy refuses
 *  while any of them is set on Cloudflare. */
export const DEV_ONLY_SETTINGS = ["DEV_TOKENS", "UPSTREAM_BASE", "GOOGLE_KEYS_URL"] as const;
/** The operator's key must be at least this long, like the user id secret. */
export const MIN_OPERATOR_KEY_CHARS = 32;
const OPERATOR_MAX_BODY = 8192;   // a release's notes and signature fit

/** M100 review: the fixing loop's switch (LOOP_ON), read the same way as the main one: off unless on, 1 or true. */
export function loopSwitchOn(value: unknown): boolean { return switchOn(value); }

/** The switch, from its setting. Anything but on, 1 or true (spaces and case aside) is off, and so is no setting at all. */
export function switchOn(value: unknown): boolean {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "on" || v === "1" || v === "true";
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const logLine = (e: SafeEvent | SafeDodoEvent | { kind: "operator"; code: number } | { kind: "refused"; reason: string }) => console.log(JSON.stringify(e));

type Parts = { proxy: (req: Request) => Promise<Response>; dodo: (req: Request) => Promise<Response>; billing: (req: Request, url: URL) => Promise<Response | null>; update: (req: Request, url: URL) => Promise<Response | null>; store: DurableStore };
// Google's keys are fetched once per server instance and kept as long as Google says, so the checker is kept per client id
// (and per key address: Google's own, or a local run's stand in).
// Everything else is made fresh for each request (it is cheap), so one request's waitUntil is never used for another's work.
const googleCheckers = new Map<string, ReturnType<typeof createGoogleVerifier>>();
function googleFor(clientId: string, now: () => number, jwksUrl?: string) {
  const at = `${clientId}\n${jwksUrl ?? ""}`;
  let g = googleCheckers.get(at);
  if (!g) { g = createGoogleVerifier({ clientId, now, ...(jwksUrl ? { jwksUrl } : {}) }); googleCheckers.set(at, g); }
  return g;
}

// M116: sign in tries per address, counted in this server instance's memory (writes nothing). See ratelimit.ts.
const signinTries = createRateLimiter({ limit: SIGNIN_TRIES_PER_MINUTE, windowMs: 60_000 });
// M116: checkout and portal presses per account, the same way.
const billingPresses = createRateLimiter({ limit: BILLING_PRESSES_PER_MINUTE, windowMs: 60_000 });
// S3: model requests per sign in token, refused ones too, counted before the store is asked anything.
const proxyTries = createRateLimiter({ limit: REQUESTS_PER_MINUTE, windowMs: 60_000 });

function partsFor(env: Env, ctx: Ctx, now: () => number, url: URL): Parts {
  const store = new DurableStore(env.STORE, now, env.RECEIPTS);
  const proxy = createProxy({
    store,
    anthropicKey: env.ANTHROPIC_API_KEY ?? "",
    userIdSecret: env.METADATA_USER_ID_SECRET,
    enabled: () => switchOn(env.PROXY_ON),
    loopOn: () => loopSwitchOn(env.LOOP_ON),
    paymentsOn: () => switchOn(env.PAYMENTS_ON),
    signinLimit: (address) => signinTries(address, now()),
    requestLimit: (tokenHash) => proxyTries(tokenHash, now()),
    now,
    log: logLine,
    ...(env.UPSTREAM_BASE ? { upstream: env.UPSTREAM_BASE } : {}),
    ...(env.GOOGLE_CLIENT_ID ? { googleSignIn: googleFor(env.GOOGLE_CLIENT_ID, now, localGoogleKeys(url, env)) } : {}),
    waitUntil: (p) => ctx.waitUntil(p),
    // Audit run 2, finding 5: anything but Dodo's live address counts as test mode, where a paid plan has Free's limits.
    paymentsTestMode: () => dodoMode(env.DODO_API_BASE) !== "live",
    testPayers: () => parseTestPayers(env.TEST_PAYERS),
  });
  const catalog = () => { const p = parseDodoCatalog(env.DODO_PRODUCTS ?? ""); return p.ok ? p.catalog : null; };
  const dodoApi = () => { const s = dodoSetup(env.DODO_API_BASE, env.DODO_PAYMENTS_API_KEY); return s.ok ? { base: s.base, key: s.key, fetch } : null; };
  const dodo = createDodoWebhook({
    // Audit run 2, finding 5, re-attack round 1: an event's Dodo mode is the mode of the secret that verified it. Test mode's
    // secret only ever gives test, so a test card's event is never kept as live, whatever DODO_API_BASE says when it arrives.
    secret: () => env.DODO_WEBHOOK_SECRET ?? "",
    liveSecret: () => env.DODO_WEBHOOK_SECRET_LIVE ?? "",
    products: () => catalog()?.plans ?? {},
    reportIds: () => catalog()?.reports ?? [],
    ledger: new DurableDodoLedger(env.STORE, now),
    links: new DurableLinkBook(env.STORE),
    // M116: the plan is kept per subscription on the owner's own object, and an event older than one already applied for that
    // subscription is skipped there in the same step (false: answered and logged as stale). The owner's plan is the best of
    // their subscriptions. Report credits are keyed by payment_id.
    ...storeHooks(store, () => env.METADATA_USER_ID_SECRET),
    paymentProducts: async (paymentId) => { const api = dodoApi(); return api ? paymentProducts(api, paymentId) : null; },
    now,
    log: logLine,
  });
  const billing = createBillingRoutes({
    store, now, log: logLine,
    paymentsOn: () => switchOn(env.PAYMENTS_ON),
    provider: () => paymentProviderFromSetting(env.PAYMENT_PROVIDER),
    catalog, dodoBase: () => env.DODO_API_BASE, dodoKey: () => env.DODO_PAYMENTS_API_KEY,
    ownerSecret: () => env.METADATA_USER_ID_SECRET,
    pressLimit: billingPresses,
  });
  const update = createUpdateRoute({ store, log: logLine });
  return { proxy, dodo, billing, update, store };
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
  // DODO_API_BASE (audit run 2, finding 5, round 3): the usage view and the refund lines count only live mode payments once live.
  const r = await runOperator(argv as string[], { [USER_ID_SECRET_SETTING]: env.METADATA_USER_ID_SECRET, [RELEASES_REPO_SETTING]: env.RELEASES_REPO, DODO_API_BASE: env.DODO_API_BASE }, store, now);
  logLine({ kind: "operator", code: r.code });
  // 200 only when the step happened (or a dry run worked); otherwise 422 with the same body, so a script can tell from the status.
  return json(r.code === 0 ? 200 : 422, r);
}

const loopback = (host: string) => host === "127.0.0.1" || host === "localhost" || host === "[::1]";
/** M116 step 6, local runs only: the stand in Google's key address, when the request and that address are both this machine
 *  and it is plain http(s). Anything else (a real address, a key address elsewhere, no setting) means Google's own keys. */
function localGoogleKeys(url: URL, env: Env): string | undefined {
  if (!env.GOOGLE_KEYS_URL || !loopback(url.hostname)) return undefined;
  let keys: URL;
  try { keys = new URL(env.GOOGLE_KEYS_URL); } catch { return undefined; }
  return (keys.protocol === "http:" || keys.protocol === "https:") && loopback(keys.hostname) ? keys.href : undefined;
}

/** The Worker. `now` is for tests only. A store step that fails anywhere (a Durable Object call that throws) is answered here
 *  with a plain 503, never left to Cloudflare's own error page, and logged by its reason only. */
export async function handle(req: Request, env: Env, ctx: Ctx, now: () => number = Date.now): Promise<Response> {
  try { return await route(req, env, ctx, now); }
  catch {
    logLine({ kind: "refused", reason: "store_failed" });   // never the error itself: it could carry something it should not
    const path = new URL(req.url).pathname;
    if (path === OPERATOR_PATH) return json(503, { error: "The store could not finish that step. Nothing was changed. Try again in a moment." });
    if (path.startsWith("/webhooks/")) return json(503, { outcome: "apply_failed", message: "Something went wrong on our side. Nothing was changed, and the sender can deliver this again." });
    if (path.startsWith(UPDATE_PATH_PREFIX)) return json(503, { error: "Updates could not be checked just now. Try again later." });
    if (isAccountPath(path) || isBillingPath(path)) return accountStoreFailed();
    return storeFailed();
  }
}

async function route(req: Request, env: Env, ctx: Ctx, now: () => number): Promise<Response> {
  const url = new URL(req.url);
  const parts = partsFor(env, ctx, now, url);
  if (req.method === "GET" && url.pathname === STATUS_PATH) return json(200, { service: `${PRODUCT} usage`, on: switchOn(env.PROXY_ON) });
  if (req.method === "POST" && url.pathname === OPERATOR_PATH) return operatorRoute(req, env, parts.store, now);
  // M116 step 5: the update feed, with no token, ahead of everything that reads one.
  const update = await parts.update(req, url);
  if (update) return update;
  // M123 slice 5: a receipt shared as a link (signed in only, off unless SHARE_ON and RECEIPTS are set).
  const shared = await makeLinkRoutes({
    ...(env.RECEIPTS ? { links: env.RECEIPTS } : {}), on: () => switchOn(env.SHARE_ON), origin: url.origin, now,
    madeLink: (ownerId, id, at) => callObject<boolean>(env.STORE, OWNER(ownerId), "owner.linkMade", { id, now: at, max: DAILY_LINKS }),
    userOf: async (t) => { const a = await parts.store.account(await hashToken(t), now()); return a ? { id: a.user.id, active: a.user.status !== "suspended" && a.user.status !== "revoked" && a.user.status !== "canceled" } : null; },
  })(req, url);
  if (shared) return shared;
  // M124: teams (signed in only, off unless TEAMS_ON). Receipts and rules only, never a model request.
  const teams = await makeTeamRoutes({
    ns: env.STORE, on: () => switchOn(env.TEAMS_ON), now,
    userOf: async (t) => { const a = await parts.store.account(await hashToken(t), now()); return a ? { id: a.user.id, active: a.user.status !== "suspended" && a.user.status !== "revoked" && a.user.status !== "canceled" } : null; },
  })(req, url);
  if (teams) return teams;
  // M116: checkout, portal and the /paid return page, ahead of the proxy and its switch.
  const billing = await parts.billing(req, url);
  if (billing) return billing;
  const provider = paymentProviderFromSetting(env.PAYMENT_PROVIDER);
  const hook = webhookRouteFor(provider, req.method, url.pathname);
  // Audit run 2, finding 4, close round 3 (the same pattern): the event's id is claimed before the plan is written, so a resend
  // reads as a duplicate. A Dodo request that went away in between left the event claimed and never applied. Its work is kept
  // running, handed over before the first step starts, and the answer waits for that same work.
  if (hook === "dodo") { const work = parts.dodo(req); ctx.waitUntil(work.catch(() => {})); return work; }
  if (hook === "stripe") return json(503, { outcome: "refused", message: "Stripe's webhook is not built on this server. Dodo Payments is the provider." });
  return parts.proxy(req);
}

export default { fetch: (req: Request, env: Env, ctx: Ctx) => handle(req, env, ctx) };
