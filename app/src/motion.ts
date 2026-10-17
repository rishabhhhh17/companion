// Reduced motion, read in one place (AGENTS.md, the bar 13). The Mac's own setting (System Settings, Accessibility,
// Display, Reduce motion) reaches the pages as prefers-reduced-motion; the shell reads the same setting for the character's
// trips (main.rs `reduce_motion`). Every page asks here and never reads it itself (motion.test.ts checks). With reduced
// motion nothing flies, pulses, draws itself on or bursts: the ring and the character are simply there.
export const REDUCED = "(prefers-reduced-motion: reduce)";

/** Does the Mac ask for less motion right now? With no way to ask (a test), the usual motion. */
export function reducedMotion(): boolean {
  try { return typeof matchMedia === "function" && matchMedia(REDUCED).matches; } catch { return false; }
}

/** Tells `f` each time the setting changes; the function it returns stops that. */
export function watchReducedMotion(f: (reduced: boolean) => void): () => void {
  try {
    if (typeof matchMedia !== "function") return () => {};
    const q = matchMedia(REDUCED);
    const h = () => f(q.matches);
    q.addEventListener("change", h);
    return () => q.removeEventListener("change", h);
  } catch { return () => {}; }
}

/** Decoration that moves (a reaction, the burst of dots, the confetti): only with reactions on and the Mac not asking for
 *  less motion. What carries meaning (the ring, the tick, the state's colour) shows either way. */
export function playful(reactions: boolean, reduced: boolean): boolean { return reactions && !reduced; }
