// M51 step 3 (the founder, 1 Nov 2026: HeyClicky "looks so much better"; "I want customers to have as much customization as
// possible"). The details: a coloured tile per item in the lists, tilted stamps (working, new, proven, needs you), Flowflow's
// short lines in a bubble with a tail, one glossy pill. And the choices: Theme (Graphite, Paper, Deep), Density, Icons,
// Stamps, the glossy button and Corners. Each choice is a data attribute on the root and a token switch in ui/tokens.css.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyLook, applyLookChoices, COLOUR_CHOICES, colourChoiceOf, FIXED_LOOK, lookAttrs, RETIRED_LOOK_KEYS, themeOf, THEMES, WATER_TINTS, WATERS } from "./lookfeel.ts";
import { glyphOf, historyStamp, KIND_GLYPH, SIDE_STAMPS, sideStamp, KIND_TINT, KINDS, kindOf, NEW_MINUTES, practiceStamp, STAMPS, taskName, TINTS } from "./itemLook.ts";
import { HIDDEN_OPTIONS, OPTION_ALIASES, PAGES, placeOf, shownValue } from "./settingsPages.ts";
import { S } from "./strings.ts";
import { ALL_CSS, LOOK_CSS, TOKENS_CSS, WIDE_CSS } from "./ui/cssFiles.ts";
import type { HistoryItem } from "./model.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const registry = JSON.parse(read("../../protocol/settings.json")) as { settings: { key: string; kind: string; default: unknown; options?: string[]; applies: string[]; section: string; live: boolean; store: string }[] };
const def = (k: string) => registry.settings.find((s) => s.key === k);
// M71: the Look page offers Colour and Character (with the layout and the text size); the rest of the old choices are retired.
const KEYS = ["look.colour", "look.character"] as const;

// ---------- reading tokens.css ----------
type Block = { sel: string; media: string | null; decl: Record<string, string> };
function blocks(css0: string, media: string | null = null): Block[] {
  const css = css0.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Block[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, close = open;
    for (; close < css.length; close++) { if (css[close] === "{") depth++; else if (css[close] === "}" && --depth === 0) break; }
    const head = css.slice(i, open).trim(), body = css.slice(open + 1, close);
    if (head.startsWith("@media")) out.push(...blocks(body, head));
    else if (!head.startsWith("@")) {
      const decl: Record<string, string> = {};
      for (const d of body.split(";")) { const c = d.indexOf(":"); if (c > 0) decl[d.slice(0, c).trim()] = d.slice(c + 1).trim(); }
      out.push({ sel: head, media, decl });
    }
    i = close + 1;
  }
  return out;
}
const tok = blocks(TOKENS_CSS());
const block = (sel: string, media: RegExp | null = null) => tok.find((b) => b.sel === sel && (media ? media.test(b.media ?? "") : !b.media))?.decl ?? {};
const root = block(":root");
const MORE = /prefers-contrast: more/;
const THEME_TOKENS: [string, Record<string, string>][] = [
  ["Graphite", root], ["Paper", { ...root, ...block(':root[data-theme="paper"]') }], ["Deep", { ...root, ...block(':root[data-theme="deep"]') }],
  ["Graphite, more contrast", { ...root, ...block(":root", MORE) }],
  ["Paper, more contrast", { ...root, ...block(':root[data-theme="paper"]'), ...block(':root[data-theme="paper"]', MORE) }],
  ["Deep, more contrast", { ...root, ...block(':root[data-theme="deep"]'), ...block(':root[data-theme="deep"]', MORE) }],
  // 2 Nov 2026: Black, the usual theme, measured the same way.
  ["Black", { ...root, ...block(':root[data-theme="black"]') }],
  ["Black, more contrast", { ...root, ...block(':root[data-theme="black"]'), ...block(':root[data-theme="black"]', MORE) }],
];
// M65: every theme again in the Instrument style (look.style, the usual since 4 Nov 2026), in the order the page's cascade
// gives its tokens: :root, Instrument's page, the theme, then Instrument over every theme and over that theme.
const IS = ':root[data-style="instrument"]';
for (const [name, theme] of [["Graphite", null], ["Paper", "paper"], ["Deep", "deep"], ["Black", "black"]] as const) for (const m of [false, true]) {
  const th = theme ? `:root[data-theme="${theme}"]` : null;
  THEME_TOKENS.push([`Instrument, ${name}${m ? ", more contrast" : ""}`, {
    ...root, ...(m ? block(":root", MORE) : {}), ...block(IS), ...(m ? block(IS, MORE) : {}),
    ...(th ? block(th) : {}), ...(th && m ? block(th, MORE) : {}), ...block(`${IS}[data-tone]`), ...(theme ? block(`${IS}[data-theme="${theme}"]`) : {}),
  }]);
}

