// Which task broke it, end to end through the runner: real tasks (a scripted engine, no Claude) leave real snapshots, and the
// search checks earlier versions in private copies in Companion's own folder, never in the project. The checker here is a
// stand in that reads the copy it is given; one test runs the real proof ladder with its commands stubbed. Temporary folders
// only, no network, never the person's git.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { AgentRunner, type ProofContext } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { runLadder, type LadderResult } from "../src/proof/ladder.ts";
import { MAX_RUNS } from "../src/bisect.ts";
import { parseEvent, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-bis-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const write = (file: string, content: string): Step => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });
const say: Step = { text: "done", costUsd: 0.01 };

const failing = (detail = "1 test failed"): LadderResult => {
  const f = { rung: "tests" as const, label: "Running the tests", status: "failed" as const, detail, ms: 1 };
  return { verdict: "failed", steps: [{ rung: "checks", label: "Building and checking the code", status: "passed", detail: "", ms: 1 }, f], failedAt: f };
};
const passing: LadderResult = { verdict: "passed", steps: [{ rung: "checks", label: "Building and checking the code", status: "passed", detail: "", ms: 1 }, { rung: "tests", label: "Running the tests", status: "passed", detail: "", ms: 1 }] };

function treeHash(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); const st = lstatSync(p); h.update(relative(dir, p) + ":" + st.size); if (st.isDirectory()) walk(p); else if (st.isFile()) h.update(readFileSync(p)); } };
  walk(dir);
  return h.digest("hex");
}

// Five tasks, each changing one file. The one at `breaks` (1 based) writes BUG into app.js; later ones change other files.
function setup(o: { breaks?: number; tasks?: number; judge?: (ctx: ProofContext) => Promise<LadderResult>; custom?: Record<number, Step[]>; more?: Step[][] } = {}) {
  const project = tmp("p"), work = tmp("w");
  writeFileSync(join(project, "app.js"), "ok\n");
  writeFileSync(join(project, "notes.txt"), "n0\n");
  const n = o.tasks ?? 5, breaks = o.breaks ?? 3;
  const rounds: Step[][] = [];
  for (let i = 1; i <= n; i++) rounds.push(o.custom?.[i] ?? (i === breaks ? [write("app.js", "BUG\n"), say] : [write(`f${i}.txt`, `task ${i}\n`), say]));
  rounds.push(...(o.more ?? []));
  const events: Event[] = [];
  const checked: string[] = [];
  let clock = Date.parse("2026-10-14T09:00:00Z");
  const judge = o.judge ?? (async (ctx: ProofContext) => (readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing));
  const runner = new AgentRunner({
    shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e),
    now: () => new Date((clock += 60_000)), bisect: { workDir: work },
    // During a task the work passes its checks; the search's checks look at the copy they are given.
    proof: async (ctx) => { if (ctx.project === project) return passing; checked.push(ctx.project); return judge(ctx); },
  });
  const runTasks = async () => { for (let i = 1; i <= n; i++) await runner.handle({ v: 1, id: `t${i}`, type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: `Task number ${i}`, model: "m", budgetUsd: 3 }); };
  const bisect = () => runner.handle({ v: 1, id: "b1", type: "bisect.start", project, agent: "builder-1" });
  return { project, work, events, checked, runner, runTasks, bisect };
}

