// What the character and cards show, decided here as plain code (no screen needed to test it).
// Input: events from the runner (protocol) plus a few events from the app itself.

export type CharacterState = "off" | "idle" | "listening" | "thinking" | "working" | "checking" | "needsYou" | "done" | "error";
export type ToolLine = { id: string; text: string; outcome: "ran" | "blocked" | "needs_approval" | "denied" | "" };
export type ApprovalCard = { id: string; agent: string; title: string; risk: string; checkpoint: string; expiresAt: string };
export type ProofLine = { rung: string; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string };
export type ProofState = { steps: ProofLine[]; verdict?: string; tries: number };
export type Receipt = { proof?: string; checkpoint: string; changed: { file: string; kind: string }[]; commands: number; notUndoable: string[]; usdEstimate: number };
export type Task = { agent: string; label: string; lines: ToolLine[]; costUsd: number; proof?: ProofState };
export type HistoryItem = { id: number; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null };
export type PlanCard = { agent: string; steps: string[]; truncated: boolean; estimateUsd: number };
export type DriveProgress = { index: number; total: number; title: string; status: string; completed: number; finished?: { status: string; completed: number; total: number } };
export type StuckCard = { index: number; title: string; failure: string; options: { id: string; label: string }[] };
export type Paused = { reason: string; path?: string };
export type RescueCard = { summary: string; works: string[]; broken: string; evidence: { label: string; status: string; detail: string }[] };
export type ResearchCard = { title: string; answer: string; notes: { text: string; source: string }[]; file: string };
export type PromptHelp = {
  stage: string; app?: string; message?: string; streaming?: string;
  text?: string; diff: [string, string][]; question?: string; options?: string[]; handback?: string;
};
export type ShipGate = { id: string; label: string; status: "passed" | "blocked" | "could_not_check" | "not_applicable"; detail: string; findings?: string[]; overridable?: boolean };
export type ShipReport = { gates: ShipGate[]; canShip: boolean; blockedBy: string[]; needsYou: string[]; confirmed: string[] };
export type MemoryLine = { id: string; text: string; source: string; date: string };
export type MemoryState = { paused: boolean; projectLines: MemoryLine[]; profileLines: MemoryLine[]; problems: string[] };
export type Saved = { id: string; scope: "project" | "profile"; text: string };
export type Explain = { checkpoint: string; bullets: string[]; question?: { text: string; options: string[]; correct: number } };
export type ShipFlow = { stage: string; detail: string; previewUrl?: string; productionUrl?: string; canGoLive?: boolean };
export type Model = {
  shipFlow: ShipFlow | null;
  currentCheckpoint?: string;
  explain: Explain | null;
  explainOn: boolean;
  recap: { lines: string[] } | null;
  memory: MemoryState | null;
  memoryNote: string | null;
  exported: string | null;
  toast: { lines: Saved[] } | null;
  agentsAsk: string[] | null;
  ship: ShipReport | null;
  ph: PromptHelp | null;
  research: ResearchCard | null;
  rescue: RescueCard | null;
  paused: Paused | null;
  stuck: StuckCard | null;
  plan: PlanCard | null;
  drive: DriveProgress | null;
  history: HistoryItem[];
  runnerUp: boolean;
  connected: "unknown" | "api_key" | "plan" | "none";
  agents: Record<string, CharacterState>;
  character: CharacterState;
  task: Task | null;
  approvals: ApprovalCard[];
  receipt: Receipt | null;
  notice: string | null;
  error: string | null;
};

export const initial = (): Model => ({ shipFlow: null, explain: null, explainOn: true, recap: null, memory: null, memoryNote: null, exported: null, toast: null, agentsAsk: null, ship: null, ph: null, research: null, rescue: null, paused: null, stuck: null, plan: null, drive: null, history: [], runnerUp: true, connected: "unknown", agents: {}, character: "idle", task: null, approvals: [], receipt: null, notice: null, error: null });

// Busiest first: an error or a question to you outranks work in progress.
const RANK: Record<CharacterState, number> = { error: 8, needsYou: 7, checking: 6, working: 5, thinking: 4, listening: 3, done: 2, idle: 1, off: 0 };
function top(agents: Record<string, CharacterState>): CharacterState {
  let best: CharacterState = "idle";
  for (const s of Object.values(agents)) if (RANK[s] > RANK[best]) best = s;
  return best;
}
const withAgents = (m: Model, agents: Record<string, CharacterState>): Model => ({ ...m, agents, character: m.runnerUp ? top(agents) : "off" });

