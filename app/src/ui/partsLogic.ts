// The logic inside the parts (ui/parts.tsx), kept pure so it is tested without a page (ui/partsLogic.test.ts): how a
// stepper reads and clamps a number, how the arrows move through a segmented control or a menu, where a menu opens, and
// which mark a verdict shows. Nothing here decides a result: the verdict comes whole from verdict.ts (M45).
import type { Tone, Verdict } from "../verdict.ts";

export type Range = { min?: number; max?: number; step?: number };

/** How many decimals a step has (0.5 has 1), so a stepped value never shows 0.30000000000000004. */
const decimals = (n: number): number => { const s = String(n); const i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; };
const tidy = (n: number, step: number | undefined): number => Number(n.toFixed(Math.min(6, decimals(step ?? 1))));

/** A typed number, in the person's own words: "3", " 12.5 ", "1,5". Null when it is not one number. */
export function numberFromText(text: string): number | null {
  const t = text.trim().replace(/^−/, "-").replace(",", ".");
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

/** A menu opens under its button, or above it when there is not room under it and there is more room above. */
export function menuOpensUp(button: { top: number; bottom: number }, listHeight: number, viewportHeight: number): boolean {
  const below = viewportHeight - button.bottom, above = button.top;
  return below < listHeight && above > below;
}

export type MarkName = "tick" | "half" | "cross" | "stop" | "undo" | "wait";
/** The mark a verdict shows, and its colour's role. It only draws what verdict.ts said: partly proven ("mixed", whose icon
 *  is the waiting dot) is drawn as a half circle, as the spec's table shows. */
export function verdictMark(v: Pick<Verdict, "icon" | "tone">): { mark: MarkName; tone: Tone } {
  const mark: MarkName = v.icon === "wait" && v.tone === "mixed" ? "half" : v.icon;
  return { mark, tone: v.tone };
}
