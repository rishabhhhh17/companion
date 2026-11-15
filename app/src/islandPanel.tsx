// The panel under the notch (islandPanel.ts and notchMinimal.ts decide what is in it). It hangs from the notch like the notch
// grown down. M93 (the founder, 14 Nov 2026, on the M84 panel: "it's too much for just a notch. It just needs to be like
// 'Hey Rishabh' and some CTA"): resting the pointer opens two rows, Flowflow's live face beside "Hey <first name>" with at
// most one short line under it, then ONE action that fits the moment and a quiet Open Home. The AI tools, the latest
// review, the usage ring, the key to press, Settings and the practice offer live in Home. Opened by itself (a question, a
// result), it shows only that card, as before.
// Every button only opens Home at a place (main.rs island_go, never with the keyboard), so approvals, snapshots and receipts
// work there as always. Stop is the only press that acts here by itself (it stops); a question is answered here only as
// M23 allows. It never takes the keyboard (the island is a borderless panel). Its height is measured (island.tsx); the
// quick and job layouts are fixed (LAYOUT_H).
import { forwardRef, useEffect, useRef, useState } from "react";
import { FlowMini } from "./flowflowMini.tsx";
import type { IslandLineKind } from "./home.ts";
import { ARM_MS, answerHere, armed, cardReady, islandJobs, panelNote, panelView, PANEL_DO, type JobCard } from "./islandPanel.ts";
import { keyHint, keysFrom, setKeysNow } from "./keys.ts";
import { answerApproval, stopAgent } from "./commands.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { useSetting } from "./settingsStore.ts";
import { homeStatus, notchStatusLine } from "./homeHero.ts";
import { panelLayout } from "./notchQuick.ts";
import { hoverAction, hoverGreeting, hoverLine, hoverSecondary } from "./notchMinimal.ts";
import { useGroups } from "./groups.ts";
import { Button, Dot, Tile } from "./ui/parts.tsx";
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
  kept?: string | null; onKeep?: (key: string) => void;
  /** What `line` is about (home.ts islandLineKind), so the hover never reads it by its words. */
  lineKind?: IslandLineKind | null };

void invoke("key_map").then((v) => setKeysNow(keysFrom(v))).catch(() => {});

export const IslandPanel = forwardRef<HTMLDivElement, Props>(function IslandPanel({ m, line, shown, brief, unseen = 0, review = false, reviewKey = false, hello = null, kept = null, onKeep, lineKind = null }, ref) {
  // What the panel shows and its size (M19, Look and feel): the work and its results, usual or compact.
  const showWork = useSetting("panel.showWork") !== false;
  // M70: the small panel's buttons (panel.showButtons). Read every render: a hook is never skipped. M93: off, the action is
  // Open Home (Stop still shows while a job works).
  const showButtons = useSetting("panel.showButtons") !== false;
  // M93 (the founder: "Hey Rishabh"): the first word of the typed name, or Hey there. Never the Mac account's name (F28).
  const greet = hoverGreeting(useSetting("you.name"));
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
  // M93: the layout, the one short line (only when it matters) and the one action. A key written in the changes waiting
  // comes first (M57), the job at work by its name, new results finished while Home was closed (M46).
  const layout = panelLayout(view);
  const full = layout === "quick" || layout === "job";
  const hline = hoverLine(m, now, { note, noteKind: note ? lineKind : null, job: view.kind === "job" ? view.job.title : null, reviewKey, unseen });
  const action = hoverAction(m, now, { layout: layout === "job" ? "job" : "quick", on: groups.on, buttons: showButtons });
  const stopSay = `${S.stop}. ${keyHint("stop", S.look.stopKeys)}`;
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
    : null;
  // Every press but Stop opens Home at a place (island_go); Stop stops, as Home's own Stop does.
  const act = () => {
    if (!ready()) return;
    if (action.go === null) { void invoke("send_command", { cmd: stopAgent() }).catch(() => {}); return; }
    void invoke("island_go", action.go).catch(() => {});
  };
  return (
    <div className="island-panel" ref={ref} data-layout={!brief && !hello && full ? layout : undefined} data-shown={shown ? "yes" : undefined} data-size={compact ? "compact" : undefined} data-brief={brief ? "yes" : undefined} data-armed={ready() ? "yes" : undefined} aria-hidden={!shown} role="group" aria-label={S.panel.label}>
      {hello ? <div className="ip-hello" role="status" aria-label={hello.say}>
        <FlowMini className="ip-agent" state="idle" still={!shown} />
        <p className="ip-hello-line" aria-hidden="true"><b>{hello.greet}</b>{hello.fact && <span>{hello.fact}</span>}</p>
      </div> : brief ? (
        // Opened by itself, only a question or a result that matters (island.tsx); never the greeting or a button.
        view.kind === "questions" || view.kind === "result" ? live : null
      ) : <>
      {/* M93: Flowflow's live face, in the state it is in, beside the greeting, with at most one short line under it. */}
      <div className="ip-head" role="status" aria-label={S.m93.say(greet, hline?.words ?? null)}>
        <FlowMini className="ip-face" state={m.character} still={!shown} />
        <span className="ip-lead" aria-hidden="true">
          <b className="ip-greet-big" title={greet}>{greet}</b>
          {hline && <span className="ip-line" title={hline.words}><Dot colour={hline.colour} /><span>{hline.words}</span></span>}
        </span>
      </div>
      {/* M93: ONE action that fits the moment, and a quiet Open Home unless the action already is that. */}
      <div className="ip-act-row">
        <Button kind="secondary" size="sm" className="ip-cta" tabIndex={tab} label={action.id === "stop" ? stopSay : undefined} title={action.id === "stop" ? keyHint("stop", S.look.stopKeys) : undefined} onClick={act}>
          {action.id === "stop" ? <Icon name="stop" size={12} /> : <Tile colour={action.look.colour} icon={action.look.icon} size="btn" />}{action.label}
        </Button>
        {hoverSecondary(action) && <button className="ip-home" type="button" tabIndex={tab} onClick={() => { if (ready()) void invoke("island_go", {}).catch(() => {}); }}>{S.m93.openHome}</button>}
      </div>
      </>}
    </div>
  );
});
