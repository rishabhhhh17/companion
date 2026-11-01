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
