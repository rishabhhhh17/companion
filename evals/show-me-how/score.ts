// How a point is scored in the aim eval, the way the app would act on it: raw, the point is inside the target; snapped,
// the smallest clickable thing under the point IS the target (what the Mac's accessibility lookup would give the ring).
// A target with a label (data-eval-target) is matched by that label, so another control with the same words is a miss.
// An ask that more than one control answers just as well (two ways to add a column) is given all of them: a hit on any is
// right.
export type Element = { t: string; id: string | null; x: number; y: number; w: number; h: number };

export function scorePoint(hit: { x: number; y: number } | null, target: Element | Element[], els: Element[]): { raw: boolean; snapped: boolean } {
  if (!hit) return { raw: false, snapped: false };
  const targets = Array.isArray(target) ? target : [target];
  const inside = (e: Element) => hit.x >= e.x && hit.x <= e.x + e.w && hit.y >= e.y && hit.y <= e.y + e.h;
  const under = els.filter(inside).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  const same = (e: Element, t: Element) => (t.id ? e.id === t.id : e.t === t.t) && Math.abs(e.x - t.x) < 1 && Math.abs(e.y - t.y) < 1;
  return { raw: targets.some(inside), snapped: !!under && targets.some((t) => same(under, t)) };
}
