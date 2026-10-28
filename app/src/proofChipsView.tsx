import { Icon } from "./icons.tsx";
import type { Model } from "./model.ts";
import { proofChips } from "./proofChips.ts";
import { S } from "./strings.ts";

/** The checks that ran on a fix, as small chips under its receipt (proofChips.ts). */
export function ProofChips({ m }: { m: Model }) {
  const chips = proofChips(m);
  if (!chips.length) return null;
  return (
    <ul className="proof-chips" aria-label={S.proofChipsLabel}>
      {chips.map((c) => <li key={c.rung} className={c.ok ? "ok" : "bad"}><Icon name={c.ok ? "tick" : "cross"} size={13} /><span>{c.word}</span></li>)}
    </ul>
  );
}
