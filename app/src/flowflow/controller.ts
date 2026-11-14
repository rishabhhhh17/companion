// The desktop side: pointer, size, pixel ratio, visibility and the animation loop. It starts Flowflow's engine and renderer,
// feeds them what the page and the pointer say, and shuts everything down cleanly. It listens to the pointer without ever
// taking it: nothing here stops a click, a drag or a key from reaching the window's own handlers.
import type { CharacterState } from "../model.ts";
import type { Reaction } from "../moods.ts";
import type { Liveliness } from "../lookfeel.ts";
import { FlowflowEngine, type Side, type Snapshot } from "./engine.ts";
import { FlowflowRenderer } from "./renderer.ts";
import type { Tuning } from "./physics.ts";

/** What the controller asks of a renderer (FlowflowRenderer; the tests give a stand in that only counts frames). */
export type RendererLike = {
  halfW: number; halfH: number;
  render(s: Snapshot): void;
  setSize(cssW: number, cssH: number, dpr: number): void;
  toWorld(px: number, py: number): { x: number; y: number };
  setColours(light: string, deep: string): void;
  setEnvBase?(css: string): void;
  setHalo?(on: boolean): void;
  setMode?(m: Liveliness): void;
  dispose(): void;
};

export type ControllerOptions = {
  canvas: HTMLCanvasElement;
  /** The element whose presses count as touches (the character's own button); it is only listened to. */
  host: HTMLElement;
  tuning?: Partial<Tuning>;
  /** Less motion: no loop, one still picture on each change. */
  reduced?: boolean;
  /** How far the body may follow the pointer, as a fraction of its frame (the dock is small, the preview is large). */
  followRange?: number;
  seed?: number;
  /** Called when the GPU context is lost, so the page can go back to the pictures. */
  onFallback?: () => void;
  /** M46: a small Flowflow (the notch's wing): working draws at WORK_INTERVAL in every choice, Lively included. */
  small?: boolean;
  /** M90 review: pinned for the peek out of the notch (FlowflowEngine.pinned): its place and size hold, nothing leaves it. */
  pinned?: boolean;
  /** A renderer to use instead of starting WebGL: the page's warm pool's (pool.ts, M66), or a test's stand in. */
  renderer?: RendererLike;
  /** M66: hands the renderer back to the pool on dispose, instead of freeing its GPU context. */
  release?: () => void;
};

/** Frame intervals (seconds), to spend little when nothing is happening. Lively keeps today's: every refresh while awake,
 *  15 a second asleep (M38's 20 a second at rest applied only when Lively was off, which Still now replaces). */
const SLEEP_INTERVAL = 1 / 15, RESUME_GAP_MS = 500;
/** M46 (F28, F04's idle budget): no frame and no timer at all. */
export const PARK = -1;
/** Gentle's cap at rest. [verify] against F04's budget on a real Mac (spec M46 section 10). */
export const GENTLE_INTERVAL = 1 / 12;
/** Working, thinking and checking in Still and Gentle; the notch's small Flowflow in every choice. */
export const WORK_INTERVAL = 1 / 30;
/** Still parks this long after the last news, once the state allows it. */
export const NO_NEWS_MS = 3000;
/** M55: a reaction (a lean, the eyes going to the ask box and back, a lift ending) is drawn at full rate this long in Gentle,
 *  long enough for its springs to settle, then Gentle goes back to its cap. Still and Lively follow their own rules. */
export const QUICK_MS = 1200;

