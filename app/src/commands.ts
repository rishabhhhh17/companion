// Builds the commands the pages send. Rust checks each one again before it reaches the runner.
import type { Command } from "../../protocol/index.ts";
// Model ids live in one place, with the runner's (T10).
import { MODELS } from "../../runner/src/models.ts";
// A follow up is cut to the same length the runner keeps.
import { MAX_FOLLOW_UP_CHARS } from "../../runner/src/followup.ts";

let n = 0;
const id = () => `ui${Date.now().toString(36)}${++n}`;
export const DEFAULT_MODEL = MODELS.agent;
export const DEFAULT_BUDGET_USD = 3;
export const DRIVE_BUDGET_USD = 5;
export const AGENT = "builder-1";

// added: files and pictures from the ask box (attachfiles.ts), only when there are some. The engine checks them again.
export const startTask = (project: string, prompt: string, offTheRecord = false, added?: { files: { name: string; text: string }[]; images: { name: string; mediaType: "image/png" | "image/jpeg"; base64: string }[] }): Command =>
  ({ v: 1, id: id(), type: "agent.start", project, agent: AGENT, mode: "drive", prompt, model: DEFAULT_MODEL, budgetUsd: DEFAULT_BUDGET_USD, ...(offTheRecord ? { offTheRecord: true } : {}),
    ...(added?.files.length ? { files: added.files } : {}), ...(added?.images.length ? { images: added.images } : {}) });
// Fixes it with you: a follow up on the last task (what is still wrong), or Try again (the same request, with what failed).
// Each one is a new checked task in the same project; the runner refuses it for any other.
export const followUp = (project: string, text: string): Command | null => {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? { v: 1, id: id(), type: "agent.send", project, agent: AGENT, text: Array.from(t).slice(0, MAX_FOLLOW_UP_CHARS).join("") } : null;
};
export const retryTask = (project: string): Command => ({ v: 1, id: id(), type: "agent.send", project, agent: AGENT, retry: true });
export const answerApproval = (approval: string, allow: boolean): Command =>
  ({ v: 1, id: id(), type: "approval.resolve", approval, decision: allow ? "allow" : "deny", scope: "once" });
export const undo = (project: string, checkpoint: string): Command =>
  ({ v: 1, id: id(), type: "checkpoint.restore", project, checkpoint });
export const stopAgent = (): Command => ({ v: 1, id: id(), type: "agent.interrupt", agent: AGENT });
export const listTasks = (project: string): Command => ({ v: 1, id: id(), type: "tasks.list", project });
export const planDrive = (project: string, goal: string, offTheRecord = false): Command =>
  ({ v: 1, id: id(), type: "drive.plan", project, agent: AGENT, goal, model: DEFAULT_MODEL, budgetUsd: DRIVE_BUDGET_USD, ...(offTheRecord ? { offTheRecord: true } : {}) });
export const approvePlan = (steps: string[]): Command => ({ v: 1, id: id(), type: "drive.approve", agent: AGENT, steps });
export const chooseLoop = (choice: "different" | "stop"): Command => ({ v: 1, id: id(), type: "loop.choose", agent: AGENT, choice });
export const pauseDrive = (): Command => ({ v: 1, id: id(), type: "drive.pause", agent: AGENT, reason: "you" });
export const resumeDrive = (): Command => ({ v: 1, id: id(), type: "drive.resume", agent: AGENT });
export const DIAGNOSE_MODEL = MODELS.diagnose;
export const diagnose = (project: string): Command => ({ v: 1, id: id(), type: "rescue.diagnose", project, agent: AGENT, model: DIAGNOSE_MODEL, budgetUsd: DRIVE_BUDGET_USD });
export const askResearch = (project: string, question: string): Command | null => {
  const q = question.replace(/\s+/g, " ").trim();
  return q ? { v: 1, id: id(), type: "research.ask", project, agent: AGENT, question: q, model: DEFAULT_MODEL, budgetUsd: 2 } : null;
};
export const checkShip = (project: string, o: { runChecks?: boolean; confirm?: string[] } = {}): Command =>
  ({ v: 1, id: id(), type: "ship.check", project, ...(o.runChecks ? { runChecks: true } : {}), ...(o.confirm?.length ? { confirm: o.confirm } : {}) });

