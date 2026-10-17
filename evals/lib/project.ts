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

/** Every text file of the project (as listFiles sees it), for measuring a change afterwards. */
export function fileTexts(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of listFiles(dir)) out[f] = readFileSync(join(dir, f), "utf8");
  return out;
}

/** A text's lines; an empty text has none, and a last line break does not start another. */
const linesOf = (t: string): string[] => (t === "" ? [] : (t.endsWith("\n") ? t.slice(0, -1) : t).split("\n"));

/** Lines added and removed between two texts (a longest common run of lines; the eval's files are small). */
export function lineChanges(before: string, after: string): { added: number; removed: number } {
  if (before === after) return { added: 0, removed: 0 };
  const a = linesOf(before), b = linesOf(after);
  if (a.length * b.length > 4_000_000) return { added: b.length, removed: a.length };
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    prev = row;
  }
  const same = prev[b.length];
  return { added: b.length - same, removed: a.length - same };
}

/** How big a change was: the files it touched, and the lines it added and removed (M11 step 4 scores diff size). */
export function changeSize(before: Record<string, string>, after: Record<string, string>): { files: number; added: number; removed: number } {
  let files = 0, added = 0, removed = 0;
  for (const f of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[f] === after[f]) continue;
    const d = lineChanges(before[f] ?? "", after[f] ?? "");
    files++; added += d.added; removed += d.removed;
  }
  return { files, added, removed };
}

/** Each test's result by name, from the project's own test command run once more with a reporter that names them:
 *  `node --test` (TAP) and pytest (its short summary). Null when the project has neither, or it could not be read. A
 *  skipped test counts as not passing, so switching a test off is never a pass. */
export async function perTest(dir: string, timeoutMs = 60_000): Promise<Record<string, boolean> | null> {
  let script = "";
  try { script = String(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts?.test ?? ""); } catch { /* no package list */ }
  if (/^node(\s+--[\w-]+(=\S+)?)*\s+--test(\s|$)/.test(script) && !/[|&;<>`$]/.test(script)) {
    const words = script.trim().split(/\s+/);
    const r = await runCheck([words[0], "--test-reporter=tap", ...words.slice(1)], dir, {}, timeoutMs);
    return r.timedOut ? null : parseTap(r.output);
  }
  if (listFiles(dir).some((f) => /(^|\/)test_[\w-]*\.py$|_test\.py$/.test(f)) && needMet("python3:pytest")) {
    const r = await runCheck(["python3", "-m", "pytest", "-rA", "-q", "-p", "no:cacheprovider"], dir, {}, timeoutMs);
    return r.timedOut ? null : parsePytest(r.output);
  }
  return null;
}

/** node --test's TAP: "ok 1 - name" and "not ok 2 - name", subtests indented above their parent. Only the innermost tests
 *  are kept, named with their parents ("suite > test"). */
export function parseTap(text: string): Record<string, boolean> {
  const done: { depth: number; name: string; pass: boolean }[] = [];
  for (const line of text.split("\n")) {
    const m = /^(\s*)(not )?ok \d+ - (.*?)(\s+#\s*(SKIP|TODO)\b.*)?$/i.exec(line);
    if (!m) continue;
    const depth = m[1].length, name = m[3].trim(), pass = !m[2] && !m[4];
    const kids: typeof done = [];
    while (done.length && done[done.length - 1].depth > depth) kids.unshift(done.pop()!);
    if (kids.length) for (const k of kids) done.push({ depth, name: `${name} > ${k.name}`, pass: k.pass });
    else done.push({ depth, name, pass });
  }
  const out: Record<string, boolean> = {};
  for (const t of done) out[t.name] = t.pass;
  return out;
}

/** pytest -rA's short summary: "PASSED test_app.py::test_x", "FAILED test_app.py::test_y - AssertionError". */
export function parsePytest(text: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  // A skipped test is listed by its place ("SKIPPED [1] test_app.py:9: why"), not its name, so it only shows as gone.
  for (const m of text.matchAll(/^(PASSED|FAILED|ERROR|XFAIL|XPASS) (\S+)/gm)) out[m[2]] = m[1] === "PASSED" || m[1] === "XPASS";
  return out;
}

/** The tests that passed before and do not pass now (failed, switched off or gone), in plain words. */
export function testRegressions(before: Record<string, boolean> | null, after: Record<string, boolean> | null): string[] {
  if (!before || !after) return [];
  return Object.keys(before).filter((n) => before[n] && after[n] !== true).map((n) => `the test "${n}" passed before and ${n in after ? "fails now" : "no longer runs"}`);
}
