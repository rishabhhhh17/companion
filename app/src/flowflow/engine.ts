// The whole character without a screen: mood, soft body, eyes, droplets and ripples, wired together. The renderer only reads
// what this produces (a "snapshot"); everything that decides what Flowflow does is here, so it can be tested without a GPU.
import type { CharacterState } from "../model.ts";
import { Behavior, type BehaviorState, type Look } from "./behavior.ts";
import { Face, rng, type Eyes } from "./face.ts";
import { Droplets, Ripples } from "./particles.ts";
import { type BodyPose, SoftBody, type Tuning, clampTuning, frameDelta } from "./physics.ts";

/** How long after the pointer last moved the eyes keep looking at it, and the body keeps following (seconds). */
export const LOOK_HOLD = 3;
export const FOLLOW_HOLD = 1.4;
/** The body's widest reach from its centre (world units) at the renderer's body scale; the frame is 2.2 high. */
export const BODY_RADIUS = 0.84;

export type Snapshot = {
  pose: BodyPose; look: Look; eyes: Eyes; state: BehaviorState; tuning: Tuning; time: number;
  /** The float added on top of the body's height (a slow bob). */
  float: number;
  droplets: Droplets; ripples: Ripples;
};

export class FlowflowEngine {
  readonly behavior = new Behavior();
  readonly body: SoftBody;
  readonly face: Face;
  readonly droplets = new Droplets();
  readonly ripples = new Ripples();
  private tuning: Tuning;
  private rand: () => number;
  private time = 0;
  private lastLook = -Infinity; private lastMove = -Infinity;
  private credit = 0;
  /** How far the body may roam toward the pointer, as a fraction of the frame (the dock is tiny, the preview is large). */
  followRange = 0.35;
  private halfW = 1.6; private halfH = 1.1;

  constructor(tuning: Partial<Tuning> = {}, seed = 7) {
    this.tuning = clampTuning(tuning);
    this.body = new SoftBody(this.tuning); this.face = new Face(seed); this.rand = rng(seed + 101);
    this.body.bounds = { halfW: this.halfW, halfH: this.halfH, r: BODY_RADIUS };
    this.behavior.snap();
  }

  setTuning(t: Partial<Tuning>): void { this.tuning = clampTuning({ ...this.tuning, ...t }); this.body.setTuning(this.tuning); }
  get tune(): Tuning { return this.tuning; }
  /** The frame the body must stay inside (half width and half height, world units). */
  setFrame(halfW: number, halfH: number): void { this.halfW = halfW; this.halfH = halfH; this.body.bounds = { halfW, halfH, r: BODY_RADIUS * 1.08 }; }

  /** The app's state changed. Only a real change does anything: success is never made up. */
  applyApp(s: CharacterState): void { this.behavior.applyApp(s); }

  /** The pointer, in the frame's own units (-1 to 1 across and up). Called whenever it moves. */
  pointer(nx: number, ny: number): void {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    this.lastLook = this.time; this.lastMove = this.time;
    this.face.setTarget(nx, ny);
    this.body.setTarget(nx * this.halfW * this.followRange, ny * this.halfH * this.followRange);
  }
  /** The pointer left, or the window lost focus: the eyes and the body drift back. */
  pointerLeft(): void { this.lastLook = -Infinity; this.lastMove = -Infinity; this.body.setTarget(0, 0); }

  /** A touch at a point on the body (world units, from the body's centre). It squishes there and ripples out. */
  touch(x: number, y: number): void {
    this.behavior.touch(); this.behavior.takeEntered();
    const g = this.tuning.ripple * this.behavior.look.rippleGain;
    this.body.impulse("poke", 1, x, y);
    this.ripples.add(x + this.body.pose.x, y + this.body.pose.y, 1.1 * g);
    this.face.blinkNow();
    this.emitDroplet(x, y, 0.5);
  }

  /** A pose for one frame of reduced motion: the body at rest in the state's look, no sliding. */
  still(): Snapshot { this.behavior.snap(); this.body.reset(0, 0); this.face.update(1 / 60, this.behavior.look, false); return this.snapshot(); }

  update(dt: number): Snapshot {
    const d = frameDelta(dt);
    this.time += d;
    this.behavior.setFollowing(this.time - this.lastMove < FOLLOW_HOLD);
    this.behavior.update(d);
    const look = this.behavior.look;
    this.reactToEntered();
    if (this.time - this.lastMove >= FOLLOW_HOLD && this.time - this.lastLook < LOOK_HOLD + 1) this.body.setTarget(0, 0);
    this.body.setBreath(look.breathAmp, look.breathRate);
    this.body.advance(d);
    this.face.update(d, look, this.time - this.lastLook < LOOK_HOLD);
    // Droplets leave in proportion to how fast the body moves and how readily this mood sheds them: no dice.
    this.credit += look.droplets * Math.min(2, this.body.pose.speed) * 0.9 * d;
    if (this.credit >= 1) { this.credit -= 1; const p = this.body.pose; this.emitDroplet(-p.dirX * BODY_RADIUS * 0.6, -p.dirY * BODY_RADIUS * 0.6 + 0.2, 0.4); }
    this.droplets.update(d, this.body.pose.x, this.body.pose.y);
    this.ripples.update(d);
    this.ripples.fill(this.rippleBuffer);
    return this.snapshot();
  }

  readonly rippleBuffer = new Float32Array(16);

  private reactToEntered(): void {
    const s = this.behavior.takeEntered();
    if (!s) return;
    const g = this.tuning.ripple * this.behavior.look.rippleGain;
    const p = this.body.pose;
    if (s === "success") { this.body.impulse("burst", 0.8); this.ripples.add(p.x, p.y, 1.2 * Math.max(0.3, g)); for (let i = 0; i < 3; i++) this.emitDroplet((i - 1) * 0.35, 0.4, 1); }
    else if (s === "error") { this.body.impulse("land", 0.45); this.ripples.add(p.x, p.y - 0.2, 0.5 * Math.max(0.3, g)); }
    else if (s === "curious") { this.face.glance(0, 0.5, 0.8); this.body.impulse("poke", 0.25, 0, 0.3); }
  }

  /** A drop leaves the surface near (x, y) from the body's centre, throwing outward and up. */
  private emitDroplet(x: number, y: number, power: number): void {
    const p = this.body.pose, a = (this.rand() - 0.5) * 0.9, up = 1.0 + this.rand() * 0.6;
    this.droplets.emit(p.x + x, p.y + y + 0.1, (x === 0 ? a : Math.sign(x) * (0.35 + 0.3 * this.rand())) * power, up * power * 1.2, 0.05 + 0.025 * this.rand());
  }

  private snap: Snapshot | null = null;
  private snapshot(): Snapshot {
    const s = this.snap ?? (this.snap = { pose: this.body.pose, look: this.behavior.look, eyes: this.face.eyes, state: "idle", tuning: this.tuning, time: 0, float: 0, droplets: this.droplets, ripples: this.ripples });
    s.state = this.behavior.state; s.tuning = this.tuning; s.time = this.time;
    s.float = this.behavior.look.floatAmp * Math.sin(this.time * 0.9);
    return s;
  }
}
