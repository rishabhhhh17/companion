// The engine's side of Watch routines and Where was I (F21): Where was I from the real task log, Rescue given the failing CI
// run as evidence, and the project's own checks run for a watch with no model. Stand ins for the tools, no network.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { runPrint } from "../src/proof/approvedruns.ts";
import type { CiLatest, CiReader } from "../src/connections.ts";
import type { Event } from "../../protocol/index.ts";
import { PRODUCT } from "../src/names.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-wa-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const passed: LadderResult = { verdict: "passed", steps: [{ rung: "checks", label: "Building and checking the code", status: "passed", detail: "build passed.", ms: 1 }] };
const failed: LadderResult = { verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail: "2 tests failed: cart total is wrong. password=hunter2hunter2", ms: 1 }] };
const diag: Step = { text: JSON.stringify({ summary: "A shop.", works: ["It builds"], broken: "CI fails.", steps: ["Fix the test"] }), costUsd: 0.01 };

function setup(o: { ladder?: LadderResult; ci?: CiReader; settings?: Record<string, unknown>; watches?: any[]; approve?: boolean } = {}) {
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", scripts: { build: "true" } }));
  const events: Event[] = [];
  const log = new TaskLog(":memory:");
  const settings = new RunnerSettings();
  if (o.settings) settings.apply({ v: 1, id: "s", type: "settings.apply", values: o.settings });
  const ladderCalls: any[] = [];
  const engine = new ScriptedEngine([[diag]]);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, settings, now: () => new Date(2026, 9, 22, 15), emit: (e) => events.push(e), proof: async (opts: any) => { ladderCalls.push(opts); return o.ladder ?? passed; }, ci: o.ci, watches: { forProject: () => o.watches ?? [] } });
  // The person has already run something of their own here, so Companion has recorded the project's scripts as allowed.
  if (o.approve !== false) (runner as any).approvals(project).add(runPrint({ "package.json": readFileSync(join(project, "package.json"), "utf8") }));
  return { project, events, log, runner, engine, ladderCalls };
}
const ci = (latest: CiLatest, text: string | null = "Failed: test, step \"Run tests\"\nThe end of its log:\nboom"): CiReader & { reads: number } => { const r = { reads: 0, latestRun: async () => { r.reads++; return latest; }, failureLog: async () => text }; return r; };
const failingRun: CiLatest = { state: "failing", reason: "Tests failed on main.", run: { id: 8, workflow: "Tests", branch: "main", url: "", title: "Fix the cart" }, failing: [] };

describe("where.was.i in the engine", () => {
  test("it answers from the real task history, the watches and what waits, with no model", async () => {
    const s = setup({ watches: [{ id: "w_1", kind: "site_up", target: "https://shop.example.com/", state: "failing", since: new Date(2026, 9, 22, 10, 2).toISOString(), reason: "503", history: [] }] });
    const id = s.log.start({ project: s.project, agent: "builder-1", mode: "drive", label: "Add a contact form", startedAt: new Date(2026, 9, 22, 9).toISOString() });
    s.log.finish(id, "done", 0.1, new Date(2026, 9, 22, 9, 5).toISOString(), { checkpoint: "cp", changed: 2, proof: "passed" });
    await s.runner.handle({ v: 1, id: "q", type: "where.was.i", project: s.project } as never);
    const r = of(s.events, "where.ready")[0];
    expect(r.project).toBe(s.project);
    expect(r.lines[0]).toBe("You were working on: Add a contact form. It finished and its checks passed.");
    expect(r.lines[1]).toBe("Not finished: Your site (shop.example.com) has been failing since 10:02: 503");
    expect(r.next).toEqual({ action: "fixWatch", watch: "w_1" });
    expect(s.engine.calls).toHaveLength(0);
    expect(s.events.some((e) => e.type === "agent.state" || e.type === "cost.update")).toBe(false);
  });
  test("a question that is waiting, and an off the record task, are told without the off the record words", async () => {
    const s = setup();
    const a = s.log.start({ project: s.project, agent: "builder-1", mode: "drive", label: "Off the record task", startedAt: new Date().toISOString() });
    s.log.finish(a, "not_done", 0, new Date().toISOString(), { checkpoint: "cp", changed: 0, proof: "failed" });
    await s.runner.handle({ v: 1, id: "q", type: "where.was.i", project: s.project, since: new Date(Date.now() - 3600_000).toISOString() } as never);
    const r = of(s.events, "where.ready")[0];
    expect(r.lines.join(" ")).not.toMatch(/Off the record/);
    expect(r.lines[0]).toMatch(/off the record/);
    expect(r.next).toEqual({ action: "none" });
  });
});

