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
import { answerPlayer, flightFor, lineMs, planSteps, sequenceOver, stepsLine, stillWanted, targetsOf, type Step } from "./sequence.ts";
import { alsoSayLines, askedByVoice, followVoiceShowMe, lineByVoice, lineFor, newReply, repliesIn, repliesOn, speakWhen, speechOn, spokenNote, voiceShowMe, wordsToSay, type AskKind, type VoiceQuestion } from "./speech.ts";
import { guessWords } from "./pointer.ts";
import { noteSpeed, spokenSpeed, voiceSettingsFrom } from "./voicesettings.ts";
import { reviewDismiss, reviewFix, reviewNow } from "./commands.ts";
import { AGENT, SETTINGS_LESSON_ID, undoPutBack, releaseAgent, watchAdd, watchCheck, watchFix, watchList, watchPause, watchRemove, whereWasI, fixWatch, checkBrowser, getBrowser, NO_PROJECT, metricsNote, walkActed, walkAnswer, walkList, walkSkip, walkStart, walkStop, fixFound, VERCEL_LESSON_ID, askDiagram, inspectProject, installPackages, findProblem, shipLive, shipPreview, shipRollback, answerAgents, askRecap, editLine, eraseMemory, exportMemory, forgetLine, listMemory, checkShip, answerApproval, approvePlan, askResearch, chooseLoop, diagnose, pauseDrive, resumeDrive, listTasks, planDrive, startTask, stopAgent, undo, followUp, retryTask, pointChange, tryNextOne, checkMyChange, findBreakingTask, undoOneTask, fixError, warmEngine, checkMac , newFolderTask} from "./commands.ts";
import { browserView, confirmable, lookState, shipWords, phWords, blockedNote, characterWords, costWords, savedWords, pausedWords, driveWords, formatUsd, historyWords, isFixing, triesNote, notDoneReason, notDoneLine, plainPath, stateLabel, pointsOnScreen, activityNow, canFollowUp, canRetry, stuckWords, stuckHelpWords, planCutWords, canOfferTurn, receiptHeading, receiptUndone, receiptVerdict, receiptSaid, cardWorking, teachActions, teachLines, bisectLines, canBisect, ehLines, slLines, slSources, releasable, foundHandsOver, awayFolder, folderName, lessonWordsOnly } from "./model.ts";
import { invoke, listen } from "./tauri.ts";
import type { Explain, HistoryItem, MemoryLine, Practice, Problem, UndoState } from "./model.ts";
import { NO_RECORD, backTo, canStart, copyOf, lessonsShown, listRows, markFor, needsMacCheck, nextPractice, nodeMissing, practiceWithoutNode, pointFixRoute, practiceNotes, practiceOf, recordFrom, resumeOnOpen, startOrOpen, workingOn, type PracticeRecord } from "./practice.ts";
import { PracticeList, PracticePanel } from "./practicePanel.tsx";
import { Onboarding } from "./onboarding.tsx";
import { afterInstallFailed, autoCheckDue, found, installAllowed, isBusy, readyVersion, updateLine } from "./updates.ts";
import { useModel } from "./useModel.ts";
import { PH_KEYS_MS, acceptHint, armedFor, canPick, choicesFrom, chordLabel, keyHint, keyProblem, keysFrom, keysIn, setKeysNow, type Choices, type Job, type Keys } from "./keys.ts";
import { useKeys } from "./useKeys.ts";
import { followLessMotion, reducedMotion } from "./motion.ts";
import { HomeStage, useHomeStage } from "./homeStage.tsx";
import { CountUp, useHomeMotion } from "./smoothMotion.ts";
import { JobLive } from "./jobLive.tsx";
import { arrivalFrom, closesOnClickAway, homeReduce, homeStart, markedLine, need, phArmable, shownOn, stepsAside, tabId, tabName, tabPanelId, typing, type HomeArrival, type Panel, type Tab } from "./home.ts";
import { reviewHeroSays, jobNowSays, askRoute, blockerOf, heroCompact, homeFixRoute, jobLive, jobNowWords, workingLine, timeLine, reviewLead, aboutWorthACard, needMainFor, sayFor, agoWords, barPlaces, barStopCan, bringBackCan, heroWords, homeMode, homeStatus, jobStep, mainFor, placeAfter, retryOwnsMain, recapShownLines, recapWorthACard, stopCan, undoCan, frontFollowed, frontKindOf, halfWay, heroRingOf, heroLineSaid, heroStatusOf, homeFoot, statusLineShown, statusSubShown, type FrontKind, type MainAct } from "./homeHero.ts";
import { notePress, orderWays, readCounts, type Counts, type Way } from "./usedOften.ts";
import { HomeCharacter } from "./homeCharacter.tsx";
import { Waterline } from "./waterline.tsx";
import { livelinessOf } from "./lookfeel.ts";
import { approvalWords } from "./approvals.ts";
import { useLook } from "./useLook.ts";
import { AGAIN_EVENT, onboardedNow } from "./firstRunAgain.ts";
import { ProofChips } from "./proofChipsView.tsx";
import { ChangesCard } from "./changesCard.tsx";
import { RecentList } from "./recentList.tsx";
import { FlowMini } from "./flowflowMini.tsx";
import { layoutOf, seaFills, sideOn, sidePlaces, sideRecent, useMoreBelow } from "./homeLayout.ts";
import { HomeSide } from "./homeSide.tsx";
import { ReviewCardView, REVIEW_ID } from "./reviewCard.tsx";
import { changesWait, dismissHow, keyWarned, reviewShown, silenceCommand } from "./review.ts";
import { reviewRowLook } from "./reviewHistory.ts";
import { roomElement, useRoomStill } from "./element.ts";
import { RoomLight } from "./roomLight.tsx";
import { historyStamp, taskName } from "./itemLook.ts";
import { ItemTile, Stamp } from "./itemMarks.tsx";

/** M40: an action's keys, as Key labels at the end of its row (only to see; the row's own name is what is read out). */
import { FirstLook } from "./firstLook.tsx";
import { S } from "./strings.ts";
import { failNote } from "./failwords.ts";
import { CheckDetail, checkParts } from "./checkDetail.tsx";
import { fileNames, undoneExcept } from "./undoWords.ts";
import { fixWhat, watchesOf } from "./watch.ts";
import type { NewFolderKind, ReviewReasonKind, ReviewRowView, WatchKind, WatchView } from "../../protocol/index.ts";
import { WatchPanel } from "./watchPanel.tsx";
import { activeGroup, buttonShown, followPendingAfter, invitation, learnShown, offLine, refusalNotice, toolOn, triedList, usedBy, useGroups } from "./groups.ts";
import { refusedEvent, refusedLine, type RefusedEvent } from "./sendRefused.ts";
import { PartBoundary } from "./partBoundary.tsx";
import { applyTextSize, textSize, textSizeFrom } from "./textsize.ts";
import { SettingsView, lastPage } from "./settingsPage.tsx";
import { shapeAsk } from "./settingsFit.ts";
import { changeSetting, migrateFromPageStorage, setting, settingsReady, startSettings, useSetting } from "./settingsStore.ts";
import { memoryDate, offBoxAfter, offRecordAtStart, recapDue, toastMs } from "./memorySettings.ts";
import { webLink } from "./links.ts";
import { DRAFT_KEY, askKey, boxTakesKeyboard, draftToKeep, heardGoesTo, heardKind, putBack, sendsItself, sentOutcome, type FollowAim, type HeardKind, type Sent } from "./askbox.ts";
import { aboutCopy, copyable, ehCopy, slCopy, explainCopy, receiptCopy, recapCopy, rescueCopy, researchCopy } from "./copytext.ts";
import { HISTORY_STATUSES, NO_FILTER, filterHistory, historyFiltering, historyUndo, type HistoryQuery, type HistoryStatus } from "./history.ts";
import { SEEN_VERSION_KEY, whatsNew, type Release } from "./whatsnew.ts";
import { DropList, useDrop } from "./dropRing.tsx";
import { Icon } from "./icons.tsx";
import { FailingLine, lineOf } from "./failingLine.tsx";
import { Button, FootLine, Group, KeyLabel, Menu, ProofChip, Row, Said, StatusLine, Switch, VerdictLine } from "./ui/parts.tsx";
import { addFiles, addedLine, blocksDrop, carriesFiles, checkAttachments, chipLabel, forRequest, mergeAdded, pastedFiles, removeFile, shellReader, DOC_LIMIT_KEY, docLimitBytes, type Attached, type FileLike } from "./attachfiles.ts";
import { atLimit as atFreeLimit, lastFreeLine, proCovers, proTag } from "./plan.ts";
import { LimitPanel, ProTag } from "./planCard.tsx";
import { planNow, usePlan } from "./usePlan.ts";
import "./style.css";
import "./ui/look.css";
import "./ui/wide.css";
import "./ui/home.css";
import "./ui/homeFlow.css";
import { checksOnOpen, Landing, onlyStreamChanged, revealTo, STREAM_LINES, waitScroll } from "./homeFlow.ts";
import { changeSize } from "./changeSize.ts";
import { contentAtMs } from "./homeShape.ts";
import { resultChips, type ChipId } from "./resultChips.ts";
/** How long a proven result keeps its landing attribute: long enough for the glow to play once (ui/homeFlow.css). */
const LAND_HOLD_MS = 2000;

