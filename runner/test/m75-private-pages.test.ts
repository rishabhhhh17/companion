// M75: "this page should need a sign in but does not". Which pages look private (from the project's own files, read only),
// that nothing is looked at in a project with no sign in, and the probe through a real local page with the hidden browser
// when it is on this Mac. Temporary fixture folders and a server on this Mac only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { browserInstalled, openWithoutSignIn } from "../src/proof/browser.ts";
import { matcherPaths, privateRoutes } from "../src/proof/privatepages.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { REVIEW_REASONS } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-m75-private-"))); made.push(d); return d; };
function write(dir: string, files: Record<string, string>) { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); } }
const AUTH = { "package.json": JSON.stringify({ dependencies: { next: "15.0.0", "next-auth": "5.0.0" } }) };

describe("which pages look private", () => {
  test("Next.js app and pages routes named dashboard, settings, account, admin, profile or billing", () => {
    const p = tmp();
    write(p, { ...AUTH, "app/page.tsx": "", "app/dashboard/page.tsx": "", "app/(main)/settings/page.tsx": "", "app/blog/page.tsx": "", "src/pages/admin/index.tsx": "", "pages/profile.tsx": "" });
    expect(privateRoutes(p)).toEqual(["/admin", "/profile", "/settings", "/dashboard"]);
  });
  test("dynamic parts, API routes and parallel slots are left out; at most five", () => {
    const p = tmp();
    write(p, { ...AUTH, "app/account/[id]/page.tsx": "", "app/api/admin/route.ts": "", "pages/api/settings.ts": "", "app/@modal/billing/page.tsx": "",
      "app/dashboard/page.tsx": "", "app/settings/page.tsx": "", "app/account/page.tsx": "", "app/admin/page.tsx": "", "app/profile/page.tsx": "", "app/billing/page.tsx": "" });
    const r = privateRoutes(p);
    expect(r.length).toBe(5);
    expect(r.every((x) => !x.includes("[") && !x.startsWith("/api"))).toBe(true);
  });
  test("SvelteKit routes and plain html pages", () => {
    const p = tmp();
    write(p, { ".claude/proof.json": JSON.stringify({ signIn: true }), "src/routes/dashboard/+page.svelte": "", "admin.html": "", "public/settings.html": "", "about.html": "" });
    expect(privateRoutes(p)).toEqual(["/dashboard", "/admin.html", "/settings.html"]);
  });
  test("a project with no sign in at all is never told its settings page should have one", () => {
    const p = tmp();
    write(p, { "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }), "app/settings/page.tsx": "", "app/dashboard/page.tsx": "" });
    expect(privateRoutes(p)).toEqual([]);
  });
  test("the project's own middleware matcher counts, by its plain paths only", () => {
    expect(matcherPaths(`export const config = { matcher: ["/dashboard/:path*", "/team", "/((?!api|_next).*)"] };`)).toEqual(["/dashboard", "/team"]);
    expect(matcherPaths(`export const config = { matcher: '/members/:path*' }`)).toEqual(["/members"]);
    expect(matcherPaths(`export function middleware() {}`)).toEqual([]);
    const p = tmp();
    write(p, { "package.json": "{}", "middleware.ts": `export const config = { matcher: ["/team/:path*"] };` });
    expect(privateRoutes(p)).toEqual(["/team"]);
  });
  test("the review reason is known to the protocol", () => {
    expect((REVIEW_REASONS as readonly string[]).includes("open_private_page")).toBe(true);
  });
});

describe("the ladder", () => {
  test("after the page check passes, private pages that open are told on the step and the result, never as a failure", async () => {
    const dir = tmp();
    write(dir, { "index.html": "<h1>Shop</h1>", "dashboard.html": "<h1>Orders</h1>", ".claude/proof.json": JSON.stringify({ signIn: true }) });
    const store = new CheckpointStore(tmp(), dir);
    const snap = await store.snapshot("now");
    const probed: string[][] = [];
    const r = await runLadder({ project: dir, store, beforeId: snap.id, afterId: snap.id, noRoomWaitsMs: [],
      browser: async (url) => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 }),
      privatePages: true, probe: async (_u, routes) => { probed.push(routes); return ["/dashboard.html"]; } });
    expect(probed).toEqual([["/dashboard.html"]]);
    expect(r.verdict).toBe("passed");
    expect(r.openPrivate).toEqual(["/dashboard.html"]);
    expect(r.steps.find((s) => s.rung === "browser")!.detail).toContain("/dashboard.html");
  });
  test("off, or with no private page, nothing is probed", async () => {
    const dir = tmp();
    write(dir, { "index.html": "<h1>Shop</h1>", "dashboard.html": "<h1>Orders</h1>", ".claude/proof.json": JSON.stringify({ signIn: true }) });
    const store = new CheckpointStore(tmp(), dir);
    const snap = await store.snapshot("now");
    let probed = 0;
    const r = await runLadder({ project: dir, store, beforeId: snap.id, afterId: snap.id, noRoomWaitsMs: [],
      browser: async (url) => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 }), probe: async () => { probed++; return []; } });
    expect(probed).toBe(0);
    expect(r.openPrivate).toBeUndefined();
  });
});

describe.if(browserInstalled())("the probe, with the hidden browser on this Mac", () => {
  test("an open dashboard is found; one that sends to a login page, asks for a password or answers 401 is not", async () => {
    const srv: ReturnType<typeof Bun.serve> = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req): Response {
      const p = new URL(req.url).pathname;
      const html = (b: string, status = 200) => new Response(`<!doctype html><body>${b}</body>`, { status, headers: { "content-type": "text/html" } });
      if (p === "/dashboard") return html("<h1>Your orders</h1><p>Order 1</p>");
      if (p === "/settings") return Response.redirect(`http://127.0.0.1:${srv.port}/login`, 302);
      if (p === "/login") return html('<form><input type="password"></form>');
      if (p === "/account") return html('<h1>Account</h1><input type="password">');
      if (p === "/admin") return html("Unauthorized", 401);
      if (p === "/billing") return html("<h1>Please sign in to continue</h1>");
      return html("<h1>Home</h1>");
    } });
    try {
      const open = await openWithoutSignIn(`http://127.0.0.1:${srv.port}/`, ["/dashboard", "/settings", "/account", "/admin", "/billing"], { timeoutMs: 8000 });
      expect(open).toEqual(["/dashboard"]);
    } finally { srv.stop(true); }
  }, 30_000);
});
