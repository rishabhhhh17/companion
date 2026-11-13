// M83 Part C (the founder, 12 Nov 2026: Now "needs to be minimal but detailed"): a compact strip of facts under Home's lead,
// the same facts the notch's panel says (notchQuick.ts homeFacts): the last check and when, changes waiting, the AI tools
// connected and what was caught this week. Each tile is a small caption over a short value with its meaning's dot, and a
// press opens the right place in Home. A fact with no data is not drawn; with none at all the strip is not there.
import type { NotchFact, NotchFactId } from "./notchQuick.ts";
import { S } from "./strings.ts";
import { Dot } from "./ui/parts.tsx";

export function StatusStrip({ facts, open, places }: { facts: NotchFact[]; open: (id: NotchFactId) => void; places: Record<NotchFactId, string> }) {
  if (facts.length === 0) return null;
  return (
    <nav className="now-strip" aria-label={S.notch.facts.stripLabel} data-n={facts.length}>
      {facts.map((f) => (
        <button key={f.id} type="button" className="now-tile" data-fact={f.id} title={f.words} aria-label={S.notch.facts.tileSay(f.label, f.value, places[f.id])} onClick={() => open(f.id)}>
          <span className="now-tile-label">{f.colour ? <Dot colour={f.colour} /> : <span className="now-tile-none" aria-hidden="true" />}{f.label}</span>
          <span className="now-tile-value">{f.value}</span>
        </button>
      ))}
    </nav>
  );
}