describe("finding which task broke it", () => {
  test("it names the task and its date, and every event is valid protocol", async () => {
    const s = setup({ breaks: 3 });
    await s.runTasks();
    s.events.length = 0;
    await s.bisect();
    const r = of(s.events, "bisect.result");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ outcome: "found", task: { label: "Task number 3" }, step: { rung: "tests", label: "Running the tests" }, undo: "safe" });
    expect(r[0].task.at).toMatch(/^2026-10-14T/);
    expect(r[0].changed).toEqual([{ file: "app.js", kind: "modified" }]);
    expect(r[0].diff).toContain("BUG");
    for (const e of s.events) expect(parseEvent(JSON.stringify(e)).ok, e.type).toBe(true);
    expect(of(s.events, "bisect.progress")[0]).toMatchObject({ run: 1, maxRuns: MAX_RUNS, what: "now" });
  });
  test("at most six checks, each in a private copy in Companion's folder that is deleted afterwards", async () => {
    const s = setup({ breaks: 2, tasks: 9 });
    await s.runTasks();
    const before = treeHash(s.project);
    await s.bisect();
    expect(of(s.events, "bisect.result")[0].outcome).toBe("found");
    expect(s.checked.length).toBeGreaterThan(1);
    expect(s.checked.length).toBeLessThanOrEqual(MAX_RUNS);
    expect(of(s.events, "bisect.result")[0].runs).toBe(s.checked.length);
    for (const d of s.checked) { expect(d.startsWith(s.work + "/")).toBe(true); expect(existsSync(d)).toBe(false); }
    expect(readdirSync(s.work)).toEqual([]);
    // The project itself is exactly as it was.
    expect(treeHash(s.project)).toBe(before);
  });
  test("a check that writes inside the installed packages (generated code) never writes into the project's own", async () => {
    const s = setup({ judge: async (ctx) => {
      const pkg = join(ctx.project, "node_modules", "dbclient");
      expect(readFileSync(join(pkg, "index.js"), "utf8")).toBe("module.exports = 1;\n");   // the packages are there to use
      writeFileSync(join(pkg, "generated.js"), "old version's code");
      return readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing;
    } });
    mkdirSync(join(s.project, "node_modules", "dbclient"), { recursive: true });
    writeFileSync(join(s.project, "node_modules", "dbclient", "index.js"), "module.exports = 1;\n");
    await s.runTasks();
    await s.bisect();
    expect(of(s.events, "bisect.result")[0].outcome).toBe("found");
    expect(existsSync(join(s.project, "node_modules", "dbclient", "generated.js"))).toBe(false);
    expect(readdirSync(s.work)).toEqual([]);
  });
  test("the checks of earlier versions never install anything", async () => {
    const seen: ProofContext[] = [];
    const s = setup({ judge: async (ctx) => { seen.push(ctx); return readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing; } });
    await s.runTasks();
    await s.bisect();
    expect(seen.length).toBeGreaterThan(0);
    for (const c of seen) expect((c as ProofContext & { noInstall?: boolean }).noInstall).toBe(true);
  });
  test("the project's own git is never touched", async () => {
    const s = setup();
    mkdirSync(join(s.project, ".git")); writeFileSync(join(s.project, ".git", "HEAD"), "ref: refs/heads/main\n");
    await s.runTasks();
    await s.bisect();
    expect(readdirSync(join(s.project, ".git"))).toEqual(["HEAD"]);
  });
  test("a project that passes now has nothing to trace back", async () => {
    const s = setup({ judge: async () => passing });
    await s.runTasks();
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "not_failing", runs: 1 });
  });
  test("fewer than two earlier tasks: says so and checks nothing", async () => {
    const s = setup({ tasks: 1, breaks: 1 });
    await s.runTasks();
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "too_few", runs: 0 });
    expect(s.checked).toEqual([]);
  });
  test("already failing before the oldest task", async () => {
    const s = setup({ judge: async () => failing() });
    await s.runTasks();
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "already_failing", earlier: { label: "Task number 1" } });
  });
  test("broken by the person's own change after the last task", async () => {
    const s = setup({ breaks: 99, judge: async (ctx) => (readFileSync(join(ctx.project, "app.js"), "utf8").includes("MINE") ? failing() : passing) });
    await s.runTasks();
    writeFileSync(join(s.project, "app.js"), "MINE\n");
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "after_last_task", earlier: { label: "Task number 5" } });
  });
  test("a private settings file the person changed between two tasks is blamed on that change, not on the next task", async () => {
    const s = setup({ breaks: 99, judge: async (ctx) => (readFileSync(join(ctx.project, ".env"), "utf8").includes("BROKEN") ? failing() : passing) });
    writeFileSync(join(s.project, ".gitignore"), ".env\n"); writeFileSync(join(s.project, ".env"), "OK=1\n");
    for (let i = 1; i <= 5; i++) {
      if (i === 4) writeFileSync(join(s.project, ".env"), "BROKEN=1\n");
      await s.runner.handle({ v: 1, id: `t${i}`, type: "agent.start", project: s.project, agent: "builder-1", mode: "drive", prompt: `Task number ${i}`, model: "m", budgetUsd: 3 });
    }
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "outside_change", earlier: { label: "Task number 3" }, later: { label: "Task number 4" } });
  });
  test("Stop everything ends the search and deletes the copy", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = setup({ judge: async (ctx) => { await new Promise<void>((res) => { ctx.signal.addEventListener("abort", () => res(), { once: true }); void gate.then(res); }); return ctx.signal.aborted ? { verdict: "cancelled", steps: [] } : failing(); } });
    await s.runTasks();
    const p = s.bisect();
    await Bun.sleep(80);
    await s.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await p; release();
    expect(of(s.events, "bisect.result")[0].outcome).toBe("cancelled");
    expect(readdirSync(s.work)).toEqual([]);
  });
  test("only one search at a time, and never while a task works on the project", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = setup({ judge: async (ctx) => { await gate; return readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing; } });
    await s.runTasks();
    const p = s.bisect();
    await Bun.sleep(50);
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "busy" });
    release(); await p;
  });
  test("a task asked for during a search is refused and writes nothing; the character shows only the search", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = setup({ more: [[write("during.txt", "written mid search\n"), say]], judge: async (ctx) => { await gate; return readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing; } });
    await s.runTasks();
    s.events.length = 0;
    const p = s.bisect();
    await Bun.sleep(50);
    const t = s.runner.handle({ v: 1, id: "t6", type: "agent.start", project: s.project, agent: "builder-1", mode: "drive", prompt: "Write a file during the search", model: "m", budgetUsd: 3 });
    await Bun.sleep(100);
    expect(existsSync(join(s.project, "during.txt"))).toBe(false);
    release(); await p; await t;
    expect(existsSync(join(s.project, "during.txt"))).toBe(false);
    expect(of(s.events, "protocol.error").map((e) => e.reason).join(" ")).toMatch(/already working on this project/);
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "found", task: { label: "Task number 3" } });
    expect(of(s.events, "agent.state").map((e) => e.state)).toEqual(["checking", "needsYou"]);
    expect(of(s.events, "checkpoint.created")).toEqual([]);
  });
  test("a project that cannot be saved at the start does not leave the character checking", async () => {
    const { CheckpointStore } = await import("../src/checkpoints.ts");
    const s = setup();
    await s.runTasks();
    s.events.length = 0;
    const orig = CheckpointStore.prototype.snapshot;
    CheckpointStore.prototype.snapshot = function (this: InstanceType<typeof CheckpointStore>, label: string) { return label.startsWith("Find which task") ? Promise.reject(new Error("disk full")) : orig.call(this, label); };
    try { await s.bisect(); } finally { CheckpointStore.prototype.snapshot = orig; }
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "failed" });
    expect(of(s.events, "agent.state").at(-1)?.state).toBe("idle");
  });
});

