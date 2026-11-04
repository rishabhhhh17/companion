// M69 (the YC benchmark spec 3.11, corrected by F29): one numbered setup list instead of stacked messages. Nobody adds a
// key or signs in to an AI provider, so the steps are: Getting ready on this Mac (the engine's own parts, homeHero.ts
// blockerOf), Pick a project, and Try the practice. Done steps are ticked, the first open one is the current one and has
// the one button. A stopped engine is not setup (it has its own Restart line), so it never makes a list.
import type { Blocker } from "./homeHero.ts";

export type SetupId = "ready" | "project" | "practice";
export type SetupAct = "retry" | "getParts" | "pickFolder" | "practice" | null;
export type SetupRow = { id: SetupId; state: "done" | "now" | "later"; act: SetupAct };

/** What blocks setup (not a crash): no connection yet, or a part of the engine missing or on its way. */
const SETUP_BLOCKERS: readonly Blocker[] = ["key", "claude", "claudeGetting"];

/** The list, or null when nothing is left to set up (ready on this Mac and a project open). `practiced`: a practice was
 *  finished on this Mac. The practice is never required: it is offered as a step, and ticked once done. */
export function setupList(o: { blocker: Blocker | null; project: string; practiced: boolean }): SetupRow[] | null {
  const notReady = !!o.blocker && SETUP_BLOCKERS.includes(o.blocker);
  if (!notReady && o.project) return null;
  const readyAct: SetupAct = o.blocker === "key" ? "retry" : o.blocker === "claude" ? "getParts" : null;
  const rows: SetupRow[] = [
    { id: "ready", state: notReady ? "now" : "done", act: notReady ? readyAct : null },
    { id: "project", state: o.project ? "done" : notReady ? "later" : "now", act: o.project ? null : "pickFolder" },
    { id: "practice", state: o.practiced ? "done" : "later", act: o.practiced ? null : "practice" },
  ];
  return rows;
}

/** The step that is open now, counted from one ("Step 2 of 3"), or null when every step is done. */
export function setupNow(rows: readonly SetupRow[]): { n: number; of: number } | null {
  const i = rows.findIndex((r) => r.state === "now");
  return i < 0 ? null : { n: i + 1, of: rows.length };
}
