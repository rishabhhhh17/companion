// M55, section 4: the character reacts to real events. The water bubble looks at the pointer in Lively, at the ask box
// while the person types, its two bubbles circle while it works, it splashes a little when a fix is proven, dips a little
// when something fails, lifts gently when it needs you and leans toward the review card while changes wait. All of it
// follows How lively, Reduce motion and Less motion, and in Still it reacts only to news. Run without a screen: the engine
// on its own, and the controller on a stand in page (a fake clock, fake frames and timers, a renderer that only counts).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ATTEND_HOLD, DIP, FlowflowEngine, LEAN_SHIFT, LEAN_TILT, LIFT, type Snapshot } from "./engine.ts";
import { fromApp } from "./behavior.ts";
import { FlowflowController, GENTLE_INTERVAL, NO_NEWS_MS, QUICK_MS, type RendererLike } from "./controller.ts";
import { MAX_DROPLETS } from "./particles.ts";

const run = (e: FlowflowEngine, s: number, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) e.update(dt); };
const eyesX = (e: FlowflowEngine) => (e.face.eyes.lx + e.face.eyes.rx) / 2;
const eyesY = (e: FlowflowEngine) => (e.face.eyes.ly + e.face.eyes.ry) / 2;
const engine = (mode: "still" | "gentle" | "lively" = "still") => { const e = new FlowflowEngine(); e.mode = mode; run(e, 1); return e; };
/** The lowest and highest the body goes over `s` seconds. */
function span(e: FlowflowEngine, s: number): { lo: number; hi: number } {
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < s; t += 1 / 60) { const y = e.update(1 / 60).pose.y; lo = Math.min(lo, y); hi = Math.max(hi, y); }
  return { lo, hi };
}

describe("each state's reaction comes from the app's own state (only what really happened)", () => {
  test("working, thinking and checking circle the bubbles; done splashes; failed dips; needs you lifts", () => {
    expect(fromApp("working").base).toBe("working"); expect(fromApp("thinking").base).toBe("working"); expect(fromApp("checking").base).toBe("working");
    expect(fromApp("done")).toEqual({ base: "idle", flash: "success" });
    expect(fromApp("error").base).toBe("error");
    expect(fromApp("needsYou").base).toBe("needsYou");
    expect(fromApp("idle").base).toBe("idle");
  });
});

describe("the follower bubbles circle while it works", () => {
  test("in every choice they go round it, slowly, and rest again once the work is over", () => {
    for (const mode of ["still", "gentle", "lively"] as const) {
      const e = engine(mode);
      e.applyApp("working"); run(e, 1.5);
      const x0 = e.followers.x[0], y0 = e.followers.y[0];
      run(e, 1.5);
      expect(Math.hypot(e.followers.x[0] - x0, e.followers.y[0] - y0), mode).toBeGreaterThan(0.1);
      expect(e.followers.settled, mode).toBe(false);
      e.applyApp("idle"); run(e, 8);
      if (mode !== "lively") expect(e.followers.settled, mode).toBe(true);   // Lively lets them drift a little at rest
    }
  });
});

describe("a small splash when a fix is proven", () => {
  test("one ripple, its two bubbles rise and pop into a few drops, then it settles; the same state again does nothing", () => {
    const e = engine();
    e.applyApp("done"); run(e, 0.1);
    expect(e.ripples.alive).toBe(1);
    expect(e.followers.celebrating).toBe(true);
    let drops = 0; for (let t = 0; t < 1.6; t += 1 / 60) { e.update(1 / 60); drops = Math.max(drops, e.droplets.alive); }
    expect(drops).toBeGreaterThan(0); expect(drops).toBeLessThanOrEqual(4);   // small: two drops from each pop, never a burst of eight
    expect(drops).toBeLessThan(MAX_DROPLETS);
    run(e, 6); expect(e.behavior.state).toBe("idle"); expect(e.ripples.alive).toBe(0); expect(e.droplets.alive).toBe(0);
    e.applyApp("done"); run(e, 0.3); expect(e.ripples.alive).toBe(0);
  });
});

