// When a check fails, the evidence goes back to Claude in the same conversation, twice at most.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-rt-${l}-`))); made.push(d); return d; };
const bash = (command: string, costUsd = 0.01): Step => ({ tool: { name: "Bash", input: { command } }, costUsd });
const start = (project: string, budgetUsd = 3) => ({ v: 1 as const, id: "c1", type: "agent.start" as const, project, agent: "a1", mode: "drive" as const, prompt: "make it", model: "m", budgetUsd });
const states = (e: Event[]) => e.filter((x) => x.type === "agent.state").map((x: any) => x.state);
const bad = (detail: string): LadderResult => { const s = { rung: "browser", label: "Opening it in a browser", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const good = (): LadderResult => ({ verdict: "passed", steps: [{ rung: "browser", label: "Opening it in a browser", status: "passed", detail: "", ms: 1 } as never] });

function setup(rounds: Step[][], results: LadderResult[]) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  let i = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), proof: async () => results[Math.min(i++, results.length - 1)] });
  return { project, events, engine, log, runner, ladderRuns: () => i };
}
const results = (e: Event[]) => e.filter((x) => x.type === "proof.result") as any[];
const receipt = (e: Event[]) => e.find((x) => x.type === "receipt") as any;

describe("the fix loop", () => {
  test("a failure goes back to Claude with the evidence, the fix passes, and the task is done", async () => {
    const r = setup([[bash("echo 1 > x.txt")], [bash("echo 2 > x.txt")]], [bad("The page threw: ReferenceError: foo is not defined"), good()]);
    await r.runner.handle(start(r.project));
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].prompt).toContain("ReferenceError: foo is not defined");
    expect(r.engine.calls[1].prompt).toContain("Opening it in a browser");
    expect(states(r.events).at(-1)).toBe("done");
    expect(results(r.events).map((x) => [x.verdict, x.tries])).toEqual([["failed", 1], ["passed", 2]]);
    expect(receipt(r.events).proof).toBe("passed");
    expect(r.log.list()[0].status).toBe("done");
  });
  test("the follow up continues the same conversation", async () => {
    const r = setup([[bash("echo 1 > x.txt")], [bash("echo 2 > x.txt")]], [bad("boom"), good()]);
    await r.runner.handle(start(r.project));
    expect(r.engine.calls[0].resumeSession).toBeUndefined();
    expect(r.engine.calls[1].resumeSession).toBe("scripted-session");
  });
  test("two retries at most, then Not done with the last reason", async () => {
    // Three different failures: the same one three times stops and asks instead (task-stuck.test.ts).
    const r = setup([[bash("echo 1 > x.txt")], [bash("echo 2 > x.txt")], [bash("echo 3 > x.txt")], [bash("echo 4 > x.txt")]], [bad("still broken"), bad("broken another way"), bad("broken a third way")]);
    await r.runner.handle(start(r.project));
    expect(r.engine.calls.length).toBe(3);
    expect(r.ladderRuns()).toBe(3);
    expect(states(r.events)).not.toContain("done");
    expect(states(r.events).at(-1)).toBe("error");
    expect(r.log.list()[0].status).toBe("not_done");
    expect(receipt(r.events).proof).toBe("failed");
    expect(results(r.events).at(-1).tries).toBe(3);
  });
  test("the retries share the one spending limit, and run out of it", async () => {
    const r = setup([[bash("echo 1 > x.txt", 0.02)], [bash("echo 2 > x.txt", 0.02)]], [bad("broken")]);
    await r.runner.handle(start(r.project, 0.03));
    expect(r.log.list()[0].status).toBe("error_max_budget_usd");
    expect(states(r.events)).not.toContain("done");
    expect(receipt(r.events).usdEstimate).toBeLessThanOrEqual(0.05);
  });
  test("the receipt lists everything changed across all tries", async () => {
    const r = setup([[bash("echo 1 > one.txt")], [bash("echo 2 > two.txt")]], [bad("broken"), good()]);
    await r.runner.handle(start(r.project));
    const names = JSON.stringify(receipt(r.events).changed);
    expect(names).toContain("one.txt");
    expect(names).toContain("two.txt");
  });
  test("a follow up that changes nothing is not endlessly retried", async () => {
    const r = setup([[bash("echo 1 > x.txt")], [{ text: "I could not fix it", costUsd: 0.01 }]], [bad("broken")]);
    await r.runner.handle(start(r.project));
    expect(r.engine.calls.length).toBe(2);
    expect(r.ladderRuns()).toBe(1);
    expect(states(r.events).at(-1)).toBe("error");
    expect(r.log.list()[0].status).toBe("not_done");
  });
  test("a stop in the middle of a retry ends the task as stopped", async () => {
    const r = setup([[bash("echo 1 > x.txt")], [bash("echo 2 > x.txt", 0.01), { text: "later", costUsd: 0, delayMs: 5000 }]], [bad("broken"), good()]);
    const done = r.runner.handle(start(r.project));
    for (let i = 0; i < 300 && r.engine.calls.length < 2; i++) await Bun.sleep(10);
    await Bun.sleep(100);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await done;
    expect(r.log.list()[0].status).toBe("interrupted");
    expect(states(r.events)).not.toContain("done");
  });
});

