// M83 Part D: every trip flies along a curve, like Clicky's cursor (the founder, 12 Nov 2026). The path is the shell's own
// (roam.rs arc_at: a quadratic curve through a point lifted above the middle, eased by roam::ease), so the window and the
// body agree; the body stretches and leans along the way it flies, grows a little at mid flight and lands with a soft
// squash that settles. Reduce motion flies nothing: a plain fade.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FLIGHT, bendOf, bodyAt, flightAt, flightEase, flightFrom, flightPlan, flightPoint, landAt, type Flight } from "./flight.ts";
import { settle } from "./water.ts";

const F: Flight = { dx: 800, dy: 200, ms: 600, up: true };
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the path", () => {
  test("is curved: half way it is lifted off the straight line, upward, by the shell's bend", () => {
    const mid = flightPoint(F, 0.5);
    const onLine = { x: F.dx / 2, y: F.dy / 2 };
    expect(mid.x).toBeCloseTo(onLine.x, 6);
    // A quadratic curve at its middle is half way to its control point: lifted by half the bend (y down, so smaller).
    expect(mid.y).toBeCloseTo(onLine.y - bendOf(Math.hypot(F.dx, F.dy)) / 2, 6);
    expect(onLine.y - mid.y).toBeGreaterThan(30);
    // Every point between the ends is off the line (the line's distance is more than a hair).
    for (const e of [0.2, 0.4, 0.6, 0.8]) {
      const p = flightPoint(F, e), cross = Math.abs(F.dx * p.y - F.dy * p.x) / Math.hypot(F.dx, F.dy);
      expect(cross, String(e)).toBeGreaterThan(5);
    }
    // Near the top of the screens it bends down instead (roam::bends_up), never into the menu bar.
    expect(flightPoint({ ...F, up: false }, 0.5).y).toBeGreaterThan(F.dy / 2);
  });
  test("starts where it was and ends exactly at the target", () => {
    expect(flightPoint(F, 0)).toEqual({ x: 0, y: 0 });
    expect(flightPoint(F, 1)).toEqual({ x: F.dx, y: F.dy });
    const end = flightAt(F, F.ms);
    expect(end.done).toBe(true); expect(end.x).toBe(F.dx); expect(end.y).toBe(F.dy);
    expect(flightAt(F, F.ms * 5)).toMatchObject({ x: F.dx, y: F.dy, done: true });
    expect(flightAt(F, F.ms - 1).done).toBe(false);
  });
  test("is eased like the shell's trip (roam::ease), so the window and the body agree", () => {
    expect(flightEase(0)).toBe(0); expect(flightEase(1)).toBe(1); expect(flightEase(0.5)).toBeCloseTo(0.5, 9);
    expect(flightEase(0.25)).toBeCloseTo(0.125, 9);
    const rs = read("../src-tauri/src/roam.rs");
    expect(rs).toContain("fn bend(distance: f64) -> f64 { (distance / 4.0).min(80.0) }");
    expect(rs).toContain("pub fn ease(t: f64) -> f64 { let t = t.clamp(0.0, 1.0); if t < 0.5 { 2.0 * t * t } else { 1.0 - (-2.0 * t + 2.0).powi(2) / 2.0 } }");
  });
});

describe("the body along the way", () => {
  test("the lean follows the direction of travel", () => {
    const right = bodyAt(F, F.ms / 2), left = bodyAt({ ...F, dx: -F.dx }, F.ms / 2);
    expect(right.lean).toBeGreaterThan(0); expect(left.lean).toBeLessThan(0);
    expect(right.lean).toBeCloseTo(-left.lean, 9);
    expect(Math.abs(right.lean)).toBeLessThanOrEqual(FLIGHT.leanDeg);
    // Early on it rises (the curve goes up first): the velocity points up (y down, so negative).
    const level: Flight = { ...F, dy: 0 };
    expect(flightAt(level, F.ms * 0.15).vy).toBeLessThan(0);
    expect(flightAt(level, F.ms * 0.85).vy).toBeGreaterThan(0);
  });
  test("it stretches along the way it flies (wider going across, taller going up and down), keeping its size", () => {
    const across = bodyAt({ dx: 900, dy: 0, ms: 600, up: true }, 300);
    expect(across.sx).toBeGreaterThan(across.sy);
    const down = bodyAt({ dx: 0, dy: 900, ms: 600, up: true }, 300);
    expect(down.sy).toBeGreaterThan(down.sx);
    // Never more than a gentle stretch: it is the whole character, not a loose drop.
    for (let ms = 0; ms <= 600; ms += 20) { const b = bodyAt({ dx: 3000, dy: 0, ms: 600, up: true }, ms); expect(b.sx / b.grow).toBeLessThanOrEqual(1 + FLIGHT.stretchMax + 1e-9); }
  });
  test("it grows a little at mid flight, and is its own size at both ends", () => {
    const g = (ms: number) => bodyAt(F, ms).grow;
    expect(g(0)).toBeCloseTo(1, 9); expect(g(F.ms)).toBeCloseTo(1, 9);
    expect(g(F.ms / 2)).toBeCloseTo(1 + FLIGHT.grow, 9);
    expect(FLIGHT.grow).toBeLessThanOrEqual(0.1);
  });
  test("it lands with a soft squash that settles back to its own shape", () => {
    const first = landAt(0);
    expect(first.sy).toBeLessThan(1); expect(first.sx).toBeGreaterThan(1);
    const last = landAt(FLIGHT.landMs);
    expect(last.sx).toBe(1); expect(last.sy).toBe(1); expect(last.done).toBe(true);
    // The settle is the water's own spring (water.ts settle).
    const mid = landAt(FLIGHT.landMs / 2);
    expect(mid.sy).toBeCloseTo(1 - FLIGHT.squash * (1 - settle(0.5)), 9);
  });
});

describe("reduce motion", () => {
  test("skips the arc: a plain fade", () => {
    expect(flightPlan(true)).toBe("fade");
    expect(flightPlan(false)).toBe("arc");
    // The shell's own steps: with reduced motion a fade, then it is simply there, no travel.
    const rs = read("../src-tauri/src/roam.rs");
    expect(rs).toContain("(true, true) => vec![(Phase::Fade, FADE_MS), (Phase::Visiting, 0)],");
    expect(rs).toContain("(false, true) => vec![(Phase::Fade, FADE_MS), (Phase::Home, 0)],");
  });
});

describe("what the shell says", () => {
  test("a trip's facts are read safely: anything odd is no flight", () => {
    expect(flightFrom({ phase: "travel", ms: 600, dx: 800, dy: 200, up: true })).toEqual(F);
    expect(flightFrom({ phase: "travel", ms: "x", dx: 1, dy: 1 })).toBeNull();
    expect(flightFrom({ phase: "travel", ms: 600, dx: NaN, dy: 1 })).toBeNull();
    expect(flightFrom({ phase: "home" })).toBeNull();
    expect(flightFrom(null)).toBeNull();
  });
  test("the shell sends the trip's way, time and bend with each flying state, and settings changes fly too", () => {
    const sh = read("../src-tauri/src/shell_roam.rs");
    expect(sh).toContain('"ms": ms, "dx": to[0] - from[0], "dy": to[1] - from[1], "up": up');
    expect(read("../src-tauri/src/shell_dock.rs")).toContain("fly_home(");
    expect(read("./dock.tsx")).toContain("useFlight(");
  });
});
