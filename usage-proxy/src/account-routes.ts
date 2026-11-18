// The account routes (M116 step 2). They are served ahead of the forwarding switch (PROXY_ON) and the Anthropic key, so a
// person can make an account, see their plan and sign out while forwarding is off. Model requests stay behind the switch.
//
//   GET  /v1/signin/nonce   a fresh nonce the server signed, good for 10 minutes. Writes nothing.
//   POST /v1/signin/google  {idToken}: Google's ID token in, a sign in token out. The token's nonce claim must be one this
//                           server signed in the last 10 minutes and never used. Keeps the email on the owner, never the name
//                           or picture. Limited per address (SIGNIN_TRIES_PER_MINUTE).
//   GET  /v1/me             the plan, its status and dates, use as a share of the limits, and the switches. Writes nothing.
//   POST /v1/signout        stops the token that called it.
//   POST /v1/signout/all    stops every token of the owner.
//   GET  /v1/switches       M116 step 5: {payments, fixing} from PAYMENTS_ON and LOOP_ON. No token. Reads no store.
//   POST /v1/report/use     M116 step 5: spends one report credit (the oldest), or allows it on Pro while Pro includes the
//                           report. {useId} makes a retry spend nothing more. The app starts a report only after a yes here.
//   POST /v1/account/delete M116 step 5: {confirm: true}. Refused while a subscription could still charge (active, past due,
//                           on hold, paused; a failed one never charges) or a model request runs. Keeps only the owner's
//                           suspension log lines and the deleted line (deleted.ts), both under an HMAC key, never the
//                           email or the Google id: the line holds this month's spend and goes at the month's end (at least
//                           3 days after the delete). No trial: none exists.
//
// Logs hold a kind, a reason and an owner id only. Never an email, a name, a token, an ID token, a nonce or an address.
import { issueSignInToken } from "./accounts.ts";
import type { GoogleCheck } from "./google.ts";
import { error, jsonNoStore, readCapped } from "./http.ts";
import { PRODUCT } from "./names.ts";
import { checkNonce, makeNonce } from "./nonce.ts";
import { nextReset, planOf, PRO_INCLUDES_REPORT } from "./plans.ts";
import { deletedKey } from "./deleted.ts";
import type { SafeEvent } from "./proxy.ts";
import { clientAddress } from "./ratelimit.ts";
import type { Store, User } from "./store.ts";
import { hashToken, tokenFromHeaders } from "./tokens.ts";
import { secretProblem } from "./userid.ts";

export const NONCE_PATH = "/v1/signin/nonce";
export const GOOGLE_SIGNIN_PATH = "/v1/signin/google";
export const ME_PATH = "/v1/me";
export const SIGNOUT_PATH = "/v1/signout";
export const SIGNOUT_ALL_PATH = "/v1/signout/all";
export const SWITCHES_PATH = "/v1/switches";
export const REPORT_USE_PATH = "/v1/report/use";
export const ACCOUNT_DELETE_PATH = "/v1/account/delete";
const SIGNIN_MAX_BODY_BYTES = 16 * 1024;
const SMALL_BODY_BYTES = 1024;
const USE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ACCOUNT_PATHS = new Set([NONCE_PATH, GOOGLE_SIGNIN_PATH, ME_PATH, SIGNOUT_PATH, SIGNOUT_ALL_PATH, SWITCHES_PATH, REPORT_USE_PATH, ACCOUNT_DELETE_PATH]);
/** True for the paths the account routes serve, so a store failure there gets the account sentence, not the model one. */
export const isAccountPath = (path: string) => ACCOUNT_PATHS.has(path);
/** The answer when the store fails on an account route. Nothing here is a model request, so it says nothing about Claude. */
export const ACCOUNT_STORE_FAILED_MESSAGE = `Your ${PRODUCT} account could not be reached just now. Nothing was changed. Try again in a moment.`;
export const accountStoreFailed = () => error(503, "api_error", ACCOUNT_STORE_FAILED_MESSAGE);
export const NO_REPORT_WORDS = "There is no report to use. Buy the report, then start it again.";
export const DELETE_LIVE_SUB_WORDS = "Cancel Pro in billing first, then delete. Nothing was deleted.";
export const DELETE_BUSY_WORDS = `${PRODUCT} is still working on something for you. Try again when it finishes. Nothing was deleted.`;

