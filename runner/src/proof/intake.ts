// About this project: when a person opens a folder (often an export from Lovable, Bolt or Replit, or a GitHub clone),
// say in plain words where it came from, what it is built with, whether its packages are installed, and which settings
// it needs that are not set. Reads ordinary files only; never runs anything; never shows a setting's value.
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { detectProject, replitRun, usableStartScript, type PackageManager } from "./detect.ts";
import { pythonIntakeNote } from "./python.ts";
import { label } from "../redact.ts";
export { replitRun };

export type Origin = "lovable" | "bolt" | "replit" | "unknown";
export type ProjectReport = {
  origin: Origin;
  stack: string;
  extras: string[];
  packageManager: PackageManager | null;
  needsInstall: boolean;
  installCommand: string | null;
  start: string | null;
  env: { needed: string[]; missing: string[]; example: string | null };
  notes: string[];
  check: CheckFacts;
};
/** What the Settings rows for checking this project need to know (scripts to start it with, the checks it has, and the
 *  project's own .claude/proof.json and .claude/launch.json, which win over Settings). */
export type CheckFacts = {
  scripts: string[];
  checks: ("typecheck" | "lint" | "build" | "test")[];
  proofFile: { expectText: string[]; click: string | null; expectAfterClick: string | null } | null;
  launchFile: boolean;
};

/** The facts for the Settings rows. Script names only (never what they run), and only the scripts a check may start the
 *  project with (detect.ts usableStartScript): never a build, a lint, the tests, an install step, or one that sounds like
 *  it deploys, publishes or deletes. The engine checks again when the check starts. */
export function checkFacts(dir: string, det: ReturnType<typeof detectProject>): CheckFacts {
  const pkg = readJson(join(dir, "package.json"));
  const scripts = pkg && typeof pkg.scripts === "object" && pkg.scripts ? Object.keys(pkg.scripts).filter((k) => usableStartScript(k, pkg.scripts)).sort().slice(0, 40) : [];
  const checks = [...det.checks.map((c) => c.name), ...(det.tests ? ["test" as const] : [])].filter((x, i, a) => a.indexOf(x) === i);
  let proofFile: CheckFacts["proofFile"] = null;
  const proofPath = join(dir, ".claude", "proof.json");
  if (existsSync(proofPath)) {
    const j = readJson(proofPath) ?? {};
    const one = (v: unknown) => (typeof v === "string" ? label(v, 80) : null);
    proofFile = { expectText: Array.isArray(j.expectText) ? j.expectText.slice(0, 10).map((x: unknown) => label(String(x), 80)) : [], click: one(j.click), expectAfterClick: one(j.expectAfterClick) };
  }
  const launch = readJson(join(dir, ".claude", "launch.json"));
  return { scripts, checks, proofFile, launchFile: !!(Array.isArray(launch?.configurations) && launch!.configurations[0]?.runtimeExecutable) };
}

const readJson = (p: string): Record<string, any> | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const readText = (p: string, max = 200_000): string => { try { const s = statSync(p); return s.isFile() && s.size <= max ? readFileSync(p, "utf8") : ""; } catch { return ""; } };

