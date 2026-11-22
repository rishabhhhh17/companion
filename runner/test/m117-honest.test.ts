// M117 review fixes: the check never says all clear about a route, form or fines gap that is really there, and never cries
// wolf on a route a limiter really covers. Each test here failed before its fix. Pure: files in memory only, no model.
import { describe, expect, test } from "bun:test";
import { moneyReportOk, type MoneyReport } from "../../protocol/index.ts";
import { moneyCheck } from "../src/money/check.ts";
import { runGates } from "../src/ship/gates.ts";

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps });
const kinds = (files: Record<string, string>) => moneyCheck(files).findings.map((f) => f.kind);
const paidAt = (files: Record<string, string>) => moneyCheck(files).findings.filter((f) => f.kind === "paid_route_open").map((f) => f.path);
const AI_HANDLER = `async (req, res) => {\n  const out = await ai.chat.completions.create({});\n  res.json(out);\n}`;

describe("1: a limiter package imported is not a limit on every route in the file", () => {
  const head = `const express = require("express");\nconst OpenAI = require("openai");\nconst ai = new OpenAI();\nconst app = express();\n`;
  test("express-rate-limit required and never used: the AI route is flagged", () => {
    expect(paidAt({ "package.json": pkg({ express: "4", openai: "4", "express-rate-limit": "7" }), "server.js": `${head}const rateLimit = require("express-rate-limit");\napp.post("/api/chat", ${AI_HANDLER});\n` })).toEqual(["/api/chat"]);
  });
  test("a limiter on /login only: /api/chat is flagged, the limited one is not", () => {
    const files = { "package.json": pkg({ express: "4", openai: "4", "express-rate-limit": "7" }), "server.js": `${head}const rateLimit = require("express-rate-limit");\nconst limiter = rateLimit({ max: 5 });\napp.use("/login", limiter);\napp.post("/api/chat", ${AI_HANDLER});\napp.post("/login/ai", ${AI_HANDLER});\n` };
    expect(paidAt(files)).toEqual(["/api/chat"]);
  });
  test("a limiter passed to the route's own call limits that route only", () => {
    const files = { "package.json": pkg({ express: "4", openai: "4", "express-rate-limit": "7" }), "server.js": `${head}const rateLimit = require("express-rate-limit");\nconst limiter = rateLimit({ max: 5 });\napp.post("/api/a", limiter, ${AI_HANDLER});\napp.post("/api/b", ${AI_HANDLER});\n` };
    expect(paidAt(files)).toEqual(["/api/b"]);
  });
  test("a limiter used inside the handler (rate-limiter-flexible's consume) limits that route", () => {
    const files = { "package.json": pkg({ express: "4", openai: "4" }), "server.js": `${head}const { RateLimiterMemory } = require("rate-limiter-flexible");\nconst rl = new RateLimiterMemory({ points: 5 });\napp.post("/api/a", async (req, res) => {\n  await rl.consume(req.ip);\n  res.json(await ai.chat.completions.create({}));\n});\napp.post("/api/b", ${AI_HANDLER});\n` };
    expect(paidAt(files)).toEqual(["/api/b"]);
  });
  test("app.use(limiter) with no path still limits every route", () => {
    expect(paidAt({ "package.json": pkg({ express: "4", openai: "4" }), "server.js": `${head}const rateLimit = require("express-rate-limit");\napp.use(rateLimit({ max: 5 }));\napp.post("/api/chat", ${AI_HANDLER});\n` })).toEqual([]);
  });
  const py = (body: string) => ({ "requirements.txt": "flask\nflask-limiter\nopenai\n", "app.py": `from flask import Flask\nfrom flask_limiter import Limiter\nfrom openai import OpenAI\napp = Flask(__name__)\nlimiter = Limiter(app)\nai = OpenAI()\n${body}` });
  test("Flask: @limiter.limit on /login only: /chat is flagged", () => {
    expect(paidAt(py(`@app.route("/login", methods=["POST"])\n@limiter.limit("5 per minute")\ndef login():\n    return ai.x()\n\n@app.route("/chat", methods=["POST"])\ndef chat():\n    return ai.x()\n`))).toEqual(["/chat"]);
  });
  test("Flask: default_limits still limits every route", () => {
    expect(paidAt({ ...py(`@app.route("/chat", methods=["POST"])\ndef chat():\n    return ai.x()\n`), "app.py": `from flask import Flask\nfrom flask_limiter import Limiter\nfrom openai import OpenAI\napp = Flask(__name__)\nlimiter = Limiter(app, default_limits=["100 per day"])\n@app.route("/chat", methods=["POST"])\ndef chat():\n    return 1\n` })).toEqual([]);
  });
});

