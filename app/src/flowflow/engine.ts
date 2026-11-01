// The whole character without a screen: mood, soft body, eyes, droplets and ripples, wired together. The renderer only reads
// what this produces (a "snapshot"); everything that decides what Flowflow does is here, so it can be tested without a GPU.
import type { CharacterState } from "../model.ts";
import type { Liveliness } from "../lookfeel.ts";
import { Behavior, type BehaviorState, type Look } from "./behavior.ts";
import { Face, rng, type Eyes } from "./face.ts";
import { Droplets, Ripples } from "./particles.ts";
import { type BodyPose, SoftBody, Spring, type Tuning, clampTuning, frameDelta } from "./physics.ts";

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
export const PUSH_MAX = 0.2;   // M29: it leans a little as its window moves, never smears
/** M46 (F28): how much it sways, floats and breathes at rest in each choice, and how fast. The idle tricks of M26 (a hop, a
 *  shake, a bubble) are gone in every choice: nothing moves unless something happened, or the person chose a sway. Still
 *  sways only while it has news, and its sway fades to nothing in SWAY_FADE_S, linearly, so it reaches exactly 0. */
export const SWAY: Readonly<Record<Liveliness, { amount: number; rate: number }>> = { still: { amount: 1, rate: 1 }, gentle: { amount: 0.4, rate: 0.5 }, lively: { amount: 1, rate: 1 } };
export const SWAY_FADE_S = 2.5;

export type Snapshot = {
  pose: BodyPose; look: Look; eyes: Eyes; state: BehaviorState; tuning: Tuning; time: number;
  /** M37c: the surface it clings to, and how hard it is pressed into it. */
  surface: Surface;
  /** The float added on top of the body's height (a slow bob). */
  float: number;
  /** M46: how much of its resting sway shows (0 none: the clean drop) and the sway's own clock (the shader's waves). */
  sway: number; swayTime: number;
  /** M46: needs you's pulse now, 0 to 1 (0 once its three pulses are done, and in any still frame). */
  pulse: number;
  droplets: Droplets; ripples: Ripples;
};

/** M37c (the founder: "when it gets close to the water it sticks to the sides… the more I push it towards it, the flatter
 *  it gets"): a surface the water clings to. A side of its frame (the screen's edge it is docked on), or the water below
 *  (Home's waterline, `at` from the frame's top, 0 to 1). `cling`: how much it joins the surface at rest. `press`: how hard
 *  it is pushed into it, through a soft spring, so it flattens as it is pushed and wobbles back when let go. */
export type Side = "left" | "right" | "top" | "bottom" | "below";
export type Surface = { side: Side | null; at: number; cling: number; press: number };
export const SIDES: readonly Side[] = ["left", "right", "top", "bottom", "below"];
/** The press spring: soft and under damped, so letting go wobbles back like water (about 3 wobbles a second). */
export const PRESS_SPRING = { hz: 3.2, zeta: 0.3 } as const;

export class FlowflowEngine {
  readonly behavior = new Behavior();
  readonly body: SoftBody;
  readonly face: Face;
  readonly droplets = new Droplets();
  readonly surface: Surface = { side: null, at: 1, cling: 0, press: 0 };
  private pressSpring = new Spring(0, 0); private pressTo = 0;
  readonly ripples = new Ripples();
  private tuning: Tuning;
  private rand: () => number;
  private time = 0;
  private lastLook = -Infinity; private lastMove = -Infinity; private lastGaze = -Infinity; private pushing = false;
  /** M46 (F28, character.lively): Still, the usual; Gentle; or Lively, the only one whose eyes follow the pointer. */
  mode: Liveliness = "still";
  private swayK = 0; private swayT = 0;
  private credit = 0;
  /** How far the body may roam toward the pointer, as a fraction of the frame (the dock is tiny, the preview is large). */
  followRange = 0.35;
  private halfW = 1.6; private halfH = 1.1;

  constructor(tuning: Partial<Tuning> = {}, seed = 7) {
    this.tuning = clampTuning(tuning);
    this.body = new SoftBody(this.tuning); this.face = new Face(seed); this.rand = rng(seed + 101);
    this.body.bounds = { halfW: this.halfW, halfH: this.halfH, r: BODY_RADIUS };
    this.pressSpring.set(PRESS_SPRING.hz, PRESS_SPRING.zeta);
    this.behavior.snap();
  }

  setTuning(t: Partial<Tuning>): void { this.tuning = clampTuning({ ...this.tuning, ...t }); this.body.setTuning(this.tuning); }
  get tune(): Tuning { return this.tuning; }
  /** The frame the body must stay inside (half width and half height, world units). */
  setFrame(halfW: number, halfH: number): void { this.halfW = halfW; this.halfH = halfH; this.body.bounds = { halfW, halfH, r: BODY_RADIUS * 1.08 }; }

  /** The app's state changed. Only a real change does anything: success is never made up. */
  applyApp(s: CharacterState): void { this.behavior.applyApp(s); }

