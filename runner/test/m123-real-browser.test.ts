// M123 with the real hidden browser on this Mac (skipped where it is not installed): a tiny app on this Mac, the founder's
// example ask, and each promise tried for real. The pictures are of this test page, made here and thrown away.
import { afterEach, expect, test } from "bun:test";
import { browserCheck, browserInstalled } from "../src/proof/browser.ts";
import { forReceipt, promisesFrom, tryPromises } from "../src/review/promises.ts";

const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); });
const serve = (pages: Record<string, string>) => {
  const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (r) => { const p = new URL(r.url).pathname; return pages[p] ? new Response(pages[p], { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 }); } });
  stops.push(() => s.stop(true)); return `http://127.0.0.1:${s.port}/`;
};
const ask = "add a pricing page with three plans, and link it from the menu.";
const changed = ["app/pricing/page.tsx", "components/nav.tsx"];
const PRICING = "<!doctype html><h1>Pricing</h1><p>Free</p><p>Pro</p><p>Team</p>";

test.skipIf(!browserInstalled())("the menu has no pricing link: the page is kept, the link is not there", async () => {
  const url = serve({ "/": "<!doctype html><nav><a href='/about'>About</a></nav><h1>Shop</h1>", "/pricing": PRICING, "/about": "<h1>About</h1>" });
  const out = await tryPromises(url, promisesFrom(ask, changed), browserCheck, { timeoutMs: 15000 });
  expect(out.map((o) => [o.promise.kind, o.result])).toEqual([["opens", "kept"], ["links", "not_kept"]]);
  const rows = forReceipt(out, { pictures: true });
  expect(rows.every((r) => typeof r.image === "string" && r.image.length > 100)).toBe(true);
  console.log("[real browser] menu without the link:", JSON.stringify(out.map((o) => ({ say: o.promise.say, result: o.result, why: o.why }))));
}, 60_000);

test.skipIf(!browserInstalled())("the menu links to pricing: both kept", async () => {
  const url = serve({ "/": "<!doctype html><nav><a href='/pricing'>Pricing</a></nav><h1>Shop</h1>", "/pricing": PRICING });
  const out = await tryPromises(url, promisesFrom(ask, changed), browserCheck, { timeoutMs: 15000 });
  expect(out.map((o) => o.result)).toEqual(["kept", "kept"]);
}, 60_000);
