// Small decisions the card makes, kept out of the component so they can be tested.

/** May a new question take keyboard focus? Never from someone who is typing: the next Space or Return would answer it. */
export function shouldTakeFocus(active: { tag: string; editable: boolean } | null, windowHasFocus: boolean): boolean {
  if (!windowHasFocus) return false;
  if (!active) return true;
  return !(active.editable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tag));
}
