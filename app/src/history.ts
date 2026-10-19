// Search in What I did: the tasks the engine sent (its last 50 in this project) narrowed by words in their name and by how
// they ended. Only what is already on the page is searched; nothing is asked of the engine and nothing is kept.
import type { HistoryItem } from "./model.ts";

export type HistoryStatus = "all" | "done" | "not_done" | "stopped" | "running";
export const HISTORY_STATUSES: readonly HistoryStatus[] = ["all", "done", "not_done", "stopped", "running"];
export type HistoryQuery = { words: string; status: HistoryStatus };
export const NO_FILTER: HistoryQuery = { words: "", status: "all" };

/** How a task ended, in the same groups the list words them in (model.ts historyWords). Anything unknown is "not done". */
export function statusGroup(s: string): Exclude<HistoryStatus, "all"> {
  switch (s) {
    case "done": return "done";
    case "running": return "running";
    case "interrupted": case "error_max_budget_usd": case "error_max_turns": case "no_connection": case "claude_busy": return "stopped";
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
    if (status !== "all" && statusGroup(String(h.status ?? "")) !== status) return false;
    const name = fold(typeof h.label === "string" ? h.label : "");
    return words.every((w) => name.includes(w));
  });
}
