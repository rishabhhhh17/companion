// The proof ladder's verdicts where the audit of 20 Oct 2026 found it said more than it knew (A24, A25), called a Stop a
// failure (A26) or let the hidden browser run on after Stop (A27). Commands, the server and the browser are stand ins:
// nothing real runs.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder, type LadderOptions } from "../src/proof/ladder.ts";
import { detectProject, type Detected } from "../src/proof/detect.ts";
import type { BrowserOptions, BrowserResult } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-al-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); } };
const res = (o: Partial<RunResult> = {}): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const okBrowser = async (url: string): Promise<BrowserResult> => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 });
const okServer: NonNullable<LadderOptions["server"]> = async () => ({ ok: true, url: "http://127.0.0.1:1/", port: 1, stop: async () => {} });
const rungs = (r: { steps: { rung: string; status: string }[] }) => r.steps.map((s) => `${s.rung}:${s.status}`);

async function ladder(files: Record<string, string>, o: Partial<LadderOptions> = {}) {
  const dir = tmp();
  put(dir, files);
  const store = new CheckpointStore(tmp(), dir);
  const s = await store.snapshot("as it is");
  return { dir, result: await runLadder({ project: dir, store, beforeId: s.id, afterId: s.id, run: (async () => res()) as never, browser: okBrowser as never, server: okServer, limits: { startMs: 5000, browserMs: 5000 }, ...o }) };
}
const pkg = (scripts: Record<string, string>, deps: Record<string, string> = {}) => JSON.stringify({ name: "x", scripts, dependencies: deps });

describe("Stop during a check is a stop, never a failure (A26)", () => {
  for (const [rung, files, when] of [
    ["the install", { "package.json": pkg({ test: "bun test" }, { left: "1" }) }, /install/],
    ["a build check", { "package.json": pkg({ build: "vite build" }), "node_modules/.keep": "" }, /run build/],
    ["the tests", { "package.json": pkg({ test: "bun test" }), "node_modules/.keep": "" }, /run test/],
  ] as const) {
    test(`Stop during ${rung} ends the check as cancelled`, async () => {
      const ac = new AbortController();
      const run = async (c: string) => { if (when.test(c)) { ac.abort(); return res({ code: null, aborted: true }); } return res(); };
      const { result } = await ladder(files, { run: run as never, signal: ac.signal });
      expect(result.verdict).toBe("cancelled");
      expect(result.steps.some((s) => s.status === "failed")).toBe(false);
    });
  }
  test("Stop during the second model's review ends it as cancelled, not passed with gaps", async () => {
    const ac = new AbortController();
    const { result } = await ladder({ "package.json": pkg({ test: "bun test" }), "node_modules/.keep": "" }, { signal: ac.signal, review: async () => { ac.abort(); return null; } });
    expect(result.verdict).toBe("cancelled");
  });
});

describe("Stop reaches the hidden browser (A27)", () => {
  test("the ladder hands the browser its stop signal", async () => {
    const ac = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const browser = async (url: string, o: BrowserOptions) => { seen.push(o.signal); return okBrowser(url); };
    await ladder({ "package.json": pkg({ dev: "vite" }), "node_modules/.keep": "" }, { browser: browser as never, signal: ac.signal });
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(ac.signal);
  });
  test("a browser stopped by Stop makes the check cancelled, not passed with gaps", async () => {
    const ac = new AbortController();
    const browser = async () => { ac.abort(); return { ...(await okBrowser("x")), ok: false, skipped: "Stopped." }; };
    const { result } = await ladder({ "package.json": pkg({ dev: "vite" }), "node_modules/.keep": "" }, { browser: browser as never, signal: ac.signal });
    expect(result.verdict).toBe("cancelled");
  });
});

describe("a website whose start command just finishes is not proven (A24)", () => {
  const finishes: NonNullable<LadderOptions["server"]> = async () => ({ ok: false, notAServer: true, reason: "The start command finished without staying on." });
  test("a dev script that exits at once: passed with gaps, saying the page was not checked", async () => {
    const { result } = await ladder({ "package.json": pkg({ dev: "node server.js", test: "bun test" }, { express: "4" }), "node_modules/.keep": "" }, { server: finishes });
    expect(rungs(result)).toEqual(["install:skipped", "checks:skipped", "tests:passed", "start:skipped", "browser:skipped"]);
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps?.join(" ")).toMatch(/finished without opening a page/);
    expect(result.unclear?.map((u) => u.rung)).toEqual(["start", "browser"]);
  });
  test("a .claude/launch.json start that exits counts the same way", async () => {
    const { result } = await ladder({ ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: "npm", runtimeArgs: ["run", "web"] }] }), "package.json": pkg({ test: "bun test" }), "node_modules/.keep": "" }, { server: finishes });
    expect(result.verdict).toBe("passed_with_gaps");
  });
  test("a command line tool started with npm start is still a plain pass", async () => {
    const { result } = await ladder({ "package.json": pkg({ start: "node cli.js", test: "bun test" }), "cli.js": "console.log(1)", "node_modules/.keep": "" }, { server: finishes });
    expect(result.verdict).toBe("passed");
    expect(result.gaps).toBeUndefined();
  });
});

describe("pytest collecting nothing while the test files have tests (A25)", () => {
  const py: Detected = { ...detectProject(tmp()), kind: "python", packageManager: null, lockfile: null, checks: [{ name: "lint", command: ".venv/bin/python -m ruff check .", tool: "ruff" }], tests: { command: ".venv/bin/python -m pytest -q", tool: "pytest" }, start: null };
  const run = async (c: string) => (/pytest/.test(c) ? res({ code: 5, stdout: "no tests ran in 0.01s" }) : res());
  test("lint passing and pytest finding no tests, though tests/ has two: passed with gaps, never proven", async () => {
    const { result } = await ladder({ "tests/test_cart.py": "def test_total():\n    assert 1\n\ndef test_add():\n    assert 1\n", "conftest.py": "collect_ignore_glob = ['tests/*']\n" }, { run: run as never, detect: () => py });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps?.join(" ")).toMatch(/found no tests to run.*2/);
  });
  test("with no tests written yet, it stays as before: the lint pass is the evidence", async () => {
    const { result } = await ladder({ "main.py": "print(1)\n" }, { run: run as never, detect: () => py });
    expect(result.verdict).toBe("passed");
  });
});
