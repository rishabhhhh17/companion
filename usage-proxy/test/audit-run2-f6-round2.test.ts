// Audit run 2, finding 6, re-attack round 2 (docs/security/2026-11-19-usage-proxy-run-2.md). Two breaks of the hold:
// 1. A delete and a sign in, in the Durable Object store. A stream kept open past LEASE_MS lost its running slot, so a delete
//    was no longer refused as busy. The stream then ended and booked into the wiped owner object, and on the next sign in the
//    deleted line's carry was skipped because a record existed, so the day's and month's spend before the delete was gone.
// 2. The prompt estimate was priced on the bytes the client sent, but the body sent on is written again by JSON.stringify,
//    which can make it far longer (1e20 goes out as 100000000000000000000), so the hold covered a quarter of what is billed.
import { describe, expect, test } from "bun:test";
import { newToken } from "../src/tokens.ts";
import { PLANS } from "../src/plans.ts";
import { DIRECTORY, HOLD_BUSY_MS, LEASE_MS, OWNER, callObject } from "../src/store-do.ts";
import { MemoryStore, type UsageRecord } from "../src/store.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";
import { createGoogleVerifier } from "../src/google.ts";
import { createProxy } from "../src/proxy.ts";
import { checkRequest, BYTES_PER_TOKEN } from "../src/filter.ts";
import { ACCOUNT_DELETE_PATH, GOOGLE_SIGNIN_PATH, NONCE_PATH } from "../src/account-routes.ts";
import { issueSignInToken } from "../src/accounts.ts";
import { claimsAt, googleKeys, keyPair, signIdToken } from "./google-stand-in.ts";
import { LOOP_TOOL_DEFS } from "../../runner/src/engine/messages-loop/tools.ts";

const T0 = Date.UTC(2026, 10, 19, 9, 0, 0);
const OWNER_ID = "google:109876543210";
const FREE = { id: OWNER_ID, plan: "free", status: "active" as const };
const zero = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
const rec = (at: number, usd: number): UsageRecord => ({ userId: OWNER_ID, model: "claude-opus-5-5", usage: { ...zero, output_tokens: 10 }, usd, at, complete: true });

