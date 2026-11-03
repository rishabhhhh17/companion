// What you use often (M55, adapts to you): the ways to ask you press most rise to the top of More ways to ask. It is
// learned only from your own presses inside Squibby (rule 15): a real press on one of those buttons, by the pointer or the
// keyboard. Never a hotkey, words from hold to talk, a click made by code, or anything outside Squibby. Only a count for
// each way is kept, only on this Mac, in this page's own storage. Reset in Settings forgets it, and Delete everything does
// too (it removes the pages' storage, wipe.rs). Off (home.usedOftenFirst), nothing is counted and the usual order shows.
// Plain code, tested in adaptsToYou.test.ts; card.tsx draws the order, settingsPage.tsx the Reset.
import { useMemo, useSyncExternalStore } from "react";
import { S } from "./strings.ts";

/** The ways in More ways to ask, in their usual order. */
export const WAYS = ["find", "safe", "explain", "showMe", "plan", "rescue", "research", "online", "bisect", "drawIt"] as const;
export type Way = (typeof WAYS)[number];
/** Each way by the words on its button, for Settings to say what comes first. */
export const wayLabel = (w: Way): string => ({
  find: S.look.chipFind, safe: S.look.chipSafe, explain: S.look.chipExplain, showMe: S.look.chipShowMe, plan: S.planIt,
  rescue: S.rescueIt, research: S.researchIt, online: S.onlineButton, bisect: S.bisectButton, drawIt: S.drawIt,
} as Record<Way, string>)[w];

export const USED_KEY = "companion.usedOften";
/** A way rises only once it was pressed this many times: one press is not a habit. */
export const MIN_USES = 2;
/** A count stops here, so a way pressed a lot long ago can still be caught up. */
export const MAX_USES = 50;
export type Counts = Partial<Record<Way, number>>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
const pageStore = (): Store => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const isWay = (w: string): w is Way => (WAYS as readonly string[]).includes(w);

/** The counts kept: only ways on the list, only whole counts from 1 to MAX_USES. Anything else is dropped, never guessed. */
export function readCounts(st: Store = pageStore()): Counts {
  let raw: unknown = null;
  try { raw = JSON.parse(st?.getItem(USED_KEY) ?? "null"); } catch { return {}; }
  const c = raw !== null && typeof raw === "object" ? (raw as { counts?: unknown }).counts : null;
  if (!c || typeof c !== "object") return {};
  const out: Counts = {};
  for (const [k, v] of Object.entries(c)) if (isWay(k) && Number.isInteger(v) && (v as number) >= 1) out[k] = Math.min(MAX_USES, v as number);
  return out;
}

// Whoever draws the counts (Settings' Reset row) hears a change at once.
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version += 1; for (const l of listeners) l(); };

/** A press of a way. Counted only when the person made it (trusted: the browser says so for a real press, never for a
 *  click made by code) and the setting is on. Says whether it counted. */
export function notePress(way: Way, o: { trusted: boolean; on: boolean }, st: Store = pageStore()): boolean {
  if (!o.trusted || !o.on || !isWay(way) || !st) return false;
  const counts = readCounts(st);
  counts[way] = Math.min(MAX_USES, (counts[way] ?? 0) + 1);
  try { st.setItem(USED_KEY, JSON.stringify({ v: 1, counts })); } catch { return false; }
  changed();
  return true;
}

/** Reset: everything learned is forgotten and the usual order is back. */
export function resetUsed(st: Store = pageStore()): void {
  try { st?.removeItem(USED_KEY); } catch { /* storage may be unavailable */ }
  changed();
}

/** The ways that come first now, most pressed first; a tie keeps the usual order. */
export function risen(counts: Counts): Way[] {
  return WAYS.filter((w) => (counts[w] ?? 0) >= MIN_USES).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || WAYS.indexOf(a) - WAYS.indexOf(b));
}

/** The ways in the order to draw them: the ones that rose first, then the rest in the usual order. Off: the usual order. */
export function orderWays<T extends { id: Way }>(ways: readonly T[], counts: Counts, on = true): T[] {
  const usual = [...ways].sort((a, b) => WAYS.indexOf(a.id) - WAYS.indexOf(b.id));
  if (!on) return usual;
  const first = risen(counts);
  return [...first.flatMap((w) => usual.filter((x) => x.id === w)), ...usual.filter((x) => !first.includes(x.id))];
}

/** The counts as they are now, again after each press or Reset. */
export function useUsedOften(): Counts {
  const v = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version, () => 0);
  return useMemo(() => readCounts(), [v]);
}
