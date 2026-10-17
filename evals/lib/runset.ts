// Runs a whole eval set the same way for every set: dry unless --spend, one case at a time, each with its own cap, a
// cumulative stop, and one results file at the end.
import { SpendGuard, type CaseMeter } from "./budget.ts";
import { HarnessMissing, realHarness, type EvalArgs, type EvalHarness } from "./harness.ts";
import { resultsPath, writeResults, type CaseResult, type Results } from "./results.ts";

export type Mode = "dry" | "spend";
export type SetCase = { id: string };
export type CaseRun<C> = (c: C, ctx: { mode: Mode; harness?: EvalHarness; meter: CaseMeter }) => Promise<CaseResult>;

export const notStarted = (id: string, why: string): CaseResult => ({ id, outcome: "not_started", costUsd: 0, turns: 0, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 0, notes: [why] });

/** One run of a set. `harness` is for tests (a stand in that pretends to spend); a real run gets it from realHarness(). */
export async function runSet<C extends SetCase>(o: {
  set: string; setDir: string; cases: C[]; args: EvalArgs; run: CaseRun<C>;
  summarize: (cases: CaseResult[]) => Record<string, unknown>; models: Record<string, string>;
  harness?: EvalHarness; now?: () => Date; log?: (line: string) => void;
}): Promise<{ results: Results; path: string }> {
  const log = o.log ?? ((l: string) => console.log(l));
  const mode: Mode = o.args.spend ? "spend" : "dry";
  let harness = o.harness;
  if (mode === "spend" && !harness) harness = await realHarness();   // throws HarnessMissing until the real-key work plugs it in
  const picked = o.args.only.length ? o.cases.filter((c) => o.args.only.includes(c.id)) : o.cases;
  const unknown = o.args.only.filter((id) => !o.cases.some((c) => c.id === id));
  if (unknown.length) throw new Error(`No case called ${unknown.join(", ")} in ${o.set}.`);
  const guard = new SpendGuard(o.args.perCaseUsd, o.args.totalUsd);
  const now = o.now ?? (() => new Date());
  const started = now();
  log(mode === "dry"
    ? `${o.set}: DRY run of ${picked.length} cases. Stand ins only, nothing is spent.`
    : `${o.set}: SPEND run of ${picked.length} cases with ${harness!.name}. At most $${o.args.perCaseUsd.toFixed(2)} a case and $${o.args.totalUsd.toFixed(2)} in all.`);
  const results: CaseResult[] = [];
  for (const c of picked) {
    const meter = guard.startCase(c.id);
    if (!meter) { results.push(notStarted(c.id, guard.stopped!)); continue; }
    let r: CaseResult;
    try { r = await o.run(c, { mode, harness, meter }); }
    catch (e) { r = { id: c.id, outcome: "error", costUsd: meter.usd, turns: meter.turns, tokens: { ...meter.tokens }, ms: 0, notes: [`The case crashed: ${(e as Error).message}`] }; }
    // A dry run spends nothing, whatever a stand in reports.
    if (mode === "dry") r = { ...r, costUsd: 0 };
    if (meter.capped) r.notes.push(`Stopped at the case's cap of $${meter.capUsd.toFixed(2)}.`);
    results.push(r);
    log(`  ${c.id}: ${r.outcome}${mode === "spend" ? ` ($${r.costUsd.toFixed(3)}, ${r.turns} turns)` : ""}${r.notes.length ? ` - ${r.notes[0]}` : ""}`);
  }
  if (guard.stopped) log(guard.stopped);
  const out: Results = {
    format: "companion-eval-results/1", set: o.set, mode, harness: mode === "dry" ? "dry" : harness!.name,
    startedAt: started.toISOString(), finishedAt: now().toISOString(), models: o.models,
    caps: { perCaseUsd: o.args.perCaseUsd, totalUsd: o.args.totalUsd },
    spentUsd: mode === "dry" ? 0 : Math.round(guard.spentUsd * 1e6) / 1e6, stopped: guard.stopped, cases: results, summary: o.summarize(results),
  };
  const path = resultsPath(o.setDir, o.set, mode, started, o.args.out);
  writeResults(path, out);
  log(`Results: ${path}`);
  return { results: out, path };
}

/** For a set's run.ts: plain words and exit code 2 when spending is asked for but cannot happen yet. */
export function explainFailure(e: unknown): never {
  console.error(e instanceof HarnessMissing ? e.message : `The eval could not run: ${(e as Error).message}`);
  process.exit(2);
}
