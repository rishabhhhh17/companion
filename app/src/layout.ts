// Lays a diagram out in layers from left to right, in plain code: the same every time, never overlapping, always inside
// the width it is given. The drawing (the overlay) only draws what this returns.
export type Diagram = {
  nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[];
  broken: { node: string; reason: string } | { edge: [string, string]; reason: string }; caption: string;
};
export type Placed = { id: string; label: string; x: number; y: number; w: number; h: number; broken: boolean };
export type PlacedEdge = { from: string; to: string; label?: string; points: [number, number][]; broken: boolean };
export type Laid = { nodes: Placed[]; edges: PlacedEdge[]; width: number; height: number };

const H = 46, GAP_Y = 20, GAP_X = 120;   // wide enough for an arrow and a few words above it

export function layoutDiagram(d: Diagram, maxWidth: number): Laid {
  // Layer = the longest path from a start, ignoring arrows that would make a loop.
  const layer = new Map<string, number>(d.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < d.nodes.length; pass++) {
    let moved = false;
    for (const e of d.edges) {
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0) && next < d.nodes.length) { layer.set(e.to, next); moved = true; }
    }
    if (!moved) break;
  }
  const layers = Math.max(...layer.values()) + 1;
  const w = Math.max(80, Math.min(170, Math.floor((maxWidth - GAP_X * (layers - 1)) / layers)));
  const gapX = layers > 1 ? Math.max(70, Math.min(GAP_X, Math.floor((maxWidth - w * layers) / (layers - 1)))) : GAP_X;
  const rows = new Map<number, number>();
  const placed: Placed[] = d.nodes.map((n) => {
    const l = layer.get(n.id) ?? 0, r = rows.get(l) ?? 0;
    rows.set(l, r + 1);
    return { id: n.id, label: n.label, x: l * (w + gapX), y: r * (H + GAP_Y), w, h: H, broken: "node" in d.broken && d.broken.node === n.id };
  });
  // Centre each layer's column of boxes on the tallest one, so arrows run level.
  const tallest = Math.max(...rows.values());
  for (const n of placed) { const count = rows.get(layer.get(n.id) ?? 0) ?? 1; n.y += ((tallest - count) * (H + GAP_Y)) / 2; }
  const at = (id: string) => placed.find((n) => n.id === id)!;
  const edges: PlacedEdge[] = d.edges.map((e) => {
    const [a, b] = [at(e.from), at(e.to)];
    const forward = a.x < b.x;
    const points: [number, number][] = forward ? [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]] : [[a.x + a.w / 2, a.y + a.h], [b.x + b.w / 2, b.y]];
    return { ...e, points, broken: "edge" in d.broken && d.broken.edge[0] === e.from && d.broken.edge[1] === e.to };
  });
  return { nodes: placed, edges, width: layers * w + (layers - 1) * gapX, height: tallest * H + (tallest - 1) * GAP_Y };
}

/** A label cut to fit inside a box `w` wide at font size `size` (bold hand writing is about 0.55 of the size per letter). */
export function fitLabel(label: string, w: number, size: number): string {
  const max = Math.max(4, Math.floor((w - 14) / (size * 0.55)));
  return label.length <= max ? label : label.slice(0, max - 1).trimEnd() + "…";
}

/** Words wrapped into lines of at most `max` letters; anything past `lines` is cut with an ellipsis. */
export function wrapLines(text: string, max: number, lines: number): string[] {
  const out: string[] = []; let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length > max ? word.slice(0, max - 1) + "…" : word;
    if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) { const kept = out.slice(0, lines); kept[lines - 1] = kept[lines - 1].replace(/…?$/, "") + "…"; return kept; }
  return out;
}

