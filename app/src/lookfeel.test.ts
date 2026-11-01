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
  test("paper keeps every word readable (its tokens in ui/tokens.css)", () => {
    const css = readFileSync(new URL("./ui/tokens.css", import.meta.url), "utf8");
    const block = /:root\[data-theme="paper"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const tok = (n: string) => new RegExp(`--${n}: (#[0-9A-Fa-f]{6})`).exec(block)?.[1] ?? "";
    expect(block).not.toBe("");
    expect(ratio(tok("fg"), tok("bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tok("fg-2"), tok("bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tok("fg"), tok("surface-1"))).toBeGreaterThanOrEqual(4.5);
    // Paper's main button is ink with the page's colour for its words (silver on white reads as disabled).
    expect(block).toMatch(/--main: var\(--fg\);[^}]*--main-ink: var\(--bg\);/);
    expect(ratio(tok("bg"), tok("fg"))).toBeGreaterThanOrEqual(4.5);
    // The Deep theme is hidden (founder call 3): no rule draws it, so a stored "deep" reads as Night.
    expect(css).not.toContain('data-theme="deep"');
  });
});

describe("how lively (M46, F28): Still, Gentle or Lively, one key of its own", () => {
  test("the registry has its own key, Lively by default (M51), the three choices in order, and no mapping from the old ones", () => {
    expect(def("character.lively")).toMatchObject({ default: "lively", options: ["still", "gentle", "lively"], kind: "choice", live: true });
    expect((def("character.lively") as { from?: unknown }).from).toBeUndefined();
    expect(LIVELINESS).toEqual(["still", "gentle", "lively"]);
  });
  test("nothing set reads as the usual, Lively; a word that is not one of the three reads as Still: nothing old turns motion on", () => {
    for (const v of ["still", "gentle", "lively"] as const) expect(livelinessOf(v)).toBe(v);
    for (const unset of [null, undefined]) expect(livelinessOf(unset)).toBe("lively");
    for (const bad of ["", "calm", "Lively", true, false, 1, {}, "less", "followMac"]) expect(livelinessOf(bad)).toBe("still");
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

// M46 (F28): where How lively shows, and its words. Since the overhaul (section 3) it is its own group on the Flowflow page;
// Less motion, reactions and Rest in Low Power Mode are in More options, Flowflow's section.
import { MAIN, mainKeys, moreKeys } from "./settingsPages.ts";
import { rowLine } from "./settingsPage.tsx";
import { controlFor } from "./ui/controlRule.ts";
import { S } from "./strings.ts";
describe("How lively in Settings (M46)", () => {
  test("it sits on the Flowflow page, in its own group before the look; Less motion, reactions and Low Power Mode are in More options", () => {
    const keys = mainKeys("flowflow");
    expect(keys[0]).toBe("character.lively");
    expect(keys).toContain("character.follow");
    for (const k of ["character.restLowPower", "character.motion", "fun.reactions"]) { expect(MAIN.has(k), k).toBe(false); expect(moreKeys("flowflow"), k).toContain(k); }
    expect(def("character.restLowPower")).toMatchObject({ default: true, kind: "switch" });
    expect(def("point.fly")).toMatchObject({ default: false, kind: "switch" });
  });
  test("its words: a label, help, a short line and all three choices, plain, with no dash", () => {
    const w = S.set["character.lively"] as { label: string; help: string; options: Record<string, string> };
    expect(w.label).toBe("How lively");
    expect(Object.keys(w.options)).toEqual(["still", "gentle", "lively"]);
    expect(S.short["character.lively"]).toBe("Still: moves only when there is news. Gentle: a slow sway. Lively: watches your pointer.");
    for (const t of [w.label, w.help, S.short["character.lively"], ...Object.values(w.options), S.set["character.restLowPower"].help, S.set["point.fly"].help, S.set["character.follow"].help]) expect(t).not.toMatch(/[–—]/);
    expect(S.set["character.live"].help).not.toContain("eyes that follow your pointer");
    expect(S.set["calls.quiet"].help).toContain("The notch does not open by itself during a call either, and the character holds still.");
    expect(S.lively).toEqual({ still: "Still", gentle: "Gentle", lively: "Lively" });
  });
  test("the page rows say only what is true in Still, the usual (page rows show the short line, never the help)", () => {
    expect(S.short["character.follow"]).toBe("Still only follows while listening or pointing.");
    expect(rowLine("character.restLowPower")).toBe("On, the character holds still while your Mac is in Low Power Mode.");
    const follow = S.set["character.follow"] as { help: string; options: Record<string, string> };
    expect(follow.help).toContain(`${follow.options.off}: nothing follows`);   // the option is named as it reads
    expect(follow.help).toContain("never what you type or what is on the screen, and never kept");
    expect(S.set["fun.reactions"].help).not.toContain("Small moves of the character when a check passes or fails");
    for (const t of [S.short["character.follow"], rowLine("character.restLowPower"), S.set["fun.reactions"].help]) expect(t).not.toMatch(/[–—]/);
  });
  test("every setting on a page's main level has its one line, or is drawn by rows of its own", () => {
    const own = ["keys.hotkeys", "talk.voice", "character.peek", "character.stick", "look.water", "character.edge"];
    expect([...MAIN].filter((k) => !own.includes(k) && !rowLine(k))).toEqual([]);
  });
  test("how lively is one row on the Flowflow page, a Picture choice that writes character.lively only, and the preview's Flowflow follows it", () => {
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    // The control choice rule (the overhaul spec, 3.5): a visual choice is a Picture choice, never a menu or a second
    // segmented control in the preview.
    expect(controlFor(def("character.lively") as unknown as Parameters<typeof controlFor>[0])).toBe("pictures");
    const pics = page.slice(page.indexOf("function LivelyPictures("), page.indexOf("/** The Flowflow page opens"));
    expect(pics).toContain("<PictureChoice labelledBy={labelId} value={livelinessOf(value)} onChange={onChange}");
    expect(pics).toContain("LIVELINESS.map((l) =>");
    expect(page).toContain('if (d.key === "character.lively") return <LivelyPictures value={String(value)} onChange={change}');
    const hero = page.slice(page.indexOf("function FlowflowPreview("), page.indexOf("/** Google (M21"));
    expect(hero).toContain('livelinessOf(useSetting("character.lively"))');
    expect(hero).toContain("<HomeCharacter as={as} liveliness={lively} />");
    // Its states are a Segmented control (a part), never buttons of its own.
    expect(hero).toContain("<Segmented label={S.heroStatesLabel}");
    expect(hero).not.toMatch(/fun\.reactions|character\.motion|ch-lively|ch-states|<button/);
  });
});
