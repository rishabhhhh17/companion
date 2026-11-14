// M89: the warning before a big job near the person's Claude limit, and the jobs saved for after the reset (runway.ts holds
// the logic). The warning offers Start anyway, Save for after the reset (never off the record) and Not now; nothing starts or
// is saved without one of those presses. A saved job waits in Now with Start and Remove.
import { jobTitle, runwayNow, savedRows, warnLine, warnTitle, type Runway } from "./runway.ts";
import type { SavedJobView } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { Button } from "./ui/parts.tsx";
import { Icon } from "./icons.tsx";

/** fromSaved: the saved job this warning is about (Start on the saved list), so Save only closes it (the M89 review). */
export type RunwayAskState = { kind: "job" | "rescue"; prompt: string; fromSaved?: string };

/** The M89 review: compact (the title and the buttons on one row), naming the job and saying when the limit resets. */
export function RunwayAsk({ runway, now, offRecord, kind, prompt, onStart, onSave, onClose }: { runway: Runway | null | undefined; now: number; offRecord: boolean; kind: RunwayAskState["kind"]; prompt: string; onStart: () => void; onSave: () => void; onClose: () => void }) {
  const title = warnTitle(runway, now);
  const what = jobTitle(kind, prompt);
  const hit = runwayNow(runway, now)?.source === "limit_hit";
  return (
    <div className="panel amber runway-ask" role="alertdialog" aria-label={title} data-tone="amber">
      <div className="runway-ask-head">
        <p className="runway-ask-title"><Icon name="warn" size={16} /><b>{title}</b></p>
        <div className="row runway-ask-actions">
          {!offRecord && <Button kind="primary" size="sm" onClick={onSave}>{hit ? S.m89.warn.saveWait : S.m89.warn.save}</Button>}
          <Button size="sm" onClick={onStart}>{S.m89.warn.startAnyway}</Button>
          <Button kind="quiet" size="sm" onClick={onClose}>{S.m89.warn.notNow}</Button>
        </div>
      </div>
      {what && <p className="line runway-ask-what" title={prompt || what}>{what}</p>}
      <p className="line muted">{warnLine(runway, now, offRecord)}</p>
    </div>
  );
}

export function SavedJobsList({ jobs, now, busy, onStart, onRemove }: { jobs: readonly SavedJobView[]; now: number; busy: boolean; onStart: (j: SavedJobView) => void; onRemove: (j: SavedJobView) => void }) {
  const rows = savedRows(jobs, now);
  if (rows.length === 0) return null;
  return (
    <section className="panel saved-jobs" aria-label={S.m89.saved.title}>
      <p className="saved-jobs-title"><b>{S.m89.saved.title}</b></p>
      <ul>
        {rows.map((r) => {
          const job = jobs.find((j) => j.id === r.id)!;
          return (
            <li key={r.id} className="saved-job" data-ready={r.ready ? "yes" : undefined}>
              <span className="saved-job-text"><b title={r.prompt || r.title}>{r.title}</b><span className="line muted">{busy ? S.m89.saved.busy : r.line}</span></span>
              <span className="saved-job-actions">
                <Button kind={r.ready ? "primary" : "secondary"} size="sm" disabled={busy} label={S.m89.saved.startLabel(r.title)} onClick={() => onStart(job)}>{S.m89.saved.start}</Button>
                <Button kind="quiet" size="sm" label={S.m89.saved.removeLabel(r.title)} onClick={() => onRemove(job)}>{S.m89.saved.remove}</Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
