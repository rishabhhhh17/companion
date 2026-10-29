import { StrictMode, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EMPTY_LINE, liveLine, type LiveLine } from "./a11y.ts";
import { ConfirmStep } from "./confirm.tsx";
import { SharedFilesRow } from "./sharedFilesRow.tsx";
import { focusBack, focusIfLost, keepFocus, takeIfLost } from "./focus.ts";
import { allScreensOn, voiceHint as talkKeysLine } from "./settings.ts";
import { layoutDiagram } from "./layout.ts";
import { answered, asksWorked, atLimit, clicked, judged, nextQuestion, settlesBeforeLook, waitsForPage } from "./anywhere.ts";
import { EVERYDAY_ASK, checkQuestion, everydayGoal, everydayStepsAsk, frontOf, heroRoute, mainAction, nextLookMode, whyShown } from "./everyday.ts";
import { answerPlayer, leadMs, lineMs, planSteps, sequenceOver, stepsLine, stillWanted, targetsOf, type Step } from "./sequence.ts";
import { alsoSayLines, askedByVoice, followVoiceShowMe, lineByVoice, lineFor, newReply, repliesIn, repliesOn, speakWhen, speechOn, spokenNote, voiceShowMe, wordsToSay, type AskKind, type VoiceQuestion } from "./speech.ts";
import { guessWords } from "./pointer.ts";
import { noteSpeed, spokenSpeed, voiceSettingsFrom } from "./voicesettings.ts";
import { AGENT, SETTINGS_LESSON_ID, undoPutBack, releaseAgent, watchAdd, watchCheck, watchFix, watchList, watchPause, watchRemove, whereWasI, fixWatch, checkBrowser, getBrowser, NO_PROJECT, metricsNote, walkActed, walkAnswer, walkList, walkSkip, walkStart, walkStop, fixFound, VERCEL_LESSON_ID, askDiagram, inspectProject, installPackages, findProblem, shipLive, shipPreview, shipRollback, answerAgents, askRecap, editLine, eraseMemory, exportMemory, forgetLine, listMemory, checkShip, answerApproval, approvePlan, askResearch, chooseLoop, diagnose, pauseDrive, resumeDrive, listTasks, planDrive, startTask, stopAgent, undo, followUp, retryTask, pointChange, tryNextOne, checkMyChange, findBreakingTask, undoOneTask, fixError, warmEngine, checkMac , newFolderTask} from "./commands.ts";
import { browserView, confirmable, shipWords, phWords, blockedNote, characterWords, savedWords, pausedWords, driveWords, formatUsd, historyWords, isFixing, triesNote, notDoneReason, plainPath, stateLabel, pointsOnScreen, activityNow, canFollowUp, canRetry, stuckWords, stuckHelpWords, planCutWords, canOfferTurn, receiptHeading, receiptProofWords, receiptSaid, cardWorking, teachActions, teachLines, bisectLines, canBisect, ehLines, slLines, slSources, releasable, foundHandsOver, awayFolder, folderName, lessonWordsOnly } from "./model.ts";
import { invoke, listen } from "./tauri.ts";
import type { Explain, HistoryItem, MemoryLine, Practice, Problem, UndoState } from "./model.ts";
import { NO_RECORD, backTo, canStart, copyOf, lessonsShown, listRows, markFor, needsMacCheck, nextPractice, nodeMissing, pointFixRoute, practiceNotes, practiceOf, recordFrom, resumeOnOpen, startOrOpen, workingOn, type PracticeRecord } from "./practice.ts";
import { PracticeList, PracticePanel } from "./practicePanel.tsx";
import { Onboarding } from "./onboarding.tsx";
import { afterInstallFailed, autoCheckDue, found, installAllowed, isBusy, readyVersion, updateLine } from "./updates.ts";
import { useModel } from "./useModel.ts";
import { PH_KEYS_MS, acceptHint, armedFor, canPick, choicesFrom, chordLabel, keyHint, keyProblem, keysFrom, keysIn, setKeysNow, type Choices, type Job, type Keys } from "./keys.ts";
import { useKeys } from "./useKeys.ts";
import { followLessMotion } from "./motion.ts";
import { arrivalFrom, closesOnClickAway, homeReduce, homeStart, markedLine, need, phArmable, shownOn, stepsAside, tabId, tabName, tabPanelId, typing, type HomeArrival, type Panel, type Tab } from "./home.ts";
import { HOME_PLACES, heroWords, placeAfter, stopCan, undoCan } from "./homeHero.ts";
import { HomeCharacter } from "./homeCharacter.tsx";
import { approvalWords } from "./approvals.ts";
import { Waterline } from "./waterline.tsx";
import { useLook } from "./useLook.ts";
import { AGAIN_EVENT, onboardedNow } from "./firstRunAgain.ts";
import { ProofChips } from "./proofChipsView.tsx";
import { FirstLook } from "./firstLook.tsx";
import { S } from "./strings.ts";
import { failNote } from "./failwords.ts";
import { CheckDetail, checkParts } from "./checkDetail.tsx";
import { undoneExcept } from "./undoWords.ts";
import { fixWhat, watchesOf } from "./watch.ts";
import type { NewFolderKind, WatchKind, WatchView } from "../../protocol/index.ts";
import { WatchPanel } from "./watchPanel.tsx";
import { buttonShown, followPendingAfter, invitation, learnShown, offLine, refusalNotice, toolOn, triedList, usedBy, useGroups } from "./groups.ts";
import { applyTextSize, textSize, textSizeFrom } from "./textsize.ts";
import { SettingsPage, settingsPlaces } from "./settingsPage.tsx";
import { groupPlaces } from "./settingsGroups.ts";
import { characterName } from "./companion.ts";
import { changeSetting, migrateFromPageStorage, setting, settingsReady, startSettings, useSetting } from "./settingsStore.ts";
import { offBoxAfter, offRecordAtStart, recapDue, toastMs } from "./memorySettings.ts";
import { webLink } from "./links.ts";
import { DRAFT_KEY, askKey, boxTakesKeyboard, draftToKeep, heardGoesTo, heardKind, putBack, sendsItself, sentOutcome, type FollowAim, type HeardKind, type Sent } from "./askbox.ts";
import { aboutCopy, copyable, ehCopy, slCopy, explainCopy, receiptCopy, recapCopy, rescueCopy, researchCopy } from "./copytext.ts";
import { HISTORY_STATUSES, NO_FILTER, filterHistory, historyFiltering, historyUndo, type HistoryQuery, type HistoryStatus } from "./history.ts";
import { SEEN_VERSION_KEY, whatsNew, type Release } from "./whatsnew.ts";
import { DropList, useDrop } from "./dropRing.tsx";
import { Icon } from "./icons.tsx";
import { addFiles, addedLine, blocksDrop, carriesFiles, checkAttachments, chipLabel, forRequest, mergeAdded, pastedFiles, removeFile, shellReader, DOC_LIMIT_KEY, docLimitBytes, type Attached, type FileLike } from "./attachfiles.ts";
import "./style.css";

const send = (cmd: unknown) => invoke("send_command", { cmd });
// Beta numbers: a fixed name, counted only if the person turned numbers on.
const SESSION_GAP_MS = 30 * 60 * 1000;
const count = (name: string) => { void send(metricsNote(name)); };
// When the person last used the card. Kept only on this Mac, in this page's own storage. Where was I is asked for after the
// break the person chose (where.after, memorySettings.ts).
const SEEN_KEY = "companion.lastSeen";
const lastSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
const touch = () => { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* storage may be unavailable */ } };
// While a person is composing text (Japanese, Chinese, Korean...) Enter and Esc belong to the input method, not to us.
const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

// Fixes it with you: under the receipt, one line to say what is still wrong (Enter sends), and Try again after a task that
// was not done. Each one runs as a new checked task. It never takes keyboard focus by itself. Its words are kept by the card
// (`text`), so hold to talk can put spoken words into it (heardGoesTo, askbox.ts); Esc empties it first, and only an empty
// box lets Esc close Home as before.
// answer: the task ended on a question, so what is typed (or spoken) here is the answer to it.
function FollowUpBox({ project, retry, sending, text, setText, listening, onSent, onRefused, answer }: { project: string; retry: boolean; sending: boolean; text: string; setText: (t: string) => void; listening: boolean; onSent: (words: boolean) => void; onRefused: (e: unknown) => void; answer?: boolean }) {
  const sendIt = () => {
    const c = followUp(project, text);
    if (!c || sending) return;
    onSent(true); void send(c).catch(onRefused); setText("");
  };
  return (
    <div className="followup">
      {retry && (
        <div className="row">
          <button className="btn primary" type="button" disabled={sending} onClick={() => { if (sending) return; onSent(false); void send(retryTask(project)).catch(onRefused); }}>{S.tryAgain}</button>
          <span className="muted">{S.tryAgainHelp}</span>
        </div>
      )}
      <div className="row">
        <input type="text" autoComplete="off" spellCheck={false} value={text} disabled={sending} placeholder={listening ? S.followUpListening : answer ? S.followUpAnswer : S.followUpPlaceholder} aria-label={answer ? S.followUpAnswerLabel : S.followUpLabel}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !composing(e)) { e.preventDefault(); sendIt(); }
            if (e.key === "Escape" && !composing(e) && text) { e.preventDefault(); e.stopPropagation(); setText(""); }
          }} />
        <button className="btn" type="button" disabled={sending || !text.trim()} onClick={sendIt}>{sending ? S.followUpSending : S.followUpSend}</button>
      </div>
      <div className="line muted">{S.followUpHelp}</div>
    </div>
  );
}

// title and note: the same box for an everyday fix's why (everyday.ts whyShown), open from the start there.
function ExplainBox({ e, title = S.explainTitle, note = S.explainCost, open = false }: { e: Explain; title?: string; note?: string; open?: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <details className="explain" open={open}>
      <summary>{title} <span className="muted">· {note}</span></summary>
      <ul>{e.bullets.map((b, i) => <li className="line answer" key={i}>{b}</li>)}</ul>
      <div className="row"><CopyButton text={explainCopy(e)} label={S.copyAnswer} /></div>
      {e.question && (
        <div>
          <div className="line"><b>{S.explainCheck}:</b> {e.question.text}</div>
          <div className="row">
            {e.question.options.map((o, i) => <button key={i} className="btn" type="button" disabled={picked !== null} onClick={() => setPicked(i)}>{o}</button>)}
          </div>
          {picked !== null && <div className="line" role="status">{picked === e.question.correct ? S.explainRight : `${S.explainNot} ${e.question.options[e.question.correct]}`}</div>}
        </div>
      )}
    </details>
  );
}

// Opens a web address in the person's own browser, only when this button is pressed (rule: never from text the model
// wrote by itself). The site's real name is on the button. The Mac side checks the address again (share.rs web_link).
// This is the only place Home asks for a link to be opened (links.test.ts checks that).
// Once the page really opened, Home may step aside so the browser is not under it (home.stepAside; Card sets this).
const opened = { stepAside: () => {} };
function OpenButton({ url, onNote }: { url: string; onNote: (note: string) => void }) {
  const l = webLink(url);
  if (!l) return null;
  return <button className="btn" type="button" onClick={() => void invoke("open_link", { url: l.url }).then(() => { onNote(""); opened.stepAside(); }).catch((e) => onNote(String(e)))}>{S.openSite(l.host)}</button>;
}

// Copy: puts what the card shows on the clipboard, only on a press (copytext.ts hides anything that looks like a key again
// first). The Mac side writes it (copy_text, the same clipboard as Copy link); the page's own clipboard is the fallback.
// The page makes the Mac side's own check first (copyable), so the fallback only ever takes text the Mac side would have
// taken, never what it refused. Says so when it could not copy, so a failure is never silent.
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  if (!text) return null;
  const copy = () => {
    setState("idle");
    const ok = copyable(text);
    if (ok === null) { setState("failed"); return; }
    void invoke("copy_text", { text: ok }).catch(() => navigator.clipboard?.writeText(ok) ?? Promise.reject(new Error("no clipboard"))).then(() => { setState("copied"); setTimeout(() => setState("idle"), 2500); }).catch(() => setState("failed"));
  };
  // The button keeps its name, so VoiceOver hears Copied or the failure on a polite line that is there before either.
  return <>
    <button className="btn" type="button" aria-label={label} onClick={copy}>{state === "copied" ? S.copied : S.copy}</button>
    <span className={state === "failed" ? "line" : "sr"} role="status">{state === "copied" ? S.copied : state === "failed" ? S.copyFailed : ""}</span>
  </>;
}

// One research note and where it came from. Its source was written by the model, so it opens only on a press, and the
// button names the site it really goes to.
function ResearchNote({ text, source }: { text: string; source: string }) {
  const [note, setNote] = useState("");
  return (
    <div className="line">
      {text} <span className="muted">{source}</span> <OpenButton url={source} onNote={setNote} />
      {note && <div className="line" role="status">{note}</div>}
    </div>
  );
}

// A web address shown on Home, with its Open button.
function LinkLine({ label, url, strong }: { label: string; url: string; strong?: boolean }) {
  const [note, setNote] = useState("");
  return (
    <div className={`line${strong ? "" : " muted"}`}>
      {strong ? <b>{label}: {url}</b> : <>{label}: {url}</>} <OpenButton url={url} onNote={setNote} />
      {note && <div className="line" role="status">{note}</div>}
    </div>
  );
}

function OnlineBox({ f, project, onClose }: { f: { stage: string; detail: string; previewUrl?: string; productionUrl?: string; canGoLive?: boolean; card?: { image: string; url: string; title: string } }; project: string; onClose: () => void }) {
  const [ask, setAsk] = useState<"live" | "back" | null>(null);
  const [shared, setShared] = useState("");
  const liveId = useId(), rollId = useId();
  const busy = ["checking_gates", "deploying", "checking_preview"].includes(f.stage);
  return (
    <section className={`panel ${f.stage === "failed" || f.stage === "refused" || f.stage === "not_signed_in" ? "amber" : ""}`} role="status" aria-label={S.onlineTitle}>
      <h2>{S.onlineTitle}</h2>
      <div className="line">{f.detail}</div>
      {f.previewUrl && <LinkLine label={S.previewAddress} url={f.previewUrl} />}
      {f.productionUrl && <LinkLine label={S.liveAddress} url={f.productionUrl} strong />}
      {f.stage === "ready" && f.canGoLive && ask !== "live" && <div className="row"><button id={liveId} className="btn primary" type="button" onClick={() => setAsk("live")}>{S.makeLive}</button></div>}
      {ask === "live" && f.previewUrl && (
        <ConfirmStep className="row" label={S.liveSure} back={liveId} onCancel={() => setAsk(null)}>
          <span className="line">{S.liveSure}</span>
          <button className="btn primary" type="button" onClick={() => { void send(shipLive(project, f.previewUrl!)); setAsk(null); }}>{S.liveYes}</button>
          <button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button>
        </ConfirmStep>
      )}
      {f.stage === "live" && f.card && (
        <figure className="receipt-shot">
          <img src={`data:image/jpeg;base64,${f.card.image}`} alt={`${f.card.title} ${S.isLive}`} />
          <div className="row">
            <button className="btn primary" type="button" onClick={() => void invoke("save_share_card", { image: f.card!.image, title: f.card!.title }).then((n) => setShared(`${S.savedTo} ${String(n)}`)).catch((e) => setShared(failNote(e, "picture")))}>{S.savePicture}</button>
            <button className="btn" type="button" onClick={() => void invoke("copy_link", { url: f.card!.url }).then(() => setShared(S.linkCopied)).catch((e) => setShared(failNote(e, "link")))}>{S.copyLink}</button>
            <OpenButton url={f.card.url} onNote={setShared} />
          </div>
          {shared && <div className="line muted" role="status">{shared}</div>}
        </figure>
      )}
      {f.stage === "live" && ask !== "back" && <div className="row"><button id={rollId} className="btn" type="button" onClick={() => setAsk("back")}>{S.rollBack}</button></div>}
      {ask === "back" && (
        <ConfirmStep className="row" label={S.rollSure} back={rollId} onCancel={() => setAsk(null)}>
          <span className="line">{S.rollSure}</span>
          <button className="btn primary" type="button" onClick={() => { void send(shipRollback(project)); setAsk(null); }}>{S.rollYes}</button>
          <button className="btn" type="button" data-cancel onClick={() => setAsk(null)}>{S.planCancel}</button>
        </ConfirmStep>
      )}
      {!busy && <div className="row"><button className="btn" type="button" onClick={onClose}>{S.onlineClose}</button></div>}
    </section>
  );
}

// What I did: the project's tasks, newest first, with a search by words in their name and by how they ended (history.ts).
// Without a search the newest 20 show; with one, every match among the tasks the engine sent.
// Undo (finding H): on the newest task that changed files only (history.ts historyUndo), with the same yes / keep question and
// the same words as the receipt's Undo. The state is the page's one undo (m.undo), so the receipt on Now shows the same step.
function HistoryPanel({ items, q, setQ, undoState: u, project, keepsMine, dispatch }: { items: HistoryItem[]; q: HistoryQuery; setQ: (q: HistoryQuery) => void; undoState: UndoState | null; project: string; keepsMine: boolean; dispatch: (e: { type: string; [k: string]: unknown }) => void }) {
  const filtering = historyFiltering(q);
  const shown = filtering ? filterHistory(items, q) : items.slice(0, 20);
  const undoId = useId();
  const offers = project ? shown.map((h) => historyUndo(items, h, u?.stage === "done" ? u.checkpoint : null)) : [];
  const explainWhy = offers.includes("older");
  return (
    <section className="panel" aria-label={S.recentTitle}>
      <h2>{S.recentTitle}</h2>
      {items.length === 0 && <div className="line muted">{S.homeHistoryNone}</div>}
      {items.length > 0 && (
        <div className="row" role="search">
          <input type="search" autoComplete="off" spellCheck={false} value={q.words} placeholder={S.historySearch} aria-label={S.historySearch}
            onChange={(e) => setQ({ ...q, words: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Escape" && !composing(e) && q.words) { e.preventDefault(); e.stopPropagation(); setQ({ ...q, words: "" }); } }} />
          <select aria-label={S.historyStatusLabel} value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value as HistoryStatus })}>
            {HISTORY_STATUSES.map((s) => <option key={s} value={s}>{S.historyStatus[s]}</option>)}
          </select>
          {filtering && <button className="btn" type="button" onClick={() => setQ(NO_FILTER)}>{S.historyClear}</button>}
        </div>
      )}
      {items.length > 0 && <div className={filtering ? "line muted" : "sr"} role="status" aria-live="polite">{filtering ? (shown.length ? S.historyMatches(shown.length, items.length) : S.historyNoMatch) : ""}</div>}
      {filtering && items.length >= 50 && <div className="line muted">{S.historyRecent}</div>}
      {shown.map((h, i) => { const backId = `${undoId}-${h.id}`; return (
        <div className="line" key={h.id}>
          <div>{h.label} <span className="muted">· {historyWords(h)} · {formatUsd(h.usd)}</span></div>
          {offers[i] === "undo" && !u && <div className="row"><button id={backId} className="btn danger" type="button" onClick={() => dispatch({ type: "ui.undoAsked", checkpoint: h.checkpoint })}>{S.historyUndo}</button></div>}
          {h.checkpoint && u?.checkpoint === h.checkpoint && project && (<>
            {u.stage === "confirm" && (
              <ConfirmStep className="line" label={S.undoSure} back={backId} onCancel={() => dispatch({ type: "ui.undoCancelled" })}><div>{S.undoSure}</div><div>{keepsMine ? S.undoKeeps : S.undoReplaces}</div>
                <div className="row">
                  <button className="btn danger" type="button" onClick={() => { dispatch({ type: "ui.undoSent" }); void send(undo(project, h.checkpoint!)); }}>{S.undoYes}</button>
                  <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.undoCancelled" })}>{S.undoNo}</button>
                </div></ConfirmStep>
            )}
            {u.stage === "working" && <div className="line" role="status">{S.undoWorking}</div>}
            {u.stage === "failed" && <div className="line" role="alert">{u.note}</div>}
            {u.stage === "done" && <div className="line" role="status">{u.yours?.length ? undoneExcept(u.yours) : S.undone}{u.recovered ? ` ${S.undoRecovered}` : ""}{u.large ? ` ${S.undoLarge}` : ""}</div>}
          </>)}
        </div>
      ); })}
      {explainWhy && <div className="line muted">{S.historyUndoWhy}</div>}
    </section>
  );
}

