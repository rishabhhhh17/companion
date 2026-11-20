// M117 steps 2 and 5: which routes cost money, and the spending list. A route that calls nothing paid is never flagged;
// webhooks and scheduled jobs are left out; calls are followed two files deep, not three; a .env file is never read.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { moneyCheck, moneyOfProject, readForMoney } from "../src/money/check.ts";
import { paidCallsIn } from "../src/money/services.ts";

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps });
const next = (extra: Record<string, string>) => ({ "package.json": pkg({ next: "15" }), ...extra });
const open = (files: Record<string, string>) => moneyCheck(files).findings.filter((f) => f.kind === "paid_route_open" || f.kind === "heavy_route_open");
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const folder = (files: Record<string, string>) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-m117-paid-")));
  made.push(d);
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t); }
  return d;
};

describe("each paid service by its import, a known host by fetch, Python by import", () => {
  const cases: [string, string, string][] = [
    ["openai", `import OpenAI from "openai";`, "openai"], ["anthropic", `import Anthropic from "@anthropic-ai/sdk";`, "anthropic"], ["google_ai", `import { GoogleGenAI } from "@google/genai";`, "google_ai"],
    ["ai sdk provider", `import { openai } from "@ai-sdk/openai";`, "openai"], ["replicate", `const Replicate = require("replicate");`, "replicate"], ["groq", `import Groq from "groq-sdk";`, "groq"],
    ["mistral", `import { Mistral } from "@mistralai/mistralai";`, "mistral"], ["fal", `import { fal } from "@fal-ai/client";`, "fal"], ["elevenlabs", `import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";`, "elevenlabs"],
    ["resend", `import { Resend } from "resend";`, "resend"], ["sendgrid", `import sg from "@sendgrid/mail";`, "sendgrid"], ["postmark", `import * as postmark from "postmark";`, "postmark"],
    ["ses", `import { SESClient } from "@aws-sdk/client-ses";`, "ses"], ["twilio", `import twilio from "twilio";`, "twilio"], ["vonage", `import { Vonage } from "@vonage/server-sdk";`, "vonage"],
    ["deno npm: import", `import OpenAI from "npm:openai@4.0.0";`, "openai"], ["esm.sh import", `import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.0";`, "anthropic"],
    ["host by fetch", `await fetch("https://api.openai.com/v1/chat/completions", { method: "POST" });`, "openai"], ["openrouter host", `fetch("https://openrouter.ai/api/v1/chat")`, "openrouter"],
  ];
  for (const [name, line, service] of cases) test(name, () => expect(paidCallsIn("a.ts", line).map((c) => c.service)).toContain(service as never));
  test("the AI SDK with generateText and no provider is an AI model", () => {
    expect(paidCallsIn("a.ts", `import { generateText } from "ai";\nawait generateText({ model: "openai/gpt-5", prompt });\n`).map((c) => c.service)).toEqual(["other_ai"]);
    expect(paidCallsIn("a.ts", `import { useChat } from "ai/react";\n`)).toEqual([]);
  });
  test("Python: openai, anthropic, google.genai, boto3 ses", () => {
    expect(paidCallsIn("a.py", "import openai\n").map((c) => c.service)).toEqual(["openai"]);
    expect(paidCallsIn("a.py", "from anthropic import Anthropic\n").map((c) => c.service)).toEqual(["anthropic"]);
    expect(paidCallsIn("a.py", "from google import genai\n").map((c) => c.service)).toEqual(["google_ai"]);
    expect(paidCallsIn("a.py", `import boto3\nses = boto3.client("ses")\n`).map((c) => c.service)).toEqual(["ses"]);
  });
});

