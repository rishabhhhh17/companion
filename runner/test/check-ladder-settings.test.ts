// The proof ladder with the settings for checking a project (area 2 of the settings plan). With every setting at its usual
// value the ladder does exactly what it did before. A check left out is a gap, so the verdict is at best "passed with
// gaps", never "passed"; the start check and the browser check always run (F14); an install question nobody answers is a
// no, and the check then runs on the project as it is, with a gap. Commands and the browser are stand ins here: nothing is
// installed, nothing reaches the network.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { DEFAULT_LIMITS, runLadder, scaleLimits, type LadderOptions } from "../src/proof/ladder.ts";
import { detectProject, withStartScript } from "../src/proof/detect.ts";
import { checkSettings, installMode, USUAL_CHECK, VIEWPORTS, type CheckSettings } from "../src/proof/options.ts";
import type { BrowserOptions, BrowserResult } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-chkset-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };
const pkg = (scripts: Record<string, string>, deps: Record<string, string> = {}) => JSON.stringify({ name: "x", version: "1.0.0", scripts, dependencies: deps });
const PAGE = "<!doctype html><h1>Hello</h1>";
const ok = (): RunResult => ({ code: 0, stdout: "", stderr: "", timedOut: false } as RunResult);

type Seen = { runs: { command: string; timeoutMs: number }[]; browsers: { url: string; o: BrowserOptions }[] };
async function check(files: Record<string, string>, o: Partial<LadderOptions> & { browserAnswer?: (o: BrowserOptions) => Partial<BrowserResult>; runAnswer?: (c: string) => RunResult } = {}) {
  const dir = tmp();
  put(dir, files);
  const store = new CheckpointStore(tmp(), dir);
  const snap = await store.snapshot("now");
  const seen: Seen = { runs: [], browsers: [] };
  const { browserAnswer, runAnswer, ...rest } = o;
  const result = await runLadder({
    project: dir, store, beforeId: snap.id, afterId: snap.id, noRoomWaitsMs: [],
    run: async (command, ro) => { seen.runs.push({ command, timeoutMs: ro.timeoutMs }); return runAnswer?.(command) ?? ok(); },
    browser: async (url, bo) => { seen.browsers.push({ url, o: bo }); return { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1, ...(browserAnswer?.(bo) ?? {}) }; },
    ...rest,
  });
  return { result, seen, dir };
}
const all = (p: Partial<CheckSettings>): CheckSettings => ({ ...USUAL_CHECK, ...p });

describe("with every setting at its usual value, nothing changes", () => {
  test("the same commands with the same limits, and the browser asked exactly as before", async () => {
    const files = { "package.json": pkg({ typecheck: "tsc", lint: "eslint .", build: "vite build", test: "vitest" }), "index.html": PAGE };
    const plain = await check(files);
    const usual = await check(files, { check: USUAL_CHECK, limits: scaleLimits(1) });
    expect(usual.seen.runs).toEqual(plain.seen.runs);
    expect(plain.seen.runs.map((r) => r.command)).toEqual(["npm run typecheck", "npm run lint", "npm run build", "npm run test"]);
    expect(plain.seen.runs.every((r) => r.timeoutMs === DEFAULT_LIMITS.checkMs)).toBe(true);
    expect(usual.seen.browsers.map((b) => b.o)).toEqual(plain.seen.browsers.map((b) => b.o));
    expect(plain.seen.browsers[0].o).toEqual({ timeoutMs: DEFAULT_LIMITS.browserMs, shot: true });
    expect(usual.result.verdict).toBe("passed");
    expect(usual.result.gaps).toBeUndefined();
  });
  test("nothing applied reads as the usual values", () => {
    expect(checkSettings(() => undefined)).toEqual(USUAL_CHECK);
    expect(scaleLimits(1)).toEqual(DEFAULT_LIMITS);
  });
});

