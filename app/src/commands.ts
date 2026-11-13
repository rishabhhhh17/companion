// Builds the commands the pages send. Rust checks each one again before it reaches the runner.
import type { DoneTool } from "./doneSignal.ts";
import { MAX_REQUEST_CHARS, type Command, type NewFolderKind, type Problem, type ShellCommand, type WatchKind } from "../../protocol/index.ts";
import { fixFoundPrompt, PRACTICE_BUDGET_USD } from "../../runner/src/fixfound.ts";
// Model ids live in one place, with the runner's (T10).
import { MODELS } from "../../runner/src/models.ts";
// A follow up is cut to the same length the runner keeps.
import { MAX_FOLLOW_UP_CHARS } from "../../runner/src/followup.ts";
import { defaultOf, validateKey } from "../../protocol/settings.ts";
import { setting } from "./settingsStore.ts";
import { modelFor } from "./modelChoice.ts";
import { S } from "./strings.ts";

let n = 0;
const id = () => `ui${Date.now().toString(36)}${++n}`;
export const DEFAULT_MODEL = MODELS.agent;
// The usual budgets, from the settings registry: $3 a task, $5 a Drive plan (and a Rescue, which had the same before).
export const DEFAULT_BUDGET_USD = Number(defaultOf("budget.task"));
export const DRIVE_BUDGET_USD = Number(defaultOf("budget.plan"));
export const AGENT = "builder-1";
// Spending (area 1 of the settings plan): what each kind of work may spend, read from Settings as the work starts. A value
// the rules would refuse is never sent: the usual one is. Whatever is sent, the engine never lets it go above what is left
// of the day's limit.
export function budgetFor(key: "budget.task" | "budget.plan" | "budget.rescue" | "budget.research"): number {
  const c = validateKey(key, setting(key));
  return c.ok ? (c.value as number) : Number(defaultOf(key));
}
// The models (model.work, model.rescue), by option, read as the work starts (modelChoice.ts).
const workModel = (): string => modelFor("model.work", setting("model.work"));
const rescueModel = (): string => modelFor("model.rescue", setting("model.rescue"));

// added: files and pictures from the ask box (attachfiles.ts), only when there are some. The engine checks them again.
export const startTask = (project: string, prompt: string, offTheRecord = false, added?: { files: { name: string; text: string }[]; images: { name: string; mediaType: "image/png" | "image/jpeg"; base64: string }[] }): Command =>
  ({ v: 1, id: id(), type: "agent.start", project, agent: AGENT, mode: "drive", prompt, model: workModel(), budgetUsd: budgetFor("budget.task"), ...(offTheRecord ? { offTheRecord: true } : {}),
    ...(added?.files.length ? { files: added.files } : {}), ...(added?.images.length ? { images: added.images } : {}) });
// Fixes it with you: a follow up on the last task (what is still wrong), or Try again (the same request, with what failed).
// Each one is a new checked task in the same project; the runner refuses it for any other.
export const followUp = (project: string, text: string): Command | null => {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? { v: 1, id: id(), type: "agent.send", project, agent: AGENT, text: Array.from(t).slice(0, MAX_FOLLOW_UP_CHARS).join("") } : null;
};
export const retryTask = (project: string): Command => ({ v: 1, id: id(), type: "agent.send", project, agent: AGENT, retry: true });
// M85: scope "project" only after the page saved the card's own house rule line (Always allow for this project).
export const answerApproval = (approval: string, allow: boolean, scope: "once" | "project" = "once"): Command =>
  ({ v: 1, id: id(), type: "approval.resolve", approval, decision: allow ? "allow" : "deny", scope: allow ? scope : "once" });
// force: only for "Put my fix back" in Your turn, where the person's own attempt is meant to be replaced (it stays in the safety copy).
export const undo = (project: string, checkpoint: string, force = false): Command =>
  ({ v: 1, id: id(), type: "checkpoint.restore", project, checkpoint, ...(force ? { force: true } : {}) });
// "Put those back too": after Undo left some of the person's own files alone, a second yes puts the old versions back over them.
export const undoPutBack = (project: string, checkpoint: string, files?: string[]): Command =>
  ({ v: 1, id: id(), type: "checkpoint.putBack", project, checkpoint, confirm: true, ...(files?.length ? { files } : {}) });
