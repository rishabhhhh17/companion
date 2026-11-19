// The notch's springs (M66 Part 2): the table, and what each one may and may not do. island.rs holds the same numbers.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CHEER_SPRING, ISLAND_SPRING, NOTCH, NOTCH_TABLE, OPEN_H_DELAY_MS, PANEL_EXIT_MS, TUCK_MS, TUCK_SPRING, fromResponse, springFor, springStep, tuckHoldMs, type SpringK } from "./islandSpring.ts";
import { springLinear, springPath } from "./motionTokens.ts";

const rs = readFileSync(new URL("../src-tauri/src/island.rs", import.meta.url), "utf8");
/** The path springStep (the island's own drawing) takes from 0 to 1, every ms for `secs`: a 1000 point move, as a fraction
 *  (springStep calls a quarter point "there", which is a fraction only on a big move). */
function stepPath(s: SpringK, secs: number): number[] {
  const out = [0];
  let p = { x: 0, v: 0 };
  for (let i = 0; i < secs * 1000; i++) { for (let q = 0; q < 4; q++) p = springStep(p, 1000, 1 / 4000, false, s.k, s.c); out.push(p.x / 1000); }
  return out;
}
const peak = (s: SpringK) => Math.max(...stepPath(s, 2));

describe("the notch springs", () => {
  test("the table's numbers come from each response and damping", () => {
    for (const [name, r] of Object.entries(NOTCH_TABLE)) {
      const want = fromResponse(r.response, r.damping), got = NOTCH[name as keyof typeof NOTCH];
      expect(Math.abs(got.k - want.k), name).toBeLessThanOrEqual(1);
      expect(Math.abs(got.c - want.c), name).toBeLessThanOrEqual(0.1);
    }
    expect(NOTCH).toEqual({ HOVER: { k: 273, c: 26.5 }, OPEN_W: { k: 386, c: 36.1 }, OPEN_H: { k: 386, c: 36.1 }, CLOSE: { k: 685, c: 52.4 }, WORK: { k: 504, c: 35.9 } });
    // Feel round 3 (19 Nov 2026), changed on purpose: one clock for width and height, so the content has one clip.
    expect(OPEN_H_DELAY_MS).toBe(0);
  });
  test("island.rs holds the same numbers", () => {
    for (const [name, s] of Object.entries(NOTCH)) {
      const m = new RegExp(`pub const NOTCH_${name}: Spring = Spring \\{ k: ([\\d.]+), c: ([\\d.]+) \\};`).exec(rs);
      expect(m, name).not.toBeNull();
      expect([Number(m![1]), Number(m![2])], name).toEqual([s.k, s.c]);
    }
    expect(Number(/pub const OPEN_H_DELAY_MS: u64 = (\d+);/.exec(rs)?.[1])).toBe(OPEN_H_DELAY_MS);
  });
  test("closing never passes its target, over two seconds", () => {
    expect(peak(NOTCH.CLOSE)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.max(...springPath(NOTCH.CLOSE))).toBeLessThanOrEqual(1 + 1e-9);
  });
  // Changed on purpose (feel round 1, 18 Nov 2026): the old one percent overshoot bobbed the bottom edge of a body hanging
  // from the notch by about 4 points, so the opening is now tight (damping 0.92, about 0.05 percent).
  test("opening settles with no visible overshoot, under 0.3 percent, and never stops short", () => {
    for (const s of [NOTCH.OPEN_W, NOTCH.OPEN_H]) { const p = peak(s); expect(p).toBeGreaterThan(0.999); expect(p).toBeLessThan(1.003); }
  });
  test("every spring rests within 0.8 s", () => {
    for (const [name, s] of Object.entries(NOTCH)) {
      const p = stepPath(s, 0.8), last = p.slice(-50);
      expect(last.every((x) => Math.abs(1 - x) < 0.003), name).toBe(true);
    }
  });
  test("each spring as a CSS curve has at most 64 stops from 0 to 1 and matches the island's own drawing within half a percent", () => {
    for (const [name, s] of Object.entries(NOTCH)) {
      const css = springLinear(s, 64), stops = /^linear\((.*)\)$/.exec(css)![1].split(",").map(Number);
      expect(stops.length, name).toBeLessThanOrEqual(64);
      expect(stops[0]).toBe(0);
      expect(stops.at(-1)).toBe(1);
      const ref = springPath(s), mine = stepPath(s, (ref.length - 1) / 1000);
      stops.forEach((y, i) => { if (i === 0 || i === stops.length - 1) return; const at = Math.round((i / (stops.length - 1)) * (ref.length - 1)); expect(Math.abs(y - mine[at]), `${name} stop ${i}`).toBeLessThan(0.005); });
    }
  });
  test("the island grows on WORK, tucks back on CLOSE and pulses on HOVER", () => {
    expect(ISLAND_SPRING).toBe(NOTCH.WORK);
    expect(TUCK_SPRING).toBe(NOTCH.CLOSE);
    expect(CHEER_SPRING).toBe(NOTCH.HOVER);
    // From the wings (80 points wider) back to the notch: within a point by TUCK_MS.
    let s = { x: 265, v: 0 };
    for (let t = 0; t < TUCK_MS; t++) s = springStep(s, 185, 1 / 1000, false, TUCK_SPRING.k, TUCK_SPRING.c);
    expect(Math.abs(s.x - 185)).toBeLessThan(1);
  });
});

