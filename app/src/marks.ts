// Hand drawn marks on the real screen: a ring, an arrow, an underline or a box around one target, drawn with the same
// pen as Draw it for me (sketch.ts), so they look made by hand and are the same every time. Rule 22 and F17 4.2: a mark
// goes only on a confirmed target (a guess gets the soft ring and nothing else), and every point of it is kept inside the
// window the target was confirmed in, on top of the overlay's own clip. Plain maths, so it can all be tested.
import { sketchEllipse, sketchLine, sketchRect } from "./sketch.ts";

export type Box = { x: number; y: number; w: number; h: number };
export type Mark = "ring" | "arrow" | "underline" | "box";
export const MARKS: Mark[] = ["ring", "arrow", "underline", "box"];

/** The mark to draw: the kind asked for (an unknown one is a ring), but only on a confirmed target. A guess: none. A
 *  pointer that asked for no mark at all (Point at the problem) keeps its plain ring. */
export function markFor(kind: unknown, exact: boolean): Mark | null {
  if (!exact || kind === undefined || kind === null) return null;
  return MARKS.includes(kind as Mark) ? (kind as Mark) : "ring";
}

/** The steady ring's size around a target (the overlay draws the same one). */
export function ringRadii(r: Box): { rx: number; ry: number } { return { rx: Math.max(r.w / 2 + 10, 26), ry: Math.max(r.h / 2 + 10, 26) }; }

const f = (n: number) => Math.round(n * 10) / 10;
/** Every x, y pair of a path moved inside the box, one point in from its edge. The pen's paths use only M, Q and L, whose
 *  numbers all come in pairs, so the numbers alternate x then y. */
export function clampPath(d: string, b: Box): string {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (s) => {
    const n = Number(s), x = i++ % 2 === 0;
    const lo = (x ? b.x : b.y) + 1, hi = (x ? b.x + b.w : b.y + b.h) - 1;
    return n < lo || n > hi ? String(f(Math.min(hi, Math.max(lo, n)))) : s;
  });
}

const ARROW_LEN = 64;
/** Where an arrow starts: off one corner of the target, on the side with the most room inside the window. */
export function arrowTail(t: Box, bounds: Box): { x: number; y: number } {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  const room = { left: t.x - bounds.x, right: bounds.x + bounds.w - (t.x + t.w), up: t.y - bounds.y, down: bounds.y + bounds.h - (t.y + t.h) };
  const sx = room.left >= room.right ? -1 : 1, sy = room.down >= room.up ? 1 : -1;
  const d = ARROW_LEN / Math.SQRT2;
  return { x: cx + sx * (t.w / 2 + d), y: cy + sy * (t.h / 2 + d) };
}

/** The strokes for one mark, every point inside the window (`clip`, or the whole display `view` when no window is known).
 *  None when the target's middle is not inside that window: nothing is drawn for something outside it. */
export function markStrokes(kind: Mark, t: Box, clip: Box | null, seed: string, view: Box): string[] | null {
  const b = clip ?? view;
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) return null;
  let out: string[];
  if (kind === "ring") {
    const { rx, ry } = ringRadii(t);
    out = [sketchEllipse(cx, cy, rx + 4, ry + 4, `mark:ring:${seed}`)];
  } else if (kind === "box") {
    out = [sketchRect(t.x - 6, t.y - 5, t.w + 12, t.h + 10, `mark:box:${seed}`)];
  } else if (kind === "underline") {
    const y = t.y + t.h + 5;
    out = [sketchLine(t.x - 3, y, t.x + t.w + 3, y, `mark:under:${seed}`)];
  } else {
    // The shaft from the tail to just outside the target's edge, then two short strokes for the head.
    const tail = arrowTail(t, b);
    const ang = Math.atan2(cy - tail.y, cx - tail.x);
    const reach = Math.min(t.w / 2, t.h / 2) + 8;   // stop short of the middle, at about the edge
    const hx = cx - Math.cos(ang) * reach, hy = cy - Math.sin(ang) * reach;
    const head = (a: number) => sketchLine(hx, hy, hx - 14 * Math.cos(ang + a), hy - 14 * Math.sin(ang + a), `mark:head${a}:${seed}`);
    out = [sketchLine(tail.x, tail.y, hx, hy, `mark:arrow:${seed}`), head(0.5), head(-0.5)];
  }
  return out.map((d) => clampPath(d, b));
}

/** How long a mark stays before it fades: as long as its line is said or read (the card sends that), at least 2.5 s and at
 *  most 8 s; 4 s when nothing was sent. */
export function fadeMs(given: unknown): number {
  return typeof given === "number" && Number.isFinite(given) ? Math.min(8000, Math.max(2500, given)) : 4000;
}
