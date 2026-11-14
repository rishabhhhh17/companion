// M92 (B): the real test kit. docs/outreach/demo-project/make-real-test-kit.sh writes a throwaway app wired for Supabase,
// Vercel and Stripe, for a guided session on the founder's own free accounts (docs/milestones/M92-real-test-kit.md). These
// tests make it in a temporary folder with no network: only files are written, and a stand in for every tool that could
// reach the network, git or an account leaves a mark if it runs. Then Squibby's own checks are run on it (offline, with
// fixture tool answers) to hold that each planned hole is one Squibby really finds: the expected results in the guide.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RunResult } from "../src/proof/exec.ts";
import { analyzeMigrations, detectSupabase, rlsGate } from "../src/ship/rls.ts";
import { envReads, stripeWebhookRoutes, whyLiveBroken, type Tools } from "../src/ship/livecheck.ts";
import { privateRoutes } from "../src/proof/privatepages.ts";
import { liveCommand } from "../src/livesystems.ts";
import { S } from "../../app/src/strings.ts";

const here = dirname(new URL(import.meta.url).pathname);
const SCRIPT = join(here, "../../docs/outreach/demo-project/make-real-test-kit.sh");
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (n: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), n))); made.push(d); return d; };

const NEVER = ["git", "curl", "wget", "npm", "npx", "bun", "bunx", "node", "supabase", "vercel", "stripe", "brew", "open", "security", "psql"];
function make(args: string[]) {
  const d = tmp("m92-trip-");
  const bin = join(d, "bin"); mkdirSync(bin);
  const marks = join(d, "marks");
  for (const t of NEVER) { const f = join(bin, t); writeFileSync(f, `#!/bin/sh\necho ${t} >> '${marks}'\nexit 97\n`); chmodSync(f, 0o755); }
  const p = Bun.spawnSync(["sh", SCRIPT, ...args], { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: d }, stdin: "ignore" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString(), ran: existsSync(marks) ? readFileSync(marks, "utf8").trim() : "" };
}

let kit = "";
function theKit(): string {
  if (kit) return kit;
  const parent = tmp("m92-kit-");
  const r = make([join(parent, "squibby-real-kit")]);
  expect(r.code).toBe(0);
  expect(r.ran).toBe("");
  kit = join(parent, "squibby-real-kit");
  return kit;
}
const read = (f: string) => readFileSync(join(theKit(), f), "utf8");

const res = (o: Partial<RunResult>): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const NOW = Date.parse("2026-11-20T12:00:00Z") / 1000;
const GUIDE = join(here, "../../docs/milestones/M92-real-test-kit.md");

/** Step 9's expected lines in the guide, as part title -> the quoted sentence. */
function step9Lines(): Record<string, string> {
  const g = readFileSync(GUIDE, "utf8");
  const block = g.slice(g.indexOf("**Step 9."), g.indexOf("**Step 10."));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^- ([^:]+): "([^"]+)"/gm)) out[m[1]!] = m[2]!;
  return out;
}

describe("make-real-test-kit.sh", () => {
  test("refuses with no folder, or a folder that already exists, and writes nothing", () => {
    const none = make([]);
    expect(none.code).not.toBe(0);
    expect(none.out).toContain("give a folder");
    const d = tmp("m92-there-");
    writeFileSync(join(d, "keep.txt"), "mine\n");
    const there = make([d]);
    expect(there.code).not.toBe(0);
    expect(there.out).toContain("already exists");
    expect(readdirSync(d)).toEqual(["keep.txt"]);
  });

  test("writes only inside the folder it is given, runs no tool, and says what to do next", () => {
    const parent = tmp("m92-only-");
    const r = make([join(parent, "kit")]);
    expect(r.code).toBe(0);
    expect(r.ran).toBe("");
    expect(readdirSync(parent)).toEqual(["kit"]);
    expect(r.out).toContain("M92-real-test-kit.md");
    const files = Bun.spawnSync(["find", ".", "-type", "f"], { cwd: join(parent, "kit") }).stdout.toString().trim().split("\n").map((f) => f.slice(2)).sort();
    expect(files).toEqual([".env.example", ".gitignore", "KIT.json", "README.md", "api/notes.js", "api/signup.js", "api/webhooks/stripe.js", "lib/stripe-signature.js", "package.json", "public/admin/index.html", "public/index.html", "public/login.html", "supabase/migrations/20261114000000_kit.sql", "vercel.json"]);
  });

  test("holds no secret and no account: every value is left for the founder to set in their own tools", () => {
    for (const f of [".env.example", "api/notes.js", "api/signup.js", "api/webhooks/stripe.js", "README.md", "KIT.json", "vercel.json"]) {
      expect(read(f), f).not.toMatch(/sk_(live|test)_[A-Za-z0-9]|whsec_[A-Za-z0-9]{8}|eyJ[A-Za-z0-9_-]{20}|sb_(secret|publishable)_[A-Za-z0-9]/);
    }
    expect(read(".env.example")).toMatch(/^SUPABASE_URL=$/m);
    expect(read(".gitignore")).toContain(".env");
    expect(JSON.parse(read("package.json")).dependencies ?? {}).toEqual({});   // nothing to install, nothing fetched
  });
});

