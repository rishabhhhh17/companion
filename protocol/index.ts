// Companion protocol, version 1. One JSON object per line.
// Commands go app -> runner. Events go runner -> app. Lines with an unknown
// version, an unknown type, or missing fields are refused, never guessed.

export const PROTOCOL_VERSION = 1 as const;

export type Envelope = { v: 1; id: string; ts?: string; project?: string; agent?: string };

// files and images: what the person dragged onto Home or pasted into the ask box (runner/src/attach.ts has the rules, and
// the engine checks them again): text and code files, secrets already hidden, and PNG or JPEG pictures. Sent only with Start.
export type AgentStart = Envelope & {
  type: "agent.start"; project: string; agent: string; mode: "drive" | "rescue" | "research" | "ship";
  prompt: string; model: string; budgetUsd: number; offTheRecord?: boolean;
  files?: { name: string; text: string }[]; images?: { name: string; mediaType: "image/png" | "image/jpeg"; base64: string }[];
  // practice: the practice project this task fixes (an id in app/sample/practices.json). The engine only echoes it on the
  // task's checkpoint.created and receipt, so the page knows that receipt is the practice's own; it changes nothing else.
  practice?: string;
};
// A follow up on the agent's last task (text: what is still wrong), or Try again (retry: the same request again, with
// what failed). Either runs as a new checked task that carries on the last task's conversation. It names the project, so the
// app holds it to the folder the person chose; the runner refuses it for any other project.
export type AgentSend = Envelope & { type: "agent.send"; agent: string; project: string; text?: string; retry?: boolean };
export type AgentInterrupt = Envelope & { type: "agent.interrupt"; agent: string };
export type AgentInterruptAll = Envelope & { type: "agent.interruptAll"; reason: string };
export type ApprovalResolve = Envelope & { type: "approval.resolve"; approval: string; decision: "allow" | "deny"; scope: "once" | "task" };
export type CheckpointRestore = Envelope & { type: "checkpoint.restore"; project: string; checkpoint: string };

export type AssistPrompt = Envelope & { type: "assist.prompt"; req: string; app: string; target: string; text: string; style: "full" | "light"; answer?: string; noQuestion?: boolean };
// screens: when Show me looked at more than one screen (2 to 4), one picture each, the screen the mouse pointer is on first
// (its ref is the same as image.ref). label is "Screen N of M"; the engine sends only that exact shape to the model.
export type AssistLocate = Envelope & { type: "assist.locate"; req: string; question: string; image: { ref: string; w: number; h: number }; ocr?: { id: string; text: string; box: number[]; screen?: number }[]; walkthrough?: boolean; screens?: { ref: string; w: number; h: number; label: string }[] };
export type AssistImage = Envelope & { type: "assist.image"; ref: string; mediaType: "image/jpeg" | "image/png"; base64: string; w: number; h: number };
export type AssistCancel = Envelope & { type: "assist.cancel"; req: string };

