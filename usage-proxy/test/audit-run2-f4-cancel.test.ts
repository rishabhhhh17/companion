// Audit run 2, finding 4, close round 3 (cancellation): a sign in or a delete whose client goes away part way. On Cloudflare a
// Worker's work stops when its client goes away, except work handed to ctx.waitUntil, but a Durable Object write that already
// landed stays. Ported from the re-attack's zz-close-f4-r2-cancel: a replayed old ID token, held at owner.signIn while the
// account is deleted, wrote the token and the email back onto the wiped owner and then stopped before the second line read
// and owner.lateLine, so the deleted account held its email again and no longer counted as deleted. The same gap on the delete:
// stopped after the wipe, it left the Google id on the owner list and on the token objects.
//
// The model of a stop, in the rigged namespace below: right after the named step's answer is back, if the route has not handed
// its work to waitUntil, every later call of that request fails, as the platform would stop it there. Work handed to waitUntil
// runs on (the platform keeps it running), and the test waits for it.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createGoogleVerifier } from "../src/google.ts";
import { createProxy } from "../src/proxy.ts";
import { ACCOUNT_DELETE_PATH, GOOGLE_SIGNIN_PATH, NONCE_PATH } from "../src/account-routes.ts";
import { DurableStore, OWNER, TOKEN, type NamespaceLike } from "../src/store-do.ts";
import { deletedKey } from "../src/deleted.ts";
import { hashToken } from "../src/tokens.ts";
import { FakeNamespace } from "./fake-do.ts";
import { handle as handleWorker, type Env } from "../src/worker.ts";
import { issueToken } from "../src/accounts.ts";
import { signDodoForTest } from "../src/dodo.ts";
import { withOwnerSig } from "./owner-sig-fixture.ts";
import { claimsAt, googleKeys, keyPair, signIdToken, type Key } from "./google-stand-in.ts";

const realFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = (async () => { throw new Error("no network in tests"); }) as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = realFetch; });

const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const SECRET = "founder-test-user-id-secret-0123456789abcdef";
const SUB = "109876543210", OWNER_ID = `google:${SUB}`;

let GOOD: Key;
beforeAll(async () => { GOOD = await keyPair("kid-good"); });

/** One request's server: its own namespace view (a hold at `holdAt`, a stop right after `stopAfter`), and its own waitUntil. */
function server(fake: FakeNamespace, o: { holdAt?: string; stopAfter?: string } = {}) {
  const kept: Promise<unknown>[] = [];
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>((r) => (release = r)), atGate = new Promise<void>((r) => (reached = r));
  let stopped = false;
  const ns = { idFromName: (n: string) => fake.idFromName(n), get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
    const op = new URL(input).pathname.slice(1);
    if (stopped) throw new Error("request stopped (client went away)");
    if (op === o.holdAt) { reached(); await gate; }
    const res = await fake.get(id as never).fetch(input, init);
    // The client goes away here. Only work already handed to waitUntil goes on.
    if (op === o.stopAfter && kept.length === 0) stopped = true;
    return res;
  } }) } as unknown as NamespaceLike;
  const store = new DurableStore(ns, () => NOW);
  const handle = createProxy({ store, anthropicKey: "", userIdSecret: SECRET, enabled: () => false, now: () => NOW, log: () => {},
    waitUntil: (p) => { kept.push(p); },
    googleSignIn: createGoogleVerifier({ clientId: "1234-test.apps.googleusercontent.com", fetch: googleKeys(() => [GOOD]), now: () => NOW }) });
  const send = (p: string, init: RequestInit = {}) => handle(new Request(`https://api.example${p}`, init));
  const settled = async () => { for (let i = 0; i < kept.length; i++) await kept[i]!.catch(() => {}); };
  return { send, release, atGate, settled, wasStopped: () => stopped };
}
const signInWith = (s: ReturnType<typeof server>, idToken: string) =>
  s.send(GOOGLE_SIGNIN_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
const deleteWith = (s: ReturnType<typeof server>, token: string) =>
  s.send(ACCOUNT_DELETE_PATH, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ confirm: true }) });

async function signedUp(fake: FakeNamespace) {
  const s = server(fake);
  const nonce = ((await (await s.send(NONCE_PATH)).json()) as { nonce: string }).nonce;
  const idToken = await signIdToken(GOOD, claimsAt(NOW, { nonce, sub: SUB, email: "victim@example.com" }));
  const r = await signInWith(s, idToken);
  expect(r.status).toBe(200);
  return { idToken, token: ((await r.json()) as { token: string }).token };
}

