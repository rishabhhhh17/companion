// Companion protocol, version 1. One JSON object per line.
// Commands go app -> runner. Events go runner -> app. Lines with an unknown
// version, an unknown type, or missing fields are refused, never guessed.

export const PROTOCOL_VERSION = 1 as const;

export type Envelope = { v: 1; id: string; ts?: string; project?: string; agent?: string };

export type AgentStart = Envelope & {
  type: "agent.start"; project: string; agent: string; mode: "drive" | "rescue" | "research" | "ship";
  prompt: string; model: string; budgetUsd: number; offTheRecord?: boolean;
};
export type AgentSend = Envelope & { type: "agent.send"; agent: string; text: string };
export type AgentInterrupt = Envelope & { type: "agent.interrupt"; agent: string };
export type AgentInterruptAll = Envelope & { type: "agent.interruptAll"; reason: string };
export type ApprovalResolve = Envelope & { type: "approval.resolve"; approval: string; decision: "allow" | "deny"; scope: "once" | "task" };
export type CheckpointRestore = Envelope & { type: "checkpoint.restore"; project: string; checkpoint: string };

export type AssistPrompt = Envelope & { type: "assist.prompt"; req: string; app: string; target: string; text: string; style: "full" | "light"; answer?: string; noQuestion?: boolean };
export type AssistLocate = Envelope & { type: "assist.locate"; req: string; question: string; image: { ref: string; w: number; h: number }; ocr?: { id: string; text: string; box: number[] }[]; walkthrough?: boolean };
export type AssistImage = Envelope & { type: "assist.image"; ref: string; mediaType: "image/jpeg" | "image/png"; base64: string; w: number; h: number };
export type AssistCancel = Envelope & { type: "assist.cancel"; req: string };

export type RunnerPing = Envelope & { type: "runner.ping" };
export type ShipCheck = Envelope & { type: "ship.check"; project: string; runChecks?: boolean; confirm?: string[] };
export type ResearchAsk = Envelope & { type: "research.ask"; project: string; agent: string; question: string; model: string; budgetUsd: number };
export type RescueDiagnose = Envelope & { type: "rescue.diagnose"; project: string; agent: string; model: string; budgetUsd: number };
export type DrivePlan = Envelope & { type: "drive.plan"; project: string; agent: string; goal: string; model: string; budgetUsd: number; offTheRecord?: boolean };
export type DriveApprove = Envelope & { type: "drive.approve"; agent: string; steps: string[] };
export type LoopChoose = Envelope & { type: "loop.choose"; agent: string; choice: "different" | "stop" };
export type DrivePause = Envelope & { type: "drive.pause"; agent: string; reason: "editor" | "terminal" | "you" };
export type DriveResume = Envelope & { type: "drive.resume"; agent: string };
export type TasksList = Envelope & { type: "tasks.list"; project: string };
export type MemoryScope = "project" | "profile";
export type MemoryList = Envelope & { type: "memory.list"; project: string };
export type MemoryForget = Envelope & { type: "memory.forget"; project: string; scope: MemoryScope; line: string };
export type MemoryEdit = Envelope & { type: "memory.edit"; project: string; scope: MemoryScope; line: string; text: string };
export type MemoryPause = Envelope & { type: "memory.pause"; project: string; paused: boolean };
export type MemoryErase = Envelope & { type: "memory.erase"; project: string; scope: MemoryScope };
export type MemoryExport = Envelope & { type: "memory.export"; project: string };
export type MemoryAgents = Envelope & { type: "memory.agents"; project: string; answer: "yes" | "no" | "remove" };
export type RecapAsk = Envelope & { type: "recap.ask"; project: string; since: string };
export type ExplainSet = Envelope & { type: "explain.set"; project: string; enabled: boolean };
export type ShipPreview = Envelope & { type: "ship.preview"; project: string };
export type ShipLive = Envelope & { type: "ship.live"; project: string; url: string; confirm: true };
export type ShipRollback = Envelope & { type: "ship.rollback"; project: string; confirm: true };
export type AuthCheck = Envelope & { type: "auth.check" };
export type MemoryAdd = Envelope & { type: "memory.add"; project: string; scope: MemoryScope; text: string; source: string };
export type DoctorCheck = Envelope & { type: "doctor.check" };
export type ProblemFind = Envelope & { type: "problem.find"; project: string; agent: string };
export type DiagramAsk = Envelope & { type: "diagram.ask"; project: string; question: string; problem?: { kind?: string; file?: string; line?: number; message?: string } };
export type ProjectInspect = Envelope & { type: "project.inspect"; project: string };
export type ProjectInstall = Envelope & { type: "project.install"; project: string };
export type ProjectClone = Envelope & { type: "project.clone"; url: string; parent: string };
// Walkthroughs: lessons are data files; the runner keeps the place, the app draws the ring and notices the click.
export type WalkList = Envelope & { type: "walk.list"; project: string };
export type WalkStart = Envelope & { type: "walk.start"; project: string; lesson: string; fresh?: boolean };
export type WalkActed = Envelope & { type: "walk.acted"; walk: string; index?: number; how: "clicked" | "done_for_you" };
export type WalkAnswer = Envelope & { type: "walk.answer"; walk: string; index?: number; worked: boolean };
export type WalkSkip = Envelope & { type: "walk.skip"; walk: string; index?: number };
export type WalkStop = Envelope & { type: "walk.stop"; walk: string };
// Beta numbers: counts per day on this Mac, off unless turned on, never any content.
export type MetricsSet = Envelope & { type: "metrics.set"; enabled: boolean };
export type MetricsNote = Envelope & { type: "metrics.note"; name: string };
export type MetricsShow = Envelope & { type: "metrics.show" };
export type MetricsErase = Envelope & { type: "metrics.erase" };
export type Command = MetricsSet | MetricsNote | MetricsShow | MetricsErase | WalkList | WalkStart | WalkActed | WalkAnswer | WalkSkip | WalkStop | DiagramAsk | ProjectInspect | ProjectInstall | ProjectClone | ProblemFind | DoctorCheck | AuthCheck | MemoryAdd | AssistImage | ShipPreview | ShipLive | ShipRollback | RecapAsk | ExplainSet | MemoryAgents | MemoryList | MemoryForget | MemoryEdit | MemoryPause | MemoryErase | MemoryExport | RunnerPing | ShipCheck | ResearchAsk | RescueDiagnose | DrivePause | DriveResume | LoopChoose | DrivePlan | DriveApprove | TasksList | AssistPrompt | AssistLocate | AssistCancel | AgentStart | AgentSend | AgentInterrupt | AgentInterruptAll | ApprovalResolve | CheckpointRestore;

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
  picture?: boolean;   // a before and after picture is being made and will follow as receipt.visual
  inPlan?: boolean;    // one step of an approved plan (Drive); the plan as a whole ends with drive.done
};
export type ProtocolError = Envelope & { type: "protocol.error"; reason: string; line?: string };

