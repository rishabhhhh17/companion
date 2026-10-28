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

/** The pointer anywhere on the screen (M20, Follow my pointer), as a look direction: `dx, dy` in points from the middle of
 *  the character's window (y down). Near, it looks a little; far, it looks fully that way; never past the edge of its eyes. */
export const GAZE_SPAN = 260;
export function gazeOf(dx: number, dy: number, span = GAZE_SPAN): { nx: number; ny: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { nx: 0, ny: 0 };
  const d = Math.hypot(dx, dy); if (d < 1e-6) return { nx: 0, ny: 0 };
  const m = Math.min(1, (d / (d + span)) * 1.5);
  return { nx: (dx / d) * m, ny: (-dy / d) * m };
}
/** How far the body lags behind its window per point a second of the window's speed (world units), and the most it lags. */
export const PUSH_PER = 0.0011;
export const PUSH_MAX = 0.55;
/** Life when nothing happens (Lively): something small every few seconds, on the seeded schedule (the same every run). */
export const HOP_EVERY = [4, 8] as const;
export const HOP_S = 0.5;
/** M26: what it does when nothing happens, so it never just sits: a hop, a double bounce, a look around, a shake of
 *  water off itself, a stretch, a bubble blown upward. Each with how long it lasts (seconds) and how often it is picked. */