// Memory: what Companion knows, shown on a page the person can change.
export const listMemory = (project: string): Command => ({ v: 1, id: id(), type: "memory.list", project });
export const forgetLine = (project: string, scope: "project" | "profile", line: string): Command => ({ v: 1, id: id(), type: "memory.forget", project, scope, line });
export const editLine = (project: string, scope: "project" | "profile", line: string, text: string): Command => ({ v: 1, id: id(), type: "memory.edit", project, scope, line, text });
export const pauseMemory = (project: string, paused: boolean): Command => ({ v: 1, id: id(), type: "memory.pause", project, paused });
export const eraseMemory = (project: string, scope: "project" | "profile"): Command => ({ v: 1, id: id(), type: "memory.erase", project, scope });
export const exportMemory = (project: string): Command => ({ v: 1, id: id(), type: "memory.export", project });
export const answerAgents = (project: string, answer: "yes" | "no" | "remove"): Command => ({ v: 1, id: id(), type: "memory.agents", project, answer });
export const askRecap = (project: string, since: string): Command => ({ v: 1, id: id(), type: "recap.ask", project, since });
export const shipPreview = (project: string): Command => ({ v: 1, id: id(), type: "ship.preview", project });
export const shipLive = (project: string, url: string): Command => ({ v: 1, id: id(), type: "ship.live", project, url, confirm: true });
export const shipRollback = (project: string): Command => ({ v: 1, id: id(), type: "ship.rollback", project, confirm: true });
export const addMemory = (project: string, scope: "project" | "profile", text: string, source: string): Command => ({ v: 1, id: id(), type: "memory.add", project, scope, text, source });
export const checkMac = (): Command => ({ v: 1, id: id(), type: "doctor.check" });
// Point at the problem: check the project as it is (no Claude, nothing changed) and say where it fails.
export const findProblem = (project: string): Command => ({ v: 1, id: id(), type: "problem.find", project, agent: AGENT });
// About this project, and installing its packages when the person presses the button.
export const inspectProject = (project: string): Command => ({ v: 1, id: id(), type: "project.inspect", project });
export const installPackages = (project: string): Command => ({ v: 1, id: id(), type: "project.install", project });
// The practice project's fix: a short fixed request on a small budget, so the first real use costs cents.
export const PRACTICE_PROMPT = "The tests in this project fail. Find the cause and fix it with the smallest change. Do not change the tests.";
/** The start of the practice task's label, so only its own receipt can finish the practice. */
export const PRACTICE_LABEL = "The tests in this project fail";
export const startPractice = (project: string): Command =>
  ({ v: 1, id: id(), type: "agent.start", project, agent: AGENT, mode: "drive", prompt: PRACTICE_PROMPT, model: DEFAULT_MODEL, budgetUsd: 0.6 });
// Draw it for me: why did this break, as a small diagram (from the project and the failing place, never the screen).
export const askDiagram = (project: string, question: string, problem?: { kind?: string; file?: string; line?: number; message?: string }): Command =>
  ({ v: 1, id: id(), type: "diagram.ask", project, question: question.replace(/\s+/g, " ").trim().slice(0, 300) || "Why did this break?", ...(problem ? { problem: { ...(problem.kind ? { kind: problem.kind } : {}), ...(problem.file ? { file: problem.file } : {}), ...(typeof problem.line === "number" ? { line: problem.line } : {}), ...(problem.message ? { message: problem.message } : {}) } } : {}) });

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

/** The stand in project for lessons that need none (see runner/src/walk.ts). */
export const NO_PROJECT = "no-project";

// The zero cost warm up (runner/src/warm.ts): the engine reads the bundled Claude binary through once so the first task
// starts sooner. Nothing is run, sent or spent, and it names no folder.
export const warmEngine = (): Command => ({ v: 1, id: id(), type: "engine.warm" });
