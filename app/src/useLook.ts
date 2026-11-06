// The look on this page (lookfeel.ts): since M71 one black look on every page, with the colour choice (Colourful or Calm)
// and the character as data attributes on the root of Home and Settings (`choices`). The island page takes the same fixed
// look without the choices; the notch is black in every case. Gives back the water's colours (the water character's own,
// the usual ocean: look.water is retired).
// M72 (finding 2): the root's character is the one in force, read from what is actually stored, look.style included, so a
// Friendly store that never picked a character says "friendly" on the root, as Home and the edge draw it.
import { useEffect } from "react";
import { storedSetting, useSetting } from "./settingsStore.ts";
import { applyLook, applyLookChoices, flowColours } from "./lookfeel.ts";

export function useLook(opts: { keepNight?: boolean; choices?: boolean } = {}): { light: string; deep: string } {
  useEffect(() => { applyLook(document.documentElement); }, []);
  const colour = useSetting("look.colour");
  useSetting("look.character");
  const character = storedSetting("look.character"), style = storedSetting("look.style");
  const choices = !!opts.choices && !opts.keepNight;
  useEffect(() => {
    if (choices) applyLookChoices(document.documentElement, { "look.colour": colour, "look.character": character, "look.style": style });
  }, [choices, colour, character, style]);
  return flowColours("ocean");
}
