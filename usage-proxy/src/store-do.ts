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
import type { Account, SignIn, Store, SuspensionRecord, UsageRecord, User, OwnerPlan } from "./store.ts";
import type { DodoLedger, LinkBook } from "./dodo.ts";

/** The part of Durable Object storage used here (the key value calls, on SQLite backed objects too). */
export interface StorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(keys: string[]): Promise<number>;
  list<T = unknown>(options: { prefix: string }): Promise<Map<string, T>>;
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
 *  person. Day totals are kept only for the current month, and month totals only for the months these records still cover. */
export const RECORD_KEEP_MS = 90 * 24 * 3600 * 1000;
/** The most sign ins kept per person (one token hash each). Past it the oldest go first, stopped ones before working ones, and a
 *  dropped token simply stops working (the person signs in again). */
export const MAX_TOKENS_KEPT = 50;
/** How long a payment event id is remembered: three times Dodo's time window, as the in memory ledger does. */
export const WEBHOOK_KEEP_MS = 3 * 300 * 1000;

type Tok = { plan: string; status: User["status"] };
/** `id`: the request's own id, so a request that ends late lets go of only its own slot or hold, never another's of the same amount. */
type Lease = { at: number; usd: number; id?: string };
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
const live = (list: Lease[] | number[] | undefined, now: number): Lease[] =>
  (list ?? []).map((x) => (typeof x === "number" ? { at: x, usd: 0 } : x)).filter((x) => now - x.at < LEASE_MS);

