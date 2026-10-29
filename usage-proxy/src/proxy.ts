// The usage proxy (F22, M13): takes a request from the app, checks the user's token and plan, adds Companion's Anthropic key,
// forwards it, streams the reply back unchanged, and counts what it cost. SWITCHED OFF until Anthropic confirms in writing.
//
// It never stores or logs a request or a reply body, and never puts one in an error. What it logs is the SafeEvent below, and
// nothing else: a test holds it to that.
import { checkRequest, MAX_BODY_BYTES } from "./filter.ts";
import { budgetCheck, planOf } from "./plans.ts";
import type { Store } from "./store.ts";
import { hashToken, tokenFromHeaders } from "./tokens.ts";
import { UsageSniffer, costOf, usageFromJson } from "./usage.ts";
import { PRODUCT, PRODUCT_S } from "./names.ts";
import { deriveUserId, secretProblem } from "./userid.ts";
import { issueToken } from "./accounts.ts";
import type { GoogleCheck } from "./google.ts";

/** Sign in with Google (M21): POST a Google ID token here, get a sign in token back. Behind the same switch as everything else. */
export const GOOGLE_SIGNIN_PATH = "/v1/signin/google";
const SIGNIN_MAX_BODY_BYTES = 16 * 1024;

export type SafeEvent = { kind: "refused" | "request" | "upstream_error" | "signin"; userId?: string; reason?: string; model?: string; usd?: number; status?: number; complete?: boolean };
export type Deps = {
  store: Store;
  anthropicKey: string;
  /** The operator's secret for the opaque metadata.user_id (setting METADATA_USER_ID_SECRET). Missing or short: nothing is forwarded. */
  userIdSecret?: string;
  /** The remote switch. Off means every request is refused with a message pointing to the user's own key. */
  enabled: () => boolean;
  fetch?: typeof fetch;
  upstream?: string;
  now?: () => number;
  log?: (e: SafeEvent) => void;
  maxInFlight?: number;
  /** Checks a Google ID token (createGoogleVerifier in google.ts, with the GOOGLE_CLIENT_ID setting). Missing: the sign in route answers 503. */
  googleSignIn?: (idToken: unknown) => Promise<GoogleCheck>;
};

const error = (status: number, type: string, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: "error", error: { type, message } }), { status, headers: { "content-type": "application/json", ...headers } });
const PASS_BACK = ["content-type", "request-id", "retry-after", "cache-control"];

/** The body as text, read only up to the cap: a body with no length that never ends is refused, not read to the end. Null when over. */
async function readCapped(req: Request, cap = MAX_BODY_BYTES): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}
/** Only an https address (or this machine, for a test) may be the place requests go: our key travels there. */
function checkUpstream(base: string): string {
  let u: URL;
  try { u = new URL(base); } catch { throw new Error("The upstream address is not a web address."); }
  const here = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && here)) throw new Error("The upstream address must start with https://.");
  return base;
}

/** A reply stream passed through unchanged while its usage is read. The cost is booked when it ends, or when the client goes away. */
function metered(body: ReadableStream<Uint8Array>, sniffer: UsageSniffer, finish: () => Promise<void>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let over = false;
  const end = async () => { if (over) return; over = true; sniffer.end(); await finish(); };
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const { value, done } = await reader.read();
        if (done) { await end(); c.close(); return; }
        sniffer.push(value); c.enqueue(value);
      } catch (e) { await end(); c.error(e); }
    },
    async cancel(reason) { try { await reader.cancel(reason); } catch { /* already gone */ } await end(); },
  });
}

