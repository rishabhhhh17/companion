// M87: "Why is live broken?", research feature 7 (synthesis section 3, complaint group E: E3 Stripe webhooks failing with
// no fix, E4 values that work on the Mac but are missing in Vercel Production, E5 "the last 20%", E1 and E2 pages and
// tables open to anyone). Four read only parts, run only on the person's press in Go live:
//   env       every environment value the code reads is in Vercel Production (`vercel env ls production`, names only)
//   stripe    Stripe webhook health: the project's endpoint is on, and recent events were delivered (`stripe get`)
//   pages     the anonymous visit to private looking pages, on the live address (browser.ts visitWithoutSignIn)
//   database  the Supabase row security check (rls.ts rlsGate)
// Each tool is the person's own, signed in by them. Squibby never asks for, reads or keeps a key or a login, and never
// changes anything: every command goes through readonly.ts refuseWrite first. A tool that is missing or not signed in is
// a part that says exactly what to do, and is skipped. Values are never read: only the first word of each row of the
// Vercel list (the name) is kept, and no command output is ever passed on. Each part is data (an id, a state, a reason
// code and names); every sentence a person reads is in app/src/strings.ts (rule 21).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { minimalEnv } from "../env.ts";
import { runCommand, type RunOptions, type RunResult } from "../proof/exec.ts";
import { visitWithoutSignIn, type PageVisit } from "../proof/browser.ts";
import { privateRoutes } from "../proof/privatepages.ts";
import { refuseWrite } from "../readonly.ts";
import { isSafeUrl } from "../research.ts";
import { rlsGate } from "./rls.ts";
import { readShips } from "./deploy.ts";
import { LIVE_PARTS, type LivePart } from "../../../protocol/index.ts";

// The parts, their states and reasons live in the protocol, so the engine, the shell's fixtures and the pages agree.
export { LIVE_PARTS, LIVE_STATES, LIVE_WHY, type LivePart } from "../../../protocol/index.ts";
export type LivePartId = LivePart["id"];
export type LiveState = LivePart["state"];
export type LiveReport = { parts: LivePart[]; liveUrl?: string };

// ---------- 1. Environment values the code reads ----------

/** Names the host or the language sets by itself, never a person's to add. */
const BUILT_IN = new Set(["NODE_ENV", "VERCEL", "CI", "PORT", "TZ", "HOME", "PATH", "PWD", "HOSTNAME", "LANG", "USER", "SHELL", "TMPDIR", "NEXT_RUNTIME", "NEXT_PHASE", "AWS_REGION", "AWS_LAMBDA_FUNCTION_NAME", "MODE", "DEV", "PROD", "SSR", "BASE_URL"]);
const BUILT_IN_START = /^(VERCEL_|NEXT_PUBLIC_VERCEL_|npm_|__NEXT|TURBO_)/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|svelte|vue|astro)$/;
const NOT_LIVE_FILE = /\.(test|spec)\.[a-z]+$|^(vitest|jest|playwright|cypress)\.config\./;
// Folders whose code never runs on the live site (tests, local scripts), or runs elsewhere (Supabase's own functions keep
// their values in Supabase, not Vercel).
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".svelte-kit", "coverage", ".venv", "venv", "__pycache__", ".companion", ".vercel", "test", "tests", "__tests__", "e2e", "cypress", "playwright", "scripts", "supabase", "fixtures"]);
const MAX_FILES = 4000, MAX_BYTES = 512 * 1024;

// A read, and whether a fallback follows it (process.env.X ?? "a", process.env.X || "a", os.getenv("X", "a")).
const READS: { re: RegExp; fallback: (after: string, m: RegExpMatchArray) => boolean }[] = [
  { re: /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, fallback: (a) => /^\s*(\?\?|\|\|)/.test(a) },
  { re: /\bprocess\.env\[\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\]/g, fallback: (a) => /^\s*(\?\?|\|\|)/.test(a) },
  { re: /\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, fallback: (a) => /^\s*(\?\?|\|\|)/.test(a) },
  { re: /\bDeno\.env\.get\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\)/g, fallback: (a) => /^\s*(\?\?|\|\|)/.test(a) },
  { re: /\bos\.environ\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g, fallback: () => false },
  { re: /\bos\.(?:environ\.get|getenv)\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*(,)?/g, fallback: (a, m) => !!m[2] || /^\s*or\b/.test(a) },
];
const DESTRUCTURE = /\{([^{}]{1,400})\}\s*=\s*process\.env\b/g;

