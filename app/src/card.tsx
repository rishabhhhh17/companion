import { StrictMode, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EMPTY_LINE, liveLine, type LiveLine } from "./a11y.ts";
import { ConfirmStep } from "./confirm.tsx";
import { focusBack, focusIfLost, keepFocus, takeIfLost } from "./focus.ts";
import { allScreensOn } from "./settings.ts";
import { layoutDiagram } from "./layout.ts";
import { answered, atLimit, nextQuestion } from "./anywhere.ts";
import { answerPlayer, lineMs, LEAD_MS, planSteps, sequenceOver, stepsLine, stillWanted, targetsOf, type Step } from "./sequence.ts";
import { askedByVoice, followVoiceShowMe, lineByVoice, lineFor, newReply, repliesIn, repliesOn, speakWhen, speechOn, spokenNote, voiceShowMe, type AskKind, type VoiceQuestion } from "./speech.ts";
import { noteSpeed, spokenSpeed, voiceSettingsFrom } from "./voicesettings.ts";
import { shouldTakeFocus } from "./cardlogic.ts";
import { AGENT, SETTINGS_LESSON_ID, checkBrowser, getBrowser, NO_PROJECT, metricsNote, walkActed, walkAnswer, walkList, walkSkip, walkStart, walkStop, startPractice as practiceFixCommand, askDiagram, inspectProject, installPackages, findProblem, shipLive, shipPreview, shipRollback, answerAgents, askRecap, editLine, eraseMemory, exportMemory, forgetLine, listMemory, checkShip, answerApproval, approvePlan, askResearch, chooseLoop, diagnose, pauseDrive, resumeDrive, listTasks, planDrive, startTask, stopAgent, undo, followUp, retryTask, pointChange, tryNextOne, checkMyChange, findBreakingTask, undoOneTask, fixError, warmEngine } from "./commands.ts";
import { PRACTICES, browserView, confirmable, shipWords, phWords, blockedNote, characterWords, savedWords, pausedWords, driveWords, formatUsd, historyWords, isFixing, triesNote, notDoneReason, plainPath, stateLabel, pointsOnScreen, activityNow, canFollowUp, canRetry, stuckWords, canOfferTurn, receiptProofWords, teachActions, teachLines, bisectLines, canBisect, ehLines } from "./model.ts";
import { invoke, listen } from "./tauri.ts";
import type { Explain, HistoryItem, MemoryLine, PracticeKind, Problem } from "./model.ts";
import { Onboarding } from "./onboarding.tsx";
import { autoCheckDue, found, isBusy } from "./updates.ts";
import { useModel } from "./useModel.ts";
import { acceptHint, armedFor, canPick, choicesFrom, chordLabel, keyHint, keyProblem, keysFrom, keysIn, setKeysNow, type Choices, type Job, type Keys } from "./keys.ts";
import { useKeys } from "./useKeys.ts";
import { TABS, closesOnClickAway, homeReduce, homeStart, need, shownOn, tabId, tabKey, tabName, tabPanelId, typing, type Panel, type Tab } from "./home.ts";
import { S } from "./strings.ts";
import { applyTextSize, textSize, textSizeFrom } from "./textsize.ts";
import { SettingsPage } from "./settingsPage.tsx";
import { changeSetting, migrateFromPageStorage, setting, settingsReady, startSettings, useSetting } from "./settingsStore.ts";
import { offRecordAtStart, recapDue, toastMs } from "./memorySettings.ts";
import { webLink } from "./links.ts";
import { DRAFT_KEY, askKey, draftToKeep, putBack, sentOutcome, type Sent } from "./askbox.ts";
import { aboutCopy, copyable, ehCopy, explainCopy, receiptCopy, recapCopy, rescueCopy, researchCopy } from "./copytext.ts";
import { HISTORY_STATUSES, NO_FILTER, filterHistory, historyFiltering, type HistoryQuery, type HistoryStatus } from "./history.ts";
import { SEEN_VERSION_KEY, whatsNew, type Release } from "./whatsnew.ts";
import { addFiles, addedLine, blocksDrop, carriesFiles, checkAttachments, chipLabel, forRequest, pastedFiles, removeFile, type Attached, type FileLike } from "./attachfiles.ts";
import "./style.css";

const send = (cmd: unknown) => invoke("send_command", { cmd });
// Beta numbers: a fixed name, counted only if the person turned numbers on.
const SESSION_GAP_MS = 30 * 60 * 1000;
const count = (name: string) => { void send(metricsNote(name)); };
// When the person last used the card. Kept only on this Mac, in this page's own storage. Where was I is asked for after the
// break the person chose (recap.after, memorySettings.ts).
const SEEN_KEY = "companion.lastSeen";
const lastSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
const touch = () => { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* storage may be unavailable */ } };
// While a person is composing text (Japanese, Chinese, Korean...) Enter and Esc belong to the input method, not to us.
const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

// Fixes it with you: under the receipt, one line to say what is still wrong (Enter sends), and Try again after a task that
// was not done. Each one runs as a new checked task. It never takes keyboard focus by itself.
function FollowUpBox({ project, retry, sending, onSent }: { project: string; retry: boolean; sending: boolean; onSent: () => void }) {
  const [text, setText] = useState("");
  const sendIt = () => {
    const c = followUp(project, text);
    if (!c || sending) return;
    onSent(); void send(c); setText("");
  };
  return (
    <div className="followup">
      {retry && (
        <div className="row">
          <button className="btn primary" type="button" disabled={sending} onClick={() => { if (sending) return; onSent(); void send(retryTask(project)); }}>{S.tryAgain}</button>
          <span className="muted">{S.tryAgainHelp}</span>
        </div>
      )}
      <div className="row">
        <input type="text" autoComplete="off" spellCheck={false} value={text} disabled={sending} placeholder={S.followUpPlaceholder} aria-label={S.followUpLabel}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !composing(e)) { e.preventDefault(); sendIt(); } }} />
        <button className="btn" type="button" disabled={sending || !text.trim()} onClick={sendIt}>{sending ? S.followUpSending : S.followUpSend}</button>
      </div>
      <div className="line muted">{S.followUpHelp}</div>
    </div>
  );
}

