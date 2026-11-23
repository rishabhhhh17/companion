// Security audit run 2, finding 4, re-attack round 2 (20 Nov 2026). Two ways the delete's carried spend could still be
// lost after round 1:
//  1. The delete wrote its line twice, the full one only after the wipe. A sign in that landed on the wiped owner in that gap
//     carried the first, lower line, and a carry is never raised once the owner books.
//  2. A model request that found its token before a delete and started after it booked onto the wiped object. The next sign
//     in then saw a record and carried nothing.
// The fixes: the delete's full line is in the directory before its wipe (the wipe is refused when the owner changed since the
// line was written, and the line is written again), and a wiped owner takes no new request and no booking.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createProxy } from "../src/proxy.ts";
import { MemoryStore, type UsageRecord } from "../src/store.ts";
import { DIRECTORY, DurableStore, HOLD_BUSY_MS, OWNER, type NamespaceLike } from "../src/store-do.ts";
import { deletedKey, type DeletedLine } from "../src/deleted.ts";
import { checkNonce, makeNonce } from "../src/nonce.ts";
import { newToken } from "../src/tokens.ts";
import { dayKey, monthKey } from "../src/plans.ts";
import { FakeNamespace } from "./fake-do.ts";
import { FakeDurableStore, type TestStore } from "./stores.ts";

const realFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = (async () => { throw new Error("no network in tests"); }) as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = realFetch; });

const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const SECRET = "founder-test-user-id-secret-0123456789abcdef";
const OWNER_ID = "google:109876543210";
const FREE = { id: OWNER_ID, plan: "free", status: "active" } as const;
const rec = (usd: number, at: number): UsageRecord => ({ userId: OWNER_ID, model: "claude-x", usd, at, complete: true,
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 } } as UsageRecord);
async function nonceIds() { const n = await checkNonce(await makeNonce(SECRET, NOW), SECRET, NOW); if (!n.ok) throw new Error("nonce"); return n; }
function seedSpend(fake: FakeNamespace, usd: number) {
  const data = fake.storageFor(OWNER(OWNER_ID)).data;
  data.set("live", { running: [], holds: [], seq: 1 });
  data.set("rec:000000000001", { seed: true, userId: OWNER_ID, model: "", usd: 0, at: NOW, complete: true,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 },
    totals: { day: dayKey(NOW), dayUsd: usd, month: monthKey(NOW), monthUsd: usd } });
}
const lineOf = (fake: FakeNamespace, key: string) => fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine | undefined;
const gate = () => { let release!: () => void, reached!: () => void; const g = new Promise<void>((r) => (release = r)), at = new Promise<void>((r) => (reached = r)); return { g, at, release, reached }; };

/** A namespace that holds every call to `before` until released, and holds the caller after the first `after` call that
 *  succeeds (its reply is kept back until released). */
function held(fake: FakeNamespace, o: { before?: string; after?: string }) {
  const b = gate(), a = gate();
  let afterSeen = false;
  const ns = {
    idFromName: (n: string) => fake.idFromName(n),
    get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
      const op = new URL(input).pathname.slice(1);
      if (op === o.before) { b.reached(); await b.g; }
      const res = await fake.get(id as never).fetch(input, init);
      if (op === o.after && !afterSeen && ((await res.clone().json()) as { r?: { ok?: boolean } }).r?.ok === true) { afterSeen = true; a.reached(); await a.g; }
      return res;
    } }),
  } as unknown as NamespaceLike;
  return { ns, before: b, after: a };
}

