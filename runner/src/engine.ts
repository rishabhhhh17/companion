// The engine is whatever produces an agent's turns. The real one wraps the Claude Agent
// SDK (later in M1). The scripted one plays back a fixed script, for free, fast tests.

export type ToolUse = { name: string; input: Record<string, unknown> };
export type Turn = { text?: string; tool?: ToolUse; costUsd: number };
export type ToolResult = { ok: boolean; output: string };
export type EngineOptions = { prompt: string; project: string; model: string; signal: AbortSignal };

export interface Engine {
  // Yield turns. After a tool turn the runner sends the tool's result back through next().
  start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined>;
}

export type Step = Turn & { delayMs?: number };

export class ScriptedEngine implements Engine {
  constructor(private script: Step[]) {}
  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    for (const step of this.script) {
      if (opts.signal.aborted) return;
      if (step.delayMs) {
        await new Promise<void>((res) => {
          const t = setTimeout(res, step.delayMs);
          opts.signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
        });
        if (opts.signal.aborted) return;
      }
      const { delayMs: _d, ...turn } = step;
      yield turn;
    }
  }
}
