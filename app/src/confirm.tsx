// An "are you sure" step inside Home (delete everything, remove the key, erase a list, make it live, roll back, undo), and
// the keyboard's way through it (AGENTS.md, the bar 13). Opened by the person's own press, it takes the keyboard to its
// safe choice (the one marked data-cancel), because the button they pressed is gone. While it is open, Tab and Shift Tab
// go round its own choices only, the arrows move between its buttons, and Escape takes it away the way its Cancel does (not
// Home). When it closes, the keyboard goes back to the button it was opened from (focus.ts). It never takes the keyboard
// when Home does not have it. The key logic is plain code in a11y.ts, tested there; opening is `openStep`, tested in
// focus.test.ts against a stand in page.
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { confirmKey, stepTo } from "./a11y.ts";
import { focusBack, takeIfLost, type Page } from "./focus.ts";

const choices = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")).filter((c) => !(c as HTMLButtonElement).disabled && c.tabIndex >= 0);

/** The step just opened from the person's own press: the keyboard goes to its safe choice (else its first choice), only
 *  when Home has the keyboard and nothing in it does (`takeIfLost`). */
const safeChoice = (box: HTMLElement) => box.querySelector<HTMLElement>("[data-cancel]") ?? choices(box)[0];
/** So the button a step is opened from must step aside while the step is open (the review's Fix it, Undo): if it stayed on
 *  screen with the keyboard, the step could not take it, and Escape would close Home instead of the question (the audit,
 *  item 7; focus.test.ts). */
export function openStep(box: HTMLElement | null, p?: Page): boolean {
  return !!box && takeIfLost(() => safeChoice(box), p);
}

/** label: the question, for VoiceOver. back: the id of the button that opened it. onCancel: what its Cancel does. */
export function ConfirmStep({ label, back, onCancel, className, children }: { label: string; back: string; onCancel: () => void; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    openStep(box.current);
    // Into view, but only as far as needed, so a step opened under the ask box is never off screen.
    box.current?.scrollIntoView?.({ block: "nearest" });
    return () => focusBack(back);
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
    const t = e.target as HTMLElement;
    const k = confirmKey(e.key, e.shiftKey, t.tagName === "BUTTON");
    if (!k || !box.current) return;
    e.preventDefault(); e.stopPropagation();
    if (k === "cancel") { onCancel(); return; }
    const list = choices(box.current);
    list[stepTo(list.indexOf(t), list.length, k)]?.focus();
  };
  return <div ref={box} className={`confirm-step${className ? ` ${className}` : ""}`} role="group" aria-label={label} onKeyDown={onKeyDown}>{children}</div>;
}
