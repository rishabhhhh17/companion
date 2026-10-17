// An "are you sure" step inside Home (delete everything, remove the key, erase a list, make it live, roll back, undo), and
// the keyboard's way through it (AGENTS.md, the bar 13). Opened by the person's own press, it takes the keyboard to its
// safe choice (the one marked data-cancel), because the button they pressed is gone. While it is open, Tab and Shift Tab
// go round its own choices only, the arrows move between its buttons, and Escape takes it away the way its Cancel does (not
// Home). When it closes, the keyboard goes back to the button it was opened from (focus.ts). It never takes the keyboard
// when Home does not have it. The key logic is plain code in a11y.ts, tested there.
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { confirmKey, focusLost, stepTo } from "./a11y.ts";
import { focusBack } from "./focus.ts";

const choices = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")).filter((c) => !(c as HTMLButtonElement).disabled && c.tabIndex >= 0);

/** label: the question, for VoiceOver. back: the id of the button that opened it. onCancel: what its Cancel does. */
export function ConfirmStep({ label, back, onCancel, className, children }: { label: string; back: string; onCancel: () => void; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current, a = document.activeElement;
    if (el && focusLost(a ? { tag: a.tagName } : null, document.hasFocus())) (el.querySelector<HTMLElement>("[data-cancel]") ?? choices(el)[0])?.focus();
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
  return <div ref={box} className={className} role="group" aria-label={label} onKeyDown={onKeyDown}>{children}</div>;
}
