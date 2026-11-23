// What the proxy keeps, and nothing more: who a token belongs to, what each user has spent today and this month, how many
// requests they have running, and one small record per request (counts and cost, never text). The in memory store below is for
// tests and a first run; the real one, on Cloudflare Durable Objects (store-do.ts, M99), implements the same interface and the
// same tests run against both (test/stores.ts).
import { budgetCheck, dayKey, monthKey, type Plan, type Spent } from "./plans.ts";
import type { Usage } from "./usage.ts";
import { DELETED_PREFIX, deletedLineLive, deletedUntil, mergeDeletedLines, type DeletedLine } from "./deleted.ts";

/** `planUntil`: a plan a late payment, or a cancel at the end of the period, keeps only until then (Dodo's past_due_ends_at or
 *  next_billing_date); from then on the person is on free. `renewsOn`: the next renewal date, when a payment event gave one. */
/** `planMode` (audit run 2, finding 5 re-attack): set when the plan came from a payment event, and says which Dodo that payment
 *  was made in. Once Dodo is live, a plan from test mode (a free test card) counts as Free (see paidPlanCounts). */
export type User = { id: string; plan: string; status: "active" | "past_due" | "on_hold" | "cancelling" | "canceled" | "revoked" | "suspended"; planUntil?: number; renewsOn?: number; planMode?: DodoMode };
/** The plan a payment event gave an owner. It wins over the plan written with each token, until a newer event changes it.
 *  M116: `on_hold` (a failed renewal Dodo stopped retrying: plan free) and `cancelling` (Pro until `until`). */
/** `mode`: the Dodo mode of the payment the plan came from. Missing counts as test: nothing was live before modes were kept. */
export type OwnerPlan = { plan: string; status: "active" | "past_due" | "on_hold" | "cancelling"; until?: number; renewsOn?: number; mode?: DodoMode };
/** M116 step 4: one Dodo subscription as its newest event left it. The owner's plan is the best of their subscriptions
 *  (bestPlan), so a cancel or an expiry of one never drops a person who has another that is live. `at`: that event's time. */
/** `mode`: the Dodo mode the subscription's events came from (missing: test, as for a customer id). */
export type SubChange = { plan: string; status: OwnerPlan["status"]; until?: number; renewsOn?: number; customerId?: string; customerMode?: DodoMode; mode?: DodoMode };
export type Sub = SubChange & { at: number };
/** Which Dodo a customer id came from. Test mode and live mode keep separate customers, so an id from one is unknown to the
 *  other. A customer id kept without a mode counts as test: nothing was live before modes were kept. */
export type DodoMode = "test" | "live";
/** One $29 report credit, keyed by Dodo's payment_id. `removed`: a full refund or a lost dispute took it back before use, or
 *  arrived before the payment did (Dodo does not promise the order), so the credit was never given. */
export type ReportCredit = { at: number; state: "unused" | "used" | "removed"; useId?: string; usedAt?: number; mode?: DodoMode };
/** Audit run 2, finding 5 re-attack: the Dodo mode of a subscription, plan or report credit. Missing is test. */
export const modeOf = (x: { mode?: DodoMode }): DodoMode => x.mode ?? "test";
/** True when a record from this Dodo mode counts now. Once Dodo is live (`liveNow`), only live ones do: in test mode anyone pays
 *  with a free test card, and no live event ever ends a test subscription. In test mode both count, so the flows can be tried
 *  (the proxy still holds test mode plans to Free's limits, apart from TEST_PAYERS). */
export const countsNow = (x: { mode?: DodoMode }, liveNow: boolean): boolean => !liveNow || modeOf(x) === "live";
/** True when the person's paid plan counts now. A plan that came from a payment counts in live mode only when that payment was
 *  live. A plan written with a token and never by a payment (no `planMode`) is left as it is. */
export const paidPlanCounts = (u: User, liveNow: boolean): boolean => !liveNow || u.planMode === undefined || u.planMode === "live";
/** What the payment routes read about an owner, in one step and writing nothing. */
export type Billing = { email: string | null; customerId: string | null; customerMode: DodoMode | null; subs: [string, Sub][]; reports: [string, ReportCredit][] };
export type ReportRemoved = { result: "removed" | "used" | "already" | "unknown"; ownerId?: string };

/** The owner's plan from their subscriptions: any active one wins (the newest renew date shown); then the one kept the longest
 *  (cancelling or past due, until its date); then on hold (a failed renewal); then Free. Audit run 2, finding 5 re-attack: a
 *  paid plan from live subscriptions wins over any from test ones, and the plan keeps the mode it came from, so once Dodo is
 *  live a test card's Pro counts as Free. */