describe("earlier versions that needed other packages", () => {
  // The installed packages are today's. A version whose package.json asked for other versions (or whose lockfile differs) is
  // never checked with them: it would fail only because of the packages, and an innocent task would be blamed.
  const pkg = (runner: string, test = "node test.js") => JSON.stringify({ name: "x", scripts: { test }, devDependencies: { runner } });
  function packaged(o: { breaks: number; upgrade: number; scriptsOnly?: number }) {
    const seen: string[] = [];
    const custom: Record<number, Step[]> = { [o.upgrade]: [write("package.json", pkg("2.0.0")), say] };
    if (o.scriptsOnly) custom[o.scriptsOnly] = [write("package.json", pkg("1.0.0", "node --test")), say];
    const s = setup({ breaks: o.breaks, custom, judge: async (ctx) => {
      const want = JSON.parse(readFileSync(join(ctx.project, "package.json"), "utf8")).devDependencies.runner;
      const have = JSON.parse(readFileSync(join(ctx.project, "node_modules", "runner", "package.json"), "utf8")).version;
      seen.push(want);
      if (want !== have) return failing("the test runner would not start");
      return readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing;
    } });
    writeFileSync(join(s.project, "package.json"), pkg("1.0.0"));
    mkdirSync(join(s.project, "node_modules", "runner"), { recursive: true });
    writeFileSync(join(s.project, "node_modules", "runner", "package.json"), JSON.stringify({ version: "1.0.0" }));
    const upgraded = () => writeFileSync(join(s.project, "node_modules", "runner", "package.json"), JSON.stringify({ version: "2.0.0" }));
    return { s, seen, upgraded };
  }
  test("versions from before a package upgrade are not checked with the new packages, and the real task is found", async () => {
    const { s, seen, upgraded } = packaged({ breaks: 5, upgrade: 4 });
    await s.runTasks();
    upgraded();   // the person installed the new packages after task 4
    await s.bisect();
    const r = of(s.events, "bisect.result")[0];
    expect(r).toMatchObject({ outcome: "found", task: { label: "Task number 5" } });
    expect(seen).not.toContain("1.0.0");
    expect(r.runs).toBe(seen.length);
  });
  test("when only versions with other packages are left, it says it is unsure and why, and blames no task", async () => {
    const { s, seen, upgraded } = packaged({ breaks: 2, upgrade: 4 });
    await s.runTasks();
    upgraded();
    await s.bisect();
    const r = of(s.events, "bisect.result")[0];
    expect(r.outcome).toBe("unsure");
    expect(r.detail).toMatch(/packages/);
    expect(seen).not.toContain("1.0.0");
  });
  test("a workspace's packages in its own folders get a copy each, and the person's never change", async () => {
    const s = setup({ judge: async (ctx) => {
      expect(readFileSync(join(ctx.project, "packages", "ui", "node_modules", "clsx", "index.js"), "utf8")).toBe("1");
      writeFileSync(join(ctx.project, "packages", "ui", "node_modules", "clsx", "index.js"), "written by a check");
      return readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing;
    } });
    mkdirSync(join(s.project, "packages", "ui", "node_modules", "clsx"), { recursive: true });
    writeFileSync(join(s.project, "packages", "ui", "package.json"), JSON.stringify({ name: "ui", dependencies: { clsx: "2.0.0" } }));
    writeFileSync(join(s.project, "packages", "ui", "node_modules", "clsx", "index.js"), "1");
    await s.runTasks();
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "found", task: { label: "Task number 3" } });
    expect(readFileSync(join(s.project, "packages", "ui", "node_modules", "clsx", "index.js"), "utf8")).toBe("1");
    expect(readdirSync(s.work)).toEqual([]);
  });
  test("a change to package.json that is not about packages (a script) does not stop earlier versions being checked", async () => {
    const { s, seen } = packaged({ breaks: 2, upgrade: 99, scriptsOnly: 4 });
    await s.runTasks();
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "found", task: { label: "Task number 2" } });
    expect(seen.length).toBeGreaterThan(1);
  });
});

