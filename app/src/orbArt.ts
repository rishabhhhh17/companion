// Flowflow's still pictures, drawn from code (M60, 2 Nov 2026: the founder picked the Orb with Fizz's trailing bubbles in
// place of the old drop). One geometry writes every picture: the pose pictures in public/characters/water (made by
// scripts/make-orb-poses.ts, never edited by hand) and the small drawing on each Water choice in Settings (waterDrop.tsx).
// It is the same orb the live engine draws (flowflow/shaders.ts): a perfectly round bubble of water, deep in the middle and
// brighter toward the edge, a thin light ring inside the rim, a soft crescent of light along the inside of the lower rim,
// one oval glint up and to the left, a face of two soft closed arcs with no mouth, and two small bubbles that follow it.
// The bubbles trail below and behind in a gentle arc, never a straight diagonal, so it never reads as a thought bubble.
// The outline stays round in every pose: no point on top, no flat bottom, never sitting on anything.
// Only the water's colours and the fixed white light are written here; the safety colours (amber, green) are never painted
// into a picture, because the pictures are turned to the chosen water with a hue turn and a safety colour must not turn.
import { flowColours, WATER_TINTS, WATERS, type Water } from "./lookfeel.ts";
import type { Pose } from "./characters.ts";

/** The art works in the concept's units: the orb's radius is 60, its centre is (0, 0), y runs down. */
export const R = 60;
/** The bubbles' radii and gaps, in the same units, from the live engine's (flowflow/particles.ts FOLLOWER_RADII, GAP, OUT
 *  over engine.ts ORB_RADIUS), so a picture and the live water agree. */
export const BUBBLE_R: readonly [number, number] = [15.5, 9.1];
const GAP = 2.7, OUT = 6.4;
/** The live engine's eye ink (shaders.ts ink), and the white of its light. */
const INK = "#040F24", WHITE = "#FFFFFF";

export type OrbPalette = { hi: string; mid: string; deep: string; ink: string };