describe("finding 4, re-attack round 2: the line is whole before the wipe", () => {
  test("a sign in that lands on the wiped owner right after the wipe carries the delete's whole spend", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 4.5);
    // A sign in reads no line, then waits before owner.signIn.
    const hs = held(fake, { before: "owner.signIn" });
    const t2 = await newToken(), n2 = await nonceIds();
    const s = new DurableStore(hs.ns, () => NOW).signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key });
    await hs.before.at;
    // The delete writes its first line ($4.50) and waits before the wipe; $1 more is booked in that gap.
    const hd = held(fake, { before: "owner.wipe", after: "owner.wipe" });
    const d = new DurableStore(hd.ns, () => NOW).deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
    await hd.before.at;
    seedSpend(fake, 5.5);
    hd.before.release();
    await hd.after.at;                     // wiped, nothing after the wipe has run yet
    hs.before.release();
    expect(await s).toBe(true);            // owner.signIn on the wiped owner
    hd.after.release();
    expect((await d).ok).toBe(true);
    expect(lineOf(fake, key)?.monthUsd).toBe(5.5);
    expect((await plain.spent(OWNER_ID, NOW + 1)).month).toBe(5.5);
  });

  test("the line in the directory always holds what the wipe takes, even when the owner keeps changing", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 1);
    // Each wipe that is about to run finds $1 more booked first, a few times over.
    let n = 1;
    const ns = { idFromName: (x: string) => fake.idFromName(x), get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
      if (new URL(input).pathname === "/owner.wipe" && n < 4) seedSpend(fake, ++n);
      if (new URL(input).pathname === "/owner.wipe") {
        const now = (fake.storageOf(OWNER(OWNER_ID))!.data.get("rec:000000000001") as { totals: { monthUsd: number } }).totals.monthUsd;
        expect(lineOf(fake, key)?.monthUsd ?? 0).toBeLessThanOrEqual(now);
      }
      const res = await fake.get(id as never).fetch(input, init);
      if (new URL(input).pathname === "/owner.wipe" && ((await res.clone().json()) as { r?: { ok?: boolean } }).r?.ok) expect(lineOf(fake, key)?.monthUsd).toBe(n);
      return res;
    } }) } as unknown as NamespaceLike;
    expect((await new DurableStore(ns, () => NOW).deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);
    expect(lineOf(fake, key)?.monthUsd).toBe(4);
    const t2 = await newToken(), n2 = await nonceIds();
    expect(await plain.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key })).toBe(true);
    expect((await plain.spent(OWNER_ID, NOW + 1)).month).toBe(4);
  });

  test("an owner that never stops changing is not wiped (busy), and keeps everything", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    let n = 0;
    const ns = { idFromName: (x: string) => fake.idFromName(x), get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
      if (new URL(input).pathname === "/owner.wipe") seedSpend(fake, ++n);
      return fake.get(id as never).fetch(input, init);
    } }) } as unknown as NamespaceLike;
    expect(await new DurableStore(ns, () => NOW).deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).toEqual({ ok: false, why: "busy" });
    expect(await plain.userByTokenHash(t1.hash)).not.toBeNull();
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW)).toBe(false);
  });
});

for (const { name, make } of [
  { name: "Durable Object store", make: (): TestStore => new FakeDurableStore(new FakeNamespace(), () => NOW) },
  { name: "in memory store", make: (): TestStore => new MemoryStore() },
]) {
  describe(`finding 4, re-attack round 2: a wiped owner takes no request, ${name}`, () => {
    test("a request that found its token before the delete is refused at start, and the next sign in carries the spend", async () => {
      const store = make();
      const key = await deletedKey(OWNER_ID, SECRET);
      const t1 = await newToken();
      expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW, deletedKey: key })).toBe(true);
      store.setSpent(OWNER_ID, NOW, { day: 1.8, month: 1.8 });
      const user = await store.userByTokenHash(t1.hash);
      expect(user?.id).toBe(OWNER_ID);
      expect((await store.deleteAccount(OWNER_ID, { key, now: NOW + 1, hash: t1.hash })).ok).toBe(true);
      expect(await store.start(user!.id, { max: 4, usd: 0.01, now: NOW + 2, limits: null, id: "r1", hash: t1.hash })).toEqual({ ok: false, why: "gone" });
      // Even a finish sent anyway books nothing onto the wiped owner.
      await store.finish(user!.id, { id: "r1", now: NOW + 3, record: rec(0.01, NOW + 3) });
      expect(store.records.filter((r) => r.userId === OWNER_ID)).toEqual([]);
      expect(await store.isDeletedOwner(OWNER_ID, key, NOW + 4)).toBe(true);
      const t2 = await newToken();
      expect(await store.signIn(t2.hash, FREE, { email: "a@x", nonceId: "n2", nonceUntil: NOW + 600_000, now: NOW + 4, deletedKey: key })).toBe(true);
      expect((await store.spent(OWNER_ID, NOW + 5)).month).toBeCloseTo(1.8, 6);
      // From here the person books as usual, on top of the carried spend.
      expect((await store.start(OWNER_ID, { max: 4, usd: 0.01, now: NOW + 6, limits: null, id: "r2", hash: t2.hash })).ok).toBe(true);
      await store.finish(OWNER_ID, { id: "r2", now: NOW + 7, record: rec(0.01, NOW + 7) });
      expect((await store.spent(OWNER_ID, NOW + 8)).month).toBeCloseTo(1.81, 6);
    });

    test("a start for a token signed out after it was read is refused, and one for a working token passes", async () => {
      const store = make();
      const t1 = await newToken(), t2 = await newToken();
      expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW })).toBe(true);
      expect(await store.signIn(t2.hash, FREE, { email: "a@x", nonceId: "n2", nonceUntil: NOW + 600_000, now: NOW })).toBe(true);
      expect(await store.dropToken(t1.hash)).toBe(true);
      expect(await store.start(OWNER_ID, { max: 4, usd: 0.01, now: NOW, limits: null, id: "r1", hash: t1.hash })).toEqual({ ok: false, why: "gone" });
      expect(store.inFlight(OWNER_ID)).toBe(0);
      expect((await store.start(OWNER_ID, { max: 4, usd: 0.01, now: NOW, limits: null, id: "r2", hash: t2.hash })).ok).toBe(true);
    });

    test("signing out everywhere does not lose the booking of a request still running", async () => {
      const store = make();
      const t1 = await newToken();
      expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW })).toBe(true);
      expect((await store.start(OWNER_ID, { max: 4, usd: 0.05, now: NOW, limits: null, id: "r1" })).ok).toBe(true);
      await store.dropAllTokens(OWNER_ID);
      await store.finish(OWNER_ID, { id: "r1", now: NOW + 1, record: rec(0.03, NOW + 1) });
      expect((await store.spent(OWNER_ID, NOW + 2)).month).toBeCloseTo(0.03, 6);
    });
  });
}

