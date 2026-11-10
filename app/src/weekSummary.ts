// M79: the weekly summary, the pages' side. Opened from a "This week" row in History, on the person's press only: never
// pushed, never a notification. A plain page for the open project, built only from the engine's counts of real rows
// (week.summary): changes reviewed, what was caught, fixes proven, Undos, copies saved before destructive commands, and
// the decisions and house rules Claude Code is told at the start. Parts at zero are left out; an empty week says so
// plainly. Counts only: no streak, no praise, no score (rule 16). Every word is in strings.ts.
import type { WeekView } from "../../protocol/index.ts";
import { showWeek } from "./commands.ts";
import { dayWords } from "./plan.ts";
import { S } from "./strings.ts";

const whole = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);

/** The week the engine sent for this project, or null for anything else (another project, a count that is not a count). */
export function weekFrom(e: unknown, project: string): WeekView | null {
  const o = e as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.type !== "week.summary" || o.project !== project) return null;
  const w = o.week as Record<string, unknown> | null, c = (w?.caught ?? null) as Record<string, unknown> | null;
  if (!w || typeof w !== "object" || !c || typeof c !== "object") return null;
  if (typeof w.since !== "string" || typeof w.until !== "string" || Number.isNaN(Date.parse(w.since)) || Number.isNaN(Date.parse(w.until))) return null;
  const n = (k: string) => whole(w[k]), m = (k: string) => whole(c[k]);
  const counts = { reviews: n("reviews"), files: n("files"), proven: n("proven"), undone: n("undone"), saved: n("saved"), savedUsed: n("savedUsed"), againstRules: n("againstRules") };
  const caught = { keys: m("keys"), weakened: m("weakened"), falseDones: m("falseDones"), packages: m("packages") };
  if (Object.values(counts).some((x) => x === null) || Object.values(caught).some((x) => x === null)) return null;
  const decisions = Array.isArray(w.decisions) ? w.decisions.filter((d): d is string => typeof d === "string" && d.length > 0).slice(0, 10).map((d) => d.slice(0, 300)) : [];
  return { since: w.since, until: w.until, ...(counts as Record<keyof typeof counts, number>), caught: caught as WeekView["caught"], decisions };
}

/** Whether anything at all happened in the week (the decisions are standing notes, not something that happened). */
export const weekEmpty = (w: WeekView): boolean => w.reviews + w.proven + w.undone + w.saved + w.caught.keys + w.caught.weakened + w.caught.falseDones + w.caught.packages === 0;

const two = (n: number) => String(n).padStart(2, "0");
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

export type WeekPage = { title: string; range: string; empty: boolean; lines: string[]; caught: string[]; decisionsTitle: string; decisions: string[]; rules: string };
/** The page in words. Only parts above zero; an empty week is one plain line. The house rules line is said only when
 *  something was reviewed (otherwise there is nothing it could rest on). */
export function weekPage(w: WeekView): WeekPage {
  const s = S.m79.week;
  const caught = [
    ...(w.caught.keys ? [s.caught.keys(w.caught.keys)] : []),
    ...(w.caught.weakened ? [s.caught.weakened(w.caught.weakened)] : []),
    ...(w.caught.falseDones ? [s.caught.falseDones(w.caught.falseDones)] : []),
    ...(w.caught.packages ? [s.caught.packages(w.caught.packages)] : []),
  ];
  const lines = [
    ...(w.reviews ? [s.reviewed(w.reviews, w.files)] : []),
    ...(w.proven ? [s.proven(w.proven)] : []),
    ...(w.undone ? [s.undone(w.undone)] : []),
    ...(w.saved ? [s.saved(w.saved, w.savedUsed)] : []),
  ];
  return {
    title: s.title, range: s.range(dayWords(localDay(w.since)), dayWords(localDay(w.until))), empty: weekEmpty(w), lines, caught,
    decisionsTitle: s.decisionsTitle, decisions: w.decisions,
    rules: w.reviews ? (w.againstRules ? s.againstRules(w.againstRules) : s.noneAgainstRules) : "",
  };
}

/** The press of the "This week" row: the command it sends (the summary is never asked for any other way). */
export const weekAsk = (project: string) => showWeek(project);