const hex = (c: string): [number, number, number] => {
  const v = c.replace("#", ""); const n = parseInt(v.length === 3 ? v.split("").map((x) => x + x).join("") : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const out = (c: number[]): string => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a: number[], b: number[], t: number): number[] => a.map((x, i) => x + (b[i] - x) * t);

/** A water's three tones, worked out the way the live engine's glass is (shaders.ts glass): deep is its deep colour a little
 *  darker, mid is between its two colours, hi is its light colour lifted toward white. */
export function paletteFrom(light: string, deep: string): OrbPalette {
  const a = hex(light), b = hex(deep);
  return { deep: out(b.map((x) => x * 0.78)), mid: out(mix(b, a, 0.42)), hi: out(mix(a, [255, 255, 255], 0.6)), ink: INK };
}
export function paletteOf(w: Water): OrbPalette { const c = flowColours(w); return paletteFrom(c.light, c.deep); }

export type Eyes = "arc" | "joy" | "open" | "line" | "low" | "sleep";
/** A bubble: where its centre is from the orb's centre (orb units, y down), and whether it passes in front of the orb. */
export type Bubble = { x: number; y: number; r: number; front?: boolean };
export type PoseArt = {
  eyes: Eyes;
  /** Where the eyes look (-1 to 1 each way, y down), as the live eyes do. */
  look: [number, number];
  bubbles: [Bubble, Bubble];
  /** One small extra: a sparkle (an idea, a success), the faint path of an orbit (working), the second bubble popping (done). */
  extra?: "sparkle" | "orbit" | "pop";
  /** Off: a little dimmer. */
  dim?: boolean;
};

const rad = (d: number) => (d * Math.PI) / 180;
/** The bubbles at rest, as the live engine places them (particles.ts aim): the first where the trail leaves the orb, the
 *  second a little further round toward `sweepTo` and a little further out, so the two hug the orb in a curve. Angles in
 *  degrees, y down (90 is straight down). */
export function trail(angle: number, sweep = 34.4, close = false): [Bubble, Bubble] {
  const [ra, rb] = BUBBLE_R;
  const da = close ? R + ra + 0.5 : R + ra + GAP, db = close ? R + rb + 1 : R + rb + GAP + OUT;
  const b = angle - sweep;
  return [
    { x: da * Math.cos(rad(angle)), y: da * Math.sin(rad(angle)), r: ra },
    { x: db * Math.cos(rad(b)), y: db * Math.sin(rad(b)), r: rb },
  ];
}
/** At rest the trail leaves below and to the left (engine.ts TRAIL.free, y flipped). */
export const REST_ANGLE = 148;

/** Every pose, as the live water shows the state it stands for (characters.ts FOR_STATE). */
export const POSE_ART: Readonly<Record<Pose, PoseArt>> = {
  look: { eyes: "arc", look: [0, 0], bubbles: trail(REST_ANGLE) },
  glance: { eyes: "open", look: [0.6, 0], bubbles: trail(REST_ANGLE - 4, 26, true) },   // listening: turned to you, bubbles close
  idea: { eyes: "arc", look: [0.6, -0.7], bubbles: trail(REST_ANGLE), extra: "sparkle" },
  laptop: { eyes: "line", look: [0.5, 0.3], extra: "orbit",                             // working: the bubbles orbit it
    bubbles: [{ x: 55, y: 27.5, r: BUBBLE_R[0], front: true }, { x: -72, y: -3, r: BUBBLE_R[1] }] },
  magnify: { eyes: "open", look: [-0.7, 0.7], bubbles: trail(REST_ANGLE + 4) },          // checking: looks closely, down
  wave: { eyes: "open", look: [0, -0.4], bubbles: trail(176, 36) },                     // needs you: one bubble raised beside it
  splash: { eyes: "joy", look: [0, -0.2], extra: "pop",                                  // done: they rose, one pops
    bubbles: [{ x: -72, y: -45, r: BUBBLE_R[0] }, { x: -96, y: -12, r: BUBBLE_R[1] }] },
  sleep: { eyes: "sleep", look: [0, 0.3], bubbles: trail(REST_ANGLE), dim: true },
  swim: { eyes: "arc", look: [0.9, 0], bubbles: [{ x: -80, y: 4, r: BUBBLE_R[0] }, { x: -110, y: 22, r: BUBBLE_R[1] }] },   // on its way: they trail behind
  peek: { eyes: "open", look: [0.6, -0.7], bubbles: trail(REST_ANGLE) },
  worry: { eyes: "low", look: [0, 0.4], bubbles: trail(REST_ANGLE).map((b) => ({ ...b, y: b.y + 7 })) as [Bubble, Bubble] },   // uh oh: they sink a little
};

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** The face: two marks, never a mouth. Each eye sits 17 either side of the middle; the look moves both. */
export function face(kind: Eyes, look: [number, number], ink: string): string {
  const ox = look[0] * 4.5, oy = look[1] * 3.3, L = -17 + ox, Rx = 17 + ox, hw = 6.5, w = 4.6;
  const arc = (x: number, y: number, h: number) => `<path class="eye" d="M${f(x - hw)} ${f(y)} Q${f(x)} ${f(y - h)} ${f(x + hw)} ${f(y)}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`;
  const line = (x: number, y: number) => `<path class="eye" d="M${f(x - hw * 0.8)} ${f(y)} L${f(x + hw * 0.8)} ${f(y)}" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`;
  const oval = (x: number, y: number) => `<g class="eye"><ellipse cx="${f(x)}" cy="${f(y)}" rx="3.8" ry="5.6" fill="${ink}"/><circle cx="${f(x - 1)}" cy="${f(y - 2)}" r="1.2" fill="${WHITE}"/></g>`;
  switch (kind) {
    case "arc": return arc(L, oy + 2, 8) + arc(Rx, oy + 2, 8);
    case "joy": return arc(L, oy + 3, 12) + arc(Rx, oy + 3, 12);
    case "open": return oval(L, oy) + oval(Rx, oy);
    case "line": return line(L + 2, oy + 1) + line(Rx + 2, oy + 1);
    case "low": return arc(L, oy, -4) + arc(Rx, oy, -4);
    case "sleep": return line(L, oy + 3) + line(Rx, oy + 3);
  }
}

/** One bubble of water, in the orb's glass: deep in the middle, bright at the rim, a thin ring and one glint. */
function bubble(b: Bubble, id: string): string {
  return `<g class="bubble">
    <circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r)}" fill="url(#${id}bub)"/>
    <circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r * 0.9)}" fill="none" stroke="url(#${id}ring)" stroke-width="${f(Math.max(1, b.r * 0.1))}"/>
    <ellipse cx="${f(b.x - b.r * 0.4)}" cy="${f(b.y - b.r * 0.42)}" rx="${f(b.r * 0.3)}" ry="${f(b.r * 0.17)}" fill="${WHITE}" opacity="0.9" transform="rotate(-38 ${f(b.x - b.r * 0.4)} ${f(b.y - b.r * 0.42)})"/>
  </g>`;
}

// A sparkle in the water's light, with a fine edge of its body colour so it still shows on a white page.
const sparkle = (x: number, y: number, s: number, col: string, edge: string) =>
  `<path d="M${f(x)} ${f(y - s)} Q${f(x + s * 0.18)} ${f(y - s * 0.18)} ${f(x + s)} ${f(y)} Q${f(x + s * 0.18)} ${f(y + s * 0.18)} ${f(x)} ${f(y + s)} Q${f(x - s * 0.18)} ${f(y + s * 0.18)} ${f(x - s)} ${f(y)} Q${f(x - s * 0.18)} ${f(y - s * 0.18)} ${f(x)} ${f(y - s)} Z" fill="${col}" stroke="${edge}" stroke-width="0.9" stroke-linejoin="round"/>`;

/** The glass's gradients, clip and blur (the orb's body, its light, its ring), and the bubbles' with `bubbles`. */
function glassDefs(p: OrbPalette, id: string, bubbles: boolean): string {
  return `
  <radialGradient id="${id}body" cx="0" cy="-6" r="${R}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${p.deep}"/><stop offset="0.62" stop-color="${p.mid}" stop-opacity="0.97"/>
    <stop offset="0.9" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.hi}"/>
  </radialGradient>
  <radialGradient id="${id}base" cx="6" cy="44" r="46" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${p.hi}" stop-opacity="0.9"/><stop offset="0.45" stop-color="${p.mid}" stop-opacity="0.45"/>
    <stop offset="1" stop-color="${p.mid}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="${id}top" cx="-22" cy="-30" r="44" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${WHITE}" stop-opacity="0.4"/><stop offset="1" stop-color="${WHITE}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="${id}ring" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${WHITE}" stop-opacity="0.95"/><stop offset="0.5" stop-color="${p.hi}" stop-opacity="0.25"/>
    <stop offset="1" stop-color="${p.hi}" stop-opacity="0.85"/>
  </linearGradient>
${bubbles ? `  <radialGradient id="${id}bub" cx="0.5" cy="0.45" r="0.5">
    <stop offset="0" stop-color="${p.deep}"/><stop offset="0.6" stop-color="${p.mid}"/><stop offset="0.92" stop-color="${p.mid}"/>
    <stop offset="1" stop-color="${p.hi}"/>
  </radialGradient>
` : ""}  <clipPath id="${id}clip"><circle r="${R - 1}"/></clipPath>
  <filter id="${id}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1"/></filter>`;
}
/** The orb's round body of water: deep in the middle, bright toward the edge, the crescent of light inside the lower rim,
 *  the light from above, the thin light ring, the fine dark rim and the one glint. No face: the friendly character adds it. */
function glassBody(p: OrbPalette, id: string): string {
  return `
  <circle class="orb" r="${R}" fill="url(#${id}body)"/>
  <circle r="${R}" fill="url(#${id}base)"/>
  <g clip-path="url(#${id}clip)">
    <path d="M -46 30 A 55 55 0 0 0 40 38" fill="none" stroke="${p.hi}" stroke-width="6" stroke-linecap="round" opacity="0.65" filter="url(#${id}soft)"/>
    <circle cx="30" cy="40" r="2.4" fill="${WHITE}" opacity="0.8"/><circle cx="40" cy="31" r="1.4" fill="${WHITE}" opacity="0.6"/>
  </g>
  <circle r="${R}" fill="url(#${id}top)"/>
  <circle r="${R - 2.2}" fill="none" stroke="url(#${id}ring)" stroke-width="2.6"/>
  <circle r="${R - 0.4}" fill="none" stroke="${p.deep}" stroke-width="0.9" opacity="0.55"/>
  <ellipse cx="-27" cy="-33" rx="11" ry="6" fill="${WHITE}" opacity="0.92" transform="rotate(-38 -27 -33)"/>
  <circle cx="-12" cy="-44" r="2.4" fill="${WHITE}" opacity="0.85"/>`;
}

/** The orb and its bubbles, in orb units (no <svg> around it). `id` keeps its gradients apart from another drawing's. */
export function orbGroup(art: PoseArt, p: OrbPalette, id: string): string {
  const defs = glassDefs(p, id, true);
  const b = art.bubbles[1];
  // Done: the second bubble is popping, so it is drawn as its pop (below), not as a bubble.
  const popping = art.extra === "pop" ? b : null;
  const behind = art.bubbles.filter((x) => !x.front && x !== popping), front = art.bubbles.filter((x) => x.front);
  let back = "", over = "";
  if (art.extra === "orbit") {
    // The faint path they orbit on: the back half behind the orb, the front half across it.
    back += `<path d="M -82 9 A 82 25 0 0 1 82 9" fill="none" stroke="${p.hi}" stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round" opacity="0.45"/>`;
    over += `<path d="M -82 9 A 82 25 0 0 0 82 9" fill="none" stroke="${p.hi}" stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round" opacity="0.6"/>`;
  }
  if (art.extra === "sparkle") over += sparkle(56, -62, 7, p.hi, p.mid) + `<circle cx="70" cy="-48" r="2.4" fill="${p.mid}"/>`;
  if (art.extra === "pop") {
    // The second bubble pops: a broken thin ring where it was and a few drops flying out, and a sparkle for done.
    const cx = b.x, cy = b.y, r = b.r * 1.15;
    over += `<g class="bubble pop"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${p.mid}" stroke-width="1.8" stroke-dasharray="4 4.5" stroke-linecap="round" opacity="0.85"/>`;
    for (const [dx, dy, s] of [[-1, -0.8, 2.4], [-1.2, 0.4, 1.8], [0.1, -1.3, 2], [0.9, -0.9, 1.5]] as const) over += `<circle cx="${f(cx + dx * (r + 6))}" cy="${f(cy + dy * (r + 4))}" r="${s}" fill="${p.mid}"/>`;
    over += `</g>`;
    over += sparkle(58, -60, 6.5, p.hi, p.mid);
  }
  const orb = `${glassBody(p, id)}
  ${face(art.eyes, art.look, p.ink)}`;
  return `<defs>${defs}</defs><g${art.dim ? ` opacity="0.86"` : ""}>${back}${behind.map((x) => bubble(x, id)).join("")}${orb}${front.map((x) => bubble(x, id)).join("")}${over}</g>`;
}

/** The pose pictures' canvas (pixels) and where the orb sits on it, the same in every pose so it never jumps. The orb is
 *  90 across from its centre; its bubbles hang below and behind it, so the whole stands on the picture's bottom edge. */
export const POSE_CANVAS = { w: 351, h: 249, cx: 192, cy: 112, scale: 1.5 } as const;

/** One pose picture as an SVG (see through), the size the app's pictures are. */
export function poseSvg(pose: Pose, p: OrbPalette = paletteOf("ocean")): string {
  const c = POSE_CANVAS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}"><g transform="translate(${c.cx} ${c.cy}) scale(${c.scale})">${orbGroup(POSE_ART[pose], p, `p${pose}`)}</g></svg>`;
}

