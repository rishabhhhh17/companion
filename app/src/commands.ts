// Builds the commands the pages send. Rust checks each one again before it reaches the runner.
import type { Command } from "../../protocol/index.ts";
// Model ids live in one place, with the runner's (T10).
import { MODELS } from "../../runner/src/models.ts";

let n = 0;
const id = () => `ui${Date.now().toString(36)}${++n}`;
export const DEFAULT_MODEL = MODELS.agent;
export const DEFAULT_BUDGET_USD = 3;
export const DRIVE_BUDGET_USD = 5;
export const AGENT = "builder-1";

export const startTask = (project: string, prompt: string, offTheRecord = false): Command =>
  ({ v: 1, id: id(), type: "agent.start", project, agent: AGENT, mode: "drive", prompt, model: DEFAULT_MODEL, budgetUsd: DEFAULT_BUDGET_USD, ...(offTheRecord ? { offTheRecord: true } : {}) });
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
export const setExplain = (project: string, enabled: boolean): Command => ({ v: 1, id: id(), type: "explain.set", project, enabled });
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

// Guided lessons: the runner keeps the place and checks each step; the app draws the ring and notices the click.
export const walkList = (project: string): Command => ({ v: 1, id: id(), type: "walk.list", project });
export const walkStart = (project: string, lesson: string, fresh = false): Command => ({ v: 1, id: id(), type: "walk.start", project, lesson, ...(fresh ? { fresh: true } : {}) });
export const walkActed = (walk: string, how: "clicked" | "done_for_you", index?: number): Command => ({ v: 1, id: id(), type: "walk.acted", walk, how, ...(index !== undefined ? { index } : {}) });
export const walkAnswer = (walk: string, worked: boolean, index?: number): Command => ({ v: 1, id: id(), type: "walk.answer", walk, worked, ...(index !== undefined ? { index } : {}) });
export const walkSkip = (walk: string, index?: number): Command => ({ v: 1, id: id(), type: "walk.skip", walk, ...(index !== undefined ? { index } : {}) });
export const walkStop = (walk: string): Command => ({ v: 1, id: id(), type: "walk.stop", walk });

// Beta numbers: counts on this Mac, off unless turned on. The runner accepts only its fixed list of names.
export const metricsSet = (enabled: boolean): Command => ({ v: 1, id: id(), type: "metrics.set", enabled });
export const metricsNote = (name: string): Command => ({ v: 1, id: id(), type: "metrics.note", name });
export const metricsShow = (): Command => ({ v: 1, id: id(), type: "metrics.show" });
export const metricsErase = (): Command => ({ v: 1, id: id(), type: "metrics.erase" });

// The daily spending limit in Settings: today's spend for this project against the limit, and changing the limit.
export const showSpending = (project: string): Command => ({ v: 1, id: id(), type: "spending.show", project });
export const setSpendingLimit = (project: string, limitUsd: number): Command => ({ v: 1, id: id(), type: "spending.set", project, limitUsd });

/** The stand in project for lessons that need none (see runner/src/walk.ts). */
export const NO_PROJECT = "no-project";
