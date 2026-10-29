// Draw it as a picture (M33, the founder showing HeyClicky's drawn illustrations: "genuinely copy them, and make it ours").
// The model answers in a tiny drawing language, never free SVG: a title, a caption, and up to 80 shapes on a 400 by 300
// board, each a circle, an ellipse, a rectangle, a line, a pen path or a short label, in colours from a fixed palette.
// Everything is checked hard here before a page sees it: unknown shapes and colours are dropped, numbers are kept on the
// board, a path may use only drawing commands and numbers, and text is plain. The overlay draws it stroke by stroke.
import { clip, redact } from "./redact.ts";

export const BOARD = { w: 400, h: 300 } as const;
export const MAX_SHAPES = 80;
export const PALETTE = ["ink", "white", "gray", "blue", "sky", "navy", "yellow", "orange", "red", "pink", "purple", "green", "teal", "brown", "skin"] as const;
export type Colour = (typeof PALETTE)[number] | "none";

export type Shape =
  | { k: "circle"; x: number; y: number; r: number; stroke: Colour; fill: Colour; w: number }
  | { k: "ellipse"; x: number; y: number; rx: number; ry: number; stroke: Colour; fill: Colour; w: number }
  | { k: "rect"; x: number; y: number; width: number; height: number; r: number; stroke: Colour; fill: Colour; w: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; stroke: Colour; w: number }
  | { k: "path"; d: string; stroke: Colour; fill: Colour; w: number }
  | { k: "text"; x: number; y: number; s: string; size: number; fill: Colour };
export type Sketch = { title: string; caption: string; shapes: Shape[] };

export const SKETCH_SYSTEM = [
  "You explain things to a person who is not an engineer by DRAWING a simple, friendly picture, like a hand-drawn illustration on a whiteboard.",
  "Reply with ONLY JSON: {\"title\":\"...\",\"caption\":\"...\",\"shapes\":[...]}.",
  "The board is 400 wide and 300 tall, x to the right and y down. Draw in the order a person would: big shapes first, details after, labels last.",
  "Shapes: {\"k\":\"circle\",\"x\":,\"y\":,\"r\":} {\"k\":\"ellipse\",\"x\":,\"y\":,\"rx\":,\"ry\":} {\"k\":\"rect\",\"x\":,\"y\":,\"width\":,\"height\":,\"r\":} {\"k\":\"line\",\"x1\":,\"y1\":,\"x2\":,\"y2\":} {\"k\":\"path\",\"d\":\"M .. C .. Q .. L .. Z\"} {\"k\":\"text\",\"x\":,\"y\":,\"s\":\"short label\",\"size\":14}.",
  `Each shape may have "stroke", "fill" (one of ${PALETTE.join(", ")}, or none) and "w" (stroke width 1 to 6). Use soft fills with ink outlines, like a children's book.`,
  "Use 10 to 60 shapes. Keep labels to three words. \"title\" is two to five words; \"caption\" is one plain sentence saying what the picture shows.",
].join(" ");

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : null);
const colour = (v: unknown, fallback: Colour): Colour => (v === "none" || (PALETTE as readonly string[]).includes(String(v)) ? (v as Colour) : fallback);
const plain = (v: unknown, n: number): string => clip(redact(String(v ?? "")).replace(/<[^>]*>/g, "").replace(/[<>\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(), n);
const width = (v: unknown): number => num(v, 1, 6) ?? 2.5;

/** A pen path: only drawing commands and numbers, every number kept near the board, at most 800 characters. */
export function cleanPath(d: unknown): string | null {
  if (typeof d !== "string" || d.length > 800) return null;
  if (!/^[\sMmLlHhVvCcSsQqTtZz0-9.,eE+-]+$/.test(d)) return null;
  if (!/^\s*[Mm]/.test(d)) return null;
  let bad = false;
  const out = d.replace(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g, (n) => { const v = Number(n); if (!Number.isFinite(v) || Math.abs(v) > 600) bad = true; return String(Math.round(v * 10) / 10); });
  return bad ? null : out.replace(/\s+/g, " ").trim();
}

function shapeOf(o: Record<string, unknown>): Shape | null {
  const W = BOARD.w, H = BOARD.h;
  const stroke = colour(o.stroke, "ink"), fill = colour(o.fill, "none"), w = width(o.w);
  switch (o.k) {
    case "circle": { const x = num(o.x, 0, W), y = num(o.y, 0, H), r = num(o.r, 1, 200); return x === null || y === null || r === null ? null : { k: "circle", x, y, r, stroke, fill, w }; }
    case "ellipse": { const x = num(o.x, 0, W), y = num(o.y, 0, H), rx = num(o.rx, 1, 200), ry = num(o.ry, 1, 150); return x === null || y === null || rx === null || ry === null ? null : { k: "ellipse", x, y, rx, ry, stroke, fill, w }; }
    case "rect": { const x = num(o.x, 0, W), y = num(o.y, 0, H), wd = num(o.width, 1, W), ht = num(o.height, 1, H); return x === null || y === null || wd === null || ht === null ? null : { k: "rect", x, y, width: wd, height: ht, r: num(o.r, 0, 40) ?? 0, stroke, fill, w }; }
    case "line": { const x1 = num(o.x1, 0, W), y1 = num(o.y1, 0, H), x2 = num(o.x2, 0, W), y2 = num(o.y2, 0, H); return x1 === null || y1 === null || x2 === null || y2 === null ? null : { k: "line", x1, y1, x2, y2, stroke, w }; }
    case "path": { const d = cleanPath(o.d); return d ? { k: "path", d, stroke, fill, w } : null; }
    case "text": { const x = num(o.x, 0, W), y = num(o.y, 0, H), s = plain(o.s, 40); return x === null || y === null || !s ? null : { k: "text", x, y, s, size: num(o.size, 9, 28) ?? 14, fill: colour(o.fill, "ink") }; }
    default: return null;
  }
}

/** The model's answer, checked. Null when it is not a picture worth showing (no title, or fewer than three shapes). */
export function parseSketch(raw: string): Sketch | null {
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: unknown;
  try { j = JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  const o = j as { title?: unknown; caption?: unknown; shapes?: unknown };
  if (!o || !Array.isArray(o.shapes)) return null;
  const title = plain(o.title, 48), caption = plain(o.caption, 160);
  const shapes = (o.shapes as unknown[]).filter((s): s is Record<string, unknown> => !!s && typeof s === "object").map(shapeOf).filter((s): s is Shape => s !== null).slice(0, MAX_SHAPES);
  if (!title || shapes.length < 3) return null;
  return { title, caption, shapes };
}

/** The request for a picture of `question`: plain words only, no project content. */
export const sketchRequest = (question: string): { system: string; text: string } => ({ system: SKETCH_SYSTEM, text: `Draw: ${plain(question, 300)}` });
