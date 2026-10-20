// The "site is up" watch (F21): which addresses may be visited at all, and what one GET answers. No network: the fetch and
// the name lookup are stand ins, so these also prove what is never visited.
import { describe, expect, test } from "bun:test";
import { hostAllowed, parseTarget, privateReason, resolvedAllowed } from "../src/watchaddress.ts";
import { checkSite, pinnedFetch, type Fetcher, type SiteDeps, type SiteResponse } from "../src/watchsite.ts";

describe("which addresses can be watched", () => {
  test("a public web address is kept, a bare name gets https, localhost gets http", () => {
    expect(parseTarget("https://example.com/")).toMatchObject({ ok: true, url: "https://example.com/", local: false });
    expect(parseTarget("example.com")).toMatchObject({ ok: true, url: "https://example.com/" });
    expect(parseTarget("  my-shop.vercel.app/health  ")).toMatchObject({ ok: true, url: "https://my-shop.vercel.app/health" });
    expect(parseTarget("localhost:3000")).toMatchObject({ ok: true, url: "http://localhost:3000/", local: true });
    expect(parseTarget("http://127.0.0.1:5173/x")).toMatchObject({ ok: true, local: true });
    expect(parseTarget("[::1]:8080")).toMatchObject({ ok: true, local: true });
    expect(parseTarget("http://app.localhost:3000")).toMatchObject({ ok: true, local: true });
  });
  test("a part after ? is refused, because that is where keys go and Companion keeps the address", () => {
    const r = parseTarget("https://site.com/health?key=abc123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/after the \?/);
    expect(parseTarget("https://site.com/health?").ok).toBe(true);
    expect(parseTarget("https://site.com/health#top")).toMatchObject({ ok: true, url: "https://site.com/health" });
  });
  test("only http and https", () => {
    for (const t of ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "data:text/html,hi", "mailto:a@b.co", "ssh://example.com", "chrome://settings"]) {
      const r = parseTarget(t);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.reason, t).toMatch(/http or https/);
    }
  });
  test("no password in the address, no spaces, nothing empty", () => {
    expect(parseTarget("https://sam:hunter2@example.com/").ok).toBe(false);
    expect(parseTarget("https://token@example.com/").ok).toBe(false);
    expect(parseTarget("exa mple.com").ok).toBe(false);
    expect(parseTarget("").ok).toBe(false);
    expect(parseTarget("https://").ok).toBe(false);
    expect(parseTarget("x".repeat(2100)).ok).toBe(false);
  });
  test("private and link local addresses are never visited, however they are written", () => {
    for (const t of ["http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.0.1/", "http://172.31.255.255/", "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/", "http://0.0.0.0/",
      "http://2130706433/", "http://0x7f000001/", "http://017700000001/", "http://[fe80::1]/", "http://[fd00::1]/", "http://[::ffff:10.0.0.1]/", "http://[::ffff:a00:1]/", "http://[::]/", "http://printer.local/", "http://nas.internal/", "http://intranet/"]) {
      const r = parseTarget(t);
      expect(r.ok, t).toBe(false);
    }
    // not private: 172.15 and 172.32 are public, and so is an ordinary address
    expect(parseTarget("http://172.15.0.1/").ok).toBe(true);
    expect(parseTarget("http://172.32.0.1/").ok).toBe(true);
    expect(parseTarget("http://8.8.8.8/").ok).toBe(true);
  });
  test("addresses that carry or lead to an internal address in another form are refused too", () => {
    for (const ip of ["::7f00:1", "64:ff9b::7f00:1", "64:ff9b::a00:1", "2002:7f00:1::", "2002:a00:1::", "fec0::1", "100::1", "64:ff9b:1::1", "2001::1", "2001:db8::1", "::ffff:0:7f00:1",
      "198.18.0.1", "198.19.255.255", "192.0.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "240.0.0.1", "255.255.255.255", "fe80::1%en0"]) expect(privateReason(ip), ip).not.toBeNull();
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1::1", "64:ff9b::808:808", "2002:808:808::", "198.20.0.1", "192.0.3.1"]) expect(privateReason(ip), ip).toBeNull();
    for (const t of ["http://[::127.0.0.1]/", "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/", "http://[fec0::1]/", "http://198.18.0.1/", "http://192.0.0.1/", "http://[100::1]/"]) expect(parseTarget(t).ok, t).toBe(false);
  });
  test("the reasons are plain", () => {
    expect(privateReason("10.1.2.3")).toBe("a private network");
    expect(privateReason("169.254.1.1")).toBe("a link local address");
    expect(privateReason("127.0.0.1")).toBe("this Mac itself");
    expect(privateReason("93.184.216.34")).toBeNull();
    expect(hostAllowed("localhost", false)).toMatch(/Type localhost/);
    expect(hostAllowed("localhost", true)).toBeNull();
  });
  test("a name that leads to a private address is refused, except this Mac itself for a typed localhost", () => {
    expect(resolvedAllowed(["93.184.216.34", "2606:2800:220:1::1"], false)).toBeNull();
    expect(resolvedAllowed(["93.184.216.34", "10.0.0.7"], false)).toMatch(/private network/);
    expect(resolvedAllowed(["127.0.0.1"], false)).toMatch(/this Mac itself/);
    expect(resolvedAllowed(["127.0.0.1", "::1"], true)).toBeNull();
    expect(resolvedAllowed(["127.0.0.1", "10.0.0.7"], true)).toMatch(/private network/);
    expect(resolvedAllowed([], false)).toMatch(/could not find/);
  });
});

type Step = { status?: number; location?: string; throws?: boolean; never?: boolean };
function site(steps: Step[], names: Record<string, string[]> = {}) {
  const urls: string[] = [], inits: any[] = [], looked: string[] = [];
  let i = 0, cancelled = 0;
  const fetch: Fetcher = (url, init) => {
    urls.push(url); inits.push(init);
    const s = steps[Math.min(i++, steps.length - 1)];
    if (s.never) return new Promise<SiteResponse>((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))));
    if (s.throws) return Promise.reject(new Error("connect failed"));
    return Promise.resolve({ status: s.status ?? 200, headers: { get: (n: string) => (n.toLowerCase() === "location" ? s.location ?? null : null) }, body: { cancel: () => { cancelled++; } } });
  };
  const deps: SiteDeps = { fetch, lookup: async (h) => { looked.push(h); if (names[h]) return names[h]; if (h === "gone.example") throw new Error("ENOTFOUND"); return ["93.184.216.34"]; }, sleep: async () => {}, retryMs: 0 };
  return { deps, urls, inits, looked, cancelled: () => cancelled };
}

