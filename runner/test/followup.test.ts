// "Fixes it with you": a follow up (agent.send) carries on the agent's last task as a new checked turn, and Try again
// re-runs the same request with what failed. Each one is a task of its own: a snapshot first, the same safety rules, the
// proof ladder, a receipt, cost booked to the day, and the daily limit.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { Ledger } from "../src/ledger.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-fu-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string, costUsd = 0.01): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd });
const say = (text: string, sessionId?: string): Step => ({ text, costUsd: 0, ...(sessionId ? { sessionId } : {}) });
const good = (): LadderResult => ({ verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "passed", detail: "", ms: 1 } as never] });
const bad = (detail: string): LadderResult => { const s = { rung: "tests", label: "Running the tests", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const states = (e: Event[]) => of(e, "agent.state").map((x) => x.state);
const waitFor = async (fn: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error("timed out waiting"); await Bun.sleep(10); } };

// empty: no file in the project to begin with. A Drive plan watches the folder for the person's own changes, and a file
// written just before it starts can be reported late as one.
function setup(rounds: Step[][], proofs: LadderResult[] = [good()], o: { ceiling?: number; empty?: boolean } = {}) {
  const project = tmp("p");
  if (!o.empty) writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  const ledger = new Ledger(":memory:");
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, ledger, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)], ...(o.ceiling !== undefined ? { dailyCeilingUsd: o.ceiling } : {}) });
  const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Add a signup button", model: "m", budgetUsd: 3, ...extra } as never);
  const send = (extra: Record<string, unknown>) => runner.handle({ v: 1, id: "c2", type: "agent.send", agent: "builder-1", project, ...extra } as never);
  // A Drive plan for the same agent: the planning round, then the approved steps.
  const drive = async (steps: string[], extra: Record<string, unknown> = {}) => {
    await runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "builder-1", goal: "Build a signup page", model: "m", budgetUsd: 5, ...extra } as never);
    return runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "builder-1", steps } as never);
  };
  const undo = (checkpoint: string) => runner.handle({ v: 1, id: "u1", type: "checkpoint.restore", project, checkpoint } as never);
  return { project, events, engine, log, ledger, runner, start, send, drive, undo, ladderRuns: () => n };
}
const plan = (...steps: string[]): Step => ({ text: "```json\n" + JSON.stringify(steps) + "\n```", costUsd: 0.01 });

describe("a follow up carries on the last task", () => {
  test("it resumes the same conversation as a new checked turn, with its own snapshot, check and receipt", async () => {
    const r = setup([[write("a.txt", "v1"), say("Added it", "sess-task-1")], [write("a.txt", "v2"), say("Made it blue", "sess-task-1")]]);
    await r.start();
    await r.send({ text: "the button is still grey" });
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].resumeSession).toBe("sess-task-1");
    expect(r.engine.calls[1].prompt).toContain("the button is still grey");
    const cps = of(r.events, "checkpoint.created");
    expect(cps.length).toBe(2);
    expect(cps[1].checkpoint).not.toBe(cps[0].checkpoint);
    expect(cps[1].label).toMatch(/follow up/i);
    const receipts = of(r.events, "receipt");
    expect(receipts.length).toBe(2);
    expect(receipts[1].checkpoint).toBe(cps[1].checkpoint);
    expect(receipts[1].changed.map((c: any) => c.file)).toEqual(["a.txt"]);   // only what the follow up changed
    expect(receipts[1].proof).toBe("passed");
    expect(r.ladderRuns()).toBe(2);
    expect(r.log.list().length).toBe(2);
    expect(r.log.list()[0].label).toMatch(/^Follow up: the button is still grey/);
    expect(states(r.events).at(-1)).toBe("done");
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("v2");
  });

  test("a second follow up carries on from the first follow up's conversation", async () => {
    const r = setup([[write("a.txt", "v1"), say("ok", "sess-1")], [write("a.txt", "v2"), say("ok", "sess-2")], [write("a.txt", "v3")]]);
    await r.start();
    await r.send({ text: "make it bigger" });
    await r.send({ text: "and round the corners" });
    expect(r.engine.calls[2].resumeSession).toBe("sess-2");
    expect(of(r.events, "receipt").length).toBe(3);
  });

  test("a failed check in a follow up goes back to Claude like any task", async () => {
    const r = setup([[write("a.txt", "v1"), say("ok", "sess-1")], [write("a.txt", "v2")], [write("a.txt", "v3")]], [good(), bad("expected blue, got grey"), good()]);
    await r.start();
    await r.send({ text: "make it blue" });
    expect(r.engine.calls.length).toBe(3);
    expect(r.engine.calls[2].prompt).toContain("expected blue, got grey");
    expect(of(r.events, "receipt").at(-1).proof).toBe("passed");
  });

  test("the same safety rules apply: a write outside the project is blocked", async () => {
    const r = setup([[write("a.txt", "v1")], [write("../escape.txt", "x")]]);
    await r.start();
    await r.send({ text: "also save a copy next to the project" });
    expect(existsSync(join(r.project, "..", "escape.txt"))).toBe(false);
    expect(of(r.events, "agent.tool").some((t) => t.outcome === "blocked")).toBe(true);
  });

  test("its cost is booked to the day, and the daily limit holds for it", async () => {
    const r = setup([[write("a.txt", "v1", 0.04)], [write("a.txt", "v2", 0.02)]], [good()], { ceiling: 0.05 });
    await r.start();
    await r.send({ text: "one more thing" });
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.06, 5);
    // The day's limit is now used up: the next follow up is refused before anything runs.
    await r.send({ text: "and another" });
    expect(r.engine.calls.length).toBe(2);
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/daily_limit/);
  });

  test("off the record, a follow up starts afresh and is told the request again", async () => {
    const r = setup([[write("a.txt", "v1"), say("ok", "sess-1")], [write("a.txt", "v2")]]);
    await r.start({ offTheRecord: true, prompt: "Add a pricing page" });
    await r.send({ text: "make the price bold" });
    const c = r.engine.calls[1];
    expect(c.resumeSession).toBeUndefined();
    expect(c.offTheRecord).toBe(true);
    expect(c.prompt).toContain("Add a pricing page");
    expect(c.prompt).toContain("make the price bold");
    expect(r.log.list()[0].label).toBe("Off the record task");
    expect(of(r.events, "receipt").length).toBe(2);
  });
});