async function ownerTokens(s: StorageLike): Promise<[string, Tok][]> { return (await s.get<[string, Tok][]>("tokens")) ?? []; }
async function spentNow(s: StorageLike, now: number): Promise<Spent> {
  const held = live(await s.get<Lease[]>("holds"), now).reduce((n, h) => n + h.usd, 0);
  return { day: ((await s.get<number>(`spent:d:${dayKey(now)}`)) ?? 0) + held, month: ((await s.get<number>(`spent:m:${monthKey(now)}`)) ?? 0) + held };
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

/** Keeping as little as we can (RECORD_KEEP_MS): at most once a day per person, drop records past the keep time, day totals
 *  before this month and month totals before the oldest kept record's month. Only `spent` for today and this month is ever read. */
async function prune(s: StorageLike, now: number): Promise<void> {
  const today = dayKey(now);
  if ((await s.get<string>("prunedOn")) === today) return;
  const cutoff = now - RECORD_KEEP_MS, recBefore = `rec:${pad(cutoff)}`, dayFrom = `spent:d:${monthKey(now)}`, monthFrom = `spent:m:${monthKey(cutoff)}`;
  const old: string[] = [];
  for (const k of (await s.list({ prefix: "rec:" })).keys()) if (k < recBefore) old.push(k);
  for (const k of (await s.list({ prefix: "spent:d:" })).keys()) if (k < dayFrom) old.push(k);
  for (const k of (await s.list({ prefix: "spent:m:" })).keys()) if (k < monthFrom) old.push(k);
  if (old.length) await s.delete(old);
  await s.put({ prunedOn: today });
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
  "owner.signIn": async (s, a: { hash: string; tok: Tok; email: string; nonce: { id: string; until: number }; now: number }) => {
    const nonces = ((await s.get<[string, number][]>("nonces")) ?? []).filter(([, until]) => until >= a.now);
    if (nonces.some(([id]) => id === a.nonce.id)) return { used: true, dropped: [] };
    const { list, dropped } = withToken(await ownerTokens(s), a.hash, a.tok);
    await s.put({ tokens: list, email: a.email, nonces: [...nonces, [a.nonce.id, a.nonce.until]] });
    return { used: false, dropped };
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
  "owner.lastAt": async (s) => (await s.get<number>("planAt")) ?? null,
  "owner.setLastAt": async (s, a: { ms: number }) => { await s.put({ planAt: Math.max(a.ms, (await s.get<number>("planAt")) ?? 0) }); },
  "owner.spent": async (s, a: { now: number }) => spentNow(s, a.now),
  // The check and the hold in one step: no other call to this object runs between them.
  "owner.hold": async (s, a: { usd: number; now: number; limits: Plan; id?: string }) => {
    if (!budgetCheck(a.limits, await spentNow(s, a.now), a.now).ok) return false;
    await s.put({ holds: [...live(await s.get<Lease[]>("holds"), a.now), { at: a.now, usd: a.usd, ...(a.id ? { id: a.id } : {}) }] });
    return true;
  },
  // Not pruned by time here: a hold is timed by the request's own clock (`hold`'s now), so it is pruned there and in `spent`.
  // With an id, only that hold goes, and nothing at all when it already ran out (a late end never takes another request's hold).
  "owner.unhold": async (s, a: { usd: number; id?: string }) => {
    const holds = (await s.get<Lease[]>("holds")) ?? [], i = holds.findIndex((h) => (a.id ? h.id === a.id : h.usd === a.usd && !h.id));
    if (i < 0) return;
    holds.splice(i, 1);
    await s.put({ holds });
  },
  "owner.begin": async (s, a: { max: number; now: number; id?: string }) => {
    const running = live(await s.get<Lease[]>("running"), a.now);
    if (running.length >= a.max) { await s.put({ running }); return false; }
    await s.put({ running: [...running, { at: a.now, usd: 0, ...(a.id ? { id: a.id } : {}) }] });
    return true;
  },
  "owner.end": async (s, a: { now: number; id?: string }) => {
    const running = live(await s.get<Lease[]>("running"), a.now), i = a.id ? running.findIndex((r) => r.id === a.id) : running.findIndex((r) => !r.id);
    if (i >= 0) running.splice(i, 1);
    await s.put({ running });
  },
  "owner.inFlight": async (s, a: { now: number }) => live(await s.get<Lease[]>("running"), a.now).length,
  "owner.record": async (s, a: { r: UsageRecord }) => {
    const r = a.r, seq = ((await s.get<number>("seq")) ?? 0) + 1;
    const d = `spent:d:${dayKey(r.at)}`, m = `spent:m:${monthKey(r.at)}`;
    // Only these fields: counts, cost, model, time. Whatever else a caller passed is not kept.
    const kept: UsageRecord = { userId: r.userId, model: r.model, usd: r.usd, at: r.at, complete: r.complete, usage: {
      input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cache_read_input_tokens: r.usage.cache_read_input_tokens,
      cache_creation_input_tokens: r.usage.cache_creation_input_tokens, web_search_requests: r.usage.web_search_requests } };
    await s.put({ seq, [`rec:${pad(r.at)}:${pad(seq, 9)}`]: kept, [d]: ((await s.get<number>(d)) ?? 0) + r.usd, [m]: ((await s.get<number>(m)) ?? 0) + r.usd });
    await prune(s, r.at);
  },
  "owner.records": async (s) => [...(await s.list<UsageRecord>({ prefix: "rec:" })).values()],

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

  // ---- payments ----
  "pay.claim": async (s, a: { id: string; now: number }) => {
    const ids = await s.list<number>({ prefix: "h:" }), old: string[] = [];
    for (const [k, at] of ids) if (a.now - at > WEBHOOK_KEEP_MS) old.push(k);
    if (old.length) await s.delete(old);
    if (ids.has(`h:${a.id}`) && !old.includes(`h:${a.id}`)) return false;
    await s.put({ [`h:${a.id}`]: a.now });
    return true;
  },
  "pay.release": async (s, a: { id: string }) => { await s.delete([`h:${a.id}`]); },
  "pay.link": async (s, a: { customerId: string }) => (await s.get<string>(`c:${a.customerId}`)) ?? null,
  "pay.setLink": async (s, a: { customerId: string; userId: string }) => { await s.put({ [`c:${a.customerId}`]: a.userId }); },
};

// ---------- the Store the proxy uses, on top of the objects ----------

export const OWNER = (id: string) => `owner:${id}`;
export const TOKEN = (hash: string) => `token:${hash}`;
export const DIRECTORY = "directory";
export const PAYMENTS = "payments";

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
    const r = await this.call<{ used: boolean; dropped: string[] }>(OWNER(u.id), "owner.signIn", { hash, tok: { plan: u.plan, status: u.status }, email: o.email, nonce: { id: o.nonceId, until: o.nonceUntil }, now: o.now });
    if (r.used) return false;
    if (!(await this.call<boolean>(TOKEN(hash), "token.set", { ownerId: u.id }))) throw new Error("That token belongs to someone else.");
    await this.call(DIRECTORY, "dir.addOwner", { ownerId: u.id });
    for (const h of r.dropped) await this.call(TOKEN(h), "token.drop", { ownerId: u.id }).catch(() => {});
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
}

/** Dodo's once only ledger: event ids in the payments object, the newest applied time in each owner's own object. */
export class DurableDodoLedger implements DodoLedger {
  constructor(private ns: NamespaceLike, private clock: () => number = Date.now) {}
  claim(id: string) { return callObject<boolean>(this.ns, PAYMENTS, "pay.claim", { id, now: this.clock() }); }
  async release(id: string) { await callObject(this.ns, PAYMENTS, "pay.release", { id }); }
  lastAppliedAt(userId: string) { return callObject<number | null>(this.ns, OWNER(userId), "owner.lastAt"); }
  async setLastAppliedAt(userId: string, ms: number) { await callObject(this.ns, OWNER(userId), "owner.setLastAt", { ms }); }
}
export class DurableLinkBook implements LinkBook {
  constructor(private ns: NamespaceLike) {}
  get(customerId: string) { return callObject<string | null>(this.ns, PAYMENTS, "pay.link", { customerId }); }
  async set(customerId: string, userId: string) { await callObject(this.ns, PAYMENTS, "pay.setLink", { customerId, userId }); }
}