export type AccountDeps = {
  store: Store;
  /** METADATA_USER_ID_SECRET. The nonce key is derived from it, so without it there is no sign in. */
  userIdSecret?: string;
  googleSignIn?: (idToken: unknown) => Promise<GoogleCheck>;
  now: () => number;
  log: (e: SafeEvent) => void;
  /** The payments switch (PAYMENTS_ON) and the fixing switch (LOOP_ON), as /v1/me tells the app. Missing means off. */
  paymentsOn?: () => boolean;
  loopOn?: () => boolean;
  /** True while this address may try to sign in again (ratelimit.ts). Missing: no limit (tests of other things). */
  signinLimit?: (address: string) => boolean;
};

/** The statuses /v1/me answers. `free` covers a plan whose kept days are over. */
export type MeStatus = "free" | "active" | "past_due" | "on_hold" | "cancelling";

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());
const share = (spent: number, limit: number) => (limit > 0 ? Math.min(1, Math.round((spent / limit) * 100) / 100) : 1);

/** The plan and status a person is on now, from their user record. A kept plan whose end has passed is Free. */
export function planNow(u: User, now: number): { plan: string; status: MeStatus; until: string | null; renewsOn: string | null } {
  const ended = u.planUntil !== undefined && now >= u.planUntil;
  const plan = ended ? "free" : planOf(u.plan).name;
  if (plan === "free") return { plan, status: !ended && u.status === "on_hold" ? "on_hold" : "free", until: null, renewsOn: null };
  if (u.status === "past_due" || u.status === "cancelling") return { plan, status: u.status, until: iso(u.planUntil), renewsOn: null };
  return { plan, status: "active", until: null, renewsOn: iso(u.renewsOn) };
}