// ---------- colour ----------
type RGBA = [number, number, number, number];
function colour(v0: string, t: Record<string, string>): RGBA {
  const v = v0.trim();
  const vr = /^var\((--[\w-]+)\)$/.exec(v);
  if (vr) return colour(t[vr[1]] ?? "", t);
  if (v === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((k) => parseInt(hex[1].slice(k, k + 2), 16)).concat(1) as RGBA;
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb) { const p = rgb[1].split(",").map((x) => Number(x.trim())); return [p[0], p[1], p[2], p[3] ?? 1]; }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(v);
  if (mix) { const a = colour(mix[1], t), b = colour(mix[3], t), p = Number(mix[2]) / 100; return [0, 1, 2, 3].map((k) => a[k] * p + b[k] * (1 - p)) as RGBA; }
  throw new Error(`a colour this test cannot read: ${v0}`);
}
const over = (top: RGBA, under: RGBA): RGBA => [0, 1, 2].map((k) => top[k] * top[3] + under[k] * (1 - top[3])).concat(1) as RGBA;
const lum = (c: RGBA) => { const f = (x: number) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
// M69: words drawn in an ink with opacity (Instrument's one ink, spec 1.2) are measured as they show, over what is under them.
const ratio = (a0: RGBA, b: RGBA) => { const a = a0[3] < 1 && b[3] === 1 ? over(a0, b) : a0; const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("the choices are real settings, with their words and one place in Settings", () => {
  test("each is in the registry with a safe usual value, live, for the pages", () => {
    // 2 Nov 2026 (the founder: "so we gonna have white and black"): Black is the usual, White (stored as paper) is offered.
    expect(def("look.theme")).toMatchObject({ kind: "choice", default: "black", options: ["black", "paper", "graphite", "deep", "night"], applies: ["pages"], section: "look", live: true, store: "settings" });
    expect(def("look.density")).toMatchObject({ kind: "choice", default: "comfortable", options: ["comfortable", "compact"], applies: ["pages"], live: true });
    // 2 Nov 2026 (the founder: "too many colors, so it looks like an aquarium"): plain icons, no light and Calm are the usual.
    expect(def("look.icons")).toMatchObject({ kind: "choice", default: "plain", options: ["plain", "colour"], applies: ["pages"], live: true });
    expect(def("look.stamps")).toMatchObject({ kind: "switch", default: true, applies: ["pages"], live: true });
    // Flat is the usual since 2 Nov 2026 (the review: the glossy pill read as a toy); Glossy stays a choice.
    expect(def("look.gloss")).toMatchObject({ kind: "choice", default: "flat", options: ["flat", "on"], applies: ["pages"], live: true });
    expect(def("look.corners")).toMatchObject({ kind: "choice", default: "soft", options: ["soft", "crisp"], applies: ["pages"], live: true });
    // The light behind Home, off by default, with Still and Moving kept as choices.
    expect(def("look.light")).toMatchObject({ kind: "choice", default: "off", options: ["off", "still", "moving"], applies: ["pages"], live: true });
    // M71: Colourful is the usual, Calm the choice; a stored Vivid still checks out (hidden, reads as Colourful).
    expect(def("look.colour")).toMatchObject({ kind: "choice", default: "colourful", options: ["colourful", "calm", "vivid"], applies: ["pages"], live: true });
  });
  test("each has a label, help, search words and short option words, in plain words with no dashes or capitals", () => {
    for (const k of KEYS) {
      const w = S.set[k] as { label: string; help: string; also: readonly string[]; options?: Record<string, string> };
      expect(w, k).toBeTruthy();
      expect(w.label.length, k).toBeGreaterThan(2);
      expect(w.help.length, k).toBeGreaterThan(20);
      expect(w.also.length, k).toBeGreaterThanOrEqual(4);
      for (const t of [w.label, w.help, ...w.also, ...Object.values(w.options ?? {}), S.short[k] ?? ""]) {
        expect(t, `${k}: ${t}`).not.toMatch(/[–—]/);
        expect(t, `${k}: ${t}`).not.toMatch(/\b[A-Z]{3,}\b/);
      }
      const d = def(k)!;
      if (d.kind === "choice") for (const o of d.options!.filter((x) => !(HIDDEN_OPTIONS[k] ?? []).includes(x))) {
        const words = S.setSeg[k]?.[o] ?? w.options?.[o] ?? "";
        expect(words, `${k} ${o}`).toBeTruthy();
        expect(words.length, `${k} ${o}: ${words}`).toBeLessThanOrEqual(12);
      }
    }
    expect(S.set["look.theme"].options).toMatchObject({ black: "Black", paper: "White", graphite: "Graphite", deep: "Deep" });
    for (const q of ["colourful", "calm", "blue", "visor", "orb", "water"]) {
      expect(KEYS.some((k) => [S.set[k].label, ...(S.set[k].also as readonly string[])].some((a) => a.toLowerCase().includes(q))), q).toBe(true);
    }
  });
  // M51 polish: the look was three levels deep (Settings, General, More options, Look) as words only. It is a page of its
  // own now, one press from the sidebar, beside the water's colour, and the big choices are pictures.
  // M65: the style and the character lead the page; the light and the gloss (the Friendly style's water and gel) moved to
  // the page's More options, kept whole, so the page stays at ten settings.
  test("the Look page offers four things: Colour, Character, Layout and Text size (M71)", () => {
    expect(PAGES.look.groups.map((g) => g.id)).toEqual(["look.home"]);
    expect(PAGES.look.groups[0].items).toEqual(["look.colour", "look.character", "look.layout", "display.textSize"]);
    expect(PAGES.look.more).toEqual([]);
    expect(S.pages.look.title).toBe("Look");
    expect(S.setGroupTitles["look.home"]).toBe("Home");
    for (const k of [...KEYS, "look.layout", "display.textSize"]) expect(placeOf(k), k).toMatchObject({ page: "look", more: false });
    for (const k of RETIRED_LOOK_KEYS) expect(placeOf(k), k).toBeNull();
    expect(PAGES.general.more.some((t) => t.id === "more.general.look")).toBe(false);
    // Home's topic keeps only how Home behaves and its size, and (M55, adapts to you) what its main button and More ways follow.
    expect(PAGES.general.more.find((t) => t.id === "more.general.home")!.items).toEqual(["home.closeOnClickAway", "home.stepAside", "home.goToNeeds", "home.size", "home.followFrontApp", "home.usedOftenFirst", "history.thisWeek", { fixed: "usedOften" }]);
  });
  test("a theme saved before M51 still works: night reads as Graphite, in the row and on the page, and is not offered twice", () => {
    expect(HIDDEN_OPTIONS["look.theme"]).toEqual(["night"]);
    // M71: Colour's Vivid reads as Colourful, the Character's Match as the Visor; neither is offered.
    expect(HIDDEN_OPTIONS["look.colour"]).toEqual(["vivid"]);
    expect(shownValue("look.colour", "vivid")).toBe("colourful");
    expect(shownValue("look.character", "match")).toBe("visor");
    expect(OPTION_ALIASES["look.theme"]).toEqual({ night: "graphite" });
    expect(shownValue("look.theme", "night")).toBe("graphite");
    expect(shownValue("look.theme", "deep")).toBe("deep");
    expect(shownValue("look.water", "night")).toBe("night");
    expect(read("./settingsPage.tsx")).toContain("const value = d.key === \"look.character\" ? characterNow() : shownValue(d.key, d.kind === \"custom\" ? snapshotNow()?.values[d.key] : setting(d.key));");
    expect(themeOf("night")).toBe("graphite");
    for (const t of THEMES) expect(themeOf(t)).toBe(t);
    for (const junk of [undefined, null, "", "Night", 3]) expect(themeOf(junk), String(junk)).toBe("black");
  });
});

describe("M71: one black look; Colour and Character are the choices, the retired keys load and are ignored", () => {
  const FOUNDER = { "look.style": "friendly", "look.colour": "vivid", "look.theme": "deep" };
  test("the usual values give the fixed black look, Colourful and the Visor", () => {
    expect(lookAttrs({})).toEqual({ ...FIXED_LOOK, "data-colours": "colourful", "data-character": "visor" });
    expect(FIXED_LOOK["data-theme"]).toBe("black");
    expect(FIXED_LOOK["data-tone"]).toBe("dark");
    expect(COLOUR_CHOICES).toEqual(["colourful", "calm"]);
    expect(colourChoiceOf("calm")).toBe("calm");
    for (const v of [undefined, "", "vivid", "Calm", 7]) expect(colourChoiceOf(v), String(v)).toBe("colourful");
    expect(def("look.colour")!.default).toBe("colourful");
    expect(def("look.character")!.default).toBe("visor");
  });
  test("the founder's own stored Friendly, Vivid and Deep shows the new look, the same as a new store", () => {
    expect(lookAttrs(FOUNDER)).toEqual({ ...lookAttrs({}), "data-character": "friendly" });   // the same black look; their water character stays
    const every = { ...FOUNDER, "look.water": "berry", "look.gloss": "on", "look.light": "moving", "look.corners": "crisp", "look.icons": "colour", "look.stamps": false, "look.density": "compact" };
    expect(lookAttrs(every)).toEqual({ ...lookAttrs({}), "data-character": "friendly" });
    // Each stored value still checks out against the registry, so it loads without a problem.
    for (const [k, v] of Object.entries(every)) {
      const d = def(k)!;
      if (d.kind === "choice") expect(d.options, k).toContain(v as string);
      else expect(typeof v, k).toBe(typeof d.default);
    }
  });
  test("every retired key stays in the registry, hidden, and only Colour and Character reach the page", () => {
    expect([...RETIRED_LOOK_KEYS].sort()).toEqual(["look.corners", "look.density", "look.gloss", "look.icons", "look.light", "look.stamps", "look.style", "look.theme", "look.water"]);
    for (const k of RETIRED_LOOK_KEYS) expect((def(k) as { hidden?: boolean }).hidden, k).toBe(true);
    const hook = read("./useLook.ts");
    // M72 (finding 2): the retired style is read only to keep a Friendly store's water character on the root.
    for (const k of RETIRED_LOOK_KEYS.filter((k) => k !== "look.style")) expect(hook, k).not.toContain(`"${k}"`);
    expect(hook).toContain('useSetting("look.colour")');
    expect(hook).toContain('useSetting("look.character")');
  });
  test("Home sets them on its root and keeps them in step; the island and the character keep the notch's look", () => {
    const attrs: Record<string, string> = {};
    applyLookChoices({ setAttribute: (k, v) => { attrs[k] = v; } }, { "look.colour": "calm", "look.corners": "crisp" });
    expect(attrs).toEqual({ ...FIXED_LOOK, "data-colours": "calm", "data-character": "visor" });
    const theme: Record<string, string> = {};
    applyLook({ style: { setProperty: () => {} }, setAttribute: (k, v) => { theme[k] = v; } });
    expect(theme["data-theme"]).toBe("black");
    expect(theme["data-tone"]).toBe("dark");
    expect(theme["data-water"]).toBe("ocean");
    expect(read("./card.tsx")).toContain("useLook({ choices: true });");
    expect(read("./useLook.ts")).toContain("const choices = !!opts.choices && !opts.keepNight;");
    expect(read("./island.tsx")).not.toContain("choices: true");
    expect(read("./dock.tsx")).not.toContain("choices: true");
  });
  test("Calm keeps the structure with blue as the only colour (tokens.css)", () => {
    const calm = /:root\[data-colours="calm"\] \{([^}]*)\}/.exec(TOKENS_CSS())![1];
    for (const c of ["purple", "orange", "pink", "green", "red", "teal"]) {
      expect(calm, c).toContain(`--c-${c}: var(--c-blue);`);
      expect(calm, c).toContain(`--c-${c}-tile: var(--c-blue);`);
    }
    expect(calm).not.toContain("--c-grey");
  });
});

describe("each choice is a data attribute on the root, never a branch in the code", () => {
  test("only tokens.css reads the attributes, and nothing else in the code branches on the choices' values", () => {
    const css = ALL_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
    const outside = css.replace(TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, ""), "");
    for (const a of ["data-theme", "data-density", "data-icons", "data-stamps", "data-gloss", "data-corners", "data-light", "data-colour", "data-style", "data-character"]) expect(outside, a).not.toContain(`[${a}=`);
    for (const f of ["./card.tsx", "./homeSide.tsx", "./practicePanel.tsx", "./itemMarks.tsx", "./itemLook.ts"]) {
      const src = read(f);
      for (const k of ["look.density", "look.icons", "look.stamps", "look.gloss", "look.corners", "look.light", "look.colour", "look.style"]) expect(src, `${f} reads ${k}`).not.toContain(`"${k}"`);
    }
  });
});

