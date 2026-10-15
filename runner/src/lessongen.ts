// Lessons made from the person's own project. About this project already knows which setting names the code reads and
// which no .env file sets. From exactly those names this makes a walkthrough: where to get each value, how to put it in
// the settings file without pasting it into Companion, and a setting name check per name that proves it. It also makes
// the same names into steps in the project's Vercel settings, which only the person can confirm.
// The result is a lesson like any other: plain data, put through the same checks as a lesson file, a draft, at most 15
// steps. Only names are read, never a value. Nothing is run and nothing is written.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { envNames, inspectProject } from "./proof/intake.ts";
import { MAX_STEPS, parseLesson, type Lesson } from "./walk.ts";

export const SETTINGS_LESSON = "from-project-settings";
export const VERCEL_LESSON = "from-project-vercel";
/** Lesson ids starting with this belong to lessons made from the project; a lesson file cannot take one. */
export const MADE_PREFIX = "from-project-";

export type Needs = { stack: string; start: string | null; needed: string[]; missing: string[]; setIn?: Record<string, string> };
export type Where = { from: string; find: string; note?: string };

// What a setting name check can hold (walk.ts); anything else is left out rather than spoiling the lesson.
const NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
const BROWSER = /^(VITE_|NEXT_PUBLIC_|REACT_APP_|PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_)/;
// The page's own settings first (a missing one breaks what the person sees), then by name. Same order as About this project.
const order = (a: string, b: string) => Number(BROWSER.test(b)) - Number(BROWSER.test(a)) || a.localeCompare(b);
const ENV_FILES = [".env.local", ".env", ".env.development.local", ".env.development"];

// Where the value of a well known setting comes from. Kept small on purpose; looked up by the name after the page's own
// prefix. Written from what these dashboards are known to show, not yet checked on a real screen; button names change,
// which is one reason these lessons are drafts.
const SUPABASE = {
  url: { from: "Supabase: Project Settings, Data API, the Project URL", find: "the Project URL in your Supabase project's settings" },
  anon: { from: "Supabase: Project Settings, API Keys, the anon public key", find: "the anon public key in your Supabase project's settings" },
  publishable: { from: "Supabase: Project Settings, API Keys, the publishable key", find: "the publishable key in your Supabase project's settings" },
  service: { from: "Supabase: Project Settings, API Keys, the service_role secret key", find: "the service_role key in your Supabase project's settings", note: "It can read every table, so keep it out of code the page runs." },
  id: { from: "Supabase: Project Settings, General, the Project ID", find: "the Project ID in your Supabase project's settings" },
};
const DATABASE: Where = { from: "your database host (in Supabase, the Connect button at the top)", find: "the connection string on your database host" };
const TABLE: Record<string, Where> = {
  SUPABASE_URL: SUPABASE.url,
  SUPABASE_ANON_KEY: SUPABASE.anon,
  SUPABASE_PUBLISHABLE_KEY: SUPABASE.publishable,
  SUPABASE_PUBLISHABLE_DEFAULT_KEY: SUPABASE.publishable,
  SUPABASE_SERVICE_ROLE_KEY: SUPABASE.service,
  SUPABASE_PROJECT_ID: SUPABASE.id,
  SUPABASE_PROJECT_REF: SUPABASE.id,
  DATABASE_URL: DATABASE,
  POSTGRES_URL: DATABASE,
  SUPABASE_DB_URL: DATABASE,
  STRIPE_SECRET_KEY: { from: "the Stripe Dashboard: Developers, API keys, the Secret key", find: "the Secret key under API keys in the Stripe Dashboard", note: "Use the test key while you build." },
  STRIPE_PUBLISHABLE_KEY: { from: "the Stripe Dashboard: Developers, API keys, the Publishable key", find: "the Publishable key under API keys in the Stripe Dashboard" },
  STRIPE_WEBHOOK_SECRET: { from: "the Stripe Dashboard: Developers, Webhooks, the Signing secret", find: "the Signing secret of your webhook endpoint in the Stripe Dashboard" },
  OPENAI_API_KEY: { from: "OpenAI's site, platform.openai.com: API keys, Create new secret key", find: "API keys on platform.openai.com", note: "It is shown only once." },
  RESEND_API_KEY: { from: "Resend's site, resend.com: API Keys, Create API Key", find: "API Keys in the Resend dashboard", note: "It is shown only once." },
};
// Settings that must never be readable by the page, even when the code names them with the page's prefix.
const SECRET = /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD/;
const KNOWN_SECRET = new Set(["OPENAI_API_KEY", "RESEND_API_KEY", "DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"]);