describe("finding 6 round 2: a delete while a stream is open past the lease (Durable Object store)", () => {
  test("a delete is refused as busy while a request past its lease may still be running", async () => {
    const store = new FakeDurableStore(undefined, () => T0);
    const t1 = await newToken();
    expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n-1", nonceUntil: T0 + 600_000, now: T0 })).toBe(true);
    store.setSpent(OWNER_ID, T0, { day: 0.19, month: 1.99 });
    expect((await store.start(OWNER_ID, { max: 4, usd: 0.01, now: T0, limits: PLANS.free, id: "a", need: 0.005 })).ok).toBe(true);
    const later = T0 + LEASE_MS + 1000;
    expect(await store.deleteAccount(OWNER_ID, { key: "k1", now: later, hash: t1.hash })).toEqual({ ok: false, why: "busy" });
    // Once the stream ends, the delete goes through, and coming back keeps what was spent.
    await store.finish(OWNER_ID, { id: "a", now: later + 1000, record: rec(later + 1000, 0.001) });
    expect((await store.deleteAccount(OWNER_ID, { key: "k1", now: later + 2000, hash: t1.hash })).ok).toBe(true);
    const t2 = await newToken();
    expect(await store.signIn(t2.hash, FREE, { email: "a@x", nonceId: "n-2", nonceUntil: later + 600_000, now: later + 3000, deletedKey: "k1" })).toBe(true);
    const spent = await store.spent(OWNER_ID, later + 4000);
    expect(spent.day).toBeGreaterThanOrEqual(0.19);
    expect(spent.month).toBeGreaterThanOrEqual(1.99);
  });

  test("a hold left by a server that stopped does not block a delete for ever, and its late end books nothing on the wiped object", async () => {
    const store = new FakeDurableStore(undefined, () => T0);
    const t1 = await newToken();
    expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n-1", nonceUntil: T0 + 600_000, now: T0 })).toBe(true);
    store.setSpent(OWNER_ID, T0, { day: 0.19, month: 1.99 });
    expect((await store.start(OWNER_ID, { max: 4, usd: 0.01, now: T0, limits: PLANS.free, id: "a", need: 0.005 })).ok).toBe(true);
    const later = T0 + HOLD_BUSY_MS + 1000;   // the next day, the same month
    expect((await store.deleteAccount(OWNER_ID, { key: "k1", now: later, hash: t1.hash })).ok).toBe(true);
    // The request ends after all: the deleted line already counts its hold, so nothing is written on the wiped object (no
    // record with the owner id is kept after a delete, and the next sign in still carries the line).
    await store.finish(OWNER_ID, { id: "a", now: later + 1000, record: rec(later + 1000, 0.001) });
    expect(store.fake.storageOf(OWNER(OWNER_ID))?.data.size ?? 0).toBe(0);
    const t2 = await newToken();
    expect(await store.signIn(t2.hash, FREE, { email: "a@x", nonceId: "n-2", nonceUntil: later + 600_000, now: later + 2000, deletedKey: "k1" })).toBe(true);
    expect((await store.spent(OWNER_ID, later + 3000)).month).toBeGreaterThanOrEqual(2.0 - 1e-9);
  });

  test("a deleted line's carry is kept when the owner's only records were booked after the line", async () => {
    // The owner object is signed in again without the line (store.signIn's first read missed it), a request that had started
    // before the delete books on it, and then the line is settled on the owner (owner.lateLine, store.signIn's second read).
    const store = new FakeDurableStore(undefined, () => T0);
    const t1 = await newToken();
    expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n-1", nonceUntil: T0 + 600_000, now: T0 })).toBe(true);
    store.setSpent(OWNER_ID, T0, { day: 0.19, month: 1.99 });
    expect((await store.deleteAccount(OWNER_ID, { key: "k1", now: T0 + 1000, hash: t1.hash })).ok).toBe(true);
    const line = await callObject<{ at: number } | null>(store.fake, DIRECTORY, "dir.deletedGet", { key: "k1", now: T0 + 2000 });
    expect(line?.at).toBe(T0 + 1000);
    const t2 = await newToken();
    expect(await store.signIn(t2.hash, FREE, { email: "a@x", nonceId: "n-2", nonceUntil: T0 + 600_000, now: T0 + 2000 })).toBe(true);
    await store.finish(OWNER_ID, { id: "late", now: T0 + 3000, record: rec(T0 + 3000, 0.001) });
    await callObject(store.fake, OWNER(OWNER_ID), "owner.lateLine", { hash: t2.hash, nonceId: "n-2", now: T0 + 4000, line });
    const spent = await store.spent(OWNER_ID, T0 + 5000);
    expect(spent.day).toBeGreaterThanOrEqual(0.19);
    expect(spent.month).toBeGreaterThanOrEqual(1.99);
  });

  test("a line written for an account whose wipe did not happen is not counted twice", async () => {
    // The records before the line are already in it: carrying the line on top would count them again.
    const store = new FakeDurableStore(undefined, () => T0);
    const t1 = await newToken();
    expect(await store.signIn(t1.hash, FREE, { email: "a@x", nonceId: "n-1", nonceUntil: T0 + 600_000, now: T0 })).toBe(true);
    await store.finish(OWNER_ID, { id: "x", now: T0, record: rec(T0, 0.05) });
    const line = { at: T0 + 1000, day: "2026-11-19", dayUsd: 0.05, month: "2026-11", monthUsd: 0.05, nonces: [], until: T0 + 30 * 86_400_000 };
    await callObject(store.fake, OWNER(OWNER_ID), "owner.lateLine", { hash: t1.hash, nonceId: "n-1x", now: T0 + 2000, line });
    expect((await store.spent(OWNER_ID, T0 + 3000)).day).toBeCloseTo(0.05, 9);
  });
});

