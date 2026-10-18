// Keeping the keyboard in Home (rule 9, the bar 13). Home never takes the keyboard by itself. But when the control that has
// it goes away (it was pressed and its row changed, an answer closed its card, a step was cancelled), the keyboard falls out
// of Home, and someone using only the keyboard would have to start again from the top. Then, and only while Home has the
// keyboard and nothing in it does (a11y.ts `focusLost`), the keyboard goes back near where it was (`focusSpot`): to the
// button a closed step was opened from, else the nearest part of Home still showing (its panel or settings row), else the
// open tab. Nothing is read but which element has the keyboard; nothing runs on a timer.
//
// Every move of the keyboard here goes through `takeIfLost` or `refocus`, and each asks `lostIn` first. Both take the page
// as a value (`Page`), so focus.test.ts runs them against a stand in page: taking a guard out fails a test there.
import { backStill, focusLost, focusSpot } from "./a11y.ts";

/** An element the keyboard can be put on. */
export type Focusable = {
  focus(): void;
  readonly isConnected: boolean;
  readonly tagName: string;
  readonly disabled?: boolean;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
};
/** What this file reads from the page: which element has the keyboard, whether Home's window has it, an element by its
 *  id, the time. */
export type Page = { active(): { tagName: string } | null; hasFocus(): boolean; byId(id: string): Focusable | null; now(): number };
export const PAGE: Page = {
  active: () => document.activeElement,
  hasFocus: () => document.hasFocus(),
  byId: (id) => document.getElementById(id),
  now: () => Date.now(),
};

/** Home has the keyboard and nothing in it does, so the control that had it went away. */
const lostIn = (p: Page) => { const a = p.active(); return focusLost(a ? { tag: a.tagName } : null, p.hasFocus()); };

/** Puts the keyboard on what `pick` finds, only when Home has the keyboard and nothing in it does. The one way the other
 *  parts of Home (a box opened from a press, a confirm step, a tab shown by itself) move the keyboard. */
export function takeIfLost(pick: () => Focusable | null | undefined, p: Page = PAGE): boolean {
  if (!lostIn(p)) return false;
  const el = pick();
  if (!el) return false;
  el.focus();
  return true;
}

/** For a box that opens from the person's own press (Edit, Open from a link, Replace the key): the button they pressed is
 *  gone, so the keyboard goes into the box. Used as a ref; never when Home does not have the keyboard. */
export function focusIfLost(el: Focusable | null, p: Page = PAGE): void { takeIfLost(() => el, p); }

let back: { id: string; at: number } | null = null;
/** A step that closed, or a box put away, asks for the keyboard to go back to the control it was opened from. */
export function focusBack(id: string, p: Page = PAGE): void { back = { id, at: p.now() }; }

/** What keepFocus saw: the control that last had the keyboard in Home, and the parts of Home around it, nearest first. */
export type Seen<E extends Focusable = Focusable> = { last: E | null; around: E[] };

/** After Home's page changed: if the control that had the keyboard is gone, and Home has the keyboard and nothing in it
 *  does, the keyboard goes back near where it was. A way back asked by a closed step is used once, and only just after.
 *  Returns what got the keyboard, or null when nothing moved. */
export function refocus(seen: Seen, tab: () => Focusable | null, p: Page = PAGE): Focusable | null {
  const gone = seen.last;
  if (!gone || gone.isConnected) return null;
  seen.last = null;
  const asked = back && backStill(back.at, p.now()) ? p.byId(back.id) : null;
  back = null;
  if (!lostIn(p)) return null;
  const spot = seen.around.find((x) => x.isConnected) ?? null;
  const where = focusSpot({ back: !!asked && asked.isConnected && !asked.disabled, spot: !!spot });
  const el = where === "back" ? asked : where === "spot" ? spot : tab();
  if (!el) return null;
  if (where === "spot" && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus();
  return el;
}

// The parts of Home the keyboard can be put back on: a panel, a settings row or a confirm step, a details box.
const SPOTS = 'section, [role="group"], details';

/** Watches Home's page for the control with the keyboard going away; returns the function that stops watching. */
export function keepFocus(root: HTMLElement, tab: () => HTMLElement | null): () => void {
  const seen: Seen<HTMLElement> = { last: null, around: [] };
  const onIn = (e: FocusEvent) => {
    if (!(e.target instanceof HTMLElement)) return;
    seen.last = e.target; seen.around = [];
    for (let p = e.target.parentElement; p && p !== root; p = p.parentElement) if (p.matches(SPOTS)) seen.around.push(p);
  };
  // The person took the keyboard somewhere else themselves (another app, a click): nothing to keep.
  const onOut = (e: FocusEvent) => { const t = e.target; queueMicrotask(() => { if (t === seen.last && seen.last?.isConnected) seen.last = null; }); };
  root.addEventListener("focusin", onIn);
  root.addEventListener("focusout", onOut);
  const watch = new MutationObserver(() => refocus(seen, tab));
  watch.observe(root, { childList: true, subtree: true });
  return () => { root.removeEventListener("focusin", onIn); root.removeEventListener("focusout", onOut); watch.disconnect(); };
}
