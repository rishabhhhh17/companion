// "Allow for the rest of this task": a yes that covers the exact same action again, only inside the same task and agent.
// Never across tasks, never for something Companion's own rules refuse, never for something that cannot be undone,
// and gone the moment Stop is pressed.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type ToolExecutor } from "../src/agent.ts";
import { ScriptedEngine, type Engine, type EngineOptions, type Step, type ToolResult, type Turn } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-scope-${l}-`))); made.push(d); return d; };
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0 });
const waitFor = async (cond: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 5)); } };
const start = (project: string, agent = "builder-1") => ({ v: 1 as const, id: `c-${agent}`, type: "agent.start" as const, project, agent, mode: "drive" as const, prompt: "Do it", model: "m", budgetUsd: 3 });
const requests = (events: Event[]) => events.filter((e) => e.type === "approval.request") as any[];

function setup(engine: Engine, executor?: ToolExecutor) {
  const project = tmp("proj");
  const events: Event[] = [];
  const ran: string[] = [];
  const exec: ToolExecutor = executor ?? (async (call) => { ran.push(String(call.input.command ?? call.input.file_path)); return { ok: true, output: "" }; });
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), executor: exec, proof: async () => ({ verdict: "passed", steps: [] }), approvalTimeoutMs: 2000 });
  return { project, events, ran, runner };
}
// Answers every approval card that shows up, with the given scope, the first `times` times.
async function answer(r: { events: Event[]; runner: AgentRunner }, n: number, decision: "allow" | "deny", scope: "once" | "task") {
  await waitFor(() => requests(r.events).length >= n);
  await r.runner.handle({ v: 1, id: `ans${n}`, type: "approval.resolve", approval: requests(r.events)[n - 1].approval, decision, scope });
}

describe("allow for the rest of this task", () => {
  test("the exact same action runs again without a second card", async () => {
    const r = setup(new ScriptedEngine([bash("git branch feature"), bash("git branch feature"), bash("git branch feature")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await done;
    expect(requests(r.events).length).toBe(1);
    expect(r.ran).toEqual(["git branch feature", "git branch feature", "git branch feature"]);
    const lines = r.events.filter((e) => e.type === "agent.tool").map((e: any) => e.outcome);
    expect(lines).toEqual(["needs_approval", "ran", "ran", "ran"]);
  });

  test("a different action still asks", async () => {
    const r = setup(new ScriptedEngine([bash("git branch one"), bash("git branch two")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await answer(r, 2, "allow", "once");
    await done;
    expect(requests(r.events).length).toBe(2);
    expect(r.ran).toEqual(["git branch one", "git branch two"]);
  });

  test("'once' still asks every time", async () => {
    const r = setup(new ScriptedEngine([bash("git branch feature"), bash("git branch feature")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "once");
    await answer(r, 2, "allow", "once");
    await done;
    expect(requests(r.events).length).toBe(2);
  });

  test("it works for an edit a house rule asks about, too", async () => {
    const r = setup(new ScriptedEngine([{ tool: { name: "Write", input: { file_path: "pricing.txt", content: "1" } }, costUsd: 0 }, { tool: { name: "Write", input: { file_path: "pricing.txt", content: "1" } }, costUsd: 0 }]));
    mkdirSync(join(r.project, ".companion"));
    writeFileSync(join(r.project, ".companion/rules.txt"), "ask before editing pricing.txt");
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await done;
    expect(requests(r.events).length).toBe(1);
    expect(r.ran).toEqual(["pricing.txt", "pricing.txt"]);
  });

  test("never across tasks: the next task asks again", async () => {
    const r = setup(new ScriptedEngine([[bash("git branch feature")], [bash("git branch feature")]]));
    const first = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await first;
    const second = r.runner.handle(start(r.project));
    await answer(r, 2, "allow", "once");
    await second;
    expect(requests(r.events).length).toBe(2);
  });

  test("never across agents: another agent's task asks for itself", async () => {
    // The same script for every task, so the two agents can run side by side.
    const same: Engine = { async *start(_o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> { yield bash("git branch feature"); yield bash("git branch feature"); } };
    const r = setup(same);
    const other = tmp("other");
    const a = r.runner.handle(start(r.project, "builder-1"));
    await answer(r, 1, "allow", "task");
    await a;
    const b = r.runner.handle(start(other, "builder-2"));
    await answer(r, 2, "allow", "once");
    await answer(r, 3, "allow", "once");
    await b;
    expect(requests(r.events).map((q) => q.agent)).toEqual(["builder-1", "builder-2", "builder-2"]);
  });

  test("never for something that cannot be undone: a push asks every time", async () => {
    const r = setup(new ScriptedEngine([bash("git push origin main"), bash("git push origin main")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await answer(r, 2, "allow", "once");
    await done;
    expect(requests(r.events).length).toBe(2);
  });

  test("never over a refusal: a rule that refuses the action later still refuses it", async () => {
    let calls = 0;
    const r = setup(new ScriptedEngine([bash("git branch feature"), bash("git branch feature")]), async (_call, { project }) => {
      // After the first run, the person adds a rule that refuses it.
      if (++calls === 1) { mkdirSync(join(project, ".companion"), { recursive: true }); writeFileSync(join(project, ".companion/rules.txt"), "never run git branch"); }
      return { ok: true, output: "" };
    });
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await done;
    expect(calls).toBe(1);
    expect(r.events.filter((e) => e.type === "agent.tool").map((e: any) => e.outcome)).toEqual(["needs_approval", "ran", "blocked"]);
  });

  test("a no for the rest of the task is still only a no: nothing is remembered", async () => {
    const r = setup(new ScriptedEngine([bash("git branch feature"), bash("git branch feature")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "deny", "task");
    await answer(r, 2, "allow", "once");
    await done;
    expect(requests(r.events).length).toBe(2);
    expect(r.ran).toEqual(["git branch feature"]);
  });

  test("Stop clears it: a tool asked for after Stop is not let through", async () => {
    // Like the real engine, this one asks before each tool itself, and can still ask once more while it winds down.
    let gate!: () => void;
    const later = new Promise<void>((res) => { gate = res; });
    const answers: boolean[] = [];
    const sdkLike: Engine = {
      executesTools: true,
      async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
        const call = { name: "Bash", input: { command: "git branch feature" } };
        answers.push((await o.authorize(call)).allow);
        await later;
        answers.push((await o.authorize(call)).allow);
        yield { costUsd: 0 };
      },
    };
    const r = setup(sdkLike);
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await waitFor(() => answers.length === 1);
    await r.runner.handle({ v: 1, id: "stop", type: "agent.interrupt", agent: "builder-1" });
    gate();
    await done;
    expect(answers).toEqual([true, false]);
    expect(requests(r.events).length).toBe(1);
  });

  test("Stop everything clears it for every agent", async () => {
    let gate!: () => void;
    const later = new Promise<void>((res) => { gate = res; });
    const answers: boolean[] = [];
    const sdkLike: Engine = {
      executesTools: true,
      async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
        const call = { name: "Bash", input: { command: "git branch feature" } };
        answers.push((await o.authorize(call)).allow);
        await later;
        answers.push((await o.authorize(call)).allow);
        yield { costUsd: 0 };
      },
    };
    const r = setup(sdkLike);
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await waitFor(() => answers.length === 1);
    await r.runner.handle({ v: 1, id: "stopall", type: "agent.interruptAll", reason: "kill switch" });
    gate();
    await done;
    expect(answers).toEqual([true, false]);
    expect(requests(r.events).length).toBe(1);
  });
});
