// The engine is whatever produces an agent's turns. The real one wraps the Claude Agent
// SDK (later in M1). The scripted one plays back a fixed script, for free, fast tests.

export type ToolUse = { name: string; input: Record<string, unknown> };
export type Turn = { text?: string; tool?: ToolUse; costUsd: number; sessionId?: string };
export type ToolResult = { ok: boolean; output: string };
export type Authorization = { allow: boolean; reason: string };
// `authorize` is how an engine that runs tools itself (the real SDK) asks Companion before each one.
export type EngineOptions = {
  prompt: string; project: string; model: string; signal: AbortSignal; budgetUsd: number;
  authorize: (tool: ToolUse, toolUseId?: string) => Promise<Authorization>;
  // Continue an earlier conversation (used to send proof failures back to the same session).
  resumeSession?: string;
  // Planning: the engine may read the project but must not change anything.
  planOnly?: boolean;
  // The engine tells us when a tool it ran has finished (so we know which file changes were the agent's own).
  toolDone?: (toolUseId?: string) => void;
};
// Thrown by an engine that was stopped by a limit, so the runner can record the right reason and cost.
export class EngineStop extends Error { constructor(message: string, public costUsd = 0) { super(message); } }

export interface Engine {
  // true when the engine runs tools itself and asks `authorize` first; false when the runner runs them.
  readonly executesTools?: boolean;
  // Yield turns. After a tool turn the runner sends the tool's result back through next().
  start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined>;
}

export type Step = Turn & { delayMs?: number };

export class ScriptedEngine implements Engine {
  // One script per round: round 1 is the task, later rounds are the follow ups after a failed check.
  readonly calls: EngineOptions[] = [];
  private rounds: Step[][];
  constructor(script: Step[] | Step[][]) { this.rounds = Array.isArray(script[0]) ? (script as Step[][]) : [script as Step[]]; }
  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    const n = this.calls.push(opts);
    let first = true;
    for (const step of this.rounds[n - 1] ?? []) {
      if (opts.signal.aborted) return;
      if (step.delayMs) {
        await new Promise<void>((res) => {
          const t = setTimeout(res, step.delayMs);
          opts.signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
        });
        if (opts.signal.aborted) return;
      }
      const { delayMs: _d, ...turn } = step;
      yield first ? { ...turn, sessionId: "scripted-session" } : turn;
      first = false;
    }
  }
}
