import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { answerApproval, startTask, stopAgent, undo } from "./commands.ts";
import { formatUsd, plainPath, stateLabel } from "./model.ts";
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

  useEffect(() => { void invoke("get_project").then((p) => setProject(String(p ?? ""))); }, []);
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

  return (
    <main className="card" ref={root}
      onPointerDown={(e) => void invoke("ui_click", { label: "card:" + (e.target as HTMLElement).tagName })}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); box.current?.blur(); void invoke("close_card"); } }}>
      <div className="row between"><b>{S.characterName}</b><span className="muted">{stateLabel(m.character)}{m.task ? ` · ${formatUsd(m.task.costUsd)}` : ""}</span></div>

      <div className="ask">
        <input ref={box} type="text" autoComplete="off" spellCheck={false} placeholder={S.askPlaceholder} aria-label={S.askPlaceholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
        {working ? <button className="btn" type="button" onClick={() => void send(stopAgent())}>{S.stop}</button>
                 : <button className="btn primary" type="button" onClick={submit}>{S.start}</button>}
      </div>
      {!project && <div className="notice">{S.noProject}</div>}
      {m.notice && <div className="notice">{m.notice}</div>}
      {m.error && <div className="error" role="alert">{m.error}</div>}

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

      {m.receipt && (
        <section className="panel">
          <h2>{S.receiptTitle}</h2>
          {m.receipt.changed.length === 0 ? <div className="line">{S.nothingChanged}</div> :
            m.receipt.changed.map((c) => <div className="line" key={c.file}>{(S as any)[c.kind] ?? c.kind}: {c.file}</div>)}
          {m.receipt.notUndoable.length > 0 && <div className="line"><b>{S.cannotUndo}:</b> {m.receipt.notUndoable.join("; ")}</div>}
          <div className="line muted">{m.receipt.commands} {S.commands} · {S.cost}: {formatUsd(m.receipt.usdEstimate)}</div>
          {m.receipt.changed.length > 0 && !undone && project && (
            <div className="row"><button className="btn danger" type="button" onClick={() => { void send(undo(project, m.receipt!.checkpoint)); setUndone(true); }}>{S.undo}</button></div>
          )}
          {undone && <div className="line">{S.undone}</div>}
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Card /></StrictMode>);
