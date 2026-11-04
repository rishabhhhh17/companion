// M66 (the plan's fix 12): the live drawings of a page come from one warm pool. Starting a WebGL context and compiling the
// water's shaders took over half a second, and the small characters did it on the open path (History, the notch's wings,
// the practice panel), so the page froze as it opened. Here a drawing is made and compiled in an idle moment, handed over
// ready when a character mounts, and given back when it unmounts, cleaned, for the next one. Macs cap how many contexts a
// page may hold, so few are kept: what is not kept is released at once.
//
// The pool itself is plain logic over whatever it is given (tests use a stand in); flowflowPool() is the page's real one.
import { FlowflowRenderer } from "./renderer.ts";

export type PoolEntry<R> = { canvas: HTMLCanvasElement; renderer: R };
export type PoolParts<R> = {
  /** Makes a drawing on its own canvas, or null where WebGL cannot start. */
  make: () => PoolEntry<R> | null;
  /** Compiles everything it will draw (off the open path). */
  warm: (r: R) => Promise<void> | void;
  /** Puts it back as new (colours, halo, size, nothing drawn) before it waits for the next character. */
  reset: (r: R) => void;
  /** Its GPU context was lost: it can never draw again. */
  lost: (r: R) => boolean;
  dispose: (r: R) => void;
  /** Runs a job when the page is idle. */
  idle: (job: () => void) => void;
  /** The most kept ready at once (2 unless given). */
  max?: number;
};

export class WarmPool<R> {
  private spare: PoolEntry<R>[] = [];
  private making: Promise<boolean> | null = null;
  private keep = 0;
  constructor(private parts: PoolParts<R>) {}

  /** How many are warm and waiting. */
  get ready(): number { return this.spare.length; }

  /** A warm drawing, or null when none is ready (the caller shows the still picture and asks warmSoon). Never makes one. */
  take(): PoolEntry<R> | null {
    while (this.spare.length) {
      const e = this.spare.pop()!;
      if (this.parts.lost(e.renderer)) { this.parts.dispose(e.renderer); continue; }
      if (this.spare.length < this.keep) void this.warmSoon();
      return e;
    }
    if (this.keep > 0) void this.warmSoon();
    return null;
  }

  /** One made now, for a character that cannot wait (the big ones, which mount with their page, not on an open). */
  fresh(): PoolEntry<R> | null { return this.parts.make(); }

  /** Makes and warms one in an idle moment, unless one is ready or on its way. True once one is ready. */
  warmSoon(): Promise<boolean> {
    if (this.spare.length) return Promise.resolve(true);
    if (this.making) return this.making;
    const p = new Promise<boolean>((done) => {
      this.parts.idle(() => {
        const e = this.parts.make();
        if (!e) { done(false); return; }
        Promise.resolve(this.parts.warm(e.renderer)).then(() => true, () => true).then(() => {
          if (this.parts.lost(e.renderer)) { this.parts.dispose(e.renderer); done(false); return; }
          this.spare.push(e); done(true);
        });
      });
    });
    this.making = p;
    void p.then(() => { if (this.making === p) this.making = null; });
    return p;
  }

  /** From now on a take is followed by an idle refill, so one is always ready (the pages with small characters). */
  keepWarm(n = 1): void { this.keep = Math.max(this.keep, Math.min(n, this.parts.max ?? 2)); if (this.spare.length < this.keep) void this.warmSoon(); }

  /** A character closed: its drawing is cleaned and kept for the next, unless it was lost or enough are kept. */
  give(e: PoolEntry<R>): void {
    if (this.parts.lost(e.renderer) || this.spare.length >= (this.parts.max ?? 2)) { this.parts.dispose(e.renderer); return; }
    this.parts.reset(e.renderer);
    e.canvas.remove?.();
    this.spare.push(e);
  }
}

/** Runs a job when the page is idle (at most a second and a half later), or soon where there is no idle callback. */
const whenIdle = (job: () => void): void => {
  const w = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(job, { timeout: 1500 });
  else setTimeout(job, 200);
};

let page: WarmPool<FlowflowRenderer> | null = null;
/** The page's one pool of live drawings. */
export function flowflowPool(): WarmPool<FlowflowRenderer> {
  page ??= new WarmPool<FlowflowRenderer>({
    make: () => { const canvas = document.createElement("canvas"); const renderer = FlowflowRenderer.create(canvas); return renderer ? { canvas, renderer } : null; },
    warm: (r) => r.warm(),
    reset: (r) => r.reset(),
    lost: (r) => r.lost,
    dispose: (r) => r.dispose(),
    idle: whenIdle,
  });
  return page;
}
