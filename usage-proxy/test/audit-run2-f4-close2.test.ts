// Audit run 2, finding 4, close round 2: the owner list after a delete must never keep the deleted Google id, however many
// times replayed old ID tokens flip the owner present and not present while the delete settles the list. Ported from the
// close round's two reproductions (zz-close-f4-r1 and zz-close-f4-settle-tries).
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
/** Holds every call to the named ops, one at a time: step() waits for the next held call and returns its op and a release. */
function stepper(fake: FakeNamespace, ops: string[]) {
  const waiting: { op: string; go: () => void }[] = []; let wake: (() => void) | null = null;
  const ns = { idFromName: (n: string) => fake.idFromName(n), get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
    const op = new URL(input).pathname.slice(1);
    if (ops.includes(op)) { await new Promise<void>((go) => { waiting.push({ op, go }); wake?.(); }); }
    return fake.get(id as never).fetch(input, init);
  } }) } as unknown as NamespaceLike;
  async function step() { while (waiting.length === 0) await new Promise<void>((r) => (wake = r)); wake = null; return waiting.shift()!; }
  return { ns, step };
}

type Gate = { release: () => void; reached: Promise<void>; done: Promise<void> };
/** Holds the n-th call of an op ("op#n") until released; `done` resolves when that held call's answer is back. */
function gated(fake: FakeNamespace, keys: string[]) {
  const counts = new Map<string, number>();
  const gates = new Map<string, Gate & { gate: Promise<void>; hit: () => void; fin: () => void }>();
  for (const k of keys) {
    let release!: () => void, hit!: () => void, fin!: () => void;
    const gate = new Promise<void>((r) => (release = r)), reached = new Promise<void>((r) => (hit = r)), done = new Promise<void>((r) => (fin = r));
    gates.set(k, { gate, release, reached, hit, done, fin });
  }
  const ns = { idFromName: (n: string) => fake.idFromName(n), get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
    const op = new URL(input).pathname.slice(1), n = (counts.get(op) ?? 0) + 1; counts.set(op, n);
    const g = gates.get(`${op}#${n}`); if (process.env.DBG) console.log("call", op, n, !!g);
    if (g) { g.hit(); await g.gate; }
    const res = await fake.get(id as never).fetch(input, init);
    if (g) setTimeout(g.fin, 0);
    return res;
  } }) } as unknown as NamespaceLike;
  return { ns, at: (k: string) => gates.get(k)! as Gate };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

/** Close F4 round 2 (a), from the re-attack: `k` replays of one old ID token (nonce n1), each read no line and held at
 *  owner.signIn. Each flips the owner twice (owner.signIn writes, owner.lateLine empties) between the delete's reads, so every
 *  read the delete makes disagrees with its change. The delete's last add is held until the last replay has been refused and
 *  has settled the list to empty. With a fixed number of tries (it was 5) three replays used them up and left the id listed. */
async function flipsDuringSettle(k: number) {
  const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
  const key = await deletedKey(OWNER_ID, SECRET);
  const t1 = await newToken(), n1 = await nonceIds();
  expect(await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key })).toBe(true);
  const reps = await Promise.all(Array.from({ length: k }, async () => {
    const h = heldAt(fake, ["owner.signIn", "owner.lateLine"]);
    const st = new DurableStore(h.ns, () => NOW);
    const p = st.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n1.id, nonceUntil: n1.until, now: NOW, deletedKey: key });
    await h.at("owner.signIn").atGate;
    return { h, p };
  }));
  const sd = stepper(fake, ["owner.present", "dir.addOwner", "dir.removeOwner"]);
  const d = new DurableStore(sd.ns, () => NOW).deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
  const next = async (op: string) => { const c = await sd.step(); expect(c.op).toBe(op); return c; };
  const present = async () => fake.storageOf(OWNER(OWNER_ID))!.data.size > 0;
  for (let i = 0; i < k; i++) {
    // The replay writes onto the wiped owner, the delete reads "present" and adds.
    let c = await next("owner.present");
    reps[i].h.at("owner.signIn").release(); await reps[i].h.at("owner.lateLine").atGate; expect(await present()).toBe(true);
    c.go();
    const add = await next("dir.addOwner");
    if (i === k - 1) {
      // The last replay is refused, empties the owner and settles the list (empty) before the delete's add lands.
      reps[i].h.at("owner.lateLine").release(); expect(await reps[i].p).toBe(false);
      expect(await plain.listOwnerIds()).toEqual([]);
      add.go();
      break;
    }
    add.go();
    // The replay is refused and settles; the delete reads "not present" and removes.
    c = await next("owner.present");
    reps[i].h.at("owner.lateLine").release(); expect(await reps[i].p).toBe(false);
    c.go(); (await next("dir.removeOwner")).go();
  }
  // Whatever the delete still does is let through, one step at a time.
  let done = false;
  const out = d.then((r) => { done = true; return r; });
  while (!done) { const s = await Promise.race([sd.step(), out.then(() => null)]); if (s) s.go(); }
  expect((await out).ok).toBe(true);
  const line = fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine;
  expect(line).toBeDefined();
  expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
  expect(fake.storageOf(OWNER(OWNER_ID))!.data.size).toBe(0);
  expect(await plain.listOwnerIds()).toEqual([]);
  expect((await plain.ownerPage({ limit: 10 })).owners).not.toContain(OWNER_ID);
}