describe("2: the word limiter is not a limit", () => {
  test("a route that imports a helper holding new Ratelimit() and never calls its limit is flagged", () => {
    const files = {
      "package.json": pkg({ next: "15", openai: "4", "@upstash/ratelimit": "2" }),
      "lib/ratelimit.ts": `import { Ratelimit } from "@upstash/ratelimit";\nexport const ratelimit = new Ratelimit({});\n`,
      "app/api/chat/route.ts": `import OpenAI from "openai";\nimport { ratelimit } from "@/lib/ratelimit";\nconst limiter = null;\nexport async function POST() {\n  return new Response("x");\n}\n`,
    };
    expect(paidAt(files)).toEqual(["/api/chat"]);
  });
  test("the same route calling ratelimit.limit() is limited", () => {
    const files = {
      "package.json": pkg({ next: "15", openai: "4", "@upstash/ratelimit": "2" }),
      "lib/ratelimit.ts": `import { Ratelimit } from "@upstash/ratelimit";\nexport const ratelimit = new Ratelimit({});\n`,
      "app/api/chat/route.ts": `import OpenAI from "openai";\nimport { ratelimit } from "@/lib/ratelimit";\nexport async function POST() {\n  await ratelimit.limit("ip");\n  return new Response("x");\n}\n`,
    };
    expect(paidAt(files)).toEqual([]);
  });
});

describe("3: checking input is not checking a webhook's sender", () => {
  const route = (body: string) => ({ "package.json": pkg({ next: "15", openai: "4" }), "app/api/chat/route.ts": `import OpenAI from "openai";\nexport async function POST(req: Request) {\n${body}\n  return new Response("x");\n}\n` });
  test("validateRequest(body) is not a webhook", () => expect(paidAt(route(`  validateRequest(await req.json());`))).toEqual(["/api/chat"]));
  test("reading an x-signature header alone is not a webhook", () => expect(paidAt(route(`  const sig = req.headers.get("x-signature");`))).toEqual(["/api/chat"]));
  test("a header with an HMAC compare is a webhook; Stripe's constructEvent is; Twilio's validateRequest is", () => {
    expect(paidAt(route(`  const sig = req.headers.get("x-signature");\n  if (!crypto.timingSafeEqual(a, b)) return new Response("no", { status: 401 });`))).toEqual([]);
    expect(paidAt(route(`  stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature"), secret);`))).toEqual([]);
    expect(paidAt({ ...route(`  twilio.validateRequest(token, sig, url, params);`), "app/api/chat/route.ts": `import OpenAI from "openai";\nimport twilio from "twilio";\nexport async function POST(req: Request) {\n  twilio.validateRequest(token, sig, url, params);\n}\n` })).toEqual([]);
  });
});

describe("4: an app with its own sign in has accounts", () => {
  test("bcrypt sign up and log in routes: accounts, and the privacy and delete rules apply", () => {
    const files = {
      "package.json": pkg({ express: "4", bcrypt: "5" }),
      "server.js": `const express = require("express");\nconst bcrypt = require("bcrypt");\nconst app = express();\napp.post("/signup", async (req, res) => { await bcrypt.hash(req.body.password, 10); });\napp.post("/login", async (req, res) => { await bcrypt.compare(req.body.password, h); });\n`,
    };
    const r = moneyCheck(files);
    expect(r.accounts).toBe(true);
    expect(r.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["auth_open", "no_privacy_page", "no_delete_account"]));
  });
  test("a page form with a password field: accounts", () => {
    expect(moneyCheck({ "src/Login.jsx": `export default () => <form onSubmit={go}><input type="password" name="pw" /></form>;\n` }).accounts).toBe(true);
  });
});

describe("6: a code helper named privacy is not a privacy page", () => {
  test("lib/privacy.ts in a Clerk app: no_privacy_page is still said", () => {
    expect(kinds({ "package.json": pkg({ next: "15", "@clerk/nextjs": "6" }), "lib/privacy.ts": `export const mask = (s: string) => s;\n` })).toContain("no_privacy_page");
  });
  test("a real page still counts: app/privacy/page.tsx, privacy.md, public/privacy.html", () => {
    for (const f of ["app/privacy/page.tsx", "content/privacy.md", "public/privacy.html", "src/routes/privacy/+page.svelte"]) expect(kinds({ "package.json": pkg({ next: "15", "@clerk/nextjs": "6" }), [f]: "Privacy" }), f).not.toContain("no_privacy_page");
  });
});

describe("7: a consent check counts only for cookies, and only where the tracker starts", () => {
  const ga = `export default function L() {\n  return <script>{gtag("config", "G-1")}</script>;\n}\n`;
  test("if (!termsConsent) on a sign up form does not consent Google Analytics", () => {
    expect(kinds({ "app/layout.tsx": ga, "app/signup/page.tsx": `export default () => { if (!termsConsent) return null; return null; };\n` })).toContain("tracker_no_consent");
  });
  test("a variable named consentMode or defaultConsent elsewhere does not count", () => {
    expect(kinds({ "app/layout.tsx": ga, "lib/x.ts": `export const consentMode = 1;\nexport const defaultConsent = 2;\n` })).toContain("tracker_no_consent");
  });
  test("a cookie consent check in the tracker's own file counts", () => {
    expect(kinds({ "app/layout.tsx": `export default function L() {\n  if (cookieConsent) gtag("config", "G-1");\n  return null;\n}\n` })).not.toContain("tracker_no_consent");
  });
  test("a cookie consent check in another file does not", () => {
    expect(kinds({ "app/layout.tsx": ga, "lib/c.ts": `export function go() { if (cookieConsent) start(); }\n` })).toContain("tracker_no_consent");
  });
});

