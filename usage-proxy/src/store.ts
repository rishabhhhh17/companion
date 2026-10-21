// What the proxy keeps, and nothing more: who a token belongs to, what each user has spent today and this month, how many
// requests they have running, and one small record per request (counts and cost, never text). The in memory store below is for
// tests and a first run; the real one (Cloudflare Durable Objects or a database) implements the same interface.
import { dayKey, monthKey, type Spent } from "./plans.ts";
import type { Usage } from "./usage.ts";

export type User = { id: string; plan: string; status: "active" | "past_due" | "canceled" | "revoked" };
export type UsageRecord = { userId: string; model: string; usage: Usage; usd: number; at: number; complete: boolean };

export interface Store {
  userByTokenHash(hash: string): Promise<User | null>;
  spent(userId: string, now: number): Promise<Spent>;
  record(r: UsageRecord): Promise<void>;
  /** Take one of the user's running request slots; false when `max` are already running. */
  begin(userId: string, max: number): Promise<boolean>;
  end(userId: string): Promise<void>;
}

export class MemoryStore implements Store {
  #users = new Map<string, User>();
  #spent = new Map<string, number>();
  #running = new Map<string, number>();
  records: UsageRecord[] = [];
  addUser(hash: string, u: User) { this.#users.set(hash, u); }
  setSpent(userId: string, now: number, s: Spent) { this.#spent.set(`${userId}|d|${dayKey(now)}`, s.day); this.#spent.set(`${userId}|m|${monthKey(now)}`, s.month); }
  async userByTokenHash(hash: string) { return this.#users.get(hash) ?? null; }
  async spent(userId: string, now: number): Promise<Spent> { return { day: this.#spent.get(`${userId}|d|${dayKey(now)}`) ?? 0, month: this.#spent.get(`${userId}|m|${monthKey(now)}`) ?? 0 }; }
  async record(r: UsageRecord) {
    this.records.push(r);
    for (const k of [`${r.userId}|d|${dayKey(r.at)}`, `${r.userId}|m|${monthKey(r.at)}`]) this.#spent.set(k, (this.#spent.get(k) ?? 0) + r.usd);
  }
  async begin(userId: string, max: number) { const n = this.#running.get(userId) ?? 0; if (n >= max) return false; this.#running.set(userId, n + 1); return true; }
  async end(userId: string) { this.#running.set(userId, Math.max(0, (this.#running.get(userId) ?? 0) - 1)); }
  inFlight(userId: string) { return this.#running.get(userId) ?? 0; }
  /** Everything held, for a test that checks no text or secret is among it. */
  dump() { return { users: [...this.#users], spent: [...this.#spent], running: [...this.#running], records: this.records }; }
}
