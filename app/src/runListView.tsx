// M69 step 2, Fix it and proof (the YC benchmark spec 3.4): the parts runList.ts decides, drawn. The run list while a fix
// works, the proof ticks under its receipt, the failing lead, and Replay what Squibby did. Each state is said in words for
// VoiceOver, never only by a mark or a colour; times are tabular figures, so a count never jiggles. Motion is the row's
// one entrance (ui/fix.css), and Reduce Motion keeps a plain fade.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./icons.tsx";
import { CheckDetail } from "./checkDetail.tsx";
import { FailingLine } from "./failingLine.tsx";
import { replayRows, secondsWords, type FailedStep, type RunRow, type Tick } from "./runList.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { Button } from "./ui/parts.tsx";

function RowMark({ state }: { state: RunRow["state"] | "unfinished" }) {
  if (state === "done") return <Icon name="tick" size={12} />;
  if (state === "failed") return <Icon name="cross" size={12} />;
  return null;   // now: a still dot; waiting and unfinished: a ring (both drawn by ui/fix.css)
}

/** The rows: a mark, the step in words (verb first), and its status with its time on the right. `replay`: each row arrives
 *  one beat after the one before. */
/** `under`: drawn right under the first row, the change itself (the files changed so far, jobLive.tsx). */
export function RunRows({ rows, label, replay = false, more = 0, under = null }: { rows: RunRow[]; label: string; replay?: boolean; more?: number; under?: ReactNode }) {
  return (
    <ol className="run-list" aria-label={label} data-replay={replay ? "" : undefined}>
      {rows.map((r, i) => [
        <li key={r.key} className="run-row" data-state={r.state} style={replay ? ({ "--i": i } as CSSProperties) : undefined} aria-current={r.state === "now" ? "step" : undefined}>
          <span className="run-mark" aria-hidden="true"><RowMark state={r.state} /></span>
          <span className="run-words">{r.words}{r.detail && <span className="run-detail">{r.detail}</span>}</span>
          {(r.status || r.ms) && <span className="run-status">{r.status}{r.ms ? <span className="run-time">{S.fixRun.seconds(secondsWords(r.ms))}</span> : null}</span>}
        </li>,
        i === 0 && under ? <li key="under" className="run-under">{under}</li> : null,
      ])}
      {more > 0 && <li className="run-row run-more" key="more" style={replay ? ({ "--i": rows.length } as CSSProperties) : undefined}>{S.fixRun.replayMore(more)}</li>}
    </ol>
  );
}

/** The receipt's proof: each check that ran, a tick or a cross, the commands it ran with their exit codes in mono, and its
 *  time. A failed one keeps its own output behind Details (checkDetail.tsx). */
/** `led`: the failing lead above already says why and where, so a failed tick keeps only its raw output behind Details. */
export function ProofTicks({ ticks, title, led = false }: { ticks: Tick[]; title?: string; led?: boolean }) {
  if (!ticks.length) return null;
  return (
    <div className="proof-ticks">
      {title && <p className="proof-ticks-title">{title}</p>}
      <ul aria-label={title ?? S.fixRun.ticksLabel}>
        {ticks.map((t) => (
          <li key={t.rung} className="tick-row" data-state={t.state}>
            <span className="run-mark" aria-hidden="true"><RowMark state={t.state === "ok" ? "done" : t.state === "bad" ? "failed" : "unfinished"} /></span>
            <span className="tick-words">{t.words}{t.state === "unfinished" && <span className="tick-note">{S.fixRun.unfinished}</span>}
              {t.state === "ok" && <span className="sr">: {S.stepPassed}</span>}{t.state === "bad" && <span className="sr">: {S.stepFailed}</span>}
              {t.runs.map((r) => <code key={r} className="tick-run">{r}</code>)}
              {t.parts && <CheckDetail parts={led ? { ...t.parts, summary: "", place: "" } : t.parts} />}
            </span>
            {t.ms ? <span className="run-time">{S.fixRun.seconds(secondsWords(t.ms))}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A failed result leads with what failed: the step named, why in one plain sentence, and the line pointed at (as the review
 *  card does). Then Try again (the main button, asks first in the card) and Copy for my AI. */
/** M69 step 3: `undo` (Undo this change) sits beside them, so a fix that did not work can be taken back right here. */
export function FailLead({ f, retry, copy, retryId, undo = null, heroSays = false }: { f: FailedStep; retry: (() => void) | null; copy: ReactNode; retryId: string; undo?: ReactNode; heroSays?: boolean }) {
  return (
    <div className="fail-lead" role="group" aria-label={S.fixRun.stoppedAt(f.label)}>
      <p className="fail-step"><span className="run-mark" aria-hidden="true"><Icon name="cross" size={12} /></span>{S.fixRun.stoppedAt(f.label)}</p>
      {/* When the hero already says why (homeRest.ts resultHero), here only where it is. */}
      {((!heroSays && f.why) || f.place) && <p className="fail-why">{!heroSays && f.why}{!heroSays && f.why && f.place ? " " : ""}{f.place && <span className="fail-place">{f.place}</span>}</p>}
      <FailingLine problem={f.problem} pointed />
      <div className="row fail-actions">
        {retry && <Button id={retryId} kind="primary" onClick={retry}>{S.fixRun.tryAgain}</Button>}
        {copy}
        {undo}
      </div>
    </div>
  );
}

/** Replay what Squibby did: a quiet button beside the receipt's Undo that plays the task's stored steps back, one row at a time. A
 *  second press hides it. Nothing is fetched or run again: these are the steps the page already holds. */
export function Replay({ m, id }: { m: Pick<Model, "task" | "receipt">; id: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const { rows, more } = replayRows(m);
  const checkpoint = m.receipt?.checkpoint;
  useEffect(() => { setOpen(false); }, [checkpoint]);
  if (!rows.length) return null;
  // Beside Undo in the result's actions row; the steps open under the row, as wide as the card.
  return <>
    <Button kind="quiet" expanded={open} controls={`${id}-list`} onClick={() => { setOpen(!open); setRound(round + 1); }}>{open ? S.fixRun.replayHide : S.fixRun.replay}</Button>
    {open && <div className="replay-list" id={`${id}-list`} key={round}><RunRows rows={rows} more={more} label={S.fixRun.replayLabel} replay /></div>}
  </>;
}
