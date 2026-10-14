import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { reactionsOn, setReactions } from "./reactions.ts";
import { DELETE_PHRASE, deletableLines, numbersLines, type NumbersSummary, permissionLesson, permissionRow, type Inventory, type PermissionKind, type PermissionState } from "./settings.ts";
import { layoutDiagram } from "./layout.ts";
import { answered, atLimit, nextQuestion } from "./anywhere.ts";
import { aimDecision, notSureWords } from "./pointer.ts";
import { lineFor, setSpeech, speechOn } from "./speech.ts";
import { NO_PROJECT, metricsErase, metricsNote, metricsSet, metricsShow, walkActed, walkAnswer, walkList, walkSkip, walkStart, walkStop, startPractice as practiceFixCommand, askDiagram, inspectProject, installPackages, findProblem, shipLive, shipPreview, shipRollback, answerAgents, askRecap, setExplain, editLine, eraseMemory, exportMemory, forgetLine, listMemory, pauseMemory, checkShip, answerApproval, approvePlan, askResearch, chooseLoop, diagnose, pauseDrive, resumeDrive, listTasks, planDrive, startTask, stopAgent, undo } from "./commands.ts";
import { confirmable, shipWords, phWords, blockedNote, characterWords, savedWords, pausedWords, driveWords, formatUsd, historyWords, isFixing, triesNote, notDoneReason, plainPath, stateLabel } from "./model.ts";
import { invoke, listen } from "./tauri.ts";
import type { Explain, MemoryLine } from "./model.ts";
import { Onboarding } from "./onboarding.tsx";
import { autoCheckDue, canInstall, isBusy, updateLine, type UpdateState } from "./updates.ts";
import { useModel } from "./useModel.ts";
import { S } from "./strings.ts";
import "./style.css";

const send = (cmd: unknown) => invoke("send_command", { cmd });
// Beta numbers: a fixed name, counted only if the person turned numbers on.
// An update the daily check found, kept so Settings can offer Install without asking again.
let foundUpdate: UpdateState | null = null;
const SESSION_GAP_MS = 30 * 60 * 1000;
const count = (name: string) => { void send(metricsNote(name)); };
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

