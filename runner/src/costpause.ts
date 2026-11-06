// M75: the cost pause. A task that has used far more than a usual task in this project stops and asks "This one is taking a
// lot more than usual. Keep going?" (Keep going, Stop, Undo what it did). It only pauses: budget.task still ends a task at
// its own amount. No amount ever reaches a page (F29, M69): the events name the agent and the project only.
// Usual is this project's own history (the task log's spend per task), never a guess about other people.

/** With fewer than this many past tasks that spent something, a fixed starting value is used instead. */
export const MIN_HISTORY = 3;
/** How many recent tasks are looked at. */
export const HISTORY = 20;
/** The usual task before there is history to go by, in dollars (inside Squibby only, never shown). */
export const STARTING_USUAL_USD = 0.4;
/** Never pause below this, so a project whose tasks are tiny is not asked about every second one. */
export const FLOOR_USD = 0.75;
export const PAUSE_CHOICES = ["off", "3", "5"] as const;
export type PauseChoice = (typeof PAUSE_CHOICES)[number];

/** A usual task's spend here: the middle value of the last HISTORY tasks that spent something, else the starting value. */
export function usualTaskUsd(rows: readonly { usd: number }[]): number {
  const spent = rows.map((r) => Number(r.usd)).filter((n) => Number.isFinite(n) && n > 0).slice(0, HISTORY);
  if (spent.length < MIN_HISTORY) return STARTING_USUAL_USD;
  const s = [...spent].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Where a task pauses: usual times the choice, never below the floor. Off (or anything not a choice): never. */
export function pauseAtUsd(usual: number, choice: unknown): number {
  const times = choice === "3" ? 3 : choice === "5" ? 5 : null;
  if (times === null || !(usual > 0)) return Infinity;
  return Math.max(FLOOR_USD, usual * times);
}

/** After Keep going, the next pause comes only at twice the line. */
export const nextPauseAt = (at: number): number => (Number.isFinite(at) ? at * 2 : Infinity);

export type CostChoice = "keep" | "stop" | "undo";