describe("one answer", () => {
  test("a 200 is up, the request is a plain GET with no cookies and no body kept", async () => {
    const s = site([{ status: 200 }]);
    const r = await checkSite("example.com", s.deps);
    expect(r).toMatchObject({ outcome: "ok" });
    expect(r!.reason).toMatch(/answered 200/);
    expect(s.inits[0]).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit" });
    expect(Object.keys(s.inits[0].headers).map((k) => k.toLowerCase())).not.toContain("cookie");
    expect(s.cancelled()).toBe(1);
  });
  test("a redirect that ends well is up, and every hop is asked in turn", async () => {
    const s = site([{ status: 301, location: "/home" }, { status: 302, location: "https://www.example.com/app" }, { status: 200 }]);
    expect(await checkSite("https://example.com", s.deps)).toMatchObject({ outcome: "ok" });
    expect(s.urls).toEqual(["https://example.com/", "https://example.com/home", "https://www.example.com/app"]);
  });
  test("more than 3 redirects fails, with the fourth never followed", async () => {
    const s = site([{ status: 302, location: "/a" }, { status: 302, location: "/b" }, { status: 302, location: "/c" }, { status: 302, location: "/d" }, { status: 200 }]);
    const r = await checkSite("https://example.com", s.deps);
    expect(r).toMatchObject({ outcome: "failing" });
    expect(r!.reason).toMatch(/more than 3 times/);
    expect(s.urls).toHaveLength(4);
  });
  test("exactly 3 redirects is allowed", async () => {
    const s = site([{ status: 302, location: "/a" }, { status: 302, location: "/b" }, { status: 302, location: "/c" }, { status: 200 }]);
    expect(await checkSite("https://example.com", s.deps)).toMatchObject({ outcome: "ok" });
  });
  test("a redirect to a private address, a link local address, or another scheme is never followed", async () => {
    for (const to of ["http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/admin", "http://localhost:3000/", "file:///etc/passwd", "https://user:pw@evil.example/"]) {
      const s = site([{ status: 302, location: to }, { status: 200 }]);
      const r = await checkSite("https://example.com", s.deps);
      // Companion's own choice not to go there says nothing about the site: it is "cannot tell", never "failing".
      expect(r, to).toMatchObject({ outcome: /file:|user:pw/.test(to) ? "failing" : "unknown" });
      expect(s.urls, to).toEqual(["https://example.com/"]);
    }
  });
  test("a public name that leads to a private address is never visited", async () => {
    const s = site([{ status: 200 }], { "evil.example": ["192.168.0.10"] });
    expect(await checkSite("https://evil.example/", s.deps)).toMatchObject({ outcome: "unknown" });
    expect(s.urls).toEqual([]);
    const t = site([{ status: 302, location: "https://rebind.example/" }, { status: 200 }], { "rebind.example": ["10.1.1.1"] });
    expect(await checkSite("https://example.com/", t.deps)).toMatchObject({ outcome: "unknown" });
    expect(t.urls).toEqual(["https://example.com/"]);
  });
  test("a typed localhost may be visited, and may redirect to itself, but never to a private address", async () => {
    const s = site([{ status: 302, location: "/login" }, { status: 200 }]);
    expect(await checkSite("localhost:3000", s.deps)).toMatchObject({ outcome: "ok" });
    expect(s.urls).toEqual(["http://localhost:3000/", "http://localhost:3000/login"]);
    expect(s.looked).toEqual([]);   // no name lookup for this Mac itself
    const t = site([{ status: 302, location: "http://192.168.1.9/" }, { status: 200 }]);
    expect(await checkSite("localhost:3000", t.deps)).toMatchObject({ outcome: "unknown" });
    expect(t.urls).toEqual(["http://localhost:3000/"]);
  });
  test("the name is looked up once and the request goes to the address that was checked, even if the name then answers differently", async () => {
    const s = site([{ status: 200 }]);
    const answers = [["93.184.216.34"], ["127.0.0.1"], ["10.0.0.1"]];
    let calls = 0;
    s.deps.lookup = async () => answers[Math.min(calls++, 2)];
    expect(await checkSite("https://rebind.example/", s.deps)).toMatchObject({ outcome: "ok" });
    expect(calls).toBe(1);
    expect(s.inits[0].address).toBe("93.184.216.34");
    expect(s.urls).toEqual(["https://rebind.example/"]);
    // every hop is resolved and pinned on its own
    const t = site([{ status: 302, location: "https://other.example/x" }, { status: 200 }]);
    const seen: Record<string, number> = {};
    t.deps.lookup = async (h) => { seen[h] = (seen[h] ?? 0) + 1; return seen[h] === 1 ? (h === "other.example" ? ["203.0.114.7"] : ["93.184.216.34"]) : ["127.0.0.1"]; };
    expect(await checkSite("https://rebind.example/", t.deps)).toMatchObject({ outcome: "ok" });
    expect(t.inits.map((i) => i.address)).toEqual(["93.184.216.34", "203.0.114.7"]);
    expect(seen).toEqual({ "rebind.example": 1, "other.example": 1 });
  });
  test("a number typed as the address and the localhost the person typed are not looked up, and a name ending .localhost that they did not type is", async () => {
    const a = site([{ status: 200 }]);
    expect(await checkSite("localhost:3000", a.deps)).toMatchObject({ outcome: "ok" });
    expect(a.looked).toEqual([]);
    expect(a.inits[0].address).toBeUndefined();
    const b = site([{ status: 302, location: "http://evil.localhost:3000/" }, { status: 200 }], { "evil.localhost": ["93.184.216.34"] });
    await checkSite("localhost:3000", b.deps);
    expect(b.looked).toEqual(["evil.localhost"]);
    const c = site([{ status: 302, location: "http://evil.localhost:3000/" }, { status: 200 }], { "evil.localhost": ["10.1.1.1"] });
    expect(await checkSite("localhost:3000", c.deps)).toMatchObject({ outcome: "unknown" });
    expect(c.urls).toEqual(["http://localhost:3000/"]);
    // this Mac itself is trusted only for a name that is itself this Mac: a public name that leads to 127.0.0.1 is not
    const d = site([{ status: 302, location: "https://public.example/" }, { status: 200 }], { "public.example": ["127.0.0.1"] });
    expect(await checkSite("localhost:3000", d.deps)).toMatchObject({ outcome: "unknown" });
    expect(d.urls).toEqual(["http://localhost:3000/"]);
  });
  test("an address that is not allowed is never fetched at all", async () => {
    const s = site([{ status: 200 }]);
    expect(await checkSite("http://169.254.169.254/", s.deps)).toMatchObject({ outcome: "unknown" });
    expect(await checkSite("ftp://example.com", s.deps)).toMatchObject({ outcome: "unknown" });
    expect(s.urls).toEqual([]);
  });
  test("404 and 500 are failing, in plain words, and a 500 is asked once more first", async () => {
    const a = site([{ status: 404 }]);
    expect((await checkSite("https://example.com", a.deps))!.reason).toBe("The page was not found (404).");
    const b = site([{ status: 503 }]);
    const r = await checkSite("https://example.com", b.deps);
    expect(r).toMatchObject({ outcome: "failing" });
    expect(r!.reason).toMatch(/error on its side \(503\)/);
    expect(b.urls).toHaveLength(2);
  });
  test("one dropped connection is not an alert when the second try works", async () => {
    const s = site([{ throws: true }, { status: 200 }]);
    expect(await checkSite("https://example.com", s.deps)).toMatchObject({ outcome: "ok" });
    const t = site([{ status: 502 }, { status: 200 }]);
    expect(await checkSite("https://example.com", t.deps)).toMatchObject({ outcome: "ok" });
  });
  test("a site that never answers fails at the time limit, and an unfindable name is cannot tell", async () => {
    const s = site([{ never: true }]);
    const r = await checkSite("https://example.com", s.deps, { timeoutMs: 30 });
    expect(r).toMatchObject({ outcome: "failing" });
    expect(r!.reason).toMatch(/did not answer within/);
    const g = await checkSite("https://gone.example/", site([{ status: 200 }]).deps);
    // A name that leads nowhere may be the Mac being offline: cannot tell, not "your site is down".
    expect(g).toMatchObject({ outcome: "unknown", reason: "That address could not be found." });
  });
  test("Stop everything says nothing about the site", async () => {
    const s = site([{ never: true }]);
    const ac = new AbortController();
    const p = checkSite("https://example.com", s.deps, { signal: ac.signal, timeoutMs: 10_000 });
    setTimeout(() => ac.abort(), 20);
    expect(await p).toBeNull();
    const done = new AbortController(); done.abort();
    expect(await checkSite("https://example.com", site([{ status: 200 }]).deps, { signal: done.signal })).toBeNull();
  });
});

