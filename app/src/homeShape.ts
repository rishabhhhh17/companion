// Home grows out of the notch as one black shape (M66 Part 2, step 1; docs/milestones/M66-smooth-and-flowy.md). Home's
// window is made once at a fixed size and never changes during a motion (island.rs HomePanel): only the shape drawn inside
// it moves, and only by transform and opacity, so Core Animation runs it at the display's own rate whatever the page does.
//
// The shape is a few plain black pieces, each sized at its largest and scaled down, so a radius is never stretched:
//   the band      in the menu bar row: the notch at rest, the notch and its wings when open (F18: never wider than that)
//   the body      Home itself, under the menu bar line: a middle that scales, and a foot with two round corners that move
//   shoulders     small concave pieces: at the top edge beside the band, and where the band meets the wider body
// Width and the band follow OPEN_W; the body's height follows OPEN_H, 60 ms later; everything folds back on CLOSE with no
// bounce. Home's content arrives once the shape is mostly there, and leaves first. Pure: card.tsx draws it, homeShape.css
// moves it, island.rs places the window and hit tests the same rects.
import { NOTCH, OPEN_H_DELAY_MS, type SpringK } from "./islandSpring.ts";
import { DUR, EXIT_MS, springPath, springSettleSecs } from "./motionTokens.ts";

export type HomeKind = "notch" | "pill" | "edge" | "free";
/** What the shell tells the page about Home's window (island.rs HomePanel, main.rs home_geom): the window's fixed size, the
 *  shape's centre from the window's left, the island at rest (what Home grows from and folds back into), the band when open,
 *  and the body's width and the heights it may take. "free": no island to grow from (turned off in Settings), so the body
 *  only fades and settles in where it is, with its top `top` from the window's top. */
export type HomeGeom = {
  kind: HomeKind;
  pw: number; ph: number;
  cx: number;
  rest: { w: number; h: number };
  band: { w: number; h: number };
  body: { w: number; minH: number; maxH: number; top: number };
};

/** The hardware notch's own bottom corner, and Home's open corner. The concave shoulders at the top edge and at the band. */
export const REST_R = 11;
export const OPEN_R = 24;
export const SHOULDER_REST = 6;
/** The small panel's bottom corner on a notch (style.css: .island.notch[data-mode="peek"] --r). */
export const PANEL_R = 22;
export const SHOULDER_OPEN = 12;
/** The hover nudge: this much wider and taller, at once, on HOVER. */
export const NUDGE_W = 6;
export const NUDGE_H = 2;
/** The foot (its strip and round corners) reaches this far up into the middle, so the two never leave a hairline between
 *  them while the height moves (homeShape.css: a 1 px shadow of the notch's black above each foot piece). Only the foot
 *  reaches: the middle is scaled, which would take the overlap away. The foot's own bottom, and so every rect, is unchanged;
 *  the overlap is scaled with the corner, so it is a whole point once the corner is open, which it is before the height
 *  moves (the corner runs on OPEN_W, the height 60 ms later on OPEN_H). */
export const SEAM = 1;
/** The headroom kept around the open shape inside the window, so the overshoot is never clipped (island.rs HEADROOM). */
export const HEADROOM = 24;

const KINDS: readonly HomeKind[] = ["notch", "pill", "edge", "free"];
const pos = (x: unknown, or = 0) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : or);
/** The shell's payload, checked; null for anything that does not make sense, so the page keeps what it had. */
export function geomFrom(v: unknown): HomeGeom | null {
  const o = v as Partial<Record<keyof HomeGeom, unknown>> | null;
  if (!o || typeof o !== "object" || !KINDS.includes(o.kind as HomeKind)) return null;
  const r = (o.rest ?? {}) as { w?: unknown; h?: unknown }, b = (o.band ?? {}) as { w?: unknown; h?: unknown };
  const y = (o.body ?? {}) as { w?: unknown; minH?: unknown; maxH?: unknown; top?: unknown };
  const g: HomeGeom = {
    kind: o.kind as HomeKind, pw: pos(o.pw), ph: pos(o.ph), cx: pos(o.cx),
    rest: { w: pos(r.w), h: pos(r.h) }, band: { w: pos(b.w), h: pos(b.h) },
    body: { w: pos(y.w), minH: pos(y.minH), maxH: pos(y.maxH), top: pos(y.top) },
  };
  if (!g.pw || !g.ph || !g.body.w || !g.body.maxH || g.body.minH > g.body.maxH) return null;
  if (g.kind !== "free" && (!g.rest.w || !g.rest.h || !g.band.w || !g.band.h)) return null;
  return g;
}

