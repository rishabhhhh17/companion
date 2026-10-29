import { describe, expect, test } from "bun:test";
import { INK, inkMark, inkPath, inkTotalMs, type InkMark } from "./ink.ts";

// M28 drawing v2: marks drawn like a pen (tapered ink, pen order, pen speed), seeded so the same target always gets the
// same mark, and kept honest: a ring never cuts into what it circles, and nothing leaves the window.
const T = { x: 400, y: 300, w: 120, h: 36 };
const VIEW = { x: 0, y: 0, w: 1440, h: 900 };
const all = (m: InkMark) => m.strokes.flatMap((s) => s.points);
const inside = (p: number[], r: { x: number; y: number; w: number; h: number }, pad: number) =>
  p[0] > r.x - pad && p[0] < r.x + r.w + pad && p[1] > r.y - pad && p[1] < r.y + r.h + pad;

describe("ink marks (M28)", () => {
  test("the same target and seed always draw the same mark; another seed draws another", () => {
    expect(inkMark("ring", T, null, "Join", VIEW)).toEqual(inkMark("ring", T, null, "Join", VIEW));
    expect(inkMark("ring", T, null, "Join", VIEW)).not.toEqual(inkMark("ring", T, null, "Save", VIEW));
  });
  test("a ring goes all the way round and a little past where it began, like a hand closing a circle", () => {
    const m = inkMark("ring", T, null, "Join", VIEW)!;
    expect(m.strokes.length).toBe(1);
    const cx = T.x + T.w / 2, cy = T.y + T.h / 2;
    const pts = m.strokes[0].points;
    let turned = 0;
    for (let i = 1; i < pts.length; i++) {
      let d = Math.atan2(pts[i][1] - cy, pts[i][0] - cx) - Math.atan2(pts[i - 1][1] - cy, pts[i - 1][0] - cx);
      if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      turned += d;
    }
    expect(Math.abs(turned)).toBeGreaterThan(2 * Math.PI + (20 * Math.PI) / 180);
    expect(Math.abs(turned)).toBeLessThan(2 * Math.PI + (55 * Math.PI) / 180);   // 25 to 40 degrees of the ellipse, a little more seen from its middle
  });
  test("a ring never cuts into what it circles", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) for (const t of [T, { x: 50, y: 50, w: 20, h: 20 }, { x: 600, y: 400, w: 300, h: 40 }]) {
      for (const p of all(inkMark("ring", t, null, seed, VIEW)!)) expect(inside(p, t, 4), `${seed} ${JSON.stringify(t)} ${p}`).toBe(false);
    }
  });
  test("an arrow is a curved shaft then an open head, ending just outside the target", () => {
    const m = inkMark("arrow", T, null, "Join", VIEW)!;
    expect(m.strokes.length).toBe(2);
    const shaft = m.strokes[0].points, end = shaft[shaft.length - 1];
    expect(inside(end, T, 2)).toBe(false);
    expect(inside(end, T, 30)).toBe(true);
    expect(m.strokes[1].points.length).toBeGreaterThanOrEqual(3);   // wing, tip, wing
    expect(m.strokes[1].gap).toBeGreaterThan(0);                     // the head comes after the shaft
  });
  test("an underline runs under the target past both ends, then a shorter return stroke", () => {
    const m = inkMark("underline", T, null, "Join", VIEW)!;
    const line = m.strokes[0].points;
    expect(Math.min(...line.map((p) => p[0]))).toBeLessThan(T.x);
    expect(Math.max(...line.map((p) => p[0]))).toBeGreaterThan(T.x + T.w);
    for (const p of line) expect(p[1]).toBeGreaterThan(T.y + T.h);
    expect(m.strokes.length).toBe(2);
  });
  test("a box goes round the target outside it and closes past its first corner", () => {
    const m = inkMark("box", T, null, "Join", VIEW)!;
    for (const p of all(m)) expect(inside(p, T, 2)).toBe(false);
  });
  test("every point of every kind stays inside the window, even at its very edge", () => {
    const edge = { x: 2, y: 2, w: 40, h: 30 };
    for (const k of ["ring", "arrow", "underline", "box"] as const) {
      const m = inkMark(k, edge, VIEW, "x", VIEW)!;
      for (const p of all(m)) { expect(p[0]).toBeGreaterThanOrEqual(1); expect(p[1]).toBeGreaterThanOrEqual(1); }
    }
  });
  test("nothing is drawn for a target whose middle is outside its window", () => {
    expect(inkMark("ring", { x: 2000, y: 10, w: 40, h: 20 }, VIEW, "x", VIEW)).toBeNull();
  });
  test("pen speed: a button's ring takes about half a second, never a slog", () => {
    const ring = inkMark("ring", T, null, "Join", VIEW)!;
    expect(ring.strokes[0].ms).toBeGreaterThanOrEqual(350);
    expect(ring.strokes[0].ms).toBeLessThanOrEqual(800);
    for (const k of ["arrow", "underline", "box"] as const) expect(inkTotalMs(inkMark(k, T, null, "Join", VIEW)!)).toBeLessThanOrEqual(1100);
  });
  test("pressure rises into the middle of a stroke and eases off at the end, so the ink tapers", () => {
    const p = inkMark("ring", T, null, "Join", VIEW)!.strokes[0].points;
    const mid = p[Math.floor(p.length / 2)][2];
    expect(mid).toBeGreaterThan(p[0][2]);
    expect(mid).toBeGreaterThan(p[p.length - 1][2]);
  });
  test("the ink is a filled outline that grows as the pen moves, and nothing before it starts", () => {
    const s = inkMark("ring", T, null, "Join", VIEW)!.strokes[0];
    expect(inkPath(s.points, INK.size, 0)).toBe("");
    const half = inkPath(s.points, INK.size, 0.5), whole = inkPath(s.points, INK.size, 1);
    expect(half.startsWith("M")).toBe(true);
    expect(whole.length).toBeGreaterThan(half.length);
  });
});
