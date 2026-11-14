// M87: Why is live broken? (research feature 7; complaint group E: E3 Stripe webhooks failing with no fix, E4 values that
// work on the Mac but are not in Vercel Production, E1 and E2 pages and tables open to anyone). Every command output here is
// a fixture: the real vercel and stripe tools never run in a test.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";
import { refuseWrite } from "../src/readonly.ts";
import { browserInstalled, openWithoutSignIn, visitWithoutSignIn, type PageVisit } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";
import { databasePart, envPart, envReads, liveAddress, pagesPart, parseVercelEnvNames, stripePart, stripeWebhookRoutes, whyLiveBroken, type Tools } from "../src/ship/livecheck.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "m87-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), c); } return root; };
const res = (o: Partial<RunResult>): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });

/** Stand in tools: each command's answer from a table, every command recorded. */
function tools(answers: Record<string, RunResult | ((c: string) => RunResult)>, o: Partial<Tools> = {}) {
  const calls: string[] = [], probed: { url: string; routes: readonly string[] }[] = [];
  const t: Tools = {
    run: async (c) => { calls.push(c); const a = answers[c]; if (!a) throw new Error(`unexpected command: ${c}`); return typeof a === "function" ? a(c) : a; },
    hasVercel: () => true, vercelSignedIn: () => true, hasStripe: () => true, browserReady: () => true,
    probe: async (url, routes) => { probed.push({ url, routes }); return { open: [], signIn: [...routes], unreachable: [] }; },
    now: () => new Date("2026-11-14T12:00:00Z"),
    ...o,
  };
  return { t, calls, probed };
}

// The table `vercel env ls production` prints [verify the exact layout with the current Vercel tool]. A plain value shows
// as itself, so the test holds that it never leaves the parser.
const ENV_TABLE = `Vercel CLI 41.2.0
> Environment Variables found for acme/shop [212ms]

 name                        value                                   environments        created
 DATABASE_URL                Encrypted                               Production          3d ago
 NEXT_PUBLIC_SITE_URL        https://plain-value-never-kept.example  Production          3d ago
 STRIPE_SECRET_KEY           Encrypted                               Production          3d ago
`;
const SHOP = {
  "package.json": JSON.stringify({ dependencies: { next: "15.0.0", stripe: "17.0.0" } }),
  ".vercel/project.json": JSON.stringify({ orgId: "team_1", projectId: "prj_1" }),
  "app/api/webhooks/stripe/route.ts": `import Stripe from "stripe";\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);\nexport async function POST(req: Request) {\n  const secret = process.env.STRIPE_WEBHOOK_SECRET;\n  return new Response("ok");\n}\n`,
  "lib/db.ts": `export const url = process.env["DATABASE_URL"];\nexport const site = process.env.NEXT_PUBLIC_SITE_URL;\nexport const dsn = process.env.SENTRY_DSN ?? "";\nexport const env = process.env.NODE_ENV;\nexport const where = process.env.VERCEL_URL;\n`,
  "tests/setup.ts": "process.env.TEST_ONLY_KEY;",
  "scripts/seed.ts": "process.env.SEED_TOKEN;",
  "supabase/functions/hello/index.ts": 'Deno.env.get("SUPABASE_ONLY");',
  "lib/db.test.ts": "process.env.IN_A_TEST;",
};

describe("the read only rule takes exactly these reads, and nothing near them", () => {
  test("the four commands Why is live broken? runs pass", () => {
    for (const c of ["vercel env ls production", "stripe get /v1/webhook_endpoints -d limit=100 --live", "stripe get /v1/events -d delivery_success=false -d limit=100 --live", "stripe get /v1/webhook_endpoints -d limit=100", "stripe get /v1/events -d delivery_success=false -d limit=100"]) expect(refuseWrite(c), c).toBeNull();
  });
  test("adding, removing, pulling or decrypting values, and anything that writes to Stripe, are refused", () => {
    for (const c of ["vercel env add FOO production", "vercel env rm FOO production --yes", "vercel env pull .env.local", "vercel env ls", "vercel env ls preview", "vercel env ls production --decrypt", "vercel env ls production extra",
      "stripe post /v1/webhook_endpoints -d url=https://x", "stripe delete /v1/webhook_endpoints/we_1", "stripe trigger payment_intent.succeeded", "stripe listen --forward-to localhost:3000", "stripe login", "stripe get /v1/customers",
      "stripe get /v1/events -d type=x", "stripe get /v1/events --api-key sk_live_x", "stripe get /v1/events -d delivery_success=false; stripe login", "stripe resend evt_1", "stripe webhook_endpoints update we_1 --disabled=false", "stripe get /v1/events -d"]) {
      expect(refuseWrite(c), c).not.toBeNull();
    }
    expect(refuseWrite("vercel env add FOO")).toMatch(/only reads their names/);
    expect(refuseWrite("stripe trigger x")).toMatch(/never changes anything in Stripe/);
  });
});