describe("a small dip when something fails", () => {
  test("it sinks a little, comes back up, and holds still there", () => {
    const e = engine();
    e.applyApp("error");
    const { lo } = span(e, 0.8);
    expect(lo).toBeLessThan(-DIP * 0.5);
    expect(lo).toBeGreaterThan(-DIP * 1.3);   // small: never a fall
    run(e, 3);
    expect(Math.abs(e.body.pose.y)).toBeLessThan(0.005);
    expect(e.body.settled).toBe(true);
  });
  test("only when it fails: the same error again does not dip again", () => {
    const e = engine(); e.applyApp("error"); run(e, 4);
    e.applyApp("error");
    expect(span(e, 0.8).lo).toBeGreaterThan(-0.005);
  });
});

describe("a gentle lift when it needs you", () => {
  test("it rises a little, holds there while it waits, and comes down again once answered", () => {
    const e = engine();
    e.applyApp("needsYou");
    const { hi } = span(e, 3);
    expect(hi).toBeLessThan(LIFT * 1.25);   // gentle: a soft rise, no jump
    expect(e.body.pose.y).toBeCloseTo(LIFT, 2);
    expect(e.body.settled).toBe(true);   // held still, so it can park
    e.applyApp("idle"); run(e, 3);
    expect(Math.abs(e.body.pose.y)).toBeLessThan(0.005);
  });
});

describe("it leans toward the review card while changes wait", () => {
  test("a card to its right: it moves a little that way, tilts toward it and looks at it, then holds still", () => {
    const e = engine();
    expect(e.leanToward(300, 0)).toBe(true);
    run(e, 3);
    expect(e.body.pose.x).toBeCloseTo(LEAN_SHIFT, 2);
    expect(e.body.pose.lean).toBeCloseTo(LEAN_TILT, 2);
    expect(eyesX(e)).toBeGreaterThan(0.3);
    expect(e.body.settled).toBe(true);
  });
  test("a card below it: it leans down toward it and looks down; nothing waiting: it comes back", () => {
    const e = engine();
    e.leanToward(0, 300); run(e, 3);
    expect(e.body.pose.y).toBeCloseTo(-LEAN_SHIFT, 2);
    expect(Math.abs(e.body.pose.x)).toBeLessThan(0.005);
    expect(eyesY(e)).toBeLessThan(-0.3);
    expect(e.leanToward(null)).toBe(true);
    run(e, 3);
    expect(Math.abs(e.body.pose.y)).toBeLessThan(0.005);
    expect(Math.abs(e.body.pose.lean)).toBeLessThan(0.005);
    expect(Math.abs(eyesY(e))).toBeLessThan(0.05);
  });
  test("the same card again is not a new lean; a nonsense place is no lean at all", () => {
    const e = engine();
    expect(e.leanToward(300, 0)).toBe(true);
    expect(e.leanToward(302, 1)).toBe(false);
    expect(e.leanToward(NaN, 0)).toBe(true);   // ends the lean
    expect(e.leanToward(Infinity, 3)).toBe(false);
    expect(e.leanToward(0, 0)).toBe(false);
    run(e, 3); expect(Math.abs(e.body.pose.x)).toBeLessThan(0.005);
  });
  test("it needs you while changes wait: both, lifted and leaning", () => {
    const e = engine(); e.leanToward(300, 0); e.applyApp("needsYou"); run(e, 4);
    expect(e.body.pose.x).toBeCloseTo(LEAN_SHIFT, 2); expect(e.body.pose.y).toBeCloseTo(LIFT, 2);
  });
});