describe("undoing just the task that broke it", () => {
  test("only with a yes, and only the task that was found", async () => {
    const s = setup({ breaks: 3 });
    await s.runTasks();
    await s.bisect();
    const found = of(s.events, "bisect.result")[0];
    await s.runner.handle({ v: 1, id: "u0", type: "bisect.undo", project: s.project, checkpoint: "cp_0001", confirm: true });
    expect(of(s.events, "bisect.undone")[0]).toMatchObject({ ok: false });
    expect(readFileSync(join(s.project, "app.js"), "utf8")).toBe("BUG\n");
    await s.runner.handle({ v: 1, id: "u1", type: "bisect.undo", project: s.project, checkpoint: found.task.checkpoint, confirm: false } as never);
    expect(of(s.events, "bisect.undone")[1]).toMatchObject({ ok: false });
    expect(readFileSync(join(s.project, "app.js"), "utf8")).toBe("BUG\n");
  });
  test("it takes back that task's change and keeps every later task's work", async () => {
    const s = setup({ breaks: 3 });
    await s.runTasks();
    await s.bisect();
    const found = of(s.events, "bisect.result")[0];
    await s.runner.handle({ v: 1, id: "u", type: "bisect.undo", project: s.project, checkpoint: found.task.checkpoint, confirm: true });
    const done = of(s.events, "bisect.undone")[0];
    expect(done).toMatchObject({ ok: true, reverted: ["app.js"] });
    expect(done.safety).toMatch(/^cp_/);
    expect(parseEvent(JSON.stringify(done)).ok).toBe(true);
    expect(readFileSync(join(s.project, "app.js"), "utf8")).toBe("ok\n");
    for (const i of [1, 2, 4, 5]) expect(readFileSync(join(s.project, `f${i}.txt`), "utf8")).toBe(`task ${i}\n`);
  });
  test("when a later task changed the same file, it is offered only to show, and undo refuses", async () => {
    const project = tmp("p"), work = tmp("w");
    writeFileSync(join(project, "app.js"), "ok\n");
    const rounds: Step[][] = [[write("x.txt", "1"), say], [write("app.js", "BUG\n"), say], [write("app.js", "BUG\nmore later work\n"), say]];
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e), bisect: { workDir: work },
      proof: async (ctx) => (ctx.project === project ? passing : readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing() : passing) });
    for (let i = 1; i <= 3; i++) await runner.handle({ v: 1, id: `t${i}`, type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: `Task number ${i}`, model: "m", budgetUsd: 3 });
    await runner.handle({ v: 1, id: "b", type: "bisect.start", project, agent: "builder-1" });
    const r = of(events, "bisect.result")[0];
    expect(r).toMatchObject({ outcome: "found", task: { label: "Task number 2" }, undo: "show_only" });
    expect(r.why).toContain("app.js");
    expect(r.diff).toContain("BUG");
    await runner.handle({ v: 1, id: "u", type: "bisect.undo", project, checkpoint: r.task.checkpoint, confirm: true });
    expect(of(events, "bisect.undone")[0]).toMatchObject({ ok: false });
    expect(readFileSync(join(project, "app.js"), "utf8")).toBe("BUG\nmore later work\n");
  });
});

