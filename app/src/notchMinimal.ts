// M93, a minimal notch hover: a greeting and one action (docs/milestones/M93-minimal-hover.md). The founder, 14 Nov 2026,
// with a shot of the M84 hover panel: "I don't like this, it's too much for just a notch. It just needs to be like 'Hey
// Rishabh' and some CTA." Plain decisions, tested in m93Hover.test.ts; islandPanel.tsx only draws them.
//
// The hover panel is two rows: Flowflow's live face beside "Hey <first name>" (or "Hey there") with at most one short line
// under it, only when it matters; then ONE primary action that fits the moment and at most one quiet Open Home. Everything
// else the M84 panel showed (the AI tools, the latest review, the usage ring, the key to press, Settings, the practice offer)
// lives in Home. Every press only opens Home at a place (island_go), except Stop, which stops (as before).
//
// The name is only what the person typed (you.name, on this Mac only): the Mac account's name is never read (F28).
//
// M96, the notch HeyClicky style (docs/milestones/M96-heyclicky-notch.md). The founder, 15 Nov 2026, on the real M93 hover:
// "I don't like how it looks, just see how HeyClicky does it", then "it starts small and then when we go to settings then
// it opens up", and "yeah" to the mock. Pointing now grows ONE row out of the notch, about 330 wide: Flowflow's face, a
// lowercase "hey <first name>", and one glowing pill with the action's own words ("2 changes to review" with a small dot when
// something waits). No line row, no Open Home, no icon in the pill. The line below (hoverLine) is still decided, for the
// words VoiceOver hears and the pill's tooltip, never drawn as a row. Clicking the face or the greeting opens the small
// chat (notchChat.ts).
import type { Model } from "./model.ts";
import { homeStatus, undoCan } from "./homeHero.ts";
import { factColour, QUICK_LOOK, QUICK_TOOL } from "./notchQuick.ts";
import { MEANING_COLOUR, type Colour, type FactKind } from "./meaning.ts";
import type { ToolId } from "./groups.ts";
import type { IconName } from "./icons.tsx";
import type { Go } from "./notchPeek.ts";
import type { IslandLineKind } from "./home.ts";
import { S } from "./strings.ts";
import { firstName, NAME_SHOWN_MAX } from "./notchHello.ts";
import { finishedNow, waitingTool } from "./toolFinished.ts";

// ---------- the greeting ----------

// The first word of the name and its cut live in notchHello.ts, so the hello and this greeting say the same name (the M93
// review: the hello said the whole typed name).
export { firstName, NAME_SHOWN_MAX };
/** M96: "hey rishabh", or "hey there" when no name was typed: lowercase, as the approved mock says it. */
export const hoverGreeting = (typed: unknown): string => { const n = firstName(typed); return n ? S.m96.hey(n.toLocaleLowerCase()) : S.m96.heyThere; };

/** Feel round 2 (19 Nov 2026): the row led with "hey there" even when there was news, so a finished review peeked as a
 *  greeting and the person had to open Home to learn what happened. With news (the one short line, or a review's own
 *  summary once it is in), the row says the news in its words; the greeting only when there is none. */
export function hoverHeadline(m: Model, greet: string, line: HoverLine | null, now = Date.now()): { words: string; news: boolean; tone?: "ok" | "bad" } {
  const said = m.review?.stage === "reviewed" ? m.review.result?.summary?.trim() ?? "" : "";
  // Feel round 3 (19 Nov 2026): a review's news carries whether it passed, so the row leads with a green tick or a red
  // cross and reads at a glance: mark, sentence, action.
  const r = m.review?.result;
  const tone = !r ? undefined : r.rating === "stop" || r.checks === "failed" ? "bad" as const : r.rating === "safe" ? "ok" as const : undefined;
  // A tool that just finished: its review's own summary says what changed in a few words ("The button is blue now."), where
  // the line ("Claude Code finished in ...: works") was cut by the row; the pill still says where to look.
  if (said && finishedNow(m, now)) return { words: said, news: true, ...(tone ? { tone } : {}) };
  if (line?.words) return { words: line.words, news: true };
  return said ? { words: said, news: true, ...(tone ? { tone } : {}) } : { words: greet, news: false };
}

/** QA1: what a click on the row's headline (or the quiet line under it) opens. News (a result, a review, Claude waiting)
 *  opens Home on it, as a click on the notch's own row does; the plain hello opens the small chat. */
export const rowPressOpens = (head: { words?: string; news: boolean }): "home" | "chat" => (head.news ? "home" : "chat");

// ---------- the one short line ----------

