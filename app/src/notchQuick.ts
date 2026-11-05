// M70, a practical notch (docs/milestones/M70-practical-notch.md; the founder, 4 Nov 2026: "When you first hover over it, a
// small text or some normal things come, and then when you go to the settings, everything else comes"). Plain decisions for
// the small panel that opens when the pointer rests on the notch: the greeting, the one fact, the layout and its fixed
// height, and the quick actions. Tested in notchQuick.test.ts; islandPanel.tsx only draws them.
//
// Every action only opens Home at a place (main.rs island_go, arrival.rs): nothing runs from the notch itself, so today's
// approvals, snapshots and receipts apply unchanged. None of them takes the keyboard (rule 9).
import { receiptVerdict, type Model } from "./model.ts";
import type { IslandMode, WingMark } from "./home.ts";
import { homeStatus, notchStatusLine } from "./homeHero.ts";
import type { ToolId } from "./groups.ts";
import type { PanelView } from "./islandPanel.ts";
import { cleanName, helloLine } from "./notchHello.ts";
import { S } from "./strings.ts";

export type QuickId = "pick" | "ask" | "review" | "check" | "ship" | "undo";
/** The fixed slot order: an action never swaps places with another when the state changes. Pick a project comes first
 *  (M70 step 4): with no project it is the thing to do, and Ask follows it. */
export const QUICK_SLOTS: readonly QuickId[] = ["pick", "ask", "review", "check", "ship", "undo"];
/** At most this many, besides the gear and Open, which are always there. */
export const QUICK_MAX = 3;
/** What Home is asked to do for each (arrival.rs and home.ts arrivalFrom pass exactly these). Pick a project has none: Home
 *  opens on Now, whose hero offers the folder picker (homeHero.ts noProject, main "folder"). */
export const QUICK_DO = {
  pick: null,
  ask: { place: "ask" },
  review: { do: "review" },
  check: { do: "find" },
  ship: { do: "shipCheck" },
  undo: { do: "undo" },
} as const satisfies Record<QuickId, Record<string, string> | null>;
/** What island_go is sent for an action: its arrival, or nothing (Home on Now). */
export const quickGo = (id: QuickId): { then?: Record<string, string> } => { const t = QUICK_DO[id]; return t ? { then: t } : {}; };
/** The gear: Home on Settings. Open: Home on Now (no arrival). */
export const GEAR_DO = { place: "settings" } as const;
/** The tool each action belongs to (groups.ts): an action whose tool is turned off is not offered. Picking a project
 *  belongs to none: it is always there when no project is. */
export const QUICK_TOOL: Record<QuickId, ToolId | null> = { pick: null, ask: "askBox", review: "review", check: "findProblem", ship: "ship", undo: "undo" };

export type PanelLayout = "quick" | "job" | "question" | "result";
/** The layout for what the panel shows (islandPanel.ts panelView): a question and a result keep today's cards. */
export const panelLayout = (v: PanelView): PanelLayout => (v.kind === "questions" ? "question" : v.kind === "job" ? "job" : v.kind === "result" ? "result" : "quick");
/** The fixed heights of the two new layouts (island.rs PANEL_MIN to PANEL_MAX), so a fact changing never moves anything.
 *  Two rows each (M70 step 4): the fact with Settings and Open, then the buttons or the running job with Stop. The question
 *  and the result keep their measured card heights. ui/notch.css pins the same numbers. */
export const LAYOUT_H = { quick: 96, job: 96 } as const;

const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const projectOf = (m: Model): string => m.task?.project ?? m.folder ?? "";
const reviewWaits = (m: Model): number => { const rv = m.review; return rv && rv.stage !== "reviewed" && rv.count > 0 ? rv.count : 0; };

/** "Hey <name>" from what the person typed in Settings (you.name), or "Hi there". The Mac's account name is never read. Only
 *  the opt in hello says it (island.hello); the hover panel leads with the fact instead (M70 step 4: a greeting on every
 *  hover read as the friendly bubble the founder asked to remove). */
export const quickGreeting = (name: unknown): string => helloLine(cleanName(name), null).greet;

/** The one plain fact, the most useful first: a line the island already has to say (the engine stopped, getting ready, an
 *  update, listening), the questions waiting, no project, changes to review, a problem the last check found or files changed
 *  since it, the last check that passed, else that the project is not checked yet (Home's own headline, and the reason its
 *  Check my project button is there). It names only what Squibby itself saw: changes are "to review", never credited to or
 *  blamed on another tool. */
