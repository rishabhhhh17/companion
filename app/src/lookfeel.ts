// Look and feel (M19, "make it yours"): the water's colour, Home's theme, how lively the character is, and its size. The
// choices are settings (protocol/settings.json, section "look"); this file turns them into colours and numbers, with no
// page, so every rule can be tested (lookfeel.test.ts). One water colour tints everything that is water, together: Flowflow,
// the drop and its ring, and the waterline, the way HeyClicky's colours match across the notch. Never the safety marks:
// amber still means waiting, red a refusal, green done, and lime still means "do this".

export const WATERS = ["ocean", "lagoon", "lime", "berry", "midnight"] as const;
export type Water = (typeof WATERS)[number];
/** A water: `hi` the light in it, `mid` its body (also the surface line and the drop), `deep` its shadow, `sea` and `seaDeep`
 *  the water under Home's waterline, top and bottom; `hue` its hue in degrees, to turn Flowflow's pictures. */
export type WaterTint = { hi: string; mid: string; deep: string; sea: string; seaDeep: string; hue: number };
export const WATER_TINTS: Record<Water, WaterTint> = {
  ocean: { hi: "#C9F1FF", mid: "#59D2FF", deep: "#1676C8", sea: "#04182A", seaDeep: "#020C15", hue: 200 },
  lagoon: { hi: "#C8FFF1", mid: "#3FE0C0", deep: "#0E8F86", sea: "#032320", seaDeep: "#01110F", hue: 168 },
  lime: { hi: "#F1FFC4", mid: "#B8EE3A", deep: "#5E9A0E", sea: "#141F04", seaDeep: "#0A1002", hue: 80 },
  berry: { hi: "#FFD6F1", mid: "#FF6FC8", deep: "#B0247E", sea: "#260818", seaDeep: "#12040C", hue: 322 },
  midnight: { hi: "#DAD6FF", mid: "#8C80FF", deep: "#4234C8", sea: "#0D0A2A", seaDeep: "#060515", hue: 246 },
};
export function waterOf(v: unknown): Water { return typeof v === "string" && (WATERS as readonly string[]).includes(v) ? (v as Water) : "ocean"; }
/** How far to turn the hue of Flowflow's pictures (drawn in ocean blue) to reach this water. */
export function hueTurn(w: Water): number { return WATER_TINTS[w].hue - WATER_TINTS.ocean.hue; }

/** Home's theme (look.theme, M51; 2 Nov 2026; retired in M71, kept so a stored value still parses): Black, the usual (the founder: "make dark theme where you make everything
 *  black ... so we gonna have white and black"), Graphite, Deep (dark sea blue) or White. White is stored as "paper", the
 *  value it had before, so a saved choice never breaks. A "night" saved before M51 reads as Graphite, the dark look that
 *  replaced it; anything else odd is the usual, Black. */
export const THEMES = ["black", "paper", "graphite", "deep"] as const;
export type Theme = (typeof THEMES)[number];
export const USUAL_THEME: Theme = "black";
export function themeOf(v: unknown): Theme {
  if (v === "night") return "graphite";
  return typeof v === "string" && (THEMES as readonly string[]).includes(v) ? (v as Theme) : USUAL_THEME;
}
/** Whether each theme is a dark page or a light one (data-tone on the root), so a rule that only cares about that never
 *  names a theme, and a new theme needs one line here (the audit, item 10). */
export const THEME_TONE: Record<Theme, "dark" | "light"> = { graphite: "dark", deep: "dark", black: "dark", paper: "light" };

/** M71, black with colour (5 Nov 2026, the founder: "I need it to be black with accents of different color", and "I don't
 *  want to do this again and again"): the look is one look. Home and the notch's panel are pure black, and colour marks
 *  meaning only (meaning.ts, ui/tokens.css). The Look page offers four things: Colour, Character, Layout and Text size.
 *  The keys that made the old patchwork are retired. Their stored values still load (the registry keeps them, hidden), and
 *  nothing reads them: a store with Friendly, Vivid and Deep shows the same black look as a new one. */
export const RETIRED_LOOK_KEYS = ["look.theme", "look.water", "look.gloss", "look.light", "look.corners", "look.icons", "look.stamps", "look.style", "look.density"] as const;
/** Colour (look.colour): Colourful, the usual, gives each place and each kind of news its own colour; Calm keeps the same
 *  structure with blue as the only colour. A stored "vivid" (retired) reads as Colourful, the old usual "calm" as Calm. */
export const COLOUR_CHOICES = ["colourful", "calm"] as const;
export type ColourChoice = (typeof COLOUR_CHOICES)[number];
export const colourChoiceOf = (v: unknown): ColourChoice => (v === "calm" ? "calm" : "colourful");
/** The root's attributes that the retired keys used to set, now fixed: the stylesheets keep their one black look on them
 *  until the clean up removes the old blocks (M71 part 2). */
