// One safe way to read a file in a project's own .companion folder (house rules, project memory, the record of what went
// live), the same way the shell reads the house rules (app/src-tauri/src/houserules.rs read): never through a link, only a
// plain file, at most a set size, and only text. A project can arrive from a link on the internet, so its .companion folder
// may hold anything: a link to /dev/stdin would sit on the engine's own command pipe, /dev/zero never ends, and a link to a
// file in the home folder would send that file to Claude.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

/** The house rules file's limit, as the shell's (houserules.rs MAX_BYTES). */
export const COMPANION_FILE_MAX = 64 * 1024;
export type CompanionRead = { state: "none" } | { state: "ok"; text: string } | { state: "unreadable" };

const missing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT" || (e as NodeJS.ErrnoException)?.code === "ENOTDIR";

/** Whether the project's .companion folder may be written into: it is not there yet, or it is a plain folder, never a link. */
export function companionDirUsable(project: string): boolean {
  try { const st = lstatSync(join(project, ".companion")); return st.isDirectory() && !st.isSymbolicLink(); } catch (e) { return missing(e); }
}

/** Reads `.companion/<name>`. none: it is not there. unreadable: it is there but is a link (the file or the folder), not a
 *  plain file, larger than `max`, not text, or cannot be read. */
export function readCompanionFile(project: string, name: string, max = COMPANION_FILE_MAX): CompanionRead {
  const dir = join(project, ".companion");
  try { const st = lstatSync(dir); if (st.isSymbolicLink() || !st.isDirectory()) return { state: "unreadable" }; } catch (e) { return missing(e) ? { state: "none" } : { state: "unreadable" }; }
  const file = join(dir, name);
  try { const st = lstatSync(file); if (!st.isFile() || st.size > max) return { state: "unreadable" }; } catch (e) { return missing(e) ? { state: "none" } : { state: "unreadable" }; }
  let fd: number;
  // Never through a link, and never waiting: a pipe swapped in after the look above would otherwise hold the open.
  try { fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); } catch { return { state: "unreadable" }; }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > max) return { state: "unreadable" };
    const buf = Buffer.alloc(st.size);
    let got = 0;
    while (got < st.size) { const n = readSync(fd, buf, got, st.size - got, got); if (n <= 0) break; got += n; }
    return { state: "ok", text: new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, got)) };
  } catch { return { state: "unreadable" }; }
  finally { try { closeSync(fd); } catch { /* already closed */ } }
}