describe("checks to leave out (check.skip)", () => {
  const files = { "package.json": pkg({ lint: "eslint .", build: "vite build", test: "vitest" }), "index.html": PAGE };
  test("a check left out is not run, and is a gap: passed with gaps, never passed", async () => {
    const { result, seen } = await check(files, { check: all({ skip: ["lint"] }) });
    expect(seen.runs.map((r) => r.command)).toEqual(["npm run build", "npm run test"]);
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps?.join(" ")).toContain("turned off in Settings");
    expect(result.gaps?.join(" ")).toContain("lint");
  });
  test("the tests left out are not run, and are a gap", async () => {
    const { result, seen } = await check(files, { check: all({ skip: ["test"] }) });
    expect(seen.runs.map((r) => r.command)).toEqual(["npm run lint", "npm run build"]);
    expect(result.steps.find((s) => s.rung === "tests")).toMatchObject({ status: "skipped" });
    expect(result.verdict).toBe("passed_with_gaps");
  });
  test("every check left out still opens the page: the start and browser checks always run (F14)", async () => {
    const { result, seen } = await check(files, { check: all({ skip: ["typecheck", "lint", "build", "test"] }) });
    expect(seen.runs).toEqual([]);
    expect(seen.browsers.length).toBe(1);
    expect(result.steps.find((s) => s.rung === "browser")?.status).toBe("passed");
    expect(result.verdict).toBe("passed_with_gaps");
  });
  test("even a value that slipped past every rule cannot leave out the start or the browser check", async () => {
    const { seen, result } = await check(files, { check: { skip: ["start", "browser", "review"] as never } });
    expect(seen.browsers.length).toBe(1);
    expect(result.steps.find((s) => s.rung === "start")?.status).toBe("passed");
    expect(result.verdict).toBe("passed");
  });
  test("left out, a failing check is not run, but a weakened test still fails the check", async () => {
    const dir = tmp();
    put(dir, { "package.json": pkg({ test: "vitest" }), "a.test.ts": "test('a', () => { expect(1).toBe(1); });\ntest('b', () => { expect(2).toBe(2); });\n" });
    const store = new CheckpointStore(tmp(), dir);
    const b = await store.snapshot("before");
    put(dir, { "a.test.ts": "test.skip('a', () => { expect(1).toBe(1); });\ntest.skip('b', () => { expect(2).toBe(2); });\n" });
    const a = await store.snapshot("after");
    const r = await runLadder({ project: dir, store, beforeId: b.id, afterId: a.id, check: { skip: ["test"] }, run: async () => ok(), browser: async () => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 1 }) });
    expect(r.verdict).toBe("failed");
    expect(r.failedAt?.rung).toBe("tests");
  });
  test("a project with nothing left to check and nothing to open is never called passed", async () => {
    const { result } = await check({ "package.json": pkg({ build: "vite build", test: "vitest" }) }, { check: all({ skip: ["build", "test"] }) });
    expect(result.verdict).not.toBe("passed");
    expect(result.verdict).not.toBe("passed_with_gaps");
  });
});

describe("time allowed for checks (check.time)", () => {
  test("longer is twice today's limits and longest four times, for every rung", () => {
    for (const [f, n] of [[2, 2], [4, 4]] as const) {
      const l = scaleLimits(f);
      expect(l).toEqual({ installMs: DEFAULT_LIMITS.installMs * n, checkMs: DEFAULT_LIMITS.checkMs * n, testMs: DEFAULT_LIMITS.testMs * n, startMs: DEFAULT_LIMITS.startMs * n, browserMs: DEFAULT_LIMITS.browserMs * n });
    }
  });
  test("the limits given reach the commands and the browser", async () => {
    const { seen } = await check({ "package.json": pkg({ build: "vite build" }), "index.html": PAGE }, { limits: scaleLimits(4) });
    expect(seen.runs[0].timeoutMs).toBe(DEFAULT_LIMITS.checkMs * 4);
    expect(seen.browsers[0].o.timeoutMs).toBe(DEFAULT_LIMITS.browserMs * 4);
  });
});

