// M117 step 1: the server routes of each framework, found by static rules, with the right file, line, method and path.
// Files in tests, examples, scripts and built folders are never routes. A route the rules cannot read is said, never left out.
import { describe, expect, test } from "bun:test";
import { routesIn } from "../src/money/routes.ts";
import { stripComments } from "../src/money/text.ts";

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps });
const read = (files: Record<string, string>) => {
  const code: Record<string, string> = {};
  for (const [f, t] of Object.entries(files)) code[f] = stripComments(f, t);
  return routesIn(code, files);
};
const brief = (files: Record<string, string>) => read(files).routes.map((r) => ({ file: r.file, line: r.line, framework: r.framework, method: r.method, path: r.path, kind: r.kind }));

describe("routes, per framework", () => {
  test("Next.js app router: each exported method, with its path; route groups left out of the path", () => {
    const r = brief({
      "package.json": pkg({ next: "15.0.0" }),
      "app/api/chat/route.ts": `import OpenAI from "openai";\n\nexport async function POST(req: Request) {\n  return new Response("ok");\n}\nexport const GET = () => new Response("hi");\n`,
      "src/app/(shop)/api/items/[id]/route.js": `export function DELETE() {}\n`,
    });
    expect(r).toContainEqual({ file: "app/api/chat/route.ts", line: 3, framework: "next_app", method: "POST", path: "/api/chat", kind: "route" });
    expect(r).toContainEqual({ file: "app/api/chat/route.ts", line: 6, framework: "next_app", method: "GET", path: "/api/chat", kind: "route" });
    expect(r).toContainEqual({ file: "src/app/(shop)/api/items/[id]/route.js", line: 1, framework: "next_app", method: "DELETE", path: "/api/items/[id]", kind: "route" });
  });
  test("Next.js: export { handler as GET, handler as POST } counts both", () => {
    const r = brief({ "package.json": pkg({ next: "15" }), "app/api/auth/[...nextauth]/route.ts": `const handler = NextAuth({});\nexport { handler as GET, handler as POST };\n` });
    expect(r.map((x) => x.method).sort()).toEqual(["GET", "POST"]);
    expect(r[0].path).toBe("/api/auth/[...nextauth]");
  });
  test("Next.js Server Actions: a \"use server\" file's exported async functions, and an inline \"use server\"", () => {
    const r = brief({
      "package.json": pkg({ next: "15" }),
      "app/actions.ts": `"use server";\n\nexport async function send(form: FormData) {}\nexport const save = async () => {};\nfunction notExported() {}\n`,
      "app/page.tsx": `export default function Page() {\n  async function go() {\n    "use server";\n  }\n  return null;\n}\n`,
    });
    expect(r.filter((x) => x.kind === "action")).toEqual([
      { file: "app/actions.ts", line: 3, framework: "next_app", method: "POST", path: undefined, kind: "action" },
      { file: "app/actions.ts", line: 4, framework: "next_app", method: "POST", path: undefined, kind: "action" },
      { file: "app/page.tsx", line: 3, framework: "next_app", method: "POST", path: undefined, kind: "action" },
    ]);
  });
  test("Next.js pages router: a default export under pages/api", () => {
    const r = brief({ "package.json": pkg({ next: "14" }), "pages/api/hello.ts": `\nexport default function handler(req, res) { res.json({}) }\n`, "src/pages/api/users/index.js": `export default async (req, res) => {}\n` });
    expect(r).toContainEqual({ file: "pages/api/hello.ts", line: 2, framework: "next_pages", method: undefined, path: "/api/hello", kind: "route" });
    expect(r).toContainEqual({ file: "src/pages/api/users/index.js", line: 1, framework: "next_pages", method: undefined, path: "/api/users", kind: "route" });
  });
  test("Express: route calls with a path written as text, and a router mounted with app.use", () => {
    const r = brief({
      "package.json": pkg({ express: "4" }),
      "server.js": `const express = require("express");\nconst chat = require("./routes/chat");\nconst app = express();\napp.get("/health", (q, s) => s.send("ok"));\napp.use("/api", chat);\n`,
      "routes/chat.js": `const express = require("express");\nconst router = express.Router();\n\nrouter.post("/chat", async (req, res) => {});\nmodule.exports = router;\n`,
    });
    expect(r).toContainEqual({ file: "server.js", line: 4, framework: "express", method: "GET", path: "/health", kind: "route" });
    expect(r).toContainEqual({ file: "routes/chat.js", line: 4, framework: "express", method: "POST", path: "/api/chat", kind: "route" });
  });
  test("Hono: app.post and app.on, in a file that makes new Hono", () => {
    const r = brief({ "package.json": pkg({ hono: "4" }), "src/index.ts": `import { Hono } from "hono";\nconst app = new Hono();\napp.post("/api/gen", (c) => c.text("x"));\napp.on("PUT", "/api/item", (c) => c.text("y"));\nexport default app;\n` });
    expect(r).toEqual([
      { file: "src/index.ts", line: 3, framework: "hono", method: "POST", path: "/api/gen", kind: "route" },
      { file: "src/index.ts", line: 4, framework: "hono", method: "PUT", path: "/api/item", kind: "route" },
    ]);
  });
  test("Fastify: fastify.post and .route({ method, url })", () => {
    const r = brief({ "package.json": pkg({ fastify: "5" }), "server.ts": `import Fastify from "fastify";\nconst fastify = Fastify();\nfastify.post("/ask", async () => ({}));\nfastify.route({ method: "PATCH", url: "/thing", handler: async () => ({}) });\n` });
    expect(r).toEqual([
      { file: "server.ts", line: 3, framework: "fastify", method: "POST", path: "/ask", kind: "route" },
      { file: "server.ts", line: 4, framework: "fastify", method: "PATCH", path: "/thing", kind: "route" },
    ]);
  });
  test("Remix and React Router: action is a POST, loader a GET, with the path from the file name", () => {
    const r = brief({ "package.json": pkg({ "@remix-run/node": "2" }), "app/routes/api.chat.tsx": `export async function action({ request }) {}\nexport const loader = async () => null;\n`, "app/routes/_index.tsx": `export async function action() {}\n` });
    expect(r).toContainEqual({ file: "app/routes/api.chat.tsx", line: 1, framework: "remix", method: "POST", path: "/api/chat", kind: "form_handler" });
    expect(r).toContainEqual({ file: "app/routes/api.chat.tsx", line: 2, framework: "remix", method: "GET", path: "/api/chat", kind: "route" });
    expect(r).toContainEqual({ file: "app/routes/_index.tsx", line: 1, framework: "remix", method: "POST", path: "/", kind: "form_handler" });
  });
  test("SvelteKit: +server methods and +page.server actions", () => {
    const r = brief({ "package.json": pkg({ "@sveltejs/kit": "2" }), "src/routes/api/chat/+server.ts": `export async function POST({ request }) {}\n`, "src/routes/(app)/join/+page.server.ts": `\nexport const actions = { default: async () => {} };\n` });
    expect(r).toContainEqual({ file: "src/routes/api/chat/+server.ts", line: 1, framework: "sveltekit", method: "POST", path: "/api/chat", kind: "route" });
    expect(r).toContainEqual({ file: "src/routes/(app)/join/+page.server.ts", line: 2, framework: "sveltekit", method: "POST", path: "/join", kind: "form_handler" });
  });
  test("Nuxt: server/api handlers, the method from the file name", () => {
    const r = brief({ "package.json": pkg({ nuxt: "3" }), "server/api/chat.post.ts": `export default defineEventHandler(async (e) => {});\n`, "server/routes/feed/index.ts": `export default eventHandler(() => "x");\n` });
    expect(r).toContainEqual({ file: "server/api/chat.post.ts", line: 1, framework: "nuxt", method: "POST", path: "/api/chat", kind: "route" });
    expect(r).toContainEqual({ file: "server/routes/feed/index.ts", line: 1, framework: "nuxt", method: undefined, path: "/feed", kind: "route" });
  });
  test("Supabase edge functions: Deno.serve in supabase/functions/<name>/index.ts; _shared is not a function", () => {
    const r = brief({ "supabase/functions/ask-ai/index.ts": `import OpenAI from "npm:openai";\n\nDeno.serve(async (req) => new Response("x"));\n`, "supabase/functions/_shared/cors.ts": `export const cors = {};\n` });
    expect(r).toEqual([{ file: "supabase/functions/ask-ai/index.ts", line: 3, framework: "supabase_fn", method: undefined, path: "/functions/v1/ask-ai", kind: "function" }]);
  });
  test("Cloudflare: a Worker's main file with its own fetch, and Pages Functions", () => {
    const r = brief({ "wrangler.toml": `name = "w"\nmain = "src/worker.ts"\n`, "src/worker.ts": `export default {\n  async fetch(req, env) { return new Response("x"); },\n};\n`, "functions/api/chat.ts": `export async function onRequestPost(ctx) {}\n` });
    expect(r).toContainEqual({ file: "src/worker.ts", line: 1, framework: "cloudflare", method: undefined, path: undefined, kind: "function" });
    expect(r).toContainEqual({ file: "functions/api/chat.ts", line: 1, framework: "cloudflare", method: "POST", path: "/api/chat", kind: "function" });
  });
  test("Vercel functions outside Next.js: api/ files with a default export or a method, and a Python handler", () => {
    const r = brief({ "package.json": pkg({ vite: "5" }), "api/ask.ts": `export default async function handler(req, res) {}\n`, "api/py/hello.py": `from http.server import BaseHTTPRequestHandler\nclass handler(BaseHTTPRequestHandler):\n    pass\n` });
    expect(r).toContainEqual({ file: "api/ask.ts", line: 1, framework: "vercel_fn", method: undefined, path: "/api/ask", kind: "function" });
    expect(r).toContainEqual({ file: "api/py/hello.py", line: 2, framework: "vercel_fn", method: undefined, path: "/api/py/hello", kind: "function" });
  });
  test("Flask: @app.route with methods, and @bp.post", () => {
    const r = brief({ "requirements.txt": "flask==3.0\nopenai\n", "app.py": `from flask import Flask\napp = Flask(__name__)\n\n@app.route("/chat", methods=["POST"])\ndef chat():\n    pass\n\n@app.get("/")\ndef home():\n    pass\n` });
    expect(r).toEqual([
      { file: "app.py", line: 4, framework: "flask", method: "POST", path: "/chat", kind: "route" },
      { file: "app.py", line: 8, framework: "flask", method: "GET", path: "/", kind: "route" },
    ]);
  });
  test("FastAPI: @app.post and a router's prefix", () => {
    const r = brief({ "pyproject.toml": `[project]\ndependencies = ["fastapi", "anthropic"]\n`, "main.py": `from fastapi import FastAPI, APIRouter\napp = FastAPI()\nrouter = APIRouter(prefix="/ai")\n\n@router.post("/ask")\nasync def ask():\n    pass\n` });
    expect(r).toEqual([{ file: "main.py", line: 5, framework: "fastapi", method: "POST", path: "/ai/ask", kind: "route" }]);
  });
});

