// The control choice rule (the overhaul spec, 3.5), run over every setting in protocol/settings.json: the same kind of
// setting is always drawn by the same part, a choice of two or three is side by side and four or more is a menu, a visual
// choice is pictures, and no screen draws a bare select.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { REGISTRY } from "../../../protocol/settings.ts";
import { choiceControl, controlFor, SEGMENTED_MAX, VISUAL_CHOICES } from "./controlRule.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the control choice rule", () => {
  test("every setting gets exactly the part its kind says", () => {
    for (const d of REGISTRY.settings) {
      const c = controlFor(d);
      if (d.kind === "switch") expect(c, d.key).toBe("switch");
      if (d.kind === "number") expect(c, d.key).toBe("stepper");
      if (d.kind === "text") expect(c, d.key).toBe("field");
      if (d.kind === "list" || d.kind === "custom") expect(c, d.key).toBe("editor");
      if (d.kind === "choice") {
        const n = d.options?.length ?? 0;
        const want = VISUAL_CHOICES.includes(d.key) ? "pictures" : d.optionsFrom ? "menu" : n <= 3 ? "segmented" : "menu";
        expect(c, `${d.key} (${n} options)`).toBe(want);
      }
    }
  });
  test("two or three options are a Segmented control (explain.mode included), four or more a Menu", () => {
    expect(SEGMENTED_MAX).toBe(3);
    expect(choiceControl(2)).toBe("segmented");
    expect(choiceControl(3)).toBe("segmented");
    expect(choiceControl(4)).toBe("menu");
    expect(choiceControl(12)).toBe("menu");
    const explain = REGISTRY.settings.find((d) => d.key === "explain.mode");
    if (explain) expect(controlFor(explain)).toBe((explain.options?.length ?? 0) <= 3 ? "segmented" : "menu");
    // Both kinds really occur, so the rule is not empty.
    const kinds = new Set(REGISTRY.settings.filter((d) => d.kind === "choice").map((d) => controlFor(d)));
    expect([...kinds].sort()).toEqual(["menu", "pictures", "segmented"]);
  });
  test("the options really offered decide: a model row that offers fewer becomes side by side", () => {
    const many = REGISTRY.settings.find((d) => d.kind === "choice" && !VISUAL_CHOICES.includes(d.key) && !d.optionsFrom && (d.options?.length ?? 0) >= 4)!;
    expect(controlFor(many)).toBe("menu");
    expect(controlFor(many, 2)).toBe("segmented");
  });
  test("the water and how lively are chosen by looking, never from a list", () => {
    for (const k of VISUAL_CHOICES) {
      const d = REGISTRY.settings.find((x) => x.key === k);
      expect(d, k).toBeTruthy();
      expect(controlFor(d!), k).toBe("pictures");
    }
  });
  test("a choice that grows with the project (its own scripts) is a menu from the start", () => {
    for (const d of REGISTRY.settings.filter((x) => x.optionsFrom)) expect(controlFor(d), d.key).toBe("menu");
  });
  test("Settings draws every choice through the rule, and no part or Settings page uses a bare select", () => {
    const page = read("../settingsPage.tsx");
    const choice = page.slice(page.indexOf("function ChoiceControl("), page.indexOf("\n}\n", page.indexOf("function ChoiceControl(")));
    expect(choice).toContain("controlFor(d, options.length)");
    expect(page).not.toContain("<select");
    expect(read("./parts.tsx")).not.toContain("<select");
    // The voice speeds are a choice too, and follow the same rule.
    expect(page).toContain('choiceControl(speeds.length) === "segmented"');
  });
  test("no page anywhere draws a plain select or a native number box: a Menu and a Stepper instead (review, 31 Oct)", () => {
    // Home's History filter and the Watches form were the last ones; every page is read, not only Settings.
    const pages = readdirSync(new URL("../", import.meta.url).pathname).filter((f) => f.endsWith(".tsx"));
    expect(pages.length).toBeGreaterThan(10);
    for (const f of pages) {
      const src = read(`../${f}`);
      expect(src, f).not.toContain("<select");
      expect(src, f).not.toMatch(/type="number"/);
    }
  });
});
