// M104, fixed and proven, finding by finding: the receipt of a review's Fix it says, for each problem that review found,
// what the rules found when they looked again (the engine's review/fixcheck.ts). Pure, tested in m104.test.ts; card.tsx only
// draws what this decides. One still there means the result is not proven (verdict.ts stillThere), with Try again (Fix it
// again for what is left) and Undo.
import { recheckedOk, type FixOutcome } from "../../protocol/index.ts";
import { redact } from "../../runner/src/redact.ts";
import type { Meaning } from "./meaning.ts";
import { S } from "./strings.ts";

export type Rechecked = { batch: string; findings: { say: string; outcome: FixOutcome }[] };

/** The receipt's rechecked part, of its known shape only, each sentence masked again. Anything else is left out. */
export function recheckedOf(v: unknown): Rechecked | null {
  if (!recheckedOk(v)) return null;
  const r = v as Rechecked;
  return { batch: r.batch, findings: r.findings.map((f) => ({ say: redact(f.say), outcome: f.outcome })) };
}

/** How many are still there. */
export const stillOf = (r: Rechecked | null | undefined): number => (r?.findings ?? []).filter((f) => f.outcome === "still").length;

/** Still there first (what the person acts on), then the ones to look at, then those gone; the review's order inside each. */
const ORDER: FixOutcome[] = ["still", "unsure", "gone"];
/** Each outcome's tag: its words and its meaning colour (never colour alone: the words are always there). */
export const OUTCOME_LOOK: Record<FixOutcome, { words: string; meaning: Meaning }> = {
  gone: { words: S.fixRecheck.gone, meaning: "proven" },
  still: { words: S.fixRecheck.still, meaning: "problem" },
  unsure: { words: S.fixRecheck.unsure, meaning: "review" },
};
export function recheckRows(r: Rechecked): { say: string; outcome: FixOutcome; key: string }[] {
  return ORDER.flatMap((o) => r.findings.map((f, i) => ({ ...f, key: `${o}:${i}` })).filter((f) => f.outcome === o));
}

/** The one line over the list: all gone, some to look at, or some still there. */
export function recheckSummary(r: Rechecked): string {
  const still = stillOf(r), unsure = r.findings.filter((f) => f.outcome === "unsure").length;
  if (still) return S.fixRecheck.summaryStill(still, r.findings.length);
  if (unsure) return S.fixRecheck.summaryUnsure(unsure);
  return S.fixRecheck.summaryGone(r.findings.length);
}