export const FIXED_LOOK: Readonly<Record<string, string>> = {
  "data-theme": "black", "data-tone": "dark", "data-style": "instrument", "data-density": "comfortable", "data-icons": "plain", "data-stamps": "on",
  "data-gloss": "flat", "data-corners": "soft", "data-light": "off", "data-colour": "calm",
};
/** The character (look.character): the Visor, the usual, a glass orb with a band of light; the glass orb; or the water
 *  character (stored "friendly", the one with a face, bubbles and its water). "match" (from before M71) and anything else
 *  is the Visor. The retired style no longer picks it. */
export const CHARACTER_CHOICES = ["visor", "orb", "friendly"] as const;
export type CharacterChoice = (typeof CHARACTER_CHOICES)[number];
export type CharacterLook = CharacterChoice;
export function characterOf(character: unknown, style?: unknown): CharacterLook {
  if (character === "orb" || character === "friendly" || character === "visor") return character;
  // M71: "match" (or nothing chosen) under the retired Friendly style was the water character; it stays that (the founder).
  return style === "friendly" ? "friendly" : "visor";
}
/** The faceless characters (the Visor and the glass orb): the ring says the state, never the friendly one's moves. */
export const faceless = (look: CharacterLook): boolean => look !== "friendly";
/** Every look attribute for the saved values: the fixed look, the colour and the character. Retired keys are ignored. */
export function lookAttrs(values: Partial<Record<string, unknown>>): Record<string, string> {
  return { ...FIXED_LOOK, "data-colours": colourChoiceOf(values["look.colour"]), "data-character": characterOf(values["look.character"], values["look.style"]) };
}
/** Sets the look on a page's root (Home and Settings). */
export function applyLookChoices(root: { setAttribute: (k: string, v: string) => void }, values: Partial<Record<string, unknown>>): void {
  for (const [k, v] of Object.entries(lookAttrs(values))) root.setAttribute(k, v);
}

/** The CSS custom properties a page sets for the water chosen (style.css reads only these for water), with the turn of hue
 *  for Flowflow's pictures. */
export function waterVars(w: Water): Record<string, string> {
  const t = WATER_TINTS[w];
  return { "--water": t.mid, "--water-hi": t.hi, "--water-deep": t.deep, "--sea": t.sea, "--sea-deep": t.seaDeep, "--water-turn": `${hueTurn(w)}deg` };
}
/** The two colours the live water is drawn with (flowflow/renderer.ts uColA, uColB): ocean is exactly today's. */
export function flowColours(w: Water): { light: string; deep: string } {
  return w === "ocean" ? { light: "#6fe3ff", deep: "#1d72d8" } : { light: WATER_TINTS[w].mid, deep: WATER_TINTS[w].deep };
}

/** How lively Flowflow is (M46, F28, character.lively): Still, the usual, holds still after 3 seconds with no news; Gentle
 *  sways slowly at rest; Lively is today's motion (sway, eyes on the pointer, the ring on the pointer). Its own key, so Less
 *  motion (character.motion) stays the accessibility control and always wins. Anything else reads as Still. */
export const LIVELINESS = ["still", "gentle", "lively"] as const;
export type Liveliness = (typeof LIVELINESS)[number];
export function livelinessOf(v: unknown): Liveliness { return v == null ? "lively" : typeof v === "string" && (LIVELINESS as readonly string[]).includes(v) ? (v as Liveliness) : "still"; }

/** The character's size on the edge. Its window stays 160 points square (main.rs DOCK), so large is only as big as still
 *  leaves the water room to wobble inside it. */
export const SIZES = ["small", "usual", "large"] as const;
export type Size = (typeof SIZES)[number];
export const SIZE_SCALE: Record<Size, number> = { small: 0.82, usual: 1, large: 1.12 };
export function sizeOf(v: unknown): Size { return typeof v === "string" && (SIZES as readonly string[]).includes(v) ? (v as Size) : "usual"; }

/** Sets the fixed look on a page's root (every page, the island too): the usual water's colours as custom properties (the
 *  water character and its pictures still use them), and the black look's theme and tone. */
export function applyLook(root: { style: { setProperty: (k: string, v: string) => void }; setAttribute: (k: string, v: string) => void }): void {
  for (const [k, v] of Object.entries(waterVars("ocean"))) root.style.setProperty(k, v);
  root.setAttribute("data-water", "ocean");
  root.setAttribute("data-theme", FIXED_LOOK["data-theme"]);
  root.setAttribute("data-tone", FIXED_LOOK["data-tone"]);
}
