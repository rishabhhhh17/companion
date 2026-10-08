// Companion protocol, version 1. One JSON object per line.
// Commands go app -> runner. Events go runner -> app. Lines with an unknown
// version, an unknown type, or missing fields are refused, never guessed.

export const PROTOCOL_VERSION = 1 as const;

export type Envelope = { v: 1; id: string; ts?: string; project?: string; agent?: string };

export type AgentStart = Envelope & {
  type: "agent.start"; project: string; agent: string; mode: "drive" | "rescue" | "research" | "ship";
  prompt: string; model: string; budgetUsd: number;
};
export type AgentSend = Envelope & { type: "agent.send"; agent: string; text: string };
export type AgentInterrupt = Envelope & { type: "agent.interrupt"; agent: string };
export type AgentInterruptAll = Envelope & { type: "agent.interruptAll"; reason: string };
export type ApprovalResolve = Envelope & { type: "approval.resolve"; approval: string; decision: "allow" | "deny"; scope: "once" | "task" };
export type CheckpointRestore = Envelope & { type: "checkpoint.restore"; project: string; checkpoint: string };

export type AssistPrompt = Envelope & { type: "assist.prompt"; req: string; app: string; target: string; text: string; style: "full" | "light"; answer?: string; noQuestion?: boolean };
export type AssistLocate = Envelope & { type: "assist.locate"; req: string; question: string; image: { ref: string; w: number; h: number }; ocr?: { id: string; text: string; box: number[] }[]; walkthrough?: boolean };
export type AssistCancel = Envelope & { type: "assist.cancel"; req: string };

export type ShipCheck = Envelope & { type: "ship.check"; project: string; runChecks?: boolean; confirm?: string[] };
export type ResearchAsk = Envelope & { type: "research.ask"; project: string; agent: string; question: string; model: string; budgetUsd: number };
export type RescueDiagnose = Envelope & { type: "rescue.diagnose"; project: string; agent: string; model: string; budgetUsd: number };
export type DrivePlan = Envelope & { type: "drive.plan"; project: string; agent: string; goal: string; model: string; budgetUsd: number };
export type DriveApprove = Envelope & { type: "drive.approve"; agent: string; steps: string[] };
export type LoopChoose = Envelope & { type: "loop.choose"; agent: string; choice: "different" | "stop" };
export type DrivePause = Envelope & { type: "drive.pause"; agent: string; reason: "editor" | "terminal" | "you" };
export type DriveResume = Envelope & { type: "drive.resume"; agent: string };
export type TasksList = Envelope & { type: "tasks.list"; project: string };
export type Command = ShipCheck | ResearchAsk | RescueDiagnose | DrivePause | DriveResume | LoopChoose | DrivePlan | DriveApprove | TasksList | AssistPrompt | AssistLocate | AssistCancel | AgentStart | AgentSend | AgentInterrupt | AgentInterruptAll | ApprovalResolve | CheckpointRestore;

export type AgentStateName = "idle" | "listening" | "thinking" | "working" | "checking" | "needsYou" | "done" | "error";

export type RunnerHello = Envelope & { type: "runner.hello"; runnerVersion: string; sdk: string; claudeCode?: string };
export type AuthStatus = Envelope & { type: "auth.status"; method: "api_key" | "plan" | "cloud" | "none" | "unknown"; source?: string };
export type CheckpointCreated = Envelope & {
  type: "checkpoint.created"; project: string; agent: string; checkpoint: string; label: string; files: number;
  skipped: { path: string; reason: string }[];
};
export type AgentState = Envelope & { type: "agent.state"; agent: string; state: AgentStateName };
export type AgentTool = Envelope & { type: "agent.tool"; agent: string; tool: string; summary: string; toolUseId: string; undoable: boolean; outcome?: "ran" | "blocked" | "needs_approval" | "denied" };
export type ApprovalRequest = Envelope & {
  type: "approval.request"; approval: string; agent: string; checkpoint: string; toolUseId: string;
  risk: "irreversible" | "git" | "outside_project" | "install" | "network"; title: string; expiresAt: string;
};
export type CostUpdate = Envelope & {
  type: "cost.update"; agent: string; usdEstimate: number; basis: string; tokens: { in: number; cacheRead: number; out: number };
};
export type Receipt = Envelope & {
  type: "receipt"; agent: string; checkpoint: string; changed: { file: string; kind: "added" | "modified" | "deleted" }[];
  commands: number; notUndoable: string[]; proof: "passed" | "failed" | "skipped"; usdEstimate: number;
};
export type ProtocolError = Envelope & { type: "protocol.error"; reason: string; line?: string };

