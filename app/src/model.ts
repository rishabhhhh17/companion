// What the character and cards show, decided here as plain code (no screen needed to test it).
// Input: events from the runner (protocol) plus a few events from the app itself.
import { reviewReduce, type ReviewCard } from "./review.ts";
import { NO_PROJECT, SETTINGS_LESSON_ID } from "./commands.ts";
import { gateFinding, isExpected, keyPracticeReduce, practiceOf } from "./practice.ts";
import { activityWords } from "./activity.ts";
import { redact } from "../../runner/src/redact.ts";
import { S, PRODUCT } from "./strings.ts";
import { withKeys } from "./keys.ts";
import { webLink } from "./links.ts";
import { everydayReduce, everydaySettle, type Everyday } from "./everyday.ts";
import type { ReviewRowView, WatchView, WhereNext } from "../../protocol/index.ts";
import { reviewRowsOf } from "./reviewHistory.ts";
import { validView } from "./watch.ts";
import { limitShown, usageFrom, type LimitReason, type LimitView, type Usage } from "./plan.ts";
import { checkParts, WRITTEN_FOR_A_PERSON, type CheckParts } from "./checkParts.ts";
import { verdictOf, type Facts, type Verdict } from "./verdict.ts";
import { signInReduce, signInStopped } from "./shipFinish.ts";

export type CharacterState = "off" | "idle" | "listening" | "thinking" | "working" | "checking" | "needsYou" | "done" | "error";
// text: the engine's own summary (secrets hidden again here); words: the same step in plain words for the card.
export type ToolLine = { id: string; text: string; tool: string; words: string; outcome: "ran" | "blocked" | "needs_approval" | "denied" | "" };
export type ApprovalCard = { id: string; agent: string; title: string; risk: string; checkpoint: string; expiresAt: string; action?: string; undoable?: boolean; check?: boolean };
// summary: a failed step's one plain sentence from the engine; problem: where it failed. The detail (the check's own
// output) is shown behind Details (checkDetail.tsx).
/** ms and runs (M69): how long the check took and the commands it ran with their exit codes, for the receipt's proof ticks. */
// M58: needs "signIn" when the browser check stopped at a sign in wall (the person's turn, never proven). of: the task's
// tries for one approach (work.tries), as the engine said it, for "Try 1 of 3".
export type ProofLine = { rung: string; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; summary?: string; problem?: Problem; ms?: number; runs?: { command: string; exit: number }[]; needs?: "signIn" };
export type ProofState = { steps: ProofLine[]; verdict?: string; tries: number; of?: number };
// changedAt: the first changed line ("Show me what changed"). repeat: the same small change made in two places (your turn).
export type ChangeAt = { file: string; line: number; lineText: string };
export type Repeat = { first: ChangeAt; second: ChangeAt; was: string; now: string };
// turnTaken: the person's turn was set up from this receipt, so the engine has no offer left to try (Let me try the next one is not shown again).
// undone: an undo point in this project was restored after it, so the work it shows is no longer what is in the files.
// said: the agent's last words (secrets hidden again here); asks: they ask the person something, so the task needs them.
// gone: the engine restarted after it, and the new one keeps no conversation to carry on, so it cannot be followed up.
// M45 (verdict.ts): end, limit and failWhy: how the task ended, as the engine said (no end: it did not say, never read as
// done). undoSafety: the safety copy the Undo made first, which "Bring the fix back" restores. back: the fix was brought
// back after the Undo (undone stays true: the conversation still does not match); backPartly: but some fix files were left
// as the person changed them after the Undo. fixKept: the last restore was "Put my fix back" on a turn, which puts the fix
// itself back, so the files are as checked (undone stays true for the same reason). earlierUndone: "Which task broke it"
// undid an earlier task after this one: this task's files stay, but the engine no longer follows its conversation up.
export type Receipt = { proof?: string; checkpoint: string; changed: { file: string; kind: string; added?: number; removed?: number; was?: number }[]; askWords?: number; commands: number; notUndoable: string[]; usdEstimate: number; picture?: boolean; visual?: { image?: string; before?: string; caption: string }; changedAt?: ChangeAt; repeat?: Repeat; turnTaken?: boolean; undone?: boolean; said?: string; asks?: boolean; inPlan?: boolean; gone?: boolean;
  end?: "done" | "stopped" | "limit" | "needsYou" | "failed"; limit?: "spending" | "daily" | "turns"; failWhy?: "check" | "noConnection" | "claudeBusy" | "error";
  undoSafety?: string; back?: boolean; backPartly?: boolean; fixKept?: boolean; earlierUndone?: boolean;
  // A plan's whole fix (must fix 7): its steps, and the last step's own undo point (its picture is made for that one). The
  // receipt's checkpoint is then the first step's, so Undo puts back the whole fix.
  wholePlan?: { steps: number; last: string } };
// checkpoint: the undo point it began with (a task that changes files; a read only look has none).
// files (M55, live progress): each file the agent's own tools really changed so far, in the order they first changed, with
// how each changed over the whole task (agent.file). The receipt stays the whole list, with what commands changed too.
export type LiveFile = { file: string; kind: "added" | "modified" | "deleted" };
export type Task = { agent: string; project?: string; checkpoint?: string; label: string; lines: ToolLine[]; costUsd: number; proof?: ProofState; files?: LiveFile[] };
// undone (M45): an Undo put the project back to before this task (the engine's task log says so). back: Bring the fix back
// then put its files back again (undone stays set).
export type HistoryItem = { id: number; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null; undone?: boolean; back?: boolean; lastWorking?: boolean; star?: boolean; name?: string };
export type PlanCard = { agent: string; steps: string[]; truncated: boolean; estimateUsd: number };
export type DriveProgress = { index: number; total: number; title: string; status: string; completed: number; finished?: { status: string; completed: number; total: number }; whole?: PlanWhole };
/** What a plan's steps did so far, added up from each step's receipt (must fix 7): the first step's undo point, every file
 *  changed, the commands, what cannot be undone and the cost. drive.done turns it into one receipt for the whole fix. */
export type PlanWhole = { first: string; last: string; steps: number; changed: Receipt["changed"]; commands: number; notUndoable: string[]; usd: number };
// tries and same: how the tries ran out, when it was not the usual three identical failures (work.tries, work.askOnAnyFailure).
// agent: the one it holds up (a task that keeps going in the folder before is named with its folder).
// failure: the check that kept failing, and its result in plain words with the raw output kept for behind Details (M45).
export type StuckCard = { index: number; title: string; failure: { label: string; parts: CheckParts }; options: { id: string; label: string }[]; tries?: number; same?: boolean; agent?: string };
export type Paused = { reason: string; path?: string; agent?: string };
export type RescueCard = { summary: string; works: string[]; broken: string; evidence: { label: string; status: string; detail: string }[] };
// file: where the notes were filed; none when it was asked off the record.
// n: which answer this is since Companion started (each one is its own, for Answer out loud, even off the record).
export type ResearchCard = { title: string; answer: string; notes: { text: string; source: string }[]; file?: string; n?: number };
/** `req`: the request the read was sent as (said with "thinking"). Only that request's stream, result or error is taken,
 *  so a result cancelled since, or an older box's, never comes back over a newer one. */
export type PromptHelp = {
  stage: string; app?: string; message?: string; streaming?: string;
  text?: string; diff: [string, string][]; question?: string; options?: string[]; handback?: string; req?: string;
};
/** Is this engine event for the Prompt help request on the card now? */
const phOwn = (m: Model, req: unknown): boolean => !!m.ph?.req && req === m.ph.req;
export type ShipGate = { id: string; label: string; status: "passed" | "blocked" | "could_not_check" | "not_applicable"; detail: string; findings?: string[]; overridable?: boolean };
export type ShipReport = { gates: ShipGate[]; canShip: boolean; blockedBy: string[]; needsYou: string[]; confirmed: string[] };
export type MemoryLine = { id: string; text: string; source: string; date: string };
export type MemoryState = { paused: boolean; projectLines: MemoryLine[]; profileLines: MemoryLine[]; problems: string[] };
export type Saved = { id: string; scope: "project" | "profile"; text: string };
export type Explain = { checkpoint: string; bullets: string[]; question?: { text: string; options: string[]; correct: number } };
// One Drive step's explanation, kept for the plan's card (each step's own receipt is replaced by the next step's).
export type StepExplain = { index: number; title: string; explain: Explain };
// Your turn. asking: pressed, waiting for the engine. ready: the second place is the person's to change (note: why a check
// stopped). refused: nothing was changed, and why. checking (steps: the rungs of their check so far), then checked with the
// result. left: the person chose to leave the place as it is, still not fixed. restoring, then restored. agent: the one that
// checked their change (the engine leaves it waiting on the person after a check that failed). orphan: the engine restarted
// during the turn, so Check my change cannot run any more; the fix can still be put back (its undo point is on disk).
export type TeachState = {
  stage: "asking" | "ready" | "refused" | "checking" | "checked" | "left" | "restoring" | "restored"; checkpoint: string; reason?: string; note?: string; agent?: string; orphan?: boolean;
  target?: ChangeAt; example?: { file: string; line: number; was: string; now: string }; change?: { was: string; now: string }; restore?: string;
  result?: { verdict: string; same: boolean; label?: string; detail?: string; problem?: Problem }; steps?: ProofLine[];
};
export type ShipFlow = { stage: string; detail: string; previewUrl?: string; productionUrl?: string; canGoLive?: boolean; card?: { image: string; url: string; title: string };
  /** M58 (UI 13): the person's own Vercel sign in, from their press (shipFinish.ts). */
  signIn?: { stage: "asked" | "opened" | "done" | "failed"; url?: string; reason?: string; lesson?: boolean } };
// turn: the ring is waiting for the person's own click (Do it for me is offered).
export type ShowMe = { stage: string; message: string; req?: string; turn?: boolean; step?: number; of?: number };
export type Voice = { stage: string; message: string; percent?: number; text?: string };
export type Problem = import("../../protocol/index.ts").Problem;
// note: one plain line from the engine about something that could not be checked (the Vercel tool signed out, say).
// fixing (M58, feature 8): Fix it was pressed. The found problem stays on screen until the engine's first event for the fix.
export type PointCard = { stage: "checking" | "found" | "clear" | "gaps" | "nothing"; label?: string; message?: string; problem?: Problem; agent?: string; note?: string; fixing?: boolean };
/** Is there anything to point at on the screen? A deploy problem with no line in this folder (a setting Vercel lacks,
 *  say) is Companion's own sentence, never on screen, so the card says it in words and the screen is not looked at. */
export const pointsOnScreen = (p: Problem | null | undefined): p is Problem => !!p && !(p.kind === "message" && p.from === "deploy");
/** m67 bug 27: whether a Find answer is pointed at on the screen (point_problem opens the editor and may look at the
 *  screen). Only a failed answer with a place, for the project on screen, and never on the first run: its first check is
 *  not a press of Point at the problem, and the first run must not take focus or ask for Screen Recording (rules 5, 8, 9). */
export function pointsOnFound(ev: { type?: string; verdict?: string; problem?: Problem | null; project?: string }, at: { project: string; firstRun: boolean }): boolean {
  return ev.type === "problem.found" && ev.verdict === "failed" && pointsOnScreen(ev.problem) && ev.project === at.project && !at.firstRun;
}
export type About = { project: string; about: string; origin: string; needsInstall: boolean; installCommand: string | null; missing: string[]; missingCount: number; example: string | null; notes: string[] };
// A practice project (app/src/practice.ts; the catalog is app/sample/practices.json). kind: its id in the catalog. stage:
// lesson and proving are the setting practice's fix (the lesson is open, then the checks run again); proving is also the
// open table's check after its fix. where and problem: the place Find found (the problem, to point at). block: why it is
// blocked (the check could not run, it fails somewhere else, or found nothing). walk: the lesson the practice opened.
// nameSet: that lesson could not even be made because the setting's name is already in the file, so the value must be
// empty or wrong. checkpoint and result: the practice's own fix (its task's undo point and receipt). checksFailed: the
// checks after the fix did not run (busy, stopped, an error), so they can be run again. gaps: done, with a check that
// could not run. undone: the fix was undone, so the problem is back. resumed: a copy opened again; already: that copy was
// already fixed. previous: the folder in use before the practice, for Back to my project. A result's asks: the fix stopped
// to ask the person something (the receipt's question, secrets hidden), so it is answered in the follow up box under the
// result on Now, and that answer is still the practice's fix (it carries the practice id).
export type PracticeResult = { checkpoint: string; proof?: string; changed: { file: string; kind: string }[]; usdEstimate: number; changedAt?: ChangeAt; protectedChanged?: string[]; asks?: string };
export type Practice = {
  kind: string; stage: "start" | "found" | "fixing" | "lesson" | "proving" | "done" | "failed" | "blocked"; project: string;
  where?: { file?: string; line?: number; message?: string }; problem?: Problem; label?: string; why?: string; block?: "couldNotRun" | "elsewhere" | "nothing";
  walk?: string; nameSet?: boolean; checkpoint?: string; result?: PracticeResult; checksFailed?: boolean; gaps?: boolean; undone?: boolean;
  resumed?: boolean; already?: boolean; previous?: string;
  // The agent the fix's task runs on, from its undo point: the fix ends if that agent stops with no receipt.
  agent?: string;
  // M58 (feature 9): the key practice's pretend AI was asked to change a file (writing), or did (wrote); the review's answer follows.
  pretend?: "writing" | "wrote";
};
// Undo: asked (with a plain warning), sent, and finished only when the engine says it finished.
// yours: files Undo left alone because the person changed them. putBack: the separate, confirmed "Put those back too" for them.
// back (M45): this is "Bring the fix back", a restore of the Undo's own safety copy, not an Undo.
export type UndoState = { stage: "confirm" | "working" | "done" | "failed"; checkpoint: string; back?: true; note?: string; recovered?: number; large?: number; yours?: string[]; putBack?: "confirm" | "working" | "done" | "failed"; putBackNote?: string };
export type DiagramState = { stage: "asking" | "shown" | "none"; ask?: string; project?: string; reason?: string; caption?: string; brokenReason?: string };
// fromProject: made by the runner from this project's own setting names, not a lesson file.
export type LessonItem = { id: string; title: string; app: string; goal: string; status?: "draft" | "tried"; needsProject?: boolean; fromProject?: boolean; steps: number; saved: boolean };
// A guided lesson on the card. stage: a step to do, "did you already do this?" after a pause (nothing is pointed at
// until it is answered), waiting for "did that work?", words only after a step could not be proven, finished, or stopped.
// link: the one web page the step is about, only when it is a plain web address (links.ts); Learn offers Open for it.
export type WalkState = { stage: "step" | "already" | "asking" | "help" | "done" | "stopped"; id: string; lesson: string; title: string; index: number; total: number; variant: "main" | "instead"; say: string; find: string; ask: boolean; note?: string; log: { say: string; how: "done" | "skipped" }[]; link?: string; passed?: number; wordsOnly?: boolean };
// missing: the tool is not on this Mac at all (runner/src/doctor.ts), so a practice that needs it waits for it, unless
// practiceRuns: the practices run without Node, on the engine's own Bun (runner/src/proof/practicerun.ts).
export type DoctorItem = { id: string; label: string; ok: boolean; detail: string; fix?: string; missing?: true; practiceRuns?: true };
// The browser check's one time download (F14). needed: a check skipped the page only because no browser is installed (the
// engine says so with needs: "browser", never guessed from its words). installed: what the engine last said. stage: the
// person pressed the button (asked), the download is running, or it ended.
export type BrowserSetupState = { needed: boolean; installed?: boolean; stage: "idle" | "asked" | "downloading" | "done" | "failed" | "cancelled"; percent?: number; mb?: number; detail?: string };
// The daily spending limit row in Settings, for one project: the limit, what it spent today (an estimate), the bounds, and why
// a new limit was refused if it was.
export type Spending = { project: string; limitUsd: number; spentUsd: number; minUsd: number; maxUsd: number; problem?: string };
// Which task broke it: asked and running (with its progress), then done with the answer; undoing just that task asks first.
// agent: the one the search ran as, left waiting on the person while a found task is on the card.
export type BisectTask = { label: string; at: string };
export type BisectState = {
  stage: "running" | "done"; agent?: string; run?: number; maxRuns?: number; what?: string; label?: string;
  outcome?: string; step?: { rung: string; label: string }; task?: BisectTask & { checkpoint: string }; earlier?: BisectTask; later?: BisectTask;
  changed?: { file: string; kind: string }[]; changedCount?: number; undo?: "safe" | "show_only"; why?: string; diff?: string; detail?: string;
  undoStage?: "confirm" | "working" | "done" | "failed"; note?: string; reverted?: number;
};
// The error explainer: the stage the app is in (reading, consent, thinking...), then the answer for this press (req).
// where is only ever a line confirmed in the project.
export type ErrorHelp = { stage: string; app?: string; req?: string; why?: string; project?: string; sentences?: string[]; where?: Problem; excerpt?: string; evidence?: string; reason?: string };
// Second Look: the stage the app is in (reading, consent, thinking, off...), then the engine's answer for this press (req):
// ready with a verdict and what to check, or failed with a reason. A source is only ever a page a web search returned.
export type LookItem = { kind: string; claim: string; issue: string; verify: string; by: string; source?: { url: string; title: string } };
export type SecondLookView = {
  stage: string; app?: string; req?: string; why?: string; verdict?: string; items?: LookItem[]; checked?: string[]; cantTell?: string[];
  search?: string; searches?: number; usd?: number; reason?: string;
};
export type Model = {
  // The folder Home shows (null until the page has heard it). away: agents still at work that was started in another
  // folder, and that folder: nothing of that work (its steps, checks, receipt, picture or explanation) is shown here, since
  // its Undo would name an undo point of the wrong project. driveAway: the folder of the Drive plan running then, until the
  // person is back in it. workIn: each agent's task that has begun and has no receipt yet, with its folder, so that coming
  // back to that folder (or picking it again) brings the task back on Home even when it sends no more steps.
  folder: string | null;
  away: Record<string, string>;
  driveAway: string | null;
  workIn: Record<string, { project: string; checkpoint?: string; label: string }>;
  // How many research answers have come since Companion started (each answer's own number).
  researchCount: number;
  bisect: BisectState | null;
  eh: ErrorHelp | null;
  sl: SecondLookView | null;
  browser: BrowserSetupState;
  spending: Spending | null;
  doctor: DoctorItem[] | null;
  voice: Voice | null;
  showme: ShowMe | null;
  // An everyday stuck moment (everyday.ts): the key with no project, or with an app in front that is not a code tool.
  everyday: Everyday | null;
  // Point at the problem: the key was pressed and the project is being checked, or the answer came back.
  point: PointCard | null;
  // The place the last failed check pointed to, for "Show me where".
  where: Problem | null;
  // About this project (shown when a folder is opened), the package install the person started, and opening from a link.
  about: About | null;
  // The first run's practice project: find it, fix it, prove it.
  practice: Practice | null;
  // Draw it for me: asked, shown on the screen, or none could be made.
  diagram: DiagramState | null;
  undo: UndoState | null;
  lessons: LessonItem[] | null;
  // The walk the person started (so a late event from an older one is ignored), and where it is now.
  walkWant: string | null;
  walk: WalkState | null;
  install: { project: string; stage: string; detail: string } | null;
  cloneNote: string | null;
  shipFlow: ShipFlow | null;
  currentCheckpoint?: string;
  // Whether the project's files changed since the version its last passed check ran on, from the engine (tasks.list, must
  // fix 11). Unknown until the engine says, and again after a new result until it says again.
  sinceCheck?: { project: string; changed: boolean };
  explain: Explain | null;
  stepExplains: StepExplain[];
  // The checkpoints of the current plan's steps (since its plan.ready, in this folder): only their explanations are listed.
  planCheckpoints: string[];
  teach: TeachState | null;
  explainOn: boolean;
  recap: { lines: string[]; next?: WhereNext } | null;
  // Watch routines (F21), from the engine's events. watches: every watch heard about, by id (the Watch list shows one project's).
  // watchAlerts: watches whose failing alert has not ended (the island's line and mark). watchFix: the evidence for a Fix it the
  // person pressed, waiting for the page to start the task. watchAsked: the watch whose evidence was asked for.
  watches: Record<string, WatchView>;
  watchAlerts: Record<string, { project: string; kind: WatchView["kind"]; target?: string; reason: string; since: string }>;
  watchFix: { project: string; watch: string; kind: WatchView["kind"]; target?: string; text: string } | null;
  watchAsked: string | null;
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
  // M58: the last version whose checks passed here (its save point and when), from tasks.list.
  lastWorking?: { checkpoint: string; at: string };
  /** M57 feature 1: the reviews of changes to the open project, as History's own rows (names of files only). */
  reviewHistory?: ReviewRowView[];
  runnerUp: boolean;
  /** Return was pressed and the engine has not answered yet (the audit, item 27): the words sent, so Home shows them at once
   *  with Starting, and Flowflow thinks. Cleared once the engine starts the task, or refuses it, or anything else ends it. */
  sending?: { words: string } | null;
  connected: "unknown" | "api_key" | "plan" | "none";
  /** What Anthropic said about the key the person just saved (keytest.ts), and when it arrived, so setup shows only the
   *  answer for the key it saved. Null until a saved key was checked. */
  keyTested: { result: "works" | "refused" | "no_connection" | "unknown"; at: number } | null;
  agents: Record<string, CharacterState>;
  character: CharacterState;
  task: Task | null;
  approvals: ApprovalCard[];
  receipt: Receipt | null;
  // A follow up or Try again was sent and its task has not started yet (so a second press sends nothing).
  followUp: "idle" | "sending";
  notice: string | null;
  error: string | null;
  // The error that says the helper stopped (app.runner_down), so its coming back clears only that one.
  downError?: string;
  // Pro (the payments spec, sections 2 and 3; runner/src/plan.ts). proUsage: this month's free fixes, from plan.usage (the
  // engine sends it only while payments are on). proLimit: the card that took the result's place because the plan did not
  // cover what was pressed (plan.limit, or Home's own look at the count), until the person closes it or new work starts.
  proUsage?: Usage | null;
  proLimit?: LimitView | null;
  // M52 (F30): the review of the changes another AI tool made in the open project (review.ts), until it is closed.
  review?: ReviewCard | null;
};

