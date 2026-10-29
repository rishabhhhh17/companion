// Drawing v2 (M28): marks on the real screen drawn the way a person draws with a pen, past what HeyClicky's "Excalidraw
// style" does. The ink tapers (perfect-freehand, MIT), each stroke is drawn in pen order at pen speed, a ring closes a
// little past where it began, an arrow bends and gets its head after its shaft, an underline gets a short return stroke.
// Everything is seeded by the target's caption, so the same target always gets the same mark and it can be tested; a ring
// never cuts into what it circles, and every point stays inside the window the target was confirmed in. The numbers come
// from the drawing research of 29 Oct 2026 (OpenClicky's teacher board, the Clicky WPF port, Excalidraw's pen settings).
import { getStroke } from "perfect-freehand";
import { rng } from "./sketch.ts";
import type { Box, Mark } from "./marks.ts";

/** x, y and the pen's pressure (0 to 1). */
export type Pt = [number, number, number];
/** One stroke: its points in pen order, how long the pen takes over it, and the pause before it starts. */
export type InkStroke = { points: Pt[]; ms: number; gap: number };
export type InkMark = { strokes: InkStroke[] };

/** The pen: ink width and how it thins with speed; the halo under it is this much wider, for contrast on any background. */
export const INK = { size: 4.5, thinning: 0.5, smoothing: 0.6, streamline: 0.35, halo: 5 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const length = (p: Pt[]) => p.reduce((n, q, i) => (i ? n + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
/** The pressure of a pen through a stroke: light as it lands, firmest in the middle, easing off as it lifts. */
const pressure = (k: number) => 0.35 + 0.25 * Math.sin(Math.PI * k) + 0.05 * k;
/** How long the pen takes: its speed in points a second, and the shortest and longest a stroke may take. */
const timed = (p: Pt[], speed: number, lo: number, hi: number) => Math.round(clamp((length(p) / speed) * 1000, lo, hi));
const insideBox = (x: number, y: number, r: Box, pad: number) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;

/** A ring: an ellipse big enough to hold the target's corners, started at about ten o'clock, going round once and 25 to 40
 *  degrees past, its radius wobbling gently and drifting outward so the overlap sits just outside the start. Points that
 *  would fall within 4 points of the target are pushed out along their ray. */
function ring(t: Box, r: () => number): InkStroke {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  let rx = (t.w / 2) * 1.42 + 6, ry = (t.h / 2) * 1.42 + 6;
  if (rx / ry > 3.5) ry = rx / 3.5;
  const start = ((-120 + (r() * 2 - 1) * 15) * Math.PI) / 180;
  const sweep = 2 * Math.PI + ((25 + r() * 15) * Math.PI) / 180;
  const A = clamp(0.04 * Math.min(rx, ry), 1.5, 4), f1 = r() * Math.PI * 2, f2 = r() * Math.PI * 2;
  const n = 56, pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, a = start + sweep * k;
    const off = A * (0.6 * Math.sin(2 * a + f1) + 0.4 * Math.sin(3 * a + f2)) + A * (k - 0.5);
    let x = cx + (rx + off) * Math.cos(a), y = cy + (ry + off) * Math.sin(a);
    for (let g = 0; g < 40 && insideBox(x, y, t, 4); g++) { x = cx + (x - cx) * 1.04; y = cy + (y - cy) * 1.04; }
    pts.push([x, y, pressure(k)]);
  }
  return { points: pts, ms: timed(pts, 900, 350, 800), gap: 0 };
}

/** An arrow: from the side with the most room, a shaft bent a little to one side that stops 10 points short of the target,
 *  then an open head (wing, tip, wing) drawn as its own stroke once the shaft is done. */
function arrow(t: Box, b: Box, r: () => number): InkStroke[] {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  const room = { left: t.x - b.x, right: b.x + b.w - (t.x + t.w), up: t.y - b.y, down: b.y + b.h - (t.y + t.h) };
  const sx = room.left >= room.right ? -1 : 1, sy = room.down >= room.up ? 1 : -1;
  const len = 96;
  const tail = { x: cx + sx * (t.w / 2 + len * 0.7), y: cy + sy * (t.h / 2 + len * 0.7) };
  const ang = Math.atan2(cy - tail.y, cx - tail.x);
  // The head stops at the target's edge plus 10 points, along the line from the tail.
  let reach = 0;
  while (reach < 400 && !insideBox(tail.x + Math.cos(ang) * reach, tail.y + Math.sin(ang) * reach, t, 10)) reach += 1;
  const tip = { x: tail.x + Math.cos(ang) * reach, y: tail.y + Math.sin(ang) * reach };
  const L = Math.hypot(tip.x - tail.x, tip.y - tail.y) || 1;
  const bend = clamp(L * (0.04 + r() * 0.04), 0, 18) * (r() < 0.5 ? -1 : 1);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const shaft: Pt[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const k = i / n, bow = Math.sin(Math.PI * k) * bend;
    shaft.push([tail.x + (tip.x - tail.x) * k + nx * bow, tail.y + (tip.y - tail.y) * k + ny * bow, pressure(k)]);
  }
  // The head follows the direction the shaft arrives in.
  const [ax, ay] = shaft[n - 2], end = shaft[n];
  const into = Math.atan2(end[1] - ay, end[0] - ax);
  const wing = clamp(0.2 * L, 11, 20), spread = ((30 + (r() * 2 - 1) * 4) * Math.PI) / 180;
  const w1: Pt = [end[0] - Math.cos(into - spread) * wing, end[1] - Math.sin(into - spread) * wing, 0.45];
  const w2: Pt = [end[0] - Math.cos(into + spread) * wing, end[1] - Math.sin(into + spread) * wing, 0.45];
  const head: Pt[] = [w1, [(w1[0] + end[0]) / 2, (w1[1] + end[1]) / 2, 0.55], [end[0], end[1], 0.6], [(w2[0] + end[0]) / 2, (w2[1] + end[1]) / 2, 0.55], w2];
  return [{ points: shaft, ms: timed(shaft, 1100, 250, 600), gap: 0 }, { points: head, ms: 120, gap: 70 }];
}

/** An underline: just under the target from a little before it to a little past it, rising a degree or two to the right
 *  with a slight bow, then a shorter return stroke 3 points lower, the way people underline twice for emphasis. */
function underline(t: Box, r: () => number): InkStroke[] {
  const y0 = t.y + t.h + 5, x0 = t.x - 4, x1 = t.x + t.w + 6;
  const rise = Math.tan(((1 + r()) * Math.PI) / 180) * (x1 - x0), bow = 1 + r();
  const line: Pt[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) { const k = i / n; line.push([x0 + (x1 - x0) * k, y0 - rise * k + Math.sin(Math.PI * k) * bow, pressure(k)]); }
  const back: Pt[] = [];
  const bx0 = x1 - (x1 - x0) * 0.6;
  for (let i = 0; i <= 12; i++) { const k = i / 12; back.push([x1 - 2 - (x1 - 2 - bx0) * k, y0 + 3 - rise * (1 - k * 0.6) * 0.9, pressure(k) * 0.85]); }
  return [{ points: line, ms: timed(line, 1200, 200, 450), gap: 0 }, { points: back, ms: timed(back, 1200, 150, 300), gap: 60 }];
}

/** A box: round the target 6 points out, one stroke corner to corner, each corner a little overshot, closing past the first
 *  corner the way a quick hand does. */
function box(t: Box, r: () => number): InkStroke {
  const p = 6, x0 = t.x - p, y0 = t.y - p, x1 = t.x + t.w + p, y1 = t.y + t.h + p;
  const j = () => (r() * 2 - 1) * 1.2;
  const corners: [number, number][] = [[x0 + j(), y0 + j()], [x1 + j(), y0 + j()], [x1 + j(), y1 + j()], [x0 + j(), y1 + j()], [x0 + j(), y0 + j()], [x0 + 14, y0 + j()]];
  const pts: Pt[] = [];
  const per = 8;
  for (let c = 0; c < corners.length - 1; c++) {
    const [ax, ay] = corners[c], [bx, by] = corners[c + 1];
    for (let i = 0; i < per; i++) { const k = i / per; pts.push([ax + (bx - ax) * k, ay + (by - ay) * k, 0]); }
  }
  pts.push([...corners[corners.length - 1], 0]);
  pts.forEach((q, i) => { q[2] = pressure(i / (pts.length - 1)); });
  return { points: pts, ms: timed(pts, 1000, 400, 900), gap: 0 };
}

/** The strokes for one mark, every point inside the window (`clip`, or the whole display `view`), or null when the target's
 *  middle is outside that window: nothing is drawn for something outside it. */
export function inkMark(kind: Mark, t: Box, clip: Box | null, seed: string, view: Box): InkMark | null {
  const b = clip ?? view;
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) return null;
  const r = rng(`ink:${kind}:${seed}`);
  const strokes = kind === "ring" ? [ring(t, r)] : kind === "arrow" ? arrow(t, b, r) : kind === "underline" ? underline(t, r) : [box(t, r)];
  for (const s of strokes) for (const q of s.points) { q[0] = clamp(q[0], b.x + 1, b.x + b.w - 1); q[1] = clamp(q[1], b.y + 1, b.y + b.h - 1); }
  return { strokes };
}

/** How long the whole mark takes to draw, pauses included. */
export const inkTotalMs = (m: InkMark): number => m.strokes.reduce((n, s) => n + s.gap + s.ms, 0);

/** The filled outline of the ink drawn so far (`progress` 0 to 1 along the stroke), as an SVG path. The pen lifts with a
 *  long taper only once the stroke is finished; while it is still moving the end is the pen's own round tip. */
export function inkPath(points: Pt[], size: number, progress: number): string {
  const n = Math.round(clamp(progress, 0, 1) * points.length);
  if (n < 2) return "";
  const done = n >= points.length;
  const outline = getStroke(points.slice(0, n), {
    size, thinning: INK.thinning, smoothing: INK.smoothing, streamline: INK.streamline, simulatePressure: false,
    start: { taper: 12, cap: true }, end: { taper: done ? 28 : 0, cap: true }, last: done,
  });
  if (outline.length < 3) return "";
  // Quadratic curves through the outline's midpoints: smooth edges with few points (perfect-freehand's own advice).
  const f = (v: number) => Math.round(v * 10) / 10;
  let d = `M${f(outline[0][0])} ${f(outline[0][1])} Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % outline.length];
    d += `${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)} `;
  }
  return `${d.trim()} Z`;
}

/** The halo under the ink, for contrast on any app (two colours, WCAG technique C40): a light ink (lime, yellow, white)
 *  gets a dark edge, a dark ink (red, blue) a white one. A colour it cannot read gets the dark edge. */
export function haloFor(ink: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(ink.trim());
  if (!m) return "rgba(14, 16, 10, 0.6)";
  const n = parseInt(m[1], 16), lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.35 ? "rgba(14, 16, 10, 0.6)" : "rgba(255, 255, 255, 0.85)";
}
/** The pen's easing over a stroke: quick to start, landing softly (close to cubic-bezier(0.33, 0, 0.2, 1)). */
export const penEase = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 2.2);
