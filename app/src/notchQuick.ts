// M70, a practical notch (docs/milestones/M70-practical-notch.md; the founder, 4 Nov 2026: "When you first hover over it, a
// small text or some normal things come, and then when you go to the settings, everything else comes"). Plain decisions for
// the small panel that opens when the pointer rests on the notch: the greeting, the one fact, the layout and its fixed
// height, and the quick actions. Tested in notchQuick.test.ts; islandPanel.tsx only draws them.
//
// Every action only opens Home at a place (main.rs island_go, arrival.rs): nothing runs from the notch itself, so today's
// approvals, snapshots and receipts apply unchanged. None of them takes the keyboard (rule 9).
import { receiptVerdict, type Model } from "./model.ts";
import type { IslandMode, WingMark } from "./home.ts";
import { clockWords, homeStatus, lastResult, notchStatusLine } from "./homeHero.ts";
import { connection } from "./aiTools.ts";
import { DONE_TOOLS, type DoneState } from "./doneSignal.ts";
import type { ToolId } from "./groups.ts";
import type { PanelView } from "./islandPanel.ts";
import { cleanName, helloLine } from "./notchHello.ts";
import { S } from "./strings.ts";
import { FACT_MEANING, MEANING_COLOUR, type Colour, type FactKind } from "./meaning.ts";
import type { IconName } from "./icons.tsx";

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
/** The height of the two layouts with all four rows (island.rs PANEL_MIN to PANEL_MAX; notchPeek.ts peekHeight). M84: the
 *  rows are the head, the AI tools, a card and the foot, and each row it lists says something, so no room is ever kept for
 *  an empty row (the M83 facts row kept 22 points even when empty, and read as a blank gap). Without a project or an engine
 *  to ask, the tools row is left out and the panel is that much shorter (notchPeek.ts peekRows). The quick and job layouts
 *  are the same height, so nothing moves as a job starts. The question and the result keep their measured card heights. */
export const LAYOUT_H = { quick: 222, job: 222 } as const;

const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const projectOf = (m: Model): string => m.task?.project ?? m.folder ?? "";
/** M84: Claude Code waits on the person in this very project (hook.waiting, model.ts claudeWaiting). */
const claudeWaitsHere = (m: Model, project: string): boolean => !!project && !!m.claudeWaiting && m.claudeWaiting.project.replace(/\/+$/, "") === project.replace(/\/+$/, "");
/** M84 review: the island's own line is the waiting hook's ("Needs you: Claude is waiting for you in ..."), for this
 *  project: the head says it in its own words with the orange dot, never cut short with a grey one. Any other line (the
 *  engine stopped, listening, an update) still comes first. */
const waitingNote = (m: Model, note: string): boolean => !!note && note.includes(S.guard.waitingWhy("")) && claudeWaitsHere(m, projectOf(m));
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
  if (waitingNote(m, note)) return S.m84.waitingHead;
  if (note) return note;
  if (!m.runnerUp) return S.islandOff;
  if (m.connected === "none") return S.islandNotConnected;
  if (m.approvals.length > 0) return S.hello.questions(m.approvals.length);
  const project = projectOf(m), name = nameOf(project);
  // M84: the person's Claude Code waits on them in this project (the waiting hook): said first after a question here.
  if (claudeWaitsHere(m, project)) return S.m84.waitingHead;
  if (!name) return S.notch.pickProject;
  const n = reviewWaits(m);
  if (n > 0) return S.notch.changes(name, n);
  const s = homeStatus(m, project, now);
  if (s.kind === "works") return S.notch.passed(name, s.ago);
  // M71: the short form when the check has a time (the name moves up beside the greeting, factLines); a check that just
  // answered keeps its own headline.
  if (s.kind === "failing" && s.ago) return S.notch.failed(name, s.ago);
  if (s.kind === "changed") return S.notch.changedSince(name);
  if (s.kind === "failing") return notchStatusLine(s, project);
  if (s.kind === "unchecked") return S.notch.notChecked(name);
  return S.notch.ready;
}