// The record without one agent's entry.
function without<T>(r: Record<string, T>, agent: string): Record<string, T> { const o = { ...r }; delete o[agent]; return o; }
export const initial = (): Model => ({ everyday: null, folder: null, away: {}, driveAway: null, workIn: {}, researchCount: 0, bisect: null, eh: null, sl: null, spending: null, browser: { needed: false, stage: "idle" }, undo: null, lessons: null, walkWant: null, walk: null, practice: null, diagram: null, about: null, install: null, cloneNote: null, point: null, where: null, doctor: null, voice: null, showme: null, shipFlow: null, explain: null, stepExplains: [], planCheckpoints: [], teach: null, explainOn: true, recap: null, watches: {}, watchAlerts: {}, watchFix: null, watchAsked: null, memory: null, memoryNote: null, exported: null, toast: null, agentsAsk: null, ship: null, ph: null, research: null, rescue: null, paused: null, stuck: null, plan: null, drive: null, history: [], runnerUp: true, connected: "unknown", keyTested: null, agents: {}, character: "idle", task: null, approvals: [], receipt: null, followUp: "idle", notice: null, error: null });

// Busiest first: an error or a question to you outranks work in progress.
const RANK: Record<CharacterState, number> = { error: 8, needsYou: 7, checking: 6, working: 5, thinking: 4, listening: 3, done: 2, idle: 1, off: 0 };
function top(agents: Record<string, CharacterState>): CharacterState {
  let best: CharacterState = "idle";
  for (const s of Object.values(agents)) if (RANK[s] > RANK[best]) best = s;
  return best;
}
const withAgents = (m: Model, agents: Record<string, CharacterState>): Model => ({ ...m, agents, character: m.runnerUp ? top(agents) : "off" });
const RUNNING: CharacterState[] = ["thinking", "working", "checking"];

/** A folder as Home names it: its last two parts. */
export const folderName = (path: string): string => path.split("/").filter(Boolean).slice(-2).join("/") || path;

/** Something on Home still waits on the person for this agent: a question for it, the loop card, a pause, the AGENTS.md
 *  question, a plan (unless that plan is the one being put aside), or its last task ended on a question. */
function holds(m: Model, agent: string, planToo: boolean): boolean {
  if (m.approvals.some((a) => a.agent === agent) || m.stuck || m.paused || m.agentsAsk) return true;
  if (!planToo && m.plan?.agent === agent) return true;
  return m.task?.agent === agent && !!m.receipt?.asks && !followGone(m.receipt);
}
/** May this agent be put aside: it is on needs you, and nothing on Home waits on the person for it any more (a plan put
 *  aside, a found problem, which task broke it or a failed check of your turn closed)? Then Home lets it rest and asks the
 *  engine to (agent.interrupt with release, which never stops anything), so every window hears it. planToo: the plan it
 *  waits with is the one being put aside. */
export function releasable(m: Model, agent: string, planToo = false): boolean {
  return m.agents[agent] === "needsYou" && !holds(m, agent, planToo);
}
const rest = (m: Model, agent: string | undefined): Model => (agent && releasable(m, agent) ? withAgents(m, { ...m.agents, [agent]: "idle" }) : m);
/** The practice took over a problem Find found (it shows the problem and Fix it with me): the agent Find left waiting on
 *  the person, to be put aside, or null. Only while nothing else waits on the person for it. */
export function foundHandsOver(m: Model, project: string): string | null {
  const pr = m.practice, a = m.point?.agent;
  if (!pr || !project || pr.project !== project || pr.stage !== "found" || m.point?.stage !== "found" || !a) return null;
  return releasable(m, a) ? a : null;
}
/** The lesson open now is the setting practice's own fix: words only. That practice is free, with no Claude (F17 section
 *  13), so its steps never look at the screen: nothing is sent to Claude and Screen Recording is never asked for. */
export const lessonWordsOnly = (m: Model): boolean => !!m.walk && (m.walk.wordsOnly === true || (m.practice?.stage === "lesson" && m.practice.walk === m.walk.id));
/** A task that keeps going in the folder Home showed before (the person picked another one while it worked): that
 *  folder's name, for one line on Now, or null. */
export function awayFolder(m: Model): string | null {
  for (const [a, f] of Object.entries(m.away)) if (f && (RUNNING.includes(m.agents[a]) || m.agents[a] === "needsYou")) return folderName(f);
  return null;
}

const browserBusy = (b: BrowserSetupState) => b.stage === "asked" || b.stage === "downloading";
// A ship step that was running when everything stopped (Stop everything, or an engine restart, which sends nothing more)
// ends as stopped, so the Online box gets its Close back and is no longer counted as busy (audit A28). Making it live keeps
// the preview's address on its line, and once that was sent Vercel may finish it anyway, so it is never said that nothing
// went live then (the engine's own words for a promote cut short, agent.ts shipLive).
const shipStopped = (f: ShipFlow | null): ShipFlow | null => !f || !["checking_gates", "deploying", "checking_preview"].includes(f.stage) ? signInStopped(f)
  : { ...f, stage: "failed", canGoLive: false, detail: f.stage === "deploying" && f.previewUrl ? `Stopped. ${PRODUCT} could not confirm whether it went live. Check your project on vercel.com.` : "Stopped. Nothing went live." };
// A new task or another folder: an old offer or an old result goes; a download that is running stays on the card.
const browserFresh = (b: BrowserSetupState): BrowserSetupState => (browserBusy(b) ? b : { needed: false, stage: "idle", ...(b.installed !== undefined ? { installed: b.installed } : {}) });
const browserRung = (steps: unknown, test: (s: any) => boolean) => Array.isArray(steps) && steps.some((s: any) => !!s && s.rung === "browser" && test(s));

// Whether a sentence was written for a person lives with the check's words (checkParts.ts); it is used here too.
export { WRITTEN_FOR_A_PERSON };
/** Claude's own stops, which the engine names (runner/src/reach.ts): Claude out of reach (never the project's or the key's
 *  fault), and every other kind of failed request, in plain words and never in Claude Code's own (which names its /login).
 *  "(ask again)" marks a flow with no Try again, so the words point at no button. Null for any other reason. */
export function claudeStopWords(reason: string): string | null {
  const m = /^(?:engine error:\s*)?(no_connection|claude_busy|claude_stopped:([a-z_]+))( \(ask again\))?(?::|$)/.exec(reason);
  if (!m) return null;
  const ask = !!m[3];
  if (m[1] === "no_connection") return ask ? S.noConnectionAsk : S.noConnection;
  if (m[1] === "claude_busy") return ask ? S.claudeBusyAsk : S.claudeBusy;
  return S.claudeStopped(m[2], ask ? S.againAsk : S.againTryAgain);
}
export function plainError(reason: string): string {
  if (/error_max_budget_usd/.test(reason)) return "Stopped: the spending limit for this task was reached. Nothing more was run.";
  const claude = claudeStopWords(reason);
  if (claude) return claude;
  if (/error_max_turns/.test(reason)) return S.turnsStopped(S.set["work.maxTurns"].label);
  if (/^daily_limit/.test(reason)) return /this project/i.test(reason) ? "This project has reached its daily spending limit. New work starts again tomorrow, or you can raise the limit." : "You have reached your daily spending limit. New work starts again tomorrow, or you can raise the limit.";
  if (/unknown approval/i.test(reason)) return "That question is not waiting for an answer any more.";
  const nc = /Not connected:.*$/.exec(reason);
  if (nc) return nc[0];
  const r = reason.replace(/^engine error:\s*/i, "");
  if (WRITTEN_FOR_A_PERSON(r)) return r.trim();
  // Anything else is Squibby's own machinery: one plain sentence, never the raw words (the engine keeps those for the log).
  return S.somethingWrong;
}

type Ev = Record<string, any> & { type?: string };
// A step's plain summary and its place, when the engine sent them whole.
const runOk = (r: any): r is { command: string; exit: number } => !!r && typeof r.command === "string" && r.command.length > 0 && Number.isInteger(r.exit);
const stepExtras = (s: any): { summary?: string; problem?: Problem; ms?: number; runs?: { command: string; exit: number }[]; needs?: "signIn" } => ({
  ...(s?.needs === "signIn" ? { needs: "signIn" as const } : {}),
  ...(typeof s?.summary === "string" && s.summary ? { summary: s.summary } : {}),
  ...(s?.problem && typeof s.problem === "object" && typeof s.problem.kind === "string" ? { problem: s.problem as Problem } : {}),
  ...(typeof s?.ms === "number" && Number.isFinite(s.ms) && s.ms > 0 ? { ms: s.ms } : {}),
  // Secrets are hidden again here, as on every line the card shows (the engine already does).
  ...(Array.isArray(s?.runs) && s.runs.some(runOk) ? { runs: s.runs.filter(runOk).slice(0, 6).map((r: { command: string; exit: number }) => ({ command: redact(String(r.command)).slice(0, 120), exit: r.exit })) } : {}),
});

// A place from the engine is used only when it is whole: a file, a line number from 1, and the line's text.
const placeOk = (c: any): c is ChangeAt => !!c && typeof c === "object" && typeof c.file === "string" && c.file.length > 0 && Number.isInteger(c.line) && c.line >= 1 && typeof c.lineText === "string";
const repeatOk = (r: any): r is Repeat => !!r && typeof r === "object" && placeOk(r.first) && placeOk(r.second) && typeof r.was === "string" && typeof r.now === "string";
const explainOf = (e: Ev): Explain => ({ checkpoint: e.checkpoint, bullets: e.bullets ?? [], question: e.question });
// The agent's last words from a receipt: text only, secrets hidden again, cut to what the engine sends at most.
const SAID_MAX = 600;
const saidOf = (e: Ev): { said?: string; asks?: boolean } => {
  if (typeof e.said !== "string") return {};
  const flat = redact(e.said).replace(/\s+/g, " ").trim();
  // Words that ask the person keep their end (the question is the last line); any other keeps its start.
  const chars = Array.from(flat);
  const said = chars.length <= SAID_MAX ? flat : e.asks === true ? `…${chars.slice(chars.length - (SAID_MAX - 1)).join("").trimStart()}` : `${chars.slice(0, SAID_MAX - 1).join("").trimEnd()}…`;
  // inPlan: the question stopped a plan, so the answer carries the plan on (the engine keeps the steps that were waiting).
  return said ? { said, ...(e.asks === true ? { asks: true, ...(e.inPlan === true ? { inPlan: true } : {}) } : {}) } : {};
};

// ---- the practice projects (practice.ts has the catalog) ----

