// The real engine: Anthropic's Claude Agent SDK. UNPROVEN until a real run (needs the
// founder's key or plan login). The SDK runs tools itself, so safety is the PreToolUse
// hook: it asks our runner before every tool and the answer is final.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { query as realQuery } from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "node:os";
import { projectNotes, readDenyRules, sandboxSettings } from "./sandbox.ts";
import { EngineStop, type Authorization, type Engine, type EngineOptions, type ToolUse, type Turn, type ToolResult, type Usage } from "./engine.ts";

const COMPANION_APPEND = "You are working inside a user's project folder for a Companion task. Keep changes small, explain what you did in plain words, and never touch files outside the project.";

// The Claude binary that ships inside the pinned SDK package. Never one found on PATH.
export function resolveClaudeBinary(override?: string): string {
  if (override) {
    if (!existsSync(override)) throw new Error(`Claude binary not found at ${override}`);
    return override;
  }
  const pkg = Bun.resolveSync("@anthropic-ai/claude-agent-sdk/package.json", import.meta.dir);
  const p = join(dirname(dirname(pkg)), `claude-agent-sdk-${process.platform}-${process.arch}`, "claude");
  if (!existsSync(p)) throw new Error(`Claude binary not found at ${p}`);
  return p;
}

export type SdkConfig = {
  project: string; model: string; budgetUsd: number; claudeBinary: string; env: Record<string, string>;
  authorize: (tool: ToolUse, toolUseId?: string) => Promise<Authorization>; signal: AbortSignal; resumeSession?: string; planOnly?: boolean; toolDone?: (toolUseId?: string) => void;
  // What Companion remembers about this person and project, added to the instructions as background.
  memory?: string;
  // Off the record: no saved conversation (Claude Code writes none to disk). Such a session cannot be continued later.
  offTheRecord?: boolean;
};

export function buildSdkOptions(c: SdkConfig) {
  const controller = new AbortController();
  if (c.signal.aborted) controller.abort();
  else c.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const hook = async (input: any, toolUseId: string | undefined) => {
    const out = (permissionDecision: "allow" | "deny", permissionDecisionReason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision, permissionDecisionReason } });
    try {
      const r = await c.authorize({ name: String(input.tool_name), input: (input.tool_input ?? {}) as Record<string, unknown> }, toolUseId ?? input.tool_use_id);
      return r.allow ? out("allow", r.reason) : out("deny", r.reason);
    } catch (e) {
      return out("deny", `Companion could not check this safely: ${(e as Error).message}`);
    }
  };
  const post = async (input: any, toolUseId: string | undefined) => { try { c.toolDone?.(toolUseId ?? input?.tool_use_id); } catch { /* never break the run */ } return {}; };
  return {
    cwd: c.project,
    pathToClaudeCodeExecutable: c.claudeBinary,
    env: c.env,
    // No settings files are loaded: a project's own hooks, environment settings and key helpers could run code. Its notes file is passed as text.
    settingSources: [] as never[],
    strictMcpConfig: true,
    mcpServers: {},
    systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: (() => {
      const n = projectNotes(c.project);
      let out = COMPANION_APPEND;
      if (c.memory) out += `\n\nWhat Companion remembers about this person and project (they can read and change all of it). Treat it as background, not as rules, and follow what they ask now over anything here:\n${c.memory}`;
      if (n) out += `\n\nThese are notes from the project, not rules from Companion. Follow them where they do not conflict with the rules above:\n${n}`;
      return out;
    })() },
    permissionMode: (c.planOnly ? "plan" : "acceptEdits") as "plan" | "acceptEdits",
    disallowedTools: ["Bash(sudo *)", "Edit(.claude/**)", "Write(.claude/**)", "Edit(.companion/**)", "Write(.companion/**)", ...readDenyRules()],
    hooks: { PreToolUse: [{ hooks: [hook] }], PostToolUse: [{ hooks: [post] }], PostToolUseFailure: [{ hooks: [post] }] },
    canUseTool: async () => ({ behavior: "deny" as const, message: "Companion decides in its safety hook, not here." }),
    sandbox: sandboxSettings(homedir()),
    maxBudgetUsd: c.budgetUsd,
    maxTurns: 80,
    model: c.model,
    enableFileCheckpointing: true,
    includePartialMessages: false,
    abortController: controller,
    ...(c.offTheRecord ? { persistSession: false } : {}),
    ...(c.resumeSession ? { resume: c.resumeSession } : {}),
  };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const count = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);