describe("what is never a route", () => {
  test("tests, examples, scripts and built folders are left out", () => {
    const r = brief({
      "package.json": pkg({ next: "15", express: "4" }),
      "app/api/a/route.test.ts": `export async function POST() {}\n`,
      "examples/server.js": `const express = require("express");\nconst app = express();\napp.post("/x", () => {});\n`,
      "scripts/seed.js": `const express = require("express");\nconst app = express();\napp.post("/y", () => {});\n`,
      "dist/server.js": `const express = require("express");\nconst app = express();\napp.post("/z", () => {});\n`,
      "tests/api.ts": `const express = require("express");\nconst app = express();\napp.post("/t", () => {});\n`,
    });
    expect(r).toEqual([]);
  });
  test("a route only in a comment is not a route", () => {
    const r = brief({ "package.json": pkg({ express: "4" }), "server.js": `const express = require("express");\nconst app = express();\n// app.post("/old", handler);\n/* app.post("/older", handler); */\n` });
    expect(r).toEqual([]);
  });
  test("a client call with a full address is not a route", () => {
    const r = brief({ "package.json": pkg({ express: "4" }), "server.js": `const express = require("express");\nconst app = express();\nconst router = express.Router();\nrouter.get("https://example.com/x");\n` });
    expect(r).toEqual([]);
  });
});

describe("what could not be checked is said, never left out", () => {
  test("a route made in a loop, app[method]( and a template path are dynamic routes, with a count", () => {
    const x = read({
      "package.json": pkg({ express: "4" }),
      "server.js": `const express = require("express");\nconst app = express();\nfor (const r of routes) app.post(r.path, r.fn);\napp[method]("/x", fn);\napp.get(\`/api/\${name}\`, fn);\napp.get("/ok", fn);\n`,
    });
    expect(x.unsure).toEqual([{ why: "dynamic_routes", count: 3 }]);
    expect(x.routes.map((r) => r.path)).toEqual(["/ok"]);
  });
  test("a server package with no reader (Koa, NestJS, Django) is unknown_framework with its name", () => {
    expect(read({ "package.json": pkg({ koa: "2" }), "index.js": `const Koa = require("koa");\n` }).unsure).toEqual([{ why: "unknown_framework", name: "koa" }]);
    expect(read({ "package.json": pkg({ "@nestjs/core": "10" }) }).unsure).toEqual([{ why: "unknown_framework", name: "@nestjs/core" }]);
    expect(read({ "requirements.txt": "Django==5.0\n" }).unsure).toEqual([{ why: "unknown_framework", name: "django" }]);
  });
});