export type RunnerPing = Envelope & { type: "runner.ping" };
export type ShipCheck = Envelope & { type: "ship.check"; project: string; runChecks?: boolean; confirm?: string[] };
// offTheRecord: the Off the record box was ticked. Nothing is learned or told from memory, no conversation is saved, Research
// files no notes, and the steps of a Rescue plan run off the record too.
export type ResearchAsk = Envelope & { type: "research.ask"; project: string; agent: string; question: string; model: string; budgetUsd: number; offTheRecord?: boolean };
export type RescueDiagnose = Envelope & { type: "rescue.diagnose"; project: string; agent: string; model: string; budgetUsd: number; offTheRecord?: boolean };
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
// Explain after a task (the setting explain.mode, T16): off, two short reasons, or the reasons and a quick check question.
// Only the shell sends explain.set; the engine keeps the choice in memory-settings.json.
export const EXPLAIN_MODES = ["off", "reasons", "reasonsAndQuestion"] as const;
export type ExplainMode = (typeof EXPLAIN_MODES)[number];
export type ExplainSet = Envelope & { type: "explain.set"; project: string; mode: ExplainMode };
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
// clicked and done_for_you come from the ring (the person's click there, or Do it for me). pressed is the person's own "I did
// it" on the card. A ring click is not the moment of proof (it points at where a value comes from, before it is saved), so on
// a step the project proves only pressed can count it as not working; a click it cannot prove yet gets walk.wait.
export type WalkActed = Envelope & { type: "walk.acted"; walk: string; index?: number; how: "clicked" | "done_for_you" | "pressed" };
export type WalkAnswer = Envelope & { type: "walk.answer"; walk: string; index?: number; worked: boolean };
export type WalkSkip = Envelope & { type: "walk.skip"; walk: string; index?: number };
export type WalkStop = Envelope & { type: "walk.stop"; walk: string };
// Beta numbers: counts per day on this Mac, off unless turned on, never any content.
export type MetricsSet = Envelope & { type: "metrics.set"; enabled: boolean };
export type MetricsNote = Envelope & { type: "metrics.note"; name: string };
export type MetricsShow = Envelope & { type: "metrics.show" };
export type MetricsErase = Envelope & { type: "metrics.erase" };
// The browser check (F14): ask whether the hidden browser is set up, and download it once when the person presses the button.
// Neither names a folder or an address: the engine always downloads Playwright's own browser into Companion's own folder.
export type BrowserCheck = Envelope & { type: "browser.check" };
export type BrowserInstall = Envelope & { type: "browser.install" };
// The daily spending limit (an estimate of the person's own Claude use, per project per day): shown and changed in Settings.
export type SpendingShow = Envelope & { type: "spending.show"; project: string };
export type SpendingSet = Envelope & { type: "spending.set"; project: string; limitUsd: number };
// Which task broke it: check earlier saved versions of the project in a private copy (never the project itself) and name the
// first task after which the failing check fails. Undoing just that task needs "confirm": true and the task that was found.
export type BisectStart = Envelope & { type: "bisect.start"; project: string; agent: string };
export type BisectUndo = Envelope & { type: "bisect.undo"; project: string; checkpoint: string; confirm: true };
// The error explainer: text the person selected in another app, read on the hotkey (Rust sends it, never a page). The runner
// hides secrets in it before it goes anywhere.
export type ErrorExplain = Envelope & { type: "error.explain"; req: string; app: string; text: string; project?: string };
// Your turn (F16, F17): after a fix that made the same small change in two places, the person asks to make the second one
// themselves (try), then asks for the proof ladder on their own change (check). Each names the task's receipt checkpoint.
export type TeachTry = Envelope & { type: "teach.try"; project: string; checkpoint: string };
export type TeachCheck = Envelope & { type: "teach.check"; project: string; agent: string; checkpoint: string };
// A zero cost warm up (runner/src/warm.ts), sent by the page when Home opens or the ask box gets the keyboard: the engine
// reads the bundled Claude binary through once so the first task starts sooner. Nothing is run, sent or spent. Names nothing.
export type EngineWarm = Envelope & { type: "engine.warm" };
// The settings the engine applies (the registry, protocol/settings.json, T16): only the shell sends it, as the first line
// after every start, after each change the engine applies, and when the project folder changes. values: every setting the
// engine applies that is not its usual value (a missing name is its usual value); projectValues: the named project's own.
// Each one replaces the one before. The engine checks every value again and keeps them in memory only.
export type SettingsApply = Envelope & { type: "settings.apply"; values: Record<string, unknown>; project?: string; projectValues?: Record<string, unknown> };
export type Command = SettingsApply | EngineWarm | BisectStart | BisectUndo | ErrorExplain | TeachTry | TeachCheck | SpendingShow | SpendingSet | BrowserCheck | BrowserInstall | MetricsSet | MetricsNote | MetricsShow | MetricsErase | WalkList | WalkStart | WalkActed | WalkAnswer | WalkSkip | WalkStop | DiagramAsk | ProjectInspect | ProjectInstall | ProjectClone | ProblemFind | DoctorCheck | AuthCheck | MemoryAdd | AssistImage | ShipPreview | ShipLive | ShipRollback | RecapAsk | ExplainSet | MemoryAgents | MemoryList | MemoryForget | MemoryEdit | MemoryPause | MemoryErase | MemoryExport | RunnerPing | ShipCheck | ResearchAsk | RescueDiagnose | DrivePause | DriveResume | LoopChoose | DrivePlan | DriveApprove | TasksList | AssistPrompt | AssistLocate | AssistCancel | AgentStart | AgentSend | AgentInterrupt | AgentInterruptAll | ApprovalResolve | CheckpointRestore;

export type AgentStateName = "idle" | "listening" | "thinking" | "working" | "checking" | "needsYou" | "done" | "error";

