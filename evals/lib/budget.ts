// Spending stops for the eval sets: a dollar cap per case, and a cumulative stop for the whole run. They sit on top of the
// runner's own per task budget (the runner already stops a task at its budget, and the real SDK is given it as
// maxBudgetUsd). Costs are the SDK's own estimates, so the Anthropic Console's workspace spend limit stays the hard stop.
//
// How exact it is: an agent turn is counted the moment it arrives, and the case is stopped before the next one starts, so
// a case can go over its cap by at most one turn. A single text call (Explain, the grader, the vision lane) is checked
// before it starts and cannot be cut off half way, so it can go over by one call (a cent or two).
import { EngineStop, type Engine, type EngineOptions, type ToolResult, type Turn, type Usage } from "../../runner/src/engine.ts";
import type { LocateReq, Located, VisionLike } from "../../runner/src/lanes.ts";
import type { TextAsk } from "./harness.ts";

export const CAP_REACHED = "error_max_budget_usd: the eval's spending cap for this case was reached";

export type Tokens = { in: number; cacheRead: number; out: number };

/** The whole run: what has been spent, and whether a new case may start. */
export class SpendGuard {
  spentUsd = 0;
  stopped: string | null = null;
  constructor(readonly perCaseUsd: number, readonly totalUsd: number) {
    if (!(perCaseUsd > 0) || !(totalUsd > 0)) throw new Error("Both spending caps must be above zero.");
  }
  /** A meter for the next case, or null once the cumulative stop is reached (nothing more is started). */
  startCase(id: string): CaseMeter | null {
    const left = this.totalUsd - this.spentUsd;
    if (left <= 0) { this.stopped ??= `The total cap of $${this.totalUsd.toFixed(2)} was reached before ${id}, so it and every case after it were not started.`; return null; }
    return new CaseMeter(Math.min(this.perCaseUsd, left), (usd) => { this.spentUsd += usd; });
  }
}

/** One case: its own cap (the per case cap, or less when the run is near its total), turns, tokens and what was said. */
export class CaseMeter {
  usd = 0;
  turns = 0;
  tokens: Tokens = { in: 0, cacheRead: 0, out: 0 };
  /** Everything the agent said, in order (the runner keeps no copy of it, and "did it ask?" is read from here). */
  said: string[] = [];
  tools: string[] = [];
  capped = false;
  constructor(readonly capUsd: number, private onSpend: (usd: number) => void = () => {}) {}
  left(): number { return Math.max(0, this.capUsd - this.usd); }
  over(): boolean { return this.usd >= this.capUsd; }
  charge(usd: number, usage?: Usage) {
    const n = Number.isFinite(usd) && usd > 0 ? usd : 0;
    this.usd += n; this.onSpend(n);
    if (usage) { this.tokens.in += usage.in; this.tokens.cacheRead += usage.cacheRead; this.tokens.out += usage.out; }
    if (this.over()) this.capped = true;
  }
  private turn(t: Turn) {
    this.turns++;
    this.charge(t.costUsd, t.usage);
    if (t.text) this.said.push(t.text);
    if (t.tool) this.tools.push(t.tool.name);
  }
  /** Any engine, counted and stopped at this case's cap. */
  engine(inner: Engine): Engine { return new MeteredEngine(inner, this, (t) => this.turn(t)); }
  /** A text call, refused once the cap is reached, its cost and tokens counted. */
  ask(inner: TextAsk): TextAsk {
    return async (req, signal) => {
      if (this.over()) { this.capped = true; throw new EngineStop(CAP_REACHED); }
      const r = await inner(req, signal);
      this.turns++;
      this.charge(r.costUsd, r.usage);
      return r;
    };
  }
  vision(inner: VisionLike): VisionLike {
    return { locate: async (req: LocateReq, signal: AbortSignal): Promise<Located> => {
      if (this.over()) { this.capped = true; throw new EngineStop(CAP_REACHED); }
      const r = await inner.locate(req, signal);
      this.turns++;
      this.charge(r.costUsd);
      return r;
    } };
  }
}

class MeteredEngine implements Engine {
  constructor(private inner: Engine, private meter: CaseMeter, private count: (t: Turn) => void) {}
  get executesTools() { return this.inner.executesTools; }
  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    if (this.meter.over()) { this.meter.capped = true; throw new EngineStop(CAP_REACHED); }
    // The real engine is told the smaller of the task's budget and what this case has left (the SDK's maxBudgetUsd).
    const gen = this.inner.start({ ...opts, budgetUsd: Math.min(opts.budgetUsd, this.meter.left()) });
    try {
      let next = await gen.next();
      while (!next.done) {
        this.count(next.value);
        const result = yield next.value;
        // The runner has counted this turn's cost; the next one does not start once the case is over its cap.
        if (this.meter.over()) { this.meter.capped = true; throw new EngineStop(CAP_REACHED); }
        next = await gen.next(result);
      }
    } finally { try { await gen.return(undefined); } catch { /* already finished */ } }
  }
}