export type AssistPromptDelta = Envelope & { type: "assist.prompt.delta"; req: string; text: string };
export type AssistPromptDone = Envelope & { type: "assist.prompt.done"; req: string; text: string; question?: string; options?: string[]; diff: [string, string][]; usdEstimate: number; handback: "paste" | "copy" };
export type AssistPoint = Envelope & { type: "assist.point"; req: string; step: number; x: number; y: number; ocrId?: string; targetText: string; confidence: number; caption: string };
export type AssistError = Envelope & { type: "assist.error"; req: string; reason: string };

export type ProofStep = { rung: string; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; ms?: number };
export type ProofStepEvent = Envelope & { type: "proof.step"; agent: string } & ProofStep;
export type ProofResult = Envelope & { type: "proof.result"; agent: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; steps: ProofStep[]; tries: number };

export type ApprovalResolved = Envelope & { type: "approval.resolved"; approval: string; agent: string; outcome: "allowed" | "denied" | "expired" | "cancelled" };

export type PlanReady = Envelope & { type: "plan.ready"; agent: string; steps: { id: number; title: string }[]; truncated: boolean; estimateUsd: number };
export type DriveStep = Envelope & { type: "drive.step"; agent: string; index: number; total: number; title: string; status: "started" | "done" | "not_done" | "stopped" | "over_budget" };
export type DriveDone = Envelope & { type: "drive.done"; agent: string; status: string; completed: number; total: number; usdEstimate: number };
export type ShipGates = Envelope & { type: "ship.gates"; project: string; canShip: boolean; gates: { id: string; label: string; status: "passed" | "blocked" | "could_not_check" | "not_applicable"; detail: string; findings?: string[]; overridable?: boolean }[]; blockedBy: string[]; needsYou: string[]; confirmed: string[]; allowedCount: number };
export type ResearchDone = Envelope & { type: "research.done"; agent: string; title: string; answer: string; notes: { text: string; source: string }[]; file: string };
export type RescueReport = Envelope & { type: "rescue.report"; agent: string; summary: string; works: string[]; broken: string; steps: { id: number; title: string }[]; evidence: { label: string; status: string; detail: string }[]; estimateUsd: number };
export type DrivePaused = Envelope & { type: "drive.paused"; agent: string; reason: "files_changed" | "editor" | "terminal" | "you"; path?: string };
export type LoopStuck = Envelope & { type: "loop.stuck"; agent: string; index: number; title: string; failure: { label: string; detail: string }; options: { id: string; label: string }[] };
export type TaskSummary = { id: number; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null };
export type TasksListEvent = Envelope & { type: "tasks.list"; project: string; tasks: TaskSummary[] };
export type Event = ShipGates | ResearchDone | RescueReport | DrivePaused | LoopStuck | PlanReady | DriveStep | DriveDone | TasksListEvent | ProofStepEvent | ProofResult | ApprovalResolved | AssistPromptDelta | AssistPromptDone | AssistPoint | AssistError | RunnerHello | AuthStatus | CheckpointCreated | AgentState | AgentTool | ApprovalRequest | CostUpdate | Receipt | ProtocolError;

export type Parsed<T> = { ok: true; msg: T } | { ok: false; error: string };

type Check = (m: Record<string, unknown>) => string | null;
const str: (k: string) => Check = (k) => (m) => (typeof m[k] === "string" && (m[k] as string).length > 0 ? null : `missing text field "${k}"`);
const num: (k: string) => Check = (k) => (m) => (typeof m[k] === "number" && Number.isFinite(m[k] as number) && (m[k] as number) >= 0 ? null : `missing or invalid number "${k}"`);
const bool: (k: string) => Check = (k) => (m) => (typeof m[k] === "boolean" ? null : `missing true or false "${k}"`);
const oneOf: (k: string, vals: string[]) => Check = (k, vals) => (m) => (vals.includes(m[k] as string) ? null : `"${k}" must be one of ${vals.join(", ")}`);
const list: (k: string) => Check = (k) => (m) => (Array.isArray(m[k]) ? null : `"${k}" must be a list`);
const obj: (k: string) => Check = (k) => (m) => (typeof m[k] === "object" && m[k] !== null && !Array.isArray(m[k]) ? null : `"${k}" must be an object`);

const COMMANDS: Record<string, Check[]> = {
  "agent.start": [str("project"), str("agent"), oneOf("mode", ["drive", "rescue", "research", "ship"]), str("prompt"), str("model"), num("budgetUsd")],
  "tasks.list": [str("project")],
  "drive.plan": [str("project"), str("agent"), str("goal"), str("model"), num("budgetUsd")],
  "drive.approve": [str("agent"), list("steps")],
  "ship.check": [str("project")],
  "research.ask": [str("project"), str("agent"), str("question"), str("model"), num("budgetUsd")],
  "rescue.diagnose": [str("project"), str("agent"), str("model"), num("budgetUsd")],
  "drive.pause": [str("agent"), oneOf("reason", ["editor", "terminal", "you"])],
  "drive.resume": [str("agent")],
  "loop.choose": [str("agent"), oneOf("choice", ["different", "stop"])],
  "agent.send": [str("agent"), str("text")],
  "agent.interrupt": [str("agent")],
  "agent.interruptAll": [str("reason")],
  "approval.resolve": [str("approval"), oneOf("decision", ["allow", "deny"]), oneOf("scope", ["once", "task"])],
  "checkpoint.restore": [str("project"), str("checkpoint")],
  "assist.prompt": [str("req"), str("app"), str("target"), str("text"), oneOf("style", ["full", "light"])],
  "assist.locate": [str("req"), str("question"), obj("image")],
  "assist.cancel": [str("req")],
};

