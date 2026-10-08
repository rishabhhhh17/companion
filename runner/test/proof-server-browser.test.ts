// Starting the project's own server, and looking at its page in the hidden browser. Real servers,
// real browser, temporary folders; everything listens on this Mac only (127.0.0.1).
import { afterEach, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, freePort } from "../src/proof/server.ts";
import { browserCheck, browserInstalled } from "../src/proof/browser.ts";

const made: string[] = [];
const stops: (() => Promise<void> | void)[] = [];
afterEach(async () => { while (stops.length) await stops.pop()!(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-srv-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } return root; };
const listening = (port: number) => new Promise<boolean>((res) => { const s = createServer(); s.once("error", () => res(true)); s.once("listening", () => s.close(() => res(false))); s.listen(port, "127.0.0.1"); });
const BUN_SERVER = `bun -e "Bun.serve({hostname:'127.0.0.1', port:Number(process.env.PORT), fetch:()=>new Response('hi from server')})"`;

describe("finding a free port", () => {
  test("returns a port nothing is using", async () => { expect(await listening(await freePort())).toBe(false); });
  test("two calls in a row do not hand out a port that is in use", async () => {
    const p = await freePort();
    const hold = createServer().listen(p, "127.0.0.1");
    stops.push(() => new Promise<void>((r) => hold.close(() => r())));
    await new Promise((r) => setTimeout(r, 50));
    expect(await freePort()).not.toBe(p);
  });
});

describe("starting the project's own server", () => {
  test("starts it on a free port, answers, and stops it", async () => {
    const r = await startServer({ kind: "server", command: BUN_SERVER }, { cwd: tmp(), timeoutMs: 15000 });
    if (!r.ok) throw new Error(r.reason);
    expect(await (await fetch(r.url)).text()).toBe("hi from server");
    await r.stop();
    expect(await listening(r.port)).toBe(false);
  });
  test("a server already running on the project's usual port is never mistaken for the new one", async () => {
    const old = createServer().listen(4999, "127.0.0.1");
    stops.push(() => new Promise<void>((r) => old.close(() => r())));
    await new Promise((r) => setTimeout(r, 50));
    const r = await startServer({ kind: "server", command: BUN_SERVER, port: 4999, autoPort: false }, { cwd: tmp(), timeoutMs: 15000 });
    if (!r.ok) throw new Error(r.reason);
    stops.push(r.stop);
    expect(r.port).not.toBe(4999);
  });
  test("a server that never answers fails in plain words after the time limit, and nothing is left running", async () => {
    const dir = tmp();
    const r = await startServer({ kind: "server", command: "sleep 30" }, { cwd: dir, timeoutMs: 1200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/did not start|did not answer/i);
  });
  test("a server that crashes straight away reports why", async () => {
    const r = await startServer({ kind: "server", command: "echo 'Cannot find module xyz' >&2; exit 1" }, { cwd: tmp(), timeoutMs: 8000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Cannot find module xyz");
  });
  test("a static page is served from its folder and nothing outside it", async () => {
    const dir = put(tmp(), { "index.html": "<h1>static ok</h1>", "app.js": "1" });
    writeFileSync(join(dir, "..", "secret.txt"), "top secret");
    const r = await startServer({ kind: "static", dir }, { cwd: dir, timeoutMs: 5000 });
    if (!r.ok) throw new Error(r.reason);
    stops.push(r.stop);
    expect(await (await fetch(r.url)).text()).toContain("static ok");
    expect((await fetch(r.url + "app.js")).status).toBe(200);
    expect((await fetch(r.url + "nope.html")).status).toBe(404);
    const escape = await fetch(r.url + "..%2Fsecret.txt");
    expect(await escape.text()).not.toContain("top secret");
    rmSync(join(dir, "..", "secret.txt"), { force: true });
  });
  test("the servers listen only on this Mac", async () => {
    const dir = put(tmp(), { "index.html": "x" });
    const r = await startServer({ kind: "static", dir }, { cwd: dir, timeoutMs: 5000 });
    if (!r.ok) throw new Error(r.reason);
    stops.push(r.stop);
    expect(r.url.startsWith("http://127.0.0.1:")).toBe(true);
  });
});

describe("the hidden browser", () => {
  const serve = (pages: Record<string, { body: string; type?: string; status?: number }>) => {
    const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => { const p = pages[new URL(req.url).pathname]; return p ? new Response(p.body, { status: p.status ?? 200, headers: { "content-type": p.type ?? "text/html" } }) : new Response("nope", { status: 404 }); } });
    stops.push(() => s.stop(true));
    return `http://127.0.0.1:${s.port}/`;
  };
  test("it is installed here", () => expect(browserInstalled()).toBe(true));
  test("a healthy page passes, with the words we expect", async () => {
    const url = serve({ "/": { body: "<h1>Hello from Companion</h1><p>Welcome</p>" } });
    const r = await browserCheck(url, { expectText: ["Hello from Companion"] });
    expect(r).toMatchObject({ ok: true, problems: [] });
  }, 30000);
  test("an error in the page's code fails, and says what it was", async () => {
    const url = serve({ "/": { body: "<h1>Hi</h1><script>throw new Error('kaboom in the page')</script>" } });
    const r = await browserCheck(url, {});
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("kaboom in the page");
  }, 30000);
  test("a console error fails", async () => {
    const url = serve({ "/": { body: "<h1>Hi</h1><script>console.error('bad thing')</script>" } });
    const r = await browserCheck(url, {});
    expect(r.ok).toBe(false);
    expect(r.consoleErrors.join(" ")).toContain("bad thing");
  }, 30000);
  test("a file the page needs that is missing fails", async () => {
    const url = serve({ "/": { body: '<h1>Hi</h1><script src="/missing.js"></script>' } });
    const r = await browserCheck(url, {});
    expect(r.ok).toBe(false);
    expect(r.failedRequests.join(" ")).toContain("missing.js");
  }, 30000);
  test("words that should be on the page but are not fail", async () => {
    const url = serve({ "/": { body: "<h1>Something else</h1>" } });
    const r = await browserCheck(url, { expectText: ["Hello from Companion"] });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("Hello from Companion");
  }, 30000);
  test("a page that answers with an error fails", async () => {
    const url = serve({ "/": { body: "Internal Server Error", status: 500 } });
    expect((await browserCheck(url, {})).ok).toBe(false);
  }, 30000);
  test("a button that should change the page is clicked, and a dead button fails", async () => {
    const live = serve({ "/": { body: '<button id="go" onclick="document.getElementById(\'o\').textContent=\'It worked\'">Go</button><p id="o"></p>' } });
    expect((await browserCheck(live, { click: "#go", expectAfterClick: "It worked" })).ok).toBe(true);
    const dead = serve({ "/": { body: '<button id="go">Go</button><p id="o"></p>' } });
    const r = await browserCheck(dead, { click: "#go", expectAfterClick: "It worked" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("It worked");
  }, 40000);
  test("a button that is not there fails in plain words", async () => {
    const url = serve({ "/": { body: "<h1>No buttons</h1>" } });
    const r = await browserCheck(url, { click: "#nothing", expectAfterClick: "x", timeoutMs: 3000 });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/could not find|not find/i);
  }, 30000);
  test("a page that cannot be reached fails instead of hanging", async () => {
    const r = await browserCheck("http://127.0.0.1:1/", { timeoutMs: 4000 });
    expect(r.ok).toBe(false);
  }, 30000);
  test("the browser never looks at anything but the address it was given", async () => {
    const url = serve({ "/": { body: "<h1>Hi</h1>" } });
    const r = await browserCheck(url, {});
    expect(r.visited.every((u) => u.startsWith("http://127.0.0.1:"))).toBe(true);
  }, 30000);
});
