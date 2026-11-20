// M117 steps 2 and 5: the paid services a project uses, as a fixed list. A route costs money when its file, or a project file
// it imports (two steps), calls a paid AI, sends email or SMS, or does heavy work. The spending list names every paid service
// found in a package list, an import, or a setting's name read in code (process.env.OPENAI_API_KEY): only the name is
// matched, no value is read and no .env file is ever opened. Pure: no file is opened here.
import type { MoneyService } from "../../../protocol/index.ts";
import { depsOf, firstLine, importsOf, lineAt, reachable } from "./text.ts";

export type Family = "ai" | "email" | "sms" | "heavy" | "host";
type Paid = { id: MoneyService; family: Family; js: (string | RegExp)[]; py?: string[]; hosts?: string[]; env?: RegExp };

export const PAID: readonly Paid[] = [
  { id: "openai", family: "ai", js: ["openai", "@ai-sdk/openai", "@langchain/openai"], py: ["openai"], hosts: ["api.openai.com"], env: /^OPENAI_API_KEY$/ },
  { id: "anthropic", family: "ai", js: ["@anthropic-ai/sdk", "@ai-sdk/anthropic", "@langchain/anthropic", "@anthropic-ai/claude-agent-sdk"], py: ["anthropic"], hosts: ["api.anthropic.com"], env: /^ANTHROPIC_API_KEY$/ },
  { id: "google_ai", family: "ai", js: ["@google/genai", "@google/generative-ai", "@google-cloud/vertexai", "@ai-sdk/google", "@ai-sdk/google-vertex", "@langchain/google-genai"], py: ["google.genai", "google.generativeai", "vertexai"], hosts: ["generativelanguage.googleapis.com"], env: /^(GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)$/ },
  { id: "replicate", family: "ai", js: ["replicate"], py: ["replicate"], hosts: ["api.replicate.com"], env: /^REPLICATE_API_TOKEN$/ },
  { id: "groq", family: "ai", js: ["groq-sdk", "@ai-sdk/groq"], py: ["groq"], hosts: ["api.groq.com"], env: /^GROQ_API_KEY$/ },
  { id: "mistral", family: "ai", js: ["@mistralai/mistralai", "@ai-sdk/mistral"], py: ["mistralai"], hosts: ["api.mistral.ai"], env: /^MISTRAL_API_KEY$/ },
  { id: "cohere", family: "ai", js: ["cohere-ai", "@ai-sdk/cohere"], py: ["cohere"], env: /^(COHERE_API_KEY|CO_API_KEY)$/ },
  { id: "together", family: "ai", js: ["together-ai", "@ai-sdk/togetherai"], py: ["together"], env: /^TOGETHER_API_KEY$/ },
  { id: "fal", family: "ai", js: [/^@fal-ai\//, "@ai-sdk/fal"], py: ["fal_client"], env: /^FAL_KEY$/ },
  { id: "huggingface", family: "ai", js: ["@huggingface/inference"], py: ["huggingface_hub"], env: /^(HF_TOKEN|HUGGINGFACE_API_KEY)$/ },
  { id: "deepgram", family: "ai", js: ["@deepgram/sdk"], py: ["deepgram"], env: /^DEEPGRAM_API_KEY$/ },
  { id: "assemblyai", family: "ai", js: ["assemblyai"], py: ["assemblyai"], env: /^ASSEMBLYAI_API_KEY$/ },
  { id: "elevenlabs", family: "ai", js: ["elevenlabs", /^@elevenlabs\//], py: ["elevenlabs"], hosts: ["api.elevenlabs.io"], env: /^(ELEVENLABS_API_KEY|XI_API_KEY)$/ },
  { id: "openrouter", family: "ai", js: ["@openrouter/ai-sdk-provider", "openrouter", "@openrouter/sdk"], hosts: ["openrouter.ai/api"], env: /^OPENROUTER_API_KEY$/ },
  { id: "other_ai", family: "ai", js: [/^@ai-sdk\/(?!react$|ui-utils$|provider$|provider-utils$|svelte$|vue$|rsc$)/], py: ["litellm"] },
  { id: "resend", family: "email", js: ["resend"], py: ["resend"], hosts: ["api.resend.com"], env: /^RESEND_API_KEY$/ },
  { id: "sendgrid", family: "email", js: ["@sendgrid/mail", "@sendgrid/client"], py: ["sendgrid"], hosts: ["api.sendgrid.com"], env: /^SENDGRID_API_KEY$/ },
  { id: "postmark", family: "email", js: ["postmark"], py: ["postmarker"], hosts: ["api.postmarkapp.com"], env: /^POSTMARK_(API_TOKEN|SERVER_TOKEN|API_KEY)$/ },
  { id: "mailgun", family: "email", js: ["mailgun.js", "mailgun-js"], hosts: ["api.mailgun.net"], env: /^MAILGUN_API_KEY$/ },
  { id: "ses", family: "email", js: ["@aws-sdk/client-ses", "@aws-sdk/client-sesv2"] },
  { id: "nodemailer", family: "email", js: ["nodemailer"] },
  { id: "twilio", family: "sms", js: ["twilio"], py: ["twilio"], hosts: ["api.twilio.com"], env: /^TWILIO_AUTH_TOKEN$/ },
  { id: "sns", family: "sms", js: ["@aws-sdk/client-sns"] },
  { id: "vonage", family: "sms", js: ["vonage", /^@vonage\//], py: ["vonage"], env: /^VONAGE_API_SECRET$/ },
  { id: "plivo", family: "sms", js: ["plivo"], py: ["plivo"], env: /^PLIVO_AUTH_TOKEN$/ },
  { id: "puppeteer", family: "heavy", js: ["puppeteer", "puppeteer-core", "@sparticuz/chromium"] },
  { id: "playwright", family: "heavy", js: ["playwright", "playwright-core"], py: ["playwright"] },
  { id: "ffmpeg", family: "heavy", js: ["fluent-ffmpeg", "ffmpeg-static", "@ffmpeg/ffmpeg"] },
  { id: "sharp", family: "heavy", js: ["sharp"] },
  { id: "vercel", family: "host", js: [] },
  { id: "supabase", family: "host", js: ["@supabase/supabase-js", "@supabase/ssr"], py: ["supabase"] },
  { id: "cloudflare", family: "host", js: [] },
];
const BY_ID = new Map(PAID.map((p) => [p.id, p]));
export const familyOf = (s: MoneyService): Family => BY_ID.get(s)?.family ?? "ai";
const matches = (want: string | RegExp, name: string) => (typeof want === "string" ? want === name : want.test(name));

/** The service a JavaScript package name or Python module belongs to. */
export function serviceOfPackage(name: string, sub = "", py = false): MoneyService | null {
  if (py) {
    const full = sub ? `${name}.${sub}` : name;
    for (const p of PAID) if (p.py?.some((m) => full === m || full.startsWith(m + "."))) return p.id;
    return null;
  }
  for (const p of PAID) if (p.js.some((w) => matches(w, name))) return p.id;
  return null;
}

const AI_SDK_CALL = /\b(?:generateText|streamText|generateObject|streamObject|embed|embedMany|generateImage|experimental_generateImage|generateSpeech|transcribe)\s*\(/;
const BOTO = /\bboto3\.client\s*\(\s*["'](ses|sesv2|sns)["']/;

export type Call = { service: MoneyService; line: number };
/** The paid calls one file makes: its imports of a paid package, a known API host written as text, the AI SDK's calls,
 *  and boto3's SES or SNS client. Comments already blanked. Each service once, at its first line. */
export function paidCallsIn(file: string, code: string): Call[] {
  const got = new Map<MoneyService, number>();
  const add = (s: MoneyService | null, line: number) => { if (s && !got.has(s)) got.set(s, line); };
  const py = file.endsWith(".py");
  const imp = importsOf(file, code);
  for (const p of imp.packages) add(serviceOfPackage(p.name, p.sub, py), p.line);
  for (const p of PAID) for (const h of p.hosts ?? []) { const i = code.indexOf(h); if (i >= 0) add(p.id, lineAt(code, i)); }
  if (!py && imp.packages.some((p) => p.name === "ai") && AI_SDK_CALL.test(code) && ![...got.keys()].some((s) => familyOf(s) === "ai")) add("other_ai", firstLine(code, AI_SDK_CALL)!);
  if (py) { const m = BOTO.exec(code); if (m) add(m[1] === "sns" ? "sns" : "ses", lineAt(code, m.index)); }
  return [...got].map(([service, line]) => ({ service, line }));
}

/** What a route's file and the project files it imports (two steps) call, each service once. */
export function costOf(file: string, code: (f: string) => string | undefined): MoneyService[] {
  const out = new Set<MoneyService>();
  for (const f of reachable(file, code)) { const t = code(f); if (t !== undefined) for (const c of paidCallsIn(f, t)) out.add(c.service); }
  return [...out];
}

// ---------- left out on purpose: webhooks and scheduled jobs ----------

// A verification call of a provider's SDK. validateRequest is Twilio's only with Twilio imported: the same name is common
// for checking input.
const WEBHOOK = /\b(?:webhooks\.constructEvent(?:Async)?|constructEvent(?:Async)?\s*\(|new\s+Webhook\s*\(|\bWebhook\s*\([^)]*\)\s*\.verify|wh\.verify\s*\(|verifyWebhook\w*\s*\(|validateWebhook\w*\s*\(|verifySignature\s*\(|twilio\.validateRequest\w*\s*\()/i;
const TWILIO_CHECK = /\bvalidateRequest\w*\s*\(/;
// A signature header read and checked by hand: the header beside a verify call, a constant time compare or an HMAC compare.
const SIG_HEADER = /x-hub-signature|svix-signature|stripe-signature|x-twilio-signature|x-signature|x-webhook-signature|webhook-signature/i;
const SIG_CHECK = /\.verify\s*\(|\btimingSafeEqual\s*\(|\bcompare_digest\s*\(|\bcreateHmac\s*\([\s\S]{0,600}?(?:===|!==|==|!=)|\bhmac\.new\s*\(|\bcrypto\.subtle\.verify\s*\(/;
const CRON = /\bCRON_SECRET\b|authorization[^\n]{0,80}(?:===|!==|==|!=)[^\n]{0,80}(?:process\.env|Deno\.env|env\.)|(?:process\.env|Deno\.env)\S*[^\n]{0,40}(?:===|!==)[^\n]{0,60}authorization/i;
/** A webhook that checks its sender's signature, or a scheduled job that checks a secret: only the provider or the host can
 *  call it, so it is never flagged. */
export function onlyCallerIsProvider(code: string): boolean {
  if (WEBHOOK.test(code) || CRON.test(code)) return true;
  if (TWILIO_CHECK.test(code) && /["']twilio(?:\/[^"']*)?["']|^\s*(?:from|import)\s+twilio\b/m.test(code)) return true;
  return SIG_HEADER.test(code) && SIG_CHECK.test(code);
}
/** The paths listed under crons in vercel.json. */
export function cronPaths(raw: Readonly<Record<string, string>>): Set<string> {
  const out = new Set<string>();
  for (const [f, t] of Object.entries(raw)) {
    if (!/(^|\/)vercel\.json$/.test(f)) continue;
    try { const j = JSON.parse(t) as { crons?: { path?: unknown }[] }; for (const c of j.crons ?? []) if (typeof c?.path === "string") out.add(c.path.split("?")[0]); } catch { /* none */ }
  }
  return out;
}

// ---------- the spending list ----------

const ENV_READ = /\bprocess\.env\.([A-Z][A-Z0-9_]{2,})|\bprocess\.env\[\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\]|\bimport\.meta\.env\.([A-Z][A-Z0-9_]{2,})|\bDeno\.env\.get\(\s*["']([A-Z][A-Z0-9_]{2,})["']|\bos\.environ(?:\.get)?\s*[[(]\s*["']([A-Z][A-Z0-9_]{2,})["']|\bos\.getenv\(\s*["']([A-Z][A-Z0-9_]{2,})["']|\benv\.([A-Z][A-Z0-9_]{2,})\b/g;

/** Every paid service the project uses (not heavy work, which is not a bill with a budget), each once with the first place
 *  found: an import or a call in code first, then a setting's name read in code, then a package list. code: comments blanked.
 *  raw: the files as read (package lists, wrangler and vercel files). */
export function paidServices(code: Readonly<Record<string, string>>, raw: Readonly<Record<string, string>>): { service: MoneyService; file: string; line?: number }[] {
  const found = new Map<MoneyService, { file: string; line?: number }>();
  const add = (s: MoneyService | null, file: string, line?: number) => { if (s && familyOf(s) !== "heavy" && !found.has(s)) found.set(s, { file, ...(line ? { line } : {}) }); };
  const files = Object.keys(code).sort();
  for (const f of files) for (const c of paidCallsIn(f, code[f])) add(c.service, f, c.line);
  for (const f of files) for (const m of code[f].matchAll(ENV_READ)) {
    const name = m.slice(1).find(Boolean)!;
    for (const p of PAID) if (p.env?.test(name)) add(p.id, f, lineAt(code[f], m.index!));
  }
  for (const [name, file] of depsOf(raw)) {
    const py = /requirements|pyproject/.test(file);
    add(py ? serviceOfPackage(name.replace(/-/g, "."), "", true) ?? serviceOfPackage(name.replace(/-/g, "_"), "", true) : serviceOfPackage(name), file);
  }
  for (const f of Object.keys(raw)) {
    if (/(^|\/)vercel\.json$/.test(f)) add("vercel", f);
    if (/(^|\/)wrangler\.(toml|jsonc?)$/.test(f)) add("cloudflare", f);
    if (/(^|\/)supabase\/config\.toml$/.test(f)) add("supabase", f);
  }
  return [...found].map(([service, at]) => ({ service, ...at }));
}