/** M71: which fact quickFact says, by the same rules in the same order, so its dot takes that fact's meaning colour
 *  (meaning.ts FACT_MEANING): orange for changes to review, red for a problem, green for a passed check, grey otherwise. */
export function quickFactKind(m: Model, now: number, note = ""): FactKind {
  if (waitingNote(m, note)) return "waiting";
  if (note) return "note";
  if (!m.runnerUp) return "off";
  if (m.connected === "none") return "notConnected";
  if (m.approvals.length > 0) return "questions";
  const project = projectOf(m);
  if (claudeWaitsHere(m, project)) return "waiting";
  if (!nameOf(project)) return "pickProject";
  if (reviewWaits(m) > 0) return "changes";
  const s = homeStatus(m, project, now);
  if (s.kind === "works") return "passed";
  if (s.kind === "failing") return "failing";
  if (s.kind === "changed") return "changedSince";
  if (s.kind === "unchecked") return "notChecked";
  return "ready";
}
/** The fact's dot colour. */
export const factColour = (k: FactKind): Colour => MEANING_COLOUR[FACT_MEANING[k]];

/** M71: each quick action's colour tile, the mock's (docs/design/2026-11-05-black-with-colour): Ask blue, Review changes
 *  orange (take a look), Check my project green (it proves), Check before going live green, Undo orange, Pick a project
 *  grey. Find and fix the problem (Check after a failed check) is red. */
export const QUICK_LOOK: Record<QuickId, { colour: Colour; icon: IconName }> = {
  pick: { colour: "grey", icon: "now" }, ask: { colour: "blue", icon: "sparkle" }, review: { colour: "orange", icon: "eye" },
  check: { colour: "green", icon: "tick" }, ship: { colour: "green", icon: "shield" }, undo: { colour: "orange", icon: "undo" },
};
export function quickLook(id: QuickId, m: Model, now: number): { colour: Colour; icon: IconName } {
  if (id === "check" && homeStatus(m, projectOf(m), now).kind === "failing") return { colour: "red", icon: "wrench" };
  return QUICK_LOOK[id];
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

/** A button's words. Check my project reads as "check it again" after a check failed, so there it is Fix it, Home's own
 *  words, and Home does what its Fix it does (card.tsx, the same press, { do: "find" }; M72, the walkthrough, item 15). */
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

// ---------- M83: a wider panel that says more (docs/milestones/M83-notch-and-reactions.md) ----------

/** M83: the panel's width (island.rs PANEL_W, style.css .island-panel), about 1.4 times the old 400. Pinned on both sides. */
export const PANEL_W = 560;
/** At most this many short facts in the row under the head. */
export const NOTCH_FACTS_MAX = 3;
export type NotchFactId = "job" | "check" | "changes" | "tools" | "caught";
/** One short fact: its words, its meaning's colour (null: no colour, a plain fact), and where a press opens Home. */
export type NotchFact = { id: NotchFactId; words: string; colour: Colour | null; go: { then?: Record<string, string> };
  /** M83: the same fact as Home's status strip says it, a small caption over a short value. */
  label: string; value: string };
/** Where each fact opens Home (island_go arrivals; arrival.rs and home.ts arrivalFrom allow exactly these). Opening Home is
 *  all a press does: the review opens on the review card, the tools on Settings' Your AI tools, the rest on Now. */
export const FACT_GO: Record<NotchFactId, { then?: Record<string, string> }> = {
  job: {}, check: {}, changes: { then: { do: "review" } }, tools: { then: { set: "fixing.tools" } }, caught: {},
};

/** A time as the facts say it: the clock today ("2:14 pm"), the weekday and clock within the week ("Tue 2:14 pm"), else
 *  the date ("Nov 3"). Nothing for a time that is missing or makes no sense (the fact is then left out). */
export function whenWords(iso: string | null | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t) || t > now + 60_000) return "";
  const d = new Date(t), n = new Date(now);
  const clock = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(/\s+/g, " ");
  if (d.toDateString() === n.toDateString()) return clock;
  if (now - t < 6 * 86_400_000) return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${clock}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The AI tools connected in the project (M82, aiTools.ts connection), in the list's order; null when the engine has not
 *  said (the fact is left out, never guessed). */
