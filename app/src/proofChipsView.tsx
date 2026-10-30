import type { Model } from "./model.ts";
import { proofChips } from "./proofChips.ts";
import { S } from "./strings.ts";
import { ProofChip } from "./ui/parts.tsx";

/** The checks that ran on a fix, as Proof chips under its receipt (proofChips.ts): a tick in green for one that passed, a
 *  cross in red for one that failed. The words carry it for VoiceOver; the colour is never the only sign. */
export function ProofChips({ m }: { m: Model }) {
  const chips = proofChips(m);
  if (!chips.length) return null;
  return (
    <ul className="proof-chips" aria-label={S.proofChipsLabel}>
      {chips.map((c) => <li key={c.rung}><ProofChip kind={c.ok ? "pass" : "fail"} label={c.word} /></li>)}
    </ul>
  );
}
