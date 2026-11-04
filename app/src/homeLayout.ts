// Home's layout (look.layout; M51 step 2, the founder, 1 Nov 2026). Wide, the usual: a landscape window with a list on the
// left (the places, then the recent work, then Settings at its foot, as HeyClicky has it) and the work on the right, with the
// ask box along the bottom of the work. Tall: the panel from before, one column with the places in its top row. The shell
// sizes Home from the same setting (island.rs HomeSize::of) and keeps the character clear of it. Plain code, tested in
// homeLayout.test.ts.
import { useEffect, type RefObject } from "react";
import type { HistoryItem } from "./model.ts";
import { taskName } from "./itemLook.ts";
import type { Tab } from "./home.ts";
import type { TextSize } from "./textsize.ts";
import { S } from "./strings.ts";

export type Layout = "wide" | "tall";
export const LAYOUT_DEFAULT: Layout = "wide";

/** A saved value as a layout: tall only when it says tall; anything else is the usual, wide. */
export const layoutOf = (v: unknown): Layout => (v === "tall" ? "tall" : LAYOUT_DEFAULT);

/** The text sizes the list fits beside the work at, in a Home 688 wide: Standard and Large. With larger text Home stays wide,
 *  and the places go back to the top row, so the words keep their room. */
export const sideFits = (t: TextSize): boolean => t === "standard" || t === "large";

/** Whether Home draws its list on the left now: in the wide layout, once set up, at a text size it fits, and on every place
 *  but Settings, which has its own list of sections there. */
export function sideOn(o: { layout: Layout; text: TextSize; onboarded: boolean; tab: Tab }): boolean {
  return o.layout === "wide" && sideFits(o.text) && o.onboarded && o.tab !== "settings";
}

export type SidePlace = "now" | "learn" | "did" | "memory";
/** The places in the list, top to bottom. Learn is there while guides are on (the top row hides it once a practice is done
 *  to keep the row short; the list has room). Settings sits at the foot of the list, not here. */
export function sidePlaces(o: { learnOn: boolean }): SidePlace[] {
  return ["now", ...(o.learnOn ? ["learn" as const] : []), "did", "memory"];
}

/** One line per task (M51 polish), so the list holds about ten at Standard text; more scroll, with a fade at the cut. */
export const SIDE_RECENT_MAX = 10;
/** The recent work in the list: tasks with a name (a bare "Before: " has none), the newest first, at most ten. */
export function sideRecent(items: readonly HistoryItem[]): HistoryItem[] {
  return items.filter((i) => taskName(i.label)).sort((a, b) => (b.startedAt > a.startedAt ? 1 : b.startedAt < a.startedAt ? -1 : 0)).slice(0, SIDE_RECENT_MAX);
}

/** Whether Home has more work below the window to scroll to (more than a rounding pixel). The fade over the work above the
 *  ask box shows only then (ui/wide.css data-more), so at rest, and at the end of the list, the last card reads in full. */
export function moreBelow(o: { scrollHeight: number; clientHeight: number; scrollTop: number }): boolean {
  return o.scrollHeight - o.clientHeight - o.scrollTop > 1;
}
/** Live: keeps data-more on Home while there is more below, on scroll and whenever Home or its work changes size. */
export function useMoreBelow(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const check = () => el.toggleAttribute("data-more", moreBelow(el));
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    const inner = el.querySelector(".inner");
    if (inner) ro?.observe(inner);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, [root]);
}

/** Whether the sea goes on down from Flowflow's waterline to the ask box (the wide Home at rest, M51 polish): only while
 *  nothing comes between the status and the ask box, since a card under the status (a review, a recap, a toast, a notice,
 *  an error, About this project) would cut the sea across in a hard seam (the audit, item 5). With the light behind Home
 *  off (the usual since 2 Nov 2026) the sea is drawn at no strength (ui/tokens.css --sea-fill-a), so Home is a plain page. */
export function seaFills(o: { side: boolean; tab: Tab; mode: string; cardsUnder: boolean }): boolean {
  return o.side && o.tab === "now" && o.mode === "rest" && !o.cardsUnder;
}

// ---------- M69, the system: one layout grammar (the YC benchmark spec 3) ----------
// Every look and both layouts: the top bar carries the project's status dot and name, one line of context and the Fix it
// key on the right; the ask box is pinned at the bottom of the work; Settings is the last place. The context line holds
// what the footer line said before (Checked 2 min ago · Undo is ready), then the project's kind when the folder itself says
// it (project.report origin), then the folder.

/** The folder as a person reads it: their home folder as ~. */
export const shortPath = (project: string): string => project.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");

/** The top bar's one line of context, its parts in the order they show (the line is cut at its end, so the status leads):
 *  the footer's words, the project's kind only when it was found in this folder (never a guess, never who changed what,
 *  M57), and the folder. Nothing without a project. */
export function barContext(o: { project: string; foot: { start: string; end: string } | null; about?: { project: string; origin: string } | null; tall?: boolean }): string[] {
  if (!o.project) return [];
  const kind = o.about && o.about.project === o.project ? S.look.origin[o.about.origin] : undefined;
  // The tall Home has room for one thing before the key: the kind when the folder says it, else the folder (never the
  // check's time, which the hero or the card says).
  const where = o.tall ? [kind ?? shortPath(o.project)] : [kind, shortPath(o.project)];
  return (o.tall ? where : [o.foot?.start, o.foot?.end, ...where]).filter((x): x is string => !!x);
}

/** The key the top bar shows on its right: Fix it's, the one F28 key for being stuck, only while it is bound. No other key
 *  is ever named there, and none is added (the founder's four keys stay the only ones). */
export const barKeyChord = (keys: { using: Record<string, string | null> }): string | null => keys.using.problem ?? null;
