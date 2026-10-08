// The timeline: past tasks per project, so a receipt can be found again.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseCommand, parseEvent } from "../../protocol/index.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-tl-${l}-`))); made.push(d); return d; };
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0.01 });

describe("the task log remembers where a receipt lives", () => {
  test("a finished task keeps its snapshot, how many files changed, and whether it was proven", () => {
    const log = new TaskLog(":memory:");
    const id = log.start({ project: "/p", agent: "a", mode: "drive", label: "add a page", startedAt: "t0" });
    log.finish(id, "done", 0.04, "t1", { checkpoint: "cp_0001", changed: 2, proof: "passed" });
    expect(log.list()[0]).toMatchObject({ checkpoint: "cp_0001", changed: 2, proof: "passed", status: "done" });
  });
  test("it can list one project's tasks, newest first, and never another's", () => {
    const log = new TaskLog(":memory:");
    for (const [p, l] of [["/a", "one"], ["/b", "two"], ["/a", "three"]]) log.finish(log.start({ project: p, agent: "x", mode: "drive", label: l, startedAt: "t" }), "done", 0, "t");
    expect(log.list("/a").map((t) => t.label)).toEqual(["three", "one"]);
  });
  test("a limit keeps the list short", () => {
    const log = new TaskLog(":memory:");
    for (let i = 0; i < 5; i++) log.start({ project: "/a", agent: "x", mode: "drive", label: `t${i}`, startedAt: "t" });
    expect(log.list("/a", 3).length).toBe(3);
  });
  test("an old log file from before this change still opens and keeps its tasks", () => {
    const dir = tmp("old"); const path = join(dir, "tasks.db");
    const db = new Database(path);
    db.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT)`);
    db.run(`INSERT INTO tasks (project, agent, mode, label, status, started_at) VALUES ('/p','a','drive','old task','done','t')`);
    db.close();
    const log = new TaskLog(path);
    expect(log.list("/p")[0]).toMatchObject({ label: "old task", checkpoint: null, proof: null });
  });
});

describe("asking for the timeline", () => {
  const run = async () => {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    const log = new TaskLog(":memory:");
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([bash("echo hi > new.txt")]), log, emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "add a note", model: "m", budgetUsd: 3 });
    return { project, events, runner };
  };
  test("a finished task is saved with its receipt details", async () => {
    const { project, events, runner } = await run();
    await runner.handle({ v: 1, id: "q", type: "tasks.list", project });
    const ev = events.find((e) => e.type === "tasks.list") as any;
    expect(ev.tasks.length).toBe(1);
    expect(ev.tasks[0]).toMatchObject({ label: "add a note", status: "done", changed: 1, proof: "passed" });
    expect(ev.tasks[0].checkpoint).toMatch(/^cp_/);
  });
  test("the list for a project with no tasks is empty, not an error", async () => {
    const { runner, events } = await run();
    await runner.handle({ v: 1, id: "q", type: "tasks.list", project: "/nowhere" });
    expect((events.filter((e) => e.type === "tasks.list").at(-1) as any).tasks).toEqual([]);
  });
  test("the protocol knows the new command and event", () => {
    expect(parseCommand(JSON.stringify({ v: 1, id: "q", type: "tasks.list", project: "/p" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "q", type: "tasks.list" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "tasks.list", project: "/p", tasks: [] })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "tasks.list", project: "/p" })).ok).toBe(false);
  });
});
