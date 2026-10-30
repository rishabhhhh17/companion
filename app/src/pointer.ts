/** How long a ring that does not wait for a click stays, counted from when the draw was ordered (the flight is part of it),
 *  unless changed in Settings (How long a ring stays, point.ringSeconds, 5 to 30 seconds). The shell sends the time with
 *  each ring and watches it half a second longer (anchor.rs watch_ms), so no part of it goes unwatched (rule 22). */
export const RING_MS = 10_000;
export const RING_MIN_MS = 5_000;
export const RING_MAX_MS = 30_000;
/** The time sent with a ring, kept inside 5 to 30 seconds; nothing usable is the usual ten. */
export function ringMsOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(RING_MAX_MS, Math.max(RING_MIN_MS, v))) : RING_MS;
}
/** Pace of step by step pointing (point.pace): slower is half as long again, faster three quarters, normal as today. */
export function paceFactor(pace: unknown): number { return pace === "slower" ? 1.5 : pace === "faster" ? 0.75 : 1; }
// How long the arrow takes to fly to its target: the distance over 800 points a second, never faster than 0.6 s
// (so it can be followed) and never slower than 1.4 s (so it never feels slow), at the chosen pace.
export function flightMs(distance: number, pace?: unknown): number { return Math.min(1400, Math.max(600, (distance / 800) * 1000)) * paceFactor(pace); }

/** How a ring, its arrow and its marks look. `halo`: a dark edge drawn under it (high contrast). */
export type RingLook = { stroke: string; width: number; dash: string; halo: string | null };
/** A guess (rule 22): the soft dashed ring, the same in every colour, so it is always told apart from a confirmed one. */
export const GUESS_LOOK: RingLook = { stroke: "#ffb020", width: 3, dash: "8 6", halo: null };
const SOLID: Record<string, RingLook> = {
  // M28: the usual ring (still stored as "orange" so nobody's choice changes) is the brand lime; drawn marks get a dark edge (ink.ts), readable
  // on light and dark apps alike; with the water pointer its beads take the water colour. No orange is drawn any more.
  orange: { stroke: "#E9ECF1", width: 4, dash: "", halo: null },
  red: { stroke: "#ff3b30", width: 4, dash: "", halo: null },
  yellow: { stroke: "#ffd60a", width: 4, dash: "", halo: null },
  blue: { stroke: "#0a84ff", width: 4, dash: "", halo: null },
  highContrast: { stroke: "#ffffff", width: 4, dash: "", halo: "#000000" },
};
/** Ring colour (point.colour): the confirmed ring in the chosen colour, the usual one unless changed; a guess always the soft ring. */
export function ringLook(colour: unknown, exact: boolean): RingLook {
  if (!exact) return GUESS_LOOK;
  return SOLID[typeof colour === "string" && Object.hasOwn(SOLID, colour) ? colour : "orange"];
}

/** Ring lettering (point.lettering) and the text size picked in Settings: the caption's font and how much room it needs, so
 *  it is kept inside the window. Plain at the usual size is the caption as it always was. */
const CAPTION_PX: Record<string, number> = { standard: 15, large: 17, larger: 19, largest: 21, huge: 25 };
const PLAIN_FONT = 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif';
const HAND_FONT = "'Bradley Hand', 'Noteworthy', 'Marker Felt', 'Segoe Print', cursive";
export function captionStyle(lettering: unknown, size: unknown): { font: string; maxWidth: number; reserveW: number; reserveH: number } {
  const base = CAPTION_PX[typeof size === "string" && Object.hasOwn(CAPTION_PX, size) ? size : "standard"];
  const hand = lettering === "handwritten";
  const px = hand ? base + 2 : base;
  const f = px / 15;
  const maxWidth = Math.round(300 * f);
  return { font: `700 ${px}px ${hand ? HAND_FONT : PLAIN_FONT}`, maxWidth, reserveW: maxWidth + 20, reserveH: Math.round(60 * f) };
}
/** Where the caption goes beside its ring, and how wide it may be, inside `box` (the window the ring is clipped to, or the
 *  whole screen): the words stay inside the window too (rule 22). In a window narrower than the caption it gets narrower,
 *  never under 120 points; in one wide enough, it is exactly where and as wide as it always was. `side`: 1 to the right of
 *  the ring, -1 to its left. */
