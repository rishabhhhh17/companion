// The water pointer (M17, approved 28 Oct 2026): Show me how's pointer is a drop of Flowflow's water. It splits off the
// character, arcs to the target, squashes on landing and spreads into a ring of water around it; on the right click the
// ring bursts and the drop hops on to the next step, and after the last one it flies home. The numbers and the shapes are
// here, with no page, so they can be tested (water.test.ts); overlay.ts draws them.

export type Pt = { x: number; y: number };

/** How long each part takes (ms): the bud swells and pinches off, the drop squashes on arrival, and spreads into the ring. */
export const SPLIT_MS = 560;
export const LAND_MS = 240;
export const SPREAD_MS = 700;
/** After a right click: the splash, then the drop gathers and flies home (it arrives before the shell hides the overlay). */
export const HOME_DELAY_MS = 260;
export const HOME_MS = 720;
/** The flying drop's radius, a bead's radius in the ring, and the room between beads along the ring (points). */
export const DROP_R = 13;
export const BEAD_R = 7;
export const BEAD_GAP = 12;
/** The character's body, roughly, at the dock's size: where the bud swells from (points from its centre). */
export const BODY_R = 36;

export type Bead = { ux: number; uy: number; nx: number; ny: number };

/** Beads spaced evenly by length around an ellipse (not by angle, so a wide ring has no gaps along its long sides). `ux, uy`
 *  is where the bead sits as a fraction of the radii; `nx, ny` the way out of the ring there, for the wobble. */
export function ringBeads(rx: number, ry: number, gap = BEAD_GAP, min = 14): Bead[] {
  rx = Math.max(1, rx); ry = Math.max(1, ry);
  const S = 360, pts: [number, number][] = [], cum = [0];
  for (let i = 0; i <= S; i++) {
    const a = (i / S) * Math.PI * 2;
    pts.push([Math.cos(a), Math.sin(a)]);
    if (i) cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * rx, (pts[i][1] - pts[i - 1][1]) * ry));
  }
  const per = cum[S], n = Math.max(min, Math.round(per / gap));
  const out: Bead[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / n) * per;
    while (cum[j + 1] < want) j++;
    // between two samples, so the spacing is even however wide the ring
    const f = (want - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]), a = ((j + f) / S) * Math.PI * 2;
    const ux = Math.cos(a), uy = Math.sin(a);
    const nl = Math.hypot(ux / rx, uy / ry) || 1;
    out.push({ ux, uy, nx: ux / rx / nl, ny: uy / ry / nl });
  }
  return out;
}

/** How the drop stretches at a speed (points a second): longer along the way it moves, thinner across, its area kept. */
export function stretch(speed: number): { along: number; across: number } {
  const s = Math.min(0.9, Math.max(0, speed) / 1500);
  return { along: 1 + s, across: 1 / Math.sqrt(1 + s) };
}

/** The bud during the split (k from 0 to 1): it leaves the character's edge toward the target, swelling to a drop, with a
 *  neck back to the body that thins away to nothing, so the water reads as pinching off. */
export function bud(from: Pt, to: Pt, k: number): { x: number; y: number; r: number; neck: { x: number; y: number; r: number } } {
  const t = Math.min(1, Math.max(0, k));
  const a = Math.atan2(to.y - from.y, to.x - from.x), c = Math.cos(a), s = Math.sin(a);
  const reach = BODY_R * (0.55 + 0.95 * easeInOut(t));
  const r = 4 + (DROP_R - 4) * easeOut(t);
  const nr = Math.max(0, (1 - t) * 16 + 5 * Math.sin(t * Math.PI));
  return { x: from.x + c * reach, y: from.y + s * reach, r, neck: { x: from.x + c * BODY_R * 0.7, y: from.y + s * BODY_R * 0.7, r: t >= 1 ? 0 : nr } };
}

/** A draw that starts where the last drop landed is a hop to the next step, not a new split from the character. */
export function isHop(from: Pt, last: Pt | null): boolean { return !!last && Math.hypot(from.x - last.x, from.y - last.y) < 4; }

/** The arc the drop flies on: through a point above the middle, higher for a longer way (at most 110 points), so a hop
 *  between two nearby steps still jumps. */
export function arcAt(from: Pt, to: Pt, e: number, hop = false): Pt {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(110, d / 3.5) + (hop ? 40 : 0);
  const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - lift, u = 1 - e;
  return { x: u * u * from.x + 2 * u * e * mx + e * e * to.x, y: u * u * from.y + 2 * u * e * my + e * e * to.y };
}

/** A spring that overshoots a little and settles (0 to 1 over t from 0 to 1): the ring spreading out like water. */
export function settle(t: number): number { const x = Math.min(1, Math.max(0, t)); return x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(9 * x); }
export function easeOut(t: number): number { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); }
export function easeInOut(t: number): number { const x = Math.min(1, Math.max(0, t)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

/** The water's colours. The usual is Flowflow's own water; a ring colour chosen in Settings (red, yellow or blue) tints it,
 *  and high contrast is white water (the overlay draws a dark edge under it). A guess is never water: it keeps its dashed ring (rule 22). */
export type Tint = { hi: string; mid: string; deep: string };
export const WATER_TINT: Tint = { hi: "#C9F1FF", mid: "#59D2FF", deep: "#1676C8" };
const TINTS: Record<string, Tint> = {
  red: { hi: "#FFD3CF", mid: "#FF5A4E", deep: "#B3221A" },
  yellow: { hi: "#FFF6C2", mid: "#FFD60A", deep: "#B38F00" },
  blue: { hi: "#CFE4FF", mid: "#3D8BFF", deep: "#0A4FB8" },
  highContrast: { hi: "#FFFFFF", mid: "#F2F2F2", deep: "#BDBDBD" },
};
export function waterTint(colour: unknown): Tint { return typeof colour === "string" && Object.hasOwn(TINTS, colour) ? TINTS[colour] : WATER_TINT; }