describe("1. every value the code reads is in Vercel Production (E4)", () => {
  test("the values the live code reads, from the files only: tests, scripts and Supabase's own functions are left out", () => {
    const p = put(tmp(), SHOP);
    const r = envReads(p);
    expect(r.map((x) => x.name)).toEqual(["DATABASE_URL", "NEXT_PUBLIC_SITE_URL", "SENTRY_DSN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    expect(r.find((x) => x.name === "SENTRY_DSN")!.optional).toBe(true);
    expect(r.find((x) => x.name === "STRIPE_WEBHOOK_SECRET")).toMatchObject({ file: "app/api/webhooks/stripe/route.ts", line: 4, optional: false });
  });
  test("Vite, destructuring and Python reads count too", () => {
    const p = put(tmp(), {
      "src/main.ts": "const k = import.meta.env.VITE_SUPABASE_URL; const m = import.meta.env.MODE;",
      "src/server.js": "const { RESEND_KEY, PLAN = 'free', OTHER: other } = process.env;",
      "api/hook.py": 'import os\na = os.environ["OPENAI_KEY"]\nb = os.getenv("REGION", "us")\nc = os.environ.get("MAYBE")\n',
    });
    const r = Object.fromEntries(envReads(p).map((x) => [x.name, x.optional]));
    expect(r).toEqual({ VITE_SUPABASE_URL: false, RESEND_KEY: false, PLAN: true, OTHER: false, OPENAI_KEY: false, REGION: true, MAYBE: false });
  });
  test("only the names of the list are kept, never a value", () => {
    expect(parseVercelEnvNames(ENV_TABLE)).toEqual(["DATABASE_URL", "NEXT_PUBLIC_SITE_URL", "STRIPE_SECRET_KEY"]);
    expect(parseVercelEnvNames("> No Environment Variables found for acme/shop [90ms]")).toEqual([]);
    expect(parseVercelEnvNames("Error: something else")).toBeNull();
  });
  test("a value the code needs that Production lacks is named with the file and line that reads it; the fallback one is only mentioned", async () => {
    const p = put(tmp(), SHOP);
    const { t, calls } = tools({ "vercel env ls production": res({ stdout: ENV_TABLE }) });
    const part = await envPart(p, t);
    expect(calls).toEqual(["vercel env ls production"]);
    expect(part).toMatchObject({ id: "env", state: "problem", why: "missing", names: ["STRIPE_WEBHOOK_SECRET"], more: ["SENTRY_DSN"], count: 4, where: [{ name: "STRIPE_WEBHOOK_SECRET", file: "app/api/webhooks/stripe/route.ts", line: 4 }] });
    expect(JSON.stringify(part)).not.toContain("plain-value-never-kept");
  });
  test("all there: ok", async () => {
    const p = put(tmp(), SHOP);
    const { t } = tools({ "vercel env ls production": res({ stdout: ENV_TABLE.replace(" STRIPE_SECRET_KEY ", " STRIPE_WEBHOOK_SECRET Encrypted Production 1d ago\n STRIPE_SECRET_KEY ") }) });
    expect(await envPart(p, t)).toMatchObject({ state: "ok", why: "all_present", count: 4 });
  });
  test("no tool, not signed in, not linked: skipped with no command run", async () => {
    const p = put(tmp(), SHOP);
    for (const [o, why] of [[{ hasVercel: () => false }, "no_cli"], [{ vercelSignedIn: () => false }, "not_signed_in"]] as const) {
      const { t, calls } = tools({}, o);
      expect(await envPart(p, t)).toMatchObject({ state: "skipped", why });
      expect(calls).toEqual([]);
    }
    rmSync(join(p, ".vercel"), { recursive: true });
    const { t, calls } = tools({});
    expect(await envPart(p, t)).toMatchObject({ state: "skipped", why: "not_linked" });
    expect(calls).toEqual([]);
  });
  test("a login flow, a time limit, a no and an answer that cannot be read each say so, with nothing from the tool passed on", async () => {
    const p = put(tmp(), SHOP);
    const cases: [Partial<RunResult>, string, string][] = [[{ matched: true, code: null }, "skipped", "not_signed_in"], [{ timedOut: true, code: null }, "could_not", "timed_out"], [{ code: 1, stderr: "Error: team_secret_thing forbidden" }, "could_not", "said_no"], [{ stdout: "garbled" }, "could_not", "unreadable"], [{ code: 127 }, "skipped", "no_cli"]];
    for (const [r, state, why] of cases) {
      const { t } = tools({ "vercel env ls production": res(r) });
      const part = await envPart(p, t);
      expect(part).toMatchObject({ state, why });
      expect(JSON.stringify(part)).not.toContain("team_secret_thing");
    }
  });
  test("a project whose code reads no values needs nothing from Vercel", async () => {
    const { t, calls } = tools({});
    expect(await envPart(put(tmp(), { "index.html": "<h1>hi</h1>" }), t)).toMatchObject({ state: "ok", why: "none_in_code" });
    expect(calls).toEqual([]);
  });
});

const NOW = Date.parse("2026-11-14T12:00:00Z") / 1000;
const endpoints = (list: { url: string; status: string }[]) => res({ stdout: JSON.stringify({ object: "list", data: list.map((e, i) => ({ id: `we_${i}`, object: "webhook_endpoint", secret: "whsec_never_shown", ...e })) }) });
const events = (list: { type: string; ago: number; pending: number }[]) => res({ stdout: JSON.stringify({ object: "list", data: list.map((e, i) => ({ id: `evt_${i}`, type: e.type, created: Math.round(NOW - e.ago), pending_webhooks: e.pending, data: { object: { customer_email: "person@example.com" } } })) }) });
const EP = "stripe get /v1/webhook_endpoints -d limit=100 --live", EV = "stripe get /v1/events -d delivery_success=false -d limit=100 --live";

describe("2. Stripe webhook health (E3)", () => {
  test("the project's own webhook route is found from its files", () => {
    expect(stripeWebhookRoutes(put(tmp(), SHOP))).toEqual(["/api/webhooks/stripe"]);
    expect(stripeWebhookRoutes(put(tmp(), { "pages/api/stripe-webhook.ts": "import Stripe from 'stripe'" }))).toEqual(["/api/stripe-webhook"]);
  });
  test("recent events that did not reach the endpoint: a problem with how many, which kinds and when; older ones do not count", async () => {
    const p = put(tmp(), SHOP);
    const { t, calls } = tools({ [EP]: endpoints([{ url: "https://shop.example.com/api/webhooks/stripe", status: "enabled" }]), [EV]: events([{ type: "checkout.session.completed", ago: 3600, pending: 1 }, { type: "invoice.paid", ago: 7200, pending: 1 }, { type: "checkout.session.completed", ago: 9000, pending: 1 }, { type: "invoice.paid", ago: 30 * 86400, pending: 1 }]) });
    const part = await stripePart(p, t, { mode: "live", liveUrl: "https://shop.example.com" });
    expect(calls).toEqual([EP, EV]);
    for (const c of calls) expect(refuseWrite(c)).toBeNull();
    expect(part).toMatchObject({ id: "stripe", state: "problem", why: "failing", mode: "live", count: 3, names: ["checkout.session.completed", "invoice.paid"], more: ["shop.example.com/api/webhooks/stripe"], at: new Date((NOW - 3600) * 1000).toISOString() });
    expect(JSON.stringify(part)).not.toMatch(/whsec_|person@example|evt_/);
  });
  test("delivered: ok, naming the address read", async () => {
    const { t } = tools({ [EP]: endpoints([{ url: "https://shop.example.com/api/webhooks/stripe?x=secret", status: "enabled" }]), [EV]: events([]) });
    const part = await stripePart(put(tmp(), SHOP), t, { mode: "live", liveUrl: "https://shop.example.com" });
    expect(part).toMatchObject({ state: "ok", why: "delivering", count: 1, names: ["shop.example.com/api/webhooks/stripe"] });
    expect(JSON.stringify(part)).not.toContain("secret");
  });
  test("a switched off endpoint is the problem, before any event is read", async () => {
    const { t, calls } = tools({ [EP]: endpoints([{ url: "https://shop.example.com/api/webhooks/stripe", status: "disabled" }]) });
    expect(await stripePart(put(tmp(), SHOP), t, { mode: "live", liveUrl: "https://shop.example.com" })).toMatchObject({ state: "problem", why: "disabled", names: ["shop.example.com/api/webhooks/stripe"] });
    expect(calls).toEqual([EP]);
  });
  test("endpoints that point somewhere else than the live site", async () => {
    const { t } = tools({ [EP]: endpoints([{ url: "https://old-shop.vercel.app/api/hook", status: "enabled" }]) });
    expect(await stripePart(put(tmp(), SHOP), t, { mode: "live", liveUrl: "https://shop.example.com" })).toMatchObject({ state: "problem", why: "no_endpoint_here", at: "shop.example.com", names: ["old-shop.vercel.app/api/hook"] });
  });
  test("M87 review: failed events are the account's, so with two switched on endpoints none is blamed; another project's switched off one is not this one's", async () => {
    const list = [{ url: "https://shop.example.com/api/webhooks/stripe", status: "enabled" }, { url: "https://other-app.example.net/hooks", status: "enabled" }, { url: "https://third.example.org/api/stripe", status: "disabled" }];
    const { t } = tools({ [EP]: endpoints(list), [EV]: events([{ type: "invoice.paid", ago: 600, pending: 1 }]) });
    const part = await stripePart(put(tmp(), SHOP), t, { mode: "live", liveUrl: "https://shop.example.com" });
    expect(part).toMatchObject({ state: "problem", why: "failing", count: 1, names: ["invoice.paid"] });
    expect(part.more).toBeUndefined();
    // The account's one switched on endpoint, and it is this project's: it is named.
    const { t: t2 } = tools({ [EP]: endpoints([list[0]!, list[2]!]), [EV]: events([{ type: "invoice.paid", ago: 600, pending: 1 }]) });
    expect(await stripePart(put(tmp(), SHOP), t2, { mode: "live", liveUrl: "https://shop.example.com" })).toMatchObject({ why: "failing", more: ["shop.example.com/api/webhooks/stripe"] });
  });
  test("M87 review: with no live address and no path of the code's own to match, the endpoint is unknown, and nothing in the account is blamed", async () => {
    const p = put(tmp(), { "package.json": JSON.stringify({ dependencies: { stripe: "17.0.0" } }) });
    const { t, calls } = tools({ [EP]: endpoints([{ url: "https://other-app.example.net/hooks", status: "disabled" }, { url: "https://x.ngrok.app/listen", status: "enabled" }]) });
    expect(await stripePart(p, t, { mode: "live" })).toMatchObject({ state: "could_not", why: "endpoint_unknown", count: 2 });
    expect(calls).toEqual([EP]);
  });
  test("a webhook route in the code but no endpoint in Stripe", async () => {
    const { t } = tools({ [EP]: endpoints([]) });
    expect(await stripePart(put(tmp(), SHOP), t, { mode: "live" })).toMatchObject({ state: "problem", why: "no_endpoints", names: ["/api/webhooks/stripe"] });
  });
  test("test mode leaves --live off", async () => {
    const { t, calls } = tools({ "stripe get /v1/webhook_endpoints -d limit=100": endpoints([{ url: "https://shop.example.com/api/webhooks/stripe", status: "enabled" }]), "stripe get /v1/events -d delivery_success=false -d limit=100": events([]) });
    expect(await stripePart(put(tmp(), SHOP), t, { mode: "test" })).toMatchObject({ state: "ok", mode: "test" });
    expect(calls.every((c) => !c.includes("--live"))).toBe(true);
  });
  test("no Stripe in the project, no tool, not signed in, a key without the right, each skipped or said plainly", async () => {
    const { t: t0, calls: c0 } = tools({});
    expect(await stripePart(put(tmp(), { "package.json": "{}" }), t0, { mode: "live" })).toMatchObject({ state: "skipped", why: "not_used" });
    expect(c0).toEqual([]);
    const { t: t1, calls: c1 } = tools({}, { hasStripe: () => false });
    expect(await stripePart(put(tmp(), SHOP), t1, { mode: "live" })).toMatchObject({ state: "skipped", why: "no_cli" });
    expect(c1).toEqual([]);
    const { t: t2 } = tools({ [EP]: res({ code: 1, stderr: "You have not configured API keys yet. Running `stripe login` will help." }) });
    expect(await stripePart(put(tmp(), SHOP), t2, { mode: "live" })).toMatchObject({ state: "skipped", why: "not_signed_in" });
    const { t: t3 } = tools({ [EP]: res({ stdout: JSON.stringify({ error: { message: "The provided key 'rk_live_***' does not have the required permissions for this endpoint" } }) }) });
    expect(await stripePart(put(tmp(), SHOP), t3, { mode: "live" })).toMatchObject({ state: "could_not", why: "no_permission" });
  });
});

describe("3. the anonymous visit, on the live address (E1)", () => {
  const PRIVATE = { ...SHOP, "app/dashboard/page.tsx": "export default function P() { return null }", "app/login/page.tsx": "export default function L() { return null }" };
  test("the live address: typed (only a plain https address on the internet), else the last one Squibby put live", () => {
    const p = put(tmp(), PRIVATE);
    expect(liveAddress(p)).toBeNull();
    expect(liveAddress(p, "https://shop.example.com/some/page")).toBe("https://shop.example.com");
    for (const bad of ["http://shop.example.com", "https://192.168.1.1", "https://localhost:3000", "javascript:alert(1)"]) expect(liveAddress(p, bad), bad).toBeNull();
    put(p, { ".companion/ships.json": JSON.stringify([{ at: "2026-11-01", action: "live", snapshot: "s", productionUrl: "https://shop.vercel.app", gates: [], proof: "passed" }]) });
    expect(liveAddress(p)).toBe("https://shop.vercel.app");
  });
  test("a private page that opens with no sign in on the live site is the problem", async () => {
    const p = put(tmp(), PRIVATE);
    const { t, probed } = tools({}, { probe: async (url, routes) => { probed.push({ url, routes }); return { open: ["/dashboard"], signIn: [], unreachable: [] }; } });
    expect(await pagesPart(p, t, { liveUrl: "https://shop.example.com" })).toMatchObject({ state: "problem", why: "open", names: ["/dashboard"], at: "https://shop.example.com" });
    expect(probed).toEqual([{ url: "https://shop.example.com", routes: ["/dashboard"] }]);
  });
  test("M87 review: a visit that cannot run, or a site that is down, is never read as asking for a sign in", async () => {
    const PAGES2 = { ...PRIVATE, "app/settings/page.tsx": "export default function S() { return null }" };
    const at = "https://shop.example.com";
    const thrown = tools({}, { probe: async () => { throw new Error("proxy did not start"); } });
    expect(await pagesPart(put(tmp(), PAGES2), thrown.t, { liveUrl: at })).toMatchObject({ state: "could_not", why: "unreachable", names: ["/settings", "/dashboard"], count: 2 });
    const down = tools({}, { probe: async (_u, routes): Promise<PageVisit> => ({ open: [], signIn: [], unreachable: [...routes] }) });
    expect(await pagesPart(put(tmp(), PAGES2), down.t, { liveUrl: at })).toMatchObject({ state: "could_not", why: "unreachable", names: ["/settings", "/dashboard"] });
    // A probe that answers for only some routes: the rest are not reached, never fine.
    const some = tools({}, { probe: async (): Promise<PageVisit> => ({ open: [], signIn: ["/dashboard"], unreachable: [] }) });
    expect(await pagesPart(put(tmp(), PAGES2), some.t, { liveUrl: at })).toMatchObject({ state: "could_not", why: "unreachable", names: ["/settings"], more: ["/dashboard"] });
    const openAndDown = tools({}, { probe: async (): Promise<PageVisit> => ({ open: ["/dashboard"], signIn: [], unreachable: ["/settings"] }) });
    expect(await pagesPart(put(tmp(), PAGES2), openAndDown.t, { liveUrl: at })).toMatchObject({ state: "problem", why: "open", names: ["/dashboard"], more: ["/settings"] });
    const fine = tools({});
    expect(await pagesPart(put(tmp(), PAGES2), fine.t, { liveUrl: at })).toMatchObject({ state: "ok", why: "all_need_sign_in", names: ["/settings", "/dashboard"] });
  });
  test("M87 review: the real visit sorts each page: 500 and no answer are unreachable, 401 asks for a sign in", async () => {
    expect(await visitWithoutSignIn("https://10.0.0.1", ["/dashboard"])).toEqual({ open: [], signIn: [], unreachable: ["/dashboard"] });
    if (!browserInstalled()) return;
    const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (r) => {
      const path = new URL(r.url).pathname;
      if (path === "/dashboard") return new Response("<h1>Server error</h1>", { status: 500, headers: { "content-type": "text/html" } });
      if (path === "/settings") return new Response("<h1>Please sign in</h1>", { status: 401, headers: { "content-type": "text/html" } });
      return new Response("<h1>Your account: 3 orders</h1>", { headers: { "content-type": "text/html" } });
    } });
    try {
      const v = await visitWithoutSignIn(`http://127.0.0.1:${srv.port}/`, ["/dashboard", "/settings", "/account"], { timeoutMs: 8000 });
      expect(v).toEqual({ open: ["/account"], signIn: ["/settings"], unreachable: ["/dashboard"] });
    } finally { srv.stop(true); }
    const gone = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("x") });
    const port = gone.port; gone.stop(true);
    expect(await visitWithoutSignIn(`http://127.0.0.1:${port}/`, ["/dashboard"], { timeoutMs: 4000 })).toEqual({ open: [], signIn: [], unreachable: ["/dashboard"] });
  }, 60_000);
  test("no address, no private pages, no hidden browser: skipped, and nothing is opened", async () => {
    const { t, probed } = tools({});
    expect(await pagesPart(put(tmp(), PRIVATE), t, { liveUrl: null })).toMatchObject({ state: "skipped", why: "no_address", names: ["/dashboard"] });
    expect(await pagesPart(put(tmp(), { "index.html": "x" }), t, { liveUrl: "https://shop.example.com" })).toMatchObject({ state: "skipped", why: "no_private_pages" });
    const { t: t2 } = tools({}, { browserReady: () => false });
    expect(await pagesPart(put(tmp(), PRIVATE), t2, { liveUrl: "https://shop.example.com" })).toMatchObject({ state: "skipped", why: "no_browser" });
    expect(probed).toEqual([]);
  });
  test("the visit never opens an address on this Mac's network or a plain http one from the internet", async () => {
    for (const u of ["https://10.0.0.1", "https://192.168.1.1", "http://shop.example.com", "https://user:pw@shop.example.com"]) expect(await openWithoutSignIn(u, ["/dashboard"]), u).toEqual([]);
  });
});