export type AssistPromptDelta = Envelope & { type: "assist.prompt.delta"; req: string; text: string };
export type AssistPromptDone = Envelope & { type: "assist.prompt.done"; req: string; text: string; question?: string; options?: string[]; diff: [string, string][]; usdEstimate: number; handback: "paste" | "copy" };
export type AssistPoint = Envelope & { type: "assist.point"; req: string; step: number; x: number; y: number; ocrId?: string; targetText: string; confidence: number; caption: string };
export type AssistError = Envelope & { type: "assist.error"; req: string; reason: string };

// Where a check failed: a line in the project, a button in the app, or at least the error sentence.
export type Problem =
  | { kind: "line"; file: string; line: number; column?: number; lineText: string; message: string; from: string }
  | { kind: "button"; label: string; message: string; from: "browser" }
  | { kind: "message"; message: string; from: string };
export type ProofStep = { rung: string; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; ms?: number; problem?: Problem };
export type ProblemFound = Envelope & { type: "problem.found"; project: string; agent: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; label?: string; detail?: string; problem?: Problem };
export type ProofStepEvent = Envelope & { type: "proof.step"; agent: string } & ProofStep;
export type ProofResult = Envelope & { type: "proof.result"; agent: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; steps: ProofStep[]; tries: number };

export type ApprovalResolved = Envelope & { type: "approval.resolved"; approval: string; agent: string; outcome: "allowed" | "denied" | "expired" | "cancelled" };

