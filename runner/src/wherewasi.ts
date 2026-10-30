// Where was I (F21), built on the task history, the project's watches and what is waiting in the engine. Plain lines written
// by code, no model: what you were doing, what is unfinished, what changed since, and one suggested next step that the page
// shows as a button which starts something only when the person presses it. A task run off the record is never named here
// (the task log already holds only a label saying so), and what it was is never shown.
import { recapLines } from "./recap.ts";
import type { TaskRow } from "./tasklog.ts";
import { isOffRecordLabel } from "./labels.ts";
import { clip, redact } from "./redact.ts";
import { hostOf } from "./watchname.ts";

const FAILED_STATUS = new Set(["not_done", "error"]);
const STOPPED = new Set(["interrupted", "error_max_budget_usd", "error_max_turns", "no_connection", "claude_busy", "daily_limit"]);

export type WatchLite = { id: string; kind: string; target?: string; state: string; since: string; reason: string; history: { at: string; state: string }[] };
export type WhereInput = {
  rows: TaskRow[];
  /** When the person was last here (ISO), if the page knows; else the last task's start. */
  since: string | null;
  now: number;
  watches: WatchLite[];
  pendingApprovals: number;
  waitingPlans: number;
  pausedPlans: number;
  /** A question a task is still waiting to have answered: its text, or null when that task was off the record. */
  question: { text: string | null } | null;
};
export type Next = { action: "fixWatch"; watch: string } | { action: "findProblem" } | { action: "open" } | { action: "none" };

/** Time as people say it: "14:02", with the day when it is not today. */
export function clock(ms: number, now: number): string {
  const d = new Date(ms), n = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === n.toDateString() ? hm : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${hm}`;
}
export function watchName(w: Pick<WatchLite, "kind" | "target">): string {
  switch (w.kind) {
    case "site_up": return w.target ? `Your site (${hostOf(w.target)})` : "Your site";
    case "deploy_status": return "Your latest Vercel deploy";
    case "ci_status": return "Your GitHub checks";
    default: return "Your project's own checks";
  }
}
// M45: an Undo took the task back, so nothing it did is in the project, checked or not.
const UNDONE = "You undid it, so the project is back as it was before it.";
const BACK = "You undid it and then brought it back. Nothing was checked since.";
const PARTIAL = "It finished, but some checks could not run.";
const resultWords = (r: TaskRow): string => {
  if (r.status === "running") return "It is still running.";
  if (r.undone) return r.back ? BACK : UNDONE;
  if (r.status === "done" && r.proof === "passed") return "It finished and its checks passed.";
  if (r.status === "done") return r.proof === "failed" ? "It finished, but its checks did not pass." : r.proof === "partial" ? PARTIAL : "It finished.";
  if (FAILED_STATUS.has(r.status) || r.proof === "failed") return "It did not pass its checks.";
  if (r.status === "needs_you") return "It asked you something.";
  if (r.status === "interrupted") return "You stopped it.";
  if (STOPPED.has(r.status)) return "It stopped before it was done.";
  return "";
};
const plainReason = (s: string) => clip(redact(s).replace(/\s+/g, " ").trim(), 160);

export function whereWasI(i: WhereInput): { lines: string[]; next: Next } {
  const lines: string[] = [];
  const visible = i.rows.filter((r) => !isOffRecordLabel(r.label)).sort((a, b) => b.id - a.id);
  const last = visible[0];

  // 1. what you were doing
  if (last) lines.push(`You were working on: ${last.label}. ${resultWords(last)}`.trim());
  else lines.push(i.rows.length ? "Your last tasks here were off the record, so nothing is shown about them." : "You have not run a task in this project yet.");

  // 2. what is unfinished
  const open: string[] = [];
  const failing = i.watches.filter((w) => w.state === "failing");
  for (const w of failing) open.push(`${watchName(w)} has been failing since ${clock(Date.parse(w.since), i.now)}: ${plainReason(w.reason)}`);
  const lastFailed = !!last && last.status !== "running" && !(last.undone && !last.back) && (FAILED_STATUS.has(last.status) || last.proof === "failed" || (last.status === "done" && last.proof === "failed"));
  if (lastFailed) open.push("The last task did not pass its checks.");
  if (i.question) open.push(i.question.text ? `A task is waiting for your answer: "${clip(redact(i.question.text).replace(/\s+/g, " ").trim(), 140)}"` : "A task is waiting for your answer.");
  if (i.waitingPlans > 0) open.push(i.waitingPlans === 1 ? "A plan is waiting for your approval." : `${i.waitingPlans} plans are waiting for your approval.`);
  if (i.pausedPlans > 0) open.push(i.pausedPlans === 1 ? "A plan is paused, waiting for you to carry on." : `${i.pausedPlans} plans are paused, waiting for you to carry on.`);
  if (i.pendingApprovals > 0) open.push(i.pendingApprovals === 1 ? "A task needs your yes or no." : `${i.pendingApprovals} tasks need your yes or no.`);
  if (open.length === 0) lines.push("Nothing is unfinished.");
  else for (const o of open) lines.push(`Not finished: ${o}`);

  // 3. what changed since: the time the person gave, else the end of the last task (watches only: that task is not "since")
  const given = i.since ? Date.parse(i.since) : NaN;
  const sinceMs = !Number.isNaN(given) ? given : last ? Date.parse(last.endedAt ?? last.startedAt) : NaN;
  if (!Number.isNaN(given)) {
    const away = recapLines(i.rows, new Date(given).toISOString(), 0)[1];
    if (away) lines.push(away.replace(/^While you were away: /, "Since then: "));
  }
  if (!Number.isNaN(sinceMs)) {
    for (const w of i.watches) {
      const moves = w.history.filter((h) => Date.parse(h.at) > sinceMs && (h.state === "failing" || h.state === "ok")).slice(-2);
      const name = watchName(w);
      if (moves.length) lines.push(`Since then: ${name.charAt(0).toLowerCase()}${name.slice(1)} ${moves.map((m) => `${m.state === "failing" ? "started failing" : "was fine again"} at ${clock(Date.parse(m.at), i.now)}`).join(", then ")}.`);
    }
  }

  // 4. one next step, started only by a press
  let next: Next = { action: "none" };
  if (failing.length) next = { action: "fixWatch", watch: failing[0].id };
  else if (lastFailed) next = { action: "findProblem" };
  else if (i.question || i.waitingPlans || i.pausedPlans || i.pendingApprovals) next = { action: "open" };
  return { lines, next };
}
