// M66 (the character, smooth and flowy). What the character on the edge keeps on the page and shows, as plain rules the
// tests can hold. Nothing here moves anything: dock.tsx renders it and style.css fades it by opacity and transform only.
//
// 1. The word under the character never pushes it. It is always on the page, placed under the character out of the
//    layout, and shows by opacity and a small scale. It used to join the layout when there was something to say, so the
//    character jumped 14 px (half of the word's height plus the gap) each time work started or stopped.
// 2. Every state stays mounted and the new one cross fades in (the plan's "keep every state mounted"). The pictures
//    (Draw live off) keep each pose they have shown on the page, stacked, and only the one in force is opaque.
// 3. Thinking shows a small glyph at the character itself (a turning arc), never an empty card waiting for words.
import type { CharacterState } from "./model.ts";

/** Whether the word under the character shows. Resting with nothing waiting it is for VoiceOver only (it stays on the page
 *  as the live region, see-through), and while the drop ring is open the ring takes its place. */
export function labelShows(state: CharacterState, waiting: number, dropMenu: boolean): boolean {
  if (dropMenu) return false;
  return state !== "idle" || waiting > 0;
}

/** The most poses kept on the page at once; the oldest that is not in force goes first. A handful of small pictures. */
export const POSES_KEPT = 6;

/** The poses on the page after `pose` comes in: every one shown before stays (so going back is a cross fade, not a new
 *  picture loading), the one in force last, never more than POSES_KEPT. The order of the rest never changes, so React
 *  never rebuilds a picture that is fading. */
export function posesKept<P extends string>(kept: readonly P[], pose: P, max = POSES_KEPT): P[] {
  const next = kept.includes(pose) ? [...kept] : [...kept, pose];
  while (next.length > Math.max(1, max)) {
    const old = next.findIndex((p) => p !== pose);
    if (old < 0) break;
    next.splice(old, 1);
  }
  return next;
}

/** Whether the small thinking glyph shows at the character: while it thinks (before the first words or the first step),
 *  the time an empty card used to fill. Working and checking have their own ring and words. */
export function thinkingShows(state: CharacterState): boolean {
  return state === "thinking";
}