/** Home's body height for content `h` tall: between its least and its tallest. */
export const bodyHeight = (g: HomeGeom, h: number): number => Math.max(g.body.minH, Math.min(g.body.maxH, Number.isFinite(h) ? h : g.body.minH));

// ---- the state Home is in (a React data attribute on the stage, never a class a re-render could wipe) ----

export type HomePhase = "closed" | "opening" | "open" | "closing";
/** open: the shell said "opened". shown: the opening motion ended. close: the shell said "closing". folded: the closing
 *  motion ended (or its time ran out). stop: Stop everything, a hide, a display change: closed at once, no motion. */
export type HomeEvent = "open" | "shown" | "close" | "folded" | "stop";
export function homeNext(p: HomePhase, e: HomeEvent): HomePhase {
  switch (e) {
    // A new open during a close starts from where the shape is now (CSS transitions start from the current value).
    case "open": return p === "open" ? "open" : "opening";
    case "shown": return p === "opening" ? "open" : p;
    case "close": return p === "opening" || p === "open" ? "closing" : p;
    case "folded": return p === "closing" ? "closed" : p;
    case "stop": return "closed";
  }
}
/** Drawn open: the shape out and the content in. */
export const isOut = (p: HomePhase): boolean => p === "opening" || p === "open";

// ---- the curves (homeShape.css reads them from tokens.css, generated here and pinned by homeShape.test.ts) ----

/** How long a spring's curve runs, in whole ms: until it rests within a tenth of a percent. */
export const springMs = (s: SpringK): number => Math.round(springSettleSecs(s) * 1000);
/** When a spring's path first reaches `x` of the way, in ms after it starts. */
const reachMs = (s: SpringK, x: number): number => { const at = springPath(s).findIndex((y) => y >= x); return at < 0 ? springMs(s) : at; };
/** When Home's content starts to arrive, from the click: the height is 98.5 percent of the way there, so the content's
 *  bottom row (laid out at its full height, a little higher and smaller) is already inside the body when it starts to show
 *  (M66 step 5: at 80 percent it hung about 60 px below the body). Content never leads the shape. Rounded to 10 ms. */
export function contentAtMs(): number {
  return Math.round((OPEN_H_DELAY_MS + reachMs(NOTCH.OPEN_H, 0.985)) / 10) * 10;
}

/** When the island's hover panel starts to show, from the moment its shape starts to grow: WORK is 92 percent of the way,
 *  so its words never show beyond the shape's edge (M66 step 5; M70 step 4: at 80 percent the bottom row was cut by the
 *  edge for a frame or two). Rounded to 10 ms. */
export const islandPanelAtMs = (): number => Math.round(reachMs(NOTCH.WORK, 0.92) / 10) * 10;
/** When the island stops drawing once Home opens: Home's band (OPEN_W) is 99 percent out, so the island's wings are never
 *  uncovered while Home's band is narrower. Rounded to 10 ms. */
export const islandHideAtMs = (): number => Math.round(reachMs(NOTCH.OPEN_W, 0.99) / 10) * 10;
/** How long the page waits for a close to end before it says folded anyway (a hidden page sends no transitionend): the
 *  content leaves first (EXIT_MS.menu), then the shape folds on CLOSE. With reduced motion only the --dur-1 fade. */
