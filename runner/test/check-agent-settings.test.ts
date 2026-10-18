// The engine's side of the settings for checking a project (area 2 of the settings plan): what each flow hands the proof
// ladder (a task, Rescue, Ship's check, Point at the problem, which task broke it), read once when it starts; the install
// question on the existing approval card, where no answer, a no or a Stop is always a no; before and after pictures; the
// deploy log; and "my internet is slow". Every usual value is today's behaviour. No real Claude, nothing installed, no
// network: the engine, the proof ladder, Vercel and the commands are stand ins.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { AgentRunner, type ProofContext } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { DEFAULT_LIMITS, scaleLimits, type LadderResult } from "../src/proof/ladder.ts";
import { USUAL_CHECK, VIEWPORTS } from "../src/proof/options.ts";
import { VercelCli, type DeployLogReader } from "../src/ship/deploy.ts";
import { installBrowser } from "../src/proof/browser.ts";
import { BrowserSetup } from "../src/proof/browsersetup.ts";
import type { PageShot } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-chkag-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0.01 });
const shot: PageShot = { jpeg: Buffer.from([0xff, 0xd8, 1, 2]).toString("base64"), w: 1280, h: 800, items: [] };
const passed: LadderResult = { verdict: "passed", steps: [{ rung: "browser", label: "b", status: "passed", detail: "", ms: 1 }], shot };
const apply = (values: Record<string, unknown>, project?: string, projectValues?: Record<string, unknown>) =>
  ({ v: 1 as const, id: "s1", type: "settings.apply" as const, values, ...(project ? { project } : {}), ...(projectValues ? { projectValues } : {}) });
const settle = () => Bun.sleep(60);
const waitFor = async (f: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await Bun.sleep(5); };