export function bestPlan(subs: readonly [string, Sub][]): OwnerPlan {
  const live = subs.filter(([, x]) => modeOf(x) === "live"), fromLive = bestOf(live);
  if (fromLive.plan !== "free") return { ...fromLive, mode: "live" };
  const any = bestOf(subs);
  return any.plan !== "free" ? { ...any, mode: "test" } : any;
}
function bestOf(subs: readonly [string, Sub][]): OwnerPlan {
  const all = subs.map(([, x]) => x), paid = all.filter((x) => x.plan !== "free");
  const open = paid.filter((x) => x.until === undefined);
  if (open.length) {
    const b = open.reduce((a, x) => ((x.renewsOn ?? 0) > (a.renewsOn ?? 0) ? x : a));
    return { plan: b.plan, status: "active", ...(b.renewsOn !== undefined ? { renewsOn: b.renewsOn } : {}) };
  }
  if (paid.length) {
    const b = paid.reduce((a, x) => ((x.until ?? 0) > (a.until ?? 0) ? x : a));
    return { plan: b.plan, status: b.status === "past_due" ? "past_due" : "cancelling", until: b.until };
  }
  return { plan: "free", status: all.some((x) => x.status === "on_hold") ? "on_hold" : "active" };
}
/** M116 step 5: a subscription that could still charge the person (active, past due, on hold or paused). Deleting the account is
 *  refused while one exists. A cancelling one (Pro until its date, never charged again) and an ended one are not. */
export const chargeableSub = (x: Sub, liveNow = false): boolean => countsNow(x, liveNow) && (x.status === "on_hold" || x.status === "past_due" || (x.status === "active" && x.plan !== "free"));
/** A subscription that could still charge the person, or still gives Pro: a second Pro checkout is refused while one exists. */
export const liveSub = (x: Sub, now: number): boolean =>
  x.status === "on_hold" || (x.plan !== "free" && (x.until === undefined || x.until > now));
/** The sub as kept: only these fields. `was`: the same subscription as kept before. Audit run 2, finding 5, re-attack round 1:
 *  a subscription kept as test mode (or before modes were kept) is never moved up to live by a later event. Dodo's test and
 *  live modes never share a subscription, so a live label there can only come from a mistake, and test is the safe side. */
export const keptSub = (c: SubChange, at: number, was?: Sub): Sub => {
  const mode = c.mode === "live" && was && modeOf(was) !== "live" ? "test" : c.mode;
  return { plan: c.plan, status: c.status, at,
    ...(c.until !== undefined ? { until: c.until } : {}), ...(c.renewsOn !== undefined ? { renewsOn: c.renewsOn } : {}),
    ...(c.customerId ? { customerId: c.customerId, customerMode: c.customerMode ?? "test" } : {}), ...(mode ? { mode } : {}) };
};

/** M116 step 5: the plan an owner is on now, for the operator's view: a payment's plan until its end date, else the plan
 *  written with their newest working token, else Free. Audit run 2, finding 5, round 3: with `liveNow` (Dodo is live), a plan
 *  paid in test mode is Free, as /v1/me and the proxy read it (paidPlanCounts). */
export function shownPlan(paid: OwnerPlan | undefined, tokenPlan: string | null, now: number, liveNow = false): string {
  if (paid) return !countsNow(paid, liveNow) || (paid.until !== undefined && now >= paid.until) ? "free" : paid.plan;
  return tokenPlan ?? "free";
}
/** Subscriptions that give Pro now. Two of them means the person pays twice: the operator refunds one in Dodo. Audit run 2,
 *  finding 5, round 3: with `liveNow`, only live ones count. A test card's subscription is not money in live Dodo. */
export const liveSubCount = (subs: readonly [string, Sub][], now: number, liveNow = false): number =>
  subs.filter(([, x]) => countsNow(x, liveNow) && x.plan !== "free" && (x.until === undefined || x.until > now)).length;

/** One line of use: requests, tokens and dollars. Input counts cached input too. */
export type ModelUse = { requests: number; inputTokens: number; outputTokens: number; usd: number };
/** M116 step 5, the operator's `usage`: one owner's month, read in one step and writing nothing. `byDay`: model requests on
 *  each of the last USAGE_DAYS days (UTC), newest last, for the free daily limit warning. No email unless asked for. */
