// M124: the team layer on the account server. Fake Durable Objects (test/fake-do.ts), stand in sign ins, no network.
import { describe, expect, test } from "bun:test";
import { FakeNamespace } from "./fake-do.ts";
import { OWNER } from "../src/store-do.ts";
import { cleanReceipt, makeTeamRoutes } from "../src/team-routes.ts";
import { POSTS_PER_DAY, POSTS_PER_MINUTE } from "../src/teams.ts";

const T = (n: string) => "cmp_" + n.padEnd(40, "x");
const USERS: Record<string, { id: string; active: boolean }> = { [T("ana")]: { id: "u_ana", active: true }, [T("jon")]: { id: "u_jon", active: true }, [T("lee")]: { id: "u_lee", active: true }, [T("bad")]: { id: "u_bad", active: false } };
function setup(on = true, now = () => Date.UTC(2026, 10, 28)) {
  const ns = new FakeNamespace();
  // S13: each person is signed in on their own owner object, where the teams they are in are kept.
  for (const u of Object.values(USERS)) ns.storageFor(OWNER(u.id)).data.set("tokens", [["h", { plan: "free", status: "active" }]]);
  const routes = makeTeamRoutes({ ns, on: () => on, now, userOf: async (t) => USERS[t] ?? null });
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const req = new Request(`https://api.example.test${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const r = (await routes(req, new URL(req.url)))!;
    return { status: r.status, j: await r.json() as any };
  };
  return { ns, call };
}
const RECEIPT = { project: "my-shop", tool: "cursor", verdict: "not_done", lines: ["a pricing page at /pricing", "the menu has no pricing link"], checks: [{ label: "npm test", result: "passed" }, { label: "real browser", result: "failed" }], flags: [], asked: { kept: 1, missing: 1 } };

async function team(now?: () => number) {
  const s = setup(true, now);
  const made = await s.call("POST", "/v1/teams", T("ana"), { name: "bloom studio", me: "Ana" });
  expect(made.status).toBe(200);
  const joined = await s.call("POST", "/v1/teams/join", T("jon"), { invite: made.j.invite, me: "Jon" });
  expect(joined.status).toBe(200);
  return { ...s, id: made.j.id as string, invite: made.j.invite as string };
}

describe("teams", () => {
  test("off, or not signed in: nothing", async () => {
    expect((await setup(false).call("POST", "/v1/teams", T("ana"), { name: "x", me: "Ana" })).status).toBe(404);
    expect((await setup().call("POST", "/v1/teams", undefined, { name: "x", me: "Ana" })).status).toBe(401);
    expect((await setup().call("POST", "/v1/teams", T("bad"), { name: "x", me: "Ana" })).status).toBe(403);
  });
  test("make a team, join with the invite, see each other and the rules", async () => {
    const t = await team();
    const v = await t.call("GET", `/v1/teams/${t.id}`, T("jon"));
    expect(v.j).toMatchObject({ name: "bloom studio", role: "member", me: "Jon", members: [{ name: "Ana", role: "admin" }, { name: "Jon", role: "member" }], rules: [] });
    expect(JSON.stringify(v.j)).not.toContain("u_ana");
    expect((await t.call("GET", `/v1/teams/${t.id}`, T("lee"))).status).toBe(403);
  });
  test("a wrong invite, a taken name, a new invite that ends the old one", async () => {
    const t = await team();
    expect((await t.call("POST", "/v1/teams/join", T("lee"), { invite: `${t.id}.wrong`, me: "Lee" })).status).toBe(403);
    expect((await t.call("POST", "/v1/teams/join", T("lee"), { invite: t.invite, me: "jon" })).status).toBe(409);
    expect((await t.call("POST", `/v1/teams/${t.id}/invite`, T("jon"))).status).toBe(403);
    const fresh = await t.call("POST", `/v1/teams/${t.id}/invite`, T("ana"));
    expect((await t.call("POST", "/v1/teams/join", T("lee"), { invite: t.invite, me: "Lee" })).status).toBe(403);
    expect((await t.call("POST", "/v1/teams/join", T("lee"), { invite: fresh.j.invite, me: "Lee" })).status).toBe(200);
  });
  test("a member shares a receipt; every member sees it with who and when; others cannot", async () => {
    const t = await team();
    expect((await t.call("POST", `/v1/teams/${t.id}/receipts`, T("jon"), { receipt: RECEIPT })).j).toEqual({ seq: 1 });
    const list = await t.call("GET", `/v1/teams/${t.id}/receipts`, T("ana"));
    expect(list.j.receipts[0]).toMatchObject({ ...RECEIPT, by: "Jon", seq: 1 });
    expect((await t.call("POST", `/v1/teams/${t.id}/receipts`, T("lee"), { receipt: RECEIPT })).status).toBe(403);
    expect((await t.call("GET", `/v1/teams/${t.id}/receipts`, T("lee"))).status).toBe(403);
  });
  test("only an admin sets rules; rules are of the five kinds", async () => {
    const t = await team();
    const rules = [{ kind: "never_edit", pattern: "pricing.txt" }, { kind: "ask_install", pattern: "*" }];
    expect((await t.call("PUT", `/v1/teams/${t.id}/rules`, T("jon"), { rules })).status).toBe(403);
    expect((await t.call("PUT", `/v1/teams/${t.id}/rules`, T("ana"), { rules })).status).toBe(200);
    expect((await t.call("GET", `/v1/teams/${t.id}`, T("jon"))).j.rules).toEqual(rules);
    expect((await t.call("PUT", `/v1/teams/${t.id}/rules`, T("ana"), { rules: [{ kind: "allow_everything", pattern: "*" }] })).status).toBe(400);
  });
  test("an admin removes a member; the last admin leaving hands the team on; the last person out ends it", async () => {
    const t = await team();
    expect((await t.call("DELETE", `/v1/teams/${t.id}/members/Ana`, T("jon"))).status).toBe(403);
    expect((await t.call("POST", `/v1/teams/${t.id}/leave`, T("ana"))).j).toEqual({ left: true });
    expect((await t.call("GET", `/v1/teams/${t.id}`, T("jon"))).j.role).toBe("admin");
    await t.call("POST", `/v1/teams/${t.id}/receipts`, T("jon"), { receipt: RECEIPT });
    expect((await t.call("POST", `/v1/teams/${t.id}/leave`, T("jon"))).j).toEqual({ left: true, teamGone: true });
    expect([...t.ns.objects.get(`team:${t.id}`)!.storage.data.keys()]).toEqual([]);
  });
});

test("the board keeps exactly the newest 500 receipts", async () => {
  let clock = Date.UTC(2026, 10, 28);
  const t = await team(() => (clock += 900_000));   // slower than POSTS_PER_MINUTE and POSTS_PER_DAY
  for (let i = 0; i < 520; i++) await t.call("POST", `/v1/teams/${t.id}/receipts`, T("jon"), { receipt: RECEIPT });
  const keys = [...t.ns.objects.get(`team:${t.id}`)!.storage.data.keys()].filter((k) => k.startsWith("r:"));
  expect(keys.length).toBe(500);
  expect((await t.call("GET", `/v1/teams/${t.id}/receipts`, T("ana"))).j.receipts[0].seq).toBe(520);
}, 120_000);

test("S16: one member shares at most POSTS_PER_MINUTE receipts a minute; others still can, and a minute later so can they", async () => {
  let clock = Date.UTC(2026, 10, 28);
  const t = await team(() => clock);
  for (let i = 0; i < POSTS_PER_MINUTE; i++) expect((await t.call("POST", `/v1/teams/${t.id}/receipts`, T("jon"), { receipt: RECEIPT })).status).toBe(200);
  expect((await t.call("POST", `/v1/teams/${t.id}/receipts`, T("jon"), { receipt: RECEIPT })).status).toBe(429);
  expect((await t.call("POST", `/v1/teams/${t.id}/receipts`, T("ana"), { receipt: RECEIPT })).status).toBe(200);
  clock += 60_000;
  expect((await t.call("POST", `/v1/teams/${t.id}/receipts`, T("jon"), { receipt: RECEIPT })).status).toBe(200);
});

describe("what a shared receipt may hold", () => {
  test("a plain receipt passes", () => { expect(cleanReceipt(RECEIPT)).toEqual(RECEIPT as never); });
  test("keys, folders of a Mac, odd verdicts, too much: refused", () => {
    for (const bad of [{ ...RECEIPT, lines: ["key sk-ant-api03-" + "A".repeat(30)] }, { ...RECEIPT, lines: ["saved in /Users/ana/code/shop"] }, { ...RECEIPT, verdict: "great" },
      { ...RECEIPT, lines: Array(7).fill("x") }, { ...RECEIPT, checks: [{ label: "x", result: "maybe" }] }, { ...RECEIPT, project: "" }, { ...RECEIPT, asked: { kept: 9, missing: 0 } }, { ...RECEIPT, lines: ["-----BEGIN RSA PRIVATE KEY-----"] }])
      expect(cleanReceipt(bad)).toBeNull();
  });
});

describe("S13 regression: the teams kept on the owner follow what really happened", () => {
  const kept = (s: { ns: FakeNamespace }, id: string) => (s.ns.storageFor(OWNER(id)).data.get("teams") as string[] | undefined) ?? [];
  test("20 failed joins keep nothing, and the person can still join a real team", async () => {
    const t = await team();
    for (let i = 0; i < 20; i++) {
      const id = `bad${String(i).padStart(2, "0")}aaaaaaaaaaa`;
      expect((await t.call("POST", "/v1/teams/join", T("lee"), { invite: `${id}.wrong`, me: "Lee" })).status).toBe(403);
    }
    expect(kept(t, "u_lee")).toEqual([]);
    expect((await t.call("POST", "/v1/teams/join", T("lee"), { invite: t.invite, me: "Lee" })).status).toBe(200);
    expect(kept(t, "u_lee")).toEqual([t.id]);
  });
  test("a wrong invite from someone already in the team keeps their team", async () => {
    const t = await team();
    expect((await t.call("POST", "/v1/teams/join", T("jon"), { invite: `${t.id}.wrong`, me: "Jon" })).status).toBe(403);
    expect(kept(t, "u_jon")).toEqual([t.id]);
  });
  test("an admin removing a member takes the team off that member's list", async () => {
    const t = await team();
    expect((await t.call("DELETE", `/v1/teams/${t.id}/members/Jon`, T("ana"))).status).toBe(200);
    expect(kept(t, "u_jon")).toEqual([]);
  });
  test("leaving a team you are no longer in still clears it from your list", async () => {
    const t = await team();
    t.ns.storageFor(OWNER("u_lee")).data.set("teams", [t.id]);   // a stale entry, as left by the old code
    expect((await t.call("POST", `/v1/teams/${t.id}/leave`, T("lee"))).status).toBe(403);
    expect(kept(t, "u_lee")).toEqual([]);
  });
});

test("S16: one person shares at most POSTS_PER_DAY receipts a day across all their teams", async () => {
  let clock = Date.UTC(2026, 10, 28);
  const s = setup(true, () => (clock += 7_000));
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push((await s.call("POST", "/v1/teams", T("ana"), { name: `team ${i}`, me: "Ana" })).j.id);
  let ok = 0, last = 0;
  for (let i = 0; i < POSTS_PER_DAY + 5; i++) { last = (await s.call("POST", `/v1/teams/${ids[i % 3]}/receipts`, T("ana"), { receipt: RECEIPT })).status; if (last === 200) ok++; }
  expect(ok).toBe(POSTS_PER_DAY);
  expect(last).toBe(429);
  clock = Date.UTC(2026, 10, 29, 1);
  expect((await s.call("POST", `/v1/teams/${ids[0]}/receipts`, T("ana"), { receipt: RECEIPT })).status).toBe(200);
}, 60_000);