export class FlowflowController {
  readonly engine: FlowflowEngine; private renderer: RendererLike;
  private opts: ControllerOptions;
  private raf = 0; private timer: ReturnType<typeof setTimeout> | null = null; private last = 0; private acc = 0;
  private visible = true; private disposed = false; private reduced: boolean;
  private ro: ResizeObserver | null = null; private io: IntersectionObserver | null = null;
  private dprMql: MediaQueryList | null = null;
  private gaps: number[] = []; private costs: number[] = []; private ftIdx = 0; private lastDrawn = 0;
  private cleanups: (() => void)[] = [];
  /** M46: when the last news came (a state change, a touch, a press, a move of its window, pointing, listening, a new
   *  liveliness, the end of a rest). The pointer is news only in Lively. */
  private lastNews = -Infinity;
  /** The app's state as last told (listening is the one state that runs during rest, rule 5). */
  private app: CharacterState | null = null;
  /** M83: the reaction as last told. */
  private reaction: Reaction | null = null;
  /** M46: resting (a call, Low Power Mode, tucked away): one still frame, no loop, except while listening. */
  private resting = false;
  /** M55: Gentle draws every refresh until then (a reaction under way), and the engine's count of reactions last seen. */
  private quickUntil = 0; private turnsSeen = 0;

  /** Returns null when WebGL cannot start (the caller keeps the picture poses). */
  static create(opts: ControllerOptions): FlowflowController | null {
    const r = opts.renderer ?? FlowflowRenderer.create(opts.canvas);
    return r ? new FlowflowController(opts, r) : null;
  }

  private constructor(opts: ControllerOptions, renderer: RendererLike) {
    this.opts = opts; this.renderer = renderer; this.reduced = !!opts.reduced;
    this.engine = new FlowflowEngine(opts.tuning ?? {}, opts.seed ?? 7);
    if (opts.followRange !== undefined) this.engine.followRange = opts.followRange;
    if (opts.pinned) this.engine.pinned = true;
    this.measure();
    const win = window, doc = document;
    const on = <T extends EventTarget>(t: T, type: string, fn: EventListener, o?: AddEventListenerOptions) => { t.addEventListener(type, fn, o); this.cleanups.push(() => t.removeEventListener(type, fn, o)); };
    on(win, "pointermove", (e) => this.onMove(e as PointerEvent), { passive: true });
    on(doc, "pointerleave", () => this.engine.pointerLeft(), { passive: true });
    on(win, "blur", () => this.engine.pointerLeft(), { passive: true });
    on(opts.host, "pointerdown", (e) => this.onDown(e as PointerEvent), { passive: true });
    on(doc, "visibilitychange", () => this.resumeOrPause(), { passive: true });
    on(opts.canvas, "webglcontextlost", (e) => { e.preventDefault(); this.stop(); opts.onFallback?.(); });
    if (typeof ResizeObserver !== "undefined") { this.ro = new ResizeObserver(() => this.measure()); this.ro.observe(opts.canvas); }
    if (typeof IntersectionObserver !== "undefined") { this.io = new IntersectionObserver((es) => { this.visible = es.some((x) => x.isIntersecting) || es.length === 0; this.resumeOrPause(); }); this.io.observe(opts.canvas); }
    this.watchDpr();
    this.engine.setFrame(this.renderer.halfW, this.renderer.halfH);
    this.resumeOrPause();
  }

  /** The water pointer leaves (M17): the body is poked on the side facing the target and sheds a drop that way. `dx, dy`:
   *  the way to the target on the screen (y down). Nothing with less motion. */
  give(dx: number, dy: number): void {
    if (this.reduced || this.disposed) return;
    const n = Math.hypot(dx, dy) || 1;
    this.engine.touch((dx / n) * 0.7, (-dy / n) * 0.7); this.news();
  }
  /** The drop comes home: it lands on top and ripples through. */
  catch(): void {
    if (this.reduced || this.disposed) return;
    this.engine.touch(0, 0.6); this.news();
  }

