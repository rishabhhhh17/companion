// The engine is given exactly the built in tools Companion uses (tools.ts), so a request carries only their definitions.
// Every other built in tool of the pinned SDK (0.3.293) is refused in the safety hook with a plain reason, never shown to
// the person as an approval card about an "unknown tool" (HeyClicky v1.0.53 parity, M11). The real run harness checks
// system/init against the same lists.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIVEN_TOOLS, LOOK_TOOLS, RESEARCH_TOOLS, TASK_TOOLS, toolsFor } from "../src/tools.ts";
import { evaluate, evaluateReadOnly } from "../src/safety.ts";
import { buildSdkOptions, SdkEngine } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { AGENT_TOOLS, checkInit, checkOptions } from "../scripts/realrun-harness.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-tools-${l}-`))); made.push(d); return d; };
const base = { project: "/p", model: "claude-sonnet-5-5", budgetUsd: 3, claudeBinary: "/x/claude", env: { PATH: "/usr/bin" }, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal };
const P = "/Users/me/site";

// Built in tools the pinned SDK has (sdk-tools.d.ts, and the names its bundled binary uses) that Companion never gives.
// SlashCommand is the old name of Skill, kept in case an older Claude still asks for it.
const NOT_OURS = [
  "AskUserQuestion", "EnterPlanMode", "Skill", "SlashCommand", "Monitor", "TaskCreate", "TaskGet", "TaskUpdate", "TaskList",
  "Workflow", "CronCreate", "CronDelete", "CronList", "ScheduleWakeup", "RemoteTrigger", "PushNotification", "EnterWorktree", "ExitWorktree",
  "ListMcpResourcesTool", "ReadMcpResourceTool", "ReadMcpResourceDirTool", "RefreshMcpTools", "SendFeedback", "ReportFindings", "ClaudeDesign",
  "ProposeSkills", "ProposeGoal", "OfferChromeSetup", "ReadNotifications", "ShowOnboardingRolePicker", "Artifact", "Projects", "SendUserMessage",
  "LSP", "EndConversation",
];

describe("the tools each kind of work is given", () => {
  test("a task: reading, searching, changing files, commands, stopping its own background command, the web and a to do list", () => {
    expect([...TASK_TOOLS].sort()).toEqual(["Bash", "Edit", "Glob", "Grep", "Read", "TaskStop", "TodoWrite", "ToolSearch", "WebFetch", "WebSearch", "Write"]);
  });
  test("planning and Rescue only look; Research looks and uses the web", () => {
    expect([...LOOK_TOOLS].sort()).toEqual(["ExitPlanMode", "Glob", "Grep", "Read", "TodoWrite"]);
    expect([...RESEARCH_TOOLS].sort()).toEqual(["ExitPlanMode", "Glob", "Grep", "Read", "TodoWrite", "ToolSearch", "WebFetch", "WebSearch"]);
    for (const t of ["Edit", "Write", "Bash", "TaskStop"]) { expect(LOOK_TOOLS as readonly string[]).not.toContain(t); expect(RESEARCH_TOOLS as readonly string[]).not.toContain(t); }
  });
  test("none of them is a sub agent, Claude's own question box or a notebook editor; planning has no tool finder", () => {
    for (const t of ["Agent", "Task", "AskUserQuestion", "NotebookEdit", "EnterPlanMode"]) expect(GIVEN_TOOLS, t).not.toContain(t);
    expect(LOOK_TOOLS as readonly string[]).not.toContain("ToolSearch");
  });
  test("an explicit list wins; otherwise planning gets the looking tools and a task the task tools", () => {
    expect(toolsFor({})).toEqual([...TASK_TOOLS]);
    expect(toolsFor({ planOnly: true })).toEqual([...LOOK_TOOLS]);
    expect(toolsFor({ planOnly: true, tools: [] })).toEqual([]);
    expect(toolsFor({ tools: RESEARCH_TOOLS })).toEqual([...RESEARCH_TOOLS]);
  });
});

describe("the request names exactly those tools", () => {
  test("a task's options list the task tools, not the whole Claude Code set", () => {
    const o: any = buildSdkOptions(base);
    expect(Array.isArray(o.tools)).toBe(true);
    expect(o.tools).toEqual([...TASK_TOOLS]);
  });
  test("a plan's options list only the looking tools", () => expect((buildSdkOptions({ ...base, planOnly: true }) as any).tools).toEqual([...LOOK_TOOLS]));
  test("the engine passes the list it is told", async () => {
    let seen: any;
    const q = (p: any) => (async function* () { seen = p.options; yield { type: "result", subtype: "success", total_cost_usd: 0, is_error: false }; })();
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q as never });
    for await (const _ of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: base.authorize, budgetUsd: 1, planOnly: true, tools: RESEARCH_TOOLS })) { /* drain */ }
    expect(seen.tools).toEqual([...RESEARCH_TOOLS]);
  });
});

