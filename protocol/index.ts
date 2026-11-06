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
// release: the person put aside what the agent was waiting on them for (Cancel on a plan, Close on an answer). Only when
// nothing runs for the agent, it rests again and a plan waiting for approval is dropped; it never stops anything.
export type AgentInterrupt = Envelope & { type: "agent.interrupt"; agent: string; release?: boolean };
export type AgentInterruptAll = Envelope & { type: "agent.interruptAll"; reason: string };
export type ApprovalResolve = Envelope & { type: "approval.resolve"; approval: string; decision: "allow" | "deny"; scope: "once" | "task" };
export type CheckpointRestore = Envelope & { type: "checkpoint.restore"; project: string; checkpoint: string; force?: boolean };
// "Put those back too": after an Undo left some of the person's own files alone, a second, confirmed press puts the old versions
// back over them (their versions are saved aside first). `files` may only name files that Undo left alone; without it, all of them.
export type CheckpointPutBack = Envelope & { type: "checkpoint.putBack"; project: string; checkpoint: string; confirm: true; files?: string[] };

export type AssistPrompt = Envelope & { type: "assist.prompt"; req: string; app: string; target: string; text: string; style: "full" | "light"; answer?: string; noQuestion?: boolean };
// screens: when Show me looked at more than one screen (2 to 4), one picture each, the screen the mouse pointer is on first
// (its ref is the same as image.ref). label is "Screen N of M"; the engine sends only that exact shape to the model.
// app: the id of the app in front when the picture was taken (the shell reads only the id, on the key press), so the engine
// can answer as a tutor for an everyday app (showme.everydayTutor). Never sent to the model as it is. The shell leaves it out
// of an everyday look (mode), which has its own instructions and is told only the kind of app in front (everyday.rs).
export type AssistLocate = Envelope & { type: "assist.locate"; req: string; question: string; image: { ref: string; w: number; h: number }; ocr?: { id: string; text: string; box: number[]; screen?: number }[]; walkthrough?: boolean; screens?: { ref: string; w: number; h: number; label: string }[]; app?: string; mode?: LocateMode; before?: SheetCode };
// mode: an everyday stuck moment (the hero key with no project, or with an app in front that is not a code tool). "everyday"
// asks what is wrong and the first steps of the fix; "recheck" looks again to say whether it is gone (runner/src/everyday.ts).
// before: with "recheck" only, the spreadsheet error code the first look read on the screen (the Mac's text reader), so the
// look again can say fixed only when that code is no longer read. Only the codes of the runner's table.
export type LocateMode = "everyday" | "recheck";
export const SHEET_CODES = ["#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "circular reference"] as const;
export type SheetCode = (typeof SHEET_CODES)[number];
export type AssistImage = Envelope & { type: "assist.image"; ref: string; mediaType: "image/jpeg" | "image/png"; base64: string; w: number; h: number };
export type AssistCancel = Envelope & { type: "assist.cancel"; req: string };

export type RunnerPing = Envelope & { type: "runner.ping" };
/** The Google accounts connected (M21, from the shell only): who, for which apps, and a short lived access token each. */
export type GoogleAccounts = Envelope & { type: "google.accounts"; accounts: { label: string; email: string; apps: string[]; token: string; expiresInSecs: number }[] };
export type ShipCheck = Envelope & { type: "ship.check"; project: string; runChecks?: boolean; confirm?: string[] };
// offTheRecord: the Off the record box was ticked. Nothing is learned or told from memory, no conversation is saved, Research
// files no notes, and the steps of a Rescue plan run off the record too.
export type ResearchAsk = Envelope & { type: "research.ask"; project: string; agent: string; question: string; model: string; budgetUsd: number; offTheRecord?: boolean };
export type RescueDiagnose = Envelope & { type: "rescue.diagnose"; project: string; agent: string; model: string; budgetUsd: number; offTheRecord?: boolean };
export type DrivePlan = Envelope & { type: "drive.plan"; project: string; agent: string; goal: string; model: string; budgetUsd: number; offTheRecord?: boolean };
export type DriveApprove = Envelope & { type: "drive.approve"; agent: string; steps: string[] };
// M58: the fixed ladder adds "research" (look up this exact error, only when Let tasks search the web is on) and
// "lastWorking" (put the files back to the last version whose checks passed, then plan; the page asks first).
export type LoopChoose = Envelope & { type: "loop.choose"; agent: string; choice: "different" | "stop" | "research" | "lastWorking" };
export type DrivePause = Envelope & { type: "drive.pause"; agent: string; reason: "editor" | "terminal" | "you" };
export type DriveResume = Envelope & { type: "drive.resume"; agent: string };
export type TasksList = Envelope & { type: "tasks.list"; project: string };
// M58: star or name a save point (kept in the shadow store's own notes, never the project, never git). A starred or named
// save is never pruned. name: at most 40 characters, cleaned; "" takes the name away.
export type CheckpointMark = Envelope & { type: "checkpoint.mark"; project: string; checkpoint: string; star?: boolean; name?: string };
export type MemoryScope = "project" | "profile";
export type MemoryList = Envelope & { type: "memory.list"; project: string };
export type MemoryForget = Envelope & { type: "memory.forget"; project: string; scope: MemoryScope; line: string };
export type MemoryEdit = Envelope & { type: "memory.edit"; project: string; scope: MemoryScope; line: string; text: string };
export type MemoryPause = Envelope & { type: "memory.pause"; project: string; paused: boolean };
export type MemoryErase = Envelope & { type: "memory.erase"; project: string; scope: MemoryScope };
export type MemoryExport = Envelope & { type: "memory.export"; project: string };
export type MemoryAgents = Envelope & { type: "memory.agents"; project: string; answer: "yes" | "no" | "remove" };
export type RecapAsk = Envelope & { type: "recap.ask"; project: string; since: string };
// Watch routines (F21): a watch is one project, one kind of read only check, a target and a schedule. They run only while
// the engine runs and never call Claude. Every one names the project, so the app holds it to the folder the person chose.
// schedule: "5m", "15m", "30m", "1h" or "daily@9" (an hour from 0 to 23); nothing shorter than 5 minutes exists. target: the
// web address, for a site_up watch only.
export const WATCH_KINDS = ["site_up", "deploy_status", "ci_status", "project_checks"] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];
export const WATCH_STATES = ["ok", "failing", "unknown", "paused"] as const;
export type WatchStateName = (typeof WATCH_STATES)[number];
export type WatchAdd = Envelope & { type: "watch.add"; project: string; kind: WatchKind; schedule: string; target?: string };
export type WatchList = Envelope & { type: "watch.list"; project: string };
export type WatchRemove = Envelope & { type: "watch.remove"; project: string; watch: string };
export type WatchPause = Envelope & { type: "watch.pause"; project: string; watch: string; paused: boolean };
export type WatchCheck = Envelope & { type: "watch.check"; project: string; watch: string };
// Fix it from a failed watch: asks for the evidence (read only, through the person's own tools). The page then starts a normal
// task with it, on the person's press; the engine never starts one by itself.
export type WatchFix = Envelope & { type: "watch.fix"; project: string; watch: string };
// Where was I: what you were doing, what is unfinished, what changed since, and one next step. since: when the person was
// last here (ISO), if the page knows.
export type WhereWasI = Envelope & { type: "where.was.i"; project: string; since?: string };
// Explain after a task (the setting explain.mode, T16): off, two short reasons, or the reasons and a quick check question.
// Only the shell sends explain.set; the engine keeps the choice in memory-settings.json.
export const EXPLAIN_MODES = ["off", "reasons", "reasonsAndQuestion"] as const;
export type ExplainMode = (typeof EXPLAIN_MODES)[number];
export type ExplainSet = Envelope & { type: "explain.set"; project: string; mode: ExplainMode };
export type ShipPreview = Envelope & { type: "ship.preview"; project: string };
export type ShipLive = Envelope & { type: "ship.live"; project: string; url: string; confirm: true };
export type ShipRollback = Envelope & { type: "ship.rollback"; project: string; confirm: true };
/** M58 (UI 13): the person pressed Sign in to Vercel. The engine runs their own `vercel login` as a visible step; it never
 *  reads, stores or passes the login. Only on this press, never at launch or on a timer. */
export type ShipSignIn = Envelope & { type: "ship.signIn"; project: string; /** true: end a sign in that is still waiting (the review of 5 Nov) */ stop?: boolean };
/** M58 (feature 9): the key practice, on the person's press. write: the practice's pretend AI writes its made up key into the
 *  copy (then the review looks at once, by its rules alone); fix: the fixed fix moves it to .env.local, with a safety copy
 *  first. Only in a practice copy of the key practice (runner/src/practicekey.ts); no model, no cost. */
