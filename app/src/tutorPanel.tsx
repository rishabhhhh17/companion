// M95, the light tutor on Learn: Practise next (one practice or lesson, a one line why, and Start) and What you have
// learned (one row per kind of problem handled, its source under it, and Forget). tutor.ts decides every word and the
// suggestion; card.tsx wires the presses. Plain facts with their source, never a score, a streak or praise (rule 16).
import { useId } from "react";
import { S } from "./strings.ts";
import { learnedLines, practiseNext, type Learned, type Suggestion } from "./tutor.ts";
import type { LessonItem } from "./model.ts";
import type { LearnedKind } from "../../protocol/index.ts";
import type { RowState } from "./practice.ts";
import { Button, EmptyRow, ListGroup, ListRow } from "./ui/parts.tsx";

export type TutorActions = { start: (id: string) => void; open: (id: string) => void; lesson: (id: string) => void; forget: (kind: LearnedKind, part: "learned" | "missed") => void };

export function TutorPanel({ learned, rows, lessons, busy, act, featuredBelow = false }: {
  learned: Learned | null;
  rows: readonly { id: string; state: RowState; there: boolean; title: string; needsNode?: boolean }[];
  lessons: readonly LessonItem[] | null; busy: boolean; act: TutorActions;
  /** The practice list is shown under this panel with its own featured card (or its every practice done card). Then
   *  Practise next is that card, not a second suggestion here (card.tsx passes a missed answer's practice to it). */
  featuredBelow?: boolean;
}) {
  const base = useId();
  if (!learned) return null;
  if (!learned.on) return <section className="learn tutor" aria-label={S.tutor.title}><p className="page-caption">{S.tutor.off}</p></section>;
  const lines = learnedLines(learned.signals);
  // Nothing until the practice record has loaded: a suggestion made from no rows would be a guess.
  const next: Suggestion | null = !featuredBelow && rows.length ? practiseNext(learned.signals, rows, lessons) : null;
  const row = next?.kind === "practice" ? rows.find((r) => r.id === next.id) ?? null : null;
  const under = row?.state === "inProgress" && row.there;
  const title = next?.kind === "practice" ? row?.title ?? "" : next?.kind === "lesson" ? next.title : "";
  const go = next?.kind === "practice" ? (under ? S.tutor.continue : S.tutor.start) : S.tutor.start;
  const allDone = rows.length > 0 && rows.every((r) => r.state === "done");
  const notThis = next?.kind === "practice" && next.forget ? next.forget : null;
  return (
    <section className="learn tutor" aria-label={S.tutor.title}>
      {!featuredBelow && rows.length > 0 && (
        <ListGroup label={S.tutor.nextTitle} shown>
          {next ? (
            <ListRow colour="purple" icon="learn" title={title}
              // Not this one belongs to this row: a quiet press under its why, in the row's own inset.
              line={notThis ? <>{next.why}<span className="tutor-not-this"><Button kind="quiet" size="sm" label={`${S.tutor.notThis}: ${title}`} describedBy={`${base}-nt`} onClick={() => act.forget(notThis, "missed")}>{S.tutor.notThis}</Button><span id={`${base}-nt`} hidden>{S.tutor.notThisHelp}</span></span></> : next.why}
              action={busy || row?.needsNode ? null : { id: `${base}-go`, label: go, colour: "purple", ariaLabel: `${go}: ${title}`, onClick: () => (next.kind === "lesson" ? act.lesson(next.id) : under ? act.open(next.id) : act.start(next.id)) }} />
          ) : (
            <EmptyRow icon="tick" title={allDone ? S.tutor.allDone : S.tutor.noneTitle} />
          )}
        </ListGroup>
      )}
      <ListGroup label={S.tutor.title} shown>
        {lines.length
          ? lines.map((l) => <ListRow key={l.kind} colour="green" icon="tick" title={l.text} line={l.from}
              action={{ id: `${base}-${l.kind}`, label: S.tutor.forget, colour: "grey", ariaLabel: S.tutor.forgetLine(S.tutor.kinds[l.kind].title), onClick: () => act.forget(l.kind, "learned") }} />)
          : <EmptyRow title={S.tutor.noneTitle} line={S.tutor.noneLine} />}
      </ListGroup>
      <p className="page-caption">{S.tutor.lead}</p>
      {learned.paused && <p className="page-caption" role="status">{S.tutor.paused}</p>}
    </section>
  );
}
