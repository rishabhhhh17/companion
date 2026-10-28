// The water pointer's maths (water.ts): the ring, the stretch, the split, hops, the arc and the colours.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { arcAt, BEAD_GAP, bud, BODY_R, DROP_R, HOME_DELAY_MS, HOME_MS, isHop, ringBeads, settle, stretch, WATER_TINT, waterTint } from "./water.ts";

const gaps = (rx: number, ry: number) => {
  const b = ringBeads(rx, ry);
  return b.map((p, i) => { const q = b[(i + 1) % b.length]; return Math.hypot((q.ux - p.ux) * rx, (q.uy - p.uy) * ry); });
};

describe("the ring of water", () => {
  test("beads are evenly spaced by length, even around a wide flat target, so the ring has no gaps", () => {
    for (const [rx, ry] of [[40, 40], [120, 40], [40, 90], [120, 24], [300, 30]]) {
      const g = gaps(rx, ry), lo = Math.min(...g), hi = Math.max(...g);
      expect(hi, `${rx}x${ry}`).toBeLessThan(BEAD_GAP * 1.35);
      // Even all round where the ring bends gently; at the sharp tips of a very flat ring the beads only crowd closer.
      if (Math.min(rx, ry) / Math.max(rx, ry) > 0.3) expect(hi - lo, `${rx}x${ry} spacing`).toBeLessThan(2);
      expect(lo, `${rx}x${ry} never on top of each other`).toBeGreaterThan(1);
    }
  });
  test("a small target still gets a full ring, and every bead sits on the ellipse", () => {
    const b = ringBeads(10, 8);
    expect(b.length).toBeGreaterThanOrEqual(14);
    for (const p of b) expect(Math.hypot(p.ux, p.uy)).toBeCloseTo(1, 5);
  });
  test("each bead's wobble goes outward from the ring", () => {
    for (const p of ringBeads(100, 30)) {
      expect(Math.hypot(p.nx, p.ny)).toBeCloseTo(1, 5);
      expect(p.nx * p.ux + p.ny * p.uy).toBeGreaterThan(0);
    }
  });
  test("the spread overshoots a little and settles exactly", () => {
    expect(settle(0)).toBe(0);
    expect(settle(1)).toBe(1);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => settle(i / 50)))).toBeGreaterThan(1);
  });
});

describe("the drop", () => {
  test("stretches along the way it moves and keeps its area, within a limit", () => {
    expect(stretch(0)).toEqual({ along: 1, across: 1 });
    const s = stretch(900);
    expect(s.along).toBeGreaterThan(1);
    expect(s.along * s.across ** 2).toBeCloseTo(1, 5);
    expect(stretch(1e9).along).toBeCloseTo(1.9, 5);
    expect(stretch(-5)).toEqual({ along: 1, across: 1 });
  });
  test("the split: the bud leaves the body toward the target, swells to a full drop and its neck thins to nothing", () => {
    const from = { x: 1400, y: 500 }, to = { x: 300, y: 200 };
    const a = bud(from, to, 0), b = bud(from, to, 1);
    expect(a.r).toBeLessThan(b.r);
    expect(b.r).toBeCloseTo(DROP_R, 5);
    expect(b.neck.r).toBe(0);
    expect(a.neck.r).toBeGreaterThan(10);
    expect(b.x).toBeLessThan(from.x - BODY_R);   // out past the body's edge, on the target's side
    expect(Math.hypot(b.x - from.x, b.y - from.y)).toBeCloseTo(BODY_R * 1.5, 5);
  });
  test("a draw that starts where the last drop landed is a hop, anything else splits from the character", () => {
    expect(isHop({ x: 300, y: 200 }, { x: 301, y: 201 })).toBe(true);
    expect(isHop({ x: 300, y: 200 }, { x: 400, y: 200 })).toBe(false);
    expect(isHop({ x: 300, y: 200 }, null)).toBe(false);
  });
  test("the arc starts and ends exactly on its points, rises above both, and a hop jumps higher", () => {
    const f = { x: 100, y: 400 }, t = { x: 160, y: 400 };
    expect(arcAt(f, t, 0)).toEqual(f);
    expect(arcAt(f, t, 1)).toEqual(t);
    expect(arcAt(f, t, 0.5).y).toBeLessThan(400);
    expect(arcAt(f, t, 0.5, true).y).toBeLessThan(arcAt(f, t, 0.5).y);
  });
  test("the trip home fits inside the time the shell keeps the overlay after a right click (1.4 s)", () => {
    expect(HOME_DELAY_MS + HOME_MS).toBeLessThan(1400 - 200);
  });
});

describe("its colours", () => {
  test("the usual is Flowflow's water; red, yellow and blue tint it; nonsense is water", () => {
    expect(waterTint("orange")).toEqual(WATER_TINT);
    expect(waterTint(undefined)).toEqual(WATER_TINT);
    expect(waterTint("nonsense")).toEqual(WATER_TINT);
    for (const c of ["red", "yellow", "blue", "highContrast"]) expect(waterTint(c)).not.toEqual(WATER_TINT);
  });
  test("a guess is never water: it keeps the dashed ring and gets no beads (rule 22)", () => {
    const o = readFileSync(new URL("./overlay.ts", import.meta.url), "utf8");
    expect(o).toContain('const beads = p.exact && style === "water" ? ringBeads(rx, ry');
    expect(o).toContain('if (p.exact && !look.halo && style === "water") ring.setAttribute("data-water", "1");');
  });
  test("no orange: the old ring colour is not in the water", () => {
    expect(readFileSync(new URL("./water.ts", import.meta.url), "utf8")).not.toMatch(/#ff9a2e/i);
  });
});

describe("the pointer's style and size (M19)", () => {
  test("the usual ring colour is the water's own, a chosen ring colour still wins, and the drop has three sizes", async () => {
    const { WATER_TINTS } = await import("./lookfeel.ts");
    const { dropScale } = await import("./water.ts");
    expect(waterTint("orange", "berry").mid).toBe(WATER_TINTS.berry.mid);
    expect(waterTint("orange", undefined)).toEqual(WATER_TINT);
    expect(waterTint("red", "berry")).not.toEqual(waterTint("orange", "berry"));
    expect([dropScale("small"), dropScale("usual"), dropScale("large"), dropScale("odd")]).toEqual([0.75, 1, 1.35, 1]);
  });
  test("a plain ring simply appears with no flight and no water, and the caption can be white", () => {
    const o = readFileSync(new URL("./overlay.ts", import.meta.url), "utf8");
    expect(o).toContain('if (style === "ring") { land(); return; }');
    expect(o).toContain('cap.classList.toggle("white", setting("point.caption") === "white");');
    expect(readFileSync(new URL("../overlay.html", import.meta.url), "utf8")).toContain(".cap.white{background:#fff;color:#000;");
  });
});