describe("Rescue is given the failing CI run", () => {
  test("it reads the run, read only, and the evidence goes into the diagnosis", async () => {
    const c = ci(failingRun);
    const s = setup({ ci: c });
    await Bun.sleep(30);
    await s.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: s.project, agent: "r1", model: "m", budgetUsd: 5 } as never);
    expect(c.reads).toBe(1);
    const report = of(s.events, "rescue.report")[0];
    const item = report.evidence.find((x: any) => x.label === "Your latest GitHub run");
    expect(item).toMatchObject({ status: "failed" });
    expect(item.detail).toContain("Tests failed on main.");
    expect(item.detail).toContain("boom");
    expect(s.engine.calls[0].prompt ?? JSON.stringify(s.engine.calls[0])).toContain("Your latest GitHub run");
  });
  test("a run that passed adds nothing; the tool missing is one plain line; and it can be switched off", async () => {
    const okc = ci({ state: "ok", reason: "CI passed on main.", run: failingRun.state === "failing" ? failingRun.run : (undefined as never), failing: [] });
    const a = setup({ ci: okc });
    await a.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: a.project, agent: "r1", model: "m", budgetUsd: 5 } as never);
    expect(of(a.events, "rescue.report")[0].evidence.some((x: any) => x.label === "Your latest GitHub run")).toBe(false);
    const missing = ci({ state: "unknown", reason: "The GitHub tool (gh) is not installed. Install it from cli.github.com, then sign in with: gh auth login" });
    const b = setup({ ci: missing });
    await b.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: b.project, agent: "r1", model: "m", budgetUsd: 5 } as never);
    // A tool that is missing or not signed in says nothing about the project: skipped, never failed.
    const item = of(b.events, "rescue.report")[0].evidence.find((x: any) => x.label === "Your latest GitHub run");
    expect(item.detail).toMatch(/gh auth login/);
    expect(item.status).toBe("skipped");
    const prompt = JSON.stringify(b.engine.calls[0]);
    expect(prompt).not.toMatch(/GitHub run: failed/i);
    const off = ci(failingRun);
    const c = setup({ ci: off, settings: { "rescue.readCiRun": false } });
    await c.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: c.project, agent: "r1", model: "m", budgetUsd: 5 } as never);
    expect(off.reads).toBe(0);
  });
});

