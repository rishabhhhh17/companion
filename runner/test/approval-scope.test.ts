// "Allow for the rest of this task": a yes that covers the exact same action again, only inside the same task and agent.
// Only for asks whose repeat sends nothing, deploys nothing and changes nothing a snapshot cannot undo: reading a file
// outside the project, and a file edit or read that only a house rule asks about. Never across tasks, never for something
// Companion's own rules refuse, and gone the moment Stop is pressed. A Drive plan is one task.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type ToolExecutor } from "../src/agent.ts";
import { ScriptedEngine, type Engine, type EngineOptions, type Step, type ToolResult, type Turn } from "../src/engine.ts";
import { evaluate, taskScopeCovers } from "../src/safety.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-scope-${l}-`))); made.push(d); return d; };
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0 });
const read = (file_path: string): Step => ({ tool: { name: "Read", input: { file_path } }, costUsd: 0 });
const tool = (name: string, input: Record<string, unknown>): Step => ({ tool: { name, input }, costUsd: 0 });
// A file outside the project: reading it asks, and a yes may cover the rest of the task.
const OUTSIDE = join(realpathSync(tmpdir()), "companion-scope-elsewhere", "notes.txt");
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
    const r = setup(new ScriptedEngine([read(OUTSIDE), read(OUTSIDE), read(OUTSIDE)]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await done;
    expect(requests(r.events).length).toBe(1);
    expect(r.ran).toEqual([OUTSIDE, OUTSIDE, OUTSIDE]);
    const lines = r.events.filter((e) => e.type === "agent.tool").map((e: any) => e.outcome);
    expect(lines).toEqual(["needs_approval", "ran", "ran", "ran"]);
  });

  test("a different action still asks", async () => {
    const other = join(OUTSIDE, "..", "other.txt");
    const r = setup(new ScriptedEngine([read(OUTSIDE), read(other)]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await answer(r, 2, "allow", "once");
    await done;
    expect(requests(r.events).length).toBe(2);
    expect(r.ran).toEqual([OUTSIDE, other]);
  });

  test("'once' still asks every time", async () => {
    const r = setup(new ScriptedEngine([read(OUTSIDE), read(OUTSIDE)]));
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
    const r = setup(new ScriptedEngine([[read(OUTSIDE)], [read(OUTSIDE)]]));
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
    const same: Engine = { async *start(_o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> { yield read(OUTSIDE); yield read(OUTSIDE); } };
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

  // A repeat of any of these could send, publish, deploy, install or throw away work again, or run code that changed in
  // between (a script the agent may rewrite without asking). Each one asks every time, whatever the first answer said.
  const always: [string, Step][] = [
    ["a push", bash("git push origin main")],
    ["a git reset that throws work away", bash("git reset --hard HEAD~1")],
    ["dropping a stash", bash("git stash drop")],
    ["a git clean", bash("git clean -fdx")],
    ["even a harmless looking git change", bash("git branch feature")],
    ["a script I cannot read", bash("sh deploy.sh")],
    ["a script run by name", bash("./deploy.sh")],
    ["an install on the Mac", bash("brew install wget")],
    ["a global install", bash("npm install -g left-pad")],
    ["stopping programs", bash("kill 1234")],
    ["a web address that carries data", tool("WebFetch", { url: "https://example.com/?q=secret" })],
    ["a notification", tool("PushNotification", { message: "hello" })],
    ["feedback", tool("SendFeedback", { feedback: "hi" })],
    ["a remote trigger", tool("RemoteTrigger", { action: "run", trigger_id: "t1" })],
    ["publishing a page", tool("Artifact", { file_path: "a.html" })],
    ["a timer that runs later", tool("CronCreate", { cron: "* * * * *", prompt: "x" })],
    ["a tool nobody knows", tool("MadeUpTool", { x: 1 })],
  ];
  for (const [what, step] of always) test(`never for ${what}: it asks again`, async () => {
    const r = setup(new ScriptedEngine([step, step]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await answer(r, 2, "allow", "once");
    await done;
    expect(requests(r.events).length).toBe(2);
  });

  test("never over a refusal: a rule that refuses the action later still refuses it", async () => {
    let calls = 0;
    const edit = tool("Write", { file_path: "pricing.txt", content: "1" });
    const r = setup(new ScriptedEngine([edit, edit]), async (_call, { project }) => {
      // After the first edit, the person changes the rule to refuse it.
      if (++calls === 1) writeFileSync(join(project, ".companion/rules.txt"), "never edit pricing.txt");
      return { ok: true, output: "" };
    });
    mkdirSync(join(r.project, ".companion"));
    writeFileSync(join(r.project, ".companion/rules.txt"), "ask before editing pricing.txt");
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "task");
    await done;
    expect(calls).toBe(1);
    expect(r.events.filter((e) => e.type === "agent.tool").map((e: any) => e.outcome)).toEqual(["needs_approval", "ran", "blocked"]);
  });

  test("a no for the rest of the task is still only a no: nothing is remembered", async () => {
    const r = setup(new ScriptedEngine([read(OUTSIDE), read(OUTSIDE)]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "deny", "task");
    await answer(r, 2, "allow", "once");
    await done;
    expect(requests(r.events).length).toBe(2);
    expect(r.ran).toEqual([OUTSIDE]);
  });

  test("Stop clears it: a tool asked for after Stop is not let through", async () => {
    // Like the real engine, this one asks before each tool itself, and can still ask once more while it winds down.
    let gate!: () => void;
    const later = new Promise<void>((res) => { gate = res; });
    const answers: boolean[] = [];
    const sdkLike: Engine = {
      executesTools: true,
      async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
        const call = { name: "Read", input: { file_path: OUTSIDE } };
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
        const call = { name: "Read", input: { file_path: OUTSIDE } };
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

describe("what a yes for the rest of the task may cover", () => {
  const P = "/Users/me/site";
  const judged = (name: string, input: Record<string, unknown>) => taskScopeCovers({ tool: name, input }, evaluate({ tool: name, input }, { project: P }), false);
  const rule = { decision: "ask" as const, risk: "irreversible" as const, reason: "Your house rule: ask before editing pricing.txt", undoable: true };
  test("reading outside the project with the file tools", () => {
    expect(judged("Read", { file_path: "/etc/hosts" })).toBe(true);
    expect(judged("Grep", { pattern: "x", path: "/etc" })).toBe(true);
    expect(judged("Glob", { pattern: "../../**/*.md" })).toBe(true);
    expect(judged("LS", { path: "/etc" })).toBe(true);
  });
  test("a file edit or read that only a house rule asks about", () => {
    expect(taskScopeCovers({ tool: "Write", input: { file_path: "pricing.txt" } }, rule, true)).toBe(true);
    expect(taskScopeCovers({ tool: "Edit", input: { file_path: "pricing.txt" } }, rule, true)).toBe(true);
    expect(taskScopeCovers({ tool: "Read", input: { file_path: "pricing.txt" } }, rule, true)).toBe(true);
  });
  test("not an edit Companion itself asks about, and not a command a house rule asks about", () => {
    expect(taskScopeCovers({ tool: "Write", input: { file_path: "pricing.txt" } }, rule, false)).toBe(false);
    expect(taskScopeCovers({ tool: "Bash", input: { command: "npm test" } }, rule, true)).toBe(false);
  });
  test("never something that is not a question, and never something that cannot be undone", () => {
    expect(taskScopeCovers({ tool: "Read", input: {} }, { decision: "allow", reason: "ok", undoable: true }, false)).toBe(false);
    expect(taskScopeCovers({ tool: "Read", input: {} }, { decision: "deny", risk: "outside_project", reason: "no", undoable: true }, false)).toBe(false);
    expect(taskScopeCovers({ tool: "Write", input: {} }, { ...rule, undoable: false }, true)).toBe(false);
  });
  const bashNever = ["git push origin main", "git reset --hard HEAD~1", "git stash drop", "git clean -fdx", "git branch feature", "sh deploy.sh", "./deploy.sh", "brew install wget", "npm i -g left-pad", "pip install requests", "kill 1", "cat /etc/hosts", "curl -X POST https://example.com", "npx vercel deploy --prod", "docker run x"];
  for (const c of bashNever) test(`never a command: ${c}`, () => expect(judged("Bash", { command: c })).toBe(false));
  for (const t of ["PushNotification", "SendFeedback", "RemoteTrigger", "Artifact", "CronCreate", "TaskStop", "MadeUpTool", "mcp__x__send"]) test(`never a tool that is not a file tool: ${t}`, () => expect(judged(t, { task_id: "zz" })).toBe(false));
  test("never a web fetch", () => expect(judged("WebFetch", { url: "https://example.com/?q=1" })).toBe(false));
});

// To the person, a Drive plan is one task, even though each step is its own conversation with Claude.
describe("a Drive plan is one task", () => {
  const planned = (...steps: string[]): Step => ({ text: "Here is the plan:\n```json\n" + JSON.stringify(steps) + "\n```", costUsd: 0 });
  function drive(rounds: Step[][]) {
    const r = setup(new ScriptedEngine(rounds));
    const plan = () => r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "builder-1", goal: "build it", model: "m", budgetUsd: 5 });
    const approve = (steps: string[]) => r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "builder-1", steps });
    return { ...r, plan, approve };
  }
  const finished = (events: Event[]) => events.filter((e) => e.type === "drive.done") as any[];

  test("a yes for the rest of the task lasts through every step of the plan", async () => {
    const r = drive([[planned("one", "two", "three")], [read(OUTSIDE)], [read(OUTSIDE)], [read(OUTSIDE)]]);
    await r.plan();
    const going = r.approve(["one", "two", "three"]);
    await answer(r, 1, "allow", "task");
    await going;
    expect(requests(r.events).length).toBe(1);
    expect(r.ran).toEqual([OUTSIDE, OUTSIDE, OUTSIDE]);
    expect(finished(r.events)[0]).toMatchObject({ status: "done", completed: 3, total: 3 });
  });

  test("'once' in a plan still asks at every step", async () => {
    const r = drive([[planned("one", "two")], [read(OUTSIDE)], [read(OUTSIDE)]]);
    await r.plan();
    const going = r.approve(["one", "two"]);
    await answer(r, 1, "allow", "once");
    await answer(r, 2, "allow", "once");
    await going;
    expect(requests(r.events).length).toBe(2);
  });

  test("the next plan asks again", async () => {
    const r = drive([[planned("one")], [read(OUTSIDE)], [planned("two")], [read(OUTSIDE)]]);
    await r.plan();
    const first = r.approve(["one"]);
    await answer(r, 1, "allow", "task");
    await first;
    await r.plan();
    const second = r.approve(["two"]);
    await answer(r, 2, "allow", "once");
    await second;
    expect(requests(r.events).length).toBe(2);
  });

  test("Stop ends it: the plan stops, and nothing more is let through", async () => {
    const wait: Step = { text: "working", costUsd: 0, delayMs: 2000 };
    const r = drive([[planned("one", "two")], [read(OUTSIDE)], [wait, read(OUTSIDE)]]);
    await r.plan();
    const going = r.approve(["one", "two"]);
    await answer(r, 1, "allow", "task");
    await waitFor(() => r.events.some((e: any) => e.type === "drive.step" && e.index === 2 && e.status === "started"));
    await r.runner.handle({ v: 1, id: "stop", type: "agent.interrupt", agent: "builder-1" });
    await going;
    expect(r.ran).toEqual([OUTSIDE]);
    expect(finished(r.events)[0]).toMatchObject({ status: "interrupted", completed: 1 });
  });
});
