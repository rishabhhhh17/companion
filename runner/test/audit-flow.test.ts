// Stops, pauses and the loop card, where the audit of 20 Oct 2026 found the plan hung, ended wrongly or told the person
// less than Undo would change (A2 to A6). All with the scripted engine and a stand in check: no real Claude runs.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-af-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string, delayMs?: number): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01, ...(delayMs ? { delayMs } : {}) });
const say = (text: string, delayMs?: number): Step => ({ text, costUsd: 0.01, ...(delayMs ? { delayMs } : {}) });
const plan = (...s: string[]): Step => say("```json\n" + JSON.stringify(s) + "\n```");
const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (detail: string): LadderResult => { const s = { rung: "tests", label: "Running the tests", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };
const within = <T>(p: Promise<T>, ms: number) => Promise.race([p.then(() => "finished"), Bun.sleep(ms).then(() => "still waiting")]);

function setup(rounds: Step[][], proofs: LadderResult[] = [ok()]) {
  const project = tmp("p"); writeFileSync(join(project, "notes.txt"), "start");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  let n = 0;
  const log = new TaskLog(":memory:");
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
  const drive = async (steps: string[]) => {
    await Bun.sleep(100);   // the project's files were made a moment ago, like a real project's
    await runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "d1", goal: "g", model: "m", budgetUsd: 5 });
    return runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps });
  };
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "x", agent: "d1", ...c } as never);
  return { project, events, engine, runner, log, drive, cmd, checks: () => n };
}
const same = bad("expected 3, got 2");
// Writes a file by hand again and again for a while, so the watcher would surely have seen one of them.
const handEdits = async (project: string, ms = 1500) => { for (let i = 0; i < ms / 100; i++) { writeFileSync(join(project, "mine.txt"), `typed ${i}`); await Bun.sleep(100); } };

describe("the loop card of a Drive step (A2)", () => {
  test("a hand edit while the card waits does not pause the plan or hide the card, and the answer still works", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "fixed")], [write("b.txt", "two")]], [same, same, same, ok()]);
    const run = r.drive(["One", "Two"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await handEdits(r.project);
    expect(of(r.events, "drive.paused")).toEqual([]);
    await r.cmd({ type: "loop.choose", choice: "different" });
    expect(await within(run, 8000)).toBe("finished");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2 });
  }, 20_000);
  test("Undo while the card waits does not leave the plan hung", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [same]);
    const run = r.drive(["One", "Two"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    const cp = of(r.events, "checkpoint.created").at(-1).checkpoint;
    await Bun.sleep(800);   // past the moment just after the step, when the watcher still takes changes as the agent's own
    await r.runner.handle({ v: 1, id: "u", type: "checkpoint.restore", project: r.project, checkpoint: cp } as never);
    expect(of(r.events, "checkpoint.restored").length).toBe(1);
    await Bun.sleep(1200);
    expect(of(r.events, "drive.paused")).toEqual([]);
    await r.cmd({ type: "loop.choose", choice: "stop" });
    expect(await within(run, 8000)).toBe("finished");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "not_done", completed: 0 });
  }, 20_000);
});

describe("a pause during Try a different approach (A3)", () => {
  test("pausing then carrying on finishes the step instead of ending the plan as stopped", async () => {
    const r = setup([[plan("One")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "new way", 600_000)], [write("a.txt", "new way")]], [same, same, same, ok()]);
    const run = r.drive(["One"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.cmd({ type: "loop.choose", choice: "different" });
    await waitFor(() => r.engine.calls.length >= 5);
    await r.cmd({ type: "drive.pause", reason: "editor" });
    await waitFor(() => of(r.events, "drive.paused").length > 0);
    await r.cmd({ type: "drive.resume" });
    expect(await within(run, 8000)).toBe("finished");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 1 });
    expect(r.engine.calls[5].prompt).toMatch(/paused/i);
    expect(of(r.events, "protocol.error").map((e) => e.reason)).toEqual([]);
  }, 20_000);
});

