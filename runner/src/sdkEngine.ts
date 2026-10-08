// The real engine: Anthropic's Claude Agent SDK. UNPROVEN until a real run (needs the
// founder's key or plan login). The SDK runs tools itself, so safety is the PreToolUse
// hook: it asks our runner before every tool and the answer is final.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { query as realQuery } from "@anthropic-ai/claude-agent-sdk";
import { EngineStop, type Authorization, type Engine, type EngineOptions, type ToolUse, type Turn, type ToolResult } from "./engine.ts";

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
  authorize: (tool: ToolUse, toolUseId?: string) => Promise<Authorization>; signal: AbortSignal; resumeSession?: string; planOnly?: boolean;
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
  return {
    cwd: c.project,
    pathToClaudeCodeExecutable: c.claudeBinary,
    env: c.env,
    settingSources: ["project"] as const,
    strictMcpConfig: true,
    mcpServers: {},
    systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: COMPANION_APPEND },
    permissionMode: (c.planOnly ? "plan" : "acceptEdits") as "plan" | "acceptEdits",
    disallowedTools: ["Bash(sudo *)"],
    hooks: { PreToolUse: [{ hooks: [hook] }] },
    canUseTool: async () => ({ behavior: "deny" as const, message: "Companion decides in its safety hook, not here." }),
    sandbox: { enabled: process.platform === "darwin", allowUnsandboxedCommands: false },
    maxBudgetUsd: c.budgetUsd,
    maxTurns: 80,
    model: c.model,
    enableFileCheckpointing: true,
    includePartialMessages: false,
    abortController: controller,
    ...(c.resumeSession ? { resume: c.resumeSession } : {}),
  };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export class SdkEngine implements Engine {
  readonly executesTools = true;
  constructor(private o: { claudeBinary: string; env: Record<string, string>; queryFn?: typeof realQuery }) {}

  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    const options = buildSdkOptions({ project: opts.project, model: opts.model, budgetUsd: opts.budgetUsd, claudeBinary: this.o.claudeBinary, env: this.o.env, authorize: opts.authorize, signal: opts.signal, resumeSession: opts.resumeSession, planOnly: opts.planOnly });
    const q = (this.o.queryFn ?? realQuery)({ prompt: opts.prompt, options: options as never });
    let lastTotal = 0, sessionId: string | undefined;
    for await (const m of q as AsyncIterable<any>) {
      if (m.session_id) sessionId = String(m.session_id);
      if (m.type === "assistant") {
        const text = (m.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        if (text) yield { text, costUsd: 0, sessionId };
      } else if (m.type === "result") {
        const total = Number(m.total_cost_usd ?? 0);
        const delta = round(Math.max(0, total - lastTotal));
        lastTotal = total;
        if (m.subtype && m.subtype !== "success") throw new EngineStop(`${m.subtype}: the run stopped`, delta);
        yield { costUsd: delta, sessionId };
      }
    }
  }
}
