// When the person puts aside what an agent was waiting on them for (Cancel on a plan, Close on Rescue's report, on Point at
// the problem's answer, on which task broke it, or on a turn whose check failed), nothing runs for that agent any more, yet
// the engine had left it on "needs you". Found in the M11 audit (A53, A56, A60): every window but Home kept showing Needs
// you for good, and Stop, the only button left on Home, did nothing, because agent.interrupt sends no state when nothing
// runs. Now agent.interrupt with release: true puts the agent back to rest (and drops a plan still waiting for approval)
// only when nothing runs for it, and never stops anything; Stop with nothing running does the same, so it never does nothing.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { parseCommand, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-rel-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const states = (e: Event[]) => of(e, "agent.state").map((x) => x.state);
const place = { kind: "line", file: "src/App.tsx", line: 5, lineText: "const x = 1;", message: "Type error", from: "checks" } as const;
const failing: LadderResult = { verdict: "failed", steps: [{ rung: "checks", label: "Building and checking the code", status: "failed", detail: "tsc failed", ms: 1, problem: place }], failedAt: { rung: "checks", label: "Building and checking the code", status: "failed", detail: "tsc failed", ms: 1, problem: place } };
const plan = (...steps: string[]): Step => ({ text: "Here is the plan:\n```json\n" + JSON.stringify(steps) + "\n```", costUsd: 0.01 });

function setup(rounds: Step[][], ladder: (signal?: AbortSignal) => Promise<LadderResult> = async () => failing) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>site</h1>");
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async (c) => ladder(c.signal) });
  const cmd = (o: Record<string, unknown>) => runner.handle({ v: 1, id: `c${Math.random()}`, ...o } as never);
  return { project, events, runner, cmd };
}

describe("putting aside what an agent waits on the person for", () => {
  test("Cancel on a plan: the agent rests, and the plan is no longer waiting to be approved", async () => {
    const s = setup([[plan("Make the page", "Add a form")]]);
    await Bun.sleep(100);
    await s.cmd({ type: "drive.plan", project: s.project, agent: "a1", goal: "build a booking page", model: "m", budgetUsd: 5 });
    expect(states(s.events).at(-1)).toBe("needsYou");
    await s.cmd({ type: "agent.interrupt", agent: "a1", release: true });
    expect(states(s.events).at(-1)).toBe("idle");
    await s.cmd({ type: "drive.approve", agent: "a1", steps: ["Make the page"] });
    expect(of(s.events, "protocol.error").at(-1)?.reason).toBe("There is no plan waiting for approval.");
  });
  test("Close on Point at the problem's answer: the agent rests", async () => {
    const s = setup([]);
    await s.cmd({ type: "problem.find", project: s.project, agent: "a1" });
    expect(states(s.events)).toEqual(["checking", "needsYou"]);
    await s.cmd({ type: "agent.interrupt", agent: "a1", release: true });
    expect(states(s.events)).toEqual(["checking", "needsYou", "idle"]);
  });
  test("Stop with nothing running does the same, so it never does nothing", async () => {
    const s = setup([]);
    await s.cmd({ type: "problem.find", project: s.project, agent: "a1" });
    await s.cmd({ type: "agent.interrupt", agent: "a1" });
    expect(states(s.events).at(-1)).toBe("idle");
  });
  test("an agent that is not waiting on the person is told nothing new", async () => {
    const s = setup([]);
    await s.cmd({ type: "agent.interrupt", agent: "a1", release: true });
    await s.cmd({ type: "agent.interrupt", agent: "a1" });
    expect(of(s.events, "agent.state")).toEqual([]);
  });
  test("a release never stops anything: a check that is running goes on and still points at the problem", async () => {
    const s = setup([], async () => { await Bun.sleep(80); return failing; });
    const find = s.cmd({ type: "problem.find", project: s.project, agent: "a1" });
    await Bun.sleep(30);
    await s.cmd({ type: "agent.interrupt", agent: "a1", release: true });
    await find;
    expect(of(s.events, "problem.found")[0].verdict).toBe("failed");
    expect(states(s.events)).toEqual(["checking", "needsYou"]);
  });
  test("the command is the page's own Stop with one more word, which the protocol takes only as true or false", () => {
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "agent.interrupt", agent: "a1", release: true })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "agent.interrupt", agent: "a1", release: "yes" })).ok).toBe(false);
  });
});
