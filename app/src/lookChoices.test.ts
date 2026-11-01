// M51 step 3 (the founder, 1 Nov 2026: HeyClicky "looks so much better"; "I want customers to have as much customization as
// possible"). The details: a coloured tile per item in the lists, tilted stamps (working, new, proven, needs you), Flowflow's
// short lines in a bubble with a tail, one glossy pill. And the choices: Theme (Graphite, Paper, Deep), Density, Icons,
// Stamps, the glossy button and Corners. Each choice is a data attribute on the root and a token switch in ui/tokens.css.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyLook, applyLookChoices, choiceOf, LOOK_CHOICES, lookAttrs, themeOf, THEMES, WATER_TINTS, WATERS, type LookChoice } from "./lookfeel.ts";
import { glyphOf, historyStamp, KIND_GLYPH, SIDE_STAMPS, sideStamp, KIND_TINT, KINDS, kindOf, NEW_MINUTES, practiceStamp, STAMPS, taskName, TINTS } from "./itemLook.ts";
import { HIDDEN_OPTIONS, OPTION_ALIASES, PAGES, placeOf, shownValue } from "./settingsPages.ts";
import { S } from "./strings.ts";
import { ALL_CSS, LOOK_CSS, TOKENS_CSS, WIDE_CSS } from "./ui/cssFiles.ts";
import type { HistoryItem } from "./model.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const registry = JSON.parse(read("../../protocol/settings.json")) as { settings: { key: string; kind: string; default: unknown; options?: string[]; applies: string[]; section: string; live: boolean; store: string }[] };
const def = (k: string) => registry.settings.find((s) => s.key === k);
const KEYS = ["look.theme", "look.density", "look.icons", "look.stamps", "look.gloss", "look.corners", "look.light", "look.colour"] as const;

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
];

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
const ratio = (a: RGBA, b: RGBA) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("the choices are real settings, with their words and one place in Settings", () => {
  test("each is in the registry with a safe usual value, live, for the pages", () => {
    expect(def("look.theme")).toMatchObject({ kind: "choice", default: "graphite", options: ["graphite", "paper", "deep", "night"], applies: ["pages"], section: "look", live: true, store: "settings" });
    expect(def("look.density")).toMatchObject({ kind: "choice", default: "comfortable", options: ["comfortable", "compact"], applies: ["pages"], live: true });
    expect(def("look.icons")).toMatchObject({ kind: "choice", default: "colour", options: ["colour", "plain"], applies: ["pages"], live: true });
    expect(def("look.stamps")).toMatchObject({ kind: "switch", default: true, applies: ["pages"], live: true });
    expect(def("look.gloss")).toMatchObject({ kind: "choice", default: "on", options: ["on", "flat"], applies: ["pages"], live: true });
    expect(def("look.corners")).toMatchObject({ kind: "choice", default: "soft", options: ["soft", "crisp"], applies: ["pages"], live: true });
    // The brand language (1 Nov 2026): the light behind Home, moving by default, with Still and Off.
    expect(def("look.light")).toMatchObject({ kind: "choice", default: "moving", options: ["moving", "still", "off"], applies: ["pages"], live: true });
    // The founder (1 Nov 2026): "very colourful and out there". Vivid is the usual; Calm turns the colour down a step.
    expect(def("look.colour")).toMatchObject({ kind: "choice", default: "vivid", options: ["vivid", "calm"], applies: ["pages"], live: true });
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
    expect(S.set["look.theme"].options).toMatchObject({ graphite: "Graphite", paper: "Paper", deep: "Deep" });
    for (const q of ["dense", "compact", "crisp", "rounded", "glossy", "stamps", "icons", "graphite", "dark blue"]) {
      expect(KEYS.some((k) => [S.set[k].label, ...(S.set[k].also as readonly string[])].some((a) => a.toLowerCase().includes(q))), q).toBe(true);
    }
  });
  // M51 polish: the look was three levels deep (Settings, General, More options, Look) as words only. It is a page of its
  // own now, one press from the sidebar, beside the water's colour, and the big choices are pictures.
  test("all six sit on the Look page, with the layout and the water: Home first, then the details", () => {
    expect(PAGES.look.groups.map((g) => g.id)).toEqual(["look.home", "look.details"]);
    expect(PAGES.look.groups[0].items).toEqual(["look.layout", "look.theme", "look.colour", "look.water"]);
    expect(PAGES.look.groups[1].items).toEqual(["look.light", "look.gloss", "look.corners", "look.density", "look.icons", "look.stamps"]);
    expect(S.pages.look.title).toBe("Look");
    expect(S.setGroupTitles["look.home"]).toBe("Home");
    expect(S.setGroupTitles["look.details"]).toBe("Details");
    for (const k of [...KEYS, "look.layout", "look.water"]) expect(placeOf(k), k).toMatchObject({ page: "look", more: false });
    expect(PAGES.general.more.some((t) => t.id === "more.general.look")).toBe(false);
    // Home's topic keeps only how Home behaves and its size.
    expect(PAGES.general.more.find((t) => t.id === "more.general.home")!.items).toEqual(["home.closeOnClickAway", "home.stepAside", "home.goToNeeds", "home.size"]);
  });
  test("a theme saved before M51 still works: night reads as Graphite, in the row and on the page, and is not offered twice", () => {
    expect(HIDDEN_OPTIONS["look.theme"]).toEqual(["night"]);
    expect(OPTION_ALIASES["look.theme"]).toEqual({ night: "graphite" });
    expect(shownValue("look.theme", "night")).toBe("graphite");
    expect(shownValue("look.theme", "deep")).toBe("deep");
    expect(shownValue("look.water", "night")).toBe("night");
    expect(read("./settingsPage.tsx")).toContain("const value = shownValue(d.key, d.kind === \"custom\" ? snapshotNow()?.values[d.key] : setting(d.key));");
    expect(themeOf("night")).toBe("graphite");
    for (const t of THEMES) expect(themeOf(t)).toBe(t);
    for (const junk of [undefined, null, "", "Night", 3]) expect(themeOf(junk), String(junk)).toBe("graphite");
  });
});