const whereOf = (p: any) => ({ file: typeof p?.file === "string" ? p.file : undefined, line: Number.isInteger(p?.line) ? p.line : undefined, message: typeof p?.message === "string" ? p.message : undefined });
// Find's answer (Point at the problem) for a practice found by the project's own checks, and the checks again after its
// lesson. Only the failure the catalog expects counts as found; anything else is said as blocked, with why.
function practiceFound(m: Model, e: Ev): Model {
  const pr = m.practice, entry = pr && practiceOf(pr.kind);
  if (!pr || !entry || e.project !== pr.project) return m;
  if (pr.stage === "start" && entry.find === "checks") {
    if (e.verdict === "failed") {
      const p = e.problem as Problem | undefined;
      if (isExpected(entry, p)) return { ...m, practice: { ...pr, stage: "found", label: String(e.label ?? ""), where: whereOf(p), problem: p, block: undefined, why: undefined } };
      // A check that could not run at all (no Node on this Mac, say) is told as that; a failure in another place, with the place.
      if (p?.kind === "line") return { ...m, practice: { ...pr, stage: "blocked", block: "elsewhere", where: whereOf(p), why: p.message } };
      return { ...m, practice: { ...pr, stage: "blocked", block: "couldNotRun", why: String((p as { message?: string } | undefined)?.message ?? e.detail ?? "") } };
    }
    // A copy opened again that already passes: it was fixed, and it says so.
    if ((e.verdict === "passed" || e.verdict === "passed_with_gaps") && pr.resumed) return { ...m, practice: { ...pr, stage: "done", already: true } };
    return m;
  }
  if (pr.stage === "proving" && entry.prove === "checks") {
    if (e.verdict === "cancelled" || e.verdict === "nothing_to_check") return { ...m, practice: { ...pr, stage: "failed", checksFailed: true } };
    const pass = e.verdict === "passed" || e.verdict === "passed_with_gaps";
    return { ...m, practice: { ...pr, stage: pass ? "done" : "failed", ...(e.verdict === "passed_with_gaps" ? { gaps: true } : {}), ...(!pass && e.problem ? { where: whereOf(e.problem) } : {}) } };
  }
  return m;
}
// The check before going live (ship.gates), for the open table practice: Find, and the check again after its fix.
function practiceGates(m: Model, e: Ev): Model {
  const pr = m.practice, entry = pr && practiceOf(pr.kind);
  if (!pr || !entry || entry.find !== "gate" || e.project !== pr.project) return m;
  const g = gateFinding(entry, e.gates);
  if (pr.stage === "start") {
    if (g.state === "found") return { ...m, practice: { ...pr, stage: "found", label: g.label ?? "", where: whereOf(g.problem), problem: g.problem, block: undefined, why: undefined } };
    if (g.state === "clear" && pr.resumed) return { ...m, practice: { ...pr, stage: "done", already: true } };
    // Open some other way (a rule that says "true", another table): the panel shows what the check says under it.
    return { ...m, practice: { ...pr, stage: "blocked", block: g.state === "clear" ? "nothing" : g.state === "other" ? "elsewhere" : "couldNotRun", why: g.detail, ...(g.state === "other" ? { where: { message: g.detail } } : {}) } };
  }
  if (pr.stage === "proving" && entry.prove === "gate") {
    if (g.state === "missing") return { ...m, practice: { ...pr, stage: "failed", checksFailed: true } };
    // Done only when no table is open (gateFinding); else failed, with the line when there is one and the check's words.
    return { ...m, practice: { ...pr, stage: g.state === "clear" ? "done" : "failed", ...(g.state !== "clear" ? { where: g.problem ? whereOf(g.problem) : { message: g.detail }, why: g.detail } : {}) } };
  }
  return m;
}
// The practice's own fix ended: only a receipt that carries this practice's id, for the task the practice started. Done
// needs the checks to pass and the practice's own check untouched; the open table's fix then has its check run again.
function practiceReceipt(pr: Practice | null, e: Ev): Practice | null {
  const entry = pr && practiceOf(pr.kind);
  if (!pr || !entry || pr.stage !== "fixing" || e.practice !== pr.kind || (pr.checkpoint && e.checkpoint !== pr.checkpoint)) return pr;
  const changed = Array.isArray(e.changed) ? e.changed.filter((c: any) => c && typeof c.file === "string").map((c: any) => ({ file: String(c.file), kind: String(c.kind) })) : [];
  const touched = changed.filter((c) => entry.protect.includes(c.file)).map((c) => c.file);
  const result: PracticeResult = { checkpoint: String(e.checkpoint), proof: typeof e.proof === "string" ? e.proof : undefined, changed, usdEstimate: Number(e.usdEstimate) || 0, ...(placeOk(e.changedAt) ? { changedAt: e.changedAt } : {}), ...(touched.length ? { protectedChanged: touched } : {}) };
  // A fix that ended on a question waits for the answer: not passed, and the panel says what it asked and where to answer.
  const q = saidOf(e);
  if (q.asks && q.said) result.asks = q.said;
  const passed = e.proof === "passed" || e.proof === "partial";
  const next: Practice = { ...pr, checkpoint: String(e.checkpoint), result };
  if (!passed || touched.length) return { ...next, stage: "failed" };
  if (entry.prove === "gate") return { ...next, stage: "proving" };
  return { ...next, stage: "done", ...(e.proof === "partial" ? { gaps: true } : {}) };
}

// The everyday look (everyday.ts) is taken first, from the Show me look waiting then, and settled after everything else:
// a look whose Show me went away or failed waits no more.
export function reduce(m: Model, e: Ev): Model {
  // M58 (feature 8, UI 4): Fix it answers at once. The found problem stays, marked as starting, until the engine's first
  // event for the fix (its safety copy, a tool, it working, or Rescue's plan); a refusal leaves it as it was.
  if (e.type === "ui.pointFixing") return m.point?.stage === "found" ? { ...m, point: { ...m.point, fixing: true } } : m;
  const out = reduceSent(m, e);
  if (!m.point?.fixing || out.point !== m.point) return out;
  if (FIX_BEGAN(e)) return { ...out, point: null };
  if (e.type === "ui.pointFixRefused" || e.type === "protocol.error" || e.type === "ui.taskSendFailed") { const { fixing: _f, ...pt } = m.point; return { ...out, point: pt }; }
  return out;
}
const FIX_BEGAN = (e: Ev): boolean => e.type === "checkpoint.created" || e.type === "agent.tool" || e.type === "plan.ready" || e.type === "rescue.report" || e.type === "receipt"
  || (e.type === "agent.state" && ["thinking", "working", "checking"].includes(String(e.state)));
function reduceSent(m: Model, e: Ev): Model {
  // Return pressed (item 27): shown at once, before the engine answers.
  if (e.type === "ui.taskSent") return { ...m, sending: { words: String(e.words ?? "").slice(0, 500) } };
  if (m.sending) {
    const out = reduceOne(m, e);
    // The engine answered: the task began (its undo point, or its first state), it was refused or failed, the folder
    // changed, or everything stopped. Then the real state shows.
    const ended = e.type === "ui.taskSendFailed" || e.type === "checkpoint.created" || e.type === "ui.projectChanged" || e.type === "app.stop_everything"
      || e.type === "protocol.error" || out.task !== m.task || out.receipt !== m.receipt || (!!out.error && out.error !== m.error) || (!!out.notice && out.notice !== m.notice)
      || (e.type === "agent.state" && (e.state === "idle" || e.state === "error" || e.state === "needsYou"));
    return ended ? { ...out, sending: null } : out;
  }
  return reduceOne(m, e);
}

function reduceOne(m: Model, e: Ev): Model {
  // The limit card goes once new work starts, another folder is chosen, or everything stops.
  if (m.proLimit && ((e.type === "agent.state" && (e.state === "thinking" || e.state === "working")) || e.type === "ui.projectChanged" || e.type === "app.stop_everything")) m = { ...m, proLimit: null };
  // M52: the review card follows its own events and presses (review.ts). A refused Fix it is said on its card, not as
  // Home's error.
  // M58 (feature 9): the key practice follows its own steps, the review's answer and its presses (practice.ts).
  if (m.practice && (e.type === "practice.key" || e.type === "review.result" || e.type === "ui.practiceKeyWrite" || e.type === "ui.practiceKeyFix" || e.type === "ui.practiceKeyRefused")) {
    const pr = keyPracticeReduce(m.practice, e as never);
    if (pr !== m.practice) m = { ...m, practice: pr };
    if (e.type !== "review.result") return m;
  }
  const hadReview = m.review ?? null;
  const rv = reviewReduce(hadReview, e);
  if (rv !== hadReview) m = { ...m, review: rv };
  if (e.type === "protocol.error" && e.failed === "review.fix" && hadReview) return m;
  const ed = everydayReduce(m.everyday, e, m.showme?.req);
  const n = reduceRest(ed === m.everyday ? m : { ...m, everyday: ed }, e);
  const settled = everydaySettle(n.everyday, m.showme, n.showme);
  return settled === n.everyday ? n : { ...n, everyday: settled };
}

