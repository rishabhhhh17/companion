// The proof ladder with the settings for checking a project (area 2 of the settings plan). With every setting at its usual
// value the ladder does exactly what it did before. A check left out is a gap, so the verdict is at best "passed with
// gaps", never "passed"; the start check and the browser check always run (F14); an install question nobody answers is a
// no, and the check then runs on the project as it is, with a gap. Commands, the project's server and the browser are stand
// ins here: nothing is installed, nothing is started, nothing reaches the network.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { DEFAULT_LIMITS, needsPackages, runLadder, scaleLimits, type LadderOptions } from "../src/proof/ladder.ts";
import { detectProject, usableStartScript, withStartScript } from "../src/proof/detect.ts";
import { startServer } from "../src/proof/server.ts";
import { captureBefore } from "../src/proof/before.ts";
import { checkSettings, installMode, USUAL_CHECK, VIEWPORTS, type CheckSettings } from "../src/proof/options.ts";
import type { BrowserOptions, BrowserResult } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";
import type { Start } from "../src/proof/detect.ts";
import type { Failed, Running } from "../src/proof/server.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-chkset-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };
const pkg = (scripts: Record<string, string>, deps: Record<string, string> = {}) => JSON.stringify({ name: "x", version: "1.0.0", scripts, dependencies: deps });
const PAGE = "<!doctype html><h1>Hello</h1>";
const ok = (): RunResult => ({ code: 0, stdout: "", stderr: "", timedOut: false } as RunResult);