export function plainError(reason: string): string {
  if (/error_max_budget_usd/.test(reason)) return "Stopped: the spending limit for this task was reached. Nothing more was run.";
  if (/^daily_limit/.test(reason)) return "This project has reached its daily spending limit. New work starts again tomorrow, or you can raise the limit.";
  const nc = /Not connected:.*$/.exec(reason);
  if (nc) return nc[0];
  const r = reason.replace(/^engine error:\s*/i, "");
  return `Something went wrong: ${r.replace(/[.\s]+$/, "")}. Try again, and if it keeps happening, press Stop and start a new task.`;
}

type Ev = Record<string, any> & { type?: string };

export function reduce(m: Model, e: Ev): Model {
  switch (e.type) {
    case "ui.settle": return withAgents(m, Object.fromEntries(Object.entries(m.agents).map(([a, s]) => [a, s === "done" ? "idle" : s])) as Record<string, CharacterState>);
    case "ui.approvalAnswered": return { ...m, approvals: m.approvals.filter((a) => a.id !== e.approval) };
    case "app.runner_down": return { ...withAgents({ ...m, runnerUp: false }, m.agents), error: e.reason ? `The engine could not start: ${e.reason}` : "The engine stopped. Restart Companion." };
    case "runner.hello": return { ...withAgents({ ...m, runnerUp: true }, m.agents), error: m.error && /^The engine /.test(m.error) ? null : m.error };
    // A new engine knows nothing of the old one's questions, so nothing waiting on it can be answered any more.
    case "app.runner_restarted": return { ...withAgents({ ...m, runnerUp: true, approvals: [], plan: null, drive: null, stuck: null, paused: null }, {}), notice: "The engine restarted, so anything that was running was stopped. Your files are as they were.", error: null };
    case "app.notice": return { ...m, notice: String(e.message ?? "") || m.notice };
    case "app.stop_everything": return { ...withAgents({ ...m, approvals: [], plan: null, drive: null, stuck: null, paused: null, toast: null, task: m.task }, {}), notice: "Stopped everything.", error: null };
    case "auth.status": {
      const connected = e.method === "api_key" || e.method === "plan" ? e.method : e.method === "none" ? "none" : "unknown";
      return { ...m, connected, notice: connected === "none" ? "Not connected. Add your API key, or sign in with your Claude plan, to start a task." : null };
    }
    case "explain.ready": return (m.receipt?.checkpoint ?? m.currentCheckpoint) === e.checkpoint ? { ...m, explain: { checkpoint: e.checkpoint, bullets: e.bullets ?? [], question: e.question } } : m;
    case "explain.state": return { ...m, explainOn: !!e.enabled };
    case "recap.ready": return { ...m, recap: Array.isArray(e.lines) && e.lines.length ? { lines: e.lines.map(String) } : null };
    // A different folder: nothing from the old project (its cards, memory or history) may linger on screen.
    case "ui.projectChanged": return { ...m, ship: null, shipFlow: null, research: null, rescue: null, plan: null, drive: null, stuck: null, paused: null, task: null, receipt: null, explain: null, recap: null, memory: null, memoryNote: null, exported: null, toast: null, agentsAsk: null, history: [], error: null, notice: null };
    case "ui.recapClosed": return { ...m, recap: null };
    case "checkpoint.created": return { ...m, explain: null, currentCheckpoint: e.checkpoint, ship: null, research: null, receipt: null, error: null, notice: null, task: { agent: e.agent, label: String(e.label ?? "").replace(/^Before:\s*/, ""), lines: [], costUsd: 0 } };
    case "agent.state": return withAgents(m, { ...m.agents, [e.agent]: e.state });
    case "agent.tool": {
      const t = m.task ?? { agent: e.agent, label: "", lines: [], costUsd: 0 };
      const line = { id: String(e.toolUseId ?? ""), text: e.summary, outcome: e.outcome ?? "" };
      // The same step is updated as it moves from "waiting" to "ran" or "denied", never listed twice.
      const at = line.id ? t.lines.findIndex((l) => l.id === line.id) : -1;
      return { ...m, task: { ...t, lines: at >= 0 ? t.lines.map((l, i) => (i === at ? line : l)) : [...t.lines, line] } };
    }
    case "approval.resolved": return { ...m, approvals: m.approvals.filter((a) => a.id !== e.approval) };
    case "cost.update": return m.task ? { ...m, task: { ...m.task, costUsd: Number(e.usdEstimate) } } : m;
    case "approval.request":
      if (m.approvals.some((a) => a.id === e.approval)) return m;
      return { ...m, approvals: [...m.approvals, { id: e.approval, agent: e.agent, title: e.title, risk: e.risk, checkpoint: e.checkpoint, expiresAt: e.expiresAt }] };
    case "proof.step": {
      if (!m.task) return m;
      const p = m.task.proof;
      // A step arriving after a finished try means the work was sent back and is being checked again.
      const base: ProofState = !p || p.verdict ? { steps: [], tries: (p?.tries ?? 0) } : p;
      const line: ProofLine = { rung: e.rung, label: String(e.label ?? e.rung), status: e.status, detail: String(e.detail ?? "") };
      const at = base.steps.findIndex((s) => s.rung === line.rung);
      return { ...m, task: { ...m.task, proof: { ...base, steps: at >= 0 ? base.steps.map((s, i) => (i === at ? line : s)) : [...base.steps, line] } } };
    }
    case "proof.result": {
      if (!m.task) return m;
      const steps: ProofLine[] = (m.task.proof?.steps ?? []).length ? m.task.proof!.steps : (e.steps ?? []).map((s: any) => ({ rung: s.rung, label: s.label, status: s.status, detail: s.detail ?? "" }));
      return { ...m, task: { ...m.task, proof: { steps, verdict: e.verdict, tries: Number(e.tries ?? 1) } } };
    }
    case "plan.ready": return { ...m, plan: { agent: e.agent, steps: (e.steps ?? []).map((x: any) => String(x.title)), truncated: !!e.truncated, estimateUsd: Number(e.estimateUsd ?? 0) }, drive: null, stuck: null, paused: null, task: null, receipt: null, error: null, notice: null };
    case "loop.stuck": return { ...m, plan: null, paused: null, stuck: { index: e.index, title: e.title, failure: `${e.failure?.label ?? ""}: ${e.failure?.detail ?? ""}`, options: Array.isArray(e.options) && e.options.length ? e.options : [{ id: "different", label: "Try a different way" }, { id: "stop", label: "Stop here" }] } };
    case "drive.paused": return { ...m, stuck: null, paused: { reason: e.reason, path: e.path } };
    case "ui.resumed": return { ...m, paused: null };
    case "ui.stuckAnswered": return { ...m, stuck: null };
    case "rescue.report": return { ...m, rescue: { summary: e.summary, works: e.works ?? [], broken: e.broken, evidence: [...(e.evidence ?? [])].sort((a: any, b: any) => (a.status === "failed" ? 0 : 1) - (b.status === "failed" ? 0 : 1)) }, task: null, receipt: null, error: null, notice: null };
    case "app.prompt_help":
      // Each stage starts fresh, so the old text never lingers into a new press.
      return e.stage === "dismissed" ? { ...m, ph: null } : { ...m, ph: { stage: e.stage, app: e.app ?? m.ph?.app, message: e.message, diff: [] } };
    case "assist.prompt.delta": return m.ph ? { ...m, ph: { ...m.ph, stage: m.ph.stage === "ready" ? "ready" : "thinking", streaming: (m.ph.streaming ?? "") + String(e.text ?? "") } } : m;
    case "assist.prompt.done": return { ...m, ph: { stage: "ready", app: m.ph?.app, text: e.text, diff: e.diff ?? [], question: e.question, options: e.options, handback: e.handback } };
    case "assist.error": return e.reason === "cancelled" ? { ...m, ph: null } : { ...m, ph: { stage: "error", app: m.ph?.app, message: String(e.reason), diff: [] } };
    case "ship.gates": return { ...m, ship: { gates: e.gates ?? [], canShip: !!e.canShip, blockedBy: e.blockedBy ?? [], needsYou: e.needsYou ?? [], confirmed: e.confirmed ?? [] } };
    case "ship.status": return { ...m, shipFlow: { stage: String(e.stage), detail: String(e.detail ?? ""), previewUrl: e.previewUrl, productionUrl: e.productionUrl, canGoLive: e.canGoLive === true } };
    case "ui.shipClosed": return { ...m, ship: null, shipFlow: null };
    case "research.done": return { ...m, research: { title: e.title, answer: e.answer, notes: e.notes ?? [], file: e.file }, task: null, receipt: null, error: null, notice: null };
    case "ui.researchRequested": case "ui.researchClosed": return { ...m, research: null };
    case "ui.planRequested": return { ...m, ship: null, research: null, rescue: null, task: null, receipt: null, drive: null, plan: null, stuck: null, paused: null, error: null, notice: null };
    case "ui.planCancelled": return { ...m, plan: null, rescue: null };
    case "drive.step": {
      const done = e.status === "done" ? Math.max(m.drive?.completed ?? 0, Number(e.index)) : m.drive?.completed ?? 0;
      return { ...m, plan: null, rescue: null, stuck: null, paused: null, drive: { index: e.index, total: e.total, title: e.title, status: e.status, completed: done } };
    }
    case "drive.done": return { ...m, plan: null, stuck: null, paused: null, drive: { index: m.drive?.index ?? 0, total: e.total, title: m.drive?.title ?? "", status: "finished", completed: e.completed, finished: { status: e.status, completed: e.completed, total: e.total } } };
    case "tasks.list": return { ...m, history: Array.isArray(e.tasks) ? e.tasks : [] };
    case "receipt": return { ...m, receipt: { proof: e.proof, checkpoint: e.checkpoint, changed: e.changed, commands: e.commands, notUndoable: e.notUndoable, usdEstimate: e.usdEstimate } };
    case "memory.state": return { ...m, memory: { paused: !!e.paused, projectLines: e.projectLines ?? [], profileLines: e.profileLines ?? [], problems: e.problems ?? [] }, memoryNote: null };
    case "memory.refused": return { ...m, memoryNote: String(e.reason) };
    case "memory.exported": return { ...m, exported: String(e.text ?? "") };
    case "memory.saved": {
      const lines = m.toast?.lines ?? [];
      return lines.some((l) => l.id === e.line) ? m : { ...m, toast: { lines: [...lines, { id: String(e.line), scope: e.scope, text: String(e.text) }] } };
    }
    case "ui.toastClear": return { ...m, toast: null };
    case "memory.agents_ask": return { ...m, agentsAsk: Array.isArray(e.files) ? e.files.map(String) : [] };
    case "ui.agentsAnswered": return { ...m, agentsAsk: null };
    case "memory.agents_written": return { ...m, notice: `Companion updated ${(e.files ?? []).join(" and ")} with the facts about this project.` };
    case "ui.memoryClosed": return { ...m, memory: null, memoryNote: null, exported: null };
    case "protocol.error": return { ...m, error: plainError(String(e.reason)) };
    default: return m;
  }
}