function reduceRest(m: Model, e: Ev): Model {
  switch (e.type) {
    // Pro: never sent while payments are off, so with payments off neither ever changes Home.
    case "plan.usage": { const u = usageFrom(e); return u ? { ...m, proUsage: u } : m; }
    case "plan.limit": case "ui.proLimit": {
      const reason = String(e.reason) as LimitReason;
      if (!["fixes", "ship", "recaps", "looks"].includes(reason)) return m;
      const v: LimitView = { reason, ...(typeof e.resetsOn === "string" ? { resetsOn: e.resetsOn } : {}), ...(typeof e.command === "string" ? { command: e.command } : {}) };
      if (!limitShown(v)) return m;
      // Nothing started: whatever was waiting for that command stops waiting (a follow up, the check before going live).
      const ship = typeof v.command === "string" && v.command.startsWith("ship.");
      return { ...m, proLimit: v, followUp: "idle", ...(ship ? { shipFlow: null } : {}), practice: m.practice?.stage === "fixing" ? { ...m.practice, stage: "found" as const } : m.practice, error: null, notice: null };
    }
    case "ui.proLimitClosed": return m.proLimit ? { ...m, proLimit: null } : m;
    case "ui.undoAsked": return { ...m, undo: { stage: "confirm", checkpoint: String(e.checkpoint) } };
    // M45: Bring the fix back restores the safety copy the Undo made first (shadow snapshots only, never git: rule 10). It
    // reuses the Undo's steps (sent, then the engine's answer), marked back.
    case "ui.bringBackAsked": return m.receipt?.undone && !m.receipt.back && m.receipt.undoSafety ? { ...m, undo: { stage: "confirm", checkpoint: m.receipt.undoSafety, back: true } } : m;
    // ---- which task broke it ----
    case "ui.bisectAsked": return { ...m, bisect: { stage: "running" } };
    // The engine leaves the search's agent waiting on the person while the answer is shown: closing it is the answer, as for Point at the problem.
    case "ui.bisectClosed": return rest({ ...m, bisect: null }, m.bisect?.agent);
    case "bisect.progress": return m.bisect?.stage === "running" ? { ...m, bisect: { ...m.bisect, run: Number(e.run) || undefined, maxRuns: Number(e.maxRuns) || undefined, what: String(e.what ?? ""), label: typeof e.label === "string" ? e.label : undefined } } : m;
    case "bisect.result": {
      // Only the answer to a search this page asked for and is still waiting on; a stopped one simply goes.
      if (m.bisect?.stage !== "running") return m;
      if (e.outcome === "cancelled") return { ...m, bisect: null };
      const t = (x: any): BisectTask | undefined => (x && typeof x.label === "string" ? { label: x.label, at: String(x.at ?? "") } : undefined);
      const task = e.task && typeof e.task.label === "string" && typeof e.task.checkpoint === "string" ? { label: e.task.label, at: String(e.task.at ?? ""), checkpoint: e.task.checkpoint } : undefined;
      return { ...m, bisect: { stage: "done", ...(typeof e.agent === "string" ? { agent: e.agent } : {}), outcome: String(e.outcome), run: Number(e.runs) || undefined, maxRuns: Number(e.maxRuns) || undefined,
        ...(e.step && typeof e.step.label === "string" ? { step: { rung: String(e.step.rung ?? ""), label: e.step.label } } : {}),
        ...(task ? { task } : {}), ...(t(e.earlier) ? { earlier: t(e.earlier) } : {}), ...(t(e.later) ? { later: t(e.later) } : {}),
        ...(Array.isArray(e.changed) ? { changed: e.changed.filter((c: any) => c && typeof c.file === "string").map((c: any) => ({ file: c.file, kind: String(c.kind) })) } : {}),
        ...(typeof e.changedCount === "number" ? { changedCount: e.changedCount } : {}),
        ...(e.undo === "safe" || e.undo === "show_only" ? { undo: e.undo } : {}),
        ...(typeof e.why === "string" ? { why: e.why } : {}), ...(typeof e.diff === "string" ? { diff: e.diff } : {}), ...(typeof e.detail === "string" ? { detail: e.detail } : {}) } };
    }
    case "ui.bisectUndoAsked": return m.bisect?.stage === "done" && m.bisect.undo === "safe" && m.bisect.task ? { ...m, bisect: { ...m.bisect, undoStage: "confirm" } } : m;
    case "ui.bisectUndoCancelled": return m.bisect ? { ...m, bisect: { ...m.bisect, undoStage: undefined } } : m;
    case "ui.bisectUndoSent": return m.bisect?.undoStage === "confirm" ? { ...m, bisect: { ...m.bisect, undoStage: "working" } } : m;
    case "bisect.undone": {
      if (m.bisect?.undoStage !== "working" || m.bisect.task?.checkpoint !== e.checkpoint) return m;
      if (e.ok !== true) return { ...m, bisect: { ...m.bisect, undoStage: "failed", note: String(e.reason ?? "") } };
      // As with Undo: files went back, so the last task's receipt has nothing left to follow up on, and no turn is left (the
      // engine drops both too). Only the found task was taken back: when that is the last task, its result is Undone and the
      // safety copy the engine made first is what Bring the fix back restores (M45). When it is an earlier task, the last
      // task's own files are still there, so its result, its Undo and its words stay; only its follow up closes.
      const found = { ...m, teach: null, bisect: { ...m.bisect, undoStage: "done" as const, reverted: Array.isArray(e.reverted) ? e.reverted.length : 0 } };
      if (m.receipt && m.receipt.checkpoint === e.checkpoint) return answerGone(filesWentBack(found, e.project, e.safety));
      const here = !!m.receipt && (typeof e.project !== "string" || !m.task?.project || e.project === m.task.project);
      return here ? answerGone({ ...found, receipt: { ...m.receipt!, earlierUndone: true } }) : found;
    }
    // ---- the error explainer ----
    case "app.explain_error": {
      if (e.stage === "dismissed") return { ...m, eh: null };
      return { ...m, eh: { stage: String(e.stage ?? ""), app: typeof e.app === "string" ? e.app : m.eh?.app, ...(typeof e.req === "string" ? { req: e.req } : {}), ...(typeof e.why === "string" ? { why: e.why } : {}) } };
    }
    case "error.explained": {
      if (!m.eh?.req || m.eh.req !== e.req) return m;   // only the answer to this press
      const w = e.where;
      const where = w && w.kind === "line" && typeof w.file === "string" && Number.isInteger(w.line) && w.line > 0 ? w as Problem : undefined;
      const sentences = Array.isArray(e.sentences) ? e.sentences.filter((x: unknown): x is string => typeof x === "string" && x.length > 0) : [];
      return { ...m, eh: { ...m.eh, stage: e.ok === true && sentences.length ? "ready" : "unexplained", sentences, ...(where ? { where } : {}), ...(typeof e.project === "string" ? { project: e.project } : {}),
        excerpt: String(e.excerpt ?? ""), evidence: String(e.evidence ?? ""), ...(typeof e.reason === "string" ? { reason: claudeStopWords(e.reason) ?? e.reason } : {}) } };
    }
    case "ui.ehClosed": return { ...m, eh: null };
    // ---- Second Look ----
    case "app.second_look": {
      if (e.stage === "dismissed") return { ...m, sl: null };
      return { ...m, sl: { stage: String(e.stage ?? ""), app: typeof e.app === "string" ? e.app : m.sl?.app, ...(typeof e.req === "string" ? { req: e.req } : {}), ...(typeof e.why === "string" ? { why: e.why } : {}) } };
    }
    case "secondlook.result": {
      if (!m.sl?.req || m.sl.req !== e.req) return m;   // only the answer to this press
      const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
      const web = (u: unknown): boolean => typeof u === "string" && /^https?:\/\/\S+$/i.test(u);
      const items: LookItem[] = (Array.isArray(e.items) ? e.items : []).filter((i: any) => i && typeof i.claim === "string" && typeof i.issue === "string")
        .map((i: any) => ({ kind: String(i.kind ?? "other"), claim: i.claim, issue: i.issue, verify: typeof i.verify === "string" ? i.verify : "", by: String(i.by ?? "model"), ...(i.source && web(i.source.url) ? { source: { url: i.source.url, title: typeof i.source.title === "string" ? i.source.title : i.source.url } } : {}) }));
      const ok = e.ok === true && ["solid", "check", "cant_tell"].includes(String(e.verdict));
      return { ...m, sl: { ...m.sl, stage: ok ? "ready" : "failed", ...(ok ? { verdict: String(e.verdict) } : {}), items, checked: texts(e.checked), cantTell: texts(e.cantTell),
        search: typeof e.search === "string" ? e.search : undefined, searches: typeof e.searches === "number" ? e.searches : 0, usd: typeof e.usdEstimate === "number" ? e.usdEstimate : 0,
        ...(typeof e.reason === "string" ? { reason: claudeStopWords(e.reason) ?? e.reason } : {}) } };
    }
    case "ui.slClosed": return { ...m, sl: null };
    case "ui.undoCancelled": case "ui.undoClosed": return { ...m, undo: null };
    case "ui.undoSent": return m.undo ? { ...m, undo: { ...m.undo, stage: "working" } } : m;
    case "checkpoint.restored": {
      // Undo of the practice's own fix: the problem is back, so it is found again, with Try again.
      const pr = m.practice;
      if (pr && pr.checkpoint && pr.checkpoint === e.checkpoint && (typeof e.project !== "string" || e.project === pr.project) && ["done", "failed", "proving"].includes(pr.stage)) m = { ...m, practice: { ...pr, stage: "found", undone: true, result: undefined, gaps: undefined, checksFailed: undefined } };
      // Put my fix back: only the restore the turn asked for ends it.
      const turnBack = m.teach?.stage === "restoring" && m.teach.restore === e.checkpoint;
      if (turnBack) m = { ...m, teach: { ...m.teach!, stage: "restored" } };
      const here = !!m.receipt && (typeof e.project !== "string" || !m.task?.project || e.project === m.task.project);
      // M45, Bring the fix back: the restore of the Undo's own safety copy puts the task's files back. It is not a second
      // Undo. undone stays true: the engine still refuses to follow the old conversation up.
      // Fix files the person changed after the Undo are left as theirs (e.yours): the result says so, and the card offers
      // "Put those back too" for them, as after an Undo.
      if (here && m.receipt!.undone && !m.receipt!.back && m.receipt!.undoSafety === e.checkpoint) {
        const yours = Array.isArray(e.yours) ? e.yours.filter((x: unknown): x is string => typeof x === "string") : [];
        return { ...m, receipt: { ...m.receipt!, back: true, undoSafety: undefined, ...(yours.length ? { backPartly: true } : {}) },
          undo: yours.length ? { stage: "done", checkpoint: e.checkpoint, back: true, yours } : null };
      }
      // Put my fix back puts the fix itself back, so the files are as checked; the conversation no longer matches them.
      if (turnBack) { if (here && !m.receipt!.undone) m = answerGone({ ...m, receipt: { ...m.receipt!, undone: true, fixKept: true } }); }
      // Any other undo in this project (from the card or the timeline) puts the files back, so the receipt's work is gone from them.
      else m = filesWentBack(m, e.project, e.safety);
      // Undo of the whole task puts every file back as it was before it, so no turn is left (the engine drops it too).
      return m.undo?.stage === "working" && m.undo.checkpoint === e.checkpoint ? { ...m, teach: null, undo: { stage: "done", checkpoint: m.undo.checkpoint, recovered: Array.isArray(e.recovered) ? e.recovered.length : 0, large: Array.isArray(e.largeLeftAlone) ? e.largeLeftAlone.length : 0, ...(Array.isArray(e.yours) && e.yours.length ? { yours: e.yours.filter((x: unknown): x is string => typeof x === "string") } : {}) } } : m;
    }
    // Put those back too: asked, then confirmed with a second press, then answered.
    case "ui.putBackAsked": return m.undo?.stage === "done" && m.undo.yours?.length ? { ...m, undo: { ...m.undo, putBack: "confirm", putBackNote: undefined } } : m;
    case "ui.putBackCancelled": return m.undo ? { ...m, undo: { ...m.undo, putBack: undefined } } : m;
    case "ui.putBackSent": return m.undo?.putBack === "confirm" ? { ...m, undo: { ...m.undo, putBack: "working" } } : m;
    case "checkpoint.putBackDone": {
      if (m.undo?.putBack !== "working" || m.undo.checkpoint !== e.checkpoint) return m;
      if (e.ok !== true) return { ...m, undo: { ...m.undo, putBack: "failed", putBackNote: String(e.reason ?? "") } };
      const back = new Set(Array.isArray(e.putBack) ? e.putBack : []);
      const left = (m.undo.yours ?? []).filter((f) => !back.has(f));
      // After Bring back: once every file the person had changed is the fix's again, the whole fix is back.
      const receipt = m.undo.back && m.receipt?.backPartly && left.length === 0 ? { ...m.receipt, backPartly: undefined } : m.receipt;
      return { ...m, receipt, undo: { ...m.undo, putBack: back.size ? "done" : "failed", ...(back.size ? {} : { putBackNote: String(e.reason ?? "Nothing was put back.") }), yours: left } };
    }
    case "ui.teachAsked": return { ...m, teach: { stage: "asking", checkpoint: String(e.checkpoint) } };
    case "teach.ready": {
      if (m.teach?.stage !== "asking" || m.teach.checkpoint !== e.checkpoint) return m;
      if (e.made !== true || !placeOk(e.target)) return { ...m, teach: { stage: "refused", checkpoint: m.teach.checkpoint, reason: String(e.reason ?? "") } };
      const ex = e.example, ch = e.change;
      // The engine used up its offer for this fix: the receipt never offers it again.
      if (m.receipt?.checkpoint === m.teach.checkpoint) m = { ...m, receipt: { ...m.receipt, turnTaken: true } };
      return { ...m, teach: { stage: "ready", checkpoint: m.teach!.checkpoint, target: e.target,
        ...(ex && typeof ex.file === "string" && Number.isInteger(ex.line) && typeof ex.was === "string" && typeof ex.now === "string" ? { example: { file: ex.file, line: ex.line, was: ex.was, now: ex.now } } : {}),
        ...(ch && typeof ch.was === "string" && typeof ch.now === "string" ? { change: { was: ch.was, now: ch.now } } : {}),
        ...(typeof e.restore === "string" && e.restore ? { restore: e.restore } : {}) } };
    }
    case "ui.teachChecking": return m.teach && teachActions(m.teach).includes("check") ? { ...m, teach: { ...m.teach, stage: "checking", note: undefined, steps: [], ...(typeof e.agent === "string" ? { agent: e.agent } : {}) } } : m;
    // The rungs of the person's own check, kept on their card only (never on the finished task's proof).
    case "teach.step": {
      if (m.teach?.stage !== "checking" || m.teach.checkpoint !== e.checkpoint || typeof e.rung !== "string") return m;
      const line: ProofLine = { rung: e.rung, label: String(e.label ?? e.rung), status: e.status, detail: String(e.detail ?? ""), ...stepExtras(e) };
      const steps = m.teach.steps ?? [], at = steps.findIndex((s) => s.rung === line.rung);
      return { ...m, teach: { ...m.teach, steps: at >= 0 ? steps.map((s, i) => (i === at ? line : s)) : [...steps, line].slice(-12) } };
    }
    // Leaving it, or closing a finished turn, ends the wait on the person after a check that failed.
    case "ui.teachLeft": return m.teach && teachActions(m.teach).includes("leave") ? rest({ ...m, teach: { ...m.teach, stage: "left", note: undefined } }, m.teach.agent) : m;
    case "teach.result": {
      if (m.teach?.stage !== "checking" || m.teach.checkpoint !== e.checkpoint) return m;
      if (e.verdict === "cancelled") return { ...m, teach: { ...m.teach, stage: "ready", note: String(e.reason ?? "") || undefined } };
      return { ...m, teach: { ...m.teach, stage: "checked", result: { verdict: String(e.verdict), same: e.same === true, ...(typeof e.label === "string" ? { label: e.label } : {}), ...(typeof e.detail === "string" ? { detail: e.detail } : {}), ...(e.problem ? { problem: e.problem } : {}) } } };
    }
    case "ui.teachRestore": return m.teach && teachActions(m.teach).includes("putBack") ? { ...m, teach: { ...m.teach, stage: "restoring" } } : m;
    // Only a finished turn closes. While the old code is back in the project, the person puts the fix back or leaves it.
    case "ui.teachClosed": return m.teach && teachActions(m.teach).includes("close") ? rest({ ...m, teach: null }, m.teach.agent) : m;
    case "ui.approvalsExpire": {
      const left = m.approvals.filter((a) => !a.expiresAt || Date.parse(a.expiresAt) > Number(e.now));
      return left.length === m.approvals.length ? m : { ...m, approvals: left, notice: "A question ran out of time and was not allowed. Ask again if you still want it." };
    }
    case "ui.settle": return withAgents(m, Object.fromEntries(Object.entries(m.agents).map(([a, s]) => [a, s === "done" ? "idle" : s])) as Record<string, CharacterState>);
    case "ui.approvalAnswered": return { ...m, approvals: m.approvals.filter((a) => a.id !== e.approval) };
    // The shell's reason is already one plain sentence (runner.rs HELPER_DOWN and the others); it is shown as it is, and
    // cleared when the helper says hello again.
    case "app.runner_down": { const down = typeof e.reason === "string" && e.reason ? plainError(e.reason) : S.helperStopped; return { ...withAgents({ ...m, runnerUp: false }, m.agents), error: down, downError: down }; }
    case "runner.hello": return { ...withAgents({ ...m, runnerUp: true }, m.agents), error: m.error && m.error === m.downError ? null : m.error, downError: undefined };
    // A new engine knows nothing of the old one's questions, so nothing waiting on it can be answered any more.
    // The new engine keeps no conversation either: the last task can no longer be followed up or tried again (gone). A check
    // that was running is not left saying Running. A turn whose place still has the old code stays, with only Put my fix
    // back (its undo point is on disk) and Leave it as it is (orphan). The notice says what is true: a task that was running
    // may have changed files before it stopped, and the engine puts nothing back by itself.
    case "app.runner_restarted": {
      const ran = Object.values(m.agents).some((s) => RUNNING.includes(s)) || m.approvals.length > 0 || !!m.stuck || !!m.paused || (!!m.drive && !m.drive.finished) || m.practice?.stage === "fixing";
      const t = m.teach;
      const turn: TeachState | null = t && teachOpen(t) && t.target ? { ...t, stage: t.stage === "left" ? "left" : "ready", orphan: true, note: undefined, steps: undefined, result: undefined } : null;
      const proof = m.task?.proof;
      const task = m.task && proof ? { ...m.task, proof: { ...proof, steps: proof.steps.map((x) => (x.status === "running" ? { ...x, status: "skipped" as const, detail: S.stepStoppedRestart } : x)) } } : m.task;
      const notice = turn?.target ? S.restartedTurn(turn.target.file, turn.target.line) : ran ? S.restartedStopped : S.restartedNothing;
      return { ...withAgents({ ...m, shipFlow: shipStopped(m.shipFlow), away: {}, driveAway: null, workIn: {}, task, receipt: m.receipt ? { ...m.receipt, gone: true } : null, bisect: null, eh: null, sl: null, browser: browserBusy(m.browser) ? { ...m.browser, stage: "idle", percent: undefined } : m.browser, undo: null, showme: null, install: null, ph: null, walk: null, walkWant: null, diagram: null, practice: m.practice?.stage === "fixing" ? { ...m.practice, stage: "failed" as const } : m.practice && ["lesson", "proving"].includes(m.practice.stage) ? { ...m.practice, stage: "found" as const, checksFailed: undefined } : m.practice, point: null, where: null, teach: turn, runnerUp: true, approvals: [], plan: null, drive: null, stuck: null, paused: null, followUp: "idle" }, {}), notice, error: null };
    }
    case "app.notice": return { ...m, notice: String(e.message ?? "") || m.notice };
    case "app.stop_everything": return { ...withAgents({ ...m, shipFlow: shipStopped(m.shipFlow), bisect: null, eh: null, sl: null, browser: browserBusy(m.browser) ? { ...m.browser, stage: "cancelled", percent: undefined } : m.browser, undo: null, walk: null, walkWant: null, practice: null, diagram: null, showme: null, point: null, where: null, approvals: [], plan: null, drive: null, stuck: null, paused: null, toast: null, followUp: "idle", task: m.task }, {}), notice: "Stopped everything.", error: null };
    case "auth.status": {
      const connected = e.method === "api_key" || e.method === "plan" ? e.method : e.method === "none" ? "none" : "unknown";
      // Only this line is the connection's to set or clear: a notice about something else (the engine restarting, say) stays,
      // for the new engine says "none" for a moment before the shell hands over the key.
      const notice = connected === "none" ? (m.notice && m.notice !== S.notConnectedNotice ? m.notice : S.notConnectedNotice) : (m.notice === S.notConnectedNotice ? null : m.notice);
      const t = e.tested;
      const keyTested = t === "works" || t === "refused" || t === "no_connection" || t === "unknown" ? { result: t, at: Date.now() } : m.keyTested;
      return { ...m, connected, notice, keyTested };
    }
    case "explain.ready": {
      // A Drive step's explanation joins the plan's list, whatever is on the card by the time it arrives.
      // Only for a step of the plan on screen: a late one from an older plan or the folder before is dropped.
      const st = e.step;
      if (st && Number.isInteger(st.index) && st.index >= 1 && typeof st.title === "string") {
        if (!m.planCheckpoints.includes(e.checkpoint)) return m;
        const item: StepExplain = { index: st.index, title: st.title, explain: explainOf(e) };
        return { ...m, stepExplains: [...m.stepExplains.filter((x) => x.index !== st.index), item].sort((a, b) => a.index - b.index).slice(-15) };
      }
      return m.away[e.agent] === undefined && (m.receipt?.checkpoint ?? m.currentCheckpoint) === e.checkpoint ? { ...m, explain: explainOf(e) } : m;
    }
    case "explain.state": return { ...m, explainOn: !!e.enabled };
    case "spending.state": {
      const n = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
      if (typeof e.project !== "string" || !n(e.limitUsd) || !n(e.spentUsd) || !n(e.minUsd) || !n(e.maxUsd) || e.limitUsd <= 0) return m;
      return { ...m, spending: { project: e.project, limitUsd: e.limitUsd, spentUsd: e.spentUsd, minUsd: e.minUsd, maxUsd: e.maxUsd, ...(typeof e.problem === "string" && e.problem ? { problem: e.problem } : {}) } };
    }
    case "recap.ready": return { ...m, recap: Array.isArray(e.lines) && e.lines.length ? { lines: e.lines.map(String) } : null };
    // Where was I: the lines, and the one next step as a button (it starts nothing until it is pressed).
    case "where.ready": {
      if (!Array.isArray(e.lines) || !e.lines.length) return { ...m, recap: null };
      const n = e.next as { action?: string; watch?: unknown } | undefined;
      const next: WhereNext | undefined = n?.action === "fixWatch" && typeof n.watch === "string" ? { action: "fixWatch", watch: n.watch } : n?.action === "findProblem" || n?.action === "review" || n?.action === "open" ? { action: n.action } : undefined;
      return { ...m, recap: { lines: e.lines.map(String), ...(next ? { next } : {}) } };
    }
    // Watch routines: one watch changed, or a project's whole list. A watch that is not failing has no alert left.
    case "watch.state": {
      if (!validView(e)) return m;
      const v = e as unknown as WatchView;
      const alerts = { ...m.watchAlerts };
      if (v.state !== "failing") delete alerts[v.watch];
      return { ...m, watches: { ...m.watches, [v.watch]: { project: v.project, watch: v.watch, kind: v.kind, ...(v.target ? { target: v.target } : {}), schedule: v.schedule, state: v.state, since: v.since, reason: v.reason, ...(v.lastCheckedAt ? { lastCheckedAt: v.lastCheckedAt } : {}), ...(v.nextAt ? { nextAt: v.nextAt } : {}), checking: v.checking === true, history: v.history } }, watchAlerts: alerts };
    }
    case "watch.list": {
      if (typeof e.project !== "string" || !Array.isArray(e.watches)) return m;
      const keep = Object.fromEntries(Object.entries(m.watches).filter(([, w]) => w.project !== e.project));
      const fresh = (e.watches as unknown[]).filter(validView) as WatchView[];
      const watches = { ...keep, ...Object.fromEntries(fresh.map((w) => [w.watch, w])) };
      const alerts = Object.fromEntries(Object.entries(m.watchAlerts).filter(([id]) => watches[id]));
      return { ...m, watches, watchAlerts: alerts, watchAsked: m.watchAsked && watches[m.watchAsked] ? m.watchAsked : null };
    }
    case "watch.alert": {
      if (typeof e.watch !== "string" || typeof e.project !== "string") return m;
      const alerts = { ...m.watchAlerts };
      if (e.what === "failing") alerts[e.watch] = { project: e.project, kind: e.kind, ...(typeof e.target === "string" ? { target: e.target } : {}), reason: redact(String(e.reason ?? "")), since: String(e.since ?? "") };
      else delete alerts[e.watch];
      return { ...m, watchAlerts: alerts };
    }
    case "watch.evidence": {
      if (typeof e.watch !== "string" || typeof e.project !== "string" || typeof e.text !== "string" || m.watchAsked !== e.watch) return m;
      // Stopped or too slow: nothing was gathered. The page stops waiting, and no task starts.
      if (e.stopped === true) return { ...m, watchAsked: null };
      return { ...m, watchFix: { project: e.project, watch: e.watch, kind: e.kind, ...(typeof e.target === "string" ? { target: e.target } : {}), text: redact(e.text) } };
    }
    case "ui.watchAsked": return { ...m, watchAsked: typeof e.watch === "string" ? e.watch : null };
    case "ui.watchFixUsed": return { ...m, watchFix: null, watchAsked: null };
    // A different folder: nothing from the old project (its cards, memory or history) may linger on screen.
    // The folder Home starts with: known from now on, nothing cleared.
    case "ui.folderShown": return m.folder === null && typeof e.project === "string" && e.project ? { ...m, folder: e.project } : m;
    // An agent still at work keeps working in the folder it started in: that work is away from now on (see Model.away).
    case "ui.projectChanged": {
      const was = m.folder ?? m.task?.project ?? "", to = String(e.project ?? "");
      const away: Record<string, string> = { ...m.away };
      for (const [a, st] of Object.entries(m.agents)) if (RUNNING.includes(st) || st === "needsYou") away[a] ??= was;
      // A task that has begun but whose agent has not said so yet is at work too.
      if (m.task?.checkpoint && !m.receipt && !["idle", "done", "error"].includes(m.agents[m.task.agent] ?? "")) away[m.task.agent] ??= was;
      for (const [a, f] of Object.entries(away)) if (f && f === to) delete away[a];   // back in the folder it works in
      const plan = m.driveAway ?? (m.drive && !m.drive.finished ? was : null);
      // A task still at work in the folder now on screen comes back with its undo point, so its receipt shows when it comes.
      const back = Object.entries(m.workIn).find(([a, w]) => to && w.project === to && away[a] === undefined && !["idle", "done", "error"].includes(m.agents[a] ?? ""));
      const task: Task | null = back ? { agent: back[0], project: to, ...(back[1].checkpoint ? { checkpoint: back[1].checkpoint } : {}), label: back[1].label, lines: [], costUsd: 0 } : null;
      m = { ...m, folder: to || null, away, driveAway: plan && plan !== to ? plan : null, currentCheckpoint: task?.checkpoint };
      return { ...m, bisect: null, eh: null, spending: null, browser: browserFresh(m.browser), undo: null, lessons: null, walk: null, walkWant: null, practice: m.practice && e.project === m.practice.project ? m.practice : null, diagram: null, about: null, install: null, cloneNote: null, point: null, where: null, ship: null, shipFlow: null, research: null, rescue: null, plan: null, drive: null, stuck: null, paused: null, receipt: null, explain: null, stepExplains: [], planCheckpoints: [], teach: null, recap: null, memory: null, memoryNote: null, exported: null, toast: null, agentsAsk: null, history: [], reviewHistory: [], followUp: "idle", error: null, notice: null, task };
    }
    case "app.showme": {
      if (e.stage === "done") return { ...m, showme: null };
      const stage = String(e.stage);
      // A miss keeps the message of the step it belongs to visible above it; the ring keeps waiting.
      const turn = e.turn === true || (stage === "your_turn_miss" && !!m.showme?.turn) ? true : undefined;
      // Only the answers to a ring (a miss, a hit, done for you) belong to the ring before them; anything else starts fresh.
      const req = e.req ?? (stage.startsWith("your_turn") || stage === "done_for_you" ? m.showme?.req : undefined);
      // A step of a multi step answer says which one it is (step of of), so each line is said once and in its turn.
      const seq = Number.isInteger(e.step) && Number.isInteger(e.of) && (e.of as number) > 1 ? { step: e.step as number, of: e.of as number } : {};
      return { ...m, showme: { stage, message: String(e.message ?? ""), ...(req ? { req } : {}), ...(turn ? { turn } : {}), ...seq } };
    }
    // Claude out of reach, or a failed request, is said in plain words (claudeStopWords), never as "not found".
    // A Show me request's error belongs only to the Show me still waiting for it (its own request, or the picture of one of
    // its screens, "sm_7-s2"): one that was ended (Esc, closing Home, a newer question) is dropped, never shown as Prompt help's.
    case "assist.error": {
      const said = claudeStopWords(String(e.reason)), req = String(e.req ?? "");
      if (req.startsWith("sm_")) {
        const own = m.showme?.req;
        if (!own || (req !== own && !req.startsWith(`${own}-`)) || e.reason === "cancelled") return m;
        return { ...m, showme: { stage: "error", message: said ?? (String(e.reason) === "No clear target was found" ? "I could not find that on your screen. Try asking in different words." : String(e.reason)) } };
      }
      if (!phOwn(m, e.req)) return m;   // only the Prompt help request on the card now
      return e.reason === "cancelled" ? { ...m, ph: null } : { ...m, ph: { stage: "error", app: m.ph?.app, message: said ?? String(e.reason), diff: [] } };
    }
    case "app.voice": {
      // Which microphone listened, in one line above the tabs (voiceset.rs): the picked one is not connected so the
      // default listens, the one in use went away (even after another took over), or another one took over while talking.
      const s = (k: string) => (typeof e[k] === "string" && e[k] ? String(e[k]) : null);
      const missing = s("micMissing"), using = s("micUsing"), switched = s("micSwitched");
      const mic = missing && using ? S.micUsingDefault(missing, using) : e.micLost === true ? S.micLost : switched ? S.micSwitched(switched) : null;
      const n = mic ? { notice: mic } : {};
      // Only silence from the microphone says why (voice.rs Silence): the lid, the microphone itself, or the permission.
      const why = e.stage === "blocked" && typeof e.why === "string" && Object.hasOwn(S.voiceSilent, e.why) ? S.voiceSilent[e.why as keyof typeof S.voiceSilent] : null;
      return e.stage === "idle" ? { ...m, ...n, voice: null } : { ...m, ...n, voice: { stage: String(e.stage), message: why ?? String(e.message ?? ""), percent: typeof e.percent === "number" ? e.percent : undefined, text: typeof e.text === "string" ? e.text : undefined } };
    }
    case "ui.voiceClosed": return { ...m, voice: null };
    case "doctor.report": return { ...m, doctor: Array.isArray(e.items) ? e.items : [] };
    case "ui.recapClosed": return { ...m, recap: null };
    // A new task ends the person's turn. If the old code was still back at their place, that is said, never dropped silently.
    // A task started while a plan's step is running is that step's, so its explanation belongs to the plan.
    case "checkpoint.created": {
      const where = typeof e.project === "string" ? e.project : m.folder;
      if (where) m = { ...m, workIn: { ...m.workIn, [e.agent]: { project: where, ...(typeof e.checkpoint === "string" ? { checkpoint: e.checkpoint } : {}), label: String(e.label ?? "").replace(/^Before:\s*/, "") } } };
      // Work in another folder than the one on screen (a Drive plan still running in the folder before): none of it shows.
      if (m.folder && typeof e.project === "string" && e.project !== m.folder) return { ...m, away: { ...m.away, [e.agent]: e.project } };
      if (m.away[e.agent] !== undefined) { const away = { ...m.away }; delete away[e.agent]; m = { ...m, away }; }
      // A task outside a finished plan: the plan's panel and its explanations go.
      if (m.drive?.finished) m = { ...m, drive: null, stepExplains: [], planCheckpoints: [] };
      // The practice's own fix began: its undo point is the one Undo and the receipt name.
      // A follow up or Try again on it from the result on Now carries the same practice id, so it is the practice's fix too.
      if (m.practice && ["fixing", "failed", "found"].includes(m.practice.stage) && practiceOf(m.practice.kind)?.fix === "task" && typeof e.practice === "string" && e.practice === m.practice.kind && (typeof e.project !== "string" || e.project === m.practice.project)) m = { ...m, practice: { ...m.practice, stage: "fixing", checkpoint: String(e.checkpoint), agent: String(e.agent), result: undefined, undone: undefined, gaps: undefined, checksFailed: undefined } };
      const open = m.teach && teachOpen(m.teach) && m.teach.target ? S.teachStillOpen(m.teach.target.file, m.teach.target.line) : null;
      const planCheckpoints = m.drive && !m.drive.finished && typeof e.checkpoint === "string" ? [...m.planCheckpoints, e.checkpoint].slice(-40) : m.planCheckpoints;
      return { ...m, browser: browserFresh(m.browser), explain: null, teach: null, planCheckpoints, currentCheckpoint: e.checkpoint, ship: null, research: null, receipt: null, followUp: "idle", error: null, notice: open, task: { agent: e.agent, ...(typeof e.project === "string" ? { project: e.project } : {}), ...(typeof e.checkpoint === "string" ? { checkpoint: e.checkpoint } : {}), label: String(e.label ?? "").replace(/^Before:\s*/, ""), lines: [], costUsd: 0 } };
    }
    case "agent.state": {
      // A plan is waiting only while its agent waits on the person: once the engine says otherwise (it put the plan aside,
      // or started it), the plan is gone in every window.
      if (m.plan && m.plan.agent === e.agent && e.state !== "needsYou") m = { ...m, plan: null };
      // Work that was away has ended (needs you ends it once nothing holds it; Home asks the engine to let it rest).
      if (m.away[e.agent] !== undefined && (e.state === "idle" || e.state === "done" || e.state === "error")) { const away = { ...m.away }; delete away[e.agent]; m = { ...m, away }; }
      if (m.workIn[e.agent] && (e.state === "idle" || e.state === "done" || e.state === "error")) m = { ...m, workIn: without(m.workIn, e.agent) };
      // The practice's fix whose task stopped with no receipt (the engine caught a failure, or it was stopped) has ended.
      if (m.practice?.stage === "fixing" && m.practice.checkpoint && m.practice.agent === e.agent && (e.state === "idle" || e.state === "done" || e.state === "error")) m = { ...m, practice: { ...m.practice, stage: "failed" } };
      return withAgents(m, { ...m.agents, [e.agent]: e.state });
    }
    case "agent.tool": {
      if (m.away[e.agent] !== undefined) return m;
      const t = m.task ?? { agent: e.agent, ...(m.folder ? { project: m.folder } : {}), label: "", lines: [], costUsd: 0 };
      // Secrets are hidden again here: the engine already does, and a line on the card must never be the place one slips through.
      const summary = String(e.summary ?? ""), tool = String(e.tool ?? "");
      const line: ToolLine = { id: String(e.toolUseId ?? ""), text: redact(summary), tool, words: activityWords(tool, summary), outcome: e.outcome ?? "" };
      // The same step is updated as it moves from "waiting" to "ran" or "denied", never listed twice.
      const at = line.id ? t.lines.findIndex((l) => l.id === line.id) : -1;
      return { ...m, task: { ...t, lines: at >= 0 ? t.lines.map((l, i) => (i === at ? line : l)) : [...t.lines, line] } };
    }
    // M55, live progress: a file the agent's own tool really changed (the engine looked at it before and after the tool). Only
    // for this task's own agent, here; never one that is not a path from the project folder down.
    case "agent.file": {
      if (!m.task || m.task.agent !== e.agent || m.away[e.agent] !== undefined) return m;
      const kind = e.kind as LiveFile["kind"], f = e.file;
      if (!LIVE_KINDS.includes(kind) || !fromProject(f)) return m;
      return { ...m, task: { ...m.task, files: withLiveFile(m.task.files ?? [], f, kind) } };
    }
    case "approval.resolved": return { ...m, approvals: m.approvals.filter((a) => a.id !== e.approval) };
    case "cost.update": return m.task && m.away[e.agent] === undefined ? { ...m, task: { ...m.task, costUsd: Number(e.usdEstimate) } } : m;
    case "approval.request":
      if (m.approvals.some((a) => a.id === e.approval)) return m;
      return { ...m, approvals: [...m.approvals, { id: e.approval, agent: e.agent, title: e.title, risk: e.risk, checkpoint: e.checkpoint, expiresAt: e.expiresAt, action: e.action, undoable: e.undoable, ...(e.check === true ? { check: true } : {}) }] };
    case "proof.step": {
      // The first run's check (and Point at the problem) says which step it is on while it runs (the audit, item 52).
      if (m.point?.stage === "checking" && e.status === "running") m = { ...m, point: { ...m.point, label: String(e.label ?? e.rung) } };
      if (!m.task || m.away[e.agent] !== undefined) return m;
      const p = m.task.proof;
      // A step arriving after a finished try means the work was sent back and is being checked again.
      const base: ProofState = !p || p.verdict ? { steps: [], tries: (p?.tries ?? 0) } : p;
      const line: ProofLine = { rung: e.rung, label: String(e.label ?? e.rung), status: e.status, detail: String(e.detail ?? ""), ...stepExtras(e) };
      const at = base.steps.findIndex((s) => s.rung === line.rung);
      return { ...m, task: { ...m.task, proof: { ...base, steps: at >= 0 ? base.steps.map((s, i) => (i === at ? line : s)) : [...base.steps, line] } } };
    }
    case "project.report": return { ...m, about: { project: String(e.project), about: String(e.about), origin: String(e.origin), needsInstall: !!e.needsInstall, installCommand: e.installCommand ?? null, missing: Array.isArray(e.missing) ? e.missing.map(String) : [], missingCount: Number(e.missingCount ?? 0), example: e.example ?? null, notes: Array.isArray(e.notes) ? e.notes.map(String) : [] } };
    case "project.install": return { ...m, install: { project: String(e.project), stage: String(e.stage), detail: String(e.detail ?? "") } };
    case "project.cloned": return { ...m, cloneNote: e.ok ? null : String(e.detail ?? "") };
    case "ui.cloneNoteClosed": return { ...m, cloneNote: null };
    // A practice starts only with an id in the catalog (practice.ts); a missing or unknown one is refused, never guessed.
    case "ui.practiceStarted": {
      const entry = practiceOf(e.kind);
      if (!entry || typeof e.project !== "string" || !e.project) return m;
      return { ...m, practice: { kind: entry.id, stage: "start", project: e.project, ...(e.resumed === true ? { resumed: true } : {}), ...(typeof e.previous === "string" && e.previous ? { previous: e.previous } : {}) } };
    }
    // A lesson practice's fix is its lesson; a task practice's is a task, so it never waits on one (and the other way round).
    case "ui.practiceLesson": return m.practice && practiceOf(m.practice.kind)?.fix === "lesson" && ["found", "failed"].includes(m.practice.stage) ? { ...m, practice: { ...m.practice, stage: "lesson", walk: typeof e.walk === "string" ? e.walk : undefined, nameSet: undefined, checksFailed: undefined } } : m;
    // Run the checks again (the card starts them when it sees "proving"): after checks that did not run, or a setting
    // whose name is in the file while the checks still fail.
    case "ui.practiceProving": return m.practice?.stage === "failed" && (m.practice.checksFailed || (practiceOf(m.practice.kind)?.fix === "lesson" && m.practice.nameSet)) ? { ...m, practice: { ...m.practice, stage: "proving", checksFailed: undefined } } : m;
    // The person stopped the checks: they did not run, so they can be run again.
    case "ui.practiceStopProving": return m.practice?.stage === "proving" ? { ...m, practice: { ...m.practice, stage: "failed", checksFailed: true } } : m;
    case "ui.practiceFixing": return m.practice && practiceOf(m.practice.kind)?.fix === "task" && ["found", "failed"].includes(m.practice.stage) ? { ...m, practice: { ...m.practice, stage: "fixing", why: undefined, checkpoint: undefined, result: undefined, undone: undefined, gaps: undefined, checksFailed: undefined } } : m;
    // A follow up the shell refused never began.
    case "ui.followUpRefused": return { ...m, followUp: "idle" };
    // The fix was refused (its group was switched off between the press and the engine): back to where it was pressed from.
    case "ui.practiceFixRefused": return m.practice?.stage === "fixing" ? { ...m, practice: { ...m.practice, stage: "found" } } : m;
    case "ui.practiceClosed": return { ...m, practice: null };
    case "ui.diagramAsked": return { ...m, diagram: { stage: "asking", ask: e.ask, project: e.project } };
    case "ui.diagramFailed": return m.diagram ? { ...m, diagram: { stage: "none", reason: String(e.reason ?? "I could not show that on your screen.") } } : m;
    case "ui.diagramClosed": return { ...m, diagram: null };
    case "ui.walkRequested": return { ...m, walkWant: String(e.walk), walk: null };
    case "ui.walkClosed": return { ...m, walk: null, walkWant: null };
    case "walk.lessons": return { ...m, lessons: Array.isArray(e.lessons) ? e.lessons : null };
    // A lesson names the usual keys. Its words are kept as sent: the card and the spoken line fill in the keys in use each
    // time they show or say them (keys.ts keysIn), so a change in Settings while a step is up shows at once.
    case "walk.step": return e.walk !== m.walkWant ? m : { ...m, walk: { stage: e.already === true ? "already" : "step", id: e.walk, lesson: String(e.lesson), title: String(e.title), index: Number(e.index), total: Number(e.total), variant: e.variant === "instead" ? "instead" : "main", say: String(e.say), find: String(e.find), ask: e.ask === true, log: Array.isArray(e.log) ? e.log.filter((x: any) => x && typeof x.say === "string").slice(0, 15).map((x: any) => ({ say: String(x.say), how: x.how === "skipped" ? "skipped" as const : "done" as const })) : [], ...(webLink(e.link) ? { link: String(e.link) } : {}), ...(Number.isInteger(e.passed) && (e.passed as number) > 0 ? { passed: e.passed as number } : {}),
      // The setting practice's lesson stays words only (free, no Claude) even if the practice is skipped meanwhile.
      ...((m.walk?.id === e.walk && m.walk?.wordsOnly) || (m.practice?.stage === "lesson" && m.practice.walk === e.walk) ? { wordsOnly: true } : {}) } };
    case "walk.ask": return m.walk && m.walk.id === e.walk ? { ...m, walk: { ...m.walk, stage: "asking" } } : m;
    case "walk.help": return m.walk && m.walk.id === e.walk ? { ...m, walk: { ...m.walk, stage: "help", note: String(e.say ?? "") } } : m;
    // The project does not show this step's result yet: the step stays, with words on what is missing. Not a failure.
    case "walk.wait": return m.walk && m.walk.id === e.walk && m.walk.stage === "step" && m.walk.index === e.index ? { ...m, walk: { ...m.walk, note: String(e.say ?? "") } } : m;
    case "walk.done": {
      // The setting practice: its lesson finishing in its own project means the checks run again (the card starts them).
      if (m.practice?.stage === "lesson" && e.project === m.practice.project && e.lesson === SETTINGS_LESSON_ID) m = { ...m, practice: { ...m.practice, stage: "proving" } };
      return m.walk && m.walk.id === e.walk ? { ...m, walk: { ...m.walk, stage: "done" } } : m;
    }
    case "walk.stopped":
      // Stopping the setting practice's lesson goes back to the start of the fix, so it can be opened again.
      if (m.practice?.stage === "lesson" && m.walk && m.walk.id === e.walk && m.walk.lesson === SETTINGS_LESSON_ID) m = { ...m, practice: { ...m.practice, stage: "found" } };
      // The practice's lesson could not even start: no lesson is made because the setting's name is already in the file
      // (saved with an empty value, say). The checks run again, and the practice says what that means; no second panel.
      else if (m.practice?.stage === "lesson" && !m.walk && e.walk === m.walkWant && (m.practice.walk === undefined || m.practice.walk === e.walk)) {
        return { ...m, walk: null, walkWant: null, practice: { ...m.practice, stage: "proving", nameSet: true } };
      }
      if (m.walk && m.walk.id === e.walk) return { ...m, walk: { ...m.walk, stage: "stopped", note: String(e.reason ?? "") } };
      // A lesson that could not even start (not found) still tells the person why.
      return !m.walk && e.walk === m.walkWant ? { ...m, walk: { stage: "stopped", id: e.walk, lesson: "", title: "Lesson", index: 0, total: 0, variant: "main", say: "", find: "", ask: false, log: [], note: String(e.reason ?? "") } } : m;
    // An answer counts only for a question still waiting (not one that came after Stop or a folder change).
    case "diagram.ready": return m.diagram?.stage !== "asking" || (m.diagram.ask && e.ask && m.diagram.ask !== e.ask) || (m.diagram.project && e.project && m.diagram.project !== e.project) ? m : e.made ? { ...m, diagram: { stage: "shown", caption: e.diagram?.caption, brokenReason: e.diagram?.broken?.reason } } : { ...m, diagram: { stage: "none", reason: claudeStopWords(String(e.reason ?? "")) ?? String(e.reason ?? "") } };
    case "ui.aboutClosed": return { ...m, about: null, install: null };
    // `fresh` (the first run's first check): an error or notice from before this press is cleared, so what shows is this one's.
    case "ui.findProblem": return { ...m, point: { stage: "checking" }, ...(e.fresh ? { error: null, notice: null } : {}) };
    // Closing puts the character back to rest; the check is over.
    case "ui.pointClosed": return rest({ ...m, point: null }, m.point?.agent);
    case "problem.found": {
      if (e.needs === "browser") m = { ...m, browser: { ...m.browser, needed: true } };
      m = practiceFound(m, e);
      // Only an answer to a press that is still waiting counts; one that arrives after Stop or a folder change is old news.
      if (m.point?.stage !== "checking") return m;
      if (e.verdict === "cancelled") return { ...m, point: null };
      if (e.verdict === "failed") return { ...m, point: { stage: "found", label: String(e.label ?? ""), message: String(e.detail ?? ""), agent: e.agent, ...(e.problem ? { problem: e.problem } : {}) }, where: e.problem ?? null };
      return { ...m, point: { stage: e.verdict === "nothing_to_check" ? "nothing" : e.verdict === "passed_with_gaps" ? "gaps" : "clear", ...(typeof e.note === "string" && e.note ? { note: e.note } : {}) }, where: null };
    }
    case "proof.result": {
      if (m.away[e.agent] !== undefined) return m;
      if (browserRung(e.steps, (s) => s.status === "skipped" && s.needs === "browser")) m = { ...m, browser: { ...m.browser, needed: true } };
      else if (browserRung(e.steps, (s) => s.status === "passed")) m = { ...m, browser: { ...m.browser, needed: false, installed: true } };
      const failed = e.verdict === "failed" ? (e.steps ?? []).find((s: any) => s.status === "failed") : undefined;
      if (e.verdict !== "cancelled") m = { ...m, where: failed?.problem ?? null };
      if (!m.task) return m;
      const steps: ProofLine[] = (m.task.proof?.steps ?? []).length ? m.task.proof!.steps : (e.steps ?? []).map((s: any) => ({ rung: s.rung, label: s.label, status: s.status, detail: s.detail ?? "", ...stepExtras(s) }));
      return { ...m, task: { ...m.task, proof: { steps, verdict: e.verdict, tries: Number(e.tries ?? 1), ...(Number.isInteger(e.of) && e.of >= 1 ? { of: e.of } : {}) } } };
    }
    case "plan.ready": if (m.away[e.agent] !== undefined) return m;
      return { ...m, stepExplains: [], planCheckpoints: [], plan: { agent: e.agent, steps: (e.steps ?? []).map((x: any) => String(x.title)), truncated: !!e.truncated, estimateUsd: Number(e.estimateUsd ?? 0) }, drive: null, stuck: null, paused: null, task: null, receipt: null, error: null, notice: null };
    // The check that kept failing: one plain sentence, and its raw output kept for behind Details (M45), never shown bare.
    case "loop.stuck": return { ...m, plan: null, paused: null, stuck: { index: e.index, title: e.title,
      failure: { label: String(e.failure?.label ?? ""), parts: checkParts({ status: "failed", detail: String(e.failure?.detail ?? ""), summary: typeof e.failure?.summary === "string" ? e.failure.summary : undefined, problem: e.failure?.problem }) },
      options: Array.isArray(e.options) && e.options.length ? e.options : [{ id: "different", label: S.stuckDifferent }, { id: "stop", label: S.stuckStop }],
      ...(Number.isInteger(e.tries) && e.tries >= 1 ? { tries: e.tries } : {}), ...(typeof e.same === "boolean" ? { same: e.same } : {}), ...(typeof e.agent === "string" ? { agent: e.agent } : {}) } };
    case "drive.paused": return { ...m, stuck: null, paused: { reason: e.reason, path: e.path, ...(typeof e.agent === "string" ? { agent: e.agent } : {}) } };
    case "ui.resumed": return { ...m, paused: null };
    case "ui.stuckAnswered": return { ...m, stuck: null };
    case "ui.followUpSent": return { ...m, followUp: "sending", error: null, notice: null };
    case "rescue.report": if (m.away[e.agent] !== undefined) return m;
      return { ...m, rescue: { summary: e.summary, works: e.works ?? [], broken: e.broken, evidence: [...(e.evidence ?? [])].sort((a: any, b: any) => (a.status === "failed" ? 0 : 1) - (b.status === "failed" ? 0 : 1)) }, task: null, receipt: null, error: null, notice: null };
    case "app.prompt_help":
      // Each stage starts fresh, so the old text never lingers into a new press.
      return e.stage === "dismissed" ? { ...m, ph: null } : { ...m, ph: { stage: e.stage, app: e.app ?? m.ph?.app, message: e.message, diff: [], ...(typeof e.req === "string" && e.req ? { req: e.req } : {}) } };
    case "assist.prompt.delta": return m.ph && phOwn(m, e.req) ? { ...m, ph: { ...m.ph, stage: m.ph.stage === "ready" ? "ready" : "thinking", streaming: (m.ph.streaming ?? "") + String(e.text ?? "") } } : m;
    case "assist.prompt.done": return phOwn(m, e.req) ? { ...m, ph: { stage: "ready", app: m.ph?.app, text: e.text, diff: e.diff ?? [], question: e.question, options: e.options, handback: e.handback, req: m.ph?.req } } : m;
    case "ship.gates": m = practiceGates(m, e); return { ...m, ship: { gates: e.gates ?? [], canShip: !!e.canShip, blockedBy: e.blockedBy ?? [], needsYou: e.needsYou ?? [], confirmed: e.confirmed ?? [] } };
    case "ship.status": if (e.needs === "browser") m = { ...m, browser: { ...m.browser, needed: true } };
      return { ...m, shipFlow: { stage: String(e.stage), detail: String(e.detail ?? ""), previewUrl: e.previewUrl, productionUrl: e.productionUrl, canGoLive: e.canGoLive === true } };
    // The it's live card belongs to the live site on screen; after a close or a roll back it is not shown.
    case "ship.card": return m.shipFlow?.stage === "live" && typeof e.image === "string" ? { ...m, shipFlow: { ...m.shipFlow, card: { image: e.image, url: String(e.url ?? ""), title: String(e.title ?? "") } } } : m;
    // M58 (UI 13): Sign in to Vercel, from the person's press to its end (shipFinish.ts).
    case "ui.signInAsked": case "ship.signIn": return { ...m, shipFlow: signInReduce(m.shipFlow, e) };
    case "ui.shipClosed": return { ...m, ship: null, shipFlow: null };
    case "research.done": return { ...m, researchCount: m.researchCount + 1, research: { title: e.title, answer: e.answer, notes: e.notes ?? [], ...(typeof e.file === "string" && e.file ? { file: e.file } : {}), n: m.researchCount + 1 }, task: null, receipt: null, error: null, notice: null };
    case "ui.researchRequested": case "ui.researchClosed": return { ...m, research: null };
    // The check before going live and Put it online replace no task: while the last task waits for an answer, its question
    // and its answer box stay (ship).
    case "ui.planRequested": {
      const keep = e.ship === true && waitsForAnswer(m);
      return { ...m, ship: null, research: null, rescue: null, ...(keep ? {} : { task: null, receipt: null }), drive: null, plan: null, stuck: null, paused: null, error: null, notice: null };
    }
    // release: Cancel, or Close on Rescue's report, put the plan aside, so its agent rests (the card asks the engine too).
    // Start the plan clears the card the same way, but the plan runs.
    case "ui.planCancelled": { const a = m.plan?.agent, out = { ...m, plan: null, rescue: null }; return e.release === true ? rest(out, a) : out; }
    case "ui.driveClosed": return m.drive?.finished ? { ...m, drive: null, stepExplains: [], planCheckpoints: [] } : m;
    case "drive.step": {
      if (m.driveAway !== null) return m;
      const done = e.status === "done" ? Math.max(m.drive?.completed ?? 0, Number(e.index)) : m.drive?.completed ?? 0;
      return { ...m, plan: null, rescue: null, stuck: null, paused: null, drive: { index: e.index, total: e.total, title: e.title, status: e.status, completed: done, ...(m.drive?.whole ? { whole: m.drive.whole } : {}) } };
    }
    case "drive.done": if (m.driveAway !== null) return { ...m, driveAway: null };
      return { ...m, plan: null, stuck: null, paused: null, receipt: wholePlanReceipt(m.receipt, m.drive?.whole, e.usdEstimate), drive: { index: m.drive?.index ?? 0, total: e.total, title: m.drive?.title ?? "", status: "finished", completed: e.completed, finished: { status: e.status, completed: e.completed, total: e.total }, ...(m.drive?.whole ? { whole: m.drive.whole } : {}) } };
    case "tasks.list": return { ...m, lastWorking: e.lastWorking && typeof e.lastWorking.checkpoint === "string" && typeof e.lastWorking.at === "string" ? { checkpoint: e.lastWorking.checkpoint, at: e.lastWorking.at } : undefined, history: Array.isArray(e.tasks) ? e.tasks : [], reviewHistory: reviewRowsOf((e as { reviews?: unknown }).reviews), sinceCheck: typeof e.project === "string" && (e.sinceCheck === "same" || e.sinceCheck === "changed") ? { project: e.project, changed: e.sinceCheck === "changed" } : undefined };
    // The picture arrives a little after the receipt; it belongs only to the receipt it was made for.
    case "receipt.visual": return m.receipt && (m.receipt.checkpoint === e.checkpoint || m.receipt.wholePlan?.last === e.checkpoint) && m.away[e.agent] === undefined && (!m.folder || e.project === m.folder) ? { ...m, receipt: { ...m.receipt, visual: e.made === true && typeof e.image === "string" ? { image: e.image, ...(typeof e.before === "string" && e.before ? { before: e.before } : {}), caption: String(e.caption ?? "") } : { caption: "" } } } : m;
    // M69 step 3: Keep on a result closes it (Home goes back to rest, where the Last fix card shows it). Never while an Undo
    // runs, and never while there is no result (work going on).
    case "ui.resultKept": return m.receipt && m.undo?.stage !== "working" && m.undo?.stage !== "confirm" ? { ...m, task: null, receipt: null, explain: null, followUp: "idle", undo: null } : m;
    // A single task's loop card is answered before its receipt (Stop answers it too), so the receipt clears it. A Drive step's
    // card always comes after the step's receipt.
    case "receipt": {
      // The end of work in another folder: never shown here (its Undo would name an undo point of the wrong project).
      // Where to see what it did is said instead. With the folder known, only a task begun in it has its receipt shown.
      const away = m.away[e.agent], w = m.workIn[e.agent];
      m = { ...m, workIn: without(m.workIn, e.agent) };
      if (away !== undefined) return away ? { ...m, notice: S.awayFinished(folderName(away)) } : m;
      if (m.folder && (w?.project ?? m.task?.project) !== m.folder) return m;
      // A plan's step: what it did joins the plan's whole fix, which drive.done shows as one receipt (must fix 7).
      if (e.inPlan === true && m.drive && !m.drive.finished && typeof e.checkpoint === "string") m = { ...m, drive: { ...m.drive, whole: addPlanStep(m.drive.whole, e) } };
      // A new receipt is built fresh, so undone, back, fixKept and undoSafety start cleared: this is the only place they are.
      // What the engine said about the files since the last check is older than this result: it is asked again.
      return { ...m, sinceCheck: undefined, stuck: null, practice: practiceReceipt(m.practice, e), receipt: { proof: e.proof, checkpoint: e.checkpoint, changed: e.changed, ...(typeof e.askWords === "number" ? { askWords: e.askWords } : {}), commands: e.commands, notUndoable: e.notUndoable, usdEstimate: e.usdEstimate, ...(e.picture === true ? { picture: true } : {}), ...(placeOk(e.changedAt) ? { changedAt: e.changedAt } : {}), ...(repeatOk(e.repeat) ? { repeat: e.repeat } : {}), ...saidOf(e), ...endOf(e) } };
    }
    // With no folder chosen, Settings asks for the settings for every project (the stand in project): only those are read
    // from it (settingsStore.ts), never a project's memory for the Memory tab.
    case "memory.state": if (e.project === NO_PROJECT) return m; return { ...m, memory: { paused: !!e.paused, projectLines: e.projectLines ?? [], profileLines: e.profileLines ?? [], problems: e.problems ?? [] }, memoryNote: null };
    case "memory.refused": return { ...m, memoryNote: String(e.reason) };
    case "memory.exported": return { ...m, exported: String(e.text ?? "") };
    case "memory.saved": {
      const lines = m.toast?.lines ?? [];
      return lines.some((l) => l.id === e.line) ? m : { ...m, toast: { lines: [...lines, { id: String(e.line), scope: e.scope, text: String(e.text) }] } };
    }
    case "ui.toastClear": return { ...m, toast: null };
    case "memory.agents_ask": return { ...m, agentsAsk: Array.isArray(e.files) ? e.files.map(String) : [] };
    case "ui.agentsAnswered": return { ...m, agentsAsk: null };
    case "memory.agents_written": return { ...m, notice: `${PRODUCT} updated ${(e.files ?? []).join(" and ")} with the facts about this project.` };
    case "ui.memoryClosed": return { ...m, memory: null, memoryNote: null, exported: null };
    // An error while the practice fix runs (busy, daily limit, a failure) must not leave it waiting forever.
    // The memory could not be read (the audit, item 50): the Memory page says why and offers Try again, never loading for ever.
    case "ui.memoryRetry": return { ...m, memoryNote: null };
    case "protocol.error": if (String(e.failed ?? "") === "memory.list" && !m.memory) return { ...m, memoryNote: plainError(String(e.reason)), error: null };
      if (m.undo?.stage === "working") return { ...m, undo: { ...m.undo, stage: "failed", note: plainError(String(e.reason)) }, error: null };
      // Put my fix back could not be done: the person's turn stays as it was, with the reason.
      if (m.teach?.stage === "restoring") return { ...m, teach: { ...m.teach, stage: "ready", note: plainError(String(e.reason)) }, error: null };
      // The practice's fix ends on an error only before its task began, or when the engine failed that request itself; once
      // its undo point is made, only its receipt or its agent stopping ends it (agent.state; a refusal of another command,
      // such as the key pressed again during the fix, is not its end). Its checks end on an error only from the engine itself (no agent): a refusal for the agent
      // comes with that check's own answer.
      return { ...m, followUp: "idle", ...(m.practice?.stage === "fixing" && (!m.practice.checkpoint || String(e.failed ?? "").startsWith("agent.")) ? { practice: { ...m.practice, stage: "failed" as const } } : m.practice?.stage === "proving" && typeof e.agent !== "string" ? { practice: { ...m.practice, stage: "failed" as const, checksFailed: true } } : {}), error: plainError(String(e.reason)) };
    // The browser check's download. A second press while it runs changes nothing.
    case "ui.browserInstallAsked": return browserBusy(m.browser) ? m : { ...m, browser: { ...m.browser, stage: "asked", percent: undefined, mb: undefined, detail: undefined } };
    case "ui.browserClosed": return browserBusy(m.browser) ? m : { ...m, browser: { needed: false, stage: "idle", ...(m.browser.installed !== undefined ? { installed: m.browser.installed } : {}) } };
    case "browser.install": {
      const detail = String(e.detail ?? "");
      if (e.stage === "downloading") return { ...m, browser: { ...m.browser, stage: "downloading", detail, percent: typeof e.percent === "number" ? e.percent : m.browser.stage === "downloading" ? m.browser.percent : undefined, mb: typeof e.mb === "number" ? e.mb : m.browser.mb } };
      if (e.stage === "done") return { ...m, browser: { ...m.browser, stage: "done", installed: true, percent: undefined, detail } };
      if (e.stage === "failed" || e.stage === "cancelled") return { ...m, browser: { ...m.browser, stage: e.stage, percent: undefined, detail } };
      return m;
    }
    case "browser.status": {
      const installed = e.installed === true;
      if (e.installing === true) return { ...m, browser: { ...m.browser, installed, stage: "downloading", ...(m.browser.stage === "downloading" ? {} : { percent: undefined }) } };
      // Nothing is running any more: a download whose end this page missed is shown as ended.
      if (browserBusy(m.browser)) return { ...m, browser: { ...m.browser, installed, stage: installed ? "done" : "idle", percent: undefined } };
      return { ...m, browser: { ...m.browser, installed } };
    }
    default: return m;
  }
}

