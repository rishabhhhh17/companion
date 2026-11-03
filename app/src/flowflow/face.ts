// Flowflow's eyes: two of them, each on its own little spring, so they follow a target by themselves and never move
// with the body. Blinks and glances come from a seeded schedule (the same every run), never from random jitter.
import { Spring } from "./physics.ts";

/** A small repeatable number generator (mulberry32): the same seed gives the same blinks every time. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const BLINK_SECONDS = 0.16;
const clamp1 = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

export type Eyes = { lx: number; ly: number; rx: number; ry: number; open: number };

export class Face {
  private rand: () => number;
  private l = { x: new Spring(0, 0), y: new Spring(0, 0) };
  private r = { x: new Spring(0, 0), y: new Spring(0, 0) };
  private tx = 0; private ty = 0;
  private blinkIn: number; private blinkT = -1;
  private wanderIn: number; private glanceLeft = 0; private gx = 0; private gy = 0;
  readonly eyes: Eyes = { lx: 0, ly: 0, rx: 0, ry: 0, open: 1 };
  /** M46: whether it glances aside by itself when nothing is happening. Only in Lively (the engine sets it). */
  wander = true;

  constructor(seed = 7) {
    this.rand = rng(seed);
    // Each eye has its own swing, so they trail the target a touch differently.
    this.l.x.set(9, 0.7); this.l.y.set(9, 0.7); this.r.x.set(11, 0.75); this.r.y.set(11, 0.75);
    this.blinkIn = 1.5 + this.rand() * 2; this.wanderIn = 3 + this.rand() * 3;
  }

  /** Where to look, -1 to 1 on each side of the body (a cursor, an event). */
  setTarget(nx: number, ny: number): void { this.tx = clamp1(nx); this.ty = clamp1(ny); }
  /** Look somewhere for a moment, then drift back. */
  glance(nx: number, ny: number, seconds = 1.2): void { this.gx = clamp1(nx); this.gy = clamp1(ny); this.glanceLeft = seconds; }
  /** Close both eyes now (an app event such as a poke may ask for it). */
  blinkNow(): void { if (this.blinkT < 0) this.blinkT = 0; }
  /** M55: the eyes straight ahead at once, at rest, and no glance left (a still frame with less motion shows only the state). */
  center(): void {
    this.l.x.x = this.l.y.x = this.r.x.x = this.r.y.x = 0;
    this.l.x.v = this.l.y.v = this.r.x.v = this.r.y.v = 0;
    this.glanceLeft = 0;
  }
  /** True while a blink is under way: a frame loop parks only with the eyes open (M46). */
  get blinking(): boolean { return this.blinkT >= 0; }

  update(dt: number, look: { eyeOpen: number; gazeGain: number }, hasTarget: boolean): void {
    if (!(dt > 0)) return;
    // The blink: a short, smooth close and open, on a schedule that repeats the same way each run.
    this.blinkIn -= dt;
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT >= BLINK_SECONDS) { this.blinkT = -1; this.blinkIn = 2.4 + this.rand() * 3.2; } }
    else if (this.blinkIn <= 0) this.blinkT = 0;
    // With nothing to look at it now and then glances aside, then comes back.
    if (!hasTarget && this.wander) {
      this.wanderIn -= dt;
      if (this.wanderIn <= 0) { this.glance((this.rand() - 0.5) * 1.1, (this.rand() - 0.5) * 0.6, 1.1); this.wanderIn = 3.5 + this.rand() * 3.5; }
    }
    if (this.glanceLeft > 0) this.glanceLeft -= dt;
    const useGlance = !hasTarget && this.glanceLeft > 0;
    const wx = (useGlance ? this.gx : hasTarget ? this.tx : 0) * look.gazeGain, wy = (useGlance ? this.gy : hasTarget ? this.ty : 0) * look.gazeGain;
    // A tiny cross-eyed pull when the target is close in front keeps the eyes from looking parallel.
    const conv = 0.04 * (1 - Math.min(1, Math.hypot(wx, wy)));
    const steps = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 120))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) { this.l.x.step(h, wx + conv); this.l.y.step(h, wy); this.r.x.step(h, wx - conv); this.r.y.step(h, wy); }
    const bump = this.blinkT >= 0 ? Math.sin(Math.PI * (this.blinkT / BLINK_SECONDS)) : 0;
    const e = this.eyes;
    e.lx = this.l.x.x; e.ly = this.l.y.x; e.rx = this.r.x.x; e.ry = this.r.y.x;
    e.open = Math.max(0, Math.min(1.15, look.eyeOpen * (1 - bump)));
  }
}
