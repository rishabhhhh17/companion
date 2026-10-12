// Hand drawn shapes for Draw it for me: a line or a box as a pen would make it, not as a ruler would. Everything is
// deterministic (seeded by a name), so the same diagram looks the same every time and can be tested; every point stays
// within a few pixels of the true shape, so a sketch can never wander outside the area it is given.

/** A small seeded random source: the same text gives the same numbers, each in [0, 1). */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const f = (n: number) => Math.round(n * 10) / 10;

/** How far a shape of this size may stray: more for big things, never more than 2.5 points, never more than a tenth of the size. */
const wobble = (size: number) => Math.max(0.4, Math.min(2.5, size / 10));

/** One pass of a wobbly line from (x1, y1) to (x2, y2): a gentle curve through a slightly off middle. */
function pass(x1: number, y1: number, x2: number, y2: number, r: () => number, amp: number): string {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;   // sideways
  const o = (k: number) => (r() * 2 - 1) * amp * k;
  const m = 0.45 + r() * 0.1;
  const [cx, cy] = [x1 + dx * m + nx * o(1), y1 + dy * m + ny * o(1)];
  return `M${f(x1 + nx * o(0.4))} ${f(y1 + ny * o(0.4))} Q${f(cx)} ${f(cy)} ${f(x2 + nx * o(0.4))} ${f(y2 + ny * o(0.4))}`;
}

/** A line as a pen draws it: two slightly different passes over the same path. */
export function sketchLine(x1: number, y1: number, x2: number, y2: number, seed: string): string {
  const r = rng(seed), amp = wobble(Math.hypot(x2 - x1, y2 - y1));
  return `${pass(x1, y1, x2, y2, r, amp)} ${pass(x1, y1, x2, y2, r, amp)}`;
}

/** A box as four wobbly sides, each gone over twice, corners a little rounded by the overlap of the strokes. */
export function sketchRect(x: number, y: number, w: number, h: number, seed: string): string {
  const r = rng(seed), amp = wobble(Math.min(w, h));
  const sides: [number, number, number, number][] = [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]];
  return sides.map(([a, b, c, d]) => `${pass(a, b, c, d, r, amp)} ${pass(a, b, c, d, r, amp)}`).join(" ");
}

/** A ring around a place, drawn as a loop that does not quite close, the way people circle things. */
export function sketchEllipse(cx: number, cy: number, rx: number, ry: number, seed: string): string {
  const r = rng(seed), amp = wobble(Math.min(rx, ry) * 2);
  const start = r() * Math.PI * 2, turns = 1.08;   // a little more than once round, so the ends overlap
  const pts: string[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = start + (i / steps) * Math.PI * 2 * turns;
    const grow = 1 + (i / steps) * 0.04;   // the second lap drifts a touch outward
    pts.push(`${f(cx + Math.cos(a) * rx * grow + (r() * 2 - 1) * amp * 0.5)} ${f(cy + Math.sin(a) * ry * grow + (r() * 2 - 1) * amp * 0.5)}`);
  }
  return `M${pts[0]} ` + pts.slice(1).map((p) => `L${p}`).join(" ");
}