/** The small drawing on a Water choice: the orb at rest with its bubbles, in that water's own colours. */
export function waterSvg(w: Water): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-89 -66 156 154">${orbGroup(POSE_ART.look, paletteOf(w), `w${w}`)}</svg>`;
}
/** The faceless glass orb's five tones, light to deep, at 0 to 6, 12, 38, 72 and 100 percent from its lit point (M65 step 4,
 *  the critics: the friendly body reused here read as a candy marble, with a light cyan middle). Ocean is the lab's own;
 *  another water keeps the same steps from its deep colour: a near white, a pale tint, a middle no lighter than Ocean's,
 *  the deep colour, and a darker deep at the rim. */
const ORB_LAB: readonly [string, string, string, string, string] = ["#FFFFFF", "#CFE3FF", "#6FA8FF", "#2559C8", "#13306F"];
function orbStops(w: Water): readonly [string, string, string, string, string] {
  if (w === "ocean") return ORB_LAB;
  const d = hex(WATER_TINTS[w].deep), white = [255, 255, 255];
  return [WHITE, out(mix(d, white, 0.78)), out(mix(d, white, 0.26)), out(d), out(d.map((x) => x * 0.5))];
}
export const ORB_STOPS: Readonly<Record<Water, readonly [string, string, string, string, string]>> =
  Object.fromEntries(WATERS.map((w) => [w, orbStops(w)])) as Record<Water, readonly [string, string, string, string, string]>;

