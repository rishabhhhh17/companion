// Bug bash (m67): what the browser check does with a page behind a sign in wall.
import { afterEach, expect, test } from "bun:test";
import { browserCheck, browserInstalled } from "../src/proof/browser.ts";

const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); });
const serve = (fetch: (r: Request) => Response) => { const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch }); stops.push(() => s.stop(true)); return `http://127.0.0.1:${s.port}/`; };

test.skipIf(!browserInstalled())("a 401 page", async () => {
  const url = serve(() => new Response("<h1>Please sign in</h1>", { status: 401, headers: { "content-type": "text/html", "www-authenticate": 'Basic realm="x"' } }));
  const r = await browserCheck(url, { timeoutMs: 8000 });
  console.log("401:", JSON.stringify({ ok: r.ok, problems: r.problems, gaps: r.gaps, skipped: r.skipped }));
}, 60000);

test.skipIf(!browserInstalled())("a redirect to a login page", async () => {
  const url = serve((req) => new URL(req.url).pathname === "/login"
    ? new Response('<h1>Sign in</h1><form><input type="password" name="p"><button type="submit">Sign in</button></form><button type="button">Show password</button>', { headers: { "content-type": "text/html" } })
    : new Response(null, { status: 302, headers: { location: "/login" } }));
  const r = await browserCheck(url, { timeoutMs: 8000, expectText: [] });
  console.log("redirect:", JSON.stringify({ ok: r.ok, problems: r.problems, gaps: r.gaps, visited: r.visited }));
}, 60000);
