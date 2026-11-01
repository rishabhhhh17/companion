// The practice projects on Home's Learn tab: the panel that follows the practice open now (find it, fix it, prove it, with
// the result, Undo and Explain right here), and the list of every practice in catalog order. What each shows is decided in
// practice.ts and model.ts; card.tsx wires the buttons. Every control has words VoiceOver reads (a11y.test.ts), and every
// confirm step takes the keyboard to its safe choice (confirm.tsx). A plain Done, never a score or praise (rule 16).
import { practiceStamp } from "./itemLook.ts";
import { ItemTile, Stamp } from "./itemMarks.tsx";
import { useId, useState, type ReactNode } from "react";
import { ChangesCard } from "./changesCard.tsx";
import { ConfirmStep } from "./confirm.tsx";
import { FailingLine, lineOf } from "./failingLine.tsx";
import { FlowMini } from "./flowflowMini.tsx";
import { Icon } from "./icons.tsx";
import { buttonShown } from "./groups.ts";
import { keyHint, type Keys } from "./keys.ts";
import { formatUsd, type ChangeAt, type Practice, type PracticeResult, type Problem, type ProofLine, type UndoState } from "./model.ts";
import { costWords, threadOf, timeWords, type ListRow, type PracticeEntry, type Thread as ThreadState } from "./practice.ts";
import { S } from "./strings.ts";
import { useSetting } from "./settingsStore.ts";
import { undoneExcept } from "./undoWords.ts";

const placeLine = (w?: { file?: string; line?: number; message?: string }) => `${w?.file ? `${w.file}, line ${w.line}: ` : ""}${w?.message ?? ""}`;

export type PanelActions = {
  find: () => void; fix: () => void; lesson: () => void; stopFix: () => void; stopChecks: () => void; checkAgain: () => void; close: () => void;
  where: (p: Problem) => void; why: (p: Problem) => void; showChanged: (at: ChangeAt) => void; showResult: () => void;
  undoAsk: (checkpoint: string) => void; undoYes: (checkpoint: string) => void; undoCancel: () => void;
  startOver: () => void; remove: () => void; next: (id: string) => void; back: () => void;
};

/** Find, fix, prove as a thread: a hairline with three nodes. A node fills with the water only when the stage after it was reached
 *  (practice.ts threadOf); the third stays empty when the checks did not pass. The state is in words too, never colour alone. */
function Thread({ t }: { t: ThreadState }) {
  const rows: [keyof ThreadState, string][] = [["find", S.practiceThread.find], ["fix", S.practiceThread.fix], ["prove", S.practiceThread.prove]];
  return (
    <ol className="thread" aria-label={S.practiceThread.label}>
      {rows.map(([k, label]) => (
        <li key={k} className="thread-step" data-state={t[k]}>
          <span className="thread-node" aria-hidden="true">{t[k] === "done" && <span className="thread-tick"><Icon name="tick" size={10} /></span>}</span>
          <span className="thread-label">{label}</span>
          <span className="thread-state">{S.practiceThread.state[t[k]]}{t[k] === "now" && <i className="live" aria-hidden="true" />}</span>
        </li>
      ))}
    </ol>
  );
}

/** Flowflow on the card's top edge with one short line (decorative: the thread says the same in words). It stays out of the
 *  work itself, never inside the steps, the buttons or the approval cards. */
function Peek({ stage }: { stage: Practice["stage"] }) {
  // Done rests: Flowflow's "done" plays its success flash, three drops that read as confetti over the card (M51 review). The
  // bubble and the ticks already say the checks pass; the reward is the evidence.
  const state = stage === "fixing" || stage === "proving" ? "working" : "idle";
  // While the fix or its checks run, Now carries the line (M51 polish: the same "On it." in two places read as chatter).
  const quiet = stage === "fixing" || stage === "proving";
  return (
    <div className="pr-peek" aria-hidden="true">
      {!quiet && <span className="say" key={stage}>{S.practiceSay[stage]}</span>}
      <FlowMini state={state} className="pr-char" />
    </div>
  );
}

