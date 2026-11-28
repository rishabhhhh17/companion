// Audit run 3, S13: deleting an account takes the person out of every team and deletes every receipt link they made.
import { expect, test } from "bun:test";
import { FakeNamespace } from "./fake-do.ts";
import { DurableStore, OWNER, callObject } from "../src/store-do.ts";
import { makeTeamRoutes } from "../src/team-routes.ts";
import { DAILY_LINKS, makeLinkRoutes, type LinkStore } from "../src/receipt-links.ts";
import { newToken } from "../src/tokens.ts";

const NOW = Date.UTC(2026, 10, 28, 12, 0, 0);
const PAGE = '<!doctype html><html><head><title>Receipt</title></head><body><h1>Works</h1></body></html>';

test("S13: an account delete leaves each team and deletes each receipt link", async () => {
  const ns = new FakeNamespace();
  const data = new Map<string, string>();
  const kv: LinkStore = { async get(k) { return data.get(k) ?? null; }, async put(k, v) { data.set(k, v); }, async delete(k) { data.delete(k); } };
  const store = new DurableStore(ns, () => NOW, kv);
  const ana = await newToken(), jon = await newToken();
  for (const [t, id, email] of [[ana, "google:1", "ana@x"], [jon, "google:2", "jon@x"]] as const)
    expect(await store.signIn(t.hash, { id, plan: "free", status: "active" }, { email, nonceId: `n-${id}`, nonceUntil: NOW + 600_000, now: NOW })).toBe(true);
  const userOf = async (tok: string) => (tok === ana.token ? { id: "google:1", active: true } : tok === jon.token ? { id: "google:2", active: true } : null);
  const teams = makeTeamRoutes({ ns, on: () => true, now: () => NOW, userOf });
  const links = makeLinkRoutes({ links: kv, on: () => true, origin: "https://api.example.test", now: () => NOW, userOf,
    madeLink: (o, id, at) => callObject<boolean>(ns, OWNER(o), "owner.linkMade", { id, now: at, max: DAILY_LINKS }) });
  const call = async (routes: typeof teams, method: string, path: string, token: string, body?: unknown) => {
    const req = new Request(`https://api.example.test${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const r = (await routes(req, new URL(req.url)))!;
    return { status: r.status, j: (await r.json()) as any };
  };

  const made = await call(teams, "POST", "/v1/teams", jon.token, { name: "shop", me: "Jon" });
  expect((await call(teams, "POST", "/v1/teams/join", ana.token, { invite: made.j.invite, me: "Ana" })).status).toBe(200);
  const own = await call(teams, "POST", "/v1/teams", ana.token, { name: "solo", me: "Ana" });
  const link = await call(links, "POST", "/v1/receipts", ana.token, { html: PAGE });
  expect(link.status).toBe(200);
  expect(data.has(`r:${link.j.id}`)).toBe(true);

  expect(await store.deleteAccount("google:1", { key: "k1", now: NOW, hash: ana.hash })).toEqual({ ok: true, leftovers: 0 });
  // Out of Jon's team; her own team, where she was the only one, is gone; her link is gone.
  expect((await call(teams, "GET", `/v1/teams/${made.j.id}`, jon.token)).j.members).toEqual([{ name: "Jon", role: "admin" }]);
  expect(ns.storageOf(`team:${own.j.id}`)?.data.size ?? 0).toBe(0);
  expect(data.has(`r:${link.j.id}`)).toBe(false);
  expect(ns.storageOf(OWNER("google:1"))?.data.size ?? 0).toBe(0);
});
