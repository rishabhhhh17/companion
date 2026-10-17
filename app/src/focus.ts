// Keeping the keyboard in Home (rule 9, the bar 13). Home never takes the keyboard by itself. But when the control that has
// it goes away (it was pressed and its row changed, an answer closed its card, a step was cancelled), the keyboard falls out
// of Home, and someone using only the keyboard would have to start again from the top. Then, and only while Home has the
// keyboard and nothing in it does (a11y.ts `focusLost`), the keyboard goes back near where it was (`focusSpot`): to the
// button a closed step was opened from, else the nearest part of Home still showing (its panel or settings row), else the
// open tab. Nothing is read but which element has the keyboard; nothing runs on a timer.
import { backStill, focusLost, focusSpot } from "./a11y.ts";

let back: { id: string; at: number } | null = null;
/** A step that closed, or a box put away, asks for the keyboard to go back to the control it was opened from. */
export function focusBack(id: string): void { back = { id, at: Date.now() }; }

const lost = () => { const a = document.activeElement; return focusLost(a ? { tag: a.tagName } : null, document.hasFocus()); };

/** For a box that opens from the person's own press (Edit, Open from a link, Replace the key): the button they pressed is
 *  gone, so the keyboard goes into the box. Used as a ref; never when Home does not have the keyboard. */
export function focusIfLost(el: HTMLElement | null): void { if (el && lost()) el.focus(); }

// The parts of Home the keyboard can be put back on: a panel, a settings row or a confirm step, a details box.
const SPOTS = 'section, [role="group"], details';

/** Watches Home's page for the control with the keyboard going away; returns the function that stops watching. */
export function keepFocus(root: HTMLElement, tab: () => HTMLElement | null): () => void {
  let last: HTMLElement | null = null, around: HTMLElement[] = [];
  const onIn = (e: FocusEvent) => {
    if (!(e.target instanceof HTMLElement)) return;
    last = e.target; around = [];
    for (let p = e.target.parentElement; p && p !== root; p = p.parentElement) if (p.matches(SPOTS)) around.push(p);
  };
  // The person took the keyboard somewhere else themselves (another app, a click): nothing to keep.
  const onOut = (e: FocusEvent) => { const t = e.target; queueMicrotask(() => { if (t === last && last?.isConnected) last = null; }); };
  const fix = () => {
    const gone = last;
    if (!gone || gone.isConnected) return;
    last = null;
    const asked = back && backStill(back.at, Date.now()) ? document.getElementById(back.id) : null;
    back = null;
    if (!lost()) return;
    const spot = around.find((p) => p.isConnected) ?? null;
    const where = focusSpot({ back: !!asked && asked.isConnected && !(asked as HTMLButtonElement).disabled, spot: !!spot });
    const el = where === "back" ? asked : where === "spot" ? spot : tab();
    if (!el) return;
    if (where === "spot" && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus();
  };
  root.addEventListener("focusin", onIn);
  root.addEventListener("focusout", onOut);
  const watch = new MutationObserver(fix);
  watch.observe(root, { childList: true, subtree: true });
  return () => { root.removeEventListener("focusin", onIn); root.removeEventListener("focusout", onOut); watch.disconnect(); };
}