// Settings names a project's code reads. Names only; well known ones that are never "missing" are left out.
const ALWAYS_THERE = new Set(["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_OPTIONS", "TZ", "LANG", "USER", "SHELL", "TMPDIR", "NODE_ENV", "PORT", "HOST", "MODE", "DEV", "PROD", "SSR", "BASE_URL", "CI", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "NEXT_RUNTIME", "PWD", "HOME", "PATH"]);
export function namesInCode(dir: string): Set<string> {
  const found = new Set<string>();
  const skip = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".vercel", ".companion"]);
  let files = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 6 || files > 1500) return;
    let names: string[]; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (skip.has(n) || n.startsWith(".")) continue;
      const p = join(d, n);
      let st; try { st = lstatSync(p); } catch { continue; }   // a link is never followed (it could lead out of the project)
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { walk(p, depth + 1); continue; }
      if (!/\.(m?[jt]sx?|vue|svelte|astro|py)$/.test(n) || st.size > 300_000) continue;
      files++;
      const t = readText(p);
      for (const m of t.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g)) found.add(m[1]);
      for (const m of t.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) found.add(m[1]);
      for (const m of t.matchAll(/process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g)) found.add(m[1]);
      for (const m of t.matchAll(/os\.(?:environ\.get|getenv)\(\s*["']([A-Z][A-Z0-9_]*)["']/g)) found.add(m[1]);
      for (const m of t.matchAll(/os\.environ\[["']([A-Z][A-Z0-9_]*)["']\]/g)) found.add(m[1]);
    }
  };
  walk(dir, 0);
  for (const n of [...found]) if (ALWAYS_THERE.has(n) || /^(REPL|REPLIT)_/.test(n)) found.delete(n);   // set by the Mac or by Replit itself
  return found;
}

/** The names set in a .env style file (names only, never values). */
export function envNames(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) { const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line); if (m) out.push(m[1]); }
  return out;
}

function stackOf(dir: string, deps: Record<string, string>): { stack: string; extras: string[] } {
  const has = (n: string) => n in deps;
  const extras: string[] = [];
  if (has("@supabase/supabase-js")) extras.push("Supabase");
  if (has("tailwindcss") || existsSync(join(dir, "tailwind.config.js")) || existsSync(join(dir, "tailwind.config.ts"))) extras.push("Tailwind");
  if (has("@prisma/client") || has("prisma")) extras.push("Prisma");
  if (has("stripe") || has("@stripe/stripe-js")) extras.push("Stripe");
  if (has("firebase")) extras.push("Firebase");
  let stack = "";
  if (has("next")) stack = "Next.js";
  else if (has("@angular/core")) stack = "Angular";
  else if (has("nuxt")) stack = "Nuxt";
  else if (has("@sveltejs/kit")) stack = "SvelteKit";
  else if (has("astro")) stack = "Astro";
  else if (has("vite") && has("react")) stack = "Vite + React";
  else if (has("vite") && has("vue")) stack = "Vite + Vue";
  else if (has("vite")) stack = "Vite";
  else if (has("react-scripts")) stack = "Create React App";
  else if (has("express") || has("fastify") || has("koa") || has("hono")) stack = "Node server";
  else if (Object.keys(deps).length) stack = "Node";
  else if (existsSync(join(dir, "requirements.txt")) || existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "main.py"))) {
    const req = readText(join(dir, "requirements.txt")) + readText(join(dir, "pyproject.toml"));
    stack = /streamlit/i.test(req) ? "Python (Streamlit)" : /fastapi/i.test(req) ? "Python (FastAPI)" : /flask/i.test(req) ? "Python (Flask)" : /django/i.test(req) ? "Python (Django)" : "Python";
  } else if (existsSync(join(dir, "index.html"))) stack = "A plain web page";
  else stack = "Not sure yet";
  return { stack, extras };
}

export function inspectProject(dir: string): ProjectReport {
  const pkg = readJson(join(dir, "package.json"));
  const deps: Record<string, string> = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  // A workspace keeps its app one folder down (packages/web, apps/site): what it is built with lives there.
  const workspace = Array.isArray(pkg?.workspaces) || Array.isArray(pkg?.workspaces?.packages) || existsSync(join(dir, "pnpm-workspace.yaml"));
  if (workspace) {
    // The folders the workspace names ("packages/*", "apps/web"), or the usual ones for pnpm.
    const listed: string[] = Array.isArray(pkg?.workspaces) ? pkg!.workspaces : Array.isArray(pkg?.workspaces?.packages) ? pkg!.workspaces.packages : [];
    const pnpm = readText(join(dir, "pnpm-workspace.yaml")).split("\n").map((l) => /^\s*-\s*["']?([^"'#]+?)["']?\s*$/.exec(l)?.[1]).filter((x): x is string => !!x);
    const patterns = [...listed, ...pnpm, "packages/*", "apps/*"].filter((x) => typeof x === "string" && !x.includes("..") && !x.startsWith("/")).slice(0, 20);
    const dirs = new Set<string>();
    for (const pat of patterns) {
      if (pat.endsWith("/*")) { const base = pat.slice(0, -2); let kids: string[] = []; try { kids = readdirSync(join(dir, base)); } catch { /* none */ } for (const k of kids.slice(0, 20)) dirs.add(join(base, k)); }
      else if (!pat.includes("*")) dirs.add(pat);
    }
    for (const d of [...dirs].slice(0, 40)) { const sub = readJson(join(dir, d, "package.json")); Object.assign(deps, sub?.dependencies ?? {}, sub?.devDependencies ?? {}); }
  }
  const viteCfg = readText(join(dir, "vite.config.ts")) + readText(join(dir, "vite.config.js"));
  const replit = readText(join(dir, ".replit"));
  const origin: Origin = "lovable-tagger" in deps || /lovable-tagger/.test(viteCfg) ? "lovable"
    : existsSync(join(dir, ".bolt", "config.json")) || existsSync(join(dir, ".bolt", "prompt")) ? "bolt"
    : replit ? "replit" : "unknown";
  const { stack, extras } = stackOf(dir, deps);
  const det = detectProject(dir);
  const notes: string[] = [];

  if (!pkg && existsSync(join(dir, "package.json.bak"))) notes.push("There is no package.json, only package.json.bak. The project cannot be installed or started until it is named package.json again.");
  const pm = det.packageManager;
  const needsInstall = !!pkg && !!pm && Object.keys(deps).length > 0 && !existsSync(join(dir, "node_modules"));
  if (workspace) notes.push("This is a workspace with more than one package; Companion checks it from the top folder.");
  if (det.python) notes.push(pythonIntakeNote(det.python));

  let start = det.start?.kind === "server" ? det.start.command : det.start?.kind === "static" ? "a plain web page (no command needed)" : null;
  if (!start && replit) { const r = replitRun(replit); if (r) start = r; }

  // Settings: what the code reads or the example file lists, against what the person's own .env files set.
  const exampleName = [".env.example", ".env.sample", ".env.template"].find((f) => existsSync(join(dir, f))) ?? null;
  const needed = new Set<string>([...namesInCode(dir), ...(exampleName ? envNames(readText(join(dir, exampleName))) : [])]);
  const set = new Set<string>();
  for (const f of [".env", ".env.local", ".env.development", ".env.development.local"]) for (const n of envNames(readText(join(dir, f)))) set.add(n);
  // Settings the page itself reads come first: a missing one of those breaks what the person sees.
  const browser = (n: string) => /^(VITE_|NEXT_PUBLIC_|REACT_APP_|PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_)/.test(n);
  const missing = [...needed].filter((n) => !set.has(n)).sort((a, b) => Number(browser(b)) - Number(browser(a)) || a.localeCompare(b));
  if (replit && /^\s*\[env\]/m.test(replit)) notes.push("Some settings are in the .replit file. They work on Replit; on this Mac they belong in a .env file.");

  return {
    origin, stack, extras, packageManager: pm, needsInstall,
    installCommand: needsInstall && pm ? `${pm} install` : null, start,
    env: { needed: [...needed].sort(), missing, example: exampleName }, notes, check: checkFacts(dir, det),
  };
}

/** One plain sentence about where the project came from and what it is. */
export function aboutLine(r: ProjectReport): string {
  const from = { lovable: "A Lovable project", bolt: "A Bolt project", replit: "A Replit project", unknown: "A project" }[r.origin];
  const what = r.stack === "Not sure yet" ? "" : `: ${r.stack}`;
  const extra = r.extras.length ? `, with ${r.extras.join(" and ")}` : "";
  return `${from}${what}${extra}.`;
}