export const IDLE_ACTS = ["hop", "double", "look", "shake", "stretch", "bubble"] as const;
export type IdleAct = (typeof IDLE_ACTS)[number];
const ACT_S: Record<IdleAct, number> = { hop: 0.5, double: 0.9, look: 2.2, shake: 0.7, stretch: 1.3, bubble: 0.35 };
const ACT_WEIGHT: Record<IdleAct, number> = { hop: 3, double: 1, look: 3, shake: 2, stretch: 2, bubble: 2 };

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
  private lastLook = -Infinity; private lastMove = -Infinity; private lastGaze = -Infinity; private pushing = false;
  /** Lively (M19, M20): with nothing happening it now and then hops. Off unless the page turns it on (Lively chosen). */
  lively = false;
  private hopIn: number = HOP_EVERY[0]; private hopT = -1; private act: IdleAct = "hop";
  /** The idle moves done so far, oldest first (the last 64): for the tests, and to never do the same one twice in a row. */
  readonly idleDone: IdleAct[] = [];
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
  /** The pointer anywhere on the screen (M20): the eyes look toward it and the body leans a little that way. */
  gaze(dx: number, dy: number): void {
    const g = gazeOf(dx, dy);
    if (g.nx === 0 && g.ny === 0 && !(dx === 0 && dy === 0)) return;
    this.lastLook = this.time; this.lastGaze = this.time;
    this.face.setTarget(g.nx, g.ny);
    if (!this.pushing && this.time - this.lastMove >= FOLLOW_HOLD) this.body.setTarget(g.nx * this.halfW * 0.12, g.ny * this.halfH * 0.12);
  }
  /** Its window is moving (a peek, a trip to a window, a drag), `vx, vy` in points a second (y down): the water lags
   *  behind like jelly. A speed of nothing lets it catch up, and it squashes and wobbles as it settles. */
  push(vx: number, vy: number): void {
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) return;
    if (vx === 0 && vy === 0) { this.pushing = false; this.body.setTarget(0, 0); return; }
    this.pushing = true;
    const lx = Math.max(-PUSH_MAX, Math.min(PUSH_MAX, -vx * PUSH_PER)), ly = Math.max(-PUSH_MAX, Math.min(PUSH_MAX, vy * PUSH_PER));
    this.body.setTarget(lx, ly);
  }
  /** It came in from the edge (`fromX`: -1 from the left, 1 from the right, 0 from above or below): a splash on the side
   *  facing the screen, a ripple and a few drops. */
  arrive(fromX: number, fromY = 0): void {
    this.pushing = false; this.body.setTarget(0, 0);
    this.touch(-fromX * BODY_RADIUS * 0.7, -fromY * BODY_RADIUS * 0.6);
    this.body.impulse("burst", 0.5);
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
    if (!this.pushing && this.time - this.lastMove >= FOLLOW_HOLD && this.time - this.lastGaze >= FOLLOW_HOLD && this.time - this.lastLook < LOOK_HOLD + 1) this.body.setTarget(0, 0);
    this.idleLife(d);
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

  /** A small hop now and then while Lively and nothing happens (not while it is followed, pushed or busy). */
  private idleLife(d: number): void {
    if (this.hopT >= 0) { this.playAct(d); return; }
    const quiet = this.lively && !this.pushing && this.behavior.state === "idle" && this.time - this.lastMove > 4;
    if (!quiet) { this.hopIn = Math.max(this.hopIn, 2); return; }
    this.hopIn -= d;
    if (this.hopIn <= 0) {
      this.hopIn = HOP_EVERY[0] + this.rand() * (HOP_EVERY[1] - HOP_EVERY[0]);
      this.act = this.pickAct(); this.hopT = 0;
      this.idleDone.push(this.act); if (this.idleDone.length > 64) this.idleDone.shift();
      if (this.act === "hop" || this.act === "double") this.body.impulse("poke", 0.4, 0, -BODY_RADIUS * 0.7);
      if (this.act === "stretch") this.face.blinkNow();
    }
  }
  /** A move from the seeded schedule, weighted, never the one just done. */
  private pickAct(): IdleAct {
    const last = this.idleDone[this.idleDone.length - 1];
    const can = IDLE_ACTS.filter((a) => a !== last);
    const total = can.reduce((n, a) => n + ACT_WEIGHT[a], 0);
    let r = this.rand() * total;
    for (const a of can) { r -= ACT_WEIGHT[a]; if (r <= 0) return a; }
    return can[can.length - 1];
  }
  /** One frame of the move under way; each ends with the body back home. */
  private playAct(d: number): void {
    const was = this.hopT; this.hopT += d;
    const k = Math.min(1, this.hopT / ACT_S[this.act]), p = this.body.pose;
    const crossed = (at: number) => was < at * ACT_S[this.act] && this.hopT >= at * ACT_S[this.act];
    switch (this.act) {
      case "hop": this.body.setTarget(0, Math.sin(k * Math.PI) * 0.22); break;
      case "double": {
        this.body.setTarget(0, Math.abs(Math.sin(k * Math.PI * 2)) * 0.15);
        if (crossed(0.5)) { this.body.impulse("land", 0.45); this.body.impulse("poke", 0.3, 0, -BODY_RADIUS * 0.7); }
        break;
      }
      case "look": {
        // Left, then right, a little lean each way, then back to the middle.
        const side = k < 0.45 ? -1 : k < 0.9 ? 1 : 0;
        this.face.glance(side * 0.9, 0.15, 0.3);
        this.body.setTarget(side * 0.06, 0);
        break;
      }
      case "shake": {
        this.body.setTarget(Math.sin(k * Math.PI * 6) * 0.09 * (1 - k), 0);
        if (crossed(0.35) || crossed(0.6)) this.emitDroplet((crossed(0.35) ? -1 : 1) * BODY_RADIUS * 0.8, 0.1, 0.55);
        break;
      }
      case "stretch": this.body.setTarget(0, Math.sin(k * Math.PI) * 0.12); if (crossed(0.5)) this.body.impulse("poke", 0.35, 0, BODY_RADIUS * 0.8); break;
      case "bubble": if (crossed(0.3)) { this.emitDroplet(0, BODY_RADIUS * 0.9, 0.6); this.ripples.add(p.x, p.y + 0.4, 0.35); } break;
    }
    if (k >= 1) {
      this.hopT = -1; this.body.setTarget(0, 0);
      if (this.act === "hop" || this.act === "double") { this.body.impulse("land", 0.7); this.ripples.add(p.x, p.y - 0.3, 0.5); }
    }
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
