// The physics under Flowflow, as plain code with no screen in it, so every rule is tested (physics.test.ts). The renderer
// (renderer.ts) steps a FlowState once per frame and gives its numbers to the shader. The principles are in
// docs/design/look.md: spring physics, ease out, short, interruptible, and quiet with reduced motion.
//
// "full" is the usual motion. "calm" is Less motion (the Mac's Reduce motion or this app's own Motion setting, through
// motion.ts): no wobble, no squash, no ripple, no droplets, no dissolve, only a plain quick crossfade between poses.
import type { SkinMotion } from "../skins.ts";

export type Motion = "full" | "calm";
export type Spring = { x: number; v: number };

const MAX_SUBSTEP = 1 / 240;
const MAX_FRAME = 0.1;
const finite = (n: number): number => (Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** One step of a damped spring pulling x toward target:  x'' = -k (x - target) - c x'. Taken in small slices, so a long
 *  frame (a window that was hidden) cannot make it blow up. */
export function springStep(s: Spring, target: number, dt: number, k: number, c: number): Spring {
  let { x, v } = s;
  let left = clamp(finite(dt), 0, MAX_FRAME);
  while (left > 1e-9) {
    const h = Math.min(left, MAX_SUBSTEP);
    v += (-k * (x - target) - c * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}

const smoothstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** How much of the new pose shows at a spot with this noise value (0 to 1) when the dissolve is `mix` of the way. It is
 *  0 everywhere at the start and 1 everywhere at the end and only grows in between: the water spreads from the places
 *  with the least noise, so the change flows rather than fades. The shader computes the same thing. */
export function dissolveCoverage(mix: number, noise: number): number {
  const k = clamp(mix * 1.5 - noise * 0.5, 0, 1);
  return smoothstep(0.42, 0.58, k);
}

/** A ripple's strength `age` seconds after the touch (0 before it starts or after it is over). */
export function rippleAmp(age: number, fade: number): number { return age < 0 ? 0 : Math.exp(-age * fade); }

/** How a state moves. wobble: how much the body shimmers. bob and bobHz: a gentle rise and fall. shimmer: the light on
 *  the water. droop: a steady sag (an error is a little deflated, never shaking). Unknown states move like idle. */
export type Profile = { wobble: number; bob: number; bobHz: number; shimmer: number; droop: number };
const PROFILES: Record<string, Profile> = {
  off: { wobble: 0.25, bob: 0, bobHz: 0, shimmer: 0, droop: 0 },
  idle: { wobble: 1, bob: 0, bobHz: 0, shimmer: 1, droop: 0 },
  listening: { wobble: 1.15, bob: 0.0015, bobHz: 1.4, shimmer: 1, droop: 0 },
  thinking: { wobble: 1.5, bob: 0.002, bobHz: 0.8, shimmer: 0.8, droop: 0 },
  working: { wobble: 1.2, bob: 0.004, bobHz: 2.2, shimmer: 1.1, droop: 0 },
  checking: { wobble: 1, bob: 0.001, bobHz: 0.6, shimmer: 2, droop: 0 },
  needsYou: { wobble: 1.3, bob: 0.006, bobHz: 1.1, shimmer: 1, droop: 0 },
  done: { wobble: 1.1, bob: 0.0025, bobHz: 1.6, shimmer: 1.4, droop: 0 },
  error: { wobble: 0.6, bob: 0, bobHz: 0, shimmer: 0.4, droop: 0.05 },
};
export function stateProfile(state: string): Profile { return PROFILES[state] ?? PROFILES.idle; }

type Drop = { x: number; y: number; vx: number; vy: number; r: number; life: number };
const MAX_DROPS = 32;
const GRAVITY = 900;   // px per second per second

/** Droplets thrown up on a big moment. Positions are in pixels of the page that draws them. */
export class Droplets {
  list: Drop[] = [];
  constructor(private rand: () => number = Math.random) {}
  spawn(n: number, x: number, y: number): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.15 + this.rand() * 0.7);
      const speed = 120 + this.rand() * 180;
      this.list.push({ x: x + (this.rand() - 0.5) * 40, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 1.5 + this.rand() * 3, life: 1 });
    }
    if (this.list.length > MAX_DROPS) this.list.splice(0, this.list.length - MAX_DROPS);
  }
  step(dt: number): void {
    const h = clamp(finite(dt), 0, MAX_FRAME);
    for (const d of this.list) { d.vy += GRAVITY * h; d.x += d.vx * h; d.y += d.vy * h; d.life -= h * 1.1; }
    this.list = this.list.filter((d) => d.life > 0);
  }
  clear(): void { this.list = []; }
}

export type Uniforms = {
  t: number; sq: number; lagX: number; lagY: number; mix: number; calm: number;
  wobble: number; shimmer: number; bob: number; bobHz: number;
  /** x, y of the touch (0 to 1 across the picture), seconds since it, and its strength; age -1 when there is none. */
  rip: [number, number, number, number];
};

const CLOCK_WRAP = 4000;

/** Everything about how the character is moving right now. */
export class FlowState {
  t = 0;
  squash: Spring = { x: 0, v: 0 };
  lag = { x: 0, y: 0, vx: 0, vy: 0 };
  private want = { x: 0, y: 0 };
  mix = 1;
  from: string;
  to: string;
  pending: string | null = null;
  ripple = { x: 0.5, y: 0.5, age: -1 };
  drops: Droplets;
  state = "idle";
  constructor(private m: SkinMotion, pose = "look", rand: () => number = Math.random) {
    this.from = pose; this.to = pose;
    this.drops = new Droplets(rand);
  }