// The first wording that fits the limit, so a long name never makes a lesson that would be refused.
const fit = (max: number, ...options: string[]) => options.find((o) => o.length <= max) ?? options[options.length - 1].slice(0, max);
const base = (name: string) => name.replace(BROWSER, "");
export function whereToGet(name: string): Where | null {
  const b = base(name);
  return TABLE[b] ?? (b.startsWith("STRIPE_") ? { from: "the Stripe Dashboard, under Developers", find: "Developers in the Stripe Dashboard" } : null);
}
/** A name the page can read (it starts with the page's prefix) that looks like a secret key. */
const exposedSecret = (name: string) => BROWSER.test(name) && (SECRET.test(base(name)) || KNOWN_SECRET.has(base(name)));
const warning = (name: string) => fit(200,
  `Careful: ${name} starts with ${BROWSER.exec(name)?.[1] ?? ""}, so anyone who opens your site can read it, and a secret key must never go in a name like that. Ask whoever made the project before you set it.`,
  `Careful: anyone who opens your site can read ${name}, so a secret key must never go in it. Ask whoever made the project before you set it.`,
  `Careful: anyone who opens your site can read ${name}. Ask before you set it.`);

/** The settings file to use: .env.local where the tools read it (Vite, Next.js and most page tools), .env for a plain Node
 *  server, Python and the tools that read only that one. */
export function settingsFile(stack: string): ".env.local" | ".env" {
  return /^(Python|Node server|Node$|Nuxt|Angular)/.test(stack) ? ".env" : ".env.local";
}

// Step ids hold the name, so a saved place says which names the lesson had (ids are at most 40 letters).
function stepId(prefix: "set" | "add", name: string): string {
  const id = `${prefix}-${name}`;
  return id.length <= 40 ? id : `${prefix}-${name.slice(0, 27)}-${createHash("sha256").update(name).digest("hex").slice(0, 8)}`;
}
const plural = (n: number, one: string) => (n === 1 ? `one ${one}` : `${n} ${one}s`);

/** The names for this lesson: a paused lesson keeps its own list (so its saved place still fits), unless the code stopped
 *  reading one of them; otherwise the names wanted now. At most `cap`. */
function pick(wanted: string[], needed: string[], prefix: "set" | "add", cap: number, shape?: string): { names: string[]; total: number } {
  const usable = (l: string[]) => [...new Set(l.filter((n) => NAME.test(n)))].sort(order);
  const now = usable(wanted), all = usable(needed);
  if (shape) {
    const ids = shape.split(",").filter((s) => s.startsWith(`${prefix}-`));
    const kept = ids.map((id) => all.find((n) => stepId(prefix, n) === id)).filter((n): n is string => !!n);
    if (ids.length > 0 && kept.length === ids.length) return { names: kept, total: Math.max(kept.length, now.length) };
  }
  return { names: now.slice(0, cap), total: now.length };
}

const made = (raw: unknown): Lesson | null => { const r = parseLesson(raw); return r.ok ? r.lesson : null; };

/** Set up the settings this project needs: for exactly the names the code reads that no .env file sets. */
export function settingsLesson(n: Needs, shape?: string): Lesson | null {
  const cap = MAX_STEPS - 2;
  const { names, total } = pick(n.missing, n.needed, "set", cap, shape);
  if (names.length === 0) return null;
  const file = settingsFile(n.stack);
  const steps = names.map((name) => {
    const w = whereToGet(name);
    const line = `In ${file}, add a line: ${name}= then the value. Save the file.`;
    const say = exposedSecret(name)
      ? warning(name)
      : w
        ? fit(200, `${name}: copy it from ${w.from}.${w.note ? ` ${w.note}` : ""} ${line}`, `${name}: copy it from ${w.from}. ${line}`, `Copy ${name} from ${w.from}, and add it to ${file}.`, `${line}`, `Add ${name} to ${file}.`)
        : fit(200, `${name}: Companion does not know where this value comes from, so look in the project's README or ask whoever made it. ${line}`, `${name}: Companion does not know where it comes from; see the project's README. ${line}`, `Add ${name} to ${file}. Companion does not know where it comes from; see the README.`, `Add ${name} to ${file}.`);
    return { id: stepId("set", name), say, find: w && !exposedSecret(name) ? w.find : `the ${file} file in your editor`, check: { kind: "env_name", name } };
  });
  const goal = total > names.length
    ? `Put the settings this project's code reads into ${file}. This covers ${names.length} of the ${total}; open it again afterwards for the rest.`
    : `Put the ${plural(names.length, "setting")} this project's code reads but does not have yet into ${file}.`;
  return made({
    id: SETTINGS_LESSON, title: "Set up the settings this project needs", app: "Your editor", goal, status: "draft", needsProject: true,
    steps: [
      { id: "file", say: `Make a file named ${file} in your project's top folder if it is not there yet, and open it in your editor. Keys go only in this file, never in Companion or a chat.`, find: `the ${file} file in your project's top folder`, check: { kind: "file_exists", path: file } },
      ...steps,
      { id: "restart", say: n.start ? fit(200, `Restart your project so it reads the new settings: stop it in its Terminal with Control and C, then run ${n.start} again.`, "Restart your project so it reads the new settings: stop it in its Terminal with Control and C, then start it again.") : "Restart your project so it reads the new settings: stop it in its Terminal with Control and C, then start it again.", find: "the Terminal window where your project runs", check: { kind: "ask" } },
    ],
  });
}

