// M83 Part D: the character's body on a trip (flight.ts has the maths). The shell flies the window along the curve and
// says so (the "roam" event with the trip's way, time and bend); this runs the same curve on the page's clock and shapes
// the character's own element: stretched and leaning along the way it flies, a little bigger at mid flight, then a soft
// squash on landing that settles. The live water also feels the speed (its jelly lag, controller.ts push). Only the
// element's scale and rotate are set, on top of its size (--char-scale), and both are cleared when it has landed. With
// Reduce motion or Less motion nothing flies: the shell sends fade, and the character fades out and back in.
import { useEffect, type RefObject } from "react";
import { FLIGHT, bodyAt, flightAt, flightFrom, landAt, type Flight } from "./flight.ts";
import { reducedMotion } from "./motion.ts";
import { transition } from "./motionTokens.ts";
import { roamFrom } from "./roam.ts";
import { listen } from "./tauri.ts";

const SIZE = "var(--char-scale, 1)";
const shape = (b: HTMLElement, sx: number, sy: number, lean: number) => { b.style.scale = `calc(${SIZE} * ${sx}) calc(${SIZE} * ${sy})`; b.style.rotate = `${lean}deg`; };
const unshape = (b: HTMLElement) => { b.style.scale = ""; b.style.rotate = ""; };

/** `el`: the character's own element. `push`: the speed it flies at (points a second, y down), for the water's lag. */
export function useFlight(el: RefObject<HTMLElement | null>, push: (vx: number, vy: number) => void): void {
  useEffect(() => {
    let raf = 0, flight: Flight | null = null, began = 0, landedAt = 0, faded = false;
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const land = (now: number) => {
      const b = el.current; const l = landAt(now - landedAt);
      if (!b) return;
      if (reducedMotion()) { unshape(b); raf = 0; return; }
      if (l.done) { unshape(b); raf = 0; return; }
      shape(b, l.sx, l.sy, 0);
      raf = requestAnimationFrame(land);
    };
    const fly = (now: number) => {
      const b = el.current, f = flight;
      if (!b || !f) { raf = 0; return; }
      if (reducedMotion()) { unshape(b); flight = null; raf = 0; return; }
      const ms = now - began, a = flightAt(f, ms);
      if (a.done) { flight = null; push(0, 0); landedAt = now; land(now); return; }
      const s = bodyAt(f, ms);
      shape(b, s.sx, s.sy, s.lean);
      push(a.vx, a.vy);
      raf = requestAnimationFrame(fly);
    };
    const off = listen("roam", (e) => {
      const b = el.current; if (!b) return;
      const phase = roamFrom(e.payload).phase;
      const reduced = reducedMotion();
      // Reduce motion: the shell fades instead of flying. Out now, and back in with the next state (it is there by then).
      // The shell sends fade only with reduced motion; the fade itself is opacity only, the one motion Reduce motion keeps.
      if (phase === "fade") {
        if (reduced) b.style.transition = transition("opacity", FLIGHT.fadeMs);
        b.style.opacity = "0"; faded = true; return;
      }
      if (faded) { faded = false; b.style.opacity = ""; setTimeout(() => { if (!faded && reduced) b.style.transition = ""; }, FLIGHT.fadeMs + 20); return; }
      const f = flightFrom(e.payload);
      if (!f) return;   // the other states change nothing here; a landing already under way runs on
      if (reduced) return;
      stop(); flight = f; began = performance.now();
      raf = requestAnimationFrame(fly);
    });
    return () => { stop(); void off.then((u) => u()); const b = el.current; if (b) { unshape(b); b.style.opacity = ""; } };
  }, []);
}
