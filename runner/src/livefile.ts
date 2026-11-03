// Live progress (M55 section 2): the work card lists each file the moment the agent changed it (protocol agent.file).
// Only what really happened (rule 14): the file is looked at just before a tool that edits it runs and again once that tool
// has finished, and it is named only when it is not what it was (added, changed or removed). A tool that failed, was
// refused or stopped, or wrote the same bytes again names nothing. The task's receipt stays the whole list: a change a
// command made (a shell command, an install) is not seen here, only in the receipt.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type FileKind = "added" | "modified" | "deleted";
/** A file as it is on disk. `hash` is null for a file over HASH_MAX, which is told apart by its size and its time. */
export type FileMark = { exists: false } | { exists: true; size: number; hash: string | null; mtimeMs: number };
/** The biggest file read through to tell a real change from the same bytes written again. */
export const HASH_MAX = 2 * 1024 * 1024;

/** The file at `abs` as it is now. A folder, or anything that cannot be read, counts as no file. */
export function markOf(abs: string): FileMark {
  try {
    const st = statSync(abs);
    if (!st.isFile()) return { exists: false };
    const hash = st.size <= HASH_MAX ? createHash("sha256").update(readFileSync(abs)).digest("hex") : null;
    return { exists: true, size: st.size, hash, mtimeMs: st.mtimeMs };
  } catch { return { exists: false }; }
}

/** How a file changed from `before` to `after`, or null when it did not. */
export function changeOf(before: FileMark, after: FileMark): FileKind | null {
  if (!before.exists) return after.exists ? "added" : null;
  if (!after.exists) return "deleted";
  if (before.size !== after.size) return "modified";
  if (before.hash !== null && after.hash !== null) return before.hash === after.hash ? null : "modified";
  return before.mtimeMs === after.mtimeMs ? null : "modified";
}

/** Git's and Companion's own folders: never a project file a person would look for. */
const OWN = new Set([".git", ".companion"]);
/** `path` from the project folder down, with "/" between folders, or null when it is not a file inside the project (the
 *  folder itself, outside it, or in Git's or Companion's own folders). */
export function inProject(project: string, path: string): string | null {
  if (!path || path.includes("\u0000")) return null;
  const root = resolve(project), abs = resolve(root, path);
  const rel = relative(root, abs);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  const parts = rel.split(sep);
  if (OWN.has(parts[0])) return null;
  return parts.join("/");
}