/** Add this project's settings to Vercel: every name it needs (the live site needs them all, and Companion cannot see
 *  what Vercel has), each confirmed by the person, then a redeploy. */
export function vercelLesson(n: Needs, shape?: string): Lesson | null {
  const cap = MAX_STEPS - 3;
  const { names, total } = pick(n.needed, n.needed, "add", cap, shape);
  if (names.length === 0) return null;
  const file = settingsFile(n.stack);
  const steps = names.map((name) => {
    const w = whereToGet(name), here = n.setIn?.[name];
    const box = `Add ${name} in the Name box and its value in the Value box, then press Save.`;
    const say = exposedSecret(name)
      ? warning(name)
      : here
        ? fit(200, `${box} The value is in ${here} on your Mac.`, box, `Add ${name} with its value, then press Save.`)
        : w
          ? fit(200, `${box} Get the value from ${w.from}.`, box, `Add ${name} with its value, then press Save.`)
          : fit(200, `${box} Companion does not know where the value comes from; see the project's README.`, box, `Add ${name} with its value, then press Save.`);
    return { id: stepId("add", name), say, find: "the Name and Value boxes under Environment Variables", check: { kind: "ask" } };
  });
  const goal = total > names.length
    ? `Add this project's settings to its Vercel project so the live site has them too. This covers ${names.length} of the ${total}; open it again afterwards for the rest.`
    : `Add the ${plural(names.length, "setting")} this project needs to its Vercel project, so the live site has ${names.length === 1 ? "it" : "them"} too. Paste values only into Vercel and ${file}.`;
  return made({
    id: VERCEL_LESSON, title: "Add this project's settings to Vercel", app: "Vercel", goal, status: "draft", needsProject: true,
    steps: [
      { id: "open", say: "Open your project in the Vercel dashboard.", find: "your project's name in the list of projects", check: { kind: "ask" } },
      { id: "env", say: "Open the Settings tab of the project, then choose Environment Variables in the list on the left.", find: "Environment Variables in the project's Settings", check: { kind: "ask" } },
      ...steps,
      { id: "redeploy", say: "Settings reach only new deployments. Open Deployments, press the three dots on the latest one, choose Redeploy and confirm. On Production this makes them live on your public site.", find: "the three dots on the latest deployment", check: { kind: "ask" } },
    ],
  });
}

/** Which settings file names each setting on this Mac (names only; links are never followed). */
function setIn(project: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ENV_FILES) {
    try {
      const p = join(project, f), st = lstatSync(p);
      if (!st.isFile() || st.size > 200_000) continue;
      for (const name of envNames(readFileSync(p, "utf8"))) out[name] ??= f;
    } catch { /* not there */ }
  }
  return out;
}

/** The lessons this project gets now. `saved` gives a lesson's saved list of step ids, so a paused one keeps its names. */
export function lessonsFromProject(project: string, saved: (id: string) => string | undefined): Lesson[] {
  let r: ReturnType<typeof inspectProject>;
  try { r = inspectProject(project); } catch { return []; }
  const start = r.start && !/^a plain web page/.test(r.start) ? r.start : null;
  const needs: Needs = { stack: r.stack, start, needed: r.env.needed, missing: r.env.missing, setIn: setIn(project) };
  const out: Lesson[] = [];
  for (const l of [settingsLesson(needs, saved(SETTINGS_LESSON)), vercelLesson(needs, saved(VERCEL_LESSON))]) if (l) out.push(l);
  return out;
}
