// M112: the per character habitat (habitat.ts, ui/tokens.css). Tests first: the chooser, every habitat filling every
// token, the contrast of each habitat's words and meaning colours (WCAG AA), and switching habitat at run time with no page
// code change, proven with a second, plain habitat that exists only here.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { TOKENS_CSS } from "./ui/cssFiles.ts";
import {
  activeCharacter, applyHabitat, contrast, currentHabitat, FLOWFLOW, HABITAT_MARKS, HABITAT_PAIRS, HABITAT_SURFACES, HABITAT_TEXT,
  HABITAT_TOKENS, HABITATS, habitatBlocks, habitatFor, rgbOf, tokenFor, type Habitat,
} from "./habitat.ts";
import { MEANING_COLOUR, PLACE_COLOUR } from "./meaning.ts";

// A plain habitat for the tests only (never shipped: the founder supplies every character's art). Grey and simple, but
// complete, so it proves a new character is one block of values and one entry, nothing else.
const PLAIN: Habitat = { id: "plain-test", character: "test-character", glyphs: { nucleus: false }, emptyArt: "none", notch: { photophore: false, breathe: false } };
const PLAIN_CSS = `:root[data-habitat="plain-test"] {
  --hab-accent: #E0E0E0; --hab-accent-ink: #111111; --hab-accent-text: #E0E0E0; --hab-glow: rgba(255, 255, 255, .2); --hab-glow-soft: rgba(255, 255, 255, .1);
  --hab-rim: rgba(255, 255, 255, .2); --hab-membrane: rgba(255, 255, 255, .1);
  --hab-ok: #4CC27F; --hab-ok-text: #7AD9A2; --hab-review: #F0B040; --hab-review-text: #F4C46A; --hab-risk: #F06060; --hab-risk-text: #FF8C8C;
  --hab-working: #70B0FF; --hab-working-text: #9CC8FF; --hab-listening: #E0A0F0; --hab-listening-text: #ECC0F8; --hab-violet: #B0A0FF; --hab-rose: #FF9CC8;
  --hab-surface-1: #121212; --hab-surface-2: #1A1A1A; --hab-surface-3: #242424;
  --hab-fg: #F5F5F5; --hab-fg-2: #B0B0B0; --hab-fg-3: #949494;
  --hab-them: #1C1C1C; --hab-me: #2E2E2E; --hab-me-ink: #F5F5F5; --hab-field: #141414;
  --hab-glyph-stroke: 1.5; --hab-nucleus-a: 0;
}`;
const CSS = TOKENS_CSS();
const LIVE = [...HABITATS.map((h) => ({ h, css: CSS })), { h: PLAIN, css: PLAIN_CSS }];
const BLACK: [number, number, number] = [0, 0, 0];

describe("the habitat chooser", () => {
  test("Flowflow's character lives in Flowflow's habitat, the one shipped", () => {
    expect(HABITATS.map((h) => h.id)).toEqual(["flowflow"]);
    expect(habitatFor("water")).toBe(FLOWFLOW);
    expect(habitatFor(activeCharacter())).toBe(FLOWFLOW);
  });
  test("a character with no habitat of its own, or none at all, lives in Flowflow's, never a page with no colours", () => {
    for (const c of ["guide", "voice", "files", "", null, undefined]) expect(habitatFor(c)).toBe(FLOWFLOW);
  });
  test("a habitat added to the list is chosen for its own character, and the others keep theirs", () => {
    const list = [...HABITATS, PLAIN];
    expect(habitatFor("test-character", list)).toBe(PLAIN);
    expect(habitatFor("water", list)).toBe(FLOWFLOW);
  });
});