describe("files changed in a fix round that was stopped (A4)", () => {
  test("the receipt lists them, so it says what Undo will change", async () => {
    const r = setup([[write("a.txt", "1")], [write("b.txt", "fix"), say("still going", 600_000)]], [bad("boom")]);
    const run = r.runner.handle({ v: 1, id: "c", type: "agent.start", project: r.project, agent: "a", mode: "drive", prompt: "do it", model: "m", budgetUsd: 5 });
    await waitFor(() => r.engine.calls.length >= 2 && existsSync(join(r.project, "b.txt")));
    await Bun.sleep(100);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "a" });
    await run;
    const receipt = of(r.events, "receipt")[0];
    expect(receipt.changed.map((c: any) => c.file).sort()).toEqual(["a.txt", "b.txt"]);
    expect(r.log.list()[0].changed).toBe(2);
  });
});

describe("Stop or a pause while the after state is saved (A5)", () => {
  const slowAfter = (onAfter: () => Promise<void>) => {
    const real = CheckpointStore.prototype.snapshot;
    let fired = false;
    CheckpointStore.prototype.snapshot = async function (this: CheckpointStore, label: string) {
      if (!fired && label.startsWith("After:")) { fired = true; await onAfter(); }
      return real.call(this, label);
    };
    return () => { CheckpointStore.prototype.snapshot = real; };
  };
  test("Stop then ends the task as stopped, never as done with no check", async () => {
    const r = setup([[write("a.txt", "1")]]);
    const undo = slowAfter(() => r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "a" }));
    try { await r.runner.handle({ v: 1, id: "c", type: "agent.start", project: r.project, agent: "a", mode: "drive", prompt: "do it", model: "m", budgetUsd: 5 }); }
    finally { undo(); }
    expect(r.checks()).toBe(0);
    expect(r.log.list()[0].status).toBe("interrupted");
    expect(of(r.events, "agent.state").at(-1).state).toBe("idle");
  });
  test("a pause then re-runs the step after Carry on, and checks it", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("a.txt", "1 again")], [write("b.txt", "2")]]);
    let resumed = false;
    const undo = slowAfter(async () => { await r.cmd({ type: "drive.pause", reason: "editor" }); });
    try {
      const run = r.drive(["One", "Two"]);
      await waitFor(() => of(r.events, "drive.paused").length > 0);
      await r.cmd({ type: "drive.resume" }); resumed = true;
      expect(await within(run, 8000)).toBe("finished");
    } finally { undo(); }
    expect(resumed).toBe(true);
    expect(r.engine.calls[2].prompt).toMatch(/paused/i);
    // Each step's work was checked: step one after it carried on, and step two.
    expect(r.checks()).toBe(2);
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2 });
  }, 20_000);
});

describe("an approval card open when the plan pauses (A6)", () => {
  test("the card is settled as cancelled at once, and the action never runs", async () => {
    const r = setup([[plan("One")], [{ tool: { name: "Read", input: { file_path: "/etc/hosts" } }, costUsd: 0.01 }, write("a.txt", "after")], [write("a.txt", "carried on")]]);
    const run = r.drive(["One"]);
    await waitFor(() => of(r.events, "approval.request").length > 0);
    const ap = of(r.events, "approval.request")[0].approval;
    await r.cmd({ type: "drive.pause", reason: "editor" });
    await waitFor(() => of(r.events, "approval.resolved").length > 0, 2000);
    expect(of(r.events, "approval.resolved")[0]).toMatchObject({ approval: ap, outcome: "cancelled" });
    // A late Allow changes nothing: the card is gone, so it is not an approval any more.
    await r.runner.handle({ v: 1, id: "y", type: "approval.resolve", approval: ap, decision: "allow" } as never);
    expect(of(r.events, "agent.tool").filter((t) => t.tool === "Read" && t.outcome === "ran")).toEqual([]);
    await r.cmd({ type: "drive.resume" });
    expect(await within(run, 8000)).toBe("finished");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done" });
  }, 20_000);
});