export type PracticeKey = Envelope & { type: "practice.key"; project: string; step: "write" | "fix" };
export type AuthCheck = Envelope & { type: "auth.check" };
export type MemoryAdd = Envelope & { type: "memory.add"; project: string; scope: MemoryScope; text: string; source: string };
export type DoctorCheck = Envelope & { type: "doctor.check" };
/** first: the first run's first check of the real project (M49): installs are set to ask (auto is held to ask), on the
 *  usual approval card. Without it, Point at the problem never installs and never asks. */
export type ProblemFind = Envelope & { type: "problem.find"; project: string; agent: string; first?: boolean };
export type DiagramAsk = Envelope & { type: "diagram.ask"; project: string; question: string; problem?: { kind?: string; file?: string; line?: number; message?: string }; /** M33: a drawn picture (sketch.ts) instead of boxes and arrows. */ style?: "sketch" };
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
// Second Look (M14): an AI answer the person selected in another app, read on its hotkey with the light first (Rust sends it,
// never a page). The runner hides secrets in it before it goes anywhere, and never logs it.
export type SecondLookCheck = Envelope & { type: "secondlook.check"; req: string; app: string; text: string; project?: string };
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
// The plan on this Mac (F25, T17, payments spec section 9): only the shell sends it (app/src-tauri/src/runner.rs
// plan_state_line), when the engine says hello and whenever the plan changes; a page cannot (it is not in the shell's
// ALLOWED). trialEndsAt (an ISO time) only while a trial is the plan, so the engine can end it on time by itself. With
// paymentsOn false nothing is gated, whatever plan says. It never carries the license key: the engine never gets it.
export const PLANS = ["free", "trial", "pro"] as const;
export type PlanName = (typeof PLANS)[number];
export type PlanState = Envelope & { type: "plan.state"; plan: PlanName; trialEndsAt?: string; paymentsOn: boolean };
// The free fix count (payments spec sections 2 and 9), from the engine (runner/src/plan.ts). Sent only while payments are
// on: when a plan.state arrives, and each time a proven fix is counted. used and limit: this calendar month's counted fixes
// and how many Free allows; resetsOn: the 1st of next month in this Mac's local time (YYYY-MM-DD), when they come back;
// everUsed: a free fix has been counted on this Mac before (since the last Delete everything), so Settings may offer the trial.
export type PlanUsage = Envelope & { type: "plan.usage"; used: number; limit: number; resetsOn: string; everUsed: boolean };
// A command the plan does not cover was not started (payments spec section 3): the limit card, or the card behind a Pro tag.
// reason: fixes (this month's free fixes are used, resetsOn says when they come back), or the Pro only feature tapped. command:
// the command that was not started, so the page that sent it stops waiting. agent and project: the command's own, if it had
// them. Never sent while payments are off. It is not an error: nothing failed and nothing changed.
export const PLAN_LIMITS = ["fixes", "ship", "recaps", "looks"] as const;
export type PlanLimitReason = (typeof PLAN_LIMITS)[number];
export type PlanLimit = Envelope & { type: "plan.limit"; reason: PlanLimitReason; resetsOn?: string; command?: string };
// Make something with no project open (F23, M14 Part 1): "make me a website for my bakery", "research who competes with X".
// A page sends it to the shell only (start_in_new_folder), never to the engine, and it names no project. The shell makes a
// new empty folder named after the request in plain words (app/src-tauri/src/newfolder.rs; where it goes is the setting
// make.folder), chooses it as the project, and sends an ordinary drive.plan (build: a plan first) or research.ask for it
// with these words, model and budget, which the engine runs like any other task. The engine cannot read this command
// (parseCommand refuses it), so it can never be asked to make a folder outside a project. parseShellCommand and the shell's
// own check both run protocol/fixtures/project-new-cases.jsonl, with the task each one becomes.
export const NEW_FOLDER_KINDS = ["build", "research"] as const;
export type NewFolderKind = (typeof NEW_FOLDER_KINDS)[number];
/** The longest request, in characters a person sees: the ask box's longest draft (app/src/askbox.ts MAX_DRAFT). */
export const MAX_REQUEST_CHARS = 4000;
export type ProjectNew = { v: 1; id: string; ts?: string; type: "project.new"; kind: NewFolderKind; request: string; agent: string; model: string; budgetUsd: number; offTheRecord?: boolean };
export type ShellCommand = ProjectNew;
// M52, the review of every change (F30, runner/src/review/): the engine watches the open project folder (only that one, and
// only while review.mode is not off and Flow is on) and, once nothing has changed for review.quietSeconds, says a batch is
// ready (review.batch). A batch is everything that changed since the last review or the engine's own last task, measured
// against its own shadow snapshots (T06); it never runs a git command that writes and never reads the person's git history.
// review.now: review the batch named (or, with none, whatever changed since the last review, even before the quiet time
// ends). proof: also run the project's own build and tests (the proof ladder, T07); with review.mode automatic every
// batch is reviewed with proof by itself. review.dismiss: "Looks fine", the card closes and the next batch starts after it.
// review.fix: Fix it, an ordinary task in drive mode built from the review (secrets never in it), with its safety copy and
// Undo; it is gated like any fix. All three name the project, so the shell holds them to the folder the person chose.
export const REVIEW_RATINGS = ["safe", "worth_a_look", "stop"] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];
export const REVIEW_TOUCHES = ["sign_in", "payments", "data", "settings", "secrets", "dependencies", "look_only"] as const;
export type ReviewTouch = (typeof REVIEW_TOUCHES)[number];
// M57: open_table (a table anyone can read, from a changed migration), signed_in_open (every signed in account can read
// all its rows), key_in_page (a key that would reach the page every visitor loads), house_rule (a "never edit" rule of the
// project's own .companion/rules.txt matched a changed file) and house_rule_ask (an "ask before editing" rule matched).
export const REVIEW_REASONS = ["secret_in_code", "removed_still_used", "checks_failed", "risky_with_failing_checks", "secret_file_changed", "touches_risky", "files_removed", "too_many", "model_concern", "open_table", "signed_in_open", "key_in_page", "house_rule", "house_rule_ask"] as const;
export type ReviewReasonKind = (typeof REVIEW_REASONS)[number];
/** M57 feature 7: how strict a review is (review.strictness). Quiet shows only Fix this first; Normal is the usual and leaves
 *  out the kinds the person said not to flag here; Careful shows every worth a look, those kinds too. */
export const REVIEW_STRICTNESS = ["quiet", "normal", "careful"] as const;
export type ReviewStrictness = (typeof REVIEW_STRICTNESS)[number];
/** The reasons "Don't flag this kind here again" may be offered on, and the line it saves in What I remember (the project's
 *  memory, with its source). The engine reads the same lines back, so the two can never disagree; a line the person edits
 *  or forgets no longer silences anything. Never a key, a settings or key file, open data or any Fix this first: those are
 *  not in this list, and the engine refuses them whatever the memory says. */
export const REVIEW_SILENCE_LINES: Partial<Record<ReviewReasonKind, string>> = {
  touches_risky: "In reviews of this project, do not flag changes to risky areas.",
  files_removed: "In reviews of this project, do not flag removed files.",
  too_many: "In reviews of this project, do not flag large batches of changes.",
  model_concern: "In reviews of this project, do not flag concerns from the written summary.",
};
/** The kinds a project's memory lines silence (the lines of REVIEW_SILENCE_LINES, any capital letters, nothing else). */
export function reviewSilenced(lines: readonly string[]): Set<ReviewReasonKind> {
  const want = new Set(lines.map((l) => l.trim().toLowerCase()));
  const out = new Set<ReviewReasonKind>();
  for (const [k, line] of Object.entries(REVIEW_SILENCE_LINES)) if (line && want.has(line.toLowerCase())) out.add(k as ReviewReasonKind);
  return out;
}
export const REVIEW_CHECKS = ["passed", "failed", "unknown", "not_run"] as const;
export type ReviewChecks = (typeof REVIEW_CHECKS)[number];
export const REVIEW_LANES = ["cheap", "strong", "none"] as const;
export type ReviewFile = { file: string; kind: "added" | "modified" | "deleted" };
/** M69: the pointed line with the lines either side of it, masked by the engine (runner/src/review/excerpt.ts): a key keeps
 *  only its known prefix and "…", never any of its secret part. At most three lines. */
