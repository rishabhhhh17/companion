// The soft body's rules, without a screen. Each test states a thing a person would see.
import { describe, expect, test } from "bun:test";
import { DEFAULT_TUNING, FIXED_STEP, MAX_FRAME, SoftBody, Spring, TUNING_LIMITS, clampTuning, frameDelta, keepInside, springFor } from "./physics.ts";

const run = (b: SoftBody, seconds: number, dt: number) => { let t = 0; while (t < seconds - 1e-9) { b.advance(dt); t += dt; } return b.pose; };

describe("time", () => {
  test("a frame is a real positive time, cut at a limit", () => {
    expect(frameDelta(1 / 60)).toBeCloseTo(1 / 60, 9);
    expect(frameDelta(10)).toBe(MAX_FRAME);
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) expect(frameDelta(bad), String(bad)).toBe(0);
  });
  test("a suspended frame moves the body no further than one long frame would", () => {
    const a = new SoftBody(), b = new SoftBody();
    a.setTarget(0.6, 0.2); b.setTarget(0.6, 0.2);
    a.advance(600); b.advance(MAX_FRAME);
    expect(a.pose.x).toBeCloseTo(b.pose.x, 9);
  });
  test("the same motion at 30, 60 and 144 frames a second", () => {
    const ends = [1 / 30, 1 / 60, 1 / 144].map((dt) => { const b = new SoftBody(); b.setTarget(0.7, -0.3); return { ...run(b, 1.5, dt) }; });
    for (const e of ends.slice(1)) {
      expect(Math.abs(e.x - ends[0].x)).toBeLessThan(0.02);
      expect(Math.abs(e.y - ends[0].y)).toBeLessThan(0.02);
      expect(Math.abs(e.stretch - ends[0].stretch)).toBeLessThan(0.03);
    }
  });
  test("a nonsense time changes nothing", () => {
    const b = new SoftBody(); b.setTarget(0.5, 0); b.advance(0.1);
    const x = b.pose.x;
    b.advance(NaN); b.advance(-3); b.advance(0);
    expect(b.pose.x).toBe(x);
  });
});

describe("springs", () => {
  test("a critically damped spring reaches its target without overshooting", () => {
    const { k, c } = springFor(2, 1), s = new Spring(k, c);
    let max = 0; for (let i = 0; i < 600; i++) { s.step(FIXED_STEP, 1); max = Math.max(max, s.x); }
    expect(max).toBeLessThan(1.001); expect(s.x).toBeCloseTo(1, 3);
  });
  test("an underdamped spring overshoots, then rings down and settles", () => {
    const { k, c } = springFor(3, 0.2), s = new Spring(k, c);
    let max = 0; for (let i = 0; i < 1200; i++) { s.step(FIXED_STEP, 1); max = Math.max(max, s.x); }
    expect(max).toBeGreaterThan(1.2); expect(Math.abs(s.x - 1)).toBeLessThan(0.005);
  });
});

describe("following with inertia", () => {
  test("it lags behind its target, stretches along the way it moves, and then settles", () => {
    const b = new SoftBody(); b.setTarget(0.7, 0);
    run(b, 0.12, 1 / 60);
    expect(b.pose.x).toBeGreaterThan(0.02); expect(b.pose.x).toBeLessThan(0.7);
    expect(b.pose.dirX).toBeGreaterThan(0.9);
    let peak = 0; for (let i = 0; i < 120; i++) { b.advance(1 / 60); peak = Math.max(peak, b.pose.stretch); }
    expect(peak).toBeGreaterThan(0.05);
    run(b, 8, 1 / 60);
    expect(b.pose.x).toBeCloseTo(0.7, 2); expect(b.pose.stretch).toBeLessThan(0.01); expect(b.settled).toBe(true);
  });
  test("stopping suddenly squashes and rebounds, then settles", () => {
    const b = new SoftBody(); b.setTarget(0.8, 0); run(b, 0.5, 1 / 60);
    b.setTarget(b.pose.x, 0);
    let min = 0, max = 0; for (let i = 0; i < 240; i++) { b.advance(1 / 60); min = Math.min(min, b.pose.squash); max = Math.max(max, b.pose.squash); }
    expect(Math.max(Math.abs(min), max)).toBeGreaterThan(0.01);
  });
  test("landing squashes down first, rebounds up, and settles", () => {
    const b = new SoftBody(); b.impulse("land", 1);
    let max = -1, min = 1; for (let i = 0; i < 300; i++) { b.advance(1 / 60); max = Math.max(max, b.pose.squash); min = Math.min(min, b.pose.squash); }
    expect(max).toBeGreaterThan(0.05); expect(min).toBeLessThan(-0.005);
    run(b, 6, 1 / 60); expect(Math.abs(b.pose.squash)).toBeLessThan(0.002);
  });
  test("a poke dents at the point touched and the dent dies away", () => {
    const b = new SoftBody(); b.impulse("poke", 1, 0.3, -0.2);
    run(b, 0.1, 1 / 60); expect(b.pose.contact).toBeGreaterThan(0.01);
    expect(b.pose.contactX).toBe(0.3); expect(b.pose.contactY).toBe(-0.2);
    run(b, 5, 1 / 60); expect(b.pose.contact).toBeLessThan(0.003);
  });
  test("breathing is a gentle, steady swing around zero", () => {
    const b = new SoftBody(); b.setBreath(0.03, 0.5);
    let min = 1, max = -1; for (let i = 0; i < 600; i++) { b.advance(1 / 60); min = Math.min(min, b.pose.breath); max = Math.max(max, b.pose.breath); }
    expect(max).toBeCloseTo(0.03, 2); expect(min).toBeCloseTo(-0.03, 2);
  });
});