describe("which routes cost money", () => {
  test("a route that calls OpenAI with no limit is paid_route_open, with its file, line, method and path", () => {
    expect(open(next({ "app/api/chat/route.ts": `import OpenAI from "openai";\nconst ai = new OpenAI();\n\nexport async function POST(req: Request) {\n  return Response.json(await ai.chat.completions.create({}));\n}\n` }))).toEqual([
      { kind: "paid_route_open", file: "app/api/chat/route.ts", line: 4, framework: "next_app", method: "POST", path: "/api/chat", services: ["openai"] },
    ]);
  });
  test("a plain route with no paid call is never flagged", () => {
    expect(open(next({ "app/api/items/route.ts": `import { db } from "@/lib/db";\nexport async function GET() { return Response.json(await db.items()); }\nexport async function POST() {}\n`, "lib/db.ts": `export const db = { items: async () => [] };\n` }))).toEqual([]);
  });
  test("followed through a helper two imports deep (@/lib/ai), not three", () => {
    const two = next({ "app/api/chat/route.ts": `import { ask } from "@/lib/ai";\nexport async function POST() { return ask(); }\n`, "lib/ai.ts": `import { model } from "./model";\nexport const ask = () => model();\n`, "lib/model.ts": `import Anthropic from "@anthropic-ai/sdk";\nexport const model = () => new Anthropic();\n` });
    expect(open(two).map((f) => f.services)).toEqual([["anthropic"]]);
    const three = { ...two, "lib/model.ts": `import { client } from "./client";\nexport const model = () => client;\n`, "lib/client.ts": `import Anthropic from "@anthropic-ai/sdk";\nexport const client = new Anthropic();\n` };
    expect(open(three)).toEqual([]);
  });
  test("a Stripe webhook that checks its signature and a cron that checks CRON_SECRET are left out", () => {
    expect(open(next({
      "app/api/webhook/route.ts": `import Stripe from "stripe";\nimport { Resend } from "resend";\nexport async function POST(req: Request) {\n  const event = stripe.webhooks.constructEvent(body, sig, secret);\n}\n`,
      "app/api/cron/digest/route.ts": `import { Resend } from "resend";\nexport async function GET(req: Request) {\n  if (req.headers.get("authorization") !== \`Bearer \${process.env.CRON_SECRET}\`) return new Response(null, { status: 401 });\n}\n`,
    }))).toEqual([]);
  });
  test("a route listed under crons in vercel.json is left out", () => {
    expect(open(next({ "vercel.json": JSON.stringify({ crons: [{ path: "/api/daily", schedule: "0 5 * * *" }] }), "app/api/daily/route.ts": `import OpenAI from "openai";\nexport async function GET() {}\n` }))).toEqual([]);
  });
  test("an email route is paid_route_open with its service; heavy work is heavy_route_open", () => {
    const r = open(next({ "app/api/invite/route.ts": `import { Resend } from "resend";\nexport async function POST() {}\n`, "app/api/shot/route.ts": `import puppeteer from "puppeteer";\nexport async function POST() {}\n` }));
    expect(r.map((f) => [f.kind, f.services])).toEqual([["paid_route_open", ["resend"]], ["heavy_route_open", ["puppeteer"]]]);
  });
  test("a Remix loader (a GET for a page) is not flagged; its action is", () => {
    const r = open({ "package.json": pkg({ "@remix-run/node": "2" }), "app/routes/chat.tsx": `import OpenAI from "openai";\nexport async function loader() {}\nexport async function action() {}\n` });
    expect(r.map((f) => f.method)).toEqual(["POST"]);
  });
});

describe("the spending list", () => {
  test("every paid service once, with the first place found; settings names list their service; heavy work and comments are not on it", () => {
    const r = moneyCheck({
      "package.json": pkg({ next: "15", replicate: "1", sharp: "0.33" }),
      "app/api/a/route.ts": `import OpenAI from "openai";\nexport async function POST() {}\n`,
      "lib/sms.ts": `const token = process.env.TWILIO_AUTH_TOKEN;\n`,
      "lib/old.ts": `// import Anthropic from "@anthropic-ai/sdk";\n`,
    });
    expect(r.paid).toEqual([
      { service: "openai", file: "app/api/a/route.ts", line: 1 },
      { service: "twilio", file: "lib/sms.ts", line: 1 },
      { service: "replicate", file: "package.json" },
    ]);
  });
  test("a host that bills by use is on the list from its own settings file", () => {
    expect(moneyCheck({ "vercel.json": "{}", "supabase/config.toml": "[api]\n" }).paid.map((p) => p.service)).toEqual(["supabase", "vercel"]);
  });
  test("a .env file is never opened: the reader leaves it out, and its key never appears in any output", () => {
    const key = "sk-proj-" + "A".repeat(40);
    const d = folder({ "package.json": pkg({ next: "15" }), ".env": `OPENAI_API_KEY=${key}\n`, ".env.local": `RESEND_API_KEY=re_${"b".repeat(30)}\n`, "app/api/chat/route.ts": `import OpenAI from "openai";\nexport async function POST() {}\n` });
    const read = readForMoney(d);
    expect(Object.keys(read.files).sort()).toEqual(["app/api/chat/route.ts", "package.json"]);
    const out = JSON.stringify(moneyOfProject(d));
    expect(out).not.toContain(key);
    expect(out).not.toContain(".env");
    expect(out).not.toContain("resend");
  });
  test("a .env passed in by mistake is still never read", () => {
    expect(moneyCheck({ ".env": `const x = process.env.OPENAI_API_KEY;\nimport OpenAI from "openai";\n` }).paid).toEqual([]);
  });
  test("a link out of the project is never followed", () => {
    const outside = folder({ "secret/app/api/x/route.ts": `import OpenAI from "openai";\nexport async function POST() {}\n` });
    const d = folder({ "package.json": pkg({ next: "15" }) });
    symlinkSync(join(outside, "secret", "app"), join(d, "app"));
    expect(Object.keys(readForMoney(d).files)).toEqual(["package.json"]);
  });
});