export function connectedTools(st: DoneState | null): ToolName[] | null {
  if (!st) return null;
  return DONE_TOOLS.filter((t) => connection(st, t) === "on");
}
type ToolName = DoneState["tools"][number]["tool"];

export type FactInput = {
  now: number;
  /** The engine's hook state for the project (donesignal.state), or null until it answers. */
  tools?: DoneState | null;
  /** A job at work: its step (0 to 3) and how long the panel has seen it run. */
  job?: { step: number; ms: number } | null;
  /** Which fact the head already says (quickFactKind), so the row never says the same thing twice. */
  head?: FactKind;
  /** At most this many (NOTCH_FACTS_MAX in the panel; Home's strip has room for four). */
  max?: number;
  /** Whether "No AI tool connected" is said (Home leaves it to its own Connect your AI tools row). */
  noneTool?: boolean;
};

/** M83: up to three short facts under the head, each from data the pages already hold, the most useful first: the job's
 *  step and time, the last check (its result and when), changes waiting for a review, the AI tools connected, and what the
 *  safety net caught this week. A fact with no data is left out, and so is one the head line already says. */
export function notchFacts(m: Model, o: FactInput): NotchFact[] {
  if (!m.runnerUp || m.connected === "none") return [];
  const project = projectOf(m);
  if (!nameOf(project)) return [];
  const out: NotchFact[] = [];
  const F = S.notch.facts;
  const add = (id: NotchFactId, words: string, colour: Colour | null, value = words) => { if (words) out.push({ id, words, colour, go: FACT_GO[id], label: F.labels[id], value }); };
  if (o.job) add("job", F.job(S.home.steps[Math.max(0, Math.min(S.home.steps.length - 1, o.job.step))], clockWords(o.job.ms)), MEANING_COLOUR.working);
  const s = homeStatus(m, project, o.now);
  const last = lastResult(m, project);
  const when = whenWords(last?.at, o.now);
  const headSaysCheck = o.head === "passed" || o.head === "failing";
  if (when && !headSaysCheck && !o.job) {
    if (s.kind === "works") add("check", F.checkedWorking(when), MEANING_COLOUR.proven, F.checkValue.works(when));
    else if (s.kind === "failing") add("check", F.checkFailed(when), MEANING_COLOUR.problem, F.checkValue.failing(when));
    else if (s.kind === "changed") add("check", F.changedSince(when), MEANING_COLOUR.review, F.checkValue.changed(when));
  }
  const rv = m.review;
  if (rv && rv.stage !== "reviewed" && rv.count > 0 && o.head !== "changes") add("changes", F.filesChanged(rv.count, rv.capped), MEANING_COLOUR.review);
  const tools = connectedTools(o.tools ?? null);
  if (tools?.length) { const names = tools.map((t) => S.doneSignal.tool[t]); add("tools", F.toolsConnected(names), MEANING_COLOUR.working, F.toolNames(names)); }
  else if (tools && o.noneTool !== false) add("tools", F.noTool, null, F.noToolShort);
  const c = m.caught;
  const caught = c ? c.falseDones + c.keys + c.weakened : 0;
  if (caught > 0) add("caught", F.caughtWeek(caught), MEANING_COLOUR.ready, F.caughtShort(caught));
  return out.slice(0, o.max ?? NOTCH_FACTS_MAX);
}

/** M83: Home's status strip under the lead, from the same facts: the last check with its clock time (the lead says how it
 *  is; the strip says when), changes waiting, the AI tools connected and what was caught this week. At most four, none
 *  made up, and "No AI tool connected" left to Home's own Connect your AI tools row. No job: the lead is the job then. */
export const HOME_FACTS_MAX = 4;
export function homeFacts(m: Model, o: { now: number; tools?: DoneState | null }): NotchFact[] {
  return notchFacts(m, { now: o.now, tools: o.tools, max: HOME_FACTS_MAX, noneTool: false });
}