function MemoryList({ title, scope, lines, project }: { title: string; scope: "project" | "profile"; lines: MemoryLine[]; project: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sure, setSure] = useState(false);
  // Each line's Edit button, so the keyboard goes back to it after the line is saved or Esc puts the box away.
  const base = useId(), editId = (line: string) => `${base}-edit-${line}`, eraseId = `${base}-erase`;
  const save = (id: string) => { void send(editLine(project, scope, id, text)); setEditing(null); focusBack(editId(id)); };
  return (
    <div role="group" aria-label={title}>
      <h2>{title}</h2>
      {lines.length === 0 && <div className="line muted">{S.memoryEmpty}</div>}
      {lines.map((l) => (
        <div className="line" key={l.id}>
          {editing === l.id ? (
            <div className="row">
              <input ref={focusIfLost} type="text" value={text} aria-label={`${S.memoryEdit}: ${l.text}`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(l.id); if (e.key === "Escape") { e.stopPropagation(); setEditing(null); focusBack(editId(l.id)); } }} />
              <button className="btn" type="button" onClick={() => save(l.id)}>{S.memorySave}</button>
            </div>
          ) : (
            <>
              {l.text} <span className="muted">· {S.memoryFrom} {l.source}{l.date ? `, ${l.date}` : ""}</span>
              <span className="row">
                <button id={editId(l.id)} className="btn" type="button" aria-label={`${S.memoryEdit}: ${l.text}`} onClick={() => { setEditing(l.id); setText(l.text); }}>{S.memoryEdit}</button>
                <button className="btn danger" type="button" aria-label={`${S.memoryForget}: ${l.text}`} onClick={() => void send(forgetLine(project, scope, l.id))}>{S.memoryForget}</button>
              </span>
            </>
          )}
        </div>
      ))}
      {lines.length > 0 && !sure && <div className="row"><button id={eraseId} className="btn" type="button" aria-label={`${S.memoryErase}: ${title}`} onClick={() => setSure(true)}>{S.memoryErase}</button></div>}
      {sure && (
        <ConfirmStep className="row" label={S.memoryEraseSure} back={eraseId} onCancel={() => setSure(false)}>
          <span className="line">{S.memoryEraseSure}</span>
          <button className="btn danger" type="button" onClick={() => { void send(eraseMemory(project, scope)); setSure(false); }}>{S.memoryEraseYes}</button>
          <button className="btn" type="button" data-cancel onClick={() => setSure(false)}>{S.planCancel}</button>
        </ConfirmStep>
      )}
    </div>
  );
}

