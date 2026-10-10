// The visual receipt: what is on the page now that was not there before, as a few boxes to circle.
// Pages are compared by what they show (each piece of text, button, field and picture, with where it sits), not pixel by
// pixel, so a banner added at the top that pushes everything down circles the banner, not the whole page.
export type PageItem = { key: string; x: number; y: number; w: number; h: number };
export type Box = { x: number; y: number; w: number; h: number };

const GAP = 24;        // new things closer than this become one circle
const MAX_CIRCLES = 3;

const near = (a: Box, b: Box) => a.x <= b.x + b.w + GAP && b.x <= a.x + a.w + GAP && a.y <= b.y + b.h + GAP && b.y <= a.y + a.h + GAP;
const union = (a: Box, b: Box): Box => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };

function clip(b: Box, view?: { w: number; h: number }): Box | null {
  if (!view) return b;
  const x = Math.max(0, b.x), y = Math.max(0, b.y), r = Math.min(view.w, b.x + b.w), d = Math.min(view.h, b.y + b.h);
  return r - x >= 2 && d - y >= 2 ? { x, y, w: r - x, h: d - y } : null;
}

/** Boxes around what is new on the page, biggest first, at most three. */
export function changedRegions(before: PageItem[], after: PageItem[], view?: { w: number; h: number }): Box[] {
  const seen = new Map<string, number>();
  for (const b of before) seen.set(b.key, (seen.get(b.key) ?? 0) + 1);
  const fresh: Box[] = [];
  for (const a of after) {
    const n = seen.get(a.key) ?? 0;
    if (n > 0) { seen.set(a.key, n - 1); continue; }
    const c = clip({ x: a.x, y: a.y, w: a.w, h: a.h }, view);
    if (c) fresh.push(c);
  }
  if (!fresh.length) return [];
  // A page that showed nothing before: the whole new content is the change.
  if (before.length === 0) return [fresh.reduce(union)];
  let boxes = fresh;
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (near(boxes[i], boxes[j])) { boxes = [...boxes.filter((_, k) => k !== i && k !== j), union(boxes[i], boxes[j])]; merged = true; break outer; }
    }
  }
  return boxes.sort((a, b) => b.w * b.h - a.w * a.h || a.y - b.y).slice(0, MAX_CIRCLES);
}
