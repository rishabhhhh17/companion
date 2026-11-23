// Security audit run 2, findings 2 and 4 (19 Nov 2026): the kept deleted line must survive two deletes sent at once, and a
// sign in that races a delete must still find the line (its spend carried over, its used nonces still refused).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createGoogleVerifier } from "../src/google.ts";
import { createProxy } from "../src/proxy.ts";
import { ACCOUNT_DELETE_PATH, GOOGLE_SIGNIN_PATH, ME_PATH, NONCE_PATH } from "../src/account-routes.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { MemoryStore } from "../src/store.ts";
import { callObject, DIRECTORY, DurableStore, OWNER, type NamespaceLike } from "../src/store-do.ts";
import { deletedKey, mergeDeletedLines, type DeletedLine } from "../src/deleted.ts";
import { checkNonce, makeNonce } from "../src/nonce.ts";
import { newToken } from "../src/tokens.ts";
import { dayKey, monthKey } from "../src/plans.ts";
import { FakeNamespace } from "./fake-do.ts";
import { claimsAt, googleKeys, keyPair, signIdToken } from "./google-stand-in.ts";
import { FakeDurableStore, type TestStore } from "./stores.ts";

const realFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = (async () => { throw new Error("no network in tests"); }) as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = realFetch; });

const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const SECRET = "founder-test-user-id-secret-0123456789abcdef";
const SUB = "109876543210", OWNER_ID = `google:${SUB}`;

// ---- Finding 2: two deletes at once ----

const STORES: { name: string; make: () => TestStore }[] = [
  { name: "in memory store", make: () => new MemoryStore() },
  { name: "Durable Object store", make: () => new FakeDurableStore(undefined, () => NOW) },
];

for (const { name, make } of STORES) {
  describe(`finding 2, ${name}`, () => {
    test("two delete requests sent at once keep the month's spend for the next sign in", async () => {
      const GOOD = await keyPair("kid-good");
      const store = make();
      const handle = createProxy({ store, anthropicKey: "", userIdSecret: SECRET, enabled: () => false, now: () => NOW, log: () => {},
        googleSignIn: createGoogleVerifier({ clientId: "1234-test.apps.googleusercontent.com", fetch: googleKeys(() => [GOOD]), now: () => NOW }) } as never);
      const send = (p: string, init: RequestInit = {}) => handle(new Request(`https://api.example${p}`, init));
      const t = await issueSignInToken(store, OWNER_ID, "free", { email: "pat@example.com", nonceId: crypto.randomUUID(), nonceUntil: NOW + 600_000, now: NOW });
      if (!t.ok) throw new Error("setup");
      store.setSpent(OWNER_ID, NOW, { day: 0.2, month: 0.2 });
      const del = () => send(ACCOUNT_DELETE_PATH, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: JSON.stringify({ confirm: true }) });
      const res = await Promise.all([del(), del()]);
      expect(res.some((r) => r.status === 200)).toBe(true);
      const nonce = ((await (await send(NONCE_PATH)).json()) as { nonce: string }).nonce;
      const idToken = await signIdToken(GOOD, claimsAt(NOW, { nonce, sub: SUB }));
      const si = await send(GOOGLE_SIGNIN_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
      expect(si.status).toBe(200);
      const tok = ((await si.json()) as { token: string }).token;
      const me = (await (await send(ME_PATH, { headers: { authorization: `Bearer ${tok}` } })).json()) as { use: { today: number; month: number } };
      expect(me.use.today).toBeGreaterThan(0);   // the day's $0.20 is still counted (shown as a share of the Free limit)
      expect(me.use.month).toBeGreaterThan(0);
      const spent = await store.spent(OWNER_ID, NOW);
      expect(spent.month).toBeCloseTo(0.2, 6);
      expect(spent.day).toBeCloseTo(0.2, 6);
    });

    test("a delete whose token is already gone is refused and writes no line", async () => {
      const store = make();
      const a = await newToken();
      await store.signIn(a.hash, { id: OWNER_ID, plan: "free", status: "active" }, { email: "a@x", nonceId: "n-1", nonceUntil: NOW + 600_000, now: NOW });
      store.setSpent(OWNER_ID, NOW, { day: 0.2, month: 0.2 });
      const key = await deletedKey(OWNER_ID, SECRET);
      expect((await store.deleteAccount(OWNER_ID, { key, now: NOW, hash: a.hash })).ok).toBe(true);
      const again = await store.deleteAccount(OWNER_ID, { key, now: NOW + 1, hash: a.hash });
      expect(again).toEqual({ ok: false, why: "gone" });
      // The line from the first delete still carries the spend.
      const b = await newToken();
      expect(await store.signIn(b.hash, { id: OWNER_ID, plan: "free", status: "active" }, { email: "a@x", nonceId: "n-2", nonceUntil: NOW + 600_000, now: NOW + 2, deletedKey: key })).toBe(true);
      expect((await store.spent(OWNER_ID, NOW + 2)).month).toBeCloseTo(0.2, 6);
      // A nonce used before the delete is still refused.
      const c = await newToken();
      expect(await store.signIn(c.hash, { id: OWNER_ID, plan: "free", status: "active" }, { email: "a@x", nonceId: "n-1", nonceUntil: NOW + 600_000, now: NOW + 3 })).toBe(false);
    });
  });
}

