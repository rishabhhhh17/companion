// M123 slice 5: a receipt you can send as a link. Signed in only, on a tap in the app, a fixed page check (nothing that runs,
// links or loads), a daily limit, 30 days, and deletable. A page served with a policy that lets nothing run. Stand in stores only.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPage, makeLinkRoutes, DAILY_LINKS, LINK_DAYS, type LinkStore } from "../src/receipt-links.ts";
import { FakeNamespace } from "./fake-do.ts";
import { callObject, OWNER } from "../src/store-do.ts";

const PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>body{font:16px system-ui}</style></head><body><h1>Works</h1><p>a pricing page opens at /pricing: kept</p><img alt="x" src="data:image/jpeg;base64,/9j/4AAQ"></body></html>';
const TOKEN = "cmp_" + "a".repeat(40);

function kv(): LinkStore & { data: Map<string, { v: string; ttl?: number }> } {
  const data = new Map<string, { v: string; ttl?: number }>();
  return { data, async get(k) { return data.get(k)?.v ?? null; }, async put(k, v, o) { data.set(k, { v, ttl: o?.expirationTtl }); }, async delete(k) { data.delete(k); } };
}
function setup(o: { on?: boolean; user?: "active" | "suspended" | null } = {}) {
  const links = kv();
  // S16: the daily count lives on the owner's own Durable Object (a fake of it here), with someone signed in on it.
  const ns = new FakeNamespace();
  ns.storageFor(OWNER("u1")).data.set("tokens", [["h", { plan: "free", status: "active" }]]);
  const routes = makeLinkRoutes({ links, on: () => o.on !== false, origin: "https://api.example.test", now: () => Date.UTC(2026, 10, 27),
    madeLink: (ownerId, id, now) => callObject<boolean>(ns, OWNER(ownerId), "owner.linkMade", { id, now, max: DAILY_LINKS }),
    userOf: async (t) => (t === TOKEN && o.user !== null ? { id: "u1", active: (o.user ?? "active") === "active" } : null) });
  const call = (method: string, path: string, init: { body?: unknown; token?: string; del?: string } = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    if (init.del) headers["x-delete-token"] = init.del;
    const req = new Request(`https://api.example.test${path}`, { method, headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    return routes(req, new URL(req.url));
  };
  return { links, ns, call };
}

describe("the page check", () => {
  test("a plain receipt page passes, and so does the app's own share page (M88 fixture)", () => {
    expect(checkPage(PAGE)).toBeNull();
    expect(checkPage(readFileSync(new URL("../../protocol/fixtures/m88-receipt.html", import.meta.url), "utf8"))).toBeNull();
  });
  test("anything that runs, links, loads or asks is refused", () => {
    for (const bad of ["<script>x</script>", '<a href="x">x</a>', "<iframe></iframe>", "<form></form>", '<img src="https://evil.test/x.png">', '<p onclick="x">x</p>',
      "<style>@import 'x'</style>", "<style>p{background:url(x)}</style>", "<svg></svg>", '<meta http-equiv="refresh" content="0">', "<p>javascript:alert(1)</p>", "<p>see https://evil.test</p>", "<base>", '<img src="data:image/svg+xml;base64,AAAA">'])
      expect(checkPage(PAGE.replace("<h1>Works</h1>", bad))).not.toBeNull();
    expect(checkPage("<p>no doctype</p>")).not.toBeNull();
    expect(checkPage("<!doctype html>" + "x".repeat(4_000_001))).not.toBeNull();
  });
});

describe("the routes", () => {
  test("off: nothing answers", async () => {
    const t = setup({ on: false });
    expect((await t.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE } }))!.status).toBe(404);
    expect((await t.call("GET", "/r/AAAAAAAAAAAAAAAAAAAAAA"))!.status).toBe(404);
  });
  test("not signed in, or paused: refused, nothing stored", async () => {
    const t = setup();
    expect((await t.call("POST", "/v1/receipts", { body: { html: PAGE } }))!.status).toBe(401);
    const paused = setup({ user: "suspended" });
    expect((await paused.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE } }))!.status).toBe(403);
    for (const x of [t, paused]) expect([...x.links.data.keys()].filter((k) => k.startsWith("r:"))).toEqual([]);
  });
  test("a share: a link, 30 days, a delete token; the page is served so nothing can run", async () => {
    const t = setup();
    const r = await t.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE } });
    expect(r!.status).toBe(200);
    const j = await r!.json() as { id: string; url: string; deleteToken: string; expiresAt: string };
    expect(j.url).toBe(`https://api.example.test/r/${j.id}`);
    expect(j.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(j.expiresAt).toBe(new Date(Date.UTC(2026, 10, 27) + LINK_DAYS * 86_400_000).toISOString());
    const stored = t.links.data.get(`r:${j.id}`)!;
    expect(stored.ttl).toBe(LINK_DAYS * 86_400);
    expect(stored.v).not.toContain(j.deleteToken);
    const page = await t.call("GET", `/r/${j.id}`);
    expect(page!.status).toBe(200);
    expect(await page!.text()).toBe(PAGE);
    const csp = page!.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'"); expect(csp).toContain("img-src data:"); expect(csp).toContain("sandbox");
    expect(page!.headers.get("x-robots-tag")).toContain("noindex");
    expect(page!.headers.get("referrer-policy")).toBe("no-referrer");
  });
  test("a bad page is refused before anything is stored", async () => {
    const t = setup();
    const r = await t.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE.replace("<h1>", "<script>x</script><h1>") } });
    expect(r!.status).toBe(400);
    expect([...t.links.data.keys()].filter((k) => k.startsWith("r:"))).toEqual([]);
  });
  test("delete with its token, or by its owner; never by someone else", async () => {
    const t = setup();
    const j = await (await t.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE } }))!.json() as { id: string; deleteToken: string };
    expect((await t.call("DELETE", `/v1/receipts/${j.id}`, { del: "wrong" }))!.status).toBe(403);
    expect((await t.call("DELETE", `/v1/receipts/${j.id}`, { del: j.deleteToken }))!.status).toBe(200);
    expect((await t.call("GET", `/r/${j.id}`))!.status).toBe(404);
    const k = await (await t.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE } }))!.json() as { id: string };
    expect((await t.call("DELETE", `/v1/receipts/${k.id}`, { token: TOKEN }))!.status).toBe(200);
  });
  test("a daily limit per person", async () => {
    const t = setup();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await t.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE } }))!.status;
    expect(last).toBe(429);
    // S16: counted on the owner's own object in one step, never by a read then a write in KV; KV holds only the pages.
    expect([...t.links.data.keys()].every((k) => k.startsWith("r:"))).toBe(true);
    expect(t.links.data.size).toBe(DAILY_LINKS);
  });
  test("S16: links sent at once never pass the daily limit", async () => {
    const t = setup();
    const all = await Promise.all(Array.from({ length: DAILY_LINKS + 10 }, () => t.call("POST", "/v1/receipts", { token: TOKEN, body: { html: PAGE } })));
    expect(all.filter((r) => r!.status === 200).length).toBe(DAILY_LINKS);
  });
  test("other paths are not ours", async () => {
    const t = setup();
    expect(await t.call("GET", "/v1/me")).toBeNull();
    expect((await t.call("GET", "/r/../x"))?.status ?? 404).toBe(404);
  });
});
