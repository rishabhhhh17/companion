// The diagram is laid out by plain code, so it looks the same every time and can be tested without a screen.
import { describe, expect, test } from "bun:test";
import { layoutDiagram, type Diagram } from "./layout.ts";

const d = (nodes: string[], edges: [string, string][], broken: Diagram["broken"]): Diagram => ({ nodes: nodes.map((id) => ({ id, label: id })), edges: edges.map(([from, to]) => ({ from, to })), broken, caption: "c" });

describe("laying out a diagram", () => {
  test("a chain runs left to right in order", () => {
    const l = layoutDiagram(d(["page", "api", "db"], [["page", "api"], ["api", "db"]], { edge: ["page", "api"], reason: "r" }), 800);
    const x = (id: string) => l.nodes.find((n) => n.id === id)!.x;
    expect(x("page")).toBeLessThan(x("api")); expect(x("api")).toBeLessThan(x("db"));
    expect(l.edges.every((e) => e.points.length === 2)).toBe(true);
  });
  test("boxes never overlap, and everything fits the width", () => {
    const l = layoutDiagram(d(["a", "b", "c", "d", "e", "f"], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["d", "e"], ["d", "f"]], { node: "d", reason: "r" }), 640);
    for (const n of l.nodes) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x + n.w).toBeLessThanOrEqual(640); }
    for (const a of l.nodes) for (const b of l.nodes) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    expect(l.width).toBeLessThanOrEqual(640);
  });
  test("a loop does not hang or lose boxes", () => {
    const l = layoutDiagram(d(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]], { node: "b", reason: "r" }), 800);
    expect(l.nodes).toHaveLength(3);
  });
  test("the broken box or arrow is flagged", () => {
    const l = layoutDiagram(d(["a", "b", "c"], [["a", "b"], ["b", "c"]], { edge: ["b", "c"], reason: "r" }), 800);
    expect(l.edges.map((e) => e.broken)).toEqual([false, true]);
    expect(l.nodes.every((n) => !n.broken)).toBe(true);
    expect(layoutDiagram(d(["a", "b"], [["a", "b"]], { node: "b", reason: "r" }), 800).nodes.map((n) => n.broken)).toEqual([false, true]);
  });
  test("the same every time", () => {
    const x = d(["a", "b", "c"], [["a", "b"], ["a", "c"]], { node: "c", reason: "r" });
    expect(layoutDiagram(x, 800)).toEqual(layoutDiagram(x, 800));
  });
});