/** The faceless glass orb of the Instrument look (M65, the lab's look A): one round body lit from the top left, a soft shade
 *  at its foot and a fine dark rim. One small highlight, which is the gradient's own white point; no light ring inside the
 *  rim, no crescent, no sparkles and no big glint (the friendly character keeps those). Its ring is drawn by the page
 *  (ui/parts.css .ui-orb), so the state's colour is a token and never painted into the picture. */
export function glassOrbSvg(w: Water): string {
  const [white, pale, middle, deep, rim] = ORB_STOPS[w], id = `o${w}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R} ${R * 2} ${R * 2}"><defs>
  <radialGradient id="${id}glass" cx="0.35" cy="0.3" r="0.95" fx="0.35" fy="0.3">
    <stop offset="0" stop-color="${white}"/><stop offset="0.06" stop-color="${white}"/><stop offset="0.12" stop-color="${pale}"/>
    <stop offset="0.38" stop-color="${middle}"/><stop offset="0.72" stop-color="${deep}"/><stop offset="1" stop-color="${rim}"/>
  </radialGradient>
  <linearGradient id="${id}foot" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
  </linearGradient>
</defs>
  <circle class="orb" r="${R}" fill="url(#${id}glass)"/>
  <circle r="${R}" fill="url(#${id}foot)"/>
  <circle r="${R - 0.45}" fill="none" stroke="${rim}" stroke-width="0.9" opacity="0.4"/></svg>`;
}
/** As an address an <img> can show (the pages allow data: pictures). */
export const svgUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** Every part's extent (orb units): the orb's and each bubble's box, for the tests that keep everything on the canvas. */
export function extents(art: PoseArt): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = [-R, R, ...art.bubbles.flatMap((b) => [b.x - b.r, b.x + b.r])], ys = [-R, R, ...art.bubbles.flatMap((b) => [b.y - b.r, b.y + b.r])];
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