export type EnvRead = { name: string; file: string; line: number; optional: boolean };

/** The values the project's own live code reads, from its files only (read only). A name read anywhere without a fallback
 *  is a must; one read only with a fallback is not. The host's own names are left out. */
export function envReads(project: string): EnvRead[] {
  const found = new Map<string, EnvRead>();
  const add = (name: string, file: string, line: number, optional: boolean) => {
    if (!NAME.test(name) || BUILT_IN.has(name) || BUILT_IN_START.test(name)) return;
    const was = found.get(name);
    if (!was) found.set(name, { name, file, line, optional });
    else if (was.optional && !optional) found.set(name, { name, file, line, optional: false });
  };
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || files.length >= MAX_FILES) return;
    let names: import("node:fs").Dirent[];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (files.length >= MAX_FILES) return;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), depth + 1); }
      else if (e.isFile() && CODE_FILE.test(e.name) && !NOT_LIVE_FILE.test(e.name)) files.push(join(dir, e.name));
    }
  };
  walk(project, 0);
  for (const f of files.sort()) {
    let text: string;
    try { if (statSync(f).size > MAX_BYTES) continue; text = readFileSync(f, "utf8"); } catch { continue; }
    if (!/process\.env|import\.meta\.env|Deno\.env|os\.environ|os\.getenv/.test(text)) continue;
    const rel = relative(project, f);
    const lineAt = (i: number) => text.slice(0, i).split("\n").length;
    for (const r of READS) {
      for (const m of text.matchAll(r.re)) {
        const end = m.index! + m[0].length;
        add(m[1]!, rel, lineAt(m.index!), r.fallback(text.slice(end, end + 12), m));
      }
    }
    for (const m of text.matchAll(DESTRUCTURE)) {
      for (const part of m[1]!.split(",")) {
        const p = part.trim();
        const name = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(p)?.[1];
        if (name) add(name, rel, lineAt(m.index!), p.includes("="));
      }
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The names `vercel env ls production` printed, or null when its answer cannot be read. Only the first word of each row
 *  under the header is kept; the value, the environments and the date are never kept. */
export function parseVercelEnvNames(text: string): string[] | null {
  const lines = text.split("\n");
  const head = lines.findIndex((l) => /^\s*name\s+value\s+environments?\b/i.test(l));
  if (head < 0) return /No Environment Variables found/i.test(text) ? [] : null;
  const out = new Set<string>();
  for (const l of lines.slice(head + 1)) {
    const first = /^\s*(\S+)/.exec(l)?.[1];
    if (first && NAME.test(first)) out.add(first);
  }
  return [...out].sort();
}

export type Tools = {
  /** How a reading command is run (runCommand; tests pass fixture outputs). Every command is checked by refuseWrite first. */
  run: (command: string, o: RunOptions) => Promise<RunResult>;
  hasVercel: () => boolean;
  /** Whether the Vercel tool has a login: only whether its file exists, never its contents (deploy.ts VercelCli). */
  vercelSignedIn: () => boolean;
  hasStripe: () => boolean;
  /** The anonymous visit (visitWithoutSignIn; tests pass a stand in): how each route answered. */
  probe: (baseUrl: string, routes: readonly string[], o: { signal?: AbortSignal }) => Promise<PageVisit>;
  /** Whether the hidden browser is installed. */
  browserReady: () => boolean;
  now: () => Date;
};

const onPath = (tool: string) => () => process.env.COMPANION_TEST_ASSUME_TOOLS === "1" || (minimalEnv().PATH ?? "").split(":").some((d) => d && existsSync(join(d, tool)));
export function realTools(o: { vercelAuthFile: string; browserReady: () => boolean }): Tools {
  return { run: runCommand, hasVercel: onPath("vercel"), vercelSignedIn: () => existsSync(o.vercelAuthFile), hasStripe: onPath("stripe"), probe: (u, r, p) => visitWithoutSignIn(u, r, p), browserReady: o.browserReady, now: () => new Date() };
}

const LOGIN_FLOW = /Starting login flow|oauth\/device|No existing credentials/i;
async function reading(t: Tools, command: string, project: string, signal: AbortSignal | undefined, timeoutMs = 60_000): Promise<RunResult> {
  const refused = refuseWrite(command);
  if (refused) throw new Error(refused);   // a bug, never the person's: the commands below are fixed
  return t.run(command, { cwd: project, timeoutMs, signal, stopWhen: LOGIN_FLOW, keep: 256_000 });
}

export async function envPart(project: string, t: Tools, signal?: AbortSignal): Promise<LivePart> {
  const reads = envReads(project);
  const must = reads.filter((r) => !r.optional), maybe = reads.filter((r) => r.optional);
  if (!reads.length) return { id: "env", state: "ok", why: "none_in_code", count: 0 };
  if (!t.hasVercel()) return { id: "env", state: "skipped", why: "no_cli" };
  if (!t.vercelSignedIn()) return { id: "env", state: "skipped", why: "not_signed_in" };
  if (!existsSync(join(project, ".vercel", "project.json"))) return { id: "env", state: "skipped", why: "not_linked" };
  const r = await reading(t, "vercel env ls production", project, signal);
  if (r.aborted || signal?.aborted) return { id: "env", state: "could_not", why: "stopped" };
  if (r.matched) return { id: "env", state: "skipped", why: "not_signed_in" };
  if (r.timedOut) return { id: "env", state: "could_not", why: "timed_out" };
  if (r.code === 127) return { id: "env", state: "skipped", why: "no_cli" };
  if (r.code !== 0) return { id: "env", state: "could_not", why: "said_no" };
  const there = parseVercelEnvNames(`${r.stdout}\n${r.stderr}`);
  if (!there) return { id: "env", state: "could_not", why: "unreadable" };
  const has = new Set(there);
  const missing = must.filter((m) => !has.has(m.name));
  const optionalMissing = maybe.filter((m) => !has.has(m.name)).map((m) => m.name);
  if (!missing.length) return { id: "env", state: "ok", why: "all_present", count: must.length, ...(optionalMissing.length ? { more: optionalMissing } : {}) };
  return { id: "env", state: "problem", why: "missing", count: must.length, names: missing.map((m) => m.name),
    where: missing.slice(0, 20).map((m) => ({ name: m.name, file: m.file, line: m.line })), ...(optionalMissing.length ? { more: optionalMissing } : {}) };
}

// ---------- 2. Stripe webhook health ----------

/** Whether the project uses Stripe: a Stripe package, or a Python requirement. */
export function usesStripe(project: string): boolean {
  try {
    const p = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
    if (Object.keys({ ...p.dependencies, ...p.devDependencies }).some((d) => d === "stripe" || d.startsWith("@stripe/"))) return true;
  } catch { /* none */ }
  for (const f of ["requirements.txt", "pyproject.toml"]) { try { if (/^\s*stripe\b/m.test(readFileSync(join(project, f), "utf8"))) return true; } catch { /* none */ } }
  return false;
}

/** The project's own webhook routes that talk to Stripe, as paths (/api/webhooks/stripe): Next.js app and pages routers,
 *  and Vercel's api/ folder. Read only. */
export function stripeWebhookRoutes(project: string): string[] {
  const out = new Set<string>();
  const roots: [string[], "app" | "pages" | "api"][] = [[["app", "api"], "app"], [["src", "app", "api"], "app"], [["pages", "api"], "pages"], [["src", "pages", "api"], "pages"], [["api"], "api"]];
  for (const [parts, kind] of roots) {
    const base = join(project, ...parts);
    const walk = (dir: string, at: string[], depth: number) => {
      if (depth > 6) return;
      let names: import("node:fs").Dirent[];
      try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of names) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) { walk(join(dir, e.name), [...at, e.name], depth + 1); continue; }
        if (!/\.(ts|js|mjs|tsx|jsx|py)$/.test(e.name)) continue;
        const stem = e.name.replace(/\.[a-z]+$/, "");
        const segs = kind === "app" ? (stem === "route" ? at : null) : stem === "index" ? at : [...at, stem];
        if (!segs || segs.some((s) => /[[\]()@]/.test(s))) continue;
        if (!segs.some((s) => /webhook/i.test(s))) continue;
        let text = "";
        try { if (statSync(join(dir, e.name)).size <= MAX_BYTES) text = readFileSync(join(dir, e.name), "utf8"); } catch { continue; }
        if (!/stripe/i.test(text) && !segs.some((s) => /stripe/i.test(s))) continue;
        out.add("/api/" + segs.join("/"));
      }
    };
    walk(base, [], 0);
  }
  return [...out].sort();
}