describe("the runner tells the engine which tools each flow gets", () => {
  const setup = (rounds: any[][]) => {
    const project = tmp("p");
    writeFileSync(join(project, "a.txt"), "x");
    const engine = new ScriptedEngine(rounds);
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
    return { project, engine, runner, events };
  };
  test("a task gets the task tools", async () => {
    const r = setup([[{ text: "Nothing to change.", costUsd: 0 }]]);
    await r.runner.handle({ v: 1, id: "c", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "look", model: "m", budgetUsd: 1 });
    expect(r.engine.calls[0].tools).toEqual([...TASK_TOOLS]);
  });
  test("a plan gets the looking tools", async () => {
    const r = setup([[{ text: '["Add the prices section"]', costUsd: 0 }]]);
    await r.runner.handle({ v: 1, id: "c", type: "drive.plan", project: r.project, agent: "a1", goal: "add prices", model: "m", budgetUsd: 1 } as never);
    expect(r.engine.calls[0].planOnly).toBe(true);
    expect(r.engine.calls[0].tools).toEqual([...LOOK_TOOLS]);
  });
  test("a plan that asks for Claude's own question box is told, in plain words, to ask in its final message", async () => {
    const project = tmp("p");
    const got: string[] = [];
    const engine = { executesTools: false, async *start(): AsyncGenerator<any, void, any> { const r: any = yield { tool: { name: "AskUserQuestion", input: { questions: [] } }, costUsd: 0 }; got.push(String(r?.output ?? "")); yield { text: '["Add the prices section"]', costUsd: 0 }; } };
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: engine as never, log: new TaskLog(":memory:"), emit: () => {} });
    await runner.handle({ v: 1, id: "c", type: "drive.plan", project, agent: "a1", goal: "add prices", model: "m", budgetUsd: 1 } as never);
    expect(got[0]).toMatch(/final message/);
    expect(got[0]).not.toMatch(/only look/);
  });
  test("research gets the looking tools and the web", async () => {
    const r = setup([[{ text: "nothing useful", costUsd: 0 }]]);
    await r.runner.handle({ v: 1, id: "c", type: "research.ask", project: r.project, agent: "a1", question: "How do I take payments?", model: "m", budgetUsd: 1 });
    expect(r.engine.calls[0].tools).toEqual([...RESEARCH_TOOLS]);
  });
});

describe("a built in tool Companion does not give is refused in plain words, never an unknown tool card", () => {
  for (const t of NOT_OURS) test(t, () => {
    const r = evaluate({ tool: t, input: {} }, { project: P });
    expect(r.decision).toBe("deny");
    expect(r.reason).not.toMatch(/unknown tool/);
    expect(r.reason).toMatch(/^[A-Z][^\n]{10,300}\.$/);
    // Plan and Rescue give the same plain reason, not "unknown tool ... This part of Companion only looks".
    expect(evaluateReadOnly({ tool: t, input: {} }, { project: P }).reason).toBe(r.reason);
  });
  test("Claude's own question box: finish what it can, then ask one short question in its final message", () => {
    const r = evaluate({ tool: "AskUserQuestion", input: { questions: [{ question: "Which colour?" }] } }, { project: P });
    expect(r.reason).toMatch(/final message/);
    expect(r.reason).toMatch(/one short question/);
  });
  test("names that are only on every object are never allowed, and never read a reason off the object", () => {
    for (const t of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const r = evaluate({ tool: t, input: {} }, { project: P });
      expect(r.decision, t).not.toBe("allow");
      expect(typeof r.reason, t).toBe("string");
    }
  });
  test("every tool Companion gives is judged by its own rule, never as unknown", () => {
    const input: Record<string, Record<string, unknown>> = { Read: { file_path: "a.txt" }, Grep: { pattern: "x" }, Glob: { pattern: "*.js" }, Edit: { file_path: "a.txt" }, Write: { file_path: "a.txt" }, Bash: { command: "ls" }, TaskStop: { task_id: "x" }, WebFetch: { url: "https://example.com/" } };
    for (const t of GIVEN_TOOLS) expect(evaluate({ tool: t, input: input[t] ?? {} }, { project: P }).reason, t).not.toMatch(/unknown tool/);
  });
});

describe("the real run harness checks the same list", () => {
  test("AGENT_TOOLS is exactly what Companion gives", () => expect([...AGENT_TOOLS].sort()).toEqual([...GIVEN_TOOLS].sort()));
  const init = (tools: string[]) => ({ type: "system", subtype: "init", tools, mcp_servers: [], plugins: [], apiKeySource: "ANTHROPIC_API_KEY", permissionMode: "acceptEdits" });
  test("system/init listing a tool Companion does not give stops the run", () => {
    for (const t of ["Agent", "Task", "AskUserQuestion", "Skill", "Monitor", "TaskCreate", "EnterPlanMode", "NotebookEdit", "EndConversation"]) expect(checkInit(init(["Read", t]), { tools: "agent" }).join(" "), t).toMatch(new RegExp(t));
    expect(checkInit(init([...TASK_TOOLS]), { tools: "agent" })).toEqual([]);
  });
  test("an agent session that does not name its tools, or names one more, is not started", () => {
    const ok: any = buildSdkOptions({ ...base, env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1", CLAUDE_CONFIG_DIR: "/tmp/cfg", ANTHROPIC_API_KEY: "k" } });
    const ex = { claudeBinary: "/x/claude", configDirs: ["/tmp/cfg"], tools: "agent" as const };
    expect(checkOptions(ok, ex)).toEqual([]);
    expect(checkOptions({ ...ok, tools: undefined }, ex).join(" ")).toMatch(/tools/);
    expect(checkOptions({ ...ok, tools: { type: "preset", preset: "claude_code" } }, ex).join(" ")).toMatch(/tools/);
    expect(checkOptions({ ...ok, tools: [...TASK_TOOLS, "Agent"] }, ex).join(" ")).toMatch(/Agent/);
    // A lane with no tools stays a lane with no tools.
    expect(checkOptions({ ...ok, tools: ["Read"] }, { ...ex, tools: [] }).join(" ")).toMatch(/Read/);
  });
});