describe("finding 4, re-attack round 2: a request whose hold no longer keeps a delete busy", () => {
  test("its late booking does not land on the wiped owner, and the line counts its hold", async () => {
    const store = new FakeDurableStore(new FakeNamespace(), () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken();
    expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW, deletedKey: key })).toBe(true);
    expect((await store.start(OWNER_ID, { max: 4, usd: 0.5, now: NOW, limits: null, id: "r1" })).ok).toBe(true);
    const later = NOW + HOLD_BUSY_MS + 1;   // past the lease, and past the time its hold keeps a delete busy
    expect((await store.deleteAccount(OWNER_ID, { key, now: later, hash: t1.hash })).ok).toBe(true);
    expect(lineOf(store.fake, key)?.monthUsd).toBeCloseTo(0.5, 6);
    await store.finish(OWNER_ID, { id: "r1", now: later + 1, record: rec(0.2, later + 1) });
    expect(store.records).toEqual([]);
    expect([...(store.fake.storageOf(OWNER(OWNER_ID))?.data.keys() ?? [])]).toEqual([]);
    const t2 = await newToken();
    expect(await store.signIn(t2.hash, FREE, { email: "a@x", nonceId: "n2", nonceUntil: later + 600_000, now: later + 2, deletedKey: key })).toBe(true);
    expect((await store.spent(OWNER_ID, later + 3)).month).toBeCloseTo(0.5, 6);
  });
});

describe("finding 4, re-attack round 2: the proxy", () => {
  test("a model request whose account is deleted between its token check and its start is refused, and nothing is sent", async () => {
    class DeletingStore extends MemoryStore {
      key = "";
      override async userByTokenHash(hash: string) {
        const u = await super.userByTokenHash(hash);
        if (u) await this.deleteAccount(u.id, { key: this.key, now: NOW, hash });
        return u;
      }
    }
    const store = new DeletingStore();
    store.key = await deletedKey(OWNER_ID, SECRET);
    const t = await newToken();
    expect(await store.signIn(t.hash, FREE, { email: "a@x", nonceId: "n1", nonceUntil: NOW + 600_000, now: NOW, deletedKey: store.key })).toBe(true);
    let sent = 0;
    const handle = createProxy({ store, anthropicKey: "sk-ant-api03-TEST-0000000000000000", userIdSecret: SECRET, enabled: () => true, now: () => NOW, log: () => {},
      fetch: (async () => { sent++; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch } as never);
    const r = await handle(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": t.token },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 100, messages: [{ role: "user", content: "hi" }] }) }));
    expect(r.status).toBe(401);
    expect(sent).toBe(0);
    expect(store.records).toEqual([]);
  });
});
