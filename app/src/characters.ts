// The character's pictures: the water creature, one picture per pose (public/characters/water). This file only chooses
// which pose shows. The name shown to people is in strings.ts; art and path ids stay out of the words.
import type { CharacterState } from "./model.ts";

export const POSES = ["look", "glance", "wave", "splash", "idea", "laptop", "magnify", "sleep", "swim", "peek"] as const;
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
  error: "peek",   // an "uh oh", half hidden: never a sad or angry face (rule 16)
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
export const poseUrl = (p: Pose): string => `./characters/water/${p}.png`;
