import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { WATERS } from "./lookfeel.ts";
import { S } from "./strings.ts";

// M35: Settings picks the character as cards, one per water, each with a name and one line (the founder, 29 Oct 2026).
describe("character picks (M35)", () => {
  test("every water has a name and one short line", () => {
    for (const w of WATERS) {
      expect(S.set["look.water"].options?.[w], w).toBeTruthy();
      expect(S.waterPicks[w], w).toBeTruthy();
      expect(S.waterPicks[w].split(" ").length, w).toBeLessThanOrEqual(6);
    }
  });
  test("the cards are a radio group with arrow keys, and show the live water in each colour", () => {
    const src = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const picks = src.slice(src.indexOf("function WaterSwatches("), src.indexOf("function CompanionHero("));
    expect(picks).toContain('role="radiogroup"');
    expect(picks).toContain('role="radio"');
    expect(picks).toContain("ArrowRight");
    expect(picks).toContain("<FlowMini");
    expect(picks).toContain("water={w}");
    expect(picks).toContain("still");
  });
  test("a productivity tool, never a friend (rule 16)", () => {
    expect(JSON.stringify([S.short, S.pages, S.waterPicks])).not.toMatch(/\bfriend/i);
    expect(Object.values(S.waterPicks).join(" ")).not.toMatch(/\b(friend|love|buddy)/i);
  });
});
