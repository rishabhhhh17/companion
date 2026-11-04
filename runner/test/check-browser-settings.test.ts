// The browser check with the settings for checking a project, in the real hidden browser against pages on this Mac only.
// A button chosen in Settings is pressed only when it is a plain button, link or tab whose words (and the real element's
// words) do not sound like it sends, pays, deletes or publishes; otherwise it is a gap, never a pass. Nothing a press does
// reaches beyond the page's own address, and writes are answered with "nothing to do". The page size can be a phone's.
import { afterEach, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { browserCheck, browserExecutable, riskyLabel } from "../src/proof/browser.ts";
import { drawReceipt } from "../src/proof/picture.ts";
import { VIEWPORTS } from "../src/proof/options.ts";

const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); });
const serve = (pages: Record<string, string>) => {
  const hits: string[] = [];
  const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => { const u = new URL(req.url); hits.push(`${req.method} ${u.pathname}${u.search}`); const b = pages[u.pathname]; return b !== undefined ? new Response(b, { headers: { "content-type": "text/html" } }) : new Response("", { status: 204 }); } });
  stops.push(() => s.stop(true));
  return { url: `http://127.0.0.1:${s.port}/`, hits, port: s.port };
};
const pressed = (hits: string[]) => hits.some((h) => h.includes("/pressed"));
const CART = `<button onclick="fetch('/pressed'); document.getElementById('o').textContent='1 item in your cart'">Add to cart</button><p id="o"></p>`;

describe("a button to press, from Settings", () => {
  test("a plain button is found by its words, pressed, and the words after it are looked for", async () => {
    const s = serve({ "/": CART });
    const r = await browserCheck(s.url, { press: "add to  CART", expectAfterPress: "1 item", clickButtons: false });
    expect(r.ok).toBe(true);
    expect(r.gaps).toBeUndefined();
    expect(pressed(s.hits)).toBe(true);
  }, 30000);
  test("words that do not appear after pressing fail the check", async () => {
    const s = serve({ "/": CART });
    const r = await browserCheck(s.url, { press: "Add to cart", expectAfterPress: "Thank you", clickButtons: false });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("Thank you");
  }, 30000);
  test("a button that is not on the page fails the check", async () => {
    const s = serve({ "/": CART });
    const r = await browserCheck(s.url, { press: "Check out later", clickButtons: false });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("Could not find");
  }, 30000);
  test("a label with a risky word is never pressed, whatever the setting says: a gap, not a pass", async () => {
    const s = serve({ "/": `<button onclick="fetch('/pressed')">Delete account</button>` });
    const r = await browserCheck(s.url, { press: "Delete account", clickButtons: false });
    expect(pressed(s.hits)).toBe(false);
    expect(r.gaps?.join(" ")).toContain("did not press");
    expect(riskyLabel("Pay now")).toBe(true);
    expect(riskyLabel("Add to cart")).toBe(false);
  }, 30000);
  test("checked again on the real element: a plain label on a risky button is not pressed", async () => {
    const s = serve({ "/": `<button aria-label="Delete everything" onclick="fetch('/pressed')">Go</button>` });
    const r = await browserCheck(s.url, { press: "Go", clickButtons: false });
    expect(pressed(s.hits)).toBe(false);
    expect(r.gaps?.length).toBe(1);
  }, 30000);
  test("a button that sends a form, or a link that downloads, is not pressed", async () => {
    const s = serve({ "/": `<form action="/pressed" method="get"><input name="q"><button>Search</button></form><a href="/pressed" download>Get the file</a>` });
    const a = await browserCheck(s.url, { press: "Search", clickButtons: false });
    const b = await browserCheck(s.url, { press: "Get the file", clickButtons: false });
    expect(pressed(s.hits)).toBe(false);
    expect(a.gaps?.join(" ")).toContain("sends a form");
    expect(b.gaps?.join(" ")).toContain("downloads");
  }, 30000);
  test("a press never reaches another address, and a write it makes is answered here with nothing to do", async () => {
    const other = serve({ "/": "<h1>elsewhere</h1>" });
    const s = serve({ "/": `<button onclick="fetch('/pressed', { method: 'POST', body: 'x' }); fetch('${other.url}steal')">Save draft</button><a href="${other.url}away">Leave</a>` });
    await browserCheck(s.url, { press: "Save draft", clickButtons: false });
    await browserCheck(s.url, { press: "Leave", clickButtons: false });
    expect(s.hits.filter((h) => h.startsWith("POST"))).toEqual([]);
    expect(other.hits).toEqual([]);
  }, 30000);
  test("without a button from Settings, nothing is pressed by label (as before)", async () => {
    const s = serve({ "/": CART });
    const r = await browserCheck(s.url, { clickButtons: false });
    expect(r.ok).toBe(true);
    expect(pressed(s.hits)).toBe(false);
  }, 30000);
});