function rig(o: { proof?: (ctx: ProofContext) => Promise<LadderResult>; rounds?: Step[][]; pictures?: boolean; deployLogs?: DeployLogReader; approvalTimeoutMs?: number; commands?: (c: string, ro: { timeoutMs: number }) => Promise<RunResult> } = {}) {
  const project = tmp("p"); writeFileSync(join(project, "a.txt"), "original");
  const settings = new RunnerSettings();
  const events: Event[] = [];
  const seen: ProofContext[] = [];
  const saveDir = join(tmp("d"), "receipts");
  const befores: any[] = [];
  const shadowRoot = tmp("s");
  const runner = new AgentRunner({
    shadowRoot, engine: new ScriptedEngine(o.rounds ?? [[bash("echo hi > new.txt")]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), settings,
    proof: async (ctx) => { seen.push(ctx); return o.proof ? o.proof(ctx) : passed; },
    ...(o.approvalTimeoutMs ? { approvalTimeoutMs: o.approvalTimeoutMs } : {}),
    ...(o.deployLogs ? { deployLogs: o.deployLogs } : {}),
    ...(o.commands ? { commands: o.commands as never } : {}),
    ...(o.pictures ? { pictures: { workDir: tmp("w"), saveDir, before: async (b: any) => { befores.push(b); return { shot }; }, draw: async (_b: any, a: any) => ({ jpeg: a.jpeg, regions: [], how: "none" as const }) } } : {}),
  });
  const task = (id = "c1", project_ = project) => runner.handle({ v: 1, id, type: "agent.start", project: project_, agent: "a1", mode: "drive", prompt: "make it", model: "m", budgetUsd: 3 });
  return { project, settings, events, seen, runner, task, saveDir, befores, shadowRoot };
}

describe("what a task's check is given", () => {
  test("with nothing changed in Settings, exactly today's: the usual settings and today's limits", async () => {
    const r = rig();
    await r.task();
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0].check).toEqual(USUAL_CHECK);
    expect(r.seen[0].limits).toEqual(DEFAULT_LIMITS);
  });
  test("this project's own choices, and longer limits for longer", async () => {
    const r = rig();
    r.settings.apply(apply({}, r.project, { "check.skip": ["lint"], "check.mustSee": ["Welcome"], "check.press": "Add to cart", "check.time": "longer", "check.pageSize": "both", "check.install": "never", "check.start": "web" }));
    await r.task();
    expect(r.seen[0].check).toEqual({ ...USUAL_CHECK, skip: ["lint"], mustSee: ["Welcome"], press: "Add to cart", time: "longer", pageSize: "both", install: "never", start: "web" });
    expect(r.seen[0].limits).toEqual(scaleLimits(2));
  });
  test("another project's choices never apply here", async () => {
    const r = rig();
    r.settings.apply(apply({}, "/Users/me/other", { "check.skip": ["lint"], "check.time": "longest" }));
    await r.task();
    expect(r.seen[0].check).toEqual(USUAL_CHECK);
    expect(r.seen[0].limits).toEqual(DEFAULT_LIMITS);
  });
  test("a running task keeps what it started with, through every round of its fix loop", async () => {
    let r!: ReturnType<typeof rig>;
    r = rig({ rounds: [[bash("echo a > b.txt")], [bash("echo c > d.txt")]], proof: async () => {
      if (r.seen.length === 1) { r.settings.apply(apply({}, r.project, { "check.time": "longest" })); return { verdict: "failed", steps: [{ rung: "tests", label: "t", status: "failed", detail: "x", ms: 1 }], failedAt: { rung: "tests", label: "t", status: "failed", detail: "x", ms: 1 } }; }
      return passed;
    } });
    await r.task();
    expect(r.seen.map((c) => c.limits)).toEqual([DEFAULT_LIMITS, DEFAULT_LIMITS]);
  });
  test("Point at the problem, Rescue and Ship's check get the same choices", async () => {
    const r = rig({ rounds: [[{ text: JSON.stringify({ summary: "s", works: [], broken: "b", steps: ["one"] }), costUsd: 0.01 }]] });
    r.settings.apply(apply({}, r.project, { "check.skip": ["test"] }));
    await r.runner.handle({ v: 1, id: "f", type: "problem.find", project: r.project, agent: "a1" });
    await r.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: r.project, agent: "r1", model: "m", budgetUsd: 5 });
    await r.runner.handle({ v: 1, id: "g", type: "ship.check", project: r.project, runChecks: true });
    expect(r.seen.map((c) => c.check?.skip)).toEqual([["test"], ["test"], ["test"]]);
    expect(r.seen[0].noInstall).toBe(true);
  });
});

describe("the install question (check.install ask, or the house rule)", () => {
  const asking = (answer: (r: ReturnType<typeof rig>, req: any) => Promise<void>, o: { approvalTimeoutMs?: number } = {}) => {
    let got = null as boolean | null;
    const r = rig({ ...o, proof: async (ctx) => { got = await ctx.askInstall!("npm install"); return passed; } });
    const run = async () => {
      const done = r.task();
      await waitFor(() => of(r.events, "approval.request").length > 0);
      await answer(r, of(r.events, "approval.request")[0]);
      await done;
      return got;
    };
    return { r, run };
  };
  test("it is the usual approval card, about installing, and a yes is a yes", async () => {
    const t = asking(async (r, req) => { await r.runner.handle({ v: 1, id: "y", type: "approval.resolve", approval: req.approval, decision: "allow", scope: "once" }); });
    expect(await t.run()).toBe(true);
    const req = of(t.r.events, "approval.request")[0];
    expect(req).toMatchObject({ agent: "a1", risk: "install" });
    expect(req.title).toContain("npm install");
    expect(of(t.r.events, "approval.resolved")[0]).toMatchObject({ approval: req.approval, outcome: "allowed" });
  });
  test("a no is a no", async () => {
    const t = asking(async (r, req) => { await r.runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: req.approval, decision: "deny", scope: "once" }); });
    expect(await t.run()).toBe(false);
    expect(of(t.r.events, "approval.resolved")[0].outcome).toBe("denied");
  });
  test("no answer is a no: the question runs out and can never become a yes", async () => {
    const t = asking(async () => {}, { approvalTimeoutMs: 40 });
    expect(await t.run()).toBe(false);
    const req = of(t.r.events, "approval.request")[0];
    expect(of(t.r.events, "approval.resolved")[0].outcome).toBe("expired");
    await t.r.runner.handle({ v: 1, id: "late", type: "approval.resolve", approval: req.approval, decision: "allow", scope: "once" });
    expect(of(t.r.events, "protocol.error").some((e) => /unknown approval/.test(e.reason))).toBe(true);
  });
  test("Stop is a no", async () => {
    const t = asking(async (r) => { await r.runner.handle({ v: 1, id: "s", type: "agent.interrupt", agent: "a1" }); });
    expect(await t.run()).toBe(false);
  });
  test("Stop everything is a no, even for Ship's check", async () => {
    let got = null as boolean | null;
    const r = rig({ proof: async (ctx) => { got = await ctx.askInstall!("npm install"); return passed; } });
    const done = r.runner.handle({ v: 1, id: "g", type: "ship.check", project: r.project, runChecks: true });
    await waitFor(() => of(r.events, "approval.request").length > 0);
    expect(of(r.events, "approval.request")[0].agent).toBe("ship");
    await r.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await done;
    expect(got).toBe(false);
  });
});

