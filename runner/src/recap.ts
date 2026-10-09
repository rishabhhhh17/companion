// Where was I: three plain lines when someone comes back, written by code from Companion's own task history only.
// Free, exact, and it cannot invent anything.
import type { TaskRow } from "./tasklog.ts";

const OFF = "Off the record task";
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function recapLines(rows: TaskRow[], since: string, pendingApprovals: number): string[] {
  const visible = rows.filter((r) => r.label !== OFF);
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
  const notDone = ended.filter((r) => r.status === "not_done" || r.proof === "failed").length;
  const stopped = ended.filter((r) => r.status === "interrupted" || r.status === "error_max_budget_usd").length;
  const parts = [`${n(ended.length, "task", "tasks")} ended`];
  if (checked) parts.push(`${checked} checked`);
  if (notDone) parts.push(`${notDone} not done`);
  if (stopped) parts.push(`${stopped} stopped`);
  if (running.length) parts.push(`${running.length} still running`);
  lines.push(`While you were away: ${ended.length ? parts.join(", ") : `${running.length} still running`}`);
  lines.push(pendingApprovals > 0 ? `${n(pendingApprovals, "thing is", "things are")} waiting for you` : "Nothing is waiting for you");
  return lines;
}