describe("how to start the project for the check (check.start)", () => {
  const scripts = { dev: "vite", web: "node server.js", preview: "vite preview" };
  const dir = () => { const d = tmp(); put(d, { "package.json": pkg(scripts) }); return d; };
  test("auto is today's choice", () => {
    const d = dir();
    expect(withStartScript(detectProject(d), d, "auto")).toEqual({ det: detectProject(d) });
    expect(detectProject(d).start).toEqual({ kind: "server", command: "npm run dev" });
  });
  test("one of the project's own scripts is used as it is", () => {
    const d = dir();
    expect(withStartScript(detectProject(d), d, "web").det.start).toEqual({ kind: "server", command: "npm run web" });
  });
  test("through the ladder, a script that is gone is said in the start step and is a gap", async () => {
    const { result } = await check({ "package.json": pkg({ build: "vite build" }), "index.html": PAGE }, { check: all({ start: "gone" }) });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.steps.find((s) => s.rung === "start")?.detail).toContain("gone");
  });
  test("a script that is not there any more falls back to the usual way, and says so as a gap", () => {
    const d = dir();
    const r = withStartScript(detectProject(d), d, "gone");
    expect(r.det.start).toEqual({ kind: "server", command: "npm run dev" });
    expect(r.gap).toContain("gone");
  });
  test("a name that is not a script name is never run, whatever reached the engine", () => {
    const d = tmp();
    put(d, { "package.json": JSON.stringify({ scripts: { dev: "vite", "dev; rm -rf ~": "x" } }) });
    const r = withStartScript(detectProject(d), d, "dev; rm -rf ~");
    expect(r.det.start).toEqual({ kind: "server", command: "npm run dev" });
    expect(r.gap).toBeTruthy();
  });
  test("the project's own .claude/launch.json still wins", () => {
    const d = dir();
    put(d, { ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: "bun", runtimeArgs: ["run", "serve"], port: 4000 }] }) });
    expect(withStartScript(detectProject(d), d, "web").det.start).toEqual({ kind: "server", command: "bun run serve", port: 4000 });
  });
});

describe("installing packages for a check (check.install)", () => {
  const files = { "package.json": pkg({ build: "vite build" }, { react: "18.0.0" }) };
  const installs = (s: Seen) => s.runs.filter((r) => r.command === "npm install").length;
  test("auto installs, as today", async () => {
    const { seen, result } = await check(files);
    expect(installs(seen)).toBe(1);
    expect(result.verdict).toBe("passed");
  });
  test("ask asks first; a yes installs", async () => {
    const asked: string[] = [];
    const { seen, result } = await check(files, { check: all({ install: "ask" }), askInstall: async (c) => { asked.push(c); return true; } });
    expect(asked).toEqual(["npm install"]);
    expect(installs(seen)).toBe(1);
    expect(result.verdict).toBe("passed");
  });
  test("a no, or no answer, installs nothing: the check runs on the project as it is, with a gap", async () => {
    for (const answer of [async () => false, async () => { throw new Error("expired"); }]) {
      const { seen, result } = await check(files, { check: all({ install: "ask" }), askInstall: answer });
      expect(installs(seen)).toBe(0);
      expect(seen.runs.map((r) => r.command)).toEqual(["npm run build"]);
      expect(result.steps.find((s) => s.rung === "install")?.status).toBe("skipped");
      expect(result.verdict).toBe("passed_with_gaps");
    }
  });
  test("ask with nobody to ask is a no", async () => {
    const { seen, result } = await check(files, { check: all({ install: "ask" }) });
    expect(installs(seen)).toBe(0);
    expect(result.verdict).toBe("passed_with_gaps");
  });
  test("never installs nothing and reports the missing packages as a gap", async () => {
    const { seen, result } = await check(files, { check: all({ install: "never" }), askInstall: async () => true });
    expect(installs(seen)).toBe(0);
    expect(result.gaps?.join(" ")).toMatch(/not installed/i);
    expect(result.verdict).toBe("passed_with_gaps");
  });
  test("the house rule 'ask before installing packages' makes auto ask, and an unreadable rules file does too", async () => {
    const asked: string[] = [];
    const { seen } = await check({ ...files, ".companion/rules.txt": "ask before installing packages\n" }, { askInstall: async (c) => { asked.push(c); return false; } });
    expect(asked).toEqual(["npm install"]);
    expect(installs(seen)).toBe(0);
    expect(installMode("auto", [{ kind: "ask_install" }])).toBe("ask");
    expect(installMode("auto", [], true)).toBe("ask");
    expect(installMode("never", [{ kind: "ask_install" }])).toBe("never");
    expect(installMode("ask", [])).toBe("ask");
    expect(installMode(undefined, [])).toBe("auto");
  });
  test("when nothing needs installing, nobody is asked", async () => {
    let asked = 0;
    await check({ "package.json": pkg({ build: "vite build" }) }, { check: all({ install: "ask" }), askInstall: async () => { asked++; return true; } });
    expect(asked).toBe(0);
  });
  test("Point at the problem never installs, whatever the setting, exactly as before", async () => {
    const { seen, result } = await check(files, { noInstall: true, check: all({ install: "auto" }), askInstall: async () => true });
    expect(installs(seen)).toBe(0);
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("install");
  });
});

