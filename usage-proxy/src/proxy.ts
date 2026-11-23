// The usage proxy (F22, M13): takes a request from the app, checks the user's token and plan, adds Companion's Anthropic key,
// forwards it, streams the reply back unchanged, and counts what it cost. Forwarding stays off until the founder turns it on
// (PROXY_ON). Only Squibby's own loop and light lanes run on this bill; Claude Code never does without Anthropic's written yes.
//
// It never stores or logs a request or a reply body, and never puts one in an error. What it logs is the SafeEvent below, and
// nothing else: a test holds it to that.
import { checkRequest, MAX_BODY_BYTES } from "./filter.ts";
import { budgetCheck, nextReset, planOf, type Plan } from "./plans.ts";
import { paidPlanCounts, type Store, type UsageRecord } from "./store.ts";
import { hashToken, tokenFromHeaders } from "./tokens.ts";
import { UsageSniffer, costOf, usageFromJson, type Usage } from "./usage.ts";
import { PRODUCT, PRODUCT_S } from "./names.ts";
import { deriveUserId, secretProblem } from "./userid.ts";
import type { GoogleCheck } from "./google.ts";
import { accountStoreFailed, createAccountRoutes, isAccountPath } from "./account-routes.ts";
import { error, readCapped } from "./http.ts";

/** Sign in with Google (M21): POST a Google ID token here, get a sign in token back. M116: served ahead of the switch, with
 *  the other account routes (account-routes.ts). */
export { GOOGLE_SIGNIN_PATH } from "./account-routes.ts";

/** `version`: only on update_check, the app version an update check came from (checked to be a version before it is logged). */
export type SafeEvent = { kind: "refused" | "request" | "upstream_error" | "signin" | "signout" | "checkout" | "portal" | "report_use" | "account_deleted" | "update_check"; userId?: string; reason?: string; model?: string; usd?: number; status?: number; complete?: boolean; version?: string };
export type Deps = {
  store: Store;
  anthropicKey: string;
  /** The operator's secret for the opaque metadata.user_id (setting METADATA_USER_ID_SECRET). Missing or short: nothing is forwarded. */
  userIdSecret?: string;
  /** The remote switch (PROXY_ON). Off means every model request is refused with a plain sentence and nothing is sent. Nobody
   *  is ever told to bring a key (F29). */
  enabled: () => boolean;
  /** M100 review: the fixing loop's switch (setting LOOP_ON). Off, or missing, a request with the loop's tools is refused
   *  however good its sign in token; only Second Look's capped search and plain requests go through. */
  loopOn?: () => boolean;
  fetch?: typeof fetch;
  upstream?: string;
  now?: () => number;
  log?: (e: SafeEvent) => void;
  maxInFlight?: number;
  /** How long to wait before each background try at letting go of a slot the store failed to let go of. Tests make it short. */
  releaseRetryMs?: number[];
  /** Keeps the server running until a streamed reply's cost is booked (a Worker's ctx.waitUntil). Without it, a server that
   *  stops a request's work once the reply is sent could leave a cost unbooked. */
  waitUntil?: (p: Promise<unknown>) => void;
  /** Checks a Google ID token (createGoogleVerifier in google.ts, with the GOOGLE_CLIENT_ID setting). Missing: the sign in route answers 503. */
  googleSignIn?: (idToken: unknown) => Promise<GoogleCheck>;
  /** M116: the payments switch (PAYMENTS_ON), as GET /v1/me tells the app. Missing means off. */
  paymentsOn?: () => boolean;
  /** M116: true while this address may try to sign in again (ratelimit.ts). Missing: no limit. */
  signinLimit?: (address: string) => boolean;
  /** Audit run 2, finding 5: true while payments are in test mode (Dodo's test address, or none set). Then every paid plan is
   *  held to Free's limits, because anyone can pay with a free test card. False: Dodo is live, and a plan paid in test mode
   *  (planMode test) is held to Free's limits (the re-attack). Missing: neither. */
  paymentsTestMode?: () => boolean;
  /** The owner ids that keep their paid plan's limits in test mode (setting TEST_PAYERS), such as the founder's own account. */
  testPayers?: () => readonly string[];
};

