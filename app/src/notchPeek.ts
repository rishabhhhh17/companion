// M84, the notch and Home, minimal but detailed (docs/milestones/M84-design-pass.md). Plain decisions, tested in
// m84Peek.test.ts; islandPanel.tsx, homeSide.tsx and todayLine.tsx only draw them. (peek.ts is the character peeking past the screen edge, M26.)
//
// The hover panel is made of rows, and each row it lists has something in it, from the first hover after launch (the
// founder's 13 Nov shot: a fixed facts row that stayed empty read as a blank gap). The rows:
//  - head: Flowflow's face, the greeting and project, the one fact, Settings and Open (notchQuick.ts);
//  - tools: one small card per AI tool with what it is doing now, or the one Connect action, or "Checking your AI tools"
//    for the moment before the engine answers the panel's own ask (never Home's: the panel asks on its first open);
//  - card: the latest review with its proof result (and Undo where Home can undo it), else the next useful thing, or the
//    job at work with Stop;
//  - foot: the quick actions and the key to press.
// Every press only opens Home at a place (island_go): nothing runs from the notch itself. Undo opens Home on its own
// confirm step ({ do: "undo" }, card.tsx), so nothing is undone without the person's yes there.
import type { Model, HistoryItem } from "./model.ts";
import { receiptVerdict } from "./model.ts";
import type { DoneState, DoneTool } from "./doneSignal.ts";
import { DONE_TOOLS } from "./doneSignal.ts";
import { connection } from "./aiTools.ts";
import { homeStatus } from "./homeHero.ts";
import { taskName } from "./itemLook.ts";
import { MEANING_COLOUR, type Colour } from "./meaning.ts";
import type { IconName } from "./icons.tsx";
import type { PanelLayout } from "./notchQuick.ts";
import { QUICK_LOOK, whenWords } from "./notchQuick.ts";
import { looksLikeCopy } from "./practice.ts";
import { S } from "./strings.ts";

/** Where a press opens Home (island_go's argument): an arrival Home accepts (arrival.rs, home.ts arrivalFrom), or none (Now). */
export type Go = { then?: Record<string, string> };
const NOW_GO: Go = {};
const TOOLS_GO: Go = { then: { set: "fixing.tools" } };

const projectOf = (m: Model): string => m.task?.project ?? m.folder ?? "";
const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const samePlace = (a: string, b: string): boolean => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
/** Whether the engine can be asked anything for a project: it runs, Claude is set up, and a project is open. */
const askable = (m: Model): boolean => m.runnerUp && m.connected !== "none" && !!nameOf(projectOf(m));

// ---------- the AI tools ----------

export type ToolState = "waiting" | "watching" | "partly";
export type ToolPeek = { tool: DoneTool; name: string; mark: string; state: ToolState; words: string; colour: Colour; go: Go };
/** At most this many tool cards in the hover panel (560 points wide); the rest are a count. Home's side list shows all. */
export const TOOLS_SHOWN = 3;

/** The AI tools connected in this project, each with what it is doing now, as far as its hooks say: Claude Code waiting on
 *  you (its waiting hook, hook.waiting; only Claude Code has one, so only it can say so), connected and watching, or half
 *  connected. Waiting comes first. Null while the engine has not answered (nothing is guessed). */
export function toolPeeks(m: Model, st: DoneState | null): ToolPeek[] | null {
  if (!st) return null;
  const project = projectOf(m);
  const waiting = !!m.claudeWaiting && !!project && samePlace(m.claudeWaiting.project, project);
  const out: ToolPeek[] = [];
  for (const tool of DONE_TOOLS) {
    const c = connection(st, tool);
    const w = tool === "claude" && waiting && c !== "off";
    if (c === "off" && !w) continue;
    const state: ToolState = w ? "waiting" : c === "on" ? "watching" : "partly";
    out.push({ tool, name: S.doneSignal.tool[tool], mark: S.m84.mark[tool], state, words: S.m84.toolState[state],
      colour: state === "waiting" ? MEANING_COLOUR.question : state === "partly" ? MEANING_COLOUR.review : MEANING_COLOUR.ready,
      // Waiting: Now, where Home says it with Claude Code's own short notice. Otherwise Your AI tools in Settings.
      go: state === "waiting" ? NOW_GO : TOOLS_GO });
  }
  return [...out.filter((t) => t.state === "waiting"), ...out.filter((t) => t.state !== "waiting")];
}