export const foldMs = (reduced: boolean): number => (reduced ? DUR[1] : EXIT_MS.menu + springMs(NOTCH.CLOSE)) + 80;
/** How long the page waits for an opening to end before it says shown anyway: no transitionend comes for an opening by a
 *  keyboard shortcut (no growing, so at once), with Reduce motion or Less motion (only the --dur-1 fade), or for a shape that
 *  does not change as it opens (no island, "free"). Otherwise the width spring, or the height spring after its delay. */
export const growMs = (instant: boolean, reduced: boolean): number =>
  instant ? 0 : (reduced ? DUR[1] : Math.max(springMs(NOTCH.OPEN_W), OPEN_H_DELAY_MS + springMs(NOTCH.OPEN_H))) + 80;

// ---- the shape ----

/** M70: the rect Home grows from when it opens while the notch shows its small panel (main.rs open_card_then sends the
 *  panel's size with "opened"): width and height from the top edge, centred like everything else. Only the start of an
 *  opening uses it; Home always folds back into the island at rest (`rest`). */
export type FromRect = { w: number; h: number };
/** The `from` in the shell's "opened" payload, checked: null for anything that does not make sense, or no panel. */
export function fromOf(v: unknown): FromRect | null {
  const f = (v as { from?: { w?: unknown; h?: unknown } } | null)?.from;
  if (!f || typeof f !== "object") return null;
  const w = pos(f.w), h = pos(f.h);
  return w > 0 && h > 0 ? { w, h } : null;
}
export type ShapeState = { phase: HomePhase; hover: boolean; bodyH: number; from?: FromRect | null };
/** Where two pieces of the one shape meet, the inner one reaches this far under its neighbour, so their anti aliased edges
 *  never add up to a grey hairline at a fractional size (M70 step 4 shots: values of 20 to 45 on black). Only where both
 *  are solid black: the strip under the foot's round corners, and the shoulders toward the band. */
export const OVERLAP = 1;

/** Every piece's transform, as CSS. Each piece is laid out at its largest (pieceSizes) from the shape's centre at the top
 *  of the window, transform origin at its own top left, and only scaled down and moved. */
export type ShapeTransforms = {
  band: string; midY: string; midX: string; footY: string; strip: string; cornerL: string; cornerR: string;
  topL: string; topR: string; joinL: string; joinR: string; content: string; contentOpacity: number;
};
const n = (x: number) => String(Math.round(x * 1000) / 1000);
const t = (x: number, y: number) => `translate(${n(x)}px, ${n(y)}px)`;

/** The size each piece is laid out at: its largest. */
export function pieceSizes(g: HomeGeom) {
  return {
    band: { w: g.band.w || 1, h: g.band.h || 1 },
    mid: { w: g.body.w, h: Math.max(1, g.body.maxH - OPEN_R) },
    strip: { w: Math.max(1, g.body.w - 2 * OPEN_R + 2 * OVERLAP), h: OPEN_R },
    corner: OPEN_R,
    shoulder: SHOULDER_OPEN,
  };
}

