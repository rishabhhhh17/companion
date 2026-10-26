// Flowflow's motion: springs and a soft body, in plain numbers (no GPU, no DOM), so every rule here is tested without a screen.
// Time is stepped in fixed slices, so the same motion comes out at 30, 60 or 144 frames a second, and a frame that was
// suspended (a hidden tab, a window being dragged) can never throw the body across the screen.

export const FIXED_STEP = 1 / 120;
/** A frame longer than this is cut: after a suspension the body picks up where it was, not where it would have got to. */
export const MAX_FRAME = 1 / 20;
/** No swing may go faster than this (hertz): with the fixed step above, semi-implicit Euler stays stable far below its limit (about 19 Hz). */
export const MAX_HZ = 14;

/** The time to simulate for one frame: 0 for anything that is not a real, positive time; never more than MAX_FRAME. */
export function frameDelta(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, MAX_FRAME);
}

/** The five dials of the dev preview. 1 is the usual value of each (clarity is 0 to 1). */
export type Tuning = { stiffness: number; damping: number; speed: number; ripple: number; clarity: number };
export const DEFAULT_TUNING: Readonly<Tuning> = { stiffness: 1, damping: 1, speed: 1, ripple: 1, clarity: 0.5 };
export const TUNING_LIMITS: Readonly<Record<keyof Tuning, readonly [number, number]>> = {
  stiffness: [0.2, 3], damping: [0.2, 3], speed: [0.3, 2.5], ripple: [0, 2], clarity: [0, 1],
};
export function clampTuning(t: Partial<Tuning> = {}): Tuning {
  const out = { ...DEFAULT_TUNING } as Tuning;
  for (const k of Object.keys(TUNING_LIMITS) as (keyof Tuning)[]) {
    const v = t[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(TUNING_LIMITS[k][1], Math.max(TUNING_LIMITS[k][0], v));
  }
  return out;
}

/** Spring constants from how fast it swings (hertz) and how quickly it dies down (damping ratio: 1 settles without overshoot). */
export function springFor(hz: number, zeta: number): { k: number; c: number } {
  const w = 2 * Math.PI * hz;
  // The friction term is also kept under the step's stability limit (friction x step must stay below 2).
  return { k: w * w, c: Math.min(2 * zeta * w, 1.6 / FIXED_STEP) };
}

/** One number on a spring. Semi-implicit Euler: stable while (swing rate x step) stays well under 2. */
export class Spring {
  x: number; v = 0;
  constructor(public k: number, public c: number, x0 = 0) { this.x = x0; }
  step(h: number, target: number): void {
    this.v += (this.k * (target - this.x) - this.c * this.v) * h;
    this.x += this.v * h;
  }
  set(hz: number, zeta: number): void { const s = springFor(hz, zeta); this.k = s.k; this.c = s.c; }
}

/** Keeps the body's whole outline inside the frame (rule: never clip the visible body at the screen edge). */
export function keepInside(x: number, y: number, halfW: number, halfH: number, r: number): { x: number; y: number } {
  const mx = Math.max(0, halfW - r), my = Math.max(0, halfH - r);
  return { x: Math.min(mx, Math.max(-mx, x)) + 0, y: Math.min(my, Math.max(-my, y)) + 0 };
}

export type BodyPose = {
  x: number; y: number;
  /** Which way it is moving (a unit vector) and how much it stretches that way (0 is none). */
  dirX: number; dirY: number; stretch: number;
  /** Vertical squash (+) and rebound (-), as a fraction. */
  squash: number;
  lean: number;
  wobble2: number; wobble3: number;
  breath: number;
  /** A poke: where on the body (world units) and how hard (0 to 1). */
  contactX: number; contactY: number; contact: number;
  speed: number;
};

const MAX_STRETCH = 0.38;

export class SoftBody {
  private px: Spring; private py: Spring;
  private stretchS: Spring; private squashS: Spring; private leanS: Spring;
  private w2: Spring; private w3: Spring; private contactS: Spring;
  private breathPhase = 0; private breathAmp = 0.025; private breathRate = 0.35;
  private lastSpeed = 0;
  private tx = 0; private ty = 0;
  private acc = 0;
  private tuning: Tuning = { ...DEFAULT_TUNING };
  private dirX = 0; private dirY = 0;
  private cx = 0; private cy = 0;
  readonly pose: BodyPose = { x: 0, y: 0, dirX: 0, dirY: 0, stretch: 0, squash: 0, lean: 0, wobble2: 0, wobble3: 0, breath: 0, contactX: 0, contactY: 0, contact: 0, speed: 0 };
  /** The frame the body may live in (half width and half height, and the body's radius), set by the renderer. */
  bounds = { halfW: 1.6, halfH: 1.1, r: 0.85 };

  constructor(tuning: Partial<Tuning> = {}) {
    this.px = new Spring(1, 1); this.py = new Spring(1, 1);
    this.stretchS = new Spring(1, 1); this.squashS = new Spring(1, 1); this.leanS = new Spring(1, 1);
    this.w2 = new Spring(1, 1); this.w3 = new Spring(1, 1); this.contactS = new Spring(1, 1);
    this.setTuning(tuning);
  }

  setTuning(t: Partial<Tuning>): void {
    this.tuning = clampTuning({ ...this.tuning, ...t });
    const { stiffness: s, damping: d, speed: sp } = this.tuning;
    // Higher stiffness: a faster swing. Higher damping: it settles sooner. Speed scales every swing.
    const f = (hz: number) => Math.min(MAX_HZ, hz * Math.sqrt(s) * sp);
    const z = (zeta: number) => Math.min(2.5, zeta * d);
    this.px.set(f(1.6), z(0.62)); this.py.set(f(1.6), z(0.62));
    this.stretchS.set(f(5), z(0.55)); this.squashS.set(f(3.2), z(0.22)); this.leanS.set(f(3), z(0.5));
    this.w2.set(f(5.5), z(0.16)); this.w3.set(f(8.5), z(0.2)); this.contactS.set(f(3.2), z(0.6));
  }

  /** Where the body is heading (world units). It follows with inertia, never snapping. */
  setTarget(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const k = keepInside(x, y, this.bounds.halfW, this.bounds.halfH, this.bounds.r);
    this.tx = k.x; this.ty = k.y;
  }
  setBreath(amp: number, rate: number): void { this.breathAmp = amp; this.breathRate = rate; }

  /** A sudden event: land (squash then rebound), poke (a dent at a point), burst (every wobble mode shaken). */
  impulse(kind: "land" | "poke" | "burst", strength = 1, x = 0, y = 0): void {
    const s = Math.max(0, Math.min(2, strength));
    if (kind === "land") { this.squashS.v += 3.2 * s; this.w2.v += 1.2 * s; }
    else if (kind === "poke") { this.cx = x; this.cy = y; this.contactS.v += 5 * s; this.w2.v += 0.8 * s; this.squashS.v += 0.9 * s; }
    else { this.w2.v += 2.4 * s; this.w3.v += 1.6 * s; this.squashS.v -= 1.2 * s; }
  }

  /** Move the body on by dt seconds. Fixed slices inside, so the result does not depend on the frame rate. */
  advance(dt: number): BodyPose {
    this.acc += frameDelta(dt);
    while (this.acc >= FIXED_STEP) { this.step(FIXED_STEP); this.acc -= FIXED_STEP; }
    return this.fill();
  }

  private step(h: number): void {
    this.px.step(h, this.tx); this.py.step(h, this.ty);
    const vx = this.px.v, vy = this.py.v, speed = Math.hypot(vx, vy);
    if (speed > 0.02) { this.dirX = vx / speed; this.dirY = vy / speed; }
    // Stretch along the movement; slowing down sharply squashes it, and it rebounds.
    this.stretchS.step(h, Math.min(MAX_STRETCH, speed * 0.16));
    const slowing = (this.lastSpeed - speed) / h;
    if (slowing > 3.5) { this.squashS.v += Math.min(2, (slowing - 3.5) * 0.03) * Math.min(1, this.lastSpeed); }
    this.lastSpeed = speed;
    this.squashS.step(h, 0);
    // The wobble modes are shaken by sudden changes of speed (never by chance) and ring down on their own.
    const jerk = Math.min(4, Math.abs(slowing)) * 0.004 * h * 60;
    this.w2.v += jerk * (vx >= 0 ? 1 : -1); this.w3.v += jerk * 0.5;
    this.w2.step(h, 0); this.w3.step(h, 0);
    this.leanS.step(h, Math.max(-0.22, Math.min(0.22, -vx * 0.1)));
    this.contactS.step(h, 0);
    this.breathPhase += 2 * Math.PI * this.breathRate * h * this.tuning.speed;
  }

  private fill(): BodyPose {
    const p = this.pose;
    p.x = this.px.x; p.y = this.py.x; p.dirX = this.dirX; p.dirY = this.dirY;
    p.stretch = Math.max(0, this.stretchS.x); p.squash = this.squashS.x; p.lean = this.leanS.x;
    p.wobble2 = this.w2.x * 0.06; p.wobble3 = this.w3.x * 0.04;
    p.breath = this.breathAmp * Math.sin(this.breathPhase);
    p.contactX = this.cx; p.contactY = this.cy; p.contact = Math.max(0, Math.min(1, this.contactS.x));
    p.speed = Math.hypot(this.px.v, this.py.v);
    return p;
  }

  /** True once the body has stopped moving, so a render loop may rest. */
  get settled(): boolean {
    return Math.abs(this.px.x - this.tx) < 0.002 && Math.abs(this.py.x - this.ty) < 0.002 && Math.hypot(this.px.v, this.py.v) < 0.004
      && Math.abs(this.squashS.x) < 0.002 && Math.abs(this.squashS.v) < 0.01 && Math.abs(this.w2.x) < 0.01 && Math.abs(this.w3.x) < 0.01
      && Math.abs(this.contactS.x) < 0.002 && Math.abs(this.leanS.x) < 0.002;
  }

  /** Put the body somewhere at rest (a new window, a state that must not glide in from elsewhere). */
  reset(x = 0, y = 0): void {
    for (const s of [this.px, this.py, this.stretchS, this.squashS, this.leanS, this.w2, this.w3, this.contactS]) { s.x = 0; s.v = 0; }
    this.px.x = x; this.py.x = y; this.tx = x; this.ty = y; this.acc = 0; this.lastSpeed = 0;
  }
}