describe("the packages' own copy", () => {
  test("a copy the check can write into, with its links still pointing inside the copy; the original never changes", async () => {
    const { ownPackages } = await import("../src/proof/before.ts");
    const { symlinkSync, readlinkSync, realpathSync: real } = await import("node:fs");
    const p = tmp("p"), w = tmp("w");
    mkdirSync(join(p, "node_modules", "tool", "bin"), { recursive: true }); mkdirSync(join(p, "node_modules", ".bin"));
    writeFileSync(join(p, "node_modules", "tool", "bin", "run.js"), "1");
    symlinkSync("../tool/bin/run.js", join(p, "node_modules", ".bin", "tool"));
    const how = await ownPackages(join(p, "node_modules"), join(w, "node_modules"));
    expect(["cloned", "copied"]).toContain(how);
    expect(readlinkSync(join(w, "node_modules", ".bin", "tool"))).toBe("../tool/bin/run.js");
    expect(real(join(w, "node_modules", ".bin", "tool")).startsWith(real(w))).toBe(true);
    writeFileSync(join(w, "node_modules", "tool", "bin", "run.js"), "changed in the copy");
    expect(readFileSync(join(p, "node_modules", "tool", "bin", "run.js"), "utf8")).toBe("1");
    expect(await ownPackages(join(p, "missing"), join(w, "x"))).toBe("none");
  });
});

describe("with the real proof ladder", () => {
  test("the copy is checked by the ladder's own rungs, with its commands stubbed (no installs, no network)", async () => {
    const ran: { command: string; cwd: string }[] = [];
    const s = setup({
      breaks: 2, tasks: 4,
      judge: (ctx) => runLadder({ ...ctx, run: async (command, o) => { ran.push({ command, cwd: o.cwd }); const bad = readFileSync(join(o.cwd, "app.js"), "utf8").includes("BUG"); return { code: bad ? 1 : 0, signal: null, stdout: bad ? "1 failing" : "ok", stderr: "", timedOut: false, ms: 1 }; } }),
    });
    writeFileSync(join(s.project, "package.json"), JSON.stringify({ name: "x", scripts: { test: "node test.js" } }));
    await s.runTasks();
    await s.bisect();
    expect(of(s.events, "bisect.result")[0]).toMatchObject({ outcome: "found", task: { label: "Task number 2" }, step: { rung: "tests" } });
    expect(ran.length).toBeGreaterThan(0);
    for (const r of ran) { expect(r.cwd.startsWith(s.work + "/")).toBe(true); expect(r.command).not.toMatch(/install/); }
  });
});