/** Audit run 2, finding 5: the owner ids in TEST_PAYERS, separated by commas or spaces. Anything else is ignored. */
export function parseTestPayers(value: unknown): string[] {
  return typeof value === "string" ? value.split(/[\s,]+/).filter((x) => x.length > 0 && x.length <= 200) : [];
}

/** M116 (F29): the words for a model request that cannot go. None asks anyone to bring a key: nobody does. */
export const SWITCHED_OFF_WORDS = `${PRODUCT_S} included use is not switched on yet. Nothing was sent to Claude. Try again later.`;
export const NOT_READY_WORDS = `${PRODUCT_S} included use is not ready yet. Nothing was sent to Claude. Try again later.`;
/** Past the per account running cap: the usual reason is the same account busy on another Mac (M116 section 1). */
export const BUSY_WORDS = `${PRODUCT} is busy on your other Mac. Try again when it finishes.`;
/** Over the day's or the month's included use. On Free, one more line says Pro has more. */
export function overLimitWords(reason: "day" | "month", onFree: boolean): string {
  const words = reason === "day"
    ? "Today's included use is used up. It comes back at midnight UTC."
    : "This month's included use is used up. It comes back on the 1st (UTC).";
  return onFree ? `${words} Pro has more each ${reason}.` : words;
}

/** The background tries at letting go of a slot after a failed finish: within the 30 seconds a Worker may keep going after
 *  its reply (waitUntil). After them, the slot's own 30 minute lease is the last resort. */
export const RELEASE_RETRY_MS = [1000, 4000, 15000];

const PASS_BACK = ["content-type", "request-id", "retry-after", "cache-control"];
/** The answer when the store cannot finish a step before anything was forwarded (M99 review): the API's own error shape, so the
 *  app can show a plain sentence, never a server's own error page. The Worker answers its other routes' store failures alike. */
export const STORE_FAILED_MESSAGE = `${PRODUCT_S} included usage could not be checked just now. Nothing was sent to Claude. Try again in a moment.`;
export const storeFailed = () => error(503, "api_error", STORE_FAILED_MESSAGE);

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

/** Audit run 2, finding 6: what a request is sure to cost (`need`: its prompt, which must fit under the limits) and the most
 *  it may cost (`worst`: held while it runs). Search re-attack: `worst` also counts every search the request allows, with its
 *  fee and room for its results as input, and is priced as one request, so results that carry the prompt over a model's long
 *  prompt line are held at the long rate card. A prompt with a cache marker is priced at the cache write rate. */
export function holdOf(c: Extract<ReturnType<typeof checkRequest>, { ok: true }>): { need: number; worst: number } {
  const priced = (input: number, output: number, searches: number) => costOf(c.model, {
    input_tokens: c.cacheWrite ? 0 : input, cache_creation_input_tokens: c.cacheWrite ? input : 0,
    output_tokens: output, cache_read_input_tokens: 0, web_search_requests: searches });
  return { need: priced(c.inputTokens, 0, 0), worst: priced(c.inputTokens + c.searchTokens, c.maxTokens, c.searches) };
}

/** Audit run 2, finding 6 (re-attack round 3): what a reply cut short is booked at. Anthropic may have written it all (Must fix
 *  10), so the output is the whole max_tokens and every search the request allowed is counted, with room for its results as
 *  input. The prompt is Anthropic's own count when message_start reached us (`promptSeen`), and our estimate when it did not
 *  (the client went away before it, or the body broke), at the cache write rate when the prompt carries a cache marker.
 *  Without that floor a large prompt cancelled at once was booked as no prompt at all, and its hold was let go. */
