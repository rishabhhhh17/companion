// What the proxy keeps, and nothing more: who a token belongs to, what each user has spent today and this month, how many
// requests they have running, and one small record per request (counts and cost, never text). The in memory store below is for
// tests and a first run; the real one (Cloudflare Durable Objects or a database) implements the same interface.
import { dayKey, monthKey, type Spent } from "./plans.ts";
import type { Usage } from "./usage.ts";

export type User = { id: string; plan: string; status: "active" | "past_due" | "canceled" | "revoked" | "suspended" };
/** One line of the suspension log: ids and dates only, never text. `caseId` is a short reference of ours (a report or notice number). */
export type SuspensionRecord = { ownerId: string; kind: "suspended" | "restored"; at: number; caseId?: string };
export type UsageRecord = { userId: string; model: string; usage: Usage; usd: number; at: number; complete: boolean };

export interface Store {
  userByTokenHash(hash: string): Promise<User | null>;
  spent(userId: string, now: number): Promise<Spent>;
  record(r: UsageRecord): Promise<void>;
  /** Take one of the user's running request slots; false when `max` are already running. */
  begin(userId: string, max: number): Promise<boolean>;
  end(userId: string): Promise<void>;
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
  suspensions(): Promise<SuspensionRecord[]>;
}

export class MemoryStore implements Store {
  #users = new Map<string, User>();
  #spent = new Map<string, number>();
  #running = new Map<string, number>();
  #suspended = new Set<string>();
  #log: SuspensionRecord[] = [];
  records: UsageRecord[] = [];
  addUser(hash: string, u: User) { this.#users.set(hash, u); }
  setSpent(userId: string, now: number, s: Spent) { this.#spent.set(`${userId}|d|${dayKey(now)}`, s.day); this.#spent.set(`${userId}|m|${monthKey(now)}`, s.month); }
  async userByTokenHash(hash: string) {
    const u = this.#users.get(hash) ?? null;
    return u && this.#suspended.has(u.id) ? { ...u, status: "suspended" as const } : u;   // the flag wins over whatever status was written
  }
  async listOwnerIds() { return [...new Set([...this.#users.values()].map((u) => u.id))]; }
  async isSuspended(ownerId: string) { return this.#suspended.has(ownerId); }
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
  async spent(userId: string, now: number): Promise<Spent> { return { day: this.#spent.get(`${userId}|d|${dayKey(now)}`) ?? 0, month: this.#spent.get(`${userId}|m|${monthKey(now)}`) ?? 0 }; }
  async record(r: UsageRecord) {
    this.records.push(r);
    for (const k of [`${r.userId}|d|${dayKey(r.at)}`, `${r.userId}|m|${monthKey(r.at)}`]) this.#spent.set(k, (this.#spent.get(k) ?? 0) + r.usd);
  }
  async begin(userId: string, max: number) { const n = this.#running.get(userId) ?? 0; if (n >= max) return false; this.#running.set(userId, n + 1); return true; }
  async end(userId: string) { this.#running.set(userId, Math.max(0, (this.#running.get(userId) ?? 0) - 1)); }
  inFlight(userId: string) { return this.#running.get(userId) ?? 0; }
  /** Everything held, for a test that checks no text or secret is among it. */
  dump() { return { users: [...this.#users], suspended: [...this.#suspended], log: this.#log, spent: [...this.#spent], running: [...this.#running], records: this.records }; }
}