describe("each choice is a data attribute on the root, never a branch in the code", () => {
  test("the usual values give the usual attributes, and odd values read as the usual", () => {
    expect(lookAttrs({})).toEqual({ "data-theme": "graphite", "data-density": "comfortable", "data-icons": "colour", "data-stamps": "on", "data-gloss": "on", "data-corners": "soft", "data-light": "moving", "data-colour": "vivid" });
    expect(lookAttrs({ "look.theme": "deep", "look.density": "compact", "look.icons": "plain", "look.stamps": false, "look.gloss": "flat", "look.corners": "crisp", "look.light": "off", "look.colour": "calm" }))
      .toEqual({ "data-theme": "deep", "data-density": "compact", "data-icons": "plain", "data-stamps": "off", "data-gloss": "flat", "data-corners": "crisp", "data-light": "off", "data-colour": "calm" });
    for (const k of Object.keys(LOOK_CHOICES) as LookChoice[]) for (const junk of [undefined, "", "Compact", 7]) expect(choiceOf(k, junk), `${k} ${String(junk)}`).toBe(LOOK_CHOICES[k].values[0]);
    // Every choice's first value is the registry's usual one; Stamps is a switch, on.
    for (const k of Object.keys(LOOK_CHOICES) as LookChoice[]) {
      const d = def(k)!;
      if (d.kind === "choice") expect(d.options, k).toEqual([...LOOK_CHOICES[k].values]);
      expect(choiceOf(k, d.default), k).toBe(LOOK_CHOICES[k].values[0]);
    }
  });
  test("Home sets them on its root and keeps them in step; the island and the character keep the notch's look", () => {
    const attrs: Record<string, string> = {};
    applyLookChoices({ setAttribute: (k, v) => { attrs[k] = v; } }, { "look.corners": "crisp" });
    expect(attrs).toEqual({ "data-density": "comfortable", "data-icons": "colour", "data-stamps": "on", "data-gloss": "on", "data-corners": "crisp", "data-light": "moving", "data-colour": "vivid" });
    const theme: Record<string, string> = {};
    applyLook({ style: { setProperty: () => {} }, setAttribute: (k, v) => { theme[k] = v; } }, "ocean", "night");
    expect(theme["data-theme"]).toBe("graphite");
    expect(read("./card.tsx")).toContain("useLook({ choices: true });");
    const hook = read("./useLook.ts");
    expect(hook).toContain("const choices = !!opts.choices && !opts.keepNight;");
    expect(hook).toMatch(/useSetting\("look\.density"\)[\s\S]*useSetting\("look\.corners"\)/);
    expect(read("./island.tsx")).not.toContain("choices: true");
    expect(read("./dock.tsx")).not.toContain("choices: true");
  });
  test("only tokens.css reads the attributes, and nothing else in the code branches on the choices' values", () => {
    const css = ALL_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
    const outside = css.replace(TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, ""), "");
    for (const a of ["data-theme", "data-density", "data-icons", "data-stamps", "data-gloss", "data-corners", "data-light", "data-colour"]) expect(outside, a).not.toContain(`[${a}=`);
    for (const f of ["./card.tsx", "./homeSide.tsx", "./practicePanel.tsx", "./itemMarks.tsx", "./itemLook.ts"]) {
      const src = read(f);
      for (const k of ["look.density", "look.icons", "look.stamps", "look.gloss", "look.corners", "look.light", "look.colour"]) expect(src, `${f} reads ${k}`).not.toContain(`"${k}"`);
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
    expect(Object.keys(p)).toHaveLength(TINTS.length * 2);
    expect(sw("stamps", "off")).toEqual({ "--stamp-display": "none", "--unstamped-display": "inline-flex" });
  });
  test("Deep is a full theme: its own surfaces, words and lines, with a cool cast, and More contrast for it", () => {
    const d = block(':root[data-theme="deep"]');
    for (const k of ["--bg", "--surface-1", "--surface-2", "--surface-3", "--inset", "--fg", "--fg-2", "--fg-3", "--line", "--line-strong", "--edge-control", "--pond", "--bubble", "--key-fill"]) expect(d[k], k).toBeTruthy();
    const [r, g, b] = colour(d["--bg"], d);
    expect(b, "a sea blue").toBeGreaterThan(r + 12);
    expect(b).toBeGreaterThan(g);
    expect(Object.keys(block(':root[data-theme="deep"]', MORE))).toEqual(expect.arrayContaining(["--line", "--line-strong", "--fg-2", "--edge-control"]));
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
    expect(card).toContain("const name = taskName(h.label);");
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
    expect(STAMPS).toEqual(["working", "new", "proven", "needsYou"]);
    expect(historyStamp(h({ status: "running", endedAt: null }), NOW)).toBe("working");
    expect(historyStamp(h({ status: "needs_you" }), NOW)).toBe("needsYou");
    expect(historyStamp(h({ proof: "passed" }), NOW)).toBe("proven");
    expect(historyStamp(h({ proof: "passed", endedAt: "2026-11-01T11:59:00Z" }), NOW), "proven says more than new").toBe("proven");
    // New: an answer or a change that finished in the last ten minutes, not yet proven.
    expect(NEW_MINUTES).toBe(10);
    expect(historyStamp(h({ endedAt: "2026-11-01T11:55:00Z" }), NOW)).toBe("new");
    expect(historyStamp(h({ endedAt: "2026-11-01T11:49:00Z" }), NOW)).toBeNull();
    expect(historyStamp(h({ changed: 0, endedAt: "2026-11-01T11:58:00Z" }), NOW)).toBe("new");
    // A failure, a stop, an undo or a limit is never new or proven: its own mark says it.
    for (const o of [{ status: "not_done", proof: "failed" }, { status: "interrupted" }, { undone: true }, { status: "daily_limit" }, { status: "error" }] as Partial<HistoryItem>[]) {
      expect(historyStamp(h({ ...o, endedAt: "2026-11-01T11:59:00Z" }), NOW), JSON.stringify(o)).toBeNull();
    }
    expect(historyStamp(h({ endedAt: "not a date" }), NOW)).toBeNull();
    expect(practiceStamp("done")).toBe("proven");
    expect(practiceStamp("inProgress")).toBeNull();
    expect(practiceStamp("notStarted")).toBeNull();
  });
  test("their words are sentence case, never capitals; the look is a small upright outlined badge, in its meaning's colour", () => {
    expect(S.look.stamp).toEqual({ working: "Working", new: "New", proven: "Proven", needsYou: "Needs you" });
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
    expect(side).toContain("<ItemTile label={name} />");
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
  test("History: each task with its tile, its name, one quiet line, and its badge at the end, saying how it ended once", () => {
    expect(card).toContain("<ItemTile label={name} big />");
    expect(card).toContain("{stamp && <Stamp kind={stamp} spoken />}");
    // The words for how it ended hide while the badge says it (and show again with badges off), so it is never said twice.
    expect(card).toContain('<span className={stamp ? "unstamped" : undefined}>{historyWords(h)}');
    expect(LOOK_CSS()).toMatch(/\n\.hist-row \{[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto;/);
    // No card inside the page: History's list is the page.
    expect(card).toContain('<section className="panel bare hist" aria-label={S.recentTitle}>');
  });
  test("Learn: each practice with its tile; a done one is stamped Proven, its plain words kept for when stamps are off", () => {
    // Every practice is a stuck moment to fix, so its drawing is the wrench, whatever its title says ("add" is not "make").
    expect(practice).toContain('<ItemTile label={r.title} big kind="fix" />');
    expect(practice).toContain("{practiceStamp(r.state) && <Stamp kind={practiceStamp(r.state)!} spoken />}");
    expect(practice).toMatch(/className=\{`pr-state\$\{practiceStamp\(r\.state\) \? " unstamped" : ""\}`\}/);
  });
  test("a stamp read by VoiceOver only where it is the only words (Learn); elsewhere the row already says it", () => {
    const marks = read("./itemMarks.tsx");
    expect(marks).toContain('aria-hidden={spoken ? undefined : "true"}');
    // Its words are the badge's own; the side list's dot alone (dot) has none, its row's tooltip and name carry them.
    expect(marks).toContain("{dot ? null : S.look.stamp[kind]}");
  });
  test("Flowflow's short lines are a bubble with a tail, and there is one glossy pill per view", () => {
    const look = LOOK_CSS();
    expect(look).toMatch(/\n\.say \{[^}]*background: var\(--bubble\);/);
    expect(look).toMatch(/\n\.say::after \{[^}]*content: "";/);
    expect(look).toContain("button.gel.primary, .hero-main button.primary {");
    // The practice card's one gel pill is its Fix button; nothing else in a view asks for the gel.
    expect((practice.match(/primary gel/g) ?? []).length).toBe(1);
    expect(card).not.toContain("gel");
  });
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
      }
    });
  }
  test("the switch, the segmented choice and the picture choice use it; nothing else in the look is gated on it", () => {
    const parts = blocks(read("./ui/parts.css"));
    expect(parts.find((b) => b.sel === '.ui-switch[aria-checked="true"]')?.decl.background).toBe("var(--pick)");
    expect(parts.find((b) => b.sel === '.ui-switch[aria-checked="true"]::after')?.decl.background).toBe("var(--pick-ink)");
    expect(parts.find((b) => b.sel === ".ui-seg-thumb")?.decl).toMatchObject({ background: "var(--pick-wash)", border: "var(--hair) solid var(--pick)" });
    expect(parts.find((b) => b.sel === '.ui-pic[aria-checked="true"]')?.decl["border-color"]).toBe("var(--pick)");
  });
  test("Paper keeps the pastel tiles with a deep ink; the dark themes take the deep washes", () => {
    const paper = block(':root[data-theme="paper"]');
    expect(paper["--tint-rose"]).toBe("#FFD3E2");
    expect(paper["--tint-rose-ink"]).toBe("#8C2350");
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
    expect(root["--sw-paper-bg"]).toBe(block(':root[data-theme="paper"]')["--bg"]);
    expect(root["--sw-deep-bg"]).toBe(block(':root[data-theme="deep"]')["--bg"]);
  });
});
