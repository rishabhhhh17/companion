// The ladder's basic pieces: running a command safely, knowing what a project has, and noticing
// when a task weakened the tests. Temporary folders only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "../src/proof/exec.ts";
import { detectProject } from "../src/proof/detect.ts";
import { analyzeTests } from "../src/proof/testguard.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-proof-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } return root; };

describe("running a command with a time limit", () => {
  test("captures output and a zero exit code", async () => {
    const r = await runCommand("echo hello", { cwd: tmp(), timeoutMs: 5000 });
    expect(r).toMatchObject({ code: 0, timedOut: false });
    expect(r.stdout.trim()).toBe("hello");
  });
  test("a failing command reports its exit code and the error text", async () => {
    const r = await runCommand("echo oops >&2; exit 3", { cwd: tmp(), timeoutMs: 5000 });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("oops");
  });
  test("a command that runs too long is stopped, children included", async () => {
    const dir = tmp();
    const t0 = Date.now();
    const r = await runCommand(`sh -c 'sleep 30 & echo $! > pid.txt; wait'`, { cwd: dir, timeoutMs: 600 });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - t0).toBeLessThan(5000);
    await Bun.sleep(200);
    const pid = Number((await Bun.file(join(dir, "pid.txt")).text()).trim());
    expect(() => process.kill(pid, 0)).toThrow();   // the child is gone too
  });
  test("it runs in the folder it was given", async () => {
    const dir = tmp();
    expect((await runCommand("pwd", { cwd: dir, timeoutMs: 5000 })).stdout.trim()).toBe(dir);
  });
  test("account keys are not visible to project commands, and CI is on", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-FAKEFAKEFAKEFAKEFAKE0123456789";
    try {
      const r = await runCommand("env", { cwd: tmp(), timeoutMs: 5000 });
      expect(r.stdout).not.toContain("FAKEFAKE");
      expect(r.stdout).not.toContain("ANTHROPIC_API_KEY");
      expect(r.stdout).toContain("CI=1");
    } finally { delete process.env.ANTHROPIC_API_KEY; }
  });
  test("very long output is cut to the end, where the error usually is", async () => {
    const r = await runCommand(`i=0; while [ $i -lt 3000 ]; do echo "line $i"; i=$((i+1)); done`, { cwd: tmp(), timeoutMs: 10000 });
    expect(r.stdout.length).toBeLessThanOrEqual(8000);
    expect(r.stdout).toContain("line 2999");
  });
  test("a command that does not exist fails cleanly", async () => {
    const r = await runCommand("definitely-not-a-command-xyz", { cwd: tmp(), timeoutMs: 5000 });
    expect(r.code).not.toBe(0);
  });
});

