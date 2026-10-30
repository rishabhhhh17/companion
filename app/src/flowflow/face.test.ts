// The eyes: independent of the body, deterministic, and never jittery.
import { describe, expect, test } from "bun:test";
import { Face, rng } from "./face.ts";

const look = { eyeOpen: 1, gazeGain: 1 };
const run = (f: Face, s: number, hasTarget = true, l = look) => { for (let t = 0; t < s; t += 1 / 60) f.update(1 / 60, l, hasTarget); };

describe("eyes follow a target by themselves", () => {
  test("both eyes turn toward the target, and each trails a little differently", () => {
    const f = new Face(); f.setTarget(0.8, -0.4); run(f, 0.08);
    expect(f.eyes.lx).toBeGreaterThan(0.05); expect(f.eyes.ly).toBeLessThan(-0.02);
    expect(f.eyes.lx).not.toBeCloseTo(f.eyes.rx, 6);
    run(f, 2); expect(f.eyes.lx).toBeCloseTo(0.8, 1); expect(f.eyes.rx).toBeCloseTo(0.8, 1); expect(f.eyes.ly).toBeCloseTo(-0.4, 1);
  });
  test("a nonsense target is ignored and a far one is kept in range", () => {
    const f = new Face(); f.setTarget(NaN, 99); run(f, 3); expect(Number.isFinite(f.eyes.lx)).toBe(true); expect(f.eyes.ly).toBeLessThanOrEqual(1.01);
  });
  test("less gaze gain looks less far; none stares ahead", () => {
    const a = new Face(), b = new Face(); a.setTarget(1, 0); b.setTarget(1, 0); run(a, 2, true, { eyeOpen: 1, gazeGain: 0.3 }); run(b, 2, true, { eyeOpen: 1, gazeGain: 0 });
    expect(a.eyes.lx).toBeCloseTo(0.3, 1); expect(Math.abs(b.eyes.lx)).toBeLessThan(0.06);
  });
  test("the eyes do not depend on any body motion: they take no body at all", () => {
    expect(Face.prototype.update.length).toBeLessThanOrEqual(3);
  });
});

describe("blinking and glances come from a schedule, never from chance", () => {
  test("the same seed gives the same blinks, a different seed a different schedule", () => {
    const trace = (seed: number) => { const f = new Face(seed); const out: number[] = []; for (let i = 0; i < 60 * 12; i++) { f.update(1 / 60, look, false); out.push(f.eyes.open < 0.5 ? 1 : 0); } return out.join(""); };
    expect(trace(3)).toBe(trace(3)); expect(trace(3)).not.toBe(trace(99));
  });
  test("it blinks every few seconds, and a blink is short and smooth", () => {
    const f = new Face(5); let blinks = 0, was = false, minOpen = 1, maxStep = 0, prev = 1;
    for (let i = 0; i < 60 * 30; i++) { f.update(1 / 60, look, true); const low = f.eyes.open < 0.4; if (low && !was) blinks++; was = low; minOpen = Math.min(minOpen, f.eyes.open); maxStep = Math.max(maxStep, Math.abs(f.eyes.open - prev)); prev = f.eyes.open; }
    expect(blinks).toBeGreaterThanOrEqual(5); expect(blinks).toBeLessThanOrEqual(14); expect(minOpen).toBeLessThan(0.1); expect(maxStep).toBeLessThan(0.7);
  });
  test("sleeping keeps the eyes shut and awake keeps them open between blinks", () => {
    const f = new Face(); run(f, 5, false, { eyeOpen: 0, gazeGain: 0 }); expect(f.eyes.open).toBe(0);
    const g = new Face(); g.update(1 / 60, { eyeOpen: 1.12, gazeGain: 1 }, true); expect(g.eyes.open).toBeCloseTo(1.12, 2);
  });
  test("with nothing to look at it glances aside now and then, and comes back", () => {
    const f = new Face(2); let moved = 0; for (let i = 0; i < 60 * 40; i++) { f.update(1 / 60, look, false); if (Math.abs(f.eyes.lx) > 0.15) moved++; }
    expect(moved).toBeGreaterThan(20); run(f, 6, false); 
  });
  test("a time that is not real changes nothing", () => { const f = new Face(); const a = { ...f.eyes }; f.update(0, look, true); f.update(NaN, look, true); expect(f.eyes).toEqual(a); });
});

describe("the number generator", () => { test("is repeatable and stays inside 0 and 1", () => { const a = rng(1), b = rng(1); for (let i = 0; i < 100; i++) { const x = a(); expect(x).toBe(b()); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); } }); });

describe("M46: quiet eyes outside Lively", () => {
  test("with wander off it never glances aside by itself, and it says when a blink is under way", () => {
    const f = new Face(2); f.wander = false; let moved = 0;
    for (let i = 0; i < 60 * 40; i++) { f.update(1 / 60, look, false); if (Math.abs(f.eyes.lx) > 0.05) moved++; }
    expect(moved).toBe(0);
    const g = new Face(); expect(g.blinking).toBe(false); g.blinkNow(); expect(g.blinking).toBe(true); run(g, 0.3); expect(g.blinking).toBe(false);
  });
});