// The toast after Companion learns something new.
export function savedWords(m: Model): string | null {
  const l = m.toast?.lines ?? [];
  if (l.length === 0) return null;
  return l.length === 1 ? `Remembered: ${l[0].text}` : `Remembered ${l.length} new things`;
}

// How a past task ended, in plain words.
export function historyWords(t: Pick<HistoryItem, "status" | "proof">): string {
  switch (t.status) {
    case "done": return t.proof === "passed" ? "Done, checked" : "Done, not checked";
    case "not_done": return "Not done";
    case "interrupted": return "Stopped";
    case "error_max_budget_usd": return "Stopped at the spending limit";
    case "running": return "Running";
    default: return "Something went wrong";
  }
}

// A check failed and Claude is working on it again: say "fixing", not "Not done", until it has really ended.
export function isFixing(m: Model): boolean {
  return m.task?.proof?.verdict === "failed" && ["thinking", "working", "checking"].includes(m.character);
}

// Tells the user when the work needed more than one try, so a fix never goes unnoticed.
export function triesNote(m: Model): string | null {
  const p = m.task?.proof;
  if (!p?.verdict || p.tries <= 1) return null;
  return p.verdict === "failed" ? `Still failing after ${p.tries} tries` : `Fixed after ${p.tries} tries`;
}

