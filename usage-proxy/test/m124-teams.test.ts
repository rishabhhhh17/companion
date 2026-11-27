// M124: the team layer on the account server. Fake Durable Objects (test/fake-do.ts), stand in sign ins, no network.
import { describe, expect, test } from "bun:test";
import { FakeNamespace } from "./fake-do.ts";
import { cleanReceipt, makeTeamRoutes } from "../src/team-routes.ts";

const T = (n: string) => "cmp_" + n.padEnd(40, "x");
const USERS: Record<string, { id: string; active: boolean }> = { [T("ana")]: { id: "u_ana", active: true }, [T("jon")]: { id: "u_jon", active: true }, [T("lee")]: { id: "u_lee", active: true }, [T("bad")]: { id: "u_bad", active: false } };
function setup(on = true) {
  const ns = new FakeNamespace();
  const routes = makeTeamRoutes({ ns, on: () => on, now: () => Date.UTC(2026, 10, 28), userOf: async (t) => USERS[t] ?? null });
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const req = new Request(`https://api.example.test${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const r = (await routes(req, new URL(req.url)))!;
    return { status: r.status, j: await r.json() as any };
  };
  return { ns, call };
}
const RECEIPT = { project: "my-shop", tool: "cursor", verdict: "not_done", lines: ["a pricing page at /pricing", "the menu has no pricing link"], checks: [{ label: "npm test", result: "passed" }, { label: "real browser", result: "failed" }], flags: [], asked: { kept: 1, missing: 1 } };

async function team() {
  const s = setup();
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

describe("what a shared receipt may hold", () => {
  test("a plain receipt passes", () => { expect(cleanReceipt(RECEIPT)).toEqual(RECEIPT as never); });
  test("keys, folders of a Mac, odd verdicts, too much: refused", () => {
    for (const bad of [{ ...RECEIPT, lines: ["key sk-ant-api03-" + "A".repeat(30)] }, { ...RECEIPT, lines: ["saved in /Users/ana/code/shop"] }, { ...RECEIPT, verdict: "great" },
      { ...RECEIPT, lines: Array(7).fill("x") }, { ...RECEIPT, checks: [{ label: "x", result: "maybe" }] }, { ...RECEIPT, project: "" }, { ...RECEIPT, asked: { kept: 9, missing: 0 } }, { ...RECEIPT, lines: ["-----BEGIN RSA PRIVATE KEY-----"] }])
      expect(cleanReceipt(bad)).toBeNull();
  });
});