type Endpoint = { url: string; status: string };
type StripeEvent = { type: string; created: number; pending: number };
const jsonOf = (s: string): any => { const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };
export function parseEndpoints(stdout: string): Endpoint[] | null {
  const j = jsonOf(stdout);
  if (!Array.isArray(j?.data)) return null;
  return j.data.map((d: any) => ({ url: String(d?.url ?? ""), status: String(d?.status ?? "") })).filter((d: Endpoint) => /^https?:\/\//.test(d.url));
}
export function parseEvents(stdout: string): StripeEvent[] | null {
  const j = jsonOf(stdout);
  if (!Array.isArray(j?.data)) return null;
  return j.data.map((d: any) => ({ type: String(d?.type ?? ""), created: Number(d?.created) || 0, pending: Number(d?.pending_webhooks) || 0 }));
}
/** An endpoint as shown: its host and path only (never a query, which could hold a secret). */
export const shownEndpoint = (url: string): string => { try { const u = new URL(url); return `${u.host}${u.pathname.replace(/\/+$/, "")}`; } catch { return ""; } };
const pathOf = (url: string) => { try { return new URL(url).pathname.replace(/\/+$/, "") || "/"; } catch { return ""; } };
const hostOf = (url: string) => { try { return new URL(url).host.toLowerCase(); } catch { return ""; } };
const NOT_SIGNED_IN = /stripe login|not (been )?configured|no api key|api key (is )?(missing|not)|you have not configured|could not find.*(key|profile)/i;
const NO_PERMISSION = /permission|restricted key|does not have the required/i;
/** How far back a failed delivery counts as recent. */
export const RECENT_DAYS = 7;

export async function stripePart(project: string, t: Tools, o: { mode: "live" | "test"; liveUrl?: string; signal?: AbortSignal }): Promise<LivePart> {
  const routes = stripeWebhookRoutes(project);
  if (!usesStripe(project) && !routes.length) return { id: "stripe", state: "skipped", why: "not_used" };
  const mode = o.mode;
  if (!t.hasStripe()) return { id: "stripe", state: "skipped", why: "no_cli", mode };
  const flag = mode === "live" ? " --live" : "";
  const fail = (r: RunResult): LivePart | null => {
    if (r.aborted || o.signal?.aborted) return { id: "stripe", state: "could_not", why: "stopped", mode };
    if (r.timedOut) return { id: "stripe", state: "could_not", why: "timed_out", mode };
    if (r.code === 127) return { id: "stripe", state: "skipped", why: "no_cli", mode };
    const said = `${r.stderr}\n${r.stdout}`;
    if (NOT_SIGNED_IN.test(said)) return { id: "stripe", state: "skipped", why: "not_signed_in", mode };
    if (NO_PERMISSION.test(said)) return { id: "stripe", state: "could_not", why: "no_permission", mode };
    if (r.code !== 0) return { id: "stripe", state: "could_not", why: "said_no", mode };
    return null;
  };
  const er = await reading(t, `stripe get /v1/webhook_endpoints -d limit=100${flag}`, project, o.signal);
  const e1 = fail(er); if (e1) return e1;
  // A JSON error object (exit 0 on some versions) is read like the tool saying no.
  const errJ = jsonOf(er.stdout)?.error;
  if (errJ) return NOT_SIGNED_IN.test(String(errJ.message ?? "")) ? { id: "stripe", state: "skipped", why: "not_signed_in", mode } : NO_PERMISSION.test(String(errJ.message ?? "")) ? { id: "stripe", state: "could_not", why: "no_permission", mode } : { id: "stripe", state: "could_not", why: "said_no", mode };
  const endpoints = parseEndpoints(er.stdout);
  if (!endpoints) return { id: "stripe", state: "could_not", why: "unreadable", mode };
  if (!endpoints.length) return routes.length ? { id: "stripe", state: "problem", why: "no_endpoints", mode, names: routes } : { id: "stripe", state: "skipped", why: "not_used", mode };
  const liveHost = o.liveUrl ? hostOf(o.liveUrl) : "";
  const ours = endpoints.filter((e) => (liveHost && hostOf(e.url) === liveHost) || routes.includes(pathOf(e.url)));
  if (!ours.length && liveHost) return { id: "stripe", state: "problem", why: "no_endpoint_here", mode, at: liveHost, names: endpoints.slice(0, 3).map((e) => shownEndpoint(e.url)) };
  // M87 review: with no live address and no path of the code's own to match, which endpoint is this project's is not
  // known. Another project's switched off endpoint, or one `stripe listen` made, is never reported as this one's problem.
  if (!ours.length) return { id: "stripe", state: "could_not", why: "endpoint_unknown", mode, count: endpoints.length };
  const mine = ours;
  const off = mine.filter((e) => e.status && e.status !== "enabled");
  if (off.length) return { id: "stripe", state: "problem", why: "disabled", mode, names: off.slice(0, 3).map((e) => shownEndpoint(e.url)) };
  const vr = await reading(t, `stripe get /v1/events -d delivery_success=false -d limit=100${flag}`, project, o.signal);
  const e2 = fail(vr); if (e2) return e2;
  const events = parseEvents(vr.stdout);
  if (!events) return { id: "stripe", state: "could_not", why: "unreadable", mode };
  const since = t.now().getTime() / 1000 - RECENT_DAYS * 86_400;
  const recent = events.filter((e) => e.created >= since && e.pending > 0).sort((a, b) => b.created - a.created);
  const shown = mine.slice(0, 3).map((e) => shownEndpoint(e.url));
  if (!recent.length) return { id: "stripe", state: "ok", why: "delivering", mode, count: mine.length, names: shown };
  const kinds = [...new Set(recent.map((e) => e.type).filter((k) => /^[a-z_.]{1,80}$/.test(k)))].slice(0, 3);
  // M87 review: Stripe's list of failed events covers the whole account, not one endpoint. An endpoint is named as where
  // they failed only when it is the account's one switched on endpoint, and it is this project's.
  const on = endpoints.filter((e) => !e.status || e.status === "enabled");
  const target = on.length === 1 && mine.includes(on[0]!) ? [shownEndpoint(on[0]!.url)] : [];
  return { id: "stripe", state: "problem", why: "failing", mode, count: recent.length, names: kinds, ...(target.length ? { more: target } : {}), at: new Date(recent[0]!.created * 1000).toISOString() };
}

// ---------- 3. Private pages, on the live address ----------

/** The live address: the one the person typed, else the last one Squibby put live (ships.json), when it is a plain https
 *  address on the internet. */
export function liveAddress(project: string, typed?: string): string | null {
  const ok = (u: string | undefined) => !!u && /^https:\/\//i.test(u) && isSafeUrl(u) && u.length <= 500;
  if (typed !== undefined) return ok(typed) ? new URL(typed).origin : null;
  const ships = readShips(project);
  const last = [...ships].reverse().find((s) => s.action === "live" && s.productionUrl);
  return last && ok(last.productionUrl) ? new URL(last.productionUrl!).origin : null;
}

export async function pagesPart(project: string, t: Tools, o: { liveUrl: string | null; signal?: AbortSignal }): Promise<LivePart> {
  const routes = privateRoutes(project);
  if (!routes.length) return { id: "pages", state: "skipped", why: "no_private_pages" };
  if (!o.liveUrl) return { id: "pages", state: "skipped", why: "no_address", names: routes };
  if (!t.browserReady()) return { id: "pages", state: "skipped", why: "no_browser", at: o.liveUrl };
  // M87 review: a visit that could not run, or a page that did not answer, is never read as "asked for a sign in". Only a
  // route that positively asked for one counts; the rest are named as not reached.
  const v = await t.probe(o.liveUrl, routes, { signal: o.signal }).catch((): PageVisit => ({ open: [], signIn: [], unreachable: [...routes] }));
  if (o.signal?.aborted) return { id: "pages", state: "could_not", why: "stopped", at: o.liveUrl };
  const answered = new Set([...v.open, ...v.signIn]);
  const unreached = routes.filter((r) => !answered.has(r));
  if (v.open.length) return { id: "pages", state: "problem", why: "open", names: v.open, count: routes.length, at: o.liveUrl, ...(unreached.length ? { more: unreached } : {}) };
  if (unreached.length) return { id: "pages", state: "could_not", why: "unreachable", names: unreached, count: routes.length, at: o.liveUrl, ...(v.signIn.length ? { more: v.signIn } : {}) };
  return { id: "pages", state: "ok", why: "all_need_sign_in", names: routes, count: routes.length, at: o.liveUrl };
}

// ---------- 4. The database ----------

export async function databasePart(project: string): Promise<LivePart> {
  // M87 review: a check that broke gives no sentence of its own (rule 21); the page says "I could not check" in its words.
  const g: { status: string; detail?: string; findings?: string[] } = await rlsGate({ project }).catch(() => ({ status: "could_not_check" }));
  const names = g.findings?.slice(0, 20);
  if (g.status === "not_applicable") return { id: "database", state: "skipped", why: "not_used" };
  if (g.status === "passed") return { id: "database", state: "ok", why: "protected", detail: g.detail };
  if (g.status === "blocked") return { id: "database", state: "problem", why: "open", detail: g.detail, ...(names?.length ? { names } : {}) };
  return { id: "database", state: "could_not", why: "unsure", ...(g.detail ? { detail: g.detail } : {}), ...(names?.length ? { names } : {}) };
}

// ---------- all four ----------

/** The four parts in order, each told as it finishes (onPart), so the panel fills in. A stop ends it where it is. */
export async function whyLiveBroken(o: { project: string; tools: Tools; stripeMode: "live" | "test"; typedUrl?: string; signal?: AbortSignal; onPart?: (p: LivePart, so: LivePart[]) => void }): Promise<LiveReport> {
  const liveUrl = liveAddress(o.project, o.typedUrl);
  const parts: LivePart[] = [];
  const done = (p: LivePart) => { parts.push(p); o.onPart?.(p, [...parts]); };
  const steps: (() => Promise<LivePart>)[] = [
    () => envPart(o.project, o.tools, o.signal),
    () => stripePart(o.project, o.tools, { mode: o.stripeMode, ...(liveUrl ? { liveUrl } : {}), signal: o.signal }),
    () => pagesPart(o.project, o.tools, { liveUrl, signal: o.signal }),
    () => databasePart(o.project),
  ];
  for (const [i, step] of steps.entries()) {
    if (o.signal?.aborted) break;
    let p: LivePart;
    try { p = await step(); }
    catch { p = { id: LIVE_PARTS[i]!, state: "could_not", why: o.signal?.aborted && i !== 3 ? "stopped" : "failed" }; }
    done(p);
  }
  return { parts, ...(liveUrl ? { liveUrl } : {}) };
}
