// Background commands. In the pinned SDK (0.3.293) a background command is stopped with the TaskStop tool (KillShell and
// KillBash are its old names), and its output is read with the Read tool from Claude Code's own output file (the
// BashOutput and TaskOutput tools were removed). Stopping or reading a command this task started is safe; anything else
// still asks, and a tool nobody knows still asks.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, evaluateReadOnly } from "../src/safety.ts";
import { AgentRunner, type ToolExecutor } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { buildSdkOptions, SdkEngine } from "../src/sdkEngine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-shells-${l}-`))); made.push(d); return d; };

const P = "/Users/me/site";
const OUT = "/private/tmp/claude-501/-Users-me-site/0c3f9a1e-1111-2222-3333-444455556666/tasks/b7k2p9.output";
const started = { shells: new Set(["b7k2p9"]) };
const ctx = { project: P, started };
const v = (tool: string, input: Record<string, unknown>, c: Parameters<typeof evaluate>[1] = ctx) => evaluate({ tool, input }, c);

describe("stopping a background command", () => {
  test("one this task started is allowed, by its id", () => expect(v("TaskStop", { task_id: "b7k2p9" }).decision).toBe("allow"));
  test("the old field name works too", () => expect(v("TaskStop", { shell_id: "b7k2p9" }).decision).toBe("allow"));
  test("the old tool names are the same tool", () => {
    expect(v("KillShell", { shell_id: "b7k2p9" }).decision).toBe("allow");
    expect(v("KillBash", { shell_id: "b7k2p9" }).decision).toBe("allow");
  });
  test("one this task did not start asks", () => {
    const r = v("TaskStop", { task_id: "someone-else" });
    expect(r.decision).toBe("ask");
    expect(r.reason).toMatch(/did not start/);
  });
  test("no id asks", () => expect(v("TaskStop", {}).decision).toBe("ask"));
  test("without a record of what the task started, it asks", () => expect(v("TaskStop", { task_id: "b7k2p9" }, { project: P }).decision).toBe("ask"));
  test("in a part of Companion that only looks, it is refused", () => expect(evaluateReadOnly({ tool: "TaskStop", input: { task_id: "x" } }, { project: P }).decision).toBe("deny"));
});

describe("reading a background command's output", () => {
  test("its own output file is allowed", () => expect(v("Read", { file_path: OUT }).decision).toBe("allow"));
  test("another command's output file asks", () => expect(v("Read", { file_path: OUT.replace("b7k2p9", "zz9") }).decision).toBe("ask"));
  test("a file with the right name in the wrong folder asks", () => {
    expect(v("Read", { file_path: "/etc/b7k2p9.output" }).decision).toBe("ask");
    expect(v("Read", { file_path: "/Users/me/.ssh/tasks/b7k2p9.txt" }).decision).toBe("ask");
  });
  test("a path that climbs out of the folder asks", () => expect(v("Read", { file_path: "/private/tmp/x/tasks/../../../etc/tasks/b7k2p9.output/../passwd" }).decision).toBe("ask"));
  test("a relative path is only a file in the project, judged like any other", () => {
    expect(v("Read", { file_path: "tasks/b7k2p9.output" }).decision).toBe("allow");
    expect(v("Read", { file_path: "../../tasks/b7k2p9.output" }).decision).toBe("ask");
  });
  test("without a record of what the task started, it asks as any outside read does", () => expect(v("Read", { file_path: OUT }, { project: P }).decision).toBe("ask"));
  test("the old BashOutput and TaskOutput tools follow the same rule", () => {
    expect(v("BashOutput", { bash_id: "b7k2p9" }).decision).toBe("allow");
    expect(v("TaskOutput", { task_id: "b7k2p9" }).decision).toBe("allow");
    expect(v("BashOutput", { bash_id: "nope" }).decision).toBe("ask");
    expect(v("BashOutput", {}).decision).toBe("ask");
  });
});

describe("a tool nobody knows still asks", () => {
  for (const t of ["MadeUpTool", "Kill", "Shell", "TaskStopAll", "mcp__x__kill"]) test(t, () => {
    const r = v(t, { task_id: "b7k2p9" });
    expect(r.decision).toBe("ask");
    expect(r.reason).toContain("unknown tool");
  });
});