describe("the project's own checks for a watch", () => {
  const run = (s: ReturnType<typeof setup>, ac = new AbortController()) => s.runner.checkWithoutModel(s.project, ac.signal);
  test("no model, no install, the project is not changed; a pass is fine, a failure names the check without secrets", async () => {
    const a = setup();
    expect(await run(a)).toEqual({ outcome: "ok", reason: "All of the project's own checks passed." });
    expect(a.ladderCalls[0].noInstall).toBe(true);
    expect(a.engine.calls).toHaveLength(0);
    const b = setup({ ladder: failed });
    const r = await run(b);
    expect(r).toMatchObject({ outcome: "failing" });
    expect((r as any).reason).toContain("Running the tests did not pass");
    expect((r as any).reason).not.toContain("hunter2hunter2");
    const n = setup({ ladder: { verdict: "nothing_to_check", steps: [] } });
    expect(await run(n)).toMatchObject({ outcome: "unknown" });
    const g = setup({ ladder: { verdict: "passed_with_gaps", steps: passed.steps, gaps: ["The browser check could not run."] } });
    expect(await run(g)).toMatchObject({ outcome: "ok" });
  });
  test("it takes no checkpoint, so a check every few minutes leaves nothing in the list of things to undo", async () => {
    const s = setup();
    for (let i = 0; i < 3; i++) await run(s);
    expect(await (s.runner as any).store(s.project).list()).toHaveLength(0);
    expect(s.events.some((e) => e.type === "checkpoint.created")).toBe(false);
    expect(s.ladderCalls[0].beforeId).toBe("live");
    // what the checks read is the folder as it is now, and nothing else
    const files = await s.ladderCalls[0].store.readFiles("live", () => true);
    expect(Object.keys(files)).toEqual(["package.json"]);
  });
  test(`it builds and tests only: it never starts the project, and its commands end with ${PRODUCT}`, async () => {
    const s = setup();
    await run(s);
    expect(s.ladderCalls[0].noServer).toBe(true);
    // what the ladder runs goes through a wrapper that makes each command end with Companion (exec.ts endWithUs)
    const wrapped = s.ladderCalls[0].run as (c: string, o: any) => Promise<{ code: number | null }>;
    expect(typeof wrapped).toBe("function");
    expect((await wrapped("true", { cwd: s.project, timeoutMs: 5000 })).code).toBe(0);
  });
  test(`a project nobody has allowed ${PRODUCT} to run is not run: it says so, once, in the watch`, async () => {
    const s = setup({ approve: false });
    const r = await run(s);
    expect(r).toMatchObject({ outcome: "unknown", reason: expect.stringMatching(/not been allowed to run this project's scripts/) });
    expect(s.ladderCalls).toHaveLength(0);
    // the scripts changed since the person last allowed them: still nothing runs
    (s.runner as any).approvals(s.project).add(runPrint({ "package.json": "{}" }));
    expect(await run(s)).toMatchObject({ outcome: "unknown" });
    expect(s.ladderCalls).toHaveLength(0);
    writeFileSync(join(s.project, "package.json"), "{}");
    expect(await run(s)).toMatchObject({ outcome: "ok" });
    expect(s.ladderCalls).toHaveLength(1);
  });
  test("the person's own work comes first: a slow check never holds the project, it ends and is tried again", async () => {
    const s = setup();
    let seen: AbortSignal | undefined;
    let n = 0;
    (s.runner as any).o.proof = async (opts: any) => {
      if (n++ === 0) { seen = opts.signal; await new Promise<void>((res) => opts.signal.addEventListener("abort", () => res(), { once: true })); return { verdict: "cancelled", steps: [] }; }
      return passed;
    };
    const slow = run(s);
    for (let i = 0; i < 100 && !seen; i++) await Bun.sleep(5);
    expect(seen).toBeDefined();
    // Point at the problem is refused while something else works, and is not refused for a watch's check
    await s.runner.handle({ v: 1, id: "p", type: "problem.find", project: s.project, agent: "f1" } as never);
    expect(seen!.aborted).toBe(true);
    expect(await slow).toMatchObject({ skip: expect.stringMatching(/came first/) });
    expect(of(s.events, "protocol.error").some((e) => /already working/.test(e.reason))).toBe(false);
    expect(of(s.events, "problem.found")[0].verdict).not.toBe("cancelled");
  });
  test("a stop says nothing about the project, and a task at work on the folder is not judged half way", async () => {
    const s = setup({ ladder: { verdict: "cancelled", steps: [] } });
    expect(await run(s)).toBeNull();
    const busy = setup();
    const ac = new AbortController();
    const first = busy.runner.checkWithoutModel(busy.project, ac.signal);
    const second = await run(busy);
    expect(second).toMatchObject({ skip: expect.stringMatching(/working on this project/) });
    await first;
  });
  test("it is a Flow check: switching Flow off ends it", async () => {
    const s = setup();
    let seen: AbortSignal | undefined;
    (s.runner as any).o.proof = async (opts: any) => { seen = opts.signal; await new Promise((r) => setTimeout(r, 40)); return passed; };
    const p = run(s);
    for (let i = 0; i < 100 && !seen; i++) await Bun.sleep(10);
    await s.runner.stopGroup("flow");
    expect(seen?.aborted).toBe(true);
    expect(await p).toBeNull();
  });
});
