// Flowflow as a small still drawing, in one water's colours. The Water choices in Settings show it, one per water, so a
// choice looks like the Flowflow you see in Home and on the desktop. M60 (2 Nov 2026): the orb with its two trailing
// bubbles, drawn from the same geometry as every other picture of it (orbArt.ts), never the old drop. A drawing only,
// hidden from VoiceOver: the card's name says which water it is. Its colours come from the water itself (lookfeel.ts
// through orbArt.ts), so this file writes no colour of its own.
import { useMemo } from "react";
import type { Water } from "./lookfeel.ts";
import { svgUrl, waterSvg } from "./orbArt.ts";

export function WaterDrop({ water, className }: { water: Water; className?: string }) {
  const src = useMemo(() => svgUrl(waterSvg(water)), [water]);
  return <img className={`water-drop${className ? ` ${className}` : ""}`} src={src} alt="" aria-hidden="true" draggable={false} />;
}