type Seen = { runs: { command: string; timeoutMs: number }[]; browsers: { url: string; o: BrowserOptions }[]; servers: string[] };
// Like a real project: a script that needs the project's packages cannot run before they are installed (the shell answers
// 127, "command not found"), and installing them puts node_modules there.
const wantsPackages = (dir: string) => { try { const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); return Object.keys({ ...p.dependencies, ...p.devDependencies }).length > 0; } catch { return false; } };
const likeAProject = (command: string, cwd: string): RunResult => {
  if (/^(?:npm|pnpm|yarn|bun) install\b/.test(command)) { mkdirSync(join(cwd, "node_modules"), { recursive: true }); return ok(); }
  if (/ run /.test(command) && wantsPackages(cwd) && !existsSync(join(cwd, "node_modules"))) return { code: 127, stdout: "", stderr: "sh: vite: command not found", timedOut: false } as RunResult;
  return ok();
};
// The project's server, a stand in: it "starts" any server command and answers at a made up address, unless told otherwise.
const SERVED: Running = { ok: true, url: "http://127.0.0.1:9/", port: 9, stop: async () => {} };
async function check(files: Record<string, string>, o: Partial<LadderOptions> & { browserAnswer?: (o: BrowserOptions) => Partial<BrowserResult>; runAnswer?: (c: string, cwd: string) => RunResult; serverAnswer?: (command: string, cwd: string) => Running | Failed } = {}) {
  const dir = tmp();
  put(dir, files);
  const store = new CheckpointStore(tmp(), dir);
  const snap = await store.snapshot("now");
  const seen: Seen = { runs: [], browsers: [], servers: [] };
  const { browserAnswer, runAnswer, serverAnswer, ...rest } = o;
  const result = await runLadder({
    project: dir, store, beforeId: snap.id, afterId: snap.id, noRoomWaitsMs: [],
    run: async (command, ro) => { seen.runs.push({ command, timeoutMs: ro.timeoutMs }); return runAnswer?.(command, ro.cwd) ?? likeAProject(command, ro.cwd); },
    browser: async (url, bo) => { seen.browsers.push({ url, o: bo }); return { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1, ...(browserAnswer?.(bo) ?? {}) }; },
    server: async (start: Start, so) => {
      if (start.kind === "static") return startServer(start, so);   // a folder of files is served in this process, as always
      seen.servers.push(start.command);
      return serverAnswer?.(start.command, so.cwd) ?? SERVED;
    },
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
  const scripts = { dev: "vite", serve: "node server.js", preview: "vite preview" };
  const dir = () => { const d = tmp(); put(d, { "package.json": pkg(scripts) }); return d; };
  test("auto is today's choice", () => {
    const d = dir();
    expect(withStartScript(detectProject(d), d, "auto")).toEqual({ det: detectProject(d) });
    expect(detectProject(d).start).toEqual({ kind: "server", command: "npm run dev" });
  });
  test("one of the project's own scripts that starts it is used as it is", () => {
    const d = dir();
    expect(withStartScript(detectProject(d), d, "serve").det.start).toEqual({ kind: "server", command: "npm run serve" });
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
    expect(withStartScript(detectProject(d), d, "serve").det.start).toEqual({ kind: "server", command: "bun run serve", port: 4000 });
  });
  // Only a script that starts the project is ever run for a check: never one that deploys, publishes, deletes or changes data
  // or git, which would happen after every task, Rescue and Ship check with no question asked (rule 13).
  const risky = {
    dev: "vite", deploy: "vercel --prod", publish: "npm publish", "db:reset": "prisma migrate reset --force", clean: "rm -rf dist",
    build: "vite build", lint: "eslint .", test: "vitest", postinstall: "node setup.js", web: "node server.js",
    "start:prod": "vercel --prod", "start:ship": "npm run deploy", "dev:all": "run-p dev ship", ship: "netlify deploy --prod",
    start: "node server.js", prestart: "npm run deploy", "serve:db": "node server.js", "preserve:db": "prisma db push",
    "dev:deploy": "vite", "preview:clean": "vite preview",
  };
  test("a script that is not a way to start the project, or sounds like it deploys or deletes, is never run", () => {
    const d = tmp();
    put(d, { "package.json": pkg(risky) });
    const usual = detectProject(d).start;
    expect(usual).toEqual({ kind: "server", command: "npm run dev" });
    for (const name of ["deploy", "publish", "db:reset", "clean", "build", "lint", "test", "postinstall", "web", "start:prod", "start:ship", "dev:all", "start", "serve:db", "dev:deploy", "preview:clean"]) {
      const r = withStartScript(detectProject(d), d, name);
      expect(r.det.start, name).toEqual(usual);
      expect(r.gap, name).toContain(name);
    }
  });
  test("scripts run by a pattern are read too, and a file pattern is not taken for one", () => {
    const d = tmp();
    put(d, { "package.json": pkg({ dev: "vite", deploy: "vercel --prod", "dev:all": "concurrently \"npm:dev:*\"", "dev:web": "vite", "dev:push": "prisma db push", "start:lint": "eslint src/**/*.ts && vite" }) });
    expect(usableStartScript("dev:all", JSON.parse(readFileSync(join(d, "package.json"), "utf8")).scripts)).toBe(false);
    expect(usableStartScript("start:lint", JSON.parse(readFileSync(join(d, "package.json"), "utf8")).scripts)).toBe(true);
    expect(usableStartScript("dev:web", JSON.parse(readFileSync(join(d, "package.json"), "utf8")).scripts)).toBe(true);
    expect(usableStartScript("gone", {})).toBe(false);
  });
  test("through the ladder, 'deploy' and a script that runs 'vercel --prod' are never started", async () => {
    for (const start of ["deploy", "start:prod", "start:ship"]) {
      const { result, seen } = await check({ "package.json": pkg(risky) }, { check: all({ start }) });
      expect(seen.servers, start).toEqual(["npm run dev"]);
      expect(seen.runs.map((r) => r.command).join(" "), start).not.toMatch(/deploy|vercel|ship/);
      expect(result.verdict, start).toBe("passed_with_gaps");
      expect(result.gaps?.join(" "), start).toContain(start);
    }
  });
  test("a website whose chosen start script finishes on its own is never called passed: it is started the usual way and its page is still checked (F14)", async () => {
    const files = { "package.json": pkg({ dev: "vite", "start:once": "node print.js", build: "vite build" }) };
    const auto = await check(files);
    expect(auto.result.verdict).toBe("passed");
    expect(auto.seen.browsers).toHaveLength(1);
    const chosen = await check(files, { check: all({ start: "start:once" }), serverAnswer: (c) => (c === "npm run start:once" ? { ok: false, notAServer: true, reason: "The start command finished without staying on, so it is a tool and not a website." } : SERVED) });
    expect(chosen.seen.servers).toEqual(["npm run start:once", "npm run dev"]);
    expect(chosen.seen.browsers).toHaveLength(1);
    expect(chosen.result.steps.find((s) => s.rung === "browser")?.status).toBe("passed");
    expect(chosen.result.verdict).toBe("passed_with_gaps");
    expect(chosen.result.gaps?.join(" ")).toContain("start:once");
  });
  test("a build chosen as the start script never stands in for the browser check", async () => {
    const files = { "package.json": pkg({ dev: "vite", build: "vite build" }) };
    const { result, seen } = await check(files, { check: all({ start: "build" }), serverAnswer: (c) => (c === "npm run build" ? { ok: false, notAServer: true, reason: "finished" } : SERVED) });
    expect(seen.servers).toEqual(["npm run dev"]);
    expect(seen.browsers).toHaveLength(1);
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps).not.toEqual([]);
  });
  test("the before picture is started the same way: never with a risky script, and a chosen one that finishes on its own gives way to the usual start", async () => {
    const picture = async (scripts: Record<string, string>, start: string) => {
      const d = tmp(); put(d, { "package.json": pkg(scripts) });
      const store = new CheckpointStore(tmp(), d);
      const snap = await store.snapshot("before");
      const servers: string[] = [];
      const b = await captureBefore({ store, beforeId: snap.id, project: d, workDir: tmp(), start,
        server: async (st) => { servers.push(st.kind === "server" ? st.command : "static"); return st.kind === "server" && st.command === "npm run start:once" ? { ok: false, notAServer: true, reason: "finished" } : SERVED; },
        browser: async () => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 1, shot: { jpeg: "x", w: 1280, h: 800, items: [] } }) });
      return { b, servers };
    };
    const once = await picture({ dev: "vite", "start:once": "node print.js" }, "start:once");
    expect(once.servers).toEqual(["npm run start:once", "npm run dev"]);
    expect("shot" in once.b).toBe(true);
    const risky = await picture({ dev: "vite", "start:prod": "vercel --prod" }, "start:prod");
    expect(risky.servers).toEqual(["npm run dev"]);
  });
  test("a chosen start script that fails is a failure, and the start step names it; after the usual way, it names that", async () => {
    const files = { "package.json": pkg({ dev: "vite", "start:web": "node server.js", "start:once": "node print.js" }) };
    const crash: Failed = { ok: false, reason: "The server stopped on its own (exit code 1).", output: "Error: boom" };
    const own = await check(files, { check: all({ start: "start:web" }), serverAnswer: () => crash });
    expect(own.result.verdict).toBe("failed");
    expect(own.result.failedAt?.detail).toContain("chosen in Settings (start:web)");
    const usual = await check(files, { check: all({ start: "start:once" }), serverAnswer: (c) => (c === "npm run start:once" ? { ok: false, notAServer: true, reason: "finished" } : crash) });
    expect(usual.seen.servers).toEqual(["npm run start:once", "npm run dev"]);
    expect(usual.result.verdict).toBe("failed");
    expect(usual.result.failedAt?.detail).toContain("started the usual way");
    expect(usual.result.failedAt?.detail).not.toContain("It was started with the script chosen");
  });
  test("when the chosen script finishes on its own and there is no other way to start it, it is a gap: never passed", async () => {
    const files = { "package.json": pkg({ "start:once": "node print.js", build: "vite build" }) };
    const { result, seen } = await check(files, { check: all({ start: "start:once" }), serverAnswer: () => ({ ok: false, notAServer: true, reason: "finished" }) });
    expect(seen.servers).toEqual(["npm run start:once"]);
    expect(seen.browsers).toHaveLength(0);
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps?.join(" ")).toContain("start:once");
  });
});

