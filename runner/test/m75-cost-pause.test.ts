// M75: the cost pause. A task that has used far more than a usual task here stops and asks Keep going, Stop or Undo what it
// did. With the scripted engine only (no real model, nothing spent); every project is a temporary fixture folder.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { FLOOR_USD, nextPauseAt, pauseAtUsd, STARTING_USUAL_USD, usualTaskUsd } from "../src/costpause.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { Ledger } from "../src/ledger.ts";
import { RunnerSettings } from "../src/settings.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m75-cost-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const until = async (fn: () => boolean, ms = 5000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); expect(fn()).toBe(true); };

describe("usual, and where the pause comes", () => {
  test("usual is the middle of this project's recent tasks that spent something", () => {
    expect(usualTaskUsd([])).toBe(STARTING_USUAL_USD);
    expect(usualTaskUsd([{ usd: 0.2 }, { usd: 0.3 }])).toBe(STARTING_USUAL_USD);   // too few
    expect(usualTaskUsd([{ usd: 0.1 }, { usd: 0 }, { usd: 0.5 }, { usd: 0.3 }])).toBe(0.3);
    expect(usualTaskUsd([{ usd: 0.1 }, { usd: 0.2 }, { usd: 0.3 }, { usd: 0.4 }])).toBeCloseTo(0.25, 6);
    // One huge task does not move the middle much.
    expect(usualTaskUsd([{ usd: 0.2 }, { usd: 0.2 }, { usd: 30 }])).toBe(0.2);
  });
  test("the pause is usual times the choice, never below the floor; Off never pauses; Keep going asks again at twice", () => {
    expect(pauseAtUsd(1, "3")).toBe(3);
    expect(pauseAtUsd(1, "5")).toBe(5);
    expect(pauseAtUsd(0.05, "3")).toBe(FLOOR_USD);
    expect(pauseAtUsd(1, "off")).toBe(Infinity);
    expect(pauseAtUsd(1, "7")).toBe(Infinity);
    expect(nextPauseAt(3)).toBe(6);
  });
});

/** A task whose turns each cost `each`: a Write after every text turn, so a held tool can be seen. */
function steps(n: number, each: number): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < n; i++) out.push({ text: `step ${i}`, costUsd: each / 2 }, { tool: { name: "Write", input: { file_path: `f${i}.txt`, content: `made ${i}` } }, costUsd: each / 2 });
  return out;
}
function setup(o: { script: Step[]; values?: Record<string, unknown>; past?: number[] }) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "start");
  const events: Event[] = [];
  const log = new TaskLog(":memory:");
  for (const usd of o.past ?? []) { const id = log.start({ project, agent: "old", mode: "drive", label: "old", startedAt: new Date().toISOString() }); log.finish(id, "done", usd, new Date().toISOString()); }
  const settings = new RunnerSettings();
  if (o.values) settings.apply({ v: 1, id: "s", type: "settings.apply", values: o.values });
  const engine = new ScriptedEngine(o.script);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), ledger: new Ledger(":memory:"), settings, proof: async () => ({ verdict: "passed", steps: [] }) });
  const start = () => runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "do it", model: "claude-sonnet-5-5", budgetUsd: 50 });
  const choose = (choice: string) => runner.handle({ v: 1, id: `k-${choice}`, type: "cost.choose", agent: "a", choice } as never);
  const every = () => { for (const e of events) { const r = parseEvent(JSON.stringify(e)); expect(r.ok, JSON.stringify(e)).toBe(true); } };
  return { project, events, runner, start, choose, every };
}

describe("a task that uses far more than usual pauses and asks", () => {
  test("the pause comes once past the line, nothing runs while it waits, Keep going goes on and asks again only at twice", async () => {
    // Usual 0.4 with no history: the line is 1.2. Each pair of turns costs 0.5.
    const t = setup({ script: steps(8, 0.5) });
    const run = t.start();
    await until(() => of(t.events, "cost.pause").length === 1);
    const [p] = of(t.events, "cost.pause");
    expect(p).toMatchObject({ agent: "a", project: t.project });
    expect(Object.keys(p).sort()).toEqual(["agent", "id", "project", "ts", "type", "v"]);   // no amount, ever
    expect(of(t.events, "agent.state").at(-1).state).toBe("needsYou");
    // Held: the next file is not written while it waits.
    const before = of(t.events, "agent.tool").length;
    await Bun.sleep(150);
    expect(of(t.events, "agent.tool").length).toBe(before);
    expect(existsSync(join(t.project, "f2.txt"))).toBe(false);
    await t.choose("keep");
    // It asks again only at twice the line (2.4): later, once.
    await until(() => of(t.events, "cost.pause").length === 2);
    await t.choose("keep");
    await run;
    expect(of(t.events, "cost.resolved").map((e) => e.choice)).toEqual(["keep", "keep"]);
    expect(of(t.events, "receipt")[0].ended).toBe("done");
    expect(existsSync(join(t.project, "f7.txt"))).toBe(true);
    t.every();
  });
  test("Stop ends the task as stopped, never as done", async () => {
    const t = setup({ script: steps(8, 0.5) });
    const run = t.start();
    await until(() => of(t.events, "cost.pause").length === 1);
    await t.choose("stop");
    await run;
    expect(of(t.events, "cost.resolved").map((e) => e.choice)).toEqual(["stop"]);
    expect(of(t.events, "receipt")[0].ended).toBe("stopped");
    expect(existsSync(join(t.project, "f7.txt"))).toBe(false);
    expect(of(t.events, "checkpoint.restored")).toEqual([]);
  });
  test("Undo what it did stops it, then puts the files back to the task's own safety copy", async () => {
    const t = setup({ script: steps(8, 0.5) });
    const run = t.start();
    await until(() => of(t.events, "cost.pause").length === 1);
    expect(existsSync(join(t.project, "f0.txt"))).toBe(true);
    await t.choose("undo");
    await run;
    await until(() => of(t.events, "checkpoint.restored").length === 1);
    expect(existsSync(join(t.project, "f0.txt"))).toBe(false);
    expect(readFileSync(join(t.project, "a.txt"), "utf8")).toBe("start");
    expect(of(t.events, "checkpoint.restored")[0].checkpoint).toBe(of(t.events, "checkpoint.created")[0].checkpoint);
    t.every();
  });
  test("Stop everything ends the wait at once", async () => {
    const t = setup({ script: steps(8, 0.5) });
    const run = t.start();
    await until(() => of(t.events, "cost.pause").length === 1);
    await t.runner.handle({ v: 1, id: "all", type: "agent.interruptAll", reason: "hotkey" });
    await run;
    expect(of(t.events, "receipt")[0].ended).toBe("stopped");
    expect(of(t.events, "cost.resolved").map((e) => e.choice)).toEqual(["stop"]);
  });
  test("Off never pauses, and a project whose tasks usually cost more pauses later", async () => {
    const off = setup({ script: steps(4, 0.5), values: { "spend.pauseAt": "off" } });
    await off.start();
    expect(of(off.events, "cost.pause")).toEqual([]);
    const big = setup({ script: steps(4, 0.5), past: [1, 1, 1] });   // usual 1, line 3: a task of 2 never pauses
    await big.start();
    expect(of(big.events, "cost.pause")).toEqual([]);
  });
  test("an answer with nothing waiting changes nothing, and the command parses only with a known choice", async () => {
    const t = setup({ script: steps(1, 0.1) });
    await t.choose("keep");
    expect(of(t.events, "protocol.error").length).toBe(1);
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "cost.choose", agent: "a", choice: "keep" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "cost.choose", agent: "a", choice: "more" })).ok).toBe(false);
  });
});
