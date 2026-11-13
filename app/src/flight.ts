// M83 Part D: every trip flies along a curve, like Clicky's cursor (the founder, 12 Nov 2026). The shell flies the window
// (roam.rs arc_at, trip.rs Fly: a quadratic curve through a point lifted above the middle, eased by roam::ease) and tells
// the character's page the trip's way, time and bend with each flying state (shell_roam.rs roam_say). This page runs the
// same curve on its own clock to shape the body: it stretches and leans along the way it flies, grows a little at mid
// flight, and lands with a soft squash that settles (water.ts settle). Plain maths, tested in flight.test.ts; dockFlight.ts
// draws it. With Reduce motion nothing flies: the shell fades the character out, puts it there, and it fades back in.
import type { Pt } from "./water.ts";
import { settle } from "./water.ts";
import { DUR } from "./motionTokens.ts";

/** One trip as the shell tells it: the way from where it was to where it goes (points, y down), how long, and whether the
 *  curve bends up (near the top of the screens it bends down, so it never rises into a menu bar). */
export type Flight = { dx: number; dy: number; ms: number; up: boolean };

/** The body's numbers: how much it leans at most (degrees), how much it grows at mid flight, how much it squashes as it
 *  lands and how long the landing takes to settle, the speed at which the lean is whole (points a second), and the fade
 *  that takes the trip's place with Reduce motion. */
export const FLIGHT = { leanDeg: 10, grow: 0.06, squash: 0.14, landMs: 420, leanSpeed: 1400, fadeMs: DUR[2], stretchMax: 0.16, stretchSpeed: 15000 } as const;

/** How far the curve bends for a way this long: the shell's (roam.rs bend), a quarter of the way, at most 80 points. */
export const bendOf = (d: number): number => Math.min(80, Math.max(0, d) / 4);
/** The shell's easing for a trip (roam.rs ease): slow out, quick through the middle, slow in. */
export function flightEase(t: number): number { const x = Math.min(1, Math.max(0, t)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
const easeSlope = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x < 0.5 ? 4 * x : 4 * (1 - x); };

/** Where it is on the curve at eased time `e` (0 to 1), from the start (0, 0). Exactly the target at 1. */
export function flightPoint(f: Flight, e: number): Pt {
  if (e >= 1) return { x: f.dx, y: f.dy };
  if (e <= 0) return { x: 0, y: 0 };
  const b = bendOf(Math.hypot(f.dx, f.dy)) * (f.up ? 1 : -1);
  const mx = f.dx / 2, my = f.dy / 2 - b, u = 1 - e;
  return { x: 2 * u * e * mx + e * e * f.dx, y: 2 * u * e * my + e * e * f.dy };
}

/** The trip at `ms` since it began: where it is, its velocity (points a second, y down), and whether it has landed. */
export function flightAt(f: Flight, ms: number): { x: number; y: number; vx: number; vy: number; done: boolean } {
  const total = Math.max(1, f.ms);
  if (ms >= total) return { x: f.dx, y: f.dy, vx: 0, vy: 0, done: true };
  const t = Math.max(0, ms) / total, e = flightEase(t), p = flightPoint(f, e);
  // d/dt of the curve: its slope along e, times how fast e moves.
  const b = bendOf(Math.hypot(f.dx, f.dy)) * (f.up ? 1 : -1), mx = f.dx / 2, my = f.dy / 2 - b;
  const de = (easeSlope(t) * 1000) / total;
  const vx = (2 * (1 - e) * mx + 2 * e * (f.dx - mx)) * de, vy = (2 * (1 - e) * my + 2 * e * (f.dy - my)) * de;
  return { x: p.x, y: p.y, vx, vy, done: false };
}

/** The body's shape at `ms` into the trip: scaled across (sx) and up and down (sy), stretched along the way it flies with
 *  its area kept (flightStretch), grown a little at mid flight, and leaning (degrees, clockwise) the way it goes. */
/** How much the whole character stretches at a speed (points a second): longer along the way, thinner across, its area kept.
 *  Gentler than a loose drop's (water.ts stretch): it is the character itself, so at most FLIGHT.stretchMax. */
export function flightStretch(speed: number): { along: number; across: number } {
  const k = Math.min(FLIGHT.stretchMax, Math.max(0, speed) / FLIGHT.stretchSpeed);
  return { along: 1 + k, across: 1 / Math.sqrt(1 + k) };
}

export function bodyAt(f: Flight, ms: number): { sx: number; sy: number; lean: number; grow: number } {
  const a = flightAt(f, ms), t = Math.min(1, Math.max(0, ms / Math.max(1, f.ms)));
  const speed = Math.hypot(a.vx, a.vy), s = flightStretch(speed);
  const ux = speed > 1e-6 ? a.vx / speed : 0, uy = speed > 1e-6 ? a.vy / speed : 0;
  const grow = 1 + FLIGHT.grow * Math.sin(Math.PI * t);
  const sx = (1 + (s.along - 1) * ux * ux + (s.across - 1) * uy * uy) * grow;
  const sy = (1 + (s.along - 1) * uy * uy + (s.across - 1) * ux * ux) * grow;
  const lean = Math.max(-1, Math.min(1, a.vx / FLIGHT.leanSpeed)) * FLIGHT.leanDeg;
  return { sx, sy, lean, grow };
}

/** The landing at `ms` after it arrived: a soft squash (wider, shorter) that settles back to its own shape. */
export function landAt(ms: number): { sx: number; sy: number; done: boolean } {
  if (ms >= FLIGHT.landMs) return { sx: 1, sy: 1, done: true };
  const k = 1 - settle(Math.max(0, ms) / FLIGHT.landMs);
  return { sx: 1 + FLIGHT.squash * 0.7 * k, sy: 1 - FLIGHT.squash * k, done: false };
}

/** What a trip is with the Mac's Reduce motion (or Less motion): a plain fade, never the arc. */
export const flightPlan = (reduced: boolean): "arc" | "fade" => (reduced ? "fade" : "arc");

/** The trip the shell told of with a flying state, read safely: anything odd is no flight (the body simply stays itself). */
export function flightFrom(v: unknown): Flight | null {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  if (o.phase !== "travel" && o.phase !== "return") return null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const ms = n(o.ms), dx = n(o.dx), dy = n(o.dy);
  if (ms === null || dx === null || dy === null || ms <= 0) return null;
  return { dx, dy, ms, up: o.up !== false };
}
