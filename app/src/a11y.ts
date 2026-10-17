// Accessibility as part of done (AGENTS.md, the bar 13): what VoiceOver is told about Home, and how the keyboard moves
// inside it. Plain code with no page in it, tested in a11y.test.ts; card.tsx, confirm.tsx and focus.ts only do what this
// decides. Nothing here ever takes the keyboard: Companion never does that by itself (rule 9).
import { shouldTakeFocus } from "./cardlogic.ts";
import { driveWords, pausedWords, receiptProofWords, stuckWords, type Model } from "./model.ts";
import { S } from "./strings.ts";

// ---- what Home says out loud ----

/** One thing worth saying, and a key that changes when it is a new thing. */
export type News = { key: string; text: string };

/** Everything on Home worth saying out loud now, most important first: an error, a question, the loop card, a pause, a
 *  plan to look at, a finished task. Said politely through one live line (`liveLine`), never by moving the keyboard. */
export function newsOf(m: Model): News[] {
  const out: News[] = [];
  if (m.error) out.push({ key: `error:${m.error}`, text: m.error });
  for (const a of m.approvals) out.push({ key: `approval:${a.id}`, text: `${S.needsYouTitle}: ${a.title}` });
  if (m.agentsAsk) out.push({ key: "agents", text: S.agentsTitle });
  if (m.stuck) out.push({ key: `stuck:${m.stuck.index}:${m.stuck.title}`, text: `${S.stuckTitle}: ${stuckWords(m)}` });
  if (m.paused) out.push({ key: `paused:${m.paused.reason}`, text: pausedWords(m) ?? S.pausedTitle });
  if (m.plan) out.push({ key: `plan:${m.plan.agent}:${m.plan.steps.length}`, text: S.saidPlan(m.plan.steps.length) });
  const f = m.drive?.finished;
  if (f) out.push({ key: `drive:${f.status}:${f.completed}:${f.total}`, text: driveWords(m) ?? "" });
  if (m.receipt) {
    const label = m.task?.label ?? "";
    out.push({ key: `receipt:${m.receipt.checkpoint}`, text: m.receipt.proof === "failed" ? S.saidNotDone(label) : S.saidDone(label, receiptProofWords(m)) });
  }
  return out.filter((n) => n.text.trim() !== "");
}

const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/** The one live line on Home: its words, and the things they are about. */
export type LiveLine = { text: string; keys: string[] };
export const EMPTY_LINE: LiveLine = { text: "", keys: [] };

/** The live line after a change, given what was said already (`said`: the keys showing at the last change). Only new
 *  things are said, each as its own sentence, and they replace its words. With nothing new, it keeps its words while
 *  something they are about still shows, and empties once all of it is gone: a live line whose words do not change is not
 *  said again, so the same thing coming back later must find it empty, and VoiceOver never finds old news there. */
export function liveLine(line: LiveLine, said: readonly string[], m: Model): { said: string[]; line: LiveLine } {
  const now = newsOf(m), keys = now.map((n) => n.key);
  const fresh = now.filter((n) => !said.includes(n.key));
  if (fresh.length) return { said: keys, line: { text: fresh.map((n) => sentence(n.text)).join(" "), keys: fresh.map((n) => n.key) } };
  return { said: keys, line: line.keys.some((k) => keys.includes(k)) ? line : EMPTY_LINE };
}

// ---- the keyboard ----

/** Has nothing the keyboard, in a window that has it? Then the control that had it went away (it was pressed, or an answer
 *  closed it), and the keyboard may be put back near where it was. Never wider than the rule a question follows
 *  (`shouldTakeFocus`): never when Home does not have the keyboard, never from someone typing. */
export function focusLost(active: { tag: string } | null, windowHasFocus: boolean): boolean {
  const nothing = !active || active.tag === "BODY" || active.tag === "HTML";
  return nothing && shouldTakeFocus(null, windowHasFocus);
}

/** A key pressed inside a confirm step ("are you sure"): Tab and Shift Tab go round its own choices and never leave it,
 *  the arrows and Home and End move between its buttons (a box keeps its own arrow keys), Escape takes the step away the
 *  way its Cancel does. Enter and Space are the button's own press, so they are left alone. */
export type StepKey = "next" | "prev" | "first" | "last" | "cancel";
export function confirmKey(key: string, shift: boolean, onButton: boolean): StepKey | null {
  switch (key) {
    case "Tab": return shift ? "prev" : "next";
    case "Escape": return "cancel";
    case "ArrowRight": case "ArrowDown": return onButton ? "next" : null;
    case "ArrowLeft": case "ArrowUp": return onButton ? "prev" : null;
    case "Home": return onButton ? "first" : null;
    case "End": return onButton ? "last" : null;
    default: return null;
  }
}

/** Which of `count` choices comes next, going round. -1 (none of them has it): the first going forward, the last going
 *  back. -1 when there is nothing to go to. */
export function stepTo(index: number, count: number, k: Exclude<StepKey, "cancel">): number {
  if (count <= 0) return -1;
  switch (k) {
    case "first": return 0;
    case "last": return count - 1;
    case "next": return index < 0 ? 0 : (index + 1) % count;
    case "prev": return index < 0 ? count - 1 : (index - 1 + count) % count;
  }
}

/** Where the keyboard goes when the control that had it went away: back to the control a closed step was opened from, else
 *  the nearest part of Home still showing (its panel or settings row), else the tab that is open. */
export type Spot = "back" | "spot" | "tab";
export function focusSpot(o: { back: boolean; spot: boolean }): Spot { return o.back ? "back" : o.spot ? "spot" : "tab"; }

/** A step that closed asks for the keyboard to go back; the ask is good only just after it closed, so an old one never
 *  sends the keyboard somewhere later. */
export const BACK_MS = 1000;
export function backStill(at: number, now: number): boolean { return now >= at && now - at <= BACK_MS; }
