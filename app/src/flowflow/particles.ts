// Tiny droplets that leave the body, arc and come back to merge, and ripples that spread from a touch. Fixed pools of numbers:
// nothing is created or thrown away while it runs, and there is a hard cap on how many can exist at once.
import { Spring } from "./physics.ts";

export const MAX_DROPLETS = 8;
export const MAX_RIPPLES = 4;
const GRAVITY = 2.6;
const RIPPLE_SECONDS = 2.2;

export class Droplets {
  readonly x = new Float32Array(MAX_DROPLETS); readonly y = new Float32Array(MAX_DROPLETS);
  private vx = new Float32Array(MAX_DROPLETS); private vy = new Float32Array(MAX_DROPLETS);
  private age = new Float32Array(MAX_DROPLETS); private life = new Float32Array(MAX_DROPLETS);
  readonly size = new Float32Array(MAX_DROPLETS);
  private base = new Float32Array(MAX_DROPLETS);
  private next = 0;

  get alive(): number { let n = 0; for (let i = 0; i < MAX_DROPLETS; i++) if (this.life[i] > 0) n++; return n; }

  emit(x: number, y: number, vx: number, vy: number, size = 0.06): void {
    // A free slot if there is one, else the oldest drop is reused: the cap is never passed.
    let i = -1; for (let k = 0; k < MAX_DROPLETS; k++) if (this.life[k] <= 0) { i = k; break; }
    if (i < 0) { i = this.next; this.next = (this.next + 1) % MAX_DROPLETS; }
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.age[i] = 0; this.life[i] = 1.25; this.base[i] = size; this.size[i] = size;
  }

  /** Arc under gravity; in the last part of its life a drop is pulled back toward the body and shrinks into it (cx, cy). */
  update(dt: number, cx: number, cy: number): void {
    if (!(dt > 0)) return;
    for (let i = 0; i < MAX_DROPLETS; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { this.life[i] = 0; this.size[i] = 0; continue; }
      this.vy[i] -= GRAVITY * dt;
      if (t > 0.5) { const pull = (t - 0.5) * 14; this.vx[i] += (cx - this.x[i]) * pull * dt; this.vy[i] += (cy - this.y[i]) * pull * dt; this.vx[i] *= 1 - 3 * dt; this.vy[i] *= 1 - 3 * dt; }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.size[i] = this.base[i] * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
    }
  }
}

export class Ripples {
  private px = new Float32Array(MAX_RIPPLES); private py = new Float32Array(MAX_RIPPLES);
  private age = new Float32Array(MAX_RIPPLES).fill(RIPPLE_SECONDS); private amp = new Float32Array(MAX_RIPPLES);
  private next = 0;
  get alive(): number { let n = 0; for (let i = 0; i < MAX_RIPPLES; i++) if (this.age[i] < RIPPLE_SECONDS) n++; return n; }
  add(x: number, y: number, amp: number): void {
    if (!(amp > 0)) return;
    let i = -1; for (let k = 0; k < MAX_RIPPLES; k++) if (this.age[k] >= RIPPLE_SECONDS) { i = k; break; }
    if (i < 0) { i = this.next; this.next = (this.next + 1) % MAX_RIPPLES; }
    this.px[i] = x; this.py[i] = y; this.age[i] = 0; this.amp[i] = Math.min(2, amp);
  }
  update(dt: number): void { if (!(dt > 0)) return; for (let i = 0; i < MAX_RIPPLES; i++) if (this.age[i] < RIPPLE_SECONDS) this.age[i] += dt; }
  /** Four numbers per ripple for the shader: x, y, age (seconds) and strength (0 once it has died). */
  fill(out: Float32Array): void {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const live = this.age[i] < RIPPLE_SECONDS;
      out[i * 4] = this.px[i]; out[i * 4 + 1] = this.py[i]; out[i * 4 + 2] = this.age[i];
      out[i * 4 + 3] = live ? this.amp[i] * (1 - this.age[i] / RIPPLE_SECONDS) : 0;
    }
  }
}

// M60 (2 Nov 2026, the founder picking the orb with Fizz's trailing bubbles): two small bubbles follow Flowflow. They are
// drawn in the same picture as the orb (shaders.ts, two spheres in the one ray march), so they cost almost nothing, and here
// they are only numbers: where each bubble is heading, on springs, so they trail the orb with a little lag when it moves.
// At rest they trail below and behind it in a gentle arc (never a straight line, which reads as a thought bubble). Working,
// they orbit it slowly; done, they rise and pop and form again; failed, they sink a little; listening, they gather close.
// Without bob (Still and Gentle) they hold perfectly still at rest; Lively lets them drift a little.