// The browser check's one line and button on the card, for every stage. Null when there is nothing to say.
export type BrowserView = { line: string; button?: string; busy: boolean; percent?: number; closable: boolean };
export function browserView(m: Model): BrowserView | null {
  const b = m.browser;
  switch (b.stage) {
    case "asked": return { line: S.browserStarting, busy: true, closable: false };
    case "downloading":
      if (typeof b.percent !== "number") return { line: S.browserStarting, busy: true, closable: false };
      return { line: b.percent >= 100 ? S.browserSettingUp : S.browserProgress(b.percent, b.mb), busy: true, percent: b.percent, closable: false };
    case "done": return { line: S.browserReady, busy: false, closable: true };
    case "failed": return { line: b.detail || S.browserFailed, button: S.browserTryAgain, busy: false, closable: true };
    case "cancelled": return { line: S.browserStopped, button: S.browserGet, busy: false, closable: true };
    default: return b.needed && !b.installed ? { line: S.browserNeeded, button: S.browserGet, busy: false, closable: true } : null;
  }
}

const LIVE_KINDS: readonly LiveFile["kind"][] = ["added", "modified", "deleted"];
/** At most this many files are kept for the work card (a task that rewrites a whole folder still lists only these). */
export const LIVE_FILES_KEPT = 200;
/** A path from the project folder down, as the engine sends it (protocol agent.file): never whole, never up and out. */
const fromProject = (f: unknown): f is string => typeof f === "string" && f.length > 0 && f.length <= 1024 && !f.startsWith("/") && !f.includes("\\") && !f.split("/").some((p) => p === ".." || p === "");
/** How a file changed over the whole task, from how it had changed and how it changed now: made then changed is still
 *  made, made then removed is nothing (null), removed then made again is changed. */