export type CodeLine = { n: number; text: string };
export type ReviewReason = { kind: ReviewReasonKind; say: string; file?: string; line?: number; lines?: CodeLine[] };
export type ReviewNow = Envelope & { type: "review.now"; project: string; batch?: string; proof?: boolean };
/** M57 feature 1: how the card was closed, for its row in History. looksFine: Looks fine. sentBack: Copy for my AI was
 *  pressed on this card before it was closed. Absent: closed with no review (Skip this one). */
export const REVIEW_CLOSED_HOW = ["looksFine", "sentBack"] as const;
export type ReviewDismiss = Envelope & { type: "review.dismiss"; project: string; batch: string; how?: (typeof REVIEW_CLOSED_HOW)[number] };
export type ReviewFix = Envelope & { type: "review.fix"; project: string; batch: string; agent: string; model: string; budgetUsd: number };
export type Command = ReviewNow | ReviewDismiss | ReviewFix | PlanState | WatchAdd | WatchList | WatchRemove | WatchPause | WatchCheck | WatchFix | WhereWasI | SettingsApply | EngineWarm | BisectStart | BisectUndo | ErrorExplain | SecondLookCheck | TeachTry | TeachCheck | SpendingShow | SpendingSet | BrowserCheck | BrowserInstall | MetricsSet | MetricsNote | MetricsShow | MetricsErase | WalkList | WalkStart | WalkActed | WalkAnswer | WalkSkip | WalkStop | DiagramAsk | ProjectInspect | ProjectInstall | ProjectClone | ProblemFind | DoctorCheck | AuthCheck | MemoryAdd | AssistImage | ShipPreview | ShipLive | ShipRollback | RecapAsk | ExplainSet | MemoryAgents | MemoryList | MemoryForget | MemoryEdit | MemoryPause | MemoryErase | MemoryExport | RunnerPing | GoogleAccounts | ShipCheck | ResearchAsk | RescueDiagnose | DrivePause | DriveResume | LoopChoose | DrivePlan | DriveApprove | TasksList | AssistPrompt | AssistLocate | AssistCancel | AgentStart | AgentSend | AgentInterrupt | AgentInterruptAll | ApprovalResolve | CheckpointRestore | CheckpointPutBack | CheckpointMark | ShipSignIn | PracticeKey;

export type AgentStateName = "idle" | "listening" | "thinking" | "working" | "checking" | "needsYou" | "done" | "error";

export type RunnerHello = Envelope & { type: "runner.hello"; runnerVersion: string; sdk: string; claudeCode?: string };
/** `tested`: only right after the person saved a key, what Anthropic said about it (runner/src/keytest.ts). */
export type AuthStatus = Envelope & { type: "auth.status"; method: "api_key" | "plan" | "cloud" | "none" | "unknown"; source?: string; tested?: "works" | "refused" | "no_connection" | "unknown" };
export type CheckpointCreated = Envelope & {
  type: "checkpoint.created"; project: string; agent: string; checkpoint: string; label: string; files: number;
  skipped: { path: string; reason: string }[];
  practice?: string;   // the practice id the task was started with, echoed back
};
export type AgentState = Envelope & { type: "agent.state"; agent: string; state: AgentStateName };
export type AgentTool = Envelope & { type: "agent.tool"; agent: string; tool: string; summary: string; toolUseId: string; undoable: boolean; outcome?: "ran" | "blocked" | "needs_approval" | "denied" };
/** M55, live progress: a file the agent's own tool really changed, the moment that tool finished (runner/src/livefile.ts).
 *  `file` is from the project folder down, with "/" between folders. Only a change seen on disk is told (rule 14); the
 *  receipt stays the whole list, with what commands changed too. */
