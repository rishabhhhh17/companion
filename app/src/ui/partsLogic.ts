// The logic inside the parts (ui/parts.tsx), kept pure so it is tested without a page (ui/partsLogic.test.ts): how a
// stepper reads and clamps a number, how the arrows move through a segmented control or a menu, where a menu opens, and
// which mark a verdict shows. Nothing here decides a result: the verdict comes whole from verdict.ts (M45).
import type { Tone, Verdict } from "../verdict.ts";

export type Range = { min?: number; max?: number; step?: number };

/** How many decimals a step has (0.5 has 1), so a stepped value never shows 0.30000000000000004. */
const decimals = (n: number): number => { const s = String(n); const i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; };
const tidy = (n: number, step: number | undefined): number => Number(n.toFixed(Math.min(6, decimals(step ?? 1))));

/** A typed number, in the person's own words: "3", " 12.5 ", "1,5", "1,000". A comma between groups of three digits is a
 *  thousands comma ("1,000" is a thousand); any other single comma is a decimal point ("1,5" is one and a half). Null when
 *  it is not one number. */
export function numberFromText(text: string): number | null {
  let t = text.trim().replace(/^−/, "-");
  t = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type Stepped = { value: number; note: "max" | "min" | null };

/** Keeps a number inside its range. A value past an end is set to that end, and the note says which, so the page can say
 *  "Set to 10, the most it can be." (the spec, 2.3 Stepper). */
export function clampTo(n: number, r: Range): Stepped {
  if (r.max !== undefined && n > r.max) return { value: r.max, note: "max" };
  if (r.min !== undefined && n < r.min) return { value: r.min, note: "min" };
  return { value: tidy(n, r.step), note: null };
}

/** What a typed value becomes when Return is pressed or the box is left: the clamped number, or null when it was not a
 *  number (the box then shows the kept value again). */
export function commitText(text: string, r: Range): Stepped | null {
  const n = numberFromText(text);
  return n === null ? null : clampTo(n, r);
}

/** One step up (+1) or down (-1) from a value, never past an end. */
export function stepBy(value: number, dir: 1 | -1, r: Range): number {
  return clampTo(tidy(value + dir * (r.step ?? 1), r.step), r).value;
}

/** Where the arrows, Home and End move in a row of options: wraps round at each end, as macOS radio groups do. Null for
 *  any other key, so it is left to the page. */
export function moveIndex(key: string, at: number, count: number, wrap = true): number | null {
  if (count <= 0) return null;
  const by: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (!(key in by)) return null;
  const to = at + by[key];
  return wrap ? (to + count) % count : Math.max(0, Math.min(count - 1, to));
}

/** Typing a letter in an open menu: the next option after `from` whose words start with it, round to the start. */
export function typeahead(labels: readonly string[], from: number, ch: string): number | null {
  const c = ch.toLowerCase();
  if (c.length !== 1 || !/\S/.test(c)) return null;
  for (let k = 1; k <= labels.length; k++) {
    const i = (from + k) % labels.length;
    if (labels[i].trim().toLowerCase().startsWith(c)) return i;
  }
  return null;
}

/** Where Tab goes at the ends of a dialog, so the keyboard never leaves it for the page behind: the index to focus, or null
 *  when the browser's own move stays inside. `active` is the focused control's place among the dialog's controls (-1 when
 *  it is the heading or nothing in the list). From the last control Tab wraps to the first; Shift+Tab from the first (or
 *  from the heading) wraps to the last. */
export function tabWrap(active: number, count: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (shift) return active <= 0 ? count - 1 : null;
  return active === count - 1 ? 0 : null;
}

/** A menu opens under its button, or above it when there is not room under it and there is more room above. */
export function menuOpensUp(button: { top: number; bottom: number }, listHeight: number, viewportHeight: number): boolean {
  const below = viewportHeight - button.bottom, above = button.top;
  return below < listHeight && above > below;
}

export type MarkName = "tick" | "half" | "cross" | "stop" | "undo" | "wait" | "dash" | "ring" | "spin";
/** The mark a verdict shows, and its colour's role. It only draws what verdict.ts said: partly proven ("mixed", whose icon
 *  is the waiting dot) is drawn as a half circle, as the spec's table shows; nothing changed is an empty ring, so it never
 *  shares the dot with a change not yet proven (the audit, item 31), and never reads as a remove control as a dash did at
 *  the end of a row (the review, 2 Nov 2026). */
export function verdictMark(v: Pick<Verdict, "icon" | "tone"> & Partial<Pick<Verdict, "kind">>): { mark: MarkName; tone: Tone } {
  const mark: MarkName = v.kind === "noChange" ? "ring" : v.icon === "wait" && v.tone === "mixed" ? "half" : v.icon;
  return { mark, tone: v.tone };
}

// ---------- Presence: a part that comes and goes leaves on its exit, never blinks out (M66 fix 9) ----------

/** Where a part that comes and goes is: `mounted` while it shows and while it leaves; `leaving` only while it leaves. */
export type PresenceState = { mounted: boolean; leaving: boolean };
type Timer = unknown;
type Clock = { set: (f: () => void, ms: number) => Timer; clear: (t: Timer) => void };

/** Keeps a part in the page for `ms` after it is told to go, marked leaving, so its exit can play; then it goes. A new
 *  show during the exit takes it back at once (never a blink). With no exit time (reduced motion) it goes at once. The
 *  clock is passed in, so the timing is tested without waiting. */
export class Presence {
  state: PresenceState;
  private timer: Timer | null = null;
  constructor(open: boolean, private readonly clock: Clock, private readonly onChange: (s: PresenceState) => void) {
    this.state = { mounted: open, leaving: false };
  }
  /** Show or hide it; `exitMs` is how long its exit plays (0 under reduced motion). */
  set(open: boolean, exitMs: number): void {
    if (open) {
      this.stop();
      this.put({ mounted: true, leaving: false });
    } else if (this.state.mounted && !this.state.leaving) {
      if (exitMs <= 0) { this.put({ mounted: false, leaving: false }); return; }
      this.put({ mounted: true, leaving: true });
      this.timer = this.clock.set(() => { this.timer = null; this.put({ mounted: false, leaving: false }); }, exitMs);
    }
  }
  /** Stop waiting (the part is going from the page anyway). */
  stop(): void { if (this.timer !== null) { this.clock.clear(this.timer); this.timer = null; } }
  private put(s: PresenceState): void {
    if (s.mounted === this.state.mounted && s.leaving === this.state.leaving) return;
    this.state = s;
    this.onChange(s);
  }
}

/** Run `then` after a part's exit has played (`exitMs`, 0 under reduced motion: at once), marking it leaving first. For a
 *  part whose closing is its owner's to do (a sheet's Cancel, a toast running out): the owner hears only once it has gone. */
export function leaveThen(setLeaving: (on: boolean) => void, exitMs: number, then: () => void, set: (f: () => void, ms: number) => unknown = setTimeout): void {
  if (exitMs <= 0) { then(); return; }
  setLeaving(true);
  set(then, exitMs);
}

// ---------- M73, fluid ----------

/** Swap (parts.tsx): whether the old words stay for their exit as new ones arrive. Only when the key really changed, and
 *  never with Reduce motion or Less motion (the new words are simply there). */
export function swapKeepsOld(prevKey: string, nextKey: string, reduced: boolean): boolean {
  return !reduced && prevKey !== nextKey;
}

/** The tall Home's sliding highlight: the clip that shows only the place you are on, from that place's box inside the row
 *  and the row's own size, in whole pixels (top, right, bottom, left, as inset() takes them). Never negative. */
export function glideClip(on: { left: number; top: number; width: number; height: number }, box: { width: number; height: number }): { t: number; r: number; b: number; l: number } {
  const n = (x: number) => Math.max(0, Math.round(x));
  return { t: n(on.top), r: n(box.width - on.left - on.width), b: n(box.height - on.top - on.height), l: n(on.left) };
}

/** A key pressed inside Home (homeKeys.ts reads it): only plain Command with one more key, never while composing. */
export type KeyIn = { key: string; meta: boolean; ctrl: boolean; alt: boolean; shift: boolean; composing: boolean };
