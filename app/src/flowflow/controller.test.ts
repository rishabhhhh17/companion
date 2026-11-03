// M46 (F28): the frame loop. Still, the usual, draws nothing at all once 3 seconds pass with no news; Gentle runs at its
// cap; Lively keeps today's rule. Run on a stand in page: a fake clock, fake animation frames and timers, and a renderer
// that only counts what it is asked to draw. Nothing here needs a GPU.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FlowflowController, GENTLE_INTERVAL, NO_NEWS_MS, PARK, WORK_INTERVAL, type RendererLike } from "./controller.ts";
import type { Snapshot } from "./engine.ts";

const FRAME = 1000 / 60;
let now = 0;
let rafs = new Map<number, (t: number) => void>();
let timers = new Map<number, { at: number; fn: () => void }>();
let ids = 0;
const winListeners = new Map<string, EventListener[]>();
const hostListeners = new Map<string, EventListener[]>();
const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
const KEYS = ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "window", "document", "performance", "ResizeObserver", "IntersectionObserver"];

beforeEach(() => {
  for (const k of KEYS) saved[k] = g[k];
  now = 1000; rafs = new Map(); timers = new Map(); winListeners.clear(); hostListeners.clear();
  const on = (m: Map<string, EventListener[]>) => (t: string, f: EventListener) => { m.set(t, [...(m.get(t) ?? []), f]); };
  g.requestAnimationFrame = (f: (t: number) => void) => { const id = ++ids; rafs.set(id, f); return id; };
  g.cancelAnimationFrame = (id: number) => { rafs.delete(id); };
  g.setTimeout = (fn: () => void, ms = 0) => { const id = ++ids; timers.set(id, { at: now + ms, fn }); return id; };
  g.clearTimeout = (id: number) => { timers.delete(id); };
  g.window = { addEventListener: on(winListeners), removeEventListener() {}, devicePixelRatio: 2, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }) };
  g.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  g.ResizeObserver = undefined; g.IntersectionObserver = undefined;
  Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true, writable: true });
});
afterEach(() => {
  for (const k of KEYS) { if (k === "performance") Object.defineProperty(globalThis, "performance", { value: saved[k], configurable: true, writable: true }); else g[k] = saved[k]; }
});

/** Moves the clock on at 60 a second, running the timers that are due and then the frames asked for, as a page would. */
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
  const el = (m: Map<string, EventListener[]> | null) => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 160 }), addEventListener: m ? (t: string, f: EventListener) => { m.set(t, [...(m.get(t) ?? []), f]); } : () => {}, removeEventListener() {} });
  const c = FlowflowController.create({ canvas: el(null) as unknown as HTMLCanvasElement, host: el(hostListeners) as unknown as HTMLElement, reduced: o.reduced, renderer: r })!;
  if (o.mode) c.setLiveliness(o.mode);
  c.setState("idle");   // as the page does, right after it starts
  return { c, r };
}
const touch = () => { for (const f of hostListeners.get("pointerdown") ?? []) f({ clientX: 80, clientY: 70 } as unknown as Event); };
const moveOver = () => { for (const f of winListeners.get("pointermove") ?? []) f({ clientX: 150, clientY: 20 } as unknown as Event); };
const settleToPark = (ms = NO_NEWS_MS + 4 * FRAME) => step(ms);

