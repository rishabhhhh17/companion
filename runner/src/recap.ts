// Where was I: three plain lines when someone comes back, written by code from Companion's own task history only.
// Free, exact, and it cannot invent anything.
import type { TaskRow } from "./tasklog.ts";
import { isOffRecordLabel } from "./labels.ts";

// Stopped before the work was done, for a reason that is not a failed check: the person stopped it, a limit, no connection
// to Claude, or Claude busy.
const STOPPED = new Set(["interrupted", "error_max_budget_usd", "error_max_turns", "no_connection", "claude_busy"]);
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function recapLines(rows: TaskRow[], since: string, pendingApprovals: number): string[] {
  const visible = rows.filter((r) => !isOffRecordLabel(r.label));
  const startedAway = visible.filter((r) => r.startedAt >= since);
  if (startedAway.length === 0) return [];
  const before = visible.filter((r) => r.startedAt < since).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
  const first = startedAway.slice().sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))[0];
  const lines: string[] = [];
  const focus = before ?? first;
  lines.push(`You were working on: ${focus.label}`);
  const running = startedAway.filter((r) => r.status === "running");
  const ended = startedAway.filter((r) => r.status !== "running");
  const checked = ended.filter((r) => r.status === "done" && r.proof === "passed").length;
  const notDone = ended.filter((r) => r.status === "not_done" || r.status === "error" || r.proof === "failed").length;
  const stopped = ended.filter((r) => STOPPED.has(r.status)).length;
  // A task that ended by asking a question still waits for the person's answer, unless a newer task of that agent in that
  // project came after it (the answer was sent).
  const asking = ended.filter((r) => r.status === "needs_you" && !visible.some((o) => o.agent === r.agent && o.project === r.project && o.id > r.id)).length;
  const parts = [`${n(ended.length, "task", "tasks")} ended`];
  if (checked) parts.push(`${checked} checked`);
  if (notDone) parts.push(`${notDone} not done`);
  if (stopped) parts.push(`${stopped} stopped`);
  if (asking) parts.push(`${asking} waiting for your answer`);
  if (running.length) parts.push(`${running.length} still running`);
  lines.push(`While you were away: ${ended.length ? parts.join(", ") : `${running.length} still running`}`);
  const waiting = Math.max(0, pendingApprovals) + asking;
  lines.push(waiting > 0 ? `${n(waiting, "thing is", "things are")} waiting for you` : "Nothing is waiting for you");
  return lines;
}
