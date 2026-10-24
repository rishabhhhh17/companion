// Files into the ask box: a file the person drags onto Home or pastes into the box is read here, on this Mac, through the
// rules in runner/src/attach.ts (the engine checks the same rules again before anything is sent). Settings and key files,
// files that are too big and kinds that cannot go are refused before their bytes are read, each with one plain line. What
// is added shows as a chip that can be removed, and goes with the request only when Start is pressed. A PDF, Word or Excel
// document is handed to the shell (docread.rs), which reads its text with the Mac's own tools; only that text is added,
// its secrets hidden and clipped to the limit in Settings (attach.docLimit).
import { ATTACH, admit, admitDocument, baseName, checkAttachments, kindOf, precheck, toBase64, type Attached, type Picture, type Refusal, type TextFile } from "../../runner/src/attach.ts";
import { S } from "./strings.ts";

export type { Attached };
// The engine's own check, which Start makes on the page first (a request it would refuse is never sent).
export { checkAttachments };
// How much of a document's text may go: the setting's key, and its value in bytes.
export { DOC_LIMIT_KEY, docLimitBytes } from "../../runner/src/attach.ts";
/** A dropped or pasted file, as the page gets it (a browser File has these). */
export type FileLike = { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };

/** What the shell answers for a document (docread.rs `reply`): its text, and whether only its start came, or why not. */
export type DocRead = { text: string; cut?: boolean } | { error: "locked" | "noText" | "unreadable" | "tooBig" | "kind" };
/** Reads a document's text: the shell in the app, a stand in in the tests. */
export type ReadDocument = (name: string, bytes: Uint8Array) => Promise<DocRead>;
const DOC_ERRORS = ["locked", "noText", "unreadable", "tooBig", "kind"] as const;

/** The shell's reader (the read_document command), given the file's bytes in base64. Only an answer of the right shape is
 *  taken; anything else, or no answer, is "could not be read". */
export const shellReader = (call: (cmd: string, args: Record<string, unknown>) => Promise<unknown>): ReadDocument => async (name, bytes) => {
  let a: unknown;
  try { a = await call("read_document", { name, data: toBase64(bytes) }); } catch { return { error: "unreadable" }; }
  const o = a as Record<string, unknown> | null;
  if (o && typeof o === "object" && !Array.isArray(o)) {
    if (typeof o.text === "string") return { text: o.text, cut: o.cut === true };
    if ((DOC_ERRORS as readonly unknown[]).includes(o.error)) return { error: o.error as (typeof DOC_ERRORS)[number] };
  }
  return { error: "unreadable" };
};
const DOC_REFUSAL: Record<(typeof DOC_ERRORS)[number], Refusal | null> = { locked: "locked", noText: "no_text", tooBig: "too_big", kind: "kind", unreadable: null };

// More than this in one drop is not looked at one by one: the caps would refuse them anyway.
const MAX_PER_DROP = 20;

const refused = (why: Refusal, name: string): string => S.attachRefused[why](name);

/** Adds the files, in order, to what the box holds. Returns the new list and a plain line for each file refused (and for a
 *  text file whose secrets were hidden, and a document only the start of which goes). A document is read with
 *  `readDocument` and clipped to `docLimitBytes`; with no reader it is not read at all. */
export async function addFiles(have: Attached[], files: FileLike[], o: { readDocument?: ReadDocument; docLimitBytes?: number } = {}): Promise<{ have: Attached[]; notes: string[] }> {
  const list = [...have];
  const notes: string[] = [];
  for (const f of files.slice(0, MAX_PER_DROP)) {
    const meta = { name: String(f.name ?? ""), size: Number(f.size) || 0, type: String(f.type ?? "") };
    const first = precheck(list, meta);
    if ("refused" in first) { notes.push(refused(first.refused, first.name)); continue; }
    const doc = kindOf(meta.name, meta.type) === "document";
    if (doc && !o.readDocument) { notes.push(S.attachUnreadable(baseName(meta.name))); continue; }
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await f.arrayBuffer()); } catch { notes.push(S.attachUnreadable(baseName(meta.name) || "That file")); continue; }
    let v: ReturnType<typeof admit>;
    if (doc) {
      const name = baseName(meta.name);
      let read: DocRead;
      try { read = await o.readDocument!(name, bytes); } catch { read = { error: "unreadable" }; }
      if ("error" in read) { const why = DOC_REFUSAL[read.error]; notes.push(why ? refused(why, name) : S.attachUnreadable(name)); continue; }
      v = admitDocument(list, { ...meta, size: Math.max(meta.size, bytes.length) }, read, o.docLimitBytes ?? 0);
    } else v = admit(list, meta, bytes);
    if ("refused" in v) { notes.push(refused(v.refused, v.name)); continue; }
    list.push(v.ok);
    if (v.ok.kind === "text" && v.ok.hidden) notes.push(S.attachHidden(v.ok.name));
    if (v.ok.kind === "text" && v.ok.clipped) notes.push(S.attachClipped(v.ok.name, Math.round(Math.min(Math.max(o.docLimitBytes ?? 0, 1000), ATTACH.maxTextBytes) / 1000)));
  }
  if (files.length > MAX_PER_DROP) notes.push(S.attachRefused.too_many(baseName(String(files[MAX_PER_DROP]?.name ?? "")) || "That file"));
  return { have: list, notes };
}

/** A drop that finished reading after the box changed (Start sent what it held, a chip was removed, another drop finished
 *  first): only the files this drop added (`have` past `before`) join the box as it is now, each checked again against
 *  what it holds, so nothing sent or removed comes back and the caps still hold. */
export function mergeAdded(before: Attached[], have: Attached[], now: Attached[]): Attached[] {
  const out = [...now];
  for (const f of have.slice(before.length)) if (!("refused" in precheck(out, { name: f.name, size: f.bytes, type: f.kind === "image" ? f.mediaType : "" }))) out.push(f);
  return out;
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

/** What was just added, in one line VoiceOver says (the chips show it to everyone else); nothing when nothing was. */
export const addedLine = (added: Attached[]): string => (added.length ? S.attachAdded(added.map((a) => a.name).join(", ")) : "");

/** The list without the chip at `i`. */
export const removeFile = (have: Attached[], i: number): Attached[] => have.filter((_, n) => n !== i);

/** What a chip says: the name, and its size for a text file, how much text for a document (and that it was shortened),
 *  or that it is a picture. */
export function chipLabel(a: Attached): string {
  if (a.kind === "image") return `${a.name}, ${S.attachPicture}`;
  if (a.clipped !== undefined) return `${a.name}, ${S.attachDocText(Math.max(1, Math.round(new TextEncoder().encode(a.text).length / 1024)), a.clipped)}`;
  return `${a.name}, ${Math.max(1, Math.round(a.bytes / 1024))} KB`;
}

/** Only what the request carries: names, text and pictures (the engine checks them again). */
export function forRequest(have: Attached[]): { files: TextFile[]; images: Picture[] } {
  return {
    files: have.flatMap((a) => (a.kind === "text" ? [{ name: a.name, text: a.text }] : [])),
    images: have.flatMap((a) => (a.kind === "image" ? [{ name: a.name, mediaType: a.mediaType, base64: a.base64 }] : [])),
  };
}