describe("a follow up is refused plainly when it cannot run", () => {
  test("while the agent is still working", async () => {
    const r = setup([[write("a.txt", "v1"), { ...write("b.txt", "late"), delayMs: 300 }], [write("a.txt", "never")]]);
    const running = r.start();
    await waitFor(() => of(r.events, "cost.update").length > 0);
    await r.send({ text: "change of plan" });
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/already working/i);
    await running;
    expect(r.engine.calls.length).toBe(1);
  });

  test("while something else is working on the project", async () => {
    const r = setup([[write("a.txt", "v1")], [write("b.txt", "other"), { ...write("c.txt", "late"), delayMs: 300 }], [write("a.txt", "never")]]);
    await r.start();
    const other = r.runner.handle({ v: 1, id: "o1", type: "agent.start", project: r.project, agent: "someone-else", mode: "drive", prompt: "Other work", model: "m", budgetUsd: 3 } as never);
    await waitFor(() => r.engine.calls.length === 2 && of(r.events, "cost.update").length > 1);
    await r.send({ text: "the button is still grey" });
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/something else is already working on this project/i);
    await other;
    expect(r.engine.calls.length).toBe(2);
  });

  test("when there is no finished task to follow up on", async () => {
    const r = setup([[write("a.txt", "never")]]);
    await r.send({ text: "the button is still grey" });
    expect(of(r.events, "protocol.error")[0].reason).toMatch(/no finished task/i);
    expect(r.engine.calls.length).toBe(0);
  });

  test("when it names a different project from the last task", async () => {
    const r = setup([[write("a.txt", "v1")], [write("a.txt", "never")]]);
    await r.start();
    const elsewhere = tmp("other");
    await r.runner.handle({ v: 1, id: "c3", type: "agent.send", agent: "builder-1", project: elsewhere, text: "fix it" } as never);
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/another project/i);
    expect(r.engine.calls.length).toBe(1);
  });

  test("when it says nothing", async () => {
    const r = setup([[write("a.txt", "v1")], [write("a.txt", "never")]]);
    await r.start();
    await r.send({ text: "   " });
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/what is still wrong/i);
    expect(r.engine.calls.length).toBe(1);
  });
});

