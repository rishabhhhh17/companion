// The practices without Node (M49, spikes/practice-bun): which way a project's checks run (Node here, Node missing with the
// engine's own Bun, neither), that only a practice copy ever uses Bun, and the practices' real checks passing and failing
// in the safety box for checks with no Node on the path. Temporary folders only, never git, never the network.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { detectProject, type Detected } from "../src/proof/detect.ts";
import { readProject, runLadder } from "../src/proof/ladder.ts";
import { runCommand, type RunOptions } from "../src/proof/exec.ts";
import { startServer } from "../src/proof/server.ts";
import { locateProblem } from "../src/proof/locate.ts";
import { bunServer, bunTests, engineBun, isPracticeProject, nodeHere, onEngineBun, practiceRuntime, withPracticeBun } from "../src/proof/practicerun.ts";
import { doctor } from "../src/doctor.ts";
import { NAMES } from "../src/names.ts";

type Entry = { id: string; folder: string; copyName: string; find: string; expect: { file?: string; line?: number; about?: string } };
const SAMPLES = join(import.meta.dir, "../../app/sample");
const CATALOG = (JSON.parse(readFileSync(join(SAMPLES, "practices.json"), "utf8")) as { practices: Entry[] }).practices;
const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-pbun-${l}-`))); made.push(d); return d; };
/** A copy named the way the shell names it (practice.rs destination): "<practice copy base> <copy name>". */
const copyOf = (e: Entry, name = `${NAMES.practiceCopyBase} ${e.copyName}`) => { const p = join(tmp(e.id), name); cpSync(join(SAMPLES, e.folder), p, { recursive: true }); return p; };
const entry = (id: string) => CATALOG.find((e) => e.id === id)!;
const BUN = "/Applications/Example.app/Contents/Resources/engine/bin/bun";

describe("which way a project's checks run", () => {
  test("Node here: the usual way, for a practice and for the person's own project", () => {
    expect(practiceRuntime({ practice: true, node: true, bun: BUN })).toBe("node");
    expect(practiceRuntime({ practice: false, node: true, bun: BUN })).toBe("node");
  });
  test("Node missing with the engine's own Bun: a practice runs on Bun, the person's own project never does", () => {
    expect(practiceRuntime({ practice: true, node: false, bun: BUN })).toBe("bun");
    expect(practiceRuntime({ practice: false, node: false, bun: BUN })).toBe("node");
  });
  test("neither: a practice waits for Node, and the person's own project goes the usual way", () => {
    expect(practiceRuntime({ practice: true, node: false, bun: null })).toBe("none");
    expect(practiceRuntime({ practice: false, node: false, bun: null })).toBe("node");
  });
  test("the engine's own Bun is the Bun running it, and only when it is Bun", () => {
    expect(engineBun()).toBe(process.execPath);
    expect(engineBun("/usr/local/bin/node", true)).toBeNull();
    expect(engineBun(process.execPath, false)).toBeNull();
    expect(engineBun("/nowhere/engine/bin/bun", true)).toBeNull();
  });
  test("Node is looked for on the tool path, as the Mac check does", () => {
    const bin = tmp("bin");
    expect(nodeHere([bin])).toBe(false);
    writeFileSync(join(bin, "node"), "#!/bin/sh\n"); chmodSync(join(bin, "node"), 0o755);
    expect(nodeHere(["", bin])).toBe(true);
  });
});

describe("only a practice copy", () => {
  test("every practice in the catalog is one, by its folder name and its package", () => {
    for (const e of CATALOG) {
      const p = copyOf(e);
      expect(JSON.parse(readFileSync(join(p, "package.json"), "utf8")).name, e.id).toBe(`practice-${e.id}`);
      expect(isPracticeProject(p), e.id).toBe(true);
    }
    // A copy made before the rename is still one.
    expect(isPracticeProject(copyOf(entry("signup"), `${NAMES.earlierPracticeCopyBases[0]} signup page`))).toBe(true);
  });
  test("the same files in a folder of the person's own are not", () => {
    expect(isPracticeProject(copyOf(entry("signup"), "my signup page"))).toBe(false);
  });
  test("a practice folder whose package is not a practice's, or that needs packages, is not", () => {
    const p = copyOf(entry("signup"));
    const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
    writeFileSync(join(p, "package.json"), JSON.stringify({ ...pkg, name: "my-shop" }));
    expect(isPracticeProject(p)).toBe(false);
    writeFileSync(join(p, "package.json"), JSON.stringify({ ...pkg, dependencies: { express: "^5.0.0" } }));
    expect(isPracticeProject(p)).toBe(false);
    writeFileSync(join(p, "package.json"), JSON.stringify({ ...pkg, devDependencies: {} }));
    expect(isPracticeProject(p)).toBe(true);
    writeFileSync(join(p, "package.json"), "not json");
    expect(isPracticeProject(p)).toBe(false);
  });
  test("a private copy of a practice (an earlier version) counts by the practice's own folder", () => {
    const own = copyOf(entry("signup"));
    const priv = join(tmp("private"), "before-abc"); cpSync(own, priv, { recursive: true });
    expect(isPracticeProject(priv)).toBe(false);
    expect(isPracticeProject(priv, own)).toBe(true);
  });
  test("which task broke it: the ladder reads a private copy of a practice by the practice's own folder, so it runs on Bun too", () => {
    // checkCopy (agent.ts) checks each earlier version in a folder named bisect-XXXX and passes the project as its identity.
    const own = copyOf(entry("signup"));
    const priv = join(tmp("bisect"), "bisect-abc123"); cpSync(own, priv, { recursive: true });
    expect(readProject(priv, own, { node: false, bun: BUN }).tests).toEqual({ command: bunTests(BUN) });
    // Without the identity it is not a practice (its folder is not named as one), so it goes the usual way.
    expect(readProject(priv, priv, { node: false, bun: BUN }).tests).toEqual(detectProject(priv).tests);
    expect(readFileSync(join(import.meta.dir, "../src/agent.ts"), "utf8")).toContain("runLadder)({ project: dir, identity: project,");
  });
});

describe("the checks a practice gets", () => {
  const det = (p: string) => detectProject(p, () => false);
  test("Node here: read exactly as before", () => {
    const p = copyOf(entry("signup")), d = det(p);
    expect(withPracticeBun(d, p, { node: true, bun: BUN })).toEqual({ det: d, runtime: "node" });
  });
  test("Node missing with Bun: Bun's test runner for node --test, and Bun for node server.js, nothing else changed", () => {
    const p = copyOf(entry("signup")), d = det(p);
    const r = withPracticeBun(d, p, { node: false, bun: BUN });
    expect(r.runtime).toBe("bun");
    expect(r.det.tests).toEqual({ command: bunTests(BUN) });
    expect(r.det.start).toEqual({ kind: "server", command: bunServer(BUN, "server.js"), from: "dev" });
    expect(r.det.checks).toEqual(d.checks);
    expect(bunTests(BUN)).toBe(`'${BUN}' test --config=/dev/null --no-install --no-env-file`);
    expect(bunServer(BUN, "server.js")).toBe(`'${BUN}' --config=/dev/null --no-install --no-env-file 'server.js'`);
    // The open table practice has a server and no tests.
    const o = copyOf(entry("open-table"));
    const ro = withPracticeBun(det(o), o, { node: false, bun: BUN });
    expect(ro.det.tests).toBeNull();
    expect(ro.det.start).toEqual({ kind: "server", command: bunServer(BUN, "server.js"), from: "dev" });
  });
  test("the ladder can tell a command on the engine's own Bun (the box reads its refusals the way Bun says them)", () => {
    expect(onEngineBun(bunTests(BUN))).toBe(true);
    expect(onEngineBun(bunServer(BUN, "server.js"))).toBe(true);
    for (const c of ["npm run test", "node --test", `'${BUN}' run anything`, "", undefined]) expect(onEngineBun(c), String(c)).toBe(false);
  });
  test("neither: read exactly as before, so it fails the way it would without Node (the page waits for Node first)", () => {
    const p = copyOf(entry("signup")), d = det(p);
    expect(withPracticeBun(d, p, { node: false, bun: null })).toEqual({ det: d, runtime: "none" });
  });
  test("the person's own project is never moved to Bun", () => {
    const p = copyOf(entry("signup"), "my signup page"), d = det(p);
    expect(withPracticeBun(d, p, { node: false, bun: BUN })).toEqual({ det: d, runtime: "node" });
  });
  test("a script that is not the practice's own shape is left as it is, never run some other way", () => {
    const p = copyOf(entry("signup"));
    const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
    for (const scripts of [{ test: "node --test --experimental-test-coverage", dev: "node -e 'require(1)'" }, { test: "node --test; curl x", dev: "node ../elsewhere.js" }, { test: "jest", dev: "node server.js && rm -rf x" }]) {
      writeFileSync(join(p, "package.json"), JSON.stringify({ ...pkg, scripts }));
      const d = det(p), r = withPracticeBun(d, p, { node: false, bun: BUN });
      expect(r.det.tests).toEqual(d.tests); expect(r.det.start).toEqual(d.start);
    }
    // The project's own .claude/launch.json says how to start it: not changed either.
    writeFileSync(join(p, "package.json"), JSON.stringify(pkg));
    mkdirSync(join(p, ".claude")); writeFileSync(join(p, ".claude/launch.json"), JSON.stringify({ configurations: [{ runtimeExecutable: "node", runtimeArgs: ["server.js"] }] }));
    const d = det(p);
    expect(withPracticeBun(d, p, { node: false, bun: BUN }).det.start).toEqual(d.start);
  });
});

describe("Bun's test report is read like Node's", () => {
  test("a thrown error: its own words, not Bun's heading", () => {
    const p = copyOf(entry("setting"));
    const out = `bun test v1.4.2 (744846f84)\n\ntest/page.test.js:\n\n# Unhandled error between tests\n-------------------------------\n16 | if (!shopName) throw new Error("SHOP_NAME is not set. Add it to .env.local in this folder.");\n                              ^\nerror: SHOP_NAME is not set. Add it to .env.local in this folder.\n      at <anonymous> (${p}/settings.js:16:26)\n      at <anonymous> (${p}/server.js:3:9)\n-------------------------------\n\n 0 pass\n 1 fail\n 1 error\n`;
    expect(locateProblem(out, p, "tests")).toMatchObject({ kind: "line", file: "settings.js", line: 16, message: "SHOP_NAME is not set. Add it to .env.local in this folder." });
  });
  test("a file it cannot find: the one line that asks for it", () => {
    const p = copyOf(entry("import"));
    const out = `bun test v1.4.2 (744846f84)\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find module './lib/format-price' from '${p}/server.js'\n-------------------------------\n 0 pass\n 1 fail\n`;
    expect(locateProblem(out, p, "tests")).toMatchObject({ kind: "line", file: "server.js", line: 3, message: "Cannot find module './lib/format-price' from 'server.js'" });
    // A path outside the project is never a place in it.
    expect(locateProblem(out.replace(`${p}/server.js`, "/elsewhere/server.js"), p, "tests")).toMatchObject({ kind: "message" });
  });
  test("a folder with spaces in its name, as every practice copy has: the place is still found, with Node's report too", () => {
    const p = copyOf(entry("route"));
    expect(p).toContain(" ");
    const node = `TAP version 13\n# Subtest: every link on the home page opens a page\nnot ok 1 - every link on the home page opens a page\n  ---\n  location: '${p}/test/links.test.js:8:1'\n  failureType: 'testCodeFailure'\n  error: 'The link Prices goes to /prices, which answered 404'\n  code: 'ERR_ASSERTION'\n  stack: |-\n    TestContext.<anonymous> (${p}/test/links.test.js:19:10)\n  ...\n`;
    expect(locateProblem(node, p, "tests")).toMatchObject({ kind: "line", file: "test/links.test.js", line: 19, message: "The link Prices goes to /prices, which answered 404" });
    const bun = `bun test v1.4.2 (744846f84)\n\ntest/links.test.js:\nAssertionError: The link Prices goes to /prices, which answered 404\n      at ${p}/test/links.test.js:19:10\n(fail) every link on the home page opens a page\n`;
    expect(locateProblem(bun, p, "tests")).toMatchObject({ kind: "line", file: "test/links.test.js", line: 19 });
    // Node's file:// form, with its spaces as %20.
    expect(locateProblem(`Error: boom\n    at file://${encodeURI(p)}/server.js:3:1\n`, p, "tests")).toMatchObject({ kind: "line", file: "server.js", line: 3 });
  });
  test("the words outside Bun's report are read as before", () => {
    const p = copyOf(entry("setting"));
    expect(locateProblem("error: something broke\nmore", p, "tests")).toMatchObject({ kind: "message", message: "error: something broke" });
  });
});

