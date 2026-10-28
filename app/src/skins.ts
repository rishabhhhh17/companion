// A character is a skin (docs/design/look.md). The chrome (cards, buttons, the island) is black and white and never reads
// anything from here. Only the character's own glow and its flow (src/flow/) use a skin: its pictures, its one cool hue
// and the numbers of its motion. A new character is a new entry here, a folder of poses, and nothing else.
// The skin's name shown to people is in strings.ts (names come from protocol/names.json), never in this file.

/** The numbers a character's motion is built from. Spring numbers are per second: stiffness k and damping c, so a squash
 *  that comes back is  x'' = -k x - c x'  (underdamped when c < 2 sqrt(k): it overshoots a little, like a drop of water). */
export type SkinMotion = {
  /** Squash: a click or a new pose pushes the body in and it springs back. */
  squashK: number; squashC: number; pokeImpulse: number; poseImpulse: number;
  /** Jelly lag: the top of the body trails behind how fast the window moves (pixels per second), on its own spring. */
  lagK: number; lagC: number; lagMax: number;
  /** How far the lag bends the mesh, per pixel per second. Used by the shader. */
  lagGain: number;
  /** A ripple from where it was touched: how long it lives and how fast it fades (per second). */
  rippleLife: number; rippleFade: number;
  /** A liquid dissolve from one pose to the next, and the quicker plain crossfade used with less motion. */
  dissolveS: number; calmFadeS: number;
  /** Frames per second when nothing is being touched or changing (the breathing only), and when something is. */
  idleFps: number; activeFps: number;
};

export type Skin = {
  id: string;
  /** Where the pose pictures are, relative to the page (Tauri serves public/ next to the page). */
  posesDir: string;
  /** The one cool hue, as hue, saturation and lightness. Used for the glow rings and the droplets only. */
  hue: { h: number; s: number; l: number };
  motion: SkinMotion;
};

export const WATER: Skin = {
  id: "water",
  posesDir: "./characters/water",
  hue: { h: 205, s: 90, l: 62 },
  motion: {
    squashK: 130, squashC: 7, pokeImpulse: 4.2, poseImpulse: 3.2,
    lagK: 90, lagC: 9, lagMax: 900, lagGain: 0.00055,
    rippleLife: 2.4, rippleFade: 2.4,
    dissolveS: 0.48, calmFadeS: 0.2,
    idleFps: 30, activeFps: 60,
  },
};

/** The skin in use. One for now; the day there are more, Settings picks one. */
export const SKIN: Skin = WATER;

/** hsl() text for a lightness shift of the skin's hue, with an optional opacity (for the glow rings and the droplets). */
export function skinColor(skin: Skin, lightnessShift = 0, alpha = 1): string {
  const { h, s, l } = skin.hue;
  const light = Math.max(0, Math.min(100, l + lightnessShift));
  return alpha >= 1 ? `hsl(${h} ${s}% ${light}%)` : `hsl(${h} ${s}% ${light}% / ${alpha})`;
}

/** The CSS custom properties the character's own page sets from the skin. The glow rules in style.css read only these. */
export function skinVars(skin: Skin): Record<string, string> {
  return {
    "--skin-glow": skinColor(skin),
    "--skin-glow-soft": skinColor(skin, 0, 0.55),
  };
}

/** Where a pose picture is (relative, so the built app finds it next to the page). */
export const poseFile = (skin: Skin, pose: string): string => `${skin.posesDir}/${pose}.png`;
