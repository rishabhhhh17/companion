// M65 step 2, the chrome: which drawing of the character a place shows. Under Instrument (or with Glass orb picked) every
// small place (the notch's wing, its panel, the practice panel, Settings' About) and the edge of the screen show the
// faceless glass orb with its state ring (characters.ts ringOf, orbArt.ts glassOrbSvg). The friendly character keeps its
// two ways (the live water, or the pictures when Draw live is off or cannot run). Plain code, tested in chrome.test.ts.
import type { CharacterLook } from "./lookfeel.ts";
import { ringFor } from "./characters.ts";
import { stateLabel, type CharacterState } from "./model.ts";

export type MiniShows = "orb" | "live" | "picture";

/** A small place. `pose`: a named friendly pose was asked for (Settings' How lively tiles picture Friendly's moves), so it
 *  stays that picture whatever the character. */
export function miniShows(look: CharacterLook, o: { live: boolean; failed: boolean; pose?: boolean }): MiniShows {
  if (o.pose) return "picture";
  if (look === "orb") return "orb";
  return o.live && !o.failed ? "live" : "picture";
}

/** The edge of the screen: the orb never loads the live water or the soft water over the pictures. */
export function dockShows(look: CharacterLook, live: boolean, failed: boolean): MiniShows {
  return miniShows(look, { live, failed });
}

/** The state's motion on the edge (model.ts motionFor). The orb has none of the friendly character's cartoon moves; its
 *  ring and the words beside it say the state. */
export function orbMotion<T extends string>(look: CharacterLook, motion: T | undefined): T | undefined {
  return look === "orb" ? undefined : motion;
}

/** The word under the orb on the edge (M65 step 4): it agrees with the ring. With a question or an approval waiting the
 *  ring is amber, so the word is Needs you, never Working beside a count of things waiting. The friendly character keeps
 *  its words as before. */
export function dockWords(look: CharacterLook, state: CharacterState, waiting: number, words: string): string {
  return look === "orb" && waiting > 0 && ringFor(state, waiting) === "needs" ? stateLabel("needsYou") : words;
}