// Why the task is not done, in one plain line. Null when nothing failed.
export function notDoneReason(m: Model): string | null {
  const p = m.task?.proof;
  if (!p || p.verdict !== "failed") return null;
  const f = [...p.steps].reverse().find((s) => s.status === "failed") ?? p.steps.at(-1);
  return f ? `${f.label}: ${f.detail}` : "A check failed.";
}

// How the character moves. Reduced motion freezes everything (Rive does not do this by itself).
export function motionFor(state: CharacterState, reduced: boolean): "none" | "breathe" | "swirl" | "busy" | "scan" | "glow" | "droop" {
  if (reduced) return "none";
  switch (state) {
    case "idle": return "breathe";
    case "thinking": return "swirl";
    case "working": return "busy";
    case "checking": return "scan";
    case "needsYou": return "glow";
    case "error": return "droop";
    default: return "none";
  }
}

export function formatUsd(usd: number): string {
  if (usd <= 0) return "free so far";
  if (usd < 0.01) return "less than 1 cent";
  const cents = Math.round(usd * 100);
  if (cents < 100) return cents === 1 ? "1 cent" : `${cents} cents`;
  return `$${usd.toFixed(2)}`;
}

// The one word shown under the character (plain, never cute).
export function stateLabel(s: CharacterState): string {
  return ({ off: "Off", idle: "Ready", listening: "Listening", thinking: "Thinking", working: "Working", checking: "Checking", needsYou: "Needs you", done: "Done", error: "Something went wrong" } as const)[s];
}

