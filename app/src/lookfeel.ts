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

export const THEMES = ["night", "deep", "paper"] as const;
export type Theme = (typeof THEMES)[number];
export function themeOf(v: unknown): Theme { return typeof v === "string" && (THEMES as readonly string[]).includes(v) ? (v as Theme) : "night"; }

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

/** How lively, in one control: Lively (reactions on, the Mac's motion), Calm (no reactions), Still (no reactions, less
 *  motion). Read from the two settings it writes, so it always shows what is in force. */
export type Lively = "lively" | "calm" | "still";
export function livelyOf(reactions: unknown, motion: unknown): Lively { return motion === "less" ? "still" : reactions === false ? "calm" : "lively"; }
export function livelySettings(l: Lively): [string, unknown][] {
  return [["fun.reactions", l === "lively"], ["character.motion", l === "still" ? "less" : "followMac"]];
}

/** The character's size on the edge. Its window stays 160 points square (main.rs DOCK), so large is only as big as still
 *  leaves the water room to wobble inside it. */
export const SIZES = ["small", "usual", "large"] as const;
export type Size = (typeof SIZES)[number];
export const SIZE_SCALE: Record<Size, number> = { small: 0.82, usual: 1, large: 1.12 };
export function sizeOf(v: unknown): Size { return typeof v === "string" && (SIZES as readonly string[]).includes(v) ? (v as Size) : "usual"; }

/** Sets the look on a page's root: the water's colours as custom properties, and the theme as data-theme. */
export function applyLook(root: { style: { setProperty: (k: string, v: string) => void }; setAttribute: (k: string, v: string) => void }, water: unknown, theme: unknown): void {
  for (const [k, v] of Object.entries(waterVars(waterOf(water)))) root.style.setProperty(k, v);
  root.setAttribute("data-theme", themeOf(theme));
}
