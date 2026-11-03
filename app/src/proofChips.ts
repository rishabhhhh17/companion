// Proof you can see (M15 wave 1): under a fix's receipt, one small chip per check that really ran, green when it passed
// and red when it failed ("Builds", "Tests pass", "Works in a browser"; "Build failed", "Tests fail" when they failed). Only checks that ran are shown: a skipped or
// unfinished one is never drawn as proof. The words carry it for VoiceOver; the colour is never the only sign (an icon too).
import type { Model, ProofLine } from "./model.ts";
import { S } from "./strings.ts";

export type ProofChip = { rung: string; word: string; ok: boolean };

export function proofChips(m: Pick<Model, "task" | "receipt">): ProofChip[] {
  // After an Undo, even once the fix is brought back, the files are not the ones that were checked (M45).
  if (!m.receipt || !m.receipt.changed.length || !m.task?.proof || m.receipt.undone) return [];
  return m.task.proof.steps
    .filter((s: ProofLine) => s.status === "passed" || s.status === "failed")
    .map((s) => {
      const ok = s.status === "passed";
      // A failed check says so in its words, never its passed words: the icon alone is hidden from VoiceOver (rule 14).
      const word = ok ? (S.proofChip[s.rung] ?? s.label) : (S.proofChipFailed[s.rung] ?? S.ui.failedStep(s.label));
      return { rung: s.rung, word, ok };
    });
}
