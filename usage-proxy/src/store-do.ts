// The real store (M99): Cloudflare Durable Objects. One object per owner holds everything about that person (their tokens, the
// suspension flag, today's and this month's spend, the requests running and what they hold, one small record per request, the
// plan a payment gave them). Each object does its read, check and write as one step, so two requests at once, even from two
// server instances, can never both pass on the same last cent. A few small objects hold what is not one person's: a token's
// owner (one object per token hash), the list of owners and the suspension log (`directory`), and the payment event ids and
// customer links (`payments`).
//
// Nothing here ever holds a request or reply body, a prompt, a token (only its hash), a key or a secret. What is kept is ids,
// dates, plan names, counts and dollars, as in the in memory store (store.ts), and the same tests pass against both.
//
// It needs nothing from Cloudflare at build time: the object talks through `fetch`, and the types below are the small part of the
// Durable Object API it uses, so the tests run it on a fake of that API (test/fake-do.ts) with Bun alone.
import { budgetCheck, dayKey, monthKey, type Plan, type Spent } from "./plans.ts";
import { bestPlan, carriedFor, chargeableSub, keptSub, liveSubCount, shownPlan, usageSummary, type Account, type Billing, type Carry, type Deleted, type DodoMode, type FinishAsk, type OwnerPage, type OwnerUsage, type RefundNeeded, type Release, type ReportCredit, type ReportRemoved, type ReportUse, type SignIn, type StartAsk, type Started, type Store, type Sub, type SubChange, type SuspensionRecord, type UsageRecord, type User, type OwnerPlan } from "./store.ts";
import type { DodoLedger, LinkBook } from "./dodo.ts";
import { DELETED_PREFIX, deletedLineLive, deletedUntil, isDeletedMarker, type DeletedLine } from "./deleted.ts";

/** The part of Durable Object storage used here (the key value calls, on SQLite backed objects too). */
export interface StorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(keys: string[]): Promise<number>;
  list<T = unknown>(options: { prefix: string; reverse?: boolean; limit?: number; startAfter?: string }): Promise<Map<string, T>>;
}
export type StateLike = { storage: StorageLike };
export type StubLike = { fetch(input: string, init?: RequestInit): Promise<Response> };
export interface NamespaceLike<Id = unknown> {
  idFromName(name: string): Id;
  get(id: Id): StubLike;
}

/** A running request's slot, and a hold, are let go by themselves after this long, so a server that stopped mid request (its
 *  instance went away before it could say it ended) cannot leave a person stuck at "too many at once" or short of budget for
 *  good. Longer than the longest answer the proxy allows (64,000 tokens at a slow stream is about 20 minutes). */
export const LEASE_MS = 30 * 60 * 1000;
/** How long one small record per request is kept (counts and cost only). Older ones are dropped, at most once a day per
 *  person. M116: the day and month totals live in the newest record itself, so they go with the records. */
export const RECORD_KEEP_MS = 90 * 24 * 3600 * 1000;
/** The most sign ins kept per person (one token hash each). Past it the oldest go first, stopped ones before working ones, and a
 *  dropped token simply stops working (the person signs in again). */
export const MAX_TOKENS_KEPT = 50;
/** How long a payment event id is remembered (M116): 48 hours, because Dodo retries a delivery for about 37 hours, each time
 *  with a fresh signature and the same id (https://docs.dodopayments.com/developer-resources/webhooks). The in memory ledger
 *  keeps the same (dodo.ts). */
export const WEBHOOK_KEEP_MS = 48 * 3600 * 1000;

type Tok = { plan: string; status: User["status"] };
/** `id`: the request's own id, so a request that ends late lets go of only its own slot or hold, never another's of the same amount. */
type Lease = { at: number; usd: number; id?: string };
/** M116 step 3: an owner's running requests, their holds, the record count and the day of the last tidy, in one key, so starting
 *  a request writes one row and finishing it two (this key and its record). Rows written are what the free plan counts. */
type Live = { running: Lease[]; holds: Lease[]; seq: number; prunedOn?: string };
/** The day and month totals as of a record, carried by the record itself (the newest one is the one read). */
type Totals = { day: string; dayUsd: number; month: string; monthUsd: number };
type KeptRecord = UsageRecord & { totals: Totals };
/** M116 step 4: an owner's payments in one key: the Dodo customer id, each subscription's state, and the report credits by
 *  payment_id. Lists of pairs, not objects, so no id from Dodo can ever be read as an object's own machinery. */
type BillingRec = { customerId?: string; customerMode?: DodoMode; subs: [string, Sub][]; reports: [string, ReportCredit][] };
async function billingRec(s: StorageLike): Promise<BillingRec> {
  const b = await s.get<BillingRec>("billing");
  return { ...(b?.customerId ? { customerId: b.customerId, customerMode: b.customerMode ?? "test" } : {}), subs: b?.subs ?? [], reports: b?.reports ?? [] };
}
const pad = (n: number, w = 15) => String(Math.max(0, Math.floor(n))).padStart(w, "0");

/** One Durable Object. The Worker reaches it only through its binding; it is never on the public address. */
export class StoreObject {
  #chain: Promise<unknown> = Promise.resolve();
  constructor(private ctx: StateLike, _env?: unknown) {}

  /** One step at a time in this object: each call runs whole before the next starts, whatever it waits on. */
  #oneAtATime<T>(job: () => Promise<T>): Promise<T> {
    const mine = this.#chain.then(job);
    this.#chain = mine.catch(() => {});
    return mine;
  }

  async fetch(req: Request): Promise<Response> {
    const op = new URL(req.url).pathname.slice(1);
    let args: Record<string, unknown> = {};
    try { args = (await req.json()) as Record<string, unknown>; } catch { return new Response(JSON.stringify({ error: "unreadable" }), { status: 400 }); }
    const run = OPS[op];
    if (!run) return new Response(JSON.stringify({ error: "unknown" }), { status: 404 });
    try {
      const r = await this.#oneAtATime(() => run(this.ctx.storage, args));
      return new Response(JSON.stringify({ r: r ?? null }), { headers: { "content-type": "application/json" } });
    } catch {
      // never the error's text: it could carry something it should not
      return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
    }
  }
}

// ---------- what each kind of object does ----------

type Op = (s: StorageLike, a: any) => Promise<unknown>;
const alive = (list: Lease[], now: number): Lease[] => list.filter((x) => now - x.at < LEASE_MS);
const without = (list: Lease[], id: string | undefined) => {
  const i = id ? list.findIndex((x) => x.id === id) : list.findIndex((x) => !x.id);
  return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
};

