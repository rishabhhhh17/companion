// Droplets and ripples: capped, arcing, merging back, and never growing.
import { describe, expect, test } from "bun:test";
import { Droplets, MAX_DROPLETS, MAX_RIPPLES, Ripples } from "./particles.ts";

describe("droplets", () => {
  test("a drop leaves, arcs up and over under gravity, comes back to the body and is gone", () => {
    const d = new Droplets(); d.emit(0, 0.5, 0.2, 1.2, 0.06);
    let top = 0, outward = 0; for (let t = 0; t < 0.6; t += 1 / 60) { d.update(1 / 60, 0, 0); top = Math.max(top, d.y[0]); outward = Math.max(outward, d.x[0]); }
    expect(top).toBeGreaterThan(0.7); expect(outward).toBeGreaterThan(0.05);
    for (let t = 0; t < 2; t += 1 / 60) d.update(1 / 60, 0, 0);
    expect(d.alive).toBe(0); expect(d.size[0]).toBe(0);
  });
  test("near the end of its life a drop is pulled toward the body and shrinks into it", () => {
    const d = new Droplets(); d.emit(0.9, 0.3, 0, 0, 0.06);
    let start = 0; for (let t = 0; t < 0.45; t += 1 / 60) d.update(1 / 60, 0, 0); start = Math.abs(d.x[0]);
    let nearEnd = start, shrunk = 1; for (let t = 0; t < 0.6; t += 1 / 60) { d.update(1 / 60, 0, 0); if (d.alive) { nearEnd = Math.abs(d.x[0]); shrunk = d.size[0] / 0.06; } }
    expect(nearEnd).toBeLessThan(start); expect(shrunk).toBeLessThan(0.7);
  });
  test("there are never more than the cap, and new drops reuse the oldest", () => {
    const d = new Droplets(); for (let i = 0; i < MAX_DROPLETS * 5; i++) d.emit(i * 0.01, 0, 0, 1);
    expect(d.alive).toBeLessThanOrEqual(MAX_DROPLETS); expect(d.x.length).toBe(MAX_DROPLETS);
  });
  test("a bad time changes nothing", () => { const d = new Droplets(); d.emit(0, 0, 1, 1); const y = d.y[0]; d.update(NaN, 0, 0); d.update(-1, 0, 0); d.update(0, 0, 0); expect(d.y[0]).toBe(y); });
});

describe("ripples", () => {
  test("a ripple spreads, weakens and dies; the shader gets four numbers each", () => {
    const r = new Ripples(), out = new Float32Array(MAX_RIPPLES * 4); r.add(0.2, -0.1, 1); r.fill(out);
    expect(out[0]).toBeCloseTo(0.2); expect(out[1]).toBeCloseTo(-0.1); expect(out[3]).toBeGreaterThan(0.9);
    r.update(1); r.fill(out); expect(out[2]).toBeCloseTo(1); expect(out[3]).toBeLessThan(0.7); expect(out[3]).toBeGreaterThan(0);
    r.update(5); r.fill(out); expect(out[3]).toBe(0); expect(r.alive).toBe(0);
  });
  test("only a few at once: the oldest is replaced, never a fifth", () => {
    const r = new Ripples(); for (let i = 0; i < 12; i++) r.add(i * 0.1, 0, 1); expect(r.alive).toBeLessThanOrEqual(MAX_RIPPLES);
  });
  test("a ripple of no strength is not made", () => { const r = new Ripples(); r.add(0, 0, 0); r.add(0, 0, NaN); r.add(0, 0, -1); expect(r.alive).toBe(0); });
});

// M60 (2 Nov 2026, the orb with Fizz's trailing bubbles): two small bubbles follow Flowflow. They trail in a gentle arc,
// never a straight line (a straight line reads as a thought bubble), and each state moves them its own way.
import { FOLLOWER_RADII, Followers, ORBIT_SECONDS, type FollowerFrame } from "./particles.ts";

const ORB = 0.656;
const frame = (o: Partial<FollowerFrame> = {}): FollowerFrame => ({ mood: "rest", orb: ORB, cx: 0, cy: 0, tx: -0.848, ty: -0.53, ux: 0, uy: -1, bob: false, time: 0, minX: -1.3, maxX: 1.3, minY: -1.2, maxY: 1.0, ...o });
const go = (f: Followers, fr: FollowerFrame, s: number, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) { fr.time += dt; f.update(dt, fr); } };
const deg = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;
const dist = (f: Followers, i: number, cx = 0, cy = 0) => Math.hypot(f.x[i] - cx, f.y[i] - cy);