/** The account routes. Answers null for any other request, which then goes on to the proxy. */
export function createAccountRoutes(d: AccountDeps): (req: Request, url: URL) => Promise<Response | null> {
  const refuse = (reason: string, res: Response, userId?: string) => { d.log({ kind: "refused", reason, status: res.status, ...(userId ? { userId } : {}) }); return res; };
  const signInAgain = (reason: string) => refuse(reason, error(401, "authentication_error", `Sign in to ${PRODUCT} again.`));
  const notReady = (reason: string) => refuse(reason, error(503, "api_error", `Sign in is not ready on this ${PRODUCT} server yet. Try again later.`));
  const googleFailed = (reason: string) => refuse(reason, error(401, "authentication_error", "Google sign in did not work. Try signing in again."));
  const secret = () => (secretProblem(d.userIdSecret) ? null : (d.userIdSecret as string));

  async function nonce(): Promise<Response> {
    const s = secret();
    if (!s) return notReady("signin_no_secret");
    return jsonNoStore({ nonce: await makeNonce(s, d.now()) });
  }

  async function signIn(req: Request): Promise<Response> {
    if (d.signinLimit && !d.signinLimit(clientAddress(req)))
      return refuse("signin_rate_limit", error(429, "rate_limit_error", "Too many sign in tries from here. Wait a minute, then try again.", { "retry-after": "60" }));
    const s = secret();
    if (!s) return notReady("signin_no_secret");
    if (!d.googleSignIn) return refuse("signin_not_set_up", error(503, "api_error", `Sign in with Google is not set up on this ${PRODUCT} server yet.`));
    const bad = () => refuse("signin_bad_body", error(400, "invalid_request_error", "The sign in request is not in the expected form."));
    if (Number(req.headers.get("content-length") ?? 0) > SIGNIN_MAX_BODY_BYTES) return bad();
    const raw = await readCapped(req, SIGNIN_MAX_BODY_BYTES);
    if (raw === null) return bad();
    let idToken: unknown;
    try { idToken = (JSON.parse(raw) as { idToken?: unknown })?.idToken; } catch { return bad(); }
    if (typeof idToken !== "string" || idToken.length === 0) return bad();
    const checked = await d.googleSignIn(idToken);
    if (!checked.ok) {
      if (checked.reason === "keys_unavailable" || checked.reason === "not_configured") return refuse(`signin_${checked.reason}`, error(503, "api_error", "Google sign in cannot be checked right now. Try again in a moment."));
      return googleFailed(`signin_${checked.reason}`);
    }
    const who = checked.identity, now = d.now();
    const n = await checkNonce(who.nonce, s, now);
    if (!n.ok) return googleFailed(`signin_${n.reason}`);
    const plan = (await d.store.planOfOwner?.(who.ownerId)) ?? "free";
    // M116 step 5: the deleted line's key, so a person who deleted their account comes back with this month's spend.
    const issued = await issueSignInToken(d.store, who.ownerId, plan, { email: who.email, nonceId: n.id, nonceUntil: n.until, now, deletedKey: await deletedKey(who.ownerId, s) });
    if (!issued.ok) return "nonceUsed" in issued ? googleFailed("signin_nonce_used") : refuse("suspended", error(403, "permission_error", issued.message), who.ownerId);
    d.log({ kind: "signin", userId: who.ownerId });
    // The plan in the reply is the one /v1/me would show (planNow): a kept plan whose end has passed reads as Free here too.
    const fresh = await d.store.userByTokenHash(await hashToken(issued.token));
    const shown = fresh ? planNow(fresh, now).plan : "free";
    return jsonNoStore({ token: issued.token, plan: shown, email: who.email, name: who.name ?? null, picture: who.picture ?? null });
  }

  async function me(req: Request): Promise<Response> {
    const token = tokenFromHeaders(req.headers);
    if (!token) return signInAgain("no_token");
    const now = d.now(), acct = await d.store.account(await hashToken(token), now);
    if (!acct) return signInAgain("unknown_token");
    const u = acct.user;
    if (u.status === "suspended") return refuse("suspended", error(403, "permission_error", `Your ${PRODUCT} account is paused. If you think this is a mistake, you can appeal: see the acceptable use page.`), u.id);
    if (u.status === "revoked" || u.status === "canceled") return signInAgain("inactive");
    const p = planNow(u, now), limits = planOf(p.plan);
    return jsonNoStore({
      ...p, email: acct.email,
      use: { today: share(acct.spent.day, limits.dailyUsd), month: share(acct.spent.month, limits.monthlyUsd), todayResetsAt: iso(nextReset("day", now)), monthResetsAt: iso(nextReset("month", now)) },
      switches: { payments: d.paymentsOn?.() === true, fixing: d.loopOn?.() === true },
    });
  }

  async function signOut(req: Request, all: boolean): Promise<Response> {
    const token = tokenFromHeaders(req.headers);
    if (!token) return signInAgain("no_token");
    const hash = await hashToken(token), user = await d.store.userByTokenHash(hash);
    if (!user) return signInAgain("unknown_token");
    // A token that no longer works (revoked by a suspension, or canceled) may only forget itself. It can never stop the owner's
    // other tokens: after a suspension and a restore, a leaked old token must not sign the person out of their new ones.
    if (user.status === "suspended" || user.status === "revoked" || user.status === "canceled") {
      await d.store.dropToken(hash);
      if (user.status === "suspended") return refuse("suspended", error(403, "permission_error", `Your ${PRODUCT} account is paused. If you think this is a mistake, you can appeal: see the acceptable use page.`), user.id);
      return signInAgain("inactive");
    }
    const stopped = all ? await d.store.dropAllTokens(user.id) : (await d.store.dropToken(hash)) ? 1 : 0;
    if (!all && stopped === 0) return signInAgain("unknown_token");
    d.log({ kind: "signout", userId: user.id, reason: all ? "all" : "one" });
    return jsonNoStore({ stopped });
  }

  /** The token's working account, or the refusal to send. Shared by report use and delete. */
  async function working(req: Request): Promise<{ ok: true; user: User; now: number } | { ok: false; res: Response }> {
    const token = tokenFromHeaders(req.headers);
    if (!token) return { ok: false, res: signInAgain("no_token") };
    const now = d.now(), user = await d.store.userByTokenHash(await hashToken(token));
    if (!user) return { ok: false, res: signInAgain("unknown_token") };
    if (user.status === "suspended") return { ok: false, res: refuse("suspended", error(403, "permission_error", `Your ${PRODUCT} account is paused. If you think this is a mistake, you can appeal: see the acceptable use page.`), user.id) };
    if (user.status === "revoked" || user.status === "canceled") return { ok: false, res: signInAgain("inactive") };
    return { ok: true, user, now };
  }
  /** A small JSON body, or undefined when there is none; null when it is too big or not JSON. */
  async function smallBody(req: Request): Promise<Record<string, unknown> | undefined | null> {
    if (Number(req.headers.get("content-length") ?? 0) > SMALL_BODY_BYTES) return null;
    const raw = await readCapped(req, SMALL_BODY_BYTES);
    if (raw === null) return null;
    if (raw.trim() === "") return undefined;
    try { const v = JSON.parse(raw); return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; }
  }

  async function useReport(req: Request): Promise<Response> {
    const w = await working(req);
    if (!w.ok) return w.res;
    const body = await smallBody(req), useId = body?.useId;
    if (body === null || (useId !== undefined && (typeof useId !== "string" || !USE_ID.test(useId))))
      return refuse("report_bad_body", error(400, "invalid_request_error", "The report request is not in the expected form."), w.user.id);
    if (PRO_INCLUDES_REPORT && planNow(w.user, w.now).plan !== "free") {
      d.log({ kind: "report_use", userId: w.user.id, reason: "pro" });
      return jsonNoStore({ ok: true, paidBy: "pro" });
    }
    const r = await d.store.useReport(w.user.id, { now: w.now, ...(typeof useId === "string" ? { useId } : {}) });
    if (!r.ok) return refuse("no_report", error(402, "billing_error", NO_REPORT_WORDS), w.user.id);
    d.log({ kind: "report_use", userId: w.user.id, reason: "credit" });
    return jsonNoStore({ ok: true, paidBy: "credit", left: r.left });
  }

  async function deleteAccount(req: Request): Promise<Response> {
    const w = await working(req);
    if (!w.ok) return w.res;
    const s = secret();
    if (!s) return notReady("delete_no_secret");
    const body = await smallBody(req);
    if (!body || body.confirm !== true) return refuse("delete_bad_body", error(400, "invalid_request_error", "Send {\"confirm\": true} to delete the account."), w.user.id);
    const r = await d.store.deleteAccount(w.user.id, { key: await deletedKey(w.user.id, s), now: w.now });
    if (!r.ok) {
      if (r.why === "live_sub") return refuse("delete_live_sub", error(409, "invalid_request_error", DELETE_LIVE_SUB_WORDS), w.user.id);
      if (r.why === "busy") return refuse("delete_busy", error(409, "invalid_request_error", DELETE_BUSY_WORDS), w.user.id);
      return refuse("suspended", error(403, "permission_error", `Your ${PRODUCT} account is paused. If you think this is a mistake, you can appeal: see the acceptable use page.`), w.user.id);
    }
    // No owner id in this line: the account is gone. A count of what other objects could not forget, for the operator.
    d.log({ kind: "account_deleted", ...(r.leftovers ? { reason: `leftovers_${r.leftovers}` } : {}) });
    return jsonNoStore({ deleted: true });
  }

  return async (req, url) => {
    const p = url.pathname;
    if (req.method === "GET" && p === SWITCHES_PATH) return jsonNoStore({ payments: d.paymentsOn?.() === true, fixing: d.loopOn?.() === true });
    if (req.method === "POST" && p === REPORT_USE_PATH) return useReport(req);
    if (req.method === "POST" && p === ACCOUNT_DELETE_PATH) return deleteAccount(req);
    if (req.method === "GET" && p === NONCE_PATH) return nonce();
    if (req.method === "POST" && p === GOOGLE_SIGNIN_PATH) return signIn(req);
    if (req.method === "GET" && p === ME_PATH) return me(req);
    if (req.method === "POST" && p === SIGNOUT_PATH) return signOut(req, false);
    if (req.method === "POST" && p === SIGNOUT_ALL_PATH) return signOut(req, true);
    return null;
  };
}
