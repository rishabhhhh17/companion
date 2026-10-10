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
