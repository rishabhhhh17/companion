// The panel under the notch (islandPanel.ts and notchQuick.ts decide what is in it). It hangs from the notch like the notch
// grown down. M70 (the founder, 4 Nov 2026: "practical, just like HeyClicky's notch"): resting the pointer opens a small
// panel with a small greeting over one plain fact, with Settings and Open beside it, then up to three buttons, or the job at work with
// Stop, or a question, or a result's mini receipt. No character in it (M70 step 4); only the opt in hello shows the Visor.
// Every button only opens Home at a place (main.rs island_go, never with the keyboard), so approvals, snapshots and receipts work there as always. Stop is the only
// press that acts here by itself (it stops); Undo asks its question in Home, as the receipt does, and a question is
// answered here only as M23 allows. Opened by itself (a question, a result), it shows only that card. It never takes the
// keyboard (the island is a borderless panel). Its height is measured (island.tsx); the quick and job layouts are fixed.
import { forwardRef, useEffect, useRef, useState, type CSSProperties } from "react";
import { FlowMini } from "./flowflowMini.tsx";
import { ARM_MS, answerHere, armed, cardReady, islandJobs, panelNote, panelView, PANEL_DO, type JobCard } from "./islandPanel.ts";
import { chordLabel, keyHint, keysFrom, setKeysNow } from "./keys.ts";
import { answerApproval, stopAgent } from "./commands.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { invoke, listen } from "./tauri.ts";
import { useSetting } from "./settingsStore.ts";
import { homeStatus, jobStep, notchStatusLine } from "./homeHero.ts";
import { factColour, GEAR_DO, panelLayout, quickActions, quickFact, quickFactKind, quickGo, quickGreeting, quickLabel, quickLook, factLines } from "./notchQuick.ts";
import { latestReview, nextPeek, peekHeight, peekRows, toolsRow, TOOLS_WAIT_MS, type Go } from "./notchPeek.ts";
import { showDoneSignal } from "./commands.ts";
import { useKeys } from "./useKeys.ts";
import { useGroups } from "./groups.ts";
import { Button, Dot, KeyLabel, Tile } from "./ui/parts.tsx";
import { Icon } from "./icons.tsx";
import { doneStateFrom, type DoneState } from "./doneSignal.ts";
import { runwayMark, type RunwayMark } from "./runway.ts";

/** M89: the usage runway's small ring in the panel's head (runway.ts runwayMark): how full the person's Claude limit is, as
 *  Claude itself said on Squibby's own runs, with the percent beside it. Drawn and said: its label is the whole sentence. */
export function RunwayRing({ mark }: { mark: RunwayMark }) {
  return (
    <span className="ip-runway" data-level={mark.level} role="img" aria-label={mark.say} title={mark.say}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle className="ip-runway-track" cx="8" cy="8" r="6" /><circle className="ip-runway-fill" cx="8" cy="8" r="6" pathLength={100} style={{ strokeDasharray: `${Math.round(mark.fill * 100)} 100` }} /></svg>
      {mark.short && (mark.over ? <span className="ip-runway-text" aria-hidden="true"><small>{mark.over}</small><span>{mark.short}</span></span> : <span aria-hidden="true">{mark.short}</span>)}
    </span>
  );
}

/** M84: the AI tools connected in the project (donesignal.state), asked by the panel itself the first time it opens for a
 *  project, so the first hover after launch knows them without Home having been opened (the founder, 13 Nov: the M83 panel
 *  only listened for Home's ask, so its tools fact was missing until Home had shown Now once). The ask only reads the
 *  project's hook files (main.rs donesignal.show writes nothing); it is sent once per project while this page lives, and
 *  never on a timer. Home's own asks are heard too. The M84 review: an ask that gets no answer is asked again the next time
 *  the panel opens (the engine refused it, or it came back after a restart before answering), and after TOOLS_WAIT_MS with
 *  no answer the row says it could not check instead of "One moment" forever (`waited`). */
