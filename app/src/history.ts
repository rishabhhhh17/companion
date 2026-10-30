// Search in What I did: the tasks the engine sent (its last 50 in this project) narrowed by words in their name and by how
// they ended. Only what is already on the page is searched; nothing is asked of the engine and nothing is kept.
import type { HistoryItem } from "./model.ts";

export type HistoryStatus = "all" | "done" | "not_done" | "stopped" | "undone" | "running";
export const HISTORY_STATUSES: readonly HistoryStatus[] = ["all", "done", "not_done", "stopped", "undone", "running"];
export type HistoryQuery = { words: string; status: HistoryStatus };
export const NO_FILTER: HistoryQuery = { words: "", status: "all" };

/** How a task ended, by its status. Anything unknown is "not done". A task an Undo took back is "undone" whatever its status
 *  (M45), as its row says "Undone": only when it changed files (an Undo of a task that changed nothing is not its result, as
 *  in the verdict) and nothing brought it back since. Note: the rows now say the verdict's words ("Fixed and proven",
 *  "Changed, not proven"...), and these groups are still the older, coarser ones. */
export function statusGroup(h: Pick<HistoryItem, "status" | "undone"> & Partial<Pick<HistoryItem, "back" | "changed">>): Exclude<HistoryStatus, "all"> {
  if (h.undone && !h.back && (h.changed ?? 1) > 0 && h.status !== "running") return "undone";
  switch (String(h.status ?? "")) {
    case "done": return "done";
    case "running": return "running";
    case "interrupted": case "needs_you": case "daily_limit": case "error_max_budget_usd": case "error_max_turns": case "no_connection": case "claude_busy": return "stopped";
    default: return "not_done";
  }
}

// Lower case, without accents, so "cafe" finds "Café".
const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/** Is the person narrowing the list at all? */
export const historyFiltering = (q: HistoryQuery): boolean => q.words.trim() !== "" || (q.status !== "all" && HISTORY_STATUSES.includes(q.status));

/** The tasks whose name holds every word typed (any order) and that ended the way picked, in the order they came. */
export function filterHistory(items: HistoryItem[], q: HistoryQuery): HistoryItem[] {
  const words = fold(q.words).split(/\s+/).filter(Boolean);
  const status = HISTORY_STATUSES.includes(q.status) ? q.status : "all";
  return items.filter((h) => {
    if (status !== "all" && statusGroup(h) !== status) return false;
    const name = fold(typeof h.label === "string" ? h.label : "");
    return words.every((w) => name.includes(w));
  });
}

/** Undo in What I did. Undoing a task puts the whole project back to just before it, so it is safe only for the newest task
 *  that changed files: undoing an older one would also take back the work done after it. "undo" is the button, "older" a
 *  task that changed files but is not the newest (the list says why there is no button), null nothing. Nothing is offered while
 *  a task is still working on the project, nor for a task already undone in this session (`undone`: its undo point). `items`
 *  is the whole list, newest first, not the filtered one. */
export function historyUndo(items: HistoryItem[], h: HistoryItem, undone: string | null): "undo" | "older" | null {
  if (!h.checkpoint || !((h.changed ?? 0) > 0)) return null;
  if (items.some((x) => x.status === "running") || !items.some((x) => x.id === h.id)) return null;
  // Already taken back by an Undo (the engine's task log says so, M45): nothing left to undo.
  if (h.undone && !h.back) return null;
  const newest = items.find((x) => !!x.checkpoint && (x.changed ?? 0) > 0);
  if (!newest || newest.id !== h.id) return "older";
  return undone !== null && undone === h.checkpoint ? null : "undo";
}
