// The panel under the notch (islandPanel.ts decides what is in it). It hangs from the notch like the notch grown down and
// shows only what is live, one thing (F28, the overhaul spec 4.3): a job with Stop, a result with Undo and See proof, the
// questions waiting, or one true line (the engine getting ready included, F29: no key button). No greeting and no
// launcher buttons: a click on the notch always opens Home. Stop is the only press that acts here by itself (it stops);
// Undo asks its question in Home, as the receipt does, and a question is answered here only as M23 allows. It never takes
// the keyboard (the island is a borderless panel). Its height is measured (island.tsx).
import { forwardRef, useEffect, useRef, useState } from "react";
import { FlowMini } from "./flowflowMini.tsx";
import { ARM_MS, answerHere, armed, cardReady, islandJobs, panelNote, panelView, PANEL_DO, type JobCard } from "./islandPanel.ts";
import { keyHint, keysFrom, setKeysNow } from "./keys.ts";
import { answerApproval, stopAgent } from "./commands.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { useSetting } from "./settingsStore.ts";
import { clockWords, homeStatus, notchStatusLine } from "./homeHero.ts";
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
  const questions = jobs.filter((j) => j.approval);
  const list = questions.length > 0 && <ul className="ip-jobs" aria-label={S.panel.jobs}>
      {questions.map((j) => (
        <li key={j.key}>
          <div className="ip-job ip-ask" data-tone={j.tone} data-armed={armed(seen.current.get(j.key) ?? null, now) ? "yes" : undefined}>
            <FlowMini className="ip-agent" state={j.state} still={!shown} />
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
        <span className="ip-text"><b>{view.job.title}</b><span>{view.job.sub} · {S.home.timeSoFar(clockWords(now - (since.current?.at ?? now)))}</span></span>
        <Button size="sm" tabIndex={tab} label={`${S.stop}. ${keyHint("stop", S.look.stopKeys)}`} title={keyHint("stop", S.look.stopKeys)} onClick={() => void invoke("send_command", { cmd: stopAgent() }).catch(() => {})}><Icon name="stop" size={12} />{S.stop}</Button>
      </div>
    )
    : view.kind === "result" ? (
      // M69 (spec 3.13): a mini receipt. The character as the verdict says it, the fix in its own words, how it was proven,
      // the after picture, then Keep (folds the panel back), Undo (asked in Home) and See proof. No key hints (rule 9).
      <div className="ip-result ip-receipt" data-tone={view.job.tone} data-armed={cardOk(view.job.key, now) ? "yes" : undefined} role="group" aria-label={view.verdict.say}>
        <div className="ip-receipt-head">
          <FlowMini className="ip-agent" state={view.job.state} still={!shown} />
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
    <div className="island-panel" ref={ref} data-shown={shown ? "yes" : undefined} data-size={compact ? "compact" : undefined} data-brief={brief ? "yes" : undefined} data-armed={ready() ? "yes" : undefined} aria-hidden={!shown} role="group" aria-label={S.panel.label}>
      {hello ? <div className="ip-hello" role="status" aria-label={hello.say}>
        <FlowMini className="ip-agent" state="idle" still={!shown} />
        <p className="ip-hello-line" aria-hidden="true"><b>{hello.greet}</b>{hello.fact && <span>{hello.fact}</span>}</p>
      </div> : <>
      {!brief && unseen > 0 && <p className="ip-new">{S.panel.newCount(unseen)}</p>}
      {!brief && review && <p className="ip-new">{reviewKey ? S.panel.reviewKey : S.panel.reviewReady}</p>}
      {/* Opened by itself, only a question or a result that matters (island.tsx); never the line or the key. */}
      {brief ? (view.kind === "questions" || view.kind === "result" ? live : null) : live}
      </>}
    </div>
  );
});
