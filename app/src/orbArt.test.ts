import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { POSES } from "./characters.ts";
import { WATERS, flowColours } from "./lookfeel.ts";
import { BUBBLE_R, POSE_ART, POSE_CANVAS, R, REST_ANGLE, extents, paletteFrom, paletteOf, poseSvg, waterSvg } from "./orbArt.ts";
import { FOLLOWER_RADII } from "./flowflow/particles.ts";
import { ORB_RADIUS } from "./flowflow/engine.ts";

// M60 (2 Nov 2026): Flowflow is the Orb with Fizz's trailing bubbles, in every still picture as in the live water.
describe("the orb's still pictures (M60)", () => {
  test("every pose has a picture", () => {
    for (const p of POSES) expect(POSE_ART[p], p).toBeTruthy();
  });

  test("its outline stays round in every pose: one circle for the body, no point, no flat bottom, no surface to sit on", () => {
    for (const p of POSES) {
      const svg = poseSvg(p);
      expect(svg.match(/class="orb"/g)?.length, p).toBe(1);
      expect(svg, p).toMatch(new RegExp(`<circle class="orb" r="${R}"`));
      // The old drop was a path; nothing in the picture is a ground line or a pool under it.
      expect(svg, p).not.toMatch(/wd-|pool|class="line"/);
    }
  });

  test("a face of two marks and no mouth, in every pose", () => {
    for (const p of POSES) expect(poseSvg(p).match(/class="eye"/g)?.length, p).toBe(2);
    expect(POSE_ART.look.eyes).toBe("arc");   // at rest: two soft closed arcs
  });

  test("two bubbles follow it, the second smaller, the same size as the live water's", () => {
    for (const p of POSES) {
      const [a, b] = POSE_ART[p].bubbles;
      expect(a.r, p).toBeGreaterThan(b.r);
      // Done shows the second one popping: a broken ring and its drops where it was.
      expect(poseSvg(p).match(/class="bubble( pop)?"/g)?.length, p).toBe(2);
      expect(poseSvg(p).includes('class="bubble pop"'), p).toBe(p === "splash");
    }
    expect(BUBBLE_R[0] / R).toBeCloseTo(FOLLOWER_RADII[0] / ORB_RADIUS, 2);
    expect(BUBBLE_R[1] / R).toBeCloseTo(FOLLOWER_RADII[1] / ORB_RADIUS, 2);
  });

  test("at rest they trail below and behind it in a gentle arc, never a straight diagonal (a thought bubble)", () => {
    const [a, b] = POSE_ART.look.bubbles;
    expect(a.y).toBeGreaterThan(0); expect(b.y).toBeGreaterThan(0);   // below its middle (y runs down)
    expect(a.x).toBeLessThan(0);                                      // and behind it
    // The turn from (orb to first) to (first to second) is a real bend, well away from a straight line.
    const turn = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(a.y, a.x)) * 180 / Math.PI;
    expect(Math.min(turn, 360 - turn)).toBeGreaterThan(45);
    expect(REST_ANGLE).toBeGreaterThan(90); expect(REST_ANGLE).toBeLessThan(180);
    // And no pose puts a bubble above its head in a rising chain.
    for (const p of POSES) for (const x of POSE_ART[p].bubbles) expect(x.y > -R || Math.abs(x.x) > R * 0.9, p).toBe(true);
  });

  test("the bubbles never melt into the orb: each is clear of its rim unless it passes in front", () => {
    for (const p of POSES) for (const x of POSE_ART[p].bubbles) {
      if (x.front) continue;
      expect(Math.hypot(x.x, x.y) - x.r, p).toBeGreaterThanOrEqual(R);
    }
  });

  test("the orb sits in the same place in every pose and everything stays on the canvas", () => {
    const c = POSE_CANVAS;
    for (const p of POSES) {
      const e = extents(POSE_ART[p]);
      expect(c.cx + e.minX * c.scale, p).toBeGreaterThanOrEqual(2);
      expect(c.cx + e.maxX * c.scale, p).toBeLessThanOrEqual(c.w - 2);
      expect(c.cy + e.minY * c.scale, p).toBeGreaterThanOrEqual(2);
      expect(c.cy + e.maxY * c.scale, p).toBeLessThanOrEqual(c.h - 2);
      expect(poseSvg(p), p).toContain(`translate(${c.cx} ${c.cy}) scale(${c.scale})`);
    }
    expect([c.w, c.h]).toEqual([351, 249]);   // the size the app's pictures always were (characters.test.ts)
  });

  test("never a safety colour in a picture: they are turned to the chosen water, and amber or green must not turn", () => {
    for (const p of POSES) expect(poseSvg(p), p).not.toMatch(/#FFB0|#FFB2|#3DDC|amber|green/i);
  });

  test("its colours are the water's, worked out as the live glass is (deep darker, mid between, hi toward white)", () => {
    expect(paletteFrom("#000000", "#646464")).toEqual({ deep: "#4E4E4E", mid: "#3A3A3A", hi: "#999999", ink: "#040F24" });
    const seen = new Set<string>();
    for (const w of WATERS) {
      const p = paletteOf(w), c = flowColours(w);
      expect(p).toEqual(paletteFrom(c.light, c.deep));
      expect(waterSvg(w), w).toContain(p.mid);
      seen.add(p.mid);
    }
    expect(seen.size).toBe(WATERS.length);
  });

  test("every place that shows a pose picture turns it to the chosen water, the soft water drawn over it included", () => {
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = /([^{}]*)\{\s*filter:\s*hue-rotate\(var\(--water-turn/.exec(css);
    expect(rule).toBeTruthy();
    const sels = rule![1].split(",").map((x) => x.trim());
    // The desktop and Home pictures and their soft water (src/flow/), the notch's wing and list, the practice peek, Settings.
    for (const s of [".pose", ".home-pose", ".character .flow", ".home-flow", ".island-flow", ".ip-agent", ".pr-char", ".pic-flow"]) expect(sels, s).toContain(s);
    // The live water takes its colour from Settings, so it is never turned twice.
    expect(css).toMatch(/\.ff-mini \{[^}]*filter: none/);
  });

  test("the pose pictures are made from this geometry by a script, never drawn by hand", () => {
    const script = readFileSync(new URL("../scripts/make-orb-poses.ts", import.meta.url), "utf8");
    expect(script).toContain("poseSvg(");
    expect(script).toContain("POSES");
  });
});