export function liveKind(was: LiveFile["kind"] | undefined, now: LiveFile["kind"]): LiveFile["kind"] | null {
  if (was === "added") return now === "deleted" ? null : "added";
  if (was === "deleted") return now === "added" ? "modified" : now;
  return now;
}
/** The list with one more change: a file already listed keeps its place, a new one goes last. */
export function withLiveFile(list: LiveFile[], file: string, kind: LiveFile["kind"]): LiveFile[] {
  const at = list.findIndex((x) => x.file === file);
  const k = liveKind(at >= 0 ? list[at].kind : undefined, kind);
  if (at >= 0) return k ? list.map((x, i) => (i === at ? { file, kind: k } : x)) : list.filter((_, i) => i !== at);
  return k && list.length < LIVE_FILES_KEPT ? [...list, { file, kind: k }] : list;
}

// What the agent is doing right now: the latest one or two steps, in plain words.
export function activityNow(m: Model, n = 2): ToolLine[] {
  return (m.task?.lines ?? []).slice(-n);
}

const BUSY: CharacterState[] = ["thinking", "working", "checking", "needsYou"];
/** Is the card busy with work (Stop shows; the Start row, the off the record switch and the follow up box do not)? Not for
 *  a task that has ended on a question: nothing runs, and the follow up box is where the answer goes. */