export const stopAgent = (): Command => ({ v: 1, id: id(), type: "agent.interrupt", agent: AGENT });
// The person put aside what the agent was waiting on them for (Cancel on a plan, Close on an answer): it rests again, in
// every window, only when nothing runs for it. It never stops anything (runner/src/agent.ts release).
export const releaseAgent = (agent: string = AGENT): Command => ({ v: 1, id: id(), type: "agent.interrupt", agent, release: true });
export const listTasks = (project: string): Command => ({ v: 1, id: id(), type: "tasks.list", project });
export const planDrive = (project: string, goal: string, offTheRecord = false): Command =>
  ({ v: 1, id: id(), type: "drive.plan", project, agent: AGENT, goal, model: workModel(), budgetUsd: budgetFor("budget.plan"), ...(offTheRecord ? { offTheRecord: true } : {}) });
export const approvePlan = (steps: string[]): Command => ({ v: 1, id: id(), type: "drive.approve", agent: AGENT, steps });
export const chooseLoop = (choice: "different" | "stop" | "research" | "lastWorking"): Command => ({ v: 1, id: id(), type: "loop.choose", agent: AGENT, choice });
// M58: star or name a save point (the shadow store's own notes, never the project, never git).
export const markSave = (project: string, checkpoint: string, m: { star?: boolean; name?: string }): Command => ({ v: 1, id: id(), type: "checkpoint.mark", project, checkpoint, ...m });
export const pauseDrive = (): Command => ({ v: 1, id: id(), type: "drive.pause", agent: AGENT, reason: "you" });
export const resumeDrive = (): Command => ({ v: 1, id: id(), type: "drive.resume", agent: AGENT });
export const DIAGNOSE_MODEL = MODELS.diagnose;
// Rescue's budget covers looking at the project and the plan that fixes it (the plan's steps share what is left of it).
// offTheRecord: the Off the record box was ticked (it covers Rescue and Look up too).
export const diagnose = (project: string, offTheRecord = false): Command => ({ v: 1, id: id(), type: "rescue.diagnose", project, agent: AGENT, model: rescueModel(), budgetUsd: budgetFor("budget.rescue"), ...(offTheRecord ? { offTheRecord: true } : {}) });
export const askResearch = (project: string, question: string, offTheRecord = false): Command | null => {
  const q = question.replace(/\s+/g, " ").trim();
  return q ? { v: 1, id: id(), type: "research.ask", project, agent: AGENT, question: q, model: workModel(), budgetUsd: budgetFor("budget.research"), ...(offTheRecord ? { offTheRecord: true } : {}) } : null;
};
// Make something with no project open, or in a new folder (F23, M14 Part 1): sent to the shell (start_in_new_folder), never
// to the engine. The shell makes a new folder named after the words, opens it as the project and starts an ordinary plan
// (build) or Look it up (research) there, with this model and budget.
export const newFolderTask = (kind: NewFolderKind, words: string, offTheRecord = false): ShellCommand | null => {
  const request = Array.from(words.trim()).slice(0, MAX_REQUEST_CHARS).join("").trim();
  return request ? { v: 1, id: id(), type: "project.new", kind, request, agent: AGENT, model: workModel(), budgetUsd: budgetFor(kind === "build" ? "budget.plan" : "budget.research"), ...(offTheRecord ? { offTheRecord: true } : {}) } : null;
};
export const checkShip =(project: string, o: { runChecks?: boolean; confirm?: string[] } = {}): Command =>
  ({ v: 1, id: id(), type: "ship.check", project, ...(o.runChecks ? { runChecks: true } : {}), ...(o.confirm?.length ? { confirm: o.confirm } : {}) });