export const FOLLOWERS = 2;
/** Their radii (world units): small beside the orb (about 0.66), the second smaller still. */
export const FOLLOWER_RADII: readonly [number, number] = [0.17, 0.1];
/** One slow turn round the orb while it works (seconds). */
export const ORBIT_SECONDS = 9;
/** How far out they sit: from the orb's rim to each, and how much further out the second trails (world units). */
const GAP = 0.03, OUT = 0.07;
/** How far round the orb the second sits from the first (radians): together they make an arc round it. */
const SWEEP = 0.6;
/** Done: they rise for RISE_S, the first pops then, the second POP_GAP later, each pop takes POP_S; out of sight until
 *  FORM_S, then they form again where they rest. */
const RISE_S = 1.0, POP_GAP = 0.18, POP_S = 0.12, FORM_S = 1.75;
/** Where the orbit starts (radians) and how far behind the first the second runs. */
const ORBIT_START = 2.3, ORBIT_LAG = 2.4;

/** A spring close enough to its target and slow enough is put exactly there, at rest. */
function rest(s: Spring, g: number): boolean { if (Math.abs(s.x - g) < 1e-4 && Math.abs(s.v) < 1e-4) { s.x = g; s.v = 0; return true; } return false; }

export type FollowerMood = "rest" | "orbit" | "sink" | "gather";
/** What the bubbles follow this frame (world units, the body's own frame, y up). `tx, ty`: the way the trail leaves the
 *  orb (a unit vector), to the first bubble. `min/max`: the box their whole outline must stay inside (the frame, and any surface). */
export type FollowerFrame = {
  mood: FollowerMood; orb: number; cx: number; cy: number; tx: number; ty: number;
  /** Which way round the orb the arc sweeps from the first bubble to the second: down (0, -1) usually, up off a floor. */
  ux: number; uy: number;
  bob: boolean; time: number;
  minX: number; maxX: number; minY: number; maxY: number;
};

export class Followers {
  readonly x = new Float64Array(FOLLOWERS); readonly y = new Float64Array(FOLLOWERS);
  /** Depth (world units, toward the viewer): behind the orb (below 0) it hides them. */
  readonly z = new Float64Array(FOLLOWERS);
  /** Their radius now (0 while popped). */
  readonly r = new Float64Array(FOLLOWERS);
  private sx: Spring[] = []; private sy: Spring[] = []; private sz: Spring[] = []; private sr: Spring[] = [];
  private gx = new Float64Array(FOLLOWERS); private gy = new Float64Array(FOLLOWERS); private gz = new Float64Array(FOLLOWERS);
  /** The orbit's angle (radians); it turns only while they orbit. */
  private angle = ORBIT_START;
  /** Seconds since done began, or -1. */
  private popT = -1;
  private still = true; private moving = false;
  /** Pops not yet told (a bit for each bubble), so the engine can send a spray of drops from where it popped. */
  private popped = 0;

  constructor() {
    for (let i = 0; i < FOLLOWERS; i++) {
      const hz = i === 0 ? 2.2 : 1.6, z = i === 0 ? 0.55 : 0.5;   // the second trails a little more
      const a = new Spring(0, 0), b = new Spring(0, 0), c = new Spring(0, 0), d = new Spring(0, 0);
      a.set(hz, z); b.set(hz, z); c.set(hz, z); d.set(3, 0.8);
      this.sx.push(a); this.sy.push(b); this.sz.push(c); this.sr.push(d);
      this.r[i] = FOLLOWER_RADII[i]; d.x = FOLLOWER_RADII[i];
    }
  }

  /** Done: rise, pop, form again. */
  celebrate(): void { this.popT = 0; this.popped = 0; }
  /** A bubble that has just popped (its index, once), or -1. */
  takePop(): number { for (let i = 0; i < FOLLOWERS; i++) if (this.popped & (1 << i)) { this.popped &= ~(1 << i); return i; } return -1; }
  get celebrating(): boolean { return this.popT >= 0; }

  /** True once they hold perfectly still (a frame loop may park only then). */
  get settled(): boolean { return this.still && !this.moving && this.popT < 0; }

  /** Put them where they rest for this frame at once (a first frame, or less motion). */
  place(f: FollowerFrame): void {
    this.popT = -1; this.aim(f, f.mood === "orbit" ? "rest" : f.mood, false);
    for (let i = 0; i < FOLLOWERS; i++) {
      this.sx[i].x = this.gx[i]; this.sy[i].x = this.gy[i]; this.sz[i].x = this.gz[i]; this.sr[i].x = FOLLOWER_RADII[i];
      this.sx[i].v = this.sy[i].v = this.sz[i].v = this.sr[i].v = 0;
    }
    this.copy(); this.still = true;
  }