describe("before and after pictures", () => {
  test("on by default, as today; off makes none, and the check itself is unchanged", async () => {
    const on = rig({ pictures: true });
    await on.task(); await settle();
    expect(of(on.events, "receipt.visual")).toHaveLength(1);
    const off = rig({ pictures: true });
    off.settings.apply(apply({ "pictures.make": false }));
    await off.task(); await settle();
    expect(of(off.events, "receipt.visual")).toHaveLength(0);
    expect(of(off.events, "receipt")[0].picture).toBeUndefined();
    expect(of(off.events, "receipt")[0].proof).toBe("passed");
    expect(off.seen[0].check).toEqual(on.seen[0].check);
  });
  const old = (dir: string, n: number) => { mkdirSync(dir, { recursive: true }); for (let i = 0; i < n; i++) { const f = join(dir, `old${i}.jpg`); writeFileSync(f, "x"); utimesSync(f, new Date(2020, 0, 1, 0, i), new Date(2020, 0, 1, 0, i)); } };
  test("pictures to keep: the newest ones, as many as Settings says, removed when the next picture is made", async () => {
    const r = rig({ pictures: true });
    old(r.saveDir, 120);
    r.settings.apply(apply({ "pictures.keep": 50 }));
    expect(readdirSync(r.saveDir)).toHaveLength(120);   // lowering the number removes nothing yet
    await r.task(); await settle();
    const left = readdirSync(r.saveDir);
    expect(left).toHaveLength(50);
    expect(left).not.toContain("old0.jpg");
    expect(left).toContain("old119.jpg");
  });
  test("zero shows the picture on the card, then keeps nothing", async () => {
    const r = rig({ pictures: true });
    old(r.saveDir, 3);
    r.settings.apply(apply({ "pictures.keep": 0 }));
    await r.task(); await settle();
    const v = of(r.events, "receipt.visual")[0];
    expect(v).toMatchObject({ made: true });
    expect(v.image.length).toBeGreaterThan(0);
    expect(v.file).toBeUndefined();
    expect(readdirSync(r.saveDir)).toEqual([]);
  });
  test("the earlier version is pictured with this project's start and page size, and its time allowed", async () => {
    const r = rig({ pictures: true });
    r.settings.apply(apply({}, r.project, { "check.start": "web", "check.pageSize": "phone", "check.time": "longest" }));
    await r.task(); await settle();
    expect(r.befores[0]).toMatchObject({ start: "web", viewport: VIEWPORTS.phone, startMs: 4 * 60_000, browserMs: 4 * 20_000 });
    const u = rig({ pictures: true });
    await u.task(); await settle();
    expect(u.befores[0].start).toBe("auto");
    expect(u.befores[0].viewport).toBeUndefined();
    expect([u.befores[0].startMs, u.befores[0].browserMs]).toEqual([60_000, 20_000]);
  });
});

