// Fixture projects for the eval sets: each case runs on a fresh copy in a temporary folder, never on the fixture itself and
// never in anyone's real project. Checks run there for real, with a short, plain environment (no keys).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { isTestFile } from "../../runner/src/proof/testguard.ts";

export const REPO = realpathSync(join(import.meta.dir, "..", ".."));
/** The TypeScript checker that ships with the app's own tools, so no case needs anything installed globally. */
export const TSC = join(REPO, "app", "node_modules", ".bin", "tsc");

export function have(bin: string): boolean {
  return bin.startsWith("/") ? existsSync(bin) : Bun.spawnSync(["which", bin]).exitCode === 0;
}
/** A need such as "bun", "python3" or "python3:flask,pytest" (Python with those modules importable). */
export function needMet(need: string): boolean {
  const [bin, mods] = need.split(":");
  if (!have(bin === "$TSC" ? TSC : bin)) return false;
  if (!mods) return true;
  return Bun.spawnSync([bin, "-c", mods.split(",").map((m) => `import ${m}`).join("; ")], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}

export function tempDir(label: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `companion-eval-${label}-`)));
}

/** A fresh copy of a fixture, with any files laid over it (for example a package.json that names the project's check). */
export function copyProject(src: string, overlay: Record<string, string> = {}): string {
  const dir = tempDir("project");
  cpSync(src, dir, { recursive: true });
  for (const [file, text] of Object.entries(overlay)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

export const removeDir = (dir: string) => rmSync(dir, { recursive: true, force: true });

/** $TSC, $HIDDEN (the set's folder of checks kept outside the projects) and $REPO in a command. */
export function resolveCmd(cmd: string[], hidden: string): string[] {
  return cmd.map((c) => c.replace(/\$TSC/g, TSC).replace(/\$HIDDEN/g, hidden).replace(/\$REPO/g, REPO));
}

export type CheckRun = { pass: boolean; code: number | null; output: string; timedOut: boolean };

/** Runs one check in the project, for real, with a plain environment and a time limit. */
export async function runCheck(cmd: string[], cwd: string, env: Record<string, string> = {}, timeoutMs = 60_000): Promise<CheckRun> {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: cwd, NO_COLOR: "1", PYTHONDONTWRITEBYTECODE: "1", ...env } });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; p.kill(); }, timeoutMs);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  return { pass: code === 0 && !timedOut, code, output: (out + "\n" + err).trim().slice(-2000), timedOut };
}

/** Every file of the project (not node_modules or .git), as relative paths. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === "node_modules" || n === ".git" || n === "__pycache__" || n === ".pytest_cache") continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

/** A fingerprint of every test file, so a run can say whether the tests were touched. */
export function testPrint(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of listFiles(dir)) if (isTestFile(f)) out[f] = createHash("sha256").update(readFileSync(join(dir, f))).digest("hex");
  return out;
}
export function testsChanged(before: Record<string, string>, after: Record<string, string>): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((n) => before[n] !== after[n]).sort();
}

/** The reference change for a case, as the edits a scripted agent makes through Companion's own tools. */
export type FixStep = { edit: string; old: string; new: string } | { write: string; content: string } | { delete: string };

/** Applies the steps to a folder directly (for checking that a reference fix still fits its fixture). */
export function applySteps(dir: string, steps: FixStep[]): string[] {
  const problems: string[] = [];
  for (const s of steps) {
    if ("edit" in s) {
      const f = join(dir, s.edit);
      const text = existsSync(f) ? readFileSync(f, "utf8") : null;
      if (text === null) { problems.push(`${s.edit} is not there`); continue; }
      const at = text.indexOf(s.old);
      if (at < 0) { problems.push(`${s.edit}: the text to replace is not there`); continue; }
      if (text.indexOf(s.old, at + 1) >= 0) problems.push(`${s.edit}: the text to replace is there more than once`);
      writeFileSync(f, text.replace(s.old, s.new));
    } else if ("write" in s) { mkdirSync(dirname(join(dir, s.write)), { recursive: true }); writeFileSync(join(dir, s.write), s.content); }
    else rmSync(join(dir, s.delete), { force: true });
  }
  return problems;
}