function Card() {
  useLook();   // the water's colour and Home's theme chosen in Settings (M19)
  const [m, dispatch] = useModel();
  // A command of a tool whose group is switched off is refused with one plain line (the shell, then the engine). The line is
  // shown, and whatever waiting state the press had set is closed, so nothing stays on "checking", "fixing" or "asking".
  const explainRefusal = (e: unknown) => { const line = refusalNotice(e); if (line) dispatch({ type: "app.notice", message: line }); };
  const sendOrExplain = (cmd: unknown, closed?: () => void): Promise<void> => send(cmd).then(() => undefined, (e) => { closed?.(); explainRefusal(e); });
  // The model as it is now, for callbacks set up once (a click elsewhere, a practice button pressed after a change).
  const nowModel = useRef(m); nowModel.current = m;
  // Groups of tools (F20): re-draws when a group is switched; the buttons of a group that is off are not drawn.
  const groups = useGroups();
  // The first real use of a tool is kept on this Mac (tried, groups.tried), only from what the engine reports, and only once.
  // A follow up's task is told apart from a new one by the press that started it.
  const followPending = useRef(false);
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string } | null;
      const used = usedBy(ev, { followUp: followPending.current, walk: !!nowModel.current.walk });
      followPending.current = followPendingAfter(ev, followPending.current);
      const done = triedList();
      for (const tool of used) if (!done.includes(tool)) void invoke("tried_mark", { tool }).catch(() => {});
    });
    return () => { off.then((f) => f()); };
  }, []);
  // The keys every job uses now (keymap.rs keeps them): every line on the card that names a key is filled from them.
  const keys = useKeys();
  useEffect(() => { void invoke("key_map").then((v) => setKeysNow(keysFrom(v))).catch(() => {}); }, []);
  // Home (F18): the card in tabs. Each part of the old card shows only on its own tab, or on every tab (home.ts); a tab
  // that needs the person is shown by itself, once per new need, and said out loud because the keyboard focus does not
  // move there.
  const [home, homeDispatch] = useReducer(homeReduce, undefined, homeStart);
  const show = (p: Panel) => shownOn(p, home.tab, m);
  const needNow = need(m);
  useEffect(() => {
    const a = document.activeElement as HTMLElement | null;
    // When something needs me (home.goToNeeds): go to its tab, as F18 asks, or only mark it. A question waiting for an
    // answer, and Prompt help or the error explainer, open Now either way (home.ts). What was only marked is said out loud
    // when Speak to me is on.
    const act = { type: "need" as const, need: needNow, typing: typing(a && a !== document.body ? { tag: a.tagName, editable: a.isContentEditable } : null, document.hasFocus()), markOnly: setting("home.goToNeeds") === "markTab" };
    const said = markedLine(home, act);
    homeDispatch(act);
    if (said && speechOn()) sayIt(said, false);
  }, [needNow?.key ?? ""]);
  // A tab shown by itself took away what had the keyboard: it goes to that tab, so Esc and the arrows keep working.
  useEffect(() => { takeIfLost(() => placeEl(home.tab)); }, [home.tab]);
  const root = useRef<HTMLElement>(null);
  // Where the keyboard goes back to for a place: its round button, or on Now (which has none) the ask box.
  const placeEl = (t: Tab): HTMLElement | null => document.getElementById(tabId(t)) ?? (t === "now" ? box.current : null);
  // The mic beside the ask box says how to hold to talk (the keys work in any app).
  const [talkHint, setTalkHint] = useState(false);
  // A gentle line under the ask box when a press needs words first (Start, Show me or Explain with the box empty). It has a
  // Close button, and typing clears it.
  const [askHint, setAskHint] = useState<string | null>(null);
  const needWords = (line: string) => { setAskHint(line); box.current?.focus(); };
  // What is open is measured, not the column it sits in (that column is as tall as the window, so it could never shrink).
  const inner = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  // Which part of Settings is open in the side list ("" is the first).
  const [setPlace, setSetPlace] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  // The ask box's draft (askbox.ts): kept on this Mac as it is typed, put back when Companion starts again, cleared when it
  // is sent. Never kept off the record, and never when it looks like it holds a key or a password.
  const offNow = useRef(false);
  const keepDraft = (text: string) => { try { const d = draftToKeep(text, offNow.current); if (d === null) localStorage.removeItem(DRAFT_KEY); else localStorage.setItem(DRAFT_KEY, d); } catch { /* storage may be unavailable */ } };
  const fitBox = () => { const el = box.current; if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; };
  const setBox = (text: string) => { if (!box.current) return; box.current.value = text; fitBox(); keepDraft(text); };
  const clearBox = () => setBox("");
  // The zero cost warm up: when Home opens or the box gets the keyboard, the engine reads the Claude binary through so
  // the first task starts sooner (runner/src/warm.ts). Nothing is run or sent. At most once a minute from here.
  const warmedAt = useRef(0);
  const warmSoon = () => { const t = Date.now(); if (t - warmedAt.current < 60_000) return; warmedAt.current = t; void send(warmEngine()).catch(() => {}); };
  // VoiceOver hears each new question, the loop card, a finished task and an error once, politely, on one line (a11y.ts),
  // with the tab it is on when that is not the open one (the tab open when it came: Home moves there after). It is Home's
  // only live line for these; the keyboard is never moved for it. The line empties once what it said is gone, so nothing
  // old is left there.
  const tabNow = useRef(home.tab); tabNow.current = home.tab;
  const heard = useRef<string[]>([]), line = useRef<LiveLine>(EMPTY_LINE);
  const [news, setNews] = useState("");
  useEffect(() => { const n = liveLine(line.current, heard.current, m, tabNow.current); heard.current = n.said; line.current = n.line; setNews(n.line.text); }, [m]);
  // When the control with the keyboard goes away (pressed, closed, answered), the keyboard stays near where it was (focus.ts).
  useEffect(() => { const el = root.current; if (!el) return; return keepFocus(el, () => placeEl(tabNow.current)); }, []);
  // The buttons that open a step or a box, so the keyboard goes back to them when it closes.
  const linkId = useId(), undoId = useId(), bisectUndoId = useId(), askId = useId();
  const [project, setProject] = useState("");
  // What opening a lesson step's page said, if it could not open it (links.ts); a new step starts with none.
  const [lessonNote, setLessonNote] = useState("");
  useEffect(() => { setLessonNote(""); }, [m.walk?.id, m.walk?.index, m.walk?.variant]);
  // Files into the ask box (attachfiles.ts): dragged onto Home or pasted into the box, read on this Mac, shown as chips that
  // can be removed, and sent only with Start. Kept while Home is closed, not kept on disk, dropped for a new folder.
  const [attached, setAttached] = useState<Attached[]>([]);
  const attachedNow = useRef(attached); attachedNow.current = attached;
  const [attachNotes, setAttachNotes] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  // What was just added or taken away, said politely for VoiceOver (the chips show it to everyone else).
  const [attachSaid, setAttachSaid] = useState("");
  // Reading takes a moment: what it added joins the box as it is when it ends (mergeAdded), so files Start sent or a chip
  // removed meanwhile never come back. Files dropped before a folder change are dropped with it (dropGen).
  const dropGen = useRef(0);
  const addDropped = (files: ArrayLike<FileLike> | null | undefined) => { const list = Array.from(files ?? []); if (!list.length) return; homeDispatch({ type: "pick", tab: "now" }); const before = attachedNow.current; const gen = dropGen.current; void addFiles(before, list, { readDocument: shellReader(invoke), docLimitBytes: docLimitBytes(setting(DOC_LIMIT_KEY)) }).then((r) => { if (gen !== dropGen.current) return; const fresh = r.have.slice(before.length); const next = mergeAdded(before, r.have, attachedNow.current); attachedNow.current = next; setAttached(next); setAttachNotes(r.notes); setAttachSaid(addedLine(fresh.filter((f) => next.includes(f)))); }); };
  const clearAttached = () => { attachedNow.current = []; setAttached([]); setAttachNotes([]); setAttachSaid(""); };
  // What Start sent, kept in memory only until the engine says the task began (askbox.ts sentOutcome). If it says no
  // instead (a file it will not take, no Claude for a picture, something else working, the daily limit), or Stop came
  // before the task began, the words and the files are put back, never over anything typed or added since, so the person
  // can do what the refusal says. A new folder forgets it.
  const sent = useRef<Sent<Attached> | null>(null);
  const putBackSent = () => {
    const s = sent.current; sent.current = null;
    if (!s) return;
    const r = putBack(s, { text: box.current?.value ?? "", attached: attachedNow.current });
    if (r.attached) { attachedNow.current = r.attached; setAttached(r.attached); }
    // The box comes back first, as the words were sent: ticked, so they are never kept on this Mac, or unticked, as the
    // person chose for them (with the setting on, the send ticked it again).
    if (r.text !== undefined) { offNow.current = !!r.off; setOff(!!r.off); setBox(r.text); }
  };
  const onSentEvent = useRef((_: unknown) => {});
  onSentEvent.current = (payload: unknown) => {
    if (!sent.current) return;
    const o = sentOutcome(payload, AGENT);
    if (o === "started") sent.current = null;
    else if (o === "refused") putBackSent();
  };
  useEffect(() => {
    const off = listen("runner-event", (e) => onSentEvent.current(e.payload));
    return () => { off.then((f) => f()); };
  }, []);
  useEffect(() => { dropGen.current += 1; clearAttached(); sent.current = null; }, [project]);
  // F19: a file dropped on the character or the island. Its choices are also here on Now, where the keyboard reaches them
  // and a trim's times can be typed. A drop on the island, or Trim chosen on the ring, brings Home to Now.
  const drop = useDrop();
  const dropMenu = drop.s.menu;
  useEffect(() => { if (dropMenu?.at === "island") homeDispatch({ type: "pick", tab: "now" }); }, [dropMenu?.id]);
  useEffect(() => {
    const off = listen("drop-trim", () => { drop.d({ type: "trim", open: true }); homeDispatch({ type: "pick", tab: "now" }); });
    return () => { void off.then((f) => f()); };
  }, []);
  // A file dropped on Home outside the drop handling must never be opened in place of Home's page, and neither may a link
  // dropped anywhere but the ask box (blocksDrop); words dragged onto the ask box land there.
  useEffect(() => {
    const stopOpen = (e: DragEvent) => { if (blocksDrop(e.dataTransfer?.types, e.target)) e.preventDefault(); };
    window.addEventListener("dragover", stopOpen);
    window.addEventListener("drop", stopOpen);
    return () => { window.removeEventListener("dragover", stopOpen); window.removeEventListener("drop", stopOpen); };
  }, []);
  // The follow up box's words (FollowUpBox), kept here so hold to talk can fill it. overReceipt: the pointer is over the
  // finished task's receipt (a hover inside Home's own window, nothing else). followShown: the box shows and can be sent.
  const [followText, setFollowText] = useState("");
  // The words of a follow up just sent, kept in memory only until its task begins. If the engine says no instead (that
  // agent is already working, something else works on the project), they come back into the box, as the ask box's do
  // (askbox.ts sentOutcome and putBack), never over anything typed since.
  const followWords = useRef<string | null>(null);
  const followTextNow = useRef(followText); followTextNow.current = followText;
  const onFollowEvent = useRef((_: unknown) => {});
  onFollowEvent.current = (payload: unknown) => {
    if (followWords.current === null) return;
    const o = sentOutcome(payload, AGENT);
    if (o === "started") followWords.current = null;
    else if (o === "refused") { const back = putBack({ prompt: followWords.current, attached: [], off: false }, { text: followTextNow.current, attached: [] }).text; followWords.current = null; if (back !== undefined) setFollowText(back); }
  };
  useEffect(() => {
    const off = listen("runner-event", (e) => onFollowEvent.current(e.payload));
    return () => { off.then((f) => f()); };
  }, []);
  const overReceipt = useRef(false), followShown = useRef(false), followFromVoice = useRef(false);
  // homeShown: Home is on screen (the shell's "opened" and "closed"). keysDown: where spoken words may go, as the talk keys
  // went down (askbox.ts FollowAim), used once when the words come back.
  const homeShown = useRef(false), keysDown = useRef<FollowAim | null>(null);
  const onArrival = useRef<(t: HomeArrival) => void>(() => {});
  // The same as state, for what must follow Home on and off screen (the Prompt help result's keys).
  const [homeOpen, setHomeOpen] = useState(false);
  // More on the ring around the character opens Home: the whole list is on Now.
  useEffect(() => { if (homeOpen && dropMenu?.at === "dock") homeDispatch({ type: "pick", tab: "now" }); }, [homeOpen, dropMenu?.id]);
  // The search in What I did, kept while the person moves between tabs; a new folder starts with none.
  const [historyQ, setHistoryQ] = useState<HistoryQuery>(NO_FILTER);
  useEffect(() => { setHistoryQ(NO_FILTER); }, [project]);
  // What changed after an update (whatsnew.ts): worked out once when the page starts, then shown on Now until closed. The
  // version counts as seen once Home has been open with it showing, or it was closed, so it shows once. Kept on this Mac only.
  const [changes, setChanges] = useState<{ show: Release[]; remember: string } | null>(null);
  const changesNow = useRef(changes); changesNow.current = changes;
  const rememberVersion = (v: string) => { try { localStorage.setItem(SEEN_VERSION_KEY, v); } catch { /* storage may be unavailable */ } };
  useEffect(() => {
    // Read as the page starts: a first run finished later on is a first install, not an update from an older version.
    const usedBefore = (() => { try { return localStorage.getItem("companion.onboarded") === "1"; } catch { return false; } })();
    void invoke("update_status").then((v) => {
      let seen: string | null = null;
      try { seen = localStorage.getItem(SEEN_VERSION_KEY); } catch { /* storage may be unavailable */ }
      const w = whatsNew(seen, String((v as { version?: unknown } | null)?.version ?? ""), undefined, { usedBefore });
      if (w.show.length && w.remember) setChanges({ show: w.show, remember: w.remember });
      else if (w.remember) rememberVersion(w.remember);
    }).catch(() => {});
  }, []);
  const [draft, setDraft] = useState<string[]>([]);
  const [off, setOff] = useState(false);
  // Start every task off the record (task.offRecordByDefault): the box follows the setting as it arrives or changes, and
  // goes back to it after each send, but never unticks itself while words are in it (memorySettings.ts offBoxAfter), so
  // words typed off the record are never kept because the setting changed. What off the record keeps (nothing) never changes.
  const offDefault = useSetting("task.offRecordByDefault") === true;
  useEffect(() => { setOff((ticked) => offBoxAfter(ticked, box.current?.value ?? "", offDefault)); }, [offDefault]);
  // Turning off the record on drops the kept draft at once; turning it off again keeps what is in the box. Not at start,
  // so the draft from last time is not dropped before it is put back.
  const offWas = useRef(false);
  useEffect(() => { offNow.current = off; if (off === offWas.current) return; offWas.current = off; keepDraft(box.current?.value ?? ""); }, [off]);
  // The first run: shown until finished, remembered only on this Mac.
  const [onboarded, setOnboarded] = useState(() => { try { return localStorage.getItem("companion.onboarded") === "1"; } catch { return true; } });
  useEffect(() => {
    if (!onboarded || !box.current) return;
    let kept = "";
    try { kept = localStorage.getItem(DRAFT_KEY) ?? ""; } catch { /* storage may be unavailable */ }
    if (kept && !box.current.value) { box.current.value = kept; fitBox(); }
  }, [onboarded]);
  // Show the first run again (Settings, firstRunAgain.ts): from Home's own Settings (an event) or the Settings window (the
  // storage event), the first run comes back here.
  useEffect(() => {
    const again = () => { if (!onboardedNow()) setOnboarded(false); };
    window.addEventListener(AGAIN_EVENT, again);
    window.addEventListener("storage", again);
    return () => { window.removeEventListener(AGAIN_EVENT, again); window.removeEventListener("storage", again); };
  }, []);
  // A new person sees Home open by itself at launch (first_run_open: once, without the keyboard), so they never have to
  // guess that the notch is where it lives.
  useEffect(() => { if (!onboarded) void invoke("first_run_open").catch(() => {}); }, []);
  // The tour on Learn: the recorded first run, played again only when pressed.
  const [tour, setTour] = useState(false);
  const finishOnboarding = () => { try { localStorage.setItem("companion.onboarded", "1"); } catch { /* storage may be unavailable */ } setOnboarded(true); };
  // The "remembered" toast stays after the last new line for as long as the person chose (memory.toastSeconds, ten seconds
  // usually), or until it is closed.
  useEffect(() => {
    if (!m.toast) return;
    const ms = toastMs();
    if (ms === null) return;
    const t = setTimeout(() => dispatch({ type: "ui.toastClear" }), ms);
    return () => clearTimeout(t);
  }, [m.toast?.lines.length]);
  useEffect(() => { setDraft(m.plan?.steps ?? []); }, [m.plan]);
  const undone = m.undo?.stage === "done";
  const keepsMine = useSetting("undo.protectMyEdits") !== false;
  // The browser check's one time download: ask the engine whether it is set up (or downloading) whenever it is up.
  const bv = browserView(m);
  useEffect(() => { if (m.runnerUp) void send(checkBrowser()).catch(() => {}); }, [m.runnerUp]);
  const getTheBrowser = () => {
    if (bv?.busy) return;   // a second press while it downloads does nothing
    dispatch({ type: "ui.browserInstallAsked" });
    void send(getBrowser()).catch(() => dispatch({ type: "browser.install", stage: "failed", detail: S.browserFailed }));
  };
  useEffect(() => { dispatch({ type: "ui.undoClosed" }); }, [m.receipt?.checkpoint]);
  // A question that was not answered in time is dropped from the card, because the engine has already refused it.
  useEffect(() => {
    if (!m.approvals.length) return;
    const t = setInterval(() => dispatch({ type: "ui.approvalsExpire", now: Date.now() }), 5000);
    return () => clearInterval(t);
  }, [m.approvals.length]);
  // A question that needs the person takes the keyboard only when Home has it and nothing in Home does (focus.ts
  // takeIfLost), never off a control the person is on, and then onto its safe choice (Don't allow, No, Stop here: data-safe),
  // so a key pressed for something else can never say yes to it (rule 13). Its words are said on Home's live line either way.
  const urgent = useRef<HTMLDivElement>(null);
  const urgentKey = m.approvals[0]?.id ?? (m.agentsAsk ? "agents" : m.stuck ? "stuck" : m.paused ? "paused" : m.plan ? "plan" : "");
  useEffect(() => {
    if (!urgentKey) return;
    takeIfLost(() => urgent.current?.querySelector<HTMLElement>("[data-safe]") ?? urgent.current?.querySelector<HTMLElement>("input, button"));
  }, [urgentKey, home.needKey]);

  const [recent, setRecent] = useState<string[]>([]);
  const [folderNote, setFolderNote] = useState("");
  // The folder was changed while Companion runs (not the one it started with): only then does an opened practice copy run
  // Find again by itself, so nothing is checked at launch without a press.
  const switched = useRef(false);
  const loadRecent = () => void invoke("list_projects").then((l) => setRecent(Array.isArray(l) ? (l as string[]) : []));
  useEffect(() => { void invoke("get_project").then((p) => { setProject(String(p ?? "")); dispatch({ type: "ui.folderShown", project: String(p ?? "") }); }); loadRecent(); }, []);
  useEffect(() => {
    const off = listen("project-changed", (e) => { switched.current = true; setProject(String(e.payload ?? "")); dispatch({ type: "ui.projectChanged", project: String(e.payload ?? "") }); setFolderNote(""); loadRecent(); });
    return () => { off.then((f) => f()); };
  }, []);
  // The practice projects (practice.ts): each copied into a new folder in the home folder, chosen as the project, and
  // followed step by step. The shell keeps which were started, found and done (practice.json), for the list on Learn.
  const [practiceRec, setPracticeRec] = useState<PracticeRecord>(NO_RECORD);
  const [practiceNote, setPracticeNote] = useState("");
  const loadPractice = () => void invoke("practice_list").then((v) => setPracticeRec(recordFrom(v))).catch(() => {});
  useEffect(loadPractice, [project]);
  const practiceBusy = useRef(false);   // one copy per press
  const practiceAction = (run: () => Promise<unknown>) => {
    if (practiceBusy.current) return;
    practiceBusy.current = true; setPracticeNote("");
    void run().catch((e) => { if (String(e)) setPracticeNote(String(e)); }).finally(() => { practiceBusy.current = false; loadPractice(); });
  };
  // The folder in use before a practice (never a practice copy), for Back to my project.
  const before = () => (project && !copyOf(practiceRec, project) ? project : nowModel.current.practice?.previous);
  const beginPractice = (id: string) => {
    const e = practiceOf(id);
    homeDispatch({ type: "pick", tab: "learn" });
    if (!e) return;
    // A practice whose copy is still there (Next on one left half way, say) opens that copy: a second copy would be lost to
    // the record, which keeps one per practice (the shell refuses one too).
    if (startOrOpen(practiceRec, id) === "open") { continuePractice(id); return; }
    // A practice opens its own folder, so never while something works on the project (it would switch it under the work).
    if (!canStart(workingOn(nowModel.current), e, nowModel.current.doctor)) { setPracticeNote(workingOn(nowModel.current) ? S.practiceBusy : S.practiceNodeLine(nodeMissing(nowModel.current.doctor)?.fix ?? "")); return; }
    const previous = before();
    practiceAction(() => invoke("create_practice", { which: id }).then((p) => dispatch({ type: "ui.practiceStarted", project: String(p), kind: id, ...(previous ? { previous } : {}) })));
  };
  // Continue: the recorded copy opens as the project; the practice comes back and Find runs again (resume, below). When that
  // copy is already the project (its panel was closed), opening the same folder again changes nothing, so it comes back here.
  const continuePractice = (id: string) => {
    homeDispatch({ type: "pick", tab: "learn" });
    if (workingOn(nowModel.current)) { setPracticeNote(S.practiceBusy); return; }
    if (project && copyOf(practiceRec, project) === id) { resumedKey.current = ""; dispatch({ type: "ui.practiceStarted", project, kind: id, resumed: true }); return; }
    practiceAction(() => invoke("open_practice", { which: id }));
  };
  // Start over (asked first): the old copy to the Trash, a fresh copy in a new folder. The fresh copy opens as the project,
  // so, like Start, never while something works.
  const restartPractice = (id: string) => {
    if (workingOn(nowModel.current)) { setPracticeNote(S.practiceBusy); return; }
    const previous = before();
    practiceAction(() => invoke("restart_practice", { which: id, busy: workingOn(nowModel.current) }).then((v) => {
      const r = v as { path?: string; keptOld?: string | null };
      dispatch({ type: "ui.practiceStarted", project: String(r.path ?? ""), kind: id, ...(previous ? { previous } : {}) });
      if (r.keptOld) setPracticeNote(S.practiceKeptOld(r.keptOld.split("/").filter(Boolean).at(-1) ?? r.keptOld));
    }));
  };
  // Remove my copy (asked first): to the Trash, and out of the recent folders.
  // The copy that was open goes back to the folder used before it (else the newest folder of the person's own), so Home is not
  // left with no folder at all.
  const removePractice = (id: string) => practiceAction(() => invoke("remove_practice", { which: id, busy: workingOn(nowModel.current) }).then((n) => {
    const open = nowModel.current.practice;
    if (open?.kind === id) {
      const to = backTo(open.previous, recent, practiceRec);
      dispatch({ type: "ui.practiceClosed" });
      if (to) useFolder(to);
    }
    setPracticeNote(S.practiceRemoved(String(n)));
    loadRecent();
  }));
  // A recorded copy opened again (Continue, or the recent folders): its practice comes back and Find runs again to see where
  // it is, instead of trusting the record. At launch it comes back too, and waits for Find to be pressed. Once per visit to
  // the folder (practice.ts resumeOnOpen): the record is read again after every action, so a closed practice stays closed.
  const resumeSeen = useRef("");   // the folder whose practice this visit already brought back (or found open)
  useEffect(() => { resumeSeen.current = ""; resumedKey.current = ""; }, [project]);
  useEffect(() => {
    const r = resumeOnOpen(project, practiceRec, nowModel.current.practice, resumeSeen.current);
    resumeSeen.current = r.seen;
    if (r.resume) dispatch({ type: "ui.practiceStarted", project, kind: r.resume, resumed: true });
  }, [project, practiceRec]);
  // Find for the practice: the key's own check, or for the open table the check before going live (the files only).
  const practiceFind = () => {
    const e = practiceOf(nowModel.current.practice?.kind);
    if (!e || !project) return;
    if (e.find === "gate") { void send(checkShip(project)); return; }
    // The check is Point at the problem (Flow): with Flow off nothing is sent and the panel never waits on it.
    if (!toolOn("findProblem")) return;
    pressed(); dispatch({ type: "ui.findProblem" }); void sendOrExplain(findProblem(project), () => dispatch({ type: "ui.pointClosed" }));
  };
  // The practice's own fix (Fix it with me on Learn, and Point at the problem's Fix it in a practice copy): one small checked
  // task named for its practice. Like the Point panel's own Fix it, it takes the ring off and closes that panel.
  const practiceFix = (pr: Practice) => {
    // The fix is a task (Flow): with Flow off nothing is sent and the panel never waits on it.
    if (!toolOn("drive")) return;
    pressed(); void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); dispatch({ type: "ui.undoClosed" }); dispatch({ type: "ui.practiceFixing" });
    void sendOrExplain(fixFound(pr.project, { label: pr.label, detail: pr.where?.message ?? pr.why, problem: pr.problem }, { practice: pr.kind }), () => dispatch({ type: "ui.practiceFixRefused" }));
  };
  const resumedKey = useRef("");
  const quietFind = useRef("");   // the project whose next Find answer is not pointed at (a copy opened again)
  useEffect(() => {
    const pr = m.practice;
    if (!pr?.resumed || pr.stage !== "start" || pr.project !== project || isBusy(m) || !switched.current) return;
    if (resumedKey.current === pr.project) return;
    resumedKey.current = pr.project;
    // Only the key's checks answer with problem.found; the open table's check before going live never points at all.
    if (practiceOf(pr.kind)?.find === "checks") quietFind.current = pr.project;
    practiceFind();
  }, [m.practice?.project, m.practice?.stage, m.practice?.resumed]);
  // After its lesson or its fix: the practice's own checks again, so done is proven, not assumed.
  useEffect(() => {
    const pr = m.practice, e = practiceOf(pr?.kind);
    if (pr?.stage !== "proving" || pr.project !== project || !e) return;
    if (e.prove === "gate") void send(checkShip(project));
    else if (!toolOn("findProblem")) dispatch({ type: "ui.practiceStopProving" });   // Flow was switched off: the checks cannot run, and the panel says so
    else { pressed(); dispatch({ type: "ui.findProblem" }); void sendOrExplain(findProblem(project), () => dispatch({ type: "ui.practiceStopProving" })); }
  }, [m.practice?.stage]);
  // Each stage counts once in the beta numbers (only if they are on), and found and done go in the shell's record.
  const practiceWas = useRef<Practice | null>(null);
  useEffect(() => {
    const was = practiceWas.current, now = m.practice;
    practiceWas.current = now;
    for (const n of practiceNotes(was, now)) count(n);
    const mark = markFor(was, now);
    if (mark && now) void invoke("practice_mark", { which: now.kind, stage: mark }).then(loadPractice).catch(() => {});
  }, [m.practice]);
  const useFolder = (path: string) => void invoke("use_project", { path }).catch((e) => setFolderNote(failNote(e, "folder")));
  const pickFolder = () => void invoke("pick_project").catch((e) => { if (String(e)) setFolderNote(failNote(e, "folder")); });
  // About this project: asked each time a folder is opened (reads files only).
  useEffect(() => { if (project) void send(inspectProject(project)); }, [project]);
  // Opened from a link: once it is copied, it becomes the project folder.
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; ok?: boolean; path?: string };
      if (ev.type === "project.cloned") { setCopying(false); if (ev.ok && ev.path) useFolder(ev.path); }
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Show me's answer as it plays (sequence.ts): its steps still to come and its one line still waiting to be said. Closing
  // the card, holding to talk, Point at the problem, Stop and a new question all hush it.
  const player = useRef(answerPlayer());
  // The newest version of functions the listeners set up once call (their own closures would be stale).
  const latest = useRef<{ lookEveryday: () => void; find: (payload: unknown) => void }>({ lookEveryday: () => {}, find: () => {} });
  // An everyday stuck moment (everyday.ts): whether the key works in any app, and the why shown after its fix.
  const everydayOn = useSetting("point.everyday") !== false;
  const ed = m.everyday;
  const whySetting = useSetting("point.everydayWhy");
  const everydayWhy = ed ? whyShown(ed, whySetting) : null;
  useEffect(() => {
    const off = listen("hush", () => player.current.hush());   // the card closed, or the hold to talk keys went down
    return () => { off.then((f) => f()); };
  }, []);
  // Spoken replies: only if turned on, one line per thing shown, and never for anything the person did not ask for.
  // When the question was asked by voice (hold to talk) and Answer out loud is on, its answer is said whole when short
  // (speech.ts speakWhen). Every line goes through sayIt; when the Mac's sound is off nothing is said and the card says so once.
  const voiceAsked = useRef<VoiceQuestion>(null);   // the last question sent by voice, what it asked for and when (null: typed or pressed)
  const fromVoice = useRef(false);    // the box holds words that came from hold to talk
  const sayIt = (text: string, whole: boolean) => void invoke("speak", { text, whole, rest: S.speakRest }).then((r) => { const n = spokenNote(r); if (n) dispatch({ type: "app.notice", message: n }); }).catch(() => {});
  const answersVoice = (key: string) => lineByVoice(voiceAsked.current, key, Date.now());
  const saidKey = useRef("");
  const spoken = lineFor({ walk: m.walk, showme: m.showme }, keys, setting("point.pace"), setting("talk.shortSteps"));
  useEffect(() => {
    if (!spoken || spoken.key === saidKey.current) return;
    const when = speakWhen({ speech: speechOn(), replies: repliesOn(), byVoice: answersVoice(spoken.key) });
    if (!when.say) return;
    saidKey.current = spoken.key;
    // Say steps short (talk.shortSteps) gives Speak to me the step without its explanation; an answer said whole is all of it.
    const text = wordsToSay(spoken, when);
    // A step of a multi step answer is said when its pointer lands; if something else comes first, it is not said late.
    if (!spoken.delayMs) { sayIt(text, when.whole); return; }
    player.current.sayLater(() => sayIt(text, when.whole), spoken.delayMs);
    return () => player.current.cancelLine();
  }, [spoken?.key]);
  // The answer to a question asked by voice (a research answer, a finished task's result), said once, whole when short:
  // only the answer that is new on the card, and only of the kind that was asked (speech.ts newReply, askedByVoice).
  const seenReplies = useRef(new Set<string>());
  const replyKeys = repliesIn(m, project).map((r) => r.key).join("|");
  useEffect(() => {
    const all = repliesIn(m, project);
    const r = newReply(all, seenReplies.current);
    for (const x of all) seenReplies.current.add(x.key);
    if (!r || !repliesOn() || !askedByVoice(voiceAsked.current, r.kind, Date.now())) return;
    voiceAsked.current = null;   // one answer per question
    alsoSaid.current.add(r.key);   // said whole as the answer: not again as a short line
    sayIt(r.text, true);
  }, [replyKeys]);
  // Also say out loud (speak.alsoSay, nothing unless chosen): with Speak to me on, a short fixed line when something needs
  // the person or a task ends, each once. Runs after the answer above, so an answer said whole is not said again. What was
  // already on Home when Speak to me was off is never said late.
  const alsoSaid = useRef(new Set<string>());
  const also = alsoSayLines(m, project, (setting("speak.alsoSay") as string[] | undefined) ?? []);
  const alsoKeys = also.map((l) => l.key).join("|");
  useEffect(() => {
    if (!speechOn()) { for (const l of also) alsoSaid.current.add(l.key); return; }
    const fresh = also.filter((l) => !alsoSaid.current.has(l.key));
    for (const l of also) alsoSaid.current.add(l.key);
    if (fresh.length) sayIt(fresh[0].text, false);
  }, [alsoKeys]);
  // Another project: its answers are numbered and named on their own (its first task ends with cp_0001 again), and a
  // question asked by voice about the old project is not answered by anything in the new one.
  useEffect(() => {
    const off = listen("project-changed", () => { seenReplies.current.clear(); voiceAsked.current = null; });
    return () => { off.then((f) => f()); };
  }, []);
  // A question sent from the box counts as asked by voice when the box still held words from hold to talk.
  const sentFromBox = (kind: AskKind) => { voiceAsked.current = fromVoice.current ? { kind, at: Date.now() } : null; fromVoice.current = false; };
  // A Show me asked by voice keeps to its own request and ends with its answer (speech.ts followVoiceShowMe), so no other
  // line that shows meanwhile (Point at the problem, a hint, a window that changed) is ever said as its answer.
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string } | null;
      if (ev?.type === "app.showme" || ev?.type === "assist.error") voiceAsked.current = followVoiceShowMe(voiceAsked.current, ev);
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Pressed, not asked by voice: whatever answer comes next is not said as the answer to an earlier spoken question.
  const pressed = () => { voiceAsked.current = null; };
  // The speed picked in Settings, for Show me's timing (Settings notes every change); only the saved number is read here.
  useEffect(() => { void invoke("voice_speed").then((x) => noteSpeed(voiceSettingsFrom({ speed: x }))).catch(() => {}); }, []);
  // The daily update check: only looks, never installs. Off if the person turned it off or updates are not set up.
  useEffect(() => {
    let last: number | null = null;
    try { const v = localStorage.getItem("companion.updateChecked"); last = v ? Number(v) : null; } catch { /* storage may be unavailable */ }
    // The switch is read once the shell has said what is in force (settingsStore.ts), never from an old copy.
    void settingsReady().then(() => invoke("update_status")).then((v) => {
      const enabled = setting("updates.daily") === true;
      if (!autoCheckDue({ configured: !!(v as { configured?: boolean } | undefined)?.configured, enabled, lastMs: last, nowMs: Date.now() })) return;
      return invoke("check_update").then((r) => {
        try { localStorage.setItem("companion.updateChecked", String(Date.now())); } catch { /* storage may be unavailable */ }   // a failed or offline check is tried again next time
        const f = r as { available?: boolean; version?: string; notes?: string };
        // Home's notice and the island's status come from the shell's "update-ready", sent by the check itself.
        if (f.available) found.update = { stage: "found", version: f.version ?? "", notes: f.notes ?? "" };
      });
    }).catch(() => {});
  }, []);
  // Draw it for me: ask why it broke; when the diagram comes back it is laid out here and drawn on the screen.
  const asked = useRef(false);
  const askedId = useRef("");
  useEffect(() => { if (!m.diagram) asked.current = false; }, [m.diagram]);
  const drawIt = (question: string, problem?: { kind?: string; file?: string; line?: number; message?: string }) => {
    if (!projectRef.current || asked.current || !toolOn("explain")) return;
    const cmd = askDiagram(projectRef.current, question, problem);
    asked.current = true; askedId.current = (cmd as { id: string }).id; dispatch({ type: "ui.diagramAsked", ask: (cmd as { id: string }).id, project: projectRef.current });
    void sendOrExplain(cmd, () => { asked.current = false; dispatch({ type: "ui.diagramClosed" }); });
  };
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; made?: boolean; project?: string; ask?: string; diagram?: any };
      if (ev.type !== "diagram.ready" || !asked.current) return;
      // An answer to an earlier ask (before Stop, or before the project changed) is not this ask's answer.
      if (ev.ask && ev.ask !== askedId.current) return;
      asked.current = false;
      if (ev.made && ev.diagram && ev.project === projectRef.current) {
        const laid = layoutDiagram(ev.diagram, 720);
        void invoke("show_diagram", { diagram: { ...laid, caption: ev.diagram.caption, reason: ev.diagram.broken.reason } }).catch((err) => dispatch({ type: "ui.diagramFailed", reason: String(err) === "busy" ? "Something else is pointing at the screen right now. Try again in a moment." : "I could not show that on your screen. Try again." }));
      }
    });
    return () => { off.then((f) => f()); };
  }, []);
  const [link, setLink] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const openLink = () => { const u = link.trim(); if (!u || copying) return; dispatch({ type: "ui.cloneNoteClosed" }); void invoke("clone_project", { url: u }).then(() => { setLinkOpen(false); setLink(""); setCopying(true); }).catch((e) => { if (String(e)) setFolderNote(String(e)); }); };
  // The timeline: ask when the project is known, and again whenever a task ends.
  useEffect(() => { if (project) void send(listTasks(project)); }, [project, m.receipt]);
  // The project's watches (F21): asked for whenever the folder is known or changes, and when Flow is switched back on.
  const watchOn = groups.on("watch");
  useEffect(() => { if (project && watchOn) void send(watchList(project)); }, [project, watchOn]);
  // Fix it on a failed watch: the evidence was asked for on the person's press (model.ts only keeps evidence that was asked
  // for), and the ordinary task starts once with it. Nothing starts by itself.
  const fixing = m.watchFix;
  useEffect(() => {
    if (!fixing) return;
    dispatch({ type: "ui.watchFixUsed" });
    if (fixing.project !== projectRef.current || !toolOn("drive")) return;
    dispatch({ type: "ui.undoClosed" });
    homeDispatch({ type: "pick", tab: "now" });
    void send(fixWatch(fixing.project, fixWhat(fixing.kind, fixing.target), fixing.text)).catch(explainRefusal);
  }, [fixing]);
  // The Watch list's buttons (F21). Each is a press; Fix it only asks for the evidence, and the task starts when it comes.
  const watchHandlers = {
    onAdd: (kind: WatchKind, schedule: string, target: string) => { if (project) void sendOrExplain(watchAdd(project, kind, schedule, target)); },
    onCheck: (w: WatchView) => { if (project) void sendOrExplain(watchCheck(project, w.watch)); },
    onPause: (w: WatchView, paused: boolean) => { if (project) void sendOrExplain(watchPause(project, w.watch, paused)); },
    onRemove: (w: WatchView) => { if (project) void sendOrExplain(watchRemove(project, w.watch)); },
    onFix: (w: WatchView) => {
      if (!project) return;
      if (!toolOn("connections") || !toolOn("drive")) { dispatch({ type: "app.notice", message: offLine() }); return; }
      dispatch({ type: "ui.watchAsked", watch: w.watch });
      void send(watchFix(project, w.watch)).catch((e) => { dispatch({ type: "ui.watchAsked" }); explainRefusal(e); });
    },
  };
  // Where was I's one next step: a button, so nothing starts until it is pressed.
  const whereNext = () => {
    const n = m.recap?.next;
    if (!n || !project) return;
    if (n.action === "fixWatch") { const w = m.watches[n.watch]; if (w) watchHandlers.onFix(w); return; }
    if (n.action === "findProblem") { if (!toolOn("findProblem")) { dispatch({ type: "app.notice", message: offLine() }); return; } homeDispatch({ type: "pick", tab: "now" }); pressed(); dispatch({ type: "ui.findProblem" }); void sendOrExplain(findProblem(project), () => dispatch({ type: "ui.pointClosed" })); return; }
    homeDispatch({ type: "pick", tab: "now" });
  };
  useEffect(() => {
    const off = listen("opened", (e) => {
      const keyboard = !!(e.payload as { keyboard?: boolean } | null)?.keyboard;
      overReceipt.current = false;   // Home was away: the pointer is on it again only once it moves over it
      homeShown.current = true; setHomeOpen(true);
      // Home springs down out of the notch at each opening (style.css .home.springing; none with reduced or Less motion), except
      // when a keyboard shortcut opened it (M26, island.rs animates_open): then it is simply there.
      const instant = !!(e.payload as { instant?: boolean } | null)?.instant;
      const el = root.current;
      if (el) { el.classList.remove("closing"); el.classList.remove("springing"); if (!instant) { void el.offsetWidth; el.classList.add("springing"); } }
      homeDispatch({ type: "opened", keyboard });
      // Opened from the Settings window's "Walk me through it" or "Open the practice list": do that now.
      const then = arrivalFrom(e.payload);
      if (then) onArrival.current(then);
      else if (keyboard) setTimeout(() => box.current?.focus(), 30);
      if (changesNow.current) rememberVersion(changesNow.current.remember);   // what changed has been on screen once
      warmSoon();
      // Coming back after a break: ask what happened while away. Only Companion's own history is used. The folder is read
      // as it is now: this listener is set up once, before the folder is known.
      const last = lastSeen();
      const here = projectRef.current;
      // Where was I (F21) is Flow's; with Flow off the older three line version (core) is asked instead. Never in the background:
      // only when Home is opened, after the break chosen in Settings.
      if (last && here && recapDue(last, Date.now())) void send(toolOn("whereWasI") ? whereWasI(here, new Date(last).toISOString()) : askRecap(here, new Date(last).toISOString()));
      if (!last || Date.now() - last >= SESSION_GAP_MS) count("session");   // a new visit after a break, not every time the card opens
      touch();
    });
    // Every way Home goes away goes through the shell, which says so: a window that was just hidden sends no pointerleave.
    // Closing (Close, Esc, the island or the character again): it rolls back up into the notch, then the shell hides it
    // (main.rs HOME_CLOSE_MS). The shell does not ask with Reduce motion or Less motion.
    const offClosing = listen("closing", () => { const el = root.current; if (el) { el.classList.remove("springing"); el.classList.add("closing"); } });
    const offClosed = listen("closed", () => { overReceipt.current = false; homeShown.current = false; setHomeOpen(false); keysDown.current = null; });
    return () => { off.then((f) => f()); offClosing.then((f) => f()); offClosed.then((f) => f()); };
  }, []);
  // Tell the app how tall the content is, so the panel fits it.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const tell = () => void invoke("resize_card", { height: el.offsetHeight + (strip.current?.offsetHeight ?? 0) });
    const ro = new ResizeObserver(tell);
    ro.observe(el);
    if (strip.current) ro.observe(strip.current);
    return () => ro.disconnect();
  }, []);

  // Show me how: the engine chose one or more points in the picture, in order. Each is played in turn (sequence.ts): the
  // Mac side snaps it to a real button and draws the pointer, its line follows, then a short pause and the next one. Only
  // the last one waits for the click. A guess below the confidence line is said in words, never drawn.
  const [walk, setWalk] = useState<{ goal: string; steps: string[] } | null>(null);
  const inLesson = useRef(false); inLesson.current = !!m.walk;
  // everydayWalk: the walkthrough on now is the everyday one (started by the key's look or a look again, showMe's mode),
  // so only its steps are a fix to look again at; an ordinary Show me question is never one (everyday.ts nextLookMode).
  const everydayWalk = useRef(false);
  // The everyday walkthrough, kept after it ends, so a look again still knows the steps already tried. Only in memory, and
  // forgotten when the everyday panel goes (closed, Stop everything, a look that failed), on a new look and when an
  // ordinary Show me question starts.
  const lastWalk = useRef<{ goal: string; steps: string[] } | null>(null);
  if (walk && everydayWalk.current) lastWalk.current = walk;
  useEffect(() => { if (!m.everyday) { lastWalk.current = null; everydayWalk.current = false; } }, [m.everyday]);
  const showmeNow = useRef(m.showme); showmeNow.current = m.showme;
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; req?: string; lastStepWorked?: unknown };
      if (ev.type !== "assist.point" || !ev.req?.startsWith("sm_")) return;
      // Its question was ended while it was being answered (the card closed, Stop): nothing of it is shown or said.
      if (!stillWanted(showmeNow.current)) return;
      const req = ev.req;
      player.current.hush();
      const steps = planSteps(targetsOf(ev), { lesson: inLesson.current });
      if (!steps.length) return;
      // Spoken when either switch says this answer is (Answer out loud: the Show me asked by voice), at the picked speed, so
      // each line is said whole before the next step's line cuts in (sequence.ts lineMs).
      const speaking = speakWhen({ speech: speechOn(), replies: repliesOn(), byVoice: voiceShowMe(voiceAsked.current, req, Date.now()) }).say;
      const speed = spokenSpeed();
      // Pace of step by step pointing (point.pace): the lead in, the pause and how long each line is read for.
      const pace = setting("point.pace");
      const aim = (s: Step) => invoke("showme_aim", {
        req, x: s.target.x, y: s.target.y, ocrId: s.target.ocrId ?? null, targetText: s.target.targetText, caption: s.target.caption,
        mark: s.target.mark ?? null, screen: s.target.screen ?? 1, step: s.index + 1, of: s.total, hold: s.hold,
        flyMs: s.total > 1 ? leadMs(pace) : null, fadeMs: lineMs(s.text, speaking, speed, pace),
      }).then((r) => {
        const out = r as { ok?: boolean; why?: string } | undefined;
        // The window the picture was taken of changed: nothing more is drawn over it (rule 22). Say so in words.
        if (out?.ok === false && out.why === "window_changed") dispatch({ type: "app.showme", stage: "window_changed", message: S.sequenceWindowChanged });
        // Only a guess, and the person asked for words then (point.guesses): the shell drew nothing; say where to look.
        if (out?.ok === false && out.why === "guess") { words({ ...s, text: guessWords(s.target.targetText, s.target.caption) }); return true; }
        return out?.ok !== false;
      }, () => false);
      const words = (s: Step) => {
        const say = () => dispatch({ type: "app.showme", stage: "not_sure", message: s.text, req, step: s.index + 1, of: s.total });
        // The last step said in words ends it: what was seen is forgotten. Before that, only the pointer is taken away.
        if (s.index === s.total - 1) void invoke("showme_clear").then(say); else void invoke("showme_hide").then(say);
      };
      player.current.start(steps, { aim, words }, speaking, speed, pace);
      // The look's verdict on a step moved on from without asking (Did that work? only when unsure) is written down first.
      const verdict = ev.lastStepWorked;
      if (steps.some((s) => s.draw)) setWalk((w) => (w ? { ...w, steps: [...judged(w, verdict).steps, stepsLine(steps)] } : w));
      else setWalk((w) => (w ? judged(w, verdict) : w));
    });
    return () => { off.then((f) => f()); player.current.hush(); };
  }, []);
  // Point at the problem: the key checks the project; when a place comes back, the pointer flies there. Any Show me answer
  // still playing ends first, here and in the shell, so none of its later steps or lines lands on top of this one.
  const pointProblem = (project: string, problem: unknown) => { player.current.hush(); void invoke("point_problem", { project, problem }); };
  // A place made by the card itself (what changed, your turn): pointed at the same way, through pointProblem.
  const pointAt = (x: { project: string; problem: Problem }) => { if (pointsOnScreen(x.problem)) pointProblem(x.project, x.problem); };
  const projectRef = useRef(project); projectRef.current = project;
  useEffect(() => {
    // The key and the Find the problem chip on Home take one path (latest.current.find).
    const offKey = listen("find-problem", (e) => latest.current.find(e.payload));
    // A folder dropped on the character with Fix this project (main.rs drop_open_project): it is the project now, so Find
    // runs in it at once, even before the page has drawn the new folder.
    const offDropFind = listen("home-find", (e) => { const p = (e.payload as { project?: unknown })?.project; if (typeof p === "string" && p) { projectRef.current = p; latest.current.find(null); } });
    const offFound = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; verdict?: string; problem?: Problem; project?: string };
      // A practice copy opened again runs Find by itself (resume): that answer is shown on the card, never pointed at on the
      // screen, since nobody pressed anything (rule 5). Show me where points at it on a press.
      if (ev.type === "problem.found" && quietFind.current === ev.project) { quietFind.current = ""; return; }
      if (ev.type === "problem.found" && ev.verdict === "failed" && pointsOnScreen(ev.problem) && ev.project === projectRef.current) pointProblem(ev.project, ev.problem);
    });
    return () => { offKey.then((f) => f()); offDropFind.then((f) => f()); offFound.then((f) => f()); };
  }, []);
  // Your turn (off unless turned on in Settings): the person asked to make the second of two identical changes themselves.
  // Once the engine has put that place back, it is rung the same way Point at the problem rings a line (light first).
  const yourTurn = useSetting("teach.yourTurn") === true;
  const teachWant = useRef("");
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; made?: boolean; project?: string; checkpoint?: string; target?: { file: string; line: number; lineText: string } };
      if (ev.type !== "teach.ready" || ev.checkpoint !== teachWant.current) return;
      teachWant.current = "";
      if (ev.made && ev.target && ev.project === projectRef.current) pointAt(pointChange(ev.project, ev.target, S.teachHere));
    });
    return () => { off.then((f) => f()); };
  }, []);
  const tryTheNextOne = (checkpoint: string) => { if (!project) return; pressed(); teachWant.current = checkpoint; dispatch({ type: "ui.teachAsked", checkpoint }); void send(tryNextOne(project, checkpoint)); };
  // Hold to talk: the words come back as text, are put in the box, and are sent only if the person turned auto send on.
  // Reactions and celebrations: one setting for the whole app, on unless turned off.
  const fun = useSetting("fun.reactions") === true;
  // Why spoken words waited in the box although auto send is on (they mean wait or stop, or ask about the screen). Gone
  // once the box is changed.
  const [voiceHint, setVoiceHint] = useState<HeardKind | null>(null);
  // Hold to talk sends by itself only when turned on (talk.autoSend); changed here, on Now and in the first run, always
  // through the shell (settingsStore.ts).
  const autoSend = useSetting("talk.autoSend") === true;
  const setAutoSend = (on: boolean) => { void changeSetting("talk.autoSend", on); };
  // Text size follows the setting in force, from the shell's first answer on.
  const size = useSetting("display.textSize");
  useEffect(() => { applyTextSize(textSizeFrom(size)); }, [size]);
  // The one migration of the choices kept in this page's storage before the registry: Home only, once (settingsStore.ts).
  useEffect(() => { void migrateFromPageStorage(); }, []);
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; stage?: string; text?: string; language?: string; micMissing?: unknown };
      // Where the words may go is taken as the keys go down (listening begins; the line that follows for a microphone that
      // is away keeps it), never from where the pointer is when they come back. A hold that ends any other way forgets it.
      if (ev.type === "app.voice" && ev.stage === "listening" && !ev.micMissing) keysDown.current = { followUpShown: followShown.current, overReceipt: overReceipt.current, byPointing: setting("talk.followUpByPointing") === true, homeShown: homeShown.current };
      else if (ev.type === "app.voice" && ev.stage !== "listening" && ev.stage !== "transcribing" && ev.stage !== "heard") keysDown.current = null;
      if (ev.type === "app.voice" && ev.stage === "heard" && ev.text) {
        // The language picked in Settings comes with the words (English only at first: another one waits for Start).
        const lang = typeof ev.language === "string" ? ev.language : "auto";
        // Into the follow up box of the finished task the pointer was on as the keys went down (Follow up by pointing),
        // while that box still shows; else the ask box.
        const to = heardGoesTo({ showme: askModeRef.current === "showme", atKeysDown: keysDown.current, followUpShownNow: followShown.current });
        keysDown.current = null;
        if (to === "followUp") {
          // Never sent by itself unless auto send is on, and then only a clear request for work.
          setFollowText(ev.text); followFromVoice.current = true;
          if (autoSend && sendsItself(ev.text, lang)) setTimeout(() => sendFollowNow.current(), 0);
        } else {
          homeDispatch({ type: "pick", tab: "now" });   // the box is on Now
          setBox(ev.text);
          fromVoice.current = true;
          const kind = heardKind(ev.text, lang);
          setVoiceHint(autoSend && kind !== "work" && kind !== "short" ? kind : null);
          // After the Show me key the words are a question about the screen; "wait" or "never mind" waits in the box instead.
          if (to === "showme" && kind !== "holdOff") { sentFromBox("showme"); showMeRef.current(ev.text, ev.text, []); setAskMode("task"); clearBox(); setVoiceHint(null); }
          else if (to === "showme") setVoiceHint("holdOff");
          // With files added, the words wait in the box for Start: they never go with files by themselves. Words that mean
          // wait or stop, or ask about the screen, wait too (askbox.ts sendsItself).
          else if (autoSend && attachedNow.current.length === 0 && sendsItself(ev.text, lang)) setTimeout(() => submitNow.current(), 0);
          else setTimeout(() => box.current?.focus(), 30);
        }
        dispatch({ type: "ui.voiceClosed" });
      }
    });
    return () => { off.then((f) => f()); };
  }, [autoSend]);

  // Pressed from the keyboard: the next question typed or spoken is about the screen.
  const [askMode, setAskMode] = useState<"task" | "showme">("task");
  const askModeRef = useRef(askMode); askModeRef.current = askMode;
  const showMeRef = useRef<(q: string, g: string, s: string[]) => void>(() => {});
  useEffect(() => {
    const off = listen("showme-mode", (e) => { setAskMode("showme"); if (boxTakesKeyboard(e.payload)) setTimeout(() => box.current?.focus(), 30); });
    // Stop everything ends the Show me key's question too: words heard after it are never a question about the screen.
    const offStop = listen("runner-event", (e) => { if ((e.payload as { type?: string } | null)?.type === "app.stop_everything") setAskMode("task"); });
    return () => { off.then((f) => f()); offStop.then((f) => f()); };
  }, []);
  // settle: this look follows an action (a click, an answer), so the shell may wait for the page to stop changing first
  // (waitsForPage: bounded, the light on throughout, Stop ends it).
  // mode: an everyday look (everyday.ts), "everyday" for the first look and "recheck" to look again; otherwise a question.
  // before: with "recheck", the spreadsheet error code the first look read, so the engine can prove it gone.
  // An ordinary question (no mode) is not the everyday walkthrough: the everyday panel closes and what it saw is forgotten,
  // so no look again can land on it. The everyday look counts its press on the key, so only a question counts a use here.
  const showMe = (question: string, goal: string, steps: string[], settle = false, mode?: "everyday" | "recheck", before?: string) => {
    if (!mode && steps.length === 0) count("anywhere_use");
    if (m.showme?.stage === "pointing_roughly") count("soft_ring_corrected");
    everydayWalk.current = !!mode;
    if (!mode) { lastWalk.current = null; if (nowModel.current.everyday) dispatch({ type: "ui.everydayClosed" }); }
    player.current.hush(); setWalk({ goal, steps });
    void invoke("showme_start", { question, allScreens: allScreensOn(), settle, mode, before });
  };
  // An everyday stuck moment: Show me's own look (light first, secrets covered, nothing kept), asking what is wrong and the
  // first steps of the fix. Its answer names the problem (assist.problem), then its steps play like any Show me answer.
  // question: the first look's own, or Show me the steps' (the problem already named). The press was counted on the key.
  const lookEveryday = (question = EVERYDAY_ASK) => {
    lastWalk.current = null;
    homeDispatch({ type: "pick", tab: "now" });
    dispatch({ type: "ui.everydayLook", mode: "everyday" });
    showMe(question, everydayGoal(""), [], false, "everyday");
  };
  // Look again (Check it is fixed): whether the error is gone, and the next step if it is not. Only the everyday
  // walkthrough's steps count as tried. worked false: the person said the last step did not work, so it is named and never
  // suggested again (anywhere.ts). It carries the code the first look read (ed.code), the engine's only proof of gone.
  const checkEveryday = (worked?: boolean) => {
    const ed = nowModel.current.everyday;
    if (!ed) return;
    pressed();
    // lastWalk is only ever this problem's own walkthrough (forgotten on a new look, on Close and on Stop), so its steps
    // still count after a look again renamed what is left to fix.
    const base = (everydayWalk.current && walk ? walk : null) ?? lastWalk.current ?? { goal: everydayGoal(ed.problem), steps: [] };
    const w = worked === false ? answered(base, false) : base;
    dispatch({ type: "ui.everydayLook", mode: "recheck" });
    showMe(checkQuestion(w), w.goal, w.steps, true, "recheck", ed.code);
  };
  latest.current.lookEveryday = lookEveryday;
  // Point at the problem (the key in any app, or Find the problem on Home): the project's checks, or with no project, or an
  // app in front that is not a code tool, a look at the screen instead (everyday.ts). On Home nothing else is in front, so
  // with a project open its checks run. Set again at each draw, so the key's listener (set up once) uses the newest one.
  latest.current.find = (payload: unknown) => {
    pressed();
    // The key works in any app (everyday.ts): with no project, or with an app in front that is not a code tool, it looks
    // at the screen instead (point.everyday, on unless turned off; off, exactly as before). Only the kind of app in
    // front is known, never its id.
    const route = heroRoute({ everyday: setting("point.everyday") !== false && toolOn("showMe"), project: projectRef.current, front: frontOf(payload), practice: nowModel.current.practice?.project === projectRef.current });
    // One press, counted once: the key, and an anywhere use (the project route counts a builder use).
    if (route === "screen") { count("hero_press"); count("anywhere_use"); latest.current.lookEveryday(); return; }
    if (route === "noProject") { dispatch({ type: "app.showme", stage: "error", message: S.pointNoProject }); return; }
    // A check already running answers this press too. A second Find would only be refused, and its "cancelled" answer
    // would end the running check's panel (and a practice's own checks) before the real answer came.
    if (nowModel.current.point?.stage === "checking") { homeDispatch({ type: "pick", tab: "now" }); return; }
    dispatch({ type: "ui.findProblem" }); homeDispatch({ type: "pick", tab: "now" }); count("hero_press"); count("builder_use");
    void sendOrExplain(findProblem(projectRef.current), () => dispatch({ type: "ui.pointClosed" }));
  };
  const findFromHome = () => latest.current.find(null);
  // Anywhere mode: after each click, "did that work?" before the next step. A step that did not work is not suggested again.
  // With "Ask Did that work? after each step" set to only when unsure (showme.askWorked), a clean click on a solid ring
  // moves on by itself: the step is written down as clicked, not checked, and the next look checks it first.
  const [asking, setAsking] = useState(false);
  const nextStep = (worked = true, notChecked = false) => {
    if (!walk) return;
    setAsking(false);
    const w = notChecked ? clicked(walk) : answered(walk, worked);
    if (atLimit(w)) { void invoke("showme_clear"); setWalk(null); dispatch({ type: "app.showme", stage: "error", message: S.anywhereLimit }); return; }
    // A step of the everyday fix (that walkthrough only, never an ordinary Show me question): the next look first checks
    // whether the error is gone ("recheck"), so fixed only ever comes from a look.
    const mode = nextLookMode(everydayWalk.current, nowModel.current.everyday);
    if (mode) dispatch({ type: "ui.everydayLook", mode });
    showMe(nextQuestion(w), w.goal, w.steps, settlesBeforeLook(mode, setting("showme.waitForPage"), setting("showme.askWorked")), mode, mode ? nowModel.current.everyday?.code : undefined);
  };
  // How this answer's ring went, for asksWorked: a soft ring (a guess), or a click off the target before the hit.
  const ringLook = useRef({ req: "", soft: false, missed: false });
  useEffect(() => {
    const r = m.showme?.req ?? "", st = m.showme?.stage;
    if (!r) return;
    if (ringLook.current.req !== r) ringLook.current = { req: r, soft: false, missed: false };
    if (st === "pointing_roughly") ringLook.current.soft = true;
    if (st === "your_turn_miss") ringLook.current.missed = true;
  }, [m.showme?.stage, m.showme?.req]);
  // In a walkthrough, once the person clicked the step (or it was clicked for them), the next step follows on its own.
  const stage = m.showme?.stage;
  // The walkthrough ends whenever the pointer goes away (Esc, Stop everything, closing, waiting too long).
  // A multi step answer still playing also stops when the Mac side took a step's ring away because its window changed.
  useEffect(() => { if (sequenceOver(m.showme)) player.current.hush(); if (!m.showme) { setWalk(null); setAsking(false); } }, [m.showme]);
  useEffect(() => {
    // Only a walkthrough's own ring moves it on (a Show me ring carries an "sm_" request; Point at the problem's does not).
    if (!walk || !m.showme?.req?.startsWith("sm_") || (stage !== "your_turn_done" && stage !== "done_for_you")) return;
    if (!asksWorked({ setting: setting("showme.askWorked"), how: stage, soft: ringLook.current.soft, missed: ringLook.current.missed })) {
      const t = setTimeout(() => nextStep(true, true), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAsking(true), 900);
    return () => clearTimeout(t);
  }, [stage]);
  showMeRef.current = showMe;
  // An everyday look's answer (everyday.ts; the model keeps what it says). The walkthrough's goal names the problem, so the
  // next look knows what it is fixing. With no step to point at (nothing wrong, gone, or only words) the look is over and
  // what it saw is forgotten; with steps, they come next as an ordinary Show me answer.
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; req?: string; mode?: string; found?: boolean; steps?: number; problem?: string };
      if (ev.type !== "assist.problem" || !ev.req?.startsWith("sm_")) return;
      if (!stillWanted(showmeNow.current) || showmeNow.current?.req !== ev.req) return;
      if (ev.mode === "everyday" && ev.found && ev.problem) { const goal = everydayGoal(ev.problem); setWalk((w) => (w ? { ...w, goal } : w)); }
      if (!ev.steps) { void invoke("showme_clear"); setWalk(null); }
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Guided lessons: each step is pointed at once (the light comes on first), and the person's own click moves it on.
  const pickTab = (t: Tab) => homeDispatch({ type: "pick", tab: t });
  // The gear: Settings in its own window; if the app cannot open it, Settings inside Home as before.
  // Settings lives inside Home (M20, the founder: not in a separate window): the gear, Command comma and the notch's
  // Settings button all open it here.
  const gear = () => pickTab("settings");
  // Command comma opens Settings, as in every Mac app (Apple's menu bar guidance).
  const gearRef = useRef(gear); gearRef.current = gear;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "," && !e.isComposing) { e.preventDefault(); gearRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // What each tab shows is asked for whenever it is the one showing (picked, or shown by itself), and again for a new folder:
  // the lessons (those that read the project need a chosen folder; the others, installing a tool or leaving a builder, do
  // not), what Companion knows, and the task history.
  useEffect(() => {
    if (home.tab === "learn") { void send(walkList(project || NO_PROJECT)); loadPractice(); if (needsMacCheck(m.doctor)) void send(checkMac()); }
    if (home.tab === "memory" && project) void send(listMemory(project));
    if (home.tab === "did" && project) void send(listTasks(project));
  }, [home.tab, project]);
  // Node was installed while Home stayed open: coming back to Companion checks again, only on Learn and only while Node is
  // flagged missing.
  useEffect(() => {
    if (home.tab !== "learn" || !nodeMissing(m.doctor)) return;
    const again = () => void send(checkMac());
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [home.tab, m.doctor]);
  const beginLesson = (lesson: string, fresh: boolean) => {
    // With no folder chosen the lesson is asked to start without one; if it needs a project it says so itself.
    pressed();
    const c = walkStart(projectRef.current || NO_PROJECT, lesson, fresh);
    noAim.current = false; aimed.current = ""; acted.current = ""; afterAct.current = false; clearTimeout(actTimer.current);
    const walk = (c as { id: string }).id;
    dispatch({ type: "ui.walkRequested", walk }); homeDispatch({ type: "pick", tab: "learn" }); void send(c);
    return walk;
  };
  onArrival.current = (t: HomeArrival) => {
    // From the panel under the notch: the two things Squibby is for.
    if ("do" in t) { if (t.do === "find") findFromHome(); else shipIt(); return; }
    if ("lesson" in t) beginLesson(t.lesson, false); else pickTab(t.place === "settings" ? "settings" : "learn");
  };
  // The setting practice opens the lesson made from its project, and knows that lesson by its walk id.
  const practiceLesson = () => { const walk = beginLesson(SETTINGS_LESSON_ID, true); dispatch({ type: "ui.practiceLesson", walk }); };
  const aimed = useRef(""), staleReq = useRef<string | undefined>(undefined), acted = useRef(""), actTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), noAim = useRef(false), afterAct = useRef(false);
  const wk = m.walk;
  const wkKey = wk ? `${wk.id}:${wk.index}:${wk.variant}` : "";
  useEffect(() => {
    if (!wk || wk.stage !== "step") { if (aimed.current) { aimed.current = ""; void invoke("showme_clear"); } return; }
    if (aimed.current === wkKey) return;
    aimed.current = wkKey; staleReq.current = m.showme?.req;
    // The screen permission was not given: words only, and it is not asked for again at every step. The setting practice's
    // lesson is words only by design (free, no Claude).
    if (noAim.current || lessonWordsOnly(m)) return;
    // A step that follows the person's action (a click, I did it, an answer) may wait for the page to settle first.
    const settle = afterAct.current && waitsForPage(setting("showme.waitForPage"), setting("showme.askWorked"));
    afterAct.current = false;
    void invoke("showme_start", { question: `Where do I click for this: ${wk.find}`, allScreens: allScreensOn(), settle });
  }, [wkKey, wk?.stage]);
  useEffect(() => { if (wk && m.showme?.stage === "needs_permission") noAim.current = true; }, [m.showme?.stage, wkKey]);
  useEffect(() => { if (!wk) { clearTimeout(actTimer.current); } }, [wk]);
  useEffect(() => {
    // Only this step's own ring counts: a ring left over from the step before has the old request id. A ring click is only a
    // click: on a step the project proves, the runner says what is not there yet (walk.wait) and waits for "I did it".
    const r = m.showme?.req;
    if (!wk || wk.stage !== "step" || !r?.startsWith("sm_") || r === staleReq.current) return;
    if ((m.showme?.stage !== "your_turn_done" && m.showme?.stage !== "done_for_you") || acted.current === wkKey) return;
    acted.current = wkKey;
    clearTimeout(actTimer.current);
    actTimer.current = setTimeout(() => { afterAct.current = true; void send(walkActed(wk.id, m.showme?.stage === "done_for_you" ? "done_for_you" : "clicked", wk.index)); }, 700);
  }, [m.showme?.stage, m.showme?.req, wkKey]);
  // A click in another app while Home is open (the shell sees only that a press started outside Companion's windows).
  const onboardingNow = useRef(!onboarded); onboardingNow.current = !onboarded;
  // Step aside for what Home opens (home.stepAside, off unless turned on): after a link, the email for Report a problem or
  // Finder showing the support log, Home closes the way Esc does, unless something on it waits for the person (home.ts).
  const stepAside = () => { if (stepsAside(nowModel.current, onboardingNow.current, setting("home.stepAside") === true)) { box.current?.blur(); player.current.hush(); void invoke("close_card"); } };
  opened.stepAside = stepAside;
  // A new version is ready (the shell's "update-ready", from the daily check or Settings): a notice on every tab with
  // Install, pressed by the person, never while something runs (updates.ts installAllowed; the shell checks again).
  const [updateReady, setUpdateReady] = useState<string | null>(null);
  const [updateNote, setUpdateNote] = useState("");
  useEffect(() => {
    const off = listen("update-ready", (e) => { setUpdateReady(readyVersion(e.payload)); setUpdateNote(""); });
    return () => { off.then((f) => f()); };
  }, []);
  const installUpdate = () => { if (!installAllowed(nowModel.current)) return; setUpdateNote(updateLine({ stage: "installing" }, "", true)); const prev = found.update; void invoke("install_update").catch((e) => { const r = afterInstallFailed(prev, String(e)); found.update = r.update; setUpdateNote(r.note || String(e)); }); };
  useEffect(() => {
    const off = listen("home-click-away", () => { if (closesOnClickAway(nowModel.current, onboardingNow.current, setting("home.closeOnClickAway") === true)) { box.current?.blur(); player.current.hush(); void invoke("close_card"); } });
    return () => { off.then((f) => f()); };
  }, []);
  // A task that has ended on a question needs the person, but nothing runs: no Stop, and the ask box stays.
  const working = cardWorking(m);
  // Putting aside what an agent waited on the person for (Cancel on a plan, Close on an answer): Home lets it rest, and
  // asks the engine to, so the island and the character hear it too. Never while something else waits on the person for
  // it (model.ts releasable), and the engine never stops anything for it.
  const putAside = (agent: string | undefined, planToo = false) => { if (agent && releasable(m, agent, planToo)) void send(releaseAgent(agent)); };
  // The practice took over a problem Find found (it shows it, with Fix it with me): the agent Find left waiting is put
  // aside, so the practice's own buttons can be pressed.
  const hand = foundHandsOver(m, project);
  useEffect(() => { if (hand) void send(releaseAgent(hand)); }, [hand]);
  // A task that kept going in the folder before ended waiting on the person (its question cannot be answered here, since
  // its receipt is not shown): it is put aside too.
  const awayRest = Object.keys(m.away).filter((a) => releasable(m, a)).join("|");
  useEffect(() => { for (const a of awayRest.split("|").filter(Boolean)) void send(releaseAgent(a)); }, [awayRest]);
  // Make something with no project open, or with Make it in a new folder ticked (F23, M14 Part 1): the shell makes a new
  // folder named after the words, opens it as the project, and starts a plan (Start and Plan it) or Look it up there. The
  // engine never makes the folder. A refusal puts the words back, never over anything typed since.
  const [newFolder, setNewFolder] = useState(false);
  const [madeFolder, setMadeFolder] = useState<string | null>(null);
  const inNewFolder = !project || newFolder;
  const startNew = (kind: NewFolderKind) => {
    const words = box.current?.value ?? "";
    const c = newFolderTask(kind, words, off);
    if (!c) return;
    // Something to build is a plan, which is Flow's: with Flow off the words stay and the box says why (the shell refuses
    // it too, and makes nothing).
    if (kind === "build" && !toolOn("drive")) { dispatch({ type: "app.notice", message: offLine() }); return; }
    // Never a new folder while something works or waits on the person in this one: the words stay, and the box says why.
    if (isBusy(m)) { dispatch({ type: "app.notice", message: S.newFolder.busy }); return; }
    // Added files never go with a plan or Look it up, and a new folder clears them, so they are never dropped silently.
    if (attachedNow.current.length > 0) { dispatch({ type: "app.notice", message: S.newFolder.noFiles }); return; }
    sentFromBox(kind === "build" ? "plan" : "research");
    dispatch({ type: "ui.undoClosed" });
    dispatch({ type: kind === "build" ? "ui.planRequested" : "ui.researchRequested" });
    const wasOff = off;
    setMadeFolder(null);
    void invoke("start_in_new_folder", { cmd: c }).then((p) => setMadeFolder(String(p)), (e) => {
      const r = putBack<Attached>({ prompt: words, attached: [], off: wasOff }, { text: box.current?.value ?? "", attached: [] });
      if (r.text !== undefined) { offNow.current = !!r.off; setOff(!!r.off); setBox(r.text); }
      explainRefusal(e);
    });
    setOff(offRecordAtStart()); clearBox(); setNewFolder(false);
  };
  const submit = () => {
    const prompt = box.current?.value.trim() ?? "";
    if (prompt && inNewFolder) { startNew("build"); return; }
    if (!prompt) { needWords(S.typeFirst); return; }
    if (!project) return;
    // A task is Flow's. With Flow off the words stay in the box and the box says why, instead of bouncing silently (the ask
    // box is core, so it stays; Enter and hold to talk both come through here).
    if (!toolOn("drive")) { dispatch({ type: "app.notice", message: offLine() }); return; }
    // The engine checks what goes with the request again and refuses all of it if anything is off. That check runs here
    // first, so a request it would refuse is never sent, and nothing is cleared.
    const added = forRequest(attachedNow.current);
    if ("error" in checkAttachments(added)) { setAttachNotes([S.attachCannotSend]); return; }
    dispatch({ type: "ui.undoClosed" });
    sentFromBox("task");
    sent.current = { prompt, attached: attachedNow.current, off };
    void send(startTask(project, prompt, off, added)).catch((e) => { putBackSent(); explainRefusal(e); }); setOff(offRecordAtStart());
    clearBox(); clearAttached();
  };
  // The Explain chip: words in the box (an error pasted or typed into Squibby itself) are explained the way the explain keys
  // explain a selection (errhelp.rs typed). Nothing is read from another app here: that still needs the keys (rule 5). With
  // the box empty it says how, in a line that can be closed.
  const explainFromBox = () => {
    pressed();
    const q = box.current?.value.trim() ?? "";
    if (q.length < 3) { needWords(keyHint("explain", S.explainChipHint, keys, S.explainChipHintNoKeys)); return; }
    setAskHint(null);
    void invoke("eh_typed", { text: q }).then(() => clearBox(), (e) => { if (String(e) === "tooShort") needWords(S.explainChipHintNoKeys); });
  };
  // The words from hold to talk send through this, so they always go with the current folder and settings.
  const submitNow = useRef(submit); submitNow.current = submit;
  // The follow up box under a finished task's receipt: shown, sent, and sent by itself from hold to talk (auto send on).
  followShown.current = show("receipt") && !!m.receipt && canFollowUp(m, project) && groups.on("followUp");
  useEffect(() => { if (!(canFollowUp(m, project) || m.followUp === "sending")) { setFollowText(""); followFromVoice.current = false; } }, [canFollowUp(m, project) || m.followUp === "sending"]);
  // A follow up asked by voice is answered out loud like any spoken question (Answer out loud); a typed one is not.
  // Try again is always a press, whatever words wait in the box.
  const followSent = (words: boolean) => { followWords.current = words ? followTextNow.current : null; if (words && followFromVoice.current) voiceAsked.current = { kind: "task", at: Date.now() }; else pressed(); followFromVoice.current = false; dispatch({ type: "ui.undoClosed" }); dispatch({ type: "ui.followUpSent" }); followPending.current = true; };
  // A follow up the shell refused never began: the next new task is not a follow up, and the box is free again.
  const followRefused = (e: unknown) => { followPending.current = false; dispatch({ type: "ui.followUpRefused" }); explainRefusal(e); };
  const sendFollowNow = useRef(() => {});
  sendFollowNow.current = () => {
    const c = followUp(project, followText);
    if (!c || m.followUp === "sending" || !followShown.current) return;
    followSent(true); void send(c).catch(followRefused); setFollowText("");
  };

  // Which task broke it: earlier saved versions are checked in a private copy; the project itself is never touched.
  const findBreaker = () => { if (!project || !canBisect(m)) return; dispatch({ type: "ui.bisectAsked" }); void sendOrExplain(findBreakingTask(project), () => dispatch({ type: "ui.bisectClosed" })); };
  const rescue = () => {
    if (!project) return;
    pressed();
    dispatch({ type: "ui.undoClosed" });
    dispatch({ type: "ui.planRequested" });
    // The box covers Rescue too. Rescue leaves the words in the box, so the box goes back only as it does when the setting changes.
    void send(diagnose(project, off)); setOff((ticked) => offBoxAfter(ticked, box.current?.value ?? ""));
  };
  // When the improved text is ready, tell the app so Use it can paste it (nothing is stored on disk). It answers which
  // use keys it took for this result, if any, so the line under it names them only when they work. Those keys work in
  // every app, so only while the result, with its change, is on screen (home.ts phArmable), and once for each showing:
  // when it stops showing (Home closed, another tab) they go back, and they are taken again when it shows again.
  const [phArmed, setPhArmed] = useState(true);
  // The shell also gives the keys back after a minute and a half (main.rs arm_now), without a word to the page. So the line
  // under the result names them only while they are held (phKeysUp): from the moment ph_ready takes them until the result
  // stops showing (Home closed, another tab) or the minute and a half is up.
  const [phKeysUp, setPhKeysUp] = useState(false);
  const phKeysTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phShown = phArmable(m, home.tab, homeOpen);
  const phArmedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!phShown) { setPhKeysUp(false); clearTimeout(phKeysTimer.current); if (phArmedFor.current !== null) { phArmedFor.current = null; void invoke("ph_disarm").catch(() => {}); } return; }
    if (!m.ph?.text || phArmedFor.current === m.ph.text) return;
    phArmedFor.current = m.ph.text;
    void invoke("ph_ready", { text: m.ph.text, handback: m.ph.handback ?? "paste", req: m.ph.req ?? "" }).then((v) => { setPhArmed(armedFor(v)); setPhKeysUp(true); clearTimeout(phKeysTimer.current); phKeysTimer.current = setTimeout(() => setPhKeysUp(false), PH_KEYS_MS); }).catch(() => {});
  }, [m.ph?.stage, m.ph?.text, phShown]);
  const shipIt = (o: { runChecks?: boolean; confirm?: string[] } = {}) => { if (!project) return; dispatch({ type: "ui.planRequested", ship: true }); void send(checkShip(project, { runChecks: true, ...o })); };
  const research = () => {
    if (inNewFolder) { startNew("research"); return; }
    const c = askResearch(project, box.current?.value ?? "", off);
    if (!c || !project) return;
    sentFromBox("research");
    dispatch({ type: "ui.researchRequested" });
    void send(c); setOff(offRecordAtStart());
    clearBox();
  };
  const plan = () => {
    const goal = box.current?.value.trim() ?? "";
    if (goal && inNewFolder) { startNew("build"); return; }
    if (!goal || !project) return;
    sentFromBox("plan");
    dispatch({ type: "ui.undoClosed" });
    dispatch({ type: "ui.planRequested" });
    void send(planDrive(project, goal, off)); setOff(offRecordAtStart());
    clearBox();
  };

  const hero = heroWords(m, project, needNow);
  // Undo's small moment: the pill's drawing turns back once on a press; when the undo is done the result settles and
  // "Put back as it was" shows for two seconds. Motion only; with Reduce motion or Less motion the words still show.
  const spin = (b: HTMLElement) => { b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin"); };
  const [putBackShown, setPutBackShown] = useState(false);
  useEffect(() => {
    if (m.undo?.stage !== "done") return;
    setPutBackShown(true);
    const el = root.current;
    el?.classList.add("putback");
    const settle = setTimeout(() => el?.classList.remove("putback"), 400);
    const id = setTimeout(() => setPutBackShown(false), 2000);
    return () => { clearTimeout(settle); clearTimeout(id); el?.classList.remove("putback"); };
  }, [m.undo?.stage]);
  const setOpen = setPlace || groupPlaces(settingsPlaces())[0]?.places[0]?.id || "";
  const placeTitle = (p: { id: string; title: string }) => (p.id === "home" ? characterName(setting("character.name")) : p.title);
  const viewTitle = home.tab === "settings" ? ((() => { const p = settingsPlaces().find((x) => x.id === setOpen); return p ? placeTitle(p) : tabName("settings"); })()) : tabName(home.tab);
  return (
    <main className={`card home${dragging ? " dropping" : ""}`} ref={root} data-view={home.tab} data-tone={hero.tone}
      onPointerDown={(e) => { touch(); void invoke("ui_click", { label: "card:" + (e.target as HTMLElement).tagName }); }}
      onDragOver={(e) => { if (!onboarded || !carriesFiles(e.dataTransfer?.types)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragging(true); }}
      onDragLeave={(e) => { if (!e.relatedTarget || !root.current?.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { setDragging(false); if (!carriesFiles(e.dataTransfer?.types)) return; e.preventDefault(); if (onboarded) addDropped(e.dataTransfer?.files); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !composing(e)) { e.preventDefault(); box.current?.blur(); player.current.hush(); void invoke("close_card"); } }}>
      <div className="inner" ref={inner}>
      {/* The top row (27 Oct 2026, the notch apps' look): no title bar and no side list. Small round buttons on the right: What I
          did, Learn and Memory open inside Home, the gear opens Settings in its own window, and Close. A place open inside
          Home has a back arrow and its name on the left. A place that waits for the person has a small dot. */}
      {onboarded && (
        <header className="bar">
          {/* On Now: the folder's name and a small dot for how things are (style.css .bar-dot, from data-tone). */}
          {home.tab === "now" && <span className="bar-folder" title={project || undefined}><span className="bar-dot" aria-hidden="true" />{project ? <><span className="sr">{S.folderLabel}: </span>{project.split("/").filter(Boolean).pop() ?? project}</> : S.look.noFolder}</span>}
          {home.tab !== "now" && <>
            <button className="back" type="button" aria-label={S.look.back} title={S.look.back} onClick={() => pickTab("now")}><Icon name="back" size={16} />{needNow?.tab === "now" && <><span className="tabdot" aria-hidden="true" /><span className="sr">, {S.homeTabWaiting}</span></>}</button>
            <h1 id="home-title" className="view-title">{viewTitle}</h1>
          </>}
          <nav className="places" aria-label={S.look.placesLabel}>
            {HOME_PLACES.map((t) => {
              const waits = needNow?.tab === t && t !== home.tab;
              return (
                <button key={t} id={tabId(t)} className="icon-btn" type="button" aria-label={tabName(t)} title={tabName(t)} aria-pressed={t === home.tab} onClick={() => pickTab(placeAfter(home.tab, t))}>
                  <Icon name={t} size={16} />
                  {waits && <><span className="tabdot" aria-hidden="true" /><span className="sr">, {S.homeTabWaiting}</span></>}
                </button>
              );
            })}
            <button className="icon-btn" type="button" aria-label={tabName("settings")} title={tabName("settings")} aria-pressed={home.tab === "settings"} onClick={gear}><Icon name="gear" size={16} /></button>
            <button className="icon-btn close" type="button" aria-label={S.look.close} title={S.look.close} onClick={() => { player.current.hush(); void invoke("close_card"); }}><Icon name="close" size={14} /></button>
          </nav>
        </header>
      )}
      <div className="sr" role="status" aria-live="polite" aria-atomic="true">{news}</div>

      {!onboarded && <Onboarding doctor={m.doctor} connected={m.connected} keyTested={m.keyTested} project={project} send={send} pickFolder={pickFolder} startPractice={beginPractice} onDone={finishOnboarding} />}
      {onboarded && <ClaudeNotice />}
      {onboarded && (<>
      {/* Now: Flowflow, large and alive, beside the job in big words, the ask box and the quick actions. */}
      <section className="hero" hidden={home.tab !== "now"} aria-labelledby={home.tab === "now" ? "home-title" : undefined}>
        <Waterline />
        <HomeCharacter m={m} />
        <div className="hero-words">
          <h1 id={home.tab === "now" ? "home-title" : undefined} className="headline">{hero.headline}</h1>
          <p className="subline">{hero.line}</p>
        </div>
          {/* The one ask box, under the job's words (27 Oct 2026). Only hidden on the other places, never taken away: a draft, and
              the words from hold to talk, stay in the box. Its one filled button starts; the mic says how to hold to talk. */}
          <div className="askwrap" hidden={!show("ask")}>
          {askMode === "showme" && <div className="line" role="status"><b>{S.showMe}:</b> {S.showMeHint} <button className="btn" type="button" onClick={() => setAskMode("task")}>{S.planCancel}</button></div>}
          <div className="ask">
            <textarea ref={box} id={askId} rows={1} autoComplete="off" spellCheck={false} placeholder={S.look.ask} aria-label={S.look.ask} aria-describedby="ask-keys"
              onInput={(e) => { fitBox(); keepDraft(e.currentTarget.value); setVoiceHint(null); setAskHint(null); if (!e.currentTarget.value) fromVoice.current = false; }}
              onFocus={() => warmSoon()}
              onPaste={(e) => { const fs = pastedFiles(e.clipboardData); if (fs.length > 0) { e.preventDefault(); addDropped(fs); } }}
              onKeyDown={(e) => {
                if (askKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey, composing: composing(e) }) !== "send") return;
                e.preventDefault();
                if (askMode === "showme") { const q = box.current?.value.trim() ?? ""; if (q) { sentFromBox("showme"); showMe(q, q, []); setAskMode("task"); clearBox(); } } else submit();
              }} />
            {/* A click may never open the microphone (rule 5): this only says how to hold to talk, with the keys. */}
            {groups.on("talk") && <button className="btn talk-how" type="button" aria-expanded={talkHint} aria-controls="talk-keys" onClick={() => setTalkHint((v) => !v)}>{S.look.howToTalk}</button>}
            {!working && buttonShown("start") && <button className="btn primary send" type="button" aria-label={S.look.send} title={S.look.send} onClick={submit}><Icon name="send" size={18} /></button>}
          </div>
          {talkHint && <div className="line muted" id="talk-keys" role="status">{talkKeysLine(keys)}</div>}
          {askHint && <div className="line muted" role="status">{askHint} <button className="btn" type="button" onClick={() => { setAskHint(null); box.current?.focus(); }}>{S.ehClose}</button></div>}
          {voiceHint && <div className="line" role="status">{voiceHint === "screenQuestion" ? S.voiceWaitsScreen : voiceHint === "holdOff" ? S.voiceWaitsHoldOff : S.voiceWaitsLanguage}</div>}
          {dragging && <div className="line" role="status">{S.attachDrop}</div>}
          {attached.length > 0 && (
            <div className="chips" role="list" aria-label={S.attachTitle}>
              {attached.map((a, i) => (
                <span className="chip" role="listitem" key={`${i}:${a.name}`}>
                  <span className="line">{chipLabel(a)}</span>
                  <button className="btn" type="button" aria-label={S.attachRemove(a.name)} onClick={() => { focusBack(askId); setAttachSaid(S.attachRemoved(a.name)); setAttached((l) => removeFile(l, i)); }}>{S.attachRemoveShort}</button>
                </span>
              ))}
            </div>
          )}
          {attached.some((a) => a.kind === "image") && <div className="line muted">{S.attachPictureNote}</div>}
          {attached.length > 0 && <div className="line muted">{S.attachStartOnly}</div>}
          <div className="sr" role="status">{attachSaid}</div>
          {attachNotes.map((n, i) => <div className="line" role="status" key={i}>{n}</div>)}
          {/* Three quick actions, each a drawing and a word: what their keys and buttons already do. */}
          <div className="chips quick" role="group" aria-label={S.look.chipsLabel}>
            {buttonShown("findProblem") && <button className="chip-btn" type="button" onClick={findFromHome}><Icon name="find" size={16} />{S.look.chipFind}</button>}
            {buttonShown("shipCheck") && <button className="chip-btn" type="button" onClick={() => shipIt()}><Icon name="shield" size={16} />{S.look.chipSafe}</button>}
            {toolOn("errorHelp") && <button className="chip-btn" type="button" onClick={explainFromBox}><Icon name="explain" size={16} />{S.look.chipExplain}</button>}
            {buttonShown("showMe") && <button className="chip-btn" type="button" onClick={() => { const q = box.current?.value.trim() ?? ""; if (q) { sentFromBox("showme"); showMe(q, q, []); } else { pressed(); needWords(S.showMeHint); } }}><Icon name="pointer" size={16} />{S.look.chipShowMe}</button>}
          </div>
          {/* The other ways to ask, and the options, are kept out of the way until wanted. A ticked option is said on the summary. */}
          {!working && (
            <details className="more">
              <summary>{S.look.more}{off && <span> · {S.offRecord}</span>}</summary>
              <div className="row">
                {buttonShown("plan") && <button className="btn" type="button" onClick={plan}>{S.planIt}</button>}
                {buttonShown("rescue") && <button className="btn" type="button" onClick={rescue}>{S.rescueIt}</button>}
                {buttonShown("research") && <button className="btn" type="button" onClick={research}>{S.researchIt}</button>}
                {buttonShown("online") && <button className="btn" type="button" onClick={() => { if (project) { dispatch({ type: "ui.planRequested", ship: true }); void send(shipPreview(project)); } }}>{S.onlineButton}</button>}
                {buttonShown("drawIt") && <button className="btn" type="button" disabled={m.diagram?.stage === "asking"} onClick={() => drawIt(box.current?.value ?? "", m.where ?? undefined)}>{S.drawIt}</button>}
              </div>
              {buttonShown("autoSend") && (
                <label className="check"><input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> {S.voiceAutoSend}</label>
              )}
              <label className="check"><input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> {S.offRecord}</label>
              {project && (
                <label className="check"><input type="checkbox" checked={newFolder} onChange={(e) => setNewFolder(e.target.checked)} /> {S.newFolder.tick}</label>
              )}
              {attached.length === 0 && <div className="muted">{S.attachHint}</div>}
            </details>
          )}
          <div className="sr" id="ask-keys">{S.askKeysHint}</div>
          {/* The invitation to try a tool, only while nothing else is on Now. */}
      {hero.tone === "idle" && (() => { const inv = invitation(setting, working); return inv ? <div className="line muted" role="note" aria-label={S.groups.tryTitle}>{inv.line}</div> : null; })()}
          {!working && !project && <div className="line muted">{S.newFolder.noProject}</div>}
          {madeFolder && madeFolder === project && <div className="line muted" role="status">{S.newFolder.made(folderName(madeFolder))}</div>}
          </div>
      </section>
      {/* About Companion itself (the engine stopped, a notice, an error from something done on any place): on every place. */}
      {show("notes") && <>
      {/* M28: "Not connected" says how to fix it, and the fix is one press away. */}
      {m.notice && <div className="notice" role="status">{m.notice}{m.notice === S.notConnectedNotice && <button className="btn fix-it" type="button" onClick={() => { setSetPlace("fixed:key"); pickTab("settings"); }}>{S.addYourKey}</button>}</div>}
      {updateReady && (
        <div className="notice" role="status">
          <span>{S.homeUpdateReady(updateReady)}</span>{" "}
          <button className="btn primary" type="button" disabled={!installAllowed(m)} onClick={installUpdate}>{S.updatesInstall}</button>
          {!installAllowed(m) && <div className="line muted">{S.updatesBusy}</div>}
          {updateNote && <div className="line">{updateNote}</div>}
        </div>
      )}
      {/* M28: when the engine has stopped, the fix is one press away, never "quit and open again". */}
      {m.error && <div className="error">{m.error}{!m.runnerUp && <button className="btn fix-it" type="button" onClick={() => void invoke("restart_engine").catch(() => {})}>{S.restartEngine}</button>}</div>}
      </>}
      <div className="view" role="region" id={tabPanelId(home.tab)} aria-labelledby="home-title">
      {show("whatsNew") && changes && (
        <section className="panel" role="status" aria-label={S.whatsNewTitle(changes.show[0].version)}>
          {changes.show.map((r) => (
            <div key={r.version}>
              <h2>{S.whatsNewTitle(r.version)}</h2>
              {r.lines.map((l, i) => <div className="line" key={i}>{keysIn(l, keys)}</div>)}
            </div>
          ))}
          <div className="row"><button className="btn" type="button" onClick={() => { rememberVersion(changes.remember); setChanges(null); }}>{S.whatsNewClose}</button></div>
        </section>
      )}
      {home.tab === "settings" && (
        <nav className="sections-grouped" aria-label={S.look.settingsPlaces}>
          {groupPlaces(settingsPlaces()).map((g) => (
            <div key={g.group} className="sections-group" data-group={g.group}>
              <h3 className="sections-head" id={`sg-${g.group}`}>{S.setGroups[g.group]}</h3>
              <ul className="sections" aria-labelledby={`sg-${g.group}`}>
                {g.places.map((p) => <li key={p.id}><button className="section-pill" type="button" aria-current={setOpen === p.id ? "page" : undefined} onClick={() => { setSetPlace(p.id); root.current?.scrollTo({ top: 0 }); }}>{placeTitle(p)}</button></li>)}
              </ul>
            </div>
          ))}
        </nav>
      )}
      {show("settings") && <SettingsPage working={isBusy(m)} practiceBusy={workingOn(m)} project={project} spending={m.spending} onClose={() => pickTab("now")} onPracticeList={() => pickTab("learn")} onLesson={(l) => { beginLesson(l, false); }} onStepAside={stepAside} place={setOpen} />}
      {groups.groupOn("guide") && show("practice") && m.practice && m.practice.project === project && practiceOf(m.practice.kind) && (() => {
        const pr = m.practice!, entry = practiceOf(pr.kind)!;
        return <PracticePanel p={pr} entry={entry} folder={project.split("/").filter(Boolean).at(-1) ?? project} keys={keys} checking={m.point?.stage === "checking"} drawing={m.diagram?.stage === "asking"} busy={workingOn(m)}
          nodeFix={nodeMissing(m.doctor)?.fix ?? null} note={practiceNote} next={pr.stage === "done" ? nextPractice(practiceRec, pr.kind) : null}
          undo={m.undo} explain={pr.result && m.explain?.checkpoint === pr.result.checkpoint ? <ExplainBox e={m.explain} key={m.explain.checkpoint} /> : null}
          act={{
            find: practiceFind,
            fix: () => practiceFix(pr),
            lesson: practiceLesson,
            stopFix: () => { void send(stopAgent()); dispatch({ type: "ui.practiceClosed" }); },
            stopChecks: () => { void send(stopAgent()); dispatch({ type: "ui.practiceStopProving" }); },
            checkAgain: () => dispatch({ type: "ui.practiceProving" }),
            close: () => dispatch({ type: "ui.practiceClosed" }),
            where: (p) => { if (pointsOnScreen(p)) pointProblem(project, p); },
            why: (p) => drawIt("Why did this break?", p.kind === "line" ? { kind: "line", file: p.file, line: p.line, message: p.message } : { message: p.message }),
            showChanged: (at) => pointAt(pointChange(project, at, S.changedHere)),
            showResult: () => pickTab("now"),
            undoAsk: (checkpoint) => dispatch({ type: "ui.undoAsked", checkpoint }),
            undoYes: (checkpoint) => { dispatch({ type: "ui.undoSent" }); void send(undo(project, checkpoint)); },
            undoCancel: () => dispatch({ type: "ui.undoCancelled" }),
            startOver: () => restartPractice(pr.kind),
            remove: () => removePractice(pr.kind),
            next: (id) => beginPractice(id),
            // Back to my project: the folder used before the practice, else the newest of the person's own, else the chooser.
            back: () => { const to = backTo(pr.previous, recent, practiceRec); dispatch({ type: "ui.practiceClosed" }); if (to) useFolder(to); else pickFolder(); },
          }} />;
      })()}
      {/* The recorded first run, again on a press (it costs nothing and changes nothing; firstLook.ts). */}
      {home.tab === "learn" && (tour
        ? <section className="panel onboarding look" aria-label={S.firstLook.watch}><FirstLook onGo={() => setTour(false)} /></section>
        : <section className="panel" aria-label={S.firstLook.watch}><div className="row"><button className="btn" type="button" onClick={() => setTour(true)}>{S.firstLook.watch}</button></div></section>)}
      {home.tab === "learn" && !learnShown() && <section className="panel" role="status" aria-label={S.groups.title}><div className="line">{S.groups.learnOff}</div></section>}
      {groups.groupOn("guide") && show("practice") && (
        <PracticeList rows={listRows(practiceRec, m.doctor)} busy={workingOn(m)} nodeFix={nodeMissing(m.doctor)?.fix ?? null} note={m.practice && m.practice.project === project ? "" : practiceNote} damaged={practiceRec.damaged}
          openId={m.practice && m.practice.project === project ? m.practice.kind : null}
          act={{ start: beginPractice, open: continuePractice, startOver: restartPractice, remove: removePractice }} />
      )}
      {groups.groupOn("guide") && show("lessons") && !m.walk && (
        <section className="panel" role="status" aria-label={S.lessonsTitle}>
          <h2>{S.lessonsTitle}</h2>
          {lessonsShown(m.lessons ?? [], project, practiceRec, VERCEL_LESSON_ID).length === 0 && <div className="line">{S.lessonsNone}</div>}
          {lessonsShown(m.lessons ?? [], project, practiceRec, VERCEL_LESSON_ID).map((l) => (
            <div className="line" key={l.id}>
              <b>{l.title}</b> <span className="muted">{l.app}</span>
              {l.fromProject && <div className="line muted">{S.lessonFromProject}</div>}
              {l.status !== "tried" && <div className="line muted">{S.lessonDraft}</div>}
              <div className="row">
                <button className="btn primary" type="button" onClick={() => beginLesson(l.id, false)}>{l.saved ? S.lessonContinue : S.lessonStart}</button>
                {l.saved && <button className="btn" type="button" onClick={() => beginLesson(l.id, true)}>{S.lessonStartOver}</button>}
              </div>
            </div>
          ))}
          <div className="line muted">{S.lessonLooking}</div>
          <div className="row"><button className="btn" type="button" onClick={() => pickTab("now")}>{S.pointClose}</button></div>
        </section>
      )}
      {groups.groupOn("guide") && show("walk") && m.walk && (
        <section className={`panel ${m.walk.stage === "help" ? "amber" : ""}`} role="status" aria-label={S.lessonsTitle}>
          <h2>{m.walk.title}</h2>
          {m.walk.stage === "done" && <div className="line">{S.lessonDone}</div>}
          {(m.walk.stage === "step" || m.walk.stage === "asking" || m.walk.stage === "already") && <>
            <div className="line muted">{S.lessonStep(m.walk.index + 1, m.walk.total)}{m.walk.variant === "instead" ? ` · ${S.lessonOther}` : ""}</div>
            <div className="line"><b>{keysIn(m.walk.say, keys)}</b></div>
            {m.walk.link && <div className="row"><OpenButton url={m.walk.link} onNote={setLessonNote} /></div>}
            {m.walk.link && lessonNote && <div className="line" role="status">{lessonNote}</div>}
            {lessonWordsOnly(m) && <div className="line muted">{S.practiceLessonWords}</div>}
          </>}
          {/* Started where the person already is (teach.startWhereYouAre): what was passed by, and the way to do it again. */}
          {m.walk.passed && m.walk.stage !== "done" && m.walk.stage !== "stopped" && (
            <div className="row"><span className="line muted">{S.lessonPassed(m.walk.passed)}</span><button className="btn" type="button" onClick={() => beginLesson(m.walk!.lesson, true)}>{S.lessonDoAgain}</button></div>
          )}
          {(m.walk.stage === "help" || m.walk.stage === "stopped") && <div className="line">{keysIn(m.walk.note ?? "", keys)}</div>}
          {m.walk.stage === "step" && m.walk.note && <div className="line muted">{keysIn(m.walk.note ?? "", keys)}</div>}
          {m.walk.log.length > 0 && (
            <details className="line muted">
              <summary>{S.lessonLogTitle} ({m.walk.log.length})</summary>
              <ol>{m.walk.log.map((h, i) => <li key={i}>{keysIn(h.say, keys)} <span className="muted">({h.how === "skipped" ? S.lessonLogSkipped : S.lessonLogDone})</span></li>)}</ol>
            </details>
          )}
          <div className="row">
            {m.walk.stage === "step" && <>
              {m.walk.stage === "step" && !lessonWordsOnly(m) && <button className="btn" type="button" onClick={() => { const w = m.walk!; staleReq.current = m.showme?.req; void invoke("showme_start", { question: `Where do I click for this: ${w.find}`, allScreens: allScreensOn() }); }}>{S.lessonPoint}</button>}
              {m.showme?.turn && ["pointing", "pointing_roughly", "your_turn_miss"].includes(m.showme.stage) && <button className="btn" type="button" onClick={() => { pressed(); void invoke("do_it_for_me"); }}>{S.doItForMe}</button>}
              <button className="btn primary" type="button" onClick={() => { acted.current = wkKey; afterAct.current = true; clearTimeout(actTimer.current); void send(walkActed(m.walk!.id, "pressed", m.walk!.index)); }}>{S.lessonDid}</button>
            </>}
            {m.walk.stage === "already" && <>
              <div className="line">{S.lessonAlready}</div>
              <button className="btn primary" type="button" onClick={() => void send(walkAnswer(m.walk!.id, true, m.walk!.index))}>{S.lessonAlreadyYes}</button>
              <button className="btn" type="button" onClick={() => void send(walkAnswer(m.walk!.id, false, m.walk!.index))}>{S.lessonAlreadyNo}</button>
            </>}
            {m.walk.stage === "asking" && <>
              <div className="line">{S.lessonWorked}</div>
              <button className="btn primary" type="button" onClick={() => { afterAct.current = true; void send(walkAnswer(m.walk!.id, true, m.walk!.index)); }}>{S.lessonYes}</button>
              <button className="btn" type="button" onClick={() => { afterAct.current = true; void send(walkAnswer(m.walk!.id, false, m.walk!.index)); }}>{S.lessonNo}</button>
            </>}
            {m.walk.stage === "help" && <button className="btn primary" type="button" onClick={() => void send(walkSkip(m.walk!.id, m.walk!.index))}>{S.lessonSkip}</button>}
            {["step", "already", "asking", "help"].includes(m.walk.stage) && <button className="btn" type="button" onClick={() => { void send(walkStop(m.walk!.id)); void invoke("showme_clear"); }}>{S.lessonStop}</button>}
            {["done", "stopped"].includes(m.walk.stage) && <button className="btn" type="button" onClick={() => dispatch({ type: "ui.walkClosed" })}>{S.pointClose}</button>}
          </div>
        </section>
      )}
      {show("diagram") && m.diagram && (
        <section className={`panel ${m.diagram.stage === "none" ? "amber" : ""}`} role="status" aria-label={S.drawTitle}>
          <h2>{S.drawTitle}</h2>
          {m.diagram.stage === "asking" && <div className="line">{S.drawing}</div>}
          {m.diagram.stage === "shown" && <><div className="line"><b>{m.diagram.brokenReason}</b></div><div className="line">{m.diagram.caption}</div><div className="line muted">{setting("drawIt.seconds") === "untilClosed" ? S.drawShownUntilClosed : S.drawShown}</div></>}
          {m.diagram.stage === "none" && <div className="line">{m.diagram.reason}</div>}
          {m.diagram.stage !== "asking" && <div className="row"><button className="btn" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.diagramClosed" }); }}>{S.pointClose}</button></div>}
        </section>
      )}
      {show("about") && m.about && m.about.project === project && (
        <section className="panel" aria-label={S.aboutTitle}>
          <h2>{S.aboutTitle}</h2>
          <div className="answer">{m.about.about}</div>
          {m.about.notes.map((n, i) => <div className="line" key={i}>{n}</div>)}
          {m.about.needsInstall && !(m.install?.project === project && m.install.stage === "done") && (
            <div className="row">
              <span className="line">{S.aboutNeedsInstall}</span>
              <button className="btn primary" type="button" disabled={m.install?.stage === "installing"} onClick={() => void send(installPackages(project))}>{m.install?.project === project && m.install.stage === "installing" ? S.aboutInstalling : S.aboutInstall}</button>
            </div>
          )}
          {m.install?.project === project && <div className={`line ${m.install.stage === "failed" ? "blocked" : "muted"}`} role="status">{m.install.detail}</div>}
          {m.about.missingCount > 0 && (
            <div className="line">{S.aboutMissing} <b>{m.about.missing.join(", ")}</b>{m.about.missingCount > m.about.missing.length ? ` ${S.andMore.replace("{n}", String(m.about.missingCount - m.about.missing.length))}` : ""}. {m.about.example ? S.aboutMissingExample.replace("{file}", m.about.example) : S.aboutMissingHow}</div>
          )}
          {m.about.missingCount > 0 && !m.walk && <div className="row"><button className="btn" type="button" onClick={() => beginLesson(SETTINGS_LESSON_ID, false)}>{S.aboutSettingsLesson}</button></div>}
          <div className="row"><CopyButton text={aboutCopy(m.about)} label={S.copyAnswer} /><button className="btn" type="button" onClick={() => dispatch({ type: "ui.aboutClosed" })}>{S.onlineClose}</button></div>
        </section>
      )}
      {home.tab === "now" && <DropList drop={drop} />}
      {show("urgent") && <div ref={urgent}>
      {m.agentsAsk && (
        <section className="panel amber" aria-label={S.agentsTitle}>
          <h2>{S.agentsTitle}</h2>
          <div className="line">{S.agentsAsk} {m.agentsAsk.join(" and ")}. {S.agentsAskEnd}</div>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => { void send(answerAgents(project, "yes")); dispatch({ type: "ui.agentsAnswered" }); }}>{S.agentsYes}</button>
            <button className="btn" type="button" data-safe onClick={() => { void send(answerAgents(project, "no")); dispatch({ type: "ui.agentsAnswered" }); }}>{S.agentsNo}</button>
          </div>
        </section>
      )}
      {m.approvals.map((a) => { const w = approvalWords(a); return (
        <section className="panel amber ask-card" key={a.id} aria-label={S.needsYouTitle}>
          <h2>{w.question}</h2>
          {m.away[a.agent] && <div className="line muted">{S.awayQuestion(folderName(m.away[a.agent]))}</div>}
          {/* M28: exactly what will happen, why it asks, and whether Undo covers it (approvals.ts). */}
          {w.what && <div className="ask-what" role="group" aria-label={S.approval.what}><code>{w.what}</code></div>}
          <div className="line muted">{w.why}</div>
          {w.undo && <div className={`line ask-undo${a.undoable ? "" : " no"}`}>{w.undo}</div>}
          <div className="row">
            <button className="btn primary" type="button" aria-label={`${S.allow}: ${a.title}`} onClick={() => { void send(answerApproval(a.id, true)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.allow}</button>
            <button className="btn" type="button" data-safe aria-label={`${S.dontAllow}: ${a.title}`} onClick={() => { void send(answerApproval(a.id, false)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.dontAllow}</button>
          </div>
        </section>
      ); })}

      {m.stuck && (
        <section className="panel amber" aria-label={S.stuckTitle}>
          <h2>{S.stuckTitle}</h2>
          {m.stuck.agent && m.away[m.stuck.agent] && <div className="line muted">{S.awayQuestion(folderName(m.away[m.stuck.agent]))}</div>}
          <div className="line">{stuckWords(m)}</div>
          <div className="line muted">{stuckHelpWords(m)}</div>
          <div className="line">{m.stuck.failure}</div>
          <div className="row">
            {m.stuck.options.map((o, i) => (
              <button key={o.id} className={`btn ${i === 0 ? "primary" : ""}`} type="button" data-safe={o.id === "stop" || undefined} onClick={() => { void send(chooseLoop(o.id as "different" | "stop")); dispatch({ type: "ui.stuckAnswered" }); }}>{o.label}</button>
            ))}
            {pointsOnScreen(m.where) && <button className="btn" type="button" onClick={() => pointProblem(project, m.where)}>{S.pointWhere}</button>}
          </div>
        </section>
      )}

      {m.paused && (
        <section className="panel amber" aria-label={S.pausedTitle}>
          <h2>{S.pausedTitle}</h2>
          {m.paused.agent && m.away[m.paused.agent] && <div className="line muted">{S.awayQuestion(folderName(m.away[m.paused.agent]))}</div>}
          <div className="line">{pausedWords(m)}</div>
          <div className="line muted">{S.pausedHelp}</div>
          <div className="row"><button className="btn primary" type="button" onClick={() => { void send(resumeDrive()); dispatch({ type: "ui.resumed" }); }}>{S.resume}</button></div>
        </section>
      )}

      {m.plan && (
        <section className="panel amber" aria-label={S.planTitle}>
          <h2>{S.planTitle}</h2>
          <div className="line muted">{S.planHelp}</div>
          {draft.map((t, i) => (
            <div className="row" key={i}>
              <input type="text" value={t} aria-label={`${S.stepOf} ${i + 1}`} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))} />
              <button className="btn" type="button" aria-label={`${S.removeStep} ${S.stepOf.toLowerCase()} ${i + 1}`} onClick={() => { setDraft(draft.filter((_, j) => j !== i)); setTimeout(() => urgent.current?.querySelector<HTMLElement>("input")?.focus(), 0); }}>{S.removeStep}</button>
            </div>
          ))}
          {planCutWords(m) && <div className="line">{planCutWords(m)}</div>}
          <div className="line muted">{m.plan.estimateUsd > 0 ? `${S.planCost}: ${formatUsd(m.plan.estimateUsd)}` : S.planCostNone}</div>
          <div className="row">
            <button className="btn primary" type="button" disabled={draft.every((s) => !s.trim())} onClick={() => { void send(approvePlan(draft.map((s) => s.trim()).filter(Boolean))); dispatch({ type: "ui.planCancelled" }); }}>{S.planStart}</button>
            <button className="btn" type="button" onClick={() => { putAside(m.plan!.agent, true); dispatch({ type: "ui.planCancelled", release: true }); }}>{S.planCancel}</button>
          </div>
        </section>
      )}

      </div>}
      {show("promptHelp") && m.ph && (
        <section className="panel amber" aria-label={S.phTitle}>
          <h2>{S.phTitle}</h2>
          {phWords(m) && <div className="line">{phWords(m)}</div>}
          {m.ph.stage === "consent" && (
            <div className="row">
              <button className="btn primary" type="button" onClick={() => void invoke("ph_consent", { choice: "always" })}>{S.phAlways}</button>
              <button className="btn" type="button" onClick={() => void invoke("ph_consent", { choice: "once" })}>{S.phOnce}</button>
              <button className="btn" type="button" onClick={() => void invoke("ph_consent", { choice: "never" })}>{S.phNever}</button>
            </div>
          )}
          {m.ph.stage === "thinking" && m.ph.streaming && <div className="line muted">{m.ph.streaming}</div>}
          {(m.ph.stage === "reading" || m.ph.stage === "thinking") && <div className="row"><button className="btn" type="button" onClick={() => void invoke("ph_dismiss")}>{S.planCancel}</button></div>}
          {m.ph.stage === "ready" && (
            <>
              <div className="answer">{m.ph.diff.map(([op, t], i) => op === "+" ? <ins key={i} className="added"><span className="sr">{S.diffAdded} </span>{t}</ins> : op === "-" ? <del key={i} className="removed"><span className="sr">{S.diffRemoved} </span>{t}</del> : <span key={i}>{t}</span>)}</div>
              {m.ph.handback === "copy" && <div className="line muted">{S.phCopyHint}</div>}
              {m.ph.question && (
                <>
                  <div className="line"><b>{m.ph.question}</b></div>
                  <div className="row">
                    {(m.ph.options ?? []).map((o) => <button key={o} className="btn" type="button" onClick={() => void invoke("ph_answer", { answer: o })}>{o}</button>)}
                    <button className="btn" type="button" onClick={() => void invoke("ph_answer", { answer: "Skip this question and just improve it." })}>{S.phSkip}</button>
                  </div>
                </>
              )}
              <div className="row">
                <button className="btn primary" type="button" onClick={() => void invoke("ph_accept")}>{S.phUse}</button>
                <button className="btn" type="button" onClick={() => void invoke("ph_dismiss")}>{S.phDismiss}</button>
              </div>
              {phKeysUp && <div className="line muted">{acceptHint(phArmed, keys)}</div>}
            </>
          )}
          {(m.ph.stage === "pasted") && <div className="row"><button className="btn" type="button" onClick={() => void invoke("ph_restore")}>{S.phRestore}</button></div>}
          {["refused", "error", "nothing_to_read", "needs_accessibility", "copied", "restored", "pasted"].includes(m.ph.stage) && <div className="row"><button className="btn" type="button" onClick={() => void invoke("ph_dismiss")}>{S.phDismiss}</button></div>}
        </section>
      )}

      {show("drive") && m.drive && (
        <section className="panel">
          <div className="line">{driveWords(m) ?? `${S.stepOf} ${m.drive.index} of ${m.drive.total}: ${m.drive.title}`}</div>
          {!m.drive.finished && !m.paused && <div className="row"><button className="btn" type="button" onClick={() => void send(pauseDrive())}>{S.pauseNow}</button></div>}
          {m.drive.finished && <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.driveClosed" })}>{S.closeFinished}</button></div>}
          {m.stepExplains.map((x) => (
            <div key={x.index}>
              <div className="line muted">{S.stepOf} {x.index}: {x.title}</div>
              <ExplainBox e={x.explain} key={`${x.index}:${x.explain.checkpoint}`} />
            </div>
          ))}
        </section>
      )}

      {show("ship") && m.shipFlow && <OnlineBox f={m.shipFlow} project={project} onClose={() => dispatch({ type: "ui.shipClosed" })} />}

      {show("ship") && m.ship && (
        <section className={`panel ${m.ship.canShip ? "" : "amber"}`} aria-label={S.shipTitle}>
          <h2>{S.shipTitle}</h2>
          <div className="line"><b>{shipWords(m)}</b></div>
          {m.ship.gates.map((g) => (
            <div key={g.id} className={`line ${g.status === "blocked" ? "blocked" : ""}`}>
              {g.label}: {({ passed: "Passed", blocked: "Blocked", could_not_check: "Could not check", not_applicable: "Not needed" } as const)[g.status]}
              <span className="muted"> {g.detail}</span>
              {confirmable(m).includes(g.id) && <div className="row"><button className="btn" type="button" aria-label={`${S.shipConfirm}: ${g.label}`} onClick={() => shipIt({ confirm: [g.id] })}>{S.shipConfirm}</button></div>}
            </div>
          ))}
          <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.shipClosed" })}>{S.shipClose}</button></div>
        </section>
      )}

      {show("research") && m.research && (
        <section className="panel" aria-label={m.research.title}>
          <h2>{m.research.title}</h2>
          <div className="answer">{m.research.answer}</div>
          <div className="line muted"><b>{S.researchNotes}:</b></div>
          {m.research.notes.map((n, i) => <ResearchNote key={i} text={n.text} source={n.source} />)}
          <div className="line muted">{m.research.file ? `${S.researchFiled} ${m.research.file}` : S.researchNotFiled}</div>
          <div className="row"><CopyButton text={researchCopy(m.research)} label={S.copyAnswer} /><button className="btn" type="button" onClick={() => dispatch({ type: "ui.researchClosed" })}>{S.researchClose}</button></div>
        </section>
      )}

      {show("rescue") && m.rescue && (
        <section className="panel" aria-label={S.rescueTitle}>
          <h2>{S.rescueTitle}</h2>
          <div className="answer">{m.rescue.summary}</div>
          {m.rescue.works.length > 0 && <div className="line"><b>{S.rescueWorks}:</b> {m.rescue.works.join("; ")}</div>}
          <div className="line"><b>{S.rescueBroken}:</b> {m.rescue.broken}</div>
          <div className="line muted"><b>{S.rescueChecks}:</b></div>
          {m.rescue.evidence.map((e, i) => <div className={`line ${e.status === "failed" ? "blocked" : "muted"}`} key={i}>{e.label}: {({ running: S.stepRunning, passed: S.stepPassed, failed: S.stepFailed, skipped: S.stepSkipped } as Record<string, string>)[e.status] ?? e.status}<CheckDetail parts={checkParts(e)} /></div>)}
          <div className="row">
            {pointsOnScreen(m.where) && <button className="btn" type="button" onClick={() => pointProblem(project, m.where)}>{S.pointWhere}</button>}
            <CopyButton text={rescueCopy(m.rescue)} label={S.copyAnswer} />
            <button className="btn" type="button" onClick={() => { putAside(m.plan?.agent, true); dispatch({ type: "ui.planCancelled", release: true }); }}>{S.closeFinished}</button>
          </div>
        </section>
      )}

      {show("task") && m.task && m.task.lines.length > 0 && (
        <section className="panel" aria-label={m.task.label || "Task"}>
          {/* The task's name is Home's headline above (homeHero.ts), so here only its latest steps. */}
          {/* The latest one or two steps, in plain words: never the raw command. */}
          {activityNow(m).map((l, i) => <div key={i} className={`line ${l.outcome === "blocked" || l.outcome === "denied" ? "blocked" : ""}`}>{l.outcome === "blocked" ? `${S.blocked}: ` : l.outcome === "denied" ? `${S.denied}: ` : l.outcome === "needs_approval" ? `${S.waiting}: ` : ""}{l.words}</div>)}
        </section>
      )}

      {show("proof") && m.task?.proof && m.task.proof.steps.length > 0 && (
        <section className={`panel ${notDoneReason(m) ? "amber" : ""}`} aria-label={S.checkingTitle}>
          <h2>{isFixing(m) ? S.fixing : notDoneReason(m) ? S.notDone : S.checkingTitle}</h2>
          {m.task.proof.steps.map((s) => (
            <div className={`proof ${s.status === "passed" ? "ok" : s.status === "failed" ? "bad" : "wait"}`} key={s.rung}>
              <Icon name={s.status === "passed" ? "tick" : s.status === "failed" ? "cross" : "wait"} size={16} />
              <span>
                {s.label}: {({ running: S.stepRunning, passed: S.stepPassed, failed: S.stepFailed, skipped: S.stepSkipped } as const)[s.status]}
                <CheckDetail parts={checkParts(s)} />
              </span>
            </div>
          ))}
          {triesNote(m) && <div className="line"><b>{triesNote(m)}</b></div>}
          {notDoneReason(m) && !isFixing(m) && <div className="line">{S.notDoneHelp} {notDoneReason(m)}</div>}
          {canBisect(m) && project && buttonShown("whichTask") && <div className="row"><button className="btn" type="button" onClick={findBreaker}>{S.bisectButton}</button></div>}
        </section>
      )}

      {show("receipt") && m.receipt && (
        <section className="panel receipt" onPointerEnter={() => { overReceipt.current = true; }} onPointerLeave={() => { overReceipt.current = false; }}>
          <h2>{receiptHeading(m.receipt)}</h2>
          {receiptSaid(m) && (() => { const w = receiptSaid(m)!; return (
            <div className="answer" role={w.help ? "status" : undefined}>
              <div><b>{w.lead}:</b> {plainPath(w.words, project)}</div>
              {w.help && <div className="muted">{w.help}</div>}
            </div>
          ); })()}
          {m.receipt.changed.length === 0 ? <div className={receiptHeading(m.receipt) === S.answerTitle ? "line muted" : "line"}>{S.nothingChanged}</div> :
            m.receipt.changed.map((c) => <div className="line" key={c.file}>{(S as any)[c.kind] ?? c.kind}: {c.file}</div>)}
          {m.receipt.notUndoable.length > 0 && <div className="line"><b>{S.cannotUndo}:</b> {m.receipt.notUndoable.join("; ")}</div>}
          {m.receipt.changed.length > 0 && (
            <div className={`proof ${m.receipt.proof === "passed" ? "ok" : m.receipt.proof === "failed" ? "bad" : "wait"}`}>
              <Icon name={m.receipt.proof === "passed" ? "tick" : m.receipt.proof === "failed" ? "cross" : "wait"} size={16} />
              <span>{receiptProofWords(m)}</span>
            </div>
          )}
          <ProofChips m={m} />
          {m.receipt.visual?.image && !undone && m.undo?.stage !== "working" && (
            <figure className="receipt-shot">
              <img src={`data:image/jpeg;base64,${m.receipt.visual.image}`} alt={m.receipt.visual.caption} />
              <figcaption>{m.receipt.visual.caption}</figcaption>
            </figure>
          )}
          {m.receipt.picture && !m.receipt.visual && !undone && <div className="line muted">{S.receiptPicturing}</div>}
          {blockedNote(m, project) && <div className="line"><b>{blockedNote(m, project)}</b></div>}
          <ul className="facts" aria-label={S.look.factsLabel}>
            {m.receipt.changed.length > 0 && <li>{S.look.files(m.receipt.changed.length)}</li>}
            <li>{S.cost}: {formatUsd(m.receipt.usdEstimate)}</li>
            <li>{m.receipt.commands} {S.commands}</li>
          </ul>
          {m.receipt.gone && <div className="line">{S.receiptGone}</div>}
          <div className="row"><CopyButton text={receiptCopy(m, project)} label={S.copyReceipt} /></div>
          {m.receipt.changedAt && !undone && m.undo?.stage !== "working" && project && (
            <div className="row"><button className="btn" type="button" onClick={() => pointAt(pointChange(project, m.receipt!.changedAt!, S.changedHere))}>{S.showChanged}</button></div>
          )}
          {canOfferTurn(m) && yourTurn && !undone && project && (
            <div className="line">
              <div className="line muted">{S.teachOfferHelp}</div>
              <div className="row"><button className="btn" type="button" onClick={() => tryTheNextOne(m.receipt!.checkpoint)}>{S.teachOffer}</button></div>
            </div>
          )}
          {m.undo?.stage === "confirm" && project && (
            <ConfirmStep className="line" label={S.undoSure} back={undoId} onCancel={() => dispatch({ type: "ui.undoCancelled" })}><div>{S.undoSure}</div><div>{keepsMine ? S.undoKeeps : S.undoReplaces}</div>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => { dispatch({ type: "ui.undoSent" }); void send(undo(project, m.undo!.checkpoint)); }}>{S.undoYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.undoCancelled" })}>{S.undoNo}</button>
              </div></ConfirmStep>
          )}
          {m.undo?.stage === "working" && <div className="line" role="status">{S.undoWorking}</div>}
          {m.undo?.stage === "failed" && <div className="line" role="alert">{m.undo.note}</div>}
          {m.undo?.stage === "done" && <div className="line" role="status">{m.undo.yours?.length ? undoneExcept(m.undo.yours) : S.undone}{m.undo.recovered ? ` ${S.undoRecovered}` : ""}{m.undo.large ? ` ${S.undoLarge}` : ""}{m.undo.putBack === "done" ? ` ${S.undoPutBackDone}` : ""}</div>}
          {m.undo?.stage === "done" && !!m.undo.yours?.length && !m.undo.putBack && project && (
            <div className="row"><button id={`${undoId}-back`} className="btn" type="button" onClick={() => dispatch({ type: "ui.putBackAsked" })}>{S.undoPutBack}</button></div>
          )}
          {m.undo?.stage === "done" && m.undo.putBack === "confirm" && project && (
            <ConfirmStep className="line" label={S.undoPutBackSure} back={`${undoId}-back`} onCancel={() => dispatch({ type: "ui.putBackCancelled" })}><div>{S.undoPutBackSure}</div>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => { dispatch({ type: "ui.putBackSent" }); void send(undoPutBack(project, m.undo!.checkpoint)); }}>{S.undoPutBackYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.putBackCancelled" })}>{S.undoPutBackNo}</button>
              </div></ConfirmStep>
          )}
          {m.undo?.stage === "done" && m.undo.putBack === "working" && <div className="line" role="status">{S.undoPutBackWorking}</div>}
          {m.undo?.stage === "done" && m.undo.putBack === "failed" && <div className="line" role="alert">{m.undo.putBackNote}</div>}
          {m.explain && m.explain.checkpoint === m.receipt.checkpoint && <ExplainBox e={m.explain} key={m.explain.checkpoint} />}
          {groups.on("followUp") && (canFollowUp(m, project) || m.followUp === "sending") && (
            <FollowUpBox project={project} sending={m.followUp === "sending"} retry={canRetry({ ...m, followUp: "idle" }, project)} onSent={followSent} onRefused={followRefused}
              text={followText} setText={(t) => { setFollowText(t); if (!t) followFromVoice.current = false; }}
              listening={m.voice?.stage === "listening" && overReceipt.current && setting("talk.followUpByPointing") === true}
              answer={!!m.receipt.asks && !undone} />
          )}
        </section>
      )}

      {show("teach") && m.teach && (
        <section className={`panel ${m.teach.stage === "refused" || m.teach.stage === "left" || (m.teach.stage === "checked" && m.teach.result?.verdict === "failed") ? "amber" : ""}`} role="status" aria-label={S.teachTitle}>
          <h2>{S.teachTitle}</h2>
          {teachLines(m.teach).map((l, i) => <div className="line" key={i}>{l}</div>)}
          {/* No Close while the old code is back at the person's place: Put my fix back, or Leave it as it is (teachActions). */}
          <div className="row">
            {teachActions(m.teach).map((a) => {
              const t = m.teach!;
              switch (a) {
                case "where": return <button key={a} className="btn" type="button" onClick={() => pointAt(pointChange(project, t.target!, S.teachHere))}>{S.pointWhere}</button>;
                case "check": return <button key={a} className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.teachChecking", agent: AGENT }); void send(checkMyChange(project, t.checkpoint)); }}>{S.teachCheck}</button>;
                case "putBack": return <button key={a} className="btn" type="button" onClick={() => { dispatch({ type: "ui.teachRestore" }); void send(undo(project, t.restore!, true)); }}>{S.teachPutBack}</button>;
                case "leave": return <button key={a} className="btn" type="button" onClick={() => { putAside(t.agent); void invoke("showme_clear"); dispatch({ type: "ui.teachLeft" }); }}>{S.teachLeave}</button>;
                case "close": return <button key={a} className="btn" type="button" onClick={() => { putAside(t.agent); void invoke("showme_clear"); dispatch({ type: "ui.teachClosed" }); }}>{S.pointClose}</button>;
              }
            })}
          </div>
        </section>
      )}

      {show("browser") && bv && (
        <section className={`panel ${m.browser.stage === "failed" ? "amber" : ""}`} role="status" aria-label={S.browserTitle}>
          <h2>{S.browserTitle}</h2>
          <div className="line">{bv.line}</div>
          {typeof bv.percent === "number" && <progress max={100} value={bv.percent} aria-label={S.browserProgressLabel} />}
          {(bv.button || bv.closable) && (
            <div className="row">
              {bv.button && <button className="btn primary" type="button" disabled={bv.busy} onClick={getTheBrowser}>{bv.button}</button>}
              {bv.closable && <button className="btn" type="button" onClick={() => dispatch({ type: "ui.browserClosed" })}>{S.closeFinished}</button>}
            </div>
          )}
        </section>
      )}


      {show("voice") && m.voice && (
        <section className={`panel ${["error", "mic_refused", "blocked", "needs_mic", "needs_model"].includes(m.voice.stage) ? "amber" : ""}`} role="status" aria-label={S.voiceTitle}>
          <h2>{S.voiceTitle}</h2>
          <div className="line">{m.voice.message}{m.voice.stage === "downloading" && typeof m.voice.percent === "number" ? ` ${m.voice.percent}%` : ""}</div>
          {m.voice.stage === "needs_model" && <div className="row"><button className="btn primary" type="button" onClick={() => void invoke("voice_download")}>{S.voiceDownload}</button></div>}
          {["error", "mic_refused", "blocked", "needs_mic", "silent", "model_ready"].includes(m.voice.stage) && <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.voiceClosed" })}>{S.voiceClose}</button></div>}
        </section>
      )}

      {show("point") && m.point && (
        <section className={`panel ${m.point.stage === "found" ? "amber" : ""}`} role="status" aria-label={S.pointTitle}>
          <h2>{S.pointTitle}</h2>
          {m.point.stage === "checking" && <div className="line">{S.pointChecking}</div>}
          {m.point.stage === "clear" && <div className="line">{S.pointClear}</div>}
          {m.point.stage === "gaps" && <div className="line">{S.pointGaps}</div>}
          {m.point.stage === "nothing" && <div className="line">{S.pointNothing}</div>}
          {m.point.note && <div className="line muted" role="note">{m.point.note}</div>}
          {m.point.stage === "found" && <>
            <div className="line"><b>{m.point.label}</b></div>
            <div className="line">{m.point.problem && m.point.problem.kind === "line" ? `${m.point.problem.file}, line ${m.point.problem.line}: ` : ""}{m.point.problem?.message || plainPath(m.point.message ?? "", project)}</div>
          </>}
          {m.point.stage !== "checking" && (
            <div className="row">
              {m.point.stage === "found" && pointsOnScreen(m.point.problem) && <button className="btn" type="button" onClick={() => pointProblem(project, m.point?.problem)}>{S.pointWhere}</button>}
              {m.point.stage === "found" && <button className="btn" type="button" disabled={m.diagram?.stage === "asking"} onClick={() => drawIt("Why did this break?", m.point?.problem && m.point.problem.kind === "line" ? { kind: "line", file: m.point.problem.file, line: m.point.problem.line, message: m.point.problem.message } : { message: m.point?.problem?.message ?? m.point?.message })}>{S.drawWhy}</button>}
              {m.point.stage === "found" && <button className="btn primary" type="button" onClick={() => {
                const pt = m.point!;
                // The fix asked next sets its own state; if it is refused, the agent is not left on Needs you anywhere.
                putAside(pt.agent); void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" });
                if (!project) return;
                // In a practice copy whose problem was found: the practice's own fix, the same as Fix it with me on Learn. Else
                // look deeper first (Rescue), as usual; one small checked fix (the practices' own request) when Settings says so
                // and the problem is one line (point.fixWith).
                const route = pointFixRoute(setting("point.fixWith"), pt.problem, nowModel.current.practice, project);
                if (route === "practice") practiceFix(nowModel.current.practice!);
                else if (route === "smallFix") { pressed(); dispatch({ type: "ui.undoClosed" }); void sendOrExplain(fixFound(project, { label: pt.label, detail: pt.message, problem: pt.problem })); }
                else void send(diagnose(project));
              }}>{S.pointFix}</button>}
              {m.point.stage === "found" && canBisect(m) && project && buttonShown("whichTask") && <button className="btn" type="button" onClick={findBreaker}>{S.bisectButton}</button>}
              {/* The project's checks found nothing wrong: the problem may be in another app, so the screen can be looked at (point.everyday). */}
              {["clear", "gaps", "nothing"].includes(m.point.stage) && everydayOn && <button className="btn" type="button" onClick={() => { pressed(); putAside(m.point?.agent); dispatch({ type: "ui.pointClosed" }); lookEveryday(); }}>{S.everydayLookInstead}</button>}
              <button className="btn" type="button" onClick={() => { putAside(m.point?.agent); void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); }}>{S.pointClose}</button>
            </div>
          )}
        </section>
      )}

      {show("everyday") && ed && ed.stage !== "looking" && (
        <section className={`panel ${["found", "still", "ask"].includes(ed.stage) ? "amber" : ""}`} role="status" aria-label={S.everydayTitle}>
          <h2>{S.everydayTitle}</h2>
          {ed.stage === "none" && <div className="line">{S.everydayNone}</div>}
          {ed.stage === "still" && <div className="line"><b>{S.everydayStill}</b></div>}
          {ed.stage !== "none" && <div className="line">{ed.problem}</div>}
          {ed.stage === "checking" && <div className="line muted">{S.everydayChecking}</div>}
          {ed.stage === "fixed" && <div className="line"><b>{S.everydayFixed}</b></div>}
          {ed.stage === "ask" && <div className="line"><b>{ed.ask === "looks" ? S.everydayLooksFixed : ed.ask === "stillRead" && ed.code ? S.everydayStillRead(ed.code) : S.everydayAsk}</b></div>}
          {ed.stage === "saidWorks" && <div className="line">{ed.ask === "looks" ? S.everydaySaidWorksLooked : S.everydaySaidWorks}</div>}
          {["found", "still"].includes(ed.stage) && ed.fixes && ed.fixes.length > 0 && (<>
            <div className="line muted">{S.everydayFixesTitle}</div>
            <ul>{ed.fixes.map((f, i) => <li className="line" key={i}>{f}</li>)}</ul>
          </>)}
          {ed.fromTable && ed.stage !== "none" && <div className="line muted" role="note">{S.everydayFromTable}</div>}
          {["fixed", "saidWorks"].includes(ed.stage) && everydayWhy && <ExplainBox e={everydayWhy} title={S.everydayWhyTitle} note={S.everydayWhyNote} open key={`why:${ed.req ?? ""}`} />}
          <div className="row">
            {ed.stage === "ask" && <>
              <button className="btn primary" type="button" onClick={() => dispatch({ type: "ui.everydaySaid", worked: true })}>{S.lessonYes}</button>
              <button className="btn" type="button" onClick={() => { dispatch({ type: "ui.everydaySaid", worked: false }); checkEveryday(false); }}>{S.lessonNo}</button>
            </>}
            {/* With no step shown yet: Show me the steps, a fresh everyday look (never a look again, so it cannot say fixed before anything was done). After that: Check it is fixed looks again, and points at the next step when it is not. */}
            {(() => { const act = mainAction(ed, !!walk, lastWalk.current?.steps.length ?? 0); return act && <button className="btn primary" type="button" onClick={() => { if (act === "steps") { pressed(); lookEveryday(everydayStepsAsk(ed.problem)); } else checkEveryday(); }}>{act === "steps" ? S.everydaySteps : S.everydayCheck}</button>; })()}
            {ed.stage === "none" && project && buttonShown("findProblem") && <button className="btn" type="button" onClick={() => { pressed(); dispatch({ type: "ui.everydayClosed" }); dispatch({ type: "ui.findProblem" }); void sendOrExplain(findProblem(project), () => dispatch({ type: "ui.pointClosed" })); }}>{S.everydayCheckProject}</button>}
            <button className="btn" type="button" onClick={() => { void invoke("showme_clear"); setWalk(null); dispatch({ type: "ui.everydayClosed" }); }}>{S.pointClose}</button>
          </div>
        </section>
      )}

      {show("bisect") && m.bisect && (
        <section className={`panel ${m.bisect.stage === "done" && m.bisect.outcome === "found" ? "amber" : ""}`} role="status" aria-live="polite" aria-label={S.bisectTitle}>
          <h2>{S.bisectTitle}</h2>
          {bisectLines(m).map((l, i) => <div className="line" key={i}>{l}</div>)}
          {m.bisect.stage === "done" && m.bisect.outcome === "found" && (m.bisect.changed?.length ?? 0) > 0 && (
            <details>
              <summary>{S.bisectWhatChanged}</summary>
              {m.bisect.changed!.map((c) => <div className="line" key={c.file}>{(S as any)[c.kind] ?? c.kind}: {c.file}</div>)}
              {m.bisect.diff && <pre className="diff" tabIndex={0} aria-label={S.bisectWhatChanged}>{m.bisect.diff}</pre>}
            </details>
          )}
          {m.bisect.undoStage === "confirm" && m.bisect.task && project && (
            <ConfirmStep className="line" label={S.bisectUndoSure(m.bisect.changedCount ?? m.bisect.changed?.length ?? 0)} back={bisectUndoId} onCancel={() => dispatch({ type: "ui.bisectUndoCancelled" })}><div>{S.bisectUndoSure(m.bisect.changedCount ?? m.bisect.changed?.length ?? 0)}</div>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => { dispatch({ type: "ui.bisectUndoSent" }); void send(undoOneTask(project, m.bisect!.task!.checkpoint)); }}>{S.bisectUndoYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.bisectUndoCancelled" })}>{S.bisectUndoNo}</button>
              </div></ConfirmStep>
          )}
          <div className="row">
            {m.bisect.stage === "running" && <button className="btn" type="button" onClick={() => void send(stopAgent())}>{S.stop}</button>}
            {m.bisect.stage === "done" && m.bisect.outcome === "found" && m.bisect.undo === "safe" && !m.bisect.undoStage && project && <button id={bisectUndoId} className="btn danger" type="button" onClick={() => dispatch({ type: "ui.bisectUndoAsked" })}>{S.bisectUndo}</button>}
            {m.bisect.stage === "done" && m.bisect.undoStage !== "working" && <button className="btn" type="button" onClick={() => { putAside(m.bisect?.agent); dispatch({ type: "ui.bisectClosed" }); }}>{S.bisectClose}</button>}
          </div>
        </section>
      )}

      {show("errorHelp") && m.eh && (
        <section className={`panel ${["refused", "error", "needs_accessibility", "nothing_selected", "consent"].includes(m.eh.stage) ? "amber" : ""}`} role="status" aria-live="polite" aria-label={S.ehTitle}>
          <h2>{S.ehTitle}</h2>
          {["ready", "unexplained"].includes(m.eh.stage) && m.eh.excerpt && <div className="line muted">{m.eh.excerpt}</div>}
          {ehLines(m).map((l, i) => <div className="answer" key={i}>{l}</div>)}
          {m.eh.stage === "consent" && (
            <div className="row">
              <button className="btn primary" type="button" onClick={() => void invoke("eh_consent", { choice: "always" })}>{S.phAlways}</button>
              <button className="btn" type="button" onClick={() => void invoke("eh_consent", { choice: "once" })}>{S.phOnce}</button>
              <button className="btn" type="button" onClick={() => void invoke("eh_consent", { choice: "never" })}>{S.phNever}</button>
            </div>
          )}
          <div className="row">
            {["ready", "unexplained"].includes(m.eh.stage) && pointsOnScreen(m.eh.where) && project && m.eh.project === project && <button className="btn" type="button" onClick={() => pointProblem(project, m.eh!.where)}>{S.pointWhere}</button>}
            {m.eh.stage === "ready" && <CopyButton text={ehCopy(m)} label={S.copyAnswer} />}
            {["ready", "unexplained"].includes(m.eh.stage) && m.eh.evidence && project && m.eh.project === project && <button className="btn primary" type="button" disabled={working} onClick={() => { pressed(); dispatch({ type: "ui.undoClosed" }); void send(fixError(project, m.eh!.evidence!, m.eh!.where)); void invoke("eh_dismiss"); }}>{S.ehFix}</button>}
            <button className="btn" type="button" onClick={() => { void invoke("eh_dismiss"); dispatch({ type: "ui.ehClosed" }); }}>{["reading", "thinking", "consent"].includes(m.eh.stage) ? S.planCancel : S.ehClose}</button>
          </div>
        </section>
      )}

      {show("secondLook") && m.sl && (
        <section className={`panel ${["refused", "error", "needs_accessibility", "nothing_selected", "consent", "failed", "off"].includes(m.sl.stage) || m.sl.verdict === "check" ? "amber" : ""}`} role="status" aria-live="polite" aria-label={S.slTitle}>
          <h2>{S.slTitle}</h2>
          {slLines(m).map((l, i) => <div className="answer" key={i}>{l}</div>)}
          {m.sl.stage === "consent" && (
            <div className="row">
              <button className="btn primary" type="button" onClick={() => void invoke("sl_consent", { choice: "always" })}>{S.phAlways}</button>
              <button className="btn" type="button" onClick={() => void invoke("sl_consent", { choice: "once" })}>{S.phOnce}</button>
              <button className="btn" type="button" onClick={() => void invoke("sl_consent", { choice: "never" })}>{S.phNever}</button>
            </div>
          )}
          {slSources(m).map((src) => <ResearchNote key={src.url} text={S.slSource(src.title)} source={src.url} />)}
          <div className="row">
            {m.sl.stage === "ready" && <CopyButton text={slCopy(m)} label={S.copyAnswer} />}
            <button className="btn" type="button" onClick={() => { void invoke("sl_dismiss"); dispatch({ type: "ui.slClosed" }); }}>{["reading", "thinking", "consent"].includes(m.sl.stage) ? S.planCancel : S.ehClose}</button>
          </div>
        </section>
      )}

      {show("showMe") && m.showme && (
        <section className={`panel ${m.showme.stage === "error" || m.showme.stage === "needs_permission" || m.showme.stage === "window_changed" ? "amber" : ""}`} role="status" aria-label={S.showMe}>
          <h2>{S.showMe}</h2>
          <div className="line">{m.showme.message}</div>
          {["pointing", "pointing_roughly", "your_turn_miss"].includes(m.showme.stage) && (walk || m.showme.turn) && (
            <div className="row">
              <button className="btn" type="button" onClick={() => { pressed(); void invoke("do_it_for_me"); }}>{S.doItForMe}</button>
              {walk && <button className="btn" type="button" onClick={() => nextStep()}>{S.showMeNext}</button>}
              <button className="btn" type="button" onClick={() => { void invoke("showme_clear"); setWalk(null); }}>{S.showMeDone}</button>
            </div>
          )}
          {["your_turn_done", "done_for_you"].includes(m.showme.stage) && walk && asking && (
            <div className="row">
              <div className="line">{S.lessonWorked}</div>
              <button className="btn primary" type="button" onClick={() => nextStep(true)}>{S.lessonYes}</button>
              <button className="btn" type="button" onClick={() => nextStep(false)}>{S.lessonNo}</button>
              <button className="btn" type="button" onClick={() => { void invoke("showme_clear"); setWalk(null); setAsking(false); }}>{S.showMeDone}</button>
            </div>
          )}
          {["your_turn_done", "done_for_you"].includes(m.showme.stage) && !walk && <div className="row"><button className="btn" type="button" onClick={() => { void invoke("showme_clear"); }}>{S.onlineClose}</button></div>}
          {(["error", "needs_permission", "opened", "window_changed", "not_sure"].includes(m.showme.stage) || (["pointing", "pointing_roughly"].includes(m.showme.stage) && !walk && !m.showme.turn)) && <div className="row"><button className="btn" type="button" onClick={() => { void invoke("showme_clear"); setWalk(null); }}>{S.onlineClose}</button></div>}
        </section>
      )}

      {show("recap") && m.recap && (
        <section className="panel" role="status" aria-label={S.recapTitle}>
          <h2>{S.recapTitle}</h2>
          {m.recap.lines.map((l, i) => <div className="answer" key={i}>{l}</div>)}
          <div className="line muted">{S.recapSource}</div>
          <div className="row">{m.recap.next && m.recap.next.action !== "none" && <button className="btn primary" type="button" onClick={whereNext}>{S.recapNext[m.recap.next.action]}</button>}<CopyButton text={recapCopy(m.recap)} label={S.copyAnswer} /><button className="btn" type="button" onClick={() => dispatch({ type: "ui.recapClosed" })}>{S.recapClose}</button></div>
        </section>
      )}

      {show("toast") && m.toast && (
        <section className="panel" role="status" aria-label={S.memoryTitle}>
          <div className="line">{savedWords(m)}</div>
          <div className="row">
            <button className="btn" type="button" onClick={() => { for (const l of m.toast!.lines) void send(forgetLine(project, l.scope, l.id)); dispatch({ type: "ui.toastClear" }); }}>{S.memoryUndo}</button>
            <button className="btn" type="button" onClick={() => { dispatch({ type: "ui.toastClear" }); pickTab("memory"); }}>{S.memorySeeAll}</button>
            {toastMs() === null && <button className="btn" type="button" onClick={() => dispatch({ type: "ui.toastClear" })}>{S.memoryClose}</button>}
          </div>
        </section>
      )}


      {show("memory") && !project && <div className="line muted">{S.homeMemoryNoProject}</div>}
      {show("memory") && project && !m.memory && m.runnerUp && <div className="line muted" role="status">{S.homeMemoryLoading}</div>}
      {show("memory") && m.memory && (
        <section className="panel" aria-label={S.memoryTitle}>
          <h2>{S.memoryTitle}</h2>
          <div className="line muted">{S.memoryNever}</div>
          {m.memory.paused && <div className="line"><b>{S.memoryPaused}</b></div>}
          {m.memory.problems.map((p, i) => <div className="line blocked" key={i}>{p}</div>)}
          {m.memoryNote && <div className="line blocked" role="alert">{m.memoryNote}</div>}
          <MemoryList title={S.memoryProject} scope="project" lines={m.memory.projectLines} project={project} />
          <MemoryList title={S.memoryProfile} scope="profile" lines={m.memory.profileLines} project={project} />
          <SharedFilesRow project={project} refresh={m.notice} send={send} />
          <div className="row">
            <button className="btn" type="button" onClick={() => void changeSetting("memory.paused", !m.memory!.paused)}>{m.memory.paused ? S.memoryResume : S.memoryPause}</button>
            <button className="btn" type="button" role="switch" aria-checked={fun} onClick={() => void changeSetting("fun.reactions", !fun)}>{S.reactionsSetting}: {fun ? S.on : S.off}</button>
            <button className="btn" type="button" onClick={() => void send(exportMemory(project))}>{S.memoryExport}</button>
            <button className="btn" type="button" onClick={() => void send(answerAgents(project, "remove"))}>{S.agentsRemove}</button>
            <button className="btn" type="button" onClick={() => { dispatch({ type: "ui.memoryClosed" }); pickTab("now"); }}>{S.memoryClose}</button>
          </div>
          {m.exported && <textarea className="export" readOnly value={m.exported} aria-label={S.memoryExport} rows={8} />}
        </section>
      )}
      {show("history") && <HistoryPanel items={project ? m.history : []} q={historyQ} setQ={setHistoryQ} undoState={m.undo} project={project} keepsMine={keepsMine} dispatch={dispatch} />}
      {show("watch") && project && groups.on("watch") && (
        <details className="more" open={watchesOf(m.watches, project).some((w) => w.state === "failing")}>
          <summary>{S.watch.title}</summary>
          <WatchPanel watches={watchesOf(m.watches, project)} asked={m.watchAsked} fixOn={groups.on("connections") && groups.on("drive")} h={watchHandlers} />
        </details>
      )}
      {/* The folder, quietly at the foot of Now. */}
      {show("folder") && <div className="foot">
      <div className="row folder" role="group" aria-label={S.folderLabel}>
        <button className="btn" type="button" onClick={pickFolder}>{S.folderChange}</button>
        {recent.length > 1 && (
          <select aria-label={S.folderRecent} value="" onChange={(e) => { if (e.target.value) useFolder(e.target.value); }}>
            <option value="">{S.folderRecent}</option>
            {recent.filter((r) => r !== project).map((r) => <option key={r} value={r}>{r.split("/").filter(Boolean).slice(-2).join("/")}</option>)}
          </select>
        )}
      </div>
      {awayFolder(m) && <div className="line muted" role="status">{S.awayWorking(awayFolder(m)!)}</div>}
      {copying && <div className="line muted" role="status">{S.copying}</div>}
      {!linkOpen ? !copying && <div className="row folder"><button id={linkId} className="btn" type="button" onClick={() => setLinkOpen(true)}>{S.openLink}</button></div> : (
        <div className="row">
          <input ref={focusIfLost} aria-label={S.openLinkLabel} placeholder="https://github.com/name/project" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) openLink(); if (e.key === "Escape") { e.stopPropagation(); setLinkOpen(false); focusBack(linkId); } }} />
          <button className="btn primary" type="button" onClick={openLink}>{S.openLinkGo}</button>
          <button className="btn" type="button" onClick={() => { setLinkOpen(false); focusBack(linkId); }}>{S.planCancel}</button>
        </div>
      )}
      {m.cloneNote && <div className="error" role="alert">{m.cloneNote} <button className="btn" type="button" onClick={() => dispatch({ type: "ui.cloneNoteClosed" })}>{S.onlineClose}</button></div>}
      {folderNote && <div className="error" role="alert">{folderNote}</div>}
      {!project && <div className="notice">{S.folderNone}</div>}
      </div>}
      </div>
      </>)}
      </div>
      {onboarded && (
      // Undo and Stop, as small pills at the foot of Home, only when they can act: Undo after a task that changed files (the
      // receipt asks "are you sure" and keeps the choices), Stop while something works, with the key that stops everything.
      <div className="strip" ref={strip} role="group" aria-label={S.look.stripLabel}>
        {undoCan(m, project) && (
          <button id={undoId} className="pill" type="button" aria-label={S.undo} onClick={(e) => { spin(e.currentTarget); if (m.receipt) dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint }); }}><Icon name="undo" size={14} />{S.look.undoShort}</button>
        )}
        {stopCan(m) && (
          <button className="pill stop" type="button" aria-label={`${S.stop}. ${keyHint("stop", S.look.stopKeys, keys)}`} title={keyHint("stop", S.look.stopKeys, keys)} onClick={() => void send(stopAgent())}><Icon name="stop" size={14} />{S.stop}</button>
        )}
        {putBackShown && <span className="putback-note" role="status">{S.look.putBack}</span>}
      </div>
      )}
    </main>
  );
}
// Settings (settingsStore.ts): asked for once, kept in step with every change. The saved text size is on the page before
// Home first draws, so nothing jumps (until the shell answers, the choice kept in this page's own storage before the
// registry is used, with the same meaning).
startSettings();
applyTextSize(textSize());
// Less motion (character.motion) stops Home's own animations too.
followLessMotion();
createRoot(document.getElementById("root")!).render(<StrictMode><Card /></StrictMode>);

