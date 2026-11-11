// Must fix 29 (M59): the runner has no unsandboxed tool runner to fall back to. An engine that does not run tools itself (an
// engine of our own loop, F29) cannot be used without an executor; the real Claude Code runs its own tools; only the
// scripted test engine carries the plain test runner, and a test may pass it in. Nothing here runs a model.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as agent from "../src/agent.ts";
import { AgentRunner, NO_EXECUTOR, executorFor, noExecutor } from "../src/agent.ts";
import { ScriptedEngine, testToolRunner, type Engine, type Turn } from "../src/engine.ts";
import { createEngine, readSettings } from "../src/engines.ts";
import { TaskLog } from "../src/tasklog.ts";

const ownLoop: Engine = { executesTools: false, async *start(): AsyncGenerator<Turn, void, any> { yield { tool: { name: "Write", input: { file_path: "x.txt", content: "x" } }, costUsd: 0 }; } };

describe("no tool runner by default", () => {
  test("an engine that does not run tools itself and is given no executor cannot be used at all", () => {
    expect(() => new AgentRunner({ shadowRoot: "/nonexistent-shadow", engine: ownLoop, log: new TaskLog(":memory:"), emit: () => {} })).toThrow(NO_EXECUTOR);
    expect(() => executorFor({ engine: ownLoop })).toThrow(NO_EXECUTOR);
    // The words say what is missing, in plain language.
    expect(NO_EXECUTOR).toContain("sandboxed");
  });
  test("an engine that runs its own tools needs none, and the stand in throws if it is ever reached", async () => {
    const real: Engine = { executesTools: true, async *start() {} };
    expect(executorFor({ engine: real })).toBe(noExecutor);
    await expect(noExecutor({ name: "Bash", input: { command: "echo hi" } }, { project: "/tmp" })).rejects.toThrow(NO_EXECUTOR);
  });
  test("an executor passed in always wins, and the scripted test engine carries the test runner", () => {
    const mine = async () => ({ ok: true, output: "" });
    expect(executorFor({ engine: ownLoop, executor: mine })).toBe(mine);
    expect(executorFor({ engine: new ScriptedEngine([]) })).toBe(testToolRunner);
  });
  test("the old fallback is gone from the runner", () => {
    expect("defaultExecutor" in agent).toBe(false);
    const src = readFileSync(join(import.meta.dir, "../src/agent.ts"), "utf8");
    expect(src).not.toContain("?? defaultExecutor");
    expect(src).not.toMatch(/writeFileSync\(f, String\(i\.content/);
  });
  test("the program's engines: the real one runs its own tools, the scripted one is the test engine", () => {
    const sdk = createEngine({ ...readSettings({ COMPANION_DATA: "/tmp/x" } as never), engine: "sdk" } as never);
    expect(sdk.executesTools).toBe(true);
    expect(sdk.testToolRunner).toBeUndefined();
    const scripted = createEngine({ ...readSettings({ COMPANION_DATA: "/tmp/x" } as never), engine: "scripted", script: [] } as never);
    expect(scripted.testToolRunner).toBe(testToolRunner);
  });
  test("a test that passes the test runner in gets its tools run, on its own fixture folder", async () => {
    const project = realpathSync(mkdtempSync(join(tmpdir(), "companion-noexec-")));
    try {
      const r = await testToolRunner({ name: "Write", input: { file_path: "a.txt", content: "hi" } }, { project });
      expect(r.ok).toBe(true);
      expect(existsSync(join(project, "a.txt"))).toBe(true);
    } finally { rmSync(project, { recursive: true, force: true }); }
  });
});
