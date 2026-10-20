// What does this project have that can be checked? Looks only at ordinary files in the project.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { minimalEnv } from "../env.ts";
import { isStartScript } from "../../../protocol/settings.ts";
import { detectPython, looksPython, type PythonOptions, type PythonServer, type PythonSetup } from "./python.ts";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
// tool: for a Python check, the module it runs (so "No module named ruff" reads as not installed, not as a failure).
export type Check = { name: "typecheck" | "lint" | "build"; command: string; tool?: string };
// python: a Python dev server, told its host and port on the command line. env: fixed settings it needs (never the person's).
// from: where the command came from (the project's .claude/launch.json, its dev or start script, its .replit file), so a
// start that finishes on its own can be told apart from a tool (ladder.ts looksLikeSite).
export type Start = { kind: "server"; command: string; port?: number; autoPort?: boolean; python?: PythonServer; env?: Record<string, string>; from?: "launch" | "dev" | "start" | "replit" | "settings" } | { kind: "static"; dir: string };
export type Detected = {
  kind: "node" | "python" | "static" | "unknown";
  packageManager: PackageManager | null;
  lockfile: string | null;
  checks: Check[];
  tests: { command: string; tool?: string } | null;
  start: Start | null;
  python?: PythonSetup;   // only for a Python project (one without a package.json)
};

const LOCKS: [string, PackageManager][] = [["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"]];

function readJson(path: string): Record<string, any> | null {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export function detectProject(dir: string, has: (m: PackageManager) => boolean = (m) => installed(m), pythonOptions?: PythonOptions): Detected {
  const pkgPath = join(dir, "package.json");
  const hasPkg = existsSync(pkgPath);
  // A folder with a package.json is a Node project, exactly as before; only one without is looked at as Python.
  const py = !hasPkg && looksPython(dir) ? detectPython(dir, pythonOptions) : null;
  const pkg = hasPkg ? readJson(pkgPath) ?? {} : {};
  const scripts: Record<string, string> = typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  const locks = LOCKS.filter(([f]) => existsSync(join(dir, f)));
  // Lovable keeps a stale bun.lockb next to package-lock.json: with both, npm is the one that is up to date. And a
  // manager this Mac does not have is no use when another lock file names one it does.
  const usable = locks.filter(([, m]) => has(m));
  const lock = (locks.length > 1 && locks.some(([, m]) => m === "npm") && locks.some(([, m]) => m === "bun") ? locks.find(([, m]) => m === "npm") : undefined)
    ?? (locks[0] && !has(locks[0][1]) ? usable[0] : undefined) ?? locks[0];
  const declared = typeof pkg.packageManager === "string" ? (/^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager)?.[1] as PackageManager | undefined) : undefined;
  const wanted = lock?.[1] ?? declared ?? "npm";
  // A manager this Mac does not have would only fail: npm comes with Node, so it is the fallback.
  const pm: PackageManager | null = hasPkg ? (has(wanted) ? wanted : "npm") : null;
  const run = (name: string) => `${pm} run ${name}`;

  const checks: Check[] = [];
  for (const [name, candidates] of [["typecheck", ["typecheck", "type-check"]], ["lint", ["lint"]], ["build", ["build"]]] as const) {
    const s = candidates.find((c) => scripts[c]);
    if (pm && s) checks.push({ name, command: run(s) });
  }
  if (py) checks.push(...py.checks);
  // npm's default placeholder is not a test.
  const tests = pm && scripts.test && !/no test specified/i.test(scripts.test) ? { command: run("test") } : py?.tests ?? null;

  let start: Start | null = null;
  const launch = readJson(join(dir, ".claude", "launch.json"));
  const cfg = Array.isArray(launch?.configurations) ? launch!.configurations[0] : null;
  if (cfg?.runtimeExecutable) {
    start = { kind: "server", command: [cfg.runtimeExecutable, ...(Array.isArray(cfg.runtimeArgs) ? cfg.runtimeArgs : [])].join(" "), ...(typeof cfg.port === "number" ? { port: cfg.port } : {}), ...(typeof cfg.autoPort === "boolean" ? { autoPort: cfg.autoPort } : {}), from: "launch" };
  } else if (pm && scripts.dev) start = { kind: "server", command: run("dev"), from: "dev" };
  else if (pm && scripts.start) start = { kind: "server", command: run("start"), from: "start" };
  else if (py?.start) start = py.start;
  else if (existsSync(join(dir, ".replit")) && replitRun(readFileSync(join(dir, ".replit"), "utf8"))) start = { kind: "server", command: replitRun(readFileSync(join(dir, ".replit"), "utf8"))!, from: "replit" };
  else if (existsSync(join(dir, "dist", "index.html"))) start = { kind: "static", dir: join(dir, "dist") };
  else if (existsSync(join(dir, "index.html"))) start = { kind: "static", dir };

  return { kind: hasPkg ? "node" : py ? "python" : start ? "static" : "unknown", packageManager: pm, lockfile: lock?.[0] ?? null, checks, tests, start, ...(py ? { python: py.setup } : {}) };
}