describe("Stop ends a follow up", () => {
  test("Stop ends it with a receipt, and the agent can be followed up again", async () => {
    const r = setup([[write("a.txt", "v1"), say("ok", "sess-1")], [write("one.txt", "1"), { ...write("two.txt", "2"), delayMs: 400 }], [write("a.txt", "v3")]]);
    await r.start();
    const fu = r.send({ text: "add two files" });
    await waitFor(() => existsSync(join(r.project, "one.txt")));
    await r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "builder-1" });
    await fu;
    expect(existsSync(join(r.project, "two.txt"))).toBe(false);
    expect(r.log.list()[0].status).toBe("interrupted");
    expect(of(r.events, "receipt").length).toBe(2);
    expect(states(r.events).at(-1)).toBe("idle");
    await r.send({ text: "carry on" });
    expect(r.engine.calls.length).toBe(3);
  });

  test("Stop everything ends it too", async () => {
    const r = setup([[write("a.txt", "v1")], [write("one.txt", "1"), { ...write("two.txt", "2"), delayMs: 400 }]]);
    await r.start();
    const fu = r.send({ text: "add two files" });
    await waitFor(() => existsSync(join(r.project, "one.txt")));
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await fu;
    expect(existsSync(join(r.project, "two.txt"))).toBe(false);
    expect(r.log.list()[0].status).toBe("interrupted");
  });
});

describe("after a Drive plan", () => {
  const same = bad("x is not defined");
  for (const how of ["agent.interrupt", "agent.interruptAll"] as const) {
    test(`Stop on a plan's loop card (${how}) leaves the agent free for a follow up`, async () => {
      const r = setup([[plan("One")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "fixed")]], [same, same, same, good()], { empty: true });
      const running = r.drive(["One"]);
      await waitFor(() => of(r.events, "loop.stuck").length > 0);
      await r.runner.handle((how === "agent.interrupt" ? { v: 1, id: "k", type: how, agent: "builder-1" } : { v: 1, id: "k", type: how, reason: "kill switch" }) as never);
      await running;
      expect(of(r.events, "drive.done")[0].status).toBe("interrupted");
      const before = of(r.events, "protocol.error").length;
      await r.send({ text: "the button is still grey" });
      expect(of(r.events, "protocol.error").slice(before)).toEqual([]);
      expect(r.engine.calls.length).toBe(5);
      expect(of(r.events, "receipt").at(-1).proof).toBe("passed");
    });
  }

  test("a follow up gets the plan's whole budget and a plain label, not the last step's leftovers", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1", 2)], [write("a.txt", "2", 2.5)], [write("a.txt", "3")]], [good()], { empty: true });
    await r.drive(["One", "Two"]);
    expect(of(r.events, "drive.done")[0].status).toBe("done");
    await r.send({ text: "make the button blue" });
    expect(r.engine.calls[3].budgetUsd).toBeCloseTo(5, 5);
    expect(r.log.list()[0].label).toBe("Follow up: make the button blue");
  });

  test("Try again after a plan's failed step names the step, never the step's instructions", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "fixed")]], [bad("first"), bad("second"), bad("third"), good()], { empty: true });
    await r.drive(["One", "Two"]);
    expect(of(r.events, "drive.done")[0].status).toBe("not_done");
    await r.send({ retry: true });
    const c = r.engine.calls[4];
    expect(c.budgetUsd).toBeCloseTo(5, 5);
    expect(c.prompt).toContain("Please try this again: One");
    expect(c.prompt).not.toMatch(/Step 1 of|Do only this step/);
    expect(r.log.list()[0].label).toBe("Try again: One");
  });

  test("off the record, a follow up after a plan is told the plan's goal, not a step's instructions", async () => {
    const r = setup([[plan("One")], [write("a.txt", "1")], [write("a.txt", "2")]], [good()], { empty: true });
    await r.drive(["One"], { offTheRecord: true });
    await r.send({ text: "make the button blue" });
    const c = r.engine.calls[2];
    expect(c.resumeSession).toBeUndefined();
    expect(c.prompt).toContain("Build a signup page");
    expect(c.prompt).not.toMatch(/Step 1 of|Do only this step|one step of a bigger goal/);
  });
});

