// The look chosen in Settings (lookfeel.ts) on this page: the water's colours as custom properties and Home's theme as
// data-theme on the page's root, kept in step with every change. Gives back the live water's colours.
// `keepNight`: the island page. The notch is the hardware notch and stays black in every theme (ui/tokens.css), so its page
// takes the water only and keeps Night's tokens (a "night" reads as Graphite, lookfeel.ts themeOf): Paper's dark words
// would vanish on the black panel.
// `choices`: Home and Settings also take the other look choices (M51 step 3: density, icons, stamps, gloss, corners) as data
// attributes on the root (lookfeel.ts applyLookChoices). The character's window and the island keep their own look.
// `forceTheme`: a theme to show whatever is chosen. Nothing uses it since 2 Nov 2026: the first run takes the chosen theme
// (a new person gets Black, the usual), its tokens are the theme's own (ui/tokens.css --fr-*).
import { useEffect } from "react";
import { useSetting } from "./settingsStore.ts";
import { applyLook, applyLookChoices, flowColours, waterOf, type Theme } from "./lookfeel.ts";

export function useLook(opts: { keepNight?: boolean; choices?: boolean; forceTheme?: Theme } = {}): { light: string; deep: string } {
  const water = useSetting("look.water"), chosen = useSetting("look.theme");
  const theme = opts.keepNight ? "night" : opts.forceTheme ?? chosen;
  useEffect(() => { applyLook(document.documentElement, water, theme); }, [water, theme]);
  const density = useSetting("look.density"), icons = useSetting("look.icons"), stamps = useSetting("look.stamps");
  const gloss = useSetting("look.gloss"), corners = useSetting("look.corners"), light = useSetting("look.light"), colour = useSetting("look.colour");
  const choices = !!opts.choices && !opts.keepNight;
  useEffect(() => {
    if (choices) applyLookChoices(document.documentElement, { "look.density": density, "look.icons": icons, "look.stamps": stamps, "look.gloss": gloss, "look.corners": corners, "look.light": light, "look.colour": colour });
  }, [choices, density, icons, stamps, gloss, corners, light, colour]);
  return flowColours(waterOf(water));
}
