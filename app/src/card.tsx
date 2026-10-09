import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { shipLive, shipPreview, shipRollback, answerAgents, askRecap, setExplain, editLine, eraseMemory, exportMemory, forgetLine, listMemory, pauseMemory, checkShip, answerApproval, approvePlan, askResearch, chooseLoop, diagnose, pauseDrive, resumeDrive, listTasks, planDrive, startTask, stopAgent, undo } from "./commands.ts";
import { confirmable, shipWords, phWords, blockedNote, characterWords, savedWords, pausedWords, driveWords, formatUsd, historyWords, isFixing, triesNote, notDoneReason, plainPath, stateLabel } from "./model.ts";
import { invoke, listen } from "./tauri.ts";
import type { Explain, MemoryLine } from "./model.ts";
import { useModel } from "./useModel.ts";
import { S } from "./strings.ts";
import "./style.css";

const send = (cmd: unknown) => invoke("send_command", { cmd });
// When the person last used the card. Kept only on this Mac, in this page's own storage.
const AWAY_MS = 30 * 60 * 1000, SEEN_KEY = "companion.lastSeen";
const lastSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
const touch = () => { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* storage may be unavailable */ } };
// While a person is composing text (Japanese, Chinese, Korean...) Enter and Esc belong to the input method, not to us.
const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

