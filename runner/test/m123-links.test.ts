// M123 slice 5, the engine side: a receipt page shared as a link, only with a Squibby sign in, only to Squibby's own https
// server; the delete token is kept on this Mac only (0600), and Delete link sends it back. Stand in fetch only.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReceiptLinks } from "../src/receiptlinks.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const dir = () => { const d = mkdtempSync(join(tmpdir(), "companion-m123-links-")); made.push(d); return d; };
const TOKEN = "cmp_" + "b".repeat(40);
const PAGE = "<!doctype html><p>receipt</p>";

test("no Squibby sign in: no request, a plain reason", async () => {
  let calls = 0;
  const l = new ReceiptLinks({ dir: dir(), auth: async () => null, fetchFn: (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch });
  expect(await l.share(PAGE)).toEqual({ ok: false, reason: "signIn" });
  expect(calls).toBe(0);
});

test("a share: one POST with the token, the link back, the delete token kept on this Mac only", async () => {
  const d = dir(), seen: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify({ id: "A".repeat(22), url: "https://api.example.test/r/" + "A".repeat(22), deleteToken: "del-123", expiresAt: "2026-12-27T00:00:00.000Z" })); }) as unknown as typeof fetch;
  const l = new ReceiptLinks({ dir: d, auth: async () => ({ token: TOKEN, base: "https://api.example.test" }), fetchFn });
  const r = await l.share(PAGE, "my-shop: add a pricing page");
  expect(r).toEqual({ ok: true, id: "A".repeat(22), url: "https://api.example.test/r/" + "A".repeat(22), expiresAt: "2026-12-27T00:00:00.000Z", title: "my-shop: add a pricing page" });
  expect(seen[0].url).toBe("https://api.example.test/v1/receipts");
  expect((seen[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  expect(JSON.parse(String(seen[0].init.body))).toEqual({ html: PAGE });
  const file = join(d, "receipt-links.json");
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(readFileSync(file, "utf8")).toContain("del-123");
  expect(l.list()).toEqual([{ id: "A".repeat(22), url: "https://api.example.test/r/" + "A".repeat(22), expiresAt: "2026-12-27T00:00:00.000Z", title: "my-shop: add a pricing page" }]);
});

test("a link that comes back from another host is refused", async () => {
  const fetchFn = (async () => new Response(JSON.stringify({ id: "A".repeat(22), url: "https://evil.test/r/x", deleteToken: "d", expiresAt: "2026-12-27T00:00:00.000Z" }))) as unknown as typeof fetch;
  const l = new ReceiptLinks({ dir: dir(), auth: async () => ({ token: TOKEN, base: "https://api.example.test" }), fetchFn });
  expect((await l.share(PAGE)).ok).toBe(false);
});

test("the server's refusal is passed on in plain words; a network failure too", async () => {
  const no = new ReceiptLinks({ dir: dir(), auth: async () => ({ token: TOKEN, base: "https://api.example.test" }), fetchFn: (async () => new Response(JSON.stringify({ error: "You can make 30 links a day." }), { status: 429 })) as unknown as typeof fetch });
  expect(await no.share(PAGE)).toEqual({ ok: false, reason: "refused", say: "You can make 30 links a day." });
  const down = new ReceiptLinks({ dir: dir(), auth: async () => ({ token: TOKEN, base: "https://api.example.test" }), fetchFn: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
  expect(await down.share(PAGE)).toEqual({ ok: false, reason: "offline" });
});

test("delete sends the kept token, and forgets the link", async () => {
  const d = dir(), seen: { url: string; init: RequestInit }[] = [];
  let n = 0;
  const fetchFn = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return n++ === 0 ? new Response(JSON.stringify({ id: "B".repeat(22), url: "https://api.example.test/r/" + "B".repeat(22), deleteToken: "del-9", expiresAt: "2026-12-27T00:00:00.000Z" })) : new Response(JSON.stringify({ deleted: true })); }) as unknown as typeof fetch;
  const l = new ReceiptLinks({ dir: d, auth: async () => ({ token: TOKEN, base: "https://api.example.test" }), fetchFn });
  await l.share(PAGE);
  expect(await l.remove("B".repeat(22))).toEqual({ ok: true });
  expect(seen[1].init.method).toBe("DELETE");
  expect(seen[1].url).toBe("https://api.example.test/v1/receipts/" + "B".repeat(22));
  expect((seen[1].init.headers as Record<string, string>)["x-delete-token"]).toBe("del-9");
  expect(l.list()).toEqual([]);
  expect(await l.remove("nope")).toEqual({ ok: false, reason: "unknown" });
});

test("only an https server is ever used", async () => {
  let calls = 0;
  const l = new ReceiptLinks({ dir: dir(), auth: async () => ({ token: TOKEN, base: "http://api.example.test" }), fetchFn: (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch });
  expect((await l.share(PAGE)).ok).toBe(false);
  expect(calls).toBe(0);
});
