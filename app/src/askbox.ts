// The ask box: several lines when needed (Shift and Return for a new line, Return sends, as it always did), and a draft
// that is kept on this Mac only, in the page's own storage, until it is sent. Delete everything removes it with the rest
// of the page's storage. Plain code, tested in askbox.test.ts; card.tsx draws the box.
import { redact } from "../../runner/src/redact.ts";

export const MAX_DRAFT = 4000;
export const DRAFT_KEY = "companion.askDraft";

/** What a key press in the box does. send: Return alone. newline: Shift (or Option) and Return, left to the box itself.
 *  null: anything else, Return with Command or Control, and every key while an input method is composing. */
export function askKey(e: { key: string; shift: boolean; alt?: boolean; meta?: boolean; ctrl?: boolean; composing: boolean }): "send" | "newline" | null {
  if (e.composing || e.key !== "Enter" || e.meta || e.ctrl) return null;
  return e.shift || e.alt ? "newline" : "send";
}

/** The draft to keep, or null to keep none: nothing for an empty box, nothing off the record, and nothing that looks like
 *  it holds a key or a password (the same redaction the engine uses), so a pasted secret never lands in storage. */
export function draftToKeep(text: string, offRecord: boolean): string | null {
  if (offRecord || typeof text !== "string" || !text.trim()) return null;
  if (redact(text) !== text) return null;
  const chars = Array.from(text);
  return chars.length <= MAX_DRAFT ? text : chars.slice(0, MAX_DRAFT).join("");
}