export function cutShortUsage(c: Extract<ReturnType<typeof checkRequest>, { ok: true }>, seen: Usage, promptSeen: boolean): Usage {
  const prompt = promptSeen ? { input: seen.input_tokens, write: seen.cache_creation_input_tokens }
    : { input: c.cacheWrite ? 0 : c.inputTokens, write: c.cacheWrite ? c.inputTokens : 0 };
  return {
    input_tokens: Math.max(seen.input_tokens, prompt.input + c.searchTokens),
    cache_creation_input_tokens: Math.max(seen.cache_creation_input_tokens, prompt.write),
    cache_read_input_tokens: seen.cache_read_input_tokens,
    output_tokens: Math.max(seen.output_tokens, c.maxTokens),
    web_search_requests: Math.max(seen.web_search_requests, c.searches),
  };
}

export function createProxy(d: Deps): (req: Request) => Promise<Response> {
  const doFetch = d.fetch ?? fetch, upstream = checkUpstream(d.upstream ?? "https://api.anthropic.com"), now = d.now ?? Date.now, log = d.log ?? (() => {}), maxInFlight = d.maxInFlight ?? 4;
  const releaseRetryMs = d.releaseRetryMs ?? RELEASE_RETRY_MS;
  const refuse = (reason: string, res: Response, userId?: string) => { log({ kind: "refused", reason, status: res.status, ...(userId ? { userId } : {}) }); return res; };

  // M116: the account routes come before the switch and the Anthropic key, so people can make an account while forwarding is off.
  const accountRoute = createAccountRoutes({ store: d.store, userIdSecret: d.userIdSecret, googleSignIn: d.googleSignIn, now, log,
    paymentsOn: d.paymentsOn, loopOn: d.loopOn, signinLimit: d.signinLimit,
    // Live once the Dodo address is the live one (paymentsTestMode answers false); missing: not live.
    paymentsLive: () => d.paymentsTestMode?.() === false,
    // Audit run 2, finding 4, close round 3: a sign in's and a delete's store steps are kept running if the client goes away.
    ...(d.waitUntil ? { waitUntil: d.waitUntil } : {}) });

  const overBudget = (b: ReturnType<typeof budgetCheck>, plan: Plan, userId: string) => {
    // Only reached when the hold did not fit, so a check that now passes (a hold let go meanwhile) still counts as the day.
    const reason = b.ok ? "day" : b.reason;
    const resetsAt = b.ok ? nextReset("day", now()) : b.resetsAt;
    // M116 (F29): the app shows the time in the person's own zone from x-companion-resets-at; these words are the fallback.
    const message = overLimitWords(reason, plan.name === "free");
    return refuse(`${reason}_limit`, error(402, "billing_error", message, { "x-companion-resets-at": new Date(resetsAt).toISOString() }), userId);
  };

  return async (req) => {
    try { return await handle(req); }
    // Never the error itself: it could carry something it should not. An account route gets its own sentence (no Claude words).
    catch { return refuse("store_failed", isAccountPath(new URL(req.url).pathname) ? accountStoreFailed() : storeFailed()); }
  };

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const account = await accountRoute(req, url);
    if (account) return account;
    if (!d.enabled()) return refuse("disabled", error(503, "api_error", SWITCHED_OFF_WORDS));
    if (secretProblem(d.userIdSecret)) return refuse("no_user_id_secret", error(503, "api_error", NOT_READY_WORDS));
    // M99: a server with no Anthropic key set forwards nothing (it would only send the person's request to a certain refusal).
    if (typeof d.anthropicKey !== "string" || d.anthropicKey.trim() === "") return refuse("no_anthropic_key", error(503, "api_error", NOT_READY_WORDS));
    const token = tokenFromHeaders(req.headers);
    if (!token) return refuse("no_token", error(401, "authentication_error", `Sign in to ${PRODUCT} again.`));
    const tokenHash = await hashToken(token);
    const user = await d.store.userByTokenHash(tokenHash);
    if (!user) return refuse("unknown_token", error(401, "authentication_error", `Sign in to ${PRODUCT} again.`));
    if (user.status === "suspended") return refuse("suspended", error(403, "permission_error", `Your ${PRODUCT} account is paused. If you think this is a mistake, you can appeal: see the acceptable use page.`), user.id);
    if (user.status === "canceled" || user.status === "revoked") return refuse("inactive", error(403, "permission_error", `Your ${PRODUCT} plan is not active. Choose a plan in Settings.`), user.id);

    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return refuse("too_big", error(413, "invalid_request_error", "That request is too big to send."), user.id);
    const raw = await readCapped(req);
    if (raw === null) return refuse("too_big", error(413, "invalid_request_error", "That request is too big to send."), user.id);
    const checked = checkRequest(req.method, url.pathname, raw, await deriveUserId(user.id, d.userIdSecret as string), { loopOn: d.loopOn?.() === true });
    if (!checked.ok) return refuse("bad_request", error(checked.status, "invalid_request_error", checked.message), user.id);

    // A plan kept through a late payment lasts only until its end date (Dodo's past_due_ends_at); then it is free.
    // Audit run 2, finding 5: while payments are in test mode a paid plan cost nobody anything, so it has Free's limits on
    // Squibby's key, apart from the owners named in TEST_PAYERS.
    // Finding 5 re-attack: once Dodo is live, a plan paid in test mode (planMode test) has Free's limits too, whoever holds it:
    // TEST_PAYERS counts only while Dodo is in test mode.
    const mode = d.paymentsTestMode?.();
    const heldToFree = mode === true ? !(d.testPayers?.() ?? []).includes(user.id) : mode === false && !paidPlanCounts(user, true);
    const plan = planOf(heldToFree || (user.planUntil !== undefined && now() >= user.planUntil) ? "free" : user.plan);
    // This request's own id, so letting go of its slot and hold never takes another request's of the same amount.
    const id = crypto.randomUUID();
    // Must fix 10 (a): the request holds its worst case (its whole max_tokens as output) while it runs, checked and held in
    // one step, so many requests opened at once cannot all pass on the same last cent. M116 step 3: the slot and the hold are
    // taken in that same step (one row written), and let go with the booking in one more (two rows), so a model request
    // writes at most 3 rows on Cloudflare's free plan. The hold goes when it ends. Audit run 2, finding 6: the hold covers
    // the prompt too (estimated from the body), and the prompt must fit under the limits with what is spent and held, so
    // large prompts sent at once with a tiny max_tokens cannot all pass at zero spend.
    const { need, worst } = holdOf(checked);
    const started = await d.store.start(user.id, { max: maxInFlight, usd: worst, now: now(), limits: plan, id, need, hash: tokenHash });
    if (!started.ok) {
      if (started.why === "over") return overBudget(budgetCheck(plan, started.spent, now(), need), plan, user.id);
      // Audit run 2, finding 4 (re-attack round 2): the account was deleted after the token was read. Nothing is sent.
      if (started.why === "gone") return refuse("unknown_token", error(401, "authentication_error", `Sign in to ${PRODUCT} again.`), user.id);
      return refuse("busy", error(429, "rate_limit_error", BUSY_WORDS), user.id);
    }

    // Best effort: a failure here never costs the person their answer. With a record, the slot and hold go in the same step as
    // the booking. When that step fails, the slot and hold are let go alone, now and then again a few times in the background
    // (S3 review: a short store outage must not leave the person "busy on your other Mac" for the 30 minute lease). The
    // booking itself is never sent twice: the store may have kept it before the reply was lost, and booking twice would
    // charge the person for use they did not have. A lost booking is logged (booking_failed).
    let released = false, retrying = false;
    const letGo = () => d.store.finish(user.id, { id, now: now() }).then(() => { released = true; }, () => {});
    const retryLater = () => {
      if (released || retrying) return;
      retrying = true;
      const later = (async () => {
        for (const ms of releaseRetryMs) { if (released) return; await new Promise((r) => setTimeout(r, ms)); await letGo(); }
        if (!released) log({ kind: "request", userId: user.id, reason: "release_failed" });
      })();
      d.waitUntil?.(later);
    };
    const finish = async (record?: UsageRecord): Promise<boolean> => {
      if (released) return true;
      try { await d.store.finish(user.id, { id, now: now(), ...(record ? { record } : {}) }); released = true; return true; }
      catch { await letGo(); retryLater(); return false; }
    };
    const release = async () => { await finish(); };
    // Audit run 2, finding 7: the whole forward, the reading of a reply that is not streamed, its booking and the let go run as
    // one piece of work the server is told to keep running (waitUntil), so a client that goes away cannot stop the booking.
    // A streamed reply is booked when its stream ends, kept alive the same way below (bookedNow).
    const work = (async (): Promise<Response> => { try {
      // Audit run 2, finding 8: no anthropic-beta header is forwarded. The runner sends none, and a beta can change what a
      // request costs (a 1 hour cache, a longer context) in ways the price table does not count.
      const headers = new Headers({ "content-type": "application/json", "x-api-key": d.anthropicKey, "anthropic-version": req.headers.get("anthropic-version") ?? "2023-06-01" });
      const target = `${upstream}${url.pathname}${url.searchParams.get("beta") === "true" ? "?beta=true" : ""}`;
      const res = await doFetch(target, { method: "POST", headers, body: checked.body, redirect: "manual" });
      const back = new Headers();
      for (const h of PASS_BACK) { const v = res.headers.get(h); if (v) back.set(h, v); }

      const book = async (seen: Usage, complete: boolean, failedUpstream = false, promptSeen = true) => {
        // Must fix 10: a stream cut short (the client went away, or the connection broke) never told us its output, and
        // Anthropic may have written it all. It is booked as the whole answer the request allowed, so cancelling cannot
        // get round the budget. Finding 6 (re-attack round 3): it is booked with its prompt too, our estimate when
        // message_start never reached us (cutShortUsage). A reply Anthropic itself ended with an error event
        // (overloaded_error) is booked from what it reported: the person does not pay a full answer for Anthropic's failure.
        const usage = complete || failedUpstream ? seen : cutShortUsage(checked, seen, promptSeen);
        const usd = costOf(checked.model, usage);
        // Claude has answered and our key has paid by now, so a booking the store cannot finish never costs the person the
        // answer: it is logged (booking_failed, ids and dollars only) and the answer still goes back.
        const ok = await finish(usd > 0 ? { userId: user.id, model: checked.model, usage, usd, at: now(), complete } : undefined);
        if (!ok) { log({ kind: "request", userId: user.id, model: checked.model, usd, status: res.status, complete, reason: "booking_failed" }); return; }
        log({ kind: "request", userId: user.id, model: checked.model, usd, status: res.status, complete });
      };
      if (!res.ok) {
        log({ kind: "upstream_error", userId: user.id, status: res.status });
        const text = await res.text();
        await release();
        return new Response(text, { status: res.status, headers: back });
      }
      if (res.body && (res.headers.get("content-type") ?? "").includes("text/event-stream")) {
        const sniffer = new UsageSniffer();
        let booked: () => void = () => {};
        const bookedNow = new Promise<void>((r) => { booked = r; });
        d.waitUntil?.(bookedNow);
        return new Response(metered(res.body, sniffer, async () => { try { await book(sniffer.usage(), sniffer.complete(), sniffer.failedUpstream(), sniffer.promptSeen()); } finally { try { await release(); } finally { booked(); } } }), { status: res.status, headers: back });
      }
      // Finding 6 (re-attack round 3): a reply that is not streamed and breaks while it is read has been sent to Anthropic in
      // full and may have been answered in full, so it is booked as cut short, the same as a stream, before the error goes back.
      let text: string;
      try { text = await res.text(); }
      catch { await book({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }, false, false, false); throw new Error("reply broke"); }
      await book(usageFromJson(text), true);
      await release();
      return new Response(text, { status: res.status, headers: back });
    } catch {
      await release();
      return error(502, "api_error", `${PRODUCT} could not reach Claude. Try again in a moment.`);
    } })();
    d.waitUntil?.(work.catch(() => {}));
    return work;
  }
}