function SettingsPanel({ working, explainOn, project, fun, setFun, autoSend, setAutoSend, onClose, onPractice, onLesson }: { working: boolean; onLesson: (lesson: string) => void; onPractice: () => void; explainOn: boolean; project: string; fun: boolean; setFun: (v: boolean) => void; autoSend: boolean; setAutoSend: (v: boolean) => void; onClose: () => void }) {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [perms, setPerms] = useState<Record<PermissionKind, PermissionState> | null>(null);
  const [step, setStep] = useState<"idle" | "confirm" | "deleting">("idle");
  const [withProjects, setWithProjects] = useState(false);
  const [problem, setProblem] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState("");
  const [speak, setSpeak] = useState(speechOn);
  const [up, setUp] = useState<UpdateState>(foundUpdate ?? { stage: "idle" });
  const [upInfo, setUpInfo] = useState<{ configured: boolean; version: string }>({ configured: false, version: "" });
  const [upAuto, setUpAuto] = useState(() => { try { return localStorage.getItem("companion.updateAuto") !== "0"; } catch { return true; } });
  useEffect(() => { void invoke("update_status").then((v) => setUpInfo(v as { configured: boolean; version: string })).catch(() => {}); }, []);
  const checkNow = () => {
    setUp({ stage: "checking" });
    void invoke("check_update").then((v) => {
      try { localStorage.setItem("companion.updateChecked", String(Date.now())); } catch { /* storage may be unavailable */ }
      const r = v as { available: boolean; version?: string; notes?: string };
      foundUpdate = r.available ? { stage: "found", version: r.version ?? "", notes: r.notes ?? "" } : null;
      setUp(foundUpdate ?? { stage: "none" });
    }).catch((e) => setUp({ stage: "failed", reason: String(e) }));
  };
  const installNow = () => { if (!canInstall(working)) return; setUp({ stage: "installing" }); foundUpdate = null; void invoke("install_update").catch((e) => setUp({ stage: "failed", reason: String(e) })); };
  const [nums, setNums] = useState<NumbersSummary | null>(null);
  const [showNums, setShowNums] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void send(metricsShow());
    const off = listen("runner-event", (e) => { const ev = e.payload as { type?: string } & Partial<NumbersSummary>; if (ev.type === "metrics.summary") setNums({ enabled: !!ev.enabled, totals: ev.totals ?? {}, rates: ev.rates ?? {} }); });
    return () => { off.then((f) => f()); };
  }, []);
  const load = () => { void invoke("data_inventory").then((v) => setInv(v as Inventory)); void invoke("permission_overview").then((v) => setPerms(v as Record<PermissionKind, PermissionState>)); };
  useEffect(load, []);
  // The permission page is where the person changes things; coming back should show the new state.
  useEffect(() => { const f = () => load(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  const busy = useRef(false);   // a second click while macOS is asking must not start a second delete
  const remove = () => {
    if (busy.current) return;
    busy.current = true; setStep("deleting"); setProblem("");
    void invoke("delete_everything", { confirm: DELETE_PHRASE, withProjects }).catch((e) => { busy.current = false; setProblem(String(e)); setStep("confirm"); });
  };
  return (
    <section className="panel" aria-label={S.settingsTitle}>
      <h2>{S.settingsTitle}</h2>
      <h3>{S.settingsPermissions}</h3>
      <div className="line muted">{S.settingsPermissionsHelp}</div>
      {perms && (["screen_recording", "accessibility", "microphone"] as PermissionKind[]).map((k) => {
        const r = permissionRow(k, perms[k]);
        return (
          <div className="line" key={k}>
            <b>{r.label}:</b> {r.state}. <span className="muted">{r.why}</span>
            {r.button && <> <button className="btn" type="button" onClick={() => void invoke("open_permission_page", { which: k })}>{S.settingsOpenSystem}</button> <button className="btn" type="button" onClick={() => onLesson(permissionLesson(k))}>{S.settingsWalkMe}</button></>}
          </div>
        );
      })}
      <h3>{S.settingsChoices}</h3>
      <div className="row">
        <button className="btn" type="button" aria-pressed={fun} onClick={() => { setReactions(!fun); setFun(!fun); }}>{S.reactionsSetting}: {fun ? "on" : "off"}</button>
        <button className="btn" type="button" aria-pressed={explainOn} disabled={!project} onClick={() => void send(setExplain(project, !explainOn))}>{S.explainSetting}: {explainOn ? "on" : "off"}</button>
        <button className="btn" type="button" aria-pressed={autoSend} onClick={() => setAutoSend(!autoSend)}>{S.voiceAutoSendShort}: {autoSend ? "on" : "off"}</button>
      </div>
      <div className="row"><button className="btn" type="button" onClick={onPractice}>{S.practiceAgainFromSettings}</button></div>
      <h3>{S.settingsKept}</h3>
      {inv && inv.items.length === 0 && !inv.keySaved && <div className="line muted">{S.settingsNothingKept}</div>}
      {inv && deletableLines(inv).map((l, i) => <div className="line" key={i}>{l}</div>)}
      <h3>{S.speakTitle}</h3>
      <div className="line muted">{S.speakHelp}</div>
      <div className="row"><button className="btn" type="button" aria-pressed={speak} onClick={() => { const v = !speak; setSpeak(v); setSpeech(v); if (!v) void invoke("speak_stop"); }}>{S.speakSetting}: {speak ? "on" : "off"}</button></div>
      <h3>{S.updatesTitle}</h3>
      <div className="line muted">{S.updatesHelp}</div>
      <div className="line" role="status">{updateLine(up, upInfo.version, upInfo.configured)}</div>
      {up.stage === "found" && up.notes && <div className="line muted">{up.notes}</div>}
      {upInfo.configured && <div className="row">
        <button className="btn" type="button" disabled={up.stage === "checking" || up.stage === "installing"} onClick={checkNow}>{S.updatesCheck}</button>
        {up.stage === "found" && <button className="btn primary" type="button" disabled={!canInstall(working)} onClick={installNow}>{S.updatesInstall}</button>}
        <button className="btn" type="button" aria-pressed={upAuto} onClick={() => { const v = !upAuto; setUpAuto(v); try { localStorage.setItem("companion.updateAuto", v ? "1" : "0"); } catch { /* storage may be unavailable */ } }}>{S.updatesAuto}: {upAuto ? "on" : "off"}</button>
      </div>}
      {up.stage === "found" && !canInstall(working) && <div className="line muted">{S.updatesBusy}</div>}
      <h3>{S.numbersTitle}</h3>
      <div className="line muted">{S.numbersHelp}</div>
      <div className="row">
        <button className="btn" type="button" aria-pressed={!!nums?.enabled} disabled={!nums} onClick={() => void send(metricsSet(!nums?.enabled))}>{S.numbersOn}: {nums?.enabled ? "on" : "off"}</button>
        <button className="btn" type="button" onClick={() => { setShowNums((v) => !v); void send(metricsShow()); }}>{S.numbersShow}</button>
        {nums && showNums && <button className="btn" type="button" onClick={() => { setCopied(false); void (navigator.clipboard?.writeText(numbersLines(nums).join("\n")) ?? Promise.reject(new Error("no clipboard"))).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {}); }}>{copied ? S.numbersCopied : S.numbersCopy}</button>}
        <button className="btn" type="button" onClick={() => { setShowNums(false); void send(metricsErase()); }}>{S.numbersErase}</button>
      </div>
      {nums && showNums && numbersLines(nums).map((l, i) => <div className="line" key={i}>{l}</div>)}
      <h3>{S.exportLogsTitle}</h3>
      <div className="line muted">{S.exportLogsHelp}</div>
      <div className="row"><button className="btn" type="button" disabled={exporting} onClick={() => { setExporting(true); setExported(""); void invoke("export_logs").then((n) => setExported(S.exportLogsDone.replace("{name}", String(n)))).catch((e) => setExported(String(e))).finally(() => setExporting(false)); }}>{S.exportLogs}</button></div>
      {exported && <div className="line" role="status">{exported}</div>}
      {step === "idle" && <div className="row"><button className="btn danger" type="button" onClick={() => setStep("confirm")}>{S.deleteEverything}</button></div>}
      {step !== "idle" && (
        <div className="line" role="alert">
          <b>{S.deleteSure}</b>
          <div className="line">{S.deleteExplain}</div>
          {inv && inv.projectsWithNotes > 0 && <label className="check"><input type="checkbox" checked={withProjects} onChange={(e) => setWithProjects(e.target.checked)} /> {S.deleteProjects.replace("{n}", String(inv.projectsWithNotes))}</label>}
          <div className="row">
            <button className="btn danger" type="button" disabled={step === "deleting"} onClick={remove}>{step === "deleting" ? S.deleting : S.deleteYes}</button>
            <button className="btn" type="button" disabled={step === "deleting"} onClick={() => setStep("idle")}>{S.planCancel}</button>
          </div>
          {problem && <div className="error" role="alert">{problem}</div>}
        </div>
      )}
      <div className="row"><button className="btn" type="button" onClick={onClose}>{S.onlineClose}</button></div>
    </section>
  );
}

function OnlineBox({ f, project, onClose }: { f: { stage: string; detail: string; previewUrl?: string; productionUrl?: string; canGoLive?: boolean; card?: { image: string; url: string; title: string } }; project: string; onClose: () => void }) {
  const [ask, setAsk] = useState<"live" | "back" | null>(null);
  const [shared, setShared] = useState("");
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
      {f.stage === "live" && f.card && (
        <figure className="receipt-shot">
          <img src={`data:image/jpeg;base64,${f.card.image}`} alt={`${f.card.title} ${S.isLive}`} />
          <div className="row">
            <button className="btn primary" type="button" onClick={() => void invoke("save_share_card", { image: f.card!.image, title: f.card!.title }).then((n) => setShared(`${S.savedTo} ${String(n)}`)).catch((e) => setShared(String(e)))}>{S.savePicture}</button>
            <button className="btn" type="button" onClick={() => void invoke("copy_link", { url: f.card!.url }).then(() => setShared(S.linkCopied)).catch((e) => setShared(String(e)))}>{S.copyLink}</button>
          </div>
          {shared && <div className="line muted" role="status">{shared}</div>}
        </figure>
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
  // The first run: shown until finished, remembered only on this Mac.
  const [onboarded, setOnboarded] = useState(() => { try { return localStorage.getItem("companion.onboarded") === "1"; } catch { return true; } });
  const pendingPrompt = useRef<string | null>(null);
  useEffect(() => { if (onboarded && pendingPrompt.current && box.current) { box.current.value = pendingPrompt.current; box.current.focus(); pendingPrompt.current = null; } }, [onboarded]);
  const finishOnboarding = () => { try { localStorage.setItem("companion.onboarded", "1"); } catch { /* storage may be unavailable */ } setOnboarded(true); };
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
    const off = listen("project-changed", (e) => { setProject(String(e.payload ?? "")); dispatch({ type: "ui.projectChanged", project: String(e.payload ?? "") }); setFolderNote(""); loadRecent(); });
    return () => { off.then((f) => f()); };
  }, []);
  // The practice project: copied into a new folder, chosen as the project, and followed step by step.
  const practiceBusy = useRef(false);
  const beginPractice = () => {
    if (practiceBusy.current) return;   // one practice folder per press
    practiceBusy.current = true;
    void invoke("create_practice").then((p) => dispatch({ type: "ui.practiceStarted", project: String(p) })).catch((e) => setFolderNote(String(e))).finally(() => { practiceBusy.current = false; });
  };
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
  // Spoken replies: only if turned on, one line per thing shown, and never for anything the person did not ask for.
  const saidKey = useRef("");
  const spoken = lineFor({ walk: m.walk, showme: m.showme });
  useEffect(() => {
    if (!spoken || spoken.key === saidKey.current || !speechOn()) return;
    saidKey.current = spoken.key;
    void invoke("speak", { text: spoken.text }).catch(() => {});
  }, [spoken?.key]);
  // The daily update check: only looks, never installs. Off if the person turned it off or updates are not set up.
  useEffect(() => {
    let last: number | null = null, enabled = true;
    try { const v = localStorage.getItem("companion.updateChecked"); last = v ? Number(v) : null; enabled = localStorage.getItem("companion.updateAuto") !== "0"; } catch { /* storage may be unavailable */ }
    void invoke("update_status").then((v) => {
      if (!autoCheckDue({ configured: !!(v as { configured?: boolean }).configured, enabled, lastMs: last, nowMs: Date.now() })) return;
      return invoke("check_update").then((r) => {
        try { localStorage.setItem("companion.updateChecked", String(Date.now())); } catch { /* storage may be unavailable */ }   // a failed or offline check is tried again next time
        const f = r as { available?: boolean; version?: string; notes?: string };
        if (f.available) { foundUpdate = { stage: "found", version: f.version ?? "", notes: f.notes ?? "" }; dispatch({ type: "app.notice", message: S.updatesReady }); }
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
      if ((e.payload as { keyboard?: boolean } | null)?.keyboard) setTimeout(() => box.current?.focus(), 30);
      // Coming back after a break: ask what happened while away. Only Companion's own history is used.
      const last = lastSeen();
      if (last && project && Date.now() - last >= AWAY_MS) void send(askRecap(project, new Date(last).toISOString()));
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

  // Show me how: the engine chose a point in the picture; the Mac side snaps it to a real button and draws the pointer.
  const [walk, setWalk] = useState<{ goal: string; steps: string[] } | null>(null);
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; req?: string; x?: number; y?: number; ocrId?: string; targetText?: string; caption?: string; confidence?: number };
      if (ev.type === "assist.point" && ev.req?.startsWith("sm_") && aimDecision(ev.confidence) === "words") {
        // A guess is not drawn: say in words where to look, and clear what was waiting for an answer.
        void invoke("showme_clear").then(() => dispatch({ type: "app.showme", stage: "not_sure", message: notSureWords(ev.targetText ?? "", ev.caption ?? "") }));
        return;
      }
      if (ev.type === "assist.point" && ev.req?.startsWith("sm_")) {
        void invoke("showme_aim", { req: ev.req, x: ev.x, y: ev.y, ocrId: ev.ocrId ?? null, targetText: ev.targetText ?? "", caption: ev.caption ?? "" });
        setWalk((w) => (w ? { ...w, steps: [...w.steps, ev.caption ?? ""] } : w));
      }
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Point at the problem: the key checks the project; when a place comes back, the pointer flies there.
  const projectRef = useRef(project); projectRef.current = project;
  useEffect(() => {
    const offKey = listen("find-problem", () => {
      if (!projectRef.current) { dispatch({ type: "app.showme", stage: "error", message: S.pointNoProject }); return; }
      dispatch({ type: "ui.findProblem" }); count("hero_press"); count("builder_use");
      void send(findProblem(projectRef.current));
    });
    const offFound = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; verdict?: string; problem?: unknown; project?: string };
      if (ev.type === "problem.found" && ev.verdict === "failed" && ev.problem && ev.project === projectRef.current) void invoke("point_problem", { project: ev.project, problem: ev.problem });
    });
    return () => { offKey.then((f) => f()); offFound.then((f) => f()); };
  }, []);
  // Hold to talk: the words come back as text, are put in the box, and are sent only if the person turned auto send on.
  // Reactions and celebrations: one setting for the whole app, on unless turned off.
  const [fun, setFun] = useState(reactionsOn);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSend, setAutoSend] = useState(() => { try { return localStorage.getItem("companion.voiceAutoSend") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("companion.voiceAutoSend", autoSend ? "1" : "0"); } catch { /* storage may be unavailable */ } }, [autoSend]);
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; stage?: string; text?: string };
      if (ev.type === "app.voice" && ev.stage === "heard" && ev.text) {
        if (box.current) box.current.value = ev.text;
        if (askModeRef.current === "showme") { showMeRef.current(ev.text, ev.text, []); setAskMode("task"); if (box.current) box.current.value = ""; }
        else if (autoSend && ev.text.trim().split(/\s+/).length >= 3) setTimeout(() => submit(), 0);
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
  const showMe = (question: string, goal: string, steps: string[]) => { if (steps.length === 0) count("anywhere_use"); if (m.showme?.stage === "pointing_roughly") count("soft_ring_corrected"); setWalk({ goal, steps }); void invoke("showme_start", { question }); };
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
  useEffect(() => { if (!m.showme) { setWalk(null); setAsking(false); } }, [m.showme]);
  useEffect(() => {
    // Only a walkthrough's own ring moves it on (a Show me ring carries an "sm_" request; Point at the problem's does not).
    if (!walk || !m.showme?.req?.startsWith("sm_") || (stage !== "your_turn_done" && stage !== "done_for_you")) return;
    const t = setTimeout(() => setAsking(true), 900);
    return () => clearTimeout(t);
  }, [stage]);
  showMeRef.current = showMe;
  // Guided lessons: each step is pointed at once (the light comes on first), and the person's own click moves it on.
  const [lessonsOpen, setLessonsOpen] = useState(false);
  // Lessons that read the project need a chosen folder; the others (installing a tool, leaving a builder) do not.
  const openLessons = () => { setLessonsOpen((v) => !v); void send(walkList(projectRef.current || NO_PROJECT)); };
  const beginLesson = (lesson: string, fresh: boolean) => {
    // With no folder chosen the lesson is asked to start without one; if it needs a project it says so itself.
    const c = walkStart(projectRef.current || NO_PROJECT, lesson, fresh);
    noAim.current = false; aimed.current = ""; acted.current = ""; clearTimeout(actTimer.current);
    dispatch({ type: "ui.walkRequested", walk: (c as { id: string }).id }); setLessonsOpen(false); void send(c);
  };
  const aimed = useRef(""), staleReq = useRef<string | undefined>(undefined), acted = useRef(""), actTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), noAim = useRef(false);
  const wk = m.walk;
  const wkKey = wk ? `${wk.id}:${wk.index}:${wk.variant}` : "";
  useEffect(() => {
    if (!wk || wk.stage !== "step") { if (aimed.current) { aimed.current = ""; void invoke("showme_clear"); } return; }
    if (aimed.current === wkKey) return;
    aimed.current = wkKey; staleReq.current = m.showme?.req;
    if (noAim.current) return;   // the screen permission was not given: words only, and it is not asked for again at every step
    void invoke("showme_start", { question: `Where do I click for this: ${wk.find}` });
  }, [wkKey, wk?.stage]);
  useEffect(() => { if (wk && m.showme?.stage === "needs_permission") noAim.current = true; }, [m.showme?.stage, wkKey]);
  useEffect(() => { if (!wk) { clearTimeout(actTimer.current); } }, [wk]);
  useEffect(() => {
    // Only this step's own ring counts: a ring left over from the step before has the old request id.
    const r = m.showme?.req;
    if (!wk || wk.stage !== "step" || !r?.startsWith("sm_") || r === staleReq.current) return;
    if ((m.showme?.stage !== "your_turn_done" && m.showme?.stage !== "done_for_you") || acted.current === wkKey) return;
    acted.current = wkKey;
    clearTimeout(actTimer.current);
    actTimer.current = setTimeout(() => void send(walkActed(wk.id, m.showme?.stage === "done_for_you" ? "done_for_you" : "clicked", wk.index)), 700);
  }, [m.showme?.stage, m.showme?.req, wkKey]);
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

      {!onboarded && <Onboarding doctor={m.doctor} connected={m.connected} project={project} send={send} pickFolder={pickFolder} setAutoSend={setAutoSend} useTask={(p) => { pendingPrompt.current = p; }} startPractice={beginPractice} onDone={finishOnboarding} />}
      {onboarded && (<>
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
      {copying && <div className="line muted" role="status">{S.copying}</div>}
      {!linkOpen ? !copying && <div className="row"><button className="btn" type="button" onClick={() => setLinkOpen(true)}>{S.openLink}</button></div> : (
        <div className="row">
          <input aria-label={S.openLinkLabel} placeholder="https://github.com/name/project" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) openLink(); if (e.key === "Escape") { e.stopPropagation(); setLinkOpen(false); } }} />
          <button className="btn primary" type="button" onClick={openLink}>{S.openLinkGo}</button>
          <button className="btn" type="button" onClick={() => setLinkOpen(false)}>{S.planCancel}</button>
        </div>
      )}
      {m.cloneNote && <div className="error" role="alert">{m.cloneNote} <button className="btn" type="button" onClick={() => dispatch({ type: "ui.cloneNoteClosed" })}>{S.onlineClose}</button></div>}
      {folderNote && <div className="error" role="alert">{folderNote}</div>}
      {settingsOpen && <SettingsPanel working={isBusy(m)} explainOn={m.explainOn} project={project} fun={fun} setFun={setFun} autoSend={autoSend} setAutoSend={setAutoSend} onClose={() => setSettingsOpen(false)} onPractice={() => { setSettingsOpen(false); beginPractice(); }} onLesson={(l) => { setSettingsOpen(false); beginLesson(l, false); }} />}
      {m.practice && m.practice.project === project && (
        <section className="panel" aria-label={S.practiceTitle}>
          <h2>{S.practiceTitle}</h2>
          {m.practice.stage === "start" && <>
            <div className="line">{S.practiceStart}</div>
            <div className="line muted">{S.practiceKeys}</div>
            <div className="row">
              <button className="btn primary" type="button" disabled={m.point?.stage === "checking"} onClick={() => { dispatch({ type: "ui.findProblem" }); void send(findProblem(project)); }}>{S.practiceFind}</button>
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.practiceSkip}</button>
            </div>
          </>}
          {m.practice.stage === "found" && <>
            <div className="line"><b>{S.practiceFound}</b> {m.practice.where?.file ? `${m.practice.where.file}, line ${m.practice.where.line}: ` : ""}{m.practice.where?.message}</div>
            <div className="line muted">{S.practiceFoundMore}</div>
            <div className="row">
              <button className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.practiceFixing" }); void send(practiceFixCommand(project)); }}>{S.practiceFix}</button>
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.practiceSkip}</button>
            </div>
          </>}
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
            <div className="line muted">{S.practiceDoneMore}</div>
            <div className="row">
              <button className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.practiceClosed" }); pickFolder(); }}>{S.practiceOwn}</button>
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.pointClose}</button>
            </div>
          </>}
          {m.practice.stage === "failed" && <>
            <div className="line">{S.practiceFailed}</div>
            <div className="row">
              <button className="btn primary" type="button" onClick={() => { dispatch({ type: "ui.practiceFixing" }); void send(practiceFixCommand(project)); }}>{S.practiceAgain}</button>
              <button className="btn" type="button" onClick={() => dispatch({ type: "ui.practiceClosed" })}>{S.pointClose}</button>
            </div>
          </>}
        </section>
      )}
      {lessonsOpen && !m.walk && (
        <section className="panel" role="status" aria-label={S.lessonsTitle}>
          <h2>{S.lessonsTitle}</h2>
          {(m.lessons ?? []).length === 0 && <div className="line">{S.lessonsNone}</div>}
          {(m.lessons ?? []).map((l) => (
            <div className="line" key={l.id}>
              <b>{l.title}</b> <span className="muted">{l.app}</span>
              {l.status !== "tried" && <div className="line muted">{S.lessonDraft}</div>}
              <div className="row">
                <button className="btn primary" type="button" onClick={() => beginLesson(l.id, false)}>{l.saved ? S.lessonContinue : S.lessonStart}</button>
                {l.saved && <button className="btn" type="button" onClick={() => beginLesson(l.id, true)}>{S.lessonStartOver}</button>}
              </div>
            </div>
          ))}
          <div className="line muted">{S.lessonLooking}</div>
          <div className="row"><button className="btn" type="button" onClick={() => setLessonsOpen(false)}>{S.pointClose}</button></div>
        </section>
      )}
      {m.walk && (
        <section className={`panel ${m.walk.stage === "help" ? "amber" : ""}`} role="status" aria-label={S.lessonsTitle}>
          <h2>{m.walk.title}</h2>
          {m.walk.stage === "done" && <div className="line">{S.lessonDone}</div>}
          {(m.walk.stage === "step" || m.walk.stage === "asking") && <>
            <div className="line muted">{S.lessonStep(m.walk.index + 1, m.walk.total)}{m.walk.variant === "instead" ? ` · ${S.lessonOther}` : ""}</div>
            <div className="line"><b>{m.walk.say}</b></div>
          </>}
          {(m.walk.stage === "help" || m.walk.stage === "stopped") && <div className="line">{m.walk.note}</div>}
          {m.walk.log.length > 0 && (
            <details className="line muted">
              <summary>{S.lessonLogTitle} ({m.walk.log.length})</summary>
              <ol>{m.walk.log.map((h, i) => <li key={i}>{h.say} <span className="muted">({h.how === "skipped" ? S.lessonLogSkipped : S.lessonLogDone})</span></li>)}</ol>
            </details>
          )}
          <div className="row">
            {m.walk.stage === "step" && <>
              <button className="btn" type="button" onClick={() => { const w = m.walk!; staleReq.current = m.showme?.req; void invoke("showme_start", { question: `Where do I click for this: ${w.find}` }); }}>{S.lessonPoint}</button>
              {m.showme?.turn && ["pointing", "pointing_roughly", "your_turn_miss"].includes(m.showme.stage) && <button className="btn" type="button" onClick={() => void invoke("do_it_for_me")}>{S.doItForMe}</button>}
              <button className="btn primary" type="button" onClick={() => { acted.current = wkKey; clearTimeout(actTimer.current); void send(walkActed(m.walk!.id, "clicked", m.walk!.index)); }}>{S.lessonDid}</button>
            </>}
            {m.walk.stage === "asking" && <>
              <div className="line">{S.lessonWorked}</div>
              <button className="btn primary" type="button" onClick={() => void send(walkAnswer(m.walk!.id, true, m.walk!.index))}>{S.lessonYes}</button>
              <button className="btn" type="button" onClick={() => void send(walkAnswer(m.walk!.id, false, m.walk!.index))}>{S.lessonNo}</button>
            </>}
            {m.walk.stage === "help" && <button className="btn primary" type="button" onClick={() => void send(walkSkip(m.walk!.id, m.walk!.index))}>{S.lessonSkip}</button>}
            {["step", "asking", "help"].includes(m.walk.stage) && <button className="btn" type="button" onClick={() => { void send(walkStop(m.walk!.id)); void invoke("showme_clear"); }}>{S.lessonStop}</button>}
            {["done", "stopped"].includes(m.walk.stage) && <button className="btn" type="button" onClick={() => dispatch({ type: "ui.walkClosed" })}>{S.pointClose}</button>}
          </div>
        </section>
      )}
      {m.diagram && (
        <section className={`panel ${m.diagram.stage === "none" ? "amber" : ""}`} role="status" aria-label={S.drawTitle}>
          <h2>{S.drawTitle}</h2>
          {m.diagram.stage === "asking" && <div className="line">{S.drawing}</div>}
          {m.diagram.stage === "shown" && <><div className="line"><b>{m.diagram.brokenReason}</b></div><div className="line">{m.diagram.caption}</div><div className="line muted">{S.drawShown}</div></>}
          {m.diagram.stage === "none" && <div className="line">{m.diagram.reason}</div>}
          {m.diagram.stage !== "asking" && <div className="row"><button className="btn" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.diagramClosed" }); }}>{S.pointClose}</button></div>}
        </section>
      )}
      {m.about && m.about.project === project && (
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
          <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.aboutClosed" })}>{S.onlineClose}</button></div>
        </section>
      )}
      {askMode === "showme" && <div className="line" role="status"><b>{S.showMe}:</b> {S.showMeHint} <button className="btn" type="button" onClick={() => setAskMode("task")}>{S.planCancel}</button></div>}
      <div className="ask">
        <input ref={box} type="text" autoComplete="off" spellCheck={false} placeholder={S.askPlaceholder} aria-label={S.askPlaceholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !composing(e)) { e.preventDefault(); if (askMode === "showme") { const q = box.current?.value.trim() ?? ""; if (q) { showMe(q, q, []); setAskMode("task"); if (box.current) box.current.value = ""; } } else submit(); } }} />
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
          <button className="btn" type="button" disabled={m.diagram?.stage === "asking"} onClick={() => drawIt(box.current?.value ?? "", m.where ?? undefined)}>{S.drawIt}</button>
          <button className="btn" type="button" aria-expanded={lessonsOpen} onClick={openLessons}>{S.lessonsButton}</button>
          <button className="btn" type="button" onClick={() => { if (project) void send(listMemory(project)); }}>{S.memoryButton}</button>
          <button className="btn" type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>{S.settingsButton}</button>
        </div>
      )}
      {!working && (
        <label className="check"><input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> {S.voiceAutoSend}</label>
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
            {m.where && <button className="btn" type="button" onClick={() => void invoke("point_problem", { project, problem: m.where })}>{S.pointWhere}</button>}
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
          <div className="row">
            {m.where && <button className="btn" type="button" onClick={() => void invoke("point_problem", { project, problem: m.where })}>{S.pointWhere}</button>}
            <button className="btn" type="button" onClick={() => dispatch({ type: "ui.planCancelled" })}>{S.closeFinished}</button>
          </div>
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
          {m.receipt.visual?.image && !undone && (
            <figure className="receipt-shot">
              <img src={`data:image/jpeg;base64,${m.receipt.visual.image}`} alt={m.receipt.visual.caption} />
              <figcaption>{m.receipt.visual.caption}</figcaption>
            </figure>
          )}
          {m.receipt.picture && !m.receipt.visual && !undone && <div className="line muted">{S.receiptPicturing}</div>}
          {blockedNote(m, project) && <div className="line"><b>{blockedNote(m, project)}</b></div>}
          <div className="line muted">{m.receipt.commands} {S.commands} · {S.cost}: {formatUsd(m.receipt.usdEstimate)}</div>
          {m.receipt.changed.length > 0 && !undone && project && (
            <div className="row"><button className="btn danger" type="button" onClick={() => { void send(undo(project, m.receipt!.checkpoint)); setUndone(true); }}>{S.undo}</button></div>
          )}
          {undone && <div className="line">{S.undone}</div>}
          {m.explain && m.explain.checkpoint === m.receipt.checkpoint && <ExplainBox e={m.explain} key={m.explain.checkpoint} />}
        </section>
      )}


      {m.voice && (
        <section className={`panel ${["error", "mic_refused", "blocked", "needs_mic", "needs_model"].includes(m.voice.stage) ? "amber" : ""}`} role="status" aria-label={S.voiceTitle}>
          <h2>{S.voiceTitle}</h2>
          <div className="line">{m.voice.message}{m.voice.stage === "downloading" && typeof m.voice.percent === "number" ? ` ${m.voice.percent}%` : ""}</div>
          {m.voice.stage === "needs_model" && <div className="row"><button className="btn primary" type="button" onClick={() => void invoke("voice_download")}>{S.voiceDownload}</button></div>}
          {["error", "mic_refused", "blocked", "needs_mic", "silent", "model_ready"].includes(m.voice.stage) && <div className="row"><button className="btn" type="button" onClick={() => dispatch({ type: "ui.voiceClosed" })}>{S.voiceClose}</button></div>}
        </section>
      )}

      {m.point && (
        <section className={`panel ${m.point.stage === "found" ? "amber" : ""}`} role="status" aria-label={S.pointTitle}>
          <h2>{S.pointTitle}</h2>
          {m.point.stage === "checking" && <div className="line">{S.pointChecking}</div>}
          {m.point.stage === "clear" && <div className="line">{S.pointClear}</div>}
          {m.point.stage === "nothing" && <div className="line">{S.pointNothing}</div>}
          {m.point.stage === "found" && <>
            <div className="line"><b>{m.point.label}</b></div>
            <div className="line">{m.point.problem && m.point.problem.kind === "line" ? `${m.point.problem.file}, line ${m.point.problem.line}: ` : ""}{m.point.problem?.message || plainPath(m.point.message ?? "", project)}</div>
          </>}
          {m.point.stage !== "checking" && (
            <div className="row">
              {m.point.stage === "found" && m.point.problem && <button className="btn" type="button" onClick={() => void invoke("point_problem", { project, problem: m.point?.problem })}>{S.pointWhere}</button>}
              {m.point.stage === "found" && <button className="btn" type="button" disabled={m.diagram?.stage === "asking"} onClick={() => drawIt("Why did this break?", m.point?.problem && m.point.problem.kind === "line" ? { kind: "line", file: m.point.problem.file, line: m.point.problem.line, message: m.point.problem.message } : { message: m.point?.problem?.message ?? m.point?.message })}>{S.drawWhy}</button>}
              {m.point.stage === "found" && <button className="btn primary" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); if (project) void send(diagnose(project)); }}>{S.pointFix}</button>}
              <button className="btn" type="button" onClick={() => { void invoke("showme_clear"); dispatch({ type: "ui.pointClosed" }); }}>{S.pointClose}</button>
            </div>
          )}
        </section>
      )}

      {m.showme && (
        <section className={`panel ${m.showme.stage === "error" || m.showme.stage === "needs_permission" || m.showme.stage === "window_changed" ? "amber" : ""}`} role="status" aria-label={S.showMe}>
          <h2>{S.showMe}</h2>
          <div className="line">{m.showme.message}</div>
          {["pointing", "pointing_roughly", "your_turn_miss"].includes(m.showme.stage) && (walk || m.showme.turn) && (
            <div className="row">
              <button className="btn" type="button" onClick={() => void invoke("do_it_for_me")}>{S.doItForMe}</button>
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
            <button className="btn" type="button" aria-pressed={fun} onClick={() => { setReactions(!fun); setFun(!fun); }}>{S.reactionsSetting}: {fun ? "on" : "off"}</button>
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
      </>)}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Card /></StrictMode>);