test("finding 2: dir.deletedPut keeps the larger amounts and every nonce", async () => {
  const fake = new FakeNamespace(), store = new DurableStore(fake, () => NOW);
  const key = await deletedKey(OWNER_ID, SECRET);
  const put = (line: DeletedLine) => fake.get(fake.idFromName(DIRECTORY)).fetch("https://do/dir.deletedPut", { method: "POST", body: JSON.stringify({ key, line }) });
  const real: DeletedLine = { at: NOW, day: dayKey(NOW), dayUsd: 0.2, month: monthKey(NOW), monthUsd: 1.5, nonces: [["n-1", NOW + 600_000]], until: NOW + 30 * 86400_000 };
  const empty: DeletedLine = { at: NOW + 5, day: dayKey(NOW), dayUsd: 0, month: monthKey(NOW), monthUsd: 0, nonces: [["n-2", NOW + 700_000]], until: NOW + 29 * 86400_000 };
  await put(real);
  await put(empty);
  const kept = fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine;
  expect(kept.dayUsd).toBe(0.2);
  expect(kept.monthUsd).toBe(1.5);
  expect(kept.nonces.map(([id]) => id).sort()).toEqual(["n-1", "n-2"]);
  expect(kept.until).toBe(real.until);
  // One index key only, for the kept `until`.
  const idx = [...fake.storageOf(DIRECTORY)!.data.keys()].filter((k) => k.startsWith("dx:"));
  expect(idx.length).toBe(1);
  expect(await store.isDeletedOwner(OWNER_ID, key, NOW + 10)).toBe(true);
});

test("finding 2: mergeDeletedLines takes a newer day or month as it is", () => {
  const nextMonth = Date.UTC(2026, 11, 2, 9);
  const old: DeletedLine = { at: NOW, day: dayKey(NOW), dayUsd: 0.2, month: monthKey(NOW), monthUsd: 1.5, nonces: [], until: NOW + 1 };
  const fresh: DeletedLine = { at: nextMonth, day: dayKey(nextMonth), dayUsd: 0.05, month: monthKey(nextMonth), monthUsd: 0.05, nonces: [], until: nextMonth + 1 };
  const m = mergeDeletedLines(old, fresh);
  expect(m.day).toBe(fresh.day); expect(m.dayUsd).toBe(0.05);
  expect(m.month).toBe(fresh.month); expect(m.monthUsd).toBe(0.05);
  expect(mergeDeletedLines(fresh, old).monthUsd).toBe(0.05);   // an older line never wins over a newer month
});

// ---- Finding 4: a sign in racing a delete ----