const projectOf = (m: Model): string => m.task?.project ?? m.folder ?? "";
const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const samePlace = (a: string, b: string): boolean => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
const claudeWaitsHere = (m: Model): boolean => { const p = projectOf(m); return !!p && !!m.claudeWaiting && samePlace(m.claudeWaiting.project, p); };
/** M105: "Claude is waiting for you", or the same in Codex's name when Codex is the one waiting. */
const waitsWords = (m: Model): string => { const t = waitingTool(m); return t === "claude" ? S.m93.line.claude : S.m105.waitingShort(S.doneSignal.tool[t]); };
const reviewWaits = (m: Model): number => { const rv = m.review; return rv && rv.stage !== "reviewed" && rv.count > 0 ? rv.count : 0; };

export type HoverLine = { words: string; colour: Colour };
export type LineInput = {
  /** A line the island has to say (listening, an update, the engine's own line; islandPanel.ts panelNote). */
  note?: string;
  /** What that line is about (home.ts islandLineKind), so it is never matched on its words. */
  noteKind?: IslandLineKind | null;
  /** The job at work, by its name. */
  job?: string | null;
  /** The changes waiting carry the instant key warning (M57). */
  reviewKey?: boolean;
  /** Results finished while Home was closed (M46). */
  unseen?: number;
};
const line = (words: string, k: FactKind): HoverLine => ({ words, colour: factColour(k) });

/** At most one short line, only when it matters, the most urgent first: the engine stopped, a line the island has to say,
 *  Claude not set up yet, the job at work, questions waiting, Claude Code waiting on you in this project, a key in the
 *  changes, changes to review, a check that failed, new results. Null when all is quiet: the greeting stands alone. */
export function hoverLine(m: Model, now: number, o: LineInput = {}): HoverLine | null {
  const L = S.m93.line;
  if (!m.runnerUp) return line(L.off, "off");
  // The island's own line that Claude waits for you is said in the panel's words, in the waiting colour.
  if (o.note && o.noteKind === "claudeWaiting" && claudeWaitsHere(m)) return line(waitsWords(m), "waiting");
  if (o.note) return line(o.note, "note");
  if (m.connected === "none") return line(L.notReady, "notConnected");
  if (o.job) return line(o.job, "working");
  if (m.approvals.length > 0) return line(L.questions(m.approvals.length), "questions");
  if (claudeWaitsHere(m)) return line(waitsWords(m), "waiting");
  const project = projectOf(m);
  if (!nameOf(project)) return null;
  const n = reviewWaits(m);
  if (o.reviewKey && n > 0) return line(S.panel.reviewKey, "failing");
  if (n > 0) return line(L.changes(n), "changes");
  // M105: an AI tool finished and its review is in: which tool, and whether it works.
  const fin = finishedNow(m, now);
  if (fin) return { words: fin.line, colour: fin.colour };
  if (homeStatus(m, project, now).kind === "failing") return line(L.failed, "failing");
  if ((o.unseen ?? 0) > 0) return line(S.panel.unseen(o.unseen!), "ready");
  return null;
}

// ---------- the one action ----------

export type HoverActionId = keyof typeof S.m96.act;
export type HoverAction = { id: HoverActionId; label: string; look: { colour: Colour; icon: IconName };
  /** Where island_go opens Home; null only for Stop, which sends the stop command itself. */
  go: Go | null;
  /** M105: the pill's small dot, for a finished tool whose review found something (it waits for the person). */
  dot?: boolean };
export type ActionInput = { layout: "quick" | "job"; on?: (t: ToolId) => boolean; /** panel.showButtons */ buttons?: boolean };

const ACT: Record<HoverActionId, { go: Go | null; look: { colour: Colour; icon: IconName }; tool: ToolId | null }> = {
  stop: { go: null, look: { colour: MEANING_COLOUR.stopped, icon: "stop" }, tool: null },
  seeWhy: { go: {}, look: { colour: MEANING_COLOUR.problem, icon: "alert" }, tool: null },
  answer: { go: {}, look: { colour: MEANING_COLOUR.question, icon: "wait" }, tool: null },
  claude: { go: {}, look: { colour: MEANING_COLOUR.question, icon: "wait" }, tool: null },
  pick: { go: {}, look: QUICK_LOOK.pick, tool: QUICK_TOOL.pick },
  review: { go: { then: { do: "review" } }, look: QUICK_LOOK.review, tool: QUICK_TOOL.review },
  fix: { go: { then: { do: "find" } }, look: { colour: MEANING_COLOUR.problem, icon: "wrench" }, tool: QUICK_TOOL.check },
  // M96: the receipt's own Undo question, asked in Home (nothing is undone without the person's yes there).
  undo: { go: { then: { do: "undo" } }, look: { colour: "grey", icon: "undo" }, tool: QUICK_TOOL.undo },
  check: { go: { then: { do: "find" } }, look: QUICK_LOOK.check, tool: QUICK_TOOL.check },
  // M105: the review card of the tool that finished, where its result and Undo are (M101). It reviews nothing by itself.
  finished: { go: { then: { do: "review" } }, look: QUICK_LOOK.review, tool: QUICK_TOOL.review },
  home: { go: {}, look: { colour: "grey", icon: "now" }, tool: null },
};
const make = (id: HoverActionId): HoverAction => ({ id, label: S.m96.act[id], look: ACT[id].look, go: ACT[id].go });