describe("4. the database (E2)", () => {
  test("a Supabase table without row security is the problem, in the row security check's own words", async () => {
    const p = put(tmp(), { "supabase/migrations/1_init.sql": "create table notes (id int);" });
    expect(await databasePart(p)).toMatchObject({ id: "database", state: "problem", why: "open", names: ["notes"] });
    expect(await databasePart(put(tmp(), { "index.html": "x" }))).toMatchObject({ state: "skipped", why: "not_used" });
  });
});

describe("all four, and the engine", () => {
  test("the parts come in order, each told as it finishes", async () => {
    const p = put(tmp(), SHOP);
    const { t } = tools({ "vercel env ls production": res({ stdout: ENV_TABLE }), [EP]: endpoints([]) });
    const seen: string[] = [];
    const r = await whyLiveBroken({ project: p, tools: t, stripeMode: "live", onPart: (x) => seen.push(x.id) });
    expect(seen).toEqual(["env", "stripe", "pages", "database"]);
    // SHOP has a supabase/ folder and no migrations or live connection, so the database part cannot be sure.
    expect(r.parts.map((x) => x.state)).toEqual(["problem", "problem", "skipped", "could_not"]);
  });
  function runner(liveTools?: Tools) {
    const events: Event[] = [];
    const tmpS = tmp();
    const r = new AgentRunner({ shadowRoot: tmpS, engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ...(liveTools ? { liveTools } : {}) });
    return { r, events };
  }
  test("ship.whyLive: running, then done, every event a valid protocol line, and nothing written to the project", async () => {
    const p = put(tmp(), SHOP);
    const { t, calls } = tools({ "vercel env ls production": res({ stdout: ENV_TABLE }), [EP]: endpoints([{ url: "https://shop.example.com/api/webhooks/stripe", status: "enabled" }]), [EV]: events([]) });
    const { r, events: ev } = runner(t);
    await r.handle({ v: 1, id: "w1", type: "ship.whyLive", project: p, url: "https://shop.example.com" } as never);
    const mine = ev.filter((e) => e.type === "ship.whyLive") as any[];
    expect(mine[0]).toMatchObject({ stage: "running", parts: [] });
    expect(mine.at(-1)).toMatchObject({ stage: "done", liveUrl: "https://shop.example.com" });
    expect(mine.at(-1).parts.map((x: any) => `${x.id}:${x.why}`)).toEqual(["env:missing", "stripe:delivering", "pages:no_private_pages", "database:unsure"]);
    for (const e of mine) expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...e })).ok, JSON.stringify(e)).toBe(true);
    for (const c of calls) expect(refuseWrite(c)).toBeNull();
    expect(() => readFileSync(join(p, ".companion", "ships.json"))).toThrow();
  });
  test("Stop everything ends it, and says stopped", async () => {
    const p = put(tmp(), SHOP);
    let release: () => void = () => {};
    const { t } = tools({ "vercel env ls production": () => res({ stdout: ENV_TABLE }) });
    const slow: Tools = { ...t, run: (c, o) => new Promise((ok) => { release = () => ok(res({ aborted: true, code: null })); o.signal?.addEventListener("abort", () => release(), { once: true }); }) };
    const { r, events: ev } = runner(slow);
    const going = r.handle({ v: 1, id: "w2", type: "ship.whyLive", project: p } as never);
    await new Promise((ok) => setTimeout(ok, 20));
    await r.handle({ v: 1, id: "s", type: "agent.interruptAll" } as never);
    await going;
    expect((ev.filter((e) => e.type === "ship.whyLive") as any[]).at(-1)).toMatchObject({ stage: "stopped" });
  });
  test("without the tools wired in, it ends with a reason code the page words, never an English line from the engine", async () => {
    // M87 review (rule 21): this expectation changed on purpose. It was an English error line and no ship.whyLive event,
    // which left the panel waiting forever.
    const { r, events: ev } = runner();
    await r.handle({ v: 1, id: "w3", type: "ship.whyLive", project: tmp() } as never);
    const mine = ev.filter((e) => e.type === "ship.whyLive") as any[];
    expect(mine).toEqual([expect.objectContaining({ stage: "done", parts: [], reason: "not_set_up" })]);
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...mine[0] })).ok).toBe(true);
    expect(JSON.stringify(ev)).not.toContain("not set up on this Mac");
  });
  test("M87 review: an internal break ends as done, with the parts so far and the step that broke as failed, never as stopped", async () => {
    const p = put(tmp(), SHOP);
    const { t } = tools({ "vercel env ls production": res({ stdout: ENV_TABLE }) });
    const events: Event[] = [];
    let thrown = false;
    const r = new AgentRunner({ shadowRoot: tmp(), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), liveTools: t,
      emit: (e) => { if (!thrown && e.type === "ship.whyLive" && (e as any).parts.length === 1) { thrown = true; throw new Error("boom"); } events.push(e); } });
    await r.handle({ v: 1, id: "w4", type: "ship.whyLive", project: p } as never);
    const last = (events.filter((e) => e.type === "ship.whyLive") as any[]).at(-1);
    expect(last).toMatchObject({ stage: "done" });
    expect(last.parts.map((x: any) => `${x.id}:${x.why}`)).toEqual(["env:missing", "stripe:failed"]);
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...last })).ok).toBe(true);
  });
  test("the protocol takes the fixtures and refuses a part it does not know", () => {
    const lines = readFileSync(join(import.meta.dir, "../../protocol/fixtures/events.jsonl"), "utf8").split("\n").filter((l) => l.includes('"ship.whyLive"'));
    expect(lines.length).toBe(5);   // M87 review added m87e4 (not_set_up) and m87e5 (unreachable, endpoint_unknown, failed)
    for (const l of lines) expect(parseEvent(l).ok, l).toBe(true);
    const bad = (parts: unknown) => parseEvent(JSON.stringify({ v: 1, id: "b", type: "ship.whyLive", project: "p", stage: "done", parts })).ok;
    expect(bad([{ id: "cookies", state: "ok", why: "all_present" }])).toBe(false);
    expect(bad([{ id: "env", state: "fine", why: "all_present" }])).toBe(false);
    expect(bad([{ id: "env", state: "ok", why: "delivering" }])).toBe(false);
    expect(bad([{ id: "env", state: "ok", why: "all_present" }, { id: "env", state: "ok", why: "all_present" }])).toBe(false);
    expect(parseCommand(JSON.stringify({ v: 1, id: "c", type: "ship.whyLive", project: "p", url: "http://x.com" })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ v: 1, id: "c", type: "ship.whyLive", project: "p", url: "https://x.com" })).ok).toBe(true);
  });
});