describe("reading the last Vercel deploy log (rescue.readDeployLog)", () => {
  const reader = () => { const reads: string[] = []; return { reads, logs: { lastFailedBuild: async (p: string) => { reads.push(p); return { state: "none" as const }; } } }; };
  test("on, as today: Point at the problem and Rescue read it", async () => {
    const d = reader();
    const r = rig({ deployLogs: d.logs, rounds: [[{ text: JSON.stringify({ summary: "s", works: [], broken: "b", steps: ["one"] }), costUsd: 0.01 }]] });
    await r.runner.handle({ v: 1, id: "f", type: "problem.find", project: r.project, agent: "a1" });
    await r.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: r.project, agent: "r1", model: "m", budgetUsd: 5 });
    expect(d.reads).toHaveLength(2);
  });
  test("off: they look only at the project", async () => {
    const d = reader();
    const r = rig({ deployLogs: d.logs, rounds: [[{ text: JSON.stringify({ summary: "s", works: [], broken: "b", steps: ["one"] }), costUsd: 0.01 }]] });
    r.settings.apply(apply({ "rescue.readDeployLog": false }));
    await r.runner.handle({ v: 1, id: "f", type: "problem.find", project: r.project, agent: "a1" });
    await r.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: r.project, agent: "r1", model: "m", budgetUsd: 5 });
    expect(d.reads).toEqual([]);
    expect(of(r.events, "problem.found")[0].verdict).toBe("passed");
    expect(of(r.events, "rescue.report")).toHaveLength(1);
  });
});

describe("my internet is slow (net.slow)", () => {
  const ok = (): RunResult => ({ code: 0, stdout: "https://shop-abc.vercel.app", stderr: "", timedOut: false } as RunResult);
  test("installing on a press and copying a project from a link wait twice as long; off is today's", async () => {
    const waits: [string, number][] = [];
    const r = rig({ commands: async (c, ro) => { waits.push([c.split(" ")[0] + " " + c.split(" ")[1], ro.timeoutMs]); return { code: 1, stdout: "", stderr: "no", timedOut: false } as RunResult; } });
    writeFileSync(join(r.project, "package.json"), JSON.stringify({ name: "x" }));
    const parent = tmp("parent");
    await r.runner.handle({ v: 1, id: "i1", type: "project.install", project: r.project });
    // Only the stand in may run commands here: never a real install or a real copy from the internet.
    expect(waits).toHaveLength(1);
    await r.runner.handle({ v: 1, id: "k1", type: "project.clone", url: "https://github.com/a/b", parent });
    r.settings.apply(apply({ "net.slow": true }));
    await r.runner.handle({ v: 1, id: "i2", type: "project.install", project: r.project });
    await r.runner.handle({ v: 1, id: "k2", type: "project.clone", url: "https://github.com/a/b", parent });
    expect(waits).toEqual([["npm install", 10 * 60_000], ["git clone", 5 * 60_000], ["npm install", 20 * 60_000], ["git clone", 10 * 60_000]]);
  });
  test("the snapshot limit is doubled too", async () => {
    const r = rig();
    await r.task();
    const store = CheckpointStore.shared(join(r.shadowRoot, `${createHash("sha256").update(resolve(r.project)).digest("hex").slice(0, 16)}.git`), r.project);
    expect(store.gitTimeoutMs).toBe(5 * 60_000);
    r.settings.apply(apply({ "net.slow": true }));
    await r.task("c2");
    expect(store.gitTimeoutMs).toBe(10 * 60_000);
  });
  test("deploying, going live and rolling back wait twice as long; off is today's", async () => {
    const waits: number[] = [];
    let slow = false;
    const v = new VercelCli(async (_c, ro) => { waits.push(ro.timeoutMs); return ok(); }, "/nowhere", () => true, () => (slow ? 2 : 1));
    await v.preview("/p"); await v.promote("https://shop-abc.vercel.app", "/p"); await v.rollback("/p");
    slow = true;
    await v.preview("/p"); await v.promote("https://shop-abc.vercel.app", "/p"); await v.rollback("/p");
    expect(waits).toEqual([10 * 60_000, 5 * 60_000, 5 * 60_000, 20 * 60_000, 10 * 60_000, 10 * 60_000]);
  });
  test("the browser check's download waits twice as long", async () => {
    const waits: number[] = [];
    const dir = tmp("cli"); writeFileSync(join(dir, "cli.js"), "");
    await installBrowser({ installer: join(dir, "cli.js"), run: async (_c, ro) => { waits.push(ro.timeoutMs); return ok(); } });
    await installBrowser({ installer: join(dir, "cli.js"), timeoutMs: 30 * 60_000, run: async (_c, ro) => { waits.push(ro.timeoutMs); return ok(); } });
    expect(waits).toEqual([15 * 60_000, 30 * 60_000]);
    const asked: number[] = [];
    let slow = true;
    const b = new BrowserSetup({ emit: () => {}, installed: () => false, install: async (x) => { asked.push(x.timeoutMs ?? 0); return { ok: false, detail: "" }; }, timeoutMs: () => (slow ? 30 : 15) * 60_000 });
    await b.install(); slow = false; await b.install();
    expect(asked).toEqual([30 * 60_000, 15 * 60_000]);
  });
});

