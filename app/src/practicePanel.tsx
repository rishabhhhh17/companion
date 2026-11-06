// The practice projects on Home's Learn tab: the panel that follows the practice open now (find it, fix it, prove it, with
// the result, Undo and Explain right here), and the list of every practice in catalog order. What each shows is decided in
// practice.ts and model.ts; card.tsx wires the buttons. Every control has words VoiceOver reads (a11y.test.ts), and every
// confirm step takes the keyboard to its safe choice (confirm.tsx). A plain Done, never a score or praise (rule 16).
import { useId, useRef, useState, type ReactNode } from "react";
import { threadLands } from "./homeFlow.ts";
import { ChangesCard } from "./changesCard.tsx";
import { ConfirmStep } from "./confirm.tsx";
import { FailingLine, fromTest, lineOf } from "./failingLine.tsx";
import { FlowMini } from "./flowflowMini.tsx";
import { Icon } from "./icons.tsx";
import { buttonShown } from "./groups.ts";
import { keyHint, type Keys } from "./keys.ts";
import { type ChangeAt, type Practice, type PracticeResult, type Problem, type ProofLine, type UndoState } from "./model.ts";
import { practicePath, threadOf, timeWords, type ListRow, type PracticeEntry, type Thread as ThreadState } from "./practice.ts";
import { S } from "./strings.ts";
import { useSetting } from "./settingsStore.ts";
import { undoneExcept } from "./undoWords.ts";
import "./ui/chrome.css";
import { SendBack } from "./reviewCard.tsx";
import { Button, Lead, ListGroup, ListRow as Row, Tag } from "./ui/parts.tsx";
import type { Colour } from "./meaning.ts";

const placeLine = (w?: { file?: string; line?: number; message?: string }) => `${w?.file ? `${w.file}, line ${w.line}: ` : ""}${w?.message ?? ""}`;

export type PanelActions = {
  find: () => void; fix: () => void; lesson: () => void; stopFix: () => void; stopChecks: () => void; checkAgain: () => void; close: () => void;
  where: (p: Problem) => void; why: (p: Problem) => void; showChanged: (at: ChangeAt) => void; showResult: () => void;
  undoAsk: (checkpoint: string) => void; undoYes: (checkpoint: string) => void; undoCancel: () => void;
  startOver: () => void; remove: () => void; next: (id: string) => void; back: () => void;
};

/** Find, fix, prove as a thread: a hairline with three nodes. A node fills with the water only when the stage after it was reached
 *  (practice.ts threadOf); the third stays empty when the checks did not pass. The state is in words too, never colour alone. */
