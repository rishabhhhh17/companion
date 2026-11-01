// The room's light (the brand language, 1 Nov 2026; ui/look.css .room): the element's sky near the top, a wash that carries
// its colour all the way down, a glow rising behind the work, a floor its foot settles into, light rays through the water,
// soft motes of light drifting in it, and a faint grain over all of it.
// Decoration only, hidden from VoiceOver. The grain is SVG noise drawn once by the page itself (nothing is fetched); the
// stylesheet only moves and fades the layers.
export function RoomLight() {
  return (
    <div className="room" aria-hidden="true">
      <i className="room-floor" />
      <i className="room-mid" />
      <i className="room-glow" />
      <i className="room-sky" />
      <i className="room-rays" />
      <i className="room-motes" />
      <svg className="room-grain" focusable="false">
        <filter id="room-grain-f" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#room-grain-f)" />
      </svg>
    </div>
  );
}