function gated(fake: FakeNamespace) {
  let release!: () => void; const gate = new Promise<void>((r) => (release = r));
  let reached!: () => void; const atGate = new Promise<void>((r) => (reached = r));
  const ns: NamespaceLike = {
    idFromName: (n: string) => fake.idFromName(n),
    get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
      if (new URL(input).pathname === "/owner.signIn") { reached(); await gate; }
      return fake.get(id as never).fetch(input, init);
    } }),
  } as unknown as NamespaceLike;
  return { ns, release, atGate };
}
function seedSpend(fake: FakeNamespace, usd: number) {
  const data = fake.storageFor(OWNER(OWNER_ID)).data;
  data.set("live", { running: [], holds: [], seq: 1 });
  data.set("rec:000000000001", { seed: true, userId: OWNER_ID, model: "", usd: 0, at: NOW, complete: true,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 },
    totals: { day: dayKey(NOW), dayUsd: usd, month: monthKey(NOW), monthUsd: usd } });
}
async function nonceIds() { const n = await checkNonce(await makeNonce(SECRET, NOW), SECRET, NOW); if (!n.ok) throw new Error("nonce"); return n; }
const FREE = { id: OWNER_ID, plan: "free", status: "active" } as const;

describe("finding 4", () => {
  test("a sign in held between its two calls while a delete runs still carries the month's spend", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 4.5);
    const g = gated(fake), racing = new DurableStore(g.ns, () => NOW);
    const t2 = await newToken(), n2 = await nonceIds();
    const signing = racing.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key });
    await g.atGate;
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);
    g.release();
    expect(await signing).toBe(true);
    expect((await plain.spent(OWNER_ID, NOW)).month).toBe(4.5);
    // The line stays until its `until` (re-attack round 1), but the owner holds data again so it is not deleted, and a later
    // delete keeps the carried spend.
    expect((fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine).monthUsd).toBe(4.5);
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW)).toBe(false);
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW + 1000, hash: t2.hash })).ok).toBe(true);
    expect((fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine).monthUsd).toBe(4.5);
  });

  test("a used nonce traded again during a delete is refused, and the account stays deleted", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    const g = gated(fake), racing = new DurableStore(g.ns, () => NOW);
    const t2 = await newToken();
    const replay = racing.signIn(t2.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    await g.atGate;
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);
    g.release();
    expect(await replay).toBe(false);
    expect(await plain.userByTokenHash(t2.hash)).toBeNull();
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW)).toBe(true);
  });
});

// ---- Finding 4, re-attack (19 Nov 2026): a sign in racing a newer delete must leave that delete's line as it is ----

function heldAt(fake: FakeNamespace, ops: string[]) {
  const gates = new Map(ops.map((op) => {
    let release!: () => void; const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void; const atGate = new Promise<void>((r) => (reached = r));
    return [op, { gate, release, reached, atGate }] as const;
  }));
  const ns: NamespaceLike = {
    idFromName: (n: string) => fake.idFromName(n),
    get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
      const g = gates.get(new URL(input).pathname.slice(1));
      if (g) { g.reached(); await g.gate; }
      return fake.get(id as never).fetch(input, init);
    } }),
  } as unknown as NamespaceLike;
  const at = (op: string) => gates.get(op)!;
  return { ns, at };
}
const lineOf = (fake: FakeNamespace, key: string) => fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine | undefined;