// Memory: what Companion knows, shown on a page the person can change.
export const listMemory = (project: string): Command => ({ v: 1, id: id(), type: "memory.list", project });
export const forgetLine = (project: string, scope: "project" | "profile", line: string): Command => ({ v: 1, id: id(), type: "memory.forget", project, scope, line });
export const editLine = (project: string, scope: "project" | "profile", line: string, text: string): Command => ({ v: 1, id: id(), type: "memory.edit", project, scope, line, text });
export const pauseMemory = (project: string, paused: boolean): Command => ({ v: 1, id: id(), type: "memory.pause", project, paused });
export const eraseMemory = (project: string, scope: "project" | "profile"): Command => ({ v: 1, id: id(), type: "memory.erase", project, scope });
export const exportMemory = (project: string): Command => ({ v: 1, id: id(), type: "memory.export", project });
// M78: put back a notes export the person chose, after their yes on the page (the engine refuses it without confirm).
export const restoreMemory = (project: string, text: string): Command => ({ v: 1, id: id(), type: "memory.restore", project, text, confirm: true });
// M79: the weekly summary, on the press of History's "This week" row only.
export const showWeek = (project: string): Command => ({ v: 1, id: id(), type: "week.show", project });
export const answerAgents = (project: string, answer: "yes" | "no" | "remove"): Command => ({ v: 1, id: id(), type: "memory.agents", project, answer });
export const askRecap = (project: string, since: string): Command => ({ v: 1, id: id(), type: "recap.ask", project, since });
// Watch routines and Where was I (F21). Each names the project, so the shell holds it to the folder the person chose.
export const watchAdd = (project: string, kind: WatchKind, schedule: string, target?: string): Command =>
  ({ v: 1, id: id(), type: "watch.add", project, kind, schedule, ...(kind === "site_up" ? { target: (target ?? "").trim() } : {}) });
export const watchList = (project: string): Command => ({ v: 1, id: id(), type: "watch.list", project });
export const watchRemove = (project: string, watch: string): Command => ({ v: 1, id: id(), type: "watch.remove", project, watch });
export const watchPause = (project: string, watch: string, paused: boolean): Command => ({ v: 1, id: id(), type: "watch.pause", project, watch, paused });
export const watchCheck = (project: string, watch: string): Command => ({ v: 1, id: id(), type: "watch.check", project, watch });
// Fix it on a failed watch: asks for the evidence (read only); the page starts the task when it comes (fixWatch), never the engine.
// M52 (F30): the review of another AI tool's changes. Each names the project and the batch the card shows (the shell holds
// them to the chosen folder). Fix it starts an ordinary task in drive mode, with its safety copy and Undo, counted as a fix.
export const reviewNow = (project: string, batch?: string, proof?: boolean): Command => ({ v: 1, id: id(), type: "review.now", project, ...(batch ? { batch } : {}), ...(proof ? { proof: true } : {}) });
/** how (M57 feature 1): Looks fine, or closed after Copy for my AI, for the review's row in History. None for Skip this one. */
export const reviewDismiss = (project: string, batch: string, how?: "looksFine" | "sentBack" | "quiet"): Command => ({ v: 1, id: id(), type: "review.dismiss", project, batch, ...(how ? { how } : {}) });
export const reviewFix = (project: string, batch: string): Command => ({ v: 1, id: id(), type: "review.fix", project, batch, agent: AGENT, model: workModel(), budgetUsd: budgetFor("budget.task") });
export const watchFix = (project: string, watch: string): Command => ({ v: 1, id: id(), type: "watch.fix", project, watch });
export const whereWasI = (project: string, since?: string): Command => ({ v: 1, id: id(), type: "where.was.i", project, ...(since ? { since } : {}) });
export const shipPreview = (project: string): Command => ({ v: 1, id: id(), type: "ship.preview", project });
export const shipLive = (project: string, url: string): Command => ({ v: 1, id: id(), type: "ship.live", project, url, confirm: true });
export const shipRollback = (project: string): Command => ({ v: 1, id: id(), type: "ship.rollback", project, confirm: true });
// M58 (UI 13): Sign in to Vercel, on the person's press: their own login as a visible step (runner/src/ship/signin.ts).
export const shipSignIn = (project: string): Command => ({ v: 1, id: id(), type: "ship.signIn", project });
/** Ends a Vercel sign in that is still waiting (the person pressed Stop signing in, or Close). */
export const shipSignInStop = (project: string): Command => ({ v: 1, id: id(), type: "ship.signIn", project, stop: true });
export const addMemory = (project: string, scope: "project" | "profile", text: string, source: string): Command => ({ v: 1, id: id(), type: "memory.add", project, scope, text, source });
export const checkMac = (): Command => ({ v: 1, id: id(), type: "doctor.check" });
// Point at the problem: check the project as it is (no Claude, nothing changed) and say where it fails. `first`: the first
// run's first check of the real project (M49): the engine saves a safety copy first and asks before installing anything.
export const findProblem = (project: string, first = false): Command => ({ v: 1, id: id(), type: "problem.find", project, agent: AGENT, ...(first ? { first: true } : {}) });
// About this project, and installing its packages when the person presses the button.
export const inspectProject = (project: string): Command => ({ v: 1, id: id(), type: "project.inspect", project });
export const installPackages = (project: string): Command => ({ v: 1, id: id(), type: "project.install", project });
// Fix it after Companion's own check found the problem: the practice projects' Fix it with me, and Point at the problem's
// Fix it when Settings says one small checked fix (point.fixWith). One shipped request (runner/src/fixfound.ts, which the
// coding eval measures) on the record, so it gets the snapshot, the safety and house rules, the proof, Explain and a place
// in What I did like any task. A practice's fix names its practice (echoed on its checkpoint and receipt, so only its own
// receipt finishes it) and keeps to its own small cap on the usual model, whatever Settings say, so it costs cents.
export const fixFound = (project: string, found: { label?: string; detail?: string; problem?: Problem }, o: { practice?: string } = {}): Command => {
  const c = startTask(project, fixFoundPrompt(found)) as Extract<Command, { type: "agent.start" }>;
  return o.practice ? { ...c, model: DEFAULT_MODEL, budgetUsd: PRACTICE_BUDGET_USD, practice: o.practice } : c;
};
// Draw it for me: why did this break, as a small diagram (from the project and the failing place, never the screen).
export const askDiagram = (project: string, question: string, problem?: { kind?: string; file?: string; line?: number; message?: string }, style?: "sketch"): Command =>
  ({ v: 1, id: id(), type: "diagram.ask", ...(style ? { style } : {}), project, question: question.replace(/\s+/g, " ").trim().slice(0, 300) || "Why did this break?", ...(problem ? { problem: { ...(problem.kind ? { kind: problem.kind } : {}), ...(problem.file ? { file: problem.file } : {}), ...(typeof problem.line === "number" ? { line: problem.line } : {}), ...(problem.message ? { message: problem.message } : {}) } } : {}) });