async function ownerTokens(s: StorageLike): Promise<[string, Tok][]> { return (await s.get<[string, Tok][]>("tokens")) ?? []; }
async function liveOf(s: StorageLike): Promise<Live> {
  const l = await s.get<Live>("live");
  return { running: l?.running ?? [], holds: l?.holds ?? [], seq: l?.seq ?? 0, ...(l?.prunedOn ? { prunedOn: l.prunedOn } : {}) };
}
async function newestRecord(s: StorageLike): Promise<KeptRecord | undefined> {
  for (const r of (await s.list<KeptRecord>({ prefix: "rec:", reverse: true, limit: 1 })).values()) return r;
  return undefined;
}
/** What is booked for `now`'s day and month, from the newest record's totals (nothing when they are for another day or month). */
const bookedFor = (t: Totals | undefined, now: number): Spent =>
  ({ day: t && t.day === dayKey(now) ? t.dayUsd : 0, month: t && t.month === monthKey(now) ? t.monthUsd : 0 });
async function spentNow(s: StorageLike, now: number, l?: Live): Promise<Spent> {
  const held = alive((l ?? (await liveOf(s))).holds, now).reduce((n, h) => n + h.usd, 0);
  const booked = await bookedNow(s, now);
  return { day: booked.day + held, month: booked.month + held };
}
/** What is booked for `now`'s day and month: the newest record's totals, plus what a deleted account carried over (M116 step 5). */
async function bookedNow(s: StorageLike, now: number): Promise<Spent> {
  const booked = bookedFor((await newestRecord(s))?.totals, now), carried = carriedFor(await s.get<Carry>("carry"), now);
  return { day: booked.day + carried.day, month: booked.month + carried.month };
}
/** M116 step 5: why this owner's account cannot be deleted now, or null. */
async function deleteRefusal(s: StorageLike, now: number): Promise<Exclude<Deleted, { ok: true }>["why"] | null> {
  if ((await s.get<boolean>("suspended")) === true) return "suspended";
  if ((await billingRec(s)).subs.some(([, x]) => chargeableSub(x))) return "live_sub";
  if (alive((await liveOf(s)).running, now).length > 0) return "busy";
  return null;
}
/** The deleted line for this owner as of `now`: this day's and month's spend, and the sign in nonces still good. */
async function deletedLineOf(s: StorageLike, now: number): Promise<DeletedLine> {
  const b = await bookedNow(s, now);
  const nonces = ((await s.get<[string, number][]>("nonces")) ?? []).filter(([, until]) => until >= now);
  return { at: now, day: dayKey(now), dayUsd: b.day, month: monthKey(now), monthUsd: b.month, nonces, until: deletedUntil(now, nonces) };
}
/** M116 step 5 review: the deleted lines past their `until` go. Each line has an index key `dx:<until>:<key>`, in time order, so
 *  this reads only the lines that are due (and one more), never the whole list. */
async function pruneDeleted(s: StorageLike, now: number): Promise<void> {
  for (;;) {
    const batch = await s.list<string>({ prefix: "dx:", limit: DELETE_MAX / 2 });
    const due: string[] = [];
    let reachedLive = batch.size < DELETE_MAX / 2;
    for (const [k, key] of batch) { if (Number(k.slice(3, 18)) <= now) due.push(k, `del:${key}`); else { reachedLive = true; break; } }
    await deleteAll(s, due);
    if (reachedLive || due.length === 0) break;
  }
}
const deletedIndex = (until: number, key: string) => `dx:${pad(until)}:${key}`;
/** Every key an object holds, a batch at a time (for deleting an account's object whole). */
async function allKeys(s: StorageLike): Promise<string[]> { return [...(await s.list({ prefix: "" })).keys()]; }
/** Only these fields: counts, cost, model, time. Whatever else a caller passed is not kept. */
const keptFields = (r: UsageRecord): UsageRecord => ({ userId: r.userId, model: r.model, usd: r.usd, at: r.at, complete: r.complete, usage: {
  input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cache_read_input_tokens: r.usage.cache_read_input_tokens,
  cache_creation_input_tokens: r.usage.cache_creation_input_tokens, web_search_requests: r.usage.web_search_requests } });
/** The one new row a booking writes: the record with the day and month totals as of it. Old records are let go first, at
 *  most once a day (`l` is changed in place: its count and the day of the tidy; the caller writes it in the same put). */
async function booking(s: StorageLike, l: Live, r: UsageRecord): Promise<Record<string, unknown>> {
  const totals = nextTotals((await newestRecord(s))?.totals, r);
  await prune(s, l, r.at);
  l.seq += 1;
  return { [`rec:${pad(l.seq, 12)}`]: { ...keptFields(r), totals } };
}
/** The totals after booking `r` on top of the newest ones. Each record's time is taken in the Worker before the call, so two
 *  requests that end around midnight UTC can arrive in the other order: one stamped just before midnight can come after one
 *  stamped just after. The totals then never step back to the older day or month: the newer ones are carried forward, and the
 *  cost is added only where its day or month is the one being counted (an older day's cost still counts in the same month). */
export function nextTotals(t: Totals | undefined, r: UsageRecord): Totals {
  const day = dayKey(r.at), month = monthKey(r.at);
  if (!t) return { day, dayUsd: r.usd, month, monthUsd: r.usd };
  // The keys are YYYY-MM-DD and YYYY-MM, so comparing them as text compares them as dates.
  const d = day > t.day ? { day, dayUsd: r.usd } : day === t.day ? { day, dayUsd: t.dayUsd + r.usd } : { day: t.day, dayUsd: t.dayUsd };
  const m = month > t.month ? { month, monthUsd: r.usd } : month === t.month ? { month, monthUsd: t.monthUsd + r.usd } : { month: t.month, monthUsd: t.monthUsd };
  return { ...d, ...m };
}
/** What a token means now: a written status, the owner's plan from a payment, and the suspension flag over everything. */
function userOf(ownerId: string, t: Tok, plan: OwnerPlan | undefined, suspended: boolean): User {
  if (suspended) return { id: ownerId, plan: plan?.plan ?? t.plan, status: "suspended" };
  if (t.status === "revoked" || !plan) return { id: ownerId, plan: t.plan, status: t.status };
  return { id: ownerId, plan: plan.plan, status: plan.status, ...(plan.until !== undefined ? { planUntil: plan.until } : {}), ...(plan.renewsOn !== undefined ? { renewsOn: plan.renewsOn } : {}) };
}
/** The owner's token list with one token added (or rewritten), and the hashes dropped past MAX_TOKENS_KEPT. */
function withToken(list: [string, Tok][], hash: string, tok: Tok): { list: [string, Tok][]; dropped: string[] } {
  list = [...list];
  const i = list.findIndex(([h]) => h === hash);
  if (i >= 0) list[i] = [hash, tok]; else list.push([hash, tok]);
  const dropped: string[] = [];
  while (list.length > MAX_TOKENS_KEPT) {
    const stopped = list.findIndex(([h, t]) => t.status === "revoked" && h !== hash);
    const j = stopped >= 0 ? stopped : list.findIndex(([h]) => h !== hash);
    dropped.push(list[j][0]);
    list = [...list.slice(0, j), ...list.slice(j + 1)];
  }
  return { list, dropped };
}