export function createProxy(d: Deps): (req: Request) => Promise<Response> {
  const doFetch = d.fetch ?? fetch, upstream = checkUpstream(d.upstream ?? "https://api.anthropic.com"), now = d.now ?? Date.now, log = d.log ?? (() => {}), maxInFlight = d.maxInFlight ?? 4;
  const refuse = (reason: string, res: Response, userId?: string) => { log({ kind: "refused", reason, status: res.status, ...(userId ? { userId } : {}) }); return res; };

  /** Google ID token in, sign in token out. The ID token, email and name are never logged; only the owner id is. */
  const signInWithGoogle = async (req: Request): Promise<Response> => {
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
      return refuse(`signin_${checked.reason}`, error(401, "authentication_error", "Google sign in did not work. Try signing in again."));
    }
    const who = checked.identity;
    const plan = (await d.store.planOfOwner?.(who.ownerId)) ?? "free";
    const issued = await issueToken(d.store, who.ownerId, plan);
    if (!issued.ok) return refuse("suspended", error(403, "permission_error", issued.message), who.ownerId);
    log({ kind: "signin", userId: who.ownerId });
    return new Response(JSON.stringify({ token: issued.token, plan, email: who.email, name: who.name ?? null, picture: who.picture ?? null }),
      { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  };

  return async (req) => {
    if (!d.enabled()) return refuse("disabled", error(503, "api_error", `${PRODUCT_S} included usage is not switched on yet. Use your own Claude key in Settings for now.`));
    if (secretProblem(d.userIdSecret)) return refuse("no_user_id_secret", error(503, "api_error", `${PRODUCT_S} included usage is not ready yet. Nothing was sent to Claude. Try again later, or use your own Claude key in Settings.`));
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === GOOGLE_SIGNIN_PATH) return signInWithGoogle(req);
    const token = tokenFromHeaders(req.headers);
    if (!token) return refuse("no_token", error(401, "authentication_error", `Sign in to ${PRODUCT} again.`));
    const user = await d.store.userByTokenHash(await hashToken(token));
    if (!user) return refuse("unknown_token", error(401, "authentication_error", `Sign in to ${PRODUCT} again.`));
    if (user.status === "suspended") return refuse("suspended", error(403, "permission_error", `Your ${PRODUCT} account is paused. If you think this is a mistake, you can appeal: see the acceptable use page.`), user.id);
    if (user.status === "canceled" || user.status === "revoked") return refuse("inactive", error(403, "permission_error", `Your ${PRODUCT} plan is not active. Choose a plan, or use your own Claude key in Settings.`), user.id);

    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return refuse("too_big", error(413, "invalid_request_error", "That request is too big to send."), user.id);
    const raw = await readCapped(req);
    if (raw === null) return refuse("too_big", error(413, "invalid_request_error", "That request is too big to send."), user.id);
    const checked = checkRequest(req.method, url.pathname, raw, await deriveUserId(user.id, d.userIdSecret as string));
    if (!checked.ok) return refuse("bad_request", error(checked.status, "invalid_request_error", checked.message), user.id);

    const plan = planOf(user.plan);
    if (!checked.free) {
      const b = budgetCheck(plan, await d.store.spent(user.id, now()), now());
      if (!b.ok) {
        const message = b.reason === "day"
          ? `Today's included ${PRODUCT} usage is used up. It comes back at midnight UTC. To keep going now, add your own Claude key in Settings.`
          : `This month's included ${PRODUCT} usage is used up. It comes back on the 1st (UTC). To keep going now, add your own Claude key in Settings or change plan.`;
        return refuse(`${b.reason}_limit`, error(402, "billing_error", message, { "x-companion-resets-at": new Date(b.resetsAt).toISOString() }), user.id);
      }
    }
    if (!(await d.store.begin(user.id, maxInFlight))) return refuse("busy", error(429, "rate_limit_error", "Too many requests at once. Try again in a moment."), user.id);

    let released = false;
    const release = async () => { if (!released) { released = true; await d.store.end(user.id); } };
    try {
      const beta = (req.headers.get("anthropic-beta") ?? "").replace(/\s+/g, "");
      const headers = new Headers({ "content-type": "application/json", "x-api-key": d.anthropicKey, "anthropic-version": req.headers.get("anthropic-version") ?? "2023-06-01" });
      if (beta && /^[A-Za-z0-9._,-]+$/.test(beta)) headers.set("anthropic-beta", beta);
      const target = `${upstream}${url.pathname}${url.searchParams.get("beta") === "true" ? "?beta=true" : ""}`;
      const res = await doFetch(target, { method: "POST", headers, body: checked.body, redirect: "manual" });
      const back = new Headers();
      for (const h of PASS_BACK) { const v = res.headers.get(h); if (v) back.set(h, v); }

      const book = async (usage: ReturnType<typeof usageFromJson>, complete: boolean) => {
        const usd = costOf(checked.model, usage);
        if (usd > 0) await d.store.record({ userId: user.id, model: checked.model, usage, usd, at: now(), complete });
        log({ kind: "request", userId: user.id, model: checked.model, usd, status: res.status, complete });
      };
      if (!res.ok) {
        log({ kind: "upstream_error", userId: user.id, status: res.status });
        const text = await res.text();
        await release();
        return new Response(text, { status: res.status, headers: back });
      }
      if (checked.free) { const text = await res.text(); await release(); return new Response(text, { status: res.status, headers: back }); }
      if (res.body && (res.headers.get("content-type") ?? "").includes("text/event-stream")) {
        const sniffer = new UsageSniffer();
        return new Response(metered(res.body, sniffer, async () => { try { await book(sniffer.usage(), sniffer.complete()); } finally { await release(); } }), { status: res.status, headers: back });
      }
      const text = await res.text();
      await book(usageFromJson(text), true);
      await release();
      return new Response(text, { status: res.status, headers: back });
    } catch {
      await release();
      return error(502, "api_error", `${PRODUCT} could not reach Claude. Try again in a moment.`);
    }
  };
}
