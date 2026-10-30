import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { RING_FRAGMENT, rgb, ringStretch } from "./follow.ts";

describe("the water ring around the pointer (M37)", () => {
  test("it keeps its ring shape: no stretch when slow, a gentle one along the way it moves when fast, never more than a third", () => {
    expect(ringStretch(0, 0)).toEqual({ x: 0, y: 0 });
    expect(ringStretch(40, 10)).toEqual({ x: 0, y: 0 });
    const fast = ringStretch(1100, 0);
    expect(fast.x).toBeCloseTo(1100 / 4000, 5); expect(fast.y).toBeCloseTo(0, 5);
    expect(Math.hypot(ringStretch(9000, 9000).x, ringStretch(9000, 9000).y)).toBeCloseTo(0.35, 5);
    expect(ringStretch(0, 1100).y).toBeLessThan(0);   // the page's y points up
    expect(ringStretch(NaN, 3)).toEqual({ x: 0, y: 0 });
  });
  test("water colours become numbers the shader takes", () => {
    expect(rgb("#FF0080")).toEqual([1, 0, 128 / 255]);
    expect(rgb("nope")).toEqual([0.35, 0.82, 1]);
  });
  test("it is a ring centred on the pointer, drawn live, calm with Reduce motion", () => {
    const page = readFileSync(new URL("./follow.ts", import.meta.url), "utf8");
    expect(RING_FRAGMENT).toContain("sdTorus");
    expect(page).toContain("const calm = still();");
    // Battery: every refresh only while it moves; at rest a slower timer.
    expect(page).toContain("window.setTimeout(() => frame(performance.now()), RESTING_FRAME_MS)");
    const html = readFileSync(new URL("../follow.html", import.meta.url), "utf8");
    expect(html).toContain('<canvas class="ring" id="d"');
    expect(html).not.toMatch(/\.(png|jpe?g|gif|svg)\b/);
  });
  test("its page only listens, in the water's colours, and is built with the others", () => {
    const page = readFileSync(new URL("./follow.ts", import.meta.url), "utf8");
    expect(page).not.toContain("invoke(");
    expect(page).toContain('listen("follow-move"');
    expect(page).toContain("WATER_TINTS[waterOf(p.water)]");
    expect(readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8")).toContain('follow: resolve(__dirname, "follow.html")');
    const cap = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/overlay.json", import.meta.url), "utf8"));
    expect(cap.windows).toContain("follow");
    expect(cap.permissions).toEqual(["core:event:allow-listen", "core:event:allow-unlisten"]);
  });
});
