// Hand drawn marks on the real screen (a ring, an arrow, an underline or a box per target), drawn with the same pen as
// Draw it for me. Rule 22: only on a confirmed target, only inside the window it was confirmed in. All plain maths.
import { describe, expect, test } from "bun:test";
import { arrowTail, clampPath, fadeMs, markFor, markStrokes, MARKS, ringRadii, type Box } from "./marks.ts";

const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
const pairs = (d: string) => { const v = nums(d); const out: [number, number][] = []; for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i], v[i + 1]]); return out; };
const inside = (p: [number, number], b: Box) => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h;
const VIEW: Box = { x: 0, y: 0, w: 1512, h: 982 };
const WIN: Box = { x: 200, y: 100, w: 800, h: 600 };
const BTN: Box = { x: 500, y: 380, w: 120, h: 32 };

describe("which mark is drawn", () => {
  test("a confirmed target gets the mark it asked for, and an unknown one gets a ring", () => {
    for (const k of MARKS) expect(markFor(k, true)).toBe(k);
    for (const bad of ["sparkles", 3, "ARROW", ""]) expect(markFor(bad, true)).toBe("ring");
  });
  test("a pointer that asked for no mark (Point at the problem) keeps its plain ring", () => {
    for (const none of [undefined, null]) expect(markFor(none, true)).toBeNull();
  });
  test("a guess never gets a drawing, only the soft ring (rule 22)", () => {
    for (const k of [...MARKS, undefined]) expect(markFor(k, false)).toBeNull();
  });
});

describe("the shapes", () => {
  test("every kind draws something, the same every time for the same target", () => {
    for (const k of MARKS) {
      const a = markStrokes(k, BTN, WIN, "seed", VIEW), b = markStrokes(k, BTN, WIN, "seed", VIEW);
      expect(a?.length, k).toBeGreaterThan(0);
      expect(a).toEqual(b);
    }
  });
  test("a ring goes round the target, a little bigger than the steady ring", () => {
    const { rx, ry } = ringRadii(BTN);
    const pts = markStrokes("ring", BTN, WIN, "s", VIEW)!.flatMap(pairs);
    const cx = BTN.x + BTN.w / 2, cy = BTN.y + BTN.h / 2;
    for (const [x, y] of pts) { expect(Math.abs(x - cx)).toBeLessThanOrEqual(rx + 12); expect(Math.abs(y - cy)).toBeLessThanOrEqual(ry + 12); }
    expect(Math.max(...pts.map(([x]) => x)) - cx).toBeGreaterThan(BTN.w / 2);
  });
  test("an underline runs under the target, from one end to the other", () => {
    const pts = markStrokes("underline", BTN, WIN, "s", VIEW)!.flatMap(pairs);
    for (const [x, y] of pts) { expect(y).toBeGreaterThan(BTN.y + BTN.h); expect(y).toBeLessThan(BTN.y + BTN.h + 14); expect(x).toBeGreaterThanOrEqual(BTN.x - 8); expect(x).toBeLessThanOrEqual(BTN.x + BTN.w + 8); }
  });
  test("a box sits just outside the target on all four sides", () => {
    const pts = markStrokes("box", BTN, WIN, "s", VIEW)!.flatMap(pairs);
    expect(Math.min(...pts.map(([x]) => x))).toBeLessThan(BTN.x);
    expect(Math.max(...pts.map(([x]) => x))).toBeGreaterThan(BTN.x + BTN.w);
    expect(Math.min(...pts.map(([, y]) => y))).toBeLessThan(BTN.y);
    expect(Math.max(...pts.map(([, y]) => y))).toBeGreaterThan(BTN.y + BTN.h);
  });
  test("an arrow comes from where there is room inside the window and ends at the target's edge", () => {
    const tail = arrowTail(BTN, WIN);
    expect(inside([tail.x, tail.y], WIN)).toBe(true);
    // Near the window's right edge and top, the arrow comes from the left and below instead.
    const corner: Box = { x: 940, y: 110, w: 50, h: 24 };
    const t2 = arrowTail(corner, WIN);
    expect(t2.x).toBeLessThan(corner.x); expect(t2.y).toBeGreaterThan(corner.y + corner.h);
    const strokes = markStrokes("arrow", BTN, WIN, "s", VIEW)!;
    const shaft = pairs(strokes[0]);
    const end = shaft[shaft.length - 1];
    const cx = BTN.x + BTN.w / 2, cy = BTN.y + BTN.h / 2;
    expect(Math.hypot(end[0] - cx, end[1] - cy)).toBeLessThan(Math.hypot(tail.x - cx, tail.y - cy));
  });
});

describe("clipped to the window (rule 22)", () => {
  test("every point of every kind stays inside the window, even for a target at its very edge", () => {
    const edge: Box = { x: 202, y: 102, w: 60, h: 20 };       // tucked into the window's top left corner
    const bottomRight: Box = { x: 950, y: 680, w: 48, h: 18 };
    for (const k of MARKS) for (const t of [BTN, edge, bottomRight]) {
      for (const d of markStrokes(k, t, WIN, "s", VIEW)!) for (const p of pairs(d)) expect(inside(p, WIN), `${k} ${JSON.stringify(t)} ${p}`).toBe(true);
    }
  });
  test("with no known window it stays on the display", () => {
    const t: Box = { x: 2, y: 2, w: 30, h: 20 };
    for (const k of MARKS) for (const d of markStrokes(k, t, null, "s", VIEW)!) for (const p of pairs(d)) expect(inside(p, VIEW)).toBe(true);
  });
  test("a target whose middle is outside its window is not drawn at all", () => {
    const outside: Box = { x: 1100, y: 300, w: 80, h: 30 };
    for (const k of MARKS) expect(markStrokes(k, outside, WIN, "s", VIEW)).toBeNull();
  });
  test("clamping moves only the points that stray, and keeps the path's commands", () => {
    const d = "M10 10 Q50 -20 300 40 L120.5 80";
    const c = clampPath(d, { x: 0, y: 0, w: 200, h: 100 });
    expect(c.replace(/[^A-Z]/g, "")).toBe("MQL");
    expect(pairs(c)).toEqual([[10, 10], [50, 1], [199, 40], [120.5, 80]]);
  });
});

describe("how long a drawing stays", () => {
  test("as long as its line, at least a few seconds, never long", () => {
    expect(fadeMs(5000)).toBe(5000);
    expect(fadeMs(300)).toBe(2500);
    expect(fadeMs(60_000)).toBe(8000);
    for (const bad of [undefined, null, "4000", Number.NaN]) expect(fadeMs(bad)).toBe(4000);
  });
});
