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