  /** Alive on the side (M20): the pointer anywhere on the screen. M46: only in Lively; otherwise nothing at all happens
   *  (no eye target, no frame), so a pointer crossing the screen never wakes a parked character. */
  gaze(dx: number, dy: number): void { if (this.disposed || this.reduced || this.engine.mode !== "lively") return; this.engine.gaze(dx, dy); this.resumeOrPause(); }
  /** Its window moving and coming in from the edge are news: the person moved it. */
  push(vx: number, vy: number): void { if (this.disposed || this.reduced) return; this.engine.push(vx, vy); this.news(); }
  arrive(fromX: number, fromY = 0): void { if (this.disposed || this.reduced) return; this.engine.arrive(fromX, fromY); this.news(); }
  /** M37c: the surface the water clings to, and how hard it is pushed into it (engine.ts Surface). */
  setSurface(side: Side | null, at = 1, cling = 0): void { if (this.disposed) return; this.engine.setSurface(side, at, cling); this.nudge(); }
  press(amount: number, firm = false): void { if (this.disposed) return; this.engine.press(amount, firm); if (!this.reduced) this.lastNews = performance.now(); this.nudge(); }
  /** M46 (F28): Still, Gentle or Lively. A new choice is news, so it shows at once and then follows its own rule. */
  setLiveliness(m: Liveliness): void {
    if (this.disposed) return;
    const changed = this.engine.mode !== m;
    this.engine.mode = m;
    if (changed) { this.renderer.setMode?.(m); this.measure(); }
    this.news();
  }
  /** M46: rest (a call with Quiet during calls, Low Power Mode, tucked away). One still frame and no loop, except while
   *  listening: rule 5's light is never stilled. Leaving rest is news. */
  setResting(r: boolean): void {
    if (this.disposed || r === this.resting) return;
    this.resting = r;
    if (this.restingNow()) { this.stop(); this.still(); } else { this.lastNews = performance.now(); this.resumeOrPause(); }
  }

  /** M55 (the character reacts): the person typing in the ask box, which lies `dx, dy` points from the middle of the
   *  character (y down). Its eyes go to it in Gentle and Lively. In Still typing is not news: nothing happens at all, no
   *  frame and no eye. Only that a key went in reaches here, never what was typed. */
  attend(dx: number, dy: number): void {
    if (this.disposed || this.reduced || this.engine.mode === "still") return;
    const fresh = this.engine.attend(dx, dy);
    if (!this.engine.attending) return;   // not taken: switched off, or not a place
    // In Gentle each key keeps it awake (a parked error or needs you wakes to look); the first draws at once.
    this.lastNews = performance.now();
    if (fresh || (!this.raf && !this.timer)) this.resumeOrPause();
  }
  /** M55: changes wait for a review and their card lies `dx, dy` points from the middle of the character (y down), or
   *  `null` once nothing waits. It leans toward the card while they wait. A new lean, or its end, is news. */
  leanToward(to: { dx: number; dy: number } | null): void {
    if (this.disposed || !this.engine.leanToward(to ? to.dx : null, to ? to.dy : 0)) return;
    if (!this.reduced) this.lastNews = performance.now();
    this.nudge();
  }
  /** M55 (character.reacts): its small moves for what happens (the lean, the lift, the dip, the eyes on the ask box). */
  setReacts(on: boolean): void {
    if (this.disposed || this.engine.reacts === on) return;
    this.engine.reacts = on;
    if (this.reduced || this.restingNow()) this.nudge(); else this.news();
  }

  /** The water's colours (lookfeel.ts flowColours). */
  setColours(light: string, deep: string): void { if (this.disposed) return; this.renderer.setColours(light, deep); this.nudge(); }
  /** The page's sky behind the drop (renderer.ts setEnvBase). */
  setEnvBase(css: string): void { if (this.disposed) return; this.renderer.setEnvBase?.(css); this.nudge(); }
  /** M60: the orb's soft halo on a dark page (renderer.ts setHalo). */
  setHalo(on: boolean): void { if (this.disposed) return; this.renderer.setHalo?.(on); this.nudge(); }

  /** The app's state. A real change is news; the same state again is not. */
  setState(s: CharacterState): void {
    if (this.disposed) return;
    const changed = s !== this.app;
    this.app = s; this.engine.applyApp(s);
    if (changed && !this.reduced) this.lastNews = performance.now();
    this.nudge();
  }
  /** M83: the reaction in force (moods.ts, from a real event), or null. A change is news; with less motion, one still look. */
  setReaction(r: Reaction | null): void {
    if (this.disposed || r === this.reaction) return;
    this.reaction = r; this.engine.applyReaction(r);
    if (!this.reduced) this.lastNews = performance.now();
    this.nudge();
  }
  /** M83: the middle of the screen lies `dx, dy` points from the middle of the character (y down): where it watches. */
  watchToward(dx: number, dy: number): void { if (this.disposed) return; this.engine.watchToward(dx, dy); if (this.reaction === "watching") this.nudge(); }
  setTuning(t: Partial<Tuning>): void { this.engine.setTuning(t); if (this.reduced) this.still(); }
  setReduced(r: boolean): void { if (r === this.reduced) return; this.reduced = r; if (r) { this.stop(); this.still(); } else this.resumeOrPause(); }