export function quickFact(m: Model, now: number, note = ""): string {
  if (note) return note;
  if (!m.runnerUp) return S.islandOff;
  if (m.connected === "none") return S.islandNotConnected;
  if (m.approvals.length > 0) return S.hello.questions(m.approvals.length);
  const project = projectOf(m), name = nameOf(project);
  if (!name) return S.notch.pickProject;
  const n = reviewWaits(m);
  if (n > 0) return S.notch.changes(name, n);
  const s = homeStatus(m, project, now);
  if (s.kind === "works") return S.notch.passed(name, s.ago);
  if (s.kind === "failing" || s.kind === "changed") return notchStatusLine(s, project);
  if (s.kind === "unchecked") return S.notch.notChecked(name);
  return S.notch.ready;
}

/** The panel's two lines (5 Nov 2026, a long project name cut the fact): a fact about the project ("my-shop: 3 changes to
 *  review") moves the name up beside the greeting, small and allowed to shorten, and keeps its own words in full. Any other
 *  fact stays as it is. */
export function factLines(greet: string, fact: string, project: string): { top: string; fact: string } {
  const name = nameOf(project), lead = `${name}: `;
  if (!name || !fact.startsWith(lead) || fact.length === lead.length) return { top: greet, fact };
  const rest = fact.slice(lead.length);
  return { top: `${greet} · ${name}`, fact: rest[0].toUpperCase() + rest.slice(1) };
}

/** A button's words. Check my project reads as "check it again" after a check failed, so there it says what it leads to:
 *  Home finds the problem and offers Fix it (the same press, { do: "find" }). */
export function quickLabel(id: QuickId, m: Model, now: number): string {
  if (id === "check" && homeStatus(m, projectOf(m), now).kind === "failing") return S.notch.quick.fix;
  return S.notch.quick[id];
}

/** Whether the live mark stays drawn in the notch's row while the panel is open (M70 step 4): the panel says the same thing
 *  in words, so the mark would hang alone above it. Listening and looking at the screen always stay: rule 5 keeps those
 *  two indicators visible whenever the microphone or the screen is in use. */
export const rowMarkShown = (mode: IslandMode, mark: WingMark): boolean =>
  (mode !== "peek" && mode !== "wingsPeek") || mark === "bars" || mark === "look";

/** What the panel showed last while it shows, kept while it leaves, so its words fade out as they were instead of switching
 *  to another view (or to nothing) in the frame the pointer leaves (M70 step 4). */
export const latched = <T>(prev: T, shown: boolean, now: T): T => (shown ? now : prev);

/** The quick actions for the state, at most QUICK_MAX, in their fixed slots. None while a question waits or a fresh result
 *  shows (those cards are the panel), while a job runs, or while nothing can run (the engine stopped or not ready). Ask
 *  comes first, after Pick a project when there is none.
 *  Review only with changes waiting, Undo only where the result offers it and no undo is under way, Check before going
 *  live only while the last check stands proven. `on`: whether a tool is turned on (groups.ts toolOn). */
export function quickActions(m: Model, o: { now: number; layout: PanelLayout; on?: (t: ToolId) => boolean }): QuickId[] {
  // M70 step 4: a running job is its own row with Stop, and Open goes further; no row of one Ask button under it.
  if (o.layout !== "quick") return [];
  if (!m.runnerUp || m.connected === "none" || m.approvals.length > 0) return [];
  const want = new Set<QuickId>(["ask"]);
  const project = projectOf(m);
  if (!nameOf(project)) want.add("pick");
  else {
    want.add("check");
    if (reviewWaits(m) > 0) want.add("review");
    else {
      const v = m.task && m.receipt ? receiptVerdict(m) : null;
      if (v?.offer === "undo" && !m.undo && !m.receipt?.undone) want.add("undo");
      else if (homeStatus(m, project, o.now).kind === "works") want.add("ship");
    }
  }
  const on = o.on ?? (() => true);
  return QUICK_SLOTS.filter((id) => { const t = QUICK_TOOL[id]; return want.has(id) && (t === null || on(t)); }).slice(0, QUICK_MAX);
}