describe("it looks at the ask box while you type", () => {
  test("Gentle and Lively: the eyes go to the box while the keys come, then come back", () => {
    for (const mode of ["gentle", "lively"] as const) {
      const e = engine(mode);
      for (let i = 0; i < 20; i++) { e.attend(0, 200); run(e, 0.05); }   // a key every 50 ms, the box below it
      expect(eyesY(e), mode).toBeLessThan(-0.3);
      run(e, ATTEND_HOLD + 1.5);
      // Back ahead (Lively may glance aside by itself at rest, so only off the box there).
      if (mode === "gentle") expect(Math.abs(eyesY(e))).toBeLessThan(0.08); else expect(eyesY(e)).toBeGreaterThan(-0.25);
    }
  });
  test("Still: typing is not news, so nothing happens at all", () => {
    const e = engine("still");
    expect(e.attend(0, 200)).toBe(false);
    run(e, 0.5);
    expect(Math.abs(eyesY(e))).toBeLessThan(0.02);
  });
  test("the box wins over the pointer while you type (Lively), and the pointer over the lean", () => {
    const e = engine("lively");
    e.leanToward(300, 0);
    for (let t = 0; t < 1; t += 1 / 60) { e.pointer(-0.9, 0); e.update(1 / 60); }
    expect(eyesX(e)).toBeLessThan(-0.2);   // the pointer, to the left, over the card on the right
    for (let t = 0; t < 1; t += 1 / 60) { e.pointer(-0.9, 0); if (t % 0.1 < 1 / 60) e.attend(0, 200); e.update(1 / 60); }
    expect(eyesY(e)).toBeLessThan(-0.3);   // the box below, over the pointer
    expect(Math.abs(eyesX(e))).toBeLessThan(0.15);
  });
  test("a nonsense place changes nothing", () => {
    const e = engine("lively");
    expect(e.attend(NaN, 1)).toBe(false); expect(e.attend(0, Infinity)).toBe(false); expect(e.attend(0, 0)).toBe(false);
    run(e, 0.5); expect(Math.abs(eyesY(e))).toBeLessThan(0.1);
  });
});

describe("with reactions off (character.reacts)", () => {
  test("no lift, no dip, no lean and no look at the box; each state's own look stays (the circle, the splash)", () => {
    const e = engine("lively"); e.reacts = false;
    e.applyApp("needsYou"); expect(span(e, 2).hi).toBeLessThan(0.01);
    e.applyApp("error"); expect(span(e, 1).lo).toBeGreaterThan(-0.01);
    e.applyApp("idle"); e.leanToward(300, 0); run(e, 3); expect(Math.abs(e.body.pose.x)).toBeLessThan(0.005); expect(Math.abs(e.body.pose.lean)).toBeLessThan(0.005);
    expect(e.attend(0, 200)).toBe(false);
    e.applyApp("working"); run(e, 1); expect(e.followers.settled).toBe(false);
    e.applyApp("done"); run(e, 0.1); expect(e.followers.celebrating).toBe(true);
  });
});

describe("still frames", () => {
  test("with less motion a still frame shows none of it: upright, in the middle, eyes ahead", () => {
    const e = engine("lively");
    e.leanToward(300, 0); e.applyApp("needsYou");
    for (let i = 0; i < 20; i++) { e.attend(0, 200); run(e, 0.05); }
    run(e, 2);
    const s: Snapshot = e.still(false);
    expect(s.pose.x).toBe(0); expect(s.pose.y).toBe(0); expect(s.pose.lean).toBe(0);
    expect(Math.abs(s.eyes.lx)).toBeLessThan(0.05); expect(Math.abs(s.eyes.ly)).toBeLessThan(0.05);
  });
  test("otherwise (resting, a resize) a still frame keeps where it rests: the lift and the lean", () => {
    const e = engine();
    e.leanToward(300, 0); e.applyApp("needsYou"); run(e, 3);
    const s = e.still(true);
    expect(s.pose.x).toBeCloseTo(LEAN_SHIFT, 3); expect(s.pose.y).toBeCloseTo(LIFT, 3); expect(s.pose.lean).toBeCloseTo(LEAN_TILT, 3);
    expect(e.body.settled).toBe(true);
  });
  test("the same run twice gives the same character (no hidden randomness)", () => {
    const go = () => { const e = new FlowflowEngine({}, 5); e.mode = "lively"; e.leanToward(200, 80); run(e, 1); e.applyApp("needsYou"); run(e, 1); e.applyApp("error"); run(e, 1); return JSON.stringify([e.body.pose.x, e.body.pose.y, e.body.pose.lean, e.face.eyes.lx, e.followers.x[0]]); };
    expect(go()).toBe(go());
  });
});