describe("finding 4, re-attack", () => {
  test("an old line read by a held sign in: a second sign in and a new delete run meanwhile, and the new line stays", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 4.5);
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);   // L0 holds 4.5
    const h = heldAt(fake, ["token.set"]), racing = new DurableStore(h.ns, () => NOW);
    const t2 = await newToken(), n2 = await nonceIds();
    const s1 = racing.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key });
    await h.at("token.set").atGate;
    const t3 = await newToken(), n3 = await nonceIds();
    expect(await plain.signIn(t3.hash, FREE, { email: "a@x", nonceId: n3.id, nonceUntil: n3.until, now: NOW, deletedKey: key })).toBe(true);
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW + 1, hash: t3.hash })).ok).toBe(true);   // L1 holds 4.5
    const l1 = lineOf(fake, key);
    expect(l1?.monthUsd).toBe(4.5);
    h.at("token.set").release();
    // S1's token was wiped by the delete, so S1 is told to sign in again, and L1 is left as it was.
    expect(await s1).toBe(false);
    expect(await plain.userByTokenHash(t2.hash)).toBeNull();
    expect(lineOf(fake, key)).toEqual(l1);
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 2)).toBe(true);
    const t4 = await newToken(), n4 = await nonceIds();
    expect(await plain.signIn(t4.hash, FREE, { email: "a@x", nonceId: n4.id, nonceUntil: n4.until, now: NOW + 2, deletedKey: key })).toBe(true);
    expect((await plain.spent(OWNER_ID, NOW + 2)).month).toBe(4.5);
    for (const used of [n1, n2, n3]) expect(await plain.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: used.id, nonceUntil: used.until, now: NOW + 3, deletedKey: key })).toBe(false);
  });

  test("a delete held before its wipe and a sign in held before token.set: the delete's line stays and n2 stays used", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 4.5);
    const hs = heldAt(fake, ["owner.signIn", "token.set"]), hd = heldAt(fake, ["owner.wipe"]);
    const sStore = new DurableStore(hs.ns, () => NOW), dStore = new DurableStore(hd.ns, () => NOW);
    const t2 = await newToken(), n2 = await nonceIds();
    const s = sStore.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key });
    await hs.at("owner.signIn").atGate;                     // the sign in read no line
    const d = dStore.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
    await hd.at("owner.wipe").atGate;                       // the delete wrote its line, not wiped yet
    hs.at("owner.signIn").release(); await hs.at("token.set").atGate;
    hd.at("owner.wipe").release();
    expect((await d).ok).toBe(true);
    const kept = lineOf(fake, key);
    expect(kept?.monthUsd).toBe(4.5);
    hs.at("token.set").release();
    expect(await s).toBe(false);                            // its token went with the wipe
    expect(await plain.userByTokenHash(t2.hash)).toBeNull();
    expect(lineOf(fake, key)).toEqual(kept);
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 2)).toBe(true);
    const t3 = await newToken(), n3 = await nonceIds();
    expect(await plain.signIn(t3.hash, FREE, { email: "a@x", nonceId: n3.id, nonceUntil: n3.until, now: NOW + 2, deletedKey: key })).toBe(true);
    expect((await plain.spent(OWNER_ID, NOW + 2)).month).toBe(4.5);
    expect(await plain.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW + 3, deletedKey: key })).toBe(false);
  });
});

// ---- Finding 4, re-attack round 1 (19 Nov 2026): a sign in never takes away a delete's line, and a delete is never undone ----

/** Like heldAt, but holds only the `nth` call (from 1) to `op`; the calls before it go through. */
function heldNth(fake: FakeNamespace, op: string, nth: number) {
  let release!: () => void; const gate = new Promise<void>((r) => (release = r));
  let reached!: () => void; const atGate = new Promise<void>((r) => (reached = r));
  let seen = 0;
  const ns: NamespaceLike = {
    idFromName: (n: string) => fake.idFromName(n),
    get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
      if (new URL(input).pathname.slice(1) === op && ++seen === nth) { reached(); await gate; }
      return fake.get(id as never).fetch(input, init);
    } }),
  } as unknown as NamespaceLike;
  return { ns, release, atGate };
}
const ownersOf = (store: DurableStore) => store.listOwnerIds();

