// How the agent runner uses the ladder: a task cannot end in "Done" unless the checks allow it.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-ap-${l}-`))); made.push(d); return d; };
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0.01 });
const start = (project: string) => ({ v: 1 as const, id: "c1", type: "agent.start" as const, project, agent: "a1", mode: "drive" as const, prompt: "make it", model: "m", budgetUsd: 3 });
const states = (e: Event[]) => e.filter((x) => x.type === "agent.state").map((x: any) => x.state);
const step = (rung: string, status: string, detail = "") => ({ rung, label: rung, status: status as "passed", detail, ms: 1 });

function setup(script: Step[], ladder: (ctx: any) => Promise<LadderResult>) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const log = new TaskLog(":memory:");
  const calls: any[] = [];
  const runner = new AgentRunner({
    shadowRoot: tmp("s"), engine: new ScriptedEngine(script), log, emit: (e) => events.push(e),
    proof: async (ctx) => { calls.push(ctx); return ladder(ctx); },
  });
  return { project, events, log, runner, calls };
}
const result = (verdict: LadderResult["verdict"], steps = [step("browser", "passed")]): LadderResult => ({ verdict, steps: steps as never, ...(verdict === "failed" ? { failedAt: steps.at(-1) as never } : {}) });
const proofResult = (events: Event[]) => events.find((e) => e.type === "proof.result") as any;
const receipt = (events: Event[]) => events.find((e) => e.type === "receipt") as any;

describe("checking before saying done", () => {
  test("a passing ladder: the character checks, then is done, and the receipt says proven", async () => {
    const r = setup([bash("echo hi > new.txt")], async (c) => { c.onStep(step("browser", "running")); c.onStep(step("browser", "passed")); return result("passed"); });
    await r.runner.handle(start(r.project));
    expect(states(r.events)).toEqual(expect.arrayContaining(["thinking", "working", "checking", "done"]));
    expect(states(r.events).indexOf("checking")).toBeLessThan(states(r.events).lastIndexOf("done"));
    expect(states(r.events).at(-1)).toBe("done");
    expect(proofResult(r.events).verdict).toBe("passed");
    expect(r.events.filter((e) => e.type === "proof.step").length).toBe(2);
    expect(receipt(r.events).proof).toBe("passed");
    expect(r.log.list()[0].status).toBe("done");
  });
  test("a failing ladder: never done, an error state, and the reason is on the receipt", async () => {
    const r = setup([bash("echo hi > new.txt")], async () => result("failed", [step("browser", "failed", "The page answered with an error (500).")]));
    await r.runner.handle(start(r.project));
    expect(states(r.events)).not.toContain("done");
    expect(states(r.events).at(-1)).toBe("error");
    expect(receipt(r.events).proof).toBe("failed");
    expect(proofResult(r.events).steps.at(-1).detail).toContain("500");
    expect(r.log.list()[0].status).toBe("not_done");
  });
  test("the ladder is told which project and which two snapshots to compare", async () => {
    const r = setup([bash("echo hi > new.txt")], async () => result("passed"));
    await r.runner.handle(start(r.project));
    expect(r.calls[0]).toMatchObject({ project: r.project });
    expect(r.calls[0].beforeId).toBe("cp_0001");
    expect(r.calls[0].afterId).toBe("cp_0002");
    expect(r.calls[0].store).toBeTruthy();
  });
  test("when nothing changed there is nothing to check, so the ladder is not run", async () => {
    const r = setup([{ text: "I looked and changed nothing", costUsd: 0.01 }], async () => result("passed"));
    await r.runner.handle(start(r.project));
    expect(r.calls.length).toBe(0);
    expect(receipt(r.events).proof).toBe("skipped");
    expect(states(r.events)).not.toContain("checking");
    expect(states(r.events).at(-1)).toBe("done");
  });
  test("passed with gaps is still done, and the gap is in the result", async () => {
    const r = setup([bash("echo hi > new.txt")], async () => result("passed_with_gaps", [step("browser", "skipped", "The hidden browser is not installed yet")]));
    await r.runner.handle(start(r.project));
    expect(states(r.events).at(-1)).toBe("done");
    expect(proofResult(r.events).verdict).toBe("passed_with_gaps");
    expect(receipt(r.events).proof).toBe("passed");
  });
  test("nothing to check is done but is not called proven", async () => {
    const r = setup([bash("echo hi > new.txt")], async () => result("nothing_to_check", []));
    await r.runner.handle(start(r.project));
    expect(states(r.events).at(-1)).toBe("done");
    expect(receipt(r.events).proof).toBe("skipped");
    expect(proofResult(r.events).verdict).toBe("nothing_to_check");
  });
  test("a ladder that crashes counts as a failure, never as done", async () => {
    const r = setup([bash("echo hi > new.txt")], async () => { throw new Error("boom in the checker"); });
    await r.runner.handle(start(r.project));
    expect(states(r.events)).not.toContain("done");
    expect(states(r.events).at(-1)).toBe("error");
    expect(proofResult(r.events).verdict).toBe("failed");
    expect(JSON.stringify(proofResult(r.events).steps)).toContain("boom in the checker");
  });
  test("the kill switch during the checks cancels them and ends the task as stopped", async () => {
    let seen: AbortSignal | undefined;
    const r = setup([bash("echo hi > new.txt")], async (c) => { seen = c.signal; await new Promise<void>((res) => c.signal.addEventListener("abort", () => res(), { once: true })); return result("cancelled", []); });
    const done = r.runner.handle(start(r.project));
    for (let i = 0; i < 300 && !seen; i++) await Bun.sleep(10);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await done;
    expect(r.log.list()[0].status).toBe("interrupted");
    expect(states(r.events)).not.toContain("done");
  });
  test("an interrupted or over budget task is not checked at all", async () => {
    const r = setup([bash("echo hi > new.txt"), bash("echo more")], async () => result("passed"));
    await r.runner.handle({ ...start(r.project), budgetUsd: 0.015 });
    expect(r.calls.length).toBe(0);
    expect(r.log.list()[0].status).toBe("error_max_budget_usd");
  });
});
