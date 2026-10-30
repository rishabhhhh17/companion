// The look chosen in Settings (lookfeel.ts) on this page: the water's colours as custom properties and Home's theme as
// data-theme on the page's root, kept in step with every change. Gives back the live water's colours.
// `keepNight`: the island page. The notch is the hardware notch and stays black in every theme (ui/tokens.css), so its page
// takes the water only and keeps Night's tokens: Paper's dark words would vanish on the black panel.
import { useEffect } from "react";
import { useSetting } from "./settingsStore.ts";
import { applyLook, flowColours, waterOf } from "./lookfeel.ts";

export function useLook(opts: { keepNight?: boolean } = {}): { light: string; deep: string } {
  const water = useSetting("look.water"), chosen = useSetting("look.theme");
  const theme = opts.keepNight ? "night" : chosen;
  useEffect(() => { applyLook(document.documentElement, water, theme); }, [water, theme]);
  return flowColours(waterOf(water));
}