function ExplainBox({ e }: { e: Explain }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <details className="explain">
      <summary>{S.explainTitle} <span className="muted">· {S.explainCost}</span></summary>
      <ul>{e.bullets.map((b, i) => <li className="line" key={i}>{b}</li>)}</ul>
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
function OpenButton({ url, onNote }: { url: string; onNote: (note: string) => void }) {
  const l = webLink(url);
  if (!l) return null;
  return <button className="btn" type="button" onClick={() => void invoke("open_link", { url: l.url }).then(() => onNote("")).catch((e) => onNote(String(e)))}>{S.openSite(l.host)}</button>;
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
            <button className="btn primary" type="button" onClick={() => void invoke("save_share_card", { image: f.card!.image, title: f.card!.title }).then((n) => setShared(`${S.savedTo} ${String(n)}`)).catch((e) => setShared(String(e)))}>{S.savePicture}</button>
            <button className="btn" type="button" onClick={() => void invoke("copy_link", { url: f.card!.url }).then(() => setShared(S.linkCopied)).catch((e) => setShared(String(e)))}>{S.copyLink}</button>
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
function HistoryPanel({ items, q, setQ }: { items: HistoryItem[]; q: HistoryQuery; setQ: (q: HistoryQuery) => void }) {
  const filtering = historyFiltering(q);
  const shown = filtering ? filterHistory(items, q) : items.slice(0, 20);
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
      {shown.map((h) => (
        <div className="line" key={h.id}>{h.label} <span className="muted">· {historyWords(h)} · {formatUsd(h.usd)}</span></div>
      ))}
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
  const [m, dispatch] = useModel();
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
    homeDispatch({ type: "need", need: needNow, typing: typing(a && a !== document.body ? { tag: a.tagName, editable: a.isContentEditable } : null, document.hasFocus()) });
  }, [needNow?.key ?? ""]);
  // A tab shown by itself took away what had the keyboard: it goes to that tab, so Esc and the arrows keep working.
  useEffect(() => { takeIfLost(() => document.getElementById(tabId(home.tab))); }, [home.tab]);
  const root = useRef<HTMLElement>(null);
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
  useEffect(() => { const el = root.current; if (!el) return; return keepFocus(el, () => document.getElementById(tabId(tabNow.current))); }, []);
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
  const addDropped = (files: ArrayLike<FileLike> | null | undefined) => { const list = Array.from(files ?? []); if (!list.length) return; homeDispatch({ type: "pick", tab: "now" }); const before = attachedNow.current; void addFiles(before, list).then((r) => { attachedNow.current = r.have; setAttached(r.have); setAttachNotes(r.notes); setAttachSaid(addedLine(r.have.slice(before.length))); }); };
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
    // Off the record comes back first, so the words put back are never kept on this Mac.
    if (r.text !== undefined) { if (r.off) { offNow.current = true; setOff(true); } setBox(r.text); }
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
  useEffect(() => { clearAttached(); sent.current = null; }, [project]);
  // A file dropped on Home outside the drop handling must never be opened in place of Home's page, and neither may a link
  // dropped anywhere but the ask box (blocksDrop); words dragged onto the ask box land there.
  useEffect(() => {
    const stopOpen = (e: DragEvent) => { if (blocksDrop(e.dataTransfer?.types, e.target)) e.preventDefault(); };
    window.addEventListener("dragover", stopOpen);
    window.addEventListener("drop", stopOpen);
    return () => { window.removeEventListener("dragover", stopOpen); window.removeEventListener("drop", stopOpen); };
  }, []);
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
  // goes back to it after each send. What off the record keeps (nothing) never changes.
  const offDefault = useSetting("task.offRecordByDefault") === true;
  useEffect(() => { setOff(offDefault); }, [offDefault]);
  // Turning off the record on drops the kept draft at once; turning it off again keeps what is in the box. Not at start,
  // so the draft from last time is not dropped before it is put back.
  const offWas = useRef(false);
  useEffect(() => { offNow.current = off; if (off === offWas.current) return; offWas.current = off; keepDraft(box.current?.value ?? ""); }, [off]);
  // The first run: shown until finished, remembered only on this Mac.
  const [onboarded, setOnboarded] = useState(() => { try { return localStorage.getItem("companion.onboarded") === "1"; } catch { return true; } });
  const pendingPrompt = useRef<string | null>(null);
  useEffect(() => {
    if (!onboarded || !box.current) return;
    if (pendingPrompt.current) { setBox(pendingPrompt.current); box.current.focus(); pendingPrompt.current = null; return; }
    let kept = "";
    try { kept = localStorage.getItem(DRAFT_KEY) ?? ""; } catch { /* storage may be unavailable */ }
    if (kept && !box.current.value) { box.current.value = kept; fitBox(); }
  }, [onboarded]);
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
  // A question that needs the person moves keyboard focus to its first button, but only when this card already has the keyboard.
  const urgent = useRef<HTMLDivElement>(null);
  const urgentKey = m.approvals[0]?.id ?? (m.agentsAsk ? "agents" : m.stuck ? "stuck" : m.paused ? "paused" : m.plan ? "plan" : "");
  useEffect(() => {
    if (!urgentKey) return;
    const a = document.activeElement as HTMLElement | null;
    if (!shouldTakeFocus(a ? { tag: a.tagName, editable: a.isContentEditable } : null, document.hasFocus())) return;
    urgent.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [urgentKey, home.needKey]);

  const [recent, setRecent] = useState<string[]>([]);
  const [folderNote, setFolderNote] = useState("");
  const loadRecent = () => void invoke("list_projects").then((l) => setRecent(Array.isArray(l) ? (l as string[]) : []));
  useEffect(() => { void invoke("get_project").then((p) => setProject(String(p ?? ""))); loadRecent(); }, []);
  useEffect(() => {
    const off = listen("project-changed", (e) => { setProject(String(e.payload ?? "")); dispatch({ type: "ui.projectChanged", project: String(e.payload ?? "") }); setFolderNote(""); loadRecent(); });
    return () => { off.then((f) => f()); };
  }, []);
  // The practice project: copied into a new folder, chosen as the project, and followed step by step.
  const practiceBusy = useRef(false);
  const beginPractice = (which?: unknown) => {
    if (practiceBusy.current) return;   // one practice folder per press
    practiceBusy.current = true;
    const kind: PracticeKind = which === "setting" ? "setting" : "signup";   // the first run's unless the setting one was asked for
    void invoke("create_practice", { which: PRACTICES[kind].folder }).then((p) => dispatch({ type: "ui.practiceStarted", project: String(p), kind })).catch((e) => setFolderNote(String(e))).finally(() => { practiceBusy.current = false; });
  };
  // The setting practice after its lesson: run the project's own checks again, so the fix is proven, not assumed.
  useEffect(() => { if (m.practice?.stage === "proving" && m.practice.project === project) { pressed(); dispatch({ type: "ui.findProblem" }); void send(findProblem(project)); } }, [m.practice?.stage]);
  const useFolder = (path: string) => void invoke("use_project", { path }).catch((e) => setFolderNote(String(e)));
  const pickFolder = () => void invoke("pick_project").catch((e) => { if (String(e)) setFolderNote(String(e)); });
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
  const spoken = lineFor({ walk: m.walk, showme: m.showme }, keys);
  useEffect(() => {
    if (!spoken || spoken.key === saidKey.current) return;
    const when = speakWhen({ speech: speechOn(), replies: repliesOn(), byVoice: answersVoice(spoken.key) });
    if (!when.say) return;
    saidKey.current = spoken.key;
    // A step of a multi step answer is said when its pointer lands; if something else comes first, it is not said late.
    if (!spoken.delayMs) { sayIt(spoken.text, when.whole); return; }
    player.current.sayLater(() => sayIt(spoken.text, when.whole), spoken.delayMs);
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
    sayIt(r.text, true);
  }, [replyKeys]);
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
        if (f.available) { found.update = { stage: "found", version: f.version ?? "", notes: f.notes ?? "" }; dispatch({ type: "app.notice", message: S.updatesReady }); }
      });
    }).catch(() => {});
  }, []);
  // Draw it for me: ask why it broke; when the diagram comes back it is laid out here and drawn on the screen.
  const asked = useRef(false);
  const askedId = useRef("");
  useEffect(() => { if (!m.diagram) asked.current = false; }, [m.diagram]);
  const drawIt = (question: string, problem?: { kind?: string; file?: string; line?: number; message?: string }) => {
    if (!projectRef.current || asked.current) return;
    const cmd = askDiagram(projectRef.current, question, problem);
    asked.current = true; askedId.current = (cmd as { id: string }).id; dispatch({ type: "ui.diagramAsked", ask: (cmd as { id: string }).id, project: projectRef.current });
    void send(cmd);
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
  useEffect(() => {
    const off = listen("opened", (e) => {
      const keyboard = !!(e.payload as { keyboard?: boolean } | null)?.keyboard;
      homeDispatch({ type: "opened", keyboard });
      if (keyboard) setTimeout(() => box.current?.focus(), 30);
      if (changesNow.current) rememberVersion(changesNow.current.remember);   // what changed has been on screen once
      warmSoon();
      // Coming back after a break: ask what happened while away. Only Companion's own history is used. The folder is read
      // as it is now: this listener is set up once, before the folder is known.
      const last = lastSeen();
      const here = projectRef.current;
      if (last && here && recapDue(last, Date.now())) void send(askRecap(here, new Date(last).toISOString()));
      if (!last || Date.now() - last >= SESSION_GAP_MS) count("session");   // a new visit after a break, not every time the card opens
      touch();
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Tell the app how tall the content is, so the panel fits it.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => void invoke("resize_card", { height: el.scrollHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Show me how: the engine chose one or more points in the picture, in order. Each is played in turn (sequence.ts): the
  // Mac side snaps it to a real button and draws the pointer, its line follows, then a short pause and the next one. Only
  // the last one waits for the click. A guess below the confidence line is said in words, never drawn.
  const [walk, setWalk] = useState<{ goal: string; steps: string[] } | null>(null);
  const inLesson = useRef(false); inLesson.current = !!m.walk;
  const showmeNow = useRef(m.showme); showmeNow.current = m.showme;
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; req?: string };
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
      const aim = (s: Step) => invoke("showme_aim", {
        req, x: s.target.x, y: s.target.y, ocrId: s.target.ocrId ?? null, targetText: s.target.targetText, caption: s.target.caption,
        mark: s.target.mark ?? null, screen: s.target.screen ?? 1, step: s.index + 1, of: s.total, hold: s.hold,
        flyMs: s.total > 1 ? LEAD_MS : null, fadeMs: lineMs(s.text, speaking, speed),
      }).then((r) => {
        const out = r as { ok?: boolean; why?: string } | undefined;
        // The window the picture was taken of changed: nothing more is drawn over it (rule 22). Say so in words.
        if (out?.ok === false && out.why === "window_changed") dispatch({ type: "app.showme", stage: "window_changed", message: S.sequenceWindowChanged });
        return out?.ok !== false;
      }, () => false);
      const words = (s: Step) => {
        const say = () => dispatch({ type: "app.showme", stage: "not_sure", message: s.text, req, step: s.index + 1, of: s.total });
        // The last step said in words ends it: what was seen is forgotten. Before that, only the pointer is taken away.
        if (s.index === s.total - 1) void invoke("showme_clear").then(say); else void invoke("showme_hide").then(say);
      };
      player.current.start(steps, { aim, words }, speaking, speed);
      if (steps.some((s) => s.draw)) setWalk((w) => (w ? { ...w, steps: [...w.steps, stepsLine(steps)] } : w));
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
    const offKey = listen("find-problem", () => {
      pressed();
      if (!projectRef.current) { dispatch({ type: "app.showme", stage: "error", message: S.pointNoProject }); return; }
      dispatch({ type: "ui.findProblem" }); homeDispatch({ type: "pick", tab: "now" }); count("hero_press"); count("builder_use");
      void send(findProblem(projectRef.current));
    });
    const offFound = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; verdict?: string; problem?: Problem; project?: string };
      if (ev.type === "problem.found" && ev.verdict === "failed" && pointsOnScreen(ev.problem) && ev.project === projectRef.current) pointProblem(ev.project, ev.problem);
    });
    return () => { offKey.then((f) => f()); offFound.then((f) => f()); };
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
      const ev = e.payload as { type?: string; stage?: string; text?: string };
      if (ev.type === "app.voice" && ev.stage === "heard" && ev.text) {
        homeDispatch({ type: "pick", tab: "now" });   // the box is on Now
        setBox(ev.text);
        fromVoice.current = true;
        if (askModeRef.current === "showme") { sentFromBox("showme"); showMeRef.current(ev.text, ev.text, []); setAskMode("task"); clearBox(); }
        // With files added, the words wait in the box for Start: they never go with files by themselves.
        else if (autoSend && attachedNow.current.length === 0 && ev.text.trim().split(/\s+/).length >= 3) setTimeout(() => submitNow.current(), 0);
        else setTimeout(() => box.current?.focus(), 30);
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
    const off = listen("showme-mode", () => { setAskMode("showme"); setTimeout(() => box.current?.focus(), 30); });
    return () => { off.then((f) => f()); };
  }, []);
  const showMe = (question: string, goal: string, steps: string[]) => { if (steps.length === 0) count("anywhere_use"); if (m.showme?.stage === "pointing_roughly") count("soft_ring_corrected"); player.current.hush(); setWalk({ goal, steps }); void invoke("showme_start", { question, allScreens: allScreensOn() }); };
  // Anywhere mode: after each click, "did that work?" before the next step. A step that did not work is not suggested again.
  const [asking, setAsking] = useState(false);
  const nextStep = (worked = true) => {
    if (!walk) return;
    setAsking(false);
    const w = answered(walk, worked);
    if (atLimit(w)) { void invoke("showme_clear"); setWalk(null); dispatch({ type: "app.showme", stage: "error", message: S.anywhereLimit }); return; }
    showMe(nextQuestion(w), w.goal, w.steps);
  };
  // In a walkthrough, once the person clicked the step (or it was clicked for them), the next step follows on its own.
  const stage = m.showme?.stage;
  // The walkthrough ends whenever the pointer goes away (Esc, Stop everything, closing, waiting too long).
  // A multi step answer still playing also stops when the Mac side took a step's ring away because its window changed.
  useEffect(() => { if (sequenceOver(m.showme)) player.current.hush(); if (!m.showme) { setWalk(null); setAsking(false); } }, [m.showme]);
  useEffect(() => {
    // Only a walkthrough's own ring moves it on (a Show me ring carries an "sm_" request; Point at the problem's does not).
    if (!walk || !m.showme?.req?.startsWith("sm_") || (stage !== "your_turn_done" && stage !== "done_for_you")) return;
    const t = setTimeout(() => setAsking(true), 900);
    return () => clearTimeout(t);
  }, [stage]);
  showMeRef.current = showMe;
  // Guided lessons: each step is pointed at once (the light comes on first), and the person's own click moves it on.
  const pickTab = (t: Tab) => homeDispatch({ type: "pick", tab: t });
  // What each tab shows is asked for whenever it is the one showing (picked, or shown by itself), and again for a new folder:
  // the lessons (those that read the project need a chosen folder; the others, installing a tool or leaving a builder, do
  // not), what Companion knows, and the task history.
  useEffect(() => {
    if (home.tab === "learn") void send(walkList(project || NO_PROJECT));
    if (home.tab === "memory" && project) void send(listMemory(project));
    if (home.tab === "did" && project) void send(listTasks(project));
  }, [home.tab, project]);
  const beginLesson = (lesson: string, fresh: boolean) => {
    // With no folder chosen the lesson is asked to start without one; if it needs a project it says so itself.
    pressed();
    const c = walkStart(projectRef.current || NO_PROJECT, lesson, fresh);
    noAim.current = false; aimed.current = ""; acted.current = ""; clearTimeout(actTimer.current);
    const walk = (c as { id: string }).id;
    dispatch({ type: "ui.walkRequested", walk }); homeDispatch({ type: "pick", tab: "learn" }); void send(c);
    return walk;
  };
  // The setting practice opens the lesson made from its project, and knows that lesson by its walk id.
  const practiceLesson = () => { const walk = beginLesson(SETTINGS_LESSON_ID, true); dispatch({ type: "ui.practiceLesson", walk }); };
  const aimed = useRef(""), staleReq = useRef<string | undefined>(undefined), acted = useRef(""), actTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), noAim = useRef(false);
  const wk = m.walk;
  const wkKey = wk ? `${wk.id}:${wk.index}:${wk.variant}` : "";
  useEffect(() => {
    if (!wk || wk.stage !== "step") { if (aimed.current) { aimed.current = ""; void invoke("showme_clear"); } return; }
    if (aimed.current === wkKey) return;
    aimed.current = wkKey; staleReq.current = m.showme?.req;
    if (noAim.current) return;   // the screen permission was not given: words only, and it is not asked for again at every step
    void invoke("showme_start", { question: `Where do I click for this: ${wk.find}`, allScreens: allScreensOn() });
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
    actTimer.current = setTimeout(() => void send(walkActed(wk.id, m.showme?.stage === "done_for_you" ? "done_for_you" : "clicked", wk.index)), 700);
  }, [m.showme?.stage, m.showme?.req, wkKey]);
  // A click in another app while Home is open (the shell sees only that a press started outside Companion's windows).
  const nowModel = useRef(m); nowModel.current = m;
  const onboardingNow = useRef(!onboarded); onboardingNow.current = !onboarded;
  useEffect(() => {
    const off = listen("home-click-away", () => { if (closesOnClickAway(nowModel.current, onboardingNow.current)) { box.current?.blur(); player.current.hush(); void invoke("close_card"); } });
    return () => { off.then((f) => f()); };
  }, []);
  const working = ["thinking", "working", "checking", "needsYou"].includes(m.character);
  const submit = () => {
    const prompt = box.current?.value.trim() ?? "";
    if (!prompt || !project) return;
    // The engine checks what goes with the request again and refuses all of it if anything is off. That check runs here
    // first, so a request it would refuse is never sent, and nothing is cleared.
    const added = forRequest(attachedNow.current);
    if ("error" in checkAttachments(added)) { setAttachNotes([S.attachCannotSend]); return; }
    dispatch({ type: "ui.undoClosed" });
    sentFromBox("task");
    sent.current = { prompt, attached: attachedNow.current, off };
    void send(startTask(project, prompt, off, added)).catch(() => putBackSent()); setOff(offRecordAtStart());
    clearBox(); clearAttached();
  };
  // The words from hold to talk send through this, so they always go with the current folder and settings.
  const submitNow = useRef(submit); submitNow.current = submit;

  // Which task broke it: earlier saved versions are checked in a private copy; the project itself is never touched.
  const findBreaker = () => { if (!project || !canBisect(m)) return; dispatch({ type: "ui.bisectAsked" }); void send(findBreakingTask(project)); };
  const rescue = () => {
    if (!project) return;
    pressed();
    dispatch({ type: "ui.undoClosed" });
    dispatch({ type: "ui.planRequested" });
    void send(diagnose(project));
  };
  // When the improved text is ready, tell the app so Use it can paste it (nothing is stored on disk). It answers which
  // use keys it took for this result, if any, so the line under it names them only when they work.
  const [phArmed, setPhArmed] = useState(true);
  useEffect(() => {
    if (m.ph?.stage === "ready" && m.ph.text) void invoke("ph_ready", { text: m.ph.text, handback: m.ph.handback ?? "paste" }).then((v) => setPhArmed(armedFor(v))).catch(() => {});
  }, [m.ph?.stage, m.ph?.text]);
  const shipIt = (o: { runChecks?: boolean; confirm?: string[] } = {}) => { if (!project) return; dispatch({ type: "ui.planRequested" }); void send(checkShip(project, { runChecks: true, ...o })); };
  const research = () => {
    const c = askResearch(project, box.current?.value ?? "");
    if (!c || !project) return;
    sentFromBox("research");
    dispatch({ type: "ui.researchRequested" });
    void send(c);
    clearBox();
  };
  const plan = () => {
    const goal = box.current?.value.trim() ?? "";
    if (!goal || !project) return;
    sentFromBox("plan");
    dispatch({ type: "ui.undoClosed" });
    dispatch({ type: "ui.planRequested" });
    void send(planDrive(project, goal, off)); setOff(offRecordAtStart());
    clearBox();
  };

  return (
    <main className={`card${dragging ? " dropping" : ""}`} ref={root}
      onPointerDown={(e) => { touch(); void invoke("ui_click", { label: "card:" + (e.target as HTMLElement).tagName }); }}
      onDragOver={(e) => { if (!onboarded || !carriesFiles(e.dataTransfer?.types)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragging(true); }}
      onDragLeave={(e) => { if (!e.relatedTarget || !root.current?.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { setDragging(false); if (!carriesFiles(e.dataTransfer?.types)) return; e.preventDefault(); if (onboarded) addDropped(e.dataTransfer?.files); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !composing(e)) { e.preventDefault(); box.current?.blur(); player.current.hush(); void invoke("close_card"); } }}>
      {/* Read when VoiceOver reaches it, not said by itself: the cost changes on every turn, and what needs the person is
          said once on the live line below. */}
      <div className="row between"><b>{S.characterName}</b><span className="muted">{characterWords(m)}{m.task ? ` · ${formatUsd(m.task.costUsd)}` : ""}</span></div>
      <div className="sr" role="status" aria-live="polite" aria-atomic="true">{news}</div>

      {!onboarded && <Onboarding doctor={m.doctor} connected={m.connected} project={project} send={send} pickFolder={pickFolder} useTask={(p) => { pendingPrompt.current = p; }} startPractice={beginPractice} onDone={finishOnboarding} />}
      {onboarded && (<>
      <div className="tabs" role="tablist" aria-label={S.homeLabel}>
        {TABS.map((t) => {
          const waits = needNow?.tab === t && t !== home.tab;
          return (
            <button key={t} id={tabId(t)} className="tab" type="button" role="tab" aria-selected={t === home.tab} aria-controls={tabPanelId(t)} tabIndex={t === home.tab ? 0 : -1}
              onClick={() => pickTab(t)}
              onKeyDown={(e) => { const n = tabKey(t, e.key); if (!n) return; e.preventDefault(); pickTab(n); document.getElementById(tabId(n))?.focus(); }}>
              {tabName(t)}{waits && <><span className="tabdot" aria-hidden="true" /><span className="sr">, {S.homeTabWaiting}</span></>}
            </button>
          );
        })}
      </div>
      {/* About Companion itself (the engine stopped, a notice, an error from something done on any tab): on every tab. */}
      {show("notes") && <>
      {m.notice && <div className="notice" role="status">{m.notice}</div>}
      {m.error && <div className="error">{m.error}</div>}
      </>}
      <div role="tabpanel" id={tabPanelId(home.tab)} aria-labelledby={tabId(home.tab)}>
      {show("folder") && <>
      <div className="row" role="group" aria-label={S.folderLabel}>
        <span className="muted">{S.folderLabel}: <b title={project}>{project ? project.split("/").filter(Boolean).slice(-2).join("/") : "-"}</b></span>
        <button className="btn" type="button" onClick={pickFolder}>{S.folderChange}</button>
        {recent.length > 1 && (
          <select aria-label={S.folderRecent} value="" onChange={(e) => { if (e.target.value) useFolder(e.target.value); }}>
            <option value="">{S.folderRecent}</option>
            {recent.filter((r) => r !== project).map((r) => <option key={r} value={r}>{r.split("/").filter(Boolean).slice(-2).join("/")}</option>)}
          </select>
        )}
      </div>
      {copying && <div className="line muted" role="status">{S.copying}</div>}
      {!linkOpen ? !copying && <div className="row"><button id={linkId} className="btn" type="button" onClick={() => setLinkOpen(true)}>{S.openLink}</button></div> : (
        <div className="row">
          <input ref={focusIfLost} aria-label={S.openLinkLabel} placeholder="https://github.com/name/project" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) openLink(); if (e.key === "Escape") { e.stopPropagation(); setLinkOpen(false); focusBack(linkId); } }} />
          <button className="btn primary" type="button" onClick={openLink}>{S.openLinkGo}</button>
          <button className="btn" type="button" onClick={() => { setLinkOpen(false); focusBack(linkId); }}>{S.planCancel}</button>
        </div>
      )}
      {m.cloneNote && <div className="error" role="alert">{m.cloneNote} <button className="btn" type="button" onClick={() => dispatch({ type: "ui.cloneNoteClosed" })}>{S.onlineClose}</button></div>}
      {folderNote && <div className="error" role="alert">{folderNote}</div>}
      {!project && <div className="notice">{S.folderNone}</div>}
      </>}
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
      {show("settings") && <SettingsPage working={isBusy(m)} project={project} spending={m.spending} onClose={() => pickTab("now")} onPractice={(k) => { homeDispatch({ type: "pick", tab: "learn" }); beginPractice(k); }} onLesson={(l) => { beginLesson(l, false); }} />}
      {show("practice") && m.practice && m.practice.project === project && (
        <section className="panel" aria-label={S.practiceTitle}>
          <h2>{S.practiceTitle}</h2>
          {m.practice.stage === "start" && <>
            <div className="line">{m.practice.kind === "setting" ? S.practiceSettingStart : S.practiceStart}</div>
            <div className="line muted">{keyHint("problem", S.practiceKeys, keys)}</div>
            <div className="row">
              <button className="btn primary" type="button" disabled={m.point?.stage === "checking"} onClick={() => { pressed(); dispatch({ type: "ui.findProblem" }); void send(findProblem(project)); }}>{S.practiceFind}</button>
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.practiceSkip}</button>
            </div>
          </>}
          {m.practice.stage === "found" && <>
            <div className="line"><b>{S.practiceFound}</b> {m.practice.where?.file ? `${m.practice.where.file}, line ${m.practice.where.line}: ` : ""}{m.practice.where?.message}</div>
            <div className="line muted">{m.practice.kind === "setting" ? S.practiceSettingFoundMore : S.practiceFoundMore}</div>
            <div className="row">
              {m.practice.kind === "setting"
                ? <button className="btn primary" type="button" onClick={practiceLesson}>{S.practiceSettingFix}</button>
                : <button className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.practiceFixing" }); void send(practiceFixCommand(project)); }}>{S.practiceFix}</button>}
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.practiceSkip}</button>
            </div>
          </>}
          {m.practice.stage === "lesson" && <>
            <div className="line">{S.practiceSettingLesson}</div>
            <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.practiceSkip}</button></div>
          </>}
          {m.practice.stage === "proving" && <div className="line">{S.practiceProving}</div>}
          {m.practice.stage === "fixing" && <>
            <div className="line">{S.practiceFixing}</div>
            <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.practiceSkip}</button></div>
          </>}
          {m.practice.stage === "blocked" && <>
            <div className="line">{S.practiceBlocked}</div>
            {m.practice.why && <div className="line muted">{m.practice.why}</div>}
            <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.pointClose}</button></div>
          </>}
          {m.practice.stage === "done" && <>
            <div className="line"><b>{S.practiceDone}</b></div>
            <div className="line muted">{m.practice.kind === "setting" ? S.practiceSettingDoneMore : S.practiceDoneMore}</div>
            <div className="row">
              <button className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.practiceClosed" }); pickFolder(); }}>{S.practiceOwn}</button>
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.pointClose}</button>
            </div>
          </>}
          {m.practice.stage === "failed" && <>
            <div className="line">{m.practice.kind !== "setting" ? S.practiceFailed : m.practice.nameSet ? S.practiceSettingNameSet : S.practiceSettingFailed}</div>
            {m.practice.kind === "setting" && m.practice.where?.message && <div className="line muted">{m.practice.where.file ? `${m.practice.where.file}, line ${m.practice.where.line}: ` : ""}{m.practice.where.message}</div>}
            <div className="row">
              {m.practice.kind === "setting" && m.practice.nameSet && <button className="btn primary" type="button" onClick={() => dispatch({ type: "ui.practiceProving" })}>{S.practiceCheckAgain}</button>}
              {m.practice.kind === "setting"
                ? <button className={`btn${m.practice.nameSet ? "" : " primary"}`} type="button" onClick={practiceLesson}>{S.practiceAgain}</button>
                : <button className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.practiceFixing" }); void send(practiceFixCommand(project)); }}>{S.practiceAgain}</button>}
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.pointClose}</button>
            </div>
          </>}
        </section>
      )}
      {show("lessons") && !m.walk && (
        <section className="panel" role="status" aria-label={S.lessonsTitle}>
          <h2>{S.lessonsTitle}</h2>
          {(m.lessons ?? []).length === 0 && <div className="line">{S.lessonsNone}</div>}
          {(m.lessons ?? []).map((l) => (
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
      {show("walk") && m.walk && (
        <section className={`panel ${m.walk.stage === "help" ? "amber" : ""}`} role="status" aria-label={S.lessonsTitle}>
          <h2>{m.walk.title}</h2>
          {m.walk.stage === "done" && <div className="line">{S.lessonDone}</div>}
          {(m.walk.stage === "step" || m.walk.stage === "asking" || m.walk.stage === "already") && <>
            <div className="line muted">{S.lessonStep(m.walk.index + 1, m.walk.total)}{m.walk.variant === "instead" ? ` · ${S.lessonOther}` : ""}</div>
            <div className="line"><b>{keysIn(m.walk.say, keys)}</b></div>
            {m.walk.link && <div className="row"><OpenButton url={m.walk.link} onNote={setLessonNote} /></div>}
            {m.walk.link && lessonNote && <div className="line" role="status">{lessonNote}</div>}
          </>}
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
              <button className="btn" type="button" onClick={() => { const w = m.walk!; staleReq.current = m.showme?.req; void invoke("showme_start", { question: `Where do I click for this: ${w.find}`, allScreens: allScreensOn() }); }}>{S.lessonPoint}</button>
              {m.showme?.turn && ["pointing", "pointing_roughly", "your_turn_miss"].includes(m.showme.stage) && <button className="btn" type="button" onClick={() => { pressed(); void invoke("do_it_for_me"); }}>{S.doItForMe}</button>}
              <button className="btn primary" type="button" onClick={() => { acted.current = wkKey; clearTimeout(actTimer.current); void send(walkActed(m.walk!.id, "pressed", m.walk!.index)); }}>{S.lessonDid}</button>
            </>}
            {m.walk.stage === "already" && <>
              <div className="line">{S.lessonAlready}</div>
              <button className="btn primary" type="button" onClick={() => void send(walkAnswer(m.walk!.id, true, m.walk!.index))}>{S.lessonAlreadyYes}</button>
              <button className="btn" type="button" onClick={() => void send(walkAnswer(m.walk!.id, false, m.walk!.index))}>{S.lessonAlreadyNo}</button>
            </>}
            {m.walk.stage === "asking" && <>
              <div className="line">{S.lessonWorked}</div>
              <button className="btn primary" type="button" onClick={() => void send(walkAnswer(m.walk!.id, true, m.walk!.index))}>{S.lessonYes}</button>
              <button className="btn" type="button" onClick={() => void send(walkAnswer(m.walk!.id, false, m.walk!.index))}>{S.lessonNo}</button>
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
          {m.diagram.stage === "shown" && <><div className="line"><b>{m.diagram.brokenReason}</b></div><div className="line">{m.diagram.caption}</div><div className="line muted">{S.drawShown}</div></>}
          {m.diagram.stage === "none" && <div className="line">{m.diagram.reason}</div>}
          {m.diagram.stage !== "asking" && <div className="row"><button className="btn" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.diagramClosed" }); }}>{S.pointClose}</button></div>}
        </section>
      )}
      {show("about") && m.about && m.about.project === project && (
        <section className="panel" aria-label={S.aboutTitle}>
          <h2>{S.aboutTitle}</h2>
          <div className="line">{m.about.about}</div>
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
      {/* Only hidden on the other tabs, never taken away: a draft, and the words from hold to talk, stay in the box. */}
      <div hidden={!show("ask")}>
      {askMode === "showme" && <div className="line" role="status"><b>{S.showMe}:</b> {S.showMeHint} <button className="btn" type="button" onClick={() => setAskMode("task")}>{S.planCancel}</button></div>}
      <div className="ask">
        <textarea ref={box} id={askId} rows={1} autoComplete="off" spellCheck={false} placeholder={S.askPlaceholder} aria-label={S.askPlaceholder} aria-describedby="ask-keys"
          onInput={(e) => { fitBox(); keepDraft(e.currentTarget.value); if (!e.currentTarget.value) fromVoice.current = false; }}
          onFocus={() => warmSoon()}
          onPaste={(e) => { const fs = pastedFiles(e.clipboardData); if (fs.length > 0) { e.preventDefault(); addDropped(fs); } }}
          onKeyDown={(e) => {
            if (askKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey, composing: composing(e) }) !== "send") return;
            e.preventDefault();
            if (askMode === "showme") { const q = box.current?.value.trim() ?? ""; if (q) { sentFromBox("showme"); showMe(q, q, []); setAskMode("task"); clearBox(); } } else submit();
          }} />
        {working && <button className="btn" type="button" onClick={() => void send(stopAgent())}>{S.stop}</button>}
      </div>
      <div className="line muted" id="ask-keys">{S.askKeysHint}</div>
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
      {attached.length === 0 && <div className="line muted">{S.attachHint}</div>}
      {!working && (
        <div className="row">
          <button className="btn primary" type="button" onClick={submit}>{S.start}</button>
          <button className="btn" type="button" onClick={plan}>{S.planIt}</button>
          <button className="btn" type="button" onClick={rescue}>{S.rescueIt}</button>
          <button className="btn" type="button" onClick={research}>{S.researchIt}</button>
          <button className="btn" type="button" onClick={() => shipIt()}>{S.shipCheck}</button>
          <button className="btn" type="button" onClick={() => { if (project) { dispatch({ type: "ui.planRequested" }); void send(shipPreview(project)); } }}>{S.onlineButton}</button>
          <button className="btn" type="button" onClick={() => { const q = box.current?.value.trim() ?? ""; if (q) { sentFromBox("showme"); showMe(q, q, []); } else { pressed(); dispatch({ type: "app.showme", stage: "error", message: S.showMeHint }); } }}>{S.showMe}</button>
          <button className="btn" type="button" disabled={m.diagram?.stage === "asking"} onClick={() => drawIt(box.current?.value ?? "", m.where ?? undefined)}>{S.drawIt}</button>
        </div>
      )}
      {!working && (
        <label className="check"><input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> {S.voiceAutoSend}</label>
      )}
      {!working && (
        <label className="check"><input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> {S.offRecord}</label>
      )}
      </div>

      {show("urgent") && <div ref={urgent}>
      {m.agentsAsk && (
        <section className="panel amber" aria-label={S.agentsTitle}>
          <h2>{S.agentsTitle}</h2>
          <div className="line">{S.agentsAsk} {m.agentsAsk.join(" and ")}. {S.agentsAskEnd}</div>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => { void send(answerAgents(project, "yes")); dispatch({ type: "ui.agentsAnswered" }); }}>{S.agentsYes}</button>
            <button className="btn" type="button" onClick={() => { void send(answerAgents(project, "no")); dispatch({ type: "ui.agentsAnswered" }); }}>{S.agentsNo}</button>
          </div>
        </section>
      )}
      {m.approvals.map((a) => (
        <section className="panel amber" key={a.id} aria-label={S.needsYouTitle}>
          <h2>{S.needsYouTitle}</h2>
          <div className="line">{a.title}</div>
          <div className="row">
            <button className="btn primary" type="button" aria-label={`${S.allow}: ${a.title}`} onClick={() => { void send(answerApproval(a.id, true)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.allow}</button>
            <button className="btn" type="button" aria-label={`${S.dontAllow}: ${a.title}`} onClick={() => { void send(answerApproval(a.id, false)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.dontAllow}</button>
          </div>
        </section>
      ))}

      {m.stuck && (
        <section className="panel amber" aria-label={S.stuckTitle}>
          <h2>{S.stuckTitle}</h2>
          <div className="line">{stuckWords(m)}</div>
          <div className="line muted">{S.stuckHelp}</div>
          <div className="line">{m.stuck.failure}</div>
          <div className="row">
            {m.stuck.options.map((o, i) => (
              <button key={o.id} className={`btn ${i === 0 ? "primary" : ""}`} type="button" onClick={() => { void send(chooseLoop(o.id as "different" | "stop")); dispatch({ type: "ui.stuckAnswered" }); }}>{o.label}</button>
            ))}
            {pointsOnScreen(m.where) && <button className="btn" type="button" onClick={() => pointProblem(project, m.where)}>{S.pointWhere}</button>}
          </div>
        </section>
      )}

      {m.paused && (
        <section className="panel amber" aria-label={S.pausedTitle}>
          <h2>{S.pausedTitle}</h2>
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
          {m.plan.truncated && <div className="line">{S.planTooLong}</div>}
          <div className="line muted">{m.plan.estimateUsd > 0 ? `${S.planCost}: ${formatUsd(m.plan.estimateUsd)}` : S.planCostNone}</div>
          <div className="row">
            <button className="btn primary" type="button" disabled={draft.every((s) => !s.trim())} onClick={() => { void send(approvePlan(draft.map((s) => s.trim()).filter(Boolean))); dispatch({ type: "ui.planCancelled" }); }}>{S.planStart}</button>
            <button className="btn" type="button" onClick={() => dispatch({ type: "ui.planCancelled" })}>{S.planCancel}</button>
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
              <div className="line">{m.ph.diff.map(([op, t], i) => op === "+" ? <ins key={i} className="added"><span className="sr">{S.diffAdded} </span>{t}</ins> : op === "-" ? <del key={i} className="removed"><span className="sr">{S.diffRemoved} </span>{t}</del> : <span key={i}>{t}</span>)}</div>
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
              <div className="line muted">{acceptHint(phArmed, keys)}</div>
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
          <div className="line">{m.research.answer}</div>
          <div className="line muted"><b>{S.researchNotes}:</b></div>
          {m.research.notes.map((n, i) => <ResearchNote key={i} text={n.text} source={n.source} />)}
          <div className="line muted">{S.researchFiled} {m.research.file}</div>
          <div className="row"><CopyButton text={researchCopy(m.research)} label={S.copyAnswer} /><button className="btn" type="button" onClick={() => dispatch({ type: "ui.researchClosed" })}>{S.researchClose}</button></div>
        </section>
      )}

      {show("rescue") && m.rescue && (
        <section className="panel" aria-label={S.rescueTitle}>
          <h2>{S.rescueTitle}</h2>
          <div className="line">{m.rescue.summary}</div>
          {m.rescue.works.length > 0 && <div className="line"><b>{S.rescueWorks}:</b> {m.rescue.works.join("; ")}</div>}
          <div className="line"><b>{S.rescueBroken}:</b> {m.rescue.broken}</div>
          <div className="line muted"><b>{S.rescueChecks}:</b></div>
          {m.rescue.evidence.map((e, i) => <div className={`line ${e.status === "failed" ? "blocked" : "muted"}`} key={i}>{e.label}: {e.status}{e.detail ? ` ${e.detail}` : ""}</div>)}
          <div className="row">
            {pointsOnScreen(m.where) && <button className="btn" type="button" onClick={() => pointProblem(project, m.where)}>{S.pointWhere}</button>}
            <CopyButton text={rescueCopy(m.rescue)} label={S.copyAnswer} />
            <button className="btn" type="button" onClick={() => dispatch({ type: "ui.planCancelled" })}>{S.closeFinished}</button>
          </div>
        </section>
      )}

      {show("task") && m.task && m.task.lines.length > 0 && (
        <section className="panel">
          <h2>{m.task.label || "Task"}</h2>
          {/* The latest one or two steps, in plain words: never the raw command. */}
          {activityNow(m).map((l, i) => <div key={i} className={`line ${l.outcome === "blocked" || l.outcome === "denied" ? "blocked" : ""}`}>{l.outcome === "blocked" ? `${S.blocked}: ` : l.outcome === "denied" ? `${S.denied}: ` : l.outcome === "needs_approval" ? `${S.waiting}: ` : ""}{l.words}</div>)}
        </section>
      )}

      {show("proof") && m.task?.proof && m.task.proof.steps.length > 0 && (
        <section className={`panel ${notDoneReason(m) ? "amber" : ""}`} aria-label={S.checkingTitle}>
          <h2>{isFixing(m) ? S.fixing : notDoneReason(m) ? S.notDone : S.checkingTitle}</h2>
          {m.task.proof.steps.map((s) => (
            <div className={`line ${s.status === "failed" ? "blocked" : ""}`} key={s.rung}>
              {s.label}: {({ running: S.stepRunning, passed: S.stepPassed, failed: S.stepFailed, skipped: S.stepSkipped } as const)[s.status]}
              {s.status !== "passed" && s.detail ? <span className="muted"> {s.detail}</span> : null}
            </div>
          ))}
          {triesNote(m) && <div className="line"><b>{triesNote(m)}</b></div>}
          {notDoneReason(m) && !isFixing(m) && <div className="line">{S.notDoneHelp} {notDoneReason(m)}</div>}
          {canBisect(m) && project && <div className="row"><button className="btn" type="button" onClick={findBreaker}>{S.bisectButton}</button></div>}
        </section>
      )}

      {show("receipt") && m.receipt && (
        <section className="panel">
          <h2>{S.receiptTitle}</h2>
          {m.receipt.changed.length === 0 ? <div className="line">{S.nothingChanged}</div> :
            m.receipt.changed.map((c) => <div className="line" key={c.file}>{(S as any)[c.kind] ?? c.kind}: {c.file}</div>)}
          {m.receipt.notUndoable.length > 0 && <div className="line"><b>{S.cannotUndo}:</b> {m.receipt.notUndoable.join("; ")}</div>}
          {m.receipt.changed.length > 0 && <div className="line muted">{receiptProofWords(m)}</div>}
          {m.receipt.visual?.image && !undone && m.undo?.stage !== "working" && (
            <figure className="receipt-shot">
              <img src={`data:image/jpeg;base64,${m.receipt.visual.image}`} alt={m.receipt.visual.caption} />
              <figcaption>{m.receipt.visual.caption}</figcaption>
            </figure>
          )}
          {m.receipt.picture && !m.receipt.visual && !undone && <div className="line muted">{S.receiptPicturing}</div>}
          {blockedNote(m, project) && <div className="line"><b>{blockedNote(m, project)}</b></div>}
          <div className="line muted">{m.receipt.commands} {S.commands} · {S.cost}: {formatUsd(m.receipt.usdEstimate)}</div>
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
          {m.receipt.changed.length > 0 && !m.undo && project && (
            <div className="row"><button id={undoId} className="btn danger" type="button" onClick={() => dispatch({ type: "ui.undoAsked", checkpoint: m.receipt!.checkpoint })}>{S.undo}</button></div>
          )}
          {m.undo?.stage === "confirm" && project && (
            <ConfirmStep className="line" label={S.undoSure} back={undoId} onCancel={() => dispatch({ type: "ui.undoCancelled" })}><div>{S.undoSure}</div>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => { dispatch({ type: "ui.undoSent" }); void send(undo(project, m.undo!.checkpoint)); }}>{S.undoYes}</button>
                <button className="btn" type="button" data-cancel onClick={() => dispatch({ type: "ui.undoCancelled" })}>{S.undoNo}</button>
              </div></ConfirmStep>
          )}
          {m.undo?.stage === "working" && <div className="line" role="status">{S.undoWorking}</div>}
          {m.undo?.stage === "failed" && <div className="line" role="alert">{m.undo.note}</div>}
          {m.undo?.stage === "done" && <div className="line" role="status">{S.undone}{m.undo.recovered ? ` ${S.undoRecovered}` : ""}{m.undo.large ? ` ${S.undoLarge}` : ""}</div>}
          {m.explain && m.explain.checkpoint === m.receipt.checkpoint && <ExplainBox e={m.explain} key={m.explain.checkpoint} />}
          {(canFollowUp(m, project) || m.followUp === "sending") && (
            <FollowUpBox project={project} sending={m.followUp === "sending"} retry={canRetry({ ...m, followUp: "idle" }, project)}
              onSent={() => { pressed(); dispatch({ type: "ui.undoClosed" }); dispatch({ type: "ui.followUpSent" }); }} />
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
                case "check": return <button key={a} className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.teachChecking" }); void send(checkMyChange(project, t.checkpoint)); }}>{S.teachCheck}</button>;
                case "putBack": return <button key={a} className="btn" type="button" onClick={() => { dispatch({ type: "ui.teachRestore" }); void send(undo(project, t.restore!)); }}>{S.teachPutBack}</button>;
                case "leave": return <button key={a} className="btn" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.teachLeft" }); }}>{S.teachLeave}</button>;
                case "close": return <button key={a} className="btn" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.teachClosed" }); }}>{S.pointClose}</button>;
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
              {m.point.stage === "found" && <button className="btn primary" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); if (project) void send(diagnose(project)); }}>{S.pointFix}</button>}
              {m.point.stage === "found" && canBisect(m) && project && <button className="btn" type="button" onClick={findBreaker}>{S.bisectButton}</button>}
              <button className="btn" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); }}>{S.pointClose}</button>
            </div>
          )}
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
            {m.bisect.stage === "done" && m.bisect.undoStage !== "working" && <button className="btn" type="button" onClick={() => dispatch({ type: "ui.bisectClosed" })}>{S.bisectClose}</button>}
          </div>
        </section>
      )}

      {show("errorHelp") && m.eh && (
        <section className={`panel ${["refused", "error", "needs_accessibility", "nothing_selected", "consent"].includes(m.eh.stage) ? "amber" : ""}`} role="status" aria-live="polite" aria-label={S.ehTitle}>
          <h2>{S.ehTitle}</h2>
          {["ready", "unexplained"].includes(m.eh.stage) && m.eh.excerpt && <div className="line muted">{m.eh.excerpt}</div>}
          {ehLines(m).map((l, i) => <div className="line" key={i}>{l}</div>)}
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
          {m.recap.lines.map((l, i) => <div className="line" key={i}>{l}</div>)}
          <div className="line muted">{S.recapSource}</div>
          <div className="row"><CopyButton text={recapCopy(m.recap)} label={S.copyAnswer} /><button className="btn" type="button" onClick={() => dispatch({ type: "ui.recapClosed" })}>{S.recapClose}</button></div>
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
      {show("history") && <HistoryPanel items={project ? m.history : []} q={historyQ} setQ={setHistoryQ} />}
      </div>
      </>)}
    </main>
  );
}
// Settings (settingsStore.ts): asked for once, kept in step with every change. The saved text size is on the page before
// Home first draws, so nothing jumps (until the shell answers, the choice kept in this page's own storage before the
// registry is used, with the same meaning).
startSettings();
applyTextSize(textSize());
createRoot(document.getElementById("root")!).render(<StrictMode><Card /></StrictMode>);
