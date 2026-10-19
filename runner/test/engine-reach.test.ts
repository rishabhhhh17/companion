// Claude out of reach (HeyClicky v1.0.53 parity, M11): a dropped connection (no network, a name that does not resolve, a
// timeout) or a busy Claude is named as that, so the card can say it in plain words with Try again, never as a problem
// with the project or the key. Before this, a turn that Claude Code ended on an API error came back as a "success" with
// is_error set, and the task ended as done with nothing changed. These use a fake `query`: they prove the wiring, not what
// Claude Code really sends with the Wi-Fi off ([verify] on a real Mac, which costs nothing: no request reaches Anthropic).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SdkEngine } from "../src/sdkEngine.ts";
import { outOfReach } from "../src/reach.ts";
import { AgentRunner } from "../src/agent.ts";
import { EngineStop, type Turn } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { retryPrompt } from "../src/followup.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-reach-${l}-`))); made.push(d); return d; };
const authorize = async () => ({ allow: true, reason: "" });
const fake = (messages: any[]) => (_p: any) => (async function* () { for (const m of messages) yield m; })();
const assistant = (text: string, extra: Record<string, unknown> = {}) => ({ type: "assistant", session_id: "s1", message: { id: `m${text.length}`, content: [{ type: "text", text }] }, ...extra });
const toolUse = () => ({ type: "assistant", session_id: "s1", message: { id: "mt", content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.txt" } }] } });
const apiError = (text: string, status: number | null | undefined, kind = "unknown") => [
  assistant(text, { error: kind }),
  { type: "result", subtype: "success", session_id: "s1", is_error: true, ...(status === undefined ? {} : { api_error_status: status }), result: text, total_cost_usd: 0 },
];
async function drain(messages: any[]): Promise<{ turns: Turn[]; error?: unknown }> {
  const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fake(messages) as never });
  const turns: Turn[] = [];
  try { for await (const t of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize, budgetUsd: 1 })) turns.push(t); }
  catch (error) { return { turns, error }; }
  return { turns };
}

describe("which failures mean Claude could not be reached", () => {
  test("no answer at all, with a connection error, a name that does not resolve, or a timeout", () => {
    expect(outOfReach({ status: null, text: "API Error: Connection error." })).toBe("no_connection");
    expect(outOfReach({ text: "getaddrinfo ENOTFOUND api.anthropic.com" })).toBe("no_connection");
    expect(outOfReach({ text: "connect ECONNREFUSED 127.0.0.1:443" })).toBe("no_connection");
    expect(outOfReach({ status: null, text: "API Error: Request timed out." })).toBe("no_connection");
    expect(outOfReach({ text: "fetch failed" })).toBe("no_connection");
    expect(outOfReach({ status: null, text: "socket hang up" })).toBe("no_connection");
  });
  test("Claude busy or having trouble on Anthropic's side", () => {
    expect(outOfReach({ status: 529, text: "Overloaded" })).toBe("claude_busy");
    expect(outOfReach({ kind: "overloaded", text: "API Error" })).toBe("claude_busy");
    expect(outOfReach({ status: 500, text: "Internal server error" })).toBe("claude_busy");
    expect(outOfReach({ status: 503, text: "x" })).toBe("claude_busy");
    expect(outOfReach({ kind: "server_error", text: "x" })).toBe("claude_busy");
  });
  test("a problem with the key, the account or the request is not called a connection problem", () => {
    expect(outOfReach({ status: 401, text: "invalid x-api-key" })).toBeNull();
    expect(outOfReach({ kind: "authentication_failed", status: null, text: "Invalid API key" })).toBeNull();
    expect(outOfReach({ kind: "billing_error", text: "Your credit balance is too low" })).toBeNull();
    expect(outOfReach({ status: 400, text: "prompt is too long" })).toBeNull();
    expect(outOfReach({ status: 429, kind: "rate_limit", text: "rate limited" })).toBeNull();
    expect(outOfReach({ text: "the request was aborted" })).toBeNull();
  });
});

