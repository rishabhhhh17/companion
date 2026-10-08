// What the character and cards show, decided here as plain code (no screen needed to test it).
// Input: events from the runner (protocol) plus a few events from the app itself.

export type CharacterState = "off" | "idle" | "listening" | "thinking" | "working" | "checking" | "needsYou" | "done" | "error";
export type ToolLine = { text: string; outcome: "ran" | "blocked" | "needs_approval" | "denied" | "" };
export type ApprovalCard = { id: string; agent: string; title: string; risk: string; checkpoint: string; expiresAt: string };
export type Receipt = { checkpoint: string; changed: { file: string; kind: string }[]; commands: number; notUndoable: string[]; usdEstimate: number };
export type Task = { agent: string; label: string; lines: ToolLine[]; costUsd: number };
export type Model = {
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

export const initial = (): Model => ({ runnerUp: true, connected: "unknown", agents: {}, character: "idle", task: null, approvals: [], receipt: null, notice: null, error: null });

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
      return { ...m, task: { ...t, lines: [...t.lines, { text: e.summary, outcome: e.outcome ?? "" }] } };
    }
    case "cost.update": return m.task ? { ...m, task: { ...m.task, costUsd: Number(e.usdEstimate) } } : m;
    case "approval.request":
      if (m.approvals.some((a) => a.id === e.approval)) return m;
      return { ...m, approvals: [...m.approvals, { id: e.approval, agent: e.agent, title: e.title, risk: e.risk, checkpoint: e.checkpoint, expiresAt: e.expiresAt }] };
    case "receipt": return { ...m, receipt: { checkpoint: e.checkpoint, changed: e.changed, commands: e.commands, notUndoable: e.notUndoable, usdEstimate: e.usdEstimate } };
    case "protocol.error": return { ...m, error: plainError(String(e.reason)) };
    default: return m;
  }
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

// Show file paths the way a person thinks of them: inside the project, not the whole path on the disk.
export function plainPath(text: string, project: string): string {
  if (!project) return text;
  return text.split(project.endsWith("/") ? project : project + "/").join("");
}