/** What was checked, one tick each, from the checks that really ran (the task's own proof lines). */
function Checks({ checks }: { checks: ProofLine[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="checks" aria-label={S.practiceChecks}>
      {checks.map((c) => (
        <li key={c.rung} data-status={c.status}>
          <span className="check-mark" aria-hidden="true"><Icon name={c.status === "passed" ? "tick" : c.status === "failed" ? "cross" : "dash"} size={12} /></span>
          <span className="check-label">{c.label}<span className="sr">: {c.status === "passed" ? "passed" : c.status === "failed" ? "did not pass" : "not run"}</span></span>
          {c.detail && <span className="check-detail">{c.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The fix's result where the practice is: what changed, its cost, Show me what changed, Undo (asked first) and Explain. */
function ResultBox({ r, undo, explain, act }: { r: PracticeResult; undo: UndoState | null; explain: ReactNode; act: PanelActions }) {
  const undoId = useId();
  const mine = undo && undo.checkpoint === r.checkpoint ? undo : null;
  const keepsMine = useSetting("undo.protectMyEdits") !== false;
  return (
    <div role="group" aria-label={S.practiceChanged}>
      {r.changed.length > 0 && <>
        <ChangesCard changed={r.changed} />
        <div className="line muted slip">{r.usdEstimate > 0 ? `${S.cost}: ${formatUsd(r.usdEstimate)}` : S.noCost}</div>
      </>}
      <div className="row">
        {r.changedAt && <button className="btn" type="button" onClick={() => act.showChanged(r.changedAt!)}>{S.showChanged}</button>}
        {r.changed.length > 0 && !mine && <button id={undoId} className="btn danger" type="button" onClick={() => act.undoAsk(r.checkpoint)}>{S.undo}</button>}
        <button className="btn" type="button" onClick={act.showResult}>{S.practiceShowResult}</button>
      </div>
      {mine?.stage === "confirm" && (
        <ConfirmStep className="line" label={S.undoSure} back={undoId} onCancel={act.undoCancel}><div>{S.undoSure}</div><div>{keepsMine ? S.undoKeeps : S.undoReplaces}</div>
          <div className="row">
            <button className="btn danger" type="button" onClick={() => act.undoYes(r.checkpoint)}>{S.undoYes}</button>
            <button className="btn" type="button" data-cancel onClick={act.undoCancel}>{S.undoNo}</button>
          </div></ConfirmStep>
      )}
      {mine?.stage === "working" && <div className="line" role="status">{S.undoWorking}</div>}
      {mine?.stage === "done" && !!mine.yours?.length && <div className="line" role="status">{undoneExcept(mine.yours)}</div>}
      {mine?.stage === "failed" && <div className="line" role="alert">{mine.note}</div>}
      {explain}
    </div>
  );
}

/** Start over and Remove my copy, each asked first. */
function CopyButtons({ act, busy, title }: { act: PanelActions; busy: boolean; title: string }) {
  const [ask, setAsk] = useState<"startOver" | "remove" | null>(null);
  const overId = useId(), removeId = useId();
  return <>
    {!ask && <div className="row">
      <button id={overId} className="btn" type="button" disabled={busy} aria-label={`${S.practiceStartOver}: ${title}`} onClick={() => setAsk("startOver")}>{S.practiceStartOver}</button>
      <button id={removeId} className="btn" type="button" disabled={busy} aria-label={`${S.practiceRemove}: ${title}`} onClick={() => setAsk("remove")}>{S.practiceRemove}</button>
    </div>}
    {ask === "startOver" && (
      <ConfirmStep className="line" label={S.practiceStartOverSure} back={overId} onCancel={() => setAsk(null)}><div>{S.practiceStartOverSure}</div>
        <div className="row"><button className="btn primary" type="button" onClick={() => { setAsk(null); act.startOver(); }}>{S.practiceStartOverYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button></div>
      </ConfirmStep>
    )}
    {ask === "remove" && (
      <ConfirmStep className="line" label={S.practiceRemoveSure} back={removeId} onCancel={() => setAsk(null)}><div>{S.practiceRemoveSure}</div>
        <div className="row"><button className="btn danger" type="button" onClick={() => { setAsk(null); act.remove(); }}>{S.practiceRemoveYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button></div>
      </ConfirmStep>
    )}
  </>;
}

export function PracticePanel({ p, entry, folder, keys, checking, drawing, busy, nodeFix, note, next, undo, explain, act, checks = [] }: {
  p: Practice; entry: PracticeEntry; folder: string; keys: Keys; checking: boolean; drawing: boolean; busy: boolean; nodeFix: string | null; note: string;
  next: PracticeEntry | null; undo: UndoState | null; explain: ReactNode; act: PanelActions; checks?: ProofLine[];
}) {
  const w = S.practices[entry.id];
  const task = entry.fix === "task", gate = entry.find === "gate";
  // A practice leans on three Flow tools (its check, its fix and its drawing). With Flow off their buttons are not drawn and one
  // plain line says so, so the panel never waits on an answer that cannot come. The check before going live is the core's.
  const canFind = gate || buttonShown("practiceFind"), canFix = buttonShown("practiceFix"), canWhy = buttonShown("practiceWhy");
  const findButton = canFind ? <button className="btn primary" type="button" disabled={checking} onClick={act.find}>{gate ? S.practiceFindGate : S.practiceFind}</button> : null;
  const doneWords = p.already ? S.practiceDoneAlready : p.gaps ? S.practiceDoneGaps : entry.prove === "gate" ? S.practiceDoneGate : S.practiceDone;
  // The fix stopped to ask something: it is answered in the follow up box under the result on Now, never tried again blind.
  const asks = p.stage === "failed" && !p.checksFailed && !p.result?.protectedChanged?.length ? p.result?.asks : undefined;
  const failedWords = p.checksFailed ? S.practiceChecksDidNotRun
    : p.result?.protectedChanged?.length ? S.practiceProtectedChanged
    : asks ? S.practiceAsks
    : entry.fix === "lesson" ? (p.nameSet ? S.practiceSettingNameSet : S.practiceSettingFailed)
    : entry.prove === "gate" && p.result?.proof !== "failed" ? S.practiceGateFailed : S.practiceFailed;
  // Flowflow's peek is in the flow above the card, never laid over it, so it can never cross the tab row however tall its
  // line grows with bigger text (M51 review); the card is drawn over its foot, so it peeks over the card's top edge.
  return (<>
    <Peek stage={p.stage} />
    <section className="panel practice" aria-label={S.practiceTitle} data-stage={p.stage}>
      <h2>{S.practiceTitle}</h2>
      <div className="line muted">{w.title}</div>
      <Thread t={threadOf(p)} />
      {note && <div className="line" role="status">{note}</div>}
      {p.stage === "start" && <>
        <div className="line">{(gate ? S.practiceStartGate : S.practiceStartIn)(folder, w.start)}</div>
        {!gate && <div className="line muted">{keyHint("problem", S.practiceKeys, keys)}</div>}
        {task && <div className="line muted">{S.practiceRulesNote}</div>}
        {!canFind && <div className="line" role="status">{S.groups.practiceNeedsFlow}</div>}
        <div className="row">{findButton}<button className="btn" type="button" onClick={act.close}>{S.practiceSkip}</button></div>
      </>}
      {p.stage === "found" && <>
        {/* The words say what is wrong; the proof row under them shows where, and the line itself, in the system mono. */}
        <div className="line"><b>{S.practiceFound}</b> {lineOf(p.problem) ? (p.where?.message ?? lineOf(p.problem)!.message) : placeLine(p.where)}</div>
        <FailingLine problem={p.problem} />
        {p.undone && <div className="line">{S.practiceUndone}</div>}
        <div className="line muted">{w.foundMore}</div>
        {task && canFix && <div className="line muted">{S.practiceFixHelp}</div>}
        {task && !canFix && <div className="line" role="status">{S.groups.practiceNeedsFlow}</div>}
        <div className="row">
          {p.problem && <button className="btn" type="button" onClick={() => act.where(p.problem!)}>{S.pointWhere}</button>}
          {p.problem && canWhy && <button className="btn" type="button" disabled={drawing} onClick={() => act.why(p.problem!)}>{S.drawWhy}</button>}
          {task
            ? canFix && <button className="btn primary gel" type="button" disabled={busy} onClick={act.fix}>{p.undone ? S.practiceAgain : S.practiceFix}</button>
            : <button className="btn primary" type="button" onClick={act.lesson}>{S.practiceSettingFix}</button>}
          <button className="btn" type="button" onClick={act.close}>{S.practiceSkip}</button>
        </div>
      </>}
      {p.stage === "lesson" && <>
        <div className="line">{S.practiceSettingLesson}</div>
        <div className="row"><button className="btn" type="button" onClick={act.close}>{S.practiceSkip}</button></div>
      </>}
      {p.stage === "proving" && <>
        <div className="line" role="status">{entry.prove === "gate" ? S.practiceProvingGate : S.practiceProving}</div>
        <div className="row"><button className="btn" type="button" onClick={act.stopChecks}>{S.practiceStopChecks}</button></div>
      </>}
      {p.stage === "fixing" && <>
        <div className="line" role="status">{S.practiceFixing}</div>
        {/* Stops the task the way the task card's Stop does, then closes: nothing keeps running or spending. */}
        <div className="row"><button className="btn" type="button" onClick={act.stopFix}>{S.practiceStopFix}</button></div>
      </>}
      {p.stage === "blocked" && <>
        <div className="line">{S.practiceBlocked[p.block ?? "couldNotRun"]}</div>
        {p.block === "couldNotRun" && nodeFix && <div className="line">{S.practiceNodeLine(nodeFix)}</div>}
        {p.block === "elsewhere" ? <div className="line muted">{placeLine(p.where)}</div> : p.why ? <div className="line muted">{p.why}</div> : null}
        {p.block === "couldNotRun" && <div className="row">{findButton}</div>}
        {p.block !== "couldNotRun" && <CopyButtons act={act} busy={busy} title={w.title} />}
        <div className="row"><button className="btn" type="button" onClick={act.close}>{S.pointClose}</button></div>
      </>}
      {p.stage === "done" && <>
        <div className="line"><b>{doneWords}</b></div>
        {p.result?.proof !== undefined && <Checks checks={checks} />}
        {!p.already && <div className="line muted">{w.doneMore}</div>}
        {p.result && <ResultBox r={p.result} undo={undo} explain={explain} act={act} />}
        <div className="row">
          {next && <button className="btn primary" type="button" disabled={busy} onClick={() => act.next(next.id)}>{S.practiceNext(S.practices[next.id].title, timeWords(next))}</button>}
          <button className={`btn${next ? "" : " primary"}`} type="button" onClick={act.back}>{S.practiceBack}</button>
        </div>
        {!next && <div className="line muted">{S.practiceAllDone}</div>}
        {next && <div className="line muted">{costWords(next)}</div>}
        <CopyButtons act={act} busy={busy} title={w.title} />
        <div className="row"><button className="btn" type="button" onClick={act.close}>{S.pointClose}</button></div>
      </>}
      {p.stage === "failed" && <>
        <div className="line">{failedWords}</div>
        {asks && <div className="line" role="status"><b>{S.receiptAsks}:</b> {asks}</div>}
        {asks && <div className="line muted">{S.practiceAsksHelp}</div>}
        {!p.checksFailed && !asks && p.where?.message && <div className="line muted">{placeLine(p.where)}</div>}
        {p.result && <ResultBox r={p.result} undo={undo} explain={explain} act={act} />}
        <div className="row">
          {asks && <button className="btn primary" type="button" onClick={act.showResult}>{S.practiceAnswer}</button>}
          {(p.checksFailed || p.nameSet) && <button className="btn primary" type="button" onClick={act.checkAgain}>{S.practiceCheckAgain}</button>}
          {task
            ? <button className={`btn${p.checksFailed || asks ? "" : " primary"}`} type="button" disabled={busy} onClick={act.fix}>{S.practiceAgain}</button>
            : <button className={`btn${p.checksFailed || p.nameSet ? "" : " primary"}`} type="button" onClick={act.lesson}>{S.practiceAgain}</button>}
        </div>
        <CopyButtons act={act} busy={busy} title={w.title} />
        <div className="row"><button className="btn" type="button" onClick={act.close}>{S.pointClose}</button></div>
      </>}
    </section>
  </>);
}

export type ListActions = { start: (id: string) => void; open: (id: string) => void; startOver: (id: string) => void; remove: (id: string) => void };

/** One practice in the list: what it is, what it teaches, about how long, the cost, and where the person is in it. */
function ListItem({ r, busy, open, act }: { r: ListRow; busy: boolean; open: boolean; act: ListActions }) {
  const [ask, setAsk] = useState<"startOver" | "remove" | null>(null);
  const overId = useId(), removeId = useId();
  const id = r.entry.id, blocked = busy || r.needsNode;
  return (
    <div className="line pr-item" role="group" aria-label={r.title}>
      {/* M51 step 3: the practice's tile, its name, and a done one's Proven stamp in place of its plain state (shown again
          while stamps are off in Settings). */}
      <div className="pr-head"><ItemTile label={r.title} big kind="fix" />
        <span className="pr-head-text"><b className="pr-name">{r.title}</b><span className={`pr-state${practiceStamp(r.state) ? " unstamped" : ""}`} data-state={r.state}>{S.practiceState[r.state]}</span>{practiceStamp(r.state) && <Stamp kind={practiceStamp(r.state)!} spoken />}</span></div>
      <div className="line">{r.teaches}</div>
      <div className="line muted">{r.time} · {r.cost}{r.needsNode ? ` · ${S.practiceNeedsNode}` : ""}</div>
      {!ask && <div className="row">
        {(r.state === "notStarted" || (r.state === "done" && !r.there)) && <button className="btn" type="button" disabled={blocked} aria-label={`${S.practiceStart}: ${r.title}`} onClick={() => act.start(id)}>{S.practiceStart}</button>}
        {r.state === "inProgress" && !open && <button className="btn" type="button" disabled={busy} aria-label={`${S.practiceContinue}: ${r.title}`} onClick={() => act.open(id)}>{S.practiceContinue}</button>}
        {r.there && <button id={overId} className="btn" type="button" disabled={blocked} aria-label={`${S.practiceStartOver}: ${r.title}`} onClick={() => setAsk("startOver")}>{S.practiceStartOver}</button>}
        {r.there && <button id={removeId} className="btn" type="button" disabled={busy} aria-label={`${S.practiceRemove}: ${r.title}`} onClick={() => setAsk("remove")}>{S.practiceRemove}</button>}
      </div>}
      {ask === "startOver" && (
        <ConfirmStep className="line" label={S.practiceStartOverSure} back={overId} onCancel={() => setAsk(null)}><div>{S.practiceStartOverSure}</div>
          <div className="row"><button className="btn primary" type="button" onClick={() => { setAsk(null); act.startOver(id); }}>{S.practiceStartOverYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {ask === "remove" && (
        <ConfirmStep className="line" label={S.practiceRemoveSure} back={removeId} onCancel={() => setAsk(null)}><div>{S.practiceRemoveSure}</div>
          <div className="row"><button className="btn danger" type="button" onClick={() => { setAsk(null); act.remove(id); }}>{S.practiceRemoveYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
    </div>
  );
}

/** The practice list on Learn, above the lessons. It never brings Learn forward by itself (home.ts). */
export function PracticeList({ rows, busy, nodeFix, withoutNode = null, note, damaged, openId, act }: { rows: ListRow[]; busy: boolean; nodeFix: string | null; withoutNode?: string | null; note: string; damaged: boolean; openId: string | null; act: ListActions }) {
  return (
    <section className="panel" aria-label={S.practiceListTitle}>
      <h2>{S.practiceListTitle}</h2>
      <div className="line muted">{S.practiceListHelp}</div>
      {damaged && <div className="line">{S.practiceRecordDamaged}</div>}
      {note && <div className="line" role="status">{note}</div>}
      {busy && <div className="line muted">{S.practiceBusy}</div>}
      {nodeFix && rows.some((r) => r.needsNode) && <div className="line">{S.practiceNodeList(nodeFix)}</div>}
      {withoutNode != null && !rows.some((r) => r.needsNode) && <div className="line muted">{S.practiceWithoutNode(withoutNode)}</div>}
      {rows.map((r) => <ListItem key={r.entry.id} r={r} busy={busy} open={openId === r.entry.id} act={act} />)}
    </section>
  );
}
