// M104: on a review's Fix it receipt, each problem that review found, checked again by its rules: Still there first, then
// Look at it, then Gone, each with its tag in words and its meaning colour (never colour alone). One still there offers Try
// again (Fix it again, only for what is left) beside the receipt's own Undo. What is drawn is decided in fixRecheck.ts.
import { OUTCOME_LOOK, recheckRows, recheckSummary, stillOf, type Rechecked } from "./fixRecheck.ts";
import { S } from "./strings.ts";
import { Tag } from "./ui/parts.tsx";

export function RecheckList({ r, retry, retrying, undo }: { r: Rechecked; retry: (() => void) | null; retrying: boolean; undo?: React.ReactNode }) {
  const still = stillOf(r) > 0;
  return (
    <section className="receipt-recheck" aria-labelledby="receipt-recheck-title" data-still={still || undefined}>
      <h3 className="receipt-recheck-title" id="receipt-recheck-title">{S.fixRecheck.title}</h3>
      {/* With one still there the result's own line already says how many, so the summary is not said twice. */}
      {!still && <p className="line muted receipt-recheck-sum">{recheckSummary(r)}</p>}
      <ul className="receipt-recheck-list">
        {recheckRows(r).map((f) => (
          <li key={f.key} data-outcome={f.outcome}>
            <Tag meaning={OUTCOME_LOOK[f.outcome].meaning} words={OUTCOME_LOOK[f.outcome].words} />
            <span className="receipt-recheck-say">{f.say}{f.outcome === "unsure" && <span className="line muted"> {S.fixRecheck.unsureLine}</span>}</span>
          </li>
        ))}
      </ul>
      {still && (retry || undo) && (
        <div className="row receipt-recheck-acts">
          {retry && <button className="btn primary" type="button" disabled={retrying} aria-describedby="receipt-recheck-help" onClick={retry}>{retrying ? S.fixRecheck.trying : S.fixRecheck.tryAgain}</button>}
          {undo}
          {retry && <span className="muted" id="receipt-recheck-help">{S.fixRecheck.tryAgainHelp}</span>}
        </div>
      )}
    </section>
  );
}
