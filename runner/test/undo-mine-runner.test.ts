// Undo through the runner keeps the person's own files (T06, 21 Oct 2026): after a task, after a paused plan, with the switch off,
// the second press, and Stop while it runs. Scripted engine, temporary folders, no network.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { RunnerSettings } from "../src/settings.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseEvent, parseCommand } from "../../protocol/index.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-um-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string, delayMs?: number): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01, ...(delayMs ? { delayMs } : {}) });
const plan = (...s: string[]): Step => ({ text: "```json\n" + JSON.stringify(s) + "\n```", costUsd: 0.01 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 4000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };
const text = (d: string, f: string) => readFileSync(join(d, f), "utf8");

function setup(rounds: Step[][], values: Record<string, unknown> = {}) {
  const project = tmp("p"); writeFileSync(join(project, "a.txt"), "a0"); writeFileSync(join(project, "b.txt"), "b0");
  const events: Event[] = [];
  const settings = new RunnerSettings();
  settings.apply({ v: 1, id: "s", type: "settings.apply", values } as never);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e), settings, proof: async () => ({ verdict: "passed", steps: [] }) });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "x", agent: "d1", ...c } as never);
  const task = async () => { await cmd({ type: "agent.start", project, mode: "drive", prompt: "x", model: "m", budgetUsd: 3 }); return of(events, "checkpoint.created").at(-1).checkpoint as string; };
  const undo = (checkpoint: string) => cmd({ type: "checkpoint.restore", project, checkpoint });
  return { project, events, runner, cmd, task, undo };
}

describe("after a task", () => {
  test("a file you changed after it is kept, named, and the rest goes back", async () => {
    const r = setup([[write("a.txt", "a1 agent"), write("b.txt", "b1 agent"), write("c.txt", "made")]]);
    const cp = await r.task();
    writeFileSync(join(r.project, "a.txt"), "a2 mine");
    await r.undo(cp);
    const done = of(r.events, "checkpoint.restored")[0];
    expect(done.yours).toEqual(["a.txt"]);
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...done })).ok).toBe(true);
    expect(text(r.project, "a.txt")).toBe("a2 mine");
    expect(text(r.project, "b.txt")).toBe("b0");
    expect(existsSync(join(r.project, "c.txt"))).toBe(false);
  });

  test("a task whose files you never touched undoes completely, as before", async () => {
    const r = setup([[write("a.txt", "a1 agent")]]);
    const cp = await r.task();
    await r.undo(cp);
    expect(of(r.events, "checkpoint.restored")[0].yours).toEqual([]);
    expect(text(r.project, "a.txt")).toBe("a0");
  });

  test("Put those back too is a separate press: nothing happens without the yes, then your version is saved aside and the old one returns", async () => {
    const r = setup([[write("a.txt", "a1 agent")]]);
    const cp = await r.task();
    writeFileSync(join(r.project, "a.txt"), "a2 mine");
    await r.undo(cp);
    expect(parseCommand(JSON.stringify({ v: 1, id: "p", type: "checkpoint.putBack", project: r.project, checkpoint: cp })).ok).toBe(false);   // no yes, no command
    await r.cmd({ type: "checkpoint.putBack", project: r.project, checkpoint: cp, confirm: false });
    expect(of(r.events, "checkpoint.putBackDone")[0]).toMatchObject({ ok: false });
    expect(text(r.project, "a.txt")).toBe("a2 mine");
    await r.cmd({ type: "checkpoint.putBack", project: r.project, checkpoint: cp, confirm: true });
    const back = of(r.events, "checkpoint.putBackDone")[1];
    expect(back).toMatchObject({ ok: true, putBack: ["a.txt"] });
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...back })).ok).toBe(true);
    expect(text(r.project, "a.txt")).toBe("a0");
    expect(readFileSync(join(back.savedTo, "a.txt"), "utf8")).toBe("a2 mine");
  });

  test("it will not run while work is going on, and changes nothing", async () => {
    const r = setup([[write("a.txt", "a1 agent")], [{ text: "thinking", costUsd: 0, delayMs: 1500 }]]);
    const cp = await r.task();
    writeFileSync(join(r.project, "a.txt"), "a2 mine");
    await r.undo(cp);
    const run = r.cmd({ type: "agent.start", project: r.project, mode: "drive", prompt: "y", model: "m", budgetUsd: 3 });
    await Bun.sleep(150);
    await r.cmd({ type: "checkpoint.putBack", project: r.project, checkpoint: cp, confirm: true });
    expect(of(r.events, "checkpoint.putBackDone").at(-1)).toMatchObject({ ok: false });
    expect(of(r.events, "checkpoint.putBackDone").at(-1).reason).toMatch(/still working|wait/i);
    expect(text(r.project, "a.txt")).toBe("a2 mine");
    await r.cmd({ type: "agent.interruptAll", reason: "test" });
    await run;
  });

  test("Stop while Undo runs: it still finishes cleanly, your file is intact and the project can be put back from the saved copy", async () => {
    const r = setup([[write("a.txt", "a1 agent"), write("b.txt", "b1 agent")]]);
    const cp = await r.task();
    writeFileSync(join(r.project, "a.txt"), "a2 mine");
    const undoing = r.undo(cp);
    await r.cmd({ type: "agent.interruptAll", reason: "test" });
    await undoing;
    expect(text(r.project, "a.txt")).toBe("a2 mine");
    expect(text(r.project, "b.txt")).toBe("b0");
    const safety = of(r.events, "checkpoint.restored")[0].safety;
    await r.undo(safety);                                       // the undo of the undo
    expect(text(r.project, "b.txt")).toBe("b1 agent");
    expect(text(r.project, "a.txt")).toBe("a2 mine");
  });
});