function ExplainBox({ e }: { e: Explain }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <details className="explain">
      <summary>{S.explainTitle} <span className="muted">· {S.explainCost}</span></summary>
      <ul>{e.bullets.map((b, i) => <li className="line" key={i}>{b}</li>)}</ul>
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

function OnlineBox({ f, project, onClose }: { f: { stage: string; detail: string; previewUrl?: string; productionUrl?: string; canGoLive?: boolean }; project: string; onClose: () => void }) {
  const [ask, setAsk] = useState<"live" | "back" | null>(null);
  const busy = ["checking_gates", "deploying", "checking_preview"].includes(f.stage);
  return (
    <section className={`panel ${f.stage === "failed" || f.stage === "refused" || f.stage === "not_signed_in" ? "amber" : ""}`} role="status" aria-label={S.onlineTitle}>
      <h2>{S.onlineTitle}</h2>
      <div className="line">{f.detail}</div>
      {f.previewUrl && <div className="line muted">Preview: {f.previewUrl}</div>}
      {f.productionUrl && <div className="line"><b>Live: {f.productionUrl}</b></div>}
      {f.stage === "ready" && f.canGoLive && ask !== "live" && <div className="row"><button className="btn primary" type="button" onClick={() => setAsk("live")}>{S.makeLive}</button></div>}
      {ask === "live" && f.previewUrl && (
        <div className="row" role="alert">
          <span className="line">{S.liveSure}</span>
          <button className="btn primary" type="button" onClick={() => { void send(shipLive(project, f.previewUrl!)); setAsk(null); }}>{S.liveYes}</button>
          <button className="btn" type="button" onClick={() => setAsk(null)}>{S.planCancel}</button>
        </div>
      )}
      {f.stage === "live" && ask !== "back" && <div className="row"><button className="btn" type="button" onClick={() => setAsk("back")}>{S.rollBack}</button></div>}
      {ask === "back" && (
        <div className="row" role="alert">
          <span className="line">{S.rollSure}</span>
          <button className="btn primary" type="button" onClick={() => { void send(shipRollback(project)); setAsk(null); }}>{S.rollYes}</button>
          <button className="btn" type="button" onClick={() => setAsk(null)}>{S.planCancel}</button>
        </div>
      )}
      {!busy && <div className="row"><button className="btn" type="button" onClick={onClose}>{S.onlineClose}</button></div>}
    </section>
  );
}

function MemoryList({ title, scope, lines, project }: { title: string; scope: "project" | "profile"; lines: MemoryLine[]; project: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sure, setSure] = useState(false);
  return (
    <div>
      <h2>{title}</h2>
      {lines.length === 0 && <div className="line muted">{S.memoryEmpty}</div>}
      {lines.map((l) => (
        <div className="line" key={l.id}>
          {editing === l.id ? (
            <div className="row">
              <input type="text" value={text} aria-label={`${S.memoryEdit}: ${l.text}`} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { void send(editLine(project, scope, l.id, text)); setEditing(null); } if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
              <button className="btn" type="button" onClick={() => { void send(editLine(project, scope, l.id, text)); setEditing(null); }}>{S.memorySave}</button>
            </div>
          ) : (
            <>
              {l.text} <span className="muted">· {S.memoryFrom} {l.source}{l.date ? `, ${l.date}` : ""}</span>
              <span className="row">
                <button className="btn" type="button" aria-label={`${S.memoryEdit}: ${l.text}`} onClick={() => { setEditing(l.id); setText(l.text); }}>{S.memoryEdit}</button>
                <button className="btn danger" type="button" aria-label={`${S.memoryForget}: ${l.text}`} onClick={() => void send(forgetLine(project, scope, l.id))}>{S.memoryForget}</button>
              </span>
            </>
          )}
        </div>
      ))}
      {lines.length > 0 && !sure && <div className="row"><button className="btn" type="button" aria-label={`${S.memoryErase}: ${title}`} onClick={() => setSure(true)}>{S.memoryErase}</button></div>}
      {sure && (
        <div className="row" role="alert">
          <span className="line">{S.memoryEraseSure}</span>
          <button className="btn danger" type="button" onClick={() => { void send(eraseMemory(project, scope)); setSure(false); }}>{S.memoryEraseYes}</button>
          <button className="btn" type="button" onClick={() => setSure(false)}>{S.planCancel}</button>
        </div>
      )}
    </div>
  );
}

function Card() {
  const [m, dispatch] = useModel();
  const root = useRef<HTMLElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState("");
  const [undone, setUndone] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [off, setOff] = useState(false);
  // The "remembered" toast stays for ten seconds after the last new line.
  useEffect(() => {
    if (!m.toast) return;
    const t = setTimeout(() => dispatch({ type: "ui.toastClear" }), 10000);
    return () => clearTimeout(t);
  }, [m.toast?.lines.length]);
  useEffect(() => { setDraft(m.plan?.steps ?? []); }, [m.plan]);
  useEffect(() => { setUndone(false); }, [m.receipt?.checkpoint]);
  // A question that needs the person moves keyboard focus to its first button, but only when this card already has the keyboard.
  const urgent = useRef<HTMLDivElement>(null);
  const urgentKey = m.approvals[0]?.id ?? (m.agentsAsk ? "agents" : m.stuck ? "stuck" : m.paused ? "paused" : m.plan ? "plan" : "");
  useEffect(() => {
    if (!urgentKey || !document.hasFocus()) return;
    urgent.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [urgentKey]);

  const [recent, setRecent] = useState<string[]>([]);
  const [folderNote, setFolderNote] = useState("");
  const loadRecent = () => void invoke("list_projects").then((l) => setRecent(Array.isArray(l) ? (l as string[]) : []));
  useEffect(() => { void invoke("get_project").then((p) => setProject(String(p ?? ""))); loadRecent(); }, []);
  useEffect(() => {
    const off = listen("project-changed", (e) => { setProject(String(e.payload ?? "")); dispatch({ type: "ui.projectChanged" }); setFolderNote(""); loadRecent(); });
    return () => { off.then((f) => f()); };
  }, []);
  const useFolder = (path: string) => void invoke("use_project", { path }).catch((e) => setFolderNote(String(e)));
  const pickFolder = () => void invoke("pick_project").catch((e) => { if (String(e)) setFolderNote(String(e)); });
  // The timeline: ask when the project is known, and again whenever a task ends.
  useEffect(() => { if (project) void send(listTasks(project)); }, [project, m.receipt]);
  useEffect(() => {
    const off = listen("opened", (e) => {
      if ((e.payload as { keyboard?: boolean } | null)?.keyboard) setTimeout(() => box.current?.focus(), 30);
      // Coming back after a break: ask what happened while away. Only Companion's own history is used.
      const last = lastSeen();
      if (last && project && Date.now() - last >= AWAY_MS) void send(askRecap(project, new Date(last).toISOString()));
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

  // Show me how: the engine chose a point in the picture; the Mac side snaps it to a real button and draws the pointer.
  const [walk, setWalk] = useState<{ goal: string; steps: string[] } | null>(null);
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; req?: string; x?: number; y?: number; ocrId?: string; targetText?: string; caption?: string };
      if (ev.type === "assist.point" && ev.req?.startsWith("sm_")) {
        void invoke("showme_aim", { req: ev.req, x: ev.x, y: ev.y, ocrId: ev.ocrId ?? null, targetText: ev.targetText ?? "", caption: ev.caption ?? "" });
        setWalk((w) => (w ? { ...w, steps: [...w.steps, ev.caption ?? ""] } : w));
      }
    });
    return () => { off.then((f) => f()); };
  }, []);
  const showMe = (question: string, goal: string, steps: string[]) => { setWalk({ goal, steps }); void invoke("showme_start", { question }); };
  const working = ["thinking", "working", "checking", "needsYou"].includes(m.character);
  const submit = () => {
    const prompt = box.current?.value.trim() ?? "";
    if (!prompt || !project) return;
    setUndone(false);
    void send(startTask(project, prompt, off)); setOff(false);
    if (box.current) box.current.value = "";
  };

  const rescue = () => {
    if (!project) return;
    setUndone(false);
    dispatch({ type: "ui.planRequested" });
    void send(diagnose(project));
  };
  // When the improved text is ready, tell the app so Use it can paste it (nothing is stored on disk).
  useEffect(() => {
    if (m.ph?.stage === "ready" && m.ph.text) void invoke("ph_ready", { text: m.ph.text, handback: m.ph.handback ?? "paste" });
  }, [m.ph?.stage, m.ph?.text]);
  const shipIt = (o: { runChecks?: boolean; confirm?: string[] } = {}) => { if (!project) return; dispatch({ type: "ui.planRequested" }); void send(checkShip(project, { runChecks: true, ...o })); };
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
    void send(planDrive(project, goal, off)); setOff(false);
    if (box.current) box.current.value = "";
  };

  return (
    <main className="card" ref={root}
      onPointerDown={(e) => { touch(); void invoke("ui_click", { label: "card:" + (e.target as HTMLElement).tagName }); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !composing(e)) { e.preventDefault(); box.current?.blur(); void invoke("close_card"); } }}>
      <div className="row between"><b>{S.characterName}</b><span className="muted" role="status" aria-live="polite">{characterWords(m)}{m.task ? ` · ${formatUsd(m.task.costUsd)}` : ""}</span></div>

      <div className="row" aria-label={S.folderLabel}>
        <span className="muted">{S.folderLabel}: <b title={project}>{project ? project.split("/").filter(Boolean).slice(-2).join("/") : "-"}</b></span>
        <button className="btn" type="button" onClick={pickFolder}>{S.folderChange}</button>
        {recent.length > 1 && (
          <select aria-label={S.folderRecent} value="" onChange={(e) => { if (e.target.value) useFolder(e.target.value); }}>
            <option value="">{S.folderRecent}</option>
            {recent.filter((r) => r !== project).map((r) => <option key={r} value={r}>{r.split("/").filter(Boolean).slice(-2).join("/")}</option>)}
          </select>
        )}
      </div>
      {folderNote && <div className="error" role="alert">{folderNote}</div>}
      <div className="ask">
        <input ref={box} type="text" autoComplete="off" spellCheck={false} placeholder={S.askPlaceholder} aria-label={S.askPlaceholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !composing(e)) { e.preventDefault(); submit(); } }} />
        {working && <button className="btn" type="button" onClick={() => void send(stopAgent())}>{S.stop}</button>}
      </div>
      {!working && (
        <div className="row">
          <button className="btn primary" type="button" onClick={submit}>{S.start}</button>
          <button className="btn" type="button" onClick={plan}>{S.planIt}</button>
          <button className="btn" type="button" onClick={rescue}>{S.rescueIt}</button>
          <button className="btn" type="button" onClick={research}>{S.researchIt}</button>
          <button className="btn" type="button" onClick={() => shipIt()}>{S.shipCheck}</button>
          <button className="btn" type="button" onClick={() => { if (project) { dispatch({ type: "ui.planRequested" }); void send(shipPreview(project)); } }}>{S.onlineButton}</button>
          <button className="btn" type="button" onClick={() => { const q = box.current?.value.trim() ?? ""; if (q) { showMe(q, q, []); } else dispatch({ type: "app.showme", stage: "error", message: S.showMeHint }); }}>{S.showMe}</button>
          <button className="btn" type="button" onClick={() => { if (project) void send(listMemory(project)); }}>{S.memoryButton}</button>
        </div>
      )}
      {!working && (
        <label className="check"><input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> {S.offRecord}</label>
      )}
      {!project && <div className="notice">{S.folderNone}</div>}
      {m.notice && <div className="notice" role="status">{m.notice}</div>}
      {m.error && <div className="error" role="alert">{m.error}</div>}

      <div ref={urgent}>
      {m.agentsAsk && (
        <section className="panel amber" role="alert" aria-label={S.agentsTitle}>
          <h2>{S.agentsTitle}</h2>
          <div className="line">{S.agentsAsk} {m.agentsAsk.join(" and ")}. {S.agentsAskEnd}</div>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => { void send(answerAgents(project, "yes")); dispatch({ type: "ui.agentsAnswered" }); }}>{S.agentsYes}</button>
            <button className="btn" type="button" onClick={() => { void send(answerAgents(project, "no")); dispatch({ type: "ui.agentsAnswered" }); }}>{S.agentsNo}</button>
          </div>
        </section>
      )}
      {m.approvals.map((a) => (
        <section className="panel amber" key={a.id} role="alert" aria-label={S.needsYouTitle}>
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

      </div>
      {m.ph && (
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
              <div className="line muted">{S.phHotkeys}</div>
            </>
          )}
          {(m.ph.stage === "pasted") && <div className="row"><button className="btn" type="button" onClick={() => void invoke("ph_restore")}>{S.phRestore}</button></div>}
          {["refused", "error", "nothing_to_read", "needs_accessibility", "copied", "restored", "pasted"].includes(m.ph.stage) && <div className="row"><button className="btn" type="button" onClick={() => void invoke("ph_dismiss")}>{S.phDismiss}</button></div>}
        </section>
      )}

      {m.drive && (
        <section className="panel">
          <div className="line">{driveWords(m) ?? `${S.stepOf} ${m.drive.index} of ${m.drive.total}: ${m.drive.title}`}</div>
          {!m.drive.finished && !m.paused && <div className="row"><button className="btn" type="button" onClick={() => void send(pauseDrive())}>{S.pauseNow}</button></div>}
        </section>
      )}

      {m.shipFlow && <OnlineBox f={m.shipFlow} project={project} onClose={() => dispatch({ type: "ui.shipClosed" })} />}

      {m.ship && (
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
          <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.planCancelled" })}>{S.closeFinished}</button></div>
        </section>
      )}

      {m.task && m.task.lines.length > 0 && (
        <section className="panel" aria-live="polite">
          <h2>{m.task.label || "Task"}</h2>
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
          {m.explain && m.explain.checkpoint === m.receipt.checkpoint && <ExplainBox e={m.explain} key={m.explain.checkpoint} />}
        </section>
      )}


      {m.showme && (
        <section className={`panel ${m.showme.stage === "error" || m.showme.stage === "needs_permission" ? "amber" : ""}`} role="status" aria-label={S.showMe}>
          <h2>{S.showMe}</h2>
          <div className="line">{m.showme.message}</div>
          {["pointing", "pointing_roughly"].includes(m.showme.stage) && walk && (
            <div className="row">
              <button className="btn primary" type="button" onClick={() => showMe(`${walk.goal}. So far I did: ${walk.steps.join("; ")}. What is the next step?`, walk.goal, walk.steps)}>{S.showMeNext}</button>
              <button className="btn" type="button" onClick={() => { void invoke("showme_clear"); setWalk(null); }}>{S.showMeDone}</button>
            </div>
          )}
          {["error", "needs_permission"].includes(m.showme.stage) && <div className="row"><button className="btn" type="button" onClick={() => { void invoke("showme_clear"); setWalk(null); }}>{S.onlineClose}</button></div>}
        </section>
      )}

      {m.recap && (
        <section className="panel" role="status" aria-label={S.recapTitle}>
          <h2>{S.recapTitle}</h2>
          {m.recap.lines.map((l, i) => <div className="line" key={i}>{l}</div>)}
          <div className="line muted">{S.recapSource}</div>
          <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.recapClosed" })}>{S.recapClose}</button></div>
        </section>
      )}

      {m.toast && (
        <section className="panel" role="status" aria-label={S.memoryTitle}>
          <div className="line">{savedWords(m)}</div>
          <div className="row">
            <button className="btn" type="button" onClick={() => { for (const l of m.toast!.lines) void send(forgetLine(project, l.scope, l.id)); dispatch({ type: "ui.toastClear" }); }}>{S.memoryUndo}</button>
            <button className="btn" type="button" onClick={() => { dispatch({ type: "ui.toastClear" }); void send(listMemory(project)); }}>{S.memorySeeAll}</button>
          </div>
        </section>
      )}

      {m.memory && (
        <section className="panel" aria-label={S.memoryTitle}>
          <h2>{S.memoryTitle}</h2>
          <div className="line muted">{S.memoryNever}</div>
          {m.memory.paused && <div className="line"><b>{S.memoryPaused}</b></div>}
          {m.memory.problems.map((p, i) => <div className="line blocked" key={i}>{p}</div>)}
          {m.memoryNote && <div className="line blocked" role="alert">{m.memoryNote}</div>}
          <MemoryList title={S.memoryProject} scope="project" lines={m.memory.projectLines} project={project} />
          <MemoryList title={S.memoryProfile} scope="profile" lines={m.memory.profileLines} project={project} />
          <div className="row">
            <button className="btn" type="button" onClick={() => void send(pauseMemory(project, !m.memory!.paused))}>{m.memory.paused ? S.memoryResume : S.memoryPause}</button>
            <button className="btn" type="button" aria-pressed={m.explainOn} onClick={() => void send(setExplain(project, !m.explainOn))}>{S.explainSetting}: {m.explainOn ? "on" : "off"}</button>
            <button className="btn" type="button" onClick={() => void send(exportMemory(project))}>{S.memoryExport}</button>
            <button className="btn" type="button" onClick={() => void send(answerAgents(project, "remove"))}>{S.agentsRemove}</button>
            <button className="btn" type="button" onClick={() => dispatch({ type: "ui.memoryClosed" })}>{S.memoryClose}</button>
          </div>
          {m.exported && <textarea className="export" readOnly value={m.exported} aria-label={S.memoryExport} rows={8} />}
        </section>
      )}
      {project && m.character !== "thinking" && m.character !== "working" && m.character !== "checking" && m.history.length > 0 && (
        <section className="panel" aria-label={S.recentTitle}>
          <h2>{S.recentTitle}</h2>
          {m.history.slice(0, 5).map((h) => (
            <div className="line" key={h.id}>{h.label} <span className="muted">· {historyWords(h)} · {formatUsd(h.usd)}</span></div>
          ))}
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Card /></StrictMode>);
