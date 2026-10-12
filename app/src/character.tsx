// The character's face, drawn in code on top of the round body (the body itself carries the state's colour and ring).
// Plain shapes only: two eyes that say what is happening, brows when it needs you, sound rings while listening, dots
// while thinking. Nothing here moves when the person asked for reduced motion or when the character has settled.
import { faceFor } from "./face.ts";
import type { CharacterState } from "./model.ts";

const INK = "#1b1b1f";
// A small light in each eye makes the face read as awake.
const shine = (x: number, y: number) => <circle cx={x + 2} cy={y - 3} r={1.8} fill="#fff" opacity={0.85} />;

function eyes(kind: ReturnType<typeof faceFor>["eyes"]) {
  const at = [37, 63];
  switch (kind) {
    case "open": return at.map((x) => <g key={x}><ellipse cx={x} cy={47} rx={6.5} ry={8.5} fill={INK} />{shine(x, 47)}</g>);
    case "wide": return at.map((x) => <g key={x}><ellipse cx={x} cy={46} rx={7.5} ry={10} fill={INK} />{shine(x, 46)}</g>);
    case "up": return at.map((x) => <ellipse key={x} cx={x + 2} cy={40} rx={5.5} ry={7} fill={INK} />);
    case "focus": return at.map((x) => <ellipse key={x} cx={x} cy={47} rx={6.5} ry={4.5} fill={INK} />);
    // Looking: the eyes glance to the side (and sweep, unless the character is still).
    case "scan": return <g className="scan">{at.map((x) => <g key={x}><ellipse cx={x + 5} cy={47} rx={5.5} ry={7.5} fill={INK} />{shine(x + 5, 47)}</g>)}</g>;
    case "raised": return <>
      {at.map((x) => <g key={x}><ellipse cx={x} cy={49} rx={6.5} ry={8.5} fill={INK} />{shine(x, 49)}</g>)}
      <path d="M29 33 Q37 25 45 31" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M55 31 Q63 25 71 33" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    </>;
    case "happy": return at.map((x) => <path key={x} d={`M${x - 8} 49 Q${x} 38 ${x + 8} 49`} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />);
    case "flat": return at.map((x) => <path key={x} d={`M${x - 7} 47 L${x + 7} 47`} stroke={INK} strokeWidth={4.5} strokeLinecap="round" />);
    case "closed": return at.map((x) => <path key={x} d={`M${x - 7} 45 Q${x} 51 ${x + 7} 45`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />);
  }
}

export function Face({ state }: { state: CharacterState }) {
  const f = faceFor(state);
  return (
    <svg className="face" viewBox="0 0 100 100" aria-hidden="true" data-eyes={f.eyes}>
      <g className={f.blink ? "eyes blink" : "eyes"}>{eyes(f.eyes)}</g>
      {f.extra === "rings" && <g className="rings" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
        <path d="M84 38 Q90 48 84 58" /><path d="M90 32 Q99 48 90 64" opacity={0.6} />
      </g>}
      {f.extra === "dots" && <g className="dots" fill={INK}>
        <circle cx={40} cy={20} r={3.2} /><circle cx={50} cy={16} r={3.2} /><circle cx={60} cy={20} r={3.2} />
      </g>}
    </svg>
  );
}