export type PlanReady = Envelope & { type: "plan.ready"; agent: string; steps: { id: number; title: string }[]; truncated: boolean; estimateUsd: number };
export type DriveStep = Envelope & { type: "drive.step"; agent: string; index: number; total: number; title: string; status: "started" | "done" | "not_done" | "stopped" | "over_budget" };
export type DriveDone = Envelope & { type: "drive.done"; agent: string; status: string; completed: number; total: number; usdEstimate: number };
export type RunnerPong = Envelope & { type: "runner.pong" };
export type ShipGates = Envelope & { type: "ship.gates"; project: string; canShip: boolean; gates: { id: string; label: string; status: "passed" | "blocked" | "could_not_check" | "not_applicable"; detail: string; findings?: string[]; overridable?: boolean }[]; blockedBy: string[]; needsYou: string[]; confirmed: string[]; allowedCount: number };
export type ResearchDone = Envelope & { type: "research.done"; agent: string; title: string; answer: string; notes: { text: string; source: string }[]; file: string };
export type RescueReport = Envelope & { type: "rescue.report"; agent: string; summary: string; works: string[]; broken: string; steps: { id: number; title: string }[]; evidence: { label: string; status: string; detail: string }[]; estimateUsd: number };
export type DrivePaused = Envelope & { type: "drive.paused"; agent: string; reason: "files_changed" | "editor" | "terminal" | "you"; path?: string };
export type LoopStuck = Envelope & { type: "loop.stuck"; agent: string; index: number; title: string; failure: { label: string; detail: string }; options: { id: string; label: string }[] };
export type TaskSummary = { id: number; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null };
export type TasksListEvent = Envelope & { type: "tasks.list"; project: string; tasks: TaskSummary[] };
// made: false means no picture after all (stopped, or it could not be made); the card stops waiting for it.
export type ReceiptVisual = Envelope & { type: "receipt.visual"; agent: string; project: string; checkpoint: string; made: boolean; image?: string; caption: string; circles: number; file?: string };
export type ShipCard = Envelope & { type: "ship.card"; project: string; url: string; title: string; image: string; withShot: boolean };
export type ProjectReportEvent = Envelope & { type: "project.report"; project: string; origin: "lovable" | "bolt" | "replit" | "unknown"; about: string; stack: string; needsInstall: boolean; installCommand: string | null; start: string | null; missing: string[]; missingCount: number; example: string | null; notes: string[] };
export type ProjectInstallEvent = Envelope & { type: "project.install"; project: string; stage: "installing" | "done" | "failed" | "cancelled"; detail: string };
export type ProjectCloned = Envelope & { type: "project.cloned"; url: string; ok: boolean; path?: string; detail: string };
// The diagram is data: the page lays it out and the overlay draws it. made: false means none could be made.
export type DiagramReady = Envelope & { type: "diagram.ready"; project: string; ask?: string; made: boolean; reason?: string; diagram?: { nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[]; broken: { node: string; reason: string } | { edge: [string, string]; reason: string }; caption: string }; usdEstimate?: number };
export type WalkLessons = Envelope & { type: "walk.lessons"; project: string; lessons: { id: string; title: string; app: string; goal: string; status: "draft" | "tried"; steps: number; saved: boolean }[]; problems?: number };
export type WalkStepEvent = Envelope & { type: "walk.step"; walk: string; project: string; lesson: string; title: string; index: number; total: number; variant: "main" | "instead"; say: string; find: string; ask: boolean; log?: { say: string; how: "done" | "skipped" }[] };
export type WalkAsk = Envelope & { type: "walk.ask"; walk: string; index: number };
export type WalkHelp = Envelope & { type: "walk.help"; walk: string; say: string };
export type WalkDone = Envelope & { type: "walk.done"; walk: string; project: string; lesson: string; title: string; steps: number };
export type WalkStopped = Envelope & { type: "walk.stopped"; walk: string; reason: string };
export type MetricsSummary = Envelope & { type: "metrics.summary"; enabled: boolean; days: Record<string, Record<string, number>>; totals: Record<string, number>; rates: Record<string, number | null> };
export type Event = MetricsSummary | WalkLessons | WalkStepEvent | WalkAsk | WalkHelp | WalkDone | WalkStopped | DiagramReady | ProjectReportEvent | ProjectInstallEvent | ProjectCloned | ShipCard | ReceiptVisual | ProblemFound | RunnerPong | ShipGates | ResearchDone | RescueReport | DrivePaused | LoopStuck | PlanReady | DriveStep | DriveDone | TasksListEvent | ProofStepEvent | ProofResult | ApprovalResolved | AssistPromptDelta | AssistPromptDone | AssistPoint | AssistError | RunnerHello | AuthStatus | CheckpointCreated | AgentState | AgentTool | ApprovalRequest | CostUpdate | Receipt | ProtocolError;

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
  "runner.ping": [],
  "ship.preview": [str("project")],
  "ship.live": [str("project"), str("url"), (m) => (m.confirm === true ? null : 'going live needs "confirm": true')],
  "ship.rollback": [str("project"), (m) => (m.confirm === true ? null : 'a rollback needs "confirm": true')],
  "auth.check": [],
  "doctor.check": [],
  "problem.find": [str("project"), str("agent")],
  "diagram.ask": [str("project"), str("question")],
  "metrics.set": [bool("enabled")],
  "metrics.note": [str("name")],
  "metrics.show": [],
  "metrics.erase": [],
  "walk.list": [str("project")],
  "walk.start": [str("project"), str("lesson")],
  "walk.acted": [str("walk"), oneOf("how", ["clicked", "done_for_you"])],
  "walk.answer": [str("walk"), bool("worked")],
  "walk.skip": [str("walk")],
  "walk.stop": [str("walk")],
  "project.inspect": [str("project")],
  "project.install": [str("project")],
  "project.clone": [str("url"), str("parent")],
  "memory.add": [str("project"), oneOf("scope", ["project", "profile"]), str("text"), str("source")],
  "recap.ask": [str("project"), str("since")],
  "explain.set": [str("project"), bool("enabled")],
  "memory.list": [str("project")],
  "memory.forget": [str("project"), oneOf("scope", ["project", "profile"]), str("line")],
  "memory.edit": [str("project"), oneOf("scope", ["project", "profile"]), str("line"), str("text")],
  "memory.pause": [str("project"), bool("paused")],
  "memory.erase": [str("project"), oneOf("scope", ["project", "profile"])],
  "memory.export": [str("project")],
  "memory.agents": [str("project"), oneOf("answer", ["yes", "no", "remove"])],
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
  "assist.image": [str("ref"), oneOf("mediaType", ["image/jpeg", "image/png"]), str("base64"), num("w"), num("h")],
};