describe("Still, the usual: no frames after 3 s with no news (F04's idle budget)", () => {
  test("idle with no input parks: nothing scheduled, nothing drawn for a minute after", () => {
    const { c, r } = make();
    step(NO_NEWS_MS + 2 * FRAME);
    expect(pending()).toBe(0);
    const drawn = r.renders;
    expect(drawn).toBeGreaterThan(0);
    step(60_000);
    expect(r.renders).toBe(drawn);
    expect(pending()).toBe(0);
    // The parked frame is the clean drop: no sway, no float, no breath, eyes open.
    expect(r.last!.sway).toBe(0);
    expect(Math.abs(r.last!.float)).toBe(0);
    expect(Math.abs(r.last!.pose.breath)).toBe(0);
    expect(c.engine.face.blinking).toBe(false);
    expect(c.engine.body.settled).toBe(true);
    c.dispose();
  });
  test("each kind of news wakes it, and 3 s after the last news at rest it parks again", () => {
    const news: [string, (c: FlowflowController) => void, ((c: FlowflowController) => void)?][] = [
      ["working", (c) => c.setState("working"), (c) => c.setState("idle")],
      ["a touch", () => touch()],
      ["a press against the edge", (c) => c.press(0.6), (c) => c.press(0)],
      ["its window moving", (c) => c.push(400, 0), (c) => c.push(0, 0)],
      ["coming in from the edge", (c) => c.arrive(1)],
      ["a drop leaving to point", (c) => c.give(200, -40)],
      ["the drop coming home", (c) => c.catch()],
      ["listening", (c) => c.setState("listening"), (c) => c.setState("idle")],
      ["a new liveliness", (c) => c.setLiveliness("still")],
    ];
    for (const [name, act, after] of news) {
      const { c } = make();
      settleToPark();
      expect(pending(), `${name}: parked first`).toBe(0);
      act(c);
      expect(pending(), `${name}: woke`).toBeGreaterThan(0);
      step(500);
      after?.(c);
      step(12_000);
      expect(pending(), `${name}: parked again`).toBe(0);
      c.dispose();
    }
  });
  test("working draws at its own steady pace, never every refresh, and never parks", () => {
    const { c, r } = make();
    c.setState("working");
    step(1000);
    const from = r.at.length;
    step(10_000);
    const gaps = r.at.slice(from).map((t, i, a) => (i ? t - a[i - 1] : WORK_INTERVAL * 1000));
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(WORK_INTERVAL * 1000 - 4);
    expect(pending()).toBeGreaterThan(0);
    c.dispose();
  });
});

describe("the pointer is not news unless Lively", () => {
  test("Still: on a parked character, the pointer anywhere on the screen and a move over its window schedule nothing", () => {
    const { c, r } = make();
    settleToPark();
    const drawn = r.renders, eyes = { ...c.engine.face.eyes };
    c.gaze(300, -50);
    moveOver();
    expect(pending()).toBe(0);
    expect(r.renders).toBe(drawn);
    expect(c.engine.face.eyes).toEqual(eyes);
    c.dispose();
  });
  test("Gentle: the eyes stay ahead whatever the pointer does", () => {
    const { c } = make({ mode: "gentle" });
    step(500);
    for (let i = 0; i < 60; i++) { c.gaze(400, 0); moveOver(); step(FRAME); }
    expect(Math.abs((c.engine.face.eyes.lx + c.engine.face.eyes.rx) / 2)).toBeLessThan(0.02);
    c.dispose();
  });
  test("Lively: the eyes follow the pointer anywhere on the screen, as today", () => {
    const { c } = make({ mode: "lively" });
    for (let i = 0; i < 60; i++) { c.gaze(400, 0); step(FRAME); }
    expect(c.engine.face.eyes.lx).toBeGreaterThan(0.2);
    c.dispose();
  });
});

describe("Gentle: a slow sway at rest, at its cap", () => {
  test("it never parks at idle, every gap is at least the cap, and its sway is about 0.4", () => {
    const { c, r } = make({ mode: "gentle" });
    step(30_000);
    expect(pending()).toBeGreaterThan(0);
    const gaps = r.at.slice(5).map((t, i, a) => (i ? t - a[i - 1] : GENTLE_INTERVAL * 1000));
    expect(gaps.length).toBeGreaterThan(100);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(GENTLE_INTERVAL * 1000 - 4);
    expect(r.last!.sway).toBeCloseTo(0.4, 2);
    c.dispose();
  });
  test("a touch runs at full rate, then it goes back to its cap", () => {
    const { c, r } = make({ mode: "gentle" });
    step(3000);
    const before = r.renders;
    touch();
    step(300);
    expect(r.renders - before).toBeGreaterThan(12);
    step(5000);
    const n = r.renders; step(1000);
    expect(r.renders - n).toBeLessThanOrEqual(13);
    c.dispose();
  });
});