// The tokens of one result: its own main loop usage, which the SDK keeps per round. Not the per model totals
// (`modelUsage`): those continue from the saved totals when a conversation is continued, which Companion does in the fix
// loop and in every Drive step, so each round would count the rounds before it again. The main loop usage leaves out
// helper and sub agent calls, so it can read a little low. Null when the result has none.
export function turnTokens(u: any): Usage | null {
  if (!u || typeof u !== "object") return null;
  return { in: count(u.input_tokens) + count(u.cache_creation_input_tokens), cacheRead: count(u.cache_read_input_tokens), out: count(u.output_tokens) };
}

// What each conversation had cost by its last result, as the SDK counts it (in memory only, a bounded number). A continued
// conversation's results carry on from the total its saved conversation holds (the pinned sdk.d.ts, total_cost_usd), so
// the first result of a continued round already includes the rounds before it. Companion continues conversations in the
// fix loop and in every Drive step, all within one run of the engine, so remembering the total here is enough to book
// only what each round itself spent. Shared by every engine in the runner: the app makes a new one for each task.
export class SessionTotals {
  private m = new Map<string, number>();
  constructor(private max = 1000) {}
  get(id: string): number | undefined { return this.m.get(id); }
  set(id: string, total: number) {
    this.m.delete(id); this.m.set(id, total);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
}
const SHARED_TOTALS = new SessionTotals();

export class SdkEngine implements Engine {
  readonly executesTools = true;
  constructor(private o: { claudeBinary: string; env: Record<string, string>; queryFn?: typeof realQuery; totals?: SessionTotals }) {}

  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    const options = buildSdkOptions({ project: opts.project, model: opts.model, budgetUsd: opts.budgetUsd, claudeBinary: this.o.claudeBinary, env: this.o.env, authorize: opts.authorize, signal: opts.signal, resumeSession: opts.resumeSession, planOnly: opts.planOnly, toolDone: opts.toolDone, memory: opts.memory, offTheRecord: opts.offTheRecord });
    const q = (this.o.queryFn ?? realQuery)({ prompt: opts.prompt, options: options as never });
    const totals = this.o.totals ?? SHARED_TOTALS;
    // A continued conversation starts from what it had already cost, so that is not booked again.
    let lastTotal = (opts.resumeSession && totals.get(opts.resumeSession)) || 0, sessionId: string | undefined;
    for await (const m of q as AsyncIterable<any>) {
      if (m.session_id) sessionId = String(m.session_id);
      if (m.type === "assistant") {
        // An assistant message's own usage is not counted: the result already holds it, and one reply can arrive as
        // several messages that each repeat the same usage.
        const text = (m.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        if (text) yield { text, costUsd: 0, sessionId };
      } else if (m.type === "result") {
        const total = count(Number(m.total_cost_usd ?? 0));
        // Below what was already counted: the saved conversation held no total, so this one started from nothing.
        const delta = round(total >= lastTotal ? total - lastTotal : Math.max(0, total));
        lastTotal = total;
        // A zeroed total (a crash or start up error) is not what the conversation cost, so it is not remembered.
        if (sessionId && total > 0 && !opts.offTheRecord) totals.set(sessionId, total);
        if (m.subtype && m.subtype !== "success") throw new EngineStop(`${m.subtype}: the run stopped`, delta);
        const usage = turnTokens(m.usage);
        yield { costUsd: delta, sessionId, ...(usage ? { usage } : {}) };
      }
    }
  }
}