// One sentence: may this go on the internet?
export function shipWords(m: Model): string | null {
  const s = m.ship;
  if (!s) return null;
  if (s.canShip) return "Ready to ship: every check passed";
  const b = s.blockedBy.length, n = s.needsYou.length;
  const parts = [b ? `${b} ${b === 1 ? "thing is" : "things are"} blocking it` : "", n ? `${n} ${n === 1 ? "needs" : "need"} you` : ""].filter(Boolean);
  return `Not ready to ship: ${parts.join(" and ")}`;
}
// The gates that could not run and may be confirmed by the person.
export const confirmable = (m: Model): string[] => (m.ship?.gates ?? []).filter((g) => g.status === "could_not_check" && g.overridable).map((g) => g.id);

// The one line shown for each Prompt help stage.
export function phWords(m: Model): string | null {
  const p = m.ph;
  if (!p) return null;
  switch (p.stage) {
    case "reading": return `Reading your text in ${p.app ?? "this app"}`;
    case "thinking": return "Improving it";
    case "needs_accessibility": return "Turn on Accessibility for Companion in System Settings, then press the hotkey again.";
    case "nothing_to_read": return `I could not find text to read in ${p.app ?? "this app"}. Click into the text box first.`;
    case "consent": return `Allow Prompt help to read the text box in ${p.app ?? "this app"}?`;
    default: return p.message ?? null;
  }
}

// What the task was not allowed to do (a safety rule or a house rule said no), so a "Done" is never read as "all of it".
export function blockedNote(m: Model, project: string): string | null {
  const lines = (m.task?.lines ?? []).filter((l) => l.outcome === "blocked" || l.outcome === "denied");
  if (lines.length === 0) return null;
  const list = lines.map((l) => plainPath(l.text, project)).join("; ");
  return `${lines.length} ${lines.length === 1 ? "action was" : "actions were"} not done: ${list}`;
}

// Why the agent is waiting for you, in one plain sentence.
export function pausedWords(m: Model): string | null {
  const p = m.paused;
  if (!p) return null;
  if (p.reason === "files_changed") return `Paused because you changed ${p.path ?? "a file"}`;
  if (p.reason === "editor") return "Paused because you opened your editor";
  if (p.reason === "terminal") return "Paused because you opened your terminal";
  return "Paused because you asked it to";
}

// How a Drive plan ended, in one plain sentence.
export function driveWords(m: Model): string | null {
  const f = m.drive?.finished;
  if (!f) return null;
  if (f.status === "done") return `All ${f.total} steps are done`;
  const why = f.status === "interrupted" ? "you stopped it" : f.status === "error_max_budget_usd" ? "the spending limit was reached" : f.status === "daily_limit" ? "the daily limit for this project was reached" : "a check failed";
  return `Stopped after ${f.completed} of ${f.total} steps: ${why}`;
}

// The word under the character and at the top of the card. A failed check is "Not done", never a crash.
export function characterWords(m: Model): string {
  if (isFixing(m)) return "Fixing a failed check";
  if (m.character === "error" && notDoneReason(m)) return "Not done";
  return stateLabel(m.character);
}

// Show file paths the way a person thinks of them: inside the project, not the whole path on the disk.
export function plainPath(text: string, project: string): string {
  if (!project) return text;
  return text.split(project.endsWith("/") ? project : project + "/").join("");
}
