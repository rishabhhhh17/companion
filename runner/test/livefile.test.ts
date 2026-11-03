// M55 section 2, live progress: the work card lists each file the moment the agent changed it (protocol agent.file). Only
// what really happened: a file is named after the tool that edits it has finished and the file on disk is not what it was
// just before. A tool that failed, was refused or was stopped, or wrote the same bytes again, names nothing (rule 14).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { changeOf, inProject, markOf, HASH_MAX } from "../src/livefile.ts";
import { ScriptedEngine, type Engine, type EngineOptions, type Step, type ToolResult, type Turn } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseEvent, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-livefile-${l}-`))); made.push(d); return d; };

describe("what changed in one file, from just before the tool to just after", () => {
  test("a file that was not there and is now was added; one that was there and is gone was removed", () => {
    const d = tmp("p");
    const f = join(d, "a.txt");
    const none = markOf(f);
    expect(none).toEqual({ exists: false });
    writeFileSync(f, "hello");
    const there = markOf(f);
    expect(changeOf(none, there)).toBe("added");
    rmSync(f);
    expect(changeOf(there, markOf(f))).toBe("deleted");
    expect(changeOf(none, markOf(f))).toBeNull();
  });
  test("new words in it are a change, the same words written again are not, whatever the clock says", () => {
    const d = tmp("p");
    const f = join(d, "a.txt");
    writeFileSync(f, "one");
    const was = markOf(f);
    writeFileSync(f, "two");
    expect(changeOf(was, markOf(f))).toBe("modified");
    const now = markOf(f);
    writeFileSync(f, "two");
    utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    expect(changeOf(now, markOf(f))).toBeNull();
  });
  test("a file too big to read through is told by its size and its time", () => {
    const before = { exists: true as const, size: HASH_MAX + 1, hash: null, mtimeMs: 1 };
    expect(changeOf(before, { ...before })).toBeNull();
    expect(changeOf(before, { ...before, mtimeMs: 2 })).toBe("modified");
    expect(changeOf(before, { ...before, size: HASH_MAX + 2 })).toBe("modified");
  });
  test("a folder is never a file", () => {
    const d = tmp("p");
    mkdirSync(join(d, "dir"));
    expect(markOf(join(d, "dir"))).toEqual({ exists: false });
  });
});

describe("only files in the project are named, from the project folder down", () => {
  const P = "/Users/me/site";
  test("a path inside, given whole or from the project", () => {
    expect(inProject(P, "/Users/me/site/src/app.js")).toBe("src/app.js");
    expect(inProject(P, "src/app.js")).toBe("src/app.js");
    expect(inProject(`${P}/`, "./index.html")).toBe("index.html");
  });
  test("never a path outside it, the folder itself, or Git's and Squibby's own files (.git, .companion)", () => {
    expect(inProject(P, "/Users/me/other/app.js")).toBeNull();
    expect(inProject(P, "../site2/app.js")).toBeNull();
    expect(inProject(P, "/Users/me/site")).toBeNull();
    expect(inProject(P, "/Users/me/site/.git/config")).toBeNull();
    expect(inProject(P, ".companion/notes.md")).toBeNull();
    expect(inProject(P, "")).toBeNull();
    expect(inProject(P, "a\u0000b")).toBeNull();
  });
});

// ---- the runner ----

function setup(engine: Engine, files: Record<string, string> = { "a.txt": "original" }) {
  const project = tmp("proj");
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(project, p, ".."), { recursive: true }); writeFileSync(join(project, p), c); }
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), now: () => new Date("2026-11-03T12:00:00Z") });
  return { project, events, runner };
}
const start = (project: string) => ({ v: 1 as const, id: "c1", type: "agent.start" as const, project, agent: "builder-1", mode: "drive" as const, prompt: "Fix the signup button", model: "claude-sonnet-5-5", budgetUsd: 3 });
const fileEvents = (events: Event[]) => events.filter((e) => e.type === "agent.file") as unknown as { agent: string; file: string; kind: string }[];
const write = (file: string, content: string): Step => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });
const edit = (file: string, from: string, to: string): Step => ({ tool: { name: "Edit", input: { file_path: file, old_string: from, new_string: to } }, costUsd: 0.01 });

describe("the runner tells each file the moment it changed", () => {
  test("one event per file the tools really changed, in order, after the tool ran, and each one is a whole protocol line", async () => {
    const r = setup(new ScriptedEngine([write("src/new.js", "x"), edit("a.txt", "original", "changed"), { text: "Done", costUsd: 0.01 }]));
    await r.runner.handle(start(r.project));
    expect(fileEvents(r.events).map((e) => [e.file, e.kind])).toEqual([["src/new.js", "added"], ["a.txt", "modified"]]);
    for (const e of fileEvents(r.events)) expect(e.agent).toBe("builder-1");
    // After its tool was let through (agent.tool) and before the task's own checks and receipt.
    const t = r.events.map((e) => e.type);
    expect(t.indexOf("agent.file")).toBeGreaterThan(t.indexOf("agent.tool"));
    expect(t.lastIndexOf("agent.file")).toBeLessThan(t.indexOf("receipt"));
    for (const e of r.events.filter((x) => x.type === "agent.file")) expect(parseEvent(JSON.stringify({ ...e })).ok).toBe(true);
  });
  test("an edit that failed, or wrote the same words again, names nothing", async () => {
    const r = setup(new ScriptedEngine([edit("a.txt", "not there", "x"), write("a.txt", "original"), { text: "Done", costUsd: 0.01 }]));
    await r.runner.handle(start(r.project));
    expect(fileEvents(r.events)).toEqual([]);
  });
  test("a refused edit names nothing, and nothing outside the project is ever named", async () => {
    const outside = tmp("outside");
    const r = setup(new ScriptedEngine([write(join(outside, "x.txt"), "x"), write(".git/hooks/pre-commit", "x"), { text: "Done", costUsd: 0.01 }]));
    await r.runner.handle(start(r.project));
    expect(fileEvents(r.events)).toEqual([]);
  });
  test("an engine that runs its own tools: the file is named when it says the tool is done, never at the yes", async () => {
    let project = "";
    const seen: number[] = [];
    let events: Event[] = [];
    const sdkLike: Engine = {
      executesTools: true,
      async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
        const call = { name: "Write", input: { file_path: join(project, "made.txt"), content: "hi" } };
        const a = await o.authorize(call, "toolu_sdk1");
        seen.push(fileEvents(events).length);   // allowed, not run yet: nothing named
        if (a.allow) writeFileSync(join(project, "made.txt"), "hi");
        seen.push(fileEvents(events).length);   // written, not said done yet: still nothing
        o.toolDone?.("toolu_sdk1");
        seen.push(fileEvents(events).length);
        o.toolDone?.("toolu_sdk1");             // said twice: named once
        seen.push(fileEvents(events).length);
        yield { text: "Done", costUsd: 0.01 };
      },
    };
    const r = setup(sdkLike);
    project = r.project; events = r.events;
    await r.runner.handle(start(r.project));
    expect(seen).toEqual([0, 0, 1, 1]);
    expect(fileEvents(r.events).map((e) => [e.file, e.kind])).toEqual([["made.txt", "added"]]);
    expect(existsSync(join(r.project, "made.txt"))).toBe(true);
  });
});