describe("what a project has", () => {
  test("a Node project: its scripts, in the order they run", () => {
    const d = put(tmp(), { "package.json": JSON.stringify({ scripts: { build: "tsc", typecheck: "tsc --noEmit", lint: "eslint .", test: "vitest run", dev: "vite" } }), "package-lock.json": "{}" });
    const p = detectProject(d);
    expect(p.kind).toBe("node");
    expect(p.packageManager).toBe("npm");
    expect(p.checks.map((c) => c.name)).toEqual(["typecheck", "lint", "build"]);
    expect(p.tests?.command).toBe("npm run test");
    expect(p.start).toMatchObject({ kind: "server", command: "npm run dev" });
  });
  test("the package manager follows the lock file", () => {
    for (const [lock, pm] of [["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"]] as const) {
      expect(detectProject(put(tmp(), { "package.json": "{}", [lock]: "" })).packageManager).toBe(pm);
    }
    expect(detectProject(put(tmp(), { "package.json": "{}" })).packageManager).toBe("npm");
  });
  test("the lock file's name is reported so a change in it can trigger an install", () => {
    expect(detectProject(put(tmp(), { "package.json": "{}", "bun.lock": "x" })).lockfile).toBe("bun.lock");
    expect(detectProject(put(tmp(), { "package.json": "{}" })).lockfile).toBeNull();
  });
  test("npm's placeholder test script is not a test", () => {
    const d = put(tmp(), { "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) });
    expect(detectProject(d).tests).toBeNull();
  });
  test("a start command in .claude/launch.json wins, with its port", () => {
    const d = put(tmp(), { "package.json": JSON.stringify({ scripts: { dev: "vite", start: "node x" } }), ".claude/launch.json": JSON.stringify({ version: "0.0.1", configurations: [{ name: "web", runtimeExecutable: "npm", runtimeArgs: ["run", "serve"], port: 4321, autoPort: true }] }) });
    expect(detectProject(d).start).toEqual({ kind: "server", command: "npm run serve", port: 4321, autoPort: true });
  });
  test("without launch.json the dev script, then the start script, is used", () => {
    expect(detectProject(put(tmp(), { "package.json": JSON.stringify({ scripts: { start: "node s.js" } }) })).start).toMatchObject({ kind: "server", command: "npm run start" });
  });
  test("a plain page with an index.html and no scripts is checked as a static page", () => {
    expect(detectProject(put(tmp(), { "index.html": "<h1>x</h1>" })).start).toEqual({ kind: "static", dir: expect.any(String) });
  });
  test("a built folder (dist) is preferred for a static page when there is no server script", () => {
    const d = put(tmp(), { "package.json": JSON.stringify({ scripts: { build: "vite build" } }), "dist/index.html": "<h1>x</h1>" });
    const s = detectProject(d).start;
    expect(s).toMatchObject({ kind: "static" });
    expect((s as { dir: string }).dir.endsWith("dist")).toBe(true);
  });
  test("a folder with nothing to check says so, rather than pretending", () => {
    const p = detectProject(put(tmp(), { "notes.txt": "hi" }));
    expect(p.kind).toBe("unknown");
    expect(p.start).toBeNull();
    expect(p.checks).toEqual([]);
  });
  test("a broken package.json does not crash detection", () => {
    expect(() => detectProject(put(tmp(), { "package.json": "{not json" }))).not.toThrow();
  });
});

describe("noticing weakened tests", () => {
  const T = (n: number, extra = "") => Array.from({ length: n }, (_, i) => `test("t${i}", () => {});`).join("\n") + extra;
  test("the same tests before and after is fine", () => {
    const r = analyzeTests({ "a.test.ts": T(3) }, { "a.test.ts": T(3) });
    expect(r).toMatchObject({ ok: true, before: 3, after: 3 });
  });
  test("more tests is fine", () => expect(analyzeTests({ "a.test.ts": T(3) }, { "a.test.ts": T(5) }).ok).toBe(true));
  test("fewer tests is flagged, with the numbers", () => {
    const r = analyzeTests({ "a.test.ts": T(5) }, { "a.test.ts": T(3) });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/5.*3|fewer/i);
  });
  test("a deleted test file is flagged by name", () => {
    const r = analyzeTests({ "a.test.ts": T(2), "b.test.ts": T(2) }, { "a.test.ts": T(2) });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("b.test.ts");
  });
  test("a newly skipped test is flagged", () => {
    expect(analyzeTests({ "a.test.ts": T(2) }, { "a.test.ts": T(2).replace('test("t1"', 'test.skip("t1"') }).ok).toBe(false);
    expect(analyzeTests({ "a.test.ts": T(2) }, { "a.test.ts": T(2).replace('test("t1"', 'xit("t1"') }).ok).toBe(false);
  });
  test("a newly added .only is flagged because it silences the rest", () => {
    expect(analyzeTests({ "a.test.ts": T(2) }, { "a.test.ts": T(2).replace('test("t1"', 'test.only("t1"') }).ok).toBe(false);
  });
  test("a skip added on top of the same number of live tests is still flagged", () => {
    const r = analyzeTests({ "a.test.ts": T(2) }, { "a.test.ts": T(2, '\ntest.skip("added", () => {});') });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/switched off/i);
  });
  test("an only added on top of the same number of live tests is still flagged", () => {
    const r = analyzeTests({ "a.test.ts": T(2) }, { "a.test.ts": T(2, '\ntest.only("added", () => {});') });
    expect(r.ok).toBe(false);
  });
  test("a skip that was already there is not blamed on this task", () => {
    const withSkip = T(2) + '\ntest.skip("old", () => {});';
    expect(analyzeTests({ "a.test.ts": withSkip }, { "a.test.ts": withSkip }).ok).toBe(true);
  });
  test("files that are not tests are ignored", () => {
    expect(analyzeTests({ "src/a.ts": 'test("x")' }, { "src/a.ts": "" }).ok).toBe(true);
  });
  test("tests in a tests folder and spec files count too", () => {
    const r = analyzeTests({ "tests/x.ts": T(2), "src/y.spec.js": T(1) }, { "tests/x.ts": T(2), "src/y.spec.js": "" });
    expect(r.ok).toBe(false);
  });
  test("no tests before and none after is fine", () => expect(analyzeTests({}, {}).ok).toBe(true));
  test("moving tests to another file still flags the removed file, so a person looks", () => {
    expect(analyzeTests({ "a.test.ts": T(4) }, { "b.test.ts": T(4) }).problems.join(" ")).toContain("a.test.ts");
  });
});
