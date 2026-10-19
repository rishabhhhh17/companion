// The engine is whatever produces an agent's turns. The real one wraps the Claude Agent
// SDK (later in M1). The scripted one plays back a fixed script, for free, fast tests.

import { defOf } from "../../protocol/settings.ts";

export type ToolUse = { name: string; input: Record<string, unknown> };
// Tokens used since the engine's last turn that reported any. `in` is input not read from the cache (cache writes count
// here), `cacheRead` is input read from the cache, `out` is output. Absent when the engine did not say.
export type Usage = { in: number; cacheRead: number; out: number };
export type Turn = { text?: string; tool?: ToolUse; costUsd: number; sessionId?: string; usage?: Usage };
// What a shell command reported about itself: the id of a command it left running in the background. Only this is kept,
// so the task may read the output of, or stop, what it started itself.
export type ShellFacts = { backgroundId?: string };
export type ToolResult = { ok: boolean; output: string; shell?: ShellFacts };
export type Authorization = { allow: boolean; reason: string };
// How long an approval card waits for the person, as usual. No answer in that time counts as no. The person may change
// only the wait ("How long a question waits for your answer", approval.waitMinutes), read when each question is asked;
// the longest it can be is the setting's own top, which the SDK hook's time limit is set from (sdkEngine.ts). That top is
// 30 minutes, the same as the usual wait, until a real run shows Claude Code honours a hook still waiting past the 32
// minutes relied on so far (T05, [verify]); only then may protocol/settings.json raise it.
export const APPROVAL_TIMEOUT_MS = 30 * 60_000;
export const MAX_APPROVAL_WAIT_MS = Number(defOf("approval.waitMinutes")?.max ?? 30) * 60_000;
// `authorize` is how an engine that runs tools itself (the real SDK) asks Companion before each one.
export type EngineOptions = {
  prompt: string; project: string; model: string; signal: AbortSignal; budgetUsd: number;
  authorize: (tool: ToolUse, toolUseId?: string) => Promise<Authorization>;
  // Continue an earlier conversation (used to send proof failures back to the same session).
  resumeSession?: string;
  // Planning: the engine may read the project but must not change anything.
  planOnly?: boolean;
  // The engine tells us when a tool it ran has finished (so we know which file changes were the agent's own), and what a
  // shell command said about itself.
  toolDone?: (toolUseId?: string, shell?: ShellFacts) => void;
  // What Companion remembers about this person and project (plain lines they can read and change). Empty when off the record.
  memory?: string;
  // Off the record: the engine saves no conversation, so there is nothing to continue later (never pass resumeSession).
  offTheRecord?: boolean;
  // Most turns this session may take (the setting "Most turns in one task", work.maxTurns, read when the task started).
  maxTurns?: number;
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
  // Real Claude does not go quiet when it is stopped: it throws. Set this to behave the same way.
  throwOnAbort = false;
  // Real Claude also takes a moment to wind down after a stop: abortDelayMs, or (for a test that must not depend on the
  // clock) until windDown resolves.
  abortDelayMs = 0;
  windDown: (() => Promise<void>) | null = null;
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
        if (opts.signal.aborted && this.windDown) await this.windDown();
        else if (opts.signal.aborted && this.abortDelayMs) await new Promise((r) => setTimeout(r, this.abortDelayMs));
        if (opts.signal.aborted) { if (this.throwOnAbort) throw new Error("Claude Code process aborted by user"); return; }
      }
      const { delayMs: _d, ...turn } = step;
      yield first ? { ...turn, sessionId: "scripted-session" } : turn;
      first = false;
    }
  }
}