/** The ONE primary action for the moment (the choice M84's nextPeek made, plus Fix it and Stop): Stop while a job runs (the
 *  safety action, always there); See why with the engine stopped; Answer for a question; See what Claude asks while Claude
 *  Code waits on you here; Pick a project; Review changes; Fix it after a failed check; Check my project when not checked
 *  or changed since; M96: Undo last change while the last fix can be undone; else Check my project (M93 said Ask when all was fine: M96 asks in the small chat, opened from the
 *  greeting, so the pill always offers a check when nothing waits). An action whose tool is turned off, or with the panel's
 *  buttons off, is Open Home instead. */
export function hoverAction(m: Model, now: number, o: ActionInput): HoverAction {
  if (o.layout === "job") return make("stop");
  if (!m.runnerUp) return make("seeWhy");
  if (m.connected === "none") return make("home");
  if (m.approvals.length > 0) return make("answer");
  // M105: Codex waiting says so in Codex's name (its question is in Codex; Home says where to answer).
  if (claudeWaitsHere(m)) return waitingTool(m) === "claude" ? make("claude") : { ...make("claude"), label: S.m105.waitingAct(S.doneSignal.tool[waitingTool(m)]) };
  const project = projectOf(m);
  const on = o.on ?? (() => true);
  const fin = nameOf(project) && reviewWaits(m) === 0 ? finishedNow(m, now) : null;
  // Undo last change follows the Undo tool's switch (F20): with it off the pill offers the check it would offer anyway.
  const id: HoverActionId = !nameOf(project) ? "pick"
    : reviewWaits(m) > 0 ? "review"
    : fin ? "finished"
    : (() => { const k = homeStatus(m, project, now).kind; return k === "failing" ? "fix" : k === "unchecked" || k === "changed" ? "check" : undoCan(m, project) && on(QUICK_TOOL.undo!) ? "undo" : "check"; })();
  if (o.buttons === false) return make("home");
  const tool = ACT[id].tool;
  if (tool !== null && !on(tool)) return make("home");
  // M105: the pill says the result ("See 2 problems", "See what changed"), with a dot when something was found.
  return id === "finished" && fin ? { ...make(id), label: fin.pill, ...(fin.problems ? { dot: true } : {}) } : make(id);
}
// ---------- M96: the pill's words ----------

/** What waits for the person: the pill says so with a small dot before its words (changes, a question, Claude Code). */
const WAITS: ReadonlySet<HoverActionId> = new Set<HoverActionId>(["review", "answer", "claude"]);
export type HoverPill = { words: string; dot: boolean };
/** The words on the one glowing pill: the action's own, except Review changes, which says how many ("2 changes to review"),
 *  and a small dot when something waits for the person. */
export function hoverPill(a: HoverAction, m: Model): HoverPill {
  const n = reviewWaits(m);
  const words = a.id === "review" && n > 0 ? S.m96.changes(n) : a.label;
  return { words, dot: WAITS.has(a.id) || a.dot === true };
}

// ---------- the size ----------

/** M96: one row under the notch, about 330 wide and 42 tall (island.rs PANEL_W_MIN to PANEL_W, PANEL_MIN to PANEL_MAX). Feel
 *  round 3 (19 Nov 2026): a headline, a hint line and the pill row, 96 tall, as HeyClicky's notch panel has. */
export const HOVER_W = 330;
export const HOVER_H = 96;
/** Feel round 3 (the founder's HeyClicky reference, 18 Nov 2026): the hover panel's quiet second line, under its headline:
 *  the moment's own line when the headline is not already it, else the key for being stuck ("Press ⌃⌥⌘F when stuck"),
 *  else nothing. */
export function hoverHint(head: { words: string; news: boolean }, line: string | null, keyLine: string): string {
  if (line && line !== head.words) return line;
  return keyLine;
}