// M66 step 5: the island's spring was chosen again on every frame, so a growing shape switched from WORK to CLOSE the moment
// it first passed its target, and its overshoot ran on and came back on a softer, slower curve.
describe("the island's spring is chosen once for each new target", () => {
  /** A grow from `from` to `to`, frame by frame at 120 Hz, with the spring chosen once (as island.tsx does now) or, as before,
   *  again on every frame from where the shape is. The farthest past the target, as a fraction of the move. */
  function grow(from: number, to: number, perFrame: boolean) {
    let s = { x: from, v: 0 }, most = 0;
    const once = springFor(from, to, false);
    for (let t = 0; t < 2; t += 1 / 120) {
      const k = perFrame ? (to < s.x ? TUCK_SPRING : ISLAND_SPRING) : once;
      s = springStep(s, to, 1 / 120, false, k.k, k.c);
      most = Math.max(most, (s.x - to) / (to - from));
    }
    return most;
  }
  test("a grow keeps WORK to the end: its overshoot is WORK's own, about 1.5 percent, and never swapped for CLOSE's", () => {
    const own = Math.max(...stepPathOf(NOTCH.WORK)) - 1;
    for (const [a, b] of [[185, 360], [185, 265], [32, 120]]) {
      expect(springFor(a, b, false)).toBe(ISLAND_SPRING);
      const o = grow(a, b, false);
      expect(o, `${a} to ${b}`).toBeLessThanOrEqual(own + 0.001);
      // Feel round 3 (19 Nov 2026): WORK's damping went from 0.85 to 0.8 on purpose, for a light living settle.
      expect(o).toBeLessThan(0.016);
    }
  });
  test("a smaller target tucks on CLOSE, the done pulse is HOVER, whatever the shape does after", () => {
    expect(springFor(360, 185, false)).toBe(TUCK_SPRING);
    expect(springFor(185, 360, true)).toBe(CHEER_SPRING);
    expect(springFor(185, 185, false)).toBe(ISLAND_SPRING);
  });
  test("island.tsx chooses the spring before the frame loop, never inside it", () => {
    const tsx = readFileSync(new URL("./island.tsx", import.meta.url), "utf8");
    const tick = tsx.slice(tsx.indexOf("const tick = "), tsx.indexOf("raf = requestAnimationFrame(tick);\n    };"));
    expect(tick.length).toBeGreaterThan(20);
    expect(tick).not.toMatch(/springFor|pick\(|TUCK_SPRING|ISLAND_SPRING/);
    expect(tsx).not.toContain("const pick = ");
    expect(tsx).toMatch(/const sx = springFor\(at\.current\.x\.x, w, soft\), sy = springFor\(at\.current\.y\.x, h, soft\);/);
  });
});

describe("the hover panel's words leave before its shape tucks back", () => {
  test("a shape that gets smaller after the panel showed waits PANEL_EXIT_MS; anything else starts at once", () => {
    expect(PANEL_EXIT_MS).toBe(80);
    expect(tuckHoldMs(true, false, true, false)).toBe(PANEL_EXIT_MS);
    expect(tuckHoldMs(true, false, false, false)).toBe(0);   // growing: at once
    expect(tuckHoldMs(false, false, true, false)).toBe(0);   // no panel showed
    expect(tuckHoldMs(true, true, true, false)).toBe(0);     // the panel is still up (a new height)
    expect(tuckHoldMs(true, false, true, true)).toBe(0);     // Reduce motion: at its target at once
  });
  test("the tuck, and so the window's wait (island.rs RETRACT_MS), takes that wait too", () => {
    // Feel round 3 (19 Nov 2026), changed on purpose: CLOSE is 0.24 s now, so the tuck is shorter.
    expect(TUCK_MS).toBe(370 + PANEL_EXIT_MS);
    let s = { x: 265, v: 0 };
    for (let t = 0; t < TUCK_MS - PANEL_EXIT_MS; t++) s = springStep(s, 185, 1 / 1000, false, TUCK_SPRING.k, TUCK_SPRING.c);
    expect(Math.abs(s.x - 185)).toBeLessThan(1);
  });
});

function stepPathOf(s: SpringK): number[] {
  const out = [0];
  let p = { x: 0, v: 0 };
  for (let i = 0; i < 2000; i++) { for (let q = 0; q < 4; q++) p = springStep(p, 1000, 1 / 4000, false, s.k, s.c); out.push(p.x / 1000); }
  return out;
}