function usePanelTools(project: string, shown: boolean, askable: boolean, runnerUp: boolean): { st: DoneState | null; waited: boolean } {
  const [st, setSt] = useState<DoneState | null>(null);
  const [waited, setWaited] = useState(false);
  const asked = useRef<Set<string>>(new Set());
  useEffect(() => {
    setSt(null);
    setWaited(false);
    if (!project) return;
    const off = listen("runner-event", (e) => {
      const d = doneStateFrom(e.payload, project);
      if (d) { setSt(d); return; }
      // The engine refused the ask: say so now, and ask again the next time the panel opens.
      const o = e.payload as { type?: unknown; failed?: unknown; line?: unknown } | null;
      if (o?.type === "protocol.error" && (o.failed === "donesignal.show" || o.line === "donesignal.show")) { asked.current.delete(project); setWaited(true); }
    });
    return () => { void off.then((f) => f()); };
  }, [project]);
  // The engine stopped: whatever was asked before is lost with it, so it is asked again once the engine is back.
  useEffect(() => { if (!runnerUp) { asked.current.clear(); setWaited(false); } }, [runnerUp]);
  useEffect(() => {
    if (!shown || !project || !askable || asked.current.has(project)) return;
    asked.current.add(project);
    setWaited(false);
    void invoke("send_command", { cmd: showDoneSignal(project) }).catch(() => { asked.current.delete(project); setWaited(true); });
  }, [shown, project, askable]);
  // No answer in TOOLS_WAIT_MS: the row says it could not check (nothing is sent on this timer), and the next open asks again.
  useEffect(() => {
    if (st || !shown || !project || !askable || waited) return;
    const id = setTimeout(() => { asked.current.delete(project); setWaited(true); }, TOOLS_WAIT_MS);
    return () => clearTimeout(id);
  }, [st, shown, project, askable, waited]);
  return { st, waited };
}

/** `brief` (M26): the panel opened by itself (a question, or a result that matters), so it shows only that; the pointer
 *  opens the whole panel. `unseen` (M46): results finished while Home was closed, said on the hover panel's top line only
 *  (the bare notch shows nothing at rest). `review` (M52): changes another AI tool made wait to be reviewed, said on the
 *  same line, as quietly. */
type Props = { m: Model; line: string; shown: boolean; brief?: boolean; unseen?: number; review?: boolean;
  /** M57 feature 5: the changes waiting carry the instant key warning. Said on the same quiet line instead, never as an alert. */
  reviewKey?: boolean;
  /** M68: the hello (notchHello.ts helloLine): while it shows, the panel is the Visor and that one line, nothing else. */
  hello?: { greet: string; fact: string | null; say: string } | null;
  /** M69: Keep on the mini receipt: the result it was pressed on (island.tsx folds the panel back and keeps it folded). */
  kept?: string | null; onKeep?: (key: string) => void };

void invoke("key_map").then((v) => setKeysNow(keysFrom(v))).catch(() => {});

