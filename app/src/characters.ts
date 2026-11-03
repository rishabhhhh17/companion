// The character's pictures: the water creature, one picture per pose (public/characters/water). This file only chooses
// which pose shows. The name shown to people is in strings.ts; art and path ids stay out of the words.
import type { CharacterState } from "./model.ts";
import { SKIN, poseFile } from "./skins.ts";

export const POSES = ["look", "glance", "wave", "splash", "idea", "laptop", "magnify", "sleep", "swim", "peek", "worry"] as const;
export type Pose = (typeof POSES)[number];

const FOR_STATE: Record<CharacterState, Pose> = {
  off: "sleep",
  idle: "look",
  listening: "glance",   // turned toward you; the lit ring is what says it is listening
  thinking: "idea",
  working: "laptop",
  checking: "magnify",
  needsYou: "wave",
  done: "splash",
  error: "worry",   // an "uh oh": a little worried, in the creature's own blue; never grey, sad or angry (rule 16)
};

/** The pose for a state. A trip across the screen and a cheer show only while the character is otherwise idle, so they
 *  never hide that something waits for you, that the screen is being looked at, or that it is off. */
export function poseFor(state: CharacterState, ctx: { roam?: string; react?: string } = {}): Pose {
  if (state === "idle") {
    if (ctx.roam === "travel" || ctx.roam === "return") return "swim";
    if (ctx.react === "cheer" || ctx.react === "party") return "splash";
  }
  return FOR_STATE[state];
}

/** Where the page finds a pose (a relative address, so the built app finds it next to the page). */
export const poseUrl = (p: Pose): string => poseFile(SKIN, p);

/** The faceless glass orb's ring (M65, the Instrument look): a thin ring whose colour says the state, the way the friendly
 *  character's pose does. Red when it stopped on something it could not fix, amber when it needs you, green when the fix is
 *  proven, the accent while it listens, thinks, works or checks, and no ring at rest or when it is off. The colour of each
 *  is a token (ui/parts.css .ui-orb[data-ring]); the words for the state are always beside it, never the colour alone. */
export type Ring = "stop" | "needs" | "proven" | "working";
const RING_FOR: Record<CharacterState, Ring | null> = {
  off: null,
  idle: null,
  listening: "working",
  thinking: "working",
  working: "working",
  checking: "working",
  needsYou: "needs",
  done: "proven",
  error: "stop",
};
export const ringOf = (state: CharacterState): Ring | null => RING_FOR[state] ?? null;
/** The ring with what is waiting counted (M65 step 4): a question or an approval waiting is amber, needs you, whatever the
 *  agent is doing, so the ring never says working beside a count of things waiting. A stop stays red; off stays off. */
export const ringFor = (state: CharacterState, waiting: number): Ring | null =>
  waiting > 0 && state !== "off" && state !== "error" ? "needs" : ringOf(state);
