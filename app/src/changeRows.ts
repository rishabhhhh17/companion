// M65: a changed file as one row of the Instrument look (the lab's look A): its name, its folder in grey, a short tag and
// its added and taken away lines when they are known. The tag says how it changed (Added, Changed, Removed), or Key in code
// in red when the key check or a review found a key written into it. Only words decide here; changesCard.tsx draws it.
import type { ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

export type ChangedFile = { file: string; kind: string; added?: number; removed?: number };
export type ChangeRow = { file: string; name: string; dir: string; kind: string; tag: string; stop: boolean; added: number; removed: number };

/** A path split into its folder (with the last slash) and its name. */
export function splitPath(file: string): { dir: string; name: string } {
  const at = file.lastIndexOf("/");
  return at >= 0 ? { dir: file.slice(0, at + 1), name: file.slice(at + 1) } : { dir: "", name: file };
}

const count = (n: unknown): number => (typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0);

/** The files a key was found in: the instant key check's places before a review, and a review's key reasons after it. */
export function keyFiles(r: Pick<ReviewCard, "keys" | "result">): string[] {
  const out = new Set<string>();
  for (const k of r.keys ?? []) out.add(k.file);
  for (const x of r.result?.reasons ?? []) if (x.kind === "secret_in_code" && x.file) out.add(x.file);
  return [...out];
}

/** One row: a key found in the file wins the tag (it is the one thing to fix first); an unknown kind reads Changed. */
export function changeRow(c: ChangedFile, keys: readonly string[] = []): ChangeRow {
  const { dir, name } = splitPath(c.file);
  const stop = keys.includes(c.file);
  const tags = S.ui.fileTag as Record<string, string>;
  const tag = stop ? S.ui.fileTag.key : (Object.hasOwn(tags, c.kind) && c.kind !== "key" ? tags[c.kind] : S.ui.fileTag.modified);
  return { file: c.file, name, dir, kind: c.kind, tag, stop, added: count(c.added), removed: count(c.removed) };
}
