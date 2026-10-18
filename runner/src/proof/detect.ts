// What does this project have that can be checked? Looks only at ordinary files in the project.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { minimalEnv } from "../env.ts";
import { detectPython, looksPython, type PythonOptions, type PythonServer, type PythonSetup } from "./python.ts";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
// tool: for a Python check, the module it runs (so "No module named ruff" reads as not installed, not as a failure).
export type Check = { name: "typecheck" | "lint" | "build"; command: string; tool?: string };
// python: a Python dev server, told its host and port on the command line. env: fixed settings it needs (never the person's).
export type Start = { kind: "server"; command: string; port?: number; autoPort?: boolean; python?: PythonServer; env?: Record<string, string> } | { kind: "static"; dir: string };
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
    start = { kind: "server", command: [cfg.runtimeExecutable, ...(Array.isArray(cfg.runtimeArgs) ? cfg.runtimeArgs : [])].join(" "), ...(typeof cfg.port === "number" ? { port: cfg.port } : {}), ...(typeof cfg.autoPort === "boolean" ? { autoPort: cfg.autoPort } : {}) };
  } else if (pm && scripts.dev) start = { kind: "server", command: run("dev") };
  else if (pm && scripts.start) start = { kind: "server", command: run("start") };
  else if (py?.start) start = py.start;
  else if (existsSync(join(dir, ".replit")) && replitRun(readFileSync(join(dir, ".replit"), "utf8"))) start = { kind: "server", command: replitRun(readFileSync(join(dir, ".replit"), "utf8"))! };
  else if (existsSync(join(dir, "dist", "index.html"))) start = { kind: "static", dir: join(dir, "dist") };
  else if (existsSync(join(dir, "index.html"))) start = { kind: "static", dir };

  return { kind: hasPkg ? "node" : py ? "python" : start ? "static" : "unknown", packageManager: pm, lockfile: lock?.[0] ?? null, checks, tests, start, ...(py ? { python: py.setup } : {}) };
}

/** check.start in Settings: start the project with one of its own scripts instead of the one found. "auto" (or nothing)
 *  is today's choice. Only a script that is in package.json now, with a plain script name, is ever used, and only as
 *  "<package manager> run <name>", never as a command of its own; the project's own .claude/launch.json still wins. A
 *  script that is not there (any more) means the usual way, said as a gap. */
export function withStartScript(det: Detected, dir: string, script: string | undefined): { det: Detected; gap?: string } {
  if (!script || script === "auto") return { det };
  const launch = readJson(join(dir, ".claude", "launch.json"));
  if (Array.isArray(launch?.configurations) && launch!.configurations[0]?.runtimeExecutable) return { det };
  const pkg = det.packageManager ? readJson(join(dir, "package.json")) : null;
  const scripts: Record<string, unknown> = pkg && typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  if (!det.packageManager || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,59}$/.test(script) || !Object.hasOwn(scripts, script) || typeof scripts[script] !== "string") {
    return { det, gap: `The start script chosen in Settings (${script.slice(0, 60)}) is not in this project's package.json, so it was started the usual way.` };
  }
  return { det: { ...det, start: { kind: "server", command: `${det.packageManager} run ${script}` } } };
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
