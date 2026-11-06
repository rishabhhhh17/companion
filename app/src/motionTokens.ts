// One motion system (M66 Part 1). Every duration, curve and interface spring Squibby moves on, for the scripts. The same
// numbers are written once more in ui/tokens.css (for the stylesheets) and in src-tauri/src/motion.rs (for the shell's own
// window moves); motionTokens.test.ts and motion.rs's own test fail the moment the three disagree.
//
// The rules every surface follows (the lint in ui/motionLint.test.ts holds them):
// - Only opacity and transform move (clip-path for a reveal). Never width, height, a position, a radius, a shadow, a blur
//   or an inherited custom property, which lay out or repaint the page on every frame.
// - Every enter has an exit, shorter, on the exit curve.
// - Reduce motion and Less motion: nothing slides, scales or springs; a short linear fade of opacity and colour stays.
// Flowflow's own body (flow/physics.ts) is the character, not the interface, and keeps its own springs (F27).

/** The four durations, in ms: press, hover and every exit; menus, toasts, rows and small panels; surfaces (sheets, a
 *  place arriving); window trips and the character coming in. */
export const DUR = { 1: 120, 2: 200, 3: 240, 4: 320 } as const;
/** The listed exceptions: the cost counting up, and a setting's row flashing where a link landed. */
export const DUR_COUNT = 300;
export const DUR_FLASH = 1200;
/** M73 (fluid): a list's rows rise in this far apart, the first STAGGER_ROWS only (the rest arrive with the last of them),
 *  so a whole list is in within 100 ms; and Home's list arrives this long after its lead as Home opens. */
export const STAGGER_ROW_MS = 24;
export const STAGGER_ROWS = 4;
export const STAGGER_LIST_MS = 40;

/** Listed exceptions for drawing on (the overlay's hand drawn marks): a stroke drawing itself in, and the pen's own curve,
 *  which starts gently as a hand does (ink.ts penEase). Drawing is a stroke's reveal, like clip-path, never a layout. */
export const DRAW_MS = 550;
export const PEN_CSS = "cubic-bezier(.33, 0, .2, 1)";

/** How long each part that comes and goes takes to leave (M66 fix 9). The scrim leaves on DUR[1]. */
export const EXIT_MS = { menu: 100, toast: 140, sheet: 180, scrim: DUR[1] } as const;
export type ExitKind = keyof typeof EXIT_MS;

/** The Visor's moves (M68, copied from the characters lab), in ms; tokens.css has the same as --loop-visor-* and
 *  --dur-visor-*. A blink every 4.6 s, the scan 1.3 s each way, the needs you lean over 2.6 s, the meter's gentle pulse
 *  1.2 s each way, the proven hop once over 840 ms, a glance of 0.6 s there, 1.2 s held and 0.6 s back, and at most one
 *  glance every 8 s. */
export const VISOR_MS = { blink: 4600, scan: 1300, lean: 2600, pulse: 1200, hop: 840, glance: 2400, glanceGap: 8000 } as const;

/** The two curves (cubic-bezier control points). Ease out for every enter, move, land and grow; exit for leaving only. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;
const bezierCss = (p: readonly number[]) => `cubic-bezier(${p.map((n) => String(n).replace(/^0\./, ".")).join(", ")})`;
/** As CSS, exactly as tokens.css writes them. */
export const EASE_OUT_CSS = bezierCss(EASE_OUT);
export const EASE_EXIT_CSS = bezierCss(EASE_EXIT);

/** The interface spring (damping about 0.99): settles in about a third of a second and never passes its target. Not the
 *  notch shape's springs (islandSpring.ts) and not the character's body. */
export const MOTION_SPRING = { k: 640, c: 50 } as const;
export type SpringConst = { k: number; c: number };

/** A transition written from the system, for the pages that cannot read the stylesheets (the overlay drawn over other
 *  apps): `fade(DUR[1])` is "opacity 120ms cubic-bezier(.23, 1, .32, 1)". */
export const transition = (prop: string, ms: number, curve: string = EASE_OUT_CSS): string => `${prop} ${Math.round(ms)}ms ${curve}`;

/** Where a cubic-bezier curve is at time `t` (0 to 1): its progress, found by solving for x. Pure, for tests and the shell. */
export function bezierAt(p: readonly number[], t: number): number {
  const [x1, y1, x2, y2] = p;
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0, hi = 1, s = t;
  for (let i = 0; i < 40; i++) { s = (lo + hi) / 2; if (at(x1, x2, s) < t) lo = s; else hi = s; }
  return at(y1, y2, s);
}

/** A spring's path from 0 to 1, sampled every millisecond until it rests (within 0.1 percent and nearly still). */
export function springPath(s: SpringConst, maxSecs = 2): number[] {
  const out = [0];
  let x = 0, v = 0;
  const h = 1 / 1000;
  for (let i = 0; i < maxSecs * 1000; i++) {
    for (let k = 0; k < 4; k++) { v += (-s.k * (x - 1) - s.c * v) * (h / 4); x += v * (h / 4); }
    out.push(x);
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.05) break;
  }
  return out;
}

/** How long the spring takes to rest, in seconds. */
export const springSettleSecs = (s: SpringConst): number => (springPath(s).length - 1) / 1000;

/** The spring as a CSS linear() curve: `stops` evenly spaced points over its settling time, so a transition on it is the
 *  spring, and a new target starts from wherever it is. At most 64 stops, from 0 to exactly 1. */
export function springLinear(s: SpringConst, stops = 24): string {
  const path = springPath(s), n = Math.max(2, Math.min(64, stops));
  const pts = Array.from({ length: n }, (_, i) => {
    if (i === 0) return "0";
    if (i === n - 1) return "1";
    const y = path[Math.round((i / (n - 1)) * (path.length - 1))];
    return String(Math.round(y * 1000) / 1000);
  });
  return `linear(${pts.join(", ")})`;
}