// Show me what changed: the first changed line, opened and rung the same way Point at the problem does (point_problem in
// Rust: the editor at that line, the light on first, a solid ring only where the line is confirmed on screen).
export type ChangeAt = { file: string; line: number; lineText: string };
export const pointChange = (project: string, at: ChangeAt, message: string): { project: string; problem: { kind: "line"; file: string; line: number; lineText: string; message: string; from: "change" } } =>
  ({ project, problem: { kind: "line", file: at.file, line: at.line, lineText: at.lineText, message, from: "change" } });
// Your turn: the person makes the second of two identical changes, then asks for the project's checks on it.
export const tryNextOne = (project: string, checkpoint: string): Command => ({ v: 1, id: id(), type: "teach.try", project, checkpoint });
export const checkMyChange = (project: string, checkpoint: string): Command => ({ v: 1, id: id(), type: "teach.check", project, agent: AGENT, checkpoint });

// Guided lessons: the runner keeps the place and checks each step; the app draws the ring and notices the click.
/** The lesson the runner makes from the project's own missing settings (runner/src/lessongen.ts SETTINGS_LESSON). */
export const SETTINGS_LESSON_ID = "from-project-settings";
/** The lesson about the project's settings on Vercel (runner/src/lessongen.ts VERCEL_LESSON). */
export const VERCEL_LESSON_ID = "from-project-vercel";
export const walkList = (project: string): Command => ({ v: 1, id: id(), type: "walk.list", project });
export const walkStart = (project: string, lesson: string, fresh = false): Command => ({ v: 1, id: id(), type: "walk.start", project, lesson, ...(fresh ? { fresh: true } : {}) });
// clicked and done_for_you: the ring. pressed: the person's own "I did it" on the card, the only one that can count a step
// the project proves as not working (a ring click comes before the paste and the save).
export const walkActed = (walk: string, how: "clicked" | "done_for_you" | "pressed", index?: number): Command => ({ v: 1, id: id(), type: "walk.acted", walk, how, ...(index !== undefined ? { index } : {}) });
export const walkAnswer = (walk: string, worked: boolean, index?: number): Command => ({ v: 1, id: id(), type: "walk.answer", walk, worked, ...(index !== undefined ? { index } : {}) });
export const walkSkip = (walk: string, index?: number): Command => ({ v: 1, id: id(), type: "walk.skip", walk, ...(index !== undefined ? { index } : {}) });
export const walkStop = (walk: string): Command => ({ v: 1, id: id(), type: "walk.stop", walk });

