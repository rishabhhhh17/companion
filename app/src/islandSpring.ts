// The island's shape moves on a small spring (docs/design/look.md, section 6): when the wings grow out of the notch, when
// Flowflow peeks, and when they tuck back. A damped spring a little under critical damping, so it overshoots once and
// settles in about a third of a second, and a new target takes over from wherever it is (interruptible). With reduced
// motion (the Mac's, or Less motion in Settings, motion.ts) it is simply at its target. Pure; island.tsx draws it.

export type Spring = { x: number; v: number };

/** Stiffness and damping, per second. Damping ratio c / (2 sqrt(k)) is about 0.65: one small overshoot, no jelly. */
export const ISLAND_SPRING = { k: 560, c: 31 };

/** The softer spring of the done bounce: the wings widen a little (island.rs CHEER) and settle back. Damping ratio about 0.56. */
export const CHEER_SPRING = { k: 380, c: 22 };

/** How long the shape takes to tuck back. The app waits exactly as long before it makes the window smaller (island.rs
 *  RETRACT_MS; island.test.ts pins the two equal and checks the spring has settled by then). */
export const TUCK_MS = 320;

/** When the wings widen after the done tick shows: the tick waits 120 ms and draws in 280 ms (style.css island-draw). */
export const CHEER_AT_MS = 400;
/** How long they stay wide before they settle back. */
export const CHEER_FOR_MS = 360;

/** Close enough to stop drawing: under a quarter of a point away and nearly still. */
export const settled = (s: Spring, target: number): boolean => Math.abs(s.x - target) < 0.25 && Math.abs(s.v) < 2;

/** One step of `dt` seconds toward `target`. Long steps (a hidden window, a slow frame) are cut into small ones, so it never
 *  blows up. With `reduced` motion it is at the target at once. */
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
