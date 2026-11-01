// The small details of the look (M51 step 3, after HeyClicky's window, which the founder liked): a small tile per item in
// the lists, its drawing and its colour both saying what kind of work it was, and a small upright badge on an item that is
// working, new, proven or needs you (M51 polish: the tilted stamps and the colours with no meaning read as toys). Plain code, tested in lookChoices.test.ts. The colours are tokens (ui/tokens.css); Settings
// makes the tiles grey (look.icons) or takes the stamps off (look.stamps) by tokens alone, so nothing here reads those.
// No stamp counts anything and none is a reward: each says only what is true of the item (rule 16).
import { historyFacts, type HistoryItem } from "./model.ts";
import type { IconName } from "./icons.tsx";
import { verdictOf, type VerdictKind } from "./verdict.ts";

/** The five tints, each meaning one kind of work (KIND_TINT), the same with every water. Graphite and Deep draw them as deep
 *  washes with a light ink, Paper as pastels with a dark ink (ui/tokens.css). */
export const TINTS = ["sky", "mint", "rose", "sun", "lilac"] as const;
export type Tint = (typeof TINTS)[number];

/** A task's name as a person reads it. The engine names a safety copy "Before: " and the words asked (agent.ts), and a
 *  task row from an older log may carry that label; every list shows only the words asked (M51 polish: History and the
 *  list on the left said it two ways). */
export const taskName = (label: string): string => (typeof label === "string" ? label : "").replace(/^\s*Before:\s*/i, "").trim();

/** What kind of work it was, from the words asked: an explanation, a fix, going live, making it better, a question,
 *  something made, or something else. The first that matches wins, so "Explain why the page is blank" is an explanation,
 *  not a fix, and "Make the page load faster" is making it better, not something new. */
export const KINDS = ["explain", "fix", "live", "improve", "question", "make", "other"] as const;
export type Kind = (typeof KINDS)[number];
const KIND_WORDS: readonly [RegExp, Kind][] = [
  [/\b(explain|teach|learn|understand)\b/i, "explain"],
  [/\b(fix|fixed|fixing|broken|break|breaks|bug|bugs|error|errors|fail|fails|failing|crash|crashes|wrong|stuck|blank)\b/i, "fix"],
  [/\b(deploy|ship|publish|live|launch|release)\b/i, "live"],
  [/\b(faster|speed|slow|tidy|clean|cleanup|improve|polish|refactor|simplify|smaller)\b/i, "improve"],
  [/\b(find|search|research|compare|which|what|why|how|where)\b|\?\s*$/i, "question"],
  [/\b(make|build|create|add|new|write|start|design)\b/i, "make"],
];
export function kindOf(label: string): Kind {
  for (const [re, k] of KIND_WORDS) if (re.test(label ?? "")) return k;
  return "other";
}
/** Each kind's drawing. */
export const KIND_GLYPH: Readonly<Record<Kind, IconName>> = { explain: "learn", fix: "wrench", live: "send", improve: "clean", question: "find", make: "grid", other: "text" };
/** Each kind's colour, so a colour always means the same thing in every list (a fix is rose wherever it shows). Making it
 *  better and anything else are plain grey: colour is kept for the kinds a person looks for. */
export const KIND_TINT: Readonly<Record<Kind, Tint | "plain">> = { explain: "lilac", fix: "rose", live: "mint", improve: "plain", question: "sky", make: "sun", other: "plain" };
/** The drawing for a task's words. */
export const glyphOf = (label: string): IconName => KIND_GLYPH[kindOf(label)];

export const STAMPS = ["working", "new", "proven", "needsYou"] as const;
export type Stamp = (typeof STAMPS)[number];

/** How long a task that just finished is stamped New. */
export const NEW_MINUTES = 10;
/** The results that may be New: an answer, or a change not yet proven. Never a failure, a stop, an undo or a limit. */
const NEW_KINDS: readonly VerdictKind[] = ["noChange", "unchecked", "partial"];

/** A task's stamp: Working while it runs, Needs you while it waits for the person, Proven once its checks passed, New for
 *  ten minutes after an answer or an unproven change. Nothing else is stamped; its own mark says how it ended. */
export function historyStamp(i: Pick<HistoryItem, "status" | "proof" | "changed" | "undone" | "startedAt" | "endedAt"> & Partial<Pick<HistoryItem, "back">>, now: number): Stamp | null {
  if (i.status === "running") return "working";
  const v = verdictOf(historyFacts(i));
  if (v.kind === "needsYou") return "needsYou";
  if (v.kind === "proven") return "proven";
  if (!NEW_KINDS.includes(v.kind)) return null;
  const end = Date.parse(i.endedAt ?? i.startedAt);
  return Number.isFinite(end) && now >= end && now - end <= NEW_MINUTES * 60_000 ? "new" : null;
}

/** The badges the narrow list on the left shows: only the states a person may act on or has not seen (as HeyClicky badges
 *  two rows of twelve). Proven shows there as its green tick, which leaves the task's name the room to be read. */
export const SIDE_STAMPS: readonly Stamp[] = ["working", "needsYou", "new"];
export const sideStamp = (s: Stamp | null): Stamp | null => (s && SIDE_STAMPS.includes(s) ? s : null);

/** A practice's stamp: Proven once it was fixed and proven. */
export function practiceStamp(state: "notStarted" | "inProgress" | "done"): Stamp | null {
  return state === "done" ? "proven" : null;
}