  /** Timing of the frames actually drawn (the last 120): the gap between two draws and the time one draw cost, in milliseconds. */
  stats(): { intervalMs: number; renderMs: number; fps: number; frames: number } {
    const n = this.gaps.length; if (!n) return { intervalMs: 0, renderMs: 0, fps: 0, frames: 0 };
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const iv = avg(this.gaps);
    return { intervalMs: iv, renderMs: avg(this.costs), fps: iv > 0 ? 1000 / iv : 0, frames: n };
  }

  private restingNow(): boolean { return this.resting && this.app !== "listening"; }
  private active(): boolean { return !this.disposed && !this.reduced && this.visible && !document.hidden && !this.restingNow(); }
  /** Something happened that the person should see: it moves at once, then follows its rule. */
  private news(): void { this.lastNews = performance.now(); this.resumeOrPause(); }
  /** Show a change: a still frame when it may not move (less motion, or resting), else the loop. */
  private nudge(): void { if (this.reduced || this.restingNow()) { this.stop(); this.still(); } else this.resumeOrPause(); }
  private resumeOrPause(): void { if (this.active()) this.start(); else this.stop(); }
  private start(): void {
    if (this.raf || this.disposed) return;
    // Resting between frames: anything that happens draws on the next refresh, not when the rest would have ended.
    if (this.timer) { clearTimeout(this.timer); this.timer = null; this.raf = requestAnimationFrame(this.loop); return; }
    this.last = performance.now(); this.raf = requestAnimationFrame(this.loop);
  }
  private stop(): void { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  /** Seconds until the next frame (0: the next refresh), or PARK: no frame and no timer until news. */
  private interval(): number {
    const e = this.engine, st = e.behavior.state;
    if (this.opts.small && st === "working" && !this.restingNow()) return WORK_INTERVAL;   // the notch's wing, in every choice
    if (e.mode === "lively") return st === "sleeping" ? SLEEP_INTERVAL : 0;   // today's rule
    if (this.restingNow()) return PARK;
    if (this.parkable()) return PARK;
    if (st === "working") return WORK_INTERVAL;
    // M55: Gentle draws a reaction at full rate until it has settled (QUICK_MS), then goes back to its cap.
    if (st === "idle" || st === "sleeping") return e.mode === "gentle" && performance.now() >= this.quickUntil ? GENTLE_INTERVAL : 0;
    return 0;   // a touch, listening, a flash: every refresh
  }
  /** M46: may it stop drawing? Only once nothing is moving and nothing is due: no news for NO_NEWS_MS, a state that holds
   *  still (rest, sleep, a dull error, needs you after its pulses), no flash, the body and the press at rest, no drop or
   *  ripple alive, the eyes open, the two bubbles (M60) at rest, and in Still at rest no sway left. Gentle never parks at rest: it sways at its cap. */
  private parkable(): boolean {
    const e = this.engine, st = e.behavior.state, rest = st === "idle" || st === "sleeping";
    if (e.mode === "lively" || (e.mode === "gentle" && rest)) return false;
    if (performance.now() - this.lastNews < NO_NEWS_MS) return false;
    if (!(rest || st === "error" || (st === "needsYou" && e.behavior.pulsesDone))) return false;
    if (!e.body.settled || !e.pressSettled || e.droplets.alive !== 0 || e.ripples.alive !== 0 || e.face.blinking || !e.followers.settled) return false;
    return !(e.mode === "still" && rest && e.sway !== 0);
  }

  private draw(now: number): void {
    const t0 = performance.now();
    this.renderer.render(this.engine.update(this.acc)); this.acc = 0;
    const t1 = performance.now();
    // M55: something it reacts to changed in this frame (where it rests, what its eyes look at): full rate for a moment.
    if (this.engine.turns !== this.turnsSeen) { this.turnsSeen = this.engine.turns; this.quickUntil = t1 + QUICK_MS; }
    if (this.lastDrawn > 0 && now - this.lastDrawn < RESUME_GAP_MS) { this.gaps[this.ftIdx] = now - this.lastDrawn; this.costs[this.ftIdx] = t1 - t0; this.ftIdx = (this.ftIdx + 1) % 120; }
    this.lastDrawn = now;
  }

  private loop = (now: number): void => {
    this.raf = 0; if (!this.active()) return;
    const gap = now - this.last; this.last = now;
    // After a suspension (a long gap) nothing is simulated: the body carries on from where it was.
    this.acc += gap > RESUME_GAP_MS ? 0 : gap / 1000;
    // M46: parked. One last frame (its sway is already nothing), then nothing is scheduled until news wakes it.
    if (this.interval() === PARK) { this.draw(now); this.stop(); return; }
    if (this.acc >= this.interval()) this.draw(now);
    // Resting (M25): wake only when the next frame is due, not at every refresh of the screen (up to 120 a second), so the
    // same calm water costs a fraction of the work in a window that is on all day. Anything that happens wakes it at once.
    const iv = this.interval();
    if (iv > 0) this.timer = setTimeout(() => { this.timer = null; if (this.active()) this.raf = requestAnimationFrame(this.loop); }, Math.max(0, iv * 1000 - 4));
    else this.raf = requestAnimationFrame(this.loop);
  };

  /** One still frame. With less motion only the state; otherwise (resting, a resize while parked) where it rests (M55). */
  private still(): void { if (!this.disposed) this.renderer.render(this.engine.still(!this.reduced)); }

  private measure(): void {
    if (this.disposed) return;
    const r = this.opts.canvas.getBoundingClientRect();
    this.renderer.setSize(r.width, r.height, window.devicePixelRatio || 1);
    this.engine.setFrame(this.renderer.halfW, this.renderer.halfH);
    if (this.reduced || !this.raf) this.renderer.render(this.engine.still(!this.reduced));
  }
  /** The pixel ratio changes when the window moves to another screen: ask to be told, and measure again. */
  private watchDpr(): void {
    const arm = () => {
      this.dprMql?.removeEventListener("change", onChange);
      this.dprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      this.dprMql.addEventListener("change", onChange);
    };
    const onChange = () => { this.measure(); arm(); };
    arm();
    this.cleanups.push(() => this.dprMql?.removeEventListener("change", onChange));
  }

  private onMove(e: PointerEvent): void {
    if (this.disposed || this.engine.mode !== "lively") return;   // M46: the pointer is news only in Lively
    const r = this.opts.canvas.getBoundingClientRect(); if (!(r.width > 0)) return;
    const span = Math.max(r.width, r.height) * 1.2;
    this.engine.pointer(((e.clientX - (r.left + r.width / 2)) / span) * 2, (-(e.clientY - (r.top + r.height / 2)) / span) * 2);
    if (this.reduced) this.still(); else this.resumeOrPause();
  }
  private onDown(e: PointerEvent): void {
    if (this.disposed) return;
    const r = this.opts.canvas.getBoundingClientRect(); if (!(r.width > 0)) return;
    const w = this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top), p = this.engine.body.pose;
    this.engine.touch(w.x - p.x, w.y - p.y); this.lastNews = performance.now();
    if (!this.raf) this.resumeOrPause();
  }

  /** Stop the loop, remove every listener and observer, and free the GPU. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.stop();
    for (const c of this.cleanups) c(); this.cleanups.length = 0;
    this.ro?.disconnect(); this.io?.disconnect(); this.ro = null; this.io = null;
    if (this.opts.release) this.opts.release(); else this.renderer.dispose();
  }
}