export const cardWorking = (m: Model): boolean => BUSY.includes(m.character) && !waitsForAnswer(m) && !foundWaits(m);
/** m67 bug 22: Check my project found a problem and its agent waits on the person (the engine says needsYou after
 *  problem.found): nothing runs, so Home shows the finding and Fix it, not Working and Stop. Not while an approval, the loop
 *  card, a pause, a plan or a question waits, or another agent still works. */
export function foundWaits(m: Model): boolean {
  const a = m.point?.stage === "found" ? m.point.agent : undefined;
  if (!a || m.agents[a] !== "needsYou") return false;
  if (m.approvals.length || m.stuck || m.paused || m.plan || m.agentsAsk) return false;
  return Object.entries(m.agents).every(([x, s]) => x === a || !BUSY.includes(s));
}
// A task that ended on a question waits for nothing once an undo has put its files back (the engine sends no new state for
// it): its agent is ready again, unless something else waits for it (an approval card, the loop card, a pause, a plan).
function answerGone(m: Model): Model {
  const a = m.task?.agent, r = m.receipt;
  if (!a || !r?.asks || !(r.undone || r.earlierUndone) || m.agents[a] !== "needsYou") return m;
  if (m.approvals.some((x) => x.agent === a) || m.stuck || m.paused || m.plan || m.agentsAsk) return m;
  return withAgents(m, { ...m.agents, [a]: "idle" });
}
/** The last task's conversation no longer matches the files (an Undo, an earlier task undone after it, or an engine restart),
 *  so it cannot be followed up or answered: the engine refuses it too. */
const followGone = (r: Receipt): boolean => !!r.undone || !!r.gone || !!r.earlierUndone;
/** M45: files went back in this project after the last task (an Undo from the card or the timeline, or undoing one task), so
 *  its work is no longer in them. The receipt is marked undone with the safety copy the engine made first (Bring the fix
 *  back restores it), and a finished task's tick and "Done" go at once, not 4 seconds later (ui.settle). A receipt already
 *  undone keeps its first safety copy: that one has the fix in it. */
/** One more step of a plan, added to what the plan did so far (must fix 7). A file added and then deleted again is gone from
 *  the list; one deleted and then added again was modified; otherwise the first "added" stays and the latest kind wins. */
export function addPlanStep(w: PlanWhole | undefined, e: Ev): PlanWhole {
  const changed = new Map<string, string>((w?.changed ?? []).map((c) => [c.file, c.kind]));
  for (const c of Array.isArray(e.changed) ? e.changed : []) {
    if (!c || typeof c.file !== "string") continue;
    const was = changed.get(c.file), kind = String(c.kind);
    if (was === "added" && kind === "deleted") changed.delete(c.file);
    else if (was === "added") changed.set(c.file, "added");
    else if (was === "deleted" && kind === "added") changed.set(c.file, "modified");
    else changed.set(c.file, kind);
  }
  const usd = typeof e.usdEstimate === "number" && Number.isFinite(e.usdEstimate) && e.usdEstimate > 0 ? e.usdEstimate : 0;
  const notUndoable = [...(w?.notUndoable ?? [])];
  for (const x of Array.isArray(e.notUndoable) ? e.notUndoable : []) if (typeof x === "string" && !notUndoable.includes(x)) notUndoable.push(x);
  return { first: w?.first ?? String(e.checkpoint), last: String(e.checkpoint), steps: (w?.steps ?? 0) + 1, changed: [...changed].map(([file, kind]) => ({ file, kind })),
    commands: (w?.commands ?? 0) + (typeof e.commands === "number" ? e.commands : 0), notUndoable, usd: (w?.usd ?? 0) + usd };
}
/** At a plan's end, its last step's receipt becomes the whole fix's (must fix 7): every changed file, the whole cost, and an
 *  undo point before the first step, so Undo puts back the whole fix. The last step's proof and ending stay: its checks ran
 *  on the project as the whole plan left it. A plan of one step keeps its receipt as it is. */
function wholePlanReceipt(r: Receipt | null, w: PlanWhole | undefined, usdEstimate: unknown): Receipt | null {
  if (!r || !w || w.steps < 2 || r.wholePlan || r.checkpoint !== w.last) return r;
  // The turn offer belongs to the last step's own undo point, so it does not carry over.
  const { repeat: _repeat, turnTaken: _turnTaken, ...rest } = r;
  const total = typeof usdEstimate === "number" && Number.isFinite(usdEstimate) ? usdEstimate : 0;
  return { ...rest, checkpoint: w.first, changed: w.changed, commands: w.commands, notUndoable: w.notUndoable, usdEstimate: Math.max(total, w.usd), wholePlan: { steps: w.steps, last: w.last } };
}
function filesWentBack(m: Model, project: unknown, safety: unknown): Model {
  const r = m.receipt;
  if (!r || (typeof project === "string" && m.task?.project && project !== m.task.project)) return m;
  if (r.undone && !r.back && !r.fixKept) return m;
  m = answerGone({ ...m, receipt: { ...r, undone: true, back: false, backPartly: undefined, fixKept: undefined, undoSafety: typeof safety === "string" && safety ? safety : undefined } });
  const a = m.task?.agent;
  return a && (m.agents[a] === "done" || m.agents[a] === "error") ? withAgents(m, { ...m.agents, [a]: "idle" }) : m;
}
/** How the receipt says the task ended (M45). No ending sent (an older engine): nothing, which reads as "unknown", never done.
 *  "failed" is split by the engine's reason, so a limit is named instead of "Something went wrong". */
function endOf(e: Ev): Pick<Receipt, "end" | "limit" | "failWhy"> {
  const why = e.endedWhy;
  if (e.ended === "done") return { end: "done" };
  if (e.ended === "needs_you") return { end: "needsYou" };
  if (e.ended === "stopped") return { end: "stopped" };
  if (e.ended !== "failed") return {};
  if (why === "spending_limit") return { end: "limit", limit: "spending" };
  if (why === "daily_limit") return { end: "limit", limit: "daily" };
  if (why === "turns") return { end: "limit", limit: "turns" };
  return { end: "failed", failWhy: why === "no_connection" ? "noConnection" : why === "claude_busy" ? "claudeBusy" : why === "check_failed" ? "check" : "error" };
}
/** The last task has ended on a question to the person (its receipt asks, and its agent needs them), and nothing else is
 *  waiting for an answer: the follow up box is where they answer, and nothing is running. */
export function waitsForAnswer(m: Model): boolean {
  const t = m.task, r = m.receipt;
  if (!r?.asks || followGone(r) || !t || m.agents[t.agent] !== "needsYou") return false;
  if (m.approvals.length || m.stuck || m.paused || m.plan || m.agentsAsk) return false;
  return Object.entries(m.agents).every(([a, s]) => a === t.agent || !BUSY.includes(s));
}
// The follow up box under the receipt: only once a task has finished, for the project on screen, when nothing else is
// running or waiting for an answer (a task that ended on a question waits for exactly this box), and not while Undo is
// asked or once it has put the files back (the conversation would no longer match them; the engine refuses it too).
export function canFollowUp(m: Model, project: string): boolean {
  const t = m.task;
  if (!m.receipt || followGone(m.receipt) || !t || !project || t.project !== project) return false;
  if (!waitsForAnswer(m) && (BUSY.includes(m.agents[t.agent] ?? "idle") || BUSY.includes(m.character))) return false;
  if (m.followUp === "sending" || m.undo || m.plan || m.stuck || m.paused || (m.drive && !m.drive.finished)) return false;
  return true;
}
// Try again: the same, after a task that was not done (a check failed, or it ended with an error).
export function canRetry(m: Model, project: string): boolean {
  // A task that ended on a question is answered, not tried again.
  if (!canFollowUp(m, project) || m.receipt!.asks) return false;
  return m.receipt!.proof === "failed" || m.agents[m.task!.agent] === "error";
}
// The loop card's heading: a Drive step by its number, a single task (index 0) by its name.
export function stuckWords(m: Model): string | null {
  const s = m.stuck;
  if (!s) return null;
  return s.index > 0 ? `${S.stepOf} ${s.index}: ${s.title}` : s.title;
}

// The loop card's help line: exactly as before for the usual three identical failures; otherwise how many checks failed,
// and whether they all failed the same way.
export function stuckHelpWords(m: Model): string {
  const s = m.stuck;
  const tries = s?.tries ?? 3, same = s?.same ?? true;
  if (tries === 3 && same) return S.stuckHelp;
  if (tries <= 1) return S.stuckHelpOne;
  const times = S.stuckTimes[tries] ?? `${tries} times`;
  return same ? S.stuckHelpSame(times) : S.stuckHelpAny(times);
}
// A plan cut to Most steps in a plan (drive.maxSteps): the number it was cut to is the number of steps it kept.
export function planCutWords(m: Model): string | null {
  return m.plan?.truncated ? S.planCut(m.plan.steps.length) : null;
}

// The toast after Companion learns something new.
export function savedWords(m: Model): string | null {
  const l = m.toast?.lines ?? [];
  if (l.length === 0) return null;
  return l.length === 1 ? `Remembered: ${l[0].text}` : `Remembered ${l.length} new things`;
}

// How a past task ended, in plain words: the verdict's own headline (M45), so What I did never words a result its own way.
export function historyWords(t: Pick<HistoryItem, "status" | "proof"> & Partial<Pick<HistoryItem, "changed" | "undone" | "back">>): string {
  if (t.status === "running") return S.historyRunning;
  return verdictOf(historyFacts(t)).headline;
}

// A check failed and Claude is working on it again: say "fixing", not "Not done", until it has really ended.
export function isFixing(m: Model): boolean {
  return m.task?.proof?.verdict === "failed" && ["thinking", "working", "checking"].includes(m.character);
}

// Tells the user when the work needed more than one try, so a fix never goes unnoticed.
export function triesNote(m: Model): string | null {
  const p = m.task?.proof;
  if (!p?.verdict || p.tries <= 1) return null;
  if (p.verdict === "cancelled" || p.verdict === "nothing_to_check") return null;   // nothing was fixed, so nothing is claimed
  // After an Undo the checked files are gone, so how many tries the check took is no longer about them (M45).
  if (m.receipt?.undone) return null;
  // "Passed", not "Fixed": the check passed; whether it is fixed is the verdict's word.
  return p.verdict === "failed" ? S.stillFailing(p.tries) : p.verdict === "passed_with_gaps" ? S.passedAfterGaps(p.tries) : S.passedAfter(p.tries);
}

// Why the task is not done, in one plain line. Null when nothing failed.
export function notDoneReason(m: Model): string | null {
  const p = m.task?.proof;
  if (!p || p.verdict !== "failed") return null;
  const f = [...p.steps].reverse().find((s) => s.status === "failed") ?? p.steps.at(-1);
  // One plain sentence: the raw output is behind Details on the step's own row, never printed bare (M45).
  return f ? `${f.label}: ${checkParts({ ...f, status: "failed" }).summary}` : S.verdict.failedLine;
}

/** The "I did not say it was finished" line under the checks, only when no failed check row already says why (the audit,
 *  item 34: the same failure was said three times). */
export function notDoneLine(m: Model): string | null {
  const why = notDoneReason(m);
  return why && !m.task!.proof!.steps.some((s) => s.status === "failed") ? why : null;
}

// How the character's pictures move (character.live off). Reduced motion freezes everything. M46: the live drawing has no
// data-motion at all (dock.tsx); it moves itself (flowflow/).
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
  // Zero is said as "No cost" where it stands alone (costWords); in a sentence, a number still reads correctly (M45).
  if (usd <= 0) return "0 cents";
  if (usd < 0.01) return "less than 1 cent";
  const cents = Math.round(usd * 100);
  if (cents < 100) return cents === 1 ? "1 cent" : `${cents} cents`;
  return `$${usd.toFixed(2)}`;
}

/** What a task cost, on its own: its price, or "No cost" (never "free so far", M45). */
export const costWords = (usd: number): string => (usd > 0 ? formatUsd(usd) : S.noCost);

// The one word shown under the character (plain, never cute).
export function stateLabel(s: CharacterState): string {
  return ({ off: "Off", idle: "Ready", listening: "Listening", thinking: "Thinking", working: "Working", checking: "Checking", needsYou: "Needs you", done: "Done", error: "Something went wrong" } as const)[s];
}

// One sentence: may this go on the internet?
export function shipWords(m: Model): string | null {
  const s = m.ship;
  if (!s) return null;
  if (s.canShip) return "Ready to go live: every check passed";
  const b = s.blockedBy.length, n = s.needsYou.length;
  const parts = [b ? `${b} ${b === 1 ? "thing is" : "things are"} blocking it` : "", n ? `${n} ${n === 1 ? "needs" : "need"} you` : ""].filter(Boolean);
  return `Not ready to go live: ${parts.join(" and ")}`;
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
    case "needs_accessibility": return withKeys(S.phNeedsAccess, "read");
    case "nothing_to_read": return `I could not find text to read in ${p.app ?? "this app"}. Click into the text box first.`;
    case "consent": return `Allow Prompt help to read the text box in ${p.app ?? "this app"}?`;
    default: return p.message ?? null;
  }
}

// ---- which task broke it ----