// Beta numbers: counts on this Mac, off unless turned on. The runner accepts only its fixed list of names.
export const metricsSet = (enabled: boolean): Command => ({ v: 1, id: id(), type: "metrics.set", enabled });
export const metricsNote = (name: string): Command => ({ v: 1, id: id(), type: "metrics.note", name });
export const metricsShow = (): Command => ({ v: 1, id: id(), type: "metrics.show" });
export const metricsErase = (): Command => ({ v: 1, id: id(), type: "metrics.erase" });

// The browser check (F14): ask whether it is set up, and download it once when the person presses the button.
export const checkBrowser = (): Command => ({ v: 1, id: id(), type: "browser.check" });
export const getBrowser = (): Command => ({ v: 1, id: id(), type: "browser.install" });
// The daily spending limit in Settings: today's spend for this project against the limit, and changing the limit.
export const showSpending = (project: string): Command => ({ v: 1, id: id(), type: "spending.show", project });
export const setSpendingLimit = (project: string, limitUsd: number): Command => ({ v: 1, id: id(), type: "spending.set", project, limitUsd });

// Which task broke it: check earlier saved versions in a private copy (never the project), then undo just that task on a yes.
export const findBreakingTask = (project: string): Command => ({ v: 1, id: id(), type: "bisect.start", project, agent: AGENT });
export const undoOneTask = (project: string, checkpoint: string): Command => ({ v: 1, id: id(), type: "bisect.undo", project, checkpoint, confirm: true });
// The error explainer's Fix it: a normal task (snapshot, safety rules, proof) with the error, secrets already hidden, as evidence.
// It is off the record, because the error is text read from another app (rule 5): no saved conversation, nothing learned
// into memory, a plain label in the history, and no Explain or saved picture afterwards.
export const ERROR_FIX_PROMPT = "Fix this error. Find the cause and make the smallest change that fixes it, then check that it works. Do not weaken or delete tests.";
export const fixError = (project: string, evidence: string, where?: { kind: string; file?: string; line?: number }): Command =>
  startTask(project, `${ERROR_FIX_PROMPT}\n\nThe error, as I saw it:\n${evidence.slice(0, 3000)}${where?.kind === "line" && where.file && where.line ? `\n\nIt points at ${where.file}, line ${where.line}.` : ""}`, true);

// The task Fix it starts from a failed watch: an ordinary one (snapshot, safety rules, proof, Undo). The evidence came from
// the person's own site and tools, never their screen, so it is on the record like any task they start.
export const fixWatch = (project: string, what: string, evidence: string): Command => startTask(project, S.watch.fixPrompt(what, evidence));

/** The stand in project for lessons that need none (see runner/src/walk.ts). */
export const NO_PROJECT = "no-project";

// The zero cost warm up (runner/src/warm.ts): the engine reads the bundled Claude binary through once so the first task
// starts sooner. Nothing is run, sent or spent, and it names no folder.
export const warmEngine = (): Command => ({ v: 1, id: id(), type: "engine.warm" });
// M58 (feature 9): the key practice, on the person's press: the practice's pretend AI writes its made up key into the copy
// (the review then looks at once, by its rules alone), or the fixed fix moves it to .env.local. No model, no cost; the
// shell lets it through only for that practice's own copy.
export const practiceKey = (project: string, step: "write" | "fix"): Command => ({ v: 1, id: id(), type: "practice.key", project, step });
// M75: the other tool's done signal (the add only after the card's yes), the cost pause's answer and the sign in handover's.
export const showDoneSignal = (project: string): Command => ({ v: 1, id: id(), type: "donesignal.show", project });
export const addDoneSignal = (project: string, tool: DoneTool, hook: "done" | "guard" | "waiting" | "start" = "done"): Command => ({ v: 1, id: id(), type: "donesignal.add", project, tool, confirm: true, ...(hook !== "done" ? { hook } : {}) });
export const removeDoneSignal = (project: string, tool: DoneTool, hook: "done" | "guard" | "waiting" | "start" = "done"): Command => ({ v: 1, id: id(), type: "donesignal.remove", project, tool, ...(hook !== "done" ? { hook } : {}) });
export const chooseCost = (agent: string, choice: "keep" | "stop" | "undo"): Command => ({ v: 1, id: id(), type: "cost.choose", agent, choice });
export const answerSignIn = (agent: string, choice: "open" | "continue" | "skip" | "getBrowser"): Command => ({ v: 1, id: id(), type: "proof.signIn", agent, choice });