describe("finding 4, re-attack round 1", () => {
  // Re-attack round 2: the delete no longer writes its line after the wipe. A sign in between the line write and the wipe
  // changes the owner (a new nonce), so the wipe is refused, the line is written again with that nonce, and then wiped.
  test("a sign in between a delete's line write and its wipe: the line is written again before the wipe, and stays", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 4.5);
    // The delete writes its first line (4.5, n1), then waits before the wipe.
    const hw = heldAt(fake, ["owner.wipe"]), hp = heldNth(fake, "dir.deletedPut", 2);
    const both = { idFromName: (n: string) => fake.idFromName(n), get: (id: unknown) => ({ fetch: (u: string, i?: RequestInit) =>
      (new URL(u).pathname === "/owner.wipe" ? hw.ns : hp.ns).get(id as never).fetch(u, i) }) } as unknown as NamespaceLike;
    const d = new DurableStore(both, () => NOW).deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
    await hw.at("owner.wipe").atGate;
    // A second device signs in now, reading the delete's first line.
    const t2 = await newToken(), n2 = await nonceIds();
    expect(await plain.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key })).toBe(true);
    hw.at("owner.wipe").release();
    await hp.atGate;   // the wipe was refused (the owner changed), the line with the new nonce not written yet
    expect(lineOf(fake, key)?.monthUsd).toBe(4.5);
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW)).toBe(false);   // nothing wiped yet
    expect(await plain.userByTokenHash(t2.hash)).not.toBeNull();
    // A replay of the nonce used before the delete is refused, and nothing was reset.
    expect(await plain.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key })).toBe(false);
    hp.release();
    expect((await d).ok).toBe(true);
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
    expect(lineOf(fake, key)?.monthUsd).toBe(4.5);
    expect(lineOf(fake, key)?.nonces.map(([id]) => id)).toEqual(expect.arrayContaining([n1.id, n2.id]));
    expect(await plain.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW + 2, deletedKey: key })).toBe(false);
    expect(await ownersOf(plain)).not.toContain(OWNER_ID);
  });

  test("a delete that runs whole just before the sign in lists the owner leaves no trace of the owner", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 4.5);
    const h = heldAt(fake, ["dir.addOwner"]), racing = new DurableStore(h.ns, () => NOW);
    const t2 = await newToken(), n2 = await nonceIds();
    const s = racing.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key });
    await h.at("dir.addOwner").atGate;
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);
    h.at("dir.addOwner").release();
    expect(await s).toBe(false);
    expect(await plain.userByTokenHash(t2.hash)).toBeNull();
    expect(await ownersOf(plain)).not.toContain(OWNER_ID);
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
  });

  test("a delete's owner list removal never hides an owner who signed in again after its wipe", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    const h = heldAt(fake, ["dir.removeOwner"]), del = new DurableStore(h.ns, () => NOW);
    const d = del.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
    await h.at("dir.removeOwner").atGate;   // wiped, the owner still listed
    const t2 = await newToken(), n2 = await nonceIds();
    expect(await plain.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key })).toBe(true);
    h.at("dir.removeOwner").release();
    expect((await d).ok).toBe(true);
    expect(await ownersOf(plain)).toContain(OWNER_ID);
    expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(false);
  });

  test("a sign in that read an old line, held while another device signs in, spends and deletes, keeps the newer spend", async () => {
    const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
    const key = await deletedKey(OWNER_ID, SECRET);
    const t1 = await newToken(), n1 = await nonceIds();
    await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    seedSpend(fake, 4.5);
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);   // L0 holds 4.5
    const h = heldAt(fake, ["owner.signIn"]), racing = new DurableStore(h.ns, () => NOW);
    const t2 = await newToken(), n2 = await nonceIds();
    const s = racing.signIn(t2.hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key });
    await h.at("owner.signIn").atGate;   // S read L0
    const t3 = await newToken(), n3 = await nonceIds();
    expect(await plain.signIn(t3.hash, FREE, { email: "a@x", nonceId: n3.id, nonceUntil: n3.until, now: NOW, deletedKey: key })).toBe(true);
    seedSpend(fake, 1);   // $1.00 booked after the carried $4.50
    expect((await plain.spent(OWNER_ID, NOW)).month).toBe(5.5);
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW + 1, hash: t3.hash })).ok).toBe(true);   // L1 holds 5.5
    expect(lineOf(fake, key)?.monthUsd).toBe(5.5);
    h.at("owner.signIn").release();
    expect(await s).toBe(true);
    expect((await plain.spent(OWNER_ID, NOW + 2)).month).toBe(5.5);
    expect(lineOf(fake, key)?.monthUsd).toBe(5.5);
    expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW + 3, hash: t2.hash })).ok).toBe(true);
    expect(lineOf(fake, key)?.monthUsd).toBe(5.5);
  });
});