// The frame loop, on a stand in page (as controller.test.ts).
const FRAME = 1000 / 60;
let now = 0;
let rafs = new Map<number, (t: number) => void>();
let timers = new Map<number, { at: number; fn: () => void }>();
let ids = 0;
const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
const KEYS = ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "window", "document", "performance", "ResizeObserver", "IntersectionObserver"];
beforeEach(() => {
  for (const k of KEYS) saved[k] = g[k];
  now = 1000; rafs = new Map(); timers = new Map();
  g.requestAnimationFrame = (f: (t: number) => void) => { const id = ++ids; rafs.set(id, f); return id; };
  g.cancelAnimationFrame = (id: number) => { rafs.delete(id); };
  g.setTimeout = (fn: () => void, ms = 0) => { const id = ++ids; timers.set(id, { at: now + ms, fn }); return id; };
  g.clearTimeout = (id: number) => { timers.delete(id); };
  g.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 2, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }) };
  g.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  g.ResizeObserver = undefined; g.IntersectionObserver = undefined;
  Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true, writable: true });
});
afterEach(() => {
  for (const k of KEYS) { if (k === "performance") Object.defineProperty(globalThis, "performance", { value: saved[k], configurable: true, writable: true }); else g[k] = saved[k]; }
});
function step(ms: number): void {
  const end = now + ms;
  while (now < end) {
    now = Math.min(end, now + FRAME);
    for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
    const due = [...rafs.values()]; rafs.clear();
    for (const f of due) f(now);
  }
}
const pending = () => rafs.size + timers.size;
type Stub = RendererLike & { renders: number; at: number[]; last: Snapshot | null };
function make(o: { reduced?: boolean; mode?: "still" | "gentle" | "lively" } = {}) {
  const r: Stub = {
    halfW: 1.6, halfH: 1.1, renders: 0, at: [], last: null,
    render(s: Snapshot) { r.renders++; r.at.push(now); r.last = s; },
    setSize() {}, toWorld: (x: number, y: number) => ({ x: x / 50 - 1.6, y: 1.1 - y / 50 }), setColours() {}, setMode() {}, dispose() {},
  };
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 160 }), addEventListener() {}, removeEventListener() {} };
  const c = FlowflowController.create({ canvas: el as unknown as HTMLCanvasElement, host: el as unknown as HTMLElement, reduced: o.reduced, renderer: r })!;
  if (o.mode) c.setLiveliness(o.mode);
  c.setState("idle");
  return { c, r };
}
const park = () => step(NO_NEWS_MS + 4 * FRAME);
const rendersIn = (r: Stub, ms: number) => { const n = r.renders; step(ms); return r.renders - n; };

describe("Still, the usual: it reacts only to news, then parks again with nothing moving", () => {
  test("changes arriving are news: it wakes, leans, and parks again holding the lean; nothing is drawn after", () => {
    const { c, r } = make({ mode: "still" });
    park(); expect(pending()).toBe(0);
    c.leanToward({ dx: 300, dy: 0 });
    expect(pending()).toBeGreaterThan(0);
    step(5000);
    expect(pending()).toBe(0);
    expect(r.last!.pose.x).toBeCloseTo(LEAN_SHIFT, 2);
    expect(rendersIn(r, 30_000)).toBe(0);
    c.dispose();
  });
  test("typing in the ask box is not news: nothing is scheduled or drawn, and the eyes stay ahead", () => {
    const { c, r } = make({ mode: "still" });
    park();
    const eyes = { ...c.engine.face.eyes }, drawn = r.renders;
    for (let i = 0; i < 10; i++) { c.attend(0, 200); step(50); }
    expect(pending()).toBe(0);
    expect(r.renders).toBe(drawn);
    expect(c.engine.face.eyes).toEqual(eyes);
    c.dispose();
  });
  test("needs you lifts and parks lifted; a failure dips and parks back at rest", () => {
    const { c, r } = make({ mode: "still" });
    c.setState("needsYou"); step(9000);
    expect(pending()).toBe(0); expect(r.last!.pose.y).toBeCloseTo(LIFT, 2);
    c.setState("error"); step(9000);
    expect(pending()).toBe(0); expect(Math.abs(r.last!.pose.y)).toBeLessThan(0.005);
    c.dispose();
  });
  test("a resize while parked keeps the lean in the frame it draws", () => {
    const { c, r } = make({ mode: "still" });
    c.leanToward({ dx: 300, dy: 0 }); step(6000); expect(pending()).toBe(0);
    (c as unknown as { measure(): void }).measure();
    expect(r.last!.pose.x).toBeCloseTo(LEAN_SHIFT, 2);
    expect(pending()).toBe(0);
    c.dispose();
  });
});