/** Deletes any number of keys, DELETE_MAX a call. */
async function deleteAll(s: StorageLike, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += DELETE_MAX) await s.delete(keys.slice(i, i + DELETE_MAX));
}
/** How many old records one tidy reads and lets go of at a time. */
export const PRUNE_BATCH = 1000;
/** The most keys one storage delete takes on Cloudflare (https://developers.cloudflare.com/durable-objects/api/storage-api/). */
export const DELETE_MAX = 128;
/** Keeping as little as we can (RECORD_KEEP_MS): at most once a day per person, drop records past the keep time. Records are
 *  kept in the order they were booked, so the old ones are at the front. Deletes count as rows written, one per old record.
 *  It goes on, a batch at a time, until it reaches a record young enough to keep, so a person who books more than one batch a
 *  day still has nothing kept past the keep time. Deletes go DELETE_MAX keys a call, the most Cloudflare takes in one. */
async function prune(s: StorageLike, l: Live, now: number): Promise<void> {
  const today = dayKey(now);
  if (l.prunedOn === today) return;
  const cutoff = now - RECORD_KEEP_MS;
  for (;;) {
    const batch = await s.list<KeptRecord>({ prefix: "rec:", limit: PRUNE_BATCH });
    const old: string[] = [];
    let reachedKept = batch.size < PRUNE_BATCH;
    for (const [k, r] of batch) { if (r.at < cutoff) old.push(k); else { reachedKept = true; break; } }
    await deleteAll(s, old);
    if (reachedKept || old.length === 0) break;
  }
  l.prunedOn = today;
}