/** check.start in Settings: start the project with one of its own scripts instead of the one found. "auto" (or nothing)
 *  is today's choice. Only a script that may start it (usableStartScript) and is in package.json now is ever used, and only
 *  as "<package manager> run <name>", never as a command of its own; the project's own .claude/launch.json still wins. Any
 *  other means the usual way, said as a gap. chosen: the script used, when it is one chosen in Settings. */
export function withStartScript(det: Detected, dir: string, script: string | undefined): { det: Detected; gap?: string; chosen?: string } {
  if (!script || script === "auto") return { det };
  const launch = readJson(join(dir, ".claude", "launch.json"));
  if (Array.isArray(launch?.configurations) && launch!.configurations[0]?.runtimeExecutable) return { det };
  const pkg = det.packageManager ? readJson(join(dir, "package.json")) : null;
  const scripts: Record<string, unknown> = pkg && typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  const name = script.slice(0, 60);
  if (!det.packageManager || !Object.hasOwn(scripts, script) || typeof scripts[script] !== "string") {
    return { det, gap: `The start script chosen in Settings (${name}) is not in this project's package.json, so it was started the usual way.` };
  }
  // The engine is the boundary: whatever reached it, a script that is not a way to start the project, or that sounds like it
  // puts something online or deletes something, is never run (it would run after every task with no question asked).
  if (!usableStartScript(script, scripts)) return { det, gap: `The start script chosen in Settings (${name}) does not look like it only starts the project, so it was not run and the project was started the usual way.` };
  return { det: { ...det, start: { kind: "server", command: `${det.packageManager} run ${script}`, from: "settings" } }, chosen: script };
}
// Words in a script that mean it does more than start the project: it puts something online, publishes or releases it,
// deletes files, changes a database or git, or reaches another machine. Long words match inside others (predeploy, a
// release.js), short ones only as words. Strict on purpose: a script refused here only means the usual way is used.
const RISKY_SCRIPT = /deploy|publish|release|vercel|netlify|firebase|surge|migrat|upload|destroy|purge|wipe|\b(?:rm|rmdir|rimraf|unlink|del|delete|reset|drop|dropdb|truncate|seed|push|git|gh|sudo|ssh|scp|rsync|curl|wget|clean|ship)\b/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Does a script's text run another script by its name ("npm run ship", "run-p dev ship", "concurrently npm:ship"), or by a
// pattern ("run-p dev:*", "concurrently npm:dev:*")?
const names_ = (text: string, name: string) =>
  new RegExp(`(?:^|[^A-Za-z0-9:._-]|\\b(?:npm|yarn|pnpm|bun):)${escapeRe(name)}(?:$|[^A-Za-z0-9:._-])`).test(text)
  || [...text.matchAll(/(?:^|[\s"'])(?:(?:npm|yarn|pnpm|bun):)?([A-Za-z0-9][A-Za-z0-9:._-]*)\*/g)].some((m) => name.startsWith(m[1]));

/** Whether one of the project's scripts may start it for a check (check.start, and the choices the Settings row offers): its
 *  name is a start script's (dev, start, serve, preview and names built on them, never a build, a lint, the tests or an
 *  install step), and neither its name, its own text, the scripts npm runs around it (pre<name>, post<name>), nor any script
 *  they run sound like they put something online, publish, delete, or change data or git. */
export function usableStartScript(name: string, scripts: Record<string, unknown>): boolean {
  if (!isStartScript(name) || RISKY_SCRIPT.test(name) || !Object.hasOwn(scripts, name) || typeof scripts[name] !== "string") return false;
  const all = Object.keys(scripts).filter((k) => typeof scripts[k] === "string").slice(0, 200);
  const seen = new Set<string>(), todo = [name, `pre${name}`, `post${name}`];
  while (todo.length) {
    const n = todo.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    if (!Object.hasOwn(scripts, n) || typeof scripts[n] !== "string") continue;
    const text = scripts[n] as string;
    if (RISKY_SCRIPT.test(text)) return false;
    for (const other of all) if (!seen.has(other) && names_(text, other)) todo.push(other, `pre${other}`, `post${other}`);
  }
  return true;
}

// Words in a script a check runs by itself that mean it does more than build, lint, test or start the project on this Mac:
// it changes a database (a migration, a push, a reset, a seed), puts something online or publishes it, uploads, changes git,
// or reaches another machine. A check runs after every task, on Point at the problem, on every ship check and on a copy of
// an earlier version, with no question asked (rule 13), so such a script is never run there: it is a gap instead. Narrower
// than RISKY_SCRIPT on purpose: deleting build output (rm -rf dist, clean) stays inside the project, which a snapshot can
// put back, and the local servers of the hosting tools (vercel dev, netlify dev, wrangler dev, firebase emulators) stay on
// this Mac.
const CHANGES_DATA = new RegExp([
  String.raw`deploy|publish|migrat|upload|--prod\b`,
  String.raw`\b(?:seed|dropdb|truncate|sudo|ssh|scp|rsync|surge|gh)\b`,
  String.raw`\bdb\s+(?:push|reset|execute|drop|seed)\b`, String.raw`\bdrizzle-kit\s+(?:push|drop|up)\b`,
  String.raw`\bgit\s+(?:push|commit|tag|reset|checkout|clean|merge|rebase|pull|am|apply|stash)\b`,
  String.raw`\bvercel\b(?!\s+(?:dev|build|pull|link|whoami)\b)`, String.raw`\bnetlify\b(?!\s+(?:dev|build|status)\b)`,
  String.raw`\bwrangler\b(?!\s+(?:dev|types|whoami)\b)`, String.raw`\bfirebase\b(?!\s+(?:emulators:\S+|serve)\b)`,
].join("|"), "i");
/** The scripts npm runs for an install of the project itself (its own lifecycle steps). */
export const INSTALL_STEPS = ["preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare"];
/** Whether one of the project's scripts (and the scripts npm runs around it, pre<name> and post<name>, and every script
 *  they run by name) changes data or puts something online (CHANGES_DATA), by its text or its name. */
function scriptsChangeData(names: string[], scripts: Record<string, unknown>): boolean {
  const all = Object.keys(scripts).filter((k) => typeof scripts[k] === "string").slice(0, 200);
  const seen = new Set<string>(), todo = names.flatMap((n) => [n, `pre${n}`, `post${n}`]);
  while (todo.length) {
    const n = todo.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    if (!Object.hasOwn(scripts, n) || typeof scripts[n] !== "string") continue;
    const text = scripts[n] as string;
    if (CHANGES_DATA.test(text) || CHANGES_DATA.test(n)) return true;
    for (const other of all) if (!seen.has(other) && names_(text, other)) todo.push(other, `pre${other}`, `post${other}`);
  }
  return false;
}
/** Whether a command a check would run changes data or puts something online: a "<package manager> run <name>" command is
 *  read through the project's scripts (scriptsChangeData), any other command (.claude/launch.json, .replit) by its own
 *  words, and by the script it runs when it is such a command. An install is read through the project's own install
 *  steps (INSTALL_STEPS). A Python command is the checker's own and is not read. */
export function changesData(command: string, dir: string, install = false): boolean {
  let scripts: Record<string, unknown> = {};
  try { const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); if (p && typeof p.scripts === "object" && p.scripts) scripts = p.scripts; } catch { /* no scripts */ }
  if (install) return scriptsChangeData(INSTALL_STEPS, scripts);
  const m = /^(?:npm|pnpm|yarn|bun)\s+run\s+(\S+)\s*$/.exec(command.trim());
  if (m) return scriptsChangeData([m[1]], scripts);
  if (CHANGES_DATA.test(command)) return true;
  const inner = /\b(?:npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:._-]+)/.exec(command);
  return inner ? scriptsChangeData([inner[1]], scripts) : false;
}

// Is this package manager on the Mac's tool path (the same path Companion runs commands with)?
let cachedPath: string[] | null = null;
// Tests set COMPANION_TEST_ASSUME_TOOLS (test/setup.ts), so their results never depend on which tools the Mac running them has.
export function installed(m: PackageManager, path?: string[]): boolean {
  if (!path && process.env.COMPANION_TEST_ASSUME_TOOLS === "1") return true;
  return (path ?? (cachedPath ??= (minimalEnv().PATH ?? "").split(":"))).some((d) => d && existsSync(join(d, m)));
}

/** The `run` line of a .replit file: a string or a list of words (possibly over several lines), never the one under
 *  [deployment]. A list becomes one shell command with each word quoted, so ["sh", "-c", "npm run dev"] stays intact. */
export function replitRun(text: string): string | null {
  const top = text.split(/^\s*\[/m)[0];
  const m = /^\s*run\s*=\s*([\s\S]*)$/m.exec(top);
  if (!m) return null;
  let v = m[1].trim();
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    if (end < 0) return null;
    try { const a = JSON.parse(v.slice(0, end + 1)); return Array.isArray(a) && a.length ? a.map((w) => /^[A-Za-z0-9_./:=@%+-]+$/.test(String(w)) ? String(w) : `'${String(w).replace(/'/g, "'\\''")}'`).join(" ") : null; } catch { return null; }
  }
  v = v.split("\n")[0].trim();
  const q = /^"((?:[^"\\]|\\.)*)"/.exec(v) ?? /^'([^']*)'/.exec(v);
  if (q) return q[1] || null;
  return v.replace(/\s+#.*$/, "").trim() || null;
}