test("finding 4 cancel: a replayed old ID token stopped after owner.signIn cannot bring the deleted account back", async () => {
  const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
  const key = await deletedKey(OWNER_ID, SECRET);
  const first = await signedUp(fake);

  // The replay: the same ID token sent again. It reads no line, is held at owner.signIn, and its client goes away right after.
  const rep = server(fake, { holdAt: "owner.signIn", stopAfter: "owner.signIn" });
  const replay = signInWith(rep, first.idToken).catch((e) => e);
  await rep.atGate;

  // The delete runs whole while the replay is held.
  const del = server(fake);
  expect((await deleteWith(del, first.token)).status).toBe(200);
  await del.settled();
  expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
  expect(await plain.listOwnerIds()).toEqual([]);

  rep.release();
  await replay;
  await rep.settled();
  expect(fake.storageOf(OWNER(OWNER_ID))?.data.size ?? 0).toBe(0);
  expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
  expect(await plain.listOwnerIds()).toEqual([]);
  expect(JSON.stringify(fake.dump())).not.toContain("victim@example.com");
  expect(rep.wasStopped()).toBe(false);   // the sign in was kept running, so its own checks ran to the end
});

test("finding 4 cancel: a delete whose client goes away after the wipe still takes the Google id off the list and the tokens", async () => {
  const fake = new FakeNamespace(), plain = new DurableStore(fake, () => NOW);
  const key = await deletedKey(OWNER_ID, SECRET);
  const first = await signedUp(fake);
  expect(await plain.listOwnerIds()).toEqual([OWNER_ID]);

  const del = server(fake, { stopAfter: "owner.wipe" });
  await deleteWith(del, first.token).catch((e) => e);
  await del.settled();
  expect(await plain.isDeletedOwner(OWNER_ID, key, NOW + 1)).toBe(true);
  expect(await plain.listOwnerIds()).toEqual([]);
  expect(fake.storageOf(TOKEN(await hashToken(first.token)))?.data.size ?? 0).toBe(0);
  expect(JSON.stringify(fake.dump())).not.toContain(SUB);
  expect(del.wasStopped()).toBe(false);   // the delete was kept running past the wipe
});

// The same pattern on the payments webhook, found while closing this one: the event's id is claimed first (so a resend is a
// duplicate), and the plan is written after. Stopped in between, Dodo's resend was answered "duplicate" and the plan was never
// applied. The Worker keeps the webhook's work running too.
test("finding 4 cancel, same pattern: a Dodo webhook stopped after its claim still applies the plan", async () => {
  const DODO = `whsec_${btoa("dodo-worker-test-secret-0123456789")}`;
  const fake = new FakeNamespace(), waits: Promise<unknown>[] = [];
  let stopped = false;
  const ns = { idFromName: (n: string) => fake.idFromName(n), get: (id: unknown) => ({ fetch: async (input: string, init?: RequestInit) => {
    const op = new URL(input).pathname.slice(1);
    if (stopped) throw new Error("request stopped (client went away)");
    const res = await fake.get(id as never).fetch(input, init);
    if (op === "pay.claim" && waits.length === 0) stopped = true;
    return res;
  } }) } as unknown as NamespaceLike;
  const env: Env = { STORE: ns as never, METADATA_USER_ID_SECRET: SECRET, PAYMENT_PROVIDER: "dodo", DODO_WEBHOOK_SECRET: DODO, DODO_PRODUCTS: '{"pdt_pro":"pro"}' };
  const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); } };
  const plain = new DurableStore(fake, () => NOW);
  const t = await issueToken(plain, OWNER_ID, "free"); if (!t.ok) throw new Error("setup");
  const ev = { business_id: "bus_1", type: "subscription.active", timestamp: new Date(NOW - 1000).toISOString(),
    data: { payload_type: "Subscription", subscription_id: "sub_1", product_id: "pdt_pro", status: "active", customer: { customer_id: "cus_1" }, metadata: { companion_user_id: OWNER_ID } } };
  const body = JSON.stringify(await withOwnerSig(ev, SECRET));
  await handleWorker(new Request("https://usage.example/webhooks/dodo", { method: "POST", headers: await signDodoForTest("msg_1", body, DODO, Math.floor(NOW / 1000)), body }), env, ctx, () => NOW).catch((e) => e);
  for (let i = 0; i < waits.length; i++) await waits[i]!.catch(() => {});
  expect(await plain.planOfOwner(OWNER_ID)).toBe("pro");
  expect(stopped).toBe(false);
});
