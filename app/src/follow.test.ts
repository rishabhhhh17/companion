import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dropLook } from "./follow.ts";

describe("the drop that follows the pointer", () => {
  test("round when still or slow, stretched along the way it goes when fast", () => {
    expect(dropLook(0, 0)).toEqual({ angle: 0, sx: 1, sy: 1 });
    expect(dropLook(10, 10)).toEqual({ angle: 0, sx: 1, sy: 1 });
    const fast = dropLook(1200, 0);
    expect(fast.sy).toBeGreaterThan(1); expect(fast.sx).toBeLessThan(1);
    expect(fast.angle).toBeCloseTo(-90, 5);   // moving right: the pointed top turns to stream back to the left
    expect(dropLook(0, 900).angle).toBeCloseTo(0, 5);   // moving down: the point trails above
    expect(dropLook(NaN, 3)).toEqual({ angle: 0, sx: 1, sy: 1 });
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
