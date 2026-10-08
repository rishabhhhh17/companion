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

export type Command = AgentStart | AgentSend | AgentInterrupt | AgentInterruptAll | ApprovalResolve | CheckpointRestore;

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

export type Event = RunnerHello | AuthStatus | CheckpointCreated | AgentState | AgentTool | ApprovalRequest | CostUpdate | Receipt | ProtocolError;

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
  "agent.send": [str("agent"), str("text")],
  "agent.interrupt": [str("agent")],
  "agent.interruptAll": [str("reason")],
  "approval.resolve": [str("approval"), oneOf("decision", ["allow", "deny"]), oneOf("scope", ["once", "task"])],
  "checkpoint.restore": [str("project"), str("checkpoint")],
};

const EVENTS: Record<string, Check[]> = {
  "runner.hello": [str("runnerVersion"), str("sdk")],
  "auth.status": [oneOf("method", ["api_key", "plan", "cloud", "none", "unknown"])],
  "checkpoint.created": [str("project"), str("agent"), str("checkpoint"), str("label"), num("files"), list("skipped")],
  "agent.state": [str("agent"), oneOf("state", ["idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"])],
  "agent.tool": [str("agent"), str("tool"), str("summary"), str("toolUseId"), bool("undoable")],
  "approval.request": [str("approval"), str("agent"), str("checkpoint"), str("toolUseId"), oneOf("risk", ["irreversible", "git", "outside_project", "install", "network"]), str("title"), str("expiresAt")],
  "cost.update": [str("agent"), num("usdEstimate"), str("basis"), obj("tokens")],
  "receipt": [str("agent"), str("checkpoint"), list("changed"), num("commands"), list("notUndoable"), oneOf("proof", ["passed", "failed", "skipped"]), num("usdEstimate")],
  "protocol.error": [str("reason")],
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