describe("each value changes the tokens it should, and the usual values give exactly the look of step 1", () => {
  // Step 1's values (the graphite look the founder approved on 1 Nov 2026), for every token a choice may switch.
  const STEP1: Record<string, string> = {
    "--bg": "#111111", "--surface-1": "#171717", "--surface-2": "#1C1C1C", "--surface-3": "#242424", "--inset": "#1C1C1C", "--fg": "#FAFAFA", "--fg-2": "#A4A4A4",
    "--space-3": "12px", "--space-4": "16px", "--space-5": "20px", "--space-6": "24px", "--space-7": "32px", "--space-row-y": "10px", "--space-field-x": "10px",
    "--h-md": "32px", "--h-lg": "40px", "--h-row": "44px", "--h-bar": "44px", "--h-ask": "44px",
    "--r-key": "6px", "--r-thumb": "6px", "--r-control": "8px", "--r-card": "12px", "--r-panel": "24px",
    // The glossy pill toned down in the polish (next to HeyClicky's restrained pill): a third of the sheen, lip and glow.
    "--gel-hi": "color-mix(in srgb, var(--water) 82%, #FFFFFF)", "--gel-lo": "color-mix(in srgb, var(--water) 94%, #FFFFFF)",
    "--gel-lip": "rgba(255, 255, 255, .45)", "--gel-gloss": "rgba(255, 255, 255, .14)", "--gel-glow": "color-mix(in srgb, var(--water) 12%, transparent)",
  };
  // New with step 3, read by the new details only: their usual values.
  // M51 polish: the badge upright and a small rounded label, the tiles smaller, and on the dark themes deep washes with a
  // light ink (Paper keeps the pastels, below).
  const NEW_USUAL: Record<string, string> = {
    "--r-tile": "6px", "--r-stamp": "4px", "--r-bubble": "10px", "--tile-lg": "24px", "--stamp-display": "inline-flex", "--unstamped-display": "none", "--stamp-tilt": "0deg",
    "--tint-sky": "#172A40", "--tint-sky-ink": "#9CCBFF", "--tint-mint": "#13291F", "--tint-mint-ink": "#86DDB4", "--tint-rose": "#301823", "--tint-rose-ink": "#FFA6C9",
    "--tint-sun": "#2C2513", "--tint-sun-ink": "#F0CF78", "--tint-lilac": "#231E3B", "--tint-lilac-ink": "#BFB1FF",
    // The wide list's gems with Colour icons (2 Nov 2026): Plain, the usual, shows the place's line drawing instead.
    "--gem-display": "block", "--gem-icon-display": "none",
  };
  const SWITCHES: [string, string][] = [["density", "compact"], ["icons", "plain"], ["stamps", "off"], ["gloss", "flat"], ["corners", "crisp"]];
  const sw = (a: string, v: string) => block(`:root[data-${a}="${v}"]`);
  test("no rule anywhere matches a choice's usual value, so the usual look is :root's, which is step 1's", () => {
    const css = ALL_CSS();
    for (const [a, v] of [["theme", "graphite"], ["theme", "night"], ["density", "comfortable"], ["icons", "colour"], ["stamps", "on"], ["gloss", "on"], ["corners", "soft"]]) expect(css, `${a}=${v}`).not.toContain(`[data-${a}="${v}"]`);
    for (const [k, v] of Object.entries(STEP1)) expect(root[k], k).toBe(v);
    for (const [k, v] of Object.entries(NEW_USUAL)) expect(root[k], k).toBe(v);
    // Every token a switch touches has its usual value pinned above: nothing switched is left unpinned.
    for (const [a, v] of SWITCHES) for (const k of Object.keys(sw(a, v))) expect(k in STEP1 || k in NEW_USUAL, `${a}=${v} switches ${k}`).toBe(true);
    // The bubble's corner was 10px written in look.css; it is the --r-bubble token now, at the same 10px.
    expect(LOOK_CSS()).toMatch(/\n\.say \{[^}]*border-radius: var\(--r-bubble\);/);
  });
  test("Compact pulls the spaces and heights in, every one smaller, and no target goes under 24 points", () => {
    const c = sw("density", "compact");
    expect(Object.keys(c).sort()).toEqual(["--h-ask", "--h-bar", "--h-lg", "--h-md", "--h-row", "--space-3", "--space-4", "--space-5", "--space-6", "--space-7", "--space-field-x", "--space-row-y", "--tile-lg"].sort());
    for (const [k, v] of Object.entries(c)) { expect(parseFloat(v), k).toBeLessThan(parseFloat(root[k])); if (k.startsWith("--h-")) expect(parseFloat(v), k).toBeGreaterThanOrEqual(24); }
  });
  test("Crisp halves the rounded corners, and leaves the notch's corner, a switch and the dot alone", () => {
    const c = sw("corners", "crisp");
    expect(Object.keys(c).sort()).toEqual(["--r-bubble", "--r-card", "--r-control", "--r-key", "--r-panel", "--r-stamp", "--r-thumb", "--r-tile"].sort());
    for (const [k, v] of Object.entries(c)) expect(parseFloat(v), k).toBeLessThanOrEqual(parseFloat(root[k]) / 2);
    for (const k of ["--r-xl", "--r-switch", "--r-round"]) expect(c[k], k).toBeUndefined();
  });
  test("Flat keeps the water's colour on the one main pill and takes away its shine, lip and glow", () => {
    expect(sw("gloss", "flat")).toEqual({ "--gel-hi": "var(--water)", "--gel-lo": "var(--water)", "--gel-lip": "transparent", "--gel-gloss": "transparent", "--gel-glow": "transparent" });
    expect(root["--gel-mid"]).toBe("var(--water)");
    // The pill's words stay its dark ink, readable on every water (its own test in a11y and skins).
    expect(sw("gloss", "flat")["--gel-ink"]).toBeUndefined();
  });
  test("Plain icons make every tile grey, its drawing in the second ink; Stamps off swaps every stamp for its plain words", () => {
    const p = sw("icons", "plain");
    for (const t of TINTS) { expect(p[`--tint-${t}`], t).toBe("var(--surface-3)"); expect(p[`--tint-${t}-ink`], t).toBe("var(--fg-2)"); }
    // And the wide list's Now and Learn show their line drawing, not a coloured gem (the review, 2 Nov 2026).
    expect(p["--gem-display"]).toBe("none");
    expect(p["--gem-icon-display"]).toBe("block");
    expect(Object.keys(p)).toHaveLength(TINTS.length * 2 + 2);
    expect(sw("stamps", "off")).toEqual({ "--stamp-display": "none", "--unstamped-display": "inline-flex" });
  });

});

