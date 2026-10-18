// Take the wheel: the agent pauses when you touch the project, and carries on only when you say so.
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
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-pz-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string, delayMs?: number): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01, ...(delayMs ? { delayMs } : {}) });
const plan = (...s: string[]): Step => ({ text: "```json\n" + JSON.stringify(s) + "\n```", costUsd: 0.01 });

function setup(rounds: Step[][], proof?: () => Promise<any>) {
  const project = tmp("p"); writeFileSync(join(project, "notes.txt"), "start");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: proof ?? (async () => ({ verdict: "passed", steps: [] })) });
  const begin = async (steps: string[]) => {
    await Bun.sleep(100); // the project files were made a moment ago, like a real project's files
    await runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "d1", goal: "g", model: "m", budgetUsd: 5 });
    return runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps });
  };
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "x", agent: "d1", ...c } as never);
  return { project, events, engine, runner, begin, cmd };
}
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 4000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };

describe("pausing when you edit a file", () => {
  // The agent's step only ends when it is stopped, so a pause that came while it was still thinking is shown by what
  // happened, not by the clock: a busy Mac cannot fail it. How quickly the file is noticed is the watcher's own test.
  test("a hand edit while the agent is thinking pauses it, and names the file", async () => {
    const r = setup([[plan("One")], [write("a.txt", "agent", 600_000)]]);
    const run = r.begin(["One"]);
    await waitFor(() => r.engine.calls.length >= 2, 10_000);   // the step's own round has started: the agent is thinking
    // The system can take a moment to start telling about files; the edit is made again until it is noticed.
    for (let i = 0; i < 40 && !of(r.events, "drive.paused").length; i++) { writeFileSync(join(r.project, "mine.txt"), `I typed this ${i}`); await waitFor(() => of(r.events, "drive.paused").length > 0, 250); }
    expect(of(r.events, "drive.paused")[0]).toMatchObject({ agent: "d1", reason: "files_changed", path: "mine.txt" });
    expect(existsSync(join(r.project, "a.txt"))).toBe(false);
    expect(of(r.events, "drive.done").length).toBe(0);
    await r.cmd({ type: "agent.interruptAll", reason: "test over" });
    await run;
  }, 30_000);
  test("it waits: nothing more runs until you resume", async () => {
    const r = setup([[plan("One")], [write("a.txt", "agent", 1500)], [write("a.txt", "agent")]]);
    const run = r.begin(["One"]);
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(300); writeFileSync(join(r.project, "mine.txt"), "x");
    await waitFor(() => of(r.events, "drive.paused").length > 0);
    await Bun.sleep(1800);
    expect(r.engine.calls.length).toBe(2);
    expect(of(r.events, "drive.done").length).toBe(0);
    await r.cmd({ type: "drive.resume" });
    await run;
  });
  test("resuming continues the same step in the same conversation, and tells Claude you changed things", async () => {
    const r = setup([[plan("One")], [write("a.txt", "agent", 1500)], [write("a.txt", "agent")]]);
    const run = r.begin(["One"]);
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(300); writeFileSync(join(r.project, "mine.txt"), "x");
    await waitFor(() => of(r.events, "drive.paused").length > 0);
    await r.cmd({ type: "drive.resume" });
    await run;
    expect(r.engine.calls[2].resumeSession).toBeTruthy();
    expect(r.engine.calls[2].prompt).toMatch(/paused/i);
    expect(r.engine.calls[2].prompt).toContain("One");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 1, total: 1 });
    expect(existsSync(join(r.project, "mine.txt"))).toBe(true);
  });
  test("the agent's own writes never pause it", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("b.txt", "2")]]);
    await r.begin(["One", "Two"]);
    expect(of(r.events, "drive.paused").length).toBe(0);
    expect(of(r.events, "drive.done")[0].status).toBe("done");
  });
  test("files the checks write are not mistaken for your edits", async () => {
    let dir = "";
    const r = setup([[plan("One")], [write("a.txt", "1")]], async () => { await Bun.sleep(800); await Bun.sleep(800); writeFileSync(join(dir, "built-by-the-checks.txt"), "x"); await Bun.sleep(100); return { verdict: "passed", steps: [] }; });
    dir = r.project;
    await r.begin(["One"]);
    expect(of(r.events, "drive.paused").length).toBe(0);
  });
  test("an edit after the plan ended is ignored: it is watching only while it works", async () => {
    const r = setup([[plan("One")], [write("a.txt", "1")]]);
    await r.begin(["One"]);
    await Bun.sleep(700);
    writeFileSync(join(r.project, "after.txt"), "x");
    await Bun.sleep(700);
    expect(of(r.events, "drive.paused").length).toBe(0);
  });
});

describe("pausing because the editor or terminal came to the front", () => {
  test("the app can ask for a pause, and the reason is passed on", async () => {
    // The step only ends when it is stopped: the pause is shown at once, while it is still thinking, not after it.
    const r = setup([[plan("One")], [write("a.txt", "agent", 600_000)], [write("a.txt", "agent")]]);
    const run = r.begin(["One"]);
    await waitFor(() => r.engine.calls.length >= 2, 10_000);
    await r.cmd({ type: "drive.pause", reason: "editor" });
    expect(of(r.events, "drive.paused")[0]).toMatchObject({ reason: "editor" });
    expect(existsSync(join(r.project, "a.txt"))).toBe(false);
    await r.cmd({ type: "drive.resume" });
    await run;
    expect(of(r.events, "drive.done")[0].status).toBe("done");
  }, 30_000);
  test("a pause while nothing is running is refused plainly", async () => {
    const r = setup([[plan("One")]]);
    await r.cmd({ type: "drive.pause", reason: "editor" });
    expect((of(r.events, "protocol.error")[0]).reason).toMatch(/nothing is running/i);
  });
  test("a second pause request while paused changes nothing", async () => {
    const r = setup([[plan("One")], [write("a.txt", "agent", 1500)], [write("a.txt", "agent")]]);
    const run = r.begin(["One"]);
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(200);
    await r.cmd({ type: "drive.pause", reason: "editor" });
    await r.cmd({ type: "drive.pause", reason: "terminal" });
    await waitFor(() => of(r.events, "drive.paused").length > 0);
    await Bun.sleep(300);
    expect(of(r.events, "drive.paused").length).toBe(1);
    await r.cmd({ type: "drive.resume" });
    await run;
  });
});

describe("while paused", () => {
  test("the stop key ends the plan", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "agent", 1500)], [write("b.txt", "x")]]);
    const run = r.begin(["One", "Two"]);
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(200);
    await r.cmd({ type: "drive.pause", reason: "you" });
    await waitFor(() => of(r.events, "drive.paused").length > 0);
    await r.cmd({ type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(of(r.events, "drive.done")[0].status).toBe("interrupted");
    expect(existsSync(join(r.project, "b.txt"))).toBe(false);
  });
  test("resuming with nothing paused is refused plainly", async () => {
    const r = setup([[plan("One")]]);
    await r.cmd({ type: "drive.resume" });
    expect(of(r.events, "protocol.error")[0].reason).toMatch(/not paused/i);
  });
});