export type RunnerHello = Envelope & { type: "runner.hello"; runnerVersion: string; sdk: string; claudeCode?: string };
export type AuthStatus = Envelope & { type: "auth.status"; method: "api_key" | "plan" | "cloud" | "none" | "unknown"; source?: string };
export type CheckpointCreated = Envelope & {
  type: "checkpoint.created"; project: string; agent: string; checkpoint: string; label: string; files: number;
  skipped: { path: string; reason: string }[];
  practice?: string;   // the practice id the task was started with, echoed back
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
// A line in the project as it is now (1-based), with its text (secrets hidden), so the person's editor can show it and the
// ring can find it on screen.
export type ChangeAt = { file: string; line: number; lineText: string };
export type Receipt = Envelope & {
  type: "receipt"; agent: string; checkpoint: string; changed: { file: string; kind: "added" | "modified" | "deleted" }[];
  commands: number; notUndoable: string[]; proof: "passed" | "partial" | "failed" | "skipped"; usdEstimate: number;
  picture?: boolean;   // a before and after picture is being made and will follow as receipt.visual
  inPlan?: boolean;    // one step of an approved plan (Drive); the plan as a whole ends with drive.done
  changedAt?: ChangeAt;   // the first changed line, for "Show me what changed"
  repeat?: { first: ChangeAt; second: ChangeAt; was: string; now: string };   // the same small change made in two places (was -> now)
  practice?: string;   // the practice id the task was started with, echoed back
  said?: string;   // the agent's last words, the message it ended on: secrets hidden, clipped (runner/src/asks.ts)
  asks?: boolean;  // those words stop to ask the person something: the follow up box is where they answer
};
// Explain: two short lines of why and one check question. step: which Drive step it explains.
export type ExplainReady = Envelope & { type: "explain.ready"; agent: string; checkpoint: string; bullets: string[]; question?: { text: string; options: string[]; correct: number }; step?: { index: number; title: string }; usdEstimate: number };
// Your turn. made: false says why nothing was changed. target: the second place, now as it was before the fix. example: the
// first place, as it was and as it is. change: the words that changed. restore: the checkpoint that puts the whole fix back.
export type TeachReady = Envelope & { type: "teach.ready"; project: string; checkpoint: string; made: boolean; reason?: string; target?: ChangeAt; example?: { file: string; line: number; was: string; now: string }; change?: { was: string; now: string }; restore?: string };
// same: the person's change matches the fix Companion made there. The verdict is the proof ladder's, on their change.
// "cancelled" with a reason: nothing was checked (their place is still untouched, nothing is waiting, or something was busy).
export type TeachResult = Envelope & { type: "teach.result"; project: string; checkpoint: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; same: boolean; label?: string; detail?: string; problem?: Problem; reason?: string };
// One rung of the check of the person's own change, as it runs. Its own event, so it is never taken for the finished task's proof.
export type TeachStep = Envelope & { type: "teach.step"; project: string; checkpoint: string } & ProofStep;
export type ProtocolError = Envelope & { type: "protocol.error"; reason: string; line?: string };

export type AssistPromptDelta = Envelope & { type: "assist.prompt.delta"; req: string; text: string };
export type AssistPromptDone = Envelope & { type: "assist.prompt.done"; req: string; text: string; question?: string; options?: string[]; diff: [string, string][]; usdEstimate: number; handback: "paste" | "copy" };
// One target, or (targets) up to five in the order to look at them, the first being the same as the top level fields.
// mark: how it is drawn when confirmed (a guess only ever gets the soft ring). screen: 1 is the screen the pointer is on.
export type PointMark = "ring" | "arrow" | "underline" | "box";
export type PointTarget = { x: number; y: number; ocrId?: string; targetText: string; confidence: number; caption: string; mark?: PointMark; screen?: number };
/** lastStepWorked: when the question said the step before was clicked but not checked yet, whether the screen shows it
 *  worked (a judgment from the picture, never proof). */
export type AssistPoint = Envelope & { type: "assist.point"; req: string; step: number; x: number; y: number; ocrId?: string; targetText: string; confidence: number; caption: string; mark?: PointMark; screen?: number; targets?: PointTarget[]; lastStepWorked?: "yes" | "no" | "unsure" };
export type AssistError = Envelope & { type: "assist.error"; req: string; reason: string };

// Where a check failed: a line in the project, a button in the app, or at least the error sentence.
export type Problem =
  | { kind: "line"; file: string; line: number; column?: number; lineText: string; message: string; from: string }
  | { kind: "button"; label: string; message: string; from: "browser" }
  | { kind: "message"; message: string; from: string };
// needs: "browser" means this step was skipped only because the hidden browser is not installed, so the page can offer it.
export type ProofStep = { rung: string; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; ms?: number; problem?: Problem; needs?: "browser" };
// note: one plain line about a check that could not run (the Vercel tool missing or signed out), with what to do.
// A problem with from "deploy" is the line the last Vercel deploy failed at, confirmed in this folder.
export type ProblemFound = Envelope & { type: "problem.found"; project: string; agent: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; label?: string; detail?: string; problem?: Problem; needs?: "browser"; note?: string };
export type ProofStepEvent = Envelope & { type: "proof.step"; agent: string } & ProofStep;
export type ProofResult = Envelope & { type: "proof.result"; agent: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; steps: ProofStep[]; tries: number };

export type ApprovalResolved = Envelope & { type: "approval.resolved"; approval: string; agent: string; outcome: "allowed" | "denied" | "expired" | "cancelled" };

export type PlanReady = Envelope & { type: "plan.ready"; agent: string; steps: { id: number; title: string }[]; truncated: boolean; estimateUsd: number };
export type DriveStep = Envelope & { type: "drive.step"; agent: string; index: number; total: number; title: string; status: "started" | "done" | "not_done" | "stopped" | "over_budget" };
export type DriveDone = Envelope & { type: "drive.done"; agent: string; status: string; completed: number; total: number; usdEstimate: number };
export type RunnerPong = Envelope & { type: "runner.pong" };
export type ShipGates = Envelope & { type: "ship.gates"; project: string; canShip: boolean; gates: { id: string; label: string; status: "passed" | "blocked" | "could_not_check" | "not_applicable"; detail: string; findings?: string[]; overridable?: boolean; places?: { table: string; file: string; line: number; lineText: string }[] }[]; blockedBy: string[]; needsYou: string[]; confirmed: string[]; allowedCount: number };
// file: where the notes were filed in the project; none off the record, where nothing is kept.
export type ResearchDone = Envelope & { type: "research.done"; agent: string; title: string; answer: string; notes: { text: string; source: string }[]; file?: string };
export type RescueReport = Envelope & { type: "rescue.report"; agent: string; summary: string; works: string[]; broken: string; steps: { id: number; title: string }[]; evidence: { label: string; status: string; detail: string }[]; estimateUsd: number };
export type DrivePaused = Envelope & { type: "drive.paused"; agent: string; reason: "files_changed" | "editor" | "terminal" | "you"; path?: string };
// index: the Drive step (from 1); 0 for a single task, whose title is the task's label.
// tries and same: how the tries ran out, sent only when it was not the usual three identical failures (the settings
// work.tries and work.askOnAnyFailure): how many checks failed in a row, and whether all of them the same way.
export type LoopStuck = Envelope & { type: "loop.stuck"; agent: string; index: number; title: string; failure: { label: string; detail: string }; options: { id: string; label: string }[]; tries?: number; same?: boolean };
export type TaskSummary = { id: number; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null };
export type TasksListEvent = Envelope & { type: "tasks.list"; project: string; tasks: TaskSummary[] };
// made: false means no picture after all (stopped, or it could not be made); the card stops waiting for it.
export type ReceiptVisual = Envelope & { type: "receipt.visual"; agent: string; project: string; checkpoint: string; made: boolean; image?: string; caption: string; circles: number; file?: string };
export type ShipCard = Envelope & { type: "ship.card"; project: string; url: string; title: string; image: string; withShot: boolean };
// scripts, checks, proofFile and launchFile: what the Settings rows for checking this project need (its own script names,
// the checks it has, and its own .claude/proof.json and .claude/launch.json, which win over Settings).
export type ProjectReportEvent = Envelope & { type: "project.report"; project: string; origin: "lovable" | "bolt" | "replit" | "unknown"; about: string; stack: string; needsInstall: boolean; installCommand: string | null; start: string | null; missing: string[]; missingCount: number; example: string | null; notes: string[];
  scripts?: string[]; checks?: ("typecheck" | "lint" | "build" | "test")[]; proofFile?: { expectText: string[]; click: string | null; expectAfterClick: string | null } | null; launchFile?: boolean };
export type ProjectInstallEvent = Envelope & { type: "project.install"; project: string; stage: "installing" | "done" | "failed" | "cancelled"; detail: string };
export type ProjectCloned = Envelope & { type: "project.cloned"; url: string; ok: boolean; path?: string; detail: string };
// The diagram is data: the page lays it out and the overlay draws it. made: false means none could be made.
export type DiagramReady = Envelope & { type: "diagram.ready"; project: string; ask?: string; made: boolean; reason?: string; diagram?: { nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[]; broken: { node: string; reason: string } | { edge: [string, string]; reason: string }; caption: string }; usdEstimate?: number };
// fromProject: made from this project's own setting names (runner/src/lessongen.ts), not a lesson file.
export type WalkLessons = Envelope & { type: "walk.lessons"; project: string; lessons: { id: string; title: string; app: string; goal: string; status: "draft" | "tried"; needsProject?: boolean; fromProject?: boolean; steps: number; saved: boolean }[]; problems?: number };
// already: after a pause, the person is first asked "Did you already do this?" and nothing is pointed at until they answer
// (Yes and No come back as walk.answer). Absent on every other step. passed: on the first step of a lesson that started
// where the person already is (teach.startWhereYouAre), how many steps were passed by as already done.
export type WalkStepEvent = Envelope & { type: "walk.step"; walk: string; project: string; lesson: string; title: string; index: number; total: number; variant: "main" | "instead"; say: string; find: string; ask: boolean; already?: boolean; log?: { say: string; how: "done" | "skipped" }[]; link?: string; passed?: number };
export type WalkAsk = Envelope & { type: "walk.ask"; walk: string; index: number };
export type WalkHelp = Envelope & { type: "walk.help"; walk: string; say: string };
// The step stays as it is: the project does not show its result yet (say: what is not there, in plain words). Not a failure.
export type WalkWait = Envelope & { type: "walk.wait"; walk: string; index: number; say: string };
export type WalkDone = Envelope & { type: "walk.done"; walk: string; project: string; lesson: string; title: string; steps: number };
export type WalkStopped = Envelope & { type: "walk.stopped"; walk: string; reason: string };
export type MetricsSummary = Envelope & { type: "metrics.summary"; enabled: boolean; days: Record<string, Record<string, number>>; totals: Record<string, number>; rates: Record<string, number | null> };
// Undo finished. recovered: big files replaced by their older small version, copied aside first. largeLeftAlone: big files not touched.
export type CheckpointRestored = Envelope & { type: "checkpoint.restored"; project: string; checkpoint: string; safety: string; recovered: string[]; largeLeftAlone: string[]; leftAlone: string[] };
export type BrowserStatus = Envelope & { type: "browser.status"; installed: boolean; installing: boolean };
// The download's progress (percent 0 to 100 and its real size, once known), then done, failed or cancelled (Stop everything).
export type BrowserInstallEvent = Envelope & { type: "browser.install"; stage: "downloading" | "done" | "failed" | "cancelled"; detail: string; percent?: number; mb?: number };
// problem: why a new limit was refused or not kept; the limit shown is the one still in force.
export type SpendingState = Envelope & { type: "spending.state"; project: string; limitUsd: number; spentUsd: number; minUsd: number; maxUsd: number; problem?: string };
// Which task broke it. Each check of a version is one run (at most maxRuns); "now" is the project as it is, "after" and
// "before" a version saved after or before the task named in label.
export type BisectProgress = Envelope & { type: "bisect.progress"; project: string; agent: string; run: number; maxRuns: number; what: "now" | "after" | "before"; label?: string };
export type BisectTask = { label: string; at: string };
// outcome: found (task names it; undo says whether it can be undone on its own or only shown), not_failing, already_failing
// (before the oldest task checked), after_last_task (changes made since the last task), outside_change (between two tasks),
// unsure (within earlier and later), too_few, cannot_check, busy, failed or cancelled.
export type BisectResult = Envelope & {
  type: "bisect.result"; project: string; agent: string;
  outcome: "found" | "not_failing" | "already_failing" | "after_last_task" | "outside_change" | "unsure" | "too_few" | "cannot_check" | "busy" | "failed" | "cancelled";
  runs: number; maxRuns: number; step?: { rung: string; label: string };
  task?: BisectTask & { checkpoint: string }; earlier?: BisectTask; later?: BisectTask;
  changed?: { file: string; kind: "added" | "modified" | "deleted" }[]; changedCount?: number; undo?: "safe" | "show_only"; why?: string; diff?: string; detail?: string;
};
// safety: the saved version from just before the undo (Undo can go back to it).
export type BisectUndone = Envelope & { type: "bisect.undone"; project: string; checkpoint: string; ok: boolean; reverted: string[]; safety?: string; reason?: string };
// The error explainer's answer: two plain sentences (none when it could not be explained, with reason), where it lives in the
// project when that could be confirmed, the first error line, and the selection with secrets hidden (the evidence for Fix it).
export type ErrorExplained = Envelope & { type: "error.explained"; req: string; project?: string; ok: boolean; sentences: string[]; where?: Problem; excerpt: string; evidence: string; reason?: string; usdEstimate: number };
// What the engine took from settings.apply (names only) and what it refused (each then at its usual value), never values.
export type SettingsApplied = Envelope & { type: "settings.applied"; accepted: string[]; refused: string[] };
export type Event = SettingsApplied | BisectProgress | BisectResult | BisectUndone | ErrorExplained | ExplainReady | TeachReady | TeachResult | TeachStep | SpendingState | BrowserStatus | BrowserInstallEvent | CheckpointRestored | MetricsSummary | WalkLessons | WalkStepEvent | WalkAsk | WalkHelp | WalkWait | WalkDone | WalkStopped | DiagramReady | ProjectReportEvent | ProjectInstallEvent | ProjectCloned | ShipCard | ReceiptVisual | ProblemFound | RunnerPong | ShipGates | ResearchDone | RescueReport | DrivePaused | LoopStuck | PlanReady | DriveStep | DriveDone | TasksListEvent | ProofStepEvent | ProofResult | ApprovalResolved | AssistPromptDelta | AssistPromptDone | AssistPoint | AssistError | RunnerHello | AuthStatus | CheckpointCreated | AgentState | AgentTool | ApprovalRequest | CostUpdate | Receipt | ProtocolError;

export type Parsed<T> = { ok: true; msg: T } | { ok: false; error: string };

type Check = (m: Record<string, unknown>) => string | null;
const str: (k: string) => Check = (k) => (m) => (typeof m[k] === "string" && (m[k] as string).length > 0 ? null : `missing text field "${k}"`);
const num: (k: string) => Check = (k) => (m) => (typeof m[k] === "number" && Number.isFinite(m[k] as number) && (m[k] as number) >= 0 ? null : `missing or invalid number "${k}"`);
const bool: (k: string) => Check = (k) => (m) => (typeof m[k] === "boolean" ? null : `missing true or false "${k}"`);
const oneOf: (k: string, vals: string[]) => Check = (k, vals) => (m) => (vals.includes(m[k] as string) ? null : `"${k}" must be one of ${vals.join(", ")}`);
const list: (k: string) => Check = (k) => (m) => (Array.isArray(m[k]) ? null : `"${k}" must be a list`);
const obj: (k: string) => Check = (k) => (m) => (typeof m[k] === "object" && m[k] !== null && !Array.isArray(m[k]) ? null : `"${k}" must be an object`);
// An optional field: absent is fine, present must be valid.
const opt: (k: string, c: Check) => Check = (k, c) => (m) => (m[k] === undefined ? null : c(m));
const needsOk: Check = opt("needs", oneOf("needs", ["browser"]));
// A line in the project: a file, a line number from 1, and the line's text.
const isPlace = (c: unknown): boolean => { const o = c as Record<string, unknown> | null; return !!o && typeof o === "object" && !Array.isArray(o) && typeof o.file === "string" && o.file.length > 0 && Number.isInteger(o.line) && (o.line as number) >= 1 && typeof o.lineText === "string"; };
const place: (k: string) => Check = (k) => (m) => (isPlace(m[k]) ? null : `"${k}" must be a place: file, line and lineText`);
const repeatOk: Check = (m) => { const r = m.repeat as Record<string, unknown>; return r && typeof r === "object" && isPlace(r.first) && isPlace(r.second) && typeof r.was === "string" && typeof r.now === "string" ? null : '"repeat" needs first, second, was and now'; };
const stepOk: Check = (m) => { const s = m.step as Record<string, unknown>; return s && typeof s === "object" && Number.isInteger(s.index) && (s.index as number) >= 1 && typeof s.title === "string" ? null : '"step" needs an index from 1 and a title'; };
const MARKS = ["ring", "arrow", "underline", "box"];
const screenNo = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4;
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const targetOk = (t: unknown): boolean => {
  if (typeof t !== "object" || t === null || Array.isArray(t)) return false;
  const o = t as Record<string, unknown>;
  return isNum(o.x) && isNum(o.y) && isNum(o.confidence) && (o.confidence as number) <= 1 && typeof o.targetText === "string" && typeof o.caption === "string"
    && (o.ocrId === undefined || typeof o.ocrId === "string") && (o.mark === undefined || MARKS.includes(o.mark as string)) && (o.screen === undefined || screenNo(o.screen));
};
const pointExtrasOk: Check = (m) => {
  if (m.mark !== undefined && !MARKS.includes(m.mark as string)) return `"mark" must be one of ${MARKS.join(", ")}`;
  if (m.screen !== undefined && !screenNo(m.screen)) return '"screen" must be a whole number from 1 to 4';
  if (m.targets !== undefined && !(Array.isArray(m.targets) && m.targets.length >= 1 && m.targets.length <= 5 && m.targets.every(targetOk))) return '"targets" must be a list of 1 to 5 targets';
  if (m.lastStepWorked !== undefined && !["yes", "no", "unsure"].includes(m.lastStepWorked as string)) return '"lastStepWorked" must be yes, no or unsure';
  return null;
};
const screensOk: Check = (m) => {
  if (m.screens === undefined) return null;
  const ok = Array.isArray(m.screens) && m.screens.length >= 1 && m.screens.length <= 4 && m.screens.every((s) => typeof s === "object" && s !== null
    && typeof (s as any).ref === "string" && (s as any).ref.length > 0 && isNum((s as any).w) && isNum((s as any).h) && typeof (s as any).label === "string");
  return ok ? null : '"screens" must be a list of 1 to 4 pictures, each with ref, w, h and label';
};
const named = (o: unknown, field: string): boolean => typeof o === "object" && o !== null && !Array.isArray(o) && typeof (o as any).name === "string" && (o as any).name.length > 0 && typeof (o as any)[field] === "string";
const filesOk: Check = opt("files", (m) => (Array.isArray(m.files) && m.files.every((f) => named(f, "text")) ? null : '"files" must be a list of files, each with name and text'));
const imagesOk: Check = opt("images", (m) => (Array.isArray(m.images) && m.images.every((p) => named(p, "base64") && ["image/png", "image/jpeg"].includes((p as any).mediaType)) ? null : '"images" must be a list of PNG or JPEG pictures, each with name, mediaType and base64'));
// A practice id: a short plain name (app/sample/practices.json), never a path.
const practiceOk: Check = opt("practice", (m) => (typeof m.practice === "string" && /^[a-z][a-z-]{0,39}$/.test(m.practice) ? null : '"practice" must be a practice id'));
const stepsNeedsOk: Check = (m) => (Array.isArray(m.steps) && m.steps.some((s) => typeof s === "object" && s !== null && needsOk(s as Record<string, unknown>)) ? 'a step\'s "needs" must be "browser"' : null);

const COMMANDS: Record<string, Check[]> = {
  "agent.start": [str("project"), str("agent"), oneOf("mode", ["drive", "rescue", "research", "ship"]), str("prompt"), str("model"), num("budgetUsd"), filesOk, imagesOk, practiceOk],
  "tasks.list": [str("project")],
  "drive.plan": [str("project"), str("agent"), str("goal"), str("model"), num("budgetUsd")],
  "drive.approve": [str("agent"), list("steps")],
  "runner.ping": [],
  "engine.warm": [],
  "settings.apply": [obj("values"), opt("project", str("project")), opt("projectValues", obj("projectValues"))],
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
  "browser.check": [],
  "browser.install": [],
  "spending.show": [str("project")],
  "spending.set": [str("project"), num("limitUsd")],
  "bisect.start": [str("project"), str("agent")],
  "bisect.undo": [str("project"), str("checkpoint"), (m) => (m.confirm === true ? null : 'undoing a task needs "confirm": true')],
  "error.explain": [str("req"), str("app"), str("text"), opt("project", str("project"))],
  "teach.try": [str("project"), str("checkpoint")],
  "teach.check": [str("project"), str("agent"), str("checkpoint")],
  "walk.list": [str("project")],
  "walk.start": [str("project"), str("lesson")],
  "walk.acted": [str("walk"), oneOf("how", ["clicked", "done_for_you", "pressed"])],
  "walk.answer": [str("walk"), bool("worked")],
  "walk.skip": [str("walk")],
  "walk.stop": [str("walk")],
  "project.inspect": [str("project")],
  "project.install": [str("project")],
  "project.clone": [str("url"), str("parent")],
  "memory.add": [str("project"), oneOf("scope", ["project", "profile"]), str("text"), str("source")],
  "recap.ask": [str("project"), str("since")],
  "explain.set": [str("project"), oneOf("mode", [...EXPLAIN_MODES])],
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
  "agent.send": [str("agent"), str("project"), opt("retry", bool("retry")), (m) => (m.retry === true ? opt("text", (x) => (typeof x.text === "string" ? null : '"text" must be text'))(m) : str("text")(m))],
  "agent.interrupt": [str("agent")],
  "agent.interruptAll": [str("reason")],
  "approval.resolve": [str("approval"), oneOf("decision", ["allow", "deny"]), oneOf("scope", ["once", "task"])],
  "checkpoint.restore": [str("project"), str("checkpoint")],
  "assist.prompt": [str("req"), str("app"), str("target"), str("text"), oneOf("style", ["full", "light"])],
  "assist.locate": [str("req"), str("question"), obj("image"), screensOk],
  "assist.cancel": [str("req")],
  "assist.image": [str("ref"), oneOf("mediaType", ["image/jpeg", "image/png"]), str("base64"), num("w"), num("h")],
};

const EVENTS: Record<string, Check[]> = {
  "runner.hello": [str("runnerVersion"), str("sdk")],
  "tasks.list": [str("project"), list("tasks")],
  "runner.pong": [],
  "settings.applied": [list("accepted"), list("refused")],
  "memory.state": [str("project"), bool("paused"), list("projectLines"), list("profileLines"), list("problems")],
  "memory.saved": [str("project"), oneOf("scope", ["project", "profile"]), str("line"), str("text"), str("source")],
  "ship.status": [str("project"), oneOf("stage", ["checking_gates", "not_signed_in", "deploying", "checking_preview", "ready", "failed", "refused", "live", "rolled_back"]), str("detail"), needsOk],
  "doctor.report": [list("items")],
  "diagram.ready": [str("project"), bool("made")],
  "checkpoint.restored": [str("project"), str("checkpoint"), str("safety"), list("recovered"), list("largeLeftAlone"), list("leftAlone")],
  "metrics.summary": [bool("enabled"), obj("days"), obj("totals"), obj("rates")],
  "browser.status": [bool("installed"), bool("installing")],
  "browser.install": [oneOf("stage", ["downloading", "done", "failed", "cancelled"]), str("detail"), opt("percent", (m) => (typeof m.percent === "number" && m.percent >= 0 && m.percent <= 100 ? null : '"percent" must be a number from 0 to 100')), opt("mb", num("mb"))],
  "spending.state": [str("project"), num("limitUsd"), num("spentUsd"), num("minUsd"), num("maxUsd")],
  "bisect.progress": [str("project"), str("agent"), num("run"), num("maxRuns"), oneOf("what", ["now", "after", "before"])],
  "bisect.result": [str("project"), str("agent"), oneOf("outcome", ["found", "not_failing", "already_failing", "after_last_task", "outside_change", "unsure", "too_few", "cannot_check", "busy", "failed", "cancelled"]), num("runs"), num("maxRuns"),
    opt("undo", oneOf("undo", ["safe", "show_only"])), (m) => (m.outcome !== "found" || (typeof m.task === "object" && m.task !== null && typeof (m.task as Record<string, unknown>).checkpoint === "string") ? null : 'a found task needs "task" with its "checkpoint"')],
  "bisect.undone": [str("project"), str("checkpoint"), bool("ok"), list("reverted")],
  "error.explained": [str("req"), bool("ok"), list("sentences"), (m) => (typeof m.excerpt === "string" && typeof m.evidence === "string" ? null : 'missing text fields "excerpt" and "evidence"'), num("usdEstimate")],
  "walk.lessons": [str("project"), list("lessons")],
  // link: the one web page the step is about, shown as an Open button and opened only on the person's press.
  "walk.step": [str("walk"), str("project"), str("lesson"), str("title"), num("index"), num("total"), oneOf("variant", ["main", "instead"]), str("say"), str("find"), bool("ask"), opt("link", str("link"))],
  "walk.ask": [str("walk"), num("index")],
  "walk.help": [str("walk"), str("say")],
  "walk.wait": [str("walk"), num("index"), str("say")],
  "walk.done": [str("walk"), str("project"), str("lesson"), str("title"), num("steps")],
  "walk.stopped": [str("walk"), str("reason")],
  "project.report": [str("project"), oneOf("origin", ["lovable", "bolt", "replit", "unknown"]), str("about"), str("stack"), bool("needsInstall"), list("missing"), num("missingCount"), list("notes")],
  "project.install": [str("project"), oneOf("stage", ["installing", "done", "failed", "cancelled"]), (m) => (typeof m.detail === "string" ? null : "missing text field \"detail\"")],
  "project.cloned": [str("url"), bool("ok"), str("detail")],
  "ship.card": [str("project"), str("url"), str("title"), str("image"), bool("withShot")],
  "receipt.visual": [str("agent"), str("project"), str("checkpoint"), bool("made"), (m) => (m.made !== true || (typeof m.image === "string" && m.image.length > 0) ? null : "a made picture needs \"image\""), num("circles")],
  "problem.found": [str("project"), str("agent"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"]), needsOk, opt("note", str("note"))],
  "explain.ready": [str("agent"), str("checkpoint"), list("bullets"), num("usdEstimate"), opt("step", stepOk)],
  "teach.ready": [str("project"), str("checkpoint"), bool("made"), (m) => (m.made !== true || isPlace(m.target) ? null : "a made turn needs a \"target\" place")],
  "teach.result": [str("project"), str("checkpoint"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"]), bool("same")],
  "teach.step": [str("project"), str("checkpoint"), str("rung"), str("label"), oneOf("status", ["running", "passed", "failed", "skipped"]), (m) => (typeof m.detail === "string" ? null : "missing text field \"detail\""), needsOk],
  "explain.state": [str("project"), bool("enabled"), oneOf("mode", [...EXPLAIN_MODES])],
  "recap.ready": [str("project"), list("lines")],
  "memory.agents_ask": [str("project"), list("files")],
  "memory.agents_written": [str("project"), list("files")],
  "memory.refused": [str("project"), str("reason")],
  "memory.exported": [str("project"), str("text")],
  "ship.gates": [str("project"), bool("canShip"), list("gates"), list("blockedBy"), list("needsYou"), list("confirmed"), num("allowedCount")],
  "research.done": [str("agent"), str("title"), str("answer"), list("notes"), opt("file", str("file"))],
  "rescue.report": [str("agent"), str("summary"), list("works"), str("broken"), list("steps"), list("evidence"), num("estimateUsd")],
  "drive.paused": [str("agent"), oneOf("reason", ["files_changed", "editor", "terminal", "you"])],
  "loop.stuck": [str("agent"), num("index"), str("title"), obj("failure"), list("options"), opt("tries", (m) => (Number.isInteger(m.tries) && (m.tries as number) >= 1 ? null : '"tries" must be a whole number from 1')), opt("same", bool("same"))],
  "plan.ready": [str("agent"), list("steps"), bool("truncated"), num("estimateUsd")],
  "drive.step": [str("agent"), num("index"), num("total"), str("title"), oneOf("status", ["started", "done", "not_done", "stopped", "over_budget"])],
  "drive.done": [str("agent"), str("status"), num("completed"), num("total"), num("usdEstimate")],
  "auth.status": [oneOf("method", ["api_key", "plan", "cloud", "none", "unknown"])],
  "checkpoint.created": [str("project"), str("agent"), str("checkpoint"), str("label"), num("files"), list("skipped"), practiceOk],
  "agent.state": [str("agent"), oneOf("state", ["idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"])],
  "agent.tool": [str("agent"), str("tool"), str("summary"), str("toolUseId"), bool("undoable")],
  "approval.request": [str("approval"), str("agent"), str("checkpoint"), str("toolUseId"), oneOf("risk", ["irreversible", "git", "outside_project", "install", "network"]), str("title"), str("expiresAt")],
  "cost.update": [str("agent"), num("usdEstimate"), str("basis"), obj("tokens")],
  "receipt": [str("agent"), str("checkpoint"), list("changed"), num("commands"), list("notUndoable"), oneOf("proof", ["passed", "partial", "failed", "skipped"]), num("usdEstimate"), opt("changedAt", place("changedAt")), opt("repeat", repeatOk), opt("said", str("said")), opt("asks", bool("asks")), practiceOk],
  "protocol.error": [str("reason")],
  "proof.step": [str("agent"), str("rung"), str("label"), oneOf("status", ["running", "passed", "failed", "skipped"]), (m) => (typeof m.detail === "string" ? null : "missing text field \"detail\""), needsOk],
  "proof.result": [str("agent"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"]), list("steps"), stepsNeedsOk, num("tries")],
  "approval.resolved": [str("approval"), str("agent"), oneOf("outcome", ["allowed", "denied", "expired", "cancelled"])],
  "assist.prompt.delta": [str("req"), str("text")],
  "assist.prompt.done": [str("req"), str("text"), list("diff"), num("usdEstimate"), oneOf("handback", ["paste", "copy"])],
  "assist.point": [str("req"), num("step"), num("x"), num("y"), str("targetText"), num("confidence"), str("caption"), pointExtrasOk],
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
  // Own names only: "constructor", "toString" and "__proto__" are on every object and are not message types.
  const checks = Object.hasOwn(table, o.type) ? table[o.type] : undefined;
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
