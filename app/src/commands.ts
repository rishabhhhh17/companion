// Builds the commands the pages send. Rust checks each one again before it reaches the runner.
import type { Command } from "../../protocol/index.ts";

let n = 0;
const id = () => `ui${Date.now().toString(36)}${++n}`;
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_BUDGET_USD = 3;
export const DRIVE_BUDGET_USD = 5;
export const AGENT = "builder-1";

export const startTask = (project: string, prompt: string): Command =>
  ({ v: 1, id: id(), type: "agent.start", project, agent: AGENT, mode: "drive", prompt, model: DEFAULT_MODEL, budgetUsd: DEFAULT_BUDGET_USD });
export const answerApproval = (approval: string, allow: boolean): Command =>
  ({ v: 1, id: id(), type: "approval.resolve", approval, decision: allow ? "allow" : "deny", scope: "once" });
export const undo = (project: string, checkpoint: string): Command =>
  ({ v: 1, id: id(), type: "checkpoint.restore", project, checkpoint });
export const stopAgent = (): Command => ({ v: 1, id: id(), type: "agent.interrupt", agent: AGENT });
export const listTasks = (project: string): Command => ({ v: 1, id: id(), type: "tasks.list", project });
export const planDrive = (project: string, goal: string): Command =>
  ({ v: 1, id: id(), type: "drive.plan", project, agent: AGENT, goal, model: DEFAULT_MODEL, budgetUsd: DRIVE_BUDGET_USD });
export const approvePlan = (steps: string[]): Command => ({ v: 1, id: id(), type: "drive.approve", agent: AGENT, steps });
export const chooseLoop = (choice: "different" | "stop"): Command => ({ v: 1, id: id(), type: "loop.choose", agent: AGENT, choice });