describe("Gentle: a reaction is drawn at full rate for a moment, then it goes back to its cap", () => {
  test("a lean, and a look at the ask box", () => {
    for (const act of [(c: FlowflowController) => c.leanToward({ dx: 300, dy: 0 }), (c: FlowflowController) => c.attend(0, 200)]) {
      const { c, r } = make({ mode: "gentle" });
      step(4000);
      expect(rendersIn(r, 1000)).toBeLessThanOrEqual(13);   // its cap, about 12 a second
      act(c);
      expect(rendersIn(r, 500)).toBeGreaterThan(20);
      step(QUICK_MS + 3000);
      expect(rendersIn(r, 1000)).toBeLessThanOrEqual(13);
      const gaps = r.at.slice(-10).map((t, i, a) => (i ? t - a[i - 1] : GENTLE_INTERVAL * 1000));
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(GENTLE_INTERVAL * 1000 - 4);
      c.dispose();
    }
  });
});

describe("Lively keeps today's rule", () => {
  test("every refresh, with or without a reaction", () => {
    const { c } = make({ mode: "lively" });
    const interval = () => (c as unknown as { interval(): number }).interval();
    c.leanToward({ dx: 300, dy: 0 }); expect(interval()).toBe(0);
    c.attend(0, 200); expect(interval()).toBe(0);
    step(20_000); expect(interval()).toBe(0);
    c.dispose();
  });
});

describe("Less motion and the Mac's Reduce motion beat every reaction", () => {
  test("no frame is ever scheduled, and the still frames show no lift, lean or look", () => {
    for (const mode of ["still", "gentle", "lively"] as const) {
      const { c, r } = make({ reduced: true, mode });
      c.leanToward({ dx: 300, dy: 0 }); c.attend(0, 200); c.setState("needsYou"); c.setState("error"); c.setState("needsYou");
      step(5000);
      expect(pending(), mode).toBe(0);
      expect(r.last!.pose.x, mode).toBe(0); expect(r.last!.pose.y, mode).toBe(0); expect(r.last!.pose.lean, mode).toBe(0);
      expect(Math.abs(r.last!.eyes.ly), mode).toBeLessThan(0.05);
      c.dispose();
    }
  });
  test("turning reduced motion on while it leans puts it upright at once", () => {
    const { c, r } = make({ mode: "lively" });
    c.leanToward({ dx: 300, dy: 0 }); c.setState("needsYou"); step(3000);
    expect(r.last!.pose.y).toBeGreaterThan(LIFT * 0.5);
    c.setReduced(true);
    expect(r.last!.pose.x).toBe(0); expect(r.last!.pose.y).toBe(0);
    expect(pending()).toBe(0);
    c.dispose();
  });
});

describe("the switch (character.reacts)", () => {
  test("off: a lean changes nothing and wakes nothing; on again: it leans", () => {
    const { c, r } = make({ mode: "still" });
    c.setReacts(false); park();
    c.leanToward({ dx: 300, dy: 0 });
    step(5000);
    expect(Math.abs(r.last!.pose.x)).toBeLessThan(0.005);
    c.setReacts(true); step(5000);
    expect(r.last!.pose.x).toBeCloseTo(LEAN_SHIFT, 2);
    expect(pending()).toBe(0);
    c.dispose();
  });
});