// ---------- M86, Label it: labels on leader lines that never overlap ----------
// Each label sits beside its point with a thin line back to a small dot. The rule (research visuals.md, after OpenClicky's
// draw stage): a label takes the first side that fits on the screen (right, then left, below, above); one that would land
// on another label, or cover another label's point, moves the least it can, up or down before sideways, and the earlier
// labels keep their places, so the order holds. Pure and deterministic, so the same answer always looks the same.

export type LabelSide = "right" | "left" | "below" | "above";
/** dot: where the small dot sits (the labelled thing's edge on the label's side when its box is known, else its point). */
export type PlacedLabel = { x: number; y: number; w: number; h: number; side: LabelSide; dot: [number, number]; line: [[number, number], [number, number]] };
type Box = { x: number; y: number; w: number; h: number };
/** A labelled thing: its point, and its own box when the engine gave one (labels.rs checked it is around the point). */
export type LabelTarget = { x: number; y: number; box?: Box };

const LABEL_GAP = 28, LABEL_MARGIN = 8, DOT_R = 6, NUDGE = 6, MAX_LABEL_W = 260;
/** A thing's box bigger than this share of the screen (a whole panel) is not kept clear: there would be no room left. */
const MAX_OBSTACLE_SHARE = 0.25;
const SIDE_COST: Record<LabelSide, number> = { right: 0, left: 60, below: 90, above: 90 };
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The room a label's words take at the overlay's sizes: the label in bold 14, an optional note in 12 on up to 3 lines. */
export function labelSize(label: string, note?: string): { w: number; h: number } {
  const lw = Array.from(label).length * 8.2 + 26;
  const nw = note ? Math.min(Array.from(note).length, 34) * 6.4 + 26 : 0;
  const w = Math.round(Math.min(MAX_LABEL_W, Math.max(64, lw, nw)));
  const lines = note ? Math.min(3, Math.ceil((Array.from(note).length * 6.4) / (w - 26))) : 0;
  return { w, h: 30 + lines * 16 };
}

/** The nudges, cheapest first: moving up or down costs its distance, moving sideways twice that; down before up on a tie,
 *  so a later label goes under an earlier one. Kept per screen size. */
const nudgesFor = (() => {
  const memo = new Map<string, [number, number][]>();
  return (W: number, H: number): [number, number][] => {
    const key = `${W}x${H}`;
    const got = memo.get(key);
    if (got) return got;
    const out: [number, number][] = [];
    for (let dx = -Math.ceil(W / NUDGE); dx <= Math.ceil(W / NUDGE); dx++) for (let dy = -Math.ceil(H / NUDGE); dy <= Math.ceil(H / NUDGE); dy++) out.push([dx * NUDGE, dy * NUDGE]);
    const cost = ([dx, dy]: [number, number]) => Math.abs(dy) + 2 * Math.abs(dx);
    out.sort((a, b) => cost(a) - cost(b) || Math.abs(a[0]) - Math.abs(b[0]) || b[1] - a[1] || a[0] - b[0]);
    memo.set(key, out);
    return out;
  };
})();

/** The display the labels are for, as the shell sends it (it resizes the overlay to that display in the same tick, so the
 *  page's own size may still be the old display's); the page's own size only when the shell sent none. */
export function labelBounds(p: { w?: unknown; h?: unknown }, fallback: { w: number; h: number }): { w: number; h: number } {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  return ok(p.w) && ok(p.h) ? { w: p.w, h: p.h } : fallback;
}

/** Where each label goes, in the order given, for things on a screen `bounds` big. No label covers another label, another
 *  label's dot, or any labelled thing's own box: the dot sits on the thing's edge and the label past it, so the words and
 *  the value they are about both stay readable. */