describe("page size", () => {
  const SIZE = `<script>fetch('/w?' + innerWidth + 'x' + innerHeight)</script><h1>Size</h1>`;
  test("desktop is today's 1280 by 800, picture included", async () => {
    const s = serve({ "/": SIZE });
    const r = await browserCheck(s.url, { shot: true, clickButtons: false });
    expect(s.hits).toContain("GET /w?1280x800");
    expect([r.shot?.w, r.shot?.h]).toEqual([1280, 800]);
  }, 30000);
  test("phone opens the page at 390 by 844, and its picture says so", async () => {
    const s = serve({ "/": SIZE });
    const r = await browserCheck(s.url, { shot: true, clickButtons: false, viewport: { ...VIEWPORTS.phone } });
    expect(s.hits).toContain("GET /w?390x844");
    expect([r.shot?.w, r.shot?.h]).toEqual([390, 844]);
  }, 30000);
});

describe("a picture at phone size", () => {
  test("what changed is ringed where it is on the phone sized page, not where it would be on a desktop one", async () => {
    const page = (extra: string) => `<!doctype html><body style="margin:0;font:16px sans-serif"><h1 style="margin:20px">Shop</h1>${extra}</body>`;
    const s = serve({ "/a": page(""), "/b": page(`<button style="position:absolute;left:200px;top:600px;width:150px;height:60px">Buy later</button>`) });
    const phone = { ...VIEWPORTS.phone };
    const before = await browserCheck(`${s.url}a`, { shot: true, clickButtons: false, viewport: phone });
    const after = await browserCheck(`${s.url}b`, { shot: true, clickButtons: false, viewport: phone });
    const pic = await drawReceipt(before.shot!, after.shot!);
    expect(pic.regions.length).toBeGreaterThan(0);
    // Where the green ring (M69, #1F9D55) is in the picture, found in the hidden browser.
    const b = await chromium.launch({ headless: true, executablePath: browserExecutable()! });
    try {
      const p = await b.newPage();
      const box = await p.evaluate(async (src) => {
        const i = new Image(); i.src = `data:image/jpeg;base64,${src}`; await i.decode();
        const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d")!; g.drawImage(i, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const k = (y * c.width + x) * 4; if (d[k] < 90 && d[k + 1] > 120 && d[k + 1] < 200 && d[k + 2] > 40 && d[k + 2] < 130 && d[k + 1] - d[k] > 70) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
        return { w: c.width, h: c.height, x0, y0, x1, y1 };
      }, pic.jpeg);
      expect([box.w, box.h]).toEqual([390, 844]);
      expect(box.x0).toBeGreaterThan(170); expect(box.x0).toBeLessThan(200);
      expect(box.y0).toBeGreaterThan(570); expect(box.y0).toBeLessThan(600);
      expect(box.x1).toBeGreaterThan(350); expect(box.y1).toBeGreaterThan(660);
    } finally { await b.close(); }
  }, 60000);
});