describe("installing packages for a check (check.install)", () => {
  const files = { "package.json": pkg({ build: "vite build" }, { react: "18.0.0" }), "index.html": PAGE };
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
  // Without its packages a project's build cannot even start ("vite: command not found"). That says nothing about the code,
  // so it is a gap, never a failure: a task's fix loop must not send Claude to "fix" a build that only lacks its packages.
  test("packages not installed: a check that cannot run without them is a gap, never a failure blamed on the code", async () => {
    for (const o of [{ check: all({ install: "never" }) }, { check: all({ install: "ask" }), askInstall: async () => false }]) {
      const { result } = await check(files, o);
      expect(result.verdict).not.toBe("failed");
      expect(result.verdict).not.toBe("passed");
      expect(result.failedAt).toBeUndefined();
      expect(result.checks).toEqual([{ name: "build", status: "missing" }]);
      expect(result.gaps?.join(" ")).toMatch(/build could not run/i);
    }
  });
  test("with nothing that could run and no page, it is not checked: never failed, never passed", async () => {
    const { result } = await check({ "package.json": pkg({ build: "vite build", test: "vitest" }, { react: "18.0.0" }) }, { check: all({ install: "never" }) });
    expect(result.verdict).toBe("nothing_to_check");
    expect(result.unclear).toEqual([{ rung: "tests", missing: true }]);
  });
  test("the tests and starting the project that cannot run without the packages are gaps too", async () => {
    const pkgFiles = { "package.json": pkg({ dev: "vite", test: "vitest" }, { react: "18.0.0" }) };
    const { result, seen } = await check(pkgFiles, { check: all({ install: "never" }), serverAnswer: () => ({ ok: false, reason: "The server stopped on its own (exit code 127). sh: vite: command not found", output: "sh: vite: command not found" }) });
    expect(seen.servers).toEqual(["npm run dev"]);
    expect(result.verdict).not.toBe("failed");
    expect(result.steps.find((s) => s.rung === "tests")?.status).toBe("skipped");
    expect(result.steps.find((s) => s.rung === "start")?.status).toBe("skipped");
    expect(result.steps.find((s) => s.rung === "browser")?.status).toBe("skipped");
  });
  test("what reads as a missing package, and what is the project's own missing file", () => {
    for (const yes of ["sh: vite: command not found", "sh: 1: tsc: not found", "zsh: command not found: next", "Error: Cannot find module 'react'", "error TS2307: Cannot find module '@tanstack/react-query' or its corresponding type declarations.", "Cannot find package 'express' imported from /p/a.js", "[vite] Failed to resolve import \"zod\" from \"src/a.ts\"", "Module not found: Error: Can't resolve 'lodash/merge' in '/p/src'", "✘ [ERROR] Could not resolve \"react-dom\"", "Error: Cannot find module '/p/node_modules/vite/bin/vite.js'"]) expect(needsPackages(yes), yes).toBe(true);
    for (const no of ["Error: Cannot find module './util'", "Cannot find module '../lib/db'", "Can't resolve '@/components/Button'", "Failed to resolve import \"~/utils\"", "Cannot find module '/p/src/a.js'", "Type error: x is not a function", "npm error Missing script: \"build\"", ""]) expect(needsPackages(no), no).toBe(false);
  });
  test("a file of the project's own that is missing is still the code's failure, packages or not", async () => {
    const { result } = await check(files, { check: all({ install: "never" }), runAnswer: (c) => (c === "npm run build" ? { code: 1, stdout: "", stderr: "Error: Cannot find module './util'", timedOut: false } as RunResult : ok()) });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("checks");
  });
  test("with the packages installed, a failing build is still a failure", async () => {
    const { result } = await check(files, { runAnswer: (c, cwd) => (c === "npm run build" ? { code: 127, stdout: "", stderr: "sh: vite: command not found", timedOut: false } as RunResult : likeAProject(c, cwd)) });
    expect(result.verdict).toBe("failed");
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
