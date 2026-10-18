// Real Claude throws an error when it is stopped, instead of going quiet. Stopping and pausing must still be treated
// as stopping and pausing, never as a crash. (Found by the first real Claude check of take the wheel.)
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-ra-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string, delayMs?: number): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01, ...(delayMs ? { delayMs } : {}) });
const plan = (...s: string[]): Step => ({ text: "```json\n" + JSON.stringify(s) + "\n```", costUsd: 0.01 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 4000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };

function setup(rounds: Step[][], abortDelayMs = 0) {
  const project = tmp("p"); writeFileSync(join(project, "notes.txt"), "start");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds); engine.throwOnAbort = true; engine.abortDelayMs = abortDelayMs;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
  return { project, events, engine, runner };
}
const errors = (e: Event[]) => of(e, "protocol.error").map((x) => x.reason);

describe("stopping a task whose engine throws when stopped", () => {
  test("the stop key ends it as stopped, with no error message", async () => {
    const r = setup([[write("a.txt", "1", 3000)]]);
    const run = r.runner.handle({ v: 1, id: "c", type: "agent.start", project: r.project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    await Bun.sleep(300);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(errors(r.events)).toEqual([]);
    expect(of(r.events, "agent.state").at(-1).state).toBe("idle");
  });
});

describe("take the wheel with an engine that throws when stopped", () => {
  const begin = async (r: ReturnType<typeof setup>, steps: string[]) => {
    await Bun.sleep(100);
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "d1", goal: "g", model: "m", budgetUsd: 5 });
    return r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps });
  };
  test("a hand edit pauses it, shows no error, and resuming finishes the step", async () => {
    const r = setup([[plan("One")], [write("a.txt", "agent", 2500)], [write("a.txt", "agent")]]);
    const run = begin(r, ["One"]);
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(300);
    writeFileSync(join(r.project, "mine.txt"), "I typed this");
    await waitFor(() => of(r.events, "drive.paused").length > 0);
    expect(of(r.events, "drive.paused")[0]).toMatchObject({ reason: "files_changed", path: "mine.txt" });
    expect(errors(r.events)).toEqual([]);
    await r.runner.handle({ v: 1, id: "r", type: "drive.resume", agent: "d1" });
    await run;
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 1 });
    expect(errors(r.events)).toEqual([]);
  });
  test("the stop key during a step ends the plan as stopped, never as an error", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "x", 3000)], [write("b.txt", "y")]]);
    const run = begin(r, ["One", "Two"]);
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(300);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(of(r.events, "drive.done")[0].status).toBe("interrupted");
    expect(errors(r.events)).toEqual([]);
    expect(existsSync(join(r.project, "b.txt"))).toBe(false);
  });
});

describe("stopping the read only jobs", () => {
  const slow: Step[] = [{ text: "thinking", costUsd: 0, delayMs: 3000 }, { text: "[]", costUsd: 0 }];
  test("a plan being written, stopped, ends quietly", async () => {
    const r = setup([slow]);
    await Bun.sleep(100);
    const run = r.runner.handle({ v: 1, id: "p", type: "drive.plan", project: r.project, agent: "d", goal: "g", model: "m", budgetUsd: 5 });
    await Bun.sleep(300);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(errors(r.events)).toEqual([]);
    expect(of(r.events, "plan.ready").length).toBe(0);
  });
  test("a diagnosis, stopped, ends quietly", async () => {
    const r = setup([slow]);
    const run = r.runner.handle({ v: 1, id: "d", type: "rescue.diagnose", project: r.project, agent: "r", model: "m", budgetUsd: 5 });
    await Bun.sleep(400);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(errors(r.events)).toEqual([]);
    expect(of(r.events, "rescue.report").length).toBe(0);
  });
  test("research, stopped, ends quietly", async () => {
    const r = setup([slow]);
    const run = r.runner.handle({ v: 1, id: "q", type: "research.ask", project: r.project, agent: "x", question: "q?", model: "m", budgetUsd: 5 });
    await Bun.sleep(300);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(errors(r.events)).toEqual([]);
    expect(of(r.events, "research.done").length).toBe(0);
  });
});

