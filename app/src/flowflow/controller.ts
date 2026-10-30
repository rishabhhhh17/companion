// The desktop side: pointer, size, pixel ratio, visibility and the animation loop. It starts Flowflow's engine and renderer,
// feeds them what the page and the pointer say, and shuts everything down cleanly. It listens to the pointer without ever
// taking it: nothing here stops a click, a drag or a key from reaching the window's own handlers.
import type { CharacterState } from "../model.ts";
import { FlowflowEngine, type Side } from "./engine.ts";
import { FlowflowRenderer } from "./renderer.ts";
import type { Tuning } from "./physics.ts";

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
};

/** Frame intervals (seconds) for the resting moods, to spend little when nothing is happening. */
// M38 (battery): 20 a second while it only sways at rest; its slow liquid motion looks the same, the GPU works a third less.
const IDLE_INTERVAL = 1 / 20, SLEEP_INTERVAL = 1 / 15, RESUME_GAP_MS = 500;

export class FlowflowController {
  readonly engine: FlowflowEngine; private renderer: FlowflowRenderer;
  private opts: ControllerOptions;
  private raf = 0; private timer: ReturnType<typeof setTimeout> | null = null; private last = 0; private acc = 0;
  private visible = true; private disposed = false; private reduced: boolean;
  private ro: ResizeObserver | null = null; private io: IntersectionObserver | null = null;
  private dprMql: MediaQueryList | null = null;
  private gaps: number[] = []; private costs: number[] = []; private ftIdx = 0; private lastDrawn = 0;
  private cleanups: (() => void)[] = [];
  private lastPointer = -Infinity;

  /** Returns null when WebGL cannot start (the caller keeps the picture poses). */
  static create(opts: ControllerOptions): FlowflowController | null {
    const r = FlowflowRenderer.create(opts.canvas);
    return r ? new FlowflowController(opts, r) : null;
  }

  private constructor(opts: ControllerOptions, renderer: FlowflowRenderer) {
    this.opts = opts; this.renderer = renderer; this.reduced = !!opts.reduced;
    this.engine = new FlowflowEngine(opts.tuning ?? {}, opts.seed ?? 7);
    if (opts.followRange !== undefined) this.engine.followRange = opts.followRange;
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
    this.engine.touch((dx / n) * 0.7, (-dy / n) * 0.7); this.lastPointer = performance.now(); this.resumeOrPause();
  }
  /** The drop comes home: it lands on top and ripples through. */
  catch(): void {
    if (this.reduced || this.disposed) return;
    this.engine.touch(0, 0.6); this.lastPointer = performance.now(); this.resumeOrPause();
  }

  /** Alive on the side (M20): the pointer anywhere on the screen, its window moving, coming in from the edge, and Lively. */
  gaze(dx: number, dy: number): void { if (this.disposed || this.reduced) return; this.engine.gaze(dx, dy); this.lastPointer = performance.now(); this.resumeOrPause(); }
  push(vx: number, vy: number): void { if (this.disposed || this.reduced) return; this.engine.push(vx, vy); this.lastPointer = performance.now(); this.resumeOrPause(); }
  arrive(fromX: number, fromY = 0): void { if (this.disposed || this.reduced) return; this.engine.arrive(fromX, fromY); this.lastPointer = performance.now(); this.resumeOrPause(); }
  /** M37c: the surface the water clings to, and how hard it is pushed into it (engine.ts Surface). */
  setSurface(side: Side | null, at = 1, cling = 0): void { if (this.disposed) return; this.engine.setSurface(side, at, cling); if (this.reduced) this.still(); else this.resumeOrPause(); }
  press(amount: number): void { if (this.disposed) return; this.engine.press(amount); if (this.reduced) this.still(); else { this.lastPointer = performance.now(); this.resumeOrPause(); } }
  setLively(on: boolean): void { this.engine.lively = on; if (on) this.resumeOrPause(); }

  /** The water's colours (lookfeel.ts flowColours). */
  setColours(light: string, deep: string): void { if (this.disposed) return; this.renderer.setColours(light, deep); if (this.reduced) this.still(); else this.resumeOrPause(); }

  setState(s: CharacterState): void { this.engine.applyApp(s); if (this.reduced) this.still(); else this.resumeOrPause(); }
  setTuning(t: Partial<Tuning>): void { this.engine.setTuning(t); if (this.reduced) this.still(); }
  setReduced(r: boolean): void { if (r === this.reduced) return; this.reduced = r; if (r) { this.stop(); this.still(); } else this.resumeOrPause(); }

