/** How long a ring that does not wait for a click stays, counted from when the draw was ordered (the flight is part of it).
 *  The shell watches it a little longer than this (anchor.rs WATCH_MAX_MS), so no part of it goes unwatched (rule 22). */
export const RING_MS = 10_000;
// How long the arrow takes to fly to its target: the distance over 800 points a second, never faster than 0.6 s
// (so it can be followed) and never slower than 1.4 s (so it never feels slow).
export function flightMs(distance: number): number { return Math.min(1400, Math.max(600, (distance / 800) * 1000)); }

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
  const colors = ["#ff9a2e", "#1e8a4c", "#ffb020", "#4c8dff", "#e5484d"];
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
/** The words used instead of a ring. Plain, and says what to look for. */
export function notSureWords(targetText: string, caption: string): string {
  const look = targetText.trim().replace(/\s+/g, " ").slice(0, 80);
  return `I am not sure where that is, so I will not point at the wrong thing.${look ? ` Look for "${look}".` : ""}${caption.trim() ? ` ${caption.trim().slice(0, 160)}` : ""}`;
}
