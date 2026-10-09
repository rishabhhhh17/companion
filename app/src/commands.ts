// Builds the commands the pages send. Rust checks each one again before it reaches the runner.
import type { Command } from "../../protocol/index.ts";

let n = 0;
const id = () => `ui${Date.now().toString(36)}${++n}`;
export const DEFAULT_MODEL = "claude-sonnet-5-5";
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
export const DIAGNOSE_MODEL = "claude-opus-5-5";
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
