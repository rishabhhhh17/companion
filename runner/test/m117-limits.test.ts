// M117 step 3: a limit on how often a route can be called. Each known limiter makes its route limited, in the route's file,
// through a wrapper, and project wide; protected routes are never flagged (so it does not cry wolf); a matcher made by code
// is could not check; a limit the person says is set outside the code is told, never a pass.
import { describe, expect, test } from "bun:test";
import { moneyToldLine } from "../../protocol/index.ts";
import { moneyCheck } from "../src/money/check.ts";
import { matcherTest } from "../src/money/limits.ts";

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps });
const AI = `import OpenAI from "openai";\nconst ai = new OpenAI();\n`;
const route = (body = "") => `${AI}${body}\nexport async function POST(req: Request) {\n  return new Response("x");\n}\n`;
const next = (extra: Record<string, string>) => ({ "package.json": pkg({ next: "15" }), "app/api/chat/route.ts": route(), ...extra });
const flagged = (files: Record<string, string>, told?: string[]) => moneyCheck(files, { told }).findings.filter((f) => f.kind === "paid_route_open");
const rate = (files: Record<string, string>) => moneyCheck(files).unsure.filter((u) => u.family === "rate");

describe("a limiter in the route's own file", () => {
  const limiters: [string, string][] = [
    ["@upstash/ratelimit", `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nawait rl.limit("ip");`],
    ["@arcjet/next", `import arcjet, { tokenBucket } from "@arcjet/next";\nconst aj = arcjet({ rules: [tokenBucket({})] });`],
    ["@vercel/firewall", `import { checkRateLimit } from "@vercel/firewall";\nawait checkRateLimit("chat");`],
    ["rate-limiter-flexible", `import { RateLimiterMemory } from "rate-limiter-flexible";\nconst l = new RateLimiterMemory({ points: 5 });\nawait l.consume("ip");`],
    ["next-rate-limit", `import rateLimit from "next-rate-limit";\nconst limiter = rateLimit({});\nlimiter.checkNext(req, 10);`],
    ["@unkey/ratelimit", `import { Ratelimit } from "@unkey/ratelimit";\nconst u = new Ratelimit({});\nawait u.limit("ip");`],
    ["a Cloudflare binding", `const { success } = await env.MY_LIMITER.limit({ key: ip });`],
  ];
  for (const [name, code] of limiters) test(name, () => expect(flagged(next({ "app/api/chat/route.ts": route(code) }))).toEqual([]));
  test("an Upstash import that is never used to limit does not count", () => {
    expect(flagged(next({ "app/api/chat/route.ts": route(`import { Redis } from "@upstash/redis";`) }))).toHaveLength(1);
  });
});

describe("a limiter through a wrapper the route imports", () => {
  test("withRateLimit(handler) from lib/ratelimit.ts, which uses Upstash", () => {
    expect(flagged(next({
      "lib/ratelimit.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport const withRateLimit = (h) => async (req) => { await rl.limit("x"); return h(req); };\n`,
      "app/api/chat/route.ts": `${AI}import { withRateLimit } from "@/lib/ratelimit";\nexport const POST = withRateLimit(async (req: Request) => new Response("x"));\n`,
    }))).toEqual([]);
  });
});