describe("the engine names it", () => {
  test("a turn that ended on a dropped connection stops the round as no_connection, with what it cost", async () => {
    const r = await drain(apiError("API Error: Connection error.", null));
    expect(r.error).toBeInstanceOf(EngineStop);
    expect((r.error as Error).message).toMatch(/^no_connection\b/);
  });
  test("Claude Code's own error message is never taken for the agent's words", async () => {
    const r = await drain(apiError("API Error: Connection error.", null));
    expect(r.turns.filter((t) => t.text).length).toBe(0);
  });
  test("an overloaded Claude stops the round as claude_busy", async () => {
    const r = await drain(apiError("API Error: 529 Overloaded", 529, "overloaded"));
    expect((r.error as Error).message).toMatch(/^claude_busy\b/);
  });
  test("any other API error still stops the round, never ending it as done", async () => {
    const r = await drain(apiError("API Error: 401 invalid x-api-key", 401, "authentication_failed"));
    expect(r.error).toBeInstanceOf(EngineStop);
    expect((r.error as Error).message).not.toMatch(/^(no_connection|claude_busy)\b/);
  });
  test("a run that stopped during execution on a connection error is named the same", async () => {
    const r = await drain([{ type: "result", subtype: "error_during_execution", session_id: "s1", is_error: true, errors: ["Connection error."], total_cost_usd: 0 }]);
    expect((r.error as Error).message).toMatch(/^no_connection\b/);
  });
  test("a limit keeps its own name, whatever words come with it", async () => {
    const r = await drain([{ type: "result", subtype: "error_max_budget_usd", session_id: "s1", is_error: true, errors: ["timed out while the budget ran out"], total_cost_usd: 0.3 }]);
    expect((r.error as Error).message).toMatch(/^error_max_budget_usd\b/);
  });
  test("a reply cut at its output limit is still the agent's own words", async () => {
    const r = await drain([assistant("Here is the long answer", { error: "max_output_tokens" }), { type: "result", subtype: "success", session_id: "s1", is_error: false, total_cost_usd: 0.01 }]);
    expect(r.turns.some((t) => t.text === "Here is the long answer")).toBe(true);
  });
  test("a normal turn still works, and a tool call is marked, so the words before it are not the agent's last", async () => {
    const r = await drain([assistant("Let me look."), toolUse(), assistant("Done. The tests pass."), { type: "result", subtype: "success", session_id: "s1", is_error: false, total_cost_usd: 0.01 }]);
    expect(r.error).toBeUndefined();
    expect(r.turns.map((t) => (t.text ? "text" : t.usedTool ? "tool" : "cost"))).toEqual(["text", "tool", "text", "cost"]);
  });
});

describe("the runner says so, and Try again is there", () => {
  test("the task ends as no_connection, with a receipt, and the last attempt is said truly when tried again", async () => {
    const project = tmp("p");
    writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    let n = 0;
    const engine = { executesTools: true, async *start(o: any): AsyncGenerator<Turn, void, any> { n++; if (n === 1) throw new EngineStop("no_connection: Companion could not reach Claude (API Error: Connection error.)"); yield { text: `again: ${o.prompt}`, costUsd: 0 }; } };
    const log = new TaskLog(":memory:");
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: engine as never, log, emit: (e) => events.push(e) });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "fix it", model: "m", budgetUsd: 1 });
    const err = events.find((e) => e.type === "protocol.error") as any;
    expect(err.reason).toMatch(/^no_connection\b/);
    expect(log.list()[0].status).toBe("no_connection");
    expect(events.some((e) => e.type === "receipt")).toBe(true);
    expect((events.filter((e) => e.type === "agent.state") as any[]).at(-1).state).toBe("error");
    const texts: string[] = [];
    const runner2 = runner;
    await runner2.handle({ v: 1, id: "r", type: "agent.send", agent: "a1", project, retry: true });
    for (const e of events) if (e.type === "receipt") texts.push(String((e as any).said ?? ""));
    expect(texts.at(-1)).toMatch(/connection to Claude dropped/);
  });
  test("the Try again words for each ending", () => {
    expect(retryPrompt("fix it", "no_connection")).toMatch(/connection to Claude dropped/);
    expect(retryPrompt("fix it", "claude_busy")).toMatch(/Claude was busy/);
  });
});

describe("after Stop", () => {
  test("an error the stop itself caused is not named as Claude out of reach, and does not throw", async () => {
    const ac = new AbortController();
    const q = (_p: any) => (async function* () { ac.abort(); yield { type: "result", subtype: "success", session_id: "s1", is_error: true, api_error_status: null, result: "API Error: Connection error.", total_cost_usd: 0 }; })();
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q as never });
    const turns: Turn[] = [];
    for await (const t of e.start({ prompt: "p", project: "/p", model: "m", signal: ac.signal, authorize, budgetUsd: 1 })) turns.push(t);
    expect(turns.length).toBe(1);
  });
});
