// Flowflow as a small still drawing, in one water's colours (the founder, 1 Nov 2026: the live water blob is the one Flowflow
// everywhere). The Water choices in Settings show it, one per water, so a choice looks like the drop you see in Home and on
// the desktop: a soft peaked drop sitting in its own water, two dark eyes, a sheen of light. Never the old picture art. A
// drawing only, hidden from VoiceOver: the card's name says which water it is. Colours come from the water itself
// (lookfeel.ts), passed to the stylesheet as custom properties, so this file writes no colour of its own.
import type { CSSProperties } from "react";
import { WATER_TINTS, flowColours, type Water } from "./lookfeel.ts";

export function WaterDrop({ water, className }: { water: Water; className?: string }) {
  const c = flowColours(water), t = WATER_TINTS[water];
  const id = `wd-${water}`;
  const vars = { "--wd-light": c.light, "--wd-deep": c.deep, "--wd-hi": t.hi } as CSSProperties;
  return (
    <svg className={`water-drop${className ? ` ${className}` : ""}`} viewBox="0 0 100 80" style={vars} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="0.3" y1="0" x2="0.6" y2="1">
          <stop offset="0" className="wd-s-hi" />
          <stop offset="0.45" className="wd-s-light" />
          <stop offset="1" className="wd-s-deep" />
        </linearGradient>
        <linearGradient id={`${id}-pool`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="wd-s-deep" />
          <stop offset="1" className="wd-s-clear" />
        </linearGradient>
      </defs>
      <ellipse className="wd-pool" cx="50" cy="69" rx="47" ry="9" fill={`url(#${id}-pool)`} />
      <path className="wd-body" d="M50 7 C56 7 60 13 66 21 C74 31 85 39 89 51 C92 59 93 65 93 69 L7 69 C7 65 8 59 11 51 C15 39 26 31 34 21 C40 13 44 7 50 7 Z" fill={`url(#${id}-body)`} />
      <ellipse className="wd-sheen" cx="38" cy="30" rx="9" ry="5" transform="rotate(-38 38 30)" />
      <rect className="wd-eye" x="36" y="42" width="6.5" height="12" rx="3.25" />
      <rect className="wd-eye" x="57.5" y="42" width="6.5" height="12" rx="3.25" />
      <circle className="wd-glint" cx="39.5" cy="45" r="1.3" />
      <circle className="wd-glint" cx="61" cy="45" r="1.3" />
      <path className="wd-line" d="M3 69 C18 66 30 66 42 69 S70 72 97 68" />
    </svg>
  );
}