describe("a limit across the project", () => {
  test("Express: app.use(limiter) covers every route; app.use(\"/api\", limiter) covers only /api", () => {
    const base = { "package.json": pkg({ express: "4", "express-rate-limit": "7", openai: "4" }), "routes/ai.js": `const express = require("express");\nconst router = express.Router();\nconst OpenAI = require("openai");\nrouter.post("/chat", async () => {});\nmodule.exports = router;\n` };
    const all = `const express = require("express");\nconst rateLimit = require("express-rate-limit");\nconst ai = require("./routes/ai");\nconst app = express();\nconst limiter = rateLimit({ windowMs: 60000, max: 20 });\napp.use(limiter);\napp.use("/ai", ai);\n`;
    expect(flagged({ ...base, "server.js": all })).toEqual([]);
    const part = `const express = require("express");\nconst rateLimit = require("express-rate-limit");\nconst ai = require("./routes/ai");\nconst app = express();\napp.use("/api", rateLimit({ max: 20 }));\napp.use("/ai", ai);\n`;
    expect(flagged({ ...base, "server.js": part }).map((f) => f.path)).toEqual(["/ai/chat"]);
    const covered = part.replace('app.use("/ai", ai)', 'app.use("/api", ai)');
    expect(flagged({ ...base, "server.js": covered })).toEqual([]);
  });
  test("Hono: app.use(\"*\", rateLimiter(...))", () => {
    expect(flagged({ "package.json": pkg({ hono: "4", "hono-rate-limiter": "0.4" }), "src/index.ts": `import { Hono } from "hono";\nimport { rateLimiter } from "hono-rate-limiter";\nimport OpenAI from "openai";\nconst app = new Hono();\napp.use("*", rateLimiter({ limit: 10 }));\napp.post("/gen", async (c) => c.text("x"));\n` })).toEqual([]);
  });
  test("Fastify: register(rateLimit) is global unless global: false", () => {
    const f = (opts: string) => ({ "package.json": pkg({ fastify: "5" }), "server.ts": `import Fastify from "fastify";\nimport rateLimit from "@fastify/rate-limit";\nimport OpenAI from "openai";\nconst fastify = Fastify();\nawait fastify.register(rateLimit, ${opts});\nfastify.post("/ask", async () => ({}));\n` });
    expect(flagged(f("{ max: 10 }"))).toEqual([]);
    // With global: false the limit is per route: only a route with its own rateLimit config is limited.
    expect(flagged(f("{ global: false }"))).toHaveLength(1);
    expect(flagged({ ...f("{ global: false }"), "server.ts": f("{ global: false }")["server.ts"].replace('fastify.post("/ask", async', 'fastify.post("/ask", { config: { rateLimit: { max: 3 } } }, async') })).toEqual([]);
  });
  test("Next.js middleware with a limiter: no matcher covers all; a matching text matcher covers; a non matching one does not", () => {
    const mw = (config: string) => `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport async function middleware(req) { await rl.limit("ip"); }\n${config}`;
    expect(flagged(next({ "middleware.ts": mw("") }))).toEqual([]);
    expect(flagged(next({ "middleware.ts": mw(`export const config = { matcher: ["/api/:path*"] };\n`) }))).toEqual([]);
    expect(flagged(next({ "src/middleware.ts": mw(`export const config = { matcher: "/api/chat" };\n`) }))).toEqual([]);
    expect(flagged(next({ "middleware.ts": mw(`export const config = { matcher: ["/dashboard/:path*"] };\n`) }))).toHaveLength(1);
    // Next.js 16 calls it proxy.ts.
    expect(flagged(next({ "proxy.ts": mw(`export const config = { matcher: ["/api/:path*"] };\n`) }))).toEqual([]);
  });
  test("a matcher made by code is could not check (matcher_not_text), never limited and never flagged", () => {
    const files = next({ "middleware.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport async function middleware() { await rl.limit("x"); }\nexport const config = { matcher: PATHS };\n` });
    expect(flagged(files)).toEqual([]);
    expect(rate(files)).toEqual([{ family: "rate", why: "matcher_not_text", count: 1 }]);
  });
  test("middleware with no limiter in it limits nothing", () => {
    expect(flagged(next({ "middleware.ts": `export function middleware(req) { return NextResponse.next(); }\n` }))).toHaveLength(1);
  });
  test("SvelteKit hooks.server.ts handle with a limiter", () => {
    expect(flagged({ "package.json": pkg({ "@sveltejs/kit": "2" }), "src/hooks.server.ts": `import { RateLimiter } from "sveltekit-rate-limiter/server";\nconst limiter = new RateLimiter({});\nexport const handle = async ({ event, resolve }) => { if (await limiter.isLimited(event)) return new Response("", { status: 429 }); return resolve(event); };\n`, "src/routes/api/chat/+server.ts": `import OpenAI from "openai";\nexport async function POST() {}\n` })).toEqual([]);
  });
  test("Nuxt: a server middleware with a limiter, and nuxt-security in nuxt.config (not with rateLimiter: false)", () => {
    const base = { "package.json": pkg({ nuxt: "3" }), "server/api/chat.post.ts": `import OpenAI from "openai";\nexport default defineEventHandler(async () => {});\n` };
    expect(flagged({ ...base, "server/middleware/limit.ts": `import { RateLimiterMemory } from "rate-limiter-flexible";\nconst rl = new RateLimiterMemory({ points: 5 });\nexport default defineEventHandler(async (e) => { await rl.consume(getRequestIP(e)); });\n` })).toEqual([]);
    expect(flagged({ ...base, "nuxt.config.ts": `export default defineNuxtConfig({ modules: ["nuxt-security"] });\n` })).toEqual([]);
    expect(flagged({ ...base, "nuxt.config.ts": `export default defineNuxtConfig({ modules: ["nuxt-security"], security: { rateLimiter: false } });\n` })).toHaveLength(1);
  });
  test("Flask-Limiter with default limits covers every route; @limiter.limit on the route covers it", () => {
    const route = `from flask import Flask\nimport openai\napp = Flask(__name__)\n\n@app.route("/chat", methods=["POST"])\ndef chat():\n    pass\n`;
    expect(flagged({ "requirements.txt": "flask\nopenai\n", "app.py": route })).toHaveLength(1);
    expect(flagged({ "requirements.txt": "flask\n", "app.py": route, "ext.py": `from flask_limiter import Limiter\nlimiter = Limiter(get_remote_address, default_limits=["200 per day"])\n` })).toEqual([]);
    expect(flagged({ "requirements.txt": "flask\n", "app.py": route.replace('@app.route', '@limiter.limit("5 per minute")\n@app.route') })).toEqual([]);
  });
});

describe("what does not count as a limit", () => {
  test("Supabase's [auth.rate_limit] does not cover an edge function", () => {
    expect(flagged({ "supabase/config.toml": `[auth.rate_limit]\nemail_sent = 2\n`, "supabase/functions/ask/index.ts": `import OpenAI from "npm:openai";\nDeno.serve(async () => new Response("x"));\n` })).toHaveLength(1);
  });
  test("a limiter only in a comment does not count", () => {
    expect(flagged(next({ "app/api/chat/route.ts": route(`// import { Ratelimit } from "@upstash/ratelimit"; await rl.limit("x");`) }))).toHaveLength(1);
  });
  test("a hand written limit (a Map of counts) is still flagged, and said gently by the page's words", () => {
    expect(flagged(next({ "app/api/chat/route.ts": route(`const hits = new Map();\nif ((hits.get(ip) ?? 0) > 20) throw new Error("slow down");`) }))).toHaveLength(1);
  });
});

describe("set up outside the code", () => {
  test("a told route is told, never limited: still shown", () => {
    const line = moneyToldLine("paid_route_open", "app/api/chat/route.ts")!;
    expect(line).toBe("Rate limit for app/api/chat/route.ts is set up outside the code (you told me).");
    expect(flagged(next({}), [line])).toEqual([expect.objectContaining({ file: "app/api/chat/route.ts", told: true })]);
    // A told line for another file, or another kind, does not count.
    expect(flagged(next({}), [moneyToldLine("paid_route_open", "app/api/other/route.ts")!])[0].told).toBeUndefined();
    expect(flagged(next({}), [moneyToldLine("form_open", "app/api/chat/route.ts")!])[0].told).toBeUndefined();
  });
});

describe("Next.js matchers", () => {
  test("path syntax", () => {
    expect(matcherTest("/api/:path*")!.test("/api")).toBe(true);
    expect(matcherTest("/api/:path*")!.test("/api/a/b")).toBe(true);
    expect(matcherTest("/api/:path*")!.test("/apix")).toBe(false);
    expect(matcherTest("/((?!_next/static|favicon.ico).*)")!.test("/api/chat")).toBe(true);
    expect(matcherTest("/a/(")).toBeNull();
  });
});