  /** The state the character is in; it decides how the body moves while it waits (stateProfile). */
  setState(state: string): void { this.state = state; }

  /** The pose that shows most right now. */
  visible(): string { return this.mix >= 0.5 ? this.to : this.from; }

  /** A new pose. In full motion the old one dissolves into the new with a push; in calm it is a quick plain crossfade. A
   *  change during a dissolve waits for it, and only the newest waiting change is kept. True if anything changed. */
  setPose(pose: string, motion: Motion): boolean {
    if (this.mix < 1) {
      if (pose === this.to) { const had = this.pending !== null; this.pending = null; return had; }
      if (pose === this.pending) return false;
      this.pending = pose;
      return true;
    }
    if (pose === this.to) return false;
    this.from = this.to; this.to = pose; this.mix = 0;
    if (motion === "full") this.push(this.m.poseImpulse);
    return true;
  }

  private push(impulse: number): void { this.squash = { x: this.squash.x, v: -Math.abs(impulse) }; }

  /** A click or a touch at (x, y) across the picture (0 to 1): the body gives in and a ripple spreads from there. */
  poke(x: number, y: number, strength = 1): void {
    this.push(this.m.pokeImpulse * clamp(finite(strength), 0, 3));
    this.ripple = { x: clamp(finite(x), 0, 1), y: clamp(finite(y), 0, 1), age: 0 };
  }

  /** A big moment (done): a push, a wide ripple and some droplets thrown up from (ox, oy) in the drawing page's pixels. */
  big(motion: Motion, ox = 80, oy = 66): void {
    if (motion === "calm") return;
    this.push(this.m.poseImpulse);
    this.ripple = { x: 0.5, y: 0.55, age: 0 };
    this.drops.spawn(14, ox, oy);
  }

  /** How fast the window the character is in is moving, in pixels per second. The top trails behind it, on a spring. */
  setVelocity(vx: number, vy: number): void {
    const lim = this.m.lagMax;
    this.want = { x: clamp(finite(vx), -lim, lim), y: clamp(finite(vy), -lim, lim) };
  }

  /** One frame. dt is in seconds. */
  step(dt: number, motion: Motion): void {
    const h = clamp(finite(dt), 0, MAX_FRAME);
    this.t = (this.t + h) % CLOCK_WRAP;
    // The dissolve (or the plain crossfade) moves on whatever else is going on.
    if (this.mix < 1) {
      const secs = motion === "full" ? this.m.dissolveS : this.m.calmFadeS;
      this.mix = Math.min(1, this.mix + (h / secs) * (this.pending !== null ? 2.2 : 1));
      if (this.mix >= 1) {
        this.from = this.to; this.mix = 1;
        if (this.pending !== null) {
          const next = this.pending; this.pending = null;
          if (next !== this.to) { this.to = next; this.mix = 0; if (motion === "full") this.push(this.m.poseImpulse); }
        }
      }
    }
    if (motion === "calm") {
      this.squash = { x: 0, v: 0 };
      this.lag = { x: 0, y: 0, vx: 0, vy: 0 };
      this.want = { x: 0, y: 0 };
      this.ripple.age = -1;
      this.drops.clear();
      return;
    }
    this.squash = springStep(this.squash, 0, h, this.m.squashK, this.m.squashC);
    const lx = springStep({ x: this.lag.x, v: this.lag.vx }, this.want.x, h, this.m.lagK, this.m.lagC);
    const ly = springStep({ x: this.lag.y, v: this.lag.vy }, this.want.y, h, this.m.lagK, this.m.lagC);
    this.lag = { x: lx.x, y: ly.x, vx: lx.v, vy: ly.v };
    if (this.ripple.age >= 0) { this.ripple.age += h; if (this.ripple.age > this.m.rippleLife) this.ripple.age = -1; }
    this.drops.step(h);
  }

  /** Is anything moving other than the quiet breathing? Calm has no breathing, so it is active only while a crossfade runs. */
  isActive(motion: Motion): boolean {
    if (this.mix < 1 || this.pending !== null) return true;
    if (motion === "calm") return false;
    return Math.abs(this.squash.x) > 1e-3 || Math.abs(this.squash.v) > 1e-2
      || Math.abs(this.lag.x) > 0.5 || Math.abs(this.lag.y) > 0.5 || Math.abs(this.lag.vx) > 0.5 || Math.abs(this.lag.vy) > 0.5
      || this.want.x !== 0 || this.want.y !== 0 || this.ripple.age >= 0 || this.drops.list.length > 0;
  }

  /** The numbers for the shader. */
  uniforms(motion: Motion): Uniforms {
    if (motion === "calm") return { t: 0, sq: 0, lagX: 0, lagY: 0, mix: this.mix, calm: 1, wobble: 0, shimmer: 0, bob: 0, bobHz: 0, rip: [0.5, 0.5, -1, 0] };
    const p = stateProfile(this.state);
    return {
      t: this.t, sq: this.squash.x + p.droop, lagX: this.lag.x, lagY: this.lag.y, mix: this.mix, calm: 0,
      wobble: p.wobble, shimmer: p.shimmer, bob: p.bob, bobHz: p.bobHz,
      rip: [this.ripple.x, this.ripple.y, this.ripple.age, rippleAmp(this.ripple.age, this.m.rippleFade)],
    };
  }
}

/** Seconds to wait between frames: quick while something moves, slow while it only breathes, never when nothing can change. */
export function frameGap(s: FlowState, motion: Motion, m: SkinMotion): number {
  if (s.isActive(motion)) return 1 / m.activeFps;
  return motion === "calm" ? Infinity : 1 / m.idleFps;
}
