import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { answerApproval, approvePlan, askResearch, chooseLoop, diagnose, pauseDrive, resumeDrive, listTasks, planDrive, startTask, stopAgent, undo } from "./commands.ts";
import { blockedNote, characterWords, pausedWords, driveWords, formatUsd, historyWords, isFixing, triesNote, notDoneReason, plainPath, stateLabel } from "./model.ts";
import { invoke, listen } from "./tauri.ts";
import { useModel } from "./useModel.ts";
import { S } from "./strings.ts";
import "./style.css";

const send = (cmd: unknown) => invoke("send_command", { cmd });

function Card() {
  const [m, dispatch] = useModel();
  const root = useRef<HTMLElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState("");
  const [undone, setUndone] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  useEffect(() => { setDraft(m.plan?.steps ?? []); }, [m.plan]);

  useEffect(() => { void invoke("get_project").then((p) => setProject(String(p ?? ""))); }, []);
  // The timeline: ask when the project is known, and again whenever a task ends.
  useEffect(() => { if (project) void send(listTasks(project)); }, [project, m.receipt]);
  useEffect(() => {
    const off = listen("opened", (e) => {
      if ((e.payload as { keyboard?: boolean } | null)?.keyboard) setTimeout(() => box.current?.focus(), 30);
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

  const working = ["thinking", "working", "checking", "needsYou"].includes(m.character);
  const submit = () => {
    const prompt = box.current?.value.trim() ?? "";
    if (!prompt || !project) return;
    setUndone(false);
    void send(startTask(project, prompt));
    if (box.current) box.current.value = "";
  };

  const rescue = () => {
    if (!project) return;
    setUndone(false);
    dispatch({ type: "ui.planRequested" });
    void send(diagnose(project));
  };
  const research = () => {
    const c = askResearch(project, box.current?.value ?? "");
    if (!c || !project) return;
    dispatch({ type: "ui.researchRequested" });
    void send(c);
    if (box.current) box.current.value = "";
  };
  const plan = () => {
    const goal = box.current?.value.trim() ?? "";
    if (!goal || !project) return;
    setUndone(false);
    dispatch({ type: "ui.planRequested" });
    void send(planDrive(project, goal));
    if (box.current) box.current.value = "";
  };

  return (
    <main className="card" ref={root}
      onPointerDown={(e) => void invoke("ui_click", { label: "card:" + (e.target as HTMLElement).tagName })}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); box.current?.blur(); void invoke("close_card"); } }}>
      <div className="row between"><b>{S.characterName}</b><span className="muted">{characterWords(m)}{m.task ? ` · ${formatUsd(m.task.costUsd)}` : ""}</span></div>

      <div className="ask">
        <input ref={box} type="text" autoComplete="off" spellCheck={false} placeholder={S.askPlaceholder} aria-label={S.askPlaceholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
        {working && <button className="btn" type="button" onClick={() => void send(stopAgent())}>{S.stop}</button>}
      </div>
      {!working && (
        <div className="row">
          <button className="btn primary" type="button" onClick={submit}>{S.start}</button>
          <button className="btn" type="button" onClick={plan}>{S.planIt}</button>
          <button className="btn" type="button" onClick={rescue}>{S.rescueIt}</button>
          <button className="btn" type="button" onClick={research}>{S.researchIt}</button>
        </div>
      )}
      {!project && <div className="notice">{S.noProject}</div>}
      {m.notice && <div className="notice">{m.notice}</div>}
      {m.error && <div className="error" role="alert">{m.error}</div>}

      {m.research && (
        <section className="panel" aria-label={m.research.title}>
          <h2>{m.research.title}</h2>
          <div className="line">{m.research.answer}</div>
          <div className="line muted"><b>{S.researchNotes}:</b></div>
          {m.research.notes.map((n, i) => <div className="line" key={i}>{n.text} <span className="muted">{n.source}</span></div>)}
          <div className="line muted">{S.researchFiled} {m.research.file}</div>
          <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.researchClosed" })}>{S.researchClose}</button></div>
        </section>
      )}

      {m.rescue && (
        <section className="panel" aria-label={S.rescueTitle}>
          <h2>{S.rescueTitle}</h2>
          <div className="line">{m.rescue.summary}</div>
          {m.rescue.works.length > 0 && <div className="line"><b>{S.rescueWorks}:</b> {m.rescue.works.join("; ")}</div>}
          <div className="line"><b>{S.rescueBroken}:</b> {m.rescue.broken}</div>
          <div className="line muted"><b>{S.rescueChecks}:</b></div>
          {m.rescue.evidence.map((e, i) => <div className={`line ${e.status === "failed" ? "blocked" : "muted"}`} key={i}>{e.label}: {e.status}{e.detail ? ` ${e.detail}` : ""}</div>)}
        </section>
      )}

      {m.plan && (
        <section className="panel amber" aria-label={S.planTitle}>
          <h2>{S.planTitle}</h2>
          <div className="line muted">{S.planHelp}</div>
          {draft.map((t, i) => (
            <div className="row" key={i}>
              <input type="text" value={t} aria-label={`${S.stepOf} ${i + 1}`} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))} />
              <button className="btn" type="button" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>{S.removeStep}</button>
            </div>
          ))}
          {m.plan.truncated && <div className="line">{S.planTooLong}</div>}
          <div className="line muted">{S.planCost}: {formatUsd(m.plan.estimateUsd)}</div>
          <div className="row">
            <button className="btn primary" type="button" disabled={draft.every((s) => !s.trim())} onClick={() => { void send(approvePlan(draft.map((s) => s.trim()).filter(Boolean))); dispatch({ type: "ui.planCancelled" }); }}>{S.planStart}</button>
            <button className="btn" type="button" onClick={() => dispatch({ type: "ui.planCancelled" })}>{S.planCancel}</button>
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

      {m.stuck && (
        <section className="panel amber" aria-label={S.stuckTitle}>
          <h2>{S.stuckTitle}</h2>
          <div className="line">{S.stepOf} {m.stuck.index}: {m.stuck.title}</div>
          <div className="line muted">{S.stuckHelp}</div>
          <div className="line">{m.stuck.failure}</div>
          <div className="row">
            {m.stuck.options.map((o, i) => (
              <button key={o.id} className={`btn ${i === 0 ? "primary" : ""}`} type="button" onClick={() => { void send(chooseLoop(o.id as "different" | "stop")); dispatch({ type: "ui.stuckAnswered" }); }}>{o.label}</button>
            ))}
          </div>
        </section>
      )}

      {m.drive && (
        <section className="panel">
          <div className="line">{driveWords(m) ?? `${S.stepOf} ${m.drive.index} of ${m.drive.total}: ${m.drive.title}`}</div>
          {!m.drive.finished && !m.paused && <div className="row"><button className="btn" type="button" onClick={() => void send(pauseDrive())}>{S.pauseNow}</button></div>}
        </section>
      )}

      {m.approvals.map((a) => (
        <section className="panel amber" key={a.id} aria-label={S.needsYouTitle}>
          <h2>{S.needsYouTitle}</h2>
          <div className="line">{a.title}</div>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => { void send(answerApproval(a.id, true)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.allow}</button>
            <button className="btn" type="button" onClick={() => { void send(answerApproval(a.id, false)); dispatch({ type: "ui.approvalAnswered", approval: a.id }); }}>{S.dontAllow}</button>
          </div>
        </section>
      ))}

      {m.task && m.task.lines.length > 0 && (
        <section className="panel">
          <h2>{m.task.label.length > 90 ? m.task.label.slice(0, 90) + "..." : m.task.label || "Task"}</h2>
          {m.task.lines.slice(-6).map((l, i) => <div key={i} className={`line ${l.outcome === "blocked" ? "blocked" : ""}`}>{l.outcome === "blocked" ? `${S.blocked}: ` : l.outcome === "needs_approval" ? `${S.waiting}: ` : ""}{plainPath(l.text, project)}</div>)}
        </section>
      )}

      {m.task?.proof && m.task.proof.steps.length > 0 && (
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
        </section>
      )}

      {m.receipt && (
        <section className="panel">
          <h2>{S.receiptTitle}</h2>
          {m.receipt.changed.length === 0 ? <div className="line">{S.nothingChanged}</div> :
            m.receipt.changed.map((c) => <div className="line" key={c.file}>{(S as any)[c.kind] ?? c.kind}: {c.file}</div>)}
          {m.receipt.notUndoable.length > 0 && <div className="line"><b>{S.cannotUndo}:</b> {m.receipt.notUndoable.join("; ")}</div>}
          {m.receipt.changed.length > 0 && <div className="line muted">{m.receipt.proof === "passed" ? S.proven : m.receipt.proof === "failed" ? S.notDone : S.notChecked}</div>}
          {blockedNote(m, project) && <div className="line"><b>{blockedNote(m, project)}</b></div>}
          <div className="line muted">{m.receipt.commands} {S.commands} · {S.cost}: {formatUsd(m.receipt.usdEstimate)}</div>
          {m.receipt.changed.length > 0 && !undone && project && (
            <div className="row"><button className="btn danger" type="button" onClick={() => { void send(undo(project, m.receipt!.checkpoint)); setUndone(true); }}>{S.undo}</button></div>
          )}
          {undone && <div className="line">{S.undone}</div>}
        </section>
      )}

      {project && m.character !== "thinking" && m.character !== "working" && m.character !== "checking" && m.history.length > 0 && (
        <section className="panel" aria-label={S.recentTitle}>
          <h2>{S.recentTitle}</h2>
          {m.history.slice(0, 5).map((h) => (
            <div className="line" key={h.id}>{h.label.length > 50 ? h.label.slice(0, 50) + "..." : h.label} <span className="muted">· {historyWords(h)} · {formatUsd(h.usd)}</span></div>
          ))}
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Card /></StrictMode>);