export function captionPlace(cs: { maxWidth: number; reserveW: number; reserveH: number }, box: { x: number; y: number; w: number; h: number }, ring: { cx: number; cy: number; rx: number }, side: 1 | -1): { left: number; top: number; maxWidth: number } {
  // 38: the margin of 8 points on each side and the caption's own padding (11 points each side).
  const maxWidth = Math.max(120, Math.min(cs.maxWidth, box.w - 38));
  const reserveW = cs.reserveW - cs.maxWidth + maxWidth;
  const left = Math.max(box.x + 8, Math.min(box.x + box.w - reserveW, side > 0 ? ring.cx + ring.rx + 12 : ring.cx - ring.rx - 12 - maxWidth));
  const top = Math.max(box.y + 8, Math.min(box.y + box.h - cs.reserveH, ring.cy - 18));
  return { left, top, maxWidth };
}
// The arrow's easing (slow out, quick through the middle, slow in) and how far its path bends above the straight line:
// a quarter of the way, at most 80 points. The character's trip to a window uses the same two (roam.rs ease and bend).
export function ease(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
export function bend(distance: number): number { return Math.min(80, distance / 4); }

// The celebration when the person clicks the right thing: a short burst of dots from the ring's edge, evenly spread,
// travelling a little way out. Deterministic, so it looks the same every time and can be tested.
export type Dot = { x: number; y: number; dx: number; dy: number; r: number };
export function burst(rect: { x: number; y: number; w: number; h: number }, n = 14): Dot[] {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const rx = Math.max(rect.w / 2 + 10, 26), ry = Math.max(rect.h / 2 + 10, 26);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, reach = 34 + (i % 3) * 10;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, dx: Math.cos(a) * reach, dy: Math.sin(a) * reach, r: 3 + (i % 2) };
  });
}

// Confetti for the big moments: pieces fan out upwards and away from the screen edge the character sits on, then fall.
export type Piece = { vx: number; vy: number; spin: number; color: string };
export const CONFETTI_S = 1.5;
export function confetti(n: number, dockedRight: boolean): Piece[] {
  const colors = ["#E9ECF1", "#59D2FF", "#FFFFFF", "#ffb020", "#7BE495"];
  const away = dockedRight ? -1 : 1;
  return Array.from({ length: n }, (_, i) => {
    const a = (10 + (i / Math.max(1, n - 1)) * 70) * (Math.PI / 180);   // 10 to 80 degrees above the horizontal
    const speed = 300 + (i % 5) * 60;
    return { vx: away * Math.cos(a) * speed, vy: -Math.sin(a) * speed - 100, spin: (i % 2 ? 1 : -1) * (180 + i * 9), color: colors[i % colors.length] };
  });
}
/** Where a piece is after t seconds (gravity pulls it down). */
export function at(p: Piece, t: number): { dx: number; dy: number } { return { dx: p.vx * t, dy: p.vy * t + 520 * t * t }; }

/** F17 4.2: below this the model is guessing, so nothing is drawn and Companion says in words where to look. */
export const LOW_CONFIDENCE = 0.4;
export function aimDecision(confidence: unknown): "draw" | "words" {
  return typeof confidence === "number" && Number.isFinite(confidence) && confidence >= LOW_CONFIDENCE ? "draw" : "words";
}
/** The words used instead of a guess's ring when the person asked for words only (point.guesses). */
export function guessWords(targetText: string, caption: string): string {
  const look = targetText.trim().replace(/\s+/g, " ").slice(0, 80);
  return `I am only guessing where that is, so I did not draw a ring.${look ? ` Look for "${look}".` : ""}${caption.trim() ? ` ${caption.trim().slice(0, 160)}` : ""}`;
}
/** The words used instead of a ring. Plain, and says what to look for. */
export function notSureWords(targetText: string, caption: string): string {
  const look = targetText.trim().replace(/\s+/g, " ").slice(0, 80);
  return `I am not sure where that is, so I will not point at the wrong thing.${look ? ` Look for "${look}".` : ""}${caption.trim() ? ` ${caption.trim().slice(0, 160)}` : ""}`;
}
