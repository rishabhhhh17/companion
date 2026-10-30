// Look and feel (lookfeel.ts): the waters, the themes, how lively, the size.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyLook, flowColours, hueTurn, livelinessOf, LIVELINESS, sizeOf, SIZE_SCALE, themeOf, waterOf, waterVars, WATERS, WATER_TINTS } from "./lookfeel.ts";

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

describe("how lively (M46, F28): Still, Gentle or Lively, one key of its own", () => {
  test("the registry has its own key, Still by default, the three choices in order, and no mapping from the old ones", () => {
    expect(def("character.lively")).toMatchObject({ default: "still", options: ["still", "gentle", "lively"], kind: "choice", live: true });
    expect((def("character.lively") as { from?: unknown }).from).toBeUndefined();
    expect(LIVELINESS).toEqual(["still", "gentle", "lively"]);
  });
  test("anything that is not one of the three reads as Still, the usual: nothing old turns motion on", () => {
    for (const v of ["still", "gentle", "lively"] as const) expect(livelinessOf(v)).toBe(v);
    for (const bad of [null, undefined, "", "calm", "Lively", true, false, 1, {}, "less", "followMac"]) expect(livelinessOf(bad)).toBe("still");
  });
  test("the old two setting mapping is gone, and Less motion and reactions keep their own keys", () => {
    const src = readFileSync(new URL("./lookfeel.ts", import.meta.url), "utf8");
    expect(src).not.toContain("livelyOf");
    expect(src).not.toContain("livelySettings");
    expect(def("character.motion")).toMatchObject({ default: "followMac" });
    expect(def("fun.reactions")).toMatchObject({ default: true });
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

// M46 (F28): where How lively shows, and its words.
import { PAGES, PAGE_KEYS } from "./settingsPages.ts";
import { MAIN } from "./settingsLevel.ts";
import { S } from "./strings.ts";
describe("How lively in Settings (M46)", () => {
  test("it sits on the Flowflow page next to Follow my pointer, with Rest in Low Power Mode; Less motion and reactions stay under Advanced", () => {
    const keys = PAGES.character.keys;
    expect(keys).toContain("character.lively"); expect(keys).toContain("character.restLowPower");
    expect(Math.abs(keys.indexOf("character.lively") - keys.indexOf("character.follow"))).toBe(1);
    expect(MAIN.has("fun.reactions")).toBe(false); expect(MAIN.has("character.motion")).toBe(false);
    expect(def("character.restLowPower")).toMatchObject({ default: true, kind: "switch" });
    expect(def("point.fly")).toMatchObject({ default: false, kind: "switch" });
  });
  test("its words: a label, help, a short line and all three choices, plain, with no dash", () => {
    const w = S.set["character.lively"] as { label: string; help: string; options: Record<string, string> };
    expect(w.label).toBe("How lively");
    expect(Object.keys(w.options)).toEqual(["still", "gentle", "lively"]);
    expect(S.short["character.lively"]).toBe("Still unless it has news. Gentle sways a little. Lively follows your pointer.");
    for (const t of [w.label, w.help, S.short["character.lively"], ...Object.values(w.options), S.set["character.restLowPower"].help, S.set["point.fly"].help, S.set["character.follow"].help]) expect(t).not.toMatch(/[–—]/);
    expect(S.set["character.live"].help).not.toContain("eyes that follow your pointer");
    expect(S.set["calls.quiet"].help).toContain("The notch does not open by itself during a call either, and the character holds still.");
    expect(S.lively).toEqual({ still: "Still", gentle: "Gentle", lively: "Lively" });
  });
  test("the page rows say only what is true in Still, the usual (page rows show the short line, never the help)", () => {
    expect(S.short["character.follow"]).toBe("What follows your pointer when How lively is Lively.");
    expect(S.short["character.restLowPower"]).toBe("Holds still while your Mac saves power.");
    const follow = S.set["character.follow"] as { help: string; options: Record<string, string> };
    expect(follow.help).toContain(`${follow.options.off}: nothing follows`);   // the option is named as it reads
    expect(follow.help).toContain("never what you type or what is on the screen, and never kept");
    expect(S.set["fun.reactions"].help).not.toContain("Small moves of the character when a check passes or fails");
    for (const t of [S.short["character.follow"], S.short["character.restLowPower"], S.set["fun.reactions"].help]) expect(t).not.toMatch(/[–—]/);
  });
  test("every setting on a page has a short line (Shortcuts has its own editor)", () => {
    expect(PAGE_KEYS.filter((k) => k !== "keys.hotkeys" && !S.short[k as keyof typeof S.short])).toEqual([]);
  });
  test("the Settings hero's three buttons read and write character.lively only, and its Flowflow shows the choice at once", () => {
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const hero = page.slice(page.indexOf("function CompanionHero("), page.indexOf("/** Google (M21"));
    expect(hero).toContain('livelinessOf(useSetting("character.lively"))');
    expect(hero).toContain('changeSetting("character.lively", l)');
    expect(hero).toContain("<HomeCharacter as={as} liveliness={lively} />");
    expect(hero).not.toMatch(/fun\.reactions|character\.motion/);
  });
});