describe("the two follower bubbles (M60)", () => {
  test("at rest they trail below and behind the orb in a gentle arc, never a straight line, small and clear of the orb", () => {
    const f = new Followers(), fr = frame(); f.place(fr); go(f, fr, 3);
    expect(FOLLOWER_RADII[0]).toBeLessThan(ORB * 0.35); expect(FOLLOWER_RADII[1]).toBeLessThan(FOLLOWER_RADII[0]);
    expect(f.r[0]).toBeCloseTo(FOLLOWER_RADII[0], 3); expect(f.r[1]).toBeCloseTo(FOLLOWER_RADII[1], 3);
    expect(f.y[0]).toBeLessThan(-ORB * 0.6); expect(f.x[0]).toBeLessThan(0);   // below, and to the side behind it
    expect(f.y[1]).toBeLessThan(f.y[0]); expect(f.x[1]).toBeLessThan(0);      // the second further round, toward the bottom
    expect(dist(f, 1)).toBeGreaterThan(dist(f, 0));                            // and a little further out: a trailing arc
    expect(dist(f, 0)).toBeGreaterThanOrEqual(ORB + f.r[0] - 1e-6);            // clear of the orb, not melted into it
    const a = deg(f.x[0], f.y[0]), b = deg(f.x[1] - f.x[0], f.y[1] - f.y[0]);
    expect(Math.abs(a - b)).toBeGreaterThan(15);                                // the chain bends: no thought bubble
  });
  test("working: they orbit slowly, passing behind the orb (hidden by it) and in front of it", () => {
    const f = new Followers(), fr = frame(); f.place(fr); go(f, fr, 1);
    fr.mood = "orbit";
    let behind = 0, front = 0, minA = Infinity, maxA = -Infinity;
    for (let t = 0; t < ORBIT_SECONDS; t += 1 / 60) { fr.time += 1 / 60; f.update(1 / 60, fr); if (f.z[0] < -0.3) behind++; if (f.z[0] > 0.3) front++; minA = Math.min(minA, f.x[0]); maxA = Math.max(maxA, f.x[0]); }
    expect(ORBIT_SECONDS).toBeGreaterThanOrEqual(6); expect(ORBIT_SECONDS).toBeLessThanOrEqual(14);   // slow: one turn in several seconds
    expect(behind).toBeGreaterThan(30); expect(front).toBeGreaterThan(30); expect(maxA - minA).toBeGreaterThan(ORB * 1.5);
    expect(f.settled).toBe(false);
  });
  test("done: they rise, pop, and then form again where they rest", () => {
    const f = new Followers(), fr = frame(); f.place(fr); go(f, fr, 1);
    const restY = f.y[0];
    f.celebrate();
    let top = -Infinity, gone = false;
    for (let t = 0; t < 1.6; t += 1 / 60) { fr.time += 1 / 60; f.update(1 / 60, fr); top = Math.max(top, f.y[0]); if (f.r[0] === 0 && f.r[1] === 0) gone = true; }
    expect(top).toBeGreaterThan(restY + ORB); expect(gone).toBe(true);
    go(f, fr, 2.5);
    expect(f.r[0]).toBeCloseTo(FOLLOWER_RADII[0], 2); expect(f.y[0]).toBeCloseTo(restY, 2); expect(f.settled).toBe(true);
  });
  test("failed: they sink a little and stay whole", () => {
    const f = new Followers(), fr = frame(); f.place(fr); go(f, fr, 2); const y0 = f.y[0], y1 = f.y[1];
    fr.mood = "sink"; go(f, fr, 3);
    expect(f.y[0]).toBeLessThan(y0 - 0.05); expect(f.y[0]).toBeGreaterThan(y0 - 0.3); expect(f.y[1]).toBeLessThan(y1 - 0.05);
    expect(f.r[0]).toBeCloseTo(FOLLOWER_RADII[0], 3); expect(f.settled).toBe(true);
  });
  test("listening: they gather close to the orb", () => {
    const f = new Followers(), fr = frame(); f.place(fr); go(f, fr, 2); const d0 = dist(f, 0), d1 = dist(f, 1);
    fr.mood = "gather"; go(f, fr, 3);
    expect(dist(f, 0)).toBeLessThan(d0 - 0.05); expect(dist(f, 1)).toBeLessThan(d1 - 0.1);
  });
  test("at rest without bob (Still, Gentle) they hold perfectly still; with bob (Lively) they drift a little", () => {
    const f = new Followers(), fr = frame(); f.place(fr); go(f, fr, 3);
    expect(f.settled).toBe(true);
    const x = f.x[0], y = f.y[0]; go(f, fr, 10); expect(f.x[0]).toBe(x); expect(f.y[0]).toBe(y);
    fr.bob = true; let moved = 0; for (let t = 0; t < 4; t += 1 / 60) { fr.time += 1 / 60; f.update(1 / 60, fr); moved = Math.max(moved, Math.hypot(f.x[0] - x, f.y[0] - y)); }
    expect(moved).toBeGreaterThan(0.005); expect(moved).toBeLessThan(0.06); expect(f.settled).toBe(false);
  });
  test("they follow the orb with a lag when it moves, and stay inside their bounds", () => {
    const f = new Followers(), fr = frame(); f.place(fr); go(f, fr, 1);
    fr.cx = 0.5; fr.tx = -1; fr.ty = 0; fr.time += 1 / 60; f.update(1 / 60, fr);
    expect(f.x[0]).toBeLessThan(0.5 - ORB);          // still behind it, catching up
    go(f, fr, 3); expect(f.x[0]).toBeLessThan(fr.cx - ORB); expect(f.x[1]).toBeLessThan(fr.cx); expect(f.y[1]).toBeLessThan(f.y[0]);
    const g = new Followers(), gr = frame({ minY: -0.7 }); g.place(gr); go(g, gr, 2);
    for (let i = 0; i < 2; i++) expect(g.y[i] - g.r[i]).toBeGreaterThanOrEqual(-0.7 - 1e-6);   // never past a floor (Home's water)
  });
  test("a time that is not real changes nothing, and the same run gives the same bubbles", () => {
    const f = new Followers(), fr = frame(); f.place(fr); const x = f.x[0]; f.update(NaN, fr); f.update(-1, fr); f.update(0, fr); expect(f.x[0]).toBe(x);
    const run = () => { const h = new Followers(), hr = frame({ mood: "orbit" }); h.place(hr); go(h, hr, 2.5); return [h.x[0], h.y[1], h.z[0]].join(); };
    expect(run()).toBe(run());
  });
});