// The step only ends when it is stopped, and its winding down is held back until the test has looked: "the card came
// first" is shown by the order of events, never by the clock, so a busy Mac cannot fail these.
describe("the pause is shown at once, even if Claude is slow to wind down", () => {
  const held = () => {
    const r = setup([[plan("One")], [write("a.txt", "agent", 600_000)], [write("a.txt", "agent")]]);
    let release!: () => void; const gate = new Promise<void>((res) => (release = res));
    let unwound = false;
    r.engine.windDown = () => gate.then(() => { unwound = true; });
    return { ...r, release, unwound: () => unwound };
  };
  const inTheStep = async (r: ReturnType<typeof held>) => {
    await Bun.sleep(100);
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "d1", goal: "g", model: "m", budgetUsd: 5 });
    const run = r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps: ["One"] });
    await waitFor(() => r.engine.calls.length >= 2, 10_000);   // the step's own round has started: Claude is thinking
    return { run };   // not the promise itself, which an async function would wait for
  };
  test("the paused card appears long before the stopped step has finished unwinding", async () => {
    const r = held();
    const { run } = await inTheStep(r);
    // The system can take a moment to start telling about files; the edit is made again until it is noticed.
    for (let i = 0; i < 40 && !of(r.events, "drive.paused").length; i++) { writeFileSync(join(r.project, "mine.txt"), `I typed this ${i}`); await waitFor(() => of(r.events, "drive.paused").length > 0, 250); }
    expect(of(r.events, "drive.paused").length).toBe(1);
    expect(r.unwound()).toBe(false);
    r.release();
    await r.runner.handle({ v: 1, id: "r", type: "drive.resume", agent: "d1" });
    await run;
    expect(of(r.events, "drive.paused").length).toBe(1);
  }, 30_000);
  test("asking to pause from the app is just as quick", async () => {
    const r = held();
    const { run } = await inTheStep(r);
    await r.runner.handle({ v: 1, id: "x", type: "drive.pause", agent: "d1", reason: "editor" } as never);
    expect(of(r.events, "drive.paused")[0]).toMatchObject({ reason: "editor" });
    expect(r.unwound()).toBe(false);
    r.release();
    await r.runner.handle({ v: 1, id: "r", type: "drive.resume", agent: "d1" });
    await run;
  }, 30_000);
});

describe("whichever of Carry on or Stop comes first, nothing hangs", () => {
  const go = async (finish: (r: ReturnType<typeof setup>) => Promise<void>) => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "agent", 3000)], [write("a.txt", "agent")], [write("b.txt", "x")]], 1200);
    await Bun.sleep(100);
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "d1", goal: "g", model: "m", budgetUsd: 5 });
    const run = r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps: ["One", "Two"] });
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(200);
    await r.runner.handle({ v: 1, id: "x", type: "drive.pause", agent: "d1", reason: "you" } as never);
    await finish(r);
    await Promise.race([run, Bun.sleep(8000).then(() => { throw new Error("the plan hung"); })]);
    return r;
  };
  test("Carry on the instant after pausing, while the step is still winding down", async () => {
    const r = await go(async (r) => { await r.runner.handle({ v: 1, id: "r", type: "drive.resume", agent: "d1" }); });
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2 });
    expect(errors(r.events)).toEqual([]);
  });
  test("Stop the instant after pausing, while the step is still winding down", async () => {
    const r = await go(async (r) => { await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" }); });
    expect(of(r.events, "drive.done")[0].status).toBe("interrupted");
    expect(errors(r.events)).toEqual([]);
  });
  test("Carry on pressed when nothing is paused is still refused plainly", async () => {
    const r = setup([[plan("One")]]);
    await r.runner.handle({ v: 1, id: "r", type: "drive.resume", agent: "d1" });
    expect(errors(r.events)[0]).toMatch(/not paused/i);
  });
});
