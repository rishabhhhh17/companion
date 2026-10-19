// The browser check tries the page's buttons, because a page can load fine and still be broken when used.
// It never clicks anything that sounds like it sends, pays, deletes or publishes, and never reaches outside this Mac.
import { afterEach, describe, expect, test } from "bun:test";
import { browserCheck } from "../src/proof/browser.ts";

const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); });
const hits: string[] = [];
const serve = (pages: Record<string, string>) => {
  hits.length = 0;
  const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => { const path = new URL(req.url).pathname; hits.push(path); const b = pages[path]; return b !== undefined ? new Response(b, { headers: { "content-type": "text/html" } }) : new Response("nope", { status: 404 }); } });
  stops.push(() => s.stop(true));
  return `http://127.0.0.1:${s.port}/`;
};

describe("buttons on the page are tried", () => {
  test("a button that calls a function that does not exist fails the check, with the error", async () => {
    const r = await browserCheck(serve({ "/": '<p>Click me</p><button onclick="launchRocket()">Launch</button>' }));
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/launchRocket is not defined/);
    expect(r.problems.join(" ")).toContain("Launch");
  }, 30000);
  test("a button that works passes", async () => {
    const r = await browserCheck(serve({ "/": '<button onclick="document.getElementById(\'o\').textContent=\'It worked\'">Go</button><p id="o"></p>' }));
    expect(r.ok).toBe(true);
  }, 30000);
  test("every button is tried, not only the first", async () => {
    const r = await browserCheck(serve({ "/": '<button onclick="1">One</button><button onclick="two()">Two</button>' }));
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("Two");
  }, 30000);
  test("a button that is hidden or switched off is left alone", async () => {
    const r = await browserCheck(serve({ "/": '<button disabled onclick="boom()">Off</button><button style="display:none" onclick="boom()">Hidden</button><p>fine</p>' }));
    expect(r.ok).toBe(true);
  }, 30000);
  test("a page with no buttons is just loaded, as before", async () => {
    expect((await browserCheck(serve({ "/": "<h1>hi</h1>" }))).ok).toBe(true);
  }, 30000);
  test("a button that sends the page somewhere else still leaves the check able to finish", async () => {
    const r = await browserCheck(serve({ "/": '<button onclick="location.href=\'/next\'">Next</button>', "/next": "<h1>next</h1>" }));
    expect(r.ok).toBe(true);
  }, 30000);
  test("it can be switched off", async () => {
    const r = await browserCheck(serve({ "/": '<button onclick="boom()">Go</button>' }), { clickButtons: false });
    expect(r.ok).toBe(true);
  }, 30000);
});

describe("buttons it must never press", () => {
  for (const label of ["Delete everything", "Remove account", "Pay now", "Buy", "Send email", "Submit order", "Sign out", "Publish", "Deploy", "Reset all", "Checkout", "Erase data"]) {
    test(`"${label}" is not clicked`, async () => {
      const url = serve({ "/": `<button onclick="fetch('/danger')">${label}</button>` });
      const r = await browserCheck(url);
      expect(hits).not.toContain("/danger");
      expect(r.ok).toBe(true);
    }, 30000);
  }
  test("a submit button inside a form is not clicked", async () => {
    const url = serve({ "/": `<form action="/danger" method="post"><button type="submit">Go</button></form>` });
    await browserCheck(url);
    expect(hits).not.toContain("/danger");
  }, 30000);
  test("a click can never reach a server outside this Mac", async () => {
    const outside: string[] = [];
    const other = Bun.serve({ hostname: "0.0.0.0", port: 0, fetch: (req) => { outside.push(new URL(req.url).pathname); return new Response("x"); } });
    stops.push(() => other.stop(true));
    // 127.0.0.2 is a different address than the page's own, so it counts as "somewhere else".
    const r = await browserCheck(serve({ "/": `<button onclick="fetch('http://127.0.0.2:${other.port}/leak').catch(()=>{})">Go</button>` }));
    await Bun.sleep(300);
    expect(outside).toEqual([]);
    expect(r.ok).toBe(true);
  }, 30000);
  test("only a handful of buttons are tried, so a huge page cannot take forever", async () => {
    const many = Array.from({ length: 40 }, (_, i) => `<button onclick="fetch('/b${i}')">b${i}</button>`).join("");
    await browserCheck(serve({ "/": many }));
    expect(hits.filter((h) => /^\/b\d+$/.test(h)).length).toBeLessThanOrEqual(8);
  }, 60000);
  test("a harmlessly named button that writes to the server never reaches it", async () => {
    let wrote = 0;
    const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => {
      if (req.method !== "GET") { wrote++; return new Response("saved"); }
      return new Response('<button onclick="fetch(\'/api\',{method:\'POST\'}).then(()=>{document.title=\'done\'})">Go</button>', { headers: { "content-type": "text/html" } });
    } });
    stops.push(() => srv.stop(true));
    const r = await browserCheck(`http://127.0.0.1:${srv.port}/`);
    expect(wrote).toBe(0);
    expect(r.ok).toBe(true);
  }, 30000);
});

// The check's own guard answers a press's writes for the server, and stops it reaching other hosts. What the page then does
// is because of the guard, not the project, so it is a gap, never a problem blamed on the code (audit A23).
describe("what the page does after the guard answers for the server", () => {
  const page = (body: string) => {
    let wrote = 0;
    const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => {
      if (req.method !== "GET") { wrote++; return Response.json({ likes: 1 }); }
      return new Response(body, { headers: { "content-type": "text/html" } });
    } });
    stops.push(() => srv.stop(true));
    return { url: `http://127.0.0.1:${srv.port}/`, wrote: () => wrote };
  };
  test("a Like button that POSTs and reads the JSON answer passes, and nothing is written", async () => {
    const p = page(`<button onclick="fetch('/api/like',{method:'POST'}).then(r=>r.json()).then(j=>{document.title='ok'})">Like</button>`);
    const r = await browserCheck(p.url);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(p.wrote()).toBe(0);
  }, 30000);
  test("a Refresh button that loads from another host and logs the failure is a gap, not a problem", async () => {
    const p = page(`<button onclick="fetch('http://127.0.0.2:9/rest/v1/notes').catch(e=>console.error('Could not load notes', e.message))">Refresh</button>`);
    const r = await browserCheck(p.url);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.gaps?.join(" ")).toMatch(/Pressing "Refresh" talks to a server/);
  }, 30000);
  test("a page that crashes on the guard's empty answer is a gap too", async () => {
    const p = page(`<button onclick="fetch('/api/items',{method:'POST'}).then(r=>r.json()).then(j=>{document.body.append(j.items.map(String).join())})">Load more</button>`);
    const r = await browserCheck(p.url);
    expect(r.problems).toEqual([]);
    expect(r.gaps?.join(" ")).toMatch(/Pressing "Load more" talks to a server/);
  }, 30000);
  test("a button that is broken on its own still fails, with its error", async () => {
    const p = page(`<button onclick="fetch('/api/like',{method:'POST'}).then(()=>{})">Like</button><button onclick="launchRocket()">Launch</button>`);
    const r = await browserCheck(p.url);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/launchRocket is not defined/);
  }, 30000);
});