export type ToolsRow = { kind: "tools"; tools: ToolPeek[]; more: number } | { kind: "connect"; go: Go } | { kind: "looking" } | { kind: "unknown"; go: Go };
/** How long the panel says "Checking your AI tools" before it says it could not check (the M84 review: an ask the engine
 *  never answered left "One moment" up forever). Nothing is asked again on this timer; only the words change. */
export const TOOLS_WAIT_MS = 3000;
/** The panel's tools row: the tool cards (at most `max`, and how many more), the one Connect action when none is connected,
 *  "Checking your AI tools" until the engine answers, or, once `waited` (no answer in TOOLS_WAIT_MS, or the ask was
 *  refused), that it could not check, with Open. Null when there is nothing to ask about (no project, the engine stopped,
 *  or Claude not set up): the panel then has no tools row at all, never an empty one. */
export function toolsRow(m: Model, st: DoneState | null, max: number = TOOLS_SHOWN, waited = false): ToolsRow | null {
  if (!askable(m)) return null;
  const tools = toolPeeks(m, st);
  if (!tools) return waited ? { kind: "unknown", go: TOOLS_GO } : { kind: "looking" };
  if (tools.length === 0) return { kind: "connect", go: TOOLS_GO };
  return { kind: "tools", tools: tools.slice(0, max), more: Math.max(0, tools.length - max) };
}
/** Home's slim side list: every tool, the same cards. */
export const sideTools = (m: Model, st: DoneState | null): ToolsRow | null => toolsRow(m, st, DONE_TOOLS.length);

// ---------- the latest review ----------

export type Proof = "passed" | "failed" | "none";
export type ReviewPeek = { kind: "task" | "review"; title: string; proof: Proof; proofWords: string; colour: Colour; when: string; undo: boolean; go: Go; undoGo: Go | null };

const proofColour = (p: Proof): Colour => (p === "passed" ? MEANING_COLOUR.proven : p === "failed" ? MEANING_COLOUR.problem : MEANING_COLOUR.notChecked);
const taskProof = (h: HistoryItem): Proof => (h.proof === "failed" || h.status === "not_done" ? "failed" : h.proof === "passed" && h.status === "done" ? "passed" : "none");
const timeOf = (iso: string | null | undefined): number => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : -Infinity; };

/** Whether Home can undo the last fix right now (the same rule as the quick action Undo): the receipt offers it, no undo is
 *  under way, and it was not undone already. */
export function undoOffered(m: Model): boolean {
  const v = m.task && m.receipt ? receiptVerdict(m) : null;
  return v?.offer === "undo" && !m.undo && !m.receipt?.undone;
}

/** The newest of Squibby's own last fix and the last review of another tool's changes, as a small card: what it was, its
 *  proof result, when. Undo only on Squibby's own fix whose receipt Home holds and offers Undo; it opens Home on the confirm
 *  step. A review of another tool's changes has no Undo here (its saved copies are in History). Null when nothing yet. */
