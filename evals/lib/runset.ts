// Runs a whole eval set the same way for every set: dry unless --spend, one case at a time, each with its own cap, a
// cumulative stop, and one results file at the end.
//
// A spend run gets its harness from realHarness() (the real run harness: runner/scripts/realrun-harness.ts underneath). A
// refusal by the harness or a spending stop (the harness's, or the eval's own cap cutting work short) fails its case with
// the reason, as outcome "refused" or "stopped", whatever the case itself returned: product code that turns the error into
// its own answer ("no answer", "not fixed", "not graded") never makes a stop look like a quality result. The scorers leave
// those cases out of every rate. A refusal ends the run (it would only repeat), so does the total stop, and so does any
// stop in a set that asks for it (the aim eval).
import { SpendGuard, type CaseMeter } from "./budget.ts";
import { CannotSpend, isEvalStop, realHarness, stopOf, type CaseStop, type EvalArgs, type EvalHarness, type RealDeps } from "./harness.ts";
import { resultsPath, writeResults, type CaseResult, type Results } from "./results.ts";

export type Mode = "dry" | "spend";
export type SetCase = { id: string };
/** signal: aborted at the case's first refusal or spending stop (and when it ends), so a case can stop at once. */
export type CaseRun<C> = (c: C, ctx: { mode: Mode; harness?: EvalHarness; meter: CaseMeter; signal: AbortSignal }) => Promise<CaseResult>;

export const notStarted = (id: string, why: string): CaseResult => ({ id, outcome: "not_started", costUsd: 0, turns: 0, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 0, notes: [why] });

