import { describe, expect, test } from "bun:test";
import { REGISTRY } from "../../protocol/settings.ts";
import { MAIN, levelSections } from "./settingsLevel.ts";
import { searchSettings } from "./settingsRows.ts";

describe("Settings in two levels (M28)", () => {
  const visible = REGISTRY.settings.filter((d) => !d.hidden).map((d) => d.key);
  test("the main Settings is about 25 choices, every one a real setting", () => {
    expect(MAIN.size).toBeGreaterThanOrEqual(20);
    expect(MAIN.size).toBeLessThanOrEqual(30);
    for (const k of MAIN) expect(visible, k).toContain(k);
  });
  test("nothing is lost: every visible setting is in exactly one level", () => {
    const all = searchSettings("").sections;
    const main = levelSections(all, false).flatMap((s) => s.keys), adv = levelSections(all, true).flatMap((s) => s.keys);
    expect([...main, ...adv].sort()).toEqual(all.flatMap((s) => s.keys).sort());
    for (const k of main) expect(adv).not.toContain(k);
  });
  test("a section with nothing left at a level is not shown at that level", () => {
    for (const s of levelSections(searchSettings("").sections, false)) expect(s.keys.length).toBeGreaterThan(0);
  });
});
