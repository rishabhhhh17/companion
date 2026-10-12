// The hand drawn look is plain deterministic maths: the same picture every time, never far from the true shape, and
// never anything that could draw outside the diagram's own area.
import { describe, expect, test } from "bun:test";
import { sketchEllipse, sketchLine, sketchRect, rng } from "./sketch.ts";

const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe("a seeded random source", () => {
  test("the same seed gives the same numbers, another seed gives others, all between 0 and 1", () => {
    const a = rng("box:page"), b = rng("box:page"), c = rng("box:api");
    const xs = [a(), a(), a()], ys = [b(), b(), b()], zs = [c(), c(), c()];
    expect(xs).toEqual(ys); expect(xs).not.toEqual(zs);
    for (const v of [...xs, ...zs]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe("hand drawn shapes", () => {
  test("a line runs from where it should to where it should, a little wobbly, twice over", () => {
    const d = sketchLine(10, 20, 210, 20, "e1");
    expect(d.startsWith("M")).toBe(true); expect(d.split("M").length - 1).toBe(2);   // two passes, like a pen going over it
    const v = nums(d);
    for (let i = 0; i < v.length; i += 2) { expect(v[i]).toBeGreaterThanOrEqual(10 - 4); expect(v[i]).toBeLessThanOrEqual(210 + 4); expect(Math.abs(v[i + 1] - 20)).toBeLessThanOrEqual(5); }
    expect(sketchLine(10, 20, 210, 20, "e1")).toBe(d);
  });
  test("a box stays close to its true rectangle and is the same every time", () => {
    const d = sketchRect(100, 50, 160, 46, "page");
    const v = nums(d);
    for (let i = 0; i < v.length; i += 2) { expect(v[i]).toBeGreaterThanOrEqual(100 - 5); expect(v[i]).toBeLessThanOrEqual(260 + 5); expect(v[i + 1]).toBeGreaterThanOrEqual(50 - 5); expect(v[i + 1]).toBeLessThanOrEqual(96 + 5); }
    expect(sketchRect(100, 50, 160, 46, "page")).toBe(d); expect(sketchRect(100, 50, 160, 46, "api")).not.toBe(d);
  });
  test("a ring around something is bigger than it, and stays near that size", () => {
    const d = sketchEllipse(50, 50, 30, 20, "ring");
    const v = nums(d);
    for (let i = 0; i < v.length; i += 2) { expect(Math.abs(v[i] - 50)).toBeLessThanOrEqual(30 + 6); expect(Math.abs(v[i + 1] - 50)).toBeLessThanOrEqual(20 + 6); }
  });
  test("a tiny shape does not wobble more than it is big", () => {
    const d = sketchRect(0, 0, 8, 8, "tiny");
    for (const n of nums(d)) { expect(n).toBeGreaterThanOrEqual(-3); expect(n).toBeLessThanOrEqual(11); }
  });
});