export type AgentFile = Envelope & { type: "agent.file"; agent: string; file: string; kind: "added" | "modified" | "deleted" };
export type ApprovalRequest = Envelope & {
  type: "approval.request"; approval: string; agent: string; checkpoint: string; toolUseId: string;
  risk: "irreversible" | "git" | "outside_project" | "install" | "network" | "settings" | "house_rule" | "scripts"; title: string; expiresAt: string;
  /** M28: what will happen, in plain words: the command (secrets covered) or the file. Shown on the card so nobody answers
   *  a question they cannot read. Absent from older engines. */
  action?: string;
  /** M28: whether Undo can take it back. Absent from older engines (the card then says nothing either way). */
  undoable?: boolean;
  /** M67: true when a check asks it (install the packages, go online, run the scripts), not a tool Claude wants to use.
   *  The first run screen shows these, since it covers Home while the first check runs. */
  check?: boolean;
};
export type CostUpdate = Envelope & {
  type: "cost.update"; agent: string; usdEstimate: number; basis: string; tokens: { in: number; cacheRead: number; out: number };
};
// A line in the project as it is now (1-based), with its text (secrets hidden), so the person's editor can show it and the
// ring can find it on screen.
export type ChangeAt = { file: string; line: number; lineText: string };
export type Receipt = Envelope & {
  type: "receipt"; agent: string; checkpoint: string;
  // M66: added and removed lines per file as git counts them (absent for a file that is not text); was: its length before,
  // only for a file that lost many lines.
  changed: { file: string; kind: "added" | "modified" | "deleted"; added?: number; removed?: number; was?: number }[];
  askWords?: number;   // M66: how many words the ask had, for the warning on a big rewrite for a small ask
  commands: number; notUndoable: string[]; proof: "passed" | "partial" | "failed" | "skipped"; usdEstimate: number;
  picture?: boolean;   // a before and after picture is being made and will follow as receipt.visual
  inPlan?: boolean;    // one step of an approved plan (Drive); the plan as a whole ends with drive.done
  changedAt?: ChangeAt;   // the first changed line, for "Show me what changed"
  repeat?: { first: ChangeAt; second: ChangeAt; was: string; now: string };   // the same small change made in two places (was -> now)
  practice?: string;   // the practice id the task was started with, echoed back
  ended?: "done" | "needs_you" | "stopped" | "failed";   // how the task ended: only done and needs_you count as a real use (groups, F20)
  /** M45: why a "failed" task stopped, so the result can name a limit instead of "Something went wrong". Only with ended
   *  "failed"; absent from older engines. `ended` keeps its four words (groups, F20). */
  endedWhy?: "check_failed" | "spending_limit" | "daily_limit" | "turns" | "no_connection" | "claude_busy" | "error";
  mode?: "drive" | "rescue" | "research" | "ship";   // the mode the task ran in
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
// reason: one plain sentence for the person. detail: the raw failure, for the log only (the shell takes it off before the
// pages see the event). failed: the command type that failed, for the page's own logic, never shown.
export type ProtocolError = Envelope & { type: "protocol.error"; reason: string; line?: string; detail?: string; failed?: string };

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
// An everyday look's answer, before its steps (which come as an ordinary assist.point with the same req, when steps > 0).
// found: a problem is on screen (for a recheck: still there). problem: at most two plain sentences. code: a spreadsheet
// error's code when the words on screen show one, and fromTable when its words come from the runner's own table. gone: the
// recheck's verdict: "yes" only when the code the first look read is no longer read on the screen and the look agrees,
// "looks" when only the look says so (a guess from a picture: the person is asked), "unsure" when it cannot be told (with
// code when that error is still read), "no" when it is still there. fixes: the table's usual fixes for that error.
export type AssistProblem = Envelope & { type: "assist.problem"; req: string; mode: LocateMode; found: boolean; problem?: string; kind?: string; code?: string; why?: string[]; question?: { text: string; options: string[]; correct: number }; fixes?: string[]; gone?: "yes" | "looks" | "no" | "unsure"; steps: number; fromTable?: boolean; usdEstimate: number };

// Where a check failed: a line in the project, a button in the app, or at least the error sentence.
export type Problem =
  | { kind: "line"; file: string; line: number; column?: number; lineText: string; message: string; from: string }
  | { kind: "button"; label: string; message: string; from: "browser" }
  | { kind: "message"; message: string; from: string };
// needs: "browser" means this step was skipped only because the hidden browser is not installed, so the page can offer it.
// summary: a failed step's one plain sentence; the detail (the check's own output) is shown behind Details.
// runs (M69): the commands the rung ran and their exit codes, for the receipt's proof ticks; absent from older engines.
export type ProofStep = { rung: string; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; ms?: number; problem?: Problem; needs?: "browser" | "signIn"; summary?: string; runs?: { command: string; exit: number }[] };
// note: one plain line about a check that could not run (the Vercel tool missing or signed out), with what to do.
// A problem with from "deploy" is the line the last Vercel deploy failed at, confirmed in this folder.
export type ProblemFound = Envelope & { type: "problem.found"; project: string; agent: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; label?: string; detail?: string; problem?: Problem; needs?: "browser"; note?: string };
export type ProofStepEvent = Envelope & { type: "proof.step"; agent: string } & ProofStep;
export type ProofResult = Envelope & { type: "proof.result"; agent: string; verdict: "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled"; steps: ProofStep[]; tries: number; of?: number };

export type ApprovalResolved = Envelope & { type: "approval.resolved"; approval: string; agent: string; outcome: "allowed" | "denied" | "expired" | "cancelled" };

export type PlanReady = Envelope & { type: "plan.ready"; agent: string; steps: { id: number; title: string }[]; truncated: boolean; estimateUsd: number };
export type DriveStep = Envelope & { type: "drive.step"; agent: string; index: number; total: number; title: string; status: "started" | "done" | "not_done" | "stopped" | "over_budget" };
export type DriveDone = Envelope & { type: "drive.done"; agent: string; status: string; completed: number; total: number; usdEstimate: number };
/** ping (must fix 12): the id of the runner.ping it answers, so the Stop key's check waits for the answer to its own ping. */
export type RunnerPong = Envelope & { type: "runner.pong"; ping?: string };
export type ShipGates = Envelope & { type: "ship.gates"; project: string; canShip: boolean; gates: { id: string; label: string; status: "passed" | "blocked" | "could_not_check" | "not_applicable"; detail: string; findings?: string[]; overridable?: boolean; places?: { table: string; file: string; line: number; lineText: string }[] }[]; blockedBy: string[]; needsYou: string[]; confirmed: string[]; allowedCount: number };
// file: where the notes were filed in the project; none off the record, where nothing is kept.
export type ResearchDone = Envelope & { type: "research.done"; agent: string; title: string; answer: string; notes: { text: string; source: string }[]; file?: string };
export type RescueReport = Envelope & { type: "rescue.report"; agent: string; summary: string; works: string[]; broken: string; steps: { id: number; title: string }[]; evidence: { label: string; status: string; detail: string }[]; estimateUsd: number };
export type DrivePaused = Envelope & { type: "drive.paused"; agent: string; reason: "files_changed" | "editor" | "terminal" | "you"; path?: string };
// index: the Drive step (from 1); 0 for a single task, whose title is the task's label.
// tries and same: how the tries ran out, sent only when it was not the usual three identical failures (the settings
// work.tries and work.askOnAnyFailure): how many checks failed in a row, and whether all of them the same way.
export type LoopStuck = Envelope & { type: "loop.stuck"; agent: string; index: number; title: string; failure: { label: string; detail: string }; options: { id: string; label: string }[]; tries?: number; same?: boolean; rung?: "retry" | "research" | "lastWorking" };
// undone (M45): an Undo put the project back to before this task. back: "Bring the fix back" then put its files back again
// (undone stays set: nothing was checked since).
/** failedCheck (M72): the rung of the check that failed (install, checks, tests, start, browser, review), for a failed task. */
export type TaskSummary = { id: number; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null; undone?: boolean; back?: boolean; lastWorking?: boolean; star?: boolean; name?: string; failedCheck?: string };
/** sinceCheck (must fix 11): whether the project's files changed since the version its last passed check ran on ("same" or
 *  "changed"). Absent when no passed check is known this session, or a task is writing to the project. */
/** M57 feature 1: a review that ran, as a row in History. Names of files only (at most 20), never their text; the summary
 *  had secrets hidden before it was kept. did: what the person did with it (open: nothing yet, or the engine closed before;
 *  no_longer_applies: a newer change made every reason go away). */
export const REVIEW_DID = ["open", "looks_fine", "sent_back", "fix", "no_longer_applies"] as const;
export type ReviewRowView = { id: number; at: string; count: number; files: string[]; rating: ReviewRating; touches: ReviewTouch[]; checks: ReviewChecks; did: (typeof REVIEW_DID)[number]; summary: string };
export type TasksListEvent = Envelope & { type: "tasks.list"; project: string; tasks: TaskSummary[]; sinceCheck?: "same" | "changed"; reviews?: ReviewRowView[]; lastWorking?: { checkpoint: string; at: string } };
// made: false means no picture after all (stopped, or it could not be made); the card stops waiting for it.
// before (M69): the earlier version's picture, for the before and after pair; absent when it could not be pictured.
export type ReceiptVisual = Envelope & { type: "receipt.visual"; agent: string; project: string; checkpoint: string; made: boolean; image?: string; before?: string; caption: string; circles: number; file?: string };
export type ShipCard = Envelope & { type: "ship.card"; project: string; url: string; title: string; image: string; withShot: boolean };
/** M58 (UI 13): where the person's own Vercel sign in is. opened: Vercel's own page (url, always https on vercel.com) is
 *  ready to open in their browser. lesson: the step could not run here, so the step by step lesson is offered. */
/** M58 (feature 9): what the key practice's step did. wrote: the pretend AI's change is in the copy (written: false when it
 *  was already there). fixed: the key is in .env.local now; checkpoint is the safety copy Undo puts back, changed the files,
 *  clean whether the review's key rule now finds no key in the code. refused: nothing was written, with why. */
export type PracticeKeyEvent = Envelope & { type: "practice.key"; project: string; step: "wrote" | "fixed" | "refused"; written?: boolean; checkpoint?: string; changed?: { file: string; kind: "added" | "modified" }[]; clean?: boolean; reason?: string };
export type ShipSignInEvent = Envelope & { type: "ship.signIn"; project: string; stage: "opened" | "done" | "failed"; url?: string; reason?: string; lesson?: boolean };
// scripts, checks, proofFile and launchFile: what the Settings rows for checking this project need (its own script names,
// the checks it has, and its own .claude/proof.json and .claude/launch.json, which win over Settings).
export type ProjectReportEvent = Envelope & { type: "project.report"; project: string; origin: "lovable" | "bolt" | "replit" | "unknown"; about: string; stack: string; needsInstall: boolean; installCommand: string | null; start: string | null; missing: string[]; missingCount: number; example: string | null; notes: string[];
  scripts?: string[]; checks?: ("typecheck" | "lint" | "build" | "test")[]; proofFile?: { expectText: string[]; click: string | null; expectAfterClick: string | null } | null; launchFile?: boolean };
export type ProjectInstallEvent = Envelope & { type: "project.install"; project: string; stage: "installing" | "done" | "failed" | "cancelled"; detail: string };
export type ProjectCloned = Envelope & { type: "project.cloned"; url: string; ok: boolean; path?: string; detail: string };
// The diagram is data: the page lays it out and the overlay draws it. made: false means none could be made.
export type DiagramReady = Envelope & { type: "diagram.ready"; project: string; ask?: string; made: boolean; reason?: string; diagram?: { nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[]; broken: { node: string; reason: string } | { edge: [string, string]; reason: string }; caption: string }; usdEstimate?: number; /** M33: a drawn picture, checked (runner/src/sketch.ts). */ sketch?: { title: string; caption: string; shapes: Record<string, unknown>[] } };
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
// yours: files the person changed themselves, which Undo left exactly as they are.
export type CheckpointRestored = Envelope & { type: "checkpoint.restored"; project: string; checkpoint: string; safety: string; recovered: string[]; largeLeftAlone: string[]; leftAlone: string[]; yours?: string[]; lastWorking?: true };
// Put those back too finished. ok false: nothing was changed (reason says why). savedTo: the folder holding the person's versions.
export type CheckpointPutBackDone = Envelope & { type: "checkpoint.putBackDone"; project: string; checkpoint: string; ok: boolean; putBack: string[]; skipped: string[]; savedTo?: string; safety?: string; reason?: string };
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
// Second Look's answer (runner/src/secondlook.ts): a verdict when ok (solid, check, or I can't tell), the items to check (each
// with what looks wrong, how to check it, and a page a web search found when there is one), what it checked, what it could
// not tell, whether it searched the web (search, searches), and what it cost. Not ok: reason says why, in plain words.
export const LOOK_KINDS = ["number", "code", "fact", "citation", "logic", "other"] as const;
export const LOOK_SEARCH = ["searched", "not_needed", "off", "unavailable"] as const;
export type SecondLookItemView = { kind: (typeof LOOK_KINDS)[number]; claim: string; issue: string; verify: string; by: "recomputed" | "model"; source?: { url: string; title: string } };
export type SecondLookResult = Envelope & {
  type: "secondlook.result"; req: string; project?: string; ok: boolean; verdict?: "solid" | "check" | "cant_tell";
  items: SecondLookItemView[]; checked: string[]; cantTell: string[]; search: (typeof LOOK_SEARCH)[number]; searches: number; reason?: string; usdEstimate: number;
};
// What the engine took from settings.apply (names only) and what it refused (each then at its usual value), never values.
export type SettingsApplied = Envelope & { type: "settings.applied"; accepted: string[]; refused: string[] };
// The state of one watch. since: when it came to this state. history: the states it has been in, newest last (at most 20).
export type WatchView = { project: string; watch: string; kind: WatchKind; target?: string; schedule: string; state: WatchStateName; since: string; reason: string; lastCheckedAt?: string; nextAt?: string; checking: boolean; history: { at: string; state: WatchStateName }[] };
export type WatchStateEvent = Envelope & { type: "watch.state" } & WatchView;
export type WatchListEvent = Envelope & { type: "watch.list"; project: string; watches: WatchView[] };
// One alert when a watch goes from fine to failing, and one when it is fine again. Never repeated while it stays the same.
export type WatchAlert = Envelope & { type: "watch.alert"; project: string; watch: string; what: "failing" | "recovered"; kind: WatchKind; target?: string; reason: string; since: string };
// stopped: it was stopped or took too long, so text is only the watch's own reason; the page stops waiting and starts nothing.
export type WatchEvidence = Envelope & { type: "watch.evidence"; project: string; watch: string; kind: WatchKind; target?: string; text: string; stopped?: boolean };
// M57 feature 6: review, the project changed since and nobody looked yet, or a review said Fix this first and it still holds.
export type WhereNext = { action: "fixWatch"; watch: string } | { action: "findProblem" } | { action: "review" } | { action: "open" } | { action: "none" };
export type WhereReady = Envelope & { type: "where.ready"; project: string; lines: string[]; next: WhereNext };
// M52. A batch of changes is ready to review: up to 50 files (count is all of them; capped when more changed than one batch
// may look at one by one), the settings and key files among them by name only (secretFiles: nothing in them is read), and
// auto when review.mode is automatic, so its review follows by itself. A batch with count 0 means the changes it named are
// gone again (put back as they were): nothing is left to review, and the page closes its card.
/** Must fix 8 (M57): a batch of changes made while the engine was closed, or while it watched another project (or reviews
 *  were off). Only on the batch found when watching starts; a batch that grows after it has no mark. Never reviewed by itself. */
export const REVIEW_AWAY = ["closed", "notWatching"] as const;
/** M57 feature 5, the instant key warning (review.keyWarning): only the key rule ran, on this Mac with no model, on the
 *  lines the batch added. Where each key is (file and line, at most 10), never its text. Absent when the setting is off or
 *  nothing like a key was added. */
export type ReviewKeyPlace = { file: string; line: number; lines?: CodeLine[] };
export type ReviewBatchEvent = Envelope & { type: "review.batch"; project: string; batch: string; files: ReviewFile[]; count: number; capped: boolean; secretFiles: string[]; auto: boolean; away?: (typeof REVIEW_AWAY)[number]; keys?: ReviewKeyPlace[] };
export type ReviewStarted = Envelope & { type: "review.started"; project: string; batch: string; proof: boolean };
/** M57 feature 4: when a newer batch was reviewed, the rules looked again at an earlier review's reasons that were still
 *  open, with no model. fixed: the places (in that review's reasons) of those that no longer hold ("Changed since, this no
 *  longer applies"). closed: nothing is left, so its card closes and the newer review (by) shows. */
export type ReviewRecheck = Envelope & { type: "review.recheck"; project: string; batch: string; by: string; fixed: number[]; closed: boolean };
// The review. ok false: nothing was reviewed, reason says why in plain words (batch, when one was named). ok true: what changed
// (summary, notes: plain words, secrets hidden), what it touches, the rating and its reasons (the most serious first, each
// with its file and line when it has one), the files, what the project's own checks said (checks, and checksNote: one plain
// line), the ready "send back to my AI" message (sendBack, no secrets), which model wrote the words (none: the rules' own
// words, with no model, or at the day's limit, and note says why) and what it cost.
export type ReviewResultEvent = Envelope & {
  type: "review.result"; project: string; batch?: string; ok: boolean; reason?: string;
  rating?: ReviewRating; touches?: ReviewTouch[]; summary?: string; notes?: string[]; reasons?: ReviewReason[]; files?: ReviewFile[]; count?: number; capped?: boolean;
  secretFiles?: string[]; checks?: ReviewChecks; checksNote?: string; sendBack?: string; lane?: (typeof REVIEW_LANES)[number]; usdEstimate: number;
  /** One plain line about the words when no model wrote them: the day's limit reached, or no Claude connected. */
  note?: string;
  /** M57: the project's own notes for AI tools (AGENTS.md, CLAUDE.md, Cursor rules) the words were written with, by name.
   *  Only when a model wrote the words; they were given to it as quoted data, never as instructions. */
  ruleFiles?: string[];
  /** M57: how many smaller reasons were left out by review.strictness or a "do not flag" line. Never a Fix this first. */
  hidden?: number;
};
export type Event = ReviewBatchEvent | ReviewStarted | ReviewRecheck | ReviewResultEvent | PlanUsage | PlanLimit | WatchStateEvent | WatchListEvent | WatchAlert | WatchEvidence | WhereReady | SettingsApplied | BisectProgress | BisectResult | BisectUndone | ErrorExplained | SecondLookResult | ExplainReady | TeachReady | TeachResult | TeachStep | SpendingState | BrowserStatus | BrowserInstallEvent | CheckpointRestored | CheckpointPutBackDone | MetricsSummary | WalkLessons | WalkStepEvent | WalkAsk | WalkHelp | WalkWait | WalkDone | WalkStopped | DiagramReady | ProjectReportEvent | ProjectInstallEvent | ProjectCloned | ShipCard | ReceiptVisual | ProblemFound | RunnerPong | ShipGates | ResearchDone | RescueReport | DrivePaused | LoopStuck | PlanReady | DriveStep | DriveDone | TasksListEvent | ProofStepEvent | ProofResult | ApprovalResolved | AssistPromptDelta | AssistPromptDone | AssistPoint | AssistProblem | AssistError | RunnerHello | AuthStatus | CheckpointCreated | AgentState | AgentTool | AgentFile | ApprovalRequest | CostUpdate | Receipt | ProtocolError | ShipSignInEvent | PracticeKeyEvent;

export type Parsed<T> = { ok: true; msg: T } | { ok: false; error: string };

type Check = (m: Record<string, unknown>) => string | null;
const str: (k: string) => Check = (k) => (m) => (typeof m[k] === "string" && (m[k] as string).length > 0 ? null : `missing text field "${k}"`);
const num: (k: string) => Check = (k) => (m) => (typeof m[k] === "number" && Number.isFinite(m[k] as number) && (m[k] as number) >= 0 ? null : `missing or invalid number "${k}"`);
const bool: (k: string) => Check = (k) => (m) => (typeof m[k] === "boolean" ? null : `missing true or false "${k}"`);
const oneOf: (k: string, vals: string[]) => Check = (k, vals) => (m) => (vals.includes(m[k] as string) ? null : `"${k}" must be one of ${vals.join(", ")}`);
const list: (k: string) => Check = (k) => (m) => (Array.isArray(m[k]) ? null : `"${k}" must be a list`);
const obj: (k: string) => Check = (k) => (m) => (typeof m[k] === "object" && m[k] !== null && !Array.isArray(m[k]) ? null : `"${k}" must be an object`);
// A whole number from 0, and a calendar day (YYYY-MM-DD, a real date).
const whole: (k: string) => Check = (k) => (m) => (Number.isInteger(m[k]) && (m[k] as number) >= 0 ? null : `"${k}" must be a whole number from 0`);
const day: (k: string) => Check = (k) => (m) => {
  const v = m[k];
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `"${k}" must be a day, YYYY-MM-DD`;
  const [y, mo, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? null : `"${k}" must be a real day`;
};
// An optional field: absent is fine, present must be valid.
const NEXT_ACTIONS = ["fixWatch", "findProblem", "review", "open", "none"];
const oneOfNext = (n: Record<string, unknown>): boolean => NEXT_ACTIONS.includes(n.action as string) && (n.action !== "fixWatch" || (typeof n.watch === "string" && n.watch.length > 0));
const opt: (k: string, c: Check) => Check = (k, c) => (m) => (m[k] === undefined ? null : c(m));
const needsOk: Check = opt("needs", oneOf("needs", ["browser"]));
// M58: a check step may also need the person to sign in (a sign in wall): never on any other event.
const stepNeedsOk: Check = opt("needs", oneOf("needs", ["browser", "signIn"]));
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
const stepsNeedsOk: Check = (m) => (Array.isArray(m.steps) && m.steps.some((s) => typeof s === "object" && s !== null && stepNeedsOk(s as Record<string, unknown>)) ? 'a step\'s "needs" must be "browser" or "signIn"' : null);

const lookItemOk = (i: unknown): boolean => {
  if (typeof i !== "object" || i === null || Array.isArray(i)) return false;
  const o = i as Record<string, unknown>;
  const src = o.source as Record<string, unknown> | undefined;
  return (LOOK_KINDS as readonly string[]).includes(o.kind as string) && ["claim", "issue", "verify"].every((k) => typeof o[k] === "string") && ["recomputed", "model"].includes(o.by as string)
    && (src === undefined || (typeof src === "object" && src !== null && typeof src.url === "string" && /^https?:\/\/[^\s]+$/i.test(src.url) && typeof src.title === "string"));
};

// M52: a changed file, and a reason of a review.
const FILE_KINDS = ["added", "modified", "deleted"];
// A path from the project folder down: never whole (from /), never up and out (..), never Windows' backslashes, never empty.
const fileInProject = (k: string): Check => (m) => {
  const f = m[k];
  return typeof f === "string" && f.length > 0 && f.length <= 1024 && !f.startsWith("/") && !f.includes("\\") && !f.includes("\u0000") && !f.split("/").some((p) => p === ".." || p === "")
    ? null : `"${k}" must be a path from the project folder down`;
};
const isReviewFile = (f: unknown): boolean => { const o = f as Record<string, unknown> | null; return !!o && typeof o === "object" && !Array.isArray(o) && typeof o.file === "string" && o.file.length > 0 && FILE_KINDS.includes(o.kind as string); };
// M69: the pointed line's excerpt, at most three lines, each a line number from 1 and its masked text (at most 200 characters).
const codeLinesOk = (x: unknown): boolean => x === undefined || (Array.isArray(x) && x.length >= 1 && x.length <= 3 && x.every((l) => {
  const o = l as Record<string, unknown> | null;
  return !!o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).every((n) => n === "n" || n === "text") && Number.isInteger(o.n) && (o.n as number) >= 1 && typeof o.text === "string" && Array.from(o.text as string).length <= 200;
}));
const isReviewReason = (r: unknown): boolean => {
  const o = r as Record<string, unknown> | null;
  return !!o && typeof o === "object" && !Array.isArray(o) && (REVIEW_REASONS as readonly string[]).includes(o.kind as string) && typeof o.say === "string" && o.say.length > 0
    && (o.file === undefined || (typeof o.file === "string" && o.file.length > 0)) && (o.line === undefined || (Number.isInteger(o.line) && (o.line as number) >= 1)) && codeLinesOk(o.lines);
};
const filesListOk = (k: string): Check => (m) => (Array.isArray(m[k]) && (m[k] as unknown[]).every(isReviewFile) ? null : `"${k}" must be a list of files, each with file and kind`);
const textList = (k: string): Check => (m) => (Array.isArray(m[k]) && (m[k] as unknown[]).every((x) => typeof x === "string") ? null : `"${k}" must be a list of text`);
// M57 feature 5: where the instant key warning found a key: a file in the project and a line from 1, nothing else (never text).
const keyPlacesOk: Check = (m) => {
  const k = m.keys;
  return Array.isArray(k) && k.length >= 1 && k.length <= 10 && k.every((x) => {
    const o = x as Record<string, unknown> | null;
    return !!o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).every((n) => n === "file" || n === "line" || n === "lines") && fileInProject("file")(o) === null && Number.isInteger(o.line) && (o.line as number) >= 1 && codeLinesOk(o.lines);
  }) ? null : '"keys" must be 1 to 10 places, each a file and a line, and at most the masked lines around it';
};
// M57 feature 1: the review rows History shows. Names of files only (no text field of any kind besides the summary).
const reviewRowsOk: Check = (m) => {
  const rows = m.reviews;
  const ok = Array.isArray(rows) && rows.length <= 200 && rows.every((x) => {
    const o = x as Record<string, unknown> | null;
    return !!o && typeof o === "object" && !Array.isArray(o) && Number.isInteger(o.id) && typeof o.at === "string" && !Number.isNaN(Date.parse(o.at as string)) && Number.isInteger(o.count) && (o.count as number) >= 0
      && Array.isArray(o.files) && (o.files as unknown[]).length <= 20 && (o.files as unknown[]).every((f) => typeof f === "string" && f.length > 0)
      && (REVIEW_RATINGS as readonly string[]).includes(o.rating as string) && Array.isArray(o.touches) && (o.touches as unknown[]).every((t) => (REVIEW_TOUCHES as readonly string[]).includes(t as string))
      && (REVIEW_CHECKS as readonly string[]).includes(o.checks as string) && (REVIEW_DID as readonly string[]).includes(o.did as string) && typeof o.summary === "string";
  });
  return ok ? null : '"reviews" must be a list of review rows: id, at, count, files (names), rating, touches, checks, did and summary';
};
const reviewOk: Check = (m) => {
  if (m.ok !== true) return typeof m.reason === "string" && m.reason.length > 0 ? null : 'a review that did not run says why in "reason"';
  if (typeof m.batch !== "string" || !m.batch) return 'a review names its "batch"';
  if (!(REVIEW_RATINGS as readonly string[]).includes(m.rating as string)) return `"rating" must be one of ${REVIEW_RATINGS.join(", ")}`;
  if (!Array.isArray(m.touches) || !m.touches.every((t) => (REVIEW_TOUCHES as readonly string[]).includes(t as string))) return '"touches" must be a list of known touches';
  if (typeof m.summary !== "string" || !m.summary) return 'a review needs its "summary"';
  if (!Array.isArray(m.reasons) || !m.reasons.every(isReviewReason)) return '"reasons" must be a list, each with a known kind and its words';
  if (!(REVIEW_CHECKS as readonly string[]).includes(m.checks as string)) return `"checks" must be one of ${REVIEW_CHECKS.join(", ")}`;
  if (typeof m.sendBack !== "string" || !m.sendBack) return 'a review needs its "sendBack" message';
  if (!(REVIEW_LANES as readonly string[]).includes(m.lane as string)) return `"lane" must be one of ${REVIEW_LANES.join(", ")}`;
  return filesListOk("files")(m) ?? textList("notes")(m) ?? textList("secretFiles")(m) ?? whole("count")(m) ?? bool("capped")(m);
};

