// What the proxy keeps, and nothing more: who a token belongs to, what each user has spent today and this month, how many
// requests they have running, and one small record per request (counts and cost, never text). The in memory store below is for
// tests and a first run; the real one, on Cloudflare Durable Objects (store-do.ts, M99), implements the same interface and the
// same tests run against both (test/stores.ts).
import { budgetCheck, dayKey, monthKey, type Plan, type Spent } from "./plans.ts";
import type { Usage } from "./usage.ts";

/** `planUntil`: a plan a late payment keeps only until then (Dodo's past_due_ends_at); from then on the person is on free. */
export type User = { id: string; plan: string; status: "active" | "past_due" | "canceled" | "revoked" | "suspended"; planUntil?: number };
/** The plan a payment event gave an owner. It wins over the plan written with each token, until a newer event changes it. */
export type OwnerPlan = { plan: string; status: "active" | "past_due"; until?: number };
/** One line of the suspension log: ids and dates only, never text. `caseId` is a short reference of ours (a report or notice number). */
export type SuspensionRecord = { ownerId: string; kind: "suspended" | "restored"; at: number; caseId?: string };
export type UsageRecord = { userId: string; model: string; usage: Usage; usd: number; at: number; complete: boolean };

export interface Store {
  userByTokenHash(hash: string): Promise<User | null>;
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
  /** Write the plan a payment event gave an owner (every token of theirs that still works). With `at` (the event's time, ms),
   *  an event older than one already applied changes nothing, in the same step, and the answer is false. */
  setOwnerPlan?(ownerId: string, plan: OwnerPlan, at?: number): Promise<boolean>;
  suspensions(): Promise<SuspensionRecord[]>;
}

export class MemoryStore implements Store {
  #users = new Map<string, User>();
  #spent = new Map<string, number>();
  #running = new Map<string, number>();
  #held = new Map<string, number>();
  #suspended = new Set<string>();
  #plans = new Map<string, { plan: OwnerPlan; at?: number }>();
  #log: SuspensionRecord[] = [];
  records: UsageRecord[] = [];
  addUser(hash: string, u: User) { this.#users.set(hash, u); }
  setSpent(userId: string, now: number, s: Spent) { this.#spent.set(`${userId}|d|${dayKey(now)}`, s.day); this.#spent.set(`${userId}|m|${monthKey(now)}`, s.month); }
  async userByTokenHash(hash: string): Promise<User | null> {
    const u = this.#users.get(hash) ?? null;
    if (!u) return null;
    const paid = this.#plans.get(u.id)?.plan;
    if (this.#suspended.has(u.id)) return { id: u.id, plan: paid?.plan ?? u.plan, status: "suspended" };   // the flag wins over whatever status was written
    if (u.status === "revoked" || !paid) return u;
    return { id: u.id, plan: paid.plan, status: paid.status, ...(paid.until !== undefined ? { planUntil: paid.until } : {}) };
  }
  async setOwnerPlan(ownerId: string, plan: OwnerPlan, at?: number) {
    const was = this.#plans.get(ownerId);
    if (at !== undefined && was?.at !== undefined && at < was.at) return false;
    this.#plans.set(ownerId, { plan, at: at !== undefined ? Math.max(at, was?.at ?? 0) : was?.at });
    return true;
  }
  async listOwnerIds() { return [...new Set([...this.#users.values()].map((u) => u.id))]; }
  async isSuspended(ownerId: string) { return this.#suspended.has(ownerId); }
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
    const held = this.#held.get(userId) ?? 0;
    return { day: (this.#spent.get(`${userId}|d|${dayKey(now)}`) ?? 0) + held, month: (this.#spent.get(`${userId}|m|${monthKey(now)}`) ?? 0) + held };
  }
  // No await between the check and the hold, so two requests can never both pass on the same room.
  async hold(userId: string, usd: number, now: number, limits: Plan) {
    if (!budgetCheck(limits, this.#spentNow(userId, now), now).ok) return false;
    this.#held.set(userId, (this.#held.get(userId) ?? 0) + usd);
    return true;
  }
  async unhold(userId: string, usd: number) { this.#held.set(userId, Math.max(0, (this.#held.get(userId) ?? 0) - usd)); }
  async record(r: UsageRecord) {
    this.records.push(r);
    for (const k of [`${r.userId}|d|${dayKey(r.at)}`, `${r.userId}|m|${monthKey(r.at)}`]) this.#spent.set(k, (this.#spent.get(k) ?? 0) + r.usd);
  }
  async begin(userId: string, max: number) { const n = this.#running.get(userId) ?? 0; if (n >= max) return false; this.#running.set(userId, n + 1); return true; }
  async end(userId: string) { this.#running.set(userId, Math.max(0, (this.#running.get(userId) ?? 0) - 1)); }
  inFlight(userId: string) { return this.#running.get(userId) ?? 0; }
  /** Everything held, for a test that checks no text or secret is among it. */
  dump() { return { users: [...this.#users], suspended: [...this.#suspended], plans: [...this.#plans], log: this.#log, spent: [...this.#spent], running: [...this.#running], held: [...this.#held], records: this.records }; }
}
