// One careful way to write a small file Companion keeps (project memory, the memory settings, the record of what went live,
// the shared AGENTS.md): write a temporary file next to it, then rename it over the file. A write that fails (a full disk)
// removes its temporary file, and one a forced quit cut short is swept up the next time the same file is written, so no
// "<name>.<8 hex>.tmp" files pile up in the person's project (the shell's Delete everything knows the same names).
import { chmodSync, lstatSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes leftover temporary files of `file` (never the file itself). Best effort. */
export function sweepTmp(file: string) {
  const dir = dirname(file), re = new RegExp(`^${escapeRe(basename(file))}\\.[0-9a-f]{8}\\.tmp$`);
  try { for (const n of readdirSync(dir)) if (re.test(n)) rmSync(join(dir, n), { force: true }); } catch { /* nothing to sweep */ }
}

/** Writes `text` over `file` through a temporary file. mode: a number, or "keep" to give the new file the old file's
 *  permissions (the usual mode when there was none). */
export function writeAtomic(file: string, text: string, mode: number | "keep" = 0o644) {
  sweepTmp(file);
  let m = mode === "keep" ? 0o644 : mode;
  if (mode === "keep") { try { const st = lstatSync(file); if (st.isFile()) m = st.mode & 0o7777; } catch { /* no file yet */ } }
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, text, { mode: m });
    try { chmodSync(tmp, m); } catch { /* best effort: the umask may have narrowed the mode */ }
    renameSync(tmp, file);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* nothing more to do */ }
    throw e;
  }
}
