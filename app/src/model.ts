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
export type Model = {
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

export const initial = (): Model => ({ plan: null, drive: null, history: [], runnerUp: true, connected: "unknown", agents: {}, character: "idle", task: null, approvals: [], receipt: null, notice: null, error: null });

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
  const nc = /Not connected:.*$/.exec(reason);
  if (nc) return nc[0];
  const r = reason.replace(/^engine error:\s*/i, "");
  return `Something went wrong: ${r}`;
}

type Ev = Record<string, any> & { type?: string };

export function reduce(m: Model, e: Ev): Model {
  switch (e.type) {
    case "ui.settle": return withAgents(m, Object.fromEntries(Object.entries(m.agents).map(([a, s]) => [a, s === "done" ? "idle" : s])) as Record<string, CharacterState>);
    case "ui.approvalAnswered": return { ...m, approvals: m.approvals.filter((a) => a.id !== e.approval) };
    case "app.runner_down": return { ...withAgents({ ...m, runnerUp: false }, m.agents), error: e.reason ? `The engine could not start: ${e.reason}` : "The engine stopped. Restart Companion." };
    case "app.stop_everything": return { ...withAgents({ ...m, approvals: [], task: m.task }, {}), notice: "Stopped everything.", error: null };
    case "auth.status": {
      const connected = e.method === "api_key" || e.method === "plan" ? e.method : e.method === "none" ? "none" : "unknown";
      return { ...m, connected, notice: connected === "none" ? "Not connected. Add your API key, or sign in with your Claude plan, to start a task." : null };
    }
    case "checkpoint.created": return { ...m, receipt: null, error: null, notice: null, task: { agent: e.agent, label: String(e.label ?? "").replace(/^Before:\s*/, ""), lines: [], costUsd: 0 } };
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
    case "plan.ready": return { ...m, plan: { agent: e.agent, steps: (e.steps ?? []).map((x: any) => String(x.title)), truncated: !!e.truncated, estimateUsd: Number(e.estimateUsd ?? 0) }, drive: null, error: null, notice: null };
    case "ui.planCancelled": return { ...m, plan: null };
    case "drive.step": {
      const done = e.status === "done" ? Math.max(m.drive?.completed ?? 0, Number(e.index)) : m.drive?.completed ?? 0;
      return { ...m, plan: null, drive: { index: e.index, total: e.total, title: e.title, status: e.status, completed: done } };
    }
    case "drive.done": return { ...m, plan: null, drive: { index: m.drive?.index ?? 0, total: e.total, title: m.drive?.title ?? "", status: "finished", completed: e.completed, finished: { status: e.status, completed: e.completed, total: e.total } } };
    case "tasks.list": return { ...m, history: Array.isArray(e.tasks) ? e.tasks : [] };
    case "receipt": return { ...m, receipt: { proof: e.proof, checkpoint: e.checkpoint, changed: e.changed, commands: e.commands, notUndoable: e.notUndoable, usdEstimate: e.usdEstimate } };
    case "protocol.error": return { ...m, error: plainError(String(e.reason)) };
    default: return m;
  }
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
  if (usd < 1) return `${Math.round(usd * 100)} cents`;
  return `$${usd.toFixed(2)}`;
}

// The one word shown under the character (plain, never cute).
export function stateLabel(s: CharacterState): string {
  return ({ off: "Off", idle: "Ready", listening: "Listening", thinking: "Thinking", working: "Working", checking: "Checking", needsYou: "Needs you", done: "Done", error: "Something went wrong" } as const)[s];
}

// How a Drive plan ended, in one plain sentence.
export function driveWords(m: Model): string | null {
  const f = m.drive?.finished;
  if (!f) return null;
  if (f.status === "done") return `All ${f.total} steps are done`;
  const why = f.status === "interrupted" ? "you stopped it" : f.status === "error_max_budget_usd" ? "the spending limit was reached" : "a check failed";
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
