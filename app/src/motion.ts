// Reduced motion, read in one place (AGENTS.md, the bar 13). The Mac's own setting (System Settings, Accessibility,
// Display, Reduce motion) reaches the pages as prefers-reduced-motion; the shell reads the same setting for the character's
// trips (main.rs `reduce_motion`). Companion's own Motion setting (character.motion, in Settings) can ask for less motion
// inside Companion only, without changing the rest of the Mac: then Companion moves as little as it does with the Mac's
// own setting. Every page asks here and never reads either itself (motion.test.ts checks). With reduced motion nothing
// flies, pulses, draws itself on or bursts: the ring and the character are simply there.
import { setting, subscribe } from "./settingsStore.ts";

export const REDUCED = "(prefers-reduced-motion: reduce)";

/** Companion's own Motion setting is Less motion (character.motion "less"; the usual is to follow the Mac). */
export const lessMotion = (): boolean => setting("character.motion") === "less";

/** Does the Mac ask for less motion right now? With no way to ask (a test), the usual motion. */
function macReduced(): boolean {
  try { return typeof matchMedia === "function" && matchMedia(REDUCED).matches; } catch { return false; }
}

/** Should Companion move less right now: the Mac asks for it, or Companion's own Motion setting does. */
export function reducedMotion(): boolean { return lessMotion() || macReduced(); }

/** Tells `f` each time the answer changes (the Mac's setting, or Companion's own); the function it returns stops that. */
export function watchReducedMotion(f: (reduced: boolean) => void): () => void {
  let last = reducedMotion();
  const stopSetting = subscribe(() => { const now = reducedMotion(); if (now !== last) { last = now; f(now); } });
  try {
    if (typeof matchMedia !== "function") return stopSetting;
    const q = matchMedia(REDUCED);
    const h = () => { last = reducedMotion(); f(last); };
    q.addEventListener("change", h);
    return () => { stopSetting(); q.removeEventListener("change", h); };
  } catch { return stopSetting; }
}

/** Marks a page's root while Less motion is on, so its stylesheet stops every animation and transition of its own
 *  (style.css and overlay.html, `:root[data-less-motion]`). Each page calls this once as it starts; the mark follows every
 *  change of the setting until the function it returns stops it. */
type Root = { toggleAttribute(name: string, force: boolean): boolean } | null | undefined;
const pageRoot = (): Root => { try { return globalThis.document?.documentElement; } catch { return null; } };
export function followLessMotion(root: Root = pageRoot()): () => void {
  if (!root) return () => {};
  const mark = () => { try { root.toggleAttribute("data-less-motion", lessMotion()); } catch { /* a page that cannot be marked keeps its usual motion */ } };
  mark();
  return subscribe(mark);
}

/** Decoration that moves (a reaction, the burst of dots, the confetti): only with reactions on and Companion not asked
 *  for less motion. What carries meaning (the ring, the tick, the state's colour) shows either way. */
export function playful(reactions: boolean, reduced: boolean): boolean { return reactions && !reduced; }
