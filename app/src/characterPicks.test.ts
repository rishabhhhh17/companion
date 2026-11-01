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
  test("the cards are a radio group with arrow keys, and show Flowflow's drop in each colour", () => {
    const src = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const picks = src.slice(src.indexOf("function WaterSwatches("), src.indexOf("function CompanionHero("));
    // The Picture choice part (ui/parts.tsx): a radio group whose arrows move the choice (ui/partsLogic.ts moveIndex).
    expect(picks).toContain("<PictureChoice labelledBy={labelId}");
    const parts = readFileSync(new URL("./ui/parts.tsx", import.meta.url), "utf8");
    const pc = parts.slice(parts.indexOf("export function PictureChoice"), parts.indexOf("// ---------- Home and the notch"));
    expect(pc).toContain('role="radiogroup"');
    expect(pc).toContain('role="radio"');
    expect(pc).toContain("moveIndex(e.key, at, options.length)");
    expect(readFileSync(new URL("./ui/partsLogic.ts", import.meta.url), "utf8")).toContain("ArrowRight");
    // 1 Nov 2026: Flowflow as the drop seen in Home, drawn still in each water (waterDrop.tsx), never the old picture art.
    expect(picks).toContain("<WaterDrop water={w}");
    expect(picks).not.toContain('pose="look"');
  });
  test("a productivity tool, never a friend (rule 16)", () => {
    expect(JSON.stringify([S.short, S.pages, S.waterPicks])).not.toMatch(/\bfriend/i);
    expect(Object.values(S.waterPicks).join(" ")).not.toMatch(/\b(friend|love|buddy)/i);
  });
});