describe("every habitat fills every token", () => {
  for (const { h, css } of LIVE) test(h.id, () => {
    const block = habitatBlocks(css).get(h.id);
    expect(block, `:root[data-habitat="${h.id}"] in tokens.css`).toBeTruthy();
    expect(HABITAT_TOKENS.filter((t) => !block!.get(t))).toEqual([]);
    // And nothing it does not own: a habitat block only sets --hab- tokens (the map from them is one shared block).
    expect([...block!.keys()].filter((k) => !k.startsWith("--hab-"))).toEqual([]);
  });
  test("the token file maps the page's own tokens from the habitat's, once, for every habitat", () => {
    const shared = CSS.replace(/\/\*[\s\S]*?\*\//g, "").match(/:root\[data-habitat\]\s*\{([^}]*)\}/);
    expect(shared).toBeTruthy();
    for (const t of ["--acc", "--acc-ink", "--ok", "--amber", "--bad", "--water", "--fg", "--fg-2", "--fg-3", "--surface-1", "--focus", "--c-blue", "--c-green", "--c-orange", "--c-red"])
      expect(shared![1], t).toMatch(new RegExp(`${t}:\\s*var\\(--hab-`));
  });
});

describe("contrast of each habitat (WCAG AA)", () => {
  for (const { h, css } of LIVE) {
    const v = (t: string): [number, number, number] => { const c = tokenFor(css, h.id, t); const rgb = c ? rgbOf(c) : null; if (!rgb) throw new Error(`${h.id} ${t}: ${c}`); return rgb; };
    const surfacesOf = () => [BLACK, ...HABITAT_SURFACES.map(v)];
    test(`${h.id}: every word is 4.5 to 1 or more on black and on every surface`, () => {
      for (const t of HABITAT_TEXT) for (const s of surfacesOf()) expect(contrast(v(t), s), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
    });
    test(`${h.id}: every meaning colour and the accent are 3 to 1 or more as marks`, () => {
      for (const t of HABITAT_MARKS) for (const s of surfacesOf()) expect(contrast(v(t), s), `${t} on ${s}`).toBeGreaterThanOrEqual(3);
    });
    test(`${h.id}: words on a fill are 4.5 to 1 or more`, () => {
      for (const [ink, fill] of HABITAT_PAIRS) expect(contrast(v(ink), v(fill)), `${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5);
    });
    test(`${h.id}: the four meanings can be told apart from each other and from the accent`, () => {
      const hues = HABITAT_MARKS.map((t) => v(t).join(","));
      expect(new Set(hues).size).toBe(HABITAT_MARKS.length);
    });
  }
});

describe("switching habitat at run time", () => {
  const root = () => ({ dataset: {} as Record<string, string> }) as unknown as HTMLElement;
  test("applying a habitat sets its block and its switches on the root, and applying another replaces them", () => {
    const r = root();
    applyHabitat(r, FLOWFLOW);
    expect(r.dataset).toMatchObject({ habitat: "flowflow", glyphNucleus: "on", notchPhotophore: "on", notchBreathe: "on" });
    expect(currentHabitat()).toBe(FLOWFLOW);
    applyHabitat(r, PLAIN);
    expect(r.dataset).toMatchObject({ habitat: "plain-test", glyphNucleus: "off", notchPhotophore: "off", notchBreathe: "off" });
    expect(currentHabitat()).toBe(PLAIN);
    applyHabitat(r, FLOWFLOW);
  });
  test("the same token takes the new habitat's value: the cascade does the switch, not the page", () => {
    const both = CSS + "\n" + PLAIN_CSS;
    expect(tokenFor(both, "flowflow", "--hab-accent")).toBe(tokenFor(CSS, "flowflow", "--hab-accent"));
    expect(tokenFor(both, "plain-test", "--hab-accent")).toBe("#E0E0E0");
  });
  test("no page and no other stylesheet names a habitat: they read the tokens only", () => {
    const src = new URL("./", import.meta.url), ui = new URL("./ui/", import.meta.url);
    const pages = readdirSync(src).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && f !== "habitat.ts").map((f) => [f, readFileSync(new URL(f, src), "utf8")] as const);
    const sheets = [["style.css", readFileSync(new URL("style.css", src), "utf8")] as const, ...readdirSync(ui).filter((f) => f.endsWith(".css") && f !== "tokens.css").map((f) => [f, readFileSync(new URL(f, ui), "utf8")] as const)];
    for (const [f, t] of [...pages, ...sheets]) {
      expect(t, f).not.toMatch(/data-habitat\s*=|\bFLOWFLOW\b/);
      // A colour of a habitat is written only in tokens.css.
      if (f.endsWith(".css")) expect(t.match(/--hab-[\w-]+\s*:/g) ?? [], f).toEqual([]);
    }
  });
});

// M112 review: Calm (look.colour) under a habitat must keep every tile the dark wash, so the habitat's light mark stays a
// mark (3 to 1 or more), and the "something waits" meanings Calm leaves alone stay unlike the accent.
describe("Calm colours under the habitat", () => {
  const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (sel: string) => {
    const at = plain.indexOf(sel + " {");
    if (at < 0) throw new Error(sel);
    const body = plain.slice(plain.indexOf("{", at) + 1, plain.indexOf("}", at));
    return new Map(body.split(";").map((d) => { const c = d.indexOf(":"); return [d.slice(0, c).trim(), d.slice(c + 1).trim()] as const; }).filter(([k]) => k));
  };
  const calm = block(':root[data-habitat][data-colours="calm"]');
  const shared = block(":root[data-habitat]");
  // Resolve a token the way the cascade does on a Flowflow root in Calm: Calm, then the shared map, then the habitat.
  const resolve = (v: string, h: Habitat, depth = 0): [number, number, number] => {
    if (depth > 12) throw new Error(`loop at ${v}`);
    v = v.trim();
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    if (ref) {
      const t = ref[1]!;
      const next = calm.get(t) ?? shared.get(t) ?? tokenFor(CSS, h.id, t);
      if (!next) throw new Error(`no value for ${t}`);
      return resolve(next, h, depth + 1);
    }
    const mix = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(#[0-9a-fA-F]{6})\)$/);
    if (mix) {
      const a = resolve(mix[1]!, h, depth + 1), b = rgbOf(mix[3]!)!, p = Number(mix[2]) / 100;
      return [0, 1, 2].map((i) => Math.round(a[i]! * p + b[i]! * (1 - p))) as [number, number, number];
    }
    const rgb = rgbOf(v);
    if (!rgb) throw new Error(`cannot read ${v}`);
    return rgb;
  };
  const HUES = ["blue", "purple", "orange", "pink", "green", "red", "teal"];
  for (const h of HABITATS) {
    test(`${h.id}: in Calm every tile is the same dark wash, and the mark on it is 3 to 1 or more`, () => {
      const mark = resolve("var(--c-mark)", h);
      const blue = resolve("var(--c-blue-tile)", h);
      for (const hue of HUES) {
        const tile = resolve(`var(--c-${hue}-tile)`, h);
        expect(tile, hue).toEqual(blue);
        expect(contrast(mark, tile), `mark on the ${hue} tile`).toBeGreaterThanOrEqual(3);
      }
    });
    test(`${h.id}: Calm never remaps the waiting meanings, so they stay unlike the accent`, () => {
      for (const t of ["--amber", "--bad", "--acc"]) expect(calm.has(t), t).toBe(false);
      const acc = resolve("var(--acc)", h).join(",");
      expect(resolve("var(--amber)", h).join(",")).not.toBe(acc);
      expect(resolve("var(--bad)", h).join(",")).not.toBe(acc);
    });
  }
});

// M112, compared with the best (17 Nov 2026): HeyClicky and CodeRabbit keep one colour for "press this". A row's own
// action ("Start practice") took its row's hue, so it read lavender beside the cyan teal main button. Under a habitat
// every row action is the habitat's accent words, whatever the row's tile; tags and facts keep their meaning colour.
describe("one colour for every action under a habitat", () => {
  const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const shared = plain.match(/:root\[data-habitat\]\s*\{([^}]*)\}/)![1]!;
  const parts = readFileSync(new URL("./ui/parts.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  test("the shared map gives row actions the accent's words and the accent's soft fill", () => {
    expect(shared).toMatch(/--row-act-fg:\s*var\(--hab-accent-text\)/);
    expect(shared).toMatch(/--row-act-soft:\s*var\(--acc-tint\)/);
  });
  test("a row action reads those tokens first, its row's hue only with no habitat on the root", () => {
    const rule = parts.match(/\.ui-mrow-act\s*\{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/color:\s*var\(--row-act-fg,\s*var\(--mc-text\)\)/);
    const hover = parts.match(/\.ui-mrow-act:hover\s*\{([^}]*)\}/)![1]!;
    expect(hover).toMatch(/background:\s*var\(--row-act-soft,\s*var\(--mc-soft\)\)/);
  });
  for (const h of HABITATS) test(`${h.id}: the action words are 4.5 to 1 or more on every surface`, () => {
    const fg = rgbOf(tokenFor(CSS, h.id, "--hab-accent-text")!)!;
    for (const s of [BLACK, ...HABITAT_SURFACES.map((t) => rgbOf(tokenFor(CSS, h.id, t)!)!)]) expect(contrast(fg, s)).toBeGreaterThanOrEqual(4.5);
  });
});

// M112 review (17 Nov 2026): the accent and "working" were the same cyan. The shared map lit --c-blue (working's colour)
// in the accent, and the working ring read the focus light, so every working tile, dot and tag looked like the thing to
// press. Under a habitat the accent means "press this" and nothing else: no meaning resolves to it, and the places are lit
// in the accent itself (their own part colour, "accent"), never in a meaning's name.
describe("the accent is never a meaning", () => {
  const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const body = (sel: string) => {
    const re = new RegExp(`(^|\\})\\s*${sel.replace(/[[\]()"=.*]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
    const m = plain.match(re);
    if (!m) throw new Error(sel);
    return new Map(m[2]!.split(";").map((d) => { const c = d.indexOf(":"); return [d.slice(0, c).trim(), d.slice(c + 1).trim()] as const; }).filter(([k]) => k));
  };
  const base = body(":root"), shared = body(":root[data-habitat]");
  const resolve = (v: string, h: Habitat, depth = 0): [number, number, number] => {
    if (depth > 12) throw new Error(`loop at ${v}`);
    v = v.trim();
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    if (ref) {
      const t = ref[1]!;
      const next = shared.get(t) ?? tokenFor(CSS, h.id, t) ?? base.get(t);
      if (!next) throw new Error(`no value for ${t}`);
      return resolve(next, h, depth + 1);
    }
    const mix = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(#[0-9a-fA-F]{6})\)$/);
    if (mix) {
      const a = resolve(mix[1]!, h, depth + 1), b = rgbOf(mix[3]!)!, p = Number(mix[2]) / 100;
      return [0, 1, 2].map((i) => Math.round(a[i]! * p + b[i]! * (1 - p))) as [number, number, number];
    }
    const rgb = rgbOf(v);
    if (!rgb) throw new Error(`cannot read ${v}`);
    return rgb;
  };
  for (const h of HABITATS) {
    const accent = resolve("var(--hab-accent)", h).join(","), accentText = resolve("var(--hab-accent-text)", h).join(",");
    test(`${h.id}: no meaning's colour, or its words, is the accent`, () => {
      for (const [m, c] of Object.entries(MEANING_COLOUR)) {
        expect(resolve(`var(--c-${c})`, h).join(","), `${m} (${c})`).not.toBe(accent);
        expect(resolve(`var(--c-${c}-text)`, h).join(","), `${m} (${c}) words`).not.toBe(accentText);
      }
    });
    test(`${h.id}: working is the habitat's working colour, and its ring too`, () => {
      expect(resolve(`var(--c-${MEANING_COLOUR.working})`, h)).toEqual(resolve("var(--hab-working)", h));
      expect(shared.get("--ring-working")).toBe("var(--hab-working)");
    });
    test(`${h.id}: every meaning colour is its own (working, listening and a practice never share one)`, () => {
      const used = [...new Set(Object.values(MEANING_COLOUR))].filter((c) => c !== "grey");
      const values = used.map((c) => resolve(`var(--c-${c})`, h).join(","));
      expect(new Set(values).size, used.join(" ")).toBe(used.length);
    });
  }
  test("the places are lit in the accent itself: their own part colour, never a meaning's", () => {
    for (const [p, c] of Object.entries(PLACE_COLOUR)) expect(["accent", "grey"], p).toContain(c);
    const accentPart = plain.match(/\[data-c="accent"\]\s*\{([^}]*)\}/);
    expect(accentPart, '[data-c="accent"] in tokens.css').toBeTruthy();
    expect(accentPart![1]).toMatch(/--mc:\s*var\(--acc\)/);
    expect(accentPart![1]).toMatch(/--mc-soft:\s*var\(--acc-tint\)/);
    expect(accentPart![1]).toMatch(/--mc-text:\s*var\(--acc-text\)/);
  });
});

// M112 review: the habitat's switches were set on the root but read by nothing, and two required tokens were used nowhere,
// so a second character with other switches looked exactly like Flowflow. Every switch now has the rule that reads it, and
// every token a habitat must fill is read by the page.
describe("every habitat switch and token is read", () => {
  const sheets = () => {
    const src = new URL("./", import.meta.url), ui = new URL("./ui/", import.meta.url);
    return [readFileSync(new URL("style.css", src), "utf8"), ...readdirSync(ui).filter((f) => f.endsWith(".css")).map((f) => readFileSync(new URL(f, ui), "utf8"))].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  };
  test("a switch set by applyHabitat has a rule keyed on each of its values", () => {
    const r = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyHabitat(r, PLAIN);
    const keys = Object.keys(r.dataset).filter((k) => k !== "habitat");
    applyHabitat(r, FLOWFLOW);
    expect(keys.sort()).toEqual(["glyphNucleus", "notchBreathe", "notchPhotophore"]);
    const css = sheets();
    const attr = (k: string) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    for (const k of keys) expect(css, attr(k)).toMatch(new RegExp(`\\[${attr(k)}(="(on|off)")?\\]`));
  });
  test("a glyph's nucleus is unfilled in a habitat that says so, and the pill's own light is gone without a photophore", () => {
    const css = sheets();
    expect(css).toMatch(/:root\[data-glyph-nucleus="off"\] \.ic \.hg-n\s*\{\s*fill-opacity:\s*0;?\s*\}/);
    expect(css).toMatch(/:root:not\(\[data-notch-photophore="on"\]\) \.island-panel button\.nb-pill::before\s*\{\s*content:\s*none;?\s*\}/);
  });
  test("every token a habitat fills is read outside the habitats' own blocks", () => {
    const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/:root\[data-habitat="[\w-]+"\]\s*\{[^}]*\}/g, "");
    const all = plain + "\n" + sheets();
    expect(HABITAT_TOKENS.filter((t) => !all.includes(`var(${t})`) && !all.includes(`var(${t},`))).toEqual([]);
  });
  test("the habitat's notes point to files that exist", () => {
    const src = readFileSync(new URL("./habitat.ts", import.meta.url), "utf8");
    for (const f of src.match(/[\w.]+\.(tsx?|css)\b/g) ?? []) {
      const ok = [new URL(`./${f}`, import.meta.url), new URL(`./ui/${f}`, import.meta.url)].some((u) => { try { readFileSync(u); return true; } catch { return false; } });
      expect(ok, f).toBe(true);
    }
  });
});
