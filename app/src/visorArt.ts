// The Visor (M68, the founder's pick on 4 Nov 2026, option B in the characters lab): a glass orb with a dark band across the
// middle and light behind the band. This file is the drawing's data only, copied from the lab exactly: the glass and its
// gradient, the band, and where each light sits for each pose. Like orbArt.ts it is the art exception, so the glass's
// gradient stops live here; every other colour (the band, the lights, their glow) is a token in ui/tokens.css. The part
// that draws it is ui/parts.tsx Visor; which pose shows is characters.ts visorPose. SVG and CSS only, never WebGL.

/** The lab draws in a 100 by 100 box; the visor's box is trimmed to the glass. The notch's wing shows the band alone. */
export const VISOR_VIEWBOX = "12 12 76 76";
export const VISOR_BAND_VIEWBOX = "20 40 60 18";

export type Box = { x: number; y: number; w: number; h: number; rx: number };

/** The glass (the lab's #glass): a circle lit from the top left, deep blue at its rim. */
export const VISOR_GLASS = { cx: 50, cy: 50, r: 38 } as const;
export const VISOR_GLASS_GRADIENT = {
  cx: "36%", cy: "30%", r: "75%",
  stops: [[0, "#E6F0FF"], [0.18, "#8DB6FF"], [0.55, "#2F64D6"], [1, "#0F2558"]] as ReadonlyArray<readonly [number, string]>,
} as const;

/** The dark band across the middle. */
export const VISOR_BAND: Box = { x: 20, y: 40, w: 60, h: 18, rx: 9 };

/** At rest (and red when it stopped): two small rounded lights. */
export const VISOR_REST: readonly Box[] = [{ x: 36, y: 46, w: 8, h: 6, rx: 3 }, { x: 56, y: 46, w: 8, h: 6, rx: 3 }];
/** Working, thinking and checking: one bar of light that scans side to side, VISOR_SCAN_TRAVEL each way. */
export const VISOR_SCAN: Box = { x: 40, y: 47, w: 20, h: 4, rx: 2 };
export const VISOR_SCAN_TRAVEL = 14;
/** Needs you: two taller lights. */
export const VISOR_NEEDS: readonly Box[] = [{ x: 35, y: 44, w: 9, h: 10, rx: 4.5 }, { x: 56, y: 44, w: 9, h: 10, rx: 4.5 }];
/** Proven: the light curves into a smile. */
export const VISOR_SMILE = { d: "M36 46 q14 9 28 0", width: 3.2 } as const;
/** Listening: a small level meter of three bars in the middle of the band, each grown from its middle. */
export const VISOR_METER: readonly Box[] = [{ x: 42, y: 43, w: 4, h: 12, rx: 2 }, { x: 48, y: 43, w: 4, h: 12, rx: 2 }, { x: 54, y: 43, w: 4, h: 12, rx: 2 }];

/** How tall each meter bar is for a voice level (0 to 1), as a scale of its full height: never flat, never past full. The
 *  middle bar is the loudest, so it reads as a meter, not three copies. Only a number reaches the page, never audio. */
export const METER_SHAPE = [0.7, 1, 0.8] as const;
export const METER_FLOOR = 0.25;
export function meterScales(level: number): number[] {
  const l = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  return METER_SHAPE.map((k) => Math.round((METER_FLOOR + (1 - METER_FLOOR) * l * k) * 1000) / 1000);
}