describe("what the page must show, a button to press, and words after it", () => {
  test("the settings' words and button reach the browser check", async () => {
    const { seen } = await check({ "index.html": PAGE }, { check: all({ mustSee: ["Hello", "Sign up"], press: "Add to cart", afterPress: "1 item" }) });
    expect(seen.browsers[0].o).toMatchObject({ expectText: ["Hello", "Sign up"], press: "Add to cart", expectAfterPress: "1 item" });
    expect(seen.browsers[0].o.click).toBeUndefined();
  });
  test("words after pressing need a button to press", async () => {
    const { seen } = await check({ "index.html": PAGE }, { check: all({ afterPress: "1 item" }) });
    expect(seen.browsers[0].o.expectAfterPress).toBeUndefined();
    expect(seen.browsers[0].o.press).toBeUndefined();
  });
  test("a project's own .claude/proof.json is used instead, exactly as before", async () => {
    const proof = { expectText: ["From the file"], click: "#buy", expectAfterClick: "Thanks" };
    const { seen } = await check({ "index.html": PAGE, ".claude/proof.json": JSON.stringify(proof) }, { check: all({ mustSee: ["From settings"], press: "Go" }) });
    expect(seen.browsers[0].o).toMatchObject(proof);
    expect(seen.browsers[0].o.press).toBeUndefined();
    expect(JSON.stringify(seen.browsers[0].o)).not.toContain("From settings");
  });
  test("a button the check would not press is a gap, never a pass", async () => {
    const { result } = await check({ "index.html": PAGE }, { check: all({ press: "Delete account" }), browserAnswer: () => ({ gaps: ["The check did not press \"Delete account\"."] }) });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps).toContain("The check did not press \"Delete account\".");
    // Said where the person reads the check, not only in the verdict.
    expect(result.steps.find((s) => s.rung === "browser")?.detail).toContain("did not press");
  });
});

describe("page size for the browser check (check.pageSize)", () => {
  test("desktop is today's: no other size is asked for", async () => {
    const { seen } = await check({ "index.html": PAGE }, { check: all({ pageSize: "desktop" }) });
    expect(seen.browsers.length).toBe(1);
    expect(seen.browsers[0].o.viewport).toBeUndefined();
  });
  test("phone opens it once at phone size, picture included", async () => {
    const { seen } = await check({ "index.html": PAGE }, { check: all({ pageSize: "phone" }) });
    expect(seen.browsers.map((b) => [b.o.viewport, b.o.shot])).toEqual([[VIEWPORTS.phone, true]]);
  });
  test("both opens it twice, desktop first with the picture, then phone", async () => {
    const { seen, result } = await check({ "index.html": PAGE }, { check: all({ pageSize: "both" }) });
    expect(seen.browsers.map((b) => [b.o.viewport, b.o.shot])).toEqual([[undefined, true], [VIEWPORTS.phone, false]]);
    expect(result.verdict).toBe("passed");
  });
  test("a problem at phone size fails the check, and says which size", async () => {
    const { result } = await check({ "index.html": PAGE }, { check: all({ pageSize: "both" }), browserAnswer: (o) => (o.viewport ? { ok: false, problems: ["The words \"Menu\" are not on the page"] } : {}) });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.detail).toContain("phone size");
  });
});