/** Anthropic's Claude missing or damaged after the first run (M22): one plain line and Get Claude, with the download's
 *  progress. Shows nothing while Claude is ready. */
function ClaudeNotice() {
  const [st, setSt] = useState<{ state: string; received?: number; total?: number | null; message?: string } | null>(null);
  useEffect(() => {
    void invoke("claude_status").then((v) => setSt(v as { state: string })).catch(() => {});
    const off = listen("claude-install", (e) => setSt(e.payload as { state: string }));
    return () => { off.then((f) => f()); };
  }, []);
  if (!st || st.state === "ready") return null;
  const mb = Math.round((st.received ?? 0) / 1e6), pct = st.total ? Math.min(100, Math.round(((st.received ?? 0) / st.total) * 100)) : null;
  return (
    <section className="panel notice claude-notice" role="status">
      <div className="line">{st.state === "installing" ? S.fr.claudeGetting(mb, pct) : st.state === "failed" ? st.message : S.fr.claudeMissing}</div>
      {st.state !== "installing" && <div className="row"><button className="btn primary" type="button" onClick={() => { setSt({ state: "installing", received: 0 }); void invoke("claude_install_now").catch(() => {}); }}>{st.state === "failed" ? S.fr.claudeAgain : S.fr.claudeInstall}</button></div>}
    </section>
  );
}