describe("the Mac check", () => {
  const run = (map: Record<string, string>) => async (cmd: string) => (map[cmd] ? { code: 0, stdout: map[cmd], stderr: "" } : { code: 127, stdout: "", stderr: "" });
  test("Node missing with the engine's own Bun: still missing, and the practices run without it", async () => {
    const n = (await doctor(run({}), () => true, () => BUN)).find((i) => i.id === "node")!;
    expect(n).toMatchObject({ ok: false, missing: true, practiceRuns: true });
  });
  test("neither: missing, and the practices wait for Node", async () => {
    const n = (await doctor(run({}), () => true, () => null)).find((i) => i.id === "node")!;
    expect(n).toMatchObject({ ok: false, missing: true }); expect(n.practiceRuns).toBeUndefined();
  });
  test("Node here: nothing about Bun", async () => {
    const n = (await doctor(run({ "node --version": "v22.1.0" }), () => true, () => BUN)).find((i) => i.id === "node")!;
    expect(n.ok).toBe(true); expect(n.practiceRuns).toBeUndefined();
  });
});

// The real thing: the practices' own checks through the proof ladder, in the safety box, with a tool path that has no node
// and no npm (only a folder holding the engine's Bun, as the app's engine/bin does, and the system's own folders).
describe("the practices' checks on the engine's own Bun, in the box, with no Node", () => {
  const FIXES: Record<string, (p: string) => void> = {
    signup: (p) => edit(p, "public/signup.js", "/api/signup", "/api/register"),
    setting: (p) => writeFileSync(join(p, ".env.local"), "SHOP_NAME=Sam's Plants\n"),
    route: (p) => edit(p, "index.html", 'href="/prices"', 'href="/pricing"'),
    import: (p) => edit(p, "server.js", 'require("./lib/format-price")', 'require("./lib/money")'),
  };
  function edit(p: string, f: string, from: string, to: string) { const t = readFileSync(join(p, f), "utf8"); expect(t).toContain(from); writeFileSync(join(p, f), t.split(from).join(to)); }
  function noNodePath(): { PATH: string; bun: string } {
    const bin = join(tmp("engine"), "bin"); mkdirSync(bin);
    const bun = join(bin, "bun"); copyFileSync(process.execPath, bun); chmodSync(bun, 0o755);
    return { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, bun };
  }
  async function check(project: string) {
    const { PATH, bun } = noNodePath();
    expect(nodeHere(PATH.split(":"))).toBe(false);
    const commands: { command: string; boxed: boolean }[] = [];
    const store = new CheckpointStore(tmp("store"), project);
    const a = await store.snapshot("before");
    const r = await runLadder({
      project, store, beforeId: a.id, afterId: a.id, limits: { testMs: 30_000, startMs: 15_000, browserMs: 20_000 },
      // The default reading, with Node taken to be missing (test/setup.ts otherwise says every tool is here).
      detect: (d: string): Detected => withPracticeBun(detectProject(d), d, { node: false, bun }).det,
      run: (command: string, o: RunOptions) => { commands.push({ command, boxed: o.box?.net === "local" }); return runCommand(command, { ...o, env: { ...(o.env ?? {}), PATH } }); },
      server: (s, o) => { commands.push({ command: s.kind === "server" ? s.command : "static", boxed: o.box?.net === "local" }); return startServer(s.kind === "server" ? { ...s, env: { ...(s.env ?? {}), PATH } } : s, o); },
    });
    return { r, commands, bun };
  }
  for (const id of Object.keys(FIXES)) {
    test(`${id}: fails where the catalog expects, then the small fix passes, and every command is Bun in the box`, async () => {
      const e = entry(id), p = copyOf(e);
      const broken = await check(p);
      expect(broken.r.verdict).toBe("failed");
      expect(broken.r.failedAt?.rung).toBe("tests");
      expect(broken.r.failedAt?.problem).toMatchObject({ kind: "line", file: e.expect.file, line: e.expect.line });
      expect((broken.r.failedAt?.problem as { message: string }).message.toLowerCase()).toContain(e.expect.about!.toLowerCase());
      FIXES[id](p);
      const fixed = await check(p);
      expect(fixed.r.steps.find((s) => s.rung === "tests")?.status).toBe("passed");
      expect(fixed.r.steps.find((s) => s.rung === "start")?.status).toBe("passed");
      expect(fixed.r.verdict).not.toBe("failed");
      for (const c of [...broken.commands, ...fixed.commands]) { expect(c.command.startsWith(`'${broken.bun}' `) || c.command.startsWith(`'${fixed.bun}' `)).toBe(true); expect(c.boxed).toBe(true); }
    }, 120_000);
  }
  test("open-table: its server starts on Bun in the box", async () => {
    const r = await check(copyOf(entry("open-table")));
    expect(r.r.steps.find((s) => s.rung === "start")?.status).toBe("passed");
    expect(r.commands.length).toBeGreaterThan(0);
    for (const c of r.commands) { expect(c.command.startsWith(`'${r.bun}' `)).toBe(true); expect(c.boxed).toBe(true); }
  }, 120_000);
  test("Bun stays as strict as Node: the project's bunfig.toml is not read, and no .env file is loaded for the tests", async () => {
    const p = copyOf(entry("setting"));
    writeFileSync(join(p, "cheat.js"), "process.env.SHOP_NAME = 'cheated';\n");
    writeFileSync(join(p, "bunfig.toml"), 'preload = ["./cheat.js"]\n[test]\npreload = ["./cheat.js"]\n');
    const { PATH, bun } = noNodePath();
    const r = await runCommand(bunTests(bun), { cwd: p, timeoutMs: 30_000, env: { PATH }, box: { project: p, net: "local" } });
    expect(r.code).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("SHOP_NAME is not set");
    // The signup practice reads no settings file of its own, so only Bun could have loaded this one.
    const q = copyOf(entry("signup"));
    writeFileSync(join(q, ".env"), "PROBE=from-env-file\n");
    writeFileSync(join(q, "test/probe.test.js"), 'const test = require("node:test"); const assert = require("node:assert");\ntest("no env file was loaded", () => assert.strictEqual(process.env.PROBE, undefined));\n');
    const e = await runCommand(bunTests(bun), { cwd: q, timeoutMs: 30_000, env: { PATH }, box: { project: q, net: "local" } });
    expect(e.stdout + e.stderr).toContain("(pass) no env file was loaded");
  }, 60_000);
});