const EVENTS: Record<string, Check[]> = {
  "runner.hello": [str("runnerVersion"), str("sdk")],
  "tasks.list": [str("project"), list("tasks")],
  "runner.pong": [],
  "memory.state": [str("project"), bool("paused"), list("projectLines"), list("profileLines"), list("problems")],
  "memory.saved": [str("project"), oneOf("scope", ["project", "profile"]), str("line"), str("text"), str("source")],
  "ship.status": [str("project"), oneOf("stage", ["checking_gates", "not_signed_in", "deploying", "checking_preview", "ready", "failed", "refused", "live", "rolled_back"]), str("detail")],
  "doctor.report": [list("items")],
  "diagram.ready": [str("project"), bool("made")],
  "metrics.summary": [bool("enabled"), obj("days"), obj("totals"), obj("rates")],
  "walk.lessons": [str("project"), list("lessons")],
  "walk.step": [str("walk"), str("project"), str("lesson"), str("title"), num("index"), num("total"), oneOf("variant", ["main", "instead"]), str("say"), str("find"), bool("ask")],
  "walk.ask": [str("walk"), num("index")],
  "walk.help": [str("walk"), str("say")],
  "walk.done": [str("walk"), str("project"), str("lesson"), str("title"), num("steps")],
  "walk.stopped": [str("walk"), str("reason")],
  "project.report": [str("project"), oneOf("origin", ["lovable", "bolt", "replit", "unknown"]), str("about"), str("stack"), bool("needsInstall"), list("missing"), num("missingCount"), list("notes")],
  "project.install": [str("project"), oneOf("stage", ["installing", "done", "failed", "cancelled"]), (m) => (typeof m.detail === "string" ? null : "missing text field \"detail\"")],
  "project.cloned": [str("url"), bool("ok"), str("detail")],
  "ship.card": [str("project"), str("url"), str("title"), str("image"), bool("withShot")],
  "receipt.visual": [str("agent"), str("project"), str("checkpoint"), bool("made"), (m) => (m.made !== true || (typeof m.image === "string" && m.image.length > 0) ? null : "a made picture needs \"image\""), num("circles")],
  "problem.found": [str("project"), str("agent"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"])],
  "explain.ready": [str("agent"), str("checkpoint"), list("bullets"), num("usdEstimate")],
  "explain.state": [str("project"), bool("enabled")],
  "recap.ready": [str("project"), list("lines")],
  "memory.agents_ask": [str("project"), list("files")],
  "memory.agents_written": [str("project"), list("files")],
  "memory.refused": [str("project"), str("reason")],
  "memory.exported": [str("project"), str("text")],
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
// Half an emoji is not valid text and the app refuses it, so any stray half is replaced before a message is sent.
export const serialize = (msg: Command | Event): string => JSON.stringify(msg, (_k, v) => (typeof v === "string" ? v.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd") : v));
