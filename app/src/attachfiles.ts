// Files into the ask box: a file the person drags onto Home or pastes into the box is read here, on this Mac, through the
// rules in runner/src/attach.ts (the engine checks the same rules again before anything is sent). Settings and key files,
// files that are too big and kinds that cannot go are refused before their bytes are read, each with one plain line. What
// is added shows as a chip that can be removed, and goes with the request only when Start is pressed.
import { admit, baseName, kindOf, precheck, type Attached, type Picture, type Refusal, type TextFile } from "../../runner/src/attach.ts";
import { S } from "./strings.ts";

export type { Attached };
/** A dropped or pasted file, as the page gets it (a browser File has these). */
export type FileLike = { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };

// More than this in one drop is not looked at one by one: the caps would refuse them anyway.
const MAX_PER_DROP = 20;

const refused = (why: Refusal, name: string): string => S.attachRefused[why](name);

/** Adds the files, in order, to what the box holds. Returns the new list and a plain line for each file refused (and for a
 *  text file whose secrets were hidden). */
export async function addFiles(have: Attached[], files: FileLike[]): Promise<{ have: Attached[]; notes: string[] }> {
  const list = [...have];
  const notes: string[] = [];
  for (const f of files.slice(0, MAX_PER_DROP)) {
    const meta = { name: String(f.name ?? ""), size: Number(f.size) || 0, type: String(f.type ?? "") };
    const first = precheck(list, meta);
    if ("refused" in first) { notes.push(refused(first.refused, first.name)); continue; }
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await f.arrayBuffer()); } catch { notes.push(S.attachUnreadable(meta.name)); continue; }
    const v = admit(list, meta, bytes);
    if ("refused" in v) { notes.push(refused(v.refused, v.name)); continue; }
    list.push(v.ok);
    if (v.ok.kind === "text" && v.ok.hidden) notes.push(S.attachHidden(v.ok.name));
  }
  if (files.length > MAX_PER_DROP) notes.push(S.attachRefused.too_many(String(files[MAX_PER_DROP]?.name ?? "")));
  return { have: list, notes };
}

/** The files a paste carries: its files, or else its file items (a picture copied from a screenshot can come only as an
 *  item), or none for plain text, which the box then takes as typing. When the paste also carries text, it is text: apps
 *  such as Word, Excel and Keynote put a picture of what was copied next to its text, and that picture is never taken in
 *  place of the words. A file copied in Finder, whose name (or path) comes as the text, one per line, is still added, a
 *  picture too. */
export function pastedFiles<F extends FileLike>(d: { files?: ArrayLike<F> | null; items?: ArrayLike<{ kind: string; getAsFile(): F | null }> | null; getData?: (type: string) => string } | null | undefined): F[] {
  if (!d) return [];
  let text = "";
  try { text = d.getData?.("text/plain") ?? ""; } catch { /* no text in it */ }
  const files = Array.from(d.files ?? []);
  if (text.trim()) {
    const named = new Set(text.split(/[\r\n]+/).map(baseName).filter(Boolean));
    return files.filter((f) => kindOf(String(f.name ?? ""), String(f.type ?? "")) !== "image" || named.has(baseName(String(f.name ?? ""))));
  }
  if (files.length) return files;
  return Array.from(d.items ?? []).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is F => !!f);
}

/** Does a drag carry files (from Finder, or a picture)? */
export const carriesFiles = (types: ArrayLike<string> | null | undefined): boolean => Array.from(types ?? []).includes("Files");

/** Whether the window stops a drop's own handling. A file is always stopped (Home takes it, never the page). Words or a link
 *  dragged onto the ask box are left to it, so they land there as typing. Anything else dropped on Home is stopped, so a
 *  dropped link can never open a web page in Home's place. */
export function blocksDrop(types: ArrayLike<string> | null | undefined, target: { tagName?: string } | EventTarget | null): boolean {
  if (carriesFiles(types)) return true;
  const tag = String((target as { tagName?: unknown } | null)?.tagName ?? "").toUpperCase();
  return tag !== "TEXTAREA" && tag !== "INPUT";
}

/** The list without the chip at `i`. */
export const removeFile = (have: Attached[], i: number): Attached[] => have.filter((_, n) => n !== i);

/** What a chip says: the name, and its size for a text file or that it is a picture. */
export function chipLabel(a: Attached): string {
  return a.kind === "image" ? `${a.name}, ${S.attachPicture}` : `${a.name}, ${Math.max(1, Math.round(a.bytes / 1024))} KB`;
}

/** Only what the request carries: names, text and pictures (the engine checks them again). */
export function forRequest(have: Attached[]): { files: TextFile[]; images: Picture[] } {
  return {
    files: have.flatMap((a) => (a.kind === "text" ? [{ name: a.name, text: a.text }] : [])),
    images: have.flatMap((a) => (a.kind === "image" ? [{ name: a.name, mediaType: a.mediaType, base64: a.base64 }] : [])),
  };
}