describe("every tile and every stamp is readable in every theme", () => {
  for (const [name, t0] of THEME_TOKENS) {
    for (const plain of [false, true]) {
      const t = plain ? { ...t0, ...block(':root[data-icons="plain"]') } : t0;
      test(`${name}${plain ? ", plain icons" : ""}: each tile's drawing reaches 4.5 to 1 on it`, () => {
        for (const tint of TINTS) {
          const tile = colour(`var(--tint-${tint})`, t);
          expect(ratio(colour(`var(--tint-${tint}-ink)`, t), tile), `${tint} ink`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
    test(`${name}: each stamp's words reach 4.5 to 1 on the page, a card and a row under the pointer, with every water`, () => {
      const css = blocks(LOOK_CSS());
      const base = css.find((b) => b.sel === ".stamp")!.decl.color;
      // The water is set on the page for the water chosen (lookfeel.ts applyLook), over the theme's own, so each is tried.
      for (const w of WATERS) {
        const tw = { ...t0, "--water": WATER_TINTS[w].mid };
        for (const s of STAMPS) {
          const c = css.find((b) => b.sel === `.stamp[data-stamp="${s}"]`)?.decl.color ?? base;
          for (const under of ["--bg", "--surface-1", "--surface-2"]) {
            const u = colour(`var(${under})`, tw);
            expect(ratio(over(colour(c, tw), u), u), `${w}: ${s} on ${under}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    });
  }
});

// M51 polish: the tiles' colours meant nothing (a fix and a page got the same pink by their place in the list), so they
// read as an emoji picker. A colour now means one kind of work, in every list, and the drawing says the same kind.
describe("an item's tile: its colour and its drawing both say what kind of work it was", () => {
  test("each kind has one drawing and one colour; the five tints are five kinds, and the rest are plain grey", () => {
    expect(TINTS).toEqual(["sky", "mint", "rose", "sun", "lilac"]);
    expect(KINDS).toEqual(["explain", "fix", "live", "improve", "question", "make", "other"]);
    const tinted = KINDS.map((k) => KIND_TINT[k]).filter((t) => t !== "plain");
    expect(new Set(tinted).size, "no two kinds share a colour").toBe(tinted.length);
    expect([...tinted].sort()).toEqual([...TINTS].sort());
    expect(KIND_TINT.improve).toBe("plain");
    expect(KIND_TINT.other).toBe("plain");
    expect(new Set(KINDS.map((k) => KIND_GLYPH[k])).size, "no two kinds share a drawing").toBe(KINDS.length);
  });
  test("the kind comes from the words asked; the first that matches wins, so an explanation of a blank page is not a fix", () => {
    expect(kindOf("Fix the broken login button")).toBe("fix");
    expect(kindOf("Why does my page show an error?")).toBe("fix");
    expect(kindOf("Explain why the login page shows a blank screen after I sign in")).toBe("explain");
    expect(kindOf("Deploy it to Vercel")).toBe("live");
    expect(kindOf("Which database should I use?")).toBe("question");
    expect(kindOf("Make a page for my bakery")).toBe("make");
    expect(kindOf("Add a dark mode switch")).toBe("make");
    expect(kindOf("Make the pricing page load faster")).toBe("improve");
    expect(kindOf("Tidy the readme")).toBe("improve");
    expect(kindOf("Hello")).toBe("other");
    expect(kindOf("")).toBe("other");
    expect(glyphOf("Fix the signup button")).toBe("wrench");
    expect(glyphOf("Explain what a server is")).toBe("learn");
    expect(glyphOf("Deploy it to Vercel")).toBe("send");
    expect(glyphOf("Which database should I use?")).toBe("find");
    expect(glyphOf("Add a dark mode switch")).toBe("grid");
    expect(glyphOf("Tidy the readme")).toBe("clean");
    expect(glyphOf("")).toBe("text");
  });
  test("a task's name is the words asked, never the safety copy's \"Before:\", in every list", () => {
    expect(taskName("Before: Fix the signup button")).toBe("Fix the signup button");
    expect(taskName("before:   Tidy the readme ")).toBe("Tidy the readme");
    expect(taskName("Fix it before: the demo")).toBe("Fix it before: the demo");
    expect(taskName("Before: ")).toBe("");
    expect(taskName(undefined as unknown as string)).toBe("");
    const card = read("./card.tsx"), side = read("./homeSide.tsx");
    expect(side).toContain("const name = taskName(i.label);");
    expect(card).toContain("task = taskName(h.label)");
  });
  test("its colours are tokens; each tint is chosen by data-tint, and the drawing takes the tile's ink", () => {
    const css = blocks(LOOK_CSS());
    const tile = css.find((b) => b.sel === ".tile")!.decl;
    expect(tile).toMatchObject({ background: "var(--tile-bg)", color: "var(--tile-ink)", "border-radius": "var(--r-tile)" });
    for (const t of TINTS) expect(css.find((b) => b.sel === `.tile[data-tint="${t}"]`)?.decl).toEqual({ "--tile-bg": `var(--tint-${t})`, "--tile-ink": `var(--tint-${t}-ink)` });
    expect(css.find((b) => b.sel === ".tile .ic")?.decl.color).toBe("inherit");
    expect(css.find((b) => b.sel === '.tile[data-tint="plain"]')?.decl).toEqual({ "--tile-bg": "var(--surface-3)", "--tile-ink": "var(--fg-2)" });
    expect(read("./itemMarks.tsx")).toMatch(/<span className=\{`tile\$\{[^`]*`\} data-tint=\{KIND_TINT\[k\]\} aria-hidden="true"><Icon name=\{KIND_GLYPH\[k\]\}/);
  });
});

describe("stamps: working, new, proven, needs you", () => {
  const NOW = Date.parse("2026-11-01T12:00:00Z");
  const h = (o: Partial<HistoryItem>): HistoryItem => ({ id: 1, label: "Fix it", status: "done", usd: 0.1, startedAt: "2026-11-01T09:00:00Z", endedAt: "2026-11-01T09:05:00Z", checkpoint: "cp_1", changed: 1, proof: null, ...o });
  test("each from what the task really is, never one it has not earned", () => {
    expect(STAMPS).toEqual(["working", "new", "proven", "needsYou", "notFixed"]);
    expect(historyStamp(h({ status: "running", endedAt: null }), NOW)).toBe("working");
    expect(historyStamp(h({ status: "needs_you" }), NOW)).toBe("needsYou");
    expect(historyStamp(h({ proof: "passed" }), NOW)).toBe("proven");
    expect(historyStamp(h({ proof: "passed", endedAt: "2026-11-01T11:59:00Z" }), NOW), "proven says more than new").toBe("proven");
    // New: an answer or a change that finished in the last ten minutes, not yet proven.
    expect(NEW_MINUTES).toBe(10);
    expect(historyStamp(h({ endedAt: "2026-11-01T11:55:00Z" }), NOW)).toBe("new");
    expect(historyStamp(h({ endedAt: "2026-11-01T11:49:00Z" }), NOW)).toBeNull();
    expect(historyStamp(h({ changed: 0, endedAt: "2026-11-01T11:58:00Z" }), NOW)).toBe("new");
    // A failed check is stamped Not fixed yet, as Proven is (the audit, item 31).
    expect(historyStamp(h({ status: "not_done", proof: "failed", endedAt: "2026-11-01T11:59:00Z" }), NOW)).toBe("notFixed");
    // A stop, an undo or a limit is never new or proven: its own mark says it.
    for (const o of [{ status: "interrupted" }, { undone: true }, { status: "daily_limit" }, { status: "error" }] as Partial<HistoryItem>[]) {
      expect(historyStamp(h({ ...o, endedAt: "2026-11-01T11:59:00Z" }), NOW), JSON.stringify(o)).toBeNull();
    }
    expect(historyStamp(h({ endedAt: "not a date" }), NOW)).toBeNull();
    expect(practiceStamp("done")).toBe("proven");
    expect(practiceStamp("inProgress")).toBeNull();
    expect(practiceStamp("notStarted")).toBeNull();
  });
  test("their words are sentence case, never capitals; the look is a small upright outlined badge, in its meaning's colour", () => {
    expect(S.look.stamp).toEqual({ working: "Working", new: "New", proven: "Proven", needsYou: "Needs you", notFixed: "Not fixed yet" });
    const css = blocks(LOOK_CSS());
    const s = css.find((b) => b.sel === ".stamp")!.decl;
    expect(s).toMatchObject({ display: "var(--stamp-display)", "border-radius": "var(--r-stamp)", rotate: "var(--stamp-tilt)" });
    expect(s.border).toMatch(/currentColor/);
    expect(s["text-transform"]).toBeUndefined();
    // Working is the water's ("Squibby is acting"), mixed into the page's ink so it reads on Paper with a light water too.
    expect(css.find((b) => b.sel === '.stamp[data-stamp="working"]')?.decl.color).toBe("var(--stamp-working)");
    expect(root["--stamp-working"]).toBe("color-mix(in srgb, var(--water) 40%, var(--fg))");
    expect(css.find((b) => b.sel === '.stamp[data-stamp="proven"]')?.decl.color).toBe("var(--ok)");
    expect(css.find((b) => b.sel === '.stamp[data-stamp="needsYou"]')?.decl.color).toBe("var(--amber)");
    expect(css.find((b) => b.sel === ".unstamped")?.decl.display).toBe("var(--unstamped-display)");
    // M51 polish: upright (tilted read as stickers on a notebook); hairline edged, a small rounded label, not a capsule.
    expect(root["--stamp-tilt"]).toBe("0deg");
    expect(s.border).toBe("var(--hair) solid currentColor");
    expect(root["--r-stamp"]).toBe("4px");
    expect(css.find((b) => b.sel === '.stamp[data-stamp="new"]'), "no counter tilt for New").toBeUndefined();
  });
});

describe("the details are drawn in the lists", () => {
  const side = read("./homeSide.tsx"), card = read("./card.tsx"), practice = read("./practicePanel.tsx");
  test("the side list's recent work: a tile, its name on one line, then its badge, or the mark of how it ended", () => {
    // M71: the tile is the result's own colour (green proven, red failed, grey stopped, orange undone; meaning.ts).
    expect(side).toContain('<Tile colour={MEANING_COLOUR[i.status === "running" ? "working" : VERDICT_MEANING[(v as { kind: VerdictKind }).kind]]} icon={mark} size="place" />');
    expect(side).toContain("const stamp = sideStamp(historyStamp(i, now));");
    // Only what a person may act on or has not seen is badged there; Proven is its green tick, so the name has room.
    expect(SIDE_STAMPS).toEqual(["working", "needsYou", "new"]);
    expect(sideStamp("proven")).toBeNull();
    expect(sideStamp(null)).toBeNull();
    for (const k of SIDE_STAMPS) expect(sideStamp(k)).toBe(k);
    // 1 Nov 2026 (the review): in the side list a badge is its dot alone, so the names have room; the tooltip says it.
    expect(side).toContain("{stamp && <Stamp kind={stamp} dot />}");
    expect(side).toContain("title={stamp ? `${name}. ${S.look.stamp[stamp]}` : name}");
    expect(side).toMatch(/className=\{`side-mark\$\{stamp \? " unstamped" : ""\}`\}/);
    expect(card).toMatch(/<HomeSide [^>]*now=\{clock\}/);
    expect(WIDE_CSS()).toMatch(/\.side-mark\.unstamped \{ display: var\(--unstamped-display\); \}/);
  });
  // M71 (one structure): History and Learn are the one grouped list of the parts (ui/parts.tsx ListRow), each row's tile in
  // its meaning's colour; the badges and kind tiles of M51 step 3 gave way to it.
  test("History: each task a row of the grouped list, its tile coloured by how it ended, its name, one line and when", () => {
    expect(card).toContain("<Fragment key={h.id}><ListRow rowId={`history-${h.id}`} flash={focus === h.id} colour={MEANING_COLOUR[meaning]}");
    expect(card).toContain("const lineWords = [historyWords(h), (h.changed ?? 0) > 0 ? S.screens.filesChanged(h.changed ?? 0) : \"\"].filter(Boolean).join(\" · \");");
    // No card inside the page: History's list is the page.
    expect(card).toContain('<section className="panel bare hist" aria-label={S.recentTitle}>');
  });
  test("Learn: each practice a row with its own tile colour and number; a done one is green with a tick and says Done", () => {
    expect(practice).toContain('colour={state === "done" ? "green" : practiceColour(i)} icon={state === "done" ? "tick" : undefined} mark={state === "done" ? undefined : String(i + 1)}');
    expect(practice).toContain('fact={state === "done" ? S.practiceState.done : S.practiceMin(r.entry.minutes)}');
  });
  test("a stamp read by VoiceOver only where it is the only words (Learn); elsewhere the row already says it", () => {
    const marks = read("./itemMarks.tsx");
    expect(marks).toContain('aria-hidden={spoken ? undefined : "true"}');
    // Its words are the badge's own; the side list's dot (dot) has a small drawing and no words, its row's tooltip and name
    // carry them (the audit, item 31).
    expect(marks).toContain("{dot ? <Icon name={DOT_GLYPH[kind]} size={10} /> : S.look.stamp[kind]}");
  });
  test("Flowflow's short lines are a bubble with a tail, and (M71) no button is glossy any more", () => {
    const look = LOOK_CSS();
    expect(look).toMatch(/\n\.say \{[^}]*background: var\(--bubble\);/);
    expect(look).toMatch(/\n\.say::after \{[^}]*content: "";/);
    expect(look).not.toContain("button.gel.primary");
    expect(practice).not.toContain("primary gel");
  });
});

// M65 step 6 (the review): in Instrument the ask box's edge is the field's only boundary and its only focus cue (the
// textarea's own outline is transparent), so it is measured, at rest, on hover and in focus, against the page round it and
// the field's own fill, in every theme. Focus is plainly brighter than rest, so the cursor is never the only sign.
describe("Instrument's ask box: its edge stands out (3 to 1) at rest and in focus, in every theme", () => {
  const chrome = blocks(read("./ui/chrome.css"));
  const askRule = (sel: string) => chrome.find((b) => b.sel === `:root[data-style="instrument"] .home .askwrap .ask${sel}`)?.decl ?? {};
  test("the field's rules read the ask tokens", () => {
    expect(askRule("")["border-color"]).toBe("var(--ask-edge)");
    expect(askRule(":hover")["border-color"]).toBe("var(--ask-hover-edge)");
    expect(askRule(":focus-within")["border-color"]).toBe("var(--ask-focus-edge)");
  });
  for (const [name, t] of THEME_TOKENS.filter(([n]) => n.startsWith("Instrument"))) {
    test(name, () => {
      for (const under of ["--bg", "--surface-1", "--inset"]) {
        const u = colour(`var(${under})`, t);
        const edge = (k: string) => ratio(over(colour(`var(${k})`, t), u), u);
        expect(edge("--ask-edge"), `at rest on ${under}`).toBeGreaterThanOrEqual(3);
        expect(edge("--ask-hover-edge"), `on hover on ${under}`).toBeGreaterThanOrEqual(3);
        expect(edge("--ask-focus-edge"), `in focus on ${under}`).toBeGreaterThanOrEqual(3);
        expect(edge("--ask-focus-edge"), `focus is plainly brighter than rest on ${under}`).toBeGreaterThanOrEqual(edge("--ask-edge") * 2);
      }
    });
  }
});

// M51 polish: Settings' switches were white with a black knob in every water, and the picked option of a segmented choice
// was grey on grey, so what is picked barely showed and the water was nowhere in Settings. Both take the accent now: the
// water, mixed into the page's words so it reads in every theme with every water.
describe("the accent: what is picked in Settings, in the water chosen", () => {
  for (const [name, t0] of THEME_TOKENS) {
    test(`${name}: with every water, a switch that is on and a picked option stand out (3 to 1), and their words read`, () => {
      for (const w of WATERS) {
        const t = { ...t0, "--water": WATER_TINTS[w].mid };
        const accent = colour("var(--pick)", t), wash = colour("var(--pick-wash)", t);
        for (const under of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(accent, colour(`var(${under})`, t)), `${w}: the accent on ${under}`).toBeGreaterThanOrEqual(3);
        expect(ratio(colour("var(--pick-ink)", t), accent), `${w}: the knob and the tick on the accent`).toBeGreaterThanOrEqual(3);
        expect(ratio(colour("var(--fg)", t), wash), `${w}: a picked option's words on its wash`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(accent, wash), `${w}: a picked option's edge on its wash`).toBeGreaterThanOrEqual(3);
        // A switch that is on (the audit, item 24): the accent's deep blue with a white knob, as on the Mac. The track
        // stands out on every surface and the knob on the track (3 to 1 each).
        const track = colour("var(--switch-on)", t);
        for (const under of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(track, colour(`var(${under})`, t)), `${w}: a switch that is on, on ${under}`).toBeGreaterThanOrEqual(3);
        expect(ratio(colour("var(--knob-on)", t), track), `${w}: the on knob on its track`).toBeGreaterThanOrEqual(3);
      }
    });
  }
  test("the switch, the segmented choice and the picture choice use it; nothing else in the look is gated on it", () => {
    const parts = blocks(read("./ui/parts.css"));
    // The audit, item 24: the on knob was --pick-ink (the page's black), a dark hole on the track; it is white now, on the
    // accent's own deep blue (measured above).
    expect(parts.find((b) => b.sel === '.ui-switch[aria-checked="true"]')?.decl.background).toBe("var(--switch-on)");
    expect(parts.find((b) => b.sel === '.ui-switch[aria-checked="true"]::after')?.decl.background).toBe("var(--knob-on)");
    // M65: through tokens of its own, which are the accent's in Friendly and a neutral thumb with a 3 to 1 edge in Instrument.
    expect(parts.find((b) => b.sel === ".ui-seg-thumb")?.decl).toMatchObject({ background: "var(--seg-thumb)", border: "var(--hair) solid var(--seg-thumb-edge)" });
    expect(root["--seg-thumb"]).toBe("var(--pick-wash)");
    expect(root["--seg-thumb-edge"]).toBe("var(--pick)");
    expect(parts.find((b) => b.sel === '.ui-pic[aria-checked="true"]')?.decl["border-color"]).toBe("var(--pick)");
  });
  test("the dark look takes the deep washes (M72: the White block is gone)", () => {
    for (const tint of TINTS) expect(ratio(colour(`var(--tint-${tint})`, root), colour("var(--bg)", root)), `${tint}: a deep wash on Graphite`).toBeLessThan(1.6);
  });
});

describe("the look's big choices are pictures, on the Look page", () => {
  test("layout, theme, the main button and corners are chosen by looking, each option a small drawing", () => {
    const page = read("./settingsPage.tsx");
    for (const k of ["look.layout", "look.theme", "look.gloss", "look.corners", "look.colour"]) expect(page, k).toContain(`"${k}": (o) =>`);
    expect(page).toContain("if (d.key in LOOK_PICTURE) return <LookPictures ");
    const look = blocks(LOOK_CSS());
    // The theme pictures keep each theme's own colours, from fixed tokens, whatever theme is on.
    for (const t of ["graphite", "paper", "deep"]) {
      expect(look.find((b) => b.sel === `.sw-win[data-sw="${t}"]`)?.decl["--sw-bg"], t).toBe(`var(--sw-${t}-bg)`);
      expect(root[`--sw-${t}-bg`], t).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(root["--sw-graphite-bg"]).toBe(root["--bg"]);
  });
});