export const IslandPanel = forwardRef<HTMLDivElement, Props>(function IslandPanel({ m, line, shown, brief, unseen = 0, review = false, reviewKey = false, hello = null, kept = null, onKeep }, ref) {
  // What the panel shows and its size (M19, Look and feel): the work and its results, usual or compact.
  const showWork = useSetting("panel.showWork") !== false;
  // M70: the small panel's buttons (notchQuick.ts). Read every render: a hook is never skipped.
  const showButtons = useSetting("panel.showButtons") !== false;
  // M70 (the founder: "a small text" first, "hey Rishabh"): a small greeting over the one fact. The typed name only.
  const greet = quickGreeting(useSetting("you.name"));
  // M89: the runway ring, when Claude has said how full the limit is (or turned a request away) and it is not switched off.
  const runwayOn = useSetting("runway.mark");
  const runwayWarnAt = useSetting("runway.warnAt");
  const tries = Number(useSetting("work.tries")) || 3;
  const groups = useGroups();
  const compact = useSetting("panel.size") === "compact";
  const jobs = showWork || brief ? islandJobs(m) : [];
  const tab = shown ? 0 : -1;
  const note = panelNote(line, jobs);
  // M23: when each card was first seen with the panel open; a question's buttons wait ARM_MS from then (M46: in a panel
  // that opened by itself, every card does, cardReady).
  const seen = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());
  const keys = jobs.map((j) => j.key).join(" ");
  useEffect(() => {
    if (!shown) { seen.current.clear(); return; }
    const t = Date.now();
    for (const k of keys.split(" ").filter(Boolean)) if (!seen.current.has(k)) seen.current.set(k, t);
    setNow(t);
    if (!keys) return;
    const id = setTimeout(() => setNow(Date.now()), ARM_MS + 20);
    return () => clearTimeout(id);
  }, [shown, keys]);
  // M46: opened by itself, the whole panel ignores every click for its first ARM_MS (Look first, a result's buttons, Allow
  // and Don't allow alike), and keeps that moment if the pointer then rests on it. Opened by the pointer, it is ready at once.
  const openedAt = useRef<number | null>(null);
  if (!shown) openedAt.current = null;
  else if (brief && openedAt.current === null) openedAt.current = Date.now();
  const selfOpened = openedAt.current;
  useEffect(() => {
    if (selfOpened === null) return;
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, selfOpened + ARM_MS + 20 - Date.now()));
    return () => clearTimeout(id);
  }, [selfOpened]);
  const ready = () => openedAt.current === null || armed(openedAt.current, Date.now());
  const cardOk = (key: string, at: number) => cardReady(openedAt.current, seen.current.get(key) ?? null, at);
  const click = (key: string, f: () => void) => () => { if (!ready() || !cardOk(key, Date.now())) return; f(); };
  const answer = (j: JobCard, allow: boolean) => {
    if (!ready() || !j.approval || !armed(seen.current.get(j.key) ?? null, Date.now())) return;
    void invoke("send_command", { cmd: answerApproval(j.approval, allow) }).catch(() => {});
  };
  // The one live thing, and the project's true line when nothing is (homeHero.ts: the same status as Home's headline).
  const project = m.task?.project ?? m.folder ?? "";
  const view = panelView(m, jobs, { note, status: notchStatusLine(homeStatus(m, project, now), project), kept });
  // A job's time so far: from when this panel first saw it, ticking each second only while it shows.
  const since = useRef<{ key: string; at: number } | null>(null);
  const jobKey = view.kind === "job" ? view.job.key : "";
  if (jobKey && since.current?.key !== jobKey) since.current = { key: jobKey, at: Date.now() };
  useEffect(() => {
    if (!shown || !jobKey) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [shown, jobKey]);
  const step = jobStep(m, tries).step;
  // M70: the layout and its quick actions. The fact: a key written in the changes waiting comes first (M57), then the job
  // at work by its name, then the one plain fact, then new results finished while Home was closed.
  const layout = panelLayout(view);
  const fact0 = reviewKey ? S.panel.reviewKey : view.kind === "job" ? view.job.title : quickFact(m, now, note);
  const fact = fact0 === S.notch.ready && unseen > 0 ? S.panel.unseen(unseen) : fact0;
  const lines = factLines(greet, fact, project);
  // M71: the fact's dot in its meaning's colour (a key in the code red, the job at work blue, the rest by quickFact's rule).
  const dot = factColour(reviewKey ? "failing" : view.kind === "job" ? "working" : fact !== fact0 ? "ready" : quickFactKind(m, now, note));
  const actions = showButtons ? quickActions(m, { now, layout, on: groups.on }) : [];
  // M84: the rows (notchPeek.ts): the head, one small card per AI tool, the latest review or the next useful thing (or the
  // job with Stop), and the foot with the quick actions and the key to press. Each row listed says something.
  const full = layout === "quick" || layout === "job";
  const rows = full ? peekRows(m, layout) : [];
  const tools = usePanelTools(project, shown, rows.includes("tools"), m.runnerUp);
  const trow = rows.includes("tools") ? toolsRow(m, tools.st, undefined, tools.waited) : null;
  const rcard = layout === "quick" ? latestReview(m, now) : null;
  const next = layout === "quick" && !rcard ? nextPeek(m, now) : null;
  const keyMap = useKeys();
  const go = (g: Go) => { if (ready()) void invoke("island_go", g).catch(() => {}); };
  const questions = jobs.filter((j) => j.approval);
  const list = questions.length > 0 && <ul className="ip-jobs" aria-label={S.panel.jobs}>
      {questions.map((j) => (
        <li key={j.key}>
          <div className="ip-job ip-ask" data-tone={j.tone} data-armed={armed(seen.current.get(j.key) ?? null, now) ? "yes" : undefined}>
            <span className="ip-dot" data-tone={j.tone} aria-hidden="true" />
            <span className="ip-text"><b>{j.title}</b><span>{j.code ? <code>{j.sub}</code> : j.sub}</span></span>
            <span className="ip-answer">
              {j.here ?? answerHere(j.risk ?? "") ? <>
                <Button size="sm" className="ip-no" tabIndex={tab} label={`${S.dontAllow}: ${j.title}`} onClick={() => answer(j, false)}>{S.dontAllow}</Button>
                <Button size="sm" className="ip-yes" tabIndex={tab} label={`${S.allow}: ${j.title}`} onClick={() => answer(j, true)}>{S.allow}</Button>
              </> : <Button size="sm" className="ip-yes" tabIndex={tab} onClick={click(j.key, () => void invoke("island_click").catch(() => {}))}>{S.panel.lookFirst}</Button>}
            </span>
          </div>
        </li>
      ))}
    </ul>;
  const live = view.kind === "questions" ? list
    : view.kind === "job" ? (
      <div className="ip-live" data-tone="working">
        {/* M70 step 4: the job's name is the head row's fact; here its step, its time so far and Stop, on one row. */}
        <span className="ip-text"><span>{view.job.sub}</span>
          {/* M70: the step moves here from the wings: the work card's own four steps, done, now and ahead. Drawn only. */}
          <span className="island-step-line ip-steps" aria-hidden="true">{S.home.steps.map((w, i) => <i key={w} data-mark={i < step ? "done" : i === step ? "now" : "ahead"} />)}</span></span>
        <Button size="sm" tabIndex={tab} label={`${S.stop}. ${keyHint("stop", S.look.stopKeys)}`} title={keyHint("stop", S.look.stopKeys)} onClick={() => void invoke("send_command", { cmd: stopAgent() }).catch(() => {})}><Icon name="stop" size={12} />{S.stop}</Button>
      </div>
    )
    : view.kind === "result" ? (
      // M69 (spec 3.13): a mini receipt. A small tick or dot for the verdict (M70 step 4: no character), the fix in its own
      // words, how it was proven, the after picture, then Keep (folds the panel back), Undo (asked in Home) and See proof.
      // No key hints (rule 9).
      <div className="ip-result ip-receipt" data-tone={view.job.tone} data-armed={cardOk(view.job.key, now) ? "yes" : undefined} role="group" aria-label={view.verdict.say}>
        <div className="ip-receipt-head">
          <span className="ip-dot" data-tone={view.job.tone} aria-hidden="true">{view.verdict.proven && <Icon name="tick" size={10} />}</span>
          <span className="ip-text"><b>{view.mini.title || view.job.title}</b><span>{view.mini.line}</span></span>
          {view.mini.thumb && <img className="ip-thumb" src={view.mini.thumb} alt={S.fixRun.thumb} />}
        </div>
        <div className="ip-actions">
          {view.mini.keep && <Button kind="primary" size="sm" tabIndex={tab} label={S.fixRun.keepLabel} onClick={click(view.job.key, () => onKeep?.(view.job.key))}>{S.fixRun.keep}</Button>}
          {view.canUndo && <Button size="sm" tabIndex={tab} onClick={click(view.job.key, () => void invoke("open_card_cmd", { then: PANEL_DO.undo }).catch(() => {}))} label={S.home.undoFix}>{S.resultChips.undo}</Button>}
          <Button kind="quiet" size="sm" tabIndex={tab} onClick={click(view.job.key, () => void invoke("open_card_cmd").catch(() => {}))}>{S.home.seeProof}</Button>
        </div>
      </div>
    )
    : <p className="ip-status" role="status">{view.line || S.home.notchNothing}</p>;
  return (
    <div className="island-panel" ref={ref} data-layout={!brief && !hello && full ? layout : undefined} data-rows={!brief && !hello && full ? rows.length : undefined} data-shown={shown ? "yes" : undefined} data-size={compact ? "compact" : undefined} data-brief={brief ? "yes" : undefined} data-armed={ready() ? "yes" : undefined} aria-hidden={!shown} role="group" aria-label={S.panel.label}>
      {hello ? <div className="ip-hello" role="status" aria-label={hello.say}>
        <FlowMini className="ip-agent" state="idle" still={!shown} />
        <p className="ip-hello-line" aria-hidden="true"><b>{hello.greet}</b>{hello.fact && <span>{hello.fact}</span>}</p>
      </div> : brief ? (
        // Opened by itself, only a question or a result that matters (island.tsx); never the greeting, the line or a button.
        view.kind === "questions" || view.kind === "result" ? live : null
      ) : <>
      {/* M70: a small greeting over the one fact, with Settings (Home on Settings) and Open (Home on Now) in words. M84:
          Flowflow's live face beside it, in the state it is in. While a job runs, the fact is the job's name, and a thin
          line under the head shows how far it is (its four steps). */}
      <div className="ip-head">
        {full && <FlowMini className="ip-face" state={m.character} still={!shown} />}
        <span className="ip-lead"><span className="ip-greet" title={lines.top}>{lines.top}</span><b className="ip-fact" title={lines.fact}><Dot colour={dot} />{lines.fact}</b></span>
        <span className="ip-tools">
          {(() => { const rm = runwayMark(m.runway, now, runwayOn, undefined, runwayWarnAt); return rm && <RunwayRing mark={rm} />; })()}
          <button className="ip-word" type="button" tabIndex={tab} onClick={() => { if (ready()) void invoke("island_go", { then: GEAR_DO }).catch(() => {}); }}>{S.notch.settings}</button>
          <button className="ip-word" type="button" tabIndex={tab} aria-label={S.notch.open} onClick={() => { if (ready()) void invoke("island_go", {}).catch(() => {}); }}>{S.notch.openShort}</button>
        </span>
        {layout === "job" && <span className="ip-progress run-line" role="progressbar" aria-label={S.m84.progress(S.home.steps[Math.max(0, Math.min(S.home.steps.length - 1, step))])} aria-valuemin={0} aria-valuemax={S.home.steps.length} aria-valuenow={Math.min(S.home.steps.length, step + 1)}
          style={{ "--run": String(Math.min(1, (step + 1) / S.home.steps.length)) } as CSSProperties} />}
      </div>
      {/* M84: one small card per AI tool with what it is doing now (Claude Code waiting on you first), else the one Connect
          action, or a quiet "Checking your AI tools" for the moment before the engine answers. Each opens Home. */}
      {trow && <nav className="ip-ai" aria-label={S.m84.toolsLabel} data-kind={trow.kind}>
        {trow.kind === "tools" && <>
          {trow.tools.map((t) => <button key={t.tool} type="button" className="ip-ai-card" data-state={t.state} tabIndex={tab} aria-label={S.m84.toolSay(t.name, t.words)} title={`${t.name}: ${t.words}`} onClick={() => go(t.go)}>
            <span className="ui-mtile ip-mark" data-c={t.state === "waiting" ? "orange" : "grey"} data-size="place" aria-hidden="true">{t.mark}</span>
            <span className="ip-ai-text" aria-hidden="true"><b>{t.name}</b><span><Dot colour={t.colour} />{t.words}</span></span>
          </button>)}
          {trow.more > 0 && <button type="button" className="ip-ai-more" tabIndex={tab} aria-label={S.m84.moreSay(trow.more)} onClick={() => go({ then: { set: "fixing.tools" } })}>{S.m84.more(trow.more)}</button>}
        </>}
        {trow.kind === "connect" && <button type="button" className="ip-ai-card ip-ai-connect" tabIndex={tab} onClick={() => go(trow.go)}>
          <Tile colour="blue" icon="plug" size="btn" /><span className="ip-ai-text"><b>{S.m84.connect}</b><span>{S.m84.connectLine}</span></span><Icon name="chevron" size={12} />
        </button>}
        {trow.kind === "unknown" && <button type="button" className="ip-ai-card ip-ai-connect" data-state="unknown" tabIndex={tab} onClick={() => go(trow.go)}>
          <Tile colour="grey" icon="dash" size="btn" /><span className="ip-ai-text"><b>{S.m84.unknown}</b><span>{S.m84.unknownLine}</span></span><Icon name="chevron" size={12} />
        </button>}
        {trow.kind === "looking" && <div className="ip-ai-card" data-state="looking" role="status"><span className="ui-mtile ip-mark" data-c="grey" data-size="place" data-wait="" aria-hidden="true" /><span className="ip-ai-text"><b>{S.m84.looking}</b><span>{S.m84.lookingLine}</span></span></div>}
      </nav>}
      {/* M84: the latest review with its proof result and Undo (Undo only opens Home on its confirm step), else the next
          useful thing. While a job runs: its step, its time and Stop. */}
      {layout === "job" && live}
      {rcard && <div className="ip-card" data-kind="review" role="group" aria-label={`${S.m84.reviewLabel}: ${rcard.title}. ${rcard.proofWords}`}>
        <Tile colour={rcard.colour} icon={rcard.proof === "passed" ? "tick" : rcard.proof === "failed" ? "cross" : "dash"} size="btn" />
        <span className="ip-card-text"><span className="ip-card-cap">{S.m84.reviewLabel}{rcard.when ? ` · ${rcard.when}` : ""}</span><b title={rcard.title}>{rcard.title}</b></span>
        <span className="ip-card-proof" data-proof={rcard.proof}><Dot colour={rcard.colour} />{rcard.proofWords}</span>
        {rcard.undo && rcard.undoGo
          ? <Button size="sm" className="ip-card-act" tabIndex={tab} label={S.m84.undoSay(rcard.title)} onClick={() => go(rcard.undoGo!)}><Icon name="undo" size={12} />{S.m84.undo}</Button>
          : <Button kind="quiet" size="sm" className="ip-card-act" tabIndex={tab} label={S.m84.seeSay(rcard.title)} onClick={() => go(rcard.go)}>{S.m84.see}</Button>}
      </div>}
      {next && <button type="button" className="ip-card" data-kind="next" data-next={next.id} tabIndex={tab} onClick={() => go(next.go)}>
        <Tile colour={next.colour} icon={next.icon} size="btn" />
        <span className="ip-card-text"><b>{next.title}</b><span className="ip-card-cap">{next.line}</span></span>
        <Icon name="chevron" size={12} />
      </button>}
      {/* The foot: the quick actions on the left, the key to press on the right (the person's own keys, keys.ts). */}
      {full && <div className="ip-foot">
        {layout === "quick" && actions.length > 0 ? <nav className="ip-quick" aria-label={S.notch.actions}>
          {/* M71: each with its colour tile (notchQuick.ts quickLook), the same colours as Home's, so it reads as one product. */}
          {actions.map((id) => { const look = quickLook(id, m, now); return <Button key={id} kind="secondary" size="sm" className="ip-act" tabIndex={tab} onClick={() => { if (ready()) void invoke("island_go", quickGo(id)).catch(() => {}); }}><Tile colour={look.colour} icon={look.icon} size="btn" />{quickLabel(id, m, now)}</Button>; })}
        </nav> : <span />}
        {layout === "job" ? (keyMap.using.stop && <span className="ip-key"><KeyLabel chord={keyMap.using.stop} label={S.stop} /><span>{S.m84.keyStop}</span></span>)
          // M84 review: beside three actions there is no room for the words, and keys alone mean nothing to a non engineer,
          // so the hint is left out there (the head and the cards already say what to do).
          : (keyMap.using.problem && actions.length < 3 && <span className="ip-key" title={`${S.m84.keyBefore} ${chordLabel(keyMap.using.problem)} ${S.m84.keyAfter}`}><span>{S.m84.keyBefore}</span><KeyLabel chord={keyMap.using.problem} label={S.m84.keyLabel} /><span>{S.m84.keyAfter}</span></span>)}
      </div>}
      </>}
    </div>
  );
});
