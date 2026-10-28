// Finding B (first Mac session): an empty hidden .claude folder appeared inside the person's project after a task. Squibby's
// own code never makes it (it only reads .claude/proof.json and .claude/launch.json when the person has them); Claude Code,
// run with the project as its working directory, does (it keeps its write tracking there, .claude/.cc-writes). So after a task
// the folder is removed, but only when it did not exist before the task began and is empty: a person's own .claude folder, and
// any file in it, is never touched.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import type { Engine, EngineOptions, Turn, ToolResult } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { claudeFolderExists, removeEmptyClaudeFolder } from "../src/litter.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-lit-${l}-`))); made.push(d); return d; };

describe("removing the empty .claude folder Claude Code leaves behind", () => {
  test("a folder that was not there before and is empty now is removed", () => {
    const p = tmp("a"); const before = claudeFolderExists(p);
    mkdirSync(join(p, ".claude"));
    expect(removeEmptyClaudeFolder(p, before)).toBe(true);
    expect(existsSync(join(p, ".claude"))).toBe(false);
  });
  test("a folder that was there before is never touched, even when it is empty", () => {
    const p = tmp("b"); mkdirSync(join(p, ".claude"));
    expect(removeEmptyClaudeFolder(p, claudeFolderExists(p))).toBe(false);
    expect(existsSync(join(p, ".claude"))).toBe(true);
  });
  test("a new folder with anything in it stays, with every file exactly as it was", () => {
    const p = tmp("c"); const before = claudeFolderExists(p);
    mkdirSync(join(p, ".claude", "deep"), { recursive: true });
    writeFileSync(join(p, ".claude", "launch.json"), '{"a":1}');
    expect(removeEmptyClaudeFolder(p, before)).toBe(false);
    expect(readFileSync(join(p, ".claude", "launch.json"), "utf8")).toBe('{"a":1}');
    expect(existsSync(join(p, ".claude", "deep"))).toBe(true);
  });
  test("a new folder that holds only an empty folder is not empty, so it stays", () => {
    const p = tmp("d"); const before = claudeFolderExists(p);
    mkdirSync(join(p, ".claude", "x"), { recursive: true });
    expect(removeEmptyClaudeFolder(p, before)).toBe(false);
    expect(existsSync(join(p, ".claude", "x"))).toBe(true);
  });
  test("a link that happens to be called .claude is left alone, and what it points at too", () => {
    const p = tmp("e"), other = tmp("o"); const before = claudeFolderExists(p);
    symlinkSync(other, join(p, ".claude"));
    expect(removeEmptyClaudeFolder(p, before)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });
  test("nothing there, a project that is gone, or a plain file named .claude: no error, nothing removed", () => {
    const p = tmp("f");
    expect(removeEmptyClaudeFolder(p, false)).toBe(false);
    expect(removeEmptyClaudeFolder(join(p, "gone"), false)).toBe(false);
    writeFileSync(join(p, ".claude"), "x");
    expect(removeEmptyClaudeFolder(p, false)).toBe(false);
    expect(readFileSync(join(p, ".claude"), "utf8")).toBe("x");
  });
});

// Claude Code makes the folder while it works in the project; this stand in does the same and then says it is done.
function makesFolder(files: Record<string, string> = {}): Engine {
  return {
    executesTools: true,
    async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
      mkdirSync(join(o.project, ".claude"), { recursive: true });
      for (const [f, c] of Object.entries(files)) writeFileSync(join(o.project, ".claude", f), c);
      yield { text: o.planOnly ? '["Only step"]' : "Done.", costUsd: 0.01 };
    },
  };
}
function setup(engine: Engine, existing?: Record<string, string>) {
  const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
  if (existing) { mkdirSync(join(project, ".claude")); for (const [f, c] of Object.entries(existing)) writeFileSync(join(project, ".claude", f), c); }
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
  return { project, events, runner };
}

describe("after a task and after a plan", () => {
  test("a task leaves no empty .claude folder behind", async () => {
    const r = setup(makesFolder());
    await r.runner.handle({ v: 1, id: "1", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "Make the heading blue", model: "m", budgetUsd: 1 });
    expect(existsSync(join(r.project, ".claude"))).toBe(false);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("x");
  });
  test("a plan (which only looks) leaves none either", async () => {
    const r = setup(makesFolder());
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "d1", goal: "g", model: "m", budgetUsd: 1 });
    expect(existsSync(join(r.project, ".claude"))).toBe(false);
  });
  test("the person's own .claude folder and its files are never touched", async () => {
    const r = setup(makesFolder({ "scratch.txt": "from the engine" }), { "launch.json": '{"mine":true}' });
    await r.runner.handle({ v: 1, id: "1", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "Make the heading blue", model: "m", budgetUsd: 1 });
    expect(readFileSync(join(r.project, ".claude", "launch.json"), "utf8")).toBe('{"mine":true}');
  });
  test("a .claude folder with something in it that the task made is left for the person to see", async () => {
    const r = setup(makesFolder({ "notes.md": "n" }));
    await r.runner.handle({ v: 1, id: "1", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "Make the heading blue", model: "m", budgetUsd: 1 });
    expect(existsSync(join(r.project, ".claude", "notes.md"))).toBe(true);
  });
  test("it is also removed when the task ends in an error", async () => {
    const engine: Engine = { executesTools: true, async *start(o) { mkdirSync(join(o.project, ".claude")); throw new Error("boom"); yield { costUsd: 0 }; } };
    const r = setup(engine);
    await r.runner.handle({ v: 1, id: "1", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
    expect(existsSync(join(r.project, ".claude"))).toBe(false);
  });
});
