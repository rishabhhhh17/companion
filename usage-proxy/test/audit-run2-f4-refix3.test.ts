// Security audit run 2, finding 4, re-attack round 3 (20 Nov 2026). A deleted account's Google id could stay on the owner
// list. An old ID token (its nonce used before the delete) is sent again and races the delete: the sign in writes onto the
// wiped owner, the delete's listing check sees the owner present and keeps it listed, then owner.lateLine refuses the sign in
// and empties the owner again. That refusal returned without fixing the listing.
// The fixes: a sign in refused by owner.lateLine settles the listing too, and settling the listing checks the owner again
// after every change it makes, so a stale "present" read can never leave a wiped owner listed.
import { expect, test } from "bun:test";
import { DIRECTORY, DurableStore, OWNER, type NamespaceLike } from "../src/store-do.ts";
import { deletedKey, type DeletedLine } from "../src/deleted.ts";
import { checkNonce, makeNonce } from "../src/nonce.ts";
import { newToken } from "../src/tokens.ts";
import { FakeNamespace } from "./fake-do.ts";

const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const SECRET = "founder-test-user-id-secret-0123456789abcdef";
const OWNER_ID = "google:109876543210";
const FREE = { id: OWNER_ID, plan: "free", status: "active" } as const;
async function nonceIds() { const n = await checkNonce(await makeNonce(SECRET, NOW), SECRET, NOW); if (!n.ok) throw new Error("nonce"); return n; }
/** A namespace that holds the first call of each named op until released. */
function heldAt(fake: FakeNamespace, ops: string[]) {
  const gates = new Map(ops.map((op) => {
    let release!: () => void; const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void; const atGate = new Promise<void>((r) => (reached = r));
    return [op, { gate, release, reached, atGate }] as const;
  }));
  const ns = { idFromName: (n: string) => fake.idFromName(n), get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
    const g = gates.get(new URL(input).pathname.slice(1));
    if (g) { g.reached(); await g.gate; }
    return fake.get(id as never).fetch(input, init);
  } }) } as unknown as NamespaceLike;
  return { ns, at: (op: string) => gates.get(op)! };
}

async function setup() {
  const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
  const key = await deletedKey(OWNER_ID, SECRET);
  const t1 = await newToken(), n1 = await nonceIds();
  expect(await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key })).toBe(true);
  expect(await plain.listOwnerIds()).toEqual([OWNER_ID]);
  return { fake, plain, key, t1, n1 };
}
async function expectGone(fake: FakeNamespace, plain: DurableStore, key: string) {
  const line = fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine;
  expect(line).toBeDefined();                            // the line itself stays
  expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
  expect(fake.storageOf(OWNER(OWNER_ID))!.data.size).toBe(0);
  expect(await plain.listOwnerIds()).toEqual([]);        // and no Google id is kept on the list
}

test("F4 r3: a replayed nonce landing between the wipe and the delete's listing check leaves no Google id listed", async () => {
  const { fake, plain, key, t1, n1 } = await setup();
  const hs = heldAt(fake, ["owner.signIn", "owner.lateLine"]), hd = heldAt(fake, ["owner.present"]);
  const sStore = new DurableStore(hs.ns, () => NOW), dStore = new DurableStore(hd.ns, () => NOW);
  const s = sStore.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
  await hs.at("owner.signIn").atGate;
  const d = dStore.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
  await hd.at("owner.present").atGate;                  // line written, owner wiped, listing not settled yet
  hs.at("owner.signIn").release();                       // the replay writes onto the wiped owner
  await hs.at("owner.lateLine").atGate;                  // and reads the delete's line, holding n1
  hd.at("owner.present").release();
  expect((await d).ok).toBe(true);                       // the delete saw the owner present and kept it listed
  hs.at("owner.lateLine").release();
  expect(await s).toBe(false);                           // the replay is refused
  await expectGone(fake, plain, key);
});

test("F4 r3: the delete's listing add landing after the refused replay cleaned up leaves no Google id listed", async () => {
  const { fake, plain, key, t1, n1 } = await setup();
  const hs = heldAt(fake, ["owner.signIn", "owner.lateLine"]), hd = heldAt(fake, ["owner.present", "dir.addOwner"]);
  const sStore = new DurableStore(hs.ns, () => NOW), dStore = new DurableStore(hd.ns, () => NOW);
  const s = sStore.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
  await hs.at("owner.signIn").atGate;
  const d = dStore.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
  await hd.at("owner.present").atGate;
  hs.at("owner.signIn").release();
  await hs.at("owner.lateLine").atGate;
  hd.at("owner.present").release();                      // the delete reads "present" (the replay's write)
  await hd.at("dir.addOwner").atGate;                    // and is held before it lists the owner
  hs.at("owner.lateLine").release();
  expect(await s).toBe(false);                           // the replay is refused, empties the owner and settles the list
  hd.at("dir.addOwner").release();                       // now the delete's stale add lands
  expect((await d).ok).toBe(true);
  await expectGone(fake, plain, key);
});

test("F4 r3: a refused replay with no delete in flight changes nothing on the list", async () => {
  const { plain, key, t1, n1 } = await setup();
  expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);
  expect(await plain.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key })).toBe(false);
  expect(await plain.listOwnerIds()).toEqual([]);
  // A fresh sign in after the delete is listed as usual.
  const n2 = await nonceIds();
  expect(await plain.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n2.id, nonceUntil: n2.until, now: NOW, deletedKey: key })).toBe(true);
  expect(await plain.listOwnerIds()).toEqual([OWNER_ID]);
});

test("F4 r3: a token issued without Google racing a delete leaves no Google id listed", async () => {
  const { fake, plain, key, t1 } = await setup();
  const ha = heldAt(fake, ["token.set"]);
  const aStore = new DurableStore(ha.ns, () => NOW);
  const t2 = await newToken();
  const a = aStore.addUser(t2.hash, FREE);
  await ha.at("token.set").atGate;                       // the new token is on the owner, the list not touched yet
  // A delete runs whole meanwhile and wipes every token, t2 included.
  expect((await plain.deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash })).ok).toBe(true);
  expect(await plain.listOwnerIds()).toEqual([]);
  ha.at("token.set").release();
  await a;
  expect(fake.storageOf(OWNER(OWNER_ID))!.data.size).toBe(0);
  expect(await plain.listOwnerIds()).toEqual([]);        // the late add does not put the wiped owner back
});