  /** The pointer, in the frame's own units (-1 to 1 across and up). Called whenever it moves. Only in Lively (M46). */
  pointer(nx: number, ny: number): void {
    if (this.mode !== "lively" || !Number.isFinite(nx) || !Number.isFinite(ny)) return;
    this.lastLook = this.time; this.lastMove = this.time;
    this.face.setTarget(nx, ny);
    this.body.setTarget(nx * this.halfW * this.followRange, ny * this.halfH * this.followRange);
  }
  /** The pointer anywhere on the screen (M20): the eyes look toward it and the body leans a little that way. */
  gaze(dx: number, dy: number): void {
    if (this.mode !== "lively") return;   // M46: in Still and Gentle the eyes stay ahead
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

  /** The surface it clings to (none: `null`), where across the canvas (0 to 1 from its left for a side, from its top
   *  otherwise, a little past either end when the screen's edge is past the canvas), and how much it joins it at rest. */
  setSurface(side: Side | null, at = 1, cling = 0): void {
    const ok = side === null || SIDES.includes(side);
    this.surface.side = ok ? side : null;
    this.surface.at = Number.isFinite(at) ? Math.max(-1, Math.min(2, at)) : 1;   // it may lie a little past the canvas
    this.surface.cling = Number.isFinite(cling) ? Math.max(0, Math.min(1, cling)) : 0;
  }
  /** How hard it is pushed into its surface now, 0 to 1 (a drag into the screen's edge). */
  /** firm: it goes there at once and stays, no spring-back wobble (gone in at an edge, M51). */
  press(amount: number, firm = false): void {
    this.pressTo = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
    if (firm) { this.pressSpring.x = this.pressTo; this.pressSpring.v = 0; }
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
  still(): Snapshot {
    this.behavior.snap(); this.body.reset(0, 0); this.pressSpring.x = this.pressTo; this.pressSpring.v = 0; this.surface.press = this.pressTo;
    this.face.wander = this.mode === "lively"; this.face.update(1 / 60, this.behavior.look, false);
    const s = this.snapshot(); s.pulse = 0; return s;   // a still frame holds needs you's amber, with no pulse
  }

  /** M46: the press spring has come to rest (a frame loop may park only then). */
  get pressSettled(): boolean { return Math.abs(this.pressSpring.x - this.pressTo) < 0.002 && Math.abs(this.pressSpring.v) < 0.01; }
  /** M46: how much of its resting sway shows now (0 to the choice's amount). */
  get sway(): number { return this.swayK; }
  /** The sway it is heading for: Still sways only while it has news (any state but rest and sleep). */
  private swayTarget(): number {
    const st = this.behavior.state;
    if (this.mode === "still") return st === "idle" || st === "sleeping" ? 0 : SWAY.still.amount;
    return SWAY[this.mode].amount;
  }

  update(dt: number): Snapshot {
    const d = frameDelta(dt);
    this.time += d;
    this.behavior.setFollowing(this.time - this.lastMove < FOLLOW_HOLD);
    this.behavior.update(d);
    const look = this.behavior.look;
    this.reactToEntered();
    if (!this.pushing && this.time - this.lastMove >= FOLLOW_HOLD && this.time - this.lastGaze >= FOLLOW_HOLD && this.time - this.lastLook < LOOK_HOLD + 1) this.body.setTarget(0, 0);
    // M46: the sway eases toward the choice's amount in a straight line, so Still's reaches exactly 0 and holds there.
    { const to = this.swayTarget(), stepK = d / SWAY_FADE_S; this.swayK = this.swayK < to ? Math.min(to, this.swayK + stepK) : Math.max(to, this.swayK - stepK); }
    this.swayT += d * SWAY[this.mode].rate;
    this.body.setBreath(look.breathAmp * this.swayK, look.breathRate);
    this.body.advance(d);
    { const n = Math.min(8, Math.max(1, Math.ceil(d / (1 / 120)))), h = d / n; for (let i = 0; i < n; i++) this.pressSpring.step(h, this.pressTo); }
    this.surface.press = Math.max(-0.2, Math.min(1.15, this.pressSpring.x));
    this.face.wander = this.mode === "lively";
    this.face.update(d, look, this.time - this.lastLook < LOOK_HOLD);
    // Droplets leave in proportion to how fast the body moves and how readily this mood sheds them: no dice. M46: none
    // unless Lively (a touch or a done still sends its own few).
    this.credit += (this.mode === "lively" ? look.droplets : 0) * Math.min(2, this.body.pose.speed) * 0.9 * d;
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
    const s = this.snap ?? (this.snap = { pose: this.body.pose, look: this.behavior.look, eyes: this.face.eyes, state: "idle", tuning: this.tuning, time: 0, float: 0, sway: 0, swayTime: 0, pulse: 0, droplets: this.droplets, ripples: this.ripples, surface: this.surface });
    s.state = this.behavior.state; s.tuning = this.tuning; s.time = this.time;
    s.sway = this.swayK; s.swayTime = this.swayT; s.pulse = this.behavior.pulse;
    s.float = this.behavior.look.floatAmp * this.swayK * Math.sin(this.swayT * 0.9);
    return s;
  }
}