describe("the frame", () => {
  test("the whole body stays inside the frame, whatever the target", () => {
    const b = new SoftBody(); b.bounds = { halfW: 1, halfH: 0.9, r: 0.6 };
    for (const [x, y] of [[9, 9], [-9, -9], [0.2, 100], [Infinity, 0], [NaN, 1]]) b.setTarget(x, y);
    run(b, 5, 1 / 60);
    expect(Math.abs(b.pose.x)).toBeLessThanOrEqual(0.4 + 1e-6); expect(Math.abs(b.pose.y)).toBeLessThanOrEqual(0.3 + 1e-6);
  });
  test("keepInside never returns an outline past the edge, even when the body is bigger than the frame", () => {
    expect(keepInside(5, 5, 1, 1, 0.5)).toEqual({ x: 0.5, y: 0.5 });
    expect(keepInside(-5, 0, 1, 1, 2)).toEqual({ x: 0, y: 0 });
  });
});

describe("the dials", () => {
  test("every dial is kept inside its limits, and nonsense falls back to the usual value", () => {
    const t = clampTuning({ stiffness: 99, damping: -4, speed: NaN, ripple: 7, clarity: 2 });
    expect(t.stiffness).toBe(TUNING_LIMITS.stiffness[1]); expect(t.damping).toBe(TUNING_LIMITS.damping[0]);
    expect(t.speed).toBe(DEFAULT_TUNING.speed); expect(t.ripple).toBe(TUNING_LIMITS.ripple[1]); expect(t.clarity).toBe(1);
  });
  test("stiffer swings faster, more damping settles sooner", () => {
    const settle = (tuning: Partial<typeof DEFAULT_TUNING>) => { const b = new SoftBody(tuning); b.setTarget(0.6, 0); let t = 0; while (t < 30 && !(Math.abs(b.pose.x - 0.6) < 0.01 && b.pose.speed < 0.02 && t > 0.1)) { b.advance(1 / 60); t += 1 / 60; } return t; };
    expect(settle({ stiffness: 2 })).toBeLessThan(settle({ stiffness: 0.5 }));
    const wobble = (damping: number) => { const b = new SoftBody({ damping }); b.impulse("burst", 1); let e = 0; for (let i = 0; i < 300; i++) { b.advance(1 / 60); e += Math.abs(b.pose.wobble2) + Math.abs(b.pose.wobble3); } return e; };
    expect(wobble(2.5)).toBeLessThan(wobble(0.4));
  });
  test("the body stays finite and settles at the most extreme dials", () => {
    for (const stiffness of [0.2, 3]) for (const damping of [0.2, 3]) for (const speed of [0.3, 2.5]) {
      const b = new SoftBody({ stiffness, damping, speed }); b.setTarget(0.9, 0.5); b.impulse("burst", 2); b.impulse("land", 2); b.impulse("poke", 2, 0.5, 0.5);
      run(b, 120, 1 / 30);
      for (const v of Object.values(b.pose)) expect(Number.isFinite(v)).toBe(true);
      expect(b.settled, JSON.stringify({ stiffness, damping, speed })).toBe(true);
    }
  });
});