const EVENTS: Record<string, Check[]> = {
  "runner.hello": [str("runnerVersion"), str("sdk")],
  "tasks.list": [str("project"), list("tasks")],
  "ship.gates": [str("project"), bool("canShip"), list("gates"), list("blockedBy"), list("needsYou"), list("confirmed"), num("allowedCount")],
  "research.done": [str("agent"), str("title"), str("answer"), list("notes"), str("file")],
  "rescue.report": [str("agent"), str("summary"), list("works"), str("broken"), list("steps"), list("evidence"), num("estimateUsd")],
  "drive.paused": [str("agent"), oneOf("reason", ["files_changed", "editor", "terminal", "you"])],
  "loop.stuck": [str("agent"), num("index"), str("title"), obj("failure"), list("options")],
  "plan.ready": [str("agent"), list("steps"), bool("truncated"), num("estimateUsd")],
  "drive.step": [str("agent"), num("index"), num("total"), str("title"), oneOf("status", ["started", "done", "not_done", "stopped", "over_budget"])],
  "drive.done": [str("agent"), str("status"), num("completed"), num("total"), num("usdEstimate")],
  "auth.status": [oneOf("method", ["api_key", "plan", "cloud", "none", "unknown"])],
  "checkpoint.created": [str("project"), str("agent"), str("checkpoint"), str("label"), num("files"), list("skipped")],
  "agent.state": [str("agent"), oneOf("state", ["idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"])],
  "agent.tool": [str("agent"), str("tool"), str("summary"), str("toolUseId"), bool("undoable")],
  "approval.request": [str("approval"), str("agent"), str("checkpoint"), str("toolUseId"), oneOf("risk", ["irreversible", "git", "outside_project", "install", "network"]), str("title"), str("expiresAt")],
  "cost.update": [str("agent"), num("usdEstimate"), str("basis"), obj("tokens")],
  "receipt": [str("agent"), str("checkpoint"), list("changed"), num("commands"), list("notUndoable"), oneOf("proof", ["passed", "failed", "skipped"]), num("usdEstimate")],
  "protocol.error": [str("reason")],
  "proof.step": [str("agent"), str("rung"), str("label"), oneOf("status", ["running", "passed", "failed", "skipped"]), (m) => (typeof m.detail === "string" ? null : "missing text field \"detail\"")],
  "proof.result": [str("agent"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"]), list("steps"), num("tries")],
  "approval.resolved": [str("approval"), str("agent"), oneOf("outcome", ["allowed", "denied", "expired", "cancelled"])],
  "assist.prompt.delta": [str("req"), str("text")],
  "assist.prompt.done": [str("req"), str("text"), list("diff"), num("usdEstimate"), oneOf("handback", ["paste", "copy"])],
  "assist.point": [str("req"), num("step"), num("x"), num("y"), str("targetText"), num("confidence"), str("caption")],
  "assist.error": [str("req"), str("reason")],
};

function parseWith<T>(line: string, table: Record<string, Check[]>): Parsed<T> {
  let m: unknown;
  try { m = JSON.parse(line); } catch { return { ok: false, error: "not JSON" }; }
  if (typeof m !== "object" || m === null || Array.isArray(m)) return { ok: false, error: "a message must be a JSON object" };
  const o = m as Record<string, unknown>;
  if (o.v !== PROTOCOL_VERSION) return { ok: false, error: `unsupported protocol version ${String(o.v)}; this runner speaks version ${PROTOCOL_VERSION}` };
  if (typeof o.id !== "string" || o.id.length === 0) return { ok: false, error: "missing id" };
  if (typeof o.type !== "string") return { ok: false, error: "missing type" };
  const checks = table[o.type];
  if (!checks) return { ok: false, error: `unknown type "${o.type}"` };
  for (const c of checks) {
    const e = c(o);
    if (e) return { ok: false, error: `${o.type}: ${e}` };
  }
  return { ok: true, msg: o as unknown as T };
}

export const parseCommand = (line: string): Parsed<Command> => parseWith<Command>(line, COMMANDS);
export const parseEvent = (line: string): Parsed<Event> => parseWith<Event>(line, EVENTS);
export const serialize = (msg: Command | Event): string => JSON.stringify(msg);
