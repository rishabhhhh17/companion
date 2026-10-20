// The "site is up" watch (F21): which addresses may be visited at all, and what one GET answers. No network: the fetch and
// the name lookup are stand ins, so these also prove what is never visited.
import { describe, expect, test } from "bun:test";
import { hostAllowed, parseTarget, privateReason, resolvedAllowed } from "../src/watchaddress.ts";
import { checkSite, type Fetcher, type SiteDeps, type SiteResponse } from "../src/watchsite.ts";

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
      expect(r, to).toMatchObject({ outcome: "failing" });
      expect(s.urls, to).toEqual(["https://example.com/"]);
    }
  });
  test("a public name that leads to a private address is never visited", async () => {
    const s = site([{ status: 200 }], { "evil.example": ["192.168.0.10"] });
    expect(await checkSite("https://evil.example/", s.deps)).toMatchObject({ outcome: "failing" });
    expect(s.urls).toEqual([]);
    const t = site([{ status: 302, location: "https://rebind.example/" }, { status: 200 }], { "rebind.example": ["10.1.1.1"] });
    expect(await checkSite("https://example.com/", t.deps)).toMatchObject({ outcome: "failing" });
    expect(t.urls).toEqual(["https://example.com/"]);
  });
  test("a typed localhost may be visited, and may redirect to itself, but never to a private address", async () => {
    const s = site([{ status: 302, location: "/login" }, { status: 200 }]);
    expect(await checkSite("localhost:3000", s.deps)).toMatchObject({ outcome: "ok" });
    expect(s.urls).toEqual(["http://localhost:3000/", "http://localhost:3000/login"]);
    expect(s.looked).toEqual([]);   // no name lookup for this Mac itself
    const t = site([{ status: 302, location: "http://192.168.1.9/" }, { status: 200 }]);
    expect(await checkSite("localhost:3000", t.deps)).toMatchObject({ outcome: "failing" });
    expect(t.urls).toEqual(["http://localhost:3000/"]);
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
  test("a site that never answers fails at the time limit, and an unfindable name fails plainly", async () => {
    const s = site([{ never: true }]);
    const r = await checkSite("https://example.com", s.deps, { timeoutMs: 30 });
    expect(r).toMatchObject({ outcome: "failing" });
    expect(r!.reason).toMatch(/did not answer within/);
    const g = await checkSite("https://gone.example/", site([{ status: 200 }]).deps);
    expect(g).toMatchObject({ outcome: "failing", reason: "That address could not be found." });
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
