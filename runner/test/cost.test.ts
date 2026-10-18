// The checks that something stays fast (cost.ts) tell work that grows as it should from work that does not, and work that
// costs what it did from work many times dearer, without reading the clock on the wall.
import { describe, expect, test } from "bun:test";
import { costsAtMost, growsGently, noHang, reference } from "./cost.ts";

// Work that grows with the square of its input, n steps of n, and work that grows in step with it.
const quadratic = (n: number) => { let s = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s = (s + (i ^ j)) | 0; return s; };
const linear = (n: number) => { let s = 0; for (let i = 0; i < n * 64; i++) s = (s + (i ^ (s >>> 3))) | 0; return s; };

describe("staying fast, measured so that a busy Mac cannot fail it", () => {
  test("the growth check passes work that grows in step with its input", () => {
    expect(() => growsGently("a plain loop", 8, 20, () => linear(2_000), () => linear(16_000))).not.toThrow();
  });
  test("the growth check catches work that grows with the square of its input", () => {
    expect(() => growsGently("a loop inside a loop", 8, 20, () => quadratic(150), () => quadratic(1200))).toThrow(/every time/);
  });
  test("the cost check passes work that costs what it did", () => {
    expect(() => costsAtMost("four references", 10, () => { for (let i = 0; i < 4; i++) reference(); })).not.toThrow();
  });
  test("the cost check catches work many times dearer than it should be", () => {
    expect(() => costsAtMost("forty references", 10, () => { for (let i = 0; i < 40; i++) reference(); })).toThrow(/every time/);
  });
  test("a hang uses processor time and is caught; waiting, as on a busy Mac, does not count", () => {
    expect(() => noHang(() => quadratic(30_000), 50, "a long loop")).toThrow(/processor time/);
    const t = Date.now();
    noHang(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300), 50, "waiting");   // held up, using none
    expect(Date.now() - t).toBeGreaterThanOrEqual(250);
  });
});