describe("the switch (undo.protectMyEdits)", () => {
  test("off: your later edit is replaced, and kept in the safety copy so the Undo can be undone", async () => {
    const r = setup([[write("a.txt", "a1 agent")]], { "undo.protectMyEdits": false });
    const cp = await r.task();
    writeFileSync(join(r.project, "a.txt"), "a2 mine");
    await r.undo(cp);
    expect(of(r.events, "checkpoint.restored")[0].yours).toEqual([]);
    expect(text(r.project, "a.txt")).toBe("a0");
    await r.undo(of(r.events, "checkpoint.restored")[0].safety);
    expect(text(r.project, "a.txt")).toBe("a2 mine");
  });
});

describe("a plan you paused and edited", () => {
  const pausedPlan = async (values: Record<string, unknown>) => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "a1 agent")], [write("b.txt", "b1 agent", 3000)], [write("b.txt", "b1 agent")]], values);
    await Bun.sleep(100);   // the project files were made a moment ago, like a real project's files
    await r.cmd({ type: "drive.plan", project: r.project, goal: "g", model: "m", budgetUsd: 5 });
    const run = r.cmd({ type: "drive.approve", steps: ["One", "Two"] });
    await waitFor(() => of(r.events, "drive.step").some((e) => e.index === 2 && e.status === "started"));
    // Step two is thinking. The system can take a moment to start telling about files; the edit is made again until it is noticed.
    for (let i = 0; i < 40 && !of(r.events, "drive.paused").length; i++) { writeFileSync(join(r.project, "a.txt"), `a2 mine ${i}`); await waitFor(() => of(r.events, "drive.paused").length > 0, 250); }
    expect(of(r.events, "drive.paused")[0]).toMatchObject({ reason: "files_changed" });
    await r.cmd({ type: "drive.resume" });
    await run;
    const cps = of(r.events, "checkpoint.created").filter((e) => /^Before/.test(e.label));
    return { r, first: cps[0].checkpoint as string, second: cps[1].checkpoint as string };
  };

  test("undoing the first step keeps the file you edited while it was paused", async () => {
    const { r, first } = await pausedPlan({});
    expect(of(r.events, "drive.done")[0].status).toBe("done");
    await r.undo(first);
    const done = of(r.events, "checkpoint.restored")[0];
    expect(done.yours).toEqual(["a.txt"]);
    expect(text(r.project, "a.txt")).toMatch(/^a2 mine/);
    expect(text(r.project, "b.txt")).toBe("b0");
  }, 30_000);

  test("even with the switch off, a pause edit is kept", async () => {
    const { r, first } = await pausedPlan({ "undo.protectMyEdits": false });
    await r.undo(first);
    expect(of(r.events, "checkpoint.restored")[0].yours).toEqual(["a.txt"]);
    expect(text(r.project, "a.txt")).toMatch(/^a2 mine/);
  }, 30_000);

  test("Put those back too brings the old file back, with your version saved aside", async () => {
    const { r, first } = await pausedPlan({});
    await r.undo(first);
    await r.cmd({ type: "checkpoint.putBack", project: r.project, checkpoint: first, confirm: true });
    const back = of(r.events, "checkpoint.putBackDone")[0];
    expect(back).toMatchObject({ ok: true, putBack: ["a.txt"] });
    expect(text(r.project, "a.txt")).toBe("a0");
    expect(readFileSync(join(back.savedTo, "a.txt"), "utf8")).toMatch(/^a2 mine/);
  }, 30_000);
});