  update(dt: number, f: FollowerFrame): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.moving = f.mood === "orbit" || f.bob;
    if (f.mood === "orbit") this.angle += (dt * 2 * Math.PI) / ORBIT_SECONDS;
    let rising = false;
    if (this.popT >= 0) {
      this.popT += dt;
      if (this.popT >= FORM_S) {   // out of sight: move them home, then let them grow back there
        this.popT = -1; this.aim(f, f.mood, f.bob);
        for (let i = 0; i < FOLLOWERS; i++) { this.sx[i].x = this.gx[i]; this.sy[i].x = this.gy[i]; this.sz[i].x = this.gz[i]; this.sx[i].v = this.sy[i].v = this.sz[i].v = 0; this.sr[i].x = 0; this.sr[i].v = 0; }
      } else rising = true;
    }
    if (rising) this.aimRise(f); else this.aim(f, f.mood, f.bob);
    const n = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 120)))), h = dt / n;
    for (let k = 0; k < n; k++) for (let i = 0; i < FOLLOWERS; i++) {
      this.sx[i].step(h, this.gx[i]); this.sy[i].step(h, this.gy[i]); this.sz[i].step(h, this.gz[i]); this.sr[i].step(h, FOLLOWER_RADII[i]);
    }
    // Close enough and slow enough: exactly there, so a resting bubble holds perfectly still.
    let still = true;
    for (let i = 0; i < FOLLOWERS; i++) {
      still = rest(this.sx[i], this.gx[i]) && still; still = rest(this.sy[i], this.gy[i]) && still;
      still = rest(this.sz[i], this.gz[i]) && still; still = rest(this.sr[i], FOLLOWER_RADII[i]) && still;
    }
    this.still = still;
    this.copy();
    if (rising) for (let i = 0; i < FOLLOWERS; i++) {
      const at = RISE_S + i * POP_GAP, t = this.popT - at;
      if (t >= 0 && t - dt < 0) this.popped |= 1 << i;   // it pops this frame
      if (t >= POP_S) this.r[i] = 0;
      else if (t >= 0) { const k = t / POP_S; this.r[i] = FOLLOWER_RADII[i] * (1 + 0.25 * k) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4); }
    }
  }

  private copy(): void { for (let i = 0; i < FOLLOWERS; i++) { this.x[i] = this.sx[i].x; this.y[i] = this.sy[i].x; this.z[i] = this.sz[i].x; this.r[i] = Math.max(0, this.sr[i].x); } }

  /** Where each is heading for a mood (gx, gy, gz), kept inside the box. */
  private aim(f: FollowerFrame, mood: FollowerMood, bob: boolean): void {
    const ra = FOLLOWER_RADII[0], rb = FOLLOWER_RADII[1];
    if (mood === "orbit") {
      // A ring tilted toward the viewer: in front it passes low, under the face; behind it rises and the orb hides it.
      for (let i = 0; i < FOLLOWERS; i++) {
        const a = this.angle - i * ORBIT_LAG, rho = f.orb + FOLLOWER_RADII[i] + 0.08 + i * 0.1;
        this.gx[i] = f.cx + rho * Math.cos(a); this.gy[i] = f.cy - 0.1 - 0.3 * rho * Math.sin(a); this.gz[i] = rho * Math.sin(a);
      }
    } else {
      // An arc round the orb: the first where the trail leaves it, the second a little further round toward (ux, uy) and a
      // little further out, so the two hug the orb in a curve and never line up into a thought bubble's chain.
      let tx = f.tx, ty = f.ty; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const close = mood === "gather", turn = (tx * f.uy - ty * f.ux >= 0 ? 1 : -1) * (close ? SWEEP * 0.75 : SWEEP);
      const c = Math.cos(turn), sn = Math.sin(turn), bx = tx * c - ty * sn, by = tx * sn + ty * c;
      const da = close ? f.orb + ra * 0.35 : f.orb + ra + GAP, db = close ? f.orb + rb * 0.5 : f.orb + rb + GAP + OUT;
      this.gx[0] = f.cx + tx * da; this.gy[0] = f.cy + ty * da;
      this.gx[1] = f.cx + bx * db; this.gy[1] = f.cy + by * db;
      if (mood === "sink") { this.gy[0] -= 0.14; this.gy[1] -= 0.18; }
      for (let i = 0; i < FOLLOWERS; i++) {
        this.gz[i] = 0;
        if (bob) { this.gx[i] += 0.01 * Math.sin(f.time * 0.9 + i * 1.3); this.gy[i] += 0.018 * Math.sin(f.time * 1.4 + i * 2.1); }
      }
    }
    this.keep(f);
  }
  /** Done: up the side of the orb the trail is on, to above its shoulder. */
  private aimRise(f: FollowerFrame): void {
    const side = f.tx > 0 ? 1 : -1;
    this.gx[0] = f.cx + side * (f.orb + FOLLOWER_RADII[0]) * 0.95; this.gy[0] = f.cy + f.orb * 0.75;
    this.gx[1] = f.cx + side * (f.orb + FOLLOWER_RADII[1] + 0.3); this.gy[1] = f.cy + f.orb * 0.35;
    this.gz[0] = this.gz[1] = 0.1;
    this.keep(f);
  }
  private keep(f: FollowerFrame): void {
    for (let i = 0; i < FOLLOWERS; i++) {
      const r = FOLLOWER_RADII[i];
      this.gx[i] = Math.min(f.maxX - r, Math.max(f.minX + r, this.gx[i]));
      this.gy[i] = Math.min(f.maxY - r, Math.max(f.minY + r, this.gy[i]));
    }
  }
}
