// M66 (the inspiration shortlist, item 1): two or three fixed one tap chips at the end of every result card, so there is
// never an empty box to stare at. Each is one of the core jobs: Explain this, Undo, Fix it, What changed. None opens a
// chat (rule 16). The two that change files (Undo, Fix it) only ask: their own question comes first, and the change then
// runs with its safety copy and its receipt (rule 13). A chip never repeats a button the card already shows. Only the
// choice is made here; card.tsx draws the chips and does what they say.

export type ChipId = "explain" | "undo" | "fix" | "whatChanged";
export const MAX_CHIPS = 3;

export type ChipFacts = {
  /** Files the result changed. */
  changed: number;
  /** An Undo already put this result back. */
  undone: boolean;
  /** Something is under way on this card (Undo asked or working, a follow up sending, a fix asked): no chips meanwhile. */
  busy: boolean;
  /** The checks on this result failed. */
  failed: boolean;
  /** Undo can act on this result, and whether its own button already shows under the verdict. */
  canUndo: boolean; undoShown: boolean;
  /** A Why I did it explanation is there for this result. */
  explainReady: boolean;
  /** Fix it again can run (Try again), and whether its own button already shows. */
  canFix: boolean; fixShown: boolean;
};

/** The chips for a result, in order, at most three. After a failed check Fix it leads; otherwise What changed does. */
export function resultChips(f: ChipFacts): ChipId[] {
  if (f.busy || f.undone) return [];
  const order: ChipId[] = f.failed ? ["fix", "whatChanged", "undo", "explain"] : ["whatChanged", "explain", "undo", "fix"];
  const can: Record<ChipId, boolean> = {
    fix: f.failed && f.canFix && !f.fixShown,
    whatChanged: f.changed > 0,
    undo: f.canUndo && !f.undoShown,
    explain: f.explainReady,
  };
  return order.filter((c) => can[c]).slice(0, MAX_CHIPS);
}

/** Whether a chip changes files, so it asks first (rule 13). */
export const changesFiles = (c: ChipId): boolean => c === "undo" || c === "fix";
