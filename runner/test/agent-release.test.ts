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

function setup(rounds: Step[][], ladder: (signal?: AbortSignal) => Promise<LadderResult> = async () => failing, fake = false) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>site</h1>");
  const events: Event[] = [];
  const ran: string[] = [];
  // fake: a command the test allows is only written down, never really run on the Mac.
  const executor = async (call: { input: unknown }) => { ran.push(JSON.stringify(call.input)); return { ok: true, output: "" }; };
  const engine = new ScriptedEngine(rounds);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async (c) => ladder(c.signal), ...(fake ? { executor: executor as never } : {}) });
  const cmd = (o: Record<string, unknown>) => runner.handle({ v: 1, id: `c${Math.random()}`, ...o } as never);
  return { project, events, runner, cmd, ran, engine };
}
const waitFor = async (fn: () => boolean, ms = 5000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };
const write = (f: string, c: string, delayMs?: number): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01, ...(delayMs ? { delayMs } : {}) });
const passing: LadderResult = { verdict: "passed", steps: [] };
const browserBad = (): LadderResult => { const st = { rung: "browser", label: "Opening it in a browser", status: "failed", detail: "The page threw: x is not defined", ms: 1 } as never; return { verdict: "failed", steps: [st], failedAt: st }; };

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
  // Found in review of the M11 audit fixes: the page may ask for a release while something still runs (an approval answered
  // on the card is gone from the page before the engine says the agent works again). The engine must change nothing then.
  test("a release while a task waits on an approval changes nothing: the question is still there and still answerable", async () => {
    const s = setup([[{ tool: { name: "Bash", input: { command: "git push origin main" } }, costUsd: 0.01 }, { text: "pushed", costUsd: 0 }]], async () => passing, true);
    const task = s.cmd({ type: "agent.start", project: s.project, agent: "a1", mode: "drive", prompt: "Push it", model: "m", budgetUsd: 3 });
    await waitFor(() => of(s.events, "approval.request").length > 0);
    expect(states(s.events).at(-1)).toBe("needsYou");
    const before = s.events.length;
    await s.cmd({ type: "agent.interrupt", agent: "a1", release: true });
    expect(s.events.length).toBe(before);
    expect(states(s.events).at(-1)).toBe("needsYou");
    const ask = of(s.events, "approval.request")[0];
    await s.cmd({ type: "approval.resolve", approval: ask.approval, decision: "allow", scope: "once" });
    await task;
    expect(of(s.events, "approval.resolved")[0].outcome).toBe("allowed");
    expect(s.ran).toEqual([JSON.stringify({ command: "git push origin main" })]);
    expect(of(s.events, "receipt")).toHaveLength(1);
  });
  test("a release while a Drive plan is paused changes nothing: it still waits, and carries on when resumed", async () => {
    const s = setup([[plan("One")], [write("a.txt", "agent", 600_000)], [write("a.txt", "agent")]], async () => passing);
    await Bun.sleep(100);
    await s.cmd({ type: "drive.plan", project: s.project, agent: "a1", goal: "g", model: "m", budgetUsd: 5 });
    const drive = s.cmd({ type: "drive.approve", agent: "a1", steps: ["One"] });
    await waitFor(() => s.engine.calls.length >= 2, 10_000);   // the step's own round has started: the agent is thinking
    await s.cmd({ type: "drive.pause", agent: "a1", reason: "editor" });
    // The step winds down (idle), then the plan waits at the pause (needs you).
    await waitFor(() => states(s.events).slice(-2).join() === "idle,needsYou");
    const told = states(s.events).length;
    await s.cmd({ type: "agent.interrupt", agent: "a1", release: true });
    await Bun.sleep(50);
    expect(states(s.events).length).toBe(told);
    await s.cmd({ type: "drive.resume", agent: "a1" });
    await drive;
    expect(of(s.events, "protocol.error")).toEqual([]);
    expect(of(s.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 1, total: 1 });
  }, 30_000);
  test("a release while the loop card waits for an answer changes nothing: it still waits, and its answer still counts", async () => {
    const s = setup([[write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "4")]], async () => browserBad());
    writeFileSync(join(s.project, "a.txt"), "original");
    const task = s.cmd({ type: "agent.start", project: s.project, agent: "a1", mode: "drive", prompt: "Fix the signup page", model: "m", budgetUsd: 3 });
    await waitFor(() => of(s.events, "loop.stuck").length > 0);
    expect(states(s.events).at(-1)).toBe("needsYou");
    const before = s.events.length;
    await s.cmd({ type: "agent.interrupt", agent: "a1", release: true });
    expect(s.events.length).toBe(before);
    await s.cmd({ type: "loop.choose", agent: "a1", choice: "stop" });
    await task;
    expect(of(s.events, "protocol.error")).toEqual([]);
    expect(of(s.events, "receipt")).toHaveLength(1);
    expect(of(s.events, "receipt")[0].proof).toBe("failed");
  });
  test("the command is the page's own Stop with one more word, which the protocol takes only as true or false", () => {
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "agent.interrupt", agent: "a1", release: true })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "agent.interrupt", agent: "a1", release: "yes" })).ok).toBe(false);
  });
});