describe("finding 6 round 2: end to end, a long stream, a delete, the stream ends, sign in again", () => {
  const SECRET = "founder-test-user-id-secret-0123456789abcdef", SUB = "109876543210";
  const stores: { name: string; make: (clock: () => number) => TestStore }[] = [
    { name: "in memory store", make: () => new MemoryStore() },
    { name: "Durable Object store", make: (clock) => new FakeDurableStore(undefined, clock) },
  ];
  for (const kind of stores) test(`${kind.name}: the spend before the delete still counts after coming back`, async () => {
    let clock = T0;
    const GOOD = await keyPair("kid-good");
    const store = kind.make(() => clock);
    const enc = new TextEncoder();
    const ev = (e: unknown) => enc.encode(`event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`);
    let endStream!: () => void; const gate = new Promise<void>((r) => { endStream = r; });
    let sent = 0;
    const upstream = (async () => { sent++;
      return new Response(new ReadableStream({ async start(c) {
        c.enqueue(ev({ type: "message_start", message: { id: "m", usage: { input_tokens: 100, output_tokens: 1 } } }));
        await gate;
        c.enqueue(ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10 } }));
        c.enqueue(ev({ type: "message_stop" })); c.close();
      } }), { status: 200, headers: { "content-type": "text/event-stream" } }); }) as unknown as typeof fetch;
    const handle = createProxy({ store, anthropicKey: "sk-ant-test-0000", userIdSecret: SECRET, enabled: () => true, fetch: upstream, now: () => clock, log: () => {},
      googleSignIn: createGoogleVerifier({ clientId: "1234-test.apps.googleusercontent.com", fetch: googleKeys(() => [GOOD]), now: () => clock }) });
    const send = (p: string, init: RequestInit = {}) => handle(new Request(`https://api.example${p}`, init));
    const t = await issueSignInToken(store, OWNER_ID, "free", { email: "pat@example.com", nonceId: crypto.randomUUID(), nonceUntil: T0 + 600_000, now: T0 });
    if (!t.ok) throw new Error("setup");
    // Just under both Free limits (room for this one request, S2), so the next request is over them only if this spend still counts after coming back.
    store.setSpent(OWNER_ID, T0, { day: 0.1993, month: 1.9993 });
    const msg = (tok: string) => send("/v1/messages", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 100, stream: true, messages: [{ role: "user", content: "hi" }] }) });
    const del = () => send(ACCOUNT_DELETE_PATH, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: JSON.stringify({ confirm: true }) });
    const r1 = await msg(t.token);
    expect(r1.status).toBe(200);
    const rd = r1.body!.getReader(); await rd.read();
    clock = T0 + LEASE_MS + 60_000;
    expect((await del()).status).toBe(409);   // busy: the stream is still open
    endStream(); while (!(await rd.read()).done) { /* drain */ }
    await new Promise((r) => setTimeout(r, 20));
    expect((await del()).status).toBe(200);
    const nonce = ((await (await send(NONCE_PATH)).json()) as { nonce: string }).nonce;
    const si = await send(GOOGLE_SIGNIN_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: await signIdToken(GOOD, claimsAt(clock, { nonce, sub: SUB })) }) });
    expect(si.status).toBe(200);
    const tok = ((await si.json()) as { token: string }).token;
    const spent = await store.spent(OWNER_ID, clock);
    expect(spent.day).toBeGreaterThan(0.1993);
    expect(spent.month).toBeGreaterThan(1.9993);
    const before = sent;
    const r2 = await msg(tok);
    expect(r2.status).toBe(402);
    expect(sent).toBe(before);
  });
});

describe("finding 6 round 2: the estimate is priced on the body that is sent", () => {
  const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
  const KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
  const SECRET = "operator-secret-for-tests-0123456789abcdef";
  const K = 25_000;
  // Written by hand so the numbers stay as 1e20 in the raw body (JSON.stringify would expand them here too).
  const raw = `{"model":"claude-opus-5-5","max_tokens":1,"tools":${JSON.stringify(LOOP_TOOL_DEFS)},"messages":[`
    + `{"role":"user","content":"hi"},`
    + `{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"a","pad":[${Array(K).fill("1e20").join(",")}]}}]},`
    + `{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"ok"}]}]}`;
  const bytesOf = (s: string) => new TextEncoder().encode(s).length;

  test("numbers that grow when written again are priced at the size they are sent", () => {
    const c = checkRequest("POST", "/v1/messages", raw, "uid", { loopOn: true });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(bytesOf(c.body)).toBeGreaterThan(bytesOf(raw) * 4);
    expect(c.inputTokens).toBeGreaterThanOrEqual(Math.ceil(bytesOf(c.body) / BYTES_PER_TOKEN));
  });

  test("a body that grows past the size limit when written again is refused", () => {
    const n = 450_000;   // about 2.3 MB as sent by the client, about 9.9 MB as it would go on
    const big = `{"model":"claude-opus-5-5","max_tokens":1,"tools":${JSON.stringify(LOOP_TOOL_DEFS)},"messages":[`
      + `{"role":"user","content":"hi"},`
      + `{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"a","pad":[${Array(n).fill("1e20").join(",")}]}}]},`
      + `{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"ok"}]}]}`;
    const c = checkRequest("POST", "/v1/messages", big, "uid", { loopOn: true });
    expect(c).toEqual({ ok: false, status: 413, message: "That request is too big to send." });
  });

  for (const kind of TEST_STORES) test(`${kind.name}: one such request cannot book past the Free day limit`, async () => {
    const store = kind.make();
    const t = await newToken();
    await store.addUser(t.hash, { id: "u1", plan: "free", status: "active" });
    let forwarded = 0;
    const fetchFn = (async (_u: unknown, init?: RequestInit) => {
      forwarded++;
      const sentBytes = bytesOf(String(init?.body));
      return new Response(JSON.stringify({ content: [], usage: { input_tokens: Math.ceil(sentBytes / BYTES_PER_TOKEN), output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const handle = createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, loopOn: () => true, fetch: fetchFn, now: () => NOW, log: () => {}, maxInFlight: 4 });
    const r = await handle(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": t.token }, body: raw }));
    await r.text();
    // Its real size is over what Free allows in a day, so it is refused before anything is sent.
    expect(r.status).toBe(402);
    expect(forwarded).toBe(0);
    expect((await store.spent("u1", NOW)).day).toBeLessThanOrEqual(PLANS.free.dailyUsd);
  });
});