describe("what the project report says for the Settings rows", () => {
  test("its own scripts, the checks it has, its .claude/proof.json and .claude/launch.json", async () => {
    const r = rig();
    writeFileSync(join(r.project, "package.json"), JSON.stringify({ name: "x", scripts: { dev: "vite", lint: "eslint .", test: "vitest", "start:prod": "node .", "bad name; rm": "x" } }));
    await r.runner.handle({ v: 1, id: "i", type: "project.inspect", project: r.project });
    const a = of(r.events, "project.report")[0];
    expect(a.scripts).toEqual(["dev", "lint", "start:prod", "test"]);
    expect(a.checks).toEqual(["lint", "test"]);
    expect(a.proofFile).toBeNull();
    expect(a.launchFile).toBe(false);
    mkdirSync(join(r.project, ".claude"), { recursive: true });
    writeFileSync(join(r.project, ".claude", "proof.json"), JSON.stringify({ expectText: ["Hi"], click: "#go", expectAfterClick: "Done" }));
    writeFileSync(join(r.project, ".claude", "launch.json"), JSON.stringify({ configurations: [{ runtimeExecutable: "bun" }] }));
    await r.runner.handle({ v: 1, id: "j", type: "project.inspect", project: r.project });
    const b = of(r.events, "project.report")[1];
    expect(b.proofFile).toEqual({ expectText: ["Hi"], click: "#go", expectAfterClick: "Done" });
    expect(b.launchFile).toBe(true);
  });
});

describe("which task broke it", () => {
  test("each earlier version is checked with this project's choices", async () => {
    const r = rig({ rounds: [[bash("echo 1 > one.txt")], [bash("echo 2 > two.txt")]] });
    const bisectRunner = new AgentRunner({ shadowRoot: r.shadowRoot, engine: new ScriptedEngine([[bash("echo 1 > one.txt")], [bash("echo 2 > two.txt")]]), log: new TaskLog(":memory:"), emit: (e) => r.events.push(e), settings: r.settings, proof: async (ctx) => { r.seen.push(ctx); return passed; }, bisect: { workDir: tmp("bw") } });
    await bisectRunner.handle({ v: 1, id: "t1", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "one", model: "m", budgetUsd: 3 });
    await bisectRunner.handle({ v: 1, id: "t2", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "two", model: "m", budgetUsd: 3 });
    r.settings.apply(apply({}, r.project, { "check.skip": ["build"] }));
    r.seen.length = 0;
    await bisectRunner.handle({ v: 1, id: "b", type: "bisect.start", project: r.project, agent: "a1" });
    expect(r.seen.length).toBeGreaterThan(0);
    for (const c of r.seen) expect(c.check?.skip).toEqual(["build"]);
    expect(existsSync(r.project)).toBe(true);
  });
});