describe("between two tasks", () => {
  test("you edit between task one and task two; undoing task one keeps your edit", async () => {
    const r = setup([[write("a.txt", "a1 agent")], [write("b.txt", "b1 agent")]]);
    const cp1 = await r.task();
    writeFileSync(join(r.project, "a.txt"), "a2 mine");
    await r.task();
    await r.undo(cp1);
    expect(of(r.events, "checkpoint.restored")[0].yours).toEqual(["a.txt"]);
    expect(text(r.project, "a.txt")).toBe("a2 mine");
    expect(text(r.project, "b.txt")).toBe("b0");
  });
});

describe("review fixes", () => {
  test("Put my fix back (force) replaces your attempt, and the Undo of it brings your attempt back", async () => {
    const r = setup([[write("a.txt", "a1 agent")]]);
    const cp = await r.task();
    writeFileSync(join(r.project, "a.txt"), "person attempt");
    await r.cmd({ type: "checkpoint.restore", project: r.project, checkpoint: cp, force: true });
    const done = of(r.events, "checkpoint.restored")[0];
    expect(done.yours).toEqual([]);
    expect(text(r.project, "a.txt")).toBe("a0");
    await r.undo(done.safety);
    expect(text(r.project, "a.txt")).toBe("person attempt");
  });

  test("a task that throws part way still moves the baseline: Undo still undoes the task and does not blame you", async () => {
    const r = setup([[write("b.txt", "b1 agent")], [write("a.txt", "a1 agent")]]);
    await r.task();                                                          // a first task, so there is a baseline
    const store = (r.runner as any).store(r.project);
    store.diff = async () => { throw new Error("boom"); };
    await r.task().catch(() => undefined);
    const cp = of(r.events, "checkpoint.created").at(-1).checkpoint as string;
    delete store.diff;
    await r.undo(cp);
    const done = of(r.events, "checkpoint.restored")[0];
    expect(done?.yours).toEqual([]);
    expect(text(r.project, "a.txt")).toBe("a0");
  });

  test("an install that changes the lock file does not make the lock file look like your edit", async () => {
    const r = setup([[write("a.txt", "a1 agent")], [write("b.txt", "b1 agent")]]);
    writeFileSync(join(r.project, "package.json"), "{\"name\":\"x\"}");
    writeFileSync(join(r.project, "package-lock.json"), "{}");
    (r.runner as any).o.commands = async (_c: string, o: { cwd: string }) => { writeFileSync(join(o.cwd, "package-lock.json"), "{\"lock\":1}"); return { code: 0, stdout: "", stderr: "", timedOut: false, aborted: false }; };
    const cp1 = await r.task();
    await r.cmd({ type: "project.install", project: r.project });
    expect(text(r.project, "package-lock.json")).toBe("{\"lock\":1}");
    await r.task();
    await r.undo(cp1);
    expect(of(r.events, "checkpoint.restored")[0].yours).toEqual([]);
    expect(text(r.project, "a.txt")).toBe("a0");
  });
});