describe("8: projects in a subfolder", () => {
  test("a Next app in apps/web: its AI route is found and flagged", () => {
    const r = moneyCheck({ "package.json": pkg({ turbo: "2" }), "apps/web/package.json": pkg({ next: "15", openai: "4" }), "apps/web/app/api/chat/route.ts": `import OpenAI from "openai";\nexport async function POST() {}\n` });
    expect(r.findings.filter((f) => f.kind === "paid_route_open").map((f) => [f.file, f.path])).toEqual([["apps/web/app/api/chat/route.ts", "/api/chat"]]);
  });
  test("its middleware in apps/web limits it", () => {
    expect(paidAt({
      "apps/web/package.json": pkg({ next: "15", openai: "4" }), "apps/web/app/api/chat/route.ts": `import OpenAI from "openai";\nexport async function POST() {}\n`,
      "apps/web/middleware.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport async function middleware() { await rl.limit("x"); }\nexport const config = { matcher: ["/api/:path*"] };\n`,
    })).toEqual([]);
  });
  test("a SvelteKit app and Supabase functions in a subfolder", () => {
    expect(paidAt({ "web/package.json": pkg({ "@sveltejs/kit": "2" }), "web/src/routes/api/chat/+server.ts": `import OpenAI from "openai";\nexport async function POST() {}\n` })).toEqual(["/api/chat"]);
    expect(paidAt({ "backend/supabase/functions/chat/index.ts": `import OpenAI from "npm:openai";\nDeno.serve(async () => new Response("x"));\n` })).toEqual(["/functions/v1/chat"]);
  });
});

describe("11: signed in settings forms are not public", () => {
  const form = `<form onSubmit={save}><input type="email" name="email" /></form>`;
  test("a dashboard settings page that checks auth() is not flagged", () => {
    expect(kinds({ "app/(dashboard)/settings/page.tsx": `import { auth } from "@/auth";\nexport default async function P() {\n  const s = await auth();\n  if (!s) redirect("/login");\n  return ${form};\n}\n` })).not.toContain("form_open");
  });
  test("a page under account/ is not flagged; useSession is a signed in page", () => {
    expect(kinds({ "app/account/page.tsx": `export default () => ${form};\n` })).not.toContain("form_open");
    expect(kinds({ "app/profile/page.tsx": `const { data } = useSession();\nexport default () => ${form};\n` })).not.toContain("form_open");
  });
  test("a public page with the same form is still flagged; a signed in waitlist named form still is", () => {
    expect(kinds({ "app/page.tsx": `export default () => ${form};\n` })).toContain("form_open");
    expect(kinds({ "app/dashboard/waitlist/page.tsx": `export default () => ${form};\n` })).toContain("form_open");
  });
});

describe("12: one odd file name never throws away the whole part", () => {
  const AI = `import OpenAI from "openai";\nexport async function POST() {}\n`;
  test("a path over 400 characters, or with a tab in its name: the report keeps its shape, the odd file counts as unreadable", () => {
    const long = `app/api/${"x".repeat(420)}/route.ts`;
    for (const odd of [long, "app/api/a\tb/route.ts", "lib/a\tb.ts"]) {
      const r = moneyCheck({ "package.json": pkg({ next: "15", openai: "4" }), "app/api/chat/route.ts": AI, [odd]: AI });
      expect(moneyReportOk(r), odd).toBe(true);
      expect(r.findings.some((f) => f.file === "app/api/chat/route.ts")).toBe(true);
      expect(r.unsure.some((u) => u.why === "unreadable")).toBe(true);
    }
  });
  test("runGates never hands on a money part of the wrong shape", async () => {
    const bad = { findings: [{ kind: "paid_route_open", file: "a\tb" }], paid: [], unsure: [], seen: [], accounts: false } as unknown as MoneyReport;
    const r = await runGates({ project: "/nonexistent-companion-m117", money: { check: () => bad } });
    expect(moneyReportOk(r.money)).toBe(true);
    expect((r.money as MoneyReport).unsure.map((u) => u.why)).toEqual(["check_failed", "check_failed", "check_failed", "check_failed"]);
  });
});

describe("a limiter inside an if on the path", () => {
  test("middleware with no config that limits only under /login is could not check, never all limited", () => {
    const r = moneyCheck({
      "package.json": pkg({ next: "15", openai: "4" }), "app/api/chat/route.ts": `import OpenAI from "openai";\nexport async function POST() {}\n`,
      "middleware.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport async function middleware(req) {\n  if (req.nextUrl.pathname.startsWith("/login")) await rl.limit("x");\n}\n`,
    });
    expect(r.findings.filter((f) => f.kind === "paid_route_open")).toEqual([]);
    expect(r.unsure.some((u) => u.family === "rate" && u.why === "matcher_not_text")).toBe(true);
  });
});
