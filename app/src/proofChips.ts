// Proof you can see (M15 wave 1): under a fix's receipt, one small chip per check that really ran, green when it passed
// and red when it failed ("Builds", "Tests pass", "Works in a browser"). Only checks that ran are shown: a skipped or
// unfinished one is never drawn as proof. The words carry it for VoiceOver; the colour is never the only sign (an icon too).
import type { Model, ProofLine } from "./model.ts";
import { S } from "./strings.ts";

export type ProofChip = { rung: string; word: string; ok: boolean };

export function proofChips(m: Pick<Model, "task" | "receipt">): ProofChip[] {
  if (!m.receipt || !m.receipt.changed.length || !m.task?.proof) return [];
  return m.task.proof.steps
    .filter((s: ProofLine) => s.status === "passed" || s.status === "failed")
    .map((s) => ({ rung: s.rung, word: (S.proofChip as Record<string, string>)[s.rung] ?? s.label, ok: s.status === "passed" }));
}
