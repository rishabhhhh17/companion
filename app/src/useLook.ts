// The look on this page (lookfeel.ts): since M71 one black look on every page, with the colour choice (Colourful or Calm)
// and the character as data attributes on the root of Home and Settings (`choices`). The island page takes the same fixed
// look without the choices; the notch is black in every case. Gives back the water's colours (the water character's own,
// the usual ocean: look.water is retired).
import { useEffect } from "react";
import { useSetting } from "./settingsStore.ts";
import { applyLook, applyLookChoices, flowColours } from "./lookfeel.ts";

export function useLook(opts: { keepNight?: boolean; choices?: boolean } = {}): { light: string; deep: string } {
  useEffect(() => { applyLook(document.documentElement); }, []);
  const colour = useSetting("look.colour"), character = useSetting("look.character");
  const choices = !!opts.choices && !opts.keepNight;
  useEffect(() => {
    if (choices) applyLookChoices(document.documentElement, { "look.colour": colour, "look.character": character });
  }, [choices, colour, character]);
  return flowColours("ocean");
}