describe("M123: a promise of the ask that is not there goes back to Claude like a failed check", () => {
  const WHY = ["", "the menu is empty", "a link goes to /about", "there is no menu"];
  const missing = (n = 0): LadderResult => ({ ...good(), promises: [
    { promise: { kind: "opens", path: "/pricing", say: "a pricing page opens at /pricing" }, result: "kept", why: "" },
    { promise: { kind: "links", path: "/", label: "pricing", to: "/pricing", say: "the menu links to /pricing" }, result: "not_kept", why: `Could not find a button or link called "pricing" on the page${n ? `: ${WHY[n]}` : ""}` },
  ] });
  const allKept = (): LadderResult => ({ ...good(), promises: [{ promise: { kind: "opens", path: "/pricing", say: "a pricing page opens at /pricing" }, result: "kept", why: "" }] });
  test("the missing promise is the evidence, the fix keeps it, the task is done and proven", async () => {
    const r = setup([[bash("echo 1 > x.txt")], [bash("echo 2 > x.txt")]], [missing(), allKept()]);
    await r.runner.handle(start(r.project));
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].prompt).toContain("the menu links to /pricing");
    expect(results(r.events).map((x) => x.verdict)).toEqual(["failed", "passed"]);
    expect(receipt(r.events).proof).toBe("passed");
    expect(receipt(r.events).promises).toEqual([{ say: "a pricing page opens at /pricing", result: "kept" }]);
  });
  test("still missing after the tries: not done, with the promise on the receipt", async () => {
    const r = setup([[bash("echo 1 > x.txt")], [bash("echo 2 > x.txt")], [bash("echo 3 > x.txt")]], [missing(1), missing(2), missing(3)]);
    await r.runner.handle(start(r.project));
    expect(receipt(r.events).proof).toBe("failed");
    expect(receipt(r.events).promises.find((p: any) => p.result === "not_kept").say).toBe("the menu links to /pricing");
    expect(r.log.list()[0].status).not.toBe("done");
  });
  test("could not check never sends Claude back to work", async () => {
    const r = setup([[bash("echo 1 > x.txt")]], [{ ...good(), promises: [{ promise: { kind: "opens", path: "/x", say: "/x opens" }, result: "could_not_check", why: "It asked for a sign in." }] }]);
    await r.runner.handle(start(r.project));
    expect(r.engine.calls.length).toBe(1);
    expect(receipt(r.events).proof).toBe("passed");
  });
});

test("M123: a practice's own fixed move never becomes promises", async () => {
  const project = tmp("pp"); writeFileSync(join(project, "a.txt"), "x");
  const seen: unknown[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("ps"), engine: new ScriptedEngine([[bash("echo 1 > x.txt")]]), log: new TaskLog(":memory:"), emit: () => {}, proof: async (o: any) => { seen.push(o.promises); return good(); } });
  await runner.handle({ ...start(project), prompt: "Fix the link to /about in the menu", practice: "route" } as never);
  expect(seen).toEqual([[]]);
});

describe("M124: a finished task hands its plain summary to the team sharer", () => {
  const make = (extra: Record<string, unknown> = {}) => {
    const project = tmp("tm"); writeFileSync(join(project, "a.txt"), "x");
    const shared: any[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("ts"), engine: new ScriptedEngine([[bash("echo 1 > x.txt")]]), log: new TaskLog(":memory:"), emit: () => {}, proof: async () => good(), teamShare: (s: unknown) => shared.push(s), ...extra } as never);
    return { project, shared, runner };
  };
  test("a done task: one summary, the project's name only", async () => {
    const r = make();
    await r.runner.handle({ ...start(r.project), prompt: "add a pricing page" } as never);
    expect(r.shared.length).toBe(1);
    expect(r.shared[0]).toMatchObject({ tool: "squibby", verdict: "works", lines: ["add a pricing page", "1 file changed"] });
    expect(r.shared[0].project).not.toContain("/");
  });
  test("off the record and practice runs are never shared", async () => {
    const a = make();
    await a.runner.handle({ ...start(a.project), offTheRecord: true } as never);
    const b = make();
    await b.runner.handle({ ...start(b.project), practice: "route" } as never);
    expect(a.shared.length + b.shared.length).toBe(0);
  });
});
