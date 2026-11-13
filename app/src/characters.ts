// The character's pictures: the water creature, one picture per pose (public/characters/water). This file only chooses
// which pose shows. The name shown to people is in strings.ts; art and path ids stay out of the words.
import type { CharacterState } from "./model.ts";
import { SKIN, poseFile } from "./skins.ts";
import { VISOR_MS } from "./motionTokens.ts";
import type { Reaction } from "./moods.ts";

export const POSES = ["look", "glance", "wave", "splash", "idea", "laptop", "magnify", "sleep", "swim", "peek", "worry"] as const;
export type Pose = (typeof POSES)[number];

const FOR_STATE: Record<CharacterState, Pose> = {
  off: "sleep",
  idle: "peek",   // M83: awake at rest, soft open eyes; the happy closed eyes ("look") are a reaction now
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
export function poseFor(state: CharacterState, ctx: { roam?: string; react?: string; mood?: Reaction | null } = {}): Pose {
  if (state === "idle") {
    if (ctx.roam === "travel" || ctx.roam === "return") return "swim";
    if (ctx.react === "cheer" || ctx.react === "party") return "splash";
    if (ctx.mood) return MOOD_POSE[ctx.mood];
  }
  if (state === "done" && ctx.mood === "proud") return MOOD_POSE.proud;
  return FOR_STATE[state];
}
/** M83 (moods.ts): each reaction in the pictures. Proud splashes, worried is the worry pose, relieved closes its eyes softly
 *  (the happy closed eyes) and opens them again as it settles back, watching glances aside, hello opens its eyes wide with a
 *  small lift (the page's touch), sleepy sleeps. */
export const MOOD_POSE: Readonly<Record<Reaction, Pose>> = { proud: "splash", worried: "worry", relieved: "look", watching: "glance", hello: "peek", sleepy: "sleep" };

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
/** The ring Home shows: the one it passes (agreeing with its status line), or the state's own. Hold to talk shows the same
 *  ring on Home as on the edge and in the notch, whatever the status line says (M68 step 3). */
export const homeRingShown = (state: CharacterState, ring: Ring | null | undefined): Ring | null =>
  state === "listening" || ring === undefined ? ringOf(state) : ring;
/** The ring with what is waiting counted (M65 step 4): a question or an approval waiting is amber, needs you, whatever the
 *  agent is doing, so the ring never says working beside a count of things waiting. A stop stays red; off stays off. */
export const ringFor = (state: CharacterState, waiting: number): Ring | null =>
  waiting > 0 && state !== "off" && state !== "error" ? "needs" : ringOf(state);

// ---------- The Visor (M68, the founder's pick on 4 Nov 2026) ----------

/** What the Visor's band shows: which lights, and in which colour. It comes from the ring the orb shows, so the lights and
 *  the ring always agree (a question waiting gives amber lights even while it works): rest lights, a scanning bar while it
 *  thinks, works or checks, a level meter while it listens, two taller amber lights when it needs you, red lights when it
 *  stopped, a smile when a fix is proven, and a dark band when it is off. */
export type VisorLights = "none" | "rest" | "scan" | "meter" | "needs" | "smile";
export type VisorTone = "light" | "needs" | "stop";
export type VisorPose = { lights: VisorLights; tone: VisorTone };
export function visorPose(state: CharacterState, ring: Ring | null): VisorPose {
  if (state === "off") return { lights: "none", tone: "light" };
  // Listening is said by the lights even where the ring beside it says nothing (Home's status line has no ring for it).
  if (state === "listening" && (ring === null || ring === "working")) return { lights: "meter", tone: "light" };
  switch (ring) {
    case "stop": return { lights: "rest", tone: "stop" };
    case "needs": return { lights: "needs", tone: "needs" };
    case "proven": return { lights: "smile", tone: "light" };
    case "working": return { lights: "scan", tone: "light" };
    default: return { lights: "rest", tone: "light" };
  }
}

/** M83 (moods.ts): a reaction in the Visor's own art. Proud is its smile (and the hop, where hops may play); every other
 *  reaction is a shape of its two rest lights (ui/parts.css [data-react]): wide open when worried, closing and opening
 *  again when relieved, turned toward the middle of the screen while watching, lifted for hello, half closed when sleepy.
 *  Only over its plain rest pose, so the meaning colours (amber, red) are never changed by a reaction. */
export function visorReaction(p: VisorPose, mood: Reaction | null): { pose: VisorPose; react: Reaction | null } {
  if (!mood || p.lights !== "rest" || p.tone !== "light") return { pose: p, react: null };
  if (mood === "proud") return { pose: { lights: "smile", tone: "light" }, react: "proud" };
  return { pose: p, react: mood };
}
/** M83: a reaction on the glass orb. Proud shows the proven ring (a fix proven, a check passing); every other reaction is a
 *  small move of the orb itself (ui/parts.css), never a ring: worry, relief, watching, hello and sleep are not meanings. */
export function orbReaction(ring: Ring | null, mood: Reaction | null): { ring: Ring | null; react: Reaction | null } {
  if (!mood || ring !== null) return { ring, react: null };
  return mood === "proud" ? { ring: "proven", react: "proud" } : { ring, react: mood };
}

/** Which of the Visor's moves may run. The blink and the glance are its liveliness (Still: neither; Gentle: the blink;
 *  Lively: both, the glance only with Reactions on); the scan, the meter and the lean say the state; the hop plays once when
 *  a fix is proven, only with Reactions on. Only the scan and the listening pulse loop: the blink plays three times and then
 *  rests until something new, and the lean plays twice on arriving at needs you and then holds still (ui/parts.css), so a
 *  question that waits for minutes never rocks at the edge of the screen. With Reduce motion or Less motion, at rest (a call, Low Power Mode) or where it is
 *  not on screen, nothing moves: the still pose of the state. */
export type VisorMotion = { blink: boolean; glance: boolean; scan: boolean; meter: boolean; lean: boolean; hop: boolean };
export function visorMotion(p: VisorPose, o: { reduced: boolean; still: boolean; lively: "still" | "gentle" | "lively"; reacts: boolean; band?: boolean }): VisorMotion {
  const none: VisorMotion = { blink: false, glance: false, scan: false, meter: false, lean: false, hop: false };
  if (o.reduced || o.still) return none;
  const resting = p.lights === "rest" && p.tone === "light";
  return {
    blink: resting && o.lively !== "still",
    glance: resting && o.lively === "lively" && o.reacts,
    scan: p.lights === "scan",
    meter: p.lights === "meter",
    lean: p.lights === "needs",
    hop: p.lights === "smile" && o.reacts && !o.band,   // the band alone in the notch never hops (M68 plan)
  };
}

/** Whether a glance may play now: at most once every `gap` ms (motionTokens.ts VISOR_MS.glanceGap), never while hidden. */
export const glanceDue = (now: number, last: number | null, hidden: boolean, gap: number = VISOR_MS.glanceGap): boolean =>
  !hidden && (last === null || now - last > gap);