const OPS: Record<string, Op> = {
  // ---- owner:<id> ----
  // Returns the hashes dropped past MAX_TOKENS_KEPT, so their token objects can be cleared too.
  "owner.addToken": async (s, a: { hash: string; tok: Tok }) => {
    const { list, dropped } = withToken(await ownerTokens(s), a.hash, a.tok);
    await s.put({ tokens: list });
    return dropped;
  },
  // M116 sign in: the nonce is checked and marked used, the email kept and the token added, in this one write. Used nonces
  // are kept only until they would have run out anyway.
  // M116 step 5: coming back after a delete (`line`, the kept deleted line): its nonces stay used, and its day and month spend
  // is carried over once, onto an owner that has booked nothing yet.
  "owner.signIn": async (s, a: { hash: string; tok: Tok; email: string; nonce: { id: string; until: number }; now: number; line?: DeletedLine }) => {
    const kept = ((await s.get<[string, number][]>("nonces")) ?? []).filter(([, until]) => until >= a.now);
    const nonces = [...kept, ...(a.line?.nonces ?? []).filter(([id, until]) => until >= a.now && !kept.some(([k]) => k === id))];
    if (nonces.some(([id]) => id === a.nonce.id)) return { used: true, dropped: [] };
    const { list, dropped } = withToken(await ownerTokens(s), a.hash, a.tok);
    const carry: Record<string, unknown> = {};
    if (a.line && (await s.get("carry")) === undefined && !(await newestRecord(s))) carry.carry = { day: a.line.day, dayUsd: a.line.dayUsd, month: a.line.month, monthUsd: a.line.monthUsd };
    await s.put({ tokens: list, email: a.email, nonces: [...nonces, [a.nonce.id, a.nonce.until]], ...carry });
    return { used: false, dropped };
  },
  // M116 step 5: is anyone here (an email or a token)? A deleted account's object holds nothing.
  "owner.present": async (s) => (await s.get("email")) !== undefined || (await ownerTokens(s)).length > 0,
  // M116 step 5, POST /v1/report/use: the oldest unused credit, in one step.
  "owner.useReport": async (s, a: { now: number; useId?: string }): Promise<ReportUse> => {
    const b = await billingRec(s), unused = () => b.reports.filter(([, c]) => c.state === "unused").length;
    if (a.useId && b.reports.some(([, c]) => c.useId === a.useId)) return { ok: true, left: unused() };
    let pick: ReportCredit | undefined;
    for (const [, c] of b.reports) if (c.state === "unused" && (!pick || c.at < pick.at)) pick = c;
    if (!pick) return { ok: false };
    pick.state = "used"; pick.usedAt = a.now;
    if (a.useId) pick.useId = a.useId;
    await s.put({ billing: b });
    return { ok: true, left: unused() };
  },
  // M116 step 5, account delete, first step: reads only. The refusal, or the deleted line as of now.
  "owner.deleteInfo": async (s, a: { now: number }) => {
    const why = await deleteRefusal(s, a.now);
    return why ? { ok: false, why } : { ok: true, line: await deletedLineOf(s, a.now) };
  },
  // The second step: checked again, then everything the object holds is deleted. What other objects must forget comes back.
  "owner.wipe": async (s, a: { now: number }) => {
    const why = await deleteRefusal(s, a.now);
    if (why) return { ok: false, why };
    const line = await deletedLineOf(s, a.now), b = await billingRec(s);
    const hashes = (await ownerTokens(s)).map(([h]) => h);
    const customerIds = [...new Set([b.customerId, ...b.subs.map(([, x]) => x.customerId)].filter((x): x is string => !!x))];
    const paymentIds = b.reports.map(([id]) => id);
    await deleteAll(s, await allKeys(s));
    return { ok: true, line, hashes, customerIds, paymentIds };
  },
  // M116 step 5, the operator's `usage`: reads only.
  "owner.usage": async (s, a: { month: string; now: number }): Promise<OwnerUsage> => {
    let tokenPlan: string | null = null;
    for (const [, t] of await ownerTokens(s)) if (t.status !== "revoked") tokenPlan = t.plan;
    const records = [...(await s.list<KeptRecord>({ prefix: "rec:" })).values()].filter((r) => !(r as { seed?: boolean }).seed).map(keptFields);
    return {
      plan: shownPlan(await s.get<OwnerPlan>("plan"), tokenPlan, a.now), email: (await s.get<string>("email")) ?? null,
      liveSubs: liveSubCount((await billingRec(s)).subs, a.now), ...usageSummary(records, a.month, a.now),
    };
  },
  // M116 GET /v1/me: reads only.
  "owner.me": async (s, a: { ownerId: string; hash: string; now: number }): Promise<Account | null> => {
    const t = (await ownerTokens(s)).find(([h]) => h === a.hash);
    if (!t) return null;
    const user = userOf(a.ownerId, t[1], await s.get<OwnerPlan>("plan"), (await s.get<boolean>("suspended")) === true);
    return { user, spent: await spentNow(s, a.now), email: (await s.get<string>("email")) ?? null };
  },
  "owner.dropToken": async (s, a: { hash: string }) => {
    const list = await ownerTokens(s), kept = list.filter(([h]) => h !== a.hash);
    if (kept.length === list.length) return false;
    await s.put({ tokens: kept });
    return true;
  },
  "owner.dropAll": async (s) => {
    const list = await ownerTokens(s);
    if (list.length) await s.delete(["tokens"]);
    return { hashes: list.map(([h]) => h), stopped: list.filter(([, t]) => t.status !== "revoked").length };
  },
  "owner.user": async (s, a: { ownerId: string; hash: string }) => {
    const t = (await ownerTokens(s)).find(([h]) => h === a.hash);
    return t ? userOf(a.ownerId, t[1], await s.get<OwnerPlan>("plan"), (await s.get<boolean>("suspended")) === true) : null;
  },
  "owner.planOf": async (s) => {
    const paid = await s.get<OwnerPlan>("plan");
    if (paid) return paid.plan;
    let plan: string | null = null;
    for (const [, t] of await ownerTokens(s)) if (t.status !== "revoked") plan = t.plan;   // the newest one wins
    return plan;
  },
  "owner.isSuspended": async (s) => (await s.get<boolean>("suspended")) === true,
  "owner.suspend": async (s) => {
    if ((await s.get<boolean>("suspended")) === true) return { tokensRevoked: 0, alreadySuspended: true };
    let tokensRevoked = 0;
    const list = (await ownerTokens(s)).map(([h, t]): [string, Tok] => { if (t.status === "revoked") return [h, t]; tokensRevoked++; return [h, { ...t, status: "revoked" }]; });
    await s.put({ tokens: list, suspended: true });
    return { tokensRevoked, alreadySuspended: false };
  },
  "owner.restore": async (s) => {
    if ((await s.get<boolean>("suspended")) !== true) return false;
    await s.delete(["suspended"]);
    return true;
  },
  "owner.setPlan": async (s, a: { plan: OwnerPlan; at?: number }) => {
    const last = await s.get<number>("planAt");
    if (a.at !== undefined && last !== undefined && a.at < last) return false;   // an older event than one already applied
    await s.put({ plan: a.plan, ...(a.at !== undefined ? { planAt: Math.max(a.at, last ?? 0) } : {}) });
    return true;
  },
  // With a scope (a subscription id), the order is that subscription's own, kept by owner.applySub in the same write.
  "owner.lastAt": async (s, a: { scope?: string }) => {
    if (a.scope) return (await billingRec(s)).subs.find(([id]) => id === a.scope)?.[1].at ?? null;
    return (await s.get<number>("planAt")) ?? null;
  },
  "owner.setLastAt": async (s, a: { ms: number; scope?: string }) => {
    if (a.scope) return;   // owner.applySub already kept this subscription's time
    await s.put({ planAt: Math.max(a.ms, (await s.get<number>("planAt")) ?? 0) });
  },
  // M116 step 4: one subscription's state and the owner's plan (the best of their subscriptions), in one write.
  "owner.applySub": async (s, a: { subId: string; change: SubChange; at: number }) => {
    const b = await billingRec(s), i = b.subs.findIndex(([id]) => id === a.subId);
    if (i >= 0 && a.at < b.subs[i][1].at) return false;
    const sub = keptSub(a.change, a.at);
    if (i >= 0) b.subs[i] = [a.subId, sub]; else b.subs.push([a.subId, sub]);
    if (a.change.customerId) { b.customerId = a.change.customerId; b.customerMode = a.change.customerMode ?? "test"; }
    await s.put({ billing: b, plan: bestPlan(b.subs), planAt: Math.max(a.at, (await s.get<number>("planAt")) ?? 0) });
    return true;
  },
  "owner.billing": async (s): Promise<Billing> => {
    const b = await billingRec(s);
    return { email: (await s.get<string>("email")) ?? null, customerId: b.customerId ?? null, customerMode: b.customerId ? (b.customerMode ?? "test") : null, subs: b.subs, reports: b.reports };
  },
  "owner.saveCustomer": async (s, a: { customerId: string; mode?: DodoMode }) => {
    const b = await billingRec(s), mode = a.mode ?? "test";
    if (b.customerId === a.customerId && b.customerMode === mode) return;
    await s.put({ billing: { ...b, customerId: a.customerId, customerMode: mode } });
  },
  // `removed`: the payment was refunded or lost in a dispute before it arrived. Its credit is kept as removed, never given.
  "owner.addReport": async (s, a: { paymentId: string; at: number; removed?: boolean }) => {
    const b = await billingRec(s);
    if (b.reports.some(([id]) => id === a.paymentId)) return "known";
    b.reports.push([a.paymentId, { at: a.at, state: a.removed ? "removed" : "unused" }]);
    await s.put({ billing: b });
    return a.removed ? "known" : "added";
  },
  "owner.removeReport": async (s, a: { paymentId: string; at: number }) => {
    const b = await billingRec(s), c = b.reports.find(([id]) => id === a.paymentId)?.[1];
    if (!c) {
      // The payment's owner is known but its credit is not written yet (a refund between addReport's two steps): keep it as
      // removed now, so the credit that follows is "known" and never given.
      b.reports.push([a.paymentId, { at: a.at, state: "removed" }]);
      await s.put({ billing: b });
      return "unknown";
    }
    if (c.state !== "unused") return c.state === "used" ? "used" : "already";
    c.state = "removed";
    await s.put({ billing: b });
    return "removed";
  },
  "owner.spent": async (s, a: { now: number }) => spentNow(s, a.now),
  // M116 step 3: what the proxy uses. The budget check, the cap and the taking of the slot and hold, in one step and one row.
  // A refusal writes nothing.
  "owner.start": async (s, a: { max: number; usd: number; now: number; limits: Plan | null; id: string }) => {
    const l = await liveOf(s);
    if (a.limits) {
      const spent = await spentNow(s, a.now, l);
      if (!budgetCheck(a.limits, spent, a.now).ok) return { ok: false, why: "over", spent };
    }
    const running = alive(l.running, a.now);
    if (running.length >= a.max) return { ok: false, why: "busy" };
    l.running = [...running, { at: a.now, usd: 0, id: a.id }];
    l.holds = alive(l.holds, a.now);
    if (a.usd > 0) l.holds.push({ at: a.now, usd: a.usd, id: a.id });
    await s.put({ live: l });
    return { ok: true };
  },
  // The slot and hold let go (only this request's own, by its id) and the record booked: one put, two rows.
  "owner.finish": async (s, a: { id: string; now: number; record?: UsageRecord }) => {
    const l = await liveOf(s);
    l.running = without(alive(l.running, a.now), a.id);
    l.holds = without(l.holds, a.id);
    const rec = a.record ? await booking(s, l, a.record) : {};
    await s.put({ live: l, ...rec });
  },
  // The check and the hold in one step: no other call to this object runs between them.
  "owner.hold": async (s, a: { usd: number; now: number; limits: Plan; id?: string }) => {
    const l = await liveOf(s);
    if (!budgetCheck(a.limits, await spentNow(s, a.now, l), a.now).ok) return false;
    l.holds = [...alive(l.holds, a.now), { at: a.now, usd: a.usd, ...(a.id ? { id: a.id } : {}) }];
    await s.put({ live: l });
    return true;
  },
  // Not pruned by time here: a hold is timed by the request's own clock (`hold`'s now), so it is pruned there and in `spent`.
  // With an id, only that hold goes, and nothing at all when it already ran out (a late end never takes another request's hold).
  "owner.unhold": async (s, a: { usd: number; id?: string }) => {
    const l = await liveOf(s), i = l.holds.findIndex((h) => (a.id ? h.id === a.id : h.usd === a.usd && !h.id));
    if (i < 0) return;
    l.holds.splice(i, 1);
    await s.put({ live: l });
  },
  "owner.begin": async (s, a: { max: number; now: number; id?: string }) => {
    const l = await liveOf(s), running = alive(l.running, a.now);
    if (running.length >= a.max) return false;
    l.running = [...running, { at: a.now, usd: 0, ...(a.id ? { id: a.id } : {}) }];
    await s.put({ live: l });
    return true;
  },
  "owner.end": async (s, a: { now: number; id?: string }) => {
    const l = await liveOf(s);
    l.running = without(alive(l.running, a.now), a.id);
    await s.put({ live: l });
  },
  "owner.inFlight": async (s, a: { now: number }) => alive((await liveOf(s)).running, a.now).length,
  "owner.record": async (s, a: { r: UsageRecord }) => {
    const l = await liveOf(s), rec = await booking(s, l, a.r);
    await s.put({ live: l, ...rec });
  },
  "owner.records": async (s) => [...(await s.list<KeptRecord>({ prefix: "rec:" })).values()].map(keptFields),

  // ---- token:<hash> ----
  "token.get": async (s) => (await s.get<string>("owner")) ?? null,
  "token.set": async (s, a: { ownerId: string }) => {
    const was = await s.get<string>("owner");
    if (was !== undefined && was !== a.ownerId) return false;   // a token hash never moves to another person
    if (was === undefined) await s.put({ owner: a.ownerId });
    return true;
  },
  // Only the owner it was given: a hash is never cleared for someone else.
  "token.drop": async (s, a: { ownerId: string }) => { if ((await s.get<string>("owner")) === a.ownerId) await s.delete(["owner"]); },

  // ---- directory ----
  "dir.addOwner": async (s, a: { ownerId: string }) => {
    if ((await s.get<number>(`id:${a.ownerId}`)) !== undefined) return;
    const n = ((await s.get<number>("owners")) ?? 0) + 1;
    await s.put({ owners: n, [`id:${a.ownerId}`]: n, [`o:${pad(n, 12)}`]: a.ownerId });
  },
  "dir.owners": async (s) => [...(await s.list<string>({ prefix: "o:" })).values()],
  "dir.log": async (s, a: { rec: SuspensionRecord }) => {
    const n = ((await s.get<number>("logs")) ?? 0) + 1, r = a.rec;
    await s.put({ logs: n, [`l:${pad(n, 12)}`]: { ownerId: r.ownerId, kind: r.kind, at: r.at, ...(r.caseId ? { caseId: r.caseId } : {}) } });
  },
  "dir.logs": async (s) => [...(await s.list<SuspensionRecord>({ prefix: "l:" })).values()],
  // M116 step 5: an owner leaves the list when their account is deleted (the counter stays, so numbers are never reused).
  "dir.removeOwner": async (s, a: { ownerId: string }) => {
    const n = await s.get<number>(`id:${a.ownerId}`);
    if (n === undefined) return;
    await s.delete([`id:${a.ownerId}`, `o:${pad(n, 12)}`]);
  },
  // The kept deleted lines, by their HMAC key (deleted.ts).
  // M116 step 5 review: a line goes at its `until` (the end of its month, at least 3 days after the delete); a line past it
  // reads as none, and the due ones are deleted here.
  "dir.deletedGet": async (s, a: { key: string; now: number }) => {
    await pruneDeleted(s, a.now);
    const l = await s.get<DeletedLine>(`del:${a.key}`);
    return l && deletedLineLive(l, a.now) ? l : null;
  },
  "dir.deletedPut": async (s, a: { key: string; line: DeletedLine }) => {
    const l = a.line, was = await s.get<DeletedLine>(`del:${a.key}`);
    await pruneDeleted(s, l.at);
    if (was && was.until !== l.until) await s.delete([deletedIndex(was.until, a.key)]);
    await s.put({ [`del:${a.key}`]: { at: l.at, day: l.day, dayUsd: l.dayUsd, month: l.month, monthUsd: l.monthUsd, nonces: l.nonces, until: l.until }, [deletedIndex(l.until, a.key)]: a.key });
  },
  "dir.deletedDrop": async (s, a: { key: string }) => {
    const was = await s.get<DeletedLine>(`del:${a.key}`);
    await s.delete([`del:${a.key}`, ...(was ? [deletedIndex(was.until, a.key)] : [])]);
  },
  // M116 step 5 review: a deleted owner's suspension log lines keep their kind, date and case, under the deleted marker
  // (DELETED_PREFIX and the HMAC) instead of the owner id. The log is small: suspensions are rare.
  "dir.forgetLog": async (s, a: { ownerId: string; marker: string }) => {
    const out: Record<string, SuspensionRecord> = {};
    for (const [k, r] of await s.list<SuspensionRecord>({ prefix: "l:" })) if (r.ownerId === a.ownerId) out[k] = { ...r, ownerId: a.marker };
    if (Object.keys(out).length) await s.put(out);
  },
  // M116 step 5 review: one page of the owner list, after the cursor (an owner's number in the list).
  "dir.ownerPage": async (s, a: { after?: number; limit: number }): Promise<OwnerPage> => {
    const page = await s.list<string>({ prefix: "o:", limit: a.limit, ...(a.after !== undefined ? { startAfter: `o:${pad(a.after, 12)}` } : {}) });
    const keys = [...page.keys()], last = keys[keys.length - 1];
    return { owners: [...page.values()], next: page.size === a.limit && last ? Number(last.slice(2)) : null };
  },

  // ---- payments ----
  "pay.claim": async (s, a: { id: string; now: number }) => {
    const ids = await s.list<number>({ prefix: "h:" }), old: string[] = [];
    for (const [k, at] of ids) if (a.now - at > WEBHOOK_KEEP_MS) old.push(k);
    await deleteAll(s, old);
    if (ids.has(`h:${a.id}`) && !old.includes(`h:${a.id}`)) return false;
    await s.put({ [`h:${a.id}`]: a.now });
    return true;
  },
  "pay.release": async (s, a: { id: string }) => { await s.delete([`h:${a.id}`]); },
  // M116 step 5 review: money for a deleted account, for the operator to refund (Dodo ids only).
  "pay.flagRefund": async (s, a: { r: RefundNeeded }) => {
    const r = a.r;
    if ((await s.get(`rn:${r.id}`)) !== undefined) return;
    await s.put({ [`rn:${r.id}`]: { id: r.id, kind: r.kind, at: r.at, eventType: r.eventType, ...(r.customerId ? { customerId: r.customerId } : {}) } });
  },
  "pay.refunds": async (s) => [...(await s.list<RefundNeeded>({ prefix: "rn:" })).values()],
  "pay.clearRefund": async (s, a: { id: string }) => (await s.delete([`rn:${a.id}`])) > 0,
  "pay.link": async (s, a: { customerId: string }) => (await s.get<string>(`c:${a.customerId}`)) ?? null,
  "pay.setLink": async (s, a: { customerId: string; userId: string }) => { await s.put({ [`c:${a.customerId}`]: a.userId }); },
  // M116 step 5: a deleted account's customer links and report payments point at its marker (DELETED_PREFIX + key) from now on,
  // so a late event finds no person. Only entries that point at this owner are changed.
  "pay.forget": async (s, a: { ownerId: string; customerIds: string[]; paymentIds: string[]; marker: string }) => {
    const out: Record<string, string> = {};
    for (const k of [...a.customerIds.map((c) => `c:${c}`), ...a.paymentIds.map((p) => `r:${p}`)]) if ((await s.get<string>(k)) === a.ownerId) out[k] = a.marker;
    if (Object.keys(out).length) await s.put(out);
  },
  // M116: which owner a report payment belongs to, so a refund (whose metadata is its own) finds the credit. The first one stays.
  // `removed`: a full refund or a lost dispute for this payment came before the payment itself (marker `x:`).
  "pay.setReportOwner": async (s, a: { paymentId: string; ownerId: string }) => {
    const removed = (await s.get<number>(`x:${a.paymentId}`)) !== undefined;
    const was = await s.get<string>(`r:${a.paymentId}`);
    if (was !== undefined) return { ownerId: was, removed };
    await s.put({ [`r:${a.paymentId}`]: a.ownerId });
    return { ownerId: a.ownerId, removed };
  },
  // The owner of a report payment for a refund. Not known: a marker is kept by payment_id (with when), so the payment, if Dodo
  // delivers it later (its retries last about 37 hours), never gives a credit. Refunds and lost disputes are rare and a
  // marker is one short key, so markers are kept.
  "pay.reportOwnerOrMark": async (s, a: { paymentId: string; at: number }) => {
    const owner = await s.get<string>(`r:${a.paymentId}`);
    if (owner !== undefined) return owner;
    if ((await s.get<number>(`x:${a.paymentId}`)) === undefined) await s.put({ [`x:${a.paymentId}`]: a.at });
    return null;
  },

  // ---- releases (M116 step 5: the update feed) ----
  "rel.set": async (s, a: { platform: string; r: Release }) => {
    const r = a.r;
    await s.put({ [`p:${a.platform}`]: { version: r.version, notes: r.notes, url: r.url, signature: r.signature, pubDate: r.pubDate } });
  },
  "rel.get": async (s, a: { platform: string }) => (await s.get<Release>(`p:${a.platform}`)) ?? null,
  "rel.stop": async (s, a: { platform: string }) => {
    const r = await s.get<Release>(`p:${a.platform}`);
    if (!r || r.stopped) return false;
    await s.put({ [`p:${a.platform}`]: { ...r, stopped: true } });
    return true;
  },
  "rel.all": async (s) => [...(await s.list<Release>({ prefix: "p:" }))].map(([k, r]) => [k.slice(2), r]),
};