export type OwnerUsage = { plan: string; email: string | null; liveSubs: number; total: ModelUse; byModel: [string, ModelUse][]; byDay: [string, number][] };
export const USAGE_DAYS = 7;
const DAY_MS = 86_400_000;
const zeroUse = (): ModelUse => ({ requests: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
function addUse(u: ModelUse, r: UsageRecord): void {
  u.requests += 1;
  u.inputTokens += r.usage.input_tokens + r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens;
  u.outputTokens += r.usage.output_tokens;
  u.usd += r.usd;
}
/** The month's totals and models from an owner's records, and the last USAGE_DAYS days' request counts. */
export function usageSummary(records: readonly UsageRecord[], month: string, now: number): Pick<OwnerUsage, "total" | "byModel" | "byDay"> {
  const total = zeroUse(), models = new Map<string, ModelUse>();
  const days = new Map<string, number>();
  for (let i = USAGE_DAYS - 1; i >= 0; i--) days.set(dayKey(now - i * DAY_MS), 0);
  for (const r of records) {
    const d = dayKey(r.at);
    if (days.has(d)) days.set(d, (days.get(d) ?? 0) + 1);
    if (monthKey(r.at) !== month) continue;
    addUse(total, r);
    const m = models.get(r.model) ?? zeroUse();
    addUse(m, r);
    models.set(r.model, m);
  }
  return { total, byModel: [...models], byDay: [...days] };
}

/** M116 step 5: the newest release for one platform (darwin-aarch64 and so on), as the operator set it. `stopped`: pulled. */
export type Release = { version: string; notes: string; url: string; signature: string; pubDate: string; stopped?: boolean };
/** M116 step 5, account delete. `live_sub`: a subscription could still charge. `busy`: a model request is running. */
/** `gone`: the asking token is no longer on the account (a second delete sent at the same time, or a sign out): nothing is
 *  written (audit run 2, finding 2). */
export type Deleted = { ok: true; leftovers: number } | { ok: false; why: "live_sub" | "busy" | "suspended" | "gone" };
/** M116 step 5 review: money that reached Dodo for a deleted account (a checkout opened before the delete and paid after it).
 *  Nothing was granted, so the operator refunds it in Dodo, and cancels the subscription for a `subscription` one. Dodo ids
 *  only: no owner id, no email. `id`: the payment id or the subscription id. Kept until the operator clears it (`refunds done`):
 *  each one is a real payment, so the list cannot be grown by anyone who does not pay. */
/** `mode` (audit run 2, finding 5, round 3): the Dodo mode of the event, from the secret that verified it. Missing is test.
 *  Once Dodo is live, a test mode line is not shown: that payment is not in live Dodo, so there is nothing to refund there. */
export type RefundNeeded = { id: string; kind: "payment" | "subscription"; at: number; eventType: string; customerId?: string; mode?: DodoMode };
/** One page of the owner list for the operator's `usage` (M116 step 5 review): `next` is the cursor for the page after, or null. */
export type OwnerPage = { owners: string[]; next: number | null };
/** M116 step 5, POST /v1/report/use: one credit spent (or the same one again, for a use id seen before). */
export type ReportUse = { ok: true; left: number } | { ok: false };
/** The day and month totals carried over from a deleted account's line when the same person signs in again. */
export type Carry = { day: string; dayUsd: number; month: string; monthUsd: number };
/** What is booked for `now`'s day and month in a set of totals (nothing when they are for another day or month). */
export const carriedFor = (t: Carry | undefined, now: number): Spent =>
  ({ day: t && t.day === dayKey(now) ? t.dayUsd : 0, month: t && t.month === monthKey(now) ? t.monthUsd : 0 });

/** Audit run 2, finding 4 (re-attack round 1): a deleted line's day and month spend, put onto an owner's carry. For the same
 *  day (and the same month) the larger amount stays, and a newer day or month wins as it is, as mergeDeletedLines does. So a
 *  newer line read late (after a carry from an older one) raises the carry, and the same line twice changes nothing. An owner
 *  that still holds a record from before the line was written does not take it (the line already counts that record); records
 *  booked after the line never stop it (finding 6, re-attack round 2). */
export function mergeCarry(was: Carry | undefined, l: Carry): Carry {
  const c: Carry = { day: l.day, dayUsd: l.dayUsd, month: l.month, monthUsd: l.monthUsd };
  if (!was) return c;
  const pick = (a: string, au: number, b: string, bu: number): [string, number] => (a === b ? [a, Math.max(au, bu)] : a > b ? [a, au] : [b, bu]);
  [c.day, c.dayUsd] = pick(was.day, was.dayUsd, l.day, l.dayUsd);
  [c.month, c.monthUsd] = pick(was.month, was.monthUsd, l.month, l.monthUsd);
  return c;
}
/** What GET /v1/me reads, in one step and writing nothing: the token's user, what they spent (with holds), and the owner's email. */
export type Account = { user: User; spent: Spent; email: string | null };
/** M116 sign in: the email to keep on the owner, and the nonce to mark used in the same write that keeps the token's hash. */
export type SignIn = { email: string; nonceId: string; nonceUntil: number; now: number; deletedKey?: string };
/** One line of the suspension log: ids and dates only, never text. `caseId` is a short reference of ours (a report or notice number). */
export type SuspensionRecord = { ownerId: string; kind: "suspended" | "restored"; at: number; caseId?: string };
export type UsageRecord = { userId: string; model: string; usage: Usage; usd: number; at: number; complete: boolean };
/** M116 step 3, one step to start a model request: `max` running at once, `usd` its worst case held while it runs, checked
 *  against `limits` (null for a request that costs nothing, which takes only a slot), `id` the request's own id. `need`
 *  (audit run 2, finding 6): the part of `usd` that must fit under the limits with what is spent and held (the prompt). */
/** `hash`: the token the request was found by; when given, a start for a token no longer on the owner (signed out, or the
 *  account deleted since it was read) is refused as `gone`. */
export type StartAsk = { max: number; usd: number; now: number; limits: Plan | null; id: string; need?: number; hash?: string };
/** Over the limit comes before busy, and either way nothing was taken. `spent` is what the limit was checked against. */
/** `gone`: the owner holds nobody (its account was deleted after the token was read); the person signs in again. */
export type Started = { ok: true } | { ok: false; why: "busy" } | { ok: false; why: "gone" } | { ok: false; why: "over"; spent: Spent };
/** One step to finish it: let go of its slot and hold and, with `record`, book what it really cost. */
export type FinishAsk = { id: string; now: number; record?: UsageRecord };

export interface Store {
  userByTokenHash(hash: string): Promise<User | null>;
  /** M116 step 3: what the proxy uses, so a model request writes at most 3 rows on Cloudflare (the slot and hold together
   *  here, then the slot let go and the record with the day and month totals in `finish`). The check and the taking are one
   *  step, so many requests at once never pass on the same last cent or past the cap. */
  start(userId: string, a: StartAsk): Promise<Started>;
  /** Lets go of only this request's slot and hold (by its id) and books `record` if given, in one step. */
  finish(userId: string, a: FinishAsk): Promise<void>;
  spent(userId: string, now: number): Promise<Spent>;
  record(r: UsageRecord): Promise<void>;
  /** Take one of the user's running request slots; false when `max` are already running. `id` is the request's own id: `end`
   *  with the same id lets go of only that slot (a request that ends after its slot ran out never takes another's). */
  begin(userId: string, max: number, id?: string): Promise<boolean>;
  end(userId: string, id?: string): Promise<void>;
  /** Hold `usd` (a request's worst case) against the user's budget while it runs, in one step with the check against the
   *  plan's limits (`budgetCheck`): it sees what is spent plus what other running requests hold, and false means nothing was
   *  held. `spent` counts what is held. The limits are passed as data, not as a function, so a store in another place can check. */
  hold(userId: string, usd: number, now: number, limits: Plan, id?: string): Promise<boolean>;
  /** Let go of a hold when its request ends (its real cost is booked with `record`). With `id`, only that request's own hold. */
  unhold(userId: string, usd: number, id?: string): Promise<void>;
  /** Save a sign in token's hash for an owner (the token itself is never kept). */
  addUser(hash: string, u: User): void | Promise<void>;
  /** Every owner id we hold, for finding who an opaque user id belongs to. */
  listOwnerIds(): Promise<string[]>;
  /** Cut one person off: every token of theirs stops working at once, and a new one cannot be issued until restoreOwner.
   *  The block is its own flag, so a late payment event that writes a plan cannot lift it. */
  suspendOwner(ownerId: string, info: { at: number; caseId?: string }): Promise<{ tokensRevoked: number; alreadySuspended: boolean }>;
  /** Lift the block so a new token can be issued. Old tokens stay dead (the person signs in again). False if not suspended. */
  restoreOwner(ownerId: string, info: { at: number; caseId?: string }): Promise<boolean>;
  isSuspended(ownerId: string): Promise<boolean>;
  /** The plan the owner already has (from their newest token that still works), or null for someone new. Signing in again keeps it. */
  planOfOwner?(ownerId: string): Promise<string | null>;
  /** The plan a new sign in token is written with: the newest working token's own plan (one the operator gave with
   *  issueToken), never the plan a payment gave (that stays only in the owner's plan record, with its Dodo mode). Audit run
   *  2, finding 5 (re-attack round 2): copying the payment plan's name onto a token dropped its mode, and a delete raced with
   *  the sign in left that token "pro" with no plan record, so a test card's Pro counted once Dodo was live. Null: none. */
  grantedPlanOf?(ownerId: string): Promise<string | null>;
  /** Write the plan a payment event gave an owner (every token of theirs that still works). With `at` (the event's time, ms),
   *  an event older than one already applied changes nothing, in the same step, and the answer is false. */
  setOwnerPlan?(ownerId: string, plan: OwnerPlan, at?: number): Promise<boolean>;
  suspensions(): Promise<SuspensionRecord[]>;
  /** M116: keep a new sign in token's hash, the owner's email (replacing an older one) and the nonce as used, all in one write.
   *  False, and nothing written, when that nonce was used before (and has not run out). */
  signIn(hash: string, u: User, o: SignIn): Promise<boolean>;
  /** M116, GET /v1/me: the token's account, or null for a token we do not hold. Reads only. */
  account(hash: string, now: number): Promise<Account | null>;
  /** M116 sign out: forget this token's hash. False when it was not held. */
  dropToken(hash: string): Promise<boolean>;
  /** M116 sign out on all Macs: forget every token hash of the owner. The number that still worked. The account, its email
   *  and its plan stay. */
  dropAllTokens(ownerId: string): Promise<number>;
  /** M116 step 4: write one subscription's state from a Dodo event, and the owner's plan as the best of their subscriptions, in
   *  one step. False, and nothing written, when this subscription already has a newer event. Saves `customerId` (with its
   *  `customerMode`, test when missing) when given. */
  applySubscription(ownerId: string, subscriptionId: string, change: SubChange, at: number): Promise<boolean>;
  /** M116: the owner's email, Dodo customer id, subscriptions and report credits. Reads only. */
  billingOf(ownerId: string): Promise<Billing>;
  /** M116: keep the Dodo customer id on the owner (from a payment whose signed metadata names them), with the mode it came from.
   *  A customer id already saved for that mode is never replaced (audit run 2, finding 1). */
  saveCustomer(ownerId: string, customerId: string, mode?: DodoMode): Promise<void>;
  /** M116: one report credit for this payment_id, kept with the Dodo mode it was paid in (missing: test). "known" when that payment was seen before (a retry, or one refunded since),
   *  or was refunded or lost in a dispute before it arrived: then the credit is kept as removed, never given. */
  addReport(ownerId: string, paymentId: string, at: number, mode?: DodoMode): Promise<"added" | "known">;
  /** M116: take back an unused credit (a full refund or a lost dispute). The owner is found by the payment_id. For a payment
   *  not seen yet ("unknown"), a marker is kept by payment_id, so the payment's credit, if it comes later, is never given. */
  removeReport(paymentId: string, at?: number): Promise<ReportRemoved>;
  /** M116 step 5, POST /v1/report/use: spend the oldest unused credit, in one step. With `useId`, a use id seen before spends
   *  nothing more (a retry after a lost answer). With `liveNow` (Dodo is live), only a credit paid in live mode is spent, and
   *  only such a credit's use id answers yes again (a test mode credit's use id replayed after go live is a new use). */
  useReport(ownerId: string, a: { now: number; useId?: string; liveNow?: boolean }): Promise<ReportUse>;
  /** M116 step 5: delete the account. Refused while a subscription could still charge, or a model request runs. Removes the
   *  owner, every token hash, the usage records, the email and the payment links (a link to a Dodo customer, and a report
   *  payment's owner, become DELETED_PREFIX + key). With `liveNow` (Dodo is live), a test mode subscription does not refuse it. Keeps the suspension log lines, with DELETED_PREFIX + key in place of the
   *  owner id, and one line under `key` (deleted.ts) until its `until`. */
  deleteAccount(ownerId: string, a: { key: string; now: number; hash?: string; liveNow?: boolean }): Promise<Deleted>;
  /** True while the owner's account is deleted: the line under `key` is kept (it goes at its `until`) and the owner has not
   *  signed in again. */
  isDeletedOwner(ownerId: string, key: string, now: number): Promise<boolean>;
  /** M116 step 5 review: up to `limit` owner ids after the cursor `after` (none: from the start), in the order they came. */
  ownerPage(a: { after?: number; limit: number }): Promise<OwnerPage>;
  /** M116 step 5 review: keep one refund line for the operator (the same id twice is kept once). */
  flagRefund(r: RefundNeeded): Promise<void>;
  refundsNeeded(): Promise<RefundNeeded[]>;
  /** The operator refunded it in Dodo: forget the line. False when there was none. */
  clearRefund(id: string): Promise<boolean>;
  /** M116 step 5, the operator's `usage`. Reads only. */
  /** `liveNow`: Dodo is live, so only live mode payments count in the plan shown and the subscriptions counted. */
  ownerUsage(ownerId: string, a: { month: string; now: number; liveNow?: boolean }): Promise<OwnerUsage>;
  /** M116 step 5, the update feed. */
  setRelease(platform: string, r: Release): Promise<void>;
  release(platform: string): Promise<Release | null>;
  /** Pull the platform's release at once. False when there is none (or it was already stopped). */
  stopRelease(platform: string): Promise<boolean>;
  releases(): Promise<[string, Release][]>;
}

export class MemoryStore implements Store {
  #users = new Map<string, User>();
  #spent = new Map<string, number>();
  #running = new Map<string, number>();
  #held = new Map<string, number>();
  #started = new Map<string, { userId: string; usd: number }>();
  #suspended = new Set<string>();
  #plans = new Map<string, { plan: OwnerPlan; at?: number }>();
  #emails = new Map<string, string>();
  #nonces = new Map<string, Map<string, number>>();
  #log: SuspensionRecord[] = [];
  #subs = new Map<string, Map<string, Sub>>();
  #customers = new Map<string, { id: string; mode: DodoMode }>();
  #removedEarly = new Set<string>();
  #reports = new Map<string, Map<string, ReportCredit>>();
  #reportOwners = new Map<string, string>();
  #deleted = new Map<string, DeletedLine>();
  #carry = new Map<string, Carry>();
  #releases = new Map<string, Release>();
  #refunds = new Map<string, RefundNeeded>();
  records: UsageRecord[] = [];
  addUser(hash: string, u: User) { this.#users.set(hash, u); }
  setSpent(userId: string, now: number, s: Spent) { this.#spent.set(`${userId}|d|${dayKey(now)}`, s.day); this.#spent.set(`${userId}|m|${monthKey(now)}`, s.month); }
  async userByTokenHash(hash: string): Promise<User | null> {
    const u = this.#users.get(hash) ?? null;
    if (!u) return null;
    const paid = this.#plans.get(u.id)?.plan;
    if (this.#suspended.has(u.id)) return { id: u.id, plan: paid?.plan ?? u.plan, status: "suspended" };   // the flag wins over whatever status was written
    if (u.status === "revoked" || !paid) return u;
    return { id: u.id, plan: paid.plan, status: paid.status, ...(paid.until !== undefined ? { planUntil: paid.until } : {}), ...(paid.renewsOn !== undefined ? { renewsOn: paid.renewsOn } : {}), planMode: paid.mode ?? "test" };
  }
  async signIn(hash: string, u: User, o: SignIn) {
    const used = this.#nonces.get(u.id) ?? new Map<string, number>();
    for (const [id, until] of used) if (until < o.now) used.delete(id);
    // M116 step 5: coming back after a delete. A nonce used before the delete stays used, and the month's spend comes back.
    this.#pruneDeleted(o.now);
    const line = o.deletedKey ? this.#deleted.get(o.deletedKey) : undefined;
    for (const [id, until] of line?.nonces ?? []) if (until >= o.now) used.set(id, Math.max(until, used.get(id) ?? 0));
    if (used.has(o.nonceId)) return false;
    // The line is not dropped here: it goes at its `until` (audit run 2, finding 4, re-attack round 1). While the owner holds
    // data it does not count as deleted, and a later delete merges into it.
    // Finding 6, re-attack round 2: only a record from before the line (or the same moment) stops the carry (the line already counts it).
    if (line && !this.records.some((r) => r.userId === u.id && r.at <= line.at)) this.#carry.set(u.id, mergeCarry(this.#carry.get(u.id), line));
    used.set(o.nonceId, o.nonceUntil);
    this.#nonces.set(u.id, used);
    this.#emails.set(u.id, o.email);
    this.#users.set(hash, u);
    return true;
  }
  async account(hash: string, now: number) {
    const user = await this.userByTokenHash(hash);
    return user ? { user, spent: this.#spentNow(user.id, now), email: this.#emails.get(user.id) ?? null } : null;
  }
  async dropToken(hash: string) { return this.#users.delete(hash); }
  async dropAllTokens(ownerId: string) {
    let n = 0;
    for (const [hash, u] of this.#users) if (u.id === ownerId) { if (u.status !== "revoked") n++; this.#users.delete(hash); }
    return n;
  }
  async setOwnerPlan(ownerId: string, plan: OwnerPlan, at?: number) {
    const was = this.#plans.get(ownerId);
    if (at !== undefined && was?.at !== undefined && at < was.at) return false;
    this.#plans.set(ownerId, { plan, at: at !== undefined ? Math.max(at, was?.at ?? 0) : was?.at });
    return true;
  }
  async applySubscription(ownerId: string, subscriptionId: string, change: SubChange, at: number) {
    const subs = this.#subs.get(ownerId) ?? new Map<string, Sub>();
    const was = subs.get(subscriptionId);
    if (was && at < was.at) return false;
    subs.set(subscriptionId, keptSub(change, at, was));
    this.#subs.set(ownerId, subs);
    if (change.customerId) this.#customers.set(ownerId, { id: change.customerId, mode: change.customerMode ?? "test" });
    const prev = this.#plans.get(ownerId);
    this.#plans.set(ownerId, { plan: bestPlan([...subs]), at: Math.max(at, prev?.at ?? 0) });
    return true;
  }
  async billingOf(ownerId: string) {
    const c = this.#customers.get(ownerId);
    return { email: this.#emails.get(ownerId) ?? null, customerId: c?.id ?? null, customerMode: c?.mode ?? null,
      subs: [...(this.#subs.get(ownerId) ?? [])].map(([k, v]): [string, Sub] => [k, { ...v }]),
      reports: [...(this.#reports.get(ownerId) ?? [])].map(([k, v]): [string, ReportCredit] => [k, { ...v }]) };
  }
  async saveCustomer(ownerId: string, customerId: string, mode: DodoMode = "test") {
    if (this.#customers.get(ownerId)?.mode === mode) return;   // never replaces a saved id of the same mode (audit run 2, finding 1)
    this.#customers.set(ownerId, { id: customerId, mode });
  }
  async addReport(ownerId: string, paymentId: string, at: number, mode?: DodoMode) {
    const owner = this.#reportOwners.get(paymentId) ?? ownerId;   // a payment belongs to whoever it was first seen for
    this.#reportOwners.set(paymentId, owner);
    const list = this.#reports.get(owner) ?? new Map<string, ReportCredit>();
    if (list.has(paymentId)) return "known" as const;
    const early = this.#removedEarly.has(paymentId);   // refunded or lost before it arrived: kept, never given
    list.set(paymentId, { at, state: early ? "removed" : "unused", ...(mode ? { mode } : {}) });
    this.#reports.set(owner, list);
    return early ? "known" as const : "added" as const;
  }
  async removeReport(paymentId: string): Promise<ReportRemoved> {
    const ownerId = this.#reportOwners.get(paymentId), c = ownerId ? this.#reports.get(ownerId)?.get(paymentId) : undefined;
    if (!ownerId || !c) { this.#removedEarly.add(paymentId); return { result: "unknown" }; }
    if (c.state === "used") return { result: "used", ownerId };
    if (c.state === "removed") return { result: "already", ownerId };
    c.state = "removed";
    return { result: "removed", ownerId };
  }
  async useReport(ownerId: string, a: { now: number; useId?: string; liveNow?: boolean }): Promise<ReportUse> {
    const list = this.#reports.get(ownerId) ?? new Map<string, ReportCredit>();
    const spendable = (c: ReportCredit) => c.state === "unused" && countsNow(c, a.liveNow === true);
    const unused = () => [...list.values()].filter(spendable).length;
    // Audit run 2, finding 5 (re-attack round 2): only a credit that counts now answers its retry key (see owner.useReport).
    if (a.useId && [...list.values()].some((c) => c.useId === a.useId && countsNow(c, a.liveNow === true))) return { ok: true, left: unused() };
    let pick: ReportCredit | undefined;
    for (const c of list.values()) if (spendable(c) && (!pick || c.at < pick.at)) pick = c;
    if (!pick) return { ok: false };
    pick.state = "used"; pick.usedAt = a.now;
    if (a.useId) pick.useId = a.useId;
    return { ok: true, left: unused() };
  }
  async deleteAccount(ownerId: string, a: { key: string; now: number; hash?: string; liveNow?: boolean }): Promise<Deleted> {
    if (a.hash !== undefined && this.#users.get(a.hash)?.id !== ownerId) return { ok: false, why: "gone" };
    if (this.#suspended.has(ownerId)) return { ok: false, why: "suspended" };
    if ([...(this.#subs.get(ownerId)?.values() ?? [])].some((x) => chargeableSub(x, a.liveNow === true))) return { ok: false, why: "live_sub" };
    if ((this.#running.get(ownerId) ?? 0) > 0) return { ok: false, why: "busy" };
    const booked = { day: this.#spent.get(`${ownerId}|d|${dayKey(a.now)}`) ?? 0, month: this.#spent.get(`${ownerId}|m|${monthKey(a.now)}`) ?? 0 };
    const carried = carriedFor(this.#carry.get(ownerId), a.now);
    const nonces: [string, number][] = [...(this.#nonces.get(ownerId) ?? [])].filter(([, until]) => until >= a.now);
    this.#pruneDeleted(a.now);
    this.#deleted.set(a.key, mergeDeletedLines(this.#deleted.get(a.key), { at: a.now, day: dayKey(a.now), dayUsd: booked.day + carried.day, month: monthKey(a.now), monthUsd: booked.month + carried.month, nonces, until: deletedUntil(a.now, nonces) }));
    // The suspension log keeps its lines, under the same HMAC instead of the owner id (no Google id is kept).
    for (const l of this.#log) if (l.ownerId === ownerId) l.ownerId = `${DELETED_PREFIX}${a.key}`;
    for (const [hash, u] of this.#users) if (u.id === ownerId) this.#users.delete(hash);
    for (const m of [this.#emails, this.#nonces, this.#plans, this.#subs, this.#customers, this.#reports, this.#carry, this.#running, this.#held]) m.delete(ownerId);
    for (const [p, o] of this.#reportOwners) if (o === ownerId) this.#reportOwners.delete(p);
    for (const [id, x] of this.#started) if (x.userId === ownerId) this.#started.delete(id);
    for (const k of this.#spent.keys()) if (k.startsWith(`${ownerId}|`)) this.#spent.delete(k);
    this.records = this.records.filter((r) => r.userId !== ownerId);
    return { ok: true, leftovers: 0 };
  }
  async isDeletedOwner(ownerId: string, key: string, now: number) {
    this.#pruneDeleted(now);
    return this.#deleted.has(key) && !this.#emails.has(ownerId) && ![...this.#users.values()].some((u) => u.id === ownerId);
  }
  /** Lines past their `until` go. */
  #pruneDeleted(now: number) { for (const [k, l] of this.#deleted) if (!deletedLineLive(l, now)) this.#deleted.delete(k); }
  async ownerPage(a: { after?: number; limit: number }): Promise<OwnerPage> {
    const all = await this.listOwnerIds(), from = a.after ?? 0, owners = all.slice(from, from + a.limit);
    return { owners, next: from + owners.length < all.length ? from + owners.length : null };
  }
  async flagRefund(r: RefundNeeded) {
    if (this.#refunds.has(r.id)) return;
    this.#refunds.set(r.id, { id: r.id, kind: r.kind, at: r.at, eventType: r.eventType, ...(r.customerId ? { customerId: r.customerId } : {}), ...(r.mode ? { mode: r.mode } : {}) });
  }
  async refundsNeeded() { return [...this.#refunds.values()].map((r) => ({ ...r })); }
  async clearRefund(id: string) { return this.#refunds.delete(id); }
  async ownerUsage(ownerId: string, a: { month: string; now: number; liveNow?: boolean }): Promise<OwnerUsage> {
    let tokenPlan: string | null = null;
    for (const u of this.#users.values()) if (u.id === ownerId && u.status !== "revoked") tokenPlan = u.plan;
    return {
      plan: shownPlan(this.#plans.get(ownerId)?.plan, tokenPlan, a.now, a.liveNow === true), email: this.#emails.get(ownerId) ?? null,
      liveSubs: liveSubCount([...(this.#subs.get(ownerId) ?? [])], a.now, a.liveNow === true),
      ...usageSummary(this.records.filter((r) => r.userId === ownerId), a.month, a.now),
    };
  }
  async setRelease(platform: string, r: Release) { this.#releases.set(platform, { ...r }); }
  async release(platform: string) { const r = this.#releases.get(platform); return r ? { ...r } : null; }
  async stopRelease(platform: string) {
    const r = this.#releases.get(platform);
    if (!r || r.stopped) return false;
    this.#releases.set(platform, { ...r, stopped: true });
    return true;
  }
  async releases() { return [...this.#releases].map(([p, r]): [string, Release] => [p, { ...r }]); }
  async listOwnerIds() { return [...new Set([...[...this.#users.values()].map((u) => u.id), ...this.#emails.keys()])]; }
  async isSuspended(ownerId: string) { return this.#suspended.has(ownerId); }
  async grantedPlanOf(ownerId: string) {
    let plan: string | null = null;
    for (const u of this.#users.values()) if (u.id === ownerId && u.status !== "revoked") plan = u.plan;   // the newest one wins
    return plan;
  }
  async planOfOwner(ownerId: string) {
    const paid = this.#plans.get(ownerId);
    if (paid) return paid.plan.plan;
    let plan: string | null = null;
    for (const u of this.#users.values()) if (u.id === ownerId && u.status !== "revoked") plan = u.plan;   // the newest one wins
    return plan;
  }
  async suspensions() { return this.#log.map((r) => ({ ...r })); }
  async suspendOwner(ownerId: string, info: { at: number; caseId?: string }) {
    if (this.#suspended.has(ownerId)) return { tokensRevoked: 0, alreadySuspended: true };
    let tokensRevoked = 0;
    for (const [hash, u] of this.#users) if (u.id === ownerId && u.status !== "revoked") { this.#users.set(hash, { ...u, status: "revoked" }); tokensRevoked++; }
    this.#suspended.add(ownerId);
    this.#log.push({ ownerId, kind: "suspended", at: info.at, ...(info.caseId ? { caseId: info.caseId } : {}) });
    return { tokensRevoked, alreadySuspended: false };
  }
  async restoreOwner(ownerId: string, info: { at: number; caseId?: string }) {
    if (!this.#suspended.delete(ownerId)) return false;
    this.#log.push({ ownerId, kind: "restored", at: info.at, ...(info.caseId ? { caseId: info.caseId } : {}) });
    return true;
  }
  async spent(userId: string, now: number): Promise<Spent> { return this.#spentNow(userId, now); }
  #spentNow(userId: string, now: number): Spent {
    const held = this.#held.get(userId) ?? 0, carried = carriedFor(this.#carry.get(userId), now);
    return { day: (this.#spent.get(`${userId}|d|${dayKey(now)}`) ?? 0) + held + carried.day, month: (this.#spent.get(`${userId}|m|${monthKey(now)}`) ?? 0) + held + carried.month };
  }
  // No await between the check and the hold, so two requests can never both pass on the same room.
  async hold(userId: string, usd: number, now: number, limits: Plan) {
    if (!budgetCheck(limits, this.#spentNow(userId, now), now).ok) return false;
    this.#held.set(userId, (this.#held.get(userId) ?? 0) + usd);
    return true;
  }
  // No await between the checks and the taking, as in hold.
  async start(userId: string, a: StartAsk): Promise<Started> {
    // Audit run 2, finding 4 (re-attack round 2): the token the request was found by must still be this owner's.
    if (a.hash !== undefined && this.#users.get(a.hash)?.id !== userId) return { ok: false, why: "gone" };
    if (a.limits) {
      const spent = this.#spentNow(userId, a.now);
      if (!budgetCheck(a.limits, spent, a.now, a.need ?? 0).ok) return { ok: false, why: "over", spent };
    }
    const n = this.#running.get(userId) ?? 0;
    if (n >= a.max) return { ok: false, why: "busy" };
    this.#running.set(userId, n + 1);
    if (a.usd > 0) this.#held.set(userId, (this.#held.get(userId) ?? 0) + a.usd);
    this.#started.set(a.id, { userId, usd: a.usd });
    return { ok: true };
  }
  // Audit run 2, finding 4 (re-attack round 2): a request started on this owner books (a delete clears what was started); any
  // other booking lands only on an owner someone is in, never on a deleted one.
  async finish(userId: string, a: FinishAsk) {
    const was = this.#started.get(a.id), mine = !!was && was.userId === userId;
    if (was && mine) {
      this.#started.delete(a.id);
      await this.end(userId);
      if (was.usd > 0) await this.unhold(userId, was.usd);
    }
    if (a.record && (mine || this.#present(a.record.userId))) this.#book(a.record);
  }
  async unhold(userId: string, usd: number) { this.#held.set(userId, Math.max(0, (this.#held.get(userId) ?? 0) - usd)); }
  async record(r: UsageRecord) { this.#book(r); }
  /** Is anyone here (an email or a token)? A deleted account holds nothing. */
  #present(ownerId: string) { return this.#emails.has(ownerId) || [...this.#users.values()].some((u) => u.id === ownerId); }
  #book(r: UsageRecord) {
    this.records.push(r);
    for (const k of [`${r.userId}|d|${dayKey(r.at)}`, `${r.userId}|m|${monthKey(r.at)}`]) this.#spent.set(k, (this.#spent.get(k) ?? 0) + r.usd);
  }
  async begin(userId: string, max: number) { const n = this.#running.get(userId) ?? 0; if (n >= max) return false; this.#running.set(userId, n + 1); return true; }
  async end(userId: string) { this.#running.set(userId, Math.max(0, (this.#running.get(userId) ?? 0) - 1)); }
  inFlight(userId: string) { return this.#running.get(userId) ?? 0; }
  /** Everything held, for a test that checks no text or secret is among it. */
  dump() { return { users: [...this.#users], emails: [...this.#emails], nonces: [...this.#nonces].map(([o, m]) => [o, [...m]]), suspended: [...this.#suspended], plans: [...this.#plans], subs: [...this.#subs].map(([o, m]) => [o, [...m]]), customers: [...this.#customers], removedEarly: [...this.#removedEarly], reports: [...this.#reports].map(([o, m]) => [o, [...m]]), reportOwners: [...this.#reportOwners], deleted: [...this.#deleted], refunds: [...this.#refunds], carry: [...this.#carry], releases: [...this.#releases], log: this.#log, spent: [...this.#spent], running: [...this.#running], held: [...this.#held], records: this.records }; }
}
