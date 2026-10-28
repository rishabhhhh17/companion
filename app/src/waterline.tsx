// The surface of the water (M17, the waterline): across Home, where Flowflow floats and the work happens below, and at the
// top of the rising water in the first run. Black above a thin water blue line; the stylesheet slides it sideways one wave
// at a time, still with reduced motion. `fill`: what is above the line (Home's black sky), or none to draw only the line
// and the water under it.
const WAVE = "M0 11 " + Array.from({ length: 16 }, (_, i) => `C ${i * 80 + 20} ${i % 2 ? 19 : 3}, ${i * 80 + 60} ${i % 2 ? 19 : 3}, ${i * 80 + 80} 11`).join(" ");
export function Waterline({ under = false }: { under?: boolean }) {
  return (
    <div className={under ? "waterline under" : "waterline"} aria-hidden="true">
      <svg viewBox="0 0 1280 22" preserveAspectRatio="xMinYMid slice">
        {under ? <path className="sea" d={`${WAVE} V22 H0 Z`} /> : <path className="sky" d={`${WAVE} V0 H0 Z`} />}
        <path className="line" d={WAVE} fill="none" strokeWidth="1.6" />
      </svg>
    </div>
  );
}