describe("the real fetcher connects to the address it was given", () => {
  // A server on this Mac's own loopback stands in for the site; no other network is touched.
  test("the name stays in the Host header, the connection goes to the pinned address, and the body is not read", async () => {
    const seen: { host?: string; path?: string }[] = [];
    const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => { seen.push({ host: req.headers.get("host") ?? "", path: new URL(req.url).pathname }); return new Response("x".repeat(1000), { status: 302, headers: { location: "/next" } }); } });
    try {
      const ac = new AbortController();
      const res = await pinnedFetch(`http://pinned.example:${srv.port}/health`, { method: "GET", redirect: "manual", signal: ac.signal, headers: { accept: "*/*" }, credentials: "omit", address: "127.0.0.1" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/next");
      res.body?.cancel();
      expect(seen).toEqual([{ host: `pinned.example:${srv.port}`, path: "/health" }]);
      // with no address given the name is not pinned and nothing could connect to it
      await expect(pinnedFetch(`http://pinned.invalid:${srv.port}/`, { method: "GET", redirect: "manual", signal: ac.signal, headers: {}, credentials: "omit" })).rejects.toBeDefined();
      // a stop ends the request
      const stop = new AbortController(); stop.abort();
      await expect(pinnedFetch(`http://pinned.example:${srv.port}/`, { method: "GET", redirect: "manual", signal: stop.signal, headers: {}, credentials: "omit", address: "127.0.0.1" })).rejects.toBeDefined();
    } finally { srv.stop(true); }
  });
  test("a proxy named in the environment is not used", async () => {
    // Run in a program of its own, so the proxy variables never touch the rest of the tests.
    const seen: string[] = [];
    const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => { seen.push(req.url); return new Response("proxied"); } });
    const site2 = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("direct", { status: 200 }) });
    try {
      const url = new URL("../src/watchsite.ts", import.meta.url).href;
      const code = `import { pinnedFetch } from ${JSON.stringify(url)}; const r = await pinnedFetch("http://direct.example:${site2.port}/", { method: "GET", redirect: "manual", signal: new AbortController().signal, headers: {}, credentials: "omit", address: "127.0.0.1" }); r.body?.cancel(); console.log(r.status);`;
      const p = Bun.spawn([process.execPath, "-e", code], { env: { ...process.env, HTTP_PROXY: `http://127.0.0.1:${proxy.port}`, http_proxy: `http://127.0.0.1:${proxy.port}`, ALL_PROXY: `http://127.0.0.1:${proxy.port}` }, stdout: "pipe", stderr: "pipe" });
      expect((await new Response(p.stdout).text()).trim()).toBe("200");
      await p.exited;
      expect(seen).toEqual([]);
    } finally { proxy.stop(true); site2.stop(true); }
  });
});
