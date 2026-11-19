// The notch's springs (M66 Part 2, docs/milestones/M66-smooth-and-flowy.md): one table for the island's own shape and for
// Home growing out of the notch. Each is mass 1, written as a response (how long one swing takes) and a damping ratio, then
// as stiffness and damping per second: k = (2 pi / response) squared, c = 4 pi x damping / response. Opening settles with
// no visible overshoot (feel round 1, 18 Nov 2026: one percent of a 480 point body bobbed its bottom edge about 4 points);
// every close and tuck back never passes its target. A new target takes over from wherever
// the shape is (interruptible). With reduced motion (the Mac's, or Less motion in Settings, motion.ts) it is simply at its
// target. Pure; island.tsx draws the island's shape with it and homeShape.ts turns it into CSS curves for Home's shape.
// island.rs NOTCH_* holds the same numbers (island.test.ts pins the two equal).

export type Spring = { x: number; v: number };
export type SpringK = { readonly k: number; readonly c: number };

/** Stiffness and damping from a response (seconds) and a damping ratio, rounded as the table writes them. */
export function fromResponse(response: number, damping: number): SpringK {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { k: Math.round((2 * Math.PI / response) ** 2), c: r1((4 * Math.PI * damping) / response) };
}

/** The table: what each spring is for, its response and damping, and the numbers it gives. */
export const NOTCH_TABLE = {
  /** The hover nudge, a press, the done pulse. */
  HOVER: { response: 0.38, damping: 0.8 },
  /** The width when Home opens: tight, under 0.1 percent of overshoot. */
  OPEN_W: { response: 0.32, damping: 0.92 },
  /** The height when Home opens, starting OPEN_H_DELAY_MS after the width. */
  OPEN_H: { response: 0.32, damping: 0.92 },
  /** Every close and tuck back: critically damped, never past its target, and quick (feel round 1: 0.45 still looked open
   *  long after the press; feel round 3, 19 Nov 2026: 0.3 still left a black strip under the notch for 200 ms after the
   *  content had gone, so a close now rests in about 360 ms). */
  CLOSE: { response: 0.24, damping: 1 },
  /** The busy strip, its caption line and the hover panel growing. Feel round 3: a light settle of about 1.5 percent (1 to 2
   *  points on the small notch moves), which reads as alive, as HeyClicky's and Coucou's notches do. Home's own body never
   *  uses it (OPEN_W, OPEN_H). */
  WORK: { response: 0.28, damping: 0.8 },
} as const;
export type NotchSpringName = keyof typeof NOTCH_TABLE;
export const NOTCH: Record<NotchSpringName, SpringK> = {
  HOVER: { k: 273, c: 26.5 },
  OPEN_W: { k: 386, c: 36.1 },
  OPEN_H: { k: 386, c: 36.1 },
  CLOSE: { k: 685, c: 52.4 },
  WORK: { k: 504, c: 35.9 },
};
/** The height starts this long after the width (it was 60 ms, so the notch read as stretching sideways first). */
// Feel round 3 (19 Nov 2026): 0. With the height 60 ms behind the width, Home's content needed two clips on two clocks, and
// the second (narrower) one cut words at both edges while it grew. Width and height on one spring and one clock make the
// shape and its content's one clip the same rect in every frame.
export const OPEN_H_DELAY_MS = 0;

/** The island's shape grows (wings out, the hover panel) on WORK and tucks back on CLOSE. */
export const ISLAND_SPRING = NOTCH.WORK;
export const TUCK_SPRING = NOTCH.CLOSE;
/** The done pulse: the wings widen a little (island.rs CHEER) on HOVER and settle back. */
export const CHEER_SPRING = NOTCH.HOVER;

/** The spring for a new target, chosen once when the target changes and kept until it is reached or replaced (M66 step 5:
 *  chosen again on every frame, a growing shape switched to CLOSE the moment it first passed its target). Growing on WORK,
 *  getting smaller on CLOSE (never past its target), the done pulse on HOVER. */
export const springFor = (from: number, to: number, soft: boolean): SpringK => (soft ? CHEER_SPRING : to < from ? TUCK_SPRING : ISLAND_SPRING);

/** How long the hover panel's words take to leave (motionTokens.ts EXIT_MS.menu is 100; the shape starts to tuck back after
 *  80, when they are mostly gone), so the shape's edge never cuts them. */
export const PANEL_EXIT_MS = 80;
/** How long the shape waits before it starts toward a new size: PANEL_EXIT_MS when it gets smaller just as the hover panel
 *  stops showing (`panelWas`, `panelNow`), so the words leave first. Otherwise at once, and always with reduced motion. */
export const tuckHoldMs = (panelWas: boolean, panelNow: boolean, shrinking: boolean, reduced: boolean): number =>
  (!reduced && panelWas && !panelNow && shrinking ? PANEL_EXIT_MS : 0);

/** How long the shape takes to tuck back, within a point of the notch: the panel's words leaving (PANEL_EXIT_MS), then
 *  CLOSE from the wings (80 points wider) to the notch (within a point after about 250 ms; 370 ms leaves a margin for a
 *  slow frame). The app waits exactly as long before it makes the window
 *  smaller (island.rs RETRACT_MS; island.test.ts pins the two equal and checks the spring has settled by then). */
export const TUCK_MS = 370 + PANEL_EXIT_MS;

/** When the wings widen after the done tick shows: the tick waits 120 ms and draws in 280 ms (style.css island-draw). */
export const CHEER_AT_MS = 400;
/** How long they stay wide before they settle back. */
export const CHEER_FOR_MS = 360;

/** Close enough to stop drawing: under a quarter of a point away and nearly still. */
export const settled = (s: Spring, target: number): boolean => Math.abs(s.x - target) < 0.25 && Math.abs(s.v) < 2;

/** One step of `dt` seconds toward `target`. Long steps (a hidden window, a slow frame) are cut into small ones, so it never
 *  blows up. With `reduced` motion it is at the target at once. The spring is ISLAND_SPRING unless one is given. */
export function springStep(s: Spring, target: number, dt: number, reduced = false, k = ISLAND_SPRING.k, c = ISLAND_SPRING.c): Spring {
  if (reduced || !Number.isFinite(s.x) || !Number.isFinite(s.v)) return { x: target, v: 0 };
  let { x, v } = s;
  let left = Math.max(0, Math.min(dt, 0.1));
  while (left > 0) {
    const h = Math.min(left, 1 / 240);
    v += (-k * (x - target) - c * v) * h;
    x += v * h;
    left -= h;
  }
  return settled({ x, v }, target) ? { x: target, v: 0 } : { x, v };
}

/** How far the hover panel is out, from the shape's height now (M70 step 4): 0 at the row's height (the notch, the pill or
 *  the wings), 1 with the panel all the way out. island.tsx sets it on the shape every frame (--open), and the shape's
 *  corner follows it from the rest corner to the panel's, so the corner moves with the size instead of with the mode. */
export const openness = (h: number, row: number, panel: number): number =>
  (panel > 0 && Number.isFinite(h) ? Math.max(0, Math.min(1, (h - row) / panel)) : 0);
