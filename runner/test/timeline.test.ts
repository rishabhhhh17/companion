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
  // Must fix 11 (review of 4 Nov): Home must never say the project works over files nobody checked. The engine knows the
  // version its last check passed on, so the list says whether the project changed since.
  test("right after a proven task, the project is the same as checked", async () => {
    const { project, events, runner } = await run();
    await runner.handle({ v: 1, id: "q", type: "tasks.list", project });
    expect((events.filter((e) => e.type === "tasks.list").at(-1) as any).sinceCheck).toBe("same");
  });
  test("after the person edits a file, it says the project changed since its last check, and makes no undo point", async () => {
    const { project, events, runner } = await run();
    writeFileSync(join(project, "a.txt"), "edited by hand");
    const points = () => events.filter((e) => e.type === "checkpoint.created").length;
    const before = points();
    await runner.handle({ v: 1, id: "q", type: "tasks.list", project });
    expect((events.filter((e) => e.type === "tasks.list").at(-1) as any).sinceCheck).toBe("changed");
    expect(points()).toBe(before);
    // Put back as it was checked, it is the same again.
    writeFileSync(join(project, "a.txt"), "x");
    await runner.handle({ v: 1, id: "q2", type: "tasks.list", project });
    expect((events.filter((e) => e.type === "tasks.list").at(-1) as any).sinceCheck).toBe("same");
  });
  // Review of M56: the proven version was kept only in memory, so after a relaunch Home said "works" again over files
  // that changed. It is now kept beside the project's snapshots.
  test("after the engine restarts, it still knows the version its last check passed on", async () => {
    const project = tmp("pr"); writeFileSync(join(project, "a.txt"), "x");
    const shadowRoot = tmp("sr");
    const make = (events: Event[]) => new AgentRunner({ shadowRoot, engine: new ScriptedEngine([bash("echo hi > new.txt")]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    const first: Event[] = [];
    await make(first).handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "add a note", model: "m", budgetUsd: 3 });
    writeFileSync(join(project, "a.txt"), "edited in another editor while the app was closed");
    const after: Event[] = [];
    const again = make(after);
    await again.handle({ v: 1, id: "q", type: "tasks.list", project });
    expect((after.filter((e) => e.type === "tasks.list").at(-1) as any).sinceCheck).toBe("changed");
    writeFileSync(join(project, "a.txt"), "x");
    await again.handle({ v: 1, id: "q2", type: "tasks.list", project });
    expect((after.filter((e) => e.type === "tasks.list").at(-1) as any).sinceCheck).toBe("same");
  });
  test("a failed check remembered across a restart never reads as proven", async () => {
    const project = tmp("pf"); writeFileSync(join(project, "a.txt"), "x");
    const shadowRoot = tmp("sf");
    const make = (events: Event[], verdict: "passed" | "failed") => new AgentRunner({ shadowRoot, engine: new ScriptedEngine([bash("echo hi > new.txt")]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict, steps: [] }) });
    await make([], "failed").handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "add a note", model: "m", budgetUsd: 0.05 });
    const after: Event[] = [];
    await make(after, "passed").handle({ v: 1, id: "q", type: "tasks.list", project });
    expect("sinceCheck" in (after.find((e) => e.type === "tasks.list") as any)).toBe(false);
  });
  test("with no passed check known, it says nothing either way", async () => {
    const project = tmp("p2"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s2"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "q", type: "tasks.list", project });
    expect("sinceCheck" in (events.find((e) => e.type === "tasks.list") as any)).toBe(false);
  });
  test("the protocol knows the new command and event", () => {
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "tasks.list", project: "/p", tasks: [], sinceCheck: "changed" })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "tasks.list", project: "/p", tasks: [], sinceCheck: "maybe" })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ v: 1, id: "q", type: "tasks.list", project: "/p" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "q", type: "tasks.list" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "tasks.list", project: "/p", tasks: [] })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "tasks.list", project: "/p" })).ok).toBe(false);
  });
});