function Thread({ t, landed = false }: { t: ThreadState; landed?: boolean }) {
  const rows: [keyof ThreadState, string][] = [["find", S.practiceThread.find], ["fix", S.practiceThread.fix], ["prove", S.practiceThread.prove]];
  return (
    <ol className="thread" aria-label={S.practiceThread.label} data-landed={landed ? "" : undefined}>
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
function Peek({ stage, review = false }: { stage: Practice["stage"]; review?: boolean }) {
  // Done rests: Flowflow's "done" plays its success flash, three drops that read as confetti over the card (M51 review). The
  // bubble and the ticks already say the checks pass; the reward is the evidence.
  const state = stage === "fixing" || stage === "proving" ? "working" : "idle";
  // While the fix or its checks run, Now carries the line (M51 polish: the same "On it." in two places read as chatter).
  // A found problem says "Found it" in the card itself, so the bubble does not say it a third time (the review of 5 Nov).
  const quiet = stage === "fixing" || stage === "proving" || stage === "found";
  return (
    <div className="pr-peek" aria-hidden="true">
      {/* M72 (item 16): the key practice's last step is the review looking again, so it says that, not that checks pass. */}
      {!quiet && <span className="say" key={stage}>{review && stage === "done" ? S.practiceKey.doneSay : S.practiceSay[stage]}</span>}
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

/** The fix's result where the practice is: what changed (never its cost, F29), Show me what changed, Undo (asked first) and Explain. */
function ResultBox({ r, undo, explain, act }: { r: PracticeResult; undo: UndoState | null; explain: ReactNode; act: PanelActions }) {
  const undoId = useId();
  const mine = undo && undo.checkpoint === r.checkpoint ? undo : null;
  const keepsMine = useSetting("undo.protectMyEdits") !== false;
  return (
    <div role="group" aria-label={S.practiceChanged}>
      {r.changed.length > 0 && <ChangesCard changed={r.changed} />}
      <div className="row">
        {r.changedAt && <button className="btn" type="button" onClick={() => act.showChanged(r.changedAt!)}>{S.showChanged}</button>}
        <button className="btn" type="button" onClick={act.showResult}>{S.practiceShowResult}</button>
      </div>
      {/* Undo is a quiet button, never the loudest on a win (the review of 5 Nov): it still asks first. */}
      {r.changed.length > 0 && !mine && <div className="row"><button id={undoId} className="btn quiet" type="button" onClick={() => act.undoAsk(r.checkpoint)}>{S.undo}</button></div>}
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

export function PracticePanel({ p, entry, folder, keys, checking, drawing, busy, nodeFix, note, next, undo, explain, act, checks = [], sendBack = "", retry = null }: {
  p: Practice; entry: PracticeEntry; folder: string; keys: Keys; checking: boolean; drawing: boolean; busy: boolean; nodeFix: string | null; note: string;
  next: PracticeEntry | null; undo: UndoState | null; explain: ReactNode; act: PanelActions; checks?: ProofLine[];
  /** M58 (feature 9): the key practice's Copy for my AI, the review's own send back text for this change. */
  sendBack?: string;
  /** M72 (the walkthrough, item 6): which try the fix is on ("Trying again (2 of 3)"), as Now says it. */
  retry?: string | null;
}) {
  const w = S.practices[entry.id];
  // M66 fix 17: proven while on screen, the thread lands once (its last line fills in, the tick draws in, the card glows
  // once; ui/homeFlow.css). Opened already done, it is simply done.
  const stageWas = useRef<string | null>(null), landed = useRef(false);
  if (threadLands(stageWas.current, p.stage)) landed.current = true; else if (p.stage !== "done") landed.current = false;
  stageWas.current = p.stage;
  const task = entry.fix === "task", gate = entry.find === "gate";
  // M58 (feature 9): the key practice is found by the review of the pretend AI's change, and fixed by a fixed move (no model).
  const review = entry.find === "review", fixed = entry.fix === "fixed";
  // A practice leans on three Flow tools (its check, its fix and its drawing). With Flow off their buttons are not drawn and one
  // plain line says so, so the panel never waits on an answer that cannot come. The check before going live is the core's.
  const canFind = gate || review || buttonShown("practiceFind"), canFix = fixed || buttonShown("practiceFix"), canWhy = buttonShown("practiceWhy");
  const findButton = canFind ? <button className="btn primary" type="button" disabled={checking || !!p.pretend} onClick={act.find}>{review ? S.practiceKey.go : gate ? S.practiceFindGate : S.practiceFind}</button> : null;
  const doneWords = p.already ? S.practiceDoneAlready : p.gaps ? S.practiceDoneGaps : entry.prove === "gate" ? S.practiceDoneGate : review ? S.practiceKey.done : S.practiceDone;
  // The fix stopped to ask something: it is answered in the follow up box under the result on Now, never tried again blind.
  const asks = p.stage === "failed" && !p.checksFailed && !p.result?.protectedChanged?.length ? p.result?.asks : undefined;
  const failedWords = p.checksFailed ? S.practiceChecksDidNotRun
    : p.result?.protectedChanged?.length ? S.practiceProtectedChanged
    : asks ? S.practiceAsks
    : entry.fix === "lesson" ? (p.nameSet ? S.practiceSettingNameSet : S.practiceSettingFailed)
    : entry.prove === "gate" && p.result?.proof !== "failed" ? S.practiceGateFailed : fixed ? S.practiceKey.notClean : S.practiceFailed;
  // Flowflow's peek is in the flow above the card, never laid over it, so it can never cross the tab row however tall its
  // line grows with bigger text (M51 review); the card is drawn over its foot, so it peeks over the card's top edge.
  return (<>
    <Peek stage={p.stage} review={review} />
    <section className="panel practice" aria-label={S.practiceTitle} data-stage={p.stage} data-landed={landed.current ? "" : undefined}>
      <h2>{S.practiceTitle}</h2>
      <div className="line muted">{w.title}</div>
      <Thread t={threadOf(p)} landed={landed.current} />
      {note && <div className="line" role="status">{note}</div>}
      {p.stage === "start" && <>
        <div className="line">{(gate ? S.practiceStartGate : S.practiceStartIn)(folder, w.start)}</div>
        {!gate && !review && <div className="line muted">{keyHint("problem", S.practiceKeys, keys)}</div>}
        {/* M58: the practice's pretend AI changed a file, and the review is looking at it (no model, no cost). */}
        {review && p.pretend && <div className="line" role="status">{S.practiceKey.wrote} {S.practiceKey.looking}</div>}
        {/* The house rule note, folded (the audit, item 41: three paragraphs stood before the buttons). */}
        {task && <details className="raw pr-rules"><summary><Icon name="chevron" size={12} />{S.practiceRulesTitle}</summary><p className="line muted">{S.practiceRulesNote}</p></details>}
        {!canFind && <div className="line" role="status">{S.groups.practiceNeedsFlow}</div>}
        <div className="row">{findButton}<button className="btn" type="button" onClick={act.close}>{S.practiceSkip}</button></div>
      </>}
      {p.stage === "found" && <>
        {/* The words say what is wrong; the proof row under them shows where, and the line itself, in the system mono. */}
        {review && <div className="line"><b>{S.practiceKey.stopped}</b></div>}
        <div className="line"><b>{S.practiceFound}</b> {lineOf(p.problem) ? (p.where?.message ?? lineOf(p.problem)!.message) : placeLine(p.where)}</div>
        {/* A test's own line is not what the learner changes, so it waits behind Details (the audit, item 41). */}
        {fromTest(p.problem) ? <details className="raw"><summary><Icon name="chevron" size={12} />{S.checkDetails}</summary><FailingLine problem={p.problem} /></details> : <FailingLine problem={p.problem} />}
        {p.undone && <div className="line">{S.practiceUndone}</div>}
        <div className="line muted">{w.foundMore}</div>
        {task && !canFix && <div className="line" role="status">{S.groups.practiceNeedsFlow}</div>}
        <div className="row">
          {p.problem && <button className="btn" type="button" onClick={() => act.where(p.problem!)}>{S.pointWhere}</button>}
          {p.problem && canWhy && <button className="btn" type="button" disabled={drawing} onClick={() => act.why(p.problem!)}>{S.drawWhy}</button>}
          {task || fixed
            ? canFix && <button className="btn primary" type="button" disabled={busy} onClick={act.fix}>{p.undone ? S.practiceAgain : S.practiceFix}</button>
            : <button className="btn primary" type="button" onClick={act.lesson}>{S.practiceSettingFix}</button>}
          {/* M58: Copy for my AI, the review's own words for the AI tool (secrets hidden again by the engine). */}
          {review && sendBack && <SendBack text={sendBack} label={S.fixRun.copyForAi} />}
          <button className="btn quiet" type="button" onClick={act.close}>{S.practiceSkip}</button>
        </div>
        {review && sendBack && <div className="line muted">{S.review.sendBackHelp}</div>}
        {p.why && review && <div className="line muted" role="status">{p.why}</div>}
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
        <div className="line" role="status">{fixed ? S.practiceKey.fixing : S.practiceFixing}</div>
        {retry && <div className="line" role="status">{retry}</div>}
        {/* Stops the task the way the task card's Stop does, then closes: nothing keeps running or spending. The key
            practice's fixed move is one quick step with no task to stop. */}
        {!fixed && <div className="row"><button className="btn" type="button" onClick={act.stopFix}>{S.practiceStopFix}</button></div>}
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
          {next ? <button className="btn primary" type="button" disabled={busy} onClick={() => act.next(next.id)}>{S.practiceNext(S.practices[next.id].title, timeWords(next))}</button>
            : <button className="btn primary" type="button" onClick={act.back}>{S.practiceBack}</button>}
        </div>
        {!next && <div className="line muted">{S.practiceAllDone}</div>}
        {/* The rest is one fold with one line on what each does (the review of 5 Nov), so a win is not seven buttons. */}
        <details className="more-fold">
          <summary>{S.practiceMore}</summary>
          <div className="line muted">{S.practiceMoreNote}</div>
          <div className="row"><button className={`btn${next ? "" : " primary"}`} type="button" onClick={act.back}>{S.practiceBack}</button></div>
          <CopyButtons act={act} busy={busy} title={w.title} />
          <div className="row"><button className="btn" type="button" onClick={act.close}>{S.pointClose}</button></div>
        </details>
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
          {task || fixed
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

/** M71: each practice's own tile colour, in catalog order (the mock: a Join button purple, the key teal, the page pink). */
const PRACTICE_COLOURS: readonly Colour[] = ["purple", "teal", "pink", "orange", "green", "blue"];
export const practiceColour = (i: number): Colour => PRACTICE_COLOURS[i % PRACTICE_COLOURS.length];

/** The practice list on Learn (M71, one structure): the next practice leads as the one featured card, in a faint purple,
 *  with its Start; then every practice as a row of the one grouped list, each with its own tile colour and number, its
 *  one line and its time (Done, in green, once proven). A row opens its practice: Start, Continue, or Start over (asked
 *  first). A practice with a copy on this Mac has Remove my copy on the right, asked first. It never brings Learn
 *  forward by itself (home.ts). No cost line (F29). */
export function PracticeList({ rows, busy, nodeFix, withoutNode = null, note, damaged, openId, opening = null, act, onTour }: { rows: ListRow[]; busy: boolean; nodeFix: string | null; withoutNode?: string | null; note: string; damaged: boolean; openId: string | null;
  /** M72 (the walkthrough, item 5): the practice being opened now (its copy is being made), said where it was pressed. */
  opening?: string | null; act: ListActions;
  /** The recorded first run again (firstLook.ts), the featured card's quiet button. */
  onTour?: () => void }) {
  // back: the press that opened the question, which gets the keyboard back when it closes (the row's button, or its action).
  const [ask, setAsk] = useState<{ id: string; what: "startOver" | "remove"; back: string } | null>(null);
  const base = useId(), rowId = (id: string, what: string) => `${base}-${what}-${id}`;
  // The practice open on Now is under way even before its copy is recorded, so the list never says Not started beside the
  // practice card's Find it: Now (the review, 2 Nov 2026).
  const stateOf = (r: ListRow): ListRow["state"] => (openId === r.entry.id && r.state === "notStarted" ? "inProgress" : r.state);
  // The featured card: the practice to do now (practice.ts practicePath), unless it is already open in its own card above.
  const leadId = openId ? null : practicePath(rows);
  const lead = rows.find((r) => r.entry.id === leadId) ?? null;
  const allDone = rows.length > 0 && rows.every((r) => r.state === "done");
  const askRow = ask ? rows.find((r) => r.entry.id === ask.id) ?? null : null;
  // The press that opened a question gets the keyboard back when it closes: the row (Start over), or its action.
  const overId = ask?.back ?? "", removeId = ask?.back ?? "";
  return (
    <section className="learn" aria-label={S.practiceListTitle}>
      {lead ? (
        <Lead className="ui-feature learn-lead" meaning="practice" labelledBy={`${base}-lead`}
          tag={<Tag meaning="practice" words={lead.state === "inProgress" ? S.practiceState.inProgress : undefined} />}
          title={<h2 className="ui-lead-title" id={`${base}-lead`}>{lead.title}</h2>}
          line={<><p className="ui-lead-line">{lead.teaches}</p><p className="learn-lead-fact" role="status">{opening === lead.entry.id ? S.practiceOpening : <>{lead.time}{lead.needsNode ? ` · ${S.practiceNeedsNode}` : ""}</>}</p></>}
          actions={<>
            <Button kind="primary" disabled={busy || lead.needsNode || !!opening} label={`${lead.state === "inProgress" ? S.practiceContinue : S.practiceStart}: ${lead.title}`}
              onClick={() => (lead.state === "inProgress" && lead.there ? act.open(lead.entry.id) : act.start(lead.entry.id))}>{lead.state === "inProgress" ? S.practiceContinue : S.practiceStart}</Button>
            {onTour && <Button kind="secondary" onClick={onTour}>{S.firstLook.watch}</Button>}
          </>} />
      ) : allDone ? (
        <Lead className="ui-feature learn-lead" meaning="proven" labelledBy={`${base}-lead`} tag={<Tag meaning="proven" />}
          title={<h2 className="ui-lead-title" id={`${base}-lead`}>{S.practiceAllDoneTitle}</h2>} line={<p className="ui-lead-line">{S.practiceAllDone}</p>} />
      ) : null}
      {damaged && <p className="page-caption">{S.practiceRecordDamaged}</p>}
      {note && <p className="page-caption" role="status">{note}</p>}
      {/* The open practice is itself the work in progress: then this line has nothing to add (M72, item 6). */}
      {busy && !openId && <p className="page-caption">{S.practiceBusy}</p>}
      {nodeFix && rows.some((r) => r.needsNode) && <p className="page-caption">{S.practiceNodeList(nodeFix)}</p>}
      {withoutNode != null && !rows.some((r) => r.needsNode) && <p className="page-caption">{S.practiceWithoutNode(withoutNode)}</p>}
      <ListGroup label={S.practiceListTitle} shown>
        {rows.map((r, i) => {
          const id = r.entry.id, state = stateOf(r), open = openId === id, blocked = busy || r.needsNode || !!opening;
          const rowOver = rowId(id, "row"), rowAct = rowId(id, "act");
          const short = (S.practices[id as keyof typeof S.practices] as { short?: string } | undefined)?.short ?? r.teaches;
          // What a press on the row does: start it, carry on with it, or (done, with its copy here) start over, asked first.
          const go = state === "done" && r.there ? () => setAsk({ id, what: "startOver", back: rowOver })
            : state === "inProgress" && !open ? () => act.open(id)
            : state === "notStarted" || (state === "done" && !r.there) ? () => act.start(id) : undefined;
          const goWord = state === "done" && r.there ? S.practiceStartOver : state === "inProgress" ? S.practiceContinue : S.practiceStart;
          return <Row key={id} id={rowOver} colour={state === "done" ? "green" : practiceColour(i)} icon={state === "done" ? "tick" : undefined} mark={state === "done" ? undefined : String(i + 1)}
            title={r.title} line={opening === id ? S.practiceOpening : state === "inProgress" ? S.practiceState.inProgress : short}
            fact={state === "done" ? S.practiceState.done : S.practiceMin(r.entry.minutes)} factColour={state === "done" ? "green" : undefined}
            onOpen={go && !blocked ? go : undefined} openLabel={`${goWord}: ${r.title}`}
            // M72 (finding 5): a practice under way with its copy here can be started over (asked first; Remove my copy is
            // inside that question). Any other practice with a copy has Remove my copy, asked first.
            action={!r.there || busy ? null
              : state === "inProgress" && r.there ? { id: rowAct, label: S.practiceStartOver, colour: "grey", ariaLabel: `${S.practiceStartOver}: ${r.title}`, onClick: () => setAsk({ id, what: "startOver", back: rowAct }) }
              : { id: rowAct, label: S.practiceRemove, colour: "grey", ariaLabel: `${S.practiceRemove}: ${r.title}`, onClick: () => setAsk({ id, what: "remove", back: rowAct }) }} />;
        })}
        {!lead && onTour && <Row colour="blue" icon="eye" title={S.practiceTourRow} line={S.practiceTourLine} onOpen={onTour} openLabel={S.firstLook.watch} />}
      </ListGroup>
      {ask && askRow && ask.what === "startOver" && (
        <ConfirmStep className="learn-ask" label={S.practiceStartOverSure} back={overId} onCancel={() => setAsk(null)}><p className="learn-ask-line">{askRow.title}. {S.practiceStartOverSure}</p>
          <div className="row"><Button kind="primary" onClick={() => { setAsk(null); act.startOver(ask.id); }}>{S.practiceStartOverYes}</Button>
            {/* M72: the copy can be removed from here too (an in progress row's own action is Start over). */}
            <Button kind="quiet" onClick={() => setAsk({ ...ask, what: "remove" })}>{S.practiceRemove}</Button>
            <button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {ask && askRow && ask.what === "remove" && (
        <ConfirmStep className="learn-ask" label={S.practiceRemoveSure} back={removeId} onCancel={() => setAsk(null)}><p className="learn-ask-line">{askRow.title}. {S.practiceRemoveSure}</p>
          <div className="row"><Button kind="danger" onClick={() => { setAsk(null); act.remove(ask.id); }}>{S.practiceRemoveYes}</Button><button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
    </section>
  );
}