const COMMANDS: Record<string, Check[]> = {
  "review.now": [str("project"), opt("batch", str("batch")), opt("proof", bool("proof"))],
  "review.dismiss": [str("project"), str("batch"), opt("how", oneOf("how", [...REVIEW_CLOSED_HOW]))],
  "review.fix": [str("project"), str("batch"), str("agent"), str("model"), num("budgetUsd")],
  "agent.start": [str("project"), str("agent"), oneOf("mode", ["drive", "rescue", "research", "ship"]), str("prompt"), str("model"), num("budgetUsd"), filesOk, imagesOk, practiceOk],
  "tasks.list": [str("project")],
  "drive.plan": [str("project"), str("agent"), str("goal"), str("model"), num("budgetUsd")],
  "drive.approve": [str("agent"), list("steps")],
  "runner.ping": [],
  "google.accounts": [list("accounts")],
  "engine.warm": [],
  "settings.apply": [obj("values"), opt("project", str("project")), opt("projectValues", obj("projectValues"))],
  "plan.state": [oneOf("plan", [...PLANS]), bool("paymentsOn"), opt("trialEndsAt", (m) => (typeof m.trialEndsAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(m.trialEndsAt) ? null : '"trialEndsAt" must be an ISO time'))],
  "ship.preview": [str("project")],
  "ship.live": [str("project"), str("url"), (m) => (m.confirm === true ? null : 'going live needs "confirm": true')],
  "ship.rollback": [str("project"), (m) => (m.confirm === true ? null : 'a rollback needs "confirm": true')],
  "auth.check": [],
  "doctor.check": [],
  "problem.find": [str("project"), str("agent"), opt("first", bool("first"))],
  "diagram.ask": [str("project"), str("question"), opt("style", oneOf("style", ["sketch"]))],
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
  "secondlook.check": [str("req"), str("app"), str("text"), opt("project", str("project"))],
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
  "watch.add": [str("project"), oneOf("kind", [...WATCH_KINDS]), str("schedule"), opt("target", (m) => (typeof m.target === "string" ? null : '"target" must be text'))],
  "watch.list": [str("project")],
  "watch.remove": [str("project"), str("watch")],
  "watch.pause": [str("project"), str("watch"), bool("paused")],
  "watch.check": [str("project"), str("watch")],
  "watch.fix": [str("project"), str("watch")],
  "where.was.i": [str("project"), opt("since", (m) => (typeof m.since === "string" && !Number.isNaN(Date.parse(m.since)) ? null : '"since" must be a time'))],
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
  "loop.choose": [str("agent"), oneOf("choice", ["different", "stop", "research", "lastWorking"])],
  "agent.send": [str("agent"), str("project"), opt("retry", bool("retry")), (m) => (m.retry === true ? opt("text", (x) => (typeof x.text === "string" ? null : '"text" must be text'))(m) : str("text")(m))],
  "agent.interrupt": [str("agent"), opt("release", bool("release"))],
  "agent.interruptAll": [str("reason")],
  "approval.resolve": [str("approval"), oneOf("decision", ["allow", "deny"]), oneOf("scope", ["once", "task"])],
  "checkpoint.restore": [str("project"), str("checkpoint"), opt("force", bool("force"))],
  "checkpoint.putBack": [str("project"), str("checkpoint"), (m) => (m.confirm === true ? null : 'putting your files back needs "confirm": true'), opt("files", list("files"))],
  "assist.prompt": [str("req"), str("app"), str("target"), str("text"), oneOf("style", ["full", "light"])],
  "assist.locate": [str("req"), str("question"), obj("image"), screensOk, opt("app", str("app")), opt("mode", oneOf("mode", ["everyday", "recheck"])), opt("before", oneOf("before", [...SHEET_CODES]))],
  "assist.cancel": [str("req")],
  "assist.image": [str("ref"), oneOf("mediaType", ["image/jpeg", "image/png"]), str("base64"), num("w"), num("h")],
  "checkpoint.mark": [str("project"), str("checkpoint"), opt("star", bool("star")), opt("name", (m) => (typeof m.name === "string" && m.name.length <= 40 ? null : '"name" must be text of at most 40 characters')), (m) => (m.star === undefined && m.name === undefined ? 'a mark needs "star" or "name"' : null)],
  // M58 (UI 13): the person's own Vercel sign in, on their press.
  "ship.signIn": [str("project"), opt("stop", bool("stop"))],
  // M58 (feature 9): the key practice's pretend AI and its fixed fix, on the person's press.
  "practice.key": [str("project"), oneOf("step", ["write", "fix"])],
};

