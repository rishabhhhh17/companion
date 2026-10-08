// The fix loop breaker: the same failure three times in a row stops the plan and asks you what to do.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { failureSignature } from "../src/drive.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-st-${l}-`))); made.push(d); return d; };
const say = (text: string): Step => ({ text, costUsd: 0.01 });
const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
const plan = (...steps: string[]) => say("```json\n" + JSON.stringify(steps) + "\n```");
const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (detail: string): LadderResult => { const s = { rung: "browser", label: "Opening it in a browser", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };

function setup(rounds: Step[][], proofs: LadderResult[]) {
  const project = tmp("p");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
  const start = async (steps: string[]) => {
    await runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "d1", goal: "g", model: "m", budgetUsd: 5 });
    return runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "d1", steps });
  };
  const choose = (choice: string) => runner.handle({ v: 1, id: "c", type: "loop.choose", agent: "d1", choice } as never);
  return { project, events, engine, runner, start, choose };
}
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean) => { for (let i = 0; i < 500 && !fn(); i++) await Bun.sleep(10); };

describe("what counts as the same failure", () => {
  const f = (detail: string) => ({ rung: "browser", detail });
  test("the same words are the same", () => expect(failureSignature(f("The page threw: x is not defined"))).toBe(failureSignature(f("The page threw: x is not defined"))));
  test("numbers like ports, times and line numbers are ignored", () => expect(failureSignature(f("Error at line 12 on port 51234 after 840 ms"))).toBe(failureSignature(f("Error at line 40 on port 60001 after 77 ms"))));
  test("a different error is different", () => expect(failureSignature(f("x is not defined"))).not.toBe(failureSignature(f("y is not defined"))));
  test("a different check is different", () => expect(failureSignature({ rung: "tests", detail: "boom" })).not.toBe(failureSignature({ rung: "checks", detail: "boom" })));
});

describe("three identical failures stop the plan and ask", () => {
  const same = bad("x is not defined");
  test("a card with the evidence and options appears, and the plan waits", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("b.txt", "never")]], [same]);
    const run = r.start(["One", "Two"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    const card = of(r.events, "loop.stuck")[0];
    expect(card).toMatchObject({ agent: "d1", index: 1, title: "One" });
    expect(card.failure.detail).toContain("x is not defined");
    expect(card.options.map((o: any) => o.id)).toEqual(["different", "stop"]);
    expect(of(r.events, "drive.done").length).toBe(0);
    await r.choose("stop");
    await run;
  });
  test("choosing a different approach re-runs the step with the history, and the plan carries on", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "fixed")], [write("b.txt", "two")]], [same, same, same, ok()]);
    const run = r.start(["One", "Two"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("different");
    await run;
    const prompt = r.engine.calls[4].prompt;
    expect(prompt).toMatch(/different approach/i);
    expect(prompt).toContain("x is not defined");
    expect(existsSync(join(r.project, "b.txt"))).toBe(true);
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2, total: 2 });
  });
  test("choosing stop ends the plan with what was done", async () => {
    const r = setup([[plan("One", "Two")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [same]);
    const run = r.start(["One", "Two"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("stop");
    await run;
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "not_done", completed: 0, total: 2 });
    expect(existsSync(join(r.project, "b.txt"))).toBe(false);
  });
  test("it is offered once per step: if the new approach also fails three times, the plan ends", async () => {
    const r = setup([[plan("One")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "4")], [write("a.txt", "5")], [write("a.txt", "6")]], [same]);
    const run = r.start(["One"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("different");
    await run;
    expect(of(r.events, "loop.stuck").length).toBe(1);
    expect(of(r.events, "drive.done")[0].status).toBe("not_done");
  });
  test("the stop key while the card is waiting ends the plan", async () => {
    const r = setup([[plan("One")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [same]);
    const run = r.start(["One"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(of(r.events, "drive.done")[0].status).toBe("interrupted");
  });
});

describe("it does not cry wolf", () => {
  test("three different failures are not the same failure", async () => {
    const r = setup([[plan("One")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [bad("first problem"), bad("second problem"), bad("third problem")]);
    await r.start(["One"]);
    expect(of(r.events, "loop.stuck").length).toBe(0);
    expect(of(r.events, "drive.done")[0].status).toBe("not_done");
  });
  test("two identical failures then a fix is just a fix", async () => {
    const r = setup([[plan("One")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")]], [bad("x"), bad("x"), ok()]);
    await r.start(["One"]);
    expect(of(r.events, "loop.stuck").length).toBe(0);
    expect(of(r.events, "drive.done")[0].status).toBe("done");
  });
  test("a choice with nothing waiting is refused plainly", async () => {
    const r = setup([[plan("One")]], [ok()]);
    await r.choose("different");
    expect(of(r.events, "protocol.error")[0].reason).toMatch(/nothing is waiting/i);
  });
});
