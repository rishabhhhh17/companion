// M66 (the inspiration shortlist, item 2): the size of a change on the result card, in plain words, from the checkpoint
// diff's own line counts (runner checkpoints.ts lineCounts), never from the model. "Changed 3 lines in login.js" versus
// "Rewrote the whole of page.html, 412 lines", and a plain warning when a small ask changed a lot. With no counts at all
// (an older engine, files that are not text) nothing is said: a size is never guessed. Only words decide here; card.tsx
// draws the line.
import { splitPath } from "./changeRows.ts";
import { S } from "./strings.ts";

export type SizedFile = { file: string; kind: string; added?: number; removed?: number; was?: number };
export type ChangeSize = { line: string; lines: number; rewrote: string | null; warn: string | null };

/** An ask of at most this many words is a small one. */
export const SMALL_ASK_WORDS = 20;
/** A change of at least this many lines is a big one. */
export const BIG_CHANGE_LINES = 150;
/** A file that lost at least this share of the lines it had, and had at least REWRITE_MIN_WAS, was rewritten. */
export const REWRITE_SHARE = 0.6;
export const REWRITE_MIN_WAS = 40;

const whole = (n: unknown): number | null => (typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 10_000_000 ? n : null);
/** The lines a file changed: the larger of what it gained and lost (two lines edited is two lines, not four). */
const touched = (f: { added: number; removed: number }) => Math.max(f.added, f.removed);

export function changeSize(files: readonly SizedFile[], askWords?: number): ChangeSize | null {
  const counted = files.flatMap((f) => {
    const added = whole(f.added), removed = whole(f.removed);
    return added === null || removed === null ? [] : [{ ...f, added, removed, was: whole(f.was) }];
  });
  if (!counted.length) return null;
  const lines = counted.reduce((n, f) => n + touched(f), 0);
  const rewritten = counted.filter((f) => f.kind === "modified" && f.was !== null && f.was >= REWRITE_MIN_WAS && f.removed >= REWRITE_SHARE * f.was)
    .sort((a, b) => b.removed - a.removed)[0];
  const name = (f: { file: string }) => splitPath(f.file).name;
  let line: string;
  if (rewritten) line = S.changeSize.rewrote(name(rewritten), rewritten.added);
  else if (files.length === 1 && counted.length === 1 && counted[0].kind === "added") line = S.changeSize.added(name(counted[0]), counted[0].added);
  else if (files.length === 1 && counted.length === 1) line = S.changeSize.oneFile(lines, name(counted[0]));
  else line = S.changeSize.manyFiles(lines, files.length);
  const small = whole(askWords) !== null && askWords! > 0 && askWords! <= SMALL_ASK_WORDS;
  const warn = small && (!!rewritten || lines >= BIG_CHANGE_LINES) ? S.changeSize.warn : null;
  return { line, lines, rewrote: rewritten ? rewritten.file : null, warn };
}
