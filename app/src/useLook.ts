// The look chosen in Settings (lookfeel.ts) on this page: the water's colours as custom properties and Home's theme as
// data-theme on the page's root, kept in step with every change. Gives back the live water's colours.
import { useEffect } from "react";
import { useSetting } from "./settingsStore.ts";
import { applyLook, flowColours, waterOf } from "./lookfeel.ts";

export function useLook(): { light: string; deep: string } {
  const water = useSetting("look.water"), theme = useSetting("look.theme");
  useEffect(() => { applyLook(document.documentElement, water, theme); }, [water, theme]);
  return flowColours(waterOf(water));
}