export function latestReview(m: Model, now: number): ReviewPeek | null {
  const project = projectOf(m);
  if (!nameOf(project)) return null;
  const task = [...m.history].filter((h) => h.status !== "running" && h.label.trim()).sort((a, b) => timeOf(b.endedAt ?? b.startedAt) - timeOf(a.endedAt ?? a.startedAt))[0] ?? null;
  const review = m.reviewHistory?.[0] ?? null;
  const tTask = task ? timeOf(task.endedAt ?? task.startedAt) : -Infinity, tReview = review ? timeOf(review.at) : -Infinity;
  if (!task && !review) return null;
  if (review && tReview >= tTask) {
    const proof: Proof = review.checks === "passed" ? "passed" : review.checks === "failed" ? "failed" : "none";
    return { kind: "review", title: review.summary.trim() || S.m84.reviewed(review.count), proof, proofWords: S.m84.proof[proof],
      colour: review.rating === "stop" ? MEANING_COLOUR.problem : proofColour(proof), when: whenWords(review.at, now), undo: false, go: NOW_GO, undoGo: null };
  }
  const t = task!;
  const proof = taskProof(t);
  const mine = !!m.receipt && (m.receipt.wholePlan?.last ?? m.receipt.checkpoint) === t.checkpoint;
  const undo = mine && undoOffered(m);
  return { kind: "task", title: taskName(t.label), proof, proofWords: S.m84.proof[proof], colour: t.undone ? MEANING_COLOUR.undone : proofColour(proof),
    when: whenWords(t.endedAt ?? t.startedAt, now), undo, go: NOW_GO, undoGo: undo ? { then: { do: "undo" } } : null };
}

// ---------- the next useful thing ----------

export type NextId = "changes" | "since" | "practice" | "unchecked" | "quiet" | "pick" | "off" | "notConnected";
export type NextPeek = { id: NextId; title: string; line: string; colour: Colour; icon: IconName; go: Go };

/** When nothing was reviewed yet (or the engine cannot run), the one next useful thing, never nothing: the changes waiting
 *  for a review, files changed since the last check, for a project never checked the practice offer (a real project, no
 *  practice done) or to check it once (a practice copy, or a practice done), or that nothing is new. With no project, the practice; with Squibby stopped or Claude not set up, how to get going again. */
export function nextPeek(m: Model, now: number): NextPeek {
  const N = S.m84.next;
  if (!m.runnerUp) return { id: "off", title: N.off, line: N.offLine, colour: MEANING_COLOUR.problem, icon: "alert", go: NOW_GO };
  if (m.connected === "none") return { id: "notConnected", title: N.notConnected, line: N.notConnectedLine, colour: MEANING_COLOUR.review, icon: "now", go: NOW_GO };
  const project = projectOf(m);
  if (!nameOf(project)) return { id: "pick", title: N.pick, line: N.practiceLine, colour: MEANING_COLOUR.practice, icon: "learn", go: { then: { place: "learn" } } };
  const rv = m.review;
  const waits = rv && rv.stage !== "reviewed" && rv.count > 0 ? rv.count : 0;
  if (waits > 0) return { id: "changes", title: N.changes(waits), line: N.changesLine, colour: MEANING_COLOUR.review, icon: "eye", go: { then: { do: "review" } } };
  const s = homeStatus(m, project, now);
  if (s.kind === "changed") return { id: "since", title: N.since, line: N.sinceLine, colour: MEANING_COLOUR.review, icon: "eye", go: { then: { do: "find" } } };
  if (s.kind === "unchecked") {
    // The practice is offered only on a real project when no practice was done. On a practice copy (the founder's own case,
    // "Squibby practice signup page"), or once a practice is done, the next thing is to check it once, in the look of the
    // Check my project button beside it.
    const pr = m.practice;
    const practised = looksLikeCopy(project) || (!!pr && (samePlace(pr.project, project) || pr.stage === "done"));
    if (practised) return { id: "unchecked", title: N.unchecked, line: N.uncheckedLine, ...QUICK_LOOK.check, go: { then: { do: "find" } } };
    return { id: "practice", title: N.practice, line: N.practiceLine, colour: MEANING_COLOUR.practice, icon: "learn", go: { then: { place: "learn" } } };
  }
  return { id: "quiet", title: N.quiet, line: N.quietLine, colour: MEANING_COLOUR.ready, icon: "now", go: NOW_GO };
}

// ---------- the rows and the height ----------

