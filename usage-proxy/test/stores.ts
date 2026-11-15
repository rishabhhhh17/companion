// The two stores every store test runs against (M99): the in memory one and the Durable Object one on a fake of Cloudflare's
// storage. A test file loops over TEST_STORES, so a promise one store keeps, the other must keep too.
import { MemoryStore, type Store, type UsageRecord } from "../src/store.ts";
import { dayKey, monthKey, type Spent } from "../src/plans.ts";
import { DurableStore, LEASE_MS, OWNER } from "../src/store-do.ts";
import { FakeNamespace } from "./fake-do.ts";

/** A store with the few helpers the tests read: what was booked, how many requests run, and everything it holds. */
export type TestStore = Store & { readonly records: UsageRecord[]; inFlight(userId: string): number; dump(): unknown; setSpent(userId: string, now: number, s: Spent): void };

/** The Durable Object store, with the same test helpers the in memory store has, read straight from the fake storage. */
export class FakeDurableStore extends DurableStore implements TestStore {
  constructor(public fake = new FakeNamespace(), private nowFor: () => number = Date.now) { super(fake, nowFor); }
  get records(): UsageRecord[] {
    const out: [string, UsageRecord][] = [];
    for (const [name, o] of this.fake.objects) if (name.startsWith("owner:")) for (const [k, v] of o.storage.data) if (k.startsWith("rec:")) out.push([k, v as UsageRecord]);
    return out.sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
  }
  inFlight(userId: string): number {
    const running = (this.fake.storageOf(OWNER(userId))?.data.get("running") as { at: number }[] | undefined) ?? [];
    return running.filter((r) => this.nowFor() - r.at < LEASE_MS).length;
  }
  dump() { return this.fake.dump(); }
  /** Writes what was spent straight into the owner's object, as the in memory store's helper does. */
  setSpent(userId: string, now: number, s: Spent) {
    const data = this.fake.storageFor(OWNER(userId)).data;
    data.set(`spent:d:${dayKey(now)}`, s.day);
    data.set(`spent:m:${monthKey(now)}`, s.month);
  }
}

export const TEST_STORES: { name: string; make: () => TestStore }[] = [
  { name: "in memory store", make: () => new MemoryStore() },
  { name: "Durable Object store", make: () => new FakeDurableStore() },
];