/** A date and time in plain words ("14 October at 13:30"), in the person's own time zone. */
export function whenWords(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/** The button shows when a check failed (the key found a problem, or a task's checks failed and it stopped trying) and there
 *  are at least two earlier tasks that changed the project to compare. Never while a search is running. */
export function canBisect(m: Model): boolean {
  if (m.bisect?.stage === "running") return false;
  const failed = m.point?.stage === "found" || (m.task?.proof?.verdict === "failed" && !isFixing(m));
  return failed && m.history.filter((h) => !!h.checkpoint && h.changed !== 0).length >= 2;
}

const sentence = (s: string | undefined) => (s && /[.!?]$/.test(s.trim()) ? s.trim() : "");

/** The search and its answer, one plain sentence per line. */
export function bisectLines(m: Model): string[] {
  const b = m.bisect;
  if (!b) return [];
  if (b.stage === "running") {
    if (!b.run || !b.maxRuns) return [S.bisectStarting];
    if (b.what === "after" && b.label) return [S.bisectAfter(b.label, b.run, b.maxRuns)];
    if (b.what === "before" && b.label) return [S.bisectBefore(b.label, b.run, b.maxRuns)];
    return [S.bisectNow(b.run, b.maxRuns)];
  }
  const step = b.step ? [S.bisectStep(b.step.label)] : [];
  switch (b.outcome) {
    case "found": {
      if (!b.task) return [S.bisectFailed];
      const lines = [S.bisectFound(b.task.label, whenWords(b.task.at)), ...step];
      if (b.undo === "show_only") lines.push(...[sentence(b.why), S.bisectShowOnly].filter(Boolean));
      if (b.undoStage === "working") lines.push(S.bisectUndoWorking);
      if (b.undoStage === "done") lines.push(S.bisectUndone);
      if (b.undoStage === "failed") lines.push(sentence(b.note) || S.bisectFailed);
      return lines;
    }
    case "not_failing": return [S.bisectNotFailing];
    case "already_failing": return [b.earlier ? S.bisectAlready(b.earlier.label, whenWords(b.earlier.at)) : S.bisectUnsure, ...step];
    case "after_last_task": return [b.earlier ? S.bisectAfterLast(b.earlier.label) : S.bisectUnsure, ...step];
    case "outside_change": return [b.earlier && b.later ? S.bisectOutside(b.earlier.label, b.later.label) : S.bisectUnsure, ...step];
    case "unsure": return [b.earlier && b.later && b.earlier.label !== b.later.label ? S.bisectUnsureRange(b.earlier.label, b.later.label) : S.bisectUnsure, ...[sentence(b.detail)].filter(Boolean), ...step];
    case "too_few": return [S.bisectTooFew];
    case "cannot_check": return [sentence(b.detail) || S.bisectCannot];
    case "busy": return [sentence(b.detail) || S.bisectFailed];
    default: return [sentence(b.detail) || S.bisectFailed];
  }
}

// ---- the error explainer ----

/** Each stage of the error explainer, then its answer, one plain sentence per line. */
export function ehLines(m: Model): string[] {
  const h = m.eh;
  if (!h) return [];
  const app = h.app || S.thisApp;
  const where = h.where && h.where.kind === "line" ? [S.ehWhere(h.where.file, h.where.line)] : [];
  const refused: Record<string, string> = { secure_field: S.ehSecureField, secure_input: S.ehSecureInput, never_app: S.ehNeverApp, refused_by_you: S.ehRefusedByYou, own_app: withKeys(S.ehOwnApp, "explain"), no_engine: S.ehNoEngine, no_front: withKeys(S.ehNoFront, "explain"), unreadable: withKeys(S.ehUnreadable, "explain") };
  switch (h.stage) {
    case "reading": return [S.ehReading(app)];
    case "thinking": return [S.ehThinking];
    case "consent": return [S.ehConsent(app)];
    case "needs_accessibility": return [withKeys(S.ehNeedsAccess, "explain")];
    case "nothing_selected": return [withKeys(S.ehNothing(app), "explain")];
    case "ready": return [...(h.sentences ?? []), ...where];
    case "unexplained": return [sentence(h.reason) || S.ehError, ...where];
    default: return [refused[h.why ?? ""] ?? S.ehError];
  }
}

// ---- Second Look ----

/** Each stage of Second Look, then its answer, one plain sentence per line: the verdict, each thing to check (what looks
 *  wrong, how to check it), what it checked, what it could not tell, whether it searched the web, and what it cost. The
 *  pages it found are buttons on the card (slSources). */
export function slLines(m: Model): string[] {
  const l = m.sl;
  if (!l) return [];
  const app = l.app || S.thisApp;
  const refused: Record<string, string> = { secure_field: S.ehSecureField, secure_input: S.ehSecureInput, never_app: S.ehNeverApp, refused_by_you: S.ehRefusedByYou, own_app: withKeys(S.slOwnApp, "secondlook"), no_engine: S.ehNoEngine };
  switch (l.stage) {
    case "reading": return [S.slReading(app)];
    case "thinking": return [S.slThinking];
    case "consent": return [S.slConsent(app)];
    case "off": return [S.slOff];
    case "needs_accessibility": return [withKeys(S.slNeedsAccess, "secondlook")];
    case "nothing_selected": return [withKeys(S.slNothing(app), "secondlook")];
    case "failed": return [sentence(l.reason) || S.slError];
    case "ready": {
      const out = [S.slVerdict[l.verdict ?? ""] ?? S.slVerdict.cant_tell];
      for (const i of l.items ?? []) {
        out.push(S.slItem(i.claim, i.issue));
        out.push(i.by === "recomputed" ? S.slRecomputed : i.verify ? S.slVerify(i.verify) : "");
      }
      if (l.checked?.length) out.push(S.slChecked(l.checked.join("; ")));
      if (l.cantTell?.length) out.push(S.slCantTell(l.cantTell.join("; ")));
      out.push(l.search === "searched" && (l.searches ?? 0) > 0 ? S.slSearched(l.searches ?? 0) : S.slSearch[l.search ?? ""] ?? S.slSearch.unavailable);
      out.push((l.usd ?? 0) > 0 ? S.slCost(formatUsd(l.usd ?? 0)) : S.slNoCost);
      return out.filter(Boolean);
    }
    default: return [refused[l.why ?? ""] ?? S.slError];
  }
}
/** The pages Second Look's web searches found, each once, for Open buttons (opened only on the person's press). */
export function slSources(m: Model): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  if (m.sl?.stage !== "ready") return out;
  for (const i of m.sl.items ?? []) if (i.source && !out.some((x) => x.url === i.source!.url)) out.push(i.source);
  return out;
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
  const why = f.status === "interrupted" ? "you stopped it" : f.status === "error_max_budget_usd" ? "the spending limit was reached" : f.status === "error_max_turns" ? S.driveTurns(S.set["work.maxTurns"].label) : f.status === "daily_limit" ? "the daily limit for this project was reached" : f.status === "needs_you" ? S.driveNeedsYou : f.status === "no_connection" ? S.driveNoConnection : f.status === "claude_busy" ? S.driveClaudeBusy : "a check failed";
  return `Stopped after ${f.completed} of ${f.total} steps: ${why}`;
}

// What the character looks like right now. Listening to you and looking at your screen are shown even though no agent is working.
export function visualState(m: Model): CharacterState {
  if (m.voice?.stage === "listening") return "listening";
  if (m.showme && ["looking", "thinking"].includes(m.showme.stage)) return "checking";
  if (m.point?.stage === "checking") return "checking";
  if (m.diagram?.stage === "asking") return "thinking";
  if (m.voice?.stage === "transcribing") return "thinking";
  if (m.showme && ["pointing", "pointing_roughly", "your_turn_miss"].includes(m.showme.stage)) return "needsYou";
  if (m.showme && ["your_turn_done", "done_for_you"].includes(m.showme.stage)) return "done";
  // Return was just pressed: thinking, until the engine says what it is doing.
  if (m.sending && (m.character === "idle" || m.character === "done" || m.character === "error")) return "thinking";
  return m.character;
}

/** M45: is the character's done or error the last task's own result? Only when that task's own agent is in that state: an
 *  error from another agent (an explain, a diagnosis or a plan that failed) is that agent's, never this result's. */
export function resultShown(m: Pick<Model, "character" | "agents" | "receipt" | "task">): boolean {
  return !!m.receipt && !!m.task && (m.character === "done" || m.character === "error") && m.agents[m.task.agent] === m.character;
}
/** The character's state as it is drawn (Home's character, the one on the edge): a finished task that is not proven does not
 *  take the done look (no green glow, no ripple), as only a proven fix may look done (M45). Otherwise exactly visualState. */
export function lookState(m: Model): CharacterState {
  const v = visualState(m);
  return v === "done" && v === m.character && resultShown(m) && !receiptVerdict(m)!.proven ? "idle" : v;
}

// The word under the character and at the top of the card. A failed check is "Not done", never a crash.
export function characterWords(m: Model): string {
  if (m.voice?.stage === "listening") return "Listening";
  if (m.voice?.stage === "transcribing") return "Understanding you";
  if (m.showme && ["looking", "thinking"].includes(m.showme.stage)) return m.showme.stage === "looking" ? "Looking at your screen" : "Finding it";
  if (m.point?.stage === "checking") return "Checking your project";
  if (m.diagram?.stage === "asking") return "Drawing it";
  if (isFixing(m)) return "Fixing a failed check";
  // A finished task is worded by its verdict (M45): "Fixed and proven", "Stopped at today's limit", never a bare "Done".
  if (resultShown(m) && !isFixing(m)) return receiptVerdict(m)!.headline;
  // A failed check with no receipt (yet): the verdict's own word for it, never "Something went wrong" (a crash).
  if (m.character === "error" && notDoneReason(m)) return S.verdict.failed;
  return stateLabel(m.character);
}

// Show file paths the way a person thinks of them: inside the project, not the whole path on the disk.
export function plainPath(text: string, project: string): string {
  if (!project) return text;
  return text.split(project.endsWith("/") ? project : project + "/").join("");
}

// Is the second place back to the code from before the fix, on disk, right now? From the moment the engine put it back until
// the person's change passes, or the fix is put back. While it is, the turn cannot simply be closed.
export function teachOpen(t: TeachState): boolean {
  return t.stage === "ready" || t.stage === "checking" || t.stage === "left" || t.stage === "restoring" || (t.stage === "checked" && t.result?.verdict !== "passed");
}

export type TeachAction = "where" | "check" | "putBack" | "leave" | "close";
// The buttons on the person's turn, in order. Nothing while the engine is working on it. No Close while the old code is
// back: Put my fix back, or Leave it as it is, which says the place is still not fixed.
export function teachActions(t: TeachState): TeachAction[] {
  const where: TeachAction[] = t.target ? ["where"] : [];
  const putBack: TeachAction[] = t.restore ? ["putBack"] : [];
  // After an engine restart nothing can be checked any more: put the fix back, or leave it (then it can be closed).
  if (t.orphan && (t.stage === "ready" || t.stage === "checked")) return [...where, ...putBack, "leave"];
  if (t.orphan && t.stage === "left") return [...where, ...putBack, "close"];
  switch (t.stage) {
    case "ready": return [...where, "check", ...putBack, "leave"];
    case "checked": return t.result?.verdict === "passed" ? [...where, "close"] : [...where, "check", ...putBack, "leave"];
    case "left": return [...where, "check", ...putBack];
    case "refused": case "restored": return ["close"];
    default: return [];
  }
}

/** The agent's last words for the receipt: a question with where to answer it, or what it said. Null when it said nothing. */
export function receiptSaid(m: Model): { lead: string; words: string; help?: string } | null {
  const r = m.receipt;
  if (!r?.said) return null;
  if (!r.asks || followGone(r)) return { lead: S.receiptSaid, words: r.said };
  return { lead: waitsForAnswer(m) ? S.receiptAsks : S.receiptAsksToo, words: r.said, help: r.inPlan ? S.receiptAnswerHelpPlan : S.receiptAnswerHelp };
}

/** The receipt block's heading: Answer when the task changed no files and only answered, else What changed. */
export function receiptHeading(r: Receipt | null | undefined): string {
  return r && r.changed.length === 0 && !!r.said ? S.answerTitle : S.receiptTitle;
}

// The receipt's result as one sentence: the verdict's (M45). Kept by name for the older callers.
export function receiptProofWords(m: Pick<Model, "receipt" | "task" | "teach">): string {
  return receiptVerdict(m)?.say ?? "";
}

// ---- M45: the adapters from the Model to the verdict's facts (verdict.ts decides; nothing else says "proven") ----

/** The last receipt as facts. Null when there is no receipt. */
export function receiptFacts(m: Pick<Model, "receipt" | "task" | "teach">): Facts | null {
  const r = m.receipt;
  if (!r) return null;
  const steps = m.task?.proof?.steps ?? [];
  return {
    proof: r.proof === "passed" || r.proof === "partial" || r.proof === "failed" ? r.proof : "none",
    ended: r.end ?? "unknown", limit: r.limit, failWhy: r.failWhy,
    // Put my fix back on a turn is not an Undo: the files are the fix, as checked.
    undone: !!r.undone && !r.fixKept, back: !!r.back, backPartly: !!r.backPartly, changed: r.changed.length,
    // Which checks could not run is not known here: the ladder also skips harmless steps ("Nothing new to install."), and
    // the real gap can sit inside a step that passed. Until the engine names its gap rungs, the line is the general one
    // ("Some checks could not run."), never a list that names the wrong check (M45 review).
    missing: [],
    canBringBack: !!r.undoSafety,
    turnOpen: !!(m.teach && m.teach.checkpoint === r.checkpoint && teachOpen(m.teach)),
  };
}
export const receiptVerdict = (m: Pick<Model, "receipt" | "task" | "teach">): Verdict | null => { const f = receiptFacts(m); return f ? verdictOf(f) : null; };
/** Did an Undo put the last task's files back (not counting Put my fix back on a turn)? Bring back leaves this true too: the
 *  picture, Show me what changed and the turn belong to the files as they were checked. */
export const receiptUndone = (r: Receipt | null | undefined): boolean => !!r?.undone && !r.fixKept;

/** A What I did row as facts. "running" is not a verdict: callers check it first. */
export function historyFacts(h: Pick<HistoryItem, "status" | "proof"> & Partial<Pick<HistoryItem, "changed" | "undone" | "back">>): Facts {
  const s = h.status;
  const ended: Facts["ended"] = s === "done" ? "done" : s === "needs_you" ? "needsYou" : s === "interrupted" ? "stopped"
    : s === "error_max_budget_usd" || s === "daily_limit" || s === "error_max_turns" ? "limit" : "failed";
  const limit = s === "daily_limit" ? "daily" : s === "error_max_turns" ? "turns" : s === "error_max_budget_usd" ? "spending" : undefined;
  const failWhy = s === "not_done" ? "check" : s === "no_connection" ? "noConnection" : s === "claude_busy" ? "claudeBusy" : ended === "failed" ? "error" : undefined;
  const p = h.proof;
  // An unknown count (an older log, or a task cut short) may still have changed files: it is never said as "Nothing was
  // changed", and an Undo of it is an Undo (the engine's log marks it too).
  return { proof: p === "passed" || p === "partial" || p === "failed" ? p : "none", ended, limit, failWhy, undone: !!h.undone, back: !!h.back, changed: h.changed ?? 1, missing: [] };
}

// Let me try the next one: only for a receipt that made the same change twice, once (the engine keeps no second offer),
// and not while a turn or an undo is on the card.
export function canOfferTurn(m: Model): boolean {
  // After an engine restart (gone) the new engine has no offer to try.
  return !!m.receipt?.repeat && !m.receipt.turnTaken && !m.receipt.gone && !m.teach && !m.undo;
}

const STEP_WORD: Record<ProofLine["status"], string> = { running: S.stepRunning, passed: S.stepPassed, failed: S.stepFailed, skipped: S.stepSkipped };

// Your turn, in plain lines for the card.
export function teachLines(t: TeachState): string[] {
  // After an engine restart: the place still has the old code, and only putting the fix back or leaving it is left.
  if (t.orphan && t.stage === "ready" && t.target) return [S.teachOrphan(t.target.file, t.target.line)];
  switch (t.stage) {
    case "asking": return [S.teachAsking];
    case "refused": return [t.reason || S.teachNothing];
    case "checking": return [S.teachChecking, ...(t.steps ?? []).map((s) => `${s.label}: ${STEP_WORD[s.status] ?? s.status}`)];
    case "left": return t.target ? [S.teachLeft(t.target.file, t.target.line)] : [S.teachLeftNoPlace];
    case "restoring": return [S.teachRestoring];
    case "restored": return [S.teachRestored];
    case "ready": {
      const out: string[] = [];
      if (t.example) out.push(`${S.teachFixed} ${t.example.file}, line ${t.example.line}: "${t.example.was}" ${S.teachBecame} "${t.example.now}".`);
      if (t.target) out.push(`${S.teachYours} ${t.target.file}, line ${t.target.line}.${t.change ? ` ${S.teachChange} "${t.change.was}" ${S.teachTo} "${t.change.now}".` : ""}`);
      out.push(S.teachThenCheck);
      if (t.note) out.push(t.note);
      return out;
    }
    case "checked": {
      const r = t.result;
      if (!r) return [S.teachThenCheck];
      if (r.verdict === "passed") return [r.same ? S.teachPassedSame : S.teachPassedOther];
      if (r.verdict === "passed_with_gaps") return [S.teachPassedGaps];
      if (r.verdict === "failed") return [`${S.teachFailedLead} ${r.label ?? ""}${r.detail ? `: ${r.detail}` : ""}`.trim(), S.teachFailedHelp];
      return [S.teachNothing];
    }
  }
}
