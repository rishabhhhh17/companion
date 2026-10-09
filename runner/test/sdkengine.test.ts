// The real engine wraps Anthropic's Agent SDK. These tests use a fake `query` function,
// so they cost nothing and prove our wiring, not Claude. A real run is still owed (UNPROVEN).
import { afterEach, describe, expect, test } from "bun:test";
import { accessSync, constants, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSdkOptions, resolveClaudeBinary, SdkEngine } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-sdk-${l}-`))); made.push(d); return d; };
const base = { project: "/p", model: "claude-sonnet-5-5", budgetUsd: 3, claudeBinary: "/x/claude", env: { PATH: "/usr/bin" }, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal };

describe("what Companion remembers reaches the agent", () => {
  test("it is added to the instructions, as background that the request outranks", () => {
    const o: any = buildSdkOptions({ ...base, memory: "- Prefers short answers" });
    expect(o.systemPrompt.append).toContain("Prefers short answers");
    expect(o.systemPrompt.append).toMatch(/follow what they ask now/);
  });
  test("with no memory the instructions are as before", () => {
    const o: any = buildSdkOptions(base);
    expect(o.systemPrompt.append).not.toMatch(/remembers/);
  });
  test("Claude Code's own hidden memory stays off", () => expect(JSON.stringify(buildSdkOptions(base).env)).not.toContain("AUTO_MEMORY=0"));
});

describe("the options we hand to the SDK", () => {
  const o: any = buildSdkOptions(base);
  test("never bypasses permissions", () => {
    expect(JSON.stringify(o)).not.toContain("bypassPermissions");
    expect(o.allowDangerouslySkipPermissions).toBeUndefined();
    expect(o.permissionMode).toBe("acceptEdits");
  });
  test("runs only the binary we name, never one found on PATH", () => expect(o.pathToClaudeCodeExecutable).toBe("/x/claude"));
  test("loads no settings files and no outside connectors", () => {
    expect(o.settingSources).toEqual([]);
    expect(o.strictMcpConfig).toBe(true);
    expect(o.mcpServers ?? {}).toEqual({});
  });
  test("passes our own environment, in full, as the whole environment", () => expect(o.env).toEqual({ PATH: "/usr/bin" }));
  test("sets the spending limit, turn limit, folder and checkpointing", () => {
    expect(o.maxBudgetUsd).toBe(3);
    expect(o.maxTurns).toBeGreaterThan(0);
    expect(o.cwd).toBe("/p");
    expect(o.model).toBe("claude-sonnet-5-5");
    expect(o.enableFileCheckpointing).toBe(true);
  });
  test("denies sudo in the rules as well as in our hook", () => expect(o.disallowedTools).toContain("Bash(sudo *)"));
  test("the sandbox is on and commands cannot escape it", () => expect(o.sandbox).toMatchObject({ enabled: true, allowUnsandboxedCommands: false }));
  test("the fallback permission prompt never approves by itself", async () => {
    const r = await o.canUseTool("Bash", { command: "ls" }, {});
    expect(r.behavior).toBe("deny");
  });
});

describe("the safety hook is the gate", () => {
  test("it asks our runner and passes the answer back to the SDK", async () => {
    const calls: string[] = [];
    const o: any = buildSdkOptions({ ...base, authorize: async (t) => { calls.push(t.name); return t.name === "Bash" ? { allow: false, reason: "no" } : { allow: true, reason: "" }; } });
    const hook = o.hooks.PreToolUse[0].hooks[0];
    const deny = await hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git push" }, tool_use_id: "t1" }, "t1", { signal: new AbortController().signal });
    expect(deny.hookSpecificOutput).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: expect.stringContaining("no") });
    const ok = await hook({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "a" }, tool_use_id: "t2" }, "t2", { signal: new AbortController().signal });
    expect(ok.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(calls).toEqual(["Bash", "Write"]);
  });
  test("if our runner throws, the tool is denied, not allowed", async () => {
    const o: any = buildSdkOptions({ ...base, authorize: async () => { throw new Error("boom"); } });
    const r = await o.hooks.PreToolUse[0].hooks[0]({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {}, tool_use_id: "t" }, "t", { signal: new AbortController().signal });
    expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});

describe("the engine wrapper", () => {
  const fakeQuery = (messages: any[], hookCalls: { name: string; input: any }[] = []) => (params: any) => (async function* () {
    for (const h of hookCalls) await params.options.hooks.PreToolUse[0].hooks[0]({ hook_event_name: "PreToolUse", tool_name: h.name, tool_input: h.input, tool_use_id: "t" }, "t", { signal: params.options.abortController.signal });
    for (const m of messages) yield m;
  })();
  const assistant = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
  const result = (usd: number, subtype = "success") => ({ type: "result", subtype, total_cost_usd: usd, is_error: subtype !== "success" });

  test("turns SDK messages into turns, with cost as the change since the last result", async () => {
    const e = new SdkEngine({ claudeBinary: "/x/claude", queryFn: fakeQuery([assistant("hi"), result(0.02), assistant("more"), result(0.05)]) as any, env: {} });
    const turns = [];
    for await (const t of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: base.authorize, budgetUsd: 3 } as any)) turns.push(t);
    expect(turns.map((t) => t.costUsd)).toEqual([0, 0.02, 0, 0.03]);
    expect(turns.filter((t) => t.text).map((t) => t.text)).toEqual(["hi", "more"]);
  });
  test("a budget stop from the SDK surfaces as error_max_budget_usd", async () => {
    const e = new SdkEngine({ claudeBinary: "/x/claude", queryFn: fakeQuery([result(0.06, "error_max_budget_usd")]) as any, env: {} });
    await expect((async () => { for await (const _ of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: base.authorize, budgetUsd: 0.05 } as any)) { /* drain */ } })()).rejects.toThrow(/error_max_budget_usd/);
  });
  test("the runner works end to end with it: tool judged by the hook, receipt and log written", async () => {
    const project = tmp("proj");
    const events: Event[] = [];
    const seen: string[] = [];
    const engine = new SdkEngine({
      claudeBinary: "/x/claude", env: {},
      queryFn: fakeQuery([assistant("working"), result(0.04)], [{ name: "Write", input: { file_path: join(project, "../outside.txt") } }, { name: "Bash", input: { command: "git push" } }]) as any,
    });
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => { events.push(e); seen.push(e.type); }, approvalTimeoutMs: 20 });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "do it", model: "m", budgetUsd: 3 });
    const tools = events.filter((e) => e.type === "agent.tool").map((e: any) => e.outcome);
    expect(tools).toContain("blocked");
    expect(tools).toContain("needs_approval");
    expect(seen).toContain("approval.request");
    expect(seen).toContain("receipt");
    expect(existsSync(join(project, "../outside.txt"))).toBe(false);
  });
});

describe("the SDK's own Claude binary", () => {
  test("is found inside the pinned SDK package and is executable", () => {
    const p = resolveClaudeBinary();
    expect(p).toContain("claude-agent-sdk-");
    expect(existsSync(p)).toBe(true);
    accessSync(p, constants.X_OK);
  });
  test("an override path is used only if given, and a missing one is an error", () => {
    expect(resolveClaudeBinary("/bin/ls")).toBe("/bin/ls");
    expect(() => resolveClaudeBinary("/nope/claude")).toThrow(/not found/i);
  });
});
