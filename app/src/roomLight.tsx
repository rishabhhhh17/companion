// The room's light (the brand language, 1 Nov 2026; ui/look.css .room): the element's sky near the top, a wash that carries
// its colour all the way down, a glow rising behind the work, a floor its foot settles into, light rays through the water,
// soft motes of light drifting in it, and a faint grain over all of it.
// Decoration only, hidden from VoiceOver. The grain is SVG noise drawn once by the page itself (nothing is fetched); the
// stylesheet only moves and fades the layers.
// M66 fix 11: a room change sets the new colours at once (nothing recolours frame by frame). The light of the room just
// left is drawn once more on top, in its own colours, and fades out by opacity (look.css .room-was), then goes.
import { useEffect, useRef, useState } from "react";
import { DUR } from "./motionTokens.ts";
import { reducedMotion } from "./motion.ts";

/** The room that was, while it fades: shown for `ms` after a change, then gone. Pure, so it can be tested. */
export function roomWas(prev: string | undefined, now: string | undefined): string | null {
  return prev && now && prev !== now ? prev : null;
}

function Layers({ element, was }: { element?: string; was?: boolean }) {
  return (
    <div className={was ? "room room-was" : "room"} data-element={was ? element : undefined} aria-hidden="true">
      <i className="room-floor" />
      <i className="room-mid" />
      <i className="room-glow" />
      <i className="room-sky" />
      <i className="room-rays" />
      <i className="room-motes" />
      {was ? null : (
        <svg className="room-grain" focusable="false">
          <filter id="room-grain-f" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#room-grain-f)" />
        </svg>
      )}
    </div>
  );
}

/** `element`: the room shown now (Home's data-element). */
export function RoomLight({ element }: { element?: string }) {
  const last = useRef(element);
  const [was, setWas] = useState<{ element: string; n: number } | null>(null);
  useEffect(() => {
    const prev = roomWas(last.current, element);
    last.current = element;
    if (!prev) return;
    setWas((w) => ({ element: prev, n: (w?.n ?? 0) + 1 }));
    // With reduced motion the old light still fades, as a short plain fade (style.css), never a slide.
    const t = setTimeout(() => setWas(null), reducedMotion() ? DUR[1] : DUR[3]);
    return () => clearTimeout(t);
  }, [element]);
  return (<>
    <Layers />
    {was ? <Layers key={was.n} element={was.element} was /> : null}
  </>);
}