/** The shape's outline at a state: the band (w, h), the body's top, width, middle height and corner, and the shoulders. */
export function outline(g: HomeGeom, s: ShapeState) {
  const out = isOut(s.phase);
  if (g.kind === "free") {
    const h = bodyHeight(g, s.bodyH);
    return { bw: 0, bh: 0, top: g.body.top, w: g.body.w, hm: Math.max(0, h - OPEN_R), r: OPEN_R, sTop: 0, sJoin: 0 };
  }
  if (out) {
    const h = bodyHeight(g, s.bodyH);
    // M70 step 4: grown from the small panel, the band never narrows while the body grows (a pinch at the neck). It keeps
    // the panel's width until the shape is open, then eases back to the notch and its wings (homeShape.css data-from).
    const bw = s.phase === "opening" && s.from ? Math.max(g.band.w, s.from.w) : g.band.w;
    return { bw, bh: g.band.h, top: g.band.h, w: g.body.w, hm: Math.max(0, h - OPEN_R), r: OPEN_R, sTop: SHOULDER_OPEN, sJoin: SHOULDER_OPEN };
  }
  // M70, collapsed on the small panel: the band keeps the row's height (only its width changes), and the panel below it is
  // the body, so the band's foot and the body's top never part while the two springs run (OPEN_W, then OPEN_H). Its
  // corner is the panel's, close to Home's own.
  if (s.from) {
    const w = s.from.w, row = g.band.h, r = Math.min(PANEL_R, Math.max(0, s.from.h - row), w / 2);
    return { bw: w, bh: row, top: row, w, hm: Math.max(0, s.from.h - row - r), r, sTop: 0, sJoin: 0 };
  }
  // Collapsed: exactly the island at rest, a little bigger under the pointer (the nudge).
  const w0 = g.rest.w + (s.hover ? NUDGE_W : 0), h0 = g.rest.h + (s.hover ? NUDGE_H : 0);
  const r = Math.min(REST_R, h0 / 2, w0 / 2);
  return { bw: w0, bh: h0 - r, top: h0 - r, w: w0, hm: 0, r, sTop: g.kind === "notch" ? SHOULDER_REST : 0, sJoin: 0 };
}

/** The transforms for a state. Width pieces and height pieces are separate elements (midY around midX, footY around the
 *  foot), so the width can run on OPEN_W and the height on OPEN_H, 60 ms later. */
export function shapeTransforms(g: HomeGeom, s: ShapeState): ShapeTransforms {
  const P = pieceSizes(g), o = outline(g, s), out = isOut(s.phase);
  const sc = (x: number, y: number) => `scale(${n(x)}, ${n(y)})`;
  const bandOn = g.kind !== "free";
  const ov = o.r >= OVERLAP && o.w - 2 * o.r > 0 ? OVERLAP : 0;
  return {
    band: bandOn ? `${t(-o.bw / 2, 0)} ${sc(o.bw / P.band.w, o.bh / P.band.h)}` : "scale(0)",
    midY: `${t(0, o.top)} ${sc(1, o.hm / P.mid.h)}`,
    midX: `${t(-o.w / 2, 0)} ${sc(o.w / P.mid.w, 1)}`,
    footY: t(0, o.top + o.hm),
    strip: `${t(-(o.w / 2 - o.r) - ov, 0)} ${sc(Math.max(0, o.w - 2 * o.r + 2 * ov) / P.strip.w, o.r / P.strip.h)}`,
    cornerL: `${t(-o.w / 2, 0)} scale(${n(o.r / P.corner)})`,
    cornerR: `${t(o.w / 2 - o.r, 0)} scale(${n(o.r / P.corner)})`,
    topL: `${t(-o.bw / 2 - o.sTop + Math.min(OVERLAP, o.sTop), 0)} scale(${n(o.sTop / P.shoulder)})`,
    topR: `${t(o.bw / 2 - Math.min(OVERLAP, o.sTop), 0)} scale(${n(o.sTop / P.shoulder)})`,
    joinL: `${t(-o.bw / 2 - o.sJoin + Math.min(OVERLAP, o.sJoin), o.bh - o.sJoin)} scale(${n(o.sJoin / P.shoulder)})`,
    joinR: `${t(o.bw / 2 - Math.min(OVERLAP, o.sJoin), o.bh - o.sJoin)} scale(${n(o.sJoin / P.shoulder)})`,
    // The content arrives from the top: a little higher and smaller, then in place.
    content: out ? "none" : "translateY(-6px) scale(.97)",
    contentOpacity: out ? 1 : 0,
  };
}

/** The shape's rects at a state, in the window's points (for tests and the shell's hit test: island.rs shape_rects must
 *  give the same): the band and the body, the body including its round foot. */
export function shapeRects(g: HomeGeom, s: ShapeState): { band: [number, number, number, number]; body: [number, number, number, number] } {
  const o = outline(g, s);
  return { band: [g.cx - o.bw / 2, 0, o.bw, o.bh], body: [g.cx - o.w / 2, o.top, o.w, o.hm + o.r] };
}