export type PeekRow = "head" | "tools" | "card" | "foot";
/** Each row's height in points, the gap between rows and the panel's padding (style.css .island-panel: 8 on top, 14 under). */
export const PEEK_ROW_H: Record<PeekRow, number> = { head: 44, tools: 44, card: 52, foot: 30 };
export const PEEK_GAP = 10;
export const PEEK_PAD = { top: 8, bottom: 14 } as const;
/** The rows the quick and job layouts show: the tools row only when there is something to ask about. */
export function peekRows(m: Model, _layout: Extract<PanelLayout, "quick" | "job">): PeekRow[] {
  return askable(m) ? ["head", "tools", "card", "foot"] : ["head", "card", "foot"];
}
/** The panel's height for its rows: no room is ever kept for a row that is not there. */
export const peekHeight = (rows: readonly PeekRow[]): number =>
  PEEK_PAD.top + PEEK_PAD.bottom + rows.reduce((h, r) => h + PEEK_ROW_H[r], 0) + Math.max(0, rows.length - 1) * PEEK_GAP;

// ---------- Now's calm timeline of today ----------

export type TodayKind = "reviewed" | "caught" | "asked" | "fixed" | "failed" | "undone" | "stopped";
export type TodayEntry = { key: string; kind: TodayKind; at: number; when: string; words: string; colour: Colour; icon: IconName };
export const TODAY_MAX = 6;

/** What happened today in this project, newest first, at most TODAY_MAX: changes reviewed, copies saved before a
 *  destructive command (caught), fixes proven or not, and what was undone. Only real rows; nothing when nothing happened. */
export function todayLine(m: Model, now: number): TodayEntry[] {
  const day = new Date(now).toDateString();
  const today = (iso: string | null | undefined) => { const t = timeOf(iso); return t > -Infinity && t <= now + 60_000 && new Date(t).toDateString() === day ? t : null; };
  const out: TodayEntry[] = [];
  const L = S.m84.line;
  for (const h of m.history) {
    if (h.status === "running" || !h.label.trim()) continue;
    const t = today(h.endedAt);
    if (t === null) continue;
    const name = taskName(h.label);
    const p = taskProof(h);
    const kind: TodayKind = h.undone ? "undone" : p === "passed" ? "fixed" : p === "failed" ? "failed" : h.status === "interrupted" ? "stopped" : "fixed";
    const look = TODAY_LOOK[kind];
    out.push({ key: `t${h.id}`, kind, at: t, when: whenWords(h.endedAt, now), words: kind === "undone" ? L.undone(name) : kind === "failed" ? L.failed(name) : kind === "stopped" ? L.stopped(name) : L.fixed(name), ...look });
  }
  for (const r of m.reviewHistory ?? []) {
    const t = today(r.at);
    if (t === null) continue;
    const colour = r.rating === "stop" || r.checks === "failed" ? MEANING_COLOUR.problem : r.rating === "safe" && r.checks === "passed" ? MEANING_COLOUR.proven : MEANING_COLOUR.review;
    out.push({ key: `r${r.id}`, kind: "reviewed", at: t, when: whenWords(r.at, now), words: L.reviewed(r.count, r.summary.trim()), colour, icon: "eye" });
  }
  for (const s of m.savedRows ?? []) {
    const t = today(s.at);
    if (t === null) continue;
    out.push({ key: `s${s.id}`, kind: "caught", at: t, when: whenWords(s.at, now), words: L.caught(s.command), ...TODAY_LOOK.caught });
  }
  // M85 review: each ask before a live system, by the person's own tool or a card of Squibby's own.
  for (const a of m.askedRows ?? []) {
    const t = today(a.at);
    if (t === null) continue;
    out.push({ key: `a${a.id}`, kind: "asked", at: t, when: whenWords(a.at, now), words: L.asked(a.command), ...TODAY_LOOK.asked });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, TODAY_MAX);
}
const TODAY_LOOK: Record<Exclude<TodayKind, "reviewed">, { colour: Colour; icon: IconName }> = {
  caught: { colour: MEANING_COLOUR.review, icon: "shield" }, asked: { colour: MEANING_COLOUR.question, icon: "wait" }, fixed: { colour: MEANING_COLOUR.proven, icon: "tick" }, failed: { colour: MEANING_COLOUR.problem, icon: "cross" },
  undone: { colour: MEANING_COLOUR.undone, icon: "undo" }, stopped: { colour: MEANING_COLOUR.stopped, icon: "stop" },
};
