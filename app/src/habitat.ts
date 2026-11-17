// M112: each character's habitat (docs/milestones/M112-squibby-notch-look.md). The founder, 16 Nov 2026: Squibby's own
// world is life from elsewhere ("extraterrestrial life organisms"), as an undertone, and "every other character will give
// you a different type of home screen... just the colours and everything, a little bit of design". So a character's look
// is a small typed habitat: which character it belongs to, how its glyphs are drawn, its empty state art and its notch
// details here, and its colours as one block of tokens in ui/tokens.css (`:root[data-habitat="<id>"]`, every name in
// HABITAT_TOKENS). The notch, Home, the cards and the bubbles read only the tokens, so a new habitat needs no page code:
// one entry here, one block of values there, and the art the founder supplies (never invented here).
// Colours live only in tokens.css; this file names them, never writes one.
import { useEffect } from "react";
import { COMPANIONS } from "./companion.ts";

/** Every colour (and the two numbers) a habitat must fill. The pages read them through tokens.css's habitat block. */
export const HABITAT_TOKENS = [
  // The one glow: the thing to press, focus, the place you are on.
  "--hab-accent", "--hab-accent-ink", "--hab-accent-text", "--hab-glow", "--hab-glow-soft", "--hab-rim", "--hab-membrane",
  // What the colours mean: proven, something to review, a risk, working (the character acting), listening (the mic on).
  // None of them is ever the accent (habitat.test.ts): the accent only means "press this".
  "--hab-ok", "--hab-ok-text", "--hab-review", "--hab-review-text", "--hab-risk", "--hab-risk-text", "--hab-working", "--hab-working-text",
  "--hab-listening", "--hab-listening-text",
  // Two quieter hues for kinds of things (a list's tiles), never a meaning.
  "--hab-violet", "--hab-rose",
  // The habitat's surfaces and words: black, with the faintest tint of its water.
  "--hab-surface-1", "--hab-surface-2", "--hab-surface-3", "--hab-fg", "--hab-fg-2", "--hab-fg-3",
  // The small chat and the character's bubbles.
  "--hab-them", "--hab-me", "--hab-me-ink", "--hab-field",
  // The glyphs' line, and how strongly a glyph's nucleus is filled.
  "--hab-glyph-stroke", "--hab-nucleus-a",
] as const;
export type HabitatToken = (typeof HABITAT_TOKENS)[number];

/** Words (4.5 to 1 on every surface) and marks (3 to 1), checked for every habitat by habitat.test.ts. */
export const HABITAT_TEXT: readonly HabitatToken[] = ["--hab-fg", "--hab-fg-2", "--hab-fg-3", "--hab-accent-text", "--hab-ok-text", "--hab-review-text", "--hab-risk-text", "--hab-working-text", "--hab-listening-text"];
export const HABITAT_MARKS: readonly HabitatToken[] = ["--hab-accent", "--hab-ok", "--hab-review", "--hab-risk", "--hab-working", "--hab-listening"];
export const HABITAT_SURFACES: readonly HabitatToken[] = ["--hab-surface-1", "--hab-surface-2", "--hab-surface-3", "--hab-them", "--hab-field"];
/** Words on a fill: [ink, fill]. */
export const HABITAT_PAIRS: readonly (readonly [HabitatToken, HabitatToken])[] = [["--hab-accent-ink", "--hab-accent"], ["--hab-me-ink", "--hab-me"], ["--hab-fg", "--hab-them"], ["--hab-fg", "--hab-field"]];

export type Habitat = {
  /** Its block in tokens.css: `:root[data-habitat="<id>"]`. */
  id: string;
  /** The character it belongs to (companion.ts COMPANIONS, skins.ts Skin id). */
  character: string;
  /** Its glyphs (icons.tsx: the places and tiles): `nucleus` fills each living shape's nucleus (by --hab-nucleus-a; off,
   *  style.css leaves it an outline). */
  glyphs: { nucleus: boolean };
  /** Its empty state art (ui/parts.tsx EmptyRow, the icons.tsx spores mark): a few small marks, never a scene. */
  emptyArt: "photophores" | "none";
  /** Its notch (ui/notch.css): the small light in the pill (a photophore; off, the pill has none) and whether that light
   *  breathes (never with Reduce Motion, never on something that waits). */
  notch: { photophore: boolean; breathe: boolean };
};

/** Flowflow's habitat, the one shipped: deep sea glow (the M112 choice, direction A). Its values: tokens.css. */
export const FLOWFLOW: Habitat = {
  id: "flowflow",
  character: "water",
  glyphs: { nucleus: true },
  emptyArt: "photophores",
  notch: { photophore: true, breathe: true },
};

/** Every habitat that ships. A character gets one only once the founder has supplied and approved its art. */
export const HABITATS: readonly Habitat[] = [FLOWFLOW];

/** The habitat of a character; a character with none lives in Flowflow's (never a page with no colours). */
export function habitatFor(character: string | null | undefined, list: readonly Habitat[] = HABITATS): Habitat {
  return list.find((h) => h.character === character) ?? list.find((h) => h.id === FLOWFLOW.id) ?? FLOWFLOW;
}

/** The character in force: the one that has a character today (companion.ts); the day there are more, the chosen one. */
export const activeCharacter = (): string => COMPANIONS.find((c) => c.ready)?.id ?? FLOWFLOW.character;

let current: Habitat = FLOWFLOW;
/** The habitat on the page now. */
export const currentHabitat = (): Habitat => current;

/** Puts a habitat on a page's root: its token block (data-habitat) and its glyph and notch switches, as data attributes
 *  only the token file and the parts' rules read. Switching at run time is this call again: nothing else changes. */
export function applyHabitat(root: HTMLElement, h: Habitat): void {
  current = h;
  root.dataset.habitat = h.id;
  root.dataset.glyphNucleus = h.glyphs.nucleus ? "on" : "off";
  root.dataset.notchPhotophore = h.notch.photophore ? "on" : "off";
  root.dataset.notchBreathe = h.notch.breathe ? "on" : "off";
}

/** The page's habitat, from the character in force (every page calls it through useLook). */
export function useHabitat(character: string = activeCharacter()): void {
  useEffect(() => { applyHabitat(document.documentElement, habitatFor(character)); }, [character]);
}

// ---------- reading the token file (the tests, and nothing at run time) ----------

/** Each `:root[data-habitat="<id>"]` block of a stylesheet, as its token names and values. */
export function habitatBlocks(css: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of text.matchAll(/:root\[data-habitat="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
    const vals = out.get(m[1]) ?? new Map<string, string>();
    for (const d of m[2].split(";")) { const c = d.indexOf(":"); if (c > 0) vals.set(d.slice(0, c).trim(), d.slice(c + 1).trim()); }
    out.set(m[1], vals);
  }
  return out;
}

/** The value a token takes on a root with this habitat: the last block for it wins, as in the cascade. */
export const tokenFor = (css: string, habitat: string, token: string): string | undefined => habitatBlocks(css).get(habitat)?.get(token);

// ---------- contrast (WCAG 2.2) ----------

/** #RGB, #RRGGBB, or rgb()/rgba() over a backdrop (alpha mixed onto it). */
export function rgbOf(c: string, over: [number, number, number] = [0, 0, 0]): [number, number, number] | null {
  const s = c.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) { const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join("") : hex[1]; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]; }
  const fn = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(s);
  if (!fn) return null;
  const a = fn[4] === undefined ? 1 : Number(fn[4]);
  return [1, 2, 3].map((i, k) => Number(fn[i]) * a + over[k] * (1 - a)) as [number, number, number];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** The contrast ratio of two colours, 1 to 21. */
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