const first = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One run of a set. `harness` is for tests (a stand in that pretends to spend), or a harness the caller built (the aim
 *  eval builds it before rendering any page); otherwise a spend run gets it from realHarness(), with `harnessDeps` (tests
 *  only: stand ins for the Keychain, the SDK's query and the network). Whatever harness a spend run uses is closed at the
 *  end. */
export async function runSet<C extends SetCase>(o: {
  set: string; setDir: string; cases: C[]; args: EvalArgs; run: CaseRun<C>;
  summarize: (cases: CaseResult[]) => Record<string, unknown>; models: Record<string, string>;
  harness?: EvalHarness; harnessDeps?: RealDeps; now?: () => Date; log?: (line: string) => void;
  /** Any spending stop ends the run, not only the total stop (the aim eval: one ask over its cap means the prices are off). */
  endRunOnCaseStop?: boolean;
}): Promise<{ results: Results; path: string }> {
  const mode: Mode = o.args.spend ? "spend" : "dry";
  const picked = o.args.only.length ? o.cases.filter((c) => o.args.only.includes(c.id)) : o.cases;
  const unknown = o.args.only.filter((id) => !o.cases.some((c) => c.id === id));
  if (unknown.length) throw new Error(`No case called ${unknown.join(", ")} in ${o.set}.`);
  // Dry: no harness at all, so nothing can be spent. Spend: the real one, which refuses (CannotSpend) when there is no key.
  const harness = mode === "spend" ? o.harness ?? await realHarness({ perCaseUsd: o.args.perCaseUsd, totalUsd: o.args.totalUsd }, o.harnessDeps) : undefined;
  const hide = harness?.hide ?? ((s: string) => s);
  const log = (l: string) => (o.log ?? ((x: string) => console.log(x)))(hide(l));
  try {
    const guard = new SpendGuard(o.args.perCaseUsd, o.args.totalUsd);
    const now = o.now ?? (() => new Date());
    const started = now();
    log(mode === "dry"
      ? `${o.set}: DRY run of ${picked.length} cases. Stand ins only, nothing is spent.`
      : `${o.set}: SPEND run of ${picked.length} cases with the ${harness!.name}. At most $${o.args.perCaseUsd.toFixed(2)} a case and $${o.args.totalUsd.toFixed(2)} in all.`);
    const results: CaseResult[] = [];
    let stopped: string | null = null;
    for (const c of picked) {
      if (!stopped && harness?.stopped?.()) stopped = `${first(harness.stopped()!)} before ${c.id}, so it and every case after it were not started.`;
      if (stopped) { results.push(notStarted(c.id, stopped)); continue; }
      const meter = guard.startCase(c.id);
      if (!meter) { stopped = guard.stopped!; results.push(notStarted(c.id, stopped)); continue; }
      const signal = harness?.startCase?.(c.id, meter.capUsd) ?? new AbortController().signal;
      let r: CaseResult;
      let thrown: unknown;
      try { r = await o.run(c, { mode, harness, meter, signal }); }
      catch (e) { thrown = e; r = { id: c.id, outcome: "error", costUsd: meter.usd, turns: meter.turns, tokens: { ...meter.tokens }, ms: 0, notes: [`The case crashed: ${(e as Error)?.message ?? String(e)}`] }; }
      const end = harness?.endCase ? await harness.endCase() : { spentUsd: 0, stops: [] as CaseStop[] };
      // The harness counts a query while it runs, so it can see more than the runner booked (a round cut short): the run's
      // total stop goes by the larger of the two.
      if (mode === "spend" && end.spentUsd > meter.usd) meter.charge(end.spentUsd - meter.usd);
      const stops: CaseStop[] = [...end.stops];
      if (thrown !== undefined && isEvalStop(thrown) && !stops.length) stops.push(stopOf(thrown));
      if (meter.cut && !stops.some((s) => s.kind === "stopped")) stops.push({ kind: "stopped", reason: meter.cut });
      // A dry run spends nothing, whatever a stand in reports.
      r = mode === "dry" ? { ...r, costUsd: 0 } : { ...r, costUsd: Math.max(r.costUsd, meter.usd) };
      if (stops.length) {
        const [s, ...more] = stops;
        r = { ...r, outcome: s.kind, notes: [s.kind === "refused" ? `Refused by the harness: ${s.reason}` : `Stopped: ${s.reason}`, ...more.map((m) => `Also: ${m.reason}`), ...r.notes], detail: { ...(r.detail ?? {}), wouldHaveBeen: r.outcome } };
        if (s.kind === "refused") stopped = `A harness refusal ended the run at ${c.id} (${s.reason}), so the cases after it were not started.`;
        else if (o.endRunOnCaseStop) stopped ??= `A spending stop ended the run at ${c.id} (${s.reason}), so the cases after it were not started.`;
      } else if (meter.capped) r.notes.push(`Reached the case's cap of $${meter.capUsd.toFixed(2)}.`);
      r = { ...r, notes: r.notes.map(hide) };
      results.push(r);
      log(`  ${c.id}: ${r.outcome}${mode === "spend" ? ` ($${r.costUsd.toFixed(3)}, ${r.turns} turns)` : ""}${r.notes.length ? ` - ${r.notes[0]}` : ""}`);
    }
    if (stopped) log(stopped);
    const out: Results = {
      format: "companion-eval-results/1", set: o.set, mode, harness: mode === "dry" ? "dry" : harness!.name,
      startedAt: started.toISOString(), finishedAt: now().toISOString(), models: o.models,
      caps: { perCaseUsd: o.args.perCaseUsd, totalUsd: o.args.totalUsd },
      spentUsd: mode === "dry" ? 0 : Math.round(guard.spentUsd * 1e6) / 1e6, stopped: stopped ? hide(stopped) : null, cases: results, summary: o.summarize(results),
    };
    const path = resultsPath(o.setDir, o.set, mode, started, o.args.out);
    writeResults(path, out);
    log(`Results: ${path}`);
    return { results: out, path };
  } finally {
    await harness?.close?.();
  }
}

/** For a set's run.ts: plain words and exit code 2 when spending is asked for but cannot happen. */
export function explainFailure(e: unknown): never {
  console.error(e instanceof CannotSpend ? e.message : `The eval could not run: ${(e as Error).message}`);
  process.exit(2);
}