describe("after Undo", () => {
  test("a follow up on the task that was undone is refused, and nothing runs", async () => {
    const r = setup([[write("a.txt", "v1"), say("ok", "sess-1")], [write("a.txt", "never")]]);
    await r.start();
    await r.undo(of(r.events, "checkpoint.created")[0].checkpoint);
    expect(of(r.events, "checkpoint.restored").length).toBe(1);
    await r.send({ text: "the button is still grey" });
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/undone/i);
    await r.send({ retry: true });
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/undone/i);
    expect(r.engine.calls.length).toBe(1);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("original");
  });
  test("a new task after Undo can be followed up as usual", async () => {
    const r = setup([[write("a.txt", "v1")], [write("a.txt", "v2")], [write("a.txt", "v3")]]);
    await r.start();
    await r.undo(of(r.events, "checkpoint.created")[0].checkpoint);
    await r.start({ prompt: "Add a pricing page" });
    await r.send({ text: "make the price bold" });
    expect(r.engine.calls.length).toBe(3);
  });
});

describe("Try again", () => {
  const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
  test("re-runs the same request with the last failure as evidence, redacted and clipped, as a new checked turn", async () => {
    const long = `TypeError: signup is not defined (key ${secret}) ${"x".repeat(5000)}`;
    // The task's fix changes nothing, so it ends Not done with the failure on record.
    const r = setup([[write("a.txt", "v1"), say("ok", "sess-1")], [say("I could not fix it"), say("", "sess-2")], [write("a.txt", "fixed")]], [bad(long), good()]);
    await r.start();
    expect(r.log.list()[0].status).toBe("not_done");
    await r.send({ retry: true });
    const c = r.engine.calls[2];
    expect(c.resumeSession).toBe("sess-2");   // the conversation as it was at the end of the task
    expect(c.prompt).toContain("Add a signup button");
    expect(c.prompt).toContain("Running the tests");
    expect(c.prompt).toContain("signup is not defined");
    expect(c.prompt).not.toContain(secret);
    expect(c.prompt.length).toBeLessThan(3000);
    expect(of(r.events, "checkpoint.created").length).toBe(2);
    expect(of(r.events, "receipt").at(-1).proof).toBe("passed");
    expect(r.log.list()[0].label).toMatch(/^Try again: Add a signup button/);
  });

  test("off the record, Try again starts afresh with the request and the failure", async () => {
    const r = setup([[write("a.txt", "v1"), say("ok", "sess-1")], [say("no change")], [write("a.txt", "fixed")]], [bad("expected 2, got 3"), good()]);
    await r.start({ offTheRecord: true, prompt: "Fix the total" });
    await r.send({ retry: true });
    const c = r.engine.calls[2];
    expect(c.resumeSession).toBeUndefined();
    expect(c.offTheRecord).toBe(true);
    expect(c.prompt).toContain("Fix the total");
    expect(c.prompt).toContain("expected 2, got 3");
  });

  test("after the spending limit, it re-runs the request and says how the last attempt really ended", async () => {
    const r = setup([[write("a.txt", "v1", 0.5)], [write("a.txt", "v2")]]);
    await r.start({ budgetUsd: 0.2 });
    expect(r.log.list()[0].status).toBe("error_max_budget_usd");
    await r.send({ retry: true });
    const p = r.engine.calls[1].prompt;
    expect(p).toContain("Add a signup button");
    expect(p).not.toMatch(/failed check/i);
    expect(p).not.toMatch(/did not pass the checks/i);
    expect(p).toMatch(/spending limit/i);
  });

  test("after an engine error, it says the last attempt stopped with an error, not that checks failed", async () => {
    class Breaks extends ScriptedEngine {
      override async *start(o: Parameters<ScriptedEngine["start"]>[0]) { if (this.calls.length === 0) { this.calls.push(o); throw new Error("connection reset"); } yield* super.start(o); }
    }
    const project = tmp("p");
    writeFileSync(join(project, "a.txt"), "original");
    const events: Event[] = [];
    const engine = new Breaks([[], [write("a.txt", "v2")]]);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => good() });
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Add a signup button", model: "m", budgetUsd: 3 } as never);
    expect(states(events).at(-1)).toBe("error");
    await runner.handle({ v: 1, id: "c2", type: "agent.send", agent: "builder-1", project, retry: true } as never);
    const p = engine.calls[1].prompt;
    expect(p).toContain("Add a signup button");
    expect(p).not.toMatch(/did not pass the checks/i);
    expect(p).toMatch(/error/i);
  });

  test("is refused while the agent is working", async () => {
    const r = setup([[write("a.txt", "v1"), { ...write("b.txt", "late"), delayMs: 300 }]]);
    const running = r.start();
    await waitFor(() => of(r.events, "cost.update").length > 0);
    await r.send({ retry: true });
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/already working/i);
    await running;
    expect(r.engine.calls.length).toBe(1);
  });
});