  /** Timing of the frames actually drawn (the last 120): the gap between two draws and the time one draw cost, in milliseconds. */
  stats(): { intervalMs: number; renderMs: number; fps: number; frames: number } {
    const n = this.gaps.length; if (!n) return { intervalMs: 0, renderMs: 0, fps: 0, frames: 0 };
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const iv = avg(this.gaps);
    return { intervalMs: iv, renderMs: avg(this.costs), fps: iv > 0 ? 1000 / iv : 0, frames: n };
  }

  private active(): boolean { return !this.disposed && !this.reduced && this.visible && !document.hidden; }
  private resumeOrPause(): void { if (this.active()) this.start(); else this.stop(); }
  private start(): void {
    if (this.raf || this.disposed) return;
    // Resting between frames: anything that happens draws on the next refresh, not when the rest would have ended.
    if (this.timer) { clearTimeout(this.timer); this.timer = null; this.raf = requestAnimationFrame(this.loop); return; }
    this.last = performance.now(); this.raf = requestAnimationFrame(this.loop);
  }
  private stop(): void { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  private interval(): number {
    const e = this.engine, st = e.behavior.state;
    if (st === "sleeping") return SLEEP_INTERVAL;
    const quiet = st === "idle" && !e.lively && e.body.settled && e.droplets.alive === 0 && e.ripples.alive === 0 && performance.now() - this.lastPointer > 4000;
    return quiet ? IDLE_INTERVAL : 0;
  }

  private loop = (now: number): void => {
    this.raf = 0; if (!this.active()) return;
    const gap = now - this.last; this.last = now;
    // After a suspension (a long gap) nothing is simulated: the body carries on from where it was.
    this.acc += gap > RESUME_GAP_MS ? 0 : gap / 1000;
    if (this.acc >= this.interval()) {
      const t0 = performance.now();
      this.renderer.render(this.engine.update(this.acc)); this.acc = 0;
      const t1 = performance.now();
      if (this.lastDrawn > 0 && now - this.lastDrawn < RESUME_GAP_MS) { this.gaps[this.ftIdx] = now - this.lastDrawn; this.costs[this.ftIdx] = t1 - t0; this.ftIdx = (this.ftIdx + 1) % 120; }
      this.lastDrawn = now;
    }
    // Resting (M25): wake only when the next frame is due, not at every refresh of the screen (up to 120 a second), so the
    // same calm water costs a fraction of the work in a window that is on all day. Anything that happens wakes it at once.
    const iv = this.interval();
    if (iv > 0) this.timer = setTimeout(() => { this.timer = null; if (this.active()) this.raf = requestAnimationFrame(this.loop); }, Math.max(0, iv * 1000 - 4));
    else this.raf = requestAnimationFrame(this.loop);
  };

  private still(): void { if (!this.disposed) this.renderer.render(this.engine.still()); }

  private measure(): void {
    if (this.disposed) return;
    const r = this.opts.canvas.getBoundingClientRect();
    this.renderer.setSize(r.width, r.height, window.devicePixelRatio || 1);
    this.engine.setFrame(this.renderer.halfW, this.renderer.halfH);
    if (this.reduced || !this.raf) this.renderer.render(this.engine.still());
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
    this.lastPointer = performance.now();
    const r = this.opts.canvas.getBoundingClientRect(); if (!(r.width > 0)) return;
    const span = Math.max(r.width, r.height) * 1.2;
    this.engine.pointer(((e.clientX - (r.left + r.width / 2)) / span) * 2, (-(e.clientY - (r.top + r.height / 2)) / span) * 2);
    if (this.reduced) this.still();
  }
  private onDown(e: PointerEvent): void {
    const r = this.opts.canvas.getBoundingClientRect(); if (!(r.width > 0)) return;
    const w = this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top), p = this.engine.body.pose;
    this.engine.touch(w.x - p.x, w.y - p.y); this.lastPointer = performance.now();
    if (!this.raf) this.resumeOrPause();
  }

  /** Stop the loop, remove every listener and observer, and free the GPU. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.stop();
    for (const c of this.cleanups) c(); this.cleanups.length = 0;
    this.ro?.disconnect(); this.io?.disconnect(); this.ro = null; this.io = null;
    this.renderer.dispose();
  }
}
