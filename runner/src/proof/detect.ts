// What does this project have that can be checked? Looks only at ordinary files in the project.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type Check = { name: "typecheck" | "lint" | "build"; command: string };
export type Start = { kind: "server"; command: string; port?: number; autoPort?: boolean } | { kind: "static"; dir: string };
export type Detected = {
  kind: "node" | "static" | "unknown";
  packageManager: PackageManager | null;
  lockfile: string | null;
  checks: Check[];
  tests: { command: string } | null;
  start: Start | null;
};

const LOCKS: [string, PackageManager][] = [["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"]];

function readJson(path: string): Record<string, any> | null {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export function detectProject(dir: string): Detected {
  const pkgPath = join(dir, "package.json");
  const hasPkg = existsSync(pkgPath);
  const pkg = hasPkg ? readJson(pkgPath) ?? {} : {};
  const scripts: Record<string, string> = typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  const lock = LOCKS.find(([f]) => existsSync(join(dir, f)));
  const declared = typeof pkg.packageManager === "string" ? (/^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager)?.[1] as PackageManager | undefined) : undefined;
  const pm: PackageManager | null = hasPkg ? lock?.[1] ?? declared ?? "npm" : null;
  const run = (name: string) => `${pm} run ${name}`;

  const checks: Check[] = [];
  for (const [name, candidates] of [["typecheck", ["typecheck", "type-check"]], ["lint", ["lint"]], ["build", ["build"]]] as const) {
    const s = candidates.find((c) => scripts[c]);
    if (pm && s) checks.push({ name, command: run(s) });
  }
  // npm's default placeholder is not a test.
  const tests = pm && scripts.test && !/no test specified/i.test(scripts.test) ? { command: run("test") } : null;

  let start: Start | null = null;
  const launch = readJson(join(dir, ".claude", "launch.json"));
  const cfg = Array.isArray(launch?.configurations) ? launch!.configurations[0] : null;
  if (cfg?.runtimeExecutable) {
    start = { kind: "server", command: [cfg.runtimeExecutable, ...(Array.isArray(cfg.runtimeArgs) ? cfg.runtimeArgs : [])].join(" "), ...(typeof cfg.port === "number" ? { port: cfg.port } : {}), ...(typeof cfg.autoPort === "boolean" ? { autoPort: cfg.autoPort } : {}) };
  } else if (pm && scripts.dev) start = { kind: "server", command: run("dev") };
  else if (pm && scripts.start) start = { kind: "server", command: run("start") };
  else if (existsSync(join(dir, "dist", "index.html"))) start = { kind: "static", dir: join(dir, "dist") };
  else if (existsSync(join(dir, "index.html"))) start = { kind: "static", dir };

  return { kind: hasPkg ? "node" : start ? "static" : "unknown", packageManager: pm, lockfile: lock?.[0] ?? null, checks, tests, start };
}