// ---------- the Store the proxy uses, on top of the objects ----------

export const OWNER = (id: string) => `owner:${id}`;
export const TOKEN = (hash: string) => `token:${hash}`;
export const DIRECTORY = "directory";
export const PAYMENTS = "payments";
export const RELEASES = "releases";

/** Calls one object. A failure is a plain error with no detail. The proxy answers it with a plain 503 (nothing was sent), and the
 *  Worker answers any other route's store failure the same way, never with Cloudflare's own error page. */
export async function callObject<T>(ns: NamespaceLike, name: string, op: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await ns.get(ns.idFromName(name)).fetch(`https://store.internal/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) throw new Error("The store could not finish that step.");
  return ((await res.json()) as { r: T }).r;
}

export class DurableStore implements Store {
  constructor(protected ns: NamespaceLike, private clock: () => number = Date.now) {}
  protected call<T>(name: string, op: string, args: Record<string, unknown> = {}) { return callObject<T>(this.ns, name, op, args); }

  async addUser(hash: string, u: User) {
    // The owner's object first: a token that points at an owner who does not list it finds nobody, which is safe.
    const dropped = await this.call<string[] | null>(OWNER(u.id), "owner.addToken", { hash, tok: { plan: u.plan, status: u.status } });
    if (!(await this.call<boolean>(TOKEN(hash), "token.set", { ownerId: u.id }))) throw new Error("That token belongs to someone else.");
    await this.call(DIRECTORY, "dir.addOwner", { ownerId: u.id });
    // Best effort: a dropped token already finds nobody (its owner no longer lists it); this only frees its small object.
    for (const h of dropped ?? []) await this.call(TOKEN(h), "token.drop", { ownerId: u.id }).catch(() => {});
  }
  async userByTokenHash(hash: string) {
    const ownerId = await this.call<string | null>(TOKEN(hash), "token.get");
    return ownerId === null ? null : this.call<User | null>(OWNER(ownerId), "owner.user", { ownerId, hash });
  }
  spent(userId: string, now: number) { return this.call<Spent>(OWNER(userId), "owner.spent", { now }); }
  async record(r: UsageRecord) { await this.call(OWNER(r.userId), "owner.record", { r }); }
  begin(userId: string, max: number, id?: string) { return this.call<boolean>(OWNER(userId), "owner.begin", { max, now: this.clock(), ...(id ? { id } : {}) }); }
  async end(userId: string, id?: string) { await this.call(OWNER(userId), "owner.end", { now: this.clock(), ...(id ? { id } : {}) }); }
  start(userId: string, a: StartAsk) { return this.call<Started>(OWNER(userId), "owner.start", a); }
  async finish(userId: string, a: FinishAsk) { await this.call(OWNER(userId), "owner.finish", a); }
  hold(userId: string, usd: number, now: number, limits: Plan, id?: string) { return this.call<boolean>(OWNER(userId), "owner.hold", { usd, now, limits, ...(id ? { id } : {}) }); }
  async unhold(userId: string, usd: number, id?: string) { await this.call(OWNER(userId), "owner.unhold", { usd, ...(id ? { id } : {}) }); }
  listOwnerIds() { return this.call<string[]>(DIRECTORY, "dir.owners"); }
  async suspendOwner(ownerId: string, info: { at: number; caseId?: string }) {
    const r = await this.call<{ tokensRevoked: number; alreadySuspended: boolean }>(OWNER(ownerId), "owner.suspend");
    if (!r.alreadySuspended) await this.call(DIRECTORY, "dir.log", { rec: { ownerId, kind: "suspended", at: info.at, caseId: info.caseId } });
    return r;
  }
  async restoreOwner(ownerId: string, info: { at: number; caseId?: string }) {
    if (!(await this.call<boolean>(OWNER(ownerId), "owner.restore"))) return false;
    await this.call(DIRECTORY, "dir.log", { rec: { ownerId, kind: "restored", at: info.at, caseId: info.caseId } });
    return true;
  }
  isSuspended(ownerId: string) { return this.call<boolean>(OWNER(ownerId), "owner.isSuspended"); }
  planOfOwner(ownerId: string) { return this.call<string | null>(OWNER(ownerId), "owner.planOf"); }
  setOwnerPlan(ownerId: string, plan: OwnerPlan, at?: number) { return this.call<boolean>(OWNER(ownerId), "owner.setPlan", { plan, ...(at !== undefined ? { at } : {}) }); }
  suspensions() { return this.call<SuspensionRecord[]>(DIRECTORY, "dir.logs"); }
  async signIn(hash: string, u: User, o: SignIn) {
    // M116 step 5: a person coming back after a delete. Their kept line is read first (its spend and nonces go onto the owner
    // in the same write as the token), and dropped last. If dropping it fails, the owner holds data again, so it no longer
    // counts as deleted, and the carry is never taken twice (only onto an owner that has booked nothing).
    const line = o.deletedKey ? await this.call<DeletedLine | null>(DIRECTORY, "dir.deletedGet", { key: o.deletedKey, now: o.now }) : null;
    const r = await this.call<{ used: boolean; dropped: string[] }>(OWNER(u.id), "owner.signIn", { hash, tok: { plan: u.plan, status: u.status }, email: o.email, nonce: { id: o.nonceId, until: o.nonceUntil }, now: o.now, ...(line ? { line } : {}) });
    if (r.used) return false;
    if (!(await this.call<boolean>(TOKEN(hash), "token.set", { ownerId: u.id }))) throw new Error("That token belongs to someone else.");
    await this.call(DIRECTORY, "dir.addOwner", { ownerId: u.id });
    for (const h of r.dropped) await this.call(TOKEN(h), "token.drop", { ownerId: u.id }).catch(() => {});
    if (line && o.deletedKey) await this.call(DIRECTORY, "dir.deletedDrop", { key: o.deletedKey }).catch(() => {});
    return true;
  }
  async account(hash: string, now: number) {
    const ownerId = await this.call<string | null>(TOKEN(hash), "token.get");
    return ownerId === null ? null : this.call<Account | null>(OWNER(ownerId), "owner.me", { ownerId, hash, now });
  }
  async dropToken(hash: string) {
    const ownerId = await this.call<string | null>(TOKEN(hash), "token.get");
    if (ownerId === null) return false;
    // The owner's list first: from then on the token finds nobody, even if clearing its own small object fails.
    const dropped = await this.call<boolean>(OWNER(ownerId), "owner.dropToken", { hash });
    await this.call(TOKEN(hash), "token.drop", { ownerId });
    return dropped;
  }
  async dropAllTokens(ownerId: string) {
    const r = await this.call<{ hashes: string[]; stopped: number }>(OWNER(ownerId), "owner.dropAll");
    for (const h of r.hashes) await this.call(TOKEN(h), "token.drop", { ownerId });
    return r.stopped;
  }
  applySubscription(ownerId: string, subscriptionId: string, change: SubChange, at: number) {
    return this.call<boolean>(OWNER(ownerId), "owner.applySub", { subId: subscriptionId, change, at });
  }
  billingOf(ownerId: string) { return this.call<Billing>(OWNER(ownerId), "owner.billing"); }
  async saveCustomer(ownerId: string, customerId: string, mode: DodoMode = "test") { await this.call(OWNER(ownerId), "owner.saveCustomer", { customerId, mode }); }
  async addReport(ownerId: string, paymentId: string, at: number) {
    // The payment's owner first (the first one seen stays), then the credit on that owner's own object.
    const { ownerId: owner, removed } = await this.call<{ ownerId: string; removed: boolean }>(PAYMENTS, "pay.setReportOwner", { paymentId, ownerId });
    return this.call<"added" | "known">(OWNER(owner), "owner.addReport", { paymentId, at, removed });
  }
  async removeReport(paymentId: string, at = this.clock()): Promise<ReportRemoved> {
    const ownerId = await this.call<string | null>(PAYMENTS, "pay.reportOwnerOrMark", { paymentId, at });
    if (ownerId === null || isDeletedMarker(ownerId)) return { result: "unknown" };   // a deleted account's payment: nothing to take back
    const result = await this.call<ReportRemoved["result"]>(OWNER(ownerId), "owner.removeReport", { paymentId, at });
    return result === "unknown" ? { result } : { result, ownerId };
  }
  useReport(ownerId: string, a: { now: number; useId?: string }) { return this.call<ReportUse>(OWNER(ownerId), "owner.useReport", a); }
  /** M116 step 5. The refusal is read first, writing nothing. Then the kept line is written, then the owner's object is wiped
   *  (checked again in that same step), then the other objects forget the owner. A line written for an account whose wipe
   *  then fails or is refused is harmless: the owner still holds data, so it does not count as deleted (isDeletedOwner), and it
   *  is dropped when the person next signs in. What the other objects fail to forget is counted in `leftovers`: the account is
   *  gone either way (its tokens find nobody), and a late payment event still finds the owner deleted. */
  async deleteAccount(ownerId: string, a: { key: string; now: number }): Promise<Deleted> {
    const info = await this.call<{ ok: false; why: Exclude<Deleted, { ok: true }>["why"] } | { ok: true; line: DeletedLine }>(OWNER(ownerId), "owner.deleteInfo", { now: a.now });
    if (!info.ok) return info;
    await this.call(DIRECTORY, "dir.deletedPut", { key: a.key, line: info.line });
    const w = await this.call<{ ok: false; why: Exclude<Deleted, { ok: true }>["why"] } | { ok: true; line: DeletedLine; hashes: string[]; customerIds: string[]; paymentIds: string[] }>(OWNER(ownerId), "owner.wipe", { now: a.now });
    if (!w.ok) return w;
    let leftovers = 0;
    const tidy = async (step: () => Promise<unknown>) => { try { await step(); } catch { leftovers++; } };
    if (JSON.stringify(w.line) !== JSON.stringify(info.line)) await tidy(() => this.call(DIRECTORY, "dir.deletedPut", { key: a.key, line: w.line }));
    await tidy(() => this.call(DIRECTORY, "dir.removeOwner", { ownerId }));
    await tidy(() => this.call(DIRECTORY, "dir.forgetLog", { ownerId, marker: `${DELETED_PREFIX}${a.key}` }));
    if (w.customerIds.length || w.paymentIds.length)
      await tidy(() => this.call(PAYMENTS, "pay.forget", { ownerId, customerIds: w.customerIds, paymentIds: w.paymentIds, marker: `${DELETED_PREFIX}${a.key}` }));
    for (const h of w.hashes) await tidy(() => this.call(TOKEN(h), "token.drop", { ownerId }));
    return { ok: true, leftovers };
  }
  async isDeletedOwner(ownerId: string, key: string, now: number) {
    if ((await this.call<DeletedLine | null>(DIRECTORY, "dir.deletedGet", { key, now })) === null) return false;
    return !(await this.call<boolean>(OWNER(ownerId), "owner.present"));
  }
  ownerPage(a: { after?: number; limit: number }) { return this.call<OwnerPage>(DIRECTORY, "dir.ownerPage", a); }
  async flagRefund(r: RefundNeeded) { await this.call(PAYMENTS, "pay.flagRefund", { r }); }
  refundsNeeded() { return this.call<RefundNeeded[]>(PAYMENTS, "pay.refunds"); }
  clearRefund(id: string) { return this.call<boolean>(PAYMENTS, "pay.clearRefund", { id }); }
  ownerUsage(ownerId: string, a: { month: string; now: number }) { return this.call<OwnerUsage>(OWNER(ownerId), "owner.usage", a); }
  async setRelease(platform: string, r: Release) { await this.call(RELEASES, "rel.set", { platform, r }); }
  release(platform: string) { return this.call<Release | null>(RELEASES, "rel.get", { platform }); }
  stopRelease(platform: string) { return this.call<boolean>(RELEASES, "rel.stop", { platform }); }
  releases() { return this.call<[string, Release][]>(RELEASES, "rel.all"); }
}

/** Dodo's once only ledger: event ids in the payments object, the newest applied time in each owner's own object. */
export class DurableDodoLedger implements DodoLedger {
  constructor(private ns: NamespaceLike, private clock: () => number = Date.now) {}
  claim(id: string) { return callObject<boolean>(this.ns, PAYMENTS, "pay.claim", { id, now: this.clock() }); }
  async release(id: string) { await callObject(this.ns, PAYMENTS, "pay.release", { id }); }
  lastAppliedAt(userId: string, scope?: string) { return callObject<number | null>(this.ns, OWNER(userId), "owner.lastAt", scope ? { scope } : {}); }
  async setLastAppliedAt(userId: string, ms: number, scope?: string) {
    if (scope) return;   // the subscription's time is kept by owner.applySub in the same write as its state
    await callObject(this.ns, OWNER(userId), "owner.setLastAt", { ms });
  }
}
export class DurableLinkBook implements LinkBook {
  constructor(private ns: NamespaceLike) {}
  get(customerId: string) { return callObject<string | null>(this.ns, PAYMENTS, "pay.link", { customerId }); }
  async set(customerId: string, userId: string) { await callObject(this.ns, PAYMENTS, "pay.setLink", { customerId, userId }); }
}
