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