export function placeLabels(points: LabelTarget[], sizes: { w: number; h: number }[], bounds: { w: number; h: number }): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const dots: Box[] = points.map((p) => ({ x: p.x - DOT_R, y: p.y - DOT_R, w: DOT_R * 2, h: DOT_R * 2 }));
  const things: Box[] = points.flatMap((p) => (p.box && p.box.w * p.box.h <= bounds.w * bounds.h * MAX_OBSTACLE_SHARE ? [{ x: p.box.x - 2, y: p.box.y - 2, w: p.box.w + 4, h: p.box.h + 4 }] : []));
  const nudges = nudgesFor(bounds.w, bounds.h);
  points.forEach((p, i) => {
    const w = Math.min(sizes[i]?.w ?? 120, bounds.w - LABEL_MARGIN * 2), h = Math.min(sizes[i]?.h ?? 30, bounds.h - LABEL_MARGIN * 2);
    const onScreen = (b: Box) => b.x >= LABEL_MARGIN && b.y >= LABEL_MARGIN && b.x + b.w <= bounds.w - LABEL_MARGIN && b.y + b.h <= bounds.h - LABEL_MARGIN;
    const placedDots = placed.map((o) => ({ x: o.dot[0] - DOT_R, y: o.dot[1] - DOT_R, w: DOT_R * 2, h: DOT_R * 2 }));
    const freeOf = (keepThings: boolean) => (b: Box) => onScreen(b) && !placed.some((o) => hits(o, b)) && !dots.some((d) => hits(d, b)) && !placedDots.some((d) => hits(d, b)) && (!keepThings || !things.some((t) => hits(t, b)));
    const t = p.box ?? { x: p.x, y: p.y, w: 0, h: 0 };
    const my = clampN(p.y, t.y, t.y + t.h), mx = clampN(p.x, t.x, t.x + t.w);
    const edge: Record<LabelSide, [number, number]> = { right: [t.x + t.w, my], left: [t.x, my], below: [mx, t.y + t.h], above: [mx, t.y] };
    const sides: [LabelSide, Box][] = [
      ["right", { x: edge.right[0] + LABEL_GAP, y: edge.right[1] - h / 2, w, h }], ["left", { x: edge.left[0] - LABEL_GAP - w, y: edge.left[1] - h / 2, w, h }],
      ["below", { x: edge.below[0] - w / 2, y: edge.below[1] + LABEL_GAP, w, h }], ["above", { x: edge.above[0] - w / 2, y: edge.above[1] - LABEL_GAP - h, w, h }],
    ];
    const fitting = sides.filter(([, b]) => onScreen(b));
    // No side fits as it is (a point in a corner, a very wide label): the right one, pulled onto the screen.
    const bases: [LabelSide, Box][] = fitting.length ? fitting : [["right", { ...sides[0][1], x: Math.min(bounds.w - LABEL_MARGIN - w, Math.max(LABEL_MARGIN, sides[0][1].x)), y: Math.min(bounds.h - LABEL_MARGIN - h, Math.max(LABEL_MARGIN, sides[0][1].y)) }]];
    let best: { side: LabelSide; box: Box; cost: number } | null = null;
    // First keeping every labelled thing clear; only when there is no room at all, over the things (never over a label).
    for (const keepThings of [true, false]) {
      const free = freeOf(keepThings);
      for (const [side, b] of bases) {
        if (best && SIDE_COST[side] >= best.cost) continue;
        for (const [dx, dy] of nudges) {
          const cost = SIDE_COST[side] + Math.abs(dy) + 2 * Math.abs(dx);
          if (best && cost >= best.cost) break;
          const c = { x: b.x + dx, y: b.y + dy, w, h };
          if (free(c)) { best = { side, box: c, cost }; break; }
        }
      }
      if (best) break;
    }
    const box = best?.box ?? bases[0][1];
    const side = best?.side ?? bases[0][0];
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const dot: [number, number] = [edge[side][0], edge[side][1]];
    const end: [number, number] = [r1(clampN(dot[0], box.x, box.x + box.w)), r1(clampN(dot[1], box.y, box.y + box.h))];
    placed.push({ x: r1(box.x), y: r1(box.y), w, h, side, dot, line: [dot, end] });
  });
  return placed;
}