describe("Lively keeps today's rule", () => {
  test("every refresh while awake, a slower pace asleep", () => {
    const { c } = make({ mode: "lively" });
    const interval = () => (c as unknown as { interval(): number }).interval();
    expect(interval()).toBe(0);
    c.setState("working"); expect(interval()).toBe(0);
    c.setState("listening"); expect(interval()).toBe(0);
    c.setState("off"); expect(interval()).toBeCloseTo(1 / 15, 6);
    c.setState("idle"); step(20_000); expect(interval()).toBe(0);
    expect(pending()).toBeGreaterThan(0);
    c.dispose();
  });
});

describe("needs you, and an error", () => {
  test("needs you pulses three times, then holds steady and parks", () => {
    const { c } = make();
    c.setState("needsYou");
    step(3300);
    expect(c.engine.behavior.pulsesDone).toBe(false);
    expect(pending()).toBeGreaterThan(0);
    step(3300 + 4 * FRAME);
    expect(c.engine.behavior.pulsesDone).toBe(true);
    expect(pending()).toBe(0);
    c.dispose();
  });
  test("an error is held flat and dull: it parks once it has settled", () => {
    const { c } = make();
    c.setState("error");
    step(10_000);
    expect(pending()).toBe(0);
    expect(c.engine.body.settled).toBe(true);
    c.dispose();
  });
  test("M60: it never parks while its bubbles are still moving (sinking after a failure, forming again after done)", () => {
    const { c } = make();
    settleToPark();
    expect(pending()).toBe(0);
    c.engine.followers.celebrate();   // bubbles on their way, with no news and nothing else going on
    c.setColours("#6fe3ff", "#1d72d8");   // a nudge that is not news, so the loop looks again
    step(1000);
    expect(c.engine.followers.settled).toBe(false);
    expect(pending()).toBeGreaterThan(0);
    step(6_000);
    expect(c.engine.followers.settled).toBe(true);
    expect(pending()).toBe(0);
    c.dispose();
  });
});

describe("rest (a call, Low Power Mode, tucked away)", () => {
  test("resting stops the loop and draws one still frame; listening during rest keeps running", () => {
    const { c, r } = make({ mode: "lively" });
    step(1000);
    const before = r.renders;
    c.setResting(true);
    expect(r.renders).toBe(before + 1);
    expect(pending()).toBe(0);
    c.setState("listening");
    step(5000);
    expect(pending()).toBeGreaterThan(0);
    expect(r.renders).toBeGreaterThan(before + 100);
    c.setState("idle");
    expect(pending()).toBe(0);
    const n = r.renders; step(5000); expect(r.renders).toBe(n);
    c.setResting(false);
    expect(pending()).toBeGreaterThan(0);
    c.dispose();
  });
  test("needs you during rest is one still frame with the amber held, no pulses", () => {
    const { c, r } = make();
    c.setResting(true);
    c.setState("needsYou");
    expect(pending()).toBe(0);
    expect(r.last!.look.amber).toBe(1);
    expect(r.last!.pulse).toBe(0);
    c.dispose();
  });
});

describe("Less motion and the Mac's Reduce motion beat every choice", () => {
  test("reduced never schedules a frame, whatever the mode or the news", () => {
    for (const mode of ["still", "gentle", "lively"] as const) {
      const { c, r } = make({ reduced: true, mode });
      c.setState("working"); c.press(0.5); c.push(300, 0); c.gaze(100, 0); touch(); c.setLiveliness("lively");
      step(5000);
      expect(pending(), mode).toBe(0);
      expect(r.renders, mode).toBeGreaterThan(0);   // still pictures on each change
      c.dispose();
    }
  });
  test("PARK is no timer at all", () => { expect(PARK).toBeLessThan(0); });
});