const EVENTS: Record<string, Check[]> = {
  // M52, the review of every change (runner/src/review/service.ts).
  "review.batch": [str("project"), str("batch"), filesListOk("files"), whole("count"), bool("capped"), textList("secretFiles"), bool("auto"), opt("away", oneOf("away", [...REVIEW_AWAY])), opt("keys", keyPlacesOk)],
  "review.started": [str("project"), str("batch"), bool("proof")],
  "review.recheck": [str("project"), str("batch"), str("by"), (m) => (Array.isArray(m.fixed) && m.fixed.length > 0 && m.fixed.every((n) => Number.isInteger(n) && (n as number) >= 0) ? null : '"fixed" must be a list of whole numbers from 0'), bool("closed")],
  "review.result": [str("project"), bool("ok"), num("usdEstimate"), opt("batch", str("batch")), opt("checksNote", (m) => (typeof m.checksNote === "string" ? null : '"checksNote" must be text')), opt("note", str("note")), opt("ruleFiles", textList("ruleFiles")), opt("hidden", whole("hidden")), reviewOk],
  // payments spec sections 2, 3 and 9 (runner/src/plan.ts); protocol/fixtures/plan-cases.jsonl is run by both suites.
  "plan.usage": [whole("used"), whole("limit"), day("resetsOn"), bool("everUsed")],
  "plan.limit": [oneOf("reason", [...PLAN_LIMITS]), opt("resetsOn", day("resetsOn")), opt("command", str("command")),
    (m) => (m.reason !== "fixes" || m.resetsOn !== undefined ? null : 'a fixes limit says when they come back in "resetsOn"')],
  "runner.hello": [str("runnerVersion"), str("sdk")],
  "tasks.list": [str("project"), list("tasks"), opt("sinceCheck", oneOf("sinceCheck", ["same", "changed"])), opt("reviews", reviewRowsOk), opt("lastWorking", (m) => { const w = m.lastWorking as Record<string, unknown>; return w && typeof w === "object" && typeof w.checkpoint === "string" && /^cp_/.test(w.checkpoint) && typeof w.at === "string" ? null : '"lastWorking" needs a checkpoint and when'; })],
  "runner.pong": [opt("ping", str("ping"))],
  "settings.applied": [list("accepted"), list("refused")],
  // answers: the id of the command this state answers; refused: why that command could not do what it asked.
  "memory.state": [str("project"), bool("paused"), list("projectLines"), list("profileLines"), list("problems"), opt("answers", str("answers")), opt("refused", str("refused"))],
  "memory.saved": [str("project"), oneOf("scope", ["project", "profile"]), str("line"), str("text"), str("source")],
  "ship.status": [str("project"), oneOf("stage", ["checking_gates", "not_signed_in", "deploying", "checking_preview", "ready", "failed", "refused", "live", "rolled_back"]), str("detail"), needsOk],
  "doctor.report": [list("items")],
  "diagram.ready": [str("project"), bool("made")],
  "checkpoint.restored": [str("project"), str("checkpoint"), str("safety"), list("recovered"), list("largeLeftAlone"), list("leftAlone"), opt("yours", list("yours"))],
  "checkpoint.putBackDone": [str("project"), str("checkpoint"), bool("ok"), list("putBack"), list("skipped")],
  "metrics.summary": [bool("enabled"), obj("days"), obj("totals"), obj("rates")],
  "browser.status": [bool("installed"), bool("installing")],
  "browser.install": [oneOf("stage", ["downloading", "done", "failed", "cancelled"]), str("detail"), opt("percent", (m) => (typeof m.percent === "number" && m.percent >= 0 && m.percent <= 100 ? null : '"percent" must be a number from 0 to 100')), opt("mb", num("mb"))],
  "spending.state": [str("project"), num("limitUsd"), num("spentUsd"), num("minUsd"), num("maxUsd")],
  "bisect.progress": [str("project"), str("agent"), num("run"), num("maxRuns"), oneOf("what", ["now", "after", "before"])],
  "bisect.result": [str("project"), str("agent"), oneOf("outcome", ["found", "not_failing", "already_failing", "after_last_task", "outside_change", "unsure", "too_few", "cannot_check", "busy", "failed", "cancelled"]), num("runs"), num("maxRuns"),
    opt("undo", oneOf("undo", ["safe", "show_only"])), (m) => (m.outcome !== "found" || (typeof m.task === "object" && m.task !== null && typeof (m.task as Record<string, unknown>).checkpoint === "string") ? null : 'a found task needs "task" with its "checkpoint"')],
  "bisect.undone": [str("project"), str("checkpoint"), bool("ok"), list("reverted")],
  "secondlook.result": [str("req"), bool("ok"), list("items"), list("checked"), list("cantTell"), oneOf("search", [...LOOK_SEARCH]), num("searches"), num("usdEstimate"),
    (m) => (m.ok !== true || ["solid", "check", "cant_tell"].includes(m.verdict as string) ? null : 'an answer needs "verdict": solid, check or cant_tell'),
    (m) => (m.verdict === undefined || ["solid", "check", "cant_tell"].includes(m.verdict as string) ? null : '"verdict" must be solid, check or cant_tell'),
    (m) => ((m.items as unknown[]).every(lookItemOk) ? null : 'each item needs kind, claim, issue, verify and by, and a source only as a web address with a title'),
    (m) => ([...(m.checked as unknown[]), ...(m.cantTell as unknown[])].every((x) => typeof x === "string") ? null : '"checked" and "cantTell" must be lists of text')],
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
  "receipt.visual": [str("agent"), str("project"), str("checkpoint"), bool("made"), (m) => (m.made !== true || (typeof m.image === "string" && m.image.length > 0) ? null : "a made picture needs \"image\""), opt("before", (m) => (typeof m.before === "string" && m.before.length > 0 ? null : '"before" must be a picture')), num("circles")],
  "problem.found": [str("project"), str("agent"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"]), needsOk, opt("note", str("note"))],
  "explain.ready": [str("agent"), str("checkpoint"), list("bullets"), num("usdEstimate"), opt("step", stepOk)],
  "teach.ready": [str("project"), str("checkpoint"), bool("made"), (m) => (m.made !== true || isPlace(m.target) ? null : "a made turn needs a \"target\" place")],
  "teach.result": [str("project"), str("checkpoint"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"]), bool("same")],
  "teach.step": [str("project"), str("checkpoint"), str("rung"), str("label"), oneOf("status", ["running", "passed", "failed", "skipped"]), (m) => (typeof m.detail === "string" ? null : "missing text field \"detail\""), needsOk],
  "explain.state": [str("project"), bool("enabled"), oneOf("mode", [...EXPLAIN_MODES])],
  "recap.ready": [str("project"), list("lines")],
  "watch.state": [str("project"), str("watch"), oneOf("kind", [...WATCH_KINDS]), opt("target", str("target")), str("schedule"), oneOf("state", [...WATCH_STATES]), str("since"), str("reason"), bool("checking"), list("history")],
  "watch.list": [str("project"), list("watches")],
  "watch.alert": [str("project"), str("watch"), oneOf("what", ["failing", "recovered"]), oneOf("kind", [...WATCH_KINDS]), opt("target", str("target")), str("reason"), str("since")],
  "watch.evidence": [str("project"), str("watch"), oneOf("kind", [...WATCH_KINDS]), opt("target", str("target")), str("text"), opt("stopped", bool("stopped"))],
  "where.ready": [str("project"), list("lines"), (m) => (typeof m.next === "object" && m.next !== null && !Array.isArray(m.next) && oneOfNext((m.next as Record<string, unknown>)) ? null : '"next" must say what to do next')],
  "memory.agents_ask": [str("project"), list("files")],
  "memory.agents_written": [str("project"), list("files")],
  "memory.refused": [str("project"), str("reason")],
  "memory.exported": [str("project"), str("text")],
  "ship.gates": [str("project"), bool("canShip"), list("gates"), list("blockedBy"), list("needsYou"), list("confirmed"), num("allowedCount")],
  "research.done": [str("agent"), str("title"), str("answer"), list("notes"), opt("file", str("file"))],
  "rescue.report": [str("agent"), str("summary"), list("works"), str("broken"), list("steps"), list("evidence"), num("estimateUsd")],
  "drive.paused": [str("agent"), oneOf("reason", ["files_changed", "editor", "terminal", "you"])],
  "loop.stuck": [str("agent"), num("index"), str("title"), obj("failure"), list("options"), opt("tries", (m) => (Number.isInteger(m.tries) && (m.tries as number) >= 1 ? null : '"tries" must be a whole number from 1')), opt("same", bool("same")), opt("rung", oneOf("rung", ["retry", "research", "lastWorking"]))],
  "plan.ready": [str("agent"), list("steps"), bool("truncated"), num("estimateUsd")],
  "drive.step": [str("agent"), num("index"), num("total"), str("title"), oneOf("status", ["started", "done", "not_done", "stopped", "over_budget"])],
  "drive.done": [str("agent"), str("status"), num("completed"), num("total"), num("usdEstimate")],
  "auth.status": [oneOf("method", ["api_key", "plan", "cloud", "none", "unknown"]), opt("tested", oneOf("tested", ["works", "refused", "no_connection", "unknown"]))],
  "checkpoint.created": [str("project"), str("agent"), str("checkpoint"), str("label"), num("files"), list("skipped"), practiceOk],
  "agent.state": [str("agent"), oneOf("state", ["idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"])],
  "agent.tool": [str("agent"), str("tool"), str("summary"), str("toolUseId"), bool("undoable")],
  "agent.file": [str("agent"), fileInProject("file"), oneOf("kind", FILE_KINDS)],
  "approval.request": [str("approval"), str("agent"), str("checkpoint"), str("toolUseId"), oneOf("risk", ["irreversible", "git", "outside_project", "install", "network", "settings", "house_rule", "scripts"]), str("title"), str("expiresAt"), opt("action", str("action")), opt("undoable", bool("undoable")), opt("check", bool("check"))],
  "cost.update": [str("agent"), num("usdEstimate"), str("basis"), obj("tokens")],
  "receipt": [str("agent"), str("checkpoint"), list("changed"), num("commands"), list("notUndoable"), oneOf("proof", ["passed", "partial", "failed", "skipped"]), num("usdEstimate"), opt("changedAt", place("changedAt")), opt("repeat", repeatOk), opt("said", str("said")), opt("asks", bool("asks")), opt("ended", oneOf("ended", ["done", "needs_you", "stopped", "failed"])), opt("endedWhy", oneOf("endedWhy", ["check_failed", "spending_limit", "daily_limit", "turns", "no_connection", "claude_busy", "error"])), opt("mode", oneOf("mode", ["drive", "rescue", "research", "ship"])), practiceOk],
  "protocol.error": [str("reason")],
  "proof.step": [str("agent"), str("rung"), str("label"), oneOf("status", ["running", "passed", "failed", "skipped"]), (m) => (typeof m.detail === "string" ? null : "missing text field \"detail\""), stepNeedsOk],
  "proof.result": [str("agent"), oneOf("verdict", ["passed", "passed_with_gaps", "failed", "nothing_to_check", "cancelled"]), list("steps"), stepsNeedsOk, num("tries"), opt("of", (m) => (Number.isInteger(m.of) && (m.of as number) >= 1 ? null : '"of" must be a whole number from 1'))],
  "approval.resolved": [str("approval"), str("agent"), oneOf("outcome", ["allowed", "denied", "expired", "cancelled"])],
  "assist.prompt.delta": [str("req"), str("text")],
  "assist.prompt.done": [str("req"), str("text"), list("diff"), num("usdEstimate"), oneOf("handback", ["paste", "copy"])],
  "assist.point": [str("req"), num("step"), num("x"), num("y"), str("targetText"), num("confidence"), str("caption"), pointExtrasOk],
  "assist.error": [str("req"), str("reason")],
  "assist.problem": [str("req"), oneOf("mode", ["everyday", "recheck"]), bool("found"), num("steps"), num("usdEstimate"), opt("why", list("why")), opt("fixes", list("fixes")), opt("gone", oneOf("gone", ["yes", "looks", "no", "unsure"])), opt("problem", str("problem")), opt("code", str("code"))],
  // M58 (UI 13): where the person's own Vercel sign in is. The page opens only an https page on vercel.com itself.
  "ship.signIn": [str("project"), oneOf("stage", ["opened", "done", "failed"]), opt("url", (m) => (typeof m.url === "string" && /^https:\/\/vercel\.com\//.test(m.url) && m.url.length <= 500 ? null : '"url" must be a page on https://vercel.com')), opt("reason", str("reason")), opt("lesson", bool("lesson"))],
  // M58 (feature 9): the key practice's step. A refusal says why; a fix names its safety copy and what it changed.
  "practice.key": [str("project"), oneOf("step", ["wrote", "fixed", "refused"]), opt("written", bool("written")), opt("checkpoint", str("checkpoint")), opt("changed", filesListOk("changed")), opt("clean", bool("clean")), opt("reason", str("reason")),
    (m) => (m.step === "refused" && !(typeof m.reason === "string" && m.reason) ? 'a refusal says why in "reason"' : null), (m) => (m.step === "fixed" && (typeof m.checkpoint !== "string" || !m.checkpoint || typeof m.clean !== "boolean") ? 'a fix names its "checkpoint" and says "clean"' : null)],
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

// Commands only the shell takes (it does the work, then sends the engine an ordinary command). The engine's parseCommand
// does not know them.
const requestOk: Check = (m) => (typeof m.request === "string" && m.request.trim().length > 0 && Array.from(m.request).length <= MAX_REQUEST_CHARS ? null : `"request" must be words, at most ${MAX_REQUEST_CHARS} characters`);
const SHELL_COMMANDS: Record<string, Check[]> = {
  "project.new": [oneOf("kind", [...NEW_FOLDER_KINDS]), requestOk, str("agent"), str("model"), num("budgetUsd"), opt("offTheRecord", bool("offTheRecord")),
    (m) => (m.project === undefined ? null : 'a new folder is made by the shell, so the command names no "project"')],
};

// Every command type the engine takes, as its checks know them (runner/test/plan.test.ts walks them: each is in exactly one
// of plan.ts's lists, so a new one cannot be added without deciding whether the plan gates it).
export const COMMAND_TYPES: readonly string[] = Object.freeze(Object.keys(COMMANDS));
export const parseCommand = (line: string): Parsed<Command> => parseWith<Command>(line, COMMANDS);
export const parseShellCommand = (line: string): Parsed<ShellCommand> => parseWith<ShellCommand>(line, SHELL_COMMANDS);
export const parseEvent = (line: string): Parsed<Event> => parseWith<Event>(line, EVENTS);
// Half an emoji is not valid text and the app refuses it, so any stray half is replaced before a message is sent.
export const serialize = (msg: Command | Event): string => JSON.stringify(msg, (_k, v) => (typeof v === "string" ? v.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd") : v));
