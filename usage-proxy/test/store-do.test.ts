// M99: the Durable Object store. The store's promises (the same for both stores), then what only the Durable Object store must
// add: one step at a time in each object even when two server instances share it, slots that free themselves, and nothing kept
// but ids, dates, counts and dollars.
import { describe, expect, test } from "bun:test";
import { createProxy } from "../src/proxy.ts";
import { PLANS, monthKey } from "../src/plans.ts";
import { newToken, hashToken } from "../src/tokens.ts";
import { costOf } from "../src/usage.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIRECTORY, DurableDodoLedger, DurableLinkBook, LEASE_MS, MAX_TOKENS_KEPT, OWNER, RECORD_KEEP_MS, PAYMENTS, StoreObject, TOKEN, WEBHOOK_KEEP_MS, callObject } from "../src/store-do.ts";
import { FakeNamespace, FakeStorage } from "./fake-do.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const KEY = "sk-ant-api03-OUR-SECRET-KEY-0000000000000000";
const PROMPT = "PROMPT-MARKER-m99-4410", REPLY = "REPLY-MARKER-m99-7781";

for (const kind of TEST_STORES) describe(`the store's promises: ${kind.name}`, () => {
  const pro = PLANS.pro;
  // A hold passes while what is spent and held is under the limit (budgetCheck), so the first one here takes the day over it.
  test("two holds at once where only one fits: exactly one is held", async () => {
    const s = kind.make();
    s.setSpent("u1", NOW, { day: pro.dailyUsd - 0.3, month: 1 });
    const r = await Promise.all([s.hold("u1", 0.4, NOW, pro), s.hold("u1", 0.4, NOW, pro)]);
    expect(r.filter(Boolean).length).toBe(1);
    expect((await s.spent("u1", NOW)).day).toBeCloseTo(pro.dailyUsd + 0.1, 8);
  });
  test("many slots asked for at once: never more than the most allowed", async () => {
    const s = kind.make();
    const r = await Promise.all(Array.from({ length: 7 }, () => s.begin("u1", 4)));
    expect(r.filter(Boolean).length).toBe(4);
    expect(s.inFlight("u1")).toBe(4);
    await s.end("u1");
    expect(await s.begin("u1", 4)).toBe(true);
  });
  test("a hold let go comes off what is spent; a booked cost goes on", async () => {
    const s = kind.make();
    expect(await s.hold("u1", 0.4, NOW, pro)).toBe(true);
    expect((await s.spent("u1", NOW)).day).toBeCloseTo(0.4, 8);
    await s.unhold("u1", 0.4);
    await s.record({ userId: "u1", model: "claude-sonnet-5-5", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }, usd: 0.05, at: NOW, complete: true });
    expect(await s.spent("u1", NOW)).toEqual({ day: 0.05, month: 0.05 });
    expect(s.records.length).toBe(1);
  });
  test("a payment's plan wins over the plan written with each token, and an older event changes nothing", async () => {
    const s = kind.make(), t = await newToken();
    await s.addUser(t.hash, { id: "o1", plan: "free", status: "active" });
    expect(await s.setOwnerPlan!("o1", { plan: "pro", status: "active" }, 2000)).toBe(true);
    expect(await s.userByTokenHash(t.hash)).toEqual({ id: "o1", plan: "pro", status: "active" });
    expect(await s.setOwnerPlan!("o1", { plan: "free", status: "active" }, 1000)).toBe(false);   // older than the one applied
    expect((await s.userByTokenHash(t.hash))?.plan).toBe("pro");
    expect(await s.planOfOwner!("o1")).toBe("pro");
    await s.setOwnerPlan!("o1", { plan: "pro", status: "past_due", until: NOW + 5000 }, 3000);
    expect(await s.userByTokenHash(t.hash)).toEqual({ id: "o1", plan: "pro", status: "past_due", planUntil: NOW + 5000 });
  });
  test("a payment cannot lift a suspension, and a revoked token stays revoked", async () => {
    const s = kind.make(), t = await newToken();
    await s.addUser(t.hash, { id: "o1", plan: "pro", status: "active" });
    await s.suspendOwner("o1", { at: NOW });
    await s.setOwnerPlan!("o1", { plan: "pro", status: "active" }, NOW + 1);
    expect((await s.userByTokenHash(t.hash))?.status).toBe("suspended");
    await s.restoreOwner("o1", { at: NOW + 2 });
    expect((await s.userByTokenHash(t.hash))?.status).toBe("revoked");
  });
  // M99 review: holds of the same amount are common (the worst case depends only on the model and max_tokens).
  test("a request that outlived its lease, ending late, lets go of only its own hold and slot, never another's", async () => {
    let t = NOW;
    const s = kind.make(), at = () => t;
    expect(await s.begin("u1", 4, "a")).toBe(true);
    expect(await s.hold("u1", 0.1, at(), pro, "a")).toBe(true);
    t = NOW + LEASE_MS + 1;
    expect(await s.begin("u1", 4, "b")).toBe(true);
    expect(await s.hold("u1", 0.1, at(), pro, "b")).toBe(true);
    await s.unhold("u1", 0.1, "a");
    await s.end("u1", "a");
    expect((await s.spent("u1", at())).day).toBeCloseTo(0.1, 8);   // B's hold still counts
    await s.unhold("u1", 0.1, "b");
    await s.end("u1", "b");
    expect((await s.spent("u1", at())).day).toBe(0);
    expect(await s.begin("u1", 1, "c")).toBe(true);   // no slot was left behind
  });
  test("owners are listed once each, in the order they came", async () => {
    const s = kind.make();
    for (const id of ["b", "a", "b", "c"]) await s.addUser((await newToken()).hash, { id, plan: "free", status: "active" });
    expect(await s.listOwnerIds()).toEqual(["b", "a", "c"]);
  });
});

