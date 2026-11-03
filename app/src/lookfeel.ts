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

/** Home's theme (look.theme, M51; 2 Nov 2026): Black, the usual (the founder: "make dark theme where you make everything
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

/** The other look choices (M51 step 3, the founder: "as much customization as possible"). Each becomes a data attribute on
 *  the page's root, and ui/tokens.css switches tokens on it; no other code branches on them. `usual` is the one a person
 *  gets until they choose, and the first of the values, as in protocol/settings.json. Unlike before 2 Nov 2026 the usual
 *  look is not :root's alone: the stylesheet has a rule for the values that are not :root's (Calm, Off, Plain).
 *  The colour rule (the founder, 2 Nov 2026, after showing friends: "too many colors, so it looks like an aquarium"): calm
 *  and grown up. A neutral page carries Home, with one accent, the water's blue, used sparingly. So the usual is Calm, no
 *  light behind Home, and plain list icons; Vivid, the light and colourful icons stay as choices. */
export const LOOK_CHOICES = {
  "look.density": { attr: "data-density", values: ["comfortable", "compact"], usual: "comfortable" },
  "look.icons": { attr: "data-icons", values: ["plain", "colour"], usual: "plain" },
  "look.stamps": { attr: "data-stamps", values: ["on", "off"], usual: "on" },
  /** The main button: Flat, the usual since 2 Nov 2026 (the review: a glossy sky blue pill read as a toy), or Glossy. */
  "look.gloss": { attr: "data-gloss", values: ["flat", "on"], usual: "flat" },
  "look.corners": { attr: "data-corners", values: ["soft", "crisp"], usual: "soft" },
  /** The light behind Home (the brand language, 1 Nov 2026): it drifts slowly while Home is in use, holds still, or is off.
   *  Off is the usual since 2 Nov 2026. Reduce motion and Less motion always hold it still. */
  "look.light": { attr: "data-light", values: ["off", "still", "moving"], usual: "off" },
  /** How much colour: Vivid, or Calm, a step quieter and the usual since 2 Nov 2026. It turns the room's light, the cards'
   *  tint and the gel's shine up or down together (ui/tokens.css). */
  "look.colour": { attr: "data-colour", values: ["calm", "vivid"], usual: "calm" },
  /** The look's style (M65, 4 Nov 2026, the founder: the look is "too childish"). Instrument, the usual, is the grown up
   *  look the founder picked from the lab (like Raycast or Linear: a graphite page, hairlines, small type, rectangle
   *  buttons, colour only where it means something). Friendly is the look from before, kept whole as a choice: no rule in
   *  ui/tokens.css matches it, so it is :root's own tokens, exactly as they were (lookChoices.test.ts pins them). */
  "look.style": { attr: "data-style", values: ["instrument", "friendly"], usual: "instrument" },
} as const;
export type LookChoice = keyof typeof LOOK_CHOICES;
/** A saved value as the attribute's value: Stamps is a switch (false is off); anything not one of the values is the usual. */
export function choiceOf(key: LookChoice, v: unknown): string {
  const { values } = LOOK_CHOICES[key];
  if (key === "look.stamps") return v === false ? "off" : "on";
  return typeof v === "string" && (values as readonly string[]).includes(v) ? v : LOOK_CHOICES[key].usual;
}
export type Style = (typeof LOOK_CHOICES)["look.style"]["values"][number];
/** The character in the look (look.character, M65): Match, the usual, takes the one that goes with the style: the faceless
 *  glass orb with Instrument, the friendly one with Friendly. Orb or Friendly pick one whatever the style. The friendly
 *  character is the only one with a face, bubbles and the water scene; the orb never has them. */
export const CHARACTER_CHOICES = ["match", "orb", "friendly"] as const;
export type CharacterChoice = (typeof CHARACTER_CHOICES)[number];
export type CharacterLook = "orb" | "friendly";
export function characterOf(style: unknown, character: unknown): CharacterLook {
  if (character === "orb" || character === "friendly") return character;
  return choiceOf("look.style", style) === "friendly" ? "friendly" : "orb";
}
/** Every look attribute for the saved values: the theme, whether it is dark or light, the choices, and the character the
 *  look shows (data-character). A store saved before M65 has no look.style or look.character: it reads Instrument with the
 *  orb, and every value it did save reads as before. */
export function lookAttrs(values: Partial<Record<"look.theme" | "look.character" | LookChoice, unknown>>): Record<string, string> {
  const theme = themeOf(values["look.theme"]);
  const out: Record<string, string> = { "data-theme": theme, "data-tone": THEME_TONE[theme] };
  for (const k of Object.keys(LOOK_CHOICES) as LookChoice[]) out[LOOK_CHOICES[k].attr] = choiceOf(k, values[k]);
  out["data-character"] = characterOf(values["look.style"], values["look.character"]);
  return out;
}
/** Sets the choices on a page's root (Home and Settings; the island and the character keep the notch's look). */
export function applyLookChoices(root: { setAttribute: (k: string, v: string) => void }, values: Partial<Record<"look.character" | LookChoice, unknown>>): void {
  const attrs = lookAttrs(values);
  for (const k of Object.keys(LOOK_CHOICES) as LookChoice[]) root.setAttribute(LOOK_CHOICES[k].attr, attrs[LOOK_CHOICES[k].attr]);
  root.setAttribute("data-character", attrs["data-character"]);
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

/** Sets the look on a page's root: the water's colours as custom properties, the water as data-water (Flow's room takes
 *  the water's colours from it, ui/tokens.css), and the theme as data-theme. */
export function applyLook(root: { style: { setProperty: (k: string, v: string) => void }; setAttribute: (k: string, v: string) => void }, water: unknown, theme: unknown): void {
  for (const [k, v] of Object.entries(waterVars(waterOf(water)))) root.style.setProperty(k, v);
  root.setAttribute("data-water", waterOf(water));
  root.setAttribute("data-theme", themeOf(theme));
  root.setAttribute("data-tone", THEME_TONE[themeOf(theme)]);
}
