// The panel under the notch (islandPanel.ts and notchQuick.ts decide what is in it). It hangs from the notch like the notch
// grown down. M70 (the founder, 4 Nov 2026: "practical, just like HeyClicky's notch"): resting the pointer opens a small
// panel with a small greeting over one plain fact, with Settings and Open beside it, then up to three buttons, or the job at work with
// Stop, or a question, or a result's mini receipt. No character in it (M70 step 4); only the opt in hello shows the Visor.
// Every button only opens Home at a place (main.rs island_go, never with the keyboard), so approvals, snapshots and receipts work there as always. Stop is the only
// press that acts here by itself (it stops); Undo asks its question in Home, as the receipt does, and a question is
// answered here only as M23 allows. Opened by itself (a question, a result), it shows only that card. It never takes the
// keyboard (the island is a borderless panel). Its height is measured (island.tsx); the quick and job layouts are fixed.
import { forwardRef, useEffect, useRef, useState } from "react";
import { FlowMini } from "./flowflowMini.tsx";
import { ARM_MS, answerHere, armed, cardReady, islandJobs, panelNote, panelView, PANEL_DO, type JobCard } from "./islandPanel.ts";
import { keyHint, keysFrom, setKeysNow } from "./keys.ts";
import { answerApproval, stopAgent } from "./commands.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { useSetting } from "./settingsStore.ts";
import { clockWords, homeStatus, jobStep, notchStatusLine } from "./homeHero.ts";
import { GEAR_DO, panelLayout, quickActions, quickFact, quickGo, quickGreeting, quickLabel, factLines } from "./notchQuick.ts";
import { useGroups } from "./groups.ts";
import { Button } from "./ui/parts.tsx";
import { Icon } from "./icons.tsx";

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
  const actions = showButtons ? quickActions(m, { now, layout, on: groups.on }) : [];
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
        <span className="ip-text"><span>{view.job.sub} · {S.home.timeSoFar(clockWords(now - (since.current?.at ?? now)))}</span>
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
    <div className="island-panel" ref={ref} data-layout={!brief && !hello && (layout === "quick" || layout === "job") ? layout : undefined} data-shown={shown ? "yes" : undefined} data-size={compact ? "compact" : undefined} data-brief={brief ? "yes" : undefined} data-armed={ready() ? "yes" : undefined} aria-hidden={!shown} role="group" aria-label={S.panel.label}>
      {hello ? <div className="ip-hello" role="status" aria-label={hello.say}>
        <FlowMini className="ip-agent" state="idle" still={!shown} />
        <p className="ip-hello-line" aria-hidden="true"><b>{hello.greet}</b>{hello.fact && <span>{hello.fact}</span>}</p>
      </div> : brief ? (
        // Opened by itself, only a question or a result that matters (island.tsx); never the greeting, the line or a button.
        view.kind === "questions" || view.kind === "result" ? live : null
      ) : <>
      {/* M70: a small greeting over the one fact (the founder asked for it by name), with Settings (Home on Settings) and Open (Home on
          Now) in words. Both grow the same shape into Home. While a job runs, the fact is the job's name. */}
      <div className="ip-head">
        <span className="ip-lead"><span className="ip-greet" title={lines.top}>{lines.top}</span><b className="ip-fact" title={lines.fact}>{lines.fact}</b></span>
        <span className="ip-tools">
          <button className="ip-word" type="button" tabIndex={tab} onClick={() => { if (ready()) void invoke("island_go", { then: GEAR_DO }).catch(() => {}); }}>{S.notch.settings}</button>
          <button className="ip-word" type="button" tabIndex={tab} aria-label={S.notch.open} onClick={() => { if (ready()) void invoke("island_go", {}).catch(() => {}); }}>{S.notch.openShort}</button>
        </span>
      </div>
      {layout !== "quick" && live}
      {layout === "quick" && actions.length > 0 && <nav className="ip-quick" aria-label={S.notch.actions}>
        {actions.map((id) => <Button key={id} kind={id === "review" ? "primary" : "secondary"} size="sm" tabIndex={tab} onClick={() => { if (ready()) void invoke("island_go", quickGo(id)).catch(() => {}); }}>{quickLabel(id, m, now)}</Button>)}
      </nav>}
      </>}
    </div>
  );
});
