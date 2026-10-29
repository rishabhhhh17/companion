import { describe, expect, test } from "bun:test";
import { BOARD, MAX_SHAPES, cleanPath, parseSketch, sketchRequest } from "../src/sketch.ts";

// M33: a drawn picture is data in a tiny drawing language, checked hard, never free SVG.
const good = JSON.stringify({
  title: "Between Sun and Moon", caption: "A sun and a moon on either side.",
  shapes: [
    { k: "circle", x: 80, y: 150, r: 40, fill: "yellow", stroke: "orange", w: 3 },
    { k: "path", d: "M 300 120 C 260 160 260 220 320 240 C 280 230 270 160 300 120 Z", fill: "blue" },
    { k: "text", x: 200, y: 40, s: "Day and night", size: 18 },
  ],
});

describe("drawn pictures (M33)", () => {
  test("a good answer becomes a checked picture", () => {
    const s = parseSketch(`here you go ${good} thanks`)!;
    expect(s.title).toBe("Between Sun and Moon");
    expect(s.shapes.map((x) => x.k)).toEqual(["circle", "path", "text"]);
    expect(s.shapes[0]).toMatchObject({ fill: "yellow", stroke: "orange", w: 3 });
  });
  test("unknown shapes and colours are dropped or made safe", () => {
    const s = parseSketch(JSON.stringify({ title: "T", caption: "", shapes: [
      { k: "script", src: "x" }, { k: "image", href: "http://x" },
      { k: "circle", x: 10, y: 10, r: 5, fill: "url(#evil)", stroke: "javascript:1" },
      { k: "circle", x: 20, y: 20, r: 5 }, { k: "circle", x: 30, y: 30, r: 5 },
    ] }))!;
    expect(s.shapes.length).toBe(3);
    expect(s.shapes[0]).toMatchObject({ fill: "none", stroke: "ink" });
  });
  test("numbers stay on the board", () => {
    const s = parseSketch(JSON.stringify({ title: "T", caption: "", shapes: [{ k: "circle", x: 9999, y: -50, r: 5 }, { k: "line", x1: 0, y1: 0, x2: 1e9, y2: 3 }, { k: "rect", x: 1, y: 1, width: 50, height: 9999 }] }))!;
    expect(s.shapes[0]).toMatchObject({ x: BOARD.w, y: 0 });
    expect(s.shapes[1]).toMatchObject({ x2: BOARD.w });
    expect(s.shapes[2]).toMatchObject({ height: BOARD.h });
  });
  test("a path may hold only drawing commands and numbers", () => {
    expect(cleanPath("M 1 2 L 3 4 Z")).toBe("M 1 2 L 3 4 Z");
    expect(cleanPath("M1,2 C3,4 5,6 7,8")).toBe("M1,2 C3,4 5,6 7,8");
    for (const bad of ["<script>", "M 1 2 url(x)", "L 1 2", "M 1 2 A 3 3 0 0 1 4 4", "M 99999 1", "M" + " 1".repeat(500)]) expect(cleanPath(bad), bad).toBeNull();
  });
  test("labels are plain words, never markup", () => {
    const s = parseSketch(JSON.stringify({ title: "<b>Hi</b>", caption: "a <img src=x> b", shapes: [{ k: "text", x: 1, y: 1, s: "<script>x</script>ok" }, { k: "circle", x: 1, y: 1, r: 1 }, { k: "circle", x: 1, y: 1, r: 1 }] }))!;
    expect(s.title).toBe("Hi");
    expect(s.caption).not.toContain("<");
    expect((s.shapes[0] as { s: string }).s).not.toContain("<");
  });
  test("too little to show, or no title, is no picture; too many shapes are cut", () => {
    expect(parseSketch(JSON.stringify({ title: "", shapes: [{ k: "circle", x: 1, y: 1, r: 1 }] }))).toBeNull();
    expect(parseSketch("not json")).toBeNull();
    const many = parseSketch(JSON.stringify({ title: "Lots", caption: "", shapes: Array.from({ length: 200 }, (_, i) => ({ k: "circle", x: i, y: 1, r: 1 })) }))!;
    expect(many.shapes.length).toBe(MAX_SHAPES);
  });
  test("the request carries only the question", () => {
    expect(sketchRequest("draw a sun")).toContain("Draw: draw a sun");
  });
});
