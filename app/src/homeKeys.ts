// M73 (fluid, item 9): one keyboard model inside Home. Home has the keyboard only after the person clicked into it (it is
// a panel that never takes focus by itself, rule 9), and these keys are read only from Home's own key events, so none of
// them is a global shortcut (F28). Command 1 to 4: the places shown, in their order. Up and Down: the one list's rows (not
// inside a field, where they move the caret). Command comma (Settings) and Escape (step back) are card.tsx's own already.
import type { KeyIn } from "./ui/partsLogic.ts";
import type { Tab } from "./home.ts";

export type HomeKeyDo = { go: Tab } | { rows: 1 | -1 } | null;

export function homeKey(k: KeyIn, o: { inField: boolean; places: readonly Tab[] }): HomeKeyDo {
  if (k.composing || k.ctrl || k.alt || k.shift) return null;
  if (k.meta) {
    const n = /^[1-4]$/.test(k.key) ? Number(k.key) : 0;
    const go = n ? o.places[n - 1] : undefined;
    return go ? { go } : null;
  }
  if (o.inField) return null;
  if (k.key === "ArrowDown") return { rows: 1 };
  if (k.key === "ArrowUp") return { rows: -1 };
  return null;
}
