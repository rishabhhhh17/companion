// Look and feel (lookfeel.ts): the waters, the themes, how lively, the size.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyLook, flowColours, hueTurn, livelyOf, livelySettings, sizeOf, SIZE_SCALE, themeOf, waterOf, waterVars, WATERS, WATER_TINTS } from "./lookfeel.ts";

const lum = (hex: string) => { const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)); return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const reg = JSON.parse(readFileSync(new URL("../../protocol/settings.json", import.meta.url), "utf8")) as { settings: { key: string; default: unknown; options?: string[] }[] };
const def = (k: string) => reg.settings.find((s) => s.key === k);

describe("the water's colour", () => {
  test("ocean is today's water and the usual; anything odd is ocean", () => {
    expect(WATER_TINTS.ocean.mid).toBe("#59D2FF");
    expect(WATER_TINTS.ocean.sea).toBe("#04182A");
    expect(waterOf("berry")).toBe("berry"); expect(waterOf("nope")).toBe("ocean"); expect(waterOf(undefined)).toBe("ocean");
    expect(def("look.water")).toMatchObject({ default: "ocean", options: [...WATERS] });
    expect(hueTurn("ocean")).toBe(0);
  });
  test("every water's line and drop stand out on its own sea and on black, and white words read on its sea", () => {
    for (const w of WATERS) {
      const t = WATER_TINTS[w];
      expect(ratio(t.mid, t.sea), `${w} line on its sea`).toBeGreaterThanOrEqual(3);
      expect(ratio(t.mid, "#000000"), `${w} line on black`).toBeGreaterThanOrEqual(3);
      expect(ratio("#FFFFFF", t.sea), `${w} words under water`).toBeGreaterThanOrEqual(4.5);
      expect(ratio("#FFFFFF", t.seaDeep), `${w} words deep down`).toBeGreaterThanOrEqual(4.5);
    }
  });
  test("a water never takes a safety mark's colour (amber waiting, red refusal) or the lime of the main button", () => {
    for (const w of WATERS) for (const c of Object.values(WATER_TINTS[w]).filter((x) => typeof x === "string")) expect(["#FFB020", "#FF7A6E", "#C0392B", "#C6F432"]).not.toContain(String(c).toUpperCase());
  });
  test("the live water is drawn in today's colours for ocean, and in the water's own for the others", () => {
    expect(flowColours("ocean")).toEqual({ light: "#6fe3ff", deep: "#1d72d8" });
    expect(readFileSync(new URL("./flowflow/renderer.ts", import.meta.url), "utf8")).toContain('const AQUA = new Color("#6fe3ff"), OCEAN = new Color("#1d72d8");');
    expect(flowColours("berry")).toEqual({ light: WATER_TINTS.berry.mid, deep: WATER_TINTS.berry.deep });
  });
  test("the page gets the water as custom properties and the theme as data-theme", () => {
    const set: Record<string, string> = {}, attrs: Record<string, string> = {};
    applyLook({ style: { setProperty: (k, v) => { set[k] = v; } }, setAttribute: (k, v) => { attrs[k] = v; } }, "lagoon", "deep");
    expect(set).toEqual(waterVars("lagoon"));
    expect(set["--water"]).toBe(WATER_TINTS.lagoon.mid);
    expect(attrs["data-theme"]).toBe("deep");
  });
});

describe("Home's theme", () => {
  test("night is the usual; deep sea and paper are the others", () => {
    expect(themeOf("paper")).toBe("paper"); expect(themeOf(3)).toBe("night");
    expect(def("look.theme")).toMatchObject({ default: "night", options: ["night", "deep", "paper"] });
  });
  test("paper keeps every word readable (its tokens in style.css)", () => {
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    const block = /:root\.home-page\[data-theme="paper"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const tok = (n: string) => new RegExp(`--${n}: (#[0-9A-Fa-f]{6})`).exec(block)?.[1] ?? "";
    expect(block).not.toBe("");
    expect(ratio(tok("fg"), tok("bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tok("muted"), tok("bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tok("fg"), tok("card"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tok("key-ink"), tok("key"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("how lively, in one control", () => {
  test("reads what is in force and writes the two settings it stands for", () => {
    expect(livelyOf(true, "followMac")).toBe("lively");
    expect(livelyOf(false, "followMac")).toBe("calm");
    expect(livelyOf(true, "less")).toBe("still");
    expect(livelySettings("lively")).toEqual([["fun.reactions", true], ["character.motion", "followMac"]]);
    expect(livelySettings("calm")).toEqual([["fun.reactions", false], ["character.motion", "followMac"]]);
    expect(livelySettings("still")).toEqual([["fun.reactions", false], ["character.motion", "less"]]);
    for (const l of ["lively", "calm", "still"] as const) { const [[, r], [, m]] = livelySettings(l); expect(livelyOf(r, m)).toBe(l); }
  });
});

describe("the character's size", () => {
  test("usual is today's; large still fits the 160 point window with room for the water to wobble", () => {
    expect(SIZE_SCALE.usual).toBe(1); expect(sizeOf("huge")).toBe("usual");
    expect(def("look.size")).toMatchObject({ default: "usual", options: ["small", "usual", "large"] });
    // The live water's canvas is 156 points wide at the usual size (style.css .character .flow); large stays inside 180.
    expect(156 * SIZE_SCALE.large).toBeLessThanOrEqual(180);
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    expect(main).toContain("const DOCK: (f64, f64) = (160.0, 160.0);");
  });
});