/** Two server instances (two proxies, each with its own store) on the same objects, as two Cloudflare locations would be. */
function twoInstances(upstreamUsage = { input_tokens: 1000, output_tokens: 500 }) {
  const fake = new FakeNamespace();
  const stores = [new FakeDurableStore(fake, () => NOW), new FakeDurableStore(fake, () => NOW)];
  let forwarded = 0;
  const fetchFn = (async () => { forwarded++; await new Promise((r) => setTimeout(r, 5)); return new Response(JSON.stringify({ id: "m", content: [{ type: "text", text: REPLY }], usage: upstreamUsage }), { status: 200, headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
  const proxies = stores.map((store) => createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, fetch: fetchFn, now: () => NOW }));
  const send = (i: number, token: string, maxTokens = 2000) => proxies[i](new Request("https://usage.example/v1/messages", { method: "POST", headers: { "x-api-key": token, "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content: PROMPT }] }) }));
  return { fake, stores, send, forwarded: () => forwarded };
}

describe("one step at a time, even across server instances", () => {
  test("the fake really lets work run in between: without the object's own order, an update is lost", async () => {
    const st = new FakeStorage();
    const add = async () => { const n = (await st.get<number>("n")) ?? 0; await st.put({ n: n + 1 }); };
    await Promise.all([add(), add()]);
    expect(st.data.get("n")).toBe(1);   // the lost update the object's one step at a time order prevents
    const obj = new StoreObject({ storage: new FakeStorage() });
    const step = () => obj.fetch(new Request("https://store.internal/owner.begin", { method: "POST", body: JSON.stringify({ max: 99, now: NOW }) }));
    await Promise.all([step(), step(), step()]);
    const r = await obj.fetch(new Request("https://store.internal/owner.inFlight", { method: "POST", body: JSON.stringify({ now: NOW }) }));
    expect(((await r.json()) as { r: number }).r).toBe(3);
  });
  test("two requests at once for one owner, from two instances: only the one that fits the limit passes", async () => {
    const w = twoInstances();
    const t = await newToken();
    await w.stores[0].addUser(t.hash, { id: "u1", plan: "pro", status: "active" });
    // Room for one worst case (2,000 tokens out on Sonnet) and not two: the first one's hold takes the day over the limit.
    const worst = costOf("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
    w.stores[0].setSpent("u1", NOW, { day: PLANS.pro.dailyUsd - worst * 0.5, month: 1 });
    const [a, b] = await Promise.all([w.send(0, t.token), w.send(1, t.token)]);
    expect([a.status, b.status].sort()).toEqual([200, 402]);
    expect(w.forwarded()).toBe(1);
    expect(w.stores[1].inFlight("u1")).toBe(0);
    const booked = w.stores[1].records.reduce((n, r) => n + r.usd, 0);
    expect((await w.stores[1].spent("u1", NOW)).day).toBeCloseTo(PLANS.pro.dailyUsd - worst * 0.5 + booked, 8);   // no hold left behind
  });
  test("a slot or a hold left by an instance that stopped mid request frees itself after the lease", async () => {
    let t = NOW;
    const s = new FakeDurableStore(new FakeNamespace(), () => t);
    for (let i = 0; i < 4; i++) expect(await s.begin("u1", 4)).toBe(true);
    expect(await s.hold("u1", PLANS.pro.dailyUsd, t, PLANS.pro)).toBe(true);
    expect(await s.begin("u1", 4)).toBe(false);
    t = NOW + LEASE_MS - 1;
    expect(await s.begin("u1", 4)).toBe(false);
    t = NOW + LEASE_MS + 1;
    expect(await s.begin("u1", 4)).toBe(true);
    expect((await s.spent("u1", t)).day).toBe(0);
  });
  test("M99 review: a slot whose lease ran out, let go late, does not take a running request's slot", async () => {
    let t = NOW;
    const s = new FakeDurableStore(new FakeNamespace(), () => t);
    expect(await s.begin("u1", 4, "a")).toBe(true);
    t = NOW + LEASE_MS + 1;
    expect(await s.begin("u1", 4, "b")).toBe(true);
    await s.end("u1", "a");
    expect(s.inFlight("u1")).toBe(1);   // B still runs
    await s.end("u1", "b");
    expect(s.inFlight("u1")).toBe(0);
  });
});

describe("what the objects keep", () => {
  test("after real requests, nothing but ids, dates, counts and dollars: no prompt, reply, token or key", async () => {
    const w = twoInstances();
    const t = await newToken();
    await w.stores[0].addUser(t.hash, { id: "u1", plan: "pro", status: "active" });
    expect((await w.send(0, t.token)).status).toBe(200);
    const kept = JSON.stringify(w.fake.dump());
    for (const mark of [PROMPT, REPLY, t.token, KEY, SECRET]) expect(kept).not.toContain(mark);
    expect(kept).toContain(t.hash);   // only the hash of a token is kept
  });
  test("a record keeps only its known fields, whatever else is passed", async () => {
    const s = new FakeDurableStore();
    await s.record({ userId: "u1", model: "m", usd: 0.01, at: NOW, complete: true, text: PROMPT, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0, note: REPLY } } as never);
    expect(JSON.stringify(s.dump())).not.toMatch(new RegExp(`${PROMPT}|${REPLY}`));
  });
  // M116 step 3: the day and month totals live in the newest record now, so they go with the records.
  test("M99 review: old request records and old day and month totals are dropped, as the README says", async () => {
    const s = new FakeDurableStore(), day = 24 * 3600 * 1000;
    const rec = (at: number) => s.record({ userId: "u1", model: "m", usd: 0.01, at, complete: true, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 } });
    const old = NOW - RECORD_KEEP_MS - 31 * day, recent = NOW - 40 * day;   // old: a month before the oldest kept record's month
    await rec(old); await rec(recent); await rec(NOW - day); await rec(NOW);
    expect(s.records.map((r) => r.at)).toEqual([recent, NOW - day, NOW]);
    const keys = [...s.fake.storageFor(OWNER("u1")).data.keys()];
    expect(keys.filter((k) => k.startsWith("spent:"))).toEqual([]);   // no totals of their own to keep or drop
    expect(keys.filter((k) => k.startsWith("rec:")).length).toBe(3);
    expect(JSON.stringify(s.fake.storageFor(OWNER("u1")).data.get(keys.filter((k) => k.startsWith("rec:")).sort().at(-1)!))).toContain(`"month":"${monthKey(NOW)}"`);
    expect(await s.spent("u1", NOW)).toEqual({ day: 0.01, month: monthKey(NOW - day) === monthKey(NOW) ? 0.02 : 0.01 });
    const readme = readFileSync(join(import.meta.dir, "..", "README.md"), "utf8");
    expect(readme).toContain(`${RECORD_KEEP_MS / day} days`);
    expect(readme).toContain(`${MAX_TOKENS_KEPT} sign ins`);
  });
  test("M99 review: the token list is capped, oldest first and stopped ones before working ones, and their hashes are cleared", async () => {
    const s = new FakeDurableStore();
    const stopped = [await newToken(), await newToken()];
    for (const t of stopped) await s.addUser(t.hash, { id: "o1", plan: "pro", status: "active" });
    await s.suspendOwner("o1", { at: NOW }); await s.restoreOwner("o1", { at: NOW + 1 });
    const working = [];
    for (let i = 0; i < MAX_TOKENS_KEPT; i++) { const t = await newToken(); working.push(t); await s.addUser(t.hash, { id: "o1", plan: "pro", status: "active" }); }
    expect((s.fake.storageFor(OWNER("o1")).data.get("tokens") as unknown[]).length).toBe(MAX_TOKENS_KEPT);
    for (const t of stopped) {
      expect(await s.userByTokenHash(t.hash)).toBeNull();
      expect(s.fake.storageFor(TOKEN(t.hash)).data.has("owner")).toBe(false);
    }
    for (const t of working) expect((await s.userByTokenHash(t.hash))?.status).toBe("active");
    const one = await newToken();
    await s.addUser(one.hash, { id: "o1", plan: "pro", status: "active" });
    expect(await s.userByTokenHash(working[0].hash)).toBeNull();   // then the oldest working one
    expect((await s.userByTokenHash(one.hash))?.status).toBe("active");
  });
  test("a token's hash never moves to another person", async () => {
    const s = new FakeDurableStore(), t = await newToken();
    await s.addUser(t.hash, { id: "o1", plan: "pro", status: "active" });
    await expect(s.addUser(t.hash, { id: "o2", plan: "pro", status: "active" })).rejects.toThrow();
    expect((await s.userByTokenHash(t.hash))?.id).toBe("o1");
  });
  test("each kind of object holds only its own part", async () => {
    const s = new FakeDurableStore(), t = await newToken();
    await s.addUser(t.hash, { id: "o1", plan: "pro", status: "active" });
    await s.suspendOwner("o1", { at: NOW, caseId: "case-9" });
    expect([...s.fake.storageFor(TOKEN(t.hash)).data.keys()]).toEqual(["owner"]);
    expect([...s.fake.storageFor(OWNER("o1")).data.keys()].sort()).toEqual(["suspended", "tokens"]);
    expect([...s.fake.storageFor(DIRECTORY).data.values()]).toContainEqual({ ownerId: "o1", kind: "suspended", at: NOW, caseId: "case-9" });
    expect(await s.userByTokenHash(await hashToken("cmp_not-a-real-token-000000000000"))).toBeNull();
  });
  test("an unknown step or a failing one answers without any detail", async () => {
    const obj = new StoreObject({ storage: new FakeStorage() });
    expect((await obj.fetch(new Request("https://store.internal/drop.everything", { method: "POST", body: "{}" }))).status).toBe(404);
    const broken = new StoreObject({ storage: { get: async () => { throw new Error(`disk said ${PROMPT}`); }, put: async () => {}, delete: async () => 0, list: async () => new Map() } });
    const r = await broken.fetch(new Request("https://store.internal/owner.isSuspended", { method: "POST", body: "{}" }));
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain(PROMPT);
    await expect(callObject(new FakeNamespace(), "x", "drop.everything")).rejects.toThrow(/could not finish/);
  });
});

describe("payment events on the objects", () => {
  test("an event id is taken once, even by two instances at once, and can be given back", async () => {
    const fake = new FakeNamespace();
    const a = new DurableDodoLedger(fake, () => NOW), b = new DurableDodoLedger(fake, () => NOW);
    const r = await Promise.all([a.claim("msg_1"), b.claim("msg_1")]);
    expect(r.filter(Boolean).length).toBe(1);
    await a.release("msg_1");
    expect(await b.claim("msg_1")).toBe(true);
  });
  test("old ids are dropped after the keep window, so the list stays small", async () => {
    let t = NOW;
    const fake = new FakeNamespace(), l = new DurableDodoLedger(fake, () => t);
    await l.claim("msg_old");
    t = NOW + WEBHOOK_KEEP_MS + 1;
    await l.claim("msg_new");
    expect([...fake.storageFor(PAYMENTS).data.keys()]).toEqual(["h:msg_new"]);
  });
  test("the newest applied time lives in the owner's own object; links in the payments object", async () => {
    const fake = new FakeNamespace(), l = new DurableDodoLedger(fake), links = new DurableLinkBook(fake);
    expect(await l.lastAppliedAt("u9")).toBeNull();
    await l.setLastAppliedAt("u9", 2000); await l.setLastAppliedAt("u9", 1000);
    expect(await l.lastAppliedAt("u9")).toBe(2000);
    await links.set("cus_1", "u9");
    expect(await links.get("cus_1")).toBe("u9");
    expect(await links.get("cus_2")).toBeNull();
    expect(fake.storageFor(OWNER("u9")).data.get("planAt")).toBe(2000);
  });
});

// The type is used so a store that drops a helper fails to compile here.
const _check: TestStore = new FakeDurableStore();
void _check;