describe("each planned hole is one Squibby finds (the expected results in the guide)", () => {
  test("the database: notes has row level security, signups is left open on purpose and is the only finding", async () => {
    const p = theKit();
    const kitJson = JSON.parse(read("KIT.json"));
    expect(kitJson).toMatchObject({ openTable: "signups", protectedTable: "notes", missingInVercel: "STRIPE_WEBHOOK_SECRET", openPage: "/admin", webhookPath: "/api/webhooks/stripe" });
    expect(detectSupabase(p)).toBe(true);
    const a = analyzeMigrations({ "20261114000000_kit.sql": read("supabase/migrations/20261114000000_kit.sql") });
    expect(a.tables.sort()).toEqual(["notes", "signups"]);
    expect(a.withoutRls).toEqual(["signups"]);
    const g = await rlsGate({ project: p });
    expect(g.status).toBe("blocked");
    expect(g.places?.map((x) => x.table)).toEqual(["signups"]);
    expect(g.places?.[0]?.file).toBe("supabase/migrations/20261114000000_kit.sql");
  });

  test("the settings: the live code reads three values, the webhook secret among them, none with a fallback", () => {
    const r = envReads(theKit());
    expect(r.map((x) => x.name)).toEqual(["STRIPE_WEBHOOK_SECRET", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL"]);
    expect(r.every((x) => !x.optional)).toBe(true);
    expect(r.find((x) => x.name === "STRIPE_WEBHOOK_SECRET")).toMatchObject({ file: "api/webhooks/stripe.js", line: 19 });   // the line step 9 names
  });

  test("the webhook route and the private looking page are found", () => {
    expect(stripeWebhookRoutes(theKit())).toEqual(["/api/webhooks/stripe"]);
    expect(privateRoutes(theKit())).toEqual(["/admin"]);
  });

  test("Why is live broken? on the kit, with the answers the real tools should give, says all four parts as the guide does", async () => {
    const p = theKit();
    mkdirSync(join(p, ".vercel"), { recursive: true });
    writeFileSync(join(p, ".vercel/project.json"), JSON.stringify({ orgId: "team_x", projectId: "prj_x" }));   // what vercel link writes
    const envTable = `Vercel CLI 48.0.0\n> Environment Variables found for me/squibby-real-kit [180ms]\n\n name                        value      environments   created\n SUPABASE_URL                Encrypted  Production     1m ago\n SUPABASE_PUBLISHABLE_KEY    Encrypted  Production     1m ago\n`;
    const answers: Record<string, RunResult> = {
      "vercel env ls production": res({ stdout: envTable }),
      "stripe get /v1/webhook_endpoints -d limit=100": res({ stdout: JSON.stringify({ object: "list", data: [{ id: "we_1", url: "https://squibby-real-kit.vercel.app/api/webhooks/stripe", status: "enabled" }] }) }),
      "stripe get /v1/events -d delivery_success=false -d limit=100": res({ stdout: JSON.stringify({ object: "list", data: [{ id: "evt_1", type: "checkout.session.completed", created: NOW - 600, pending_webhooks: 1 }] }) }),
    };
    const calls: string[] = [];
    const tools: Tools = {
      run: async (c) => { calls.push(c); const a = answers[c]; if (!a) throw new Error(`unexpected command: ${c}`); return a; },
      hasVercel: () => true, vercelSignedIn: () => true, hasStripe: () => true, browserReady: () => true,
      probe: async (_url, routes) => ({ open: [...routes], signIn: [], unreachable: [] }),
      now: () => new Date(NOW * 1000),
    };
    const r = await whyLiveBroken({ project: p, tools, stripeMode: "test", typedUrl: "https://squibby-real-kit.vercel.app" });
    const by = Object.fromEntries(r.parts.map((x) => [x.id, x]));
    expect(by.env).toMatchObject({ state: "problem", why: "missing", names: ["STRIPE_WEBHOOK_SECRET"] });
    // M92 review: more is the endpoint address step 9's Stripe sentence prints; without it the line falls back to
    // "to your Stripe account's webhook endpoints" and step 9 would not match.
    expect(by.stripe).toMatchObject({ state: "problem", why: "failing", count: 1, names: ["checkout.session.completed"], more: ["squibby-real-kit.vercel.app/api/webhooks/stripe"] });
    expect(by.pages).toMatchObject({ state: "problem", why: "open", names: ["/admin"] });
    expect(by.database).toMatchObject({ state: "problem", why: "open" });
    expect(calls.every((c) => !c.includes("--live"))).toBe(true);   // test mode, as the guide sets it

    // Each part, said through the pages' own sentences (strings.ts), starts with the line step 9 promises, word for word.
    const want = step9Lines();
    expect(Object.keys(want).sort()).toEqual(["env", "stripe", "pages", "database"].map((id) => S.whyLive.parts[id]!).sort());
    for (const id of ["env", "stripe", "pages", "database"] as const) {
      const part = by[id]!;
      const said = S.whyLive.say[id][part.why]!(part as Parameters<(typeof S.whyLive.say)["env"][string]>[0]).line;
      expect(said.startsWith(want[S.whyLive.parts[id]!]!)).toBe(true);
    }
    expect(S.whyLive.problems(r.parts.filter((x) => x.state === "problem").length)).toBe("4 things look broken.");
    expect(S.whyLive.at("api/webhooks/stripe.js", 19)).toBe("api/webhooks/stripe.js, line 19");
  });

  test("ask before live systems: supabase db reset against the linked project asks; the local one does not", () => {
    expect(liveCommand("supabase db reset --linked", theKit())).toBe("This resets your live Supabase database: all its data is deleted. A saved copy on this Mac can't bring it back.");
    expect(liveCommand("supabase db reset", theKit())).toBeNull();
  });
});

describe("the kit's own code works offline", () => {
  const sign = (body: string, secret: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

  test("the Stripe signature check takes Stripe's own scheme and nothing else", async () => {
    const { verifyStripeSignature } = await import(join(theKit(), "lib/stripe-signature.js"));
    const body = '{"type":"checkout.session.completed"}', secret = "whsec_test_stand_in", t = 1_800_000_000;
    expect(verifyStripeSignature(body, sign(body, secret, t), secret, t)).toBe(true);
    expect(verifyStripeSignature(body, `v0=abc,${sign(body, secret, t)}`, secret, t + 10)).toBe(true);
    expect(verifyStripeSignature(body + " ", sign(body, secret, t), secret, t)).toBe(false);          // body changed
    expect(verifyStripeSignature(body, sign(body, "whsec_other", t), secret, t)).toBe(false);         // another secret
    expect(verifyStripeSignature(body, sign(body, secret, t), secret, t + 301)).toBe(false);          // too old
    expect(verifyStripeSignature(body, "", secret, t)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, secret, t), "", t)).toBe(false);
  });

  test("the webhook answers 500 with a plain reason while its secret is missing, which is what Stripe will see", async () => {
    const { respond } = await import(join(theKit(), "api/webhooks/stripe.js"));
    const body = "{}", t = 1_800_000_000;
    expect(respond({ method: "POST", secret: undefined, header: "t=1,v1=x", body, now: t })).toEqual({ status: 500, json: { error: "STRIPE_WEBHOOK_SECRET is not set on this server" } });
    expect(respond({ method: "GET", secret: "s", header: "", body, now: t }).status).toBe(405);
    expect(respond({ method: "POST", secret: "s", header: "t=1,v1=x", body, now: t }).status).toBe(400);
    expect(respond({ method: "POST", secret: "s", header: sign(body, "s", t), body, now: t })).toEqual({ status: 200, json: { received: true } });
  });
});