// The runner learns which background commands a task started from the command's own result.
describe("in a real task", () => {
  const step = (name: string, input: Record<string, unknown>): Step => ({ tool: { name, input }, costUsd: 0 });
  test("a task can stop the background command it started, without a card; another one still asks", async () => {
    const project = tmp("proj");
    const events: Event[] = [];
    const exec: ToolExecutor = async (call) => call.name === "Bash" && call.input.run_in_background ? { ok: true, output: "Command running in background with ID: b7k2p9", shell: { backgroundId: "b7k2p9" } } : { ok: true, output: "" };
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([step("Bash", { command: "npm run dev", run_in_background: true }), step("TaskStop", { task_id: "b7k2p9" }), step("TaskStop", { task_id: "other" })]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), executor: exec, approvalTimeoutMs: 30 });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    const lines = events.filter((e) => e.type === "agent.tool").map((e: any) => `${e.tool}:${e.outcome}`);
    expect(lines).toEqual(["Bash:ran", "TaskStop:ran", "TaskStop:needs_approval", "TaskStop:denied"]);
  });

  test("what one task started is not remembered for the next task", async () => {
    const project = tmp("proj");
    const events: Event[] = [];
    const exec: ToolExecutor = async (call) => call.name === "Bash" ? { ok: true, output: "", shell: { backgroundId: "b7k2p9" } } : { ok: true, output: "" };
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([[step("Bash", { command: "npm run dev", run_in_background: true })], [step("TaskStop", { task_id: "b7k2p9" })]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), executor: exec, approvalTimeoutMs: 30 });
    const go = () => runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    await go(); await go();
    expect(events.filter((e) => e.type === "agent.tool").map((e: any) => `${e.tool}:${e.outcome}`)).toEqual(["Bash:ran", "TaskStop:needs_approval", "TaskStop:denied"]);
  });

  test("with the real engine, the id comes from the command's result in the after-tool hook", async () => {
    const project = tmp("proj");
    const events: Event[] = [];
    const outFile = `/private/tmp/claude-501/p/0c3f9a1e-1111-2222-3333-444455556666/tasks/b7k2p9.output`;
    const queryFn = (params: any) => (async function* () {
      const pre = params.options.hooks.PreToolUse[0].hooks[0], post = params.options.hooks.PostToolUse[0].hooks[0];
      const sig = { signal: params.options.abortController.signal };
      await pre({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm run dev", run_in_background: true }, tool_use_id: "t1" }, "t1", sig);
      await post({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm run dev", run_in_background: true }, tool_response: { stdout: "", stderr: "", interrupted: false, backgroundTaskId: "b7k2p9" }, tool_use_id: "t1" }, "t1", sig);
      const read = await pre({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: outFile }, tool_use_id: "t2" }, "t2", sig);
      const stop = await pre({ hook_event_name: "PreToolUse", tool_name: "TaskStop", tool_input: { task_id: "b7k2p9" }, tool_use_id: "t3" }, "t3", sig);
      decisions.push(read.hookSpecificOutput.permissionDecision, stop.hookSpecificOutput.permissionDecision);
      yield { type: "result", subtype: "success", total_cost_usd: 0 };
    })();
    const decisions: string[] = [];
    const engine = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: queryFn as any });
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 30 });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    expect(decisions).toEqual(["allow", "allow"]);
    expect(events.some((e) => e.type === "approval.request")).toBe(false);
  });

  test("the after-tool hook passes on only a background id, and only from a shell command", () => {
    const seen: unknown[] = [];
    const o: any = buildSdkOptions({ project: "/p", model: "m", budgetUsd: 1, claudeBinary: "/x", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal, toolDone: (id, shell) => seen.push([id, shell]) });
    const post = o.hooks.PostToolUse[0].hooks[0];
    void post({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: { stdout: "x", backgroundTaskId: "b1", extra: "ignored" }, tool_use_id: "t1" }, "t1");
    void post({ hook_event_name: "PostToolUse", tool_name: "Write", tool_input: {}, tool_response: { backgroundTaskId: "b2" }, tool_use_id: "t2" }, "t2");
    void post({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: { backgroundTaskId: "has a space/and slash" }, tool_use_id: "t3" }, "t3");
    void post({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: {}, error: "boom", tool_use_id: "t4" }, "t4");
    void post({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: "text only", tool_use_id: "t5" }, "t5");
    expect(seen).toEqual([["t1", { backgroundId: "b1" }], ["t2", undefined], ["t3", undefined], ["t4", undefined], ["t5", undefined]]);
  });
});