test("close F4 round 2 (a): three replays flipping the owner during the delete's settle never leave the deleted Google id listed", async () => {
  await flipsDuringSettle(3);
});
test("close F4 round 2 (a): eight replays, more than any fixed number of tries, still leave nothing listed", async () => {
  await flipsDuringSettle(8);
});

test("close F4 round 2 (b): six flips from three different nonces during the delete's settle never leave the deleted Google id listed", async () => {
  const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
  const key = await deletedKey(OWNER_ID, SECRET);
  // Three sign ins before the delete, each with its own nonce: their ID tokens are the ones replayed.
  const ns = [await nonceIds(), await nonceIds(), await nonceIds()];
  const t1 = await newToken();
  expect(await plain.signIn(t1.hash, FREE, { email: "a@x", nonceId: ns[0].id, nonceUntil: ns[0].until, now: NOW, deletedKey: key })).toBe(true);
  for (const n of ns.slice(1)) expect(await plain.signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: n.id, nonceUntil: n.until, now: NOW, deletedKey: key })).toBe(true);

  const R = ns.map(() => gated(fake, ["owner.signIn#1", "owner.lateLine#1"]));
  const replays = (await Promise.all(R.map(async (r, i) => {
    const p = new DurableStore(r.ns, () => NOW).signIn((await newToken()).hash, FREE, { email: "a@x", nonceId: ns[i].id, nonceUntil: ns[i].until, now: NOW, deletedKey: key });
    await r.at("owner.signIn#1").reached;                // read no line yet, held before writing
    return { p };
  }))).map((x) => x.p);
  const X = gated(fake, ["owner.present#1", "owner.present#2", "owner.present#3", "owner.present#4", "owner.present#5", "dir.addOwner#3"]);
  const d = new DurableStore(X.ns, () => NOW).deleteAccount(OWNER_ID, { key, now: NOW, hash: t1.hash });
  const replay = async (i: number, part: "owner.signIn#1" | "owner.lateLine#1") => { R[i].at(part).release(); await R[i].at(part).done; };

  await X.at("owner.present#1").reached;                // line written, owner wiped
  await replay(0, "owner.signIn#1"); await R[0].at("owner.lateLine#1").reached;     // present: true
  X.at("owner.present#1").release(); await X.at("owner.present#2").reached;         // X read true, added
  await replay(0, "owner.lateLine#1"); expect(await replays[0]).toBe(false);         // present: false, R1 settled
  X.at("owner.present#2").release(); await X.at("owner.present#3").reached;         // mismatch, X removed
  await replay(1, "owner.signIn#1"); await R[1].at("owner.lateLine#1").reached;     // present: true
  X.at("owner.present#3").release(); await X.at("owner.present#4").reached;         // mismatch, X added
  await replay(1, "owner.lateLine#1"); expect(await replays[1]).toBe(false);         // present: false, R2 settled
  X.at("owner.present#4").release(); await X.at("owner.present#5").reached;         // mismatch, X removed
  await replay(2, "owner.signIn#1"); await R[2].at("owner.lateLine#1").reached;     // present: true
  X.at("owner.present#5").release(); await X.at("dir.addOwner#3").reached;          // mismatch, X's 5th write (add) held
  await replay(2, "owner.lateLine#1"); expect(await replays[2]).toBe(false);         // present: false, R3 settled (list empty)
  expect(await plain.listOwnerIds()).toEqual([]);
  X.at("dir.addOwner#3").release();                     // stale add lands; X re-reads false and corrects it
  expect((await d).ok).toBe(true);

  const line = fake.storageOf(DIRECTORY)!.data.get(`del:${key}`) as DeletedLine;
  expect(line).toBeDefined();
  expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
  expect(fake.storageOf(OWNER(OWNER_ID))!.data.size).toBe(0);
  expect(await plain.listOwnerIds()).toEqual([]);
});