// A command the shell will not pass on (the engine restarting, its queue full, a group switched off) is never a silent
// failure (must fix 13, bar rule 11): send says so in one plain line by default, through the card's model, so whatever was
// waiting for the answer stops waiting. sendQuiet is for the page's own background asks and for presses that handle a
// refusal themselves.
const sendQuiet = (cmd: unknown) => invoke("send_command", { cmd });
let refused: ((ev: RefusedEvent) => void) | null = null;
const send = (cmd: unknown) => { const p = sendQuiet(cmd); p.catch((e) => refused?.(refusedEvent(e, cmd))); return p; };
// Beta numbers: a fixed name, counted only if the person turned numbers on.
const SESSION_GAP_MS = 30 * 60 * 1000;
const count = (name: string) => { void sendQuiet(metricsNote(name)); };
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
    onSent(true); void sendQuiet(c).catch(onRefused); setText("");
  };
  return (
    <div className="followup">
      {retry && (
        <div className="row">
          <button className="btn primary" type="button" disabled={sending} onClick={() => { if (sending) return; onSent(false); void sendQuiet(retryTask(project)).catch(onRefused); }}>{S.tryAgain}</button>
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

/** M66 fix 4: Prompt help's text while it is written. Whole words, a chunk at a time (homeFlow.ts revealTo), in a box that
 *  keeps STREAM_LINES lines, pinned to the bottom under a top fade, so Home never grows or wobbles a line at a time. The
 *  box comes once with the first words and goes once when the answer is ready. */
function StreamBox({ text }: { text: string }) {
  const shown = useRef("");
  shown.current = revealTo(shown.current, text);
  return <div className="ph-stream line muted" style={{ "--stream-lines": STREAM_LINES } as React.CSSProperties}><p>{shown.current}</p></div>;
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
    <button className="btn" type="button" aria-label={label} onClick={copy}>{state === "copied" ? S.copied : label}</button>
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
/** The bar's place buttons: the Places landmark in the tall Home, a plain group beside the wide Home's side list, which is the
 *  Places landmark there (the audit, item 51: two landmarks had the same name). */
function PlacesBox({ side, children }: { side: boolean; children: ReactNode }) {
  return side ? <div className="places">{children}</div> : <nav className="places" aria-label={S.look.placesLabel}>{children}</nav>;
}

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
// focus: the task a recent fix on Now opened (F28): its row is scrolled to and flashes once, as a Settings search hit does.
function HistoryPanel({ items, reviews = [], q, setQ, undoState: u, project, keepsMine, dispatch, focus, now, onAsk }: { items: HistoryItem[]; reviews?: ReviewRowView[]; q: HistoryQuery; setQ: (q: HistoryQuery) => void; undoState: UndoState | null; project: string; keepsMine: boolean; dispatch: (e: { type: string; [k: string]: unknown }) => void; focus?: number | null; now: number; onAsk?: () => void }) {
  useEffect(() => { if (focus != null) document.getElementById(`history-${focus}`)?.scrollIntoView({ block: "center" }); }, [focus]);
  const filtering = historyFiltering(q);
  const shown = filtering ? filterHistory(items, q) : items.slice(0, 20);
  const undoId = useId();
  const offers = project ? shown.map((h) => historyUndo(items, h, u?.stage === "done" ? u.checkpoint : null)) : [];
  const explainWhy = offers.includes("older");
  return (
    // M51 polish: no card around the list (the page is the list), its heading for VoiceOver only (the page is titled History).
    <section className="panel bare hist" aria-label={S.recentTitle}>
      <h2 className="sr">{S.recentTitle}</h2>
      {/* Nothing yet: Flowflow and one way to start, never a lone grey sentence (the audit, item 51). */}
      {items.length === 0 && (
        <div className="hist-empty">
          <div className="pr-peek" aria-hidden="true"><FlowMini state="idle" className="pr-char" /></div>
          <p className="line muted">{S.homeHistoryNone}</p>
          {onAsk && <div className="row"><button className="btn" type="button" onClick={onAsk}>{S.historyFirstFix}</button></div>}
        </div>
      )}
      {items.length > 0 && (
        <div className="row" role="search">
          <input type="search" autoComplete="off" spellCheck={false} value={q.words} placeholder={S.historySearch} aria-label={S.historySearch}
            onChange={(e) => setQ({ ...q, words: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Escape" && !composing(e) && q.words) { e.preventDefault(); e.stopPropagation(); setQ({ ...q, words: "" }); } }} />
          <Menu label={S.historyStatusLabel} size="md" value={q.status} options={HISTORY_STATUSES.map((s) => ({ id: s, label: S.historyStatus[s] }))} onChange={(status: HistoryStatus) => setQ({ ...q, status })} />
          {filtering && <button className="btn" type="button" onClick={() => setQ(NO_FILTER)}>{S.historyClear}</button>}
        </div>
      )}
      {items.length > 0 && <div className={filtering ? "line muted" : "sr"} role="status" aria-live="polite">{filtering ? (shown.length ? S.historyMatches(shown.length, items.length) : S.historyNoMatch) : ""}</div>}
      {filtering && items.length >= 50 && <div className="line muted">{S.historyRecent}</div>}
      {/* M51 polish: one grid per task, the same in both layouts: the tile, the name over one quiet line (how it ended, when,
          what it cost), the badge at the row's end. How it ended is said once: the badge says it when there is one (and is
          read out), else the quiet line does. The name is the words asked, never the safety copy's "Before:". */}
      {shown.length > 0 && <ul className="hist-list">{shown.map((h, i) => { const backId = `${undoId}-${h.id}`; const name = taskName(h.label); const stamp = historyStamp(h, now); return (
        <li className="hist-row" key={h.id} id={`history-${h.id}`} data-flash={focus === h.id || undefined}>
          <ItemTile label={name} big />
          <div className="hist-main">
            <span className="hist-name">{name}</span>
            <span className="hist-meta"><span className={stamp ? "unstamped" : undefined}>{historyWords(h)}{"\u00a0·\u00a0"}</span>{agoWords(h.endedAt ?? h.startedAt, now)} · {costWords(h.usd)}</span>
          </div>
          {stamp && <Stamp kind={stamp} spoken />}
          <div className="hist-extra">
          {offers[i] === "undo" && !u && <div className="row"><button id={backId} className="btn" type="button" onClick={() => dispatch({ type: "ui.undoAsked", checkpoint: h.checkpoint })}>{S.historyUndo}</button></div>}
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
        </li>
      ); })}</ul>}
      {explainWhy && <div className="line muted">{S.historyUndoWhy}</div>}
      {/* M57 feature 1: the reviews of changes to this project, each with its own mark (Review), the rating in words and
          with its drawing, what was done with it, and the files by name only. Not searched with the tasks: their own list. */}
      {reviews.length > 0 && !filtering && (
        <div className="hist-reviews" role="group" aria-labelledby={`${undoId}-reviews`}>
          <h3 id={`${undoId}-reviews`} className="review-label">{S.history.reviewsTitle}</h3>
          <ul className="hist-list">{reviews.map((x) => { const l = reviewRowLook(x, now); return (
            <li className="hist-row hist-review" key={`review-${x.id}`} data-rating={x.rating}>
              <span className="ui-verdict-mark hist-review-mark" data-tone={l.tone} aria-hidden="true"><Icon name={l.icon} size={18} /></span>
              <div className="hist-main">
                <span className="hist-name">{l.name}</span>
                <span className="hist-meta">{l.meta}</span>
                <code className="hist-files">{l.files}</code>
              </div>
              <span className="ui-stamp hist-review-stamp">{l.mark}</span>
            </li>
          ); })}</ul>
        </div>
      )}
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
        <div className="note" key={l.id} role="group" aria-label={l.text}>
          {editing === l.id ? (
            <div className="row">
              <input ref={focusIfLost} type="text" value={text} aria-label={`${S.memoryEdit}: ${l.text}`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(l.id); if (e.key === "Escape") { e.stopPropagation(); setEditing(null); focusBack(editId(l.id)); } }} />
              <button className="btn" type="button" onClick={() => save(l.id)}>{S.memorySave}</button>
            </div>
          ) : (
            <>
              {/* A note is a flat card: the fact in plain words, then its source and what to do with it, so every line can be forgotten. */}
              <p className="note-text">{l.text}</p>
              <div className="note-src">
                <span>{S.memoryFrom} {l.source}{l.date ? `, ${memoryDate(l.date)}` : ""}</span>
                <span className="note-acts">
                  <button id={editId(l.id)} className="note-btn" type="button" aria-label={`${S.memoryEdit}: ${l.text}`} onClick={() => { setEditing(l.id); setText(l.text); }}>{S.memoryEdit}</button>
                  <button className="note-btn" type="button" aria-label={`${S.memoryForget}: ${l.text}`} onClick={() => void send(forgetLine(project, scope, l.id))}>{S.memoryForget}</button>
                </span>
              </div>
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
  const [m, dispatch] = useModel();
  // Pro (the payments spec, T17): the plan on this Mac, from the shell. With payments off it is { paymentsOn: false } and
  // nothing on Home changes: no tag, no limit card, no line under Fix it.
  const pro = usePlan();
  // A command of a tool whose group is switched off is refused with one plain line (the shell, then the engine). The line is
  // shown, and whatever waiting state the press had set is closed, so nothing stays on "checking", "fixing" or "asking".
  // Every refusal is said, not only a group switched off (must fix 13).
  const explainRefusal = (e: unknown) => dispatch({ type: "app.notice", message: refusedLine(e) });
  const sendOrExplain = (cmd: unknown, closed?: () => void): Promise<void> => sendQuiet(cmd).then(() => undefined, (e) => { closed?.(); explainRefusal(e); });
  // Where send's refusals go: this card's model (protocol.error), as if the engine had refused the command itself.
  useEffect(() => { refused = (ev) => dispatch(ev); return () => { refused = null; }; }, [dispatch]);
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
  // M66: the black shape Home grows out of the notch in, and its state (homeStage.tsx).
  const homeStage = useHomeStage();
  const stageOpen = useRef(homeStage.open); stageOpen.current = homeStage.open;
  // Where the keyboard goes back to for a place: its round button, or on Now (which has none) the ask box.
  const placeEl = (t: Tab): HTMLElement | null => document.getElementById(tabId(t)) ?? (t === "now" ? box.current : null);
  // The mic beside the ask box says how to hold to talk (the keys work in any app).
  // A gentle line under the ask box when a press needs words first (Start, Show me or Explain with the box empty). It has a
  // Close button, and typing clears it.
  const [askHint, setAskHint] = useState<string | null>(null);
  const needWords = (line: string) => { setAskHint(line); box.current?.focus(); };
  // What is open is measured, not the column it sits in (that column is as tall as the window, so it could never shrink).
  const inner = useRef<HTMLDivElement>(null);
  // M55, smooth motion: Home's parts, and the cards of the place open (smoothMotion.ts useHomeMotion).
  const work = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  // Which page of Settings is open, or what a deep link names (a page, a group, a setting): the last page viewed at first.
  const [setPlace, setSetPlace] = useState<string>(() => lastPage());
  const box = useRef<HTMLTextAreaElement>(null);
  // Words in the ask box (or in a follow up's) are being typed: Home never closes on a click elsewhere then (home.ts).
  const typingNow = (): boolean => !!box.current?.value.trim() || (document.activeElement instanceof HTMLInputElement && !!document.activeElement.value.trim());
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
  const warmSoon = () => { const t = Date.now(); if (t - warmedAt.current < 60_000) return; warmedAt.current = t; void sendQuiet(warmEngine()).catch(() => {}); };
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
  const linkId = useId(), undoId = useId(), bisectUndoId = useId(), askId = useId(), checksId = useId();
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
    dispatch({ type: "ui.taskSendFailed" });
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
  const openedAt = useRef(0);   // when Home last opened (M66 fix 15: a waiting card is placed, not scrolled, while it opens)
  const onArrival = useRef<(t: HomeArrival) => void>(() => {});
  // The same as state, for what must follow Home on and off screen (the Prompt help result's keys).
  const [homeOpen, setHomeOpen] = useState(false);
  // M55, adapts to you: the kind of app in front (an editor, an AI coding app, a browser, a terminal or other), all the shell
  // tells Home about it (everyday.rs home_front): as Home opens, and each time it changes. Never its id, name or contents.
  const [frontKind, setFrontKind] = useState<FrontKind | null>(null);
  useEffect(() => {
    const off = listen("front-kind", (e) => { const k = frontKindOf(e.payload); if (k) setFrontKind(k); });
    return () => { void off.then((f) => f()); };
  }, []);
  // M55, smooth motion: a new place fades and rises in, a card that goes folds away, what stays slides to its new place.
  // Nothing with Reduce motion or Less motion, nothing while Home is away, nothing at rest.
  // M66 fix 4: a render where only streamed text changed is not measured; its box keeps its size (homeFlow.ts).
  const modelWas = useRef<typeof m | null>(null);
  const streamOnly = onlyStreamChanged(modelWas.current, m); modelWas.current = m;
  useHomeMotion(root, work, view, home.tab, homeOpen, streamOnly);
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
  // The water's colour, Home's theme (M19) and the other look choices (M51) chosen in Settings. The first run is always
  // Graphite (the audit, item 4): it comes before any choice, and White or Black would break its own dark tokens.
  // The first run takes the theme too (the review, 2 Nov 2026): a new person gets Black, the usual, and Home after it is the same place.
  useLook({ choices: true });
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
  // The files went back after the last task (an Undo here, from the timeline or of one task), so its picture, Show me what
  // changed and the turn are not about what is in the files (M45). Put my fix back on a turn is not an Undo.
  const undone = receiptUndone(m.receipt) || (m.undo?.stage === "done" && !m.undo.back);
  const keepsMine = useSetting("undo.protectMyEdits") !== false;
  // M66 fix 17: a proven result lands once, the first time it is seen on Now (homeFlow.ts Landing), for long enough to
  // play; after that, and on any return to it, it is simply there.
  const landing = useRef(new Landing()), landedAt = useRef<{ id: string; at: number } | null>(null);
  // M66 (the shortlist, item 1): Fix it from a chip asks first, then runs as a checked task with its own safety copy.
  const [chipFixAsk, setChipFixAsk] = useState(false);
  useEffect(() => { setChipFixAsk(false); }, [m.receipt?.checkpoint]);
  const routinesOn = useSetting("watch.on") === true;
  // The browser check's one time download: ask the engine whether it is set up (or downloading) whenever it is up.
  const bv = browserView(m);
  useEffect(() => { if (m.runnerUp) void sendQuiet(checkBrowser()).catch(() => {}); }, [m.runnerUp]);
  const getTheBrowser = () => {
    if (bv?.busy) return;   // a second press while it downloads does nothing
    dispatch({ type: "ui.browserInstallAsked" });
    void sendQuiet(getBrowser()).catch(() => dispatch({ type: "browser.install", stage: "failed", detail: S.browserFailed }));
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
    // M66 fix 16: a copy opened for the first time is checked once too (it said Not checked yet), quietly, like one opened
    // again: Home and the notch then say how it really is (homeFlow.ts checksOnOpen).
    if (!pr || !checksOnOpen({ practice: pr, project, busy: isBusy(m), switched: switched.current, seen: resumedKey.current })) return;
    resumedKey.current = pr.project;
    // Only the key's checks answer with problem.found; the open table's check before going live never points at all.
    if (practiceOf(pr.kind)?.find === "checks") quietFind.current = pr.project;
    practiceFind();
  }, [m.practice?.project, m.practice?.stage, m.practice?.resumed, project]);
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
  useEffect(() => { if (project) void sendQuiet(inspectProject(project)); }, [project]);
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
    if (!projectRef.current || asked.current || !toolOn("drawIt")) return;
    // M33: with no problem on screen, Draw it draws a picture of the question (HeyClicky style); with one, the diagram.
    const cmd = askDiagram(projectRef.current, question, problem, problem ? undefined : "sketch");
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
      if (ev.made && (ev as { sketch?: unknown }).sketch && ev.project === projectRef.current) {
        void invoke("show_diagram", { diagram: { sketch: (ev as { sketch: unknown }).sketch } }).catch((err) => dispatch({ type: "ui.diagramFailed", reason: String(err) === "busy" ? "Something else is pointing at the screen right now. Try again in a moment." : "I could not show that on your screen. Try again." }));
        return;
      }
      if (ev.made && ev.diagram && ev.project === projectRef.current) {
        const laid = layoutDiagram(ev.diagram, 720);
        void invoke("show_diagram", { diagram: { ...laid, caption: ev.diagram.caption, reason: ev.diagram.broken.reason } }).catch((err) => dispatch({ type: "ui.diagramFailed", reason: String(err) === "busy" ? "Something else is pointing at the screen right now. Try again in a moment." : "I could not show that on your screen. Try again." }));
      }
    });
    return () => { off.then((f) => f()); };
  }, []);
  const [link, setLink] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  // Open from a link is chosen in the project menu (a press of the person's own), so its field takes the keyboard as it appears.
  const focusOnShow = useRef((el: HTMLInputElement | null) => { el?.focus(); }).current;
  const [copying, setCopying] = useState(false);
  const openLink = () => { const u = link.trim(); if (!u || copying) return; dispatch({ type: "ui.cloneNoteClosed" }); void invoke("clone_project", { url: u }).then(() => { setLinkOpen(false); setLink(""); setCopying(true); }).catch((e) => { if (String(e)) setFolderNote(String(e)); }); };
  // The same Open from a link, from the first run's Your project (M49): it says its own note there, so it only throws.
  const cloneLink = (u: string) => { dispatch({ type: "ui.cloneNoteClosed" }); return invoke("clone_project", { url: u }).then(() => { setCopying(true); }); };
  // The first run's first check of the real project (M49): the free check with a safety copy first and installs set to ask.
  // `fresh`: an error or notice from before this press is not this check's reason (the first run shows only this one's).
  const firstCheck = () => { pressed(); dispatch({ type: "ui.findProblem", fresh: true }); void sendOrExplain(findProblem(project, true), () => dispatch({ type: "ui.pointClosed" })); };
  const answerFromFirstRun = (approval: string, allow: boolean) => { void send(answerApproval(approval, allow)); dispatch({ type: "ui.approvalAnswered", approval }); };
  // The timeline: ask when the project is known, and again whenever a task ends.
  useEffect(() => { if (project) void sendQuiet(listTasks(project)); }, [project, m.receipt, m.review?.batch]);
  // Coming back to the front after editing elsewhere: the list (and whether the files changed since the last check, must
  // fix 11) is asked again, so Home never says the project works over edits nobody checked. Home is a non activating panel
  // (rule 9), so "focus" may never fire: it also asks when the pointer comes onto it, at most once every SINCE_ASK_MS, and
  // each time Home opens (the "opened" listener below).
  useEffect(() => {
    if (!project) return;
    const SINCE_ASK_MS = 3000;
    let last = 0;
    const again = () => { const t = Date.now(); if (t - last < SINCE_ASK_MS) return; last = t; void sendQuiet(listTasks(project)); };
    window.addEventListener("focus", again);
    window.addEventListener("pointerenter", again);
    return () => { window.removeEventListener("focus", again); window.removeEventListener("pointerenter", again); };
  }, [project]);
  // The project's watches (F21): asked for whenever the folder is known or changes, and when Flow is switched back on.
  const watchOn = groups.on("watch");
  useEffect(() => { if (project && watchOn) void sendQuiet(watchList(project)); }, [project, watchOn]);
  // Fix it on a failed watch: the evidence was asked for on the person's press (model.ts only keeps evidence that was asked
  // for), and the ordinary task starts once with it. Nothing starts by itself.
  const fixing = m.watchFix;
  useEffect(() => {
    if (!fixing) return;
    dispatch({ type: "ui.watchFixUsed" });
    if (fixing.project !== projectRef.current || !toolOn("drive")) return;
    dispatch({ type: "ui.undoClosed" });
    homeDispatch({ type: "pick", tab: "now" });
    void sendQuiet(fixWatch(fixing.project, fixWhat(fixing.kind, fixing.target), fixing.text)).catch(explainRefusal);
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
      void sendQuiet(watchFix(project, w.watch)).catch((e) => { dispatch({ type: "ui.watchAsked" }); explainRefusal(e); });
    },
  };
  // M52 (F30): the review of another AI tool's changes, on Now for the open folder only, with reviews and Flow on. Each
  // button is a press that names the card's own batch; nothing starts by itself. Fix it asks first (reviewCard.tsx), then
  // starts an ordinary task with its safety copy and Undo, counted as a fix: at the free limit it starts nothing.
  const reviewMode = useSetting("review.mode");
  const reviewOn = reviewShown(m.review, project, reviewMode, groups.on("review"));
  const reviewHandlers = {
    onReview: (proof: boolean) => {
      const r = nowModel.current.review;
      if (!r || !project) return;
      dispatch({ type: "ui.reviewAsked", batch: r.batch });
      void sendQuiet(reviewNow(project, r.batch, proof)).catch((e) => dispatch({ type: "ui.reviewRefused", batch: r.batch, reason: refusalNotice(e) }));
    },
    onDismiss: () => {
      const r = nowModel.current.review;
      if (!r || !project) return;
      dispatch({ type: "ui.reviewDismissed", batch: r.batch });
      // M57 feature 1: how it was closed, for its row in History (nothing for a batch skipped before any review).
      void sendQuiet(reviewDismiss(project, r.batch, dismissHow(r))).catch(explainRefusal);
    },
    // M57 feature 1: Copy for my AI reached the clipboard: counted (beta numbers, if on) and kept for History's row.
    onSentBack: () => {
      const r = nowModel.current.review;
      if (!r) return;
      dispatch({ type: "ui.reviewSentBack", batch: r.batch });
      count("review_send_back");
    },
    // M57 feature 7: Don't flag this kind here again saves the shared line in the project's memory, with its source. Only
    // for a kind it may silence (review.ts silenceCommand gives nothing for a key, a settings file or open data).
    onSilence: (kind: ReviewReasonKind) => {
      const r = nowModel.current.review;
      if (!r || !project) return;
      const c = silenceCommand(project, kind);
      if (!c) return;
      dispatch({ type: "ui.reviewSilenced", batch: r.batch, kind });
      void sendQuiet(c).catch(explainRefusal);
    },
    onAskFix: () => {
      const r = nowModel.current.review;
      if (!r) return;
      if (r.fix === "confirm") { dispatch({ type: "ui.reviewFixCancelled" }); return; }
      if (!toolOn("drive")) { dispatch({ type: "app.notice", message: offLine() }); return; }
      dispatch({ type: "ui.reviewFixAsked", batch: r.batch });
    },
    onFix: () => {
      const r = nowModel.current.review;
      if (!r || !project) return;
      if (atFreeLimit(planNow(), nowModel.current.proUsage ?? null)) { dispatch({ type: "ui.reviewFixCancelled" }); dispatch({ type: "ui.proLimit", reason: "fixes", resetsOn: nowModel.current.proUsage?.resetsOn }); return; }
      dispatch({ type: "ui.reviewFixSent", batch: r.batch });
      dispatch({ type: "ui.undoClosed" });
      void sendQuiet(reviewFix(project, r.batch)).catch((e) => dispatch({ type: "ui.reviewRefused", batch: r.batch, reason: refusalNotice(e) }));
    },
    onCancelFix: () => dispatch({ type: "ui.reviewFixCancelled" }),
  };
  // The list on the left's review item: Now, with the card in view and the keyboard on it.
  const openReview = () => { pickTab("now"); setTimeout(() => { const el = document.getElementById(REVIEW_ID); el?.scrollIntoView({ block: "start" }); el?.focus({ preventScroll: true }); }, 0); };
  // Where was I's one next step: a button, so nothing starts until it is pressed.
  const whereNext = () => {
    const n = m.recap?.next;
    if (!n || !project) return;
    if (n.action === "fixWatch") { const w = m.watches[n.watch]; if (w) watchHandlers.onFix(w); return; }
    if (n.action === "findProblem") { if (!toolOn("findProblem")) { dispatch({ type: "app.notice", message: offLine() }); return; } homeDispatch({ type: "pick", tab: "now" }); pressed(); dispatch({ type: "ui.findProblem" }); void sendOrExplain(findProblem(project), () => dispatch({ type: "ui.pointClosed" })); return; }
    // M57 feature 6: Review the changes. The card is there: go to it. Not on the page (Home was reloaded): this press is the
    // ask, as Review them would be, with the project's checks.
    if (n.action === "review") {
      homeDispatch({ type: "pick", tab: "now" });
      if (nowModel.current.review) { openReview(); return; }
      pressed();
      void sendQuiet(reviewNow(project, undefined, true)).catch(explainRefusal);
      return;
    }
    homeDispatch({ type: "pick", tab: "now" });
  };
  useEffect(() => {
    const off = listen("opened", (e) => {
      const keyboard = !!(e.payload as { keyboard?: boolean } | null)?.keyboard;
      overReceipt.current = false;   // Home was away: the pointer is on it again only once it moves over it
      homeShown.current = true; setHomeOpen(true); openedAt.current = performance.now();
      // M55, adapts to you: the kind of app in front as Home opens (only the kind; Home ignores anything else).
      const k = frontKindOf({ kind: (e.payload as { front?: unknown } | null)?.front });
      if (k) setFrontKind(k);
      homeDispatch({ type: "opened", keyboard });
      // M66: Home grows out of the notch (homeStage.tsx), in the same update that set the place it opens on, so it never
      // shows blank or the place it showed last. The motion is the stage's; with reduced or Less motion it fades.
      // M26: opened by a keyboard shortcut (the shell says instant, island.rs animates_open), it is simply there.
      stageOpen.current(!!(e.payload as { instant?: boolean } | null)?.instant);
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
      if (here) void sendQuiet(listTasks(here));   // must fix 11: whether the files changed since the last check, asked again
      // Where was I (F21) is Flow's; with Flow off the older three line version (core) is asked instead. Never in the background:
      // only when Home is opened, after the break chosen in Settings.
      // Recaps are Pro (the payments spec, section 2): on a plan that does not cover them, the older version is not asked,
      // so no Pro card ever comes up unasked. Where was I is free and is asked as before.
      if (last && here && recapDue(last, Date.now())) { if (toolOn("whereWasI")) void sendQuiet(whereWasI(here, new Date(last).toISOString())); else if (proCovers(planNow())) void sendQuiet(askRecap(here, new Date(last).toISOString())); }
      if (!last || Date.now() - last >= SESSION_GAP_MS) count("session");   // a new visit after a break, not every time the card opens
      touch();
    });
    // Every way Home goes away goes through the shell, which says so: a window that was just hidden sends no pointerleave.
    // Closing (Close, Esc, the island or the character again) folds Home back into the notch (homeStage.tsx listens).
    const offClosed = listen("closed", () => { overReceipt.current = false; homeShown.current = false; setHomeOpen(false); keysDown.current = null; });
    return () => { off.then((f) => f()); offClosed.then((f) => f()); };
  }, []);
  // Tell the app how tall the content is, so the panel fits it. M66 fix 14: Settings fills Home and scrolls inside it, so it
  // asks for its one height (settingsFit.ts), never the shape's own height back, or it stays at the last place's height.
  const tellHeight = (el: HTMLElement) => {
    homeStage.setContentH(shapeAsk(tabNow.current, el.offsetHeight));
    void invoke("resize_card", { height: shapeAsk(tabNow.current, el.offsetHeight), settings: tabNow.current === "settings" });
  };
  // Tell the app how tall the content is, so the panel fits it.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    // M66: the page sizes Home's shape itself (homeShape.ts bodyHeight); the shell only keeps the height for the character.
    const ro = new ResizeObserver(() => tellHeight(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Settings uses the Large width and a fixed height while it is open (the spec, 3.1): told at once when the place changes.
  useEffect(() => { const el = inner.current; if (el) tellHeight(el); }, [home.tab]);

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
        // M46: a flight time only with Fly to the place first on; otherwise the lead in is a plain pause between steps.
        flyMs: flightFor(s.total, setting("point.fly"), pace), fadeMs: lineMs(s.text, speaking, speed, pace),
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
  // Hold to talk sends by itself only when turned on (talk.autoSend); changed in Settings, Keys and voice, and in the first run, always
  // through the shell (settingsStore.ts).
  const autoSend = useSetting("talk.autoSend") === true;
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
  // Fix it on a problem that is known (the point card's, Home's main button, the first run's last screen): one route, so
  // the three never start different fixes for one problem. In a practice copy whose problem was found, the practice's own
  // fix; else look deeper first (Rescue), as usual; one small checked fix when Settings says so and the problem is one line
  // (point.fixWith). The fix asked next sets its own state; if it is refused, the agent is not left on Needs you anywhere.
  const fixKnown = () => {
    const pt = nowModel.current.point?.stage === "found" ? nowModel.current.point : null;
    if (pt) { putAside(pt.agent); void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); }
    if (!projectRef.current) return;
    const here = projectRef.current;
    const route = pointFixRoute(setting("point.fixWith"), pt?.problem, nowModel.current.practice, here);
    if (route === "practice") practiceFix(nowModel.current.practice!);
    else if (route === "smallFix" && pt) { pressed(); dispatch({ type: "ui.undoClosed" }); void sendOrExplain(fixFound(here, { label: pt.label, detail: pt.message, problem: pt.problem })); }
    else void send(diagnose(here));
  };
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
  // M33: a fix just proven is said beside the pointer too (the drop that follows it), as HeyClicky announces at the cursor.
  // Only what the verdict calls proven (M45): a pass on a task that then stopped or hit a limit is not said as done.
  // "Fixed. Checks pass." only over a real fix: a pass that changed nothing fixed nothing (must fix 7).
  const provenAt = receiptVerdict(m)?.kind === "proven" && !m.receipt!.gone ? m.receipt!.checkpoint : null;
  useEffect(() => { if (provenAt) void invoke("follow_say", { text: S.followDone }).catch(() => {}); }, [provenAt]);
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
    if (home.tab === "learn") { void sendQuiet(walkList(project || NO_PROJECT)); loadPractice(); if (needsMacCheck(m.doctor)) void sendQuiet(checkMac()); }
    if (home.tab === "memory" && project) void sendQuiet(listMemory(project));
    if (home.tab === "did" && project) void sendQuiet(listTasks(project));
  }, [home.tab, project]);
  // Node was installed while Home stayed open: coming back to Companion checks again, only on Learn and only while Node is
  // flagged missing.
  useEffect(() => {
    if (home.tab !== "learn" || !nodeMissing(m.doctor)) return;
    const again = () => void sendQuiet(checkMac());
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
    if ("do" in t) {
      // The notch's Undo this fix: the receipt's own question, on Now (it is never undone without the person's yes there).
      if (t.do === "undo") { pickTab("now"); if (m.receipt && undoCan(m, project)) dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint }); return; }
      if (t.do === "find") findFromHome(); else shipIt(); return;
    }
    // The notch's Add your key: Settings, at that place (Account, Your Claude).
    if ("set" in t) { setSetPlace(t.set); pickTab("settings"); return; }
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
    const off = listen("home-click-away", () => { if (closesOnClickAway(nowModel.current, onboardingNow.current, setting("home.closeOnClickAway") === true, typingNow())) { box.current?.blur(); player.current.hush(); void invoke("close_card"); } });
    // M66 step 5: the pointer left a Home that pointing opened. It folds back the same way, only when nothing on it waits for
    // the person (a question, an approval, words being typed); else it stays, and is the person's now (the shell asks once).
    // Step 6: and only with Close Home when I click another app on, as the shell also checks.
    const offLeft = listen("home-pointer-left", () => { if (closesOnClickAway(nowModel.current, onboardingNow.current, setting("home.closeOnClickAway") === true, typingNow())) { box.current?.blur(); player.current.hush(); void invoke("close_card"); } });
    return () => { off.then((f) => f()); offLeft.then((f) => f()); };
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
  // Only with Make it in a new folder ticked (the audit, item 2): with no project open, Return never makes one by itself.
  // The words stay, and one line asks which: the person's own project, or a new one from these words (noProjectFor).
  const inNewFolder = newFolder;
  const [noProjectFor, setNoProjectFor] = useState<NewFolderKind | null>(null);
  useEffect(() => { if (project) setNoProjectFor(null); }, [project]);
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
    const route = askRoute({ prompt, project, newFolder });
    if (route === "newFolder") { startNew("build"); return; }
    if (route === "needWords") { needWords(S.typeFirst); return; }
    if (route === "chooseProject") { setNoProjectFor("build"); return; }
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
    // Something shows at once (the audit, item 27): the words and Starting, until the engine answers.
    dispatch({ type: "ui.taskSent", words: prompt });
    void sendQuiet(startTask(project, prompt, off, added)).catch((e) => { putBackSent(); explainRefusal(e); }); setOff(offRecordAtStart());
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
    followSent(true); void sendQuiet(c).catch(followRefused); setFollowText("");
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
  // Every way online (Put it online) comes through shipGate: on a plan without Pro it shows the card behind the Pro tag and
  // sends nothing, so the result, its verdict and Undo stay. Must fix 20 (F25, every safety feature on Free): the check
  // before going live (the main button, the chip, the notch, the confirm rows) only checks on this Mac, so it is free.
  const shipGate = (): boolean => { if (!proTag("ship", planNow())) return true; dispatch({ type: "ui.proLimit", reason: "ship" }); return false; };
  const shipIt = (o: { runChecks?: boolean; confirm?: string[] } = {}) => { if (!project) return; dispatch({ type: "ui.planRequested", ship: true }); void send(checkShip(project, { runChecks: true, ...o })); };
  const shipOnline = () => { if (!project || !shipGate()) return; dispatch({ type: "ui.planRequested", ship: true }); void send(shipPreview(project)); };
  const research = () => {
    if (inNewFolder) { startNew("research"); return; }
    if (!project && (box.current?.value.trim() ?? "")) { setNoProjectFor("research"); return; }
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
    if (goal && !project) { setNoProjectFor("build"); return; }
    if (!goal || !project) return;
    // At the free fix limit a plan starts nothing: the limit card shows, and the goal stays in the box and the result stays.
    if (atFreeLimit(planNow(), m.proUsage ?? null)) { dispatch({ type: "ui.proLimit", reason: "fixes", resetsOn: m.proUsage?.resetsOn }); return; }
    sentFromBox("plan");
    dispatch({ type: "ui.undoClosed" });
    dispatch({ type: "ui.planRequested" });
    void send(planDrive(project, goal, off)); setOff(offRecordAtStart());
    clearBox();
  };

  const hero = heroWords(m, project, needNow);
  // A practice runs in this folder: Now says so over its headline (M51 polish), so a practice never reads as real work.
  const practiceNow = !!m.practice && m.practice.project === project && !!project;
  // F28, the overhaul spec 4.1: what Now is about, how the project is (from its last check only), and the one main button
  // that status picks (homeHero.ts). The clock moves each second while a job works (its time so far), else twice a minute
  // (Checked 2 hours ago), and only while Home is open.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!homeOpen) return;
    setClock(Date.now());
    const id = setInterval(() => setClock(Date.now()), working ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [homeOpen, working]);
  // The layout (look.layout, M51): wide, the usual, has the places and the recent work in a list on the left (homeSide.tsx)
  // while it fits (homeLayout.ts sideOn); then the top row has no places of its own. Tall is the one column from before.
  const layout = layoutOf(useSetting("look.layout"));
  const side = sideOn({ layout, text: textSizeFrom(useSetting("display.textSize")), onboarded, tab: home.tab });
  // What stops any work (the audit, item 12) and changes waiting for a review (item 11): each leads Now when it is there.
  const [claudeSt, setClaudeSt] = useClaudeStatus();
  const blocker = onboarded ? blockerOf({ connected: m.connected, runnerUp: m.runnerUp, claude: claudeSt?.state ?? null }) : null;
  const rlead = reviewOn ? reviewLead(m.review, project) : null;
  const mode = homeMode(m, needNow, { blocker, review: rlead });
  const status = homeStatus(m, project, clock);
  // In the wide Home the hero folds to one line while a card that needs a tap shows (item 13). Under a result just in it
  // keeps the project's status, as the tall Home does, and Flowflow stays in its water (the review, 2 Nov 2026: the folded
  // hero said "Fixed and proven" over a card that said it again, and the best moment had no Flowflow).
  const compact = side && heroCompact(m, reviewOn);
  const statusFirst = mode === "rest" || mode === "result";
  const heroShown = blocker ? { headline: S.home.blocked[blocker].headline, line: S.home.blocked[blocker].line, detail: undefined, count: undefined }
    : mode === "review" && rlead ? { headline: rlead.headline, line: rlead.line, detail: undefined, count: undefined, friendly: rlead.friendly } : hero;
  // M65, the Instrument look: a status line with its dot over the headline, the orb's ring agreeing with that line, and the
  // footer line under the ask box (homeHero.ts). The page never branches on the style: the tokens show them in Instrument
  // and hide them in Friendly (ui/tokens.css --home-instrument-show, ui/wide.css).
  const heroStatus = heroStatusOf(mode, status, hero.tone, !!rlead?.stop);
  const foot = homeFoot(status, undoCan(m, project));
  // The one way out of a block, or into the review, as the main button.
  const blockMain = blocker && S.home.blocked[blocker].main ? blocker : null;
  const reviewMain = mode === "review" && rlead?.main === "review";
  const doBlockMain = () => {
    if (blocker === "key") { setSetPlace("account.claude"); pickTab("settings"); }
    else if (blocker === "engine") void invoke("restart_engine").catch(() => {});
    else if (blocker === "claude") getClaude(setClaudeSt);
  };
  // The limit card takes the result's place and has its own main button, so Home's main button steps aside while it shows.
  const proLimit = pro.paymentsOn ? m.proLimit ?? null : null;
  const usage = m.proUsage ?? null;
  // M55, adapts to you: the main action follows the kind of app in front (Home follows the app in front) and a task left half
  // way, after what the project needs (homeHero.ts mainChoices).
  const followFront = useSetting("home.followFrontApp");
  const main = proLimit ? null : mainFor(mode, status, (b) => buttonShown(b), { front: frontFollowed(frontKind, followFront), halfWay: halfWay(m, project) });
  const shipTags = proTag("ship", pro);
  // At the free fix limit, Fix it starts nothing and shows the limit card (section 3). Check before going live is free on
  // every plan (must fix 20). The engine refuses the same way (runner/src/plan.ts).
  const doMain = (a: MainAct) => {
    if (a === "fix" && atFreeLimit(pro, usage)) { dispatch({ type: "ui.proLimit", reason: "fixes", resetsOn: usage?.resetsOn }); return; }
    if (a === "shipCheck") { shipIt(); return; }
    if (a === "folder") { pickFolder(); return; }
    // A task left half way carries on as Try again does (the same follow up, told how the last try ended); a terminal in
    // front offers the explainer, as the More ways button does (words in the box, or how to use its keys).
    if (a === "carryOn") { followSent(false); void send(retryTask(project)).catch(followRefused); return; }
    if (a === "explain") { explainFromBox(); return; }
    // Fix it fixes what was found, by the point card's own route (the audit, item 1); only Check my project checks.
    const route = homeFixRoute(nowModel.current, status, project, setting("point.fixWith"));
    if (route === "check") findFromHome(); else fixKnown();
  };
  const lastFree = main === "fix" ? lastFreeLine(pro, usage) : null;
  // More ways (the audit, item 40): each way's one line, with its keys when it has some, as its tooltip and description.
  const [moreDesc, setMoreDesc] = useState("");
  // M55, adapts to you: the ways pressed most come first (usedOften.ts), learned only from real presses here. The order is
  // read as More ways opens and then held, so a way never moves under the pointer while the list is open.
  const usedFirst = useSetting("home.usedOftenFirst") !== false;
  const [wayCounts, setWayCounts] = useState<Counts>(() => readCounts());
  const wayPress = (id: Way, go: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => { notePress(id, { trusted: e.nativeEvent.isTrusted, on: usedFirst }); go(); };
  const tip = (k: keyof typeof S.look.moreHelp, job?: "problem" | "explain" | "showme") => {
    const chord = job ? keys.using[job] : null;
    const said = chord ? chordLabel(chord) : "";
    return said ? `${S.look.moreHelp[k]} (${said})` : S.look.moreHelp[k];
  };
  // Something waits on another place (a practice open in this folder): its next step is the main button on Now, so it is
  // always above the fold (the founder, 2 Nov 2026). The same actions as the practice card's own buttons.
  const needMain = needMainFor(m, needNow, project);
  // The one main button on Now (one per screen): the way out of a block, Review the changes, the status's own, or the next
  // step of what waits elsewhere. None while the hero is folded for a card that needs a tap (the audit, item 13).
  // A result that offers Try again owns the next step (the audit, item 34), so the hero has no main button of its own then.
  const heroMain: { label: string; go: () => void; status: boolean } | null = compact ? null
    : retryOwnsMain(m, project) ? null
    : blockMain ? { label: S.home.blocked[blockMain].main, go: () => doBlockMain(), status: false }
    : reviewMain ? { label: S.home.reviewMain, go: () => openReview(), status: false }
    : main || needMain ? { label: main ? S.home.main[main] : S.home.needMain[needMain!], go: () => (main ? doMain(main) : doNeedMain()), status: !!main } : null;
  // A place that waits shows a small amber dot, except while Now already carries its next step as the main button (the
  // review, 2 Nov 2026: a practice's Check my project on Now and an amber dot on Learn said the same thing twice, in a
  // second colour).
  const waitsOn: Tab | null = needNow && !(home.tab === "now" && needMain) ? needNow.tab : null;
  const doNeedMain = () => {
    const pr = nowModel.current.practice;
    if (needMain === "practiceStart") practiceFind();
    else if (needMain === "practiceFix" && pr) practiceFix(pr);
    else pickTab("learn");
  };
  // The glow round Flowflow in its pond, in the colour of its state (never a filter inside its masked box).
  const lookNow = lookState(m);
  const glow = lookNow === "needsYou" || lookNow === "done" ? lookNow : undefined;
  const places = side ? [] : barPlaces({ practiceDone: practiceRec.rows.some((r) => !!r.done), learnWaits: needNow?.tab === "learn", learnOpen: home.tab === "learn", learnOn: learnShown() });
  // Flowflow on Home's water follows how lively the person chose (M46); the water's drift stops with Still.
  const lively = livelinessOf(useSetting("character.lively"));
  // The working card: when this job started (its time so far), and whether it is drawn (Stop lives in it then).
  const jobKey = m.task && working ? `${m.task.agent}:${m.task.checkpoint ?? m.task.label}` : "";
  const jobStart = useRef<{ key: string; at: number } | null>(null);
  if (jobKey && jobStart.current?.key !== jobKey) jobStart.current = { key: jobKey, at: Date.now() };
  const jobShown = home.tab === "now" && !!m.task && working;
  // The project menu in the top bar: change the folder, open one from a link, or one used before.
  const folderOptions = [{ id: "change", label: S.home.changeFolder }, { id: "link", label: S.home.openLink },
    ...recent.filter((r) => r !== project).map((r) => ({ id: `r:${r}`, label: r.split("/").filter(Boolean).slice(-2).join("/") }))];
  const pickFromFolderMenu = (id: string) => { if (id === "change") pickFolder(); else if (id === "link") setLinkOpen(true); else if (id.startsWith("r:")) useFolder(id.slice(2)); };
  // A recent fix opens its own receipt: the one on Now when it is the last task, else its row in History.
  const [historyFocus, setHistoryFocus] = useState<number | null>(null);
  useEffect(() => { if (home.tab !== "did") setHistoryFocus(null); }, [home.tab]);
  const openRecent = (i: HistoryItem) => {
    if (m.receipt && i.checkpoint && i.checkpoint === m.receipt.checkpoint) { pickTab("now"); setTimeout(() => root.current?.querySelector(".panel.receipt")?.scrollIntoView({ block: "start" }), 0); return; }
    setHistoryQ(NO_FILTER); setHistoryFocus(i.id); pickTab("did");
  };
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
  const roomIsStill = useRoomStill(homeOpen);
  // About this project shows as a card only when it says something to act on (homeHero.ts aboutWorthACard).
  const aboutCard = aboutWorthACard(m.about, project);
  // The fade above the ask box shows only while there is more work below to scroll to (homeLayout.ts, ui/wide.css).
  useMoreBelow(root);
  // The room (the brand language): the element of the group at work lights Home (element.ts); talking and a file dragged
  // over Home take the room for as long as they last.
  const room = roomElement({ tab: home.tab, active: activeGroup(m, dragging) });
  const viewTitle = tabName(home.tab);   // M30: Settings is titled Settings; each page carries its own title
  // The result card's landing, the size of its change and its fixed chips (M66; homeFlow.ts, changeSize.ts, resultChips.ts).
  const rcpt = m.receipt;
  if (rcpt && homeOpen && home.tab === "now" && landing.current.lands(rcpt.checkpoint, receiptVerdict(m)?.proven === true)) landedAt.current = { id: rcpt.checkpoint, at: Date.now() };
  const landed = !!rcpt && landedAt.current?.id === rcpt.checkpoint && Date.now() - landedAt.current.at < LAND_HOLD_MS;
  const changeSz = rcpt && !undone ? changeSize(rcpt.changed, rcpt.askWords) : null;
  const chips: ChipId[] = rcpt ? resultChips({
    changed: rcpt.changed.length, undone, failed: rcpt.proof === "failed",
    busy: chipFixAsk || m.followUp === "sending" || m.undo?.stage === "confirm" || m.undo?.stage === "working",
    canUndo: undoCan(m, project), undoShown: undoCan(m, project),
    explainReady: !!m.explain && m.explain.checkpoint === rcpt.checkpoint,
    // Try again moves from under the follow up box into the chips (fixShown false): it is offered once, here.
    canFix: groups.on("followUp") && canRetry({ ...m, followUp: "idle" }, project), fixShown: false,
  }) : [];
  const chipDo = (c: ChipId) => {
    const r = nowModel.current.receipt;
    if (!r) return;
    const smooth: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
    switch (c) {
      case "whatChanged": if (r.changedAt && project) pointAt(pointChange(project, r.changedAt, S.changedHere)); else root.current?.querySelector(".panel.receipt .changes")?.scrollIntoView({ block: "nearest", behavior: smooth }); return;
      case "explain": { const d = root.current?.querySelector<HTMLDetailsElement>(".panel.receipt details.explain"); if (d) { d.open = true; d.scrollIntoView({ block: "nearest", behavior: smooth }); } return; }
      case "undo": dispatch({ type: "ui.undoAsked", checkpoint: r.checkpoint }); return;
      case "fix": setChipFixAsk(true); return;
    }
  };
  // A card that waits on the person comes into view when it arrives (the audit, items 11 and 13): an approval, a stuck fix,
  // the agents question, or new changes to review. Only as far as needed, and only while Now is open.
  const waitKey = [m.approvals[0]?.id ?? "", m.stuck ? "stuck" : "", m.agentsAsk ? "agents" : "", reviewOn ? m.review!.batch : "", m.point?.stage === "found" ? "found" : ""].join("|");
  useEffect(() => {
    if (!homeOpen || home.tab !== "now" || waitKey === "||||") return;
    // M66 fix 15: scrolled to, never jumped to; while Home opens it is placed before its content shows (homeFlow.ts).
    const opening = openedAt.current > 0 && performance.now() - openedAt.current < contentAtMs();
    const id = setTimeout(() => root.current?.querySelector<HTMLElement>(".ask-card, #home-review, .panel.amber")?.scrollIntoView?.({ block: "nearest", behavior: waitScroll({ opening, reduced: reducedMotion() }) }), 0);
    return () => clearTimeout(id);
  }, [waitKey, homeOpen, home.tab]);
  // What was checked (M45): while a job works it is the live list; under a result it is the result's evidence, after it.
  // While the working card shows and nothing has failed, it already says the check under way, so the checks card waits for
  // the result (the review, 2 Nov 2026: "Running the tests" was said in two cards at once).
  const proofTwice = jobShown && !m.task?.proof?.steps.some((s) => s.status === "failed");
  const proofPanel = show("proof") && !proofTwice && m.task?.proof && m.task.proof.steps.length > 0 && (
        // A failed proof is drawn as failed, never as needing you (amber); its mark sits in a fixed slot, so the title stays on
        // the column of the check rows below it (the audit, item 34).
        <section className="panel proof-panel" data-failed={notDoneReason(m) && !receiptUndone(m.receipt) ? "" : undefined} aria-labelledby={`${checksId}-title`}>
          {/* M45: what was checked, never a verdict of its own (the receipt's result row says that); after an Undo, said as
              what was checked before it. VoiceOver names the panel by this same heading. */}
          <h2 id={`${checksId}-title`}><span className="tone-slot" aria-hidden="true">{notDoneReason(m) && !receiptUndone(m.receipt) && <Icon name="cross" size={16} />}</span>{isFixing(m) ? S.fixing : m.task.proof.steps.some((s) => s.status === "running") ? S.checkingTitle : receiptUndone(m.receipt) ? S.checksBeforeUndo : S.checksTitle}</h2>
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
          {notDoneLine(m) && !isFixing(m) && !receiptUndone(m.receipt) && <div className="line">{S.notDoneHelp} {notDoneLine(m)}</div>}
        </section>
      );
  // The cards that wait on the person (the agents question, approvals, a stuck fix, a paused plan, a plan to approve). In the
  // tall Home they come right under the hero, before the ask box, where "Your answer goes just below" points (the audit,
  // item 26); in the wide one the ask box is pinned to the bottom, so they lead the work under the hero.
  const urgentCards = show("urgent") && (
<div ref={urgent}>
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
      {m.approvals.map((a) => { const w = approvalWords(a, project); return (
        <section className="panel amber ask-card" key={a.id} aria-label={S.needsYouTitle}>
          {/* The audit, item 26: the plain question first, then exactly what will run (no tool name), then the kind of risk,
              then whether Undo covers it (approvals.ts). */}
          <h2>{w.why}</h2>
          {m.away[a.agent] && <div className="line muted">{S.awayQuestion(folderName(m.away[a.agent]))}</div>}
          {w.what && <div className="ask-what" role="group" aria-label={S.approval.what}><code>{w.what}</code></div>}
          <div className="line muted">{w.question}</div>
          {w.undo && <div className={`line ask-undo${w.canUndo ? "" : " no"}`}>{w.undo}</div>}
          {/* M45: Allow and Don't allow carry equal weight; Don't allow comes first, as in the first run, and keeps the safe
              mark and the keyboard. */}
          <div className="row">
            <button className="btn" type="button" data-safe aria-label={`${S.dontAllow}: ${a.title}`} onClick={() => { void send(answerApproval(a.id, false)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.dontAllow}</button>
            <button className="btn" type="button" aria-label={`${S.allow}: ${a.title}`} onClick={() => { void send(answerApproval(a.id, true)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.allow}</button>
          </div>
        </section>
      ); })}

      {m.stuck && (
        <section className="panel amber" aria-label={S.stuckTitle}>
          <h2>{S.stuckTitle}</h2>
          {m.stuck.agent && m.away[m.stuck.agent] && <div className="line muted">{S.awayQuestion(folderName(m.away[m.stuck.agent]))}</div>}
          <div className="line">{stuckWords(m)}</div>
          {/* The choices right after what happened (the audit, item 13), then why and the check, as the evidence. */}
          <div className="row">
            {m.stuck.options.map((o, i) => (
              <button key={o.id} className={`btn ${i === 0 ? "primary" : ""}`} type="button" data-safe={o.id === "stop" || undefined} onClick={() => { void send(chooseLoop(o.id as "different" | "stop")); dispatch({ type: "ui.stuckAnswered" }); }}>{o.label}</button>
            ))}
            {pointsOnScreen(m.where) && <button className="btn" type="button" onClick={() => pointProblem(project, m.where)}>{S.pointWhere}</button>}
          </div>
          <div className="line muted">{stuckHelpWords(m)}</div>
          {/* M45: the check, one plain sentence, the place, and the raw output only behind Details. */}
          <div className="line"><b>{m.stuck.failure.label}</b><CheckDetail parts={m.stuck.failure.parts} /></div>
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

      </div>  );
  return (
    <HomeStage stage={homeStage}>
    <main className={`card home${dragging ? " dropping" : ""}`} ref={root} data-view={home.tab} data-layout={layout} data-side={side ? "" : undefined} data-tone={hero.tone} data-talking={m.voice?.stage === "listening" ? "" : undefined}
      data-element={room} data-still={roomIsStill ? "" : undefined}
      onPointerDown={(e) => { touch(); void invoke("ui_click", { label: "card:" + (e.target as HTMLElement).tagName }); }}
      onDragOver={(e) => { if (!onboarded || !carriesFiles(e.dataTransfer?.types)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragging(true); }}
      onDragLeave={(e) => { if (!e.relatedTarget || !root.current?.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { setDragging(false); if (!carriesFiles(e.dataTransfer?.types)) return; e.preventDefault(); if (onboarded) addDropped(e.dataTransfer?.files); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !composing(e)) { e.preventDefault(); box.current?.blur(); player.current.hush(); void invoke("close_card"); } }}>
      {/* The room's light (the brand language): out of focus, behind the work, in the element of the group at work. */}
      <RoomLight element={room} />
      <div className="inner" ref={inner}>
      {/* The wide Home (look.layout, M51): the places and the recent work in a list on the left, the work beside it. */}
      {side && <HomeSide places={sidePlaces({ learnOn: learnShown() })} tab={home.tab} waits={waitsOn} recent={sideRecent(project ? m.history : [])} now={clock}
        onPick={pickTab} onSettings={gear} onOpen={openRecent} review={reviewOn ? m.review : null} onReview={openReview} />}
      <div className="sr" role="status" aria-live="polite" aria-atomic="true">{news}</div>
      {!onboarded && <PartBoundary part="firstRun"><Onboarding doctor={m.doctor} connected={m.connected} keyTested={m.keyTested} project={project} send={send} pickFolder={pickFolder} startPractice={beginPractice} onDone={finishOnboarding}
        point={m.point} approvals={m.approvals} usage={m.proUsage ?? null} firstCheck={firstCheck} answer={answerFromFirstRun} fixFound={() => setTimeout(fixKnown, 0)} cloneLink={cloneLink} copying={copying} cloneNote={m.cloneNote} why={m.error ?? m.notice} /></PartBoundary>}
      {/* The work: one column (in the wide Home, beside the list, with the ask box along its bottom; otherwise no box at all). */}
      <div className="work" ref={work}>
      {/* The top bar (F28, the overhaul spec 4.1): on Now, the project's name with a chevron menu (Change folder, Open from a
          link, the folders used before); in a place, a back arrow and its name. On the right, quiet buttons with words
          (Learn only until the first practice is done, History, Memory, Settings), then Close. A place that waits for the
          person has a small dot. A hairline under it. */}
      {onboarded && (
        <header className="bar">
          {home.tab === "now" && <Menu id={linkId} value="" size="sm" label={S.folderLabel} title={project || undefined} placeholder={project ? (project.split("/").filter(Boolean).at(-1) ?? project) : S.look.noProject} options={folderOptions} onChange={pickFromFolderMenu} />}
          {home.tab !== "now" && <>
            {/* The tall Home's row of places names the open one and leads back to Now, so the back arrow is only for Settings,
                where that row steps aside (the review, 2 Nov 2026: a back arrow beside the row was a second way to the same place). */}
            {!side && home.tab === "settings" && <button className="back" type="button" aria-label={S.look.back} title={S.look.back} onClick={() => pickTab("now")}><Icon name="back" size={16} />{needNow?.tab === "now" && <><span className="tabdot" aria-hidden="true" /><span className="sr">, {S.homeTabWaiting}</span></>}</button>}
            <h1 id="home-title" className="view-title">{viewTitle}</h1>
          </>}
          {/* In the wide Home the side list is the one Places landmark, so the bar's buttons are a plain group then (item 51). */}
          <PlacesBox side={side}>
            {/* While a job runs, Stop is one press away on every place, not only on Now (Now has its own, in the hero or the
                working card). */}
            {barStopCan(m, home.tab) && <Button kind="secondary" size="sm" className="bar-stop" label={`${S.stop}. ${keyHint("stop", S.look.stopKeys, keys)}`} title={keyHint("stop", S.look.stopKeys, keys)} onClick={() => void send(stopAgent())}><Icon name="stop" size={14} />{S.stop}</Button>}
            {/* In Settings the sidebar is the only way around: the place buttons step back (the spec, 3.1). */}
            {/* The tall Home (M51 polish): Now is a place in the row too, so the open place always shows which it is. */}
            {home.tab !== "settings" && !side && <Button kind="quiet" size="sm" pressed={home.tab === "now"} onClick={() => pickTab("now")}>{S.look.now}</Button>}
            {home.tab !== "settings" && places.map((t) => {
              const waits = waitsOn === t && t !== home.tab;
              return (
                <Button key={t} id={tabId(t)} kind="quiet" size="sm" pressed={t === home.tab} onClick={t === "settings" ? gear : () => pickTab(placeAfter(home.tab, t))}>
                  {S.home.places[t]}
                  {waits && <><span className="tabdot" aria-hidden="true" /><span className="sr">, {S.homeTabWaiting}</span></>}
                </Button>
              );
            })}
            <Button kind="icon" className="close" label={S.look.close} title={S.look.close} onClick={() => { player.current.hush(); void invoke("close_card"); }}><Icon name="close" size={14} /></Button>
          </PlacesBox>
        </header>
      )}
      {/* Each place sits in its own boundary (must fix 4): a part that fails to draw shows one line and Reload this part,
          and the top bar above still leads everywhere else. */}
      {onboarded && (<PartBoundary part={home.tab} resetKey={home.tab}>
      {/* Now, status first in one column (F28, the overhaul spec 4.1), with Flowflow living on its water beside the words (the
          founder, 31 Oct). At rest and under a result: how the project is, from its last check, and the one main button
          that status picks. While a job works, a question waits or an answer is in: that job's own words. */}
      <section className="hero" hidden={home.tab !== "now"} data-mode={mode} data-compact={compact ? "" : undefined} aria-labelledby={home.tab === "now" ? "home-title" : undefined}>
        {/* Flowflow's glow (needs you, done) is a soft circle in its pond, outside the masked box, so no edge of it shows
            (the audit, item 28). */}
        <div className="home-pond" data-lively={lively} data-glow={glow} aria-hidden="true">
          <div className="ch-water"><Waterline under /></div>
          {(() => { const say = blocker ? "" : sayFor(m, hero); return say ? <span className="say" key={say}>{say}</span> : null; })()}
          {/* M55 (the character reacts): its eyes go to the ask box while the person types, and it leans toward the review card
              while changes wait for it (only while that card is on Now). */}
          <div className="ch-char"><HomeCharacter m={m} as={blocker && blocker !== "claudeGetting" ? "error" : undefined} rest={!homeOpen || home.tab !== "now"} askId={askId}
            ring={heroRingOf(mode, heroStatus)} leanTo={home.tab === "now" && show("review") && reviewOn && changesWait(m.review) ? REVIEW_ID : null} /></div>
        </div>
        <div className="hero-words" data-line-said={!statusFirst && heroLineSaid(heroStatus, heroShown.headline, heroShown.line) ? "" : undefined}>
          {statusLineShown(heroStatus, statusFirst ? status.verdict.headline : heroShown.headline) && <StatusLine kind={heroStatus} />}
          {/* data-foot-says: the footer line already says this line (Checked 4 min ago), so Instrument shows it once. */}
          {statusFirst
            ? <div className="status-head" data-foot-says={status.sub && !statusSubShown(status.sub, foot) ? "" : undefined}><div id={home.tab === "now" ? "home-title" : undefined} role="heading" aria-level={1}><VerdictLine verdict={status.verdict} size="headline" /></div>{status.sub && <p className="subline status-sub">{status.sub}</p>}</div>
            : <>
              {/* The tag only when the headline does not already say it is a practice (the review, 2 Nov 2026: "Practice" over
                  "Practice: find it, fix it, prove it"). */}
              {practiceNow && !heroShown.headline.startsWith(S.look.practiceTag) && <span className="hero-tag">{S.look.practiceTag}</span>}
              {/* M66 fix 13: new words cross fade in by their key (ui/homeFlow.css hero-swap), the counting cost keeps its own. */}
              <h1 id={home.tab === "now" ? "home-title" : undefined} className="headline hero-swap" key={`h:${heroShown.headline}`}><Said text={heroShown.headline} friendly={heroShown.friendly?.headline} /></h1>
              {/* M55: the cost counts up to its new number rather than jumping (smoothMotion.ts). */}
              <p className="subline hero-swap" key={heroShown.count != null ? "count" : `l:${heroShown.line}`}>{heroShown.count != null ? <CountUp value={heroShown.count} words={workingLine} /> : <Said text={heroShown.line} friendly={heroShown.friendly?.line} />}</p>
              {heroShown.detail && !compact && <p className="subline muted">{heroShown.detail}</p>}
            </>}
          {/* One main button: the way out of a block, Review the changes, the status's own, or the next step elsewhere. None
              while the hero is folded for a card that needs a tap (item 13): that card's own buttons are the ones. */}
          {heroMain && <div className="hero-main"><Button kind="primary" size="lg" onClick={heroMain.go}>{heroMain.label}</Button></div>}
          {lastFree && <p className="subline muted pro-last">{lastFree}</p>}
          {/* Stop is in the working card; when something works with no card of its own (a look, an answer being written), here. */}
          {stopCan(m) && !jobShown && <div className="hero-main"><Button kind="secondary" size="sm" label={`${S.stop}. ${keyHint("stop", S.look.stopKeys, keys)}`} title={keyHint("stop", S.look.stopKeys, keys)} onClick={() => void send(stopAgent())}><Icon name="stop" size={14} />{S.stop}</Button></div>}
        </div>
      </section>
      {/* The wide Home at rest (M51 polish): the sea goes on down to the ask box, so there is no dead band under the status. */}
      {seaFills({ side, tab: home.tab, mode, cardsUnder: reviewOn || !!m.recap || !!m.toast || !!m.notice || !!m.error || aboutCard }) && <div className="sea-fill" aria-hidden="true" />}
          {/* The one ask field, under the status (27 Oct 2026, F28). Only hidden on the other places, never taken away: a draft,
              and the words from hold to talk, stay in it. Return starts; the hold to talk keys sit inside it on the right. */}
      {!side && urgentCards && <div className="view view-lead">{urgentCards}</div>}
          <div className="askwrap" hidden={!show("ask")}>
          {askMode === "showme" && <div className="line" role="status"><b>{S.showMe}:</b> {S.showMeHint} <Button size="sm" onClick={() => setAskMode("task")}>{S.planCancel}</Button></div>}
          <div className="ask">
            <span className="ask-mark" aria-hidden="true"><Icon name="sparkle" size={16} /></span>
            <textarea ref={box} id={askId} rows={1} autoComplete="off" spellCheck={false} placeholder={S.home.ask} aria-label={S.home.ask} aria-describedby="ask-keys"
              onInput={(e) => { fitBox(); keepDraft(e.currentTarget.value); setVoiceHint(null); setAskHint(null); if (!e.currentTarget.value) fromVoice.current = false; }}
              onFocus={() => warmSoon()}
              onPaste={(e) => { const fs = pastedFiles(e.clipboardData); if (fs.length > 0) { e.preventDefault(); addDropped(fs); } }}
              onKeyDown={(e) => {
                if (askKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey, composing: composing(e) }) !== "send") return;
                e.preventDefault();
                if (askMode === "showme") { const q = box.current?.value.trim() ?? ""; if (q) { sentFromBox("showme"); showMe(q, q, []); setAskMode("task"); clearBox(); } } else submit();
              }} />
            {/* A click may never open the microphone (rule 5): the keys to hold are only shown, with what they do in the tooltip. */}
            {groups.on("talk") && keys.using.talk && <span className="ask-keys" title={talkKeysLine(keys)}><KeyLabel chord={keys.using.talk} label={S.look.talk} /></span>}
            {/* While a job works the arrow stays, greyed, so the box keeps its shape (M51 polish); Stop is on the job's card. */}
            {buttonShown("start") && <Button kind="icon" className="send" label={S.look.send} title={S.look.send} disabled={working} onClick={submit}><Icon name="send" size={16} /></Button>}
          </div>
          {/* Return with no project open (item 2): the words wait, and the person says which. The key notice stays as it was. */}
          {noProjectFor && !project && (
            <div className="line ask-choose" role="status">{S.home.noProjectAsk}{" "}
              <Button size="sm" kind="secondary" onClick={() => { setNoProjectFor(null); pickFolder(); }}>{S.home.chooseMine}</Button>{" "}
              <Button size="sm" kind="secondary" onClick={() => { const k = noProjectFor; setNoProjectFor(null); startNew(k); }}>{S.home.startNewFrom}</Button>
            </div>
          )}
          {askHint && <div className="line muted" role="status">{askHint} <Button size="sm" onClick={() => { setAskHint(null); box.current?.focus(); }}>{S.ehClose}</Button></div>}
          {voiceHint && <div className="line" role="status">{voiceHint === "screenQuestion" ? S.voiceWaitsScreen : voiceHint === "holdOff" ? S.voiceWaitsHoldOff : S.voiceWaitsLanguage}</div>}
          {dragging && <div className="line drop-line" role="status">{S.attachDrop}</div>}
          {attached.length > 0 && (
            <div className="chips" role="list" aria-label={S.attachTitle}>
              {attached.map((a, i) => (
                <span className="chip" role="listitem" key={`${i}:${a.name}`}>
                  <span className="line">{chipLabel(a)}</span>
                  <Button size="sm" label={S.attachRemove(a.name)} onClick={() => { focusBack(askId); setAttachSaid(S.attachRemoved(a.name)); setAttached((l) => removeFile(l, i)); }}>{S.attachRemoveShort}</Button>
                </span>
              ))}
            </div>
          )}
          {attached.some((a) => a.kind === "image") && <div className="line muted">{S.attachPictureNote}</div>}
          {attached.length > 0 && <div className="line muted">{S.attachStartOnly}</div>}
          <div className="sr" role="status">{attachSaid}</div>
          {attachNotes.map((n, i) => <div className="line" role="status" key={i}>{n}</div>)}
          <div className="sr" id="ask-keys">{S.askKeysHint}</div>
          {/* The invitation to try a tool, only while nothing else is on Now. */}
      {mode === "rest" && (() => { const inv = invitation(setting, working, m.history.some((h) => h.status === "done")); return inv ? <div className="line muted ask-hint" role="note" aria-label={S.groups.tryTitle}>{inv.line}</div> : null; })()}
          {madeFolder && madeFolder === project && <div className="line muted" role="status">{S.newFolder.made(folderName(madeFolder))}</div>}
          {/* Every other way to ask, and the options, behind one quiet line (customizable everything: nothing is dropped). The
              check the main button already offers is not here twice. A ticked option is said on the line that opens them. */}
          {home.tab === "now" && !working && (
            <details className="more">
              <summary onClick={() => setWayCounts(readCounts())}>{S.look.more}{off && <span> · {S.offRecord}</span>}</summary>
              {/* The audit, item 40: every way has its drawing and one line, shown under the ways for the one under the pointer
                  or the keyboard (and as its tooltip, with its keys, so no keycaps crowd the buttons). In the wide Home this
                  opens as a popover over the ask box (ui/wide.css), so the page never jumps. The voice switch lives in
                  Settings, Keys and voice. */}
              <div className="more-pop">
              <div className="more-ways" onMouseOver={(e) => setMoreDesc((e.target as HTMLElement).closest("button")?.title ?? "")} onFocus={(e) => setMoreDesc((e.target as HTMLElement).closest("button")?.title ?? "")} onMouseLeave={() => setMoreDesc("")}>
                {/* M55, adapts to you: the ways pressed most come first (usedFirst, wayCounts); each press is noted only when the
                    person made it (wayPress). The main action is not here twice. */}
                {orderWays([
                  { id: "find" as const, el: buttonShown("findProblem") && main !== "fix" && main !== "check" && <Button size="sm" key="find" title={tip("find", "problem")} onClick={wayPress("find", findFromHome)}><Icon name="find" size={14} />{S.look.chipFind}</Button> },
                  { id: "safe" as const, el: buttonShown("shipCheck") && main !== "shipCheck" && <Button size="sm" key="safe" title={tip("safe")} onClick={wayPress("safe", () => shipIt())}><Icon name="shield" size={14} />{S.look.chipSafe}</Button> },
                  { id: "explain" as const, el: toolOn("errorHelp") && main !== "explain" && <Button size="sm" key="explain" title={tip("explain", "explain")} onClick={wayPress("explain", explainFromBox)}><Icon name="explain" size={14} />{S.look.chipExplain}</Button> },
                  { id: "showMe" as const, el: buttonShown("showMe") && <Button size="sm" key="showMe" title={tip("showMe", "showme")} onClick={wayPress("showMe", () => { const q = box.current?.value.trim() ?? ""; if (q) { sentFromBox("showme"); showMe(q, q, []); } else { pressed(); needWords(S.showMeHint); } })}><Icon name="pointer" size={14} />{S.look.chipShowMe}</Button> },
                  { id: "plan" as const, el: buttonShown("plan") && <Button size="sm" key="plan" title={tip("plan")} onClick={wayPress("plan", plan)}><Icon name="grid" size={14} />{S.planIt}</Button> },
                  { id: "rescue" as const, el: buttonShown("rescue") && <Button size="sm" key="rescue" title={tip("rescue")} onClick={wayPress("rescue", rescue)}><Icon name="wrench" size={14} />{S.rescueIt}</Button> },
                  { id: "research" as const, el: buttonShown("research") && <Button size="sm" key="research" title={tip("research")} onClick={wayPress("research", research)}><Icon name="doc" size={14} />{S.researchIt}</Button> },
                  { id: "online" as const, el: buttonShown("online") && <Button size="sm" key="online" title={tip("online")} onClick={wayPress("online", shipOnline)}><Icon name="send" size={14} />{S.onlineButton}{shipTags && <ProTag />}</Button> },
                  { id: "bisect" as const, el: canBisect(m) && project && buttonShown("whichTask") && <Button size="sm" key="bisect" title={tip("bisect")} onClick={wayPress("bisect", findBreaker)}><Icon name="split" size={14} />{S.bisectButton}</Button> },
                  { id: "drawIt" as const, el: buttonShown("drawIt") && <Button size="sm" key="drawIt" title={tip("drawIt")} disabled={m.diagram?.stage === "asking"} onClick={wayPress("drawIt", () => drawIt(box.current?.value ?? "", m.where ?? undefined))}><Icon name="image" size={14} />{S.drawIt}</Button> },
                ].filter((w) => !!w.el), wayCounts, usedFirst).map((w) => w.el)}
              </div>
              <p className="more-desc muted" aria-hidden="true">{moreDesc || "\u00a0"}</p>
              <label className="more-opt"><Switch checked={off} onChange={setOff} label={S.offRecord} /><span aria-hidden="true">{S.offRecord}</span></label>
              {project && <label className="more-opt"><Switch checked={newFolder} onChange={setNewFolder} label={S.newFolder.tick} /><span aria-hidden="true">{S.newFolder.tick}</span></label>}
              {attached.length === 0 && <div className="muted">{S.attachHint}</div>}
              </div>
            </details>
          )}
          {/* M65: the footer line in the Instrument look (the tokens hide it in Friendly): when it was last checked and whether
              Undo is ready, on Now only. */}
          {foot && home.tab === "now" && side && <FootLine start={foot.start} end={foot.end} />}
          </div>
          {/* About Claude itself (installing, missing, failed): under the ask box, never above it (better-interface review). */}
          <ClaudeNotice st={claudeSt} setSt={setClaudeSt} />
      {/* The recent fixes, newest first: each opens its own receipt (the one on Now, or its row in History). At rest they come
          right under the ask field; while a result or an answer is on Now, under it (below, before the folder's notes). */}
      {/* In the tall Home, changes to review come before the recent list (item 11); in the wide one they lead the work below. */}
      {!side && show("review") && reviewOn && <div className="view view-lead"><ReviewCardView r={m.review!} {...reviewHandlers} heroSays={reviewHeroSays(mode, rlead, m.review)} /></div>}
      {home.tab === "now" && show("ask") && mode === "rest" && !side && <RecentList items={project ? m.history : []} now={clock} onOpen={openRecent} />}
      {/* About Companion itself (the engine stopped, a notice, an error from something done on any place): on every place. */}
      {show("notes") && <>
      {/* M28: "Not connected" says how to fix it, and the fix is one press away. */}
      {m.notice && <div className="notice" role="status">{m.notice}{m.notice === S.notConnectedNotice && <button className="btn fix-it" type="button" onClick={() => { setSetPlace("account.claude"); pickTab("settings"); }}>{S.addYourKey}</button>}</div>}
      {updateReady && (
        <div className="notice" role="status">
          <span>{S.homeUpdateReady(updateReady)}</span>{" "}
          <button className="btn" type="button" disabled={!installAllowed(m)} onClick={installUpdate}>{S.updatesInstall}</button>
          {!installAllowed(m) && <div className="line muted">{S.updatesBusy}</div>}
          {updateNote && <div className="line">{updateNote}</div>}
        </div>
      )}
      {/* M28: when the engine has stopped, the fix is one press away, never "quit and open again". */}
      {m.error && <div className="error">{m.error}{!m.runnerUp && <button className="btn fix-it" type="button" onClick={() => void invoke("restart_engine").catch(() => {})}>{S.restartEngine}</button>}</div>}
      </>}
      {/* A place's own panel is a region named by that place; Now is the page itself, never a second region named after its
          headline (the audit, items 37 and 51). */}
      <div className="view" ref={view} role={home.tab !== "now" ? "region" : undefined} id={tabPanelId(home.tab)} aria-labelledby={home.tab !== "now" ? "home-title" : undefined}>
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
      {/* Settings inside Home (F28, T17: the one Settings; the separate window is retired): its own sidebar with search, and
          one page at a time, opened on the last page viewed or on what a deep link names. */}
      {show("settings") && <SettingsView place={setPlace} onPlace={setSetPlace} working={isBusy(m)} practiceBusy={workingOn(m)} project={project} spending={m.spending} usage={usage}
        onClose={() => pickTab("now")} onPracticeList={() => pickTab("learn")} onLesson={(l) => { beginLesson(l, false); }} onStepAside={stepAside}
        onMemory={() => pickTab("memory")} onPickFolder={pickFolder} />}
      {groups.groupOn("guide") && show("practice") && m.practice && m.practice.project === project && practiceOf(m.practice.kind) && (() => {
        const pr = m.practice!, entry = practiceOf(pr.kind)!;
        return <PracticePanel p={pr} entry={entry} folder={project.split("/").filter(Boolean).at(-1) ?? project} keys={keys} checking={m.point?.stage === "checking"} drawing={m.diagram?.stage === "asking"} busy={workingOn(m)}
          nodeFix={nodeMissing(m.doctor)?.fix ?? null} note={practiceNote} next={pr.stage === "done" ? nextPractice(practiceRec, pr.kind) : null}
          undo={m.undo} explain={pr.result && m.explain?.checkpoint === pr.result.checkpoint ? <ExplainBox e={m.explain} key={m.explain.checkpoint} /> : null}
          checks={m.task?.proof?.steps ?? []}
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
        : <section className="panel bare" aria-label={S.firstLook.watch}><div className="row"><button className="btn" type="button" onClick={() => setTour(true)}>{S.firstLook.watch}</button></div></section>)}
      {home.tab === "learn" && !learnShown() && <section className="panel" role="status" aria-label={S.groups.title}><div className="line">{S.groups.learnOff}</div></section>}
      {groups.groupOn("guide") && show("practice") && (
        <PracticeList rows={listRows(practiceRec, m.doctor)} busy={workingOn(m)} nodeFix={nodeMissing(m.doctor)?.fix ?? null} withoutNode={practiceWithoutNode(m.doctor) && (practiceWithoutNode(m.doctor)!.fix ?? "")} note={m.practice && m.practice.project === project ? "" : practiceNote} damaged={practiceRec.damaged}
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
              <div className="row">
                <button className="btn" type="button" aria-label={`${l.saved ? S.lessonContinue : S.lessonStart}: ${l.title}`} onClick={() => beginLesson(l.id, false)}>{l.saved ? S.lessonContinue : S.lessonStart}</button>
                {l.saved && <button className="btn" type="button" onClick={() => beginLesson(l.id, true)}>{S.lessonStartOver}</button>}
              </div>
            </div>
          ))}
          {/* Said once under the list, not under each new lesson (the audit, item 53). */}
          {lessonsShown(m.lessons ?? [], project, practiceRec, VERCEL_LESSON_ID).some((l) => l.status !== "tried") && <div className="line muted">{S.lessonDraft}</div>}
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
      {show("about") && aboutCard && m.about && (
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
      {side && urgentCards}
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
          {m.ph.stage === "thinking" && m.ph.streaming && <StreamBox text={m.ph.streaming} />}
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

      {side && show("review") && reviewOn && <ReviewCardView r={m.review!} {...reviewHandlers} heroSays={reviewHeroSays(mode, rlead, m.review)} />}

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

      {/* The working card (F28, the overhaul spec 4.2): the job's name is the headline above, so here the safety copy, the
          four steps (read only from the runner's real states, homeHero.ts jobStep), the step under way, the time so far
          and what it has cost, and Stop. A step that was blocked or waits for an OK is said in its own line. */}
      {/* Pro (the payments spec, section 3): the limit card, or the card behind a Pro tag, at the top of the result. Calm, never
          an error: Flowflow keeps its own state, Undo and Stop stay where they are, and Not now closes it. Never with
          payments off. */}
      {show("receipt") && proLimit && <LimitPanel view={proLimit} status={pro} usage={usage} say={(l) => dispatch({ type: "app.notice", message: l })} onClose={() => dispatch({ type: "ui.proLimitClosed" })} />}
      {show("task") && m.task && working && (() => {
        const maxTries = Number(setting("work.tries")) || 3;
        const js = jobStep(m, maxTries);
        // M55, live progress: the files changed so far while it fixes, each check as it runs while it checks (jobLive.tsx).
        const live = jobLive(m, maxTries);
        const lines = activityNow(m);
        const odd = lines.filter((l) => l.outcome === "blocked" || l.outcome === "denied" || l.outcome === "needs_approval");
        return (
          <section className="panel job" aria-label={m.task.label || S.home.jobLabel}>
            <div className="job-top">
              {m.task.checkpoint && <p className="job-safe"><Icon name="tick" size={14} />{S.home.safetySaved}</p>}
              {stopCan(m) && <Button kind="secondary" size="sm" label={`${S.stop}. ${keyHint("stop", S.look.stopKeys, keys)}`} title={keyHint("stop", S.look.stopKeys, keys)} onClick={() => void send(stopAgent())}><Icon name="stop" size={14} />{S.stop}</Button>}
            </div>
            <ol className="job-strip" aria-label={S.home.stepsLabel}>
              {S.home.steps.map((label, i) => <li key={label} data-state={i < js.step ? "done" : i === js.step ? "now" : undefined} aria-current={i === js.step ? "step" : undefined}><span className="job-bar" aria-hidden="true" /><span className="job-label">{i < js.step && <Icon name="tick" size={12} />}{label}{i < js.step && <span className="sr">{S.home.stepDone}</span>}</span></li>)}
            </ol>
            {/* The step under way in words, except while files or checks are listed: the list already says it (the review,
                3 Nov 2026: "Changing signup.js" sat over the row "signup.js"). A new try is said here only, so it stays. */}
            {(live.kind === "none" || js.retry) && <p className="job-now"><Said {...jobNowSays(jobNowWords(m, js.retry, lines))} /></p>}
            <JobLive view={live} />
            {/* The cost so far is the hero's line (the audit, item 53), so only the time is said here. M55: it ticks a second at
                a time, and counts up to the time it is when Home comes back after being away, never jumping there. */}
            <p className="job-meta"><span><CountUp value={Math.max(0, Math.floor((clock - (jobStart.current?.at ?? clock)) / 1000))} words={timeLine} step={1} /></span></p>
            {odd.map((l, i) => <div key={i} className="line blocked">{l.outcome === "blocked" ? `${S.blocked}: ` : l.outcome === "denied" ? `${S.denied}: ` : `${S.waiting}: `}{l.words}</div>)}
          </section>
        );
      })()}
      {/* A task that ended with no result card: its last steps, as they ran. */}
      {show("task") && m.task && !working && !m.receipt && m.task.lines.length > 0 && (
        <section className="panel" aria-label={m.task.label || "Task"}>
          {activityNow(m).map((l, i) => {
            const odd = l.outcome === "blocked" || l.outcome === "denied" || l.outcome === "needs_approval";
            return (
              <div key={i} className={`line step ${odd ? "blocked" : "done"}`}>
                {!odd && <Icon name="tick" size={12} />}
                <span>{l.outcome === "blocked" ? `${S.blocked}: ` : l.outcome === "denied" ? `${S.denied}: ` : l.outcome === "needs_approval" ? `${S.waiting}: ` : ""}{l.words}</span>
              </div>
            );
          })}
        </section>
      )}

      {!m.receipt && proofPanel}

      {show("receipt") && m.receipt && (
        <section className="panel receipt" data-landed={landed ? "" : undefined} onPointerEnter={() => { overReceipt.current = true; }} onPointerLeave={() => { overReceipt.current = false; }}>
          {/* M45 and the overhaul spec 4.2: the result first, as the verdict says it, at verdict size. A tick only for a
              proven fix (VerdictLine draws only what verdict.ts said). */}
          {(() => { const v = receiptVerdict(m)!; return (m.receipt.changed.length > 0 || v.kind !== "noChange") && (
            <div className="result-verdict" data-verdict={v.kind}><VerdictLine verdict={v} size="card" sub={v.line || putBackShown ? <>{v.line}{putBackShown && <span className="putback-note" role="status">{v.line ? " " : ""}{S.look.putBack}</span>}</> : undefined} /></div>
          ); })()}
          {/* The proof right under the verdict it backs (the review, 2 Nov 2026: at the card's foot, Tests pass was behind the
              wide Home's fade). */}
          <ProofChips m={m} />
          {/* Undo right under the verdict (the audit, item 13: after a fix it was below the files, off Home's 480 points).
              Inside the card (4.2): a secondary button, only when the result offers it (homeHero.ts undoCan). The
              receipt's own question follows on a press. "Put back as it was" shows for two seconds once it is done. */}
          {undoCan(m, project) && (
            <div className="row result-actions">
              <Button id={undoId} onClick={() => { if (m.receipt) dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint }); }}><Icon name="undo" size={14} />{m.receipt.wholePlan ? S.home.undoWholeFix : S.home.undoFix}</Button>
            </div>
          )}
          <h2>{receiptHeading(m.receipt)}</h2>
          {/* After an Undo the answer no longer describes the project, so it goes (the audit, item 36). */}
          {receiptSaid(m) && !undone && (() => { const w = receiptSaid(m)!; return (
            <div className="answer" role={w.help ? "status" : undefined}>
              {/* M39: the result in its own words, as a paragraph; what kind of answer it is, small above it. */}
              <div className="answer-lead">{w.lead}</div>
              <p className="answer-words">{plainPath(w.words, project)}</p>
              {w.help && <div className="muted">{w.help}</div>}
            </div>
          ); })()}
          {/* M66 (the shortlist, item 2): how big the change was, from the checkpoint diff, and a plain warning when a small ask
              changed a lot (changeSize.ts). Nothing is said when the lines could not be counted. */}
          {changeSz && <div className="line muted change-size">{changeSz.line}</div>}
          {changeSz?.warn && <div className="line" role="status">{changeSz.warn}</div>}
          {m.receipt.changed.length === 0 ? <div className={receiptHeading(m.receipt) === S.answerTitle ? "line muted" : "line"}>{S.nothingChanged}</div> : <ChangesCard changed={m.receipt.changed} undone={undone} />}
          {m.receipt.notUndoable.length > 0 && <div className="line"><b>{undone ? S.stillThere : S.cannotUndo}:</b> {m.receipt.notUndoable.join("; ")}</div>}
          {m.receipt.visual?.image && !undone && m.undo?.stage !== "working" && (
            <figure className="receipt-shot">
              <img src={`data:image/jpeg;base64,${m.receipt.visual.image}`} alt={m.receipt.visual.caption} />
              <figcaption>{m.receipt.visual.caption}</figcaption>
            </figure>
          )}
          {m.receipt.picture && !m.receipt.visual && !undone && <div className="line muted">{S.receiptPicturing}</div>}
          {blockedNote(m, project) && <div className="line"><b>{blockedNote(m, project)}</b></div>}
          <ul className="facts" aria-label={S.look.factsLabel}>
            {/* M39: how many files is the changes card's own header now, so it is not said twice. */}
            {/* M28: what the fix cost, on the person's own Claude (we never mark it up); the count of commands is for the log. */}
            <li>{m.receipt.usdEstimate > 0 ? S.fixCost(formatUsd(m.receipt.usdEstimate)) : S.noCost}</li>
          </ul>
          {m.receipt.gone && <div className="line">{S.receiptGone}</div>}
          <div className="row"><CopyButton text={receiptCopy(m, project)} label={S.copyReceipt} /></div>
          {m.receipt.changedAt && !undone && m.undo?.stage !== "working" && project && !chips.includes("whatChanged") && (
            <div className="row"><button className="btn" type="button" onClick={() => pointAt(pointChange(project, m.receipt!.changedAt!, S.changedHere))}>{S.showChanged}</button></div>
          )}
          {canOfferTurn(m) && yourTurn && !undone && project && (
            <div className="line">
              <div className="line muted">{S.teachOfferHelp}</div>
              <div className="row"><button className="btn" type="button" onClick={() => tryTheNextOne(m.receipt!.checkpoint)}>{S.teachOffer}</button></div>
            </div>
          )}
          {m.undo?.stage === "confirm" && !m.undo.back && project && (
            <ConfirmStep className="line" label={S.undoSure} back={undoId} onCancel={() => dispatch({ type: "ui.undoCancelled" })}><div>{S.undoSure}</div><div>{keepsMine ? S.undoKeeps : S.undoReplaces}</div>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => { dispatch({ type: "ui.undoSent" }); void send(undo(project, m.undo!.checkpoint)); }}>{S.undoYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.undoCancelled" })}>{S.undoNo}</button>
              </div></ConfirmStep>
          )}
          {m.undo?.stage === "working" && <div className="line" role="status">{m.undo.back ? S.bringBackWorking : S.undoWorking}</div>}
          {m.undo?.stage === "failed" && <div className="line" role="alert">{m.undo.note}</div>}
          {m.undo?.stage === "done" && <div className="line" role="status">{m.undo.back ? (m.undo.yours?.length ? S.bringBackExcept(m.undo.yours.length, fileNames(m.undo.yours)) : "") : m.undo.yours?.length ? undoneExcept(m.undo.yours) : S.undone}{m.undo.recovered ? ` ${S.undoRecovered}` : ""}{m.undo.large ? ` ${S.undoLarge}` : ""}{m.undo.putBack === "done" ? ` ${S.undoPutBackDone}` : ""}</div>}
          {m.undo?.stage === "done" && !!m.undo.yours?.length && !m.undo.putBack && project && (
            <div className="row"><button id={`${undoId}-back`} className="btn" type="button" onClick={() => dispatch({ type: "ui.putBackAsked" })}>{S.undoPutBack}</button></div>
          )}
          {m.undo?.stage === "done" && m.undo.putBack === "confirm" && project && (
            <ConfirmStep className="line" label={m.undo.back ? S.bringBackPutSure : S.undoPutBackSure} back={`${undoId}-back`} onCancel={() => dispatch({ type: "ui.putBackCancelled" })}><div>{m.undo.back ? S.bringBackPutSure : S.undoPutBackSure}</div>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => { dispatch({ type: "ui.putBackSent" }); void send(undoPutBack(project, m.undo!.checkpoint)); }}>{S.undoPutBackYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.putBackCancelled" })}>{S.undoPutBackNo}</button>
              </div></ConfirmStep>
          )}
          {m.undo?.stage === "done" && m.undo.putBack === "working" && <div className="line" role="status">{S.undoPutBackWorking}</div>}
          {m.undo?.stage === "done" && m.undo.putBack === "failed" && <div className="line" role="alert">{m.undo.putBackNote}</div>}
          {/* M45: Bring the fix back restores the safety copy the Undo made first (shadow snapshots only, never git). An Undo
              from the timeline or of one task shows no extra line: the result row above already says Undone. */}
          {bringBackCan(m, project) && (
            <div className="row"><button id={`${undoId}-bring`} className="btn" type="button" onClick={() => dispatch({ type: "ui.bringBackAsked" })}><Icon name="undo" size={14} />{S.bringBack}</button></div>
          )}
          {m.undo?.stage === "confirm" && m.undo.back && project && (
            <ConfirmStep className="line" label={S.bringBackSure} back={`${undoId}-bring`} onCancel={() => dispatch({ type: "ui.undoCancelled" })}><div>{S.bringBackSure}</div>
              <div className="row">
                <button className="btn" type="button" onClick={() => { dispatch({ type: "ui.undoSent" }); void send(undo(project, m.undo!.checkpoint)); }}>{S.bringBackYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.undoCancelled" })}>{S.bringBackNo}</button>
              </div></ConfirmStep>
          )}
          {m.explain && m.explain.checkpoint === m.receipt.checkpoint && <ExplainBox e={m.explain} key={m.explain.checkpoint} />}
          {groups.on("followUp") && (canFollowUp(m, project) || m.followUp === "sending") && (
            <FollowUpBox project={project} sending={m.followUp === "sending"} retry={canRetry({ ...m, followUp: "idle" }, project) && !chips.includes("fix") && !chipFixAsk} onSent={followSent} onRefused={followRefused}
              text={followText} setText={(t) => { setFollowText(t); if (!t) followFromVoice.current = false; }}
              listening={m.voice?.stage === "listening" && overReceipt.current && setting("talk.followUpByPointing") === true}
              answer={!!m.receipt.asks && !undone} />
          )}
          {/* M66 (the shortlist, item 1): two or three fixed one tap chips, always last (resultChips.ts). Undo and Fix it only
              ask: their own question comes first, then the change runs with its safety copy and its receipt. */}
          {chips.length > 0 && (
            <div className="row result-chips" role="group" aria-label={S.resultChips.label}>
              {chips.map((c) => <Button key={c} id={c === "fix" ? "result-chip-fix" : undefined} size="sm" onClick={() => chipDo(c)}>{S.resultChips[c]}</Button>)}
            </div>
          )}
          {chipFixAsk && project && (
            <ConfirmStep className="line" label={S.resultChips.fixSure} back="result-chip-fix" onCancel={() => setChipFixAsk(false)}><div>{S.resultChips.fixSure}</div>
              <div className="row">
                <button className="btn" type="button" onClick={() => { setChipFixAsk(false); followSent(false); void send(retryTask(project)).catch(followRefused); }}>{S.resultChips.fixYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => setChipFixAsk(false)}>{S.resultChips.fixNo}</button>
              </div></ConfirmStep>
          )}
        </section>
      )}
      {/* After a result, what was checked comes under it, as its evidence (the audit, item 13): the verdict and Undo first. */}
      {m.receipt && proofPanel}

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
          {/* Found: the hero above already says what broke (the audit, item 53), so the title is for VoiceOver only then. */}
          <h2 className={m.point.stage === "found" && !m.practice ? "sr" : undefined}>{S.pointTitle}</h2>
          {m.point.stage === "checking" && <div className="line">{S.pointChecking}</div>}
          {m.point.stage === "clear" && <div className="line">{S.pointClear}</div>}
          {m.point.stage === "gaps" && <div className="line">{S.pointGaps}</div>}
          {m.point.stage === "nothing" && <div className="line">{S.pointNothing}</div>}
          {m.point.note && <div className="line muted" role="note">{m.point.note}</div>}
          {/* The hero says which check found it (the audit, item 53); with a practice open the card says it itself. */}
          {m.point.stage === "found" && m.practice && <div className="line"><b>{m.point.label}</b></div>}
          {/* The presses right after its first line (the audit, item 13), then what broke and where, as the evidence. */}
          {m.point.stage !== "checking" && (
            <div className="row">
              {m.point.stage === "found" && pointsOnScreen(m.point.problem) && <button className="btn" type="button" onClick={() => pointProblem(project, m.point?.problem)}>{S.pointWhere}</button>}
              {m.point.stage === "found" && buttonShown("pointWhy") && <button className="btn" type="button" disabled={m.diagram?.stage === "asking"} onClick={() => drawIt("Why did this break?", m.point?.problem && m.point.problem.kind === "line" ? { kind: "line", file: m.point.problem.file, line: m.point.problem.line, message: m.point.problem.message } : { message: m.point?.problem?.message ?? m.point?.message })}>{S.drawWhy}</button>}
              {/* While a fix already runs (a practice's, or one asked for from Learn), Fix it is not offered again (M51 polish). */}
              {m.point.stage === "found" && !working && <button className="btn primary" type="button" onClick={fixKnown}>{S.pointFix}</button>}
              {m.point.stage === "found" && !working && canBisect(m) && project && buttonShown("whichTask") && <button className="btn" type="button" onClick={findBreaker}>{S.bisectButton}</button>}
              {/* The project's checks found nothing wrong: the problem may be in another app, so the screen can be looked at (point.everyday). */}
              {["clear", "gaps", "nothing"].includes(m.point.stage) && everydayOn && <button className="btn" type="button" onClick={() => { pressed(); putAside(m.point?.agent); dispatch({ type: "ui.pointClosed" }); lookEveryday(); }}>{S.everydayLookInstead}</button>}
              <button className="btn" type="button" onClick={() => { putAside(m.point?.agent); void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); }}>{S.pointClose}</button>
            </div>
          )}
          {m.point.stage === "found" && <>
            <div className="line">{m.point.problem && m.point.problem.kind === "line" && !lineOf(m.point.problem) ? `${m.point.problem.file}, line ${m.point.problem.line}: ` : ""}{m.point.problem?.message || plainPath(m.point.message ?? "", project)}</div>
            {/* M51: where it is and the line itself, as a proof row in the system mono. */}
            <FailingLine problem={m.point.problem} />
          </>}
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

      {show("recap") && m.recap && recapWorthACard(m.recap) && (
        <section className="panel" role="status" aria-label={S.recapTitle}>
          <h2>{S.recapTitle}</h2>
          {recapShownLines(m.recap.lines).map((l, i) => <div className="answer" key={i}>{l}</div>)}
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
      {show("memory") && project && !m.memory && !m.memoryNote && m.runnerUp && <div className="line muted" role="status">{S.homeMemoryLoading}</div>}
      {show("memory") && project && !m.memory && m.memoryNote && (
        <div className="line" role="alert">{m.memoryNote} <button className="btn" type="button" onClick={() => { dispatch({ type: "ui.memoryRetry" }); void send(listMemory(project)); }}>{S.tryAgain}</button></div>
      )}
      {show("memory") && m.memory && (
        <section className="panel memory" aria-label={S.memoryTitle}>
          <h2>{S.memoryTitle}</h2>
          <div className="line muted">{S.memoryNever}</div>
          {m.memory.paused && <div className="line"><b>{S.memoryPaused}</b></div>}
          {m.memory.problems.map((p, i) => <div className="line blocked" key={i}>{p}</div>)}
          {m.memoryNote && <div className="line blocked" role="alert">{m.memoryNote}</div>}
          <MemoryList title={S.memoryProject} scope="project" lines={m.memory.projectLines} project={project} />
          <MemoryList title={S.memoryProfile} scope="profile" lines={m.memory.profileLines} project={project} />
          <SharedFilesRow project={project} refresh={m.notice} send={send} />
          {/* What the page can change, as rows in one group like Settings (the audit, item 50: a cloud of six pills, and a
              Close that sat on a place). Each section keeps its own one Erase all. */}
          <Group title={S.memorySettingsTitle}>
            <Row label={S.memoryLearning} description={S.memoryLearningHelp} control={<Switch checked={!m.memory.paused} label={S.memoryLearning} onChange={(on) => void changeSetting("memory.paused", !on)} />} />
            <Row label={S.reactionsSetting} control={<Switch checked={fun} label={S.reactionsSetting} onChange={(on) => void changeSetting("fun.reactions", on)} />} />
            <Row label={S.memoryExport} description={S.memoryExportHelp} control={<Button size="sm" label={S.memoryExport} onClick={() => void send(exportMemory(project))}>{S.memoryShow}</Button>} />
            <Row label={S.agentsRemove} description={S.agentsRemoveHelp} control={<Button size="sm" label={S.agentsRemove} onClick={() => void send(answerAgents(project, "remove"))}>{S.memoryRemove}</Button>} />
          </Group>
          {m.exported && <textarea className="export" readOnly value={m.exported} aria-label={S.memoryExport} rows={8} />}
        </section>
      )}
      {show("history") && <HistoryPanel items={project ? m.history : []} reviews={project ? m.reviewHistory ?? [] : []} q={historyQ} setQ={setHistoryQ} undoState={m.undo} project={project} keepsMine={keepsMine} dispatch={dispatch} focus={historyFocus} now={clock} onAsk={() => { pickTab("now"); setTimeout(() => box.current?.focus(), 0); }} />}
      {/* F28: watch routines start off, so the fold stays away until they are on or this folder already has watches. */}
      {show("watch") && project && groups.on("watch") && (routinesOn || watchesOf(m.watches, project).length > 0) && (
        <details className="more" open={watchesOf(m.watches, project).some((w) => w.state === "failing")}>
          <summary>{S.watch.title}</summary>
          <WatchPanel watches={watchesOf(m.watches, project)} asked={m.watchAsked} fixOn={groups.on("connections") && groups.on("drive")} h={watchHandlers} />
        </details>
      )}
      {/* The folder's notes on Now (its name and its menu are in the top bar), and the link field once Open from a link is
          chosen there. */}
      {home.tab === "now" && show("ask") && mode !== "rest" && mode !== "working" && !side && <RecentList items={project ? m.history : []} now={clock} onOpen={openRecent} />}
      {show("folder") && <div className="foot">
      {awayFolder(m) && <div className="line muted" role="status">{S.awayWorking(awayFolder(m)!)}</div>}
      {copying && <div className="line muted" role="status">{S.copying}</div>}
      {linkOpen && (
        <div className="row">
          <input ref={focusOnShow} aria-label={S.openLinkLabel} placeholder="https://github.com/name/project" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) openLink(); if (e.key === "Escape") { e.stopPropagation(); setLinkOpen(false); focusBack(linkId); } }} />
          <Button kind="secondary" onClick={openLink}>{S.openLinkGo}</Button>
          <Button kind="quiet" onClick={() => { setLinkOpen(false); focusBack(linkId); }}>{S.planCancel}</Button>
        </div>
      )}
      {m.cloneNote && <div className="error" role="alert">{m.cloneNote} <button className="btn" type="button" onClick={() => dispatch({ type: "ui.cloneNoteClosed" })}>{S.onlineClose}</button></div>}
      {folderNote && <div className="error" role="alert">{folderNote}</div>}
      </div>}
      {/* M65 step 4: in the tall Home the ask box sits near the top, so the footer line comes last, under the work. */}
      {foot && home.tab === "now" && !side && <FootLine className="home-foot-end" start={foot.start} end={foot.end} />}
      </div>
      </PartBoundary>)}
      </div>
      </div>
    </main>
    </HomeStage>
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

/** Anthropic's Claude on this Mac (M22): its state from the shell, kept in step with the download. Read once by Home, so
 *  the hero can say Claude is missing (the audit, item 12) and the notice under the ask box can show the progress. */
type ClaudeSt = { state: string; received?: number; total?: number | null; message?: string };
function useClaudeStatus(): [ClaudeSt | null, (s: ClaudeSt) => void] {
  const [st, setSt] = useState<ClaudeSt | null>(null);
  useEffect(() => {
    void invoke("claude_status").then((v) => setSt(v as ClaudeSt)).catch(() => {});
    const off = listen("claude-install", (e) => setSt(e.payload as ClaudeSt));
    return () => { off.then((f) => f()); };
  }, []);
  return [st, setSt];
}
const getClaude = (setSt: (s: ClaudeSt) => void) => { setSt({ state: "installing", received: 0 }); void invoke("claude_install_now").catch(() => {}); };

/** Anthropic's Claude missing or damaged after the first run (M22): one plain line and Get Claude (a secondary button: the
 *  hero's main button is the one main way out), with the download's progress. Shows nothing while Claude is ready. */
function ClaudeNotice({ st, setSt }: { st: ClaudeSt | null; setSt: (s: ClaudeSt) => void }) {
  if (!st || st.state === "ready") return null;
  const mb = Math.round((st.received ?? 0) / 1e6), pct = st.total ? Math.min(100, Math.round(((st.received ?? 0) / st.total) * 100)) : null;
  return (
    <section className="panel notice claude-notice" role="status">
      <div className="line">{st.state === "installing" ? S.fr.claudeGetting(mb, pct) : st.state === "failed" ? st.message : S.fr.claudeMissing}</div>
      {st.state !== "installing" && <div className="row"><button className="btn" type="button" onClick={() => getClaude(setSt)}>{st.state === "failed" ? S.fr.claudeAgain : S.fr.claudeInstall}</button></div>}
    </section>
  );
}
